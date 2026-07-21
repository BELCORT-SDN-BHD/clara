// The rule-post consumer — the standing-rules posting SPINE (Wave A2, contract §6.3 /
// migration 0015 companion S5). A FOURTH registered spine consumer beside router +
// matcher + autodraft, reusing lib/relay.mjs's discovery/checkpoint/dead-letter primitives
// UNCHANGED. Own name ('rule_post'), own advisory lock (hashtext('rule_post')), own
// (consumer,firm) checkpoint, own dead-letter lane, own /ready WARN signal. Subscribes to
// `entry.drafted` ONLY (every other type is a checkpoint-only advance).
//
// For each drafted entry it calls the DEFINER `clara.execute_rule_post(entry, op_key)`,
// which matches the LIVE autopost rule directly and — RE-DERIVING every eligibility gate
// against live rows (high-stakes, cap, window under a row lock, direction-aware account,
// whole-entry, expiry, revision) — posts the entry through the approve_entry core with the
// rule's signature as the checker authority, or writes a quiet skip. The consumer never
// decides eligibility; the DB does. Benign races (a concurrent human approve, a rotated
// revision) are converted to skip rows INSIDE execute_rule_post and never raise here; a
// real error dead-letters.
//
// AUTHORITY (the security-critical bit): execute_rule_post is granted LOGIN-DIRECT to the
// clara_runtime_login shell ONLY (NOT the clara_runtime group) — the exact
// record_rule_resolution precedent. So the effect is made in the RAW login identity
// (reset role -> call -> set role clara_runtime), exactly as the matcher reaches
// record_rule_resolution; a pooled `set role clara_runtime` session gets 42501.

import { setTimeout as sleep } from "node:timers/promises";
import { discoverWork, writeCheckpoint, acquireLeaderLock, setRuntimeRole } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

/** The rule-post consumer name — its own checkpoint / dead-letter / lock key. */
export const RULE_POST_CONSUMER = "rule_post";
/** The ONLY event type the consumer acts on; all others are checkpoint-only. */
export const RULE_POST_EVENT_TYPE = "entry.drafted";

