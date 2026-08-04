// 0042 Wave D-b — the AF-2 ONE-STANDING-BOOKING battery, ROUND 4.
//
// WHY THIS FILE EXISTS SEPARATELY FROM x42-af2-rebook.test.mjs. Round 3 stated
// the right law — "one statement line carries one standing booking" — and then
// spliced it into ONE VERB (clara.resolve_and_book_bank_line), keyed on ONE
// column (bank_matches.resolution_exception_id) that only that verb ever stamps.
// So the OLDER, ALWAYS-PUBLIC door pair walked straight past it:
//
//     clara.resolve_bank_line_exception(ex,'matched_booking',…)
//     clara.match_bank_line(line, [a second entry])      -- one transaction
//
// re-booked the released line — 84,000 of bank GL for ONE 42,000 statement line
// — and clara.get_bank_reconciliation absorbed the surplus as an outstanding
// entry side, so the receipt still tied at zero and `blockers` came back EMPTY.
// That door pair is the very route the composite's own high-stakes refusal
// NAMES as sanctioned.
//
// Round 4 moved the law off the verb and onto clara.bank_match_line_members'
// deferred constraint trigger — the one row every booking door writes, and the
// row every group-status transition touches through ON UPDATE CASCADE. These
// cells therefore measure the law from OUTSIDE the composite: through the
// two-step pair, through a release that the composite never touched, and (14g)
// through a flow that must still be ALLOWED.
//
// CONTRACT-BLIND lane discipline: every refusal is asserted by its DETAIL
// reason token; a divergence is a FINDING.
//
// Serial discipline: the package runs `node --test --test-concurrency=1`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, noteLane, getPool, ROLES,
  namedCall,
} from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, refusesWithCode, caught, resolveAndBookBankLine,
  CLR10, BANKCOA, REVN,
  af2World, freshAf2Client, bankLine, openException, plainAt,
  exceptionRow, exceptionRowsOfLine, groupsOfLine, matchRow, matchIdOf,
  unmatchBankMatch, matchBankLine, exceptLine, entryRowOf, assertEnvelope,
} from "./x42-af2-world.mjs";
import { glTotal, twoLegDraft, runRemedy } from "./x42-af2-rebook-kit.mjs";

let live = false;
let world = null;

const T_BOOKED = "exception_booking_outstanding";
const T_UNBOOKED = "disposition_unbooked";

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 ROUND-4 battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-af2-rebook2");
  printSkipCount("x42-af2-rebook2");
  await endPool();
});

/** THE TWO-STEP DOOR, driven as one human transaction, with the STATEMENT error
 *  and the COMMIT error reported separately. The split is the point of cell
 *  14h: a verb-side wall fails at the statement, a structural law fails at
 *  COMMIT, and "where did this refusal come from" is exactly the question three
 *  rounds of site-fixes got wrong. */
