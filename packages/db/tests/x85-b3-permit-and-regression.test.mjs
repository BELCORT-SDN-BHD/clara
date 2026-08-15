// x85 -- B3 (ADR-068 ruling 1), PART 2: the target-bound close-write permit (M2) that admits
// the one backdated write, and the clara.reverse_entry REGRESSION FLOOR that proves no
// generic backdating door opened beside it.
//
// CONTRACT-BLIND on the migration: the permit cells drive the LIVE wall triggers, and the
// regression cells read the LIVE catalog. Neither reads 0085/0086's .sql.
//
// GATED ON 0056 ONLY, not on B3 -- see part 1's header for why.
//
// WHICH CELLS ARE WHICH, stated so nobody reads a green as a proof it is not:
//   B3.6            NEW BEHAVIOUR. Measured RED against the pre-B3 body (the permit named the
//                   ORIGINAL closing entry, carried a budget of 2, and was consumed ZERO
//                   times -- a pure belt that nothing ever went through).
//   B3.7 / B3.7b    PRE-EXISTING WALL, NEWLY LOAD-BEARING. These pin 0056's own
//                   _tf_period_wall semantics -- target binding, budget, the created_xact
//                   transaction binding -- and are GREEN on BOTH sides of B3 by design. They
//                   are here because B3's effect order makes the wall the thing that ADMITS
//                   the one backdated write, where 0056 flipped the year open first and never
//                   consulted it. What CHANGED is whether anything ever consumes it, and that
//                   is B3.6's claim, not theirs.
//   B3.8 / b / c    REGRESSION FLOOR, also GREEN on both sides by design. A floor that went
//                   red before the change would not be measuring what it claims.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, getPool, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, draftEntryV3, freshResolution,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, freshActiveClient, setupCloseCoa, beginClose,
  attestClose, finalizeClose, reopenFY, bookToday, plainEntry, addDaysStr,
  BANK1, REVN, EXPN,
} from "./x56-fixtures.mjs";

// The body clara.reverse_entry carried when B3 was authored, pinned by prosrc sha256 --
// prosrc is the body alone (no signature, no formatting drift), which is why the repo already
// pins bodies this way (0060:480, 0084's prestate, delta-catalog-phase.mjs).
const REVERSE_ENTRY_SHA256 = "cc01323e453de38afb83f0e50b300a488e8a963ce458c621dee9abec4651f4b9";

let ready = false;
let has56 = false;
let world = null;

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x85 part 2 skipped"); return; }
  has56 = await has0056();
  if (!has56) noteLane("0056 not applied -- the close model (and therefore B3) is absent");
  if (ready && has56) world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x85-part2"); printSkipCount("x85-part2"); await endPool(); });

function skipHere(t) {
  if (!ready || !has56) { markSkip(); t.skip("0056 (close model) not present"); return true; }
  return false;
}

const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

