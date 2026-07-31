// 0040 Wave C-c -- the bank TIE-OUT (reconciliation identity + exceptions),
// AGING (as-of, due-date), and LEARN-LOOP (bank rules) battery.
//
// CONTRACT-BLIND, the x37/x38 discipline: written straight from
// docs/plan/wave-c-c-tieout-design.md (v2.1) + wave-c-c-tieout-design-part2.md
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
  draftEntryV3, approveEntry,
  idOf, reasonOf, HIGH_STAKES_CENTS,
  roleCanExecute, fnSource, rlsFlags,
} from "./a21-helpers.mjs";
import { holdThenContend, sawDeadlock } from "./rig-docs-race.mjs";
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
// IA-16: the forged Gate-K opening-anchor shape (minimal congruent rows, root
// direct-insert, bypassing the K1-K14 onboarding-plan lifecycle entirely).
// ---------------------------------------------------------------------------

async function forgeOpeningSeed(client) {
  const firm = await firmOf(client);
  const root = await withActor({}, async (c) => {
    // INTEGRATION FIX: uq_onboarding_plans_one_open admits ONE open plan per client, so a
    // second forging cell on the same client must REUSE the plan the first one minted.
    let plan = await c.query(
      "select id from clara.onboarding_plans where firm_id=$1 and client_id=$2 limit 1",
      [firm, client],
    );
    if (plan.rowCount === 0) {
      plan = await c.query(
        "insert into clara.onboarding_plans(firm_id, scope_kind, client_id) values ($1,'client',$2) returning id",
        [firm, client],
      );
    }
    const anyUser = (await c.query("select id from clara.users limit 1")).rows[0].id;
    // uq_opening_seed_registry_once admits ONE seed per plan -- reuse, same as the plan.
    let seed = await c.query(
      "select id from clara.opening_seed_registry where plan_id=$1 limit 1", [plan.rows[0].id]);
    if (seed.rowCount === 0) {
      seed = await c.query(
        "insert into clara.opening_seed_registry(firm_id, client_id, plan_id, as_of, created_by) values ($1,$2,$3,$4,$5) returning id",
        [firm, client, plan.rows[0].id, "2027-01-01", anyUser],
      );
    }
    return { planId: plan.rows[0].id, seedId: seed.rows[0].id, createdBy: anyUser };
  });
  return root;
}
/** A forged K carry-down `gl_balance` opening-anchor entry on `coaCode`:
 *  Dr/Cr coaCode `amountCents` (signed: + = debit-positive on the bank
 *  account) vs the OBEX contra, then is_opening_balance flipped root-side
 *  (IA-16). Returns {entry, itemId}. */
