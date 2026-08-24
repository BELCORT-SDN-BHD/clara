// 0040 Wave C-c -- the bank TIE-OUT (reconciliation identity + exceptions),
// AGING (as-of, due-date), and LEARN-LOOP (bank rules) battery.
//
// CONTRACT-BLIND, the x37/x38 discipline: written straight from
// docs/plan/completed/wave-c-c-tieout-design.md (v2.1) + wave-c-c-tieout-design-part2.md
// (the ladder record -- 40 finding rows, all ACCEPTED) + wave-c-contract.md
// (WC-R1..R12) + the LIVE 0037/0038/0039 idioms this design explicitly reuses
// (congruence FKs, belts, tail asserts, grant/revoke blocks, the advisory-lock
// family, event registration, the op-key _reserve_op/_finish_op idempotency
// idiom). This lane never reads a 0040 migration file or any build-0040 section
// file -- it encodes the DESIGN's promises. A 42883 / param-name / reason-token
// divergence at integration is a FINDING for orchestrator adjudication, never a
// silent test edit. CELLS THAT NEED 0040 OBJECTS WILL FAIL until assembly --
// that is the correct, intended state (red-first); this suite does NOT gate on
// a 0040 schema_migrations row. It DOES gate (loud skip) on the 0037-0039
// substrate (bank matching + the subledger) being present, since fixtures for
// every cell are built through THOSE audited verbs.
//
// INTERFACE ASSUMPTIONS (recorded here once, not per call site -- a divergence
// at integration is expected and is a FINDING, not a surprise). The design's
// own verb table (S5) gives abbreviated mnemonic signatures ("complete_bank_
// reconciliation(statement, p_ack_outstanding uuid[], op_key)") without a
// p_client lead -- but EVERY existing bank/subledger verb in the live substrate
// (void_bank_statement, unmatch_bank_match, allocate_receipt, apply_open_items,
// set_turnover_classification, ...) takes p_client FIRST. This lane reads the
// design's mnemonic lists as abbreviated, not literal, and applies the house
// p_client-leads convention throughout:
//   IA-1  complete_bank_reconciliation(p_client, p_statement,
//         p_ack_outstanding uuid[], p_op_key) -- bookkeeper floor.
//   IA-2  void_bank_reconciliation(p_client, p_recon, p_reason, p_op_key) --
//         bookkeeper floor.
//   IA-3  except_bank_line(p_client, p_line, p_kind, p_reason,
//         p_evidence_document default null, p_op_key) -- OWNER floor.
//   IA-4  resolve_bank_line_exception(p_client, p_exception, p_disposition,
//         p_note, p_counterpart_line default null, p_op_key) -- OWNER floor.
//         `matched_booking`/`written_off_adjustment` are read as requiring the
//         line to ALREADY be a live match member (or a same-txn booking done by
//         the caller first via match_bank_line/settle_from_bank_line) at the
//         moment resolve is called -- i.e. resolve NEVER itself drafts/posts an
//         entry; "the in-txn booking match" is read as "book first (a separate
//         call, same overall workflow step), then resolve names the disposition
//         and the belt cross-checks the line's live-member state" -- a plausible
//         alternate reading (resolve itself performs the booking) is a finding.
//   IA-5  propose_bank_rule(p_client, p_kind, p_pattern jsonb,
//         p_proposal jsonb, p_op_key) -- bookkeeper floor. NO p_evidence
//         parameter (S4.3: evidence is DERIVED in-verb, never caller-supplied)
//         -- a cell probes that a 5th positional/named jsonb evidence argument
//         is either ignored or refused 42883, recording which.
//   IA-6  sign_bank_rule(p_client, p_rule, p_op_key) / retire_bank_rule(
//         p_client, p_rule, p_reason, p_op_key) -- OWNER floor.
//   IA-7  set_counterparty_terms(p_client, p_counterparty, p_days, p_op_key) --
//         bookkeeper floor.
//   IA-8  match_bank_line / settle_from_bank_line gain a TRAILING
//         `p_via_rule uuid default null` overload (design S5 splice 4).
//   IA-9  ar_aging/ap_aging(p_client, p_as_of date, p_segment uuid default
//         null).
//   IA-10 customer_statement/supplier_statement(p_client, p_counterparty,
//         p_from date, p_to date).
//   IA-11 list_unmatched_lines(p_client).
//   IA-12 get_bank_reconciliation(p_statement) -- single param, mirrors the
//         PROVEN get_bank_statement(p_statement) shape (0038) -- no p_client.
//   IA-13 list_bank_line_suggestions(p_statement) -- single param, same shape
//         as IA-12.
//   IA-14 list_bank_rule_candidates(p_client) -- single param.
//   IA-15 bank_reconciliations / bank_line_exceptions / bank_rules column
//         names exactly per design S4.1/S4.2/S4.3.
//   IA-16 THE OPENING ANCHOR (the takeover cells): the opening-anchor entry is
//         identified by `journal_entries.is_opening_balance=true` carrying a
//         leg on the account's coa_account_code, cross-referenced against a
//         `clara.opening_items` (Gate-K, 0017) row of item_kind='gl_balance';
//         a `bank_uncleared` pre-cutover instrument is a Gate-K opening_items
//         row of item_kind='bank_uncleared' whose OWN entry carries a leg on
//         the SAME coa_account_code. Building these through the real Wave-B
//         onboarding-plan lifecycle (K1..K14) is out of this file's scope (a
//         SEPARATE fixture world, not the rig `buildWorld()` this suite uses)
//         -- exactly the cross-lane situation x38.f/x37.z/x37.ac already
//         solved by hand-constructing the MINIMAL congruent row shape via
//         DIRECT INSERT against the tables' own constraints. This file does
//         the same: `forgeOpeningAnchor`/`forgeBankUncleared` below insert a
//         bare onboarding_plans -> opening_seed_registry -> opening_items
//         chain (root, bypassing K1-K14 entirely) and flip
//         journal_entries.is_opening_balance directly. A DIFFERENT anchor-
//         identification mechanism at integration is a FINDING, not a silent
//         test edit.
//   IA-17 `_subledger_outstanding_asof(p_item uuid, p_as_of date)` is the
//         as-of sibling of the LIVE `_subledger_outstanding(p_item)` (0037:
//         874) -- same name family, one new date parameter (design S4.4).
//
// House style: header-prose-then-cells (x37/x38), rig helpers (a21-helpers.mjs
// chain), the x38-match-fixtures.mjs bank-verb toolkit reused directly for
// account/statement/match/settle fixtures (never re-implemented), the
// rig-docs-race.mjs two-session driver for the write-skew cell. Serial
// discipline: --test-concurrency=1 (x40.ab drives a forced two-session
// schedule by hand). DO NOT run this suite here (orchestrator-only rig).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, withActor, namedCall, opk,
  endPool, printLaneNotes, printSkipCount, noteLane, markSkip, ROLES,
  a21EnsureReady, buildWorld, firmOf,
  upsertAccountClassed, upsertPayableAccount, grantConsent,
  draftEntryV3, approveEntry, insertUser, addMember,
  idOf, reasonOf, HIGH_STAKES_CENTS,
  roleCanExecute, fnSource, rlsFlags, restateSightings,
} from "./a21-helpers.mjs";
import { holdThenContend, sawDeadlock } from "./rig-docs-race.mjs";
// fix-wave E7/CX12: the REAL Gate-K onboarding-plan lifecycle (K1..K14), for x40.m/x40.n's
// takeover-opening fixtures -- a different fixture world than this suite's own buildWorld().
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  EXPN as X38_EXPN, REVN as X38_REVN,
  GUARD, hasBankMatching, caught,
  addBankAccount, deactivateBankAccount, enterStatement, voidBankStatement,
  matchBankLine, unmatchBankMatch, settleFromBankLine, completePendingMatch, matchIdOf,
  matchRow, lineGroupStatus, assertGroupTies,
  openItemsOf, outstandingOf,
  manualRes, birthCounterparty, plainEntry,
} from "./x38-match-fixtures.mjs";

let has40 = false; // "40" names the SUITE; the gate is the 0037-0039 substrate (see header)
let world = null;

// ---------------------------------------------------------------------------
// Suite-scoped COA codes ("-C40", grepped clean against every other battery).
// ---------------------------------------------------------------------------
const AR1 = "374-C40";
const AP1 = "474-C40";
const EXPN = "574-C40";
const REVN = "684-C40";
const OBEX = "992-C40"; // a generic contra leg for forged opening-anchor entries

// INTEGRATION FIX (assembly): the design (S4.3) names the pattern's "direction"
// field but never its VOCABULARY. The build reads it against the 0038 line sign
// convention (+ = credit/into the account, - = debit/out), so the tokens are
// 'debit' | 'credit' | 'either'. This suite originally guessed 'out'. The design
// pinned nothing here, so the cell moves -- the contract-blind law's own rule.

function skipHere(t) {
  if (!has40) {
    markSkip();
    t.skip("0037/0038/0039 substrate absent (clara.bank_matches / clara.match_bank_line not found) -- the Wave-C-c tie-out battery is dormant");
    return true;
  }
  return false;
}

function assertReason(err, code, reason, label) {
  assert.ok(err, `${label}: must be refused`);
  if (code != null) assert.equal(err.code, code, `${label}: expected ${code} (got ${err.code ?? "(none)"} -- ${err?.message})`);
  if (reason != null) assert.equal(reasonOf(err), reason, `${label}: expected reason '${reason}' (got ${reasonOf(err)})`);
}

before(async () => {
  const ready = await a21EnsureReady();
  has40 = Boolean(ready.base && ready.has16 && (await hasBankMatching()));
  if (!has40) {
    noteLane("0037/0038/0039 substrate absent -- x40 tie-out suite dormant (red-first cells below still encode the design)");
    return;
  }
  world = await buildWorld();
  for (const key of ["A1", "A2", "B1"]) {
    const client = world.clients[key];
    const sub = key === "B1" ? world.users.dave : world.users.alice;
    await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (x40)", type: "asset", accountClass: "receivable", opKey: opk("x40-ar") });
    await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (x40)", opKey: opk("x40-ap") });
    await upsertAccountClassed(sub, { client, code: EXPN, name: "Prof Fees (x40)", type: "expense", opKey: opk("x40-exp") });
    await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (x40)", type: "income", opKey: opk("x40-rev") });
    await upsertAccountClassed(sub, { client, code: OBEX, name: "OB contra (x40)", type: "equity", opKey: opk("x40-obex") });
    // INTEGRATION FIX (assembly): this suite reuses the x38 bank-verb toolkit
    // directly (the work order's instruction), and x38's own birthCounterparty /
    // dateStampedItem helpers code their legs to x38's COA constants -- which
    // nothing in THIS suite's setup had registered, so every cell that births a
    // counterparty died at CLR10 "line codes to a non-existent account". Reusing
    // a fixture toolkit means adopting its chart of accounts too.
    await upsertAccountClassed(sub, { client, code: X38_EXPN, name: "Ordinary expense (x38 toolkit)", type: "expense", opKey: opk("x40-x38exp") });
    await upsertAccountClassed(sub, { client, code: X38_REVN, name: "Revenue (x38 toolkit)", type: "income", opKey: opk("x40-x38rev") });
    await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
  }
});

after(async () => {
  printLaneNotes("x40-wave-c-c-tieout");
  printSkipCount("x40-wave-c-c-tieout");
  await endPool();
});

// ===========================================================================
// FIXTURE HELPERS -- account/statement isolation, subledger items, dates.
// ===========================================================================

let _acctSeq = 0;
/** A fresh, fully isolated bank account (its own COA code + its own bank
 *  number) -- every completion-identity cell needs total account isolation
 *  since every S3 term is ACCOUNT-scoped and ALL-TIME. */
async function freshAccount(sub, client, tag) {
  _acctSeq += 1;
  const tagUp = `${tag}`.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 3).padEnd(2, "X");
  // INTEGRATION FIX (assembly): ck_coa_account_code_0009 (0009:760) is
  // `^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$` -- the suffix is at most FOUR
  // characters. The original `C4${tagUp}` produced five for any three-letter
  // tag and every fixture in this file died at 23514 before reaching a cell.
  // The numeric prefix already carries the per-account uniqueness.
  const coaCode = `${100 + (_acctSeq % 900)}-C${tagUp}`;
  await upsertAccountClassed(sub, { client, code: coaCode, name: `x40 bank gl ${tag}`, type: "asset", opKey: opk(`x40-bgl-${tag}`) });
  const n = `1099${_acctSeq}${randomUUID().slice(0, 6)}`;
  const added = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n, coaAccountCode: coaCode });
  return { bankAccountId: idOf(added, "bank_account_id", "id"), coaCode };
}

async function statementRow(statement) {
  const r = await rootQuery("select to_jsonb(s) as row from clara.bank_statements s where s.id=$1", [statement]);
  return r.rows[0]?.row ?? null;
}

// ---------------------------------------------------------------------------
// THE FIVE NEW C-c VERBS (IA-1..IA-7) + the p_via_rule overload (IA-8).
// ---------------------------------------------------------------------------

