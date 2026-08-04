// 0042 Wave D-b — AF-2 PART 4: the SETTLED-PERIOD admission sites read as ONE
// mechanism, and the composite's LOCK LADDER read from the caller's side.
// As-built ladder round 2; design §4 / WDB-G9 + the design's §4 lock-order law.
//
// CELL 1 — SITES 6 AND 7 MUST KEY ON THE SAME EVIDENCE. The parked cancel is
// guarded twice: once by the verb (`unmatch_bank_match`'s settled-period guard) and
// once by the deferred authority belt at COMMIT. If the two ask different questions
// there is a state that the verb admits and the belt aborts — and the reachable one
// is exactly the state the FLIP's own refusal tells the human to escape by
// cancelling. That is the WALLED CORRIDOR class (a refusal whose named remedy is
// itself refused), which this ladder has already ruled a defect once.
//
// CELL 2 — THE HAND-DRAFT LEG'S TOP-LEVEL COUNTERPARTY IS A RUNG. The composite
// pre-acquires 203005003 → 203005004 → 203005006 so every inner verb's own
// acquisition is same-transaction re-entrant. `p_draft.counterparty` is resolved
// and locked by `_approve_entry_core` deep inside the call, so a counterparty named
// ONLY there — not on any line — inverted the ladder against ordinary allocation
// traffic. The cell holds the counterparty rung from a second session and proves
// the composite waits THERE, not while holding the client rung.
//
// CONTRACT-BLIND — see `x42-af2.test.mjs`'s header for the lane law and
// `x42-af2-helpers.mjs`'s header for the interface-assumption register.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, noteLane,
  HIGH_STAKES_CENTS, entryStatusOf, getPool, ROLES, idOf,
} from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, refusesWithCode,
  resolveAndBookBankLine, resolveException, completeRecon,
  T, CLR10,
  AR1, BANKCOA, EXPN,
  af2World, freshAf2Client, freshBankAccount, nextPeriod, openException, stampedItem,
  enterStatement, birthCounterparty, manualRes,
  parkedDeclarationOf, exceptionRow, matchRow, matchIdOf, lineGroupStatus,
  unmatchBankMatch, completePendingMatch, approveEntry, entryRowOf,
} from "./x42-af2-world.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 SETTLED battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-af2-settled");
  printSkipCount("x42-af2-settled");
  await endPool();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until backend `pid` is WAITING on a Lock held by `blockerPid` (the house
 *  X7 law: a schedule that never blocked proves nothing). */
async function waitBlockedBy(pid, blockerPid, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await sleep(50);
  }
  return false;
}

// ===========================================================================
// x42.af2-19 — THE PARKED CANCEL SURVIVES A STALE DECLARATION INSIDE A
// RECONCILED PERIOD (admission sites 6 and 7 agree).
//
// THE REACHABLE STALE STATE, built through audited verbs only: while a group is
// PARKED its named exception is still OPEN, and a direct
// `resolve_bank_line_exception` can still close it under `bank_corrective_line` —
// the one disposition the 0040 authority belt admits with no live match (the other
// two refuse `disposition_unbooked` against a merely-pending group). The flip then
// refuses `pending_resolution_stale` and NAMES the cancel as the remedy.
//
// WHY THE CANCEL IS ARITHMETICALLY NEUTRAL, so admitting it is right and not
// merely kind: a parked group is created with `completed_at` NULL and never goes
// live, so it is a term of no receipt's matched set either way; and excepted(P) is
// cutoff-gated, so the corrective resolution is invisible to the covering receipt.
// ===========================================================================
/** A PARKED reservation on a line inside a COMPLETED reconciliation, whose
 *  declaration has since gone STALE — built entirely through audited verbs.
 *
 *  The statement carries the parked line and its exact offsetting counterpart, so
 *  the month certifies at zero with BOTH lines riding excepted(P) and nothing
 *  matched — the lawful C-c state the parked resolution exists to serve. The park
 *  then lands (admission site 2), and a direct `resolve_bank_line_exception` closes
 *  the parked exception as a corrective pair. */
