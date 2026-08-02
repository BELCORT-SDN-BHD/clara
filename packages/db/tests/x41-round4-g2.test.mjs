// 0041 Wave D-a — the ROUND-4 battery: THE OPEN-PERIOD HALF OF G2 (the stub
// extension), and the ENDED-period half that keeps its refusal.
//
//   x41.t1  MONTHLY cadence — revise effective THIS month, then dispose the successor
//           THIS month: it must SUCCEED, and the ancestor's owed month rides the
//           DISPOSAL STUB as a per-asset ledger row (stub_charges is per-asset on the
//           wire and names exactly the lineage rows the stub charged).
//   x41.t2  ANNUAL cadence — a mid-FY revision inside the OPEN financial year, then a
//           disposal inside that same FY: the PRE-REVISION FY segment rides the stub
//           per-asset beside the successor's own segment, ONE entry, sen-exact.
//   x41.t3  The EARLIER-period arm is UNCHANGED: an ancestor that owes a period EARLIER
//           than the disposal's own is still refused `period_earlier_unmet`, the
//           refusal NAMES a cadence-aligned period that has ENDED, and running that
//           named period is a remedy a professional can actually execute.
//   x41.t4  THE SEAM THE EXTENSION CREATES: when the disposal's own period has ALREADY
//           ENDED, the stub charges an ancestor month the SWEEP could also come for —
//           and it must not be charged twice. Stub territory and run territory meet
//           exactly here.
//
// WHY. The G2 bound made the disposal precondition reach THROUGH the disposal period,
// which is right for an EARLIER period (running it is a followable remedy) and wrong for
// the period the disposal itself sits in: an OPEN period cannot be run — the run verb
// refuses it `not_ended`, the sweep answers `period_not_ended` — so the refusal names a
// remedy nobody can execute and, on the ANNUAL cadence, takes a lawful act (sell an asset
// whose particulars were revised earlier this financial year) off the table for up to
// twelve months. The adjudicated fold is the STUB EXTENSION: ancestor months INSIDE the
// disposal's own cadence period ride the disposal stub as per-asset rows — the disposal
// already charges its own period for the disposed row, and the asymmetry between "stub
// territory" and "run territory" was the whole source of the hole.
//
// THE ARITHMETIC IS ASSERTED AGNOSTICALLY. Which lineage row owns a month that a
// revision straddles is the register's business, not this cell's: every sen assertion
// here is derived from each row's OWN §3.1 straight-line rate
// (floor((cost − residual) / life)) times the months that row's ledger ranges actually
// cover, plus a whole-lineage coverage law — every calendar month from the in-service
// month through the disposal month charged EXACTLY ONCE, never twice.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers): authored
// from the design of record, the adjudicated round-4 fold, and the battery's own
// conventions. This lane never reads 0041's SQL, its diffs, or the harvested bodies.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, noteLane, endPool, printLaneNotes, printSkipCount,
  x41EnsureReady, skip41, markSkip, caught, refuses, refusesAxis, reasonToken,
  T, ACCUM, BANK, GAIN, LOSS, mon, dayIn, dstr, shift,
  reviseParticulars, disposeAsset, disposeAndSettle, runDue, runManual,
  setClientFyEnd, getAuthority,
  faWorld, faRow, glNet, lineageIdsOf, drainDue,
  freshFaClient, buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle,
  // the round-4 shared readers (x41-round4-helpers.mjs) — see that file's header
  disposalEntries, monthsOfRange, chargePicture, lineagePicture, assertCoversOnce,
  assertSenExact, assertStubIsPerAsset, runManualAndSettle, namedPeriod, accumMovement,
  assertTieGreen,
} from "./x41-round4-helpers.mjs";

let live = false;
let w = null;
let today = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) {
    w = await faWorld();
    // The DB's OWN Asia/Kuala_Lumpur business date — the same clock the due-ness
    // evaluator reads. Never a JS `new Date()`, never a calendar literal.
    today = (await rootQuery("select (now() at time zone 'Asia/Kuala_Lumpur')::date::text as d")).rows[0].d;
    noteLane(`x41.t* the DB's MYT business date is ${today}`);
  }
});

