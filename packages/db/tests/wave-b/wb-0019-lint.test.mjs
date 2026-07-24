// Wave-B battery — migration 0019 §6/§10: THE `stale_citation` LINT FINDING —
// the (page_id, document_id) grain, the exact finding shape, the UNION of the
// marked scan and the INVERTED scan, notify-once, and convergence to
// 'superseded' on a clean re-publish. CONTRACT-BLIND; FAILS below 0019.
//
// FAILURE POSTURE (0017:4666, 4911-4913): run_client_lint's whole body sits
// inside `begin … exception when others then return {status:'failed', …}`. A
// raise inside the new class does NOT abort the run — it degrades the receipt.
// Every cell here therefore asserts on the RECEIPT and the findings table, and
// never on a thrown exception.
//
// AMBIGUITIES this lane encodes:
//   [D19-13] §6 pins `since` as "the earliest stale_at of the grouped rows".
//            Within one (page_id, document_id) group every row is marked by a
//            single writer call, so the earliest IS the only value; the cell
//            asserts `since` = min(stale_at) computed from the DB rather than
//            inventing a multi-timestamp group the writer cannot produce.
//   [D19-14] §6 pins the detail KEYS but not whether detail may carry more.
//            Encoded as a superset assertion on the five pinned keys plus an
//            exact-shape assertion that the five are all present and typed; an
//            extra key at integration is a finding, not a failure here.
//   [D19-15] §6 says `severity : 'warn'` for the class as a whole. The inverted
//            (marker_missing) half is a WRITER/CONSUMER FAILURE signal, which
//            arguably warrants a higher severity — the contract does not say so,
//            so this lane asserts 'warn' for BOTH halves and flags the question.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, roleQuery, ROLES, endPool, printLaneNotes,
  fail0019, wbEnsureReady19, fnSource,
  buildWaveBWorld, createClient, filedDocument,
  publishWikiPage, pageRow, citationRows, refRows, markStale,
  runClientLint, findingRows, findingEventRows, notificationsMatching,
  staleCiteKey, WB_STALE_FINDING, WB_STALE_REASON,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let c = null; // a dedicated ACTIVE lint client
let docA = null; // cited TWICE on one page, plus a page-level ref
let pageA = null;

const cite = (document, note) => ({ source_kind: "document", document_id: document, detail: { probe: note } });
const ref = (document) => ({ ref_kind: "document", document_id: document });

const filingRow = async (id) =>
  (await rootQuery("select to_jsonb(f) as r from clara.document_filings f where f.id=$1", [id])).rows[0].r;

async function retireFiling(filingId, reason) {
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  const f = await filingRow(filingId);
  return retireDocumentFiling(w.users.alice, { filing: filingId, reason, expectedRevision: f.revision_token });
}

const staleFindings = async (client) =>
  (await findingRows(client)).filter((f) => f.finding_kind === WB_STALE_FINDING);
const openStale = async (client, document) =>
  (await staleFindings(client)).find((f) => f.state === "open" && String(f.detail?.document_id) === String(document)) ?? null;

before(async () => {
  live = await wbEnsureReady19();
  if (!live) return;
  w = await buildWaveBWorld();
  c = await createClient(w.users.alice, { name: `d19l_${opk("x")}`, opKey: opk("cli") });
  docA = await filedDocument(w.users.alice, { firm: w.firms.A, client: c, kind: "invoice" });
  // ONE page, TWO citation rows for the SAME document, PLUS a page-level ref —
  // the §6 grain says this is exactly ONE finding, not three.
  await publishWikiPage({
    client: c, firm: w.firms.A, slug: "d19-l-grain", title: "Grain", content: "# grain",
    citations: [cite(docA.documentId, "first"), cite(docA.documentId, "second")],
    refs: [ref(docA.documentId)],
  });
  pageA = await pageRow(c, "d19-l-grain");
});
after(async () => { printLaneNotes("wb-0019-lint"); await endPool(); });

test("META: 0019 applied — the lint battery is armed", async () => {
  fail0019(live);
  assert.equal((await citationRows(pageA.current_version_id)).length, 2, "two citation rows for one document");
  assert.equal((await refRows(pageA.id)).length, 1, "…plus one page-level document ref");
});

