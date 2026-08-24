// F-A4 PR-1b -- task #17's OWN battery, riding the Window-B migration
// (UNNUMBERED_f_a4_pr_1b_close_lifecycle.sql; numbered at merge). Design of record:
// `PROGRESS.md`'s task-#17 backlog block + `docs/plan/completed/progress-archive-2026-08-part2.md`
// (the archived R1 ruling) + close-key-1-design.md §3.9/Annex D.5 ("PR-1b carries all thirteen
// cells across, enumerated T1..T13 in the migration's battery file with their Track-B ids
// preserved").
//
// NO FULLER T1..T13 ENUMERATION EXISTS IN THE REPO than the one-line summary carried in the
// archive ("a 13-cell battery — T6 catches Fix B's regression class; T2/T4/T8/T9
// contract-blind"). This file originates the thirteen cells fresh under that constraint,
// preserving the two stated properties (T6's role; the four ▣ cells) — recorded here rather
// than silently presented as a rediscovered spec (review law 2: absence is not evidence).
//
// FIX A vs FIX B, restated so the cells below read against the right target. Fix A (built
// here): mark BOTH writer bodies' output at birth. Fix B (STRUCTURALLY BLOCKED, per the
// archive): a backfill/evaluator-workaround approach that would leave the ROW ITSELF
// dishonest (closing_transfer stays false) while relying on other machinery to get the
// AGGREGATE right. T6 is the cell built to catch exactly that regression class: it checks
// the COLUMN, not the evaluator's downstream arithmetic, and it also proves no retroactive
// backfill path exists (an approved entry cannot be revised).
//
// GATED on clara._begin_close_core's existence (a body only Window B creates) rather than on
// a migration filename or number, so a renumber at merge can never move what this file skips.
//
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, draftEntryV3, freshResolution,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, freshActiveClient, setupCloseCoa, openFY, beginClose,
  finalizeClose, reopenFY, reopenerFor, plainEntry, BANK1, REVN, EXPN, RE1,
} from "./x56-fixtures.mjs";
import {
  a21EnsureReady, freshWatchClient, approvedTurnoverEntry, evaluateSstWatch,
  openWatchRow, setTurnoverClassification, mintInteractive, wakeDraftEntry, reviseEntry,
  approveEntry, mytMonthDate, mytLastDayOfMonth, INC, CASH,
} from "./a21-helpers.mjs";
import { receiptRow, entryRow, lineRows, tbAt } from "./er9-corpus-fixtures.mjs";
import { withTxn } from "./rig-txn.mjs";

async function hasF_A4_PR1B() {
  const r = await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_begin_close_core'",
  );
  return r.rows.length > 0;
}

let ready = false, has56 = false, hasPR1B = false, has16 = false, world = null, W = null;

function gate(t) {
  if (!ready || !has56 || !hasPR1B) {
    markSkip();
    t.skip("F-A4 PR-1b (close-lifecycle Window B) not applied -- task #17 battery dormant");
    return true;
  }
  return false;
}
function gateWatch(t) {
  if (gate(t)) return true;
  if (!has16) { markSkip(); t.skip("0016 (SST watch) not applied -- the evaluator-facing cells are dormant"); return true; }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- task #17 battery skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 (close model) absent -- task #17 battery skipped"); return; }
  hasPR1B = await hasF_A4_PR1B();
  if (!hasPR1B) { noteLane("F-A4 PR-1b not applied -- task #17 battery dormant"); return; }
  const a21 = await a21EnsureReady();
  has16 = a21.has16;
  world = await wb.buildWaveBWorld();
  // A CUSTOM fixture, not cleanCloseableFY's convenience wrapper: evaluate_sst_watch reads
  // literal wall-clock now() (never the book clock) and evaluates a ROLLING 12 months ending
  // at the last COMPLETED month, so the closing entry -- which finalize_close always dates at
  // fy.ends_on -- must land INSIDE that window for T2/T4/T7 to test the closing_transfer
  // mechanism itself rather than a date-based exclusion that would prove nothing.
  //
  // SELF-RELATIVE, not hard-coded (opus A-3: a fixed "2025-08-01..2026-07-31" span walks OUT of
  // the rolling-12-month window the moment real wall-clock time passes it -- a dated tripwire,
  // exactly the class T7 already avoids by deriving its own dates from mytMonthDate /
  // mytLastDayOfMonth). endsOn = the last day of the month 3 months back (a safely-completed
  // month, T7's own margin); startsOn = the first day of the month 12 further back than THAT
  // (month -15), giving an exact 12-calendar-month span -- no length_reason needed, and every
  // date here is recomputed fresh against whenever this battery actually runs, never against
  // whenever it was authored.
  const endsOn = await mytLastDayOfMonth(-3);
  const startsOn = await mytMonthDate(-15, 1);
  const midYear = await mytMonthDate(-12, 15);
  const client = await freshActiveClient(world.users.alice, "t17");
  await setupCloseCoa(world.users.alice, client);
  const opened = await openFY(world.users.alice, { client, label: "t17 FY1", startsOn, endsOn });
  const revenueEntry = await plainEntry(world.users.hana, { client, debit: BANK1, credit: REVN, cents: 500_000, postingDate: midYear, memo: "t17 revenue" });
  const expenseEntry = await plainEntry(world.users.hana, { client, debit: EXPN, credit: BANK1, cents: 200_000, postingDate: midYear, memo: "t17 expense" });
  W = { client, fy: opened.fiscal_year_id, startsOn, endsOn, revenueEntry, expenseEntry };
  // Make W.client watch-capable on the SAME client that closes, so T2/T4 exercise the REAL
  // evaluator against the REAL closing entries rather than a lookalike fixture.
  await setTurnoverClassification(world.users.alice, {
    client: W.client, accountCode: REVN, classification: "included", serviceGroup: "G",
    effectiveFrom: "2018-09-01",
  });
});
after(async () => {
  printLaneNotes("f-a4-pr1b-task17");
  printSkipCount("f-a4-pr1b-task17");
  await endPool();
});

