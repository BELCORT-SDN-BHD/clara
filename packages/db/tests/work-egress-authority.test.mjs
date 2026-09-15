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
//   5. …UNLESS the run was claimed under a PRE-v3 bundle, which is GRANDFATHERED (the wave-3
//      ruling, stated verbatim in 0195's header and docs/ARCHITECTURE.md §10 — the OWNER MUST
//      CONFIRM IT). `clara.prepare_work_egress_dispatch`/`consume_egress_dispatch` are called
//      from ONE non-test site, `claraWork.v3.impl.ts:280,291`, and v1/v2 are FROZEN bodies that
//      can never gain the call: without the grandfather arm every Work already parked on
//      claraWork_v1/_v2 when 0195 applies is unpostable forever. §4b is that arm, and it is
//      CLOSED at two ids — an absent stamp, an unknown id and every id from v3 on are walled.
//
// Frontier-gated on the `work_egress_purpose_and_execution_trace$` stem: a leg pinned below 0195
// skips cleanly rather than reds.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateEgress, buildWorkWorld, endPool, printLaneNotes, printSkipCount, noteLane,
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry, freshWorkClient,
  defaultBundle, bundleForVersion, workRow,
  basis, CLR, assertPair, rootQuery, opk, entryCount, committedReceiptCount,
  acceptLegalNow, publishNewerLegal, publishedLegal,
  prepareEgressDispatch, consumeEgressDispatch, prepareWorkEgressDispatch, workEgressEventSeq,
  authoriseWorkRun, authorizationRow, authorizationsFor, synthesisedConsent,
  revokeWorkEgress, deactivateClient, reactivateClient, expireAuthorization,
  WORK_EGRESS_PURPOSE, WORK_EGRESS_EVENT_TYPE, EGRESS_REASON,
  // the review round: the restore door, the audited mint, the retroactive withdrawal and the
  // trace relation's own walls.
  restoreWorkEgress, grantEgressPurpose, consentRows, auditCount, eventsOfType, tracePruneLog,
  readTraceTableAs, recordWorkExecutionTrace, recordWorkExecutionTraceBounded, withWorkRowLocked,
  pruneWorkExecutionTraces, getWorkExecutionTrace, traceCount, assertRaises, PG,
  // #811
  gateTraceShape,
  // #811
  // #812
  gateEgressRecovery, deactivateWorkEgressPurpose, activateWorkEgressPurpose,
  reactivateWorkEgress, activationRows, humanQuery,
  // #812
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
 *  needs, and the thing the shared `wakeRecordJournalEntry` wrapper would otherwise do for it.
 *
 *  `bundle` is the manifest the claim stamps on the Work row, and from 0195 it DECIDES whether
 *  the egress wall applies at all: the default is the CURRENT `clara-work/v3` (so every refusal
 *  cell below measures the wall), and §4b passes a predecessor's to measure the grandfather arm.
 *  `claim = false` admits the Work and never claims a run, which is the only way to reach the
 *  core with NO bundle stamp at all — `clara.claim_work_run` refuses a bundle without an id. */
async function armedUnauthorised({ client = null, author = null, bundle = null, claim = true } = {}) {
  const cli = client ?? A1();
  const who = author ?? BOB();
  const work = await admitJournalWork({ client: cli, author: who, basis: basis() });
  const runId = opk("w631-run");
  if (claim) await claimWorkRun({ task: work.task_id, runId, bundle });
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

// ===========================================================================================
// 4b · THE GRANDFATHER ARM — a run claimed under a PRE-v3 bundle is not walled.
//
// THE RULING UNDER TEST (wave-3 orchestrator, 2026-09-14; verbatim in 0195's header and
// docs/ARCHITECTURE.md §10; the OWNER MUST CONFIRM IT):
//
//   A Work whose run was claimed under a PRE-v3 bundle (`accounting_work.bundle->>'id'` is
//   `clara-work/v1` or `clara-work/v2` — the frozen manifest stamped at claim) is
//   GRANDFATHERED: `_record_journal_entry_core` does not require a consumed `accounting_work`
//   authorization for it. The wall applies in full from `clara-work/v3` on.
//
// The two grandfathered ids are copied from the two FROZEN manifests that declare them —
// `packages/runtime/workflows/claraWork.v1.bundle.ts` (`id: "clara-work/v1"`) and
// `claraWork.v2.bundle.ts` (`id: "clara-work/v2"`) — and 0195's tail census re-reads the
// committed body to refuse a THIRD id in that set.
// ===========================================================================================

test("w631.write.grandfathered a run claimed under a PRE-v3 bundle POSTS with NO authorization at all", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  for (const version of [1, 2]) {
    const client = await freshWorkClient(ALICE(), `grandf${version}`);
    const a = await armedUnauthorised({ client, bundle: bundleForVersion(version) });
    assert.equal((await workRow(a.work_id)).bundle.id, `clara-work/v${version}`,
      `write.grandfathered: mandatory setup — the Work row records the v${version} manifest`);
    assert.equal((await authorizationsFor(client)).length, 0,
      "write.grandfathered: …and NOTHING was dispatched: a frozen pre-v3 body cannot call the prepare verb");

    const entriesBefore = await entryCount(client);
    const out = await postRaw(a);
    assert.equal(out.posted, true,
      `write.grandfathered: a run parked on claraWork_v${version} before 0195 finishes honestly rather than dying at the write`);
    assert.equal(await entryCount(client), entriesBefore + 1, "write.grandfathered: the books moved");
    assert.equal(await committedReceiptCount(client), 1, "write.grandfathered: …with its committed receipt");
    assert.equal((await authorizationsFor(client)).length, 0,
      "write.grandfathered: …and the grandfather MINTS nothing — it skips the requirement, it does not satisfy it");
  }
});

