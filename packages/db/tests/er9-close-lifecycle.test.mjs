// E-R9 SANDBOX ACCEPTANCE BATTERY — PART 1: ACTIVATION → PLAN → begin_close → finalize.
// See er9-corpus-fixtures.mjs for the corpus shape and the contract-blind discipline.
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip, waveAEnsureReady,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, freshActiveClient, setupCloseCoa, proposeFY, openFY,
  beginClose, finalizeClose, verifyClose, getCloseReadiness, listFiscalYears, plainEntry,
  AR1, AP1, RE1, REVN, EXPN, BANK1, addDaysStr,
} from "./x56-fixtures.mjs";
import {
  FY_START, FY_END, REV_CENTS, EXP_CENTS, PL_NET,
  getClosePlan, entryRow, lineRows, receiptRow, latestGates, tbAt, fyRow, fyStatus,
  eligibleCheckers, permitsFor, openItemCount, detailOf, planCheck, isoDay,
} from "./er9-corpus-fixtures.mjs";

let ready = false, has56 = false, world = null, W = null;

function gate(t) {
  if (!ready || !has56) { markSkip(); t.skip("0056 (close model) not present"); return true; }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent — E-R9 lifecycle battery skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied — close model absent"); return; }
  world = await wb.buildWaveBWorld();
  // Prepared by bob, closed by alice: the two-person arm, which is what a firm with >=2
  // eligible humans takes. (BEE's own firm has ONE — part 2 drives that arm explicitly.)
  W = await cleanCloseableFY(world.users.alice, {
    tag: "er9", prepSub: world.users.bob,
    startsOn: FY_START, revCents: REV_CENTS, expCents: EXP_CENTS,
  });
});
after(async () => {
  printLaneNotes("er9-close-lifecycle");
  printSkipCount("er9-close-lifecycle");
  await endPool();
});

// =====================================================================================
// PHASE A — ACTIVATION (ADR-067: "activation = the first human open_fiscal_year").
// =====================================================================================

test("R9.A1 activation: the FIRST human open_fiscal_year mints ordinal 1 with exact dates and no predecessor — and a client with NO fy_end fact is labelled default_1231, never silently 'asserted'", async (t) => {
  if (gate(t)) return;
  assert.equal(W.startsOn, FY_START, "mandatory setup: the fixture year starts where the corpus does");
  assert.equal(W.endsOn, FY_END, "mandatory setup: propose_fiscal_year derived 2025-12-31 from an UNSET fy_end (BEE's live shape)");

  const fy = await fyRow(W.fy);
  assert.ok(fy, "the fiscal year row exists");
  assert.equal(fy.ordinal, 1, "the first fiscal year of a client is ordinal 1");
  assert.equal(fy.prior_fy_id, null, "ordinal 1 names no predecessor");
  assert.equal(fy.status, "open", "a freshly opened year is 'open'");
  assert.equal(isoDay(fy.starts_on), FY_START);
  assert.equal(isoDay(fy.ends_on), FY_END);
  assert.equal(fy.fy_end_source, "default_1231",
    "an UNSET client fy_end + an unchanged proposal ⇒ the honesty label is default_1231 (matrix A23) — BEE's live shape exactly");
  assert.equal(fy.length_reason, null, "a 12-month year needs no length_reason");
  assert.equal(fy.opened_by, world.users.alice, "opened_by records the human who opened it");

  const n = (await rootQuery("select count(*)::int as n from clara.fiscal_years where client_id=$1", [W.client])).rows[0].n;
  assert.equal(n, 1, "exactly one fiscal year exists for this client after activation");

  const listed = await listFiscalYears(world.users.alice, { client: W.client });
  assert.equal(listed.length, 1, "list_fiscal_years reports the one year");
  assert.equal(listed[0].fiscal_year_id, W.fy);
  assert.equal(listed[0].status, "open");
  assert.equal(listed[0].fy_end_source, "default_1231");
});

