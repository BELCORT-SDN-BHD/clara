// ===========================================================================
// [WAVE D-b SPLIT — D-b3 (0044, the AF-2 composite + the bank_rule_suggested producer)] A FORK OF `x42-af2-rebook4.test.mjs`.
//
// FIX-WAVE RESIDUAL (CF-B3-1 / Codex CX1): 0044 CREATES the producer
// clara.accept_bank_rule_suggestion but WITHHOLDS its clara_authenticated grant until
// 0045's S2.9-b3, because its approve-time account-role door is a D-b2 body. The one cell
// of this file that calls the producer as an authenticated actor is therefore refused at
// the ROLE level (SQLSTATE 42501) at the D-b3 frontier and belongs to D-b2; its two
// siblings never touch the producer. THE SPLIT
// MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is byte-for-byte
// the block of the same name in x42-af2-rebook4.test.mjs; the prologue (imports, world
// builder, before/after, module-level helpers) is byte-for-byte the original's and
// is shared by every fork of this file. The ONLY authored bytes in this file are
// this banner.
//
// CELLS HERE (2): x42.af2-15d, x42.af2-15f
// CELLS IN THE SIBLING FORK(S): b2 → D-b2
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b013 (… + 0044)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-af2-rebook4.test.mjs lands with its own slice.
// ===========================================================================
// 0042 Wave D-b — the AF-2 ONE-STANDING-BOOKING battery, ROUND 5, PART 2:
// the doors that are NOT a line-member INSERT, and the ANTI-WALL bench.
//
// See x42-af2-rebook3.test.mjs for the lane law. Part 2 exists because the repo's
// 500-line-per-file gate is enforced, and because these three cells ask a
// different question from part 1's: not "does the law bind at this door" but
// "does it bind at the RIGHT MOMENT, and does it still let the honest human
// through". Round 5's own diagnosis was that a correctly-placed guard with a
// too-narrow predicate is still a point-fix — a guard that binds at only one of
// the two moments a line can be booked is the same defect in the time axis.
//
// Serial discipline: the package runs `node --test --test-concurrency=1`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { opk, endPool, printLaneNotes, printSkipCount, noteLane, HIGH_STAKES_CENTS } from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, caught, resolveAndBookBankLine,
  CLR10, BANKCOA, AR1, ADJX, REVN,
  af2World, freshAf2Client, bankLine, openException, plainAt,
  matchRow, matchIdOf, entryRowOf, approveEntry, entriesWithFlag,
  unmatchBankMatch, matchBankLine, completePendingMatch, signedCodingRule,
  acceptBankRuleSuggestion, stampedItem, birthCounterparty, uniq,
} from "./x42-af2-world.mjs";
import { glTotal, runRemedy } from "./x42-af2-rebook-kit.mjs";
import { bankLines, bankMovements, blockDetail } from "./x42-af2-rebook3-kit.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 ROUND-5 part-2 battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-af2-rebook4");
  printSkipCount("x42-af2-rebook4");
  await endPool();
});

