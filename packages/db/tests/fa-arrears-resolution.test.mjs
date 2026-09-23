// #975 [0279] — 关账年度的折旧欠数由会计师判断重大性，Clara 只发问，不代为决定.
//
// WHAT THIS BATTERY IS FOR. #651 (0227) built the locked-period wall: a run into a closing or
// closed fiscal year is refused at the RUNNING door, and the due oracle skips such a period and
// names it in `skipped_closed`. What #651 left untouched is what happens to the skipped months'
// money: `clara._fa_asset_charges` charges every uncharged month up to the period end, so the
// closed year's months are absorbed by the next OPEN period's run — arrears by CONSTRUCTION,
// with nobody asked.
//
// THE OWNER'S RULING (2026-09-20), CHECKED AGAINST IAS 8. Under IAS 8 a MATERIAL prior-period
// error is restated in the prior year; only an IMMATERIAL one is folded into the current year.
// Materiality is a professional judgement, so Clara may not default it: she states the amount
// and the year and asks the accountant for one of exactly two resolutions — fold into the
// current open period, or reopen the affected year and charge it there as a restatement. The
// migration comment calling arrears "the ordinary accounting treatment" overstates the standard;
// that correction lives in `CONTEXT.md`, never in the applied migration file.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA — `humanQuery` at its least-privileged
// floor, or `roleQuery(ROLES.runtime)` for the machine lane. `rootQuery` appears only as a
// READBACK, or as LABELLED fixture DML where no audited verb reaches the shape (a fiscal year's
// lifecycle), and each such site says why in `fa-arrears-resolution-fixtures.mjs`.
//
// FRONTIER-GATED on the `fa_closed_year_arrears$` stem, never on a number. A FOCUSED invocation
// (without `--import ./tests/fa-arrears-resolution-preintegration-gate.mjs`) FAILS LOUDLY when
// 0279 is absent, because a skip is not evidence.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gate975, armed975, fiscalYear, reopenYear, recordResolution, resolutionRows,
  runManual, runPeriod, runDue, runDueAsHuman, entryRowOf, approveEntry, clientCharges, runRows,
  buyAsset, completeSL, mon, dayIn, opk,
  refuses, noteLane, printLaneNotes, printSkipCount, endPool, x41EnsureReady,
} from "./fa-arrears-resolution-fixtures.mjs";
import { previewRun, draftDepreciationEntries, depreciationEntries } from "./depreciation-history-fixtures.mjs";

let live = false;
before(async () => { live = await x41EnsureReady(); });
after(async () => {
  printLaneNotes("p975 closed-year arrears");
  printSkipCount("p975 closed-year arrears");
  await endPool();
});

/** Every cell needs 0041 (the register) and 0279 (this slice). */
async function gate(t) {
  if (!live) {
    t.skip("0041 is not applied — the #975 battery is dormant");
    return true;
  }
  return gate975(t);
}

/** THE WORKED FIGURE, from the fixture's own arithmetic and not from the code under test:
 *  a 360,000-sen asset over 36 months straight line charges exactly 10,000 sen a month. */
const MONTHLY = 10_000;

/** A client whose asset has been in service since month −3, with month −3 sealed inside a
 *  CLOSED fiscal year and month −2 outside any fiscal year at all. The due oracle therefore
 *  skips month −3 and offers month −2, whose run would fold month −3's charge forward. */
async function closedYearArrears(label, opts = {}) {
  const armed = await armed975(label, opts);
  const fy = await fiscalYear(armed.w.firms.A, armed.client, {
    startsOn: mon(-6).start, endsOn: armed.start.end, owner: armed.w.users.alice, status: opts.fyStatus ?? "closed",
  });
  return { ...armed, fy, open: mon(-2) };
}

// ===========================================================================================
// 1 · THE QUESTION (AC1). The human run door STOPS and ASKS; it chooses neither resolution.
// ===========================================================================================

