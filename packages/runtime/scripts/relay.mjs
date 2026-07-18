// The outbox relay runner — the long-lived process that drains committed domain
// events into durable wake intents (Slice 3; contract §2.9). Plain .mjs + pg, the
// scripts/worker.mjs precedent (env-only connection, no DSN literal).
//
// Lifecycle:
//   1. Connect ONE dedicated session; `set role clara_runtime` immediately (N10).
//   2. Leader election — a BLOCKING session-level advisory lock on the consumer
//      name. A second instance blocks here (single-writer ENFORCED); it takes
//      over transparently the instant the leader's session ends (SIGKILL/exit
//      releases the lock). Chosen policy: BLOCK (not try-and-exit).
//   3. LISTEN clara_events (EMPTY-payload nudge — N1; any nudge means "poll
//      everything") + a 2s polling fallback. Polling is the guarantee.
//   4. Each wake/poll: run one relay cycle. A missing/empty active taxonomy
//      pointer HALTs the loop loudly (never advances past an un-routable state).
//
// CLI:
//   node scripts/relay.mjs            → run the relay loop
//   node scripts/relay.mjs redrive <eventId>
//                                     → one-shot idempotent dead-letter redrive
//                                       (D3) under the current active taxonomy
//
// Env:
//   PG* / DATABASE_URL / WORKFLOW_POSTGRES_URL  → connection (env ONLY)
//   RELAY_BATCH_SIZE            → batch size (default 100)
//   RELAY_TEST_BATCH_DELAY_MS   → TEST-ONLY: ms delay inside each batch txn
//                                 before the checkpoint write, so a kill test can
//                                 SIGKILL reliably mid-batch. Default 0 (off).
//   RELAY_ONLY_FIRM             → TEST-ONLY: scope discovery to one firm uuid so a
//                                 test's relay never drains other tests'/seed
//                                 firms in a shared DB. Unset ⇒ all firms (prod).

import {
  CONSUMER,
  TaxonomyHaltError,
  makeClient,
  setRuntimeRole,
  acquireLeaderLock,
  runRelayCycle,
  redrive,
} from "../lib/relay.mjs";

const POLL_INTERVAL_MS = 2000;

function log(msg) {
  process.stdout.write(`${msg}\n`);
}
function errlog(msg) {
  process.stderr.write(`${msg}\n`);
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
    // Let a signal handler cut the wait short.
    stopRef.wake = finish;
  });
}

async function runLoop(client) {
  const batchSize = Number(process.env.RELAY_BATCH_SIZE || 100);
  const testBatchDelayMs = Number(process.env.RELAY_TEST_BATCH_DELAY_MS || 0);
  const onlyFirm = process.env.RELAY_ONLY_FIRM || null;

  await client.query("listen clara_events");

  const stopRef = { stop: false, wake: null };
  const requestStop = (sig) => {
    errlog(`RELAY ${sig} — stopping after current cycle`);
    stopRef.stop = true;
    if (stopRef.wake) stopRef.wake();
  };
  process.on("SIGTERM", () => requestStop("SIGTERM"));
  process.on("SIGINT", () => requestStop("SIGINT"));

  while (!stopRef.stop) {
    try {
      await runRelayCycle(client, { batchSize, testBatchDelayMs, onlyFirm, log });
    } catch (err) {
      if (err instanceof TaxonomyHaltError || err?.halt) {
        errlog(`RELAY HALT ${err.message}`);
        break; // never advance past an un-routable state (§2.9.2 / N7b)
      }
      // Transient error (e.g. a lost connection) — log and let the poll retry.
      errlog(`RELAY cycle-error ${err?.message ?? err}`);
    }
    if (stopRef.stop) break;
    await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const client = makeClient();
  await client.connect();
  // A pool/connection-level error must not crash the process abruptly; surface it.
  client.on("error", (err) => errlog(`RELAY client-error ${err?.message ?? err}`));
  await setRuntimeRole(client); // N10 — before anything else

  try {
    if (args[0] === "redrive") {
      const eventId = args[1];
      if (!eventId) throw new Error("usage: relay.mjs redrive <eventId>");
      const res = await redrive(client, CONSUMER, eventId, { log: errlog });
      log(JSON.stringify(res));
      return;
    }

    log("RELAY starting");
    await acquireLeaderLock(client, CONSUMER); // BLOCKS until leadership is held
    log("RELAY leader-acquired");
    await runLoop(client);
  } finally {
    // client.end() releases the session advisory lock (leadership) cleanly.
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  errlog(`RELAY fatal ${err?.stack ?? err}`);
  process.exit(1);
});
