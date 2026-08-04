// ---------------------------------------------------------------------------
// x42.r8s (1 of 2) — THE BANK × ADVANCE SEAM: F1, the released advance-carrying
// booking that could never be re-booked (as-built ladder round 8, fix lane M3).
//
// THE DEFECT, MEASURED. An AF-2 booking carrying a staff-advance application was
// released through the block report's OWN named remedy (clara.reverse_entry).
// The register's correction is dated at the MIRROR — today — so the outstanding
// at the line's own date never came back and re-booking there was refused by the
// register's temporal cap (CLR39 advance_over_application); at every date the cap
// DID allow, clara.match_bank_line refused CLR10 period_exception_unacknowledged
// for a long-closed statement period, and the composite carried no argument to
// acknowledge it. Two correct laws, no door between them — while
// clara.get_bank_reconciliation went on reporting difference 0 and can_complete
// true, so nothing surfaced it.
//
// THE FIX, IN TWO SEAMS: `p_ack_period_exceptions` on the composite (the door
// clara.match_bank_line already has, same name, same grammar), and a release
// report that STATES the release is one-way at the line's own date — derived
// from the cap's own body (clara._adv_over_application), never hand-predicted.
//
// THE CONTROL (a2) is what proves this lives in the COMPOSITION rather than in
// either family: strip the advance payload out and the identical chain runs.
// Sibling file: x42-r8-seam2.test.mjs (F2's four-wall alarm, F3's interim).
// ---------------------------------------------------------------------------

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { opk, endPool, noteLane, printLaneNotes, printSkipCount, reasonOf } from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, caught,
  BANKCOA, ADVCODE, REVN, AR1, CLR10, CLR39,
  af2World, freshAf2Client, freshBankAccount, enterStatement,
  openException, plainAt, unmatchBankMatch,
  enrolStaffAdvanceAccount, matchIdOf, advanceRowsOf,
  getBankReconciliation, rootQuery, reverseEntry,
  birthCounterparty, stampedItem, uniq,
} from "./x42-af2-world.mjs";
import {
  axisOf, bankGlOf, block, outAt, mytToday, openExceptionOf, staffAdvanceTie,
  resolveAndBookAck, pastBankLine, repaymentDraft, application,
} from "./x42-r8-seam-kit.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) { noteLane("bank substrate absent"); return; }
  world = await af2World();
});
after(async () => { printLaneNotes("x42.r8s"); printSkipCount("x42.r8s"); await endPool(); });

