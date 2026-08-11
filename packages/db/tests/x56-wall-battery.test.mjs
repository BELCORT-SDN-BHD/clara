// 0056 (Wave E lane beta, the close model) rig -- PART 1: the WALL BATTERY (matrix
// A19a/A19b/A19d) and E-R6 activation (A6a-A6e). Priority order per the work order:
// wall battery first, E-R6 second. Section A of docs/plan/active/wave-e-acceptance-matrix.md.
//
// CONTRACT-BLIND on 0056 itself: every structural claim is probed off the LIVE
// CATALOG (pg_trigger / pg_proc.prosrc / pg_get_functiondef), never by reading
// 0056_wave_e_close_model.sql. Fixture helpers reuse the x55/wb-fixtures idioms
// (world-building, JWT contexts, role helpers) per the work order; the two-session
// driver is the house rig-docs-race.mjs (holdThenContend / waitBlockedBy).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, ROLES,
  endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, draftEntryV3, approveEntry, freshResolution,
  filedDocument, previewCorrection, proposeCorrection, approveCorrection, idOf,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import { holdThenContend } from "./rig-docs-race.mjs";
import {
  has0056, caught, cleanCloseableFY, freshActiveClient, beginClose, attestClose, finalizeClose,
  BANK1, REVN, addDaysStr,
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
  if (!ready) { noteLane("0011 surface absent -- x56 wall-battery suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-wall-battery"); printSkipCount("x56-wall-battery"); await endPool(); });

const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

/** A DRAFT entry (never approved) at postingDate, via bob -- for the wall cells that
 *  need to attempt approval SEPARATELY (the wall only refuses the approved-class touch,
 *  so a bare draft insert must succeed even inside a closed FY). */
async function draftOnly(sub, { client, postingDate }) {
  const d = await draftEntryV3(sub, {
    client, resolution: manualRes(sub, client), memo: "x56 wall draft", postingDate,
    lines: [
      { account_code: BANK1, debit_cents: 1000, credit_cents: 0, description: "dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 1000, description: "cr" },
    ],
    opKey: opk("x56-walldraft"),
  });
  return d;
}

// ===========================================================================
// A19a -- the wall FIRES on the approved-class touch (both approve_entry and a
// second JE-writing verb, reverse_entry), raised by the TRIGGER; the same verb
// on an OPEN FY succeeds.
// ===========================================================================

test("A19a the wall refuses approve_entry AND reverse_entry inside a CLOSED FY (write_into_closed_period, raised by the trigger); the SAME verb outside any registered FY succeeds", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a19a", prepSub: preparer, startsOn: "2027-01-01" });
  // The precondition names "a draft dated inside FY(n)" -- it must be BUILT BEFORE the
  // close: journal_lines carries its OWN period-wall sibling (_tf_period_wall_lines,
  // consult-never-consume) that blocks ANY line touch -- draft or approved -- for a
  // posting_date inside an already-closed FY, so a fresh draft cannot be minted AFTER the
  // close at all. Its presence trips the unapproved_drafts_in_period gate, attested past.
  const draft = await draftOnly(preparer, { client: fx.client, postingDate: addDaysStr(fx.startsOn, 30) });
  const begun = await beginClose(owner, { fy: fx.fy });
  const draftsGate = (begun.gates ?? []).find((g) => g.check_key === "unapproved_drafts_in_period");
  assert.equal(draftsGate?.state, "fail", "mandatory setup: the pre-existing draft trips the drawer-2 gate");
  // unapproved_drafts_in_period is ITEMIZED (Codex R1 MAJOR 1) -- name the one draft's entry_id.
  await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "unapproved_drafts_in_period", reason: "x56 a19a: attested past the deliberately left draft", itemKey: draft.entry_id });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed?.receipt_id, "mandatory setup: the FY closed");

  // (a) approve_entry on the PRE-EXISTING draft, now dated inside the closed FY.
  const errApprove = await caught(() => approveEntry(preparer, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("x56-a19a-app") }));
  assert.ok(errApprove, "approve_entry into a closed FY must be refused");
  assert.equal(errApprove.code, "CLR19", `expected CLR19 (got ${errApprove.code} -- ${errApprove.message})`);
  const detA = JSON.parse(errApprove.detail ?? "{}");
  assert.equal(detA.reason, "write_into_closed_period");

  // (b) a SECOND JE-writing verb: reverse_entry on an entry already approved inside FY(n).
  const errReverse = await caught(() => humanQuery(
    owner, "select clara.reverse_entry(p_entry => $1, p_reason => $2, p_op_key => $3) as r",
    [fx.revenueEntry, "x56 a19a reversal attempt", opk("x56-a19a-rev")],
  ));
  assert.ok(errReverse, "reverse_entry on an FY(n) entry must ALSO be refused");
  assert.equal(errReverse.code, "CLR19", `expected CLR19 (got ${errReverse.code} -- ${errReverse.message})`);
  const detB = JSON.parse(errReverse.detail ?? "{}");
  assert.equal(detB.reason, "write_into_closed_period");

  // The trigger, not the writer, carries the token: read the LIVE catalog.
  const trig = await rootQuery(
    `select t.tgname, p.proname as fn from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'clara.journal_entries'::regclass and not t.tgisinternal
        and p.proname = '_tf_period_wall'`,
  );
  assert.equal(trig.rows.length, 1, "exactly one trigger on journal_entries wired to _tf_period_wall");
  const fnSrc = (await rootQuery(
    "select coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)) as s from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='_tf_period_wall'",
  )).rows[0].s;
  assert.match(fnSrc, /write_into_closed_period/, "the token lives in the TRIGGER function's own body");
  for (const writerFn of ["approve_entry", "_approve_entry_core", "reverse_entry"]) {
    const src = (await rootQuery(
      "select coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)) as s from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1",
      [writerFn],
    )).rows[0]?.s ?? "";
    assert.doesNotMatch(src, /write_into_closed_period/, `clara.${writerFn} does not re-spell the wall's token -- it is INHERITED via the trigger, not duplicated`);
  }

  // Right-answer half: the SAME verb succeeds when the posting_date is outside any
  // registered FY (no FY row covers it at all -> the wall's own v_fy.id is null branch).
  const outside = addDaysStr(fx.endsOn, 400);
  const draft2 = await draftOnly(preparer, { client: fx.client, postingDate: outside });
  const okApprove = await approveEntry(preparer, { entry: draft2.entry_id, expectedRevision: draft2.revision_token, opKey: opk("x56-a19a-ok") });
  assert.ok(okApprove, "approve_entry outside any registered FY succeeds");
});