async function draftOnly(sub, { client, postingDate }) {
  return draftEntryV3(sub, {
    client, resolution: manualRes(sub, client), memo: "x85 permit draft", postingDate,
    lines: [
      { account_code: BANK1, debit_cents: 1000, credit_cents: 0, description: "dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 1000, description: "cr" },
    ],
    opKey: opk("x85-draft"),
  });
}

// ===========================================================================
// B3.6 -- THE PERMIT THE REOPEN ITSELF MINTS is bound to the PRE-GENERATED
// reversal entry (never to the original), carries a budget of exactly ONE, and
// is spent exactly once. "Named one entry" and "spent once" are two distinct
// properties in the same WHERE clause; both are read from the row.
// ===========================================================================

test("B3.6 the reopen's own close-write permit names the PRE-GENERATED reversal entry with a budget of ONE, and is consumed exactly once", async (t) => {
  if (skipHere(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "b36", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  const reopened = await reopenFY(owner, {
    fy: fx.fy, reason: "x85 b36: reopening to read the permit the act minted",
    correctionTarget: { entry_ids: [closed.close_entry_id] },
  });

  const permits = (await rootQuery(
    `select purpose, target_entry_id, entries_expected, entries_used, created_xact::text as xid
       from clara.close_write_permits where fiscal_year_id=$1 and purpose='reopen_reversal'`,
    [fx.fy])).rows;
  assert.equal(permits.length, 1, "exactly ONE reopen_reversal permit -- one backdated write, one permit");
  const p = permits[0];
  assert.equal(p.target_entry_id, reopened.reversal_entry_id,
    "the permit names the PRE-GENERATED reversal entry id -- so nothing else can ride it in-transaction");
  assert.notEqual(p.target_entry_id, closed.close_entry_id,
    "and NOT the original closing entry: a permit naming the original would also admit any reversal OF it, which is a wider door than the act needs");
  assert.equal(p.entries_expected, 1, "budget of exactly one approved-class touch");
  assert.equal(p.entries_used, 1, "spent exactly once -- no under- and no over-consumption");
});

// ===========================================================================
// B3.7 -- THE TWO NEGATIVES that make B3.6 an assertion rather than an
// observation, driven against the LIVE wall with a hand-minted permit inside a
// still-closed year (the only place the wall actually adjudicates). Both must
// run in ONE transaction: created_xact binds a permit to the transaction that
// minted it, and a Postgres transaction that takes an error is aborted for
// every statement after -- so SAVEPOINT/ROLLBACK TO around each expected
// failure is the only way to keep the permit alive to be read afterwards.
// ===========================================================================

test("B3.7 a reopen_reversal permit REFUSES a write to a different entry (target never matches, budget untouched) and REFUSES a second consumption (budget exhausted)", async (t) => {
  if (skipHere(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "b37", prepSub: preparer, startsOn: "2027-01-01" });
  // Two drafts minted BEFORE the close -- their LINES need the year still open.
  const draftA = await draftOnly(preparer, { client: fx.client, postingDate: addDaysStr(fx.startsOn, 31) });
  const draftB = await draftOnly(preparer, { client: fx.client, postingDate: addDaysStr(fx.startsOn, 32) });
  const begun = await beginClose(owner, { fy: fx.fy });
  for (const d of [draftA, draftB]) {
    await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "unapproved_drafts_in_period", reason: "x85 b37: attested past a draft left unapproved on purpose", itemKey: d.entry_id });
  }
  await finalizeClose(owner, { fy: fx.fy });

  const firmId = (await rootQuery("select firm_id from clara.clients where id=$1", [fx.client])).rows[0].firm_id;
  const c = await getPool().connect();
  let mismatchErr = null; let capacityErr = null;
  let usedAfterMismatch = null; let usedAfterFirst = null; let usedFinal = null;
  try {
    await c.query("set role clara_fn_owner");
    await c.query("begin");
    const permitId = (await c.query(
      `insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id, close_run_id,
         purpose, target_entry_id, entries_expected)
       select $1, $2, $3, cr.id, 'reopen_reversal', $4, 1
         from clara.close_runs cr where cr.fiscal_year_id = $3 order by cr.started_at desc limit 1
       returning id`,
      [firmId, fx.client, fx.fy, draftA.entry_id],
    )).rows[0].id;

    // (a) TARGET MISMATCH: draftB's id is not the permit's target, and draftB is nobody's
    // reversal, so neither arm of the wall's reopen_reversal predicate can reach the permit.
    await c.query("savepoint sp_mismatch");
    try {
      await c.query("update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$2 where id=$1", [draftB.entry_id, owner]);
    } catch (e) { mismatchErr = e; await c.query("rollback to savepoint sp_mismatch"); }
    usedAfterMismatch = (await c.query("select entries_used from clara.close_write_permits where id=$1", [permitId])).rows[0].entries_used;

    // (b) The permit's OWN target consumes its single unit...
    await c.query("update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$2 where id=$1", [draftA.entry_id, owner]);
    usedAfterFirst = (await c.query("select entries_used from clara.close_write_permits where id=$1", [permitId])).rows[0].entries_used;

    // ...and a SECOND approved-class touch on that same target finds no capacity left. The
    // reversal-linkage pair is used because _tf_entry_immutable (CLR08) fires BEFORE the
    // period wall in trigger-name order and admits exactly that one shape on an approved row
    // -- any other column touch would be refused earlier and never reach the budget guard.
    await c.query("savepoint sp_capacity");
    try {
      await c.query("update clara.journal_entries set reversed_by=$2, reversal_reason=$3 where id=$1",
        [draftA.entry_id, fx.revenueEntry, "x85 b37: a second touch, beyond budget"]);
    } catch (e) { capacityErr = e; await c.query("rollback to savepoint sp_capacity"); }
    usedFinal = (await c.query("select entries_used from clara.close_write_permits where id=$1", [permitId])).rows[0].entries_used;
    await c.query("commit");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }

  assert.ok(mismatchErr, "a write to an entry the permit does not name must refuse");
  assert.equal(mismatchErr.code, "CLR19", `expected CLR19 (got ${mismatchErr.code} -- ${mismatchErr.message})`);
  assert.equal(JSON.parse(mismatchErr.detail ?? "{}").reason, "write_into_closed_period");
  assert.equal(usedAfterMismatch, 0, "the mismatched attempt never reached the counter -- target and budget are two distinct guards, and this was never a budget question");
  assert.equal(usedAfterFirst, 1, "the named target's own approve consumed the permit's sole unit");
  assert.ok(capacityErr, "a SECOND consumption must refuse");
  assert.equal(capacityErr.code, "CLR19", `expected CLR19 (got ${capacityErr.code} -- ${capacityErr.message})`);
  assert.equal(JSON.parse(capacityErr.detail ?? "{}").reason, "write_into_closed_period");
  assert.equal(usedFinal, 1, "and the refused second consumption left the counter where it was");
});

test("B3.7b a reopen_reversal permit from a PRIOR, already-committed transaction admits nothing -- the backdating door closes with the transaction that opened it", async (t) => {
  if (skipHere(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "b37b", prepSub: preparer, startsOn: "2027-01-01" });
  const draftA = await draftOnly(preparer, { client: fx.client, postingDate: addDaysStr(fx.startsOn, 31) });
  const begun = await beginClose(owner, { fy: fx.fy });
  await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "unapproved_drafts_in_period", reason: "x85 b37b: attested past the draft", itemKey: draftA.entry_id });
  await finalizeClose(owner, { fy: fx.fy });

  const firmId = (await rootQuery("select firm_id from clara.clients where id=$1", [fx.client])).rows[0].firm_id;
  // Mint the permit and COMMIT it, so the write below runs in a different transaction.
  const c1 = await getPool().connect();
  try {
    await c1.query("set role clara_fn_owner");
    await c1.query(
      `insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id, close_run_id,
         purpose, target_entry_id, entries_expected)
       select $1, $2, $3, cr.id, 'reopen_reversal', $4, 1
         from clara.close_runs cr where cr.fiscal_year_id = $3 order by cr.started_at desc limit 1`,
      [firmId, fx.client, fx.fy, draftA.entry_id]);
  } finally {
    await c1.query("reset role").catch(() => {});
    c1.release();
  }
  const err = await caught(() => rootQuery(
    "update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$2 where id=$1",
    [draftA.entry_id, owner]));
  assert.ok(err, "a committed permit admits nothing in a later transaction");
  assert.equal(err.code, "CLR19", `expected CLR19 (got ${err.code} -- ${err.message})`);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "write_into_closed_period");
  const used = (await rootQuery(
    "select entries_used from clara.close_write_permits where fiscal_year_id=$1 and purpose='reopen_reversal'",
    [fx.fy])).rows[0].entries_used;
  assert.equal(used, 0, "and the stale permit's counter never moved");
});