test("x42.r8s-a1 unmatch -> reverse -> re-book through the ack door: the GL carries the line ONCE, the register is right to the cent at every date, and the reconciliation is honest at every step", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("r8sa1");
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R8S Aminah" });
  const CENTS = 30_000;
  const { line, period, statement } = await pastBankLine(sub, {
    client, amountCents: CENTS, description: "x42.r8s staff repayment in",
  });
  // The disbursement: money OUT of the bank onto the enrolled code, which the
  // approve hook soft-births into the register.
  await plainAt(sub, {
    client, debit: ADVCODE, credit: BANKCOA, cents: CENTS, postingDate: period.mid,
    memo: "x42.r8s advance to Aminah",
  });
  const advance = (await advanceRowsOf(client))[0].id;
  assert.equal(await outAt(advance, period.end), CENTS, "the register opens at 30,000 owed");
  assert.equal(await bankGlOf(client), -CENTS, "the bank GL is down 30,000 after the disbursement");

  // ---- BOOK IT: the repayment arrives, is excepted, and the composite books it.
  const ex1 = await openException(sub, { client, line: line.id, reason: "x42.r8s unidentified inbound" });
  const r1 = await resolveAndBookAck(sub, {
    client, exception: ex1, note: "x42.r8s the transfer is the returned advance",
    draft: repaymentDraft(period.mid, CENTS, "x42.r8s advance returned"),
    advanceApplications: application(advance, CENTS), opKey: opk("r8sa1-1"),
  });
  const match1 = matchIdOf(r1);
  assert.ok(match1, "the first booking made a group");
  assert.equal(await outAt(advance, period.end), 0, "the application discharged it to zero");
  assert.equal(await bankGlOf(client), 0, "the bank GL is flat: out 30,000, back 30,000");
  let recon = await getBankReconciliation(sub, { statement });
  assert.equal(Number(recon.difference_cents), 0, "reconciliation difference is EXACTLY 0 after the booking");
  assert.equal(Number(recon.excepted_cents), 0, "…and nothing is left excepted");

  // ---- RELEASE: the bookkeeper realises it was the wrong deposit.
  await unmatchBankMatch(sub, { client, match: match1, reason: "x42.r8s wrong deposit" });
  const b = await block(line.id);
  assert.equal(b?.blocking, true, "the release BLOCKS a re-book while the booking stands");
  const rel = (b.bookings ?? [])[0]?.advance_release;
  assert.ok(rel, "the release receipt carries the advance_release statement");
  assert.equal(rel.one_way_at_entry_date, true,
    "…and says the release is ONE-WAY at the line's own date (the truth, derived from the cap)");
  const today = await mytToday();
  assert.equal(rel.correction_posting_date, today,
    "…dating the correction where clara.reverse_entry will actually stamp its mirror");
  assert.equal(rel.entry_posting_date, period.mid, "…against the booking's own posting date");
  assert.equal(rel.advances.length, 1, "one advance was applied, so one row is reported");
  assert.equal(Number(rel.advances[0].applied_cents), CENTS, "…at 30,000 to the cent");
  assert.equal(Number(rel.advances[0].outstanding_cents), 0,
    "…with the cap's own reading of the outstanding at that date");
  assert.equal(Number(rel.advances[0].resulting_cents), -CENTS,
    "…and the cap's own resulting figure, which is why a re-book at that date is refused");
  assert.equal(rel.advances[0].boundary_date, period.mid, "…at the boundary the cap would name");

  // ---- RUN THE REPORT'S OWN REMEDY. It must be executable exactly as written.
  const rev = (b.bookings ?? []).flatMap((x) => x.remedy_calls ?? []).find((c) => c.fn === "clara.reverse_entry");
  assert.ok(rev, "the report names clara.reverse_entry");
  const revErr = await caught(() => reverseEntry(sub, { entry: rev.entry_id, reason: "x42.r8s release", opKey: opk("r8sa1r") }));
  assert.equal(revErr, null, `the named remedy must execute; got ${JSON.stringify(revErr)}`);
  // THE RELEASE IS DATED AT THE MIRROR, AND THE REGISTER SAYS SO AT BOTH ENDS. At the
  // BOOKING's own historic date the discharge still stands — nothing is retracted from
  // history — and the debt is back only from the correction's date forward. That asymmetry
  // IS the one-way finding, read straight off the outstanding equation.
  assert.equal(await outAt(advance, period.end), 0,
    "at the line's own period the discharge still stands: the correction is dated at the mirror, not there");
  assert.equal(await outAt(advance, today), CENTS,
    "…and the debt is back today, where the correction actually landed");
  assert.equal(await bankGlOf(client), -CENTS, "the bank GL is back down 30,000 — the booking is unwound");
  recon = await getBankReconciliation(sub, { statement });
  assert.equal(Number(recon.difference_cents), 0, "reconciliation difference is EXACTLY 0 after the release");
  assert.equal(Number(recon.excepted_cents), CENTS,
    "…with the released line itemised as excepted, to the cent");

  // ---- RE-BOOK, at the date the report named, through the door it named.
  const ex2 = await openExceptionOf(line.id);
  assert.ok(ex2, "the release reopened the exception");
  const r2 = await resolveAndBookAck(sub, {
    client, exception: ex2, note: "x42.r8s re-booked late, period exception acknowledged",
    draft: repaymentDraft(today, CENTS, "x42.r8s advance returned (re-booked)"),
    advanceApplications: application(advance, CENTS, "x42.r8s re-book"),
    ackPeriodExceptions: true, opKey: opk("r8sa1-2"),
  });
  assert.ok(matchIdOf(r2), "the re-book made a group");
  assert.equal(r2.ack_period_exceptions, true, "the receipt records that the exception was acknowledged");
  assert.equal(Number(r2.period_exceptions), 1,
    "…and clara.match_bank_line's own count says exactly ONE posting-date exception was recorded");

  // ---- THE MONEY, AT EVERY DATE.
  assert.equal(await outAt(advance, today), 0, "the re-book discharged the advance again, to the cent");
  assert.equal(await outAt(advance, period.mid), 0,
    "…and the ORIGINAL discharge still stands at its own historic date: nothing was retracted from history");
  assert.equal(await bankGlOf(client), 0, "the bank GL carries the line exactly once — flat, not doubled");
  recon = await getBankReconciliation(sub, { statement });
  assert.equal(Number(recon.difference_cents), 0, "reconciliation difference is EXACTLY 0 after the re-book");
  assert.equal(Number(recon.excepted_cents), 0, "…and nothing is left excepted");

  const tie = await staffAdvanceTie(sub, client, "2099-12-31");
  assert.equal(tie.tie, true, `staff_advance_tie must tie through the whole chain; got ${JSON.stringify(tie)}`);
});

