// The autodraft consumer — the independent auto-draft sweep lane (Wave A, contract §3 /
// companion §4-5). A THIRD registered spine consumer beside the router + matcher, reusing
// lib/relay.mjs's discovery/checkpoint/dead-letter primitives UNCHANGED (they already take a
// `consumer`) — the router + matcher stay byte-identical. Own name ('autodraft'), own
// advisory lock key (hashtext('autodraft')), own (consumer,firm) checkpoint, own dead-letter
// lane, own /ready WARN signal. Subscribes DIRECTLY to document.invoice_facts_completed /
// _failed and entry.withdrawn (matcher precedent — no trigger_taxonomy read; every other type
// is a checkpoint-only advance). The consumer NEVER runs a model (the matcher contract): for
// facts events it resolves the event's document -> active filing(s), pre-creates a sweep run,
// and admits one autodraft task per filing
// via clara.admit_autodraft_task (which re-evaluates the lane, enforces the filing-keyed
// registry, and RESERVES budget). For GM-10 it hands the exact withdrawal event id to the
// audited DB door, which alone can prove event -> prior task -> entry -> filing identity and
// select 0053's human-act exception. It enqueues autoDraft_v1 for each task-minting outcome. A
// catch-up pass re-admits list_autodraft_candidates() stragglers and finalizes stale runs; both
// ordinary unattended paths remain origin='sweep'.
//
// Read-surface note (integration cross-check): the event -> filing resolution goes through
// deps.resolveDocumentFilings, defaulting to clara.list_document_autodraft_candidates(document)
// — a runtime-granted DEFINER read (document-scoped twin of list_autodraft_candidates). The
// runtime login has NO direct SELECT on clara.document_filings (0007 grants it only to
// authenticated + agent_ro), so a definer resolver is required; see REPORT-C.
//
// Connections come from the environment ONLY, via pools.makeRuntimeClient (the matcher idiom).
//
// F2-R (opus review, round 2): a GM-10 withdrawal deferred pending its owner task's
// settlement is retained UNBOUNDED, never dead-lettered — the reconciler's own orphan-settle
// window (30 minutes) is the recovery, and a bounded give-up would silently lose a human's
// deliberate re-admission act. The deferral is made LOUD instead: autodraftHealth's
// deferredWithdrawals count + a throttled log line, never a spent poison budget.

import { setTimeout as sleep } from "node:timers/promises";
import { discoverWork, writeCheckpoint, acquireLeaderLock, setRuntimeRole } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

/** The autodraft consumer name — its own checkpoint / dead-letter / lock key. */
export const AUTODRAFT_CONSUMER = "autodraft";
/** The event types the consumer acts on; all others are checkpoint-only. */
export const AUTODRAFT_EVENT_TYPES = Object.freeze([
  "document.invoice_facts_completed",
  "document.invoice_facts_failed",
  "entry.withdrawn",
]);
const AUTODRAFT_EVENT_SET = new Set(AUTODRAFT_EVENT_TYPES);

const MAX_ATTEMPTS = Number(process.env.CLARA_AUTODRAFT_MAX_ATTEMPTS || 5);
// F2-R (opus review, round 2 — SUPERSEDES the round-1 cycle-bound). retry_pending_settlement
// (a LIVE owner task, GM-10) is a real, not-yet-terminal fact -- never an error -- and the
// round-1 fix's MAX_RETRY_PENDING_CYCLES bound was measured to give up in ~10s of WALL-CLOCK
// time (waitForNudge makes cycle rate a function of estate traffic -- 113ms/cycle under
// nudge pressure), while the recovery this deferral races -- the reconciler's orphan settle
// -- runs on a 30-MINUTE window. Once the round-1 fix's checkpoint advanced past the event,
// the act was LOST exactly like F1's own bug: the door stays admissible, but the consumer
// never asks it again, and the ordinary catch-up sweep answers already_done once the orphan
// eventually settles. Accounting-correctness rules the tradeoff: a LOUD unbounded stall loses
// nothing (the reconciler's own 30-minute window unblocks it); a quiet bounded give-up loses
// a human's deliberate act. So the deferral is UNBOUNDED again -- retained, never
// checkpointed, never dead-lettered -- and made LOUD instead: autodraftHealth's
// deferredWithdrawals count (below) and the throttled log line are the signal.
const DEFERRAL_LOG_INTERVAL_MS = Number(process.env.CLARA_AUTODRAFT_DEFERRAL_LOG_MS || 60000);
const POLL_INTERVAL_MS = Number(process.env.CLARA_AUTODRAFT_POLL_MS || 2000);
const CATCHUP_MS = Number(process.env.CLARA_AUTODRAFT_CATCHUP_SECONDS || 300) * 1000;
const RESERVE_TOKENS = Number(process.env.CLARA_AUTODRAFT_RESERVE_TOKENS || 40000);
const SWEEP_MODEL = process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

