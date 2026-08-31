// Row/wire shapes for T7 (port-wave plan §4 "Coding, questions & quality
// signals"). Every field name and enum member below is transcribed from the
// LIVE catalog on an instance-unique throwaway rig (migrate 0001..0140,
// `pg_get_functiondef`/`\d` pulls, 2026-08-28) — never a migration file's
// first `CREATE` (apps/web/AGENTS.md's "chase the LIVE body" rule). This
// module carries no logic.

// --- clara.list_uncoded_filings(p_client uuid) -> SETOF jsonb ---------------
// Filings with NO draft and NO active-approved journal entry: the coding
// surface's own "inbox" population.
export type UncodedFilingRow = {
  filing_id: string;
  document_id: string;
  client_id: string;
  filed_at: string;
  basis: "legacy-0007" | "human" | "rule" | "correction" | "seed-0007" | "judgement";
  document_kind: string | null;
  financial_date: string | null;
  original_filename: string | null;
  mime_type: string | null;
  extraction_status: string;
};

// --- clara._coding_lane_core(p_client, p_filing) -> TABLE(lane, reasons) ----
// The lane a filing is currently classified into, and the reason tags that
// produced it — a DB-computed classification, never re-derived client-side.
export type CodingLane = "ready" | "needs_review" | "needs_you";

/** Every reason tag `_coding_lane_core` can append, transcribed from its live
 *  body (2026-08-28 census). A code outside this list still renders — see
 *  lib/coding/copy.ts's checked-lookup-with-fallback, the same discipline
 *  needs-you-row.tsx's `kindLabel` already uses — but this is the full known
 *  set as of the census. */
export const CODING_LANE_REASON_CODES = [
  "no_active_filing", "open_draft", "already_coded", "facts_pending",
  "multi_doc", "non_myr", "tier_a_fails", "direction_unresolved",
  "customer_name_missing", "vendor_unresolved", "vendor_ambiguous",
  "customer_ambiguous", "vendor_bound", "binding_ambiguous", "open_question",
  "no_consent", "parked", "rule_backed", "high_stakes", "near_duplicate",
] as const;
export type CodingLaneReasonCode = (typeof CODING_LANE_REASON_CODES)[number];

/** `clara.list_coding_lanes(p_client)` — every active (non-retired) filing
 *  for the client, joined with its own `_coding_lane_core` classification, in
 *  ONE read. `clara.coding_lane(p_client, p_filing)` returns the identical
 *  shape for exactly one filing, as a 0-or-1-element array (a SETOF RPC via
 *  PostgREST is always an array on the wire, never a bare object — the
 *  function's own early-return branches can yield zero rows for a
 *  wake-mismatched or inactive-client caller; a human caller always gets
 *  exactly one row for a filing that resolves, per the live body). */
export type CodingLaneRow = { filing_id: string; lane: CodingLane; reasons: string[] };
export type CodingLaneResult = { lane: CodingLane; reasons: string[] };

// --- clara.coding_tasks_visible (masked view) --------------------------------
export type CodingTaskStatus = "open" | "done" | "dismissed";
export type CodingTaskOrigin = "correction" | "manual";

