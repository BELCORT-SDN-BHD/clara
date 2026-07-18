// The outbox relay — pure, injectable logic (Slice 3, ARCHITECTURE §2 / ADR-016;
// contract scratchpad/slice3-design.md v2.1 §2.8–2.9). This module NEVER opens
// its own work connection for the routing functions: every routing function
// (loadActiveTaxonomy / discoverWork / routeBatchForFirm / redrive / runRelayCycle)
// takes an ALREADY-CONNECTED pg client that the caller has put into the
// `clara_runtime` role (N10 — the relay never operates as the bare login, so a
// missing grant surfaces as an error). The long-lived runner is scripts/relay.mjs.
//
// Design invariants encoded here:
//   * Consumer is the single logical `router` (contract §2.9).
//   * Work discovery is O(firms): firm_event_seq LEFT JOIN relay_checkpoints —
//     NEVER a scan/group-by over domain_events (§2.9.2 / N11).
//   * Per batch, ONE transaction: route wake-bound events into wake_intents
//     (ON CONFLICT (event_id) DO NOTHING — the DB stamping trigger derives
//     firm/seq/type and validates the (version,type,decision) triple, C6), record
//     uncovered types in relay_dead_letters, then advance the checkpoint
//     MONOTONICALLY (greatest(...)) and COMMIT. Crash ⇒ the batch replays ⇒
//     at-least-once delivery, exactly-once effect (§2.9.3).
//   * The ACTIVE taxonomy is read ONCE INSIDE each batch transaction (its own
//     snapshot) — so each batch carries exactly one taxonomy version and a
//     mid-drain repoint is picked up by the next batch (D4). A missing/empty
//     active pointer HALTs loudly (never advances past an un-routable state, N7b).
//
// Connections come from the environment ONLY (libpq PG* or a DSN URL) — no DSN
// literal in code or argv (repo secrets law; mirrors packages/db/lib/pg.mjs).

import pg from "pg";
import { setTimeout as sleep } from "node:timers/promises";

// ---------------------------------------------------------------------------
// Constants — the routing vocabulary (contract §2.7 decision set)
// ---------------------------------------------------------------------------

/** The single logical consumer name (contract §2.9). */
export const CONSUMER = "router";

/** Decisions that produce a durable wake_intents row (§0.4 / §2.7). */
export const WAKE_BOUND_DECISIONS = Object.freeze(["internal_task", "notification", "background_review"]);
const WAKE_BOUND_SET = new Set(WAKE_BOUND_DECISIONS);

/** Decisions that advance the checkpoint only — no intent row (§0.4 / §2.7). */
export const NON_WAKE_DECISIONS = Object.freeze(["context_update", "ignore"]);

/** The full decision set the taxonomy CHECK constrains to (§2.7). */
export const ALL_DECISIONS = Object.freeze([...WAKE_BOUND_DECISIONS, ...NON_WAKE_DECISIONS]);

/**
 * Route a taxonomy decision to a relay action. Pure — the unit of the routing
 * decision map (§2.9.3). A covered event type always has a decision in the CHECK
 * set; an unknown/undefined decision is a defect and routes to no-op (never a
 * silent intent), which the batch loop treats as "no row".
 * @param {string} decision
 * @returns {"intent"|"skip"}
 */
export function isWakeBound(decision) {
  return WAKE_BOUND_SET.has(decision);
}

// ---------------------------------------------------------------------------
// HALT sentinel
// ---------------------------------------------------------------------------

/**
 * A missing/empty active taxonomy pointer — the relay must HALT loudly and never
 * advance (contract §2.9.2 / N7b). The runner stops its loop on this; a batch
 * that raises it rolls back with no checkpoint move and no dead-letters.
 */
export class TaxonomyHaltError extends Error {
  constructor(message) {
    super(message);
    this.name = "TaxonomyHaltError";
    this.halt = true;
  }
}

// ---------------------------------------------------------------------------
// Connection helpers — env ONLY (mirrors packages/db/lib/pg.mjs). The routing
// functions do NOT use these (they take an injected client); the runner + tests
// do, so a single env-resolution home avoids a DSN literal drifting into argv.
// ---------------------------------------------------------------------------

/** @returns {pg.ClientConfig} */
export function connConfig() {
  // DATABASE_URL wins over WORKFLOW_POSTGRES_URL; otherwise node-postgres reads
  // the libpq PG* vars itself when no connectionString is given.
  const url = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
  return url ? { connectionString: url } : {};
}

/** @param {pg.PoolConfig} [overrides] */
export function makePool(overrides = {}) {
  return new pg.Pool({ ...connConfig(), max: 4, ...overrides });
}

/** A single dedicated connection (the runner's leader session uses this). */
export function makeClient() {
  return new pg.Client(connConfig());
}

