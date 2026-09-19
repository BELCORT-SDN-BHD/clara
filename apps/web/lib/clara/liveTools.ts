// #642 AC4 / UI-10 / UI-27 — THE SECOND live-chunk fold in apps/web, beside
// `./liveClarify.ts`, whose discipline it copies line for line.
//
// WHY A FOLD AND NOT A VERSION CUT (the measurement, so nobody re-litigates it).
// The model's whole `fullStream` already reaches the browser verbatim:
// `consumeChatTurnModelResult` writes EVERY part to the run's writable
// (packages/runtime/workflows/chatTurn.v10.impl.ts:216-221, called at
// chatTurn.v20.impl.ts:148-157) and `packages/runtime/src/streamRoute.ts:139` relays
// each one as `event: chunk` with no filter at all. So live tool state is a WEB fold,
// not a new frozen `chatTurn` body, and this module registers NO new part kind — it
// maps chunks the stream already carries onto states this surface already names.
// `lib/parts/catalog.ts`'s AllCovered/NoExtra pair is untouched.
//
// THE VOCABULARY IS MEASURED, NOT READ OUT OF THE SDK DOCS (#642 M1, captured on this
// rig against `ai@7.0.77` + the `MockLanguageModelV4` script the World legs use, through
// the real `streamText` and the real `consumeChatTurnModelResult`):
//
//   start · start-step · text-start · text-delta · text-end · finish-step · finish
//   tool-input-start {id, toolName, dynamic, title}
//   tool-input-delta {id, delta}
//   tool-input-end   {id}
//   tool-call        {toolCallId, toolName, input, providerExecuted, providerMetadata, title}
//   tool-result      {toolCallId, toolName, input, output, dynamic}
//   tool-error       {toolCallId, toolName, input, error, dynamic}
//
// THE FIELD NAME IS THE FINDING: the three `tool-input-*` parts carry `id`, while
// `tool-call` / `tool-result` / `tool-error` carry `toolCallId`. A fold written from the
// documented vocabulary would have read `toolCallId` on `tool-input-start` and shown
// NOTHING for *preparing*, silently, on every turn.
//
// FOUR LIVE STATES, NOT FIVE, AND `queued` IS A NAMED RESIDUAL. The stream carries no
// admission event — there is nothing in the vocabulary above that means "the model has
// decided to call this tool but has not started". *preparing* is `tool-input-start`,
// which is the model streaming the tool's ARGUMENTS, and passing that off as *queued*
// would be this surface asserting a state nothing reported. A real *queued* needs a new
// event, which needs a new frozen `chatTurn` cut; #642 does not take one.
//
// DEFENSIVE, EXACTLY AS `foldLiveClarifyParts` IS: an unrecognised, malformed or
// incomplete chunk yields NOTHING rather than a guessed state (`liveClarify.ts:63-65`'s
// rule, and H-32's). Deduplicated by call id, because a reattach replays the engine
// readable from index 0 (`streamRoute.ts:113`) and every chunk of the attempt arrives
// again.

import type { ClaraPart } from "@/lib/parts/types";

/** The four states the stream can positively establish, plus *refused*.
 *
 *  `refused` is NOT a failure: the tool ran, refused the request in its own typed
 *  vocabulary (`{ok:false, code, message}` — the shape every chat tool's refusal helper
 *  returns) and wrote nothing. A reader needs to tell that apart from `failed`, which is
 *  the tool THROWING. */
export type LiveToolState = "preparing" | "running" | "done" | "failed" | "refused";

export interface LiveToolStep {
  /** The provider's own call id — `id` on `tool-input-*`, `toolCallId` on the rest. */
  toolCallId: string;
  /** The runtime's raw tool token (`start_accrual_work`). The CHIP renders a human
   *  label for it (UI-32); this stays the raw token so the mapping lives in one place. */
  tool: string;
  state: LiveToolState;
}

