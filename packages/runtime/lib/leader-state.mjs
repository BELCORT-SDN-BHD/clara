// #617 — the relay LEADER's own state, as a readable fact rather than an inference.
//
// THE GAP THIS CLOSES. `lib/leader.mjs`'s loop is the process's single most consequential
// component — it routes events, drains intents, runs every reconciler belt — and NOTHING about
// it reached `/ready`. `checks.world` and `checks.control` are HEARTBEATS written by other
// tasks, so they say the process is alive; they say nothing about whether this process holds
// the 'router' advisory lock, how many times its dedicated session has died and re-acquired, or
// that it has already recorded a taxonomy HALT and is on its way out. An operator asking "is the
// leader up, and has it been flapping?" had exactly one source: log scrollback.
//
// WHY A MODULE AND NOT A FIELD ON leader.mjs. `lib/health.mjs` importing `lib/leader.mjs` would
// pull the whole reconciler/drain/relay graph into every /ready call path (and into the
// health-only test files), for four scalars. This module has NO imports but the sanitizer and no
// DB reach — the pool-error-contract's own shape, for the same reason.
//
// WHAT IS DELIBERATELY *NOT* HERE. This never decides anything. The loop's own fail-fast is
// unchanged: a taxonomy HALT still calls `onHalt` (process.exit(2) in production) and a lost
// connection still reconnects with backoff. Recording the halt BEFORE `onHalt` runs is the whole
// point of its placement — in production the process is gone microseconds later, so the record
// exists for the window before exit, for an injected `onHalt`, and for a test that must prove
// the sequence without exiting the test runner.
//
// NAMES AND CODES ONLY. `/ready` is unauthenticated (lib/health.mjs's opening contract). A
// connection error's `message` routinely names a host, a role or a database; only its SANITIZED
// code goes on the wire, and the halt's `reason` is the error's CLASS NAME run through that same
// identifier whitelist — never the message, which for a taxonomy halt names internal tables.

import { sanitizedErrorCode } from "./pool-error-contract.mjs";

const state = {
  started: false,
  held: false,
  since: null,
  reconnects: 0,
  lastErrorCode: null,
  halted: null,
};

/** The loop has been entered. Distinguishes "no leader here" (a world-off process, a worker) from
 *  "leader down" — absent evidence is not evidence of absence, and /ready must not warn about a
 *  leader this process was never supposed to run. */
export function recordLeaderStarted() {
  state.started = true;
}

/** Leadership ACQUIRED (the advisory lock is held and the LISTEN is live). */
export function recordLeaderAcquired() {
  state.held = true;
  state.since = new Date().toISOString();
}

/**
 * Leadership LOST — the dedicated session died and the loop is about to back off and reconnect.
 * `reconnects` counts only losses of leadership actually HELD, so it reads as "how many times
 * has this process had to take the lock back", not "how many times has connecting failed": a
 * standby that never acquired is not flapping, and counting its blocked attempts would make an
 * idle machine look like a broken one.
 * @param {unknown} err
 */
export function recordLeaderLost(err) {
  if (state.held) state.reconnects += 1;
  state.held = false;
  state.since = null;
  state.lastErrorCode = sanitizedErrorCode(err);
}

/**
 * A HALT-class failure was raised (today: TaxonomyHaltError — an un-routable state). Recorded
 * BEFORE `onHalt` runs, because `onHalt` normally exits the process.
 * @param {unknown} err
 */
export function recordLeaderHalt(err) {
  state.held = false;
  state.since = null;
  // The error's CLASS, through the same identifier whitelist the pool contract uses for libpq
  // codes — "TaxonomyHaltError" passes; a message ("active taxonomy pointer … is missing") does
  // not, and is dropped whole rather than trimmed, so no prefix of it can leak.
  const name = err && typeof err === "object" ? /** @type {{name?: unknown}} */ (err).name : undefined;
  state.halted = { at: new Date().toISOString(), reason: sanitizedErrorCode({ code: name }) };
}

/** The loop exited on a deliberate `stop()` — not a fault, so `reconnects` is untouched. */
export function recordLeaderStopped() {
  state.started = false;
  state.held = false;
  state.since = null;
}

/**
 * The /ready view. `ok` is false ONLY for a recorded halt: a leader that is merely reconnecting
 * is degraded (a WARN), and a process that never ran one has nothing to report either way — but
 * it says so with `started:false` rather than by looking identical to a healthy leader.
 * @returns {{ok:boolean, started:boolean, held:boolean, since:string|null, reconnects:number,
 *            last_error_code:string|null, halted:{at:string, reason:string}|null}}
 */
export function leaderStateHealth() {
  return {
    ok: state.halted === null,
    started: state.started,
    held: state.held,
    since: state.since,
    reconnects: state.reconnects,
    last_error_code: state.lastErrorCode,
    halted: state.halted === null ? null : { at: state.halted.at, reason: state.halted.reason },
  };
}

/** Test-only reset — the record is process-global, so cells must not leak into each other. */
export function _resetLeaderStateForTest() {
  state.started = false;
  state.held = false;
  state.since = null;
  state.reconnects = 0;
  state.lastErrorCode = null;
  state.halted = null;
}
