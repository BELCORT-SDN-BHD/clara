// 0042 Wave D-b — ROUND 9, LANE N1 (part 2): THE REMEDY THE REFUSAL PRINTS, THE VERB THE RUN
// RECEIPT NAMES, AND THE PERIOD END THE CADENCE DERIVES.
//
// Part 1 (x42-r9-mirror.test.mjs) is the money lane: the auto-reversal mirror made visible to the
// collision gate. This file is the three findings that ride beside it, and they are all one
// sentence of law — WDB-R2, "if a message cannot honestly promise an outcome, it must not promise
// it", applied at three altitudes:
//
//   F-N1b  THE REFUSAL'S SECOND REMEDY. "…or give this template distinct account codes", followed
//          verbatim after a [WDB-G13] retire-and-re-propose, re-ran five standing months onto
//          fresh codes: MEASURED RM30,000 of expense and RM30,000 of accrual against an RM15,000
//          intention, blocked:[]. Round 8's own cell certified the act as "followable" while
//          asserting only the NEW codes' balances and never the total — which is exactly the
//          WDB-R4 failure shape, living inside the repair.
//   F-N1c  THE RUN RECEIPT. Round 8 exported `correctable` and dropped the door's `verb`, so the
//          card wired its one button to clara.reverse_adjustment_pair — which refuses CLR10
//          not_an_auto_pair on every SOLO occurrence, the design's commonest case.
//   F-N1d  THE DERIVED PERIOD END. propose/sign domain-checked the two dates a human types and
//          not the one the cadence DERIVES, so FYE 30 Nov + an annual template starting
//          9999-12-01 signed LIVE and every run of it was refused date_unsupported for ever.
//
// THE OFF-PATH ARM (WDB-R4) is r9n1i: the whole mirror law re-asked on the ANNUAL cadence, where a
// mirror lands on day one of the next FINANCIAL YEAR rather than the next month — another grain,
// another clock, and a corridor none of the monthly measurements pass through.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, rootQuery, humanQuery,
  x42EnsureReady, skip42, caught, reasonToken, idOf,
  EXPA, EXPB, ACCR, CLR10, mon, addDays, lastEndedFy, clientFy,
  runManual, reversePair, retireTemplate, proposeTemplate, signTemplate, reverseEntry,
  accrualLines, adjWorld, freshAdjClient, freshAdjFirm, firmThresholdOf, liveTemplate,
  approveDraft, mirrorOf, glNet, templateRow,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});
