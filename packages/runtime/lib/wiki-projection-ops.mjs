// wiki_projection — the OPS half (module-size budget: the reconciler-sst/-documents
// precedent). The projection/planning/receipt/redrive core lives in wiki-projection.mjs;
// this module owns everything the SUPERVISOR and the WB-R18 CEREMONY touch: the leader
// loop (with the cold-start gates), the /ready warn signal, and the ceremony CLI verbs
// (deterministic backfill, orphan repair, and the WB-R21/0019 §11 stale catch-up — a
// ceremony-role SCAN plus a runtime-role MARKING verb). Ceremony order (design part3 post-verify,
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
  CONFIG_DEAD_LETTER_PREFIX,
} from "./wiki-projection.mjs";

const POLL_INTERVAL_MS = Number(process.env.CLARA_WIKI_PROJECTION_POLL_MS || 2000);
const COLD_START_POLL_MS = Number(process.env.CLARA_WIKI_PROJECTION_COLDSTART_POLL_MS || 30000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;
// F3: after a CONFIGURATION-blocked cycle the leader releases its advisory lock and waits THIS
// long before reconnecting, so a corrected standby has room to acquire leadership instead of the
// broken leader re-grabbing it in a tight loop.
const CONFIG_RECONNECT_MS = Number(process.env.CLARA_WIKI_PROJECTION_CONFIG_BACKOFF_MS || 30000);

/** An interruptible delay: stop()/stopRef.wake resolves it immediately so graceful-shutdown
 *  latency never waits out a poll or a configuration backoff. */
function interruptibleDelay(ms, stopRef) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    stopRef.wake = () => { clearTimeout(t); resolve(); };
  }).finally(() => { stopRef.wake = null; });
}

// --- ceremony CLI verbs (scripts/relay.mjs wiki-backfill / wiki-repair; NEVER boot) ------------

/** A per-pair skip means an ENUMERATED terminal CLR (wiki-projection.mjs's CLOSED terminal table).
 *  A runtime MISCONFIGURATION (CLR32/isolation_unsupported, CLR03) and any unrecognised typed
 *  refusal are NOT terminal, so both verbs below abort the ceremony loudly instead of silently
 *  counting a skip — the ceremony must never "converge" over a broken deployment (ratchet R2 B2). */

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

// --- the WB-R21 / 0019 §11 STALE CATCH-UP (two halves) -----------------------------------------
// RECONCILIATION, not the mechanism that makes the deploy ordering safe — the ratified ordering is
// RUNTIME-IMAGE-FIRST with proven exclusive new-binary lock acquisition as the cutover point, and it
// opens no window. Expected result at the 0019 ceremony: ZERO pairs; a non-empty result is a finding
// to adjudicate before unquiescing, not a routine sweep.
//
// It splits in two because of a PRIVILEGE BOUNDARY: clara_runtime has NO SELECT on
// clara.document_filings (0007:2740-2741 grants it to clara_authenticated/clara_agent_ro only — the
// gap that made the old plan-time document→client resolver fail closed; migration 0020 closes it
// with a DEFINER verb, clara.resolve_document_client, and still adds NO table grant), so the
// INVERTED scan cannot run on the runtime connection and 0019 adds NO grant. This mirrors
// backfillWikiSources' established contract exactly: the ceremony supplies the
// {clientId, documentId} pairs.

/** (i) The SCAN half — a CEREMONY-ROLE step, run on the owner connection, READ-ONLY. Returns the
 *  candidate pairs: for each ACTIVE page, each current-version citation and each active-page
 *  ref_kind='document' ref with a non-null document_id and stale_at is null, where the document has
 *  NO active filing to that page's client. This is the veto's blocker query, INVERTED — the same
 *  predicate run_client_lint's scan (2) uses. The ceremony records the list as evidence. */
export async function scanStaleCatchupCandidates(client) {
  const r = await client.query(
    `select distinct wp.client_id as client_id, src.document_id as document_id
       from clara.wiki_pages wp
       join lateral (
         select wc.document_id
           from clara.wiki_page_citations wc
          where wc.version_id = wp.current_version_id and wc.client_id = wp.client_id
            and wc.firm_id = wp.firm_id and wc.document_id is not null and wc.stale_at is null
         union all
         select wr.document_id
           from clara.wiki_page_refs wr
          where wr.page_id = wp.id and wr.client_id = wp.client_id and wr.firm_id = wp.firm_id
            and wr.ref_kind = 'document' and wr.document_id is not null and wr.stale_at is null
       ) src on true
      where wp.state = 'active'
        and not exists (select 1 from clara.document_filings df
              where df.document_id = src.document_id and df.client_id = wp.client_id
                and df.retired_at is null)
      order by 1, 2`);
  return r.rows.map((row) => ({ clientId: row.client_id, documentId: row.document_id }));
}

