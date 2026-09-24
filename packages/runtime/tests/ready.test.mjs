// /ready fail-vs-warn matrix (contract §4.7). checkReadiness FAILS only on DB
// unreachable / world dead / control dead / taxonomy HALT; relay lag/dead-letters/
// backlog are warnings. Exercised directly against clara_rt_test by toggling the
// world switch and the heartbeat freshness. (Taxonomy-HALT is NOT exercised here —
// removing the shared active pointer would corrupt the relay suite.)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as rig from "./rig.mjs";
import { checkReadiness } from "../lib/health.mjs";
import { _resetStorageProbeCacheForTest, _waitForStorageProbeSettleForTest } from "../lib/storage-probe.mjs";
import { makePool } from "../lib/relay.mjs";
import { _resetPoolErrorContractForTest, poolErrorHealth } from "../lib/pool-error-contract.mjs";
import { withRead, endPools } from "../lib/pools.mjs";
import { assertLaneDsnTlsPosture, _resetTlsPostureSnapshotForTest } from "../lib/tls-ca.mjs";
import { _resetLeaderStateForTest } from "../lib/leader-state.mjs";
import { _resetBodyCensusForTest, _setBodyCensusForTest } from "../lib/body-census.mjs";
import { FACTS_GATE_CONSUMER, FACTS_GATE_MAX_ATTEMPTS } from "../lib/facts-gate.mjs";
import {
  LANE_ROSTER,
  _resetLaneProbeCacheForTest,
  _setLaneProbeForTest,
  _waitForLaneProbeSettleForTest,
} from "../lib/lane-probe.mjs";

// A synthetic lane DSN whose every component is a RECOGNISABLE token, assembled piecewise
// because a DSN carrying an inline credential is the shape scripts/check-leaks.mjs refuses
// in a tracked file. Its whole job is to be findable: if any of these turns up in the
// /ready payload or a warning line, the probe leaked a DSN onto an UNAUTHENTICATED endpoint.
// Order: user, credential, host, database.
const LEAK_TOKENS = Object.freeze(["l9leakuser", "l9leaksecret", "l9leakhost.invalid", "l9leakdb"]);
const LEAK_DSN = ["postgres:/", "/", LEAK_TOKENS[0], ":", LEAK_TOKENS[1], "@", LEAK_TOKENS[2], ":1", "/", LEAK_TOKENS[3]].join("");

// fly.toml's own /ready check timeout — the number the MAJOR-1 cells defend. Kept as a named
// constant so a reader sees WHICH budget the assertion is about, not a bare 5000.
const FLY_READY_TIMEOUT_MS = 5000;

// #706 — the two numbers that used to be bare constants inside the timing-sensitive cells, named
// here with the reason each exists, so a CI red on either is readable as timing rather than as a
// lane defect.
//
// How much SLOWER than a settling-lane control a black-holed lane may make /ready look. This is
// scheduler noise on a loaded host, not the cost of a lane: the defect the MAJOR-1 cell pins adds
// a whole sequential bounded() deadline (health.mjs's READY_DEADLINE_MS, 5000ms), so there is an
// order of magnitude between "noise" and "the bug is back".
const BLACK_HOLE_SLACK_MS = 750;
// How long a lane verdict may take to CONVERGE. One `_waitForLaneProbeSettleForTest()` is one
// cycle, and one cycle only suffices when every lane answers inside CLARA_LANE_PROBE_TIMEOUT_MS
// (3s). Under load a healthy lane misses that bound, the cycle records ok:false for a lane that is
// fine, and a cell asserting on a single cycle reds on a working recovery path — measured in CI on
// PR #723, a web+db-only diff that touched no runtime file. Polling for the CONDITION makes the
// assertion about the behaviour and the budget about the host.
const LANE_SETTLE_BUDGET_MS = 60_000;
const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

// checkReadiness() now folds in the storage write probe (R9), which — like the four sibling
// storage tests (intake-unit.test.mjs et al.) — needs CLARA_TEST_STORAGE_DIR set, or
// storage.mjs's RELAY_TEST_MODE local-fs fallback (testRoot()) lands at ./test-storage
// relative to CWD, i.e. INSIDE THE REPO WORKING TREE when run from packages/runtime/ (proven
// by execution 2026-08-27 — untracked files showed up under packages/runtime/test-storage/).
let storageDir;
let previousStorageDir;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  storageDir = await mkdtemp(join(base, "clara-ready-storage-"));
  previousStorageDir = process.env.CLARA_TEST_STORAGE_DIR;
  process.env.CLARA_TEST_STORAGE_DIR = storageDir;
});

