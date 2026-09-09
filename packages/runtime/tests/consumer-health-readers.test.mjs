// #617 / PR #686 — THE PER-FIRM AND PER-ROW READERS, PINNED AGAINST THE ESTATE COLUMNS THEY SHARE
// THEIR SQL WITH.
//
// WHY THIS FILE EXISTS. Six consumer suites used to assert their own #617 contribution as an
// ESTATE DELTA (`after.firmsUncheckpointed - before.firmsUncheckpointed === 1`). CI runs
// `pnpm -r --if-present test` — the db, web and runtime packages CONCURRENTLY against ONE Postgres
// — and `clara.firm_event_seq` is shared by every consumer and every suite, so those deltas were
// also counting firms other suites created between the two reads: PR #686 failed one at
// `4 !== 1`. Those cells now assert the PER-FIRM / PER-ROW category (`relayFirmCategory` /
// `deadLetterCategory`, lib/consumer-health.mjs) plus direction-only estate checks that concurrent
// noise can only strengthen.
//
// That trade is only honest while the reader and the column classify the same state the same way.
// The readers are built from the column's own SQL text for exactly that reason, and THIS file is
// the cell that proves the two agree in behaviour, so a future edit cannot quietly move one and
// leave six suites passing against a /ready that has drifted away underneath them.
//
// HOW THE COMPARISON IS MADE EXACT WITHOUT BECOMING THE RACE IT REPLACES. Every dead-letter and
// checkpoint predicate filters on `consumer = $1`, so under a PRIVATE consumer name — one no other
// suite and no production consumer uses — those estate counts are this cell's rows and nothing
// else's, and can be asserted absolutely. The one count a private name cannot isolate is
// `firmsUncheckpointed`, whose outer relation is every firm in the estate; it is therefore compared
// against the firm total read IN THE SAME SNAPSHOT (a repeatable-read transaction): a consumer that
// has never checkpointed anything must call EVERY firm not-yet-measured, and after one checkpoint,
// every firm BUT that one. Both statements stay true however many firms a concurrent suite creates.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as rig from "./rig.mjs";
import { deadLetterCategory, relayConsumerHealth, relayFirmCategory } from "../lib/consumer-health.mjs";
import { wakeEngineDeadLetterCategory, wakeEngineHealth } from "../lib/wake-engine.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

/** An arbitrary cap for the probe consumer: these cells are about the PREDICATES agreeing, and the
 *  cap is a parameter of both, so any value proves it as long as both readings are given this one. */
const CAP = 5;

/** A consumer name nobody else uses — see the header: this is what makes the per-consumer estate
 *  counts exact instead of a fixture of whatever else has run. */
const probeConsumer = () => `probe617_${randomUUID().slice(0, 8)}`;

after(async () => {
  await rig.endPool();
});

/** The three readings taken in ONE repeatable-read snapshot: the estate columns, this firm's own
 *  category, and the firm total the not-yet-measured column aggregates over. Read committed would
 *  give each statement its own snapshot, and a firm born in a concurrent suite between two of them
 *  is precisely the noise this file exists to be immune to. */
async function snapshot(client, consumer, firmId) {
  await client.query("begin isolation level repeatable read");
  try {
    const totalFirms = (await client.query("select count(*)::int as n from clara.firm_event_seq")).rows[0].n;
    const estate = await relayConsumerHealth(client, consumer, CAP);
    const mine = await relayFirmCategory(client, consumer, firmId);
    return { totalFirms, estate, mine };
  } finally {
    // A commit on an aborted transaction rolls it back; either way the checkout goes back to the
    // pool with no open transaction (withActor's RESET ALL does not end one).
    await client.query("commit");
  }
}

test("#617 relayFirmCategory and the estate columns are two readings of ONE state, not two answers", { skip }, async () => {
  const consumer = probeConsumer();
  const { firm } = await rig.buildFirm("chr617a");
  const head = await rig.headSeq(firm);
  assert.ok(head >= 1, "mandatory setup: buildFirm's own firm/client creation events put the firm in firm_event_seq");

  // NOT-YET-MEASURED, from both sides.
  const before = await rig.asRuntime((c) => snapshot(c, consumer, firm));
  assert.deepEqual(
    { hasEvents: before.mine.hasEvents, checkpointed: before.mine.checkpointed },
    { hasEvents: true, checkpointed: false },
    "the reader: this firm has a stream row and this consumer has never checkpointed it",
  );
  assert.equal(before.estate.firmsTracked, 0, "the column: a consumer that has never run tracks nothing (private name ⇒ exact)");
  assert.equal(
    before.estate.firmsUncheckpointed,
    before.totalFirms,
    "and therefore calls EVERY firm in the estate not-yet-measured — the same verdict the reader gave for this one",
  );
  assert.equal(
    before.mine.lag,
    head,
    "while lag reports the firm's ENTIRE history: a missing checkpoint reads as last_seq 0, which is the ambiguity firmsUncheckpointed exists to resolve",
  );

  // The checkpoint — the only estate change possible under a consumer name nobody else uses.
  await rig.rootQuery("insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ($1, $2, $3)", [consumer, firm, head]);

  const after_ = await rig.asRuntime((c) => snapshot(c, consumer, firm));
  assert.deepEqual(
    { hasEvents: after_.mine.hasEvents, checkpointed: after_.mine.checkpointed },
    { hasEvents: true, checkpointed: true },
    "the reader: the firm has left the not-yet-measured category",
  );
  assert.equal(after_.estate.firmsTracked, 1, "the column: exactly this firm is tracked");
  assert.equal(
    after_.estate.firmsUncheckpointed,
    after_.totalFirms - 1,
    "and every firm BUT this one is still not-yet-measured — reader and column moved the SAME firm, in one step",
  );
  assert.equal(after_.mine.lag, 0, "at head the firm contributes nothing to the shared lag sum");

  // THE DISCRIMINATING HALF. Without it every assertion above would also pass for a reader that
  // answered `hasEvents: true` unconditionally — a firm id with no stream row at all is outside the
  // not-yet-measured column's outer relation, which is a THIRD state, distinct from both categories.
  const stranger = await rig.asRuntime((c) => relayFirmCategory(c, consumer, randomUUID()));
  assert.deepEqual(
    stranger,
    { hasEvents: false, checkpointed: false, lag: 0 },
    "a firm id with no stream row is in NEITHER category and contributes no lag",
  );
});