test("w631.write.walled_from_v3 the SAME Work claimed under clara-work/v3 is refused CLR13 egress_not_authorized", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "walledv3");
  const a = await armedUnauthorised({ client, bundle: bundleForVersion(3) });
  assert.equal((await workRow(a.work_id)).bundle.id, "clara-work/v3",
    "write.walled_from_v3: mandatory setup — the claim stamped the CURRENT manifest");
  assert.equal(bundleForVersion(3).id, defaultBundle().id,
    "write.walled_from_v3: …which is the rig's own default, so every other cell in this file measures the wall");

  const entriesBefore = await entryCount(client);
  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a),
    "write.walled_from_v3: the grandfather is a clause of the wall, not a hole in it — v3 is the first id it does NOT cover");
  assert.equal(await entryCount(client), entriesBefore, "write.walled_from_v3: no entry");

  // …and the SAME run posts once it has dispatched, which is what proves the refusal was the
  // egress gate and not the bundle id being rejected for some other reason.
  assert.equal((await authoriseWorkRun({ task: a.task_id, runId: a.runId })).consumed.verdict, "granted");
  assert.equal((await postRaw(a)).posted, true,
    "write.walled_from_v3: …and the authorised v3 run posts on the SAME identity");
});

test("w631.write.unknown_bundle an id this file has never heard of, and NO stamp at all, are both WALLED", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());

  // A FUTURE successor. The set is closed at two; it does not open forward by accident.
  const future = await freshWorkClient(ALICE(), "grandf4");
  const a4 = await armedUnauthorised({ client: future, bundle: bundleForVersion(4) });
  assert.equal((await workRow(a4.work_id)).bundle.id, "clara-work/v4");
  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a4),
    "write.unknown_bundle: a LATER bundle id is walled — the grandfather names two ids, it does not mean 'not v3'");

  // NO STAMP. `clara.claim_work_run` refuses a bundle with no id (CLR10 invalid_bundle), so the
  // only way a Work row carries a null bundle is that no run ever claimed it — which is exactly
  // the state an admitted-but-unclaimed Work is in, and it must FAIL CLOSED rather than read as
  // "not a v3 id, therefore grandfathered".
  const bare = await freshWorkClient(ALICE(), "grandfnone");
  const a0 = await armedUnauthorised({ client: bare, claim: false });
  assert.equal((await workRow(a0.work_id)).bundle, null,
    "write.unknown_bundle: mandatory setup — an unclaimed Work carries NO bundle stamp");
  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a0),
    "write.unknown_bundle: an absent stamp is WALLED — coalesce(bundle->>'id','') is the fail-closed reading");
  assert.equal(await entryCount(bare), 0, "write.unknown_bundle: nothing posted for either shape");
});

// ===========================================================================================
// 5 · THE WAY BACK ON — the review's S1. A withdrawal that cannot be undone is not a control.
// ===========================================================================================

test("w631.grant.derived_refused the MANUAL grant door refuses accounting_work by NAME", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "grantref");

  // The refusal is about the PURPOSE, and it lands before the evidence rule: the same call shape
  // with a document-evidenced purpose gets the EVIDENCE refusal instead, which is what proves the
  // arm fired on the purpose rather than on the missing document.
  await assertPair(CLR.badRequest, "purpose_derived_not_grantable",
    () => grantEgressPurpose(ALICE(), { client, purpose: WORK_EGRESS_PURPOSE }),
    "grant.derived_refused: accounting_work authority is DERIVED, never granted with evidence");
  await assertPair("CLR28", "evidence_mismatch",
    () => grantEgressPurpose(ALICE(), { client, purpose: "document_processing" }),
    "grant.derived_refused: …and every other purpose keeps its own evidence rule, untouched");
  assert.equal(await synthesisedConsent(client), null,
    "grant.derived_refused: the refused grant wrote nothing");
});

