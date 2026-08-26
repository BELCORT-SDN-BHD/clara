// THE blessed stable SessionTokenAccessor (fix-round, independent review finding
// 2b). Every ../parts/hooks.ts (`useHydratedPart`) call site should import THIS
// singleton — never construct a fresh `{ getAccessToken: ... }` object literal
// inline. A per-render accessor object is the exact anti-pattern that drove an
// unbounded reload loop (measured: 4GB heap OOM) before hooks.ts's ref-based
// defense; importing this module-level constant sidesteps the hazard entirely by
// construction, since its identity never changes across renders — the safest fix
// is not needing the defense at all.
//
// LAZY ADAPTER, WIRE AT MERGE: this module has no opinion on WHERE a token comes
// from. `configureSessionTokenSource` plugs in the real source exactly once, at
// app-wiring time (e.g. a root client provider effect) — the natural call site is
// p2-auth's `getSessionToken` once lib/session.ts lands (see
// ./session-contract.ts's own header for the repoint note). Until wired,
// `sessionTokenAccessor.getAccessToken()` resolves `null` — a legitimate
// "no live session yet" state, never a throw — so any component that mounts
// before wiring lands degrades to useHydratedPart's `session === null` no-op
// state instead of crashing.

import type { SessionTokenAccessor } from "./session-contract";

type TokenFn = () => Promise<string | null>;

let tokenFn: TokenFn | null = null;

/** Plug in the real token source. Call this ONCE, at app-wiring time — calling it
 *  again re-points every future `getAccessToken()` call (useful for tests, and for
 *  a session provider that itself only becomes ready after initial mount). */
export function configureSessionTokenSource(fn: TokenFn): void {
  tokenFn = fn;
}

/** Test/dev-only: drop back to the unconfigured ("no live session") state. */
export function resetSessionTokenSource(): void {
  tokenFn = null;
}

/** The stable singleton. Its OWN identity never changes — only what
 *  `getAccessToken()` resolves to (via the lazily-configured `tokenFn`) does. */
export const sessionTokenAccessor: SessionTokenAccessor = {
  getAccessToken: () => (tokenFn ? tokenFn() : Promise.resolve(null)),
};
