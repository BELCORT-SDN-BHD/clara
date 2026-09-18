// #657 — MATCH BANK EVIDENCE TO AN ALREADY-APPROVED BOOKING (migration 0226).
//
// The ticket's centre is a NEGATIVE that nothing in this estate asserted: clearing a statement
// line against an entry that is ALREADY in the books must allocate the existing movement and
// create NOTHING — no journal entry, no journal line, no open item, no allocation — and the GL
// cash figure on that bank account must be the same number before and after. `x38.a:211-233`
// stops at group ties; `snap()` (x38-wave-c-b-match.test.mjs:1420-1427) serves only x38.y. So
// cell 1 below is the proof, and it is EXPORTED as a shape (`bank-no-new-cash.mjs`) because
// #666 and #667 land on this chassis next (SYNTHESIS.md:447).
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A REAL LEAST-PRIVILEGED PERSONA (`humanQuery` via the
// x38 fixture wrappers). `rootQuery` appears only for LABELLED fixture arrangement and for
// catalog facts a granted door deliberately never returns (pg_proc, ACLs, raw row counts).
//
// THE NINE CELLS:
//   p657.db.no-new-cash            the centre: five figures unchanged, one receipt, and the
//                                  door's OWN receipt states new_journal_entries = 0.
//   p657.db.one-receipt-under-retry a replayed op key returns the byte-identical receipt and
//                                  writes no second match (extends x38.x:1373 against the
//                                  ENRICHED _finish_op payload).
//   p657.db.capacity-race          two sessions, two lines, ONE entry with capacity for only
//                                  one of them: one wins, one refuses by name, capacity never
//                                  goes negative. Blocking is PROVEN, in x38.g:387-460's shape.
//   p657.db.candidate-enrichment   canonical counterparty NAME, truthful high_stakes, bounded
//                                  match_history; a spent candidate is absent; a foreign firm's
//                                  entry is invisible under real RLS.
//   p657.db.pack-parity            the agent pack's inlined candidate projection IS the public
//                                  read's, field for field (Q4 / SYNTHESIS J3).
//   p657.db.matching-context       the new read: line facts, statement header + lineage +
//                                  FILENAME, coverage lifted from list_bank_statements' own
//                                  tie, and one deterministic basis row per candidate.
//   p657.db.exception-context      a governing open exception keeps the line READABLE with
//                                  blocking/caused_by/remedy_calls, while match_bank_line still
//                                  refuses `line_excepted` and no write-off / suspense /
//                                  adjustment row appears anywhere.
//   p657.db.opkey-parse-free       C33.8: a key with no colons and a key with colons inside the
//                                  payload both bind to the right task; a digest from another
//                                  task refuses `inputs_digest_unverified`; a pre-0226 receipt
//                                  (wake_task_id NULL) still binds through the fallback.
//   p657.db.digest-census          C33.7's re-census: exactly the thirteen rostered cores call
//                                  the verifier, all at #657's post-image, and no split_part
//                                  survives at the comparison site.
//   p657.db.acl                    the new read is clara_authenticated-only (refused to
//                                  clara_runtime, both wake roles and a viewer); the two
//                                  ungranted helpers hold zero grants; every recut body keeps
//                                  owner / SECURITY DEFINER / search_path / ACL.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, withActor, opk,
  endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
  a21EnsureReady, buildWorld, firmOf,
  upsertAccountClassed, upsertPayableAccount, grantConsent,
  idOf, roleCanExecute, draftEntryV3, approveEntry,
} from "./a21-helpers.mjs";
import {
  BANKCOA1, BANKCOA2, AR1, AP1, EXPN, REVN, CLR10,
  hasBankMatching, caught, manualRes,
  addBankAccount, enterStatement, matchBankLine, assertGroupTies,
  birthCounterparty, plainEntry,
} from "./x38-match-fixtures.mjs";
import { snapshotNoNewCash, assertNoNewCash, assertReceiptStatesNoNewCash } from "./bank-no-new-cash.mjs";

const CONTEXT_READ = "clara.get_bank_line_matching_context(uuid)";
const CONTEXT_FN = "get_bank_line_matching_context";
const MIGRATION = "0226_bank_match_evidence.sql";

/** The thirteen `_agent_*_core` bodies 0129:1067-1081 rosters and 0226 §7 re-patches. */
const THIRTEEN = [
  "clara._agent_add_bank_account_core(uuid,text,uuid,text,text,text,text,jsonb,text,text)",
  "clara._agent_book_staff_advance_application_core(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)",
  "clara._agent_complete_bank_reconciliation_core(uuid,uuid[],text,jsonb,text,text)",
  "clara._agent_match_bank_line_core(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)",
  "clara._agent_propose_bank_identifier_promotion_core(uuid,uuid,text,text,int,text,jsonb,text,text)",
  "clara._agent_propose_line_exception_core(uuid,text,text,uuid,text,jsonb,text,text)",
  "clara._agent_resolve_and_book_core(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean)",
  "clara._agent_resolve_bank_line_exception_core(uuid,text,text,uuid,text,jsonb,text,text)",
  "clara._agent_settle_from_bank_line_core(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text)",
  "clara._agent_unmatch_bank_match_core(uuid,uuid,text,text,jsonb,text,text)",
  "clara._agent_upsert_account_core(uuid,text,text,text,text,text,text,jsonb,text,text)",
  "clara._agent_void_bank_reconciliation_core(uuid,text,text,jsonb,text,text)",
  "clara._agent_void_bank_statement_core(uuid,uuid,text,text,jsonb,text,text)",
];