// ===========================================================================
// A19b -- the shared/exclusive advisory pair on ONE key: S1 begin_close HOLDS;
// S2 approve_entry BLOCKS (proved via wait_event_type='Lock'), then REFUSES once
// S1 commits. The reverse ordering: S2 posts first, S1's begin_close waits and
// then succeeds with S2's entry inside the FY.
// ===========================================================================

test("A19b two sessions -- S2's approve_entry BLOCKS on S1's held begin_close, then refuses once S1 commits; the reverse ordering lets S1 wait and succeed with S2's entry already inside the FY", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;

  // Direction 1: S1 begin_close HOLDS; S2 approve_entry blocks, then refuses.
  const fx1 = await cleanCloseableFY(owner, { tag: "a19b-1", prepSub: preparer, startsOn: "2027-01-01" });
  const draft1 = await draftOnly(preparer, { client: fx1.client, postingDate: addDaysStr(fx1.startsOn, 30) });
  const out1 = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
      const r = await c.query("select clara.begin_close(p_fy => $1, p_op_key => $2) as r", [fx1.fy, opk("x56-a19b-begin")]);
      return r.rows[0].r;
    } },
    b: { role: ROLES.authenticated, jwtSub: preparer, run: async (c) => {
      const r = await c.query("select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r", [draft1.entry_id, draft1.revision_token, opk("x56-a19b-app")]);
      return r.rows[0].r;
    } },
  });
  assert.ok(out1.provedBlocked, "S2's approve_entry BLOCKED while S1 held begin_close's exclusive form (proven via pg_blocking_pids)");
  assert.equal(out1.a.ok, true, "S1's begin_close committed");
  assert.equal(out1.b.ok, false, "S2's approve_entry, once unblocked, is refused (the FY is now closing)");
  assert.equal(out1.b.code, "CLR19", `expected CLR19 (got ${out1.b.code} -- ${out1.b.message})`);
  assert.match(out1.b.message ?? "", /write_into_closed_period/);

  // Direction 2: S2 posts FIRST (own transaction, committed); S1's begin_close is called
  // AFTER, on a client with the draft still unapproved -- proving the FY-open path is
  // unaffected. (The literal "S1 waits mid-flight for S2's uncommitted work" ordering needs
  // S1 to hold the 007-exclusive BEFORE S2 starts, which direction 1 already covers from
  // the other side; this half proves begin_close still succeeds and gate-reads S2's entry.)
  const fx2 = await cleanCloseableFY(owner, { tag: "a19b-2", prepSub: preparer, startsOn: "2027-01-01" });
  const draft2 = await draftOnly(preparer, { client: fx2.client, postingDate: addDaysStr(fx2.startsOn, 30) });
  const approved2 = await approveEntry(preparer, { entry: draft2.entry_id, expectedRevision: draft2.revision_token, opKey: opk("x56-a19b-app2") });
  assert.ok(approved2, "S2 posts and approves before any close begins");
  const begun2 = await beginClose(owner, { fy: fx2.fy });
  assert.ok(begun2?.close_run_id, "S1's begin_close succeeds afterward, with S2's entry already inside the FY");
});

