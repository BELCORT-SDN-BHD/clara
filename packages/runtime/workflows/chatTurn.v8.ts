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
//   derives its settle errorCode via errorCodeFromCaughtError instead of the fixed
//   "model_error" literal v7 always used. v7's model-segment step (like autoDraft's
//   own v3, before ledger #44) swallowed a genuine model-stream error into ai@7's
//   generic NoOutputGeneratedError, and this catch then recorded EVERY failure as
//   the same fixed string, discarding whatever the caught error actually said. Now:
//   chatTurn.v8.impl.ts's consumeChatTurnModelResult (a duplicated, cross-referenced
//   port of autoDraft.v4.impl.ts's ledger #44 fix — full finding in that file's own
//   header) captures a genuine stream error and tags it onto the thrown message;
//   errorCodeFromCaughtError (below) parses that tag back out into a specific
//   errorCode ("model_stream_error"). Unlike autoDraft's settle (a jsonb refusal
//   object), settle_chat_turn's errorCode is a plain STRING column — so only the
//   tag's CODE half is forwarded here; the full message detail remains recoverable
//   from the run's own workflow_stream_chunks, exactly as ledger #44's IV-00743
//   recovery demonstrated live. Every OTHER failure class still settles
//   "model_error", UNCHANGED from v7 — this is a pure widening of ONE previously
//   swallowed case, never a behavioural change to any other catch path.
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
  CHATTURN_MODEL_ERROR_TAG,
} from "./chatTurn.v8.impl.js";
import { CLARIFY_FRAMING, type ClaraPart } from "./chatTurn.v8.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v8.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** The EXACT literal shape step-handler.js:507 prepends on retry exhaustion — the text
 *  Step, then a quoted step name, then failed after, then a retry count, then the word
 *  retry or retries, then a colon and a space — matched literally (a quoted step
 *  name, a digit count, the two pluralize('retry','retries',N) outputs), never a wildcard
 *  gap, so this can only recognise WDK's OWN exact wrapper text, nothing merely similar.
 *  Cross-referenced from autoDraft.v4.ts's own WDK_RETRY_PREFIX_SOURCE (ledger #44 /
 *  R-round F1) — duplicated, not shared (see chatTurn.v8.impl.ts's header for why). */
const WDK_RETRY_PREFIX_SOURCE = `Step "[^"]*" failed after \\d+ retr(?:y|ies): `;

/** Matches consumeChatTurnModelResult's own [chatturn_model:code] message tag at
 *  EITHER of exactly two positions — the message's own start, or immediately after WDK's
 *  retry-exhaustion prefix (R-round F1: that prefix is what step-handler.js actually
 *  prepends before the tag ever reaches step.js's FatalError reconstruction). The pattern
 *  stays anchored at the start across BOTH branches, with the prefix branch matched by the
 *  literal shape above rather than a dot-star or any other free-floating scan — an arbitrary vendor
 *  message that happens to CONTAIN the tag text somewhere in its middle, with no exact
 *  prefix immediately before it, can never match. */
const CHATTURN_MODEL_ERROR_PATTERN = new RegExp(
  `^(?:${WDK_RETRY_PREFIX_SOURCE})?\\[${CHATTURN_MODEL_ERROR_TAG}:([^\\]]+)\\]\\s(.*)$`,
  "s",
);

/** ledger #46a (the diagnostic twin): reduce a caught top-level error into the settle
 *  record's errorCode STRING. Unlike autoDraft's refusalFromCaughtError (which returns
 *  {code,message} for a jsonb refusal column), settle_chat_turn's errorCode is a plain
 *  string — so only the tag's CODE half is forwarded; the message detail remains
 *  recoverable from the run's own stream chunks. A tagged stream error yields its own
 *  specific code (e.g. "model_stream_error"); anything else falls back to the
 *  pre-existing fixed "model_error" literal — UNCHANGED default for every other failure
 *  class. Pure — no WDK-ambient call, directly unit-testable. */
export function errorCodeFromCaughtError(err: unknown): string {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const tagged = CHATTURN_MODEL_ERROR_PATTERN.exec(rawMessage);
  if (tagged) return tagged[1] || "model_error";
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
    await settle("failed", errorCodeFromCaughtError(err)).catch(() => {});
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await closeStreamStep().catch(() => {});
  }

  return { taskId, outcome, segments: segment + 1 };
}