let ready = false;
let world = null;
let bankAcct = null;

function skipHere(t) {
  if (!ready) {
    markSkip();
    t.skip("#657 bank-match-evidence premise absent — battery dormant");
    return true;
  }
  return false;
}

const contextOf = async (sub, line) =>
  (await humanQuery(sub, "select clara.get_bank_line_matching_context(p_line => $1::uuid) as result", [line]))
    .rows[0].result;

const candidatesOf = async (sub, client, bankAccount) =>
  (await humanQuery(
    sub,
    "select clara.list_bank_match_candidates(p_client => $1::uuid, p_bank_account => $2::uuid) as result",
    [client, bankAccount],
  )).rows[0].result ?? [];

const prosrcOf = async (sig) =>
  (await rootQuery("select p.prosrc from pg_proc p where p.oid = $1::regprocedure", [sig])).rows[0]?.prosrc ?? null;

/**
 * A bank-touching APPROVED entry whose lines carry a counterparty.
 *
 * MEASURED, and the reason this helper exists rather than a door call: `_draft_entry_core`
 * stamps `journal_lines.counterparty_id` ONLY when a vendor BINDING is present AND only on a
 * line whose `coa_accounts.account_class` is payable/receivable — so a Dr bank / Cr revenue
 * receipt, which is exactly the #657 shape, never carries one through the ordinary draft path
 * (verified on this rig: zero of 48 journal_lines carried a counterparty before this fixture).
 * The stamp is therefore written as LABELLED FIXTURE DML on the DRAFT, where the line is still
 * mutable (an approved entry's lines are immutable by trigger — "lines of an approved/withdrawn
 * entry are immutable"), and the entry is approved afterwards through the real door. The state
 * produced is one the read must handle; nothing about the READ is faked.
 */
async function bankEntryWithCounterparty(sub, { client, cents, counterparty, memo }) {
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo, postingDate: "2026-06-15",
    lines: [
      { account_code: BANKCOA1, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    opKey: opk("p657-cpentry"),
  });
  await rootQuery(
    "update clara.journal_lines set counterparty_id = $1 where entry_id = $2 and account_code = $3",
    [counterparty, d.entry_id, REVN]);
  // The fixture DML moves the entry's own revision token (the optimistic-concurrency belt does
  // its job), so the approve must carry the CURRENT one — re-read, never re-use.
  const rev = await rootQuery("select revision_token from clara.journal_entries where id = $1", [d.entry_id]);
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: rev.rows[0].revision_token, opKey: opk("p657-cpentrya") });
  return d.entry_id;
}

before(async () => {
  const base = await a21EnsureReady();
  const bank = Boolean(base.base && base.has16 && (await hasBankMatching()));
  if (!bank) {
    noteLane("bank matching surface absent — #657 battery dormant");
    return;
  }
  const present = await rootQuery("select to_regprocedure($1) is not null as present", [CONTEXT_READ]);
  if (present.rows[0]?.present !== true) {
    if (process.env.CLARA_ALLOW_MISSING_BANK_MATCH_EVIDENCE !== "1") {
      throw new Error(
        `#657 premise ${MIGRATION} is not applied (${CONTEXT_READ} does not resolve) and ` +
          "CLARA_ALLOW_MISSING_BANK_MATCH_EVIDENCE is unset — this is a FOCUSED run and must fail " +
          "LOUDLY, not skip. Preload ./tests/bank-match-evidence-preintegration-gate.mjs for an " +
          "estate sweep against a pre-0226 chain.",
      );
    }
    noteLane("0226 not applied — #657 battery dormant behind its pre-integration gate");
    return;
  }
  world = await buildWorld();
  bankAcct = {};
  for (const key of ["A1", "A2", "B1"]) {
    const client = world.clients[key];
    const sub = key === "B1" ? world.users.dave : world.users.alice;
    await upsertAccountClassed(sub, { client, code: BANKCOA1, name: "Maybank current (p657)", type: "asset", opKey: opk("p657bcoa1") });
    await upsertAccountClassed(sub, { client, code: BANKCOA2, name: "Maybank FD (p657)", type: "asset", opKey: opk("p657bcoa2") });
    await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (p657)", type: "asset", accountClass: "receivable", opKey: opk("p657ar1") });
    await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (p657)", opKey: opk("p657ap1") });
    await upsertAccountClassed(sub, { client, code: EXPN, name: "Prof Fees (p657)", type: "expense", opKey: opk("p657exp") });
    await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (p657)", type: "income", opKey: opk("p657rev") });
    await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
    const a = await addBankAccount(sub, { client, coaAccountCode: BANKCOA1, accountNumber: `6570${key}${randomUUID().slice(0, 6)}` });
    bankAcct[key] = { primary: idOf(a, "bank_account_id", "id") };
  }
  ready = true;
});

after(async () => {
  printLaneNotes("#657 bank-line-existing-booking");
  printSkipCount("#657 bank-line-existing-booking");
  await endPool();
});

