// Wave C-c — tie-out, aging, learn loop: the /bank recon pane's pure model
// (design v2.1 §3/§4/§5/§6). PURE: zero network, zero React — mirrors
// model.ts/matchModel.ts's split (repo file-size discipline). Every cents
// figure here is a DB-owned value from get_bank_reconciliation's receipt or
// derived-preview shape; this module renders/labels/gates, it NEVER computes a
// financial figure — the one exception, matching the tieBannerState precedent
// in ./model.ts, is a single equality check (`ties = difference_cents === 0`)
// on numbers the DB already computed, never a new sum.

// READ SHAPE — PINNED AGAINST THE REAL MIGRATION (0040, assembly).
// This file was written before 0040 existed and guessed at
// get_bank_reconciliation's JSON. It has since been CORRECTED against the
// shipped SQL, which is authoritative. The real envelope is FLAT (never a
// nested `terms` object) and identical in both branches except for the
// `preview` flag:
//   preview:false (a persisted receipt) — reconciliation_id · statement_id ·
//     bank_account_id · coa_account_code · prior_statement_id ·
//     prior_reconciliation_id · period_start · period_end · status ·
//     opening_cents · gl_balance_cents · closing_cents · outstanding_cents ·
//     excepted_cents · completed_by · completed_at · first_period ·
//     precondition_met · chain_ok · stale_outstanding_ids · snapshot
//   preview:true (the live derivation) — the same money keys plus
//     difference_cents, and no completed_*/reconciliation_id.
// The `snapshot` object carries: terms{gl_prime_cents · uncleared_cents ·
// capacity_prime_cents · outstanding_cents · excepted_cents ·
// matched_line_cents} · outstanding_entry_sides · outstanding_line_sides ·
// outstanding_group_items · exceptions · bank_uncleared_opening ·
// reversal_pairs_excluded · acknowledged_outstanding · the opening-anchor
// terms · cutoff.
// Every mapper stays DEFENSIVE (the model.ts toXxx idiom) and keeps the old
// key names as fallbacks, so a near-miss shape still renders rather than
// throwing — but the FIRST key read on every line below is the real one.

// ---------------------------------------------------------------------------
// Defensive helpers (the model.ts/reviewCardTypes.ts idiom, kept local so this
// file stays a self-contained pure module).
// ---------------------------------------------------------------------------

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function bool(v: unknown, dflt = false): boolean {
  return typeof v === "boolean" ? v : dflt;
}
function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function strArr(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === "string");
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The §3 identity terms — the DB's numbers, rendered verbatim (receipt: the
// STORED values under the bitemporal cutoff; preview: the LIVE derivation).
// ---------------------------------------------------------------------------

export type ReconTermSet = {
  opening_anchor_cents: number | null;
  gl_prime_cents: number | null;
  uncleared_total_cents: number | null;
  unmatched_capacity_prime_cents: number | null;
  excepted_cents: number | null;
  computed_closing_cents: number | null;
  statement_closing_cents: number | null;
  difference_cents: number | null;
};

/** `raw` is the RPC envelope itself; the two split terms (uncleared vs
 *  capacity) live only inside `snapshot.terms`, because the RECEIPT stores
 *  their SUM in one `outstanding_cents` column (design §4.1's stated binding).
 *  On a completed receipt `difference_cents` is absent and is exactly zero by
 *  construction — completion refuses otherwise — so it is read as 0 rather
 *  than left null, which would fail-close a receipt that is definitionally
 *  tied. */
function toTermSet(raw: unknown): ReconTermSet {
  const o = rec(raw);
  const snap = rec(o.snapshot);
  const st = rec(snap.terms);
  const isReceipt = o.preview === false || s(o.status) === "complete" || s(o.status) === "void";
  const opening = numOrNull(o.opening_cents) ?? numOrNull(snap.opening_anchor_cents);
  const closing = numOrNull(o.closing_cents) ?? numOrNull(snap.statement_closing_cents);
  return {
    opening_anchor_cents: opening,
    gl_prime_cents: numOrNull(o.gl_balance_cents) ?? numOrNull(st.gl_prime_cents),
    uncleared_total_cents: numOrNull(st.uncleared_cents) ?? numOrNull(o.outstanding_cents),
    unmatched_capacity_prime_cents:
      numOrNull(st.capacity_prime_cents) ?? numOrNull(o.unmatched_capacity_prime_cents),
    excepted_cents: numOrNull(o.excepted_cents) ?? numOrNull(st.excepted_cents),
    computed_closing_cents: closing,
    statement_closing_cents: numOrNull(snap.statement_closing_cents) ?? closing,
    difference_cents: numOrNull(o.difference_cents) ?? (isReceipt ? 0 : null),
  };
}

