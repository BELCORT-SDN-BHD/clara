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
 *   `sendStatus`          a turn is in flight. `pendingUserText` is set only
 *                         once the stream OPENS (threadStore's own comment:
 *                         "never before — no optimistic rendering of turn
 *                         success"), so between submit and stream-open the
 *                         transcript is still empty with nothing pending, and
 *                         only the send status distinguishes it from rest.
 *
 * The remaining three are the ordinary "is this genuinely empty" reading: a
 * signed-out or failed read is a STATE the thread already spells out in a
 * `StateBanner`, and a welcome under either would be the mascot standing in
 * for state text — which the state/accessibility contract bars outright.
 */
export function claraWelcomeVisible(args: {
  /** Null while the caller could not resolve or create a thread at all. */
  threadId: string | null;
  /** The thread's own signed-out reading (`loadError === "not signed in"`). */
  notSignedIn: boolean;
  state: Pick<
    ClaraThreadUiState,
    "messages" | "messagesLoaded" | "loadError" | "pendingUserText" | "sendStatus"
  >;
}): boolean {
  const { threadId, notSignedIn, state } = args;
  if (threadId === null) return false;
  if (notSignedIn) return false;
  if (!state.messagesLoaded) return false;
  if (state.loadError !== null) return false;
  if (state.messages.length > 0) return false;
  if (state.pendingUserText !== null) return false;
  if (state.sendStatus === "sending") return false;
  return true;
}
