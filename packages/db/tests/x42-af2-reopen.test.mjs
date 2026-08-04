// 0042 Wave D-b — AF-2 PART 3: the POST-FLIP REOPEN and the guards around it
// (design §4). A live release that carries `resolution_exception_id` transitions
// EXACTLY that exception resolved -> open: status flipped, the FIVE resolution
// columns NULLed, `bank.line_exception_reopened` minted with the ABI §G payload,
// and an audit row carrying the erased owner act. Cells: the reopen itself + the
// settled-period law, `exception_reopen_blocked`, reopen IDENTITY, the set-once
// `resolution_exception_id` trigger + exactly-one semantics, and the
// ordinary-group unconditional refusals the seven-site admission must NOT widen.
//
// CONTRACT-BLIND — see `x42-af2.test.mjs`'s header for the lane law and
// `x42-af2-helpers.mjs`'s header for the interface-assumption register.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, reasonOf, endPool, printLaneNotes, printSkipCount, noteLane,
  HIGH_STAKES_CENTS,
} from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, refuses, refusesOneOf, caught,
  resolveAndBookBankLine, completeRecon,
  T, CLR10, EV_REOPENED, RESOLUTION_COLUMNS, BANKCOA, REVN, AR1,
  af2World, freshAf2Client, freshBankAccount, bankLine, nextPeriod, openException,
  parkHighStakes, plainAt, stampedItem, inOneHumanTxn,
  assertEnvelope, parkedDeclarationOf,
  entryRowOf, exceptionRow, exceptionRowsOfLine, eventsOf, eventTypeRegistered,
  auditRowsMentioning, groupsOfLine,
  lineGroupStatus, matchRow, matchIdOf, unmatchBankMatch, completePendingMatch,
  matchBankLine, settleFromBankLine, enterStatement, birthCounterparty, approveEntry,
} from "./x42-af2-world.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 REOPEN battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-af2-reopen");
  printSkipCount("x42-af2-reopen");
  await endPool();
});

/** Park → checker-approve → flip, leaving a LIVE group stamped with its
 *  exception and that exception RESOLVED. Every reopen cell starts here. */
async function parkedAndFlipped(client, label) {
  const owner = world.users.alice;
  const parked = await parkHighStakes({
    client, owner, checker: world.users.bob,
    note: `x42 ${label}: this is the ABC deposit`, description: `x42 ${label} deposit`,
  });
  const draft = await entryRowOf(parked.receipt.entry_id);
  await approveEntry(world.users.bob, {
    entry: parked.receipt.entry_id, expectedRevision: draft.revision_token, opKey: opk(`x42-${label}-approve`),
  });
  const flipped = await completePendingMatch(world.users.bob, {
    client, match: parked.match, opKey: opk(`x42-${label}-flip`),
  });
  assert.equal(flipped.status, "live", `${label} mandatory setup: the reservation flipped to live`);
  assert.equal((await exceptionRow(parked.exception)).status, "resolved",
    `${label} mandatory setup: the flip executed the declaration`);
  return parked;
}