test("p975.ask a run whose charge folds a CLOSED year's months forward stops BEFORE posting, states the arrears and the year, and offers exactly two resolutions", async (t) => {
  if (await gate(t)) return;
  const { w, client, fy, start, open } = await closedYearArrears("ask");

  // Mandatory setup: the oracle really does offer the OPEN period and really did skip month −3,
  // so the run below is the exact one #651 left folding arrears forward silently.
  const due = await runDue(client);
  assert.equal(due.due, true);
  assert.equal(due.period_start, open.start, `the oracle offers the OPEN period (got ${JSON.stringify(due)})`);
  assert.ok(due.skipped_closed.some((s) => s.period_start === start.start),
    "…and month −3 is in skipped_closed, exactly as #651 left it");

  const err = await refuses(() => runManual(w.users.bob,
    { client, periodStart: open.start, periodEnd: open.end }),
  "arrears_resolution_required", "p975.ask");
  assert.equal(err.code, "CLR38", "the question rides the FA family's own CLR38 axis");

  const d = JSON.parse(String(err.detail));
  assert.equal(d.axis, "closed_year_arrears");
  assert.equal(d.arrears_cents, MONTHLY,
    "the refusal STATES the amount — one month of a 360,000/36 straight line, independently worked");
  assert.equal(d.fiscal_years.length, 1, "…and names the year it belongs to, once");
  assert.equal(d.fiscal_years[0].fiscal_year_id, fy);
  assert.equal(d.fiscal_years[0].fy_status, "closed");
  assert.equal(d.fiscal_years[0].arrears_cents, MONTHLY);
  assert.deepEqual(d.resolutions, ["fold_current", "reopen_prior"],
    "EXACTLY two resolutions, neither of them chosen");
  assert.equal(d.chosen, null, "…and the refusal says so in the one place a reader would look");
  assert.equal(d.remedy, "record_fa_arrears_resolution");
  assert.match(String(err.message), /IAS 8/,
    "the human sentence names the standard the two resolutions come from");
  assert.match(String(err.message), /materiality|material/i,
    "…and says the judgement being asked for is materiality");

  assert.deepEqual(await draftDepreciationEntries(client), [],
    "NOT ONE DRAFT — the question sits before the first write, so a stopped run leaves nothing to withdraw");
  assert.deepEqual(await depreciationEntries(client), [],
    "…and no entry of any status survived it");
  assert.deepEqual(await clientCharges(client), [],
    "…and no charge row was written either");
  noteLane(`p975.ask: ${JSON.stringify(d.fiscal_years)}`);
});

// ===========================================================================================
// 2 · THE ANSWER (AC2). `fold_current` is recorded with its author and its timestamp, the run
//     proceeds on it, and a LATER run over the same client and year never asks again.
// ===========================================================================================

