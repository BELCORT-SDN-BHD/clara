// HUMAN-lane wire client for /close (Wave E lane theta, plumbing grade). Every
// read is the governed DEFINER surface 0056/theta ship — clara.list_fiscal_years,
// clara.get_close_plan, clara.attest_close_exception — never a hand-selected
// table. The UI computes NO cents and derives NO gate state; every figure and
// every pass/fail/unknown/error/advisory verdict is read verbatim from the plan
// document. Types here are a defensive skin over the jsonb envelope, not a
// second source of truth — an unrecognised shape renders "plan unavailable"
// rather than a guess.

import { rpc } from "../shared/wire";

// ---------------------------------------------------------------------------
// list_fiscal_years(p_client) -- 0056 S6.4e.
// ---------------------------------------------------------------------------

export type FiscalYearRow = {
  fiscal_year_id: string;
  label: string;
  ordinal: number;
  starts_on: string;
  ends_on: string;
  status: "open" | "closing" | "closed" | "reopened";
  fy_end_source: "asserted" | "default_1231";
  has_active_reopen_receipt: boolean;
};

export async function listFiscalYears(token: string, clientId: string): Promise<FiscalYearRow[]> {
  const out = await rpc("list_fiscal_years", { p_client: clientId }, token);
  return Array.isArray(out) ? (out as FiscalYearRow[]) : [];
}

// ---------------------------------------------------------------------------
// get_close_plan(p_fiscal_year_id) -- theta's read (0064_wave_e_theta_
// close_plan.sql). The plan-as-document: every catalog check + its measured
// state + its outstanding items' attestations (or an explicit absence) + the
// close receipt once finalized, all absence stated, never omitted.
// ---------------------------------------------------------------------------

export type ClosePlanFiscalYear = {
  id: string;
  label: string;
  ordinal: number;
  starts_on: string;
  ends_on: string;
  status: "open" | "closing" | "closed" | "reopened";
  fy_end_source: "asserted" | "default_1231";
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
      segregation_mode: string | null;
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

/** Defensive: only the shape the two live branches (`close_run`/`receipt`
 *  carrying a `state` discriminant, `checks` an array) need to be present for
 *  the page to render safely. Anything looser than that returns null — the
 *  page's own "plan unavailable" state, never a half-rendered guess. */
function toClosePlan(out: unknown): ClosePlan | null {
  if (typeof out !== "object" || out === null) return null;
  const o = out as Record<string, unknown>;
  const fy = o.fiscal_year as Record<string, unknown> | undefined;
  const closeRun = o.close_run as Record<string, unknown> | undefined;
  const receipt = o.receipt as Record<string, unknown> | undefined;
  if (!fy || typeof fy.id !== "string") return null;
  if (!closeRun || typeof closeRun.state !== "string") return null;
  if (!receipt || typeof receipt.state !== "string") return null;
  if (!Array.isArray(o.checks)) return null;
  return o as unknown as ClosePlan;
}

export async function getClosePlan(token: string, fiscalYearId: string): Promise<ClosePlan | null> {
  const out = await rpc("get_close_plan", { p_fiscal_year_id: fiscalYearId }, token);
  return toClosePlan(out);
}

// ---------------------------------------------------------------------------
// attest_close_exception(p_close_run, p_check_key, p_reason, p_op_key,
// p_item_key) -- the EXISTING audited attest door from 0056
// (0056_wave_e_close_model.sql:1816-1941). theta invents no new writer; this
// is an object-level verb on the gate row, exactly this call.
// ---------------------------------------------------------------------------

const opKey = () => crypto.randomUUID();

export async function attestCloseException(
  token: string,
  args: { closeRunId: string; checkKey: string; reason: string; itemKey: string | null },
): Promise<void> {
  await rpc(
    "attest_close_exception",
    {
      p_close_run: args.closeRunId,
      p_check_key: args.checkKey,
      p_reason: args.reason,
      p_op_key: opKey(),
      p_item_key: args.itemKey,
    },
    token,
  );
}
