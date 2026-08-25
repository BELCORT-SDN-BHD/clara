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
//
// #2 (round-4 review, both legs) — THE IRREDUCIBLE WINDOW between a claim's own commit and the
// enqueue() call that follows it (a SEPARATE, unguarded step, by design — see the header comment
// above: no credential/state ever crosses that boundary that would make it worth widening into a
// single transaction). Every claim UPDATE's own source-enabled check now takes FOR SHARE (see
// claimWakeOutboxRow/processDirectQueueSource), which closes the DB-side race — a concurrent
// set_wake_source_enabled disable is now strictly ordered against an in-flight claim, never a
// stale-predicate race on the SAME statement. What FOR SHARE cannot close, because no amount of
// Postgres locking can hold a lock open across an external call: the claim's own transaction can
// commit (status->running, checkpoint advanced) and THEN — before enqueue() is even called, or
// while it is in flight — a disable can land. This is NOT a 2PC problem this engine tries to
// solve (2PC across Postgres and the WDK engine was never this design's shape, design §1.2a).
// The closing wall is downstream instead: `workflow_run_id` stays NULL until the dispatched run
// binds it back, and reconciler-wake.mjs's §A (`reenqueueStuckRows`) picks up EXACTLY that shape
// (running + workflow_run_id null, past grace) regardless of WHY the bind never happened — a
// crash, a lost nudge, or this exact disable-after-commit race are indistinguishable to it, and
// M2's own fix to `resolveSource` (drops the `enabled` filter deliberately) means this recovery
// still finds and re-enqueues the row even though its source is disabled NOW — VISIBLE (the row
// shows up in the belt every sweep until resolved) and NEVER SILENTLY STRANDED. Proven by the
// existing "M2 recovery" battery cell (wake-engine.test.mjs) — the setup there (a running/no-run
// row whose source is disabled) is exactly the state this race window converges to, regardless of
// which of the window's two edges produced it.
//
// #5/#8 (round-4 review, both legs) — VERIFIED, NOT YET GUARDED: no bank_agent/close_prep
// workflow body ships in this gate (G1-8's own seed comment: "NO scaffold due-predicate or
// workflow body ships... F-A3/F-A4 own that in their own follow-up PR"; `ls
// packages/runtime/workflows/` confirms zero wake-kind files exist as of this commit) — so the
// review's own premise ("does the wake workflow's first durable step CAS on task status")
// cannot be checked against real code, and the fix ("if no: add that guard") cannot be applied
// to a file that does not exist. Stated here as a CLOSED, NAMED OBLIGATION on whoever builds
// that first workflow (mirroring MUST F's own "closed obligation... not something this engine
// can enforce by itself" framing above, for the exact same structural reason): a cancel landing
// between enqueue() and the dispatched run's own first durable-step bind is a genuine, narrow
// gap — reconciler.mjs's own cancel-branch (section B) treats a null workflow_run_id as
// trivially "nothing to abort" and settles 'cancelled' immediately (M5's own fix only closes
// the case where a run IS bound; a run that started but has not bound back yet is
// indistinguishable, at the reconciler's own vantage point, from one that never started at
// all). If the run is genuinely live, it can keep acting under books that now say it stopped.
// THE CLOSING WALL: the dispatched workflow's own FIRST durable step attempt MUST re-read its
// own task's current status and refuse to proceed (a no-op exit, not an error) unless it is
// still 'running' — off `cancel_requested`/`cancelled`/`failed`, self-abort. This is the exact
// "duplicate start self-aborts" idiom reconciler-wake.mjs's own header comment already invokes
// for a DIFFERENT scenario (crash-recovery re-enqueue) — the SAME guard closes both: #8's
// duplicate-start (a re-enqueued run finding the task already bound/settled) and #5's
// unknown-abort (a run finding its own task cancelled out from under it). Until that guard
// ships with the real workflow body, this is a documented, understood, narrow residual risk —
// not a silently-missed one. Tracked: docs/plan/active/g1-wake-engine-design.md names this same
// obligation explicitly for F-A3/F-A4's own PRs.
import { setTimeout as sleep } from "node:timers/promises";
import { discoverWork, writeCheckpoint, acquireLeaderLock, setRuntimeRole, CONSUMER as ROUTER_CONSUMER } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