test("p975.fold a recorded fold_current is stored with its author and timestamp, the run then posts exactly as it did before #975, and a LATER run over the same year proceeds on the record without asking", async (t) => {
  if (await gate(t)) return;
  const { w, client, fy, start, open } = await closedYearArrears("fold");

  // Mandatory setup: the question really is standing before the answer is given.
  await refuses(() => runManual(w.users.bob, { client, periodStart: open.start, periodEnd: open.end }),
    "arrears_resolution_required", "p975.fold.setup");

  const t0 = new Date();
  const rec = await recordResolution(w.users.bob, {
    client, fiscalYear: fy, choice: "fold_current", arrearsCents: MONTHLY,
    periodStart: open.start, periodEnd: open.end, reason: "below the client's materiality",
  });
  assert.equal(rec.status, "recorded");
  assert.equal(rec.choice, "fold_current");

  const rows = await resolutionRows(client);
  assert.equal(rows.length, 1, "exactly one record, and it is the one just made");
  assert.equal(rows[0].fiscal_year_id, fy, "…against the FISCAL YEAR it was asked about");
  assert.equal(rows[0].client_id, client, "…and the client");
  assert.equal(String(rows[0].arrears_cents), String(MONTHLY),
    "…carrying the amount the person actually judged");
  assert.equal(rows[0].choice, "fold_current");
  assert.equal(rows[0].decided_by, w.users.bob, "…WHO decided it");
  assert.ok(rows[0].decided_at instanceof Date && rows[0].decided_at >= t0,
    "…and WHEN, from the database's own clock");
  assert.equal(rows[0].period_start, open.start, "…against the RUN it was asked for");
  assert.equal(rows[0].period_end, open.end);
  assert.equal(rows[0].active, true);

  // THE RUN NOW PROCEEDS, and what it does is byte-for-byte what #651 measured: the charge rows
  // keep their own months, the entry is dated in the OPEN period, and the closed year gets no
  // run receipt and no journal entry of its own.
  const receipt = await runManual(w.users.bob,
    { client, periodStart: open.start, periodEnd: open.end, opKey: opk("p975fold") });
  assert.notEqual(receipt.status, "parked", "the answered run is not parked");
  assert.equal(receipt.status, "drafted", "WD-R5: the FIRST run under a fresh authority still DRAFTS");
  const entry = await entryRowOf(receipt.entry_id);
  assert.equal(entry.posting_date, open.end,
    "the ENTRY is dated in the OPEN period — 0056's walls are satisfied without a permit");
  await approveEntry(w.users.alice,
    { entry: receipt.entry_id, expectedRevision: entry.revision_token, opKey: opk("p975apr") });

  const charges = await clientCharges(client);
  assert.ok(charges.some((c) => c.period_start === start.start),
    "…while the CHARGE rows still carry the months they belong to, including the closed year's");
  assert.deepEqual((await runRows(client)).filter((r) => r.period_end <= start.end), [],
    "no RUN receipt was written for a period inside the closed year");

  // THE RECEIPT NAMES THE RULING IT PROCEEDED UNDER — a judged fold, never a silent one.
  assert.ok(Array.isArray(receipt.arrears_folded) && receipt.arrears_folded.length === 1,
    `the receipt names the year it folded (got ${JSON.stringify(receipt.arrears_folded)})`);
  assert.equal(receipt.arrears_folded[0].fiscal_year_id, fy);
  assert.equal(receipt.arrears_folded[0].choice, "fold_current");
  assert.equal(receipt.arrears_folded[0].decided_by, w.users.bob);
  assert.equal(receipt.arrears_folded[0].resolution_id, rows[0].id);

  // A LATER RUN OVER THE SAME CLIENT AND YEAR. A second asset is acquired now but was IN SERVICE
  // from the closed year's own month, so the next run's charge folds that year forward again —
  // and this time nothing is asked, because the record answers it.
  const b = await buyAsset({ client, cents: 360_000, postingDate: dayIn(open, 20) });
  await completeSL(client, b.asset.id, { life: 36, start: start.start, description: "p975 fold later" });
  const later = await runManual(w.users.bob,
    { client, periodStart: open.start, periodEnd: open.end, opKey: opk("p975later") });
  assert.equal(later.status, "posted",
    `the LATER run proceeded on the record without asking (got ${JSON.stringify(later)})`);
  assert.equal(later.arrears_folded[0].resolution_id, rows[0].id,
    "…and it names the SAME record, not a second one");
  assert.equal((await resolutionRows(client)).length, 1,
    "…and no second answer was asked for or recorded");
});

// ===========================================================================================
// 3 · THE OTHER RESOLUTION (AC1/AC2). `reopen_prior` REFUSES the fold and points at the one
//     way back in; the reopened year's own period is then runnable in its own right.
// ===========================================================================================