after(async () => {
  await rig.endPool();
  await endPools(); // the lane pools this file's fault-injection cell opens
  _resetLeaderStateForTest();
  _resetBodyCensusForTest();
  _resetTlsPostureSnapshotForTest();
  // Stop the storage probe's background interval before its scratch dir disappears below.
  _resetStorageProbeCacheForTest();
  if (previousStorageDir === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
  else process.env.CLARA_TEST_STORAGE_DIR = previousStorageDir;
  if (storageDir) await rm(storageDir, { recursive: true, force: true }).catch(() => {});
});

async function setBeat(component, expr) {
  await rig.asRuntime((c) =>
    c.query(`insert into clara.runtime_heartbeats (component, beat_at) values ($1, ${expr}) on conflict (component) do update set beat_at=${expr}`, [component]),
  );
}

test("ready: skeleton mode (world off) is READY on DB reachability alone", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  delete process.env.CLARA_START_WORLD;
  try {
    const r = await checkReadiness();
    assert.equal(r.ready, true, "ready in skeleton mode");
    assert.equal(r.checks.db.ok, true);
    assert.equal(r.checks.world.enabled, false, "world reported informational");
  } finally {
    if (prev !== undefined) process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: world ON with fresh world+control beats is READY", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    const r = await checkReadiness();
    assert.equal(r.ready, true, `ready with fresh beats (${JSON.stringify(r.checks)})`);
    assert.ok("storage" in r.checks, "the storage probe verdict must surface on /ready");
    assert.equal(r.checks.world.ok, true);
    assert.equal(r.checks.control.ok, true);
    assert.equal(r.checks.taxonomy.ok, true, "seed taxonomy pointer present");
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: world ON with a STALE world beat FAILS (world dead)", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  try {
    await setBeat("world", "now() - interval '10 minutes'");
    await setBeat("control", "now()");
    const r = await checkReadiness();
    assert.equal(r.ready, false, "not ready when the world beat is stale");
    assert.equal(r.checks.world.ok, false, "world check failed");
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

// round-8 (SHOULD D, native adversarial leg) — wakeEngineHealth's own heldBelowCheckpoint
// counter (round-7's defense-in-depth for the checkpoint-durability hole family) was computed
// but INERT: every sibling wake-engine signal gets wired into a /ready WARN, this one alone did
// not, so the docstring's own "surfaces on /ready" claim was false as shipped. This cell
// constructs the strand shape DIRECTLY (a held wake row whose own event_seq sits at its firm's
// wake_engine checkpoint) rather than via a full engine cycle — proving the WIRING specifically,
// not the mechanism that produces the shape (wake-engine.test.mjs's own cells own that).
test("ready: a held wake-engine row at/below its firm's own checkpoint WARNs on /ready (never a FAIL)", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    const w = await rig.buildFirm("ready-strand");
    const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
    const seq = Number(
      (await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [intent.intentId])).rows[0].event_seq,
    );
    const taskId = (
      await rig.rootQuery(
        "insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id",
        [intent.intentId],
      )
    ).rows[0].id;
    await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [
      intent.intentId,
    ]);
    await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intent.intentId, randomUUID()]);
    assert.ok(taskId, "mandatory setup: the held row exists");
    // Seed the wake_engine checkpoint directly AT this row's own seq — the exact strand shape
    // heldBelowCheckpoint exists to catch (readHeldWakeRows' own event_seq > lastSeq gate would
    // never surface this row again), constructed directly rather than via a full engine cycle.
    await rig.rootQuery(
      `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('wake_engine',$1,$2)
         on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
      [w.firm, seq],
    );
    const r = await checkReadiness();
    assert.equal(r.ready, true, "a strand is a WARN, never a /ready FAIL — the load-balancer must keep routing");
    assert.ok(
      r.warnings.some((x) => /held wake-engine row\(s\) sitting AT OR BELOW/.test(x)),
      `expected a heldBelowCheckpoint WARN line, got: ${JSON.stringify(r.warnings)}`,
    );
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

// 裁-149 (C-04) + H-48 — the two signals this PR adds to the readiness aggregation, exercised
// through checkReadiness itself rather than through their own modules: the unit cells in
// l9-pool-contract-lane-probe.test.mjs prove the counter and the prober; these prove the WIRING,
// which is the half that was inert for wakeEngineHealth's own counter three rounds ago.
test("ready: a relay-pool background error WARNs on /ready and NEVER flips ready false (裁-149)", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  _resetPoolErrorContractForTest();
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    const before = await checkReadiness();
    assert.equal(before.ready, true, "mandatory setup: ready before the planted error");
    assert.ok(
      !before.warnings.some((x) => /relay pool background error/.test(x)),
      "control: no relay-pool warning before the error is planted",
    );
    assert.deepEqual(before.checks.relay_pool, { errors: 0, last_error_at: null, last_error_code: null });

    const pool = makePool();
    try {
      pool.emit("error", Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }));
    } finally {
      await pool.end().catch(() => {});
    }

    const after = await checkReadiness();
    assert.equal(after.ready, true, "a background pool error is an AVAILABILITY signal, never a 503");
    assert.equal(after.checks.relay_pool.errors, 1, "the counter surfaces in checks");
    assert.equal(after.checks.relay_pool.last_error_code, "57P01", "the SANITIZED code surfaces, never the DB text");
    assert.ok(
      after.warnings.some((x) => /relay pool background error\(s\) since boot: 1/.test(x)),
      `expected the relay-pool WARN line, got: ${JSON.stringify(after.warnings)}`,
    );
    assert.ok(
      !JSON.stringify(after.checks.relay_pool).includes("terminating connection"),
      "the raw DB message never reaches the unauthenticated /ready payload",
    );
  } finally {
    _resetPoolErrorContractForTest();
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: the per-lane probe reports every lane, and the runtime lane is reachable (H-48)", { skip }, async () => {
  _resetLaneProbeCacheForTest();
  try {
    // The background loop is driven to a SETTLED verdict first; /ready then reads memory.
    await _waitForLaneProbeSettleForTest();
    const r = await checkReadiness();
    assert.ok(Array.isArray(r.checks.pools), `checks.pools must be the per-lane array, got ${JSON.stringify(r.checks.pools)}`);
    assert.equal(r.checks.pools.length, LANE_ROSTER.length, "every roster lane is reported");
    const runtimeLane = r.checks.pools.find((l) => l.lane === "runtime");
    assert.ok(runtimeLane, "the runtime lane is present");
    assert.equal(runtimeLane.ok, true, `the rig's runtime lane must answer select 1 (${JSON.stringify(runtimeLane)})`);
    assert.equal(typeof runtimeLane.latency_ms, "number");
    // No lane's row may carry anything but its name, its verdict and a sanitized code.
    for (const lane of r.checks.pools) {
      for (const key of Object.keys(lane)) {
        assert.ok(["lane", "ok", "latency_ms", "error", "skipped", "reason"].includes(key), `unexpected key '${key}' on a lane row`);
      }
    }
  } finally {
    _resetLaneProbeCacheForTest();
  }
});

