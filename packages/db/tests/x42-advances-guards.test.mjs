// 0042 Wave D-b — the STAFF-ADVANCE battery, part 5: THE WATERMARK, AND THE REMEDIES
// REFUSALS NAME.
//
// WHY THIS FILE EXISTS. Parts 1–4 asked whether the register holds the right numbers.
// This one asks two questions none of them asked, both found by ROUND 2 of the adversarial
// as-built ladder, and both invisible to a suite that only ever drives one session:
//
//   1. IS THE WATERMARK MEASURED WITH AN INSTRUMENT THAT MEANS ANYTHING? `approved_at` is
//      stamped `now()` — the approving TRANSACTION'S START. Two transactions' starts carry
//      no order at all, so an approve that BEGAN before an enrolment began but RAN after it
//      committed was scored out-of-window: the belt skipped the leg, the hook soft-birthed
//      nothing, and staff_advance_tie filed a live GL debt under out_of_window_cents while
//      reporting `explained: true`. Enrol-clean-only — the whole reason the register can be
//      born at a watermark and still hold everything after it — was voided SILENTLY, and
//      `retire_staff_advance_account` then succeeded against a balance a person really owed.
//      w1 stages the race with two real sessions; w2 pins that the repair is EXACTLY that
//      band and nothing wider.
//
//   2. DOES A REFUSAL NAME A REMEDY THE CALLER CAN ACTUALLY PERFORM? Round 1 of the ladder
//      closed a class it named the WALLED CORRIDOR — a refusal whose named remedy is itself
//      refused — and then re-created it in its own fix: `enrolment_closed` said "re-enrol the
//      account (its balance is what it was when the enrolment was retired)", but nothing
//      guards a retired code, so one ordinary entry on it makes enrolment refuse
//      CLR10 enrolment_balance_nonzero forever. w3 walks the corridor and then the whole
//      escape. w4 pins the second instance: "reverse the entry on or after its own posting
//      date" is an instruction no verb can carry out, because clara.reverse_entry takes no
//      date at all. w5 is the plainest case of the same idea — a refusal that was not a
//      refusal but a raw CHECK violation naming a constraint the caller has never heard of.
//
// EVERY CELL HERE FAILS ON THE BUILD IT WAS WRITTEN AGAINST. That is the point: these
// defects existed because NO CELL ASKED.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane,
  x42EnsureReady, skip42, refusesWith, axisToken, detailOf, T, E,
  ADV1, ADV2, BANKV, OTHERV, mon, dayIn, today,
  advWorld, freshAdvClient, enrolHere, retireAdvance, approvedEntry, disburse,
  applyToAdvance, advanceTie, rowsBy, numOf, advanceRow, advanceRows,
  outstandingAt, reverseAndSettle, glNet, enrolAdvance, enrolmentRows,
  approveRacingEnrolment, completeAdvanceParticulars,
} from "./x42-adv-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-advances-guards");
  printSkipCount("x42-advances-guards");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b watermark + remedy battery");

/** The one tie row for `code`, with the envelope's own key names discovered. */
async function tieRow(client, code, asOf, label) {
  const tie = await advanceTie(w.users.alice, client, asOf);
  const row = rowsBy(tie, "account_code", label).find((r) => r.account_code === code);
  assert.ok(row, `${label}: staff_advance_tie carries a row for ${code}`);
  return row;
}

// ===========================================================================
// x42v.w1 — THE WATERMARK IS NOT A TRANSACTION-START TIMESTAMP.
// ===========================================================================