test("w631.restore.round_trip revoke → unknown → grant refuses → RESTORE → granted again", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "restore");
  assert.equal((await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 61n })).verdict,
    "granted", "restore.round_trip: mandatory setup — the derived basis authorises");

  await revokeWorkEgress(ALICE(), { client });
  assert.deepEqual(await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 62n }), UNKNOWN,
    "restore.round_trip: the withdrawal is STICKY — no dispatch re-mints over it");
  await assertPair(CLR.badRequest, "purpose_derived_not_grantable",
    () => grantEgressPurpose(ALICE(), { client, purpose: WORK_EGRESS_PURPOSE }),
    "restore.round_trip: and the grant door is NOT the way back — it refuses this purpose");

  const out = await restoreWorkEgress(ALICE(), { client });
  assert.equal(out.status, "live", "restore.round_trip: the owner door restores it");
  assert.ok(out.consent_id && out.activation_id);

  const rows = await consentRows(client);
  assert.equal(rows.length, 2, "restore.round_trip: the revoked consent STAYS as history");
  assert.ok(rows[0].revoked_at, "restore.round_trip: …revoked…");
  assert.equal(rows[1].revoked_at, null, "restore.round_trip: …beside a fresh live one");
  assert.equal(rows[1].evidence_document_id, null);
  assert.ok(rows[1].legal_acceptance_id,
    "restore.round_trip: the fresh consent names the acceptance it was RE-derived from");

  assert.equal((await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 63n })).verdict,
    "granted", "restore.round_trip: and the next dispatch grants again");

  // …and it is audited and announced, exactly as the revoke it undoes is.
  const events = await eventsOfType(FIRM_A(), "egress.purpose_consent_restored", client);
  assert.equal(events.length, 1, "restore.round_trip: ONE restore event");
  assert.equal(events[0].payload.consent_id, out.consent_id);
  assert.equal(events[0].payload.restored_over, rows[0].id,
    "restore.round_trip: …naming the consent it restored over");
  assert.equal(await auditCount(FIRM_A(), "restore_client_egress_purpose") >= 1, true);
});

test("w631.restore.floor restoring is an OWNER act, and only for the DERIVED purpose", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "restorefloor");
  await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 71n });
  await revokeWorkEgress(ALICE(), { client });

  await assertRaises(CLR.authz, () => restoreWorkEgress(world.users.carol, { client }),
    "restore.floor: a VIEWER cannot restore model egress");
  await assertRaises(CLR.authz, () => restoreWorkEgress(BOB(), { client }),
    "restore.floor: …nor a bookkeeper — the revoke door's floor, read forward");
  await assertPair(CLR.badRequest, "purpose_not_restorable",
    () => restoreWorkEgress(ALICE(), { client, purpose: "document_processing" }),
    "restore.floor: the five document-evidenced purposes keep their own grant door");
  assert.deepEqual(await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 72n }), UNKNOWN,
    "restore.floor: none of those refusals restored anything");
});

test("w631.restore.foreign another firm's client is NOT FOUND, and a live one is refused", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  await assertRaises(CLR.notFound, () => restoreWorkEgress(ALICE(), { client: B1() }),
    "restore.foreign: the credential must not become an existence oracle for another firm");
  await assertRaises(CLR.notFound,
    () => restoreWorkEgress(ALICE(), { client: "00000000-0000-4000-8000-000000000000" }),
    "restore.foreign: …and an absent client answers the same code");

  const live = await freshWorkClient(ALICE(), "restorelive");
  await prepareEgressDispatch({ firm: FIRM_A(), client: live, eventSeq: 81n });
  await assertPair("CLR28", "already_live", () => restoreWorkEgress(ALICE(), { client: live }),
    "restore.foreign: restoring what was never withdrawn is a refusal, not a second consent");

  const never = await freshWorkClient(ALICE(), "restorenever");
  await assertPair("CLR28", "nothing_to_restore", () => restoreWorkEgress(ALICE(), { client: never }),
    "restore.foreign: …and neither is restoring a client that never dispatched");
});

test("w631.restore.basis an owner cannot restore an authority the FIRM does not hold", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "restorebasis");
  await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 91n });
  await revokeWorkEgress(ALICE(), { client });
  await deactivateClient(client);

  await assertPair("CLR28", "derived_basis_not_live", () => restoreWorkEgress(ALICE(), { client }),
    "restore.basis: an ARCHIVED client has no derived basis to restore");
  await reactivateClient(client);
  assert.equal((await restoreWorkEgress(ALICE(), { client })).status, "live",
    "restore.basis: …and once the basis is live again, the restore lands");
});

// ===========================================================================================
// 6 · THE DERIVED MINT IS AUDITED — the review's S4. A consent minted in an owner's name with
//     no ledger row is a consent nobody can answer for.
// ===========================================================================================

test("w631.derive.audited the synthesis writes ONE audit row and ONE event, naming the basis", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "derived");
  const auditBefore = await auditCount(FIRM_A(), "derive_client_egress_purpose");

  const v = await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 101n });
  assert.equal(v.verdict, "granted");

  assert.equal(await auditCount(FIRM_A(), "derive_client_egress_purpose"), auditBefore + 1,
    "derive.audited: the mint leaves exactly one audit row");
  const events = await eventsOfType(FIRM_A(), "egress.purpose_consent_derived", client);
  assert.equal(events.length, 1, "derive.audited: …and one domain event");
  const consent = await synthesisedConsent(client);
  assert.equal(events[0].payload.consent_id, consent.id);
  assert.equal(events[0].payload.legal_acceptance_id, consent.legal_acceptance_id,
    "derive.audited: the event NAMES the legal acceptance the authority was derived from");
  assert.equal(events[0].client_id, client, "derive.audited: …and the client");
  assert.equal(events[0].actor, consent.granted_by,
    "derive.audited: …and the owner in whose name it was minted");
  assert.ok(Number(events[0].payload.dpa_version) >= 1);

  // A SECOND dispatch for the same client mints nothing, so it says nothing either.
  await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 102n });
  assert.equal(await auditCount(FIRM_A(), "derive_client_egress_purpose"), auditBefore + 1,
    "derive.audited: the mint is once per (firm, client), and so is its ledger row");
  assert.equal((await eventsOfType(FIRM_A(), "egress.purpose_consent_derived", client)).length, 1);
});