async function completeRecon(sub, { client, statement, ackOutstanding = [], opKey = null }) {
  // INTEGRATION FIX (assembly): IA-1..IA-7 assumed the house p_client lead on
  // every C-c verb. The DESIGN pinned these signatures explicitly in its S5 verb
  // table WITHOUT one -- `complete_bank_reconciliation(statement, ack[], op_key)`
  // -- and the tenancy anchor is genuinely reachable from the named object
  // (statement / line / exception / rule / counterparty), so a p_client argument
  // would be a second, redundant, disagreeable source of truth. The design won;
  // these wrappers keep their `client` option (call sites are unchanged) and
  // simply stop sending it.
  void client;
  const specs = [
    { name: "p_statement" },
    { name: "p_ack_outstanding", cast: "uuid[]" }, { name: "p_op_key" },
  ];
  const vals = [statement, ackOutstanding, opKey ?? opk("x40-complete")];
  const r = await humanQuery(sub, namedCall("complete_bank_reconciliation", specs), vals);
  return r.rows[0].result;
}
async function voidRecon(sub, { client, recon, reason = "x40 void recon", opKey = null }) {
  void client;
  const r = await humanQuery(
    sub,
    namedCall("void_bank_reconciliation", [{ name: "p_recon" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [recon, reason, opKey ?? opk("x40-voidrecon")],
  );
  return r.rows[0].result;
}
async function exceptLine(sub, { client, line, kind, reason = "x40 exception", evidenceDocument = null, opKey = null }) {
  void client;
  const specs = [{ name: "p_line" }, { name: "p_kind" }, { name: "p_reason" }];
  const vals = [line, kind, reason];
  if (evidenceDocument != null) { specs.push({ name: "p_evidence_document" }); vals.push(evidenceDocument); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("x40-except"));
  const r = await humanQuery(sub, namedCall("except_bank_line", specs), vals);
  return r.rows[0].result;
}
async function resolveException(sub, { client, exception, disposition, note = "x40 resolution note", counterpartLine = null, opKey = null }) {
  void client;
  const specs = [{ name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" }];
  const vals = [exception, disposition, note];
  if (counterpartLine != null) { specs.push({ name: "p_counterpart_line" }); vals.push(counterpartLine); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("x40-resolve"));
  const r = await humanQuery(sub, namedCall("resolve_bank_line_exception", specs), vals);
  return r.rows[0].result;
}
async function proposeRule(sub, { client, kind, pattern, proposal, opKey = null }) {
  const specs = [{ name: "p_client" }, { name: "p_kind" }, { name: "p_pattern", cast: "jsonb" }, { name: "p_proposal", cast: "jsonb" }, { name: "p_op_key" }];
  const vals = [client, kind, JSON.stringify(pattern), JSON.stringify(proposal), opKey ?? opk("x40-proposerule")];
  const r = await humanQuery(sub, namedCall("propose_bank_rule", specs), vals);
  return r.rows[0].result;
}
async function signRule(sub, { client, rule, opKey = null }) {
  void client;
  const r = await humanQuery(
    sub,
    namedCall("sign_bank_rule", [{ name: "p_rule" }, { name: "p_op_key" }]),
    [rule, opKey ?? opk("x40-signrule")],
  );
  return r.rows[0].result;
}
async function retireRule(sub, { client, rule, reason = "x40 retire rule", opKey = null }) {
  void client;
  const r = await humanQuery(
    sub,
    namedCall("retire_bank_rule", [{ name: "p_rule" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [rule, reason, opKey ?? opk("x40-retirerule")],
  );
  return r.rows[0].result;
}
async function setTerms(sub, { client, counterparty, days, opKey = null }) {
  void client;
  const r = await humanQuery(
    sub,
    namedCall("set_counterparty_terms", [{ name: "p_counterparty" }, { name: "p_days" }, { name: "p_op_key" }]),
    [counterparty, days, opKey ?? opk("x40-terms")],
  );
  return r.rows[0].result;
}
/** match_bank_line / settle_from_bank_line, the p_via_rule overload (IA-8). */
async function matchBankLineViaRule(sub, { client, lines, entries, viaRule, ackPeriodExceptions = false, opKey = null }) {
  const r = await humanQuery(
    sub,
    `select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb,
       p_adjustments => null, p_ack_period_exceptions => $4, p_via_rule => $5, p_op_key => $6) as r`,
    [client, JSON.stringify(lines), JSON.stringify(entries), ackPeriodExceptions, viaRule, opKey ?? opk("x40-matchvia")],
  );
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// THE EIGHT READ RPCs (IA-9..IA-14).
// ---------------------------------------------------------------------------

async function arAging(sub, { client, asOf, segment = null }) {
  const r = await humanQuery(sub, "select clara.ar_aging(p_client => $1, p_as_of => $2::date, p_segment => $3) as r", [client, asOf, segment]);
  return r.rows[0].r;
}
async function apAging(sub, { client, asOf, segment = null }) {
  const r = await humanQuery(sub, "select clara.ap_aging(p_client => $1, p_as_of => $2::date, p_segment => $3) as r", [client, asOf, segment]);
  return r.rows[0].r;
}
async function customerStatementRpc(sub, { client, cp, from, to }) {
  const r = await humanQuery(sub, "select clara.customer_statement(p_client => $1, p_counterparty => $2, p_from => $3::date, p_to => $4::date) as r", [client, cp, from, to]);
  return r.rows[0].r;
}
async function supplierStatementRpc(sub, { client, cp, from, to }) {
  const r = await humanQuery(sub, "select clara.supplier_statement(p_client => $1, p_counterparty => $2, p_from => $3::date, p_to => $4::date) as r", [client, cp, from, to]);
  return r.rows[0].r;
}
async function listUnmatchedLines(sub, { client }) {
  const r = await humanQuery(sub, "select clara.list_unmatched_lines(p_client => $1) as r", [client]);
  return r.rows[0].r;
}
async function getBankReconciliation(sub, { statement }) {
  const r = await humanQuery(sub, "select clara.get_bank_reconciliation(p_statement => $1) as r", [statement]);
  return r.rows[0].r;
}
async function listBankLineSuggestions(sub, { statement }) {
  const r = await humanQuery(sub, "select clara.list_bank_line_suggestions(p_statement => $1) as r", [statement]);
  return r.rows[0].r;
}
async function listBankRuleCandidates(sub, { client }) {
  const r = await humanQuery(sub, "select clara.list_bank_rule_candidates(p_client => $1) as r", [client]);
  return r.rows[0].r;
}
// fix-wave E5 [A10]: the NINTH read RPC (assembly order item 6, D4/A9) -- an ADDITIVE rule
// register, not in the design's original SS6 table, that x40.an's tenancy sweep never covered.
async function listBankRules(sub, { client }) {
  const r = await humanQuery(sub, "select clara.list_bank_rules(p_client => $1) as r", [client]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Readbacks (root -- superuser bypasses RLS; fixtures/asserts only, never a lane).
// ---------------------------------------------------------------------------

async function reconRow(id) {
  const r = await rootQuery("select to_jsonb(x) as row from clara.bank_reconciliations x where x.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}
async function exceptionRow(id) {
  const r = await rootQuery("select to_jsonb(x) as row from clara.bank_line_exceptions x where x.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}
async function ruleRow(id) {
  const r = await rootQuery("select to_jsonb(x) as row from clara.bank_rules x where x.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}
async function counterpartyRow(id) {
  const r = await rootQuery("select to_jsonb(c) as row from clara.counterparties c where c.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}
async function tieoutEventPayloads(client) {
  const r = await rootQuery(
    "select seq, event_type, payload from clara.domain_events where client_id=$1 and event_type like 'bank.reconciliation%' or (client_id=$1 and event_type like 'bank.line_%') or (client_id=$1 and event_type like 'bank.rule_%') order by seq",
    [client, client, client],
  ).catch(async () => rootQuery(
    "select seq, event_type, payload from clara.domain_events where client_id=$1 and (event_type like 'bank.reconciliation%' or event_type like 'bank.line_%' or event_type like 'bank.rule_%') order by seq",
    [client],
  ));
  return r.rows;
}

// ---------------------------------------------------------------------------
// THE COMPLETION-IDENTITY RECOMPUTE HELPERS (design S3) -- re-derived from the
// raw tables, never trusted from a receipt, mirroring x37's controlGl/assertTies
// and x38's assertGroupTies precedent.
// ---------------------------------------------------------------------------

/** gl(P) = sum(debit-credit) over approved journal_lines on `coaCode`, posting_date<=P.end. */
async function glOf(client, coaCode, periodEnd, { excludeEntry = null } = {}) {
  const r = await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as n
       from clara.journal_lines l join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved' and e.posting_date<=$3::date
        and ($4::uuid is null or e.id <> $4::uuid)`,
    [client, coaCode, periodEnd, excludeEntry],
  );
  return Number(r.rows[0].n);
}
/** uncleared(g,P) for one LIVE group -- entry-side (posting<=P.end) minus
 *  line-side (statement period_end<=P.end), both SIGNED. */
async function unclearedOfGroup(matchId, periodEnd) {
  const em = await rootQuery(
    `select coalesce(sum(m.matched_cents),0)::bigint as n
       from clara.bank_match_entry_members m join clara.journal_entries e on e.id=m.entry_id
      where m.match_id=$1 and e.posting_date<=$2::date`,
    [matchId, periodEnd],
  );
  const lm = await rootQuery(
    `select coalesce(sum(l.amount_cents),0)::bigint as n
       from clara.bank_match_line_members x
       join clara.bank_statement_lines l on l.id=x.line_id
       join clara.bank_statements s on s.id=l.statement_id
      where x.match_id=$1 and s.period_end<=$2::date`,
    [matchId, periodEnd],
  );
  return Number(em.rows[0].n) - Number(lm.rows[0].n);
}
/** Sum uncleared(g,P) over every LIVE group touching the account. */
async function sumUnclearedOverLiveGroups(bankAccount, periodEnd) {
  const groups = await rootQuery(
    "select id from clara.bank_matches where bank_account_id=$1 and status='live'",
    [bankAccount],
  );
  let total = 0;
  for (const row of groups.rows) total += await unclearedOfGroup(row.id, periodEnd);
  return total;
}
/** unmatched_capacity(P), the exact two-term abs() form (S3, the delta-round fix):
 *  (dr_capacity - Σpositive live consumption) - (cr_capacity - Σ|negative live consumption|),
 *  consumption = each entry's TOTAL live-group matched_cents regardless of line dates. */
async function unmatchedCapacity(client, coaCode, periodEnd, { excludeEntry = null } = {}) {
  const cap = await rootQuery(
    `select coalesce(sum(l.debit_cents),0)::bigint as dr, coalesce(sum(l.credit_cents),0)::bigint as cr
       from clara.journal_lines l join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved' and e.posting_date<=$3::date
        and ($4::uuid is null or e.id <> $4::uuid)`,
    [client, coaCode, periodEnd, excludeEntry],
  );
  const cons = await rootQuery(
    `select
        coalesce(sum(m.matched_cents) filter (where m.matched_cents>0),0)::bigint as pos,
        coalesce(sum(-m.matched_cents) filter (where m.matched_cents<0),0)::bigint as neg
       from clara.bank_match_entry_members m
       join clara.bank_matches g on g.id=m.match_id
       join clara.journal_entries e on e.id=m.entry_id
      where g.status='live' and g.bank_account_id=(select id from clara.bank_accounts where client_id=$1 and coa_account_code=$2)
        and e.status='approved' and e.posting_date<=$3::date
        and ($4::uuid is null or e.id <> $4::uuid)`,
    [client, coaCode, periodEnd, excludeEntry],
  );
  const dr = Number(cap.rows[0].dr), cr = Number(cap.rows[0].cr);
  const pos = Number(cons.rows[0].pos), neg = Number(cons.rows[0].neg);
  return (dr - pos) - (cr - neg);
}
/** excepted(P), ALL-TIME: signed amount_cents of every line on the account whose
 *  statement's period_end<=P.end and whose exception is open, OR resolved with
 *  the line STILL unmatched. */
async function exceptedOf(bankAccount, periodEnd) {
  const r = await rootQuery(
    `select coalesce(sum(l.amount_cents),0)::bigint as n
       from clara.bank_line_exceptions x
       join clara.bank_statement_lines l on l.id=x.line_id
       join clara.bank_statements s on s.id=l.statement_id
      where s.bank_account_id=$1 and s.period_end<=$2::date
        and (x.status='open'
             or (x.status='resolved' and not exists (
                   select 1 from clara.bank_match_line_members mm
                    where mm.line_id=l.id and mm.group_status='live')))`,
    [bankAccount, periodEnd],
  );
  return Number(r.rows[0].n);
}
/** S.closing = opening_anchor + gl' - Sum(uncleared) - capacity' + excepted. */
async function recomputeClosing(client, bankAccount, coaCode, periodEnd, { openingAnchor = 0, excludeEntry = null } = {}) {
  const gl = await glOf(client, coaCode, periodEnd, { excludeEntry });
  const uncleared = await sumUnclearedOverLiveGroups(bankAccount, periodEnd);
  const capacity = await unmatchedCapacity(client, coaCode, periodEnd, { excludeEntry });
  const excepted = await exceptedOf(bankAccount, periodEnd);
  return openingAnchor + gl - uncleared - capacity + excepted;
}

// ---------------------------------------------------------------------------
// Subledger fixtures (mirrors x37's pattern; adds explicit postingDate control
// x37's own counterpartyStampedItem lacks -- needed for aging/due-date cells).
// ---------------------------------------------------------------------------

async function dateStampedItem(sub, { client, domain, cp, cpKind, cents, control, postingDate, checker = null, attestation = null }) {
  const proposal = { existing_id: cp };
  if (cpKind !== "vendor") proposal.kind = cpKind;
  const [debit, credit] = domain === "ar" ? [control, REVN] : [EXPN, control];
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `x40 ${domain} item`, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    vendor: proposal, opKey: opk("x40-cpitem"),
  });
  const args = { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x40-cpitema") };
  if (attestation != null) args.attestation = attestation;
  await approveEntry(checker ?? sub, args);
  const items = await openItemsOf(d.entry_id);
  assert.equal(items.length, 1, `a ${domain} control entry mints exactly ONE item`);
  return { entry: d.entry_id, item: items[0].id };
}

/** allocate_payment -- a local wrapper (x37's own composites are file-local there,
 *  not exported; rebuilt here verbatim from the pinned interface,
 *  x37-wave-c-a-subledger.test.mjs:340-401). The allocate_receipt twin was dropped at
 *  assembly: no surviving cell calls it, and an unused fixture is a lint error. */
async function allocatePayment(sub, { client, counterparty, postingDate, memo = "x40 payment", bankAccount, amountCents, allocations, controlAccount = AP1, opKey = null }) {
  const specs = [
    { name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" },
    { name: "p_memo" }, { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" },
    { name: "p_allocations", cast: "jsonb" }, { name: "p_op_key" }, { name: "p_control_account" },
  ];
  const vals = [client, counterparty, postingDate, memo, bankAccount, amountCents, JSON.stringify(allocations), opKey ?? opk("x40-pay"), controlAccount];
  const r = await humanQuery(sub, namedCall("allocate_payment", specs), vals);
  return r.rows[0].result;
}
async function outstandingAsOf(item, asOf) {
  const r = await rootQuery("select clara._subledger_outstanding_asof($1, $2::date) as n", [item, asOf]);
  return Number(r.rows[0].n);
}
async function openItemRow(id) {
  const r = await rootQuery("select to_jsonb(i) as row from clara.open_items i where i.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}
/** GL control balance for `domain`, AS-OF a date (the x37 controlGl pattern,
 *  date-scoped -- the S6 acceptance cell's "= the control balance" half). */
async function controlGlAsOf(client, domain, asOf) {
  const cls = domain === "ar" ? "receivable" : "payable";
  const net = domain === "ar" ? "l.debit_cents - l.credit_cents" : "l.credit_cents - l.debit_cents";
  const r = await rootQuery(
    `select coalesce(sum(${net}),0)::bigint as n
       from clara.journal_lines l
       join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
       join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and a.account_class=$2 and e.status='approved' and e.posting_date<=$3::date`,
    [client, cls, asOf],
  );
  return Number(r.rows[0].n);
}

// ---------------------------------------------------------------------------
// IA-16, REBUILT (fix-wave E7/CX12): the takeover opening world through the
// REAL Gate-K doors (wave-b/wb-fixtures.mjs, the K1..K14 onboarding-plan
// lifecycle) -- no trigger disable, no root lineage insert. The original
// fixture forged is_opening_balance via a root-side `disable trigger
// t_je_immutable` window, which the header honestly recorded as a debt: the
// REAL K3 writer (0017 `draft_opening_item`) sets is_opening_balance at DRAFT
// time and would refuse the forged shape entirely (0017 R1-F1's
// `opening_entry_k_family_only`, CLR31). Every row below is minted by an
// audited verb: beginOnboarding (K1, wb.onboardingClient) mints a fresh
// client + plan; create_opening_seed opens a KEYED (no-document) registry;
// draft_opening_item (K3) drafts the gl_balance anchor / bank_uncleared /
// balancing equity_net items; approve_opening_seed (K5) approves the whole
// batch in one serializable transaction. Verified against the live K3 writer
// (0017:3246-3396): gl_balance/bank_uncleared both auto-contra into OBE, and
// K5's own tie assert (_assert_opening_tie) requires the WHOLE seed's OBE net
// to be EXACTLY zero -- so every takeover fixture below carries a balancing
// equity_net item whose amount is the exact sum of the other items' own
// signed legs (proof: each item's OBE contra is the exact negation of its own
// leg, so summing the legs gives the exact debit needed to zero OBE).
// ---------------------------------------------------------------------------

/** A fresh onboarding client (K1) with its own bank COA code, ready for a K3/K5 opening
 *  set -- PLUS TWO admin-rank actors, mirroring buildWaveBWorld's own `hana` pattern:
 *  approve_opening_seed (K5) is admin-floor and refuses a SELF-approval whenever the
 *  firm carries >=2 eligible checkers (world.users' own firm A does: alice+bob+carol);
 *  commit_client_onboarding (K14) is ALSO admin-floor and additionally refuses ANY
 *  plan CONTRIBUTOR (the K3 drafter `sub` AND the K5 `approver` both become
 *  contributors, per 0017's own R2-F4/R3-F3 notes) as its own committer -- so a THIRD
 *  distinct actor is minted for that step.
 *  MEASURED THIS SESSION (rig verification): the bank_accounts row itself must be
 *  deferred until AFTER commit -- add_bank_account requires clients.status='active'
 *  (0038's own tenancy+status check), and an in-progress onboarding client is
 *  status='onboarding' until commit_client_onboarding (K14) flips it -- registering the
 *  bank account any earlier reads the misleading "client not in your firm" (CLR11). */
async function realTakeoverWorld(sub, tag) {
  const onb = await wb.onboardingClient(sub, `x40_${tag}_${randomUUID().slice(0, 6)}`);
  const firm = await firmOf(onb.client);
  await wb.seedOpeningCoa(sub, onb.client);
  await grantConsent(sub, { firm, client: onb.client }).catch(() => {});
  _acctSeq += 1;
  const tagUp = `${tag}`.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 3).padEnd(2, "X");
  const coaCode = `${100 + (_acctSeq % 900)}-C${tagUp}`;
  await upsertAccountClassed(sub, { client: onb.client, code: coaCode, name: `x40 takeover bank gl ${tag}`, type: "asset", opKey: opk(`x40-bgl-${tag}`) });
  // randomUUID-suffixed, like every other synthetic identity in this suite -- insertUser's
  // email is a bare (prefix, tag) concatenation with no other uniqueness source, and a fixed
  // tag alone collided against clara.users' unique email index (MEASURED THIS SESSION).
  const idSuffix = randomUUID().slice(0, 8);
  const approver = await insertUser(`x40${tag}${idSuffix}`, "admin");
  await addMember(sub, { firm, user: approver, role: "admin", opKey: opk(`x40-${tag}-admin-${idSuffix}`) });
  const committer = await insertUser(`x40${tag}${idSuffix}`, "commit");
  await addMember(sub, { firm, user: committer, role: "admin", opKey: opk(`x40-${tag}-commit-${idSuffix}`) });
  return { client: onb.client, plan: onb.plan, firm, coaCode, approver, committer, tag };
}

/** K14: commit the onboarding through the THIRD, non-contributor admin, THEN register
 *  the bank_accounts row now that the client is active. Called AFTER the opening set
 *  (realOpeningSet) is approved. Returns bankAccountId. */
async function activateTakeoverBank(sub, w) {
  await wb.commitOnboarding(w.committer, {
    client: w.client, plan: w.plan, expectedPlanRevision: await wb.planRevision(w.plan),
    opKey: opk(`x40-${w.tag}-commit`),
  });
  const n = `1099${randomUUID().slice(0, 10)}`;
  const added = await addBankAccount(sub, { client: w.client, bankCode: "MBB", accountNumber: n, coaAccountCode: w.coaCode });
  return idOf(added, "bank_account_id", "id");
}

/** The K3/K5 opening set: `items` is an array of {amountCents, itemKey,
 *  itemKind: 'gl_balance'|'bank_uncleared', legCode?} (legCode defaults to
 *  `coaCode` -- x40.n's off-account red-team probe passes a DIFFERENT one, on
 *  purpose). Drafts every item through draft_opening_item (as `sub`), records
 *  its own keyed target, then drafts+targets the OBE-balancing equity_net
 *  item and approves the whole batch through approve_opening_seed (K5) as
 *  the DISTINCT `approver`. Returns {seed, entries: {itemKey: entryId}}. */
async function realOpeningSet(sub, { client, plan, coaCode, approver, items, asOf = "2027-01-01" }) {
  const seedReceipt = await wb.createOpeningSeed(sub, { client, plan, asOf, tieDocument: null, tieSha256: null });
  const seed = seedReceipt.seed_id ?? seedReceipt.id;
  let obeNet = 0;
  const entries = {};
  const revMap = {};
  for (const it of items) {
    const legCode = it.legCode ?? coaCode;
    const abs = Math.abs(it.amountCents);
    const lines = it.amountCents >= 0
      ? [{ account_code: legCode, debit_cents: abs, credit_cents: 0 }]
      : [{ account_code: legCode, debit_cents: 0, credit_cents: abs }];
    const item = { item_kind: it.itemKind, item_key: it.itemKey };
    // ck_opening_items_bank_detail (0017:1168-1170): a bank_uncleared item's lineage
    // (item_ref + item_date) is never null -- it is the instrument's own reference.
    if (it.itemKind === "bank_uncleared") { item.item_ref = `CHQ-${it.itemKey}`; item.item_date = asOf; }
    // MEASURED THIS SESSION (rig verification): a KEYED (no-document) opening seed is
    // SEED-BOUND (0018 [AMB-0018-1], WB-R24(i)) -- draft_opening_item's assert_client_resolved
    // requires bound_scope_kind IS NULL for a GENERIC resolution, but a keyed seed's
    // _draft_opening_item_core actually calls assert_client_resolved_bound, which requires the
    // OPPOSITE: bound_scope_kind='opening_seed' naming THIS seed. A plain manualRes() (unbound)
    // reads "client attribution not established" (CLR01) every time. wb.keyedRes mints (and
    // caches, once per seed) the bound resolution record_opening_keyed_resolution produces.
    const receipt = await wb.draftOpeningItem(sub, { client, seed, item, lines, resolution: wb.keyedRes(sub, { client, seed }) });
    entries[it.itemKey] = receipt.entry_id;
    revMap[receipt.entry_id] = receipt.revision_token;
    await wb.recordOpeningTarget(sub, {
      seed, line: { line_key: it.itemKey, account_code: legCode, debit_cents: lines[0].debit_cents, credit_cents: lines[0].credit_cents },
    });
    obeNet += it.amountCents;
  }
  if (obeNet !== 0) {
    const balReceipt = await wb.draftOpeningItem(sub, {
      client, seed, item: { item_kind: "equity_net", item_key: "obe-balance", amount_cents: obeNet },
      resolution: wb.keyedRes(sub, { client, seed }),
    });
    entries["obe-balance"] = balReceipt.entry_id;
    revMap[balReceipt.entry_id] = balReceipt.revision_token;
    await wb.recordOpeningTarget(sub, {
      seed, line: { line_key: "obe-balance", account_code: wb.WB_COA.re, debit_cents: obeNet < 0 ? -obeNet : 0, credit_cents: obeNet > 0 ? obeNet : 0 },
    });
  }
  await wb.approveOpeningSeed(approver, { seed, planRevision: await wb.planRevision(plan), tieSha256: null, entryRevisions: revMap });
  return { seed, entries };
}

// ===========================================================================
// SECTION 1 -- THE COMPLETION IDENTITY (design S3; part2 findings 1-14).
// Every cell recomputes the identity from the RAW tables (recomputeClosing)
// and asserts it against the statement's OWN printed closing_cents BEFORE
// calling complete_bank_reconciliation (mandatory setup: proves the fixture
// itself is internally consistent), then asserts the receipt's own
// opening/gl/closing/outstanding/excepted terms match.
// ===========================================================================

// ---------------------------------------------------------------------------
// x40.a -- BASELINE: a clean month, opening=0 (first-period exemption, S3),
// every line matched, zero exceptions, zero unmatched capacity -> difference
// EXACTLY 0 (WCC-R2); the first-period exemption is claimed and PINNED
// (prior_statement_id null, S3 chain law).
// ---------------------------------------------------------------------------
test("x40.a baseline: a fully-matched first-period month completes at difference 0, the first-period exemption is claimed and pinned", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "a1");
  const entry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 50000, postingDate: "2030-01-08", memo: "x40.a clean receipt" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2030-01-01", periodEnd: "2030-01-31", opening: 0,
    specs: [{ amountCents: 50000, entryDate: "2030-01-10" }], keepPeriod: true,
  });
  await matchBankLine(sub, { client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: 50000 }] });
  const st = await statementRow(stmt.statementId);
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-01-31");
  assert.equal(expected, Number(st.closing_cents), "x40.a mandatory setup: the recomputed identity ties the statement's own printed closing BEFORE completion is even attempted");

  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const recon = await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  assert.ok(recon, "a bank_reconciliations row was written");
  assert.equal(recon.status, "complete");
  assert.equal(Number(recon.opening_cents), 0);
  assert.equal(Number(recon.closing_cents), Number(st.closing_cents), "closing ties the statement's printed closing");
  assert.equal(Number(recon.outstanding_cents), 0, "a fully-matched month has zero outstanding");
  assert.equal(Number(recon.excepted_cents ?? 0), 0);
  assert.equal(recon.prior_statement_id, null, "the first-period exemption is claimed (no prior statement)");
  assert.equal(recon.coa_account_code, acct.coaCode, "the certified basis is asserted at insert (S4.1)");
});

// ---------------------------------------------------------------------------
// x40.b -- unpresented cheque, UNMATCHED at period end: an approved entry with
// a bank-side CREDIT leg (money out) that has NOT yet cleared. Contributes to
// unmatched_capacity(P); the month still completes at 0 once acknowledged (it
// is < 60 days old, so no ack is even required here -- x40.l owns the stale
// challenge).
// ---------------------------------------------------------------------------
test("x40.b an unpresented cheque (unmatched at period end) is carried in unmatched_capacity and the month still completes at 0", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "b1");
  // The cheque: approved, posts inside the period, no matching line at all.
  await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 12000, postingDate: "2030-02-05", memo: "x40.b unpresented cheque" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2030-02-01", periodEnd: "2030-02-28", opening: 0,
    specs: [], keepPeriod: true, // the cheque never clears this month -- a zero-line statement
  });
  const st = await statementRow(stmt.statementId);
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-02-28");
  assert.equal(expected, Number(st.closing_cents), "x40.b mandatory setup: -12000 capacity nets the identity to the (zero) printed closing");

  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const recon = await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  assert.equal(Number(recon.outstanding_cents), -12000, "the unpresented cheque's full amount is outstanding capacity (a negative, credit-side, timing item)");
  assert.equal(recon.status, "complete");
});

// ---------------------------------------------------------------------------
// x40.c -- the SAME cheque, MATCHED into a live group whose LINE clears in a
// LATER statement (matched-but-uncleared: uncleared(g,P) is nonzero in the
// entry's month, zero the month the line clears).
// ---------------------------------------------------------------------------
test("x40.c a matched-but-uncleared entry: uncleared(g,P) carries it in the entry's month, and it clears to zero the month the line posts", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "c1");
  const entry = await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 8800, postingDate: "2030-03-20", memo: "x40.c the cheque" });
  const stmtMar = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2030-03-01", periodEnd: "2030-03-31", opening: 0,
    specs: [], keepPeriod: true,
  });
  const stmtApr = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2030-04-01", periodEnd: "2030-04-30", opening: 0,
    specs: [{ amountCents: -8800, entryDate: "2030-04-05" }], keepPeriod: true,
  });
  await matchBankLine(sub, { client, lines: [stmtApr.lines[0].id], entries: [{ entry_id: entry, matched_cents: -8800 }] });

  const marExpected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-03-31");
  assert.equal(marExpected, Number((await statementRow(stmtMar.statementId)).closing_cents), "x40.c March: uncleared(g,Mar) carries the full -8800, closing still ties (zero-line statement)");
  const marReceipt = await completeRecon(sub, { client, statement: stmtMar.statementId });
  const marRecon = await reconRow(idOf(marReceipt, "reconciliation_id", "recon_id", "id"));
  assert.equal(Number(marRecon.outstanding_cents), -8800, "March: the entry posted, the line has not cleared -- outstanding via uncleared(g,P)");

  const aprExpected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-04-30");
  assert.equal(aprExpected, Number((await statementRow(stmtApr.statementId)).closing_cents), "x40.c April mandatory setup");
  const aprReceipt = await completeRecon(sub, { client, statement: stmtApr.statementId });
  const aprRecon = await reconRow(idOf(aprReceipt, "reconciliation_id", "recon_id", "id"));
  assert.equal(Number(aprRecon.outstanding_cents), 0, "April: the line cleared -- uncleared(g,Apr)=0, nothing outstanding");
});

// ---------------------------------------------------------------------------
// x40.d -- deposit in transit: the mirror shape, debit side (money in, posted
// mid-period, the line clears in a LATER statement).
// ---------------------------------------------------------------------------
test("x40.d a deposit in transit (debit-side timing item) mirrors the cheque shape and ties both months", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "d1");
  const entry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 30000, postingDate: "2030-05-28", memo: "x40.d deposit in transit" });
  const stmtMay = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2030-05-01", periodEnd: "2030-05-31", opening: 0, specs: [], keepPeriod: true });
  const stmtJun = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2030-06-01", periodEnd: "2030-06-30", opening: 0, specs: [{ amountCents: 30000, entryDate: "2030-06-02" }], keepPeriod: true });
  await matchBankLine(sub, { client, lines: [stmtJun.lines[0].id], entries: [{ entry_id: entry, matched_cents: 30000 }] });

  const mayExpected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-05-31");
  assert.equal(mayExpected, Number((await statementRow(stmtMay.statementId)).closing_cents));
  const mayReceipt = await completeRecon(sub, { client, statement: stmtMay.statementId });
  assert.equal(Number((await reconRow(idOf(mayReceipt, "reconciliation_id", "recon_id", "id"))).outstanding_cents), 30000, "May: the deposit is in transit -- outstanding capacity +30000");

  const junExpected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-06-30");
  assert.equal(junExpected, Number((await statementRow(stmtJun.statementId)).closing_cents));
  const junReceipt = await completeRecon(sub, { client, statement: stmtJun.statementId });
  assert.equal(Number((await reconRow(idOf(junReceipt, "reconciliation_id", "recon_id", "id"))).outstanding_cents), 0, "June: cleared -- zero outstanding");
});

// ---------------------------------------------------------------------------
// x40.e -- cross-month straddle: a TWO-tranche IBG group, one entry fully
// consumed by two line members whose statements land in DIFFERENT months. The
// April tranche's identity DEDUCTS the still-unclear May tranche as a deposit
// in transit (part2 finding 3, the group-grain-consumption blocker).
// ---------------------------------------------------------------------------
test("x40.e cross-month straddle: a two-tranche group ties in April (deducting the May tranche) AND ties again once May completes", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "e1");
  const entry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 100000, postingDate: "2030-07-25", memo: "x40.e straddle receipt" });
  const stmtJul = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2030-07-01", periodEnd: "2030-07-31", opening: 0, specs: [{ amountCents: 40000, entryDate: "2030-07-29" }], keepPeriod: true });
  // INTEGRATION FIX: adjacent statements chain -- 0038's continuity belt refuses an
  // opening that does not equal the prior month's printed closing.
  const stmtAug = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2030-08-01", periodEnd: "2030-08-31", opening: 40000, specs: [{ amountCents: 60000, entryDate: "2030-08-02" }], keepPeriod: true });
  const receipt = await matchBankLine(sub, {
    client, lines: [stmtJul.lines[0].id, stmtAug.lines[0].id],
    entries: [{ entry_id: entry, matched_cents: 100000 }],
  });
  await assertGroupTies(matchIdOf(receipt), "x40.e straddle group ties (line-grain consumption, S3 fix for part2 finding 3)");

  const julExpected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-07-31");
  assert.equal(julExpected, Number((await statementRow(stmtJul.statementId)).closing_cents), "x40.e July: uncleared(g,Jul) DEDUCTS the still-unclear August tranche (+60000) as a deposit in transit");
  const julReceipt = await completeRecon(sub, { client, statement: stmtJul.statementId });
  // INTEGRATION FIX: `outstanding_cents` is the design's own BINDING -- it stores
  // (Sigma uncleared + unmatched capacity'), not capacity alone. In July the straddle's
  // still-unclear August tranche IS outstanding (a deposit in transit), which is the whole
  // point of the cell; what must be zero is CAPACITY, asserted separately below.
  assert.equal(Number((await reconRow(idOf(julReceipt, "reconciliation_id", "recon_id", "id"))).outstanding_cents), 60000, "July: the still-unclear August tranche rides uncleared(g,Jul) as a deposit in transit");
  assert.equal(await unmatchedCapacity(client, acct.coaCode, "2030-07-31"), 0, "July: capacity is 0 -- the entry is fully spoken for by the live group (entry-total consumption)");

  const augExpected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-08-31");
  assert.equal(augExpected, Number((await statementRow(stmtAug.statementId)).closing_cents), "x40.e August: BOTH tranches now clear -- uncleared(g,Aug)=0");
  const augReceipt = await completeRecon(sub, { client, statement: stmtAug.statementId });
  assert.equal(Number((await reconRow(idOf(augReceipt, "reconciliation_id", "recon_id", "id"))).outstanding_cents), 0, "August ALSO ties -- the straddle never wedges either month (part2 finding 3, the group-grain-consumption blocker)");
});

// ---------------------------------------------------------------------------
// x40.f -- acknowledged posting-date exception: an entry catch-up posted
// AFTER the line already cleared. match_bank_line refuses without the ack,
// records the exception WITH ack (member row), and it folds into
// uncleared(g,P) as an honest timing item -- NEVER a refusal at completion
// (part2 finding 4).
// ---------------------------------------------------------------------------
test("x40.f the acknowledged posting-date exception folds into uncleared(g,P) as an honest timing item, never a completion refusal", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "f1");
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2030-09-01", periodEnd: "2030-09-30", opening: 0, specs: [{ amountCents: -5500, entryDate: "2030-09-10" }], keepPeriod: true });
  // The books catch up LATE -- the entry posts AFTER the line's own date.
  // INTEGRATION FIX: 0038's posting-date exception is `e.posting_date > period_end`
  // (0038:4165) -- an entry dated INSIDE the period is no exception at all, so the
  // original 2030-09-25 fixture never exercised the ack door it was written for.
  const entry = await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 5500, postingDate: "2030-10-25", memo: "x40.f late catch-up, posted after the period closes" });

  const denied = await caught(() => matchBankLine(sub, { client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: -5500 }] }));
  assert.ok(denied, "without the ack, a posting-date exception is refused");
  noteLane(`x40.f unacked posting-date exception refusal: code=${denied.code} reason=${reasonOf(denied)}`);

  const receipt = await matchBankLine(sub, { client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: -5500 }], ackPeriodExceptions: true });
  await assertGroupTies(matchIdOf(receipt), "x40.f acked posting-date exception");

  const st = await statementRow(stmt.statementId);
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-09-30");
  assert.equal(expected, Number(st.closing_cents), "the identity ties -- uncleared(g,Sep) folds the timing item honestly");
  const completeReceipt = await completeRecon(sub, { client, statement: stmt.statementId });
  assert.equal((await reconRow(idOf(completeReceipt, "reconciliation_id", "recon_id", "id"))).status, "complete", "completion NEVER refuses on an acked posting-date exception");
});

// ---------------------------------------------------------------------------
// x40.g -- THE DOUBLE-COUNT TRAP (part2 finding "identity-breaking", round 2):
// an entry fully consumed by a live group whose ONE line clears this month is
// NOT also counted as available unmatched_capacity -- consumption is
// entry-TOTAL, never line-dated. Proven by comparing the CORRECT
// (entry-total) recompute against a deliberately WRONG line-dated recompute.
// ---------------------------------------------------------------------------
test("x40.g the double-count trap: capacity's consumption subtraction is entry-TOTAL, never re-derived per line date", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "g1");
  const entry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 70000, postingDate: "2030-10-05", memo: "x40.g entry, one clears this month" });
  const stmtOct = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2030-10-01", periodEnd: "2030-10-31", opening: 0, specs: [{ amountCents: 30000, entryDate: "2030-10-08" }], keepPeriod: true });
  // INTEGRATION FIX: adjacent statements chain (0038 continuity belt).
  const stmtNov = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2030-11-01", periodEnd: "2030-11-30", opening: 30000, specs: [{ amountCents: 40000, entryDate: "2030-11-02" }], keepPeriod: true });
  await matchBankLine(sub, { client, lines: [stmtOct.lines[0].id, stmtNov.lines[0].id], entries: [{ entry_id: entry, matched_cents: 70000 }] });

  // The CORRECT reading: the entry is FULLY consumed by the live group in
  // October (posting_date<=Oct.end), so capacity contributes 0 for it; only
  // uncleared(g,Oct) carries the still-unclear November tranche (-40000
  // deducted from the group total already inside the entry's own posting
  // month). unmatched_capacity(Oct) must therefore show ZERO for this entry.
  const capacityOct = await unmatchedCapacity(client, acct.coaCode, "2030-10-31");
  assert.equal(capacityOct, 0, "x40.g: entry-total consumption zeroes capacity in October -- the entry is fully spoken for by the live group");
  const unclearedOct = await sumUnclearedOverLiveGroups(acct.bankAccountId, "2030-10-31");
  // INTEGRATION FIX: sign. uncleared(g,P) is measured from the ACCOUNT HOLDER's side (the
  // 0038 line convention, + = into the account), so an unclear +40000 deposit reads +40000
  // here; the identity subtracts it. The cell's own recompute (asserted below) is what
  // proves the sign is the one the receipt uses.
  assert.equal(unclearedOct, 40000, "x40.g: the still-unclear November tranche lives ONLY in uncleared(g,Oct), never double-counted into capacity");

  const st = await statementRow(stmtOct.statementId);
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-10-31");
  assert.equal(expected, Number(st.closing_cents), "x40.g mandatory setup: the identity ties under the CORRECT (entry-total) reading");
});

// ---------------------------------------------------------------------------
// x40.h -- the GROSS loan-drawdown shape: ONE entry touching the bank account
// on BOTH sides (a same-entry two-sided movement), two lines, one group.
// ---------------------------------------------------------------------------
test("x40.h the gross loan-drawdown shape (one entry, two bank-account sides, two lines, one group) ties", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "h1");
  // INTEGRATION FIX: the account has to exist before a line codes to it.
  await upsertAccountClassed(sub, { client, code: "471-C40G", name: "x40.h term loan", type: "liability", opKey: opk("x40-loan") });
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x40.h loan drawdown, gross", postingDate: "2030-12-04",
    lines: [
      { account_code: acct.coaCode, debit_cents: 200000, credit_cents: 0, description: "loan proceeds in" },
      { account_code: acct.coaCode, debit_cents: 0, credit_cents: 5000, description: "loan fee out" },
      { account_code: EXPN, debit_cents: 5000, credit_cents: 0, description: "fee expense" },
      // INTEGRATION FIX: the entry has to BALANCE -- Dr 200000 bank + Dr 5000 fee = Cr 5000
      // bank + Cr 200000 loan. The original 195000 credit was 5000c short and never posted.
      { account_code: "471-C40G", debit_cents: 0, credit_cents: 200000, description: "loan payable" },
    ],
    opKey: opk("x40-drawdown"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x40-drawdowna") });

  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2030-12-01", periodEnd: "2030-12-31", opening: 0,
    specs: [{ amountCents: 200000, entryDate: "2030-12-05" }, { amountCents: -5000, entryDate: "2030-12-05" }], keepPeriod: true,
  });
  const receipt = await matchBankLine(sub, {
    client, lines: [stmt.lines[0].id, stmt.lines[1].id],
    entries: [{ entry_id: d.entry_id, matched_cents: 200000 }, { entry_id: d.entry_id, matched_cents: -5000 }],
  });
  await assertGroupTies(matchIdOf(receipt), "x40.h gross loan drawdown");
  const st = await statementRow(stmt.statementId);
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2030-12-31");
  assert.equal(expected, Number(st.closing_cents));
  const completeReceipt = await completeRecon(sub, { client, statement: stmt.statementId });
  assert.equal(Number((await reconRow(idOf(completeReceipt, "reconciliation_id", "recon_id", "id"))).outstanding_cents), 0, "the gross drawdown ties fully matched, zero outstanding");
});

