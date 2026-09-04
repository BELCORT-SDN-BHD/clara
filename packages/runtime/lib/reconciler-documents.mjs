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
// already cover every egressing lane (release_held_document_tasks /
// requeue_stranded_document_task key by task, and the claim/release bodies cover
// lane in ('ocr','invoice_facts','statement_facts') since 0038).
//
// F4 (migration 0050): the release is DB-ADJUDICATED, not flag-adjudicated. The sweep asks
// the database to release, then re-reads; whatever still says 'held_egress' is never
// dispatched. See reconcileDocumentTasks's own comment for why the previous env-flag
// rewrite was the other half of the release/re-hold storm.
//
// WAVE C-b (design part2 §5): two MORE lanes — 'statement_facts' (pdf/image, model egress
// under a typed consent) and 'statement_parse' (csv/ofx, a free in-process parse) — both
// dispatched to the ONE statementFacts workflow, which branches on the lane inside.
// F-A2 WINDOW B trued two things this paragraph used to state: the registry now points
// `statementFacts:` at statementFacts_v3 (the TEXT+VISION witness pair on `statement_facts`;
// `statement_parse` is carried over behaviourally unchanged, reached by importing v1's own
// steps), and the enqueue-time typed consent both lanes answer to is now `witness_extraction`,
// not `statement_extraction` — ONE branch in `clara._enqueue_invoice_facts_core` gates both.
// The Wave C-b change also turned `enqueueForLane` from a fall-through into an
// EXPLICIT ALLOWLIST: an unrecognised lane returns undefined and warns once instead of
// being driven into documentIngest. Read that function's own header for why the old default
// was a live hazard rather than a tidy-up.

import { listTaskMetas, mergeTaskMeta, removeTaskMeta, writeTaskMeta } from "./spool.mjs";
import { verifyCanonical } from "./storage.mjs";
// Same identity test as reconciler.mjs's isLeaderHalt, inlined rather than imported: reconciler.mjs
// imports THIS module, so importing back would cycle. The class must come from the SAME import
// specifier (./relay.mjs) so `instanceof` agrees with leader.mjs:218 — see reconciler.mjs:21-26.
import { TaxonomyHaltError } from "./relay.mjs";
// F-A2 opener ④ — mint pacing (global + per-firm). Own module, same module-size budget that split
// this file out of reconciler.mjs; its header carries the incident, the exact invariant delivered,
// and the age-ordering qualification. Read it before changing the gate below.
import { laneCapHints, laneRunningCounts, makeLaneMintBudget, runningCountsFromSnapshot } from "./reconciler-pacing.mjs";

const DOCUMENT_GRACE_MS = Number(process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS || 15000);
let warnedDocumentSelectGap = false;
let warnedInvoiceFactsEnqueueGap = false;
let warnedLocalFactsEnqueueGap = false;
let warnedClassifyEnqueueGap = false;
let warnedStatementFactsEnqueueGap = false;
let warnedWitnessFactsEnqueueGap = false;
/** Lanes this image does not recognise at all, warned once each (see enqueueForLane). */
const warnedUnknownLanes = new Set();

/** True iff the error is the engine's "run id unknown" signal. */
export function isRunNotFound(err) {
  return err != null && (/RunNotFound/i.test(String(err.name || "")) || /run .*not found/i.test(String(err.message || "")));
}

function documentOp(prefix, taskId) {
  return `${prefix}:${taskId}`;
}

