// @frozen
//
// FROZEN — the chatTurn_v16 workflow entry (P6-1: THE FOUR-CARD WIRE BUMP, the runtime half of
// ruling Q8 at 裁-9's depth). A NEW frozen closure beside byte-untouched chatTurn_v1..v15
// (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export, never an in-place
// edit — registry.ts repoints `chatTurn:` here).
//
// v16 vs v15 IN THIS FILE: the segment step is `runModelSegmentStepV16`, the part union is
// `ClaraPartV16`, and `pushPart` gains ONE arm. NOTHING ELSE MOVED — not the park/hook
// ordering, not the C-19 terminal set, not `MAX_SEGMENTS`, not `errorCodeFromCaughtError`. That
// is the honest summary, and it is short because what Q8 adds is a WIRE widening: four kinds
// the transcript may now carry, one of which this lane can lawfully emit (chatTurn.v16.prompt.
// ts's header names the three it cannot, and the grant and allowlist rows that refuse them).
//
// WHY `pushPart` NEEDS EXACTLY ONE NEW ARM, AND WHICH. Its job is cross-SEGMENT replay dedup;
// a kind belongs here only if this body can push it twice for one real event. `freeform_result`
// can — a WDK replay re-runs a segment and re-promotes its parts — and it carries the receipt
// row's own primary key, so keying on `read_id` collapses the replay and nothing else (two
// genuine reads never share an id; the reasoning against the `bank_pack` precedent is in
// chatTurn.v16.prompt.ts's `toTypedParts_v16`). The other three Q8 kinds get NO arm, and that
// is not an omission: this body cannot emit them at all, so an arm would be dead code
// asserting a producer that does not exist.
//
// WHY THE C-19 TERMINAL SET IS UNCHANGED. C-19 asks whether a turn that ACTED on the books
// ended with something to show for it. A freeform read acts on nothing — it executes as
// `clara_freeform_ro`, a role holding zero DML anywhere in the schema — so `hasCodingIntent_v16`
// does not admit it (it IS `hasCodingIntent_v15`), and a read-only turn is still free to end in
// prose. Minting a card for the read does not change what the turn DID, so `freeform_result`
// does not join the terminal set either.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  runModelSegmentStepV16,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v16.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { type ClaraPartV16 } from "./chatTurn.v16.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10/v11/v13/v14/v15's settle error-code derivation — see v13.ts for the CHECK
 *  rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** v15's replay dedup (C-19), byte-carried, plus Q8's ONE new arm — see this file's header for
 *  why `freeform_result` earns one and the other three Q8 kinds do not. */
function pushPart(all: ClaraPartV16[], p: ClaraPartV16): void {
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

export async function chatTurn_v16(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV16[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13/v14/v15.ts use — settleStep/checkpointStep are
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
      const seg = await runModelSegmentStepV16(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
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

    // C-19 terminal invariant, byte-carried from v15 — the freeform read does NOT join the
    // acting set, and neither does the card Q8 mints for it (see this file's header).
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
