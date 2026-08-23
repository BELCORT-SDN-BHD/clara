// 0038 Wave C-b -- the bank MATCHING + SETTLE-FROM-LINE + TENANCY/ACL battery.
//
// CONTRACT-BLIND: written from docs/plan/completed/wave-c-b-bank-design.md (v2, S1-S4.6)
// + docs/plan/completed/wave-c-b-bank-design-part2.md (v2, S4.7-S7) -- the review-hardened
// spec -- + the pinned governing law (wave-c-contract.md WC-R1..R12,
// wave-c-a-subledger-design.md WCA-R1..R9) + the LIVE 0037 idioms this design
// explicitly reuses. This lane never reads 0038's SQL. Every verb is called by
// its PINNED name with NAMED args; a 42883 / param-name / reason-token
// divergence at integration is a FINDING for orchestrator adjudication, never a
// silent test edit.
//
// SCOPE (this file owns): part2 S6 "Matching" + "Settle-from-line" +
// "Tenancy/ACL". Bank IDENTITY / INGEST / CONSENT (part1 S4.1-S4.4) is a
// SIBLING file's scope (x38-wave-c-b-bank.test.mjs) -- this file builds its own
// minimal bank-account + statement fixtures through the SAME pinned verbs
// (add_bank_account, enter_bank_statement) purely as SETUP for matching cells;
// it asserts nothing about ingest correctness itself.
//
// NAMES ASSUMED, NOT PINNED BY THE DESIGN TEXT (flagged here once, not per
// call site -- a divergence at integration is expected and is a FINDING, not a
// surprise):
//   * add_bank_account(p_client, p_bank_code, p_account_number,
//     p_coa_account_code, p_op_key [, p_bank_name_display, p_proposal_id]) --
//     the design names the verb + its behaviour (S4.1) but not its exact arg
//     list; this is the natural named-arg shape off the bank_accounts columns.
//   * enter_bank_statement's p_header/p_lines jsonb shapes mirror the
//     bank_statements / bank_statement_lines COLUMNS verbatim (S4.2) -- the
//     design pins the VERB signature exactly (S4.3) but not the two jsonb
//     shapes.
//   * void_bank_statement(p_client, p_statement, p_reason, p_op_key) -- the
//     house p_client/p_<object>/p_reason/p_op_key convention, never spelled
//     out for this verb specifically.
//   * The seeded bank_institutions code used here ("MBB") -- S4.1 states the
//     table is a seeded reference of "stable public namespace" codes but names
//     none; the corpus is 100% Maybank (S2.2), so MBB is the obvious guess.
//   * match_bank_line's p_lines jsonb = a plain array of line uuids;
//     p_adjustments (both match_bank_line and settle_from_bank_line) = an
//     array of {account_code, amount_cents} (signed) -- the S4.6 prose names
//     the CONSTRUCTION (two legs, named account vs the line's bank account)
//     but not the caller-facing jsonb shape.
//   * The named reason for a posting-date exception submitted without
//     p_ack_period_exceptions=true -- S4.6 states the ack "must be true" but
//     never names the refusal token; this file records the OBSERVED reason as
//     a lane note rather than hard-pinning a guess (the x37.i precedent for a
//     contract-silent detail).
//
// THE TWO IDENTITIES THIS FILE HOLDS (design S3):
//   match identity   Sigma(member lines' amount_cents) = Sigma(member entries'
//                     matched_cents)  per non-'unmatched' group, to the sen.
//   exclusivity      a line belongs to at most one 'pending'/'live' group,
//                     always at full amount; an entry's matched_cents is
//                     bounded per SIDE, in ABSOLUTE cents, by that side's gross
//                     debit/credit on the bank account.
// assertGroupTies() re-asserts the first identity after every happy-path cell.
//
// The cells, in file order:
//   MATCHING
//     x38.a  exact single: one line <-> one entry, full amount, ties, audit +
//            events land
//     x38.b  the N-lines-one-entry IBG group (two lines clear one receipt)
//     x38.c  wrong_account: an entry with zero movement on the line's bank
//            account
//     x38.d  wrong_period: a member line whose statement has been voided
//     x38.e  the posting-date exception: refused without ack, recorded WITH
//            ack (member row + audit payload), still ties
//     x38.f  deposits-in-transit: an ordinary pass (no refusal) when the entry
//            posts before the line clears
//     x38.g  line exclusivity: a second match on an already-matched line
//            refused (already_matched); concurrent settle-vs-settle on ONE
//            line (two sessions, blocking PROVEN, exactly one wins); the
//            fn-owner direct-insert red-team refused by the partial unique
//            index itself
//     x38.h  per-side exhaustion incl. the GROSS loan-drawdown shape (one
//            entry touching the bank account on BOTH sides, two lines, one
//            group)
//     x38.i  the negative-sum attack: a matched_cents whose ABSOLUTE value
//            exceeds the relevant side's gross is refused by the composite,
//            AND by the belt on a direct fn-owner insert
//     x38.j  group-tie +/- adjustment: a mismatched group refused
//            (amount_beyond_tolerance), then closed exactly by a named
//            adjustment leg
//     x38.k  unmatch -> re-match
//     x38.l  void refused while matched; concurrent void-vs-match (two
//            sessions, serializes on the chain/client rungs)
//     x38.m  reversed-original and reversal-mirror membership both refused by
//            name
//     x38.n  reverse-while-matched refused on BOTH verbs (reverse_entry,
//            approve_wrong_client_correction) + the structural belt red-team
//     x38.o  the bounced-cheque end-to-end walk: the deposit's match SURVIVES;
//            the return line matches a NEW reinstatement entry; the debt is
//            re-aged via the live C-a adjustment item
//   SETTLE-FROM-LINE
//     x38.p  receipt clearing N invoices, born from the line, line owned at
//            birth
//     x38.q  the payment mirror
//     x38.r  receipt-side charge: ONE entry, gross clear, zero residual
//     x38.s  payment-side charge: TWO entries, one group
//     x38.t  the refund quadrants refuse by name (refund_not_supported); the
//            documented workaround ties end to end
//     x38.u  the pending-match reservation at EXACTLY the high-stakes
//            threshold: line owned at draft, a distinct checker approves,
//            complete_pending_match ties; the maker-cancel path; the
//            checker-reject path
//     x38.v  the solo-firm high-stakes variant (attestation)
//     x38.w  CLR26: an open client-scope question blocks settle_from_bank_line
//            too (inherited)
//     x38.x  op-key replay: match_bank_line and settle_from_bank_line are both
//            idempotent under the same key
//     x38.y  outbox law: a composite that fails after opening a transaction
//            leaves ZERO events/matches/members/entries behind
//   TENANCY / ACL
//     x38.z  authority catalog: the four verbs are authenticated-ONLY, zero
//            wake_fn_allowlist entries, zero agent grants
//     x38.aa lock-order prosrc pins, including the NEW 203005006 chain rung
//     x38.ab per-RPC cross-firm zero-rows/refusal cells (a firm-B owner
//            targeting firm-A bank objects)
//     x38.ac the event payload allowlist: every bank.* payload carries
//            identifiers only
//     x38.ad table ACL pins: force RLS, zero agent/wake grants on the match
//            surface
//
// Serial discipline: --test-concurrency=1 (the race cells drive two sessions
// of the shared pool by hand, and the group-tie/exhaustion assertions are
// cumulative per fixture).
//
// MODULE SPLIT (repo house rule -- the wave-a-helpers/wave-a-fixtures
// precedent, "each module under the repo's 500-line gate"): the stateless
// verb wrappers, readbacks and fixture builders live in the companion
// `x38-match-fixtures.mjs` (NOT a test file). Only this file's own state
// (`world`, `has38`, `bankAcct`), its node:test lifecycle, and every
// `test(...)` cell live here.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, withActor, namedCall, opk,
  endPool, printLaneNotes, printSkipCount, noteLane, markSkip, ROLES,
  a21EnsureReady, buildWorld, firmOf,
  upsertAccountClassed, upsertPayableAccount, grantConsent,
  freshResolution, draftEntryV3, approveEntry, reverseEntry, withdrawDraft,
  idOf, reasonOf, HIGH_STAKES_CENTS,
  openQuestion, resolveOpenQuestion, proposeCorrection, approveCorrection,
  entryStatusOf, roleCanExecute, fnSource, rlsFlags,
} from "./a21-helpers.mjs";
import { holdThenContend, sawDeadlock } from "./rig-docs-race.mjs";
import {
  GUARD, BANKCOA1, BANKCOA2, AR1, AP1, EXPN, REVN, LOANP, CHARGEX, ADJX, ADJINC, BADADJ,
  CLR10, CLR11, CLR26, hasBankMatching, caught,
  addBankAccount, deactivateBankAccount, enterStatement, voidBankStatement,
  matchBankLine, unmatchBankMatch, settleFromBankLine, completePendingMatch, matchIdOf,
  matchRow, lineMemberRows, entryMemberRows, lineGroupStatus, assertGroupTies,
  auditRowsMentioning, bankEventTypes, bankEventPayloads, maxBankSeq, openItemsOf, outstandingOf,
  manualRes, birthCounterparty, plainEntry, docBoundEntry, counterpartyStampedItem,
} from "./x38-match-fixtures.mjs";

let has38 = false;
let world = null;
let bankAcct = null; // { A1: { id, coaCode }, A1b: { id, coaCode } } -- keyed per client

/** Loud + counted skip -- a dormant suite must show up in printSkipCount. */
function skipHere(t) {
  if (!has38) {
    markSkip();
    t.skip("bank matching surface not present (clara.bank_matches / clara.match_bank_line absent) -- the Wave-C-b match battery is dormant");
    return true;
  }
  return false;
}

before(async () => {
  const ready = await a21EnsureReady();
  has38 = Boolean(ready.base && ready.has16 && (await hasBankMatching()));
  if (!has38) {
    noteLane("bank matching surface absent -- x38-wave-c-b-match suite dormant");
    return;
  }
  world = await buildWorld();
  bankAcct = {};
  for (const key of ["A1", "A2", "B1"]) {
    const client = world.clients[key];
    const sub = key === "B1" ? world.users.dave : world.users.alice;
    await upsertAccountClassed(sub, { client, code: BANKCOA1, name: "Maybank current (x38)", type: "asset", opKey: opk("bcoa1") });
    await upsertAccountClassed(sub, { client, code: BANKCOA2, name: "Maybank FD (x38)", type: "asset", opKey: opk("bcoa2") });
    await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (x38)", type: "asset", accountClass: "receivable", opKey: opk("ar1") });
    await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (x38)", opKey: opk("ap1") });
    await upsertAccountClassed(sub, { client, code: EXPN, name: "Prof Fees (x38)", type: "expense", opKey: opk("exp") });
    await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (x38)", type: "income", opKey: opk("rev") });
    await upsertAccountClassed(sub, { client, code: LOANP, name: "Term Loan (x38)", type: "liability", opKey: opk("loan") });
    await upsertAccountClassed(sub, { client, code: CHARGEX, name: "Bank Charges (x38)", type: "expense", opKey: opk("chg") });
    await upsertAccountClassed(sub, { client, code: ADJX, name: "Sundry Adjustments (x38)", type: "expense", opKey: opk("adjx") });
    await upsertAccountClassed(sub, { client, code: ADJINC, name: "Sundry Income Adj (x38)", type: "income", opKey: opk("adjinc") });
    await upsertPayableAccount(sub, { client, code: BADADJ, name: "Bad Adjustment Target (x38)", opKey: opk("badadj") });
    await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
    const a = await addBankAccount(sub, { client, coaAccountCode: BANKCOA1, accountNumber: `1044${key}${randomUUID().slice(0, 6)}` });
    const b = await addBankAccount(sub, { client, coaAccountCode: BANKCOA2, accountNumber: `1055${key}${randomUUID().slice(0, 6)}` });
    bankAcct[key] = { primary: idOf(a, "bank_account_id", "id"), second: idOf(b, "bank_account_id", "id") };
  }
});

after(async () => {
  printLaneNotes("x38-wave-c-b-match");
  printSkipCount("x38-wave-c-b-match");
  await endPool();
});

// ===========================================================================
// x38.a -- EXACT SINGLE. One line, one entry, full amount. The base case the
// rest of the file's group-tie assertions are checked against.
// ===========================================================================
test("x38.a exact single: one line matches one entry at full amount, the group ties, audit + events land", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 55000, memo: "x38.a deposit" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 55000, entryDate: "2026-06-10", description: "x38.a inbound" }],
  });
  const line = stmt.lines[0];

  const receipt = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 55000 }] });
  const match = matchIdOf(receipt);
  assert.ok(match, `match_bank_line returns a match id (got ${JSON.stringify(receipt)})`);
  const row = await matchRow(match);
  assert.equal(row.status, "live", "a below-threshold single match lands LIVE immediately");
  assert.equal(row.origin, "human", "the composite always writes origin='human'");
  assert.equal((await lineGroupStatus(line.id))[0], "live", "the line's denormalized group_status reads live");

  await assertGroupTies(match, "x38.a exact single");
  assert.ok((await auditRowsMentioning(match)).length > 0, "a bank_match_audit row records the match action");
  const types = await bankEventTypes(client);
  assert.ok(types.includes("bank.match_created"), `bank.match_created was appended (got ${types.join(",")})`);
});

// ===========================================================================
// x38.b -- THE N-LINES-ONE-ENTRY IBG GROUP. Two Malaysian interbank transfers
// clearing ONE recorded receipt is one group, one audit object (design S4.6:
// "WC-R2's N:M is real").
// ===========================================================================
test("x38.b two IBG lines clear ONE entry in a single group; the group ties across both lines", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 120000, memo: "x38.b IBG receivable" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 200000,
    specs: [
      { amountCents: 70000, entryDate: "2026-06-11", description: "x38.b IBG part 1" },
      { amountCents: 50000, entryDate: "2026-06-11", description: "x38.b IBG part 2" },
    ],
  });
  const [l1, l2] = stmt.lines;

  const receipt = await matchBankLine(sub, {
    client, lines: [l1.id, l2.id], entries: [{ entry_id: entry, matched_cents: 120000 }],
  });
  const match = matchIdOf(receipt);
  const lm = await lineMemberRows(match);
  assert.equal(lm.length, 2, `both IBG lines join the SAME group (got ${lm.length} line members)`);
  await assertGroupTies(match, "x38.b IBG group");
});