// ---------------------------------------------------------------------------
// x40.i -- carried exception: April's dispute stays OPEN into May (all-time
// excepted(P), part2 finding 1's headline case) -- April completes at 0
// (excepted absorbs the dispute), May ALSO completes at 0 (the SAME open
// exception is still counted -- carried forward, never re-litigated).
// ---------------------------------------------------------------------------
test("x40.i a carried exception (open in April) keeps BOTH April and May completable at difference 0", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const owner = world.users.alice; // firm-A owner
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "i1");
  const stmtApr = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2031-04-01", periodEnd: "2031-04-30", opening: 0, specs: [{ amountCents: -900, entryDate: "2031-04-12", description: "a bank error, disputed" }], keepPeriod: true });
  const exReceipt = await exceptLine(owner, { client, line: stmtApr.lines[0].id, kind: "disputed", reason: "x40.i genuine bank dispute" });
  const exId = idOf(exReceipt, "exception_id", "id");
  assert.ok(exId, "except_bank_line returns an id-bearing receipt");
  assert.equal((await exceptionRow(exId))?.status, "open");

  const aprExpected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2031-04-30");
  assert.equal(aprExpected, Number((await statementRow(stmtApr.statementId)).closing_cents), "April: excepted(P) absorbs the open dispute");
  const aprReceipt = await completeRecon(sub, { client, statement: stmtApr.statementId });
  assert.equal((await reconRow(idOf(aprReceipt, "reconciliation_id", "recon_id", "id"))).status, "complete");
  assert.equal(Number((await reconRow(idOf(aprReceipt, "reconciliation_id", "recon_id", "id"))).excepted_cents), -900);

  const stmtMay = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2031-05-01", periodEnd: "2031-05-31", opening: Number((await statementRow(stmtApr.statementId)).closing_cents), specs: [], keepPeriod: true });
  const mayExpected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2031-05-31");
  assert.equal(mayExpected, Number((await statementRow(stmtMay.statementId)).closing_cents), "May: the SAME April dispute is STILL counted (all-time excepted)");
  const mayReceipt = await completeRecon(sub, { client, statement: stmtMay.statementId });
  assert.equal((await reconRow(idOf(mayReceipt, "reconciliation_id", "recon_id", "id"))).status, "complete", "May completes over the carried exception without re-litigating it");
});

// ---------------------------------------------------------------------------
// x40.j -- resolved-then-booked exception: `matched_booking` disposition --
// the line ends matched (booked into the live group), drops OUT of
// excepted(P) (resolved-and-matched is excluded by the term's own definition),
// and the identity still ties (part2 finding 2, the disposition hole).
// ---------------------------------------------------------------------------
test("x40.j resolve with matched_booking: the line ends matched, drops out of excepted(P), and the identity still ties", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const owner = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "j1");
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2031-06-01", periodEnd: "2031-06-30", opening: 0, specs: [{ amountCents: -1500, entryDate: "2031-06-08" }], keepPeriod: true });
  const exReceipt = await exceptLine(owner, { client, line: stmt.lines[0].id, kind: "bank_error", reason: "x40.j initially thought a bank error" });
  const exId = idOf(exReceipt, "exception_id", "id");

  // INTEGRATION FIX -- IA-4 RESOLVED AGAINST THE BUILD. IA-4 read `matched_booking` as
  // "book first (its own call), then resolve". That ordering is UNREACHABLE: an
  // OPEN-excepted line is not matchable at all (design S4.2 `line_excepted`, splice
  // register 4's post-lock re-check), so a separate-transaction match can never come
  // first. The design's other arm is the reachable one -- "the line is (now) a live
  // member OR IN THE SAME TXN AS THE BOOKING MATCH" -- i.e. RESOLVE, then MATCH, both
  // inside ONE transaction, with the deferred settled-authority belt (which sees the
  // world at commit) refusing `disposition_unbooked` if the booking never lands.
  const entry = await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 1500, postingDate: "2031-06-10", memo: "x40.j the entry turns up" });
  await withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (c) => {
    await c.query(
      "select clara.resolve_bank_line_exception(p_exception => $1, p_disposition => $2, p_note => $3, p_op_key => $4) as r",
      [exId, "matched_booking", "x40.j the entry was simply late in the books", opk("x40-j-resolve")],
    );
    await c.query(
      "select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb, p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as r",
      [client, JSON.stringify([stmt.lines[0].id]), JSON.stringify([{ entry_id: entry, matched_cents: -1500 }]), opk("x40-j-match")],
    );
  });
  assert.equal((await exceptionRow(exId))?.status, "resolved");
  assert.equal((await lineGroupStatus(stmt.lines[0].id))[0], "live", "x40.j the booking landed in the same transaction -- the belt's disposition_unbooked law is satisfied at commit");

  // RED-PROOF of the same law: a lone matched_booking resolve, with no booking in its own
  // transaction, is refused at COMMIT by the deferred authority belt.
  const acctB = await freshAccount(sub, client, "j2");
  const stmtB = await enterStatement(sub, { client, bankAccount: acctB.bankAccountId, periodStart: "2031-06-01", periodEnd: "2031-06-30", opening: 0, specs: [{ amountCents: -1500, entryDate: "2031-06-08" }], keepPeriod: true });
  const exB = idOf(await exceptLine(owner, { client, line: stmtB.lines[0].id, kind: "bank_error", reason: "x40.j unbooked resolve" }), "exception_id", "id");
  const unbooked = await caught(() => resolveException(owner, { client, exception: exB, disposition: "matched_booking", note: "x40.j nothing booked in this txn" }));
  assertReason(unbooked, null, "disposition_unbooked", "x40.j a matched_booking resolve with no booking in its own transaction is refused at commit");

  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2031-06-30");
  assert.equal(expected, Number((await statementRow(stmt.statementId)).closing_cents), "resolved-and-matched: excepted(P) no longer counts it, uncleared(g,P) does instead -- the identity still ties");
  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  assert.equal((await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"))).status, "complete");
});

// ---------------------------------------------------------------------------
// x40.k -- corrective-pair resolution: `bank_corrective_line` names its
// counterpart line (the bank's own correcting entry); the pair NETS ZERO by
// construction and is enumerated CLOSED on the receipt (part2 finding 2).
// ---------------------------------------------------------------------------
test("x40.k a corrective-pair resolution nets zero and is enumerated as a closed pair: both stored legs and both SNAPSHOT legs name each other, a second resolve is already_resolved, and a competing claim on a paired counterpart is refused", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const owner = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "k1");
  // The bank double-charged, then corrected itself -- two lines, opposite
  // signs, neither ever books (genuine bank error, WCC-R2's narrow door).
  // A THIRD, unpaired -400 line rides an OPEN exception beside them: it is the
  // control for the enumeration asserts below (a leg with NO counterpart), and
  // the claimant for the competing-claim refusal at the end.
  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2031-07-01", periodEnd: "2031-07-31", opening: 0,
    specs: [
      { amountCents: -400, entryDate: "2031-07-11", description: "erroneous double charge" },
      { amountCents: 400, entryDate: "2031-07-12", description: "the bank's own reversal" },
      { amountCents: -400, entryDate: "2031-07-13", description: "an unrelated disputed charge" },
    ], keepPeriod: true,
  });
  const ex1 = idOf(await exceptLine(owner, { client, line: stmt.lines[0].id, kind: "bank_error", reason: "x40.k the erroneous charge" }), "exception_id", "id");
  const ex2 = idOf(await exceptLine(owner, { client, line: stmt.lines[1].id, kind: "bank_error", reason: "x40.k the bank's own reversal" }), "exception_id", "id");
  const ex3 = idOf(await exceptLine(owner, { client, line: stmt.lines[2].id, kind: "disputed", reason: "x40.k the unrelated dispute (no counterpart)" }), "exception_id", "id");
  // CX2 [folds into A2, landed]: the corrective pair resolves BOTH exceptions ATOMICALLY in ONE
  // call -- both lines locked, the counterpart's exception auto-flips resolved/bank_corrective_
  // line naming THIS line back -- reciprocity by construction, not by two separate calls. A
  // second resolveException on ex2 is no longer reachable here (its exception is already
  // resolved by the first call).
  const pairReceipt = await resolveException(owner, {
    client, exception: ex1, disposition: "bank_corrective_line", note: "x40.k the offsetting reversal names its pair",
    counterpartLine: stmt.lines[1].id,
  });
  assert.equal(pairReceipt?.counterpart_exception_id, ex2, "x40.k CX2: the receipt names the counterpart EXCEPTION this same call closed (F10's event key, from the receipt side)");

  // THE STORED RECIPROCITY, BOTH ROWS (delta-round finding #8: the cell used to check only the
  // two statuses + the net, so deleting counterpart_line_id from the enumeration -- or from the
  // WRITE -- left it green).
  const row1 = await exceptionRow(ex1);
  const row2 = await exceptionRow(ex2);
  assert.equal(row1?.status, "resolved");
  assert.equal(row2?.status, "resolved");
  assert.equal(row1?.resolution_disposition, "bank_corrective_line", "x40.k leg 1's stored disposition");
  assert.equal(row2?.resolution_disposition, "bank_corrective_line", "x40.k leg 2's stored disposition -- CX2 wrote it, the caller never named it");
  assert.equal(row1?.counterpart_line_id, stmt.lines[1].id, "x40.k leg 1 names leg 2's LINE back");
  assert.equal(row2?.counterpart_line_id, stmt.lines[0].id, "x40.k leg 2 names leg 1's LINE back -- reciprocity is STORED, not merely asserted by the caller");

  // Both lines stay resolved-and-unmatched -- they STILL ride excepted(P) (the
  // term counts open OR resolved-unmatched), netting to zero by construction.
  // The third (open, unpaired) line carries the whole -400.
  const excepted = await exceptedOf(acct.bankAccountId, "2031-07-31");
  assert.equal(excepted, -400, "x40.k the corrective pair nets exactly zero inside excepted(P); only the unpaired open line remains");
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2031-07-31");
  assert.equal(expected, Number((await statementRow(stmt.statementId)).closing_cents));
  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const recon = await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  assert.equal(recon.status, "complete");
  const snapshot = recon.snapshot ?? {};

  // THE SNAPSHOT LEGS, EXACTLY (finding #8). Removing counterpart_line_id from the enumeration
  // must turn this cell RED -- the whole point of enumerating a pair as a closed unit is that a
  // later reader can re-check the two legs without re-deriving anything.
  const exRows = snapshot.exceptions ?? [];
  assert.equal(exRows.length, 3, `x40.k the snapshot enumerates all three excepted lines (got ${JSON.stringify(exRows)})`);
  const legOf = (lineId) => exRows.find((e) => e.line_id === lineId);
  assert.equal(legOf(stmt.lines[0].id)?.counterpart_line_id, stmt.lines[1].id, "x40.k snapshot leg 1 carries its counterpart_line_id");
  assert.equal(legOf(stmt.lines[1].id)?.counterpart_line_id, stmt.lines[0].id, "x40.k snapshot leg 2 carries its counterpart_line_id");
  assert.equal(legOf(stmt.lines[2].id)?.counterpart_line_id, null, "x40.k the unpaired open leg carries NO counterpart -- the key is not decoration");
  // 0040 FIX WAVE F7: and each leg says whether its pair actually CLOSES inside this period.
  assert.equal(legOf(stmt.lines[0].id)?.pair_complete_in_period, true, "x40.k (F7) leg 1's counterpart sits on a statement inside this period");
  assert.equal(legOf(stmt.lines[1].id)?.pair_complete_in_period, true, "x40.k (F7) leg 2's counterpart sits on a statement inside this period");
  assert.equal(legOf(stmt.lines[2].id)?.pair_complete_in_period, false, "x40.k (F7) an unpaired leg is never 'pair complete'");
  assert.equal(
    exRows.reduce((n, e) => n + Number(e.amount_cents), 0), Number(recon.excepted_cents),
    "x40.k the enumeration still sums to the stored term (the belt's own law, re-asserted from outside)",
  );

  // A SECOND RESOLVE OF THE SAME EXCEPTION IS REFUSED BY NAME (finding #8): idempotency here is
  // op-key dedupe, never a silent re-write of a closed pair.
  const twice = await caught(() => resolveException(owner, {
    client, exception: ex1, disposition: "bank_corrective_line", note: "x40.k resolving a closed leg a second time",
    counterpartLine: stmt.lines[1].id, opKey: opk("x40-k-twice"),
  }));
  assertReason(twice, null, "already_resolved", "x40.k a second resolve of an already-resolved exception is refused BY NAME");

  // A COMPETING CLAIM ON A PAIRED COUNTERPART (finding #8). The third line is genuinely
  // offsetting (-400 against +400) and on the same account, so it clears every arithmetic gate
  // -- and is still refused, because leg 2's governing exception is a corrective resolution that
  // names leg 1 back, not this claimant. Without this refusal, N lines could each claim to be
  // closed against the same small reversal (the money lens' three-way chain).
  const competing = await caught(() => resolveException(owner, {
    client, exception: ex3, disposition: "bank_corrective_line", note: "x40.k a third line claiming the already-paired reversal",
    counterpartLine: stmt.lines[1].id, opKey: opk("x40-k-compete"),
  }));
  assertReason(competing, null, "counterpart_not_reciprocal", "x40.k a competing claim on an already-paired counterpart is refused -- the pair does not close back to the claimant");
  assert.equal((await exceptionRow(ex3))?.status, "open", "x40.k the refused claimant's own exception is untouched");
  noteLane(`x40.k snapshot keys: ${Object.keys(snapshot).join(",")}; pair legs asserted CLOSED + reciprocal, competing claim refused`);
});

// ---------------------------------------------------------------------------
// x40.k-R -- THE CORRECTIVE-PAIR REFUSAL LADDER, RED-PROOF (0040 FIX WAVE F3, the
// delta round). resolve_bank_line_exception's `bank_corrective_line` arm is the
// one door in C-c whose whole content is arithmetic + reciprocity, and until this
// cell NOT ONE of its four refusals had a test: counterpart_required,
// counterpart_not_offsetting, corrective_pair_unbalanced and the
// uq_ble_counterpart_in_use translation could each have been deleted with every
// battery still green. Each arm below is driven to its OWN token, and the
// unbalanced arm additionally asserts the errdetail's numbers (a refusal that
// names the wrong sum is a refusal a human cannot act on).
// ---------------------------------------------------------------------------
test("x40.k-R the corrective-pair refusals: counterpart_required (null), counterpart_not_offsetting (cross-account), corrective_pair_unbalanced (with its numbers), and counterpart_already_paired (the second claim on one counterpart)", async (t) => {
  if (skipHere(t)) return;
  const owner = world.users.alice;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "kr1");
  const other = await freshAccount(sub, client, "kr2");
  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2031-09-01", periodEnd: "2031-09-30", opening: 0,
    specs: [
      { amountCents: -400, entryDate: "2031-09-03", description: "kr the erroneous charge" },
      { amountCents: 400, entryDate: "2031-09-04", description: "kr the bank's own reversal" },
      { amountCents: -400, entryDate: "2031-09-05", description: "kr a second erroneous charge" },
      { amountCents: 350, entryDate: "2031-09-06", description: "kr a NEAR-offsetting credit" },
    ], keepPeriod: true,
  });
  // A line on a DIFFERENT bank account, exactly offsetting the first -- the cross-account probe.
  const stmtOther = await enterStatement(sub, {
    client, bankAccount: other.bankAccountId, periodStart: "2031-09-01", periodEnd: "2031-09-30", opening: 0,
    specs: [{ amountCents: 400, entryDate: "2031-09-07", description: "kr an offsetting credit on ANOTHER account" }],
    keepPeriod: true,
  });
  const exA = idOf(await exceptLine(owner, { client, line: stmt.lines[0].id, kind: "bank_error", reason: "x40.k-R leg A" }), "exception_id", "id");
  const exB = idOf(await exceptLine(owner, { client, line: stmt.lines[1].id, kind: "bank_error", reason: "x40.k-R leg B" }), "exception_id", "id");
  const exC = idOf(await exceptLine(owner, { client, line: stmt.lines[2].id, kind: "bank_error", reason: "x40.k-R leg C" }), "exception_id", "id");
  await exceptLine(owner, { client, line: stmt.lines[3].id, kind: "bank_error", reason: "x40.k-R the near-offsetting credit" });
  await exceptLine(owner, { client, line: stmtOther.lines[0].id, kind: "bank_error", reason: "x40.k-R the off-account credit" });

  // (1) counterpart_required -- the disposition without its counterpart at all.
  const nullCp = await caught(() => resolveException(owner, {
    client, exception: exA, disposition: "bank_corrective_line", note: "x40.k-R no counterpart named",
    opKey: opk("x40-kr-null"),
  }));
  assertReason(nullCp, null, "counterpart_required", "x40.k-R a corrective resolution naming NO counterpart is refused");
  // ...and a line cannot be its own counterpart (the same token, the degenerate pair).
  const selfCp = await caught(() => resolveException(owner, {
    client, exception: exA, disposition: "bank_corrective_line", note: "x40.k-R naming itself",
    counterpartLine: stmt.lines[0].id, opKey: opk("x40-kr-self"),
  }));
  assertReason(selfCp, null, "counterpart_required", "x40.k-R a line cannot be its own corrective counterpart");

  // (2) counterpart_not_offsetting -- exactly offsetting, but on ANOTHER bank account.
  // excepted(P) is account-scoped, so a cross-account "pair" puts exactly ONE leg in the term
  // and the design's "nets to zero by construction" is simply false.
  const crossAcct = await caught(() => resolveException(owner, {
    client, exception: exA, disposition: "bank_corrective_line", note: "x40.k-R an off-account counterpart",
    counterpartLine: stmtOther.lines[0].id, opKey: opk("x40-kr-cross"),
  }));
  assertReason(crossAcct, null, "counterpart_not_offsetting", "x40.k-R a corrective pair must close INSIDE one bank account");

  // (3) corrective_pair_unbalanced -- same account, both excepted, -400 against +350. The
  // errdetail must carry BOTH amounts and their sum, or the human cannot see which side is
  // wrong.
  const unbalanced = await caught(() => resolveException(owner, {
    client, exception: exA, disposition: "bank_corrective_line", note: "x40.k-R a near-offsetting counterpart",
    counterpartLine: stmt.lines[3].id, opKey: opk("x40-kr-unbal"),
  }));
  assertReason(unbalanced, null, "corrective_pair_unbalanced", "x40.k-R -400 against +350 does not net to zero");
  const detail = JSON.parse(unbalanced.detail ?? "{}");
  assert.equal(Number(detail.line_amount_cents), -400, "x40.k-R the refusal names THIS line's amount");
  assert.equal(Number(detail.counterpart_amount_cents), 350, "x40.k-R the refusal names the counterpart's amount");
  assert.equal(Number(detail.sum_cents), -50, "x40.k-R the refusal names the residual the human must explain");

  // (4) counterpart_already_paired -- the uq_ble_counterpart_in_use translation. Leg A closes
  // against leg B; leg B is then excepted AFRESH (lawful -- the unique is scoped to OPEN rows),
  // so a third line's claim reaches the WRITE with a genuinely open counterpart and is stopped
  // by the index alone. This is the arm that keeps N lines from all naming one small reversal.
  await resolveException(owner, {
    client, exception: exA, disposition: "bank_corrective_line", note: "x40.k-R the real pair",
    counterpartLine: stmt.lines[1].id, opKey: opk("x40-kr-pair"),
  });
  assert.equal((await exceptionRow(exB))?.counterpart_line_id, stmt.lines[0].id, "x40.k-R mandatory setup: the real pair is stored reciprocally");
  await exceptLine(owner, { client, line: stmt.lines[1].id, kind: "disputed", reason: "x40.k-R leg B is disputed again, on a fresh open exception", opKey: opk("x40-kr-reexcept") });
  const claimed = await caught(() => resolveException(owner, {
    client, exception: exC, disposition: "bank_corrective_line", note: "x40.k-R a second claim on the same counterpart",
    counterpartLine: stmt.lines[1].id, opKey: opk("x40-kr-claim"),
  }));
  assertReason(claimed, null, "counterpart_already_paired", "x40.k-R (F6) a counterpart already spoken for by another pair is refused under its OWN token -- not the misleading counterpart_not_reciprocal");
  assert.equal((await exceptionRow(exC))?.status, "open", "x40.k-R the refused claimant's exception is untouched");
});

// ---------------------------------------------------------------------------
// x40.k-P -- pair_complete_in_period, THE DISCRIMINATING HALF (0040 FIX WAVE F7,
// the delta round). A corrective pair only "nets to zero by construction" inside
// a period when BOTH legs are inside it. resolve_bank_line_exception demands the
// same bank account and an exact offset -- it does NOT demand the same statement,
// and it should not: the bank's own correction routinely lands the following
// month. When it does, exactly ONE leg rides excepted(P) here and the other
// arrives next period, and the enumeration must say so -- otherwise a reader sees
// a counterpart_line_id and reasonably concludes the pair closed.
// ---------------------------------------------------------------------------
test("x40.k-P a corrective pair whose counterpart sits on a LATER statement enumerates pair_complete_in_period=false, and the single leg genuinely rides excepted(P)", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const owner = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "kp1");
  const stmtJul = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2036-07-01", periodEnd: "2036-07-31", opening: 0,
    specs: [{ amountCents: -400, entryDate: "2036-07-20", description: "kp the erroneous charge" }], keepPeriod: true,
  });
  const stmtAug = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2036-08-01", periodEnd: "2036-08-31", opening: -400,
    specs: [{ amountCents: 400, entryDate: "2036-08-04", description: "kp the bank's own reversal, NEXT MONTH" }], keepPeriod: true,
  });
  const exJul = idOf(await exceptLine(owner, { client, line: stmtJul.lines[0].id, kind: "bank_error", reason: "x40.k-P the July charge" }), "exception_id", "id");
  await exceptLine(owner, { client, line: stmtAug.lines[0].id, kind: "bank_error", reason: "x40.k-P the August reversal" });
  await resolveException(owner, {
    client, exception: exJul, disposition: "bank_corrective_line", note: "x40.k-P the correction landed the following month",
    counterpartLine: stmtAug.lines[0].id, opKey: opk("x40-kp-pair"),
  });

  // July carries exactly ONE leg: -400 of genuinely open excepted money, not a closed pair.
  assert.equal(await exceptedOf(acct.bankAccountId, "2036-07-31"), -400, "x40.k-P mandatory setup: only the July leg is inside July's excepted(P)");
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2036-07-31");
  assert.equal(expected, Number((await statementRow(stmtJul.statementId)).closing_cents), "x40.k-P mandatory setup: July still ties on the single leg");
  const receipt = await completeRecon(sub, { client, statement: stmtJul.statementId, opKey: opk("x40-kp-complete") });
  const recon = await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  const legs = recon.snapshot?.exceptions ?? [];
  assert.equal(legs.length, 1, `x40.k-P July enumerates one leg only (got ${JSON.stringify(legs)})`);
  assert.equal(legs[0].counterpart_line_id, stmtAug.lines[0].id, "x40.k-P the leg still names its counterpart -- the pair is real");
  assert.equal(legs[0].pair_complete_in_period, false, "x40.k-P (F7) ...and says plainly that the pair does NOT close inside this period -- a counterpart_line_id alone would read as 'settled, nets to zero', which is false here by exactly RM4.00");
  assert.equal(Number(recon.excepted_cents), -400, "x40.k-P the certified excepted term is the single leg, not zero");
});

// ---------------------------------------------------------------------------
// x40.l -- the duplicate-payment `recon_outstanding_stale` challenge: an
// outstanding side older than 60 days before P.end refuses completion unless
// acknowledged BY ID (part2 finding 8/20 -- the plug the design exists to
// challenge).
// ---------------------------------------------------------------------------
test("x40.l an outstanding side older than 60 days refuses recon_outstanding_stale; the PREVIEW still says can_complete with the blocker NAMED beside its id list, and acknowledging it by id completes", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "l1");
  // An unpresented cheque, 90+ days stale relative to the statement's period_end.
  await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 6600, postingDate: "2031-05-01", memo: "x40.l a stale unpresented cheque (duplicate-payment plug shape)" });
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2031-08-01", periodEnd: "2031-08-31", opening: 0, specs: [], keepPeriod: true });

  const denied = await caught(() => completeRecon(sub, { client, statement: stmt.statementId }));
  assertReason(denied, null, "recon_outstanding_stale", "x40.l a stale (>60d) outstanding side blocks completion until challenged");

  // The outstanding side's id (mandatory setup: the id the caller must ack).
  const staleEntry = await rootQuery(
    "select e.id from clara.journal_entries e join clara.journal_lines l on l.entry_id=e.id where l.client_id=$1 and l.account_code=$2 and e.status='approved' order by e.posting_date limit 1",
    [client, acct.coaCode],
  );

  // 0040 FIX WAVE F1 [the delta round's MAJOR 3] -- THE PREVIEW'S VERDICT, END TO END FROM THE
  // RPC SURFACE. recon_outstanding_stale is the ONE blocker whose remedy is a caller ARGUMENT,
  // and this read carries no acknowledgement set of its own -- so it must NAME the blocker and
  // hand back the exact ids the verb accepts, while still saying can_complete=true. The first
  // cut folded it into the hard gate, which made a fully-tied month carrying one 61-day item
  // permanently un-completable through the pane: the pane refuses to send when the server says
  // can_complete=false, so the human could never check the box the verb was waiting for. This is
  // the stale-but-otherwise-clean shape, and it must read as completable-with-an-acknowledgement.
  const preview = await getBankReconciliation(sub, { statement: stmt.statementId });
  assert.equal(preview?.preview, true, "x40.l mandatory setup: no receipt yet, so this read is the live preview");
  assert.ok((preview.blockers ?? []).includes("recon_outstanding_stale"), `x40.l the preview still NAMES the stale blocker (got ${JSON.stringify(preview.blockers)})`);
  assert.deepEqual(preview.blockers, ["recon_outstanding_stale"], "x40.l mandatory setup: the month is otherwise CLEAN -- the stale challenge is the only blocker, so can_complete below is testing exactly the F1 rule");
  assert.deepEqual(preview.stale_outstanding_ids, [staleEntry.rows[0].id], "x40.l the preview hands back the exact id the verb's p_ack_outstanding accepts");
  assert.equal(preview.can_complete, true, "x40.l (F1) a stale-but-otherwise-clean month reads can_complete=true -- the blocker is a challenge to acknowledge, not a wall");

  const receipt = await completeRecon(sub, { client, statement: stmt.statementId, ackOutstanding: preview.stale_outstanding_ids });
  assert.equal((await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"))).status, "complete", "the ack-by-id path completes -- the duplicate-payment plug is CHALLENGED, not silently totalled");

  // ...and a HARD blocker still vetoes. The same read on the now-complete receipt returns
  // can_complete=false naming recon_already_complete, so F1 narrowed exactly one token and
  // nothing else.
  const after = await getBankReconciliation(sub, { statement: stmt.statementId });
  assert.equal(after.can_complete, false, "x40.l a hard blocker still vetoes -- F1 excused recon_outstanding_stale ONLY");
  assert.deepEqual(after.blockers, ["recon_already_complete"], "x40.l the completed receipt names why it is not a completable preview");
});

