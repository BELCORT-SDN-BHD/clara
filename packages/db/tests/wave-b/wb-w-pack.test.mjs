// Wave-B battery — W6 pack v4 (additive-but-dark; the FORK-6 purpose+marker
// gate) · W4 DB-half (seq-embedded idempotence; rebuild-by-replay) · W10/WB-R6
// (the dependency audits + the bit-identical authority-path probe).
// CONTRACT-BLIND; FAILS below 0017. [AMB-1]/[AMB-2]: the v7 purpose literal and
// the consumer-marker value are UNPINNED — encoded as WB_V7_PURPOSE /
// WB_PACK_CONSUMER (env-overridable); a mismatch at integration is the finding.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk,
  endPool, printLaneNotes,
  fail0017, wbEnsureReady, fnSource,
  fail0019, has0019, markStale, filedDocument, WB_STALE_REASON,
  buildWaveBWorld, createClient, mintInteractive,
  packHuman, packWake, publishWikiPage, retireWikiPage, setWikiHold, clearWikiHold,
  pageRow, seedWikiCheckpoint, setBudget,
  WB_V7_PURPOSE, WB_PACK_CONSUMER, WB_BUDGET_SEEDS, PACK_V3_KEYS,
  WB_AUTHORITY_FNS, WB_WIKI_WHITELIST,
  draftEntryV3, freshResolution, entryRow, WB_COA, eventsOf,
} from "./wb-fixtures.mjs";
import { maxSeq } from "../rig-events-helpers.mjs";

let live = false;
let live19 = false;
let w = null;
let cred = null;

/** The pinned wiki TABLE family (W1/W2/W7/W9) — the WB-R6 dependency surface. */
const WIKI_TABLE_RE = new RegExp(
  "\\b(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\\b");

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  cred = await mintInteractive(w.firms.A);
  await publishWikiPage({ client: w.clients.A1, firm: w.firms.A, slug: "profile", pageKind: "profile",
    title: "Profile", content: "# Profile\nHardware wholesaler." });
  live19 = await has0019();
});
after(async () => { printLaneNotes("wb-w-pack"); await endPool(); });

test("W6: pack_schema_version 3→4; every carried v3 key present; the wiki block ABSENT for a v6 caller", async () => {
  fail0017(live);
  const pack = await packHuman(w.users.alice, { client: w.clients.A1, purpose: "chat" });
  assert.equal(pack.pack_schema_version, 5, "pack_schema_version = 5 (W6 took it 3->4; Wave E delta's period/snapshot block took it 4->5)");
  for (const k of PACK_V3_KEYS) assert.ok(k in pack, `carried v3 key '${k}' present`);
  assert.ok(!("wiki" in pack), "additive-but-dark: 'chat' never renders the wiki block");
  const overloads = await rootQuery(
    "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='get_context_pack'");
  assert.equal(overloads.rows[0].n, 1, "same signature, CREATE OR REPLACE — one overload only");
});

test("FORK-6: wake lane — the v7 purpose WITHOUT clara.pack_consumer stays DARK (the frozen-closure hazard)", async () => {
  fail0017(live);
  const pack = await packWake(cred, { client: w.clients.A1, purpose: WB_V7_PURPOSE });
  assert.ok(pack, "the pack itself returns");
  assert.ok(!("wiki" in pack),
    "[AMB-1] a model-supplied v7 purpose literal alone CANNOT light the wiki block (WB-R6(2) structural)");
});

test("FORK-6: wake lane — purpose AND marker light the block; either alone stays dark", async () => {
  fail0017(live);
  const lit = await packWake(cred, { client: w.clients.A1, purpose: WB_V7_PURPOSE, consumerGuc: WB_PACK_CONSUMER });
  assert.ok("wiki" in lit, "[AMB-1]/[AMB-2] v7 purpose + the v25 marker GUC render the wiki block");
  const wrongPurpose = await packWake(cred, { client: w.clients.A1, purpose: "chat", consumerGuc: WB_PACK_CONSUMER });
  assert.ok(!("wiki" in wrongPurpose), "the marker without the v7 purpose stays dark");
  const wrongMarker = await packWake(cred, { client: w.clients.A1, purpose: WB_V7_PURPOSE, consumerGuc: "frozen-v6-cannot-know-this" });
  assert.ok(!("wiki" in wrongMarker), "a wrong marker value stays dark");
});

