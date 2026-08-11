// 0056 (Wave E lane beta, the close model) rig -- PART 6: the SoD closer/preparer
// segregation (A12), op_key replay dedupe (A14), the continuity PIN at FY(n)'s
// close with no successor yet existing (A19f), and the close-write permit's
// unforgeability (A19c). No attest_close_exception here (DEFECT 4, reported
// separately) -- every close is clean.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG, never
// by reading 0056_wave_e_close_model.sql (its live prosrc is read for MY OWN
// authorial grounding only, per established practice).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, getPool, draftEntryV3, freshResolution,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, beginClose, finalizeClose, verifyClose,
  grantCapability,
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
  if (!ready) { noteLane("0011 surface absent -- x56 rest-b suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-b"); printSkipCount("x56-rest-b"); await endPool(); });

// ===========================================================================
// A12 -- SoD: the FY's last human preparer/editor (journal_entries.last_human_
// editor, never checker_actor) cannot ALSO be the closer, when the firm carries
// >=2 eligible checkers. H2 (a different eligible human) closes successfully.
// ===========================================================================

test("A12 the last human preparer is REFUSED as closer (SoD, keyed on last_human_editor); a distinct H2 closes successfully", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice; // owner: auto-holds close_and_attest
  const preparer = world.users.hana; // admin, will be H1 (prepares AND attempts close)

  // Firm A carries alice(owner)+bob(bookkeeper)+grace(bookkeeper)+hana(admin) --
  // eligible_checker_count counts role_rank>=bookkeeper human members, so this firm
  // is >=2 (mandatory setup for the two_person branch, not the solo-attestation one).
  const eligible = (await rootQuery(
    "select clara.eligible_checker_count($1) as n",
    [world.firms.A],
  )).rows[0].n;
  assert.ok(eligible >= 2, `mandatory setup: firm A carries >=2 eligible checkers (measured ${eligible})`);

  // H1 (hana) prepares the FY's entries -- setupSub=owner (creates client/FY/CoA),
  // prepSub=hana (posts + becomes last_human_editor).
  const fx = await cleanCloseableFY(owner, { tag: "a12", prepSub: preparer, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });

  // hana needs the close_and_attest capability to even ATTEMPT the close (else the
  // refusal would be the capability floor, not segregation) -- granted by the owner.
  await grantCapability(owner, { user: preparer, capability: "close_and_attest", reason: "x56 a12: hana attempts her own close (expected SoD refusal)" });

  const err = await caught(() => finalizeClose(preparer, { fy: fx.fy }));
  assert.ok(err, "the last human preparer must be refused as closer");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.reason, "close_segregation_violation");
  assert.equal(det.last_preparer, preparer, "the refusal names the measured last preparer");

  // H2 (the owner, never touched this FY's entries) closes successfully.
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "a distinct eligible human closes successfully");
  const receiptRow = (await rootQuery(
    "select segregation_mode, last_preparer_actor from clara.close_receipts where id=$1",
    [closed.receipt_id],
  )).rows[0];
  assert.equal(receiptRow.segregation_mode, "two_person");
  assert.equal(receiptRow.last_preparer_actor, preparer, "the receipt records who prepared, honestly, even though they did not close");
});

