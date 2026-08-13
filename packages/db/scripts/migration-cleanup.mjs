// Bounded cleanup for the migration runner.
//
// Every path the runner takes on its way OUT — rollback, session repin, advisory
// unlock, client end — talks to a backend that may already be wedged. Left
// unbounded, any one of them strands the runner forever on a socket that will
// never answer. Left unguarded, any one of them can also REPLACE the error that
// sent us into cleanup, which is the more expensive failure: the operator then
// debugs the cleanup instead of the migration.
//
// So cleanup here obeys two rules:
//   1. Every step runs under a deadline, and an overrun HARD-CLOSES the socket
//      (see hardCloseClient) rather than waiting on a graceful close that may
//      itself never return.
//   2. A cleanup outcome is DATA, never an exception. withCleanupDeadline does not
//      throw; callers fold the outcome into the original error's diagnostics or log
//      it, so the original error is what propagates.

import { pinMigrationSession } from "./migration-atomicity.mjs";

// The deadline for one cleanup step. Deliberately the same order as
// MIGRATION_CONNECT_TIMEOUT_MS: both bound "the backend is not answering", and a
// cleanup that has not completed in five seconds is not going to.
export const CLEANUP_TIMEOUT_MS = 5_000;

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Hard-close a client's socket after a graceful cleanup step overran its deadline.
 *
 * VERIFIED against the installed pg 8.20.0: a `Client` holds a `Connection` on
 * `client.connection`, whose `stream` is the raw net/tls socket, and node-postgres
 * performs exactly this teardown for its OWN connect timeout —
 * `lib/client.js` `_connect()`: `con._ending = true; con.stream.destroy(new Error('timeout expired'))`.
 * Two details come from that precedent and both matter:
 *   - `connection._ending` makes Connection SWALLOW the ECONNRESET/EPIPE the destroy
 *     provokes (`lib/connection.js` `reportStreamError`) instead of re-emitting it.
 *   - The destroy still ends the connection, and `lib/client.js` treats an end the
 *     client did not ask for as an 'error' event. An EventEmitter with no 'error'
 *     listener THROWS, so an absorber is attached first.
 * @returns {boolean} true when a socket was actually destroyed
 */
export function hardCloseClient(client) {
  try {
    if (typeof client?.on === "function") client.on("error", () => {});
    const connection = client?.connection;
    const stream = connection?.stream;
    if (!stream || typeof stream.destroy !== "function") return false;
    connection._ending = true;
    stream.destroy();
    return true;
  } catch {
    // Nothing a hard close can throw is worth more than the error already in flight.
    return false;
  }
}

/**
 * Run one cleanup step under a deadline. NEVER throws — the outcome is returned so a
 * caller can report it ALONGSIDE the original error rather than in place of it.
 *
 * On overrun the socket is hard-closed and the step abandoned. The abandoned promise
 * is pre-folded into a value (`.then(ok, err)`), so its later settlement can never
 * surface as an unhandled rejection and kill the process.
 * @param {{connection?: unknown, on?: Function}} client
 * @param {string} label which cleanup path this is, for the diagnostics
 * @param {() => Promise<unknown>} run
 * @param {number} [timeoutMs]
 * @returns {Promise<{label: string, status: "ok"|"failed"|"timeout", error?: unknown, hardClosed?: boolean, timeoutMs?: number}>}
 */
export async function withCleanupDeadline(client, label, run, timeoutMs = CLEANUP_TIMEOUT_MS) {
  let timer;
  const settled = Promise.resolve()
    .then(run)
    .then(() => ({ status: "ok" }), (error) => ({ status: "failed", error }));
  try {
    const outcome = await Promise.race([
      settled,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
      }),
    ]);
    if (outcome.status !== "timeout") return { label, ...outcome };
    return { label, status: "timeout", timeoutMs, hardClosed: hardCloseClient(client) };
  } finally {
    clearTimeout(timer);
  }
}

