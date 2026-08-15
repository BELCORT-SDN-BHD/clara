// @frozen
//
// FROZEN — the chatTurn_v11 workflow entry (WAVE E lane eta, E-c: the ad-hoc authoring lane;
// design part2 section 11). A NEW frozen closure beside the byte-untouched chatTurn_v1..v10
// (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export, never an in-place
// edit — registry.ts repoints `chatTurn:` here). See chatTurn.v11.prompt.ts for the single
// statement of what v11 changes and why this closure imports v10's modules rather than copying
// them.
//
// WHY THIS CLOSURE IMPORTS v10's MODULES INSTEAD OF COPYING THEM — recorded here so the v12 author
// inherits the reasoning rather than re-deriving it, or "fixing" it back to copies. The convention
// in v2..v10 is six per-version files, each an "unmodified version-rename" of its predecessor.
// v11 keeps that ONLY for the files it actually changes (entry, impl, tools, prompt) and IMPORTS
// chatTurn.v10.infra.js and chatTurn.v10.errors.js unchanged. Three grounds, ruled by the
// orchestrator 2026-08-14: (1) scripts/check-frozen-workflows.mjs freezes the transitive
// relative-import closure and treats the manifest as APPEND-ONLY versus origin/main, so a byte
// change to a shared module is a hard reject either way — the failure mode per-version copying
// defends against is mechanically caught regardless; (2) ~1,900 hand-copied lines is a real
// transcription-defect source with no reviewer benefit; (3) chatTurn.v10.tools.ts's own stated
// justification is a cross-FAMILY coupling argument (chatTurn must not import autoDraft's frozen
// files), which does not bind two versions of ONE family. If a future version needs to change
// infra or errors, it authors its own copy then — importing now does not foreclose that.
//
// THIS FILE (the workflow entry) — v10's body with two substitutions: the segment step is
// runModelSegmentStepV11 (which binds the v11 tools and prompt) and the export is chatTurn_v11.
// The segment loop, the park/hook ordering, pushPart's replay dedup, errorCodeFromCaughtError and
// the C-19 terminal invariant are behaviourally identical. The two small helpers below are LOCAL
// COPIES because chatTurn.v10.ts is itself a "use workflow" module and a workflow entry must not
// import another workflow entry.
//
// NOTHING IN THE AUTHORING LANE TOUCHES THIS LOOP. The five new tools neither stop the model loop
// nor set coding intent: they write no journal entry, so the C-19 terminal invariant (a coding
// turn must end with a card, a clarify or a refusal) is unchanged and still keys on the draft tool
// alone.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  runModelSegmentStepV11,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v11.impl.js";
import { CLARIFY_FRAMING, type ClaraPart } from "./chatTurn.v11.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10's settle error-code derivation. clara.agent_tasks.error_code carries a CHECK
 *  (0006_runtime_core.sql:153) that admits only 'model_error'/'tool_error'/'timeout'/'engine_lost'/
 *  'limit'/'internal', so every caught error maps to 'model_error'; the real diagnostic lives in
 *  consumeChatTurnModelResult's tagged thrown message. Called as a marker of intent — the settle
 *  code is derived, never a bare inline literal. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** LOCAL COPY of v10's replay dedup (C-19). A je_review is keyed by entry_id; a refusal by
 *  code+reason+message; every other part appends as-is. */
function pushPart(all: ClaraPart[], p: ClaraPart): void {
  if (p.type === "je_review") {
    if (all.some((x) => x.type === "je_review" && x.entry_id === p.entry_id)) return;
  } else if (p.type === "refusal") {
    const key = `${p.code}:${p.reason ?? ""}:${p.message}`;
    if (all.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) return;
  }
  all.push(p);
}

export async function chatTurn_v11(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPart[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    await settleStep(taskId, allParts, 0, o, errorCode);
  };

  try {
    const claim = await claimRunStep(taskId);
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };

    const task = await loadTaskStepV10(taskId);
    const ctx = await loadContextStepV10(task.sessionId, task.clientId, task.firmId, task.createdBy);
    for (const m of ctx.history) messages.push(m);
    const systemExtra = ctx.contextPack
      ? `Client context pack (books_version is the freshness token):\n${JSON.stringify(ctx.contextPack)}`
      : "";

    for (; segment < MAX_SEGMENTS; segment++) {
      const seg = await runModelSegmentStepV11(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra);
      await checkpointStep(taskId, segment, seg.usageTokens, seg.parts); // durable per-segment (AB6)
      for (const p of seg.parts) pushPart(allParts, p);
      if (seg.coded) codingIntended = true;

      // A recovered attempt (C-12) or a segment with no clarify ends the turn.
      if (seg.recovered || !seg.clarify) {
        outcome = "completed";
        break;
      }

      // The model asked for a human decision — park on a hook (random token, memoized). The v3
      // sanitisation is kept verbatim: collected segment content is stream OUTPUT and re-sending
      // it after a WDK replay fails model input validation, so the park message is rebuilt as the
      // text parts plus ONLY the clarify tool-call whose result we pair on resume.
      const parkText = (seg.assistantContent as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === "text" && typeof p.text === "string" && p.text.trim())
        .map((p) => ({ type: "text" as const, text: String(p.text) }));
      const parkCall = (seg.assistantContent as Array<{ type: string; toolCallId?: string; toolName?: string; input?: unknown }>)
        .find((p) => p.type === "tool-call" && p.toolCallId === seg.clarify?.toolCallId);
      messages.push({
        role: "assistant",
        content: [
          ...parkText,
          ...(parkCall
            ? [{ type: "tool-call" as const, toolCallId: String(parkCall.toolCallId), toolName: String(parkCall.toolName), input: JSON.parse(JSON.stringify(parkCall.input ?? {})) }]
            : []),
        ],
      } as unknown as ModelMessage);
      const hookToken = await mintHookTokenStep();
      const hook = createHook<{ kind: "answer" | "expired" | "cancelled"; answer?: unknown }>({ token: hookToken });
      await openInterruptionStep(taskId, hookToken, { question: seg.clarify.question, context: seg.clarify.context });

      const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

      if (resolution.kind === "answer") {
        await markRunningStep(taskId); // un-park: awaiting_input -> running
        messages.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: seg.clarify.toolCallId,
              toolName: "clarify",
              output: { type: "json", value: resolution.answer ?? null },
            },
          ],
        } as unknown as ModelMessage);
        continue;
      }

      pushPart(allParts, { type: "clarify_closed", reason: resolution.kind, framing: CLARIFY_FRAMING });
      outcome = resolution.kind;
      break;
    }
    if (segment >= MAX_SEGMENTS) outcome = "completed"; // safety bound reached

    // C-19 terminal invariant: a coding-intent turn must end with a card, a typed clarify, or a
    // typed refusal — never a silent settle.
    if (codingIntended && outcome === "completed") {
      const hasTerminal = allParts.some((p) => p.type === "je_review" || p.type === "refusal" || p.type === "clarify");
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
