// Document-lane reconciliation (Slice 5 §4.5-4.7; Slice 6 §5 invoice-facts lane).
// Split out of reconciler.mjs (the chat-turn sweepers) so each file stays within the
// module-size budget and the two concerns read independently. runReconcilerSweep in
// reconciler.mjs composes both; every prior import site keeps working via reconciler.mjs
// re-exports. Migration 0007 grants runtime writers + (0008) base-table SELECT.
//
// LANE AWARENESS [Slice 6, §5]: document_processing_tasks now carries a SECOND lane,
// 'invoice_facts' (the semantic Azure DI prebuilt-invoice pass), alongside 'ocr' /
// 'structured_parse' / 'none'. The sweep is lane-agnostic by task status, but the
// RE-ENQUEUE must dispatch to the lane's own workflow: 'ocr'/'structured_parse' →
// documentIngest, 'invoice_facts' → invoiceFacts. A facts task must NEVER be driven
// through documentIngest (that would run OCR steps + persist a layout extraction for a
// facts task). The held-egress bulk release + the stranded requeue are DB-side and
// already cover both lanes (release_held_document_tasks / requeue_stranded_document_task
// key by task, and the 0009 claim/release bodies cover lane in ('ocr','invoice_facts')).

import { listTaskMetas, removeTaskMeta, writeTaskMeta } from "./spool.mjs";
import { verifyCanonical } from "./storage.mjs";

const DOCUMENT_GRACE_MS = Number(process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS || 15000);
let warnedDocumentSelectGap = false;
let warnedInvoiceFactsEnqueueGap = false;
let warnedLocalFactsEnqueueGap = false;

/** True iff the error is the engine's "run id unknown" signal. */
export function isRunNotFound(err) {
  return err != null && (/RunNotFound/i.test(String(err.name || "")) || /run .*not found/i.test(String(err.message || "")));
}

function documentOp(prefix, taskId) {
  return `${prefix}:${taskId}`;
}

/** The re-enqueue driver for a task's lane. 'invoice_facts' rides its own workflow
 *  (invoiceFacts_v1); 'local_facts' rides the non-frozen MyInvois consumer (Wave A2 — no
 *  WDK workflow); every other document lane rides documentIngest. Returns the injected
 *  enqueue fn (or undefined when the supervisor has not wired that lane). */
function enqueueForLane(deps, lane) {
  if (lane === "invoice_facts") return deps.enqueueInvoiceFacts;
  if (lane === "local_facts") return deps.enqueueLocalFacts;
  return deps.enqueueDocumentIngest;
}

/** DB-first intake/reservation reclamation. Sidecars remain a fast resume index,
 * but these rows are the authority and cover a crash before sidecar creation. */
export async function reconcileDocumentIntakes(client, deps = {}) {
  const log = deps.log ?? (() => {});
  const out = { documentIntakesExpired: 0, documentReservationsRefunded: 0 };
  let expired;
  try {
    expired = await client.query(
      `select id from clara.document_intakes
        where status in ('uploading','received','verifying') and expires_at<now()
          and ($1::uuid is null or firm_id=$1)
        order by expires_at limit 100`,
      [deps.onlyFirm ?? null],
    );
  } catch (err) {
    if (isDocumentSelectUnavailable(err)) {
      log(`[reconcile] document intake SELECT unavailable: ${err?.message ?? err}`);
      return out;
    }
    throw err;
  }
  for (const row of expired.rows) {
    try {
      const failed = await client.query("select clara.fail_document_intake($1,$2,$3) as receipt", [
        row.id,
        "expired",
        documentOp("doc-intake-db-expired", row.id),
      ]);
      if (failed.rows[0]?.receipt?.status === "failed") out.documentIntakesExpired += 1;
    } catch (err) {
      if (err?.code !== "CLR16") log(`[reconcile] DB intake expiry failed intake=${row.id}: ${err?.message ?? err}`);
    }
  }

  // A live finalized ingest reservation is bound to its processing task. Only a
  // terminal intake whose unsettled carrier has NO task is orphaned/refundable.
  const orphaned = await client.query(
    `select r.id from clara.document_ingest_reservations r
       join clara.document_intakes i on i.id=r.intake_id and i.firm_id=r.firm_id
      where r.state in ('reserved','resized') and r.task_id is null
        and i.status in ('finalized','adopted','failed')
        and ($1::uuid is null or r.firm_id=$1)
      order by r.created_at limit 100`,
    [deps.onlyFirm ?? null],
  );
  for (const row of orphaned.rows) {
    try {
      const refunded = await client.query("select clara.refund_ingest_reservation($1,$2,$3) as receipt", [
        row.id,
        documentOp("doc-orphan-reservation-refund", row.id),
        "terminal-intake-orphan",
      ]);
      if (refunded.rows[0]?.receipt?.state === "refunded") out.documentReservationsRefunded += 1;
    } catch (err) {
      if (err?.code !== "CLR18") log(`[reconcile] orphan reservation refund failed reservation=${row.id}: ${err?.message ?? err}`);
    }
  }
  return out;
}

