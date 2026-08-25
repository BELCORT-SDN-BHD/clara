// @frozen
//
// FROZEN — the chatTurn_v14 workflow entry (F-A3 PR-3, OQ-6: BANK CHAT PARITY, owner ruling
// 2026-08-25 — a human in chat may drive the bank lane's 13 verbs on the hard condition that the
// receipt records the truth). A NEW frozen closure beside byte-untouched chatTurn_v1..v13
// (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export, never an in-place
// edit — registry.ts repoints `chatTurn:` here).
//
// v14 vs v13 IN THIS FILE: the segment step is `runModelSegmentStepV14` (which additionally
// threads `segment` down, for the bank tools' op-key qualification — chatTurn.v14.bank.ts's
// header), `pushPart` learns the two bank part kinds (`bank_act` keyed by op_key, `bank_pack`
// never deduped — the same law chatTurn.v14.prompt.ts's `toTypedParts_v14` states), and the C-19
// terminal invariant admits `bank_act` alongside `entry_posted`. The segment loop, the park/hook
// ordering, the replay dedup shape and `errorCodeFromCaughtError` are otherwise byte-carried from
// v13. `MAX_SEGMENTS` is UNCHANGED at 12, for the same reason v13 kept it unchanged from v1.
//
// WHY v13's OWN INFRA PREMISE (interactive_client, exactly one allowlist row) IS NOW FALSE, AND
// WHY THAT DOES NOT TOUCH THIS FILE. chatTurn.v14.infra.ts carries the full correction. This file
// only needs to know: v13's own call sites (its post/open-question tools, imported byte-carried
// via chatTurn.v13.tools.js -> chatTurn.v14.tools.js) are unaffected by the widening — they still
// mint exactly what they always minted — and the thirteen bank tools this closure adds mint
// through chatTurn.v14.infra.ts's own `bankScoped`, never v13's `questionScoped`.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  runModelSegmentStepV14,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v14.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { type ClaraPartV14 } from "./chatTurn.v14.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10/v11/v13's settle error-code derivation — see v13.ts for the CHECK rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** LOCAL COPY of v13's replay dedup (C-19), extended with the two bank part kinds. A je_review is
 *  keyed by entry_id; an entry_posted card by post_receipt_id; a bank_act card by its own op_key
 *  (segment-qualified — chatTurn.v14.bank.ts's header — so a genuinely later attempt at the same
 *  subject is never collapsed into an earlier one); a refusal by code+reason+message; a bank_pack
 *  read is NEVER deduped (each is a fresh, informational read — the same law
 *  chatTurn.v14.prompt.ts's toTypedParts_v14 states); every other part appends as-is. */
function pushPart(all: ClaraPartV14[], p: ClaraPartV14): void {
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

export async function chatTurn_v14(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV14[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13.ts uses — settleStep/checkpointStep are v10's FROZEN
    // step bodies typed `ClaraPart[]`; they serialise the array to jsonb without ever branching on
    // a discriminant, so the four new part kinds (entry_posted/question_opened/bank_act/bank_pack)
    // pass through as data exactly as every eta authoring part already does.
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
      const seg = await runModelSegmentStepV14(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
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

    // C-19 terminal invariant, EXTENDED for OQ-6: a bank-acting-intent turn must end with a card,
    // a typed clarify, or a typed refusal too — `bank_act` joins the terminal set for the same
    // reason `entry_posted` did (F-A2): a turn that acted on this client's bank and produced
    // nothing else is the one case where silence would be worst.
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