// =====================================================================================
// T1 -- finalize_close's own closing entry is born closing_transfer=true.
// =====================================================================================
test("T1 finalize_close's closing entry is born closing_transfer=true (Fix A; also T6's row-level guard in miniature -- read from the ROW, never from an aggregate)", async (t) => {
  if (gate(t)) return;
  const begun = await beginClose(world.users.alice, { fy: W.fy });
  W.run1 = begun.close_run_id;
  const closed = await finalizeClose(world.users.alice, { fy: W.fy });
  W.receipt1 = closed.receipt_id;
  W.entry1 = closed.close_entry_id;
  assert.ok(W.entry1, "mandatory setup: a populated year mints a real closing entry");
  const row = (await rootQuery(
    "select closing_transfer, is_year_end, status from clara.journal_entries where id=$1", [W.entry1],
  )).rows[0];
  assert.equal(row.status, "approved", "mandatory setup: the closing entry auto-approves in the same transaction");
  assert.equal(row.is_year_end, true, "mandatory setup: still born is_year_end (unchanged by this fix)");
  assert.equal(row.closing_transfer, true, "T1/Fix A: born marked");
  // Captured HERE, not re-read live inside T12: `trial_balance_as_of` is cumulative from
  // account inception, not fiscal-year-bounded, and T11 later posts a real (deliberately
  // pre-FY-dated, to dodge the period wall) entry against this same client's BANK1 --
  // which a live re-read at T12's turn in the file would pick up, contaminating a
  // cross-check that has nothing to do with T11's over-marking concern. Freezing the read
  // at the moment the state it is meant to prove actually existed keeps T12 order-independent.
  W.tbAfterClose1 = await tbAt(W.client, W.endsOn);
});

// =====================================================================================
// T2 ▣ -- the REAL evaluator, against the REAL entry: fully neutral (contract-blind: reads
// the live compliance_watches row, never this design's prose).
// =====================================================================================
test("T2 ▣ evaluate_sst_watch reads the SAME confirmed-included figure before and after the close -- the marked closing entry contributes nothing", async (t) => {
  if (gateWatch(t)) return;
  await evaluateSstWatch(W.client);
  const w = await openWatchRow(W.client, "G");
  assert.ok(w, "mandatory setup: the watch row exists once turnover is classified");
  assert.equal(Number(w.confirmed_included_cents), 500_000,
    "T2: the closing entry (closing_transfer=true) is fully excluded -- the figure equals the plain revenue posting alone, unmoved by the close");
});

