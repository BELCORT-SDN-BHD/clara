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
//
// SECURITY LAW (opus/Codex review round, MUST F): this module NEVER mints a wake credential and
// NEVER passes a secret through `enqueue`/`start()`. docs/plan/completed/slice4-durable-runtime-
// contract.md:270 states plainly that plaintext secrets must never transit WDK inputs, returns or
// workflow state, because step IO is durably persisted (to Postgres, and into backups). The
// design's own Annex C pseudocode minted a credential in the claim transaction and enqueued it —
// that was WRONG against this standing law, and is deliberately NOT followed here. `enqueue`
// receives only `(workflowExport, taskId)` — two plain identifiers, neither secret. The credential
// mint moves ENTIRELY into the dispatched workflow's own first `"use step"` attempt: a future
// bankAgent.v1/closePrep.v1 step calls `clara.mint_wake_credential(wakeKind, firm, null, ttl,
// client)` itself, uses the returned secret ONLY within that one step's local execution (the
// pools.mjs `mintWakeCredential` JSDoc's own law: "minted, used and discarded inside ONE step
// execution attempt"), and returns nothing secret from the step. This is a closed obligation on
// every future dispatched workflow, not something this engine can enforce by itself — but the
// engine's own code can and does structurally guarantee it never OFFERS a secret to persist.
import { setTimeout as sleep } from "node:timers/promises";
import { discoverWork, writeCheckpoint, acquireLeaderLock, setRuntimeRole } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

/** The wake-engine consumer name — its own checkpoint / dead-letter / lock key. */
export const WAKE_ENGINE_CONSUMER = "wake_engine";

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;
const POLL_INTERVAL_MS = Number(process.env.CLARA_WAKE_ENGINE_POLL_MS || 2000);

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

/** Exported for reconciler-wake.mjs's own re-enqueue attempt cap (SHOULD I, opus/Codex review)
 *  — the SAME direct_queue dead-letter home, one shared attempt-count ledger per task. */
/** M6 (opus+Codex review): read-only — has this task's dead-letter row (if any) already
 *  reached its source's max_attempts? reconciler-wake.mjs's own re-enqueue path checks this
 *  FIRST, before touching enqueue() at all, so exhaustion is STICKY: once the cap is reached,
 *  every later sweep skips straight to (re-)settling and never re-attempts enqueue again, even
 *  if a settle attempt itself fails and the row shows up 'running' again next sweep. Shared
 *  budget with carrier-2's own claim-failure dead-lettering is INTENTIONAL, not a bug needing
 *  split counters (argued in place, M6's own "either/or"): a task that fails enough CLAIMS is
 *  settled 'failed' directly inside processDirectQueueSource's own poison-exhaustion path
 *  without ever reaching 'running', so it can never ALSO appear in this belt's own `stuck`
 *  query (which requires status='running') — the two failure modes are mutually exclusive per
 *  task_id in practice, never cumulative against the same budget. */
export async function readDeadLetterAttempts(client, { taskId }) {
  const r = await client.query(
    "select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2",
    [WAKE_ENGINE_CONSUMER, taskId],
  );
  return r.rows[0]?.attempt_count ?? 0;
}