// ---------------------------------------------------------------------------
// Pure helpers — no DB, fully unit-testable.
// ---------------------------------------------------------------------------

/** True iff an admission outcome should enqueue a run. THREE outcomes mint a REAL queued
 *  clara.agent_tasks row through the same mint pipeline and must each be enqueued exactly like
 *  a fresh admit — leaving any of them un-enqueued means a row is created that never runs
 *  (design §4.10):
 *    'admitted'                     — the first-ever dispatch for a filing.
 *    're_admitted'                  — the 0034 supersede outcome (a FAILED/CANCELLED/EXPIRED
 *                                     task retried).
 *    're_admitted_after_withdrawal' — the 0053 / §7-A F8 outcome: a COMPLETED task whose entry
 *                                     was withdrawn, so the filing has no standing draft and
 *                                     CLR23's own "withdraw and re-draft" remedy is finally
 *                                     honourable through the unattended door. It is a SEPARATE
 *                                     token, not a reuse of 're_admitted', because it reports a
 *                                     different event — see 0053's header.
 *  noop_existing / already_done / refused_budget / refused_attempts / lane_changed /
 *  skipped_direction all wrote their own sweep_run_item (where run-bound) and must NOT enqueue
 *  (idempotency + no double-spend). Pure. */
export function admissionNeedsStart(outcome) {
  return outcome === "admitted"
    || outcome === "re_admitted"
    || outcome === "re_admitted_after_withdrawal";
}

// ---------------------------------------------------------------------------
// The document -> active-filing resolver (default: the runtime-granted definer read;
// injectable so unit tests feed synthetic filings without a DB). Returns [{firmId, filingId}].
// ---------------------------------------------------------------------------
export async function resolveDocumentFilings(client, { firmId, documentId }) {
  const r = await client.query("select firm_id, filing_id from clara.list_document_autodraft_candidates($1)", [documentId]);
  return r.rows
    .map((row) => ({ firmId: String(row.firm_id ?? firmId), filingId: String(row.filing_id) }))
    .filter((f) => f.filingId && f.filingId !== "null");
}

// ---------------------------------------------------------------------------
// Per-document admission — pre-create a sweep run sized to the document's filings, admit one
// task per filing, collect the 'admitted' task ids. MUST run inside the caller's OPEN txn.
// The enqueue of admitted tasks happens AFTER commit (the chat-admission idiom: reconciler
// re-enqueues an admitted-but-unstarted task). Injectable resolver via deps.resolveDocumentFilings.
// ---------------------------------------------------------------------------
export async function admitDocument(client, { firmId, documentId }, deps = {}) {
  const resolver = deps.resolveDocumentFilings ?? resolveDocumentFilings;
  const model = deps.model ?? SWEEP_MODEL;
  const reserve = deps.reserveTokens ?? RESERVE_TOKENS;
  const filings = await resolver(client, { firmId, documentId });
  if (!Array.isArray(filings) || filings.length === 0) return { admitted: [], filings: 0, runId: null };

  const runRes = await client.query("select clara.open_sweep_run($1, $2) as run_id", [firmId, filings.length]);
  const runId = runRes.rows[0].run_id;
  const admitted = [];
  for (const f of filings) {
    const r = await client.query("select clara.admit_autodraft_task($1, $2, $3, $4, $5) as receipt", [
      f.filingId,
      "sweep",
      runId,
      model,
      reserve,
    ]);
    const receipt = (r.rows[0]?.receipt ?? {});
    if (admissionNeedsStart(receipt.outcome) && receipt.task_id) admitted.push(String(receipt.task_id));
  }
  return { admitted, filings: filings.length, runId };
}

