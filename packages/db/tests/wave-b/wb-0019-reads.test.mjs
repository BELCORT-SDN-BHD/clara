// Wave-B battery — migration 0019 §7/§10: READ-SURFACE MARKING, inform-never-
// decide. get_wiki_page / list_wiki_pages / the context-pack wiki block expose
// the marker; NOTHING is filtered, reordered or gated by it. CONTRACT-BLIND;
// FAILS below 0019.
//
// AMBIGUITIES this lane encodes:
//   [D19-16] §7.1 says get_wiki_page "gains a derived page-level
//            has_stale_sources boolean" without saying WHERE in its
//            {page, version, citations, refs} envelope. Encoded as: reachable at
//            the top level OR inside `page` — the cell accepts either and
//            reports which, so the shape can be pinned at reconcile.
//   [D19-17] §10 asks for a pack "byte-identical to the PRE-0019 pack" for an
//            unmarked client. That is not observable after the apply (the old fn
//            is gone). This lane substitutes the two strongest available oracles:
//            (a) the independent JS replication of the DB's selection rule
//            (expectedPackWindow), and (b) a BEFORE/AFTER-marking comparison of
//            the same client with the three new keys stripped — which proves the
//            new keys are the ONLY delta, i.e. no filtering, reordering or
//            gating.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes,
  fail0019, wbEnsureReady19, fnSource,
  buildWaveBWorld, createClient, filedDocument,
  publishWikiPage, getWikiPage, listWikiPages, packHuman,
  pageRow, citationRows, refRows, markStale,
  seedWikiCorpus, expectedPackWindow,
  WB_V7_PURPOSE, WB_BUDGET_SEEDS, WB_STALE_REASON,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let c = null; // the marked client
let doc = null;
let page = null;

const cite = (document) => [{ source_kind: "document", document_id: document }];
const ref = (document) => [{ ref_kind: "document", document_id: document }];

const filingRow = async (id) =>
  (await rootQuery("select to_jsonb(f) as r from clara.document_filings f where f.id=$1", [id])).rows[0].r;

/** Deep-strip the three 0019-added keys so the residue can be compared for
 *  "no filtering, reordering or gating". */
function stripMarker(node) {
  if (Array.isArray(node)) return node.map(stripMarker);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "stale_at" || k === "stale_reason" || k === "has_stale_sources") continue;
      out[k] = stripMarker(v);
    }
    return out;
  }
  return node;
}

const flagOf = (got) => {
  if (got && typeof got === "object" && "has_stale_sources" in got) return { where: "top", value: got.has_stale_sources };
  if (got?.page && "has_stale_sources" in got.page) return { where: "page", value: got.page.has_stale_sources };
  return { where: null, value: undefined };
};

before(async () => {
  live = await wbEnsureReady19();
  if (!live) return;
  w = await buildWaveBWorld();
  c = await createClient(w.users.alice, { name: `d19r_${opk("x")}`, opKey: opk("cli") });
  doc = await filedDocument(w.users.alice, { firm: w.firms.A, client: c, kind: "invoice" });
  // Three pages across three ranked kinds, so the pack's window has real order to
  // preserve; the profile page carries the markable document citation AND ref.
  await publishWikiPage({ client: c, firm: w.firms.A, slug: "d19-r-profile", pageKind: "profile",
    title: "Profile", content: "# profile\nthe marked page",
    citations: cite(doc.documentId), refs: ref(doc.documentId) });
  await publishWikiPage({ client: c, firm: w.firms.A, slug: "d19-r-period", pageKind: "period_context",
    title: "Period", content: "# period\nunmarked" });
  await publishWikiPage({ client: c, firm: w.firms.A, slug: "d19-r-treat", pageKind: "treatment",
    title: "Treatment", content: "# treatment\nunmarked" });
  page = await pageRow(c, "d19-r-profile");
});
after(async () => { printLaneNotes("wb-0019-reads"); await endPool(); });

