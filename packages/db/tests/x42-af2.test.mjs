// 0042 Wave D-b — AF-2: `clara.resolve_and_book_bank_line`, the OWNER-floor
// resolve-and-book composite (design §4 / WD-R13 / WDB-G9/G16). PART 1 of the
// AF-2 battery: the floors, the argument-time disposition wall, both
// non-high-stakes booking branches, the advance payload, the charge leg, and
// one-transaction atomicity.
//   * PART 2 — `x42-af2-park.test.mjs`: the high-stakes PARK, the
//     pending_resolution CHECK, the exceptions surface, the parked-line direct
//     resolve, the cancel drill and the flip.
//   * PART 3 — `x42-af2-reopen.test.mjs`: the post-flip reopen, the reopen
//     block, reopen identity, set-once immutability + exactly-one, and the
//     ordinary-group unconditional refusals.
//
// CONTRACT-BLIND, the x37/x38/x40/x41 discipline: authored from
// docs/plan/wave-d-b-design.md §4 + §7 and docs/plan/wave-d-b-design-abi.md
// (§A/§B/§D/§E/§F/§G) ONLY. This lane never reads a 0042 migration file or any
// build-0042 section file — it encodes the DESIGN's promises. Every refusal is
// asserted by its ABI §F DETAIL reason token, which the design calls LAW. A
// 42883 / param-name / token divergence at integration is a FINDING for
// orchestrator adjudication, never a silent test edit. CELLS THAT NEED 0042
// OBJECTS WILL FAIL until assembly — that is the correct, intended state
// (red-first); this suite does NOT gate on a 0042 schema_migrations row. It DOES
// gate (loud, counted skip) on the 0037–0040 bank substrate, since every fixture
// is built through THOSE audited verbs.
//
// The full interface-assumption register (IA-1..IA-6) lives once in
// x42-af2-helpers.mjs's header; call sites here do not repeat it.
//
// Serial discipline: the package runs `node --test --test-concurrency=1`.
// DO NOT run this suite here (orchestrator-only rig).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, reasonOf, endPool, printLaneNotes, printSkipCount,
  noteLane, HIGH_STAKES_CENTS,
} from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, refusesWithCode, caught,
  resolveAndBookBankLine, enrolStaffAdvanceAccount,
  T, CLR04, CLR10,
  BANKCOA, AR1, AP1, EXPN, REVN, CHARGEX, ADJX, ADVCODE,
  af2World, freshAf2Client, bankLine, openException, stampedItem, plainAt,
  assertEnvelope, assertUntouched,
  entryRowOf, entryLinesOf, entryCountOf, entriesWithFlag, exceptionRow,
  groupsOfLine, advanceRowsOf, advanceApplicationRowsOf,
  assertGroupTies, lineGroupStatus, matchRow, matchIdOf, birthCounterparty, outstandingOf,
} from "./x42-af2-world.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 battery is dormant (the red-first cells below still encode the design)");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-af2");
  printSkipCount("x42-af2");
  await endPool();
});

// ===========================================================================
// x42.af2-1 — THE OWNER FLOOR. `resolve_and_book_bank_line` is an OWNER act
// (design §4): the exception door itself is owner-floored in 0040, and booking a
// resolution is that same authority seen from the other side. A bookkeeper and
// an ADMIN are both refused — admin outranks bookkeeper but is still not a firm
// principal for this door.
// ===========================================================================
test("x42.af2-1 floors: a bookkeeper, an admin and a viewer are all refused; the OWNER passes", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("floors");
  const { line, period } = await bankLine(world.users.alice, { client, amountCents: 50_000, description: "x42 floor probe" });
  const ex = await openException(world.users.alice, { client, line: line.id, reason: "x42 floors: unidentified credit" });
  const draft = {
    posting_date: period.mid, memo: "x42 floors booking",
    lines: [
      { account_code: BANKCOA, debit_cents: 50_000, credit_cents: 0, description: "into the bank" },
      { account_code: REVN, debit_cents: 0, credit_cents: 50_000, description: "sundry income" },
    ],
  };

  for (const [who, role] of [[world.users.bob, "bookkeeper"], [world.users.hana, "admin"], [world.users.carol, "viewer"]]) {
    const err = await caught(() => resolveAndBookBankLine(who, {
      client, exception: ex, disposition: "matched_booking", note: `x42 floors ${role}`, draft,
      opKey: opk(`x42-floor-${role}`),
    }));
    assert.ok(err, `a ${role} must NOT be able to resolve-and-book`);
    assert.equal(err.code, CLR04,
      `the ${role} refusal is the role-floor SQLSTATE CLR04 (got ${err.code} — ${err.message})`);
  }
  assert.equal((await exceptionRow(ex))?.status, "open", "three refused calls left the exception open");

  const receipt = await resolveAndBookBankLine(world.users.alice, {
    client, exception: ex, disposition: "matched_booking", note: "x42 floors: the owner books it",
    draft, opKey: opk("x42-floor-owner"),
  });
  assertEnvelope(receipt, { exception: ex, branch: "live" }, "x42.af2-1 owner");
  assert.equal((await exceptionRow(ex))?.status, "resolved", "the OWNER's call resolved the exception");
});

