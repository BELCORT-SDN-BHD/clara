// The local_facts consumer — the MyInvois UBL FACTS pass (Wave A2, contract §3.1 /
// migration 0015 companion Deploy-artifacts). A NON-FROZEN, plain-lib consumer (there is
// NO durable WDK workflow on this path — a local deterministic parse needs none): it
// claims `lane='local_facts'` document-processing tasks, runs the UBL facts parse in a
// memory-capped WORKER THREAD (so a large/hostile XML never blocks the supervisor event
// loop), and persists the facts through the audited `persist_invoice_facts`.
//
// WHY A SEPARATE LANE (adversarial #1/#2): runtime dispatch is LANE-based + engine-blind,
// and the frozen Azure `invoiceFacts_v1` consumer claims `lane='invoice_facts'`. Sharing
// that lane would let the frozen egressing consumer claim a local task. So the MyInvois
// facts pass rides its OWN lane, claimed ONLY here; the frozen route is untouched. This
// consumer runs entirely as clara_runtime (claim + persist are group-granted) — NO
// login-direct dance (that is the rule-post consumer's concern, not this one).
//
// DRIVING + RECOVERY: a dedicated leader loop (advisory lock 'local_facts') discovers
// queued tasks and processes each; it also requeues STRANDED-running tasks (a crash
// mid-parse) past a grace, so nothing is lost. The reconciler wires `enqueueLocalFacts`
// as a dedup-safe belt (the claim gate makes a second drive a no-op).

import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { setRuntimeRole, acquireLeaderLock } from "./relay.mjs";
import { makeRuntimeClient, withRuntime as defaultWithRuntime } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";
import { MYINVOIS_ENGINE_ID } from "./myinvois.mjs";
import { interpretClaimReceipt } from "../workflows/invoiceFacts.v1.behavior.mjs";

/** The local_facts consumer name — its own advisory lock key. */
export const LOCAL_FACTS_CONSUMER = "local_facts";

const POLL_INTERVAL_MS = Number(process.env.CLARA_LOCAL_FACTS_POLL_MS || 2000);
const BATCH_SIZE = Number(process.env.CLARA_LOCAL_FACTS_BATCH || 25);
// A local UBL parse completes in seconds; a running task older than this is a crashed
// mid-parse leftover (single-leader lock ⇒ no live peer is processing it) → requeue.
// Finite-guarded (the leader.mjs idiom): junk or non-positive falls back to 10min. An
// unguarded NaN reached the requeue query as the string 'NaN', the interval cast RAISED, and
// because requeueStranded runs BEFORE discoverQueued the whole lane stopped silently.
const STRANDED_MS_ENV = Number(process.env.CLARA_LOCAL_FACTS_STRANDED_MS);
const STRANDED_MS = Number.isFinite(STRANDED_MS_ENV) && STRANDED_MS_ENV > 0 ? STRANDED_MS_ENV : 10 * 60_000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

// A local parse is deterministic: only a canonical-download fault is transient. A corrupt
// or non-UBL XML is terminal immediately (Tier B is the honest fallback, like the AP lane).
const RETRYABLE = new Set(["storage_error"]);

function receipt(row) {
  return row?.receipt ?? row?.result ?? row ?? {};
}

function factsFailureCode(err) {
  const code = String(err?.code || "internal");
  return ["storage_error", "corrupt", "bad_type", "limit", "internal"].includes(code) ? code : "internal";
}

// ---------------------------------------------------------------------------
// The UBL facts worker — spawns structured-worker.mjs with lane='local_facts' so its UBL
// branch returns the persist_invoice_facts shape. Injectable (deps.parseFacts) for tests.
// ---------------------------------------------------------------------------
export function runUblFactsWorker(filePath, task) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./structured-worker.mjs", import.meta.url), {
      workerData: { filePath, format: "xml", task },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    worker.once("message", (m) =>
      m?.ok ? resolve(m.result) : reject(Object.assign(new Error(m?.error || "UBL facts parse failed"), { code: m?.code || "corrupt" })),
    );
    worker.once("error", (err) => reject(Object.assign(err, { code: "internal" })));
    worker.once("exit", (code) => {
      if (code !== 0) reject(Object.assign(new Error(`UBL facts parser exited ${code}`), { code: "internal" }));
    });
  });
}

/**
 * Process one queued local_facts task: claim → download → UBL facts parse → persist.
 * The claim is idempotent (a done/running/held task is not re-claimed), so a duplicate
 * drive (reconciler belt + the loop) is a safe no-op. Transient faults leave the task for
 * retry; a terminal parse fault fails it (the coding turn falls back to Tier B).
 * @returns {Promise<{taskId:string, status:string, code?:string}>}
 */