/** The wake-engine consumer name — its own checkpoint / lock key (relay_checkpoints,
 *  acquireLeaderLock, relay_dead_letters' carrier-1 ledger). NOT used directly as the
 *  wake_engine_task_dead_letters consumer any more — see the two split keys below (#6). */
export const WAKE_ENGINE_CONSUMER = "wake_engine";

/** #6 (round-4 review, both legs + opus SHOULD-A, converged) — the direct_queue carrier's own
 *  task-keyed dead-letter ledger (wake_engine_task_dead_letters) used to be written by TWO
 *  structurally different failure modes under the SAME (consumer, task_id) key:
 *  processDirectQueueSource's own CLAIM failures (this file) and reconciler-wake.mjs's own
 *  ENQUEUE failures (a task claimed 'running' whose enqueue() never bound a run). The prior
 *  comment on readDeadLetterAttempts argued these were "mutually exclusive per task_id in
 *  practice" — TRUE only while the claim path never re-attempts after exhaustion. It can: if the
 *  exhaustion-terminal settle (queued->failed) itself fails (M4's own try/catch leaves the row
 *  'queued' for a later sweep), the NEXT cycle re-attempts the SAME claim against a ledger
 *  that's ALREADY at the cap — a transient (not permanent) poison could then let it through,
 *  dispatching a task the cap was supposed to have stopped. Splitting the key removes the
 *  cross-contamination risk entirely, on both sides: the claim path now ALSO checks first
 *  (mirroring reconciler-wake's own sticky-exhaustion pattern) against its OWN budget, and an
 *  enqueue-path exhaustion can never count against a claim-path cap or vice versa. */
export const WAKE_ENGINE_CLAIM_CONSUMER = `${WAKE_ENGINE_CONSUMER}_claim`;
export const WAKE_ENGINE_ENQUEUE_CONSUMER = `${WAKE_ENGINE_CONSUMER}_enqueue`;

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;
const POLL_INTERVAL_MS = Number(process.env.CLARA_WAKE_ENGINE_POLL_MS || 2000);

// ---------------------------------------------------------------------------
// Registry read — re-read EVERY cycle, never cached (design §1.2c / battery D4).
// ---------------------------------------------------------------------------

/** Enabled sources, split by carrier and keyed for O(1) lookup at claim time. */
export async function loadEnabledSources(client) {
  // #6 (round-4 review — found reproducing the review's own claim-ledger fix, not a named
  // finding): ORDER BY created_at makes the dedup below deterministic. Without it, TWO enabled
  // direct_queue sources sharing the SAME task_kind (nothing in the schema forbids it —
  // wake_engine_sources.source_key is the primary key, not task_kind; S3's own CHECK only
  // closes the task_kind DOMAIN, never uniqueness within it) would BOTH survive into
  // `directQueue` as an array, and runWakeEngineCycle's own loop calls processDirectQueueSource
  // ONCE PER ENTRY — the SAME 'queued' row then gets a SEPARATE claim attempt under EACH
  // source's own (possibly different) max_attempts, defeating the claim ledger's own exhaustion
  // cap the instant a second, differently-configured source for the same kind exists.
  // N3 (round-5, opus NOTE): created_at alone can tie within one transaction (multiple sources
  // registered in the same commit share one statement-clock timestamp) — source_key (this
  // table's own primary key) is the deterministic secondary tiebreak, so "most-recently-
  // created wins" never degrades back into an arbitrary pick at the tie.
  const r = await client.query(
    `select source_key, carrier, event_type, task_kind, wake_kind, workflow_export,
            login_pool, max_attempts
       from clara.wake_engine_sources
      where enabled
      order by created_at asc, source_key asc`,
  );
  const byEventType = new Map(); // carrier='wake_outbox', keyed on event_type
  const directQueueByTaskKind = new Map(); // carrier='direct_queue', keyed on task_kind — same
  // dedup shape as byEventType (last, i.e. most-recently-created, wins); a task_kind is a
  // closed-world domain (S3), so ONE canonical source per kind is the correct production
  // invariant, not merely a test-hygiene convenience.
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
    else directQueueByTaskKind.set(row.task_kind, source);
  }
  return { byEventType, directQueue: [...directQueueByTaskKind.values()] };
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
 *  — the SAME direct_queue dead-letter home, now on TWO SEPARATE keys (#6, round-4 — see
 *  WAKE_ENGINE_CLAIM_CONSUMER/WAKE_ENGINE_ENQUEUE_CONSUMER's own comment above for why the
 *  earlier "shared budget is intentional" argument did not survive review). `consumer` is a
 *  REQUIRED, explicit argument on both functions below — never a default — so every call site
 *  states which ledger it means, on the record, rather than silently inheriting one. */
