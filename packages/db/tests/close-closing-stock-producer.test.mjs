// #643 — THE CLOSING-STOCK GATE FINALLY HAS A PRODUCER.
//
// Frontier-gated on the `periodic_adjustments$` stem (and on 0056's own close model), so
// `db-slice-frontiers` legs pinned below either migration skip cleanly.
//
// WHAT THIS FILE IS ABOUT. `clara._close_gate_closing_stock` has measured
// `journal_entries.flags ? 'closing_stock'` since 0056 and has answered `no_producer_verb: true`
// beside every measurement, because NOTHING in the estate ever wrote that flag. Its own comment
// said what to do about it: "Drop this key when the producer verb ships." #643 ships the verb, so
// this battery proves three things a reader of the migration alone could not:
//
//   1. a goods trader with NO marker measures `fail` and NO LONGER CONFESSES the missing verb;
//   2. a committed periodic stock adjustment makes it measure `pass` and the answer NAMES the
//      `clara.periodic_adjustments` row, its Work and its entry — so a close reviewer opens the
//      particulars instead of trusting a boolean (C-29: do not simulate missing stock with a
//      balancing journal);
//   3. the `measured_digest` MOVES, so an attestation taken against the old answer stops being
//      effective. That is intended and user-visible: the firm accepted an ABSENT INSTRUMENT, and
//      the instrument now exists.
//
// It is a SEPARATE FILE from `periodic-adjustment.test.mjs` because it needs the close model's
// own world (a closeable fiscal year, a close run, an attestation) rather than the Work lane's.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount,
  claimWorkRun, mintClientObo, wakeRecordJournalEntry, rootQuery, opk,
  gatePa, PA_PURPOSE, PACHART, ensurePaChart, stockAdjustment, basisForStock,
  admitPeriodicAdjustmentWork, adjustmentRow,
} from "./periodic-adjustment-fixtures.mjs";
import {
  has0056, cleanCloseableFY, recordClientFact, beginClose, attestClose, abandonClose,
  getCloseReadiness,
} from "./x56-fixtures.mjs";
import { draftEntryV3, approveEntry } from "./s6-helpers.mjs";
import { freshResolution } from "./rig-fixtures.mjs";
import { latestGates } from "./er9-corpus-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { reverseEntry } from "./periodic-adjustment-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("close-closing-stock-producer");
  printSkipCount("close-closing-stock-producer");
  await endPool();
});

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const FIRM_A = () => world.firms.A;

/** BOTH frontiers: 0056's close model and #643's producer. */
async function gateBoth(t) {
  if (!(await has0056())) {
    markSkip();
    t.skip("0056 close model absent");
    return true;
  }
  return gatePa(t);
}

/** The gate's answer, MEASURED FRESH against the live world — the same call
 *  `clara.begin_close` makes, and `md5(measured::text)` is 0056:1470's own digest formula. The
 *  function is ungranted to every application role, so this is a root probe by design. */
async function measureNow(client, fy) {
  const r = await rootQuery(
    `select m.m as measured, md5((m.m -> 'measured')::text) as digest
       from clara._measure_one_gate('closing_stock_present', $1::uuid, $2::uuid) as m(m)`,
    [client, fy]);
  return { outer: r.rows[0].measured, measured: r.rows[0].measured.measured, digest: r.rows[0].digest };
}