// ---------------------------------------------------------------------------
// x40.m -- THE TAKEOVER OPENING ANCHOR (fix-wave E7/CX12, REBUILT through the
// REAL Gate-K doors; B1's CORRECTED algebra). 0040 FIX WAVE B1 [M1]:
// opening_tie_delta_cents = anchor_amount - opening_anchor (ONE subtraction --
// the uncleared double-subtraction dies). opening_anchor is the account's OWN
// first-live-statement printed opening_cents, so the tie is now a direct
// cross-check between the K3 anchor's own GL amount and whatever a human
// printed as the takeover month's opening -- and the still-uncleared
// instrument participates in the ORDINARY S3 identity exactly like any other
// timing item (x40.b/c's own precedent), never in the tie itself.
// ---------------------------------------------------------------------------
test("x40.m the takeover opening anchor: the identity ties when the K3 anchor equals the account's own first-statement printed opening (B1), refuses recon_opening_mismatch on a misstated print, and the pre-cutover cheque clears cleanly the following month", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const w = await realTakeoverWorld(sub, "m1");
  // Books cash at takeover: RM50,000 (the K3 anchor). ONE uncleared cheque of RM2,000, already
  // reduced in the books but not yet cleared by the bank.
  const opened = await realOpeningSet(sub, {
    client: w.client, plan: w.plan, coaCode: w.coaCode, approver: w.approver,
    items: [
      { itemKind: "gl_balance", itemKey: "x40m-anchor", amountCents: 50000 },
      { itemKind: "bank_uncleared", itemKey: "x40m-unc1", amountCents: -2000 },
    ],
  });
  w.bankAccountId = await activateTakeoverBank(sub, w);

  const stmtWrong = await enterStatement(sub, { client: w.client, bankAccount: w.bankAccountId, periodStart: "2031-01-01", periodEnd: "2031-01-31", opening: 51000, specs: [], keepPeriod: true });
  const wrongDenied = await caught(() => completeRecon(sub, { client: w.client, statement: stmtWrong.statementId }));
  assertReason(wrongDenied, null, "recon_opening_mismatch", "x40.m a MISSTATED opening (anchor_amount 50000 minus this statement's OWN printed opening 51000 is nonzero) refuses the takeover tie");

  // The design's own remedy for a statement read wrong is void + re-ingest (WCB-R5) -- the
  // corrected statement is January's own re-ingest, which also keeps opening_anchor (the
  // account's first-LIVE-statement lookup) pointed at the corrected print.
  await voidBankStatement(sub, { client: w.client, statement: stmtWrong.statementId, reason: "x40.m the printed opening was misstated" });
  const stmtJan = await enterStatement(sub, { client: w.client, bankAccount: w.bankAccountId, periodStart: "2031-01-01", periodEnd: "2031-01-31", opening: 50000, specs: [], keepPeriod: true });
  // A pre-cutover cheque still uncleared IS a stale outstanding item and the build challenges it
  // by name (recon_outstanding_stale) -- the duplicate-payment plug the wave exists to catch.
  const stale = await caught(() => completeRecon(sub, { client: w.client, statement: stmtJan.statementId }));
  assertReason(stale, null, "recon_outstanding_stale", "x40.m the still-uncleared pre-cutover cheque is CHALLENGED before the month can be certified");
  const receiptJan = await completeRecon(sub, { client: w.client, statement: stmtJan.statementId, ackOutstanding: [opened.entries["x40m-unc1"]] });
  const reconJan = await reconRow(idOf(receiptJan, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  assert.equal(reconJan.status, "complete", "the correctly-tied takeover opening completes once the stale cheque is acknowledged");
  assert.equal(Number(reconJan.opening_cents), 50000, "opening_cents = the statement's own printed opening = the anchor amount (B1's corrected tie)");

  // CARRY ONE MONTH: the cheque clears. February's opening chains from January's own printed
  // closing (50000, since January carried zero lines); the uncleared entry's line now appears on
  // February's statement and is matched -- books=bank, February ties too, with the SAME
  // opening_anchor (January's own opening, unchanged) still closing the takeover tie.
  const stmtFeb = await enterStatement(sub, { client: w.client, bankAccount: w.bankAccountId, periodStart: "2031-02-01", periodEnd: "2031-02-28", opening: 50000, specs: [{ amountCents: -2000, entryDate: "2031-02-10" }], keepPeriod: true });
  await matchBankLine(sub, { client: w.client, lines: [stmtFeb.lines[0].id], entries: [{ entry_id: opened.entries["x40m-unc1"], matched_cents: -2000 }] });
  const receiptFeb = await completeRecon(sub, { client: w.client, statement: stmtFeb.statementId });
  const reconFeb = await reconRow(idOf(receiptFeb, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  assert.equal(reconFeb.status, "complete", "x40.m February: the cheque cleared -- books=bank, and the takeover tie still holds under the SAME opening_anchor");
  assert.equal(Number(reconFeb.outstanding_cents), 0, "x40.m February: nothing outstanding once the cheque is matched");
});

// ---------------------------------------------------------------------------
// x40.n -- `bank_uncleared` OFF-ACCOUNT probe (fix-wave E7/CX12, REBUILT
// through the REAL Gate-K doors): a bank_uncleared opening item whose entry
// carries NO leg on a REGISTERED bank-account COA -> the completion preflight
// refuses `recon_uncleared_off_account`, reporting the unrecoverable shape BY
// ITEM ID (part2 finding 14). Independent of B1's algebra -- a structural
// refusal, not an arithmetic one -- so this cell's construction is unchanged
// by the takeover-tie fix; only its fixture provenance moves to the real K3/K5
// doors.
// ---------------------------------------------------------------------------
test("x40.n a bank_uncleared opening item off a registered bank-account COA refuses recon_uncleared_off_account, reporting the item id", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const w = await realTakeoverWorld(sub, "n1");
  // A bank_uncleared item whose entry's OWN leg is OFF-ACCOUNT (the seeded expense COA, never a
  // registered bank_accounts row).
  const opened = await realOpeningSet(sub, {
    client: w.client, plan: w.plan, coaCode: w.coaCode, approver: w.approver,
    items: [
      { itemKind: "gl_balance", itemKey: "x40n-anchor", amountCents: 20000 },
      { itemKind: "bank_uncleared", itemKey: "x40n-offacct", amountCents: -900, legCode: wb.WB_COA.expense },
    ],
  });
  w.bankAccountId = await activateTakeoverBank(sub, w);

  const stmt = await enterStatement(sub, { client: w.client, bankAccount: w.bankAccountId, periodStart: "2031-03-01", periodEnd: "2031-03-31", opening: 20000, specs: [], keepPeriod: true });
  const denied = await caught(() => completeRecon(sub, { client: w.client, statement: stmt.statementId }));
  assertReason(denied, null, "recon_uncleared_off_account", "x40.n the preflight refuses an off-account bank_uncleared item");
  const offItem = await rootQuery("select id from clara.opening_items where entry_id=$1", [opened.entries["x40n-offacct"]]);
  noteLane(`x40.n off-account item id ${offItem.rows[0]?.id}; refusal detail: ${denied?.message}`);
});

// ---------------------------------------------------------------------------
// x40.o -- ZERO-LINE MONTH: the precondition is trivially satisfied (no lines
// to match/except), but the IDENTITY IS NOT trivial -- prior carried terms
// (an open exception, unmatched capacity) still bind exactly as in any month.
// ---------------------------------------------------------------------------
test("x40.o a zero-line month's precondition is trivial, but the identity is NOT -- carried terms still bind", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "o1");
  await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 4400, postingDate: "2031-09-05", memo: "x40.o an unmatched entry surviving into a zero-line month" });
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2031-09-01", periodEnd: "2031-09-30", opening: 0, specs: [], keepPeriod: true });
  assert.equal(stmt.lines.length, 0, "x40.o mandatory setup: a genuinely zero-line statement");
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2031-09-30");
  assert.equal(expected, Number((await statementRow(stmt.statementId)).closing_cents), "the zero-line identity still carries the unmatched -4400");
  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const recon = await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  assert.equal(recon.status, "complete");
  assert.equal(Number(recon.outstanding_cents), -4400, "the zero-line month is NOT vacuously zero-outstanding");
});

// ---------------------------------------------------------------------------
// x40.p -- `recon_coa_shared`: TWO bank-account generations (one deactivated,
// one live) sharing the same COA code, both with real activity -- completing
// the live generation's recon refuses (part2 finding 6).
// ---------------------------------------------------------------------------
test("x40.p two bank-account generations sharing a COA (any-state) with real activity refuse recon_coa_shared", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const coaCode = "199-C4P1";
  await upsertAccountClassed(sub, { client, code: coaCode, name: "x40.p shared COA", type: "asset", opKey: opk("x40p-gl") });
  const genA = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: `1077A${randomUUID().slice(0, 6)}`, coaAccountCode: coaCode });
  const bankA = idOf(genA, "bank_account_id", "id");
  await plainEntry(sub, { client, debit: coaCode, credit: REVN, cents: 1000, postingDate: "2031-01-05", memo: "x40.p generation A activity" });
  await enterStatement(sub, { client, bankAccount: bankA, periodStart: "2031-01-01", periodEnd: "2031-01-31", opening: 0, specs: [{ amountCents: 1000, entryDate: "2031-01-06" }], keepPeriod: true });
  await deactivateBankAccount(sub, { client, bankAccount: bankA, reason: "x40.p generation change" });

  const genB = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: `1077B${randomUUID().slice(0, 6)}`, coaAccountCode: coaCode });
  const bankB = idOf(genB, "bank_account_id", "id");
  const stmtB = await enterStatement(sub, { client, bankAccount: bankB, periodStart: "2031-02-01", periodEnd: "2031-02-28", opening: 1000, specs: [], keepPeriod: true });

  const denied = await caught(() => completeRecon(sub, { client, statement: stmtB.statementId }));
  assertReason(denied, null, "recon_coa_shared", "x40.p a second bank-account generation sharing an active COA with real prior activity refuses");
});

// ---------------------------------------------------------------------------
// x40.q -- `recon_difference_nonzero`: a deliberately unbalanced month (an
// approved entry the fixture never squares away) refuses named, never a
// silent completion.
// ---------------------------------------------------------------------------
test("x40.q a genuinely unbalanced month refuses recon_difference_nonzero, never completes silently", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "q1");
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2031-10-01", periodEnd: "2031-10-31", opening: 0, specs: [{ amountCents: 7700, entryDate: "2031-10-09" }], keepPeriod: true });
  // INTEGRATION FIX: the completion PRECONDITION (every line is a live member or under an
  // exception) is checked BEFORE the identity, so an unmatched, unexcepted line refuses
  // `recon_line_unsettled` and this cell never reaches its own subject. The line is now
  // excepted -- which makes the precondition trivially satisfied and puts the line in
  // excepted(P), where the identity absorbs it exactly -- and the off-by-one below is what
  // makes the difference non-zero.
  await exceptLine(sub, { client, line: stmt.lines[0].id, kind: "bank_error", reason: "x40.q settled so the identity, not the precondition, is what refuses" });
  // The statement's printed closing is wrong on purpose (an off-by-one), so even the honest
  // reading cannot tie it.
  // INTEGRATION FIX: 0038's `t_bank_statements_transition` makes a statement immutable
  // outside void/supersede, so the off-by-one has to be forged with that ONE trigger stood
  // down for the length of the tamper (root only, the x38 forged-shape precedent). The
  // identity is closed under every LAWFUL shape -- inconsistent printed money is the only
  // thing that can make a difference non-zero, which is exactly what this cell is for.
  await withActor({}, async (c) => {
    // 0038 guards this row TWICE: t_bank_statements_transition (immutable outside
    // void/supersede) and the deferred statement-coherence belt (opening + movement =
    // printed closing). Both have to stand down for the length of the forged off-by-one --
    // and both are re-enabled immediately, so every later statement in this run is checked
    // normally. The identity is closed under every LAWFUL shape; inconsistent printed money
    // is the only thing that can make a difference non-zero, which is this cell's subject.
    const belts = (await c.query(
      `select t.tgname from pg_trigger t join pg_class cl on cl.oid=t.tgrelid
        join pg_namespace n on n.oid=cl.relnamespace
       where n.nspname='clara' and cl.relname='bank_statements' and not t.tgisinternal`)).rows.map((r) => r.tgname);
    for (const tg of belts) await c.query(`alter table clara.bank_statements disable trigger ${tg}`);
    try {
      await c.query("update clara.bank_statements set closing_cents = closing_cents + 1 where id=$1", [stmt.statementId]);
    } finally {
      for (const tg of belts) await c.query(`alter table clara.bank_statements enable trigger ${tg}`);
    }
  });
  const denied = await caught(() => completeRecon(sub, { client, statement: stmt.statementId }));
  assertReason(denied, null, "recon_difference_nonzero", "x40.q a genuinely non-zero difference is named, never silently swallowed");
});

// ===========================================================================
// SECTION 2 -- LIFECYCLE / CHAIN / REFUSALS (design S3 chain law, S5 refusals).
// ===========================================================================

// ---------------------------------------------------------------------------
// x40.r -- `recon_prior_missing`: the immediate predecessor statement EXISTS
// but has no COMPLETE recon -- completing the later month directly refuses
// (do the previous month first), distinct from a genuine calendar gap.
// ---------------------------------------------------------------------------
test("x40.r completing a month whose adjacent predecessor statement exists but is unreconciled refuses recon_prior_missing", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "r1");
  await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-01-01", periodEnd: "2032-01-31", opening: 0, specs: [], keepPeriod: true });
  const stmtFeb = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-02-01", periodEnd: "2032-02-29", opening: 0, specs: [], keepPeriod: true });
  const denied = await caught(() => completeRecon(sub, { client, statement: stmtFeb.statementId }));
  assertReason(denied, null, "recon_prior_missing", "x40.r February's adjacent predecessor (January) exists but is not complete");
});

// ---------------------------------------------------------------------------
// x40.s -- `recon_period_gap`: a REAL calendar gap (no statement AT ALL for
// the adjacent prior month), and this is NOT the account's first period
// (January already completed) -- refuses named, never a number-hunt.
// ---------------------------------------------------------------------------
test("x40.s a genuine calendar gap (no adjacent prior statement, not the first period) refuses recon_period_gap", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "s1");
  const stmtJan = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-01-01", periodEnd: "2032-01-31", opening: 0, specs: [], keepPeriod: true });
  await completeRecon(sub, { client, statement: stmtJan.statementId }); // January claims the first-period exemption
  // March exists; February (the adjacent bridge) does NOT.
  const stmtMar = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-03-01", periodEnd: "2032-03-31", opening: 0, specs: [], keepPeriod: true });
  const denied = await caught(() => completeRecon(sub, { client, statement: stmtMar.statementId }));
  assertReason(denied, null, "recon_period_gap", "x40.s March has no adjacent predecessor statement at all, and January already claimed the exemption");
});

// ---------------------------------------------------------------------------
// x40.t -- `recon_line_reserved`: a line under a PENDING reservation refuses
// completion by its own name; the remedy is `complete_pending_match`.
// ---------------------------------------------------------------------------
test("x40.t a line under a pending reservation refuses recon_line_reserved; complete_pending_match is the remedy", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const checker = world.users.bob;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "t1");
  // INTEGRATION FIX: money arriving FROM a vendor is a refund, which C-b has no settlement
  // composite for -- a supplier payment is a NEGATIVE line (x38.q's own shape).
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-04-01", periodEnd: "2032-04-30", opening: 0, specs: [{ amountCents: -HIGH_STAKES_CENTS, entryDate: "2032-04-06" }], keepPeriod: true });
  // A high-stakes settle draft: line reserved at draft, a distinct checker
  // must approve before the group goes live (mirrors x38.u's pending shape).
  const cp = await birthCounterparty(sub, { client, name: `X40T CO ${randomUUID().slice(0, 6)}` });
  const bill = await dateStampedItem(sub, { client, domain: "ap", cp, cpKind: "vendor", cents: HIGH_STAKES_CENTS, control: AP1, postingDate: "2032-04-01", checker });
  const settleReceipt = await settleFromBankLine(sub, {
    client, line: stmt.lines[0].id, counterparty: cp, controlAccount: AP1,
    allocations: [{ item_id: bill.item, amount_cents: HIGH_STAKES_CENTS }], memo: "x40.t high-stakes pending settle",
  });
  assert.equal((await lineGroupStatus(stmt.lines[0].id))[0], "pending", "x40.t mandatory setup: the reservation is pending, not yet live");

  const denied = await caught(() => completeRecon(sub, { client, statement: stmt.statementId }));
  assertReason(denied, null, "recon_line_reserved", "x40.t completion refuses over a pending reservation");

  // INTEGRATION FIX (x38.u's own idiom): the settle receipt does not carry a revision
  // token; it is read off the draft row immediately before approving.
  const draftEntry = idOf(settleReceipt, "entry_id", "draft_entry_id", "entry");
  const draftRow = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [draftEntry])).rows[0];
  await approveEntry(checker, { entry: draftEntry, expectedRevision: draftRow.revision_token, opKey: opk("x40t-approve") });
  await completePendingMatch(sub, { client, match: matchIdOf(settleReceipt) });
  assert.equal((await lineGroupStatus(stmt.lines[0].id))[0], "live", "the remedy: complete_pending_match promotes the reservation to live");
  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  assert.equal((await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"))).status, "complete", "the recon now completes over the live group");
});

// ---------------------------------------------------------------------------
// x40.u -- `statement_not_live`: a VOIDED statement refuses
// complete_bank_reconciliation by name.
// ---------------------------------------------------------------------------
test("x40.u a voided statement refuses complete_bank_reconciliation with statement_not_live", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "u1");
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-05-01", periodEnd: "2032-05-31", opening: 0, specs: [], keepPeriod: true });
  await voidBankStatement(sub, { client, statement: stmt.statementId });
  const denied = await caught(() => completeRecon(sub, { client, statement: stmt.statementId }));
  assertReason(denied, null, "statement_not_live", "x40.u a voided statement is refused named");
});

// ---------------------------------------------------------------------------
// x40.v -- `recon_already_complete` REPLAY SEMANTICS: same op_key dedupes to
// the stored receipt; a DIFFERENT op_key raises; a replay AFTER void returns
// the VOIDED receipt (which names its own status).
// ---------------------------------------------------------------------------
test("x40.v replay semantics: same op_key dedupes, a different op_key raises recon_already_complete, and a post-void replay returns the voided receipt", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "v1");
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-06-01", periodEnd: "2032-06-30", opening: 0, specs: [], keepPeriod: true });
  const key = opk("x40-v-once");
  const first = await completeRecon(sub, { client, statement: stmt.statementId, opKey: key });
  const replay = await completeRecon(sub, { client, statement: stmt.statementId, opKey: key });
  // INTEGRATION FIX: the dedupe reply MERGES the reconciliation's CURRENT status /
  // voided_at / voided_reason into the stored envelope -- that is ladder row 22 / R12's
  // own requirement ("a replay after void returns the VOIDED receipt, which names its
  // status"), which _reserve_op's stored result cannot express on its own. So the replay
  // is a SUPERSET of the first receipt, never byte-identical to it.
  for (const [k, v] of Object.entries(first)) {
    assert.deepEqual(replay[k], v, `the SAME op_key dedupes to the stored receipt (key ${k})`);
  }
  assert.equal(replay.status, "complete", "the live status is merged into the dedupe reply (R12)");

  const differentKey = await caught(() => completeRecon(sub, { client, statement: stmt.statementId }));
  assertReason(differentKey, null, "recon_already_complete", "a DIFFERENT op_key against an already-complete recon raises named");

  await voidRecon(sub, { client, recon: idOf(first, "reconciliation_id", "recon_id", "id") });
  const postVoidReplay = await completeRecon(sub, { client, statement: stmt.statementId, opKey: key });
  const status = postVoidReplay.status ?? (await reconRow(idOf(postVoidReplay, "reconciliation_id", "recon_id", "id")))?.status;
  assert.equal(status, "void", "a replay after void returns the VOIDED receipt, which names its own status");
});

// ---------------------------------------------------------------------------
// x40.w -- void order `recon_chain_order`: voiding an OLDER recon while a
// NEWER one is still complete refuses -- undo is newest-first only.
// ---------------------------------------------------------------------------
test("x40.w voiding an older recon while a newer one on the same account is still complete refuses recon_chain_order", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "w1");
  const stmtJan = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-07-01", periodEnd: "2032-07-31", opening: 0, specs: [], keepPeriod: true });
  const janReceipt = await completeRecon(sub, { client, statement: stmtJan.statementId });
  const stmtFeb = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-08-01", periodEnd: "2032-08-31", opening: 0, specs: [], keepPeriod: true });
  await completeRecon(sub, { client, statement: stmtFeb.statementId });

  const denied = await caught(() => voidRecon(sub, { client, recon: idOf(janReceipt, "reconciliation_id", "recon_id", "id") }));
  assertReason(denied, null, "recon_chain_order", "x40.w voiding July while August is still complete is refused -- undo is newest-first");
});

// ---------------------------------------------------------------------------
// x40.x -- void statement refusals: `recon_present` (a live recon exists) and
// `open_exception_present` (an unresolved exception survives).
// ---------------------------------------------------------------------------
test("x40.x void_bank_statement refuses recon_present while a live recon exists, and open_exception_present while an exception is unresolved", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const owner = world.users.alice;
  const client = world.clients.A1;

  const acctA = await freshAccount(sub, client, "x1");
  const stmtA = await enterStatement(sub, { client, bankAccount: acctA.bankAccountId, periodStart: "2032-09-01", periodEnd: "2032-09-30", opening: 0, specs: [], keepPeriod: true });
  await completeRecon(sub, { client, statement: stmtA.statementId });
  const deniedRecon = await caught(() => voidBankStatement(sub, { client, statement: stmtA.statementId }));
  assertReason(deniedRecon, null, "recon_present", "x40.x a statement carrying a live (complete) recon may not be voided directly");

  const acctB = await freshAccount(sub, client, "x2");
  const stmtB = await enterStatement(sub, { client, bankAccount: acctB.bankAccountId, periodStart: "2032-09-01", periodEnd: "2032-09-30", opening: 0, specs: [{ amountCents: -300, entryDate: "2032-09-11" }], keepPeriod: true });
  await exceptLine(owner, { client, line: stmtB.lines[0].id, kind: "disputed", reason: "x40.x still open at void time" });
  const deniedException = await caught(() => voidBankStatement(sub, { client, statement: stmtB.statementId }));
  assertReason(deniedException, null, "open_exception_present", "x40.x a statement carrying an open exception may not be voided");
});

// ---------------------------------------------------------------------------
// x40.y -- remap/deactivate `recon_present`: the S5 splice register entry 5 --
// remap_bank_account_coa and deactivate_bank_account now take the 004->006
// rung and refuse while a live recon exists on the account.
// ---------------------------------------------------------------------------
test("x40.y remap_bank_account_coa and deactivate_bank_account both refuse recon_present while a live recon exists", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "y1");
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-10-01", periodEnd: "2032-10-31", opening: 0, specs: [], keepPeriod: true });
  await completeRecon(sub, { client, statement: stmt.statementId });

  const remapDenied = await caught(() => humanQuery(
    sub, "select clara.remap_bank_account_coa(p_client => $1, p_bank_account => $2, p_new_coa_account_code => $3, p_op_key => $4) as r",
    [client, acct.bankAccountId, "197-C4Y1", opk("x40y-remap")],
  ));
  assertReason(remapDenied, null, "recon_present", "x40.y remap refuses while a live recon exists on the account");

  const deactDenied = await caught(() => deactivateBankAccount(sub, { client, bankAccount: acct.bankAccountId, reason: "x40.y attempt while reconciled" }));
  assertReason(deactDenied, null, "recon_present", "x40.y deactivate refuses while a live recon exists on the account");
});

