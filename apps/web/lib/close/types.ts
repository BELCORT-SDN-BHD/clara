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
//     exactly like closeApi.ts:151-166 — there is no close_proposals carrier to pass
//     one from, see the ClosePage header for the "Clara proposes close" honesty note)
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
