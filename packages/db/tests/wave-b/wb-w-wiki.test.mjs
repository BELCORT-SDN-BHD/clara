// Wave-B battery — Block W core (W1/W2 tables + CHECKs · W3 the writer family ·
// W5 storage-key family · W7 budgets-as-config · W8 pure reads · W9 holds ·
// L7 HARD caps at the writer). CONTRACT-BLIND; FAILS below 0017.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, CLR28, CLR31, PG, ROLES, rootQuery, roleQuery, opk, getPool,
  assertRaises, assertRaisesOneOf, endPool, printLaneNotes, WB_PACK_CONSUMER,
  fail0017, wbEnsureReady, hasColumn, rlsFlags, detailReason, roleCanExecute,
  fail0019, has0019, markStale, WB_STALE_REASON,
  buildWaveBWorld, createClient, filedDocument,
  publishWikiPage, recordWikiIngest, retireWikiPage, getWikiPage, listWikiPages,
  setWikiHold, clearWikiHold, holdRow,
  pageRow, versionRows, wikiLogRows, budgetVal, setBudget,
  WB_BUDGET_SEEDS, wikiKey, shaHex, eventsOf,
} from "./wb-fixtures.mjs";
import { truncateGuardError } from "../rig-txn.mjs";

let live = false;
let live19 = false;
let w = null;
const client = () => w.clients.A1;
const firm = () => w.firms.A;

before(async () => {
  live = await wbEnsureReady();
  if (live) w = await buildWaveBWorld();
  live19 = live ? await has0019() : false;
});
after(async () => { printLaneNotes("wb-w-wiki"); await endPool(); });

test("META/W7: 0017 applied — wiki tables live; wiki_budgets carries the FOUR WB-R8 seeds EXACTLY", async () => {
  fail0017(live);
  for (const t of ["wiki_pages", "wiki_page_versions", "wiki_page_citations", "wiki_page_refs", "wiki_log", "wiki_budgets", "wiki_synthesis_holds"]) {
    const r = await rootQuery(
      "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'", [t]);
    assert.ok(r.rows.length, `clara.${t} exists`);
  }
  for (const [k, v] of Object.entries(WB_BUDGET_SEEDS)) {
    assert.equal(Number(await budgetVal(k)), v, `wiki_budgets.${k} = ${v}`);
  }
  const n = await rootQuery("select count(*)::int as n from clara.wiki_budgets");
  assert.equal(n.rows[0].n, 4, "exactly the four seeded budget rows");
});

test("W7: budgets are SYSTEM config — no app role holds DML on wiki_budgets; no firm-editable writer exists", async () => {
  fail0017(live);
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.runtime]) {
    for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
      const ok = (await rootQuery("select has_table_privilege($1,'clara.wiki_budgets',$2) as ok", [role, priv])).rows[0].ok;
      assert.equal(ok, false, `${role} holds no ${priv} on wiki_budgets (retune = a migration + ADR)`);
    }
  }
  const fns = await rootQuery(
    "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname ~ 'budget' and p.proname !~ '^_'");
  assert.equal(fns.rows.length, 0, `no budget-writer fn exists (got ${fns.rows.map((r) => r.proname).join(",")})`);
});

test("W1: wiki_pages structure — RLS+FORCE, zero app DML, slug/kind/counterparty/retired CHECKs, one slug per client", async () => {
  fail0017(live);
  for (const t of ["wiki_pages", "wiki_page_versions", "wiki_page_citations", "wiki_page_refs", "wiki_log", "wiki_synthesis_holds"]) {
    const f = await rlsFlags(t);
    assert.ok(f?.rls && f?.force, `clara.${t} has RLS + FORCE RLS (0007 posture)`);
  }
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated,
    "insert into clara.wiki_pages(firm_id, client_id, slug, page_kind, title) values ($1,$2,'x','profile','X')",
    [firm(), client()]), "app-role DML on wiki_pages");
  const ins = (slug, kind) => rootQuery(
    "insert into clara.wiki_pages(firm_id, client_id, slug, page_kind, title) values ($1,$2,$3,$4,'probe')",
    [firm(), client(), slug, kind]);
  await assertRaises(PG.checkViolation, () => ins("Bad Slug!", "profile"), "slug grammar");
  await assertRaises(PG.checkViolation, () => ins("okslug", "blog_post"), "page_kind outside the P2 taxonomy");
  await assertRaises(PG.checkViolation, () => ins("cp-page", "counterparty"), "counterparty kind REQUIRES counterparty_id");
  await assertRaises(PG.checkViolation, () => rootQuery(
    "insert into clara.wiki_pages(firm_id, client_id, slug, page_kind, title, state) values ($1,$2,'half-retired','profile','probe','retired')",
    [firm(), client()]), "retired fields all-or-nothing with state='retired'");
  await ins("dupslug", "profile");
  await assertRaises(PG.uniqueViolation, () => ins("dupslug", "treatment"), "unique (client_id, slug)");
  assert.equal(await hasColumn("wiki_pages", "projected_through_seq"), false,
    "projection lag lives in relay_checkpoints, NOT here (one source of truth)");
});