/**
 * Put the connection into the runtime role — issued IMMEDIATELY after connect on
 * every relay connection (N10). A missing grant then fails loudly instead of
 * silently succeeding as the superuser login.
 * @param {pg.ClientBase} client
 */
export async function setRuntimeRole(client) {
  await client.query("set role clara_runtime");
}

// ---------------------------------------------------------------------------
// Leader election — session-level advisory lock keyed off the consumer name
// (contract §2.9 / N6/C3). Single-writer ENFORCED; a second instance blocks on
// the lock (chosen policy: BLOCK, not try-and-exit — a standby transparently
// takes over the instant the leader's session ends and releases the lock).
// ---------------------------------------------------------------------------

/** Blocking leader acquisition — returns only once this session holds the lock. */
export async function acquireLeaderLock(client, consumer = CONSUMER) {
  // hashtext() derives a stable int4 key from the consumer name, in-DB; the
  // ::bigint widens it for the single-arg pg_advisory_lock. Session-level (NOT
  // xact) so BEGIN/COMMIT on the same client never release leadership.
  await client.query("select pg_advisory_lock(hashtext($1)::bigint)", [consumer]);
}

/** Non-blocking leader attempt — true iff this session now holds the lock. */
export async function tryLeaderLock(client, consumer = CONSUMER) {
  const r = await client.query("select pg_try_advisory_lock(hashtext($1)::bigint) as got", [consumer]);
  return r.rows[0].got === true;
}

// ---------------------------------------------------------------------------
// The active taxonomy — read ONCE inside each routing (batch) transaction.
// ---------------------------------------------------------------------------

/**
 * Load the ACTIVE taxonomy: the guarded singleton pointer → its version's rows.
 * Throws {@link TaxonomyHaltError} when the pointer row is missing OR the pointed
 * version has no rows (both are un-routable states, §2.9.2 / N7b).
 * @returns {Promise<{version:number, decisions:Map<string,string>}>}
 */
export async function loadActiveTaxonomy(client) {
  const ptr = await client.query("select version from clara.taxonomy_active limit 1");
  if (ptr.rowCount === 0) {
    throw new TaxonomyHaltError("active taxonomy pointer (clara.taxonomy_active) is missing — refusing to advance");
  }
  const version = Number(ptr.rows[0].version);
  const rows = await client.query("select event_type, decision from clara.trigger_taxonomy where version = $1", [version]);
  if (rows.rowCount === 0) {
    throw new TaxonomyHaltError(`active taxonomy version ${version} has no rows — refusing to advance`);
  }
  const decisions = new Map(rows.rows.map((r) => [r.event_type, r.decision]));
  return { version, decisions };
}

// ---------------------------------------------------------------------------
// Work discovery — O(firms), never a domain_events scan (contract §2.9.2 / N11).
// ---------------------------------------------------------------------------

/**
 * Firms whose head sequence is ahead of the router's checkpoint. LEFT JOIN so a
 * brand-new firm (no checkpoint row) surfaces with last_seq 0 (bootstrap, C2).
 * `onlyFirm` narrows discovery to a single firm — a TEST-SCOPING knob so a test's
 * relay never drains firms owned by other tests / seeds in a shared DB (documented
 * test-only; the runner leaves it unset ⇒ all firms, the production behaviour).
 * @returns {Promise<{firmId:string, headSeq:number, lastSeq:number}[]>}
 */
export async function discoverWork(client, { consumer = CONSUMER, onlyFirm = null } = {}) {
  const r = await client.query(
    `select s.firm_id,
            s.n                         as head_seq,
            coalesce(c.last_seq, 0)     as last_seq
       from clara.firm_event_seq s
       left join clara.relay_checkpoints c
              on c.consumer = $1 and c.firm_id = s.firm_id
      where s.n > coalesce(c.last_seq, 0)
        and ($2::uuid is null or s.firm_id = $2::uuid)
      order by s.firm_id`,
    [consumer, onlyFirm],
  );
  return r.rows.map((row) => ({
    firmId: row.firm_id,
    headSeq: Number(row.head_seq),
    lastSeq: Number(row.last_seq),
  }));
}

// ---------------------------------------------------------------------------
// The three write primitives (also used directly by the unit tests).
// ---------------------------------------------------------------------------

/**
 * Insert a wake intent, idempotently. Provides ONLY (event_id, decision,
 * taxonomy_version) — the BEFORE INSERT stamping trigger derives firm_id,
 * event_seq, event_type from domain_events(event_id) and validates the triple
 * (C6). ON CONFLICT (event_id) DO NOTHING ⇒ at-least-once delivery collapses to
 * exactly one row.
 */
