// 0042 Wave D-b — the AF-2 ONE-STANDING-BOOKING battery, ROUND 5, PART 1.
//
// WHY A THIRD FILE. Round 3 put the law in one VERB; round 4 moved it to the one
// ROW every booking door writes — the right home — and it STILL leaked, because
// the GATE in front of it and the SUBJECT inside it were each NARROWER than the
// invariant they were written to serve:
//
//   * the GATE (`v_corridor`) opened only for a line whose exception is OPEN or
//     resolved as matched_booking / written_off_adjustment. `bank_corrective_line`
//     is the THIRD ratified disposition, and a line carrying it — or carrying no
//     exception at all — was outside the corridor entirely, so the law was never
//     even asked;
//   * the SUBJECT (`bm.resolution_exception_id is not null`) covered only groups
//     that discharged an EXCEPTION, on the argument that "an ordinary match to a
//     pre-existing entry is not the harm class". True — but a SETTLEMENT entry is
//     not pre-existing: it is a booking the statement line itself CAUSED. So
//     settle → unmatch → settle posts the same bank movement twice with nothing
//     in its path.
//
// Both reproduce the round-3 headline exactly: 2x bank GL on ONE statement line,
// absorbed by clara.get_bank_reconciliation as an outstanding entry so the
// receipt still ties at difference 0 and `can_complete` stays TRUE. The
// instrument a professional would trust CERTIFIES the doubled state.
//
// THE CELLS ARE PER DOOR, NOT PER FIX (round 5's own diagnosis of why two rounds
// of repair kept missing the next door): every public body that can book, match,
// unmatch, except or resolve a line gets its own cell, whether or not the current
// fix touches it.
//
// CONTRACT-BLIND lane discipline: every refusal is asserted by its DETAIL reason
// token; a divergence is a FINDING. Serial: `node --test --test-concurrency=1`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { opk, endPool, printLaneNotes, printSkipCount, noteLane } from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, refusesWithCode, caught, resolveAndBookBankLine,
  CLR10, BANKCOA, ADJX,
  af2World, freshAf2Client, bankLine, openException, plainAt, resolveException,
  exceptionRow, groupsOfLine, matchRow, matchIdOf, entryRowOf,
  unmatchBankMatch, matchBankLine, assertEnvelope,
} from "./x42-af2-world.mjs";
import { glTotal, twoLegDraft, runRemedy } from "./x42-af2-rebook-kit.mjs";
import { bankLines, settleLine, bankMovements, blockDetail } from "./x42-af2-rebook3-kit.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 ROUND-5 battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-af2-rebook3");
  printSkipCount("x42-af2-rebook3");
  await endPool();
});

