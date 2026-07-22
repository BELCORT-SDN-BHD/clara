// The facts-gate consumer — the classifier→facts re-fire spine (Wave A2.1, migration 0016
// P3 / WA21-R7). A registered spine consumer beside router + matcher + autodraft + rule_post
// + sst_watch, reusing lib/relay.mjs's discovery/checkpoint/dead-letter primitives UNCHANGED.
// Own name ('facts_gate'), own advisory lock (hashtext('facts_gate')), own (consumer,firm)
// checkpoint, own dead-letter lane, own /ready WARN signal. Subscribes to
// `document.classified` ONLY (every other type is a checkpoint-only advance).
//
// WHY: a NULL-kind pdf/image is routed to the CLASSIFY lane first (never stranded); once the
// classifier sets a kind (>=0.8) it emits `document.classified`. THIS consumer catches that
// and RE-FIRES clara.enqueue_invoice_facts(document) — which, now that the kind is known,
// routes an invoice/credit_note/debit_note to the invoice_facts lane (the DB owns the whole
// gate: a payroll_summary yields skipped_kind, a low-confidence hold yields
// classify_low_confidence, consent evidence is exempt). The 0016 header (L3376) is explicit:
// "the facts enqueue re-fires on 'document.classified' via the runtime consumer."
//
// DISPATCH: enqueue_invoice_facts only CREATES/finds the queued task row; the EXISTING
// document-task dispatch path (lib/reconciler-documents.mjs reconcileDocumentTasks →
// enqueueForLane) starts it (invoice_facts→invoiceFacts_v1, local_facts→processLocalFactsTask).
// We invent NO new dispatch — a re-fired task rides the same lane-aware reconciler belt that
// dispatches every other document task.
//
// RECEIPT SEMANTICS: enqueue_invoice_facts returns a jsonb {document_id, status, task_id?}.
// The terminal-by-design statuses (skipped_kind / skipped_consent_evidence /
// classify_low_confidence / skipped_type / already_completed / failed) are LOGGED verbatim
// and CHECKPOINTED — NEVER retried by us (the DB's attempt caps own the retry policy). Only a
// genuine THROW (connection loss, undefined function pre-deploy) dead-letters (the rule-post
// pattern: MAX_ATTEMPTS then checkpoint-skip). AUTHORITY: enqueue_invoice_facts is granted to
// the clara_runtime GROUP (0009), so the effect is a PLAIN group-role call — NO login dance.

import { setTimeout as sleep } from "node:timers/promises";
import { discoverWork, writeCheckpoint, acquireLeaderLock, setRuntimeRole } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

/** The facts-gate consumer name — its own checkpoint / dead-letter / lock key. */
export const FACTS_GATE_CONSUMER = "facts_gate";
/** The ONLY event type the consumer acts on; all others are checkpoint-only. */
export const FACTS_GATE_EVENT_TYPE = "document.classified";