// ===========================================================================
// x42.af2-2 — THE DISPOSITION WALL IS AN ARGUMENT-TIME WALL, ON BOTH BRANCHES
// (ABI §A/§F). Only the two BOOKING dispositions are supported;
// `bank_corrective_line` — a perfectly lawful 0040 disposition — ALWAYS refuses
// here, because a corrective pair books nothing and has its own direct verb.
// "Argument time" means the refusal precedes any state change, which is exactly
// what the untouched-world assertion after each probe measures.
// ===========================================================================
test("x42.af2-2 p_disposition is validated at ARGUMENT time on BOTH branches: bank_corrective_line and any unknown token refuse disposition_unsupported, before any state change", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("disp");
  const sub = world.users.alice;

  // (a) the NON-high-stakes world.
  const low = await bankLine(sub, { client, amountCents: 50_000, description: "x42 disposition probe low" });
  const exLow = await openException(sub, { client, line: low.line.id, reason: "x42 disposition: low-stakes" });
  const beforeLow = await entryCountOf(client);
  for (const bad of ["bank_corrective_line", "written_off_adjustments", "matched", ""]) {
    await refusesWithCode(
      () => resolveAndBookBankLine(sub, {
        client, exception: exLow, disposition: bad, note: `x42 low ${bad || "(blank)"}`,
        opKey: opk("x42-disp-low"),
      }),
      CLR10, T.dispositionUnsupported,
      `x42.af2-2 non-high-stakes: p_disposition='${bad || "(blank)"}'`,
    );
    await assertUntouched(client, { exception: exLow, line: low.line.id, entryCountBefore: beforeLow },
      `x42.af2-2 after '${bad || "(blank)"}'`);
  }

  // (b) the HIGH-STAKES world — the same wall, reached before the branch even
  // decides, so the park never gets a chance to write a declaration.
  const cp = await birthCounterparty(sub, { client, name: `X42 DISPCO ${Date.now().toString(36)}`, kind: "customer" });
  const high = await bankLine(sub, { client, amountCents: HIGH_STAKES_CENTS, description: "x42 disposition probe high" });
  const inv = await stampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: HIGH_STAKES_CENTS, control: AR1,
    postingDate: high.period.mid, checker: world.users.bob,
  });
  const exHigh = await openException(sub, { client, line: high.line.id, reason: "x42 disposition: high-stakes" });
  const beforeHigh = await entryCountOf(client);
  await refusesWithCode(
    () => resolveAndBookBankLine(sub, {
      client, exception: exHigh, disposition: "bank_corrective_line", note: "x42 high corrective",
      allocations: [{ item_id: inv.item, amount_cents: HIGH_STAKES_CENTS }], opKey: opk("x42-disp-high"),
    }),
    CLR10, T.dispositionUnsupported,
    "x42.af2-2 high-stakes: bank_corrective_line ALWAYS refuses",
  );
  await assertUntouched(client, { exception: exHigh, line: high.line.id, entryCountBefore: beforeHigh },
    "x42.af2-2 after the high-stakes corrective probe");
  assert.equal((await groupsOfLine(high.line.id)).length, 0,
    "the high-stakes probe wrote no group AT ALL — not even an unmatched one: the wall is at argument time");
});