test("ready MAJOR-1: a BLACK-HOLED lane leaves /ready far inside fly's 5s timeout", { skip }, async () => {
  // THE DEFECT REVIEW-558 CAUGHT, PINNED. The lane probe was a THIRD sequential bounded() call,
  // each able to spend READY_DEADLINE_MS, inside the 5s total fly.toml:49 allows. H-48's own
  // headline case — a lane DSN naming a host that BLACK-HOLES rather than refuses — would then
  // have pushed /ready past that timeout, and the operator would have got a timed-out health
  // check INSTEAD of the `pool lane 'x' unreachable` warning the feature exists to give.
  //
  // The prober here NEVER settles, which is that case exactly. /ready must not wait for it.
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  _resetLaneProbeCacheForTest();
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    // THE MARGIN IS MEASURED AGAINST A CONTROL ON THIS HOST, NOT AGAINST A BARE CONSTANT (#706).
    // The margin assertion used to read `elapsed < 2000`, which is a statement about the MACHINE
    // as much as about the code: under host load (another suite on the same box, a loaded CI
    // runner) a correct /ready overran it, and the red read as a lane defect. This control —
    // one checkReadiness() with an instantly-settling probe — costs whatever /ready costs on
    // this host right now, so comparing against it measures the only thing the cell is about:
    // that the BLACK-HOLED lane adds nothing. The defect being pinned would add a whole
    // sequential bounded() deadline (health.mjs's READY_DEADLINE_MS, 5s) — orders of magnitude
    // more than the slack below — so the comparison stays discriminating.
    _setLaneProbeForTest(async (d) => ({ lane: d.lane, ok: true, latency_ms: 1 }));
    await _waitForLaneProbeSettleForTest();
    const c0 = Date.now();
    await checkReadiness();
    const controlMs = Date.now() - c0;

    _resetLaneProbeCacheForTest();
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    _setLaneProbeForTest(() => new Promise(() => {})); // black hole: never resolves, never rejects

    const t0 = Date.now();
    const r = await checkReadiness();
    const elapsed = Date.now() - t0;

    assert.ok(
      elapsed < FLY_READY_TIMEOUT_MS,
      `/ready must settle inside fly's ${FLY_READY_TIMEOUT_MS}ms (was ${elapsed}ms). `
        + `If this is the ONLY assertion that failed, read it as host timing: the margin check below passed.`,
    );
    assert.ok(
      elapsed <= controlMs + BLACK_HOLE_SLACK_MS,
      `the black-holed lane must cost /ready nothing beyond a settling one ON THIS HOST — `
        + `control ${controlMs}ms, black-holed ${elapsed}ms, stated slack ${BLACK_HOLE_SLACK_MS}ms. `
        + `The defect this cell pins would add a whole bounded() deadline (~5000ms); a red only a few `
        + `hundred ms over the control is timing, not a lane on the request path.`,
    );
    assert.equal(r.ready, true, "an UNMEASURED lane never 503s a healthy machine");
    assert.deepEqual(
      r.checks.pools,
      { pending: true, stalled: false },
      "a cold cache reports pending and NOT-yet-stalled, never a fabricated verdict",
    );
    assert.ok(
      !r.warnings.some((x) => /pool lane/.test(x)),
      `a pending probe warns about nothing; got: ${JSON.stringify(r.warnings)}`,
    );
    // Polling repeatedly must stay free — a load balancer hits this every 15s forever.
    const t1 = Date.now();
    await checkReadiness();
    await checkReadiness();
    assert.ok(Date.now() - t1 < FLY_READY_TIMEOUT_MS, "subsequent polls are not slowed by the hung lane either");
  } finally {
    _resetLaneProbeCacheForTest();
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready MAJOR-1: the lane WARNING still surfaces once the background probe settles (H-48)", { skip }, async () => {
  // The other half, and the discriminating one: moving the probe off the request path must not
  // cost the signal. A dead NON-runtime lane WARNs and stays ready; the RUNTIME lane fails.
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  _resetLaneProbeCacheForTest();
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");

    // (a) a non-runtime lane down: WARN, still ready.
    _setLaneProbeForTest(async (d) =>
      d.lane === "read" ? { lane: d.lane, ok: false, error: "ECONNREFUSED" } : { lane: d.lane, ok: true, latency_ms: 1 },
    );
    await _waitForLaneProbeSettleForTest();
    const degraded = await checkReadiness();
    assert.equal(degraded.ready, true, "a dead READ lane degrades the agent — it is not 'nothing works'");
    assert.equal(degraded.checks.pools.find((l) => l.lane === "read").ok, false, "the read lane is reported down");
    assert.ok(
      degraded.warnings.some((x) => /pool lane 'read' unreachable \(ECONNREFUSED\)/.test(x)),
      `expected the read-lane WARN, got: ${JSON.stringify(degraded.warnings)}`,
    );

    // (b) the RUNTIME lane down: ready FALSE. Without this, (a) would pass for a probe whose
    // verdict never reaches the readiness decision at all.
    _resetLaneProbeCacheForTest();
    _setLaneProbeForTest(async (d) =>
      d.lane === "runtime" ? { lane: d.lane, ok: false, error: "ECONNREFUSED" } : { lane: d.lane, ok: true, latency_ms: 1 },
    );
    await _waitForLaneProbeSettleForTest();
    const down = await checkReadiness();
    assert.equal(down.ready, false, "the runtime lane is the ONE lane whose failure is a readiness failure");
    assert.equal(down.checks.pools.find((l) => l.lane === "runtime").ok, false);
    assert.ok(
      !down.warnings.some((x) => /pool lane 'runtime'/.test(x)),
      "the runtime lane is a FAILURE, not a warning — it must not be reported as both",
    );
  } finally {
    _resetLaneProbeCacheForTest();
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready r2: a STALLED probe loop WARNS on /ready and never fails readiness (H-48)", { skip }, async () => {
  // Until r2 a wedged loop was silent: a cycle that blows its bound resets the verdict to
  // pending, which read identically to "not measured yet", forever. /ready now says so.
  const prev = process.env.CLARA_START_WORLD;
  const prevInterval = process.env.CLARA_LANE_PROBE_INTERVAL_MS;
  const prevCycle = process.env.CLARA_LANE_PROBE_CYCLE_MS;
  process.env.CLARA_START_WORLD = "1";
  process.env.CLARA_LANE_PROBE_INTERVAL_MS = "1000";
  process.env.CLARA_LANE_PROBE_CYCLE_MS = "30";
  _resetLaneProbeCacheForTest();
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    _setLaneProbeForTest(() => new Promise(() => {})); // every cycle exceeds cycleMs

    const fresh = await checkReadiness();
    assert.equal(fresh.checks.pools.stalled, false, "a fresh loop is pending, NOT yet stalled");
    assert.ok(!fresh.warnings.some((x) => /probe loop is stalled/.test(x)), "and warns about nothing yet");

    await new Promise((r) => setTimeout(r, 2100)); // past two intervals
    const stalled = await checkReadiness();
    assert.equal(stalled.ready, true, "a stalled INSTRUMENT is not a broken lane — never a 503");
    assert.equal(stalled.checks.pools.stalled, true, "the stall is reported in checks");
    assert.ok(
      stalled.warnings.some((x) => /probe loop is stalled, not the lanes/.test(x)),
      `expected the stalled WARN, got: ${JSON.stringify(stalled.warnings)}`,
    );
  } finally {
    _resetLaneProbeCacheForTest();
    if (prevInterval === undefined) delete process.env.CLARA_LANE_PROBE_INTERVAL_MS;
    else process.env.CLARA_LANE_PROBE_INTERVAL_MS = prevInterval;
    if (prevCycle === undefined) delete process.env.CLARA_LANE_PROBE_CYCLE_MS;
    else process.env.CLARA_LANE_PROBE_CYCLE_MS = prevCycle;
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready r2: NO DSN component reaches the /ready payload or a warning line (H-48)", { skip }, async () => {
  // END-TO-END, through the REAL probeLane — not an injected stub, because the leak this
  // defends against would live in the real one. A lane is pointed at a synthetic DSN whose
  // user, credential, host and database are all recognisable tokens; /ready must carry none of
  // them, in checks or in warnings. It is an unauthenticated endpoint.
  const prev = process.env.CLARA_START_WORLD;
  const prevRead = process.env.CLARA_READ_DATABASE_URL;
  process.env.CLARA_START_WORLD = "1";
  process.env.CLARA_READ_DATABASE_URL = LEAK_DSN;
  _resetLaneProbeCacheForTest();
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    await _waitForLaneProbeSettleForTest(); // a REAL cycle: the read lane genuinely fails to connect

    const r = await checkReadiness();
    const readLane = r.checks.pools.find((l) => l.lane === "read");
    assert.ok(readLane, "the read lane is reported");
    assert.equal(readLane.ok, false, "mandatory setup: the synthetic DSN really did fail to connect");
    assert.equal(r.ready, true, "a dead READ lane is a warning, not a 503");
    assert.ok(
      r.warnings.some((x) => /pool lane 'read' unreachable/.test(x)),
      `expected the read-lane WARN, got: ${JSON.stringify(r.warnings)}`,
    );
    const payload = JSON.stringify(r);
    for (const token of LEAK_TOKENS) {
      assert.ok(!payload.includes(token), `the DSN component '${token}' must never reach the /ready payload`);
      for (const w of r.warnings) {
        assert.ok(!w.includes(token), `the DSN component '${token}' must never reach a warning line`);
      }
    }
  } finally {
    _resetLaneProbeCacheForTest();
    if (prevRead === undefined) delete process.env.CLARA_READ_DATABASE_URL;
    else process.env.CLARA_READ_DATABASE_URL = prevRead;
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: world ON with a STALE control beat FAILS (control listener dead)", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now() - interval '10 minutes'");
    const r = await checkReadiness();
    assert.equal(r.ready, false, "not ready when the control beat is stale");
    assert.equal(r.checks.control.ok, false, "control check failed");
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

// ===========================================================================
// #617 — THE FAULT-INJECTION BATTERY.
//
// The through-line of every cell below: an UNMEASURED or ABSENT reading must never be served as
// a healthy one, and a fault must be visible on /ready in a shape an operator can act on. Each
// cell also re-runs the DSN-leak assertion — /ready is unauthenticated, and every field these
// changes add is a new chance to spill one.
// ===========================================================================

/**
 * Poll the background lane probe until a lane's verdict satisfies `pred`, or the stated budget
 * expires (#706).
 *
 * A single `_waitForLaneProbeSettleForTest()` awaits ONE cycle, and one cycle carries a correct
 * verdict only when every lane answered inside CLARA_LANE_PROBE_TIMEOUT_MS. Under host load that
 * is not a safe assumption, and a cell that asserts on one cycle is asserting on a stopwatch. This
 * polls for the CONDITION instead — so the assertion is about convergence, which is what the
 * recovery half actually claims, and the budget is about the host, which is what a red here then
 * means. The failure message says so explicitly.
 *
 * #1033 — EVERY ITERATION also refreshes the world/control heartbeats this file's own `checks`
 * depend on. This loop can legitimately span MULTIPLE background probe cycles under host load: a
 * cycle whose hard bound is blown discards the whole cycle's verdict (never a stale one — see
 * lane-probe.mjs's own header), so a caller waiting on a real fault can end up waiting for the
 * loop's next scheduled tick. The world/control heartbeats are an UNRELATED clock with its own
 * staleness window (`health.mjs`'s HEARTBEAT_STALE_MS, 30s by default) that a caller sets once,
 * before the wait starts, and this loop used to never touch again — so a wait long enough to
 * reach a correct lane verdict could also, coincidentally, be long enough to make that heartbeat
 * read stale and fail readiness for a reason that has nothing to do with the lane fault being
 * waited on (measured on CI in wave-2 integration PR #1029's second run: the disconnect cell
 * timed out at 30089ms, 89ms past both 30s defaults). Refreshing here removes the race without
 * touching either production default: the probe's real cadence and the heartbeat's real staleness
 * window are both untouched: this is a caller merely proving it is still alive while it waits, the
 * same as `setBeat` already does once at the top of every cell that turns the world on.
 *
 * WHAT THE REFRESH DOES TO THE CALLER THAT ALREADY EXISTED, measured (review SPEC-1033-A, lane 07,
 * 2026-09-24). Instrumented runs of the DISCONNECT-AND-RECOVER cell below — the cell AC1 names,
 * driven with no other change — print the world heartbeat age its own `ready` assertion reads:
 * 48ms then 37ms WITH this refresh, 59ms then 1374ms with the two `setBeat` lines removed. The
 * refresh bounds that age by ONE iteration instead of by the whole wait, which is the property
 * the cell's `ready === true` assertion rests on; without it the age grows with the wait and
 * crosses `HEARTBEAT_STALE_MS` on any wait long enough (CI PR #1029: 30089ms, 89ms past it).
 * The collision itself cannot be forced on that cell by environment alone — measured: with
 * `CLARA_LANE_PROBE_CYCLE_MS=50` and `CLARA_LANE_PROBE_INTERVAL_MS=35000` it converges in one
 * cycle and passes in 522ms either way — which is why the #1033 cell below injects a prober
 * rather than racing the real one.
 */
async function settleLaneUntil(pred, what, budgetMs = LANE_SETTLE_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  let last = null;
  for (;;) {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    await _waitForLaneProbeSettleForTest();
    last = await checkReadiness();
    if (pred(last)) return last;
    if (Date.now() >= deadline) {
      throw new Error(
        `the lane probe never converged on ${what} within ${budgetMs}ms — TIMING, unless the verdict below is `
          + `stably wrong rather than late: ${JSON.stringify(last.checks.pools)} warnings=${JSON.stringify(last.warnings)}`,
      );
    }
  }
}

/** Every cell's closing assertion: no DSN component, in checks or in any warning line. */
function assertNoDsnLeak(r) {
  const payload = JSON.stringify(r);
  for (const token of LEAK_TOKENS) {
    assert.ok(!payload.includes(token), `the DSN component '${token}' must never reach the /ready payload`);
    for (const w of r.warnings) assert.ok(!w.includes(token), `the DSN component '${token}' must never reach a warning line`);
  }
}

test("#617 fault: a lane DISCONNECTS -> ok:false with a sanitized code -> RECOVERS -> ok:true", { skip }, async () => {
  // The recovery half is the half that was never proven. A probe that goes red and stays red
  // (a cached verdict, a latched flag, a loop that stopped after its first failure) would pass
  // every existing cell in this file: they all stop at the failure.
  const prev = process.env.CLARA_START_WORLD;
  const prevRead = process.env.CLARA_READ_DATABASE_URL;
  process.env.CLARA_START_WORLD = "1";
  _resetLaneProbeCacheForTest();
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");

    process.env.CLARA_READ_DATABASE_URL = LEAK_DSN; // points at a host that is not there
    // Converge, don't snapshot (#706) — see settleLaneUntil. A `.invalid` host usually answers in
    // one cycle; under load it may not, and that is timing rather than a probe that cannot fail.
    const down = await settleLaneUntil(
      (r) => Array.isArray(r.checks.pools) && r.checks.pools.find((l) => l.lane === "read")?.ok === false,
      "the disconnected READ lane reporting ok:false",
    );
    const downLane = down.checks.pools.find((l) => l.lane === "read");
    assert.equal(downLane.ok, false, "the disconnected lane reports a failure");
    assert.match(downLane.error, /^[A-Za-z0-9_]{1,32}$/, "and only a sanitized code — never raw DB text");
    assert.equal(down.ready, true, "a non-runtime lane failure is a WARN, never a 503");
    assertNoDsnLeak(down);

    // RECOVERY: put the lane back and let one more background cycle settle.
    if (prevRead === undefined) delete process.env.CLARA_READ_DATABASE_URL;
    else process.env.CLARA_READ_DATABASE_URL = prevRead;
    _resetLaneProbeCacheForTest();
    // THE HALF THAT WENT RED IN CI (#706, PR #723 — a web+db-only diff). One cycle is not a
    // recovery: a real lane coming back must beat CLARA_LANE_PROBE_TIMEOUT_MS on a loaded runner
    // to be recorded healthy in that ONE cycle, and when it does not, a working recovery path
    // reads as a latched failure. Converge instead.
    const back = await settleLaneUntil(
      (r) => Array.isArray(r.checks.pools) && r.checks.pools.find((l) => l.lane === "read")?.ok === true,
      "the restored READ lane reporting ok:true again",
    );
    const backLane = back.checks.pools.find((l) => l.lane === "read");
    assert.equal(backLane.ok, true, `the lane must report healthy again once it is (${JSON.stringify(backLane)})`);
    assert.ok(
      !back.warnings.some((x) => /pool lane 'read' unreachable/.test(x)),
      `and the warning must clear; got: ${JSON.stringify(back.warnings)}`,
    );
    assertNoDsnLeak(back);
  } finally {
    _resetLaneProbeCacheForTest();
    if (prevRead === undefined) delete process.env.CLARA_READ_DATABASE_URL;
    else process.env.CLARA_READ_DATABASE_URL = prevRead;
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

// #1033 — the clock collision behind CI PR #1029's flake in the cell above. Reproduced
// DETERMINISTICALLY, on a bounded budget, instead of racing real host load: a probe cycle is
// forced to blow its own hard bound (every lane answers slower than a shrunk
// `CLARA_LANE_PROBE_CYCLE_MS`), which discards the WHOLE cycle's verdict — even an
// already-correct one — and forces `settleLaneUntil` to wait for the loop's next scheduled tick.
// `health.mjs`'s `HEARTBEAT_STALE_MS` is a plain top-level `const`, read from
// `CLARA_HEARTBEAT_STALE_MS` once at module load (before any test body runs), so a test cannot
// shrink IT — instead `CLARA_LANE_PROBE_INTERVAL_MS` (read dynamically, per call) is set to 35s,
// deliberately PAST the real, unshrunk 30s heartbeat window with margin, so the one discarded
// cycle's wait crosses that boundary deterministically rather than racing it at the edge. The
// world/control heartbeats this test sets ONCE, at the top, are a clock `settleLaneUntil` does
// not own and previously never refreshed while it polled.
test("#617 fault: settleLaneUntil keeps the world/control heartbeats fresh across a discarded probe cycle (#1033)", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  const prevInterval = process.env.CLARA_LANE_PROBE_INTERVAL_MS;
  const prevCycle = process.env.CLARA_LANE_PROBE_CYCLE_MS;
  process.env.CLARA_START_WORLD = "1";
  process.env.CLARA_LANE_PROBE_INTERVAL_MS = "35000"; // > the real, unshrinkable 30s heartbeat window, with margin
  process.env.CLARA_LANE_PROBE_CYCLE_MS = "50";
  _resetLaneProbeCacheForTest();
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");

    let calls = 0;
    _setLaneProbeForTest(async (d) => {
      calls += 1;
      // The FIRST cycle's seven concurrent probes (one per LANE_ROSTER entry) each answer slower
      // than the 50ms cycle bound — the shape one slow, unrelated lane produces under host load —
      // so `withHardTimeout` discards the whole cycle. Every later call answers instantly, once
      // the loop's next tick (35s later) starts a second cycle.
      if (calls <= LANE_ROSTER.length) await new Promise((r) => setTimeout(r, 150));
      return d.lane === "read" ? { lane: d.lane, ok: false, error: "TEST_FAULT" } : { lane: d.lane, ok: true, latency_ms: 1 };
    });

    const down = await settleLaneUntil(
      (r) => Array.isArray(r.checks.pools) && r.checks.pools.find((l) => l.lane === "read")?.ok === false,
      "the injected READ-lane fault reporting ok:false",
      45_000, // bounded — one 35s interval tick plus slack, never open-ended
    );
    const downLane = down.checks.pools.find((l) => l.lane === "read");
    assert.equal(downLane.ok, false, "mandatory setup: the fault really was recorded, after the first cycle was discarded");
    assert.equal(
      down.ready,
      true,
      "a non-runtime lane failure is a WARN, never a 503 — even after a discarded cycle forced the wait past the heartbeat's own 30s staleness window (#1033)",
    );
  } finally {
    _resetLaneProbeCacheForTest();
    if (prevCycle === undefined) delete process.env.CLARA_LANE_PROBE_CYCLE_MS;
    else process.env.CLARA_LANE_PROBE_CYCLE_MS = prevCycle;
    if (prevInterval === undefined) delete process.env.CLARA_LANE_PROBE_INTERVAL_MS;
    else process.env.CLARA_LANE_PROBE_INTERVAL_MS = prevInterval;
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("#617 fault: a REAL backend kill on a pooled idle client increments THAT lane's counter on /ready", { skip }, async () => {
  // Not a synthetic `pool.emit('error')` — an actual `pg_terminate_backend` of an idle client
  // sitting in the read pool, which is the production failure (a pooler restart, a failover, an
  // operator's maintenance kill). That is the event that used to be logged and then vanish.
  _resetPoolErrorContractForTest();
  try {
    // Check out once so the pool has a live, then idle, physical connection; capture its pid
    // from inside the checkout, which is the only place it is knowable.
    const pid = await withRead(async (c) => Number((await c.query("select pg_backend_pid() as pid")).rows[0].pid));
    assert.ok(Number.isFinite(pid) && pid > 0, "mandatory setup: the read pool checked out a real backend");
    assert.equal(poolErrorHealth().read.errors, 0, "the read lane starts clean and is REGISTERED (constructed, not absent)");

    await rig.rootQuery("select pg_terminate_backend($1)", [pid]);

    // The pool's 'error' event lands asynchronously on the idle client.
    const deadline = Date.now() + 10_000;
    while (poolErrorHealth().read.errors === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));

    const counters = poolErrorHealth().read;
    assert.equal(counters.errors, 1, "the killed lane's own counter moved");
    assert.match(counters.last_error_code, /^[A-Za-z0-9_]{1,32}$/, "a sanitized code, never the DB message");
    assert.equal(poolErrorHealth().write?.errors ?? 0, 0, "and no other lane's counter did");

    const r = await checkReadiness();
    assert.equal(r.ready, true, "a background pool error is an availability signal, never a 503");
    assert.equal(r.checks.pool_errors.read.errors, 1, "the counter surfaces on /ready, keyed by lane");
    assert.ok(
      r.warnings.some((x) => /pool lane 'read' background error\(s\) since boot: 1/.test(x)),
      `expected the per-lane WARN, got: ${JSON.stringify(r.warnings)}`,
    );
    assert.ok(
      !JSON.stringify(r.checks.pool_errors).includes("terminating connection"),
      "the raw DB message never reaches the unauthenticated payload",
    );
    assertNoDsnLeak(r);
  } finally {
    _resetPoolErrorContractForTest();
  }
});

test("#617 fault: storage PENDING and storage NOT CONFIGURED are distinct /ready states, neither healthy", { skip }, async () => {
  const prevUrl = process.env.CLARA_STORAGE_URL;
  const prevRole = process.env.CLARA_STORAGE_ROLE;
  const prevJwt = process.env.CLARA_STORAGE_ROLE_JWT;
  _resetStorageProbeCacheForTest();
  try {
    // (a) PENDING — the cold-start window. Previously reported `ok:true` and warned about
    // nothing at all: an unmeasured document lane, served as a healthy one.
    const pending = await checkReadiness();
    assert.equal(pending.checks.storage.pending, true, "the cold verdict says it has not measured");
    assert.equal("ok" in pending.checks.storage, false, "and claims no ok at all");
    assert.ok(
      pending.warnings.some((x) => /storage probe pending \(not yet measured\)/.test(x)),
      `expected the pending WARN, got: ${JSON.stringify(pending.warnings)}`,
    );
    assert.equal(pending.ready, true, "still WARN-only — the storage lane never gates readiness");
    await _waitForStorageProbeSettleForTest(); // drain the cycle that call started

    // (b) NOT CONFIGURED — an estate with no storage secrets. Previously indistinguishable from
    // a live storage outage (both `ok:false, reason:'storage_error'`).
    _resetStorageProbeCacheForTest();
    delete process.env.RELAY_TEST_MODE;
    delete process.env.CLARA_STORAGE_URL;
    delete process.env.CLARA_STORAGE_ROLE;
    delete process.env.CLARA_STORAGE_ROLE_JWT;
    const unconfigured = await checkReadiness();
    assert.deepEqual(
      unconfigured.checks.storage,
      { skipped: true, reason: "storage_not_configured" },
      "an unconfigured lane reports its own third state",
    );
    assert.ok(
      unconfigured.warnings.some((x) => /storage is NOT CONFIGURED/.test(x)),
      `expected the not-configured WARN, got: ${JSON.stringify(unconfigured.warnings)}`,
    );
    assert.ok(
      !unconfigured.warnings.some((x) => /storage write probe failed/.test(x)),
      "and it is NEVER reported as a failure — that is the whole distinction",
    );
    assertNoDsnLeak(unconfigured);
  } finally {
    process.env.RELAY_TEST_MODE = "1";
    if (prevUrl === undefined) delete process.env.CLARA_STORAGE_URL;
    else process.env.CLARA_STORAGE_URL = prevUrl;
    if (prevRole === undefined) delete process.env.CLARA_STORAGE_ROLE;
    else process.env.CLARA_STORAGE_ROLE = prevRole;
    if (prevJwt === undefined) delete process.env.CLARA_STORAGE_ROLE_JWT;
    else process.env.CLARA_STORAGE_ROLE_JWT = prevJwt;
    _resetStorageProbeCacheForTest();
  }
});

test("#617 fault: a QUEUE STALL shows as its own categories — a stranded task and an EXHAUSTED dead letter", { skip }, async () => {
  // The two stall shapes that used to be invisible or mislabelled: a local_facts row wedged in
  // 'running' (contributing to no queued backlog at all), and a facts_gate dead letter past its
  // retry cap (counted only inside a pending total that also holds rows still being retried).
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    const w = await rig.buildFirm("ready-stall");
    // The same governed seeder the matcher/classify rigs use, called directly rather than through
    // matcher-testkit.mjs so this file keeps its own (already long) import list.
    const sha = rig.sha(`ready-stall_${rig.opk("d")}`);
    const document = (
      await rig.rootQuery("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,1) as r", [
        w.firm,
        null,
        sha,
        "ready-stall.pdf",
        "application/pdf",
        2048,
        `firms/${w.firm}/docs/${sha}.pdf`,
        w.owner,
      ])
    ).rows[0].r.document_id;

    // (a) a STRANDED local_facts task: 'running', started long past the lane's own threshold.
    await rig.rootQuery(
      `insert into clara.document_processing_tasks
         (firm_id, document_id, engine_id, version_n, lane, status, workflow_run_id, started_at, attempt_count)
       values ($1,$2,'clara-local-facts:v1',1,'local_facts','running','rig-617-stall', now() - interval '2 hours', 4)`,
      [w.firm, document],
    );

    // (b) an EXHAUSTED facts_gate dead letter: pending, at that consumer's own cap.
    const seq = Number(
      (
        await rig.asFnOwner((c) =>
          c.query("select clara._append_event($1,'document.classified',null,$2,null,null,null,$3,null,'{}'::jsonb) as seq", [
            w.firm,
            w.owner,
            document,
          ]),
        )
      ).rows[0].seq,
    );
    const eventId = (await rig.rootQuery("select id from clara.domain_events where firm_id=$1 and seq=$2", [w.firm, seq])).rows[0].id;
    await rig.rootQuery(
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version, attempt_count)
         values ($1, $2, 'rig-seeded #617 stall', null, $3)`,
      [FACTS_GATE_CONSUMER, eventId, FACTS_GATE_MAX_ATTEMPTS],
    );

    const r = await checkReadiness();
    assert.equal(r.ready, true, "a queue stall degrades a lane; it is never 'nothing works'");
    assert.ok(
      r.warnings.some((x) => /local_facts: \d+ task\(s\) STRANDED in 'running'/.test(x)),
      `expected the stranded-task WARN, got: ${JSON.stringify(r.warnings)}`,
    );
    assert.ok(r.checks.localFacts.stranded >= 1, "and the count is in checks, not only in prose");
    assert.ok(
      r.warnings.some((x) => /facts_gate dead-letter\(s\) EXHAUSTED past max attempts/.test(x)),
      `expected the exhausted dead-letter WARN, got: ${JSON.stringify(r.warnings)}`,
    );
    assert.ok(r.checks.factsGate.deadLetters.exhausted >= 1, "counted apart from the pending total");
    assert.ok(
      r.warnings.some((x) => /facts_gate: \d+ firm\(s\) have events but NO checkpoint/.test(x)),
      `expected the not-yet-measured WARN (this firm has an event and no facts_gate checkpoint), got: ${JSON.stringify(r.warnings)}`,
    );
    assertNoDsnLeak(r);
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("#617: checks.tls carries VARIABLE NAMES and counts only — never a DSN, never a fabricated posture", { skip }, async () => {
  const prevRead = process.env.CLARA_READ_DATABASE_URL;
  _resetTlsPostureSnapshotForTest();
  try {
    // (a) NOT MEASURED: the boot assert has not run in this process. That is not "nothing is
    // pinned"; reporting it as a clean posture would be the fabricated-green shape #617 removes.
    const unmeasured = await checkReadiness();
    assert.deepEqual(unmeasured.checks.tls, { measured: false }, "an unrun assert says so and claims nothing else");

    // (b) MEASURED: run the real boot assert over the real environment, with one lane pointed at
    // a DSN whose every component is a recognisable token.
    process.env.CLARA_READ_DATABASE_URL = LEAK_DSN;
    assertLaneDsnTlsPosture();
    const r = await checkReadiness();
    assert.equal(r.checks.tls.measured, true);
    assert.ok(r.checks.tls.unpinned.includes("CLARA_READ_DATABASE_URL"), "the VARIABLE NAME is what is reported");
    assert.ok(r.checks.tls.weak_mode.includes("CLARA_READ_DATABASE_URL"), "a DSN with no verifying sslmode is named too");
    assert.equal(typeof r.checks.tls.validated, "number", "validated is a COUNT — a sslrootcert PATH is deployment shape, not a health field");
    for (const key of Object.keys(r.checks.tls)) {
      assert.ok(["measured", "pinned", "unpinned", "weak_mode", "validated"].includes(key), `unexpected key '${key}' on checks.tls`);
    }
    assertNoDsnLeak(r);
  } finally {
    if (prevRead === undefined) delete process.env.CLARA_READ_DATABASE_URL;
    else process.env.CLARA_READ_DATABASE_URL = prevRead;
    _resetTlsPostureSnapshotForTest();
  }
});

// ---------------------------------------------------------------------------
// #637 — checks.bodies. A parked run whose BODY this image no longer carries is a run this
// process cannot resume, and until now no surface said so: `/workflows` names classes,
// `/api/build-info` names what the image HAS, and nothing compared the two against live state.
//
// SUPERSEDED BY THE "#637 review S5" SECTION BELOW. This ruling was originally warning-only,
// following `checks.leader` (`held:false` warns; the process keeps serving). A measurement
// overturned it: an engine that re-enqueues a run whose body it does not export raises
// `ReplayDivergenceError`, the crash-only supervisor exits, and Fly restarts it — a loop, not a
// park. The shipped rule instead REFUSES to start the durable world (HTTP stays up, `/ready` is
// 503 with the stranded bodies NAMED, `CLARA_ALLOW_STRANDED_BODIES=1` overrides, and a census
// that could not be TAKEN — as opposed to one that found something — still fails open) — see the
// S5 section below for that contract and its tests.
//
// The ONE cell in THIS section that still applies as written: a census reported with
// `worldStartRefused: false` (the operator override, or a process that never took the refusing
// path) stays a WARNING and `ready` stays true.
// ---------------------------------------------------------------------------

test("ready: checks.bodies reports stranded bodies as a WARNING — ready stays true", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  delete process.env.CLARA_START_WORLD;
  _setBodyCensusForTest({ measured: true, stranded: 3, names: ["claraWork_v2", "chatTurn_v18"], runs: [] });
  try {
    const r = await checkReadiness();
    assert.equal(r.checks.bodies.measured, true);
    assert.equal(r.checks.bodies.stranded, 3);
    assert.deepEqual(r.checks.bodies.names, ["claraWork_v2", "chatTurn_v18"]);
    assert.equal(r.ready, true, "a stranded body is a WARNING — the process keeps serving (the checks.leader precedent)");
    assert.ok(
      r.warnings.some((w) => w.includes("claraWork_v2") && w.includes("chatTurn_v18")),
      `the warning NAMES the bodies; got ${JSON.stringify(r.warnings)}`,
    );
  } finally {
    _resetBodyCensusForTest();
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: an UNMEASURED body census is reported as unmeasured, never as a clean zero", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  delete process.env.CLARA_START_WORLD;
  _resetBodyCensusForTest();
  try {
    const r = await checkReadiness();
    assert.equal(r.checks.bodies.measured, false, "the boot census has not run in this process");
    assert.equal(r.checks.bodies.stranded, null, "…so there is no count, and 0 would be a lie");
    assert.ok(!("names" in r.checks.bodies) || r.checks.bodies.names === null || r.checks.bodies.names.length === 0);
    assert.equal(r.ready, true);
    assert.equal(
      r.warnings.some((w) => w.toLowerCase().includes("stranded")),
      false,
      "an unmeasured census warns about nothing — absence of evidence is not evidence of a problem either way",
    );
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: a measured census with ZERO stranded bodies is a clean, silent green", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  delete process.env.CLARA_START_WORLD;
  _setBodyCensusForTest({ measured: true, stranded: 0, names: [], runs: [] });
  try {
    const r = await checkReadiness();
    assert.equal(r.checks.bodies.measured, true);
    assert.equal(r.checks.bodies.stranded, 0);
    assert.equal(r.ready, true);
    assert.equal(r.warnings.some((w) => w.toLowerCase().includes("stranded")), false);
  } finally {
    _resetBodyCensusForTest();
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: a census that FAILED to read says so — a failed read is not zero stranded bodies", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  delete process.env.CLARA_START_WORLD;
  _setBodyCensusForTest({ measured: false, error: "insufficient_privilege" });
  try {
    const r = await checkReadiness();
    assert.equal(r.checks.bodies.measured, false);
    assert.equal(r.checks.bodies.error, "insufficient_privilege");
    assert.equal(r.ready, true, "fail-open: the census is an instrument, not a dependency");
    assert.ok(
      r.warnings.some((w) => w.includes("insufficient_privilege")),
      `a failed census WARNS with its sanitized code; got ${JSON.stringify(r.warnings)}`,
    );
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes("postgres://"), "no DSN reaches the payload");
  } finally {
    _resetBodyCensusForTest();
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

// ---------------------------------------------------------------------------
// #637 review S5 — THE WORLD REFUSES TO START WHEN A BODY IS STRANDED.
//
// The brief's original ruling was warning-only. A measurement overturned it: an engine that
// re-enqueues a run whose body it does not export raises `ReplayDivergenceError`, the crash-only
// supervisor exits 1, and Fly restarts it — a loop, not a park. A warning on a process that is
// about to die in a loop is not a reading anyone gets to act on.
//
// So the world lane is HARD and everything else stays up: HTTP keeps serving (an operator can read
// /ready and /api/build-info, which is the whole point), the world is never started, no restart
// loop happens, and `/ready` is 503 with the stranded bodies NAMED.
// `CLARA_ALLOW_STRANDED_BODIES=1` is the explicit operator override.
// ---------------------------------------------------------------------------

test("ready: S5 — a REFUSED world start is a HARD readiness failure that NAMES the stranded bodies", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  _setBodyCensusForTest({ measured: true, stranded: 2, names: ["claraWork_v2"], worldStartRefused: true });
  try {
    const r = await checkReadiness();
    assert.equal(r.checks.bodies.world_start_refused, true, "the refusal is a reported FACT, not an inference from a missing heartbeat");
    assert.equal(r.checks.bodies.stranded, 2);
    assert.deepEqual(r.checks.bodies.names, ["claraWork_v2"]);
    assert.equal(r.ready, false, "the world lane is HARD here — this process cannot run the estate's parked work");
    assert.ok(
      r.warnings.some((w) => w.includes("claraWork_v2") && /refus/i.test(w)),
      `the failure NAMES the bodies and says the world was refused; got ${JSON.stringify(r.warnings)}`,
    );
    // Never a DSN, never raw database text — /ready is unauthenticated.
    assert.ok(!JSON.stringify(r).includes("postgres://"));
  } finally {
    _resetBodyCensusForTest();
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: S5 — the refusal fails readiness even when a heartbeat from the PREVIOUS process is still fresh", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  // The heartbeat row is shared estate state: a process that stopped seconds ago leaves a beat
  // that is still inside the staleness window. If the refusal were inferred from `checks.world`
  // alone, THIS is the window in which a refused process would report itself ready.
  await setBeat("world", "now()");
  await setBeat("control", "now()");
  _setBodyCensusForTest({ measured: true, stranded: 1, names: ["claraWork_v2"], worldStartRefused: true });
  try {
    const r = await checkReadiness();
    assert.equal(r.ready, false, "a fresh foreign heartbeat must not make a refused process look ready");
    assert.equal(r.checks.bodies.world_start_refused, true);
  } finally {
    _resetBodyCensusForTest();
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: S5 — a census with stranded bodies but NO refusal (the operator override) stays a WARNING", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  delete process.env.CLARA_START_WORLD;
  _setBodyCensusForTest({ measured: true, stranded: 3, names: ["claraWork_v2"], worldStartRefused: false });
  try {
    const r = await checkReadiness();
    assert.equal(r.checks.bodies.world_start_refused, false);
    assert.equal(r.ready, true, "CLARA_ALLOW_STRANDED_BODIES=1 keeps the old warning-only posture, deliberately and visibly");
    assert.ok(r.warnings.some((w) => w.includes("claraWork_v2")));
  } finally {
    _resetBodyCensusForTest();
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: S5 — plugins/startWorld.ts takes the census BEFORE it starts the world, and refuses rather than exiting", { skip }, async () => {
  // A SOURCE-SHAPE cell, in this file because this file owns the world-lane contract. The ORDER is
  // the whole fix: a census taken after `getWorld().start()` cannot prevent the boot re-enqueue
  // that raises ReplayDivergenceError, which is exactly what the first cut of #637 did
  // (fire-and-forget, after the start). No unit harness can boot a nitro plugin, so the order is
  // pinned textually and the BEHAVIOUR is pinned by the three cells above plus the two-build e2e.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../plugins/startWorld.ts", import.meta.url), "utf8");
  const censusAt = src.indexOf("strandedBodyCensusOnWorld(workflowBodies)");
  const startAt = src.indexOf("getWorld().start?.()");
  assert.ok(censusAt > 0, "the plugin takes the stranded-body census");
  assert.ok(startAt > 0, "…and starts the world");
  assert.ok(censusAt < startAt, "THE CENSUS COMES FIRST — after the start it cannot prevent the re-enqueue it exists to prevent");
  assert.match(src, /CLARA_ALLOW_STRANDED_BODIES/, "the explicit operator override exists");
  assert.match(src, /recordWorldStartRefused/, "…and the refusal is RECORDED so /ready can report it");
  // The refusal must NOT be a process exit: exiting is the restart loop this change removes. The
  // span examined is the CENSUS FUNCTION'S OWN body — not everything between the census call and
  // the world start, which now spans the whole plugin body and its unrelated `fatal()` helper
  // (that one SHOULD exit: a component settling unexpectedly is a genuine fault).
  const fnAt = src.indexOf("async function censusStrandedBodies");
  const fnEnd = src.indexOf("export default definePlugin");
  assert.ok(fnAt > 0 && fnEnd > fnAt, "the census is its own named function, above the plugin");
  assert.equal(
    /process\.exit/.test(src.slice(fnAt, fnEnd)),
    false,
    "the refusal returns; it never exits the process (HTTP must stay up to be readable)",
  );
  // …and the CALL SITE acts on it by returning out of the boot sequence rather than by exiting.
  assert.match(
    src,
    /if \(!\(await censusStrandedBodies\(\)\)\.mayStart\) return;/,
    "the boot sequence RETURNS on a refusal — no world, no lanes, HTTP still serving",
  );
});
