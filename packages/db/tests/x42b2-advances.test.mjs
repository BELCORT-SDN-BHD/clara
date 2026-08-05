// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x42-advances.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-advances.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (1): x42v.e7
// CELLS IN THE SIBLING FORK(S): b1 → D-b1
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-advances.test.mjs lands with its own slice.
// ===========================================================================
// 0042 Wave D-b — the STAFF-ADVANCE battery, part 1: ENROLMENT (design §3.1) ·
// THE REGISTER + SOFT-BIRTH + THE PARTICULARS CHASE (design §3.2/§3.3) · THE QUEUE.
//
// CONTRACT-BLIND: authored from `docs/plan/wave-d-b-design.md` §3 + §7 and
// `docs/plan/wave-d-b-design-abi.md` ONLY — this lane NEVER reads 0042's SQL or the
// 0042 section drafts. Every verb is called by its PINNED name with NAMED args;
// every refusal ABI §F names is asserted by its errcode AND its DETAIL reason token,
// verbatim. A divergence at integration is a FINDING for orchestrator adjudication,
// never a silent test edit.
//
// Siblings (all `x42-advances*.test.mjs`, auto-discovered by `node --test tests/`;
// split only because the repo enforces a 500-line file ceiling):
//   x42-advances.test.mjs        markers · enrolment · soft-birth · chase · queue
//   x42-advances-reads.test.mjs  applications · reads · tie · floors · revise
//   x42-advances-belt.test.mjs   the movement belt · reversal doors · temporal cap

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, noteLane, idOf, assertRaises,
  x42EnsureReady, skip42, refusesWith, refusesNamed, caught, T, E, EA1955_FACTS,
  ADV1, ADV2, ADV3, BANKV, WAGES, OTHERV, ARV, FACOST, FAACCUM, FAEXP,
  mon, dayIn, uniqTag, fnExists, columnExists, advWorld, freshAdvClient, enrolHere, enrolAdvance,
  retireAdvance, approvedEntry, approveDraft, disburse, applyToAdvance, upsertFaProfile,
  completeAdvanceParticulars, addBankAccount, proposeTemplate, advanceRows, advanceRow,
  enrolmentRows, policyRows, entryLinesOf, entryRowOf, glNet, outstandingAt, tableExists,
  queueRowsOfKind, openingBalanceAdvanceClient, mirrorIdOf, reverseEntry } from "./x42-adv-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-advances");
  printSkipCount("x42-advances");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b enrolment/register battery");