test("x42v.w1 an approve whose transaction began BEFORE the enrolment — but ran after it committed — is IN the register: the row is soft-birthed, the tie ties to the sen, and retirement is refused against the live balance", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("w1", { enrol: false });

  // THE RACE, staged with two real sessions (see approveRacingEnrolment). The helper
  // asserts its own precondition — the enrolment's stamp really does fall after the
  // approving transaction's start — so a cell that stopped staging the race would fail
  // there rather than passing vacuously here.
  const r = await approveRacingEnrolment({
    client, cents: 100_000, postingDate: dayIn(mon(0), 1),
    maker: w.users.alice, checker: w.users.bob, personLabel: "w1 race holder",
  });
  assert.equal(r.approveError, null,
    `the approve is lawful and must commit (got ${r.approveError?.code} ${r.approveError?.message})`);
  noteLane(`x42v.w1: approved_at ${r.approvedAt?.toISOString?.()} vs enrolled_at ${r.enrolledAt?.toISOString?.()} — the stamp really does precede the enrolment`);

  // (i) THE REGISTER HELD IT. Under the defect this was ZERO: arm (3) asked the watermark
  // with the transaction's start stamp, got no enrolment, and skipped the line.
  const rows = await advanceRows(client);
  assert.equal(rows.length, 1, "the movement soft-birthed its register row");
  assert.equal(Number(rows[0].amount_cents), 100_000, "…for the whole disbursement");
  assert.equal(rows[0].enrolment_id, r.enrolment,
    "…bound to the generation that was actually in force when the act happened");
  assert.equal(rows[0].entry_id, r.entry, "…and carried by the entry that moved the money");

  // (ii) THE THREE INSTRUMENTS AGREE. Under the defect the GL said 100,000 and the register
  // said 0, and the tie called that difference EXPLAINED by filing it out-of-window.
  assert.equal(await glNet(client, ADV1), 100_000, "mandatory setup: the GL really did move");
  const row = await tieRow(client, ADV1, today(), "staff_advance_tie after the race");
  assert.equal(row.explained, true, "the tie is explained");
  assert.equal(numOf(row, /^register_cents$/, "the tie row"), 100_000, "…register side holds the debt");
  assert.equal(numOf(row, /^gl_cents$/, "the tie row"), 100_000, "…GL side sees the same movement");
  assert.equal(numOf(row, /^difference_cents$/, "the tie row"), 0, "…to the sen");
  assert.equal(numOf(row, /^out_of_window_cents$/, "the tie row"), 0,
    "…and NOTHING is filed as out-of-window: the movement happened inside the enrolment, and the tie says so");

  // (iii) THE CONSEQUENCE THE SILENCE PRODUCED. With no register row, the retire guard read
  // zero outstanding and closed the watermark over a live 100,000 GL balance — after which
  // no repayment could ever be applied, because there was no advance row to apply to.
  await refusesWith(() => retireAdvance(w.users.hana, {
    client, enrolment: r.enrolment, reason: "x42 w1 close the account", opKey: opk("x42w1ret"),
  }), E.badRequest, T.advanceOutstandingOnRetire,
  "retiring an enrolment whose advance was born in the race band");
});

test("x42v.w2 the repair is EXACTLY the race band: a movement on a RETIRED code still rides out_of_window_cents, births nothing and is refused by nothing — the widened lower bound never re-opens a closed window", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("w2");
  const a = (await disburse({ client, cents: 60_000, postingDate: dayIn(mon(-3), 5) })).advance;
  await applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 60_000, postingDate: dayIn(mon(-2), 5), counter: BANKV, kind: "bank_return",
  });
  assert.equal(await outstandingAt(a.id, today()), 0, "mandatory setup: the advance is fully repaid");
  await retireAdvance(w.users.hana, { client, enrolment, reason: "x42 w2 the staff member left" });

  // THE PROBE. An ordinary entry on the retired code, approved NOW. The lower bound is the
  // one the round-2 fix relaxed; the UPPER bound is untouched, and this is what proves it —
  // a relaxation that leaked into the upper bound would make this movement a register act on
  // a generation that has been closed for months.
  const before = (await advanceRows(client)).length;
  await approvedEntry(w.users.alice, {
    client, memo: "x42 w2 the code is re-used as an ordinary float", postingDate: today(),
    lines: [
      { account_code: ADV1, debit_cents: 50_000, credit_cents: 0, description: "petty float" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 50_000, description: "from bank" },
    ],
  });
  assert.equal((await advanceRows(client)).length, before,
    "a debit on a RETIRED code soft-births nothing — the window really is shut");

  const row = await tieRow(client, ADV1, today(), "staff_advance_tie after the retired-code movement");
  assert.equal(numOf(row, /^register_cents$/, "the tie row"), 0, "the register holds nothing for it");
  assert.equal(numOf(row, /^gl_cents$/, "the tie row"), 0, "…the in-window GL side holds nothing either");
  assert.equal(numOf(row, /^out_of_window_cents$/, "the tie row"), 50_000,
    "…and the whole movement is reported in its own EXPLAINED column (design §3.4)");
  assert.equal(row.explained, true, "so the tie is explained, not red");

  // AND THE SECOND HALF OF THE SAME LAW: a code that was NEVER enrolled is untouched too.
  await approvedEntry(w.users.alice, {
    client, memo: "x42 w2 an ordinary expense on a never-enrolled code", postingDate: today(),
    lines: [
      { account_code: OTHERV, debit_cents: 7_000, credit_cents: 0, description: "sundry" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 7_000, description: "from bank" },
    ],
  });
  assert.equal((await advanceRows(client)).length, before,
    "…and nothing anywhere else in the chart became a register act either");
});