after(async () => {
  printLaneNotes("x41-round4-g2");
  printSkipCount("x41-round4-g2");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-4 open-period G2 battery");


// ===========================================================================
// x41.t1 — MONTHLY: REVISE THIS MONTH, DISPOSE THIS MONTH.
// ===========================================================================

test("x41.t1 monthly cadence: a revision effective THIS month then a disposal THIS month SUCCEEDS, and the ancestor's owed month rides the disposal stub as a per-asset ledger row", async (t) => {
  if (skipHere(t)) return;
  const dayOfMonth = Number(today.slice(8, 10));
  if (dayOfMonth < 2) {
    // A revision effective on the FIRST of the month hands the whole month to the
    // SUCCESSOR (the predecessor's last chargeable month is the one before), so on the
    // 1st there is no ancestor debt to test and the cell would pass vacuously. Counted,
    // never quietly green; x41.t2 covers the same class on the annual cadence, where the
    // open period is twelve months wide and always constructible.
    markSkip();
    t.skip(`the DB business date is the 1st (${today}) — a mid-month revision inside the OPEN month is not constructible today; x41.t2 carries this class on the annual cadence`);
    return;
  }
  const client = await freshFaClient("t1");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1), memo: "x41 t1" });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 t1" });
  await liveAuthority(client);
  await earnRamp(client, start);
  await runAndSettle(client, mon(-2));
  await runAndSettle(client, mon(-1));
  assert.equal((await runDue(client)).due, false,
    "mandatory setup: every ENDED month is met before the revision — so nothing this cell meets can be an ended-period debt");

  // A lawful revision effective INSIDE the month in progress: after every live charge's
  // period_end (so §2.3's conflict refusal cannot fire) and on/before the business date.
  const revFrom = dayIn(mon(0), Math.min(dayOfMonth, 20));
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: revFrom,
    particulars: { method: "straight_line", useful_life_months: 36, residual_cents: 0, start_date: start.start },
  });
  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "mandatory setup: the revision superseded the predecessor");
  const succId = pred.superseded_by_asset_id;
  assert.ok(succId, "…and named the successor");
  assert.ok(!(await chargePicture(asset.id)).months.includes(mon(0).key),
    `mandatory setup: the ANCESTOR carries no charge for the open month ${mon(0).key} yet — the debt this cell is about is genuinely outstanding`);

  // …AND THE OPEN MONTH CANNOT BE RUN. Both instruments say so: the sweep will never
  // offer it, and the human verb the refusal's remedy would name refuses it outright.
  // That is precisely why an ancestor debt inside this period cannot be a refusal.
  assert.equal((await runDue(client)).due, false,
    `the sweep can never clear the open month ${mon(0).key} — it has not ended, so no "run that period first" remedy exists inside it`);
  await refusesAxis(() => runManual(w.users.alice, { client, periodStart: mon(0).start, periodEnd: mon(0).end }),
    T.periodRequestInvalid, ["not_ended"],
    "running the month in progress by hand (the remedy a period_earlier_unmet refusal naming this period would send a professional to)");

  // THE PIN — the disposal must go through, with the ancestor's month on the stub.
  const disposalDate = dayIn(mon(0), dayOfMonth);
  let sold = null;
  const err = await caught(async () => {
    sold = await disposeAndSettle(w.users.alice, {
      client, asset: succId, disposalDate, proceedsCents: 50_000,
      proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 t1 sold",
    });
  });
  assert.ok(!err,
    `disposing inside the OPEN period while an ANCESTOR owes that same period must SUCCEED — the ancestor's owed months ride the disposal stub (adjudicated fold: the stub extension), because the refusal's only remedy is a period the run verb refuses as not_ended. Got reason='${reasonToken(err)}' — ${err?.message}`);
  assert.equal((await faRow(succId)).status, "disposed", "…and the successor really is disposed");

  const lineage = await lineageIdsOf(client, asset.id);
  const pic = await lineagePicture(client, asset.id);
  const { named } = await assertStubIsPerAsset(pic, sold.entryId, lineage, "x41.t1");
  assert.ok(named.includes(asset.id),
    "THE FOLD: the ANCESTOR is one of the rows the stub charged — its owed month inside the disposal period lands as its own per-asset ledger row, instead of being refused with a remedy nobody can run");
  noteLane(`x41.t1 revised ${revFrom}, disposed ${disposalDate}; the stub charged ${named.length} lineage row(s): ${named.join(", ")}`);

  // Nothing but the disposal entry can have charged the open month — no run exists for it.
  for (const a of pic) {
    for (const r of a.ranges) {
      if (monthsOfRange(r).includes(mon(0).key)) {
        assert.equal(r.entry, sold.entryId,
          `every charge touching the OPEN month ${mon(0).key} belongs to the DISPOSAL entry (no run can have produced one) — got ${r.start}..${r.end} on entry ${r.entry}`);
      }
    }
  }

  // The arithmetic: months −3 … 0 charged exactly once across the lineage, sen-exact.
  const expected = [mon(-3).key, mon(-2).key, mon(-1).key, mon(0).key];
  assertCoversOnce(pic, expected, "x41.t1");
  await assertSenExact(pic, "x41.t1");
  const charged = pic.reduce((n, a) => n + a.amount, 0);
  const moved = await accumMovement(client);
  assert.equal(charged, moved.credited,
    "the WHOLE lineage's live charges equal every sen the GL accumulated account was CREDITED — the stub's ancestor row reached the books");
  assert.equal(moved.relieved, moved.credited,
    "…and the disposal relieved exactly that much, to the sen, which is WHY the account nets to zero");

  await assertTieGreen(w.users.alice, client, disposalDate, "x41.t1 at the disposal date");
  await assertTieGreen(w.users.alice, client, dayIn(mon(1), 28), "x41.t1 at an as-of past every mirror this database can hold");
  assert.equal((await runDue(client)).due, false, "the ladder still converges after the disposal");
});

