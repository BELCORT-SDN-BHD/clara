// Wave-B battery — migration 0019 §4/§10: THE CONSUMER LANE, DB-OBSERVABLE HALF.
// `document.filing_retired` → the pinned `wikistale:<client>:<seq>` op key →
// mark_wiki_citations_stale. At-least-once safety, the per-event surface gate's
// DB half, and the dead-letter → INVERTED-LINT recovery pair. CONTRACT-BLIND;
// FAILS below 0019.
//
// SCOPE NOTE (deliberate, and reported): the lane itself is a `startWorld`
// runtime plugin, so its JS-internal behaviour — the WIKI_PROJECTION_EVENT_TYPES
// membership, the planEvent case, `skip('skipped_kind')` on null keys, the
// per-event to_regprocedure gate, and the CLR32 → 'already_projected'
// terminalStatusFor mapping — is not reachable from the DB rig (@clara/db has no
// dependency on @clara/runtime). Those cells live in
// packages/runtime/tests/wave-b-0019-filing-retired.test.mjs, written by this
// same blind lane. What IS reachable, and is asserted here, is every DB fact the
// lane depends on: the event carries both keys on BOTH authority paths, the
// surface gate resolves, the op-key idiom is exactly-once, and the inverted lint
// scan is the only surface that sees a dead-lettered mark.
//
// AMBIGUITIES this lane encodes:
//   [D19-11] §4 pins the op key as `'wikistale:' + clientId + ':' + ev.seq`.
//            Nothing pins whether the SEQ is the firm-scoped domain_events.seq
//            (the shape `wikihold:<client>:<seq>` already uses) or a relay
//            cursor. Encoded as domain_events.seq, per the cited idiom.
//   [D19-12] §4 requires the lane to CHECKPOINT-ONLY skip when the writer is
//            absent. Post-apply the writer is present, so the DB half asserts
//            only that BOTH gate forms resolve — `to_regprocedure(<signature>)`
//            and the runtime's bare-name `to_regproc`. The absent-surface
//            behaviour is a runtime-lane cell by necessity.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes,
  fail0019, wbEnsureReady19,
  buildWaveBWorld, filedDocument, freshResolution,
  publishWikiPage, pageRow, citationRows, refRows, markStale,
  runClientLint, findingRows, staleOpKey, staleCatchupOpKey, WB_STALE_REASON,
  WB_EVENT_TYPES, previewCorrection, proposeCorrection, approveCorrection,
} from "./wb-fixtures.mjs";

const SIG = "clara.mark_wiki_citations_stale(uuid,uuid,text,text)";

let live = false;
let w = null;

const cite = (document) => [{ source_kind: "document", document_id: document }];
const ref = (document) => [{ ref_kind: "document", document_id: document }];

const filingRow = async (id) =>
  (await rootQuery("select to_jsonb(f) as r from clara.document_filings f where f.id=$1", [id])).rows[0].r;

/** The LAST document.filing_retired event row for a document (full row: the
 *  lane's mapEventRow reads clientId + documentId off the ROW, not the payload). */
async function lastRetirementEvent(firm, document) {
  const r = await rootQuery(
    `select to_jsonb(d) as r from clara.domain_events d
      where d.firm_id=$1 and d.event_type='document.filing_retired' and d.document_id=$2
      order by d.seq desc limit 1`, [firm, document]);
  return r.rows[0]?.r ?? null;
}