const MAX_ATTEMPTS = Number(process.env.CLARA_RULE_POST_MAX_ATTEMPTS || 5);
const POLL_INTERVAL_MS = Number(process.env.CLARA_RULE_POST_POLL_MS || 2000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

/**
 * Apply the rule-post effect for ONE entry.drafted event. MUST run inside an open
 * transaction on a clara_runtime-role connection whose LOGIN is clara_runtime_login (the
 * transient `reset role` reaches the login holding execute_rule_post's EXECUTE). The op_key
 * embeds the event seq so a re-delivery of the SAME draft dedupes, while a fresh draft (a
 * new revision ⇒ a new entry.drafted event ⇒ a new seq) re-attempts — the (entry,revision)
 * idempotency the contract's `rulepost:<entry>:<revision>` key intends, sourced from the
 * spine without a journal_entries read grant.
 */
export async function applyRulePostEffects(client, { entryId, seq }) {
  await client.query("reset role"); // -> clara_runtime_login (the session's login identity)
  try {
    const r = await client.query("select clara.execute_rule_post($1, $2) as result", [entryId, `rulepost:${entryId}:${seq}`]);
    return r.rows[0]?.result ?? null;
  } finally {
    await client.query("set role clara_runtime"); // back to the group for the checkpoint write
  }
}

// ---------------------------------------------------------------------------
// Dead-letter (consumer='rule_post') — its OWN transaction so the attempt count survives
// the effect-transaction rollback (the matcher idiom). Returns the post-increment count.
// ---------------------------------------------------------------------------
async function recordRulePostDeadLetter(client, { eventId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
         values ($1, $2, $3, null)
       on conflict (consumer, event_id) do update
         set attempt_count = clara.relay_dead_letters.attempt_count + 1
       returning attempt_count`,
      [RULE_POST_CONSUMER, eventId, String(reason).slice(0, 500)],
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
    `select seq, id, event_type, entry_id
       from clara.domain_events
      where firm_id = $1 and seq > $2
      order by seq limit $3`,
    [firmId, lastSeq, batchSize],
  );
  return r.rows.map((row) => ({ seq: Number(row.seq), id: row.id, eventType: row.event_type, entryId: row.entry_id }));
}

async function checkpointOnly(client, { firmId, seq }) {
  await client.query("begin");
  try {
    await writeCheckpoint(client, { consumer: RULE_POST_CONSUMER, firmId, seq });
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

/** The rule-post effect for one entry.drafted event + its checkpoint, in ONE transaction. */
async function runEffectTxn(client, { firmId, ev, deps }) {
  await client.query("begin");
  try {
    await applyRulePostEffects(client, { entryId: ev.entryId, seq: ev.seq }, deps);
    await writeCheckpoint(client, { consumer: RULE_POST_CONSUMER, firmId, seq: ev.seq });
    await client.query("commit");
    return { ok: true };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    await client.query("set role clara_runtime").catch(() => {}); // rollback reverts in-txn role; restore for the DL write
    const attempts = await recordRulePostDeadLetter(client, { eventId: ev.id, reason: err?.message ?? String(err) });
    return { ok: false, err, attempts };
  }
}

/** Walk one firm's events; run the rule-post effect for each entry.drafted (own txn, so a
 *  poison blocks only itself), coalesce non-target events into one checkpoint advance. */
async function processRulePostFirm(client, { firmId, lastSeq, batchSize, deps }) {
  const log = deps.log ?? (() => {});
  const evs = await readEvents(client, firmId, lastSeq, batchSize);
  if (evs.length === 0) return { readCount: 0, maxSeq: lastSeq, effects: 0, blocked: false };

  let cursor = lastSeq;
  let effects = 0;
  for (const ev of evs) {
    if (ev.eventType !== RULE_POST_EVENT_TYPE || !ev.entryId) continue; // checkpoint-only; coalesced below
    const res = await runEffectTxn(client, { firmId, ev, deps });
    if (res.ok) {
      cursor = ev.seq;
      effects += 1;
      continue;
    }
    if (res.attempts >= MAX_ATTEMPTS) {
      log(`[rule_post] event=${ev.id} exhausted ${MAX_ATTEMPTS} attempts → dead-lettered + skipped: ${res.err?.message ?? res.err}`);
      await checkpointOnly(client, { firmId, seq: ev.seq });
      cursor = ev.seq;
      continue;
    }
    log(`[rule_post] effect-error event=${ev.id} attempt=${res.attempts}/${MAX_ATTEMPTS}: ${res.err?.message ?? res.err}`);
    return { readCount: evs.length, maxSeq: cursor, effects, blocked: true }; // retry next cycle
  }

  const batchMax = evs[evs.length - 1].seq; // trailing/interior non-target events: one coalesced advance
  if (batchMax > cursor) {
    await checkpointOnly(client, { firmId, seq: batchMax });
    cursor = batchMax;
  }
  return { readCount: evs.length, maxSeq: cursor, effects, blocked: false };
}

/** One full rule-post cycle — discover firms behind the checkpoint, drain each ROUND-ROBIN
 *  bounded to maxBatchesPerFirm (fairness, mirrors the matcher/autodraft loops). */
export async function runRulePostCycle(client, opts = {}) {
  const { batchSize = 100, maxBatchesPerFirm = 4, onlyFirm = null, log = () => {} } = opts;
  const deps = { ...opts, log };
  const work = await discoverWork(client, { consumer: RULE_POST_CONSUMER, onlyFirm });
  const cursors = work.map((w) => ({ firmId: w.firmId, lastSeq: w.lastSeq, active: true }));
  let effects = 0;
  for (let round = 0; round < maxBatchesPerFirm; round++) {
    let anyActive = false;
    for (const cur of cursors) {
      if (!cur.active) continue;
      const res = await processRulePostFirm(client, { firmId: cur.firmId, lastSeq: cur.lastSeq, batchSize, deps });
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

// Consumer-specific redrive (rule-post variant) — re-runs the rule-post effect for a
// dead-lettered event. Idempotent (execute_rule_post dedupes on the op_key). Requires an
// existing consumer='rule_post' dead-letter row.
async function readEventById(client, eventId) {
  const r = await client.query("select firm_id, event_type, entry_id from clara.domain_events where id = $1", [eventId]);
  if (r.rowCount === 0) return null;
  return { firmId: r.rows[0].firm_id, eventType: r.rows[0].event_type, entryId: r.rows[0].entry_id };
}

export async function rulePostRedrive(client, eventId, deps = {}) {
  await client.query("begin");
  try {
    const dl = await client.query("select status from clara.relay_dead_letters where consumer = $1 and event_id = $2 for update", [
      RULE_POST_CONSUMER,
      eventId,
    ]);
    if (dl.rowCount === 0) throw new Error(`rule_post redrive: no dead-letter for consumer='rule_post' event=${eventId}`);
    const ev = await readEventById(client, eventId);
    if (!ev) throw new Error(`rule_post redrive: event ${eventId} not found`);
    if (ev.eventType !== RULE_POST_EVENT_TYPE) throw new Error(`rule_post redrive: event ${eventId} is '${ev.eventType}', not ${RULE_POST_EVENT_TYPE}`);
    // The event's own seq keys the idempotent op — read it so a redrive dedupes with the original attempt.
    const seqRow = await client.query("select seq from clara.domain_events where id = $1", [eventId]);
    await applyRulePostEffects(client, { entryId: ev.entryId, seq: Number(seqRow.rows[0].seq) }, deps);
    await client.query("update clara.relay_dead_letters set status = 'resolved', resolved_at = now() where consumer = $1 and event_id = $2", [
      RULE_POST_CONSUMER,
      eventId,
    ]);
    await client.query("commit");
    return { resolved: true, consumer: RULE_POST_CONSUMER, entryId: ev.entryId };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    await client.query("set role clara_runtime").catch(() => {});
    throw err;
  }
}

export const CONSUMERS = Object.freeze({
  rule_post: Object.freeze({ name: RULE_POST_CONSUMER, identity: "runtime-login", redrive: (c, id, o) => rulePostRedrive(c, id, o) }),
});

// /ready WARN signal — per-consumer lag + dead-letter counts. Warn-only: a stalled
// rule-post consumer must NEVER take chat traffic down (the matcher/autodraft law).
export async function rulePostHealth(client) {
  const r = await client.query(
    `select
       coalesce((select sum(greatest(s.n - coalesce(c.last_seq, 0), 0))
                   from clara.firm_event_seq s
                   left join clara.relay_checkpoints c on c.consumer = $1 and c.firm_id = s.firm_id), 0)::bigint as lag,
       (select count(*) from clara.relay_dead_letters where consumer = $1 and status = 'pending')::int as pending_dead_letters,
       (select count(*) from clara.relay_checkpoints where consumer = $1)::int as firms_tracked`,
    [RULE_POST_CONSUMER],
  );
  return {
    consumer: RULE_POST_CONSUMER,
    lag: Number(r.rows[0].lag),
    pendingDeadLetters: r.rows[0].pending_dead_letters,
    firmsTracked: r.rows[0].firms_tracked,
  };
}

// The rule-post leader loop — its OWN dedicated connection + advisory lock ('rule_post'),
// mirroring the matcher loop. Structurally independent: a rule-post stall never touches
// router/matcher/autodraft leadership, readiness, or the engine heartbeat.
/**
 * @param {{log?:Function, makeClient?:()=>import("pg").Client, batchSize?:number,
 *          maxBatchesPerFirm?:number, onlyFirm?:string|null}} [deps]
 * @returns {{stop:()=>Promise<void>, done:Promise<void>}}
 */
export function startRulePostLoop(deps = {}) {
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
        await setRuntimeRole(client); // N10 — set role clara_runtime (the login dance is per-effect)
        await acquireLeaderLock(client, RULE_POST_CONSUMER); // BLOCKS until rule_post leadership
        await client.query("listen clara_events");
        log("RULE_POST acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runRulePostCycle(client, { ...deps, log });
            capped = r.capped;
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`RULE_POST cycle-error ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`RULE_POST connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
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