test("R9.A2 the CONTRAST arm: an end date the human CHOSE is labelled 'asserted', and a short year without its length_reason refuses by name", async (t) => {
  if (gate(t)) return;
  const client = await freshActiveClient(world.users.alice, "er9asserted");
  await setupCloseCoa(world.users.alice, client);
  const proposal = await proposeFY(world.users.alice, { client, startsOn: FY_START });
  assert.equal(proposal.ends_on, FY_END, "mandatory setup: the proposal falls back to 12/31");
  assert.equal(proposal.fy_end.fallback, true, "mandatory setup: the fallback flag is TRUE for an unset fy_end");
  assert.equal(proposal.fy_end.month, 12);
  assert.equal(proposal.fy_end.day, 31);

  const err = await caught(() => openFY(world.users.alice, {
    client, label: "er9 short", startsOn: FY_START, endsOn: "2025-06-30", lengthReason: null,
  }));
  assert.ok(err, "a ~6-month year without its stated reason must refuse");
  assert.equal(err.code, "CLR10", `expected CLR10 (got ${err.code} — ${err.message})`);
  assert.equal(detailOf(err).reason, "fy_length_reason_required");

  const opened = await openFY(world.users.alice, {
    client, label: "er9 short", startsOn: FY_START, endsOn: "2025-06-30",
    lengthReason: "er9 rig: a stub period, stated as required",
  });
  const row = await fyRow(opened.fiscal_year_id);
  assert.equal(row.fy_end_source, "asserted",
    "an end date that differs from the proposal is 'asserted' — the label tracks the ACT, not the calendar");
  assert.equal(row.length_reason, "er9 rig: a stub period, stated as required");
});

test("R9.A3 get_close_plan BEFORE any close run: all 13 catalog checks ride with their drawer, every result reads the honest 'not_yet_measured', run and receipt read 'absent' — and the goods-trading check is SHOWN, never hidden, for a services client", async (t) => {
  if (gate(t)) return;
  const plan = await getClosePlan(world.users.alice, W.fy);
  assert.equal(plan.fiscal_year.id, W.fy);
  assert.equal(plan.fiscal_year.client_id, W.client, "the plan carries client_id for the caller-side client-switch belt");
  assert.equal(plan.fiscal_year.status, "open");
  assert.equal(plan.fiscal_year.ends_on, FY_END);
  assert.equal(plan.fiscal_year.fy_end_source, "default_1231");
  assert.equal(plan.close_run.state, "absent", "no close run has begun");
  assert.equal(plan.receipt.state, "absent", "no receipt exists");

  const catalogN = (await rootQuery("select count(*)::int as n from clara.close_gate_checks")).rows[0].n;
  assert.equal(catalogN, 13, "mandatory setup: the shipped gate catalog carries 13 checks");
  assert.equal(plan.checks.length, 13, "EVERY applicable check rides the plan, all 13");

  for (const c of plan.checks) {
    assert.equal(c.result.state, "not_yet_measured",
      `${c.check_key} reads not_yet_measured before any run — absence stated, never a fabricated 'unknown'`);
    assert.equal(c.items.length, 1, `${c.check_key} carries the single __gate__ placeholder before measurement`);
    assert.equal(c.items[0].item_key, "__gate__");
    assert.equal(c.items[0].attestation.state, "absent");
  }
  const drawers = plan.checks.map((c) => c.drawer);
  assert.deepEqual([...drawers].sort(), drawers, "the plan is ordered by drawer");
  assert.equal(plan.checks.filter((c) => c.drawer === 1).length, 6, "six drawer-1 identities");
  assert.equal(plan.checks.filter((c) => c.drawer === 2).length, 5, "five drawer-2 default-refuse checks");
  assert.equal(plan.checks.filter((c) => c.drawer === 3).length, 2, "two drawer-3 advisory checks");
  assert.equal(planCheck(plan, "closing_stock_present").applies_when, "goods_trading",
    "the goods-trading check is PRESENT for a services client — hiding it would hide fresh positive evidence");
});

// =====================================================================================
// PHASE B — begin_close and the gate sweep.
// =====================================================================================