// ===========================================================================
// p657.db.no-new-cash — THE CENTRE.
// ===========================================================================
test("p657.db.no-new-cash · matching an already-approved booking creates NO journal, NO open item and moves NO GL cash", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const bank = bankAcct.A1.primary;

  // The booking exists FIRST and is approved — that is the whole premise of #657.
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 128_000, memo: "p657 deposit already booked" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bank, periodStart: "2026-07-01", periodEnd: "2026-07-31", opening: 0,
    specs: [{ amountCents: 128_000, entryDate: "2026-07-14", description: "p657 inbound MBB" }],
  });
  const line = stmt.lines[0];

  const before = await snapshotNoNewCash(sub, { client, bankAccount: bank, statement: stmt.statementId });
  const receipt = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 128_000 }] });
  const after = await snapshotNoNewCash(sub, { client, bankAccount: bank, statement: stmt.statementId });

  assertNoNewCash(before, after, { label: "p657.db.no-new-cash" });
  assertReceiptStatesNoNewCash(receipt, "p657.db.no-new-cash");
  assert.equal(receipt.match_id != null, true, "the receipt names the match it created");
  assert.equal(receipt.bank_account_id, bank, "the receipt names the bank account, so the face links it without a second read");
  assert.deepEqual(receipt.line_ids, [line.id], "the receipt names the lines it allocated");
  assert.deepEqual(receipt.entry_ids, [entry], "the receipt names the PRE-EXISTING entry it allocated against");
  await assertGroupTies(receipt.match_id, "p657.db.no-new-cash");

  // The line left the unmatched report — the allocation is real, not cosmetic.
  const unmatched = (await humanQuery(sub, "select clara.list_unmatched_lines(p_client => $1::uuid) as result", [client])).rows[0].result ?? [];
  assert.equal(unmatched.some((l) => l.line_id === line.id), false, "the matched line is gone from list_unmatched_lines");
});

// ===========================================================================
// p657.db.one-receipt-under-retry — AC4/AC10's DB half, against the ENRICHED payload.
// ===========================================================================
test("p657.db.one-receipt-under-retry · a replayed op key returns the byte-identical enriched receipt and writes no second match", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const bank = bankAcct.A1.primary;
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 41_000, memo: "p657 retry deposit" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bank, periodStart: "2026-08-01", periodEnd: "2026-08-31", opening: 0,
    specs: [{ amountCents: 41_000, entryDate: "2026-08-03", description: "p657 retry inbound" }],
  });
  const line = stmt.lines[0];
  const key = opk("p657-retry");

  const first = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 41_000 }], opKey: key });
  const matchesBefore = await rootQuery("select count(*)::int n from clara.bank_matches where client_id = $1", [client]);
  // THE LOST RESPONSE: the caller never saw `first`, and resubmits the SAME intent under the
  // SAME key. This is exactly what #657's web-side intent-hash key makes happen by construction.
  const second = await matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 41_000 }], opKey: key });
  const matchesAfter = await rootQuery("select count(*)::int n from clara.bank_matches where client_id = $1", [client]);

  assert.deepEqual(second, first, "the replayed key returns the BYTE-IDENTICAL receipt, enriched fields included");
  assert.equal(matchesAfter.rows[0].n, matchesBefore.rows[0].n, "no second bank_matches row was written");
  assertReceiptStatesNoNewCash(second, "p657.db.one-receipt-under-retry");
  const receipts = await rootQuery(
    "select count(*)::int n from clara.op_receipts where fn = 'match_bank_line' and op_key = $1", [key]);
  assert.equal(receipts.rows[0].n, 1, "exactly ONE op_receipts row exists for the replayed key");
});