async function settledStalePark(label) {
  const client = await freshAf2Client(label);
  const owner = world.users.alice;
  const cents = HIGH_STAKES_CENTS;
  const bankAccount = await freshBankAccount(owner, client);
  const p = nextPeriod();
  const stmt = await enterStatement(owner, {
    client, bankAccount, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: [
      { amountCents: cents, entryDate: p.mid, description: `x42 ${label}: large unidentified deposit` },
      { amountCents: -cents, entryDate: p.mid, description: `x42 ${label}: the bank's own reversal out` },
    ],
  });
  const parkedLine = stmt.lines[0];
  const counterLine = stmt.lines[1];
  const exParked = await openException(owner, { client, line: parkedLine.id, reason: `x42 ${label}: whose deposit is this?` });
  const exCounter = await openException(owner, { client, line: counterLine.id, reason: `x42 ${label}: the offsetting reversal` });

  const recon = await completeRecon(world.users.bob, { statement: stmt.statementId, opKey: opk(`x42-${label}-recon`) });
  assert.ok(recon, `${label} mandatory setup: the month reconciles with both lines excepted and nothing matched`);
  const reconId = idOf(recon, "reconciliation_id", "id");

  const cp = await birthCounterparty(owner, { client, name: `X42 ${label.toUpperCase()} ${Date.now().toString(36)}`, kind: "customer" });
  const inv = await stampedItem(owner, {
    client, domain: "ar", cp, cpKind: "customer", cents, control: AR1,
    postingDate: p.mid, checker: world.users.bob,
  });
  const note = `x42 ${label}: book it against the ABC invoice`;
  const receipt = await resolveAndBookBankLine(owner, {
    client, exception: exParked, disposition: "matched_booking", note,
    allocations: [{ item_id: inv.item, amount_cents: cents }],
    opKey: opk(`x42-${label}-park`),
  });
  const match = matchIdOf(receipt);
  const parked = await matchRow(match);
  assert.equal(parked.status, "pending",
    `${label} mandatory setup: at high stakes the composite parks a PENDING reservation (its member INSERT admitted by site 2)`);
  assert.equal(parked.completed_at ?? null, null,
    `${label}: …created with completed_at NULL — which is why no receipt ever counts a park as matched`);

  await resolveException(owner, {
    client, exception: exParked, disposition: "bank_corrective_line",
    note: `x42 ${label}: it was the bank's own error, netted by the reversal line`,
    counterpartLine: counterLine.id, opKey: opk(`x42-${label}-corrective`),
  });
  assert.equal((await exceptionRow(exParked)).status, "resolved",
    `${label} mandatory setup: the declaration now names a NON-OPEN exception`);
  assert.equal((await exceptionRow(exCounter)).status, "resolved", `${label}: …and the pair closed both legs`);
  return { client, owner, parkedLine, counterLine, exParked, exCounter, receipt, match, reconId, note };
}

/** After a lawful parked cancel: the declaration dies, the identity survives, the
 *  line is free, the exception is untouched and the receipt still stands. */
async function assertParkReleased(s, label) {
  const after = await parkedDeclarationOf(s.match);
  assert.equal(after.status, "unmatched", `${label}: the group is unmatched`);
  assert.equal(after.pendingResolution, null, `${label}: the declaration dies with the reservation`);
  assert.equal(after.resolutionExceptionId, s.exParked,
    `${label}: …while the identity column is left INTACT (design §4, site 7)`);
  assert.equal((await lineGroupStatus(s.parkedLine.id)).length, 0, `${label}: the line is released`);
  assert.equal((await exceptionRow(s.exParked)).status, "resolved",
    `${label}: the cancel does NOT reopen a PENDING group's exception — only a LIVE release reopens, and a park books nothing`);
  const reconRow = (await rootQuery(
    "select status from clara.bank_reconciliations where id = $1", [s.reconId])).rows[0];
  assert.equal(reconRow?.status, "complete",
    `${label}: the covering reconciliation is still COMPLETE — nothing had to be voided to get here`);
}

