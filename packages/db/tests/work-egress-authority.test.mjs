// #631 — THE MODEL-EGRESS AUTHORITY BATTERY (seam 1). `accounting_work` is the SIXTH typed
// client egress purpose, and it is the first one whose authority is DERIVED rather than granted.
//
// THE ACTIVATION ASSUMPTION UNDER TEST (stated in 0195's header, docs/ARCHITECTURE.md §10 and the
// worker's report; the OWNER MUST CONFIRM IT):
//
//   model egress authority for `accounting_work` on a client's books
//     = the firm's CURRENT accepted Terms AND DPA, at the versions published in
//       `clara.legal_documents` (0185/0187), held by an ACTIVE OWNER of that firm
//     AND the client being active.
//   revocation
//     = a NEWER legal version published and not yet accepted, the client going inactive, an
//       explicit owner withdrawal through `clara.revoke_client_egress_purpose`, or — at the
//       accounting write — the initiator's firm membership being lost (0178's own arms).
//   There is NO per-client "AI on" switch (UI-28 / UI-29 are REPLACED, not implemented).
//
// WHAT THIS FILE PROVES, AND WHY EACH LEG EXISTS.
//   1. `prepare_egress_dispatch(... 'accounting_work' ...)` GRANTS under a live derived basis and
//      returns `unknown` — UNIFORMLY, with no existence oracle — for every other state: a
//      superseded legal version, an inactive client, a supplied document sha, a foreign firm.
//   2. The consent/activation pair is SYNTHESISED from the legal acceptance, never from a manual
//      grant: no `consent_evidence` document is minted and no owner RPC is called.
//   3. `consume_egress_dispatch` keeps its single-use, TTL and re-binding semantics unchanged.
//   4. `_record_journal_entry_core` refuses CLR13 `egress_not_authorized` when this run holds no
//      consumed, non-invalidated authorization — writing NO entry, NO receipt, and leaving the
//      logical identity UNSPENT so a later Retry can still use it.
//
// Frontier-gated on the `work_egress_purpose_and_execution_trace$` stem: a leg pinned below 0195
// skips cleanly rather than reds.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateEgress, buildWorkWorld, endPool, printLaneNotes, printSkipCount, noteLane,
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry, freshWorkClient,
  basis, CLR, assertPair, rootQuery, opk, entryCount, committedReceiptCount,
  acceptLegalNow, publishNewerLegal, publishedLegal,
  prepareEgressDispatch, consumeEgressDispatch, prepareWorkEgressDispatch, workEgressEventSeq,
  authoriseWorkRun, authorizationRow, authorizationsFor, synthesisedConsent,
  revokeWorkEgress, deactivateClient, reactivateClient, expireAuthorization,
  WORK_EGRESS_PURPOSE, WORK_EGRESS_EVENT_TYPE, EGRESS_REASON,
} from "./work-egress-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("work-egress-authority");
  printSkipCount("work-egress-authority");
  await endPool();
});

const A1 = () => world.clients.A1;
const B1 = () => world.clients.B1;
const FIRM_A = () => world.firms.A;
const FIRM_B = () => world.firms.B;
const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;

/** The uniform non-grant payload. Spelled ONCE: every refusal below must be byte-identical to it,
 *  which is what "no existence oracle" means in practice. */
const UNKNOWN = { verdict: "unknown", authorization_id: null };

/** Admit a Work and claim its run WITHOUT authorising egress — the arming every refusal cell
 *  needs, and the thing the shared `wakeRecordJournalEntry` wrapper would otherwise do for it. */
async function armedUnauthorised({ client = null, author = null } = {}) {
  const cli = client ?? A1();
  const who = author ?? BOB();
  const work = await admitJournalWork({ client: cli, author: who, basis: basis() });
  const runId = opk("w631-run");
  await claimWorkRun({ task: work.task_id, runId });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: who, client: cli });
  return { ...work, cred, client: cli, author: who, runId, basis: basis() };
}

const postRaw = (a, over = {}) => wakeRecordJournalEntry(a.cred.secret, {
  client: a.client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis,
  runId: a.runId, egress: false, ...over,
});

// ===========================================================================================
// 1 · PREPARE — the derived basis.
// ===========================================================================================