// ===========================================================================
// B3.8 -- THE REGRESSION FLOOR (deliberately GREEN before and after B3): the
// never-backdate law for TRANSACTION reversals is untouched. Three instruments,
// because "unchanged" is a claim about the body, the interface and the
// behaviour, and any one of them alone is a projection of the thing.
// ===========================================================================

test("B3.8 clara.reverse_entry is BYTE-IDENTICAL to the body B3 was authored against, and its interface admits no caller-supplied date (regression floor: green on both sides of B3)", async (t) => {
  if (skipHere(t)) return;
  const r = (await rootQuery(
    `select encode(sha256(convert_to(prosrc,'UTF8')),'hex') as sha,
            pg_get_function_arguments(oid) as args, prosecdef, pg_get_userbyid(proowner) as owner
       from pg_proc where oid = 'clara.reverse_entry(uuid,text,text)'::regprocedure`)).rows[0];
  assert.ok(r, "clara.reverse_entry still exists at its pinned signature");
  assert.equal(r.sha, REVERSE_ENTRY_SHA256,
    "reverse_entry's body is byte-identical -- B3 gave the period machinery its OWN writer instead of adding a date parameter or a branch to the generic one");
  assert.equal(r.args, "p_entry uuid, p_reason text, p_op_key text",
    "and its interface is unchanged: there is no posting-date parameter for a caller to backdate through");
  assert.equal(r.prosecdef, true);
  assert.equal(r.owner, "clara_fn_owner");
  // The reopen verb's own interface is unchanged too -- B3 moved the DATE, never the door.
  const ro = (await rootQuery(
    "select pg_get_function_arguments(oid) as args from pg_proc where oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text)'::regprocedure")).rows[0];
  assert.equal(ro.args, "p_fy uuid, p_reason text, p_correction_target jsonb, p_op_key text",
    "reopen_fiscal_year gained no date parameter either: the ends_on it uses is READ from the fiscal year, never supplied");
});