// =====================================================================================
// T3 ▣ -- the B3 reopen mirror ALSO inherits the marker (R1a).
// =====================================================================================
test("T3 ▣ the reopen's reversal mirror is ALSO born closing_transfer=true (R1a: the mirror inherits the marker, copied through from the entry it reverses)", async (t) => {
  if (gate(t)) return;
  const reopener = await reopenerFor(world.users.alice, { closer: world.users.alice, alternate: world.users.hana });
  const reopened = await reopenFY(reopener, {
    fy: W.fy, reason: "t17 T3: reopening to prove the mirror inherits the marker",
    correctionTarget: { entry_ids: [W.entry1] },
  });
  // reversed_entry_id names the ORIGINAL (the entry that WAS reversed); reversal_entry_id
  // (from v_reversal) names the MIRROR (the entry that DOES the reversing) -- two distinct
  // keys in one payload, easy to swap.
  W.mirror1 = reopened.reversal_entry_id;
  assert.equal(reopened.reversed_entry_id, W.entry1, "mandatory setup: reversed_entry_id names the ORIGINAL closing entry");
  assert.ok(W.mirror1, "mandatory setup: a closing entry with a live receipt reopens to a real mirror");
  const row = (await rootQuery(
    "select closing_transfer, is_year_end, reversal_of, status from clara.journal_entries where id=$1", [W.mirror1],
  )).rows[0];
  assert.equal(row.reversal_of, W.entry1, "mandatory setup: the mirror names the entry it reverses");
  assert.equal(row.status, "approved");
  assert.equal(row.is_year_end, true, "mandatory setup: the mirror inherits is_year_end (unchanged behaviour)");
  assert.equal(row.closing_transfer, true, "T3/R1a: the mirror inherits closing_transfer=true from the entry it reverses");
});

// =====================================================================================
// T4 ▣ -- the evaluator STILL reads the unmoved figure with the mirror live.
// =====================================================================================
test("T4 ▣ evaluate_sst_watch STILL reads the unmoved figure with the reopen's mirror live -- both closing-shaped entries excluded together", async (t) => {
  if (gateWatch(t)) return;
  await evaluateSstWatch(W.client);
  const w = await openWatchRow(W.client, "G");
  assert.equal(Number(w.confirmed_included_cents), 500_000,
    "T4: the mirror (closing_transfer=true) is excluded exactly like the original -- the figure is still the plain revenue posting alone");
});

// =====================================================================================
// T5 -- a full close/reopen/reclose cycle: the SECOND closing entry is ALSO marked. Proves
// the fix is not a one-shot fluke tied to a single call.
// =====================================================================================
test("T5 a RECLOSE (begin_close -> finalize_close on the reopened year) mints a second closing entry, ALSO born closing_transfer=true", async (t) => {
  if (gate(t)) return;
  const begun2 = await beginClose(world.users.alice, { fy: W.fy });
  W.run2 = begun2.close_run_id;
  const closed2 = await finalizeClose(world.users.alice, { fy: W.fy });
  W.receipt2 = closed2.receipt_id;
  W.entry2 = closed2.close_entry_id;
  assert.ok(W.entry2, "mandatory setup: the reclose mints its own closing entry");
  assert.notEqual(W.entry2, W.entry1, "mandatory setup: the reclose is a NEW entry, not a re-approval of the first");
  const row = (await rootQuery(
    "select closing_transfer, is_year_end from clara.journal_entries where id=$1", [W.entry2],
  )).rows[0];
  assert.equal(row.is_year_end, true);
  assert.equal(row.closing_transfer, true, "T5: the fix holds across a second close on the same year, not only the first call");
});

// =====================================================================================
// T6 -- FIX B'S REGRESSION CLASS refused: no retroactive backfill path exists on an
// already-approved closing entry, so the mark-at-birth shape (Fix A) is the only lawful one.
// =====================================================================================
test("T6 Fix B's regression class refused: an already-approved closing entry cannot be revised -- no backfill door exists beside the mark-at-birth shape", async (t) => {
  if (gate(t)) return;
  const err = await caught(() => reviseEntry(world.users.alice, {
    entry: W.entry1,
    lines: { lines: [{ account_code: BANK1, debit_cents: 1, credit_cents: 0, description: "t17 t6 backfill attempt" }], flags: { closing_transfer: true } },
    expectedRevision: randomUUID(),
    opKey: opk("t17-t6"),
  }));
  assert.ok(err, "T6: revising an approved closing entry must refuse");
  assert.equal(err.code, "CLR22", `expected CLR22 'only a draft can be revised' (got ${err.code} -- ${err.message})`);
});