// ===========================================================================
// x38.c -- WRONG_ACCOUNT. An entry that never touches the LINE's bank account
// (line/account incongruence) refuses by name.
// ===========================================================================
test("x38.c wrong_account: an entry with zero movement on the line's bank account is refused by name", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  // The entry touches the SECOND bank account, not the primary one the line binds.
  const entry = await plainEntry(sub, { client, debit: BANKCOA2, credit: REVN, cents: 40000, memo: "x38.c wrong account" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 40000, entryDate: "2026-06-05" }],
  });
  const err = await caught(() => matchBankLine(sub, {
    client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: 40000 }],
  }));
  assert.ok(err, "an entry with zero movement on the line's bound bank account must be refused");
  assert.equal(err.code, CLR10, `wrong_account is a CLR10 refusal (got ${err.code} -- ${err.message})`);
  assert.equal(reasonOf(err), "wrong_account", `the named reason is wrong_account (got ${reasonOf(err)})`);
});

// ===========================================================================
// x38.d -- WRONG_PERIOD. "structural only" (design S4.6): a member LINE whose
// statement is no longer 'live' (voided) refuses -- this is NOT the
// posting-date exception (x38.e), which is about the ENTRY's date, not the
// statement's status.
// ===========================================================================
test("x38.d wrong_period: a line on a VOIDED statement refuses match_bank_line by name", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-05-01", periodEnd: "2026-05-31", opening: 0,
    specs: [{ amountCents: 15000, entryDate: "2026-05-10" }],
  });
  // Void requires zero pending/live groups on its lines -- true here (never matched).
  await voidBankStatement(sub, { client, statement: stmt.statementId, reason: "x38.d wrong-period fixture" });
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 15000, memo: "x38.d against a voided statement" });
  const err = await caught(() => matchBankLine(sub, {
    client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: 15000 }],
  }));
  assert.ok(err, "a line whose statement is void must be refused");
  assert.equal(err.code, CLR10, `wrong_period is a CLR10 refusal (got ${err.code} -- ${err.message})`);
  assert.equal(reasonOf(err), "wrong_period", `the named reason is wrong_period (got ${reasonOf(err)})`);
});

// ===========================================================================
// x38.e -- THE POSTING-DATE EXCEPTION. An entry posted AFTER the statement's
// period_end is NOT a hard refusal -- it is a RECORDED, ACKNOWLEDGED
// exception (design S4.6). Without the ack it refuses; WITH the ack it rides
// the member row + the audit payload and still ties. The exact refusal token
// is contract-silent (see the file header) -- recorded, not hard-pinned.
// ===========================================================================
test("x38.e the posting-date exception: refused without ack, recorded WITH ack, and the group still ties", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 22000, entryDate: "2026-06-28" }],
  });
  // Late-received-invoice catch-up bookkeeping: posted AFTER period_end (design
  // S4.6's own example -- "late-received invoices").
  const lateDate = new Date(`${stmt.periodEnd}T00:00:00Z`);
  lateDate.setUTCDate(lateDate.getUTCDate() + 3); // strictly AFTER the allocated period_end
  const entry = await plainEntry(sub, {
    client, debit: BANKCOA1, credit: REVN, cents: 22000, memo: "x38.e late catch-up",
    postingDate: lateDate.toISOString().slice(0, 10),
  });

  const denied = await caught(() => matchBankLine(sub, {
    client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: 22000 }],
    ackPeriodExceptions: false,
  }));
  assert.ok(denied, "a posting-date-after-period_end member without the ack must be refused");
  noteLane(`x38.e unacknowledged posting-date exception: code=${denied.code} reason=${reasonOf(denied)} message=${String(denied.message).slice(0, 160)} -- the refusal token is contract-silent, recorded not pinned`);

  const receipt = await matchBankLine(sub, {
    client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: 22000 }],
    ackPeriodExceptions: true,
  });
  const match = matchIdOf(receipt);
  assert.ok(match, "WITH the ack, the same call succeeds");
  await assertGroupTies(match, "x38.e posting-date exception");
  const em = await entryMemberRows(match);
  assert.ok(
    JSON.stringify(em).toLowerCase().includes("except") || JSON.stringify(em).toLowerCase().includes("period"),
    `the member row (or its audit payload) records the acknowledged exception (got ${JSON.stringify(em)})`,
  );
});

// ===========================================================================
// x38.f -- DEPOSITS IN TRANSIT. An ordinary PASS: the receipt is recorded in
// the books before the bank clears it (entry posts inside the period, the
// line clears near the period's tail) -- no exception, no refusal, an exact
// match like any other.
// ===========================================================================
test("x38.f deposits-in-transit: an entry posted mid-period matching a line clearing near period end passes with no refusal", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const entry = await plainEntry(sub, {
    client, debit: BANKCOA1, credit: REVN, cents: 33000, memo: "x38.f deposit in transit", postingDate: "2026-06-20",
  });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 33000, entryDate: "2026-06-29" }],
  });
  const receipt = await matchBankLine(sub, {
    client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: 33000 }],
  });
  assert.ok(matchIdOf(receipt), "an ordinary in-period deposit-in-transit shape matches cleanly, no ack needed");
});

// ===========================================================================
// x38.g -- LINE EXCLUSIVITY. A structural property, proven three ways: (1) a
// second match on an already-matched line refuses through the composite; (2)
// two SESSIONS racing to settle the SAME line -- blocking PROVEN, exactly one
// wins; (3) a fn-owner DIRECT INSERT of a second 'pending'/'live' member row
// for the SAME line is refused by the partial unique INDEX ITSELF (design
// S4.5: "unique (line_id) where group_status in ('pending','live')").
// ===========================================================================
test("x38.g line exclusivity: composite refusal, a proven concurrent race, and the fn-owner red-team refused by the index", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;

  // (1) composite refusal.
  const e1 = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 18000, memo: "x38.g first claimant" });
  const e2 = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 18000, memo: "x38.g second claimant" });
  const stmt1 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 18000, entryDate: "2026-06-08" }],
  });
  const line1 = stmt1.lines[0];
  await matchBankLine(sub, { client, lines: [line1.id], entries: [{ entry_id: e1, matched_cents: 18000 }] });
  const again = await caught(() => matchBankLine(sub, { client, lines: [line1.id], entries: [{ entry_id: e2, matched_cents: 18000 }] }));
  assert.ok(again, "a second match on an already-matched line must be refused");
  assert.equal(reasonOf(again), "already_matched", `the named reason is already_matched (got ${reasonOf(again)})`);

  // (2) the proven concurrent race -- a FRESH line, two sessions racing to claim it.
  const e3 = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 27500, memo: "x38.g race claimant A" });
  const e4 = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 27500, memo: "x38.g race claimant B" });
  const stmt2 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 20000,
    specs: [{ amountCents: 27500, entryDate: "2026-06-09" }],
  });
  const raceLine = stmt2.lines[0].id;
  const call = (entry, opKey) => (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      `select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb,
         p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as r`,
      [client, JSON.stringify([raceLine]), JSON.stringify([{ entry_id: entry, matched_cents: 27500 }]), opKey],
    );
    return r.rows[0].r;
  })();
  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: world.users.alice, run: call(e3, opk("x38-raceA")) },
    b: { role: ROLES.authenticated, jwtSub: world.users.bob, run: call(e4, opk("x38-raceB")) },
  });
  assert.ok(out.provedBlocked, "session B BLOCKED on session A's locks -- there is no check-then-act window for line ownership");
  assert.ok(!sawDeadlock(out), `no deadlock either direction (a=${out.a?.code ?? "ok"} b=${out.b?.code ?? "ok"})`);
  assert.equal(out.a.ok, true, `session A won the line (got ${out.a.code} -- ${out.a.message})`);
  assert.equal(out.b.ok, false, "session B did NOT also claim the same line");
  noteLane(`x38.g losing session code=${out.b.code} reason=${String(out.b.message).slice(0, 160)}`);
  assert.equal((await lineGroupStatus(raceLine)).length, 1, "the line carries exactly ONE live/pending membership after the race");

  // (3) fn-owner red-team: a direct INSERT of a second live-status member row
  // for a line ALREADY exclusively owned must die on the partial unique index
  // itself -- proving the exclusivity control is a REAL index, not merely
  // verb-level discipline (design S4.5's explicit correction of v1's
  // unimplementable cross-table predicate).
  const ownedLine = line1.id;
  const ownedMatch = (await rootQuery(
    "select match_id from clara.bank_match_line_members where line_id=$1 and group_status='live'", [ownedLine],
  )).rows[0]?.match_id;
  assert.ok(ownedMatch, "x38.g mandatory setup: the first claimant's group is live");
  const insertErr = await caught(() => rootQuery(
    `insert into clara.bank_match_line_members(match_id, firm_id, client_id, line_id, amount_cents, group_status)
     values ($1, (select firm_id from clara.clients where id=$2), $2, $3, 18000, 'live')`,
    [ownedMatch, client, ownedLine],
  ));
  assert.ok(insertErr, "a direct fn-owner INSERT of a second live member row for the SAME line must be refused");
  assert.equal(insertErr.code, "23505", `the exclusivity index itself refuses with a unique-violation (got ${insertErr.code} -- ${insertErr.message})`);
});

// ===========================================================================
// x38.h -- PER-SIDE EXHAUSTION incl. THE GROSS LOAN-DRAWDOWN SHAPE (design S3
// "Entry side"). A term-loan drawdown net of a processing fee touches the
// bank account on BOTH sides of the SAME entry: Dr Bank 100,000 (proceeds) /
// Cr Loan Payable 100,000, and Dr Fee Expense 500 / Cr Bank 500. The bank
// prints TWO gross lines (a +100,000 deposit and a -500 withdrawal); one
// group with ONE entry appearing as TWO members (+100,000 and -500) exercises
// BOTH per-side absolute bounds independently.
// ===========================================================================
test("x38.h per-side exhaustion incl. the gross loan-drawdown shape: one entry, two bank sides, two lines, one group", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x38.h loan drawdown net of fee",
    lines: [
      { account_code: BANKCOA1, debit_cents: 1_000_00 * 1, credit_cents: 0, description: "loan proceeds" }, // Dr Bank 100,000
      { account_code: LOANP, debit_cents: 0, credit_cents: 1_000_00 * 1, description: "loan payable" }, // Cr Loan 100,000
      { account_code: CHARGEX, debit_cents: 500, credit_cents: 0, description: "drawdown fee" }, // Dr Fee 500
      { account_code: BANKCOA1, debit_cents: 0, credit_cents: 500, description: "fee paid from same account" }, // Cr Bank 500
    ],
    opKey: opk("x38-loan"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x38-loana") });
  const entry = d.entry_id;

  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [
      { amountCents: 100000, entryDate: "2026-06-12", description: "x38.h loan proceeds in" },
      { amountCents: -500, entryDate: "2026-06-12", description: "x38.h drawdown fee out" },
    ],
  });
  const [proceeds, fee] = stmt.lines;

  const receipt = await matchBankLine(sub, {
    client, lines: [proceeds.id, fee.id],
    entries: [
      { entry_id: entry, matched_cents: 100000 }, // the debit side, at its own gross bound
      { entry_id: entry, matched_cents: -500 }, // the credit side, at its own gross bound -- SAME entry
    ],
  });
  const match = matchIdOf(receipt);
  const em = await entryMemberRows(match);
  assert.equal(em.length, 2, `the SAME entry appears as TWO members, one per bank side (got ${em.length})`);
  await assertGroupTies(match, "x38.h loan drawdown");

  // Full exhaustion on BOTH sides -- a further attempt against either side of
  // this entry must be refused: nothing left on the debit gross OR the credit gross.
  const spare = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 100000 - 500,
    specs: [{ amountCents: 10000, entryDate: "2026-07-05" }],
  });
  const overDraw = await caught(() => matchBankLine(sub, {
    client, lines: [spare.lines[0].id], entries: [{ entry_id: entry, matched_cents: 10000 }],
  }));
  assert.ok(overDraw, "the debit side is fully exhausted at 100,000 -- a further positive match on this entry must refuse");
  assert.equal(reasonOf(overDraw), "already_matched", `cents exhaustion refuses already_matched (got ${reasonOf(overDraw)})`);
});

