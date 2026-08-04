// 0042 Wave D-b — the STAFF-ADVANCE battery, part 3: THE DEFERRED MOVEMENT BELT
// (design §3.3, the WDB-G5 asymmetry) · THE TEMPORAL CAP · HOOK-BORN CORRECTIONS ·
// THE TWO REVERSAL DOORS · THE AS-OF OUTSTANDING EQUATION (§3.2).
//
// CONTRACT-BLIND (see the x42-adv-helpers.mjs header): authored from the D-b design
// of record + the ABI, never from 0042's SQL. Refusals ABI §F names are asserted by
// errcode AND reason token, verbatim.
//
// THE WATERMARK READING THIS FILE ENCODES. §3.3 scopes the belt to the enrolment
// watermark [enrolled_at, retired_at]. Those are TIMESTAMPS on the enrolment row, and
// every fixture entry here is back-dated (accounting dates are historical while the
// enrolment act happens now) — so the only reading under which the belt can bind at
// all is the D-a one: a movement is IN WINDOW when the ENTRY WAS APPROVED between the
// enrolment's `enrolled_at` and its `retired_at`, never when its posting_date falls
// there. Every boundary cell below is built to be unambiguous under that reading.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane, idOf,
  x42EnsureReady, skip42, refusesWith, refusesNamed, T, E,
  ADV1, ADV2, BANKV, mon, dayIn, today,
  advWorld, freshAdvClient, enrolHere, retireAdvance, approvedEntry, disburse,
  applyToAdvance, bookApplication, advanceSummary, rowsBy, numOf,
  advanceRow, advanceRows, applicationRowsOf, applicationRows, entryRowOf, entryLinesOf,
  outstandingAt, reverseEntry, reverseAndSettle, openingBalanceAdvanceClient, glNet,
} from "./x42-adv-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-advances-belt");
  printSkipCount("x42-advances-belt");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b belt/correction battery");

/** The mirror ID alone — this file's cells never care which reverse_entry branch ran.
 *  The shared body (reverse + settle the draft the high-stakes branch leaves) lives in
 *  x42-adv-world.mjs so the sibling reversal battery cannot drift from it. */
const reverseAndSettleTo = async (sub, args) =>
  (await reverseAndSettle(sub, { ...args, opKey: opk("x42brev") })).mirror;

/** A bare (unproposed) credit on `code` — the shape the belt's asymmetry refuses
 *  while the code is in window. */
const bareCredit = (code, cents) => [
  { account_code: BANKV, debit_cents: cents, credit_cents: 0, description: "cash in" },
  { account_code: code, debit_cents: 0, credit_cents: cents, description: "advance reduced, unproposed" },
];

// ===========================================================================
// x42v.b — THE BELT (WDB-G5: debits soft-birth, bare credits refuse).
// ===========================================================================

test("x42v.b1 the belt's asymmetry: a bare credit on an enrolled code refuses CLR40 advance_application_missing, while the SAME movement booked through the application verb passes", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("b1");
  const { advance } = await disburse({ client, cents: 60_000, postingDate: dayIn(mon(-3), 4) });

  await refusesWith(() => approvedEntry(w.users.alice, {
    client, memo: "x42 b1 hand-typed repayment", postingDate: dayIn(mon(-2), 4),
    lines: bareCredit(ADV1, 20_000),
  }), E.belt, T.advanceApplicationMissing,
  "a hand journal crediting an enrolled advance code with no application proposal");

  // …and a PARTIALLY covered credit is refused too: coverage is to the sen.
  await refusesWith(() => bookApplication(w.users.bob, {
    client, postingDate: dayIn(mon(-2), 6),
    lines: [
      { account_code: BANKV, debit_cents: 20_000, credit_cents: 0, description: "cash in" },
      { account_code: ADV1, debit_cents: 0, credit_cents: 12_000, description: "covered" },
      { account_code: ADV1, debit_cents: 0, credit_cents: 8_000, description: "UNcovered" },
    ],
    allocations: [{ line_no: 2, advance_id: advance.id, amount_cents: 12_000 }],
    kind: "bank_return", reason: "x42 b1 partially covered",
  }), E.belt, T.advanceApplicationMissing, "an entry whose SECOND advance-credit leg carries no allocation");

  assert.equal(await outstandingAt(advance.id, today()), 60_000, "no refusal moved the register");
  const ok = await applyToAdvance(w.users.bob, {
    client, advance: advance.id, cents: 20_000, postingDate: dayIn(mon(-2), 4), counter: BANKV, kind: "bank_return",
  });
  assert.equal(ok.receipt.status, "posted", "the same movement, proposed through the audited verb, passes the belt");
  assert.equal(await outstandingAt(advance.id, today()), 40_000, "…and lands on the register");
});

