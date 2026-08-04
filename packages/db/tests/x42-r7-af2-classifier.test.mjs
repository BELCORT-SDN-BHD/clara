// 0042 Wave D-b — the AF-2 CAUSAL-CLASSIFIER battery, AS-BUILT LADDER ROUND 7.
//
// THE LANE LAW. clara._wdb_line_booking_block decides which approved entries a
// statement line must answer for. Rounds 4 and 5 widened its SUBJECT; round 7
// changed the EVIDENCE, because the primary disjunct was a clock:
//
//     je.created_at >= bm.created_at   -- "you cannot match an entry that does
//                                         not exist yet"
//
// `created_at` defaults to now() on BOTH tables, and now() is the
// TRANSACTION-START timestamp, not the instant of the write. Inside one
// transaction the comparison is sound; across two it is false in the direction
// that hurts. A booking transaction that opens at 10:00 stamps its group 10:00,
// so an entry a DIFFERENT session committed at 10:01 and this transaction
// matched at 10:02 reads as "born inside the booking act" — and after a release
// it becomes a BLOCKING orphan whose named remedy is "reverse that entry",
// about an entry that belongs to the next deposit on the same statement.
//
// The fix derives causation from what the booking act RECORDED: the group's own
// append-only clara.bank_match_audit rows, read through the three keys that can
// only ever name an entry the act CREATED (settlement_entry_id, charge_entry_id,
// adjustment_entry_ids) — clara._wdb_born_in_booking_act. These cells assert the
// LAW, not the implementation: a verdict that does not move when the clocks do,
// and a double that stays refused from both legs of the composite.
//
// Serial discipline: the package runs `node --test --test-concurrency=1`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { opk, endPool, printLaneNotes, printSkipCount, noteLane } from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, caught, CLR10, BANKCOA, REVN, AR1,
  af2World, freshAf2Client, freshBankAccount, nextPeriod, enterStatement,
  bankLine, openException, plainAt, stampedItem, birthCounterparty,
  resolveAndBookBankLine, settleFromBankLine, matchBankLine, unmatchBankMatch,
  completePendingMatch, approveEntry, entryRowOf, matchRow, matchIdOf,
  getBankReconciliation, rootQuery, inOneHumanTxn, uniq,
} from "./x42-af2-world.mjs";
import { glTotal, runRemedy, twoLegDraft } from "./x42-af2-rebook-kit.mjs";
import { blockDetail } from "./x42-af2-rebook3-kit.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 ROUND-7 classifier battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-r7-af2-classifier");
  printSkipCount("x42-r7-af2-classifier");
  await endPool();
});

/** The shared verdict, read straight off the one authority every enforcer asks.
 *  Root, because the predicate is granted to nobody — the enforcers are the
 *  callers and this is the instrument, not the lane under test. */
const blockOf = async (line) =>
  (await rootQuery("select clara._wdb_line_booking_block($1, null, null) as b", [line])).rows[0].b;

/** Every reconciliation term a professional would look at, in one read. */
const reconOf = async (sub, statement) => {
  const r = await getBankReconciliation(sub, { statement });
  return {
    difference: Number(r.difference_cents), can_complete: r.can_complete,
    blockers: r.blockers ?? [], raw: r,
  };
};