test("p975.reopen a recorded reopen_prior refuses the fold and names clara.reopen_fiscal_year; once the year IS reopened its own period is runnable in its own right and nothing is folded", async (t) => {
  if (await gate(t)) return;
  const { w, client, fy, start, open } = await closedYearArrears("reopen");

  // Mandatory setup: the question stands, and the amount it states is the one judged below.
  const asked = await refuses(() => runManual(w.users.bob,
    { client, periodStart: open.start, periodEnd: open.end }),
  "arrears_resolution_required", "p975.reopen.setup");
  assert.equal(JSON.parse(String(asked.detail)).arrears_cents, MONTHLY);

  await recordResolution(w.users.bob, {
    client, fiscalYear: fy, choice: "reopen_prior", arrearsCents: MONTHLY,
    periodStart: open.start, periodEnd: open.end, reason: "material to this client",
  });

  const err = await refuses(() => runManual(w.users.bob,
    { client, periodStart: open.start, periodEnd: open.end, opKey: opk("p975reo") }),
  "arrears_awaiting_reopen", "p975.reopen");
  assert.equal(err.code, "CLR38");
  const d = JSON.parse(String(err.detail));
  assert.equal(d.chosen, "reopen_prior", "the refusal says which resolution was chosen");
  assert.equal(d.remedy, "reopen_fiscal_year", "…and the one way back in");
  assert.equal(d.fiscal_years[0].fiscal_year_id, fy);
  assert.equal(d.arrears_cents, MONTHLY);
  assert.match(String(err.message), /reopen_fiscal_year/,
    "the human sentence names the reopen path too, not only the detail json");
  assert.deepEqual(await depreciationEntries(client), [],
    "a restatement choice posts NOTHING into the open period — that is the whole point of it");

  // AND THE ORACLE STILL SKIPS THE YEAR WHILE IT IS CLOSED: #651's report is unchanged by the
  // answer, because the answer is about the ARREARS, not about the wall.
  const stillClosed = await runDue(client);
  assert.equal(stillClosed.period_start, open.start);
  assert.ok(stillClosed.skipped_closed.some((x) => x.period_start === start.start));

  // THE REOPEN ITSELF. `clara.reopen_fiscal_year` is untouched by this ticket; the fixture walks
  // the one lifecycle edge that door walks, and what is asserted here is what the FA lane does
  // once the column says `reopened`.
  await reopenYear(fy);
  const due = await runDue(client);
  assert.equal(due.due, true);
  assert.equal(due.period_start, start.start,
    `the reopened year's own month is now the oldest unmet period (got ${JSON.stringify(due)})`);
  assert.deepEqual(due.skipped_closed, [], "…and nothing is skipped any more");

  const run = await runManual(w.users.bob,
    { client, periodStart: start.start, periodEnd: start.end, opKey: opk("p975restate") });
  assert.equal(run.status, "drafted", "WD-R5: the first run under a fresh authority DRAFTS");
  const entry = await entryRowOf(run.entry_id);
  assert.equal(entry.posting_date, start.end,
    "THE CHARGE IS DATED IN THE REOPENED YEAR — that is the restatement, not a fold");
  assert.equal(run.arrears_folded, null,
    "…and nothing was folded forward: arrears_folded is null on a run that folds nothing");
  assert.equal(String(run.charged_cents), String(MONTHLY));
});

// ===========================================================================================
// 4 · THE SWEPT RUN (AC3). No person is there to answer, so the machine lane PARKS with a
//     stated reason instead of posting — and completes once a choice exists.
// ===========================================================================================