function isDocumentSelectUnavailable(err) {
  return err?.code === "42501" || err?.code === "42P01" || /permission denied|does not exist/i.test(String(err?.message || ""));
}


async function documentTaskSnapshot(client, onlyFirm) {
  // TASK COLUMNS ONLY (all 0008-granted). The former clara.documents join always
  // 42501'd on live (the runtime holds no SELECT there — deliberately, PIN-AB-6),
  // which silently killed the DB-authority path and hid every sidecar-less task:
  // exactly the DB-enqueued invoice_facts lane. Document metadata is NOT needed
  // here — OCR sidecar merges keep their intake-written storage fields, and the
  // facts workflow receives storage_path/sha256/mime_type from the CLAIM receipt.
  const result = await client.query(
    `select t.id as task_id, t.document_id, t.firm_id, t.engine_id, t.engine_config,
            t.version_n, t.lane, t.status, t.workflow_run_id as run_id, t.created_at
       from clara.document_processing_tasks t
      where t.status in ('queued','held_egress','running')
        and ($1::uuid is null or t.firm_id=$1)
      order by t.created_at limit 100`,
    [onlyFirm ?? null],
  );
  return result.rows.map((row) => ({
    schemaVersion: 1,
    taskId: String(row.task_id),
    documentId: String(row.document_id),
    firmId: String(row.firm_id),
    engineId: String(row.engine_id),
    engineConfig: row.engine_config ?? {},
    versionN: Number(row.version_n),
    lane: String(row.lane),
    status: String(row.status),
    runId: row.run_id == null ? null : String(row.run_id),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

async function documentTaskIndex(client, deps) {
  try {
    const rows = await documentTaskSnapshot(client, deps.onlyFirm);
    const existingRows = await listTaskMetas();
    // Return (and persist) the MERGED metas: the DB row is authoritative for
    // lifecycle fields, the sidecar for transport fields (storageKey/sha256/mime)
    // the task-only snapshot no longer carries — the sweep's later writeTaskMeta
    // calls spread these merged objects, so returning raw rows would clobber the
    // sidecar's transport fields (the pre-fix joined query masked exactly that).
    const merged = [];
    for (const row of rows) {
      const existing = existingRows.find((meta) => meta?.taskId === row.taskId);
      const meta = { ...existing, ...row };
      await writeTaskMeta(row.taskId, meta);
      merged.push(meta);
    }
    return merged;
  } catch (err) {
    if (!isDocumentSelectUnavailable(err)) throw err;
    if (!warnedDocumentSelectGap) {
      warnedDocumentSelectGap = true;
      deps.log?.("[reconcile] document task SELECT unavailable; using durable spool task index");
    }
    return (await listTaskMetas()).filter((row) => row && !row.corrupt && row.taskId);
  }
}

async function documentRunState(getRun, runId) {
  if (!runId) return "lost";
  try {
    return await getRun(runId).status;
  } catch (err) {
    if (isRunNotFound(err)) return "lost";
    throw err;
  }
}

/** Reconcile queued-unbound, held-egress, and stranded-running document tasks. */
export async function reconcileDocumentTasks(client, deps) {
  const log = deps.log ?? (() => {});
  const out = { documentReenqueued: 0, documentRequeuedLost: 0, documentHeldReleased: 0, documentIntegrityWarnings: 0 };
  if (typeof deps.enqueueDocumentIngest !== "function") return out;

  if (process.env.CLARA_DOC_EGRESS_APPROVED === "1") {
    try {
      // The 0009 body releases held_egress across BOTH lanes ('ocr','invoice_facts');
      // the returned count is the whole released population.
      const released = await client.query("select clara.release_held_document_tasks($1) as receipt", [1000]);
      out.documentHeldReleased = Number(released.rows[0]?.receipt?.released ?? 0);
    } catch (err) {
      log(`[reconcile] held-egress release failed: ${err?.message ?? err}`);
    }
  }

  const tasks = await documentTaskIndex(client, deps);
  for (const task of tasks) {
    if (!task?.taskId) continue;
    if (task.status === "held_egress" && process.env.CLARA_DOC_EGRESS_APPROVED === "1") {
      task.status = "queued";
      task.runId = null;
      await writeTaskMeta(task.taskId, { ...task, updatedAt: new Date().toISOString() });
    }

    if (task.status === "queued") {
      const age = Date.now() - Date.parse(task.createdAt || task.updatedAt || 0);
      if (Number.isFinite(age) && age < (deps.graceMs ?? DOCUMENT_GRACE_MS)) continue;
      if (task.runId) {
        try {
          const state = await documentRunState(deps.getRun, task.runId);
          if (state === "pending" || state === "running") continue;
        } catch (err) {
          log(`[reconcile] document status probe failed task=${task.taskId}: ${err?.message ?? err}`);
          continue;
        }
      }
      // Lane-aware dispatch: never route a facts task through documentIngest.
      const enqueue = enqueueForLane(deps, task.lane);
      if (typeof enqueue !== "function") {
        if (task.lane === "invoice_facts" && !warnedInvoiceFactsEnqueueGap) {
          warnedInvoiceFactsEnqueueGap = true;
          log("[reconcile] invoice_facts re-enqueue skipped: deps.enqueueInvoiceFacts not wired — a facts task is NEVER driven through documentIngest (supervisor must provide enqueueInvoiceFacts)");
        }
        if (task.lane === "local_facts" && !warnedLocalFactsEnqueueGap) {
          warnedLocalFactsEnqueueGap = true;
          log("[reconcile] local_facts re-enqueue skipped: deps.enqueueLocalFacts not wired — a MyInvois facts task is NEVER driven through documentIngest (supervisor must provide enqueueLocalFacts)");
        }
        continue;
      }
      try {
        const run = await enqueue(task.taskId);
        await writeTaskMeta(task.taskId, { ...task, runId: run?.runId ?? null, updatedAt: new Date().toISOString() });
        out.documentReenqueued += 1;
      } catch (err) {
        log(`[reconcile] document re-enqueue failed task=${task.taskId}: ${err?.message ?? err}`);
      }
      continue;
    }

    if (task.status === "running") {
      // local_facts has NO WDK run to probe (its run id is a synthetic token, not a
      // workflow run); its own leader loop owns stranded-running recovery (requeue past a
      // grace). Never probe getRun here — that would error every cycle.
      if (task.lane === "local_facts") continue;
      let state;
      try {
        state = await documentRunState(deps.getRun, task.runId);
      } catch (err) {
        log(`[reconcile] document run probe failed task=${task.taskId}: ${err?.message ?? err}`);
        continue;
      }
      if (state !== "lost") continue;
      try {
        await client.query("select clara.requeue_stranded_document_task($1,$2)", [
          task.taskId,
          documentOp("doc-engine-lost", task.taskId),
        ]);
        await writeTaskMeta(task.taskId, { ...task, status: "queued", runId: null, updatedAt: new Date().toISOString() });
        out.documentRequeuedLost += 1;
      } catch (err) {
        if (err?.code === "CLR16") await removeTaskMeta(task.taskId);
        else log(`[reconcile] document stranded requeue failed task=${task.taskId}: ${err?.message ?? err}`);
      }
    }
  }

  // Coarse integrity pass: verify retained canonical references, never delete.
  if (deps.integrity) {
    for (const task of tasks.slice(0, 10)) {
      if (!task.storageKey || !task.sha256) continue;
      try {
        await verifyCanonical(task.storageKey, task.sha256);
      } catch (err) {
        out.documentIntegrityWarnings += 1;
        log(`[reconcile] DOCUMENT STORAGE INTEGRITY task=${task.taskId}: ${err?.message ?? err}`);
      }
    }
  }
  return out;
}