const MAX_ATTEMPTS = Number(process.env.CLARA_FACTS_GATE_MAX_ATTEMPTS || 5);
const POLL_INTERVAL_MS = Number(process.env.CLARA_FACTS_GATE_POLL_MS || 2000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

/**
 * Re-fire the invoice-facts enqueue for ONE document.classified event — a PLAIN group-role
 * call (enqueue_invoice_facts takes ONLY p_document, no op_key: it is internally idempotent
 * on the document's task trail). MUST run inside an open transaction on a clara_runtime-role
 * connection. Returns the DB's jsonb receipt {document_id, status, task_id?}.
 */
export async function applyFactsGateEffects(client, { documentId }) {
  const r = await client.query("select clara.enqueue_invoice_facts($1) as result", [documentId]);
  return r.rows[0]?.result ?? null;
}

// ---------------------------------------------------------------------------
// Dead-letter (consumer='facts_gate') — its OWN transaction so the attempt count survives
// the effect-transaction rollback (the matcher idiom). Returns the post-increment count.
// ---------------------------------------------------------------------------
async function recordFactsGateDeadLetter(client, { eventId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
         values ($1, $2, $3, null)
       on conflict (consumer, event_id) do update
         set attempt_count = clara.relay_dead_letters.attempt_count + 1
       returning attempt_count`,
      [FACTS_GATE_CONSUMER, eventId, String(reason).slice(0, 500)],
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

async function readEvents(client, firmId, lastSeq, batchSize) {
  // document.classified carries a document_id column; client_id is NULL on this event.
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
    await writeCheckpoint(client, { consumer: FACTS_GATE_CONSUMER, firmId, seq });
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

/** The facts-gate effect for one document.classified event + its checkpoint, in ONE
 *  transaction. A terminal-by-design receipt status is logged verbatim and STILL
 *  checkpointed; only a THROWN error rolls back + dead-letters. */
async function runEffectTxn(client, { firmId, ev, deps }) {
  const log = deps.log ?? (() => {});
  await client.query("begin");
  try {
    const receipt = await applyFactsGateEffects(client, { documentId: ev.documentId });
    log(`[facts_gate] document=${ev.documentId} enqueue_invoice_facts status=${receipt?.status ?? "?"}`);
    await writeCheckpoint(client, { consumer: FACTS_GATE_CONSUMER, firmId, seq: ev.seq });
    await client.query("commit");
    return { ok: true, receipt };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    const attempts = await recordFactsGateDeadLetter(client, { eventId: ev.id, reason: err?.message ?? String(err) });
    return { ok: false, err, attempts };
  }
}

/** Walk one firm's events; re-fire the facts enqueue for each document.classified (own txn,
 *  so a poison blocks only itself), coalesce non-target events into one checkpoint advance. */
async function processFactsGateFirm(client, { firmId, lastSeq, batchSize, deps }) {
  const log = deps.log ?? (() => {});
  const evs = await readEvents(client, firmId, lastSeq, batchSize);
  if (evs.length === 0) return { readCount: 0, maxSeq: lastSeq, effects: 0, blocked: false };

  let cursor = lastSeq;
  let effects = 0;
  for (const ev of evs) {
    if (ev.eventType !== FACTS_GATE_EVENT_TYPE || !ev.documentId) continue; // checkpoint-only; coalesced below
    const res = await runEffectTxn(client, { firmId, ev, deps });
    if (res.ok) {
      cursor = ev.seq;
      effects += 1;
      continue;
    }
    if (res.attempts >= MAX_ATTEMPTS) {
      log(`[facts_gate] event=${ev.id} exhausted ${MAX_ATTEMPTS} attempts → dead-lettered + skipped: ${res.err?.message ?? res.err}`);
      await checkpointOnly(client, { firmId, seq: ev.seq });
      cursor = ev.seq;
      continue;
    }
    log(`[facts_gate] effect-error event=${ev.id} attempt=${res.attempts}/${MAX_ATTEMPTS}: ${res.err?.message ?? res.err}`);
    return { readCount: evs.length, maxSeq: cursor, effects, blocked: true }; // retry next cycle
  }

  const batchMax = evs[evs.length - 1].seq; // trailing/interior non-target events: one coalesced advance
  if (batchMax > cursor) {
    await checkpointOnly(client, { firmId, seq: batchMax });
    cursor = batchMax;
  }
  return { readCount: evs.length, maxSeq: cursor, effects, blocked: false };
}

/** One full facts-gate cycle — discover firms behind the checkpoint, drain each ROUND-ROBIN
 *  bounded to maxBatchesPerFirm (fairness, mirrors the matcher/rule-post loops). */
export async function runFactsGateCycle(client, opts = {}) {
  const { batchSize = 100, maxBatchesPerFirm = 4, onlyFirm = null, log = () => {} } = opts;
  const deps = { ...opts, log };
  const work = await discoverWork(client, { consumer: FACTS_GATE_CONSUMER, onlyFirm });
  const cursors = work.map((w) => ({ firmId: w.firmId, lastSeq: w.lastSeq, active: true }));
  let effects = 0;
  for (let round = 0; round < maxBatchesPerFirm; round++) {
    let anyActive = false;
    for (const cur of cursors) {
      if (!cur.active) continue;
      const res = await processFactsGateFirm(client, { firmId: cur.firmId, lastSeq: cur.lastSeq, batchSize, deps });
      if (res.blocked || res.maxSeq <= cur.lastSeq) {
        cur.active = false;
        continue;
      }
      cur.lastSeq = res.maxSeq;
      effects += res.effects;
      anyActive = true;
      if (res.readCount < batchSize) cur.active = false;
    }
    if (!anyActive) break;
  }
  return { firms: work.length, effects, capped: cursors.some((c) => c.active) };
}

// Consumer-specific redrive (facts-gate variant) — re-fires enqueue_invoice_facts for the
// dead-lettered event's document. Idempotent (enqueue_invoice_facts dedupes on the document's
// task trail). Requires an existing consumer='facts_gate' dead-letter row.
async function readEventById(client, eventId) {
  const r = await client.query("select firm_id, event_type, document_id from clara.domain_events where id = $1", [eventId]);
  if (r.rowCount === 0) return null;
  return { firmId: r.rows[0].firm_id, eventType: r.rows[0].event_type, documentId: r.rows[0].document_id };
}

export async function factsGateRedrive(client, eventId) {
  await client.query("begin");
  try {
    const dl = await client.query("select status from clara.relay_dead_letters where consumer = $1 and event_id = $2 for update", [
      FACTS_GATE_CONSUMER,
      eventId,
    ]);
    if (dl.rowCount === 0) throw new Error(`facts_gate redrive: no dead-letter for consumer='facts_gate' event=${eventId}`);
    const ev = await readEventById(client, eventId);
    if (!ev) throw new Error(`facts_gate redrive: event ${eventId} not found`);
    if (ev.eventType !== FACTS_GATE_EVENT_TYPE) throw new Error(`facts_gate redrive: event ${eventId} is '${ev.eventType}', not ${FACTS_GATE_EVENT_TYPE}`);
    await applyFactsGateEffects(client, { documentId: ev.documentId });
    await client.query("update clara.relay_dead_letters set status = 'resolved', resolved_at = now() where consumer = $1 and event_id = $2", [
      FACTS_GATE_CONSUMER,
      eventId,
    ]);
    await client.query("commit");
    return { resolved: true, consumer: FACTS_GATE_CONSUMER, documentId: ev.documentId };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    throw err;
  }
}

// The registered-consumer table — the redrive dispatch seam. identity 'runtime-role': the
// effect is a plain clara_runtime GROUP call (NO login dance), so a one-shot redrive
// connection needs only the runtime role.
export const CONSUMERS = Object.freeze({
  facts_gate: Object.freeze({ name: FACTS_GATE_CONSUMER, identity: "runtime-role", redrive: (c, id) => factsGateRedrive(c, id) }),
});

// /ready WARN signal — per-consumer lag + dead-letter counts. Warn-only: a stalled
// facts-gate consumer must NEVER take chat traffic down (the matcher/autodraft law). Touches
// ONLY spine tables that exist since 0005, so it is safe to call BEFORE 0016 is applied.
export async function factsGateHealth(client) {
  const r = await client.query(
    `select
       coalesce((select sum(greatest(s.n - coalesce(c.last_seq, 0), 0))
                   from clara.firm_event_seq s
                   left join clara.relay_checkpoints c on c.consumer = $1 and c.firm_id = s.firm_id), 0)::bigint as lag,
       (select count(*) from clara.relay_dead_letters where consumer = $1 and status = 'pending')::int as pending_dead_letters,
       (select count(*) from clara.relay_checkpoints where consumer = $1)::int as firms_tracked`,
    [FACTS_GATE_CONSUMER],
  );
  return {
    consumer: FACTS_GATE_CONSUMER,
    lag: Number(r.rows[0].lag),
    pendingDeadLetters: r.rows[0].pending_dead_letters,
    firmsTracked: r.rows[0].firms_tracked,
  };
}

// The facts-gate leader loop — its OWN dedicated connection + advisory lock ('facts_gate'),
// mirroring the matcher/rule-post loops. Structurally independent: a stall never touches the
// other consumers' leadership, readiness, or the engine heartbeat.
/**
 * @param {{log?:Function, makeClient?:()=>import("pg").Client, batchSize?:number,
 *          maxBatchesPerFirm?:number, onlyFirm?:string|null}} [deps]
 * @returns {{stop:()=>Promise<void>, done:Promise<void>}}
 */
export function startFactsGateLoop(deps = {}) {
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
        await setRuntimeRole(client); // N10 — set role clara_runtime (enqueue_invoice_facts is group-granted)
        await acquireLeaderLock(client, FACTS_GATE_CONSUMER); // BLOCKS until facts_gate leadership
        await client.query("listen clara_events");
        log("FACTS_GATE acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runFactsGateCycle(client, { ...deps, log });
            capped = r.capped;
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`FACTS_GATE cycle-error ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`FACTS_GATE connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
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
