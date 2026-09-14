// @frozen
//
// FROZEN — part of the chatTurn_v19 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v18 (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback).
//
// `buildToolsV19` calls v18's `buildToolsV18(ctx, modelId, segment)` BY IMPORT and adds EXACTLY
// TWO tools: `start_periodic_adjustment_work` (#643) and `remember_client_information` (#644).
// Nothing v18 could do stops being possible and nothing it did changes. ONE successor rather than
// two, because a frozen version is expensive to mint twice and both halves were deliberately
// deferred to this file by their own tickets.
//
// THE ROSTER IS A FIXED LITERAL, AND THAT IS THE WHOLE DEFENCE AGAINST THE NEW READ. v19 puts a
// client's recorded Knowledge into the model's system context, which means text a human typed —
// or a document a human uploaded — now reaches the prompt. Registration comes from THIS module
// alone: `Object.assign` over v18's map plus two literal keys. A tool-shaped JSON object sitting
// in a knowledge value is data in a string; there is no path from it to this object, and
// `chat-turn-v19-tools.test.mjs` exercises exactly that.
//
// ---------------------------------------------------------------------------------------------
// 1 · `start_periodic_adjustment_work` — THE CHAT ENTRANCE #643 LEFT OPEN.
//
// It ADMITS a durable accounting Work exactly as `start_journal_work` does — one
// `clara.accounting_work` row, one queued `clara.agent_tasks` row — and it POSTS NOTHING. The
// entry is written later by a `claraWork` run under an `interactive_client` wake credential
// minted OBO this same human, with the database rechecking their live role, the period, the
// chart, the staff-advance enrolment and the exact cents AT COMMIT. So the honest thing to say
// after this tool succeeds is "I've queued it", and the prompt says exactly that.
//
// THE PARTICULARS ARE TYPED AND THE DATABASE OWNS THEM. Everything this tool needs which is not
// the frozen tool body lives in `packages/runtime/lib/periodic-adjustment-basis.ts` (the
// discriminated-union schema, `adjustmentFromInput`, `basisFromAdjustment`,
// `localAdjustmentRefusal`), where #643 shipped and unit-tested it. Migration 0194's
// `clara._assert_adjustment_basis` and `_assert_adjustment_relationships` re-check every one of
// those rules at admission AND again at commit; the local half is the earlier, more legible one,
// never the authority.
//
// #721, AND THE HONEST SHAPE IT FORCED. A missing particular is refused HERE, by field name,
// BEFORE anything durable exists — never admitted in the hope that a Work question completes the
// basis afterwards. A Work's basis is immutable once admitted (that is what makes a later
// `basis_mismatch` a wall rather than two copies of a guess), so a post-admission question could
// not repair it, and promising otherwise would be a lie told in code.
//
// IT MUST NOT MINT A NEW claraWork BUNDLE, and it does not. A periodic-adjustment Work runs the
// EXISTING frozen `clara-work/v2` body byte for byte: the typed particulars live on
// `clara.accounting_work.adjustment_basis`, a column the run never reads and never echoes.
//
// ---------------------------------------------------------------------------------------------
// 2 · `remember_client_information` — THE GOVERNED CAPTURE #644 LEFT OPEN.
//
// It writes ONE revision through `clara.capture_knowledge_for` (migration 0192), reached through
// the non-frozen `packages/runtime/lib/knowledge.mjs` helper so the envelope decisions stay
// reviewable outside a frozen file. THREE WALLS, none of them this tool's:
//
//   THE KEY IS THE SERVER'S. `clara.knowledge_keys` is a server-owned registry and the door
//   refuses a key that is not in it (`knowledge_key_unknown`), its value shape, and its enum
//   membership. A model that invents a key gets a typed refusal naming the key — never a row.
//
//   THE TRUST IS DERIVED, NEVER SUPPLIED. The tool takes a SOURCE KIND and the database computes
//   the trust from it (0192 §B.2). `model_inference` derives `inferred`, and a policy or
//   authority-bearing key admits `asserted` only — so a model trying to write its own conclusion
//   into `reporting_framework` is refused `knowledge_trust_insufficient` even when the human
//   asking is the firm's owner. The schema below offers the two source kinds a CHAT can honestly
//   claim and no others; the door is what enforces the consequence.
//
//   THE AUTHORITY IS THE NAMED HUMAN'S. `p_asserted_by` is `ctx.createdBy` — the person whose
//   conversation this is — and the door verifies THEIR live, active membership against the key's
//   own floor (`asserted_by_rank_insufficient`). This tool never impersonates and never decides
//   authority.
//
// THE SOURCE BAG IS CLOSED AND THE CHAT HAS NOTHING TO PUT IN IT. 0192's `_knowledge_source_pins`
// admits only `document_id`/`extraction_id`/`region_id`/`field_path`/`work_id` and refuses an
// unknown key outright, so the conversation's own provenance rides `basis` (the model's words
// about who said so) and `recorded_via = 'clara_runtime'` (the door's own stamp), not the pins.
//
// THE OP KEY IS DETERMINISTIC, for the reason `start_journal_work`'s intent key is: a REPLAYED
// step re-executes its tool call, and `clara._reserve_op` returns the first receipt rather than
// writing a second revision.

