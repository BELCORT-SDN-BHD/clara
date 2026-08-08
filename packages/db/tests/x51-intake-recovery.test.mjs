// x51 §2 — THE INTAKE RECOVERY DOOR (migration 0051 §2): re-uploading the same file recovers
// a failed INGEST. The facts-lane twin lives in x51-extraction-recovery.test.mjs; the runtime
// half in packages/runtime/tests/intake-recovery-{unit,db}.test.mjs.
//
// Every cell drives clara.finalize_document_intake for real against Postgres and reads the
// committed rows back. The setup shape is the one x-lane-widen-0026's own P2 cell established:
// a verified document, a planted task in whatever state the cell is about, then a SECOND
// intake of the same sha256 — the exact ELSE (adopted) branch.
//
// WEIGHTED TOWARDS WHAT A DOOR CAN GET WRONG. The first cut of this door passed a green
// battery and was still NOT_READY on cross-model + native review, because the battery only
// exercised the happy path. Every adversarial probe either review raised is a cell here:
// the budget bypass, the deterministic-failure re-buy, the engine-snapshot bump, the
// CSV/TSV reader swap, the crash-window heal, and the concurrent re-upload.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, opk, endPool, buildWorld,
  taskRow, laneTasks, seedIntake, finalizeIntake, seedVerifiedDocument, requireRecoveryDoor,
  holdThenContend, markSkip, noteLane, printLaneNotes, printSkipCount,
} from "./x1-helpers.mjs";

let W = null;
let ready = false;
let live = false;

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
    ready = true;
  } catch (e) {
    noteLane(`rig-docs ensureReady failed (${e?.code ?? "?"}) — probing the live catalog as-is`);
    ready = true;
  }
  // Keyed on the migration's STABLE SUFFIX + a catalog cross-check (see x1-helpers.mjs):
  // a number-keyed gate turns a merge-time renumber into a silent all-skip green.
  live = await requireRecoveryDoor();
  if (ready && live) W = await buildWorld();
});
after(async () => { printLaneNotes("x51-intake-recovery"); printSkipCount("x51-intake-recovery"); await endPool(); });

function gate(t, msg = "the extraction-recovery door is not applied — battery dormant") {
  if (!ready || !live) { markSkip(); t.skip(msg); return true; }
  return false;
}

const FIXTURE_ENGINE = "clara-fixture:v1"; // finalize_document_intake's own p_engine_id default
const AZURE_OCR = "azure-di:prebuilt-layout:2024-11-30";

/** The ONLY error codes a terminally-failed task may carry with a NULL workflow_run_id —
 *  ck_processing_task_binding_0038's never-claimed allowlist (0038:7304-7305). */
const NEVER_CLAIMED = ["budget", "attempt_cap", "skipped_kind", "consent_inactive", "statement_multi_client"];

const freshSha = () => randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);

/** Plant a processing task in a shape the product could actually produce.
 *  ck_processing_task_binding_0038 admits a NULL workflow_run_id on a failed row only for the
 *  never-claimed five; every ordinary failure reaches 'failed' through a CLAIMED task and
 *  keeps its run id + started_at, which is exactly what persist_document_extraction and
 *  fail_invoice_facts produce (both refuse a task that is not already 'running'). */
async function plantTask(firm, document, { engine = FIXTURE_ENGINE, version = 1, lane = "ocr", status, error = null, attempts = null, neverClaimed = false } = {}) {
  if (status === "failed" && neverClaimed && !NEVER_CLAIMED.includes(error)) {
    throw new Error(`plantTask: '${error}' is not one of the never-claimed codes — a failed row with no run id would violate ck_processing_task_binding_0038`);
  }
  const claimed = status === "running" || status === "done" || (status === "failed" && !neverClaimed);
  const terminal = status === "done" || status === "failed";
  const now = new Date().toISOString();
  const r = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,workflow_run_id,started_at,finished_at,attempt_count)
     values ($1,$2,$3,'{}'::jsonb,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [firm, document, engine, version, lane, status, error,
      claimed ? `rig-run-${randomUUID()}` : null,
      claimed ? now : null,
      terminal ? now : null,
      attempts ?? (claimed ? 1 : 0)]);
  return r.rows[0].id;
}