// ===========================================================================
// x42v.w3 — THE WALLED CORRIDOR, AND ITS EXIT (the enrolment_closed remedy).
// ===========================================================================

test("x42v.w3 enrolment_closed names a remedy that is EXECUTABLE: when the retired code has since been used for something else the refusal says so, measures the balance, and the full carry-down → re-enrol → reverse chain ties to the sen", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("w3");
  const a = (await disburse({ client, cents: 100_000, postingDate: dayIn(mon(-4), 5) })).advance;
  const app = await applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 100_000, postingDate: dayIn(mon(-3), 5), counter: BANKV, kind: "bank_return",
  });
  await retireAdvance(w.users.hana, { client, enrolment, reason: "x42 w3 the staff member left" });

  // THE FACT THAT BUILDS THE WALL. Design §3.1 deliberately BLESSES re-using a retired code
  // (the tie's out_of_window column is what keeps that honest), so this entry is lawful and
  // nothing refuses it — and from this moment the code's approved balance is 50,000.
  await approvedEntry(w.users.alice, {
    client, memo: "x42 w3 the code is re-used for a supplier deposit", postingDate: dayIn(mon(-1), 5),
    lines: [
      { account_code: ADV1, debit_cents: 50_000, credit_cents: 0, description: "supplier deposit" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 50_000, description: "from bank" },
    ],
  });
  assert.equal(await glNet(client, ADV1), 50_000, "mandatory setup: the retired code now carries a foreign balance");

  // (i) THE REFUSAL, AND WHAT IT NOW HAS TO SAY. Round 1's message asserted the balance was
  // "what it was when the enrolment was retired" — a claim the build neither enforces nor can.
  const err = await refusesWith(() => reverseAndSettle(w.users.bob, {
    entry: app.entryId, reason: "x42 w3 the repayment never happened", opKey: opk("x42w3a"),
  }), E.belt, T.advanceMovementUnregistered, "reversing an application whose enrolment is retired");
  assert.equal(axisToken(err), "enrolment_closed", "…on the closed-enrolment axis");
  const d = detailOf(err);
  assert.equal(Number(d.reenrolment_balance_cents), 50_000,
    "the refusal MEASURES the balance standing between the caller and the remedy it names");
  assert.equal(d.remedy, "clear_balance_then_re_enrol",
    "…and names WHICH remedy applies, machine-readably, so a surface never parses prose");

  // (ii) THE CORRIDOR IS REAL — the remedy round 1 named IS refused from here. This assertion
  // is the whole reason the fix exists; it is pinned so the class cannot come back a third time.
  await refusesWith(() => enrolHere(w.users.alice, { client, personLabel: "x42 w3 second holder" }),
    E.badRequest, T.enrolmentBalanceNonzero,
    "re-enrolling the code WITHOUT clearing it first (the remedy round 1 named, on its own)");

  // (iii) THE EXIT THE MESSAGE NOW NAMES, WALKED IN FULL. Nothing guards a retired code —
  // the same fact that built the wall is what lets an ordinary entry carry the foreign
  // balance down onto its own dedicated code.
  await approvedEntry(w.users.alice, {
    client, memo: "x42 w3 carry the deposit down onto its own code", postingDate: today(),
    lines: [
      { account_code: OTHERV, debit_cents: 50_000, credit_cents: 0, description: "supplier deposit, own code" },
      { account_code: ADV1, debit_cents: 0, credit_cents: 50_000, description: "cleared off the advance code" },
    ],
  });
  assert.equal(await glNet(client, ADV1), 0, "the code is clean again");
  const gen2 = await enrolHere(w.users.alice, { client, personLabel: "x42 w3 second holder" });
  assert.notEqual(gen2, enrolment, "…so the re-enrolment is now admitted, on a NEW generation");
  const m = await reverseAndSettle(w.users.bob, {
    entry: app.entryId, reason: "x42 w3 the repayment never happened", opKey: opk("x42w3b"),
  });
  assert.ok(m.mirror, "…and the SAME reversal the corridor blocked now lands");

  // (iv) THE CHAIN ENDS SOMEWHERE HONEST. The debt is back, visibly, and every cent of the
  // code's history is either inside a generation or explained outside one.
  assert.equal(await outstandingAt(a.id, today()), 100_000, "the debt is back on the register");
  const row = await tieRow(client, ADV1, today(), "staff_advance_tie after the whole remedy chain");
  assert.equal(row.explained, true, "the tie is explained across both generations");
  assert.equal(numOf(row, /^difference_cents$/, "the tie row"), 0, "…to the sen");
  assert.equal(numOf(row, /^out_of_window_cents$/, "the tie row"), 0,
    "…and the foreign balance nets to nothing outside the windows, because it was carried down rather than abandoned");
});