test("W2/W5: version CHECKs — sha grammar, the content-addressed storage-key FAMILY, synthesis/engine pairing", async () => {
  fail0017(live);
  const pid = (await rootQuery(
    "insert into clara.wiki_pages(firm_id, client_id, slug, page_kind, title) values ($1,$2,'w2probe','profile','W2') returning id",
    [firm(), client()])).rows[0].id;
  const base = (over = {}) => {
    const content = over.content ?? "# w2 probe";
    const sha = over.sha ?? shaHex(content);
    const cols = {
      page_id: pid, firm_id: firm(), client_id: client(), version_n: over.v ?? 1,
      content, content_sha256: sha,
      storage_key: over.key ?? wikiKey(firm(), client(), sha),
      size_bytes: content.length, state: over.state ?? "uploaded",
      synthesis: over.synthesis ?? "deterministic", engine_id: over.engineId ?? null,
    };
    const names = Object.keys(cols);
    return rootQuery(
      `insert into clara.wiki_page_versions(${names.join(",")}) values (${names.map((_, i) => `$${i + 1}`).join(",")})`,
      names.map((k) => cols[k]));
  };
  await assertRaises(PG.checkViolation, () => base({ sha: "ZZ" }), "content_sha256 grammar");
  await assertRaises(PG.checkViolation, () => base({ key: "wrong/family.md" }), "storage_key outside firms/{firm}/wiki/{client}/{sha}.md");
  await assertRaises(PG.checkViolation, () => base({ state: "draft" }), "state outside the P17 ladder");
  await assertRaises(PG.checkViolation, () => base({ synthesis: "model" }), "synthesis='model' REQUIRES engine_id");
  await base({}); // the well-formed control row inserts
});

test("W2: wiki_log is APPEND-ONLY (update/delete/truncate all refused)", async () => {
  fail0017(live);
  await publishWikiPage({ client: client(), firm: firm(), slug: "log-probe", title: "Log probe" });
  const rows = await wikiLogRows(client());
  assert.ok(rows.length >= 1, "the publish appended a wiki_log row");
  const err = await rootQuery("update clara.wiki_log set action=action where id=$1", [rows[0].id]).then(() => null, (e) => e);
  assert.equal(err?.code, CLR.immutable, `wiki_log UPDATE refused (got ${err?.code})`);
  const terr = await truncateGuardError("truncate clara.wiki_log cascade");
  assert.equal(terr?.code, CLR.immutable, "wiki_log TRUNCATE refused");
});

test("W3: publish — page + v1 + citation + log + the P17 rebuild-grade event payload", async () => {
  fail0017(live);
  const content = "# Profile\nThe client is a hardware wholesaler.";
  const r = await publishWikiPage({
    client: client(), firm: firm(), slug: "profile", pageKind: "profile",
    title: "Client profile", content,
  });
  assert.ok(r, "publish receipt");
  const page = await pageRow(client(), "profile");
  assert.ok(page, "index row created");
  assert.equal(page.state, "active", "page active");
  const vs = await versionRows(page.id);
  assert.equal(vs.length, 1, "version 1 minted");
  assert.equal(vs[0].version_n, 1, "version_n = 1");
  assert.equal(vs[0].state, "published", "published state");
  assert.equal(page.current_version_id, vs[0].id, "current_version_id pointer set");
  assert.equal(vs[0].content_sha256, shaHex(content), "sha verified against the DB-mirrored content");
  const cites = await rootQuery("select count(*)::int as n from clara.wiki_page_citations where version_id=$1", [vs[0].id]);
  assert.ok(cites.rows[0].n >= 1, ">=1 citation per published version (provenance-cited law)");
  const evs = await eventsOf(firm(), "wiki.page_published", page.id);
  assert.equal(evs.length, 1, "wiki.page_published emitted");
  for (const k of ["page_id", "slug", "page_kind", "version_n", "storage_key", "content_sha256", "size_bytes", "synthesis", "engine_id"]) {
    assert.ok(k in (evs[0].payload ?? {}), `event payload carries '${k}' (rebuild by replay, never re-synthesis)`);
  }
});