/** A verified document plus a SECOND intake of the same bytes, finalized — the adopted branch,
 *  driven for real. `mime` is the RE-UPLOAD's declared mime; `docMime` the document's durable
 *  one (they differ only in the CSV/TSV cell). `reserve` seeds the intake reservation row that
 *  a real create_document_intake would have taken, so the bind can be observed. */
async function reIngest(firm, plant, {
  lane = null, engine = null, mime = "application/pdf", docMime = null, ext = "pdf", reserve = false,
} = {}) {
  const sha = freshSha();
  // Seeded, NEVER updated afterwards: clara.documents' bytes/storage bond is immutable by
  // trigger (CLR15, "may change only through legacy upgrade") — which is the product working,
  // and the first cut of this fixture learned it the honest way, from the rig.
  const seed = await seedVerifiedDocument({
    firm, sha256: sha, mime: docMime ?? mime, filename: `rig.${ext}`,
    storagePath: `firms/${firm}/docs/${sha}.${ext}`,
  });
  if (plant) await plant(firm, seed.documentId);
  const dup = await seedIntake({
    firm, uploadedBy: W.users.alice, sha256: sha, status: "verified", mime,
    storageKey: `firms/${firm}/docs/${sha}.${ext}`,
  });
  let reservation = null;
  if (reserve) {
    const r = await rootQuery(
      `insert into clara.document_ingest_reservations(firm_id,intake_id,pages_reserved,lease_expires_at)
       values ($1,$2,3,now()+interval '1 hour') returning id`, [firm, dup]);
    reservation = r.rows[0].id;
  }
  const receipt = (lane || engine)
    ? (await roleQuery(ROLES.runtime,
        `select clara.finalize_document_intake(p_intake=>$1, p_engine_id=>$2, p_lane=>$3,
           p_version_n=>1, p_op_key=>$4) as r`,
        [dup, engine ?? FIXTURE_ENGINE, lane ?? "ocr", opk("x51fin")])).rows[0].r
    : await finalizeIntake({ intake: dup });
  return { documentId: seed.documentId, sha, receipt, intake: dup, reservation };
}

const reservationRow = async (id) => (await rootQuery(
  "select state, task_id, refund_reason from clara.document_ingest_reservations where id=$1", [id])).rows[0];

// ===========================================================================
// THE ADMISSION
// ===========================================================================

test("[0051 §2] a RETRYABLE failed ingest + a re-upload: adopted, a recovery minted, and the reservation BOUND", async (t) => {
  if (gate(t)) return;
  const firm = W.firms.A;
  let failedTask = null;
  const { documentId, sha, receipt, reservation } = await reIngest(firm, async (f, d) => {
    failedTask = await plantTask(f, d, { status: "failed", error: "engine_error" });
  }, { reserve: true });

  const frozen = await taskRow(failedTask);
  assert.equal(frozen.status, "failed", "mandatory setup: the only ingest task is TERMINAL");

  assert.equal(receipt.status, "adopted", "the receipt still says ADOPTED — the document really was adopted by sha256");
  assert.ok(receipt.recovery, "…and it carries a recovery fragment");
  assert.equal(receipt.recovery.mode, "mint", "…in MINT mode");
  assert.equal(receipt.recovery.lane, "ocr", "…on the ingest lane");
  assert.equal(receipt.recovery.version_n, 2, "…at version max+1");
  assert.equal(receipt.recovery.sha256, sha, "…carrying the document's own sha256");
  assert.equal(receipt.recovery.storage_path, `firms/${firm}/docs/${sha}.pdf`, "…and its durable storage_path");
  assert.equal(receipt.recovery.format, "pdf",
    "…and a DURABLE format, derived from that path's extension rather than from the re-upload's "
    + "filename-sensitive detection");
  assert.equal(receipt.recovery.mime_type, "application/pdf", "…and the document's durable mime");
  assert.equal(receipt.task_id, receipt.recovery.task_id, "the receipt's task_id names the LIVE task");

  const tasks = await laneTasks(documentId, "ocr");
  assert.equal(tasks.length, 2, "exactly one new row exists");
  assert.equal(tasks.find((x) => x.id === receipt.recovery.task_id).status, "queued", "…and it is queued");

  // THE CRITICAL FINDING'S FIX, asserted positively: a recovery is a real vendor attempt and
  // it PAYS. The re-upload's own intake reservation is bound to the new task instead of being
  // refunded, so the page budget it took at intake is spent on the read it buys.
  const res = await reservationRow(reservation);
  assert.equal(res.state, "reserved", "the intake reservation was NOT refunded");
  assert.equal(res.task_id, receipt.recovery.task_id, "…it is BOUND to the recovery task, exactly as a fresh ingest's is");

  assert.deepEqual(await taskRow(failedTask), frozen,
    "the terminally-failed row is byte-identical afterwards — a SIBLING was minted, never a reopen");
});

