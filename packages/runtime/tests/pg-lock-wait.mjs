// R2-4 (Codex r2 review of #449): a genuine two-connection BARRIER proof needs a THIRD, positive
// observation that the second connection actually BLOCKED on the first's held lock — a bare
// Promise.all of two concurrent calls proves nothing about ordering; both could simply have run
// back-to-back on an otherwise-idle table. This is the packages/db/tests/wave-b/wb-calls.mjs
// waitBlockedByOrThrow idiom, cloned here (packages/runtime has no dependency on packages/db, so
// the helper cannot be imported directly) — same pg_blocking_pids read, same polling shape.

import { setTimeout as sleep } from "node:timers/promises";
import { rootQuery } from "./relay-fixtures.mjs";

/**
 * Poll pg_stat_activity until `pid` is observably blocked on a lock held by `blockerPid` (or
 * throw). A POSITIVE read (review law 2) — never inferred from timing alone.
 */
export async function waitBlockedByOrThrow(pid, blockerPid, { timeoutMs = 5000, intervalMs = 25, what = "the row lock" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await sleep(intervalMs);
  }
  throw new Error(`waitBlockedByOrThrow: backend ${pid} never observably blocked on ${what} (held by ${blockerPid}) within ${timeoutMs}ms`);
}

/** The connection's own backend pid — stable for its lifetime, independent of what it is
 *  currently running. */
export async function backendPid(client) {
  const r = await client.query("select pg_backend_pid() as pid");
  return r.rows[0].pid;
}
