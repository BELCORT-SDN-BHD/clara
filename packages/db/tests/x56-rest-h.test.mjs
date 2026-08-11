// 0056 (Wave E lane beta, the close model) rig -- PART 11: the Codex R1 batch's
// NEW cells, second half. (e) reopen-receipt settlement (M4: a re-close settles
// the reopen receipt and names it in the new close's snapshot). (f) the
// reversed-marker gate (M3: closing_stock_present counts LIVE entries only --
// a reversed marker returns the gate to fail). (h) the P&L-zero probe (M6:
// verify_close catches a closed-year P&L<->P&L reclass invisible to every other
// identity). (i) fy_end_source presence on both the receipt snapshot and
// get_close_readiness (MIN1).
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG,
// never by reading 0056_wave_e_close_model.sql (live function bodies ARE read
// for MY OWN authorial grounding, per established practice).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, draftEntryV3, approveEntry, freshResolution,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, recordClientFact, forgeClosedPeriodMovement,
  beginClose, attestClose, finalizeClose, abandonClose, reopenFY, verifyClose,
  getCloseReadiness, plainEntry, REVN, EXPN, BANK1, addDaysStr,
} from "./x56-fixtures.mjs";

let ready = false;
let has56 = false;
let world = null;

function skip56(t) {
  if (!ready || !has56) {
    markSkip();
    t.skip("0056 (close model) not present");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x56 rest-h suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-h"); printSkipCount("x56-rest-h"); await endPool(); });

// ===========================================================================
// (e) REOPEN-RECEIPT SETTLEMENT (Codex R1 MAJOR 4): a reopen receipt asserts
// "this year stands open"; the moment a NEW close receipt exists that assertion
// is history, not a live record. A re-close flips the reopen receipt to
// superseded and NAMES it in the new close's snapshot.
// ===========================================================================

test("reopen-receipt settlement: close -> reopen -> re-close flips the reopen receipt to superseded and the new close snapshot names it in superseded_reopen_receipt_ids", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "reopensettle", prepSub: preparer, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  const closed1 = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed1.receipt_id, "mandatory setup: the first close succeeds");

  const reopened = await reopenFY(owner, {
    fy: fx.fy, reason: "x56 reopen-settlement: reopening to prove the re-close settlement",
    correctionTarget: { entry_ids: [closed1.close_entry_id] },
  });
  assert.ok(reopened.reopen_receipt_id, "mandatory setup: the reopen succeeds");
  const reopenReceiptRow = (await rootQuery("select status, kind from clara.close_receipts where id=$1", [reopened.reopen_receipt_id])).rows[0];
  assert.equal(reopenReceiptRow.kind, "reopen");
  assert.equal(reopenReceiptRow.status, "active", "mandatory setup: the reopen receipt is ACTIVE before any re-close");

  // The reopen's own reverse_entry call left a DRAFT mirror (the closing entry is
  // high-stakes, is_year_end propagates) -- approve it so the books are clean and
  // the re-close does not need a fresh attestation for an unrelated reason.
  const mirrorRow = (await rootQuery(
    "select id, revision_token from clara.journal_entries where reversal_of=$1",
    [closed1.close_entry_id],
  )).rows[0];
  assert.ok(mirrorRow, "mandatory setup: the reopen minted a reversal mirror of the closing entry");
  // Maker-checker distinctness (CLR05): the mirror's maker_actor is OWNER (reopen_fiscal_year's
  // own reverse_entry call ran as owner); a high-stakes entry needs a DIFFERENT checker.
  await approveEntry(preparer, { entry: mirrorRow.id, expectedRevision: mirrorRow.revision_token, opKey: opk("x56-reopensettle-mirror-approve") });

  // Segregation (matrix A12) at the RE-close: only owner holds close_and_attest here,
  // so owner must be the closer -- but the mirror posts at TODAY's wall-clock date
  // (measured: reverse_entry does not inherit the original's posting_date), outside
  // the FY's own span, so it never enters finalize_close's "last preparer" query
  // (posting_date between starts_on and ends_on). Left alone, that query's most-
  // recent IN-RANGE touch is the ORIGINAL closing entry's own reversed_by stamp --
  // whose last_human_editor is still owner (unchanged by that stamp), tripping
  // segregation against owner-as-closer no matter who approves the mirror. Post one
  // more small IN-FY entry, by a non-owner actor, after the reopen -- the genuine way
  // this stays clean in practice.
  await plainEntry(preparer, { client: fx.client, debit: BANK1, credit: REVN, cents: 100, postingDate: addDaysStr(fx.startsOn, 200), memo: "x56 reopen-settlement: a small post-reopen IN-FY touch by a non-owner actor" });

  const begun2 = await beginClose(owner, { fy: fx.fy });
  const closed2 = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed2.receipt_id, "the re-close succeeds");
  assert.notEqual(closed2.receipt_id, closed1.receipt_id, "the re-close mints a genuinely NEW receipt");

  const reopenReceiptAfter = (await rootQuery("select status from clara.close_receipts where id=$1", [reopened.reopen_receipt_id])).rows[0];
  assert.equal(reopenReceiptAfter.status, "superseded", "the reopen receipt is SETTLED (flipped superseded) by the re-close");

  const snap2 = (await rootQuery("select snapshot from clara.close_receipts where id=$1", [closed2.receipt_id])).rows[0].snapshot;
  assert.deepEqual(snap2.superseded_reopen_receipt_ids, [reopened.reopen_receipt_id], "the new close's own snapshot names EXACTLY the reopen receipt it settled");
  void begun2;
});

