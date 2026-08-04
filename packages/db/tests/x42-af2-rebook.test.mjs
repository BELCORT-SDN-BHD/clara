// 0042 Wave D-b — AF-2 PART 4: RE-BOOKING AFTER A RELEASE, and the counterparty
// landscape underneath the composite's lock ladder (as-built ladder ROUND 3).
//
// WHY THIS FILE EXISTS. Design §4 makes a live release REOPEN the exception it
// booked — correctly: both booking dispositions assert "this line ends matched",
// so a resolved exception on an unmatched line has fallen out of every
// reconciliation term. And `unmatch_bank_match` deliberately does NOT un-approve
// the booking — also correctly: `reverse_entry` refuses while a live match is
// present, so a release that demanded the reversal first would wall the human
// into a reservation nobody can unwind. BETWEEN THOSE TWO CORRECT DECISIONS sits
// an open exception whose GL booking is still standing, and the composite's only
// "has this been booked?" test is `ex.status = 'open'`. These cells measure the
// BANK GL TOTAL for one statement line, because that is the number that goes
// wrong: 84,000 of bank GL for one 42,000 line, which
// `get_bank_reconciliation` absorbs as an outstanding entry side so the receipt
// still ties at zero and nothing surfaces it.
//
// The four cells deliberately ask FOUR DIFFERENT questions — the round-3 lesson
// that a cell which only walks the path the fix took proves nothing:
//   14c  the money: the total, the refusal, and the composed remedy EXECUTED.
//   14d  the OTHER release door (a parked cancel whose checker already approved
//        the draft) and the TWO-STEP remedy the settlement leg really needs.
//   14e  the wall must NOT fire where nothing is standing — three shapes.
//   14f  the counterparty MAP under the lock ladder, measured through pg_locks.
//
// CONTRACT-BLIND lane discipline (see x42-af2.test.mjs's header): every refusal
// is asserted by its DETAIL reason token; a divergence is a FINDING.
// Instruments live in `x42-af2-rebook-kit.mjs` (the 500-line gate).
//
// Serial discipline: the package runs `node --test --test-concurrency=1`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount,
  noteLane, getPool, ROLES, reverseEntry, mergeCounterparties,
} from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, refusesWithCode, caught, resolveAndBookBankLine,
  CLR10, BANKCOA, AR1, REVN,
  af2World, freshAf2Client, bankLine, openException, stampedItem, plainAt,
  parkHighStakes, assertEnvelope, freshBankAccount, nextPeriod, enterStatement,
  entryRowOf, exceptionRow, groupsOfLine, matchRow, matchIdOf,
  unmatchBankMatch, matchBankLine, approveEntry, birthCounterparty,
  completePendingMatch, getBankReconciliation,
} from "./x42-af2-world.mjs";
import { glTotal, rungHeld, twoLegDraft, stampedDraft, runRemedy } from "./x42-af2-rebook-kit.mjs";

let live = false;
let world = null;

// ABI §F, round-3 additions. Both are NEW tokens this file pins by name.
const T_BOOKED = "exception_booking_outstanding";
const T_LANDSCAPE = "counterparty_landscape_changed";
const CLR23 = "CLR23";

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 RE-BOOK battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-af2-rebook");
  printSkipCount("x42-af2-rebook");
  await endPool();
});

