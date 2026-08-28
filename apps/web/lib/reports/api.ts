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
  PeriodSnapshotRow,
  ReportAgentReceiptRow,
  ReportArtifactRow,
  RenderJobRow,
  SandboxExportRow,
  SeedingBatchRow,
  SeedingProposalRow,
  SignedOriginalCustody,
  SnapshotState,
  WikiPageRow,
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

// M5 (independent review ruling, reversed from this build's own first pass —
// KEEP deterministic, do not switch to crypto.randomUUID()): this is the SAME
// scheme apps/dashboard/app/reports/page.tsx already ships in production
// (`dash-issue-${artifact.id}` / `dash-archive-${artifact.id}`, page.tsx:252/
// :299) — a stable, artifact-scoped op_key so a lost-response retry (a network
// timeout after the RPC actually landed, a double-click) replays the SAME op
// and gets the ORIGINAL receipt back, per `_reserve_op`'s own idempotency
// contract, rather than minting a second op the door then has to disambiguate.
// The `dash-`/no-prefix namespaces are DELIBERATELY not shared — a web-UI
// click on an artifact a dashboard session already issued falls through to
// the real `report_run_state_illegal` refusal instead of silently replaying a
// stale dashboard receipt. The one accepted cost: editing a field (reason/
// attestation) and re-clicking Issue on the SAME artifact reuses the same
// op_key, so `_reserve_op` returns CLR10 (an op_key/request-hash mismatch) —
// now VISIBLE to the human once F2's banner fix lands (it was silently
// swallowed before), which is the accepted answer, not a bug to route around.
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

/** clara.freeform_read_log — a history read only (see ./types.ts's header for
 *  why there is no "run a freeform read" door here). M6 (independent review):
 *  0131:550-553's own CHECK forces `client_scope IS NULL` whenever
 *  `scope = 'firm'` — a single `client_scope cs.{<id>}` filter therefore
 *  structurally EXCLUDES every firm-scope read, even one that in substance
 *  touched this client (a HOME-scoped agent session asking about the whole
 *  firm). Two separate queries, merged and re-sorted by `at desc` — a firm-
 *  scope row is real information for this client's page, not noise to hide,
 *  so it is returned WITH its own `scope: 'firm'` marker intact for the UI to
 *  label honestly, never merged into a false claim of "client-scoped". */
export async function listFreeformReads(clientId: string, opts: Opts = {}): Promise<FreeformReadLogRow[]> {
  const [clientScoped, firmScoped] = await Promise.all([
    getRows<FreeformReadLogRow>("freeform_read_log", {
      filters: { client_scope: `cs.{${clientId}}` },
      order: "at.desc",
      ...opts,
    }),
    getRows<FreeformReadLogRow>("freeform_read_log", {
      filters: { scope: "eq.firm" },
      order: "at.desc",
      ...opts,
    }),
  ]);
  return [...clientScoped, ...firmScoped].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
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

// -----------------------------------------------------------------------------
// T9 (port-wave) reads — rung-0 census at the live 0140 catalog. See ./types.ts's
// T9 header for the create_account_set_v1 retirement finding this module does
// NOT build a surface for.

/** clara.period_snapshots, filtered to one client — `payload` (the frozen
 *  dataset) is deliberately excluded from the select; see ./types.ts's header. */
export async function listPeriodSnapshots(clientId: string, opts: Opts = {}): Promise<PeriodSnapshotRow[]> {
  return getRows<PeriodSnapshotRow>("period_snapshots", {
    select: "id,client_id,reporting_period_id,period_start,period_end,kind,minted_by,minted_at,books_watermark,dataset_sha256",
    filters: { client_id: `eq.${clientId}` },
    order: "period_start.desc",
    ...opts,
  });
}

/** clara.render_jobs, filtered to one client. */
export async function listRenderJobs(clientId: string, opts: Opts = {}): Promise<RenderJobRow[]> {
  return getRows<RenderJobRow>("render_jobs", {
    filters: { client_id: `eq.${clientId}` },
    order: "enqueued_at.desc",
    ...opts,
  });
}

/** clara.seeding_batches, filtered to one client. */
export async function listSeedingBatches(clientId: string, opts: Opts = {}): Promise<SeedingBatchRow[]> {
  return getRows<SeedingBatchRow>("seeding_batches", {
    filters: { client_id: `eq.${clientId}` },
    order: "created_at.desc",
    ...opts,
  });
}

/** clara.seeding_proposals, filtered to one client (not scoped to one batch —
 *  the panel groups client-side by `batch_id`, mirroring the seeding_batches
 *  read above rather than a per-batch fetch per row). */
export async function listSeedingProposals(clientId: string, opts: Opts = {}): Promise<SeedingProposalRow[]> {
  return getRows<SeedingProposalRow>("seeding_proposals", {
    filters: { client_id: `eq.${clientId}` },
    order: "created_at.asc",
    ...opts,
  });
}

/** clara.wiki_pages, filtered to one client. */
export async function listWikiPages(clientId: string, opts: Opts = {}): Promise<WikiPageRow[]> {
  return getRows<WikiPageRow>("wiki_pages", {
    filters: { client_id: `eq.${clientId}` },
    order: "updated_at.desc",
    ...opts,
  });
}

/** clara.mint_month_snapshot(p_client, p_month_start, p_op_key) — bookkeeper+.
 *  `monthStart` must be the first day of a completed month; the door itself
 *  refuses "the month has not finished" (CLR10 period_not_complete) rather
 *  than the UI pre-computing that answer.
 *
 *  RULING F9 (independent review, T9 fix round): `opKey` is CALLER-SUPPLIED,
 *  never minted in here — a departure from register/supersede's own
 *  crypto.randomUUID()-per-call shape above, and a THIRD op_key discipline
 *  alongside M5's per-artifact-stable scheme. The caller (SnapshotRegistryPanel's
 *  MintDialog) mints ONE key when the dialog OPENS and reuses it for every
 *  confirm click while it stays open, via DoorDialog's `onOpenChange`: a
 *  lost-response retry WITHIN one open dialog (a double-click, a network
 *  timeout after the RPC actually landed) replays the SAME op through
 *  `_reserve_op`'s own idempotency and returns the ORIGINAL receipt — closing
 *  and reopening the dialog is the deliberate signal for a genuine re-mint
 *  (re-minting an already-snapshotted month is itself legitimate; see this
 *  module's header), so THAT gets a fresh key. */
export async function mintMonthSnapshot(
  args: { clientId: string; monthStart: string; opKey: string },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "mint_month_snapshot",
    { p_client: args.clientId, p_month_start: args.monthStart, p_op_key: args.opKey },
    opts,
  );
}