test("META: 0019 applied — the read-surface battery is armed", async () => {
  fail0019(live);
  assert.ok(page?.current_version_id, "the markable page is staged");
  assert.equal((await citationRows(page.current_version_id)).length, 1, "one document citation");
  assert.equal((await refRows(page.id)).length, 1, "one page-level document ref");
});

test("[0019 §7/§9]: all three read fns name has_stale_sources; the pack additionally names stale_at BY NAME in its citation enumeration", async () => {
  fail0019(live);
  for (const fn of ["get_wiki_page", "list_wiki_pages", "get_context_pack"]) {
    assert.ok((await fnSource(fn)).includes("has_stale_sources"), `${fn} derives has_stale_sources`);
  }
  const pack = await fnSource("get_context_pack");
  assert.ok(pack.includes("stale_at"),
    "the pack's citation enumeration adds stale_at BY NAME (it enumerates fields explicitly — nothing arrives for free, 0017:5053-5063)");
  assert.ok(pack.includes("stale_reason"), "…and stale_reason by name");
  // The pack carries no refs array, so the flag is the ONLY signal there that a
  // page's document REF went stale — the reason the name is 'sources', not
  // 'citations' (amendment 6).
  const list = await fnSource("list_wiki_pages");
  assert.ok(list.includes("has_stale_sources"),
    "list_wiki_pages enumerates page fields explicitly, so the flag had to be added by name (0017:2420-2425)");
});

test("[0019 §7]: BEFORE the mark — the flag is FALSE everywhere and the marker columns read null", async () => {
  fail0019(live);
  const got = await getWikiPage(w.users.alice, { client: c, slug: "d19-r-profile" });
  const flag = flagOf(got);
  assert.ok(flag.where, `[D19-16] has_stale_sources is exposed by get_wiki_page (found at: ${flag.where ?? "NOWHERE"})`);
  assert.equal(flag.value, false, "…and is FALSE for an unmarked page");
  for (const cRow of got.citations) {
    assert.ok("stale_at" in cRow && "stale_reason" in cRow,
      "citations carry stale_at/stale_reason additively (to_jsonb(c), 0017:2395)");
    assert.equal(cRow.stale_at, null, "…null before the mark");
  }
  for (const rRow of got.refs) {
    assert.ok("stale_at" in rRow && "stale_reason" in rRow, "refs carry them too (to_jsonb(r), 0017:2397)");
    assert.equal(rRow.stale_at, null, "…null before the mark");
  }
  const list = await listWikiPages(w.users.alice, { client: c });
  for (const p of list) {
    assert.ok("has_stale_sources" in p, `list_wiki_pages entry '${p.slug}' carries has_stale_sources`);
    assert.equal(p.has_stale_sources, false, `…false for '${p.slug}'`);
  }
  w._packBefore = await packHuman(w.users.alice, { client: c, purpose: WB_V7_PURPOSE });
  for (const p of w._packBefore.wiki.pages) {
    assert.ok("has_stale_sources" in p, `the pack's page object '${p.slug}' carries has_stale_sources`);
    assert.equal(p.has_stale_sources, false, `…false for '${p.slug}'`);
    for (const cRow of p.citations ?? []) {
      assert.ok("stale_at" in cRow && "stale_reason" in cRow,
        `the pack's citation object on '${p.slug}' carries stale_at/stale_reason`);
    }
  }
});