// ===========================================================================
// x42.r7-af2-1 — THE DEFECT ITSELF: a genuinely pre-existing entry, committed
// by ANOTHER session while the booking transaction was open.
//
// Two 42,000 deposits land on ONE statement. Session A opens a transaction,
// session B commits a real entry inside it, and session A then matches that
// entry to the FIRST line — the ordinary human mistake the 14g/15f ruling
// protects: the entry actually belongs to the SECOND deposit. After the
// release, the first line must be bookable to its own entry, and the entry must
// be free to clear against the line it really belongs to.
//
// Under the clock the entry read as born-in-the-act (22:58:57.691 against a
// group stamped 22:58:57.658 — the transaction's start, 33ms earlier), the
// verdict came back blocking, and the composed remedy said "reverse it".
// ===========================================================================
test("x42.r7-af2-1 an entry another session committed DURING a long booking transaction is NOT the line's own booking", async (t) => {
  if (skipAf2(t, live)) return;
  const alice = world.users.alice, bob = world.users.bob;
  const client = await freshAf2Client("r7c1");
  const acct = await freshBankAccount(alice, client);
  const p = nextPeriod();
  const stmt = await enterStatement(alice, {
    client, bankAccount: acct, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: [
      { amountCents: 42_000, entryDate: p.mid, description: "r7 deposit ONE" },
      { amountCents: 42_000, entryDate: p.mid, description: "r7 deposit TWO" },
    ],
  });
  const [L1, L2] = [stmt.lines[0].id, stmt.lines[1].id];

  let entry = null, group = null;
  await inOneHumanTxn(alice, async (q) => {
    // The transaction is OPEN: now() is pinned here for every default it writes.
    await q("select now()");
    // ...and ANOTHER session commits a genuine entry inside that window.
    entry = await plainAt(alice, {
      client, debit: BANKCOA, credit: REVN, cents: 42_000, postingDate: p.mid,
      memo: "r7: a genuine deposit that belongs to line TWO", checker: bob,
    });
    const r = await q(
      `select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb,
              p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as result`,
      [client, JSON.stringify([L1]), JSON.stringify([{ entry_id: entry, matched_cents: 42_000 }]),
        opk("r7c1-m")]);
    group = matchIdOf(r.rows[0].result);
  });

  // THE PREMISE THE OLD LAW READ, measured rather than assumed: the entry IS
  // stamped later than the group it was matched into, because the group carries
  // the transaction's start time.
  const st = (await rootQuery(
    `select (select e.created_at from clara.journal_entries e where e.id=$1) as entry_at,
            (select bm.created_at from clara.bank_matches bm where bm.id=$2) as match_at`,
    [entry, group])).rows[0];
  assert.ok(st.entry_at >= st.match_at,
    "mandatory setup: the entry's stamp is NOT older than the group's — the clock says 'born in the act'");

  // ...AND THE CLASSIFIER IS NOT FOOLED BY IT, live or released.
  assert.equal(await rootQuery("select clara._wdb_born_in_booking_act($1,$2) as b", [group, entry])
    .then((r) => r.rows[0].b), false,
    "the booking act recorded creating no such entry, so it created none");

  await unmatchBankMatch(bob, { client, match: group, reason: "r7: wrong line", opKey: opk("r7c1-u") });
  assert.equal(await blockOf(L1), null,
    "a released match to a PRE-EXISTING entry leaves the line with nothing to answer for");

  // THE TWO LAWFUL ACTS. Both must be admitted, and the second is the one the
  // old refusal's remedy actively argued against.
  const own = await plainAt(alice, {
    client, debit: BANKCOA, credit: REVN, cents: 42_000, postingDate: p.mid,
    memo: "r7: the entry line ONE really wants", checker: bob,
  });
  const g1 = await matchBankLine(alice, {
    client, lines: [L1], entries: [{ entry_id: own, matched_cents: 42_000 }], opKey: opk("r7c1-m2"),
  });
  assert.equal((await matchRow(matchIdOf(g1))).status, "live", "line ONE books to its own entry");
  const g2 = await matchBankLine(alice, {
    client, lines: [L2], entries: [{ entry_id: entry, matched_cents: 42_000 }], opKey: opk("r7c1-m3"),
  });
  assert.equal((await matchRow(matchIdOf(g2))).status, "live",
    "…and the entry clears against the statement line it really belongs to");
  assert.equal(await glTotal(client, BANKCOA), 84_000,
    "THE MONEY: two 42,000 deposits, two bookings, 84,000 of bank GL — no double, no block");
});