export type CodingTaskRow = {
  id: string;
  client_id: string;
  document_id: string;
  filing_id: string;
  origin: CodingTaskOrigin;
  correction_id: string | null;
  status: CodingTaskStatus;
  opened_by: string;
  closed_by: string | null;
  closed_reason: string | null;
  result_entry_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

// --- clara.lint_findings (direct table read; forced RLS, human policy) -----
export const LINT_FINDING_KINDS = [
  "contradiction", "stale_claim", "orphan_page", "cap_pages", "cap_page_size",
  "wiki_synthesis_held", "opening_tb_tie_broken", "opening_doc_unfiled", "stale_citation",
] as const;
export type LintFindingKind = (typeof LINT_FINDING_KINDS)[number] | (string & {});

export type LintFindingSeverity = "info" | "warn" | "critical";
export type LintFindingState = "open" | "superseded" | "resolved";

/** The exact four values `resolve_lint_finding`'s own CLR33 malformed-check
 *  admits (live body) — a closed set, never widened client-side. */
export const LINT_FINDING_CONCLUSIONS = [
  "corrected", "accepted_revision", "false_positive", "superseded_by_edit",
] as const;
export type LintFindingConclusion = (typeof LINT_FINDING_CONCLUSIONS)[number];

export type LintFindingRow = {
  id: string;
  firm_id: string;
  client_id: string;
  finding_kind: LintFindingKind;
  dedupe_key: string;
  severity: LintFindingSeverity;
  page_id: string | null;
  detail: Record<string, unknown>;
  state: LintFindingState;
  opened_at: string;
  resolved_conclusion: LintFindingConclusion | null;
  resolved_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type LintFindingEventKind = "created" | "superseded" | "resolved" | "recheck_opened" | "evaluation";

export type LintFindingEventRow = {
  id: string;
  finding_id: string;
  event_kind: LintFindingEventKind;
  state_before: string | null;
  state_after: string | null;
  figures: Record<string, unknown>;
  actor: string | null;
  rationale: string | null;
  created_at: string;
};

/** `clara.get_lint_finding(p_finding)` -> jsonb — a read-flavoured RPC (rides
 *  callDoor as transport; not a governed act). `null` when RLS admits no such
 *  finding (wrong firm, or it never existed). */
export type LintFindingDetail = { finding: LintFindingRow; events: LintFindingEventRow[] } | null;

// --- clara.open_questions (client-scoped questions; distinct from the
// FIRM-scoped clara.firm_open_questions table another lane's
// firm_open_questions_visible already reads — "spelling is not identity":
// same English words, two different tables, never conflated here) ----------

export type OpenQuestionScopeKind = "document" | "vendor" | "client" | "bank_line";
export type OpenQuestionStatus = "open" | "resolved" | "dismissed";
export type OpenQuestionOrigin =
  | "clarify_promotion" | "rule_proposal" | "rule_conflict" | "sweep_refusal"
  | "manual" | "classification" | "onboarding" | "bank_ambiguity";

export type OpenQuestionRow = {
  id: string;
  firm_id: string;
  client_id: string;
  scope_kind: OpenQuestionScopeKind;
  scope_id: string;
  document_id: string | null;
  counterparty_id: string | null;
  origin: OpenQuestionOrigin;
  question_text: string;
  status: OpenQuestionStatus;
  opener_kind: "human" | "wake";
  opened_by: string | null;
  opened_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_text: string | null;
  spawned_rule_id: string | null;
};

export type CodingRuleRow = {
  id: string;
  client_id: string;
  rule_type: string;
  counterparty_id: string;
  account_code: string;
  status: string;
  pinned: boolean;
  origin: string;
  created_at: string;
  signed_at: string | null;
  retired_at: string | null;
  declined_at: string | null;
  direction: string | null;
};

/** `clara.get_open_question(p_question)` -> jsonb — a read-flavoured RPC.
 *  `null` when RLS admits no such question. */
export type OpenQuestionDetail = { question: OpenQuestionRow; rule: CodingRuleRow | null } | null;

// --- clara.sweep_runs — a bookkeeper+ read has NO table grant at all
// (measured: only an owner-only RLS policy exists on both sweep_runs and
// sweep_run_items); the ONLY human-reachable read is get_sweep_run(p_run).
// list_review_queue's own `sweep` envelope carries only open_run/
// last_finalized_at/last_ack_at (booleans and timestamps, never an id), and
// no `list_sweep_runs` door exists — but a run id DOES reach a human
// honestly through a DIFFERENT channel: `lib/parts/types.ts`'s
// `SweepReceiptPart` (`type: "sweep_receipt"; run_id: string`) is what Clara
// posts into a thread when a sweep finalizes.
//
// TRUED 2026-08-30 (P6-2 — 裁-20 DISCHARGED, not merely tracked). That part no
// longer renders as a generic id-only summary card: it is now a rich card
// (components/parts/SweepReceiptCard.tsx) that hydrates `get_sweep_run` on
// mount and offers `acknowledge_sweep_run` on a FINALIZED run, exactly as
// 裁-20 (docs/plan/active/mohe-grill-rulings-2026-08-28.md:268-272) ruled it
// should inside the P6 wire bump. The paragraph above is still the reason the
// card is the ONLY home for that control — nothing about the grant picture
// changed, so the queue-altitude panel
// (components/firm/sweep-status-panel.tsx) still cannot host one. ----------

/** Re-exported from lib/firm/needs-you.ts's own type under this module's
 *  vocabulary — the SAME envelope shape, never a second definition. */
export type { ReviewQueueSweep as SweepStatus } from "@/lib/firm/needs-you";

/** One `clara.sweep_runs` row, transcribed column for column from the table's own
 *  DDL (0011_daily_loop.sql:674-696) plus the ONE column a later migration added
 *  — `posted_count` (0108_f_a2_posted_chain.sql:180). `get_sweep_run` returns
 *  `to_jsonb(r)` over the whole row, so every column below arrives whether or not
 *  a card renders it; the shape is declared in full rather than narrowed, so the
 *  next reader sees what the DB actually hands over.
 *
 *  EVERY COUNTER HERE IS DB-OWNED AND IS RENDERED, NEVER RECOMPUTED. `expected`,
 *  `drafted`, `skipped`, `refused` and `posted` are five separate columns the
 *  sweep itself wrote; 0108's own comment on `posted_count` says why it is a
 *  fourth counter and not a fold into `drafted_count` ("folding would make a
 *  posted row indistinguishable from a drafted one in the run summary"). A UI
 *  that summed or reconciled them would be doing exactly the arithmetic the
 *  schema split apart — hard constraint 2. */
export type SweepRunRow = {
  id: string;
  firm_id: string;
  state: "open" | "finalized" | string;
  window_started_at: string;
  window_ended_at: string | null;
  expected_count: number;
  drafted_count: number;
  skipped_count: number;
  refused_count: number;
  posted_count: number;
  token_reserved: number;
  token_spent: number;
  checkpoint_seq: number | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
  finalized_at: string | null;
};

/** One `clara.sweep_run_items` row (0011:728-748). `outcome`'s CHECK has been
 *  WIDENED twice and never narrowed — 0108:169-170 added `posted`, 0151:701-703
 *  added `refused_concurrency` — so it is typed as an OPEN union: a literal-only
 *  union transcribed from 0011 would have been two values short by 0151, and the
 *  seventh value the day a third widening lands. Same posture as `RefusalCode`
 *  and `agent_receipt`'s `receipt_kind`. `refusal_token` is caller-shaped jsonb
 *  with no per-outcome schema, so it is `unknown` and is never walked. */
export type SweepRunItemRow = {
  run_id: string;
  filing_id: string;
  firm_id: string;
  client_id: string;
  document_id: string;
  outcome:
    | "drafted" | "posted" | "skipped_lane" | "noop_existing"
    | "refused_budget" | "refused_concurrency" | "refused_attempts"
    | (string & {});
  entry_id: string | null;
  refusal_token: unknown;
  tokens_reserved: number;
  tokens_spent: number;
  created_at: string;
};

/** `clara.get_sweep_run(p_run)` -> jsonb — a read-flavoured RPC (viewer+; the
 *  ACKNOWLEDGE half is bookkeeper+ and human-only). The body builds
 *  `jsonb_build_object('run', to_jsonb(r), 'items', coalesce(jsonb_agg(...),
 *  '[]'))` and returns SQL NULL — not an empty object — when the run does not
 *  exist or belongs to another firm (0011:3585-3594), so `null` here is the
 *  honest "no such run for you" and never an error the DB did not raise. */
export type SweepRunDetail = { run: SweepRunRow; items: SweepRunItemRow[] } | null;

// --- clara.agent_tasks_visible (masked view) --------------------------------
export type AgentTaskKind = "chat_turn" | "wake" | "autodraft" | "close_prep";
export type AgentTaskStatus =
  | "queued" | "held" | "running" | "awaiting_input" | "cancel_requested"
  | "completed" | "failed" | "cancelled" | "expired";
export type AgentTaskErrorCode = "model_error" | "tool_error" | "timeout" | "engine_lost" | "limit" | "internal";

/** A task is cancellable (per `cancel_agent_task`'s own idempotent-terminal
 *  handling) in every status except the four terminal ones — the door itself
 *  treats `completed`/`failed`/`cancelled`/`expired` as already-settled and
 *  `cancel_requested` as already-requested; this set is what the UI uses to
 *  decide whether to OFFER the control at all (never re-deriving the door's
 *  own refusal logic — see doors.ts's own header). */
export const AGENT_TASK_CANCELLABLE_STATUSES: ReadonlySet<AgentTaskStatus> = new Set([
  "queued", "held", "running", "awaiting_input",
]);

/** The FIVE non-terminal statuses (F6, independent review) — what the panel's
 *  own list READ filters to. `cancel_requested` is deliberately INCLUDED here
 *  even though it is absent from `AGENT_TASK_CANCELLABLE_STATUSES` above: a
 *  running task's cancel is only a REQUEST (the live body: running/
 *  awaiting_input -> cancel_requested, engine still active; only queued/held
 *  settle straight to cancelled) — filtering the read to the cancellable set
 *  alone made a just-cancelled row VANISH from the very re-read `act()`
 *  triggers, which reads as "nothing happened" rather than "cancel
 *  requested, settling." The row leaves the list only once the DB itself
 *  settles it to a genuinely terminal status. */
export const AGENT_TASK_LIVE_STATUSES: readonly AgentTaskStatus[] = [
  "queued", "held", "running", "awaiting_input", "cancel_requested",
];

export type AgentTaskRow = {
  id: string;
  kind: AgentTaskKind;
  status: AgentTaskStatus;
  client_id: string | null;
  error_code: AgentTaskErrorCode | null;
  created_at: string;
  updated_at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
  session_id: string | null;
  created_by: string | null;
};