/** The firm that owns a client (root readback — fixtures only). */
const firmIdOf = async (client) =>
  (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;

// ===========================================================================
// x42.af2-14 — THE POST-FLIP UNMATCH REOPENS. Releasing a live group that
// carries `resolution_exception_id` un-does the owner's resolution as well as
// the booking: the exception goes back to OPEN, the five resolution columns are
// NULLed, and the erased act survives in the audit + the ABI §G event. Without
// this, releasing the booking would leave a "resolved matched_booking" exception
// whose line is matched to nothing — the disposition hole 0040 closed, reopened
// from the other side.
// ===========================================================================
test("x42.af2-14 a LIVE release carrying resolution_exception_id transitions EXACTLY that exception resolved -> open, NULLs the five columns, and mints bank.line_exception_reopened", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("reopen");
  const parked = await parkedAndFlipped(client, "reopen");
  const before = await exceptionRow(parked.exception);
  assert.equal(before.resolved_by, world.users.alice, "mandatory setup: the DECLARANT is on the row");

  assert.ok(await eventTypeRegistered(EV_REOPENED),
    `0042 registers '${EV_REOPENED}' in clara.event_types (a missing registration is an FK failure at emission)`);
  const seenBefore = (await eventsOf(client, EV_REOPENED)).length;

  const receipt = await unmatchBankMatch(world.users.bob, {
    client, match: parked.match, reason: "x42 reopen: the deposit turned out to be someone else's",
    opKey: opk("x42-reopen"),
  });
  assert.equal(receipt.status, "unmatched", "the live group is released");

  const after = await exceptionRow(parked.exception);
  assert.equal(after.status, "open", "the release REOPENS the exception it booked");
  for (const col of RESOLUTION_COLUMNS) {
    assert.equal(after[col], null,
      `…and NULLs ${col} — an open exception may carry no resolution stamp (0040's ck_ble_resolution)`);
  }
  assert.equal((await lineGroupStatus(parked.line.id)).length, 0, "the line is released from every group");

  const events = await eventsOf(client, EV_REOPENED);
  assert.equal(events.length, seenBefore + 1, `exactly ONE ${EV_REOPENED} was minted`);
  const payload = events[events.length - 1].payload;
  assert.deepEqual(Object.keys(payload).sort(), ["exception_id", "line_id", "match_id"],
    `the payload is the ABI §G typed-primitive allowlist (got ${Object.keys(payload).join(",")})`);
  assert.equal(payload.exception_id, parked.exception, "…naming the reopened exception");
  assert.equal(payload.line_id, parked.line.id, "…its line");
  assert.equal(payload.match_id, parked.match, "…and the group whose release caused it");

  const audits = await auditRowsMentioning(parked.exception);
  assert.ok(audits.length > 0, "the reopen leaves an audit row naming the exception");
  assert.ok(
    audits.some((a) => JSON.stringify(a).includes(world.users.alice) || JSON.stringify(a).includes("matched_booking")),
    "…and the ERASED owner act (its declarant or its disposition) survives in that audit row",
  );
});

// ===========================================================================
// x42.af2-14b — THE REOPEN RESPECTS THE SETTLED-PERIOD LAW. A live release of a
// RECONCILED line is still refused: the reopen is a CONSEQUENCE of the release,
// never a licence for it. The remedy is unchanged — void the receipt chain back,
// newest first, then release.
// ===========================================================================
test("x42.af2-14b a live release of a RECONCILED line still refuses recon_period_settled — the reopen never licenses the release", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("reopenrecon");
  const parked = await parkedAndFlipped(client, "reopenrecon");

  const recon = await completeRecon(world.users.bob, { statement: parked.statement, opKey: opk("x42-rr-recon") });
  assert.ok(recon, "mandatory setup: the month reconciles once the booking is live and the exception resolved");

  await refuses(
    () => unmatchBankMatch(world.users.bob, {
      client, match: parked.match, reason: "x42 reopen-recon: releasing a certified term",
      opKey: opk("x42-rr-unmatch"),
    }),
    T.reconPeriodSettled,
    "x42.af2-14b releasing a live group inside a reconciled period",
  );
  assert.equal((await exceptionRow(parked.exception)).status, "resolved",
    "the refused release left the exception resolved — no half-reopen");
  assert.equal((await matchRow(parked.match)).status, "live", "…and the group live");
});