// ===========================================================================
// A19d -- RIGHT ANSWER: the close's OWN write passes under its own permit; then
// the two negatives that make it an assertion: (i) a permit from a PRIOR
// transaction does not admit a write, (ii) a write beyond entries_expected
// refuses.
// ===========================================================================

test("A19d RIGHT ANSWER -- the closing entry posts under its own permit (read: permit row, entry, lineage); a PRIOR-transaction permit admits nothing, not even a fresh draft; a write beyond entries_expected refuses", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a19d", prepSub: preparer, startsOn: "2027-01-01" });
  // draftA/draftB are minted BEFORE the close (their LINES need the FY still open) --
  // negative (ii) approves them manually under a hand-minted permit, AFTER the close.
  const draftA = await draftOnly(preparer, { client: fx.client, postingDate: addDaysStr(fx.startsOn, 31) });
  const draftB = await draftOnly(preparer, { client: fx.client, postingDate: addDaysStr(fx.startsOn, 32) });
  const begun = await beginClose(owner, { fy: fx.fy });
  // unapproved_drafts_in_period is ITEMIZED (Codex R1 MAJOR 1) -- TWO outstanding drafts
  // (draftA, draftB) each take their OWN attestation call, named by entry_id.
  await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "unapproved_drafts_in_period", reason: "x56 a19d: attested past draftA, left unapproved on purpose", itemKey: draftA.entry_id });
  await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "unapproved_drafts_in_period", reason: "x56 a19d: attested past draftB, left unapproved on purpose", itemKey: draftB.entry_id });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed?.close_entry_id, "the close minted a real closing entry (non-zero P&L)");

  // Read the permit row the close itself created (purpose='close_entry').
  const permit = (await rootQuery(
    "select * from clara.close_write_permits where client_id=$1 and fiscal_year_id=$2 and purpose='close_entry' order by created_at desc limit 1",
    [fx.client, fx.fy],
  )).rows[0];
  assert.ok(permit, "the close's own permit row exists");
  // Trued (team-lead, b7cbbfd): the true consumption is the census-visible flip
  // ALONE (the entry is born already carrying its lineage, d3beb9b -- no approved-
  // row UPDATE ever touches it), so entries_expected is exactly 1 and the close
  // consumes exactly 1, not a defensive range.
  assert.equal(permit.entries_expected, 1, "entries_expected is trued to the actual single consuming touch");
  assert.equal(permit.entries_used, 1, "entries_used matches exactly -- no under- or over-consumption");
  // target_entry_id (Codex R1 MAJOR 2): the permit BINDS to the entry it was minted for --
  // ck_cwp_target requires it non-null for every purpose, and both walls match new.id/
  // v_entry.id against it, not just client+fy+purpose.
  assert.equal(permit.target_entry_id, closed.close_entry_id, "the permit's target_entry_id is the pre-generated closing entry id -- nothing else can ride it in-transaction");
  const entryRow = (await rootQuery("select close_receipt_id from clara.journal_entries where id=$1", [closed.close_entry_id])).rows[0];
  assert.equal(entryRow.close_receipt_id, closed.receipt_id, "the closing entry carries its receipt id AS LINEAGE (born with it, never a later UPDATE)");

  // (i) a permit minted by a PRIOR (now-committed) transaction admits nothing -- not even
  // MINTING a brand-new draft: the journal_lines sibling wall blocks any line insert for a
  // posting_date inside the closed FY regardless of the entry's own status.
  const errPrior = await caught(() => draftOnly(preparer, { client: fx.client, postingDate: addDaysStr(fx.startsOn, 33) }));
  assert.ok(errPrior, "a permit from a PRIOR transaction does not admit a NEW write, not even a fresh draft");
  assert.equal(errPrior.code, "CLR19");
  assert.equal(JSON.parse(errPrior.detail ?? "{}").reason, "write_into_closed_period");

  // (ii) target_entry_id (Codex R1 MAJOR 2) now BINDS a forged permit to exactly one
  // entry -- "a write beyond entries_expected refuses" and "a write to a DIFFERENT entry
  // refuses" are now two DISTINCT guards in the same WHERE clause (id=target AND
  // entries_used<expected), not one. Attack both, separately, and assert what each
  // actually measures rather than assuming the old single-cause story still holds.
  // ALL of this must run in ONE transaction (created_xact = pg_current_xact_id() binds a
  // permit to the transaction that minted it, proven in the A19d dig -- a permit committed
  // in one transaction can never be consumed by a later one). A Postgres transaction that
  // takes an error is ABORTED for every statement after, including COMMIT (which silently
  // performs an implicit ROLLBACK) -- SAVEPOINT/ROLLBACK TO around each expected-failure
  // statement is the only way to keep the permit (and the transaction) alive afterward.
  const { getPool } = await import("./wave-a-fixtures.mjs");
  const firmId = (await rootQuery("select firm_id from clara.clients where id=$1", [fx.client])).rows[0].firm_id;
  const c = await getPool().connect();
  let mismatchErr = null;
  let capacityErr = null;
  let permitAUsedAfterMismatch = null;
  let usedAfterFirst = null;
  try {
    await c.query("set role clara_fn_owner");
    await c.query("begin");
    const permitRow = await c.query(
      `insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id, close_run_id,
         purpose, target_entry_id, entries_expected)
       select $1, $2, $3, cr.id, 'close_entry', $4, 1
         from clara.close_runs cr where cr.fiscal_year_id = $3 order by cr.started_at desc limit 1
       returning id`,
      [firmId, fx.client, fx.fy, draftA.entry_id],
    );
    assert.equal(permitRow.rows.length, 1, "mandatory setup: the manual permit row inserted, bound to draftA (table-owner DML)");
    const permitA = permitRow.rows[0].id;

    // (ii-a) TARGET MISMATCH: draftB's id never equals the permit's target -- the permit
    // is never even reached (v_permit.id stays null on the id=target predicate alone).
    await c.query("savepoint sp_mismatch");
    try {
      await c.query(
        "update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$2 where id=$1",
        [draftB.entry_id, owner],
      );
    } catch (e) {
      mismatchErr = e;
      await c.query("rollback to savepoint sp_mismatch");
    }
    permitAUsedAfterMismatch = (await c.query("select entries_used from clara.close_write_permits where id=$1", [permitA])).rows[0].entries_used;

    // (ii-b) BUDGET EXHAUSTION under a MATCHING target: draftA's own approve legitimately
    // consumes the permit's one expected unit; a SECOND touch on the SAME (now-approved)
    // draftA matches the target but finds no capacity left. _tf_entry_immutable (CLR08)
    // fires BEFORE the period wall in trigger name order and permits exactly ONE shape of
    // touch on an already-approved row: the complete reversed_by/reversal_reason linkage
    // pair (the reverse_entry stamp) -- any other column touch is refused CLR08 first,
    // never reaching the period wall at all. Use that shape so the SECOND touch actually
    // exercises the budget guard, not the immutability guard.
    await c.query(
      "update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$2 where id=$1",
      [draftA.entry_id, owner],
    );
    usedAfterFirst = (await c.query("select entries_used from clara.close_write_permits where id=$1", [permitA])).rows[0].entries_used;
    await c.query("savepoint sp_capacity");
    try {
      await c.query(
        "update clara.journal_entries set reversed_by=$2, reversal_reason=$3 where id=$1",
        [draftA.entry_id, fx.revenueEntry, "a19d ii-b second touch, beyond budget"],
      );
    } catch (e) {
      capacityErr = e;
      await c.query("rollback to savepoint sp_capacity");
    }
    await c.query("commit");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
  assert.ok(mismatchErr, "approving draftB under a permit bound to draftA's id must refuse -- the target never matches");
  assert.equal(mismatchErr.code, "CLR19", `expected CLR19 (got ${mismatchErr.code} -- ${mismatchErr.message})`);
  assert.equal(JSON.parse(mismatchErr.detail ?? "{}").reason, "write_into_closed_period");
  assert.equal(permitAUsedAfterMismatch, 0, "the target-mismatched attempt never touched the permit's own counter -- budget is untouched, this was never a capacity question");
  assert.equal(usedAfterFirst, 1, "draftA's own approve (matching target) consumed the permit's sole unit");
  assert.ok(capacityErr, "a SECOND touch on the SAME target, beyond entries_expected=1, must refuse");
  assert.equal(capacityErr.code, "CLR19", `expected CLR19 (got ${capacityErr.code} -- ${capacityErr.message})`);
  assert.equal(JSON.parse(capacityErr.detail ?? "{}").reason, "write_into_closed_period");
});

