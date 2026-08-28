// Close-domain read/door shapes — the client workspace's Close tab (owner ruling
// Q3, docs/plan/active/mohe-grill-rulings-2026-08-27.md). Ported and TRUED from
// apps/dashboard/app/close/closeApi.ts (Wave E lane theta), which this build is the
// FIRST-EVER UI caller past for begin_close/finalize_close/abandon_close/
// reopen_fiscal_year — no dashboard precedent exists for those four doors, so their
// exact signatures below are grounded directly in the live migrations, not carried
// from any existing frontend:
//   - clara.begin_close(p_fy uuid, p_op_key text)                         — 0120:1139
//   - clara.finalize_close(p_fy uuid, p_self_attestation text, p_op_key text) — 0128:128
//     (0128 CoR's 0120:267's body; segregation_mode is NEVER a caller argument — the
//     DB derives it from who prepared/checked the year, 0128:275-291)
//   - clara.abandon_close(p_close_run uuid, p_reason text, p_op_key text) — 0120:1202
//   - clara.reopen_fiscal_year(p_fy uuid, p_reason text, p_correction_target jsonb,
//     p_op_key text, p_attestation text DEFAULT NULL) — 0120:630 (the 5-ARG form;
//     0085:172's older 4-arg overload is DROPPED/superseded, never called here)
//   - clara.attest_close_exception(p_close_run uuid, p_check_key text, p_reason text,
//     p_op_key text, p_item_key text DEFAULT NULL, p_from_proposal uuid DEFAULT NULL)
//     — 0120:919 (the LIVE 6-arg signature; p_from_proposal stays unpassed/defaulted,
//     exactly like closeApi.ts:151-166. FIX-5 (rev-t1): the close_proposals carrier,
//     its doors AND a real read of a live proposal are ALL live now (T1,
//     components/close/CloseProposalPanel.tsx) — the missing piece is a per-gate
//     "attest THIS check_key from proposal X" affordance on GateCheckRow.tsx's own
//     AttestForm, not the panel's existence)
//   - clara.list_fiscal_years(p_client uuid) — 0056:2665, unchanged since
//   - clara.get_close_plan(p_fiscal_year_id uuid) — 0064:154, unchanged since
//   - clara.verify_close(p_receipt uuid) — 0056:2529, viewer+, unchanged since
//
// segregation_mode has FOUR live values as of 0128's widened CHECK
// (0128:108-109): 'two_person' | 'solo_self_attested' | 'agent_prepared' |
// 'no_preparation' — the fourth is 0128's own addition (a year nobody, human or
// agent, actually prepared gets its own truthful label, never 'agent_prepared' on
// work the agent never did).
//
// fy_end_source has THREE live values as of 0120's widened CHECK (0120:230-231):
// 'asserted' | 'default_1231' | 'asserted_by_file' — closeApi.ts's own type only
// carried the first two; fixed here, not ported forward.

export type FyEndSource = "asserted" | "default_1231" | "asserted_by_file";

export type FiscalYearStatus = "open" | "closing" | "closed" | "reopened";

export type SegregationMode = "two_person" | "solo_self_attested" | "agent_prepared" | "no_preparation";

export type FiscalYearRow = {
  fiscal_year_id: string;
  label: string;
  ordinal: number;
  starts_on: string;
  ends_on: string;
  status: FiscalYearStatus;
  fy_end_source: FyEndSource;
  has_active_reopen_receipt: boolean;
};

export type ClosePlanFiscalYear = {
  id: string;
  // client_id rides the plan document itself — the caller cross-checks this
  // against the CURRENTLY selected client before rendering (the "visiblePlan"
  // belt, ClosePage's own defense-in-depth on top of lib/client-scope.ts's
  // network-level guard).
  client_id: string;
  label: string;
  ordinal: number;
  starts_on: string;
  ends_on: string;
  status: FiscalYearStatus;
  fy_end_source: FyEndSource;
};

export type ClosePlanCloseRun =
  | { state: "absent" }
  | {
      state: "present";
      close_run_id: string;
      run_state: "in_progress" | "finalized" | "abandoned";
      started_by: string;
      started_at: string;
      ended_by: string | null;
      ended_at: string | null;
      end_reason: string | null;
    };

