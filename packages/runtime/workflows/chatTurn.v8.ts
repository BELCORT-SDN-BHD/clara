// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A, spike T6): a deployed workflow
// body is IMMUTABLE once any run can be in flight. chatTurn_v8 is a NEW frozen closure
// beside the byte-untouched chatTurn_v7/v6/v5/v4/v3/v1 (the registry repoints chatTurn:
// here; prior exports stay until zero non-terminal runs of those versions remain). Do
// NOT edit this file or its import closure (chatTurn.v8.impl / .tools / .infra /
// .prompt / .errors) once deployed.
//
// chatTurn_v8 (owner-approved closing batch, 2026-07-29) ships THREE functional
// changes, everything else an unmodified version-rename of v7:
//
//   #46a (the diagnostic twin) — THIS file's ONLY change: the catch block now
//   derives its settle errorCode via errorCodeFromCaughtError instead of writing
//   the fixed "model_error" literal inline. v7's model-segment step (like
//   autoDraft's own v3, before ledger #44) swallowed a genuine model-stream error
//   into ai@7's generic NoOutputGeneratedError, discarding whatever the upstream
//   fault actually said. chatTurn.v8.impl.ts's consumeChatTurnModelResult (a
//   duplicated, cross-referenced port of autoDraft.v4.impl.ts's ledger #44 fix —
//   full finding in that file's own header) fixes THAT: it captures a genuine
//   stream error and tags it onto the thrown message, so the real upstream cause
//   survives into the run's own workflow_stream_chunks / the WDK step-failure
//   record — exactly what recovered IV-00743's own CLR21 detail live.
//   errorCodeFromCaughtError's OWN job stops short of writing that captured code
//   into the DB: clara.agent_tasks.error_code carries a CHECK constraint
//   (0006_runtime_core.sql:153) admitting only 'model_error'/'tool_error'/
//   'timeout'/'engine_lost'/'limit'/'internal' — a caught, unvalidated tag value
//   is NOT safe to write there (a first draft of this file tried to forward it
//   verbatim; a Codex confirmation pass on this PR caught that it would violate
//   the CHECK and, worse, leave the task stuck non-terminal, since the catch
//   block's settle(...).catch(() => {}) swallows that failure silently). Every
//   caught error — tagged or not — settles error_code = 'model_error', the SAME
//   value v7 always wrote; error_code does NOT differentiate a stream error from
//   any other model-segment failure. The diagnostic value #46a actually adds
//   lives entirely in the tagged MESSAGE, not this column.
//
//   #46b (the tax-rule propagation, RULED: propagate) and #35 (bind-existing
//   counterparty) are BOTH prompt/schema-text-only changes confined entirely to
//   chatTurn.v8.prompt.ts (+ its DRAFT_TOOL description echo in
//   chatTurn.v8.tools.ts) — full rationale in that file's own header. Neither
//   touches this file, chatTurn.v8.impl.ts (beyond #46a above), or
//   chatTurn.v8.errors.ts / chatTurn.v8.infra.ts.
//
// chatTurn_v8 carries everything v7 carried: the durable chat turn WITH the Slice-6
// coding floor, the sales direction, the generic journal_entry lane, the SST
// registration-watch + purchase-visibility framing (v8-refined per #46b above), and
// wiki awareness (every get_context_pack fetch that feeds MODEL context runs purpose
// "wiki_coding" with the txn-local clara.pack_consumer = 'v25' GUC). The schema +
// steps are otherwise byte-identical to v7: like v1 (load snapshot -> load history +
// pack -> loop model segments, checkpoint + stream each, park on clarify, settle
// idempotently) PLUS in-turn attachment perception, the firm-scoped read tools, the
// draft_journal_entry write tool, and — the C-19 terminal invariant — a coding-intent
// turn NEVER settles silently: it ends with a je_review card, a typed clarify, or a
// typed refusal. je_review/refusal parts are deduped as they accumulate so a WDK
// replay never double-appends a card.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV8,
  loadContextStepV8,
  runModelSegmentStepV8,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v8.impl.js";
