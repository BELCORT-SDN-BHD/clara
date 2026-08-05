// 0042 Wave D-b — ROUND 8, LANE M1: THE SHAPE GATE ASKS COLLISION, NOT IDENTITY;
// THE SUPPORTED DATE DOMAIN; AND THE RUN RECEIPT'S LIVE CORRECTION STATE.
//
// Round 7 made the re-run gate's key a SET of (account, side) elements and compared two sets
// with exact ARRAY EQUALITY. Equality is an identity test on a key the template author still
// controls, and round 8 measured the two ordinary [WDB-G13] retire-and-re-propose edits that
// vary it while leaving the standing accrual exactly where it is:
//
//   F-M1a  ADD A LEG. "Also accrue the legal fee." {900:D, 400:C} -> {900:D, 901:D, 400:C}.
//          MEASURED (probe r8x1/p1): six consecutive months re-posted through the machine's own
//          due ladder, `blocked: []` on every one, 900 carrying RM6,000.00 for an RM3,000.00
//          intention.
//   F-M1b  MOVE ONE SEN -- which is the product's OWN named remedy for a shape collision.
//          {900:D, 400:C} -> {900:D, 400:C, 401:C}. MEASURED (probe r8x1/p2 arm A): four months
//          doubled, three of the four auto-posted, on a book change of one sen.
//
// The gate's membership test is now an INTERSECTION: a standing machine posting over an
// OVERLAPPING period collides when it shares ANY (account, side) element, and the refusal names
// the colliding elements so the remedy ("give this template distinct account codes") is
// followable rather than merely stated.
//
//   F-M1c  THE DATE DOMAIN. The template family accepted BC and five-digit-year dates end to
//          end, and the gate's four-digit ISO stamp grammar cannot carry either -- a BC stamp
//          falls outside the fail-CLOSED regex arm and puts the entry in EVERY period's set.
//          MEASURED before the fix: a BC-dated occurrence made the gate answer
//          shape_already_met for 2026-05-01..2026-05-31.
//   F-M1d  THE RUN RECEIPT'S LIVE STATE. `get_adjustment_run` / `list_adjustment_runs` reported
//          only immutable receipt columns, so the run-receipt card offered "Correct this run"
//          on runs that were already corrected or whose pair correction was already parked.
//
// THE OFF-PATH ARMS (WDB-R4) are r8m1d and r8m1g: the auto-reversal MIRROR's own shape is the
// occurrence's leg-swapped, and the gate must key on the RESOLVED occurrence in both directions
// (a mirror-shaped template is admitted; a template colliding with the occurrence names the
// OCCURRENCE); and a standing occurrence whose pair correction is already PENDING must not be
// handed clara.reverse_adjustment_pair, which refuses it -- the second walled corridor, living
// inside round 7's own repair.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, rootQuery, humanQuery,
  x42EnsureReady, skip42, caught, reasonToken, idOf,
  EXPA, EXPB, ACCR, ACCR2, CLR10, CLR38, mon,
  runManual, reversePair, adjustmentRunDue, retireTemplate, proposeTemplate,
  accrualLines, adjWorld, freshAdjClient, freshAdjFirm, firmThresholdOf, liveTemplate,
  approveDraft, reverseEntry, mirrorOf, glNet, stampedEntries, pairRows,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});
