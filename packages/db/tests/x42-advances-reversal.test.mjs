// 0042 Wave D-b — the STAFF-ADVANCE battery, part 4: THE REVERSAL MIRROR vs THE REGISTER.
//
// WHY THIS FILE EXISTS. Every cell here asks ONE question the first three parts never
// asked: when a reversal mirror lands on an enrolled advance account, is the register act
// that is supposed to account for it ACTUALLY THERE, and is it dated somewhere the §3.2
// equation can survive? Parts 1–3 pinned the lawful shapes — a correction is born, a void
// is stamped, the outstanding walks — and every one of them passed. The four defects this
// file pins all live in the gap between "a mirror is lawful" and "this particular mirror
// is accounted for", and each of them made the register and the GL disagree in a way no
// verb could ever clear. They were found by an adversarial as-built ladder, and the reason
// they existed is stated plainly: NO CELL ASKED.
//
// THE FOUR:
//   r1/r2  the belt's mirror door was an UNCONDITIONAL exemption — every leg of every
//          mirror walked through, including the mirror of a movement the register never
//          held (design §3.3 "the reversal-mirror door"; §F advance_movement_unregistered).
//   r3     hook arm (1) minted corrections and void stamps with NO enrolment-window test
//          while the tie's GL side IS window-scoped (§3.3 arm (1) vs §3.4).
//   r4/r5  `clara.reverse_entry` dates every mirror at TODAY (MYT) and §3.3 pins both
//          register acts to that date, with nothing ordering it against the fact it
//          unwinds — so a FUTURE-DATED original produced an unwind BEFORE its own fact.
//
// CONTRACT-BLIND WHERE IT CAN BE. The design of record and the ABI are still the only
// source for every verb name, argument and token — but three of these refusals are
// AS-BUILT adjudications (the design packet does not describe the case at all), so the
// cells state the LAW they hold the build to in their own words and assert the token the
// as-built ladder pinned. Each cell also carries its POSITIVE CONTROL in the same body:
// a guard that refuses everything is not a fix, and the lawful correction and the lawful
// void must keep passing or every reversal in the family is broken.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane,
  x42EnsureReady, skip42, refusesWith, axisToken, T, E,
  ADV1, BANKV, WAGES, mon, dayIn, today,
  advWorld, freshAdvClient, enrolHere, retireAdvance, approvedEntry, disburse,
  applyToAdvance, advanceSummary, advanceTie, rowsBy, numOf,
  advanceRow, advanceRows, applicationRowsOf, entryRowOf,
  outstandingAt, reverseAndSettle, glNet,
} from "./x42-adv-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-advances-reversal");
  printSkipCount("x42-advances-reversal");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b reversal-mirror battery");

/** A client whose advance code carries a PRE-ENROLMENT round trip: 50,000 out and the
 *  same 50,000 back, both approved before the code is enrolled, so the register holds
 *  nothing, the GL nets to zero and enrol-clean-only still admits the code afterwards.
 *  Returns the two entry ids — either one is a live reversal target. */
async function preEnrolmentRoundTrip(label, cents = 50_000) {
  const { client } = await freshAdvClient(label, { enrol: false });
  const out = await approvedEntry(w.users.alice, {
    client, memo: `x42 ${label} pre-enrolment float out`, postingDate: dayIn(mon(-6), 5),
    lines: [
      { account_code: ADV1, debit_cents: cents, credit_cents: 0, description: "legacy float" },
      { account_code: BANKV, debit_cents: 0, credit_cents: cents, description: "from bank" },
    ],
  });
  const back = await approvedEntry(w.users.alice, {
    client, memo: `x42 ${label} pre-enrolment float written to wages`, postingDate: dayIn(mon(-5), 5),
    lines: [
      { account_code: WAGES, debit_cents: cents, credit_cents: 0, description: "charged to payroll" },
      { account_code: ADV1, debit_cents: 0, credit_cents: cents, description: "float cleared" },
    ],
  });
  assert.equal(await glNet(client, ADV1), 0, `mandatory setup (${label}): the code is back at zero before enrolment`);
  const enrolment = await enrolHere(w.users.alice, { client, personLabel: `Pre-enrol ${label}` });
  assert.equal((await advanceRows(client)).length, 0, "…and the register holds nothing from before the watermark");
  return { client, enrolment, out, back, cents };
}

// ===========================================================================
// x42v.r1 / r2 — THE CONDITIONAL MIRROR DOOR (design §3.3, the belt).
// ===========================================================================