test("x42.af2-19 a parked reservation inside a RECONCILED period whose exception was closed directly is still cancellable: the verb guard and the deferred belt agree", async (t) => {
  if (skipAf2(t, live)) return;
  const s = await settledStalePark("settledpark");

  const cancel = await unmatchBankMatch(world.users.bob, {
    client: s.client, match: s.match,
    reason: "x42 settled park: the corrective pair explains it; release the reservation",
    opKey: opk("x42-settledpark-cancel"),
  });
  assert.equal(cancel.status, "unmatched",
    "site 6 admits the parked cancel at the VERB and site 7 admits the SAME act at COMMIT — a disagreement here is a reservation nobody can release");
  assert.equal(cancel.draft_withdrawn, true,
    "…and the anchored settlement draft is withdrawn in the same transaction (the C-b pair-closes law)");
  assert.equal(await entryStatusOf(s.receipt.entry_id), "withdrawn", "…and the entry really is withdrawn");
  await assertParkReleased(s, "x42.af2-19");
});

// ===========================================================================
// x42.af2-19b — THE CORRIDOR ITSELF. Once the checker has approved the parked
// settlement, the flip is the natural next act — and it refuses
// `pending_resolution_stale`, NAMING `unmatch_bank_match` as the remedy. If that
// cancel is admitted by the verb and then aborted at COMMIT by the belt, the human
// has been handed a remedy that does not exist: the reservation can be neither
// completed nor released, and the only escape the message offers is a lie.
// ===========================================================================
test("x42.af2-19b the flip's pending_resolution_stale refusal NAMES the cancel, and that cancel then actually succeeds inside the reconciled period", async (t) => {
  if (skipAf2(t, live)) return;
  const s = await settledStalePark("settledflip");

  // The checker approves the parked settlement, so the flip reaches its OWN
  // stale-declaration wall rather than the earlier `entry_not_approved` one.
  const draft = await entryRowOf(s.receipt.entry_id);
  await approveEntry(world.users.bob, {
    entry: s.receipt.entry_id, expectedRevision: draft.revision_token, opKey: opk("x42-settledflip-apr"),
  });

  const stale = await refusesWithCode(
    () => completePendingMatch(world.users.bob, { client: s.client, match: s.match, opKey: opk("x42-settledflip-flip") }),
    CLR10, T.pendingResolutionStale,
    "x42.af2-19b the flip refuses a declaration whose exception is no longer open",
  );
  assert.ok(/unmatch_bank_match/.test(`${stale.message}`),
    `…and NAMES the cancel as the remedy (got: ${stale.message})`);
  assert.equal((await matchRow(s.match)).status, "pending", "the refused flip leaves the reservation pending");

  const cancel = await unmatchBankMatch(world.users.bob, {
    client: s.client, match: s.match,
    reason: "x42 settled flip: the corrective pair explains it; release the reservation",
    opKey: opk("x42-settledflip-cancel"),
  });
  assert.equal(cancel.status, "unmatched",
    "THE NAMED REMEDY WORKS: a refusal whose remedy is itself refused is the walled-corridor class this ladder rules a defect");
  await assertParkReleased(s, "x42.af2-19b");

  // THE HONEST RESIDUE, asserted rather than assumed. The settlement was APPROVED
  // before the flip refused, and `unmatch_bank_match` withdraws DRAFTS only — so the
  // approved entry survives the release exactly as it does after any ordinary live
  // release, and reversing it is the human's next act. That state is reached by the
  // approval and the refused flip, not by the cancel: refusing the cancel would have
  // left the very same entry standing AND an unreleasable reservation beside it.
  assert.equal(await entryStatusOf(s.receipt.entry_id), "approved",
    "the approved settlement survives the cancel (0038 release semantics: only drafts are withdrawn)");
  noteLane("x42.af2-19b: after a post-approval parked cancel the settlement entry stays APPROVED and unmatched — the human's next act is reverse_entry (0038 release semantics, unchanged by D-b)");
});

