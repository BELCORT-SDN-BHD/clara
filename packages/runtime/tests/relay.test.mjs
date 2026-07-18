// Slice-3 relay acceptance + unit suite (contract §2.9.4 a–e + D3/D4 + units).
//
// ONE file on purpose: `node --test tests/` runs top-level tests within a file
// SEQUENTIALLY, so the cases that mutate GLOBAL state (the singleton taxonomy
// pointer) or hold the shared `router` advisory lock (the spawned runner) never
// overlap. Every relay here is FIRM-SCOPED (RELAY_ONLY_FIRM / onlyFirm) so it
// only ever drains its own fresh fixture firm — never the seed's or another
// lane's firms in the shared CI database.
//
// Target: clara_rt_test locally (PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres),
// the already-migrated clara_ci in CI. The tests NEVER reset/migrate; they build
// their own fresh fixtures per run and SKIP cleanly when the 0005 schema is
// absent. Every relay connection runs as clara_runtime (N10).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import {
  runRelayCycle,
  routeBatchForFirm,
  writeCheckpoint,
  deadLetterEvent,
  redrive,
  isWakeBound,
  WAKE_BOUND_DECISIONS,
  NON_WAKE_DECISIONS,
  TaxonomyHaltError,
  CONSUMER,
  makeClient,
} from "../lib/relay.mjs";
import * as fx from "./relay-fixtures.mjs";

const READY = await fx.probeReady();
const skip = READY ? false : "Slice-3 (0005) schema absent — migrate the target first";

after(async () => {
  await fx.endPool();
});

// ---------------------------------------------------------------------------
// Child-process (runner) harness — used only by the kill + split-brain cases.
// ---------------------------------------------------------------------------

const RELAY_SCRIPT = fileURLToPath(new URL("../scripts/relay.mjs", import.meta.url));
const RUNTIME_CWD = fileURLToPath(new URL("..", import.meta.url));

function spawnRelay(extraEnv = {}) {
  const child = spawn(process.execPath, [RELAY_SCRIPT], {
    cwd: RUNTIME_CWD,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { lines: [], stderr: [], exited: false, exitInfo: null };
  const wire = (stream, sink) => {
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        sink.push(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
  };
  wire(child.stdout, state.lines);
  wire(child.stderr, state.stderr);
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  return { child, state };
}

function hasLine(state, substr) {
  return state.lines.some((l) => l.includes(substr));
}

async function waitForLine(state, substr, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = state.lines.find((l) => l.includes(substr));
    if (hit) return hit;
    if (state.exited && !state.lines.some((l) => l.includes(substr))) {
      // Give the pipes a tick to flush any final buffered lines before failing.
      await sleep(50);
      const late = state.lines.find((l) => l.includes(substr));
      if (late) return late;
      throw new Error(
        `relay child exited (code=${state.exitInfo?.code} signal=${state.exitInfo?.signal}) ` +
          `before line "${substr}". stdout=[${state.lines.join(" | ")}] stderr=[${state.stderr.join(" | ")}]`,
      );
    }
    await sleep(40);
  }
  throw new Error(`timeout (${timeoutMs}ms) waiting for "${substr}". stdout=[${state.lines.join(" | ")}] stderr=[${state.stderr.join(" | ")}]`);
}

function waitExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const t = setTimeout(() => reject(new Error("timeout waiting for relay child exit")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Invoke the D3 redrive via the actual CLI (`relay.mjs redrive <id>`) and parse its JSON. */
function runRedriveCli(eventId, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RELAY_SCRIPT, "redrive", eventId], {
      cwd: RUNTIME_CWD,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("redrive CLI timeout"));
    }, 15000);
    child.on("exit", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`redrive CLI exit ${code}: ${err}`));
      const line = out.split("\n").map((s) => s.trim()).filter(Boolean).find((s) => s.startsWith("{"));
      if (!line) return reject(new Error(`redrive CLI produced no JSON: stdout=[${out}] stderr=[${err}]`));
      resolve(JSON.parse(line));
    });
  });
}

async function pollUntil(pred, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pred()) return;
    await sleep(200);
  }
  throw new Error(`pollUntil timeout (${timeoutMs}ms): ${label}`);
}

// ---------------------------------------------------------------------------
// In-process drain helpers (clara_runtime role).
// ---------------------------------------------------------------------------

