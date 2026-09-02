// Reports-domain read/door shapes — the client workspace's Reports tab (owner
// ruling Q3). TWO STRUCTURALLY DISTINCT tiers, per the coordinator's ruling
// (2026-08-27, following the ground-reports census) — the PRD's own two-tier
// wording is still pending owner word-by-word approval
// (docs/plan/active/r2-prd-two-tier-wording-draft-2026-08-27.md), so this module
// cites the MIGRATIONS for the distinction, never the pending PRD sentence:
//
//   TIER 1 — sealed statutory close reports. `clara.report_artifacts.kind` in
//   ('draft_watermarked','pre_sign','signed_original'); the signed-original
//   ARCHIVE chain, migration 0127 (F-A5 PR-3). Structurally sealed: a
//   BEFORE INSERT wall on `sealed_by` (0127) makes a signed_original row
//   provably human-sealed, never agent-authored.
//
//   TIER 2 — the analysis sandbox. `clara.sandbox_views.authority = 'narrative'`
//   (implicit — sandbox_views/sandbox_exports/export_recipients, migration 0132,
//   F-A5b PR-1). Watermarked, never sealed, and — the ground truth this build
//   corrects the original work order on — REQUEST-ONLY-BY-CLARA: the three mint/
//   request wake verbs (wake_mint_sandbox_view / wake_request_sandbox_export /
//   wake_sandbox_export_state, 0132:867-934) are granted to `clara_wake_interactive`
//   ONLY (0132:1207-1216) — the human/PostgREST lane cannot call them. There is NO
//   human "request an export" door in this catalog; the CLR10
//   `watermark_policy_absent` refusal (0132:508-510, fired inside
//   `_watermark_policy_version_for`) is reachable only from that agent-lane call,
//   never from a human RPC — so this build renders no watermark-refusal UI path,
//   and the request affordance is copy pointing at the Clara rail, not a button.
//
// THE BYTE-DOWNLOAD DOOR NOW EXISTS, AND IT IS SERVER-SIDE ONLY (FS-7 echelon 2,
// 裁-96②; the note this paragraph replaces said no such mechanism existed anywhere
// in this catalog, which was true through 0127 and is no longer). ONE generic door
// covers BOTH artifact families:
//
//   · `clara.list_downloadable_artifacts(p_client, p_limit)` — clara_authenticated.
//     Says WHETHER each artifact is downloadable and what the file will be called.
//     It returns NO storage_key and no URL, ever; a non-downloadable row carries the
//     gate's own typed refusal reason instead.
//   · `GET /api/runtime/artifacts/:id/bytes` — the runtime route, which calls
//     `clara.get_artifact_for_human_read` (granted to clara_runtime and to nothing
//     else) and streams the object with the runtime's storage custody credential.
//
// CLIENT-SIDE SIGNED-URL MINTING REMAINS FORBIDDEN and is now structurally out of
// reach rather than merely declined: no storage host, bucket, key or path reaches
// this side at all. `retrieve_signed_original` and `list_sandbox_exports` still
// return METADATA only — they are custody reads, not download doors.

export type ReportArtifactKind = "draft_watermarked" | "pre_sign" | "signed_original";

/** clara.report_artifacts — read via a plain PostgREST GET (getRows), the same
 *  relation/shape as apps/dashboard/app/reports/reportsApi.ts's `ReportArtifactRow`
 *  (that file's own header: lane epsilon's registry, 0071/0127). */
export type ReportArtifactRow = {
  id: string;
  client_id: string;
  report_run_id: string;
  kind: ReportArtifactKind;
  storage_key: string;
  key_extension: "pdf" | "json";
  sha256: string;
  byte_size: number;
  claim_removed: boolean;
  uncertified: boolean;
  sealed_by: string;
  sealed_at: string;
  directed_by: string | null;
  prepared_by_agent: boolean;
};

/** clara.retrieve_signed_original(p_report_run_id) — 0127. A null result is the
 *  door's own honest "nothing archived yet", never an error. */
export type SignedOriginalCustody = {
  artifact_id: string;
  report_run_id: string;
  storage_key: string;
  sha256: string;
  byte_size: number;
  sealed_by: string;
  sealed_at: string;
  prepared_by_agent: boolean;
  signature_evidence: unknown;
  answers_pre_sign_sha256: string | null;
  retrieval_note: string;
};

export type SandboxExportState = "queued" | "running" | "done" | "failed";

/** clara.list_sandbox_exports(p_view, p_limit) — 0132:1168-1187, bookkeeper+. A
 *  joined read (export ⋈ sandbox_view ⋈ export_recipient) — the human tier-2
 *  history surface. `client_set` is the sandbox view's own client scope (often
 *  the full firm roster — 0132:546-559's free-text fail-safe); this build filters
 *  to rows whose `client_set` includes the current client, client-side, never a
 *  fabricated per-client RPC filter the DB does not offer. */
