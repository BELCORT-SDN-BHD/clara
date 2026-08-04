// Wave D-b (0042) rig — the AF-2 composite + the `bank_rule_suggested` producer:
// this lane's OWN helper CORE (NOT a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it). The fixture WORLD + readbacks live
// in the sibling `x42-af2-world.mjs`, which re-exports this file so a test
// imports ONE module (the x41-fa-fixtures / x41-fa-world split precedent, kept
// because the repo's 500-line-per-file gate is enforced).
//
// CONTRACT-BLIND, the x37/x38/x40/x41 discipline. Written straight from
// `docs/plan/wave-d-b-design.md` §4/§5/§7 + `docs/plan/wave-d-b-design-abi.md`
// (§A signatures, §B flags keys, §E op keys, §F refusal tokens, §G event
// payloads) + `docs/plan/wave-d-contract.md` §4 — plus the LIVE 0037/0038/0040
// bank world this lane builds its fixtures through. It NEVER reads a 0042
// migration file or any build-0042 section file. Every verb is called by its
// PINNED name with NAMED args; every refusal is asserted by its pinned DETAIL
// reason token (ABI §F, which the design calls LAW). A 42883 / param-name /
// token divergence at integration is a FINDING for orchestrator adjudication,
// never a silent test edit. (The C-b lesson: three production bugs were caught
// only by contract-authored cells.)
//
// DATES. Nothing in this lane is due-ness-evaluated, so bank periods are stated
// literals in their own far-future decade (the x40 idiom, `keepPeriod: true`) —
// the MYT DB-clock law binds the adjustment/depreciation posters, not statements.
// Every cell allocates its OWN bank account and its OWN statement period, because
// every C-c identity term is account-scoped and ALL-TIME.
//
// INTERFACE ASSUMPTIONS (recorded ONCE here, not per call site — a divergence at
// integration is expected and is a FINDING, not a surprise):
//
//   IA-1  `resolve_and_book_bank_line` takes the ABI §A argument list verbatim
//         (p_client, p_exception, p_disposition, p_note, p_draft, p_allocations,
//         p_adjustments, p_advance_applications, p_charge_cents, p_charge_account,
//         p_attestation, p_op_key). Optional arguments are OMITTED unless a cell
//         passes one, so a signature that defaults them differently still binds.
//   IA-2  THE TWO BOOKING ROUTES. The ABI §E op-key matrix names BOTH `<op>:settle`
//         (`_settle_from_bank_line_core`) and `<op>:draft` + `<op>:match`
//         (draft_entry + match_bank_line), so the composite is read as supporting
//         both:
//           * ROUTE S — the SETTLEMENT leg: `p_allocations` (the live
//             allocate_receipt / allocate_payment `[{item_id, amount_cents}]`
//             shape) drives `_settle_from_bank_line_core`; the counterparty is
//             DERIVED from the named open items, because the composite carries no
//             p_counterparty and the high-stakes park branch (which refuses
//             p_draft outright) still books a settlement leg. `p_charge_cents` /
//             `p_charge_account` are the settle verb's own charge slot.
//           * ROUTE M — the HAND-DRAFT booking: `p_draft` = {posting_date, memo,
//             lines, counterparty?} mints an inline-resolution (confidence 1.0)
//             draft, approves it, and matches the line to it; `p_adjustments` is
//             match_bank_line's `[{account_code, amount_cents, memo?}]` shape.
//         A build that reads `p_draft` as SHAPING the settlement entry rather
//         than as its own entry will fail the route-M group-tie assertions —
//         that is exactly the divergence this lane exists to surface, and it is
//         a FINDING for adjudication, never a silent test edit.
//   IA-3  THE EXCEPTIONS SURFACE (design §4: "the exceptions table badges
//         'resolution parked'"). The design names no RPC, so `parkedBadgeFor()`
//         probes, in order, a dedicated `list_bank_line_exceptions(p_client)` and
//         then the LIVE `get_bank_reconciliation(p_statement)` preview snapshot's
//         `exceptions[]` enumeration, asserting the parked datum wherever the
//         exception row is actually rendered.
//   IA-4  `accept_bank_rule_suggestion(p_client, p_line, p_rule, p_op_key)` →
//         `{entry_id}` (ABI §A) — bookkeeper floor.
//   IA-5  `enrol_staff_advance_account(p_client, p_account_code, p_person_label,
//         p_confirm_dedicated, p_attestation, p_op_key)` → admin+ (ABI §A). Only
//         the AF-2 advance-payload cell needs it; the advance battery itself is a
//         different lane's scope.
//   IA-6  The park's declaration is stored on `clara.bank_matches` as
//         `pending_resolution jsonb` + `resolution_exception_id uuid` (ABI §D's
//         `bank_matches` ALTER) — read back by column name.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { humanQuery, namedCall, opk, reasonOf, noteLane, markSkip } from "./a21-helpers.mjs";
import {
  EXPN as X38_EXPN, REVN as X38_REVN,
  hasBankMatching, caught,
  matchRow, lineMemberRows, entryMemberRows, lineGroupStatus, assertGroupTies,
  manualRes, openItemsOf, outstandingOf, matchIdOf,
  addBankAccount, enterStatement, voidBankStatement,
  matchBankLine, unmatchBankMatch, settleFromBankLine, completePendingMatch,
  birthCounterparty,
} from "./x38-match-fixtures.mjs";

