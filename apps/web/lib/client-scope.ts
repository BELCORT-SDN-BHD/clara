/**
 * lib/client-scope.ts — the reject-stale-response half of "client switch is
 * a SECURITY EVENT" (owner ruling Q3,
 * docs/plan/active/mohe-grill-rulings-2026-08-27.md).
 *
 * `ClientScopeProvider` (components/client-scope-provider.tsx) clears
 * MOUNTED state: it unmounts and remounts the whole client-workspace React
 * subtree on `clientId` change, so no component can retain client A's state
 * after the switch to client B. It does NOT close one race: a fetch started
 * for client A can still be in flight — and can still RESOLVE — in the brief
 * window before React finishes unmounting A's subtree. A resolved response
 * for client A arriving after the switch and getting painted into a
 * B-scoped view is exactly the cross-client leak this file exists to stop.
 *
 * The pattern: a single monotonically increasing generation counter, bumped
 * whenever the active clientId changes. Every data-fetching call site must:
 *   1. call `createScopeGuard(clientId)` for the CURRENT clientId before
 *      starting a request,
 *   2. pass `guard.signal` to `fetch`/PostgREST so an in-flight request can
 *      be cancelled outright,
 *   3. call `guard.isStale()` before committing the response to state or
 *      re-rendering anything with it — a response for a superseded scope is
 *      dropped, never rendered.
 *
 * A response this module cannot prove is still in scope is never trusted —
 * the same fail-closed posture the DB-owned-numbers law applies to a figure
 * (AGENTS.md hard constraint 2), applied here to which CLIENT a figure is
 * allowed to belong to.
 */

export interface ClientScopeGuard {
  /** The clientId this guard was created for. */
  readonly clientId: string;
  /** Pass to `fetch(url, { signal })` / any AbortSignal-aware call. */
  readonly signal: AbortSignal;
  /**
   * True once a later call to `createScopeGuard` — for ANY clientId,
   * including the same one — has superseded this guard. Check this
   * immediately before committing a response to state.
   */
  isStale(): boolean;
  /** Cancel the in-flight request this guard was handed to, if it is still running. */
  abort(): void;
}

let activeClientId: string | undefined;
let currentGeneration = 0;

/**
 * Creates a guard for `clientId`. Calling this again — for this clientId or
 * any other — advances the generation and immediately stales every guard
 * created before it, including a second guard for the SAME clientId (a
 * fresh fetch supersedes a stale in-flight one for the client you're still
 * looking at, not just a switch away from it).
 */
export function createScopeGuard(clientId: string): ClientScopeGuard {
  activeClientId = clientId;
  currentGeneration += 1;
  const generationAtCreation = currentGeneration;
  const controller = new AbortController();

  return {
    clientId,
    signal: controller.signal,
    isStale() {
      return (
        currentGeneration !== generationAtCreation ||
        activeClientId !== clientId
      );
    },
    abort() {
      controller.abort();
    },
  };
}