// ===========================================================================
// x42.af2-15a — DOOR: clara.settle_from_bank_line (both overloads reach the same
// core). NO EXCEPTION IS EVER INVOLVED, which is exactly why round 4 could not
// see it: the gate never opened and the subject never matched.
//
// A settlement is not a pre-existing entry. The statement line CAUSED it. Releasing
// the group does not un-approve it — unmatch_bank_match says so in its own note —
// so a second settle books the same bank movement again: 84,000 of bank GL for one
// 42,000 deposit, in TWO entries, with the receipt still tying at zero.
// ===========================================================================
test("x42.af2-15a settle → unmatch → settle cannot post the same statement line twice, with no exception anywhere in the story", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const checker = world.users.bob;
  const client = await freshAf2Client("rb3-a");
  const { line, period } = await bankLine(sub, {
    client, amountCents: 42_000, description: "x42 r5a: the 42,000 deposit",
  });

  const first = await settleLine(sub, {
    client, line: line.id, cents: 42_000, postingDate: period.mid, checker,
    label: "x42 r5a: the first settlement",
  });
  assert.equal(await glTotal(client, BANKCOA), 42_000,
    "mandatory setup: ONE settlement, one line amount");
  assert.equal((await matchRow(first.match)).resolution_exception_id, null,
    "MANDATORY PREMISE: a plain settlement discharged no exception, so round 4's subject cannot see it");

  const released = await unmatchBankMatch(sub, {
    client, match: first.match, reason: "x42 r5a: released", opKey: opk("x42-r5a-unm"),
  });
  assert.equal((await entryRowOf(first.entry)).status, "approved",
    "…and the release left the settlement APPROVED (releasing a match never un-approves money)");
  assert.equal(await glTotal(client, BANKCOA), 42_000, "…so the bank GL still carries it");

  // THE READER RECUT, asserted here because this release is the one round 4's
  // exception-keyed reader reported NOTHING for.
  assert.ok(released.booking_outstanding,
    "the release REPORTS what it left standing even though no exception was ever involved");
  assert.equal(released.booking_outstanding.blocking, true, "…as blocking");
  assert.equal(released.booking_outstanding.bookings[0].entry_id, first.entry,
    "…naming the settlement entry the line caused");

  const before = await glTotal(client, BANKCOA);
  const err = await refusesWithCode(
    () => settleLine(sub, {
      client, line: line.id, cents: 42_000, postingDate: period.mid, checker,
      label: "x42 r5a: the SECOND settlement",
    }),
    CLR10, "exception_booking_outstanding", "x42.af2-15a a second settlement of the same line",
  );
  assert.equal(await glTotal(client, BANKCOA), before,
    "THE MONEY: the refused second settlement added NOTHING (84,000 for one 42,000 line is the defect)");
  assert.equal((await bankMovements(client)).length, 1,
    "…and exactly ONE entry still moves this bank account");
  const d = blockDetail(err, "x42.af2-15a");
  assert.equal(d.line_id, line.id, "…keyed on the LINE");
  assert.equal(d.bookings[0].entry_id, first.entry, "…naming the settlement");
  assert.equal(d.bookings[0].orphaned, true, "…marked orphaned, which is what makes it blocking");

  // AND THE CORRIDOR IS OPEN: the composed remedy really unwinds it, and the line
  // is settleable again afterwards. A wall with no exit is the class this repo
  // has already ruled a defect three times.
  await runRemedy(sub, client, d.bookings[0].remedy_calls, "x42.af2-15a", { checker });
  assert.equal(await glTotal(client, BANKCOA), 0, "the composed remedy unwinds the standing booking");
  const again = await settleLine(sub, {
    client, line: line.id, cents: 42_000, postingDate: period.mid, checker,
    label: "x42 r5a: the corrected settlement",
  });
  assert.equal((await matchRow(again.match)).status, "live", "…and the line settles again");
  assert.equal(await glTotal(client, BANKCOA), 42_000, "…carrying ONE booking");
});

// ===========================================================================
// x42.af2-15b — DOOR: clara.resolve_bank_line_exception, THIRD DISPOSITION.
//
// Round 4's gate opened only for `open` / `matched_booking` / `written_off_
// adjustment`. `bank_corrective_line` is the third ratified disposition, and ONE
// direct call to the always-public resolve verb moves a line OUT of the corridor
// — after which clara.match_bank_line walks straight past a law that is sitting
// right there on the row it writes. A gate narrower than the invariant it guards
// is still a point-fix.
// ===========================================================================
test("x42.af2-15b resolving the reopened exception as bank_corrective_line does not open a back door to a second booking", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rb3-b");
  // TWO lines on ONE account that net to zero — the corrective pair's own
  // arithmetic, which is why this cell cannot use the one-line `bankLine`.
  const { lines, period } = await bankLines(sub, {
    client,
    specs: [
      { amountCents: 42_000, description: "x42 r5b: the 42,000 deposit" },
      { amountCents: -42_000, description: "x42 r5b: the offsetting reversal" },
    ],
  });
  const [lineA, lineB] = lines;
  const exA = await openException(sub, { client, line: lineA.id, reason: "x42 r5b: unidentified" });

  const first = await resolveAndBookBankLine(sub, {
    client, exception: exA, disposition: "matched_booking", note: "x42 r5b: the first booking",
    draft: twoLegDraft(period.mid, "x42 r5b booking one", 42_000), opKey: opk("x42-r5b-1"),
  });
  assertEnvelope(first, { exception: exA, branch: "live" }, "x42.af2-15b the first booking");
  assert.equal(await glTotal(client, BANKCOA), 42_000, "mandatory setup: one booking, one line amount");

  await unmatchBankMatch(sub, {
    client, match: matchIdOf(first), reason: "x42 r5b: released", opKey: opk("x42-r5b-unm"),
  });
  assert.equal((await exceptionRow(exA)).status, "open", "the release reopened the exception");

  // THE MOVE OUT OF THE CORRIDOR. A corrective pair is a real, ratified act: this
  // line and its offsetting twin are a bank error that books NOTHING. It is also
  // the one disposition round 4's gate did not name.
  const exB = await openException(sub, { client, line: lineB.id, reason: "x42 r5b: the other half" });
  await resolveException(sub, {
    client, exception: exA, disposition: "bank_corrective_line",
    note: "x42 r5b: bank posted and reversed the same amount",
    counterpartLine: lineB.id, opKey: opk("x42-r5b-corr"),
  });
  const after = await exceptionRow(exA);
  assert.equal(after.resolution_disposition, "bank_corrective_line",
    "MANDATORY PREMISE: the line now sits on the THIRD disposition — outside round 4's corridor");
  assert.equal((await exceptionRow(exB)).status, "resolved", "…and the pair closed both legs");

  const second = await plainAt(sub, {
    client, debit: BANKCOA, credit: "680-B42", cents: 42_000, postingDate: period.mid,
    memo: "x42 r5b: the SECOND booking, pushed through the older door",
  });
  const before = await glTotal(client, BANKCOA);
  const err = await caught(() => matchBankLine(sub, {
    client, lines: [lineA.id], entries: [{ entry_id: second, matched_cents: 42_000 }],
    opKey: opk("x42-r5b-match"),
  }));
  assert.ok(err,
    "the re-booking must be refused — 84,000 of bank GL for one 42,000 statement line is the defect");
  assert.equal(await glTotal(client, BANKCOA), before, "THE MONEY: nothing was added to the bank GL");
  assert.equal((await groupsOfLine(lineA.id)).filter((g) => g.status !== "unmatched").length, 0,
    "…and the line carries no live or pending group");
  assert.equal(err.code, CLR10, `the refusal is CLR10 (got ${err.code}: ${err.message})`);
  const d = blockDetail(err, "x42.af2-15b");
  assert.equal(d.line_id, lineA.id, "…keyed on the LINE");
  assert.equal(d.bookings[0].entry_id, first.entry_id, "…naming the booking the composite left standing");
});

