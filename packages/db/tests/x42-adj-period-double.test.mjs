// 0042 Wave D-b — THE CORRECT-AND-RE-RUN COMPOSITION (as-built ladder round 5).
//
// THE INVARIANT THIS FILE DEFENDS, in one sentence: a recurring-adjustment period's books
// must never carry more than ONE net occurrence of that (template, period) — so a corrected
// occurrence, and its auto-reversal mirror, must be neutralised ON THE VERY posting_date each
// was booked at, before the lane may run that period again.
//
// WHY IT NEEDS ITS OWN FILE. The defect is a COMPOSITION of two individually-correct laws, so
// no single-body cell could ever see it:
//   * the poster stamps every occurrence `posting_date = period_end` (an accrual FOR a period
//     belongs IN that period), and
//   * a correction is dated at MYT today (you do not silently post a correction into a period
//     you have already reported).
// Composed on an ANNUAL template: FY2025 accrues RM50,000 at 2025-12-31; a correction in Aug
// 2026 lands at 2026-08-03, so the 2025-12-31 balance still reads RM50,000; the due oracle now
// sees FY2025 unmet and re-proposes it; the re-run posts ANOTHER RM50,000 at 2025-12-31. The
// FY2025 balance sheet reads RM100,000 against a RM50,000 accrual — permanently, with the
// machine re-proposing it and no read able to show it (the adjustment lane has no register and
// no tie, unlike the FA lane).
//
// EVERY CELL BELOW ASSERTS A NUMBER, not a message: `glNet(client, code, asOf)` is the
// as-at-a-date trial-balance figure a statutory balance sheet is drawn from.
//
// The last three cells are the "what did the fix NOT think of" arms: the enforcement point
// must fire when a door this build does not own dates a correction elsewhere, it must fire on
// a HALF-corrected pair, and it must leave every non-adjustment reversal in the product dated
// exactly as it is dated today.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane,
  x42EnsureReady, skip42, refuses, caught,
  EXPA, ACCR, EXPB, ACCR2, CLR38, mon, addDays, mytToday,
  runManual, reverseEntry, reversePair, adjustmentRunDue, retireTemplate,
  accrualLines, adjWorld, freshAdjClient, liveTemplate, approveDraft,
  entryRowOf, mirrorOf, glNet, forgeEntryColumns,
  draftEntryV3, manualRes, rootQuery,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});