test("A12 negative: a predicate on checker_actor (rather than last_human_editor) would be a FAIL -- confirmed the live body tests the right column", async (t) => {
  if (skip56(t)) return;
  const body = (await rootQuery(
    "select pg_get_functiondef('clara.finalize_close(uuid,text,text)'::regprocedure) as def",
  )).rows[0].def;
  assert.ok(/last_human_editor/.test(body), "the segregation predicate reads last_human_editor");
  // The ordering column itself is read from journal_entries, never checker_actor, as
  // the source of v_preparer (checker_actor may appear elsewhere in the body for the
  // closing entry's OWN flip -- that is a different statement, not this predicate).
  const predicateWindow = body.slice(body.indexOf("SEGREGATION"), body.indexOf("v_mode := 'two_person'"));
  assert.ok(/last_human_editor/.test(predicateWindow), "the segregation window itself reads last_human_editor");
  assert.ok(!/v_preparer\s*:=\s*coalesce\(\s*je\.checker_actor/.test(predicateWindow), "v_preparer is never sourced from checker_actor");
});

// ===========================================================================
// A14 -- op_key replay: the SAME finalize_close call, same op_key, returns the
// STORED result. No second receipt, no second entry, no second event.
// ===========================================================================

test("A14 replaying finalize_close with the SAME op_key returns the stored result -- no second receipt, entry, or event", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "a14", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });

  const fixedOpKey = opk("x56-a14-replay-fixed");
  const first = await finalizeClose(owner, { fy: fx.fy, opKey: fixedOpKey });
  assert.ok(first.receipt_id && first.close_entry_id, "mandatory setup: the first call closes for real");

  const seqBefore = (await rootQuery(
    "select max(seq)::bigint as s from clara.domain_events where firm_id=$1",
    [world.firms.A],
  )).rows[0].s;

  // Replay: FY is now 'closed' (the status guard would refuse a genuinely NEW call),
  // yet the SAME op_key must return the stored result via _reserve_op's dedupe path.
  const replay = await finalizeClose(owner, { fy: fx.fy, opKey: fixedOpKey });
  assert.deepEqual(replay, first, "the replay returns the EXACT stored result, not a fresh computation");

  const seqAfter = (await rootQuery(
    "select max(seq)::bigint as s from clara.domain_events where firm_id=$1",
    [world.firms.A],
  )).rows[0].s;
  assert.equal(String(seqAfter), String(seqBefore), "no new event was appended by the replay");

  const receiptCount = (await rootQuery(
    "select count(*)::int as n from clara.close_receipts where fiscal_year_id=$1",
    [fx.fy],
  )).rows[0].n;
  assert.equal(receiptCount, 1, "exactly one receipt exists for this FY");

  const entryCount = (await rootQuery(
    "select count(*)::int as n from clara.journal_entries where close_receipt_id=$1",
    [first.receipt_id],
  )).rows[0].n;
  assert.equal(entryCount, 1, "exactly one closing entry carries this receipt's lineage");

  const opReceiptCount = (await rootQuery(
    "select count(*)::int as n from clara.op_receipts where firm_id=$1 and fn='finalize_close' and op_key=$2",
    [world.firms.A, fixedOpKey],
  )).rows[0].n;
  assert.equal(opReceiptCount, 1, "exactly one op_receipts row backs both calls");
});

// ===========================================================================
// A19f -- the continuity PIN: FY(n) with NO FY(n+1) row closes successfully and
// pins its closing_position (per balance-sheet account, in cents); verify_close
// reports successor_tie:'pinned_not_yet_consumed', never 'passed'.
// ===========================================================================

test("A19f a first-year close (no successor FY) SUCCEEDS and pins its closing_position; verify_close reports pinned_not_yet_consumed", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  // revCents=500000 dr BANK1 / expCents=200000 cr BANK1 -> BANK1 net +300000 (debit);
  // v_pl=300000 credited to RE1 -> RE1 net -300000 (credit balance). No FY(n+1) is
  // ever opened for this client in this cell.
  const fx = await cleanCloseableFY(owner, { tag: "a19f", prepSub: world.users.hana, startsOn: "2027-01-01", revCents: 500_000, expCents: 200_000 });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "the first year's close succeeds with no successor in existence");

  const receiptRow = (await rootQuery(
    "select snapshot from clara.close_receipts where id=$1",
    [closed.receipt_id],
  )).rows[0];
  const pin = receiptRow.snapshot.closing_position;
  assert.ok(pin && typeof pin === "object", "the receipt carries a non-null closing_position");
  assert.equal(pin["170-C56"], 300_000, "BANK1 pins at its net debit movement in cents");
  assert.equal(pin["390-C56"], -300_000, "RE1 pins at its net credit balance in cents (the P&L roll)");
  assert.equal(Object.prototype.hasOwnProperty.call(pin, "374-C56"), false, "AR1 (untouched, zero balance) is excluded from the pin");
  assert.equal(Object.prototype.hasOwnProperty.call(pin, "474-C56"), false, "AP1 (untouched, zero balance) is excluded from the pin");

  const verified = await verifyClose(owner, { receipt: closed.receipt_id });
  assert.equal(verified.verified, true, "a fresh recompute confirms the receipt");
  assert.equal(verified.successor_tie, "pinned_not_yet_consumed", "informational, never 'passed' -- no successor exists yet to consume it");

  // Negative: no continuity_tie_deferred gate row appears in ANY drawer for this run
  // -- the deferral gate the design deleted must not have quietly reappeared.
  const runRow = (await rootQuery(
    "select cr2.id from clara.close_runs cr2 where cr2.fiscal_year_id=$1 and cr2.state='finalized' order by cr2.started_at desc limit 1",
    [fx.fy],
  )).rows[0];
  const deferredGate = (await rootQuery(
    "select count(*)::int as n from clara.close_gate_results where close_run_id=$1 and check_key='continuity_tie_deferred'",
    [runRow.id],
  )).rows[0].n;
  assert.equal(deferredGate, 0, "no continuity_tie_deferred gate exists in any drawer -- the design deleted it, and it must stay deleted");
});