// ===========================================================================
// x42.af2-15 — `exception_reopen_blocked`. A reopen would put a SECOND open
// exception on the line, which 0040's uq_ble_line_open forbids; the release
// refuses BY NAME rather than letting a unique violation surface raw.
//
// FORCED STATE, and why: `except_bank_line` carries an EAGER
// `line_already_matched` guard, so the natural ordering can never build "an open
// exception on a line that is still in a live group". The newer exception is
// therefore INSERTed at the table inside the SAME transaction as the release
// (the x37/x40 forge precedent) — which is exactly the racing shape the named
// refusal exists to answer.
// ===========================================================================
test("x42.af2-15 exception_reopen_blocked: a NEWER OPEN exception on the line blocks the reopen, and the whole release aborts", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("reopenblock");
  const parked = await parkedAndFlipped(client, "reopenblock");
  const firm = await firmIdOf(client);

  const err = await caught(() => inOneHumanTxn(
    world.users.bob,
    (q) => q(
      "select clara.unmatch_bank_match(p_client => $1, p_match => $2, p_reason => $3, p_op_key => $4) as r",
      [client, parked.match, "x42 reopen-block: releasing while a newer dispute is open", opk("x42-rb-unmatch")],
    ),
    {
      rootPrelude: (q) => q(
        `insert into clara.bank_line_exceptions(firm_id, client_id, line_id, kind, reason, created_by)
           values ($1, $2, $3, 'disputed', 'x42 reopen-block: a newer, still-open dispute', $4)`,
        [firm, client, parked.line.id, world.users.alice],
      ),
    },
  ));
  assert.ok(err, "the release must refuse while a newer OPEN exception rides the same line");
  assert.equal(err.code, CLR10, `…as a CLR10 refusal (got ${err.code} — ${err.message})`);
  const token = reasonOf(err);
  assert.ok(
    token === T.reopenBlocked || `${err.message} ${err.detail ?? ""}`.includes(T.reopenBlocked),
    `…named '${T.reopenBlocked}' (got reason='${token ?? "(none)"}' — ${err.message})`,
  );

  // The whole transaction aborted, so neither the forged exception nor the
  // release survives — the line is exactly as it was before.
  assert.equal((await exceptionRowsOfLine(parked.line.id)).length, 1,
    "the aborted transaction left exactly the ONE original exception on the line");
  assert.equal((await exceptionRow(parked.exception)).status, "resolved", "…still resolved");
  assert.equal((await matchRow(parked.match)).status, "live", "…and its group still live");
});

// ===========================================================================
// x42.af2-16 — REOPEN IDENTITY. The reopen targets the exception the GROUP
// NAMES, never "the newest exception on the line". A line can carry several
// historical exception rows; picking the newest would reopen a dispute nobody
// released and leave the real one resolved against nothing.
//
// FORCED STATE, and why: a resolved exception can only be created by resolving
// an open one, and an open one cannot coexist with a live match — so a NEWER
// RESOLVED sibling is unreachable through the verbs. It is INSERTed at the table
// in a shape that satisfies both ck_ble_resolution and the authority belt's
// resolved arm on their own terms (an owner-rank declarant; a line that IS in a
// live match).
//
// AS-BUILT LADDER ROUND 4 — THE SIBLING'S DISPOSITION IS NOW LOAD-BEARING, and
// this recut is the finding, not a convenience. The first cut forged the sibling
// as `matched_booking`, which asserts "this line ends matched". Round 4 enforces
// that claim from the MATCH side as well (the belt's line-member arm), so a line
// carrying TWO booking-claiming exceptions is a line that cannot be released at
// all: releasing it leaves at least one of them claiming a booking on an
// unmatched line (`disposition_unbooked`), and only ONE exception per line may be
// open at a time (uq_ble_line_open), so the reopen cannot satisfy both. That
// state was always incoherent — round 3 simply could not see it, and shipped a
// release that produced exactly the hole this round closes.
// The sibling is therefore forged as `bank_corrective_line`: a LAWFUL resolved
// sibling (it is the one disposition C-c's terms say leaves a line unmatched by
// design), which is untouched by the reopen and asserted so below. The cell's
// subject is unchanged — the reopen must target the STAMPED exception and never
// "the newest row on the line".
// ===========================================================================
test("x42.af2-16 reopen identity: the reopened exception is the one resolution_exception_id NAMES, not the newest on the line", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("reopenid");
  const parked = await parkedAndFlipped(client, "reopenid");
  const firm = await firmIdOf(client);

  // The corrective pair's other half: a second line on the SAME account, in its
  // own period, so `ck_ble_resolution`'s "counterpart_line_id IS NULL = the
  // disposition is not bank_corrective_line" arm is satisfied honestly rather
  // than with a null the constraint would reject.
  const p2 = nextPeriod();
  const other = await enterStatement(world.users.alice, {
    client, bankAccount: parked.bankAccount, periodStart: p2.start, periodEnd: p2.end,
    opening: 0, keepPeriod: true,
    specs: [{ amountCents: -parked.cents, entryDate: p2.mid, description: "x42 reopen-id: the offsetting leg" }],
  });

  const forged = (await rootQuery(
    `insert into clara.bank_line_exceptions(
         firm_id, client_id, line_id, kind, reason, created_by,
         status, resolved_by, resolved_at, resolution_disposition, resolution_note,
         counterpart_line_id)
       values ($1, $2, $3, 'disputed', 'x42 reopen-id: a NEWER, already-resolved sibling', $4,
               'resolved', $4, now(), 'bank_corrective_line',
               'x42 reopen-id: closed as a corrective pair', $5)
       returning id`,
    [firm, client, parked.line.id, world.users.alice, other.lines[0].id],
  )).rows[0].id;
  const rows = await exceptionRowsOfLine(parked.line.id);
  assert.equal(rows.length, 2, "mandatory setup: the line now carries TWO exception rows");
  assert.equal(rows[rows.length - 1].id, forged, "…and the forged one is the NEWEST");
  assert.equal((await parkedDeclarationOf(parked.match)).resolutionExceptionId, parked.exception,
    "…while the group still names the ORIGINAL");

  await unmatchBankMatch(world.users.bob, {
    client, match: parked.match, reason: "x42 reopen-id: releasing the booking",
    opKey: opk("x42-rid-unmatch"),
  });

  assert.equal((await exceptionRow(parked.exception)).status, "open",
    "the STAMPED exception reopened — identity is by resolution_exception_id, exactly");
  assert.equal((await exceptionRow(forged)).status, "resolved",
    "…and the NEWER sibling was not touched at all");
  assert.equal((await exceptionRow(forged)).resolution_disposition, "bank_corrective_line",
    "…including its disposition: the reopen's subject is a BOOKING claim, and a corrective pair is not one");
  const events = await eventsOf(client, EV_REOPENED);
  assert.equal(events[events.length - 1].payload.exception_id, parked.exception,
    "the event names the stamped exception, not the newest");
});