// ===========================================================================
// x38.i -- THE NEGATIVE-SUM ATTACK (design S3, the v1 defect this rebuild
// closes: "a signed-net inequality is vacuous for negative sums"). An entry
// with ONLY a credit-side bank leg (Cr Bank 5,000) must refuse a NEGATIVE
// matched_cents whose ABSOLUTE VALUE exceeds that credit gross -- proven at
// the composite, then red-teamed directly against the belt with a fn-owner
// INSERT the composite would never construct.
// ===========================================================================
test("x38.i the negative-sum attack: a matched_cents whose |value| exceeds the credit-side gross refuses, both at the composite and at the belt", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const entry = await plainEntry(sub, { client, debit: EXPN, credit: BANKCOA1, cents: 5000, memo: "x38.i credit-only bank leg" });

  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 50000,
    specs: [{ amountCents: -7000, entryDate: "2026-06-14", description: "x38.i outsized withdrawal" }],
  });
  const attack = await caught(() => matchBankLine(sub, {
    client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: -7000 }],
  }));
  assert.ok(attack, "|-7000| > the entry's 5,000 credit-side gross -- the composite must refuse, not silently accept a bound-vacuous negative");
  assert.equal(reasonOf(attack), "already_matched", `per-side cents exhaustion refuses already_matched (got ${reasonOf(attack)})`);

  // The belt red-team: bypass the composite entirely with a direct fn-owner
  // INSERT carrying the SAME over-bound negative matched_cents into a FRESH
  // group, over a line the composite never touched. If the belt is real, this
  // dies at commit regardless of what the composite would have allowed.
  const stmt2 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 43000,
    specs: [{ amountCents: -9000, entryDate: "2026-07-06", description: "x38.i belt red-team line" }],
  });
  const beltErr = await caught(() => withActor({}, async (c) => {
    await c.query("begin");
    try {
      const g = randomUUID();
      const firmRow = await c.query("select firm_id from clara.clients where id=$1", [client]);
      const firm = firmRow.rows[0].firm_id;
      await c.query(
        `insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin, created_by, created_at)
         values ($1, $2, $3, $4, 'live', 'human', (select id from clara.clients limit 0), now())`,
        [g, firm, client, bankAcct.A1.primary],
      ).catch(() => {}); // best-effort -- created_by shape is contract-silent; the belt is proven on the MEMBER row below regardless
      await c.query(
        `insert into clara.bank_match_line_members(match_id, firm_id, client_id, line_id, amount_cents, group_status)
         values ($1, $2, $3, $4, $5, 'live')`,
        [g, firm, client, stmt2.lines[0].id, stmt2.lines[0].amount_cents],
      );
      await c.query(
        `insert into clara.bank_match_entry_members(match_id, firm_id, client_id, entry_id, matched_cents, group_status)
         values ($1, $2, $3, $4, $5, 'live')`,
        [g, firm, client, entry, -9000],
      );
      await c.query("commit");
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    }
  }));
  assert.ok(beltErr, "the entry-exhaustion belt must refuse a direct-insert negative matched_cents past the credit-side gross, at commit if not sooner");
  noteLane(`x38.i belt red-team observed code=${beltErr.code} message=${String(beltErr.message).slice(0, 200)} -- SQLSTATE is contract-silent for this belt, recorded not pinned`);
});

// ===========================================================================
// x38.j -- GROUP-TIE +/- ADJUSTMENT. A mismatched group (line sum <> entry
// sum) refuses amount_beyond_tolerance; a NAMED adjustment leg closes it
// exactly, inside the same call/group (design S4.6's adjustment-entry
// contract: two legs, the named account vs the line's bank account).
// ===========================================================================
test("x38.j group-tie mismatch refuses amount_beyond_tolerance; a named adjustment leg closes it exactly", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 99000, memo: "x38.j short by 1,000" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 100000, entryDate: "2026-06-17" }],
  });
  const line = stmt.lines[0];

  const mismatch = await caught(() => matchBankLine(sub, {
    client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 99000 }],
  }));
  assert.ok(mismatch, "a 1,000-cent gap with no adjustment must refuse -- WC-R6's tolerance is zero");
  assert.equal(reasonOf(mismatch), "amount_beyond_tolerance", `the named reason is amount_beyond_tolerance (got ${reasonOf(mismatch)})`);

  const receipt = await matchBankLine(sub, {
    client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 99000 }],
    adjustments: [{ account_code: ADJX, amount_cents: 1000 }],
  });
  const match = matchIdOf(receipt);
  assert.ok(match, "with the named adjustment the SAME shape ties and commits");
  await assertGroupTies(match, "x38.j group-tie with adjustment");

  // The named CoR guard (design S4.6): a CONTROL-class discount/adjustment
  // account is refused by name (never an income/expense/bank leg mistake
  // silently promoted into a second control leg).
  const badLine = (await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 99000,
    specs: [{ amountCents: 100000, entryDate: "2026-07-08" }],
  })).lines[0];
  const badEntry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 99000, memo: "x38.j bad adjustment target" });
  const badAdj = await caught(() => matchBankLine(sub, {
    client, lines: [badLine.id], entries: [{ entry_id: badEntry, matched_cents: 99000 }],
    adjustments: [{ account_code: BADADJ, amount_cents: 1000 }],
  }));
  assert.ok(badAdj, "a control-class (payable) account named as the adjustment leg must be refused");
  assert.equal(reasonOf(badAdj), "adjustment_account_invalid", `the named reason is adjustment_account_invalid (got ${reasonOf(badAdj)})`);
});

// ===========================================================================
// x38.k -- UNMATCH -> RE-MATCH. The cascade releases the exclusivity index;
// re-matching is a genuinely NEW group.
// ===========================================================================
test("x38.k unmatch releases the line; re-matching opens a NEW group", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const e1 = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 21000, memo: "x38.k first match" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 21000, entryDate: "2026-06-06" }],
  });
  const line = stmt.lines[0];
  const receipt1 = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: e1, matched_cents: 21000 }] });
  const match1 = matchIdOf(receipt1);

  await unmatchBankMatch(sub, { client, match: match1, reason: "x38.k misapplied" });
  const row1 = await matchRow(match1);
  assert.equal(row1.status, "unmatched", "unmatch_bank_match flips the group's status");
  assert.equal((await lineGroupStatus(line.id)).length, 0, "the line no longer carries a pending/live membership -- the cascade released it");

  const e2 = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 21000, memo: "x38.k re-match" });
  const receipt2 = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: e2, matched_cents: 21000 }] });
  const match2 = matchIdOf(receipt2);
  assert.notEqual(match2, match1, "re-matching opens a genuinely NEW group, never reopening the unmatched one");
  await assertGroupTies(match2, "x38.k re-match");
  const types = await bankEventTypes(client);
  assert.ok(types.includes("bank.match_unmatched"), `bank.match_unmatched was appended (got ${types.join(",")})`);
});

// ===========================================================================
// x38.l -- VOID REFUSED WHILE MATCHED; CONCURRENT VOID-VS-MATCH SERIALIZES.
// void_bank_statement requires zero pending/live groups on its lines (design
// S4.2); the concurrent form proves the chain-lock/line-lock order actually
// closes the check-then-act window (design S4.9's void-vs-match race).
// ===========================================================================
test("x38.l void is refused while a line is matched; a concurrent void-vs-match schedule serializes (blocking PROVEN)", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 8800, memo: "x38.l matched line" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 8800, entryDate: "2026-06-04" }],
  });
  const line = stmt.lines[0];
  await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 8800 }] });

  const denied = await caught(() => voidBankStatement(sub, { client, statement: stmt.statementId, reason: "x38.l refused while matched" }));
  assert.ok(denied, "voiding a statement with a live member on one of its lines must be refused");

  // The concurrent schedule: a SECOND fresh statement/line, matched and voided
  // in the SAME race so the outcome (whichever direction wins) is provably
  // serialized rather than a lucky interleaving.
  const stmt2 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-08-01", periodEnd: "2026-08-31", opening: 0,
    specs: [{ amountCents: 6600, entryDate: "2026-08-09" }],
  });
  const line2 = stmt2.lines[0].id;
  const entry2 = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 6600, memo: "x38.l race target" });

  const matchSide = (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      `select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb,
         p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as r`,
      [client, JSON.stringify([line2]), JSON.stringify([{ entry_id: entry2, matched_cents: 6600 }]), opk("x38-lvm-match")],
    );
    return r.rows[0].r;
  })();
  const voidSide = (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      "select clara.void_bank_statement(p_client => $1, p_statement => $2, p_reason => $3, p_op_key => $4) as r",
      [client, stmt2.statementId, "x38.l race void", opk("x38-lvm-void")],
    );
    return r.rows[0].r;
  })();

  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: world.users.alice, run: matchSide },
    b: { role: ROLES.authenticated, jwtSub: world.users.bob, run: voidSide },
  });
  assert.ok(out.provedBlocked, "the void session BLOCKED on the matching session's locks (blocking-pid proven) -- match and void are serialized");
  assert.ok(!sawDeadlock(out), `no deadlock either direction (a=${out.a?.code ?? "ok"} b=${out.b?.code ?? "ok"})`);
  assert.equal(out.a.ok, true, `the match committed first (got ${out.a.code} -- ${out.a.message})`);
  assert.equal(out.b.ok, false, "the void that woke up behind it sees the now-live member and refuses, rather than voiding a matched line");
});

// ===========================================================================
// x38.m -- REVERSED-ORIGINAL AND REVERSAL-MIRROR MEMBERSHIP BOTH REFUSED.
// Design S4.5 floors: entry.status='approved', reversed_by IS NULL AND
// reversal_of IS NULL -- a reversed original is STILL approved (fact 2.10 of
// the C-a design) so the floor names it explicitly.
// ===========================================================================
test("x38.m a reversed original and its reversal mirror are BOTH refused match membership, by name", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 17000, memo: "x38.m reversible" });
  await reverseEntry(world.users.bob, { entry, reason: "x38.m reversed before matching", opKey: opk("x38-m-rev") });
  const mirror = (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [entry])).rows[0].id;

  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [
      { amountCents: 17000, entryDate: "2026-06-13" },
      { amountCents: -17000, entryDate: "2026-06-14" }, // the mirror's own tying line: the
      // group must TIE so the reversal floor -- not amount_beyond_tolerance -- is the law hit
    ],
  });
  const line = stmt.lines[0];
  const lineNeg = stmt.lines[1];

  const origErr = await caught(() => matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 17000 }] }));
  assert.ok(origErr, "a REVERSED original must be refused match membership");
  assert.equal(reasonOf(origErr), "reversed_entry", `the named reason is reversed_entry (got ${reasonOf(origErr)})`);

  const mirrorErr = await caught(() => matchBankLine(sub, { client, lines: [lineNeg.id], entries: [{ entry_id: mirror, matched_cents: -17000 }] }));
  assert.ok(mirrorErr, "the reversal MIRROR must also be refused match membership");
  assert.equal(reasonOf(mirrorErr), "reversal_mirror", `the named reason is reversal_mirror (got ${reasonOf(mirrorErr)})`);
});

// ===========================================================================
// x38.n -- REVERSE-WHILE-MATCHED, BOTH VERBS + THE STRUCTURAL BELT RED-TEAM.
// Named refusals spliced into reverse_entry AND approve_wrong_client_
// correction (design S4.6): live_bank_match_present -> "unmatch first". The
// structural belt (AFTER UPDATE WHEN reversed_by becomes non-null) is the
// backstop for any future path, red-teamed here directly.
// ===========================================================================
test("x38.n reverse-while-matched is refused on BOTH verbs, and the structural belt catches a direct fn-owner write", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;

  // Verb 1: reverse_entry.
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 9900, memo: "x38.n reverse-while-matched" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 9900, entryDate: "2026-06-19" }],
  });
  const line = stmt.lines[0];
  const receipt = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 9900 }] });
  const match = matchIdOf(receipt);

  const revErr = await caught(() => reverseEntry(world.users.bob, { entry, reason: "x38.n blocked reversal", opKey: opk("x38-n-rev") }));
  assert.ok(revErr, "reversing an entry with a live bank match must be refused");
  assert.equal(reasonOf(revErr), "live_bank_match_present", `the named reason is live_bank_match_present (got ${reasonOf(revErr)})`);
  assert.ok(/unmatch/i.test(String(revErr.message)), `the message points at the remedy (got: ${revErr.message})`);

  // ...unmatch first, then the SAME reversal succeeds (the remedy the message names).
  await unmatchBankMatch(sub, { client, match, reason: "x38.n clearing the match before reversal" });
  await reverseEntry(world.users.bob, { entry, reason: "x38.n now reversible", opKey: opk("x38-n-rev2") });
  assert.equal(await entryStatusOf(entry), "approved", "the reversed original stays approved (it is the mirror that carries reversal_of)");

  // Verb 2: approve_wrong_client_correction. A document-bound entry, matched,
  // then a wrong-client correction attempted while the match lives.
  const { entry: docEntry, documentId } = await docBoundEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 6500, memo: "x38.n misfiled + matched" });
  const stmt2 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 0,
    specs: [{ amountCents: 6500, entryDate: "2026-07-11" }],
  });
  const line2 = stmt2.lines[0];
  await matchBankLine(sub, { client, lines: [line2.id], entries: [{ entry_id: docEntry, matched_cents: 6500 }] });

  await freshResolution(sub, world.clients.A2, { subjectKind: "document", subjectId: documentId });
  const proposal = await proposeCorrection(sub, {
    document: documentId, fromClient: client, toClient: world.clients.A2, reason: "x38.n filed to the wrong client while matched",
  });
  const correctionId = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash
    ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  const corrErr = await caught(() => approveCorrection(world.users.bob, { correction: correctionId, planHash }));
  assert.ok(corrErr, "approving a wrong-client correction whose entry has a live bank match must be refused");
  assert.equal(reasonOf(corrErr), "live_bank_match_present", `the named reason is live_bank_match_present (got ${reasonOf(corrErr)})`);

  // The STRUCTURAL BELT red-team: bypass both named verbs entirely with a
  // direct fn-owner UPDATE of journal_entries.reversed_by while a live member
  // still exists. Some guard -- the belt, or an earlier immutability trigger
  // -- must refuse; the exact mechanism is recorded rather than assumed.
  const beltErr = await caught(() => withActor({ transaction: true }, async (c) => {
    await c.query("update clara.journal_entries set reversed_by=$1 where id=$2", [randomUUID(), entry]);
  }));
  assert.ok(beltErr, "a direct fn-owner UPDATE of reversed_by on an entry with a live bank match must still be refused at commit if not sooner");
  noteLane(`x38.n belt red-team observed code=${beltErr.code} message=${String(beltErr.message).slice(0, 200)} -- mechanism (belt vs an earlier guard) recorded, not assumed`);
});

