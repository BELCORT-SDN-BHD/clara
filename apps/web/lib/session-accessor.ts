// THE blessed stable SessionTokenAccessor (fix-round finding 2b). Every
// ../parts/hooks.ts (`useHydratedPart`) call site should import THIS singleton —
// never construct a fresh `{ getAccessToken: ... }` object literal inline. A
// per-render accessor object is the exact anti-pattern that drove an unbounded
// reload loop (measured: 4GB heap OOM) before hooks.ts's ref-based defense;
// importing this module-level constant sidesteps the hazard entirely by
// construction, since its identity never changes across renders.
//
// ROUND-2 (independent review finding R2 — corrects round-1's own header, which
// claimed the opposite): a card mounting BEFORE `configureSessionTokenSource` runs
// does NOT strand — `getAccessToken()` now AWAITS configuration (a deferred,
// resolved the moment `configureSessionTokenSource` is called), bounded by
// the config timeout (`getConfigTimeoutMs`/`setConfigTimeoutForTests`) so a
// truly-unconfigured app still fails VISIBLY
// (resolves `null` -> the wire layer's own "no live session" WireError) rather
// than hanging forever. This works WITHOUT needing `useHydratedPart`'s mount
// effect to re-fire: the SAME initial `reload()` call that started before
// configuration simply stays parked inside this wait and completes once
// configuration lands (or the timeout elapses) — `hasSession` in hooks.ts is
// always `true` for this singleton (it is never `null`), so it was never going to
// re-fire on a later configuration anyway; that observation is what made round-1's
// "no live session, permanently" bug measurable in the first place.
//
// One-liner worth stating explicitly: a SAME-TRUTHINESS SWAP — reconfiguring
// `tokenFn` to a DIFFERENT source while the singleton itself stays present — does
// NOT by itself re-trigger a mounted card's reload (hooks.ts's `hasSession` never
// flips for an already-present singleton). This is UNREACHABLE in the intended
// usage (every call site imports the ONE singleton; there is only ever one
// "current session" to reconfigure, not a second live one to swap to while the
// first stays mounted) and is not this round's concern — recorded here so it is
// not later mistaken for an oversight.
//
// LAZY ADAPTER, WIRE AT MERGE: this module has no opinion on WHERE a token comes
// from. `configureSessionTokenSource` plugs in the real source exactly once, at
// app-wiring time (e.g. a root client provider effect) — the natural call site is
// p2-auth's `getSessionToken` once lib/session.ts lands (see
// ./session-contract.ts's own header for the repoint note).

import type { SessionTokenAccessor } from "@/lib/session";

type TokenFn = () => Promise<string | null>;

let tokenFn: TokenFn | null = null;
let configuredResolve: (() => void) | null = null;
let configuredPromise: Promise<void> | null = null;

function armDeferred(): void {
  configuredPromise = new Promise((resolve) => {
    configuredResolve = resolve;
  });
}
armDeferred();

/** How long `getAccessToken()` waits for `configureSessionTokenSource` before
 *  giving up and resolving `null`. Read via `getConfigTimeoutMs()`, changed (test-
 *  only) via `setConfigTimeoutForTests()` — a plain exported `let` cannot be
 *  reassigned by an importer (ESM live bindings are read-only outside their own
 *  module), so the setter lives HERE, not at the call site. The 5s default is a
 *  generous bound for "the app's own root wiring effect runs eventually", not a
 *  tuning knob production code should ever touch. */
let configTimeoutMs = 5000;

export function getConfigTimeoutMs(): number {
  return configTimeoutMs;
}

/** Test-only: shrink (or restore) the configuration wait so a "never configured"
 *  test doesn't have to sit through the real 5s default. */
export function setConfigTimeoutForTests(ms: number): void {
  configTimeoutMs = ms;
}

async function waitForConfiguration(): Promise<void> {
  if (tokenFn || !configuredPromise) return;
  // A plain `Promise.race([configuredPromise, timeoutPromise])` would leave the
  // timer running (and the process alive) for the FULL timeout even after
  // configuration wins the race — `setTimeout` has no idea its result became
  // moot. Clear it explicitly once either side settles.
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, configTimeoutMs);
    configuredPromise!.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Plug in the real token source. Call this ONCE, at app-wiring time — calling it
 *  again re-points every future `getAccessToken()` call (useful for tests, and for
 *  a session provider that itself only becomes ready after initial mount). Wakes
 *  every `getAccessToken()` call currently parked in `waitForConfiguration`. */
export function configureSessionTokenSource(fn: TokenFn): void {
  tokenFn = fn;
  configuredResolve?.();
}

/** Test/dev-only: drop back to the unconfigured ("no live session yet") state, and
 *  re-arm a FRESH deferred so a subsequent `getAccessToken()` call waits again for
 *  real configuration rather than resolving instantly off the old (already-fired)
 *  one. */
export function resetSessionTokenSource(): void {
  tokenFn = null;
  armDeferred();
}

/** The stable singleton. Its OWN identity never changes — only what
 *  `getAccessToken()` resolves to (via the lazily-configured `tokenFn`) does.
 *  Never throws for "no session" (configured-but-empty, or unconfigured-and-
 *  timed-out): both are the same legitimate `null` the wire layer already handles
 *  as `WireError("no live session")`. */
export const sessionTokenAccessor: SessionTokenAccessor = {
  getAccessToken: async () => {
    if (!tokenFn) await waitForConfiguration();
    return tokenFn ? tokenFn() : null;
  },
};