export type AttestationState = "absent" | "live" | "stale";

export type ClosePlanAttestation =
  | { state: "absent" }
  | { state: "live" | "stale"; attested_by: string; reason: string; attested_at: string };

export type ClosePlanItem = { item_key: string; attestation: ClosePlanAttestation };

export type GateState = "pass" | "fail" | "unknown" | "error" | "advisory";

export type ClosePlanCheckResult =
  | { state: "not_yet_measured" }
  | { state: GateState; measured: unknown; measured_digest: string; evaluated_at: string };

export type ClosePlanCheck = {
  check_key: string;
  drawer: 1 | 2 | 3;
  title: string;
  applies_when: "always" | "goods_trading";
  result: ClosePlanCheckResult;
  items: ClosePlanItem[];
};

export type ClosePlanReceipt =
  | { state: "absent" }
  | {
      state: "present";
      receipt_id: string;
      kind: "close" | "reopen";
      status: "active" | "superseded";
      closed_by: string;
      closed_at: string;
      segregation_mode: SegregationMode | null;
      self_attestation: string | null;
      pl_net_cents: number;
      retained_earnings_account: string;
      closing_tb_digest: string;
      gate_digest: string;
      books_watermark: string;
      evaluator_version_ids: string[];
      dataset_sha256: string;
      close_entry_id: string | null;
      closing_position: Record<string, number> | null;
    };

export type ClosePlan = {
  fiscal_year: ClosePlanFiscalYear;
  close_run: ClosePlanCloseRun;
  checks: ClosePlanCheck[];
  receipt: ClosePlanReceipt;
};

/** clara.verify_close's own return shape (0056:2529-2614) — a live recompute of the
 *  four drawer-1 identities plus the closing-position pin, reported alongside the
 *  receipt's own stored answer. Never derived client-side — every field here is
 *  read verbatim from the RPC's jsonb. */
export type VerifyCloseResult = {
  receipt_id: string;
  fiscal_year_id: string;
  receipt_status: "active" | "superseded";
  receipt_kind: "close" | "reopen";
  verified: boolean;
  strict: {
    probes: Array<{ state: string; probe: unknown }>;
    closing_position_diffs: Array<{ account_code: string; pinned_cents: number; recomputed_cents: number }>;
    pl_open_diffs?: Array<{ account_code: string; net_cents: number }>;
    [key: string]: unknown;
  };
  successor?: string;
  [key: string]: unknown;
};

/** clara.reopen_fiscal_year's p_correction_target — a discriminated jsonb object
 *  naming exactly one auditable target (0120:645-702): an array of journal entry
 *  ids, a filed document, or a close-gate check key. */
export type ReopenCorrectionTarget =
  | { entry_ids: string[] }
  | { document_id: string }
  | { check_key: string };

// ---------------------------------------------------------------------------
// T1 (port-wave, 2026-08-29) — the fiscal-year opener + readiness + the
// close_proposal/agent_receipt workbench halves. Every shape below is ground
// truth read directly off the LIVE rig (pg_get_functiondef / information_schema
// on a freshly migrated+seeded throwaway at the 0142 frontier), never off
// migration text — this train's own rung-0 census.

/** clara._propose_fiscal_year_core's own return shape — what
 *  clara.propose_fiscal_year(p_client, p_starts_on) resolves. `fy_end.fallback`
 *  is true exactly when the client carries no fy_end_month/day yet (the door
 *  computed against the 31 Dec default); NEVER re-derived client-side — this is
 *  the DB's own preview of what `open_fiscal_year` would compute for `ends_on`
 *  if the human accepts it unedited. */
export type FiscalYearProposal = {
  starts_on: string;
  ends_on: string;
  fy_end: { month: number; day: number; fallback: boolean };
};

/** clara.clients' own fy_end_month/fy_end_day — read via getRows("clients"),
 *  not through a door (the columns are plain SELECTs the RLS-scoped table
 *  grant already admits, `p_clients_human`/0003:514). Both null until the FIRST
 *  `set_client_fy_end` call — the fiscal-year opener's own precondition
 *  (OQ-7, port-wave-plan part2 §12). */
