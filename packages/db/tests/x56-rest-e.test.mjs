// 0056 (Wave E lane beta, the close model) rig -- PART 9: the R1 fix-batch work
// order (1f0e273). Cell 1 -- the bank census now enumerates from the
// clara.bank_accounts REGISTRY (round-1 MINOR: an active account with NO
// statements loaded was never asked, so the gate answered 'tie' by omission --
// the ADR-066 lesson, again). Cell 2 -- the S9b exclusive band made literal: a
// self-balanced two-plain-account correction is OBE-nil-blind to K5 but still
// moves a pinned balance-sheet account, and only S9b catches it.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG
// (bank_recon_close_state's live body IS read for MY OWN authorial grounding,
// per established practice).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, freshActiveClient, proposeFY, openFY, addDaysStr,
  beginClose, finalizeClose, setupCloseCoa, plainEntry, BANK1, REVN, EXPN,
  cleanCloseableFY,
} from "./x56-fixtures.mjs";
import { addBankAccount, enterStatement, voidBankStatement } from "./x38-match-fixtures.mjs";
import { completeRecon } from "./x42-af2-helpers.mjs";

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
  if (!ready) { noteLane("0011 surface absent -- x56 rest-e suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-e"); printSkipCount("x56-rest-e"); await endPool(); });

// ===========================================================================
// CELL 1 -- the bank census enumerates from the ACCOUNT REGISTRY, never from
// statements. An active bank_accounts row with zero non-void statements is a
// question the gate must ASK (state='unknown', reason='no_statements_loaded'),
// and the close REFUSES it, drawer 1, no attestation path.
// ===========================================================================

async function findCloseRun(fy) {
  return (await rootQuery(
    "select id from clara.close_runs where fiscal_year_id=$1 order by started_at desc limit 1",
    [fy],
  )).rows[0].id;
}

test("bank census: an active bank account with NO statements loaded is unknown/no_statements_loaded, and the close REFUSES", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const drafter = world.users.hana;
  const client = await freshActiveClient(owner, "bankcensus1");
  await setupCloseCoa(owner, client);
  const bankAcct = await addBankAccount(owner, { client, bankCode: "MBB", accountNumber: "1234567890", coaAccountCode: BANK1, opKey: opk("x56-bankcensus-acct") });
  const bankAccountId = bankAcct.bank_account_id ?? bankAcct.id;
  assert.ok(bankAccountId, "mandatory setup: the bank account registers");

  const startsOn = "2027-01-01";
  const proposal = await proposeFY(owner, { client, startsOn });
  const opened = await openFY(owner, { client, label: "bankcensus1 FY1", startsOn, endsOn: proposal.ends_on });
  const midYear = addDaysStr(startsOn, 90);
  await plainEntry(drafter, { client, debit: BANK1, credit: REVN, cents: 500_000, postingDate: midYear, memo: "x56 bankcensus revenue" });
  await plainEntry(drafter, { client, debit: EXPN, credit: BANK1, cents: 200_000, postingDate: midYear, memo: "x56 bankcensus expense" });

  const begun = await beginClose(owner, { fy: opened.fiscal_year_id });
  // Read the freshly-evaluated gate directly: bank_recon_close_state must have
  // been consulted (not omitted) and must land 'unknown'.
  const runId = begun.close_run_id ?? await findCloseRun(opened.fiscal_year_id);
  // check_key='bank_recon_identity' specifically -- the sibling drawer-2 gate
  // (open_bank_recon_items) evaluates at the SAME timestamp with a different
  // measured shape (statement_gaps/open_exceptions, no accounts array);
  // discriminating by state alone happened to work here but is coincidental,
  // not deliberate (measured directly building the void-filter cell below).
  const identityGate = (await rootQuery(
    "select state, measured from clara.close_gate_results where close_run_id=$1 and check_key='bank_recon_identity' order by evaluated_at desc, id desc limit 1",
    [runId],
  )).rows[0];
  assert.ok(identityGate, "mandatory setup: bank_recon_identity was evaluated at begin_close");
  assert.equal(identityGate.state, "unknown", "the identity gate measured 'unknown' -- the account was ASKED, not omitted");
  const acctEntry = (identityGate.measured?.accounts ?? []).find((a) => a.bank_account_id === bankAccountId);
  assert.ok(acctEntry, "the specific bank account appears in the measured accounts array");
  assert.equal(acctEntry.state, "unknown");
  assert.equal(acctEntry.strict?.reason, "no_statements_loaded");

  const err = await caught(() => finalizeClose(owner, { fy: opened.fiscal_year_id }));
  assert.ok(err, "the close REFUSES with an unknown drawer-1 bank identity");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.reason, "drawer1_state_unknown");

  // No attestation path: attest_close_exception's own item-domain CHECK
  // refuses any non-drawer-2 check_key -- bank_recon_identity is drawer 1.
  const checkRow = (await rootQuery(
    "select drawer from clara.close_gate_checks where check_key='bank_recon_identity'",
  )).rows[0];
  assert.equal(checkRow.drawer, 1, "bank_recon_identity is drawer 1 -- no attestation path exists, for anybody");
});