test("R9.B1 begin_close mints ONE in-progress run, flips the year to 'closing', and measures every catalog check — drawer-1 all PASS with zero bank accounts and zero assets enrolled", async (t) => {
  if (gate(t)) return;
  const begun = await beginClose(world.users.alice, { fy: W.fy });
  W.run = begun.close_run_id;
  assert.ok(W.run, "begin_close returns its run id");
  assert.equal(begun.fiscal_year_id, W.fy);
  assert.equal(await fyStatus(W.fy), "closing", "the year is mid-close");

  const run = (await rootQuery("select * from clara.close_runs where id=$1", [W.run])).rows[0];
  assert.equal(run.state, "in_progress");
  assert.equal(run.started_by, world.users.alice);
  assert.equal(run.ended_at, null, "an in-progress run carries no end stamp");
  const live = (await rootQuery(
    "select count(*)::int as n from clara.close_runs where fiscal_year_id=$1 and state='in_progress'", [W.fy])).rows[0].n;
  assert.equal(live, 1, "exactly ONE live run per fiscal year (the partial unique index)");

  const g = await latestGates(W.run);
  assert.equal(g.size, 13, "all 13 checks produced a result row");

  // THE ZERO-ENROLMENT POSITIVE. This client has no bank accounts and no fixed assets —
  // BEE's live posture on the bank side exactly (0 bank_accounts, measured). The two
  // identities that could have read 'unknown' — and an unknown drawer-1 refuses with no
  // override for anybody — read PASS instead. That is the cell that says a bank-less
  // client's close does not stall on a gate it can never satisfy.
  const banks = (await rootQuery("select count(*)::int as n from clara.bank_accounts where client_id=$1", [W.client])).rows[0].n;
  const assets = (await rootQuery("select count(*)::int as n from clara.fixed_assets where client_id=$1", [W.client])).rows[0].n;
  assert.equal(banks, 0, "mandatory setup: zero bank accounts enrolled");
  assert.equal(assets, 0, "mandatory setup: zero fixed assets enrolled");
  for (const k of ["ar_control_tie", "ap_control_tie", "fa_control_tie", "bank_recon_identity"]) {
    assert.equal(g.get(k).drawer, 1, `${k} is a drawer-1 identity`);
    assert.equal(g.get(k).state, "pass",
      `drawer-1 ${k} measures PASS (got ${g.get(k)?.state}) — an 'unknown' here refuses absolutely`);
  }
  assert.equal(g.get("closing_stock_present").state, "pass",
    "closing_stock_present PASSES on a recorded trade_nature='services' fact — it is only 'unknown' when the fact is ABSENT");
  assert.equal(g.get("closing_stock_present").measured.reason, "not_goods_trading", "and says why");
  assert.equal(g.get("unapproved_drafts_in_period").state, "pass", "no drafts sit inside the fixture year");
  assert.equal(g.get("unapproved_drafts_in_period").measured.draft_count, 0);
  assert.equal(g.get("depreciation_through_fy_end").state, "pass", "no enrolled asset lags");
  assert.equal(g.get("open_bank_recon_items").state, "pass", "no open exception, no statement gap");
  assert.equal(g.get("uncoded_documents").state, "pass", "no FY-dated filing lacks its entry");
  assert.equal(g.get("bank_recon_informational").drawer, 3);
  assert.equal(g.get("fa_register_tie_view").drawer, 3);
});