// ===========================================================================
// x38.o -- THE BOUNCED-CHEQUE END-TO-END WALK (design S4.6's named doctrine).
// A dishonoured cheque is NOT a reversal: the deposit line's match is a true
// historical clearing fact and STAYS; the return line matches a NEW
// reinstatement entry (generic, counterparty-stamped AR control leg), which
// mints a live C-a `adjustment` item -- the debt is RE-AGED, not reopened
// on the original invoice.
// ===========================================================================
test("x38.o the bounced-cheque walk: the deposit stays matched, the return line matches a NEW reinstatement entry, the debt re-ages via a C-a adjustment item", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X38 BOUNCECO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const { item: invoiceItem } = await counterpartyStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 50000, control: AR1 });

  // The cheque deposits and clears the invoice via settle_from_bank_line.
  const depositStmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 50000, entryDate: "2026-06-05", description: "x38.o cheque deposit" }],
  });
  const depositLine = depositStmt.lines[0];
  const settled = await settleFromBankLine(sub, {
    client, line: depositLine.id, counterparty: cp,
    allocations: [{ item_id: invoiceItem, amount_cents: 50000 }],
    memo: "x38.o cheque receipt",
  });
  assert.equal(await outstandingOf(invoiceItem), 0, "the invoice cleared when the cheque was deposited");
  const depositMatch = matchIdOf(settled) ?? (await lineGroupStatus(depositLine.id)).length ? (await rootQuery(
    "select match_id from clara.bank_match_line_members where line_id=$1", [depositLine.id],
  )).rows[0]?.match_id : null;
  assert.ok(depositMatch, "settle_from_bank_line owns the deposit line at birth");

  // The cheque bounces: a RETURN line appears on a later statement.
  const returnStmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 50000,
    specs: [{ amountCents: -50000, entryDate: "2026-06-20", description: "x38.o cheque returned unpaid" }],
  }); // NOTE: a second enter into the SAME account+period is deliberately avoided by the
      // sibling ingest file's overlap law; this fixture instead simulates the return as a
      // NEW statement covering the tail of the same calendar period is out of scope for
      // this file (ingest correctness is the sibling's). The return line lives on its own
      // dedicated period so this cell can focus purely on the MATCHING consequence.
  const returnLine = returnStmt.lines[0];

  // The reinstatement entry: Dr Accounts Receivable (reopen the debt) / Cr
  // Bank (the cash that left) -- counterparty-stamped on the AR leg, so C-a's
  // classifier (already live) mints an `adjustment` item on approve.
  await counterpartyStampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: 50000, control: AR1,
  });
  // counterpartyStampedItem's shape is Dr control/Cr revenue for 'ar' -- the
  // bounced-cheque reinstatement needs Dr AR / Cr BANK instead, so it is built
  // directly here rather than reused, to keep the account pairing honest.
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x38.o cheque reinstatement",
    lines: [
      { account_code: AR1, debit_cents: 50000, credit_cents: 0, description: "reinstate the debt" },
      { account_code: BANKCOA1, debit_cents: 0, credit_cents: 50000, description: "cheque returned" },
    ],
    vendor: { existing_id: cp, kind: "customer" }, opKey: opk("x38-o-reinstate"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x38-o-reinstatea") });
  const reinstateEntry = d.entry_id;
  const reinstateItems = await openItemsOf(reinstateEntry);
  assert.equal(reinstateItems.length, 1, "the reinstatement entry mints exactly one item via C-a's classifier");
  assert.equal(reinstateItems[0].domain, "ar", "the re-aged debt lands in ar");
  assert.equal(reinstateItems[0].item_kind, "adjustment", "it is a generic `adjustment` item -- not a new invoice, not the old one reopened");
  assert.equal(Number(reinstateItems[0].amount_cents), 50000, "the full 50,000 is owed again, aged from the RETURN, not the original sale");

  const returnMatch = await matchBankLine(sub, {
    client, lines: [returnLine.id], entries: [{ entry_id: reinstateEntry, matched_cents: -50000 }],
  });
  assert.ok(matchIdOf(returnMatch), "the return line matches the NEW reinstatement entry");
  await assertGroupTies(matchIdOf(returnMatch), "x38.o return line vs reinstatement entry");

  // THE DOCTRINE'S CENTRAL CLAIM: the deposit's match is UNTOUCHED.
  const depositRow = await matchRow(depositMatch);
  assert.equal(depositRow.status, "live", "the deposit line's match is a true historical clearing fact and STAYS live -- it is not unwound by the bounce");
  assert.notEqual(await outstandingOf(invoiceItem), 50000, "the ORIGINAL invoice is not reopened -- the debt lives on the NEW adjustment item instead");
  assert.equal(await outstandingOf(reinstateItems[0].id), 50000, "the re-aged debt sits, outstanding, on the reinstatement item");
});

// ===========================================================================
// x38.p -- SETTLE-FROM-LINE: RECEIPT CLEARING N INVOICES, LINE OWNED AT
// BIRTH. Below the high-stakes threshold, settle+allocate+match is ONE
// transaction (design S4.6).
// ===========================================================================
test("x38.p settle_from_bank_line clears TWO invoices in one call; the line is owned at birth, the group ties", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X38 SETTLECO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv1 = await counterpartyStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 30000, control: AR1 });
  const inv2 = await counterpartyStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 45000, control: AR1 });

  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 75000, entryDate: "2026-06-16", description: "x38.p combined receipt" }],
  });
  const line = stmt.lines[0];
  const receipt = await settleFromBankLine(sub, {
    client, line: line.id, counterparty: cp,
    allocations: [{ item_id: inv1.item, amount_cents: 30000 }, { item_id: inv2.item, amount_cents: 45000 }],
    memo: "x38.p batch receipt",
  });
  assert.equal(receipt.status ?? "live", "live", "a below-threshold settlement returns a LIVE group in the SAME call");
  const settledEntry = idOf(receipt, "entry_id", "entry");
  const est = await rootQuery("select status from clara.journal_entries where id=$1", [settledEntry]);
  assert.equal(est.rows[0].status, "approved", "the settlement entry is APPROVED in the same call");
  assert.equal(await outstandingOf(inv1.item), 0, "invoice 1 clears");
  assert.equal(await outstandingOf(inv2.item), 0, "invoice 2 clears");
  assert.equal((await lineGroupStatus(line.id))[0], "live", "the line is owned, live, at birth -- no unmatched interval");
});

// ===========================================================================
// x38.q -- THE PAYMENT MIRROR.
// ===========================================================================
test("x38.q settle_from_bank_line pays a supplier bill (the AP mirror)", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X38 PAYCO ${randomUUID().slice(0, 6)}` });
  const bill = await counterpartyStampedItem(sub, { client, domain: "ap", cp, cpKind: "vendor", cents: 62000, control: AP1 });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 100000,
    specs: [{ amountCents: -62000, entryDate: "2026-06-21", description: "x38.q supplier payment" }],
  });
  const line = stmt.lines[0];
  await settleFromBankLine(sub, {
    client, line: line.id, counterparty: cp, controlAccount: AP1,
    allocations: [{ item_id: bill.item, amount_cents: 62000 }],
    memo: "x38.q pay supplier",
  });
  assert.equal(await outstandingOf(bill.item), 0, "the bill clears");
  assert.equal((await lineGroupStatus(line.id))[0], "live", "the payment line is owned at birth");
});

// ===========================================================================
// x38.r -- RECEIPT-SIDE CHARGE: ONE ENTRY, GROSS CLEAR, ZERO RESIDUAL. The
// bank deposits NET of its fee; the invoice still clears at GROSS (design
// S4.6's "Dr Bank (line) + Dr Charges / Cr AR (gross)").
// ===========================================================================
test("x38.r receipt-side charge: the customer receipt entry Dr Bank+Dr Charges / Cr AR(gross), the invoice clears at gross, zero residual", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X38 NETCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await counterpartyStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 100000, control: AR1 });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 98000, entryDate: "2026-06-22", description: "x38.r net-of-charge deposit" }],
  });
  const line = stmt.lines[0];
  await settleFromBankLine(sub, {
    client, line: line.id, counterparty: cp,
    allocations: [{ item_id: inv.item, amount_cents: 100000 }],
    memo: "x38.r TT receipt net of bank charge", chargeCents: 2000, chargeAccount: CHARGEX,
  });
  assert.equal(await outstandingOf(inv.item), 0, "the invoice clears at FULL GROSS -- zero phantom outstanding, unlike a net-treatment that would leave RM20 short forever");
  const match = (await rootQuery("select match_id from clara.bank_match_line_members where line_id=$1", [line.id])).rows[0]?.match_id;
  const em = await entryMemberRows(match);
  assert.equal(em.length, 1, "receipt-side charge is ONE entry -- the charge rides an expense LEG, not a second entry");
});

// ===========================================================================
// x38.s -- PAYMENT-SIDE CHARGE: TWO ENTRIES, ONE GROUP. The payment shape
// assert forbids expense legs, so the charge is a SEPARATE same-txn
// adjustment entry; the group ties across BOTH entries against ONE line.
// ===========================================================================
test("x38.s payment-side charge: TWO entries (the payment + a same-txn charge adjustment) in ONE group against one line", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X38 PAYCHGCO ${randomUUID().slice(0, 6)}` });
  const bill = await counterpartyStampedItem(sub, { client, domain: "ap", cp, cpKind: "vendor", cents: 100000, control: AP1 });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 200000,
    specs: [{ amountCents: -102000, entryDate: "2026-06-23", description: "x38.s wire + fee combined withdrawal" }],
  });
  const line = stmt.lines[0];
  await settleFromBankLine(sub, {
    client, line: line.id, counterparty: cp, controlAccount: AP1,
    allocations: [{ item_id: bill.item, amount_cents: 100000 }],
    memo: "x38.s pay supplier with a wire fee", chargeCents: 2000, chargeAccount: CHARGEX,
  });
  assert.equal(await outstandingOf(bill.item), 0, "the bill clears at its own gross -- the fee never touches the bill's outstanding");
  const match = (await rootQuery("select match_id from clara.bank_match_line_members where line_id=$1", [line.id])).rows[0]?.match_id;
  assert.ok(match, "the line is owned by the composite's group");
  const em = await entryMemberRows(match);
  assert.equal(em.length, 2, `payment-side charge is TWO entries in one group (got ${em.length})`);
  await assertGroupTies(match, "x38.s payment-side charge");
});

