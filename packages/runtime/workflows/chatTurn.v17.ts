// @frozen
//
// FROZEN — the chatTurn_v17 workflow entry (FS-7 ECHELON-1: THE REPORT CHAT OPENER). A NEW
// frozen closure beside byte-untouched chatTurn_v1..v16 (ARCHITECTURE Appendix A: a behavioural
// change ships as a new _vN export, never an in-place edit — registry.ts repoints `chatTurn:`
// here).
//
// v17 vs v16 IN THIS FILE: the segment step is `runModelSegmentStepV17` and the part alias is
// `ClaraPartV17`. NOTHING ELSE MOVED — not `pushPart`, not the park/hook ordering, not the C-19
// terminal set, not `MAX_SEGMENTS`, not `errorCodeFromCaughtError`. This is the v15-shaped case:
// a tool-set addition with no wire widening, except its carried predecessor is v16 and therefore
// includes v16's `freeform_result` replay-dedup arm.
//
// WHY `pushPart` NEEDS NO NEW ARM. The three report tools return their wrappers' jsonb as
// narrative. They construct no part, so there is no report identity to deduplicate within or
// across replayed segments. v16 remains the newest declarer and every one of its arms is carried.
//
// WHY THE C-19 TERMINAL SET IS UNCHANGED. C-19 asks whether a turn that ACTED on the books ended
// with something to show for it. Opening a report run, assessing its claims and sealing its
// dataset mutate the report lifecycle and audit receipts, but not the client's books. They emit
// no card and `hasCodingIntent_v17` therefore delegates to v16: a report-only turn may end in
// honest prose, just as the existing report-domain authoring tools can.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  runModelSegmentStepV17,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v17.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { type ClaraPartV17 } from "./chatTurn.v17.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10/v11/v13/v14/v15/v16's settle error-code derivation — see v13.ts for the
 *  CHECK rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** v16's replay dedup (C-19), byte-carried — see this file's header for why v17 adds no arm. */
function pushPart(all: ClaraPartV17[], p: ClaraPartV17): void {
  if (p.type === "je_review") {
    if (all.some((x) => x.type === "je_review" && x.entry_id === p.entry_id)) return;
  } else if (p.type === "entry_posted") {
    if (all.some((x) => x.type === "entry_posted" && x.post_receipt_id === p.post_receipt_id)) return;
  } else if (p.type === "bank_act") {
    if (all.some((x) => x.type === "bank_act" && x.op_key === p.op_key)) return;
  } else if (p.type === "freeform_result") {
    if (all.some((x) => x.type === "freeform_result" && x.read_id === p.read_id)) return;
  } else if (p.type === "refusal") {
    const key = `${p.code}:${p.reason ?? ""}:${p.message}`;
    if (all.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) return;
  }
  all.push(p);
}

export async function chatTurn_v17(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV17[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13/v14/v15/v16.ts use — settleStep/checkpointStep are
    // v10's FROZEN step bodies typed `ClaraPart[]`; they serialise the array to jsonb without
    // ever branching on a discriminant, so the added part kinds pass through as data.
    await settleStep(taskId, allParts as unknown as Parameters<typeof settleStep>[1], 0, o, errorCode);
  };

  try {
    const claim = await claimRunStep(taskId);
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };

    const task = await loadTaskStepV10(taskId);
    const ctx = await loadContextStepV10(task.sessionId, task.clientId, task.firmId, task.createdBy);
    for (const m of ctx.history) messages.push(m);
    const systemExtra = ctx.contextPack ? `Client context pack (books_version is the freshness token):\n${JSON.stringify(ctx.contextPack)}` : "";

    for (; segment < MAX_SEGMENTS; segment++) {
      const seg = await runModelSegmentStepV17(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
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
      const parkCallContent: Record<string, unknown> | null = parkCall ? {} : null;
      if (parkCallContent && parkCall) {
        parkCallContent.type = "tool-call";
        parkCallContent.toolCallId = String(parkCall.toolCallId);
        parkCallContent.toolName = String(parkCall.toolName);
        parkCallContent.input = JSON.parse(JSON.stringify(parkCall.input ?? {}));
      }
      messages.push({
        role: "assistant",
        content: [
          ...parkText,
          ...(parkCallContent ? [parkCallContent] : []),
        ],
      } as unknown as ModelMessage);
      const hookToken = await mintHookTokenStep();
      const hook = createHook<{ kind: "answer" | "expired" | "cancelled"; answer?: unknown }>({ token: hookToken });
      await openInterruptionStep(taskId, hookToken, { question: seg.clarify.question, context: seg.clarify.context });

      const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

      if (resolution.kind === "answer") {
        await markRunningStep(taskId);
        const toolResultOutput: Record<string, unknown> = {};
        toolResultOutput.type = "json";
        toolResultOutput.value = resolution.answer ?? null;
        const toolResultContent: Record<string, unknown> = {};
        toolResultContent.type = "tool-result";
        toolResultContent.toolCallId = seg.clarify.toolCallId;
        toolResultContent.toolName = "clarify";
        toolResultContent.output = toolResultOutput;
        messages.push({
          role: "tool",
          content: [toolResultContent],
        } as unknown as ModelMessage);
        continue;
      }

      pushPart(allParts, { type: "clarify_closed", reason: resolution.kind, framing: CLARIFY_FRAMING });
      outcome = resolution.kind;
      break;
    }
    if (segment >= MAX_SEGMENTS) outcome = "completed"; // safety bound reached

    // C-19 terminal invariant, byte-carried from v16 — report lifecycle work does NOT join the
    // book-acting set (see this file's header).
    if (codingIntended && outcome === "completed") {
      const hasTerminal = allParts.some((p) => p.type === "je_review" || p.type === "entry_posted" || p.type === "bank_act" || p.type === "refusal" || p.type === "clarify");
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