// ===========================================================================================
// 7 · A WITHDRAWAL IS RETROACTIVE TO AN ALREADY-CONSUMED DISPATCH — the review's S5.
// ===========================================================================================

test("w631.write.withdrawn_after_consume a revoke AFTER the consume still stops the books moving", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "afterconsume");
  const a = await armedUnauthorised({ client });
  const { consumed } = await authoriseWorkRun({ task: a.task_id, runId: a.runId });
  assert.equal(consumed.verdict, "granted",
    "write.withdrawn_after_consume: mandatory setup — the dispatch was authorised and SPENT");

  await revokeWorkEgress(ALICE(), { client });

  const entriesBefore = await entryCount(client);
  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a),
    "write.withdrawn_after_consume: authority must be LIVE when the books move, not merely when the model was called");
  assert.equal(await entryCount(client), entriesBefore, "write.withdrawn_after_consume: no entry");
  const reserved = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn='record_journal_entry' and op_key=$1",
    [a.logical_op_id]);
  assert.equal(reserved.rows[0].n, 0,
    "write.withdrawn_after_consume: the identity is UNSPENT — the refusal is before _reserve_op");

  // The consumed authorization is untouched — 0020 permits ONE terminal transition, so the gate
  // reads the CONSENT behind it rather than re-terminating the row.
  const auth = (await authorizationsFor(client))[0];
  assert.ok(auth.consumed_at, "write.withdrawn_after_consume: …still consumed…");
  assert.equal(auth.invalidated_at, null, "write.withdrawn_after_consume: …and NOT invalidated");

  // THE WAY BACK. A restore plus a NEW run posts; the OLD run stays refused, because no later act
  // re-grants a withdrawn authority retroactively either.
  await restoreWorkEgress(ALICE(), { client });
  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a),
    "write.withdrawn_after_consume: the withdrawn run stays refused after the restore");
  const retry = await armedUnauthorised({ client });
  assert.equal((await authoriseWorkRun({ task: retry.task_id, runId: retry.runId })).consumed.verdict,
    "granted");
  assert.equal((await postRaw(retry)).posted, true,
    "write.withdrawn_after_consume: …and a NEW run, dispatched under the restored consent, posts");
});

// ===========================================================================================
// 8 · THE TRACE RELATION'S OWN WALLS — the review's S2, S3, N2 and N3.
// ===========================================================================================

test("w631.trace.no_table_read NO human reads the relation; the DOOR is the only way in", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  await recordWorkExecutionTrace({
    task: a.task_id, runId: a.runId, seq: 1, phase: "model_call",
    capabilityId: "accounting_work.model_segment", modelId: "gpt-5.6-terra",
    refusal: { code: "CLR13", reason: "egress_not_authorized" }, outcome: "refused" });

  for (const [who, label] of [[world.users.carol, "a viewer"], [BOB(), "a bookkeeper"],
                              [ALICE(), "the owner"]]) {
    await assertRaises(PG.insufficientPrivilege, () => readTraceTableAs(who, a.work_id),
      `trace.no_table_read: ${label} cannot read clara.work_execution_traces off the table — PostgREST serves this schema`);
  }
  await assertRaises(CLR.authz, () => getWorkExecutionTrace(world.users.carol, { work: a.work_id }),
    "trace.no_table_read: and the DOOR keeps its bookkeeper floor for the viewer");
  const rows = await getWorkExecutionTrace(BOB(), { work: a.work_id });
  assert.equal(rows.length, 1, "trace.no_table_read: …while a bookkeeper gets the rows through it");
  assert.equal(rows[0].model_id, "gpt-5.6-terra");
});