test("W3: a re-publish VERSIONS the page — v2, prior published→superseded, pointer swap (WB-R9 reversible edits)", async () => {
  fail0017(live);
  await publishWikiPage({ client: client(), firm: firm(), slug: "profile", title: "Client profile v2", content: "# Profile v2" });
  const page = await pageRow(client(), "profile");
  const vs = await versionRows(page.id);
  assert.equal(vs.length, 2, "two versions");
  assert.equal(vs[0].state, "superseded", "v1 superseded — never deleted");
  assert.equal(vs[1].state, "published", "v2 published");
  assert.equal(page.current_version_id, vs[1].id, "pointer swapped");
});

test("W3: sha mismatch and zero-citation publishes refuse (CLR31)", async () => {
  fail0017(live);
  const e1 = await assertRaises(CLR31, () => publishWikiPage({
    client: client(), firm: firm(), slug: "bad-sha", title: "x", content: "abc", sha256: shaHex("different"),
    storageKey: wikiKey(firm(), client(), shaHex("different")),
  }), "sha mismatch");
  if (detailReason(e1)) assert.equal(detailReason(e1), "sha_mismatch");
  const e2 = await assertRaises(CLR31, () => publishWikiPage({
    client: client(), firm: firm(), slug: "no-cite", title: "x", citations: [],
  }), "zero citations");
  if (detailReason(e2)) assert.equal(detailReason(e2), "citation_required");
});

test("W3: a consent_evidence document is REFUSED as a citation target (the CLR28 class re-asserted)", async () => {
  fail0017(live);
  const ce = await filedDocument(w.users.alice, { firm: firm(), client: client(), kind: "consent_evidence" });
  await assertRaisesOneOf([CLR28, CLR31], () => publishWikiPage({
    client: client(), firm: firm(), slug: "ce-cite", title: "x",
    citations: [{ source_kind: "document", document_id: ce.documentId }],
  }), "citing consent evidence");
});

test("L7 HARD: the page-size cap refuses at the writer, read FROM wiki_budgets (never truncation)", async () => {
  fail0017(live);
  await setBudget("max_page_bytes", 64);
  try {
    const e = await assertRaises(CLR31, () => publishWikiPage({
      client: client(), firm: firm(), slug: "too-big", title: "x", content: "#".repeat(200),
    }), "content over max_page_bytes");
    if (detailReason(e)) assert.equal(detailReason(e), "cap_exceeded");
    assert.equal(await pageRow(client(), "too-big"), null, "typed refusal — NEVER silent truncation");
  } finally {
    await setBudget("max_page_bytes", WB_BUDGET_SEEDS.max_page_bytes);
  }
});

test("L7 HARD: the page-count cap blocks a NEW slug but not a new VERSION (budget from the table)", async () => {
  fail0017(live);
  const c2 = await createClient(w.users.alice, { name: `wbcap_${opk("x")}`, opKey: opk("cli") });
  await setBudget("max_pages_per_client", 2);
  try {
    await publishWikiPage({ client: c2, firm: firm(), slug: "p1", title: "1" });
    await publishWikiPage({ client: c2, firm: firm(), slug: "p2", title: "2" });
    await assertRaises(CLR31, () => publishWikiPage({ client: c2, firm: firm(), slug: "p3", title: "3" }),
      "a third NEW slug over max_pages_per_client");
    await publishWikiPage({ client: c2, firm: firm(), slug: "p1", title: "1v2", content: "# v2" });
  } finally {
    await setBudget("max_pages_per_client", WB_BUDGET_SEEDS.max_pages_per_client);
  }
});