/** The re-enqueue driver for a task's lane — an EXPLICIT ALLOWLIST (Wave C-b, design part2
 *  §5 [R1]). It used to FALL THROUGH to documentIngest for anything it did not recognise.
 *  That default was safe only while every unknown lane happened to be an OCR-shaped one; it
 *  stopped being safe the moment a lane existed whose whole point is that it must not run
 *  through a consentless generic OCR pass. Deploy order is runtime-image-FIRST, so this
 *  image demonstrably runs against a database that will later gain lanes it has never heard
 *  of — and under the old default, a `statement_facts` task appearing in that window would
 *  have been driven straight into documentIngest: real Azure egress on a bank statement,
 *  outside the typed consent gate entirely. An unknown lane now returns undefined and warns
 *  ONCE; the task simply waits for the image that owns it.
 *
 *  Per lane: 'ocr'/'structured_parse'/'none' ride documentIngest; 'invoice_facts' rides its
 *  own workflow (invoiceFacts_v1); 'statement_facts'/'statement_parse' ride whichever body the
 *  registry's `statementFacts:` key names — ONE workflow, branching on the lane inside (design
 *  §4.3). Since the F-A2 Window-B activation that key is the witness pair, and since
 *  H-02/H-03/H-05 it is statementFacts_v3: the pdf/image `statement_facts` lane is the
 *  TEXT+VISION pair, while `statement_parse` (csv/ofx) is carried over behaviourally unchanged,
 *  reached by IMPORTING v1's own claim+process steps.
 *  Both lanes answer to the `witness_extraction` typed consent from that window onward (ONE
 *  branch in `clara._enqueue_invoice_facts_core` gates the pair); 'llm_witness' rides
 *  witnessFacts_v1 (F-A1 PR-3 cutover — the DB-side router mints this lane for every
 *  invoice-shaped document now; an old image without this arm would warn-once and wait,
 *  never fall through to documentIngest, which is the whole point of the allowlist below);
 *  'local_facts' rides the non-frozen MyInvois consumer (Wave A2 — no WDK workflow);
 *  'classify' rides the non-frozen classify consumer (Wave A2.1 — its OWN leader loop
 *  discovers + drives queued tasks), so the shared reconciler has NO dispatch role for it and
 *  MUST NOT fall through to documentIngest (that would start an Azure DI OCR run for a
 *  classify task — real vendor egress — which then fails at persist_document_extraction,
 *  CLR16).
 *
 *  Returns the injected enqueue fn, or undefined when the lane is owned elsewhere / the
 *  supervisor has not wired that lane / the lane is unknown to this image. */