// ===========================================================================
// p657.db.capacity-race — two sessions, two lines, ONE entry. Blocking PROVEN.
// ===========================================================================
test("p657.db.capacity-race · two concurrent matches against one entry's remaining capacity: one wins, one refuses by name, capacity never goes negative", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const bank = bankAcct.A1.primary;

  // ONE entry with 90_000 of debit capacity on the bank COA; TWO lines of 90_000 each.
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 90_000, memo: "p657 race single capacity" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bank, periodStart: "2026-09-01", periodEnd: "2026-09-30", opening: 0,
    specs: [
      { amountCents: 90_000, entryDate: "2026-09-05", description: "p657 race line one" },
      { amountCents: 90_000, entryDate: "2026-09-06", description: "p657 race line two" },
    ],
  });
  const [lineA, lineB] = stmt.lines;
  const jwt = JSON.stringify({ sub, role: "authenticated" });

  // x38.g:387-460's two-session shape. Session 1 holds its transaction open behind a gate;
  // session 2 must BLOCK on the rungs session 1 holds, and only after session 1 commits may it
  // proceed — and then be refused, because the capacity is gone. The gate is what makes
  // "blocking" an OBSERVATION rather than a hopeful sleep.
  let release;
  const gate = new Promise((r) => { release = r; });
  const first = withActor({ role: "clara_authenticated", transaction: true }, async (c1) => {
    await c1.query("select set_config('request.jwt.claims', $1, true)", [jwt]);
    await c1.query("set local statement_timeout = '30000ms'");
    const r1 = await c1.query(
      "select clara.match_bank_line(p_client => $1::uuid, p_lines => $2::jsonb, p_entries => $3::jsonb, p_op_key => $4) as result",
      [client, JSON.stringify([lineA.id]), JSON.stringify([{ entry_id: entry, matched_cents: 90_000 }]), opk("p657-race-a")],
    );
    await gate;
    return r1.rows[0].result;
  });
  await new Promise((r) => setTimeout(r, 500)); // session 1 has taken its locks
  const second = withActor({ role: "clara_authenticated", transaction: true }, async (c2) => {
    await c2.query("select set_config('request.jwt.claims', $1, true)", [jwt]);
    await c2.query("set local statement_timeout = '30000ms'");
    return c2.query(
      "select clara.match_bank_line(p_client => $1::uuid, p_lines => $2::jsonb, p_entries => $3::jsonb, p_op_key => $4) as result",
      [client, JSON.stringify([lineB.id]), JSON.stringify([{ entry_id: entry, matched_cents: 90_000 }]), opk("p657-race-b")],
    );
  }).then(() => ({ ok: true }), (e) => ({ ok: false, err: e }));

  const raced = await Promise.race([second.then(() => "finished"), new Promise((r) => setTimeout(() => r("blocked"), 1200))]);
  const blocked = raced === "blocked";
  release();
  const firstResult = await first;
  const secondResult = await second;

  assert.equal(blocked, true, "session 2 BLOCKED on session 1's locks — the serialization point is real, not a timing coincidence");
  assert.ok(firstResult?.match_id, "session 1 won and holds the capacity");
  assert.equal(secondResult.ok, false, "session 2 was REFUSED once session 1 committed");
  assert.equal(secondResult.err.code, CLR10, `the refusal is CLR10 (got ${secondResult.err.code}: ${secondResult.err.message})`);
  const detail = JSON.parse(secondResult.err.detail ?? "{}");
  assert.equal(detail.reason, "already_matched",
    `the per-side exhaustion refusal names itself (got ${JSON.stringify(detail)})`);
  assert.equal(detail.side, "debit", `the refusal names the SIDE (got ${JSON.stringify(detail)})`);
  assert.equal(detail.entry_id, entry, "the refusal names the entry whose capacity ran out");

  // Capacity is never negative afterwards.
  const cands = await candidatesOf(sub, client, bank);
  const row = cands.find((c) => c.entry_id === entry);
  if (row) {
    assert.ok(Number(row.debit_remaining_cents) >= 0, "debit_remaining_cents never goes negative");
    assert.ok(Number(row.credit_remaining_cents) >= 0, "credit_remaining_cents never goes negative");
  }
  const spent = await rootQuery(
    "select coalesce(sum(em.matched_cents),0)::bigint s from clara.bank_match_entry_members em join clara.bank_matches bm on bm.id = em.match_id where em.entry_id = $1 and bm.status in ('pending','live')",
    [entry]);
  assert.equal(Number(spent.rows[0].s), 90_000, "exactly ONE of the two lines consumed the entry's 90_000");
});

// ===========================================================================
// p657.db.candidate-enrichment — the three additions, honestly.
// ===========================================================================
test("p657.db.candidate-enrichment · the recut read returns the canonical counterparty NAME, a truthful high_stakes and a bounded match_history", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const bank = bankAcct.A2.primary;

  const cpName = `Sinaran Logistik ${randomUUID().slice(0, 4)}`;
  const cp = await birthCounterparty(sub, { client, name: cpName, kind: "customer" });
  const cpId = typeof cp === "string" ? cp : idOf(cp, "counterparty_id", "id");
  const routine = await bankEntryWithCounterparty(sub, { client, cents: 25_000, counterparty: cpId, memo: "p657 routine receipt" });
  // A high-stakes entry, made high-stakes the way the estate's OWN predicate reads it
  // (clara.is_high_stakes: a debit total at or above the firm's threshold) rather than by
  // setting the flag this read is supposed to report.
  const heavy = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 250_000_000, memo: "p657 heavy receipt",
    checker: world.users.bob, attestation: null });

  const cands = await candidatesOf(sub, client, bank);
  const routineRow = cands.find((c) => c.entry_id === routine);
  const heavyRow = cands.find((c) => c.entry_id === heavy);

  assert.ok(routineRow, "the routine entry is a candidate");
  assert.equal(routineRow.counterparty_id, cpId, "the candidate still carries the counterparty id");
  assert.equal(routineRow.counterparty_name, cpName,
    `the candidate now carries the CANONICAL counterparty's name (got ${JSON.stringify(routineRow.counterparty_name)})`);
  for (const row of cands) {
    assert.ok("counterparty_name" in row, "every candidate row carries the key, present or null");
    if (row.counterparty_id === null) {
      assert.equal(row.counterparty_name, null, "no counterparty id means an honest null name, never an invented one");
    }
  }
  assert.equal(routineRow.high_stakes, false, "a routine entry is honestly NOT high stakes");
  assert.deepEqual(routineRow.match_history, [], "an entry never matched carries an empty history, not a null");

  assert.ok(heavyRow, "the heavy entry is a candidate");
  assert.equal(heavyRow.high_stakes, true,
    "high_stakes is TRUTHFUL now — 0038:8025 hardcoded false and told every human no candidate was ever high-stakes");

  // A candidate with zero remaining capacity is ABSENT.
  const spent = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 33_000, memo: "p657 fully spent" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bank, periodStart: "2026-10-01", periodEnd: "2026-10-31", opening: 0,
    specs: [{ amountCents: 33_000, entryDate: "2026-10-02", description: "p657 spends it" }],
  });
  const m = await matchBankLine(sub, { client, lines: [stmt.lines[0].id], entries: [{ entry_id: spent, matched_cents: 33_000 }] });
  const after = await candidatesOf(sub, client, bank);
  assert.equal(after.some((c) => c.entry_id === spent), false, "a candidate with zero remaining capacity is absent from the read");

  // …and the entry it consumed now carries a bounded history where the read still shows it.
  const hist = await rootQuery(
    "select count(*)::int n from clara.bank_match_entry_members where entry_id = $1", [spent]);
  assert.equal(hist.rows[0].n, 1, "the spent entry has exactly one member row (the fixture for the history projection)");
  assert.ok(m.match_id, "the fixture match landed");

  // Cross-firm: firm B's owner sees NONE of firm A's candidates (real RLS + the firm predicate).
  const foreign = await candidatesOf(world.users.dave, client, bank);
  assert.deepEqual(foreign, [], "a foreign firm's session sees an empty candidate list, never another firm's entries");
});