// ---------------------------------------------------------------------------
// GM-10 withdrawal admission. This is deliberately NOT admitDocument(..., one_click): an
// event carries a document, and one document may have active filings for several clients. The
// runtime has neither an exact task->entry identity proof nor direct access to the governing
// relations. The additive DB door accepts only the entry.withdrawn event id, proves the exact
// agent-draft -> human-revision -> withdrawal chain, audits machine actor + human OBO, and then
// delegates to 0053. `entry.revised` remains checkpoint-only and can never call this helper.
// MUST run inside the caller's open effect transaction.
// ---------------------------------------------------------------------------
export async function admitWithdrawalEvent(client, { eventId }, deps = {}) {
  const model = deps.model ?? SWEEP_MODEL;
  const reserve = deps.reserveTokens ?? RESERVE_TOKENS;
  const r = await client.query(
    "select clara.readmit_autodraft_after_withdrawal($1, $2, $3) as receipt",
    [eventId, model, reserve],
  );
  const receipt = r.rows[0]?.receipt ?? {};
  const admitted = admissionNeedsStart(receipt.outcome) && receipt.task_id
    ? [String(receipt.task_id)]
    : [];
  return {
    admitted,
    receipt,
    retry: receipt.outcome === "retry_pending_settlement",
  };
}