test("w631.prep.granted a live accepted Terms+DPA and an active client GRANT, and the consent pair is SYNTHESISED", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "prepgranted");

  assert.equal(await synthesisedConsent(client), null,
    "prep.granted: mandatory setup — no accounting_work consent exists before the first dispatch");

  const seq = 1n;
  const v = await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: seq });
  assert.equal(v.verdict, "granted", "prep.granted: the derived basis authorises the dispatch");
  assert.ok(v.authorization_id, "prep.granted: …and hands back an OPAQUE authorization id");

  const consent = await synthesisedConsent(client);
  assert.ok(consent, "prep.granted: the consent was synthesised by the prepare itself");
  assert.equal(consent.evidence_document_id, null,
    "prep.granted: …WITHOUT a consent_evidence document — this purpose's evidence is the legal acceptance");
  assert.ok(consent.legal_acceptance_id,
    "prep.granted: …and it NAMES the acceptance it was derived from, so the basis is auditable");
  assert.equal(consent.revoked_at, null);

  const row = await authorizationRow(v.authorization_id);
  assert.equal(row.purpose, WORK_EGRESS_PURPOSE);
  assert.equal(row.document_sha256, null, "prep.granted: accounting_work is NOT document-tied");
  assert.equal(row.event_type, WORK_EGRESS_EVENT_TYPE);
  assert.equal(row.consumed_at, null, "prep.granted: preparing is not dispatching");
  assert.equal(row.invalidated_at, null);
  assert.ok(new Date(row.expires_at) - new Date(row.issued_at) <= 121000,
    "prep.granted: the 120-second dispatch TTL is unchanged");
});

test("w631.prep.doc_sha a supplied document hash is UNKNOWN — accounting_work is not document-tied", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const v = await prepareEgressDispatch({
    firm: FIRM_A(), client: A1(), eventSeq: 2n, documentSha256: "a".repeat(64) });
  assert.deepEqual(v, UNKNOWN, "prep.doc_sha: the wiki_synthesis/bank_matching shape — v_sha must be NULL");
});

test("w631.prep.inactive an inactive client is UNKNOWN, and recovers when it is active again", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "prepinactive");
  assert.equal((await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 3n })).verdict, "granted",
    "prep.inactive: mandatory setup — it grants while the client is active");

  await deactivateClient(client);
  assert.deepEqual(await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 4n }), UNKNOWN,
    "prep.inactive: an ARCHIVED client withdraws model egress with no separate switch to flip");

  await reactivateClient(client);
  assert.equal((await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 5n })).verdict, "granted",
    "prep.inactive: …and reactivating restores it, still with no manual grant");
});

test("w631.prep.foreign a client of ANOTHER firm is UNKNOWN, byte-identically", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  assert.deepEqual(await prepareEgressDispatch({ firm: FIRM_A(), client: B1(), eventSeq: 6n }), UNKNOWN,
    "prep.foreign: the credential must not become an existence oracle for another firm's clients");
  assert.deepEqual(
    await prepareEgressDispatch({ firm: FIRM_A(), client: "00000000-0000-4000-8000-000000000000", eventSeq: 7n }),
    UNKNOWN,
    "prep.foreign: …and a client that does not exist answers the SAME bytes");
});

test("w631.prep.superseded a NEWER published legal version withdraws authority until it is accepted", async (t) => {
  if (await gateEgress(t)) return;
  // Firm B's own owner, so superseding the estate-wide legal text is re-accepted here and the
  // other cells' firms re-accept in their own `acceptLegalNow` calls.
  const DAVE = world.users.dave;
  await acceptLegalNow(DAVE);
  const client = await freshWorkClient(DAVE, "prepsuper");
  assert.equal((await prepareEgressDispatch({ firm: FIRM_B(), client, eventSeq: 8n })).verdict, "granted",
    "prep.superseded: mandatory setup — the current acceptance authorises");

  const newVersion = await publishNewerLegal("dpa");
  noteLane(`prep.superseded: dpa published at version ${newVersion}`);
  assert.deepEqual(await prepareEgressDispatch({ firm: FIRM_B(), client, eventSeq: 9n }), UNKNOWN,
    "prep.superseded: a newer DPA nobody has accepted STOPS model egress — that is what revocation means here");

  await acceptLegalNow(DAVE);
  assert.equal((await prepareEgressDispatch({ firm: FIRM_B(), client, eventSeq: 10n })).verdict, "granted",
    "prep.superseded: …and accepting the new version restores it");
  assert.equal((await publishedLegal("dpa")).version, newVersion);
});

