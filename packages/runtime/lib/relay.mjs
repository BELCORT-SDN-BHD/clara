// The outbox relay — pure, injectable logic (Slice 3, ARCHITECTURE §2 / ADR-016;
// contract docs/plan/completed/slice3-event-spine-contract.md v2.2 §2.8–2.9). This module NEVER opens
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
import { attachPoolErrorContract } from "./pool-error-contract.mjs";

// ---------------------------------------------------------------------------
// Constants — the routing vocabulary (contract §2.7 decision set)
// ---------------------------------------------------------------------------

/** The single logical consumer name (contract §2.9). */
export const CONSUMER = "router";

/** round-7 (native adversarial leg, MUST #1) — moved here from wake-engine.mjs so redrive()'s
 *  own below-checkpoint rewind (see its own header) reads the WAKE ENGINE's checkpoint under the
 *  exact same JS binding wake-engine.mjs itself writes with, never a second string literal that
 *  could drift ("spelling is not identity" — the same law that forced N1's own wake_source_gate:
 *  proof and round-6's wake_coalesce: proof already applied to a LOCK key; a consumer-name key
 *  used to look up/rewind a checkpoint row deserves the identical treatment, done here the
 *  stronger way: one shared JS constant, not two literals proven to match). wake-engine.mjs
 *  imports and re-exports this same binding — see its own top-of-file import. */
export const WAKE_ENGINE_CONSUMER = "wake_engine";

/** Decisions that produce a durable wake_intents row (§0.4 / §2.7). */
export const WAKE_BOUND_DECISIONS = Object.freeze(["internal_task", "notification", "background_review"]);
const WAKE_BOUND_SET = new Set(WAKE_BOUND_DECISIONS);

/** Decisions that advance the checkpoint only — no intent row (§0.4 / §2.7). */
export const NON_WAKE_DECISIONS = Object.freeze(["context_update", "ignore"]);

/** The full decision set the taxonomy CHECK constrains to (§2.7). */
export const ALL_DECISIONS = Object.freeze([...WAKE_BOUND_DECISIONS, ...NON_WAKE_DECISIONS]);