after(async () => {
  printLaneNotes("x42-r9n1b");
  printSkipCount("x42-r9n1b");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the round-9 remedy/receipt/domain battery");

const runRefusal = (client, template, period) => caught(() => runManual(w.users.bob, {
  client, template, periodStart: period.start, periodEnd: period.end,
}));
const listRuns = async (sub, client) =>
  (await humanQuery(sub, "select clara.list_adjustment_runs(p_client => $1) as r", [client])).rows[0].r.runs;
const getRun = async (sub, run) =>
  (await humanQuery(sub, "select clara.get_adjustment_run(p_run => $1) as r", [run])).rows[0].r.run;

/** The last day of the month `iso` falls in, as 'YYYY-MM-DD' — derived, never a literal. */
const monthEndOf = (iso) => {
  const [y, m] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------------------
// x42.r9n1f — F-N1b, RECUT AT ROUND 10. Round 9 read the standing writer's template STATUS as
// lineage ("retired" ⇒ "this is the generation you replace"), PROHIBITED the distinct-codes act
// there, and this cell certified the prohibition. Round 10 measured that proxy wrong in BOTH
// directions with money — on a retired SIBLING it forbade the correct act and its one remaining
// instruction erased RM6,000 of a legitimate audit accrual, and worked in the propose-then-retire
// ORDER it read `live` and reprinted the doubling instruction anyway. So the claim under test is
// now the WDB-R2 MINIMUM: the refusal may neither ASSERT nor PROHIBIT what only lineage can prove.
// It offers both acts, and it carries the MEASURED caution — which sibling, what status, how many
// standing periods and which — beside the second one. What survives from round 9 unchanged is the
// half that was always right: the cell FOLLOWS what is offered and asserts the TOTAL books.
// ---------------------------------------------------------------------------------------
test("x42.r9n1f [recut round 10] the refusal offers BOTH acts and neither asserts nor prohibits a lineage it cannot see — the distinct-codes clause carries the measured predecessor caution instead, on a retired writer and on a live one alike, and following what is offered leaves the TOTAL books right", async (t) => {
  if (skipHere(t)) return;
  const P = mon(-3);

  // ---- ARM A: THE EDIT. The standing charge's template has been RETIRED.
  // BELOW the firm's high-stakes floor on purpose: the remedy this cell FOLLOWS is
  // clara.reverse_entry, and at or above the floor that verb only DRAFTS its mirror for a
  // checker -- a different (and separately-celled) story. The claim under test is about the
  // remedy's honesty, not about the correction ladder.
  const c1 = await freshAdjClient("r9n1f-edit");
  assert.ok(600_100 < (await firmThresholdOf(c1)),
    "the fixture figure is below the firm's high-stakes floor, so reverse_entry completes in one act");
  const t1 = await liveTemplate({
    client: c1, label: "r9n1f v1", start: P.start, lines: accrualLines(600_000), memo: "v1" });
  const r1 = await runManual(w.users.bob, {
    client: c1, template: t1.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r1.entry_id);
  await retireTemplate(w.users.hana, { client: c1, template: t1.id, reason: "the fee rose by RM1" });
  const t2 = await liveTemplate({
    client: c1, label: "r9n1f v2", start: P.start, lines: accrualLines(600_100), memo: "v2" });

  const errEdit = await runRefusal(c1, t2.id, P);
  assert.ok(errEdit, "the replacement generation is refused");
  assert.equal(reasonToken(errEdit), "period_shape_already_met");
  const dEdit = JSON.parse(errEdit.detail);
  assert.equal(dEdit.standing_template_status, "retired",
    "the writer's status is still REPORTED — it is a true fact a reader is entitled to");
  assert.equal(dEdit.standing_template_id, t1.id, "…and the writer is named");
  assert.match(errEdit.message, /or give this template distinct account codes/,
    "…but it no longer PROHIBITS the second act: the act is lawful, and on the designed shared-accrual collision it is the correct one");
  assert.doesNotMatch(errEdit.message, /Do NOT re-cut this template onto different account codes/,
    "the round-9 prohibition is gone");
  assert.doesNotMatch(errEdit.message, /it is the generation this one replaces/,
    "…and so is the assertion of a lineage this schema does not record");
  assert.match(errEdit.message, /BUT MEASURE FIRST/,
    "what replaces it is a MEASUREMENT the books can prove");
  assert.match(errEdit.message, /IF this template replaces that one/,
    "…stated conditionally, because only the professional knows whether it does");
  assert.deepEqual(dEdit.remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "and the machine key is BRANCH-DISTINCT: round 9 emitted the same scalar on both branches, so no consumer could learn a second act existed");
  assert.equal(dEdit.predecessor_candidates.length, 1, "one candidate predecessor was measured");
  assert.equal(dEdit.predecessor_candidates[0].template_id, t1.id, "…and it is named");
  assert.equal(dEdit.predecessor_candidates[0].standing, 1, "…with the periods it actually carries");
  assert.equal(dEdit.predecessor_candidates[0].first_period, P.start);

  // FOLLOW WHAT WAS OFFERED, and assert the TOTAL — not just the new codes.
  await reverseEntry(w.users.alice, {
    entry: dEdit.correction_entry, reason: "r9n1f follow the offered remedy", opKey: opk("r9n1f") });
  const r2 = await runManual(w.users.bob, {
    client: c1, template: t2.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r2.entry_id);
  assert.equal(await glNet(c1, EXPA), 600_100,
    "the month carries the CORRECTED figure ONCE — the old accrual was reversed on its own date");
  assert.equal(await glNet(c1, ACCR), -600_100, "…and the liability ties to the sen");
  assert.equal(await glNet(c1, EXPB), 0, "no second expense code was ever brought into it");

  // ---- ARM B: A GENUINELY SEPARATE LIVE SIBLING sharing one accrual code.
  const c2 = await freshAdjClient("r9n1f-live");
  const tA = await liveTemplate({
    client: c2, label: "r9n1f A", start: P.start, lines: accrualLines(2_000_000), memo: "A" });
  const rA = await runManual(w.users.bob, {
    client: c2, template: tA.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, rA.entry_id);
  const tShared = await liveTemplate({
    client: c2, label: "r9n1f shared", start: P.start,
    lines: accrualLines(700_000, { debit: EXPB, credit: ACCR }), memo: "shared" });
  const errLive = await runRefusal(c2, tShared.id, P);
  assert.ok(errLive, "sharing one accrual code with a standing LIVE template's charge is a collision");
  const dLive = JSON.parse(errLive.detail);
  assert.equal(dLive.standing_template_status, "live", "the standing charge's writer is live");
  assert.match(errLive.message, /or give this template distinct account codes/,
    "…and the second remedy is offered here too");
  // THE ROUND-10 POINT: the caution rides BOTH statuses. Round 9 keyed the clause on this very
  // field, so propose-then-retire (the order a professional works in) read 'live' and printed the
  // plain clause over four already-charged months. Status may be reported; it may not branch.
  assert.deepEqual(dLive.remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "a LIVE writer with standing charges is a doubling candidate too — the caution is keyed on what stands, not on a status snapshot");
  assert.equal(dLive.predecessor_candidates[0].template_id, tA.id);
  assert.equal(dLive.predecessor_candidates[0].status, "live");
});

// ---------------------------------------------------------------------------------------
// x42.r9n1g — F-N1c: THE RUN RECEIPT NAMES THE VERB THAT ADMITS IT, AND THE NAMED VERB IS CALLED.
// ---------------------------------------------------------------------------------------
test("x42.r9n1g every run receipt names the verb that admits its occurrence TODAY — clara.reverse_entry for a solo run and clara.reverse_adjustment_pair for a pair — and the named verb really admits while the other really refuses", async (t) => {
  if (skipHere(t)) return;
  const P = mon(-3);
  const face = (r) => ({
    correctable: r.correctable, verb: r.correction_verb, wall: r.correction_wall });

  // (1) SOLO, uncorrected.
  const c1 = await freshAdjClient("r9n1g-solo");
  const t1 = await liveTemplate({
    client: c1, label: "r9n1g solo", start: P.start, lines: accrualLines(600_000), memo: "solo" });
  const r1 = await runManual(w.users.bob, {
    client: c1, template: t1.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r1.entry_id);
  let rows = await listRuns(w.users.bob, c1);
  assert.deepEqual(face(rows[0]),
    { correctable: true, verb: "clara.reverse_entry", wall: null },
    "a solo occurrence is corrected with clara.reverse_entry, and the receipt says so");
  assert.equal(rows[0].correction_entry, r1.entry_id, "…on the occurrence itself");
  assert.deepEqual(face(await getRun(w.users.bob, rows[0].id)), face(rows[0]),
    "the by-id read and the list agree — ONE projection");

  // THE CORRIDOR, MEASURED: the verb the card used to call refuses this run.
  const wrong = await caught(() => reversePair(w.users.bob, {
    client: c1, occurrence: r1.entry_id, reason: "r9n1g the round-8 button" }));
  assert.ok(wrong, "clara.reverse_adjustment_pair refuses a solo occurrence");
  assert.equal(reasonToken(wrong), "not_an_auto_pair");
  assert.equal(wrong.code, CLR10);
  // …and the verb the receipt names admits it.
  await reverseEntry(w.users.alice, {
    entry: rows[0].correction_entry, reason: "r9n1g follow the named verb", opKey: opk("r9n1g") });
  rows = await listRuns(w.users.bob, c1);
  assert.deepEqual(face(rows[0]), { correctable: false, verb: null, wall: "entry_already_reversed" },
    "once corrected the receipt names no verb at all and reports the wall by its own token");
  assert.equal(await glNet(c1, EXPA), 0, "and the books are flat, on the entry's own date");

  // (2) PAIR, uncorrected -> the pair verb, on the occurrence.
  const c2 = await freshAdjClient("r9n1g-pair");
  const t2 = await liveTemplate({
    client: c2, label: "r9n1g pair", start: P.start, autoReverse: true,
    lines: accrualLines(600_000), memo: "pair" });
  const r2 = await runManual(w.users.bob, {
    client: c2, template: t2.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r2.entry_id);
  rows = await listRuns(w.users.bob, c2);
  assert.deepEqual(face(rows[0]),
    { correctable: true, verb: "clara.reverse_adjustment_pair", wall: "adjustment_pair_locked" },
    "a standing pair is corrected through the pair verb");
  assert.equal(rows[0].correction_entry, r2.entry_id, "…which takes the occurrence");

  // (3) PAIR, PENDING -> no verb, and the wall is the pair machine's own state.
  const { client: c3, users } = await freshAdjFirm("r9n1g-park");
  const cents = (await firmThresholdOf(c3)) + 400_000;
  const t3 = await liveTemplate({
    client: c3, label: "r9n1g park", start: P.start, autoReverse: true,
    lines: accrualLines(cents), memo: "park", proposer: users.keeper, signer: users.admin });
  const r3 = await runManual(users.keeper, {
    client: c3, template: t3.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(users.owner, r3.entry_id);
  const parked = await reversePair(users.keeper, {
    client: c3, occurrence: r3.entry_id, reason: "r9n1g park the pair" });
  assert.equal(parked.status, "pending", "a high-stakes pair correction PARKS for a checker");
  rows = await listRuns(users.keeper, c3);
  assert.deepEqual(face(rows[0]),
    { correctable: false, verb: null, wall: "pair_already_active" },
    "a parked correction names no verb — the pair door refuses its own second attempt");
  assert.equal(rows[0].active_pair_id, parked.pair_id, "…and the receipt links to the parked pair");
});

// ---------------------------------------------------------------------------------------
// x42.r9n1h — F-N1d: THE DERIVED PERIOD END IS INSIDE THE DOMAIN, AT BOTH DOORS.
// ---------------------------------------------------------------------------------------
test("x42.r9n1h a template whose first DERIVED period end falls outside the stamp grammar's domain is refused at PROPOSE and at SIGN — while the monthly template starting the same day, whose derived end is inside it, is admitted by the same derivation", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r9n1h");
  // FYE 30 November, so an annual period that OPENS 9999-12-01 CLOSES 10000-11-30 — a date the
  // four-digit ISO stamp grammar cannot carry, and one no caller ever typed.
  await rootQuery("update clara.clients set fy_end_month = 11, fy_end_day = 30 where id = $1", [client]);
  assert.deepEqual(await clientFy(client), { month: 11, day: 30 },
    "the fixture's financial year is the one this cell reasons about");

  const propose = (cadence, start) => caught(() => proposeTemplate(w.users.bob, {
    client, name: `x42 r9n1h ${cadence} ${start} ${Math.random()}`, cadence, start, end: null,
    autoReverse: false, lines: accrualLines(100_000), memo: "r9n1h" }));

  const errAnnual = await propose("annual", "9999-12-01");
  assert.ok(errAnnual, "the annual template whose first period ends in year 10000 is refused at PROPOSE");
  assert.equal(errAnnual.code, CLR10);
  assert.equal(reasonToken(errAnnual), "template_date_unsupported");
  const dA = JSON.parse(errAnnual.detail);
  assert.equal(dA.axis, "derived_period_end",
    "…on the DERIVED bound, distinct from the start_date/end_date axes a caller can type");
  assert.equal(dA.period_end, "10000-11-30", "and the refusal names the date it derived");
  assert.equal(dA.supported_to, "9999-12-31");

  // THE SAME DAY, THE OTHER CADENCE: 9999-12-01 opens a month that closes 9999-12-31, which IS in
  // the domain — so the same derivation admits it. A domain rule that refused both would be a
  // date ban wearing the rule's name.
  const errMonthly = await propose("monthly", "9999-12-01");
  assert.equal(errMonthly, null,
    "the monthly template starting the very same day is admitted: its first period ends 9999-12-31");

  // THE SIGN DOOR ASKS IT TOO. No verb can produce a PROPOSED template with an out-of-domain
  // derived end any more — that is the point of the door above — so the sign arm is reachable
  // only by staging one, which is exactly what a freshness re-derivation exists for (the client's
  // FY can move between propose and sign).
  const okAnnual = await proposeTemplate(w.users.bob, {
    client, name: `x42 r9n1h stage ${Math.random()}`, cadence: "annual",
    start: lastEndedFy(11, 30).start, end: null, autoReverse: false,
    lines: accrualLines(100_000), memo: "r9n1h stage" });
  const staged = idOf(okAnnual, "template_id", "id");
  // FIXTURE SURGERY: a template row is immutable outside its sign/retire transitions, and the
  // propose door above is now the only way in — so the SIGN arm has no verb-reachable input by
  // construction. The staging silences user triggers for that one statement (the wave-b
  // backdateAuthExpiry idiom) and moves nothing else.
  await rootQuery(`do $do$ begin
      perform set_config('session_replication_role','replica',true);
      update clara.adjustment_templates set start_date = date '9999-12-01'
        where id = '${staged}'::uuid;
    end $do$;`);
  const errSign = await caught(() => signTemplate(w.users.hana, { client, template: staged }));
  assert.ok(errSign, "sign re-derives the first period end and refuses the same condition");
  assert.equal(reasonToken(errSign), "template_date_unsupported");
  assert.equal(JSON.parse(errSign.detail).axis, "derived_period_end");
  assert.equal((await templateRow(staged)).status, "proposed",
    "…and the template never went live, so no period of it can ever be advertised");
});


// ---------------------------------------------------------------------------------------
// x42.r9n1i — OFF-PATH (WDB-R4): THE OTHER CADENCE AND THE OTHER CLOCK.
// Every mirror measurement in part 1 is monthly. On the ANNUAL cadence a mirror lands on day one
// of the next FINANCIAL YEAR — twelve months from the period its stamp names — so the money term
// is asked across a grain and a clock the monthly corridor never touches.
// ---------------------------------------------------------------------------------------
test("x42.r9n1i on the ANNUAL cadence the mirror lands on day one of the NEXT financial year: a monthly template carrying the mirror's own shape is refused for that month, while one carrying the occurrence's shape is admitted there", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r9n1i");
  const fy = await clientFy(client);
  const F = lastEndedFy(fy.month ?? 12, fy.day ?? 31);
  const M1 = { start: addDays(F.end, 1) };
  M1.end = monthEndOf(M1.start);
  if (!(M1.end < mon(0).start)) {
    // The first month of the next financial year has not ENDED in MYT on this anchor, so the
    // poster would refuse `not_ended` for a reason that has nothing to do with this cell. Skipping
    // LOUDLY (printSkipCount) rather than quietly asserting nothing.
    skip42(t, false, "x42.r9n1i — the first month of the next FY has not ended in MYT");
    return;
  }

  const annual = await liveTemplate({
    client, label: "r9n1i annual", cadence: "annual", start: F.start, autoReverse: true,
    lines: accrualLines(6_000_000, { debit: EXPA, credit: ACCR }), memo: "r9n1i annual" });
  const rA = await runManual(w.users.bob, {
    client, template: annual.id, periodStart: F.start, periodEnd: F.end });
  await approveDraft(w.users.alice, rA.entry_id);
  const mir = await mirrorOf(rA.entry_id);
  assert.equal(String(mir.posting_date).slice(0, 10), M1.start,
    "the annual mirror posts on day one of the next financial year — a whole year after the period its stamp names");

  const flip = await liveTemplate({
    client, label: "r9n1i flip", cadence: "monthly", start: M1.start,
    lines: accrualLines(500_000, { debit: ACCR, credit: EXPA }), memo: "r9n1i flip" });
  const errFlip = await runRefusal(client, flip.id, M1);
  assert.ok(errFlip, "a monthly release in the month the annual mirror's money landed is refused");
  assert.equal(reasonToken(errFlip), "period_shape_already_met");
  const d = JSON.parse(errFlip.detail);
  assert.equal(d.entry_id, mir.id, "…and it names the mirror, not the occurrence a year earlier");
  assert.equal(d.role, "reversal");

  // THE OTHER DIRECTION: a monthly accrual on the OCCURRENCE's shape belongs to the next financial
  // year, which the annual stamp does not overlap and the mirror's swapped money does not touch.
  const same = await liveTemplate({
    client, label: "r9n1i same", cadence: "monthly", start: M1.start,
    lines: accrualLines(400_000, { debit: EXPA, credit: ACCR }), memo: "r9n1i same" });
  let r2 = null;
  assert.equal(await caught(async () => {
    r2 = await runManual(w.users.bob, {
      client, template: same.id, periodStart: M1.start, periodEnd: M1.end });
  }), null,
    "the next financial year is a different stretch of calendar and the mirror shares no element with this shape");
  await approveDraft(w.users.alice, r2.entry_id);
  assert.equal(await glNet(client, EXPA, M1.end), 6_000_000 - 6_000_000 + 400_000,
    "the annual accrual, its release on day one of the new year, and the new month's accrual — each once, to the sen");
});
