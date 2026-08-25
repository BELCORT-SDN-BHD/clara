// The wake-execution engine — Gate G1's universal wake consumer (design docs/plan/active/
// g1-wake-engine-{survey,design,annexes}.md, owner ruling 2026-08-25, mechanism (b)). A FOURTH
// registered spine consumer beside the router + matcher + autodraft, reusing lib/relay.mjs's
// discovery/checkpoint/dead-letter primitives UNCHANGED (they already take a `consumer`) —
// mirrors packages/runtime/lib/autodraft.mjs's shape line-for-line: own consumer name, own
// advisory lock, own (consumer,firm) checkpoint, own /ready WARN health, own reconnect-backoff
// loop. It mints no new `agent_tasks.kind` and touches no producer-side code (routing/drain).
//
// TWO CARRIER SHAPES, a closed world of two (design §1.2, never a third):
//   1. wake_outbox  — held agent_tasks(kind='wake') rows, discovered via the SAME checkpoint
//      cursor (consumer,firm_id)->last_seq that discoverWork/writeCheckpoint already own,
//      ordered by wake_intents.event_seq (the same domain_events.seq space — no new sequence).
//   2. direct_queue — queued agent_tasks(kind=<source.task_kind>) rows (today: only close_prep),
//      scanned independently per enabled source; no checkpoint cursor at all (no domain event
//      backs a direct_queue row).
//
// WHY THE CHECKPOINT NEVER ADVANCES PAST AN UNCLAIMABLE wake_outbox ROW (a deliberate build-time
// reading of Annex C's pseudocode, recorded here because the annex's own "continue" line is
// genuinely ambiguous between two shapes with different correctness properties — see the battery
// cell D4, "enabling a source claims it on the VERY NEXT cycle, no restart required"). If the
// checkpoint advanced past a row whose source is absent/disabled, THAT SPECIFIC ROW would become
// permanently unreachable to future engine cycles the instant a LATER row's checkpoint write
// passed it (writeCheckpoint uses greatest(), so any later success drags the cursor forward) —
// silently breaking D4's guarantee. So a wake_outbox row whose source cannot be claimed BLOCKS
// that firm's carrier-1 processing for THIS CYCLE ONLY (checkpoint stays put; every OTHER firm's
// round still runs) and is retried next cycle — structurally identical to autodraft.mjs's own
// `retry_pending_settlement` deferral shape (a live, accepted precedent in this estate, not a
// novel mechanism). The row's held state is never hidden: wakeEngineHealth's `heldForDisabledSource`
// independently re-counts it every health check, regardless of checkpoint position.
//
// Connections come from the environment ONLY, via pools.makeRuntimeClient (the autodraft idiom).

import { setTimeout as sleep } from "node:timers/promises";
import { discoverWork, writeCheckpoint, acquireLeaderLock, setRuntimeRole } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

/** The wake-engine consumer name — its own checkpoint / dead-letter / lock key. */
export const WAKE_ENGINE_CONSUMER = "wake_engine";

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;
const POLL_INTERVAL_MS = Number(process.env.CLARA_WAKE_ENGINE_POLL_MS || 2000);
const DEFAULT_TTL = process.env.CLARA_WAKE_ENGINE_CREDENTIAL_TTL || "00:15:00";

// ---------------------------------------------------------------------------
// Registry read — re-read EVERY cycle, never cached (design §1.2c / battery D4).
// ---------------------------------------------------------------------------

/** Enabled sources, split by carrier and keyed for O(1) lookup at claim time. */
export async function loadEnabledSources(client) {
  const r = await client.query(
    `select source_key, carrier, event_type, task_kind, wake_kind, workflow_export,
            login_pool, max_attempts
       from clara.wake_engine_sources
      where enabled`,
  );
  const byEventType = new Map(); // carrier='wake_outbox', keyed on event_type
  const directQueue = []; // carrier='direct_queue' rows
  for (const row of r.rows) {
    const source = {
      sourceKey: row.source_key,
      carrier: row.carrier,
      eventType: row.event_type,
      taskKind: row.task_kind,
      wakeKind: row.wake_kind,
      workflowExport: row.workflow_export,
      loginPool: row.login_pool,
      maxAttempts: Number(row.max_attempts),
    };
    if (row.carrier === "wake_outbox") byEventType.set(row.event_type, source);
    else directQueue.push(source);
  }
  return { byEventType, directQueue };
}