test("[0051 §2] a HEALTHY adoption is untouched: no recovery key, no task, and the reservation is REFUNDED", async (t) => {
  if (gate(t)) return;
  const firm = W.firms.A;
  const { documentId, receipt, reservation } = await reIngest(
    firm, (f, d) => plantTask(f, d, { status: "done" }), { reserve: true });

  assert.equal(receipt.status, "adopted", "a healthy duplicate still adopts");
  assert.equal(receipt.recovery, undefined,
    "…and the receipt carries NO recovery key whatsoever — the key is appended conditionally so "
    + "every intake receipt in the product stays byte-identical to what it was");
  assert.equal((await laneTasks(documentId, "ocr")).length, 1, "…nothing was minted");
  const res = await reservationRow(reservation);
  assert.equal(res.state, "refunded", "…and the adoption refunded its reservation, exactly as it always did");
  assert.equal(res.refund_reason, "duplicate-adopted", "…under the unchanged reason");
});

// ===========================================================================
// THE REFUSALS — every one NAMED on the receipt
// ===========================================================================

test("[0051 §2] a DETERMINISTIC failure is refused by name: the same bytes will not read differently", async (t) => {
  if (gate(t)) return;
  // The native review's scenario: a 100-page corrupt or encrypted PDF fails deterministically,
  // and admitting it would buy a full vendor read of a document that cannot succeed — once per
  // re-upload, forever. Only documentIngest.behavior_v2.mjs's own RETRYABLE set is admitted.
  const firm = W.firms.A;
  for (const code of ["corrupt", "encrypted", "bad_type", "internal"]) {
    const { documentId, receipt, reservation } = await reIngest(
      firm, (f, d) => plantTask(f, d, { status: "failed", error: code }), { reserve: true });
    assert.equal(receipt.recovery, undefined, `a '${code}' failure mints nothing`);
    assert.ok(receipt.recovery_refused, "…and the refusal is on the receipt, not silent");
    assert.equal(receipt.recovery_refused.reason, "not_retryable", "…named");
    assert.equal(receipt.recovery_refused.error_code, code, "…with the code that caused it");
    assert.match(receipt.recovery_refused.remedy, /re-export/i,
      "…and the honest remedy: new bytes are a new document and take the ordinary pipeline");
    assert.equal((await laneTasks(documentId, "ocr")).length, 1, "…no task was minted");
    assert.equal((await reservationRow(reservation)).state, "refunded", "…and nothing was charged");
  }
  // …while the four transient codes DO admit, so this is a specific gate and not a blanket deny.
  for (const code of ["engine_error", "timeout", "engine_lost", "storage_error"]) {
    const { receipt } = await reIngest(firm, (f, d) => plantTask(f, d, { status: "failed", error: code }));
    assert.ok(receipt.recovery, `a '${code}' failure is retryable and admits`);
  }
});

test("[0051 §2] identical bytes re-uploaded under a DIFFERENT extension are refused, never parsed by the wrong reader", async (t) => {
  if (gate(t)) return;
  // Detection is filename-sensitive for the ambiguous text formats. Identical bytes sent once
  // as .csv and again as .tsv keep the same sha256, the same lane and the same engine — every
  // other check passes — and the frozen worker would then parse a CSV document as TSV.
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(
    firm, (f, d) => plantTask(f, d, { lane: "structured_parse", engine: "clara-structured:v1", status: "failed", error: "engine_error" }),
    { lane: "structured_parse", engine: "clara-structured:v1", mime: "text/tab-separated-values", docMime: "text/csv", ext: "csv" },
  );
  assert.equal(receipt.recovery, undefined, "the recovery is refused");
  assert.equal(receipt.recovery_refused?.reason, "mime_mismatch", "…by name");
  assert.equal(receipt.recovery_refused.document_mime, "text/csv", "…quoting the document's durable mime");
  assert.equal(receipt.recovery_refused.upload_mime, "text/tab-separated-values", "…and the re-upload's");
  assert.equal((await laneTasks(documentId, "structured_parse")).length, 1, "…and nothing was minted");
});

