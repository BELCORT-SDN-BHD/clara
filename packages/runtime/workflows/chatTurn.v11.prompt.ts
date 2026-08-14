// @frozen
//
// FROZEN — part of the chatTurn_v11 closure (WAVE E lane eta, E-c: the ad-hoc authoring lane;
// design part2 section 11). A NEW frozen closure beside the byte-untouched chatTurn_v1..v10
// (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export, never an in-place
// edit — the registry repoints `chatTurn:` here).
//
// THE CHANGE, ONCE, FOR THE WHOLE CLOSURE. v11 adds FIVE authoring tools and nothing else: the
// coding lane, the clarify park, the evidence-index resolution and every refusal shape are v10's,
// reached by IMPORT rather than by copy. The five tools let a human compose a metric ad hoc, save
// it as a DRAFT, draft a report spec and ask for a watermarked preview — never approve, never
// issue, and never type a number.
//
// WHY THIS CLOSURE IMPORTS v10's MODULES INSTEAD OF COPYING THEM. scripts/check-frozen-workflows.mjs
// freezes "the transitive relative-import closure of each frozen workflow" and treats the manifest
// as APPEND-ONLY versus origin/main: a CHANGED hash is a hard reject, an ADDED path is not. v10's
// files are not edited here, so their hashes do not move; the v11 paths are appends. Hand-copying
// ~1,900 unchanged lines to satisfy a per-version-file convention would add transcription risk with
// no reviewer benefit, and the convention's own stated reason (chatTurn.v10.tools.ts's header) is
// that two workflow FAMILIES must never import each other's frozen files — a coupling argument
// about autoDraft vs chatTurn, not about two versions of one family. Where an import is impossible
// because v10 does not export the symbol, this closure carries a bounded LOCAL copy and says so.
//
// THIS FILE (prompt) — the v10 prompt surface re-exported unchanged, plus: the five eta tool input
// schemas, and SYSTEM_PROMPT_V11 = v10's system prompt with the authoring paragraph appended.

import { z } from "zod";
import { SYSTEM_PROMPT_V10 } from "./chatTurn.v10.prompt.js";

export {
  DRAFT_TOOL,
  CLARIFY_FRAMING,
  SYSTEM_PROMPT_V10,
  attachmentStub,
  clarifyTool,
  draftJournalEntryInputSchema,
  toTypedParts_v10,
  findClarifyCall,
  hasCodingIntent,
} from "./chatTurn.v10.prompt.js";
export type {
  AiContentPart,
  ClaraPart,
  DraftToolResult,
  JeReviewPart,
  RefusalPart,
} from "./chatTurn.v10.prompt.js";

/** The metric AST the composer hands the database. Deliberately NOT re-validated here: delta's
 *  clara.validate_metric_ast_v1 is the one authority on this contract, and a second schema in the
 *  toolface would be a place for the two to drift. This schema pins only the envelope the wrapper
 *  needs to route the call — every semantic rule (closed primitive set, dimension algebra,
 *  temporality, cost bounds, the numeric-literal prohibition) is the database's, and a violation
 *  comes back as a named CLR10 the model reads. */
export const metricAstSchema = z
  .object({
    ast: z.literal("clara.metric/v1"),
    unit: z.string().min(1),
    temporality: z.string().min(1),
    result_scale: z.number().int().min(0).max(12),
    edge_policy_set: z.string().min(1),
    root: z.record(z.string(), z.unknown()),
  })
  .strict();

export const composeMetricPreviewInputSchema = z
  .object({
    ast: metricAstSchema,
    period_ids: z.array(z.string().uuid()).min(1).max(25),
    snapshot_id: z.string().uuid(),
  })
  .strict();

export const saveMetricDefinitionDraftInputSchema = z
  .object({
    key: z.string().min(1).max(120),
    title: z.string().min(1).max(200),
    ast: metricAstSchema,
    allow_negative: z.boolean().optional(),
    applies_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    applies_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .strict();

export const draftReportSpecInputSchema = z
  .object({
    spec_key: z.string().min(1).max(120),
    title: z.string().min(1).max(200),
    report_template_version_id: z.string().uuid(),
    locale: z.string().min(2).max(16),
    parameters: z.record(z.string(), z.unknown()),
    overrides: z.record(z.string(), z.unknown()),
    layout_ast: z.record(z.string(), z.unknown()),
    // REQUIRED, and deliberately not defaulted anywhere in this lane. The date a spec takes effect
    // is an authoritative input: the database refused deriving it from the clock (epsilon's own CI
    // caught that as a forbidden-clock defect), and a runtime default would put the same choice in
    // the agent's hands one layer up. The model reads it from the user's ask or the bound reporting
    // period; the wrapper refuses a null.
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const requestReportPreviewInputSchema = z
  .object({ report_spec_version_id: z.string().uuid() })
  .strict();

export const listMetricCatalogInputSchema = z
  .object({ limit: z.number().int().min(1).max(200).optional() })
  .strict();

/** The authoring paragraph. It states the two E-R8 floors as instructions the model can follow,
 *  but NONE of it is the enforcement: every clause below is a database refusal first, and this
 *  text exists so the model does not waste turns discovering them. The watermark in particular is
 *  enforced in the DB (design part2 section 11's three fail-closed points), never by this prompt. */
export const ETA_AUTHORING_GUIDANCE = [
  "AD-HOC METRIC AND REPORT AUTHORING (this version's new tools).",
  "",
  "You can help a human explore a figure and shape a report, and you can never make either official.",
  "",
  "- list_metric_catalog shows the metric definitions this firm already has. Prefer an existing",
  "  approved definition over composing a new one; composing is for a question the catalog cannot",
  "  already answer.",
  "- compose_metric_preview evaluates a metric AST as a PREVIEW. The database computes the number;",
  "  you never do arithmetic and never type a figure into your reply. Report the preview by quoting",
  "  the displayed_text the tool returns. A preview is a composition, not a definition: it carries no",
  "  definition version, so it can never appear in a statutory pack. Say so when you show one.",
  "- save_metric_definition_draft saves a composition as a DRAFT for a human to approve. It cannot",
  "  approve anything. Approval is a separate human act with a distinct approver, and you are never",
  "  the approver. Do not tell anyone a metric is approved because you saved it.",
  "- draft_report_spec drafts a report specification. It never approves and never issues. It requires",
  "  effective_from, the date the spec takes effect — take it from what the human asked for, or from",
  "  the reporting period you are working in. Do NOT assume today, and do not guess: if the request",
  "  does not imply a date, ask. Nothing in this system will fill it in for you, by design.",
  "- request_report_preview asks for a WATERMARKED DRAFT render. There is no path from these tools",
  "  to an issued or signed report, by construction rather than by instruction.",
  "",
  "Two floors bind every one of these, and the database enforces both:",
  "1. Every figure in a report comes from the database. The layout you draft has no numeric literal",
  "   node — only structural integers such as column spans and font sizes. If you want a number on a",
  "   page, it must arrive through a metric cell.",
  "2. Every render is a durable artifact. There is no throwaway preview; a watermarked draft is",
  "   recorded exactly like any other render.",
  "",
  "If a tool refuses, read its named reason and fix the request or ask the human — do not retry the",
  "same call hoping for a different answer, and never present a refusal as a result.",
].join("\n");

export const SYSTEM_PROMPT_V11 = `${SYSTEM_PROMPT_V10}\n\n${ETA_AUTHORING_GUIDANCE}`;
