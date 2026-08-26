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
// NO BYTE-DOWNLOAD MECHANISM EXISTS ANYWHERE IN THIS CATALOG (coordinator ruling,
// re-confirmed against apps/dashboard/app/reports/reportsApi.ts's own header: "this
// build ships no signed-download door — do not fabricate a link", still true past
// 0127). `retrieve_signed_original` and `list_sandbox_exports` both return METADATA
// (storage_key/sha256/byte_size/…), never a fetchable URL — minting a Supabase
// Storage signed URL client-side would be new, unreviewed security-sensitive
// infrastructure this build does not add. This module and its UI render custody
// metadata + a copy-to-clipboard affordance, exactly like the dashboard precedent.

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