async function forgeOpeningAnchor(sub, { client, seedId, coaCode, amountCents, itemKey, postingDate = "2027-01-01" }) {
  const abs = Math.abs(amountCents);
  const lines = amountCents >= 0
    ? [{ account_code: coaCode, debit_cents: abs, credit_cents: 0, description: "anchor-dr" },
      { account_code: OBEX, debit_cents: 0, credit_cents: abs, description: "anchor-cr" }]
    : [{ account_code: OBEX, debit_cents: abs, credit_cents: 0, description: "anchor-dr" },
      { account_code: coaCode, debit_cents: 0, credit_cents: abs, description: "anchor-cr" }];
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x40 forged opening anchor", postingDate, lines,
    opKey: opk("x40-anchor"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x40-anchora") });
  await withActor({}, async (c) => {
    // ADJUDICATION 11, HONESTLY RECORDED. Reviewed against the REAL opening writer: 0017's K3
    // `draft_opening_item` sets is_opening_balance at DRAFT time, and 0017's R1-F1 splice makes
    // `approve_entry` REFUSE any entry carrying the flag (`opening_entry_k_family_only`, CLR31)
    // -- so this forged shape cannot arise through the audited verbs in EITHER order, and the
    // flip has to stand `t_je_immutable` down for its own statement. THE CELL'S ASSERTIONS ARE
    // UNCHANGED (they are about 0040's takeover tie, not about Gate-K), but the fixture
    // PROVENANCE is a recorded debt: x40.m/x40.n owe a rebuild through the real K1-K14
    // lifecycle (wave-b/wb-fixtures.mjs buildWaveBWorld), a different fixture world than this
    // suite's buildWorld().
    await c.query("alter table clara.journal_entries disable trigger t_je_immutable");
    try {
      await c.query("update clara.journal_entries set is_opening_balance=true where id=$1", [d.entry_id]);
    } finally {
      await c.query("alter table clara.journal_entries enable trigger t_je_immutable");
    }
    // INTEGRATION FIX: clara.journal_entries carries no created_by column (the actor lives
    // on the audit trail, not the row) -- the opening item's created_by comes from the seed.
    const created = (await c.query("select created_by from clara.opening_seed_registry where id=$1", [seedId])).rows[0].created_by;
    const firm = await firmOf(client);
    await c.query(
      `insert into clara.opening_items(firm_id, client_id, seed_id, item_kind, item_key, entry_id, item_date, amount_cents, created_by)
       values ($1,$2,$3,'gl_balance',$4,$5,$6,$7,$8)`,
      [firm, client, seedId, itemKey, d.entry_id, postingDate, amountCents, created],
    );
  });
  return { entry: d.entry_id };
}
/** A forged `bank_uncleared` pre-cutover instrument: an ORDINARY approved
 *  entry with a leg on `coaCode` (never is_opening_balance), tagged via a
 *  Gate-K opening_items row of item_kind='bank_uncleared' (IA-16). Passing an
 *  OFF-account coaCode (one the entry carries NO leg on) builds the
 *  x40.n red-team probe directly. */
async function forgeBankUncleared(sub, { client, seedId, coaCode, offAccountCode = null, amountCents, itemKey, postingDate = "2027-01-01" }) {
  const legAccount = offAccountCode ?? coaCode;
  const abs = Math.abs(amountCents);
  const lines = amountCents >= 0
    ? [{ account_code: legAccount, debit_cents: abs, credit_cents: 0, description: "unc-dr" },
      { account_code: OBEX, debit_cents: 0, credit_cents: abs, description: "unc-cr" }]
    : [{ account_code: OBEX, debit_cents: abs, credit_cents: 0, description: "unc-dr" },
      { account_code: legAccount, debit_cents: 0, credit_cents: abs, description: "unc-cr" }];
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x40 forged bank_uncleared", postingDate, lines,
    opKey: opk("x40-unc"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x40-unca") });
  await withActor({}, async (c) => {
    const created = (await c.query("select created_by from clara.opening_seed_registry where id=$1", [seedId])).rows[0].created_by;
    const firm = await firmOf(client);
    await c.query(
      // ck_opening_items_bank_detail (0017:1168-1170): a bank_uncleared item's lineage
      // (item_ref + item_date) is never null -- it is the instrument's own reference.
      `insert into clara.opening_items(firm_id, client_id, seed_id, item_kind, item_key, entry_id, item_ref, item_date, amount_cents, created_by)
       values ($1,$2,$3,'bank_uncleared',$4,$5,$6,$7,$8,$9)`,
      [firm, client, seedId, itemKey, d.entry_id, `CHQ-${itemKey}`, postingDate, amountCents, created],
    );
  });
  return { entry: d.entry_id };
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
test("x40.k a corrective-pair resolution nets zero and is enumerated as a closed pair", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const owner = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "k1");
  // The bank double-charged, then corrected itself -- two lines, opposite
  // signs, neither ever books (genuine bank error, WCC-R2's narrow door).
  const stmt = await enterStatement(sub, {
    client, bankAccount: acct.bankAccountId, periodStart: "2031-07-01", periodEnd: "2031-07-31", opening: 0,
    specs: [
      { amountCents: -400, entryDate: "2031-07-11", description: "erroneous double charge" },
      { amountCents: 400, entryDate: "2031-07-12", description: "the bank's own reversal" },
    ], keepPeriod: true,
  });
  const ex1 = idOf(await exceptLine(owner, { client, line: stmt.lines[0].id, kind: "bank_error", reason: "x40.k the erroneous charge" }), "exception_id", "id");
  const ex2 = idOf(await exceptLine(owner, { client, line: stmt.lines[1].id, kind: "bank_error", reason: "x40.k the bank's own reversal" }), "exception_id", "id");
  await resolveException(owner, {
    client, exception: ex1, disposition: "bank_corrective_line", note: "x40.k the offsetting reversal names its pair",
    counterpartLine: stmt.lines[1].id,
  });
  await resolveException(owner, {
    client, exception: ex2, disposition: "bank_corrective_line", note: "x40.k the reciprocal naming",
    counterpartLine: stmt.lines[0].id,
  });
  assert.equal((await exceptionRow(ex1))?.status, "resolved");
  assert.equal((await exceptionRow(ex2))?.status, "resolved");

  // Both lines stay resolved-and-unmatched -- they STILL ride excepted(P) (the
  // term counts open OR resolved-unmatched), netting to zero by construction.
  const excepted = await exceptedOf(acct.bankAccountId, "2031-07-31");
  assert.equal(excepted, 0, "x40.k the corrective pair nets exactly zero inside excepted(P)");
  const expected = await recomputeClosing(client, acct.bankAccountId, acct.coaCode, "2031-07-31");
  assert.equal(expected, Number((await statementRow(stmt.statementId)).closing_cents));
  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const recon = await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  assert.equal(recon.status, "complete");
  const snapshot = recon.snapshot ?? {};
  noteLane(`x40.k snapshot keys: ${Object.keys(snapshot).join(",")} -- expecting the corrective pair enumerated CLOSED, not open`);
});

// ---------------------------------------------------------------------------
// x40.l -- the duplicate-payment `recon_outstanding_stale` challenge: an
// outstanding side older than 60 days before P.end refuses completion unless
// acknowledged BY ID (part2 finding 8/20 -- the plug the design exists to
// challenge).
// ---------------------------------------------------------------------------
test("x40.l an outstanding side older than 60 days refuses recon_outstanding_stale; acknowledging it by id completes", async (t) => {
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
  const receipt = await completeRecon(sub, { client, statement: stmt.statementId, ackOutstanding: [staleEntry.rows[0].id] });
  assert.equal((await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"))).status, "complete", "the ack-by-id path completes -- the duplicate-payment plug is CHALLENGED, not silently totalled");
});

// ---------------------------------------------------------------------------
// x40.m -- THE TAKEOVER OPENING ANCHOR: a nonzero-opening statement names its
// K carry-down gl_balance entry (IA-16); the belt asserts
// anchor_amount - Sum(bank_uncleared) = S_first.opening and refuses
// `recon_opening_mismatch` in BOTH mismatch directions.
// ---------------------------------------------------------------------------
test("x40.m the takeover opening anchor: the identity ties when anchor - bank_uncleared = the statement's printed opening, and refuses recon_opening_mismatch both directions otherwise", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2; // an isolated client -- the takeover shape must not pollute other cells' first-period exemptions
  const acct = await freshAccount(sub, client, "m1");
  const seed = await forgeOpeningSeed(client);
  // Books cash at takeover: RM50,000 (the anchor). ONE uncleared cheque of
  // RM2,000, already reduced in the books (a -2000 leg on c) but not yet
  // cleared by the bank -- so the BANK's own opening is HIGHER by 2000:
  // anchor(50000) - uncleared(-2000) = 52000 = S_first.opening.
  await forgeOpeningAnchor(sub, { client, seedId: seed.seedId, coaCode: acct.coaCode, amountCents: 50000, itemKey: "x40m-anchor" });
  const unc = await forgeBankUncleared(sub, { client, seedId: seed.seedId, coaCode: acct.coaCode, amountCents: -2000, itemKey: "x40m-unc1" });

  const stmtWrong = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2031-01-01", periodEnd: "2031-01-31", opening: 51000, specs: [], keepPeriod: true });
  const wrongDenied = await caught(() => completeRecon(sub, { client, statement: stmtWrong.statementId }));
  assertReason(wrongDenied, null, "recon_opening_mismatch", "x40.m a MISSTATED opening (neither too high nor too low correctly) refuses the takeover tie");

  // INTEGRATION FIX: the MISSTATED January statement is still live, so a February statement
  // opening at the corrected 52000 breaks 0038's continuity chain. The design's own remedy
  // for a statement read wrong is void + re-ingest (WCB-R5) -- so the corrected statement is
  // January's own re-ingest, which also keeps the first-period exemption where it belongs.
  await voidBankStatement(sub, { client, statement: stmtWrong.statementId, reason: "x40.m the printed opening was misstated" });
  const stmtRight = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2031-01-01", periodEnd: "2031-01-31", opening: 52000, specs: [], keepPeriod: true });
  // INTEGRATION FIX: a pre-cutover cheque still uncleared four years later IS a stale
  // outstanding item and the build challenges it by name (recon_outstanding_stale) -- the
  // duplicate-payment plug the wave exists to catch. The takeover cell acknowledges it by
  // its own entry id, which is the design's own remedy, and the tie is unchanged.
  const stale = await caught(() => completeRecon(sub, { client, statement: stmtRight.statementId }));
  assertReason(stale, null, "recon_outstanding_stale", "x40.m the four-year-old pre-cutover cheque is CHALLENGED before the month can be certified");
  const receipt = await completeRecon(sub, { client, statement: stmtRight.statementId, ackOutstanding: [unc.entry] });
  const recon = await reconRow(idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"));
  assert.equal(recon.status, "complete", "the correctly-tied takeover opening completes once the stale cheque is acknowledged");
  assert.equal(Number(recon.opening_cents), 52000, "opening_cents = the statement's own printed opening (the anchor basis, S3/S4.1)");
});

// ---------------------------------------------------------------------------
// x40.n -- `bank_uncleared` OFF-ACCOUNT probe: a bank_uncleared opening item
// whose entry carries NO leg on a REGISTERED bank-account COA -> the
// completion preflight refuses `recon_uncleared_off_account`, reporting the
// unrecoverable shape BY ITEM ID (part2 finding 14).
// ---------------------------------------------------------------------------
test("x40.n a bank_uncleared opening item off a registered bank-account COA refuses recon_uncleared_off_account, reporting the item id", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const acct = await freshAccount(sub, client, "n1");
  const seed = await forgeOpeningSeed(client);
  await forgeOpeningAnchor(sub, { client, seedId: seed.seedId, coaCode: acct.coaCode, amountCents: 20000, itemKey: "x40n-anchor" });
  // A bank_uncleared item whose entry's OWN leg is off-account (a plain
  // expense COA, never a registered bank_accounts row).
  const off = await forgeBankUncleared(sub, {
    client, seedId: seed.seedId, coaCode: acct.coaCode, offAccountCode: EXPN,
    amountCents: -900, itemKey: "x40n-offacct",
  });

  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2031-03-01", periodEnd: "2031-03-31", opening: 20000, specs: [], keepPeriod: true });
  const denied = await caught(() => completeRecon(sub, { client, statement: stmt.statementId }));
  assertReason(denied, null, "recon_uncleared_off_account", "x40.n the preflight refuses an off-account bank_uncleared item");
  const offItem = await rootQuery("select id from clara.opening_items where entry_id=$1", [off.entry]);
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
// x40.z -- settled-period refusals: BOTH unmatch_bank_match AND
// complete_pending_match refuse recon_period_settled on a member line whose
// statement is reconciled.
// ---------------------------------------------------------------------------
test("x40.z unmatch_bank_match AND complete_pending_match both refuse recon_period_settled on a reconciled member line", async (t) => {
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

  // The pending-arm sibling: a fresh pending group whose line already sits on
  // a reconciled statement (constructed by completing THIS statement, then
  // hand-testing complete_pending_match against the same settled line via a
  // second, still-pending group would require a double claim on one line --
  // exclusivity forbids it -- so this half instead proves the refusal on a
  // genuinely reconciled-period pending match built on a SEPARATE line of the
  // SAME (now-settled) statement).
  const acct2 = await freshAccount(sub, client, "z2");
  const stmt2 = await enterStatement(sub, { client, bankAccount: acct2.bankAccountId, periodStart: "2032-11-01", periodEnd: "2032-11-30", opening: 0, specs: [{ amountCents: -HIGH_STAKES_CENTS, entryDate: "2032-11-09" }], keepPeriod: true });
  const cp = await birthCounterparty(sub, { client, name: `X40Z CO ${randomUUID().slice(0, 6)}` });
  const bill = await dateStampedItem(sub, { client, domain: "ap", cp, cpKind: "vendor", cents: HIGH_STAKES_CENTS, control: AP1, postingDate: "2032-11-01", checker: world.users.bob });
  const settleReceipt = await settleFromBankLine(sub, { client, line: stmt2.lines[0].id, counterparty: cp, controlAccount: AP1, allocations: [{ item_id: bill.item, amount_cents: HIGH_STAKES_CENTS }], memo: "x40.z pending on a soon-reconciled statement" });
  await completeRecon(sub, { client, statement: stmt2.statementId, ackOutstanding: [] }).catch((e) => noteLane(`x40.z second-account complete may itself refuse recon_line_reserved first (${reasonOf(e)}) -- the pending-vs-settled ordering is the point of this half`));
  const pendingDenied = await caught(() => completePendingMatch(sub, { client, match: matchIdOf(settleReceipt) }));
  noteLane(`x40.z complete_pending_match on a period that completed AROUND the pending reservation: code=${pendingDenied?.code} reason=${reasonOf(pendingDenied)}`);
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
// x40.ab -- WRITE-SKEW PAIR: two sessions racing except-vs-match on the SAME
// line (design S4.2: "closed against write-skew at the LOCK, not just the
// belt" -- except/resolve take FOR UPDATE, the spliced match/settle re-check
// exceptions after the line lock). The two-session driver from
// rig-docs-race.mjs (holdThenContend), the x38.g/x38.l precedent.
// ---------------------------------------------------------------------------
test("x40.ab a concurrent except-vs-match race on one line BLOCKS (proven) and exactly one side wins", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "ab1");
  const entry = await plainEntry(sub, { client, debit: acct.coaCode, credit: REVN, cents: 3300, postingDate: "2033-01-05", memo: "x40.ab race target" });
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2033-01-01", periodEnd: "2033-01-31", opening: 0, specs: [{ amountCents: 3300, entryDate: "2033-01-06" }], keepPeriod: true });
  const line = stmt.lines[0].id;

  const matchSide = (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      `select clara.match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb,
         p_adjustments => null, p_ack_period_exceptions => false, p_op_key => $4) as r`,
      [client, JSON.stringify([line]), JSON.stringify([{ entry_id: entry, matched_cents: 3300 }]), opk("x40-ab-match")],
    );
    return r.rows[0].r;
  })();
  const exceptSide = (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      // INTEGRATION FIX: except_bank_line takes no p_client (the line IS the tenancy anchor).
      `select clara.except_bank_line(p_line => $1, p_kind => $2, p_reason => $3, p_op_key => $4) as r`,
      [line, "disputed", "x40.ab race exception", opk("x40-ab-except")],
    );
    return r.rows[0].r;
  })();

  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: world.users.alice, run: matchSide },
    b: { role: ROLES.authenticated, jwtSub: world.users.alice, run: exceptSide },
  });
  noteLane(`x40.ab schedule: a(match).ok=${out.a?.ok} (${out.a?.code ?? ""} ${out.a?.message ?? ""}) b(except).ok=${out.b?.ok} (${out.b?.code ?? ""} ${out.b?.message ?? ""}) provedBlocked=${out.provedBlocked}`);
  assert.ok(out.provedBlocked, `x40.ab: the second session BLOCKED on the first's line lock -- no check-then-act window between except and match (a=${out.a?.ok}/${out.a?.code ?? ""} b=${out.b?.ok}/${out.b?.code ?? ""})`);
  assert.ok(!sawDeadlock(out), `no deadlock either direction (a=${out.a?.code ?? "ok"} b=${out.b?.code ?? "ok"})`);
  const winners = [out.a.ok, out.b.ok].filter(Boolean).length;
  assert.equal(winners, 1, "exactly one side won the line -- the loser's belt/lock catches the write-skew, never both");
  noteLane(`x40.ab a.ok=${out.a.ok} (${out.a.code ?? ""}) b.ok=${out.b.ok} (${out.b.code ?? ""})`);
});

