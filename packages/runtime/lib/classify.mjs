// The classify consumer — the doc-type CLASSIFIER worker lane (Wave A2.1, migration 0016
// P3 / WA21-R7). A NON-FROZEN, plain-lib task-queue consumer (the local-facts precedent —
// no durable WDK workflow on this path): it claims `lane='classify'` document-processing
// tasks, reads the document's stored OCR LAYOUT text, asks the model for a calibrated
// {kind, confidence, rationale}, and settles the verdict through the audited
// clara.classify_document. The DB owns EVERY downstream effect: a >=0.8 verdict sets the
// kind + emits document.classified (the facts-gate consumer then re-fires the facts
// enqueue); a <0.8 verdict leaves the kind NULL + opens a human review question and emits
// NOTHING — so this worker NEVER loops on a low-confidence verdict (one call settles the
// task 'done' either way).
//
// LANE: the 0015 claim fn's egress-hold + per-firm concurrency cap apply ONLY to the
// egressing ocr/invoice_facts lanes — a classify task (a local, no-egress LLM read of
// already-extracted text) claims straight to running. This worker runs entirely as
// clara_runtime (claim + classify_document are group-granted) — NO login-direct dance.
//
// FAILURE MODEL: classify has NO DB terminal-fail writer — persist_document_extraction
// REFUSES a classify task (0016 L3756), and only classify_document settles it. So a
// read/LLM fault is treated as TRANSIENT: the task is left running and re-driven by the
// stranded-requeue path (mirroring local-facts's RETRYABLE branch — the branch that has a
// classify equivalent). We NEVER settle a guessed kind on error.

import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { setRuntimeRole, acquireLeaderLock } from "./relay.mjs";
import { makeRuntimeClient, withRuntime as defaultWithRuntime } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";
import { interpretClaimReceipt } from "../workflows/invoiceFacts.v1.behavior.mjs";
import { classifyDocumentText } from "./classify-llm.mjs";

/** The classify consumer name — its own advisory lock key. */
export const CLASSIFY_CONSUMER = "classify";
/** The classifier engine id. 0016 enqueues classify tasks under this exact id; classify_document
 *  settles the running task ONLY when the verdict's engine matches it (0016 L3224-3227). The
 *  reserved 'clara-classify-human:v1' is REFUSED (CLR10) — the classifier never mints a human
 *  verdict. */
export const CLASSIFY_ENGINE_ID = "clara-classify-llm:v1";
// 0016 enqueues a classify task with an EMPTY engine_config ('{}') — there is no per-task
// model override — so the env default is authoritative (the autodraft.mjs SWEEP_MODEL idiom).
const CLASSIFY_MODEL = process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";

const POLL_INTERVAL_MS = Number(process.env.CLARA_CLASSIFY_POLL_MS || 2000);
const BATCH_SIZE = Number(process.env.CLARA_CLASSIFY_BATCH || 25);
// A classify pass (read text + one model call) completes in seconds; a running task older
// than this is a crashed mid-classify leftover (single-leader lock ⇒ no live peer is
// processing it) → requeue.
const STRANDED_MS = Number(process.env.CLARA_CLASSIFY_STRANDED_MS || 10 * 60_000);
const MAX_TEXT_CHARS = 24000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

function receipt(row) {
  return row?.receipt ?? row?.result ?? row ?? {};
}

// The first Y / X of a region's polygon (locator.polygon = [x0,y0,x1,y1,...]); used to sort
// regions into reading order (page, then top-to-bottom, then left-to-right). Defensive: a
// missing/short polygon sorts to the top-left.
function readingOrderKey(locator) {
  const page = Number(locator?.page ?? 1);
  const poly = Array.isArray(locator?.polygon) ? locator.polygon : [];
  let minX = Infinity;
  let minY = Infinity;
  for (let i = 0; i + 1 < poly.length; i += 2) {
    const x = Number(poly[i]);
    const y = Number(poly[i + 1]);
    if (Number.isFinite(x) && x < minX) minX = x;
    if (Number.isFinite(y) && y < minY) minY = y;
  }
  return { page: Number.isFinite(page) ? page : 1, minY: minY === Infinity ? 0 : minY, minX: minX === Infinity ? 0 : minX };
}