test("FORK-6: the HUMAN lane reads the wiki block WITHOUT a GUC (dashboard onboarding/dry-run exception)", async () => {
  fail0017(live);
  const pack = await packHuman(w.users.alice, { client: w.clients.A1, purpose: WB_V7_PURPOSE });
  assert.ok("wiki" in pack, "human + v7 purpose renders");
  const dark = await packHuman(w.users.alice, { client: w.clients.A1, purpose: "chat" });
  assert.ok(!("wiki" in dark), "human + v6 purpose stays dark");
});

test("W6: the wiki block shape — lag marker from relay_checkpoints, held, budget, framed basis/permitted_use", async () => {
  fail0017(live);
  const seq = await maxSeq(w.firms.A);
  await seedWikiCheckpoint(w.firms.A, seq);
  const pack = await packHuman(w.users.alice, { client: w.clients.A1, purpose: WB_V7_PURPOSE });
  const wiki = pack.wiki;
  assert.ok(wiki, "wiki block present");
  assert.equal(Number(wiki.last_projected_seq), seq,
    "last_projected_seq = the wiki_projection checkpoint (WB-R3 lag surfaced, same snapshot)");
  assert.equal(wiki.held, false, "held=false with no hold");
  assert.equal(Number(wiki.budget?.pages), WB_BUDGET_SEEDS.pack_max_pages, "budget.pages = the W7 value");
  assert.equal(Number(wiki.budget?.bytes), WB_BUDGET_SEEDS.pack_max_bytes, "budget.bytes = the W7 value");
  assert.equal(wiki.basis, "clara_maintained_advisory_notes", "the 0016 framing-key idiom");
  assert.equal(wiki.permitted_use, "inform_never_decide", "inform-never-decide framing");
  const page = (wiki.pages ?? []).find((p) => p.slug === "profile");
  assert.ok(page, "the published page rides the block");
  for (const k of ["slug", "title", "page_kind", "version_n", "updated_at", "citations", "content"]) {
    assert.ok(k in page, `page entry carries '${k}'`);
  }
  await setWikiHold({ client: w.clients.A1, reason: "probe" });
  const heldPack = await packHuman(w.users.alice, { client: w.clients.A1, purpose: WB_V7_PURPOSE });
  assert.equal(heldPack.wiki.held, true, "the W9 hold is VISIBLE in the pack");
  await clearWikiHold({ client: w.clients.A1 });
});

