// 0042 Wave D-b — the STAFF-ADVANCE battery, part 5: THE MAKER-CHECKER GAP.
//
// WHY THIS FILE EXISTS. Parts 1–4 asked whether each register act is lawful AT THE
// MOMENT IT IS PROPOSED. Not one of them asked the question this file is built on:
//
//     a guard that AUTHORISES A FUTURE ACT must be re-asked AT the act.
//
// `clara.reverse_entry` is a two-moment verb. Below the firm's high-stakes floor it
// drafts AND posts the mirror in one transaction, so its guards and the register act
// are the same instant. AT OR ABOVE the floor it leaves the mirror as a DRAFT, and the
// register act — the void stamp, the corrections — happens later, at the CHECKER's
// approve, in a different transaction, after an arbitrary amount of other bookkeeping.
// Every guard `reverse_entry` asked is, by then, a value read before a decision and
// trusted after it. That is one of the two D-a defect classes BY NAME.
//
// THE LAW THESE CELLS HOLD THE BUILD TO (design §3.2 the outstanding equation, §3.3 the
// reversal arm, §F advance_applications_outstanding): the register may never report a
// person owing a NEGATIVE amount, and no act may leave a disbursement voided while the
// repayments against it still stand. Where the design does not describe the two-moment
// case at all, the cell states the law in its own words — and pins the ABI §F token,
// because one defect gets one token whichever door refuses it.
//
// CONTRACT-BLIND. Verb names, argument names, envelopes and tokens come from
// `docs/plan/completed/wave-d-b-design.md` §3/§7 + `-abi.md` §A/§F only.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane, rootQuery,
  x42EnsureReady, skip42, refusesWith, T, E,
  ADV1, ADV2, BANKV, mon, dayIn, today,
  advWorld, freshAdvClient, enrolHere, retireAdvance, approvedEntry, disburse,
  applyToAdvance, advanceTie, rowsBy, numOf, reverseEntry, approveDraft,
  advanceRow, advanceRows, applicationRowsOf, entryRowOf, mirrorIdOf,
  outstandingAt, glNet, firmHighStakesCents,
} from "./x42-adv-world.mjs";

let live = false;
let w = null;
let floor = 0;

before(async () => {
  live = await x42EnsureReady();
  if (live) {
    w = await advWorld();
    floor = await firmHighStakesCents(w.firms.A);
    noteLane(`x42-advances-gap: firm A high-stakes floor READ as ${floor} cents — every fixture here posts above it`);
    assert.ok(floor > 0, "the gap cells need a real high-stakes floor to open the draft window");
  }
});