// ===========================================================================
// x42.af2-15d — DOOR: clara.complete_pending_match, i.e. THE TIME AXIS.
//
// The law was asked on line-member INSERT only, on the reading that "an INSERT
// is the only event that puts a line into a group it was not already in". True,
// and it still left a window: a PARKED group's line member is INSERTed at park
// time and only UPDATEd at the flip, so an orphan that appears BETWEEN the two
// was never re-asked and the flip posted straight over it.
//
// THE REACHABLE CONSTRUCTOR, measured — and it needs no exotic door at all:
//   1. line L is matched with an entry plus a 500 difference adjustment; the
//      MATCH mints that adjustment, so it is L's own booking;
//   2. the group is released — the adjustment is now an orphan;
//   3. the adjustment is matched to the OTHER 500 line, so it stops being an
//      orphan and the law stops caring about it;
//   4. L is excepted and a high-stakes settlement is PARKED on it. The INSERT
//      check runs here and ADMITS it — correctly, since nothing is orphaned;
//   5. the other group is released. The adjustment is an orphan again.
//   6. the flip. An UPDATE. Never re-asked.
// Falsified on this build: with the ask reverted to INSERT-only the flip COMMITS
// and L carries 1,000,500 of bank GL for a 1,000,000 statement line.
// ===========================================================================
test("x42.af2-15d the flip re-asks the law: an orphan that appears DURING a park cannot be posted over at completion", async (t) => {
  if (skipAf2(t, live)) return;
  const owner = world.users.alice;
  const bob = world.users.bob;
  const grace = world.users.grace;
  const client = await freshAf2Client("rb4-d");
  const big = HIGH_STAKES_CENTS;
  const { lines, period } = await bankLines(owner, {
    client,
    specs: [
      { amountCents: big, description: "x42 r5d: the high-stakes deposit" },
      { amountCents: 500, description: "x42 r5d: the small deposit" },
    ],
  });
  const [L, M] = lines;

  const real = await plainAt(owner, {
    client, debit: BANKCOA, credit: REVN, cents: big - 500, postingDate: period.mid,
    memo: "x42 r5d: the real deposit entry",
  });
  const g1 = await matchBankLine(owner, {
    client, lines: [L.id], entries: [{ entry_id: real, matched_cents: big - 500 }],
    adjustments: [{ account_code: ADJX, amount_cents: 500, memo: "x42 r5d: rounding" }],
    opKey: opk("x42-r5d-g1"),
  });
  const adj = (await bankMovements(client)).find((m) => m.cents === 500 && m.entry_id !== real)?.entry_id;
  assert.ok(adj, "mandatory setup: the MATCH minted its own 500 adjustment entry");
  await unmatchBankMatch(owner, {
    client, match: matchIdOf(g1), reason: "x42 r5d: released", opKey: opk("x42-r5d-u1"),
  });
  const g2 = await matchBankLine(owner, {
    client, lines: [M.id], entries: [{ entry_id: adj, matched_cents: 500 }], opKey: opk("x42-r5d-g2"),
  });

  // THE PARK IS ADMITTED — and that admission is the whole evidence that an
  // INSERT-only guard could not have caught what follows. Nothing is orphaned
  // at this instant, so the INSERT-side check is RIGHT to let it through.
  const ex = await openException(owner, { client, line: L.id, reason: "x42 r5d: unidentified" });
  const cp = await birthCounterparty(owner, { client, name: `X42 R5D ${uniq()}`, kind: "customer" });
  const inv = await stampedItem(owner, {
    client, domain: "ar", cp, cpKind: "customer", cents: big, control: AR1,
    postingDate: period.mid, checker: bob,
  });
  const parked = await resolveAndBookBankLine(owner, {
    client, exception: ex, disposition: "matched_booking", note: "x42 r5d: parked settlement",
    allocations: [{ item_id: inv.item, amount_cents: big }], opKey: opk("x42-r5d-park"),
  });
  assert.equal((await matchRow(matchIdOf(parked))).status, "pending",
    "the PARK IS ADMITTED at INSERT time — nothing is orphaned yet, and the guard is right to pass it");

  const draft = await entryRowOf(parked.entry_id);
  await approveEntry(bob, {
    entry: parked.entry_id, expectedRevision: draft.revision_token, opKey: opk("x42-r5d-apr"),
  });
  // ...and NOW the orphan appears, after the only INSERT this line will ever see.
  await unmatchBankMatch(owner, {
    client, match: matchIdOf(g2), reason: "x42 r5d: the other line was wrong too", opKey: opk("x42-r5d-u2"),
  });

  const before = await glTotal(client, BANKCOA);
  const err = await caught(() => completePendingMatch(grace, {
    client, match: matchIdOf(parked), opKey: opk("x42-r5d-flip"),
  }));
  assert.ok(err, "the FLIP must be refused — the line would carry 1,000,500 of bank GL for a 1,000,000 line");
  assert.equal(err.code, CLR10, `the refusal is CLR10 (got ${err.code}: ${err.message})`);
  const d = blockDetail(err, "x42.af2-15d");
  assert.equal(d.bookings[0].entry_id, adj, "…naming the adjustment the earlier match minted");
  assert.equal(d.bookings[0].caused_by, "born_in_the_booking_act",
    "…and saying WHY it is this line's to answer for");
  assert.equal(await glTotal(client, BANKCOA), before, "THE MONEY: the refused flip moved nothing");
  assert.equal((await matchRow(matchIdOf(parked))).status, "pending",
    "…and the reservation is still parked, so the human can still cancel or fix it");

  // AND THE FLIP IS NOT WALLED: unwind the orphan and the same flip succeeds.
  await runRemedy(owner, client, d.bookings[0].remedy_calls, "x42.af2-15d", { checker: bob });
  const flipped = await completePendingMatch(grace, {
    client, match: matchIdOf(parked), opKey: opk("x42-r5d-flip2"),
  });
  assert.ok(flipped, "once the orphan is unwound the reservation completes");
  assert.equal((await matchRow(matchIdOf(parked))).status, "live", "…and the group goes live");
});

