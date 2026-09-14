// @frozen
//
// FROZEN — the chatTurn_v19 workflow entry: the SHARED successor #643 and #644 both deferred
// their runtime half into. A NEW frozen closure beside byte-untouched chatTurn_v1..v18
// (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback: a behavioural change ships as a
// new _vN export, never an in-place edit — registry.ts repoints `chatTurn:` here).
//
// ONE SUCCESSOR, TWO TICKETS, AND THAT WAS A DECISION RATHER THAN A CONVENIENCE. A frozen version
// costs a manifest entry, a bundle, a rollback target and a parked-run obligation for every body
// it supersedes; minting two of them a week apart would have paid that twice for two additions
// that touch nothing of each other. #643 and #644 both shipped their non-frozen halves ready for
// this file and said so in their own modules' feet.
//
// v19 vs v18 IN THIS FILE, and it is exactly three things:
//   1. THE KNOWLEDGE CONTEXT STEP. `loadKnowledgeContextStepV19` runs beside v10's frozen
//      `loadContextStepV10`, and its rendered block is APPENDED to the system context. The whole
//      point is the honesty of the unavailable case — see chatTurn.v19.prompt.ts's header and
//      #603. v10's own pack read, its `catch { contextPack = null }` included, is byte-untouched:
//      it is frozen, it is reached by import, and widening it was never available.
//   2. `pushPart` gains a `knowledge_receipt` arm that dedupes on `record_id`, for exactly the
//      reason v18's `work_accepted` arm dedupes on `work_id`: a replayed segment re-runs the model
//      over the same messages, `remember_client_information`'s op key is deterministic, so the
//      second call returns the SAME record — one record, one card.
//   3. The two new tools reach the model, through `buildToolsV19` inside the segment step.
//
// THE C-19 TERMINAL SET IS V18'S, UNCHANGED, and that is a considered no-op rather than an
// oversight. `hasCodingIntent_v19` returns true for `start_periodic_adjustment_work`, whose
// terminal card is `work_accepted` — already in the set since v18. It returns FALSE for
// `remember_client_information`: remembering a fact is not acting on the books, so a turn that
// only remembered something is not a turn C-19 has anything to ask about.
//
// THE DEPLOY ORDER, STATED PLAINLY BECAUSE IT IS THE ONE WAY THIS IMAGE CAN HURT SOMETHING.
// MIGRATIONS 0192 AND 0194 MUST BE LIVE ON THE DATABASE BEFORE THIS IMAGE SERVES A TURN.
// `start_periodic_adjustment_work` calls `clara.admit_periodic_adjustment_work` (0194);
// `remember_client_information` calls `clara.capture_knowledge_for` and the context step calls
// `clara.get_knowledge_pack` (both 0192). Against a database without them each raises
// `undefined_function` (42883). Two of the three failures are CONTAINED — the tools return a typed
// refusal and the turn continues — and THE THIRD IS CONTAINED BY CONSTRUCTION: `readKnowledgePack`
// classifies the missing function as `read_failed` and the block renders "client knowledge
// unavailable", which is the honest thing to say about a database that cannot answer. So a wrong
// order corrupts nothing; it makes Clara refuse things it just offered to do, for as long as it
// lasts. Deploy the migrations first. The REVERSE order is FREE: 0192 and 0194 against a v18 image
// add tables and verbs that nothing calls.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  loadKnowledgeContextStepV19,
  runModelSegmentStepV19,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v19.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { systemExtraV19, type ClaraPartV19 } from "./chatTurn.v19.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10/v11/v13/v14/v15/v16/v17/v18's settle error-code derivation — see v13.ts for
 *  the CHECK rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** v18's replay dedup (C-19), byte-carried, plus the ONE new arm (see this file's header). */
function pushPart(all: ClaraPartV19[], p: ClaraPartV19): void {
  if (p.type === "je_review") {
    if (all.some((x) => x.type === "je_review" && x.entry_id === p.entry_id)) return;
  } else if (p.type === "entry_posted") {
    if (all.some((x) => x.type === "entry_posted" && x.post_receipt_id === p.post_receipt_id)) return;
  } else if (p.type === "bank_act") {
    if (all.some((x) => x.type === "bank_act" && x.op_key === p.op_key)) return;
  } else if (p.type === "freeform_result") {
    if (all.some((x) => x.type === "freeform_result" && x.read_id === p.read_id)) return;
  } else if (p.type === "work_accepted") {
    if (all.some((x) => x.type === "work_accepted" && x.work_id === p.work_id)) return;
  } else if (p.type === "knowledge_receipt") {
    if (all.some((x) => x.type === "knowledge_receipt" && x.record_id === p.record_id)) return;
  } else if (p.type === "refusal") {
    const key = `${p.code}:${p.reason ?? ""}:${p.message}`;
    if (all.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) return;
  }
  all.push(p);
}