// ===========================================================================
// x42.af2-17 — `resolution_exception_id` IS SET-ONCE. The stamp records which
// owner judgement a group carries; a later UPDATE that re-points it would
// silently re-attribute a booking. The narrow BEFORE-UPDATE trigger raises only
// when the column is already non-null AND the new value differs — so an
// idempotent re-write of the SAME value is admitted, and the NULL -> value path
// (the composite's own stamp, proven by every green cell above) stays open.
// ===========================================================================
test("x42.af2-17 resolution_exception_id is immutable once non-null: a re-point RAISES, an identical re-write is admitted", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("setonce");
  const sub = world.users.alice;
  const { line, period } = await bankLine(sub, { client, amountCents: 25_000, description: "x42 set-once probe" });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 set-once probe" });
  const receipt = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 set-once: booked",
    draft: {
      posting_date: period.mid, memo: "x42 set-once booking",
      lines: [
        { account_code: BANKCOA, debit_cents: 25_000, credit_cents: 0, description: "dr" },
        { account_code: REVN, debit_cents: 0, credit_cents: 25_000, description: "cr" },
      ],
    },
    opKey: opk("x42-setonce"),
  });
  assertEnvelope(receipt, { exception: ex, branch: "live" }, "x42.af2-17 setup");
  const match = matchIdOf(receipt);

  const decoyLine = await bankLine(sub, { client, amountCents: 9_000, description: "x42 set-once decoy" });
  const decoy = await openException(sub, { client, line: decoyLine.line.id, reason: "x42 set-once decoy" });

  const err = await caught(() => rootQuery(
    "update clara.bank_matches set resolution_exception_id = $2 where id = $1", [match, decoy]));
  assert.ok(err, "re-pointing a stamped group at a different exception must RAISE");
  noteLane(`x42.af2-17: the set-once trigger refused code=${err.code} — ${err.message}`);
  assert.equal((await matchRow(match)).resolution_exception_id, ex, "the original stamp survives the refused UPDATE");

  const same = await caught(() => rootQuery(
    "update clara.bank_matches set resolution_exception_id = $2 where id = $1", [match, ex]));
  assert.equal(same, null,
    `an IDENTICAL re-write is admitted (the trigger raises only on IS DISTINCT FROM) — got ${same?.message}`);
  assert.equal((await matchRow(match)).resolution_exception_id, ex, "…and the value is unchanged");
  assert.equal((await exceptionRow(decoy)).status, "open", "the decoy exception was never resolved");
});