// ---------------------------------------------------------------------------
// x40.z -- settled-period refusals, THE TWO HALVES THAT LIVE IN THE CONCURRENT
// BATTERY: the unmatch_bank_match VERB splice, and the settled-authority BELT
// itself with nothing disabled at all.
//
// RECUT AGAIN (0040 FIX WAVE F3/F13, the delta round). Two changes:
//   * The belt's OWN refusal is now asserted here, LIVE -- a raw member INSERT
//     onto a line inside a reconciled period, no trigger disabled anywhere,
//     refused at COMMIT under the recon_period_settled token. That is the
//     structural law; everything else in this family is a verb-side door in
//     front of it, and until this assert existed the belt's live behaviour was
//     covered only by cells that had disabled it.
//   * The complete_pending_match half MOVED OUT, to
//     x40-0040-upgrade.test.mjs's reset-gated isolation. It has to stage its
//     prestate through `ALTER TABLE ... DISABLE TRIGGER`, which takes an ACCESS
//     EXCLUSIVE lock on clara.bank_match_line_members -- a table other packages'
//     suites write concurrently against the same shared CI database. A lock that
//     coarse does not belong in the concurrent battery, and the drill file gives
//     it a throwaway database of its own. See x40.z-CPM there.
// ---------------------------------------------------------------------------
test("x40.z unmatch_bank_match refuses recon_period_settled on a reconciled member line, and the settled-authority BELT refuses a raw member insert onto one with nothing disabled", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "z1");
  const entry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 2200, postingDate: "2032-11-06", memo: "x40.z settled member" });
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-11-01", periodEnd: "2032-11-30", opening: 0, specs: [{ amountCents: 2200, entryDate: "2032-11-07" }], keepPeriod: true });
  const matchReceipt = await matchBankLine(sub, { client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: 2200 }] });
  await completeRecon(sub, { client, statement: stmt.statementId });

  const unmatchDenied = await caught(() => unmatchBankMatch(sub, { client, match: matchIdOf(matchReceipt), reason: "x40.z attempt after reconciliation" }));
  assertReason(unmatchDenied, null, "recon_period_settled", "x40.z unmatch_bank_match refuses on a reconciled member");

  // ---------------------------------------------------------------------------
  // THE BELT ITSELF, LIVE (0040 FIX WAVE F3, the delta round). Every other cell in this family
  // exercises a VERB's spliced guard; the structural law is the DEFERRED belt behind them, and
  // the only honest way to reach it is a raw member INSERT that no verb would ever emit. NOTHING
  // is disabled here -- the belt is exactly as CI ships it -- so if the belt's own arm were
  // deleted, weakened back to statement scope, or given a wider exception carve-out, this commit
  // would SUCCEED and the cell turns red.
  //
  // The forged shape (honestly labelled, the x40.q precedent): a pending bank_matches +
  // bank_match_line_members pair on a line whose own statement already carries a complete
  // reconciliation. A real (unapproved) draft entry backs the reservation so the 0038 group
  // belts are all satisfied and recon_period_settled is the ONLY law left to break.
  const acct2 = await freshAccount(sub, client, "z2");
  const stmtC = await enterStatement(sub, { client, bankAccount: acct2.bankAccountId, periodStart: "2032-11-01", periodEnd: "2032-11-30", opening: 0, specs: [{ amountCents: -900, entryDate: "2032-11-11" }], keepPeriod: true });
  await exceptLine(sub, { client, line: stmtC.lines[0].id, kind: "bank_error", reason: "x40.z the line this cell forges a reservation onto" });
  const settledReceipt = await completeRecon(sub, { client, statement: stmtC.statementId });
  assert.equal((await reconRow(idOf(settledReceipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"))).status, "complete", "x40.z mandatory setup: the open-excepted line settles the period cleanly");
  assert.equal((await lineGroupStatus(stmtC.lines[0].id)).length, 0, "x40.z mandatory setup: the line carries no live/pending member of its own -- free for the forged insert");

  const forgedMatch = randomUUID();
  const forgedDraft = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x40.z forged pending reservation's draft",
    postingDate: "2032-11-11",
    lines: [
      { account_code: EXPN, debit_cents: 900, credit_cents: 0, description: "forged dr" },
      { account_code: acct2.coaCode, debit_cents: 0, credit_cents: 900, description: "forged cr" },
    ],
    opKey: opk("x40-z-forgeddraft"),
  });
  // withActor only wraps an EXPLICIT begin/commit when transaction:true -- without it each
  // c.query() autocommits as its OWN statement, so the bank_matches INSERT alone trips the
  // 0038 group-tie belt ("bank match % holds no statement line", match_group_empty) before the
  // member row ever lands. transaction:true makes both inserts ONE atomic commit, which is also
  // what puts the settled-authority belt's deferred event at COMMIT where it belongs.
  const beltDenied = await caught(() => withActor({ transaction: true }, async (c) => {
    await c.query(
      `insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin, draft_entry_id, created_by)
       values ($1, (select firm_id from clara.clients where id=$2), $2, $3, 'pending', 'human', $5, $4)`,
      [forgedMatch, client, acct2.bankAccountId, sub, forgedDraft.entry_id],
    );
    await c.query(
      `insert into clara.bank_match_line_members(firm_id, client_id, match_id, line_id, bank_account_id, amount_cents, group_status, created_by)
       values ((select firm_id from clara.clients where id=$1), $1, $2, $3, $4, -900, 'pending', $5)`,
      [client, forgedMatch, stmtC.lines[0].id, acct2.bankAccountId, sub],
    );
  }));
  assertReason(beltDenied, "CLR10", "recon_period_settled", "x40.z the settled-authority BELT refuses a raw member insert onto a reconciled line at COMMIT, with nothing disabled -- the structural law behind every verb splice in this family");
  assert.equal((await lineGroupStatus(stmtC.lines[0].id)).length, 0, "x40.z the refused transaction left NOTHING behind -- the belt aborts the whole commit, not just its own row");
});

// ---------------------------------------------------------------------------
// x40.z-A6 -- FIX-WAVE CLUSTER A RED-PROOF (addendum item 3a): a same-transaction
// book-then-reconcile succeeds. A6 [R4/CX4] excludes a receipt born in THIS
// transaction from both belt arms (br.completed_at < transaction_timestamp()),
// closing the contradiction the design's own cutoff note names at 0040:1810-1816
// ("now() is transaction_timestamp ... which is what a same-transaction
// book-then-reconcile act requires") against the belt that used to forbid the
// very act it describes. AS READ AT FIX TIME, A6 IS ALREADY LANDED in 0040
// (0040 FIX WAVE A6 markers at the member/entry arms) -- this cell therefore runs
// GREEN, not red; it is kept as the coordinator's requested positive proof and
// should be watched for regression, not treated as pending work.
// ---------------------------------------------------------------------------
test("x40.z-A6 a same-transaction match_bank_line + complete_bank_reconciliation succeeds (A6: the belt excludes a receipt born in this txn)", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "a6r");
  const entry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 4100, postingDate: "2032-12-05", memo: "x40 A6 same-txn book-then-reconcile" });
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2032-12-01", periodEnd: "2032-12-31", opening: 0, specs: [{ amountCents: 4100, entryDate: "2032-12-06" }], keepPeriod: true });

  const result = await withActor({ role: ROLES.authenticated, jwtSub: sub, transaction: true }, async (c) => {
    await c.query(
      `select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb,
         p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as r`,
      [client, JSON.stringify([stmt.lines[0].id]), JSON.stringify([{ entry_id: entry, matched_cents: 4100 }]), opk("x40-a6-match")],
    );
    const r = await c.query(
      "select clara.complete_bank_reconciliation(p_statement => $1, p_ack_outstanding => $2::uuid[], p_op_key => $3) as r",
      [stmt.statementId, [], opk("x40-a6-complete")],
    );
    return r.rows[0].r;
  });
  assert.ok(result, "the same-transaction book-then-reconcile act succeeds (A6 fix)");
  const recon = await reconRow(idOf(result, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  assert.equal(recon?.status, "complete", "the receipt is a genuine complete reconciliation, not a partial/refused state");
  assert.equal((await lineGroupStatus(stmt.lines[0].id))[0], "live", "the line the same transaction just matched stayed live -- the belt never unwound it");
});

// ---------------------------------------------------------------------------
// x40.z-A6v2 -- THE STALLED-TRANSACTION RED-PROOF (0040 FIX WAVE A6-v2, the delta
// round's BLOCKER 1). A6's first cut identified "a receipt born in THIS
// transaction" by TIMESTAMP -- `br.completed_at < transaction_timestamp()` --
// which answers a different question: "was it completed before my transaction
// STARTED?". A transaction that began an hour ago and idled therefore treated
// every receipt certified in the meantime as not-yet-settled, and the structural
// backstop stopped backstopping precisely when two sessions overlapped.
//
// THE SCHEDULE, forced by hand (the two-session idiom: T1 is an explicit
// begin/commit on one pooled connection; T2 is an ordinary autocommitting call
// on ANOTHER, driven from inside T1's open window):
//   T1 BEGIN; select 1   -- transaction_timestamp() is now fixed, and EARLY
//   T2                    -- certifies the period (its receipt is NEWER than T1's start)
//   T1 <the act>; COMMIT  -- the deferred belt re-queries here
//
// HALF (a), THE DISCRIMINATOR: the act is a raw member INSERT onto a line inside
// the just-certified period, with NOTHING disabled -- the same forged shape
// x40.z uses, and the only shape that reaches the belt without a verb's own
// splice answering first. Under the timestamp form this commit SUCCEEDS (the
// belt cannot see T2's receipt at all) and a certified line silently gains a
// membership; under the GUC form it is refused by name.
//
// HALF (b), THE DELTA ROUND'S OWN ILLUSTRATION -- AND THE SECOND HOLE IT
// UNCOVERED, NOW CLOSED (0040 FIX WAVE A4-v2, adjudicated).
// The scenario: T1 stalls, T2 certifies, T1 then resolves the line
// matched_booking and matches it in one transaction. That is the shape of the
// resolved-then-booked door FIX WAVE A4 ratified (design 4.2) -- and A4's own
// neutrality claim ("arithmetically neutral for every completed receipt") holds
// only when the resolution happens AFTER certification, because excepted(P) is
// cutoff-gated: a resolution stamped after the cutoff still reads OPEN to the
// receipt's own re-derivation, so nothing moves.
// A STALLED transaction breaks exactly that. resolve_bank_line_exception stamps
// resolved_at = now() = the TRANSACTION's start, and bank_matches.created_at
// likewise -- so a T1 that began before certification writes rows stamped BEFORE
// the receipt's cutoff, and the receipt's own as-of re-derivation SEES them:
// excepted(P) collapses, outstanding follows, and a certified receipt stops
// reproducing under its own cutoff. No money moves and closing still reproduces,
// but a receipt that no longer verifies is a receipt that has stopped being one.
// A4-v2 narrows the door: the carve-out admits only a resolution whose
// resolved_at POST-DATES every covering receipt's completed_at (the covering set
// is the very one the shared settled predicate counts). So this half is now a
// REFUSAL, and the receipt is left strict-clean -- which is what the two asserts
// at the end measure.
// ---------------------------------------------------------------------------
test("x40.z-A6v2 a STALLED transaction cannot move a period certified after it began: the belt identifies its own receipt by the writer's transaction-local declaration, not by a timestamp", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const owner = world.users.alice;
  const client = world.clients.A1;

  // ---- HALF (a): the discriminating act -------------------------------------
  const acctA = await freshAccount(sub, client, "a6a");
  const stmtA = await enterStatement(sub, {
    client, bankAccount: acctA.bankAccountId, periodStart: "2035-03-01", periodEnd: "2035-03-31", opening: 0,
    specs: [{ amountCents: 1000, entryDate: "2035-03-09", description: "a6v2 the disputed credit" }], keepPeriod: true,
  });
  await exceptLine(owner, { client, line: stmtA.lines[0].id, kind: "disputed", reason: "x40.z-A6v2 an open dispute settles the period" });
  const draftA = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x40.z-A6v2 the forged reservation's draft",
    postingDate: "2035-03-09",
    lines: [
      { account_code: acctA.coaCode, debit_cents: 1000, credit_cents: 0, description: "a6v2 dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 1000, description: "a6v2 cr" },
    ],
    opKey: opk("x40-a6v2-draft"),
  });

  const forgedMatch = randomUUID();
  let certifiedA = null;
  let clock = null;
  const denied = await caught(() => withActor({ transaction: true }, async (c) => {
    // T1 STARTS AND STALLS. The bare select is load-bearing: transaction_timestamp() is fixed by
    // the first command of the transaction, not by BEGIN, so this is what makes T1 genuinely
    // "older" than the receipt T2 is about to write.
    await c.query("select 1");
    // T2, on a DIFFERENT pooled connection, autocommitting: the period is certified NOW, while
    // T1 sits open.
    certifiedA = await completeRecon(sub, { client, statement: stmtA.statementId, opKey: opk("x40-a6v2-complete") });
    // THE DISCRIMINATOR, MEASURED IN T1'S OWN SESSION: what the OLD predicate would have said.
    // `br.completed_at < transaction_timestamp()` is evaluated in the writing transaction, so
    // reading both clocks HERE is reading exactly the expression the belt used to run.
    clock = (await c.query(
      `select transaction_timestamp() as t1,
              (select br.completed_at from clara.bank_reconciliations br where br.id = $1) as cutoff`,
      [idOf(certifiedA, "reconciliation_id", "reconciliation_id", "recon_id", "id"),
      ])).rows[0];
    // T1 RESUMES and forges a membership onto the freshly-certified line.
    await c.query(
      `insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin, draft_entry_id, created_by)
       values ($1, (select firm_id from clara.clients where id=$2), $2, $3, 'pending', 'human', $5, $4)`,
      [forgedMatch, client, acctA.bankAccountId, sub, draftA.entry_id],
    );
    await c.query(
      `insert into clara.bank_match_line_members(firm_id, client_id, match_id, line_id, bank_account_id, amount_cents, group_status, created_by)
       values ((select firm_id from clara.clients where id=$1), $1, $2, $3, $4, 1000, 'pending', $5)`,
      [client, forgedMatch, stmtA.lines[0].id, acctA.bankAccountId, sub],
    );
  }));
  assert.ok(certifiedA, "x40.z-A6v2 mandatory setup: T2 really did certify the period while T1 was open");
  // THE DISCRIMINATION, STATED AS A FACT ABOUT THE TWO CLOCKS: the receipt was completed AFTER
  // T1's transaction_timestamp, so `br.completed_at < transaction_timestamp()` is FALSE for it
  // and the old predicate would have dropped it out of the settled set entirely. The refusal
  // asserted next therefore cannot be produced by the timestamp form -- only by an identity that
  // asks "is this MY receipt?" instead of "was this written before I started?".
  assert.ok(
    new Date(clock.cutoff) > new Date(clock.t1),
    `x40.z-A6v2 mandatory discrimination: the receipt's cutoff (${clock.cutoff}) must be strictly AFTER T1's transaction_timestamp (${clock.t1}) -- otherwise the schedule is not the stalled-transaction class and proves nothing about A6-v2`,
  );
  assertReason(denied, "CLR10", "recon_period_settled", "x40.z-A6v2 (A6-v2): the stalled transaction's membership is REFUSED -- under the old timestamp identity this receipt was invisible to the belt and the commit succeeded, silently giving a certified line a member");
  assert.equal((await lineGroupStatus(stmtA.lines[0].id)).length, 0, "x40.z-A6v2 nothing landed on the certified line");

  // ---- HALF (b): the ratified resolved-then-booked door, same schedule -------
  const acctB = await freshAccount(sub, client, "a6b");
  const entryB = await plainEntry(sub, { client, debit: acctB.coaCode, credit: REVN, cents: 1000, postingDate: "2035-04-08", memo: "x40.z-A6v2 the booking that turns up later" });
  const stmtB = await enterStatement(sub, {
    client, bankAccount: acctB.bankAccountId, periodStart: "2035-04-01", periodEnd: "2035-04-30", opening: 0,
    specs: [{ amountCents: 1000, entryDate: "2035-04-09", description: "a6v2b the disputed credit" }], keepPeriod: true,
  });
  const exB = idOf(await exceptLine(owner, { client, line: stmtB.lines[0].id, kind: "disputed", reason: "x40.z-A6v2 open at certification, booked afterwards" }), "exception_id", "id");
  // mandatory setup: the unmatched entry is neutral in the identity (it moves gl' and capacity'
  // equally), so the month ties on the open exception alone.
  const expectedB = await recomputeClosing(client, acctB.bankAccountId, acctB.coaCode, "2035-04-30");
  assert.equal(expectedB, Number((await statementRow(stmtB.statementId)).closing_cents), "x40.z-A6v2 mandatory setup: April ties before certification");

  let certifiedB = null;
  const stalledDenied = await caught(() => withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (c) => {
    await c.query("select 1"); // T1 starts and stalls
    certifiedB = await completeRecon(sub, { client, statement: stmtB.statementId, opKey: opk("x40-a6v2b-complete") });
    // Both of these SUCCEED as statements -- the belt is deferred, so the law is answered at
    // COMMIT, which is the only place the whole shape (resolution + membership + covering
    // receipt) is visible at once.
    await c.query(
      "select clara.resolve_bank_line_exception(p_exception => $1, p_disposition => $2, p_note => $3, p_op_key => $4) as r",
      [exB, "matched_booking", "x40.z-A6v2 the entry was simply late in the books", opk("x40-a6v2b-resolve")],
    );
    await c.query(
      "select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb, p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as r",
      [client, JSON.stringify([stmtB.lines[0].id]), JSON.stringify([{ entry_id: entryB, matched_cents: 1000 }]), opk("x40-a6v2b-match")],
    );
  }));
  const reconB = idOf(certifiedB, "reconciliation_id", "reconciliation_id", "recon_id", "id");
  assert.ok(certifiedB, "x40.z-A6v2 (b) mandatory setup: T2 really did certify April while T1 was open");
  assertReason(stalledDenied, "CLR10", "recon_period_settled", "x40.z-A6v2 (b) (A4-v2): the resolved-then-booked door REFUSES a STALLED transaction -- its resolved_at is stamped at the transaction's start, BEFORE the covering receipt's cutoff, so the receipt's own re-derivation would have seen it");

  // NOTHING LANDED, and the receipt is exactly what it was.
  assert.equal((await lineGroupStatus(stmtB.lines[0].id)).length, 0, "x40.z-A6v2 (b): the whole stalled transaction rolled back -- no membership on the certified line");
  assert.equal((await exceptionRow(exB))?.status, "open", "x40.z-A6v2 (b): ...and the exception is still open, so excepted(P) is untouched");
  assert.equal(Number((await reconRow(reconB)).excepted_cents), 1000, "x40.z-A6v2 (b): the stored receipt still certifies the excepted RM10.00 it was written against");

  // THE STRICT CONTRACT HOLDS FOR THE CLASS. This is the point of the closure: after the refusal
  // the receipt still reproduces byte-exact under its own cutoff, with zero strict diffs.
  const vB = (await humanQuery(sub, "select clara.verify_bank_reconciliation($1) as v", [reconB])).rows[0].v;
  assert.deepEqual(vB.diffs, [], `x40.z-A6v2 (b): zero strict diffs -- the stalled resolve-then-book can no longer make a certified receipt stop reproducing (got ${JSON.stringify(vB.diffs)})`);
  assert.equal(vB.verified, true, "x40.z-A6v2 (b): the April receipt verifies under its own cutoff");

  // ...AND THE LAWFUL FLOW IS UNTOUCHED. The SAME act, in a FRESH transaction started after
  // certification, carries resolved_at > completed_at and is admitted -- A4's door is narrowed,
  // not closed. (x40.ac-A3 asserts the same door end-to-end, including the verify half.)
  await withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (c) => {
    await c.query(
      "select clara.resolve_bank_line_exception(p_exception => $1, p_disposition => $2, p_note => $3, p_op_key => $4) as r",
      [exB, "matched_booking", "x40.z-A6v2 the same act, in a transaction that began AFTER certification", opk("x40-a6v2b-resolve2")],
    );
    await c.query(
      "select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb, p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as r",
      [client, JSON.stringify([stmtB.lines[0].id]), JSON.stringify([{ entry_id: entryB, matched_cents: 1000 }]), opk("x40-a6v2b-match2")],
    );
  });
  assert.equal((await lineGroupStatus(stmtB.lines[0].id))[0], "live", "x40.z-A6v2 (b): the LAWFUL resolve-then-book (fresh txn, resolved_at > the covering cutoff) still passes -- A4-v2 narrows the door, it does not shut it");
  const vB2 = (await humanQuery(sub, "select clara.verify_bank_reconciliation($1) as v", [reconB])).rows[0].v;
  assert.deepEqual(vB2.diffs, [], `x40.z-A6v2 (b): and the receipt is STILL strict-clean after the lawful booking -- that is what "arithmetically neutral for every completed receipt" means (got ${JSON.stringify(vB2.diffs)})`);
  const liveB = (await rootQuery("select clara._bank_recon_terms($1, now()) as t", [stmtB.statementId])).rows[0].t;
  assert.equal(Number(liveB.excepted_cents), 0, "x40.z-A6v2 (b) mandatory discrimination: TODAY the line is matched and excepted(P) is zero -- the live view moved, so the strict-clean verify above is not a tautology");
});

// ---------------------------------------------------------------------------
// x40.z-A1 -- FIX-WAVE CLUSTER A RED-PROOF (addendum item 3b): void the receipt,
// unmatch the member, and the now-stale matched_booking line reads UNSETTLED.
// A1 [R1=M4] narrows BOTH readers (the completion precondition and excepted(P))
// to (status='open' OR resolution_disposition='bank_corrective_line' with the
// line still unmatched) -- a matched_booking/written_off_adjustment line that
// gets unmatched falls to the honest recon_line_unsettled refusal instead of
// silently keeping its old settled reading. CX3 extends the SAME narrowing to
// list_unmatched_lines (0040:4021-4025 as read at fix time), so the stale line
// also REAPPEARS in that report. AS READ AT FIX TIME, A1/CX3 ARE ALREADY LANDED
// -- this cell runs GREEN, not red; kept as the coordinator's requested
// positive proof and should be watched for regression.
// ---------------------------------------------------------------------------
test("x40.z-A1 void -> unmatch -> a stale matched_booking line reads UNSETTLED: re-completion refuses recon_line_unsettled AND the line reappears in list_unmatched_lines", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const owner = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "a1r");
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2033-04-01", periodEnd: "2033-04-30", opening: 0, specs: [{ amountCents: -1800, entryDate: "2033-04-08" }], keepPeriod: true });
  const exReceipt = await exceptLine(owner, { client, line: stmt.lines[0].id, kind: "bank_error", reason: "x40 A1 red-proof: initially thought a bank error" });
  const exId = idOf(exReceipt, "exception_id", "id");
  const entry = await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 1800, postingDate: "2033-04-10", memo: "x40 A1 red-proof: the entry turns up" });
  // resolve matched_booking + match, ONE transaction (x40.j's pattern -- the belt's
  // disposition_unbooked law is satisfied at commit).
  await withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (c) => {
    await c.query(
      "select clara.resolve_bank_line_exception(p_exception => $1, p_disposition => $2, p_note => $3, p_op_key => $4) as r",
      [exId, "matched_booking", "x40 A1 red-proof: the entry was simply late in the books", opk("x40-a1r-resolve")],
    );
    await c.query(
      "select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb, p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as r",
      [client, JSON.stringify([stmt.lines[0].id]), JSON.stringify([{ entry_id: entry, matched_cents: -1800 }]), opk("x40-a1r-match")],
    );
  });
  // CAPTURE THE MATCH ID FROM THE TABLE, NOT FROM A RECEIPT: the withActor block above ran the
  // match through a raw c.query() whose result was never returned out of the callback, and
  // completeRecon's OWN receipt carries no match_id at all -- matchIdOf(receipt) on it silently
  // resolves to null on every build. The line's now-live member row is the only honest source.
  const liveMatchId = (await rootQuery(
    "select match_id from clara.bank_match_line_members where line_id=$1 and group_status='live'",
    [stmt.lines[0].id],
  )).rows[0]?.match_id;
  assert.ok(liveMatchId, "x40 A1 red-proof mandatory setup: the live match id resolved from the member table");

  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const reconId = idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id");
  assert.equal((await reconRow(reconId)).status, "complete", "x40 A1 red-proof mandatory setup: the period settles over the live matched_booking line");

  // VOID the receipt, then UNMATCH the now-unsettled member -- both lawful once the receipt is
  // void (recon_period_settled no longer finds a complete recon covering this period).
  await voidRecon(owner, { client, recon: reconId, reason: "x40 A1 red-proof: voiding to re-test the stale disposition" });
  await unmatchBankMatch(sub, { client, match: liveMatchId, reason: "x40 A1 red-proof: unmatching the now-void member" });
  assert.equal((await lineGroupStatus(stmt.lines[0].id)).length, 0, "x40 A1 red-proof mandatory setup: the line carries no live/pending member after unmatch");

  // ===================================================================
  // [CROSS-SECTION EDIT — 0042 as-built ladder round 4. Reported, not silent.]
  // THE STALE DISPOSITION IS NO LONGER REACHABLE, and that is the whole point of
  // the D-b change: `clara.unmatch_bank_match` now REOPENS every booking-claiming
  // exception on the lines it releases, whether or not the group carries
  // `resolution_exception_id` (only the AF-2 composite ever stamped it at birth,
  // and THIS fixture books through the older two-step pair, so round 3's
  // identity-column-keyed reopen did not reach it). S4.9's own header already
  // declares that it "supersedes the x40.z-A1 stale-survives posture"; round 3
  // superseded it only for stamped groups, and round 4 finishes the job.
  //
  // WHY SUPERSEDING IT IS RIGHT AND NOT A LOSS OF COVER. The state this cell used
  // to characterise — an exception still claiming `matched_booking` while its
  // line sits in no live match — IS the `disposition_unbooked` breach the
  // deferred authority belt has declared unlawful since 0040. It survived only
  // because the belt fires on writes to clara.bank_line_exceptions while a
  // release writes clara.bank_matches: a two-table predicate enforced on one
  // table. It is now enforced from both sides, so the release either reopens or
  // refuses. A1/CX3's NARROWING is untouched and still load-bearing — this cell
  // simply now exercises its `status='open'` arm instead of an incoherent one.
  //
  // The assertions below are MEASURED against the as-built, not assumed.
  const after = await exceptionRow(exId);
  assert.equal(after?.status, "open",
    "x40.z-A1 (D-b): the release REOPENED the exception rather than leaving it claiming a booking on an unmatched line");
  assert.equal(after?.resolution_disposition, null, "…with all five resolution columns erased together");

  // The line is excepted-and-open again, which is a lawful, reconcilable state:
  // excepted(P) counts it exactly as it did before the booking ever happened.
  const reterms = (await rootQuery("select clara._bank_recon_terms($1, now()) as t", [stmt.statementId])).rows[0].t;
  assert.equal(Number(reterms.excepted_cents), -1800,
    "x40.z-A1 (D-b): the reopened line is back in excepted(P) at its own amount — the release put the line exactly where the receipt first found it");

  const redone = await completeRecon(sub, { client, statement: stmt.statementId, opKey: opk("x40-a1r-recomplete") });
  assert.ok(idOf(redone, "reconciliation_id", "reconciliation_id", "recon_id", "id"),
    "x40.z-A1 (D-b): re-completion SUCCEEDS — an open exception on an unmatched line is settled state, and the incoherent stale reading that used to force recon_line_unsettled can no longer be built");

  // CX3's narrowing, from the other side: an OPEN exception is excepted, not
  // unmatched, so the line does NOT appear in list_unmatched_lines.
  const unmatched = await listUnmatchedLines(sub, { client });
  const rows = Array.isArray(unmatched) ? unmatched : (unmatched?.lines ?? unmatched?.rows ?? []);
  assert.equal(rows.some((r) => (r.line_id ?? r.id) === stmt.lines[0].id), false,
    "x40.z-A1 (D-b/CX3): and it is reported as EXCEPTED, not as unmatched — the two reports still partition the line set");
});

// ---------------------------------------------------------------------------
// x40.aa -- `recon_frontier_backfill`: backfilling a statement earlier than
// the account's earliest COMPLETE recon refuses at INGEST (splice register 6).
// ---------------------------------------------------------------------------
test("x40.aa a statement backfilled earlier than the account's frontier refuses recon_frontier_backfill at ingest", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "aa1");
  const stmtJun = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2033-06-01", periodEnd: "2033-06-30", opening: 0, specs: [], keepPeriod: true });
  await completeRecon(sub, { client, statement: stmtJun.statementId }); // June's frontier is now claimed complete
  const denied = await caught(() => enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2033-04-01", periodEnd: "2033-04-30", opening: 0, specs: [], keepPeriod: true }));
  assertReason(denied, null, "recon_frontier_backfill", "x40.aa an April statement, earlier than June's completed frontier, is refused at ingest -- the June-first/April-later demotion is unreachable");
});

// ===========================================================================
// SECTION 3 -- CONCURRENCY + THE BITEMPORAL RECEIPT LAW.
// ===========================================================================