/**
 * True iff a taxonomy decision produces a durable wake_intents row. Pure — the
 * unit of the routing decision map (§2.9.3). A covered event type always has a
 * decision in the CHECK set; an unknown decision is never wake-bound (the batch
 * loop treats it as "no row", never a silent intent).
 * @param {string} decision
 * @returns {boolean}
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

/** Resolve a DSN URL to a bare {host, port, db} (no password). Throws on garbage. */
function parseUrlTarget(url) {
  const u = new URL(url); // throws on an unparseable DSN — the caller surfaces it
  const db = decodeURIComponent((u.pathname || "").replace(/^\//, "")) || "postgres";
  return { host: (u.hostname || "").toLowerCase(), port: u.port || "5432", db };
}

/** The libpq PG* target, or null when no PG* identity var is set. */
function pgEnvTarget() {
  const { PGHOST, PGPORT, PGDATABASE, PGUSER } = process.env;
  if (!PGHOST && !PGPORT && !PGDATABASE && !PGUSER) return null; // no PG* source present
  return {
    host: (PGHOST || "localhost").toLowerCase(),
    port: PGPORT || "5432",
    db: PGDATABASE || PGUSER || "postgres",
  };
}

/**
 * Fail CLOSED when two present connection sources point at DIFFERENT databases
 * (mirrors packages/db/lib/pg.mjs's canonical-target guard). node-postgres would
 * use DATABASE_URL/WORKFLOW_POSTGRES_URL while a stray PG* could redirect an
 * external tool — so the relay must resolve exactly one target. Called before any
 * client/pool creation.
 */
export function assertNoTargetSplit() {
  const sources = [];
  if (process.env.DATABASE_URL) sources.push({ name: "DATABASE_URL", ...parseUrlTarget(process.env.DATABASE_URL) });
  if (process.env.WORKFLOW_POSTGRES_URL)
    sources.push({ name: "WORKFLOW_POSTGRES_URL", ...parseUrlTarget(process.env.WORKFLOW_POSTGRES_URL) });
  const pg = pgEnvTarget();
  if (pg) sources.push({ name: "PG*", ...pg });
  // Equality is transitive, so comparing every source against the first suffices.
  for (let i = 1; i < sources.length; i++) {
    const a = sources[0];
    const b = sources[i];
    if (a.host !== b.host || a.port !== b.port || a.db !== b.db) {
      throw new Error(
        `DB target split: ${a.name} (${a.host}:${a.port}/${a.db}) != ${b.name} (${b.host}:${b.port}/${b.db}). ` +
          `The relay must resolve exactly ONE target — unset the conflicting source. Refusing.`,
      );
    }
  }
}

/** @returns {pg.ClientConfig} */
export function connConfig() {
  assertNoTargetSplit(); // fail closed on a canonical-target split before connecting
  // DATABASE_URL wins over WORKFLOW_POSTGRES_URL; otherwise node-postgres reads
  // the libpq PG* vars itself when no connectionString is given.
  const url = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
  return url ? { connectionString: url } : {};
}

/** The relay pool (裁-149 clause 1): log-and-recycle on a background client error, never a
 *  crash — the contract, its counters and the leader-side correction live in
 *  lib/pool-error-contract.mjs, which is this module's ONLY new dependency.
 *  @param {pg.PoolConfig} [overrides] */
export function makePool(overrides = {}) {
  return attachPoolErrorContract(new pg.Pool({ ...connConfig(), max: 4, ...overrides }), "relay");
}

/** A single dedicated connection (the runner's leader session uses this). The CALLER owns its
 *  error posture and BOTH leader call sites already attach a listener that records the error
 *  and rethrows it into their own reconnect loop — see pool-error-contract.mjs clause 2 for
 *  why that as-built posture, not 裁-149's premise about it, is what this repo has. */
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
 * `onlyFirm` narrows discovery to a firm id (or an array of ids) — a TEST-SCOPING
 * knob so a test's relay never drains firms owned by other tests / seeds in a
 * shared DB (documented test-only; the runner leaves it unset ⇒ all firms, the
 * production behaviour).
 * @returns {Promise<{firmId:string, headSeq:number, lastSeq:number}[]>}
 */
export async function discoverWork(client, { consumer = CONSUMER, onlyFirm = null } = {}) {
  const firms = onlyFirm == null ? null : Array.isArray(onlyFirm) ? onlyFirm : [onlyFirm];
  const r = await client.query(
    `select s.firm_id,
            s.n                         as head_seq,
            coalesce(c.last_seq, 0)     as last_seq
       from clara.firm_event_seq s
       left join clara.relay_checkpoints c
              on c.consumer = $1 and c.firm_id = s.firm_id
      where s.n > coalesce(c.last_seq, 0)
        and ($2::uuid[] is null or s.firm_id = any($2::uuid[]))
      order by s.firm_id`,
    [consumer, firms],
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
 * round-8 (SHOULD C) — returns whether THIS call actually inserted a row (vs. a no-op replay
 * hitting the ON CONFLICT arm), so a caller that only owes work on a REAL insert (redrive()'s
 * own checkpoint rewind) can tell an idempotent re-redrive of an already-drained event apart
 * from a genuine first mint.
 * @returns {Promise<boolean>} true iff this call's own INSERT actually landed a new row.
 */
export async function insertWakeIntent(client, { eventId, decision, version }) {
  const r = await client.query(
    `insert into clara.wake_intents (event_id, decision, taxonomy_version)
       values ($1, $2, $3)
     on conflict (event_id) do nothing`,
    [eventId, decision, version],
  );
  return r.rowCount > 0;
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
 * Run one cycle: discover firms with pending events and drain them in ROUND-ROBIN,
 * bounded to `maxBatchesPerFirm` batches per firm per cycle (X1). A continuously
 * busy firm therefore cannot starve the others — every discovered firm gets a turn
 * each round, and a firm not caught up within the cap is rediscovered next cycle.
 * `capped` is true when at least one firm still had work when the cap was hit; the
 * runner loops again immediately (no poll wait) rather than idling on a backlog.
 * A {@link TaxonomyHaltError} from any batch propagates (the runner halts).
 * `onlyFirm` scopes discovery for tests (a firm id or an array of ids).
 * @returns {Promise<{firms:number, processed:number, intents:number, deadLetters:number, capped:boolean}>}
 */
export async function runRelayCycle(client, opts = {}) {
  const {
    consumer = CONSUMER,
    batchSize = 100,
    maxBatchesPerFirm = 4,
    testBatchDelayMs = 0,
    onlyFirm = null,
    log = () => {},
  } = opts;
  const work = await discoverWork(client, { consumer, onlyFirm });
  const cursors = work.map((w) => ({ firmId: w.firmId, lastSeq: w.lastSeq, active: true }));
  let processed = 0;
  let intents = 0;
  let deadLetters = 0;
  for (let round = 0; round < maxBatchesPerFirm; round++) {
    let anyActive = false;
    for (const cur of cursors) {
      if (!cur.active) continue;
      const res = await routeBatchForFirm(client, { firmId: cur.firmId, lastSeq: cur.lastSeq, batchSize, consumer, testBatchDelayMs, log });
      if (res.processed === 0) {
        cur.active = false;
        continue;
      }
      cur.lastSeq = res.maxSeq;
      processed += res.processed;
      intents += res.intents;
      deadLetters += res.deadLetters;
      anyActive = true;
      if (res.processed < batchSize) cur.active = false; // this firm is caught up
    }
    if (!anyActive) break;
  }
  const capped = cursors.some((c) => c.active); // a firm still had work when the cap was hit
  return { firms: work.length, processed, intents, deadLetters, capped };
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
 * round-7 (native adversarial leg, MUST #1) — MINTING is now checkpoint-aware. `safeCoalesceBound`
 * (wake-engine.mjs) excludes a seq from the checkpoint's advance ONLY while its dead-letter is
 * 'pending' — the instant this function resolves one (the branch below, whether or not an
 * intermediate reopen ever happened first), the wake_engine checkpoint is free to sail straight
 * past that seq, correctly, because there is genuinely nothing left in relay_dead_letters to
 * exclude it. The hazard is what this function itself did next, pre-fix: it minted the wake
 * intent anyway, at that same now-behind-the-checkpoint seq, with NOTHING checking whether the
 * checkpoint had already passed it. `writeCheckpoint`'s own `greatest()` never rewinds, and
 * `readHeldWakeRows` gates strictly on `event_seq > lastSeq` — a row born below the checkpoint is
 * invisible to every future wake-engine cycle, forever, silently (wakeEngineHealth's own `lag`
 * signal contributes 0 for a row below its checkpoint by construction; see wakeEngineHealth's own
 * new `heldBelowCheckpoint` counter, added as defense-in-depth precisely because a hole of this
 * exact shape was invisible until machine-reproduced). Not a race — no concurrent writer is
 * needed at all: a dead-letter already 'resolved' when the checkpoint advances, later redriven
 * once its type becomes wake-bound (with or without an intervening reopen through the branch
 * below), reproduces it with a single caller. Fix: under the SAME `wake_coalesce:<firmId>` lock
 * this function already takes (see the comment at its own acquisition site below), whenever this
 * function is about to MINT an intent, compare the event's own seq against the firm's CURRENT
 * wake_engine checkpoint; if the checkpoint is at or past that seq, REWIND it with a DIRECT
 * (non-greatest()) write to `seq - 1` — never wider, since anything strictly below this event's
 * own seq is still correctly excluded/included by whatever else set it there. The lock already
 * held means no concurrent checkpoint-writer (wake-engine.mjs's own advanceCheckpointIfClear,
 * which takes the identical lock) can race this read-then-write.
 * @returns {Promise<{resolved:boolean, decision?:string, wakeBound?:boolean, reason?:string}>}
 */
export async function redrive(client, consumer, eventId, { log = () => {} } = {}) {
  await client.query("begin");
  try {
    const taxonomy = await loadActiveTaxonomy(client); // HALT if un-routable
    // (X5a) the dead-letter MUST exist — a covered, never-dead-lettered event must
    // never report resolved. FOR UPDATE locks the row so a concurrent redrive/
    // consumer serializes on it.
    const dl = await client.query(
      "select status from clara.relay_dead_letters where consumer = $1 and event_id = $2 for update",
      [consumer, eventId],
    );
    if (dl.rowCount === 0) {
      throw new Error(`redrive: no dead-letter for consumer='${consumer}' event=${eventId} — nothing to redrive`);
    }
    const evR = await client.query("select event_type, firm_id, seq from clara.domain_events where id = $1", [eventId]);
    if (evR.rowCount === 0) {
      throw new Error(`redrive: event ${eventId} not found`);
    }
    const eventType = evR.rows[0].event_type;
    const eventSeq = Number(evR.rows[0].seq);
    const firmId = evR.rows[0].firm_id;
    // #1 (round-6, Codex) — the SAME per-firm advisory lock wake-engine.mjs's own
    // advanceCheckpointIfClear takes ('wake_coalesce:'||firm_id — the two literals MUST stay
    // byte-identical, proven by a battery cell exactly like N1's own JS/SQL pairing proof, never
    // trusted by spelling alone). Closes a TOCTOU round-5 left open: wake-engine's own coalesce
    // bounds itself on this dead-letter's CURRENT status (pending excludes the seq; resolved
    // does not) — without this lock, a resolved dead-letter here could flip BACK to pending
    // (the branch immediately below, when the type is still uncovered — despite the word
    // "redrive," this function is ALSO the reopen path) in the gap between wake-engine's own
    // bound READ and its checkpoint WRITE, letting the checkpoint sail straight over a seq that
    // a LATER genuine redrive then resurrects as wake-bound, invisible forever. Acquired before
    // either exit branch below (reopen or resolve+insert-intent) and held for this whole
    // transaction's own remaining lifetime — released at this function's own commit/rollback,
    // exactly like wake_source_gate's already-shipped pattern.
    await client.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", [`wake_coalesce:${firmId}`]);
    const decision = taxonomy.decisions.get(eventType);
    if (decision === undefined) {
      // (X5b) still uncovered — REOPEN if it was resolved (status/resolved_at are in
      // the dead-letter update allowlist), bump attempt_count, leave it pending.
      await client.query(
        `update clara.relay_dead_letters
            set status = 'pending', resolved_at = null, attempt_count = attempt_count + 1
          where consumer = $1 and event_id = $2`,
        [consumer, eventId],
      );
      await client.query("commit");
      log(`[relay] redrive: event ${eventId} (${eventType}) still uncovered under v${taxonomy.version} — left pending`);
      return { resolved: false, reason: "still-uncovered" };
    }
    if (isWakeBound(decision)) {
      // round-8 (SHOULD C) — insertWakeIntent now REPORTS whether it actually inserted (vs. an
      // idempotent re-redrive of an already-drained event hitting its own ON CONFLICT DO NOTHING
      // arm). The rewind below only matters the instant a NEW intent is born below the checkpoint
      // — an already-existing intent changes nothing about what is or is not visible, so gating on
      // a real insert turns a harmless-but-pointless rescan (every re-redrive of a settled event,
      // forever) into nothing at all.
      const minted = await insertWakeIntent(client, { eventId, decision, version: taxonomy.version });
      // round-7 (native adversarial leg, MUST #1) — see this function's own header comment above
      // for the full "no race needed" hazard. A wake-bound intent now exists at `eventSeq`; if
      // the WAKE ENGINE's own checkpoint for this firm is already AT OR PAST that seq (legitimate
      // at the time it was written — bound-3 only ever excludes a PENDING dead-letter, and this
      // one was not pending then), the held row this intent eventually drains into would be
      // permanently invisible to readHeldWakeRows' own `event_seq > lastSeq` gate. Rewind it with
      // a DIRECT write (never writeCheckpoint's own greatest() — that can only ever raise a
      // value, never lower one) to exactly one below this event's own seq — never wider, since
      // nothing below `eventSeq` is known by this call to need re-examination. Safe under the
      // lock already held above: the ONLY other writer of this same (consumer, firm) checkpoint
      // row is advanceCheckpointIfClear (wake-engine.mjs), which takes this identical
      // `wake_coalesce:<firmId>` lock before its own read-then-write, so no writer can race this
      // read-then-write either.
      if (minted) {
        const wakeCp = await client.query(
          "select last_seq from clara.relay_checkpoints where consumer = $1 and firm_id = $2",
          [WAKE_ENGINE_CONSUMER, firmId],
        );
        if (wakeCp.rowCount > 0 && Number(wakeCp.rows[0].last_seq) >= eventSeq) {
          await client.query(
            `update clara.relay_checkpoints set last_seq = $1, updated_at = now()
               where consumer = $2 and firm_id = $3`,
            [eventSeq - 1, WAKE_ENGINE_CONSUMER, firmId],
          );
          log(
            `[relay] redrive: event ${eventId} minted a wake intent at seq=${eventSeq}, at/behind the ` +
              `wake_engine checkpoint (was ${wakeCp.rows[0].last_seq}) — rewound to ${eventSeq - 1}`,
          );
        }
      }
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