// =====================================================================================
// T7 -- the DIRECTION check: reproduces ADR-0072 ④'s corrected finding at the bytes. An
// unmarked is_year_end DEBIT to an included income account DEFLATES the rolling figure
// (never inflates it); marking it recovers full neutrality. Uses the evaluator's OWN
// existing draft/flags path (not this migration's verbs) -- a standalone sanity check on
// the mechanism the ruling reasoned about, independent of F-A4's own writers.
// =====================================================================================
test("T7 direction check: an unmarked is_year_end debit DEFLATES the rolling figure (the historical harm was suppression, never a false alarm); marking it recovers full neutrality", async (t) => {
  if (gateWatch(t)) return;
  const client = await freshWatchClient(world.users.alice, { name: `t17dir_${randomUUID().slice(0, 6)}` });
  const baseDate = await mytMonthDate(-3, 10);
  const yearEndDate = await mytLastDayOfMonth(-3);
  const baseCents = 700_00, phantomCents = 300_00;
  await approvedTurnoverEntry({ maker: world.users.alice, checker: world.users.hana, client, cents: baseCents, date: baseDate });
  await evaluateSstWatch(client);
  const w0 = await openWatchRow(client, "G");
  assert.equal(Number(w0.confirmed_included_cents), baseCents, "mandatory setup: the baseline figure is the one plain posting");

  // The PRE-FIX SHAPE: is_year_end alone, closing_transfer left at its default false --
  // exactly what the un-fixed finalize_close produced. A DEBIT to the included income
  // account, no offsetting credit in that classification, so the credit-minus-debit sum
  // MOVES DOWN by phantomCents.
  const phantom = await draftEntryV3(world.users.alice, {
    client, resolution: await freshResolution(world.users.alice, client),
    lines: [
      { account_code: INC, debit_cents: phantomCents, credit_cents: 0, description: "t17 t7 phantom closing debit" },
      { account_code: "3000", debit_cents: 0, credit_cents: phantomCents, description: "t17 t7 phantom to equity" },
    ],
    flags: { is_year_end: true }, postingDate: yearEndDate, memo: "t17 t7 unmarked phantom close", opKey: opk("t17-t7a"),
  }).catch(async () => {
    // "3000" may not be a live account on a bare freshWatchClient -- create it once, retry.
    const { upsertAccountClassed } = await import("./a21-helpers.mjs");
    await upsertAccountClassed(world.users.alice, { client, code: "3000", name: "Retained Earnings", type: "equity", opKey: opk("t17-t7re") });
    return draftEntryV3(world.users.alice, {
      client, resolution: await freshResolution(world.users.alice, client),
      lines: [
        { account_code: INC, debit_cents: phantomCents, credit_cents: 0, description: "t17 t7 phantom closing debit" },
        { account_code: "3000", debit_cents: 0, credit_cents: phantomCents, description: "t17 t7 phantom to equity" },
      ],
      flags: { is_year_end: true }, postingDate: yearEndDate, memo: "t17 t7 unmarked phantom close", opKey: opk("t17-t7a2"),
    });
  });
  await approveEntry(world.users.hana, { entry: phantom.entry_id, expectedRevision: phantom.revision_token, opKey: opk("t17-t7b") });
  await evaluateSstWatch(client);
  const w1 = await openWatchRow(client, "G");
  assert.equal(Number(w1.confirmed_included_cents), baseCents - phantomCents,
    "T7: an unmarked is_year_end debit DEFLATES the rolling figure by its own amount -- the ruling's corrected direction, reproduced live");

  // The FIXED SHAPE: an otherwise-identical entry, but marked at the draft stage (the human
  // lane's own settable path, P7/ADV-11) -- fully neutral, recovering the baseline.
  const marked = await draftEntryV3(world.users.alice, {
    client, resolution: await freshResolution(world.users.alice, client),
    lines: [
      { account_code: INC, debit_cents: phantomCents, credit_cents: 0, description: "t17 t7 marked closing debit" },
      { account_code: "3000", debit_cents: 0, credit_cents: phantomCents, description: "t17 t7 marked to equity" },
    ],
    flags: { is_year_end: true, closing_transfer: true }, postingDate: yearEndDate, memo: "t17 t7 marked close", opKey: opk("t17-t7c"),
  });
  await approveEntry(world.users.hana, { entry: marked.entry_id, expectedRevision: marked.revision_token, opKey: opk("t17-t7d") });
  await evaluateSstWatch(client);
  const w2 = await openWatchRow(client, "G");
  assert.equal(Number(w2.confirmed_included_cents), baseCents - phantomCents,
    "T7: the SECOND phantom is marked, so it changes nothing further -- the figure holds at the deflated total from the FIRST (unmarked) phantom, proving the marked one alone is neutral");
});