import { CLARIFY_FRAMING, type ClaraPart } from "./chatTurn.v8.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v8.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** ledger #46a (the diagnostic twin) — CORRECTED (Codex found live during this batch's
 *  own confirmation pass, before merge): a first draft of this function parsed
 *  consumeChatTurnModelResult's [chatturn_model:code] message tag back out and
 *  forwarded its captured code verbatim. clara.agent_tasks.error_code carries a CHECK
 *  constraint (0006_runtime_core.sql:153) admitting only 'model_error'/'tool_error'/
 *  'timeout'/'engine_lost'/'limit'/'internal' — the tag's own code ('model_stream_error')
 *  is NOT in that allowlist, so settle_chat_turn's UPDATE would violate the CHECK, and
 *  the catch block's settle(...).catch(() => {}) would swallow that failure silently,
 *  leaving the task STUCK NON-TERMINAL instead of recording the diagnostic — worse than
 *  v7's always-"model_error" behaviour, and the opposite of the intent. Unlike
 *  autoDraft's refusalFromCaughtError (an UNCONSTRAINED jsonb refusal column, where a
 *  caught tag's raw code is safe to forward), this function has no admitted value to
 *  return except 'model_error' — every caught error, tagged or not, maps to it. This is
 *  NOT dead simplification of a real branch: there never was a second admitted code to
 *  branch to. The real diagnostic value #46a adds lives entirely in
 *  consumeChatTurnModelResult's own tagged THROWN message (chatTurn.v8.impl.ts),
 *  recoverable from the run's workflow_stream_chunks / the WDK step-failure record —
 *  exactly what recovered IV-00743's own CLR21 detail live. This function's only job is
 *  to keep the DB column's CHECK constraint satisfied. Pure — directly unit-testable.
 *  Takes no argument: there is currently no caught-error shape this function reads —
 *  see the paragraph above for why, and for what a future widening would need to add
 *  back. The catch block below calls it as a marker of INTENT (the settle errorCode
 *  for this catch path is deliberately derived, not a bare inline literal), not because
 *  it inspects anything today. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** Accumulate a part with je_review/refusal replay-dedup (C-19). A je_review is keyed
 *  by entry_id; a refusal by code+reason+message; all other parts append as-is. */
function pushPart(all: ClaraPart[], p: ClaraPart): void {
  if (p.type === "je_review") {
    if (all.some((x) => x.type === "je_review" && x.entry_id === p.entry_id)) return;
  } else if (p.type === "refusal") {
    const key = `${p.code}:${p.reason ?? ""}:${p.message}`;
    if (all.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) return;
  }
  all.push(p);
}

export async function chatTurn_v8(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
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

    const task = await loadTaskStepV8(taskId);
    const ctx = await loadContextStepV8(task.sessionId, task.clientId, task.firmId, task.createdBy);
    for (const m of ctx.history) messages.push(m);
    const systemExtra = ctx.contextPack
      ? `Client context pack (books_version is the freshness token):\n${JSON.stringify(ctx.contextPack)}`
      : "";

    for (; segment < MAX_SEGMENTS; segment++) {
      const seg = await runModelSegmentStepV8(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra);
      await checkpointStep(taskId, segment, seg.usageTokens, seg.parts); // durable per-segment (AB6)
      for (const p of seg.parts) pushPart(allParts, p);
      if (seg.coded) codingIntended = true;

      // A recovered attempt (C-12) or a segment with no clarify ends the turn.
      if (seg.recovered || !seg.clarify) {
        outcome = "completed";
        break;
      }

      // The model asked for a human decision — park on a hook (random token, memoized).
      //
      // v3 fix (GATE-3 live find): the COLLECTED segment content is stream OUTPUT —
      // it carries executed read-tool tool-result parts (invalid inside an assistant
      // INPUT message), unpaired extra tool-calls, and provider-metadata-laden
      // reasoning parts. Re-sending it verbatim only ever happens on the
      // resume-after-park path, and after a WDK REPLAY it fails the model input
      // validation (live model_error on both parked coding clarifies). Sanitize to
      // a VALID minimal assistant turn: the text parts + ONLY the clarify tool-call
      // (whose tool-result we pair on resume), all rebuilt as plain objects.
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

    // C-19 terminal invariant: a coding-intent turn must end with a card, a typed
    // clarify, or a typed refusal — never a silent settle. If it reached here with a
    // coding intent but produced none of those, synthesize the coding_incomplete refusal.
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