export async function insertWakeIntent(client, { eventId, decision, version }) {
  await client.query(
    `insert into clara.wake_intents (event_id, decision, taxonomy_version)
       values ($1, $2, $3)
     on conflict (event_id) do nothing`,
    [eventId, decision, version],
  );
}

/**
 * Read the surviving wake intent (post-insert) for the C3 consistency assertion.
 * @returns {Promise<{decision:string, taxonomy_version:number}|null>}
 */
async function survivingIntent(client, eventId) {
  const r = await client.query("select decision, taxonomy_version from clara.wake_intents where event_id = $1", [eventId]);
  return r.rowCount ? { decision: r.rows[0].decision, taxonomy_version: Number(r.rows[0].taxonomy_version) } : null;
}

/**
 * Dead-letter an uncovered event, upserting attempt_count. The stamping trigger
 * derives firm/seq/type from the event (C6/C15). The ON CONFLICT update touches
 * ONLY attempt_count — the trigger allowlists updates to status/attempt_count/
 * resolved_at, so attempted_taxonomy_version is set on INSERT and never updated.
 */
export async function deadLetterEvent(client, { consumer = CONSUMER, eventId, reason, version }) {
  await client.query(
    `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
       values ($1, $2, $3, $4)
     on conflict (consumer, event_id) do update
       set attempt_count = clara.relay_dead_letters.attempt_count + 1`,
    [consumer, eventId, reason, version],
  );
}

/**
 * Advance the checkpoint MONOTONICALLY. The upsert BOOTSTRAPS a new firm's row
 * (a bare UPDATE would silently no-op forever on head-of-line batches, C2); the
 * greatest(...) guarantees a stale lower value can never regress it (§2.9.3).
 */