after(async () => {
  printLaneNotes("x42-adj-period-double");
  printSkipCount("x42-adj-period-double");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b correct-and-re-run battery");
const iso = (d) => String(d).slice(0, 10);

/** ONE approved occurrence of a fresh template. `autoReverse` picks the lane: false is the
 *  SOLO lane (plain clara.reverse_entry is its correction door), true is the PAIR lane. */
async function bornOccurrence(label, { cents = 60_000, period = mon(-3), autoReverse = false } = {}) {
  const client = await freshAdjClient(label);
  const tpl = await liveTemplate({
    client, label, start: period.start, cents, autoReverse,
    lines: accrualLines(cents), memo: "Accrued charge",
  });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  assert.equal(r.status, "drafted", `${label}: occurrence #1 always drafts (the ramp is unearned)`);
  await approveDraft(w.users.alice, r.entry_id);
  return { client, tpl, period, occurrence: r.entry_id, cents };
}

/** Re-run the oracle's advertised period and approve whatever it drafts. */
async function rerunAdvertisedPeriod(f, label) {
  const due = await adjustmentRunDue(f.client);
  assert.equal(due.due, true, `${label}: the corrected period is DUE again (design §2.3 — entries are the truth, receipts are never read for eligibility)`);
  assert.equal(iso(due.period_start), f.period.start, `${label}: it is the corrected period that is due`);
  const r = await runManual(w.users.bob, {
    client: f.client, template: f.tpl.id, periodStart: f.period.start, periodEnd: f.period.end });
  const id = r.entry_id;
  if (r.status === "drafted") await approveDraft(w.users.alice, id);
  return id;
}

// ---------------------------------------------------------------------------------------
// x42.cd1 — THE SOLO LANE. The money cell.
// ---------------------------------------------------------------------------------------
test("x42.cd1 SOLO lane: correct-and-re-run leaves the period carrying exactly ONE accrual, not two", async (t) => {
  if (skipHere(t)) return;
  const f = await bornOccurrence("cd1", { autoReverse: false });
  const occ1 = await entryRowOf(f.occurrence);
  assert.equal(iso(occ1.posting_date), f.period.end,
    "the occurrence is booked ON its period end (design §2.3 — an accrual FOR a period belongs IN it)");
  assert.equal(await glNet(f.client, EXPA, f.period.end), f.cents,
    "the period opens carrying exactly one accrual");

  const rev = await reverseEntry(w.users.bob, {
    entry: f.occurrence, reason: "cd1 the accrued figure was wrong", opKey: opk("cd1rev") });
  const corr = await entryRowOf(rev.reversal_id);
  assert.equal(corr.status, "approved", "cd1: the correction is below the firm floor and completes at once");
  assert.equal(iso(corr.posting_date), f.period.end,
    "THE CORRECTION IS DATED WITH THE OCCURRENCE IT CORRECTS. Dated at MYT today instead, the period's own balance never moves and the re-run below doubles it permanently.");
  assert.equal(await glNet(f.client, EXPA, f.period.end), 0,
    "as at the period end the accrual is GONE — that is what 'corrected' has to mean for a period figure");

  const occ2 = await rerunAdvertisedPeriod(f, "cd1");
  assert.notEqual(occ2, f.occurrence, "cd1: the re-run is a NEW occurrence");
  assert.equal(iso((await entryRowOf(occ2)).posting_date), f.period.end);

  assert.equal(await glNet(f.client, EXPA, f.period.end), f.cents,
    "THE STATUTORY FIGURE. The period carries ONE accrual after correct-and-re-run, never two.");
  assert.equal(await glNet(f.client, ACCR, f.period.end), -f.cents,
    "and the liability side matches it to the sen");
  assert.equal(await glNet(f.client, EXPA, null), f.cents,
    "over ALL time the same: three entries, one net accrual");
});

// ---------------------------------------------------------------------------------------
// x42.cd2 — THE PAIR LANE. Two entries, two dates, and the mirror is the second clock.
// ---------------------------------------------------------------------------------------
test("x42.cd2 PAIR lane: each correction is dated with the HALF it reverses, so neither the accrual month nor the release month doubles", async (t) => {
  if (skipHere(t)) return;
  const f = await bornOccurrence("cd2", { autoReverse: true });
  const mirror = await mirrorOf(f.occurrence);
  assert.ok(mirror, "cd2: the pair was born");
  const relDay = addDays(f.period.end, 1);
  assert.equal(iso(mirror.posting_date), relDay, "the mirror releases on day 1 of the next period");
  assert.equal(await glNet(f.client, EXPA, f.period.end), f.cents);
  assert.equal(await glNet(f.client, EXPA, relDay), 0);

  const pr = await reversePair(w.users.bob, {
    client: f.client, occurrence: f.occurrence, reason: "cd2 the accrued figure was wrong" });
  assert.equal(pr.status, "completed", "cd2: below the floor the pair correction completes in one act");
  const occCorr = await entryRowOf(pr.occurrence_correction_id);
  const mirCorr = await entryRowOf(pr.mirror_correction_id);
  assert.equal(iso(occCorr.posting_date), f.period.end,
    "the OCCURRENCE's correction is dated with the occurrence");
  assert.equal(iso(mirCorr.posting_date), relDay,
    "the MIRROR's correction is dated with the mirror — the pair's two entries sit on two dates, so one MYT-today date for both would leave BOTH months wrong");
  assert.equal(await glNet(f.client, EXPA, f.period.end), 0, "cd2: the accrual month is clean");
  assert.equal(await glNet(f.client, EXPA, relDay), 0, "cd2: the release month is clean");

  const occ2 = await rerunAdvertisedPeriod(f, "cd2");
  const mirror2 = await mirrorOf(occ2);
  assert.ok(mirror2, "cd2: the re-run births a fresh pair");

  assert.equal(await glNet(f.client, EXPA, f.period.end), f.cents,
    "THE STATUTORY FIGURE, accrual month: ONE accrual after correct-and-re-run");
  assert.equal(await glNet(f.client, ACCR, f.period.end), -f.cents);
  assert.equal(await glNet(f.client, EXPA, relDay), 0,
    "THE STATUTORY FIGURE, release month: ONE release against ONE accrual");
  assert.equal(await glNet(f.client, ACCR, relDay), 0);
});

// ---------------------------------------------------------------------------------------
// x42.cd3 — THE ENFORCEMENT POINT, asked WITHOUT the date fix in front of it.
//
// The date fix satisfies the invariant at the two doors this build owns. It cannot bind a
// door it does not own: `clara.approve_wrong_client_correction` mints its reversal at the
// session's `current_date` and is granted to bookkeepers, and any legacy row written before
// this migration carries the old MYT-today date. So the poster's admission has to REFUSE the
// re-run rather than trust that every correction was dated correctly — and it must say so by
// name, and the ORACLE must agree, or the daily sweep bangs on the refusal forever.
// ---------------------------------------------------------------------------------------
test("x42.cd3 a correction dated OUTSIDE its period refuses the re-run by name — and the oracle blocks the template instead of advertising a period the poster will refuse", async (t) => {
  if (skipHere(t)) return;
  const f = await bornOccurrence("cd3", { autoReverse: false });
  const rev = await reverseEntry(w.users.bob, {
    entry: f.occurrence, reason: "cd3 correction", opKey: opk("cd3rev") });

  // A FOURTH DOOR WITH A FOURTH CLOCK, simulated: move the correction off the period. This is
  // exactly the shape `approve_wrong_client_correction` writes today, and exactly the shape
  // every pre-0042 row already carries.
  const elsewhere = mytToday();
  assert.notEqual(elsewhere, f.period.end, "cd3 needs a corrected period that is not today");
  await forgeEntryColumns(rev.reversal_id, { posting_date: elsewhere }, { casts: { posting_date: "date" } });
  assert.equal(iso((await entryRowOf(rev.reversal_id)).posting_date), elsewhere);

  const err = await caught(() => runManual(w.users.bob, {
    client: f.client, template: f.tpl.id, periodStart: f.period.start, periodEnd: f.period.end }));
  assert.ok(err, "the poster refuses to re-run a period whose correction sits outside it — the re-run would double the period's own figure");
  assert.equal(err.code, CLR38);
  const d = JSON.parse(err.detail);
  assert.equal(d.reason, "period_correction_unsound");
  assert.equal(d.axis, "correction_out_of_period");
  assert.equal(d.entry_id, f.occurrence, "…and it names the entry whose date could not be matched");
  assert.equal(iso(d.posting_date), f.period.end);
  assert.equal(iso(d.correction_posting_date), elsewhere, "…beside the date its correction actually carries");

  // THE NAMED REMEDY MUST BE AN ACT THAT EXISTS AND THAT CLEARS THIS (WDB-R2). A refusal that
  // says "book it by hand" would be a lie here: a hand entry sets no reversed_by, the
  // original's reversed_by still names the out-of-period correction, and clara.reverse_entry
  // refuses to re-reverse. Exactly one act reaches the state, and the detail names it.
  assert.equal(d.remedy, "retire_adjustment_template",
    "cd3: the refusal names a machine-readable remedy, and it is the ONE act that clears this");

  const due = await adjustmentRunDue(f.client);
  assert.equal(due.due, false, "cd3: the oracle does not advertise a period the poster is guaranteed to refuse");
  assert.equal(due.reason, "all_blocked");
  assert.deepEqual(due.blocked.map((b) => b.reason), ["period_correction_unsound"],
    "cd3: and it names the template on blocked[] so /rules can badge it (ABI §A row shape unchanged)");
  assert.equal(due.blocked[0].template_id, f.tpl.id);

  // The books are UNDOUBLED, which is the whole point of refusing.
  assert.equal(await glNet(f.client, EXPA, f.period.end), f.cents,
    "cd3: the period still carries exactly its original single accrual");

  // AND THE REMEDY REALLY REACHES IT. Retiring the template stops the period being proposed
  // at all — the template leaves blocked[] because it is no longer live, which is what
  // "terminal for this period" has to mean operationally.
  await retireTemplate(w.users.hana, {
    client: f.client, template: f.tpl.id, reason: "cd3 the lane cannot finish this period" });
  const after = await adjustmentRunDue(f.client);
  assert.equal(after.due, false);
  assert.equal(after.reason, "nothing_due",
    "cd3: after the named remedy the client has nothing due AND nothing blocked — the badge clears");
  assert.deepEqual(after.blocked, [], "cd3: …and blocked[] is empty");
});

// ---------------------------------------------------------------------------------------
// x42.cd4 — THE HALF-CORRECTED PAIR. What the date fix did not think of.
//
// `_wdb_reversal_blocked` arm (a) stops `clara.reverse_entry` splitting a pair, but it is a
// VERB-side wall on ONE verb. If any door ever corrects the occurrence and leaves the mirror
// standing, the re-run adds a second accrual AND a second release against ONE surviving
// release — the release month goes wrong even though the accrual month looks right.
// ---------------------------------------------------------------------------------------
test("x42.cd4 an un-corrected pair half blocks the re-run: one standing mirror plus a fresh pair is a wrong release month", async (t) => {
  if (skipHere(t)) return;
  const f = await bornOccurrence("cd4", { autoReverse: true });
  const mirror = await mirrorOf(f.occurrence);
  const pr = await reversePair(w.users.bob, {
    client: f.client, occurrence: f.occurrence, reason: "cd4 correction" });
  assert.equal(pr.status, "completed");

  // Un-link the MIRROR's correction, leaving the mirror standing approved and un-reversed —
  // the state a door with no pair wall produces when it reverses one half.
  await forgeEntryColumns(mirror.id, { reversed_by: null }, { casts: { reversed_by: "uuid" } });
  assert.equal((await entryRowOf(mirror.id)).reversed_by, null);

  await refuses(
    () => runManual(w.users.bob, {
      client: f.client, template: f.tpl.id, periodStart: f.period.start, periodEnd: f.period.end }),
    "period_correction_unsound",
    "cd4: a standing, un-corrected pair half refuses the re-run",
    { code: CLR38 });
  const due = await adjustmentRunDue(f.client);
  assert.equal(due.due, false);
  assert.deepEqual(due.blocked.map((b) => b.reason), ["period_correction_unsound"]);
});

// ---------------------------------------------------------------------------------------
// x42.cd5 — THE SCOPE PROOF. `clara.reverse_entry` is house law for the WHOLE product; this
// wave may not move the date of any reversal that is not a recurring-adjustment entry.
// ---------------------------------------------------------------------------------------
test("x42.cd5 an ORDINARY entry's reversal is still dated MYT today — the adjustment-lane date rule is scoped to the lane and changes nothing else", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("cd5");
  const back = addDays(mytToday(), -40);
  const res = await manualRes(w.users.bob, client);
  const d = await draftEntryV3(w.users.bob, {
    client, postingDate: back, memo: "cd5 an ordinary manual entry", resolution: res,
    lines: accrualLines(4_000), opKey: opk("cd5d") });
  const entry = d.entry_id ?? d.id;
  await approveDraft(w.users.alice, entry);
  assert.equal(iso((await entryRowOf(entry)).posting_date), back);

  const rev = await reverseEntry(w.users.bob, {
    entry, reason: "cd5 ordinary reversal", opKey: opk("cd5rev") });
  assert.equal(iso((await entryRowOf(rev.reversal_id)).posting_date), mytToday(),
    "an ordinary reversal still lands on MYT TODAY — the house law (0041 S4.4) is untouched");
  const flagged = await rootQuery(
    "select count(*)::int as n from clara.journal_entries where id=$1 and flags ? 'recurring_adjustment'",
    [entry]);
  assert.equal(Number(flagged.rows[0].n), 0, "cd5: and the entry under test carries no lane stamp at all");
  noteLane("cd5: reverse_entry's MYT law verified intact on a non-lane entry");
});

// ---------------------------------------------------------------------------------------
// x42.cd6 — THE GENERATION BYPASS (as-built ladder round 6).
//
// Round 5's gate was keyed on template_id, and [WDB-G13] says a template is IMMUTABLE: editing
// it is retire + propose again, which mints a NEW template_id. So the most ordinary user story
// in this lane — "the accrued figure was wrong, correct the template" — walked straight through
// every guard. MEASURED before the fix: a month standing at RM50,000.00, the template retired
// and re-proposed at the corrected RM60,000.00, the oracle re-advertising that month, and the
// books ending at RM110,000.00 against a RM60,000.00 intention. On a three-month window the
// same act doubled three statutory months in one sweep.
//
// The gate is now keyed on the ACCOUNT LINE-SHAPE — which is what the books can actually see.
// Amounts are deliberately NOT in the key: 50,000 and 60,000 are different lines but the same
// accrual, and a key that told them apart would have missed the measured case entirely.
// ---------------------------------------------------------------------------------------
test("x42.cd6 retire + re-propose with a CORRECTED figure cannot double the month a retired generation already met — the oracle blocks it, the poster refuses it by name, and correcting the standing entry in its own period releases it", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("cd6");
  const p = mon(-3);
  const wrong = 50_000_00;
  const right = 60_000_00;

  const t1 = await liveTemplate({
    client, label: "cd6a", start: p.start, cents: wrong, autoReverse: false,
    lines: accrualLines(wrong), memo: "Accrued audit fee" });
  const r1 = await runManual(w.users.bob, {
    client, template: t1.id, periodStart: p.start, periodEnd: p.end });
  if (r1.status === "drafted") await approveDraft(w.users.alice, r1.entry_id);
  assert.equal(await glNet(client, ACCR, p.end), -wrong, "cd6: the month opens carrying the wrong figure, once");

  // THE [WDB-G13] EDIT: retire, re-propose with the corrected figure. Both acts are lawful and
  // both still succeed — nothing here walls the edit itself.
  await retireTemplate(w.users.hana, { client, template: t1.id, reason: "cd6 the figure was wrong" });
  const t2 = await liveTemplate({
    client, label: "cd6b", start: p.start, cents: right, autoReverse: false,
    lines: accrualLines(right), memo: "Accrued audit fee" });

  const due = await adjustmentRunDue(client);
  assert.equal(due.due, false, "cd6: the oracle does NOT advertise a month a standing accrual of this shape already occupies");
  assert.equal(due.reason, "all_blocked");
  assert.deepEqual(due.blocked.map((b) => b.reason), ["period_shape_already_met"],
    "cd6: and it says so on blocked[] — silently skipping the month would leave the wrong figure in the books with nobody told");
  assert.equal(due.blocked[0].template_id, t2.id);

  const err = await caught(() => runManual(w.users.bob, {
    client, template: t2.id, periodStart: p.start, periodEnd: p.end }));
  assert.ok(err, "cd6: and the poster refuses the same triple, so a direct call cannot get around the oracle");
  assert.equal(err.code, CLR38);
  const d = JSON.parse(err.detail);
  assert.equal(d.reason, "period_shape_already_met");
  assert.equal(d.entry_id, r1.entry_id, "…naming the STANDING entry, which is the one a human has to decide about");
  assert.equal(iso(d.posting_date), p.end, "…and the date it stands at");
  assert.deepEqual(d.account_shape, [`${ACCR}:C`, `${EXPA}:D`].sort(),
    "…and the account shape that collided, sorted, so two spellings of one accrual compare equal");
  assert.deepEqual(d.remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "…and the machine key is the COMPOSED remedy [round 10]: the safe act first, then the distinct-codes act carrying its measured predecessor caution — the retired generation has a standing charge, so a re-cut onto fresh codes is a doubling candidate the product may caution about but must not prohibit");

  assert.equal(await glNet(client, ACCR, p.end), -wrong,
    "THE STATUTORY FIGURE: the month still carries ONE accrual, not RM110,000 of two (the measured pre-fix number)");
  assert.equal(await glNet(client, EXPA, p.end), wrong);

  // THE NAMED REMEDY IS REACHABLE, not merely named (WDB-R2). Correcting the standing entry
  // lands the correction IN the period (that is the other half of this round's fix), the month
  // clears, and the corrected template runs it exactly once.
  const rev = await reverseEntry(w.users.bob, {
    entry: r1.entry_id, reason: "cd6 the accrued figure was wrong", opKey: opk("cd6rev") });
  // A RM50,000 mirror is over this firm's high-stakes floor, so it DRAFTS. Settling it is part
  // of the remedy, not a test convenience: an unapproved mirror moves no money and the month
  // would still be occupied — which is the honest state, and the gate says so until it lands.
  if ((await entryRowOf(rev.reversal_id)).status === "draft") {
    assert.notEqual(await glNet(client, ACCR, p.end), 0,
      "cd6: while the correction is still a DRAFT the month is still occupied — the gate reads approved books, never intentions");
    await approveDraft(w.users.alice, rev.reversal_id);
  }
  assert.equal(await glNet(client, ACCR, p.end), 0, "cd6: the standing accrual clears within its own period");
  const due2 = await adjustmentRunDue(client);
  assert.equal(due2.due, true, "cd6: …and the corrected template's month is due at once");
  assert.equal(due2.template_id, t2.id);
  const r2 = await runManual(w.users.bob, {
    client, template: t2.id, periodStart: p.start, periodEnd: p.end });
  if (r2.status === "drafted") await approveDraft(w.users.alice, r2.entry_id);
  assert.equal(await glNet(client, ACCR, p.end), -right,
    "cd6: the edit lands EXACTLY ONCE — the month ends at the corrected figure, not at the sum of both");
});