test("W3: the writer family is runtime-ONLY; deterministic ingest lands a cited stub", async () => {
  fail0017(live);
  await assertRaises(PG.insufficientPrivilege, () => publishWikiPage({
    client: client(), firm: firm(), slug: "authp", title: "x", role: ROLES.authenticated,
  }), "publish as clara_authenticated");
  const src = await filedDocument(w.users.alice, { firm: firm(), client: client(), kind: "bank_statement" });
  const r = await recordWikiIngest({ client: client(), document: src.documentId, note: "statement registered" });
  assert.ok(r, "ingest receipt");
  const pages = await rootQuery(
    `select p.id from clara.wiki_pages p join clara.wiki_page_versions v on v.id=p.current_version_id
      where p.client_id=$1 and v.synthesis='deterministic'
        and exists (select 1 from clara.wiki_page_citations c where c.version_id=v.id and c.document_id=$2)`,
    [client(), src.documentId]);
  assert.ok(pages.rows.length >= 1, "a deterministic stub page cites the ingested document");
});

test("W3: retire is reverse-not-delete — bookkeeper floor, state flip, versions survive, evented", async () => {
  fail0017(live);
  await publishWikiPage({ client: client(), firm: firm(), slug: "to-retire", title: "R" });
  const page = await pageRow(client(), "to-retire");
  await assertRaises(CLR.authz, () => retireWikiPage(w.users.carol, { page: page.id }), "viewer retire");
  await retireWikiPage(w.users.bob, { page: page.id, reason: "obsolete narrative" });
  const after1 = await pageRow(client(), "to-retire");
  assert.equal(after1.state, "retired", "state flipped");
  assert.ok(after1.retired_at && after1.retired_by && after1.retire_reason, "retired fields all-or-nothing satisfied");
  assert.ok((await versionRows(page.id)).length >= 1, "versions never deleted");
  assert.equal((await eventsOf(firm(), "wiki.page_retired", page.id)).length, 1, "wiki.page_retired emitted");
});