test("R9.B2 the plan and the readiness read AGREE, check for check and digest for digest — two readers of one truth cannot disagree about which run or which state", async (t) => {
  if (gate(t)) return;
  const plan = await getClosePlan(world.users.alice, W.fy);
  assert.equal(plan.close_run.state, "present");
  assert.equal(plan.close_run.close_run_id, W.run);
  assert.equal(plan.close_run.run_state, "in_progress");
  assert.equal(plan.close_run.started_by, world.users.alice);
  assert.equal(plan.fiscal_year.status, "closing");

  const readiness = await getCloseReadiness(world.users.alice, { client: W.client, fy: W.fy });
  assert.equal(readiness.close_run_id, W.run, "get_close_readiness resolves the SAME run");
  assert.equal(readiness.run_state, "in_progress");
  assert.equal(readiness.fy_end_source, "default_1231");
  assert.equal(readiness.gates.length, 13);

  const rByKey = new Map(readiness.gates.map((x) => [x.check_key, x]));
  for (const c of plan.checks) {
    const r = rByKey.get(c.check_key);
    assert.ok(r, `readiness carries ${c.check_key}`);
    assert.equal(c.result.state, r.state, `${c.check_key}: plan state === readiness state`);
    assert.equal(c.result.measured_digest, r.measured_digest, `${c.check_key}: the two reads bind the SAME digest`);
    assert.equal(c.drawer, r.drawer, `${c.check_key}: same drawer`);
  }
  // WHAT `attested` ACTUALLY MEANS, measured rather than assumed from its name. The field
  // is literally "every outstanding item of this gate carries a LIVE attestation bound to
  // the CURRENT digest". On a run with no attestations at all that is FALSE for every gate
  // — passing ones included — because the coverage test finds no attestation row, not
  // because anything is wrong. finalize_close is unaffected: its drawer sweep only consults
  // drawer-2 gates in fail/unknown/error, so a passing gate is never asked for coverage.
  // Recorded as a READING because the field name invites the opposite one: a surface that
  // renders `attested` as a tick would paint every clean gate red. get_close_plan's
  // per-item attestation.state ('absent' | 'live' | 'stale') is the unambiguous read, and
  // it is the one the /close page consumes.
  const attestations = (await rootQuery(
    "select count(*)::int as n from clara.close_attestations where close_run_id=$1", [W.run])).rows[0].n;
  assert.equal(attestations, 0, "mandatory setup: this run carries no attestations at all");
  for (const r of readiness.gates) {
    assert.equal(r.attested, false,
      `${r.check_key}: with zero attestation rows the coverage test is false for EVERY gate, passing ones included`);
  }
  for (const c of plan.checks) {
    for (const it of c.items) {
      assert.equal(it.attestation.state, "absent",
        `${c.check_key}/${it.item_key}: get_close_plan states the absence per item — the unambiguous read`);
    }
  }
});

// =====================================================================================
// PHASE C — finalize_close: receipt, closing entry, the roll, the pin, the permit, the wall.
// =====================================================================================

test("R9.C1 finalize_close on a clean populated year: the receipt records the exact loss, the retained-earnings account it rolled to, and the two-person segregation it earned", async (t) => {
  if (gate(t)) return;
  const eligible = await eligibleCheckers(world.firms.A);
  assert.ok(eligible >= 2, `mandatory setup: >=2 eligible checkers (got ${eligible}) so the two-person arm is the one under test`);

  const closed = await finalizeClose(world.users.alice, { fy: W.fy });
  W.receipt1 = closed.receipt_id;
  W.entry1 = closed.close_entry_id;
  assert.ok(W.receipt1, "finalize_close minted a receipt");
  assert.ok(W.entry1, "a populated year mints a closing entry");
  assert.equal(Number(closed.pl_net_cents), PL_NET,
    `pl_net_cents is the exact FY movement in cents (expected ${PL_NET} — a LOSS, BEE's own direction)`);
  assert.equal(closed.retained_earnings_account, RE1, "the roll names the chart's single retained_earnings marker");
  assert.equal(closed.segregation_mode, "two_person",
    "closer (alice) ≠ the year's last human preparer (bob) at >=2 eligible ⇒ two_person");

  const r = await receiptRow(W.receipt1);
  assert.equal(r.kind, "close");
  assert.equal(r.status, "active");
  assert.equal(r.closed_by, world.users.alice);
  assert.equal(r.last_preparer_actor, world.users.bob, "the receipt names the preparer it was segregated against");
  assert.equal(r.self_attestation, null, "a two-person close records NO self-attestation");
  assert.equal(Number(r.pl_net_cents), PL_NET);
  assert.equal(r.prior_close_receipt_id, null, "a first year chains from nothing");
  assert.equal(r.close_entry_id, W.entry1, "the receipt names its closing entry");
  assert.match(r.dataset_sha256, /^[0-9a-f]{64}$/, "dataset_sha256 IS a sha256, not an md5 alias");
  assert.equal(r.snapshot.opening_tie.basis, "wave_b_opening_machinery",
    "a first year states its opening basis honestly rather than claiming a pin that does not exist");
  assert.deepEqual(r.snapshot.superseded_reopen_receipt_ids, [], "nothing was superseded by a first close");
  assert.deepEqual(r.snapshot.attestations, [], "a clean close carries no attestations");

  const one = (await rootQuery(
    "select count(*)::int as n from clara.close_receipts where fiscal_year_id=$1 and kind='close'", [W.fy])).rows[0].n;
  assert.equal(one, 1, "the close receipt exists EXACTLY once");
  assert.equal(await fyStatus(W.fy), "closed");
  const run = (await rootQuery("select * from clara.close_runs where id=$1", [W.run])).rows[0];
  assert.equal(run.state, "finalized");
  assert.equal(run.ended_by, world.users.alice);
  assert.ok(run.ended_at, "a finalized run is stamped, never deleted");
});