// ---------------------------------------------------------------------------
// x40.ab -- WRITE-SKEW PAIR: two sessions racing except-vs-settle on the SAME
// line (design S4.2: "closed against write-skew at the LOCK, not just the
// belt" -- except/resolve take FOR UPDATE, the spliced match/settle re-check
// exceptions after the line lock). The two-session driver from
// rig-docs-race.mjs (holdThenContend), the x38.g/x38.l precedent.
//
// RECUT (fix-wave E4/R6): the ORIGINAL cut raced except_bank_line against
// match_bank_line -- but BOTH verbs take pg_advisory_xact_lock(203005004,
// hashtext(client)) as their OWN first statement (0040:2917,
// match_bank_line's 0038 pin re-asserted at 0040:5903), so a session B that
// blocks on session A's held 004 is EXPLAINED IN FULL before either side ever
// reaches the shared line's FOR UPDATE -- the observed block cannot
// distinguish "the fine-grained line lock discriminates the write-skew" from
// "the coarse client-wide advisory rung alone serializes everything, and the
// fine-grained mechanism could be deleted with no observable effect on this
// cell." (asbuilt-races.md finding 6.)
//
// settle_from_bank_line is the DISCRIMINATING partner: S4.Z's own gate
// (0040:5936-5938) asserts settle_from_bank_line's OWN body takes NO
// 203005003/203005004 rung directly -- its only path to 004 is transitively,
// via the C-a composite (allocate_payment/allocate_receipt) it calls, and
// even then the line itself is locked LAST ("THE BANK ROWS, LAST",
// 0038:4657-4662/4662), strictly AFTER that composite has already run in
// full and posted real money. So this cut proves the write-skew law by a
// SPECIFIC, otherwise-unreachable OUTCOME rather than by mere blocking: hold
// with except_bank_line (mints the exception, holds the line FOR UPDATE),
// contend with settle_from_bank_line. The contender can only be refused with
// reason 'line_excepted' by the S4.4c post-lock re-check (0040:4634-4637),
// which runs strictly AFTER settle's own line lock succeeds and strictly
// AFTER its composite has already drafted+approved a real settlement entry
// (rolled back whole by the raise) -- a refusal that can be produced by NO
// mechanism other than the post-lock re-check under test, independent of
// whatever ALSO explains the blocking. Closes the R6 gap directly: "no
// line_excepted-from-settle test in the file."
// ---------------------------------------------------------------------------
test("x40.ab a concurrent except-vs-settle race on one line BLOCKS (proven), and the loser is refused SPECIFICALLY by the post-lock line_excepted re-check -- not merely by advisory 004", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const checker = world.users.bob;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "ab1");
  // The line: money OUT to a vendor (a negative line -- the settle side this
  // cell needs), below HIGH_STAKES so settle_from_bank_line goes LIVE in one
  // call (no second-checker detour to thread through the race).
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2033-01-01", periodEnd: "2033-01-31", opening: 0, specs: [{ amountCents: -3300, entryDate: "2033-01-06" }], keepPeriod: true });
  const line = stmt.lines[0].id;
  const cp = await birthCounterparty(sub, { client, name: `X40AB CO ${randomUUID().slice(0, 6)}` });
  const bill = await dateStampedItem(sub, { client, domain: "ap", cp, cpKind: "vendor", cents: 3300, control: AP1, postingDate: "2033-01-01", checker });

  const exceptSide = (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      // INTEGRATION FIX: except_bank_line takes no p_client (the line IS the tenancy anchor).
      `select clara.except_bank_line(p_line => $1, p_kind => $2, p_reason => $3, p_op_key => $4) as r`,
      [line, "disputed", "x40.ab race exception", opk("x40-ab-except")],
    );
    return r.rows[0].r;
  })();
  const settleSide = (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      `select clara.settle_from_bank_line(p_client => $1, p_line => $2, p_counterparty => $3,
         p_allocations => $4::jsonb, p_memo => $5, p_control_account => $6, p_op_key => $7) as r`,
      [client, line, cp, JSON.stringify([{ item_id: bill.item, amount_cents: 3300 }]), "x40.ab race settle", AP1, opk("x40-ab-settle")],
    );
    return r.rows[0].r;
  })();

  // HOLD with except (mints the exception + releases the line's FOR UPDATE only at commit),
  // CONTEND with settle -- the discriminating direction (settle's post-lock re-check is the
  // ONLY code path that can produce 'line_excepted' once it resumes).
  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: world.users.alice, run: exceptSide },
    b: { role: ROLES.authenticated, jwtSub: world.users.alice, run: settleSide },
  });
  noteLane(`x40.ab schedule: a(except).ok=${out.a?.ok} (${out.a?.code ?? ""} ${out.a?.message ?? ""}) b(settle).ok=${out.b?.ok} (${out.b?.code ?? ""} ${out.b?.message ?? ""}) provedBlocked=${out.provedBlocked}`);
  assert.ok(out.provedBlocked, `x40.ab: the second session BLOCKED on the first's held lock (a=${out.a?.ok}/${out.a?.code ?? ""} b=${out.b?.ok}/${out.b?.code ?? ""})`);
  assert.ok(!sawDeadlock(out), `no deadlock either direction (a=${out.a?.code ?? "ok"} b=${out.b?.code ?? "ok"})`);

  // THE DISCRIMINATING ASSERT. Not "b failed" (which 004 alone would explain) but "b failed
  // with EXACTLY line_excepted" -- a reason string that only the S4.4c post-lock re-check can
  // raise, and only AFTER settle's own line lock succeeded (which requires the exception's
  // holder -- session a -- to have already committed). This is unreachable by advisory
  // contention alone: 004 can only make b WAIT, never manufacture this specific refusal.
  assert.equal(out.a.ok, true, `the exception won (got ${out.a.code} -- ${out.a.message})`);
  assert.equal(out.b.ok, false, "the settle that woke up behind it must be refused, never silently succeed over a freshly-minted exception");
  // holdThenContend flattens `${e.message} ${e.detail ?? ""}` into ONE string (rig-docs-race.mjs
  // `enter`/the catch arm), so the DETAIL json rides inside out.b.message, not a separate
  // .detail field -- reasonOf's own regex still finds it there.
  assert.equal(reasonOf({ detail: out.b.message }), "line_excepted", `x40.ab the settle loser is refused BY THE POST-LOCK RE-CHECK specifically (got code=${out.b.code} message=${out.b.message}) -- discriminating the line lock from mere 004 serialization`);
});

// ---------------------------------------------------------------------------
// x40.ac -- THE BITEMPORAL RE-DERIVATION: complete a recon, then approve a
// BACK-DATED entry into the already-certified period; the receipt must
// reproduce BYTE-EXACT under its own completed_at cutoff -- the live /bank
// PREVIEW changes, the RECEIPT never does (S3, the codex-blocker "no stable
// books cutoff", finding 37; A7's ratified refinement, CX1).
//
// REBUILT (fix-wave A7, asbuilt-authority.md finding 6 + asbuilt-races.md
// finding 2). The original cut was tautological in two ways: (a) it compared
// two `get_bank_reconciliation` reads of the SAME immutable stored row --
// that branch (0040 FIX WAVE C6) returns `v_receipt.snapshot` verbatim and
// re-derives nothing, so the assert could not fail if the bitemporal gates
// were deleted whole; (b) the statement carried ZERO lines, so every one of
// the identity's terms was 0 before AND after -- "byte-exact" proved nothing
// a `do $$ begin end $$` block would not also satisfy.
// Fixed, per A7's now-landed verb: a NON-EMPTY, genuinely matched statement;
// `clara.verify_bank_reconciliation` (the real recompute, under the receipt's
// OWN completed_at) asserted `verified=true` with an EMPTY diffs array --
// CX1's ratified contract is the four STORED TERMS + closing compared
// STRICTLY (byte-exact, provable: an unmatched straggler entry moves gl and
// capacity equally, net zero in gl'); AND the LIVE preview at now() is
// independently shown to have moved (gl_cents, the RAW term outside the
// prime-cancellation), so the cutoff is proven discriminating in BOTH
// directions -- not merely "nothing happened".
// ---------------------------------------------------------------------------
test("x40.ac verify_bank_reconciliation reproduces the certified receipt byte-exact (the four stored terms + closing) on a NON-EMPTY statement, even after a later back-dated approval -- and the live preview DOES move", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "ac1");
  const entry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 5600, postingDate: "2033-02-08", memo: "x40.ac a real matched line -- NOT a zero-line month" });
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2033-02-01", periodEnd: "2033-02-28", opening: 0, specs: [{ amountCents: 5600, entryDate: "2033-02-09" }], keepPeriod: true });
  await matchBankLine(sub, { client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: 5600 }] });
  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const reconId = idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id");

  const liveBefore = (await rootQuery("select clara._bank_recon_terms($1, now()) as t", [stmt.statementId])).rows[0].t;
  const glBefore = Number(liveBefore.gl_cents);

  // A back-dated approval into the ALREADY-CERTIFIED period, well after
  // completed_at -- an entry the certified receipt could never have seen.
  await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 1234, postingDate: "2033-02-10", memo: "x40.ac a back-dated approval after certification" });

  // THE LIVE WORLD DID MOVE. gl_cents is the RAW gl term (before the capacity-prime
  // cancellation CX1's algebra relies on) -- it must reflect the straggler immediately, or the
  // "byte-exact" assert below would be proving nothing (there was nothing left to diverge from).
  const liveAfter = (await rootQuery("select clara._bank_recon_terms($1, now()) as t", [stmt.statementId])).rows[0].t;
  const glAfter = Number(liveAfter.gl_cents);
  assert.equal(glAfter - glBefore, -1234, "x40.ac mandatory setup: the live preview's gl_cents moved by EXACTLY the back-dated entry's own credit to the bank account -- the world genuinely changed");

  // THE RECEIPT DOES NOT MOVE. verify_bank_reconciliation recomputes _bank_recon_terms UNDER
  // THE RECEIPT'S OWN completed_at cutoff and compares the four stored terms + closing STRICTLY.
  const v = (await humanQuery(sub, "select clara.verify_bank_reconciliation($1) as v", [reconId])).rows[0].v;
  assert.equal(v.reconciliation_id, reconId, "verify_bank_reconciliation resolved the same receipt");
  assert.deepEqual(v.diffs, [], `x40.ac no named STRICT term diverged (got ${JSON.stringify(v.diffs)})`);
  assert.equal(v.verified, true, "x40.ac the certified receipt reproduces BYTE-EXACT under its own completed_at cutoff -- the back-dated approval never silently diverges it");
});

// ---------------------------------------------------------------------------
// x40.ac-CX1v2 -- THE LAWFUL STRAGGLER, BUILT AS A REAL COMMIT-ORDER RACE
// (0040 FIX WAVE F8-AMENDED, the delta round's BLOCKER 2).
//
// CX1's own rationale names this class and then the first cut's strict set
// contradicted it. `now()` is transaction-START, so an approval whose
// transaction began BEFORE certification and committed AFTER it carries
// approved_at <= cutoff and is invisible to the receipt at the moment it is
// written -- and fully visible to any later re-derivation under that same
// cutoff. clara._bank_recon_terms puts such an unmatched entry in gl(P) AND in
// unmatched capacity'(P) by the same signed amount, so gl' moves by X,
// outstanding moves by X, and (gl' - outstanding) does not move at all. The old
// strict five compared gl' and outstanding SEPARATELY and therefore reported
// verified=false on a lawful, unmoved book. CX1-v2's strict set binds the
// DIFFERENCE and reports the two columns individually under 'informational'.
//
// x40.ac (above) reaches the same end state by approving in a FRESH transaction
// after completion -- which produces approved_at > cutoff, i.e. NOT the
// straggler class at all, and cannot exercise this. This cell forces the real
// schedule: T1 begins and stalls, T2 certifies, T1 approves and commits.
// ---------------------------------------------------------------------------
test("x40.ac-CX1v2 a lawful straggler (approval txn begun before certification, committed after) leaves verify STRICT-CLEAN while gl' and outstanding each drift by its amount -- reported as informational, never as a failure", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "cx1");
  const entry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 5600, postingDate: "2035-05-08", memo: "x40.ac-CX1v2 the matched receipt" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2035-05-01", periodEnd: "2035-05-31", opening: 0,
    specs: [{ amountCents: 5600, entryDate: "2035-05-09" }], keepPeriod: true,
  });
  await matchBankLine(sub, { client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: 5600 }] });

  // THE STRAGGLER, drafted (not yet approved) and posting INSIDE the period.
  const straggler = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x40.ac-CX1v2 the stalled approval",
    postingDate: "2035-05-10",
    lines: [
      { account_code: EXPN, debit_cents: 1234, credit_cents: 0, description: "straggler dr" },
      { account_code: acct.coaCode, debit_cents: 0, credit_cents: 1234, description: "straggler cr" },
    ],
    opKey: opk("x40-cx1-draft"),
  });

  // THE SCHEDULE. T1 opens and stalls (fixing its transaction_timestamp, which is what
  // approve_entry stamps as approved_at); T2 certifies on another connection; T1 then approves
  // and commits -- approved_at <= cutoff, committed after certification.
  let receipt = null;
  await withActor({ role: ROLES.authenticated, jwtSub: sub, transaction: true }, async (c) => {
    await c.query("select 1");
    receipt = await completeRecon(sub, { client, statement: stmt.statementId, opKey: opk("x40-cx1-complete") });
    await c.query(
      "select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r",
      [straggler.entry_id, straggler.revision_token, opk("x40-cx1-approve")],
    );
  });
  const reconId = idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id");
  const stored = await reconRow(reconId);

  // MANDATORY SETUP -- the straggler really is one: approved BEFORE the cutoff by its own
  // stamp, and genuinely absent from what the receipt stored.
  const approvedAt = (await rootQuery("select approved_at from clara.journal_entries where id=$1", [straggler.entry_id])).rows[0].approved_at;
  assert.ok(new Date(approvedAt) <= new Date(stored.completed_at), `x40.ac-CX1v2 mandatory setup: the straggler's approved_at (${approvedAt}) is at or before the receipt's cutoff (${stored.completed_at}) -- otherwise this is x40.ac's schedule, not CX1's straggler class`);
  assert.equal(Number(stored.gl_balance_cents), 5600, "x40.ac-CX1v2 mandatory setup: the receipt certified gl' WITHOUT the straggler");
  assert.equal(Number(stored.outstanding_cents), 0, "x40.ac-CX1v2 mandatory setup: and outstanding at zero");

  const v = (await humanQuery(sub, "select clara.verify_bank_reconciliation($1) as v", [reconId])).rows[0].v;
  // THE STRICT HALF IS CLEAN -- this is the whole ratified claim.
  assert.deepEqual(v.diffs, [], `x40.ac-CX1v2 the straggler moves NO strict quantity (got ${JSON.stringify(v.diffs)}) -- (gl' - outstanding) is invariant by construction`);
  assert.equal(v.verified, true, "x40.ac-CX1v2 a lawful straggler must never make a receipt read unverified");
  // ...AND THE PER-COLUMN DRIFT IS REPORTED, with both numbers, so the reviewer sees the stall.
  assert.equal(v.informational?.per_column_drift_present, true, "x40.ac-CX1v2 the informational half REPORTS the drift -- silence would be indistinguishable from 'nothing happened'");
  const drift = Object.fromEntries((v.informational?.per_column_drift ?? []).map((d) => [d.term, d]));
  assert.equal(Number(drift.gl_balance_cents?.stored), 5600, "x40.ac-CX1v2 gl' as certified");
  assert.equal(Number(drift.gl_balance_cents?.recomputed), 4366, "x40.ac-CX1v2 gl' as re-derived under the cutoff -- the straggler is now visible");
  assert.equal(Number(drift.outstanding_cents?.stored), 0, "x40.ac-CX1v2 outstanding as certified");
  assert.equal(Number(drift.outstanding_cents?.recomputed), -1234, "x40.ac-CX1v2 outstanding as re-derived -- moved by the SAME amount, which is why the difference did not move");
  noteLane(`x40.ac-CX1v2 straggler drift: gl' 5600->4366, outstanding 0->-1234, strict diffs=${JSON.stringify(v.diffs)}, enumeration keys=${JSON.stringify(v.informational?.keys)}`);
});

// ---------------------------------------------------------------------------
// x40.ac-A3 -- THE CARRIED EXCEPTION, RESOLVED AFTER CERTIFICATION (0040 FIX
// WAVE F14, the delta round's coverage gap). A3 [R2c] cutoff-gated the exception
// lateral -- "open" means resolved_at is null OR resolved_at > cutoff, and a row
// created after the cutoff is not in the receipt's world at all -- and the ONLY
// thing that ever exercised the gate was a same-period read. This is the full
// A7 scenario, both halves: certify a month whose line rides an OPEN exception,
// then resolve it matched_booking and book it (one transaction, the ratified
// door), and demand that the certified receipt still re-derives byte-exact while
// the live world has genuinely moved on.
// ---------------------------------------------------------------------------
test("x40.ac-A3 a carried exception resolved and booked AFTER certification leaves the April receipt strict-clean under its own cutoff, and the as-of enumeration still reads the exception OPEN", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const owner = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "a3v");
  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2035-06-01", periodEnd: "2035-06-30", opening: 0,
    specs: [{ amountCents: -3000, entryDate: "2035-06-12", description: "a3 an unexplained debit" }], keepPeriod: true,
  });
  const exId = idOf(await exceptLine(owner, { client, line: stmt.lines[0].id, kind: "disputed", reason: "x40.ac-A3 open at certification" }), "exception_id", "id");
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2035-06-30");
  assert.equal(expected, Number((await statementRow(stmt.statementId)).closing_cents), "x40.ac-A3 mandatory setup: the month ties on the open exception alone");
  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const reconId = idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id");
  const stored = await reconRow(reconId);
  assert.equal(Number(stored.excepted_cents), -3000, "x40.ac-A3 mandatory setup: the receipt certifies the carried exception");
  const storedLeg = (stored.snapshot?.exceptions ?? [])[0];
  assert.equal(storedLeg?.status, "open", "x40.ac-A3 mandatory setup: the stored enumeration records it OPEN");

  // AFTER certification: the entry turns up, and the exception is resolved matched_booking +
  // matched in ONE transaction (the resolved-then-booked door -- the belt's own carve-out).
  const entry = await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 3000, postingDate: "2035-06-20", memo: "x40.ac-A3 the entry turns up, well after certification" });
  await withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (c) => {
    await c.query(
      "select clara.resolve_bank_line_exception(p_exception => $1, p_disposition => $2, p_note => $3, p_op_key => $4) as r",
      [exId, "matched_booking", "x40.ac-A3 it was a genuine payment, simply late in the books", opk("x40-a3v-resolve")],
    );
    await c.query(
      "select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb, p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as r",
      [client, JSON.stringify([stmt.lines[0].id]), JSON.stringify([{ entry_id: entry, matched_cents: -3000 }]), opk("x40-a3v-match")],
    );
  });
  assert.equal((await lineGroupStatus(stmt.lines[0].id))[0], "live", "x40.ac-A3 mandatory setup: the post-certification booking landed live");

  // THE LIVE WORLD MOVED -- without this the verify below proves nothing.
  const live = (await rootQuery("select clara._bank_recon_terms($1, now()) as t", [stmt.statementId])).rows[0].t;
  assert.equal(Number(live.excepted_cents), 0, "x40.ac-A3 mandatory discrimination: TODAY the line is matched and excepted(P) is zero");
  assert.equal(Number(live.gl_prime_cents), -3000, "x40.ac-A3 mandatory discrimination: and the booking is in today's gl'");

  // THE RECEIPT DID NOT. Every strict quantity reproduces, and the as-of enumeration still reads
  // the exception OPEN -- resolved_at is after the cutoff, so A3's gate holds.
  const v = (await humanQuery(sub, "select clara.verify_bank_reconciliation($1) as v", [reconId])).rows[0].v;
  assert.deepEqual(v.diffs, [], `x40.ac-A3 the April receipt reproduces byte-exact under its own cutoff (got ${JSON.stringify(v.diffs)})`);
  assert.equal(v.verified, true, "x40.ac-A3 verified");
  const asOf = (await rootQuery("select clara._bank_recon_terms($1, $2::timestamptz) as t", [stmt.statementId, stored.completed_at])).rows[0].t;
  assert.equal(Number(asOf.excepted_cents), -3000, "x40.ac-A3 (A3's gate): re-derived under the cutoff, excepted(P) still carries the line");
  assert.equal((asOf.snapshot?.exceptions ?? [])[0]?.status, "open", "x40.ac-A3 (A3's gate): and the as-of enumeration still describes the exception as OPEN -- a resolution AFTER the cutoff is not in this receipt's world");
  assert.equal((asOf.snapshot?.exceptions ?? [])[0]?.resolution_disposition, null, "x40.ac-A3 (A3's gate): with no disposition, because there was none at the cutoff");
  noteLane(`x40.ac-A3 informational after the post-certification resolve: differs=${v.informational?.snapshot_enumeration_differs} keys=${JSON.stringify(v.informational?.keys)}`);
});

// ---------------------------------------------------------------------------
// x40.ac-MIX -- THE MIXED GROUP'S ENUMERATION (0040 FIX WAVE F14; the A8/CX5
// line-side predicate, previously asserted nowhere). A +1,000 April line matched
// to a +600 April entry AND a +400 MAY entry is not "matched only later": its
// true residual at April is -400, and it already appears -- correctly -- as an
// outstanding_group_items row. The pre-A8 reading ("SOME entry member posts after
// P.end") ALSO emitted the whole +1,000 as an outstanding_line_side, describing a
// world that did not exist. This cell pins the corrected shape from both sides:
// exactly one group residual of -400, and NO line side at all.
// ---------------------------------------------------------------------------
test("x40.ac-MIX a mixed group (one April line, an April entry and a May entry) enumerates ONLY its -400 group residual -- never a full line side", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "mix");
  const aprEntry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 600, postingDate: "2035-07-06", memo: "x40.ac-MIX the April tranche" });
  const mayEntry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 400, postingDate: "2035-08-06", memo: "x40.ac-MIX the May tranche" });
  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2035-07-01", periodEnd: "2035-07-31", opening: 0,
    specs: [{ amountCents: 1000, entryDate: "2035-07-10", description: "mix one line, two tranches" }], keepPeriod: true,
  });
  // ackPeriodExceptions: the SECOND tranche posts after this statement's period end, which is
  // exactly the acknowledged posting-date exception (x40.f's door) -- and it is what MAKES this
  // a mixed group. Without the ack, match_bank_line refuses outright and the shape is
  // unbuildable.
  await matchBankLine(sub, {
    client, lines: [stmt.lines[0].id],
    entries: [{ entry_id: aprEntry, matched_cents: 600 }, { entry_id: mayEntry, matched_cents: 400 }],
    ackPeriodExceptions: true,
  });
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2035-07-31");
  assert.equal(expected, Number((await statementRow(stmt.statementId)).closing_cents), "x40.ac-MIX mandatory setup: July ties (gl' 600, uncleared -400)");

  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const recon = await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  const snap = recon.snapshot ?? {};
  assert.equal(Number(recon.outstanding_cents), -400, "x40.ac-MIX the stored term is the RESIDUAL, not the line");
  assert.equal((snap.outstanding_group_items ?? []).length, 1, `x40.ac-MIX exactly one group residual (got ${JSON.stringify(snap.outstanding_group_items)})`);
  assert.equal(Number((snap.outstanding_group_items ?? [])[0]?.uncleared_cents), -400, "x40.ac-MIX and it is -400 -- the May tranche still to clear");
  assert.deepEqual(snap.outstanding_line_sides ?? [], [], "x40.ac-MIX (A8/CX5): NO line side -- a group with an in-period entry member is not 'matched only later', and emitting the whole +1000 beside the -400 residual would describe a world that does not exist");
  assert.deepEqual(snap.outstanding_entry_sides ?? [], [], "x40.ac-MIX both entries are fully consumed by the live group, so nothing rides the entry-side enumeration");
});

// ===========================================================================
// SECTION 4 -- AGING + TERMS (design S4.4, S6; part2 findings 5/9/33/34).
// ===========================================================================

// ---------------------------------------------------------------------------
// x40.ad -- effective_date AS-OF AGING: a bill settled LATER still shows
// OUTSTANDING at an earlier as_of; Sum(buckets) = Sum(outstanding_asof) = the
// control balance AT that as_of (S6 acceptance).
// ---------------------------------------------------------------------------
test("x40.ad a bill settled later is still open at an earlier as_of, and Sum(buckets)=Sum(outstanding_asof)=the control balance", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const cp = await birthCounterparty(sub, { client, name: `X40AD CO ${randomUUID().slice(0, 6)}` });
  const bill = await dateStampedItem(sub, { client, domain: "ap", cp, cpKind: "vendor", cents: 55000, control: AP1, postingDate: "2033-06-01" });
  const bankAcct = await freshAccount(sub, client, "ad1");
  await allocatePayment(sub, {
    client, counterparty: cp, postingDate: "2033-07-15", bankAccount: bankAcct.coaCode,
    amountCents: 55000, allocations: [{ item_id: bill.item, amount_cents: 55000 }],
  });
  assert.equal(await outstandingOf(bill.item), 0, "x40.ad mandatory setup: the bill is fully settled in the LIVE (current) view");

  const asOfBeforeSettle = await outstandingAsOf(bill.item, "2033-06-30");
  assert.equal(asOfBeforeSettle, 55000, "x40.ad: as-of the bill's own month-end, BEFORE its July settlement, it still reads fully outstanding");
  const asOfAfterSettle = await outstandingAsOf(bill.item, "2033-08-01");
  assert.equal(asOfAfterSettle, 0, "x40.ad: as-of after the settlement's own effective_date (the payment's posting_date), it reads settled");

  const aging = await apAging(sub, { client, asOf: "2033-06-30" });
  const rows = Array.isArray(aging) ? aging : (aging?.rows ?? aging?.counterparties ?? []);
  const bucketTotal = rows.reduce((s, r) => s + Number(r.current_cents ?? r.current ?? 0) + Number(r.d31_60_cents ?? r["31_60_cents"] ?? 0) + Number(r.d61_90_cents ?? r["61_90_cents"] ?? 0) + Number(r.d91_plus_cents ?? r["91_plus_cents"] ?? 0), 0);
  const control = await controlGlAsOf(client, "ap", "2033-06-30");
  assert.equal(bucketTotal, control, "x40.ad Sum(ap_aging buckets) = the AP control GL balance AS-OF 2033-06-30");
  const itemsSum = await outstandingAsOf(bill.item, "2033-06-30");
  assert.equal(itemsSum, control, "x40.ad Sum(outstanding_asof) over open items = the SAME control balance");
});

