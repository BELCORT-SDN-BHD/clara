// 0042 Wave D-b — ROUND 7, GROUP B: THE CLASS GATE'S KEY, ITS PERIOD TERM AND ITS DIAGNOSIS.
//
// Round 6 turned the re-run gate from a template-keyed lane fix into a class authority keyed on
// the ACCOUNT LINE-SHAPE. Round 7 measured three ways that authority could still be walked past
// or could still lie, and this file is the wall for all three. Every cell asserts a FIGURE or a
// verbatim refusal token, never prose.
//
//   F-B1  THE KEY WAS A MULTISET, THE LAW IS A SET. The gate compared per-LINE arrays with exact
//         array equality, so a [WDB-G13] edit that merely ITEMISES one debit leg across two lines
//         on the SAME account kept the accounting identical to the sen, changed the key, and
//         restored the round-6 doubling IN FULL -- six consecutive months re-accrued through the
//         machine's own due ladder with blocked[] empty on every one.
//
//   F-B2  THE PERIOD TERM WAS period_start ALONE. clara._adj_period_start(client,'monthly',d) and
//         (...,'annual',d) return the SAME date for the FY-OPENING month, so a monthly and an
//         annual template on one shape collided in exactly that month and were ADMITTED for the
//         other eleven. The eleven are the expensive half: a [WDB-G13] edit that changes a
//         template's CADENCE books the annual figure on top of twelve standing monthly accruals.
//         The gate's period term is now a RANGE OVERLAP, so two periods that do not overlap never
//         collide and two that do always collide, whichever cadences produced them.
//
//   F-B4  THE AXIS WAS DECIDED BY SCAN ORDER. pair_half_uncorrected was stamped at whichever
//         standing member the scan reached first and outranked shape_already_met
//         unconditionally -- so a period whose charge is standing, correctly, was diagnosed with
//         the TERMINAL period_correction_unsound and a healthy template was told to retire
//         itself. Met-ness now outranks mixedness, from the set's own state.
//
// THE OFF-PATH ARMS (WDB-R4) are r7b2, r7b4 and r7b6: the set key must not over-collapse and must
// not manufacture false refusals; the auto-reversal MIRROR is posted into the NEXT period and must
// not make that period read as met; and the refusal's named remedy must be a verb that ACTUALLY
// ADMITS the entry it names -- followed end to end, not asserted as a string.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, printLaneNotes, printSkipCount,
  x42EnsureReady, skip42, caught, reasonToken,
  EXPA, ACCR, EXPB, ACCR2, CLR38, mon, lastEndedFy, clientFy,
  runManual, reversePair, approvePairReversal, adjustmentRunDue, retireTemplate,
  accrualLines, adjWorld, freshAdjClient, liveTemplate, approveDraft,
  entryRowOf, mirrorOf, glNet, stampedEntries, rootQuery,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});
