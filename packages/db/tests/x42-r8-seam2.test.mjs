// ---------------------------------------------------------------------------
// x42.r8s (2 of 2) — THE BANK × ADVANCE SEAM: F2's four-wall drift alarm and
// F3's interim refusal (as-built ladder round 8, fix lane M3).
//
// F2 — THE DEFECT. clara._wdb_line_booking_block predicted clara.reverse_entry's
// admissibility from a pre-flight that modelled TWO of the FOUR advance-side
// walls (the net-applications wall and the correction-carrying wall). The other
// two — the enrolment window and the date ordering — lived inside
// clara._adv_on_approve's arms and nothing outside the hook could ask about
// them, so a booking on a RETIRED enrolment reported `reverse_blocked_by: null`
// with `remedy_calls:[clara.reverse_entry]` and that very call refused CLR40.
// FIX: all four live in clara._adv_reversal_admission — the hook ENFORCES it,
// the report READS it. w1 is the alarm: it enumerates all four wall states and
// asserts the report's verdict equals the verb's, in every one.
//
// F3 — INTERIM ONLY. A high-stakes advance repayment on an excepted line has no
// v1 door, and the refusal named a three-step remedy measured refused at every
// step (including step 0: the draft it told the human to approve is destroyed by
// the raise itself). The refusal now states the truth and names only a door it
// MEASURES. The composition door itself is an owner decision — f1's assertion
// that the old chain is still refused is the cell that changes the day one ships.
//
// Sibling file: x42-r8-seam.test.mjs (F1, the ack door and the release statement).
// ---------------------------------------------------------------------------

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { opk, endPool, noteLane, printLaneNotes, printSkipCount, reasonOf } from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, caught,
  BANKCOA, ADVCODE, REVN, CLR10, T,
  af2World, freshAf2Client, bankLine,
  openException, plainAt, unmatchBankMatch, matchBankLine,
  enrolStaffAdvanceAccount, matchIdOf, advanceRowsOf, advanceApplicationRowsOf,
  getBankReconciliation, rootQuery, reverseEntry, approveEntry,
} from "./x42-af2-world.mjs";
import {
  axisOf, block, outAt, openExceptionOf, revisionOf, activeEnrolmentOf,
  resolveAndBookAck, bookStaffAdvanceApplication, resolveBankLineExceptionDirect,
  retireStaffAdvanceAccount, pastBankLine, repaymentDraft, application,
} from "./x42-r8-seam-kit.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) { noteLane("bank substrate absent"); return; }
  world = await af2World();
});
after(async () => { printLaneNotes("x42.r8s"); printSkipCount("x42.r8s"); await endPool(); });

// ---------------------------------------------------------------------------
// F2 — THE FOUR-WALL DRIFT ALARM
// ---------------------------------------------------------------------------

/** (1) VOIDABLE — nothing stands in the way of the reversal. */
async function stateVoidable(sub) {
  const client = await freshAf2Client("r8sw1a");
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R8S W1a" });
  const CENTS = 5_000;
  const { line, period } = await pastBankLine(sub, { client, amountCents: CENTS, description: "x42.r8s w1a" });
  await plainAt(sub, { client, debit: ADVCODE, credit: BANKCOA, cents: CENTS, postingDate: period.mid, memo: "w1a advance" });
  const advance = (await advanceRowsOf(client))[0].id;
  const ex = await openException(sub, { client, line: line.id, reason: "x42.r8s w1a" });
  const r = await resolveAndBookAck(sub, {
    client, exception: ex, note: "w1a booking", draft: repaymentDraft(period.mid, CENTS, "w1a"),
    advanceApplications: application(advance, CENTS), opKey: opk("r8sw1a"),
  });
  await unmatchBankMatch(sub, { client, match: matchIdOf(r), reason: "w1a release" });
  return { state: "voidable", line: line.id };
}

/** (2) BALANCE-WALLED — the booking under release is the DISBURSEMENT itself,
 *  and its advance still carries a live repayment (net applications <> 0). */
