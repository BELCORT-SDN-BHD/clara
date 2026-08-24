// The outbox relay runner — the long-lived process that drains committed domain
// events into durable wake intents (Slice 3; contract
// docs/plan/completed/slice3-event-spine-contract.md §2.9). Plain .mjs + pg, the
// scripts/worker.mjs precedent (env-only connection, no DSN literal).
//
// Lifecycle (X2 — resilient): an OUTER loop owns the connection lifecycle. Each
// iteration connects ONE dedicated session and:
//   1. `set role clara_runtime` immediately (N10).
//   2. Leader election — a BLOCKING session-level advisory lock on the consumer
//      name. A second instance blocks here (single-writer ENFORCED); it takes
//      over transparently the instant the leader's session ends.
//   3. LISTEN clara_events (EMPTY-payload nudge — N1) + a 2s polling fallback.
//   4. Run relay cycles until a graceful stop, a HALT, or the connection dies.
// On a CONNECTION-LEVEL failure the client is discarded and the whole lifecycle
// re-runs with backoff (reconnect → re-role → re-elect → re-LISTEN → resume). A
// missing/empty active taxonomy pointer HALTs and EXITS NON-ZERO (2) so
// supervision sees the un-routable state — it is never silently swallowed.
//
// CLI:
//   node scripts/relay.mjs            → run the relay loop
//   node scripts/relay.mjs redrive <eventId> [--consumer <name>]
//                                     → one-shot idempotent dead-letter redrive; <name> is any
//                                       registered consumer (router|matcher|
//                                       sst_watch|facts_gate|wiki_projection), default router
//   node scripts/relay.mjs wiki-backfill [--sources <path.json>]
//                                     → Wave B ceremony: deterministic wiki ingest of pre-0017
//                                       finalized documents (ZERO model calls)
//   node scripts/relay.mjs wiki-repair → Wave B ceremony: re-drive the wiki projection to
//                                       convergence (orphan repair; put-409 idempotent)
//   node scripts/relay.mjs wiki-stale-scan
//                                     → WB-R21/0019 §11 catch-up, half (i): the CEREMONY-ROLE,
//                                       READ-ONLY inverted scan. Prints the {clientId,documentId}
//                                       pair list as JSON (the ceremony records it as evidence).
//                                       It runs WITHOUT `set role clara_runtime` on purpose:
//                                       clara_runtime has no SELECT on clara.document_filings
//                                       (0007:2740-2741) and 0019 adds NO grant.
//   node scripts/relay.mjs wiki-stale-catchup --run-key <k> [--pairs <path.json>]
//                                     → half (ii): the RUNTIME-ROLE marking verb over those pairs.
//                                       --run-key is MANDATORY (a fixed per-pair op_key replays its
//                                       original receipt forever); same run retried ⇒ same key.
//
// Env:
//   PG* / DATABASE_URL / WORKFLOW_POSTGRES_URL  → connection (env ONLY; a
//                                 canonical-target split fails closed, see lib).
//   RELAY_BATCH_SIZE            → batch size (default 100)
//   RELAY_MAX_BATCHES_PER_FIRM  → per-firm batches per cycle (fairness, default 4)
//   RELAY_TEST_MODE=1           → enable the TEST-ONLY knobs below (logged loudly).
//                                 Without it, both are INERT — a leaked prod value
//                                 can neither narrow discovery nor throttle a batch.
//   RELAY_ONLY_FIRM             → TEST-ONLY: scope discovery to one firm uuid.
//   RELAY_TEST_BATCH_DELAY_MS   → TEST-ONLY: ms delay inside each batch txn before
//                                 the checkpoint write (lets a kill test SIGKILL
//                                 reliably mid-batch).

