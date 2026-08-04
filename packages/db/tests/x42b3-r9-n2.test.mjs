// ===========================================================================
// [WAVE D-b SPLIT — D-b3 (0044, the AF-2 composite + the bank_rule_suggested producer)] A FORK OF `x42-r9-n2.test.mjs`.
//
// E21 RESIDUAL (ERRATA-E19-E25.md): R3's handoff ruled this file fully green at
// D-b3 and forking it OPTIONAL; four of its seven cells are green EARLIER, and this
// fork executes the remedy E21 named and quantified but did not perform. THE SPLIT
// MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is byte-for-byte
// the block of the same name in x42-r9-n2.test.mjs; the prologue (imports, world
// builder, before/after, module-level helpers) is byte-for-byte the original's and
// is shared by every fork of this file. The ONLY authored bytes in this file are
// this banner.
//
// CELLS HERE (3): x42.r9n2.f1a, x42.r9n2.f1b, x42.r9n2.f1c
// CELLS IN THE SIBLING FORK(S): b0 → D-b0; b1 → D-b1
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b013 (… + 0044)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-r9-n2.test.mjs lands with its own slice.
// ===========================================================================
// 0042 Wave D-b — as-built ladder ROUND-9 FIX WAVE, lane N2: THE FIFTH WALL, MIRRORED, AND
// THE WIDENED CLOCK CENSUS.
//
// Two independent findings from round 9 (session 651d02fc; ladder-r9-record.md), fixed in
// s3-advances.sql and s5-residuals.sql respectively:
//
//   F1 (Y2, HIGH, r9 finding 3) — `_tf_adv_movement_belt` door (c)'s `unregistered_mirror`
//   refusal was a FIFTH advance-side reversal wall that neither `_adv_reversal_admission` nor
//   the S4.6A release report modelled, so the report handed out `clara.reverse_entry` as a
//   remedy on a booking the register refuses at approval. Fixed by a new arm (1c) in
//   `_adv_reversal_admission`, mirroring the belt's own evidence test predictively off the
//   ORIGINAL entry's lines. CELLS 1-4 below reproduce the defect's own probe (finder Y2's
//   p1-fifth-wall.mjs) as durable assertions and, per WDB-R2/WDB-R4, CLOSE THE CLASS: a census
//   cell that fails the moment a sixth un-mirrored wall appears, rather than one that only
//   proves this one wall.
//
//   F3 (Y3, HIGH, r9 finding 5, instrument) — S5.25 arm (A)'s forbidden-clock-cast census was
//   evadable by FOUR syntactically-legal, semantically-identical-to-`now()::date` spellings
//   (`CAST(now() AS date)`, `date(now())`, a double-parenthesised call, an indirect cast
//   through an intermediate type) — a real, measured coverage hole in a money-date-correctness
//   gate, zero live occurrences today. CELL 5 re-derives the WIDENED v_forbidden pattern
//   independently (the x42-s5c-clock.test.mjs.5 "forward ratchet" precedent, kept duplicated on
//   purpose so a drift between the migration's own copy and this one is itself a finding) and
//   proves it against the LIVE catalog, positive and negative.
//
//   F7 (Codex, LOW, r9 finding 3, instrument) — the S5.26/S5.27 throwaway-proof header claimed
//   the insert-then-delete cycle left the schema "byte-identical"; Codex measured that
//   OVERSTATED (physical tuple/page churn is real and untouched). CELL 6 pins the narrower,
//   honest claim (logical/catalog/sequence cleanliness only) as its own positive proof.
//
//   F6 (Y1, LOW, r9 finding 9) — under a mid-month FYE, the ANNUAL depreciation run receipt
//   (exact-day, S5.26) and its own charge rows (month-grain, S5.27) name INCOHERENT windows —
//   both correct, individually, and tying to the cent, but nothing states the law that makes
//   that true. CELL 7 pins the documented, deliberate shape (s5-residuals.sql's own new
//   comment, right above clara._fa_fy_month_open_for) as a NAMED fact, not a silent gap — the
//   smallest honest, text/documentation-only fix (no persisted column, no RPC envelope, no
//   charge arithmetic touched; the CLAMPING alternative Y1 also named is a real code change
//   left for the owner at round 10, reported not attempted here).
//
// CONTRACT-BLIND POSTURE: this file asserts from the round-9 ladder record's OWN measured
// findings and fix directions (docs/plan/wave-d-b-design.md's WDB-R1..R4 + the recovered
// ladder-r9-record.md), never from re-reading the fix's own SQL after the fact — every assert
// below is what the FINDING says must now be true, not a description of what the code happens
// to do.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane, rootQuery,
} from "./a21-helpers.mjs";
import {
  af2World, freshAf2Client, openException, plainAt, unmatchBankMatch,
  enrolStaffAdvanceAccount, matchIdOf, reverseEntry,
  af2SubstrateReady, skipAf2, BANKCOA, ADVCODE, EXPN,
} from "./x42-af2-world.mjs";
import { pastBankLine, block, resolveAndBookAck, openExceptionOf, retireStaffAdvanceAccount } from "./x42-r8-seam-kit.mjs";
import { x42S5Ready, x42S5SkipHere } from "./x42-s5-helpers.mjs";
import { refusalSites, admissionArms, censusVerdict } from "./x42-r10-o3-kit.mjs";
import {
  faWorld, freshFaClient, setClientFyEnd, buyAsset, completeRB, liveAuthority, drainDue,
  chargeRows, runRows, mon,
} from "./x41-fa-world.mjs";