// ===========================================================================
// p657.db.pack-parity — Q4 / SYNTHESIS J3, asserted from the test side.
// ===========================================================================
test("p657.db.pack-parity · the agent pack's inlined candidate projection IS the public read's, field for field", async (t) => {
  if (skipHere(t)) return;
  const pub = await prosrcOf("clara.list_bank_match_candidates(uuid,uuid)");
  const pack = await prosrcOf("clara._agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)");
  const cut = (src, which) => {
    const b = src.indexOf("/* P657-CAND-BEGIN */");
    const e = src.indexOf("/* P657-CAND-END */");
    assert.ok(b >= 0 && e > b, `${which} carries no marked candidate projection — the two copies can drift again`);
    return src.slice(b + "/* P657-CAND-BEGIN */".length, e).replace(/\s+/g, " ").trim();
  };
  const a = cut(pub, "list_bank_match_candidates");
  const b = cut(pack, "_agent_get_bank_pack_core");
  assert.equal(a, b, "the two candidate projections are NOT identical — 0040 FIX WAVE A5's drift class is open again");
  for (const field of ["counterparty_name", "high_stakes", "match_history", "debit_remaining_cents", "credit_remaining_cents"]) {
    assert.ok(a.includes(field), `the shared projection is missing ${field}`);
  }
  assert.equal(a.includes("'high_stakes', false"), false, "the shared projection still hardcodes high_stakes=false");
});

// ===========================================================================
// p657.db.matching-context — the new read.
// ===========================================================================
test("p657.db.matching-context · the line read carries its own facts, the statement header + lineage + filename, lifted coverage and a deterministic basis", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const bank = bankAcct.A1.primary;
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 77_000, memo: "p657 context entry" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bank, periodStart: "2026-11-01", periodEnd: "2026-11-30", opening: 0,
    specs: [{ amountCents: 77_000, entryDate: "2026-11-09", description: "p657 context inbound" }],
  });
  const line = stmt.lines[0];

  const ctx = await contextOf(sub, line.id);
  assert.ok(ctx, "the read answers for a line in the caller's own firm");
  assert.equal(ctx.schema, "clara.bank-line-matching-context/v1");
  assert.equal(ctx.line.line_id, line.id);
  assert.equal(Number(ctx.line.amount_cents), 77_000, "the line's own amount");
  assert.ok(ctx.line.entry_date, "the line's own date (AC1: the facts list_unmatched_lines already returns)");
  assert.equal(ctx.line.description, "p657 context inbound");
  assert.equal(ctx.statement.id, stmt.statementId);
  assert.equal(ctx.statement.status, "live");
  assert.equal(ctx.statement.superseded_by, null, "lineage is emitted, not inferred");
  assert.ok("source_doc_sha256" in ctx.statement,
    "source_doc_sha256 (0038:375) is emitted by this read — no other read in the estate emits it");
  assert.ok("original_filename" in ctx.statement, "AC6's filename rides the join documents.original_filename");
  assert.equal(Number(ctx.coverage.line_count), 1, "coverage: the statement's line count");
  assert.ok(ctx.coverage.tie && "gl_balance_cents" in ctx.coverage.tie,
    "coverage.tie is LIFTED from list_bank_statements' own tie object — #657 adds no second cash expression");
  assert.equal(ctx.exception, null, "no exception on a clean line");
  assert.equal(ctx.booking_block, null, "nothing blocks a clean line");

  const basis = ctx.candidate_basis.find((b) => b.entry_id === entry);
  assert.ok(basis, "the basis carries one row per candidate entry of this line's bank account");
  assert.equal(basis.amount_exact, true, "amount_exact is a BOOLEAN fact, not a closeness score");
  assert.equal(typeof basis.date_delta_days, "number", "date_delta_days is a signed whole-day count");
  assert.ok(["id", "name", "none"].includes(basis.counterparty_match),
    `counterparty_match is one of the three named rungs (got ${JSON.stringify(basis.counterparty_match)})`);
  assert.ok("class_hint" in basis, "the basis carries the line's class hint");
  for (const row of ctx.candidate_basis) {
    for (const k of Object.keys(row)) {
      assert.ok(["entry_id", "amount_exact", "date_delta_days", "counterparty_match", "class_hint"].includes(k),
        `the basis row carries an unexpected field ${k} — Q3/J2 forbids a score anywhere in it`);
    }
  }

  // No existence oracle: a foreign firm's session gets NULL, exactly as an invented id does.
  assert.equal(await contextOf(world.users.dave, line.id), null, "a foreign firm reads NULL");
  assert.equal(await contextOf(sub, randomUUID()), null, "an invented line reads the SAME NULL");
});