test("[0051 §2] the lane's summed-attempt CAP refuses the fourth attempt", async (t) => {
  if (gate(t)) return;
  // For an ingest lane this door is the ONLY cap there is: claim_document_processing_task's cap
  // is scoped to ('invoice_facts','statement_facts') (0038:6907) and never sees ocr.
  const firm = W.firms.A;
  const { documentId, receipt, reservation } = await reIngest(firm, async (f, d) => {
    await plantTask(f, d, { version: 1, status: "failed", error: "engine_error", attempts: 1 });
    await plantTask(f, d, { version: 2, status: "failed", error: "engine_error", attempts: 1 });
    await plantTask(f, d, { version: 3, status: "failed", error: "engine_error", attempts: 1 });
  }, { reserve: true });

  assert.equal(receipt.recovery, undefined, "three attempts are spent; the fourth is refused");
  assert.equal(receipt.recovery_refused?.reason, "attempt_cap", "…by name");
  assert.equal(receipt.recovery_refused.attempts, 3, "…quoting the count it measured");
  assert.equal((await laneTasks(documentId, "ocr")).length, 3, "…and no fourth row exists");
  assert.equal((await reservationRow(reservation)).state, "refunded", "…and nothing was charged for the refusal");
});

test("[0051 §2] WITNESS (registered, not fixed): the mint is capped, but a lost run can RECLAIM past the cap", async (t) => {
  if (gate(t)) return;
  // This cell pins TODAY'S FACTUAL BEHAVIOUR for a property registered in migration 0051's
  // header (R2) and carried to the open register — it is a witness, not an assertion that the
  // behaviour is desirable.
  //
  // THE CYCLE, and why none of it is this door's: the door caps at MINT time, but
  // clara.claim_document_processing_task's own cap excludes ocr (0038:6907) while every claim
  // increments attempt_count (0038:6937), and clara.requeue_stranded_document_task — created in
  // 0007_document_pipeline.sql:2146, forty-four migrations before this one — legally returns a
  // stranded task to 'queued' so it can be claimed again. The identical cycle applies to an
  // ORDINARY intake-minted ocr task; the door neither created it nor widened it.
  const firm = W.firms.A;
  let minted = null;
  const { documentId, receipt } = await reIngest(firm, async (f, d) => {
    await plantTask(f, d, { version: 1, status: "failed", error: "engine_error", attempts: 1 });
    await plantTask(f, d, { version: 2, status: "failed", error: "engine_error", attempts: 1 });
  }, { reserve: true });
  assert.ok(receipt.recovery, "at summed attempts 2 the door MINTS (the cap is not yet reached)");
  minted = receipt.recovery.task_id;

  const summed = async () => (await rootQuery(
    "select coalesce(sum(attempt_count),0)::int n from clara.document_processing_tasks where document_id=$1 and lane='ocr'",
    [documentId])).rows[0].n;
  assert.equal(await summed(), 2, "…and the mint itself charges no attempt");

  // First claim: the workflow picks it up. sum -> 3, i.e. AT the door's cap.
  await roleQuery(ROLES.runtime, "select clara.claim_document_processing_task($1,$2,true)", [minted, "x51-reclaim-run-1"]);
  assert.equal(await summed(), 3, "the first claim takes the lane to the cap");

  // The run is lost. The reconciler's pre-existing edge returns the task to 'queued'…
  await roleQuery(ROLES.runtime, "select clara.requeue_stranded_document_task($1,$2)", [minted, opk("x51req")]);
  assert.equal((await taskRow(minted)).status, "queued", "…the stranded task is legally re-queued");

  // …and it can be claimed AGAIN, past the cap, on the same reservation.
  await roleQuery(ROLES.runtime, "select clara.claim_document_processing_task($1,$2,true)", [minted, "x51-reclaim-run-2"]);
  assert.equal(await summed(), 4,
    "THE REGISTERED PROPERTY: summed attempts reach 4 — past the door's cap of 3 — without a "
    + "second mint, because the bound is enforced only where this door acts. Pinned so the "
    + "register entry has a witness and so a future fix has a failing cell to flip");

  // What the door DOES still bound is its own act: no second attempt is ever MINTED.
  const { receipt: again } = await reIngest(firm, null, {});
  assert.equal(again.recovery, undefined, "a fresh document is unaffected; the door mints only what it admits");
  assert.equal((await laneTasks(documentId, "ocr")).length, 3,
    "…and the reclaimed document still holds exactly three tasks: two failures and the one recovery");
});