test("x42v.b2 the belt's debit arm: a movement that reaches an enrolled code WITHOUT a register row refuses CLR40 advance_movement_unregistered", async (t) => {
  if (skipHere(t)) return;
  // The only lawful v1 shape that reaches an enrolled code with a debit while
  // soft-birth is switched OFF is the Wave-B opening carry-down: §3.3 arm (3) is
  // gated `NOT is_opening_balance`, so the K5 approval presents the belt with an
  // in-window debit that owns no staff_advances row. (Enrolment happens first, while
  // the code's approved balance is still zero, exactly as enrol-clean-only demands.)
  const k = await openingBalanceAdvanceClient("b2");
  await refusesWith(k.approve, E.belt, T.advanceMovementUnregistered,
    "approving an opening-balance seed whose debit lands on an enrolled advance code");
  assert.equal((await advanceRows(k.client)).length, 0, "…and no register row was born");
  assert.equal(await glNet(k.client, k.code), 0, "…and the opening balance never reached the GL");
});

test("x42v.b3 the watermark boundary pair: movements approved BEFORE enrolment and AFTER retirement pass the belt untouched; the same shape inside the window is enforced", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("b3", { enrol: false });

  // (a) BEFORE enrolled_at — a bare credit on a not-yet-enrolled code is ordinary
  // bookkeeping. A matching debit keeps the code's balance at zero so enrol-clean-only
  // still admits it afterwards.
  await approvedEntry(w.users.alice, {
    client, memo: "x42 b3 pre-enrolment float out", postingDate: dayIn(mon(-6), 5),
    lines: [
      { account_code: ADV1, debit_cents: 70_000, credit_cents: 0, description: "legacy float" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 70_000, description: "from bank" },
    ],
  });
  const preCredit = await approvedEntry(w.users.alice, {
    client, memo: "x42 b3 pre-enrolment float back", postingDate: dayIn(mon(-5), 5),
    lines: bareCredit(ADV1, 70_000),
  });
  assert.ok(preCredit, "a bare credit approved BEFORE the enrolment exists passes the belt (out of window)");
  assert.equal(await glNet(client, ADV1), 0, "…and it leaves the code at zero, so enrolment is still admissible");
  assert.equal((await advanceRows(client)).length, 0, "…while the pre-watermark debit birthed no register row");

  const enrolment = await enrolHere(w.users.alice, { client });

  // (b) INSIDE the window — the identical shape is now enforced.
  const { advance } = await disburse({ client, cents: 40_000, postingDate: dayIn(mon(-3), 5) });
  await refusesWith(() => approvedEntry(w.users.alice, {
    client, memo: "x42 b3 in-window bare credit", postingDate: dayIn(mon(-2), 5),
    lines: bareCredit(ADV1, 10_000),
  }), E.belt, T.advanceApplicationMissing, "the SAME bare credit approved while the code is enrolled");

  // (c) AFTER retired_at — the window closes and the belt lets go again.
  await applyToAdvance(w.users.bob, {
    client, advance: advance.id, cents: 40_000, postingDate: dayIn(mon(-2), 8), counter: BANKV, kind: "bank_return",
  });
  await retireAdvance(w.users.hana, { client, enrolment, reason: "x42 b3 staff left" });
  const postCredit = await approvedEntry(w.users.alice, {
    client, memo: "x42 b3 post-retirement movement", postingDate: dayIn(mon(-1), 5),
    lines: bareCredit(ADV1, 5_000),
  });
  assert.ok(postCredit, "a bare credit approved AFTER retirement passes the belt (out of window)");
  assert.equal((await applicationRows(client)).filter((r) => r.entry_id === postCredit).length, 0,
    "…and mints no application row — a repurposed code is ordinary bookkeeping again");
});