test("x42v.r1 the mirror door is CONDITIONAL: reversing a PRE-ENROLMENT credit debits the enrolled code with nothing to correct and refuses CLR40 advance_movement_unregistered — while a lawful correction mirror still passes", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment, back } = await preEnrolmentRoundTrip("r1");

  // THE ATTACK. The mirror of `back` DEBITS the enrolled code in window. Arm (1a) finds
  // no application on the original and mints nothing; arm (3) never soft-births on a
  // mirror (§3.3 pins it `reversal_of IS NULL`); the belt's debit door finds no register
  // row. An unconditional mirror exemption waves it through — and then the GL says 50,000
  // is owed while the register says 0.
  const err = await refusesWith(() => reverseAndSettle(w.users.alice, {
    entry: back, reason: "x42 r1 the write-off never happened", opKey: opk("x42r1a"),
  }), E.belt, T.advanceMovementUnregistered,
  "reversing a PRE-enrolment credit so the mirror debits the now-enrolled code");
  assert.equal(axisToken(err), "unregistered_mirror",
    "…on the MIRROR axis, not the ordinary unregistered-debit axis (same token, different defect)");

  // THE THREE CONSEQUENCES THE REFUSAL PREVENTS, each asserted rather than argued.
  assert.equal(await glNet(client, ADV1), 0, "the GL never moved — the whole reversal rolled back");
  assert.equal((await advanceRows(client)).length, 0, "…no register row was invented to paper over it");
  const tie = await advanceTie(w.users.alice, client, today());
  const row = rowsBy(tie, "account_code", "staff_advance_tie after the refusal").find((r) => r.account_code === ADV1);
  assert.equal(row.explained, true, "…and the tie is still explained (register 0 = GL 0)");
  assert.equal(numOf(row, /^difference_cents$/, "the tie row"), 0, "…to the sen");
  // Retirement is lawful here ONLY because the balance really is zero. Under the defect it
  // succeeded against a live 50,000 GL balance, orphaning it on an unwatched code.
  await retireAdvance(w.users.hana, { client, enrolment, reason: "x42 r1 close the account" });
  assert.equal(await glNet(client, ADV1), 0, "retiring at a genuine zero leaves nothing behind");

  // THE POSITIVE CONTROL: a mirror that DOES unwind a registered application still passes.
  const c2 = await freshAdvClient("r1ok");
  const a = (await disburse({ client: c2.client, cents: 30_000, postingDate: dayIn(mon(-3), 5) })).advance;
  const app = await applyToAdvance(w.users.bob, {
    client: c2.client, advance: a.id, cents: 30_000, postingDate: dayIn(mon(-2), 5), counter: BANKV, kind: "bank_return",
  });
  const m = await reverseAndSettle(w.users.bob, { entry: app.entryId, reason: "x42 r1 lawful unwind", opKey: opk("x42r1b") });
  const corrections = (await applicationRowsOf(a.id)).filter((r) => r.kind === "correction");
  assert.equal(corrections.length, 1, "the lawful correction mirror is ADMITTED and mints its correction");
  assert.equal(corrections[0].entry_id, m.mirror, "…carried by the mirror itself");
  assert.equal(await outstandingAt(a.id, today()), 30_000, "…restoring the advance in full");
});

test("x42v.r2 the mirror door, credit direction: reversing a PRE-ENROLMENT disbursement credits the enrolled code with no advance row to void and refuses CLR40 — while a lawful void mirror still passes and stamps", async (t) => {
  if (skipHere(t)) return;
  const { client, out } = await preEnrolmentRoundTrip("r2");

  // The mirror of `out` CREDITS the enrolled code. Arm (1b) finds no advance row born by
  // that entry, so it stamps nothing; the belt's credit door finds no allocation (there is
  // no advance to allocate to). Under the unconditional exemption this drove the GL to
  // MINUS 50,000 on an enrolled code while the register still said zero.
  const err = await refusesWith(() => reverseAndSettle(w.users.alice, {
    entry: out, reason: "x42 r2 the float was never paid", opKey: opk("x42r2a"),
  }), E.belt, T.advanceMovementUnregistered,
  "reversing a PRE-enrolment disbursement so the mirror credits the now-enrolled code");
  assert.equal(axisToken(err), "unregistered_mirror", "…again on the mirror axis");
  assert.equal(await glNet(client, ADV1), 0, "the GL never went negative — the reversal rolled back whole");

  // THE POSITIVE CONTROL: a mirror that DOES void a registered disbursement still passes,
  // and the stamp is the mirror's own date (design §3.2 void columns, hook-only).
  const c2 = await freshAdvClient("r2ok");
  const d = await disburse({ client: c2.client, cents: 45_000, postingDate: dayIn(mon(-3), 5) });
  const m = await reverseAndSettle(w.users.alice, { entry: d.entry, reason: "x42 r2 lawful void", opKey: opk("x42r2b") });
  const row = await advanceRow(d.advance.id);
  assert.equal(row.voided_by_entry_id, m.mirror, "the lawful void mirror is ADMITTED and stamps the register row");
  assert.equal(row.void_effective_date, (await entryRowOf(m.mirror)).posting_date,
    "…at the MIRROR's own posting_date (§3.3 arm (1))");
  assert.equal(await outstandingAt(d.advance.id, today()), 0, "…and the advance carries nothing from that date on");
});