// Read the document's stored OCR LAYOUT text — the matcher's readMatchInputs read path
// (document_extractions + document_regions under the runtime role), scoped to the LATEST
// done ocr/structured_parse extraction. Regions are concatenated in reading order and capped
// at ~24k chars (the model is told the text may be truncated). Injectable for tests.
export async function readExtractionText(client, { documentId, firmId }) {
  const r = await client.query(
    `with latest as (
       select e.id, e.firm_id
         from clara.document_extractions e
        where e.document_id = $1 and e.firm_id = $2 and e.status = 'done'
          and e.engine_kind in ('ocr','structured_parse')
        order by e.version_n desc, e.id
        limit 1)
     select r.text_content as text, r.locator
       from latest e
       join clara.document_regions r on r.extraction_id = e.id and r.firm_id = e.firm_id`,
    [documentId, firmId],
  );
  const rows = r.rows
    .map((row) => ({ text: String(row.text ?? ""), order: readingOrderKey(row.locator) }))
    .sort((a, b) => a.order.page - b.order.page || a.order.minY - b.order.minY || a.order.minX - b.order.minX);
  let out = "";
  for (const row of rows) {
    if (!row.text) continue;
    if (out.length + row.text.length + 1 > MAX_TEXT_CHARS) {
      out += row.text.slice(0, Math.max(0, MAX_TEXT_CHARS - out.length));
      break;
    }
    out += (out ? "\n" : "") + row.text;
  }
  return out;
}

/**
 * Process one queued classify task: claim → read layout text → model classify → settle via
 * classify_document. The claim is idempotent (a done/running/held task is not re-claimed), so
 * a duplicate drive is a safe no-op. On a read/LLM fault the task is LEFT running and the
 * error RETHROWN — the stranded-requeue path re-drives it (classify has no DB terminal-fail
 * writer). We NEVER settle a guessed kind on error.
 * @returns {Promise<{taskId:string, status:string, kind?:string, confidence?:number}>}
 */
export async function processClassifyTask(withRuntime, taskId, deps = {}) {
  const runId = `classify:${taskId}:${randomUUID()}`;
  const claim = await withRuntime((c) =>
    c.query("select clara.claim_document_processing_task($1,$2,$3) as receipt", [taskId, runId, false]).then((r) => receipt(r.rows[0])),
  );
  const interpreted = interpretClaimReceipt(claim);
  if (!interpreted.claimed) return { taskId, status: interpreted.status };
  const doc = interpreted.doc;
  if (!doc?.document_id || !doc?.firm_id) return { taskId, status: "no_work" };

  const readText = deps.readExtractionText ?? readExtractionText;
  const classify = deps.classify ?? classifyDocumentText;
  const modelId = deps.model ?? CLASSIFY_MODEL;
  // A read/LLM fault leaves the task RUNNING and RETHROWS: the loop's stranded-requeue path
  // re-drives it (the local-facts RETRYABLE branch — classify has no terminal-fail writer).
  const text = await withRuntime((c) => readText(c, { documentId: doc.document_id, firmId: doc.firm_id }));
  const verdict = await classify({ text, modelId });
  await withRuntime((c) =>
    c.query("select clara.classify_document(p_document => $1, p_kind => $2, p_confidence => $3, p_engine_id => $4, p_op_key => $5) as receipt", [
      doc.document_id,
      verdict.kind,
      verdict.confidence, // VERBATIM — the DB owns the >=0.8 gate; a low-confidence verdict holds for human review
      CLASSIFY_ENGINE_ID,
      `classify:${taskId}`,
    ]),
  );
  return { taskId, status: "done", kind: verdict.kind, confidence: verdict.confidence };
}

// ---------------------------------------------------------------------------
// Discovery — queued classify tasks + stranded-running tasks to requeue. Reads TASK COLUMNS
// ONLY (all 0008-granted to clara_runtime). Runs on the leader connection.
// ---------------------------------------------------------------------------
async function discoverQueued(client, batchSize) {
  const r = await client.query(
    "select id from clara.document_processing_tasks where lane='classify' and status='queued' order by created_at limit $1",
    [batchSize],
  );
  return r.rows.map((row) => String(row.id));
}