export type ReconOutstandingEntrySide = {
  entry_id: string;
  posting_date: string | null;
  age_days: number | null;
  amount_cents: number | null;
};

function toOutstandingEntrySide(raw: unknown): ReconOutstandingEntrySide {
  const o = rec(raw);
  return {
    entry_id: s(o.entry_id) ?? s(o.id) ?? "",
    posting_date: s(o.posting_date),
    age_days: numOrNull(o.age_days),
    amount_cents: numOrNull(o.amount_cents),
  };
}

export type ReconOutstandingLineSide = {
  line_id: string;
  statement_id: string | null;
  entry_date: string | null;
  description: string | null;
  amount_cents: number | null;
  age_days: number | null;
};

function toOutstandingLineSide(raw: unknown): ReconOutstandingLineSide {
  const o = rec(raw);
  return {
    line_id: s(o.line_id) ?? s(o.id) ?? "",
    statement_id: s(o.statement_id),
    entry_date: s(o.entry_date),
    description: s(o.description),
    amount_cents: numOrNull(o.amount_cents),
    age_days: numOrNull(o.age_days),
  };
}

export type ReconOpeningLineage = {
  opening_item_id: string;
  item_ref: string | null;
  item_date: string | null;
  entry_id: string | null;
};

function toOpeningLineage(raw: unknown): ReconOpeningLineage {
  const o = rec(raw);
  return {
    opening_item_id: s(o.opening_item_id) ?? s(o.id) ?? "",
    item_ref: s(o.item_ref),
    item_date: s(o.item_date),
    entry_id: s(o.entry_id),
  };
}

// ---------------------------------------------------------------------------
// The narrow exception door (design §4.2).
// ---------------------------------------------------------------------------

export type BankLineExceptionKind = "bank_error" | "disputed";
export type BankLineExceptionStatus = "open" | "resolved";
export type BankLineExceptionDisposition = "matched_booking" | "bank_corrective_line" | "written_off_adjustment";

export const EXCEPTION_KINDS: readonly BankLineExceptionKind[] = ["bank_error", "disputed"];
export const EXCEPTION_DISPOSITIONS: readonly BankLineExceptionDisposition[] = [
  "matched_booking",
  "bank_corrective_line",
  "written_off_adjustment",
];

export type BankLineExceptionRow = {
  id: string;
  line_id: string;
  statement_id: string | null;
  kind: BankLineExceptionKind | string;
  reason: string;
  evidence_document_id: string | null;
  status: BankLineExceptionStatus | string;
  created_by: string | null;
  created_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_disposition: BankLineExceptionDisposition | string | null;
  resolution_note: string | null;
};

export function toBankLineException(raw: unknown): BankLineExceptionRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? "",
    line_id: s(o.line_id) ?? "",
    statement_id: s(o.statement_id),
    kind: s(o.kind) ?? "bank_error",
    reason: s(o.reason) ?? "",
    evidence_document_id: s(o.evidence_document_id),
    status: s(o.status) ?? "open",
    created_by: s(o.created_by),
    created_at: s(o.created_at),
    resolved_by: s(o.resolved_by),
    resolved_at: s(o.resolved_at),
    resolution_disposition: s(o.resolution_disposition),
    resolution_note: s(o.resolution_note),
  };
}

export function exceptionDispositionLabel(d: string): string {
  if (d === "matched_booking") return "matched to a booking";
  if (d === "bank_corrective_line") return "bank corrective line (nets to a named pair)";
  if (d === "written_off_adjustment") return "written off (adjustment entry)";
  return d;
}

export function exceptionKindLabel(k: string): string {
  if (k === "bank_error") return "bank error";
  if (k === "disputed") return "disputed";
  return k;
}

