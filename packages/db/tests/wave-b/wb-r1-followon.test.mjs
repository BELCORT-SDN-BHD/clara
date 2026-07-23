// Wave-B battery — RATCHET R1 FOLLOW-ON cells: the three coverage gaps flagged
// in the fix-round-1 verdict, cut from the memo + ledger only (SQL unread).
// [R1-F5] the five missed WB-R1 enumerators · [R1-F6] replay completeness with
// NO live-table maps · [R1-F8] client-bound document citations.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, CLR31, ROLES, rootQuery, roleQuery, humanQuery, opk, human,
  assertRaisesOneOf, endPool, printLaneNotes,
  fail0017, wbEnsureReady, hasColumn,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, WB_COA,
  filedDocument, fileDocument, freshResolution, recordNotification,
  listUncodedFilings, listReviewQueue, humanPersona,
  freshWatchClient, approvedTurnoverEntry, evaluateSstWatch, createClient,
  publishWikiPage, recordWikiIngest, retireWikiPage, eventsOf,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let onb = null;

/** The proven a21-reconcile raw LIVE-autopost-rule recipe (proposal writers
 *  refuse backdated terms; expiry is exactly what the reconciler keys on). */
async function rawLiveRule({ firm, client, cp, expiresIn }) {
  const cols = ["firm_id", "client_id", "rule_type", "counterparty_id", "account_code", "status", "pinned",
    "origin", "content_hash", "created_by", "amount_cap_cents", "frequency_window", "window_max_posts",
    "expires_at", "direction"];
  const vals = [firm, client, "autopost", cp, WB_COA.expense, "live", false, "authored", null,
    w.users.alice, 100000, "monthly", 3, null, "purchase"];
  const params = [];
  const frags = cols.map((c, i) => {
    if (c === "content_hash") return `encode(sha256(convert_to('${randomUUID()}','UTF8')),'hex')`;
    if (c === "expires_at") return `now() + interval '${expiresIn}'`;
    params.push(vals[i]);
    return `$${params.length}`;
  });
  const extra = [];
  if (await hasColumn("coding_rules", "signed_by")) { extra.push(["signed_by", `$${params.length + 1}`]); params.push(w.users.alice); }
  if (await hasColumn("coding_rules", "signed_at")) { extra.push(["signed_at", "now()"]); }
  const r = await rootQuery(
    `insert into clara.coding_rules(${[...cols, ...extra.map(([c]) => c)].join(",")})
     values(${[...frags, ...extra.map(([, f]) => f)].join(",")}) returning id`, params);
  return r.rows[0].id;
}