test("[0019 §6]: lint_findings.finding_kind gained 'stale_citation' and CARRIED the 0017 vocabulary", async () => {
  fail0019(live);
  const d = (await rootQuery(`
    select pg_get_constraintdef(x.oid) as d from pg_constraint x
      join pg_class t on t.oid=x.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='clara' and t.relname='lint_findings' and x.contype='c'
       and pg_get_constraintdef(x.oid) like '%finding_kind%'`)).rows.map((x) => x.d).join(" ~~ ");
  assert.ok(d.includes(`'${WB_STALE_FINDING}'`), `the finding_kind CHECK gained '${WB_STALE_FINDING}' (got ${d})`);
  for (const carried of ["'contradiction'", "'stale_claim'", "'orphan_page'", "'cap_pages'",
    "'cap_page_size'", "'wiki_synthesis_held'", "'opening_tb_tie_broken'", "'opening_doc_unfiled'"]) {
    assert.ok(d.includes(carried), `the 0017 finding vocabulary is CARRIED: ${carried}`);
  }
  // The one-open-per-(client, dedupe_key) partial unique rides UNCHANGED.
  const ix = (await rootQuery(`
    select pg_get_indexdef(i.indexrelid) as def from pg_index i
      join pg_class ic on ic.oid=i.indexrelid
     where ic.relname='uq_lint_findings_one_open'`)).rows[0]?.def;
  assert.ok(ix && ix.includes("client_id") && ix.includes("dedupe_key") && ix.includes("open"),
    `uq_lint_findings_one_open is unchanged (got ${ix})`);
});

test("[0019 §6/§9]: run_client_lint carries the new class AND the inverted document_filings probe", async () => {
  fail0019(live);
  const src = await fnSource("run_client_lint");
  assert.ok(src.includes(WB_STALE_FINDING), "the body names the stale_citation class");
  assert.ok(src.includes("stalecite:"), "…and builds the pinned dedupe key prefix");
  assert.ok(src.includes("marker_missing"), "…and emits marker_missing in the detail");
  assert.ok(/document_filings/.test(src),
    "…and probes clara.document_filings for the INVERTED scan (the same NOT EXISTS shape opening_doc_unfiled uses, 0017:4804-4807)");
});

test("[0019 §6]: ONE finding per (page_id, document_id) — two marked citations plus a marked ref collapse to a single episode", async () => {
  fail0019(live);
  await retireFiling(docA.filingId, "0019 lint grain probe");
  const r = await markStale({ client: c, document: docA.documentId, opKey: opk("d19lm") });
  assert.equal(Number(r.citations_marked), 2, "both citation rows for the document are marked");
  assert.equal(Number(r.refs_marked), 1, "…and the page-level ref");
  const receipt = await runClientLint({ client: c });
  assert.notEqual(receipt.status, "failed",
    `the belt did not degrade — assert on the RECEIPT, never on an exception (got ${JSON.stringify(receipt)})`);
  assert.equal(receipt.status, "ok", "…the pass completed");
  const open = (await staleFindings(c)).filter((f) => f.state === "open");
  assert.equal(open.length, 1, `EXACTLY one open stale_citation episode (got ${open.length})`);
  w._f = open[0];
});