// ===========================================================================
// x42.af2-14c — ONE STATEMENT LINE CARRIES ONE LIVE BOOKING. After a live
// release has reopened the exception, the first booking is STILL APPROVED and
// unreversed; a second call would put a second full booking of the same money in
// the GL. The assertion is the BANK GL TOTAL, not the refusal: a refusal that
// fired while the total was already wrong would prove nothing, and the
// reconciliation cannot be the witness — it absorbs the surplus as an
// outstanding entry side and still ties.
// ===========================================================================
test("x42.af2-14c after a live release reopens the exception, a SECOND booking is refused and the line's BANK GL TOTAL stays at the line amount (never 2x)", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rebook");
  const { line, period, statement } = await bankLine(sub, {
    client, amountCents: 42_000, description: "x42 rebook: the 42,000 deposit",
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 rebook: unidentified" });

  const first = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 rebook: the first booking",
    draft: twoLegDraft(period.mid, "x42 rebook booking one", 42_000), opKey: opk("x42-rb-1"),
  });
  assertEnvelope(first, { exception: ex, branch: "live" }, "x42.af2-14c the first booking");
  assert.equal(await glTotal(client, BANKCOA), 42_000,
    "mandatory setup: ONE booking puts exactly the line's amount into the bank GL");

  // The release. It reopens (design §4) and it does NOT un-approve the booking.
  const released = await unmatchBankMatch(sub, {
    client, match: matchIdOf(first), reason: "x42 rebook: the deposit was someone else's",
    opKey: opk("x42-rb-unmatch"),
  });
  assert.equal((await exceptionRow(ex)).status, "open", "the release reopened the exception (design §4)");
  const standing = await entryRowOf(first.entry_id);
  assert.equal(standing.status, "approved", "…and left the first booking APPROVED");
  assert.equal(standing.reversed_by, null, "…and unreversed — this verb does not un-approve money");
  assert.equal(await glTotal(client, BANKCOA), 42_000, "…so the bank GL still carries that booking");

  // THE MONEY, FIRST. The second booking must be refused and the total must not
  // move — asserted before anything else, so a build that double-books reports
  // the GL rather than a missing receipt key.
  const before = await glTotal(client, BANKCOA);
  const err = await refusesWithCode(
    () => resolveAndBookBankLine(sub, {
      client, exception: ex, disposition: "matched_booking", note: "x42 rebook: the second booking",
      draft: twoLegDraft(period.mid, "x42 rebook booking two", 42_000), opKey: opk("x42-rb-2"),
    }),
    CLR10, T_BOOKED, "x42.af2-14c a second booking while the first is still live in the GL",
  );
  assert.equal(await glTotal(client, BANKCOA), before,
    "THE MONEY: the refused second booking added NOTHING to the bank GL (84,000 for one 42,000 line is the defect)");
  assert.equal((await groupsOfLine(line.id)).length, 1, "…and minted no second group");

  // THE PROMISE CHANNEL. The act that CREATED this state must have said so,
  // through the same body the door just refused on — one derivation, two readers.
  const detail = JSON.parse(err.detail);
  assert.ok(released.booking_outstanding,
    `the release reports the booking it left standing (got keys ${Object.keys(released).join(",")})`);
  assert.equal(released.booking_outstanding.reason, T_BOOKED, "…by the ABI §F reason token");
  assert.equal(released.booking_outstanding.exception_id, ex, "…naming the reopened exception");
  const promised = released.booking_outstanding.bookings;
  assert.equal(promised.length, 1, "…and exactly ONE standing booking");
  assert.equal(promised[0].entry_id, first.entry_id, "…the entry the first call actually booked");
  assert.equal(detail.remedy, released.booking_outstanding.remedy,
    "the refusal and the release compose the IDENTICAL remedy — a shared predicate, not two derivations");

  // THE REMEDY IS EXECUTABLE AS WRITTEN, and the re-book then succeeds.
  await runRemedy(sub, client, detail.bookings[0].remedy_calls, "x42.af2-14c");
  assert.equal(await glTotal(client, BANKCOA), 0,
    "the composed remedy really unwinds the first booking — the bank GL is back to zero");
  const second = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 rebook: the corrected booking",
    draft: twoLegDraft(period.mid, "x42 rebook booking two (after the unwind)", 42_000),
    opKey: opk("x42-rb-3"),
  });
  assertEnvelope(second, { exception: ex, branch: "live" }, "x42.af2-14c the re-book after the unwind");
  assert.equal(await glTotal(client, BANKCOA), 42_000,
    "…and the line ends carrying exactly ONE booking's worth of bank GL");

  // The reconciliation is NOT the witness — it ties either way. Asserted so the
  // next author cannot mistake a green receipt for a correct GL.
  const recon = await getBankReconciliation(sub, { statement });
  assert.equal(Number(recon.snapshot.terms.gl_prime_cents), 42_000,
    "the reconciliation's GL side agrees with the GL total (it would have absorbed 84,000 silently)");
});