/** Monotonic rank — a step never moves BACKWARDS. The replay from index 0 re-delivers a
 *  finished call's whole history, so without this a completed step would flicker back to
 *  *preparing* on every reattach.
 *
 *  `failed` OUTRANKS THE OTHER TWO TERMINALS (fix round 1, ADV-642-8). All three used to
 *  rank 2 against a strict comparison, so whichever arrived first won for good and a step
 *  that returned and then threw went on reading *done* — the one direction this fold must
 *  never get wrong, since AC4's whole subject is a transcript that may not overstate what a
 *  step achieved. `done` and `refused` stay level because they are two readings of ONE
 *  chunk (`tool-result` with or without a typed refusal) and can never race each other. */
const RANK: Record<LiveToolState, number> = { preparing: 0, running: 1, done: 2, refused: 2, failed: 3 };

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** A tool OUTPUT that is a typed refusal rather than a result. Every chat tool that can
 *  refuse returns `{ok:false, code, message, …}` (`chatTurn.v20.tools.ts`'s
 *  `refusalFromError` and its siblings), so the refusal is legible on the LIVE stream
 *  without waiting for the settled transcript. `ok === true` is a result; anything that
 *  is not an object with an explicit `ok:false` is left alone — absence is not evidence. */
function isTypedRefusal(output: unknown): boolean {
  if (typeof output !== "object" || output === null) return false;
  return (output as { ok?: unknown }).ok === false;
}

/**
 * Fold the live chunk buffer into the tool steps it actually carries, in first-seen
 * order.
 *
 * `settledParts` is the turn's persisted transcript when one has arrived (the terminal
 * `message`'s parts). A settled `refusal` part (lib/parts/types.ts) is a statement that
 * the TURN was refused, so any step the stream never resolved is reported as *refused*
 * rather than left mid-flight — the same "one honest arm" rule `toolStatus.ts` applies to
 * `unresolved`. A step the stream DID resolve keeps its own outcome: the transcript's
 * refusal does not overwrite a `tool-result` anyone actually saw.
 *
 * `clarify` IS DELIBERATELY EXCLUDED. It has its own answerable card
 * (`foldLiveClarifyParts` + `ClarifyCard`); a second "clarify · running" chip beside the
 * question would be the same event on screen twice, and the chip would still be there
 * after the question was answered.
 */
export function foldLiveToolParts(
  chunks: readonly unknown[],
  settledParts: readonly ClaraPart[] = [],
): LiveToolStep[] {
  const order: string[] = [];
  const steps = new Map<string, LiveToolStep>();

  const upsert = (toolCallId: string | null, tool: string | null, state: LiveToolState) => {
    if (!toolCallId) return;
    const existing = steps.get(toolCallId);
    if (!existing) {
      // A step we have never seen needs a tool NAME to be worth rendering: a chip with no
      // name is a shimmer, and a shimmer is exactly what AC4 rules out as evidence.
      if (!tool) return;
      order.push(toolCallId);
      steps.set(toolCallId, { toolCallId, tool, state });
      return;
    }
    if (RANK[state] > RANK[existing.state]) existing.state = state;
  };

  for (const raw of chunks) {
    if (typeof raw !== "object" || raw === null) continue;
    const chunk = raw as Record<string, unknown>;
    const type = str(chunk.type);
    if (!type) continue;
    const toolName = str(chunk.toolName);
    if (toolName === "clarify") continue;
    switch (type) {
      // `id`, not `toolCallId` — measured, see the header.
      case "tool-input-start":
        upsert(str(chunk.id), toolName, "preparing");
        break;
      case "tool-call":
        upsert(str(chunk.toolCallId), toolName, "running");
        break;
      case "tool-result":
        upsert(str(chunk.toolCallId), toolName, isTypedRefusal(chunk.output) ? "refused" : "done");
        break;
      case "tool-error":
        upsert(str(chunk.toolCallId), toolName, "failed");
        break;
      default:
        // Every other part name in the measured vocabulary is a liveness signal this
        // fold has nothing to say about, and an UNRECOGNISED one is ignored rather than
        // guessed at.
        break;
    }
  }

  const turnWasRefused = settledParts.some((part) => part.type === "refusal");
  const out = order.map((id) => steps.get(id)).filter((step): step is LiveToolStep => step !== undefined);
  if (!turnWasRefused) return out;
  return out.map((step) => (step.state === "preparing" || step.state === "running" ? { ...step, state: "refused" } : step));
}