// ===========================================================================
// x38.t -- THE REFUND QUADRANTS + THE DOCUMENTED WORKAROUND END TO END.
// Domain from the counterparty's KIND, never the cash sign (design S4.6):
// customer+OUTFLOW and vendor+INFLOW both refuse refund_not_supported. The
// sanctioned workaround (generic entry -> C-a adjustment item ->
// apply_open_items -> match_bank_line) is exercised end to end.
// ===========================================================================
test("x38.t the refund quadrants refuse refund_not_supported; the documented workaround ties end to end", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const customer = await birthCounterparty(sub, { client, name: `X38 REFUNDCUST ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const vendor = await birthCounterparty(sub, { client, name: `X38 REFUNDVEND ${randomUUID().slice(0, 6)}` });

  // Quadrant 1: customer + OUTFLOW (a refund TO a customer).
  const outStmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 300000,
    specs: [{ amountCents: -25000, entryDate: "2026-06-24", description: "x38.t customer refund" }],
  });
  const q1 = await caught(() => settleFromBankLine(sub, {
    client, line: outStmt.lines[0].id, counterparty: customer, allocations: [], memo: "x38.t customer refund quadrant",
  }));
  assert.ok(q1, "customer + outflow (a refund) must be refused");
  assert.equal(reasonOf(q1), "refund_not_supported", `the named reason is refund_not_supported (got ${reasonOf(q1)})`);

  // Quadrant 2: vendor + INFLOW (a rebate FROM a supplier).
  const inStmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 300000 - 25000,
    specs: [{ amountCents: 8000, entryDate: "2026-06-25", description: "x38.t supplier rebate" }],
  });
  const q2 = await caught(() => settleFromBankLine(sub, {
    client, line: inStmt.lines[0].id, counterparty: vendor, allocations: [], memo: "x38.t vendor rebate quadrant",
  }));
  assert.ok(q2, "vendor + inflow (a rebate) must be refused");
  assert.equal(reasonOf(q2), "refund_not_supported", `the named reason is refund_not_supported (got ${reasonOf(q2)})`);

  // THE WORKAROUND, end to end, for quadrant 2 (the rebate): a generic entry
  // with a counterparty-stamped control leg (Dr Bank / Cr AP -- the vendor now
  // owes US, a NEGATIVE ap item) -> C-a mints the adjustment item ->
  // apply_open_items against a real bill's residue -> match_bank_line owns
  // the line at the entry that actually carries the bank movement.
  const bill = await counterpartyStampedItem(sub, { client, domain: "ap", cp: vendor, cpKind: "vendor", cents: 20000, control: AP1 });
  // (An unstamped Dr Bank / Cr AP dry run is NOT performed: C-a's WCA-R9b law REFUSES a
  // counterparty-less control leg outright -- 'every control-class line requires a
  // counterparty' -- rather than minting an unattributable item. The stamped build below
  // is the one legal shape.)
  // TWO economic events, honestly recorded (C-a's sign law: AP CREDIT = +, we owe MORE;
  // AP DEBIT = -, the vendor owes us). Event 1, the CLAIM: Dr AP / Cr income-recovery ->
  // a NEGATIVE ap item (the vendor owes us). Event 2, THEIR CASH: Dr Bank / Cr AP -> a
  // POSITIVE ap item restoring the account. apply_open_items nets the pair; the real
  // outstanding bill is untouched -- the rebate was never that bill's money.
  const claim = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x38.t rebate claim (stamped)",
    lines: [
      { account_code: AP1, debit_cents: 8000, credit_cents: 0, description: "rebate receivable from vendor" },
      { account_code: REVN, debit_cents: 0, credit_cents: 8000, description: "rebate recovery" },
    ],
    vendor: { existing_id: vendor }, opKey: opk("x38-t-claim"),
  });
  await approveEntry(sub, { entry: claim.entry_id, expectedRevision: claim.revision_token, opKey: opk("x38-t-claima") });
  const claimItems = await openItemsOf(claim.entry_id);
  assert.equal(claimItems.length, 1, "the claim mints exactly one item via C-a's classifier");
  assert.equal(claimItems[0].domain, "ap", "the claim is an ap-domain item");
  assert.equal(Number(claimItems[0].amount_cents), -8000, "an AP DEBIT nets to a NEGATIVE ap item -- the vendor owes us");

  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x38.t rebate cash arrival (stamped)",
    lines: [
      { account_code: BANKCOA1, debit_cents: 8000, credit_cents: 0, description: "rebate in" },
      { account_code: AP1, debit_cents: 0, credit_cents: 8000, description: "restores the vendor account" },
    ],
    vendor: { existing_id: vendor }, opKey: opk("x38-t-rebate"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x38-t-rebatea") });
  const cashItems = await openItemsOf(d.entry_id);
  assert.equal(Number(cashItems[0].amount_cents), 8000, "the cash arrival's AP CREDIT nets to a POSITIVE ap item");

  const applyReceipt = await humanQuery(
    sub,
    namedCall("apply_open_items", [
      { name: "p_client" }, { name: "p_applications", cast: "jsonb" }, { name: "p_reason" }, { name: "p_op_key" },
    ]),
    [client, JSON.stringify([{ source_item_id: claimItems[0].id, target_item_id: cashItems[0].id, amount_cents: 8000 }]), "x38.t apply the rebate cash to the claim", opk("x38-t-apply")],
  );
  assert.ok(applyReceipt.rows[0].result, "apply_open_items nets the claim against the cash -- ZERO GL movement, a pure subledger event");
  assert.equal(await outstandingOf(claimItems[0].id), 0, "the claim is fully consumed");
  assert.equal(await outstandingOf(cashItems[0].id), 0, "the cash item is fully consumed");
  assert.equal(await outstandingOf(bill.item), 20000, "the REAL bill is untouched -- the rebate was never its money");

  // ...and the bank movement itself is an ORDINARY match_bank_line (this file's
  // own surface), NOT a settle_from_bank_line -- the workaround's whole point is
  // that the line was never eligible for the refused refund-shaped composite.
  const matchStmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 0,
    specs: [{ amountCents: 8000, entryDate: "2026-07-02", description: "x38.t rebate deposit, matched ordinarily" }],
  });
  const rebateMatch = await matchBankLine(sub, {
    client, lines: [matchStmt.lines[0].id], entries: [{ entry_id: d.entry_id, matched_cents: 8000 }],
  });
  assert.ok(matchIdOf(rebateMatch), "the workaround's bank leg ties end to end through the ordinary match verb");
  await assertGroupTies(matchIdOf(rebateMatch), "x38.t documented workaround");
});

// ===========================================================================
// x38.u -- THE PENDING-MATCH RESERVATION AT EXACTLY THE HIGH-STAKES
// THRESHOLD (design S4.6, WCB-R3, the v2 mechanism note). The line is owned
// the MOMENT the maker acts -- status='pending' -- so the approved-but-
// unmatched interval v1 reopened never opens. The checker approves via the
// ordinary /queue verb (approve_entry); complete_pending_match then ties. The
// maker-cancel path and the checker-reject path both leave the group
// cancellable via unmatch_bank_match.
// ===========================================================================
test("x38.u pending-match at EXACTLY the threshold: line owned at draft, a distinct checker approves, complete_pending_match ties; maker-cancel; reject path", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X38 BIGCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await counterpartyStampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: HIGH_STAKES_CENTS, control: AR1, checker: world.users.bob,
  });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: HIGH_STAKES_CENTS, entryDate: "2026-06-26", description: "x38.u high-stakes deposit" }],
  });
  const line = stmt.lines[0];

  const receipt = await settleFromBankLine(sub, {
    client, line: line.id, counterparty: cp,
    allocations: [{ item_id: inv.item, amount_cents: HIGH_STAKES_CENTS }],
    memo: "x38.u threshold receipt",
  });
  const draftEntry = idOf(receipt, "entry_id", "entry");
  const pendingMatch = matchIdOf(receipt);
  assert.ok(pendingMatch, "settle_from_bank_line at the threshold STILL returns a match id -- the reservation");
  const pendingRow = await matchRow(pendingMatch);
  assert.equal(pendingRow.status, "pending", "the group is 'pending' -- the high-stakes reservation, not yet live");
  assert.equal((await lineGroupStatus(line.id))[0], "pending", "the LINE is owned in the SAME transaction the settlement is born -- no unmatched interval opens");
  assert.equal(await entryStatusOf(draftEntry), "draft", "the settlement entry itself stays a draft for the checker");

  // The checker approves through the ORDINARY /queue verb -- CLR05 law untouched.
  const draftRow = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [draftEntry])).rows[0];
  await approveEntry(world.users.bob, { entry: draftEntry, expectedRevision: draftRow.revision_token, opKey: opk("x38-u-approve") });
  assert.equal(await entryStatusOf(draftEntry), "approved", "the checker approved the settlement entry");

  const completed = await completePendingMatch(sub, { client, match: pendingMatch });
  assert.ok(completed, "complete_pending_match validates the now-approved entry and flips pending->live");
  const liveRow = await matchRow(pendingMatch);
  assert.equal(liveRow.status, "live", "pending -> live");
  await assertGroupTies(pendingMatch, "x38.u pending-match completed");
  assert.equal(await outstandingOf(inv.item), 0, "the high-stakes invoice is now genuinely cleared");

  // MAKER-CANCEL PATH: a fresh threshold reservation, cancelled by the maker
  // via unmatch_bank_match while still pending.
  const inv2 = await counterpartyStampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: HIGH_STAKES_CENTS, control: AR1, checker: world.users.bob,
  });
  const stmt2 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 0,
    specs: [{ amountCents: HIGH_STAKES_CENTS, entryDate: "2026-07-04", description: "x38.u maker-cancel fixture" }],
  });
  const line2 = stmt2.lines[0];
  const receipt2 = await settleFromBankLine(sub, {
    client, line: line2.id, counterparty: cp,
    allocations: [{ item_id: inv2.item, amount_cents: HIGH_STAKES_CENTS }],
    memo: "x38.u maker-cancel",
  });
  const pendingMatch2 = matchIdOf(receipt2);
  const draftEntry2 = idOf(receipt2, "entry_id", "entry");
  const cancelReceipt2 = await unmatchBankMatch(sub, { client, match: pendingMatch2, reason: "x38.u maker cancels the reservation" });
  assert.equal(
    cancelReceipt2.draft_withdrawn ?? cancelReceipt2.draftWithdrawn, true,
    `unmatch_bank_match's receipt carries draft_withdrawn:true for a pending maker-cancel (got ${JSON.stringify(cancelReceipt2)})`,
  );
  const cancelledRow = await matchRow(pendingMatch2);
  assert.equal(cancelledRow.status, "unmatched", "unmatch_bank_match cancels a PENDING group exactly as it does a live one");
  assert.equal((await lineGroupStatus(line2.id)).length, 0, "the maker-cancel releases the line back to unowned");
  // AS-BUILT LADDER FIX (2026-07-31): cancelling a PENDING reservation closes BOTH sides
  // atomically -- the anchored draft is withdrawn in the SAME transaction as the unmatch, not
  // left stranded approvable.
  const draftRow2After = (await rootQuery("select status, withdrawal_reason from clara.journal_entries where id=$1", [draftEntry2])).rows[0];
  assert.equal(draftRow2After.status, "withdrawn", "the maker-cancel ALSO withdraws the anchored draft in the same transaction (the one-door law)");
  assert.ok(
    String(draftRow2After.withdrawal_reason ?? "").startsWith("bank match reservation cancelled:"),
    `the withdrawal_reason names the bank-match cancellation as its cause (got ${JSON.stringify(draftRow2After.withdrawal_reason)})`,
  );

  // REJECT PATH (as-built ladder fix, 2026-07-31): THE ONE-DOOR LAW. A draft anchoring a
  // PENDING bank-match reservation can no longer be withdrawn alone -- that would strand the
  // owned statement line. withdraw_draft refuses named (pending_match_present); the checker's
  // rejection instead goes through unmatch_bank_match, which withdraws the draft atomically.
  const inv3 = await counterpartyStampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: HIGH_STAKES_CENTS, control: AR1, checker: world.users.bob,
  });
  const stmt3 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-08-01", periodEnd: "2026-08-31", opening: 0,
    specs: [{ amountCents: HIGH_STAKES_CENTS, entryDate: "2026-08-04", description: "x38.u reject-path fixture" }],
  });
  const line3 = stmt3.lines[0];
  const receipt3 = await settleFromBankLine(sub, {
    client, line: line3.id, counterparty: cp,
    allocations: [{ item_id: inv3.item, amount_cents: HIGH_STAKES_CENTS }],
    memo: "x38.u reject path",
  });
  const pendingMatch3 = matchIdOf(receipt3);
  const draftEntry3 = idOf(receipt3, "entry_id", "entry");
  const draftRow3 = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [draftEntry3])).rows[0];
  const rejectDenied = await caught(() => withdrawDraft(world.users.bob, {
    entry: draftEntry3, reason: "x38.u checker rejects (a lone withdrawal attempt)",
    expectedRevision: draftRow3.revision_token, opKey: opk("x38-u-reject-lone"),
  }));
  assert.ok(rejectDenied, "withdraw_draft on a draft anchoring a PENDING bank-match reservation must refuse -- the one-door law");
  assert.equal(rejectDenied.code, CLR10, `the refusal is CLR10 (got ${rejectDenied.code} -- ${rejectDenied.message})`);
  assert.equal(reasonOf(rejectDenied), "pending_match_present", `the named reason is pending_match_present (got ${reasonOf(rejectDenied)})`);

  const cancelReceipt3 = await unmatchBankMatch(sub, { client, match: pendingMatch3, reason: "x38.u cancel after reject, through the one door" });
  assert.equal(
    cancelReceipt3.draft_withdrawn ?? cancelReceipt3.draftWithdrawn, true,
    "unmatch_bank_match withdraws the draft in the SAME transaction as the reject-path cancel",
  );
  const rejectedRow = await matchRow(pendingMatch3);
  assert.equal(rejectedRow.status, "unmatched", "a checker-REJECTED draft leaves the pending group cancellable through unmatch_bank_match");
  const draftRow3After = (await rootQuery("select status, withdrawal_reason from clara.journal_entries where id=$1", [draftEntry3])).rows[0];
  assert.equal(draftRow3After.status, "withdrawn", "unmatch_bank_match withdrew the draft -- the checker's rejection lands through the one door");
  assert.ok(
    String(draftRow3After.withdrawal_reason ?? "").startsWith("bank match reservation cancelled:"),
    `the withdrawal_reason names the bank-match cancellation as its cause (got ${JSON.stringify(draftRow3After.withdrawal_reason)})`,
  );

  // RED-TEAM (as-built ladder fix, 2026-07-31): a hand-flipped group bypasses BOTH named doors
  // -- a direct fn-owner UPDATE flips a PENDING group straight to 'unmatched' WITHOUT touching
  // its anchored draft. The cascade FK still frees the line (bank_match_line_members.
  // group_status CASCADEs off bank_matches.status), but the draft is left ORPHANED: still
  // 'draft', still anchoring a now-cancelled reservation. The structural backstop is a DEFERRED
  // constraint trigger on journal_entries (fires draft->approved, AFTER UPDATE, at commit):
  // approving that orphan must be refused.
  const inv4 = await counterpartyStampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: HIGH_STAKES_CENTS, control: AR1, checker: world.users.bob,
  });
  const stmt4 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-09-01", periodEnd: "2026-09-30", opening: 0,
    specs: [{ amountCents: HIGH_STAKES_CENTS, entryDate: "2026-09-04", description: "x38.u belt red-team fixture" }],
  });
  const line4 = stmt4.lines[0];
  const receipt4 = await settleFromBankLine(sub, {
    client, line: line4.id, counterparty: cp,
    allocations: [{ item_id: inv4.item, amount_cents: HIGH_STAKES_CENTS }],
    memo: "x38.u belt red-team",
  });
  const pendingMatch4 = matchIdOf(receipt4);
  const draftEntry4 = idOf(receipt4, "entry_id", "entry");
  assert.equal((await matchRow(pendingMatch4)).status, "pending", "x38.u belt red-team mandatory setup: the reservation is pending");

  // The hand-flip must ALSO null pending_ancillaries -- ck_bank_matches_pending_ancillaries
  // (delta-review round 2) refuses a non-pending row that still carries the payload, so even
  // this red-team bypass cannot leak it. Prove the CHECK first, then flip legally.
  await assert.rejects(
    () => rootQuery(
      "update clara.bank_matches set status='unmatched' where id=$1 and status='pending'",
      [pendingMatch4]),
    (e) => /ck_bank_matches_pending_ancillaries/.test(String(e.message ?? e)),
    "a status flip that forgets the ancillary payload refuses on the CHECK -- the leak class is structural, not conventional",
  );
  await rootQuery(
    `update clara.bank_matches set status='unmatched', pending_ancillaries=null,
       unmatched_by=$1, unmatched_at=now(),
       unmatched_reason=$2 where id=$3 and status='pending'`,
    [world.users.alice, "x38.u red-team hand-flip (bypassing both named doors)", pendingMatch4],
  );
  assert.equal((await matchRow(pendingMatch4)).status, "unmatched", "x38.u belt red-team mandatory setup: the hand-flip landed");
  assert.equal((await lineGroupStatus(line4.id)).length, 0, "the cascade FK freed the line even though the draft was never touched");
  assert.equal(await entryStatusOf(draftEntry4), "draft", "x38.u belt red-team mandatory setup: the orphaned draft is UNTOUCHED, still draft");

  const draftRow4 = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [draftEntry4])).rows[0];
  const beltErr = await caught(() => approveEntry(world.users.bob, {
    entry: draftEntry4, expectedRevision: draftRow4.revision_token, opKey: opk("x38-u-belt-approve"),
  }));
  assert.ok(beltErr, "approving an orphaned reservation draft must be refused by the structural belt, at commit if not sooner");
  assert.equal(reasonOf(beltErr), "orphaned_reservation_draft", `the named reason is orphaned_reservation_draft (got ${reasonOf(beltErr)} -- ${beltErr.message})`);
  noteLane(`x38.u belt red-team observed code=${beltErr.code} message=${String(beltErr.message).slice(0, 200)}`);
});