/** (ii) The MARKING half — a RUNTIME-ROLE verb over the pairs the ceremony supplies, plus a ceremony
 *  `runKey`. The run key is MANDATORY: a fixed per-pair op key is NOT re-runnable, because _reserve_op
 *  replays the original receipt forever for that key (0004:43-60), so a later repair run would return
 *  stale receipts and never examine fresh rows. Same run retried ⇒ same run key (a true idempotent
 *  retry); a NEW repair run ⇒ a NEW run key. A typed CLR is a per-pair skip (the backfillWikiSources
 *  idiom); anything else propagates. */
export async function catchUpWikiStale(client, { pairs = [], runKey = null, log = () => {} } = {}) {
  if (typeof runKey !== "string" || runKey.trim() === "") {
    throw new Error(
      "wiki stale catch-up: a ceremony run_key is REQUIRED — a fixed per-pair op_key replays its "
      + "original receipt forever (_reserve_op) and would never examine fresh rows");
  }
  let marked = 0;
  let noop = 0;
  let skipped = 0;
  for (const pair of pairs) {
    const clientId = pair?.clientId;
    const documentId = pair?.documentId;
    if (!clientId || !documentId) { skipped += 1; continue; }
    try {
      const r = await client.query("select clara.mark_wiki_citations_stale($1,$2,$3,$4) as r",
        [clientId, documentId, "source_filing_retired",
          `wikistale-catchup:${runKey}:${clientId}:${documentId}`]);
      if (r.rows[0]?.r?.status === "marked") marked += 1; else noop += 1;
    } catch (err) {
      if (isClaraTerminal(err)) {
        log(`[wiki_projection] stale-catchup skip client=${clientId} doc=${documentId} ${err.code}/${claraReason(err) ?? ""}`);
        skipped += 1;
      } else { throw err; }
    }
  }
  return { examined: pairs.length, marked, noop, skipped, run_key: runKey };
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
       (select count(*) from clara.relay_dead_letters
          where consumer = $1 and status = 'pending' and reason like $2)::int as configuration_blocked,
       (select count(*) from clara.relay_checkpoints where consumer = $1)::int as firms_tracked`,
    [WIKI_PROJECTION_CONSUMER, CONFIG_DEAD_LETTER_PREFIX + "%"]);
  return {
    consumer: WIKI_PROJECTION_CONSUMER,
    lag: Number(r.rows[0].lag),
    pendingDeadLetters: r.rows[0].pending_dead_letters,
    // F3: an EXPLICIT signal that the projection is stalled on a runtime misconfiguration (a
    // pending dead-letter whose reason carries the CONFIG_DEAD_LETTER_PREFIX), distinct from an
    // ordinary poison-pill dead-letter. Clears automatically when the config is fixed and the
    // event replays (F6 resolves the row).
    configurationBlocked: Number(r.rows[0].configuration_blocked) > 0,
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
  const runCycle = deps.runCycle ?? runWikiProjectionCycle; // injectable for the loop unit test
  const configBackoffMs = deps.configBackoffMs ?? CONFIG_RECONNECT_MS;
  const stopRef = { stop: false, wake: null };
  const loop = (async () => {
    let backoff = RECONNECT_BASE_MS;
    while (!stopRef.stop) {
      const client = makeClient();
      let connErr = null;
      let configBlocked = false; // F3: a configuration-blocked cycle drops us out to release the lock
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
          await interruptibleDelay(COLD_START_POLL_MS, stopRef);
        }
        if (stopRef.stop) break;
        await client.query("listen clara_events");
        log("WIKI_PROJECTION acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runCycle(client, { ...deps, log });
            capped = r.capped;
            // F3: a configuration-blocked cycle means a broken leader is otherwise pinning the
            // advisory lock forever. Break out so the `finally` closes the connection (RELEASING
            // the session-level lock), then reconnect on a long backoff below — a corrected
            // standby can take over in the meantime, and a rolling config repair self-heals.
            if (r.configurationBlocked) { configBlocked = true; break; }
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
      // Reached on a clean inner-loop break. The connection (and its advisory lock) is now closed
      // by the `finally` above; on a configuration block, wait a long backoff before re-acquiring
      // leadership so a healthy standby has room to take over (F3).
      if (configBlocked && !stopRef.stop) {
        log(`WIKI_PROJECTION configuration-blocked — leadership RELEASED; reconnecting after ${configBackoffMs}ms so a corrected standby can take over`);
        backoff = RECONNECT_BASE_MS;
        await interruptibleDelay(configBackoffMs, stopRef);
      }
    }
  })();
  return {
    stop: async () => { stopRef.stop = true; if (stopRef.wake) stopRef.wake(); await loop.catch(() => {}); },
    done: loop,
  };
}