let live = false;
let world = null;
let liveFa = false;

before(async () => {
  live = await af2SubstrateReady();
  if (live) world = await af2World();
  liveFa = await x42S5Ready();
});

after(async () => {
  printLaneNotes("x42-r9-n2");
  printSkipCount("x42-r9-n2");
  await endPool();
});

const skipHere = (t) => skipAf2(t, live, "the round-9 fix-wave N2 battery (fifth wall + clock census)");
const skipHereFa = (t) => x42S5SkipHere(t, liveFa);
const caught = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const axisOf = (err) => /"axis"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;
const reasonOf = (err) => /"reason"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;

// ===========================================================================
// THE f1-census SCANNER'S HISTORY, IN ONE PLACE (the cell itself is far below).
//
// [round-10 fix wave, lane O2; r10 Z2 finding 6 (F6), MEDIUM] The round-9 census located the
// belt's reversal-only branch with ONE literal opening spelling
// (`belt.search(/if\s+new\.reversal_of\s+is\s+not\s+null\s+then/i)`, the FIRST match only) and
// then trusted "some axis appears anywhere in that one block" as proof every raise in it names
// one. r10 lens Z2 (probe scratchpad/z2/p1-census-honesty.mjs) measured three ways that scanner
// goes GREEN over a real, un-mirrored sixth wall: (C) a SECOND reversal guard written with a
// COMPOUND condition; (E) a reversal-path CLR40 raise with NO `axis` key at all; and (D) reuse
// of an EXISTING axis, which Z2 ruled un-catchable by a text census. (B), a brand-new axis
// inside the original block, already worked. O2 fixed (C) and (E) by enumerating EVERY
// reversal-scoped `if` block and judging every raise on its OWN text extent.
//
// [round-10 fix wave, lane O3; Codex r10 finding 2, MEDIUM] O2's widening was still an AXIS-SET
// comparison, and MEASURED (probe scratchpad/o3/probes/p3-census-axis-reuse.mjs, against the
// live belt) it stays GREEN over Codex's own mutation: a sixth un-mirrored refusal with a NEW
// reason (`advance_leg_unbacked_by_particulars`) and the EXISTING axis. Both axis sets read
// {unregistered_mirror}; `missing` was empty. The same probe measured the dynamic-axis case
// going red under a message that called it a "bare raise", which is a different fact.
//
// THE INSTRUMENT IS NOW SITE-LEVEL AND LIVES IN ONE PLACE: `x42-r10-o3-kit.mjs`, imported by
// this file and by x42-r10-o3.test.mjs so the two cells cannot drift. It enumerates refusal
// SITES keyed on the (reason, axis) PAIR plus the evidence relations of each site's GUARDING
// PREDICATE's source span, and requires a matching admission arm that consults the same books.
// The kit's own header carries the full argument and the stated boundary.
// ===========================================================================