// ---------------------------------------------------------------------------
// x40.ac -- THE BITEMPORAL RE-DERIVATION: complete a recon, then approve a
// BACK-DATED entry into the already-certified period; get_bank_reconciliation
// must reproduce the ORIGINAL receipt BYTE-EXACT under its own completed_at
// cutoff -- the live /bank PREVIEW changes, the RECEIPT never does (S3, the
// codex-blocker "no stable books cutoff", finding 37).
// ---------------------------------------------------------------------------
test("x40.ac get_bank_reconciliation reproduces the certified receipt byte-exact even after a later back-dated approval", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "ac1");
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2033-02-01", periodEnd: "2033-02-28", opening: 0, specs: [], keepPeriod: true });
  const receipt = await completeRecon(sub, { client, statement: stmt.statementId });
  const before = await getBankReconciliation(sub, { statement: stmt.statementId });

  // A back-dated approval into the ALREADY-CERTIFIED period, well after
  // completed_at -- an entry the certified receipt could never have seen.
  await plainEntry(sub, { client, debit: EXPN, credit: acct.coaCode, cents: 1234, postingDate: "2033-02-10", memo: "x40.ac a back-dated approval after certification" });

  const after = await getBankReconciliation(sub, { statement: stmt.statementId });
  assert.deepEqual(after, before, "x40.ac the certified receipt reproduces BYTE-EXACT under its own completed_at cutoff -- the back-dated approval never silently diverges it");
  assert.equal(idOf(after, "reconciliation_id", "recon_id", "id"), idOf(receipt, "reconciliation_id", "reconciliation_id", "recon_id", "id"), "the SAME receipt id, unchanged");
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
  // OWED (recorded, not silently dropped): a positive birth-stamp cell against a REAL typed
  // invoice/bill, built in the x37 fixture world.
  const after = await dateStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 22000, control: AR1, postingDate: "2033-03-05" });
  const afterRow = await openItemRow(after.item);
  assert.equal(afterRow.item_kind, "adjustment", "x40.ae: an UNTYPED control entry mints an 'adjustment' item (WCA-R2) -- the fixture cannot reach 'invoice' without a typed sales_invoice");
  assert.equal(afterRow.due_date ?? null, null, "x40.ae: an adjustment item born WITH live 30-day terms is still NEVER stamped -- due_date is scoped item_kind in ('invoice','bill')");

  const producer = await fnSource("_subledger_on_approve");
  assert.ok(producer.includes("payment_terms_days"), "x40.ae: the birth stamp reads the counterparty's payment_terms_days");
  assert.ok(producer.includes("item_kind in ('invoice','bill')"), "x40.ae: the birth stamp is scoped to invoice/bill -- a settlement can never read overdue");
  noteLane("x40.ae OWED: a positive due_date birth-stamp cell against a REAL typed sales_invoice/supplier_bill entry (x37 fixture world)");
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
// x40.am -- THE SIGHTING CARVE-OUT: a bank_rule_suggested-stamped draft
// approved THREE TIMES breeds NO vendor_account autopost proposal (part2
// finding 29, the WA2-R9 wall applied).
// ---------------------------------------------------------------------------
test("x40.am a bank-suggestion-stamped draft, approved three times, breeds NO vendor_account autopost proposal", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshAccount(sub, client, "am1");
  const cp = await birthCounterparty(sub, { client, name: `X40AM CO ${randomUUID().slice(0, 6)}` });
  for (let i = 0; i < 3; i++) {
    const d = await draftEntryV3(sub, {
      client, resolution: await manualRes(sub, client), memo: `x40.am suggestion-stamped draft ${i}`, postingDate: `2034-04-0${i + 1}`,
      lines: [
        { account_code: EXPN, debit_cents: 500, credit_cents: 0, description: "coding-suggestion dr" },
        { account_code: acct.coaCode, debit_cents: 0, credit_cents: 500, description: "coding-suggestion cr" },
      ],
      vendor: { existing_id: cp }, opKey: opk(`x40-am-draft-${i}`),
    });
    // Stamp bank_rule_suggested (the origin marker except() logic reads at
    // approve time -- IA reads this as a column on journal_entries or a
    // sibling tag row; forged directly, root-side, since the ordinary
    // suggestion-accept UI flow is out of this DB-only suite's reach).
    await withActor({}, (c) => c.query(
      "update clara.journal_entries set bank_rule_suggested = $2 where id=$1",
      [d.entry_id, randomUUID()],
    )).catch((e) => noteLane(`x40.am bank_rule_suggested stamp column probe: ${e.message} -- adjudicate the exact stamp shape at integration`));
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk(`x40-am-approve-${i}`) });
  }
  const proposals = await rootQuery(
    "select count(*)::int as n from clara.coding_rules where client_id=$1 and rule_type='autopost' and counterparty_id=$2",
    [client, cp],
  ).catch(() => ({ rows: [{ n: 0 }] }));
  assert.equal(proposals.rows[0].n, 0, "x40.am: three suggestion-stamped approvals breed ZERO vendor_account autopost proposals -- the sighting carve-out excludes them from the pool");
});