// ===========================================================================
// x42.af2-3 — NON-HIGH-STAKES `matched_booking`, ROUTE M (the inline hand-draft):
// resolve → mint the draft at confidence 1.0 → approve → ONE LIVE match group at
// commit, with `resolution_exception_id` stamped in the CREATING transaction.
// `match_bank_line` is untouched by the caller: the walls it enforces see the
// exception as ALREADY status='resolved' inside this one transaction.
// ===========================================================================
test("x42.af2-3 non-high-stakes matched_booking (route M): the hand-draft mints, approves and lands ONE live group carrying resolution_exception_id", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("mb-m");
  const sub = world.users.alice;
  const { line, period } = await bankLine(sub, { client, amountCents: 50_000, description: "x42 unidentified credit" });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 route-M: unidentified credit" });

  const receipt = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking",
    note: "x42 route-M: identified as a sundry receipt and booked",
    draft: {
      posting_date: period.mid, memo: "x42 sundry receipt",
      lines: [
        { account_code: BANKCOA, debit_cents: 50_000, credit_cents: 0, description: "into the bank" },
        { account_code: REVN, debit_cents: 0, credit_cents: 50_000, description: "sundry income" },
      ],
    },
    opKey: opk("x42-mb-m"),
  });
  assertEnvelope(receipt, { exception: ex, branch: "live" }, "x42.af2-3");

  const match = matchIdOf(receipt);
  const group = await matchRow(match);
  assert.equal(group.status, "live", "a below-threshold resolve-and-book lands the group LIVE at commit");
  assert.equal(group.resolution_exception_id, ex,
    "the group carries resolution_exception_id = p_exception, stamped in the CREATING transaction");
  assert.equal(group.pending_resolution, null, "a LIVE group carries no parked declaration");
  assert.equal((await lineGroupStatus(line.id))[0], "live", "the line is owned by exactly one live group");
  await assertGroupTies(match, "x42.af2-3 route-M booking");

  const ent = await entryRowOf(receipt.entry_id);
  assert.equal(ent.status, "approved", "the inline hand-draft is APPROVED inside the composite (design §4)");
  const res = await rootQuery(
    "select confidence from clara.client_resolutions where id=$1", [ent.client_resolution_id ?? null]);
  if (res.rows[0]) {
    assert.equal(Number(res.rows[0].confidence), 1,
      `the inline resolution is minted at confidence 1.0 (got ${res.rows[0].confidence})`);
  } else {
    noteLane("x42.af2-3: no client_resolutions row is reachable from the booked entry by name — the confidence-1.0 mint is UNASSERTED (finding)");
  }

  const exRow = await exceptionRow(ex);
  assert.equal(exRow.status, "resolved", "the exception is resolved in the same transaction as the booking");
  assert.equal(exRow.resolution_disposition, "matched_booking", "…under the disposition the caller named");
  assert.equal(exRow.resolved_by, sub, "…by the OWNER who called the composite");
  assert.equal(exRow.resolution_note, "x42 route-M: identified as a sundry receipt and booked",
    "…with the caller's note stored verbatim");
});