import { setTimeout as sleep } from "node:timers/promises";
import {
  CONSUMER,
  TaxonomyHaltError,
  makeClient,
  setRuntimeRole,
  acquireLeaderLock,
  runRelayCycle,
} from "../lib/relay.mjs";
import { CONSUMERS as MATCHER_CONSUMERS } from "../lib/matcher.mjs";
import { CONSUMERS as SST_WATCH_CONSUMERS } from "../lib/sst-watch.mjs";
import { CONSUMERS as FACTS_GATE_CONSUMERS } from "../lib/facts-gate.mjs";
import { CONSUMERS as WIKI_PROJECTION_CONSUMERS } from "../lib/wiki-projection.mjs";
import {
  backfillWikiSources,
  repairWikiOrphans,
  scanStaleCatchupCandidates,
  catchUpWikiStale,
} from "../lib/wiki-projection-ops.mjs";
import { makeRuntimeClient } from "../lib/pools.mjs";

// Every registered spine consumer's redrive seam, merged. Each module owns its own entry
// (name + identity + redrive), so the CLI never hardcodes a consumer's identity: matcher
// needs the raw runtime LOGIN (its writers' EXECUTE lives on the login shell, not
// the clara_runtime group); router, sst_watch and facts_gate are plain runtime-role calls.
// (The rule_post consumer RETIRED with F-A2 PR-3 — matcher is now the sole LOGIN-shell
// consumer in this merge.) Without the merge, `redrive sst_watch|facts_gate <event>` was
// rejected as an unknown consumer and /ready warned about dead-letters no operator could clear.
const CONSUMERS = Object.freeze({
  ...MATCHER_CONSUMERS,
  ...SST_WATCH_CONSUMERS,
  ...FACTS_GATE_CONSUMERS,
  ...WIKI_PROJECTION_CONSUMERS,
});

const POLL_INTERVAL_MS = 2000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

function log(msg) {
  process.stdout.write(`${msg}\n`);
}
function errlog(msg) {
  process.stderr.write(`${msg}\n`);
}

/** True when an error means the connection is gone (⇒ discard + reconnect). */
function isConnectionError(err) {
  if (!err) return false;
  const code = err.code;
  if (code && ["57P01", "08000", "08001", "08003", "08004", "08006", "ECONNRESET", "EPIPE"].includes(code)) return true;
  const m = String(err.message || "");
  return /terminat|connection (?:closed|terminated|reset|refused)|Client has encountered a connection error|server closed the connection/i.test(m);
}

/** Resolve a nudge: a NOTIFY on clara_events, or the poll timeout, or a stop. */
function waitForNudge(client, ms, stopRef) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.removeListener("notification", onNotif);
      stopRef.wake = null;
      resolve();
    };
    const onNotif = () => finish();
    const timer = setTimeout(finish, ms);
    client.once("notification", onNotif);
    stopRef.wake = finish; // let a signal handler cut the wait short
  });
}

/**
 * One connection lifecycle: connect → role → leader lock → LISTEN → cycle loop.
 * Resolves on a graceful stop; THROWS a TaxonomyHaltError (halt) or a
 * connection-level error (reconnect) for the outer loop to handle.
 */