// ---------------------------------------------------------------------------------------
// x42.cd7 — WHAT THE SHAPE KEY DID NOT THINK OF: the boundary, in both directions.
//
// A key wide enough to catch the generation bypass is wide enough to catch something else. This
// cell pins exactly where the line falls, so the residual is a MEASURED fact rather than a hope:
//   * two live templates on DIFFERENT accounts are independent lanes and both accrue — the
//     house idiom the existing battery already writes (x42.d1 gives its second template
//     EXPB/ACCR2), and the overwhelmingly common configuration;
//   * two live templates on the SAME accounts and the same directions are, to the books and to
//     every reader of them, indistinguishable — so the second is refused BY NAME, with the
//     standing entry and both remedies stated. THIS IS THE NAMED RESIDUAL of the shape key: a
//     firm that genuinely wants two parallel accruals through one Dr/Cr pair must give them
//     distinct codes, which is also the only configuration under which a reviewer could ever
//     tell the two apart.
// ---------------------------------------------------------------------------------------
test("x42.cd7 the shape key's boundary: different account shapes never collide, identical ones are refused by name — the residual, measured", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("cd7");
  const p = mon(-3);

  const ta = await liveTemplate({
    client, label: "cd7a", start: p.start, cents: 40_000, autoReverse: false,
    lines: accrualLines(40_000), memo: "Accrued rent" });
  const tb = await liveTemplate({
    client, label: "cd7b", start: p.start, cents: 30_000, autoReverse: false,
    lines: accrualLines(30_000, { debit: EXPB, credit: ACCR2 }), memo: "Accrued audit" });

  const ra = await runManual(w.users.bob, { client, template: ta.id, periodStart: p.start, periodEnd: p.end });
  if (ra.status === "drafted") await approveDraft(w.users.alice, ra.entry_id);

  // DIRECTION 1 — a DIFFERENT shape in the same period is untouched.
  const due = await adjustmentRunDue(client);
  assert.equal(due.due, true, "cd7: template B's period is still due — a different account shape is a different accrual");
  assert.equal(due.template_id, tb.id);
  assert.deepEqual(due.blocked, [], "cd7: …and nothing is blocked");
  const rb = await runManual(w.users.bob, { client, template: tb.id, periodStart: p.start, periodEnd: p.end });
  if (rb.status === "drafted") await approveDraft(w.users.alice, rb.entry_id);
  assert.equal(await glNet(client, EXPA, p.end), 40_000, "cd7: both accruals stand, each on its own accounts");
  assert.equal(await glNet(client, EXPB, p.end), 30_000);

  // DIRECTION 2 — an IDENTICAL shape is refused, and the refusal names an act that exists.
  const tc = await liveTemplate({
    client, label: "cd7c", start: p.start, cents: 25_000, autoReverse: false,
    lines: accrualLines(25_000), memo: "Accrued rent, second" });
  const err = await caught(() => runManual(w.users.bob, {
    client, template: tc.id, periodStart: p.start, periodEnd: p.end }));
  assert.ok(err, "cd7: a THIRD template moving the same two accounts the same way is refused");
  const d = JSON.parse(err.detail);
  assert.equal(d.reason, "period_shape_already_met");
  assert.equal(d.entry_id, ra.entry_id, "…naming template A's standing occurrence");
  assert.equal(await glNet(client, EXPA, p.end), 40_000, "cd7: and the account is NOT doubled");
  noteLane("cd7 RESIDUAL: two LIVE templates sharing an exact (account, side) set can no longer both accrue into one period; the refusal names the standing entry and both remedies (correct it in period, or give the templates distinct codes)");
});