// ===========================================================================
// x42.af2-3b — NON-HIGH-STAKES `matched_booking`, ROUTE S (the settlement leg):
// `p_allocations` alone drives `_settle_from_bank_line_core`, and the
// counterparty is DERIVED from the named open items (IA-2 — the park branch
// proves this derivation must exist, since it refuses p_draft outright and still
// books a settlement).
// ===========================================================================
test("x42.af2-3b non-high-stakes matched_booking (route S): p_allocations alone settles the line, clears the invoice and lands ONE live group", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("mb-s");
  const sub = world.users.alice;
  const cp = await birthCounterparty(sub, { client, name: `X42 SETTLECO ${Date.now().toString(36)}`, kind: "customer" });
  const { line, period } = await bankLine(sub, { client, amountCents: 40_000, description: "x42 customer deposit" });
  const inv = await stampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: 40_000, control: AR1, postingDate: period.mid,
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 route-S: deposit not recognised at the time" });

  const receipt = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking",
    note: "x42 route-S: it was this customer's payment after all",
    allocations: [{ item_id: inv.item, amount_cents: 40_000 }],
    opKey: opk("x42-mb-s"),
  });
  assertEnvelope(receipt, { exception: ex, branch: "live" }, "x42.af2-3b");
  const match = matchIdOf(receipt);
  assert.equal((await matchRow(match)).status, "live", "the settlement leg lands the group LIVE");
  assert.equal((await matchRow(match)).resolution_exception_id, ex, "…carrying the resolved exception's id");
  await assertGroupTies(match, "x42.af2-3b route-S settlement");
  assert.equal(await outstandingOf(inv.item), 0, "the allocated invoice is genuinely cleared");
  assert.equal((await exceptionRow(ex)).status, "resolved", "the exception resolved with the booking");
});

// ===========================================================================
// x42.af2-4 — NON-HIGH-STAKES `written_off_adjustment`: the part of the line the
// books can explain is drafted, and the remainder is written off — so the draft
// and the write-off together tie the line exactly.
//
// WHICH LEG OWNS `p_adjustments`. The design's high-stakes park refuses FOUR
// ancillaries BY NAME — `p_draft`, `p_adjustments`, `p_advance_applications`,
// `p_charge_cents`+`p_charge_account` (design §4 / [L1/C2 BLOCKER, M10]) — and
// that list is only non-vacuous if `p_adjustments` is a SETTLEMENT-leg argument:
// on the hand-draft leg it would already be unreachable behind the p_draft
// refusal. The build reads it exactly that way — difference adjustments are
// stated against an open-item settlement, and a hand-draft states its own
// lines — so pairing p_draft with p_adjustments is refused
// `booking_request_invalid` at argument time. Nothing is lost: a write-off on
// the draft leg is simply one more leg of the draft, which is what this cell
// now books. BOTH halves are asserted — the wall AND the tie.
// ===========================================================================
test("x42.af2-4 non-high-stakes written_off_adjustment: p_adjustments is a settlement-leg argument, and the draft's own write-off leg ties the line exactly", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("woa");
  const sub = world.users.alice;
  const { line, period } = await bankLine(sub, { client, amountCents: -50_000, description: "x42 unexplained debit" });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 write-off: partly unexplained debit" });

  const feeOnly = {
    posting_date: period.mid, memo: "x42 bank-borne fee",
    lines: [
      { account_code: EXPN, debit_cents: 45_000, credit_cents: 0, description: "professional fee" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: 45_000, description: "out of the bank" },
    ],
  };
  const wall = await caught(() => resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "written_off_adjustment",
    note: "x42 write-off: the settlement-leg adjustment shape, on the draft leg",
    draft: feeOnly,
    adjustments: [{ account_code: ADJX, amount_cents: -5_000, memo: "x42 unexplained remainder written off" }],
    opKey: opk("x42-woa-wall"),
  }));
  assert.ok(wall, "p_adjustments alongside a hand-draft must be refused");
  assert.equal(wall.code, CLR10, `…as a CLR10 refusal (got ${wall.code} — ${wall.message})`);
  assert.equal(reasonOf(wall), "booking_request_invalid",
    `…named booking_request_invalid (got '${reasonOf(wall) ?? "(none)"}' — ${wall.message})`);
  assert.ok(`${wall.detail ?? ""}`.includes("settle_argument_on_draft_leg"),
    `…on the settle_argument_on_draft_leg axis (got detail=${wall.detail ?? "(none)"})`);
  await assertUntouched(client, { exception: ex, line: line.id, entryCountBefore: await entryCountOf(client) },
    "x42.af2-4 after the p_adjustments-on-draft-leg refusal");

  const receipt = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "written_off_adjustment",
    note: "x42 write-off: RM450 is a real fee, the RM50 remainder is written off",
    draft: {
      ...feeOnly,
      lines: [
        ...feeOnly.lines.slice(0, 1),
        { account_code: ADJX, debit_cents: 5_000, credit_cents: 0, description: "unexplained remainder written off" },
        { account_code: BANKCOA, debit_cents: 0, credit_cents: 50_000, description: "out of the bank" },
      ],
    },
    opKey: opk("x42-woa"),
  });
  assertEnvelope(receipt, { exception: ex, branch: "live" }, "x42.af2-4");
  const match = matchIdOf(receipt);
  assert.equal((await matchRow(match)).status, "live", "the write-off branch also lands the group LIVE");
  assert.equal((await matchRow(match)).resolution_exception_id, ex, "…stamped with its exception");
  await assertGroupTies(match, "x42.af2-4 write-off");
  const exRow = await exceptionRow(ex);
  assert.equal(exRow.resolution_disposition, "written_off_adjustment", "the stored disposition is the one named");
  assert.equal(exRow.counterpart_line_id, null,
    "a written_off_adjustment never carries a counterpart line (0040's ck_ble_resolution)");
});