// =====================================================================================
// T8 ▣ -- both writer bodies' LIVE prosrc, read independently of the migration's own tail
// self-proof, carry the marking statement (law 3: spelling is not identity -- re-derived
// here, not trusted from the migration's own report).
// =====================================================================================
test("T8 ▣ finalize_close's and reopen_fiscal_year's LIVE prosrc, read fresh by this battery, both carry the closing_transfer marking", async (t) => {
  if (gate(t)) return;
  const fc = (await rootQuery(
    "select prosrc from pg_proc where oid='clara.finalize_close(uuid,text,text)'::regprocedure",
  )).rows[0].prosrc;
  // Re-anchored (opus A-1): the ORIGINAL {0,400}-char window matched inside the explanatory
  // COMMENT between the VALUES clause's own literals, not the column list -- re-derive the
  // SAME positional form the migration's own tail self-proof uses (no ';' between the column
  // list's closing paren and the VALUES clause's own literal true).
  assert.match(fc, /close_receipt_id, closing_transfer\)[^;]*\n\s*true\)/,
    "T8: finalize_close's closing-entry INSERT column list carries closing_transfer, followed positionally by a literal true in its OWN VALUES clause");
  const rf = (await rootQuery(
    "select prosrc from pg_proc where oid='clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'::regprocedure",
  )).rows[0].prosrc;
  assert.match(rf, /reversal_reason,\s*closing_transfer\)/, "T8: reopen_fiscal_year's mirror INSERT column list carries closing_transfer");
  assert.match(rf, /o\.closing_transfer/, "T8: the mirror copies THROUGH the original's own value, never asserting a fresh true");
});

// =====================================================================================
// T9 ▣ -- R1b's static half: the human-lane-marker wall lives in the SHARED draft core
// (_draft_entry_core, called by both the human draft verb and the agent/wake one -- revise_
// entry never needs the check at all, since its own _human_ctx already guarantees a human
// caller). Read fresh, not assumed from where the phrase happens to sit in a migration file.
// =====================================================================================
test("T9 ▣ R1b: the human-lane-marker wall (in _draft_entry_core, the shared core both draft verbs delegate to) is LIVE and byte-unchanged -- this migration touches no writer other than the ten it names", async (t) => {
  if (gate(t)) return;
  const owner = (await rootQuery(
    "select p.oid::regprocedure::text as sig, p.prosrc from pg_proc p where p.prosrc ilike '%human-lane marker%' and p.pronamespace='clara'::regnamespace",
  )).rows;
  assert.equal(owner.length, 2, `T9: exactly two bodies carry the wall (the shared core plus its one other caller-facing check) -- got ${owner.length}: ${owner.map((r) => r.sig).join(", ")}`);
  const core = owner.find((r) => r.sig.includes("_draft_entry_core"));
  assert.ok(core, "T9: _draft_entry_core is one of them");
  assert.match(core.prosrc, /closing_transfer is a human-lane marker/, "T9: the exact refusal text is still live");
  assert.match(core.prosrc, /not p_is_human and coalesce\(\(p_flags->>'closing_transfer'\)::boolean,false\)/,
    "T9: the wall's own predicate (agent-authored AND closing_transfer requested) is byte-unchanged");
});

// =====================================================================================
// T10 -- R1b's behavioural half, proven by THIS battery directly (not borrowed from another
// file staying green): an agent-authored draft still refuses the marker.
// =====================================================================================
test("T10 R1b behavioural: an agent-authored (wake) draft carrying closing_transfer=true still refuses CLR03, independent of a21's own coverage", async (t) => {
  if (gate(t)) return;
  const client = await freshWatchClient(world.users.alice, { name: `t17agent_${randomUUID().slice(0, 6)}` });
  const firmRow = (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0];
  const cred = await mintInteractive(firmRow.firm_id);
  const resolution = await freshResolution(world.users.alice, client);
  const err = await caught(() => wakeDraftEntry(cred, {
    client,
    resolution,
    lines: [
      { account_code: CASH, debit_cents: 1000, credit_cents: 0, description: "t17 t10 dr" },
      { account_code: INC, debit_cents: 0, credit_cents: 1000, description: "t17 t10 cr" },
    ],
    flags: { is_year_end: true, closing_transfer: true },
    memo: "t17 t10 agent closing-transfer attempt", opKey: opk("t17-t10"),
  }));
  assert.ok(err, "T10: an agent-authored draft carrying closing_transfer=true must refuse");
  assert.equal(err.code, "CLR03", `expected CLR03 (agent-authority family), got ${err.code} -- ${err.message}`);
  assert.match(err.message, /human-lane marker/i,
    "T10: the refusal names the WALL that fired (the human-lane-marker check) -- CLR03 alone is the whole agent-authority family, not specific to this predicate");
});

