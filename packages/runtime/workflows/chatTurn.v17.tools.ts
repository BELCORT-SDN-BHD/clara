// @frozen
//
// FROZEN — part of the chatTurn_v17 closure (FS-7 ECHELON-1: THE REPORT CHAT OPENER). A NEW
// frozen closure beside byte-untouched chatTurn_v1..v16 (ARCHITECTURE Appendix A).
//
// `buildToolsV17` calls v15's `buildToolsV15(ctx, modelId, segment)` BY IMPORT — v16 added no
// tools, so v15 still owns the complete carried set. This closure adds exactly THREE tools:
// open a report run, assess its claims, and seal its dataset. `wake_evaluate_report_pack` is
// deliberately absent: 裁-77 names exactly these three wrappers, and adding a fourth tool would
// open a door the ruling did not grant.
//
// ALL THREE RESULTS ARE NARRATIVE. The generic `agent_receipt` wire kind cannot honestly carry
// them: `_agent_receipt_src_f_a5` is still a `where false` shim, while these wrappers discard the
// `report_agent_receipts.id` returned by their own bare `perform`. Repairing either side is DB
// work outside 裁-77's zero-migration report-tool grant. The wrapper's jsonb therefore rides back
// verbatim for the model to narrate; no part is constructed here.
//
// THE IDS ARE AN HONEST LIMIT. No existing chat tool lists report spec versions, books snapshots,
// reporting periods or chart template versions, and F-A6's enumerated freeform surface contains
// none of those relations. Every description below tells the model to use an id already present
// in the conversation or ask the human for it. Guessing is not a fallback, and inventing a read
// door here would exceed the ruling.
//
// THE CREDENTIAL PATH IS THE ESTABLISHED REPORT-DOMAIN ONE. `writeScoped` mints a plain
// interactive credential OBO the initiating human and calls exactly one wake wrapper under the
// write pool, matching chatTurn.v11.tools.ts's report authoring tools. The F-A5 wrappers use the
// ordinary five-column `wake_context()` and have their interactive grant and allowlist rows live
// since migration 0116; they do not enter the task-bound close-prep credential path.

