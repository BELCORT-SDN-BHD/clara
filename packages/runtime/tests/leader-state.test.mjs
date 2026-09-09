// #617 — the relay LEADER's own state on /ready, proven against a real leader loop.
//
// WHAT IS ACTUALLY BEING PROVED. `lib/leader-state.mjs` is a recorder; asserting on it directly
// proves nothing an operator cares about. The claim `/ready` now makes is that THE REAL LOOP
// records the transitions, so both arms drive `startLeaderLoop` itself:
//   (a) held -> lost -> held, with `reconnects` moving, after a genuine `pg_terminate_backend`
//       of the leader's OWN dedicated backend (found by the advisory lock it holds, never by
//       guessing a pid);
//   (b) a taxonomy HALT recorded BEFORE `onHalt` is invoked — asserted by reading the state
//       FROM INSIDE an injected `onHalt`, which is the only placement that can distinguish
//       "recorded before" from "recorded after". `onHalt` is injected precisely so the default
//       (`process.exit(2)`) does not take the test runner with it.
//
// PRIVATE DISPOSABLE DATABASE — relay-taxonomy.test.mjs's pattern, for its reasons and one more.
// Its reasons: this file EMPTIES `clara.taxonomy_active` (a committed, estate-global window in
// which the singleton does not exist) and disables a user trigger to do it, which no sibling
// reading that pointer may witness. The extra reason is this file's alone: it runs a REAL LEADER,
// which takes the estate-wide 'router' advisory lock and routes/drains/reconciles whatever it
// finds. On a shared rig that is someone else's data.
//
// AND THE LEADER IS GIVEN NOTHING TO DO, DELIBERATELY. The clone carries the ambient estate
// (~2k firms, ~78k unrouted events, ~4k clients at the time of writing), and a leader let loose
// on that would spend minutes routing before it ever reached the state transition under test —
// a cell that is slow for reasons unrelated to what it measures, and that measures the routing
// path by accident. So before the loop starts: the router checkpoint is seeded AT HEAD (the
// WB-R18 ceremony's own idiom), and the five DAILY reconciler cadences are set past the epoch so
// `X - 0 >= interval` is false on the first cycle. Neither touches the code under test; both are
// read at module load, which is why lib/leader.mjs is imported DYNAMICALLY below.
//
// ORDERING IS LOAD-BEARING, exactly as relay-taxonomy.test.mjs states: the private-DB setup runs
// as top-level `await` (not in a `before()`, which fires too late), and every runtime module is
// imported dynamically AFTER `process.env` points at the private database.

process.env.RELAY_TEST_MODE ??= "1"; // the pools connect as the env identity then SET ROLE (N10)

import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  connectionConfig,
  disposableDatabaseName,
  setDatabaseEnv,
  cloneAmbientDatabase,
  createDisposableDatabase,
  dropDisposableDatabase,
  waitForBackendsClear,
  assertCloneIsPopulated,
} from "../../db/tests/migrate-harness.mjs";
import { childEnvForExternalTools } from "../../db/lib/pg.mjs";