// ===========================================================================
// x42v.r3 — THE WATERMARK ON THE REGISTER SIDE (design §3.3 arm (1) vs §3.4).
// ===========================================================================

test("x42v.r3 arm (1) is window-scoped too: reversing an application on a RETIRED enrolment refuses CLR40 (axis enrolment_closed) instead of re-opening an advance nothing watches — and re-enrolling is a real remedy that ties", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("r3");
  const a = (await disburse({ client, cents: 100_000, postingDate: dayIn(mon(-3), 5) })).advance;
  const app = await applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 100_000, postingDate: dayIn(mon(-2), 5), counter: BANKV, kind: "bank_return",
  });
  assert.equal(await outstandingAt(a.id, today()), 0, "mandatory setup: the advance is fully repaid");
  await retireAdvance(w.users.hana, { client, enrolment, reason: "x42 r3 the staff member left" });

  // THE DEFECT. The mirror is approved AFTER retired_at, so the belt's join never sees it
  // and the tie scores its GL leg out-of-window — but arm (1) had no window test at all,
  // so it minted the correction anyway: 100,000 back outstanding on a retired code, and a
  // permanent unclearable tie break (register 100,000 vs GL 0) where the two sides agree.
  const err = await refusesWith(() => reverseAndSettle(w.users.bob, {
    entry: app.entryId, reason: "x42 r3 the repayment never happened", opKey: opk("x42r3a"),
  }), E.belt, T.advanceMovementUnregistered, "reversing an application whose enrolment has been retired");
  assert.equal(axisToken(err), "enrolment_closed", "…naming the closed enrolment, not a missing allocation");
  assert.equal(await outstandingAt(a.id, today()), 0, "the register was not re-opened behind the professional's back");
  assert.equal((await applicationRowsOf(a.id)).filter((r) => r.kind === "correction").length, 0, "…no correction was minted");

  // THE REMEDY THE MESSAGE PROMISES, EXERCISED. A retired same-code enrolment never blocks
  // re-enrolment (design §3.1), and the balance IS zero at this moment, so enrol-clean-only
  // admits it. The correction then lands inside the new generation's window.
  const gen2 = await enrolHere(w.users.alice, { client, personLabel: "x42 r3 second holder" });
  assert.notEqual(gen2, enrolment, "mandatory setup: re-enrolment opens a NEW generation on the same code");
  const m = await reverseAndSettle(w.users.bob, {
    entry: app.entryId, reason: "x42 r3 the repayment never happened", opKey: opk("x42r3b"),
  });
  assert.ok(m.mirror, "the SAME reversal is admitted once the register can hold it");
  assert.equal(await outstandingAt(a.id, today()), 100_000, "…and the debt is back on the register, visibly");
  const row = rowsBy(await advanceTie(w.users.alice, client, today()), "account_code", "staff_advance_tie after the remedy")
    .find((r) => r.account_code === ADV1);
  assert.equal(row.explained, true, "…with the tie explained ACROSS both generations");
  assert.equal(numOf(row, /^difference_cents$/, "the tie row"), 0, "…to the sen (register 100,000 = in-window GL 100,000)");
  assert.equal(numOf(row, /^out_of_window_cents$/, "the tie row"), 0,
    "…and nothing stranded outside the windows — the whole history is inside one generation or the other");
});

// ===========================================================================
// x42v.r4 / r5 — THE UNWIND MAY NEVER PREDATE THE FACT (design §3.2 + §3.3).
//
// `clara.reverse_entry` stamps the mirror at TODAY (MYT) and never asks the caller for a
// date, so these two cells reach the defect the only way it is reachable: a FUTURE-DATED
// original. The refusal is therefore exactly as narrow as the defect — and it is also the
// honest accounting answer, because August cannot un-do what the books say happens in
// November. (Clamping the register act forward was the alternative and is REFUSED law: it
// would make the register disagree with a GL that really did post the mirror today, which
// is the one thing the tie exists to make impossible.)
// ===========================================================================

