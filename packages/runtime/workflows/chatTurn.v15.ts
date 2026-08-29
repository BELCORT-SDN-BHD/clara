// @frozen
//
// FROZEN — the chatTurn_v15 workflow entry (F-A6 PR-2: THE AUDITED FREEFORM READ, the runtime
// half of ADR-0074's ruled read surface). A NEW frozen closure beside byte-untouched
// chatTurn_v1..v14 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export,
// never an in-place edit — registry.ts repoints `chatTurn:` here).
//
// v15 vs v14 IN THIS FILE: the segment step is `runModelSegmentStepV15` and the part union is
// `ClaraPartV15`. NOTHING ELSE MOVED — not `pushPart`, not the park/hook ordering, not the C-19
// terminal set, not `MAX_SEGMENTS`, not `errorCodeFromCaughtError`. That is the honest summary
// and it is short because the capability F-A6 adds is a READ: it mints no card, changes no book,
// and therefore touches none of the invariants this file exists to hold.
//
// WHY `pushPart` NEEDS NO NEW ARM. F-A6 adds no part kind (chatTurn.v15.prompt.ts's header: a
// chart/table part is a named non-goal, and the `freeform_result` card is P6's own later wire
// bump). The one part a freeform read can promote is a `refusal`, which already has its arm here
// — keyed on code+reason+message, which is also what collapses the oracle-safe family into one
// transcript entry however many times the model retries into it.
//
// WHY THE C-19 TERMINAL SET IS UNCHANGED. C-19 asks whether a turn that ACTED on the books ended
// with something to show for it. A freeform read acts on nothing: it executes as
// `clara_freeform_ro`, a role holding zero DML anywhere in the schema. `hasCodingIntent_v15`
// therefore does not admit it (chatTurn.v15.prompt.ts), and a read-only turn is free to end in
// prose, exactly as it always could.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  runModelSegmentStepV15,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v15.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { type ClaraPartV15 } from "./chatTurn.v15.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10/v11/v13/v14's settle error-code derivation — see v13.ts for the CHECK rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** LOCAL COPY of v14's replay dedup (C-19), byte-carried — see this file's header for why F-A6
 *  adds no arm to it. */
function pushPart(all: ClaraPartV15[], p: ClaraPartV15): void {
  if (p.type === "je_review") {
    if (all.some((x) => x.type === "je_review" && x.entry_id === p.entry_id)) return;
  } else if (p.type === "entry_posted") {
    if (all.some((x) => x.type === "entry_posted" && x.post_receipt_id === p.post_receipt_id)) return;
  } else if (p.type === "bank_act") {
    if (all.some((x) => x.type === "bank_act" && x.op_key === p.op_key)) return;
  } else if (p.type === "refusal") {
    const key = `${p.code}:${p.reason ?? ""}:${p.message}`;
    if (all.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) return;
  }
  all.push(p);
}

export async function chatTurn_v15(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV15[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13/v14.ts use — settleStep/checkpointStep are v10's
    // FROZEN step bodies typed `ClaraPart[]`; they serialise the array to jsonb without ever
    // branching on a discriminant, so the added part kinds pass through as data.
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
      const seg = await runModelSegmentStepV15(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
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

    // C-19 terminal invariant, byte-carried from v14 — the freeform read does NOT join the
    // acting set (see this file's header).
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