// ===========================================================================
// x42.r7-af2-2 — THE DOUBLE STAYS REFUSED FROM THE SETTLEMENT LEG, and the
// receipt never certifies a doubled line. This is round 5's own subject
// (settle → unmatch → settle) re-asked against the structural evidence: the
// settlement entry carries NO flag naming the line and is NOT the group's
// draft_entry_id on the live branch, so the clock was the only thing holding it
// before. clara.bank_match_audit's 'settle' row names it as settlement_entry_id.
// ===========================================================================
test("x42.r7-af2-2 settle → unmatch → settle stays refused on the audit record alone, and the receipt never certifies the double", async (t) => {
  if (skipAf2(t, live)) return;
  const alice = world.users.alice, bob = world.users.bob;
  const client = await freshAf2Client("r7c2");
  const bl = await bankLine(alice, { client, amountCents: 42_000, description: "r7 settle deposit" });
  const cp = await birthCounterparty(alice, { client, name: `R7 C2 ${uniq()}`, kind: "customer" });
  const inv = await stampedItem(alice, {
    client, domain: "ar", cp, cpKind: "customer", cents: 42_000, control: AR1,
    postingDate: bl.period.mid, checker: bob,
  });
  const s1 = await settleFromBankLine(alice, {
    client, line: bl.line.id, counterparty: cp,
    allocations: [{ item_id: inv.item, amount_cents: 42_000 }],
    memo: "r7: the ABC receipt", postingDate: bl.period.mid, opKey: opk("r7c2-s1"),
  });
  const g1 = matchIdOf(s1);
  assert.equal((await matchRow(g1)).status, "live", "mandatory setup: the settlement lands live");
  assert.equal((await reconOf(alice, bl.statement)).difference, 0, "the receipt ties after the settlement");

  // THE EVIDENCE, named: no flag on the entry, not the group's draft — only the
  // act's own record.
  const e1 = await entryRowOf(s1.entry_id);
  assert.equal(e1.flags?.bank_match ?? null, null,
    "the settlement entry carries NO bank_match birth stamp — the flags disjunct cannot see it");
  assert.equal((await matchRow(g1)).draft_entry_id, null,
    "…and a LIVE settlement is not anchored as a draft either");
  assert.equal(await rootQuery("select clara._wdb_born_in_booking_act($1,$2) as b", [g1, s1.entry_id])
    .then((r) => r.rows[0].b), true,
    "…so the group's own 'settle' record is the whole evidence, and it holds");

  await unmatchBankMatch(bob, { client, match: g1, reason: "r7: not this deposit", opKey: opk("r7c2-u") });
  const d = await blockOf(bl.line.id);
  assert.equal(d.blocking, true, "the released settlement is a standing booking on this line");
  assert.equal(d.bookings[0].entry_id, s1.entry_id, "…named");
  assert.equal(d.bookings[0].caused_by, "born_in_the_booking_act",
    "…and labelled by the act that built it, not by a clock");

  const inv2 = await stampedItem(alice, {
    client, domain: "ar", cp, cpKind: "customer", cents: 42_000, control: AR1,
    postingDate: bl.period.mid, checker: bob,
  });
  const before = await glTotal(client, BANKCOA);
  // The receipt with the booking RELEASED, read before the refusal so the refusal
  // can be shown to have moved nothing a professional would sign. It is NOT 0
  // here and must not be: the line is genuinely unexplained again while its
  // standing entry sits outside every group, which is exactly the state the
  // release created and the state the human is being asked to fix.
  const released = await reconOf(alice, bl.statement);
  noteLane(`x42.r7-af2-2: released receipt difference=${released.difference} can_complete=${released.can_complete}`);
  const err = await caught(() => settleFromBankLine(alice, {
    client, line: bl.line.id, counterparty: cp,
    allocations: [{ item_id: inv2.item, amount_cents: 42_000 }],
    memo: "r7: the SECOND booking of one deposit", postingDate: bl.period.mid, opKey: opk("r7c2-s2"),
  }));
  assert.ok(err, "the second settlement of one statement line is refused");
  assert.equal(err.code, CLR10, `…as CLR10 (got ${err.code}: ${err.message})`);
  blockDetail(err, "x42.r7-af2-2");
  assert.equal(await glTotal(client, BANKCOA), before, "THE MONEY: the refused settle moved nothing");
  const after = await reconOf(alice, bl.statement);
  assert.equal(after.difference, released.difference,
    "…and the refused act moved nothing the receipt reports either");

  // AND IT IS NOT A WALL: the composed remedy unwinds it and the same settle lands.
  await runRemedy(alice, client, d.bookings[0].remedy_calls, "x42.r7-af2-2", { checker: bob });
  const s2 = await settleFromBankLine(alice, {
    client, line: bl.line.id, counterparty: cp,
    allocations: [{ item_id: inv2.item, amount_cents: 42_000 }],
    memo: "r7: the corrected receipt", postingDate: bl.period.mid, opKey: opk("r7c2-s3"),
  });
  assert.equal((await matchRow(matchIdOf(s2))).status, "live", "the corrected settlement lands");
  assert.equal(await glTotal(client, BANKCOA), 42_000,
    "THE MONEY: one 42,000 deposit carries 42,000 of bank GL — exactly once");
  const rec = await reconOf(alice, bl.statement);
  assert.equal(rec.difference, 0, "…and the receipt ties at 0 at the end of the chain");
  assert.deepEqual(rec.blockers, [], "…with nothing outstanding against it");
});