// The 0038 bank toolkit is re-exported wholesale so every x42 cell reaches the
// bank world through ONE import (the toolkit is never re-implemented here).
export {
  caught, hasBankMatching, X38_EXPN, X38_REVN,
  matchRow, lineMemberRows, entryMemberRows, lineGroupStatus, assertGroupTies,
  manualRes, openItemsOf, outstandingOf, matchIdOf,
  addBankAccount, enterStatement, voidBankStatement,
  matchBankLine, unmatchBankMatch, settleFromBankLine, completePendingMatch,
  birthCounterparty,
};

// ---------------------------------------------------------------------------
// Suite-scoped COA codes. Grammar '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$' (0009
// O9) — the suffix is at most FOUR characters. Every code is this wave's OWN
// ("-B42" — this AF-2/producer lane's OWN suffix, grepped clean against the
// sibling x42 lanes' -D42 / -V42, x38's -C38, x40's -C40/-C4xx and x41's -D41).
// ---------------------------------------------------------------------------

export const BANKCOA = "170-B42"; // the bank GL account (asset, non-control)
export const AR1 = "370-B42"; // receivable control
export const AP1 = "470-B42"; // payable control
export const EXPN = "570-B42"; // an ordinary expense
export const REVN = "680-B42"; // revenue
export const CHARGEX = "571-B42"; // bank charge expense — the settle charge slot
export const ADJX = "572-B42"; // an expense adjustment target (match p_adjustments)
export const ADVCODE = "180-B42"; // the staff-advance account (asset, non-control)
export const CODEACC = "573-B42"; // the coding rule's proposal account

export const CLR04 = "CLR04";
export const CLR10 = "CLR10";
export const CLR11 = "CLR11";
export const CLR39 = "CLR39";

/** Refusal reason tokens — ABI §F. These spellings are LAW for both lanes, and
 *  the DETAIL {"reason": …} discriminant is where the ABI pins them. */