// ===========================================================================
// A6a-A6e -- E-R6 activation.
// ===========================================================================

test("A6a E-R6 -- correcting an entry inside a CLOSED period raises CLR19 'correction touches a closed period', read from the LIVE approve_wrong_client_correction body", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const toClient = await freshActiveClient(owner, "a6a-other");
  const fx = await cleanCloseableFY(owner, { tag: "a6a", prepSub: preparer, startsOn: "2027-01-01" });

  // The correction targets a DOCUMENT-CITED entry -- built BEFORE the close (its lines
  // need the FY still open), approved (so it does not trip the drafts gate), inside FY(n).
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [fx.client])).rows[0].firm_id;
  const doc = await filedDocument(preparer, { firm, client: fx.client });
  const docRes = await freshResolution(preparer, fx.client, { subjectKind: "document", subjectId: doc.documentId });
  const d = await draftEntryV3(preparer, {
    client: fx.client, resolution: docRes, document: doc.documentId, sha256: doc.sha256,
    postingDate: addDaysStr(fx.startsOn, 20),
    lines: [{ account_code: BANK1, debit_cents: 5000, credit_cents: 0, description: "dr" }, { account_code: REVN, debit_cents: 0, credit_cents: 5000, description: "cr" }],
    opKey: opk("x56-a6a-draft"),
  });
  await approveEntry(preparer, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x56-a6a-app") });

  await beginClose(owner, { fy: fx.fy });
  await finalizeClose(owner, { fy: fx.fy });

  await previewCorrection(preparer, { document: doc.documentId, fromClient: fx.client, toClient });
  await freshResolution(preparer, toClient, { subjectKind: "document", subjectId: doc.documentId });
  const proposal = await proposeCorrection(preparer, { document: doc.documentId, fromClient: fx.client, toClient, reason: "x56 a6a wrong-client correction" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;

  // The state fn resolves the token, and the guard's live body carries it verbatim.
  const state = await rootQuery("select clara._correction_period_state($1) as s", [d.entry_id]);
  assert.match(state.rows[0].s, /closing|closed/, `_correction_period_state on the document's FY(n) entry reads a real closed-state token (got ${state.rows[0].s})`);

  // approve_wrong_client_correction is maker-checker: the approver must differ from the
  // proposer (bob) -- hana (admin) checks it, same as A6b.
  const err = await caught(() => approveCorrection(world.users.hana, { correction: correctionId, planHash, attestation: null, opKey: opk("x56-a6a-approve") }));
  assert.ok(err, "a wrong-client correction touching a closed-period entry must be refused");
  assert.equal(err.code, "CLR19", `expected CLR19 (got ${err.code} -- ${err.message})`);
  assert.match(err.message ?? "", /closed period/i);

  const src = (await rootQuery(
    "select pg_get_functiondef(p.oid) as s from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='approve_wrong_client_correction'",
  )).rows[0].s;
  assert.match(src, /_correction_period_state/, "the guard's LIVE body (harvested via pg_get_functiondef) calls the state fn");
  assert.match(src, /no_period_model/, "and tests it against the permit token 'no_period_model'");
});

test("A6b E-R6 THE ACTIVATION TRAP -- a correction inside an OPEN period SUCCEEDS (the activation must not break every correction)", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const { freshActiveClient } = await import("./x56-fixtures.mjs");
  const fromClient = await freshActiveClient(owner, "a6b-from");
  const toClient = await freshActiveClient(owner, "a6b-to");

  const { previewCorrection, proposeCorrection, approveCorrection, idOf, filedDocument } = await import("./wave-a-fixtures.mjs");
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [fromClient])).rows[0].firm_id;
  const doc = await filedDocument(preparer, { firm, client: fromClient });

  await previewCorrection(preparer, { document: doc.documentId, fromClient, toClient });
  await freshResolution(preparer, toClient, { subjectKind: "document", subjectId: doc.documentId });
  const proposal = await proposeCorrection(preparer, { document: doc.documentId, fromClient, toClient, reason: "x56 a6b open-period correction" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;

  // approve_wrong_client_correction is maker-checker: the approver must differ from the
  // proposer (bob) -- hana (admin) checks it.
  const ok = await approveCorrection(world.users.hana, { correction: correctionId, planHash, attestation: null, opKey: opk("x56-a6b-approve") });
  assert.ok(ok, "a correction with no period model at all (no FY registered) SUCCEEDS -- E-R6 must not break the open-period path");
});