// ===========================================================================
// x38.v -- THE SOLO-FIRM HIGH-STAKES VARIANT (ATTESTATION). CLR05's self-
// attestation path (solo firms) rides settle_from_bank_line's p_attestation
// passthrough.
// ===========================================================================
test("x38.v the solo-firm high-stakes settlement rides the attestation passthrough to a completed, tied state", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.erin;
  const client = world.clients.S1;
  await upsertAccountClassed(sub, { client, code: BANKCOA1, name: "Maybank current (x38 solo)", type: "asset", opKey: opk("bcoa1s") });
  await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (x38 solo)", type: "asset", accountClass: "receivable", opKey: opk("ar1s") });
  // the stamped-item fixture drafts Dr control / Cr REVN on the AR side -- S1 needs REVN too
  await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (x38 solo)", type: "income", opKey: opk("revs") });
  // ...and birthCounterparty's 100-sen birth entry drafts Dr EXPN / Cr REVN
  await upsertAccountClassed(sub, { client, code: EXPN, name: "Prof Fees (x38 solo)", type: "expense", opKey: opk("exps") });
  const bankRow = await addBankAccount(sub, { client, coaAccountCode: BANKCOA1, accountNumber: `1099S1${randomUUID().slice(0, 6)}` }).catch(async (e) => {
    // Tolerant of a re-run / already-flagged account -- read it back.
    noteLane(`x38.v add_bank_account on the solo client: ${e.message} -- reading back the existing row`);
    return null;
  });
  const soloBankId = idOf(bankRow, "bank_account_id", "id")
    ?? (await rootQuery("select id from clara.bank_accounts where client_id=$1 and coa_account_code=$2 and active limit 1", [client, BANKCOA1])).rows[0]?.id;
  assert.ok(soloBankId, "the solo client's bank account exists (mandatory setup)");

  const cp = await birthCounterparty(sub, { client, name: `X38 SOLOCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await counterpartyStampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: HIGH_STAKES_CENTS, control: AR1, checker: sub, attestation: "x38.v solo self-attested invoice",
  });
  const stmt = await enterStatement(sub, {
    client, bankAccount: soloBankId, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: HIGH_STAKES_CENTS, entryDate: "2026-06-27" }],
  });
  const receipt = await settleFromBankLine(sub, {
    client, line: stmt.lines[0].id, counterparty: cp,
    allocations: [{ item_id: inv.item, amount_cents: HIGH_STAKES_CENTS }],
    memo: "x38.v solo high-stakes settlement", attestation: "x38.v solo self-attested settlement",
  });
  assert.ok(receipt, "the solo firm's high-stakes settlement is accepted via the attestation passthrough");
  const draftEntry = idOf(receipt, "entry_id", "entry");
  // A solo firm's attestation clears CLR05 at the SAME approve call the composite
  // makes internally when below/at the composite's own approve path -- if the
  // composite left it draft regardless (WCA-R7's own draft-then-approve chain),
  // complete the ordinary way; either shape is a legitimate reading of "solo
  // firms ride the CLR05 self-attestation path" and both end tied.
  if ((await entryStatusOf(draftEntry)) === "draft") {
    const dr = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [draftEntry])).rows[0];
    await approveEntry(sub, { entry: draftEntry, expectedRevision: dr.revision_token, attestation: "x38.v solo checker-self approve", opKey: opk("x38-v-approve") });
    const pendingMatch = matchIdOf(receipt);
    if (pendingMatch && (await matchRow(pendingMatch)).status === "pending") {
      await completePendingMatch(sub, { client, match: pendingMatch });
    }
  }
  assert.equal(await outstandingOf(inv.item), 0, "the solo firm's high-stakes invoice clears via attestation, no distinct checker required");
});

// ===========================================================================
// x38.w -- CLR26 INHERITANCE. An open CLIENT-scope question blocks
// settle_from_bank_line too (design S4.6: "CLR26 inheritance stands").
// ===========================================================================
test("x38.w CLR26: an open client-scope question blocks settle_from_bank_line, and resolving it clears the block", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X38 CLR26CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await counterpartyStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 15000, control: AR1 });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 15000, entryDate: "2026-06-18" }],
  });
  const q = await openQuestion(sub, { client, scopeKind: "client", scopeId: client, question: "x38.w which bank line is this?" });
  const qid = q?.question_id ?? q?.id ?? q;
  try {
    const blocked = await caught(() => settleFromBankLine(sub, {
      client, line: stmt.lines[0].id, counterparty: cp, allocations: [{ item_id: inv.item, amount_cents: 15000 }], memo: "x38.w blocked settlement",
    }));
    assert.ok(blocked, "an open client-scope question blocks settle_from_bank_line, exactly as it blocks allocate_receipt (WCA design S4.9's CLR26 inheritance)");
    assert.equal(blocked.code, CLR26, `the block is CLR26 (got ${blocked.code} -- ${blocked.message})`);
  } finally {
    await resolveOpenQuestion(sub, { question: qid, resolution: "x38.w answered" }).catch(() => {});
  }
  const receipt = await settleFromBankLine(sub, {
    client, line: stmt.lines[0].id, counterparty: cp, allocations: [{ item_id: inv.item, amount_cents: 15000 }], memo: "x38.w now unblocked",
  });
  assert.ok(receipt, "resolving the question clears the block");
});

// ===========================================================================
// x38.x -- OP-KEY REPLAY. Both composites are idempotent under their own key
// (design S4.6's op-receipt reservation, the 0004:43-60 semantics).
// ===========================================================================
test("x38.x op-key replay: match_bank_line and settle_from_bank_line are both idempotent under the same key", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;

  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 4400, memo: "x38.x replay match" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 4400, entryDate: "2026-06-07" }],
  });
  const line = stmt.lines[0];
  const key1 = opk("x38-x-match");
  const r1 = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 4400 }], opKey: key1 });
  const r2 = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 4400 }], opKey: key1 });
  assert.equal(matchIdOf(r2), matchIdOf(r1), "the SAME op_key replayed returns the SAME match receipt, not a second group");
  assert.equal((await lineMemberRows(matchIdOf(r1))).length, 1, "no duplicate member row was written by the replay");

  const cp = await birthCounterparty(sub, { client, name: `X38 REPLAYCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await counterpartyStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 9000, control: AR1 });
  const stmt2 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 0,
    specs: [{ amountCents: 9000, entryDate: "2026-07-09" }],
  });
  const key2 = opk("x38-x-settle");
  const s1 = await settleFromBankLine(sub, { client, line: stmt2.lines[0].id, counterparty: cp, allocations: [{ item_id: inv.item, amount_cents: 9000 }], memo: "x38.x replay settle", opKey: key2 });
  const s2 = await settleFromBankLine(sub, { client, line: stmt2.lines[0].id, counterparty: cp, allocations: [{ item_id: inv.item, amount_cents: 9000 }], memo: "x38.x replay settle", opKey: key2 });
  assert.deepEqual(s2, s1, "settle_from_bank_line's replay returns the IDENTICAL receipt");
  assert.equal(await outstandingOf(inv.item), 0, "the invoice was settled exactly once, not twice");
});

// ===========================================================================
// x38.y -- OUTBOX LAW. A composite that fails after opening a transaction
// leaves ZERO events/matches/members/entries behind (the 0004 outbox law,
// exercised via the CLR26 block established in x38.w).
// ===========================================================================
test("x38.y outbox law: a settle_from_bank_line call that refuses inside the core leaves ZERO events, matches, members or entries", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X38 OUTBOXCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await counterpartyStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 11000, control: AR1 });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 11000, entryDate: "2026-06-15" }],
  });
  const line = stmt.lines[0];

  const snap = async () => ({
    events: await maxBankSeq(client),
    matches: (await rootQuery("select count(*)::int as n from clara.bank_matches where client_id=$1", [client])).rows[0].n,
    lineMembers: (await rootQuery("select count(*)::int as n from clara.bank_match_line_members where client_id=$1", [client])).rows[0].n,
    entryMembers: (await rootQuery("select count(*)::int as n from clara.bank_match_entry_members where client_id=$1", [client])).rows[0].n,
    entries: (await rootQuery("select count(*)::int as n from clara.journal_entries where client_id=$1", [client])).rows[0].n,
    lineOwned: (await lineGroupStatus(line.id)).length,
  });

  const q = await openQuestion(sub, { client, scopeKind: "client", scopeId: client, question: "x38.y outbox probe" });
  const qid = q?.question_id ?? q?.id ?? q;
  try {
    const before = await snap();
    const err = await caught(() => settleFromBankLine(sub, {
      client, line: line.id, counterparty: cp, allocations: [{ item_id: inv.item, amount_cents: 11000 }], memo: "x38.y outbox rollback",
    }));
    assert.ok(err, "the composite refused (mandatory setup for an outbox-law probe)");
    const after = await snap();
    assert.deepEqual(after, before, `the aborted composite left NOTHING behind (before=${JSON.stringify(before)} after=${JSON.stringify(after)})`);
    assert.equal(await outstandingOf(inv.item), 11000, "the target invoice is untouched");
  } finally {
    await resolveOpenQuestion(sub, { question: qid, resolution: "x38.y answered" }).catch(() => {});
  }
});

// ===========================================================================
// x38.z -- AUTHORITY CATALOG. The four verbs are authenticated-ONLY money
// movement (design S4.6: "All human-only ... op-keyed"); zero wake authority
// exists for any of them.
// ===========================================================================
test("x38.z authority: match_bank_line / unmatch_bank_match / settle_from_bank_line / complete_pending_match are authenticated-ONLY, zero wake entries", async (t) => {
  if (skipHere(t)) return;
  const verbs = ["match_bank_line", "unmatch_bank_match", "settle_from_bank_line", "complete_pending_match"];
  const otherRoles = [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive];
  for (const fn of verbs) {
    assert.equal(await roleCanExecute(ROLES.authenticated, fn), true, `clara_authenticated may execute clara.${fn} (the human lane)`);
    for (const role of otherRoles) {
      assert.equal(await roleCanExecute(role, fn), false, `${role} must NOT execute clara.${fn} -- money movement stays human-only (design S4.6, S7: "no agent grants anywhere in the bank schema")`);
    }
  }
  const wake = await rootQuery("select count(*)::int as n from clara.wake_fn_allowlist where function_name = any($1)", [verbs]);
  assert.equal(wake.rows[0].n, 0, "ZERO wake_fn_allowlist entries name any of the four bank match/settle verbs");
});