// ===========================================================================
// x42.af2-17b — EXACTLY ONE. A second composite on an exception that is already
// resolved-and-booked is refused by the state machine it already passed through
// (the exception is resolved; the line is matched). Two bookings of one
// judgement is the double-post this whole composite exists to prevent.
// ===========================================================================
test("x42.af2-17b exactly-one: a SECOND composite on the same exception is refused (already resolved / already matched)", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("exactlyone");
  const sub = world.users.alice;
  const { line, period } = await bankLine(sub, { client, amountCents: 35_000, description: "x42 exactly-one probe" });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 exactly-one probe" });
  const draft = {
    posting_date: period.mid, memo: "x42 exactly-one booking",
    lines: [
      { account_code: BANKCOA, debit_cents: 35_000, credit_cents: 0, description: "dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 35_000, description: "cr" },
    ],
  };
  const first = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 exactly-one: the real booking",
    draft, opKey: opk("x42-eo-1"),
  });
  assertEnvelope(first, { exception: ex, branch: "live" }, "x42.af2-17b the first call");

  await refusesOneOf(
    () => resolveAndBookBankLine(sub, {
      client, exception: ex, disposition: "matched_booking", note: "x42 exactly-one: the second attempt",
      draft, opKey: opk("x42-eo-2"),
    }),
    [T.alreadyResolved, T.alreadyMatched, T.lineAlreadyMatched],
    "x42.af2-17b a second composite on an already-booked exception",
  );
  assert.equal((await groupsOfLine(line.id)).length, 1, "the line carries exactly ONE group — no second booking");
});

// ===========================================================================
// x42.af2-18 — ORDINARY GROUPS KEEP THEIR UNCONDITIONAL REFUSALS. The seven-site
// admission (design §4) admits ONLY the composite's own parked-or-resolved
// declaration; it is not a general widening of the bank walls. Probed at three
// of the seven sites, in ONE reconciled world so the settled-period law is real:
//   (i)   the settle core's `line_excepted` wall — an ordinary settle on an
//         open-excepted line still refuses, reconciled period or not;
//   (ii)  `match_bank_line`'s own wall on the same line;
//   (iii) `unmatch_bank_match`'s verb-side settled guard — an ordinary live
//         group inside a reconciled period still refuses.
// …and then the composite ITSELF succeeds on that same excepted line, which is
// what proves the admission is scoped to the declaration rather than switched off.
// ===========================================================================
test("x42.af2-18 the seven-site admission does NOT widen the ordinary doors: settle, match and unmatch keep their unconditional refusals, while the composite is admitted", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("ordinary");
  const sub = world.users.alice;
  const cp = await birthCounterparty(sub, { client, name: `X42 ORDCO ${Date.now().toString(36)}`, kind: "customer" });
  const bankAccount = await freshBankAccount(sub, client);
  const p = nextPeriod();
  const stmt = await enterStatement(sub, {
    client, bankAccount, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: [
      { amountCents: 60_000, entryDate: p.mid, description: "x42 ordinary: the clean deposit" },
      { amountCents: 20_000, entryDate: p.mid, description: "x42 ordinary: the disputed deposit" },
    ],
  });
  const [clean, disputed] = stmt.lines;

  const entry = await plainAt(sub, {
    client, debit: BANKCOA, credit: REVN, cents: 60_000, postingDate: p.mid, memo: "x42 ordinary receipt",
  });
  const ordinary = matchIdOf(await matchBankLine(sub, {
    client, lines: [clean.id], entries: [{ entry_id: entry, matched_cents: 60_000 }], opKey: opk("x42-ord-match"),
  }));
  const ex = await openException(sub, { client, line: disputed.id, reason: "x42 ordinary: this deposit is disputed" });
  const recon = await completeRecon(sub, { statement: stmt.statementId, opKey: opk("x42-ord-recon") });
  assert.ok(recon, "mandatory setup: the month reconciles with one matched line and one excepted line");

  // (i) + (ii) — the two ordinary booking doors, on an open-excepted line. Each
  // is given a REAL allocation target so that `line_excepted` is genuinely the
  // first wall it meets, not an incidental shape refusal.
  const inv = await stampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: 20_000, control: AR1, postingDate: p.mid,
  });
  await refuses(
    () => settleFromBankLine(sub, {
      client, line: disputed.id, counterparty: cp,
      allocations: [{ item_id: inv.item, amount_cents: 20_000 }],
      memo: "x42 ordinary settle attempt", postingDate: p.mid, opKey: opk("x42-ord-settle"),
    }),
    T.lineExcepted,
    "x42.af2-18(i) an ordinary settle_from_bank_line on an open-excepted line",
  );
  const other = await plainAt(sub, {
    client, debit: BANKCOA, credit: REVN, cents: 20_000, postingDate: p.mid, memo: "x42 ordinary second receipt",
  });
  await refuses(
    () => matchBankLine(sub, {
      client, lines: [disputed.id], entries: [{ entry_id: other, matched_cents: 20_000 }],
      opKey: opk("x42-ord-match2"),
    }),
    T.lineExcepted,
    "x42.af2-18(ii) an ordinary match_bank_line on an open-excepted line",
  );

  // (iii) the ordinary live group inside the now-reconciled period.
  await refuses(
    () => unmatchBankMatch(sub, {
      client, match: ordinary, reason: "x42 ordinary: releasing a certified term", opKey: opk("x42-ord-unmatch"),
    }),
    T.reconPeriodSettled,
    "x42.af2-18(iii) an ordinary unmatch inside a reconciled period",
  );

  // …and the composite IS admitted on the very same excepted line.
  const receipt = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking",
    note: "x42 ordinary: the dispute is settled and the deposit is booked",
    allocations: [{ item_id: inv.item, amount_cents: 20_000 }],
    opKey: opk("x42-ord-af2"),
  });
  assertEnvelope(receipt, { exception: ex, branch: "live" }, "x42.af2-18 the admitted composite");
  assert.equal((await matchRow(matchIdOf(receipt))).resolution_exception_id, ex,
    "…and the admitted group carries the resolution_exception_id that earned it the admission");
});