// ===========================================================================
// x42.af2-14d — THE OTHER RELEASE DOOR, AND THE TWO-STEP REMEDY. A parked
// reservation whose checker approved the settlement WHILE the maker was
// cancelling is released with the entry left standing — `unmatch_bank_match`
// says so in its own lifecycle note — and the exception was never resolved, so
// it is open and re-bookable with an approved settlement in the GL. That is the
// same double booking reached through a completely different door. And the
// remedy here is NOT "reverse it": a settlement entry carries allocations, so
// `reverse_entry` refuses `allocated_items_present` and the composed remedy has
// to name `unallocate_group` on the actual application group FIRST.
// ===========================================================================
test("x42.af2-14d a parked cancel whose settlement was already approved is caught by the same wall, and its remedy is the TWO-STEP unallocate-then-reverse chain", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rebookpark");
  const parked = await parkHighStakes({
    client, owner: sub, checker: world.users.bob, note: "x42 rebook-park: the ABC deposit",
  });
  const draft = await entryRowOf(parked.receipt.entry_id);
  await approveEntry(world.users.bob, {
    entry: parked.receipt.entry_id, expectedRevision: draft.revision_token, opKey: opk("x42-rbp-apr"),
  });
  assert.equal(await glTotal(client, BANKCOA), parked.cents,
    "mandatory setup: the checker's approval put the settlement into the bank GL");

  const cancel = await unmatchBankMatch(sub, {
    client, match: parked.match, reason: "x42 rebook-park: cancelling the reservation",
    opKey: opk("x42-rbp-cancel"),
  });
  assert.equal(cancel.draft_withdrawn, false,
    "mandatory setup: an APPROVED settlement is not withdrawn — this verb does not un-approve money");
  assert.equal((await exceptionRow(parked.exception)).status, "open",
    "…and the exception was never resolved, so it is open and re-bookable");

  // A SECOND booking on a DIFFERENT invoice is the realistic attack: the first
  // invoice is fully settled, so nothing else stops it.
  const inv2 = await stampedItem(sub, {
    client, domain: "ar", cp: parked.cp, cpKind: "customer", cents: parked.cents, control: AR1,
    postingDate: parked.period.mid, checker: world.users.bob,
  });
  const before = await glTotal(client, BANKCOA);
  const err = await refusesWithCode(
    () => resolveAndBookBankLine(sub, {
      client, exception: parked.exception, disposition: "matched_booking",
      note: "x42 rebook-park: settling it against the other invoice",
      allocations: [{ item_id: inv2.item, amount_cents: parked.cents }], opKey: opk("x42-rbp-2"),
    }),
    CLR10, T_BOOKED, "x42.af2-14d a second settlement while the cancelled park's entry stands",
  );
  assert.equal(await glTotal(client, BANKCOA), before,
    "THE MONEY: the bank GL did not double for one statement line");
  assert.ok(cancel.booking_outstanding, "…and the cancel had already reported the settlement it left standing");

  // The composed remedy is measured against what `reverse_entry` actually does.
  const detail = JSON.parse(err.detail);
  const booking = detail.bookings[0];
  assert.equal(booking.reverse_blocked_by, "allocated_items_present",
    "the predicate reports the gate reverse_entry will REALLY hit first, asked of reverse_entry's own body");
  const bare = await caught(() => reverseEntry(sub, {
    entry: booking.entry_id, reason: "x42 rebook-park: the naive remedy", opKey: opk("x42-rbp-bare"),
  }));
  assert.ok(bare, "…and a bare reverse_entry really is refused — the message would have been a lie");
  assert.equal(JSON.parse(bare.detail ?? "{}").reason, "allocated_items_present",
    `…by exactly the gate the predicate named (got ${bare.detail})`);
  assert.equal(booking.remedy_calls[0].fn, "clara.unallocate_group",
    "so the composed chain starts with the unallocate the human cannot guess");
  assert.ok(booking.remedy_calls[0].group_id, "…naming the application group by id, not 'unallocate first'");

  await runRemedy(sub, client, booking.remedy_calls, "x42.af2-14d", { checker: world.users.bob });
  assert.equal(await glTotal(client, BANKCOA), 0, "the two-step chain executes as written and unwinds the settlement");
  const second = await resolveAndBookBankLine(sub, {
    client, exception: parked.exception, disposition: "matched_booking",
    note: "x42 rebook-park: the corrected settlement",
    allocations: [{ item_id: inv2.item, amount_cents: parked.cents }], opKey: opk("x42-rbp-3"),
  });
  assert.equal(second.branch, "pending",
    "…and the re-book is admitted once the GL is clean (still high-stakes, so it parks again [WDB-G9])");
  assert.equal(await glTotal(client, BANKCOA), 0, "…its settlement is a DRAFT, so the GL is still clean");
  const reDraft = await entryRowOf(second.entry_id);
  await approveEntry(world.users.bob, {
    entry: second.entry_id, expectedRevision: reDraft.revision_token, opKey: opk("x42-rbp-apr2"),
  });
  await completePendingMatch(world.users.bob, {
    client, match: matchIdOf(second), opKey: opk("x42-rbp-flip2"),
  });
  assert.equal((await exceptionRow(parked.exception)).status, "resolved",
    "…the flip executes the declaration, so the whole corridor really does close");
  assert.equal(await glTotal(client, BANKCOA), parked.cents,
    "…leaving exactly ONE booking's worth of bank GL for the line");
});

