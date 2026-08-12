// Slice-3 relay — the spawned runner: (X2) reconnect + non-zero HALT exit, (a)
// kill-mid-stream [gate], (b) split-brain. These hold the shared `router`
// advisory lock and/or mutate the global pointer, so the whole suite runs with
// --test-concurrency=1. Contract: docs/plan/completed/slice3-event-spine-contract.md §2.9.

import { test } from "node:test";
import assert from "node:assert/strict";

import * as fx from "./relay-fixtures.mjs";
import {
  skip,
  spawnRelay,
  hasLine,
  waitForLine,
  waitForCount,
  waitExit,
  pollUntil,
  advanceBatches,
  assertExactlyOnce,
  sleep,
} from "./relay-testkit.mjs";

// ===========================================================================
// (X2) RECONNECT — the runner survives a killed connection and resumes draining
// ===========================================================================

test("(X2) reconnect: a terminated backend ⇒ the runner reconnects and resumes to head", { skip }, async (t) => {
  t.diagnostic("terminates the runner's backend mid-drain via pg_terminate_backend; ~10-30s");
  const { firm, owner, client } = await fx.buildFirm("recon");
  const docTotal = 24;
  await fx.pumpDocuments(owner, client, docTotal, "recon");

  const r = spawnRelay({ RELAY_ONLY_FIRM: firm, RELAY_BATCH_SIZE: "3", RELAY_TEST_BATCH_DELAY_MS: "80" });
  const pidLine = await waitForLine(r.state, "RELAY backend-pid", 15000);
  const pid1 = Number(pidLine.split("backend-pid")[1].trim());
  await waitForLine(r.state, "leader-acquired", 15000);
  // X3: the test-only knobs are honored only because test mode is on, logged loudly.
  assert.ok(hasLine(r.state, "TEST-MODE active"), "runner logs TEST-MODE loudly when RELAY_TEST_MODE=1");

  // Kill the runner's DB session from a second connection.
  await fx.rootQuery("select pg_terminate_backend($1)", [pid1]);

  // It must reconnect (a SECOND leader-acquired) and drain the remaining events.
  await waitForCount(r.state, "RELAY leader-acquired", 2, 25000);
  const head = await fx.headSeq(firm);
  await pollUntil(async () => (await fx.checkpointSeq(firm)) === head, 30000, "resume drains to head");
  r.child.kill("SIGKILL");
  await waitExit(r.child, 10000);

  await assertExactlyOnce(firm, docTotal);
});

// ===========================================================================
// (X2) HALT exits non-zero — supervision must see an un-routable state
// ===========================================================================

test("(X2) HALT exits non-zero: a missing active pointer ⇒ the runner exits code 2", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("haltexit");
  await fx.pumpDocuments(owner, client, 3, "he"); // pending work so a cycle runs
  const origVersion = await fx.activeTaxonomyVersion();

  await fx.rootQuery("alter table clara.taxonomy_active disable trigger user");
  await fx.rootQuery("delete from clara.taxonomy_active");
  try {
    const r = spawnRelay({ RELAY_ONLY_FIRM: firm, RELAY_BATCH_SIZE: "3" });
    await waitExit(r.child, 15000);
    assert.equal(r.state.exitInfo.code, 2, "HALT exits with a NON-ZERO code (2) for supervision");
    assert.ok(hasLine(r.state, "RELAY HALT"), "logged the HALT loudly");
  } finally {
    await fx.rootQuery("insert into clara.taxonomy_active (singleton, version) values (true, $1)", [origVersion]);
    await fx.rootQuery("alter table clara.taxonomy_active enable trigger user");
  }
});

// ===========================================================================
// (a) KILL-MID-STREAM — the slice's acceptance gate
// ===========================================================================

test("(a) kill-mid-stream: repeated SIGKILL mid-batch ⇒ exactly-once, no gaps, checkpoint == head", { skip }, async (t) => {
  t.diagnostic("spawns the runner and SIGKILLs it repeatedly mid-batch; ~30-60s");
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
    const r = spawnRelay({ RELAY_ONLY_FIRM: firm, RELAY_BATCH_SIZE: "3", RELAY_TEST_BATCH_DELAY_MS: "300" });
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
  assert.equal(
    two.state.lines.some((l) => l.includes("leader-acquired")),
    false,
    "the second instance is blocked on the leader lock (not processing)",
  );
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