export async function processLocalFactsTask(withRuntime, taskId, services, deps = {}) {
  const runId = `localfacts:${taskId}:${randomUUID()}`;
  const claim = await withRuntime((c) =>
    c.query("select clara.claim_document_processing_task($1,$2,$3) as receipt", [taskId, runId, true]).then((r) => receipt(r.rows[0])),
  );
  const interpreted = interpretClaimReceipt(claim);
  if (!interpreted.claimed) return { taskId, status: interpreted.status };
  const doc = interpreted.doc;
  if (!doc?.storage_path || !doc?.sha256) return { taskId, status: "no_work" };

  const tempPath = services.taskTempPath(taskId);
  const parseFacts = deps.parseFacts ?? runUblFactsWorker;
  try {
    await services.downloadCanonical(doc.storage_path, tempPath, doc.sha256);
    const result = await parseFacts(tempPath, { engineId: MYINVOIS_ENGINE_ID, versionN: 1, lane: "local_facts", format: "xml" });
    await withRuntime((c) =>
      c.query("select clara.persist_invoice_facts($1,$2::jsonb,$3,$4,$5,$6::jsonb) as receipt", [
        taskId,
        JSON.stringify(result.fields),
        result.rawSha256,
        result.normalizationVersion,
        result.pagesUsed,
        JSON.stringify(result.envelope ?? {}),
      ]),
    );
    return { taskId, status: "done" };
  } catch (err) {
    const code = factsFailureCode(err);
    if (RETRYABLE.has(code)) throw err; // transient — the loop/reconciler re-drives
    try {
      await withRuntime((c) => c.query("select clara.fail_invoice_facts($1,$2) as receipt", [taskId, code]));
    } catch {
      /* the DB attempt-cap may already have failed it; nothing else to do */
    }
    return { taskId, status: "failed", code };
  } finally {
    await services.removeTempFile(tempPath).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Discovery — queued tasks to process + stranded-running tasks to requeue. Reads
// TASK COLUMNS ONLY (all 0008-granted to clara_runtime). Runs on the leader connection.
// ---------------------------------------------------------------------------
async function discoverQueued(client, batchSize) {
  const r = await client.query(
    "select id from clara.document_processing_tasks where lane='local_facts' and status='queued' order by created_at limit $1",
    [batchSize],
  );
  return r.rows.map((row) => String(row.id));
}

async function requeueStranded(client, { batchSize, strandedMs, log }) {
  const r = await client.query(
    `select id from clara.document_processing_tasks
       where lane='local_facts' and status='running'
         and coalesce(started_at, updated_at) < now() - ($1::int * interval '1 millisecond')
       order by created_at limit $2`,
    [strandedMs, batchSize],
  );
  let requeued = 0;
  for (const row of r.rows) {
    try {
      await client.query("select clara.requeue_stranded_document_task($1,$2)", [row.id, `localfacts-stranded:${row.id}:${randomUUID()}`]);
      requeued += 1;
    } catch (err) {
      if (err?.code !== "CLR16") log(`[local_facts] stranded requeue failed task=${row.id}: ${err?.message ?? err}`);
    }
  }
  return requeued;
}

/** One cycle: requeue stranded, then process every queued local_facts task. `deps.processTask`
 *  is injectable (tests) and defaults to the pooled processLocalFactsTask. */
export async function runLocalFactsCycle(client, deps = {}) {
  const log = deps.log ?? (() => {});
  const batchSize = deps.batchSize ?? BATCH_SIZE;
  const strandedMs = deps.strandedMs ?? STRANDED_MS;
  const requeued = await requeueStranded(client, { batchSize, strandedMs, log });
  const queued = await discoverQueued(client, batchSize);
  const process = deps.processTask ?? ((taskId) => processLocalFactsTask(deps.withRuntime ?? defaultWithRuntime, taskId, deps.services, deps));
  let processed = 0;
  for (const taskId of queued) {
    try {
      await process(taskId);
      processed += 1;
    } catch (err) {
      log(`[local_facts] process error task=${taskId}: ${err?.message ?? err}`); // transient — retry next cycle
    }
  }
  return { requeued, discovered: queued.length, processed, capped: queued.length >= batchSize };
}

// ---------------------------------------------------------------------------
// /ready WARN signal — queued backlog + stranded count (task-driven, so no relay
// checkpoint). Warn-only: a stalled local_facts consumer must NEVER take traffic down.
// ---------------------------------------------------------------------------
export async function localFactsHealth(client) {
  const r = await client.query(
    `select
       count(*) filter (where status='queued')::int as queued,
       count(*) filter (where status='running')::int as running,
       coalesce(extract(epoch from (now() - min(created_at) filter (where status='queued'))) * 1000, 0)::bigint as oldest_queued_ms
     from clara.document_processing_tasks where lane='local_facts' and status in ('queued','running')`,
  );
  return {
    consumer: LOCAL_FACTS_CONSUMER,
    queued: Number(r.rows[0].queued),
    running: Number(r.rows[0].running),
    oldestQueuedMs: Number(r.rows[0].oldest_queued_ms),
  };
}

// ---------------------------------------------------------------------------
// The local_facts leader loop — its OWN dedicated connection + advisory lock, mirroring the
// matcher/autodraft loops. Structurally independent: a stall never touches router/matcher/
// autodraft leadership, readiness, or the engine heartbeat. `deps.services` supplies the
// temp-file + canonical-download adapters (makeDocumentServices); `deps.withRuntime` is the pool.
// ---------------------------------------------------------------------------
/**
 * @param {{log?:Function, makeClient?:()=>import("pg").Client, withRuntime?:Function,
 *          services?:object, batchSize?:number, strandedMs?:number,
 *          processTask?:(taskId:string)=>Promise<unknown>}} [deps]
 * @returns {{stop:()=>Promise<void>, done:Promise<void>}}
 */
export function startLocalFactsLoop(deps = {}) {
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
        await setRuntimeRole(client); // N10 — set role clara_runtime (claim/persist are group-granted)
        await acquireLeaderLock(client, LOCAL_FACTS_CONSUMER); // BLOCKS until local_facts leadership
        await client.query("listen clara_events");
        log("LOCAL_FACTS acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runLocalFactsCycle(client, { ...deps, log });
            capped = r.capped;
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`LOCAL_FACTS cycle-error ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`LOCAL_FACTS connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
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