// ===========================================================================
// x42.af2-5 — THE ADVANCE PAYLOAD RIDES THE HAND-DRAFT VERBATIM (design §4 +
// ABI §A/§B): `p_advance_applications` is copied byte-for-byte into the draft's
// `flags.staff_advance_application`, `line_no` refers to `p_draft.lines`, and the
// register rows mint on the APPROVE that happens inside the composite.
// ===========================================================================
test("x42.af2-5 p_advance_applications is copied VERBATIM into flags.staff_advance_application and the register rows mint on the composite's own approve", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("adv");
  const sub = world.users.alice;
  await enrolStaffAdvanceAccount(world.users.hana, { client, accountCode: ADVCODE, personLabel: "x42 Aminah" });

  // The disbursement: an ordinary approved entry whose DEBIT leg sits on the
  // enrolled advance code — the soft-birth door (design §3.3 arm (3)).
  const { line, period } = await bankLine(sub, { client, amountCents: 30_000, description: "x42 staff repayment in" });
  await plainAt(sub, {
    client, debit: ADVCODE, credit: BANKCOA, cents: 30_000, postingDate: period.mid,
    memo: "x42 advance to Aminah",
  });
  const advances = await advanceRowsOf(client);
  assert.equal(advances.length, 1, `the disbursement soft-birthed exactly ONE advance (got ${advances.length})`);
  const advance = advances[0].id;

  const ex = await openException(sub, { client, line: line.id, reason: "x42 advance: unidentified inbound transfer" });
  const payload = {
    kind: "bank_return",
    reason: "x42: Aminah returned the unspent advance by transfer",
    allocations: [{ line_no: 2, advance_id: advance, amount_cents: 30_000 }],
  };
  const receipt = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking",
    note: "x42 advance: the transfer is the returned advance",
    draft: {
      posting_date: period.mid, memo: "x42 advance returned",
      lines: [
        { account_code: BANKCOA, debit_cents: 30_000, credit_cents: 0, description: "into the bank" },
        { account_code: ADVCODE, debit_cents: 0, credit_cents: 30_000, description: "advance cleared" },
      ],
    },
    advanceApplications: payload,
    opKey: opk("x42-adv"),
  });
  assertEnvelope(receipt, { exception: ex, branch: "live" }, "x42.af2-5");

  const flagged = await entriesWithFlag(client, "staff_advance_application");
  assert.equal(flagged.length, 1, `exactly ONE entry carries the advance proposal flag (got ${flagged.length})`);
  assert.deepEqual(flagged[0].flags.staff_advance_application, payload,
    "the payload is copied VERBATIM — key for key, value for value (ABI §B)");
  assert.equal(flagged[0].status, "approved", "the hand-draft was approved inside the composite");

  const apps = await advanceApplicationRowsOf(client);
  assert.equal(apps.length, 1, `the approve minted exactly ONE application row (got ${apps.length})`);
  assert.equal(apps[0].advance_id, advance, "…against the advance the payload named");
  assert.equal(Number(apps[0].amount_cents), 30_000, "…for the payload's amount");
  assert.equal(apps[0].kind, "bank_return", "…under the payload's kind");
  assert.equal(String(apps[0].effective_date).slice(0, 10), String(flagged[0].posting_date).slice(0, 10),
    "…dated at the entry's own posting_date (the hook-derived effective_date)");
  const advLines = await entryLinesOf(flagged[0].id);
  assert.equal(advLines[1].account_code, ADVCODE,
    "line_no in the payload refers to p_draft.lines: leg 2 is the advance credit");
  await assertGroupTies(matchIdOf(receipt), "x42.af2-5 advance return");
});