/** A digits-only bank account number (0038's account_number_normalized grammar). */
const acctNumber = () => `5${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

// ===========================================================================
// x42v.meta — the migration row + this lane's marker objects. A partial apply can
// never green the suite silently.
// ===========================================================================

const ADV_TABLES = ["staff_advance_accounts", "staff_advances", "staff_advance_applications", "ea1955_policy"];
const ADV_FNS = [
  "enrol_staff_advance_account", "retire_staff_advance_account",
  "book_staff_advance_application", "complete_staff_advance_particulars",
  "staff_advance_summary", "staff_advance_statement", "staff_advance_tie", "_adv_on_approve",
];

test("x42v.e7 the shared account-role reservation (design §2.1 `_acct_role_reserved`): an enrolled advance code is closed to the bank door, the FA profile and template lines — and an FA-reserved code is closed to enrolment", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("e7");

  // (a) the live bank belt (`_fa_assert_code_unreserved`, CoR) now reads the shared union.
  await refusesNamed(
    () => addBankAccount(w.users.alice, { client, accountNumber: acctNumber(), coaAccountCode: ADV1 }),
    "binding a bank account to an ACTIVELY ENROLLED advance code", { codes: [E.badRequest] },
  );
  // …the control arm: an unreserved asset code still binds, so (a) is not a blanket refusal.
  const ok = await addBankAccount(w.users.alice, { client, accountNumber: acctNumber(), coaAccountCode: BANKV });
  assert.ok(idOf(ok, "bank_account_id", "id"), `an UNRESERVED asset code still binds (got ${JSON.stringify(ok)})`);

  // (b) FA enrolment on an advance-reserved code — the ONE direction the design does not
  // close, RECORDED rather than asserted.
  //
  // [INTEGRATION ADJUDICATION — test_defect, with a standing concern] This arm demanded a
  // refusal. The design names the readers of `_acct_role_reserved` EXACTLY THREE TIMES and
  // `upsert_fa_account_profile` is not one of them: §2.1 (adjustment-template line
  // eligibility), §3.1 (advance enrolment), §3.1 (the bank belt — part2 round-5 ruling V7,
  // "`_fa_assert_code_unreserved` (CoR) reads `_acct_role_reserved`"). The FA profile door is
  // a 0041 body and 0042 recuts it nowhere; part2 [FI7] even pins "the FA arm stays exactly
  // 0041's law". So the union is deliberately read by the doors D-b OWNS, and this arm was
  // inferring a fourth reader. It runs on its OWN client because a profile that lands here
  // would claim FAACCUM/FAEXP and poison arm (c)'s accum_shared check.
  //
  // …AND THE CONCERN THIS ARM RAISED IS NOW SETTLED LAW, so the arm is an ASSERTION. What it
  // reported (residue R6): the reservation was ONE-DIRECTIONAL — arm (c) stopped an advance
  // being enrolled on an FA-reserved code, nothing stopped the reverse order, and a code
  // carrying both roles soft-births into BOTH registers on one debit. The owner ruled it
  // closed on 2026-08-03 (WDB-R3, "symmetry is the entire reason it exists") and 0042 S5.16
  // makes clara.upsert_fa_account_profile a reader of clara._acct_role_reserved. Its OWN
  // client: a profile landing here would claim FAACCUM/FAEXP and poison arm (c).
  const { client: faFirst } = await freshAdvClient("e7b");
  await refusesNamed(() => upsertFaProfile(w.users.alice, {
    client: faFirst, assetAccount: ADV1, accumAccount: FAACCUM, expenseAccount: FAEXP,
  }), "x42v.e7(b) FA-reserving an ACTIVELY ENROLLED advance code — the direction that used to be admitted",
  { codes: [E.badRequest, "CLR37"] });

  // (c) the mirror direction — enrolling an FA-reserved code. THIS is the direction the design
  // pins (§3.1: advance enrolment validates "unreserved per `_acct_role_reserved`"), and it is
  // asserted, not recorded.
  await upsertFaProfile(w.users.alice, { client, assetAccount: FACOST, accumAccount: FAACCUM, expenseAccount: FAEXP });
  await refusesNamed(
    () => enrolAdvance(w.users.alice, { client, accountCode: FACOST, personLabel: "fa clash" }),
    "enrolling an advance on an FA-reserved cost account", { codes: [E.badRequest] },
  );

  // (d) adjustment-template line eligibility reads the same union (design §2.1).
  await refusesNamed(
    () => proposeTemplate(w.users.bob, {
      client, startDate: mon(-2).start,
      lines: [
        { account_code: ADV1, debit_cents: 10_000, credit_cents: 0, description: "advance leg" },
        { account_code: WAGES, debit_cents: 0, credit_cents: 10_000, description: "counter" },
      ],
    }),
    "proposing an adjustment template whose line sits on an enrolled advance code", { codes: [E.badRequest] },
  );
  // …the control arm: the same template on unreserved codes proposes cleanly.
  const tmpl = await proposeTemplate(w.users.bob, {
    client, name: `x42 e7 control ${uniqTag()}`, startDate: mon(-2).start,
    lines: [
      { account_code: OTHERV, debit_cents: 10_000, credit_cents: 0, description: "accrual" },
      { account_code: WAGES, debit_cents: 0, credit_cents: 10_000, description: "counter" },
    ],
  });
  assert.ok(idOf(tmpl, "template_id", "id"), `an UNRESERVED line set proposes cleanly (got ${JSON.stringify(tmpl)})`);
});