// =====================================================================================
// T11 -- no over-marking: an ordinary posting is never born closing_transfer=true.
// =====================================================================================
test("T11 an ORDINARY posting (not a closing entry, not a reopen mirror) is never born closing_transfer=true -- the fix is scoped to exactly the two writers it names", async (t) => {
  if (gate(t)) return;
  // Dated BEFORE the FY (2024, never closed) rather than inside it -- by this point in the
  // file the year has already been closed twice (T1, T5), so a posting dated INSIDE it would
  // hit the period wall (CLR19) and prove nothing about over-marking.
  const id = await plainEntry(world.users.hana, {
    client: W.client, debit: EXPN, credit: BANK1, cents: 999,
    postingDate: "2024-06-15", memo: "t17 t11 ordinary posting",
  });
  W.ordinaryEntry = id;
  const row = (await rootQuery("select closing_transfer, is_year_end from clara.journal_entries where id=$1", [id])).rows[0];
  assert.equal(row.is_year_end, false, "mandatory setup: an ordinary posting is not is_year_end");
  assert.equal(row.closing_transfer, false, "T11: no over-marking -- an unrelated posting stays unmarked");
});

// =====================================================================================
// T12 -- accounting-correctness precedence (hard constraint 1): Fix A changes ONLY the
// closing_transfer column's value. The books themselves are untouched.
// =====================================================================================
test("T12 the books are UNCHANGED by this fix: pl_net_cents, the retained-earnings account, the closing-position PIN and the closing entry's own LINES are exactly what an unmarked close would have produced -- read and cross-checked, not merely named", async (t) => {
  if (gate(t)) return;
  const r1 = await receiptRow(W.receipt1);
  const plNet = 500_000 - 200_000;
  assert.equal(Number(r1.pl_net_cents), plNet, "T12: pl_net_cents is the plain FY movement (revCents - expCents), unaffected by the marker");
  assert.equal(r1.retained_earnings_account, RE1, "T12: the roll still names the chart's single retained-earnings marker");
  const e1 = await entryRow(W.entry1);
  assert.equal(e1.origin, "manual");
  assert.equal(e1.status, "approved");

  // Codex T12: the title claims the CLOSING-POSITION PIN and read only four unrelated fields --
  // actually READ the pin and the lines. BANK1 nets to the plain revenue-minus-expense movement
  // (untouched by the closing entry, which never posts to it); RE1 absorbs the profit as a
  // CREDIT (a positive pl_net_cents increases equity on its normal side).
  const pin = r1.snapshot.closing_position;
  assert.equal(Number(pin[BANK1]), plNet, "T12: the pin's BANK1 position is the plain revenue-minus-expense movement");
  assert.equal(Number(pin[RE1]), -plNet, "T12: the pin's RE1 position is a CREDIT of the net profit (debit-credit convention, so the stored value is negative)");
  // Cross-checked against an INDEPENDENT trial-balance read (never the receipt re-read against
  // itself, matching R9.C4's own discipline) -- the pin is not merely internally consistent, it
  // agrees with the books. Read at T1 (W.tbAfterClose1), not live here -- see the comment
  // at the capture site: a live re-read at this point in the file would also see T11's
  // later, deliberately pre-FY-dated ordinary posting against this same client's BANK1.
  const tb = W.tbAfterClose1;
  assert.equal(Number(pin[BANK1]), tb.get(BANK1) ?? 0, "T12: the pin agrees with an independent trial-balance read on BANK1");
  assert.equal(Number(pin[RE1]), tb.get(RE1) ?? 0, "T12: the pin agrees with an independent trial-balance read on RE1");
  assert.equal(tb.get(REVN) ?? 0, 0, "T12: REVN nets to zero at the year end -- the close rolled it, marker or not");
  assert.equal(tb.get(EXPN) ?? 0, 0, "T12: EXPN nets to zero at the year end -- the close rolled it, marker or not");

  // The closing entry's own LINES: three lines (REVN debited away, EXPN credited away, RE1
  // credited the profit), balanced to the cent -- the closing_transfer marker is a column on
  // the entry header, and touches not one line amount.
  const lines = await lineRows(W.entry1);
  assert.equal(lines.length, 3, "T12: two moved P&L accounts plus the retained-earnings roll line");
  const byAccount = new Map(lines.map((l) => [l.account_code, l]));
  assert.equal(Number(byAccount.get(REVN)?.debit_cents), 500_000, "T12: REVN's own line debits away its full credit balance");
  assert.equal(Number(byAccount.get(EXPN)?.credit_cents), 200_000, "T12: EXPN's own line credits away its full debit balance");
  assert.equal(Number(byAccount.get(RE1)?.credit_cents), plNet, "T12: RE1's own line credits exactly the net profit");
  const totalDebits = lines.reduce((a, l) => a + Number(l.debit_cents), 0);
  const totalCredits = lines.reduce((a, l) => a + Number(l.credit_cents), 0);
  assert.equal(totalDebits, totalCredits, "T12: the closing entry balances to the cent");
});