/** One human-readable line for a cleanup outcome, or undefined when it simply worked. */
export function cleanupNote(outcome) {
  if (!outcome || outcome.status === "ok") return undefined;
  if (outcome.status === "failed") return `${outcome.label} failed: ${errorMessage(outcome.error)}`;
  return `${outcome.label} exceeded the ${outcome.timeoutMs}ms cleanup deadline — connection ${
    outcome.hardClosed ? "hard-closed" : "abandoned (no socket to destroy)"
  }`;
}

/** The Error a cleanup outcome contributes to the diagnostics, or undefined. */
function cleanupError(outcome) {
  if (!outcome || outcome.status === "ok") return undefined;
  if (outcome.status === "failed") return outcome.error;
  return Object.assign(new Error(cleanupNote(outcome)), {
    cleanupTimeout: true,
    hardClosed: outcome.hardClosed === true,
  });
}

/**
 * Fold a cleanup outcome that happened AFTER the failure was built (the execution
 * client's end runs in the runner's `finally`, past the `catch` that built this) into
 * that failure — appending, never replacing. A no-op for a clean outcome.
 */
export function recordCleanupOutcome(failure, outcome) {
  if (!failure) return;
  const prior = failure.cleanup ?? { outcomes: [] };
  failure.cleanup = Object.freeze({
    ...prior,
    outcomes: Object.freeze([...prior.outcomes, Object.freeze(outcome)]),
  });
  const note = cleanupNote(outcome);
  if (note) failure.message = `${failure.message} [cleanup: ${note}]`;
}

/**
 * Wrap a failure that happened BEFORE the migration had a session — a connect that never
 * completed. There is no transaction to roll back and no session to repin, so this only
 * gives the error the migration's name; the caller's bounded end() still runs.
 */
export function migrationFailureBeforeSession(version, originalError) {
  const failure = new Error(
    `migration ${version} failed before its session was established: ${errorMessage(originalError)}`,
    { cause: originalError },
  );
  if (originalError && typeof originalError === "object" && "code" in originalError) {
    failure.code = originalError.code;
  }
  failure.cleanup = Object.freeze({ rollbackError: undefined, repinError: undefined, outcomes: Object.freeze([]) });
  return failure;
}

/**
 * Build the error for a failed migration after bounding its cleanup. The ORIGINAL
 * error is always the `cause` and always the message's subject; rollback and repin
 * outcomes — including a deadline overrun and the hard close it triggered — ride
 * along as diagnostics on `.cleanup`.
 */
export async function migrationFailureAfterCleanup(
  client,
  version,
  originalError,
  repin = pinMigrationSession,
  timeoutMs = CLEANUP_TIMEOUT_MS,
) {
  const rollbackOutcome = await withCleanupDeadline(client, "rollback", () => client.query("rollback"), timeoutMs);
  // Attempted even after a hard close: on a destroyed client the repin fails FAST and
  // is recorded, which is evidence. Skipping it silently would not be.
  const repinOutcome = await withCleanupDeadline(client, "session repin", () => repin(client), timeoutMs);
  const rollbackError = cleanupError(rollbackOutcome);
  const repinError = cleanupError(repinOutcome);
  const rollbackStatus = rollbackError ? "rollback did not complete" : "was rolled back";
  const diagnostics = [
    rollbackError && `rollback failed: ${errorMessage(rollbackError)}`,
    repinError && `session repin failed: ${errorMessage(repinError)}`,
  ].filter(Boolean);
  const suffix = diagnostics.length ? ` [cleanup: ${diagnostics.join("; ")}]` : "";
  const failure = new Error(
    `migration ${version} failed and ${rollbackStatus}: ${errorMessage(originalError)}${suffix}`,
    { cause: originalError },
  );
  if (originalError && typeof originalError === "object" && "code" in originalError) {
    failure.code = originalError.code;
  }
  failure.cleanup = Object.freeze({
    rollbackError,
    repinError,
    outcomes: Object.freeze([Object.freeze(rollbackOutcome), Object.freeze(repinOutcome)]),
  });
  return failure;
}
