// Depreciation authority + runs — T3 (port wave), verb census at the live
// 0140 catalog. `get_depreciation_runs` in the port-wave plan's own door list
// (port-wave-plan-2026-08-28.md §4, T3) does not exist at the live body —
// the census's own scope note (§7.0): the live pair is `list_depreciation_runs
// (p_client)` (the runs list) and `get_depreciation_run(p_run)` (one run's
// full receipt, singular, keyed by run id not client). Built against the
// live names.

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type FaDepreciationAuthority = {
  id: string;
  /** F6 (independent review, fix-required, 2026-08-28): NARROWED to the two
   *  values get_depreciation_authority's own live query can actually return
   *  — it selects `where status in ('live','proposed') order by (live
   *  first) limit 1`, so a client whose ONLY authority is retired gets
   *  `authority: null` back, never a retired row. `retired` genuinely
   *  exists on `clara.fa_depreciation_authorities` (the table this read
   *  projects from), but this READ never surfaces it — a `retired` arm here
   *  was dead code the live body can never trigger. */
  status: "proposed" | "live";
  cadence: "monthly" | "annual";
  proposed_by: string;
  signed_by: string | null;
  retired_by: string | null;
  created_at: string;
};

export type FaDepreciationAuthorityEnvelope = {
  client_id: string;
  authority: FaDepreciationAuthority | null;
  /** True once at least one OTHER approved, un-reversed `scheduled_run` entry
   *  exists under this live authority — the autopost ramp predicate, DERIVED
   *  by the DB (design SS1.4). Never recomputed client-side. */
  ramp_earned: boolean;
  fy_end: { month: number; day: number; fallback: boolean };
  high_stakes_threshold_cents: number | null;
};

/** clara.get_depreciation_authority(p_client) — viewer+. CLR11 if the client
 *  is not in your firm. `authority` is null when none has ever been
 *  proposed. */
export function getDepreciationAuthority(session: SessionTokenAccessor, clientId: string): Promise<FaDepreciationAuthorityEnvelope> {
  return callDoor<FaDepreciationAuthorityEnvelope>("get_depreciation_authority", { p_client: clientId }, { session });
}

/** clara.propose_depreciation_authority(p_client, p_cadence, p_op_key) —
 *  bookkeeper+. `cadence` must be `monthly` or `annual` (CLR38 otherwise);
 *  refuses CLR38 `authority_already_live` if a live-or-proposed authority
 *  already exists — retire it first. */
export function proposeDepreciationAuthority(
  session: SessionTokenAccessor,
  args: { clientId: string; cadence: "monthly" | "annual" },
): Promise<unknown> {
  return callDoor(
    "propose_depreciation_authority",
    { p_client: args.clientId, p_cadence: args.cadence, p_op_key: crypto.randomUUID() },
    { session },
  );
}

/** clara.sign_depreciation_authority(p_client, p_authority, p_op_key) —
 *  ADMIN+ (WD-R9: the sign floor is stronger than bookkeeper — the signature
 *  is what the autopost ramp derives its authority from). Refuses CLR38 if
 *  the authority is not `proposed`, or another authority is already live.
 *  This module does NOT pre-hide the Sign trigger on a client-side role
 *  guess — the door is the wall; a non-admin sees its own CLR05-shaped
 *  refusal verbatim on attempt. */
export function signDepreciationAuthority(
  session: SessionTokenAccessor,
  args: { clientId: string; authorityId: string },
): Promise<unknown> {
  return callDoor(
    "sign_depreciation_authority",
    { p_client: args.clientId, p_authority: args.authorityId, p_op_key: crypto.randomUUID() },
    { session },
  );
}

/** clara.retire_depreciation_authority(p_client, p_authority, p_reason,
 *  p_op_key) — ADMIN+. `reason` is required (CLR10 blank). Refuses CLR38
 *  `authority_not_live` if already retired. */
export function retireDepreciationAuthority(
  session: SessionTokenAccessor,
  args: { clientId: string; authorityId: string; reason: string },
): Promise<unknown> {
  return callDoor(
    "retire_depreciation_authority",
    { p_client: args.clientId, p_authority: args.authorityId, p_reason: args.reason, p_op_key: crypto.randomUUID() },
    { session },
  );
}

export type FaDepreciationRunRow = {
  id: string;
  authority_id: string;
  period_start: string;
  period_end: string;
  mode: "post" | "draft";
  entries: number;
  charged_cents: number;
  skipped: unknown[];
  entry_id: string | null;
  created_at: string;
};

/** clara.list_depreciation_runs(p_client) — viewer+. CLR11 if the client is
 *  not in your firm. */
export async function listDepreciationRuns(session: SessionTokenAccessor, clientId: string): Promise<FaDepreciationRunRow[]> {
  const out = await callDoor<{ client_id: string; runs: FaDepreciationRunRow[] }>(
    "list_depreciation_runs",
    { p_client: clientId },
    { session },
  );
  return out.runs;
}

/** clara.get_depreciation_run(p_run) — viewer+. Keyed by the run's OWN id
 *  (not `p_client` — the live signature the port-wave plan's
 *  `get_depreciation_runs` name does not match; see this file's header).
 *  CLR11 if the run is not in your firm. */
export async function getDepreciationRun(session: SessionTokenAccessor, runId: string): Promise<FaDepreciationRunRow> {
  const out = await callDoor<{ run: FaDepreciationRunRow }>("get_depreciation_run", { p_run: runId }, { session });
  return out.run;
}

/** clara.run_depreciation_manual(p_client, p_period_start, p_period_end,
 *  p_op_key) — bookkeeper+. The period must be EXACTLY the live authority's
 *  own cadence window (CLR38 `not_cadence_aligned` otherwise — the door
 *  states the exact `period_start`/`period_end` it wanted in the refusal
 *  detail) and must have already ENDED (CLR38 `not_ended`). Refuses CLR38
 *  `authority_not_live` with no live authority, `period_draft_outstanding` /
 *  `period_earlier_unmet` on sequencing, `period_correction_unsound` on a
 *  reversed-and-relanded prior charge. A zero-charge period is a genuine
 *  `noop` — no entry, no receipt — reported, not an error. */
export function runDepreciationManual(
  session: SessionTokenAccessor,
  args: { clientId: string; periodStart: string; periodEnd: string },
): Promise<unknown> {
  return callDoor(
    "run_depreciation_manual",
    { p_client: args.clientId, p_period_start: args.periodStart, p_period_end: args.periodEnd, p_op_key: crypto.randomUUID() },
    { session },
  );
}