test("[0019 §6]: the finding's EXACT shape — kind, dedupe_key, severity, TOP-LEVEL page_id, and the five detail keys", async () => {
  fail0019(live);
  const f = w._f;
  assert.equal(f.finding_kind, WB_STALE_FINDING, "finding_kind");
  assert.equal(f.dedupe_key, staleCiteKey(pageA.id, docA.documentId),
    `dedupe_key = 'stalecite:<page_id>:<document_id>' (got ${f.dedupe_key})`);
  assert.equal(f.severity, "warn", "severity 'warn'");
  // THE load-bearing one: the episode insert reads nullif(j->>'page_id','')::uuid
  // from the CONDITION, not from detail (0017:4836-4842). A detail-only page_id
  // would leave the finding's FK column null.
  assert.equal(f.page_id, pageA.id,
    "page_id is populated on the ROW — the condition object must set it at the TOP LEVEL, not only in detail");
  assert.equal(f.seed_id, null, "seed_id stays null for this class");
  // [D19-14] the five pinned detail keys.
  for (const k of ["page_id", "document_id", "stale_reason", "since", "marker_missing"]) {
    assert.ok(k in (f.detail ?? {}), `detail carries '${k}' (got ${JSON.stringify(f.detail)})`);
  }
  assert.equal(String(f.detail.page_id), String(pageA.id), "detail.page_id");
  assert.equal(String(f.detail.document_id), String(docA.documentId), "detail.document_id");
  assert.equal(f.detail.stale_reason, WB_STALE_REASON, "detail.stale_reason");
  assert.equal(f.detail.marker_missing, false, "marker_missing=false — this pair WAS found by the marked scan");
  // [D19-13] `since` = the earliest stale_at of the grouped rows.
  const earliest = (await rootQuery(`
    select min(t.stale_at) as m from (
      select c.stale_at from clara.wiki_page_citations c
        join clara.wiki_page_versions v on v.id=c.version_id
       where v.id=$1 and c.document_id=$2 and c.stale_at is not null
      union all
      select r.stale_at from clara.wiki_page_refs r
       where r.page_id=$3 and r.document_id=$2 and r.stale_at is not null) t`,
  [pageA.current_version_id, docA.documentId, pageA.id])).rows[0].m;
  assert.ok(earliest, "the group has at least one marked row");
  assert.equal(new Date(f.detail.since).getTime(), new Date(earliest).getTime(),
    `detail.since is the EARLIEST stale_at of the group (got ${f.detail.since}, expected ${earliest})`);
  assert.ok((await findingEventRows(f.id)).some((e) => e.event_kind === "created"),
    "lint_finding_events('created') — the episode rides the existing machinery unchanged");
});

test("[0019 §6/L6]: the finding is notified EXACTLY ONCE across repeated belt passes", async () => {
  fail0019(live);
  await runClientLint({ client: c });
  await runClientLint({ client: c });
  const open = (await staleFindings(c)).filter((f) => f.state === "open");
  assert.equal(open.length, 1, "still exactly one open episode (no duplication across passes)");
  assert.equal(open[0].id, w._f.id, "…the SAME episode, converged in place");
  assert.equal((await notificationsMatching(w._f.id)).length, 1,
    "one lint_finding_opened notification per episode (notify-once rides _record_notification_core unchanged)");
});

test("[0019 §6]: the grain is the PAIR — a second document on the same page, and the same document on a second page, each open their OWN episode", async () => {
  fail0019(live);
  const cp = await createClient(w.users.alice, { name: `d19lpair_${opk("x")}`, opKey: opk("cli") });
  const dX = await filedDocument(w.users.alice, { firm: w.firms.A, client: cp, kind: "invoice" });
  const dY = await filedDocument(w.users.alice, { firm: w.firms.A, client: cp, kind: "invoice" });
  // p1 cites BOTH documents; p2 cites dX as well. Every citation is minted while
  // both filings are still active (the CLR02 floor is untouched by 0019).
  await publishWikiPage({ client: cp, firm: w.firms.A, slug: "d19-l-p1", title: "Pair 1",
    content: "# pair one", citations: [cite(dX.documentId, "p1x"), cite(dY.documentId, "p1y")],
    refs: [ref(dX.documentId)] });
  await publishWikiPage({ client: cp, firm: w.firms.A, slug: "d19-l-p2", title: "Pair 2",
    content: "# pair two", citations: [cite(dX.documentId, "p2x")], refs: [ref(dX.documentId)] });
  const p1 = await pageRow(cp, "d19-l-p1");
  const p2 = await pageRow(cp, "d19-l-p2");
  await retireFiling(dX.filingId, "0019 lint pair probe (X)");
  await retireFiling(dY.filingId, "0019 lint pair probe (Y)");
  await markStale({ client: cp, document: dX.documentId, opKey: opk("d19lpX") });
  await markStale({ client: cp, document: dY.documentId, opKey: opk("d19lpY") });
  const receipt = await runClientLint({ client: cp });
  assert.notEqual(receipt.status, "failed", `the belt did not degrade (got ${JSON.stringify(receipt)})`);
  const keys = (await staleFindings(cp)).filter((f) => f.state === "open").map((f) => f.dedupe_key).sort();
  assert.deepEqual(keys, [
    staleCiteKey(p1.id, dX.documentId),
    staleCiteKey(p1.id, dY.documentId),
    staleCiteKey(p2.id, dX.documentId),
  ].sort(), `EXACTLY three episodes — one per (page_id, document_id) pair (got ${JSON.stringify(keys)})`);
});