const drainInProcess = (firm, opts = {}) =>
  fx.asRuntime((c) => runRelayCycle(c, { onlyFirm: firm, batchSize: 3, ...opts }));

/** Commit exactly `nBatches` batches for a firm in-process (deterministic progress). */
async function advanceBatches(firm, nBatches, batchSize = 3) {
  return fx.asRuntime(async (c) => {
    let last = (await fx.checkpointSeq(firm)) ?? 0;
    let done = 0;
    for (let i = 0; i < nBatches; i++) {
      const res = await routeBatchForFirm(c, { firmId: firm, lastSeq: last, batchSize, testBatchDelayMs: 0 });
      if (res.processed === 0) break;
      last = res.maxSeq;
      done += 1;
    }
    return done;
  });
}

/** Shared final assertions: exactly one intent per wake-bound event, no dupes/gaps. */
async function assertExactlyOnce(firm, expectedWakeBound) {
  const intents = await fx.wakeIntentsForFirm(firm);
  const wb = await fx.wakeBoundEventIds(firm);
  const av = await fx.activeTaxonomyVersion();

  assert.equal(intents.length, expectedWakeBound, `intent count == wake-bound event count (${expectedWakeBound})`);
  const ids = new Set(intents.map((i) => i.eventId));
  assert.equal(ids.size, intents.length, "no duplicate wake_intents (unique event_id)");
  assert.deepEqual(ids, new Set(wb.map((e) => e.id)), "intents cover exactly the wake-bound event set (no gaps, no extras)");
  for (const it of intents) assert.equal(it.taxonomyVersion, av, `intent stamped active taxonomy version ${av}`);

  assert.equal(await fx.checkpointSeq(firm), await fx.headSeq(firm), "checkpoint == firm head seq");
  assert.equal((await fx.deadLettersForFirm(firm)).length, 0, "zero dead-letters");
}

// ===========================================================================
// UNIT — routing decision mapping (pure)
// ===========================================================================

test("routing decision map: wake-bound vs checkpoint-only (pure)", { skip }, () => {
  assert.deepEqual([...WAKE_BOUND_DECISIONS].sort(), ["background_review", "internal_task", "notification"]);
  assert.deepEqual([...NON_WAKE_DECISIONS].sort(), ["context_update", "ignore"]);
  for (const d of WAKE_BOUND_DECISIONS) assert.equal(isWakeBound(d), true, `${d} is wake-bound`);
  for (const d of NON_WAKE_DECISIONS) assert.equal(isWakeBound(d), false, `${d} advances checkpoint only`);
  assert.equal(isWakeBound("nonsense"), false, "unknown decision never produces an intent");
});

// ===========================================================================
// UNIT — monotonic checkpoint (a stale lower value never regresses it)
// ===========================================================================

test("checkpoint upsert is monotonic (greatest wins, bootstraps a new row)", { skip }, async () => {
  const { firm } = await fx.buildFirm("ckpt");
  await fx.asRuntime(async (c) => {
    assert.equal(await fx.checkpointSeq(firm), null, "no checkpoint row yet");
    await writeCheckpoint(c, { firmId: firm, seq: 10 });
    assert.equal(await fx.checkpointSeq(firm), 10, "bootstrap insert");
    await writeCheckpoint(c, { firmId: firm, seq: 5 });
    assert.equal(await fx.checkpointSeq(firm), 10, "a stale lower value does NOT regress the checkpoint");
    await writeCheckpoint(c, { firmId: firm, seq: 15 });
    assert.equal(await fx.checkpointSeq(firm), 15, "a higher value advances it");
  });
});

// ===========================================================================
// UNIT — dead-letter upsert / attempt_count
// ===========================================================================

test("dead-letter upsert increments attempt_count, stamps firm/seq/type from the event", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("dl");
  await fx.pumpDocuments(owner, client, 1, "dl");
  const eventId = await fx.asRoot(async (c) => {
    const r = await c.query(
      "select id from clara.domain_events where firm_id = $1 and event_type = 'document.ingested' order by seq limit 1",
      [firm],
    );
    return r.rows[0].id;
  });

  await fx.asRuntime(async (c) => {
    await deadLetterEvent(c, { eventId, reason: "first", version: 1 });
    await deadLetterEvent(c, { eventId, reason: "second", version: 1 });
  });

  const dls = await fx.deadLettersForFirm(firm);
  assert.equal(dls.length, 1, "one dead-letter row (upsert, not a duplicate)");
  assert.equal(dls[0].eventId, eventId);
  assert.equal(dls[0].attemptCount, 2, "attempt_count incremented on re-attempt");
  assert.equal(dls[0].eventType, "document.ingested", "type derived from the event by the stamping trigger");
  assert.equal(dls[0].status, "pending");
});