import { tool } from "ai";
import { z } from "zod";
import { buildToolsV18 } from "./chatTurn.v18.tools.js";
import { authoringRefusal, stableOpKey } from "./chatTurn.v11.tools.js";
import { pools, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import {
  START_PERIODIC_ADJUSTMENT_WORK_TOOL,
  adjustmentFromInput,
  basisFromAdjustment,
  localAdjustmentRefusal,
  startPeriodicAdjustmentWorkInputSchema,
  type StartPeriodicAdjustmentWorkInput,
} from "../lib/periodic-adjustment-basis.js";
import { captureKnowledgeFor } from "../lib/knowledge.mjs";
import type { KnowledgeReceiptPart, WorkAcceptedPartV19 } from "./chatTurn.v19.parts.js";

export { START_PERIODIC_ADJUSTMENT_WORK_TOOL, startPeriodicAdjustmentWorkInputSchema };
export type { StartPeriodicAdjustmentWorkInput };

export const REMEMBER_CLIENT_INFORMATION_TOOL = "remember_client_information";

/** The refusal envelope both tools answer with — v18's `StartJournalWorkResult` shape, so a model
 *  that has learned to read one has learned to read all three. */
export type ToolRefusalV19 = {
  ok: false;
  code: string;
  reason: string | null;
  fix: string | null;
  message: string;
  details: Record<string, unknown>;
};

export type StartPeriodicAdjustmentWorkResult =
  | { ok: true; work_accepted: WorkAcceptedPartV19; task_id: string; status: string; replayed: boolean }
  | ToolRefusalV19;

export type RememberClientInformationResult =
  | { ok: true; knowledge_receipt: KnowledgeReceiptPart; revision_n: number; trust: string; replayed: boolean }
  | ToolRefusalV19;

type DbError = { code?: string; message?: string; detail?: string };

/**
 * THE SOURCE KINDS A CHAT TURN MAY HONESTLY CLAIM, and the list is short on purpose.
 * `document_extraction` needs a document AND an extraction pin this lane has neither of;
 * `registry_lookup` and `imported_bundle` describe acts no chat turn performs; `interview` belongs
 * to the interview lane. What is left is the two real ones: the human said it in this
 * conversation, or Clara concluded it. The database derives the trust from whichever is named and
 * refuses `model_inference` into a policy key — this enum narrows what can be ASKED for, the door
 * decides what is ADMITTED.
 */
export const CHAT_KNOWLEDGE_SOURCE_KINDS = ["user_statement", "model_inference"] as const;

const knowledgeValue = z.union([
  z.string().max(4000),
  z.number(),
  z.boolean(),
  z.record(z.string(), z.unknown()),
]);

export const rememberClientInformationInputSchema = z
  .object({
    knowledge_key: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        "The registered knowledge key this fact belongs to, e.g. trade_nature or default_currency. "
        + "The registry is the server's: a key you invent is refused by name.",
      ),
    value: knowledgeValue.describe(
      "The value, in the shape that key carries (a string, a number, a boolean or an object). "
      + "It is the human's own answer, never a rounding or a guess.",
    ),
    source_kind: z
      .enum(CHAT_KNOWLEDGE_SOURCE_KINDS)
      .describe(
        "`user_statement` when the human told you; `model_inference` when you concluded it. "
        + "Policy keys admit asserted sources only, so an inference into one is refused.",
      ),
    basis: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe("Who said so, on what evidence, in their own terms. A fact with no basis is not a record."),
    applies_when: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("The condition this fact holds under, if the human named one. Leave it out for an unconditional fact."),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD, only if the human dated it."),
    effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD, only if the human dated it."),
    correction_reason: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .optional()
      .describe("Only when the human is CORRECTING what is already on the record. Say what changed and why."),
  })
  .strict();

