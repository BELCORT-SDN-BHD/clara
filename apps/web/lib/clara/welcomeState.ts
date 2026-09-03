import type { ClaraThreadUiState } from "./threadStore";

/**
 * WHEN THE CLARA WELCOME MOMENT IS ALLOWED TO PAINT — the mascot's one gate.
 *
 * A pure function, deliberately, and for the same reason
 * `lib/registration/holding-state.ts` is one: 裁-14 does not say "put the
 * mascot in the empty state", it says **"empty states and rare welcome moments
 * only, NEVER a loader"**. "Never a loader" is a REFUSAL BRANCH, which makes
 * this judgement logic under review law 1 — so it lives where every branch,
 * including the negative ones, can be driven directly by a test with a
 * RED-before mutant each, rather than only through a live thread mount.
 *
 * The two conjuncts that ARE the "never a loader" wall, and why each is needed
 * on its own:
 *
 *   `messagesLoaded`      the first read has not landed yet. An unloaded
 *                         transcript is also an EMPTY array, so testing
 *                         `messages.length === 0` alone would paint the mascot
 *                         over exactly the moment the contract forbids —
 *                         "reviewing…" — and it would look deliberate.
 *   `sendStatus`          a turn is in flight. `pendingUserParts` is set only
 *                         once the stream OPENS (threadStore's own comment:
 *                         "never before — no optimistic rendering of turn
 *                         success"), so between submit and stream-open the
 *                         transcript is still empty with nothing pending, and
 *                         only the send status distinguishes it from rest.
 *                         (It was `pendingUserText` until #508 made a pending
 *                         turn carry PARTS, so a turn can now be pending with
 *                         an attachment and no prose at all — which is exactly
 *                         why this conjunct tests presence, never emptiness.)
 *
 * The remaining three are the ordinary "is this genuinely empty" reading: a
 * signed-out or failed read is a STATE the thread already spells out in a
 * `StateBanner`, and a welcome under either would be the mascot standing in
 * for state text — which the state/accessibility contract bars outright.
 *
 * THE SEVENTH AND EIGHTH ARRIVED WITH THE P6-5 MERGE, and neither branch could
 * have seen them alone — this is the combination, not either side.
 *
 *   `parkedClarify`   P6-5 re-reads a parked question out of
 *                     `clara.agent_interruptions` on mount, because a page
 *                     reload throws away the SSE buffer the live fold reads.
 *                     That question is visible assistant content that is
 *                     NEITHER in `messages` NOR in `provisionalChunks` — so on
 *                     exactly the journey P6-5 built (reload while Clara is
 *                     parked, before the turn's first row persists) the mascot
 *                     would have greeted someone who is mid-conversation and
 *                     being asked a question. The sixth conjunct's own reasoning,
 *                     applied to the second way that content can arrive.
 *   `turnStartedAt`   the same reading for a RUNNING turn found at mount: 裁-132's
 *                     elapsed-time line says "Clara has been working on this for
 *                     2:05", and a welcome beside it says the conversation has
 *                     not started. A DB-read run start is positive evidence that
 *                     it has.
 *
 * `stream.provisionalChunks` IS THE SIXTH, AND IT ARRIVED WITH #508. That train
 * renders a live clarify card folded out of the provisional stream buffer
 * (`ClaraThreadView`'s `liveClarifyParts`), which is visible assistant content
 * that is NOT in `messages` — so after the merge "messages is empty" stopped
 * being the whole answer to "is this conversation empty". Any provisional chunk
 * means a turn is producing output right now; a welcome under a live clarify
 * question would be the mascot greeting someone mid-conversation. Found by
 * reading the merged component rather than by a red test, because the state it
 * needs (chunks present, transcript empty, nothing pending) is reachable but
 * rare — a stream re-attached after a reload before its first row persists.
 */
export function claraWelcomeVisible(args: {
  /** Null while the caller could not resolve or create a thread at all. */
  threadId: string | null;
  /** The thread's own signed-out reading (`loadError === "not signed in"`). */
  notSignedIn: boolean;
  state: Pick<
    ClaraThreadUiState,
    | "messages" | "messagesLoaded" | "loadError" | "pendingUserParts" | "sendStatus" | "stream"
    | "parkedClarify" | "turnStartedAt"
  >;
}): boolean {
  const { threadId, notSignedIn, state } = args;
  if (threadId === null) return false;
  if (notSignedIn) return false;
  if (!state.messagesLoaded) return false;
  if (state.loadError !== null) return false;
  if (state.messages.length > 0) return false;
  if (state.pendingUserParts !== null) return false;
  if (state.sendStatus === "sending") return false;
  if (state.stream.provisionalChunks.length > 0) return false;
  if (state.parkedClarify !== null) return false;
  if (state.turnStartedAt !== null) return false;
  return true;
}