export async function chatTurn_v19(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV19[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13/v14/v15/v16/v17/v18.ts use — settleStep/checkpointStep
    // are v10's FROZEN step bodies typed `ClaraPart[]`; they serialise the array to jsonb without
    // ever branching on a discriminant, so the added part kinds pass through as data.
    await settleStep(taskId, allParts as unknown as Parameters<typeof settleStep>[1], 0, o, errorCode);
  };

  try {
    const claim = await claimRunStep(taskId);
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };

    const task = await loadTaskStepV10(taskId);
    const ctx = await loadContextStepV10(task.sessionId, task.clientId, task.firmId, task.createdBy);
    for (const m of ctx.history) messages.push(m);
    const packText = ctx.contextPack ? `Client context pack (books_version is the freshness token):\n${JSON.stringify(ctx.contextPack)}` : "";
    const knowledge = await loadKnowledgeContextStepV19(task.clientId, task.firmId);
    const systemExtra = systemExtraV19(packText, knowledge.text);

    for (; segment < MAX_SEGMENTS; segment++) {
      const seg = await runModelSegmentStepV19(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
      await checkpointStep(taskId, segment, seg.usageTokens, seg.parts as unknown as Parameters<typeof checkpointStep>[3]); // durable per-segment (AB6)
      for (const p of seg.parts) pushPart(allParts, p);
      if (seg.coded) codingIntended = true;

      if (seg.recovered || !seg.clarify) {
        outcome = "completed";
        break;
      }

      const parkText = (seg.assistantContent as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === "text" && typeof p.text === "string" && p.text.trim())
        .map((p) => ({ type: "text" as const, text: String(p.text) }));
      const parkCall = (seg.assistantContent as Array<{ type: string; toolCallId?: string; toolName?: string; input?: unknown }>).find(
        (p) => p.type === "tool-call" && p.toolCallId === seg.clarify?.toolCallId,
      );
      messages.push({
        role: "assistant",
        content: [
          ...parkText,
          ...(parkCall ? [{ type: "tool-call" as const, toolCallId: String(parkCall.toolCallId), toolName: String(parkCall.toolName), input: JSON.parse(JSON.stringify(parkCall.input ?? {})) }] : []),
        ],
      } as unknown as ModelMessage);
      const hookToken = await mintHookTokenStep();
      const hook = createHook<{ kind: "answer" | "expired" | "cancelled"; answer?: unknown }>({ token: hookToken });
      await openInterruptionStep(taskId, hookToken, { question: seg.clarify.question, context: seg.clarify.context });

      const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

      if (resolution.kind === "answer") {
        await markRunningStep(taskId);
        messages.push({
          role: "tool",
          content: [{ type: "tool-result", toolCallId: seg.clarify.toolCallId, toolName: "clarify", output: { type: "json", value: resolution.answer ?? null } }],
        } as unknown as ModelMessage);
        continue;
      }

      pushPart(allParts, { type: "clarify_closed", reason: resolution.kind, framing: CLARIFY_FRAMING });
      outcome = resolution.kind;
      break;
    }
    if (segment >= MAX_SEGMENTS) outcome = "completed"; // safety bound reached

    // C-19 terminal invariant — v18's set, unchanged (see this file's header).
    if (codingIntended && outcome === "completed") {
      const hasTerminal = allParts.some(
        (p) =>
          p.type === "je_review" ||
          p.type === "entry_posted" ||
          p.type === "bank_act" ||
          p.type === "work_accepted" ||
          p.type === "refusal" ||
          p.type === "clarify",
      );
      if (!hasTerminal) pushPart(allParts, codingIncompleteRefusal());
    }

    await settle(outcome, null);
  } catch (err) {
    await settle("failed", errorCodeFromCaughtError()).catch(() => {});
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await closeStreamStep().catch(() => {});
  }

  return { taskId, outcome, segments: segment + 1 };
}