test("x42.r8s-a2 THE CONTROL: the byte-identical chain with NO advance payload still re-books at the line's OWN date, and its release receipt carries no advance statement", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("r8sa2");
  const CENTS = 30_000;
  const { line, period, statement } = await pastBankLine(sub, {
    client, amountCents: CENTS, description: "x42.r8s control inbound",
  });
  const ex1 = await openException(sub, { client, line: line.id, reason: "x42.r8s control" });
  const plainDraft = {
    posting_date: period.mid, memo: "x42.r8s control booking",
    lines: [
      { account_code: BANKCOA, debit_cents: CENTS, credit_cents: 0, description: "into the bank" },
      { account_code: REVN, debit_cents: 0, credit_cents: CENTS, description: "misc income" },
    ],
  };
  const r1 = await resolveAndBookAck(sub, {
    client, exception: ex1, note: "x42.r8s control booking", draft: plainDraft, opKey: opk("r8sa2-1"),
  });
  assert.equal(r1.ack_period_exceptions, false,
    "the receipt reports the acknowledgement as FALSE when the caller named none");
  await unmatchBankMatch(sub, { client, match: matchIdOf(r1), reason: "x42.r8s control release" });
  const b = await block(line.id);
  assert.equal(b?.blocking, true, "the control release blocks too");
  assert.equal((b.bookings ?? [])[0].advance_release, null,
    "…and carries NO advance_release: this booking discharged no advance, so nothing about it is one-way");
  assert.equal((b.bookings ?? [])[0].advance_reversal, null, "…and no advance_reversal wall either");
  const rev = (b.bookings ?? []).flatMap((x) => x.remedy_calls ?? []).find((c) => c.fn === "clara.reverse_entry");
  assert.ok(rev, "the control report names clara.reverse_entry");
  assert.equal(
    await caught(() => reverseEntry(sub, { entry: rev.entry_id, reason: "x42.r8s control release", opKey: opk("r8sa2r") })),
    null, "the control remedy executes");
  const ex2 = await openExceptionOf(line.id);
  const r2 = await resolveAndBookAck(sub, {
    client, exception: ex2, note: "x42.r8s control re-book",
    draft: { ...plainDraft, memo: "x42.r8s control re-booked" }, opKey: opk("r8sa2-2"),
  });
  assert.ok(matchIdOf(r2), "the control re-books at the line's OWN date, unchanged by this wave");
  assert.equal(Number(r2.period_exceptions), 0, "…with no posting-date exception at all");
  const recon = await getBankReconciliation(sub, { statement });
  assert.equal(Number(recon.difference_cents), 0, "control reconciliation difference EXACTLY 0");
  assert.equal(Number(recon.excepted_cents), 0, "…nothing excepted");
});