test("[0019 §7]: AFTER the mark — the marker is VISIBLE on every surface and the page is STILL SERVED, still current, still active", async () => {
  fail0019(live);
  const f = await filingRow(doc.filingId);
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  await retireDocumentFiling(w.users.alice, {
    filing: doc.filingId, reason: "0019 read-surface probe", expectedRevision: f.revision_token });
  const r = await markStale({ client: c, document: doc.documentId, opKey: opk("d19rm") });
  assert.equal(r.status, "marked", `the mark landed (got ${JSON.stringify(r)})`);

  const got = await getWikiPage(w.users.alice, { client: c, slug: "d19-r-profile" });
  assert.equal(flagOf(got).value, true, "get_wiki_page: has_stale_sources flips TRUE");
  const marked = got.citations.find((x) => x.document_id === doc.documentId);
  assert.ok(marked.stale_at, "…the citation's stale_at is served");
  assert.equal(marked.stale_reason, WB_STALE_REASON, "…with its reason");
  assert.ok(got.refs[0].stale_at, "…and the page-level document ref's marker is served");
  // INFORM, NEVER DECIDE: the page is not retired, not hidden, still current.
  assert.equal(got.page.state, "active", "the page is STILL ACTIVE — marked, never dropped (ADR-004)");
  assert.equal(got.page.current_version_id, page.current_version_id, "…and still the current version");
  assert.ok(got.version?.content, "…and its content is still served");

  const list = await listWikiPages(w.users.alice, { client: c });
  const entry = list.find((p) => p.slug === "d19-r-profile");
  assert.equal(entry.has_stale_sources, true, "list_wiki_pages: the marked page flips TRUE");
  for (const p of list.filter((x) => x.slug !== "d19-r-profile")) {
    assert.equal(p.has_stale_sources, false, `…and only that page — '${p.slug}' stays FALSE`);
  }
  assert.equal(list.length, 3, "every page is still LISTED — no filtering");
});

test("[0019 §7/D19-17]: the pack MARKS and changes NOTHING ELSE — same pages, same order, same count, same bytes", async () => {
  fail0019(live);
  const after1 = await packHuman(w.users.alice, { client: c, purpose: WB_V7_PURPOSE });
  const before1 = w._packBefore;
  assert.equal(after1.wiki.pages.length, before1.wiki.pages.length, "page COUNT unchanged by the mark");
  assert.deepEqual(after1.wiki.pages.map((p) => p.slug), before1.wiki.pages.map((p) => p.slug),
    "page SELECTION and ORDER unchanged — the marker touches neither candidates, priority/row_number, nor the admission window");
  for (let i = 0; i < after1.wiki.pages.length; i++) {
    assert.equal(after1.wiki.pages[i].content, before1.wiki.pages[i].content,
      `page '${after1.wiki.pages[i].slug}' CONTENT is byte-identical`);
  }
  // The three new keys are the ONLY delta anywhere in the wiki block.
  assert.equal(JSON.stringify(stripMarker(after1.wiki.pages)), JSON.stringify(stripMarker(before1.wiki.pages)),
    "with stale_at / stale_reason / has_stale_sources stripped, the wiki block is byte-identical before and after the mark");
  // …and the marker IS present in the after-pack (the strip above is not vacuous).
  const markedPage = after1.wiki.pages.find((p) => p.slug === "d19-r-profile");
  assert.equal(markedPage.has_stale_sources, true, "the pack's page flag flipped TRUE");
  assert.ok((markedPage.citations ?? []).some((x) => x.stale_at),
    "…and the pack's citation object carries the stale_at that the strip removed");
  // The pack's framing is untouched.
  assert.equal(after1.wiki.basis, "clara_maintained_advisory_notes", "framing basis unchanged");
  assert.equal(after1.wiki.permitted_use, "inform_never_decide", "permitted_use unchanged");
  // The claim is "0019 did not move it", not "it is 4" — so compare the before and after packs in
  // this test's own scope. A later additive migration (delta's v5 period/snapshot block) then
  // changes the frontier without falsifying anything 0019 is responsible for.
  assert.equal(after1.pack_schema_version, before1.pack_schema_version,
    "the pack schema version did NOT move across the mark (0019 is additive)");
});