// ===========================================================================
// x42v.c — THE TEMPORAL CAP (design §3.3 arm (2); the WDB round-5 fold).
// ===========================================================================

test("x42v.c1 the cap holds at EVERY boundary ≥ the application's own effective date: a backdated application that fits on its own date but breaks a LATER one refuses CLR39 advance_over_application", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("c1");
  const m = mon(-2);
  const a = (await disburse({ client, cents: 100_000, postingDate: dayIn(mon(-3), 1) })).advance;
  await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 40_000, postingDate: dayIn(m, 10) });

  // At day 5 the advance stood at 100,000, so 70,000 "fits at its own effective date"
  // — the naive check. At the day-10 boundary it would drive outstanding to −10,000.
  assert.equal(await outstandingAt(a.id, dayIn(m, 5)), 100_000, "mandatory setup: outstanding at day 5 is the full advance");
  assert.equal(await outstandingAt(a.id, dayIn(m, 10)), 60_000, "…and 60,000 at day 10, after the first application");
  await refusesWith(() => applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 70_000, postingDate: dayIn(m, 5),
  }), E.adv, T.advanceOverApplication,
  "a backdated 70,000 application that fits on day 5 but drives the day-10 boundary negative");
  assert.equal(await outstandingAt(a.id, today()), 60_000, "…and the register is untouched");

  // The positive control: the largest backdated amount the running minimum admits.
  const ok = await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 60_000, postingDate: dayIn(m, 5) });
  assert.equal(ok.receipt.status, "posted", "…while exactly the running-minimum amount is admitted");
  assert.equal(await outstandingAt(a.id, dayIn(m, 10)), 0, "…closing the advance at the day-10 boundary");
});

test("x42v.c2 the cap survives a LATER correction: a backdated application is measured against the running minimum, not against the current net", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("c2");
  const m = mon(-2);
  const a = (await disburse({ client, cents: 100_000, postingDate: dayIn(mon(-3), 1) })).advance;
  await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 40_000, postingDate: dayIn(m, 10) });
  const second = await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 30_000, postingDate: dayIn(m, 20) });
  await reverseAndSettleTo(w.users.bob, { entry: second.entryId, reason: "x42 c2 the day-20 recovery never happened" });

  // The curve now RISES again at the correction's date: 60,000 at day 10, 30,000 at
  // day 20, back to 60,000 today. A current-net check would admit 50,000; the
  // boundary law must not.
  assert.equal(await outstandingAt(a.id, dayIn(m, 10)), 60_000, "mandatory setup: 60,000 at day 10");
  assert.equal(await outstandingAt(a.id, dayIn(m, 20)), 30_000, "…30,000 at day 20 (the original persists at its own date)");
  assert.equal(await outstandingAt(a.id, today()), 60_000, "…and 60,000 today, once the correction takes effect");

  await refusesWith(() => applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 50_000, postingDate: dayIn(m, 5),
  }), E.adv, T.advanceOverApplication,
  "a backdated 50,000 application that the CURRENT net would admit but the day-20 minimum refuses");
  const ok = await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 30_000, postingDate: dayIn(m, 5) });
  assert.equal(ok.receipt.status, "posted", "…while exactly the day-20 minimum is admitted");
  assert.equal(await outstandingAt(a.id, dayIn(m, 20)), 0, "…driving that historical boundary to exactly zero, never below");
});

// ===========================================================================
// x42v.d — HOOK-BORN CORRECTIONS + THE TWO REVERSAL DOORS.
// ===========================================================================

