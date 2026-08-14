// HUMAN-lane wire client for /reports (Wave E lane theta, plumbing grade).
// Snapshots read from lane gamma's LIVE registry (clara.reporting_periods /
// clara.period_snapshots, 0057) -- always present once the close model
// lane has shipped. Sealed artifacts read from lane epsilon's
// clara.report_artifacts, which the dev database this page runs against may
// NOT carry yet -- every read here is defensive: an absent relation (PostgREST
// 404, the same signal for "table not in the exposed schema" and "no grant
// yet" -- both honestly mean "not reachable today") renders an EXPLICIT
// "reporting engine not yet deployed" state, never a crash and never a silent
// empty list standing in for it. The UI computes no cents and derives no
// figure -- every value here is metadata (ids, dates, digests, byte counts).

import { pgrestSelect, rpc } from "../shared/wire";

// ---------------------------------------------------------------------------
// Snapshots -- clara.period_snapshots (0057), always live.
// ---------------------------------------------------------------------------

export type PeriodSnapshotRow = {
  id: string;
  client_id: string;
  reporting_period_id: string;
  period_start: string;
  period_end: string;
  kind: "management_accounts";
  minted_by: string;
  minted_at: string;
  dataset_sha256: string;
};

export async function listPeriodSnapshots(token: string, clientId: string): Promise<PeriodSnapshotRow[]> {
  return pgrestSelect<PeriodSnapshotRow>(
    `period_snapshots?client_id=eq.${encodeURIComponent(clientId)}` +
      `&select=id,client_id,reporting_period_id,period_start,period_end,kind,minted_by,minted_at,dataset_sha256` +
      `&order=period_start.desc`,
    token,
  );
}

/** clara.snapshot_state(p_snapshot) -- 0057's own reader: 'current' | 'stale' |
 *  'unknown' (no assessment row at all -- absence, never assumed 'current'). */
export async function snapshotState(token: string, snapshotId: string): Promise<string> {
  const out = await rpc("snapshot_state", { p_snapshot: snapshotId }, token);
  return typeof out === "string" ? out : "unknown";
}

// ---------------------------------------------------------------------------
// Sealed artifacts -- clara.report_artifacts (lane epsilon). MAY NOT EXIST in
// the schema this dev run sees; see the file header for the defensive contract.
// ---------------------------------------------------------------------------

export type ReportArtifactRow = {
  id: string;
  client_id: string;
  report_run_id: string;
  kind: "draft_watermarked" | "pre_sign" | "signed_original";
  sha256: string;
  byte_size: number;
  claim_removed: boolean;
  uncertified: boolean;
  sealed_by: string;
  sealed_at: string;
};

export type ReportArtifactsRead =
  | { available: true; rows: ReportArtifactRow[] }
  | { available: false };

/** True when the error is PostgREST's "route not found" signal (404) -- the
 *  ONE class this reader treats as "not deployed yet". Any other failure
 *  (network, malformed query, a real auth error at a status other than 404)
 *  is rethrown -- an absent table is a stated state, not a place to swallow
 *  genuine errors (the standing law: absence is not evidence, and a real
 *  failure must never be relabelled as a known-honest absence). */
function isRelationAbsent(e: unknown): boolean {
  return typeof e === "object" && e !== null && "status" in e && (e as { status?: number }).status === 404;
}

export async function listReportArtifacts(token: string, clientId: string): Promise<ReportArtifactsRead> {
  try {
    const rows = await pgrestSelect<ReportArtifactRow>(
      `report_artifacts?client_id=eq.${encodeURIComponent(clientId)}` +
        `&select=id,client_id,report_run_id,kind,sha256,byte_size,claim_removed,uncertified,sealed_by,sealed_at` +
        `&order=sealed_at.desc`,
      token,
    );
    return { available: true, rows };
  } catch (e) {
    if (isRelationAbsent(e)) return { available: false };
    throw e;
  }
}