// ===========================================================================
// x42.r7-af2-3 — BOTH LEGS OF THE COMPOSITE THROUGH unmatch → reopen →
// re-resolve, each GL line carried EXACTLY ONCE, with the receipt read at every
// step. The hand-draft leg's entry is held by resolution_exception_id; the
// SETTLEMENT leg's is held by the audit record — and the parked leg adds the
// flip, whose settlement was recorded under 'settle_pending'.
// ===========================================================================
test("x42.r7-af2-3 both composite legs survive unmatch → reopen → re-resolve carrying each line exactly once", async (t) => {
  if (skipAf2(t, live)) return;
  const alice = world.users.alice, bob = world.users.bob;

  // ---------------- LEG 1 — THE HAND-DRAFT LEG ----------------
  const c1 = await freshAf2Client("r7c3hd");
  const bl = await bankLine(alice, { client: c1, amountCents: 42_000, description: "r7 unidentified credit" });
  const ex1 = await openException(alice, { client: c1, line: bl.line.id, reason: "r7: unidentified" });
  const r1 = await resolveAndBookBankLine(alice, {
    client: c1, exception: ex1, disposition: "matched_booking", note: "r7: booked",
    draft: twoLegDraft(bl.period.mid, "r7 booking one", 42_000), opKey: opk("r7c3-b1"),
  });
  assert.equal((await reconOf(alice, bl.statement)).difference, 0, "leg 1 ties after the booking");

  const u1 = await unmatchBankMatch(bob, {
    client: c1, match: matchIdOf(r1), reason: "r7: wrong", opKey: opk("r7c3-u1"),
  });
  assert.equal(u1.booking_outstanding?.blocking, true, "the release names the standing booking");
  const dbl1 = await caught(() => resolveAndBookBankLine(alice, {
    client: c1, exception: ex1, disposition: "matched_booking", note: "r7: second booking",
    draft: twoLegDraft(bl.period.mid, "r7 booking two", 42_000), opKey: opk("r7c3-b2"),
  }));
  assert.ok(dbl1, "LEG 1: the second booking of one line is refused while the first stands");
  await runRemedy(alice, c1, u1.booking_outstanding.bookings[0].remedy_calls, "x42.r7-af2-3 leg1", { checker: bob });
  await resolveAndBookBankLine(alice, {
    client: c1, exception: ex1, disposition: "matched_booking", note: "r7: corrected booking",
    draft: twoLegDraft(bl.period.mid, "r7 booking three", 42_000), opKey: opk("r7c3-b3"),
  });
  assert.equal(await glTotal(c1, BANKCOA), 42_000, "LEG 1: the bank GL carries the line EXACTLY once");
  const rec1 = await reconOf(alice, bl.statement);
  assert.equal(rec1.difference, 0, "LEG 1: the receipt ties at 0 at the end");
  assert.deepEqual(rec1.blockers, [], "LEG 1: …with no blockers");

  // ---------------- LEG 2 — THE SETTLEMENT LEG, THROUGH THE PARK ----------------
  const c2 = await freshAf2Client("r7c3st");
  const cents = 42_000;
  const bl2 = await bankLine(alice, { client: c2, amountCents: cents, description: "r7 the ABC deposit" });
  const cp = await birthCounterparty(alice, { client: c2, name: `R7 C3 ${uniq()}`, kind: "customer" });
  const inv = await stampedItem(alice, {
    client: c2, domain: "ar", cp, cpKind: "customer", cents, control: AR1,
    postingDate: bl2.period.mid, checker: bob,
  });
  const ex2 = await openException(alice, { client: c2, line: bl2.line.id, reason: "r7: unidentified deposit" });
  const r2 = await resolveAndBookBankLine(alice, {
    client: c2, exception: ex2, disposition: "matched_booking", note: "r7: settled",
    allocations: [{ item_id: inv.item, amount_cents: cents }], opKey: opk("r7c3-s1"),
  });
  const g2 = matchIdOf(r2);
  assert.equal((await matchRow(g2)).status, "live", "mandatory setup: below threshold the leg lands live");
  assert.equal((await reconOf(alice, bl2.statement)).difference, 0, "leg 2 ties after the settlement");

  const u2 = await unmatchBankMatch(bob, {
    client: c2, match: g2, reason: "r7: someone else's", opKey: opk("r7c3-u2"),
  });
  assert.equal(u2.booking_outstanding?.blocking, true,
    "LEG 2: the release names the settlement the act built — on the audit record alone");
  const inv2 = await stampedItem(alice, {
    client: c2, domain: "ar", cp, cpKind: "customer", cents, control: AR1,
    postingDate: bl2.period.mid, checker: bob,
  });
  const dbl2 = await caught(() => resolveAndBookBankLine(alice, {
    client: c2, exception: ex2, disposition: "matched_booking", note: "r7: re-settled",
    allocations: [{ item_id: inv2.item, amount_cents: cents }], opKey: opk("r7c3-s2"),
  }));
  assert.ok(dbl2, "LEG 2: the second settlement of one line is refused while the first stands");
  assert.equal(await glTotal(c2, BANKCOA), cents, "LEG 2: the refused re-settle moved nothing");

  await runRemedy(alice, c2, u2.booking_outstanding.bookings[0].remedy_calls, "x42.r7-af2-3 leg2", { checker: bob });
  const r2b = await resolveAndBookBankLine(alice, {
    client: c2, exception: ex2, disposition: "matched_booking", note: "r7: corrected settlement",
    allocations: [{ item_id: inv2.item, amount_cents: cents }], opKey: opk("r7c3-s3"),
  });
  assert.ok(matchIdOf(r2b), "LEG 2: the corrected settlement lands");
  assert.equal(await glTotal(c2, BANKCOA), cents,
    "LEG 2: the bank GL carries the deposit EXACTLY once");
  const rec2 = await reconOf(alice, bl2.statement);
  assert.equal(rec2.difference, 0, "LEG 2: the receipt ties at 0 at the end");
  assert.deepEqual(rec2.blockers, [], "LEG 2: …with no blockers");
});