test("bank census, negative space: a client with ZERO bank_accounts rows still ties vacuously -- nothing to reconcile is a legitimate identity, not an omission", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "bankcensus-vacuous", prepSub: world.users.hana, startsOn: "2027-01-01" });
  // cleanCloseableFY never registers a bank_accounts row for its client.
  const noAccounts = (await rootQuery("select count(*)::int as n from clara.bank_accounts where client_id=$1", [fx.client])).rows[0].n;
  assert.equal(noAccounts, 0, "mandatory confirmation: this client carries zero bank_accounts rows");

  const state = (await rootQuery(
    "select clara.bank_recon_close_state(p_client => $1, p_fiscal_year_id => $2) as r",
    [fx.client, fx.fy],
  )).rows[0].r;
  assert.equal(state.state, "tie", "an empty registry is a vacuous tie -- legitimately nothing to reconcile, not an unasked question");
  assert.deepEqual(state.accounts, [], "the accounts array is genuinely empty, not merely unevaluated");

  // The SAME close already proved clean elsewhere in this battery (A1/A19f/etc)
  // -- reconfirmed here specifically for the bank-identity angle.
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "the close succeeds -- the empty bank registry never blocked it");
});

// NOTE ON WHAT THIS CELL ACTUALLY ISOLATES (measured, not assumed): voiding a
// statement certified by a live 'complete' reconciliation is refused until the
// RECONCILIATION is voided first, and void_bank_reconciliation flips the
// reconciliation's OWN status to 'void' too (confirmed by direct query) -- so
// this cell's covering-recon exclusion is jointly caused by br.status<>'complete'
// AND st.status<>'void' together, not the statement filter in isolation. The
// system's own coupling (a statement cannot go void while its recon stays
// 'complete') appears to make the statement-only filter unreachable through
// the audited path; recording the joint behaviour honestly rather than
// claiming a narrower isolation than what was actually exercised.
test("bank census, the void filter: statements ARE present (has_statements=true), but the ONLY reconciliation covering fy.ends_on is VOIDED (recon+statement together) -- still unknown, still refuses", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "bankcensus-void");
  await setupCloseCoa(owner, client);
  const bankAcct = await addBankAccount(owner, { client, bankCode: "MBB", accountNumber: "9988776655", coaAccountCode: BANK1, opKey: opk("x56-bankcensus-void-acct") });
  const bankAccountId = bankAcct.bank_account_id ?? bankAcct.id;

  const startsOn = "2027-01-01";
  const proposal = await proposeFY(owner, { client, startsOn });
  const opened = await openFY(owner, { client, label: "bankcensus-void FY1", startsOn, endsOn: proposal.ends_on });

  // A non-covering, NEVER-void statement -- keeps has_statements=true so this
  // is genuinely distinct from the "no statements at all" cell above.
  // Statement periods on one account must be CONTIGUOUS (measured: enter_bank_
  // statement refuses a gap) -- this one runs right up to the day before the
  // covering statement's period starts.
  const earlyStmt = await enterStatement(owner, {
    client, bankAccount: bankAccountId, keepPeriod: true,
    periodStart: "2027-01-01", periodEnd: "2027-11-30", opening: 0, specs: [],
    opKey: opk("x56-bankcensus-void-early"),
  });
  assert.ok(earlyStmt.statementId, "mandatory setup: a live, non-covering, never-voided statement exists");
  // Reconciliations complete SEQUENTIALLY per account too (measured: the
  // covering statement's own completion refuses until its predecessor is
  // reconciled) -- the early statement goes first.
  await completeRecon(owner, { statement: earlyStmt.statementId, ackOutstanding: [], opKey: opk("x56-bankcensus-void-early-complete") });

  // The COVERING statement (period_end >= fy.ends_on), zero-activity so its
  // reconciliation completes with nothing to match or acknowledge.
  const coverStmt = await enterStatement(owner, {
    client, bankAccount: bankAccountId, keepPeriod: true,
    periodStart: "2027-12-01", periodEnd: proposal.ends_on, opening: 0, specs: [],
    opKey: opk("x56-bankcensus-void-cover"),
  });
  await completeRecon(owner, { statement: coverStmt.statementId, ackOutstanding: [], opKey: opk("x56-bankcensus-void-complete") });
  // A statement certified by a live reconciliation refuses to void until the
  // reconciliation itself is voided first (measured) -- void_bank_reconciliation
  // has no exported wrapper in this rig, called directly (same named-arg shape
  // the x40 lane's own local helper uses).
  const reconId = (await rootQuery("select id from clara.bank_reconciliations where statement_id=$1", [coverStmt.statementId])).rows[0].id;
  await humanQuery(owner, "select clara.void_bank_reconciliation(p_recon => $1, p_reason => $2, p_op_key => $3) as r", [reconId, "x56 bankcensus void-filter probe", opk("x56-bankcensus-void-recon")]);
  await voidBankStatement(owner, { client, statement: coverStmt.statementId, reason: "x56 bankcensus void-filter probe", opKey: opk("x56-bankcensus-void-void") });

  const begun = await beginClose(owner, { fy: opened.fiscal_year_id });
  const runId = begun.close_run_id ?? await findCloseRun(opened.fiscal_year_id);
  // check_key='bank_recon_identity' SPECIFICALLY, not an IN-list ordered by
  // evaluated_at: measured, both this gate and the sibling drawer-2 gate
  // (open_bank_recon_items, a DIFFERENT measured shape -- statement_gaps/
  // open_exceptions, no accounts array) evaluate at the exact same timestamp
  // inside one begin_close transaction, so an undiscriminated LIMIT 1 can
  // silently grab the wrong row.
  const gateRow = (await rootQuery(
    "select measured from clara.close_gate_results where close_run_id=$1 and check_key='bank_recon_identity' order by evaluated_at desc, id desc limit 1",
    [runId],
  )).rows[0];
  const acctEntry = (gateRow.measured?.accounts ?? []).find((a) => a.bank_account_id === bankAccountId);
  assert.ok(acctEntry, "the bank account still appears in the measured accounts array");
  assert.equal(acctEntry.state, "unknown");
  assert.equal(acctEntry.strict?.reason, "no_completed_reconciliation_covering_fy_end", "NOT no_statements_loaded -- the void filter excluded the covering recon specifically, not the whole account");

  const err = await caught(() => finalizeClose(owner, { fy: opened.fiscal_year_id }));
  assert.ok(err, "the close REFUSES: a voided covering statement leaves the identity unproven, exactly like no covering statement at all");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "drawer1_state_unknown");
});