// ===========================================================================
// x42.af2-14e — THE WALL MUST NOT FIRE WHERE NOTHING IS STANDING. Three shapes
// that all carry `resolution_exception_id` (or a group on the line) and must all
// stay re-bookable, because the wall keys on the ENTRY's liveness and nothing
// else. The SS7 parked-cancel drill is the one that would break loudest: the
// cancel LEAVES the id intact by design (admission site 7), so a wall keyed on
// the id would make every cancelled park permanently unbookable.
// ===========================================================================
test("x42.af2-14e the prior-booking wall keys on a LIVE entry, not on the stamp: a withdrawn park, an already-reversed booking and an unrelated group all stay bookable", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;

  // (i) THE SS7 PARKED-CANCEL DRILL. The draft is withdrawn, so nothing stands.
  const c1 = await freshAf2Client("rebookcancel");
  const parked = await parkHighStakes({
    client: c1, owner: sub, checker: world.users.bob, note: "x42 rebook-cancel: declared then dropped",
  });
  const cancel = await unmatchBankMatch(world.users.bob, {
    client: c1, match: parked.match, reason: "x42 rebook-cancel: not this customer after all",
    opKey: opk("x42-rbc-cancel"),
  });
  assert.equal(cancel.draft_withdrawn, true, "mandatory setup: the parked draft is withdrawn");
  assert.equal((await matchRow(parked.match)).resolution_exception_id, parked.exception,
    "…and the cancel LEAVES the stamp intact (design §4, site 7)");
  assert.equal(cancel.booking_outstanding, null,
    "a withdrawn draft is not a standing booking — the release reports nothing outstanding");
  assert.equal(await glTotal(c1, BANKCOA), 0, "…and the bank GL is untouched");
  const rebooked = await resolveAndBookBankLine(sub, {
    client: c1, exception: parked.exception, disposition: "matched_booking",
    note: "x42 rebook-cancel: booking it properly this time",
    allocations: [{ item_id: parked.item, amount_cents: parked.cents }], opKey: opk("x42-rbc-2"),
  });
  assert.ok(matchIdOf(rebooked), "the SS7 drill still ends re-bookable — the stamp alone never walls a line in");

  // (ii) AN ALREADY-REVERSED BOOKING. Same shape as 14c, but the human did the
  // unwind before coming back; the wall must be gone.
  const c2 = await freshAf2Client("rebookrev");
  const bl = await bankLine(sub, { client: c2, amountCents: 30_000, description: "x42 rebook-rev deposit" });
  const ex2 = await openException(sub, { client: c2, line: bl.line.id, reason: "x42 rebook-rev" });
  const booked = await resolveAndBookBankLine(sub, {
    client: c2, exception: ex2, disposition: "matched_booking", note: "x42 rebook-rev: first",
    draft: twoLegDraft(bl.period.mid, "x42 rebook-rev booking", 30_000), opKey: opk("x42-rbr-1"),
  });
  await unmatchBankMatch(sub, {
    client: c2, match: matchIdOf(booked), reason: "x42 rebook-rev: release", opKey: opk("x42-rbr-u"),
  });
  await reverseEntry(sub, { entry: booked.entry_id, reason: "x42 rebook-rev: un-book", opKey: opk("x42-rbr-rev") });
  assert.equal(await glTotal(c2, BANKCOA), 0, "mandatory setup: the reversal brought the account back to zero");
  const again = await resolveAndBookBankLine(sub, {
    client: c2, exception: ex2, disposition: "matched_booking", note: "x42 rebook-rev: second",
    draft: twoLegDraft(bl.period.mid, "x42 rebook-rev booking two", 30_000), opKey: opk("x42-rbr-2"),
  });
  assertEnvelope(again, { exception: ex2, branch: "live" }, "x42.af2-14e(ii) the re-book after a real reversal");
  assert.equal(await glTotal(c2, BANKCOA), 30_000, "…and the line carries exactly one booking again");

  // (iii) AN UNRELATED LIVE GROUP on the same client and the same bank account
  // carries no resolution_exception_id, so it can never be mistaken for a prior
  // booking on the excepted line beside it.
  const c3 = await freshAf2Client("rebookother");
  const bankAccount = await freshBankAccount(sub, c3);
  const p = nextPeriod();
  const stmt = await enterStatement(sub, {
    client: c3, bankAccount, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: [
      { amountCents: 15_000, entryDate: p.mid, description: "x42 rebook-other: the clean deposit" },
      { amountCents: 21_000, entryDate: p.mid, description: "x42 rebook-other: the excepted deposit" },
    ],
  });
  const [clean, excepted] = stmt.lines;
  const entry = await plainAt(sub, {
    client: c3, debit: BANKCOA, credit: REVN, cents: 15_000, postingDate: p.mid, memo: "x42 other",
  });
  await matchBankLine(sub, {
    client: c3, lines: [clean.id], entries: [{ entry_id: entry, matched_cents: 15_000 }],
    opKey: opk("x42-rbo-match"),
  });
  const ex3 = await openException(sub, { client: c3, line: excepted.id, reason: "x42 rebook-other" });
  const fresh = await resolveAndBookBankLine(sub, {
    client: c3, exception: ex3, disposition: "matched_booking", note: "x42 rebook-other: first booking",
    draft: twoLegDraft(p.mid, "x42 rebook-other booking", 21_000), opKey: opk("x42-rbo-1"),
  });
  assertEnvelope(fresh, { exception: ex3, branch: "live" }, "x42.af2-14e(iii) an unstamped group blocks nothing");
  assert.equal(await glTotal(c3, BANKCOA), 36_000, "…and both unrelated bookings stand side by side");
});