test("W6: page selection is the budgeted running window — rank order, never a partial page", async () => {
  fail0017(live);
  const c2 = await createClient(w.users.alice, { name: `wbpack_${opk("x")}`, opKey: opk("cli") });
  // [R1-F13e] the published bodies are kept verbatim so EVERY returned page is
  // compared byte-for-byte (memo finding 13: row existence proved nothing).
  const bodies = {
    "open-q": "# open question\npending SST answer",
    profile: "# profile\nthe client profile page",
    treat: "# treatment\nhow rental is coded",
  };
  const mk = (slug, kind) => publishWikiPage({ client: c2, firm: w.firms.A, slug, pageKind: kind, title: slug, content: bodies[slug] });
  await mk("open-q", "open_question");
  await mk("profile", "profile");
  await mk("treat", "treatment");
  await setBudget("pack_max_pages", 2);
  try {
    const pack = await packHuman(w.users.alice, { client: c2, purpose: WB_V7_PURPOSE });
    const pages = pack.wiki?.pages ?? [];
    const kinds = pages.map((p) => p.page_kind);
    assert.equal(kinds.length, 2, "<= pack_max_pages pages injected");
    assert.equal(kinds[0], "profile", "profile ranks FIRST (the pinned kind priority)");
    assert.ok(!kinds.includes("open_question"), "the lowest-rank kind fell off the window");
    for (const p of pages) assert.equal(p.content, bodies[p.slug], `page '${p.slug}' injected byte-identically`);
  } finally { await setBudget("pack_max_pages", WB_BUDGET_SEEDS.pack_max_pages); }
  await setBudget("pack_max_bytes", 48);
  try {
    const pack = await packHuman(w.users.alice, { client: c2, purpose: WB_V7_PURPOSE });
    const pages = pack.wiki?.pages ?? [];
    const total = pages.reduce((n, p) => n + Buffer.byteLength(p.content ?? "", "utf8"), 0);
    assert.ok(total <= 48, `running byte window respected (got ${total})`);
    for (const p of pages) {
      assert.equal(p.content, bodies[p.slug],
        `whole pages only — '${p.slug}' rides the window with its EXACT published bytes, never truncated`);
    }
  } finally { await setBudget("pack_max_bytes", WB_BUDGET_SEEDS.pack_max_bytes); }
});

// ---------------------------------------------------------------------------
// [0019 §7] The pack's wiki block MARKS and never gates. Gated by fail0019 —
// this cell is REQUIRED to be red against an 18-migration DB.
// ---------------------------------------------------------------------------

test("[0019 §7]: the pack's wiki block adds stale_at/stale_reason BY NAME and has_stale_sources, and changes NOTHING else", async () => {
  fail0019(live19);
  const c = await createClient(w.users.alice, { name: `p0019_${opk("x")}`, opKey: opk("cli") });
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: c, kind: "invoice" });
  await publishWikiPage({ client: c, firm: w.firms.A, slug: "marked", pageKind: "profile",
    title: "Marked", content: "# marked\nthe stale page",
    citations: [{ source_kind: "document", document_id: d.documentId }],
    refs: [{ ref_kind: "document", document_id: d.documentId }] });
  await publishWikiPage({ client: c, firm: w.firms.A, slug: "clean", pageKind: "treatment",
    title: "Clean", content: "# clean\nthe live page" });

  const before1 = await packHuman(w.users.alice, { client: c, purpose: WB_V7_PURPOSE });
  for (const p of before1.wiki.pages) {
    assert.ok("has_stale_sources" in p, `pack page '${p.slug}' carries has_stale_sources`);
    assert.equal(p.has_stale_sources, false, `…false for '${p.slug}' while unmarked`);
    for (const cit of p.citations ?? []) {
      for (const k of ["source_kind", "document_id", "entry_id", "counterparty_id", "detail"]) {
        assert.ok(k in cit, `the pre-0019 enumerated citation key '${k}' is CARRIED on '${p.slug}'`);
      }
      assert.ok("stale_at" in cit && "stale_reason" in cit,
        `the pack's citation enumeration gained stale_at/stale_reason BY NAME on '${p.slug}' (nothing arrives for free — 0017:5053-5063)`);
    }
    assert.ok(!("refs" in p), "the pack's page object still carries NO refs array — the flag is the only ref signal there");
  }

  const f = (await rootQuery("select revision_token from clara.document_filings where id=$1", [d.filingId])).rows[0];
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  await retireDocumentFiling(w.users.alice, {
    filing: d.filingId, reason: "0019 pack-shape probe", expectedRevision: f.revision_token });
  assert.equal((await markStale({ client: c, document: d.documentId, opKey: opk("p19m") })).status, "marked",
    "the mark landed");

  const after1 = await packHuman(w.users.alice, { client: c, purpose: WB_V7_PURPOSE });
  // The marker is VISIBLE …
  const marked = after1.wiki.pages.find((p) => p.slug === "marked");
  assert.equal(marked.has_stale_sources, true, "the marked page's flag flips TRUE");
  assert.equal(marked.citations.find((x) => x.document_id === d.documentId).stale_reason, WB_STALE_REASON,
    "…and the citation's reason is served verbatim");
  assert.equal(after1.wiki.pages.find((p) => p.slug === "clean").has_stale_sources, false,
    "…on that page ONLY");
  // … and NOTHING is filtered, reordered or gated.
  assert.equal(after1.wiki.pages.length, before1.wiki.pages.length, "page COUNT unchanged");
  assert.deepEqual(after1.wiki.pages.map((p) => p.slug), before1.wiki.pages.map((p) => p.slug),
    "page SELECTION and ORDER unchanged (candidates / priority / row_number / the admission window are untouched)");
  for (const p of after1.wiki.pages) {
    assert.equal(p.content, before1.wiki.pages.find((x) => x.slug === p.slug).content,
      `page '${p.slug}' CONTENT is byte-identical — content_bytes derives from wv.content alone, so new citation fields cannot shift the byte cap`);
  }
  // "0019 did not move it", not "it is 4": compared in this test's own scope so a later additive
  // migration (delta's v5 period/snapshot block) changes the frontier without falsifying this claim.
  assert.equal(after1.pack_schema_version, before1.pack_schema_version,
    "the pack schema version did NOT move across the 0019 read (0019 is additive)");
  assert.equal(after1.wiki.permitted_use, "inform_never_decide", "the framing is unchanged");
});