test("w631.trace.grammar a payload-shaped value is REFUSED by field, never stored", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  // Assembled from pieces for the same reason the runtime battery does it: `scripts/check-leaks.mjs`
  // cannot tell a positive-control fixture from a real leaked key. The VALUES are byte-identical.
  const j = (...p) => p.join("");
  const PII = {
    nric: j("880214", "-08-", "5531"),
    bank: j("5141", "8822", "9310", "7742"),
    email: j("siti.rahmah", "@", "example.com.my"),
    phone: j("+60 ", "12-345 ", "6789"),
    jwt: j("ey", "JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", ".", "ey", "JzdWIiOiIxMjM0NSJ9"),
    bearer: j("Bearer ", "abcdefghijklmnopqrstuvwxyz123456"),
    dsn: j("postgres", "://", "clara", ":", "hunter2", "@db.internal:5432/books"),
    apiKey: j("sk", "-proj-", "ZH4kQ9maRuntimeSecretValue1234"),
  };
  const base = { task: a.task_id, runId: a.runId, seq: 1, phase: "model_call", outcome: "ok" };
  let seq = 1;
  const planted = [];
  for (const [name, literal] of Object.entries(PII)) {
    planted.push(
      [`capability_id/${name}`, { capabilityId: literal }],
      [`registry_version/${name}`, { registryVersion: literal }],
      [`bundle_id/${name}`, { bundleId: literal }],
      [`instructions_id/${name}`, { instructionsId: literal }],
      [`tools_id/${name}`, { toolsId: literal }],
      [`model_id/${name}`, { modelId: literal }],
      [`skills/${name}`, { skills: [literal] }],
      [`observed/${name}`, { observedRevisions: { books_version: literal } }],
      [`refusal.message/${name}`, { refusal: { code: "CLR13", message: literal } }],
      [`refusal.detail/${name}`, { refusal: { code: "CLR13", detail: literal } }],
    );
  }
  for (const [label, over] of planted) {
    seq += 1;
    await assertPair(CLR.badRequest, "invalid_trace",
      () => recordWorkExecutionTrace({ ...base, seq, ...over }),
      `trace.grammar: ${label} must be REFUSED, never stored`);
  }
  // A key outside the refusal's CLOSED shape is refused too — that is the payload slot the
  // "no payload column" claim was really about.
  await assertPair(CLR.badRequest, "invalid_trace",
    () => recordWorkExecutionTrace({ ...base, seq: 900, refusal: { transcript: "the whole run" } }),
    "trace.grammar: an unknown refusal key is a payload slot");
  assert.equal(await traceCount(a.work_id), 0, "trace.grammar: NOTHING was written");

  // …and the values the runtime actually sends are ADMITTED, or the grammar would drop every
  // diagnostic instead of every secret.
  const id = await recordWorkExecutionTrace({
    ...base, seq: 1,
    capabilityId: "accounting_work.model_segment", registryVersion: "clara-capability-registry/v1",
    bundleId: "clara-work/v3", bundleDigest: "a".repeat(64),
    instructionsId: "clara-work-instructions/v3", skills: ["journal-entry/v3"],
    toolsId: "clara-work-tools/v3", modelId: "gpt-5.6-terra",
    observedRevisions: { books_version: "2026-09-01", basis_digest: "b".repeat(64) },
    refusal: { code: "CLR13", reason: "egress_not_authorized", message: "nothing was sent", recoverable: true },
  });
  assert.ok(id, "trace.grammar: the ordinary row lands");
});

test("w631.trace.no_lock_wait a trace insert does NOT wait behind a posting lock", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  // The review measured the first cut BLOCKED 4001 ms here and was then cancelled — silently,
  // because every caller in the frozen closure swallows a trace failure. The relation carries no
  // foreign key to clara.accounting_work precisely so this cell can pass.
  const started = Date.now();
  const id = await withWorkRowLocked(a.work_id, () => recordWorkExecutionTraceBounded({
    task: a.task_id, runId: a.runId, seq: 1, phase: "dispatch",
    capabilityId: "accounting_work.model_segment", outcome: "ok" }, { timeoutMs: 4000 }));
  const elapsed = Date.now() - started;
  assert.ok(id, "trace.no_lock_wait: the row was written while another connection held the Work");
  assert.ok(elapsed < 3000,
    `trace.no_lock_wait: it took ${elapsed} ms — a wait means an FK is taking FOR KEY SHARE again`);
  noteLane(`trace.no_lock_wait: insert completed in ${elapsed} ms under a held Work lock`);
});