test("x42v.d1 reversing an application entry births ONE correction per ORIGINAL row, at the uncorrected remainder, dated at the MIRROR's posting date and pointing back at the original", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("d1");
  await enrolHere(w.users.alice, { client, code: ADV2, personLabel: "B. Rig" });
  const a = (await disburse({ client, cents: 90_000, postingDate: dayIn(mon(-4), 2) })).advance;
  const b = (await disburse({ client, cents: 60_000, postingDate: dayIn(mon(-4), 3), account: ADV2 })).advance;

  // ONE entry, TWO advance-credit legs on two different enrolled codes → two originals.
  const receipt = await bookApplication(w.users.bob, {
    client, postingDate: dayIn(mon(-3), 6), memo: "x42 d1 combined recovery",
    lines: [
      { account_code: BANKV, debit_cents: 75_000, credit_cents: 0, description: "cash in" },
      { account_code: ADV1, debit_cents: 0, credit_cents: 45_000, description: "A repaid" },
      { account_code: ADV2, debit_cents: 0, credit_cents: 30_000, description: "B repaid" },
    ],
    allocations: [
      { line_no: 2, advance_id: a.id, amount_cents: 45_000 },
      { line_no: 3, advance_id: b.id, amount_cents: 30_000 },
    ],
    kind: "bank_return", reason: "x42 d1 combined",
  });
  const entry = idOf(receipt, "entry_id", "id");
  const originals = (await applicationRows(client)).filter((r) => r.entry_id === entry);
  assert.equal(originals.length, 2, "mandatory setup: two original application rows, one per allocated leg");

  const mirror = await reverseAndSettleTo(w.users.bob, { entry, reason: "x42 d1 the bank return bounced" });
  const mirrorDate = (await entryRowOf(mirror)).posting_date;
  const corrections = (await applicationRows(client)).filter((r) => r.entry_id === mirror);
  assert.equal(corrections.length, 2, "the mirror births ONE correction per original row (design §3.3 arm (1))");

  for (const orig of originals) {
    const c = corrections.find((x) => x.reverses_application_id === orig.id);
    assert.ok(c, `a correction points back at original ${orig.id} (advance ${orig.advance_id})`);
    assert.equal(c.kind, "correction", "…stamped kind 'correction' (hook-born only — the proposal verb never accepts it)");
    assert.equal(Number(c.amount_cents), Number(orig.amount_cents),
      "…at the UNCORRECTED REMAINDER, which with no prior correction is the original in full");
    assert.equal(c.effective_date, mirrorDate,
      "…dated at the MIRROR's posting_date (the unwind happens when the reversal happens, never retroactively)");
    assert.equal(c.advance_id, orig.advance_id, "…against the original's own advance");
    assert.equal(c.enrolment_id, orig.enrolment_id, "…and its enrolment generation");
  }
  assert.equal(await outstandingAt(a.id, mirrorDate), 90_000, "advance A is fully restored at the correction's date");
  assert.equal(await outstandingAt(b.id, mirrorDate), 60_000, "…and so is advance B");
  assert.equal(await outstandingAt(a.id, dayIn(mon(-3), 6)), 45_000,
    "…while the ORIGINAL still stands at its own date — history is not rewritten (design §3.2)");
});