test("[0019 §7/D19-17]: for an UNMARKED client the budgeted window still matches the INDEPENDENT JS replication exactly", async () => {
  fail0019(live);
  const cu = await createClient(w.users.alice, { name: `d19runm_${opk("x")}`, opKey: opk("cli") });
  const model = await seedWikiCorpus(cu, w.firms.A, {
    counterparty: null,
    pages: [
      { slug: "profile-page", page_kind: "profile", bytes: 2000 },
      { slug: "period-page", page_kind: "period_context", bytes: 2000 },
      { slug: "treat-page", page_kind: "treatment", bytes: 2000 },
      { slug: "recur-page", page_kind: "recurring_pattern", bytes: 2000 },
      { slug: "oq-00", page_kind: "open_question", bytes: 2000 },
      { slug: "oq-01", page_kind: "open_question", bytes: 2000 },
      { slug: "oq-02", page_kind: "open_question", bytes: 2000 },
    ],
  });
  const exp = expectedPackWindow(model, {
    pageCap: WB_BUDGET_SEEDS.pack_max_pages, byteCap: WB_BUDGET_SEEDS.pack_max_bytes });
  const pack = await packHuman(w.users.alice, { client: cu, purpose: WB_V7_PURPOSE });
  assert.deepEqual(pack.wiki.pages.map((p) => p.slug), exp.map((e) => e.slug),
    "the ordered window still matches the JS replication of the 0017 selection rule EXACTLY (0019 changed no selection code)");
  for (const p of pack.wiki.pages) {
    assert.equal(p.content, model.find((m) => m.slug === p.slug).content, `'${p.slug}' byte-identical`);
    assert.equal(p.has_stale_sources, false, `'${p.slug}' is unmarked`);
  }
});

test("[0019 §7]: has_stale_sources aggregates BOTH relations — a marked REF alone lights it with zero marked citations", async () => {
  fail0019(live);
  const cr = await createClient(w.users.alice, { name: `d19rref_${opk("x")}`, opKey: opk("cli") });
  const cited = await filedDocument(w.users.alice, { firm: w.firms.A, client: cr, kind: "invoice" });
  const reffed = await filedDocument(w.users.alice, { firm: w.firms.A, client: cr, kind: "invoice" });
  await publishWikiPage({ client: cr, firm: w.firms.A, slug: "d19-r-refonly", pageKind: "profile",
    title: "Ref only", content: "# ref only",
    citations: cite(cited.documentId), refs: ref(reffed.documentId) });
  const p = await pageRow(cr, "d19-r-refonly");
  const f = await filingRow(reffed.filingId);
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  await retireDocumentFiling(w.users.alice, {
    filing: reffed.filingId, reason: "0019 ref-only probe", expectedRevision: f.revision_token });
  const r = await markStale({ client: cr, document: reffed.documentId, opKey: opk("d19rref") });
  assert.equal(Number(r.citations_marked), 0, "no citation matched (the document is only REFFED)");
  assert.equal(Number(r.refs_marked), 1, "the page-level document ref is marked");
  const got = await getWikiPage(w.users.alice, { client: cr, slug: "d19-r-refonly" });
  assert.equal(flagOf(got).value, true,
    "has_stale_sources is TRUE from a marked REF alone — the flag aggregates citations AND page-level document refs");
  assert.equal(got.citations.filter((x) => x.stale_at).length, 0, "…with zero marked citations");
  const list = await listWikiPages(w.users.alice, { client: cr });
  assert.equal(list.find((x) => x.slug === "d19-r-refonly").has_stale_sources, true,
    "list_wiki_pages agrees");
  const pack = await packHuman(w.users.alice, { client: cr, purpose: WB_V7_PURPOSE });
  const packPage = pack.wiki.pages.find((x) => x.slug === "d19-r-refonly");
  assert.equal(packPage.has_stale_sources, true,
    "…and the PACK agrees — where the flag is the ONLY signal, because the pack carries no refs array");
  assert.ok(!("refs" in packPage), "the pack's page object still carries no refs array (0019 added none)");
  assert.equal(p.state, "active", "the page is still active throughout");
});