// ===========================================================================
// x41.t2 — ANNUAL: A MID-FY REVISION AND A DISPOSAL INSIDE THE OPEN FY.
// ===========================================================================

test("x41.t2 annual cadence: a mid-FY revision then a disposal inside that SAME open financial year succeeds — the pre-revision FY segment rides the disposal stub per-asset beside the successor's, in ONE entry, sen-exact", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("t2");
  // An FYE four months back on the 28th: the last ENDED financial year closed before this
  // asset existed (so no ended period is ever owed), and the year in progress opened
  // inside mon(−4) and closes eight months from now — a twelve-month OPEN period, which
  // is the blast radius the fold is really about.
  const m4 = mon(-4);
  const FY_DAY = 28;
  await setClientFyEnd(w.users.alice, { client, month: m4.m, day: FY_DAY });
  // The cadence window the run verb itself recognises opens on the FIRST of the month
  // AFTER the FYE month (probed, not assumed: `run_depreciation_manual` refuses a
  // mis-aligned range by name and states the window it does accept).
  const fyOpen = mon(-3).start;
  const m8 = shift(8);
  const fyClose = dstr(m8.y, m8.m, FY_DAY);

  const { asset } = await buyAsset({ client, cents: 1_200_000, postingDate: mon(-3).start, memo: "x41 t2" });
  await completeSL(client, asset.id, { life: 120, start: mon(-3).start, description: "x41 t2" });
  await liveAuthority(client, "annual");
  const auth = await getAuthority(w.users.alice, client);
  assert.equal(Number(auth.fy_end?.month), m4.m, "mandatory setup: the client's FYE month is the one this cell set");
  assert.equal(Number(auth.fy_end?.day), FY_DAY, "…and its day");
  assert.equal((await runDue(client)).due, false,
    `mandatory setup: no ENDED financial year is owed (the year in progress runs ${fyOpen}..${fyClose}) — every debt in this cell lives inside the OPEN period`);
  await refusesAxis(() => runManual(w.users.alice, { client, periodStart: fyOpen, periodEnd: fyClose }),
    T.periodRequestInvalid, ["not_ended"],
    "running the financial year in progress by hand — on the annual cadence this is the remedy a period_earlier_unmet refusal would name, and it does not exist for up to twelve months");

  // The mid-FY revision: effective on a month boundary well inside the open year.
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: mon(-1).start,
    particulars: { method: "straight_line", useful_life_months: 60, residual_cents: 0, start_date: mon(-3).start },
  });
  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "mandatory setup: the mid-FY revision superseded the predecessor");
  const succId = pred.superseded_by_asset_id;
  assert.ok(succId, "…and named the successor");
  assert.equal((await chargePicture(asset.id)).months.length, 0,
    "mandatory setup: NOTHING in the open FY has been charged yet — the whole year is stub territory");

  const disposalDate = dayIn(mon(0), Number(today.slice(8, 10)));
  let sold = null;
  const err = await caught(async () => {
    sold = await disposeAndSettle(w.users.alice, {
      client, asset: succId, disposalDate, proceedsCents: 700_000,
      proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 t2 sold",
    });
  });
  assert.ok(!err,
    `disposing inside the OPEN financial year while the ANCESTOR still owes that year's earlier months must SUCCEED: on the annual cadence the alternative is an asset nobody can sell for up to twelve months, with an error naming a period the run verb refuses twice over. Got reason='${reasonToken(err)}' — ${err?.message}`);
  assert.equal((await faRow(succId)).status, "disposed", "…and the successor really is disposed");

  const lineage = await lineageIdsOf(client, asset.id);
  const pic = await lineagePicture(client, asset.id);
  const { named } = await assertStubIsPerAsset(pic, sold.entryId, lineage, "x41.t2");
  assert.ok(named.includes(asset.id) && named.includes(succId),
    `THE FOLD: BOTH segments ride the ONE disposal stub as per-asset rows — the ancestor's pre-revision FY months and the successor's own months through the disposal month (stub named: ${named.join(", ")})`);
  assert.equal(named.length, 2, "…and nothing else: exactly the two register rows that owed months in the open year");

  // ONE ENTRY carries the whole year's charging — there is no run in an open FY.
  const entries = new Set(pic.flatMap((a) => [...a.entries]));
  assert.deepEqual([...entries], [sold.entryId],
    `every live charge in the open financial year belongs to the SINGLE disposal entry (got ${[...entries].join(", ")})`);

  // Sen-exact, per row, from each row's own particulars; and no month charged twice.
  const expected = [mon(-3).key, mon(-2).key, mon(-1).key, mon(0).key];
  assertCoversOnce(pic, expected, "x41.t2");
  await assertSenExact(pic, "x41.t2");
  const ancestor = pic.find((a) => a.asset === asset.id);
  assert.equal(ancestor.amount, 2 * Math.floor(1_200_000 / 120),
    "the PRE-REVISION segment is the ancestor's own two months at its own rate (2 × 10,000) — the successor's later rate never reaches back over it");
  const successor = pic.find((a) => a.asset === succId);
  assert.equal(successor.amount, 2 * Math.floor(1_200_000 / 60),
    "…and the post-revision segment is the successor's two months at the REVISED rate (2 × 20,000) — MPERS 17.19 prospectively, inside one stub");
  assert.equal(ancestor.ranges[0].start, mon(-3).start,
    "…and the ancestor's ledger range opens at its first in-service month of the year (the exact sub-range charged is recorded, never a whole-FY range)");
  noteLane(`x41.t2 open FY ${fyOpen}..${fyClose}; disposed ${disposalDate}; stub segments — ancestor ${ancestor.amount} over ${ancestor.months.join(",")} · successor ${successor.amount} over ${successor.months.join(",")}`);

  const charged = pic.reduce((n, a) => n + a.amount, 0);
  const moved = await accumMovement(client);
  assert.equal(charged, moved.credited, "every sen the stub charged reached the GL accumulated account");
  assert.equal(moved.relieved, moved.credited, "…and the disposal relieved exactly that much");
  await assertTieGreen(w.users.alice, client, disposalDate, "x41.t2 at the disposal date");
  await assertTieGreen(w.users.alice, client, dayIn(mon(1), 28), "x41.t2 at an as-of past every mirror this database can hold");
});