async function stateBalanceWalled(sub) {
  const client = await freshAf2Client("r8sw1b");
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R8S W1b" });
  const CENTS = 6_000;
  const { line, period } = await pastBankLine(sub, { client, amountCents: -CENTS, description: "x42.r8s w1b out" });
  const ex = await openException(sub, { client, line: line.id, reason: "x42.r8s w1b" });
  const r = await resolveAndBookAck(sub, {
    client, exception: ex, note: "w1b disbursement booking",
    draft: {
      posting_date: period.mid, memo: "w1b advance paid out",
      lines: [
        { account_code: ADVCODE, debit_cents: CENTS, credit_cents: 0, description: "advance out" },
        { account_code: BANKCOA, debit_cents: 0, credit_cents: CENTS, description: "from the bank" },
      ],
    },
    opKey: opk("r8sw1b"),
  });
  const advance = (await advanceRowsOf(client))[0].id;
  // A partial repayment lands elsewhere, against that advance.
  await bookStaffAdvanceApplication(sub, {
    client, postingDate: period.mid, memo: "w1b partial repayment",
    lines: [
      { account_code: BANKCOA, debit_cents: 1_000, credit_cents: 0, description: "cash in" },
      { account_code: ADVCODE, debit_cents: 0, credit_cents: 1_000, description: "advance part-cleared" },
    ],
    allocations: [{ line_no: 2, advance_id: advance, amount_cents: 1_000 }],
    kind: "payroll_deduction", reason: "w1b", opKey: opk("r8sw1b-app"),
  });
  await unmatchBankMatch(sub, { client, match: matchIdOf(r), reason: "w1b release" });
  return { state: "balance-walled", line: line.id };
}

/** (3) ENROLMENT-CLOSED — the enrolment is retired after the booking (lawful:
 *  the register is at zero outstanding when it is retired). */
async function stateEnrolmentClosed(sub) {
  const client = await freshAf2Client("r8sw1c");
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R8S W1c" });
  const CENTS = 7_000;
  const { line, period } = await pastBankLine(sub, { client, amountCents: CENTS, description: "x42.r8s w1c" });
  await plainAt(sub, { client, debit: ADVCODE, credit: BANKCOA, cents: CENTS, postingDate: period.mid, memo: "w1c advance" });
  const advance = (await advanceRowsOf(client))[0].id;
  const ex = await openException(sub, { client, line: line.id, reason: "x42.r8s w1c" });
  const r = await resolveAndBookAck(sub, {
    client, exception: ex, note: "w1c booking", draft: repaymentDraft(period.mid, CENTS, "w1c"),
    advanceApplications: application(advance, CENTS), opKey: opk("r8sw1c"),
  });
  await retireStaffAdvanceAccount(world.users.hana, {
    client, enrolment: await activeEnrolmentOf(client), reason: "w1c settled", opKey: opk("r8sw1c-ret"),
  });
  await unmatchBankMatch(sub, { client, match: matchIdOf(r), reason: "w1c release" });
  return { state: "enrolment-closed", line: line.id };
}

/** (4) DATE-DISORDERED — the booking is dated in the FUTURE, so a mirror
 *  stamped at MYT-today would unwind a movement that has not happened. The
 *  shared `bankLine` helper's 2035 periods are exactly this shape. */
async function stateDateDisordered(sub) {
  const client = await freshAf2Client("r8sw1d");
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R8S W1d" });
  const CENTS = 8_000;
  const { line, period } = await bankLine(sub, { client, amountCents: CENTS, description: "x42.r8s w1d future" });
  await plainAt(sub, { client, debit: ADVCODE, credit: BANKCOA, cents: CENTS, postingDate: period.mid, memo: "w1d advance" });
  const advance = (await advanceRowsOf(client))[0].id;
  const ex = await openException(sub, { client, line: line.id, reason: "x42.r8s w1d" });
  const r = await resolveAndBookAck(sub, {
    client, exception: ex, note: "w1d booking", draft: repaymentDraft(period.mid, CENTS, "w1d"),
    advanceApplications: application(advance, CENTS), opKey: opk("r8sw1d"),
  });
  await unmatchBankMatch(sub, { client, match: matchIdOf(r), reason: "w1d release" });
  return { state: "date-disordered", line: line.id };
}