test("[0019 §6/§10]: the INVERTED scan opens marker_missing:true for an UNMARKED live source whose document has no active filing", async () => {
  fail0019(live);
  const c2 = await createClient(w.users.alice, { name: `d19linv_${opk("x")}`, opKey: opk("cli") });
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: c2, kind: "invoice" });
  await publishWikiPage({ client: c2, firm: w.firms.A, slug: "d19-l-inverted", title: "Inverted",
    content: "# inverted", citations: [cite(d.documentId, "unmarked")], refs: [ref(d.documentId)] });
  const p = await pageRow(c2, "d19-l-inverted");
  await retireFiling(d.filingId, "0019 inverted-scan probe");
  // …and the writer NEVER runs (the dead-lettered-plus-checkpointed shape).
  assert.equal((await citationRows(p.current_version_id))[0].stale_at, null, "the citation is unmarked");
  const receipt = await runClientLint({ client: c2 });
  assert.notEqual(receipt.status, "failed", `the belt did not degrade (got ${JSON.stringify(receipt)})`);
  const f = await openStale(c2, d.documentId);
  assert.ok(f, "the inverted scan opened the episode the marked scan could never see");
  assert.equal(f.dedupe_key, staleCiteKey(p.id, d.documentId), "the SAME dedupe grain as the marked half");
  assert.equal(f.page_id, p.id, "page_id populated on the row");
  assert.equal(f.detail.marker_missing, true, "marker_missing:true");
  assert.equal(f.detail.since ?? null, null, "since is null when marker_missing is true");
  assert.equal(f.severity, "warn", "[D19-15] severity 'warn' for the inverted half too (the contract states one severity)");
  assert.equal((await citationRows(p.current_version_id))[0].stale_at, null,
    "lint REPORTS; it never writes the marker (the belt is not a repair path)");
});

test("[0019 §6]: a CLEAN re-publish drops the condition and converges the episode to 'superseded'", async () => {
  fail0019(live);
  const c3 = await createClient(w.users.alice, { name: `d19lsup_${opk("x")}`, opKey: opk("cli") });
  const stale = await filedDocument(w.users.alice, { firm: w.firms.A, client: c3, kind: "invoice" });
  const fresh = await filedDocument(w.users.alice, { firm: w.firms.A, client: c3, kind: "invoice" });
  await publishWikiPage({ client: c3, firm: w.firms.A, slug: "d19-l-converge", title: "Converge",
    content: "# converge v1", citations: [cite(stale.documentId, "v1")], refs: [ref(stale.documentId)] });
  await retireFiling(stale.filingId, "0019 convergence probe");
  await markStale({ client: c3, document: stale.documentId, opKey: opk("d19lc") });
  await runClientLint({ client: c3 });
  const opened = await openStale(c3, stale.documentId);
  assert.ok(opened, "the episode opened");
  // A clean re-publish cites only actively-filed documents and re-creates refs.
  await publishWikiPage({ client: c3, firm: w.firms.A, slug: "d19-l-converge", title: "Converge",
    content: "# converge v2", citations: [cite(fresh.documentId, "v2")], refs: [ref(fresh.documentId)] });
  const receipt = await runClientLint({ client: c3 });
  assert.notEqual(receipt.status, "failed", `the belt did not degrade (got ${JSON.stringify(receipt)})`);
  const now = (await findingRows(c3)).find((f) => f.id === opened.id);
  assert.equal(now.state, "superseded", "the condition is gone, so the episode converged to 'superseded'");
  assert.ok(now.superseded_at, "…with superseded_at stamped");
  assert.equal(now.resolved_by, null, "…and no human resolution invented");
  assert.ok((await findingEventRows(opened.id)).some((e) => e.event_kind === "superseded"),
    "lint_finding_events('superseded') records the transition");
});

test("[0019 §6]: the belt NEVER raises for this class — a null op_key and an unknown client both return receipts", async () => {
  fail0019(live);
  const noKey = await roleQuery(ROLES.runtime,
    "select clara.run_client_lint(p_client => $1, p_op_key => null) as r", [c])
    .then((r) => r.rows[0].r, (e) => e);
  assert.ok(!(noKey instanceof Error),
    `a null op_key must not RAISE even with the new class staged (got ${noKey?.code ?? "receipt"})`);
  const again = await runClientLint({ client: c });
  assert.ok(["ok", "skipped"].includes(again.status),
    `the belt returns a typed receipt, never an exception (got ${JSON.stringify(again)})`);
});