// ===========================================================================
// x41.t3 — THE ENDED-PERIOD ARM KEEPS ITS REFUSAL, AND THE REMEDY RUNS.
// ===========================================================================

test("x41.t3 an ancestor owing an ENDED period earlier than the disposal's own is still refused period_earlier_unmet — the refusal names a cadence-aligned period that has ENDED, running it is an executable remedy, and the disposal then posts", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("t3");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1), memo: "x41 t3" });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 t3" });
  await liveAuthority(client);
  await earnRamp(client, start);
  await runAndSettle(client, mon(-2));
  // Month −1 is deliberately LEFT UNRUN, and the revision falls inside it — so the
  // ancestor owes a period that has ENDED and is EARLIER than the disposal's own.
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: dayIn(mon(-1), 15),
    particulars: { method: "straight_line", useful_life_months: 48, residual_cents: 0, start_date: start.start },
  });
  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "mandatory setup: the revision superseded the predecessor");
  const succId = pred.superseded_by_asset_id;
  const due = await runDue(client);
  assert.equal(due.due, true, "mandatory setup: an ENDED month is genuinely owed by the lineage");
  assert.equal(due.period_start, mon(-1).start, `…and it is month −1 (got ${due.period_start})`);

  // THE PIN — this half of G2 is UNCHANGED. The disposal sits in the OPEN month, but the
  // debt is in an ENDED one, where "run that period first" is a real instruction.
  const disposalDate = dayIn(mon(0), Number(today.slice(8, 10)));
  const err = await refuses(() => disposeAsset(w.users.alice, {
    client, asset: succId, disposalDate, proceedsCents: 50_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 t3 premature",
  }), T.periodEarlierUnmet,
  "disposing while an ANCESTOR owes an ENDED period EARLIER than the disposal's own — the stub extension covers the disposal's OWN cadence period and nothing before it, because before it the remedy exists");
  assert.equal((await faRow(succId)).status, "active", "…the refusal left the register untouched");
  assert.deepEqual(await disposalEntries(client), [], "…and minted NO disposal entry — the remedy is named, not half-applied");

  // …AND THE NAMED REMEDY IS EXECUTABLE. This is the whole difference between the two
  // halves: the period this refusal names is cadence-aligned AND has ended, so the verb
  // the message sends a professional to actually accepts it.
  const named = namedPeriod(err);
  assert.ok(named, `the refusal NAMES the period to run (detail: ${err.detail ?? "(none)"} — message: ${err.message})`);
  assert.equal(named.start, mon(-1).start, "…and it is the month the ancestor owes");
  assert.equal(named.end, mon(-1).end,
    "…named CADENCE-ALIGNED (a whole calendar month under monthly cadence), which is what the run verb will accept");
  assert.ok(named.end < today,
    `…and that period has ENDED (${named.end} < ${today}) — an unended period would make the remedy unfollowable, which is exactly the open-period defect x41.t1/t2 fence off`);

  const remedy = await runManualAndSettle(w.users.alice, w.users.hana, { client, periodStart: named.start, periodEnd: named.end });
  assert.notEqual(remedy.mode, "noop",
    "the period the refusal named really charges when it is run by hand — the remedy is executable, not decorative");
  assert.equal((await runDue(client)).due, false, "…and nothing ENDED is owed once it has run");
  noteLane(`x41.t3 refusal named ${named.start}..${named.end}; the manual remedy ran as '${remedy.mode}'`);

  // …and NOW the same disposal posts, with the successor's own month on the stub.
  let sold = null;
  const err2 = await caught(async () => {
    sold = await disposeAndSettle(w.users.alice, {
      client, asset: succId, disposalDate, proceedsCents: 50_000,
      proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 t3 sold",
    });
  });
  assert.ok(!err2, `the disposal posts once the NAMED period has been run. Got reason='${reasonToken(err2)}' — ${err2?.message}`);
  assert.equal((await faRow(succId)).status, "disposed", "the register row flips disposed");

  const lineage = await lineageIdsOf(client, asset.id);
  const pic = await lineagePicture(client, asset.id);
  await assertStubIsPerAsset(pic, sold.entryId, lineage, "x41.t3");
  assertCoversOnce(pic, [mon(-3).key, mon(-2).key, mon(-1).key, mon(0).key], "x41.t3");
  await assertSenExact(pic, "x41.t3");
  const moved = await accumMovement(client);
  assert.equal(pic.reduce((n, a) => n + a.amount, 0), moved.credited,
    "the whole lineage's live charges equal every sen credited to the GL accumulated account");
  assert.equal(moved.relieved, moved.credited, "…and the disposal relieved exactly that much");
  await assertTieGreen(w.users.alice, client, dayIn(mon(1), 28), "x41.t3 at an as-of past every mirror this database can hold");
  assert.equal(await glNet(client, ACCUM, dayIn(mon(1), 28)), 0,
    "…and the accumulated account nets to zero after a total disposal, independently summed");
});