// =====================================================================================
// T13 -- the full round-trip census: exactly the closing-shaped entries this cycle produced
// carry the marker, and nothing else does. Advisory-only blast radius, demonstrated whole.
// =====================================================================================
test("T13 census: across the whole close/reopen/reclose cycle, EXACTLY the closing-shaped entries (entry1, mirror1, entry2) carry closing_transfer=true, and every ordinary entry reads false", async (t) => {
  if (gate(t)) return;
  const marked = await rootQuery(
    "select id from clara.journal_entries where client_id=$1 and closing_transfer=true order by id", [W.client],
  );
  const markedIds = new Set(marked.rows.map((r) => r.id));
  assert.equal(markedIds.size, 3, `T13: exactly three rows carry the marker on this client (got ${markedIds.size})`);
  for (const id of [W.entry1, W.mirror1, W.entry2]) {
    assert.ok(markedIds.has(id), `T13: ${id} is one of the marked rows`);
  }
  const unmarkedButYearEnd = await rootQuery(
    "select count(*)::int as n from clara.journal_entries where client_id=$1 and is_year_end=true and closing_transfer=false", [W.client],
  );
  assert.equal(unmarkedButYearEnd.rows[0].n, 0, "T13: no is_year_end row on this client escaped marking -- the closed-world census is the wall, not a sample");
});