// ===========================================================================
// x42.af2-6 — THE CHARGE LEG. `p_charge_cents` + `p_charge_account` are the
// settle verb's own slot: on the PAYMENT side the charge is its own entry and
// its own group member, so the line ties as settlement + charge.
// ===========================================================================
test("x42.af2-6 p_charge_cents + p_charge_account book the bank charge as its own group member and the line still ties", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("charge");
  const sub = world.users.alice;
  const cp = await birthCounterparty(sub, { client, name: `X42 CHARGECO ${Date.now().toString(36)}`, kind: "vendor" });
  const { line, period } = await bankLine(sub, { client, amountCents: -50_000, description: "x42 supplier payment out" });
  const bill = await stampedItem(sub, {
    client, domain: "ap", cp, cpKind: "vendor", cents: 45_000, control: AP1, postingDate: period.mid,
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 charge: outgoing not recognised" });

  const receipt = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking",
    note: "x42 charge: the supplier payment plus the bank's own RM50 charge",
    allocations: [{ item_id: bill.item, amount_cents: 45_000 }],
    chargeCents: 5_000, chargeAccount: CHARGEX,
    opKey: opk("x42-charge"),
  });
  assertEnvelope(receipt, { exception: ex, branch: "live" }, "x42.af2-6");
  assert.ok(receipt.charge_entry_id, "the payment-side charge mints its OWN entry (the settle core's law)");
  const chargeLines = await entryLinesOf(receipt.charge_entry_id);
  const chargeLeg = chargeLines.find((l) => l.account_code === CHARGEX);
  assert.ok(chargeLeg, `the charge entry carries a leg on ${CHARGEX} (got ${chargeLines.map((l) => l.account_code).join(",")})`);
  assert.equal(Number(chargeLeg.debit_cents), 5_000, "…debited for the stated charge");
  await assertGroupTies(matchIdOf(receipt), "x42.af2-6 settlement + charge");
  assert.equal(await outstandingOf(bill.item), 0, "the bill is cleared at its own amount, net of the charge");
});

// ===========================================================================
// x42.af2-7 — ONE TRANSACTION, OR NOTHING. A failing leg anywhere in the
// composite aborts the WHOLE act: no resolved exception, no group, no entry. The
// over-application is the cheapest genuine failure that lives DEEP in the chain
// (it is the subledger core's law, not the composite's own argument validation),
// so it proves the atomicity rather than an early return.
// ===========================================================================
test("x42.af2-7 one-transaction atomicity: an over-applying allocation aborts the WHOLE composite — no committed partial state", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("atomic");
  const sub = world.users.alice;
  const cp = await birthCounterparty(sub, { client, name: `X42 ATOMCO ${Date.now().toString(36)}`, kind: "customer" });
  const { line, period } = await bankLine(sub, { client, amountCents: 50_000, description: "x42 atomicity probe" });
  const inv = await stampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: 40_000, control: AR1, postingDate: period.mid,
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 atomicity: unidentified credit" });
  const before = await entryCountOf(client);
  const outstandingBefore = await outstandingOf(inv.item);

  const err = await caught(() => resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 atomicity: over-applied on purpose",
    allocations: [{ item_id: inv.item, amount_cents: 50_000 }], opKey: opk("x42-atomic"),
  }));
  assert.ok(err, "allocating 50,000 against a 40,000 invoice must refuse");
  noteLane(`x42.af2-7: the over-application refused code=${err.code} reason=${reasonOf(err) ?? "(none)"}`);
  await assertUntouched(client, { exception: ex, line: line.id, entryCountBefore: before },
    "x42.af2-7 after the failing composite");
  assert.equal(await outstandingOf(inv.item), outstandingBefore,
    "the invoice is untouched — its full outstanding survives the aborted composite");
});