export type RememberClientInformationInput = z.infer<typeof rememberClientInformationInputSchema>;

function noClientRefusal(reason: string, message: string): ToolRefusalV19 {
  return {
    ok: false,
    code: "CLR03",
    reason,
    fix: "Open this conversation from the client workspace whose books or record this belongs to.",
    message,
    details: {},
  };
}

/** The chat lane's own `particulars_source` — the provenance 0194 REQUIRES for a payroll
 *  obligation, stated as what it actually is. It is not the instruction: the instruction is what
 *  the human asked for, and this is where the figures came from. Bounded at 0194's own 500. */
export function chatParticularsSource(ctx: ToolCtx): string {
  return `supplied in this conversation by the initiating member (chat task ${ctx.taskId})`;
}

/** Read the chat session this turn belongs to FROM THE TASK, never from a model argument — a
 *  model-supplied session id would be a provenance claim nobody checked. v18's own rule. */
async function sessionOfTask(c: PgExec, taskId: string): Promise<string | null> {
  const t = await c.query("select session_id from clara.agent_tasks where id = $1", [taskId]);
  return t.rows[0]?.session_id ?? null;
}

export async function runStartPeriodicAdjustmentWork(
  ctx: ToolCtx,
  input: StartPeriodicAdjustmentWorkInput,
  modelId: string,
): Promise<StartPeriodicAdjustmentWorkResult> {
  if (!ctx.clientId) {
    return noClientRefusal(
      "adjustment_work_needs_client_pin",
      "This conversation is not bound to a client, so it cannot start a periodic-adjustment Work.",
    );
  }
  const local = localAdjustmentRefusal(input);
  if (local) return local;

  const clientId = ctx.clientId;
  const intentKey = stableOpKey(ctx.taskId, START_PERIODIC_ADJUSTMENT_WORK_TOOL, input);
  const adjustment = adjustmentFromInput(input, { particularsSource: chatParticularsSource(ctx) });
  const basis = basisFromAdjustment(input);
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      const sessionId = await sessionOfTask(c, ctx.taskId);
      const sourceRefs = [{ kind: "chat_task", task_id: ctx.taskId, session_id: sessionId }];
      const r = await c.query(
        `select clara.admit_periodic_adjustment_work($1::uuid, $2::uuid, $3::text, $4::text,`
        + ` $5::jsonb, $6::jsonb, $7::text, $8::jsonb, $9::text) as r`,
        [
          clientId,
          ctx.createdBy,
          intentKey,
          input.purpose,
          JSON.stringify(basis),
          JSON.stringify(adjustment),
          "clara_interpreted",
          JSON.stringify(sourceRefs),
          modelId,
        ],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!receipt || receipt.work_id == null) {
      return {
        ok: false,
        code: "internal",
        reason: null,
        fix: null,
        message: "The periodic-adjustment Work could not be started. Nothing was recorded.",
        details: {},
      };
    }
    return {
      ok: true,
      work_accepted: {
        type: "work_accepted",
        work_id: String(receipt.work_id),
        client_id: clientId,
        purpose: input.purpose,
        logical_op_id: String(receipt.logical_op_id ?? ""),
      },
      task_id: String(receipt.task_id ?? ""),
      status: String(receipt.status ?? "queued"),
      replayed: receipt.replayed === true,
    };
  } catch (error) {
    const refused = authoringRefusal(error as DbError);
    if (refused.ok === true) {
      return { ok: false, code: "internal", reason: null, fix: null, message: "The periodic-adjustment Work could not be started.", details: {} };
    }
    return { ok: false, code: refused.code, reason: refused.reason, fix: refused.fix, message: refused.message, details: refused.details };
  }
}