async function rawVendor(client, name) {
  return (await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values ($1,$2,'vendor',$3,$4,$5) returning id`,
    [w.firms.A, client, name, name.toLowerCase().replace(/[^a-z0-9]/g, ""), w.users.alice])).rows[0].id;
}

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
});
after(async () => { printLaneNotes("wb-r1-followon"); await endPool(); });

test("META: 0017 applied — the follow-on battery is armed", async () => {
  fail0017(live);
  assert.ok(onb, "the onboarding client staged");
});

test("[R1-F5a]: list_uncoded_filings never lists an onboarding client's filing (active control listed)", async () => {
  fail0017(live);
  const onbDoc = await filedDocument(w.users.alice, { firm: w.firms.A, client: onb.client, kind: "invoice" });
  const actDoc = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  const rows = await listUncodedFilings(w.users.alice, {});
  const blob = JSON.stringify(rows);
  assert.ok(!blob.includes(onbDoc.filingId) && !blob.includes(onbDoc.documentId),
    "the onboarding filing is INVISIBLE to the enumerator (WB-R1)");
  assert.ok(blob.includes(actDoc.filingId) || blob.includes(actDoc.documentId),
    "the SAME shape on an active client is listed (the guard, not the shape, excluded it)");
});

test("[R1-F5b]: list_autopost_rules excludes non-active clients; the reconciler never touches their rules", async () => {
  fail0017(live);
  const cpOnb = await rawVendor(onb.client, "F5 ONB VENDOR SDN BHD");
  const cpAct = await rawVendor(w.clients.A1, "F5 ACT VENDOR SDN BHD");
  const ruleOnb = await rawLiveRule({ firm: w.firms.A, client: onb.client, cp: cpOnb, expiresIn: "-1 day" });
  const ruleAct = await rawLiveRule({ firm: w.firms.A, client: w.clients.A1, cp: cpAct, expiresIn: "-1 day" });
  const listed = (await humanQuery(w.users.alice,
    "select clara.list_autopost_rules(p_scope => '{}'::jsonb) as r")).rows[0].r;
  const lblob = JSON.stringify(listed);
  assert.ok(!lblob.includes(ruleOnb), "the onboarding client's autopost rule is INVISIBLE to the list");
  assert.ok(lblob.includes(ruleAct), "the active client's rule is listed (control)");
  const beforeRow = (await rootQuery("select to_jsonb(r) as r from clara.coding_rules r where r.id=$1", [ruleOnb])).rows[0].r;
  await roleQuery(ROLES.runtime, "select clara.reconcile_autopost_rules() as r", []);
  const afterRow = (await rootQuery("select to_jsonb(r) as r from clara.coding_rules r where r.id=$1", [ruleOnb])).rows[0].r;
  assert.equal(JSON.stringify(afterRow), JSON.stringify(beforeRow),
    "the reconciler left the NON-ACTIVE client's expired rule byte-untouched (no nudge, no retire)");
  const actAfter = (await rootQuery("select status from clara.coding_rules where id=$1", [ruleAct])).rows[0];
  assert.notEqual(actAfter.status, "live", "the ACTIVE client's expired rule WAS retired (the reconciler ran)");
  const notes = await rootQuery(
    "select count(*)::int as n from clara.notifications where client_id=$1", [onb.client]);
  assert.equal(notes.rows[0].n, 0, "no expiry notification leaked to the onboarding client");
});

test("[R1-F5c]: list_notifications excludes onboarding AND archived clients' rows (the asymmetry probe)", async () => {
  fail0017(live);
  const flip = await createClient(w.users.alice, { name: `wbf5c_${opk("x")}`, opKey: opk("cli") });
  await recordNotification(human(w.users.alice), { kind: "wb.f5c", payload: { probe: "onb" }, client: onb.client, opKey: opk("n1") });
  await recordNotification(human(w.users.alice), { kind: "wb.f5c", payload: { probe: "act" }, client: w.clients.A1, opKey: opk("n2") });
  await recordNotification(human(w.users.alice), { kind: "wb.f5c", payload: { probe: "arch" }, client: flip, opKey: opk("n3") });
  await rootQuery("update clara.clients set status='archived' where id=$1", [flip]);
  const listed = (await humanQuery(w.users.alice,
    "select clara.list_notifications(p_scope => '{}'::jsonb, p_kinds => array['wb.f5c']) as r")).rows[0].r;
  const rows = Array.isArray(listed) ? listed : [];
  assert.ok(rows.length >= 1, "the probe kind is listed at all");
  assert.ok(!rows.some((n) => n.client_id === onb.client), "the ONBOARDING client's notification is excluded");
  assert.ok(!rows.some((n) => n.client_id === flip), "the ARCHIVED client's notification is excluded (pre-0017 convention held)");
  assert.ok(rows.some((n) => n.client_id === w.clients.A1), "the active client's notification is listed (control)");
});

test("[R1-F5d]: the queue's compliance.clients envelope is GUARDED — a non-active client's watch never rides it", async () => {
  fail0017(live);
  const watchClient = await freshWatchClient(w.users.alice);
  await approvedTurnoverEntry({ maker: w.users.alice, checker: w.users.bob,
    client: watchClient, cents: 55_000_000, date: "2026-05-31" });
  await evaluateSstWatch(watchClient);
  await rootQuery(
    "insert into clara.compliance_watches(firm_id, client_id, service_group, state) values ($1,$2,'G','crossed')",
    [w.firms.A, onb.client]);
  const q = await listReviewQueue(humanPersona(w.users.alice), {});
  const envelope = JSON.stringify(q.compliance ?? {});
  assert.ok(envelope.includes(watchClient), "the ACTIVE crossed client rides compliance.clients (control)");
  assert.ok(!envelope.includes(onb.client), "the onboarding client's watch NEVER rides the envelope (the 0016 wart closed)");
});

test("[R2-F7]: DEEP replay — separate shadow model, HISTORICAL versions, lifecycle, cp/projected/engine, FULL citation/ref rows, storage hashes", async () => {
  fail0017(live);
  const { upsertAccountClassed, grantConsent, shaHex, wikiKey } = await import("./wb-fixtures.mjs");
  const cW = await createClient(w.users.alice, { name: `wbf6_${opk("x")}`, opKey: opk("cli") });
  await upsertAccountClassed(w.users.alice, { client: cW, code: WB_COA.cash, name: "Cash", type: "asset" });
  await grantConsent(w.users.alice, { firm: w.firms.A, client: cW }).catch(() => {});
  const cp = (await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values ($1,$2,'vendor','F7 Narrative Vendor','f7narrativevendor',$3) returning id`,
    [w.firms.A, cW, w.users.alice])).rows[0].id;
  const cited = await filedDocument(w.users.alice, { firm: w.firms.A, client: cW, kind: "bank_statement" });
  const seq0 = (await rootQuery("select coalesce(max(seq),0)::bigint as s from clara.domain_events where firm_id=$1", [w.firms.A])).rows[0].s;
  await publishWikiPage({ client: cW, firm: w.firms.A, slug: "profile", pageKind: "profile",
    title: "Profile v1", content: "# p v1", refs: [{ ref_kind: "account", account_code: WB_COA.cash }] });
  await publishWikiPage({ client: cW, firm: w.firms.A, slug: "profile", pageKind: "profile",
    title: "Profile v2", content: "# p v2", synthesis: "model", engineId: "clara-wiki-synth:v1",
    projectedFromSeq: Number(seq0), refs: [{ ref_kind: "account", account_code: WB_COA.cash }] });
  const profileId = (await rootQuery("select id from clara.wiki_pages where client_id=$1 and slug='profile'", [cW])).rows[0].id;
  await publishWikiPage({ client: cW, firm: w.firms.A, slug: "vendor-story", pageKind: "counterparty",
    title: "Vendor story", content: "# v", counterparty: cp,
    citations: [{ source_kind: "document", document_id: cited.documentId, detail: { page: 3, quote: "F7 statement line" } },
      { source_kind: "counterparty", counterparty_id: cp }],
    refs: [{ ref_kind: "wiki_page", ref_page_id: profileId }] });
  await recordWikiIngest({ client: cW, document: cited.documentId, note: "F7 ingest path" });
  const vsPageId = (await rootQuery("select id from clara.wiki_pages where client_id=$1 and slug='vendor-story'", [cW])).rows[0].id;
  await retireWikiPage(w.users.bob, { page: vsPageId, reason: "F7 retire" });
  // ---- SEPARATE SHADOW MODEL: pages + PER-VERSION rows, events only ---------
  const sp = {}; // page_id -> page fields
  const sv = {}; // page_id -> { version_n -> version row + citations }
  // [R3 repair, memo 6c]: citation DETAIL joins the tuple (full logical row).
  const cite = (c) => JSON.stringify([c.source_kind, c.document_id ?? null, c.entry_id ?? null, c.counterparty_id ?? null, c.detail ?? {}]);
  const refT = (r) => JSON.stringify([r.ref_kind, r.ref_page_id ?? null, r.counterparty_id ?? null, r.document_id ?? null, r.entry_id ?? null, r.account_code ?? null]);
  for (const e of await eventsOf(w.firms.A, "wiki.page_published")) {
    const p = e.payload ?? {};
    if (!p.page_id) continue;
    sp[p.page_id] = { slug: p.slug, page_kind: p.page_kind, title: p.title ?? null,
      counterparty_id: p.counterparty_id ?? null, state: "active",
      refs: (p.refs ?? []).map(refT).sort() };
    (sv[p.page_id] ??= {})[Number(p.version_n)] = {
      content_sha256: p.content_sha256, storage_key: p.storage_key,
      size_bytes: Number(p.size_bytes), synthesis: p.synthesis,
      engine_id: p.engine_id ?? null,
      projected_from_seq: p.projected_from_seq == null ? null : Number(p.projected_from_seq),
      citations: (p.citations ?? []).map(cite).sort(),
    };
  }
  for (const e of await eventsOf(w.firms.A, "wiki.page_retired")) {
    const id = (e.payload ?? {}).page_id;
    if (sp[id]) sp[id].state = "retired";
  }
  // ---- compare EVERY logical field, historical versions included ------------
  const livePages = (await rootQuery(
    "select to_jsonb(p) as r from clara.wiki_pages p where p.firm_id=$1", [w.firms.A])).rows.map((x) => x.r);
  assert.ok(livePages.length >= 3, "projection + counterparty + INGEST pages all staged");
  for (const page of livePages) {
    const s = sp[page.id];
    assert.ok(s, `${page.slug}: reconstructible from events alone (ingest path included)`);
    assert.equal(s.slug, page.slug, `${page.slug}: slug`);
    assert.equal(s.page_kind, page.page_kind, `${page.slug}: page_kind`);
    assert.equal(s.title, page.title, `${page.slug}: title`);
    assert.equal(s.counterparty_id, page.counterparty_id ?? null, `${page.slug}: counterparty cross-link`);
    assert.equal(s.state, page.state, `${page.slug}: lifecycle state`);
    const liveVersions = (await rootQuery(
      "select to_jsonb(v) as r from clara.wiki_page_versions v where v.page_id=$1 order by v.version_n", [page.id]))
      .rows.map((x) => x.r);
    const maxN = Math.max(...liveVersions.map((v) => Number(v.version_n)));
    for (const v of liveVersions) {
      const n = Number(v.version_n);
      const shv = sv[page.id]?.[n];
      assert.ok(shv, `${page.slug} v${n}: HISTORICAL version reconstructible`);
      assert.equal(shv.content_sha256, v.content_sha256, `${page.slug} v${n}: hash`);
      assert.equal(shv.storage_key, v.storage_key, `${page.slug} v${n}: storage key`);
      assert.equal(shv.size_bytes, Number(v.size_bytes), `${page.slug} v${n}: size`);
      assert.equal(shv.synthesis, v.synthesis, `${page.slug} v${n}: synthesis`);
      assert.equal(shv.engine_id, v.engine_id ?? null, `${page.slug} v${n}: engine`);
      assert.equal(shv.projected_from_seq, v.projected_from_seq == null ? null : Number(v.projected_from_seq),
        `${page.slug} v${n}: projected_from_seq`);
      const wantState = n === maxN ? v.state : "superseded";
      assert.equal(v.state, wantState, `${page.slug} v${n}: version lifecycle (history superseded, head terminal)`);
      // STORAGE FEASIBILITY RULING (mine, per the R3 order): the rig has NO
      // storage schema — the W5 pin says so and assigns the real put/fetch
      // probe to the LIVE CEREMONY's post-verify. A bytes fetch is therefore
      // infeasible here; the strongest RIG-FEASIBLE check is the END-TO-END
      // hash chain: mirrored bytes → sha → the EXACT content-addressed key
      // family → size. The ceremony-time boundary is: re-download by
      // storage_key + sha compare against these same values.
      assert.equal(v.storage_key, wikiKey(page.firm_id, page.client_id, v.content_sha256),
        `${page.slug} v${n}: the key is EXACTLY the content-addressed family (firm/client/sha)`);
      assert.equal(shaHex(v.content), v.content_sha256, `${page.slug} v${n}: the mirrored bytes re-hash to the key's digest`);
      assert.equal(Number(v.size_bytes), Buffer.byteLength(v.content, "utf8"),
        `${page.slug} v${n}: size_bytes measures the exact mirrored bytes`);
      const liveCites = (await rootQuery(
        "select to_jsonb(c) as r from clara.wiki_page_citations c where c.version_id=$1", [v.id]))
        .rows.map((x) => cite(x.r)).sort();
      assert.equal(JSON.stringify(shv.citations), JSON.stringify(liveCites), `${page.slug} v${n}: FULL citation rows replay`);
    }
    const liveRefs = (await rootQuery(
      "select to_jsonb(x) as r from clara.wiki_page_refs x where x.page_id=$1", [page.id]))
      .rows.map((x) => refT(x.r)).sort();
    assert.equal(JSON.stringify(s.refs), JSON.stringify(liveRefs), `${page.slug}: FULL ref rows replay`);
  }
  const liveIds = new Set(livePages.map((p) => p.id));
  for (const id of Object.keys(sp)) assert.ok(liveIds.has(id), "no phantom shadow page (bijection)");
  // [R3 repair] NON-TAUTOLOGY guards: the comparison must have had teeth.
  const allVersions = Object.values(sv).flatMap((m) => Object.values(m));
  assert.ok(Object.values(sv).some((m) => Object.keys(m).length >= 2), "a supersede chain was actually replayed (>=2 versions)");
  assert.ok(allVersions.some((v) => v.engine_id === "clara-wiki-synth:v1"), "the STAGED model-engine id round-tripped exactly");
  assert.ok(allVersions.some((v) => v.projected_from_seq === Number(seq0)), "the STAGED projected_from_seq round-tripped exactly");
  assert.ok(allVersions.some((v) => v.citations.some((c) => c.includes("F7 statement line"))),
    "a NON-EMPTY citation detail round-tripped (the detail comparison is not vacuous)");
  assert.ok(Object.values(sp).some((p) => p.state === "retired") && Object.values(sp).some((p) => p.state === "active"),
    "both lifecycle states exercised");
});

test("[R1-F8]: a citation must be CLIENT-BOUND — a foreign-client document refuses; a second filing to A admits it", async () => {
  fail0017(live);
  const docB = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A2, kind: "invoice" });
  // CLR02 is the sanctioned class here (provenance binding — "existing codes
  // reused where the class exists", K14/G7); CLR31/CLR10/CLR11 also accepted.
  await assertRaisesOneOf([CLR.provenance, CLR31, CLR.badRequest, CLR.notFound], () => publishWikiPage({
    client: w.clients.A1, firm: w.firms.A, slug: "f8-cite", title: "F8",
    citations: [{ source_kind: "document", document_id: docB.documentId }],
  }), "client A citing a document filed ONLY to client B (tenant/provenance poison)");
  await fileDocument(w.users.alice, {
    document: docB.documentId, client: w.clients.A1,
    resolution: await freshResolution(w.users.alice, w.clients.A1, { subjectKind: "document", subjectId: docB.documentId }),
  });
  const r = await publishWikiPage({
    client: w.clients.A1, firm: w.firms.A, slug: "f8-cite", title: "F8",
    citations: [{ source_kind: "document", document_id: docB.documentId }],
  });
  assert.ok(r, "the SAME document, actively filed to A as well, is a lawful citation");
});