export type SandboxExportRow = {
  id: string;
  sandbox_view_id: string;
  recipient_id: string;
  recipient_display_name: string;
  client_set: string[];
  watermark_policy_version_id: string;
  state: SandboxExportState;
  artifact_sha256: string | null;
  byte_size: number | null;
  locale: "en" | "ms" | "zh";
  created_at: string;
  finished_at: string | null;
  requested_by: string;
};

export type ExportRecipientKind = "firm_member" | "external";

/** clara.export_recipients — read directly (getRows) for the admin recipient
 *  panel; register/supersede are admin+ doors (0132:1051-1164). */
export type ExportRecipientRow = {
  id: string;
  firm_id: string;
  kind: ExportRecipientKind;
  user_id: string | null;
  display_name: string;
  basis: string;
  covered_clients: string[] | null;
  registered_by: string;
  superseded_by: string | null;
  superseded_at: string | null;
};

/** clara.freeform_read_log — 0131 (ALTER of the 0002 original), bookkeeper+ direct
 *  RLS read. A RECEIPT log, not the query's own result rows (those are never
 *  persisted — only Clara's read of them, live in the chat, is ephemeral by
 *  design; the durable artifact is this audit trail). Every field here is read
 *  verbatim — `rung_vector`/`refusal_reason`/`relations_read` included. */
export type FreeformReadLogRow = {
  id: number;
  firm_id: string;
  credential_id: string;
  query_text: string;
  purpose: string;
  at: string;
  verb: "wake_freeform_read";
  scope: "client" | "firm";
  client_scope: string[] | null;
  acting_actor: string;
  on_behalf_of: string | null;
  via_wake_kind: "interactive" | "interactive_client";
  task_id: string;
  op_key: string;
  settled_at: string | null;
  outcome: "ok" | "refused" | "error" | null;
  refusal_reason: string | null;
  rung_vector: Record<string, unknown> | null;
  relations_read: string[] | null;
  row_count: number | null;
  byte_count: number | null;
  duration_ms: number | null;
  model_snapshot: Record<string, unknown> | null;
};

/** clara.report_agent_receipts — 0111:203-254. Firm-wide RLS scope (firm_id =
 *  jwt_firm()); this build filters to the current client via a plain
 *  `client_id=eq.<id>` query filter, never a second RLS wall. */
export const REPORT_AGENT_RECEIPT_ACTS = [
  "open_run",
  "evaluate_pack",
  "assess_claim",
  "seal_dataset",
  "seal_artifact",
  "approve_definition",
  "supersede_definition",
  "reject_definition",
  "create_account_set",
  "mint_snapshot",
  "publish_chart_template",
  "publish_report_template",
  "typed_read",
  "requeue_render",
] as const;

export type ReportAgentReceiptAct = (typeof REPORT_AGENT_RECEIPT_ACTS)[number];

export type ReportAgentReceiptRow = {
  id: string;
  firm_id: string;
  client_id: string | null;
  report_run_id: string | null;
  definition_version_id: string | null;
  act: ReportAgentReceiptAct;
  outcome: "done" | "refused";
  refusal_token: string | null;
  rung_vector: Record<string, unknown> | null;
  acting_identity: string;
  directed_by: string | null;
  via_wake_kind: string;
  model: string;
  model_version: string;
  rationale: string;
  self_approval_attestation: string | null;
  at: string;
};

// ---------------------------------------------------------------------------
// T9 (port-wave, 2026-08-28) — snapshots, render jobs, seeding, wiki curation.
// Rung-0 census against the live catalog (0140 frontier) grounds every shape
// below; see lib/reports/api.ts's own T9 header for the per-door citations.
//
// create_account_set_v1 is DELIBERATELY ABSENT from this module — the rung-0
// census found it superseded (clara.wake_create_account_set /
// _agent_create_account_set_core, both live and reversal-proven derivations
// of the SAME core logic, already cover the capability for the agent lane;
// grep across apps/web and apps/dashboard finds zero callers of the human
// door anywhere in this product's history). Reported to the conductor by
// name as a retirement candidate (OQ-5) rather than built — building a form
// for it would ship a UI for a body no userflow has ever used.

/** clara.reporting_periods — grain='month' rows are what T9's snapshot
 *  registry lists; grain='fiscal_year' rows exist for the close domain (T1)
 *  and are read here too since the relation is shared, but this module's own
 *  UI only ever mints/lists the month grain. */
export type ReportingPeriodGrain = "month" | "fiscal_year";

export type ReportingPeriodRow = {
  id: string;
  client_id: string;
  grain: ReportingPeriodGrain;
  period_start: string;
  period_end: string;
  fiscal_year_id: string | null;
  minted_by: string;
  minted_at: string;
};