test("cs.gate.flips a goods trader's closing-stock gate fails without confessing a missing verb, passes once an adjustment is committed, and moves its digest", async (t) => {
  if (await gateBoth(t)) return;

  // --- a goods trader with a closeable 2026 ------------------------------------------------
  const fx = await cleanCloseableFY(ALICE(), { tag: "csprod", prepSub: BOB(), startsOn: "2026-01-01" });
  await recordClientFact(ALICE(), {
    client: fx.client, factKey: "trade_nature", factValue: "goods_trading",
    basis: "#643 rig: a goods trader by fixture design", basisKind: "owner_instruction",
  });
  await ensurePaChart(ALICE(), fx.client, "csprod");

  // --- 1 · NO MARKER: fail, and the confession is GONE -------------------------------------
  const begun1 = await beginClose(ALICE(), { fy: fx.fy });
  const gates1 = await latestGates(begun1.close_run_id);
  const g1 = gates1.get("closing_stock_present");
  assert.equal(g1.state, "fail", "gate.flips: a goods trader with no closing-stock entry fails");
  assert.equal(g1.measured.closing_stock_entry_present, false);
  assert.equal(Object.prototype.hasOwnProperty.call(g1.measured, "no_producer_verb"), false,
    "gate.flips: the gate no longer says there is no producer verb — one exists, so the key is gone "
    + "and an attestation against this gate is once again a judgement about STOCK");
  assert.equal(g1.measured.closing_stock_adjustment_id, null,
    "gate.flips: …and it names no producer, because there is none yet");
  assert.equal(Object.prototype.hasOwnProperty.call(g1.measured, "closing_stock_posted_on"), true,
    "gate.flips: the marker's posting date is a KEY of the answer even when there is no marker — the "
    + "gate's shape does not change with its state, or the digest would move for two reasons at once");
  assert.equal(g1.measured.closing_stock_posted_on, null);
  const digestBefore = g1.measured_digest;

  // --- 2 · the firm ACCEPTS the exception, binding to THAT answer ---------------------------
  await attestClose(ALICE(), {
    closeRun: begun1.close_run_id, checkKey: "closing_stock_present",
    reason: "#643 rig: the stocktake sheet is with the client; accepted for this close",
  });
  const ready1 = await getCloseReadiness(ALICE(), { client: fx.client, fy: fx.fy });
  const readGate1 = ready1.gates.find((g) => g.check_key === "closing_stock_present");
  assert.equal(readGate1.attested, true,
    "gate.flips: mandatory setup — the attestation is EFFECTIVE against the answer it was taken on");
  const boundDigest = (await rootQuery(
    `select gr.measured_digest from clara.close_attestations a
       join clara.close_gate_results gr on gr.id = a.gate_result_id
      where a.close_run_id = $1 and a.check_key = 'closing_stock_present' and a.superseded_at is null`,
    [begun1.close_run_id])).rows[0].measured_digest;
  assert.equal(boundDigest, digestBefore, "gate.flips: …and it is bound to that exact digest");
  await abandonClose(ALICE(), {
    closeRun: begun1.close_run_id,
    reason: "#643 rig: abandoning so the real stocktake can be recorded",
  });

  // --- 3 · the PRODUCER runs -----------------------------------------------------------------
  const adj = stockAdjustment({
    periodStart: "2026-01-01", periodEnd: fx.endsOn, countedAt: fx.endsOn,
    openingCents: 300000, closingCents: 480000,
  });
  const admitted = await admitPeriodicAdjustmentWork({
    client: fx.client, author: ALICE(), purpose: PA_PURPOSE.stock, adjustment: adj,
    basis: basisForStock(adj),
  });
  await claimWorkRun({ task: admitted.task_id, runId: opk("cs-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client: fx.client });
  const posted = await wakeRecordJournalEntry(cred.secret, {
    client: fx.client, work: admitted.work_id, logicalOpId: admitted.logical_op_id,
    basis: basisForStock(adj),
  });
  assert.equal(posted.posted, true, "gate.flips: mandatory setup — the adjustment committed");
  const row = await adjustmentRow(posted.adjustment_id);
  assert.equal(String(row.amount_cents), "180000");

  // --- 4 · the gate PASSES and NAMES the producer --------------------------------------------
  const fresh = await measureNow(fx.client, fx.fy);
  assert.equal(fresh.outer.state, "pass", "gate.flips: the committed adjustment satisfies the gate");
  assert.equal(fresh.measured.closing_stock_entry_present, true);
  assert.equal(fresh.measured.closing_stock_entry_id, posted.entry_id,
    "gate.flips: the answer names the ENTRY it measured");
  assert.equal(fresh.measured.closing_stock_adjustment_id, posted.adjustment_id,
    "gate.flips: …the clara.periodic_adjustments row that produced it…");
  assert.equal(fresh.measured.closing_stock_work_id, admitted.work_id,
    "gate.flips: …and the Work that authorised it — not an anonymous balancing journal");
  assert.equal(fresh.measured.closing_stock_amount_cents, 180000);
  // WHEN, TOO. `je.posting_date` was selected into the gate's row and never emitted (adversarial
  // migration-safety review, N2); a close reviewer reads WHICH day inside the year the stock was
  // declared without opening anything, and it costs no extra read.
  assert.equal(fresh.measured.closing_stock_posted_on, fx.endsOn,
    "gate.flips: …and the day the marker entry was posted");
  assert.equal(Object.prototype.hasOwnProperty.call(fresh.measured, "no_producer_verb"), false);

  // --- 5 · the DIGEST MOVED, so the interim attestation is no longer effective ---------------
  assert.notEqual(fresh.digest, digestBefore,
    "gate.flips: the measured digest MOVED — an attestation of the missing instrument cannot "
    + "silently carry over to a gate that can now be satisfied for real");
  assert.notEqual(boundDigest, fresh.digest,
    "gate.flips: …and the standing attestation is bound to a digest the gate no longer measures");

  // …and a fresh close run stores that same passing answer.
  const begun2 = await beginClose(ALICE(), { fy: fx.fy });
  const g2 = (await latestGates(begun2.close_run_id)).get("closing_stock_present");
  assert.equal(g2.state, "pass");
  assert.equal(g2.measured.closing_stock_adjustment_id, posted.adjustment_id);
  assert.equal(g2.measured_digest, fresh.digest,
    "gate.flips: the stored digest is the one measured directly — one formula, one answer");
  await abandonClose(ALICE(), { closeRun: begun2.close_run_id, reason: "#643 rig: done measuring" });
});

test("cs.gate.bare-marker a pre-#643 marker entry still passes the gate and simply names no producer", async (t) => {
  if (await gateBoth(t)) return;
  const fx = await cleanCloseableFY(ALICE(), { tag: "csbare", prepSub: BOB(), startsOn: "2026-01-01" });
  await recordClientFact(ALICE(), {
    client: fx.client, factKey: "trade_nature", factValue: "goods_trading",
    basis: "#643 rig: a goods trader by fixture design", basisKind: "owner_instruction",
  });
  await ensurePaChart(ALICE(), fx.client, "csbare");

  // A MARKER WITH NO ADJUSTMENT ROW — the shape every entry planted before this migration has.
  // The gate's question is "does this goods trader have a closing-stock entry in the year", and
  // widening it to "did #643's door write it" would have retroactively failed real books.
  //
  // Planted through the estate's OWN draft door with a root `flags` UPDATE while the entry is
  // still a draft, which is `x56-rest-h.test.mjs`'s proven recipe: `flags` is in
  // `_tf_entry_immutable`'s draft→draft allowed set, and `_draft_entry_core` has no passthrough
  // for it.
  const draft = await draftEntryV3(BOB(), {
    client: fx.client,
    resolution: await freshResolution(BOB(), fx.client, { subjectKind: "manual", subjectId: null }),
    memo: "#643 rig: a bare pre-existing marker", postingDate: "2026-06-30",
    lines: [
      { account_code: PACHART.inventory, debit_cents: 1000, credit_cents: 0, description: "dr" },
      { account_code: PACHART.cost, debit_cents: 0, credit_cents: 1000, description: "cr" },
    ],
    opKey: opk("csbare-draft"),
  });
  await rootQuery(
    "update clara.journal_entries set flags = jsonb_build_object('closing_stock', true) where id=$1 and status='draft'",
    [draft.entry_id]);
  await approveEntry(BOB(), {
    entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("csbare-approve"),
  });
  const entryId = draft.entry_id;

  const fresh = await measureNow(fx.client, fx.fy);
  assert.equal(fresh.outer.state, "pass", "bare-marker: the marker contract is unchanged");
  assert.equal(fresh.measured.closing_stock_entry_id, entryId);
  assert.equal(fresh.measured.closing_stock_adjustment_id, null,
    "bare-marker: …and the answer honestly names NO producer rather than inventing one");
  assert.equal(fresh.measured.closing_stock_work_id, null);
});

test("cs.gate.services a service business still auto-passes without reaching the marker check", async (t) => {
  if (await gateBoth(t)) return;
  const fx = await cleanCloseableFY(ALICE(), { tag: "csserv", prepSub: BOB(), startsOn: "2026-01-01" });
  const fresh = await measureNow(fx.client, fx.fy);
  assert.equal(fresh.outer.state, "pass");
  assert.equal(fresh.measured.reason, "not_goods_trading",
    "services: 0056's own short-circuit is untouched — the recut added a producer, it did not "
    + "widen who the gate applies to");
  assert.equal(Object.prototype.hasOwnProperty.call(fresh.measured, "closing_stock_entry_present"), false);
});

test("cs.gate.reversal a reversed adjustment returns the gate to fail — a reversed original is not a standing declaration", async (t) => {
  if (await gateBoth(t)) return;
  const fx = await cleanCloseableFY(ALICE(), { tag: "csrev", prepSub: BOB(), startsOn: "2026-01-01" });
  await recordClientFact(ALICE(), {
    client: fx.client, factKey: "trade_nature", factValue: "goods_trading",
    basis: "#643 rig: a goods trader by fixture design", basisKind: "owner_instruction",
  });
  await ensurePaChart(ALICE(), fx.client, "csrev");
  const adj = stockAdjustment({ periodStart: "2026-01-01", periodEnd: fx.endsOn, countedAt: fx.endsOn });
  const admitted = await admitPeriodicAdjustmentWork({
    client: fx.client, author: ALICE(), purpose: PA_PURPOSE.stock, adjustment: adj,
    basis: basisForStock(adj),
  });
  await claimWorkRun({ task: admitted.task_id, runId: opk("csrev-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client: fx.client });
  const posted = await wakeRecordJournalEntry(cred.secret, {
    client: fx.client, work: admitted.work_id, logicalOpId: admitted.logical_op_id,
    basis: basisForStock(adj),
  });
  assert.equal((await measureNow(fx.client, fx.fy)).outer.state, "pass");

  await reverseEntry(ALICE(), {
    entry: posted.entry_id, reason: "#643 rig: the count was taken on the wrong warehouse",
  });
  const after = await measureNow(fx.client, fx.fy);
  assert.equal(after.outer.state, "fail",
    "reversal: the gate returns to FAIL — and the adjustment ROW survives, because a reversal is "
    + "history rather than an erasure");
  assert.equal(after.measured.closing_stock_adjustment_id, null);
  assert.ok(await adjustmentRow(posted.adjustment_id),
    "reversal: the clara.periodic_adjustments row is still there to be corrected");
});