// ===========================================================================
// p657.db.exception-context — AC12 + C-40's matching half.
// ===========================================================================
test("p657.db.exception-context · a governing open exception keeps the line READABLE with its recovery, while the door still refuses line_excepted and no write-off appears", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const bank = bankAcct.A1.primary;
  const entry = await plainEntry(sub, { client, debit: BANKCOA1, credit: REVN, cents: 61_000, memo: "p657 excepted candidate" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: bank, periodStart: "2026-12-01", periodEnd: "2026-12-31", opening: 0,
    specs: [{ amountCents: 61_000, entryDate: "2026-12-04", description: "p657 disputed inbound" }],
  });
  const line = stmt.lines[0];

  await humanQuery(
    sub,
    "select clara.except_bank_line(p_line => $1::uuid, p_kind => $2, p_reason => $3, p_evidence_document => null, p_op_key => $4) as result",
    [line.id, "disputed", "p657: the client says this credit is not theirs", opk("p657-except")],
  );

  // list_unmatched_lines drops it BY DESIGN (0040:4117-4122)…
  const unmatched = (await humanQuery(sub, "select clara.list_unmatched_lines(p_client => $1::uuid) as result", [client])).rows[0].result ?? [];
  assert.equal(unmatched.some((l) => l.line_id === line.id), false,
    "list_unmatched_lines excludes an excepted line by design — which is exactly why AC12 needs the context read");

  // …and the context read is how it STAYS on screen, pending, with its recovery.
  const ctx = await contextOf(sub, line.id);
  assert.ok(ctx, "the excepted line is still readable by id");
  assert.ok(ctx.exception, "the governing exception rides the read");
  assert.equal(ctx.exception.status, "open");
  assert.equal(ctx.exception.kind, "disputed");
  assert.ok(ctx.exception.reason.includes("not theirs"), "the exception's own reason is carried verbatim");

  // The ungranted block's payload, published through the granted wrapper.
  if (ctx.booking_block !== null) {
    assert.equal(ctx.booking_block.reason, "exception_booking_outstanding",
      "the block publishes its own token — a human must not learn two names for one state");
    assert.ok("blocking" in ctx.booking_block, "the VERDICT key is present");
    assert.ok(Array.isArray(ctx.booking_block.bookings), "the bookings array is present");
  }

  // The door still refuses, by name. Nothing here is a bypass.
  const err = await caught(() => matchBankLine(sub, { client, lines: [line.id], entries: [{ entry_id: entry, matched_cents: 61_000 }] }));
  assert.ok(err, "match_bank_line refuses an excepted line");
  assert.equal(err.code, CLR10);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "line_excepted", `the refusal names itself (got ${err.detail})`);

  // NO suspense, NO write-off, NO adjustment row was invented anywhere.
  const invented = await rootQuery(
    `select
       (select count(*) from clara.bank_matches where client_id = $1 and status in ('pending','live')
          and id in (select match_id from clara.bank_match_line_members where line_id = $2)) as groups,
       (select count(*) from clara.journal_entries where client_id = $1 and memo ilike '%suspense%') as suspense,
       (select count(*) from clara.journal_entries where client_id = $1 and memo ilike '%write%off%') as writeoffs`,
    [client, line.id]);
  assert.equal(Number(invented.rows[0].groups), 0, "no group was opened on the excepted line");
  assert.equal(Number(invented.rows[0].suspense), 0, "no suspense entry was invented");
  assert.equal(Number(invented.rows[0].writeoffs), 0, "no write-off entry was invented");
});