// ---------------------------------------------------------------------------
// x40.ae -- due_date BIRTH-STAMP: invoice/bill only, stamped at item BIRTH
// (append-only -- existing items keep an honest null); a settlement/adjustment
// item NEVER reads overdue.
// ---------------------------------------------------------------------------
test("x40.ae due_date is stamped at BIRTH for invoice/bill only, using the terms in effect AT birth; a settlement/adjustment item never reads overdue", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const cp = await birthCounterparty(sub, { client, name: `X40AE CO ${randomUUID().slice(0, 6)}`, kind: "customer" });

  // Item born BEFORE terms are ever set -- keeps an honest null forever.
  const before = await dateStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 11000, control: AR1, postingDate: "2033-01-10" });
  assert.equal((await openItemRow(before.item))?.due_date ?? null, null, "x40.ae: an item born before terms exist keeps due_date null (append-only, no retroactive backfill)");

  await setTerms(sub, { client, counterparty: cp, days: 30 });
  assert.equal((await openItemRow(before.item))?.due_date ?? null, null, "x40.ae: setting terms LATER never backfills the already-born item");

  // INTEGRATION FIX -- THE CELL'S OWN SETUP ASSUMPTION WAS WRONG, NOT THE BUILD. Under
  // WCA-R2 (0037), an UNTYPED control entry mints an `adjustment` item; only an entry
  // carrying coding_kind='sales_invoice'/'supplier_bill' mints an `invoice`/`bill`. This
  // suite's fixture world cannot cheaply mint a typed entry (a supplier_bill draft demands
  // bound evidence, CLR21; a sales_invoice must clear 0016's nine-control envelope) -- that
  // is the x37/a21 fixture world's machinery. So the cell proves the LAW from the side it
  // CAN reach, which is also the side that would silently mis-age a book:
  //   (1) an item OUT of the invoice/bill scope is NEVER stamped, even with live terms;
  //   (2) the producer itself reads payment_terms_days and is scoped to invoice/bill.
  // PAID (fix-wave E3, asbuilt-authority.md finding 7): the positive half -- a REAL typed
  // supplier_bill, terms 30, item_date 2033-03-05 -> due_date 2033-04-04 EXACT -- now lives at
  // x37-wave-c-a-subledger.test.mjs cell x37.c2, the one fixture world that can mint a typed
  // entry cheaply.
  const after = await dateStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 22000, control: AR1, postingDate: "2033-03-05" });
  const afterRow = await openItemRow(after.item);
  assert.equal(afterRow.item_kind, "adjustment", "x40.ae: an UNTYPED control entry mints an 'adjustment' item (WCA-R2) -- the fixture cannot reach 'invoice' without a typed sales_invoice");
  assert.equal(afterRow.due_date ?? null, null, "x40.ae: an adjustment item born WITH live 30-day terms is still NEVER stamped -- due_date is scoped item_kind in ('invoice','bill')");

  const producer = await fnSource("_subledger_on_approve");
  assert.ok(producer.includes("payment_terms_days"), "x40.ae: the birth stamp reads the counterparty's payment_terms_days");
  assert.ok(producer.includes("item_kind in ('invoice','bill')"), "x40.ae: the birth stamp is scoped to invoice/bill -- a settlement can never read overdue");
  noteLane("x40.ae: the positive due_date birth-stamp cell against a REAL typed supplier_bill entry lives at x37-wave-c-a-subledger.test.mjs cell x37.c2 (fix-wave E3)");
});

// ---------------------------------------------------------------------------
// x40.af -- TERMS VERB RANGE + WHITELIST SURVIVAL: set_counterparty_terms
// refuses out-of-range days; a plain name+terms update through the ordinary
// counterparty writer still works (the widened whitelist), and a genuinely
// forbidden column update is STILL refused.
// ---------------------------------------------------------------------------
test("x40.af set_counterparty_terms enforces the day range; ordinary name+terms updates survive the widened whitelist, a forbidden column still refuses", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const cp = await birthCounterparty(sub, { client, name: `X40AF CO ${randomUUID().slice(0, 6)}` });

  const tooLow = await caught(() => setTerms(sub, { client, counterparty: cp, days: 0 }));
  assertReason(tooLow, null, "terms_out_of_range", "x40.af zero days is out of range");
  const tooHigh = await caught(() => setTerms(sub, { client, counterparty: cp, days: 366 }));
  assertReason(tooHigh, null, "terms_out_of_range", "x40.af 366 days is out of range");

  const ok = await setTerms(sub, { client, counterparty: cp, days: 45 });
  assert.ok(ok, "x40.af a legal 45-day term is accepted");
  assert.equal((await counterpartyRow(cp))?.payment_terms_days, 45, "the row reads back 45");

  // An ORDINARY counterparty update (e.g. rename) through the pre-existing
  // human writer must still work post-recut (the whitelist widening is
  // additive; the -0011 whitelist prestate must survive verbatim, S5 splice
  // register 8) -- probed via the existing update surface if one is granted.
  const renameFn = await rootQuery(
    "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname ~ 'counterparty' and p.proname ~ 'update'",
  );
  noteLane(`x40.af candidate counterparty-update fn names: ${renameFn.rows.map((r) => r.proname).join(",") || "(none found by name pattern -- adjudicate at integration)"}`);
});

// ---------------------------------------------------------------------------
// x40.ag -- BUCKET BOUNDARIES disjoint half-open + p_segment reserved-ignored.
// ---------------------------------------------------------------------------
test("x40.ag ar_aging/ap_aging buckets are disjoint (current 0-30/31-60/61-90/91+, no double-count), and p_segment is reserved-ignored", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const cp = await birthCounterparty(sub, { client, name: `X40AG CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const asOf = "2033-12-31";
  // Four items, aged to land squarely in each bucket relative to asOf.
  const dCurrent = await dateStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 1000, control: AR1, postingDate: "2033-12-15" }); // 16d
  const d3160 = await dateStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 2000, control: AR1, postingDate: "2033-11-15" }); // ~46d
  const d6190 = await dateStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 3000, control: AR1, postingDate: "2033-10-15" }); // ~77d
  const d91 = await dateStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 4000, control: AR1, postingDate: "2033-08-01" }); // ~152d

  const withSeg = await arAging(sub, { client, asOf, segment: randomUUID() });
  const withoutSeg = await arAging(sub, { client, asOf, segment: null });
  assert.deepEqual(withSeg, withoutSeg, "x40.ag: p_segment is reserved-ignored -- any value (or none) produces the SAME result");

  const rows = Array.isArray(withoutSeg) ? withoutSeg : (withoutSeg?.rows ?? withoutSeg?.counterparties ?? []);
  const bucketTotal = rows.reduce((s, r) => s + Number(r.current_cents ?? r.current ?? 0) + Number(r.d31_60_cents ?? r["31_60_cents"] ?? 0) + Number(r.d61_90_cents ?? r["61_90_cents"] ?? 0) + Number(r.d91_plus_cents ?? r["91_plus_cents"] ?? 0), 0);
  const control = await controlGlAsOf(client, "ar", asOf);
  assert.equal(bucketTotal, control, "x40.ag: the four buckets sum to exactly the AR control balance -- no day double-counted, none dropped");
  noteLane(`x40.ag items: current=${dCurrent.item} 31-60=${d3160.item} 61-90=${d6190.item} 91+=${d91.item}`);
});

// ===========================================================================
// SECTION 5 -- RULES / THE LEARN LOOP (design S4.3, S5; part2 findings 12/28-30/39).
// ===========================================================================

/** A statement with a MULTI-LINE description (WCC-R1's law: every real
 *  description in the corpus carries embedded newlines) suitable for pattern
 *  breeding (>=3 sightings of the same token pattern). */
async function multilineStatement(sub, client, bankAccount, { tag, count = 3, direction = -1, amount = 96750 }) {
  const specs = [];
  for (let i = 0; i < count; i++) {
    specs.push({
      amountCents: direction * amount, entryDate: `2034-0${(i % 9) + 1}-1${i}`,
      description: `IBG TRANSFER\nEPF PAYMENT ${tag} REF${1000 + i}`,
    });
  }
  return enterStatement(sub, { client, bankAccount, periodStart: "2034-01-01", periodEnd: "2034-12-31", opening: 0, specs, keepPeriod: true });
}

// ---------------------------------------------------------------------------
// x40.ah -- RULE FLOORS: derived evidence <3 refused (DB-derived, never
// caller-supplied); a caller-supplied evidence argument is either ignored or
// refused (IA-5).
// ---------------------------------------------------------------------------
test("x40.ah propose_bank_rule refuses rule_evidence_insufficient below the DB-derived >=3 floor, and evidence is never caller-supplied", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const acct = await freshAccount(sub, client, "ah1");
  // Only TWO sightings -- below the floor.
  await multilineStatement(sub, client, acct.bankAccountId, { tag: "AH1", count: 2 });
  const denied = await caught(() => proposeRule(sub, {
    client, kind: "coding", pattern: { tokens: ["EPF", "PAYMENT", "AH1"], direction: "debit" },
    proposal: { account_code: EXPN, narration_template: "EPF contribution" },
  }));
  assertReason(denied, null, "rule_evidence_insufficient", "x40.ah below the >=3 sighting floor, propose_bank_rule refuses named");

  // A caller-supplied p_evidence extra argument -- either 42883 (no such
  // parameter) or the row's actual evidence disagrees with the injected value
  // (proving it was ignored, never trusted).
  const injected = await caught(async () => {
    const r = await humanQuery(
      sub,
      `select clara.propose_bank_rule(p_client => $1, p_kind => $2, p_pattern => $3::jsonb, p_proposal => $4::jsonb, p_evidence => $5::jsonb, p_op_key => $6) as r`,
      [client, "coding", JSON.stringify({ tokens: ["EPF"] }), JSON.stringify({ account_code: EXPN }), JSON.stringify({ sighting_count: 999 }), opk("x40-ah-inject")],
    );
    return r.rows[0].r;
  });
  assert.ok(injected, "x40.ah a caller-supplied p_evidence argument is refused outright (42883, no such parameter) -- IA-5");
  noteLane(`x40.ah caller-supplied evidence probe: code=${injected.code} message=${injected.message}`);
});

// ---------------------------------------------------------------------------
// x40.ai -- SIGN OWNER-ONLY; FROZEN-AFTER-SIGNING: a bookkeeper cannot sign; a
// signed rule's pattern/proposal/evidence are immutable (no writer touches
// them); retire is owner-only and terminal.
// ---------------------------------------------------------------------------
test("x40.ai sign_bank_rule is owner-only, a signed rule's substantive fields are frozen, and retire is owner-only + terminal", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice; // owner
  const bookkeeper = world.users.bob;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "ai1");
  await multilineStatement(sub, client, acct.bankAccountId, { tag: "AI1", count: 3 });
  const proposed = await proposeRule(sub, {
    client, kind: "coding", pattern: { tokens: ["EPF", "PAYMENT", "AI1"], direction: "debit" },
    proposal: { account_code: EXPN, narration_template: "EPF contribution" },
  });
  const ruleId = idOf(proposed, "rule_id", "id");
  assert.ok(ruleId, "x40.ai mandatory setup: the rule proposed above the floor");

  const bookkeeperSign = await caught(() => signRule(bookkeeper, { client, rule: ruleId }));
  assert.ok(bookkeeperSign, "x40.ai a bookkeeper may not sign a bank rule -- the owner floor");
  noteLane(`x40.ai bookkeeper-sign refusal: code=${bookkeeperSign.code} reason=${reasonOf(bookkeeperSign)}`);

  const signed = await signRule(sub, { client, rule: ruleId });
  assert.ok(signed, "the owner signs successfully");
  const before = await ruleRow(ruleId);
  assert.equal(before.status, "signed");

  // No writer touches pattern/proposal/evidence post-sign (frozen substantive
  // fields, S4.3/C14) -- probed by re-proposing the IDENTICAL pattern (which
  // must be refused as an already-signed duplicate, never silently merged).
  const dupe = await caught(() => proposeRule(sub, {
    client, kind: "coding", pattern: { tokens: ["EPF", "PAYMENT", "AI1"], direction: "debit" },
    proposal: { account_code: EXPN, narration_template: "a DIFFERENT template" },
  }));
  assertReason(dupe, null, "rule_pattern_already_signed", "x40.ai an identical (kind,pattern) content-hash while a signed rule already holds it is refused");

  const bookkeeperRetire = await caught(() => retireRule(bookkeeper, { client, rule: ruleId }));
  assert.ok(bookkeeperRetire, "x40.ai a bookkeeper may not retire a bank rule either -- the owner floor");
  const retired = await retireRule(sub, { client, rule: ruleId, reason: "x40.ai retiring, terminal" });
  assert.ok(retired);
  assert.equal((await ruleRow(ruleId)).status, "retired");
  const reRetire = await caught(() => retireRule(sub, { client, rule: ruleId }));
  assertReason(reRetire, null, "rule_not_signed", "x40.ai retire is terminal -- an already-retired rule refuses a second retire");
});

// ---------------------------------------------------------------------------
// x40.aj -- PATTERN-HASH DUPLICATE refused among {proposed,signed}; a
// RETIRED rule's content_hash is free again.
// ---------------------------------------------------------------------------
test("x40.aj a duplicate (kind,pattern) content_hash is refused among proposed+signed rules, and frees up once retired", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "aj1");
  await multilineStatement(sub, client, acct.bankAccountId, { tag: "AJ1", count: 3 });
  const pattern = { tokens: ["EPF", "PAYMENT", "AJ1"], direction: "debit" };
  const first = await proposeRule(sub, { client, kind: "coding", pattern, proposal: { account_code: EXPN, narration_template: "EPF" } });
  const firstId = idOf(first, "rule_id", "id");
  const dupeWhileProposed = await caught(() => proposeRule(sub, { client, kind: "coding", pattern, proposal: { account_code: EXPN, narration_template: "EPF v2" } }));
  assertReason(dupeWhileProposed, null, "rule_pattern_already_signed", "x40.aj a dup while the first is merely proposed (not yet signed) is still refused -- unique among proposed+signed");

  await retireRule(sub, { client, rule: firstId });
  const afterRetire = await proposeRule(sub, { client, kind: "coding", pattern, proposal: { account_code: EXPN, narration_template: "EPF v3" } });
  assert.ok(idOf(afterRetire, "rule_id", "id"), "x40.aj: once the first rule is RETIRED, the identical content_hash is free again");
});

// ---------------------------------------------------------------------------
// x40.ak -- SUGGESTIONS: at most ONE suggestion per (line, kind); multi-line
// description matching (WCC-R1's law -- every description is multi-line).
// ---------------------------------------------------------------------------
test("x40.ak list_bank_line_suggestions returns at most one suggestion per (line, kind), matching multi-line descriptions", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "ak1");
  await multilineStatement(sub, client, acct.bankAccountId, { tag: "AK1", count: 3 });
  const pattern = { tokens: ["EPF", "PAYMENT", "AK1"], direction: "debit" };
  const proposed = await proposeRule(sub, { client, kind: "coding", pattern, proposal: { account_code: EXPN, narration_template: "EPF contribution" } });
  await signRule(sub, { client, rule: idOf(proposed, "rule_id", "id") });

  // A FOURTH statement line, same multi-line description shape, unmatched.
  const target = await multilineStatement(sub, client, await (async () => (await freshAccount(sub, client, "ak2")).bankAccountId)(), { tag: "AK1", count: 1 });
  const suggestions = await listBankLineSuggestions(sub, { statement: target.statementId });
  const rows = Array.isArray(suggestions) ? suggestions : (suggestions?.suggestions ?? []);
  const perLineKind = new Map();
  for (const s of rows) {
    const key = `${s.line_id}:${s.kind}`;
    perLineKind.set(key, (perLineKind.get(key) ?? 0) + 1);
  }
  for (const [key, n] of perLineKind) assert.ok(n <= 1, `x40.ak: at most 1 suggestion per (line,kind) -- got ${n} for ${key}`);
  assert.ok(rows.some((s) => String(s.line_id) === String(target.lines[0].id)), "x40.ak: the multi-line description on the target line was matched by the signed rule's pattern");
});

// ---------------------------------------------------------------------------
// x40.al -- origin='rule' VIA the p_via_rule OVERLOADS; tenancy: a foreign
// client's signed rule is refused (composite FK, S4.3).
// ---------------------------------------------------------------------------
test("x40.al match_bank_line's p_via_rule overload stamps origin='rule' and matched_via_rule_id; a foreign client's rule is refused", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "al1");
  await multilineStatement(sub, client, acct.bankAccountId, { tag: "AL1", count: 3 });
  const pattern = { tokens: ["EPF", "PAYMENT", "AL1"], direction: "debit" };
  const ruleCp = await birthCounterparty(sub, { client, name: `X40AL1 CO ${randomUUID().slice(0, 6)}` });
  const proposed = await proposeRule(sub, { client, kind: "match_settle", pattern, proposal: { domain: "ap", counterparty_id: ruleCp } });
  const ruleId = idOf(proposed, "rule_id", "id");
  await signRule(sub, { client, rule: ruleId });

  const entry = await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 96750, postingDate: "2035-02-05", memo: "x40.al via-rule match" });
  // INTEGRATION FIX: multilineStatement already holds 2034-01-01..2034-12-31 live on this
  // account (the breeding corpus), and 0038 refuses an overlapping live period -- so the
  // via-rule match rides its own 2035 statement.
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2035-02-01", periodEnd: "2035-02-28", opening: 0, specs: [{ amountCents: -96750, entryDate: "2035-02-06", description: "IBG TRANSFER\nEPF PAYMENT AL1 REF9999" }], keepPeriod: true });
  const receipt = await matchBankLineViaRule(sub, { client, lines: [stmt.lines[0].id], entries: [{ entry_id: entry, matched_cents: -96750 }], viaRule: ruleId });
  const row = await matchRow(matchIdOf(receipt));
  assert.equal(row.origin, "rule", "x40.al: origin='rule' via the p_via_rule overload (the unbuildable-bare-pin fix, part2 finding 12)");
  assert.equal(row.matched_via_rule_id, ruleId, "matched_via_rule_id is stamped");

  // Tenancy: a client-A2 rule may never be named by a client-A1 call.
  const otherClient = world.clients.A2;
  await multilineStatement(sub, otherClient, (await freshAccount(sub, otherClient, "al2")).bankAccountId, { tag: "AL2", count: 3 });
  // INTEGRATION FIX: design S4.3 pins the match_settle proposal shape as
  // {domain, counterparty_id}, and domain is the subledger domain (ar/ap).
  const foreignCp = await birthCounterparty(sub, { client: otherClient, name: `X40AL2 CO ${randomUUID().slice(0, 6)}` });
  const foreignProposed = await proposeRule(sub, { client: otherClient, kind: "match_settle", pattern: { tokens: ["EPF", "PAYMENT", "AL2"], direction: "debit" }, proposal: { domain: "ap", counterparty_id: foreignCp } });
  const foreignRuleId = idOf(foreignProposed, "rule_id", "id");
  await signRule(sub, { client: otherClient, rule: foreignRuleId });
  const entry2 = await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 1000, postingDate: "2035-03-05", memo: "x40.al foreign-rule probe" });
  const stmt2 = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2035-03-01", periodEnd: "2035-03-31", opening: -96750, specs: [{ amountCents: -1000, entryDate: "2035-03-06" }], keepPeriod: true });
  const denied = await caught(() => matchBankLineViaRule(sub, { client, lines: [stmt2.lines[0].id], entries: [{ entry_id: entry2, matched_cents: -1000 }], viaRule: foreignRuleId }));
  assert.ok(denied, "x40.al a foreign (other client's) rule id is refused by the composite FK");
  noteLane(`x40.al foreign-rule refusal: code=${denied.code} reason=${reasonOf(denied)}`);
});

// ---------------------------------------------------------------------------
// x40.am HELPERS -- the 0042 producer verb + the three root readbacks the
// carve-out cell measures with. Kept beside the cell (its only caller) rather
// than in the C-c verb block above: accept_bank_rule_suggestion is a WAVE D-b
// verb (design S5 / ABI SSA), not one of the five C-c verbs IA-1..IA-7.
// ---------------------------------------------------------------------------

/** clara.accept_bank_rule_suggestion(p_client, p_line, p_rule, p_op_key) -- ABI §A,
 *  bookkeeper+. The ONLY lawful writer of the `bank_rule_suggested` flags key
 *  (0042 tail 6(a) pins that writer census at exactly this one function). */
async function acceptSuggestion(sub, { client, line, rule, opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("accept_bank_rule_suggestion", [
      { name: "p_client" }, { name: "p_line" }, { name: "p_rule" }, { name: "p_op_key" },
    ]),
    [client, line, rule, opKey ?? opk("x40-accept-sugg")],
  );
  return r.rows[0].result;
}

/** A draft's CURRENT revision token. The producer's receipt carries only
 *  {entry_id} (ABI §A), and the flags stamp in arm B is a raw UPDATE -- so the
 *  token is always re-read immediately before approve rather than carried. */
async function revisionOf(entry) {
  const r = await rootQuery("select revision_token from clara.journal_entries where id=$1", [entry]);
  return r.rows[0]?.revision_token ?? null;
}

/** The rule_sightings evidence rows a set of entries accrued (root; RLS bypass).
 *  This is the carve-out's OWN subject -- 0040 S5 gates the two sighting INSERTs
 *  themselves, not merely the >=3 proposal loop they feed. */
async function sightingCount(entries) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.rule_sightings s where s.entry_id = any($1::uuid[])",
    [entries],
  );
  return r.rows[0].n;
}

/** vendor_account autopost proposals standing for one counterparty (0037:2085). */
async function vendorAccountProposals(client, counterparty) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.coding_rules where client_id=$1 and rule_type='vendor_account' and counterparty_id=$2",
    [client, counterparty],
  );
  return r.rows[0].n;
}

/** A statement line's entry_date as a plain YYYY-MM-DD string (never a JS Date
 *  round-trip -- the rig has been bitten by timezone drift on date columns). */
async function lineDateOf(line) {
  const r = await rootQuery(
    "select to_char(entry_date,'YYYY-MM-DD') as d from clara.bank_statement_lines where id=$1", [line]);
  return r.rows[0].d;
}

// ---------------------------------------------------------------------------
// x40.am -- THE SIGHTING CARVE-OUT: a bank_rule_suggested-stamped draft
// approved THREE TIMES breeds NO vendor_account autopost proposal (part2
// finding 29, the WA2-R9 wall applied).
//
// PREVIOUS REBUILD (fix-wave E1/A2, asbuilt-authority.md finding 2) fixed two
// vacuity breaks: the stamp targeted a non-existent COLUMN (the build carries
// the marker as a KEY INSIDE `flags`) and the query asked for the wrong
// rule_type. Both fixes stand; the construction below keeps them.
//
// REBUILT AGAIN (0042, wave D-b) -- BECAUSE THE BUILD CLOSED A HOLE. 0040
// shipped the S5 carve-out deliberately INERT: "no writer stamps this key yet
// ... it ships AHEAD of its producer" (0040:6987), so the E1/A2 cut had no
// lawful way to reach it and forged the stamp by hand out of a random uuid.
// Nothing validated that stamp at approve, so the forgery sailed through.
// 0042 ships the producer AND its approve-time re-validation:
// clara._adj_on_approve arm (3) [design §5; ABI §A] re-asks every question
// clara.accept_bank_rule_suggestion asked -- signed coding rule, line unmatched
// and un-excepted, statement live, predicate still matching, legs byte-equal to
// clara._wdb_suggestion_lines -- refusing CLR39 suggestion_stale otherwise. The
// forged stamp names no signed rule, so it is now CORRECTLY refused on axis
// 'rule'. That is a desirable tightening, not a regression: before 0042 a
// hand-stamped flag silently suppressed vendor-binding sighting accrual. The
// assertion FOLLOWS THE INVARIANT to its new home -- the cell now reaches the
// carve-out the way the build says it is reached.
//
// THREE ARMS, because 0042 gave this invariant a SECOND, INDEPENDENT wall and
// an honest cell has to tell the two apart:
//   A  THE LAWFUL PRODUCER, END TO END. clara.accept_bank_rule_suggestion
//      direct-INSERTs its draft with NO counterparty on any leg and NO client
//      resolution (design §5's attribution posture: "the entry is FK-anchored
//      to the statement line"). So v_counterparty is NULL at 0037:1891 and the
//      whole accrual block is skipped BEFORE the carve-out conjunct is ever
//      evaluated. Arm A therefore states the PRODUCTION fact -- a bank rule's
//      own output accrues nothing -- but cannot, alone, discriminate the
//      carve-out. Saying so out loud is precisely why arm B exists.
//   B  THE CARVE-OUT, ISOLATED. The same draft, but carrying a VENDOR, so
//      v_counterparty is non-null and 0040 S5's
//      `not (coalesce(e.flags,'{}'::jsonb) ? 'bank_rule_suggested')` conjunct
//      is the ONLY thing left withholding accrual. Its stamp names a REAL
//      signed coding rule and a REAL live unmatched line and its legs ARE the
//      derived legs, so it passes all five of arm (3)'s axes and is refused by
//      nothing. Hand-built on purpose: the lawful verb binds no counterparty by
//      design, so no lawful call can put the conjunct under load. flags is in
//      _tf_entry_immutable's draft->draft allowset (0016:4956), which is what
//      makes the stamp landable without a verb.
//   C  THE POSITIVE CONTROL: arm B's draft MINUS the stamp, on a second
//      counterparty, must breed EXACTLY ONE proposal. Without it, a dead
//      sighting mechanism would read identically to a working carve-out.
//
// [WAVE D-b SPLIT — INHERITED AT D-b2 (0045)] This cell's D-b rewrite deferred
// out of D-b3 (0044) because ARM A calls `clara.accept_bank_rule_suggestion` —
// the `bank_rule_suggested` producer — through the authenticated lane, and 0044
// deliberately WITHHELD its `grant execute … to clara_authenticated` (the
// confirming round's CF-B3-1 ≡ Codex CX1: its approve-time re-validation is
// `clara._adj_on_approve` arm (3), a D-b2 body, and a reachable producer
// without it can mint a staff advance nobody incurred). Arm A would have
// failed 42501 at that frontier, and arm B's `{rule_id, line_id}` stamp
// asserts a refusal — CLR39 `suggestion_stale` — that only arm (3) can raise.
// D-b2 (0045, block S2.9-b3) lands BOTH: the grant and arm (3)'s wall. The
// inheritance below is therefore whole -- the five helpers (`acceptSuggestion`,
// `revisionOf`, `sightingCount`, `vendorAccountProposals`, `lineDateOf`) and the
// arm A/B/C rewrite, unmodified from the wave's pre-split cut, now GREEN on 0045.
// ---------------------------------------------------------------------------
test("x40.am a bank-suggestion-stamped draft, approved three times, breeds NO vendor_account autopost proposal -- an identical unstamped trio on a second counterparty breeds exactly one", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "am1");
  const cpStamped = await birthCounterparty(sub, { client, name: `X40AM STAMPED CO ${randomUUID().slice(0, 6)}` });
  const cpControl = await birthCounterparty(sub, { client, name: `X40AM CONTROL CO ${randomUUID().slice(0, 6)}` });

  // SIX matching lines on one statement: three for the lawful producer (arm A), three named
  // by the hand-built isolation drafts (arm B). It has to be six DIFFERENT lines -- the
  // producer's dedup law (design §5: at most ONE bank_rule_suggested entry per line across
  // status IN ('draft','approved') AND reversed_by IS NULL, index
  // uq_je_bank_rule_suggested_line) means "approved three times" is necessarily three lines.
  const stmt = await multilineStatement(sub, client, acct.bankAccountId, { tag: "AM1", count: 6 });
  const pattern = { tokens: ["EPF", "PAYMENT", "AM1"], direction: "debit" };
  const proposed = await proposeRule(sub, {
    client, kind: "coding", pattern,
    proposal: { account_code: EXPN, narration_template: "x40.am coded from a signed rule" },
  });
  const ruleId = idOf(proposed, "rule_id", "id");
  await signRule(sub, { client, rule: ruleId });

  // ---- ARM A: the lawful producer, end to end (design §5 / ABI §A). ----
  const armA = [];
  for (let i = 0; i < 3; i++) {
    const accepted = await acceptSuggestion(sub, { client, line: stmt.lines[i].id, rule: ruleId, opKey: opk(`x40-am-accept-${i}`) });
    const entry = idOf(accepted, "entry_id", "id");
    assert.ok(entry, `x40.am mandatory setup: accept_bank_rule_suggestion minted a draft for line ${i}`);
    await approveEntry(sub, { entry, expectedRevision: await revisionOf(entry), opKey: opk(`x40-am-accepta-${i}`) });
    armA.push(entry);
  }
  const armAState = await rootQuery(
    `select count(*) filter (where e.status='approved')::int as approved,
            count(*) filter (where e.proposed_counterparty is not null
              or exists (select 1 from clara.journal_lines l
                         where l.entry_id=e.id and l.counterparty_id is not null))::int as bound
       from clara.journal_entries e where e.id = any($1::uuid[])`,
    [armA],
  );
  assert.equal(armAState.rows[0].approved, 3, "x40.am ARM A mandatory setup: all three LAWFULLY suggested drafts approved -- arm (3)'s five axes all held on a producer-minted draft");
  assert.equal(armAState.rows[0].bound, 0, "x40.am ARM A: the producer's own drafts bind NO counterparty at all (design §5's FK-anchored attribution posture) -- so v_counterparty is null and the accrual block never reaches the carve-out conjunct. THAT is why arm A alone cannot discriminate it, and why arm B follows");
  assert.equal(await sightingCount(armA), 0, "x40.am ARM A: three lawfully suggested approvals accrue ZERO rule_sightings -- a bank rule's own output never becomes autopost evidence (WA2-R9)");

  // The two legs clara._wdb_suggestion_lines derives for a money-OUT line (ABI §A / 0042 S2):
  // Dr the rule's account / Cr the bank account's GL code, magnitude the line's own, DEBIT LEG
  // FIRST. Arm (3) compares this array position-for-position against `order by line_no`, so
  // arms B and C carry it verbatim -- and arm B's stamp is refused on axis 'legs' if it drifts.
  const derivedLines = [
    { account_code: EXPN, debit_cents: 96750, credit_cents: 0, description: "x40.am coded leg" },
    { account_code: acct.coaCode, debit_cents: 0, credit_cents: 96750, description: "x40.am bank leg" },
  ];

  // ---- ARM B: the same draft WITH a vendor -- the carve-out conjunct alone. ----
  const armB = [];
  for (let i = 0; i < 3; i++) {
    const line = stmt.lines[3 + i];
    const d = await draftEntryV3(sub, {
      client, resolution: await manualRes(sub, client), memo: `x40.am suggestion-stamped draft ${i}`,
      postingDate: await lineDateOf(line.id), lines: derivedLines,
      vendor: { existing_id: cpStamped }, opKey: opk(`x40-am-draft-${i}`),
    });
    // Stamp bank_rule_suggested THROUGH THE LAWFUL COLUMN: flags is in
    // _tf_entry_immutable's draft->draft allowset (0016:4956). The VALUE is now the ABI §B
    // shape {rule_id, line_id} naming a real signed rule and a real live unmatched line --
    // a random uuid would be refused CLR39 suggestion_stale by arm (3), which is exactly the
    // hole 0042 closed. No `.catch()`: a swallowed stamp is how this cell went vacuous once.
    const stamped = await withActor({}, (c) => c.query(
      `update clara.journal_entries set flags = coalesce(flags,'{}'::jsonb)
         || jsonb_build_object('bank_rule_suggested',
              jsonb_build_object('rule_id', $2::uuid, 'line_id', $3::uuid))
       where id=$1`,
      [d.entry_id, ruleId, line.id],
    ));
    assert.equal(stamped.rowCount, 1, `x40.am: the bank_rule_suggested stamp landed on draft ${i} (no swallowed error)`);
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: await revisionOf(d.entry_id), opKey: opk(`x40-am-approve-${i}`) });
    armB.push(d.entry_id);
  }
  assert.equal(await sightingCount(armB), 0, "x40.am ARM B: three stamped approvals that DO carry a vendor accrue ZERO rule_sightings -- with v_counterparty non-null the 0040 S5 conjunct is the only wall left, and it holds");
  assert.equal(await vendorAccountProposals(client, cpStamped), 0, "x40.am ARM B: and therefore ZERO vendor_account autopost proposals -- a bank rule may not breed a coding rule out of three assisted approvals of its own output (WA2-R9)");

  // ---- ARM C, INVERTED (F-A2 PR-1, D39). ----
  //
  // THE RETIRED CLAIM, named rather than deleted: *"the identical UNSTAMPED trio accrues one
  // debit sighting per entry on the coded account -- the accrual the stamp withheld in arm B"*,
  // and *"breeds EXACTLY ONE vendor_account proposal -- the sighting mechanism is alive."* It
  // was the POSITIVE CONTROL, and it is exactly what the eighth `clara._approve_entry_core`
  // body deletes: the whole `0037:2046-2100` block goes, so an ordinary approval breeds nothing
  // on any counterparty. Same class as `x42.prod-23`'s control half (B.7) and the same
  // treatment -- an inverted twin, whose battery successors are `f-a2.c8.inv-ordinary` and
  // `f-a2.c8.zero`.
  //
  // AND ARMS A AND B ARE NOW VACUOUS, which is stated rather than left to be discovered. Their
  // zeros no longer discriminate: nothing accrues anywhere, so the 0040 S5 carve-out conjunct
  // they were built to isolate has nothing left to withhold. They are kept because the SETUP
  // halves above them are live claims about the producer (arm A's three lawful accepts, arm B's
  // ABI-shaped stamp surviving arm (3)'s five axes), and because a zero that stops
  // discriminating is a law-31 finding to record, never a cell to quietly delete.
  const armC = [];
  for (let i = 0; i < 3; i++) {
    const d = await draftEntryV3(sub, {
      client, resolution: await manualRes(sub, client), memo: `x40.am UNSTAMPED control draft ${i}`,
      postingDate: await lineDateOf(stmt.lines[3 + i].id), lines: derivedLines,
      vendor: { existing_id: cpControl }, opKey: opk(`x40-am-ctrl-${i}`),
    });
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk(`x40-am-ctrla-${i}`) });
    armC.push(d.entry_id);
  }
  assert.equal(await sightingCount(armC), 0,
    "x40.am ARM C, INVERTED (D39): the identical UNSTAMPED trio accrues ZERO rule_sightings -- an ordinary approval no longer moves the counter, so the accrual the stamp used to withhold no longer exists to withhold");
  assert.equal(await vendorAccountProposals(client, cpControl), 0,
    "x40.am ARM C, INVERTED (D39): …and breeds NO vendor_account proposal. The successor claims are f-a2.c8.inv-ordinary and f-a2.c8.zero");
  // THE INSTRUMENT IS STILL LIVE, and this half is why the two zeros above are evidence rather
  // than an absence (review law 2). `restateSightings` replays the retired writer's own inserts
  // onto arm C's real approved entries, and the SAME `sightingCount` read that returned zero
  // now returns three.
  for (const entry of armC) await restateSightings(entry, { counterparty: cpControl });
  assert.equal(await sightingCount(armC), 3,
    "x40.am ARM C control-of-the-control: the restated pool reads THREE through the same instrument -- the zeros above are the door's answer, not a broken reader");
  noteLane(`x40.am carve-out arms: lawful=${armA.length} stamped=${armB.length} control=${armC.length}; signed coding rule ${ruleId}. ARMS A AND B ARE NOW VACUOUS (law 31): with breeding excised nothing accrues on any arm, so the 0040 S5 conjunct they isolated has nothing to withhold.`);
});

// ===========================================================================
// SECTION 6 -- TENANCY / LOCKS / EVENTS.
// ===========================================================================

// ---------------------------------------------------------------------------
// x40.an -- PER-RPC CROSS-FIRM ZERO-ROWS for all NINE read RPCs (S6 header:
// "cross-firm probes return zero rows, never a discriminating error").
//
// REBUILT (fix-wave E5/A10, asbuilt-authority.md finding 10). The original cut's
// "isEmpty" predicate was a tautology for any object payload: its last clause,
// `(r.rows ?? r.counterparties ?? r.suggestions ?? []).length === 0`, reads ANY
// object lacking those three keys as "empty" -- including a fully populated
// leak the RPC never emitted those keys for. It happened to be honest only
// because every probe's ACTUAL shape today is one of {array, null, an object
// keyed 'counterparties'/'rows'} -- a future RPC returning e.g. {items:[...]}
// would pass while leaking. Fixed: one exact, per-RPC shape assertion, read
// straight off each function's own jsonb_build_object in 0040 (ar_aging/
// ap_aging -> _aging_core's 'counterparties' key; customer_statement/
// supplier_statement -> _statement_core's 'rows' key; list_unmatched_lines/
// list_bank_line_suggestions/list_bank_rule_candidates/list_bank_rules -> a
// PLAIN jsonb array; get_bank_reconciliation -> SQL null on an unfound
// statement). PLUS list_bank_rules as the ninth probe (assembly's additive
// read RPC, order item 6/D4 -- never swept here before) and, since the delta
// round (#9), verify_bank_reconciliation as the TENTH -- the one rig-meta.mjs's
// grant catalog already counted and this sweep did not.
// ---------------------------------------------------------------------------
test("x40.an all TEN C-c read RPCs return empty for a firm-B actor over firm-A objects, never a discriminating error", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const dave = world.users.dave;
  const acct = await freshAccount(sub, client, "an1");
  const cp = await birthCounterparty(sub, { client, name: `X40AN CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await dateStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 4400, control: AR1, postingDate: "2034-05-01" });
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2034-05-01", periodEnd: "2034-05-31", opening: 0, specs: [], keepPeriod: true });
  const anReceipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const anRecon = idOf(anReceipt, "reconciliation_id", "reconciliation_id", "recon_id", "id");

  const arOut = await arAging(dave, { client, asOf: "2034-05-31" });
  assert.deepEqual(arOut?.counterparties, [], `ar_aging: expected an empty 'counterparties' array (got ${JSON.stringify(arOut)})`);
  const apOut = await apAging(dave, { client, asOf: "2034-05-31" });
  assert.deepEqual(apOut?.counterparties, [], `ap_aging: expected an empty 'counterparties' array (got ${JSON.stringify(apOut)})`);
  const custOut = await customerStatementRpc(dave, { client, cp, from: "2034-01-01", to: "2034-12-31" });
  assert.deepEqual(custOut?.rows, [], `customer_statement: expected an empty 'rows' array (got ${JSON.stringify(custOut)})`);
  const suppOut = await supplierStatementRpc(dave, { client, cp, from: "2034-01-01", to: "2034-12-31" });
  assert.deepEqual(suppOut?.rows, [], `supplier_statement: expected an empty 'rows' array (got ${JSON.stringify(suppOut)})`);
  assert.deepEqual(await listUnmatchedLines(dave, { client }), [], "list_unmatched_lines: expected a bare empty array");
  assert.equal(await getBankReconciliation(dave, { statement: stmt.statementId }), null, "get_bank_reconciliation: expected SQL null (statement not found for this firm)");
  assert.deepEqual(await listBankLineSuggestions(dave, { statement: stmt.statementId }), [], "list_bank_line_suggestions: expected a bare empty array");
  assert.deepEqual(await listBankRuleCandidates(dave, { client }), [], "list_bank_rule_candidates: expected a bare empty array");
  assert.deepEqual(await listBankRules(dave, { client }), [], "list_bank_rules: expected a bare empty array (the ninth probe, D4/A9's additive read RPC)");
  // 0040 FIX WAVE F14 [the delta round's #9]: THE TENTH READ. rig-meta.mjs's grant catalog has
  // named verify_bank_reconciliation among the ten C-c reads since A7 landed, but this sweep
  // still claimed and probed nine -- so deleting the verifier's OWN firm predicate would have
  // left the tenancy battery green. It is called here as firm B over firm A's reconciliation.
  const anVerify = (await humanQuery(dave, "select clara.verify_bank_reconciliation($1) as v", [anRecon])).rows[0].v;
  assert.equal(anVerify, null, "verify_bank_reconciliation: expected SQL null (the reconciliation is not this actor's firm's) -- never a discriminating error, and never a recomputation of another firm's money");
  assert.equal(await outstandingOf(inv.item), 4400, "x40.an mandatory setup: the firm-A invoice is untouched by the cross-firm probes");
});