export async function writeCheckpoint(client, { consumer = CONSUMER, firmId, seq }) {
  await client.query(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq, updated_at)
       values ($1, $2, $3, now())
     on conflict (consumer, firm_id) do update
       set last_seq   = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq),
           updated_at = now()`,
    [consumer, firmId, seq],
  );
}

// ---------------------------------------------------------------------------
// The per-batch routing transaction.
// ---------------------------------------------------------------------------

/**
 * Route ONE contiguous batch for a firm in a single transaction and commit.
 * Reads the ACTIVE taxonomy inside this transaction (one version per batch, D4);
 * a missing/empty pointer raises {@link TaxonomyHaltError} and the batch rolls
 * back untouched (no checkpoint move, no dead-letters — the zero-pointer HALT).
 *
 * @param {pg.ClientBase} client  a client in the clara_runtime role
 * @param {{firmId:string, lastSeq:number, batchSize:number, consumer?:string,
 *          testBatchDelayMs?:number, log?:(m:string)=>void}} opts
 * @returns {Promise<{processed:number, maxSeq:number, intents:number, deadLetters:number, version:number|null}>}
 */
export async function routeBatchForFirm(client, opts) {
  const { firmId, lastSeq, batchSize, consumer = CONSUMER, testBatchDelayMs = 0, log = () => {} } = opts;
  await client.query("begin");
  try {
    const taxonomy = await loadActiveTaxonomy(client); // inside the txn snapshot

    const batch = await client.query(
      `select seq, id, event_type
         from clara.domain_events
        where firm_id = $1 and seq > $2
        order by seq
        limit $3`,
      [firmId, lastSeq, batchSize],
    );
    if (batch.rowCount === 0) {
      await client.query("rollback");
      return { processed: 0, maxSeq: lastSeq, intents: 0, deadLetters: 0, version: taxonomy.version };
    }

    let maxSeq = lastSeq;
    let intents = 0;
    let deadLetters = 0;
    for (const ev of batch.rows) {
      const seq = Number(ev.seq);
      if (seq > maxSeq) maxSeq = seq;
      const decision = taxonomy.decisions.get(ev.event_type);
      if (decision === undefined) {
        // Uncovered by the active version ⇒ dead-letter THIS event and continue
        // (never HALT for a single uncovered type — that is the pointer's job).
        await deadLetterEvent(client, {
          consumer,
          eventId: ev.id,
          reason: `event_type '${ev.event_type}' not covered by taxonomy version ${taxonomy.version}`,
          version: taxonomy.version,
        });
        deadLetters += 1;
        continue;
      }
      if (isWakeBound(decision)) {
        await insertWakeIntent(client, { eventId: ev.id, decision, version: taxonomy.version });
        // C3 consistency assertion: the surviving row must match this batch's
        // (decision, version). A mismatch is a BENIGN diagnostic (a prior version
        // stamped it first under at-least-once) — log loudly, never abort.
        const surviving = await survivingIntent(client, ev.id);
        if (surviving && (surviving.decision !== decision || surviving.taxonomy_version !== taxonomy.version)) {
          log(
            `[relay] wake_intent stamp mismatch event=${ev.id} batch=(${decision},v${taxonomy.version}) ` +
              `surviving=(${surviving.decision},v${surviving.taxonomy_version})`,
          );
        }
        intents += 1;
      }
      // context_update / ignore ⇒ no row; the checkpoint move records progress.
    }

    // Test-only determinism knob: a delay INSIDE the txn, BEFORE the checkpoint
    // write, so a kill test can SIGKILL reliably mid-batch (uncommitted). Default
    // 0 (off). Documented test-only in scripts/relay.mjs + tests.
    if (testBatchDelayMs > 0) {
      log(`RELAY batch-delay-enter firm=${firmId} lastSeq=${lastSeq} maxSeq=${maxSeq}`);
      await sleep(testBatchDelayMs);
    }

    await writeCheckpoint(client, { consumer, firmId, seq: maxSeq });
    await client.query("commit");
    return { processed: batch.rowCount, maxSeq, intents, deadLetters, version: taxonomy.version };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* connection may already be aborted/dead — nothing to clean up */
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// One full relay cycle — discover work, drain each firm in batches.
// ---------------------------------------------------------------------------

/**
 * Run one cycle: discover firms with pending events and drain each to its head in
 * batches. A {@link TaxonomyHaltError} from any batch propagates (the runner
 * halts). `onlyFirm` scopes discovery for tests (see discoverWork).
 * @returns {Promise<{firms:number, processed:number, intents:number, deadLetters:number}>}
 */
export async function runRelayCycle(client, opts = {}) {
  const {
    consumer = CONSUMER,
    batchSize = 100,
    testBatchDelayMs = 0,
    onlyFirm = null,
    log = () => {},
  } = opts;
  const work = await discoverWork(client, { consumer, onlyFirm });
  let processed = 0;
  let intents = 0;
  let deadLetters = 0;
  for (const w of work) {
    let lastSeq = w.lastSeq;
    // Drain this firm fully (a firm may hold many batches, C2 bootstrap). Each
    // batch advances lastSeq to its maxSeq; stop when a batch comes back empty.
    for (let res = { processed: 1 }; res.processed > 0; ) {
      res = await routeBatchForFirm(client, { firmId: w.firmId, lastSeq, batchSize, consumer, testBatchDelayMs, log });
      if (res.processed === 0) break;
      lastSeq = res.maxSeq;
      processed += res.processed;
      intents += res.intents;
      deadLetters += res.deadLetters;
    }
  }
  return { firms: work.length, processed, intents, deadLetters };
}

// ---------------------------------------------------------------------------
// Dead-letter redrive op (D3) — CLI-invokable via scripts/relay.mjs redrive ...
// ---------------------------------------------------------------------------

/**
 * Re-route a dead-lettered event idempotently under the CURRENT active taxonomy
 * and mark it resolved (contract D3). If the type is now covered: insert its wake
 * intent (ON CONFLICT DO NOTHING — exactly once) when wake-bound, then set the
 * dead-letter row resolved. If STILL uncovered: bump attempt_count and leave it
 * pending (report it — never falsely resolve).
 * @returns {Promise<{resolved:boolean, decision?:string, wakeBound?:boolean, reason?:string}>}
 */
export async function redrive(client, consumer, eventId, { log = () => {} } = {}) {
  await client.query("begin");
  try {
    const taxonomy = await loadActiveTaxonomy(client); // HALT if un-routable
    const evR = await client.query("select event_type from clara.domain_events where id = $1", [eventId]);
    if (evR.rowCount === 0) {
      throw new Error(`redrive: event ${eventId} not found`);
    }
    const eventType = evR.rows[0].event_type;
    const decision = taxonomy.decisions.get(eventType);
    if (decision === undefined) {
      await deadLetterEvent(client, {
        consumer,
        eventId,
        reason: `still uncovered at redrive under taxonomy version ${taxonomy.version}`,
        version: taxonomy.version,
      });
      await client.query("commit");
      log(`[relay] redrive: event ${eventId} (${eventType}) still uncovered under v${taxonomy.version} — left pending`);
      return { resolved: false, reason: "still-uncovered" };
    }
    if (isWakeBound(decision)) {
      await insertWakeIntent(client, { eventId, decision, version: taxonomy.version });
    }
    await client.query(
      `update clara.relay_dead_letters
          set status = 'resolved', resolved_at = now()
        where consumer = $1 and event_id = $2`,
      [consumer, eventId],
    );
    await client.query("commit");
    log(`[relay] redrive: event ${eventId} (${eventType}) routed under v${taxonomy.version} decision=${decision} — resolved`);
    return { resolved: true, decision, wakeBound: isWakeBound(decision) };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead — nothing to clean up */
    }
    throw err;
  }
}