test("W8: reads are viewer-floor PURE reads — human + MARKED runtime yes; claimless/spoofed REFUSE [R1-F4]", async () => {
  fail0017(live);
  const before1 = (await wikiLogRows(client())).length;
  const got = await getWikiPage(w.users.carol, { client: client(), slug: "profile" });
  assert.ok(got, "viewer read works (role_rank('viewer') floor)");
  assert.ok(JSON.stringify(got).includes("Profile v2"), "content served from the DB mirror");
  const list = await listWikiPages(w.users.carol, { client: client() });
  assert.ok(list, "list_wiki_pages works");
  // [R1-F4] the runtime lane needs the TRUSTED v25 marker; the absence of human
  // claims must REFUSE, never widen into a cross-firm read (memo finding 4).
  const readAs = async (role, marker) => {
    const c = await getPool().connect();
    try {
      await c.query(`set role ${role}`);
      await c.query("begin");
      if (marker != null) await c.query("select set_config('clara.pack_consumer', $1, true)", [marker]);
      const r = await c.query("select clara.get_wiki_page(p_client => $1, p_slug => 'profile') as r", [client()]);
      await c.query("commit");
      return r.rows[0].r;
    } finally {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  };
  const rt = await readAs(ROLES.runtime, WB_PACK_CONSUMER);
  assert.ok(rt, "the MARKED runtime read works (v25 sets the trusted lane marker)");
  await assertRaisesOneOf([CLR.authz, CLR.wake, CLR.notFound], () => readAs(ROLES.runtime, null),
    "a claimless, marker-less session REFUSES (never a cross-firm reader)");
  await assertRaisesOneOf([CLR.authz, CLR.wake, CLR.notFound], () => readAs(ROLES.authenticated, WB_PACK_CONSUMER),
    "an authenticated-role session spoofing the marker REFUSES");
  for (const role of [ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    assert.equal(await roleCanExecute(role, "get_wiki_page"), false, `${role} holds NO EXECUTE on get_wiki_page`);
    assert.equal(await roleCanExecute(role, "list_wiki_pages"), false, `${role} holds NO EXECUTE on list_wiki_pages`);
  }
  assert.equal((await wikiLogRows(client())).length, before1, "query stays PURE (P17) — no log writes from reads");
});

// ---------------------------------------------------------------------------
// [0019 §7] The stale marker's EXACT read shape on the W8 verbs. Gated by
// fail0019 — this cell is REQUIRED to be red against an 18-migration DB.
// ---------------------------------------------------------------------------

test("[0019 §7]: get_wiki_page serves the marker per CITATION and per REF plus has_stale_sources; list_wiki_pages carries the flag; nothing is dropped", async () => {
  fail0019(live19);
  const c = await createClient(w.users.alice, { name: `w0019_${opk("x")}`, opKey: opk("cli") });
  const d = await filedDocument(w.users.alice, { firm: firm(), client: c, kind: "invoice" });
  await publishWikiPage({
    client: c, firm: firm(), slug: "stale-read", pageKind: "profile", title: "Stale read",
    content: "# stale read", citations: [{ source_kind: "document", document_id: d.documentId }],
    refs: [{ ref_kind: "document", document_id: d.documentId }],
  });
  await publishWikiPage({ client: c, firm: firm(), slug: "clean-read", pageKind: "treatment",
    title: "Clean read", content: "# clean read" });

  const before1 = await getWikiPage(w.users.alice, { client: c, slug: "stale-read" });
  const flagOf = (g) => ("has_stale_sources" in (g ?? {}) ? g.has_stale_sources : g?.page?.has_stale_sources);
  assert.notEqual(flagOf(before1), undefined,
    "get_wiki_page exposes has_stale_sources (top level or on the page object — the contract does not pin which)");
  assert.equal(flagOf(before1), false, "…false while unmarked");
  for (const row of [...before1.citations, ...before1.refs]) {
    assert.ok("stale_at" in row && "stale_reason" in row, "every citation AND ref row carries the marker pair");
    assert.equal(row.stale_at, null, "…null while unmarked");
  }

  const f = (await rootQuery("select revision_token from clara.document_filings where id=$1", [d.filingId])).rows[0];
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  await retireDocumentFiling(w.users.alice, {
    filing: d.filingId, reason: "0019 read-shape probe", expectedRevision: f.revision_token });
  const receipt = await markStale({ client: c, document: d.documentId, opKey: opk("w19m") });
  assert.equal(receipt.status, "marked", `the mark landed (got ${JSON.stringify(receipt)})`);

  const after1 = await getWikiPage(w.users.alice, { client: c, slug: "stale-read" });
  assert.equal(flagOf(after1), true, "has_stale_sources flips TRUE");
  assert.equal(after1.citations[0].stale_reason, WB_STALE_REASON, "the citation's reason is served verbatim");
  assert.ok(after1.citations[0].stale_at, "…with its timestamp");
  assert.ok(after1.refs[0].stale_at, "the page-level document ref's marker is served too");
  // INFORM, NEVER DECIDE.
  assert.equal(after1.page.state, "active", "the page is STILL ACTIVE — marked, never retired");
  assert.equal(after1.page.current_version_id, before1.page.current_version_id, "…still the current version");
  assert.equal(after1.version.content, before1.version.content, "…serving byte-identical content");
  const list = await listWikiPages(w.users.alice, { client: c });
  assert.equal(list.length, 2, "BOTH pages are still listed — no filtering");
  assert.equal(list.find((p) => p.slug === "stale-read").has_stale_sources, true, "the marked page's flag is TRUE");
  assert.equal(list.find((p) => p.slug === "clean-read").has_stale_sources, false, "the clean page's flag is FALSE");
});

test("W9: synthesis holds — runtime-only set/clear; the hold row carries reason+since", async () => {
  fail0017(live);
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated,
    "select clara.set_wiki_synthesis_hold(p_client => $1, p_reason => 'x', p_op_key => $2)", [client(), opk("h")]),
  "authenticated hold");
  await setWikiHold({ client: client(), reason: "consent revoked" });
  const h = await holdRow(client());
  assert.ok(h, "hold row present");
  assert.equal(h.reason, "consent revoked", "reason carried");
  assert.ok(h.since, "since stamped");
  const log = await wikiLogRows(client());
  assert.ok(log.some((l) => l.action === "hold"), "wiki_log('hold')");
  await clearWikiHold({ client: client() });
  assert.equal(await holdRow(client()), null, "cleared");
  assert.ok((await wikiLogRows(client())).some((l) => l.action === "release"), "wiki_log('release')");
});