test("x42.r8s-a3 an UNACKNOWLEDGED late re-book is still refused, and the line's own date is still the register's to refuse — one argument is the whole difference", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("r8sa3");
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R8S Bakar" });
  const CENTS = 30_000;
  const { line, period } = await pastBankLine(sub, { client, amountCents: CENTS, description: "x42.r8s a3 inbound" });
  await plainAt(sub, { client, debit: ADVCODE, credit: BANKCOA, cents: CENTS, postingDate: period.mid, memo: "x42.r8s a3 advance" });
  const advance = (await advanceRowsOf(client))[0].id;
  const ex1 = await openException(sub, { client, line: line.id, reason: "x42.r8s a3" });
  const r1 = await resolveAndBookAck(sub, {
    client, exception: ex1, note: "x42.r8s a3 booking",
    draft: repaymentDraft(period.mid, CENTS, "x42.r8s a3"),
    advanceApplications: application(advance, CENTS), opKey: opk("r8sa3-1"),
  });
  await unmatchBankMatch(sub, { client, match: matchIdOf(r1), reason: "x42.r8s a3 release" });
  const b = await block(line.id);
  const rev = (b.bookings ?? []).flatMap((x) => x.remedy_calls ?? []).find((c) => c.fn === "clara.reverse_entry");
  await reverseEntry(sub, { entry: rev.entry_id, reason: "x42.r8s a3 release", opKey: opk("r8sa3r") });
  const ex2 = await openExceptionOf(line.id);
  const today = await mytToday();

  // (i) At the line's OWN date the REGISTER refuses — the cap, exactly as the
  //     release receipt predicted. Rounds 1-3 ruled the correction is never
  //     re-dated, and this wave does not re-open that.
  const own = await caught(() => resolveAndBookAck(sub, {
    client, exception: ex2, note: "x42.r8s a3 re-book at the own date",
    draft: repaymentDraft(period.mid, CENTS, "x42.r8s a3 own date"),
    advanceApplications: application(advance, CENTS), ackPeriodExceptions: true,
    opKey: opk("r8sa3-own"),
  }));
  assert.ok(own, "a re-book at the line's own date is still refused");
  assert.equal(own.code, CLR39, `…as CLR39 (got ${own.code} — ${own.message})`);
  assert.equal(reasonOf(own), "advance_over_application",
    `…by the register's temporal cap (got '${reasonOf(own) ?? "(none)"}')`);

  // (ii) At TODAY, WITHOUT the acknowledgement, the BANK refuses — unchanged.
  const unack = await caught(() => resolveAndBookAck(sub, {
    client, exception: ex2, note: "x42.r8s a3 re-book unacknowledged",
    draft: repaymentDraft(today, CENTS, "x42.r8s a3 today"),
    advanceApplications: application(advance, CENTS), opKey: opk("r8sa3-un"),
  }));
  assert.ok(unack, "a late re-book without the acknowledgement is still refused");
  assert.equal(unack.code, CLR10, `…as CLR10 (got ${unack.code} — ${unack.message})`);
  assert.equal(reasonOf(unack), "period_exception_unacknowledged",
    `…by clara.match_bank_line's own gate (got '${reasonOf(unack) ?? "(none)"}')`);

  // (iii) …and the same call WITH it lands.
  const ok = await resolveAndBookAck(sub, {
    client, exception: ex2, note: "x42.r8s a3 re-book acknowledged",
    draft: repaymentDraft(today, CENTS, "x42.r8s a3 today ack"),
    advanceApplications: application(advance, CENTS), ackPeriodExceptions: true,
    opKey: opk("r8sa3-ack"),
  });
  assert.ok(matchIdOf(ok), "the acknowledged re-book lands");
  assert.equal(await outAt(advance, today), 0, "…and the register is clear again, to the cent");
});

