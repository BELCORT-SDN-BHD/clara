// The sst-watch consumer — the STRUCTURAL SST compliance-watch spine (Wave A2.1,
// contract §2.4 / migration 0016). A registered spine consumer beside router + matcher +
// autodraft + rule_post, reusing lib/relay.mjs's discovery/checkpoint/dead-letter
// primitives UNCHANGED. Own name ('sst_watch'), own advisory lock (hashtext('sst_watch')),
// own (consumer,firm) checkpoint, own dead-letter lane, own /ready WARN signal. Subscribes
// to `entry.approved` ONLY (client-scoped; every other type is a checkpoint-only advance).
//
// For each approved entry it calls the DEFINER clara.evaluate_sst_watch(client, op_key),
// which recomputes the client's SST-registration turnover watch from the books and writes
// the tri-state watch rows + compliance events. That evaluator is exception-ISOLATED per
// client (0016 §2.4): it NEVER raises for a business reason — it returns a jsonb
// {client_id, status:'ok'|'skipped'|'failed', changed, groups[]}. So a 'failed' receipt is
// LOGGED and STILL CHECKPOINTED (the daily repair-belt sweep re-covers it); only a GENUINE
// throw (connection loss, undefined function pre-deploy) dead-letters (the rule-post
// pattern: MAX_ATTEMPTS then checkpoint-skip).
//
// HARD-NOTS (contract §2.4 — structural in the DB, and respected here): this consumer NEVER
// blocks or touches an approval, NEVER writes books, NEVER computes a figure — it only
// invokes the evaluator. AUTHORITY: evaluate_sst_watch is granted to the clara_runtime
// GROUP (0016), so the effect is a PLAIN group-role call — NO reset-role/login-direct dance
// (that is the rule-post consumer's concern, not this one).

import { setTimeout as sleep } from "node:timers/promises";
import { discoverWork, writeCheckpoint, acquireLeaderLock, setRuntimeRole } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

/** The sst-watch consumer name — its own checkpoint / dead-letter / lock key. */
export const SST_WATCH_CONSUMER = "sst_watch";
/** The ONLY event type the consumer acts on; all others are checkpoint-only. */
export const SST_WATCH_EVENT_TYPE = "entry.approved";

