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
 * TWO SEPARATE CLOCKS (cross-model security review 2026-08-27, findings 8 and
 * 13). The first version had ONE counter, advanced by `createScopeGuard`
 * itself, which was wrong in both directions:
 *
 *  - **Navigation did not advance it** (finding 8, MEDIUM). Switching from
 *    client A to client B advanced nothing unless B happened to start a
 *    guarded request of its own. A's in-flight guard still saw its own
 *    generation and its own clientId, so `isStale()` answered FALSE and a
 *    late client-A response could be committed to shared state while the user
 *    was looking at client B — the exact leak. The epoch is now advanced by
 *    `activateScope(clientId)`, a NAVIGATION boundary called synchronously on
 *    every clientId transition, which also aborts the previous epoch's
 *    in-flight requests instead of merely marking them stale.
 *  - **Two requests for the SAME client staled each other** (finding 13,
 *    LOW). Any second `createScopeGuard` call bumped the single counter, so
 *    two concurrent cards for client A raced and the first card's perfectly
 *    valid result was discarded — deterministically incomplete accounting
 *    displays. Request supersession is now a SEPARATE clock, keyed by an
 *    OPTIONAL `operation` identity: two guards with no operation (or with
 *    different operations) never stale one another; a second guard for the
 *    SAME operation supersedes the first (latest-request-wins, per query).
 *
 * The pattern for a data-fetching call site:
 *   1. call `createScopeGuard(clientId)` — or
 *      `createScopeGuard(clientId, { operation: "trial-balance" })` when a
 *      newer request for that same query should supersede an older one,
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
 *
 * BROWSER-ONLY. The epoch is module state in the browser bundle. On the
 * server no scope is ever activated, so `createScopeGuard` there returns a
 * born-stale, already-aborted guard (fail-closed) and says so on the console
 * rather than silently pretending a server render is in scope.
 */

export interface ClientScopeGuard {
  /** The clientId this guard was created for. */
  readonly clientId: string;
  /** Pass to `fetch(url, { signal })` / any AbortSignal-aware call. */
  readonly signal: AbortSignal;
  /**
   * True once this guard's scope has been superseded — by a NAVIGATION to a
   * different client (`activateScope`), or by a newer guard for the same
   * `operation`. Check this immediately before committing a response to
   * state.
   */
  isStale(): boolean;
  /** Cancel the in-flight request this guard was handed to, if it is still running. */
  abort(): void;
}

export interface ScopeGuardOptions {
  /**
   * Optional query identity. Guards that share an `operation` supersede one
   * another (latest wins); guards without one never do.
   */
  operation?: string;
}

/** The NAVIGATION clock: which client the user is actually looking at. */
let activeClientId: string | undefined;
let navigationEpoch = 0;

/** Controllers owned by the CURRENT epoch, aborted when the epoch advances. */
let epochControllers = new Set<AbortController>();

/** The REQUEST-SUPERSESSION clock, one generation per operation identity. */
const operationGenerations = new Map<string, number>();

/**
 * The navigation boundary. Call this SYNCHRONOUSLY on every clientId
 * transition — `ClientScopeProvider` does it during render, before any
 * descendant can start a request in the new scope.
 *
 * Idempotent for the client already active (a re-render must not abort the
 * requests it is re-rendering). A transition advances the epoch, which stales
 * every guard from the previous epoch AND aborts the requests they were
 * handed to.
 *
 * No-op on the server: module state there is shared across requests, so
 * mutating it during SSR would let one request's navigation stale another's.
 */
export function activateScope(clientId: string): void {
  if (typeof window === "undefined") return;
  if (activeClientId === clientId) return;

  activeClientId = clientId;
  navigationEpoch += 1;

  const superseded = epochControllers;
  epochControllers = new Set<AbortController>();
  for (const controller of superseded) {
    controller.abort();
  }

  // Request supersession is scoped to a client; a switch starts fresh.
  operationGenerations.clear();
}

/**
 * Creates a guard for `clientId`. `clientId` MUST be the client
 * `activateScope` last activated — a guard for any other client (including
 * one created on the server, where nothing is ever activated) is born stale
 * and already aborted, because this module cannot prove such a response
 * belongs on screen.
 */
export function createScopeGuard(
  clientId: string,
  options?: ScopeGuardOptions,
): ClientScopeGuard {
  const controller = new AbortController();
  const epochAtCreation = navigationEpoch;
  const operation = options?.operation;

  if (activeClientId !== clientId) {
    // Fail closed, loudly. Either a call site raced the navigation boundary,
    // or this ran on the server where no scope exists.
    console.error(
      `[client-scope] createScopeGuard("${clientId}") called outside its active scope` +
        ` (active: ${activeClientId ?? "none"}). The request is aborted and its response will never be committed.`,
    );
    controller.abort();
    return {
      clientId,
      signal: controller.signal,
      isStale: () => true,
      abort: () => controller.abort(),
    };
  }

  epochControllers.add(controller);

  let generationAtCreation: number | undefined;
  if (operation !== undefined) {
    generationAtCreation = (operationGenerations.get(operation) ?? 0) + 1;
    operationGenerations.set(operation, generationAtCreation);
  }

  return {
    clientId,
    signal: controller.signal,
    isStale() {
      if (navigationEpoch !== epochAtCreation) return true;
      if (activeClientId !== clientId) return true;
      if (
        operation !== undefined &&
        operationGenerations.get(operation) !== generationAtCreation
      ) {
        return true;
      }
      return false;
    },
    abort() {
      controller.abort();
    },
  };
}

/** The client currently activated, for tests and diagnostics. */
export function getActiveClientId(): string | undefined {
  return activeClientId;
}

/**
 * TEST-ONLY. Returns the module to its initial state. Exported because the
 * epoch is module-level by design (one navigation clock per browser tab), so
 * tests cannot get a fresh instance any other way.
 */
export function resetScopeForTests(): void {
  activeClientId = undefined;
  navigationEpoch = 0;
  epochControllers = new Set<AbortController>();
  operationGenerations.clear();
}