after(async () => {
  printLaneNotes("x42-advances-gap");
  printSkipCount("x42-advances-gap");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b maker-checker-gap battery");

/** Disburse ABOVE the floor, then `reverse_entry` it and assert the mirror really is
 *  left as a DRAFT — the window this whole file is about. Returns the open window. */
async function openReversalWindow(label, { code = ADV1, cents = null } = {}) {
  const amount = cents ?? floor + 100_000;
  assert.ok(amount >= floor, `${label}: the fixture must be high-stakes or there is no window`);
  const { client, enrolment } = await freshAdvClient(label, { code });
  const { entry, advance } = await disburse({ client, cents: amount, postingDate: dayIn(mon(-3), 5), account: code });
  await reverseEntry(w.users.alice, { entry, reason: `x42 ${label} unwind the disbursement`, opKey: opk(`x42${label}r`) });
  const mirror = await mirrorIdOf(entry);
  assert.ok(mirror, `${label}: reverse_entry minted a mirror`);
  assert.equal((await entryRowOf(mirror)).status, "draft",
    `${label}: MANDATORY SETUP — above the high-stakes floor the mirror is left as a DRAFT, which is the whole gap`);
  assert.equal((await advanceRow(advance.id)).voided_by_entry_id, null,
    `${label}: …and nothing is voided yet, because the register act lives in the APPROVE hook`);
  return { client, enrolment, entry, advance, mirror, cents: amount };
}

// ===========================================================================
// x42v.g1 — THE MEASURED DEFECT. reverse_entry's arm (b) asked "does this
// disbursement carry net applications?" ONCE, and the void stamp trusted that answer
// across the gap.
// ===========================================================================

test("x42v.g1 a repayment booked INSIDE the drafted-mirror window makes the void inadmissible, and the hook re-asks: approving the mirror refuses CLR39 advance_applications_outstanding instead of driving outstanding NEGATIVE", async (t) => {
  if (skipHere(t)) return;
  const g = await openReversalWindow("g1");

  // INSIDE THE WINDOW: the person repays the whole advance. This is an ORDINARY, lawful
  // act — nothing about a drafted mirror somewhere else may block a real repayment.
  await applyToAdvance(w.users.bob, {
    client: g.client, advance: g.advance.id, cents: g.cents,
    postingDate: dayIn(mon(-2), 5), counter: BANKV, kind: "bank_return",
  });
  assert.equal((await applicationRowsOf(g.advance.id)).length, 1, "mandatory setup: the repayment is on the register");
  assert.equal(await outstandingAt(g.advance.id, today()), 0, "…and the advance is settled at zero");

  // THE ACT. Under the defect the checker's approve stamped the void anyway: outstanding
  // went to MINUS the whole advance, staff_advance_tie still said explained:true (both
  // sides agreed on a meaningless number) and retire_staff_advance_account then closed the
  // enrolment over it, because its `outstanding > 0` filter cannot see a negative.
  const err = await refusesWith(() => approveDraft(g.mirror, { maker: w.users.alice }),
    E.adv, T.advanceApplicationsOutstanding,
    "approving a drafted reversal mirror after a repayment landed inside the window");
  noteLane(`x42v.g1 axis=${JSON.stringify(err.detail ?? "")}`.slice(0, 200));

  // THE PROPERTY, NOT JUST THE REFUSAL.
  assert.equal((await advanceRow(g.advance.id)).voided_by_entry_id, null, "the advance was NOT voided");
  assert.equal((await advanceRow(g.advance.id)).void_effective_date, null, "…and carries no void date");
  for (const asOf of [dayIn(mon(-3), 6), dayIn(mon(-2), 6), today()]) {
    assert.ok(await outstandingAt(g.advance.id, asOf) >= 0,
      `outstanding is never NEGATIVE at any as-of (${asOf})`);
  }
  assert.equal((await entryRowOf(g.mirror)).status, "draft", "…and the mirror is still an unapproved draft");
  assert.equal(await glNet(g.client, ADV1), 0, "the GL never took the third leg — the approve rolled back whole");

  const row = rowsBy(await advanceTie(w.users.alice, g.client, today()), "account_code", "staff_advance_tie after the refusal")
    .find((r) => r.account_code === ADV1);
  assert.equal(row.explained, true, "the tie is explained on TRUE figures (register 0 = GL 0)");
  assert.equal(numOf(row, /^difference_cents$/, "the tie row"), 0, "…to the sen");
  assert.equal(numOf(row, /^register_cents$/, "the tie row"), 0,
    "…and the register reports ZERO owed, not a negative debt nobody could ever clear");
});

// ===========================================================================
// x42v.g2 — WHAT THE FIX DID NOT THINK OF (1): ALL-OR-NOTHING, ACROSS ADVANCES.
// One entry can disburse to TWO people. A guard written as a filter rather than as a
// refusal would void the clean one and skip the dirty one — a half-voided entry, which
// is the one shape neither the GL nor the register can describe.
// ===========================================================================

test("x42v.g2 the re-ask is ALL-OR-NOTHING: one entry disbursing on TWO enrolled codes, with only the SECOND repaid inside the window, refuses whole — neither advance is voided", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("g2");
  const second = await enrolHere(w.users.alice, { client, code: ADV2, personLabel: "x42 g2 second holder" });
  assert.ok(second !== enrolment, "mandatory setup: two live enrolments on two codes");

  const each = floor + 50_000;
  const entry = await approvedEntry(w.users.alice, {
    client, memo: "x42 g2 two people paid on one entry", postingDate: dayIn(mon(-3), 5),
    lines: [
      { account_code: ADV1, debit_cents: each, credit_cents: 0, description: "advance to A" },
      { account_code: ADV2, debit_cents: each, credit_cents: 0, description: "advance to B" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 2 * each, description: "from bank" },
    ],
  });
  const rows = await advanceRows(client);
  assert.equal(rows.length, 2, "mandatory setup: the hook soft-birthed ONE register row per debit leg");
  const a1 = rows.find((r) => r.account_code === ADV1);
  const a2 = rows.find((r) => r.account_code === ADV2);
  assert.ok(a1 && a2, "…one on each code");

  await reverseEntry(w.users.alice, { entry, reason: "x42 g2 both payments were wrong", opKey: opk("x42g2r") });
  const mirror = await mirrorIdOf(entry);
  assert.equal((await entryRowOf(mirror)).status, "draft", "mandatory setup: the mirror drafts (high-stakes)");

  // ONLY THE SECOND PERSON REPAYS, inside the window.
  await applyToAdvance(w.users.bob, {
    client, advance: a2.id, accountCode: ADV2, cents: each,
    postingDate: dayIn(mon(-2), 5), counter: BANKV, kind: "bank_return",
  });

  await refusesWith(() => approveDraft(mirror, { maker: w.users.alice }),
    E.adv, T.advanceApplicationsOutstanding,
    "approving a two-advance reversal mirror when only ONE of the two carries a live repayment");

  // THE SHAPE THE REFUSAL PREVENTS: a half-voided entry.
  assert.equal((await advanceRow(a1.id)).voided_by_entry_id, null,
    "the CLEAN advance was not voided either — a refusal aborts the whole reversal, it never filters");
  assert.equal((await advanceRow(a2.id)).voided_by_entry_id, null, "…nor the repaid one");
  for (const r of [a1, a2]) {
    assert.ok(await outstandingAt(r.id, today()) >= 0, `neither advance reports a negative debt (${r.account_code})`);
  }
  const tie = await advanceTie(w.users.alice, client, today());
  for (const code of [ADV1, ADV2]) {
    const row = rowsBy(tie, "account_code", "staff_advance_tie after the g2 refusal").find((r) => r.account_code === code);
    assert.equal(numOf(row, /^difference_cents$/, `the tie row for ${code}`), 0, `${code} ties to the sen`);
  }
});

// ===========================================================================
// x42v.g3 — WHAT THE FIX DID NOT THINK OF (2): IS THE REMEDY EXECUTABLE?
// A refusal whose named remedy is itself refused is the walled corridor this ladder
// exists to close. The refusal above says "reverse or correct those applications
// first" — so this cell PERFORMS that sentence and demands the door open.
// ===========================================================================

test("x42v.g3 the remedy the refusal names is executable: reversing the repayment nets the applications to zero, the SAME drafted mirror is then admitted, the void stamps, and both sides tie at zero", async (t) => {
  if (skipHere(t)) return;
  const g = await openReversalWindow("g3");
  const app = await applyToAdvance(w.users.bob, {
    client: g.client, advance: g.advance.id, cents: g.cents,
    postingDate: dayIn(mon(-2), 5), counter: BANKV, kind: "bank_return",
  });
  await refusesWith(() => approveDraft(g.mirror, { maker: w.users.alice }),
    E.adv, T.advanceApplicationsOutstanding, "the mirror is refused while the repayment stands");

  // THE REMEDY, PERFORMED. Reversing the repayment mints a `correction` that nets the
  // applications back to zero (design §3.2: corrections are negative effects).
  await reverseEntry(w.users.bob, { entry: app.entryId, reason: "x42 g3 the repayment never happened", opKey: opk("x42g3r") });
  const appMirror = await mirrorIdOf(app.entryId);
  if ((await entryRowOf(appMirror)).status === "draft") await approveDraft(appMirror, { maker: w.users.bob });
  const corrections = (await applicationRowsOf(g.advance.id)).filter((r) => r.kind === "correction");
  assert.equal(corrections.length, 1, "the remedy really did unwind the repayment");
  assert.equal(await outstandingAt(g.advance.id, today()), g.cents, "…so the debt is back on the register in full");

  // AND NOW THE SAME DRAFTED MIRROR MUST OPEN. This is the whole point of the cell: a
  // guard that is re-asked must be re-asked HONESTLY, not simply hardened into a wall.
  await approveDraft(g.mirror, { maker: w.users.alice });
  const row = await advanceRow(g.advance.id);
  assert.equal(row.voided_by_entry_id, g.mirror, "the void finally stamps, carried by the mirror that was drafted long before");
  assert.equal(row.void_effective_date, (await entryRowOf(g.mirror)).posting_date, "…at the MIRROR's own posting date (§3.3)");
  assert.equal(await outstandingAt(g.advance.id, today()), 0, "…and nothing is owed from that date on");
  assert.equal(await glNet(g.client, ADV1), 0, "the GL is back at zero across all four legs");
  const tieRow = rowsBy(await advanceTie(w.users.alice, g.client, today()), "account_code", "staff_advance_tie after the remedy")
    .find((r) => r.account_code === ADV1);
  assert.equal(numOf(tieRow, /^difference_cents$/, "the tie row"), 0, "…and register and GL tie to the sen");
  // The enrolment closes cleanly on a genuine zero — the act the defect let happen over a
  // negative balance now happens over a true one.
  await retireAdvance(w.users.hana, { client: g.client, enrolment: g.enrolment, reason: "x42 g3 close the account" });
});

// ===========================================================================
// x42v.g4 — THE DOOR CENSUS. The invariant is enforced in ONE place only because the
// void stamp and the application rows have exactly ONE writer. That is a property of
// the catalog, not of anybody's memory of it — so it is asserted, and a future
// migration that adds a second writer turns this cell red instead of quietly
// re-opening the class.
// ===========================================================================

test("x42v.g4 the register has exactly ONE writer: clara._adv_on_approve is the only body that stamps a void or mints an application row, so the re-ask at that body is a chokepoint and not one door of many", async (t) => {
  if (skipHere(t)) return;
  const writers = async (pattern) => (await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.prosrc ~* $1
      order by 1`, [pattern])).rows.map((r) => r.proname);

  const voidWriters = (await writers("update[[:space:]]+clara\\.staff_advances[[:space:]]+[a-z]*[[:space:]]*set"))
    .filter((n) => n !== "complete_staff_advance_particulars");
  assert.deepEqual(voidWriters, ["_adv_on_approve"],
    `exactly one body stamps the void columns (found: ${voidWriters.join(", ") || "none"})`);

  const appWriters = await writers("insert[[:space:]]+into[[:space:]]+clara\\.staff_advance_applications");
  assert.deepEqual(appWriters, ["_adv_on_approve"],
    `exactly one body mints application rows (found: ${appWriters.join(", ") || "none"})`);

  const births = await writers("insert[[:space:]]+into[[:space:]]+clara\\.staff_advances[^_]");
  assert.deepEqual(births, ["_adv_on_approve"],
    `exactly one body soft-births a register row (found: ${births.join(", ") || "none"})`);

  // …and the hook is reached from ONE splice, so "every mirror passes here" is structural.
  const hookCallers = (await rootQuery(
    `select distinct p.proname from pg_proc p
       cross join lateral unnest(string_to_array(p.prosrc, chr(10))) u(ln)
      where p.pronamespace = 'clara'::regnamespace
        and u.ln ~ 'perform clara\\._adv_on_approve\\(' order by 1`)).rows.map((r) => r.proname);
  assert.deepEqual(hookCallers, ["_subledger_on_approve"],
    `the advance hook has exactly one caller (found: ${hookCallers.join(", ") || "none"})`);
  noteLane("x42v.g4: one writer, one caller — the reversal re-ask sits on the only path every mirror of every producer takes");
});