const MAX_ATTEMPTS = Number(process.env.CLARA_SST_WATCH_MAX_ATTEMPTS || 5);
const POLL_INTERVAL_MS = Number(process.env.CLARA_SST_WATCH_POLL_MS || 2000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

/**
 * Apply the sst-watch effect for ONE entry.approved event — a PLAIN group-role call to the
 * runtime-granted evaluator. MUST run inside an open transaction on a clara_runtime-role
 * connection. The op_key embeds the event seq ('sstwatch:<client>:<seq>', the rule-post
 * op-key idiom); evaluate_sst_watch validates+audits it but does not op-reserve it —
 * re-evaluation is idempotent recomputation from the books. Returns the evaluator's jsonb
 * receipt {client_id, status, changed, groups}.
 */
export async function applySstWatchEffects(client, { clientId, seq }) {
  const r = await client.query("select clara.evaluate_sst_watch(p_client => $1, p_op_key => $2) as result", [
    clientId,
    `sstwatch:${clientId}:${seq}`,
  ]);
  return r.rows[0]?.result ?? null;
}

// ---------------------------------------------------------------------------
// Dead-letter (consumer='sst_watch') — its OWN transaction so the attempt count survives
// the effect-transaction rollback (the matcher idiom). Returns the post-increment count.
// ---------------------------------------------------------------------------
async function recordSstWatchDeadLetter(client, { eventId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
         values ($1, $2, $3, null)
       on conflict (consumer, event_id) do update
         set attempt_count = clara.relay_dead_letters.attempt_count + 1
       returning attempt_count`,
      [SST_WATCH_CONSUMER, eventId, String(reason).slice(0, 500)],
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
  const r = await client.query(
    `select seq, id, event_type, client_id
       from clara.domain_events
      where firm_id = $1 and seq > $2
      order by seq limit $3`,
    [firmId, lastSeq, batchSize],
  );
  return r.rows.map((row) => ({ seq: Number(row.seq), id: row.id, eventType: row.event_type, clientId: row.client_id }));
}

async function checkpointOnly(client, { firmId, seq }) {
  await client.query("begin");
  try {
    await writeCheckpoint(client, { consumer: SST_WATCH_CONSUMER, firmId, seq });
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

/** The sst-watch effect for one entry.approved event + its checkpoint, in ONE transaction.
 *  A returned {status:'failed'} is NOT an error — it is logged and STILL checkpointed (the
 *  daily sweep re-covers it). Only a THROWN error rolls back + dead-letters. */
async function runEffectTxn(client, { firmId, ev, deps }) {
  const log = deps.log ?? (() => {});
  await client.query("begin");
  try {
    const receipt = await applySstWatchEffects(client, { clientId: ev.clientId, seq: ev.seq });
    if (receipt?.status === "failed") {
      log(`[sst_watch] evaluate_sst_watch failed client=${ev.clientId} event=${ev.id}: ${receipt.error ?? "?"} — checkpointing (daily sweep re-covers)`);
    }
    await writeCheckpoint(client, { consumer: SST_WATCH_CONSUMER, firmId, seq: ev.seq });
    await client.query("commit");
    return { ok: true, receipt };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    const attempts = await recordSstWatchDeadLetter(client, { eventId: ev.id, reason: err?.message ?? String(err) });
    return { ok: false, err, attempts };
  }
}

/** Walk one firm's events; run the sst-watch effect for each client-scoped entry.approved
 *  (own txn, so a poison blocks only itself), coalesce non-target events (and NULL-client
 *  approvals — a firm-level entry.approved carries no client to evaluate) into one
 *  checkpoint advance. */
async function processSstWatchFirm(client, { firmId, lastSeq, batchSize, deps }) {
  const log = deps.log ?? (() => {});
  const evs = await readEvents(client, firmId, lastSeq, batchSize);
  if (evs.length === 0) return { readCount: 0, maxSeq: lastSeq, effects: 0, blocked: false };

  let cursor = lastSeq;
  let effects = 0;
  for (const ev of evs) {
    if (ev.eventType !== SST_WATCH_EVENT_TYPE) continue; // checkpoint-only; coalesced below
    if (!ev.clientId) {
      // A firm-level entry.approved (NULL client) has no client to evaluate — warn and let
      // the coalesced batchMax advance past it (never a dead-letter, never a raise).
      log(`[sst_watch] entry.approved event=${ev.id} has NULL client_id — skipping (checkpoint advances)`);
      continue;
    }
    const res = await runEffectTxn(client, { firmId, ev, deps });
    if (res.ok) {
      cursor = ev.seq;
      effects += 1;
      continue;
    }
    if (res.attempts >= MAX_ATTEMPTS) {
      log(`[sst_watch] event=${ev.id} exhausted ${MAX_ATTEMPTS} attempts → dead-lettered + skipped: ${res.err?.message ?? res.err}`);
      await checkpointOnly(client, { firmId, seq: ev.seq });
      cursor = ev.seq;
      continue;
    }
    log(`[sst_watch] effect-error event=${ev.id} attempt=${res.attempts}/${MAX_ATTEMPTS}: ${res.err?.message ?? res.err}`);
    return { readCount: evs.length, maxSeq: cursor, effects, blocked: true }; // retry next cycle
  }

  const batchMax = evs[evs.length - 1].seq; // trailing/interior non-target / NULL-client events: one coalesced advance
  if (batchMax > cursor) {
    await checkpointOnly(client, { firmId, seq: batchMax });
    cursor = batchMax;
  }
  return { readCount: evs.length, maxSeq: cursor, effects, blocked: false };
}

/** One full sst-watch cycle — discover firms behind the checkpoint, drain each ROUND-ROBIN
 *  bounded to maxBatchesPerFirm (fairness, mirrors the matcher/rule-post loops). */
export async function runSstWatchCycle(client, opts = {}) {
  const { batchSize = 100, maxBatchesPerFirm = 4, onlyFirm = null, log = () => {} } = opts;
  const deps = { ...opts, log };
  const work = await discoverWork(client, { consumer: SST_WATCH_CONSUMER, onlyFirm });
  const cursors = work.map((w) => ({ firmId: w.firmId, lastSeq: w.lastSeq, active: true }));
  let effects = 0;
  for (let round = 0; round < maxBatchesPerFirm; round++) {
    let anyActive = false;
    for (const cur of cursors) {
      if (!cur.active) continue;
      const res = await processSstWatchFirm(client, { firmId: cur.firmId, lastSeq: cur.lastSeq, batchSize, deps });
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

// Consumer-specific redrive (sst-watch variant) — re-runs the evaluator for the
// dead-lettered event's client. Idempotent (evaluate_sst_watch is idempotent recomputation
// from the books). Requires an existing consumer='sst_watch' dead-letter row.
async function readEventById(client, eventId) {
  const r = await client.query("select firm_id, event_type, client_id from clara.domain_events where id = $1", [eventId]);
  if (r.rowCount === 0) return null;
  return { firmId: r.rows[0].firm_id, eventType: r.rows[0].event_type, clientId: r.rows[0].client_id };
}

export async function sstWatchRedrive(client, eventId) {
  await client.query("begin");
  try {
    const dl = await client.query("select status from clara.relay_dead_letters where consumer = $1 and event_id = $2 for update", [
      SST_WATCH_CONSUMER,
      eventId,
    ]);
    if (dl.rowCount === 0) throw new Error(`sst_watch redrive: no dead-letter for consumer='sst_watch' event=${eventId}`);
    const ev = await readEventById(client, eventId);
    if (!ev) throw new Error(`sst_watch redrive: event ${eventId} not found`);
    if (ev.eventType !== SST_WATCH_EVENT_TYPE) throw new Error(`sst_watch redrive: event ${eventId} is '${ev.eventType}', not ${SST_WATCH_EVENT_TYPE}`);
    if (!ev.clientId) throw new Error(`sst_watch redrive: event ${eventId} has NULL client_id — nothing to evaluate`);
    const seqRow = await client.query("select seq from clara.domain_events where id = $1", [eventId]);
    await applySstWatchEffects(client, { clientId: ev.clientId, seq: Number(seqRow.rows[0].seq) });
    await client.query("update clara.relay_dead_letters set status = 'resolved', resolved_at = now() where consumer = $1 and event_id = $2", [
      SST_WATCH_CONSUMER,
      eventId,
    ]);
    await client.query("commit");
    return { resolved: true, consumer: SST_WATCH_CONSUMER, clientId: ev.clientId };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    throw err;
  }
}

// The registered-consumer table — the redrive dispatch seam. identity is 'runtime-role':
// the effect is a plain clara_runtime GROUP call (NO login-direct dance), so a one-shot
// redrive connection needs only the runtime role (mirrors the router's runtime-role path,
// NOT the matcher/rule-post runtime-login path).
export const CONSUMERS = Object.freeze({
  sst_watch: Object.freeze({ name: SST_WATCH_CONSUMER, identity: "runtime-role", redrive: (c, id) => sstWatchRedrive(c, id) }),
});

// /ready WARN signal — per-consumer lag + dead-letter counts. Warn-only: a stalled
// sst-watch consumer must NEVER take chat traffic down (the matcher/autodraft law). Touches
// ONLY spine tables that exist since 0005 (firm_event_seq / relay_checkpoints /
// relay_dead_letters), so it is safe to call BEFORE 0016 is applied (/ready never breaks
// pre-deploy — the consumer='sst_watch' rows simply do not exist yet ⇒ lag 0).
export async function sstWatchHealth(client) {
  const r = await client.query(
    `select
       coalesce((select sum(greatest(s.n - coalesce(c.last_seq, 0), 0))
                   from clara.firm_event_seq s
                   left join clara.relay_checkpoints c on c.consumer = $1 and c.firm_id = s.firm_id), 0)::bigint as lag,
       (select count(*) from clara.relay_dead_letters where consumer = $1 and status = 'pending')::int as pending_dead_letters,
       (select count(*) from clara.relay_checkpoints where consumer = $1)::int as firms_tracked`,
    [SST_WATCH_CONSUMER],
  );
  return {
    consumer: SST_WATCH_CONSUMER,
    lag: Number(r.rows[0].lag),
    pendingDeadLetters: r.rows[0].pending_dead_letters,
    firmsTracked: r.rows[0].firms_tracked,
  };
}

// The sst-watch leader loop — its OWN dedicated connection + advisory lock ('sst_watch'),
// mirroring the matcher/rule-post loops. Structurally independent: a stall never touches
// router/matcher/autodraft/rule_post leadership, readiness, or the engine heartbeat.
/**
 * @param {{log?:Function, makeClient?:()=>import("pg").Client, batchSize?:number,
 *          maxBatchesPerFirm?:number, onlyFirm?:string|null}} [deps]
 * @returns {{stop:()=>Promise<void>, done:Promise<void>}}
 */
export function startSstWatchLoop(deps = {}) {
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
        await setRuntimeRole(client); // N10 — set role clara_runtime (evaluate_sst_watch is group-granted)
        await acquireLeaderLock(client, SST_WATCH_CONSUMER); // BLOCKS until sst_watch leadership
        await client.query("listen clara_events");
        log("SST_WATCH acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runSstWatchCycle(client, { ...deps, log });
            capped = r.capped;
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`SST_WATCH cycle-error ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`SST_WATCH connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
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