async function twoStepBooking(sub, { client, exception, entry, line, cents, note }) {
  const c = await getPool().connect();
  const out = { stmtErr: null, commitErr: null, committed: false };
  try {
    await c.query("begin");
    await c.query(`set local role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub, role: "authenticated" })]);
    try {
      await c.query(
        namedCall("resolve_bank_line_exception", [
          { name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" },
          { name: "p_op_key" }]),
        [exception, "matched_booking", note, opk("x42rb2-res")]);
      await c.query(
        namedCall("match_bank_line", [
          { name: "p_client" }, { name: "p_lines", cast: "jsonb" },
          { name: "p_entries", cast: "jsonb" }, { name: "p_op_key" }]),
        [client, JSON.stringify([line]),
          JSON.stringify([{ entry_id: entry, matched_cents: cents }]), opk("x42rb2-match")]);
    } catch (err) {
      out.stmtErr = err;
    }
    if (!out.stmtErr) {
      try { await c.query("commit"); out.committed = true; }
      catch (err) { out.commitErr = err; }
    }
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
  return out;
}

// ===========================================================================
// x42.af2-14e — THE OLDER DOOR PAIR IS WALLED TOO, AND THE WITNESS IS THE
// BANK GL TOTAL. Round 3's wall lives inside clara.resolve_and_book_bank_line;
// this cell never calls it for the second booking. Without the round-4 law the
// transaction COMMITS and the bank GL reads 84,000 for one 42,000 line.
// ===========================================================================
test("x42.af2-14e the two-step resolve+match pair cannot re-book a released line either — the bank GL stays at the line amount", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rebook2-e");
  const { line, period } = await bankLine(sub, {
    client, amountCents: 42_000, description: "x42 r4: the 42,000 deposit",
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 r4: unidentified" });

  const first = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 r4: the first booking",
    draft: twoLegDraft(period.mid, "x42 r4 booking one", 42_000), opKey: opk("x42-r4-1"),
  });
  assertEnvelope(first, { exception: ex, branch: "live" }, "x42.af2-14e the first booking");
  assert.equal(await glTotal(client, BANKCOA), 42_000, "mandatory setup: ONE booking, one line amount");

  await unmatchBankMatch(sub, {
    client, match: matchIdOf(first), reason: "x42 r4: released", opKey: opk("x42-r4-unmatch"),
  });
  assert.equal((await exceptionRow(ex)).status, "open", "the release reopened the exception");
  assert.equal(await glTotal(client, BANKCOA), 42_000, "…and left the first booking standing");

  // A SECOND, INDEPENDENT approved entry — exactly what a human would draft
  // through /queue when the composite's high-stakes refusal points them here.
  const second = await plainAt(sub, {
    client, debit: BANKCOA, credit: REVN, cents: 42_000, postingDate: period.mid,
    memo: "x42 r4: the SECOND booking, through the older door",
  });

  const before = await glTotal(client, BANKCOA);
  const run = await twoStepBooking(sub, {
    client, exception: ex, entry: second, line: line.id, cents: 42_000,
    note: "x42 r4: re-booking through resolve + match",
  });

  // THE MONEY FIRST. A build that double-books reports the total, not a token.
  assert.equal(run.committed, false,
    "the two-step re-booking must NOT commit — 84,000 of bank GL for one 42,000 statement line is the defect");
  assert.equal(await glTotal(client, BANKCOA), before,
    "THE MONEY: the refused re-booking added NOTHING to the bank GL");
  assert.equal((await groupsOfLine(line.id)).filter((g) => g.status !== "unmatched").length, 0,
    "…and left no live or pending group on the line");

  const err = run.commitErr ?? run.stmtErr;
  assert.equal(err.code, CLR10, `the refusal is CLR10 (got ${err.code}: ${err.message})`);
  const detail = JSON.parse(err.detail);
  assert.equal(detail.reason, T_BOOKED,
    `…and names the SAME token the composite refuses with — one law, not two (got ${detail.reason})`);
  assert.equal(detail.line_id, line.id, "…keyed on the LINE, which is what round 3 got wrong");
  assert.equal(detail.blocking, true, "…and says so through the shared `blocking` verdict");
  assert.equal(detail.bookings.length, 1, "…naming exactly the one standing booking");
  assert.equal(detail.bookings[0].entry_id, first.entry_id, "…the entry the FIRST call booked");
  assert.equal(detail.bookings[0].orphaned, true,
    "…marked orphaned: it is held by no live group, which is what makes it blocking");
});

// ===========================================================================
// x42.af2-14f — THE HIGH, BOTH HALVES. A booking made ENTIRELY through the
// two-step pair is born with resolution_exception_id NULL. Round 3's reopen was
// gated on that column, so the release left a RESOLVED matched_booking exception
// on an UNMATCHED line — the `disposition_unbooked` state the belt calls
// unlawful and could not see, because the belt fires on writes to
// bank_line_exceptions and a release writes bank_matches. That state then let
// except_bank_line mint a FRESH exception which the composite booked a second
// time. This cell drives the whole chain.
// ===========================================================================
test("x42.af2-14f a release of an UNSTAMPED two-step booking reopens the exception, records the identity it erases, and blocks a fresh-exception re-book", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rebook2-f");
  const { line, period } = await bankLine(sub, {
    client, amountCents: 31_500, description: "x42 r4f: the 31,500 deposit",
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 r4f: unidentified" });
  const booked = await plainAt(sub, {
    client, debit: BANKCOA, credit: REVN, cents: 31_500, postingDate: period.mid,
    memo: "x42 r4f: booked through the older door",
  });

  const run = await twoStepBooking(sub, {
    client, exception: ex, entry: booked, line: line.id, cents: 31_500,
    note: "x42 r4f: the FIRST booking, through resolve + match",
  });
  assert.equal(run.committed, true,
    `the two-step pair is a SANCTIONED first booking and must still work (stmt=${run.stmtErr?.message}, commit=${run.commitErr?.message})`);
  assert.equal(await glTotal(client, BANKCOA), 31_500, "…one booking, one line amount");

  const groups = await groupsOfLine(line.id);
  assert.equal(groups.length, 1, "…and exactly one group");
  const gid = groups[0].id;
  assert.equal((await matchRow(gid)).resolution_exception_id, null,
    "MANDATORY PREMISE: a two-step booking is born with NO identity stamp — that is round 3's blind spot");

  const released = await unmatchBankMatch(sub, {
    client, match: gid, reason: "x42 r4f: released", opKey: opk("x42-r4f-unmatch"),
  });

  // HALF ONE — the pair may never disagree about whether the line is booked.
  assert.equal((await exceptionRow(ex)).status, "open",
    "the release REOPENED the exception even though the group carried no identity stamp");
  assert.equal(released.reopened_exception_id, ex, "…and the receipt names it");
  assert.equal((await matchRow(gid)).resolution_exception_id, ex,
    "…and the release RECORDED the exception it was about to erase — the evidence the law reads later");
  assert.ok(released.booking_outstanding, "…and reported what it left standing");
  assert.equal(released.booking_outstanding.blocking, true, "…as blocking");

  // HALF TWO — THE FRESH-EXCEPTION AVENUE IS CLOSED BY THE REOPEN ITSELF, and
  // this cell records that as a MEASURED result rather than the shape it was
  // written expecting. The reported chain was "…that state then lets
  // except_bank_line mint a fresh exception which the composite books a SECOND
  // time". It does — but only from the state where the release did NOT reopen.
  // Once the release reopens, uq_ble_line_open and except_bank_line's own eager
  // guard make a second open exception on the line unreachable. The defect had
  // TWO gates and only one of them had to be closed to shut the chain; both are
  // closed, and this asserts the near one so a future round that weakens the
  // reopen sees this cell go red rather than silently reopening the avenue.
  const denied = await caught(() => exceptLine(sub, {
    client, line: line.id, reason: "x42 r4f: a fresh exception on the same line",
    opKey: opk("x42-r4f-ex2"),
  }));
  assert.ok(denied, "a fresh exception on the line is refused once the release has reopened the old one");
  assert.equal(JSON.parse(denied.detail).reason, "line_already_excepted",
    `…by name (got ${denied.detail})`);
  assert.equal((await exceptionRowsOfLine(line.id)).length, 1,
    "…so the line still carries exactly ONE exception");

  // AND THE LINE-KEYING IS WHAT REFUSES THE RE-BOOK. Round 3's predicate asked
  // `bm.resolution_exception_id = <this exception>`, and this group was born
  // UNSTAMPED — so it would have found nothing and booked again. It finds it now
  // only because the release recorded the identity before erasing it.
  const before = await glTotal(client, BANKCOA);
  const err = await refusesWithCode(
    () => resolveAndBookBankLine(sub, {
      client, exception: ex, disposition: "matched_booking", note: "x42 r4f: the second booking",
      draft: twoLegDraft(period.mid, "x42 r4f booking two", 31_500), opKey: opk("x42-r4f-2"),
    }),
    CLR10, T_BOOKED, "x42.af2-14f a re-book over an UNSTAMPED-at-birth two-step booking",
  );
  assert.equal(await glTotal(client, BANKCOA), before,
    "THE MONEY: the re-booking added NOTHING to the bank GL (63,000 for one 31,500 line is the defect)");
  const d = JSON.parse(err.detail);
  assert.equal(d.line_id, line.id, "…and the refusal is keyed on the LINE");
  assert.equal(d.bookings[0].entry_id, booked,
    "…naming the entry the two-step door booked, which round 3's exception-keyed predicate could not see");

  // AND THE CORRIDOR IS STILL OPEN. Unwinding the standing booking must make the
  // line bookable again — a wall with no exit is the class this repo has ruled a
  // defect three times.
  await runRemedy(sub, client, d.bookings[0].remedy_calls, "x42.af2-14f");
  assert.equal(await glTotal(client, BANKCOA), 0, "the composed remedy really unwinds it");
  const ok = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 r4f: the corrected booking",
    draft: twoLegDraft(period.mid, "x42 r4f booking two (after the unwind)", 31_500),
    opKey: opk("x42-r4f-3"),
  });
  assertEnvelope(ok, { exception: ex, branch: "live" }, "x42.af2-14f the corrected booking");
  assert.equal(await glTotal(client, BANKCOA), 31_500, "…and the line carries ONE booking again");
});

// ===========================================================================
// x42.af2-14g — WHAT THE FIX DID NOT THINK OF, ASKED AS A CELL.
//
// The obvious way to state "one standing booking per line" is "no prior group on
// this line may still hold an approved, unreversed entry". That reading is a
// WALLED CORRIDOR, and this cell is the one that catches it: a human who matches
// a line to a real, pre-existing entry, realises it belongs to a different
// deposit, unmatches, and then excepts the line, would be told "reverse that
// entry first" — about an entry that is genuinely outstanding and will clear
// against its own statement line, possibly one that has not been imported yet.
//
// The law's subject is therefore an EXCEPTION-DISCHARGING group's booking, which
// clara.bank_matches.resolution_exception_id identifies — and which S4.9's
// release now stamps even for the two-step door (14f proves that half). An
// ordinary match never discharged an exception, so it is outside the subject.
// If a future round widens the subject to "any standing entry", this cell fails.
// ===========================================================================
test("x42.af2-14g an ORDINARY match that was corrected does NOT block a later booking of the same line — the law's subject is an exception-discharging group, not any entry", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rebook2-g");
  const { line, period } = await bankLine(sub, {
    client, amountCents: 27_000, description: "x42 r4g: the 27,000 deposit",
  });

  // A REAL entry that exists for its own reasons — the money is genuinely in the
  // books and its own statement line has simply not arrived yet.
  const elsewhere = await plainAt(sub, {
    client, debit: BANKCOA, credit: REVN, cents: 27_000, postingDate: period.mid,
    memo: "x42 r4g: a real deposit that belongs to ANOTHER line",
  });
  const m = await matchBankLine(sub, {
    client, lines: [line.id], entries: [{ entry_id: elsewhere, matched_cents: 27_000 }],
    opKey: opk("x42-r4g-match"),
  });
  await unmatchBankMatch(sub, {
    client, match: matchIdOf(m), reason: "x42 r4g: wrong line — this is the other deposit",
    opKey: opk("x42-r4g-unmatch"),
  });
  const ordinary = await matchRow(matchIdOf(m));
  assert.equal(ordinary.status, "unmatched", "mandatory setup: the mis-match was released");
  assert.equal(ordinary.resolution_exception_id, null,
    "…and an ordinary match discharged NO exception, so it carries no identity stamp");
  assert.equal((await entryRowOf(elsewhere)).status, "approved",
    "…and the real entry is still approved — releasing a match does not un-approve money");

  // Now the line is excepted and booked. This MUST be admitted.
  const ex = await openException(sub, { client, line: line.id, reason: "x42 r4g: bank error" });
  const booked = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking",
    note: "x42 r4g: booking the excepted line after an unrelated mis-match was corrected",
    draft: twoLegDraft(period.mid, "x42 r4g the booking", 27_000), opKey: opk("x42-r4g-book"),
  });
  assertEnvelope(booked, { exception: ex, branch: "live" }, "x42.af2-14g the booking");
  assert.equal(await glTotal(client, BANKCOA), 54_000,
    "both entries stand, correctly: the real deposit is an outstanding reconciling item and the excepted line has its own booking");
});

// ===========================================================================
// x42.af2-14h — WHERE THE LAW LIVES. A verb-side wall refuses at the STATEMENT;
// a structural law refuses at COMMIT. Three rounds of findings came from fixes
// landing at the site instead of the invariant, so this cell measures the site.
// It also pins the reverse: the belt trigger really is installed, deferred, on
// the line-member table, and the law is asked ABOVE the settled-period gate
// (a law read after that early return would apply only to reconciled months).
// ===========================================================================
test("x42.af2-14h the one-standing-booking law is enforced by the DEFERRED belt on bank_match_line_members, above the settled-period gate", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rebook2-h");
  const { line, period } = await bankLine(sub, {
    client, amountCents: 18_000, description: "x42 r4h: the 18,000 deposit",
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 r4h: unidentified" });
  const first = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 r4h: first",
    draft: twoLegDraft(period.mid, "x42 r4h booking one", 18_000), opKey: opk("x42-r4h-1"),
  });
  await unmatchBankMatch(sub, {
    client, match: matchIdOf(first), reason: "x42 r4h: released", opKey: opk("x42-r4h-unmatch"),
  });
  const second = await plainAt(sub, {
    client, debit: BANKCOA, credit: REVN, cents: 18_000, postingDate: period.mid,
    memo: "x42 r4h: the second entry",
  });

  const run = await twoStepBooking(sub, {
    client, exception: ex, entry: second, line: line.id, cents: 18_000,
    note: "x42 r4h: re-booking through the older pair",
  });
  assert.equal(run.committed, false, "the re-booking is refused");
  assert.equal(run.stmtErr, null,
    "…and NOT by either verb: both statements succeeded, which is what makes this a structural law and not a fourth per-verb wall");
  assert.ok(run.commitErr, "…the refusal arrives at COMMIT, from the deferred constraint trigger");
  assert.equal(JSON.parse(run.commitErr.detail).reason, T_BOOKED, "…by the shared token");

  // The structure behind the behaviour, read from the catalog.
  const belt = (await rootQuery(
    `select t.tgname, c.relname, (t.tgdeferrable and t.tginitdeferred) as deferred
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal
        and t.tgfoid = 'clara._tf_bank_settled_authority_belt()'::regprocedure
        and c.relname = 'bank_match_line_members'`)).rows;
  assert.equal(belt.length, 1, "the belt is installed on bank_match_line_members exactly once");
  assert.equal(belt[0].deferred, true, "…DEFERRABLE INITIALLY DEFERRED, which is why it sees the world at commit");

  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara._tf_bank_settled_authority_belt()'::regprocedure",
  )).rows[0].prosrc;
  const lawAt = src.indexOf("clara._wdb_assert_line_booking_lawful(");
  const gateAt = src.indexOf("if v_n = 0 then return null; end if;");
  assert.ok(lawAt > 0, "the belt asks the shared law body");
  assert.equal(src.split("clara._wdb_assert_line_booking_lawful(").length - 1, 1,
    "…exactly once — one call site, so no arm can be recut without the other noticing");
  assert.ok(lawAt < gateAt,
    "…ABOVE the settled-period early return: below it the law would bind only in reconciled months, and the defect lives in unreconciled ones");
});

// ===========================================================================
// x42.af2-14i — THE SECOND HALF OF THE INVARIANT, FROM THE MATCH SIDE.
// `disposition_unbooked` has been the belt's law since 0040, but only as a
// trigger on clara.bank_line_exceptions — so the writer that can break it
// (a release, which writes clara.bank_matches) never fired it. This cell forces
// the state the release must never be able to leave behind.
// ===========================================================================
test("x42.af2-14i a release can never leave a resolved-with-booking exception on an unmatched line", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rebook2-i");
  const { line, period } = await bankLine(sub, {
    client, amountCents: 9_400, description: "x42 r4i: the 9,400 deposit",
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 r4i: unidentified" });
  const booked = await plainAt(sub, {
    client, debit: BANKCOA, credit: REVN, cents: 9_400, postingDate: period.mid,
    memo: "x42 r4i: booked through the older door",
  });
  const run = await twoStepBooking(sub, {
    client, exception: ex, entry: booked, line: line.id, cents: 9_400,
    note: "x42 r4i: the booking",
  });
  assert.equal(run.committed, true, "mandatory setup: the two-step booking lands");

  const gid = (await groupsOfLine(line.id))[0].id;
  await unmatchBankMatch(sub, {
    client, match: gid, reason: "x42 r4i: released", opKey: opk("x42-r4i-unmatch"),
  });

  // The whole-state assertion: NOTHING on this line still claims to be booked.
  const rows = await exceptionRowsOfLine(line.id);
  const claiming = rows.filter(
    (r) => r.status === "resolved"
      && ["matched_booking", "written_off_adjustment"].includes(r.resolution_disposition),
  );
  assert.equal(claiming.length, 0,
    `no exception on the line may claim a booking while the line is unmatched (${T_UNBOOKED}); found ${JSON.stringify(claiming)}`);
  assert.equal((await groupsOfLine(line.id)).filter((g) => g.status === "live").length, 0,
    "…and the line really is in no live match, so the two facts agree");

  // And the structural backstop is reachable: a forged release that skipped the
  // reopen must be refused at commit rather than silently persisting. The forge
  // is superuser DML on bank_matches — no audited verb can build this shape,
  // which is exactly why the belt has to be the one that catches it.
  //
  // `resolved_by = created_by` DELIBERATELY: the exception's author is a firm
  // principal, so the belt's owner-floor arm is satisfied and the ONLY arm left
  // to fire is the one under test. A forge that trips exception_floor_breached
  // would be a green cell measuring the wrong law — the "measure with the
  // instrument production uses" lesson, applied to a forge.
  const forged = await caught(async () => {
    const c = await getPool().connect();
    try {
      await c.query("begin");
      await c.query(
        "update clara.bank_line_exceptions set status='resolved', resolved_by=created_by,"
        + " resolved_at=now(), resolution_disposition='matched_booking',"
        + " resolution_note='x42 r4i forged' where id=$1", [ex]);
      await c.query("commit");
    } finally {
      await c.query("rollback").catch(() => {});
      c.release();
    }
  });
  assert.ok(forged, "a hand-forged resolved-with-booking exception on an unmatched line is refused");
  assert.equal(JSON.parse(forged.detail).reason, T_UNBOOKED,
    `…by the disposition_unbooked arm and not by some other guard (got ${forged.detail})`);
});
