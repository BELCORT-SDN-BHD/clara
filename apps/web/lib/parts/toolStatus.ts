// The tool_call → outcome resolver (C6, the cheapest of the generative-UI wins:
// no wire change, no new part kind, no new frozen workflow closure).
//
// THE DEFECT IT CLOSES. `PartRenderer` renders a `tool_call` as a bare
// `<Badge>{part.tool}</Badge>` and returns `null` for both `tool_result` and
// `tool_error` (they are the catalog's two STATUS_RESOLVER_TYPES —
// ./catalog.ts's own words: they "resolve an earlier `tool_call` chip's status,
// never a standalone element"). Nothing ever did that resolving, so a tool that
// FAILED and a tool that SUCCEEDED looked identical in the transcript: one grey
// chip with a name on it. Fourteen of chatTurn_v17's tools have no promotion arm
// at all, so for those the chip plus the model's prose IS the whole visible
// output of the step.
//
// WHY A SIBLING SCAN IS SOUND HERE, measured rather than assumed. A turn's parts
// are accumulated across EVERY segment into one `allParts` array and settled as
// ONE assistant row (packages/runtime/workflows/chatTurn.v17.ts:98 pushes each
// segment's parts into `allParts`; :83 settles that array once). `toTypedParts_v10`
// (chatTurn.v10.prompt.ts) emits the `tool_call` and its `tool_result`/`tool_error`
// from the same `content` array with the same `toolCallId`. So a call and its
// outcome are always siblings inside one message's `parts`, and a scan of that
// array is the complete evidence available.
//
// THERE IS DELIBERATELY NO "RUNNING" ARM, and that is a correctness decision, not
// an omission. A `tool_call` part only ever reaches a screen from the SETTLED
// transcript: the live SSE buffer is folded for `clarify` alone
// (lib/clara/liveClarify.ts) and `ClaraThreadView` renders no provisional
// assistant parts at all (裁-132 — TurnProgress is the shipped answer, and
// components/clara/TurnProgress.tsx:13-16 states that choice). Painting
// "running" on a chip inside a finished turn would be this UI asserting a state
// the DB never reported. What an absent sibling actually means is that this
// turn's transcript records no outcome for that call — review law 2, absence is
// not evidence — so it gets its own honest arm and falls through to it.

import type { ClaraPart } from "./types";

/** `done` and `failed` are each POSITIVELY SEEN (a sibling result / error part).
 *  `unresolved` is the fail-closed arm: the transcript carries no outcome for
 *  this call, which is a statement about the transcript, never about the tool. */
export type ToolCallStatus = "done" | "failed" | "unresolved";

/**
 * One message's `tool_call_id` → outcome map, built from that message's own parts.
 *
 * A `tool_error` WINS over a `tool_result` for the same id. The emitter produces
 * one or the other per call, so the pair should never co-occur; if a malformed or
 * future payload carries both, "something went wrong" is the fail-closed reading
 * and a success chip painted over a recorded error is the expensive mistake.
 */
export function resolveToolStatuses(parts: readonly ClaraPart[]): ReadonlyMap<string, ToolCallStatus> {
  const byId = new Map<string, ToolCallStatus>();
  for (const part of parts) {
    if (part.type !== "tool_call") continue;
    // A blank id can never be matched to an outcome, and grouping several such
    // calls under one "" key would let one call's error label another's chip.
    if (part.tool_call_id) byId.set(part.tool_call_id, "unresolved");
  }
  for (const part of parts) {
    if (part.type === "tool_result") {
      if (byId.get(part.tool_call_id) === "unresolved") byId.set(part.tool_call_id, "done");
    } else if (part.type === "tool_error") {
      if (byId.has(part.tool_call_id)) byId.set(part.tool_call_id, "failed");
    }
  }
  return byId;
}

/** The chip's tone per outcome — kept beside the resolver so the two cannot drift
 *  and a reader sees the whole mapping in one place. `unresolved` stays NEUTRAL:
 *  it is an absence of evidence, not a warning about the tool. */
export function toolStatusTone(status: ToolCallStatus): "neutral" | "info" | "error" {
  if (status === "failed") return "error";
  if (status === "done") return "info";
  return "neutral";
}
