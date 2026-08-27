// Close-domain reads + doors — see ./types.ts's header for every verb's exact
// signature and its file:line ground truth. Reads ride `callDoor` (../doors) even
// though they are read-only, because the DB exposes them as SECURITY DEFINER RPCs
// (POST /rpc/<fn>), not plain selectable views — read.ts's `getRows` is for a
// PostgREST GET against a table/view, which none of list_fiscal_years/
// get_close_plan/verify_close are. This is the same mechanism doors.ts's own
// header describes (pgrestRpc under the hood); it is used here for its refusal
// typing, not because these calls mutate anything.
//
// HYDRATE-NEVER-TRUST: every function below returns exactly what the DB said —
// no field is computed, summed, or renamed into something the DB didn't say
// itself. `report_agent_receipts` reads (lib/reports/api.ts) are the one true
// `getRows` case in this domain family — see that module.

import { callDoor, DoorRefusal, isDoorRefusal } from "../doors";
import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";
import type {
  ClosePlan,
  FiscalYearRow,
  ReopenCorrectionTarget,
  VerifyCloseResult,
} from "./types";

export { DoorRefusal, isDoorRefusal };

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** clara.list_fiscal_years(p_client) — 0056:2665. The fiscal-year picker's read. */
export async function listFiscalYears(clientId: string, opts: Opts = {}): Promise<FiscalYearRow[]> {
  const out = await callDoor<unknown>("list_fiscal_years", { p_client: clientId }, opts);
  return Array.isArray(out) ? (out as FiscalYearRow[]) : [];
}

/** Defensive: only the shape the two live branches (`close_run`/`receipt` carrying
 *  a `state` discriminant, `checks` an array) need to be present for the page to
 *  render safely — ported verbatim from apps/dashboard/app/close/closeApi.ts's own
 *  `toClosePlan` (its reasoning is unchanged by this build; see that file). */
function toClosePlan(out: unknown): ClosePlan | null {
  if (typeof out !== "object" || out === null) return null;
  const o = out as Record<string, unknown>;
  const fy = o.fiscal_year as Record<string, unknown> | undefined;
  const closeRun = o.close_run as Record<string, unknown> | undefined;
  const receipt = o.receipt as Record<string, unknown> | undefined;
  if (!fy || typeof fy.id !== "string" || typeof fy.client_id !== "string") return null;
  if (!closeRun || typeof closeRun.state !== "string") return null;
  if (!receipt || typeof receipt.state !== "string") return null;
  if (!Array.isArray(o.checks)) return null;
  return o as unknown as ClosePlan;
}

/** clara.get_close_plan(p_fiscal_year_id) — 0064:154. The plan-as-document: the
 *  ONE read ClosePage renders from. A malformed/unrecognised shape resolves
 *  `null` — the page's own "plan unavailable" state, never a half-rendered guess. */
export async function getClosePlan(fiscalYearId: string, opts: Opts = {}): Promise<ClosePlan | null> {
  const out = await callDoor<unknown>("get_close_plan", { p_fiscal_year_id: fiscalYearId }, opts);
  return toClosePlan(out);
}

/** clara.verify_close(p_receipt) — 0056:2529, viewer+. A live recompute reported
 *  alongside the receipt's stored answer; never a client-side recomputation. */
export async function verifyClose(receiptId: string, opts: Opts = {}): Promise<VerifyCloseResult> {
  return callDoor<VerifyCloseResult>("verify_close", { p_receipt: receiptId }, opts);
}

const opKey = (): string => crypto.randomUUID();

/** clara.begin_close(p_fy, p_op_key) — 0120:1139. close_and_attest capability
 *  (CLR04 on refusal). ONE human act: one click mints ONE op_key. */
export async function beginClose(fiscalYearId: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("begin_close", { p_fy: fiscalYearId, p_op_key: opKey() }, opts);
}

/** clara.finalize_close(p_fy, p_self_attestation, p_op_key) — 0128:128 (CoR of
 *  0120:267). `segregation_mode` is NEVER an argument — the DB derives it
 *  (0128:275-291); this door only ever sends the three real parameters. */
export async function finalizeClose(
  fiscalYearId: string,
  selfAttestation: string | null,
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "finalize_close",
    { p_fy: fiscalYearId, p_self_attestation: selfAttestation, p_op_key: opKey() },
    opts,
  );
}

/** clara.abandon_close(p_close_run, p_reason, p_op_key) — 0120:1202. Same
 *  close_and_attest capability as begin/finalize. */
export async function abandonClose(closeRunId: string, reason: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("abandon_close", { p_close_run: closeRunId, p_reason: reason, p_op_key: opKey() }, opts);
}

/** clara.reopen_fiscal_year(p_fy, p_reason, p_correction_target, p_op_key,
 *  p_attestation) — 0120:630, the LIVE 5-arg form (the 4-arg 0085 overload is
 *  superseded/dropped). `reopen` capability (distinct from close_and_attest); the
 *  four CLR05 arms (no_eligible_human / attestation_required / distinct_checker /
 *  self_attestation) each name who may act — rendered verbatim by the caller, never
 *  paraphrased. `attestation` is optional; pass it only once a refusal has named it. */
export async function reopenFiscalYear(
  args: {
    fiscalYearId: string;
    reason: string;
    correctionTarget: ReopenCorrectionTarget;
    attestation?: string;
  },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "reopen_fiscal_year",
    {
      p_fy: args.fiscalYearId,
      p_reason: args.reason,
      p_correction_target: args.correctionTarget,
      p_op_key: opKey(),
      p_attestation: args.attestation ?? null,
    },
    opts,
  );
}

/** clara.attest_close_exception(p_close_run, p_check_key, p_reason, p_op_key,
 *  p_item_key, p_from_proposal) — 0120:919, the LIVE 6-arg signature.
 *  `p_from_proposal` is DELIBERATELY never passed here (stays defaulted null)
 *  — the `close_proposals` carrier and its doors ARE live (0138), but the
 *  panel that would read a proposal to source an id from is not built yet
 *  (components/close/CloseProposalPanel.tsx, P6 scope). This is the EXISTING
 *  audited attest door from 0056 (0056:1816-1941); this build invents no new
 *  writer. */
export async function attestCloseException(
  args: { closeRunId: string; checkKey: string; reason: string; itemKey: string | null },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "attest_close_exception",
    {
      p_close_run: args.closeRunId,
      p_check_key: args.checkKey,
      p_reason: args.reason,
      p_op_key: opKey(),
      p_item_key: args.itemKey,
    },
    opts,
  );
}

// Re-exported so a caller needing the raw table read (report_agent_receipts, a
// getRows case) does not have to import ../read directly for this domain family.
export { getRows };