/** clara.period_snapshots — 'management_accounts' is the only live kind
 *  (period_snapshots_kind_check). `payload` (the frozen dataset) is
 *  deliberately excluded from the default select — it is the evidentiary
 *  content, not a summary figure this list view renders. */
export type PeriodSnapshotKind = "management_accounts";

export type PeriodSnapshotRow = {
  id: string;
  client_id: string;
  reporting_period_id: string;
  period_start: string;
  period_end: string;
  kind: PeriodSnapshotKind;
  minted_by: string;
  minted_at: string;
  books_watermark: string;
  dataset_sha256: string;
};

/** clara.snapshot_state(p_snapshot) — the LATEST clara.snapshot_assessments
 *  row for a snapshot (assessment CHECK: 'current'|'stale'), or the door's
 *  own honest 'unknown' when no assessment row exists yet. A read-flavoured
 *  RPC (AGENTS.md's own carve-out) — rides callDoor as transport, is NOT a
 *  governed act. */
export type SnapshotState = "current" | "stale" | "unknown";

/** clara.render_jobs — kind is pinned to the two Tier-1 artifact kinds this
 *  build already renders (render_jobs_kind_check); state's four values are
 *  render_jobs_state_check verbatim. */
export type RenderJobKind = "draft_watermarked" | "pre_sign";
export type RenderJobState = "claimable" | "running" | "done" | "failed";

export type RenderJobRow = {
  id: string;
  client_id: string;
  report_run_id: string;
  kind: RenderJobKind;
  state: RenderJobState;
  manifest_sha256: string;
  requested_by: string;
  attempts: number;
  max_attempts: number;
  last_error: Record<string, unknown> | null;
  supersedes_render_job_id: string | null;
  requeue_reason: string | null;
  enqueued_at: string;
  finished_at: string | null;
};

/** clara.seeding_batches — one document's coding-seed proposals, born
 *  'open', terminal at 'completed'/'cancelled' (ck_seeding_batches_terminal). */
export type SeedingBatchState = "open" | "completed" | "cancelled";

export type SeedingBatchRow = {
  id: string;
  client_id: string;
  source_document_id: string;
  source_sha256: string;
  state: SeedingBatchState;
  stats: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
};

/** clara.seeding_proposals — proposal_kind/state CHECKs verbatim
 *  (seeding_proposals_proposal_kind_check / _state_check). `payload`/
 *  `evidence` are opaque jsonb the DB itself never interprets beyond a
 *  shape check — rendered as data, not summarised. */
export type SeedingProposalKind = "vendor_account_rule" | "counterparty_birth" | "wiki_fact";
export type SeedingProposalState = "proposed" | "ticked" | "declined" | "refused";

export type SeedingProposalRow = {
  id: string;
  batch_id: string;
  client_id: string;
  proposal_kind: SeedingProposalKind;
  proposal_key: string;
  payload: Record<string, unknown>;
  evidence: Record<string, unknown>;
  state: SeedingProposalState;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  refuse_reason: string | null;
  resulting_rule_id: string | null;
  resulting_counterparty_id: string | null;
  created_at: string;
};

/** clara.wiki_pages — page_kind/state CHECKs verbatim (wiki_pages_page_kind_
 *  check / _state_check). */
export type WikiPageKind = "profile" | "counterparty" | "treatment" | "recurring_pattern" | "open_question" | "period_context";
export type WikiPageState = "active" | "retired";

export type WikiPageRow = {
  id: string;
  client_id: string;
  slug: string;
  page_kind: WikiPageKind;
  title: string;
  counterparty_id: string | null;
  current_version_id: string | null;
  state: WikiPageState;
  retired_at: string | null;
  retired_by: string | null;
  retire_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** clara.list_downloadable_artifacts — ONE row per artifact of EITHER family for one
 *  client, carrying the gate's own verdict (FS-7 echelon 2, 裁-96②).
 *
 *  `downloadable` is `clara._artifact_download_core`'s verdict, caught per row inside
 *  the door — never a predicate this catalog re-derives, which is what 裁-112 is about.
 *  When it is false, `refusal_reason` is the database's OWN typed reason and the four
 *  file facts are null: there is nothing to offer, so nothing is described.
 *
 *  There is deliberately no `storage_key` field, and there never will be. */
export type DownloadableArtifactFamily = "report_artifact" | "sandbox_export";

export type DownloadableArtifact = {
  artifact_id: string;
  family: DownloadableArtifactFamily;
  /** The row's own state word: a `report_artifacts.kind`, or a `sandbox_exports.state`. */
  label: string;
  produced_at: string | null;
  downloadable: boolean;
  /** The gate's typed reason when `downloadable` is false — rendered verbatim, never
   *  translated into UI prose about a decision this surface did not make. */
  refusal_reason: string | null;
  sha256: string | null;
  byte_size: number | null;
  content_type: string | null;
  filename: string | null;
};