/** clara.snapshot_state(p_snapshot) — viewer+. A READ-flavoured RPC (rides
 *  callDoor as transport, labelled a read at this call site per AGENTS.md's
 *  carve-out) — never a governed act, so no op_key and no caller-side act(). */
export async function snapshotState(snapshotId: string, opts: Opts = {}): Promise<SnapshotState> {
  return callDoor<SnapshotState>("snapshot_state", { p_snapshot: snapshotId }, opts);
}

/** clara.requeue_render_job(p_job, p_reason, p_accept_drift) — bookkeeper+.
 *  NO op_key argument on this door (rung-0 finding — the live signature
 *  differs from every other T9 door). F8 (independent review — right
 *  conclusion, wrong citation, corrected): idempotency's PRIMARY mechanism
 *  is the body's own live-successor READ (`select id from render_jobs where
 *  report_run_id=… and kind=… and state<>'failed'`), which REFUSES before
 *  ever reaching the insert if a live job already exists for this request.
 *  The partial unique index (`report_run_id, manifest_sha256 WHERE state <>
 *  'failed'`) is only the CONCURRENT-INSERT backstop for the race window
 *  between that read and the insert (the body's own `exception when
 *  unique_violation` arm) — it is not the mechanism an ordinary sequential
 *  retry goes through. Refuses CLR43 `requeue_manifest_drifted` on a
 *  re-derived manifest that no longer matches the failed job's own pin set
 *  unless `acceptDrift` is explicitly true — never an automatic retry. The
 *  refusal's wire shape carries no digests (RefusalError has no `detail`
 *  passthrough — see wire.ts), so the caller renders the job's own,
 *  already-loaded `manifest_sha256`, labelled the SUPERSEDED one, rather
 *  than fabricating the new one (see RenderJobQueuePanel.tsx's F2 note). */
export async function requeueRenderJob(
  args: { jobId: string; reason: string; acceptDrift?: boolean },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "requeue_render_job",
    { p_job: args.jobId, p_reason: args.reason, p_accept_drift: args.acceptDrift ?? false },
    opts,
  );
}

/** clara.cancel_seeding_batch(p_batch, p_reason, p_op_key) — admin+. */
export async function cancelSeedingBatch(
  args: { batchId: string; reason: string },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "cancel_seeding_batch",
    { p_batch: args.batchId, p_reason: args.reason, p_op_key: crypto.randomUUID() },
    opts,
  );
}

/** clara.complete_seeding_batch(p_batch, p_op_key) — admin+. */
export async function completeSeedingBatch(batchId: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("complete_seeding_batch", { p_batch: batchId, p_op_key: crypto.randomUUID() }, opts);
}

/** clara.decline_seeding_proposal(p_proposal, p_reason, p_op_key) — admin+. */
export async function declineSeedingProposal(
  args: { proposalId: string; reason: string },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "decline_seeding_proposal",
    { p_proposal: args.proposalId, p_reason: args.reason, p_op_key: crypto.randomUUID() },
    opts,
  );
}

/** clara.tick_seeding_proposal(p_proposal, p_op_key) — admin+. */
export async function tickSeedingProposal(proposalId: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("tick_seeding_proposal", { p_proposal: proposalId, p_op_key: crypto.randomUUID() }, opts);
}

/** clara.retire_wiki_page(p_page, p_reason, p_op_key) — bookkeeper+. */
export async function retireWikiPage(
  args: { pageId: string; reason: string },
  opts: Opts = {},
): Promise<unknown> {
  return callDoor(
    "retire_wiki_page",
    { p_page: args.pageId, p_reason: args.reason, p_op_key: crypto.randomUUID() },
    opts,
  );
}