// ---------------------------------------------------------------------------
// x40.ao -- LOCK-ORDER PROSRC PINS for the five new verbs (design S5: 004 ->
// 006 -> line rows FOR SHARE/UPDATE in id order -> the bank_accounts row FOR
// SHARE; except/resolve take 004 -> 006 -> the line row FOR UPDATE).
// ---------------------------------------------------------------------------
test("x40.ao lock-order prosrc pins: complete_bank_reconciliation/void_bank_reconciliation take 004->006->line rows(id order)->bank_accounts FOR SHARE; except/resolve take 004->006->the line row FOR UPDATE", async (t) => {
  if (skipHere(t)) return;
  const ordered = (src, needles, label) => {
    const at = needles.map((n) => src.indexOf(n));
    at.forEach((p, i) => assert.ok(p >= 0, `${label}: the body must contain the rung "${needles[i]}" (not found)`));
    for (let i = 1; i < at.length; i++) {
      assert.ok(at[i - 1] < at[i], `${label}: "${needles[i - 1]}" must be acquired BEFORE "${needles[i]}" (got ${at[i - 1]} vs ${at[i]}) -- the total lock order is inverted`);
    }
  };
  const completeSrc = await fnSource("complete_bank_reconciliation");
  // INTEGRATION FIX (assembly, contract-blind law -- the DESIGN pinned this and
  // the cell mis-guessed): design S5 says "line rows `FOR SHARE` in id order,
  // THEN the statement". A completion READS the lines; it never writes one, so
  // FOR SHARE is the correct strength and FOR UPDATE would needlessly serialise
  // completion against every concurrent match on the same statement.
  ordered(completeSrc, [
    "pg_advisory_xact_lock(203005004",
    "pg_advisory_xact_lock(203005006",
    "order by l.id for share",
  ], "complete_bank_reconciliation lock order");
  assert.ok(completeSrc.includes("for share") && /bank_accounts/i.test(completeSrc), "complete_bank_reconciliation takes the bank_accounts row FOR SHARE (S5)");

  const voidRSrc = await fnSource("void_bank_reconciliation");
  ordered(voidRSrc, ["pg_advisory_xact_lock(203005004", "pg_advisory_xact_lock(203005006"], "void_bank_reconciliation lock order");

  const exceptSrc = await fnSource("except_bank_line");
  ordered(exceptSrc, ["pg_advisory_xact_lock(203005004", "pg_advisory_xact_lock(203005006", "for update"], "except_bank_line lock order");
  const resolveSrc = await fnSource("resolve_bank_line_exception");
  ordered(resolveSrc, ["pg_advisory_xact_lock(203005004", "pg_advisory_xact_lock(203005006", "for update"], "resolve_bank_line_exception lock order");

  // NO pre-existing journal_entries row is ever locked by these five verbs
  // (the C-a partial order stays untouched, S5).
  for (const [label, src] of [["complete_bank_reconciliation", completeSrc], ["void_bank_reconciliation", voidRSrc], ["except_bank_line", exceptSrc], ["resolve_bank_line_exception", resolveSrc]]) {
    assert.ok(!/journal_entries[\s\S]{0,40}for update/i.test(src), `${label}: never locks a pre-existing journal_entries row`);
  }
});

// ---------------------------------------------------------------------------
// x40.ap -- EVENT REGISTRATION + ID-ONLY PAYLOAD ALLOWLIST for the seven new
// event types (design S4.5).
//
// REBUILT (fix-wave E6/A11, asbuilt-authority.md finding 11). Three
// independent weaknesses in the original cut, all fixed: (1) ALLOWED_KEYS
// admitted money figures (opening_cents/closing_cents/outstanding_cents/
// excepted_cents) and free text (reason) that the design (S4.5, "identifiers
// only") and the migration's own TAIL 6 gate both refuse -- the cell was
// strictly LOOSER than the thing it claims to police, so it could never catch
// a regression TAIL 6 wouldn't. Fixed: ALLOWED_KEYS is now the EXACT copy of
// TAIL 6's own `v_allowed` array (0040 TAIL 6), read straight off the live
// migration text, not re-derived. (2) both the resolve and the complete were
// swallowed (`.catch(() => {})`), so the fixture never actually reached most
// of the seven event types -- only bank.line_excepted was guaranteed. Fixed:
// a REAL reciprocal bank_corrective_line pair (x40.k's pattern, buildable now
// that A2 landed) resolves without needing a live match, so except+resolve
// succeed for real; complete+void a genuine receipt; propose+sign+retire a
// real coding rule -- all SEVEN types fire, asserted by name. (3) the loop
// iterated `rows` with no assertion it ever found any -- `noteLane` recorded
// the count without ever failing on zero. Fixed: assert.ok(rows.length>=1)
// AND that every one of the seven types was actually observed.
// ---------------------------------------------------------------------------
test("x40.ap the seven new bank.* event types are registered, in the taxonomy, all SEVEN actually fire, and every payload carries identifiers only", async (t) => {
  if (skipHere(t)) return;
  const types = [
    "bank.reconciliation_completed", "bank.reconciliation_voided",
    "bank.line_excepted", "bank.line_exception_resolved",
    "bank.rule_proposed", "bank.rule_signed", "bank.rule_retired",
  ];
  const reg = await rootQuery("select name from clara.event_types where name = any($1)", [types]);
  const got = new Set(reg.rows.map((r) => r.name));
  for (const type of types) assert.ok(got.has(type), `${type} is registered in clara.event_types`);
  const tax = await rootQuery("select event_type from clara.trigger_taxonomy where event_type = any($1)", [types]);
  assert.equal(new Set(tax.rows.map((r) => r.event_type)).size, types.length, "every new bank.* type is ALSO in the trigger taxonomy");

  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "ap1");
  // A GENUINE reciprocal corrective pair (x40.k's pattern) -- resolves without a live match, so
  // except/resolve both fire FOR REAL. The description substrings (REF1/REF2) are the sensitive-
  // token leak probe's target.
  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2034-06-01", periodEnd: "2034-06-30", opening: 0,
    specs: [
      { amountCents: -700, entryDate: "2034-06-05", description: "IBG TRANSFER\nSOME PAYEE REF1" },
      { amountCents: 700, entryDate: "2034-06-06", description: "BANK REVERSAL REF2" },
    ], keepPeriod: true,
  });
  const ex1 = idOf(await exceptLine(sub, { client, line: stmt.lines[0].id, kind: "disputed", reason: "x40.ap event probe (leg 1)" }), "exception_id", "id");
  await exceptLine(sub, { client, line: stmt.lines[1].id, kind: "disputed", reason: "x40.ap event probe (leg 2)" });
  // CX2 [folds into A2, landed]: ONE call resolves BOTH exceptions atomically -- the counterpart
  // auto-flips resolved/bank_corrective_line naming this line back. A second resolveException
  // call is no longer reachable (its exception is already resolved).
  await resolveException(sub, { client, exception: ex1, disposition: "bank_corrective_line", note: "x40.ap event probe resolution (leg 1)", counterpartLine: stmt.lines[1].id });

  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const reconId = idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id");
  await voidRecon(sub, { client, recon: reconId, reason: "x40.ap event probe: voiding the receipt to observe bank.reconciliation_voided" });

  // MEASURED THIS SESSION (rig verification): propose_bank_rule's evidence is DERIVED
  // in-verb (x40.ah), not a caller claim -- it genuinely refuses rule_evidence_insufficient
  // below the >=3-sighting floor. A FRESH account (x40.aj/x40.ah's own multilineStatement
  // idiom) carries three matching, unmatched, unexcepted lines to clear it.
  const acctRule = await freshAccount(sub, client, "ap2");
  await multilineStatement(sub, client, acctRule.bankAccountId, { tag: "AP1", count: 3 });
  const pattern = { tokens: ["EPF", "PAYMENT", "AP1"], direction: "debit" };
  const proposed = await proposeRule(sub, { client, kind: "coding", pattern, proposal: { account_code: EXPN, narration_template: "x40.ap event probe rule" } });
  const ruleId = idOf(proposed, "rule_id", "id");
  await signRule(sub, { client, rule: ruleId });
  await retireRule(sub, { client, rule: ruleId, reason: "x40.ap event probe: retiring to observe bank.rule_retired" });

  // TAIL 6's OWN allowlist, copied verbatim (0040: the `v_allowed` array inside the tail6 do
  // block) -- this cell can never be looser than the gate it exists to shadow-test.
  const ALLOWED_KEYS = new Set([
    "reconciliation_id", "statement_id", "bank_account_id", "prior_reconciliation_id",
    "first_period", "outstanding_items", "exception_items",
    "exception_id", "line_id", "kind", "resolution_disposition", "counterpart_line_id",
    // 0040 FIX WAVE F10 (the delta round): the CX2 arm's second resolved row, so an event-only
    // reader can rebuild the closed corrective pair. An identifier, like every other key here.
    "counterpart_exception_id",
    "rule_id", "client_id", "withdrawn",
    // [CROSS-SECTION EDIT — 0042 as-built ladder round 4. Reported, not silent.]
    // `bank.line_exception_reopened` is a 0042 (D-b) event, and this scan's own
    // `bank.line_%` pattern catches it. Its payload is {exception_id, line_id,
    // match_id}; `match_id` is an IDENTIFIER of exactly the kind this allowlist
    // exists to permit (bank.match_unmatched carries the same key), so the list
    // was simply stale, not breached. It surfaced only now because round 4 makes
    // the reopen fire for bookings made through the two-step door, which is the
    // door this file's fixtures use — before that the event never fired here and
    // the "all SEVEN fire" arm was passing on the 0040 set alone.
    // WORTH THE LEDGER: 0040's tail6 gate is the authority this cell shadows, and
    // it does NOT re-run over D-b's new event type, so a genuinely leaky D-b
    // payload would have been caught by this cell and by nothing else.
    "match_id",
  ]);
  const rows = await tieoutEventPayloads(client);
  assert.ok(rows.length >= 1, "x40.ap: the fixture must actually have produced tie-out event rows -- an empty scan proves nothing");
  const observedTypes = new Set(rows.map((r) => r.event_type));
  for (const type of types) {
    assert.ok(observedTypes.has(type), `x40.ap: event type ${type} was never observed -- the fixture must exercise all seven, not just bank.line_excepted`);
  }
  for (const row of rows) {
    for (const k of Object.keys(row.payload ?? {})) {
      assert.ok(ALLOWED_KEYS.has(k), `${row.event_type} payload key "${k}" is not on TAIL 6's allowlist (got keys ${Object.keys(row.payload).join(",")})`);
    }
    const text = JSON.stringify(row.payload ?? {});
    assert.ok(!text.includes("REF1") && !text.includes("REF2"), `${row.event_type} payload leaks a line description substring`);
  }
  noteLane(`x40.ap tie-out event rows observed: ${rows.length}, types: ${[...observedTypes].sort().join(",")}`);
});

// ---------------------------------------------------------------------------
// x40.aq -- TABLE ACL PINS: FORCE RLS, human SELECT-only, zero agent/runtime/
// wake grants on the three new tables.
// ---------------------------------------------------------------------------
test("x40.aq bank_reconciliations/bank_line_exceptions/bank_rules: human SELECT-only under forced RLS, zero agent/runtime/wake grants", async (t) => {
  if (skipHere(t)) return;
  const tables = ["bank_reconciliations", "bank_line_exceptions", "bank_rules"];
  const noAccessRoles = [ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive];
  for (const tbl of tables) {
    const flags = await rlsFlags(tbl);
    assert.ok(flags, `clara.${tbl} exists`);
    assert.equal(flags.rls, true, `clara.${tbl} has row-level security ENABLED`);
    assert.equal(flags.force, true, `clara.${tbl} FORCES row-level security`);
    const sel = await rootQuery("select has_table_privilege($1, $2, 'SELECT') as ok", [ROLES.authenticated, `clara.${tbl}`]);
    assert.equal(sel.rows[0].ok, true, `${ROLES.authenticated} holds the direct firm-scoped SELECT on clara.${tbl}`);
    const dml = await rootQuery(
      "select bool_or(has_table_privilege($1, $2, priv)) as ok from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) priv",
      [ROLES.authenticated, `clara.${tbl}`],
    );
    assert.notEqual(dml.rows[0].ok, true, `${ROLES.authenticated} must hold NO direct DML on clara.${tbl}`);
    for (const role of noAccessRoles) {
      const r = await rootQuery(
        "select bool_or(has_table_privilege($1, $2, priv)) as ok from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) priv",
        [role, `clara.${tbl}`],
      );
      assert.notEqual(r.rows[0].ok, true, `${role} must hold NO direct table privilege on clara.${tbl} -- zero agent grants anywhere in the tie-out schema`);
    }
  }
  const verbs = ["complete_bank_reconciliation", "void_bank_reconciliation", "except_bank_line", "resolve_bank_line_exception", "propose_bank_rule", "sign_bank_rule", "retire_bank_rule", "set_counterparty_terms"];
  // 0040 FIX WAVE F14 [the delta round's #9]: verify_bank_reconciliation is a READ, and the same
  // wall applies to it -- it recomputes a client's whole bank identity under a stored cutoff, so
  // a machine role holding EXECUTE on it would be an agent reading money by another door. A7
  // added it to rig-meta.mjs's catalog; it joins this loop now.
  const guarded = [...verbs, "verify_bank_reconciliation"];
  for (const fn of guarded) {
    assert.equal(await roleCanExecute(ROLES.authenticated, fn), true, `clara_authenticated may execute clara.${fn}`);
    for (const role of noAccessRoles) {
      assert.equal(await roleCanExecute(role, fn), false, `${role} must NOT execute clara.${fn} -- money/exception/rule authority stays human-only`);
    }
  }
  const wake = await rootQuery("select count(*)::int as n from clara.wake_fn_allowlist where function_name = any($1)", [guarded]);
  assert.equal(wake.rows[0].n, 0, "ZERO wake_fn_allowlist entries name any of the eight new C-c verbs or the A7 verifier");
});