import { tool } from "ai";
import { z } from "zod";
import { buildToolsV15 } from "./chatTurn.v15.tools.js";
import { authoringRefusal, stableOpKey, type AuthoringResult } from "./chatTurn.v11.tools.js";
import { writeScoped, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";

export const OPEN_REPORT_RUN_TOOL = "open_report_run";
export const ASSESS_REPORT_CLAIM_TOOL = "assess_report_claim";
export const SEAL_REPORT_DATASET_TOOL = "seal_report_dataset";
export const REPORT_CHAT_TOOLS = Object.freeze([
  OPEN_REPORT_RUN_TOOL,
  ASSESS_REPORT_CLAIM_TOOL,
  SEAL_REPORT_DATASET_TOOL,
] as const);

const rationaleSchema = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .describe("Why this report action is being taken, for the audit receipt.");

export const openReportRunInputSchema = z.object({
  report_spec_version_id: z.string().uuid().describe("Exact report spec version UUID already supplied in context by the human."),
  books_snapshot_id: z.string().uuid().describe("Exact books snapshot UUID already supplied in context by the human."),
  reporting_period_id: z.string().uuid().describe("Exact reporting period UUID already supplied in context by the human."),
  rationale: rationaleSchema,
});

export const assessReportClaimInputSchema = z.object({
  report_run_id: z.string().uuid().describe("Exact report run UUID returned by open_report_run or already supplied in context."),
  rationale: rationaleSchema,
});

export const sealReportDatasetInputSchema = z.object({
  report_run_id: z.string().uuid().describe("Exact report run UUID returned by open_report_run or already supplied in context."),
  chart_template_version_ids: z
    .array(z.string().uuid())
    .describe("Exact chart template version UUIDs already supplied in context; use an empty array when the report uses no charts."),
  rationale: rationaleSchema,
});

export type OpenReportRunInput = z.infer<typeof openReportRunInputSchema>;
export type AssessReportClaimInput = z.infer<typeof assessReportClaimInputSchema>;
export type SealReportDatasetInput = z.infer<typeof sealReportDatasetInputSchema>;

type DbError = { code?: string; message?: string; detail?: string };

/** v11's authoring envelope, with v11's mapper reached by import so its refusal vocabulary cannot drift. */
async function authoring(fn: () => Promise<unknown>): Promise<AuthoringResult> {
  try {
    return { ok: true, result: await fn() };
  } catch (error) {
    return authoringRefusal(error as DbError);
  }
}

function noClientRefusal(): AuthoringResult {
  return {
    ok: false,
    code: "CLR03",
    reason: "report_run_needs_client_pin",
    fix: "Open this conversation from the client workspace whose report you want to prepare.",
    message: "This conversation is not bound to a client, so it cannot open a client report run.",
    details: {},
  };
}

function reportModel(modelId: string): string {
  return JSON.stringify({ model: modelId, model_version: "chatTurn_v17" });
}

export function runOpenReportRun(ctx: ToolCtx, input: OpenReportRunInput, modelId: string): Promise<AuthoringResult> {
  if (!ctx.clientId) return Promise.resolve(noClientRefusal());
  return authoring(() =>
    writeScoped(ctx, (c: PgExec) =>
      c
        .query(
          `select clara.wake_open_report_run($1::uuid, $2::uuid, $3::uuid, $4::uuid,
             $5::text, $6::jsonb, $7::text) as r`,
          [
            ctx.clientId,
            input.report_spec_version_id,
            input.books_snapshot_id,
            input.reporting_period_id,
            input.rationale,
            reportModel(modelId),
            stableOpKey(ctx.taskId, OPEN_REPORT_RUN_TOOL, input),
          ],
        )
        .then((r) => r.rows[0]?.r ?? null),
    ),
  );
}

export function runAssessReportClaim(ctx: ToolCtx, input: AssessReportClaimInput, modelId: string): Promise<AuthoringResult> {
  return authoring(() =>
    writeScoped(ctx, (c: PgExec) =>
      c
        .query("select clara.wake_assess_report_claim($1::uuid, $2::text, $3::text, $4::jsonb) as r", [
          input.report_run_id,
          stableOpKey(ctx.taskId, ASSESS_REPORT_CLAIM_TOOL, input),
          input.rationale,
          reportModel(modelId),
        ])
        .then((r) => r.rows[0]?.r ?? null),
    ),
  );
}

export function runSealReportDataset(ctx: ToolCtx, input: SealReportDatasetInput, modelId: string): Promise<AuthoringResult> {
  return authoring(() =>
    writeScoped(ctx, (c: PgExec) =>
      c
        .query("select clara.wake_seal_report_dataset($1::uuid, $2::uuid[], $3::text, $4::text, $5::jsonb) as r", [
          input.report_run_id,
          input.chart_template_version_ids,
          stableOpKey(ctx.taskId, SEAL_REPORT_DATASET_TOOL, input),
          input.rationale,
          reportModel(modelId),
        ])
        .then((r) => r.rows[0]?.r ?? null),
    ),
  );
}

export function buildToolsV17(ctx: ToolCtx, modelId: string, segment: number) {
  return Object.assign({}, buildToolsV15(ctx, modelId, segment), {
    [OPEN_REPORT_RUN_TOOL]: tool({
      description:
        "Open a management-accounts report run for the client pinned to this conversation. Use the exact report spec " +
        "version, books snapshot and reporting period UUIDs already present in context; no chat tool can list those " +
        "objects, so ask the human for any missing id instead of guessing. The JSON result is narrative: explain it in prose; no receipt card is emitted.",
      inputSchema: openReportRunInputSchema,
      execute: (input: OpenReportRunInput) => runOpenReportRun(ctx, input, modelId),
    }),
    [ASSESS_REPORT_CLAIM_TOOL]: tool({
      description:
        "Assess the claims of an existing report run. Use the exact report_run_id already returned or supplied in " +
        "context; no chat tool lists report runs, so ask the human when it is missing. Assessment does not evaluate " +
        "the report pack or mint its metric cells. The JSON result is narrative: explain it in prose; no receipt card is emitted.",
      inputSchema: assessReportClaimInputSchema,
      execute: (input: AssessReportClaimInput) => runAssessReportClaim(ctx, input, modelId),
    }),
    [SEAL_REPORT_DATASET_TOOL]: tool({
      description:
        "Seal an existing, already-evaluated report run's dataset and enqueue its render. A run with no evaluated " +
        "metric cells cannot be sealed, and this chat surface has no pack-evaluation tool. Use the exact report_run_id and chart template " +
        "version UUIDs already present in context; no chat tool lists them, so ask the human for missing ids instead " +
        "of guessing. The JSON result is narrative and means a render was queued, not that a downloadable PDF is ready; no receipt card is emitted.",
      inputSchema: sealReportDatasetInputSchema,
      execute: (input: SealReportDatasetInput) => runSealReportDataset(ctx, input, modelId),
    }),
  });
}