test("w631.trace.prune_logged the retention sweep leaves a row on 0006's own ledger", async (t) => {
  if (await gateEgress(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  const old = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString();
  await recordWorkExecutionTrace({
    task: a.task_id, runId: a.runId, seq: 1, phase: "dispatch",
    capabilityId: "accounting_work.model_segment", outcome: "ok", startedAt: old });

  const before = (await tracePruneLog()).length;
  const out = await pruneWorkExecutionTraces({
    before: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(), limit: 1000 });
  assert.ok(Number(out.traces_deleted) >= 1, "trace.prune_logged: the sweep pruned the old row");

  const log = await tracePruneLog();
  assert.equal(log.length, before + 1, "trace.prune_logged: …and left EXACTLY one ledger row");
  assert.equal(log[0].relation, "work_execution_traces",
    "trace.prune_logged: named to the relation, beside 0006's own trace_spans rows");
  assert.ok(Number(log[0].spans_deleted) >= 1);
});


// ===========================================================================================
// 9 · #811 — THE TWO SHAPE BOUNDS 0195 LEFT OPEN. Both fields were bounded in LENGTH and not in
//     SHAPE: a numeric `observed_revisions` value had no digit/magnitude test at all, and the
//     `run` grammar carried no long-digit clause. Both close AT THE DOOR (migration
//     `work_trace_shape_bounds`), with the relation's own CHECKs tightening in step because they
//     call the same two predicates.
// ===========================================================================================

test("w811.trace.revision_bounds a numeric observed revision is bounded in MAGNITUDE and in SCALE, and an ordinary small integer still lands", async (t) => {
  if (await gateTraceShape(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  const base = { task: a.task_id, runId: a.runId, seq: 1, phase: "model_call", outcome: "ok" };
  // Assembled from pieces, like the trace.grammar cell above, so `scripts/check-leaks.mjs` cannot
  // read an account-run-shaped positive control as a committed secret. The VALUE is the number
  // 5141882293107742 — the same 16-digit account run the review stored through this door.
  const j = (...p) => p.join("");
  const accountRun = Number(j("5141", "8822", "9310", "7742"));
  assert.equal(String(accountRun), j("5141", "8822", "9310", "7742"),
    "revision_bounds: mandatory setup — the literal is the 16-digit account run, exactly");

  const magnitude = await assertPair(CLR.badRequest, "invalid_trace",
    () => recordWorkExecutionTrace({ ...base, seq: 2, observedRevisions: { books_version: accountRun } }),
    "revision_bounds: an account-run-shaped NUMBER is refused, not stored verbatim");
  assert.equal(magnitude.detail.field, "p_observed_revisions",
    "revision_bounds: …and the refusal NAMES the field, as every other grammar refusal does");

  // The same magnitude written in EXPONENT notation. A digit-count-only test would miss this one,
  // which is why the bound is on magnitude and scale rather than on the rendered digit run.
  await assertPair(CLR.badRequest, "invalid_trace",
    () => recordWorkExecutionTrace({ ...base, seq: 3, observedRevisions: { books_version: 1e30 } }),
    "revision_bounds: exponent notation is the same magnitude and is refused the same way");
  // …and a value too fine-grained to be a revision counter is refused on SCALE.
  await assertPair(CLR.badRequest, "invalid_trace",
    () => recordWorkExecutionTrace({ ...base, seq: 4, observedRevisions: { books_version: 1.5e-20 } }),
    "revision_bounds: a 21-place fraction is not a revision either");

  assert.equal(await traceCount(a.work_id), 0, "revision_bounds: NOTHING was written");

  // The positive control: an ordinary small integer revision is what this field is FOR.
  const id = await recordWorkExecutionTrace({
    ...base, seq: 5, capabilityId: "accounting_work.model_segment",
    observedRevisions: { books_version: 5, chart_revision: 41, knowledge_version: 0 } });
  assert.ok(id, "revision_bounds: an ordinary small integer revision still lands");
  assert.equal(await traceCount(a.work_id), 1);
});

test("w811.trace.run_grammar a long-digit run id is REFUSED, and the run-id shape the deployed WDK mints is ADMITTED", async (t) => {
  if (await gateTraceShape(t)) return;
  await acceptLegalNow(ALICE());
  const a = await armedUnauthorised();
  const base = { task: a.task_id, seq: 1, phase: "dispatch", outcome: "ok",
    capabilityId: "accounting_work.model_segment" };
  const j = (...p) => p.join("");

  const refused = await assertPair(CLR.badRequest, "invalid_trace",
    () => recordWorkExecutionTrace({ ...base, seq: 2, runId: j("run-", "5141", "8822", "9310", "7742") }),
    "run_grammar: a run-<16 digits> id is a payload slot, and the door now refuses it");
  assert.equal(refused.detail.field, "p_run",
    "run_grammar: …naming p_run, exactly as every other field grammar names its field");

  // The shape the DEPLOYED Workflow DevKit actually mints: `wrun_` + a 26-character Crockford
  // base32 ULID (`workflow` 4.8.4 / @workflow/core 4.8.4,
  // node_modules/.pnpm/@workflow+core@4.8.4_ws@8.21.0/node_modules/@workflow/core/dist/runtime/start.js:121,
  // `const runId = \`wrun_${ulid()}\``). This literal is one of the estate's own captured run ids
  // (docs/plan/active/prototypes/agent-harness/runtime-boundary-pass.json).
  const wdk = "wrun_01M20WGD9ETKK6RWCBA8CWG1GE";
  assert.ok(/^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/.test(wdk),
    "run_grammar: mandatory setup — the literal IS the WDK's minted shape");
  assert.ok(await recordWorkExecutionTrace({ ...base, seq: 3, runId: wdk }),
    "run_grammar: a WDK-minted run id is admitted");

  // …and so are the other two shapes this relation has ever seen: 0195's own documented
  // `run_<uuid>` and the battery's `<tag>_<base36>_<base36>_<8 hex>` fixture id.
  assert.ok(await recordWorkExecutionTrace({
    ...base, seq: 4, runId: "run_9dcf64de-8ec6-47d7-85fb-e51f193fc557" }),
    "run_grammar: 0195's documented run_<uuid> shape is still admitted");
  assert.ok(await recordWorkExecutionTrace({ ...base, seq: 5, runId: a.runId }),
    "run_grammar: …and so is the battery's own fixture run id");
  assert.equal(await traceCount(a.work_id), 3, "run_grammar: exactly the three admitted rows landed");
});


// ===========================================================================================
// 10 · #812 — THE WAY BACK ON AFTER A **DEACTIVATION**, measured rather than assumed.
//
//     0195 gave `revoke_client_egress_purpose` a restore door. `deactivate_client_egress_purpose`
//     never got one, and nothing in this battery had ever deactivated an `accounting_work`
//     ACTIVATION at all (its `deactivateClient` helper archives the CLIENT — a different
//     withdrawal with a different recovery). These cells measure the round trip first, and pin
//     the invariants that hold whichever way it falls.
// ===========================================================================================

test("w812.reactivate.round_trip deactivate → unknown → activate NAMING THE SURVIVING CONSENT → granted, and the consent is never re-minted", async (t) => {
  if (await gateEgressRecovery(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "reactivate");
  const a = await armedUnauthorised({ client });
  const { consumed } = await authoriseWorkRun({ task: a.task_id, runId: a.runId });
  assert.equal(consumed.verdict, "granted",
    "reactivate.round_trip: mandatory setup — the dispatch was authorised and SPENT before the withdrawal");

  const before = await consentRows(client);
  assert.equal(before.length, 1, "reactivate.round_trip: ONE derived consent, self-minted by the dispatch");
  const surviving = before[0].id;

  const out = await deactivateWorkEgressPurpose(ALICE(), { client });
  assert.equal(out.status, "deactivated");
  assert.deepEqual(await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 8101n }), UNKNOWN,
    "reactivate.round_trip: with the activation deactivated the next dispatch answers unknown");
  assert.equal((await consentRows(client))[0].revoked_at, null,
    "reactivate.round_trip: …and the CONSENT survived — deactivation never revokes it");

  // THE MEASUREMENT: 0195's own activate door, naming the consent that survived.
  const act = await activateWorkEgressPurpose(ALICE(), { client, consent: surviving });
  assert.equal(act.status, "active", "reactivate.round_trip: the activate door admits the surviving consent");
  assert.equal(act.consent_id, surviving, "reactivate.round_trip: …the SAME consent, not a fresh one");
  assert.equal((await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 8102n })).verdict,
    "granted", "reactivate.round_trip: and the next dispatch grants again — deactivate → activate ROUND-TRIPS");

  // THE INVARIANTS, which hold whichever way the measurement fell.
  const after = await consentRows(client);
  assert.equal(after.length, 1, "reactivate.round_trip: the consent count stays at 1 — nothing was re-minted");
  assert.equal(after[0].id, surviving);
  const acts = await activationRows(client);
  assert.equal(acts.length, 2, "reactivate.round_trip: a FRESH activation row, beside the old one");
  assert.ok(acts[0].deactivated_at, "reactivate.round_trip: …the deactivated row KEEPS its instant…");
  assert.equal(acts[0].deactivation_reason, "#812 rig: paused", "reactivate.round_trip: …and its reason, as history");
  assert.equal(acts[1].deactivated_at, null, "reactivate.round_trip: …while the new one is live");
});

test("w812.reactivate.retroactive an authorization consumed BEFORE the deactivation stays refused at the posting core after the way back on", async (t) => {
  if (await gateEgressRecovery(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "reactretro");
  const a = await armedUnauthorised({ client });
  assert.equal((await authoriseWorkRun({ task: a.task_id, runId: a.runId })).consumed.verdict, "granted",
    "reactivate.retroactive: mandatory setup — the dispatch was authorised and SPENT");

  await deactivateWorkEgressPurpose(ALICE(), { client });

  const entriesBefore = await entryCount(client);
  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a),
    "reactivate.retroactive: authority must be LIVE when the books move — the two joins behind the consumed authorization read the ACTIVATION too");
  assert.equal(await entryCount(client), entriesBefore, "reactivate.retroactive: no entry");
  const reserved = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn='record_journal_entry' and op_key=$1",
    [a.logical_op_id]);
  assert.equal(reserved.rows[0].n, 0,
    "reactivate.retroactive: the identity is UNSPENT — the refusal is before _reserve_op");

  // The consumed authorization is untouched: 0020's ck_…_one_terminal admits ONE terminal
  // transition, so the gate reads the ACTIVATION behind the row rather than re-terminating it.
  const auth = (await authorizationsFor(client))[0];
  assert.ok(auth.consumed_at, "reactivate.retroactive: …still consumed…");
  assert.equal(auth.invalidated_at, null, "reactivate.retroactive: …and NOT invalidated");

  await reactivateWorkEgress(ALICE(), { client });
  await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized, () => postRaw(a),
    "reactivate.retroactive: the withdrawn run STAYS refused — recovery restores future dispatches only");
  const retry = await armedUnauthorised({ client });
  assert.equal((await authoriseWorkRun({ task: retry.task_id, runId: retry.runId })).consumed.verdict,
    "granted");
  assert.equal((await postRaw(retry)).posted, true,
    "reactivate.retroactive: …and a NEW run, dispatched under the re-activated pair, posts");
});