// ===========================================================================
// p657.db.opkey-parse-free — C33.8.
// ===========================================================================
test("p657.db.opkey-parse-free · the task binding is typed: a key with no colons and a key with colons inside the payload both bind, a foreign task refuses", async (t) => {
  if (skipHere(t)) return;
  const task = randomUUID();
  const other = randomUUID();

  // The helper itself is TOTAL — this is the property the comparison site depends on.
  const probe = await rootQuery(
    `select
       clara._bank_op_key_task($1) as no_colons,
       clara._bank_op_key_task($2) as payload_colons,
       clara._bank_op_key_task($3) as not_a_uuid,
       clara._bank_op_key_task(null) as null_key,
       clara._bank_op_key_task('') as empty_key`,
    ["bank-match_bank_line", `bank-match_bank_line:${task}:seg:{"a":"x:y:z"}`, "bank-verb:not-a-uuid:seg"]);
  const p = probe.rows[0];
  assert.equal(p.no_colons, null, "a key with no colons yields NULL, never a 22P02");
  assert.equal(p.payload_colons, task, "colons INSIDE the payload do not disturb field 2");
  assert.equal(p.not_a_uuid, null, "a non-uuid field 2 yields NULL");
  assert.equal(p.null_key, null, "STRICT: a null key is a null answer");
  assert.equal(p.empty_key, null, "an empty key yields NULL");

  // THE POST-0226 ROW SHAPE: wake_task_id STORED, and an op_key whose field 2 is NOT a uuid —
  // so this row can bind ONLY through the stored column. That is the point of storing it.
  //
  // MEASURED CONSTRAINT, and why this is a labelled fixture INSERT rather than a call to
  // `clara._agent_bank_receipt`: that writer derives `acting_actor` from `clara.wake_context()`,
  // which returns ZERO rows without a live wake secret, so a rig session cannot call it at all
  // (`null value in column "acting_actor" … violates not-null`). The writer's own storing of the
  // column is asserted from its source in p657.db.digest-census and exercised for real by
  // `packages/runtime/tests/g1-wake-bank-e2e.test.mjs` under a REAL bank_agent credential.
  const firm = await firmOf(world.clients.A1);
  const digest = `p657-digest-${randomUUID()}`;
  const packKey = `bank-get_bank_pack:not-a-uuid:seg:{"k":"v:w"}`;
  await rootQuery(
    `insert into clara.bank_agent_receipts(firm_id, client_id, act_kind, outcome, acting_actor,
        via_wake_kind, wake_task_id, model_snapshot, rationale, inputs_digest, gate_verdicts,
        approval_arm, op_key, subject_id)
     values ($1::uuid, $2::uuid, 'pack_read', 'admitted', $3::uuid, 'bank_agent', $4::uuid,
        '{"provider":"p657","model":"rig","version":"1"}'::jsonb, 'p657 rig', $5,
        '{"verdict":"admitted"}'::jsonb, 'agent_unattended', $6, $7::uuid)`,
    [firm, world.clients.A1, world.users.alice, task, digest, packKey, bankAcct.A1.primary]);
  assert.equal(
    (await rootQuery("select clara._bank_op_key_task($1) as t", [packKey])).rows[0].t, null,
    "this row's op_key carries NO uuid in field 2 — so binding it can only come from the stored column");

  // The verifier binds on the typed task…
  await rootQuery("select clara._agent_verify_inputs_digest($1::uuid, $2, $3::uuid)", [world.clients.A1, digest, task]);
  // …and refuses a digest read in a DIFFERENT task, by its own unchanged token.
  const err = await caught(() => rootQuery("select clara._agent_verify_inputs_digest($1::uuid, $2, $3::uuid)", [world.clients.A1, digest, other]));
  assert.ok(err, "a digest from another task is refused");
  assert.equal(err.code, CLR10);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "inputs_digest_unverified", "the refusal token is 0129's, unchanged");

  // A PRE-0226 row — wake_task_id NULL — still binds through the key fallback.
  const legacyDigest = `p657-legacy-${randomUUID()}`;
  const legacyTask = randomUUID();
  const legacyKey = `bank-get_bank_pack:${legacyTask}:seg:{}`;
  // LABELLED FIXTURE DML: a row shaped exactly like one written before 0226 (the column is
  // append-only, 0121:4407-4410, so this is the only lawful way to produce that shape).
  await rootQuery(
    `insert into clara.bank_agent_receipts(firm_id, client_id, act_kind, outcome, acting_actor,
        via_wake_kind, wake_task_id, model_snapshot, rationale, inputs_digest, gate_verdicts,
        approval_arm, op_key, subject_id)
     values ($1::uuid, $2::uuid, 'pack_read', 'admitted', $3::uuid, 'bank_agent', null,
        '{"provider":"p657","model":"legacy","version":"1"}'::jsonb, 'p657 legacy', $4,
        '{"verdict":"admitted"}'::jsonb, 'agent_unattended', $5, $6::uuid)`,
    [firm, world.clients.A1, world.users.alice, legacyDigest, legacyKey, bankAcct.A1.primary]);
  await rootQuery("select clara._agent_verify_inputs_digest($1::uuid, $2, $3::uuid)", [world.clients.A1, legacyDigest, legacyTask]);
  // and the null-task arm keeps 0129's exact semantics (deliberately NOT tightened).
  await rootQuery("select clara._agent_verify_inputs_digest($1::uuid, $2, null::uuid)", [world.clients.A1, legacyDigest]);
});

// ===========================================================================
// p657.db.digest-census — C33.7's re-census.
// ===========================================================================
test("p657.db.digest-census · exactly the thirteen rostered cores call the verifier, all at #657's post-image, with no split_part at the comparison site", async (t) => {
  if (skipHere(t)) return;
  const verifier = await prosrcOf("clara._agent_verify_inputs_digest(uuid,text,uuid)");
  assert.ok(verifier, "the 3-arg (uuid,text,uuid) verifier exists");
  assert.equal(verifier.includes("split_part"), false, "no split_part survives in the verifier");
  assert.ok(verifier.includes("coalesce(r.wake_task_id, clara._bank_op_key_task(r.op_key)) = p_task"),
    "the comparison reads the STORED column first and falls back to the key");
  const writer = await prosrcOf("clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)");
  assert.ok(writer.includes("inputs_digest, gate_verdicts, approval_arm, op_key, wake_task_id)"),
    "the sole writer of bank_agent_receipts now names wake_task_id in its INSERT column list");
  assert.ok(writer.includes("coalesce(clara._wake_task_id(), clara._bank_op_key_task(p_op_key)))"),
    "…and values it from the live wake task, falling back to the key");
  assert.ok(writer.includes("on conflict (firm_id, op_key) do nothing"),
    "…without losing the append-only ON CONFLICT arm the replay law depends on");
  const gone = await rootQuery("select to_regprocedure('clara._agent_verify_inputs_digest(uuid,text,text)') as o");
  assert.equal(gone.rows[0].o, null, "the pre-0226 (uuid,text,text) arity is GONE, not shadowed");

  const census = await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and p.prosrc like '%clara._agent_verify_inputs_digest(%'
      order by p.proname`);
  const callers = census.rows.map((r) => r.proname);
  assert.equal(callers.length, 13,
    `exactly the thirteen rostered cores call the verifier (got ${callers.length}: ${callers.join(", ")})`);

  for (const sig of THIRTEEN) {
    const src = await prosrcOf(sig);
    assert.ok(src, `${sig} resolves at its exact pinned signature`);
    const hits = src.split("clara._agent_verify_inputs_digest(").length - 1;
    assert.equal(hits, 1, `${sig} calls the verifier exactly once`);
    assert.ok(src.includes("coalesce(clara._wake_task_id(), clara._bank_op_key_task(p_op_key))); -- H2, C2, #657"),
      `${sig} carries #657's POST-IMAGE call — a future bank-family pin must measure against this, never 0129's`);
    assert.equal(src.includes("p_inputs_digest, p_op_key); -- H2, C2"), false,
      `${sig} still carries 0129's pre-image call`);
  }
});