test("R9.C2 the closing entry's SHAPE: dated the year end, born year-end-flagged and lineage-carrying, one line per moved P&L account at the exact inverse, and the balancing line on retained earnings", async (t) => {
  if (gate(t)) return;
  const e = await entryRow(W.entry1);
  assert.equal(e.status, "approved");
  assert.equal(isoDay(e.posting_date), FY_END, "the closing entry is dated the FY end, never today");
  assert.equal(e.is_year_end, true, "the closing entry is born is_year_end");
  assert.equal(e.origin, "manual");
  assert.equal(e.close_receipt_id, W.receipt1, "lineage is carried at BIRTH — no post-approval UPDATE exists");
  assert.equal(e.maker_actor, world.users.alice);
  assert.equal(e.checker_actor, world.users.alice,
    "the closing entry's checker is the closer — this is exactly what a later reopen is segregated against");
  assert.equal(e.reversed_by, null, "not yet reversed");
  assert.match(e.memo, /Year-end close/, "the memo names the act");

  const lines = await lineRows(W.entry1);
  assert.equal(lines.length, 3, "two moved P&L accounts + one retained-earnings line");
  assert.equal(lines[0].account_code, EXPN, "lines are ordered by account code: the expense first");
  assert.equal(Number(lines[0].debit_cents), 0);
  assert.equal(Number(lines[0].credit_cents), EXP_CENTS, "a net-debit expense is CREDITED away, to the cent");
  assert.equal(lines[1].account_code, REVN);
  assert.equal(Number(lines[1].debit_cents), REV_CENTS, "a net-credit income account is DEBITED away, to the cent");
  assert.equal(Number(lines[1].credit_cents), 0);
  assert.equal(lines[2].account_code, RE1, "the last line is the retained-earnings roll");
  assert.equal(Number(lines[2].debit_cents), -PL_NET, `a LOSS DEBITS retained earnings by ${-PL_NET} cents`);
  assert.equal(Number(lines[2].credit_cents), 0);
  assert.match(lines[2].description, /retained earnings/i);

  const dr = lines.reduce((a, l) => a + Number(l.debit_cents), 0);
  const cr = lines.reduce((a, l) => a + Number(l.credit_cents), 0);
  assert.equal(dr, cr, "the closing entry balances");
  assert.equal(dr, REV_CENTS + -PL_NET, "and balances at the arithmetic the movement implies");
  assert.equal(await openItemCount(W.entry1), 0,
    "a P&L→RE close moves no subledger — the hook was CALLED and its no-op proved, not assumed");
});

test("R9.C3 the ROLL, measured on the books themselves: every P&L account nets to ZERO through the year end and retained earnings has absorbed the loss to the cent", async (t) => {
  if (gate(t)) return;
  const tb = await tbAt(W.client, FY_END);
  assert.equal(tb.get(REVN) ?? 0, 0, "income nets to zero at FY end after the close");
  assert.equal(tb.get(EXPN) ?? 0, 0, "expense nets to zero at FY end after the close");
  assert.equal(tb.get(RE1) ?? 0, -PL_NET,
    `retained earnings carries the year's result: a ${-PL_NET}-cent DEBIT balance for a loss of that size`);
  assert.equal(tb.get(BANK1) ?? 0, REV_CENTS - EXP_CENTS, "the balance sheet outside equity is unchanged by the roll");
  assert.equal(tb.get(AR1) ?? 0, 0, "the AR control stayed untouched");
  assert.equal(tb.get(AP1) ?? 0, 0, "the AP control stayed untouched");
});

