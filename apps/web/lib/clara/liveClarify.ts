// The ONE live-chunk fold in apps/web — PRD §5a's "Clara asks in the thread, the
// human answers in the thread", ported MECHANISM (never look) from the old surface's
// `applyChunk` (apps/dashboard/app/chat/parts.tsx:59-79, the `tool === "clarify"`
// branch only).
//
// WHY IT HAS TO EXIST (measured at rung 0, 2026-09-02 — this is the finding that
// re-cut this train):
//   `clara.settle_chat_turn` (packages/db/migrations/0006_runtime_core.sql:1043-1065)
//   inserts the assistant `clara.chat_messages` row AND, in the same statement
//   sequence, sets every still-`pending` `clara.agent_interruptions` row for the task
//   to `cancelled`. `lib/clara/api.ts`'s `getMessages` reads ONLY that persisted row.
//   So a `clarify` part that has reached the persisted transcript can never still
//   have a pending interruption behind it: an answer control mounted on the persisted
//   transcript alone is a control that can never be used. The parked question is
//   visible ONLY on the live SSE stream, which is exactly where the old dashboard
//   surface answered it from.
//
// SCOPE, DELIBERATELY NARROW. This folds ONE chunk kind — the `clarify` tool-call —
// and nothing else. Text deltas, tool chips, tool results and stream errors remain
// opaque liveness signals (./stream.ts's own header): the persisted parts carried by
// the terminal `message` event stay the transcript authority, and this fold's output
// is discarded wholesale the moment that authority arrives (`applyClaraStreamEvent`
// clears `provisionalChunks` on `message` and on `detached`).
//
// The chunks themselves are AI SDK `fullStream` parts, written to the run's writable
// one at a time by `consumeChatTurnModelResult`
// (packages/runtime/workflows/chatTurn.v10.impl.ts:211-224, the body v16 calls at
// chatTurn.v16.impl.ts:148) and forwarded verbatim as `event: chunk` by
// packages/runtime/src/streamRoute.ts:117. Every field read below is defensive: an
// unrecognised or malformed chunk yields NO card rather than a guessed one.

import type { ClaraPart } from "@/lib/parts/types";

export type LiveClarifyPart = Extract<ClaraPart, { type: "clarify" }>;

function firstString(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string") return value;
  return null;
}

/** Fold the live chunk buffer into the clarify parts it actually carries, in arrival
 *  order. Deduplicated by `tool_call_id`: a reattach replays the engine readable from
 *  index 0 (streamRoute.ts:91), so the same tool-call can arrive twice.
 *
 *  `framing` is left EMPTY on purpose. The runtime's own `CLARIFY_FRAMING`
 *  (packages/runtime/workflows/chatTurn.v10.prompt.ts:190) is English text that a
 *  PERSISTED part carries for itself; a live-assembled part has none, and apps/web
 *  routes every string it authors through next-intl (apps/web/AGENTS.md) rather than
 *  hard-coding a second copy of the runtime's sentence here. The card supplies the
 *  translated fallback when this is blank. */
export function foldLiveClarifyParts(chunks: readonly unknown[]): LiveClarifyPart[] {
  const parts: LiveClarifyPart[] = [];
  const seen = new Set<string>();
  for (const raw of chunks) {
    if (typeof raw !== "object" || raw === null) continue;
    const chunk = raw as Record<string, unknown>;
    if (chunk.type !== "tool-call") continue;
    if (firstString(chunk.toolName) !== "clarify") continue;
    const toolCallId = firstString(chunk.toolCallId);
    if (!toolCallId || seen.has(toolCallId)) continue;
    const input = (chunk.input ?? chunk.args ?? {}) as Record<string, unknown>;
    const question = typeof input.question === "string" ? input.question.trim() : "";
    // Absence is not evidence: a clarify chunk with no question text we actually SAW
    // renders nothing at all, rather than an empty card implying Clara asked something.
    if (!question) continue;
    const context = typeof input.context === "string" && input.context.trim() ? input.context : null;
    seen.add(toolCallId);
    parts.push({ type: "clarify", tool_call_id: toolCallId, question, context, framing: "" });
  }
  return parts;
}