test("A6c E-R6 Law 2 -- the state fn resolves FAIL-CLOSED for an unknown entry id ('entry_missing', never NULL)", async (t) => {
  if (skip56(t)) return;
  const r = await rootQuery("select clara._correction_period_state($1) as s", [randomUUID()]);
  assert.equal(r.rows[0].s, "entry_missing", "an unknown entry id resolves to the non-NULL sentinel, not NULL (NULL <> 'no_period_model' is NULL, which would fail the guard OPEN)");
});

test("A6d E-R6 Law 3 -- the LIVE reader census for _correction_period_state is exactly the three known callers, guard predicate pinned to the first", async (t) => {
  if (skip56(t)) return;
  // Law 3 (spelling is not identity): the FAMILY is the search, not the literal
  // underscored string -- `_correction_period_state(` already CONTAINS
  // `correction_period_state(` as a substring, so this one pattern catches both the
  // protocol-token caller (still `_correction_period_state`) and the two honest-twin
  // readers 0056's S7 repointed (now bare `correction_period_state`) in one sweep.
  const census = (await rootQuery(
    `select coalesce(array_agg(p.proname::text order by p.proname), '{}') as c
       from pg_proc p
      where p.pronamespace='clara'::regnamespace
        and p.proname <> '_correction_period_state' and p.proname <> 'correction_period_state'
        and coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid))
              like '%correction\\_period\\_state(%' escape '\\'`,
  )).rows[0].c;
  assert.deepEqual(census, ["approve_wrong_client_correction", "preview_wrong_client_correction", "retire_document_filing"],
    `the live reader census (got ${JSON.stringify(census)}) -- exactly the three readers, one still on the protocol token, two repointed to the honest twin`);
  const guardSrc = (await rootQuery(
    "select coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)) as s from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='approve_wrong_client_correction'",
  )).rows[0].s;
  assert.match(guardSrc, /no_period_model/, "the GUARD's predicate is pinned to the protocol token");
});