test("[0051 §2] an IN-FLIGHT task on the lane blocks a mint, by name", async (t) => {
  if (gate(t)) return;
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(firm, async (f, d) => {
    await plantTask(f, d, { version: 1, engine: AZURE_OCR, status: "running" });
    await plantTask(f, d, { version: 2, status: "failed", error: "engine_error" });
  });
  assert.equal(receipt.recovery, undefined, "nothing is minted while the lane is live");
  assert.equal(receipt.recovery_refused?.reason, "lane_busy", "…and the refusal names itself");
  assert.equal((await laneTasks(documentId, "ocr")).length, 2, "…no third row");
});

test("[0051 §2] a failed FACTS extraction on a healthy ingest gets NO ingest recovery — that is §1's verb", async (t) => {
  if (gate(t)) return;
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(firm, async (f, d) => {
    await plantTask(f, d, { status: "done" });
    await plantTask(f, d, { engine: "azure-di:prebuilt-invoice:2024-11-30", lane: "invoice_facts", status: "failed", error: "internal" });
  });
  assert.equal(receipt.recovery, undefined,
    "the intake door never looks at a facts lane — that population is request_reextraction's");
  assert.equal((await laneTasks(documentId, "ocr")).length, 1, "…the ingest lane is untouched");
  assert.equal((await laneTasks(documentId, "invoice_facts")).length, 1, "…and so is the facts lane");
});

test("[0051 §2] the door is gated to the INGEST lanes: a facts lane passed explicitly mints nothing", async (t) => {
  if (gate(t)) return;
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(
    firm,
    (f, d) => plantTask(f, d, { engine: "azure-di:prebuilt-invoice:2024-11-30", lane: "invoice_facts", status: "failed", error: "engine_error" }),
    { lane: "invoice_facts", engine: "azure-di:prebuilt-invoice:2024-11-30" },
  );
  assert.equal(receipt.recovery, undefined, "a facts lane is refused by the door's own gate, however it is reached");
  assert.equal((await laneTasks(documentId, "invoice_facts")).length, 1, "…and no facts task was minted");
});

// ===========================================================================
// THE ADVERSARIAL SHAPES BOTH REVIEWS RAISED
// ===========================================================================

test("[0051 §2] an ENGINE-SNAPSHOT bump does NOT close the door — the recovery mints under the CURRENT engine", async (t) => {
  if (gate(t)) return;
  // The first cut looked for the newest failed task only under THIS call's p_engine_id, so an
  // ingest that failed under snapshot A and a remediation deploy that moved intake to snapshot
  // B silently adopted with no recovery — the exact pre-F6 symptom the door exists to remove.
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(
    firm,
    (f, d) => plantTask(f, d, { engine: AZURE_OCR, status: "failed", error: "engine_error" }),
    { lane: "ocr", engine: FIXTURE_ENGINE }, // the failure was under a DIFFERENT engine
  );
  assert.ok(receipt.recovery, "the door still opens across an engine-snapshot bump");
  assert.equal(receipt.recovery.engine_id, FIXTURE_ENGINE,
    "…and the recovery is minted under the CURRENT engine, so the envelope it writes names the "
    + "engine that actually performs the read");
  const tasks = await laneTasks(documentId, "ocr");
  assert.equal(tasks.length, 2, "one new row");
  assert.equal(tasks.find((x) => x.id === receipt.recovery.task_id).engine_id, FIXTURE_ENGINE, "…on the current engine");
});