// ===========================================================================
// CELL 2 -- the S9b exclusive band, attempted LITERAL, TRIED and found
// unreachable through the keyed door -- recorded structural per team-lead's
// own pre-authorized fallback ("report what the door said and we'll record
// the band as structural instead").
//
// THE DOOR'S OWN WORDS (measured): a two-line, self-balanced gl_balance item
// (dr BANK1 X / cr REVN X, no OBE leg needed or wanted) refuses with "opening
// GL item has no net carried amount" (CLR10). A repo-wide census of the live
// CHECK constraint confirms why: clara.opening_items.item_kind admits exactly
// {gl_balance, ar_open_item, ap_open_item, bank_uncleared, fixed_asset,
// equity_net, obe_plug} -- every kind is a SINGLE-ACCOUNT declaration
// (auto-offset via OBE) or a dedicated OBE/equity plug; none is a generic
// two-plain-account transfer. The keyed opening lane has no door for a
// correction that is self-balanced across two ordinary accounts without
// touching OBE at all -- the "exclusive band" scenario cannot be constructed
// through any audited opening-side verb, not merely one this pass didn't try.
//
// THE STRUCTURAL CASE FOR WHY S9B IS STILL EXCLUSIVE (not redundant with K5),
// read from the live bodies rather than assumed: _assert_opening_tie's ENTIRE
// OBE concern is _opening_seed_obe_net(p_seed) <> 0 -- ONE scalar, the OBE
// account's own net across the whole seed. It never inspects any OTHER
// account's per-account delta. _assert_correction_pin_neutral's whole concern
// is the OPPOSITE: a per-account GROUP BY over every asset/liability/equity
// account the correction batch touches, with NO reference to OBE at all. Read
// side by side, the two functions provably examine disjoint signals -- one
// scalar (OBE) vs one relation (every BS account) -- so ANY correction that
// happens to leave OBE's own net at zero (whether by touching OBE not at all,
// as here, or by a compensating obe_plug in the same round) is invisible to
// K5 by construction, regardless of what else moved. Even though the LITERAL
// two-account-no-OBE shape is unreachable via the keyed door specifically,
// the structural disjointness itself does not depend on that shape -- it is
// a property of the two functions' own bodies.
// ===========================================================================