test("#617 deadLetterCategory and the estate dead-letter columns agree in ALL FOUR states", { skip }, async () => {
  const consumer = probeConsumer();
  const { firm } = await rig.buildFirm("chr617b");
  // Any real event of this firm's own stream carries the dead-letter row (the 0005 stamping trigger
  // derives firm/seq/type from it). A raw relay-infra seed — never a books/event insert.
  const eventId = (await rig.rootQuery("select id from clara.domain_events where firm_id=$1 order by seq desc limit 1", [firm])).rows[0].id;
  const category = () => rig.asRuntime((c) => deadLetterCategory(c, consumer, eventId, CAP));
  const columns = async () => {
    const h = await rig.asRuntime((c) => relayConsumerHealth(c, consumer, CAP));
    assert.equal(h.pendingDeadLetters, h.deadLetters.pending, "the compatibility field mirrors the pending total in every state");
    return { pending: h.deadLetters.pending, exhausted: h.deadLetters.exhausted };
  };

  // ABSENT first, and it can only be first: 0005's _tf_dead_letter_update raises CLR08 on DELETE,
  // so a dead letter that exists cannot be made to not exist again.
  assert.equal(await category(), "absent", "no row for (consumer, event) ⇒ absent, never a fabricated zero-attempt pending");
  assert.deepEqual(await columns(), { pending: 0, exhausted: 0 }, "and both columns are empty for this consumer");

  await rig.rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version, attempt_count)
       values ($1, $2, 'agreement probe #617', null, $3)`,
    [consumer, eventId, CAP - 1],
  );
  assert.equal(await category(), "pending", "one attempt short of the cap the row is still inside its retry budget");
  assert.deepEqual(await columns(), { pending: 1, exhausted: 0 }, "which is exactly what the two columns say about it");

  await rig.rootQuery("update clara.relay_dead_letters set attempt_count = $3 where consumer = $1 and event_id = $2", [consumer, eventId, CAP]);
  assert.equal(await category(), "exhausted", "AT the cap retrying has stopped: the row is GIVEN UP ON and needs an operator redrive");
  assert.deepEqual(
    await columns(),
    { pending: 1, exhausted: 1 },
    "and it is STILL pending — exhausted is a SUBSET of pending, so the two counts are never subtracted from each other",
  );

  await rig.rootQuery("update clara.relay_dead_letters set status = 'resolved', resolved_at = now() where consumer = $1 and event_id = $2", [
    consumer,
    eventId,
  ]);
  assert.equal(await category(), "resolved", "a redriven row is neither backlog nor given-up-on");
  assert.deepEqual(await columns(), { pending: 0, exhausted: 0 }, "and both columns drop it — the attempt_count it still carries is history");
});

test("#617 wakeEngineDeadLetterCategory compares against the SAME per-source cap text as the engine's own column", async () => {
  // NO DB. wake_engine's cap is per SOURCE (clara.wake_engine_sources.max_attempts), so its
  // per-row reader cannot take `deadLetterCategory`'s `$2`; what keeps the two from drifting is
  // that the reader and the estate column interpolate ONE cap expression. This cell reads the two
  // generated statements and pins that they still carry the same text — the behavioural arms (at
  // the source's own cap, and at the fallback for a retired source) live in wake-engine.test.mjs
  // beside the registry ceremony they need.
  const captureSql = async (fn) => {
    let sql = "";
    const client = {
      query: (s) => {
        sql = s;
        return { rows: [], rowCount: 0 };
      },
    };
    // The health read's row mapper has no row to map on a stub client; the SQL is already captured.
    await fn(client).catch(() => {});
    return sql;
  };
  const health = await captureSql((c) => wakeEngineHealth(c));
  const perRow = await captureSql((c) => wakeEngineDeadLetterCategory(c, randomUUID()));

  const from = perRow.indexOf("dl.attempt_count >= ");
  const to = perRow.indexOf(" as exhausted");
  assert.ok(from > 0 && to > from, "mandatory setup: the reader's exhausted arm is where this cell thinks it is");
  const capComparison = perRow.slice(from, to);
  assert.ok(
    capComparison.includes("clara.wake_engine_sources"),
    "the reader's cap IS the per-source lookup, not a module constant — otherwise it would agree with the wrong number",
  );
  assert.ok(
    health.includes(capComparison),
    "and the estate column compares against that very text: one cap definition, one exhausted shape, two readings",
  );
});