test("W4 DB-half: the seq-embedded projection op_key replays byte-identically (exactly-once)", async () => {
  fail0017(live);
  const c2 = await createClient(w.users.alice, { name: `wbproj_${opk("x")}`, opKey: opk("cli") });
  const key = `wikiproj:${c2}:${await maxSeq(w.firms.A)}`;
  const args = { client: c2, firm: w.firms.A, slug: "proj", title: "P", content: "# projected", opKey: key };
  const r1 = await publishWikiPage(args);
  const r2 = await publishWikiPage(args);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2), "byte-identical replay under the wikiproj op_key idiom");
  const page = await pageRow(c2, "proj");
  const n = await rootQuery("select count(*)::int as n from clara.wiki_page_versions where page_id=$1", [page.id]);
  assert.equal(n.rows[0].n, 1, "exactly one version minted");
});

test("W4/P17: the index REBUILDS bit-identically from wiki.* events alone — no model in the loop", async () => {
  fail0017(live);
  const c2 = await createClient(w.users.alice, { name: `wbreb_${opk("x")}`, opKey: opk("cli") });
  await publishWikiPage({ client: c2, firm: w.firms.A, slug: "a", pageKind: "profile", title: "A", content: "# a" });
  await publishWikiPage({ client: c2, firm: w.firms.A, slug: "b", pageKind: "treatment", title: "B", content: "# b1" });
  await publishWikiPage({ client: c2, firm: w.firms.A, slug: "b", pageKind: "treatment", title: "B", content: "# b2" });
  const dead = await pageRow(c2, "a");
  await retireWikiPage(w.users.bob, { page: dead.id, reason: "probe" });
  const pb = await pageRow(c2, "b");
  const idMap = { [dead.id]: "a", [pb.id]: "b" };
  const rebuilt = {};
  for (const e of await eventsOf(w.firms.A, "wiki.page_published")) {
    const p = e.payload ?? {};
    const slug = idMap[p.page_id];
    if (!slug) continue;
    rebuilt[slug] = { page_kind: p.page_kind, version_n: Number(p.version_n),
      content_sha256: p.content_sha256, storage_key: p.storage_key, state: "active" };
  }
  for (const e of await eventsOf(w.firms.A, "wiki.page_retired")) {
    const slug = idMap[(e.payload ?? {}).page_id] ?? (JSON.stringify(e).includes(dead.id) ? "a" : null);
    if (slug && rebuilt[slug]) rebuilt[slug].state = "retired";
  }
  const liveIndex = {};
  for (const slug of ["a", "b"]) {
    const page = await pageRow(c2, slug);
    const v = (await rootQuery("select to_jsonb(v) as r from clara.wiki_page_versions v where v.id=$1", [page.current_version_id])).rows[0].r;
    liveIndex[slug] = { page_kind: page.page_kind, version_n: Number(v.version_n),
      content_sha256: v.content_sha256, storage_key: v.storage_key, state: page.state };
  }
  assert.equal(JSON.stringify(rebuilt), JSON.stringify(liveIndex),
    "replaying wiki.page_published/page_retired reproduces the index BIT-IDENTICALLY (an LLM is never in the rebuild path)");
});

