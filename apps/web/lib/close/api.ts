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
  AgentActReceiptRow,
  ClientFyEndRow,
  CloseGateCatalogRow,
  ClosePlan,
  ClosePrepHoldRow,
  CloseProposalRow,
  CloseReadiness,
  FiscalYearProposal,
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
 *  — FIX-5 (rev-t1): the `close_proposals` carrier, its doors AND a real
 *  read of a live proposal ARE all live (T1, components/close/
 *  CloseProposalPanel.tsx), which corrects an earlier claim on this comment
 *  that the panel itself was unbuilt. What is STILL missing is a per-gate
 *  affordance on GateCheckRow.tsx's own AttestForm — "attest THIS check_key
 *  FROM proposal X's drafted item" — the wiring that would let a human pick
 *  a proposal id to source here, not the panel's existence. This is the
 *  EXISTING audited attest door from 0056 (0056:1816-1941); this build
 *  invents no new writer. */
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

// ---------------------------------------------------------------------------
// T1 (port-wave, 2026-08-29) — the fiscal-year opener + readiness + the
// close_proposal/agent_receipt workbench halves. Rung-0 census: all nine doors
// below are EXECUTE-granted to clara_authenticated ONLY (owner clara_fn_owner,
// SECURITY DEFINER, search_path pinned), verified live on a freshly migrated
// (0001..0142) + seeded throwaway rig — never from migration text.

/** clara.set_client_fy_end(p_client, p_month, p_day, p_op_key) — the fiscal-
 *  year opener's own precondition (OQ-7): moving the FY end refuses CLR38
 *  while a live ANNUAL-cadence adjustment template or depreciation authority
 *  stands (retire it first), and CLR37 on an impossible calendar day. */
export async function setClientFyEnd(
  clientId: string,
  month: number,
  day: number,
  opts: Opts = {},
): Promise<unknown> {
  return callDoor("set_client_fy_end", { p_client: clientId, p_month: month, p_day: day, p_op_key: opKey() }, opts);
}

/** clara.propose_fiscal_year(p_client, p_starts_on) — STABLE, a preview read
 *  (never a governed act; labelled as one at every call site per this
 *  domain's own header convention). Returns the DB's own computed `ends_on` +
 *  whether it fell back to 31 Dec because no fy_end is set yet — the opener
 *  shows this VERBATIM before a human commits to `openFiscalYear`. */
export async function proposeFiscalYear(clientId: string, startsOn: string, opts: Opts = {}): Promise<FiscalYearProposal> {
  return callDoor<FiscalYearProposal>("propose_fiscal_year", { p_client: clientId, p_starts_on: startsOn }, opts);
}

/** clara.open_fiscal_year(p_client, p_label, p_starts_on, p_ends_on,
 *  p_length_reason, p_op_key) — the FIRST-EVER trigger anywhere in the
 *  product (census, port-wave-plan §9.3): zero `fiscal_years` rows exist
 *  until a human calls this. `p_ends_on` is normally the value
 *  `proposeFiscalYear` just showed, accepted or overridden by the human —
 *  this wrapper sends whatever the caller passes, never re-deriving it.
 *  `p_length_reason` is optional and required ONLY once a CLR10
 *  `fy_length_reason_required` refusal has named it (the M7 house pattern —
 *  see `openFiscalYearNeedsLengthReason` in FiscalYearOpener.tsx). */
export async function openFiscalYear(
  args: { clientId: string; label: string; startsOn: string; endsOn: string; lengthReason: string | null },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "open_fiscal_year",
    {
      p_client: args.clientId,
      p_label: args.label,
      p_starts_on: args.startsOn,
      p_ends_on: args.endsOn,
      p_length_reason: args.lengthReason,
      p_op_key: opKey(),
    },
    opts,
  );
}

/** clara.get_close_readiness(p_client, p_fy) — STABLE, the DB's own compact
 *  verdict (ADR-065/E-R2): rendered, never pre-empted. This module computes
 *  no aggregate "ready" boolean because the DB returns none. */
export async function getCloseReadiness(clientId: string, fiscalYearId: string, opts: Opts = {}): Promise<CloseReadiness> {
  return callDoor<CloseReadiness>("get_close_readiness", { p_client: clientId, p_fy: fiscalYearId }, opts);
}

/** clara.record_future_attestation(p_client, p_service_group, p_expected_cents,
 *  p_horizon_start, p_evidence, p_expires_at, p_op_key) — admin rank, refuses
 *  CLR03 for an agent identity ("the future method is human-attested" —
 *  WA21-R6). `p_service_group` is validated server-side against the live
 *  `sst_threshold_schedule` (a table this UI cannot read — no clara_authenticated
 *  grant on it — so the field is plain text, never a fabricated picker). */
export async function recordFutureAttestation(
  args: {
    clientId: string;
    serviceGroup: string;
    expectedCents: number;
    horizonStart: string;
    evidence: string;
    expiresAt: string;
  },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "record_future_attestation",
    {
      p_client: args.clientId,
      p_service_group: args.serviceGroup,
      p_expected_cents: args.expectedCents,
      p_horizon_start: args.horizonStart,
      p_evidence: args.evidence,
      p_expires_at: args.expiresAt,
      p_op_key: opKey(),
    },
    opts,
  );
}