// ===========================================================================
// x42.r7-af2-4 — THE FLIP'S OWN GRAIN. A parked settlement is recorded under
// 'settle_pending' and posted by clara.complete_pending_match in a LATER
// transaction. The entry is created in transaction 1 and the group's status
// moves in transaction 2 — the exact shape where "same transaction" reasoning
// of any kind (clock or otherwise) has nothing to say. The record does.
// ===========================================================================
test("x42.r7-af2-4 a FLIPPED parked settlement is still the line's own booking after its release", async (t) => {
  if (skipAf2(t, live)) return;
  const alice = world.users.alice, bob = world.users.bob, grace = world.users.grace;
  const client = await freshAf2Client("r7c4");
  const cents = 42_000;
  const bl = await bankLine(alice, { client, amountCents: cents, description: "r7 parked deposit" });
  const cp = await birthCounterparty(alice, { client, name: `R7 C4 ${uniq()}`, kind: "customer" });
  const inv = await stampedItem(alice, {
    client, domain: "ar", cp, cpKind: "customer", cents, control: AR1,
    postingDate: bl.period.mid, checker: bob,
  });
  // The WCA-R7 park is reached by ATTESTING nothing and letting the settlement
  // land as a draft: `p_attestation` null on a self-approval leaves the entry
  // for a checker. The composite's park is the high-stakes branch, so this cell
  // uses the ordinary settle door, which parks on the same rule.
  const s = await settleFromBankLine(alice, {
    client, line: bl.line.id, counterparty: cp,
    allocations: [{ item_id: inv.item, amount_cents: cents }],
    memo: "r7: parked receipt", postingDate: bl.period.mid, opKey: opk("r7c4-s1"),
  });
  const g = matchIdOf(s);
  const row = await matchRow(g);
  if (row.status === "pending") {
    const dr = await entryRowOf(s.entry_id);
    await approveEntry(bob, { entry: s.entry_id, expectedRevision: dr.revision_token, opKey: opk("r7c4-a") });
    await completePendingMatch(grace, { client, match: g, opKey: opk("r7c4-f") });
    assert.equal((await matchRow(g)).status, "live", "mandatory setup: the reservation flipped live");
  }
  await unmatchBankMatch(bob, { client, match: g, reason: "r7: released after the flip", opKey: opk("r7c4-u") });

  const d = await blockOf(bl.line.id);
  assert.equal(d.blocking, true,
    "a settlement posted across TWO transactions is still the line's own booking after its release");
  assert.equal(d.bookings[0].entry_id, s.entry_id, "…named");

  const other = await plainAt(alice, {
    client, debit: BANKCOA, credit: REVN, cents, postingDate: bl.period.mid,
    memo: "r7: a SECOND booking of the flipped line", checker: bob,
  });
  const before = await glTotal(client, BANKCOA);
  const err = await caught(() => matchBankLine(alice, {
    client, lines: [bl.line.id], entries: [{ entry_id: other, matched_cents: cents }],
    opKey: opk("r7c4-m"),
  }));
  assert.ok(err, "…so a second booking of that line is refused");
  blockDetail(err, "x42.r7-af2-4");
  assert.equal(await glTotal(client, BANKCOA), before, "THE MONEY: the refused match moved nothing");
});