test("R9.C4 the PIN and its verification: verify_close recomputes from scratch and reports verified:true, with an empty diff on the balance-sheet pin and on the P&L-zero probe", async (t) => {
  if (gate(t)) return;
  const v = await verifyClose(world.users.alice, { receipt: W.receipt1 });
  assert.equal(v.verified, true, `verify_close verifies a fresh close (strict=${JSON.stringify(v.strict)})`);
  assert.equal(v.receipt_status, "active");
  assert.equal(v.receipt_kind, "close");
  assert.deepEqual(v.strict.closing_position_diffs, [], "the stored pin equals a fresh recompute");
  assert.deepEqual(v.strict.pl_zero_diffs, [], "no P&L account carries a balance at the year end");
  assert.equal(v.successor_tie, "pinned_not_yet_consumed", "no successor year has consumed the pin yet");
  for (const p of v.strict.probes) {
    assert.ok(!["mismatch", "unknown", "error"].includes(p.state), `every drawer-1 probe re-measures clean (got ${p.state})`);
  }

  const pin = (await receiptRow(W.receipt1)).snapshot.closing_position;
  const tb = await tbAt(W.client, FY_END);
  assert.equal(Number(pin[RE1]), -PL_NET, "the pin carries retained earnings at the cent");
  assert.equal(Number(pin[BANK1]), tb.get(BANK1), "the pin agrees with an independent trial-balance read");
  assert.ok(!(REVN in pin) && !(EXPN in pin), "the pin is balance-sheet ONLY — P&L accounts are not stored positions");
});

test("R9.C5 the close-write PERMIT is real and spent: one permit bound to the pre-generated closing entry by id, budget ONE, consumed once — and no application role can mint one", async (t) => {
  if (gate(t)) return;
  const permits = await permitsFor(W.fy);
  assert.equal(permits.length, 1, "exactly one permit was minted for the close");
  const p = permits[0];
  assert.equal(p.purpose, "close_entry");
  assert.equal(p.target_entry_id, W.entry1, "the permit NAMES the entry it admits — nothing else can ride it");
  assert.equal(Number(p.entries_expected), 1, "budget of exactly one approved-class touch");
  assert.equal(Number(p.entries_used), 1, "consumed exactly once by the census-visible flip");
  assert.equal(p.close_run_id, W.run);

  for (const role of ["clara_authenticated", "clara_agent_ro", "clara_runtime"]) {
    const can = (await rootQuery(
      "select has_table_privilege($1,'clara.close_write_permits','insert') as p", [role])).rows[0].p;
    assert.equal(can, false, `${role} cannot INSERT a permit — a forged permit is the one thing that would turn this door generic`);
  }
});

test("R9.C6 the WALL bites after the close: an approved posting dated inside the closed year is REFUSED by name, a posting after it still lands, and the plan now surfaces the receipt the dashboard renders", async (t) => {
  if (gate(t)) return;
  const err = await caught(() => plainEntry(world.users.bob, {
    client: W.client, debit: EXPN, credit: BANK1, cents: 4321,
    postingDate: addDaysStr(FY_START, 200), memo: "er9 post-close intrusion",
  }));
  assert.ok(err, "a write into a closed period must refuse");
  assert.equal(err.code, "CLR19", `expected CLR19 write_into_closed_period (got ${err.code} — ${err.message})`);
  assert.equal(detailOf(err).reason, "write_into_closed_period");

  const after = await plainEntry(world.users.bob, {
    client: W.client, debit: EXPN, credit: BANK1, cents: 1111,
    postingDate: "2026-03-01", memo: "er9 next-year posting",
  });
  assert.ok(after, "a posting dated after the closed year still lands — the wall is period-scoped, not client-scoped");

  const plan = await getClosePlan(world.users.alice, W.fy);
  assert.equal(plan.fiscal_year.status, "closed");
  assert.equal(plan.close_run.run_state, "finalized");
  assert.equal(plan.receipt.state, "present");
  assert.equal(plan.receipt.receipt_id, W.receipt1);
  assert.equal(plan.receipt.status, "active");
  assert.equal(Number(plan.receipt.pl_net_cents), PL_NET);
  assert.equal(plan.receipt.retained_earnings_account, RE1);
  assert.equal(plan.receipt.close_entry_id, W.entry1);
  assert.equal(plan.receipt.segregation_mode, "two_person");
  assert.equal(Number(plan.receipt.closing_position[RE1]), -PL_NET, "the plan surfaces the pin itself");
});
