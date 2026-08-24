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
  // storage_key is the content-addressed object key ('firms/<firm>/reports/
  // <sha256>.<ext>', 0064's own epsilon-registry check) -- carried through so
  // the row can show WHERE the bytes live, honestly, even though this build
  // ships no signed-download door for it yet (finding 6: no fabricated link).
  storage_key: string;
  key_extension: "pdf" | "json";
  sha256: string;
  byte_size: number;
  claim_removed: boolean;
  uncertified: boolean;
  sealed_by: string;
  sealed_at: string;
  // F-A5 PR-3: the agent_prepared disclosure the issue card must show (design SS3.3/annex A.4) --
  // directed_by is the OBO human when Clara prepared the pack, null on a plain human pack.
  directed_by: string | null;
  prepared_by_agent: boolean;
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
        `&select=id,client_id,report_run_id,kind,storage_key,key_extension,sha256,byte_size,claim_removed,uncertified,sealed_by,sealed_at,directed_by,prepared_by_agent` +
        `&order=sealed_at.desc`,
      token,
    );
    return { available: true, rows };
  } catch (e) {
    if (isRelationAbsent(e)) return { available: false };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// F-A5 PR-3 -- the minimal human doors (design SS3.9, annex A.4; TA-P14 (2):
// "the UI may be crude; it may not be absent"). Same-verb reference
// implementations only -- no new gate, no new judgement, every refusal is the
// governed function's own.
// ---------------------------------------------------------------------------

/** clara.approve_report_for_issue -- the ONE human act that closes the chain.
 *  p_expected_artifact_sha256 must be the sealed pre_sign hash the caller is
 *  actually looking at (never recomputed here, B.11's own law); a mismatch is
 *  the door's OWN refusal, read back as a PgrestError by the caller. */
export async function issueReportForApproval(
  token: string,
  args: { reportRunId: string; expectedArtifactSha256: string; reason: string; selfAttestation: string; opKey: string },
): Promise<unknown> {
  return rpc("approve_report_for_issue", {
    p_report_run_id: args.reportRunId,
    p_expected_artifact_sha256: args.expectedArtifactSha256,
    p_reason: args.reason,
    p_self_attestation: args.selfAttestation,
    p_op_key: args.opKey,
  }, token);
}

/** clara.archive_signed_original -- the wet-signed pack's own identity + the
 *  pre-sign hash it answers. The core (not this form) enforces the chain. */
export async function archiveSignedOriginal(
  token: string,
  args: {
    reportRunId: string; sha256: string; byteSize: number;
    signatureEvidence: Record<string, unknown>; answersPreSignSha256: string; opKey: string;
  },
): Promise<unknown> {
  return rpc("archive_signed_original", {
    p_report_run_id: args.reportRunId,
    p_sha256: args.sha256,
    p_byte_size: args.byteSize,
    p_signature_evidence: args.signatureEvidence,
    p_answers_pre_sign_sha256: args.answersPreSignSha256,
    p_op_key: args.opKey,
  }, token);
}

export type SignedOriginalCustody = {
  artifact_id: string; report_run_id: string; storage_key: string; sha256: string;
  byte_size: number; sealed_by: string; sealed_at: string;
  // S4: prepared_by_agent is the RUN's own provenance (0111, DB-derived), distinct on purpose from
  // sealed_by -- an audited retrieval names BOTH who sealed the wet-signed pack (always a human,
  // structural since the fold-in wall) and whether Clara prepared the run it answers.
  prepared_by_agent: boolean;
  signature_evidence: unknown; answers_pre_sign_sha256: string | null; retrieval_note: string;
};

/** clara.retrieve_signed_original -- audited BEFORE it returns; regenerates
 *  nothing. A null result is the door's own honest "not yet archived", never
 *  an error -- rendered as a state, not a caught exception. */
export async function retrieveSignedOriginal(token: string, reportRunId: string): Promise<SignedOriginalCustody | null> {
  const out = await rpc("retrieve_signed_original", { p_report_run_id: reportRunId }, token);
  return (out as SignedOriginalCustody | null) ?? null;
}

/** clara.requeue_render_job -- human-only, audited, RE-DERIVES the pinned
 *  request rather than copying the failed job's. p_accept_drift defaults
 *  false so nobody consents to a moved manifest by omission (docs/ops/
 *  DR-render.md's own CLR43 requeue_manifest_drifted door). */
export async function requeueRenderJob(
  token: string,
  args: { jobId: string; reason: string; acceptDrift?: boolean },
): Promise<unknown> {
  return rpc("requeue_render_job", {
    p_job: args.jobId, p_reason: args.reason, p_accept_drift: args.acceptDrift ?? false,
  }, token);
}