after(async () => {
  printLaneNotes("x42-r8-m1");
  printSkipCount("x42-r8-m1");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the round-8 collision-gate battery");

/** Run a period as a human and return the refusal (or null when it was admitted). */
const runRefusal = (client, template, period) => caught(() => runManual(w.users.bob, {
  client, template, periodStart: period.start, periodEnd: period.end,
}));

const listRuns = async (sub, client) =>
  (await humanQuery(sub, "select clara.list_adjustment_runs(p_client => $1) as r", [client])).rows[0].r.runs;
const getRun = async (sub, run) =>
  (await humanQuery(sub, "select clara.get_adjustment_run(p_run => $1) as r", [run])).rows[0].r.run;

/** The gate itself, asked with a template's own shape — so a cell can read the payload the
 *  poster and the oracle both derive from, without inferring it from either. */
const gateFor = async (client, template, period) => (await rootQuery(
  `select clara._wdb_rerun_breach($1,'recurring_adjustment',
      clara._wdb_line_shape((select lines from clara.adjustment_templates where id=$2)),
      $3::date,$4::date) as b`, [client, template, period.start, period.end])).rows[0].b;

// ---------------------------------------------------------------------------------------
// x42.r8m1a — F-M1a: THE ADD-A-LEG EDIT. Three standing months, one added accrual leg, and
// the money must not move by one sen.
// ---------------------------------------------------------------------------------------
test("x42.r8m1a a [WDB-G13] edit that ADDS an accrual leg cannot re-accrue the standing months: every month refused period_shape_already_met naming the shared elements, the books unchanged to the sen, and the oracle blocks instead of advertising", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r8m1a");
  const MONTHS = [mon(-4), mon(-3), mon(-2)];

  const t1 = await liveTemplate({
    client, label: "r8m1a v1", start: MONTHS[0].start, lines: accrualLines(5_000_000),
    memo: "r8m1a v1" });
  for (const p of MONTHS) {
    const r = await runManual(w.users.bob, {
      client, template: t1.id, periodStart: p.start, periodEnd: p.end });
    await approveDraft(w.users.alice, r.entry_id);
  }
  assert.equal(await glNet(client, EXPA, MONTHS[2].end), 15_000_000,
    "three months at 5,000,000 each are standing");

  await retireTemplate(w.users.hana, { client, template: t1.id, reason: "r8m1a add the legal fee" });
  const t2 = await liveTemplate({
    client, label: "r8m1a v2", start: MONTHS[0].start,
    lines: [
      { account_code: EXPA, debit_cents: 5_000_000, credit_cents: 0, description: "audit fee" },
      { account_code: EXPB, debit_cents: 3_000_000, credit_cents: 0, description: "legal fee" },
      { account_code: ACCR, debit_cents: 0, credit_cents: 8_000_000, description: "accrual" },
    ],
    memo: "r8m1a v2" });

  for (const p of MONTHS) {
    const err = await runRefusal(client, t2.id, p);
    assert.ok(err, `${p.start}: the added-leg generation is REFUSED`);
    assert.equal(err.code, CLR38);
    assert.equal(reasonToken(err), "period_shape_already_met");
    assert.deepEqual(JSON.parse(err.detail).colliding_elements, [ACCR + ":C", EXPA + ":D"],
      `${p.start}: the refusal names the elements the standing accrual already carries`);
  }

  // THE MONEY, which is the whole finding: not one sen moved.
  assert.equal(await glNet(client, EXPA, MONTHS[2].end), 15_000_000,
    "the three months still carry ONE accrual each -- not 30,000,000");
  assert.equal(await glNet(client, EXPB, MONTHS[2].end), 0, "and the added leg never posted");
  assert.equal(await glNet(client, ACCR, MONTHS[2].end), -15_000_000,
    "the liability side matches to the sen");
  assert.equal((await stampedEntries(t2.id)).length, 0,
    "the replacement generation minted no entry at all -- the sweep had nothing to approve");

  // THE ORACLE is what actually re-ran these months unattended, so it must block.
  const due = await adjustmentRunDue(client);
  assert.deepEqual((due.blocked ?? []).filter((b) => b.template_id === t2.id).map((b) => b.reason),
    ["period_shape_already_met"],
    "the due oracle blocks the template instead of advertising the covered months");
});

// ---------------------------------------------------------------------------------------
// x42.r8m1b — F-M1b: ONE SEN into a second accrual code. The smallest lawful book change that
// defeated the round-7 key, and it is the product's own named remedy performed HALF-WAY.
// ---------------------------------------------------------------------------------------
test("x42.r8m1b a [WDB-G13] edit that moves ONE SEN into a second accrual code still collides on the accounts it did NOT move, is refused by name, and leaves the month carrying exactly one accrual", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r8m1b");
  const P = mon(-3);

  const t1 = await liveTemplate({
    client, label: "r8m1b v1", start: P.start, lines: accrualLines(5_000_000), memo: "r8m1b v1" });
  const r1 = await runManual(w.users.bob, {
    client, template: t1.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r1.entry_id);

  await retireTemplate(w.users.hana, { client, template: t1.id, reason: "r8m1b split one sen out" });
  const t2 = await liveTemplate({
    client, label: "r8m1b v2", start: P.start,
    lines: [
      { account_code: EXPA, debit_cents: 5_000_000, credit_cents: 0, description: "audit fee" },
      { account_code: ACCR, debit_cents: 0, credit_cents: 4_999_999, description: "accrual" },
      { account_code: ACCR2, debit_cents: 0, credit_cents: 1, description: "accrual, other class" },
    ],
    memo: "r8m1b v2" });

  const err = await runRefusal(client, t2.id, P);
  assert.ok(err, "a one-sen reclass does not buy a second accrual");
  assert.equal(reasonToken(err), "period_shape_already_met");
  const d = JSON.parse(err.detail);
  assert.deepEqual(d.colliding_elements, [ACCR + ":C", EXPA + ":D"],
    "the two elements the edit did NOT move are named");
  assert.equal(d.entry_id, r1.entry_id, "and the standing entry is the one the refusal points at");
  assert.match(err.message, new RegExp(`${ACCR}:C`),
    "the sentence a human reads names the colliding code, not just 'these accounts'");

  assert.equal(await glNet(client, EXPA, P.end), 5_000_000, "the month carries ONE accrual");
  assert.equal(await glNet(client, ACCR2, P.end), 0, "and the one-sen code never received it");
});

// ---------------------------------------------------------------------------------------
// x42.r8m1c — THE REMEDY'S PROMISE, FOLLOWED. Intersection is only a lawful rule if the remedy
// it names actually clears it: fully-disjoint account codes in the SAME period must pass.
// ---------------------------------------------------------------------------------------
//
// RECUT IN ROUND 9 (WDB-R4, and the lesson is this cell's own). As written, it asserted only the
// NEW codes' balances — and "the remedy is followable" is a claim about the BOOKS, not about the
// gate's answer. Round 9 measured what that omission hid: on a [WDB-G13] EDIT the very same
// remedy re-runs every standing month onto fresh codes and doubles the statutory figure, and this
// cell would have stayed green through all of it. The remedy is honest HERE — tShared is a
// genuinely separate LIVE template, so the two charges are two intentions — and the cell now says
// so by asserting the TOTAL on both account pairs, plus the discriminant the refusal is derived
// from. The edit case has its own cell, x42.r9n1f.
test("x42.r8m1c the named remedy is followable: after a collision refusal, re-cutting the template onto FULLY DISJOINT codes runs in the very same period and books its own figure once — and the client's TOTAL expense is the two intentions, not four", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r8m1c");
  const P = mon(-3);

  const tA = await liveTemplate({
    client, label: "r8m1c A", start: P.start, lines: accrualLines(2_000_000), memo: "r8m1c A" });
  const rA = await runManual(w.users.bob, {
    client, template: tA.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, rA.entry_id);

  // A second, genuinely different accrual that shares only the ACCRUAL code -- the case round 7's
  // equality key admitted and this law refuses.
  const tShared = await liveTemplate({
    client, label: "r8m1c shared", start: P.start,
    lines: accrualLines(700_000, { debit: EXPB, credit: ACCR }), memo: "r8m1c shared" });
  const err = await runRefusal(client, tShared.id, P);
  assert.ok(err, "sharing ONE accrual code with a standing charge is a collision");
  assert.deepEqual(JSON.parse(err.detail).colliding_elements, [ACCR + ":C"],
    "and exactly the shared element is named -- the debit legs differ and are not reported");
  assert.equal(JSON.parse(err.detail).standing_template_status, "live",
    "the charge in the way belongs to a LIVE template, so this is two intentions and not one edit -- which is the whole reason the second remedy may be offered at all [round 9]");
  assert.match(err.message, /distinct account codes/, "the remedy is stated");

  // FOLLOW IT: give the second liability class its own code. Same period, same client.
  await retireTemplate(w.users.hana, { client, template: tShared.id, reason: "r8m1c follow the remedy" });
  const tDisjoint = await liveTemplate({
    client, label: "r8m1c disjoint", start: P.start,
    lines: accrualLines(700_000, { debit: EXPB, credit: ACCR2 }), memo: "r8m1c disjoint" });
  const r2 = await runManual(w.users.bob, {
    client, template: tDisjoint.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r2.entry_id);

  assert.equal(await glNet(client, EXPA, P.end), 2_000_000, "the first accrual is untouched");
  assert.equal(await glNet(client, EXPB, P.end), 700_000, "the second books its own figure ONCE");
  assert.equal(await glNet(client, ACCR, P.end), -2_000_000, "…on its own liability code");
  assert.equal(await glNet(client, ACCR2, P.end), -700_000, "…and the first's is unchanged");

  // THE TOTAL, which is the claim "the remedy is followable" actually makes (round 9, WDB-R4).
  // Two intentions -- RM20,000 of audit fee and RM7,000 of legal fee -- must leave RM27,000 of
  // expense and RM27,000 of accrual liability across the client's whole chart, and nothing else.
  const totalExpense = (await glNet(client, EXPA, P.end)) + (await glNet(client, EXPB, P.end));
  const totalAccrual = (await glNet(client, ACCR, P.end)) + (await glNet(client, ACCR2, P.end));
  assert.equal(totalExpense, 2_700_000,
    "the client's TOTAL expense is the two intentions -- following the remedy added a charge, it did not duplicate one");
  assert.equal(totalAccrual, -2_700_000, "…and the liability side ties to it, to the sen");
  assert.equal((await stampedEntries(tShared.id)).length, 0,
    "the refused generation minted no entry at all, so nothing of it is standing anywhere");
});

// ---------------------------------------------------------------------------------------
// x42.r8m1d — OFF-PATH (WDB-R4): THE AUTO-REVERSAL MIRROR, IN BOTH DIRECTIONS.
// A mirror is its occurrence leg-swapped, and the gate resolves every mirror through
// auto_reversal_of before taking a shape. Widening equality to intersection makes that
// resolution load-bearing in a way it never was: under equality a mirror's own swapped spelling
// could not accidentally match anything, and under intersection an unresolved mirror would
// collide with every template that moves the SAME accounts the OTHER way -- i.e. with the
// release side of ordinary bookkeeping. Neither direction is on the fix's own corridor.
// ---------------------------------------------------------------------------------------
test("x42.r8m1d the gate keys on the RESOLVED occurrence, not the mirror's swapped spelling: a mirror-shaped template is ADMITTED in the mirror's own period, and a template colliding with the occurrence is refused naming the OCCURRENCE", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r8m1d");
  const P = mon(-3);

  const tAuto = await liveTemplate({
    client, label: "r8m1d auto", start: P.start, autoReverse: true,
    lines: accrualLines(1_800_000), memo: "r8m1d auto" });
  const rA = await runManual(w.users.bob, {
    client, template: tAuto.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, rA.entry_id);
  const mirror = await mirrorOf(rA.entry_id);
  assert.ok(mirror, "the pair exists -- occurrence + mirror, both approved");

  // The mirror's OWN shape really is the swap, and both entries carry the SAME period stamp --
  // so if the gate took a mirror's own shape, the next assertion could not hold.
  const mirrorShape = (await rootQuery(
    "select clara._wdb_entry_shape($1) as s", [mirror.id])).rows[0].s;
  assert.deepEqual(mirrorShape.slice().sort(), [ACCR + ":D", EXPA + ":C"].sort(),
    "the mirror moves the same two accounts the other way");

  // DIRECTION 1: a template whose shape IS the mirror's own is admitted IN THE OCCURRENCE'S OWN
  // PERIOD -- the mirror resolved to its occurrence, whose shape shares nothing with it.
  //
  // RECUT IN ROUND 9. As written this arm asserted the GATE'S ANSWER and stopped there, and that
  // is exactly what let the round-9 critical hide behind it: "admitted" is a claim about the
  // BOOKS, and the books it was silent about are the ones in the NEXT month, where the mirror's
  // money actually is. The arm now (a) runs the admitted period and asserts the resulting
  // balances, and (b) asks the same template for the month the mirror POSTS into, where the
  // answer must be the opposite. Both halves are true at once and neither is inferable from the
  // other -- the stamp files the mirror under period N and its money is in N+1.
  const tFlip = await liveTemplate({
    client, label: "r8m1d flip", start: P.start,
    lines: accrualLines(400_000, { debit: ACCR, credit: EXPA }), memo: "r8m1d flip" });
  let rFlip = null;
  assert.equal(await caught(async () => {
    rFlip = await runManual(w.users.bob, {
      client, template: tFlip.id, periodStart: P.start, periodEnd: P.end });
  }), null, "a mirror-shaped template shares no element with the RESOLVED occurrence and is admitted");
  await approveDraft(w.users.alice, rFlip.entry_id);
  assert.equal(await glNet(client, EXPA, P.end), 1_800_000 - 400_000,
    "the occurrence's month carries the accrual and the flip template's own charge, each ONCE");
  assert.equal(await glNet(client, ACCR, P.end), -1_800_000 + 400_000, "…and the liability ties");

  // …AND THE MONTH THE MIRROR POSTS INTO IS THE OPPOSITE ANSWER [round 9]. Same template, same
  // shape, one month later: the mirror's own money is standing on those very two elements there.
  const NEXT = mon(-2);
  const errNext = await runRefusal(client, tFlip.id, NEXT);
  assert.ok(errNext, "the month the mirror's money landed in is NOT open to the same shape");
  assert.equal(reasonToken(errNext), "period_shape_already_met");
  assert.equal(JSON.parse(errNext.detail).entry_id, mirror.id, "…and the refusal names the mirror");
  assert.equal(await glNet(client, EXPA, NEXT.end), 1_800_000 - 400_000 - 1_800_000,
    "the next month carries the auto-reversal and NOTHING ELSE -- the second flip charge never posted");

  // DIRECTION 2: a template sharing ONE element with the occurrence is refused, and the entry it
  // names is the OCCURRENCE -- the correctable half -- never the mirror.
  const tCollide = await liveTemplate({
    client, label: "r8m1d collide", start: P.start,
    lines: accrualLines(900_000, { debit: EXPB, credit: ACCR }), memo: "r8m1d collide" });
  const err = await runRefusal(client, tCollide.id, P);
  assert.ok(err, "sharing the accrual code with a standing pair is a collision");
  const d = JSON.parse(err.detail);
  assert.equal(d.entry_id, rA.entry_id, "the OCCURRENCE is named, not the mirror");
  assert.equal(d.role, "occurrence");
  assert.deepEqual(d.colliding_elements, [ACCR + ":C"]);
  assert.equal(d.correction_verb, "clara.reverse_adjustment_pair",
    "and the door named is the one that admits a pair half");
  assert.equal(d.correction_entry, rA.entry_id,
    "the pair verb takes the occurrence, so that is the id the human is handed");
});

// ---------------------------------------------------------------------------------------
// x42.r8m1e — F-M1c: THE SUPPORTED DATE DOMAIN.
// ---------------------------------------------------------------------------------------
test("x42.r8m1e the template family refuses dates its own period-stamp grammar cannot carry: BC and five-digit years at propose AND at the poster, with the AD domain and its two edges untouched", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r8m1e");

  const propose = (start, end = null) => caught(() => proposeTemplate(w.users.bob, {
    client, name: `x42 r8m1e ${start} ${end} ${Math.random()}`, cadence: "monthly",
    start, end, autoReverse: false, lines: accrualLines(100_000), memo: "r8m1e",
  }));

  for (const bad of ["0001-01-01 BC", "4713-01-01 BC", "10000-01-01"]) {
    const err = await propose(bad);
    assert.ok(err, `propose refuses start_date ${bad}`);
    assert.equal(err.code, CLR10);
    assert.equal(reasonToken(err), "template_date_unsupported");
    assert.equal(JSON.parse(err.detail).axis, "start_date");
  }
  const errEnd = await propose(mon(-6).start, "10000-01-31");
  assert.ok(errEnd, "and the END date is asked the same question");
  assert.equal(reasonToken(errEnd), "template_date_unsupported");
  assert.equal(JSON.parse(errEnd.detail).axis, "end_date");

  // THE EDGES ARE IN. The domain is [0001-01-01, 9999-12-31] AD inclusive, and a rule stated as
  // a range must be tested at the range, not near it.
  for (const edge of ["0001-01-01", "9999-12-01"]) {
    const p = await proposeTemplate(w.users.bob, {
      client, name: `x42 r8m1e edge ${edge} ${Math.random()}`, cadence: "monthly",
      start: edge, end: null, autoReverse: false, lines: accrualLines(100_000),
      memo: "r8m1e edge", opKey: opk("r8m1e"),
    });
    const id = idOf(p, "template_id", "id");
    assert.ok(id, `${edge} is inside the supported domain and proposes`);
    // retire is admin+ (WD-R9) -- hana, never bob.
    await retireTemplate(w.users.hana, { client, template: id, reason: "r8m1e edge parked" });
  }

  // THE POSTER'S OWN DOOR. clara.run_adjustment_manual takes both bounds from a human, so it
  // lets dates in independently of propose -- and it refuses in the poster's grammar, not
  // propose's.
  const P = mon(-3);
  const tpl = await liveTemplate({
    client, label: "r8m1e ok", start: mon(-6).start, lines: accrualLines(100_000),
    memo: "r8m1e ok" });
  const errRun = await caught(() => runManual(w.users.bob, {
    client, template: tpl.id, periodStart: "0001-01-01 BC", periodEnd: "0001-01-31 BC" }));
  assert.ok(errRun, "the poster refuses a BC period");
  assert.equal(errRun.code, CLR38);
  assert.equal(reasonToken(errRun), "period_request_invalid");
  assert.equal(JSON.parse(errRun.detail).axis, "date_unsupported");

  // …and an ordinary AD period on the same template still runs, so the guard is a domain check
  // and not a new refusal in the ordinary path.
  const ok = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, ok.entry_id);
  assert.equal(await glNet(client, EXPA, P.end), 100_000, "the AD domain is untouched");
});