// ---------------------------------------------------------------------------
// The receipt / preview envelope (design §3 "Snapshot spec" / §4.1 / §6).
// ---------------------------------------------------------------------------

export type ReconMode = "receipt" | "preview";
export type ReconStatus = "complete" | "void" | "open";

export type BankReconciliationSnapshot = {
  outstanding_entries: ReconOutstandingEntrySide[];
  outstanding_lines: ReconOutstandingLineSide[];
  exceptions: BankLineExceptionRow[];
  opening_lineage: ReconOpeningLineage[];
};

function toSnapshot(raw: unknown): BankReconciliationSnapshot {
  const o = rec(raw);
  return {
    outstanding_entries: arr(o.outstanding_entry_sides ?? o.outstanding_entries).map(toOutstandingEntrySide),
    outstanding_lines: arr(o.outstanding_line_sides ?? o.outstanding_lines).map(toOutstandingLineSide),
    exceptions: arr(o.exceptions).map(toBankLineException),
    // The bank_uncleared opening lineage (the takeover carry-down instruments).
    opening_lineage: arr(o.bank_uncleared_opening ?? o.opening_lineage).map(toOpeningLineage),
  };
}

/** The derived identity preview OR the persisted receipt, from
 *  get_bank_reconciliation(statement) (design §6). `mode` is inferred (never
 *  trusted from a caller-set flag): a `status` of 'complete'/'void' reads as a
 *  persisted receipt; anything else (including absent) reads as the live,
 *  labelled preview over an 'open' statement. */
export type BankReconciliationView = {
  mode: ReconMode;
  recon_id: string | null;
  statement_id: string;
  bank_account_id: string | null;
  coa_account_code: string | null;
  prior_statement_id: string | null;
  prior_reconciliation_id: string | null;
  first_period_exemption: boolean;
  period_start: string | null;
  period_end: string | null;
  status: ReconStatus | string;
  terms: ReconTermSet;
  snapshot: BankReconciliationSnapshot;
  /** entry-/line-side items older than 60 days before period_end that need
   *  p_ack_outstanding-by-id before complete_bank_reconciliation proceeds
   *  (design §3 `recon_outstanding_stale`). Empty on a persisted receipt (the
   *  ack already happened at completion time). */
  stale_outstanding_ids: string[];
  /** design §3 precondition: every line of S is a `live` group member or
   *  under an open exception. null = the DB did not report it (unavailable —
   *  never assume met). */
  precondition_met: boolean | null;
  /** design §3 chain law: a prior live statement (period_end = P.start-1)
   *  whose recon is complete — or the first-period exemption. null =
   *  unreported. */
  chain_ok: boolean | null;
  completed_by: string | null;
  completed_at: string | null;
  voided_by: string | null;
  voided_at: string | null;
  voided_reason: string | null;
};

export function toBankReconciliationView(raw: unknown): BankReconciliationView {
  const o = rec(raw);
  const status = s(o.status);
  // `preview` is the DB's own label and wins; status is the fallback for a
  // shape that predates it.
  const mode: ReconMode = o.preview === false
    ? "receipt"
    : o.preview === true
      ? "preview"
      : status === "complete" || status === "void"
        ? "receipt"
        : "preview";
  return {
    mode,
    recon_id: s(o.reconciliation_id) ?? s(o.recon_id) ?? s(o.id),
    statement_id: s(o.statement_id) ?? "",
    bank_account_id: s(o.bank_account_id),
    coa_account_code: s(o.coa_account_code),
    prior_statement_id: s(o.prior_statement_id),
    prior_reconciliation_id: s(o.prior_reconciliation_id),
    first_period_exemption: bool(o.first_period) || bool(o.first_period_exemption),
    period_start: s(o.period_start),
    period_end: s(o.period_end),
    status: status ?? "open",
    terms: toTermSet(o),
    snapshot: toSnapshot(o.snapshot ?? o),
    stale_outstanding_ids: strArr(o.stale_outstanding_ids),
    precondition_met: boolOrNull(o.precondition_met),
    chain_ok: boolOrNull(o.chain_ok),
    completed_by: s(o.completed_by),
    completed_at: s(o.completed_at),
    voided_by: s(o.voided_by),
    voided_at: s(o.voided_at),
    voided_reason: s(o.voided_reason),
  };
}