/** M6 (opus+Codex review): read-only — has this task's dead-letter row (if any) already
 *  reached its source's max_attempts, ON THIS SPECIFIC LEDGER? Both the claim path (this file)
 *  and the enqueue path (reconciler-wake.mjs) check this FIRST, before touching their own
 *  respective action at all, so exhaustion is STICKY on each ledger independently: once EITHER
 *  cap is reached, every later sweep on THAT path skips straight to (re-)settling and never
 *  re-attempts its own action again, even if a settle attempt itself fails and the row becomes
 *  eligible again next sweep. */
/** N2 (round-5, opus NOTE) — a missing/unrecognized `consumer` used to fall through silently:
 *  `readDeadLetterAttempts` would query with an undefined/null/garbage value, find no matching
 *  row (nothing is ever written under one), and return 0 — indistinguishable from "genuinely
 *  zero prior attempts." A caller that forgot to pass `consumer` at all (a refactor slip, a
 *  future third ledger added without updating every call site) would silently read as "never
 *  tried," letting the check-first guard's own cap logic pass every single time — the exact
 *  fail-OPEN this ledger split exists to prevent. Both functions below now validate `consumer`
 *  is one of the two closed-world keys and THROW otherwise — fail-closed on an unrecognized
 *  identity, never a silent zero. */
function assertKnownDeadLetterConsumer(consumer) {
  if (consumer !== WAKE_ENGINE_CLAIM_CONSUMER && consumer !== WAKE_ENGINE_ENQUEUE_CONSUMER) {
    throw new Error(`wake_engine_task_dead_letters: unrecognized consumer "${consumer}" — must be WAKE_ENGINE_CLAIM_CONSUMER or WAKE_ENGINE_ENQUEUE_CONSUMER, never omitted or guessed`);
  }
}

export async function readDeadLetterAttempts(client, { consumer, taskId }) {
  assertKnownDeadLetterConsumer(consumer);
  const r = await client.query(
    "select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2",
    [consumer, taskId],
  );
  return r.rows[0]?.attempt_count ?? 0;
}