test("x42.r8s-w1 the release report's reverse_blocked_by matches clara.reverse_entry's ACTUAL verdict in all four advance wall states", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  // Each state gets its own client, so one wall cannot mask another.
  const states = [
    await stateVoidable(sub), await stateBalanceWalled(sub),
    await stateEnrolmentClosed(sub), await stateDateDisordered(sub),
  ];

  const seen = [];
  for (const st of states) {
    const b = await block(st.line);
    assert.ok(b, `${st.state}: the release produced a report`);
    const row = (b.bookings ?? [])[0];
    assert.ok(row, `${st.state}: the report names the booking`);
    const predicted = row.reverse_blocked_by;
    const calls = row.remedy_calls ?? [];
    const err = await caught(() => reverseEntry(sub, {
      entry: row.entry_id, reason: `x42.r8s w1 ${st.state}`, opKey: opk(`r8sw1x${seen.length}`),
    }));
    const actual = err ? reasonOf(err) : null;
    seen.push({ state: st.state, predicted, actual });
    assert.equal(predicted, actual,
      `${st.state}: the report predicted reverse_blocked_by='${predicted ?? "null"}' and clara.reverse_entry answered '${actual ?? "(admitted)"}' — ${err?.message ?? ""}`);
    // …and the REMEDY tracks the verdict: a refused reversal offers no button.
    if (actual === null) {
      assert.ok(calls.some((c) => c.fn === "clara.reverse_entry"),
        `${st.state}: an admitted reversal must be offered`);
    } else {
      assert.equal(calls.length, 0,
        `${st.state}: a refused reversal must offer NO remedy_calls (got ${JSON.stringify(calls)})`);
    }
  }
  noteLane(`x42.r8s-w1 four wall states: ${seen.map((x) => `${x.state}=${x.actual ?? "admitted"}`).join(", ")}`);
  // The four states really are four DIFFERENT answers — a cell where three
  // collapsed onto one token would pass while proving nothing.
  assert.equal(new Set(seen.map((x) => String(x.actual))).size, 4,
    `the four wall states must give four distinct verdicts; got ${JSON.stringify(seen)}`);
});

test("x42.r8s-w2 the two MIRROR-DATED walls carry their own envelope on the row, and the two CARRIED walls do not — the report says which moment refused", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const closed = await stateEnrolmentClosed(sub);
  const walled = await stateBalanceWalled(sub);

  const rowClosed = ((await block(closed.line)).bookings ?? [])[0];
  assert.equal(rowClosed.reverse_blocked_by, "advance_movement_unregistered",
    "a retired enrolment blocks by its own token");
  assert.ok(rowClosed.advance_reversal, "…and the row carries the mirror-dated wall's own envelope");
  assert.equal(rowClosed.advance_reversal.axis, "enrolment_closed", "…named by axis");
  assert.equal(rowClosed.advance_reversal.detail.remedy, "re_enrol",
    "…with the remedy the enrolment door itself composes");
  assert.equal(rowClosed.advance_reversal.detail.reenrolment_admitted, true,
    "…and a MEASURED statement about whether that remedy is executable at all");

  const rowWalled = ((await block(walled.line)).bookings ?? [])[0];
  assert.equal(rowWalled.reverse_blocked_by, "advance_applications_outstanding",
    "a live repayment blocks the disbursement's reversal");
  assert.equal(rowWalled.advance_reversal, null,
    "…and that wall is NOT mirror-dated, so it carries no mirror envelope: it is raised by clara.reverse_entry itself");
});

// ---------------------------------------------------------------------------
// F3 — THE INTERIM REFUSAL
// ---------------------------------------------------------------------------