// ===========================================================================
// x42v.w4 — A REMEDY NO VERB CAN PERFORM IS NOT A REMEDY (the predates refusals).
// ===========================================================================

test("x42v.w4 the two predates refusals name the CALENDAR, not an instruction: clara.reverse_entry takes no date, so each one reports the date on which the entry becomes reversible", async (t) => {
  if (skipHere(t)) return;

  // (a) THE VOID SIDE — a future-dated disbursement.
  const c1 = await freshAdvClient("w4a");
  const issue = dayIn(mon(3), 1);
  const dis = await disburse({ client: c1.client, cents: 100_000, postingDate: issue });
  const e1 = await refusesWith(() => reverseAndSettle(w.users.alice, {
    entry: dis.entry, reason: "x42 w4 void the future float", opKey: opk("x42w4a"),
  }), E.adv, T.advanceReversalPredatesMovement, "reversing a future-dated disbursement today");
  assert.equal(axisToken(e1), "void_predates_issue", "…naming which ordering broke");
  assert.equal(detailOf(e1).reversible_on, issue,
    "the refusal states the DATE the entry becomes reversible — the only true remedy, because reverse_entry hard-codes the mirror at MYT today and takes no date argument");
  assert.ok(String(e1.message).includes(issue),
    "…and says so in the message a human reads, not only in the detail");

  // (b) THE CORRECTION SIDE — a future-dated application.
  const c2 = await freshAdvClient("w4b");
  const b = (await disburse({ client: c2.client, cents: 100_000, postingDate: dayIn(mon(-3), 5) })).advance;
  const effective = dayIn(mon(3), 1);
  const app = await applyToAdvance(w.users.bob, {
    client: c2.client, advance: b.id, cents: 100_000, postingDate: effective, counter: BANKV, kind: "bank_return",
  });
  const e2 = await refusesWith(() => reverseAndSettle(w.users.bob, {
    entry: app.entryId, reason: "x42 w4 the repayment never happened", opKey: opk("x42w4b"),
  }), E.adv, T.advanceReversalPredatesMovement, "reversing a future-dated application today");
  assert.equal(axisToken(e2), "correction_predates_application", "…naming which ordering broke");
  assert.equal(detailOf(e2).reversible_on, effective,
    "…and this side reports its own reversible-on date, the application's effective date");
  assert.ok(String(e2.message).includes(effective), "…in the message too");
  noteLane("x42v.w4: both predates refusals now carry `reversible_on` — the remedy is the calendar, and the ABI §F row for advance_reversal_predates_movement should name the field");
});

// ===========================================================================
// x42v.w5 — A BLANK REFERENCE IS A NAMED REFUSAL, NOT A RAW CHECK VIOLATION.
// ===========================================================================