function enqueueForLane(deps, lane) {
  if (lane === "ocr" || lane === "structured_parse" || lane === "none") return deps.enqueueDocumentIngest;
  if (lane === "invoice_facts") return deps.enqueueInvoiceFacts;
  if (lane === "statement_facts" || lane === "statement_parse") return deps.enqueueStatementFacts;
  if (lane === "llm_witness") return deps.enqueueWitnessFacts;
  if (lane === "local_facts") return deps.enqueueLocalFacts;
  if (lane === "classify") return undefined; // owned by the classify leader loop, never documentIngest
  if (!warnedUnknownLanes.has(String(lane))) {
    warnedUnknownLanes.add(String(lane));
    (deps.log ?? (() => {}))(
      `[reconcile] unknown document lane '${lane}' — NOT dispatched. This image does not own that lane; `
      + "it is never fallen through to documentIngest (that would start a generic OCR run outside the lane's own "
      + "consent/egress controls). Deploy the image that owns it.",
    );
  }
  return undefined;
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
  //
  // GUARDED LIKE ITS SIBLING ABOVE, and it was not: this SELECT ran completely bare while the
  // intake SELECT twenty lines up already degraded cleanly on the missing-surface/permission
  // pair. The asymmetry was the whole defect — on a database where the runtime lacks SELECT on
  // document_ingest_reservations (or the table is not yet there), the first half of this sweeper
  // returned its partial receipt politely and the second half threw, aborting the sweep from
  // here on. The isDocumentSelectUnavailable pair degrades to the partial receipt already
  // computed; anything else is a genuine fault and stays LOUD (now contained at the belt
  // boundary in runReconcilerSweep, so loud no longer means the whole cycle dies).
  let orphaned;
  try {
    orphaned = await client.query(
      `select r.id from clara.document_ingest_reservations r
         join clara.document_intakes i on i.id=r.intake_id and i.firm_id=r.firm_id
        where r.state in ('reserved','resized') and r.task_id is null
          and i.status in ('finalized','adopted','failed')
          and ($1::uuid is null or r.firm_id=$1)
        order by r.created_at limit 100`,
      [deps.onlyFirm ?? null],
    );
  } catch (err) {
    if (isDocumentSelectUnavailable(err)) {
      log(`[reconcile] orphan reservation SELECT unavailable: ${err?.message ?? err}`);
      return out;
    }
    throw err;
  }
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
    // Return (and persist) the MERGED metas: the DB row is authoritative for lifecycle
    // fields, the sidecar for everything the task-only snapshot doesn't carry —
    // transport (storageKey/sha256/mime) AND diagnostic (lastError/lastErrorNote).
    //
    // task #28 (P4): each task's merge base is read FRESH here, right before its own
    // write — NOT from one bulk `listTaskMetas()` snapshot taken before this loop. A
    // batch read racing a CONCURRENT noteTransientFailure/noteTerminalFailure call (a
    // different run, writing that task's OWN sidecar while this sweep is mid-loop) used
    // to let this sweep write a stale merge back over it, silently erasing `lastError`.
    // mergeTaskMeta's read-then-write narrows that window to one fs read + one fs write
    // per task — the same granularity every other sidecar mutator already uses. It does
    // NOT eliminate the race (a write landing in that exact gap still loses); a hard
    // guarantee needs real locking or a version/mtime CAS, out of scope here.
    //
    // Q2: a corrupt/unreadable ONE sidecar (a malformed task-<id>.json — JSON.parse
    // throws) must not abort the WHOLE sweep — the bulk `listTaskMetas()` path this
    // replaced already tolerated exactly this (listJson pushes {corrupt:true,...} and
    // moves on). Per task, a merge failure REBUILDS that one row from Postgres alone
    // (the DB row is authoritative for lifecycle fields regardless), losing BOTH the
    // transport fields (storageKey/sha256/mime/format) AND the diagnostic ones
    // (lastError/lastErrorNote) that only the sidecar carried — the rebuild is DB-only,
    // by design, until the next successful write re-establishes them. Every OTHER task in
    // the sweep is unaffected.
    //
    // R2: logged PER OCCURRENCE, not once-per-process — a one-shot warning would hide
    // every corruption after the first, and repeated corruption (a systemic disk/fs
    // problem, not a one-off) is exactly the case worth seeing. `corruptRebuilt` also
    // rides back in the sweep's own return value so a caller can assert on it directly,
    // without depending on log output.
    const merged = [];
    let corruptRebuilt = 0;
    for (const row of rows) {
      try {
        merged.push(await mergeTaskMeta(row.taskId, row));
      } catch (err) {
        corruptRebuilt += 1;
        deps.log?.(`[reconcile] task sidecar unreadable, rebuilding from Postgres alone (transport + diagnostic fields dropped) task=${row.taskId}: ${err?.message ?? err}`);
        await writeTaskMeta(row.taskId, row);
        merged.push(row);
      }
    }
    return { tasks: merged, corruptRebuilt };
  } catch (err) {
    if (!isDocumentSelectUnavailable(err)) throw err;
    if (!warnedDocumentSelectGap) {
      warnedDocumentSelectGap = true;
      deps.log?.("[reconcile] document task SELECT unavailable; using durable spool task index");
    }
    return { tasks: (await listTaskMetas()).filter((row) => row && !row.corrupt && row.taskId), corruptRebuilt: 0 };
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
  const out = { documentReenqueued: 0, documentRequeuedLost: 0, documentHeldReleased: 0, documentHeldDeclined: 0, documentIntegrityWarnings: 0, documentSidecarCorruptRebuilt: 0, documentTransportless: 0, documentPacedDeferred: 0 };
  if (typeof deps.enqueueDocumentIngest !== "function") return out;

  if (process.env.CLARA_DOC_EGRESS_APPROVED === "1") {
    try {
      // The DB body adjudicates the release across the whole EGRESSING lane triple
      // ('ocr','invoice_facts','statement_facts'). It does NOT release everything it
      // selects: a held invoice_facts task whose filing clients lack a live consent is
      // deliberately LEFT held (migration 0050 — the F4 fix). The returned count is the
      // population it actually MOVED to 'queued', not the population it considered.
      const released = await client.query("select clara.release_held_document_tasks($1) as receipt", [1000]);
      out.documentHeldReleased = Number(released.rows[0]?.receipt?.released ?? 0);
    } catch (err) {
      log(`[reconcile] held-egress release failed: ${err?.message ?? err}`);
    }
  }

  // Read AFTER the release, so a row the DB just released reads 'queued' here on its own.
  //
  // CONTAINED AT THE BELT BOUNDARY, and the inner re-throw at documentTaskIndex's own catch
  // STAYS. Those two facts belong together: documentTaskIndex deliberately re-raises anything
  // that is NOT the missing-surface/permission pair, because a genuine fault must never be
  // laundered into "the durable spool says there are no tasks" — an empty index is
  // indistinguishable from a healthy idle firm, and dispatch decisions are made off it. But
  // loud is not the same as fatal: bare, that re-throw left the document belt as the one
  // remaining way for a single failed read to abort every sweeper behind it (intakes, spool
  // TTL, the daily belts). Caught HERE, the belt reports what it actually did — the release
  // count it already earned — and the sweep goes on. `documentTaskIndexOk:false` says the index
  // was never read, so a zero task count is never mistaken for "nothing to do".
  let index;
  try {
    index = await documentTaskIndex(client, deps);
  } catch (err) {
    // A HALT must still reach the leader even through this belt-boundary catch (the wrapper's own
    // law in reconciler.mjs's belt()) — re-check before containing.
    if (err instanceof TaxonomyHaltError || err?.halt) throw err;
    log(`[reconcile] document task index unreadable — no document task was examined this cycle: ${err?.message ?? err}`);
    return { ...out, documentTaskIndexOk: false };
  }
  const { tasks, corruptRebuilt } = index;
  out.documentTaskIndexOk = true; // POSITIVE evidence, set only where a read actually returned
  out.documentSidecarCorruptRebuilt = corruptRebuilt;

  // F-A2 opener ④: this sweep's mint budget (global + per-firm — see reconciler-pacing.mjs), built
  // ONCE from a census taken after the release and before the first mint. `documentPacingSource`
  // SAYS which census answered ('db' | 'snapshot'). Contained like the index read above, HALT
  // re-checked first: a failed census costs pacing its precision, never the sweep.
  let runningRows = [];
  let pacingSource = "db";
  try {
    runningRows = await laneRunningCounts(client, deps.onlyFirm ?? null);
  } catch (err) {
    if (err instanceof TaxonomyHaltError || err?.halt) throw err;
    runningRows = runningCountsFromSnapshot(tasks);
    pacingSource = "snapshot";
    log(`[reconcile] lane running-count census unavailable — pacing from the sweep's own snapshot instead (it carries a LIMIT, so it may under-count and widen the budget toward the cap; it can never remove the cap): ${err?.message ?? err}`);
  }
  out.documentPacingSource = pacingSource;
  const laneBudget = makeLaneMintBudget(runningRows, deps.laneCaps ?? laneCapHints());

  for (const task of tasks) {
    if (!task?.taskId) continue;
    // F4 (H2 acceptance report), the RUNTIME half of the fix. This used to rewrite EVERY
    // held_egress task to 'queued' in the sweep's own working copy whenever
    // CLARA_DOC_EGRESS_APPROVED was "1", and then dispatch it — regardless of what
    // clara.release_held_document_tasks had just decided one statement earlier. That made
    // the env flag, not the database, the release authority: the DB would correctly decline
    // a consent-held task and the reconciler would dispatch it anyway, the claim would
    // re-derive 'no_consent' and re-hold it, and the pair cycled ~29 workflow runs/minute
    // for six minutes (DB connections 32/60 → 42/60, two health flaps). Fixing only the DB
    // half would have left that storm running at exactly the same rate.
    //
    // The DB row is now the authority, per evidence law 2 (absence is not evidence, and a
    // derived state is not evidence): a task that STILL reads 'held_egress' in the snapshot
    // taken AFTER the release call is one the release DECLINED — or one whose release never
    // ran (flag off, the call raised, the sweep's limit was reached, or the snapshot fell
    // back to the durable sidecar index because the DB SELECT was unavailable). Every one of
    // those is a "we did not SEE it released", and all of them fall through to the same
    // fail-closed branch: never dispatch. A genuinely released task needs nothing here —
    // its own DB row already says 'queued' and it flows into the queued branch below.
    if (task.status === "held_egress") {
      out.documentHeldDeclined += 1;
      continue;
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
      // 0051 §2 — NEVER DISPATCH A TRANSPORT-LESS INGEST TASK. documentIngest reads
      // storageKey/sha256 off the SIDECAR (behavior_v2.mjs:190-193), and storage.mjs's
      // safeKey() rejects an empty key outright — so a task dispatched without them does not
      // fail honestly, it manufactures a `storage_error` terminal that looks exactly like a
      // real vendor fault, burning an attempt and closing the document out under a misleading
      // code. That shape is reachable: documentTaskIndex's own merge is deliberately LENIENT
      // (mergeTaskMeta with requireExists:false, :224) and REBUILDS a missing sidecar from the
      // task columns alone — which carry no transport at all — and this loop would then
      // dispatch it once past the grace. Skip and say so; the DB door's ECHO mode rebuilds the
      // real sidecar on the next re-upload of the same bytes (migration 0051 §2), which is the
      // action the human is already taking. A queued task that waits is recoverable; a task
      // terminalised under a false code is not.
      if ((task.lane === "ocr" || task.lane === "structured_parse" || task.lane === "none")
          && (!task.storageKey || !task.sha256)) {
        out.documentTransportless += 1;
        log(`[reconcile] ingest task ${task.taskId} (lane ${task.lane}) has no transport metadata in its sidecar — NOT dispatched. Re-uploading the same bytes will rebuild it (0051 §2 recovery echo); dispatching now would manufacture a storage_error terminal that is indistinguishable from a real engine failure.`);
        continue;
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
        if ((task.lane === "statement_facts" || task.lane === "statement_parse") && !warnedStatementFactsEnqueueGap) {
          warnedStatementFactsEnqueueGap = true;
          log("[reconcile] statement re-enqueue skipped: deps.enqueueStatementFacts not wired — a bank-statement task is NEVER driven through documentIngest (that would run a generic OCR pass outside the typed witness_extraction consent gate both statement lanes answer to since F-A2 Window B; supervisor must provide enqueueStatementFacts)");
        }
        if (task.lane === "llm_witness" && !warnedWitnessFactsEnqueueGap) {
          warnedWitnessFactsEnqueueGap = true;
          log("[reconcile] llm_witness re-enqueue skipped: deps.enqueueWitnessFacts not wired — a witness task is NEVER driven through documentIngest (that would run a generic OCR pass outside the typed witness_extraction consent gate; supervisor must provide enqueueWitnessFacts)");
        }
        if (task.lane === "classify" && !warnedClassifyEnqueueGap) {
          warnedClassifyEnqueueGap = true;
          log("[reconcile] classify re-enqueue skipped: the classify leader loop owns this lane's dispatch — a classify task is NEVER driven through documentIngest (that would start an Azure OCR run + fail at persist_document_extraction, CLR16)");
        }
        continue;
      }
      // F-A2 opener ④ — THE PACING GATE, placed HERE deliberately: after every other reason this
      // task would not be dispatched, so a slot is only spent on one the sweep really would have
      // minted. A refusal leaves the row untouched (still `queued`), so the next sweep mints it —
      // oldest-first on the DB snapshot path. CLR18 remains the authority on the claim itself.
      if (!laneBudget.tryMint(task.firmId, task.lane)) {
        out.documentPacedDeferred += 1;
        continue;
      }
      try {
        // A slot spent on an enqueue that THROWS is not refunded — the run may already have
        // started, and over-counting our spend only paces slower, where under-counting re-herds.
        const run = await enqueue(task.taskId);
        await writeTaskMeta(task.taskId, { ...task, runId: run?.runId ?? null, updatedAt: new Date().toISOString() });
        out.documentReenqueued += 1;
      } catch (err) {
        log(`[reconcile] document re-enqueue failed task=${task.taskId}: ${err?.message ?? err}`);
      }
      continue;
    }

    if (task.status === "running") {
      // The synthetic-run lanes (local_facts, classify) have NO WDK run to probe — their run
      // id is a synthetic token ('classify:<task>:<uuid>'), not a workflow run — so
      // documentRunState would resolve 'lost' (RunNotFound, or a NULL run id) and requeue a
      // LIVE task mid-work: for classify that means a SECOND concurrent generateObject call +
      // a double-settle race. Each lane's OWN leader loop owns stranded-running recovery
      // (requeue past a grace on its dedicated connection). Never probe getRun here.
      if (task.lane === "local_facts" || task.lane === "classify") continue;
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

  // ONE line per sweep, never one per task, and never de-duplicated: a deep queue that STAYS deep
  // is what an operator most needs to keep seeing. `bound` is a POSITIVE read of the budget, not a
  // guess from the count — a spent global cap means the POOL is the constraint (raise
  // CLARA_RUNTIME_POOL_MAX or accept a slower drain); a full window means that firm's lane limit.
  if (out.documentPacedDeferred > 0) {
    const bound = laneBudget.remainingGlobal() <= 0 ? "the sweep-wide pool cap" : "their firms' lane windows";
    log(`[reconcile] lane pacing deferred ${out.documentPacedDeferred} queued task(s) this sweep (census=${pacingSource}, bound=${bound}) — they stay queued and are minted oldest-first next sweep, rather than minting runs that could only die on CLR18 or take a pool checkout the runtime cannot absorb.`);
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
