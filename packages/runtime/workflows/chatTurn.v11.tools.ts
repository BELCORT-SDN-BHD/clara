// @frozen
//
// FROZEN — part of the chatTurn_v11 closure (WAVE E lane eta, E-c; design part2 section 11). See
// chatTurn.v11.prompt.ts for the one statement of what v11 changes and why this closure imports
// v10's modules rather than copying them.
//
// THIS FILE (tools) — buildToolsV11 = v10's tool set, unchanged and reached by IMPORT, plus the
// five authoring tools. The coding tool, the read tools, the clarify tool and the whole
// evidence-index resolution are v10's bodies; nothing here can alter them.
//
// THE PRIVILEGE PATH THIS FILE ASSUMES, stated so a reader can check it against the database
// rather than trust this comment: each writing tool calls exactly ONE clara.wake_* wrapper; each
// wrapper is EXECUTE-granted to clara_wake_interactive alone and carries an interactive-only
// clara.wake_fn_allowlist row; the evaluator, the catalog writers and epsilon's report verbs stay
// ungranted to every wake role and are reached only inside those wrappers, under clara_fn_owner.
// The eta wake-wrappers migration pair proves all of that in its own tail, and tests/eta-*.mjs
// re-proves it against a live catalog. A tool here cannot widen it. (The migration is named by
// ROLE, not by filename: this file is frozen and becomes immutable at deploy, so a filename
// baked in here could not be corrected the next time migration numbers move.)

import { tool } from "ai";
import { z } from "zod";
import {
  composeMetricPreviewInputSchema,
  draftReportSpecInputSchema,
  listMetricCatalogInputSchema,
  requestReportPreviewInputSchema,
  saveMetricDefinitionDraftInputSchema,
} from "./chatTurn.v11.prompt.js";
import { readScoped, writeScoped, safeRead, type PgExec, type ToolCtx } from "./chatTurn.v10.infra.js";
import { buildToolsV10 } from "./chatTurn.v10.tools.js";

/** What an authoring tool hands back. A refusal is a RESULT, never a throw: the model has to be
 *  able to read the named reason and the fix the database supplied and act on them. */
export type AuthoringResult =
  | { ok: true; result: unknown }
  | { ok: false; code: string; reason: string | null; fix: string | null; message: string };

type DbError = { code?: string; message?: string; detail?: string };