export const T = {
  dispositionUnsupported: "disposition_unsupported",
  pendingAncillary: "pending_branch_ancillary_unsupported",
  pendingResolutionStale: "pending_resolution_stale",
  reopenBlocked: "exception_reopen_blocked",
  dispositionUnbooked: "disposition_unbooked", // inherited — the 0040 belt
  suggestionOutstanding: "suggestion_outstanding",
  suggestionStale: "suggestion_stale",
  proposalNotRevisable: "proposal_not_revisable",
  approveKeyCollision: "approve_key_collision",
  // Inherited 0038/0040 tokens the "ordinary groups keep their unconditional
  // refusals" probes assert UNCHANGED.
  lineExcepted: "line_excepted",
  reconPeriodSettled: "recon_period_settled",
  alreadyResolved: "already_resolved",
  alreadyMatched: "already_matched",
  lineAlreadyMatched: "line_already_matched",
  matchNotPending: "match_not_pending",
};

/** The ABI §G event this lane's reopen arm mints. */
export const EV_REOPENED = "bank.line_exception_reopened";

/** The FIVE resolution columns the reopen NULLs (0040's own lifecycle set — the
 *  transition trigger's comparison set is those five plus `status`). */
export const RESOLUTION_COLUMNS = [
  "resolved_by", "resolved_at", "resolution_disposition", "resolution_note", "counterpart_line_id",
];

export const uniq = () => randomUUID().slice(0, 6);

// ---------------------------------------------------------------------------
// Readiness. The gate is the 0037–0040 SUBSTRATE (bank matching present), NEVER
// a 0042 schema_migrations row: cells that need 0042 objects MUST fail until
// assembly — that is the correct, intended red-first state (the x40 discipline).
// ---------------------------------------------------------------------------

export async function af2SubstrateReady() {
  return hasBankMatching();
}

/** Loud + COUNTED skip (the house skip16 / x37 skipHere discipline): a dormant
 *  suite must show up in printSkipCount, never quietly green. */