test("x42.r8s-a4 the release statement is DERIVED, not asserted: a SAME-DAY booking reports the release as NOT one-way, and the claim is then EXECUTED", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("r8sa4");
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "R8S Chan" });
  const today = await mytToday();
  const CENTS = 12_345;
  // A statement period that CONTAINS today, so the booking's own posting date is
  // today — which is also where clara.reverse_entry stamps its mirror.
  const bankAccount = await freshBankAccount(sub, client);
  const start = `${today.slice(0, 8)}01`;
  const end = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const stmt = await enterStatement(sub, {
    client, bankAccount, periodStart: start, periodEnd: end, opening: 0, keepPeriod: true,
    specs: [{ amountCents: CENTS, entryDate: today, description: "x42.r8s a4 same-day repayment" }],
  });
  const line = stmt.lines[0];
  await plainAt(sub, { client, debit: ADVCODE, credit: BANKCOA, cents: CENTS, postingDate: start, memo: "x42.r8s a4 advance" });
  const advance = (await advanceRowsOf(client))[0].id;
  const ex = await openException(sub, { client, line: line.id, reason: "x42.r8s a4" });
  const r = await resolveAndBookAck(sub, {
    client, exception: ex, note: "x42.r8s a4 booking",
    draft: repaymentDraft(today, CENTS, "x42.r8s a4"),
    advanceApplications: application(advance, CENTS), opKey: opk("r8sa4-1"),
  });
  await unmatchBankMatch(sub, { client, match: matchIdOf(r), reason: "x42.r8s a4 release" });
  const b = await block(line.id);
  const rel = (b.bookings ?? [])[0]?.advance_release;
  assert.ok(rel, "the same-day booking still reports an advance_release");
  assert.equal(rel.correction_posting_date, today, "the mirror lands today");
  assert.equal(rel.entry_posting_date, today, "…on the booking's own date");
  assert.equal(rel.one_way_at_entry_date, false,
    "…so the release is NOT one-way, and the statement says so rather than crying wolf");
  assert.equal(rel.advances[0].reapplication_admitted_at_entry_date, true,
    "…because the cap itself admits re-applying at that date");
  assert.equal(rel.advances[0].boundary_date, null, "…and names no breaching boundary");
  assert.match(rel.statement, /reversible at the line's own date/,
    "…and the sentence a human reads agrees with the machine keys");

  // The statement is a CLAIM about clara.reverse_entry + the composite, so it is
  // executed here rather than believed.
  const rev = (b.bookings ?? []).flatMap((x) => x.remedy_calls ?? []).find((c) => c.fn === "clara.reverse_entry");
  assert.equal(
    await caught(() => reverseEntry(sub, { entry: rev.entry_id, reason: "x42.r8s a4 release", opKey: opk("r8sa4r") })),
    null, "the remedy executes");
  const ex2 = await openExceptionOf(line.id);
  const r2 = await resolveAndBookAck(sub, {
    client, exception: ex2, note: "x42.r8s a4 re-book same day",
    draft: repaymentDraft(today, CENTS, "x42.r8s a4 re-book"),
    advanceApplications: application(advance, CENTS), opKey: opk("r8sa4-2"),
  });
  assert.ok(matchIdOf(r2), "…and the same-day re-book lands with NO acknowledgement needed");
  assert.equal(await outAt(advance, today), 0, "the register is clear, to the cent");
});

// ---------------------------------------------------------------------------
// THE DOOR'S OWN GRAMMAR — off this fix's corridor (WDB-R4): the OTHER leg, the
// OTHER answer, and the replay grain.
// ---------------------------------------------------------------------------

test("x42.r8s-k1 p_ack_period_exceptions on the SETTLEMENT leg: true is refused by name at argument time, false and absent bind exactly as before", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("r8sk1");
  const cp = await birthCounterparty(sub, { client, name: `X42 R8S ${uniq()}`, kind: "customer" });
  const CENTS = 4_200;
  const { line, period, statement } = await pastBankLine(sub, { client, amountCents: CENTS, description: "x42.r8s k1 receipt" });
  const inv = await stampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: CENTS, control: AR1, postingDate: period.mid,
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42.r8s k1" });
  const allocations = [{ item_id: inv.item, amount_cents: CENTS }];

  const bad = await caught(() => resolveAndBookAck(sub, {
    client, exception: ex, note: "x42.r8s k1 ack on the settle leg",
    allocations, ackPeriodExceptions: true, opKey: opk("r8sk1-bad"),
  }));
  assert.ok(bad, "an acknowledgement on the settlement leg is refused");
  assert.equal(bad.code, CLR10, `…as CLR10 (got ${bad.code} — ${bad.message})`);
  assert.equal(reasonOf(bad), "booking_request_invalid",
    `…on the composite's own argument-shape token (got '${reasonOf(bad) ?? "(none)"}')`);
  assert.equal(axisOf(bad), "ack_without_draft",
    `…with its own axis, so a surface can gloss it (got '${axisOf(bad) ?? "(none)"}')`);
  assert.equal(
    (await rootQuery("select status from clara.bank_line_exceptions where id=$1", [ex])).rows[0].status,
    "open", "the exception is untouched: the refusal is at argument time, above every lock");

  // FALSE asserts nothing, so it binds exactly as omitting it does.
  const ok = await resolveAndBookAck(sub, {
    client, exception: ex, note: "x42.r8s k1 settle", allocations,
    ackPeriodExceptions: false, opKey: opk("r8sk1-ok"),
  });
  assert.ok(matchIdOf(ok), "the settlement leg still books with an explicit false");
  assert.equal(ok.ack_period_exceptions, false, "…and reports it as false on the receipt");
  const recon = await getBankReconciliation(sub, { statement });
  assert.equal(Number(recon.difference_cents), 0, "settlement reconciliation difference EXACTLY 0");
});