test("B3.8b an ordinary transaction reversal is still TODAY-dated, never the original's date (regression floor: green on both sides of B3)", async (t) => {
  if (skipHere(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "b38b");
  await setupCloseCoa(owner, client);
  // No fiscal year is registered for this client, so no period machinery is in play at all --
  // this is the plain business-transaction path the never-backdate law is about.
  const original = await plainEntry(owner, { client, debit: EXPN, credit: BANK1, cents: 12345, postingDate: "2026-03-15", memo: "x85 b38b: an ordinary past-dated transaction" });
  const res = await humanQuery(owner,
    "select clara.reverse_entry(p_entry => $1, p_reason => $2, p_op_key => $3) as r",
    [original, "x85 b38b: an ordinary reversal", opk("x85-rev")]);
  const mirrorId = res.rows[0].r.reversal_id;
  const m = (await rootQuery(
    "select posting_date::text as posting_date, status, reversal_of from clara.journal_entries where id=$1",
    [mirrorId])).rows[0];
  const today = await bookToday();
  assert.equal(m.reversal_of, original, "mandatory setup: the mirror is linked to its original");
  assert.equal(m.posting_date, today, "the reversal of a TRANSACTION posts TODAY -- the never-backdate law, unchanged by B3");
  assert.notEqual(m.posting_date, "2026-03-15", "and emphatically not the original's own date");
  assert.equal(m.status, "approved", "an ordinary, non-high-stakes reversal still approves straight through");
});

test("B3.8c the wall still refuses an ordinary reversal inside a CLOSED year -- reopen remains the one way back in (regression floor)", async (t) => {
  if (skipHere(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "b38c", prepSub: preparer, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  await finalizeClose(owner, { fy: fx.fy });
  const err = await caught(() => humanQuery(owner,
    "select clara.reverse_entry(p_entry => $1, p_reason => $2, p_op_key => $3) as r",
    [fx.revenueEntry, "x85 b38c: reversing a transaction inside a closed year", opk("x85-rev-closed")]));
  assert.ok(err, "an ordinary transaction inside a closed year cannot be reversed directly");
  // Which wall fires is stated rather than predicted: t_je_immutable (CLR08) and the period
  // wall (CLR19) are both legitimate, defense-in-depth guards over the same protected write,
  // and trigger-name order decides. The cell asserts the SET, and prints what it saw.
  assert.ok(["CLR08", "CLR19"].includes(err.code), `expected CLR08 or CLR19 (got ${err.code} -- ${err.message})`);
  const permits = (await rootQuery(
    "select count(*)::int as n from clara.close_write_permits where fiscal_year_id=$1", [fx.fy])).rows[0].n;
  assert.equal(permits, 1, "and the refused attempt minted no permit of its own -- only the close's own close_entry permit exists");
});