// ===========================================================================
// F1, arm A — a PRE-ENROLMENT DEBIT on the advance code (a bank line booked as an advance
// disbursement before the account was enrolled), reversed after enrolment. The belt's mirror
// would CREDIT the code; door (c) demands a void naming the advance the original debit
// birthed, and none exists (the debit was never registered — the code was not yet enrolled).
// ===========================================================================
test("x42.r9n2.f1a the fifth wall now has an admission twin: the report PREDICTS the belt's unregistered_mirror refusal (pre-enrolment DEBIT), and running the named act refuses identically", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const CENTS = 50_000;
  const client = await freshAf2Client("r9n2f1a");
  const bl = await pastBankLine(sub, { client, amountCents: -CENTS, description: "r9n2 advance paid out" });
  const ex = await openException(sub, { client, line: bl.line.id, reason: "r9n2 unidentified outflow" });
  const booked = await resolveAndBookAck(sub, {
    client, exception: ex, note: "r9n2 booked as an advance (code not yet enrolled)",
    draft: {
      posting_date: bl.period.mid, memo: "r9n2 advance paid",
      lines: [
        { account_code: ADVCODE, debit_cents: CENTS, credit_cents: 0, description: "advance out" },
        { account_code: BANKCOA, debit_cents: 0, credit_cents: CENTS, description: "from the bank" },
      ],
    },
    opKey: opk("r9n2f1a-1"),
  });
  const entry = booked.entry_id;
  // zero the code so enrol-clean-only admits it, then enrol AFTER the fact — the design's own
  // named migration path (§3.1: "carry any pre-enrolment balance down BEFORE the account is
  // enrolled").
  await plainAt(sub, { client, debit: EXPN, credit: ADVCODE, cents: CENTS, postingDate: bl.period.mid, memo: "r9n2 write the advance off" });
  const enr = await caught(() => enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R9N2 Staff A" }));
  assert.equal(enr, null, "mandatory setup: enrol-clean-only must admit the now-zero code");

  await unmatchBankMatch(sub, { client, match: matchIdOf(booked), reason: "r9n2 wrong deposit" });
  const report = await block(bl.line.id);
  const row = (report?.bookings ?? []).find((x) => x.entry_id === entry);

  // THE PREDICTION. Before this fix, `reverse_blocked_by` was null and `remedy_calls` offered
  // clara.reverse_entry — a button wired to a call the register refuses. Now the report must
  // predict the SAME wall the belt will actually raise.
  assert.equal(row?.reverse_blocked_by, "advance_movement_unregistered",
    "the release report must PREDICT the belt's own wall, not stay silent about it");
  assert.equal(row?.advance_reversal?.axis, "unregistered_mirror",
    "the predicted wall must be the belt's own axis, not a different one");
  assert.deepEqual(row?.remedy_calls ?? [], [],
    "a booking the register will refuse at approval must not be offered as a remedy call — the walled-corridor class this ladder polices");

  // THE MEASUREMENT: running clara.reverse_entry must refuse with the SAME token the report
  // predicted — hook-verdict == report-prediction (the fix's own stated invariant).
  const err = await caught(() => reverseEntry(sub, { entry, reason: "r9n2 release", opKey: opk("r9n2f1ar") }));
  assert.ok(err, "reverse_entry must REFUSE — a pre-enrolment debit's mirror carries no register act to void");
  assert.equal(err.code, "CLR40");
  assert.equal(reasonOf(err), "advance_movement_unregistered");
  assert.equal(axisOf(err), "unregistered_mirror");

  // THE ADMISSION BODY ITSELF must agree — the ONE authority every caller consults.
  const adm = (await rootQuery("select clara._adv_reversal_admission($1) as r", [entry])).rows[0].r;
  assert.equal(adm.admitted, false);
  assert.equal(adm.blocked_by, "advance_movement_unregistered");
  assert.equal(adm.dated?.axis, "unregistered_mirror");
});

// ===========================================================================
// F1, arm B — the mirror-image leg direction: a PRE-ENROLMENT CREDIT (a repayment booked
// before the code was enrolled). The belt's mirror would DEBIT the code; door (c) demands a
// correction naming the application the original credit discharged, and none exists.
// ===========================================================================
test("x42.r9n2.f1b the fifth wall's admission twin covers the OTHER leg direction too (pre-enrolment CREDIT)", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const CENTS = 50_000;
  const client = await freshAf2Client("r9n2f1b");
  const bl = await pastBankLine(sub, { client, amountCents: CENTS, description: "r9n2 repayment in" });
  // first put the code in debit (unenrolled) so the credit booking can net it to zero.
  await plainAt(sub, { client, debit: ADVCODE, credit: EXPN, cents: CENTS, postingDate: bl.period.mid, memo: "r9n2 pre-enrolment advance (hand)" });
  const ex = await openException(sub, { client, line: bl.line.id, reason: "r9n2 unidentified inflow" });
  const booked = await resolveAndBookAck(sub, {
    client, exception: ex, note: "r9n2 booked as a repayment (code not yet enrolled)",
    draft: {
      posting_date: bl.period.mid, memo: "r9n2 repayment",
      lines: [
        { account_code: BANKCOA, debit_cents: CENTS, credit_cents: 0, description: "into the bank" },
        { account_code: ADVCODE, debit_cents: 0, credit_cents: CENTS, description: "advance cleared" },
      ],
    },
    opKey: opk("r9n2f1b-1"),
  });
  const entry = booked.entry_id;
  const enr = await caught(() => enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R9N2 Staff B" }));
  assert.equal(enr, null, "mandatory setup: enrol-clean-only must admit the now-zero code");

  await unmatchBankMatch(sub, { client, match: matchIdOf(booked), reason: "r9n2 wrong deposit" });
  const report = await block(bl.line.id);
  const row = (report?.bookings ?? []).find((x) => x.entry_id === entry);
  assert.equal(row?.reverse_blocked_by, "advance_movement_unregistered",
    "the release report must predict the belt's wall for the CREDIT direction too");
  assert.equal(row?.advance_reversal?.axis, "unregistered_mirror");
  assert.deepEqual(row?.remedy_calls ?? [], []);

  const err = await caught(() => reverseEntry(sub, { entry, reason: "r9n2 release", opKey: opk("r9n2f1br") }));
  assert.ok(err, "reverse_entry must REFUSE — a pre-enrolment credit's mirror carries no application to correct");
  assert.equal(err.code, "CLR40");
  assert.equal(reasonOf(err), "advance_movement_unregistered");
  assert.equal(axisOf(err), "unregistered_mirror");
});