test("[0051 §2] a QUEUED newest task ECHOES its transport instead of minting — the crash-window heal", async (t) => {
  if (gate(t)) return;
  // The sidecar the frozen worker needs is written by the runtime AFTER this transaction
  // commits, so a crash in that window leaves a queued task with no transport and no way to
  // rebuild it. Re-uploading the same bytes hands the transport back so the runtime can.
  const firm = W.firms.A;
  let queued = null;
  const { documentId, receipt, reservation } = await reIngest(firm, async (f, d) => {
    await plantTask(f, d, { version: 1, status: "failed", error: "engine_error" });
    queued = await plantTask(f, d, { version: 2, status: "queued" });
  }, { reserve: true });

  assert.ok(receipt.recovery, "a queued newest task still yields a recovery fragment");
  assert.equal(receipt.recovery.mode, "echo", "…in ECHO mode");
  assert.equal(receipt.recovery.task_id, queued, "…naming the EXISTING queued task");
  assert.equal(receipt.recovery.version_n, 2, "…at its own version");
  assert.equal((await laneTasks(documentId, "ocr")).length, 2,
    "…and NOTHING was minted: an echo creates no work, it only re-hands transport");
  assert.equal((await reservationRow(reservation)).state, "refunded",
    "…and it charges nothing, because it bought nothing");
});

test("[0051 §2] concurrent identical re-uploads serialize on the documents lock — exactly one mint", async (t) => {
  if (gate(t)) return;
  // The mint carries no bounded-retry loop, and that is only safe because this transaction
  // already holds clara.documents FOR UPDATE before it reaches the adopted branch. Proven here
  // rather than argued: a holder takes that exact row lock, and the finalize BLOCKS on it
  // (pg_blocking_pids, not timing) before completing once the holder commits.
  const firm = W.firms.A;
  const sha = freshSha();
  const seed = await seedVerifiedDocument({
    firm, sha256: sha, mime: "application/pdf", storagePath: `firms/${firm}/docs/${sha}.pdf` });
  await plantTask(firm, seed.documentId, { status: "failed", error: "engine_error" });
  const dup = await seedIntake({
    firm, uploadedBy: W.users.alice, sha256: sha, status: "verified", mime: "application/pdf",
    storageKey: `firms/${firm}/docs/${sha}.pdf`,
  });

  const out = await holdThenContend({
    a: { run: (c) => c.query("select id from clara.documents where firm_id=$1 and sha256=$2 for update", [firm, sha]) },
    b: {
      role: ROLES.runtime,
      run: async (c) => (await c.query(
        `select clara.finalize_document_intake(p_intake=>$1, p_engine_id=>$2, p_lane=>'ocr',
           p_version_n=>1, p_op_key=>$3) as r`,
        [dup, FIXTURE_ENGINE, opk("x51conc")])).rows[0].r,
    },
  });

  assert.ok(out.a.ok, `the holder took the documents row lock (got ${out.a.code}: ${out.a.message})`);
  assert.equal(out.provedBlocked, true,
    "the finalize BLOCKED on that row — proven via pg_blocking_pids, so the serialization the "
    + "no-retry-loop mint depends on is real and not a hope about timing");
  assert.ok(out.b.ok, `…and completed once the holder committed (got ${out.b.code}: ${out.b.message})`);
  assert.ok(out.b.receipt.recovery, "…minting its recovery");
  assert.equal((await laneTasks(seed.documentId, "ocr")).length, 2, "…exactly one new row, never two");
});

test("[0051 §2] the recovery door opened no new reach — finalize_document_intake stays runtime-only", async (t) => {
  if (gate(t)) return;
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    if (!role) continue;
    const err = await roleQuery(role,
      "select clara.finalize_document_intake($1,null,'clara-fixture:v1','{}'::jsonb,1,'ocr',null,null,$2)",
      [randomUUID(), opk("x51fin")]).then(() => null, (e) => e);
    assert.ok(err, `${role} must not be able to execute finalize_document_intake`);
    assert.equal(err.code, "42501", `${role} is refused at the GRANT, not inside the body`);
  }
  const allow = await rootQuery(
    "select count(*)::int n from clara.wake_fn_allowlist where function_name='finalize_document_intake'");
  assert.equal(allow.rows[0].n, 0, "…and no wake allowlist row admits it for any wake kind");
});