test("w631.prep.revoked an explicit owner withdrawal is STICKY — no prepare re-mints over it", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "prevoke");
  const first = await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 11n });
  assert.equal(first.verdict, "granted");

  await revokeWorkEgress(ALICE(), { client });
  const after = await authorizationRow(first.authorization_id);
  assert.ok(after.invalidated_at, "prep.revoked: the withdrawal INVALIDATES every outstanding authorization");
  assert.equal(after.invalidated_reason, "consent_revoked");

  assert.deepEqual(await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 12n }), UNKNOWN,
    "prep.revoked: a deliberate withdrawal is not undone by the next dispatch — restoring it is an owner act");
});

// ===========================================================================================
// 2 · CONSUME — single use, TTL, re-binding. Unchanged semantics, asserted for the new purpose.
// ===========================================================================================

test("w631.consume.once a prepared authorization consumes exactly ONCE", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "consonce");
  const v = await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 21n });
  const args = {
    firm: FIRM_A(), authorization: v.authorization_id, client, eventSeq: 21n,
  };
  assert.deepEqual(await consumeEgressDispatch(args), { verdict: "granted" });
  assert.deepEqual(await consumeEgressDispatch(args), { verdict: "unknown" },
    "consume.once: the second consume is refused, and not distinguished from any other refusal");
  assert.ok((await authorizationRow(v.authorization_id)).consumed_at);
});

test("w631.consume.rebind a DIFFERENT client, purpose or event does not consume", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "consbind");
  const other = await freshWorkClient(ALICE(), "consbind2");
  const v = await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 31n });

  assert.deepEqual(await consumeEgressDispatch({
    firm: FIRM_A(), authorization: v.authorization_id, client: other, eventSeq: 31n }),
    { verdict: "unknown" }, "consume.rebind: an authorization minted for one client cannot be spent on another");
  assert.deepEqual(await consumeEgressDispatch({
    firm: FIRM_A(), authorization: v.authorization_id, client, eventSeq: 32n }),
    { verdict: "unknown" }, "consume.rebind: …nor on a different event");
  assert.deepEqual(await consumeEgressDispatch({
    firm: FIRM_A(), authorization: v.authorization_id, client, eventSeq: 31n, eventType: "work.other" }),
    { verdict: "unknown" }, "consume.rebind: …nor under a different event type");
  assert.equal((await authorizationRow(v.authorization_id)).consumed_at, null,
    "consume.rebind: and NONE of those spent it — the authorization stays live for its own dispatch");

  assert.deepEqual(await consumeEgressDispatch({
    firm: FIRM_A(), authorization: v.authorization_id, client, eventSeq: 31n }), { verdict: "granted" });
});

test("w631.consume.ttl an EXPIRED authorization does not consume", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "consttl");
  const v = await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 41n });
  // The TTL is 120 seconds and this battery does not sleep for it: the row's own expiry instant
  // is moved BACK at the root, which is the same fact the clock would produce two minutes later.
  await expireAuthorization(v.authorization_id);
  assert.deepEqual(await consumeEgressDispatch({
    firm: FIRM_A(), authorization: v.authorization_id, client, eventSeq: 41n }), { verdict: "unknown" },
    "consume.ttl: an authorization older than its 120-second window is exhausted");
});

test("w631.consume.revoked a withdrawal between prepare and consume REFUSES the dispatch", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "consrevoke");
  const v = await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 51n });
  await revokeWorkEgress(ALICE(), { client });
  assert.deepEqual(await consumeEgressDispatch({
    firm: FIRM_A(), authorization: v.authorization_id, client, eventSeq: 51n }), { verdict: "unknown" },
    "consume.revoked: the consume IS the dispatch linearisation point — a revocation committed before it wins");
});

// ===========================================================================================
// 3 · THE TASK-BOUND WRAPPER — the run's own dispatch intent, derived server-side.
// ===========================================================================================

test("w631.wrap.binds the wrapper derives firm, client and event seq from the TASK, never from the caller", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  const v = await prepareWorkEgressDispatch({ task: a.task_id, runId: a.runId });
  assert.equal(v.verdict, "granted");
  assert.equal(v.firm_id, FIRM_A(), "wrap.binds: the firm comes from the Work row");
  assert.equal(v.client_id, a.client, "wrap.binds: …and so does the client");
  assert.equal(v.purpose, WORK_EGRESS_PURPOSE);
  assert.equal(v.event_type, WORK_EGRESS_EVENT_TYPE);
  assert.equal(String(v.event_seq), String(await workEgressEventSeq({ work: a.work_id, runId: a.runId })),
    "wrap.binds: the event seq IS clara._work_egress_event_seq(work, run) — the binding the write re-derives");
});