// ===========================================================================
// (f) THE REVERSED-MARKER GATE (Codex R1 MAJOR 3): closing_stock_present counts
// LIVE entries only -- a reversed original (reversed_by set) and its mirror
// (reversal_of set) are neither one a standing declaration. Reversing the ONE
// marker entry returns the gate from pass to fail.
// ===========================================================================

test("reversed-marker: a goods-trading client's closing_stock_present gate reads pass with a live marker entry, and back to fail once that entry is reversed", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "revmarker", prepSub: preparer, startsOn: "2027-01-01" });
  // Override the shared fixture's 'services' trade_nature -- this cell needs the
  // goods-trading branch (services auto-passes and never reaches the marker check).
  await recordClientFact(owner, { client: fx.client, factKey: "trade_nature", factValue: "goods_trading", basis: "x56 reversed-marker: a goods trader by fixture design", basisKind: "owner_instruction" });

  // draft_entry's p_flags param is NOT a passthrough into the flags column --
  // _draft_entry_core extracts only three recognized booleans from it
  // (is_year_end, tax_affecting, closing_transfer) into their OWN dedicated
  // columns; closing_stock is not one of them (measured, not assumed -- the
  // live _draft_entry_core body confirms it). No audited writer sets
  // flags?'closing_stock' yet (the gate's own comment: "the future closing-
  // stock verb" -- not yet built in 0056). flags IS in _tf_entry_immutable's
  // draft->draft allowed-column set, so a root UPDATE while still draft reaches
  // the same prestate a future verb will, without disabling anything.
  const manualRes = freshResolution(preparer, fx.client, { subjectKind: "manual", subjectId: null });
  const marker = await draftEntryV3(preparer, {
    client: fx.client, resolution: manualRes, memo: "x56 closing stock marker", postingDate: addDaysStr(fx.startsOn, 45),
    lines: [
      { account_code: BANK1, debit_cents: 500, credit_cents: 0, description: "closing stock dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 500, description: "closing stock cr" },
    ],
    opKey: opk("x56-revmarker-draft"),
  });
  await rootQuery("update clara.journal_entries set flags = jsonb_build_object('closing_stock', true) where id=$1 and status='draft'", [marker.entry_id]);
  const flagsRow = (await rootQuery("select flags from clara.journal_entries where id=$1", [marker.entry_id])).rows[0];
  assert.equal(flagsRow.flags?.closing_stock, true, "mandatory setup: the marker entry carries flags?'closing_stock' before approval");
  await approveEntry(preparer, { entry: marker.entry_id, expectedRevision: marker.revision_token, opKey: opk("x56-revmarker-approve") });

  const begun1 = await beginClose(owner, { fy: fx.fy });
  const gate1 = (begun1.gates ?? []).find((g) => g.check_key === "closing_stock_present");
  assert.equal(gate1?.state, "pass", "mandatory setup: the live marker entry makes the gate pass");
  const measured1 = (await rootQuery("select measured from clara.close_gate_results where id=$1", [gate1.result_id])).rows[0].measured;
  assert.equal(measured1.closing_stock_entry_present, true);
  await abandonClose(owner, { closeRun: begun1.close_run_id, reason: "x56 revmarker: abandoning to reverse the marker before the real close attempt" });

  await humanQuery(owner, "select clara.reverse_entry(p_entry => $1, p_reason => $2, p_op_key => $3) as r",
    [marker.entry_id, "x56 revmarker: reversing the closing-stock marker on purpose", opk("x56-revmarker-reverse")]);
  const markerRow = (await rootQuery("select reversed_by from clara.journal_entries where id=$1", [marker.entry_id])).rows[0];
  assert.ok(markerRow.reversed_by, "mandatory setup: the marker entry is now reversed (reversed_by set)");

  const begun2 = await beginClose(owner, { fy: fx.fy });
  const gate2 = (begun2.gates ?? []).find((g) => g.check_key === "closing_stock_present");
  assert.equal(gate2?.state, "fail", "the gate returns to FAIL once its one marker entry is reversed -- a reversed original is not a standing declaration");
  const measured2 = (await rootQuery("select measured from clara.close_gate_results where id=$1", [gate2.result_id])).rows[0].measured;
  assert.equal(measured2.closing_stock_entry_present, false);

  // Structural confirmation, read from the live body (never assumed): the query
  // excludes both a reversed original AND its mirror.
  const body = (await rootQuery(
    "select pg_get_functiondef('clara._close_gate_closing_stock(uuid,uuid)'::regprocedure) as def",
  )).rows[0].def;
  assert.match(body, /je\.reversed_by\s+is\s+null/);
  assert.match(body, /je\.reversal_of\s+is\s+null/);
});