// ===========================================================================
// x42.af2-15c — DOOR: clara.match_bank_line's OWN difference adjustment.
//
// match_bank_line is usually thought of as "match a pre-existing entry", and on
// that reading it creates nothing. It does: every p_adjustments element mints a
// fresh approved entry through clara._bank_match_adjustment_entry, with a bank
// leg. Release the group and that adjustment is an orphan the line caused — and
// re-matching the line then carries its difference TWICE.
// ===========================================================================
test("x42.af2-15c a released match leaves its OWN difference adjustment standing, and that blocks the re-book", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rb3-c");
  const { line, period } = await bankLine(sub, {
    client, amountCents: 40_000, description: "x42 r5c: the 40,000 deposit, 500 short",
  });
  // The entry is 39,500; the 500 difference rides an adjustment entry the MATCH
  // itself mints. Group ties: 40,000 of line == 39,500 of entry + 500 of adjustment.
  const real = await plainAt(sub, {
    client, debit: BANKCOA, credit: "680-B42", cents: 39_500, postingDate: period.mid,
    memo: "x42 r5c: the real deposit entry",
  });
  const m = await matchBankLine(sub, {
    client, lines: [line.id], entries: [{ entry_id: real, matched_cents: 39_500 }],
    adjustments: [{ account_code: ADJX, amount_cents: 500, memo: "x42 r5c: bank rounding" }],
    opKey: opk("x42-r5c-match"),
  });
  assert.equal(await glTotal(client, BANKCOA), 40_000,
    "mandatory setup: the entry plus the match's own adjustment equal the line");
  const movements = await bankMovements(client);
  assert.equal(movements.length, 2, "…across two entries, one of which the MATCH created");

  await unmatchBankMatch(sub, {
    client, match: matchIdOf(m), reason: "x42 r5c: released", opKey: opk("x42-r5c-unm"),
  });
  assert.equal(await glTotal(client, BANKCOA), 40_000, "the release un-approves nothing");

  // Re-matching the SAME real entry with a FRESH adjustment would carry the 500
  // difference twice. The real entry is not the subject (it pre-existed the
  // group); the adjustment is (the group minted it).
  const before = await glTotal(client, BANKCOA);
  const err = await caught(() => matchBankLine(sub, {
    client, lines: [line.id], entries: [{ entry_id: real, matched_cents: 39_500 }],
    adjustments: [{ account_code: ADJX, amount_cents: 500, memo: "x42 r5c: rounding, again" }],
    opKey: opk("x42-r5c-match2"),
  }));
  assert.ok(err, "re-matching with a second adjustment must be refused");
  assert.equal(await glTotal(client, BANKCOA), before, "THE MONEY: the 500 was not carried twice");
  const d = blockDetail(err, "x42.af2-15c");
  const named = d.bookings.map((b) => b.entry_id);
  assert.ok(!named.includes(real),
    "…and the PRE-EXISTING entry is NOT named: it will clear against its own line (the anti-wall reading)");
  assert.equal(named.length, 1, "…exactly the one entry the released group created");
});