export function skipAf2(t, live, label = "the Wave-D-b AF-2 battery") {
  if (!live) {
    markSkip();
    t.skip(`0037/0038/0040 bank substrate absent (clara.bank_matches / clara.match_bank_line not found) — ${label} is dormant`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Refusal assertions — by NAMED REASON TOKEN (ABI §F pins DETAIL), with the
// message text as a recorded fallback so a migration that names the rule in
// prose but drops the discriminant is a LANE NOTE (a finding), not a false red.
// ---------------------------------------------------------------------------

export async function refuses(fn, token, label) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected the NAMED refusal '${token}' but the call SUCCEEDED`);
  const got = reasonOf(err);
  if (got === token) return err;
  const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
  assert.ok(
    blob.includes(token),
    `${label}: expected the named refusal '${token}'; got reason='${got ?? "(none)"}' code=${err.code ?? "(none)"} — ${err.message}`,
  );
  noteLane(`${label}: '${token}' matched in the message text, not the DETAIL {"reason":…} discriminant — finding (ABI §F pins DETAIL)`);
  return err;
}

/** fn() MUST refuse with ONE of `tokens` — used only where the design states the
 *  precondition but assigns no single token to it (e.g. the exactly-one state
 *  machine, which may answer `already_resolved` or `already_matched` depending
 *  on which wall is reached first). The observed token is RECORDED so the
 *  divergence is visible rather than silently tolerated. */
export async function refusesOneOf(fn, tokens, label) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected a NAMED refusal (one of ${tokens.join(" / ")}) but the call SUCCEEDED`);
  const got = reasonOf(err);
  const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
  const hit = tokens.find((tok) => got === tok || blob.includes(tok));
  assert.ok(
    hit,
    `${label}: expected one of ${tokens.join(" / ")}; got reason='${got ?? "(none)"}' code=${err.code ?? "(none)"} — ${err.message}`,
  );
  noteLane(`${label}: refused by '${hit}'`);
  return err;
}

/** Assert a refusal carries BOTH the pinned SQLSTATE and the pinned token. */
export async function refusesWithCode(fn, code, token, label) {
  const err = await refuses(fn, token, label);
  assert.equal(err.code, code,
    `${label}: ABI §F pins errcode ${code} for '${token}' (got ${err.code ?? "(none)"} — ${err.message})`);
  return err;
}

// ---------------------------------------------------------------------------
// PINNED VERB WRAPPERS — NAMED args verbatim from ABI §A. Optional trailing
// params are omitted unless the cell passes one (the x38 settleFromBankLine
// idiom), so a differently-defaulted signature still binds.
// ---------------------------------------------------------------------------

const J = (v) => JSON.stringify(v);

/** THE AF-2 COMPOSITE (ABI §A; owner floor). `undefined` means "do not send the
 *  argument at all"; an explicit `null` IS sent, so the park's ancillary-refusal
 *  cells can probe a stated-but-empty argument. */
export async function resolveAndBookBankLine(sub, {
  client, exception, disposition, note = "x42 resolution note",
  draft = undefined, allocations = undefined, adjustments = undefined,
  advanceApplications = undefined, chargeCents = undefined, chargeAccount = undefined,
  attestation = undefined, opKey = null,
}) {
  const specs = [{ name: "p_client" }, { name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" }];
  const vals = [client, exception, disposition, note];
  if (draft !== undefined) { specs.push({ name: "p_draft", cast: "jsonb" }); vals.push(draft === null ? null : J(draft)); }
  if (allocations !== undefined) { specs.push({ name: "p_allocations", cast: "jsonb" }); vals.push(allocations === null ? null : J(allocations)); }
  if (adjustments !== undefined) { specs.push({ name: "p_adjustments", cast: "jsonb" }); vals.push(adjustments === null ? null : J(adjustments)); }
  if (advanceApplications !== undefined) {
    specs.push({ name: "p_advance_applications", cast: "jsonb" });
    vals.push(advanceApplications === null ? null : J(advanceApplications));
  }
  if (chargeCents !== undefined) { specs.push({ name: "p_charge_cents", cast: "bigint" }); vals.push(chargeCents); }
  if (chargeAccount !== undefined) { specs.push({ name: "p_charge_account" }); vals.push(chargeAccount); }
  if (attestation !== undefined) { specs.push({ name: "p_attestation" }); vals.push(attestation); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("x42af2"));
  const r = await humanQuery(sub, namedCall("resolve_and_book_bank_line", specs), vals);
  return r.rows[0].result;
}

/** THE PRODUCER (ABI §A; bookkeeper floor). */
export async function acceptBankRuleSuggestion(sub, { client, line, rule, opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("accept_bank_rule_suggestion", [
      { name: "p_client" }, { name: "p_line" }, { name: "p_rule" }, { name: "p_op_key" },
    ]),
    [client, line, rule, opKey ?? opk("x42accept")],
  );
  return r.rows[0].result;
}

/** Staff-advance enrolment (ABI §A; admin+) — the AF-2 advance-payload cell only. */
export async function enrolStaffAdvanceAccount(sub, {
  client, accountCode, personLabel = "x42 staff member", confirmDedicated = true,
  attestation = "x42: a dedicated staff advance control, not a related-party balance", opKey = null,
}) {
  const r = await humanQuery(
    sub,
    namedCall("enrol_staff_advance_account", [
      { name: "p_client" }, { name: "p_account_code" }, { name: "p_person_label" },
      { name: "p_confirm_dedicated" }, { name: "p_attestation" }, { name: "p_op_key" },
    ]),
    [client, accountCode, personLabel, confirmDedicated, attestation, opKey ?? opk("x42enrol")],
  );
  return r.rows[0].result;
}

// --- the LIVE 0040 exception / rule / reconciliation verbs this lane builds
// fixtures through. The design's own IA (x40's assembly finding): these carry NO
// p_client lead — the tenancy anchor is reachable from the named line, exception,
// rule or statement. The `client` option is kept so call sites read the same as
// every other wrapper.

export async function exceptLine(sub, { client, line, kind = "bank_error", reason = "x42 exception", opKey = null }) {
  void client;
  const r = await humanQuery(
    sub,
    namedCall("except_bank_line", [{ name: "p_line" }, { name: "p_kind" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [line, kind, reason, opKey ?? opk("x42except")],
  );
  return r.rows[0].result;
}

export async function resolveException(sub, {
  client, exception, disposition, note = "x42 direct resolution", counterpartLine = null, opKey = null,
}) {
  void client;
  const specs = [{ name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" }];
  const vals = [exception, disposition, note];
  if (counterpartLine != null) { specs.push({ name: "p_counterpart_line" }); vals.push(counterpartLine); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("x42resolve"));
  const r = await humanQuery(sub, namedCall("resolve_bank_line_exception", specs), vals);
  return r.rows[0].result;
}

export async function proposeRule(sub, { client, kind = "coding", pattern, proposal, opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("propose_bank_rule", [
      { name: "p_client" }, { name: "p_kind" }, { name: "p_pattern", cast: "jsonb" },
      { name: "p_proposal", cast: "jsonb" }, { name: "p_op_key" },
    ]),
    [client, kind, J(pattern), J(proposal), opKey ?? opk("x42prule")],
  );
  return r.rows[0].result;
}

export async function signRule(sub, { rule, opKey = null }) {
  const r = await humanQuery(
    sub, namedCall("sign_bank_rule", [{ name: "p_rule" }, { name: "p_op_key" }]),
    [rule, opKey ?? opk("x42srule")],
  );
  return r.rows[0].result;
}

export async function retireRule(sub, { rule, reason = "x42 retire rule", opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("retire_bank_rule", [{ name: "p_rule" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [rule, reason, opKey ?? opk("x42rrule")],
  );
  return r.rows[0].result;
}

export async function completeRecon(sub, { statement, ackOutstanding = [], opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("complete_bank_reconciliation", [
      { name: "p_statement" }, { name: "p_ack_outstanding", cast: "uuid[]" }, { name: "p_op_key" },
    ]),
    [statement, ackOutstanding, opKey ?? opk("x42recon")],
  );
  return r.rows[0].result;
}

export async function getBankReconciliation(sub, { statement }) {
  const r = await humanQuery(sub, "select clara.get_bank_reconciliation(p_statement => $1) as r", [statement]);
  return r.rows[0].r;
}

export async function listUnmatchedLines(sub, { client }) {
  const r = await humanQuery(sub, "select clara.list_unmatched_lines(p_client => $1) as r", [client]);
  return r.rows[0].r;
}

/** withdraw_draft(p_entry, p_reason, p_expected_revision, p_op_key) — the remedy
 *  every arm-(3) `suggestion_stale` message NAMES. A refusal whose named remedy
 *  is itself refused is the walled-corridor class the as-built ladder rules a
 *  defect, so the cells exercise the remedy rather than assuming it. */
export async function withdrawDraft(sub, { entry, reason = "x42 withdraw", expectedRevision, opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("withdraw_draft", [
      { name: "p_entry" }, { name: "p_reason" },
      { name: "p_expected_revision" }, { name: "p_op_key" },
    ]),
    [entry, reason, expectedRevision, opKey ?? opk("x42withdraw")],
  );
  return r.rows[0].result;
}

/** revise_entry, called with its LIVE 8-arg shape (x41.k3's assembly note: the
 *  p_proposed_counterparty + p_evidence pair sits between p_lines and
 *  p_expected_revision, neither defaulted — a 4-arg named call is 42883). */
export async function reviseEntry(sub, { entry, lines, expectedRevision, opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("revise_entry", [
      { name: "p_entry" }, { name: "p_lines", cast: "jsonb" },
      { name: "p_proposed_counterparty", cast: "jsonb" }, { name: "p_evidence", cast: "jsonb" },
      { name: "p_expected_revision" }, { name: "p_op_key" },
    ]),
    [entry, J(lines), null, null, expectedRevision, opKey ?? opk("x42revise")],
  );
  return r.rows[0].result;
}