// ===========================================================================
// x42.af2-20 — THE COMPOSITE PRE-LOCKS THE HAND-DRAFT'S TOP-LEVEL COUNTERPARTY.
// A second session holds 203005003 for that counterparty and then asks for
// 203005004 (the client rung) — the ordinary allocate ladder, in its own order. If
// the composite has taken the client rung and is waiting for the counterparty rung
// deep inside `_approve_entry_core`, the two close a cycle and Postgres kills one
// with 40P01. With the rung pre-acquired in the house order the composite waits
// BEFORE the client rung, the holder's own acquisition proceeds, and both finish.
// ===========================================================================
test("x42.af2-20 a hand-draft naming p_draft.counterparty pre-locks that counterparty's rung: no lock-order inversion against a holder of 203005003", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("lockorder");
  const owner = world.users.alice;
  const cents = 30_000;

  const cp = await birthCounterparty(owner, { client, name: `X42 LOCKCO ${Date.now().toString(36)}`, kind: "vendor" });
  const bankAccount = await freshBankAccount(owner, client);
  const p = nextPeriod();
  const stmt = await enterStatement(owner, {
    client, bankAccount, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: [{ amountCents: -cents, entryDate: p.mid, description: "x42 lock-order payment out" }],
  });
  const line = stmt.lines[0];
  const ex = await openException(owner, { client, line: line.id, reason: "x42 lock-order: unidentified payment" });
  const resolution = await manualRes(owner, client);

  // The counterparty is named ONLY at the top level — no line carries it — so the
  // ONLY body that can learn about it is `_approve_entry_core`, deep inside.
  const draft = {
    posting_date: p.mid, memo: "x42 lock-order booking",
    resolution,
    counterparty: { existing_id: cp },
    lines: [
      { account_code: EXPN, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
  };

  const holder = await getPool().connect();
  const actor = await getPool().connect();
  const out = { composite: null, holderRung: null, provedBlocked: false };
  try {
    const holderPid = (await holder.query("select pg_backend_pid() as pid")).rows[0].pid;
    await holder.query("begin");
    await holder.query("set local statement_timeout = '25s'");
    // The counterparty rung, exactly as allocate_receipt / allocate_payment take it.
    await holder.query("select pg_advisory_xact_lock(203005003, hashtext($1||':'||$2))", [client, cp]);

    const actorPid = (await actor.query("select pg_backend_pid() as pid")).rows[0].pid;
    await actor.query("begin");
    await actor.query("set local statement_timeout = '25s'");
    await actor.query(`set local role ${ROLES.authenticated}`);
    await actor.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: owner, role: "authenticated" })]);
    const fired = actor
      .query(
        `select clara.resolve_and_book_bank_line(p_client => $1, p_exception => $2,
            p_disposition => $3, p_note => $4, p_draft => $5::jsonb, p_op_key => $6) as r`,
        [client, ex, "matched_booking", "x42 lock-order: this is the LOCKCO payment",
          JSON.stringify(draft), opk("x42-lockorder")],
      )
      .then((r) => { out.composite = { ok: true, receipt: r.rows[0].r }; })
      .catch((e) => { out.composite = { ok: false, code: e.code, message: `${e.message} ${e.detail ?? ""}`.trim() }; });

    out.provedBlocked = await waitBlockedBy(actorPid, holderPid);

    // THE DISCRIMINATOR. The holder now asks for the client rung — the second step
    // of the ordinary ladder. It must be free.
    try {
      await holder.query("select pg_advisory_xact_lock(203005004, hashtext($1))", [client]);
      out.holderRung = { ok: true };
    } catch (e) {
      out.holderRung = { ok: false, code: e.code, message: e.message };
    }
    await holder.query("rollback").catch(() => {});
    await fired;
    await actor.query("commit").catch(() => actor.query("rollback").catch(() => {}));
  } finally {
    for (const c of [holder, actor]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }

  assert.ok(out.provedBlocked,
    "the schedule must actually BLOCK on the counterparty rung — a schedule that never blocked proves nothing (X7)");
  assert.ok(out.holderRung?.ok,
    `the counterparty-rung holder must be able to take the CLIENT rung: the composite may not hold it while waiting for 203005003 (got ${JSON.stringify(out.holderRung)})`);
  assert.notEqual(out.composite?.code, "40P01",
    `no deadlock: the composite must wait at the counterparty rung, in the house order (got ${JSON.stringify(out.composite)})`);
  assert.ok(out.composite?.ok,
    `…and the booking then completes once the rung is released (got ${JSON.stringify(out.composite)})`);
  assert.equal(out.composite.receipt?.resolution_exception_id, ex,
    "the envelope names the exception it resolved");
  noteLane(`x42.af2-20: the composite blocked on 203005003 and the holder took 203005004 freely (branch=${out.composite.receipt?.branch})`);
});