export async function recordTaskDeadLetter(client, { taskId, reason }) {
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

/** One held row's claim: held->running + checkpoint, ONE transaction. NO credential is minted
 *  here (MUST F) — that is the dispatched workflow's own first-step obligation. SHOULD H (opus/
 *  Codex review): the read's `FOR UPDATE SKIP LOCKED` is decorative outside an explicit
 *  transaction (proven by a two-session differential — the row lock releases at statement end,
 *  before this transaction even opens); the CAS (`and status='held'`) below is the REAL
 *  exclusion. M2 (Codex review): `sources` is loaded ONCE per cycle (loadEnabledSources, at the
 *  top of runWakeEngineCycle) — a mid-cycle disable would otherwise keep claiming the REST of
 *  an already-in-flight batch against a stale in-memory snapshot. The CAS now ALSO re-checks
 *  `enabled` fresh, inside this same claim transaction, against the live catalog. A zero
 *  rowCount is now AMBIGUOUS between two different causes with OPPOSITE safe responses, so this
 *  distinguishes them: genuinely raced by another claimant (the row is no longer 'held' at all
 *  — safe to advance the checkpoint past it, it is spoken for) vs disabled mid-cycle (the row is
 *  STILL 'held', untouched — advancing the checkpoint past it would strand it exactly like M1,
 *  just via a different door; the caller must block instead, leaving both the row and the
 *  checkpoint visibly in place until the source re-enables). */
async function claimWakeOutboxRow(client, { row, firmId, sourceKey }) {
  await client.query("begin");
  try {
    const upd = await client.query(
      `update clara.agent_tasks set status='running'
        where id=$1 and status='held'
          and exists (select 1 from clara.wake_engine_sources where source_key=$2 and enabled)`,
      [row.taskId, sourceKey],
    );
    if (upd.rowCount === 0) {
      const still = await client.query("select 1 from clara.agent_tasks where id=$1 and status='held'", [row.taskId]);
      await client.query("commit");
      return { ok: true, claimed: false, stillHeld: still.rowCount > 0 };
    }
    await writeCheckpoint(client, { consumer: WAKE_ENGINE_CONSUMER, firmId, seq: row.eventSeq });
    await client.query("commit");
    return { ok: true, claimed: true };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    return { ok: false, err };
  }
}

/** Wake-engine-only checkpoint advance, no task write (MUST F liveness, opus/Codex review) —
 *  mirrors autodraft.mjs's own checkpointOnly. */
async function checkpointOnlyWake(client, { firmId, seq }) {
  await client.query("begin");
  try {
    await writeCheckpoint(client, { consumer: WAKE_ENGINE_CONSUMER, firmId, seq });
    await client.query("commit");
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
// M1 (opus+Codex independent review, both legs) — the ORIGINAL MUST-F(liveness) fix coalesced
// straight to `discoverWork`'s raw firm_event_seq head, which is UNSAFE: an event can COMMIT
// (bumping firm_event_seq) before the router has turned it into a wake_intents row, or after
// the router but before drain.mjs has turned that wake_intent into the held agent_tasks row
// this consumer actually reads. NOTIFY can fire and wake this cycle in EITHER gap. Coalescing
// past a seq whose wake-bound row has not materialized YET strands it FOREVER: writeCheckpoint
// uses greatest(), so a later drain-completion at the SAME seq can never rewind the cursor back
// to find it, and wakeEngineHealth's own signals stay blind (lag=0 by construction —
// heldForDisabledSource only counts rows whose SOURCE is disabled, not rows the checkpoint has
// already sailed past).
//
// THE FIX: never coalesce past a seq that is not PROVABLY fully materialized. Two independent
// bounds, take the tighter:
//   1. The ROUTER's own checkpoint (`relay_checkpoints` consumer='router') — router has not
//      even LOOKED at anything past this seq, so a wake-bound intent could still be minted
//      there. This is a positive proof of "processed", not an absence-based guess.
//   2. The earliest still-PENDING (undrained) wake_intent — drain has not yet projected its
//      held task, so its seq (and everything after it, since it may not be the firm's ONLY
//      backlog) is not safe either. Absence of a pending row is NOT proof nothing will ever
//      land there (the router may not have reached it yet — bound 1 already covers that half);
//      presence of one is a hard stop.
// A third gap (the "skip-locked variant", M1 acceptance): a held row can EXIST (already fully
// materialized) yet be invisible to THIS cycle's own `readHeldWakeRows` because another
// transaction holds its row lock right now (a concurrent cancel_agent_task, or another leader's
// overlapping claim) — SKIP LOCKED means "not visible to me this instant," never "does not
// exist." `hasHiddenHeldRow` is a lock-free existence check (no FOR UPDATE at all) closing that
// gap independently of the two bounds above.
// ---------------------------------------------------------------------------

/** The tightest seq this firm's wake_outbox checkpoint may PROVABLY advance to right now —
 *  never the raw firm_event_seq head. See the module-level comment above for the two bounds. */
async function safeCoalesceBound(client, firmId) {
  const r = await client.query(
    `select least(
        coalesce((select last_seq from clara.relay_checkpoints where consumer='router' and firm_id=$1), 0),
        coalesce((select min(wi.event_seq) - 1 from clara.wake_intents wi where wi.firm_id=$1 and wi.status='pending'), 9223372036854775807)
      )::bigint as bound`,
    [firmId],
  );
  return Number(r.rows[0].bound);
}

/** Lock-free (no FOR UPDATE / SKIP LOCKED) existence check for a held wake row in
 *  (fromSeqExclusive, toSeqInclusive] — closes the skip-locked variant of M1: a row this
 *  cycle's own locking read could not see is still a row that must not be coalesced past. */
async function hasHiddenHeldRow(client, { firmId, fromSeqExclusive, toSeqInclusive }) {
  const r = await client.query(
    `select exists(
       select 1 from clara.agent_tasks at
       join clara.wake_intents wi on wi.id = at.origin_intent_id
      where at.kind = 'wake' and at.status = 'held' and wi.firm_id = $1
        and wi.event_seq > $2 and wi.event_seq <= $3
     ) as hidden`,
    [firmId, fromSeqExclusive, toSeqInclusive],
  );
  return r.rows[0].hidden;
}

/** M1: compute the safe bound and, ONLY if it clears both checks, advance the checkpoint to it.
 *  Returns the new cursor (unchanged if nothing was safe to coalesce). */
async function coalesceIfSafe(client, { firmId, from }) {
  const bound = await safeCoalesceBound(client, firmId);
  if (bound <= from) return from;
  if (await hasHiddenHeldRow(client, { firmId, fromSeqExclusive: from, toSeqInclusive: bound })) return from;
  await checkpointOnlyWake(client, { firmId, seq: bound });
  return bound;
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
  if (rows.length === 0) {
    // MUST F(liveness): no held wake row past lastSeq right now does not mean nothing happened
    // — ordinary (non-wake) traffic still advances firm_event_seq, and with no coalescing this
    // checkpoint sits at its last CLAIM forever (measured on a healthy rig: lag=170 against
    // ordinary traffic, autodraft's own lag=0 on the identical traffic). M1 (opus+Codex review):
    // coalesce ONLY to the provably-safe bound (coalesceIfSafe), never the raw firm_event_seq
    // head — see the module-level comment above safeCoalesceBound for why that was a real
    // stranding bug, reproduced and fixed this round.
    const newCursor = await coalesceIfSafe(client, { firmId, from: lastSeq });
    return { maxSeq: newCursor, blocked: false, counts, readCount: 0 };
  }

  let cursor = lastSeq;
  for (const row of rows) {
    const source = sources.byEventType.get(row.eventType);
    if (!source) {
      // Unregistered/disabled source: BLOCK this firm's carrier-1 processing this cycle (see
      // module header). Nothing is wrong — the source simply has not shipped/enabled yet.
      return { maxSeq: cursor, blocked: true, counts, readCount: rows.length };
    }
    const res = await claimWakeOutboxRow(client, { row, firmId, sourceKey: source.sourceKey });
    if (res.ok) {
      if (res.claimed) {
        cursor = row.eventSeq;
        counts.claimed += 1;
        try {
          // MUST F: only plain identifiers cross into durable WDK state — never a credential. The
          // dispatched workflow's own first step mints its own credential fresh (see the module
          // header's security law).
          await enqueue(source.workflowExport, row.taskId);
          counts.dispatched += 1;
        } catch (e) {
          log(`[wake-engine] enqueue failed task=${row.taskId} source=${source.sourceKey} (reconciler will re-enqueue): ${e?.message ?? e}`);
        }
      } else if (res.stillHeld) {
        // M2: the source was disabled MID-CYCLE, between loadEnabledSources' snapshot and this
        // claim — the row is untouched. BLOCK here (never advance the checkpoint past it) so it
        // stays visibly discoverable the instant the source re-enables, exactly like the
        // unregistered-source block above.
        log(`[wake-engine] task=${row.taskId} source=${source.sourceKey} disabled mid-cycle — leaving held, not advancing checkpoint`);
        return { maxSeq: cursor, blocked: true, counts, readCount: rows.length };
      } else {
        // SHOULD H: the CAS found this row no longer 'held' — someone/something else already
        // moved it (e.g. a concurrent claim, or a human's cancel_agent_task racing us). Advance
        // the checkpoint (this seq IS spoken for) but never dispatch a second time.
        cursor = row.eventSeq;
        log(`[wake-engine] task=${row.taskId} raced (no longer 'held' at claim) — checkpoint advances, no dispatch`);
      }
      continue;
    }
    // Claim failed (a transient DB error on the plain UPDATE/checkpoint write) — dead-letter + poison-skip.
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
  // Nothing in this batch blocked. If we drained fewer than batchSize rows, nothing more exists
  // right now: coalesce past trailing non-wake traffic too (MUST F liveness), but ONLY to the
  // M1 safe bound. If we hit the limit, more held rows may exist beyond `cursor` that this read
  // never saw — must NOT skip past them (the module header's own "never advance past an
  // unclaimable row" law, generalised).
  if (rows.length < batchSize) {
    cursor = await coalesceIfSafe(client, { firmId, from: cursor });
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
    let err = null;
    let claimed = false;
    try {
      // MUST F: NO credential is minted here — the dispatched workflow's own first step mints
      // its own fresh credential (see the module header's security law). This transaction claims
      // ONLY the row. SHOULD H: rowCount, not just the CAS predicate, is the proof — the SELECT's
      // own SKIP LOCKED is decorative outside an explicit txn (see claimWakeOutboxRow's comment).
      // M2 (Codex review): `source` is a stale per-cycle snapshot (loadEnabledSources runs once
      // at cycle start) — re-check `enabled` fresh, in this same claim transaction, so a
      // mid-cycle disable stops claiming the REST of an in-flight batch. Carrier 2 has no
      // checkpoint to strand (unlike carrier 1's M2 half): a refused claim just leaves the row
      // 'queued', naturally rediscovered next cycle once the source re-enables — no separate
      // "still queued" branch needed.
      const upd = await client.query(
        `update clara.agent_tasks set status='running'
          where id=$1 and status='queued'
            and exists (select 1 from clara.wake_engine_sources where source_key=$2 and enabled)`,
        [row.id, source.sourceKey],
      );
      claimed = upd.rowCount > 0;
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
        // direct_queue row — Annex C's own note). M4 (both legs, found by the battery's own
        // poison-trigger cell): this write touches the SAME row the claim attempt above just
        // failed on — a genuine claim failure (a poisoned trigger, a transient DB error) can
        // fire on THIS statement too, and pre-fix it was bare: an exception here propagated all
        // the way out of runWakeEngineCycle, crashing the whole cycle (including every OTHER
        // firm/source still to be processed) instead of the row simply staying 'queued' for a
        // later retry — the exact "cycle does not crash" acceptance M4 requires.
        try {
          await client.query("update clara.agent_tasks set status='failed', error_code='internal' where id=$1 and status='queued'", [row.id]);
          counts.deadLettered += 1;
          log(`[wake-engine] task=${row.id} source=${source.sourceKey} exhausted ${source.maxAttempts} attempts -> failed`);
        } catch (termErr) {
          counts.failed += 1;
          log(`[wake-engine] task=${row.id} source=${source.sourceKey} exhausted ${source.maxAttempts} attempts but the terminal settle ITSELF failed — leaving 'queued' for a later sweep (reconciler-wake's own check-first sticky-exhaustion path is the direct_queue analogue for the reconciler belt; this carrier's own next cycle retries the settle here): ${termErr?.message ?? termErr}`);
        }
      } else {
        counts.failed += 1;
        log(`[wake-engine] claim-error task=${row.id} source=${source.sourceKey} attempt=${attempts}/${source.maxAttempts}: ${err?.message ?? err}`);
        // else: leave 'queued' -- picked up again next cycle, natural retry (Annex C).
      }
      continue;
    }
    if (!claimed) {
      log(`[wake-engine] task=${row.id} raced (no longer 'queued' at claim) — skipping dispatch`);
      continue;
    }
    counts.claimed += 1;
    try {
      // MUST F: only plain identifiers cross into durable WDK state — never a credential.
      await enqueue(source.workflowExport, row.id);
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

/** MUST E (opus/Codex review): direct_queue discovery for a firm NOT already covered by
 *  carrier 1's round-robin — a firm with direct_queue work but no wake_outbox backlog never
 *  appears in discoverWork's result (direct_queue rides no domain event at all). Bounded like
 *  readHeldWakeRows' own batchSize discipline. */
/** S5 (both legs): a bare `DISTINCT ... LIMIT` with no ORDER BY has UNDEFINED result ordering —
 *  Postgres is free to return whatever subset its plan happens to touch first, which can
 *  starve the SAME firms cycle after cycle once the distinct-firm count exceeds `limit`.
 *  ORDER BY firm_id makes the selection deterministic and fair across cycles (not a full
 *  round-robin cursor, but no longer arbitrary). The supporting partial index is on the
 *  migration's own DDL (ix_agent_tasks_kind_queued) — this query was a full sequential scan
 *  of agent_tasks before it. */
async function discoverDirectQueueFirms(client, { taskKind, limit }) {
  const r = await client.query(
    `select distinct firm_id from clara.agent_tasks where kind = $1 and status = 'queued' order by firm_id limit $2`,
    [taskKind, limit],
  );
  return r.rows.map((row) => row.firm_id);
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
  // checkpoint is already caught up would otherwise never get a direct_queue pass. MUST E
  // (opus/Codex review): gating this WHOLE block on `onlyFirm != null` made it dead code in
  // PRODUCTION — startWorld.ts never passes onlyFirm, so every runtime battery cell that DID
  // pass it was proving a path production never takes (measured: task stayed 'queued',
  // dispatched=0, in the production shape). onlyFirm now only narrows WHICH firms to scan
  // (test-scoping, matching discoverWork's own contract); when it is null (production), each
  // source discovers its own firm list live instead of skipping the pass entirely.
  if (sources.directQueue.length > 0) {
    const alreadyScanned = new Set(cursors.map((c) => c.firmId));
    for (const source of sources.directQueue) {
      const firmIds = onlyFirm != null
        ? (Array.isArray(onlyFirm) ? onlyFirm : [onlyFirm])
        : await discoverDirectQueueFirms(client, { taskKind: source.taskKind, limit: batchSize });
      for (const firmId of firmIds) {
        if (alreadyScanned.has(firmId)) continue; // covered by the round-robin above
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
// `deps.enqueue(workflowExport, taskId)` is injectable (the supervisor supplies the registry-
// provenance enqueue, e.g. `(w,t) => start(workflowsByName[w], [{taskId:t}])`) — TWO plain
// identifiers only, NEVER a credential (MUST F, the module header's security law).
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