export async function runRememberClientInformation(
  ctx: ToolCtx,
  input: RememberClientInformationInput,
): Promise<RememberClientInformationResult> {
  if (!ctx.clientId) {
    return noClientRefusal(
      "knowledge_capture_needs_client_pin",
      "This conversation is not bound to a client, so there is no client record to remember this against.",
    );
  }
  const clientId = ctx.clientId;
  const opKey = stableOpKey(ctx.taskId, REMEMBER_CLIENT_INFORMATION_TOOL, input);
  const answer = await pools().withRuntime(async (c: PgExec) =>
    captureKnowledgeFor(c, {
      assertedBy: ctx.createdBy,
      clientId,
      knowledgeKey: input.knowledge_key,
      value: input.value,
      basis: input.basis,
      opKey,
      sourceKind: input.source_kind,
      appliesWhen: input.applies_when,
      effectiveFrom: input.effective_from,
      effectiveTo: input.effective_to,
      correctionReason: input.correction_reason,
    }));

  if (answer.ok !== true) {
    // THE DATABASE'S OWN SENTENCE, VERBATIM. `captureKnowledgeFor` already separates a governed
    // refusal (a CLR code the model can act on) from a transport failure (retryable, and NOT a
    // refusal to show a human as one); both reach the model as the same envelope with different
    // codes, because a tool that re-worded a refusal would be the layer that decided what the
    // database meant.
    const kind = typeof answer.kind === "string" ? answer.kind : "unavailable";
    const details: Record<string, unknown> = {};
    if (typeof answer.detail === "object" && answer.detail !== null) {
      for (const key of Object.keys(answer.detail as Record<string, unknown>)) {
        if (key === "reason") continue;
        details[key] = (answer.detail as Record<string, unknown>)[key];
      }
    }
    return {
      ok: false,
      code: typeof answer.code === "string" && answer.code ? answer.code : kind === "refusal" ? "CLR10" : "unavailable",
      reason: typeof answer.reason === "string" ? answer.reason : null,
      fix:
        kind === "refusal"
          ? "Read the refusal: the key registry, the value shape and the trust rules are the server's, and the human's own role decides what may be recorded."
          : "Nothing was recorded. Say so plainly and offer to try again.",
      message: typeof answer.message === "string" && answer.message ? answer.message : "The client information could not be recorded.",
      details,
    };
  }

  const receipt = (answer.receipt ?? null) as Record<string, unknown> | null;
  if (!receipt || receipt.record_id == null) {
    return {
      ok: false,
      code: "internal",
      reason: null,
      fix: null,
      message: "The client information could not be recorded. Nothing was written.",
      details: {},
    };
  }
  return {
    ok: true,
    knowledge_receipt: {
      type: "knowledge_receipt",
      record_id: String(receipt.record_id),
      client_id: clientId,
      knowledge_key: String(receipt.knowledge_key ?? input.knowledge_key),
      knowledge_version: String(receipt.knowledge_version ?? ""),
      revision_kind: String(receipt.revision_kind ?? "capture"),
    },
    revision_n: Number(receipt.revision_n ?? 1),
    trust: String(receipt.trust ?? ""),
    replayed: receipt.replayed === true,
  };
}

export function buildToolsV19(ctx: ToolCtx, modelId: string, segment: number) {
  return Object.assign({}, buildToolsV18(ctx, modelId, segment), {
    [START_PERIODIC_ADJUSTMENT_WORK_TOOL]: tool({
      description:
        "Start an accounting Work that records ONE periodic adjustment for the client pinned to this "
        + "conversation, from figures the human gave you: either a periodic STOCK adjustment (an "
        + "opening and closing count, or the movement itself) or a supplied PAYROLL/statutory "
        + "obligation (EPF, SOCSO, EIS, PCB, HRDF, salary or another supplied kind). Amounts are "
        + "integer CENTS. Never compute an obligation from a contribution rate and never invent a "
        + "count: every figure is the human's. This does NOT post the entry — it queues durable Work "
        + "that posts it under the human's own authority, rechecked at commit. Say you have QUEUED "
        + "it, never that you have recorded it. If a particular is missing — the period, a figure, an "
        + "account, which client — ask with clarify; the basis cannot be changed after admission.",
      inputSchema: startPeriodicAdjustmentWorkInputSchema,
      execute: (input: StartPeriodicAdjustmentWorkInput) => runStartPeriodicAdjustmentWork(ctx, input, modelId),
    }),
    [REMEMBER_CLIENT_INFORMATION_TOOL]: tool({
      description:
        "Record ONE durable fact about the client pinned to this conversation, against a REGISTERED "
        + "knowledge key. Use it when the human tells you something about the client that later work "
        + "should know — not for anything about a single document or entry, which belongs on that "
        + "record. Say who said so and on what evidence in `basis`. Use source_kind `user_statement` "
        + "when the human told you and `model_inference` when you concluded it; the database derives "
        + "the trust and refuses an inference into a policy key. The key registry, the value shape and "
        + "the human's own role are all the server's: if it refuses, tell the human what it said "
        + "rather than trying a different key.",
      inputSchema: rememberClientInformationInputSchema,
      execute: (input: RememberClientInformationInput) => runRememberClientInformation(ctx, input),
    }),
  });
}