// ---------------------------------------------------------------------------
// Pure derivations over the view — display-only; the DB re-validates every one
// of these under lock at write time and its refusal is authoritative.
// ---------------------------------------------------------------------------

export type ReconTieState = "tied" | "variance" | "unavailable";

/** Mirrors ./model.ts's `tieBannerState` precedent exactly: ONE derived
 *  boolean off DB numbers, never a client-invented figure. `unavailable`
 *  fires whenever the DB did not return every term the §3 identity needs —
 *  never a fake "tied" (the F-H6 fail-closed law, OpeningDryRunCard's
 *  precedent applied here). */
export function reconTieState(view: Pick<BankReconciliationView, "terms">): ReconTieState {
  const t = view.terms;
  const vals = [
    t.opening_anchor_cents, t.gl_prime_cents, t.uncleared_total_cents,
    t.unmatched_capacity_prime_cents, t.excepted_cents, t.computed_closing_cents,
    t.statement_closing_cents, t.difference_cents,
  ];
  if (vals.some((v) => v === null || typeof v !== "number" || !Number.isFinite(v))) return "unavailable";
  return t.difference_cents === 0 ? "tied" : "variance";
}

export function outstandingStaleUnacked(
  view: Pick<BankReconciliationView, "stale_outstanding_ids">,
  acked: ReadonlySet<string>,
): string[] {
  return view.stale_outstanding_ids.filter((id) => !acked.has(id));
}

/** design §5 `complete_bank_reconciliation`'s preconditions, PREVIEWED so the
 *  workbench can disable the button before the DB asks. Fail-closed (the
 *  F-H6/OpeningDryRunCard law): a null (unreported) precondition/chain does
 *  NOT enable the button — only an EXPLICIT `true` does. A first-period
 *  exemption is a real, reportable state (design §3), so the DB is expected
 *  to say `chain_ok: true` for it, never omit the field. This is a preview
 *  gate only — the DB's own refusal is the authority either way. */
export function canCompleteReconciliation(
  view: Pick<BankReconciliationView, "status" | "precondition_met" | "chain_ok" | "stale_outstanding_ids">,
  ackedStaleIds: ReadonlySet<string>,
): boolean {
  if (view.status !== "open") return false;
  if (view.precondition_met !== true) return false;
  if (view.chain_ok !== true) return false;
  return view.stale_outstanding_ids.every((id) => ackedStaleIds.has(id));
}

/** design §3/§7 the ordered-unwind surface: "this will void N receipts" — N
 *  is never invented client-side from a figure the DB didn't state. When a
 *  future RPC names N directly this fn goes unused; absent that (today), the
 *  assembler's own fallback instruction composes the already-loaded statement
 *  list with a caller-supplied lookup of each LATER statement's reconciliation
 *  STATUS ONLY (never its money terms) to count how many are 'complete' on
 *  this account after the target statement's period — the set `void_bank_
 *  reconciliation`'s chain-order law (`recon_chain_order`) would force voiding
 *  newest-first, one by one, to reach this one. */
export function deriveVoidUnwindCount(
  statements: readonly { id: string; bank_account_id: string; period_end: string; status: string }[],
  target: { id: string; bank_account_id: string; period_end: string },
  reconStatusByStatementId: ReadonlyMap<string, ReconStatus | string>,
): number {
  return statements.filter(
    (st) =>
      st.bank_account_id === target.bank_account_id &&
      st.id !== target.id &&
      st.status === "live" &&
      st.period_end > target.period_end &&
      reconStatusByStatementId.get(st.id) === "complete",
  ).length;
}

// ---------------------------------------------------------------------------
// bank_rules (design §4.3) — the learn loop's proposal/signature lifecycle.
// ---------------------------------------------------------------------------

export type BankRuleKind = "match_settle" | "coding";
export type BankRuleStatus = "proposed" | "signed" | "retired";

export type BankRuleMatchSettleProposal = {
  domain: "ar" | "ap" | string;
  counterparty_id: string;
  counterparty_name?: string | null;
};

export type BankRuleCodingProposal = {
  account_code: string;
  narration_template?: string | null;
  counterparty_id?: string | null;
};

