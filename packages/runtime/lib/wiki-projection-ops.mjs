// wiki_projection — the OPS half (module-size budget: the reconciler-sst/-documents
// precedent). The projection/planning/receipt/redrive core lives in wiki-projection.mjs;
// this module owns everything the SUPERVISOR and the WB-R18 CEREMONY touch: the leader
// loop (with the cold-start gates), the /ready warn signal, and the two ceremony CLI
// verbs (deterministic backfill, orphan repair). Ceremony order (design part3 post-verify,
// amended by the native-review HIGH-2 finding): the loop self-gates, so the checkpoint
// seed-at-head may run before OR after the v25 runtime starts — the consumer stays
// DORMANT (no discovery, no dead-letters) until BOTH the 0017 surface exists and the
// consumer-level seed has run. Seed SQL (ceremony, idempotent):
//   insert into clara.relay_checkpoints (consumer, firm_id, last_seq)
//     select 'wiki_projection', firm_id, n from clara.firm_event_seq
//   on conflict do nothing;

import { setTimeout as sleep } from "node:timers/promises";
import { setTimeout, clearTimeout } from "node:timers";
import { acquireLeaderLock, setRuntimeRole } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";
import {
  WIKI_PROJECTION_CONSUMER,
  runWikiProjectionCycle,
  isClaraTerminal,
  claraReason,
} from "./wiki-projection.mjs";