test("w812.reactivate.door the recovery door needs NO consent id, because no lawful read exposes one", async (t) => {
  if (await gateEgressRecovery(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "reactdoor");
  assert.equal((await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 8201n })).verdict, "granted");

  // WHY THE DOOR EXISTS. `activate_client_egress_purpose` requires the consent id, and
  // `clara.client_egress_purpose_consents` is FORCE RLS with a clara_fn_owner-only policy and no
  // table grant (0020) — a firm owner cannot read the id the door would need.
  for (const [who, label] of [[ALICE(), "the owner"], [BOB(), "a bookkeeper"]]) {
    await assertRaises(PG.insufficientPrivilege,
      () => humanQuery(who, "select id from clara.client_egress_purpose_consents where client_id=$1", [client]),
      `reactivate.door: ${label} cannot read the consent id off the relation`);
  }

  const surviving = (await consentRows(client))[0].id;
  await deactivateWorkEgressPurpose(ALICE(), { client, reason: "#812 rig: door" });
  assert.deepEqual(await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 8202n }), UNKNOWN);

  const out = await reactivateWorkEgress(ALICE(), { client });
  assert.equal(out.status, "active", "reactivate.door: the recovery door re-activates");
  assert.equal(out.consent_id, surviving,
    "reactivate.door: …resolving the SURVIVING consent internally, never minting one");
  assert.equal((await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 8203n })).verdict,
    "granted", "reactivate.door: …and the next dispatch grants");
  assert.equal((await consentRows(client)).length, 1, "reactivate.door: still exactly one consent");

  // A SECOND press over a live activation refuses with the activate door's own typed pair, so the
  // door adds a consent lookup and nothing else.
  await assertPair("CLR28", "duplicate_live", () => reactivateWorkEgress(ALICE(), { client }),
    "reactivate.door: re-activating what is already live is a refusal, not a second activation");
});

