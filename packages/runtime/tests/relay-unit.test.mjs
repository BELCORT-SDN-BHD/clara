// Slice-3 relay — pure + small DB-backed units: routing decision map, the X4
// canonical-target split guard, monotonic checkpoint, dead-letter upsert.
// Contract: docs/plan/slice3-event-spine-contract.md §2.9.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isWakeBound,
  WAKE_BOUND_DECISIONS,
  NON_WAKE_DECISIONS,
  writeCheckpoint,
  deadLetterEvent,
  assertNoTargetSplit,
} from "../lib/relay.mjs";
import * as fx from "./relay-fixtures.mjs";
import { skip } from "./relay-testkit.mjs";

// ---------------------------------------------------------------------------
// Routing decision map (pure)
// ---------------------------------------------------------------------------

test("routing decision map: wake-bound vs checkpoint-only (pure)", { skip }, () => {
  assert.deepEqual([...WAKE_BOUND_DECISIONS].sort(), ["background_review", "internal_task", "notification"]);
  assert.deepEqual([...NON_WAKE_DECISIONS].sort(), ["context_update", "ignore"]);
  for (const d of WAKE_BOUND_DECISIONS) assert.equal(isWakeBound(d), true, `${d} is wake-bound`);
  for (const d of NON_WAKE_DECISIONS) assert.equal(isWakeBound(d), false, `${d} advances checkpoint only`);
  assert.equal(isWakeBound("nonsense"), false, "unknown decision never produces an intent");
});

// ---------------------------------------------------------------------------
// (X4) canonical-target split guard — env manipulation only, no real connection
// ---------------------------------------------------------------------------

test("(X4) assertNoTargetSplit: agreeing sources pass, disagreeing sources fail closed", () => {
  const keys = ["DATABASE_URL", "WORKFLOW_POSTGRES_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const set = (k, v) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  try {
    // A single source (PG*-only) never splits.
    for (const k of keys) delete process.env[k];
    process.env.PGHOST = "127.0.0.1";
    process.env.PGPORT = "5544";
    process.env.PGDATABASE = "clara_rt_test";
    assert.doesNotThrow(() => assertNoTargetSplit(), "PG*-only resolves one target");

    // DATABASE_URL agreeing with PG* — passes.
    process.env.DATABASE_URL = "postgres://postgres@127.0.0.1:5544/clara_rt_test";
    assert.doesNotThrow(() => assertNoTargetSplit(), "agreeing URL + PG* is one target");

    // DATABASE_URL pointing at a DIFFERENT db — fails closed.
    process.env.DATABASE_URL = "postgres://postgres@127.0.0.1:5544/some_other_db";
    assert.throws(() => assertNoTargetSplit(), /target split/i, "a db mismatch is refused");

    // A different host also splits.
    process.env.DATABASE_URL = "postgres://postgres@10.0.0.9:5544/clara_rt_test";
    assert.throws(() => assertNoTargetSplit(), /target split/i, "a host mismatch is refused");

    // Two URLs disagreeing (no PG*) — fails closed.
    for (const k of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER"]) delete process.env[k];
    process.env.DATABASE_URL = "postgres://postgres@127.0.0.1:5544/clara_rt_test";
    process.env.WORKFLOW_POSTGRES_URL = "postgres://postgres@127.0.0.1:5544/other";
    assert.throws(() => assertNoTargetSplit(), /target split/i, "two DSN vars disagreeing is refused");
  } finally {
    for (const [k, v] of Object.entries(saved)) set(k, v);
  }
});

// ---------------------------------------------------------------------------
// Monotonic checkpoint (a stale lower value never regresses it)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Dead-letter upsert / attempt_count
// ---------------------------------------------------------------------------

test("dead-letter upsert increments attempt_count, stamps firm/seq/type from the event", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("dl");
  await fx.pumpDocuments(owner, client, 1, "dl");
  const eventId = await fx.asRoot(async (c) => {
    const r = await c.query(
      "select id from clara.domain_events where firm_id = $1 and event_type = $2 order by seq limit 1",
      [firm, fx.WAKE_EVENT_TYPE],
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
  assert.equal(dls[0].eventType, fx.WAKE_EVENT_TYPE, "type derived from the event by the stamping trigger");
  assert.equal(dls[0].status, "pending");
});