test("x42.r8s-f1 the high-stakes advance refusal names ONE door, that door is measured admitted, and it works end to end — while the old three-step chain is asserted refused at every step", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("r8sf1");
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R8S High" });
  const CENTS = 1_500_000; // RM15,000 — above the RM10,000 default high-stakes floor
  const { line, period, statement } = await pastBankLine(sub, { client, amountCents: CENTS, description: "x42.r8s f1 large repayment" });
  await plainAt(sub, {
    client, debit: ADVCODE, credit: BANKCOA, cents: CENTS, postingDate: period.mid,
    memo: "x42.r8s f1 big advance", checker: world.users.bob,
  });
  const advance = (await advanceRowsOf(client))[0].id;
  const ex = await openException(sub, { client, line: line.id, reason: "x42.r8s f1 unidentified large inbound" });
  const lines = repaymentDraft(period.mid, CENTS, "x42.r8s f1").lines;

  const refusal = await caught(() => resolveAndBookAck(sub, {
    client, exception: ex, note: "x42.r8s f1 high-stakes repayment",
    draft: repaymentDraft(period.mid, CENTS, "x42.r8s f1 draft that must not survive"),
    advanceApplications: application(advance, CENTS), attestation: "x42.r8s attested",
    opKey: opk("r8sf1-a"),
  }));
  assert.ok(refusal, "a high-stakes advance-carrying hand-draft is refused");
  assert.equal(refusal.code, CLR10, `…as CLR10 (got ${refusal.code})`);
  assert.equal(reasonOf(refusal), T.pendingAncillary, `…on the park token (got '${reasonOf(refusal)}')`);
  assert.equal(axisOf(refusal), "draft", "…axis draft");
  const d = JSON.parse(refusal.detail);
  assert.equal(d.draft_rolled_back, true, "the refusal says the draft did not survive");
  assert.equal(d.advance_payload, true, "…and that this booking carried an advance payload");
  assert.equal(d.register_door_admits, true,
    "…and that the register door was MEASURED to admit this payload before being named");
  assert.equal(d.owner_decision_pending, true, "…and that the composition door is an owner decision");
  assert.equal(d.remedy, "book_staff_advance_application", "…and names exactly that door");
  assert.equal(d.entry_id, undefined,
    "…and names NO entry: the one it used to name is destroyed by this very raise");
  assert.equal(
    Number((await rootQuery(
      "select count(*)::int as n from clara.journal_entries where client_id=$1 and memo = $2",
      [client, "x42.r8s f1 draft that must not survive"])).rows[0].n),
    0, "…measured: no draft from this act survives anywhere, in ANY status");
  assert.doesNotMatch(refusal.message, /resolve_bank_line_exception/,
    "the refusal must NOT name the exception verb — measured refused in this state");
  assert.doesNotMatch(refusal.message, /match_bank_line/,
    "…nor the match verb — measured refused in this state");

  // ---- THE NAMED PATH, RUN. It drafts (high-stakes) and a distinct checker
  //      approves it through /queue; the register then reads right to the cent.
  const receipt = await bookStaffAdvanceApplication(sub, {
    client, postingDate: period.mid, memo: "x42.r8s f1 repayment via the register door",
    lines, allocations: [{ line_no: 2, advance_id: advance, amount_cents: CENTS }],
    reason: "x42.r8s f1 repayment", opKey: opk("r8sf1-reg"),
  });
  assert.equal(receipt.status, "drafted", "at this amount the register door parks a draft for a checker");
  assert.equal(Number(receipt.allocated_cents), CENTS, "…carrying the whole 1,500,000, to the cent");
  const rev = await revisionOf(receipt.entry_id);
  const apErr = await caught(() => approveEntry(world.users.bob, {
    entry: receipt.entry_id, expectedRevision: rev, opKey: opk("r8sf1-ap"),
  }));
  assert.equal(apErr, null, `the /queue approval must land; got ${JSON.stringify(apErr)}`);
  assert.equal(await outAt(advance, period.end), 0,
    "the register is right: the debt is discharged at the date the money moved");
  const apps = await advanceApplicationRowsOf(client);
  assert.equal(apps.length, 1, "exactly one application row was minted");
  assert.equal(Number(apps[0].amount_cents), CENTS, "…at 1,500,000 to the cent");

  // ---- WHAT THE REFUSAL SAYS ABOUT THE LINE, MEASURED.
  const recon = await getBankReconciliation(sub, { statement });
  assert.equal(Number(recon.difference_cents), 0, "the reconciliation is still honest: difference EXACTLY 0");
  assert.equal(Number(recon.excepted_cents), CENTS,
    "…with the line itemised under excepted_cents, to the cent, exactly as the refusal says");
  assert.equal(recon.can_complete, true, "…and the month can still complete");

  // ---- THE REFUSED CHAIN IS ASSERTED REFUSED. The day an owner builds the
  //      composition door, THIS is the assertion that changes.
  const rex = await openExceptionOf(line.id);
  for (const disp of ["matched_booking", "written_off_adjustment"]) {
    const rr = await caught(() => resolveBankLineExceptionDirect(sub, {
      exception: rex, disposition: disp, note: `x42.r8s f1 ${disp}`, opKey: opk(`r8sf1-r-${disp}`),
    }));
    assert.ok(rr, `resolve_bank_line_exception(${disp}) is still refused on an unbooked line`);
    assert.equal(reasonOf(rr), T.dispositionUnbooked,
      `…by the settled-authority belt (got '${reasonOf(rr) ?? "(none)"}' — ${rr.message})`);
  }
  const mm = await caught(() => matchBankLine(sub, {
    client, lines: [{ line_id: line.id, matched_cents: CENTS }],
    entries: [{ entry_id: receipt.entry_id, matched_cents: CENTS }],
    ackPeriodExceptions: false, opKey: opk("r8sf1-m"),
  }));
  assert.ok(mm, "match_bank_line is still refused while the exception is open");
  assert.equal(reasonOf(mm), T.lineExcepted, `…as line_excepted (got '${reasonOf(mm) ?? "(none)"}')`);
});