test("x42v.d2 corrections are LEAVES: every correction names a NON-correction original, cumulative corrections never exceed it, and the correction-carrying mirror is itself irreversible (CLR39 correction_entry_irreversible)", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("d2");
  const a = (await disburse({ client, cents: 70_000, postingDate: dayIn(mon(-4), 2) })).advance;
  const app = await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 25_000, postingDate: dayIn(mon(-3), 4) });
  const mirror = await reverseAndSettleTo(w.users.bob, { entry: app.entryId, reason: "x42 d2 unwind" });

  // The census: correction-of-correction is structurally excluded, and the cumulative
  // cap holds. (v1 offers NO lawful path to a partial prior correction — corrections
  // are hook-born at the full remainder and the carrying entry is irreversible — so
  // the remainder arithmetic is exercised at Σprior = 0 and pinned by this census.)
  const rows = await applicationRowsOf(a.id);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const corrected = new Map();
  for (const r of rows) {
    if (r.kind !== "correction") continue;
    const target = byId.get(r.reverses_application_id);
    assert.ok(target, `correction ${r.id} names an application row on the same advance`);
    assert.notEqual(target.kind, "correction",
      "a correction may only reverse a NON-correction row (no correction-of-correction, design §3.2)");
    corrected.set(target.id, (corrected.get(target.id) ?? 0) + Number(r.amount_cents));
  }
  assert.equal(corrected.size, 1, "…and this reversal produced exactly one corrected original");
  for (const [id, sum] of corrected) {
    assert.ok(sum <= Number(byId.get(id).amount_cents),
      `cumulative corrections (${sum}) never exceed the original (${byId.get(id).amount_cents}) — original ${id}`);
  }

  // [INTEGRATION ADJUDICATION — test_defect] This arm demanded CLR39
  // `correction_entry_irreversible` (ABI §F) and the build answers the 0003-era CLR10 "cannot
  // reverse a reversal". The SUBJECT — the correction-carrying mirror is irreversible — holds
  // exactly; only the instrument was mis-guessed, and it was mis-guessed for a STRUCTURAL
  // reason worth writing down rather than papering over.
  //
  // Corrections are HOOK-BORN ONLY (design §3.2, part2 round-2 ruling 5) and the hook mints
  // them onto the REVERSAL MIRROR. `reverse_entry` tests `reversal_of is not null` long before
  // it reaches `_wdb_reversal_blocked`, so every entry that can ever carry a correction is
  // already caught by the older, broader guard: §F's `correction_entry_irreversible` is
  // defence-in-depth, not the live instrument — a fact the build's own S3.0 header states
  // ("every correction lives on such an entry today"). The arm is therefore kept in the build
  // (tail 3(2) pins it) and this cell asserts the REFUSAL plus the guard that actually fires;
  // the vacuity is reported for the ladder, in the shape [L2/6] used for the K-boundary.
  const rr = await refusesNamed(() => reverseEntry(w.users.bob, {
    entry: mirror, reason: "x42 d2 reverse the reversal", opKey: opk("x42d2rr"),
  }), "reversing the correction-carrying mirror (the remedy is an offsetting application, not a second unwind)",
  { codes: [E.adv, E.badRequest] });
  assert.match(String(rr.message), /reverse a reversal|correction/i,
    `…and it says WHY, in words a professional can act on (got ${rr.message})`);
  assert.equal((await applicationRowsOf(a.id)).length, rows.length, "…and no further row was minted");
  assert.equal(await outstandingAt(a.id, today()), 70_000, "…the advance stands fully restored");
});

test("x42v.d3 the disbursement door: reverse_entry refuses CLR39 advance_applications_outstanding while net applications ≠ 0, and at net 0 it voids the advance with the mirror's own date", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("d3");
  const issue = dayIn(mon(-3), 5);
  const { entry, advance } = await disburse({ client, cents: 80_000, postingDate: issue });
  const app = await applyToAdvance(w.users.bob, { client, advance: advance.id, cents: 30_000, postingDate: dayIn(mon(-2), 5) });

  await refusesWith(() => reverseEntry(w.users.alice, {
    entry, reason: "x42 d3 void the float", opKey: opk("x42d3a"),
  }), E.adv, T.advanceApplicationsOutstanding,
  "reversing a disbursement while 30,000 of applications still stand against it");
  assert.equal((await advanceRow(advance.id)).voided_by_entry_id, null, "…and nothing was voided");

  // Unwind the application first: the correction takes net applications back to zero.
  await reverseAndSettleTo(w.users.bob, { entry: app.entryId, reason: "x42 d3 the recovery never happened" });
  const net = (await applicationRowsOf(advance.id))
    .reduce((n, r) => n + (r.kind === "correction" ? -Number(r.amount_cents) : Number(r.amount_cents)), 0);
  assert.equal(net, 0, "mandatory setup: net applications against the advance are exactly zero");

  const voidMirror = await reverseAndSettleTo(w.users.alice, { entry, reason: "x42 d3 void the float" });
  const row = await advanceRow(advance.id);
  assert.equal(row.voided_by_entry_id, voidMirror, "the void stamp names the reversal mirror (set-once, hook-only)");
  assert.equal(row.void_effective_date, (await entryRowOf(voidMirror)).posting_date,
    "…and void_effective_date is the MIRROR's posting_date, never the original issue date");
  assert.equal(Number(row.amount_cents), 80_000, "…while the register row itself is untouched (append-only)");
  assert.equal(await outstandingAt(advance.id, row.void_effective_date), 0, "the advance carries nothing from the void date on");
  assert.equal(await outstandingAt(advance.id, dayIn(mon(-2), 28)), 50_000,
    "…and still carried its historical remainder before it");
});