// ===========================================================================
// x41.t4 — THE SEAM: A STUB INSIDE AN *ENDED* PERIOD THE SWEEP CAN STILL RUN.
// ===========================================================================

test("x41.t4 when the disposal's own period has already ENDED, the ancestor month the stub charged is not charged AGAIN by the sweep: the ladder converges, no calendar month is charged twice, and the register still ties", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("t4");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1), memo: "x41 t4" });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 t4" });
  await liveAuthority(client);
  await earnRamp(client, start);
  await runAndSettle(client, mon(-2));
  // Month −1 has ENDED and is UNRUN, and the revision falls inside it — so the ancestor
  // owes the very period the disposal will sit in, and that period is ALSO runnable.
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: dayIn(mon(-1), 2),
    particulars: { method: "straight_line", useful_life_months: 36, residual_cents: 0, start_date: start.start },
  });
  const succId = (await faRow(asset.id)).superseded_by_asset_id;
  assert.ok(succId, "mandatory setup: the revision minted a successor");
  const due = await runDue(client);
  assert.equal(due.due, true, "mandatory setup: the disposal's own period is OWED and has ENDED — the sweep really could come for it");
  assert.equal(due.period_start, mon(-1).start, `…and it is month −1 (got ${due.period_start})`);

  let sold = null;
  const err = await caught(async () => {
    sold = await disposeAndSettle(w.users.alice, {
      client, asset: succId, disposalDate: dayIn(mon(-1), 20), proceedsCents: 50_000,
      proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 t4 sold",
    });
  });
  assert.ok(!err,
    `an ancestor month INSIDE the disposal's own cadence period rides the stub whether or not that period has ended. Got reason='${reasonToken(err)}' — ${err?.message}`);
  const lineage = await lineageIdsOf(client, asset.id);
  const { named } = await assertStubIsPerAsset(await lineagePicture(client, asset.id), sold.entryId, lineage, "x41.t4");
  assert.ok(named.includes(asset.id), "the ANCESTOR's owed month rode the stub");

  // THE PIN — the sweep must not come back for a period the stub has already charged.
  const drained = await caught(() => drainDue(client));
  assert.ok(!drained,
    `draining the due ladder after a stub charged an ENDED period must not fail: a second charge for the same asset-month is a double charge, and a period that can never be satisfied is a sweep that never converges. Got: ${drained?.message}`);
  assert.equal((await runDue(client)).due, false, "…and the ladder converges");

  const pic = await lineagePicture(client, asset.id);
  assertCoversOnce(pic, [mon(-3).key, mon(-2).key, mon(-1).key], "x41.t4");
  await assertSenExact(pic, "x41.t4");
  const moved = await accumMovement(client);
  assert.equal(pic.reduce((n, a) => n + a.amount, 0), moved.credited,
    "the lineage's live charges equal every sen credited to the GL accumulated account — a run that re-charged the stub's month would break this first");
  assert.equal(moved.relieved, moved.credited, "…and the disposal relieved exactly that much");
  await assertTieGreen(w.users.alice, client, mon(-1).end, "x41.t4 at the disposal month end");
  await assertTieGreen(w.users.alice, client, dayIn(mon(1), 28), "x41.t4 at an as-of past every mirror this database can hold");
  noteLane(`x41.t4 the stub charged ${named.length} lineage row(s) inside the ENDED period ${mon(-1).key}; the ladder then converged with ${pic.flatMap((a) => a.months).length} month(s) charged in total`);
});