export type ClientFyEndRow = {
  id: string;
  name: string;
  fy_end_month: number | null;
  fy_end_day: number | null;
};

/** clara._close_readiness_core's own per-gate shape — DELIBERATELY not the
 *  same shape as ClosePlanCheck: no `title` (joined client-side against a
 *  real `close_gate_checks` read, never invented), no per-item detail, and
 *  ONE `attested` boolean per gate rather than per-item attestation state.
 *  This is the DB's own compact verdict — rendered, never pre-empted
 *  (ADR-065/E-R2): this module computes no aggregate "ready" boolean because
 *  get_close_readiness returns none. */
export type CloseReadinessGate = {
  check_key: string;
  drawer: 1 | 2 | 3;
  state: GateState;
  measured: unknown;
  measured_digest: string;
  attested: boolean;
};

/** A check_key that has never been measured (no `close_gate_results` row yet)
 *  is simply ABSENT from get_close_readiness's `gates[]` — the caller cross-
 *  references the live `close_gate_checks` catalog (getRows) to render those
 *  as an honest "not yet measured" row rather than silently omitting them. */
export type CloseReadiness = {
  fiscal_year_id: string;
  close_run_id: string | null;
  run_state: "in_progress" | "finalized" | "abandoned" | null;
  fy_end_source: FyEndSource | null;
  gates: CloseReadinessGate[];
};

/** clara.close_gate_checks — the human-readable catalog (14 live rows), read
 *  via getRows (p_cgc_human: `true` for clara_authenticated, a real table
 *  grant) so CloseReadinessPanel can show a title beside get_close_readiness's
 *  bare check_key without inventing one. */
export type CloseGateCatalogRow = {
  check_key: string;
  drawer: 1 | 2 | 3;
  title: string;
  applies_when: "always" | "goods_trading";
};

/** clara.list_agent_act_receipts's own per-row jsonb shape (0138:66) — a
 *  bookkeeper+ read of every agent-authored judgement act for one client,
 *  TA-P4's mechanically-bound receipt: model + version + rationale + the
 *  triggering wake task, always. */
export type AgentActReceiptRow = {
  receipt_id: string;
  act_kind: string;
  subject_kind: string;
  subject_id: string;
  verdict: string;
  rung_vector: unknown;
  model: { name: string | null; version: string | null };
  rationale: string | null;
  via_wake_kind: string;
  wake_task_id: string;
  on_behalf_of: string | null;
  created_at: string;
};

/** clara.close_proposals — read via getRows (p_cp_human: bookkeeper+, firm-
 *  scoped). `drafted` is a jsonb array of {check_key, item_key} the proposal
 *  covers; settle_close_proposal's own `adopted` arm requires every one of
 *  them to carry a live agent-authored attestation on the SAME close_run
 *  before it will adopt (FIX-7, migration 0138 tail). */
export type CloseProposalRow = {
  id: string;
  firm_id: string;
  client_id: string;
  fiscal_year_id: string;
  close_run_id: string;
  state: "open" | "adopted" | "withdrawn" | "superseded";
  proposed_by: string;
  bound_digests: Record<string, unknown>;
  drafted: Array<{ check_key: string; item_key: string | null }>;
  narrative: string;
  model_name: string;
  model_version: string;
  rationale: string;
  settled_by: string | null;
  settled_at: string | null;
  settle_reason: string | null;
  created_at: string;
};

/** clara.close_prep_holds — read via getRows (p_cph_human: bookkeeper+, firm-
 *  scoped). RELEASE IS A STAMP, NEVER A DELETE (Annex A.7): history rows with
 *  `released_at` set are permanent; the LIVE hold (if any) is the one row per
 *  (client_id, purpose) with `released_at is null` (uq_hold_active). */
export type ClosePrepHoldRow = {
  id: string;
  client_id: string;
  purpose: string;
  held_by: string;
  reason: string;
  held_at: string;
  released_by: string | null;
  released_at: string | null;
  release_reason: string | null;
};