const DBNAME = disposableDatabaseName("clara_leader_state");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll `probe` until it returns truthy, or fail loudly with what was last seen. */
async function until(probe, { timeoutMs = 30_000, stepMs = 50, what = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    last = await probe();
    if (last) return last;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${what}; last reading: ${JSON.stringify(last)}`);
    await sleep(stepMs);
  }
}

const admin = new pg.Client(connectionConfig());
await admin.connect();

let restoreEnv = () => {};
let cleaned = false;
/** Idempotent teardown — shared by the setup-failure catch below AND the normal after() hook
 *  (relay-taxonomy.test.mjs's own note explains why a top-level-await rejection cannot rely on
 *  `after()` alone: node:test never runs root hooks for a file that failed to LOAD). */
async function cleanupPrivateDb() {
  if (cleaned) return;
  cleaned = true;
  const teardownErrors = [];
  try {
    const mod = await import("./relay-fixtures.mjs");
    const pool = mod.getPool();
    pool.on("error", (e) => teardownErrors.push(e));
    await mod.endPool();
  } catch {
    /* best-effort — the pool may never have been created */
  }
  try {
    const pools = await import("../lib/pools.mjs");
    await pools.endPools();
    // checkReadiness starts two unref'd background loops (lane probe, storage probe) as a side
    // effect. Stop them here or they keep dialling a database this hook is about to DROP, and
    // log a failure per lane per interval until the process exits.
    (await import("../lib/lane-probe.mjs"))._resetLaneProbeCacheForTest();
    (await import("../lib/storage-probe.mjs"))._resetStorageProbeCacheForTest();
  } catch {
    /* best-effort — checkReadiness may never have opened one */
  }
  await priv?.end().catch(() => {}); // BEFORE the drain below, or the drop never sees zero backends
  restoreEnv();
  const drain = await waitForBackendsClear(admin, DBNAME);
  if (!drain.cleared) {
    console.log(`leader-state: teardown drain gave up — ${drain.remaining} backend(s) still attached; WITH (FORCE) will terminate them`);
  }
  await dropDisposableDatabase(admin, DBNAME);
  for (const e of teardownErrors) {
    console.error(`leader-state: teardown straggler caught (not fatal, expected during the FORCE drop): ${e?.code ?? "?"} ${e?.message ?? e}`);
  }
  await admin.end().catch(() => {});
}
after(cleanupPrivateDb);

let startLeaderLoop, leaderStateHealth, recordLeaderHalt, _resetLeaderStateForTest, checkReadiness, fx, priv;
try {
  await createDisposableDatabase(admin, DBNAME);
  const sourceEnv = childEnvForExternalTools();
  cloneAmbientDatabase(sourceEnv, DBNAME);
  await assertCloneIsPopulated(connectionConfig(DBNAME), "clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)");
  restoreEnv = setDatabaseEnv(DBNAME);

  // Read at module load by lib/leader.mjs — set BEFORE the dynamic import below. A poll of 200ms
  // (not the 2s default) is what keeps the reconnect arm's wall clock in the seconds; the five
  // enormous cadences make every DAILY belt not-due on the first cycle (`now - 0 >= interval` is
  // false), which is the difference between a cell that measures a state transition and one that
  // sweeps four thousand clients first.
  process.env.CLARA_LEADER_POLL_MS = "200";
  for (const knob of ["CLARA_SST_RECONCILE_MS", "CLARA_LINT_RECONCILE_MS", "CLARA_FA_RECONCILE_MS", "CLARA_ADJ_RECONCILE_MS", "CLARA_RENDER_ENQUEUE_MS"]) {
    process.env[knob] = "99999999999999";
  }

  priv = new pg.Client(connectionConfig(DBNAME));
  await priv.connect();
  // Seed the router checkpoint AT HEAD so runRelayCycle discovers no work (see the header).
  await priv.query(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq)
       select 'router', firm_id, n from clara.firm_event_seq
     on conflict (consumer, firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
  );

  ({ startLeaderLoop } = await import("../lib/leader.mjs"));
  ({ leaderStateHealth, recordLeaderHalt, _resetLeaderStateForTest } = await import("../lib/leader-state.mjs"));
  ({ checkReadiness } = await import("../lib/health.mjs"));
  fx = await import("./relay-fixtures.mjs");
} catch (err) {
  await cleanupPrivateDb();
  throw err;
}

/** The pid of the session holding the 'router' advisory lock — i.e. the leader's own dedicated
 *  backend, identified by the lock it actually HOLDS rather than by pattern-matching a query
 *  string. This database is private and nothing else in this file takes an advisory lock while
 *  the leader is running, so the single non-self holder is the leader; the cell fails loudly
 *  rather than guessing if that ever stops being true. */
async function leaderBackendPid() {
  const r = await priv.query(
    `select distinct l.pid from pg_locks l
       join pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory' and l.granted
        and a.datname = current_database() and l.pid <> pg_backend_pid()`,
  );
  if (r.rowCount === 0) return null;
  assert.equal(r.rowCount, 1, `expected exactly one advisory-lock holder (the leader), saw ${r.rowCount}`);
  return r.rows[0].pid;
}

const quietDeps = {
  log: () => {},
  enqueueChatTurn: async () => ({}),
  getRun: async () => null,
};

test("#617 leader state: acquire -> a real backend kill -> RE-acquire, with reconnects moving", async () => {
  _resetLeaderStateForTest();
  const cold = leaderStateHealth();
  assert.deepEqual(
    { started: cold.started, held: cold.held, reconnects: cold.reconnects, halted: cold.halted, ok: cold.ok },
    { started: false, held: false, reconnects: 0, halted: null, ok: true },
    "a process with no leader reports started:false — 'no leader here' must not read as 'leader down'",
  );

  const leader = startLeaderLoop(quietDeps);
  try {
    await until(() => leaderStateHealth().held, { what: "the leader to acquire" });
    const acquired = leaderStateHealth();
    assert.equal(acquired.started, true);
    assert.equal(acquired.reconnects, 0, "a first acquire is not a reconnect");
    assert.match(acquired.since, /^\d{4}-\d{2}-\d{2}T/, "the acquire time is stamped ISO");

    const pid = await until(leaderBackendPid, { what: "the leader's advisory-lock backend" });
    // THE FAULT INJECTION: kill the leader's dedicated session out from under it. This is the
    // real failure mode the reconnect path exists for (a pooler restart, a failover, an
    // operator's maintenance kill), not a simulated one.
    await priv.query("select pg_terminate_backend($1)", [pid]);

    await until(() => leaderStateHealth().reconnects >= 1, { what: "the lost leadership to be recorded" });
    const lost = leaderStateHealth();
    assert.equal(lost.reconnects, 1, "one loss of HELD leadership is one reconnect");
    assert.ok(typeof lost.last_error_code === "string", "a sanitized code is stamped, never the DB message");
    assert.match(lost.last_error_code, /^[A-Za-z0-9_]{1,32}$/, "and it is an identifier token, never free text");

    await until(() => leaderStateHealth().held, { what: "the leader to RE-acquire" });
    const regained = leaderStateHealth();
    assert.equal(regained.held, true, "the surviving process takes its own lock back — it does not die");
    assert.equal(regained.reconnects, 1, "and the counter is a flap count, not an attempt count");
    assert.equal(regained.ok, true, "a reconnect is degraded, never a halt");
    assert.notEqual(regained.since, acquired.since, "the acquire time is re-stamped on the new leadership");
  } finally {
    await leader.stop();
  }

  const stopped = leaderStateHealth();
  assert.equal(stopped.started, false, "a deliberate stop is not a fault");
  assert.equal(stopped.held, false);
  assert.equal(stopped.reconnects, 1, "and it does not rewrite the history of what happened");
});

test("#617 leader state: a taxonomy HALT is recorded BEFORE onHalt runs, and reads ok:false", async () => {
  _resetLeaderStateForTest();
  // Pending work is mandatory setup: with nothing to route, runRelayCycle never resolves the
  // taxonomy and never halts, and the cell would pass by doing nothing.
  const { firm, owner, client } = await fx.buildFirm("leader-halt");
  await fx.pumpDocuments(owner, client, 2, "leader-halt");
  await priv.query("update clara.relay_checkpoints set last_seq = 0 where consumer = 'router' and firm_id = $1", [firm]);

  const origVersion = await fx.activeTaxonomyVersion();
  await fx.rootQuery("alter table clara.taxonomy_active disable trigger user");
  await fx.rootQuery("delete from clara.taxonomy_active");

  let seenInsideOnHalt = null;
  let haltErr = null;
  let leader;
  try {
    leader = startLeaderLoop({
      ...quietDeps,
      onHalt: (err) => {
        // THE ORDERING ASSERTION'S ONLY POSSIBLE VANTAGE POINT. Read from outside, "recorded
        // before onHalt" and "recorded after onHalt" are indistinguishable; read from in here,
        // they are not. In production this callback is process.exit(2), so anything the loop
        // wrote after it would never exist.
        haltErr = err;
        seenInsideOnHalt = leaderStateHealth();
      },
    });
    await until(() => seenInsideOnHalt !== null, { what: "the taxonomy halt to reach onHalt" });
  } finally {
    await fx.rootQuery("insert into clara.taxonomy_active (singleton, version) values (true, $1)", [origVersion]);
    await fx.rootQuery("alter table clara.taxonomy_active enable trigger user");
    if (leader) await leader.stop();
  }

  assert.equal(haltErr?.name, "TaxonomyHaltError", "mandatory setup: the loop really did meet a HALT");
  assert.ok(seenInsideOnHalt.halted, "the halt was ALREADY recorded when onHalt was invoked");
  assert.equal(seenInsideOnHalt.halted.reason, "TaxonomyHaltError", "the reason is the error CLASS, an identifier token");
  assert.match(seenInsideOnHalt.halted.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(seenInsideOnHalt.held, false, "a halted leader is not holding anything");
  assert.equal(seenInsideOnHalt.ok, false, "and a recorded halt is the ONE condition that makes this check not-ok");
  // The halt error's MESSAGE names internal tables; only the class name may reach the wire.
  assert.ok(
    !JSON.stringify(seenInsideOnHalt).includes("taxonomy_active"),
    "the halt record carries a class name, never the error message",
  );
});

test("#617: a consumer health query that THROWS yields an explicit unavailable ENTRY, never a missing key", async () => {
  // WHY THIS CELL LIVES IN THIS FILE. It REVOKES an estate-global grant to make the consumer
  // health queries fail for real (rather than stubbing a client, which would prove nothing about
  // lib/health.mjs's own catch). That revoke is exactly the kind of committed, cluster-visible
  // mutation the private database above exists for; on the shared rig it would break whatever
  // else was mid-flight.
  const prevWorld = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  _resetLeaderStateForTest();
  const had = (await priv.query("select has_table_privilege('clara_runtime','clara.firm_event_seq','select') as p")).rows[0].p;
  assert.equal(had, true, "mandatory setup: clara_runtime can read the sequence table before the revoke");
  for (const component of ["world", "control"]) {
    await priv.query(
      "insert into clara.runtime_heartbeats (component, beat_at) values ($1, now()) on conflict (component) do update set beat_at = now()",
      [component],
    );
  }
  try {
    await priv.query("revoke select on clara.firm_event_seq from clara_runtime");
    const r = await checkReadiness();
    // The defect: before #617 the key was simply ABSENT from `checks`, and an absent key reads
    // as "nothing to report" — a consumer whose state is UNKNOWN was indistinguishable from one
    // that is fine, or from one that was never enabled.
    assert.equal(r.checks.matcher.ok, false, "an unavailable consumer is reported, not omitted");
    assert.equal(r.checks.matcher.unavailable, true, "and says WHY it is not-ok: the query never answered");
    assert.match(r.checks.matcher.error, /^[A-Za-z0-9_]{1,32}$/, "a sanitized code only — never the libpq message");
    assert.ok(
      r.warnings.some((w) => /matcher_health unavailable \(\w+\) — this consumer's state is UNKNOWN, not healthy/.test(w)),
      `expected the unavailable WARN, got: ${JSON.stringify(r.warnings)}`,
    );
    // The old warning line carried `err.message.slice(0, 80)` onto an unauthenticated endpoint.
    // A permission-denied message names the relation and the role; neither may appear.
    const payload = JSON.stringify(r);
    assert.ok(!payload.includes("permission denied"), "no raw libpq text on the unauthenticated payload");
    assert.ok(!payload.includes("firm_event_seq"), "and no relation name either");
    assert.equal(r.ready, true, "an unreadable consumer is degraded — it is not 'nothing works'");
  } finally {
    await priv.query("grant select on clara.firm_event_seq to clara_runtime");
    if (prevWorld === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prevWorld;
  }
  const restored = (await priv.query("select has_table_privilege('clara_runtime','clara.firm_event_seq','select') as p")).rows[0].p;
  assert.equal(restored, true, "the grant is restored — this cell must not leave the estate degraded");
});

test("#617 leader state: /ready reports the halt as a WARNING and never as a new 503", async () => {
  // The wiring half. The /ready contract fails on "nothing works"; a leader halt is handled by
  // the supervisor's own fail-fast (the process exits), so this must be a WARN — #617 adds a
  // reading, not a failure condition. World OFF so the assertion is about `checks.leader` alone.
  // The halt is recorded through the recorder directly rather than inherited from the cell above:
  // a cell that depends on its predecessor's leftover state passes or fails on file ordering.
  const prevWorld = process.env.CLARA_START_WORLD;
  delete process.env.CLARA_START_WORLD;
  _resetLeaderStateForTest();
  recordLeaderHalt(Object.assign(new Error("active taxonomy pointer (clara.taxonomy_active) is missing"), { name: "TaxonomyHaltError" }));
  try {
    const r = await checkReadiness();
    assert.equal(r.ready, true, "the halt record is a WARNING — it must not invent a new 503 condition");
    assert.equal(r.checks.leader.ok, false, "but the check itself is honest about it");
    assert.equal(r.checks.leader.halted.reason, "TaxonomyHaltError");
    assert.ok(
      r.warnings.some((w) => /relay leader HALTED \(TaxonomyHaltError/.test(w)),
      `expected the leader HALT warning, got: ${JSON.stringify(r.warnings)}`,
    );
    assert.ok(!JSON.stringify(r).includes(DBNAME), "no database identity reaches the unauthenticated payload");
  } finally {
    if (prevWorld === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prevWorld;
    _resetLeaderStateForTest();
  }
});