before(async () => {
  live = await wbEnsureReady19();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0019-consumer"); await endPool(); });

test("META: 0019 applied — the consumer-lane battery is armed", async () => {
  fail0019(live);
  assert.ok(w, "world built");
});

test("[0019 §4/D19-12]: the per-event SURFACE GATE resolves in BOTH forms the runtime uses", async () => {
  fail0019(live);
  const r = await rootQuery(
    "select to_regprocedure($1) as by_sig, to_regproc('clara.mark_wiki_citations_stale') as by_name", [SIG]);
  assert.ok(r.rows[0].by_sig, "to_regprocedure(<exact signature>) resolves — the §9 tail form");
  assert.ok(r.rows[0].by_name, "to_regproc(<bare name>) resolves — the wikiColdStartReady gate form the lane reuses per event");
});

test("[0019 §4]: BOTH authority paths emit document.filing_retired carrying the TWO keys the lane needs — no resolver required", async () => {
  fail0019(live);
  // (a) retire_document_filing → client_id = f.client_id, document_id = f.document_id.
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  const f = await filingRow(d.filingId);
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  await retireDocumentFiling(w.users.alice, {
    filing: d.filingId, reason: "0019 consumer key probe", expectedRevision: f.revision_token });
  const evA = await lastRetirementEvent(w.firms.A, d.documentId);
  assert.ok(evA, "the retirement emitted document.filing_retired");
  assert.equal(evA.client_id, w.clients.A1, "(a) client_id rides the event row");
  assert.equal(evA.document_id, d.documentId, "(a) document_id rides the event row");

  // (b) approve_wrong_client_correction → client_id = x.from_client (the SOURCE,
  //     whose provenance goes stale), document_id = x.document_id, and the
  //     payload keeps correction_id — which is exactly why ONE stale_reason
  //     covers both verbs: the marker describes what invalidated the provenance.
  const m = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await freshResolution(w.users.alice, w.clients.A2, { subjectKind: "document", subjectId: m.documentId });
  const prev = await previewCorrection(w.users.alice, {
    document: m.documentId, fromClient: w.clients.A1, toClient: w.clients.A2 });
  const prop = await proposeCorrection(w.users.alice, {
    document: m.documentId, fromClient: w.clients.A1, toClient: w.clients.A2,
    reason: "0019 consumer key probe (move)", opKey: opk("d19cmv") });
  await approveCorrection(w.users.hana, {
    correction: prop?.correction_id ?? prop?.id ?? prop,
    planHash: prop?.plan_hash ?? prev?.plan_hash, opKey: opk("d19cmva") });
  const evB = await lastRetirementEvent(w.firms.A, m.documentId);
  assert.ok(evB, "the correction emitted document.filing_retired too");
  assert.equal(evB.client_id, w.clients.A1, "(b) client_id is the SOURCE client, not the destination");
  assert.equal(evB.document_id, m.documentId, "(b) document_id rides the event row");
  assert.ok(evB.payload?.correction_id, "(b) the payload keeps correction_id (0009:2561-2563)");
  // The null-key branch (§4) is therefore DEFENSIVE, not routine: neither
  // authority path can emit this event without both keys.
  const nulls = await rootQuery(
    `select count(*)::int as n from clara.domain_events
      where firm_id=$1 and event_type='document.filing_retired'
        and (client_id is null or document_id is null)`, [w.firms.A]);
  assert.equal(nulls.rows[0].n, 0,
    "no document.filing_retired event in this firm lacks a key — the lane's null-key skip is a defensive branch");
});

test("[0019 §4/§10]: event → the pinned wikistale:<client>:<seq> key → the citing client's sources go stale END TO END", async () => {
  fail0019(live);
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await publishWikiPage({ client: w.clients.A1, firm: w.firms.A, slug: "d19-c-e2e", title: "E2E",
    content: "# e2e", citations: cite(d.documentId), refs: ref(d.documentId) });
  const f = await filingRow(d.filingId);
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  await retireDocumentFiling(w.users.alice, {
    filing: d.filingId, reason: "0019 e2e retire", expectedRevision: f.revision_token });
  const ev = await lastRetirementEvent(w.firms.A, d.documentId);
  const key = staleOpKey(w.clients.A1, ev.seq);
  assert.equal(key, `wikistale:${w.clients.A1}:${ev.seq}`, "[D19-11] the op key embeds the domain_events seq");
  const r1 = await markStale({ client: w.clients.A1, document: d.documentId, opKey: key });
  assert.equal(r1.status, "marked", `the lane's mutate marks (got ${JSON.stringify(r1)})`);
  const page = await pageRow(w.clients.A1, "d19-c-e2e");
  assert.ok((await citationRows(page.current_version_id))[0].stale_at, "the citation is stale");
  assert.ok((await refRows(page.id))[0].stale_at, "the page-level document ref is stale too");
  assert.equal((await refRows(page.id))[0].stale_reason, WB_STALE_REASON, "…with the pinned reason");

  // --- at-least-once safety, both redelivery shapes ------------------------
  const r2 = await markStale({ client: w.clients.A1, document: d.documentId, opKey: key });
  assert.equal(JSON.stringify(r2), JSON.stringify(r1),
    "a REDELIVERY of the same event (same seq ⇒ same op key) replays the original receipt byte-identically");
  const stamp = (await citationRows(page.current_version_id))[0].stale_at;
  // A rewound checkpoint redrives the SAME seq, so the key is the same — and even
  // if a repair run supplies a FRESH key, the `stale_at is null` filter matches
  // nothing. Both are asserted; neither double-marks.
  const r3 = await markStale({
    client: w.clients.A1, document: d.documentId,
    opKey: staleCatchupOpKey(`run-${opk("k")}`, w.clients.A1, d.documentId) });
  assert.equal(r3.status, "noop", `a fresh-key redrive marks nothing new (got ${JSON.stringify(r3)})`);
  assert.equal(Number(r3.citations_marked) + Number(r3.refs_marked), 0, "…zero counts");
  assert.equal(String((await citationRows(page.current_version_id))[0].stale_at), String(stamp),
    "the ORIGINAL stale_at survives every redrive (never re-stamped)");
});

test("[0019 §4/§6/§10]: DEAD-LETTER RECOVERY — a writer failure that exhausts attempts leaves the citation unmarked, and ONLY the inverted lint scan sees it", async () => {
  fail0019(live);
  // processFirm advances the checkpoint PAST a dead-lettered event once attempts
  // are exhausted, so the mark is lost forever. This cell stages exactly that end
  // state — the retirement committed, the writer never ran — and proves the §6
  // union's second scan is the surface that recovers it.
  const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A2, kind: "invoice" });
  await publishWikiPage({ client: w.clients.A2, firm: w.firms.A, slug: "d19-c-deadletter",
    title: "Dead letter", content: "# dead letter", citations: cite(d.documentId) });
  const f = await filingRow(d.filingId);
  const { retireDocumentFiling } = await import("../rig-docs-fixtures.mjs");
  await retireDocumentFiling(w.users.alice, {
    filing: d.filingId, reason: "0019 dead-letter probe", expectedRevision: f.revision_token });
  // …and the consumer NEVER runs. The citation stays live-and-unmarked.
  const page = await pageRow(w.clients.A2, "d19-c-deadletter");
  const before1 = (await citationRows(page.current_version_id))[0];
  assert.equal(before1.stale_at, null, "the citation is UNMARKED — the writer never ran");
  assert.equal(page.state, "active", "…on a still-ACTIVE page");
  const lint = await runClientLint({ client: w.clients.A2 });
  assert.notEqual(lint.status, "failed", `the belt did not degrade (receipt ${JSON.stringify(lint)})`);
  const finding = (await findingRows(w.clients.A2))
    .find((x) => x.finding_kind === "stale_citation" && x.state === "open"
      && String(x.detail?.document_id) === String(d.documentId));
  assert.ok(finding, "the INVERTED scan opened a stale_citation finding for the unmarked, unfiled source");
  assert.equal(finding.detail?.marker_missing, true,
    "marker_missing:true — the visible signal of a writer/consumer failure, distinct from normal stale convergence");
  assert.equal(finding.detail?.since ?? null, null, "…and `since` is null, because no stale_at exists to be earliest");
  assert.equal((await citationRows(page.current_version_id))[0].stale_at, null,
    "the belt REPORTS, it does not repair — lint never writes the marker");
});

test("[0019 amendment 4]: NO self-subscription — no wiki stale event type exists and the pinned roster is unchanged", async () => {
  fail0019(live);
  const t = await rootQuery("select name from clara.event_types where name='wiki.citations_staled'");
  assert.equal(t.rows.length, 0, "clara.event_types carries NO 'wiki.citations_staled'");
  const wiki = await rootQuery("select name from clara.event_types where name like 'wiki.%' order by name");
  assert.deepEqual(wiki.rows.map((x) => x.name),
    ["wiki.page_published", "wiki.page_retired", "wiki.source_ingested"],
    "the wiki event family is EXACTLY the three 0017 types — 0019 registers none");
  assert.equal(Object.keys(WB_EVENT_TYPES).filter((k) => /stale/.test(k)).length, 0,
    "the pinned WB_EVENT_TYPES roster is unchanged (the negative proof of amendment 4)");
});