test("p975.parks the swept run door PARKS with a stated reason instead of posting, parks again on a reopen_prior record, and completes once the record is superseded by fold_current", async (t) => {
  if (await gate(t)) return;
  const { w, client, fy, start, open } = await closedYearArrears("parks");

  // THE BELT'S OWN PROBE still says due — parking is not "nothing to do".
  const due = await runDue(client);
  assert.equal(due.due, true);
  assert.equal(due.period_start, open.start);

  const parked = await runPeriod({ client, periodStart: open.start, periodEnd: open.end });
  assert.equal(parked.status, "parked",
    `the machine lane parks rather than posting (got ${JSON.stringify(parked)})`);
  assert.equal(parked.reason, "arrears_resolution_required", "…and SAYS why");
  assert.equal(String(parked.arrears_cents), String(MONTHLY), "…stating the amount");
  assert.equal(parked.fiscal_years[0].fiscal_year_id, fy, "…and the year");
  assert.deepEqual(parked.resolutions, ["fold_current", "reopen_prior"]);
  assert.equal(parked.chosen, null, "…and that nobody has chosen yet");
  assert.equal(parked.remedy, "record_fa_arrears_resolution");
  assert.deepEqual(await depreciationEntries(client), [],
    "NOTHING was posted — a park is a decision not to write, not a half-write");
  assert.deepEqual(await clientCharges(client), []);

  // A RESTATEMENT CHOICE PARKS TOO, on its own reason: the belt may not post into an open period
  // a person has ruled must be restated in the closed one.
  await recordResolution(w.users.bob, {
    client, fiscalYear: fy, choice: "reopen_prior", arrearsCents: MONTHLY,
    periodStart: open.start, periodEnd: open.end, reason: "material, pending reopen",
  });
  const parked2 = await runPeriod({ client, periodStart: open.start, periodEnd: open.end, opKey: opk("p975park2") });
  assert.equal(parked2.status, "parked");
  assert.equal(parked2.reason, "arrears_awaiting_reopen");
  assert.equal(parked2.chosen, "reopen_prior");
  assert.equal(parked2.remedy, "reopen_fiscal_year");
  assert.deepEqual(await depreciationEntries(client), []);

  // THE CHANGE OF MIND IS APPEND-ONLY: the old judgement keeps its author and its timestamp, and
  // exactly one row stays live.
  const superseding = await recordResolution(w.users.bob, {
    client, fiscalYear: fy, choice: "fold_current", arrearsCents: MONTHLY,
    periodStart: open.start, periodEnd: open.end, reason: "re-assessed as immaterial",
  });
  const rows = await resolutionRows(client);
  assert.equal(rows.length, 2, "two judgements on file, not one mutated row");
  assert.equal(rows[0].choice, "reopen_prior");
  assert.equal(rows[0].active, false, "…the first one is superseded");
  assert.equal(rows[0].superseded_by, w.users.bob);
  assert.ok(rows[0].superseded_at instanceof Date);
  assert.equal(rows[1].choice, "fold_current");
  assert.equal(rows[1].active, true);
  assert.equal(superseding.supersedes, rows[0].id, "…and the door SAYS what it superseded");
  assert.equal(rows.filter((r) => r.active).length, 1, "exactly one live answer per (client, year)");

  // AND THE PARKED RUN COMPLETES. Same door, same period, nothing else changed.
  const done = await runPeriod({ client, periodStart: open.start, periodEnd: open.end, opKey: opk("p975done") });
  assert.notEqual(done.status, "parked");
  assert.equal(done.status, "drafted", "WD-R5: the first run under a fresh authority DRAFTS");
  const entry = await entryRowOf(done.entry_id);
  assert.equal(entry.posting_date, open.end);
  assert.equal(done.arrears_folded[0].choice, "fold_current");
  assert.equal(done.arrears_folded[0].resolution_id, rows[1].id,
    "…and the receipt names the LIVE record, never the superseded one");
  await approveEntry(w.users.alice,
    { entry: done.entry_id, expectedRevision: entry.revision_token, opKey: opk("p975parkapr") });
  const charges = await clientCharges(client);
  assert.ok(charges.some((c) => c.period_start === start.start),
    "the closed year's month is charged, carrying its own month, exactly as #651 measured");
  assert.deepEqual((await runRows(client)).filter((r) => r.period_end <= start.end), [],
    "…and no run receipt was written inside the closed year");
});