/** clara.hold_close_prep(p_client, p_reason, p_op_key) — bookkeeper rank. A
 *  second hold on an already-held lane is not an error: the DB returns the
 *  standing hold, never a duplicate row (partial unique index). */
export async function holdClosePrep(clientId: string, reason: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("hold_close_prep", { p_client: clientId, p_reason: reason, p_op_key: opKey() }, opts);
}

/** clara.release_close_prep(p_client, p_reason, p_op_key) — bookkeeper rank.
 *  Refuses CLR10 `close_prep_hold_absent` when no live hold stands — RELEASE
 *  IS A STAMP, NEVER A DELETE (Annex A.7). */
export async function releaseClosePrep(clientId: string, reason: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("release_close_prep", { p_client: clientId, p_reason: reason, p_op_key: opKey() }, opts);
}

/** clara.list_agent_act_receipts(p_client, p_since) — STABLE, bookkeeper
 *  rank. `p_since` is optional (the door's own DEFAULT NULL — every receipt
 *  when omitted). */
export async function listAgentActReceipts(
  clientId: string,
  since: string | null = null,
  opts: Opts = {},
): Promise<AgentActReceiptRow[]> {
  const out = await callDoor<unknown>("list_agent_act_receipts", { p_client: clientId, p_since: since }, opts);
  return Array.isArray(out) ? (out as AgentActReceiptRow[]) : [];
}

/** clara.settle_close_proposal(p_proposal, p_state, p_reason, p_op_key) —
 *  bookkeeper + close_and_attest capability. `p_state` is 'adopted' or
 *  'withdrawn' ONLY; a reason is required for 'withdrawn', optional for
 *  'adopted' (the covering attestations already carry their own, per item —
 *  0138 tail's FIX-7/FIX-8). */
export async function settleCloseProposal(
  proposalId: string,
  state: "adopted" | "withdrawn",
  reason: string | null,
  opts: Opts = {},
): Promise<unknown> {
  return callDoor("settle_close_proposal", { p_proposal: proposalId, p_state: state, p_reason: reason, p_op_key: opKey() }, opts);
}

// --- plain table/view reads (getRows — RLS-scoped grants, no RPC involved) --

/** clara.clients' fy_end_month/fy_end_day — the fiscal-year opener's own
 *  precondition read (OQ-7). `null` when RLS admits no such row. */
export async function getClientFyEnd(clientId: string, opts: Opts = {}): Promise<ClientFyEndRow | null> {
  const rows = await getRows<ClientFyEndRow>("clients", {
    select: "id,name,fy_end_month,fy_end_day",
    filters: { id: `eq.${clientId}` },
    session: opts.session,
    signal: opts.signal,
  });
  return rows[0] ?? null;
}

/** clara.close_gate_checks — the 14-row human-readable catalog
 *  (p_cgc_human: `true` for clara_authenticated), joined client-side against
 *  get_close_readiness's bare check_keys so CloseReadinessPanel can show a
 *  title without inventing one. */
export async function getCloseGateCatalog(opts: Opts = {}): Promise<CloseGateCatalogRow[]> {
  return getRows<CloseGateCatalogRow>("close_gate_checks", {
    select: "check_key,drawer,title,applies_when",
    order: "drawer.asc,check_key.asc",
    session: opts.session,
    signal: opts.signal,
  });
}

/** clara.close_proposals for ONE close_run — at most one row ever carries
 *  `state='open'` (uq_close_proposal_live); recent settled rows ride along as
 *  honest history. `null` closeRunId means no close run exists yet for this
 *  fiscal year, so no proposal can exist either — the caller skips the fetch
 *  entirely rather than reading zero rows and calling it "empty". */
export async function listCloseProposalsForRun(closeRunId: string, opts: Opts = {}): Promise<CloseProposalRow[]> {
  return getRows<CloseProposalRow>("close_proposals", {
    select:
      "id,firm_id,client_id,fiscal_year_id,close_run_id,state,proposed_by,bound_digests,drafted,narrative,model_name,model_version,rationale,settled_by,settled_at,settle_reason,created_at",
    filters: { close_run_id: `eq.${closeRunId}` },
    order: "created_at.desc",
    limit: 5,
    session: opts.session,
    signal: opts.signal,
  });
}

/** clara.close_prep_holds — the live hold (if any) for one client's
 *  close_prep lane (uq_hold_active: at most one row per client with
 *  `released_at is null`). */
export async function getLiveClosePrepHold(clientId: string, opts: Opts = {}): Promise<ClosePrepHoldRow | null> {
  const rows = await getRows<ClosePrepHoldRow>("close_prep_holds", {
    select: "id,client_id,purpose,held_by,reason,held_at,released_by,released_at,release_reason",
    filters: { client_id: `eq.${clientId}`, purpose: "eq.close_prep", released_at: "is.null" },
    session: opts.session,
    signal: opts.signal,
  });
  return rows[0] ?? null;
}

// Re-exported so a caller needing the raw table read (report_agent_receipts, a
// getRows case) does not have to import ../read directly for this domain family.
export { getRows };