// ---------------------------------------------------------------------------------------
// x42.r8m1f — F-M1d: THE RUN RECEIPT'S LIVE CORRECTION STATE, in every reachable state.
// ---------------------------------------------------------------------------------------
test("x42.r8m1f every run receipt reports its own live correction state — correctable + active_pair_id + active_pair_status — across solo/uncorrected, solo/corrected, pair/uncorrected, pair/pending and pair/completed", async (t) => {
  if (skipHere(t)) return;
  const P = mon(-3);
  const triplet = (r) => ({
    correctable: r.correctable, pair: r.active_pair_id, status: r.active_pair_status });

  // (1) SOLO, uncorrected -> correctable through clara.reverse_entry, no pair anywhere.
  const c1 = await freshAdjClient("r8m1f1");
  const t1 = await liveTemplate({
    client: c1, label: "r8m1f solo", start: P.start, lines: accrualLines(600_000), memo: "solo" });
  const r1 = await runManual(w.users.bob, {
    client: c1, template: t1.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r1.entry_id);
  let rows = await listRuns(w.users.bob, c1);
  assert.equal(rows.length, 1);
  assert.deepEqual(triplet(rows[0]), { correctable: true, pair: null, status: null },
    "an approved, uncorrected solo occurrence is correctable and has no pair");
  assert.deepEqual(triplet(await getRun(w.users.bob, rows[0].id)), triplet(rows[0]),
    "the by-id read and the list agree -- ONE projection");

  // (2) SOLO, corrected -> no longer correctable, and still no pair.
  await reverseEntry(w.users.alice, {
    entry: r1.entry_id, reason: "r8m1f correct the solo", opKey: opk("r8m1f") });
  rows = await listRuns(w.users.bob, c1);
  assert.deepEqual(triplet(rows[0]), { correctable: false, pair: null, status: null },
    "a corrected occurrence cannot be corrected again, and the card must not offer it");

  // (3) PAIR, uncorrected -> correctable (through the pair verb), no ACTIVE pair row yet.
  const c2 = await freshAdjClient("r8m1f2");
  const t2 = await liveTemplate({
    client: c2, label: "r8m1f pair", start: P.start, autoReverse: true,
    lines: accrualLines(600_000), memo: "pair" });
  const r2 = await runManual(w.users.bob, {
    client: c2, template: t2.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r2.entry_id);
  rows = await listRuns(w.users.bob, c2);
  assert.deepEqual(triplet(rows[0]), { correctable: true, pair: null, status: null },
    "a standing pair is correctable and carries no in-flight correction");

  // (5) PAIR, completed -> not correctable; the completed row is NOT 'active' (the schema's own
  // word: uq_adjustment_pair_reversals_occurrence_active is pending/approving only).
  const done = await reversePair(w.users.bob, {
    client: c2, occurrence: r2.entry_id, reason: "r8m1f complete the pair" });
  assert.equal(done.status, "completed", "a below-threshold pair completes in one act");
  rows = await listRuns(w.users.bob, c2);
  assert.deepEqual(triplet(rows[0]), { correctable: false, pair: null, status: null },
    "a completed pair leaves the run un-correctable and reports no ACTIVE pair");

  // (4) PAIR, PENDING -> not correctable, and the parked pair is named so the card can link to
  // the very approval that is in the way. Needs a dedicated firm: the park is threshold-driven.
  const { client: c3, users } = await freshAdjFirm("r8m1f3");
  const cents = (await firmThresholdOf(c3)) + 400_000;
  const t3 = await liveTemplate({
    client: c3, label: "r8m1f park", start: P.start, autoReverse: true,
    lines: accrualLines(cents), memo: "park", proposer: users.keeper, signer: users.admin });
  const r3 = await runManual(users.keeper, {
    client: c3, template: t3.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(users.owner, r3.entry_id);
  const parked = await reversePair(users.keeper, {
    client: c3, occurrence: r3.entry_id, reason: "r8m1f park the pair" });
  assert.equal(parked.status, "pending", "a high-stakes pair correction PARKS for a checker");
  rows = await listRuns(users.keeper, c3);
  assert.deepEqual(triplet(rows[0]),
    { correctable: false, pair: parked.pair_id, status: "pending" },
    "the run names the in-flight pair and refuses to offer a second correction");
  assert.equal((await pairRows(c3))[0].status, "pending",
    "…and the pair machine's own row agrees, so the two readings cannot drift");
});

// ---------------------------------------------------------------------------------------
// x42.r8m1g — OFF-PATH (WDB-R4): THE SECOND WALLED CORRIDOR, INSIDE ROUND 7's OWN REPAIR.
// Round 7 taught the gate to ask clara._wdb_reversal_blocked which door admits the standing
// entry, and to name clara.reverse_adjustment_pair whenever that wall said adjustment_pair_
// locked. It never asked whether the PAIR door would admit it -- and a pair whose correction is
// already parked refuses CLR10 pair_already_active. The gate must not hand a reader a verb that
// refuses them; this cell FOLLOWS the refusal rather than asserting a string.
// ---------------------------------------------------------------------------------------
test("x42.r8m1g when the standing occurrence's pair correction is already PENDING the gate names no verb at all — it reports the pair_already_active wall, and the pair verb really does refuse", async (t) => {
  if (skipHere(t)) return;
  const P = mon(-3);
  const { client, users } = await freshAdjFirm("r8m1g");
  const cents = (await firmThresholdOf(client)) + 400_000;

  const tA = await liveTemplate({
    client, label: "r8m1g A", start: P.start, autoReverse: true, lines: accrualLines(cents),
    memo: "r8m1g A", proposer: users.keeper, signer: users.admin });
  const rA = await runManual(users.keeper, {
    client, template: tA.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(users.owner, rA.entry_id);
  const parked = await reversePair(users.keeper, {
    client, occurrence: rA.entry_id, reason: "r8m1g park" });
  assert.equal(parked.status, "pending", "the correction is parked, not completed");

  // A colliding second template asks the gate.
  const tB = await liveTemplate({
    client, label: "r8m1g B", start: P.start,
    lines: accrualLines(500_000, { debit: EXPB, credit: ACCR }), memo: "r8m1g B",
    proposer: users.keeper, signer: users.admin });
  const gate = await gateFor(client, tB.id, P);
  assert.equal(gate.axis, "shape_already_met");
  assert.equal(gate.entry_id, rA.entry_id);
  assert.equal(gate.correction_verb, null,
    "no verb is named, because no verb admits this entry right now");
  assert.equal(gate.correction_wall, "pair_already_active",
    "and the wall that closed the door is reported by its own token");

  const err = await caught(() => runManual(users.keeper, {
    client, template: tB.id, periodStart: P.start, periodEnd: P.end }));
  assert.ok(err, "the poster refuses the colliding period");
  assert.equal(reasonToken(err), "period_shape_already_met");
  assert.match(err.message, /cannot be corrected directly \(pair_already_active\)/,
    "the sentence a human reads says so in words instead of naming a door that refuses");

  // AND THE WALL TOLD THE TRUTH: the door round 7 would have named really does refuse.
  const refused = await caught(() => reversePair(users.keeper, {
    client, occurrence: rA.entry_id, reason: "r8m1g follow the round-7 remedy" }));
  assert.ok(refused, "clara.reverse_adjustment_pair refuses while a correction is parked");
  assert.equal(reasonToken(refused), "pair_already_active",
    "…under the very token the gate reported");
});