function detailOf(err: DbError): Record<string, unknown> {
  if (!err?.detail) return {};
  try {
    const parsed = JSON.parse(err.detail) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Map a database refusal to a typed authoring result. Deliberately NOT routed through v10's
 *  refusalFromDbError: that mapper is the CODING lane's taxonomy and feeds the review-card UI,
 *  and folding two unrelated refusal vocabularies into one is how a wrong message reaches a
 *  human. The named reason and the fix are the database's own words, passed through. */
export function authoringRefusal(err: DbError): AuthoringResult {
  const detail = detailOf(err);
  const reason = typeof detail.reason === "string" ? detail.reason : null;
  const fix = typeof detail.fix === "string" ? detail.fix : null;
  const code = String(err?.code ?? "internal");
  const message =
    code === "CLR03"
      ? "That authoring action is not permitted in this session."
      : String(err?.message ?? "That authoring action could not be completed.");
  return { ok: false, code, reason, fix, message };
}

async function authoring(fn: () => Promise<unknown>): Promise<AuthoringResult> {
  try {
    return { ok: true, result: await fn() };
  } catch (e) {
    return authoringRefusal(e as DbError);
  }
}

/** A DETERMINISTIC operation key. Every authoring write reserves on one, because this runs inside
 *  a WDK step and a replayed step re-executes its tool call — without a stable key a replay mints
 *  a second draft or a second preview cell. Same task + same tool + same input yields the same
 *  key, so the database returns the first receipt; a changed input yields a new key. FNV-1a over
 *  canonical JSON, written out rather than imported so this closure carries no hashing dependency
 *  and the value cannot shift under it. */
export function stableOpKey(taskId: string, toolName: string, input: unknown): string {
  const canonical = canonicalJson(input);
  let h = 0x811c9dc5;
  const material = `${taskId}\x00${toolName}\x00${canonical}`;
  for (let i = 0; i < material.length; i += 1) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `eta-${toolName}-${taskId}-${h.toString(16).padStart(8, "0")}`;
}

/** Key-sorted JSON so two structurally identical inputs never produce two op keys. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

type ComposeInput = z.infer<typeof composeMetricPreviewInputSchema>;
type SaveDraftInput = z.infer<typeof saveMetricDefinitionDraftInputSchema>;
type DraftSpecInput = z.infer<typeof draftReportSpecInputSchema>;
type PreviewInput = z.infer<typeof requestReportPreviewInputSchema>;

export function buildToolsV11(ctx: ToolCtx) {
  const base = buildToolsV10(ctx);
  const clientId = ctx.clientId;
  // The authoring tools are all client-scoped. Without a bound client the turn keeps exactly v10's
  // firm-scoped set — a metric or a report with no client is not a thing this lane can author.
  if (!clientId) return base;
  return {
    ...base,
    list_metric_catalog: tool({
      description:
        "List this firm's metric definitions and their states (draft, firm_approved, canonical, superseded, rejected). " +
        "Prefer an existing approved definition over composing a new one.",
      inputSchema: listMetricCatalogInputSchema,
      execute: ({ limit }: { limit?: number }) =>
        // No wrapper and none needed: this is an RLS-scoped SELECT against the catalog tables the
        // agent role already reads (design part2 section 11's table). No EXECUTE grant is created.
        safeRead(() =>
          readScoped(ctx, (c: PgExec) =>
            c
              .query(
                `select coalesce(jsonb_agg(x order by x->>'definition_key'), '[]'::jsonb) as ds from (
                   select jsonb_build_object('definition_key', d.definition_key, 'title', d.title,
                     'definition_version_id', v.id, 'revision', v.revision, 'state', v.state,
                     'unit', v.unit_key, 'temporality', v.temporality_key,
                     'applies_from', v.applies_from, 'applies_to', v.applies_to) as x
                     from clara.metric_definitions d
                     join clara.metric_definition_versions v on v.definition_id = d.id
                    order by d.definition_key, v.revision desc limit $1) q`,
                [limit ?? 100],
              )
              .then((r) => r.rows[0]?.ds ?? []),
          ),
        ),
    }),
    compose_metric_preview: tool({
      description:
        "Evaluate a metric AST as a PREVIEW against a pinned input snapshot. The database computes the number — " +
        "quote the returned displayed_text, never recompute it. The result is a composition, not a definition: it " +
        "carries no definition version and can never appear in a statutory pack. Save it as a draft if the human wants it kept.",
      inputSchema: composeMetricPreviewInputSchema,
      execute: (input: ComposeInput) =>
        authoring(() =>
          writeScoped(ctx, (c: PgExec) =>
            c
              .query(
                "select clara.wake_compose_metric_preview($1::uuid, $2::jsonb, $3::uuid[], $4::uuid, $5::text) as r",
                [
                  clientId,
                  JSON.stringify(input.ast),
                  input.period_ids,
                  input.snapshot_id,
                  stableOpKey(ctx.taskId, "compose_metric_preview", input),
                ],
              )
              .then((r) => r.rows[0]?.r ?? null),
          ),
        ),
    }),
    save_metric_definition_draft: tool({
      description:
        "Save a metric composition as a DRAFT definition version for a human to approve. This never approves anything " +
        "and never produces a canonical or firm_approved version; approval is a separate human act by a distinct approver. " +
        "Do not tell anyone the metric is approved because this succeeded.",
      inputSchema: saveMetricDefinitionDraftInputSchema,
      execute: (input: SaveDraftInput) =>
        authoring(() =>
          writeScoped(ctx, (c: PgExec) =>
            c
              .query(
                `select clara.wake_save_metric_definition_draft($1::uuid, $2::text, $3::text, $4::text, $5::text,
                   $6::smallint, $7::jsonb, $8::boolean, $9::date, $10::date, $11::text) as r`,
                [
                  clientId,
                  input.key,
                  input.title,
                  input.ast.unit,
                  input.ast.temporality,
                  input.ast.result_scale,
                  JSON.stringify(input.ast),
                  input.allow_negative ?? false,
                  input.applies_from,
                  input.applies_to ?? null,
                  stableOpKey(ctx.taskId, "save_metric_definition_draft", input),
                ],
              )
              .then((r) => r.rows[0]?.r ?? null),
          ),
        ),
    }),
    draft_report_spec: tool({
      description:
        "Draft a report specification from a published template version. This never approves and never issues a report. " +
        "The layout you supply carries no numeric literal — every figure on the page arrives through a metric cell. " +
        "effective_from is required and is never defaulted: give the date the spec takes effect, from the request or " +
        "the reporting period in hand, and ask if the request does not imply one.",
      inputSchema: draftReportSpecInputSchema,
      execute: (input: DraftSpecInput) =>
        authoring(() =>
          writeScoped(ctx, (c: PgExec) =>
            c
              .query(
                `select clara.wake_draft_report_spec($1::uuid, $2::text, $3::text, $4::uuid, $5::text,
                   $6::jsonb, $7::jsonb, $8::jsonb, $9::date, $10::text) as r`,
                [
                  clientId,
                  input.spec_key,
                  input.title,
                  input.report_template_version_id,
                  input.locale,
                  JSON.stringify(input.parameters),
                  JSON.stringify(input.overrides),
                  JSON.stringify(input.layout_ast),
                  input.effective_from,
                  stableOpKey(ctx.taskId, "draft_report_spec", input),
                ],
              )
              .then((r) => r.rows[0]?.r ?? null),
          ),
        ),
    }),
    request_report_preview: tool({
      description:
        "Request a WATERMARKED DRAFT render of a report spec draft. There is no path from this tool to an issued or " +
        "signed report. If the render surface is not deployed yet the database says so by name — report that plainly.",
      inputSchema: requestReportPreviewInputSchema,
      execute: (input: PreviewInput) =>
        authoring(() =>
          writeScoped(ctx, (c: PgExec) =>
            c
              .query("select clara.wake_request_report_preview($1::uuid, $2::text) as r", [
                input.report_spec_version_id,
                stableOpKey(ctx.taskId, "request_report_preview", input),
              ])
              .then((r) => r.rows[0]?.r ?? null),
          ),
        ),
    }),
  };
}