async function requeueStranded(client, { batchSize, strandedMs, log }) {
  const r = await client.query(
    `select id from clara.document_processing_tasks
       where lane='classify' and status='running'
         and coalesce(started_at, updated_at) < now() - ($1 || ' milliseconds')::interval
       order by created_at limit $2`,
    [String(strandedMs), batchSize],
  );
  let requeued = 0;
  for (const row of r.rows) {
    try {
      await client.query("select clara.requeue_stranded_document_task($1,$2)", [row.id, `classify-stranded:${row.id}:${randomUUID()}`]);
      requeued += 1;
    } catch (err) {
      if (err?.code !== "CLR16") log(`[classify] stranded requeue failed task=${row.id}: ${err?.message ?? err}`);
    }
  }
  return requeued;
}

/** One cycle: requeue stranded, then process every queued classify task. `deps.processTask` is
 *  injectable (tests) and defaults to the pooled processClassifyTask. */
export async function runClassifyCycle(client, deps = {}) {
  const log = deps.log ?? (() => {});
  const batchSize = deps.batchSize ?? BATCH_SIZE;
  const strandedMs = deps.strandedMs ?? STRANDED_MS;
  const requeued = await requeueStranded(client, { batchSize, strandedMs, log });
  const queued = await discoverQueued(client, batchSize);
  const process = deps.processTask ?? ((taskId) => processClassifyTask(deps.withRuntime ?? defaultWithRuntime, taskId, deps));
  let processed = 0;
  for (const taskId of queued) {
    try {
      await process(taskId);
      processed += 1;
    } catch (err) {
      log(`[classify] process error task=${taskId}: ${err?.message ?? err}`); // transient — the stranded requeue re-drives
    }
  }
  return { requeued, discovered: queued.length, processed, capped: queued.length >= batchSize };
}

// ---------------------------------------------------------------------------
// /ready WARN signal — queued backlog + stranded count (task-driven, so no relay checkpoint).
// Warn-only: a stalled classify consumer must NEVER take chat traffic down. document_processing_tasks
// is a 0009-era table, so this is safe to call BEFORE 0016 is applied (the classify lane rows
// simply do not exist yet ⇒ queued 0).
// ---------------------------------------------------------------------------
export async function classifyHealth(client) {
  const r = await client.query(
    `select
       count(*) filter (where status='queued')::int as queued,
       count(*) filter (where status='running')::int as running,
       coalesce(extract(epoch from (now() - min(created_at) filter (where status='queued'))) * 1000, 0)::bigint as oldest_queued_ms
     from clara.document_processing_tasks where lane='classify' and status in ('queued','running')`,
  );
  return {
    consumer: CLASSIFY_CONSUMER,
    queued: Number(r.rows[0].queued),
    running: Number(r.rows[0].running),
    oldestQueuedMs: Number(r.rows[0].oldest_queued_ms),
  };
}

// ---------------------------------------------------------------------------
// The classify leader loop — its OWN dedicated connection + advisory lock ('classify'),
// mirroring the local_facts loop. Structurally independent: a stall never touches the other
// consumers' leadership, readiness, or the engine heartbeat. `deps.withRuntime` is the pool.
// ---------------------------------------------------------------------------
/**
 * @param {{log?:Function, makeClient?:()=>import("pg").Client, withRuntime?:Function,
 *          batchSize?:number, strandedMs?:number, model?:string,
 *          processTask?:(taskId:string)=>Promise<unknown>}} [deps]
 * @returns {{stop:()=>Promise<void>, done:Promise<void>}}
 */
export function startClassifyLoop(deps = {}) {
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
        await setRuntimeRole(client); // N10 — set role clara_runtime (claim/classify_document are group-granted)
        await acquireLeaderLock(client, CLASSIFY_CONSUMER); // BLOCKS until classify leadership
        await client.query("listen clara_events");
        log("CLASSIFY acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runClassifyCycle(client, { ...deps, log });
            capped = r.capped;
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`CLASSIFY cycle-error ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`CLASSIFY connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
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