test("x42.r8s-k2 the acknowledgement is IN the request hash, and it never manufactures the exception it acknowledges", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("r8sk2");
  const CENTS = 7_700;
  const { line, period, statement } = await pastBankLine(sub, { client, amountCents: CENTS, description: "x42.r8s k2 inbound" });
  const ex = await openException(sub, { client, line: line.id, reason: "x42.r8s k2" });
  const draft = {
    posting_date: period.mid, memo: "x42.r8s k2 in-period booking",
    lines: [
      { account_code: BANKCOA, debit_cents: CENTS, credit_cents: 0, description: "into the bank" },
      { account_code: REVN, debit_cents: 0, credit_cents: CENTS, description: "misc income" },
    ],
  };
  const key = opk("r8sk2");
  // ACK=TRUE on a draft INSIDE the period: the answer is carried, and the count
  // stays ZERO. An acknowledgement never makes the thing it acknowledges.
  const first = await resolveAndBookAck(sub, {
    client, exception: ex, note: "x42.r8s k2 booking", draft,
    ackPeriodExceptions: true, opKey: key,
  });
  assert.ok(matchIdOf(first), "the in-period booking lands");
  assert.equal(first.ack_period_exceptions, true, "the receipt carries the caller's answer");
  assert.equal(Number(first.period_exceptions), 0,
    "…and clara.match_bank_line recorded NO posting-date exception: the date was inside the period");
  assert.equal(
    Number((await rootQuery(
      `select count(*)::int as n from clara.bank_match_entry_members
        where match_id=$1 and posting_date_exception`, [matchIdOf(first)])).rows[0].n),
    0, "…and no member row claims one either");

  // A REPLAY OF EITHER ANSWER IS REFUSED BEFORE THE RESERVATION IS EVEN CONSULTED, and that
  // is PRE-EXISTING, MEASURED behaviour of this verb rather than anything this wave did: the
  // `already_resolved` authority test sits ABOVE clara._reserve_op, so once the act has
  // succeeded the exception is resolved and no replay of any shape can reach the dedup. Both
  // answers are probed so the cell states the fact rather than one instance of it.
  for (const ack of [true, false]) {
    const again = await caught(() => resolveAndBookAck(sub, {
      client, exception: ex, note: "x42.r8s k2 booking", draft,
      ackPeriodExceptions: ack, opKey: key,
    }));
    assert.ok(again, `a replay with ack=${ack} is refused`);
    assert.equal(reasonOf(again), "already_resolved",
      `…by the exception's own authority test, above the reservation (got '${reasonOf(again) ?? "(none)"}')`);
  }
  noteLane("x42.r8s-k2 replay is unreachable for this verb once the exception resolves — the already_resolved test sits above _reserve_op (pre-existing, out of this lane's scope)");

  // …so the hash's own membership is asserted where it lives. ABI law: the request hash
  // carries every argument that reaches a stored column OR a decision, and the
  // acknowledgement is BOTH (it decides the period gate and is recorded on the member row,
  // in clara.match_bank_line's audit payload and in this verb's). A hash that omitted it
  // would serve an ack=true replay the ack=false call's receipt on any verb whose dedup IS
  // reachable — which is the defect clara.match_bank_line's own header records.
  const src = (await rootQuery(
    `select p.prosrc as s from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.proname='resolve_and_book_bank_line'`)).rows[0].s;
  const hashArgs = /clara\._hash\(jsonb_build_object\(([\s\S]*?)\)\)\)/.exec(src)?.[1] ?? "";
  assert.match(hashArgs, /'ack'/,
    "the composite's request hash must carry the acknowledgement");

  // …and the AUDIT records the caller's answer, which is the other half of that law.
  const audit = (await rootQuery(
    `select args from clara.audit_log
      where fn='resolve_and_book_bank_line' and args->>'op_key'=$1
      order by at desc limit 1`, [key])).rows[0]?.args;
  assert.ok(audit, "the composite audited its act");
  assert.equal(audit.ack_period_exceptions, true, "…recording the acknowledgement the caller gave");

  const recon = await getBankReconciliation(sub, { statement });
  assert.equal(Number(recon.difference_cents), 0, "reconciliation difference EXACTLY 0");
});