after(async () => {
  printLaneNotes("x42-r7-class");
  printSkipCount("x42-r7-class");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the round-7 class-gate battery");

/** The same accounting as accrualLines(total), written across TWO debit lines on ONE account --
 *  the [WDB-G13] "itemise the accrual" edit, which is the whole of the F-B1 evasion. */
const splitLines = (a, b) => [
  { account_code: EXPA, debit_cents: a, credit_cents: 0, description: "part one" },
  { account_code: EXPA, debit_cents: b, credit_cents: 0, description: "part two" },
  { account_code: ACCR, debit_cents: 0, credit_cents: a + b, description: "accrual" },
];

const shapeOfTemplate = async (id) => (await rootQuery(
  "select clara._wdb_line_shape((select lines from clara.adjustment_templates where id=$1)) as s",
  [id])).rows[0].s;

/** Run a period as a human and return the refusal (or null when it was admitted). */
const runRefusal = (client, template, period) => caught(() => runManual(w.users.bob, {
  client, template, periodStart: period.start, periodEnd: period.end,
}));

// ---------------------------------------------------------------------------------------
// x42.r7b1 — F-B1: THE SET KEY. The split-leg edit is refused and the month stays single.
// ---------------------------------------------------------------------------------------
test("x42.r7b1 a [WDB-G13] edit that itemises one leg across two lines on the SAME account cannot re-accrue the period: refused period_shape_already_met, the month carries ONE accrual to the sen, and the oracle blocks instead of advertising", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r7b1");
  const P = mon(-3);

  // BOTH generations START at the period under test, so the replacement's due ladder opens on
  // exactly that period -- otherwise the oracle answers about an EARLIER unmet month and the
  // blocked[] arm below would pass or fail for a reason that has nothing to do with the gate.
  const t1 = await liveTemplate({
    client, label: "r7b1 v1", start: P.start, lines: accrualLines(5_000_000),
    memo: "r7b1 v1",
  });
  const r1 = await runManual(w.users.bob, {
    client, template: t1.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r1.entry_id);

  await retireTemplate(w.users.hana, { client, template: t1.id, reason: "r7b1 itemise" });
  const t2 = await liveTemplate({
    client, label: "r7b1 v2", start: P.start,
    lines: splitLines(6_000_000, 3_000_000), memo: "r7b1 v2",
  });

  // THE KEYS MUST BE EQUAL -- that is the fix, stated directly on the two derivations.
  assert.deepEqual(await shapeOfTemplate(t2.id), await shapeOfTemplate(t1.id),
    "itemising a leg across two lines on one account does not change the account SET the books move");

  const err = await runRefusal(client, t2.id, P);
  assert.ok(err, "the split-leg generation is REFUSED");
  assert.equal(err.code, CLR38);
  assert.equal(reasonToken(err), "period_shape_already_met");

  // AND THE MONEY: the period still carries exactly the first generation's figure.
  assert.equal(await glNet(client, EXPA, P.end), 5_000_000,
    "the month carries ONE accrual -- 5,000,000, not 14,000,000");
  assert.equal(await glNet(client, ACCR, P.end), -5_000_000,
    "and the liability side matches it to the sen");

  // AND THE ORACLE: the sweep is what actually re-ran these months unattended, so it must block.
  const due = await adjustmentRunDue(client);
  const blockedHere = (due.blocked ?? []).filter((b) => b.template_id === t2.id);
  assert.deepEqual(blockedHere.map((b) => b.reason), ["period_shape_already_met"],
    "the due oracle names the template on blocked[] instead of advertising the covered period");
});

// ---------------------------------------------------------------------------------------
// x42.r7b2 — OFF-PATH (WDB-R4): the shape key must not OVER-collapse.
// `distinct` is a narrowing of the key, and a narrowed key manufactures FALSE refusals as
// readily as a widened one admits real doubles. Three boundaries, none of which the F-B1 fix's
// own corridor walks: a template that moves one account on BOTH sides, two templates on
// genuinely different accounts, and the settled amount-free law.
//
// RE-CUT AT ROUND 8, AND THE RE-CUT IS THE POINT. Arm (a) used to assert that a both-sides
// template was ADMITTED beside a plain accrual on the same accounts. That was true of the
// round-7 gate because it compared the two shapes for EQUALITY -- and equality is exactly the
// property round 8 measured a one-sen edit varying at will (probe r8x1/p2: the sets stopped
// being equal, the gate went blind, four standing months re-accrued). The gate now asks
// INTERSECTION, so a both-sides template sharing 900:D and 400:C with a standing accrual
// collides, by design and to the sen. What arm (a) still proves -- and it is the whole reason
// `distinct` did not collapse the side out of the element -- is that the SIDE is load-bearing:
// the same two ACCOUNTS moved in the OPPOSITE directions share no element and are admitted
// together in one period. A collision rule that ignored the side would be a client-wide period
// lock wearing the gate's name.
// ---------------------------------------------------------------------------------------
test("x42.r7b2 the shape key's boundaries: the SIDE is part of the element (opposite directions never collide), fully-disjoint accounts never collide, and two amounts on one shape still do", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r7b2");
  const P = mon(-3);

  // (a) BOTH SIDES OF ONE ACCOUNT is a DIFFERENT shape from a plain one-way move -- if `distinct`
  // had collapsed the side out of the element, these two would have become the same key.
  const bothSides = [
    { account_code: EXPA, debit_cents: 3_000_000, credit_cents: 0, description: "gross" },
    { account_code: EXPA, debit_cents: 0, credit_cents: 1_000_000, description: "recharge" },
    { account_code: ACCR, debit_cents: 0, credit_cents: 2_000_000, description: "accrual" },
  ];
  const tA = await liveTemplate({
    client, label: "r7b2 plain", start: mon(-6).start, lines: accrualLines(2_000_000),
    memo: "r7b2 plain" });
  const tB = await liveTemplate({
    client, label: "r7b2 both", start: mon(-6).start, lines: bothSides, memo: "r7b2 both" });
  assert.notDeepEqual(await shapeOfTemplate(tB.id), await shapeOfTemplate(tA.id),
    "the SIDE is part of the element -- Dr EXPA and Cr EXPA are two different facts about one account");

  const rA = await runManual(w.users.bob, {
    client, template: tA.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, rA.entry_id);

  // ...and under the round-8 intersection law it COLLIDES, because it still moves 900:D and
  // 400:C -- the two elements the standing accrual is already carrying.
  const errB = await runRefusal(client, tB.id, P);
  assert.ok(errB, "a template sharing 900:D and 400:C with a standing accrual is refused [round 8]");
  assert.equal(reasonToken(errB), "period_shape_already_met");
  assert.deepEqual(JSON.parse(errB.detail).colliding_elements, [ACCR + ":C", EXPA + ":D"],
    "and the refusal names exactly the shared elements, sorted -- not the whole shape");

  // (a2) THE SIDE IS LOAD-BEARING IN THE COLLISION TEST TOO. The same two accounts moved the
  // OTHER way share no element with the standing accrual and must be admitted in the SAME
  // period. This is the arm that stops the intersection rule degenerating into an account lock.
  //
  // ROUND-9 QUALIFIER, and it is the reason this arm needed one: what makes the flip admissible is
  // that tA does NOT auto-reverse, so nothing of tA's is standing on the flip's own elements. The
  // moment the standing template DOES auto-reverse, its mirror carries exactly the flip's two
  // elements into the NEXT period, and the flip is refused there. Both facts are this rule, and
  // the round-8 cut of this cell pinned only the first -- which is how two inverse templates
  // drifted the books RM2,500 a month, unattended (x42.r9n1a). The counterpart is asserted here so
  // a reader of THIS arm cannot come away with the wrong half of the law.
  const tFlip = await liveTemplate({
    client, label: "r7b2 flip", start: mon(-6).start,
    lines: accrualLines(1_100_000, { debit: ACCR, credit: EXPA }), memo: "r7b2 flip" });
  assert.equal(await runRefusal(client, tFlip.id, P), null,
    "Dr ACCR / Cr EXPA shares no (account, side) with Dr EXPA / Cr ACCR and runs in the same period");
  const cAuto = await freshAdjClient("r7b2auto");
  const tAutoA = await liveTemplate({
    client: cAuto, label: "r7b2 auto", start: P.start, autoReverse: true,
    lines: accrualLines(2_000_000), memo: "r7b2 auto" });
  const rAuto = await runManual(w.users.bob, {
    client: cAuto, template: tAutoA.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, rAuto.entry_id);
  const tFlip2 = await liveTemplate({
    client: cAuto, label: "r7b2 flip2", start: P.start,
    lines: accrualLines(1_100_000, { debit: ACCR, credit: EXPA }), memo: "r7b2 flip2" });
  let rFlip2 = null;
  assert.equal(await caught(async () => {
    rFlip2 = await runManual(w.users.bob, {
      client: cAuto, template: tFlip2.id, periodStart: P.start, periodEnd: P.end });
  }), null,
    "…in the occurrence's OWN period the flip is still admitted: the mirror's money is not there yet");
  await approveDraft(w.users.alice, rFlip2.entry_id);
  const errFlipNext = await runRefusal(cAuto, tFlip2.id, mon(-2));
  assert.ok(errFlipNext,
    "…but in the month the auto-reversal POSTS into, the flip's two elements are already standing");
  assert.equal(reasonToken(errFlipNext), "period_shape_already_met");

  // (b) DIFFERENT ACCOUNTS, same directions: never a collision.
  const tC = await liveTemplate({
    client, label: "r7b2 other", start: mon(-6).start,
    lines: accrualLines(900_000, { debit: EXPB, credit: ACCR2 }), memo: "r7b2 other" });
  assert.equal(await runRefusal(client, tC.id, P), null,
    "two templates on genuinely different accounts share a period without collision");

  // (c) THE SETTLED AMOUNT-FREE LAW (F-B3, adjudicated record-only): a second live template on
  // the SAME accounts and the same directions is refused whatever figure it carries, because the
  // books cannot tell the two accruals apart. The rekey must not have relaxed this.
  const tD = await liveTemplate({
    client, label: "r7b2 twin", start: mon(-6).start, lines: accrualLines(7_777_700),
    memo: "r7b2 twin" });
  const errD = await runRefusal(client, tD.id, P);
  assert.ok(errD, "a same-shape twin at a different amount is still refused");
  assert.equal(reasonToken(errD), "period_shape_already_met");
  assert.match(errD.message, /distinct account codes/,
    "and the refusal names the professional's remedy: a distinct accrual account per liability class");
});

// ---------------------------------------------------------------------------------------
// x42.r7b3 — F-B2: THE PERIOD TERM IS A RANGE OVERLAP, IN BOTH DIRECTIONS.
// ---------------------------------------------------------------------------------------
test("x42.r7b3 a monthly and an annual template on one shape collide in EVERY overlapping month (both directions) and in none outside the overlap — the FY-opening month is no longer the only one", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r7b3");
  const fy = await clientFy(client);
  const F = lastEndedFy(fy.month ?? 12, fy.day ?? 31);
  const [y, mm] = F.start.split("-").map(Number);
  const janEnd = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
  const febStart = new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 10);
  const febEnd = new Date(Date.UTC(y, mm + 1, 0)).toISOString().slice(0, 10);

  const annual = await liveTemplate({
    client, label: "r7b3 annual", cadence: "annual", start: F.start,
    lines: accrualLines(6_000_000), memo: "r7b3 annual" });
  const monthly = await liveTemplate({
    client, label: "r7b3 monthly", cadence: "monthly", start: F.start,
    lines: accrualLines(500_000), memo: "r7b3 monthly" });

  // DIRECTION B: the ANNUAL stands first, and BOTH the FY-opening month and February are refused.
  const ra = await runManual(w.users.bob, {
    client, template: annual.id, periodStart: F.start, periodEnd: F.end });
  await approveDraft(w.users.alice, ra.entry_id);

  const errJan = await runRefusal(client, monthly.id, { start: F.start, end: janEnd });
  assert.ok(errJan, "the FY-opening month is refused (round 6 refused this one too, by accident)");
  assert.equal(reasonToken(errJan), "period_shape_already_met");
  const errFeb = await runRefusal(client, monthly.id, { start: febStart, end: febEnd });
  assert.ok(errFeb, "FEBRUARY is refused as well -- round 6 ADMITTED it, and eleven such months are how a cadence-change edit doubles a whole FY");
  assert.equal(reasonToken(errFeb), "period_shape_already_met");
  assert.equal(await glNet(client, EXPA, F.end), 6_000_000,
    "the FY carries the annual accrual ONCE -- not 6,000,000 + eleven monthly ones");

  // DIRECTION A, on a fresh client: the MONTHLY stands first and the annual FY is refused.
  const c2 = await freshAdjClient("r7b3b");
  const m2 = await liveTemplate({
    client: c2, label: "r7b3b monthly", cadence: "monthly", start: F.start,
    lines: accrualLines(500_000), memo: "r7b3b monthly" });
  const a2 = await liveTemplate({
    client: c2, label: "r7b3b annual", cadence: "annual", start: F.start,
    lines: accrualLines(6_000_000), memo: "r7b3b annual" });
  const rm = await runManual(w.users.bob, {
    client: c2, template: m2.id, periodStart: F.start, periodEnd: janEnd });
  await approveDraft(w.users.alice, rm.entry_id);
  const errAnnual = await caught(() => runManual(w.users.bob, {
    client: c2, template: a2.id, periodStart: F.start, periodEnd: F.end }));
  assert.ok(errAnnual, "the annual FY overlapping a standing monthly accrual is refused");
  assert.equal(reasonToken(errAnnual), "period_shape_already_met");

  // AND OUTSIDE THE OVERLAP, NOTHING COLLIDES. A month of the FOLLOWING financial year shares no
  // calendar with the standing annual accrual, so it must be admitted -- an overlap rule that
  // blocked it would be a client-wide period lock wearing the gate's name.
  const nextJanStart = `${y + 1}-01-01`;
  const nextJanEnd = `${y + 1}-01-31`;
  const errNext = await runRefusal(client, monthly.id, { start: nextJanStart, end: nextJanEnd });
  assert.equal(errNext, null,
    "a month in the NEXT financial year does not overlap the standing annual period and is admitted");
});

// ---------------------------------------------------------------------------------------
// x42.r7b4 — OFF-PATH (WDB-R4): THE AUTO-REVERSAL MIRROR AND THE NEXT PERIOD.
// The overlap rule is a claim about PERIODS, and the mirror is the one entry in this lane whose
// POSTING DATE lies outside the period its stamp names (period_end + 1, i.e. day one of the next
// period). If the gate had keyed the overlap on posting dates rather than on the stamp's own
// period, every auto-reverse template would have blocked its own next month, forever, from month
// two onwards -- a defect the F-B2 corridor never passes through.
// ---------------------------------------------------------------------------------------
test("x42.r7b4 an AUTO-REVERSE template drains four consecutive months: the mirror is posted into the next period but its stamp names the occurrence's, so no month blocks the one after it", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r7b4");
  const tpl = await liveTemplate({
    client, label: "r7b4 auto", start: mon(-5).start, autoReverse: true,
    lines: accrualLines(1_500_000), memo: "r7b4 auto" });

  for (const p of [mon(-5), mon(-4), mon(-3), mon(-2)]) {
    const r = await runManual(w.users.bob, {
      client, template: tpl.id, periodStart: p.start, periodEnd: p.end });
    await approveDraft(w.users.alice, r.entry_id);
    const occ = (await entryRowOf(r.entry_id));
    const mir = await mirrorOf(r.entry_id);
    assert.ok(mir, `${p.start}: the mirror was born`);
    assert.equal(String(mir.posting_date).slice(0, 10) > String(occ.posting_date).slice(0, 10), true,
      `${p.start}: the mirror is posted AFTER its occurrence's period ends`);
  }

  // FOUR occurrences, FOUR mirrors, and every month nets to zero after its release.
  const occs = await stampedEntries(tpl.id, "occurrence");
  assert.equal(occs.length, 4, "all four months ran -- no month blocked its successor");
  assert.equal(await glNet(client, ACCR, mon(-1).end), 0,
    "each accrual was released by its own mirror, so the liability is flat once the last release lands");
});