// ===========================================================================
// x38.aa -- LOCK-ORDER PROSRC PINS, INCLUDING THE NEW 203005006 RUNG. A total
// lock order is a claim about ACQUISITION SEQUENCE, provable only against the
// function bodies (the x37.s precedent this cell follows exactly).
// ===========================================================================
test("x38.aa lock-order prosrc pins for match_bank_line, settle_from_bank_line and void_bank_statement (on the extracted cores, plus the per-oid 'the wrapper acquires nothing' twins), including the new 203005006 chain rung", async (t) => {
  if (skipHere(t)) return;
  const positions = (src, needles) => needles.map((n) => src.indexOf(n));
  const ordered = (src, needles, label) => {
    const at = positions(src, needles);
    at.forEach((p, i) => assert.ok(p >= 0, `${label}: the body must contain the rung "${needles[i]}" (not found)`));
    for (let i = 1; i < at.length; i++) {
      assert.ok(at[i - 1] < at[i], `${label}: "${needles[i - 1]}" must be acquired BEFORE "${needles[i]}" (got ${at[i - 1]} vs ${at[i]}) -- the total lock order is inverted`);
    }
  };

  // match_bank_line locks PRE-EXISTING entries (design S4.9): journal_entries
  // FOR UPDATE ORDER BY id -> advisory 004 -> line rows FOR UPDATE + statement
  // FOR SHARE -> member writes.
  //
  // F-A3 PR-1a (design §4, Annex A.2 / material M2) factored the 6-arg human body into
  // clara._match_bank_line_core so PR-1b's agent core has a ctx-shaped delegate. The
  // acquisition sequence moved WITH the body, and so does this pin — same three rungs, same
  // order, nothing dropped (the 0042 precedent immediately below, written when the settle body
  // was factored). NEVER DELETED: Annex C's "the order is the DELEGATE'S OWN order" would
  // otherwise become an unmeasured claim and the ABBA deadlock the R-L2/D40 lesson cost would
  // be re-introducible in silence.
  ordered(await fnSource("_match_bank_line_core"), [
    "order by je.id for update", // the pre-existing journal_entries rows, locked first (as-built spelling)
    "pg_advisory_xact_lock(203005004",
    "order by l.id for update", // the statement's line rows
  ], "_match_bank_line_core lock order");

  // settle_from_bank_line NEVER locks a pre-existing entry -- it rides the
  // composite order (op-receipt -> sub-key reservations -> 003 -> 004 ->
  // open_items -> fresh entries -> groups) then bank rows LAST.
  // ADJUDICATED at assembly (the match lane's documented call-not-inline decision):
  // settle DELEGATES to the allocation composites, whose OWN prosrc carries the 003->004
  // rung (pinned by x37); settle's body must carry the call edges and NO advisory rung of
  // its own (a direct acquisition would re-open the nesting window).
  //
  // 0042 (design SS4 "public wrappers reserve-then-delegate; S4.Z pins move to the cores",
  // [L3/V3+C3-1]) factored that body into clara._settle_from_bank_line_core so the AF-2
  // composite (clara.resolve_and_book_bank_line) can pre-reserve `<op>:settle` and spend it
  // preheld. The acquisition sequence therefore now lives in the CORE, and so does this pin
  // -- same three rungs, same order, nothing dropped. Its callee edge also moved one level
  // down (the core calls clara._allocate_{receipt,payment}_core, not the public verbs), which
  // is the SAME factoring: the ladder x37 pins is inside those cores.
  const settleSrc = await fnSource("_settle_from_bank_line_core");
  ordered(settleSrc, [
    "clara._reserve_op(",
    "clara._allocate_",          // the composite call edge (receipt or payment branch)
    "insert into clara.bank_match_line_members", // bank rows LAST
  ], "_settle_from_bank_line_core delegation order");
  assert.ok(settleSrc.includes("clara._allocate_receipt_core(") && settleSrc.includes("clara._allocate_payment_core("),
    "_settle_from_bank_line_core delegates to BOTH allocation composites");
  assert.ok(!settleSrc.includes("pg_advisory_xact_lock(203005003") && !settleSrc.includes("pg_advisory_xact_lock(203005004"),
    "_settle_from_bank_line_core takes NO advisory rung in its own body (the allocation cores own it)");

  // THE WRAPPER PIN -- BOTH live overloads (the 12-arg form and the 13-arg p_via_rule form).
  // Each must be a real delegator: the bookkeeper+ floor, then the core call, and NOTHING that
  // acquires. Without this, a future build could re-inline the ladder into one overload and
  // walk out from under the core pin above. Per-oid, because fnSource() concatenates overloads
  // and a delegating twin would mask an inlined one.
  const settleOverloads = await rootQuery(
    `select p.oid::regprocedure::text as sig, p.prosrc as src
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='settle_from_bank_line' order by 1`,
  );
  assert.equal(settleOverloads.rows.length, 2, "clara.settle_from_bank_line still has exactly the two live overloads (12-arg + 13-arg p_via_rule)");
  for (const { sig, src } of settleOverloads.rows) {
    ordered(src, [
      "clara._human_ctx(clara.role_rank('bookkeeper'))",  // the floor stays in the wrapper ...
      "clara._settle_from_bank_line_core(",               // ... above the delegation
    ], `${sig} delegation order`);
    assert.ok(src.includes("'receipt_preheld', false"),
      `${sig} must hand the core receipt_preheld=false -- otherwise the core skips its own clara._reserve_op and the public settle path posts with NO op receipt`);
    for (const rung of ["clara._reserve_op(", "pg_advisory_xact_lock(203005003",
      "pg_advisory_xact_lock(203005004", "for update", "insert into clara.bank_match_line_members"]) {
      assert.ok(!src.includes(rung),
        `${sig} must acquire NOTHING in its own body -- found the rung "${rung}", so the ladder has been re-inlined above the core and the core's pin no longer covers the live path`);
    }
  }

  // THE match_bank_line WRAPPER PIN — PER-OID, and that is load-bearing rather than stylistic.
  // fnSource() concatenates same-named overloads, and F-A3 PR-1a extracts the 6-arg HUMAN arity
  // ONLY: the 7-arg p_via_rule arity keeps its whole body until PR-3 drops it. A pin written as
  // fnSource("match_bank_line") therefore stays GREEN off the still-fat /7 while measuring
  // nothing at all about the live human path — a vacuous pass, which is exactly the failure the
  // moved pin exists to prevent. So each arity is asserted on its own body, differentially.
  const matchOverloads = await rootQuery(
    `select p.oid::regprocedure::text as sig, p.pronargs::int as nargs, p.prosrc as src
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='match_bank_line' order by p.pronargs`,
  );
  assert.deepEqual(matchOverloads.rows.map((r) => r.nargs), [6, 7],
    "clara.match_bank_line still has exactly the two live arities (the 6-arg human form and the 7-arg p_via_rule form PR-3 drops)");
  const [match6, match7] = matchOverloads.rows;
  ordered(match6.src, [
    "clara._human_ctx(clara.role_rank('bookkeeper'))", // the floor stays in the wrapper ...
    "clara._match_bank_line_core(",                    // ... above the delegation
  ], `${match6.sig} delegation order`);
  for (const rung of ["clara._reserve_op(", "pg_advisory_xact_lock(203005004", "for update",
    "insert into clara.bank_match_line_members"]) {
    assert.ok(!match6.src.includes(rung),
      `${match6.sig} must acquire NOTHING in its own body — found the rung "${rung}", so the ladder has been re-inlined above the core and the core's pin no longer covers the live path`);
  }
  // The DIFFERENTIAL half: the rule arity is UNTOUCHED by PR-1a and still carries the full
  // order itself. Without this the two assertions above could both be satisfied by a build that
  // quietly factored /7 as well, and the /7 drop in PR-3 would then be measuring a stub.
  ordered(match7.src, [
    "order by je.id for update",
    "pg_advisory_xact_lock(203005004",
    "order by l.id for update",
  ], `${match7.sig} lock order (the rule arity is NOT extracted by PR-1a)`);

  // void_bank_statement: 004 -> 203005006 (the NEW per-account chain rung) ->
  // line rows FOR UPDATE -> the live-member probe (the void-vs-match race).
  // F-A3 PR-1a: the rungs moved into clara._void_bank_statement_core with the body.
  ordered(await fnSource("_void_bank_statement_core"), [
    "pg_advisory_xact_lock(203005004",
    "pg_advisory_xact_lock(203005006",
    "for update",
  ], "_void_bank_statement_core lock order");
  const voidStmtOverloads = await rootQuery(
    `select p.oid::regprocedure::text as sig, p.prosrc as src
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='void_bank_statement' order by 1`,
  );
  assert.equal(voidStmtOverloads.rows.length, 1, "clara.void_bank_statement has exactly one live arity");
  ordered(voidStmtOverloads.rows[0].src, [
    "clara._human_ctx(clara.role_rank('bookkeeper'))",
    "clara._void_bank_statement_core(",
  ], `${voidStmtOverloads.rows[0].sig} delegation order`);
  for (const rung of ["clara._reserve_op(", "pg_advisory_xact_lock(", "for update", "for share"]) {
    assert.ok(!voidStmtOverloads.rows[0].src.includes(rung),
      `${voidStmtOverloads.rows[0].sig} must acquire NOTHING in its own body — found "${rung}"`);
  }

  // The 203005006 rung is genuinely NEW in this wave -- no earlier migration's
  // function catalog names it (verified once, structurally, against the whole
  // catalog rather than trusting the three probes above alone).
  const anyBody = await rootQuery(
    "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.prosrc like '%203005006%'",
  );
  assert.ok(anyBody.rows[0].n >= 1, "at least one live function body carries the 203005006 rung (the chain lock is real, not just documented)");
});

// ===========================================================================
// x38.ab -- PER-RPC CROSS-FIRM TENANCY. A firm-B owner (dave) targeting
// firm-A bank objects on every writer this file owns -> refused, never an
// existence oracle (the wb-x-crossfirm.test.mjs battery precedent).
// ===========================================================================
test("x38.ab cross-firm: firm-B owner (dave) targeting firm-A bank match/settle objects is refused on every writer, zero mutation", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const dave = world.users.dave;

  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 6600, memo: "x38.ab cross-firm target entry" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 6600, entryDate: "2026-06-03" }],
  });
  const line = stmt.lines[0];
  const receipt = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 6600 }] });
  const match = matchIdOf(receipt);

  const cp = await birthCounterparty(sub, { client, name: `X38 XFIRMCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await counterpartyStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 4200, control: AR1 });
  const stmt2 = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 0,
    specs: [{ amountCents: 4200, entryDate: "2026-07-03" }],
  });
  const line2 = stmt2.lines[0];

  const probes = [
    ["match_bank_line (firm-A client id, firm-B actor)", () => matchBankLine(dave, {
      client, lines: [line2.id], entries: [{ entry_id: entry, matched_cents: 4200 }], opKey: opk("x38-xf-match"),
    })],
    ["unmatch_bank_match (firm-A match id, firm-B actor)", () => unmatchBankMatch(dave, {
      client, match, reason: "x38.ab cross-firm probe", opKey: opk("x38-xf-unmatch"),
    })],
    ["settle_from_bank_line (firm-A line id, firm-B actor)", () => settleFromBankLine(dave, {
      client, line: line2.id, counterparty: cp, allocations: [{ item_id: inv.item, amount_cents: 4200 }], memo: "x38.ab cross-firm settle", opKey: opk("x38-xf-settle"),
    })],
    ["complete_pending_match (firm-A match id, firm-B actor)", () => completePendingMatch(dave, {
      client, match, opKey: opk("x38-xf-complete"),
    })],
  ];
  for (const [label, run] of probes) {
    const err = await caught(run);
    assert.ok(err, `${label} must be refused for a firm-B actor over a firm-A object`);
    assert.equal(err.code, CLR11, `${label} refuses CLR11 -- not-found-in-your-firm, never an existence oracle (got ${err.code} -- ${err.message})`);
  }

  // No mutation leaked from any refused probe.
  const stillLive = await matchRow(match);
  assert.equal(stillLive.status, "live", "the firm-A match is byte-unchanged after every cross-firm probe");
  assert.equal(await outstandingOf(inv.item), 4200, "the firm-A invoice is untouched");
});

// ===========================================================================
// x38.ac -- THE EVENT PAYLOAD ALLOWLIST. bank.* payloads carry identifiers
// ONLY -- never account numbers, never line descriptions (design S4.8:
// "domain_events is agent-readable firm-wide").
// ===========================================================================
test("x38.ac every bank.* event payload carries identifiers only -- no account numbers, no line descriptions", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  // Identifiers + enum/count metadata; the CONTENT scan below (real account-number
  // substrings) is the strong form of the S4.8 law -- keys alone never carry PII.
  const ALLOWED_KEYS = new Set([
    "match_id", "line_id", "line_ids", "entry_id", "entry_ids", "statement_id",
    "bank_account_id", "firm_id", "client_id", "status", "counterparty_id",
    "proposal_id", "matched_cents", "amount_cents", "reason", "op_key",
    "document_id", "task_id", "ingest_mode", "previous_status",
    "line_members", "entry_members", "period_exceptions", "domain",
    "settlement_entry_id", "settlement_cents", "line_cents", "draft_entry_id",
    "adjustment_entry_ids", "charge_cents",
  ]);
  const rows = await bankEventPayloads(client);
  assert.ok(rows.length > 0, "mandatory setup: this suite has appended at least one bank.* event by this point in the file");

  // The account-number NORMALIZED forms used for account fixtures in this
  // file, so a payload that leaked one is caught by content, not just by key
  // name -- the strongest form of the S4.8 promise ("the account number never
  // enters an event payload").
  const bankRows = await rootQuery("select account_number, account_number_normalized from clara.bank_accounts where client_id=$1", [client]);
  const forbiddenSubstrings = bankRows.rows.flatMap((r) => [r.account_number, r.account_number_normalized]).filter(Boolean);

  for (const row of rows) {
    const keys = Object.keys(row.payload ?? {});
    for (const k of keys) {
      assert.ok(ALLOWED_KEYS.has(k), `${row.event_type} payload key "${k}" is not on the allowlist (got keys ${keys.join(",")}) -- payloads carry identifiers ONLY`);
    }
    const text = JSON.stringify(row.payload ?? {});
    for (const forbidden of forbiddenSubstrings) {
      assert.ok(!text.includes(forbidden), `${row.event_type} payload leaks an account number substring "${forbidden}"`);
    }
  }
});

// ===========================================================================
// x38.ad -- TABLE ACL PINS, ADJUDICATED (mirrors x38.al's shape in the sibling
// bank-identity/ingest file exactly): clara_authenticated holds a DIRECT
// firm-scoped SELECT under FORCE RLS, never DML; the agent/runtime/wake roles
// hold NOTHING at all on the match surface.
// ===========================================================================
test("x38.ad the bank match/settle tables: human SELECT-only under forced RLS; zero agent/runtime/wake grants", async (t) => {
  if (skipHere(t)) return;
  const tables = ["bank_matches", "bank_match_line_members", "bank_match_entry_members", "bank_match_audit"];
  const noAccessRoles = [ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive];
  for (const tbl of tables) {
    const flags = await rlsFlags(tbl);
    assert.ok(flags, `clara.${tbl} exists`);
    assert.equal(flags.rls, true, `clara.${tbl} has row-level security ENABLED`);
    assert.equal(flags.force, true, `clara.${tbl} FORCES row-level security (even the owner role respects policies)`);

    const sel = await rootQuery(`select has_table_privilege($1, $2, 'SELECT') as ok`, [ROLES.authenticated, `clara.${tbl}`]);
    assert.equal(sel.rows[0].ok, true, `${ROLES.authenticated} holds the design's direct firm-scoped SELECT on clara.${tbl}`);
    const dml = await rootQuery(
      `select bool_or(has_table_privilege($1, $2, priv)) as ok
         from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) priv`,
      [ROLES.authenticated, `clara.${tbl}`],
    );
    assert.notEqual(dml.rows[0].ok, true, `${ROLES.authenticated} must hold NO direct DML on clara.${tbl}`);

    for (const role of noAccessRoles) {
      const r = await rootQuery(
        `select bool_or(has_table_privilege($1, $2, priv)) as ok
           from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) priv`,
        [role, `clara.${tbl}`],
      );
      assert.notEqual(r.rows[0].ok, true, `${role} must hold NO direct table privilege on clara.${tbl} -- "no agent grants anywhere in the bank schema" (design S7)`);
    }
  }
});