test("w812.reactivate.floor re-activating is an OWNER act, for the DERIVED purpose, and only over a DEACTIVATION", async (t) => {
  if (await gateEgressRecovery(t)) return;
  await acceptLegalNow(ALICE());
  const client = await freshWorkClient(ALICE(), "reactfloor");
  assert.equal((await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 8301n })).verdict, "granted");
  await deactivateWorkEgressPurpose(ALICE(), { client, reason: "#812 rig: floor" });

  await assertRaises(CLR.authz, () => reactivateWorkEgress(world.users.carol, { client }),
    "reactivate.floor: a VIEWER cannot restore model egress");
  await assertRaises(CLR.authz, () => reactivateWorkEgress(BOB(), { client }),
    "reactivate.floor: …nor a bookkeeper — a human took the authority away, only an owner gives it back");
  await assertPair(CLR.badRequest, "purpose_not_reactivatable",
    () => reactivateWorkEgress(ALICE(), { client, purpose: "document_processing" }),
    "reactivate.floor: the five document-evidenced purposes keep their own activate door");
  await assertRaises(CLR.notFound, () => reactivateWorkEgress(ALICE(), { client: B1() }),
    "reactivate.floor: another firm's client is NOT FOUND — never an existence oracle");
  await assertRaises(CLR.notFound,
    () => reactivateWorkEgress(ALICE(), { client: "00000000-0000-4000-8000-000000000000" }),
    "reactivate.floor: …and an absent client answers the same code");
  assert.deepEqual(await prepareEgressDispatch({ firm: FIRM_A(), client, eventSeq: 8302n }), UNKNOWN,
    "reactivate.floor: none of those refusals re-activated anything");

  // …and the two states that are not a deactivation.
  const never = await freshWorkClient(ALICE(), "reactnever");
  await assertPair("CLR28", "no_consent", () => reactivateWorkEgress(ALICE(), { client: never }),
    "reactivate.floor: a client that never dispatched has no consent to re-activate over");
  const live = await freshWorkClient(ALICE(), "reactlive");
  await prepareEgressDispatch({ firm: FIRM_A(), client: live, eventSeq: 8303n });
  await assertPair("CLR28", "nothing_to_reactivate", () => reactivateWorkEgress(ALICE(), { client: live }),
    "reactivate.floor: …and one that was never deactivated is a refusal, not a second activation");

  // A REVOKED consent is restore's business, not this door's: revoke withdraws the CONSENT, and
  // this door only ever re-activates over a surviving one.
  const revoked = await freshWorkClient(ALICE(), "reactrevoked");
  await prepareEgressDispatch({ firm: FIRM_A(), client: revoked, eventSeq: 8304n });
  await revokeWorkEgress(ALICE(), { client: revoked });
  await assertPair("CLR28", "no_consent", () => reactivateWorkEgress(ALICE(), { client: revoked }),
    "reactivate.floor: a REVOKE is reversed by restore_client_egress_purpose, never by this door");
  assert.equal((await restoreWorkEgress(ALICE(), { client: revoked })).status, "live",
    "reactivate.floor: …and restore is still the door that reverses it");
});
