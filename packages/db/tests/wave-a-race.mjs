// Wave-A rig — concurrency leaf (NOT a test file). Re-exports wave-a-fixtures
// (→ reads → helpers → s6-fixtures) AND the generic two-session forced-schedule
// drivers from rig-docs-race.mjs (holdThenContend / concurrentTwoSession /
// sawDeadlock / waitBlockedBy). The generic drivers take a `run(client)` callback
// per side, so Wave-A admission / merge / CLR26 / duplicate-bill schedules are
// built inline in the test bodies — no Wave-A-specific driver is needed. A test
// file that needs concurrency imports THIS leaf; a non-concurrency file imports
// wave-a-fixtures.
//
// GUARD idiom (s6-locks precedent): every side sets a `statement_timeout` local so
// a genuine deadlock surfaces as 40P01 / 57014 rather than hanging the run.

export * from "./wave-a-fixtures.mjs";
// countWhere is already provided by wave-a-reads (via the * re-export above); only
// the forced-schedule drivers come from rig-docs-race here.
export { holdThenContend, concurrentTwoSession, sawDeadlock, waitBlockedBy } from "./rig-docs-race.mjs";

/** The per-session deadlock guard used by every forced schedule (5s ceiling). */
export const GUARD = "set local statement_timeout = '5000ms'";