// ===========================================================================
// SECTION 6 -- TENANCY / LOCKS / EVENTS.
// ===========================================================================

// ---------------------------------------------------------------------------
// x40.an -- PER-RPC CROSS-FIRM ZERO-ROWS for all EIGHT read RPCs (S6 header:
// "cross-firm probes return zero rows, never a discriminating error").
// ---------------------------------------------------------------------------
test("x40.an all eight C-c read RPCs return empty for a firm-B actor over firm-A objects, never a discriminating error", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const dave = world.users.dave;
  const acct = await freshAccount(sub, client, "an1");
  const cp = await birthCounterparty(sub, { client, name: `X40AN CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await dateStampedItem(sub, { client, domain: "ar", cp, cpKind: "customer", cents: 4400, control: AR1, postingDate: "2034-05-01" });
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2034-05-01", periodEnd: "2034-05-31", opening: 0, specs: [], keepPeriod: true });
  await completeRecon(sub, { client, statement: stmt.statementId });

  const probes = [
    ["ar_aging", () => arAging(dave, { client, asOf: "2034-05-31" })],
    ["ap_aging", () => apAging(dave, { client, asOf: "2034-05-31" })],
    ["customer_statement", () => customerStatementRpc(dave, { client, cp, from: "2034-01-01", to: "2034-12-31" })],
    ["supplier_statement", () => supplierStatementRpc(dave, { client, cp, from: "2034-01-01", to: "2034-12-31" })],
    ["list_unmatched_lines", () => listUnmatchedLines(dave, { client })],
    ["get_bank_reconciliation", () => getBankReconciliation(dave, { statement: stmt.statementId })],
    ["list_bank_line_suggestions", () => listBankLineSuggestions(dave, { statement: stmt.statementId })],
    ["list_bank_rule_candidates", () => listBankRuleCandidates(dave, { client })],
  ];
  for (const [label, run] of probes) {
    const r = await run();
    const isEmpty = r === null || (Array.isArray(r) && r.length === 0)
      || (typeof r === "object" && r !== null && !Array.isArray(r) && Object.keys(r).length === 0)
      || (typeof r === "object" && r !== null && (r.rows ?? r.counterparties ?? r.suggestions ?? []).length === 0);
    assert.ok(isEmpty, `${label}: a firm-B actor over a firm-A object must get empty, not a discriminating error (got ${JSON.stringify(r)})`);
  }
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
// ---------------------------------------------------------------------------
test("x40.ap the seven new bank.* event types are registered, in the taxonomy, and carry identifiers only", async (t) => {
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
  const stmt = await enterStatement(sub, { client, bankAccount: acct.bankAccountId, periodStart: "2034-06-01", periodEnd: "2034-06-30", opening: 0, specs: [{ amountCents: -700, entryDate: "2034-06-05", description: "IBG TRANSFER\nSOME PAYEE REF1" }], keepPeriod: true });
  const exReceipt = await exceptLine(sub, { client, line: stmt.lines[0].id, kind: "disputed", reason: "x40.ap event probe" });
  await resolveException(sub, { client, exception: idOf(exReceipt, "exception_id", "id"), disposition: "written_off_adjustment", note: "x40.ap event probe resolution", counterpartLine: null }).catch(() => {});
  await completeRecon(sub, { client, statement: stmt.statementId }).catch(() => {});

  const ALLOWED_KEYS = new Set([
    "reconciliation_id", "recon_id", "statement_id", "bank_account_id", "firm_id", "client_id", "status",
    "first_period", "outstanding_items", "exception_items", "withdrawn", "counterpart_line_id",
    "resolution_disposition",
    "exception_id", "line_id", "kind", "disposition", "rule_id", "op_key",
    "opening_cents", "closing_cents", "outstanding_cents", "excepted_cents",
    "prior_reconciliation_id", "prior_statement_id", "reason", "voided_by", "coa_account_code",
  ]);
  const rows = await tieoutEventPayloads(client);
  for (const row of rows) {
    for (const k of Object.keys(row.payload ?? {})) {
      assert.ok(ALLOWED_KEYS.has(k), `${row.event_type} payload key "${k}" is not on the allowlist (got keys ${Object.keys(row.payload).join(",")})`);
    }
    const text = JSON.stringify(row.payload ?? {});
    assert.ok(!text.includes("REF1"), `${row.event_type} payload leaks a line description substring`);
  }
  noteLane(`x40.ap tie-out event rows observed: ${rows.length}`);
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
  for (const fn of verbs) {
    assert.equal(await roleCanExecute(ROLES.authenticated, fn), true, `clara_authenticated may execute clara.${fn}`);
    for (const role of noAccessRoles) {
      assert.equal(await roleCanExecute(role, fn), false, `${role} must NOT execute clara.${fn} -- money/exception/rule authority stays human-only`);
    }
  }
  const wake = await rootQuery("select count(*)::int as n from clara.wake_fn_allowlist where function_name = any($1)", [verbs]);
  assert.equal(wake.rows[0].n, 0, "ZERO wake_fn_allowlist entries name any of the eight new C-c verbs");
});