const POLL_INTERVAL_MS = Number(process.env.CLARA_WIKI_PROJECTION_POLL_MS || 2000);
const COLD_START_POLL_MS = Number(process.env.CLARA_WIKI_PROJECTION_COLDSTART_POLL_MS || 30000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

// --- ceremony CLI verbs (scripts/relay.mjs wiki-backfill / wiki-repair; NEVER boot) ------------

/** DETERMINISTIC backfill over pre-0017 finalized documents (ZERO model). `sources` = {clientId,
 *  documentId}[] the ceremony supplies (no runtime document→client link); each rides
 *  record_wiki_source_ingest with a document-stable op_key (idempotent; per-pair CLR = skip). */
export async function backfillWikiSources(client, { sources = [], log = () => {} } = {}) {
  let ingested = 0;
  let skipped = 0;
  for (const src of sources) {
    const clientId = src?.clientId;
    const documentId = src?.documentId;
    if (!clientId || !documentId) { skipped += 1; continue; }
    try {
      await client.query("select clara.record_wiki_source_ingest($1,$2,$3,$4)",
        [clientId, documentId, null, `wikiingest:${clientId}:${documentId}`]);
      ingested += 1;
    } catch (err) {
      if (isClaraTerminal(err)) {
        log(`[wiki_projection] backfill skip client=${clientId} doc=${documentId} ${err.code}/${claraReason(err) ?? ""}`);
        skipped += 1;
      } else { throw err; }
    }
  }
  return { examined: sources.length, ingested, skipped };
}

/** Orphan REPAIR — a verified-but-never-published Storage object self-heals on redelivery (the
 *  checkpoint never advanced); this forces that catch-up to convergence for the ceremony. */
export async function repairWikiOrphans(client, opts = {}) {
  const log = opts.log ?? (() => {});
  let effects = 0;
  let firms = 0;
  for (let i = 0; i < (opts.maxRounds ?? 50); i++) {
    const r = await runWikiProjectionCycle(client, { ...opts, log });
    firms = r.firms;
    effects += r.effects;
    if (!r.capped) break;
  }
  return { firms, effects };
}

// --- /ready WARN signal (warn-only; /ready NEVER gates on wiki freshness — WB-R3). Spine tables
// since 0005, safe pre-0017 (⇒ lag 0). -----------------------------------------------------------
export async function wikiProjectionHealth(client) {
  const r = await client.query(
    `select
       coalesce((select sum(greatest(s.n - coalesce(c.last_seq, 0), 0))
                   from clara.firm_event_seq s
                   left join clara.relay_checkpoints c on c.consumer = $1 and c.firm_id = s.firm_id), 0)::bigint as lag,
       (select count(*) from clara.relay_dead_letters where consumer = $1 and status = 'pending')::int as pending_dead_letters,
       (select count(*) from clara.relay_checkpoints where consumer = $1)::int as firms_tracked`,
    [WIKI_PROJECTION_CONSUMER]);
  return {
    consumer: WIKI_PROJECTION_CONSUMER,
    lag: Number(r.rows[0].lag),
    pendingDeadLetters: r.rows[0].pending_dead_letters,
    firmsTracked: r.rows[0].firms_tracked,
  };
}

/** Cold-start gates (design part3 G6 + the native-review HIGH-2 finding). Ready iff:
 *  (a) the 0017 wiki surface exists — the v25 image must stay healthy AND SILENT against a
 *      16-migration DB in the deploy-before-migrate ceremony window (to_regproc is a
 *      catalog read; no EXECUTE needed); and
 *  (b) the WB-R18 ceremony's checkpoint seed-at-head has run — discoverWork treats a
 *      MISSING checkpoint as last_seq=0, so an unseeded consumer would replay the whole
 *      pre-0017 history as live work (history belongs to the wiki-backfill lane, never to
 *      live discovery). This is a consumer-level exists-check, deliberately NOT per-firm:
 *      a firm born after the ceremony has no row and correctly starts at seq 0. */
export async function wikiColdStartReady(client) {
  const r = await client.query(
    `select to_regproc('clara.record_wiki_source_ingest') is not null as surface,
            exists(select 1 from clara.relay_checkpoints where consumer = $1) as seeded`,
    [WIKI_PROJECTION_CONSUMER],
  );
  const surface = r.rows[0]?.surface === true;
  const seeded = r.rows[0]?.seeded === true;
  return { surface, seeded, ready: surface && seeded };
}

// --- the leader loop (own dedicated connection + advisory lock; +1 Supavisor session) ----------
export function startWikiProjectionLoop(deps = {}) {
  const log = deps.log ?? (() => {});
  const makeClient = deps.makeClient ?? makeRuntimeClient;
  const stopRef = { stop: false, wake: null };
  const loop = (async () => {
    let backoff = RECONNECT_BASE_MS;
    while (!stopRef.stop) {
      const client = makeClient();
      let connErr = null;
      client.on("error", (e) => { connErr = e; });
      try {
        await client.connect();
        await setRuntimeRole(client); // N10 — all wiki writers are clara_runtime group-granted
        await acquireLeaderLock(client, WIKI_PROJECTION_CONSUMER);
        // DORMANT until both cold-start gates hold (HIGH-2): no discovery, no dead-letters.
        for (;;) {
          if (stopRef.stop) break;
          if (connErr) throw connErr;
          const gate = await wikiColdStartReady(client);
          if (gate.ready) break;
          log(`WIKI_PROJECTION dormant (surface=${gate.surface} seeded=${gate.seeded}) — awaiting the WB-R18 ceremony steps`);
          // Interruptible: stop() must not wait out the poll (graceful-shutdown latency).
          await new Promise((resolve) => {
            const t = setTimeout(resolve, COLD_START_POLL_MS);
            stopRef.wake = () => { clearTimeout(t); resolve(); };
          }).finally(() => { stopRef.wake = null; });
        }
        if (stopRef.stop) break;
        await client.query("listen clara_events");
        log("WIKI_PROJECTION acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runWikiProjectionCycle(client, { ...deps, log });
            capped = r.capped;
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`WIKI_PROJECTION cycle-error ${err?.message ?? err}`);
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`WIKI_PROJECTION connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      } finally {
        await client.end().catch(() => {});
      }
    }
  })();
  return {
    stop: async () => { stopRef.stop = true; if (stopRef.wake) stopRef.wake(); await loop.catch(() => {}); },
    done: loop,
  };
}