// ===========================================================================
// (e) BOOTSTRAP — a brand-new firm (no checkpoint) with > one batch fully drains
// ===========================================================================

test("(e) bootstrap: brand-new firm, multi-batch, drains to checkpoint == head", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("boot");
  await fx.pumpDocuments(owner, client, 8, "boot"); // >> one batch of 3
  assert.equal(await fx.checkpointSeq(firm), null, "no checkpoint row before the first drain");

  const res = await drainInProcess(firm, { batchSize: 3 });
  assert.equal(res.firms, 1, "discovered exactly the scoped firm");

  await assertExactlyOnce(firm, 8);
});

// ===========================================================================
// (d) NOTIFY hygiene — a listener sees EMPTY payloads only, even cross-role
// ===========================================================================

test("(d) NOTIFY hygiene: clara_events payloads are always empty (N1)", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("notify");
  void firm;

  const listener = makeClient();
  await listener.connect();
  const payloads = [];
  try {
    // A WAKE-role session (N1's cross-role concern) still receives only empty bytes.
    await listener.query("set role clara_wake_proactive");
    listener.on("notification", (msg) => payloads.push(msg.payload));
    await listener.query("listen clara_events");

    await fx.pumpDocuments(owner, client, 5, "notify"); // each commit ⇒ NOTIFY ''
    // Force a round-trip so the socket is read and pending notifications flush.
    await listener.query("select 1");
    await sleep(200);
    await listener.query("select 1");

    assert.ok(payloads.length >= 1, `received at least one notification (got ${payloads.length})`);
    for (const p of payloads) assert.equal(p, "", "NOTIFY payload carries ZERO information bytes");
  } finally {
    await listener.end().catch(() => {});
  }
});

// ===========================================================================
// (c) ZERO-ACTIVE-POINTER — HALT loudly, checkpoint frozen, zero dead-letters
// ===========================================================================

test("(c) zero active pointer: relay HALTS, no advance, no dead-letters; restore drains", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("halt");
  await fx.pumpDocuments(owner, client, 4, "halt"); // pending work exists
  const origVersion = await fx.activeTaxonomyVersion();

  // Empty the singleton pointer as superuser (disable the user guard trigger so
  // the DELETE lands — allowed on this throwaway).
  await fx.rootQuery("alter table clara.taxonomy_active disable trigger user");
  await fx.rootQuery("delete from clara.taxonomy_active");

  try {
    const before = await fx.checkpointSeq(firm);
    let halted = null;
    try {
      await drainInProcess(firm, { batchSize: 3 });
    } catch (err) {
      halted = err;
    }
    assert.ok(halted instanceof TaxonomyHaltError, `HALTs with TaxonomyHaltError (got ${halted?.name}: ${halted?.message})`);
    assert.equal(await fx.checkpointSeq(firm), before, "checkpoint frozen (no advance past an un-routable state)");
    assert.equal((await fx.deadLettersForFirm(firm)).length, 0, "zero dead-letters while halted");
  } finally {
    // Restore the pointer + guard trigger.
    await fx.rootQuery("insert into clara.taxonomy_active (singleton, version) values (true, $1)", [origVersion]);
    await fx.rootQuery("alter table clara.taxonomy_active enable trigger user");
  }

  // Now it drains normally.
  await drainInProcess(firm, { batchSize: 3 });
  await assertExactlyOnce(firm, 4);
});

// ===========================================================================
// (f) REDRIVE + (D4) TAXONOMY FLIP — uncovered ⇒ dead-letter ⇒ cover ⇒ redrive;
//     batches straddling the repoint each carry exactly one version.
// ===========================================================================