// ---------------------------------------------------------------------------
// Dead-letter homes — TWO, one per carrier, each in its own lane (Annex D8). Own txn each
// (survives the caller's rollback), mirroring autodraft.mjs's recordAutodraftDeadLetter.
// ---------------------------------------------------------------------------

async function recordEventDeadLetter(client, { eventId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
         values ($1, $2, $3, null)
       on conflict (consumer, event_id) do update
         set attempt_count = clara.relay_dead_letters.attempt_count + 1
       returning attempt_count`,
      [WAKE_ENGINE_CONSUMER, eventId, String(reason).slice(0, 500)],
    );
    await client.query("commit");
    return Number(r.rows[0].attempt_count);
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    throw err;
  }
}

async function recordTaskDeadLetter(client, { taskId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.wake_engine_task_dead_letters (consumer, task_id, reason)
         values ($1, $2, $3)
       on conflict (consumer, task_id) do update
         set attempt_count = clara.wake_engine_task_dead_letters.attempt_count + 1
       returning attempt_count`,
      [WAKE_ENGINE_CONSUMER, taskId, String(reason).slice(0, 500)],
    );
    await client.query("commit");
    return Number(r.rows[0].attempt_count);
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Carrier 1 — wake_outbox. FOR UPDATE SKIP LOCKED is belt-and-braces (design §1.2a): the
// advisory lock is the primary exclusion (single leader per consumer); SKIP LOCKED defends
// against a leadership-transition double-pick window, mirroring drain.mjs's own precedent.
// ---------------------------------------------------------------------------

// FOR UPDATE OF at (not a bare FOR UPDATE): this query JOINS agent_tasks/wake_intents/
// domain_events, and Postgres's default FOR UPDATE locks EVERY joined table's rows unless
// scoped with OF — clara_runtime holds only SELECT on domain_events (an append-only spine
// table, correctly never UPDATE-granted), so an unscoped FOR UPDATE here fails 42501
// "permission denied for table domain_events". Scoping to the ONE row this claim actually
// needs to lock (agent_tasks) is also the more honest intent: wake_intents/domain_events are
// read-only references at claim time, never mutated by this statement.
async function readHeldWakeRows(client, { firmId, lastSeq, batchSize }) {
  const r = await client.query(
    `select at.id as task_id, at.origin_intent_id, at.client_id,
            wi.event_id, wi.event_seq, de.event_type
       from clara.agent_tasks at
       join clara.wake_intents wi on wi.id = at.origin_intent_id
       join clara.domain_events de on de.id = wi.event_id
      where at.kind = 'wake' and at.status = 'held' and de.firm_id = $1
        and wi.event_seq > $2
      order by wi.event_seq
      limit $3
      for update of at skip locked`,
    [firmId, lastSeq, batchSize],
  );
  return r.rows.map((row) => ({
    taskId: row.task_id,
    intentId: row.origin_intent_id,
    clientId: row.client_id,
    eventId: row.event_id,
    eventSeq: Number(row.event_seq),
    eventType: row.event_type,
  }));
}

/** One held row's claim: mint credential + held->running + checkpoint, ONE transaction. */
async function claimWakeOutboxRow(client, { row, source, firmId }) {
  await client.query("begin");
  try {
    const cred = await client.query(
      "select credential_id, secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)",
      [source.wakeKind, firmId, null, DEFAULT_TTL, row.clientId],
    );
    await client.query("update clara.agent_tasks set status='running' where id=$1", [row.taskId]);
    await writeCheckpoint(client, { consumer: WAKE_ENGINE_CONSUMER, firmId, seq: row.eventSeq });
    await client.query("commit");
    return { ok: true, credential: cred.rows[0] };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    return { ok: false, err };
  }
}

/** Walk one firm's held wake_outbox rows in event_seq order. Stops (never advances the
 *  checkpoint past) the first row whose source is absent/disabled or still retrying — see the
 *  module header for why. Poisoned rows (repeated claim failure) dead-letter and skip past
 *  ONLY once max_attempts is exhausted, exactly like autodraft.mjs's own poison-skip. */
async function processWakeOutboxFirm(client, { firmId, lastSeq, batchSize, sources, deps }) {
  const log = deps.log ?? (() => {});
  const enqueue = deps.enqueue ?? (async () => {});
  const counts = { claimed: 0, dispatched: 0, failed: 0, deadLettered: 0 };
  const rows = await readHeldWakeRows(client, { firmId, lastSeq, batchSize });
  if (rows.length === 0) return { maxSeq: lastSeq, blocked: false, counts, readCount: 0 };

  let cursor = lastSeq;
  for (const row of rows) {
    const source = sources.byEventType.get(row.eventType);
    if (!source) {
      // Unregistered/disabled source: BLOCK this firm's carrier-1 processing this cycle (see
      // module header). Nothing is wrong — the source simply has not shipped/enabled yet.
      return { maxSeq: cursor, blocked: true, counts, readCount: rows.length };
    }
    const res = await claimWakeOutboxRow(client, { row, source, firmId });
    if (res.ok) {
      cursor = row.eventSeq;
      counts.claimed += 1;
      try {
        await enqueue(source.workflowExport, row.taskId, res.credential);
        counts.dispatched += 1;
      } catch (e) {
        log(`[wake-engine] enqueue failed task=${row.taskId} source=${source.sourceKey} (reconciler will re-enqueue): ${e?.message ?? e}`);
      }
      continue;
    }
    // Claim failed (mint refusal, transient DB error, …) — dead-letter + poison-skip.
    const attempts = await recordEventDeadLetter(client, { eventId: row.eventId, reason: res.err?.message ?? String(res.err) });
    if (attempts >= source.maxAttempts) {
      log(`[wake-engine] event=${row.eventId} source=${source.sourceKey} exhausted ${source.maxAttempts} attempts -> dead-lettered + skipped: ${res.err?.message ?? res.err}`);
      await writeCheckpoint(client, { consumer: WAKE_ENGINE_CONSUMER, firmId, seq: row.eventSeq });
      cursor = row.eventSeq;
      counts.deadLettered += 1;
      continue;
    }
    counts.failed += 1;
    log(`[wake-engine] claim-error event=${row.eventId} source=${source.sourceKey} attempt=${attempts}/${source.maxAttempts}: ${res.err?.message ?? res.err}`);
    return { maxSeq: cursor, blocked: true, counts, readCount: rows.length }; // retry next cycle
  }
  return { maxSeq: cursor, blocked: false, counts, readCount: rows.length };
}

// ---------------------------------------------------------------------------
// Carrier 2 — direct_queue (today: close_prep only, disabled at ship). No checkpoint cursor —
// each enabled source's own (task_kind, firm) is scanned independently every cycle, so one
// disabled/poisoned direct_queue source can never head-of-line-block another.
// ---------------------------------------------------------------------------

async function processDirectQueueSource(client, { firmId, source, batchSize, deps }) {
  const log = deps.log ?? (() => {});
  const enqueue = deps.enqueue ?? (async () => {});
  const counts = { claimed: 0, dispatched: 0, failed: 0, deadLettered: 0 };
  const r = await client.query(
    `select id, client_id from clara.agent_tasks
      where kind = $1 and status = 'queued' and firm_id = $2
      order by created_at limit $3
      for update skip locked`,
    [source.taskKind, firmId, batchSize],
  );
  for (const row of r.rows) {
    await client.query("begin");
    let credential = null;
    let err = null;
    try {
      const cred = await client.query(
        "select credential_id, secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)",
        [source.wakeKind, firmId, null, DEFAULT_TTL, row.client_id],
      );
      credential = cred.rows[0];
      await client.query("update clara.agent_tasks set status='running' where id=$1 and status='queued'", [row.id]);
      await client.query("commit");
    } catch (e) {
      err = e;
      try {
        await client.query("rollback");
      } catch {
        /* aborted/dead */
      }
    }
    if (err) {
      const attempts = await recordTaskDeadLetter(client, { taskId: row.id, reason: err?.message ?? String(err) });
      if (attempts >= source.maxAttempts) {
        // Poison-skip's terminal: settle the TASK (there is no checkpoint to advance past for a
        // direct_queue row — Annex C's own note).
        await client.query("update clara.agent_tasks set status='failed', error_code='internal' where id=$1 and status='queued'", [row.id]);
        counts.deadLettered += 1;
        log(`[wake-engine] task=${row.id} source=${source.sourceKey} exhausted ${source.maxAttempts} attempts -> failed`);
      } else {
        counts.failed += 1;
        log(`[wake-engine] claim-error task=${row.id} source=${source.sourceKey} attempt=${attempts}/${source.maxAttempts}: ${err?.message ?? err}`);
        // else: leave 'queued' -- picked up again next cycle, natural retry (Annex C).
      }
      continue;
    }
    counts.claimed += 1;
    try {
      await enqueue(source.workflowExport, row.id, credential);
      counts.dispatched += 1;
    } catch (e) {
      log(`[wake-engine] enqueue failed task=${row.id} source=${source.sourceKey} (reconciler will re-enqueue): ${e?.message ?? e}`);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Per-firm processing — both carriers, ONE function sharing one lock/health surface (design
// Annex C's own argument for why this is not two consumers: "kill the engine -> all sources
// stall together, loudly" must be a true statement, not a half-true one).
// ---------------------------------------------------------------------------

function mergeCounts(a, b) {
  return {
    claimed: a.claimed + b.claimed,
    dispatched: a.dispatched + b.dispatched,
    failed: a.failed + b.failed,
    deadLettered: a.deadLettered + b.deadLettered,
  };
}

async function processFirm(client, { firmId, lastSeq, batchSize, sources, deps }) {
  const outbox = await processWakeOutboxFirm(client, { firmId, lastSeq, batchSize, sources, deps });
  let counts = outbox.counts;
  for (const source of sources.directQueue) {
    const c = await processDirectQueueSource(client, { firmId, source, batchSize, deps });
    counts = mergeCounts(counts, c);
  }
  return { maxSeq: outbox.maxSeq, blocked: outbox.blocked, readCount: outbox.readCount, counts };
}

/** One full wake-engine cycle — discover firms behind the checkpoint, drain each ROUND-ROBIN
 *  bounded to maxBatchesPerFirm (fairness, mirrors autodraft's runAutodraftCycle). Direct-queue
 *  sources are scanned for EVERY firm with any registered/enabled source, not just firms with
 *  wake_outbox backlog — a firm can have close_prep work with zero pending wake_outbox rows. */
export async function runWakeEngineCycle(client, opts = {}) {
  const { batchSize = 100, maxBatchesPerFirm = 4, onlyFirm = null, log = () => {} } = opts;
  const deps = { ...opts, log };
  const sources = await loadEnabledSources(client);
  const work = await discoverWork(client, { consumer: WAKE_ENGINE_CONSUMER, onlyFirm });
  const cursors = work.map((w) => ({ firmId: w.firmId, lastSeq: w.lastSeq, active: true }));
  let totals = { claimed: 0, dispatched: 0, failed: 0, deadLettered: 0 };

  for (let round = 0; round < maxBatchesPerFirm; round++) {
    let anyActive = false;
    for (const cur of cursors) {
      if (!cur.active) continue;
      const res = await processFirm(client, { firmId: cur.firmId, lastSeq: cur.lastSeq, batchSize, sources, deps });
      totals = mergeCounts(totals, res.counts);
      if (res.blocked || res.maxSeq <= cur.lastSeq) {
        cur.active = false; // blocked (unclaimable/retrying) or caught up
        continue;
      }
      cur.lastSeq = res.maxSeq;
      anyActive = true;
      if (res.readCount < batchSize) cur.active = false; // drained to head
    }
    if (!anyActive) break;
  }

  // direct_queue sources with no wake_outbox backlog at all still need scanning — discoverWork
  // only surfaces firms with pending domain_events, so a client-scoped close_prep firm whose
  // checkpoint is already caught up would otherwise never get a direct_queue pass.
  if (sources.directQueue.length > 0 && onlyFirm != null) {
    const firms = Array.isArray(onlyFirm) ? onlyFirm : [onlyFirm];
    for (const firmId of firms) {
      if (cursors.some((c) => c.firmId === firmId)) continue; // already scanned above
      for (const source of sources.directQueue) {
        const c = await processDirectQueueSource(client, { firmId, source, batchSize, deps });
        totals = mergeCounts(totals, c);
      }
    }
  }

  return { firms: work.length, ...totals, capped: cursors.some((c) => c.active) };
}

// ---------------------------------------------------------------------------
// /ready WARN signal — mirrors autodraftHealth's shape, extended with a per-source breakdown
// (design §3: "one engine, many sources" is the new fact this gate introduces).
// ---------------------------------------------------------------------------

export async function wakeEngineHealth(client) {
  const r = await client.query(
    `select
       coalesce((select sum(greatest(s.n - coalesce(c.last_seq, 0), 0))
                   from clara.firm_event_seq s
                   left join clara.relay_checkpoints c on c.consumer = $1 and c.firm_id = s.firm_id), 0)::bigint as lag,
       (select count(*) from clara.relay_dead_letters where consumer = $1 and status = 'pending')::int
         + (select count(*) from clara.wake_engine_task_dead_letters where consumer = $1 and status = 'pending')::int
         as pending_dead_letters,
       (select count(*) from clara.relay_checkpoints where consumer = $1)::int as firms_tracked,
       (select count(*) from clara.agent_tasks at
          join clara.wake_intents wi on wi.id = at.origin_intent_id
          join clara.domain_events de on de.id = wi.event_id
         where at.kind = 'wake' and at.status = 'held'
           and de.event_type not in (select event_type from clara.wake_engine_sources where enabled and carrier = 'wake_outbox'))::int
         + (select count(*) from clara.agent_tasks at
              where at.status = 'queued' and at.kind not in ('chat_turn','autodraft')
                and at.kind not in (select task_kind from clara.wake_engine_sources where enabled and carrier = 'direct_queue'))::int
         as held_for_disabled_source`,
    [WAKE_ENGINE_CONSUMER],
  );
  const row = r.rows[0];
  return {
    consumer: WAKE_ENGINE_CONSUMER,
    lag: Number(row.lag),
    pendingDeadLetters: row.pending_dead_letters,
    firmsTracked: row.firms_tracked,
    heldForDisabledSource: row.held_for_disabled_source,
  };
}

// ---------------------------------------------------------------------------
// The wake-engine leader loop — its OWN dedicated connection + advisory lock ('wake_engine'),
// byte-identical shape to startAutodraftLoop. Structurally independent: a wake-engine stall
// never touches router/matcher/autodraft leadership, readiness, or heartbeat.
// `deps.enqueue(workflowExport, taskId, credential)` is injectable (the supervisor supplies the
// registry-provenance enqueue, e.g. `(w,t,c) => start(workflows[w], [{taskId:t, credential:c}])`).
export function startWakeEngineLoop(deps = {}) {
  const log = deps.log ?? (() => {});
  const makeClient = deps.makeClient ?? makeRuntimeClient;
  const stopRef = { stop: false, wake: null };

  const loop = (async () => {
    let backoff = RECONNECT_BASE_MS;
    while (!stopRef.stop) {
      const client = makeClient();
      let connErr = null;
      client.on("error", (e) => {
        connErr = e;
      });
      try {
        await client.connect();
        await setRuntimeRole(client); // N10 — set role clara_runtime (all wake-engine fns are runtime-granted)
        await acquireLeaderLock(client, WAKE_ENGINE_CONSUMER); // BLOCKS until wake-engine leadership
        await client.query("listen clara_events");
        log("WAKE-ENGINE acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runWakeEngineCycle(client, { ...deps, log });
            capped = r.capped;
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`WAKE-ENGINE cycle-error ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`WAKE-ENGINE connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      } finally {
        await client.end().catch(() => {});
      }
    }
  })();

  return {
    stop: async () => {
      stopRef.stop = true;
      if (stopRef.wake) stopRef.wake();
      await loop.catch(() => {});
    },
    done: loop,
  };
}