test("x42v.w5 complete_staff_advance_particulars refuses a blank reference BY NAME on its own axis — the pair CHECK never reaches the caller as SQLSTATE 23514", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("w5");
  const d = await disburse({ client, cents: 40_000, postingDate: dayIn(mon(-1), 5) });
  assert.equal((await advanceRow(d.advance.id)).purpose, null,
    "mandatory setup: the advance is soft-born HONESTLY INCOMPLETE (WD-R1)");

  // NULL and SPACES only. A TAB-or-newline-only reference is accepted, and that is the house
  // `nullif(btrim(x),'')` idiom (btrim with no character argument strips spaces alone) used
  // 573 times across 41 migrations — residue R8, a house-wide question, deliberately NOT
  // made stricter in this one family by this one fix.
  for (const [label, reference] of [["null", null], ["blank", "   "]]) {
    const err = await refusesWith(() => completeAdvanceParticulars(w.users.bob, {
      client, advance: d.advance.id, purpose: "Travel float", reference, opKey: opk(`x42w5${label}`),
    }), E.badRequest, "advance_particulars_invalid", `completing particulars with a ${label} reference`);
    assert.equal(axisToken(err), "reference",
      "…on the REFERENCE axis, so the caller is told which field they left empty");
    assert.notEqual(err.code, "23514",
      "…and never as the raw pair-CHECK violation, which names a constraint the caller has never heard of");
  }
  assert.equal((await advanceRow(d.advance.id)).purpose, null,
    "no half-written particulars survived a refusal — purpose is still unset");

  // THE POSITIVE CONTROL: the door still admits a complete pair, once, and then refuses the
  // second call by name (set-once is unchanged by this fix).
  await completeAdvanceParticulars(w.users.bob, {
    client, advance: d.advance.id, purpose: "Travel float", reference: "PV/2026/0042", opKey: opk("x42w5ok"),
  });
  const row = await advanceRow(d.advance.id);
  assert.equal(row.purpose, "Travel float", "a complete pair is still recorded");
  assert.equal(row.reference, "PV/2026/0042", "…both halves of it");
  await refusesWith(() => completeAdvanceParticulars(w.users.bob, {
    client, advance: d.advance.id, purpose: "Something else", reference: "PV/2026/0043", opKey: opk("x42w5twice"),
  }), E.badRequest, T.particularsAlreadySet, "a second particulars call on the same advance");
});

// ===========================================================================
// x42v.g-r8 — [WDB-R4] THE QUESTION THE R8 ATTESTATION FIX DID NOT ASK.
//
// Residue R8, ruled 2026-08-03: a tab/newline-only attestation passed the house
// `nullif(btrim(x),'')` idiom (btrim/1 strips SPACES only) and was stored as [WDB-G15]'s SOLE
// related-party evidence. `enrol_staff_advance_account` — and ONLY that verb — now trims on the
// full ASCII whitespace set and refuses when nothing survives deleting whitespace + punctuation
// (the refusals are asserted in x42v.e3).
//
// A cell that only walks the fix's own path proves nothing. The dangerous failure mode of a
// STRICTER blankness rule is not that it lets junk through — it is that it silently REFUSES a
// legitimate professional. Malaysian practice writes attestations in English, Bahasa Malaysia
// and Chinese, and the obvious implementation of "must contain a letter or a digit" —
// `~ '[[:alnum:]]'` — is LOCALE-DEPENDENT: measured on this rig it is FALSE for '董事预支款'
// while being TRUE under a *.UTF-8 ctype, so it would refuse a Chinese attestation here and
// admit it in production. This cell is the guard against that class of "fix".
// ===========================================================================

test("x42v.g-r8 the attestation rule tests EMPTINESS, never alphabet: a Chinese attestation is admitted and stored verbatim, and a padded one is stored edge-trimmed with its content untouched", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("gr8", { enrol: false });

  const CN = "董事预支款：关联方结余，已知会审计";
  await enrolAdvance(w.users.alice, { client, accountCode: ADV1, attestation: CN });
  assert.equal((await enrolmentRows(client)).find((r) => r.account_code === ADV1)?.enrolment_attestation, CN,
    "a Chinese attestation is ADMITTED and stored VERBATIM — a locale-dependent alnum class would have refused it");

  // The trim WIDENED its character set; it must still narrow the EDGES only. Interior
  // whitespace, punctuation and the professional's own words are never rewritten.
  const PAD = " \t Pendahuluan gaji kepada Encik Ali; bukan pihak berkaitan. \n ";
  await enrolAdvance(w.users.alice, { client, accountCode: ADV2, attestation: PAD });
  const stored = (await enrolmentRows(client)).find((r) => r.account_code === ADV2)?.enrolment_attestation;
  assert.equal(stored, PAD.trim(), "a padded attestation is stored EDGE-TRIMMED…");
  assert.ok(stored.includes("gaji kepada Encik Ali; bukan pihak berkaitan."),
    "…with its interior — words, spaces and punctuation alike — byte-for-byte as written");
  noteLane("x42v.g-r8 the R8 attestation rule admits en/ms/zh wording; only whitespace-only and punctuation-only are refused");
});