test("A6e E-R6 THE STRUCTURAL PREREQUISITE -- the definer read SEES a closed FY row (the fiscal_years owner policy is present and effective); the human-lane read returns the caller's firm only", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a6e", prepSub: preparer, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  await finalizeClose(owner, { fy: fx.fy });

  // (i) the definer path SEES the closed FY: _correction_period_state on an entry inside it
  // resolves to a real closed-state token, not the permit fallback a missing owner policy
  // would silently produce (a POSITIVE read of the fact, not the migration's CREATE POLICY).
  const state = await rootQuery("select clara._correction_period_state($1) as s", [fx.revenueEntry]);
  assert.match(state.rows[0].s, /closing|closed/, `the definer read sees the FY (got ${state.rows[0].s})`);

  // The policy's existence, read from pg_policies by name -- not inferred from the answer.
  const pol = await rootQuery(
    "select 1 from pg_policies where schemaname='clara' and tablename='fiscal_years' and policyname='p_fy_owner' and roles::text like '%clara_fn_owner%'",
  );
  assert.equal(pol.rows.length, 1, "p_fy_owner exists on clara.fiscal_years for clara_fn_owner, read from pg_policies");

  // (ii) the SAME underlying read, under clara_authenticated, returns the caller's firm's
  // rows only -- RLS isolation, not a widened reach.
  const mineOnly = await humanQuery(owner, "select count(*)::int as n from clara.fiscal_years where id=$1", [fx.fy]);
  assert.equal(mineOnly.rows[0].n, 1, "the owning firm's human sees the row");
  const other = world.users.dave; // firm B owner -- a DIFFERENT firm
  const notMine = await humanQuery(other, "select count(*)::int as n from clara.fiscal_years where id=$1", [fx.fy]);
  assert.equal(notMine.rows[0].n, 0, "a human from ANOTHER firm sees zero rows for the same id -- RLS, not a privilege widening");
});