test("x42v.r4 a future-dated DISBURSEMENT cannot be voided today: the mirror would stamp void_effective_date BEFORE issue_date and drive historical outstanding NEGATIVE, so it refuses CLR39 advance_reversal_predates_movement", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("r4");
  const issue = dayIn(mon(3), 1);
  const { entry, advance } = await disburse({ client, cents: 100_000, postingDate: issue });
  assert.equal((await advanceRow(advance.id)).issue_date, issue, "mandatory setup: the advance is issued in the FUTURE");

  const err = await refusesWith(() => reverseAndSettle(w.users.alice, {
    entry, reason: "x42 r4 void the future float", opKey: opk("x42r4a"),
  }), E.adv, T.advanceReversalPredatesMovement, "reversing a future-dated disbursement today");
  assert.equal(axisToken(err), "void_predates_issue", "…naming which ordering broke");
  assert.equal((await advanceRow(advance.id)).voided_by_entry_id, null, "the advance was not voided");

  // THE PROPERTY, NOT JUST THE REFUSAL: no as-of between today and the issue date reports a
  // negative debt. Under the defect the midpoint read MINUS 100,000 — a figure with no
  // meaning, from an act that looked lawful when it was made.
  for (const asOf of [today(), dayIn(mon(1), 15), dayIn(mon(2), 15)]) {
    assert.equal(await outstandingAt(advance.id, asOf), 0,
      `outstanding is never negative before the advance exists (as-of ${asOf})`);
    assert.equal(numOf(await advanceSummary(w.users.alice, client, asOf), /^outstanding_cents$/,
      `staff_advance_summary at ${asOf}`), 0, "…and the read surface says the same");
  }

  // THE POSITIVE CONTROL: the identical reversal on a PAST-dated disbursement still voids.
  const c2 = await freshAdvClient("r4ok");
  const d = await disburse({ client: c2.client, cents: 100_000, postingDate: dayIn(mon(-3), 5) });
  const m = await reverseAndSettle(w.users.alice, { entry: d.entry, reason: "x42 r4 lawful void", opKey: opk("x42r4b") });
  assert.equal((await advanceRow(d.advance.id)).voided_by_entry_id, m.mirror,
    "a past-dated disbursement is still voidable — the guard is about ORDER, not about voids");
});

test("x42v.r5 a future-dated APPLICATION cannot be corrected today: the correction would take effect BEFORE the discharge it gives back and report more owed than was ever advanced, so it refuses CLR39 advance_reversal_predates_movement", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("r5");
  const a = (await disburse({ client, cents: 100_000, postingDate: dayIn(mon(-3), 5) })).advance;
  const effective = dayIn(mon(3), 1);
  const app = await applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 100_000, postingDate: effective, counter: BANKV, kind: "bank_return",
  });
  assert.equal((await applicationRowsOf(a.id))[0].effective_date, effective,
    "mandatory setup: the application takes effect in the FUTURE");

  const err = await refusesWith(() => reverseAndSettle(w.users.bob, {
    entry: app.entryId, reason: "x42 r5 the repayment never happened", opKey: opk("x42r5a"),
  }), E.adv, T.advanceReversalPredatesMovement, "reversing a future-dated application today");
  assert.equal(axisToken(err), "correction_predates_application", "…naming which ordering broke");
  assert.equal((await applicationRowsOf(a.id)).filter((r) => r.kind === "correction").length, 0,
    "no correction was minted");

  // THE PROPERTY: the register never reports a person owing MORE than was ever advanced.
  // Under the defect the midpoint read 200,000 on a 100,000 advance.
  for (const asOf of [today(), dayIn(mon(1), 15), dayIn(mon(2), 15)]) {
    const n = await outstandingAt(a.id, asOf);
    assert.ok(n >= 0 && n <= 100_000,
      `outstanding stays within [0, the advance] at every as-of (got ${n} at ${asOf})`);
    assert.equal(numOf(await advanceSummary(w.users.alice, client, asOf), /^outstanding_cents$/,
      `staff_advance_summary at ${asOf}`), n, "…and the read surface agrees with the rebuilt equation");
  }
  noteLane("x42v.r5: the only remedy for a mis-dated future application is to reverse it on or after its own date — reverse_entry never takes a date, so the refusal is the whole law here");

  // THE POSITIVE CONTROL: a PAST-dated application is still correctable, in full.
  const c2 = await freshAdvClient("r5ok");
  const b = (await disburse({ client: c2.client, cents: 100_000, postingDate: dayIn(mon(-3), 5) })).advance;
  const ok = await applyToAdvance(w.users.bob, {
    client: c2.client, advance: b.id, cents: 40_000, postingDate: dayIn(mon(-2), 5), counter: BANKV, kind: "bank_return",
  });
  await reverseAndSettle(w.users.bob, { entry: ok.entryId, reason: "x42 r5 lawful unwind", opKey: opk("x42r5b") });
  assert.equal(await outstandingAt(b.id, today()), 100_000,
    "a past-dated application is still correctable — the guard is about ORDER, not about corrections");
});