test("x42v.d4 the as-of equation (design §3.2): originals persist at every later as-of, the issue-date gate and the void gate are both strict, and the read surface agrees with the rebuilt arithmetic", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("d4");
  const issue = dayIn(mon(-3), 5);
  const { entry, advance } = await disburse({ client, cents: 80_000, postingDate: issue });
  const applied = dayIn(mon(-2), 5);
  const app = await applyToAdvance(w.users.bob, { client, advance: advance.id, cents: 30_000, postingDate: applied });
  const correctionMirror = await reverseAndSettleTo(w.users.bob, { entry: app.entryId, reason: "x42 d4 unwind" });
  const correctionDate = (await entryRowOf(correctionMirror)).posting_date;

  const expectations = [
    [dayIn(mon(-4), 28), 0, "before the issue date the advance does not exist yet (the issue_date ≤ as_of gate)"],
    [issue, 80_000, "on the issue date it stands in full"],
    [dayIn(mon(-2), 4), 80_000, "the day BEFORE the application it is still whole"],
    [applied, 50_000, "on the application's own effective date it drops"],
    [dayIn(mon(-1), 15), 50_000, "…and a historical as-of BETWEEN the original and its correction still sees the original"],
  ];
  for (const [asOf, want, why] of expectations) {
    assert.equal(await outstandingAt(advance.id, asOf), want, `${why} (as-of ${asOf})`);
    const rows = rowsBy(await advanceSummary(w.users.alice, client, asOf), "advance_id", `staff_advance_summary at ${asOf}`);
    const mine = rows.find((r) => r.advance_id === advance.id);
    if (want === 0 && !mine) {
      noteLane(`x42v.d4 the summary omits the not-yet-issued advance at ${asOf} rather than showing it at zero — recorded`);
      continue;
    }
    assert.ok(mine, `staff_advance_summary projects the advance at ${asOf}`);
    assert.equal(numOf(mine, /^outstanding_cents$/, `the summary row at ${asOf}`), want,
      `…and the DB's own outstanding agrees with the rebuilt equation at ${asOf} (${why})`);
  }
  assert.equal(await outstandingAt(advance.id, correctionDate), 80_000,
    "the correction restores it in full at the reversal's own date — the unwind is dated where the act happened");

  // The void gate is strict on the same axis.
  const voidMirror = await reverseAndSettleTo(w.users.alice, { entry, reason: "x42 d4 void the float" });
  const voidDate = (await entryRowOf(voidMirror)).posting_date;
  assert.equal(await outstandingAt(advance.id, voidDate), 0, "from void_effective_date on, the advance carries nothing");
  assert.equal(await outstandingAt(advance.id, applied), 50_000, "…and every historical as-of before it is unchanged");
  const line = (await entryLinesOf(voidMirror)).find((l) => l.account_code === ADV1);
  assert.ok(Number(line.credit_cents) === 80_000,
    `mandatory cross-check: the void mirror credits the enrolled code for the full advance (got ${JSON.stringify(line)})`);
  assert.equal(await glNet(client, ADV1, voidDate), 0, "…so the GL and the register unwind together, to the sen");
  const voided = rowsBy(await advanceSummary(w.users.alice, client, today()), "advance_id", "staff_advance_summary after the void")
    .find((r) => r.advance_id === advance.id);
  assert.ok(voided, "the voided advance is still VISIBLE on the summary (reverse-not-delete)");
  assert.equal(voided.voided, true, "…flagged voided");
  assert.equal(numOf(voided, /^outstanding_cents$/, "the voided summary row"), 0, "…at zero outstanding");
});