// ---------------------------------------------------------------------------------------
// x42.r7b5 — F-B4: THE HONEST AXIS. A set holding a CORRECTED pair and a STANDING same-shape
// occurrence of another template is diagnosed by what the set IS, not by what the scan met first.
// ---------------------------------------------------------------------------------------
test("x42.r7b5 a period holding a corrected PAIR and a standing same-shape occurrence of ANOTHER template is diagnosed shape_already_met (benign, followable) — not the terminal period_correction_unsound", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r7b5");
  const P = mon(-3);

  // A: an auto-reverse template, run and then corrected IN PERIOD through the pair machine.
  const tA = await liveTemplate({
    client, label: "r7b5 A", start: P.start, autoReverse: true,
    lines: accrualLines(4_000_000), memo: "r7b5 A" });
  const rA = await runManual(w.users.bob, {
    client, template: tA.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, rA.entry_id);
  const pair = await reversePair(w.users.bob, {
    client, occurrence: rA.entry_id, reason: "r7b5 correct A" });
  if (pair.status !== "completed") {
    await approvePairReversal(w.users.alice, { client, pair: pair.pair_id ?? pair.id });
  }

  // B: a DIFFERENT template on the SAME shape, admitted because nothing of that shape stands.
  const tB = await liveTemplate({
    client, label: "r7b5 B", start: P.start, lines: accrualLines(3_000_000), memo: "r7b5 B" });
  const rB = await runManual(w.users.bob, {
    client, template: tB.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, rB.entry_id);

  // NOW the set is MIXED (two corrected halves) AND MET (B standing). The honest answer is met.
  const gate = (await rootQuery(
    `select clara._wdb_rerun_breach($1,'recurring_adjustment',
        clara._wdb_line_shape((select lines from clara.adjustment_templates where id=$2)),
        $3::date,$4::date) as b`, [client, tA.id, P.start, P.end])).rows[0].b;
  assert.equal(gate.axis, "shape_already_met",
    "met-ness is a fact about the SET, and it outranks mixedness whatever order the scan ran in");
  assert.equal(gate.entry_id, rB.entry_id, "and it names the entry that is actually standing");

  const err = await caught(() => runManual(w.users.bob, {
    client, template: tA.id, periodStart: P.start, periodEnd: P.end }));
  assert.ok(err, "A's re-run is refused");
  assert.equal(reasonToken(err), "period_shape_already_met",
    "the benign, followable refusal -- NOT period_correction_unsound, whose only remedy is to retire a healthy template");
  assert.deepEqual(JSON.parse(err.detail).remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "the composed remedy [round 10] — template B is live and carries a standing charge, so the distinct-codes act is offered WITH its measured caution rather than blind");

  const due = await adjustmentRunDue(client);
  assert.equal((due.blocked ?? []).some((b) => b.reason === "period_correction_unsound"), false,
    "and the oracle does not report the client's healthy templates as unsound");
});

// ---------------------------------------------------------------------------------------
// x42.r7b6 — OFF-PATH (WDB-R4): THE WALLED CORRIDOR, FOLLOWED END TO END.
//
// The shape_already_met refusal tells a human to correct the standing entry. Round 6 named
// clara.reverse_entry unconditionally -- and for the commonest case this gate fires on, a
// [WDB-G13] edit of an AUTO-REVERSE template, that verb refuses CLR39 adjustment_pair_locked and
// sends the reader back where they came from. The gate now ASKS clara._wdb_reversal_blocked --
// clara.reverse_entry's own wall -- which door admits the entry, and carries the answer.
//
// This cell does not assert the string. It FOLLOWS it: takes the verb the refusal names, calls it
// on the entry the refusal names, and requires the period to re-open.
// ---------------------------------------------------------------------------------------
test("x42.r7b6 when the standing entry is half of an auto pair the refusal names clara.reverse_adjustment_pair (not clara.reverse_entry) — and following that named remedy re-opens the period", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r7b6");
  const P = mon(-3);

  const t1 = await liveTemplate({
    client, label: "r7b6 v1", start: mon(-5).start, autoReverse: true,
    lines: accrualLines(2_500_000), memo: "r7b6 v1" });
  const r1 = await runManual(w.users.bob, {
    client, template: t1.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r1.entry_id);
  assert.ok(await mirrorOf(r1.entry_id), "the auto-reverse pair exists");

  await retireTemplate(w.users.hana, { client, template: t1.id, reason: "r7b6 corrected figure" });
  const t2 = await liveTemplate({
    client, label: "r7b6 v2", start: mon(-5).start, autoReverse: true,
    lines: accrualLines(2_900_000), memo: "r7b6 v2" });

  const err = await runRefusal(client, t2.id, P);
  assert.ok(err, "the replacement generation is refused");
  assert.equal(reasonToken(err), "period_shape_already_met");
  const d = JSON.parse(err.detail);
  assert.equal(d.correction_verb, "clara.reverse_adjustment_pair",
    "the refusal names the door that ACTUALLY admits this entry, because the gate asked the wall");
  assert.equal(d.correction_wall, "adjustment_pair_locked",
    "and it records WHY clara.reverse_entry is not that door");
  assert.equal(d.correction_entry, r1.entry_id,
    "the pair verb takes the OCCURRENCE, so that is the id the human is handed");
  assert.match(err.message, /clara\.reverse_adjustment_pair/,
    "the sentence a human reads names the same verb the machine-readable key does");

  // FOLLOW IT. The named verb must admit the named entry -- this is the whole of WDB-R2.
  const pair = await reversePair(w.users.bob, {
    client, occurrence: d.correction_entry, reason: "r7b6 follow the named remedy" });
  if (pair.status !== "completed") {
    await approvePairReversal(w.users.alice, { client, pair: pair.pair_id ?? pair.id });
  }

  // AND THE PERIOD RE-OPENS, at the corrected figure, exactly once.
  const r2 = await runManual(w.users.bob, {
    client, template: t2.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r2.entry_id);
  assert.equal(await glNet(client, EXPA, P.end), 2_900_000,
    "the month carries the CORRECTED figure once -- not the old one, and not both");
});
