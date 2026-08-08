// The autodraft consumer — the independent auto-draft sweep lane (Wave A, contract §3 /
// companion §4-5). A THIRD registered spine consumer beside the router + matcher, reusing
// lib/relay.mjs's discovery/checkpoint/dead-letter primitives UNCHANGED (they already take a
// `consumer`) — the router + matcher stay byte-identical. Own name ('autodraft'), own
// advisory lock key (hashtext('autodraft')), own (consumer,firm) checkpoint, own dead-letter
// lane, own /ready WARN signal. Subscribes DIRECTLY to document.invoice_facts_completed /
// _failed (matcher precedent — no trigger_taxonomy read; every other type is a checkpoint-only
// advance). The consumer NEVER runs a model (the matcher contract): it resolves the event's
// document -> active filing(s), pre-creates a sweep run, admits one autodraft task per filing
// via clara.admit_autodraft_task (which re-evaluates the lane, enforces the filing-keyed
// registry, and RESERVES budget), and enqueues autoDraft_v1 for each 'admitted' task. A
// catch-up pass re-admits list_autodraft_candidates() stragglers and finalizes stale runs.
//
// Read-surface note (integration cross-check): the event -> filing resolution goes through
// deps.resolveDocumentFilings, defaulting to clara.list_document_autodraft_candidates(document)
// — a runtime-granted DEFINER read (document-scoped twin of list_autodraft_candidates). The
// runtime login has NO direct SELECT on clara.document_filings (0007 grants it only to
// authenticated + agent_ro), so a definer resolver is required; see REPORT-C.
//
// Connections come from the environment ONLY, via pools.makeRuntimeClient (the matcher idiom).

import { setTimeout as sleep } from "node:timers/promises";
import { discoverWork, writeCheckpoint, acquireLeaderLock, setRuntimeRole } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

/** The autodraft consumer name — its own checkpoint / dead-letter / lock key. */
export const AUTODRAFT_CONSUMER = "autodraft";
/** The event types the consumer acts on; all others are checkpoint-only. */
export const AUTODRAFT_EVENT_TYPES = Object.freeze(["document.invoice_facts_completed", "document.invoice_facts_failed"]);
const AUTODRAFT_EVENT_SET = new Set(AUTODRAFT_EVENT_TYPES);

const MAX_ATTEMPTS = Number(process.env.CLARA_AUTODRAFT_MAX_ATTEMPTS || 5);
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
// Dead-letter (consumer='autodraft') — its OWN transaction so the attempt count survives the
// effect-transaction rollback (the matcher idiom). Returns the post-increment count.
// ---------------------------------------------------------------------------
async function recordAutodraftDeadLetter(client, { eventId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
         values ($1, $2, $3, null)
       on conflict (consumer, event_id) do update
         set attempt_count = clara.relay_dead_letters.attempt_count + 1
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

/** Admission for one invoice_facts event + its checkpoint, in ONE transaction. Returns the
 *  admitted task ids so the caller can enqueue them AFTER commit. */
async function runEffectTxn(client, { firmId, ev, deps }) {
  await client.query("begin");
  try {
    const res = await admitDocument(client, { firmId, documentId: ev.documentId }, deps);
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