// =====================================================================================
// T14 (both reviewers) -- the mirror's FALSE branch. T3 proves the copy-through in the ONE
// direction Fix A ever produces (true -> true); the reopen body's own statement is
// `o.closing_transfer` -- a COPY, not an assertion of true -- and that copy mechanism itself
// needs its OTHER direction proven, or the "forward-only" claim rests on an untested branch.
// =====================================================================================
test("T14 the mirror's FALSE branch: a closing entry born in the pre-Fix-A shape (closing_transfer=false) reopens to a mirror that copies FALSE through too -- the o.closing_transfer copy-through proven in BOTH directions, not just the true case T3 covers", async (t) => {
  if (gate(t)) return;
  const endsOn = await mytLastDayOfMonth(-19);
  const startsOn = await mytMonthDate(-31, 1);
  const client = await freshActiveClient(world.users.alice, "t17unmark");
  await setupCloseCoa(world.users.alice, client);
  const opened = await openFY(world.users.alice, { client, label: "t17 unmarked FY", startsOn, endsOn });
  const fy = opened.fiscal_year_id;
  const midYear = await mytMonthDate(-28, 15);
  await plainEntry(world.users.hana, { client, debit: BANK1, credit: REVN, cents: 100_000, postingDate: midYear, memo: "t14 revenue" });
  await beginClose(world.users.alice, { fy });
  const closed = await finalizeClose(world.users.alice, { fy });
  assert.ok(closed.close_entry_id, "mandatory setup: a real closing entry exists as the copy template");
  const realClose = (await rootQuery(
    "select closing_transfer from clara.journal_entries where id=$1", [closed.close_entry_id],
  )).rows[0];
  assert.equal(realClose.closing_transfer, true, "mandatory setup: finalize_close (Fix A) bore it true, as T1 already proves");

  // _tf_entry_immutable (0003:371-382) blocks EVERY column change on an approved row except
  // the reversed_by/reversal_reason pair -- closing_transfer included, confirmed empirically
  // on this rig: a raw UPDATE against the real closing entry above raises CLR08 ("approved
  // entries are immutable except a complete reversal-linkage pair"). finalize_close (Fix A)
  // never produces a false-marked row either, so no door -- governed or raw -- reaches a
  // false-marked APPROVED closing entry once one already exists. close_receipts.close_entry_id
  // is separately immutable (0056:1589), so the real receipt above cannot be repointed either.
  //
  // The only way to exercise the mirror's copy-through on its untested FALSE branch is to
  // construct a closing-shaped entry+receipt pair entirely outside the writers: a synthetic
  // entry inserted at 'draft' (closing_transfer is free pre-approval) and legally approved
  // (draft->approved's own allow-set never touches closing_transfer, so the value set at
  // INSERT rides the transition unchanged), plus a second close_receipts row naming it, with
  // the real one above superseded first (its one legal transition) to free the fiscal year's
  // one-active-close-receipt slot. Every OTHER column on both synthetic rows is copied
  // verbatim from the real close's own output -- the only thing varied from a genuine close
  // is the one bit this cell exists to prove: closing_transfer at birth.
  // journal_entries.close_receipt_id -> close_receipts(id) is DEFERRABLE INITIALLY DEFERRED
  // (0056:1620-1621, precisely for this birth-order problem: the real finalize_close mints
  // the entry naming a receipt id before that receipt row exists either). Two separate
  // autocommitting rootQuery() calls would each close their own one-statement transaction and
  // trip the deferred check at that statement's own end, before the second row exists -- so
  // the whole synthetic pair goes through ONE explicit transaction (db-tests.md: "a fixture
  // built from several statements needs withTxn()"), exactly mirroring how the real writer
  // gets away with the same forward reference: one PL/pgSQL call, one transaction.
  // t_period_wall / t_period_wall_lines (0056:711-756) refuse an approved-class touch on
  // journal_entries, and ANY journal_lines write, once the entry's own posting_date falls in
  // a closing/closed fiscal year -- which this one already is, per the real close above --
  // UNLESS a close_write_permits row THIS transaction created names the entry (purpose
  // 'close_entry', target_entry_id = e2). Real finalize_close mints this same permit for its
  // own closing entry (0056:510-513) before ever touching journal_entries/journal_lines; the
  // synthetic entry needs the identical permit for the identical reason.
  const e2 = randomUUID();
  const r2 = randomUUID();
  await withTxn(async (c) => {
    await c.query(
      `insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id, close_run_id,
          purpose, target_entry_id, entries_expected)
        select firm_id, client_id, fiscal_year_id, close_run_id, 'close_entry', $1, 1
          from clara.close_receipts where id = $2`,
      [e2, closed.receipt_id],
    );
    await c.query("update clara.close_receipts set status='superseded' where id=$1", [closed.receipt_id]);
    await c.query(
      `insert into clara.journal_entries (id, client_id, status, posting_date, memo, origin,
          is_year_end, maker_actor, last_human_editor, close_receipt_id, closing_transfer)
        values ($1, $2, 'draft', $3, $4, 'manual', true, $5, $5, $6, false)`,
      [e2, client, endsOn, "t14 synthetic pre-Fix-A-shaped closing entry", world.users.alice, r2],
    );
    await c.query(
      `insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
        select $1, line_no, account_code, debit_cents, credit_cents, description
          from clara.journal_lines where entry_id=$2 order by line_no`,
      [e2, closed.close_entry_id],
    );
    await c.query(
      "update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$1 where id=$2",
      [world.users.alice, e2],
    );
    await c.query(
      `insert into clara.close_receipts (id, firm_id, client_id, fiscal_year_id, close_run_id,
          prior_close_receipt_id, kind, status, closed_by, closed_at, segregation_mode,
          last_preparer_actor, self_attestation, pl_net_cents, retained_earnings_account,
          closing_tb_digest, gate_digest, books_watermark, evaluator_version_ids, dataset_sha256,
          close_entry_id, snapshot)
        select $1, firm_id, client_id, fiscal_year_id, close_run_id,
          prior_close_receipt_id, kind, 'active', closed_by, closed_at, segregation_mode,
          last_preparer_actor, self_attestation, pl_net_cents, retained_earnings_account,
          closing_tb_digest, gate_digest, books_watermark, evaluator_version_ids, dataset_sha256,
          $2, snapshot
          from clara.close_receipts where id = $3`,
      [r2, e2, closed.receipt_id],
    );
  });
  const synthetic = (await rootQuery(
    "select closing_transfer, status from clara.journal_entries where id=$1", [e2],
  )).rows[0];
  assert.equal(synthetic.status, "approved", "mandatory setup: the synthetic entry is legally approved (draft->approved)");
  assert.equal(synthetic.closing_transfer, false, "mandatory setup: the synthetic entry carries the pre-Fix-A shape (false), unchanged by the approval transition");

  const reopener = await reopenerFor(world.users.alice, { closer: world.users.alice, alternate: world.users.hana });
  const reopened = await reopenFY(reopener, {
    fy, reason: "t17 T14: reopening a synthetic pre-Fix-A-shaped closing entry to prove the mirror's copy-through in the FALSE direction",
    correctionTarget: { entry_ids: [e2] },
  });
  assert.equal(reopened.reversed_entry_id, e2, "mandatory setup: reversed_entry_id names the synthetic entry");
  const mirrorId = reopened.reversal_entry_id;
  assert.ok(mirrorId, "mandatory setup: the synthetic entry reopens to a real mirror");
  const mirror = (await rootQuery(
    "select closing_transfer, reversal_of, status from clara.journal_entries where id=$1", [mirrorId],
  )).rows[0];
  assert.equal(mirror.reversal_of, e2, "mandatory setup: the mirror names the synthetic entry");
  assert.equal(mirror.status, "approved");
  assert.equal(mirror.closing_transfer, false,
    "T14: the mirror copies closing_transfer=FALSE through -- o.closing_transfer is a genuine copy of whatever the original carries, in both directions, not a value that happens to always read true because Fix A never produces false");
});