test("WB-R6(1): NO authority fn's prosrc references wiki tables (the W10 named list + every K/S writer)", async () => {
  fail0017(live);
  // RECONCILE AUDIT (2026-07-23, finding W-2): the impl narrowed the scan to
  // /clara\.wiki_/ — under set search_path=clara an UNQUALIFIED wiki_pages
  // reference would escape it. A bare /wiki_/ over-matches inert vocabulary
  // (wiki_fact + the S6 dispatch receipt keys). The faithful pin is the wiki
  // TABLE FAMILY itself, word-bounded, qualified or not.
  const offenders = [];
  for (const fn of WB_AUTHORITY_FNS) {
    const src = await fnSource(fn);
    if (src && WIKI_TABLE_RE.test(src)) offenders.push(fn);
  }
  assert.equal(offenders.length, 0, `authority fns referencing wiki tables: ${offenders.join(",")}`);
});

test("WB-R6(2): the inverse scan — every GRANTED fn referencing wiki_ is in the wiki-family whitelist", async () => {
  fail0017(live);
  // RECONCILE AUDIT (2026-07-23, finding W-3): same table-family scan as
  // WB-R6(1) — a granted fn touching a wiki table, qualified OR unqualified,
  // must be whitelisted; inert wiki_* vocabulary keys never trip it.
  const r = await rootQuery(`
    select p.proname, p.prosrc from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='clara' and p.prosrc like '%wiki\\_%'
       and exists (select 1 from aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
                    join pg_roles g on g.oid = a.grantee
                   where g.rolname in ('clara_authenticated','clara_agent_ro','clara_wake_interactive','clara_wake_proactive','clara_runtime'))`);
  const outside = [...new Set(r.rows
    .filter((x) => WIKI_TABLE_RE.test(x.prosrc ?? ""))
    .map((x) => x.proname))]
    .filter((f) => !WB_WIKI_WHITELIST.includes(f));
  assert.equal(outside.length, 0, `granted fns referencing wiki tables outside the whitelist: ${outside.join(",")}`);
});

test("WB-R6(3): the draft authority path is BIT-IDENTICAL with and without wiki content present", async () => {
  fail0017(live);
  const lines = [
    { account_code: WB_COA.cash, debit_cents: 1_500, credit_cents: 0 },
    { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 1_500 },
  ];
  const c2 = w.clients.A2; // no wiki rows yet
  const d1 = await draftEntryV3(w.users.alice, {
    client: c2, resolution: freshResolution(w.users.alice, c2), lines, opKey: opk("nw"),
  });
  await publishWikiPage({ client: c2, firm: w.firms.A, slug: "profile", title: "P", content: "# now wiki-informed" });
  const d2 = await draftEntryV3(w.users.alice, {
    client: c2, resolution: freshResolution(w.users.alice, c2), lines, opKey: opk("ww"),
  });
  assert.equal(JSON.stringify(Object.keys(d1).sort()), JSON.stringify(Object.keys(d2).sort()),
    "identical receipt shapes");
  const authority = async (id) => {
    const e = await entryRow(id);
    return [e.status, e.origin, e.is_high_stakes ?? null, e.coding_kind ?? null, e.is_opening_balance];
  };
  assert.equal(JSON.stringify(await authority(d1.entry_id)), JSON.stringify(await authority(d2.entry_id)),
    "wiki rows change NOTHING on the authority path (inform, never decide)");
});