async function runInstance(stopRef, health, cfg) {
  const client = makeClient();
  let connErr = null;
  // A pool/connection-level error (e.g. the backend terminating this session)
  // must not crash the process — record it; the loop turns it into a reconnect.
  client.on("error", (e) => {
    connErr = e;
  });
  try {
    await client.connect();
    await setRuntimeRole(client); // N10 — before anything else
    const pid = (await client.query("select pg_backend_pid() as pid")).rows[0].pid;
    log(`RELAY backend-pid ${pid}`);
    log("RELAY starting");
    await acquireLeaderLock(client, CONSUMER); // BLOCKS until leadership is held
    log("RELAY leader-acquired");
    await client.query("listen clara_events");

    while (!stopRef.stop) {
      if (connErr) throw connErr; // died during the poll wait ⇒ reconnect
      let capped = false;
      try {
        const r = await runRelayCycle(client, {
          batchSize: cfg.batchSize,
          maxBatchesPerFirm: cfg.maxBatchesPerFirm,
          testBatchDelayMs: cfg.testBatchDelayMs,
          onlyFirm: cfg.onlyFirm,
          log,
        });
        capped = r.capped;
        health.cyclesRun += 1;
      } catch (err) {
        if (err instanceof TaxonomyHaltError || err?.halt) throw err; // never advance
        if (connErr || isConnectionError(err)) throw connErr ?? err; // reconnect
        errlog(`RELAY cycle-error ${err?.message ?? err}`); // transient ⇒ retry next poll
      }
      if (stopRef.stop) break;
      // When a firm was capped there is a known backlog — loop immediately (the
      // round-robin already gave every firm its turn); otherwise idle on the poll.
      if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
    }
  } finally {
    // Discard the client; end() releases the session advisory lock (leadership).
    await client.end().catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testMode = process.env.RELAY_TEST_MODE === "1";

  // redrive CLI — one-shot, its own connection (D3). Consumer-selectable (§4.4):
  //   relay.mjs redrive <eventId> [--consumer <name>]
  // The router path stays byte-identical (default consumer, makeClient +
  // setRuntimeRole + the relay taxonomy redrive). Every other path dispatches its own
  // module's handler on the connection its registered `identity` calls for.
  if (args[0] === "redrive") {
    const rest = args.slice(1);
    let consumer = "router";
    const ci = rest.indexOf("--consumer");
    if (ci >= 0) {
      consumer = rest[ci + 1];
      rest.splice(ci, 2);
    }
    const eventId = rest[0];
    if (!eventId) throw new Error(`usage: relay.mjs redrive <eventId> [--consumer ${Object.keys(CONSUMERS).join("|")}]`);
    const entry = CONSUMERS[consumer];
    if (!entry) throw new Error(`redrive: unknown consumer '${consumer}' (known: ${Object.keys(CONSUMERS).join(", ")})`);
    const client = entry.identity === "runtime-login" ? makeRuntimeClient() : makeClient();
    await client.connect();
    await setRuntimeRole(client); // set role clara_runtime (N10); the matcher handler resets transiently
    try {
      const res = await entry.redrive(client, eventId, { log: errlog });
      log(JSON.stringify(res));
    } finally {
      await client.end().catch(() => {});
    }
    return;
  }

  // Wave B cold-start ceremony verbs (migration 0017 W4) — one-shot, own runtime-role connection.
  //   relay.mjs wiki-backfill [--sources <path.json>]  → DETERMINISTIC ingest of pre-0017 finalized
  //       documents (ZERO model calls). <path.json> is an array of {clientId, documentId} the
  //       ceremony pairs from finalized documents to their active filing (there is no runtime
  //       document→client link). Absent ⇒ nothing to ingest (logged).
  //   relay.mjs wiki-repair                            → orphan REPAIR: re-drive the projection to
  //       convergence (a verified-but-never-published Storage object self-heals; put-409 idempotent).
  if (args[0] === "wiki-backfill" || args[0] === "wiki-repair") {
    const client = makeClient();
    await client.connect();
    await setRuntimeRole(client);
    try {
      if (args[0] === "wiki-repair") {
        log(JSON.stringify(await repairWikiOrphans(client, { log: errlog })));
      } else {
        const si = args.indexOf("--sources");
        let sources = [];
        if (si >= 0 && args[si + 1]) {
          const { readFile } = await import("node:fs/promises");
          sources = JSON.parse(await readFile(args[si + 1], "utf8"));
        } else {
          errlog("wiki-backfill: no --sources <path.json> supplied — nothing to ingest (the ceremony pairs client↔document)");
        }
        log(JSON.stringify(await backfillWikiSources(client, { sources, log: errlog })));
      }
    } finally {
      await client.end().catch(() => {});
    }
    return;
  }

  // WB-R21 / 0019 §11 stale catch-up — RECONCILIATION for any pre-existing anomaly, run once at
  // the ceremony and re-runnable thereafter. Two verbs because of a privilege boundary:
  //   wiki-stale-scan     → CEREMONY-ROLE, READ-ONLY, no `set role clara_runtime`: clara_runtime
  //       has no SELECT on clara.document_filings (0007:2740-2741) and 0019 adds NO grant, so the
  //       inverted scan cannot run on the runtime connection. The session is pinned read-only so
  //       this lane structurally cannot write. Emits the pair list the ceremony records as evidence.
  //   wiki-stale-catchup  → RUNTIME-ROLE marking over those pairs (the grant it already has).
  if (args[0] === "wiki-stale-scan") {
    const client = makeClient();
    await client.connect();
    await client.query("set default_transaction_read_only = on");
    errlog("wiki-stale-scan: CEREMONY-ROLE read-only scan (clara_runtime cannot read document_filings)");
    try {
      log(JSON.stringify(await scanStaleCatchupCandidates(client)));
    } finally {
      await client.end().catch(() => {});
    }
    return;
  }
  if (args[0] === "wiki-stale-catchup") {
    const ki = args.indexOf("--run-key");
    const runKey = ki >= 0 ? args[ki + 1] : null;
    if (!runKey) throw new Error("usage: relay.mjs wiki-stale-catchup --run-key <k> [--pairs <path.json>]");
    const pi = args.indexOf("--pairs");
    let pairs = [];
    if (pi >= 0 && args[pi + 1]) {
      const { readFile } = await import("node:fs/promises");
      pairs = JSON.parse(await readFile(args[pi + 1], "utf8"));
    } else {
      errlog("wiki-stale-catchup: no --pairs <path.json> supplied — nothing to mark (run wiki-stale-scan first)");
    }
    const client = makeClient();
    await client.connect();
    await setRuntimeRole(client);
    try {
      log(JSON.stringify(await catchUpWikiStale(client, { pairs, runKey, log: errlog })));
    } finally {
      await client.end().catch(() => {});
    }
    return;
  }

  if (testMode) {
    errlog("RELAY TEST-MODE active — test-only knobs honored (RELAY_ONLY_FIRM, RELAY_TEST_BATCH_DELAY_MS)");
  }
  const cfg = {
    batchSize: Number(process.env.RELAY_BATCH_SIZE || 100),
    maxBatchesPerFirm: Number(process.env.RELAY_MAX_BATCHES_PER_FIRM || 4),
    // TEST-ONLY knobs: inert unless RELAY_TEST_MODE=1 (X3).
    testBatchDelayMs: testMode ? Number(process.env.RELAY_TEST_BATCH_DELAY_MS || 0) : 0,
    onlyFirm: testMode ? process.env.RELAY_ONLY_FIRM || null : null,
  };

  const stopRef = { stop: false, wake: null };
  const requestStop = (sig) => {
    errlog(`RELAY ${sig} — stopping after current cycle`);
    stopRef.stop = true;
    if (stopRef.wake) stopRef.wake();
  };
  process.on("SIGTERM", () => requestStop("SIGTERM"));
  process.on("SIGINT", () => requestStop("SIGINT"));

  // Outer lifecycle loop: reconnect with backoff on a connection-level failure;
  // exit NON-ZERO on a HALT so supervision sees the un-routable state (X2).
  let backoff = RECONNECT_BASE_MS;
  const health = { cyclesRun: 0 };
  while (!stopRef.stop) {
    const before = health.cyclesRun;
    try {
      await runInstance(stopRef, health, cfg);
      break; // graceful stop
    } catch (err) {
      if (err instanceof TaxonomyHaltError || err?.halt) {
        errlog(`RELAY HALT ${err.message} — exiting non-zero for supervision`);
        process.exit(2);
      }
      const madeProgress = health.cyclesRun > before;
      const wait = madeProgress ? RECONNECT_BASE_MS : backoff;
      errlog(`RELAY connection-lost (${err?.message ?? err}) — reconnecting in ${wait}ms`);
      await sleep(wait);
      backoff = madeProgress ? RECONNECT_BASE_MS : Math.min(backoff * 2, RECONNECT_MAX_MS);
    }
  }
}

main().catch((err) => {
  errlog(`RELAY fatal ${err?.stack ?? err}`);
  process.exit(1);
});