// ---------------------------------------------------------------------------
// Dead-letter (consumer='autodraft') — its OWN transaction so the attempt count survives the
// effect-transaction rollback (the matcher idiom). Returns the post-increment count.
// ERROR PATH ONLY (F2-R): a retry_pending_settlement deferral no longer calls this at all —
// see deferredWithdrawalState below.
// ---------------------------------------------------------------------------
async function recordAutodraftDeadLetter(client, { eventId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      // F2-R hygiene fix (opus review): `reason` is now updated on every conflict too, not
      // only `attempt_count` -- the ORIGINAL shape froze the FIRST error's text forever, so a
      // LATER, DIFFERENT error on the same event still reported the stale first cause (a
      // first-writer-wins lie an operator reading relay_dead_letters would trust).
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
         values ($1, $2, $3, null)
       on conflict (consumer, event_id) do update
         set attempt_count = clara.relay_dead_letters.attempt_count + 1,
             reason = excluded.reason
       returning attempt_count`,
      [AUTODRAFT_CONSUMER, eventId, String(reason).slice(0, 500)],
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
// F2-R — the retained-deferral signal (opus review, round 2). NOT persisted (deliberately: a
// SQL-derived count would need journal_entries/coding_attempts/autodraft_attempts/agent_tasks
// -- all 0011+ tables -- which autodraftHealth's own header specifically avoids so it stays
// callable before 0011 is applied; the runtime role also has no direct SELECT grant on any of
// them, by the SAME definer-only design this file's own header already notes for
// document_filings). Process-local and keyed on event id: membership = "this process
// currently sees this withdrawal retained pending its owner task's settlement";
// `lastLoggedAt` throttles the log line to at most once per DEFERRAL_LOG_INTERVAL_MS so a
// firm stuck for hours does not spam the log once per poll. Cleared the moment the SAME event
// stops returning retry_pending_settlement (success OR error), so it always reflects the
// CURRENT set, never a historical one. Re-derives from scratch after a restart (empty map,
// first occurrence logs immediately) -- exactly as unbounded retention already behaves; this
// is observability, not state the correctness of the deferral itself depends on.
// ---------------------------------------------------------------------------
const deferredWithdrawalState = new Map(); // eventId -> { lastLoggedAt: number }

function noteDeferral(eventId, reason, log) {
  const now = Date.now();
  const prior = deferredWithdrawalState.get(eventId);
  if (!prior || now - prior.lastLoggedAt >= DEFERRAL_LOG_INTERVAL_MS) {
    log(`[autodraft] event=${eventId} deferred without checkpoint (owner task not yet settled): ${reason}`);
    deferredWithdrawalState.set(eventId, { lastLoggedAt: now });
  }
}

function clearDeferral(eventId) {
  deferredWithdrawalState.delete(eventId);
}

// ---------------------------------------------------------------------------
// Per-firm event processing — walk events > checkpoint in seq order; admit the document of
// each invoice_facts event (each its OWN admission+checkpoint txn, so a poison blocks only
// itself), coalesce checkpoint-only advances over every other type. Enqueue admitted tasks
// AFTER the txn commits (best-effort; the reconciler re-enqueues an unstarted admitted task).
// ---------------------------------------------------------------------------
async function readEvents(client, firmId, lastSeq, batchSize) {
  const r = await client.query(
    `select seq, id, event_type, document_id
       from clara.domain_events
      where firm_id = $1 and seq > $2
      order by seq limit $3`,
    [firmId, lastSeq, batchSize],
  );
  return r.rows.map((row) => ({ seq: Number(row.seq), id: row.id, eventType: row.event_type, documentId: row.document_id }));
}

async function checkpointOnly(client, { firmId, seq }) {
  await client.query("begin");
  try {
    await writeCheckpoint(client, { consumer: AUTODRAFT_CONSUMER, firmId, seq });
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

/** Admission for one facts/withdrawal event + its checkpoint, in ONE transaction. Returns the
 *  admitted task ids so the caller can enqueue them AFTER commit. The branch is keyed on the
 *  current entry.withdrawn event, never on the earlier entry.revised evidence. */
async function runEffectTxn(client, { firmId, ev, deps }) {
  await client.query("begin");
  try {
    const res = ev.eventType === "entry.withdrawn"
      ? await admitWithdrawalEvent(client, { eventId: ev.id }, deps)
      : await admitDocument(client, { firmId, documentId: ev.documentId }, deps);
    if (res.retry) {
      await client.query("rollback");
      // F2-R: a LIVE owner task is retained WITHOUT checkpointing, UNBOUNDED — never
      // dead-lettered, never skipped. The reconciler's own orphan-settle window (30 minutes)
      // eventually unblocks a genuinely stuck task; advancing the checkpoint before that would
      // lose the human's deliberate re-admission act permanently (measured, round 1's own
      // regression). No relay_dead_letters write happens here at all — see
      // deferredWithdrawalState for the (process-local, loud) signal instead.
      return { ok: false, retry: true, reason: res.receipt.outcome };
    }
    await writeCheckpoint(client, { consumer: AUTODRAFT_CONSUMER, firmId, seq: ev.seq });
    await client.query("commit");
    return { ok: true, admitted: res.admitted };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    const attempts = await recordAutodraftDeadLetter(client, { eventId: ev.id, reason: err?.message ?? String(err) });
    return { ok: false, err, attempts };
  }
}

/** Walk one firm's events; admit each invoice_facts document (own txn), enqueue admitted
 *  tasks after commit, coalesce non-target events into one checkpoint advance. */
async function processAutodraftFirm(client, { firmId, lastSeq, batchSize, deps }) {
  const log = deps.log ?? (() => {});
  const enqueue = deps.enqueue ?? (async () => {});
  const evs = await readEvents(client, firmId, lastSeq, batchSize);
  if (evs.length === 0) return { readCount: 0, maxSeq: lastSeq, admitted: 0, blocked: false };

  let cursor = lastSeq;
  let admittedCount = 0;
  for (const ev of evs) {
    if (!AUTODRAFT_EVENT_SET.has(ev.eventType)) continue; // checkpoint-only; coalesced below
    const res = await runEffectTxn(client, { firmId, ev, deps });
    if (!res.retry) clearDeferral(ev.id); // no longer pending settlement, whatever the outcome
    if (res.ok) {
      cursor = ev.seq; // checkpoint already committed in the txn — the event is consumed
      for (const taskId of res.admitted) {
        try {
          await enqueue(taskId);
          admittedCount += 1;
        } catch (e) {
          log(`[autodraft] enqueue failed task=${taskId} (reconciler will re-enqueue): ${e?.message ?? e}`);
        }
      }
      continue;
    }
    if (res.retry) {
      // F2-R: UNBOUNDED retention (see the constant's own comment) — the deferral is correct
      // behavior, made LOUD instead of bounded: a throttled log line plus autodraftHealth's
      // deferredWithdrawals count are the operator signal, never a checkpoint advance.
      noteDeferral(ev.id, res.reason, log);
      return { readCount: evs.length, maxSeq: cursor, admitted: admittedCount, blocked: true };
    }
    if (res.attempts >= MAX_ATTEMPTS) {
      log(`[autodraft] event=${ev.id} exhausted ${MAX_ATTEMPTS} attempts → dead-lettered + skipped: ${res.err?.message ?? res.err}`);
      await checkpointOnly(client, { firmId, seq: ev.seq }); // advance past the poison
      cursor = ev.seq;
      continue;
    }
    log(`[autodraft] effect-error event=${ev.id} attempt=${res.attempts}/${MAX_ATTEMPTS}: ${res.err?.message ?? res.err}`);
    return { readCount: evs.length, maxSeq: cursor, admitted: admittedCount, blocked: true }; // retry next cycle
  }

  const batchMax = evs[evs.length - 1].seq; // trailing/interior non-target events: one coalesced advance
  if (batchMax > cursor) {
    await checkpointOnly(client, { firmId, seq: batchMax });
    cursor = batchMax;
  }
  return { readCount: evs.length, maxSeq: cursor, admitted: admittedCount, blocked: false };
}

/** One full autodraft cycle — discover firms behind the checkpoint, drain each ROUND-ROBIN
 *  bounded to maxBatchesPerFirm (fairness, mirrors the router/matcher). */
export async function runAutodraftCycle(client, opts = {}) {
  const { batchSize = 100, maxBatchesPerFirm = 4, onlyFirm = null, log = () => {} } = opts;
  const deps = { ...opts, log };
  const work = await discoverWork(client, { consumer: AUTODRAFT_CONSUMER, onlyFirm });
  const cursors = work.map((w) => ({ firmId: w.firmId, lastSeq: w.lastSeq, active: true }));
  let admitted = 0;
  for (let round = 0; round < maxBatchesPerFirm; round++) {
    let anyActive = false;
    for (const cur of cursors) {
      if (!cur.active) continue;
      const res = await processAutodraftFirm(client, { firmId: cur.firmId, lastSeq: cur.lastSeq, batchSize, deps });
      if (res.blocked || res.maxSeq <= cur.lastSeq) {
        cur.active = false; // a poison held us up (retry next cycle) OR no progress (caught up)
        continue;
      }
      cur.lastSeq = res.maxSeq;
      admitted += res.admitted;
      anyActive = true;
      if (res.readCount < batchSize) cur.active = false; // drained to head
    }
    if (!anyActive) break;
  }
  return { firms: work.length, admitted, capped: cursors.some((c) => c.active) };
}

// ---------------------------------------------------------------------------
// Catch-up pass — re-admit list_autodraft_candidates() stragglers (active filing, facts done,
// no open draft, non-parked registry) AND finalize stale sweep runs (crash-finalization). One
// sweep run per firm sized to that firm's straggler count; enqueue admitted after commit.
// ---------------------------------------------------------------------------
export async function runCatchupPass(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const enqueue = opts.enqueue ?? (async () => {});
  const model = opts.model ?? SWEEP_MODEL;
  const reserve = opts.reserveTokens ?? RESERVE_TOKENS;

  const rows = (await client.query("select firm_id, filing_id from clara.list_autodraft_candidates()")).rows;
  const byFirm = new Map();
  for (const row of rows) {
    const firmId = String(row.firm_id);
    if (!byFirm.has(firmId)) byFirm.set(firmId, []);
    byFirm.get(firmId).push(String(row.filing_id));
  }

  let admitted = 0;
  for (const [firmId, filings] of byFirm) {
    const admittedTasks = [];
    await client.query("begin");
    try {
      const runRes = await client.query("select clara.open_sweep_run($1, $2) as run_id", [firmId, filings.length]);
      const runId = runRes.rows[0].run_id;
      for (const filingId of filings) {
        const r = await client.query("select clara.admit_autodraft_task($1, $2, $3, $4, $5) as receipt", [filingId, "sweep", runId, model, reserve]);
        const receipt = r.rows[0]?.receipt ?? {};
        if (admissionNeedsStart(receipt.outcome) && receipt.task_id) admittedTasks.push(String(receipt.task_id));
      }
      await client.query("commit");
    } catch (err) {
      try {
        await client.query("rollback");
      } catch {
        /* aborted/dead */
      }
      log(`[autodraft] catch-up firm=${firmId} admission error: ${err?.message ?? err}`);
      continue;
    }
    for (const taskId of admittedTasks) {
      try {
        await enqueue(taskId);
        admitted += 1;
      } catch (e) {
        log(`[autodraft] catch-up enqueue failed task=${taskId} (reconciler backstops): ${e?.message ?? e}`);
      }
    }
  }

  // Crash-finalization: reconcile committed drafts into missing items + finalize stale runs.
  let reconciled = null;
  try {
    reconciled = (await client.query("select clara.reconcile_sweep_runs() as r")).rows[0]?.r ?? null;
  } catch (err) {
    log(`[autodraft] reconcile_sweep_runs error: ${err?.message ?? err}`);
  }
  return { firms: byFirm.size, admitted, reconciled };
}

// ---------------------------------------------------------------------------
// /ready WARN signal — the consumer's own lag + dead-letter counts (§3, WA-L6). Warn-only: a
// stalled autodraft consumer must NEVER take chat traffic down. Queries only spine tables that
// exist since 0005, so it is safe to call before 0011 is applied.
// ---------------------------------------------------------------------------
export async function autodraftHealth(client) {
  const r = await client.query(
    `select
       coalesce((select sum(greatest(s.n - coalesce(c.last_seq, 0), 0))
                   from clara.firm_event_seq s
                   left join clara.relay_checkpoints c on c.consumer = $1 and c.firm_id = s.firm_id), 0)::bigint as lag,
       (select count(*) from clara.relay_dead_letters where consumer = $1 and status = 'pending')::int as pending_dead_letters,
       (select count(*) from clara.relay_checkpoints where consumer = $1)::int as firms_tracked`,
    [AUTODRAFT_CONSUMER],
  );
  return {
    consumer: AUTODRAFT_CONSUMER,
    lag: Number(r.rows[0].lag),
    pendingDeadLetters: r.rows[0].pending_dead_letters,
    firmsTracked: r.rows[0].firms_tracked,
    // F2-R (opus review): distinct from generic lag/pending_dead_letters ON PURPOSE — a
    // withdrawal deferred pending its owner task's settlement is neither poisoned (no
    // relay_dead_letters row) nor merely "behind" (lag counts it, but so does every other
    // unconsumed event on the firm). Process-local (deferredWithdrawalState), not a DB read,
    // so it stays true to this invariant's own "safe before 0011" contract above and needs no
    // grant this role does not already have.
    deferredWithdrawals: deferredWithdrawalState.size,
  };
}

// ---------------------------------------------------------------------------
// The autodraft leader loop — its OWN dedicated connection + advisory lock ('autodraft'),
// mirroring the matcher loop. Structurally independent: an autodraft stall never touches the
// router/matcher leadership, readiness, or heartbeat. Runs the event-driven cycle each poll and
// a catch-up pass every CLARA_AUTODRAFT_CATCHUP_SECONDS. `deps.makeClient` + `deps.enqueue` are
// injectable (the supervisor supplies the registry-provenance enqueue).
export function startAutodraftLoop(deps = {}) {
  const log = deps.log ?? (() => {});
  const makeClient = deps.makeClient ?? makeRuntimeClient;
  const catchupMs = deps.catchupMs ?? CATCHUP_MS;
  const stopRef = { stop: false, wake: null };

  const loop = (async () => {
    let backoff = RECONNECT_BASE_MS;
    while (!stopRef.stop) {
      const client = makeClient();
      let connErr = null;
      client.on("error", (e) => {
        connErr = e;
      });
      let lastCatchup = 0;
      try {
        await client.connect();
        await setRuntimeRole(client); // N10 — set role clara_runtime (all autodraft fns are runtime-granted)
        await acquireLeaderLock(client, AUTODRAFT_CONSUMER); // BLOCKS until autodraft leadership
        await client.query("listen clara_events");
        log("AUTODRAFT acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runAutodraftCycle(client, { ...deps, log });
            capped = r.capped;
            if (Date.now() - lastCatchup >= catchupMs) {
              lastCatchup = Date.now();
              await runCatchupPass(client, { ...deps, log });
            }
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`AUTODRAFT cycle-error ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`AUTODRAFT connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
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
