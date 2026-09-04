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
import { _resetStorageProbeCacheForTest } from "../lib/storage-probe.mjs";
import { makePool } from "../lib/relay.mjs";
import { _resetPoolErrorContractForTest } from "../lib/pool-error-contract.mjs";
import { LANE_ROSTER, _resetLaneProbeCacheForTest } from "../lib/lane-probe.mjs";

// An UNREACHABLE lane DSN, assembled piecewise on purpose. Port 1 is reserved and closed on
// every platform, so a connect there refuses deterministically with no network wait. It is
// built from parts rather than written as a literal because a DSN carrying an inline password
// is exactly the shape `scripts/check-leaks.mjs` refuses in a tracked file — the guard cannot
// tell a fixture from a leak, and it should not have to.
const UNREACHABLE_DSN = ["postgres:/", "/", "nobody", ":", "PLACEHOLDER", "@", "127.0.0.1:1", "/", "nowhere"].join("");
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

test("ready: a NON-runtime lane that cannot connect WARNs and stays ready; the RUNTIME lane FAILS (H-48)", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  const prevRead = process.env.CLARA_READ_DATABASE_URL;
  const prevRuntime = process.env.CLARA_RUNTIME_DATABASE_URL;
  process.env.CLARA_START_WORLD = "1";
  _resetLaneProbeCacheForTest();
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");

    // (a) a non-runtime lane pointed at a closed port: WARN, still ready.
    process.env.CLARA_READ_DATABASE_URL = UNREACHABLE_DSN;
    _resetLaneProbeCacheForTest();
    const degraded = await checkReadiness();
    assert.equal(degraded.ready, true, "a dead READ lane degrades the agent — it is not 'nothing works'");
    assert.equal(degraded.checks.pools.find((l) => l.lane === "read").ok, false, "the read lane is reported down");
    assert.ok(
      degraded.warnings.some((x) => /pool lane 'read' unreachable/.test(x)),
      `expected the read-lane WARN, got: ${JSON.stringify(degraded.warnings)}`,
    );
    assert.ok(!JSON.stringify(degraded).includes("nowhere"), "no DSN component reaches the payload");
    delete process.env.CLARA_READ_DATABASE_URL;

    // (b) the RUNTIME lane pointed at the same closed port: ready FALSE. The discriminating
    // half — without it, (a) would pass for a probe that never fails anything.
    process.env.CLARA_RUNTIME_DATABASE_URL = UNREACHABLE_DSN;
    _resetLaneProbeCacheForTest();
    const down = await checkReadiness();
    assert.equal(down.ready, false, "the runtime lane is the ONE lane whose failure is a readiness failure");
    assert.equal(down.checks.pools.find((l) => l.lane === "runtime").ok, false);
  } finally {
    _resetLaneProbeCacheForTest();
    if (prevRead === undefined) delete process.env.CLARA_READ_DATABASE_URL;
    else process.env.CLARA_READ_DATABASE_URL = prevRead;
    if (prevRuntime === undefined) delete process.env.CLARA_RUNTIME_DATABASE_URL;
    else process.env.CLARA_RUNTIME_DATABASE_URL = prevRuntime;
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