export type BankRuleRow = {
  id: string;
  client_id: string | null;
  kind: BankRuleKind | string;
  status: BankRuleStatus | string;
  pattern: unknown;
  proposal: Record<string, unknown>;
  evidence: unknown;
  created_by: string | null;
  created_at: string | null;
  signed_by: string | null;
  signed_at: string | null;
  retired_by: string | null;
  retired_at: string | null;
  retired_reason: string | null;
};

export function toBankRule(raw: unknown): BankRuleRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? s(o.rule_id) ?? "",
    client_id: s(o.client_id),
    kind: s(o.kind) ?? "coding",
    status: s(o.status) ?? "proposed",
    pattern: o.pattern ?? null,
    proposal: rec(o.proposal),
    evidence: o.evidence ?? null,
    created_by: s(o.created_by),
    created_at: s(o.created_at),
    signed_by: s(o.signed_by),
    signed_at: s(o.signed_at),
    retired_by: s(o.retired_by),
    retired_at: s(o.retired_at),
    retired_reason: s(o.retired_reason),
  };
}

/** A rule proposal's headline, pattern-matching the shape §4.3 names for each
 *  kind — degrades to the raw account/domain keys if the shape near-misses. */
export function bankRuleProposalLabel(rule: Pick<BankRuleRow, "kind" | "proposal">): string {
  const p = rule.proposal;
  if (rule.kind === "match_settle") {
    const domain = s(p.domain) ?? "?";
    const name = s(p.counterparty_name) ?? s(p.counterparty_id) ?? "(counterparty)";
    return `match/settle → ${domain.toUpperCase()} · ${name}`;
  }
  const code = s(p.account_code) ?? "(account)";
  const cp = s(p.counterparty_id);
  return `code → ${code}${cp ? ` · counterparty ${cp.slice(0, 8)}` : ""}`;
}

export type BankRuleCandidateRow = {
  kind: BankRuleKind | string;
  pattern: unknown;
  proposal: Record<string, unknown>;
  sighting_count: number | null;
  sample_line_ids: string[];
};

export function toBankRuleCandidate(raw: unknown): BankRuleCandidateRow {
  const o = rec(raw);
  return {
    kind: s(o.kind) ?? "coding",
    pattern: o.pattern ?? null,
    proposal: rec(o.proposal),
    sighting_count: numOrNull(o.sighting_count),
    sample_line_ids: strArr(o.sample_line_ids),
  };
}

export type BankLineSuggestionRow = {
  line_id: string;
  kind: BankRuleKind | string;
  rule_id: string;
  proposal: Record<string, unknown>;
};

export function toBankLineSuggestion(raw: unknown): BankLineSuggestionRow {
  const o = rec(raw);
  return {
    line_id: s(o.line_id) ?? "",
    kind: s(o.kind) ?? "coding",
    rule_id: s(o.rule_id) ?? "",
    proposal: rec(o.proposal),
  };
}

/** design §5 `propose_bank_rule`'s evidence floor: breeding needs ≥3 DB-
 *  derived sightings — a client-side PREVIEW only (the verb re-derives and
 *  refuses `rule_evidence_insufficient` below 3 regardless of this check). */
export const RULE_EVIDENCE_FLOOR = 3;

export function candidateMeetsEvidenceFloor(c: Pick<BankRuleCandidateRow, "sighting_count">): boolean {
  return (c.sighting_count ?? 0) >= RULE_EVIDENCE_FLOOR;
}

// ---------------------------------------------------------------------------
// list_unmatched_lines (design §6) — the cross-statement unmatched report.
// ---------------------------------------------------------------------------

export type UnmatchedLineRow = {
  line_id: string;
  statement_id: string;
  bank_account_id: string | null;
  entry_date: string | null;
  description: string | null;
  amount_cents: number | null;
  class_hint: string | null;
};

export function toUnmatchedLine(raw: unknown): UnmatchedLineRow {
  const o = rec(raw);
  return {
    line_id: s(o.line_id) ?? s(o.id) ?? "",
    statement_id: s(o.statement_id) ?? "",
    bank_account_id: s(o.bank_account_id),
    entry_date: s(o.entry_date),
    description: s(o.description),
    amount_cents: numOrNull(o.amount_cents),
    class_hint: s(o.class_hint),
  };
}