test("x42.r8s-f2 the PLAIN high-stakes hand-draft refusal names no refused chain either, and reports no register verdict it never asked for", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("r8sf2");
  const CENTS = 1_500_000;
  const { line, period } = await pastBankLine(sub, { client, amountCents: CENTS, description: "x42.r8s f2 large inbound" });
  const ex = await openException(sub, { client, line: line.id, reason: "x42.r8s f2" });
  const refusal = await caught(() => resolveAndBookAck(sub, {
    client, exception: ex, note: "x42.r8s f2 plain high-stakes",
    draft: {
      posting_date: period.mid, memo: "x42.r8s f2 plain",
      lines: [
        { account_code: BANKCOA, debit_cents: CENTS, credit_cents: 0, description: "into the bank" },
        { account_code: REVN, debit_cents: 0, credit_cents: CENTS, description: "misc income" },
      ],
    },
    attestation: "x42.r8s attested", opKey: opk("r8sf2"),
  }));
  assert.ok(refusal, "a plain high-stakes hand-draft is refused too");
  assert.equal(reasonOf(refusal), T.pendingAncillary, "…on the same token");
  const d = JSON.parse(refusal.detail);
  assert.equal(d.advance_payload, false, "…and says this booking carried no advance payload");
  assert.equal(d.register_door_admits, null,
    "…so it reports NO verdict about the register door: it never asked, and it does not pretend to have");
  assert.equal(d.remedy, "settlement_leg_or_none", "…and points at the leg that CAN park, or at nothing");
  assert.equal(d.draft_rolled_back, true, "…and admits the draft is gone");
  assert.doesNotMatch(refusal.message, /resolve_bank_line_exception/, "no refused chain is named");
  assert.doesNotMatch(refusal.message, /book_staff_advance_application/,
    "…and no advance door is named on a booking that has no advance in it");
});