export async function recordTaskDeadLetter(client, { consumer, taskId, reason }) {
  assertKnownDeadLetterConsumer(consumer);
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.wake_engine_task_dead_letters (consumer, task_id, reason)
         values ($1, $2, $3)
       on conflict (consumer, task_id) do update
         set attempt_count = clara.wake_engine_task_dead_letters.attempt_count + 1
       returning attempt_count`,
      [consumer, taskId, String(reason).slice(0, 500)],
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

/** One held row's claim: held->running. NO credential is minted here (MUST F) — that is the
 *  dispatched workflow's own first-step obligation. Round-6 (Codex #1): the checkpoint advance
 *  is a SEPARATE call the caller makes right after this one returns, not nested in this same
 *  transaction — see advanceCheckpointIfClear's own header. SHOULD H (opus/
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
 *  checkpoint visibly in place until the source re-enables).
 *
 *  #1(a) (round-4 review, both legs, REOPENED) — a batch can contain a HIDDEN-EARLIER row
 *  alongside a VISIBLE-LATER one: readHeldWakeRows' own SKIP LOCKED can hide seq=3 (locked by a
 *  concurrent transaction — another cancel_agent_task, another leader's overlapping claim) while
 *  still returning seq=5 as claimable. Pre-fix, THIS function wrote the checkpoint straight to
 *  row.eventSeq (5) the instant the claim committed — completely independent of whether an
 *  EARLIER seq was ever accounted for. hasHiddenHeldRow only ran later (empty-batch or trailing
 *  coalesce) against the ALREADY-ADVANCED cursor, so it only ever looked FORWARD from 5 — seq=3,
 *  sitting BEHIND the cursor, was invisible to that check forever, and writeCheckpoint's own
 *  greatest() semantics meant seq=3 could never be reached again once the lock released
 *  (readHeldWakeRows' own `event_seq > lastSeq` predicate would permanently exclude it). Fix:
 *  before writing the checkpoint to THIS row's own seq, prove no held row is hidden in
 *  (priorSeq, row.eventSeq) — the exact gap this row's own advance would otherwise silently
 *  claim as processed. If one is hidden, the ROW ITSELF still claims normally (SKIP LOCKED does
 *  not block seq=5's own claim — it is genuinely available), but the checkpoint write is
 *  SKIPPED, leaving it at priorSeq until the earlier row's own hider resolves (a self-healing
 *  wait — see the caller's own comment for why this cannot orphan seq=5's dispatch). */
async function claimWakeOutboxRow(client, { row, sourceKey }) {
  await client.query("begin");
  try {
    // #2 (round-4 review, both legs) — without SOME cross-transaction dependency, the exists-check
    // below is a plain (unlocked) read; a concurrent set_wake_source_enabled disable can commit
    // its own UPDATE on this SAME source row in the gap between this statement's own snapshot and
    // this transaction's commit, and Postgres never re-validates an already-read WHERE predicate
    // against a later writer — this transaction's claim would go through anyway (a classic READ
    // COMMITTED "stale predicate" anomaly, not caught by the CAS on agent_tasks.status, which is a
    // DIFFERENT row). The review's own prescribed fix was `FOR SHARE` on the source row — MEASURED
    // and REJECTED: clara_runtime holds only SELECT on wake_engine_sources (by design — it must
    // never gain write reach on an owner-floor registry, T.5b's own census), and Postgres's row-
    // locking clauses (FOR SHARE/FOR UPDATE/FOR KEY SHARE alike, empirically confirmed against
    // this exact rig — `permission denied for table wake_engine_sources`, 42501) require UPDATE
    // privilege on the table, not merely SELECT; granting it — even a single harmless column — is
    // a real security-posture WIDENING on a table only ever meant to be written through
    // set_wake_source_enabled's own SECURITY DEFINER floor, not something to do silently on a
    // reviewer's say-so (hard constraint 1). A Postgres ADVISORY transaction lock achieves the
    // IDENTICAL mutual-exclusion property with ZERO grant footprint (pg_advisory_xact_lock needs
    // no table ACL at all, confirmed against this same rig as clara_runtime) — keyed on the source
    // key under a namespace ('wake_source_gate:') distinct from acquireLeaderLock's own consumer-
    // keyed SESSION lock (relay.mjs:168) so the two can never collide. set_wake_source_enabled
    // takes the SAME lock, under the SAME key, before its own flip (migration §, "#2 round-4") —
    // whichever side acquires it first is strictly ordered before the other, exactly FOR SHARE's
    // own guarantee, without ever needing to lock a row this role has no business writing to.
    await client.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", [`wake_source_gate:${sourceKey}`]);
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
    // #1 (round-6, Codex): the checkpoint advance moved OUT of this transaction and into its
    // OWN, called by the caller right after this one commits — see advanceCheckpointIfClear's
    // own header for why (it now needs to hold a per-firm advisory lock for the ENTIRE
    // bound-read-through-write critical section, and nesting a second BEGIN inside this
    // transaction would silently commit THIS one early instead of scoping a lock to a sub-
    // section of it). Splitting is safe: a crash between this commit and that one just leaves
    // the checkpoint lagging behind an already-'running' (therefore invisible to
    // readHeldWakeRows) row — the SAME lag this whole design already tolerates everywhere else.
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
 *  never the raw firm_event_seq head. See the module-level comment above for the two bounds.
 *
 *  #1(b) (round-4 review, both legs, REOPENED) — a THIRD bound: the router's own dead-letter
 *  redrive (relay.mjs `redrive()`) can insert a BRAND-NEW pending wake_intents row for an event
 *  that was dead-lettered (uncovered) long ago and only NOW resolves wake-bound — at that
 *  event's own ORIGINAL seq, which can sit BELOW the router's CURRENT checkpoint (the router's
 *  own checkpoint advances past a dead-lettered event exactly like this engine's own poison-skip
 *  advances past an exhausted row — dead-lettering is a terminal outcome for that event under
 *  the taxonomy version active AT THE TIME, not a block). Bound 2 (min pending wake_intent seq)
 *  only protects a redrive that has ALREADY landed by the time this bound is computed — a
 *  redrive that lands AFTER this coalesce commits, for an event whose seq is already below the
 *  just-written checkpoint, would strand it exactly like the original M1 gap, just reached via
 *  an admin operation instead of ordinary traffic. Bound 3 closes it: never coalesce past the
 *  lowest seq among this firm's own STILL-PENDING (unredriven) router dead-letters — any one of
 *  them could resolve wake-bound on a FUTURE redrive, at ITS OWN (possibly low) seq, and this
 *  bound holds the line until that redrive either resolves it (bound 2 then covers the freshly-
 *  minted pending intent, seamlessly, in the SAME transaction redrive uses) or it is otherwise
 *  resolved. Fail-closed, matching this bound's own siblings: a firm with a long-unredriven
 *  dead-letter simply lags rather than risking a silent strand. NOTE-c (opus): CONSUMER is
 *  imported from relay.mjs (ROUTER_CONSUMER), never a bare 'router' literal, so a future rename
 *  of the router's own consumer name cannot silently desync this bound from reality. */
async function safeCoalesceBound(client, firmId) {
  const r = await client.query(
    `select least(
        coalesce((select last_seq from clara.relay_checkpoints where consumer=$2 and firm_id=$1), 0),
        coalesce((select min(wi.event_seq) - 1 from clara.wake_intents wi where wi.firm_id=$1 and wi.status='pending'), 9223372036854775807),
        coalesce((select min(dl.event_seq) - 1 from clara.relay_dead_letters dl where dl.consumer=$2 and dl.firm_id=$1 and dl.status='pending'), 9223372036854775807)
      )::bigint as bound`,
    [firmId, ROUTER_CONSUMER],
  );
  return Number(r.rows[0].bound);
}

/** Lock-free (no FOR UPDATE / SKIP LOCKED) existence check for a held wake row in
 *  (fromSeqExclusive, toSeqInclusive] — closes the skip-locked variant of M1: a row this
 *  cycle's own locking read could not see is still a row that must not be coalesced past.
 *  `excludeTaskId` (round-5, SHOULD-1's own plumbing): the row-loop callers below are always
 *  checking this range WHILE they themselves hold an opinion about ONE specific task — for the
 *  claimed/raced branches that task's own status has already flipped away from 'held' by the
 *  time this runs (so it would never match anyway), but poison-skip-exhausted's own row is
 *  STILL genuinely 'held' at this point (the claim attempt itself failed and rolled back) — an
 *  inclusive range that happened to reach that row's own seq would wrongly see it as "hidden"
 *  and block the poison-skip the caller is deliberately choosing to make. Excluding the row
 *  we're already resolving by id (never by seq arithmetic) keeps the range check honest in
 *  every caller uniformly. */
async function hasHiddenHeldRow(client, { firmId, fromSeqExclusive, toSeqInclusive, excludeTaskId = null }) {
  const r = await client.query(
    `select exists(
       select 1 from clara.agent_tasks at
       join clara.wake_intents wi on wi.id = at.origin_intent_id
      where at.kind = 'wake' and at.status = 'held' and wi.firm_id = $1
        and wi.event_seq > $2 and wi.event_seq <= $3
        and ($4::uuid is null or at.id <> $4)
     ) as hidden`,
    [firmId, fromSeqExclusive, toSeqInclusive, excludeTaskId],
  );
  return r.rows[0].hidden;
}

// No specific row seq to cap against (the trailing/empty-batch coalesce path) — advance as far
// as safeCoalesceBound's own minimum allows, full stop. Comfortably below Postgres's own MAXINT
// sentinel (9223372036854775807) used inside safeCoalesceBound's COALESCE fallbacks, so
// Math.min(NO_CAP, safeBound) always yields safeBound in any real firm's own seq space.
const NO_SEQ_CAP = Number.MAX_SAFE_INTEGER;

/** #1(a) (round-4) + SHOULD-1 (round-5, opus reviewer's own trace) + #1 (round-6, Codex) —
 *  advance the checkpoint toward `seq` (or, with no specific row to cap against — the trailing/
 *  empty-batch coalesce path, `seq` omitted — as far as the bound alone allows) ONLY as far as
 *  is PROVABLY safe. Round-4 only added the hidden-HELD-row check; round-5 (SHOULD-1) found
 *  that asymmetric with the coalesce path's own bound — a PENDING wake_intent or PENDING router
 *  dead-letter at a LOWER seq than a just-claimed row has not materialized into a held task at
 *  all, so hasHiddenHeldRow (materialized rows only) cannot catch it, and capped the candidate
 *  to `min(seq, safeCoalesceBound(firm))`.
 *
 *  #1 (round-6, Codex, REOPENED) — that cap still raced the DEAD-LETTER STATE MACHINE itself:
 *  safeCoalesceBound's own bound-3 reads relay_dead_letters.status at ONE instant; a concurrent
 *  `redrive()` can flip a 'resolved' dead-letter back to 'pending' (relay.mjs's own "still
 *  uncovered" reopen branch) in the gap between THIS function's bound read and its checkpoint
 *  write — the read saw resolved (no exclusion), the write lands, and the reopen's own later
 *  redrive then resurrects a wake-bound intent at a seq already behind the checkpoint,
 *  invisible forever. Not a wider bound — a WIDER bound cannot fix a race in WHEN the bound is
 *  read relative to a concurrent writer; only serialization can. Fix: this function now owns
 *  its ENTIRE transaction (bound read through checkpoint write, one commit) and holds a
 *  per-firm advisory lock (`wake_coalesce:<firmId>`) for that whole duration — the SAME lock
 *  `redrive()` now takes before EITHER of its own exit branches (relay.mjs's own #1 comment).
 *  Whichever side acquires the lock first is strictly ordered before the other: a reopen either
 *  fully lands before this function's own bound read (so bound-3 correctly excludes it) or
 *  fully waits until after this function's own commit (so the checkpoint it just wrote is
 *  already durable, and the reopen's own later redrive lands at whatever seq it does — bound-3
 *  picks it up on the very NEXT cycle, never silently skipped). Owning the transaction is also
 *  why this is no longer nested inside claimWakeOutboxRow's own claim transaction (see that
 *  function's own header) — a lock scoped to a SUB-section of an already-open transaction is
 *  not expressible in Postgres; the checkpoint advance is its own transaction now, always.
 *  Returns the seq actually reached (unchanged from priorSeq if nothing was safe to advance). */
async function advanceCheckpointIfClear(client, { firmId, priorSeq, seq = NO_SEQ_CAP, excludeTaskId = null }) {
  if (seq <= priorSeq) return priorSeq;
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", [`wake_coalesce:${firmId}`]);
    const safeBound = await safeCoalesceBound(client, firmId);
    const target = Math.min(seq, safeBound);
    if (target <= priorSeq) {
      await client.query("commit");
      return priorSeq;
    }
    const hidden = await hasHiddenHeldRow(client, { firmId, fromSeqExclusive: priorSeq, toSeqInclusive: target, excludeTaskId });
    if (hidden) {
      await client.query("commit");
      return priorSeq;
    }
    await writeCheckpoint(client, { consumer: WAKE_ENGINE_CONSUMER, firmId, seq: target });
    await client.query("commit");
    return target;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    throw err;
  }
}

/** Thin wrapper preserving the trailing/empty-batch call sites' own existing shape — no
 *  specific row seq to cap against, so `seq` is omitted (NO_SEQ_CAP). */
async function coalesceIfSafe(client, { firmId, from }) {
  return advanceCheckpointIfClear(client, { firmId, priorSeq: from });
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

  // NOTE-d (opus, round-4 review): `cursor` NEVER leads the persisted checkpoint, by invariant —
  // every branch below that can move it (claimed/raced/poison-skip-exhausted, plus the trailing
  // coalesce) only does so through a call that itself writes clara.relay_checkpoints FIRST
  // (directly inline for the claimed path inside claimWakeOutboxRow, or via
  // advanceCheckpointIfClear/coalesceIfSafe for the others) and returns the new value ONLY on a
  // successful write — this is what #1(a)'s own fix changed FROM (cursor used to jump ahead of
  // an unwritten checkpoint on the claimed path specifically). Reading `cursor` after this loop
  // is therefore always reading a value the DB already agrees with, never a JS-side prediction
  // of a write that has not landed yet.
  let cursor = lastSeq;
  for (const row of rows) {
    const source = sources.byEventType.get(row.eventType);
    if (!source) {
      // Unregistered/disabled source: BLOCK this firm's carrier-1 processing this cycle (see
      // module header). Nothing is wrong — the source simply has not shipped/enabled yet.
      return { maxSeq: cursor, blocked: true, counts, readCount: rows.length };
    }
    const res = await claimWakeOutboxRow(client, { row, sourceKey: source.sourceKey });
    if (res.ok) {
      if (res.claimed) {
        // #1(a) + SHOULD-1 + #1 (round-6): the checkpoint advance is now its OWN transaction,
        // called here right after the claim's own commit (see claimWakeOutboxRow's + this
        // function's own headers for why) — cursor moves to whatever it actually proved safe,
        // never assumed to reach row.eventSeq itself; a pending intent/dead-letter at a LOWER
        // seq can cap it short even though THIS row (genuinely available under SKIP LOCKED)
        // still claims and dispatches normally below.
        cursor = await advanceCheckpointIfClear(client, { firmId, priorSeq: cursor, seq: row.eventSeq, excludeTaskId: row.taskId });
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
        // moved it (e.g. a concurrent claim, or a human's cancel_agent_task racing us). #1(a) +
        // SHOULD-1: this seq IS spoken for, but advancing the checkpoint to it is the SAME race
        // as the claimed path — gate it identically (this row is no longer 'held' either way, so
        // excluding it from the hidden-row check is defensive, not load-bearing, here).
        cursor = await advanceCheckpointIfClear(client, { firmId, priorSeq: cursor, seq: row.eventSeq, excludeTaskId: row.taskId });
        log(`[wake-engine] task=${row.taskId} raced (no longer 'held' at claim) — checkpoint advances, no dispatch`);
      }
      continue;
    }
    // Claim failed (a transient DB error on the plain UPDATE/checkpoint write) — dead-letter + poison-skip.
    const attempts = await recordEventDeadLetter(client, { eventId: row.eventId, reason: res.err?.message ?? String(res.err) });
    if (attempts >= source.maxAttempts) {
      log(`[wake-engine] event=${row.eventId} source=${source.sourceKey} exhausted ${source.maxAttempts} attempts -> dead-lettered + skipped: ${res.err?.message ?? res.err}`);
      // #1(a) + SHOULD-1: same guard — a poison-skip's own checkpoint advance is not exempt from
      // the hidden-earlier-row race either. This row IS still genuinely 'held' here (the claim
      // attempt failed and rolled back) — excludeTaskId is LOAD-BEARING in this branch
      // specifically, or the hidden-row check would see this row's own still-'held' status and
      // wrongly refuse the poison-skip we are deliberately choosing to make.
      cursor = await advanceCheckpointIfClear(client, { firmId, priorSeq: cursor, seq: row.eventSeq, excludeTaskId: row.taskId });
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
    // #6 (round-4 review, both legs + opus SHOULD-A, converged): CHECK the claim-path's OWN
    // ledger FIRST, before ever re-attempting the claim UPDATE. Pre-fix, a claim was attempted
    // unconditionally every cycle — once genuinely exhausted, if the exhaustion-terminal settle
    // itself then failed (M4's own try/catch below leaves the row 'queued' for a later sweep),
    // the very NEXT cycle re-attempted the SAME claim regardless — a transient (not permanent)
    // poison could then let it through, dispatching a task the cap was meant to have stopped.
    // Mirrors reconciler-wake.mjs's own check-first sticky-exhaustion pattern (M6), on this
    // path's OWN separate ledger (WAKE_ENGINE_CLAIM_CONSUMER — see the module header for why
    // this must never share a key with the enqueue path's own budget).
    const priorClaimAttempts = await readDeadLetterAttempts(client, { consumer: WAKE_ENGINE_CLAIM_CONSUMER, taskId: row.id });
    if (priorClaimAttempts >= source.maxAttempts) {
      try {
        await client.query("update clara.agent_tasks set status='failed', error_code='internal' where id=$1 and status='queued'", [row.id]);
        counts.deadLettered += 1;
        log(`[wake-engine] task=${row.id} source=${source.sourceKey} already exhausted (${priorClaimAttempts}/${source.maxAttempts}) on the claim ledger — re-settling failed, claim NOT re-attempted`);
      } catch (termErr) {
        counts.failed += 1;
        log(`[wake-engine] task=${row.id} source=${source.sourceKey} already exhausted on the claim ledger but the re-settle ITSELF failed — leaving 'queued' for a later sweep: ${termErr?.message ?? termErr}`);
      }
      continue;
    }
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
      // "still queued" branch needed. #2 (round-4 review): the SAME advisory-lock mutual
      // exclusion as claimWakeOutboxRow's own comment (FOR SHARE measured and rejected there —
      // it needs UPDATE privilege on wake_engine_sources, which clara_runtime correctly lacks).
      await client.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", [`wake_source_gate:${source.sourceKey}`]);
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
      const attempts = await recordTaskDeadLetter(client, { consumer: WAKE_ENGINE_CLAIM_CONSUMER, taskId: row.id, reason: err?.message ?? String(err) });
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
         -- #6 (round-4 review): the task-keyed ledger is now split into TWO consumer keys (claim
         -- vs enqueue, never sharing a budget) — both count toward this health signal, since an
         -- operator reading pendingDeadLetters cares that SOMETHING is stuck, not which ledger.
         + (select count(*) from clara.wake_engine_task_dead_letters where consumer = any($2) and status = 'pending')::int
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
         as held_for_disabled_source,
       -- NOTE-b (opus, round-4 review): a wake/close_prep row can sit in 'cancel_requested'
       -- indefinitely if the reconciler's own settle keeps failing (reconciler.mjs section B —
       -- a genuine cancel() failure deliberately leaves the row for the next sweep rather than
       -- fabricating a receipt, M5) — today nothing surfaces this accumulating, silently, the
       -- same blind spot MUST F(liveness) closed for the checkpoint. A raw count, no staleness
       -- threshold (matching heldForDisabledSource's own shape): any non-zero value here is
       -- worth an operator's attention regardless of how long it has sat.
       (select count(*) from clara.agent_tasks
          where status = 'cancel_requested'
            and kind = any(select task_kind from clara.wake_engine_sources))::int
         as cancel_requested_stuck`,
    [WAKE_ENGINE_CONSUMER, [WAKE_ENGINE_CLAIM_CONSUMER, WAKE_ENGINE_ENQUEUE_CONSUMER]],
  );
  const row = r.rows[0];
  return {
    consumer: WAKE_ENGINE_CONSUMER,
    lag: Number(row.lag),
    pendingDeadLetters: row.pending_dead_letters,
    firmsTracked: row.firms_tracked,
    heldForDisabledSource: row.held_for_disabled_source,
    cancelRequestedStuck: row.cancel_requested_stuck,
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