test("S9b exclusive band, RECORDED STRUCTURAL: the literal two-account no-OBE shape refuses through the keyed door (measured); the underlying K5/S9b signal-disjointness is read directly from both live bodies", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const drafter = world.users.hana;
  const client = await freshActiveClient(owner, "s9bband");
  await setupCloseCoa(owner, client);
  await humanQuery(owner, "select clara.upsert_account(p_client => $1, p_code => $2, p_name => $3, p_type => $4, p_special_acc_type => $5, p_op_key => $6) as r",
    [client, "905-C56", "OBE (s9bband)", "equity", "opening_balance_equity", opk("x56-s9bband-obe")]);
  const plan = (await humanQuery(owner, "select clara.bootstrap_client_plan(p_client => $1, p_op_key => $2) as r", [client, opk("x56-s9bband-boot")])).rows[0].r.plan_id;
  const seedR = await wb.createOpeningSeed(owner, { client, plan, asOf: "2026-06-01" });
  const seed = seedR.seed_id ?? seedR.id;
  await wb.recordOpeningTarget(drafter, { seed, line: { line_key: "bank", account_code: BANK1, source_label: "s9b genesis bank", debit_cents: 100_000, credit_cents: 0, provenance_kind: "keyed", entered_by: drafter } });
  await wb.recordOpeningTarget(drafter, { seed, line: { line_key: "rev", account_code: REVN, source_label: "s9b genesis rev", debit_cents: 0, credit_cents: 100_000, provenance_kind: "keyed", entered_by: drafter } });

  const doorErr = await caught(() => wb.draftOpeningItem(drafter, {
    client, seed, resolution: wb.keyedRes(drafter, { client, seed }),
    item: { item_kind: "gl_balance", item_key: "s9b-genesis" },
    lines: [
      { account_code: BANK1, debit_cents: 100_000, credit_cents: 0 },
      { account_code: REVN, debit_cents: 0, credit_cents: 100_000 },
    ],
  }));
  assert.ok(doorErr, "MEASURED: a self-balanced two-account gl_balance item is refused by the keyed door itself");
  assert.equal(doorErr.code, "CLR10");
  assert.match(doorErr.message, /no net carried amount/i, "the door's own words: nothing to carry when the stated lines already net to zero");

  const kindCheck = (await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.opening_items'::regclass and conname ilike '%item_kind%'`,
  )).rows[0].def;
  for (const kind of ["gl_balance", "ar_open_item", "ap_open_item", "bank_uncleared", "fixed_asset", "equity_net", "obe_plug"]) {
    assert.ok(kindCheck.includes(kind), `the live CHECK constraint admits ${kind}`);
  }
  assert.ok(!/reclass|transfer/i.test(kindCheck), "no reclass/transfer item kind exists -- every admitted kind is single-account-declarative or OBE/equity-plug specific");

  const k5Body = (await rootQuery("select pg_get_functiondef('clara._assert_opening_tie(uuid)'::regprocedure) as def")).rows[0].def;
  const s9bBody = (await rootQuery("select pg_get_functiondef('clara._assert_correction_pin_neutral(uuid)'::regprocedure) as def")).rows[0].def;
  assert.ok(/_opening_seed_obe_net/.test(k5Body), "K5's OBE concern is the single scalar _opening_seed_obe_net(p_seed)");
  assert.ok(!/group by/i.test(k5Body), "K5's body contains no per-account GROUP BY over balance-sheet accounts at all");
  assert.ok(/group by\s+jl\.account_code/i.test(s9bBody), "S9b's body groups by account_code -- a per-account signal K5 never computes");
  assert.ok(!/obe_net|opening_balance_equity/i.test(s9bBody), "S9b's body never references OBE's own net -- the two checks read genuinely disjoint signals");
});