// ===========================================================================
// F1, off-path [WDB-R4] — the fix must not wall in the REAL remedy the design names (retire the
// enrolment, then reverse, then re-book). A cell that only proves the refusal, never that a
// lawful escape still exists, is exactly the shape this ladder polices.
// ===========================================================================
test("x42.r9n2.f1c [WDB-R4 off-path] the fifth wall's own real escape still works: retire the enrolment, THEN reverse, THEN re-book — all three succeed", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const CENTS = 50_000;
  const client = await freshAf2Client("r9n2f1c");
  const bl = await pastBankLine(sub, { client, amountCents: -CENTS, description: "r9n2c advance out" });
  const ex = await openException(sub, { client, line: bl.line.id, reason: "r9n2c" });
  const booked = await resolveAndBookAck(sub, {
    client, exception: ex, note: "r9n2c pre-enrolment booking",
    draft: {
      posting_date: bl.period.mid, memo: "r9n2c",
      lines: [
        { account_code: ADVCODE, debit_cents: CENTS, credit_cents: 0, description: "advance out" },
        { account_code: BANKCOA, debit_cents: 0, credit_cents: CENTS, description: "from the bank" },
      ],
    },
    opKey: opk("r9n2f1c-1"),
  });
  await plainAt(sub, { client, debit: EXPN, credit: ADVCODE, cents: CENTS, postingDate: bl.period.mid, memo: "r9n2c write-off" });
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R9N2C" });
  await unmatchBankMatch(sub, { client, match: matchIdOf(booked), reason: "r9n2c release" });

  const before1 = await caught(() => reverseEntry(sub, { entry: booked.entry_id, reason: "r9n2c too early", opKey: opk("r9n2f1c-r1") }));
  assert.ok(before1, "reverse BEFORE retire must still refuse — the enrolment is live and the mirror carries no register act");
  assert.equal(axisOf(before1), "unregistered_mirror");

  const enrolment = (await rootQuery(
    "select id from clara.staff_advance_accounts where client_id=$1 and account_code=$2 and active", [client, ADVCODE],
  )).rows[0].id;
  const retireErr = await caught(() => retireStaffAdvanceAccount(world.users.hana, { client, enrolment, reason: "r9n2c to unwind" }));
  assert.equal(retireErr, null, "retire_staff_advance_account must SUCCEED — nothing is outstanding");

  const reverseErr = await caught(() => reverseEntry(sub, { entry: booked.entry_id, reason: "r9n2c release", opKey: opk("r9n2f1c-r2") }));
  assert.equal(reverseErr, null, "reverse_entry AFTER retire must SUCCEED — the fix must not wall off the design's own real escape");

  const ex2 = await openExceptionOf(bl.line.id);
  const rebook = await caught(() => resolveAndBookAck(sub, {
    client, exception: ex2, note: "r9n2c re-book after the escape",
    draft: {
      posting_date: bl.period.mid, memo: "r9n2c rb",
      lines: [
        { account_code: EXPN, debit_cents: CENTS, credit_cents: 0, description: "expense" },
        { account_code: BANKCOA, debit_cents: 0, credit_cents: CENTS, description: "from the bank" },
      ],
    },
    opKey: opk("r9n2f1c-2"),
  }));
  assert.equal(rebook, null, "the line must be re-bookable once the enrolment is retired — the escape must be real end to end");
});