// ===========================================================================
// (h) THE P&L-ZERO PROBE (Codex R1 MAJOR 6): after a close, every P&L account
// must net to ZERO through fy_end. A closed-year reclass moving only P&L legs
// is invisible to the four drawer-1 identities AND the BS closing-position pin
// -- this probe, added to verify_close, is what catches it. (The finding's
// other half, a prior-opening tie, is declined as a duplicate of the prior
// receipt's own verify_close -- not re-argued here.)
// ===========================================================================

test("P&L-zero probe: a forged closed-period P&L<->P&L reclass is invisible to the BS pin and the four identities, but verify_close catches it naming BOTH accounts", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "plzero", prepSub: preparer, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "mandatory setup: the FY closes cleanly first");
  const verifiedBefore = await verifyClose(owner, { receipt: closed.receipt_id });
  assert.equal(verifiedBefore.verified, true, "mandatory setup: the fresh close verifies true before any forgery");
  assert.deepEqual(verifiedBefore.strict.pl_zero_diffs, [], "mandatory setup: zero P&L diffs on the untouched close");

  // Forge a P&L<->P&L reclass INSIDE the now-closed FY (dr EXPN / cr REVN, both P&L
  // types) -- neither the AR/AP/FA/bank identities nor the BS closing-position pin
  // touch income/expense accounts, so this movement is invisible to all of them.
  await forgeClosedPeriodMovement(preparer, {
    client: fx.client, postingDate: addDaysStr(fx.startsOn, 100), debit: EXPN, credit: REVN, cents: 4200,
    memo: "x56 P&L-zero probe: a forged closed-period P&L<->P&L reclass",
  });

  const verifiedAfter = await verifyClose(owner, { receipt: closed.receipt_id });
  assert.equal(verifiedAfter.verified, false, "verify_close now reports verified:false -- the P&L-zero probe catches what the other identities cannot");
  assert.deepEqual(verifiedAfter.strict.closing_position_diffs, [], "the BS pin still ties exactly -- confirms this reclass is genuinely invisible to it (both P&L legs, no BS leg)");
  for (const p of verifiedAfter.strict.probes) {
    assert.notEqual(p.state, "mismatch", `the four drawer-1 identities stay clean too (${p.probe?.check_key ?? "probe"} state=${p.state}) -- confirms the reclass is invisible to them as well`);
  }
  const diffs = verifiedAfter.strict.pl_zero_diffs;
  assert.equal(diffs.length, 2, "pl_zero_diffs names BOTH P&L accounts the reclass touched");
  const byAccount = Object.fromEntries(diffs.map((d) => [d.account_code, Number(d.net_cents)]));
  assert.equal(byAccount[EXPN], 4200, "EXPN's own net, in cents");
  assert.equal(byAccount[REVN], -4200, "REVN's own net, in cents (the mirror side)");
});

// ===========================================================================
// (i) fy_end_source PRESENCE (MIN1): both the close receipt's own snapshot and
// get_close_readiness report the SAME fy_end_source as the fiscal_years row
// itself -- readiness reports it even with no close_run yet.
// ===========================================================================

test("fy_end_source is present on both the close receipt snapshot and get_close_readiness, and both match the fiscal_years row -- readiness reports it even pre-begin_close", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "fyendsrc", prepSub: preparer, startsOn: "2027-01-01" });
  const fyRow = (await rootQuery("select fy_end_source from clara.fiscal_years where id=$1", [fx.fy])).rows[0];
  assert.equal(fyRow.fy_end_source, "default_1231", "mandatory setup: this fixture's client never asserts an fy_end -- the default source");

  // get_close_readiness reports fy_end_source even with NO close_run yet (it reads
  // fiscal_years directly, not gated on a run existing).
  const readinessPre = await getCloseReadiness(owner, { client: fx.client, fy: fx.fy });
  assert.equal(readinessPre.close_run_id, null, "mandatory setup: no close_run exists yet");
  assert.equal(readinessPre.fy_end_source, "default_1231", "readiness reports fy_end_source PRE-begin_close");

  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  const row = (await rootQuery("select snapshot from clara.close_receipts where id=$1", [closed.receipt_id])).rows[0];
  assert.equal(row.snapshot.fy_end_source, "default_1231", "the receipt's own snapshot carries fy_end_source, matching the fiscal_years row");

  const readinessPost = await getCloseReadiness(owner, { client: fx.client, fy: fx.fy });
  assert.equal(readinessPost.fy_end_source, "default_1231", "readiness reports the SAME value post-close too");
});