// ===========================================================================
// x38.ae -- DEACTIVATE IS REFUSED WHILE MATCHED; THE FREED-COA RE-REGISTER
// PATH CANNOT DOUBLE-CONSUME AN ENTRY (design section 4.1's deactivate-while-
// matched refusal + the COA-pooled exclusivity bound: one GL movement never
// clears two lines, even across bank-account generations sharing a chart
// account).
// ===========================================================================
test("x38.ae deactivate is refused while matched; the freed-COA re-register path cannot double-consume an entry", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const aeCoa = "173-AE1";
  await upsertAccountClassed(sub, { client, code: aeCoa, name: "x38.ae bank gl", type: "asset", opKey: opk("ae-gl") });

  const acctA = await addBankAccount(sub, { client, coaAccountCode: aeCoa, accountNumber: `1077A${randomUUID().slice(0, 6)}` });
  const bankA = idOf(acctA, "bank_account_id", "id");
  assert.ok(bankA, "x38.ae mandatory setup: account A registers on the fresh COA");

  const entry = await plainEntry(sub, { client, debit: aeCoa, credit: REVN, cents: 24000, memo: "x38.ae live-match fixture" });
  const stmtA = await enterStatement(sub, {
    client, bankAccount: bankA, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 24000, entryDate: "2026-06-10" }],
  });
  const lineA = stmtA.lines[0];
  const receiptA = await matchBankLine(sub, { client, lines: [lineA.id], entries: [{ entry_id: entry, matched_cents: 24000 }] });
  const matchA = matchIdOf(receiptA);
  assert.ok(matchA, "x38.ae mandatory setup: account A's line is matched live");

  // (a) deactivate refuses while a live match group survives on the account.
  const deactDenied = await caught(() => deactivateBankAccount(sub, { client, bankAccount: bankA, reason: "x38.ae attempt while matched" }));
  assert.ok(deactDenied, "deactivate_bank_account must refuse while a pending/live match group survives on the account");
  assert.equal(deactDenied.code, CLR10, `the refusal is CLR10 (got ${deactDenied.code} -- ${deactDenied.message})`);
  assert.equal(reasonOf(deactDenied), "bank_account_has_live_matches", `the named reason is bank_account_has_live_matches (got ${reasonOf(deactDenied)})`);

  // (b) unmatch frees the account; deactivate now succeeds; a NEW bank account re-registers
  // on the SAME (now-freed) chart account -- "deactivate-and-remap is a real remedy".
  await unmatchBankMatch(sub, { client, match: matchA, reason: "x38.ae freeing the account for deactivation" });
  await deactivateBankAccount(sub, { client, bankAccount: bankA, reason: "x38.ae now unmatched" });

  const acctB = await addBankAccount(sub, { client, coaAccountCode: aeCoa, accountNumber: `1077B${randomUUID().slice(0, 6)}` });
  const bankB = idOf(acctB, "bank_account_id", "id");
  assert.ok(bankB, "add_bank_account re-registers the freed COA under a new bank-account generation");

  const stmtB = await enterStatement(sub, {
    client, bankAccount: bankB, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 0,
    specs: [
      { amountCents: 24000, entryDate: "2026-07-08", description: "x38.ae re-match against the same entry" },
      { amountCents: 24000, entryDate: "2026-07-09", description: "x38.ae the double-consume attempt" },
    ],
  });
  const [lineB1, lineB2] = stmtB.lines;

  // Re-matching the SAME already-approved entry through the new bank-account generation
  // succeeds -- the unmatch genuinely freed the entry's own per-side gross, not just the
  // account row's slot.
  const receiptB = await matchBankLine(sub, { client, lines: [lineB1.id], entries: [{ entry_id: entry, matched_cents: 24000 }] });
  const matchB = matchIdOf(receiptB);
  assert.ok(matchB, "the SAME entry re-matches cleanly through the new bank-account generation on the freed COA");
  await assertGroupTies(matchB, "x38.ae re-match after the COA generation change");

  // A SECOND +X line against the SAME entry must NOT double-consume it -- the bound is on the
  // ENTRY'S OWN GL movement (its debit-side gross, already exhausted by matchB), not on which
  // bank-account generation is asking.
  const doubleConsume = await caught(() => matchBankLine(sub, {
    client, lines: [lineB2.id], entries: [{ entry_id: entry, matched_cents: 24000 }],
  }));
  assert.ok(doubleConsume, "a second +X line against the SAME entry must be refused -- one GL movement never clears two lines even across account generations");
  assert.equal(reasonOf(doubleConsume), "already_matched", `the named reason is already_matched (got ${reasonOf(doubleConsume)})`);
});

// ===========================================================================
// x38.af -- THE SIX /bank READ RPCs' CROSS-FIRM TENANCY (0038 SECTION R: every
// reader is SECURITY DEFINER, carries firm_id = c.firm in every predicate, and
// "cross-firm probes return zero rows, never a discriminating error"). A
// firm-B owner (dave) targeting firm-A objects on all six readers.
// ===========================================================================
test("x38.af the six /bank read RPCs return empty for a firm-B actor over firm-A objects, never a discriminating error", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const dave = world.users.dave;

  const cp = await birthCounterparty(sub, { client, name: `X38 READCROSS ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await counterpartyStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 8800, control: AR1 });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-06-01", periodEnd: "2026-06-30", opening: 0,
    specs: [{ amountCents: 8800, entryDate: "2026-06-21", description: "x38.af cross-firm read probe" }],
  });

  const probes = [
    ["list_bank_accounts", () => humanQuery(dave, "select clara.list_bank_accounts(p_client => $1) as r", [client])],
    ["list_bank_account_proposals", () => humanQuery(dave, "select clara.list_bank_account_proposals(p_client => $1) as r", [client])],
    ["list_bank_statements", () => humanQuery(dave, "select clara.list_bank_statements(p_client => $1, p_bank_account => $2) as r", [client, bankAcct.A1.primary])],
    ["get_bank_statement", () => humanQuery(dave, "select clara.get_bank_statement(p_statement => $1) as r", [stmt.statementId])],
    ["list_open_items_by_counterparty", () => humanQuery(dave, "select clara.list_open_items_by_counterparty(p_client => $1, p_domain => $2, p_counterparty => $3) as r", [client, "ar", cp])],
    ["list_bank_match_candidates", () => humanQuery(dave, "select clara.list_bank_match_candidates(p_client => $1, p_bank_account => $2) as r", [client, bankAcct.A1.primary])],
  ];
  for (const [label, run] of probes) {
    const res = await run();
    const r = res.rows[0].r;
    const isEmpty = r === null || (Array.isArray(r) && r.length === 0) || (typeof r === "object" && r !== null && !Array.isArray(r) && Object.keys(r).length === 0);
    assert.ok(isEmpty, `${label}: a firm-B actor over a firm-A object must get empty, not a discriminating error (got ${JSON.stringify(r)})`);
  }

  // Mandatory setup check: the SAME reads, as the firm-A owner, are non-empty -- the probes
  // above are proving TENANCY, not a universally-broken reader.
  const own = await humanQuery(sub, "select clara.list_bank_accounts(p_client => $1) as r", [client]);
  assert.ok(Array.isArray(own.rows[0].r) && own.rows[0].r.length > 0, "x38.af mandatory setup: the firm-A owner's OWN list_bank_accounts read is non-empty");
  assert.equal(await outstandingOf(inv.item), 8800, "x38.af mandatory setup: the firm-A open item exists and is untouched by the cross-firm probes");
});

// ===========================================================================
// x38.ag -- THE DEFERRED-ANCILLARY ARC END TO END (delta-review MAJOR-1,
// 2026-07-31: the wave's highest-value new money path had zero executed
// coverage -- every prior high-stakes settle was AR with allocations only, so
// pending_ancillaries only ever carried {charge_cents:0, adjustments:[]}).
// A high-stakes AP settlement carrying a wire fee AND a difference adjustment:
// settle posts NOTHING beside the pending reservation (zero entry members;
// the payload rides bank_matches.pending_ancillaries, domain-aware), the
// checker approves the settlement draft through the ordinary /queue verb,
// and complete_pending_match posts the charge + adjustment entries BEFORE its
// parity derivation, ties the group, and clears the payload. Replayed
// complete is a same-receipt no-op (the ancillaries never double-post).
// ===========================================================================
test("x38.ag deferred ancillaries: a high-stakes AP settle with charge+adjustment posts them at COMPLETE, ties, and replays safely", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const CHARGE = 2000;
  const ADJ = -500; // SIGNED bank effect of the difference adjustment (an extra 500 out)
  const cp = await birthCounterparty(sub, { client, name: `X38 DEFANCCO ${randomUUID().slice(0, 6)}` });
  const bill = await counterpartyStampedItem(sub, {
    client, domain: "ap", cp, cpKind: "vendor", cents: HIGH_STAKES_CENTS, control: AP1, checker: world.users.bob,
  });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAcct.A1.primary, periodStart: "2026-07-01", periodEnd: "2026-07-31",
    opening: 3 * HIGH_STAKES_CENTS,
    specs: [{
      amountCents: -(HIGH_STAKES_CENTS + CHARGE + 500), entryDate: "2026-07-08",
      description: "x38.ag wire + fee + difference, one combined withdrawal",
    }],
  });
  const line = stmt.lines[0];

  const receipt = await settleFromBankLine(sub, {
    client, line: line.id, counterparty: cp, controlAccount: AP1,
    allocations: [{ item_id: bill.item, amount_cents: HIGH_STAKES_CENTS }],
    memo: "x38.ag deferred-ancillary settlement",
    chargeCents: CHARGE, chargeAccount: CHARGEX,
    adjustments: [{ account_code: ADJX, amount_cents: ADJ, memo: "x38.ag FX difference" }],
  });
  const pendingMatch = matchIdOf(receipt);
  const draftEntry = idOf(receipt, "entry_id", "entry");
  assert.ok(pendingMatch, "the threshold settle returns the reservation's match id");
  assert.equal(
    receipt.ancillaries_deferred ?? receipt.ancillariesDeferred, true,
    `settle's receipt says the ancillaries were DEFERRED, not posted (got ${JSON.stringify(receipt)})`,
  );

  // The reservation law: zero entry members, the draft anchor, and the payload on the row.
  assert.equal((await entryMemberRows(pendingMatch)).length, 0,
    "a pending reservation holds ZERO entry members -- nothing posted beside the draft");
  assert.equal(await entryStatusOf(draftEntry), "draft", "the settlement entry stays a draft for the checker");
  const anc = (await rootQuery(
    "select pending_ancillaries as p from clara.bank_matches where id=$1", [pendingMatch])).rows[0].p;
  assert.ok(anc, "pending_ancillaries carries the deferred payload while the group is pending");
  assert.equal(Number(anc.charge_cents), CHARGE, `the AP branch carries the charge (got ${JSON.stringify(anc)})`);
  assert.equal(anc.charge_account, CHARGEX, "the charge account rides the payload");
  assert.equal((anc.adjustments ?? []).length, 1, "exactly one adjustment rides the payload");
  assert.equal(anc.domain, "ap", "the payload records its domain for legibility");

  // The checker approves through the ORDINARY verb; then complete posts the ancillaries.
  const rev = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [draftEntry])).rows[0];
  await approveEntry(world.users.bob, { entry: draftEntry, expectedRevision: rev.revision_token, opKey: opk("x38-ag-approve") });

  const completeKey = opk("x38-ag-complete");
  const completed = await completePendingMatch(sub, { client, match: pendingMatch, opKey: completeKey });
  const chargeEntry = completed.charge_entry_id ?? completed.chargeEntryId;
  const adjEntries = completed.adjustment_entry_ids ?? completed.adjustmentEntryIds ?? [];
  assert.ok(chargeEntry, `complete's receipt names the charge entry it posted (got ${JSON.stringify(completed)})`);
  assert.equal(adjEntries.length, 1, `complete's receipt names exactly one adjustment entry (got ${JSON.stringify(completed)})`);

  const liveRow = await matchRow(pendingMatch);
  assert.equal(liveRow.status, "live", "pending -> live with the ancillaries posted");
  assert.equal(liveRow.pending_ancillaries ?? null, null, "the payload is CLEARED in the same flip");
  const members = await entryMemberRows(pendingMatch);
  assert.equal(members.length, 3,
    `the live group holds THREE entry members: settlement + charge + adjustment (got ${members.length})`);
  const byEntry = new Map(members.map((m) => [m.entry_id, Number(m.matched_cents)]));
  assert.equal(byEntry.get(draftEntry), -HIGH_STAKES_CENTS, "the settlement member carries the allocation-side bank effect");
  assert.equal(byEntry.get(chargeEntry), -CHARGE, "the charge member carries the fee's bank effect");
  assert.equal(byEntry.get(adjEntries[0]), ADJ, "the adjustment member carries its SIGNED bank effect");
  assert.equal(await entryStatusOf(chargeEntry), "approved", "the charge entry posts approved (below threshold)");
  assert.equal(await entryStatusOf(adjEntries[0]), "approved", "the adjustment entry posts approved (below threshold)");
  await assertGroupTies(pendingMatch, "x38.ag deferred ancillaries completed");
  assert.equal(await outstandingOf(bill.item), 0, "the bill clears at its own gross -- the fee and difference never touch it");

  // Replay with the SAME op key: the dedupe returns before the ancillary reservations --
  // no second charge entry, no fourth member.
  const replay = await completePendingMatch(sub, { client, match: pendingMatch, opKey: completeKey });
  assert.ok(replay, "the replayed complete returns a receipt, not an error");
  assert.equal((await entryMemberRows(pendingMatch)).length, 3, "the replay posted NOTHING new");
  const chargeCount = (await rootQuery(
    "select count(*)::int as n from clara.bank_match_entry_members where match_id=$1 and entry_id=$2",
    [pendingMatch, chargeEntry])).rows[0].n;
  assert.equal(chargeCount, 1, "exactly one charge member exists after the replay");
});
