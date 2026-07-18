// The wake-intent drain (Slice 4, contract §4.4 / §3.1–3.4). The SECOND phase of
// the leader cycle: after routing has turned committed domain events into
// `wake_intents` (Slice 3), the drain turns each PENDING wake intent into the
// firm-visible consumption artifacts and marks it consumed — project-only, no
// autonomous LLM run (ruling 2).
//
// Split out of lib/relay.mjs (which stays byte-identical so every Slice-3 relay
// test still passes against a 0005-only DB) and wired into the leader loop by
// scripts/relay.mjs (RELAY_DRAIN=1) and scripts/serve.mjs. It touches 0006 tables
// (agent_tasks / wakes_outbox / the consumed columns) that do not exist under
// 0005, so it NEVER runs in the Slice-3 suite.
//
// Guarantees (mirroring the routing phase, proven in S4-P6):
//   * ONE transaction per batch; FOR UPDATE SKIP LOCKED so parallel leaders never
//     double-pick and a crash-mid-batch rolls the whole batch back.
//   * All three wake-bound decisions project UNIFORMLY: a held agent_tasks row +
//     a held wakes_outbox row, both ON CONFLICT DO NOTHING (the unique keys are
//     the dedupe ⇒ at-least-once delivery, exactly-once effect).
//   * Post-insert surviving-row identity asserts (benign diagnostic, never abort —
//     the routing-phase C3 precedent).
//   * An intent whose decision is somehow NOT wake-bound (impossible from routing,
//     defended anyway) is dead-lettered, never forged into a task.
//   * The intent flips pending→consumed last, inside the same txn.

import { setTimeout as sleep } from "node:timers/promises";
import { CONSUMER, isWakeBound, deadLetterEvent } from "./relay.mjs";

// A drained intent's consumed_by is the draining consumer's id — TEXT, like
// relay_checkpoints.consumer (0006 §3.1). The router is the sole consumer, so it
// stamps CONSUMER ('router'). The column grant is (status, consumed_by); the
// trigger derives consumed_at and requires consumed_by non-null.
const DEFAULT_BATCH = 100;

/**
 * Drain ONE batch of pending wake intents in a single transaction and commit.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{batchSize?:number, onlyFirm?:string|string[]|null, consumer?:string,
 *          consumedBy?:string, testDrainDelayMs?:number, log?:(m:string)=>void}} [opts]
 * @returns {Promise<{drained:number, tasks:number, outbox:number, deadLetters:number}>}
 */
export async function drainWakeIntents(client, opts = {}) {
  const {
    batchSize = DEFAULT_BATCH,
    onlyFirm = null,
    consumer = CONSUMER,
    consumedBy = CONSUMER,
    testDrainDelayMs = 0,
    log = () => {},
  } = opts;
  const firms = onlyFirm == null ? null : Array.isArray(onlyFirm) ? onlyFirm : [onlyFirm];

  await client.query("begin");
  try {
    const pending = await client.query(
      `select id, event_id, firm_id, event_seq, event_type, decision, taxonomy_version
         from clara.wake_intents
        where status = 'pending'
          and ($1::uuid[] is null or firm_id = any($1::uuid[]))
        order by firm_id, event_seq
        limit $2
        for update skip locked`,
      [firms, batchSize],
    );
    if (pending.rowCount === 0) {
      await client.query("rollback");
      return { drained: 0, tasks: 0, outbox: 0, deadLetters: 0 };
    }

    let tasks = 0;
    let outbox = 0;
    let deadLetters = 0;
    for (const it of pending.rows) {
      if (isWakeBound(it.decision)) {
        // Held task — the derivation trigger fills firm/client from intent→event
        // and pins kind/status. Targetless ON CONFLICT (the origin_intent_id unique
        // index is PARTIAL) makes it idempotent.
        await client.query(
          `insert into clara.agent_tasks (origin_intent_id, kind, status)
             values ($1, 'wake', 'held')
           on conflict do nothing`,
          [it.id],
        );
        // Held outbox row — the trigger derives condition from the intent's decision
        // (a caller-supplied condition is overwritten), so we insert only intent_id.
        await client.query(
          `insert into clara.wakes_outbox (intent_id, condition, status)
             values ($1, $2, 'held')
           on conflict (intent_id) do nothing`,
          [it.id, it.decision],
        );
        // Surviving-row identity asserts (post-ON-CONFLICT). A mismatch is a benign
        // diagnostic under at-least-once (log loudly, never abort — routing C3).
        const surv = await client.query(
          `select at.kind as task_kind, wo.condition as outbox_condition
             from clara.agent_tasks at
             left join clara.wakes_outbox wo on wo.intent_id = at.origin_intent_id
            where at.origin_intent_id = $1`,
          [it.id],
        );
        const row = surv.rows[0];
        if (!row || row.task_kind !== "wake" || row.outbox_condition !== it.decision) {
          log(
            `[drain] surviving-row mismatch intent=${it.id} expected=(wake,${it.decision}) ` +
              `got=(${row?.task_kind},${row?.outbox_condition})`,
          );
        }
        tasks += 1;
        outbox += 1;
      } else {
        // Not reachable from routing (which only stamps wake-bound intents); defend
        // by dead-lettering rather than forging a task, and still consume the intent.
        await deadLetterEvent(client, {
          consumer,
          eventId: it.event_id,
          reason: `drain: intent decision '${it.decision}' is not wake-bound`,
          version: it.taxonomy_version,
        });
        deadLetters += 1;
      }
      await client.query(
        `update clara.wake_intents set status = 'consumed', consumed_by = $2
           where id = $1 and status = 'pending'`,
        [it.id, consumedBy],
      );
    }

    // Test-only determinism knob: a delay INSIDE the txn, BEFORE commit, so a kill
    // test can SIGKILL reliably mid-batch (uncommitted ⇒ full rollback ⇒ replay).
    if (testDrainDelayMs > 0) {
      log(`DRAIN batch-delay-enter count=${pending.rowCount}`);
      await sleep(testDrainDelayMs);
    }

    await client.query("commit");
    return { drained: pending.rowCount, tasks, outbox, deadLetters };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead — nothing to clean up */
    }
    throw err;
  }
}

/**
 * Drain pending wake intents in batches until caught up or `maxDrainBatches` is
 * hit (bounded so one busy drain can never monopolise the leader loop). Returns
 * aggregate counts; the caller loops the whole cycle again when it wants more.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{maxDrainBatches?:number, batchSize?:number, onlyFirm?:string|string[]|null,
 *          consumer?:string, consumedBy?:string, testDrainDelayMs?:number,
 *          log?:(m:string)=>void}} [opts]
 */
export async function drainCycle(client, opts = {}) {
  const { maxDrainBatches = 8, ...rest } = opts;
  const batchSize = rest.batchSize ?? DEFAULT_BATCH;
  let batches = 0;
  let drained = 0;
  let tasks = 0;
  let outbox = 0;
  let deadLetters = 0;
  for (let i = 0; i < maxDrainBatches; i++) {
    const r = await drainWakeIntents(client, rest);
    if (r.drained === 0) break;
    batches += 1;
    drained += r.drained;
    tasks += r.tasks;
    outbox += r.outbox;
    deadLetters += r.deadLetters;
    if (r.drained < batchSize) break; // caught up
  }
  return { batches, drained, tasks, outbox, deadLetters, capped: drained > 0 && batches >= maxDrainBatches };
}