// ===========================================================================
// x42.af2-15f — WHAT THE FIX DID NOT THINK OF, ASKED AS A CELL (WDB-R4).
//
// Round 5 widened BOTH the gate (to unconditional) and the subject (to "the line
// caused this entry"). The obvious over-reach of that pair is to start refusing
// ordinary bookkeeping, and the causal test — "the entry is not older than the
// group that bound it to the line" — is precisely where an over-reach would
// hide. Four flows that MUST stay open, each one a thing a Malaysian bookkeeper
// does on an ordinary Tuesday:
//   (a) a mis-match of a REAL pre-existing entry, corrected — 14g's law, now
//       asked on a line that never carried an exception at all, which is where
//       the corridor gate used to do the work;
//   (b) unmatch and re-match THE SAME entry (fat-finger on the amount);
//   (c) a line whose earlier booking was properly REVERSED is bookable again;
//   (d) two identical deposits: the entry mis-assigned to line 1 and then
//       matched to line 2 does not block line 1.
// ===========================================================================
test("x42.af2-15f the widened law does not wall in ordinary bookkeeping: four flows that must stay open", async (t) => {
  if (skipAf2(t, live)) return;
  const owner = world.users.alice;
  const bob = world.users.bob;
  // ONE CLIENT PER PART, deliberately: the second bank account of a client gets
  // its own spare chart code (the fixture's own one-active-account-per-COA law),
  // and every hand-draft in this suite books its bank leg on BANKCOA.
  const client = await freshAf2Client("rb4-fa");

  // (a) + (b) — a mis-match of a pre-existing entry on an UNEXCEPTED line.
  const a = await bankLine(owner, { client, amountCents: 27_000, description: "x42 r5f(a): deposit" });
  const real = await plainAt(owner, {
    client, debit: BANKCOA, credit: REVN, cents: 27_000, postingDate: a.period.mid,
    memo: "x42 r5f: a real deposit that belongs to ANOTHER line",
  });
  const m1 = await matchBankLine(owner, {
    client, lines: [a.line.id], entries: [{ entry_id: real, matched_cents: 27_000 }],
    opKey: opk("x42-r5f-m1"),
  });
  await unmatchBankMatch(owner, {
    client, match: matchIdOf(m1), reason: "x42 r5f: wrong line", opKey: opk("x42-r5f-u1"),
  });
  // (b) the SAME entry goes back on — non-orphaned at commit, so never blocking.
  const m2 = await matchBankLine(owner, {
    client, lines: [a.line.id], entries: [{ entry_id: real, matched_cents: 27_000 }],
    opKey: opk("x42-r5f-m2"),
  });
  assert.equal((await matchRow(matchIdOf(m2))).status, "live",
    "(b) unmatch-then-rematch of the SAME entry is ordinary correction and must commit");
  await unmatchBankMatch(owner, {
    client, match: matchIdOf(m2), reason: "x42 r5f: released again", opKey: opk("x42-r5f-u2"),
  });
  // (a) a DIFFERENT booking of the same line, with the real entry left standing.
  const ex = await openException(owner, { client, line: a.line.id, reason: "x42 r5f: bank error" });
  const booked = await resolveAndBookBankLine(owner, {
    client, exception: ex, disposition: "matched_booking", note: "x42 r5f: the real booking",
    draft: {
      posting_date: a.period.mid, memo: "x42 r5f booking",
      lines: [
        { account_code: BANKCOA, debit_cents: 27_000, credit_cents: 0, description: "dr bank" },
        { account_code: REVN, debit_cents: 0, credit_cents: 27_000, description: "cr revenue" },
      ],
    },
    opKey: opk("x42-r5f-book"),
  });
  assert.ok(matchIdOf(booked),
    "(a) a PRE-EXISTING entry that outlived a mis-match is genuinely outstanding and must NOT wall the line");
  assert.equal((await entryRowOf(real)).status, "approved", "…and it is still approved, untouched");

  // (c) a booking that was properly reversed leaves the line bookable.
  const clientC = await freshAf2Client("rb4-fc");
  const c = await bankLine(owner, { client: clientC, amountCents: 12_000, description: "x42 r5f(c): deposit" });
  const cEx = await openException(owner, { client: clientC, line: c.line.id, reason: "x42 r5f(c): unidentified" });
  const first = await resolveAndBookBankLine(owner, {
    client: clientC, exception: cEx, disposition: "matched_booking", note: "x42 r5f(c): first",
    draft: {
      posting_date: c.period.mid, memo: "x42 r5f(c) one",
      lines: [
        { account_code: BANKCOA, debit_cents: 12_000, credit_cents: 0, description: "dr bank" },
        { account_code: REVN, debit_cents: 0, credit_cents: 12_000, description: "cr revenue" },
      ],
    },
    opKey: opk("x42-r5f-c1"),
  });
  const released = await unmatchBankMatch(owner, {
    client: clientC, match: matchIdOf(first), reason: "x42 r5f(c): released", opKey: opk("x42-r5f-cu"),
  });
  assert.equal(released.booking_outstanding?.blocking, true,
    "the release reports the standing booking before the human tries again");
  await runRemedy(owner, clientC, released.booking_outstanding.bookings[0].remedy_calls,
    "x42.af2-15f(c)", { checker: bob });
  const second = await resolveAndBookBankLine(owner, {
    client: clientC, exception: cEx, disposition: "matched_booking", note: "x42 r5f(c): corrected",
    draft: {
      posting_date: c.period.mid, memo: "x42 r5f(c) two",
      lines: [
        { account_code: BANKCOA, debit_cents: 12_000, credit_cents: 0, description: "dr bank" },
        { account_code: REVN, debit_cents: 0, credit_cents: 12_000, description: "cr revenue" },
      ],
    },
    opKey: opk("x42-r5f-c2"),
  });
  assert.ok(matchIdOf(second), "(c) once REVERSED, the same line books again");

  // (d) two identical deposits: the entry that found its real line does not
  // block the first one. The `orphaned` test is what carries this, not the gate.
  const clientD = await freshAf2Client("rb4-fd");
  const two = await bankLines(owner, {
    client: clientD,
    specs: [
      { amountCents: 8_000, description: "x42 r5f(d): deposit one" },
      { amountCents: 8_000, description: "x42 r5f(d): deposit two" },
    ],
  });
  const [d1, d2] = two.lines;
  const shared = await plainAt(owner, {
    client: clientD, debit: BANKCOA, credit: REVN, cents: 8_000, postingDate: two.period.mid,
    memo: "x42 r5f(d): the deposit that was mis-assigned",
  });
  const wrong = await matchBankLine(owner, {
    client: clientD, lines: [d1.id], entries: [{ entry_id: shared, matched_cents: 8_000 }],
    opKey: opk("x42-r5f-d1"),
  });
  await unmatchBankMatch(owner, {
    client: clientD, match: matchIdOf(wrong), reason: "x42 r5f(d): belongs to deposit two", opKey: opk("x42-r5f-du"),
  });
  await matchBankLine(owner, {
    client: clientD, lines: [d2.id], entries: [{ entry_id: shared, matched_cents: 8_000 }],
    opKey: opk("x42-r5f-d2"),
  });
  const fresh = await plainAt(owner, {
    client: clientD, debit: BANKCOA, credit: REVN, cents: 8_000, postingDate: two.period.mid,
    memo: "x42 r5f(d): the entry deposit one really wanted",
  });
  const okd = await matchBankLine(owner, {
    client: clientD, lines: [d1.id], entries: [{ entry_id: fresh, matched_cents: 8_000 }],
    opKey: opk("x42-r5f-d3"),
  });
  assert.equal((await matchRow(matchIdOf(okd))).status, "live",
    "(d) the entry that found its real line is NOT an orphan, so it never blocks the line it left");
});
