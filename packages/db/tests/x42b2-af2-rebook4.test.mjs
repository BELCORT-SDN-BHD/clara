// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x42-af2-rebook4.test.mjs`.
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
// CELLS HERE (1): x42.af2-15e
// CELLS IN THE SIBLING FORK(S): b3 → D-b3
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
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
// x42.af2-15e — DOOR: clara.accept_bank_rule_suggestion + clara.approve_entry.
//
// This entry is in NO GROUP AT ALL — accept mints a DRAFT and matches nothing —
// so every group-keyed subject in three rounds was blind to it. It is still the
// line's own booking: the flag it carries names the line. The producer's own
// dedup precheck already says an approved-but-unmatched suggestion "is still an
// outstanding claim on this bank movement"; that sentence has to bind the OTHER
// doors too, or the claim is only enforced against a second accept.
//
// AND THE HONEST PATH MUST SURVIVE: matching that very entry to its own line is
// the whole point of the feature, and it must still commit.
// ===========================================================================
test("x42.af2-15e an APPROVED rule-suggested entry blocks any OTHER booking of its line — and still matches to its own", async (t) => {
  if (skipAf2(t, live)) return;
  const owner = world.users.alice;
  const bob = world.users.bob;
  const grace = world.users.grace;
  const client = await freshAf2Client("rb4-e");
  const rw = await signedCodingRule({
    client, owner, proposer: grace, lineCount: 4, amountCents: -42_000,
  });
  const L = rw.lines[0];
  await acceptBankRuleSuggestion(grace, { client, line: L.id, rule: rw.rule });
  const suggested = (await entriesWithFlag(client, "bank_rule_suggested"))[0];
  const row = await entryRowOf(suggested.id);
  await approveEntry(bob, {
    entry: suggested.id, expectedRevision: row.revision_token, opKey: opk("x42-r5e-apr"),
  });
  assert.equal((await entryRowOf(suggested.id)).status, "approved",
    "mandatory setup: the suggestion is APPROVED and in no match at all");
  assert.equal(await glTotal(client, BANKCOA), -42_000, "…and the bank GL has already moved");

  const other = await plainAt(owner, {
    client, debit: REVN, credit: BANKCOA, cents: 42_000, postingDate: rw.period.mid,
    memo: "x42 r5e: a SECOND booking of the same line",
  });
  const err = await caught(() => matchBankLine(owner, {
    client, lines: [L.id], entries: [{ entry_id: other, matched_cents: -42_000 }],
    opKey: opk("x42-r5e-m1"),
  }));
  assert.ok(err, "matching a DIFFERENT entry to a line whose suggestion is already approved must be refused");
  const d = blockDetail(err, "x42.af2-15e");
  assert.equal(d.bookings[0].entry_id, suggested.id, "…naming the suggested entry");
  assert.equal(d.bookings[0].caused_by, "line_stamped_at_birth",
    "…and saying it is the line's own by the stamp the producer wrote, not by any group");
  assert.equal(d.bookings[0].match_id, null, "…which is exactly why no group-keyed subject could see it");

  // THE HONEST PATH. Matching the suggested entry to ITS OWN line makes it
  // non-orphaned at commit and must commit — a refusal here would wall in the
  // feature's only happy path.
  const ok = await matchBankLine(owner, {
    client, lines: [L.id], entries: [{ entry_id: suggested.id, matched_cents: -42_000 }],
    opKey: opk("x42-r5e-m2"),
  });
  assert.ok(matchIdOf(ok), "the suggested entry still matches to its OWN line");
  assert.equal((await matchRow(matchIdOf(ok))).status, "live", "…as a live group");
});
