// Reports-domain reads + doors — see ./types.ts's header for the tier-1/tier-2
// ground truth and file:line cites. Mixed mechanism deliberately: `report_artifacts`
// / `sandbox_exports` / `export_recipients` / `freeform_read_log` are plain
// PostgREST-selectable relations (getRows); `retrieve_signed_original` /
// `approve_report_for_issue` / `archive_signed_original` / `verify_close`-style
// RPCs and `list_sandbox_exports` / `register_export_recipient` /
// `supersede_export_recipient` ride callDoor (POST /rpc/<fn>).

import { getRows, ReadError, isReadError } from "../read";
import { callDoor, DoorRefusal, isDoorRefusal } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type {
  ExportRecipientKind,
  ExportRecipientRow,
  FreeformReadLogRow,
  ReportAgentReceiptRow,
  ReportArtifactRow,
  SandboxExportRow,
  SignedOriginalCustody,
} from "./types";

export { DoorRefusal, isDoorRefusal, ReadError, isReadError };

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** clara.report_artifacts, filtered to one client. A PostgREST 404 (`kind:
 *  "not_found"`) means the relation is not exposed in this environment yet — the
 *  dashboard's own "reporting engine not yet deployed" honest state
 *  (apps/dashboard/app/reports/reportsApi.ts's `isRelationAbsent`), now expressed
 *  through read.ts's shared kind taxonomy instead of a bespoke status check. Any
 *  OTHER ReadError is rethrown — an absence is only evidence when the read that
 *  produced it was sound; a genuine 401/500 must never be relabelled "not deployed". */
export type ReportArtifactsRead = { available: true; rows: ReportArtifactRow[] } | { available: false };

export async function listReportArtifacts(clientId: string, opts: Opts = {}): Promise<ReportArtifactsRead> {
  try {
    const rows = await getRows<ReportArtifactRow>("report_artifacts", {
      filters: { client_id: `eq.${clientId}` },
      order: "sealed_at.desc",
      ...opts,
    });
    return { available: true, rows };
  } catch (e) {
    if (isReadError(e) && e.kind === "not_found") return { available: false };
    throw e;
  }
}

const opKey = (prefix: string, id: string): string => `${prefix}-${id}`;

/** clara.approve_report_for_issue — the ONE human act that closes the pre_sign
 *  chain (0127). `expectedArtifactSha256` is the row's OWN sha, read never
 *  recomputed — the door refuses a mismatch itself. */
export async function issueReportForApproval(
  args: { reportRunId: string; artifactId: string; expectedArtifactSha256: string; reason: string; selfAttestation: string },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "approve_report_for_issue",
    {
      p_report_run_id: args.reportRunId,
      p_expected_artifact_sha256: args.expectedArtifactSha256,
      p_reason: args.reason,
      p_self_attestation: args.selfAttestation,
      p_op_key: opKey("issue", args.artifactId),
    },
    opts,
  );
}

/** clara.archive_signed_original (0127) — the wet-signed pack's own identity. */
export async function archiveSignedOriginal(
  args: {
    reportRunId: string;
    artifactId: string;
    sha256: string;
    byteSize: number;
    signatureEvidence: Record<string, unknown>;
    answersPreSignSha256: string;
  },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "archive_signed_original",
    {
      p_report_run_id: args.reportRunId,
      p_sha256: args.sha256,
      p_byte_size: args.byteSize,
      p_signature_evidence: args.signatureEvidence,
      p_answers_pre_sign_sha256: args.answersPreSignSha256,
      p_op_key: opKey("archive", args.artifactId),
    },
    opts,
  );
}

/** clara.retrieve_signed_original (0127) — METADATA only, never bytes (see
 *  ./types.ts's header). A null result is the door's own honest "nothing
 *  archived yet", rendered as a state, never an error. */
export async function retrieveSignedOriginal(reportRunId: string, opts: Opts = {}): Promise<SignedOriginalCustody | null> {
  const out = await callDoor<SignedOriginalCustody | null>("retrieve_signed_original", { p_report_run_id: reportRunId }, opts);
  return out ?? null;
}

/** clara.list_sandbox_exports(p_view, p_limit) — 0132:1168, bookkeeper+. p_view
 *  null lists every export in the firm; this build filters client-side to rows
 *  whose client_set includes the current client (see ./types.ts's header). */
export async function listSandboxExports(limit = 50, opts: Opts = {}): Promise<SandboxExportRow[]> {
  const out = await callDoor<unknown>("list_sandbox_exports", { p_view: null, p_limit: limit }, opts);
  return Array.isArray(out) ? (out as SandboxExportRow[]) : [];
}

/** clara.export_recipients — direct RLS read (getRows), for the admin recipient
 *  panel. Firm-scoped; not client-filtered (a recipient's `covered_clients` is
 *  itself the per-client fact, when kind='external'). */
export async function listExportRecipients(opts: Opts = {}): Promise<ExportRecipientRow[]> {
  return getRows<ExportRecipientRow>("export_recipients", { order: "registered_by.asc", ...opts });
}

/** clara.register_export_recipient — admin+ (0132:1051-1106). Refusals (role too
 *  low, unknown kind, missing covered_clients) render verbatim by the caller. */
export async function registerExportRecipient(
  args: { kind: ExportRecipientKind; userId: string | null; displayName: string; basis: string; coveredClients: string[] | null },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "register_export_recipient",
    {
      p_kind: args.kind,
      p_user: args.userId,
      p_display_name: args.displayName,
      p_basis: args.basis,
      p_covered_clients: args.coveredClients,
      p_op_key: crypto.randomUUID(),
    },
    opts,
  );
}

/** clara.supersede_export_recipient — admin+ (0132:1115-1164). */
export async function supersedeExportRecipient(
  args: { recipientId: string; reason: string; coveredClients: string[] | null },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "supersede_export_recipient",
    { p_recipient: args.recipientId, p_reason: args.reason, p_covered_clients: args.coveredClients, p_op_key: crypto.randomUUID() },
    opts,
  );
}

/** clara.freeform_read_log, filtered to reads whose client_scope contains this
 *  client — a Postgres array-contains filter (`cs.{<id>}`), PostgREST's own
 *  operator for "array column contains this value". A history read only — see
 *  ./types.ts's header for why there is no "run a freeform read" door here. */
export async function listFreeformReads(clientId: string, opts: Opts = {}): Promise<FreeformReadLogRow[]> {
  return getRows<FreeformReadLogRow>("freeform_read_log", {
    filters: { client_scope: `cs.{${clientId}}` },
    order: "at.desc",
    ...opts,
  });
}

/** clara.report_agent_receipts, filtered to one client (firm-wide RLS scope; see
 *  ./types.ts's header). */
export async function listReportAgentReceipts(clientId: string, opts: Opts = {}): Promise<ReportAgentReceiptRow[]> {
  return getRows<ReportAgentReceiptRow>("report_agent_receipts", {
    filters: { client_id: `eq.${clientId}` },
    order: "at.desc",
    ...opts,
  });
}