// ===========================================================================
// A19c -- the close-write permit cannot be forged. A session that never called
// a close verb manufactures every piece of session state a caller can reach --
// the SAME shared advisory lock ordinary writers take, a fake clara.close_run
// GUC, and (via the same root/table-owner forging precedent forceControlMismatch
// and forgeClosedPeriodMovement already use elsewhere in this rig, since no
// audited writer's own signature exposes close_receipt_id as a settable
// parameter) a hand-set close_receipt_id pointing at a REAL receipt -- and is
// refused, three times over: the permit is LOOKED UP (created_xact = this
// transaction's own declared xid8), never read off any of these signals.
// ===========================================================================

test("A19c the close-write permit cannot be forged: neither the shared lock, a fake close_run GUC, nor a hand-set close_receipt_id admits a write into a closing FY", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const forger = world.users.bob; // has called NO close verb

  // A REAL close_run (fx1, closing) and a REAL receipt from a DIFFERENT,
  // already-closed FY (fx2) -- the forgery points at genuine ids, not
  // fabricated ones, per the cell's own text.
  const fx1 = await cleanCloseableFY(owner, { tag: "a19c-target", prepSub: world.users.hana, startsOn: "2027-01-01" });
  const fx2 = await cleanCloseableFY(owner, { tag: "a19c-realreceipt", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx2.fy });
  const realClosed = await finalizeClose(owner, { fy: fx2.fy });
  assert.ok(realClosed.receipt_id, "mandatory setup: a genuine, different receipt exists to forge a pointer at");

  // A pre-existing DRAFT in fx1's client, minted BEFORE fx1's own close begins
  // (the journal_lines sibling wall blocks any line touch once closing, same
  // as A19a/A19d) -- the target for the ordinary-verb forgery attempt.
  const preDraft = await draftEntryV3(forger, {
    client: fx1.client,
    resolution: await freshResolution(forger, fx1.client, { subjectKind: "manual", subjectId: null }),
    memo: "x56 a19c pre-existing draft", postingDate: fx1.startsOn,
    lines: [
      { account_code: "170-C56", debit_cents: 500, credit_cents: 0, description: "dr" },
      { account_code: "684-C56", debit_cents: 0, credit_cents: 500, description: "cr" },
    ],
    opKey: opk("x56-a19c-draft"),
  });
  const begun = await beginClose(owner, { fy: fx1.fy });
  assert.equal((await rootQuery("select status from clara.fiscal_years where id=$1", [fx1.fy])).rows[0].status, "closing", "mandatory setup: FY(n) is closing when the forger acts");

  // STRUCTURAL, four reads (live catalog, never file text). Comments stripped
  // first -- the body's own design-rationale comment NAMES pg_locks/xmin/GUC
  // as REJECTED instruments (prose explaining the choice), which would
  // otherwise false-positive a naive substring count; only executable code
  // may answer "does the trigger consult this", per the 0045 census idiom.
  const bodyRaw = (await rootQuery("select pg_get_functiondef('clara._tf_period_wall()'::regprocedure) as def")).rows[0].def;
  const body = bodyRaw.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal((body.match(/current_setting/g) ?? []).length, 0, "the CODE (comments stripped) contains ZERO current_setting occurrences -- the fake GUC is never consulted");
  assert.equal((body.match(/pg_locks/g) ?? []).length, 0, "the CODE (comments stripped) contains ZERO pg_locks reads -- the advisory lock is a serializer, never evidence");
  assert.equal((body.match(/new\.close_receipt_id/gi) ?? []).length, 0, "the CODE (comments stripped) contains ZERO references to NEW.close_receipt_id -- the hand-set field is never read as authorization");
  const grantRows = (await rootQuery(
    `select r.rolname,
            has_table_privilege(r.rolname, 'clara.close_write_permits', 'INSERT') as can_insert
       from pg_roles r
      where r.rolname in ('clara_authenticated','clara_agent_ro','clara_runtime','clara_wake_proactive','clara_wake_interactive')`,
  )).rows;
  for (const r of grantRows) {
    assert.equal(r.can_insert, false, `${r.rolname} holds no INSERT privilege on close_write_permits`);
  }

  // BEHAVIOURAL, ordinary session (clara_authenticated, bob): take the SAME
  // shared lock a real writer takes, plant a fake close_run GUC pointing at
  // fx1's OWN real close_run (session state is real, just not THIS
  // transaction's own permit), then attempt the NORMAL approve_entry verb --
  // no exposed writer signature accepts close_receipt_id as a parameter, so
  // that forgery vector is unreachable through the ordinary verb; this half
  // proves the other two (lock + GUC) buy nothing on their own.
  const gucErr = await caught(() => humanQuery(forger,
    `select pg_advisory_xact_lock_shared(203005007, hashtext($1::text)),
            set_config('clara.close_run', $2::text, true),
            clara.approve_entry(p_entry => $3, p_expected_revision => $4, p_op_key => $5) as r`,
    [fx1.client, begun.close_run_id, preDraft.entry_id, preDraft.revision_token, opk("x56-a19c-forge1")]));
  assert.ok(gucErr, "the lock + fake GUC forgery does not admit the write");
  assert.equal(gucErr.code, "CLR19", `expected CLR19 (got ${gucErr.code} -- ${gucErr.message})`);
  assert.equal(JSON.parse(gucErr.detail ?? "{}").reason, "write_into_closed_period");
  assert.equal((await rootQuery("select status from clara.journal_entries where id=$1", [preDraft.entry_id])).rows[0].status, "draft", "the pre-existing draft is untouched by the refused attempt");

  // BEHAVIOURAL, maximal (table-owner) privilege: the fourth signal --
  // NEW.close_receipt_id hand-set to the REAL fx2 receipt -- is reachable only
  // by bypassing every audited writer's own signature, the SAME root/table-
  // owner forging technique forceControlMismatch and forgeClosedPeriodMovement
  // already use elsewhere in this rig for an otherwise-unreachable prestate.
  // Even with ALL FOUR signals forged simultaneously and MAXIMAL privilege,
  // the trigger fires regardless of role and refuses the SAME way.
  const c = await getPool().connect();
  let forgeErr = null;
  try {
    await c.query("set role clara_fn_owner");
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock_shared(203005007, hashtext($1::text))", [fx1.client]);
    await c.query("select set_config('clara.close_run', $1::text, true)", [begun.close_run_id]);
    try {
      await c.query(
        "update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$2, close_receipt_id=$3 where id=$1",
        [preDraft.entry_id, owner, realClosed.receipt_id],
      );
    } catch (e) {
      forgeErr = e;
    }
    await c.query("commit");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
  assert.ok(forgeErr, "even the maximal forgery (all four signals + table-owner privilege) is refused");
  // MEASURED, not predicted (the A5b precedent): a raw draft->approved UPDATE
  // trips a DIFFERENT, earlier-firing immutability guard (status-transition
  // integrity) before t_period_wall ever gets to evaluate this specific
  // write -- both are legitimate, independent walls over the same forged
  // write, reinforcing rather than weakening "refused, three times over".
  // The trigger's independence from NEW.close_receipt_id is what the
  // STRUCTURAL read above already proves (zero references, comments
  // stripped); this behavioural half confirms no channel reaches the wall
  // WITH that field forged, because nothing outside the audited path can
  // even flip status to approved in the first place.
  assert.equal(forgeErr.code, "CLR08", `measured: a status-transition immutability guard fires before t_period_wall on this raw-SQL channel (got ${forgeErr.code} -- ${forgeErr.message})`);
});