// ===========================================================================
// x42.af2-18b — `complete_pending_match`'s OWN preconditions are unchanged for
// an ORDINARY reservation. The flip's declaration arm must be ADDITIVE: a
// pending group with no declaration still refuses to complete until its
// settlement has actually been approved by a checker.
// ===========================================================================
test("x42.af2-18b an ORDINARY pending reservation still refuses to complete while its settlement is a draft", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("ordpending");
  const sub = world.users.alice;
  const cp = await birthCounterparty(sub, { client, name: `X42 ORDPEND ${Date.now().toString(36)}`, kind: "customer" });
  const { line, period } = await bankLine(sub, {
    client, amountCents: HIGH_STAKES_CENTS, description: "x42 ordinary pending reservation",
  });
  const inv = await stampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: HIGH_STAKES_CENTS, control: AR1,
    postingDate: period.mid, checker: world.users.bob,
  });
  const receipt = await settleFromBankLine(sub, {
    client, line: line.id, counterparty: cp,
    allocations: [{ item_id: inv.item, amount_cents: HIGH_STAKES_CENTS }],
    memo: "x42 ordinary high-stakes settlement", postingDate: period.mid, opKey: opk("x42-ordpend"),
  });
  const match = matchIdOf(receipt);
  const decl = await parkedDeclarationOf(match);
  assert.equal(decl.status, "pending", "mandatory setup: an ordinary high-stakes settlement reserves the line");
  assert.equal(decl.pendingResolution, null, "…carrying NO declaration");
  assert.equal(decl.resolutionExceptionId, null, "…and NO resolution_exception_id");

  await refuses(
    () => completePendingMatch(world.users.bob, { client, match, opKey: opk("x42-ordpend-flip") }),
    "entry_not_approved",
    "x42.af2-18b completing an ordinary reservation whose settlement is still a draft",
  );
  assert.equal((await matchRow(match)).status, "pending", "the reservation survives the refused completion");
});