test("(f) uncovered ⇒ dead-letter, redrive after coverage; flip stamps one version per batch", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("flip");
  const origVersion = await fx.activeTaxonomyVersion();
  const uncoveredType = `rig.uncovered.${Date.now().toString(36)}`;

  // ---- Phase v1: pump covered docs + emit ONE uncovered event -------------
  await fx.pumpDocuments(owner, client, 3, "flip-v1");
  await fx.rootQuery("insert into clara.event_types (name, client_scoped, description) values ($1, false, 'relay redrive test')", [
    uncoveredType,
  ]);
  // Emit the uncovered (firm-level) event via the fn-owner emission helper.
  await fx.asFnOwner((c) =>
    c.query(
      `select clara._append_event(
          p_firm => $1, p_type => $2, p_client => null, p_actor => $3,
          p_obo => null, p_wake_kind => null, p_entry => null, p_document => null,
          p_resolution => null, p_payload => '{}'::jsonb)`,
      [firm, uncoveredType, owner],
    ),
  );
  const uncoveredEventId = await fx.asRoot(async (c) => {
    const r = await c.query("select id from clara.domain_events where firm_id = $1 and event_type = $2 limit 1", [firm, uncoveredType]);
    return r.rows[0].id;
  });

  // Drain under v1: 3 doc intents (v1), the uncovered event dead-lettered, and the
  // checkpoint advances PAST the dead-lettered event.
  await drainInProcess(firm, { batchSize: 3 });
  {
    const intentsV1 = await fx.wakeIntentsForFirm(firm);
    assert.equal(intentsV1.length, 3, "3 wake intents from the covered docs");
    for (const it of intentsV1) assert.equal(it.taxonomyVersion, origVersion, "phase-v1 intents stamped v1");
    const dls = await fx.deadLettersForFirm(firm);
    assert.equal(dls.length, 1, "the uncovered event is dead-lettered");
    assert.equal(dls[0].eventId, uncoveredEventId);
    assert.equal(dls[0].status, "pending");
    assert.equal(await fx.checkpointSeq(firm), await fx.headSeq(firm), "checkpoint advanced past the dead-lettered event");
  }

  // ---- Add coverage: a NEW version covering everything + the uncovered type -
  const nextVersion = await fx.asRoot(async (c) => {
    const r = await c.query("select coalesce(max(version), 0) + 1 as v from clara.taxonomy_versions");
    return Number(r.rows[0].v);
  });
  await fx.rootQuery("insert into clara.taxonomy_versions (version, note) values ($1, $2)", [nextVersion, "relay flip test"]);
  await fx.rootQuery(
    "insert into clara.trigger_taxonomy (version, event_type, decision) select $1, event_type, decision from clara.trigger_taxonomy where version = $2",
    [nextVersion, origVersion],
  );
  await fx.rootQuery("insert into clara.trigger_taxonomy (version, event_type, decision) values ($1, $2, 'internal_task')", [
    nextVersion,
    uncoveredType,
  ]);
  // Repoint (the only legal mutation of the singleton pointer).
  await fx.rootQuery("update clara.taxonomy_active set version = $1 where singleton = true", [nextVersion]);

  try {
    // ---- Phase v2: pump more docs, drain under v2 -------------------------
    await fx.pumpDocuments(owner, client, 3, "flip-v2");
    await drainInProcess(firm, { batchSize: 3 });

    const intents = await fx.wakeIntentsForFirm(firm);
    const v1 = intents.filter((i) => i.taxonomyVersion === origVersion);
    const v2 = intents.filter((i) => i.taxonomyVersion === nextVersion);
    assert.equal(v1.length, 3, "the phase-v1 batch's intents still carry exactly v1");
    assert.equal(v2.length, 3, "the phase-v2 batch's intents carry exactly v2 (one version per batch, D4)");
    assert.equal(intents.length, 6, "no batch mixed versions");

    // ---- Redrive the dead-lettered event under the now-covering v2 --------
    // First redrive via the CLI (D3 requires it be CLI-invokable).
    const res1 = await runRedriveCli(uncoveredEventId);
    assert.deepEqual(res1, { resolved: true, decision: "internal_task", wakeBound: true });

    const afterRedrive = await fx.wakeIntentsForFirm(firm);
    const forEvent = afterRedrive.filter((i) => i.eventId === uncoveredEventId);
    assert.equal(forEvent.length, 1, "the redriven intent appears EXACTLY once");
    assert.equal(forEvent[0].decision, "internal_task");
    assert.equal(forEvent[0].taxonomyVersion, nextVersion, "redriven intent stamped the active (v2) version");
    const dlNow = (await fx.deadLettersForFirm(firm)).find((d) => d.eventId === uncoveredEventId);
    assert.equal(dlNow.status, "resolved", "the dead-letter is marked resolved");

    // Redrive again — idempotent (still exactly one intent, still resolved).
    const res2 = await fx.asRuntime((c) => redrive(c, CONSUMER, uncoveredEventId));
    assert.equal(res2.resolved, true);
    assert.equal((await fx.wakeIntentsForFirm(firm)).filter((i) => i.eventId === uncoveredEventId).length, 1, "redrive is idempotent");
  } finally {
    // Restore the global pointer so later tests run under the original version.
    await fx.rootQuery("update clara.taxonomy_active set version = $1 where singleton = true", [origVersion]);
  }
});