// ===========================================================================
// x42.af2-14f — THE COUNTERPARTY MAP UNDER THE LOCK LADDER (a FROZEN-SNAPSHOT
// read — one of the two D-a defect classes by name). The composite pre-acquires
// 203005003 on counterparties it canonicalises BEFORE the rungs, and
// `merge_counterparties` takes no advisory rung at all — so a merge landing in
// that window moves the chain tail and `_approve_entry_core` then takes the rung
// on a SURVIVOR this call never locked, while it already holds 203005004 and
// 203005006. That is the ladder inversion round 2 closed, re-opened through the
// map instead of the payload.
//
// THE INSTRUMENT IS pg_locks, not the refusal: arm (a) proves the round-2
// pre-acquisition really is observable, and arm (b) then demands that the raced
// call EITHER refuse by name OR hold the rung it is about to need. A build that
// books while holding neither fails here with the ladder named.
// ===========================================================================
test("x42.af2-14f a counterparty merge landing inside the composite's lock window is refused by name — and the pre-acquired 203005003 rung is measured through pg_locks", async (t) => {
  if (skipAf2(t, live)) return;
  const sub = world.users.alice;
  const client = await freshAf2Client("rebookrace");
  const stamp = Date.now().toString(36);
  const loser = await birthCounterparty(sub, { client, name: `X42 RACE A ${stamp}`, kind: "customer" });
  const survivor = await birthCounterparty(sub, { client, name: `X42 RACE B ${stamp}`, kind: "customer" });
  // ONE bank account, TWO lines: both arms book onto the same bank chart code, so
  // the fixture cannot fail for a bank-account reason that looks like a refusal.
  const bankAccount = await freshBankAccount(sub, client);
  const p = nextPeriod();
  const stmt = await enterStatement(sub, {
    client, bankAccount, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: [
      { amountCents: 12_000, entryDate: p.mid, description: "x42 race: the calm line" },
      { amountCents: 42_000, entryDate: p.mid, description: "x42 race: the raced line" },
    ],
  });
  const [calmLine, racedLine] = stmt.lines;

  // --- arm (a): THE POSITIVE CONTROL. No race; the composite books, and the
  // rung on the counterparty its proposal resolves to IS held. Without this the
  // whole measurement in arm (b) would be worthless.
  const exCalm = await openException(sub, { client, line: calmLine.id, reason: "x42 race calm" });
  const conn = await getPool().connect();
  try {
    await conn.query("begin");
    const pid = (await conn.query("select pg_backend_pid() as p")).rows[0].p;
    await conn.query(`set local role ${ROLES.authenticated}`);
    await conn.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub, role: "authenticated" })]);
    await conn.query(
      `select clara.resolve_and_book_bank_line(p_client => $1, p_exception => $2,
         p_disposition => 'matched_booking', p_note => 'x42 race calm booking',
         p_draft => $3::jsonb, p_op_key => $4) as r`,
      [client, exCalm,
        JSON.stringify(stampedDraft(p.mid, "x42 race calm", 12_000, AR1, survivor)),
        opk("x42-race-calm")],
    );
    assert.ok(await rungHeld(pid, client, survivor),
      "arm (a): the composite pre-acquires 203005003 on the line-stamped counterparty (round 2's invariant, read through pg_locks)");
    await conn.query("commit");
  } finally {
    await conn.query("rollback").catch(() => {});
    await conn.query("reset all").catch(() => {});
    conn.release();
  }

  // --- arm (b): THE RACE, forced deterministically. A barrier session holds the
  // 203005004 client rung, so the composite parks between its 203005003
  // acquisition and everything downstream; the merge then commits (it takes only
  // counterparty ROW locks, and the composite's draft does not exist yet, so
  // `open_draft_blocks` cannot see it); the barrier releases.
  
  const exRace = await openException(sub, { client, line: racedLine.id, reason: "x42 race" });
  const holder = await getPool().connect();
  const actor = await getPool().connect();
  // THE DEADLOCK PARTNER. An ordinary allocate-shaped session: 203005003 on the
  // SURVIVOR, then 203005004 — the house order, run forwards. It is what turns
  // the stale rung set into a real 40P01 instead of a theoretical one.
  const partner = await getPool().connect();
  let partnerWait = null;
  try {
    await holder.query("begin");
    await holder.query("select pg_advisory_xact_lock(203005004, hashtext($1::text))", [client]);
    await partner.query("begin");
    await partner.query("select pg_advisory_xact_lock(203005003, hashtext($1::text))",
      [`${client}:${survivor}`]);

    await actor.query("begin");
    const pid = (await actor.query("select pg_backend_pid() as p")).rows[0].p;
    await actor.query(`set local role ${ROLES.authenticated}`);
    await actor.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub, role: "authenticated" })]);
    const fired = actor.query(
      `select clara.resolve_and_book_bank_line(p_client => $1, p_exception => $2,
         p_disposition => 'matched_booking', p_note => 'x42 race booking',
         p_draft => $3::jsonb, p_op_key => $4) as r`,
      [client, exRace,
        JSON.stringify(stampedDraft(p.mid, "x42 race", 42_000, AR1, loser)),
        opk("x42-race")],
    ).then((r) => ({ ok: r.rows[0].r }), (err) => ({ err }));

    let waiting = false;
    for (let i = 0; i < 100 && !waiting; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      waiting = (await rootQuery(
        "select wait_event_type from pg_stat_activity where pid=$1", [pid],
      )).rows[0]?.wait_event_type === "Lock";
    }
    assert.ok(waiting, "mandatory setup: the composite really is parked on the client rung mid-flight");

    await mergeCounterparties(sub, {
      client, survivor, merged: loser, reason: "x42 race: the same customer, twice",
      opKey: opk("x42-race-merge"),
    });
    // The partner now queues for the client rung BEHIND the composite. If the
    // composite proceeds on its stale rung set, its inner approve will ask for
    // 203005003 on the survivor — which the partner holds while waiting on the
    // rung the composite holds. That is the cycle, and Postgres reports it.
    partnerWait = partner.query("select pg_advisory_xact_lock(203005004, hashtext($1::text))", [client])
      .then(() => ({ ok: true }), (err) => ({ err }));
    await holder.query("commit");
    const out = await fired;
    // Release whatever the composite ended up holding, so the partner's wait can
    // resolve either way; a rollback is correct on BOTH branches (the refusal
    // aborted the transaction, and a booking made under a stale rung set is not
    // a result this cell wants to keep).
    await actor.query("rollback").catch(() => {});
    const pOut = await partnerWait;

    // THE CONSEQUENCE, asserted first — it is what the guard exists to prevent,
    // and it lands on the INNOCENT session, not on the composite. pg_locks
    // records no acquisition ORDER, so this, not a lock read, is the evidence.
    assert.ok(pOut.ok,
      `an ordinary allocate-shaped session (203005003 on the survivor, then 203005004 — the house order, run FORWARDS) was killed by the composite: ${pOut.err?.code} ${pOut.err?.detail ?? pOut.err?.message}`);
    assert.notEqual(out.err?.code, "40P01",
      `the raced act itself deadlocked (40P01): ${out.err?.message}`);
    assert.ok(out.err,
      "the raced act must not proceed on a counterparty map that moved after its rungs were taken");
    assert.equal(out.err.code, CLR23,
      `…it refuses in the counterparty-landscape class (got ${out.err.code} — ${out.err.message})`);
    assert.equal(JSON.parse(out.err.detail ?? "{}").reason, T_LANDSCAPE,
      `…by the named token (got ${out.err.detail})`);
  } finally {
    if (partnerWait) await partnerWait.catch(() => {});
    await holder.query("rollback").catch(() => {});
    await actor.query("rollback").catch(() => {});
    await actor.query("reset all").catch(() => {});
    await partner.query("rollback").catch(() => {});
    holder.release(); actor.release(); partner.release();
  }

  assert.equal((await exceptionRow(exRace)).status, "open",
    "the refused race wrote nothing — the exception is exactly as it was");
  assert.equal((await groupsOfLine(racedLine.id)).length, 0, "…and the line carries no group");

  // THE REMEDY IS "RUN IT AGAIN", so it is exercised rather than asserted: the
  // landscape has settled, and the identical act now resolves against it.
  const retry = await resolveAndBookBankLine(sub, {
    client, exception: exRace, disposition: "matched_booking", note: "x42 race: the retry",
    draft: stampedDraft(p.mid, "x42 race retry", 42_000, AR1, survivor),
    opKey: opk("x42-race-retry"),
  });
  assertEnvelope(retry, { exception: exRace, branch: "live" }, "x42.af2-14f the retry after the merge settled");
  noteLane("x42.af2-14f: the merge race is forced through a 203005004 barrier; the rung is measured in pg_locks, not inferred");
});