// ===========================================================================
// p657.db.acl — the wall.
// ===========================================================================
test("p657.db.acl · the new read is clara_authenticated-only, the two helpers hold zero grants, and every recut body keeps owner / definer / search_path / ACL", async (t) => {
  if (skipHere(t)) return;

  // Catalog: who may EXECUTE the new read.
  assert.equal(await roleCanExecute("clara_authenticated", CONTEXT_FN), true, "clara_authenticated may execute the new read");
  for (const role of ["clara_runtime", "clara_agent_ro", "clara_wake_interactive", "clara_wake_bank"]) {
    const present = await rootQuery("select 1 from pg_roles where rolname = $1", [role]);
    if (present.rowCount === 0) continue;
    assert.equal(await roleCanExecute(role, CONTEXT_FN), false, `${role} may NOT execute the new read`);
  }
  for (const fn of ["clara._wdb_line_booking_block(uuid,uuid,uuid)", "clara._bank_op_key_task(text)", "clara._agent_verify_inputs_digest(uuid,text,uuid)"]) {
    const acl = await rootQuery(
      `select count(*)::int n from aclexplode(
         (select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p where p.oid = $1::regprocedure)) a
        where a.grantee <> 0 and a.grantee <> 'clara_fn_owner'::regrole`, [fn]);
    assert.equal(acl.rows[0].n, 0, `${fn} holds ZERO non-owner grants`);
  }

  // A VIEWER meets an honest CLR04 refusal, not an empty answer — /bank floors at bookkeeper
  // while lib/navigation/tree.ts:379 lets a viewer reach the route.
  {
    // carol is firm A's VIEWER (buildWorld: addMember role "viewer").
    const err = await caught(() => contextOf(world.users.carol, randomUUID()));
    assert.ok(err, "a viewer is REFUSED, not silently given null");
    assert.equal(err.code, "CLR04", `the viewer refusal is the house insufficient-role code (got ${err.code})`);
  }

  // Every recut body: owner, SECURITY DEFINER, pinned search_path.
  for (const sig of [
    CONTEXT_READ,
    "clara.list_bank_match_candidates(uuid,uuid)",
    "clara._agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)",
    "clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)",
    "clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)",
    "clara._agent_verify_inputs_digest(uuid,text,uuid)",
  ]) {
    const r = await rootQuery(
      "select pg_get_userbyid(p.proowner) owner, p.prosecdef, p.proconfig from pg_proc p where p.oid = $1::regprocedure", [sig]);
    assert.equal(r.rows[0].owner, "clara_fn_owner", `${sig} is owned by clara_fn_owner`);
    assert.equal(r.rows[0].prosecdef, true, `${sig} is SECURITY DEFINER`);
    assert.ok((r.rows[0].proconfig ?? []).includes("search_path=clara, pg_temp"), `${sig} pins its search_path`);
  }

  // The public door is byte-unmoved — this slice recuts the CORE, never the door, so
  // wake_fn_allowlist / assert_wake_allowed / the clara_wake_interactive grant are untouched.
  const door = await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') sha, p.proacl::text acl from pg_proc p where p.oid = 'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure");
  assert.equal(door.rows[0].sha, "308b7f083f9d27252fb24a65c77dd3aa42e3090e310344fba326bb3e31edc42b",
    "clara.match_bank_line/6 is byte-identical to its pre-0226 body");
  assert.equal(door.rows[0].acl, "{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}",
    "clara.match_bank_line/6 keeps its exact ACL");

  // The three lock-order literals survive the CoR, in order (x38.aa's law, from this side).
  const core = await prosrcOf("clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)");
  const i = core.indexOf("order by je.id for update");
  const j = core.indexOf("pg_advisory_xact_lock(203005004");
  const k = core.indexOf("order by l.id for update");
  assert.ok(i >= 0 && j > i && k > j, `the three lock-order literals are present and in order (je=${i}, advisory=${j}, lines=${k})`);

  // Every name this slice installs or recuts resolves to exactly ONE pg_proc row.
  for (const name of ["get_bank_line_matching_context", "_bank_op_key_task", "_agent_verify_inputs_digest",
    "list_bank_match_candidates", "_agent_get_bank_pack_core", "_match_bank_line_core", "_agent_bank_receipt"]) {
    const n = await rootQuery(
      "select count(*)::int n from pg_proc p where p.pronamespace = 'clara'::regnamespace and p.proname = $1", [name]);
    assert.equal(n.rows[0].n, 1, `clara.${name} resolves to exactly ONE body — a defaulted parameter would be a NEW VERB`);
  }
});