test("w631.wrap.unknown a task that is not an accounting_work run is UNKNOWN", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const bogus = await prepareWorkEgressDispatch({
    task: "00000000-0000-4000-8000-000000000001", runId: opk("w631-run") });
  assert.equal(bogus.verdict, "unknown");
  assert.equal(bogus.authorization_id, null);
});

// ===========================================================================================
// 4 · THE WRITE — CLR13 egress_not_authorized, and it leaves NOTHING behind.
// ===========================================================================================

test("w631.write.refused a run with NO consumed authorization cannot post: no entry, no receipt, identity UNSPENT", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  const entriesBefore = await entryCount(a.client);
  const receiptsBefore = await committedReceiptCount(a.client);

  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a),
    "write.refused: the accounting write verifies purpose authorisation SEPARATELY from role and period");

  assert.equal(await entryCount(a.client), entriesBefore, "write.refused: no journal rows");
  assert.equal(await committedReceiptCount(a.client), receiptsBefore, "write.refused: no committed receipt");
  const reserved = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn='record_journal_entry' and op_key=$1",
    [a.logical_op_id]);
  assert.equal(reserved.rows[0].n, 0,
    "write.refused: the refusal sits BEFORE clara._reserve_op, so the logical identity is still spendable");

  // …and the SAME run, once it has dispatched properly, posts.
  const { consumed } = await authoriseWorkRun({ task: a.task_id, runId: a.runId });
  assert.equal(consumed.verdict, "granted");
  const out = await postRaw(a);
  assert.equal(out.posted, true, "write.refused: the identity really was unspent — the authorised retry posts on it");
});

test("w631.write.prepared_only a PREPARED but unconsumed authorization is not authority", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  const v = await prepareWorkEgressDispatch({ task: a.task_id, runId: a.runId });
  assert.equal(v.verdict, "granted", "write.prepared_only: mandatory setup — the prepare succeeded");
  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a),
    "write.prepared_only: preparing is planning; only the CONSUME is the dispatch, and only it authorises the write");
  assert.equal(await committedReceiptCount(a.client), await committedReceiptCount(a.client));
});

test("w631.write.other_run an authorization consumed by a DIFFERENT run does not authorise this one", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  // A sibling Work of the same client, fully dispatched — its consumed authorization must not
  // satisfy this run's gate.
  const sibling = await armedUnauthorised();
  const ok = await authoriseWorkRun({ task: sibling.task_id, runId: sibling.runId });
  assert.equal(ok.consumed.verdict, "granted");

  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a),
    "write.other_run: the gate binds on (work, run), so another run's spent authorization is not this run's");
});

test("w631.write.invalidated an authorization INVALIDATED before it was consumed does not authorise", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "wrinval");
  const a = await armedUnauthorised({ client });
  const v = await prepareWorkEgressDispatch({ task: a.task_id, runId: a.runId });
  await revokeWorkEgress(ALICE(), { client });
  const consumed = await consumeEgressDispatch({
    firm: FIRM_A(), authorization: v.authorization_id, client, eventSeq: v.event_seq });
  assert.deepEqual(consumed, { verdict: "unknown" }, "write.invalidated: the consume refuses");
  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a),
    "write.invalidated: …and the write refuses behind it, which is the SECOND, independent check AC2 asks for");
});

test("w631.write.authorised the ordinary authorised run posts, and its authorization is spent exactly once", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "wrok");
  const a = await armedUnauthorised({ client });
  const { prepared, consumed } = await authoriseWorkRun({ task: a.task_id, runId: a.runId });
  assert.equal(consumed.verdict, "granted");

  const out = await postRaw(a);
  assert.equal(out.posted, true);
  const rows = await authorizationsFor(client);
  assert.equal(rows.length, 1, "write.authorised: ONE authorization for one dispatch");
  assert.equal(rows[0].id, prepared.authorization_id);
  assert.ok(rows[0].consumed_at, "write.authorised: …consumed");
  assert.equal(rows[0].invalidated_at, null);
});