// ===========================================================================
// (a) KILL-MID-STREAM — the slice's acceptance gate
// ===========================================================================

test("(a) kill-mid-stream: repeated SIGKILL mid-batch ⇒ exactly-once, no gaps, checkpoint == head", { skip }, async (t) => {
  t.diagnostic("this case spawns the runner and SIGKILLs it repeatedly; ~30-60s");
  const { firm, owner, client } = await fx.buildFirm("kill");
  const docTotal = 30;
  await fx.pumpDocuments(owner, client, docTotal, "kill");

  // Each iteration: commit ONE more batch in-process (deterministic mid-stream
  // progress), then spawn the runner, let it ENTER a batch (delay knob), and
  // SIGKILL it before it can commit — proving an interrupted batch commits
  // nothing and replays cleanly.
  const KILLS = 6;
  for (let i = 0; i < KILLS; i++) {
    await advanceBatches(firm, 1);
    const r = spawnRelay({
      RELAY_ONLY_FIRM: firm,
      RELAY_BATCH_SIZE: "3",
      RELAY_TEST_BATCH_DELAY_MS: "300",
    });
    await waitForLine(r.state, "batch-delay-enter", 20000);
    r.child.kill("SIGKILL");
    await waitExit(r.child, 10000);
    await sleep(250); // let the backend detect the drop + release row locks
  }

  // A final clean run drains everything; poll the DB to head, then stop it.
  const head = await fx.headSeq(firm);
  const fin = spawnRelay({ RELAY_ONLY_FIRM: firm, RELAY_BATCH_SIZE: "3" });
  await waitForLine(fin.state, "leader-acquired", 15000);
  await pollUntil(async () => (await fx.checkpointSeq(firm)) === head, 30000, "final drain reaches head");
  fin.child.kill("SIGKILL");
  await waitExit(fin.child, 10000);

  await assertExactlyOnce(firm, docTotal);
});

// ===========================================================================
// (b) SPLIT-BRAIN — the leader lock blocks the second instance; clean takeover
// ===========================================================================

test("(b) split-brain: second instance blocks on the leader lock, takes over on leader death", { skip }, async (t) => {
  t.diagnostic("two runner instances race the same stream; ~15-40s");
  const { firm, owner, client } = await fx.buildFirm("split");
  const docTotal = 12;
  await fx.pumpDocuments(owner, client, docTotal, "split");

  // Instance 1 acquires leadership and drains slowly (delay knob).
  const one = spawnRelay({ RELAY_ONLY_FIRM: firm, RELAY_BATCH_SIZE: "3", RELAY_TEST_BATCH_DELAY_MS: "200" });
  await waitForLine(one.state, "leader-acquired", 15000);

  // Instance 2 starts but must BLOCK on the advisory lock — it must NOT process.
  const two = spawnRelay({ RELAY_ONLY_FIRM: firm, RELAY_BATCH_SIZE: "3" });
  await waitForLine(two.state, "RELAY starting", 15000);
  await sleep(1500);
  assert.equal(hasLine(two.state, "leader-acquired"), false, "the second instance is blocked on the leader lock (not processing)");
  assert.equal(two.state.exited, false, "the second instance is alive, waiting for leadership");

  // Kill the leader; instance 2 must take over and finish correctly.
  one.child.kill("SIGKILL");
  await waitExit(one.child, 10000);
  await waitForLine(two.state, "leader-acquired", 20000);

  const head = await fx.headSeq(firm);
  await pollUntil(async () => (await fx.checkpointSeq(firm)) === head, 30000, "takeover drains to head");
  two.child.kill("SIGKILL");
  await waitExit(two.child, 10000);

  await assertExactlyOnce(firm, docTotal);
});
