// @frozen
//
// FROZEN — the chatTurn_v18 workflow entry (#623: THE FIRST PERSISTENT CLARA SUCCESSOR, the chat
// half). A NEW frozen closure beside byte-untouched chatTurn_v1..v17 (ARCHITECTURE Appendix A: a
// behavioural change ships as a new _vN export, never an in-place edit — registry.ts repoints
// `chatTurn:` here).
//
// v18 vs v17 IN THIS FILE, and it is exactly two things:
//   1. `pushPart` gains a `work_accepted` arm that dedupes on `work_id`. It is needed and v17's
//      three-tool addition was not, because this version DOES mint a card: a replayed segment
//      (a WDK step re-execution, or a resumed turn after a park) re-runs the model over the same
//      messages, and `start_journal_work`'s deterministic intent key means the second call
//      returns the SAME Work with `replayed:true` — one Work, so one card.
//   2. The C-19 terminal set gains `work_accepted`. `hasCodingIntent_v18` returns true for a
//      `start_journal_work` call (chatTurn.v18.prompt.ts's header says why), so without this the
//      invariant would fire `codingIncompleteRefusal()` on a turn that DID act. C-19 asks
//      whether a turn that acted on the books ended with something to show for it; an admitted
//      Work is something to show.
// Nothing else moved — not the park/hook ordering, not `MAX_SEGMENTS`, not
// `errorCodeFromCaughtError`, not `CHAT_STEP_BUDGET`.
//
// THE DEPLOY ORDER, STATED PLAINLY BECAUSE IT IS THE ONE WAY THIS IMAGE CAN HURT SOMETHING.
// MIGRATION 0178 MUST BE LIVE ON THE DATABASE BEFORE THIS IMAGE ADMITS ANY WORK. `start_journal_work`
// calls `clara.admit_journal_work`, and against a pre-0178 database that call raises
// `undefined_function` (42883). The failure is CONTAINED — the tool returns a typed refusal and
// the turn continues — so nothing is corrupted and no half-admitted Work exists; what a human
// sees is Clara refusing to queue an entry it just offered to queue. That is a bad hour, not a
// bad ledger, and it is avoidable by ordering the two halves. The reverse order is FREE: 0178
// against a v17 image adds tables and verbs nothing calls.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  runModelSegmentStepV18,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v18.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { type ClaraPartV18 } from "./chatTurn.v18.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10/v11/v13/v14/v15/v16/v17's settle error-code derivation — see v13.ts for the
 *  CHECK rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** v17's replay dedup (C-19), byte-carried, plus the ONE new arm (see this file's header). */
function pushPart(all: ClaraPartV18[], p: ClaraPartV18): void {
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
  } else if (p.type === "refusal") {
    const key = `${p.code}:${p.reason ?? ""}:${p.message}`;
    if (all.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) return;
  }
  all.push(p);
}

export async function chatTurn_v18(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV18[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13/v14/v15/v16/v17.ts use — settleStep/checkpointStep
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
    const systemExtra = ctx.contextPack ? `Client context pack (books_version is the freshness token):\n${JSON.stringify(ctx.contextPack)}` : "";

    for (; segment < MAX_SEGMENTS; segment++) {
      const seg = await runModelSegmentStepV18(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
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

    // C-19 terminal invariant, extended by `work_accepted` (see this file's header).
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