// ===========================================================================================
// 5 · THE REPORT (the brief's first key interface). The due probe's skipped-closed report gains
//     the arrears it would otherwise fold forward, so the question can be asked BEFORE anything
//     posts — and `skipped_closed` itself does not move a byte.
// ===========================================================================================

test("p975.probe the due probe and the preview both state the closed-year arrears and the answer once it exists, while skipped_closed keeps exactly the shape #651 gave it", async (t) => {
  if (await gate(t)) return;
  const { w, client, fy, start, open } = await closedYearArrears("probe");

  const due = await runDue(client);
  assert.deepEqual(due.skipped_closed, [{
    period_start: start.start, period_end: start.end, fiscal_year_id: fy,
    fy_label: String(start.y), fy_status: "closed",
  }], "#651's own report, key for key — this ticket adds a sibling, it does not edit this one");

  assert.ok(due.closed_arrears, "the probe now says what the next run would fold forward");
  assert.equal(due.closed_arrears.arrears_cents, MONTHLY);
  assert.equal(due.closed_arrears.fiscal_years.length, 1);
  assert.equal(due.closed_arrears.fiscal_years[0].fiscal_year_id, fy);
  assert.equal(due.closed_arrears.fiscal_years[0].arrears_cents, MONTHLY);
  assert.equal(due.closed_arrears.fiscal_years[0].resolution, null,
    "…and that nobody has answered yet");

  const asHuman = await runDueAsHuman(w.users.carol, client);
  assert.deepEqual(asHuman.closed_arrears, due.closed_arrears,
    "clara.depreciation_run_due surfaces it verbatim — the surface reads what the belt reads");

  const pv = await previewRun(w.users.carol, client);
  assert.deepEqual(pv.skipped_closed, due.skipped_closed, "the preview still carries #651's report");
  assert.deepEqual(pv.closed_arrears, due.closed_arrears,
    "…and the arrears figure the question will be asked about, before anything is written");
  assert.equal(pv.period_start, open.start, "…for the OPEN period it would run");

  // ONCE ANSWERED, THE REPORT SAYS SO — the accountant sees the standing ruling rather than
  // being asked a second time.
  await recordResolution(w.users.bob, {
    client, fiscalYear: fy, choice: "fold_current", arrearsCents: MONTHLY,
    periodStart: open.start, periodEnd: open.end, reason: "immaterial",
  });
  const after = await previewRun(w.users.carol, client);
  assert.equal(after.closed_arrears.fiscal_years[0].resolution.choice, "fold_current");
  assert.equal(after.closed_arrears.fiscal_years[0].resolution.decided_by, w.users.bob);
  assert.ok(after.closed_arrears.fiscal_years[0].resolution.decided_at,
    "…with the timestamp it was made at");
  assert.deepEqual(after.skipped_closed, due.skipped_closed,
    "and answering the question still does not move #651's report");
});

test("p975.no_closed a client with NO closed year behaves exactly as it did before #975: nothing is asked, the run posts, and the report is empty rather than absent", async (t) => {
  if (await gate(t)) return;
  const { w, client, start } = await armed975("no_closed");

  const due = await runDue(client);
  assert.equal(due.due, true);
  assert.equal(due.period_start, start.start, "the oldest unmet period is the asset's own first month");
  assert.deepEqual(due.skipped_closed, [], "nothing was skipped");
  assert.deepEqual(due.closed_arrears, { arrears_cents: 0, fiscal_years: [] },
    "…and the arrears report is EMPTY rather than missing, so a reader never has to guess");

  const run = await runManual(w.users.bob, { client, periodStart: start.start, periodEnd: start.end });
  assert.equal(run.status, "drafted", "WD-R5: the first run under a fresh authority DRAFTS — unchanged");
  assert.equal(String(run.charged_cents), String(MONTHLY));
  assert.equal(run.arrears_folded, null, "nothing was folded, and the receipt says so");
  assert.equal((await resolutionRows(client)).length, 0, "nobody was asked anything");
});
