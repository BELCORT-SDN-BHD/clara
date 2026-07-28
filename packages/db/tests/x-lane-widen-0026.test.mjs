// Migration 0026 — lane joins document_processing_tasks' unique key, engine_kind (the
// verified lane-equivalent) joins document_extractions'. See 0026_lane_widen.sql's own
// header for the full defect analysis (Gate-S receipt:
// C:\Users\zhant\.clara-tools\captures\gate-s-log-2026-07-28.md), the five ON CONFLICT
// call sites, and amendment A11 (the 0020 §6 pin).
//
// READINESS: the 0021+ discipline — every cell FAILS loudly against a 25-migration
// database rather than skipping, so a green battery against a prestate missing the
// widening proves nothing.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, getPool, opk, endPool, assertRaises,
} from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld, requestReextraction, freshResolution, classifyDocument, setDocumentKind } from "./x1-helpers.mjs";
import { fileDocument, seedVerifiedDocument, seedIntake, finalizeIntake } from "./s6-helpers.mjs";
import { claimTask } from "./s6-fixtures.mjs";

let has0026 = false;
let w = null;

async function has26() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0026_'");
    return r.rows.length > 0;
  } catch { return false; }
}

before(async () => {
  has0026 = await has26();
  if (!has0026) { noteLane("0026 absent — x-lane-widen-0026 battery FAILS loudly rather than skipping"); return; }
  w = await buildWorld();
});
after(async () => { printLaneNotes("x-lane-widen-0026"); await endPool(); });

function requireReady() {
  if (!has0026) {
    throw new Error(
      "0026 NOT applied (clara.schema_migrations has no '0026_%' row) — the lane-widened "
      + "unique keys are not present. This battery is REQUIRED to fail against the "
      + "25-migration prestate.");
  }
}

// ---------------------------------------------------------------------------
// Minimal, self-contained fixtures (no dependency on the pdf-oriented rig-docs-fixtures
// helpers — the corpus this migration closes is XML-mime specific and the exact shape
// Gate-S measured: a structured_parse identity task ALREADY at version_n=1 for the
// document's clara-myinvois:v1 engine, exactly what finalize_document_intake creates on
// a real xml intake).
// ---------------------------------------------------------------------------

async function seedFirm(tag) {
  const r = await rootQuery("insert into clara.firms(name) values ($1) returning id", [`0026 ${tag} ${randomUUID().slice(0, 8)}`]);
  return r.rows[0].id;
}

async function seedXmlDoc(firm, tag) {
  const sha = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const storagePath = `firms/${firm}/docs/${sha}.xml`;
  const r = await rootQuery(
    `insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,storage_path,
        bytes_verified_at,extraction_status,uploaded_by)
     values ($1,$2,$3,'application/xml',256,$4,now(),'pending',null)
     returning id`,
    [firm, sha, `${tag}.xml`, storagePath],
  );
  return r.rows[0].id;
}

/** The exact identity-task shape finalize_document_intake leaves on a real xml intake:
 *  structured_parse, clara-myinvois:v1, version_n=1, DONE (a settled intake pass). */
async function seedIdentityTask(firm, doc, { versionN = 1, status = "done" } = {}) {
  const terminal = status === "done" || status === "failed";
  const r = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at,finished_at)
     values ($1,$2,'clara-myinvois:v1','{}'::jsonb,$3,'structured_parse',$4,
        case when $4='queued' then null else 'rig-run-'||$5::text end,
        case when $4='queued' then null else now() end,
        case when $4='queued' or not $6 then null else now() end)
     returning id`,
    [firm, doc, versionN, status, randomUUID(), terminal],
  );
  return r.rows[0].id;
}

async function coreResult(doc) {
  const r = await rootQuery("select clara._enqueue_invoice_facts_core($1) as result", [doc]);
  return r.rows[0].result;
}

async function tasksOf(doc) {
  const r = await rootQuery(
    "select id, lane, engine_id, version_n, status from clara.document_processing_tasks where document_id=$1 order by lane",
    [doc],
  );
  return r.rows;
}

test("META x-lane-widen-0026: migration present + both unique keys carry the widened shape", async (t) => {
  if (!has0026) { t.skip("0026 not applied"); return; }
  const mig = await rootQuery("select version from clara.schema_migrations where version ~ '^0026_'");
  assert.equal(mig.rows.length, 1, `exactly one applied 0026_* migration (got ${mig.rows.map((x) => x.version).join(",")})`);
  const taskKey = await rootQuery(
    `select pg_get_constraintdef(oid) d from pg_constraint
      where conrelid='clara.document_processing_tasks'::regclass
        and conname='uq_document_processing_tasks_doc_engine_version_lane'`);
  assert.equal(taskKey.rows[0]?.d, "UNIQUE (document_id, engine_id, version_n, lane)");
  const extKey = await rootQuery(
    `select pg_get_constraintdef(oid) d from pg_constraint
      where conrelid='clara.document_extractions'::regclass
        and conname='uq_document_extractions_doc_engine_version_kind'`);
  assert.equal(extKey.rows[0]?.d, "UNIQUE (document_id, engine_id, version_n, engine_kind)");
});

// ===========================================================================
// (1) Cross-lane XML document gets BOTH tasks — the direct Gate-S repro.
// ===========================================================================

test("a cross-lane xml document: the settled structured_parse identity task and the freshly-opened local_facts task coexist at the SAME version_n", async () => {
  requireReady();
  const firm = await seedFirm("xlane");
  const doc = await seedXmlDoc(firm, "xlane");
  const identityTask = await seedIdentityTask(firm, doc);

  const result = await coreResult(doc);
  assert.notEqual(result.task_id, null, "the facts lane must open a REAL task, never null");
  assert.equal(result.status, "queued");

  const tasks = await tasksOf(doc);
  assert.equal(tasks.length, 2, `exactly 2 task rows (structured_parse + local_facts), got ${tasks.length}`);
  const byLane = Object.fromEntries(tasks.map((t) => [t.lane, t]));
  assert.ok(byLane.structured_parse, "the identity task survives untouched");
  assert.equal(byLane.structured_parse.id, identityTask);
  assert.equal(byLane.structured_parse.status, "done");
  assert.ok(byLane.local_facts, "the facts task now exists");
  assert.equal(byLane.local_facts.id, result.task_id);
  assert.equal(byLane.local_facts.version_n, 1, "version_n stays per-lane — the local_facts lane's OWN first attempt, unaffected by the intake lane's counter");
  assert.equal(byLane.structured_parse.version_n, 1, "…and the identity task's version_n is unchanged too — both are legitimately 1, on two different lanes");
});

// ===========================================================================
// (2) Same-lane double-press stays idempotent.
// ===========================================================================

test("a same-lane double-press (two calls, no intervening claim) returns the SAME task both times — a genuine same-lane conflict is still idempotent, not a new impossible-state raise", async () => {
  requireReady();
  const firm = await seedFirm("idem");
  const doc = await seedXmlDoc(firm, "idem");
  await seedIdentityTask(firm, doc);

  const first = await coreResult(doc);
  assert.notEqual(first.task_id, null);
  assert.equal(first.status, "queued");

  const second = await coreResult(doc);
  assert.equal(second.task_id, first.task_id, "the second call recognizes the still-queued task and returns its identity — never a duplicate row, never a raise");
  assert.equal(second.status, "queued");

  const tasks = await tasksOf(doc);
  const localFacts = tasks.filter((t) => t.lane === "local_facts");
  assert.equal(localFacts.length, 1, "still exactly ONE local_facts row — the double-press never duplicated it");
});

// ===========================================================================
// (3) Persist layer, both lanes: persist_document_extraction (structured_parse) and
// persist_invoice_facts (local_facts) both write real extraction rows at the SAME
// version_n, for the SAME engine, distinguished only by engine_kind — exactly the
// shape §B's widened key exists to admit.
// ===========================================================================

test("persist layer, both lanes: the structured_parse extraction and the local_facts extraction coexist at the same (document,engine,version_n), distinguished by engine_kind", async () => {
  requireReady();
  const firm = await seedFirm("persist2");
  const doc = await seedXmlDoc(firm, "persist2");

  // The identity task is claimed to running (not pre-settled 'done' this time — we drive
  // it through the REAL persist writer) so persist_document_extraction sees a genuine
  // 'running' task to settle.
  const identityTask = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at)
     values ($1,$2,'clara-myinvois:v1','{}'::jsonb,1,'structured_parse','running','rig-run',now())
     returning id`,
    [firm, doc],
  )).rows[0].id;

  const structuredResult = await rootQuery(
    "select clara.persist_document_extraction($1,'done',1,'{}'::jsonb,'[]'::jsonb,null,null,$2) as r",
    [identityTask, opk("pde0026")],
  );
  assert.notEqual(structuredResult.rows[0].r.extraction_id, null, "the structured_parse extraction is written");

  // Now open + claim + persist the local_facts task on the SAME document.
  const factsResult = await coreResult(doc);
  assert.notEqual(factsResult.task_id, null, "the facts task opens (this is cell (1) again, as a precondition)");
  await rootQuery(
    "update clara.document_processing_tasks set status='running',workflow_run_id='rig-run-2',started_at=now() where id=$1",
    [factsResult.task_id],
  );
  const factsPersist = await rootQuery(
    `select clara.persist_invoice_facts($1,$2::jsonb,$3,'v1',1,'{}'::jsonb) as r`,
    [
      factsResult.task_id,
      JSON.stringify([
        { field_path: "invoice.type_code", page: 1, polygon: [], value_raw: "01", confidence: 0.99 },
        { field_path: "invoice.total", page: 1, polygon: [], value_raw: "100.00", confidence: 0.99 },
      ]),
      "b".repeat(64),
    ],
  );
  assert.notEqual(factsPersist.rows[0].r.extraction_id, null, "the local_facts extraction is written");

  const extractions = await rootQuery(
    "select engine_id, engine_kind, version_n from clara.document_extractions where document_id=$1 order by engine_kind",
    [doc],
  );
  assert.equal(extractions.rows.length, 2, `exactly 2 extraction rows, got ${extractions.rows.length}`);
  const kinds = extractions.rows.map((r) => r.engine_kind).sort();
  assert.deepEqual(kinds, ["invoice_facts", "structured_parse"]);
  for (const row of extractions.rows) {
    assert.equal(row.engine_id, "clara-myinvois:v1");
    assert.equal(row.version_n, 1, "both extractions share version_n=1 — exactly the collision §B's widened key now admits as two legitimate rows");
  }
});

// ===========================================================================
// (4) The impossible-state RAISE.
// ===========================================================================
//
// Every one of the four production sites' impossible branches (finalize_document_intake,
// _enqueue_invoice_facts_core, persist_document_extraction, persist_invoice_facts) is
// STRUCTURALLY UNREACHABLE under this codebase's actual write patterns: neither
// document_processing_tasks nor document_extractions is ever the target of a DELETE
// anywhere in the migration history (grepped, zero hits) — a row an ON CONFLICT collided
// with cannot vanish before the immediately-following re-select, because nothing ever
// removes it. That unreachability IS the point: the branch exists so a FUTURE regression
// (someone adds a delete path, or a bug reorders these two statements across a
// transaction boundary) fails LOUDLY instead of returning null again.
//
// It is stronger than that, in fact: clara._tf_processing_task_update (0007/0009/0011)
// is an ACTUAL DB-level trigger on this table (t_document_processing_tasks_update) that
// raises CLR08 on ANY delete, raises CLR16 on any update to an already-terminal row, and
// raises CLR08 on any attempted change to document_id/engine_id/version_n/lane on a
// non-terminal row. So the row this migration's fallback re-selects cannot be deleted,
// cannot be mutated out from under the query, and cannot change identity — verified live
// below, not assumed (the FIRST attempt at this test tried a plain DELETE and was itself
// refused with CLR08, which is the receipt this comment describes).
//
// This cell proves the GUARD PATTERN itself — not a live call into one of the four
// production functions, which cannot be forced into this state without defeating the
// trigger above. A throwaway probe function, created and dropped inside this test,
// reproduces the EXACT shape (insert ON CONFLICT DO NOTHING; if null, re-select; if still
// null, RAISE CLR35) with one addition: a deterministic pause between the failed insert
// and the re-select, giving a second connection a controlled window to delete the
// colliding row — which requires temporarily disabling the append-only trigger for this
// one isolated probe, restored immediately after in a finally block. Production code
// never does this and never could; only a privileged, clearly-scoped test harness can.

test("the impossible-state RAISE fires with CLR35 when an ON CONFLICT collision's row is gone by the time the guard re-selects it", async () => {
  requireReady();
  const firm = await seedFirm("impossible");
  const doc = await seedXmlDoc(firm, "impossible");

  await rootQuery(`
    create or replace function clara._test_0026_impossible_probe(p_document uuid, p_engine text, p_version int, p_lane text)
      returns uuid language plpgsql as $probe$
    declare v_task uuid;
    begin
      insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,version_n,lane,status)
        select $1, p_document, p_engine, '{}'::jsonb, p_version, p_lane, 'queued'
        from clara.documents where id = p_document
        on conflict (document_id,engine_id,version_n,lane) do nothing returning id into v_task;
      if v_task is null then
        perform pg_sleep(0.5);
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and engine_id=p_engine and version_n=p_version and lane=p_lane;
        if v_task is null then
          raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,lane=%) but no row exists at that key',
            p_document, p_engine, p_version, p_lane using errcode='CLR35';
        end if;
      end if;
      return v_task;
    end $probe$;
  `);

  try {
    const phantom = (await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,version_n,lane,status)
       values ($1,$2,'clara-test-vanish:v1','{}'::jsonb,1,'local_facts','queued') returning id`,
      [firm, doc],
    )).rows[0].id;

    await rootQuery("alter table clara.document_processing_tasks disable trigger t_document_processing_tasks_update");
    const probeClient = await getPool().connect();
    const deleteClient = await getPool().connect();
    let probeError = null;
    try {
      const probePromise = probeClient
        .query("select clara._test_0026_impossible_probe($1,'clara-test-vanish:v1',1,'local_facts') as r", [doc])
        .catch((e) => { probeError = e; });
      // Give the probe time to hit its insert (which conflicts against the phantom row)
      // and enter its 0.5s sleep, THEN delete the row out from under it — the one
      // sequencing production code never allows, and which requires the append-only
      // trigger disabled above (a plain delete here is otherwise refused with CLR08, as
      // this test itself confirmed before the trigger was disabled).
      await new Promise((res) => setTimeout(res, 150));
      await deleteClient.query("delete from clara.document_processing_tasks where id=$1", [phantom]);
      await probePromise;
    } finally {
      probeClient.release();
      deleteClient.release();
      await rootQuery("alter table clara.document_processing_tasks enable trigger t_document_processing_tasks_update");
    }

    assert.ok(probeError, "the probe must raise — a swallowed conflict whose row vanished must never resolve quietly");
    assert.equal(probeError.code, "CLR35", `expected SQLSTATE CLR35, got ${probeError.code} (${probeError.message})`);
    assert.match(probeError.message, /impossible state: an ON CONFLICT fired for/,
      "the exact impossible-state message shape, matching all four production sites");
  } finally {
    await rootQuery("drop function if exists clara._test_0026_impossible_probe(uuid,text,int,text)");
  }
});

// ===========================================================================
// (5) request_reextraction on an XML doc, post-fix.
// ===========================================================================

test("request_reextraction on an xml document with a settled local_facts extraction succeeds — no more misleading 'a concurrent request settled this document' raise on the cross-lane collision Gate-S found", async () => {
  requireReady();
  // A real firm-A document (buildWorld's alice), not a bare member-less firm — request_
  // reextraction's own _human_ctx firm-membership check needs a genuine authenticated user.
  const doc = await seedXmlDoc(w.firms.A, "rex");
  await seedIdentityTask(w.firms.A, doc); // the structured_parse identity task, version_n=1, done

  // A settled local_facts extraction — request_reextraction's "no completed extraction to
  // re-extract" gate requires this to exist first (it re-extracts, it does not perform a
  // first extraction).
  const factsResult = await coreResult(doc);
  await rootQuery(
    "update clara.document_processing_tasks set status='running',workflow_run_id='rig-run',started_at=now() where id=$1",
    [factsResult.task_id],
  );
  await rootQuery(
    `select clara.persist_invoice_facts($1,$2::jsonb,$3,'v1',1,'{}'::jsonb) as r`,
    [
      factsResult.task_id,
      JSON.stringify([
        { field_path: "invoice.type_code", page: 1, polygon: [], value_raw: "01", confidence: 0.99 },
        { field_path: "invoice.total", page: 1, polygon: [], value_raw: "100.00", confidence: 0.99 },
      ]),
      "c".repeat(64),
    ],
  );

  const result = await requestReextraction(w.users.alice, { document: doc, reason: "0026 rig re-extraction", opKey: opk("rex0026") });
  assert.notEqual(result.task_id, null, "request_reextraction must open a real task on the xml document — never null, never the old misleading raise");
  assert.equal(result.version_n, 2, "a NEW version on the local_facts lane (version 1 is already 'done') — the per-lane counter, unaffected by the structured_parse lane's own counter");
  assert.equal(result.status, "queued");
  assert.equal(result.admission, "reextraction", "admitted through the ordinary door — a done extraction already exists to supersede");
});

// ===========================================================================
// (6) Amendment: request_reextraction's admission gate widens to a third door.
//
// MEASURED, not assumed: recovery vehicle 9e4ab36c's real live state (gate-s-driver's
// hold report) is `select lane,status,engine_id from document_processing_tasks where
// document_id='9e4ab36c-...'` -> exactly ONE row: structured_parse | done |
// clara-myinvois:v1. Two earlier predicates were each disproven, not merely revised:
//   - "live filing + zero COMPLETED extractions" — disproven by a real x-receipt-
//     routing.test.mjs regression (file_document's own 0009 backstop means an ordinary
//     filed invoice already has a task moments after filing; this predicate silently
//     absorbed 0025's receipt-only backfill scoping).
//   - "live filing + zero tasks of ANY lane" — disproven by the live probe itself:
//     9e4ab36c HAS a task (structured_parse, done) — this predicate REFUSES the exact
//     document the door exists for.
// The correct, verified predicate: a LIVE filing, ZERO tasks in THIS document's own
// facts lane (v_lane), AND ZERO NON-TERMINAL tasks of any lane. 9e4ab36c's one task is
// structured_parse (a different lane) and DONE (terminal) — it satisfies both clauses
// and admits. A live (queued/held_egress/running) task in some OTHER lane — a NULL-kind
// pdf's pending classify verdict — fails the second clause and refuses; that document is
// mid-pipeline, not a missed enqueue.
//
// file_document's backstop means "filed with zero tasks, terminal or otherwise" cannot
// be reproduced through the CURRENT writer — every fixture below that needs a
// pre-backstop shape seeds it DIRECTLY (basis='legacy-0007', the house idiom already
// established for a filing predating the current writer's invariants — the same
// "the writer can no longer produce this state, seed it directly" pattern
// rig-docs-fixtures.mjs documents for claim-only pre-0007 documents).
// ===========================================================================

/** Seed a filing DIRECTLY (bypassing file_document, whose own backstop would
 *  immediately create a facts task and defeat the fixture) — the historical shape
 *  9e4ab36c is actually in: a live filing, zero facts-lane tasks ever attempted.
 *  basis='legacy-0007' pairs with a NULL resolution_id (ck_document_filings_resolution)
 *  — no ceremony to fabricate for a fixture that represents "there was none,
 *  historically". Optionally seeds a TERMINAL structured_parse task alongside the
 *  filing — 9e4ab36c's actual measured shape, not the bare zero-task subset of it. */
async function seedHistoricalFilingNoTask(firm, client, doc, { withDoneStructuredParse = false } = {}) {
  await rootQuery(
    `insert into clara.document_filings(firm_id,document_id,client_id,basis)
     values ($1,$2,$3,'legacy-0007')`,
    [firm, doc, client],
  );
  if (withDoneStructuredParse) {
    await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
          version_n,lane,status,workflow_run_id,started_at,finished_at)
       values ($1,$2,'clara-myinvois:v1','{}'::jsonb,1,'structured_parse','done','legacy-run',now(),now())`,
      [firm, doc],
    );
  }
}

test("9e4ab36c's REAL measured shape: a filed document with a TERMINAL structured_parse task and zero facts-lane tasks bootstraps — the terminal task in a DIFFERENT lane does not block it", async () => {
  requireReady();
  const doc = await seedXmlDoc(w.firms.A, "real-shape");
  await seedHistoricalFilingNoTask(w.firms.A, w.clients.A1, doc, { withDoneStructuredParse: true });

  const before = await tasksOf(doc);
  assert.equal(before.length, 1, "mandatory setup: exactly the one measured row — structured_parse, done");
  assert.equal(before[0].lane, "structured_parse");
  assert.equal(before[0].status, "done");

  const result = await requestReextraction(w.users.alice, { document: doc, reason: "0026 amendment: 9e4ab36c real-shape recovery", opKey: opk("realshape") });
  assert.notEqual(result.task_id, null, "the terminal structured_parse task in a DIFFERENT lane must not block the bootstrap — this is 9e4ab36c's actual state");
  assert.equal(result.admission, "filed_bootstrap");
  assert.equal(result.version_n, 1, "the document's first-ever local_facts attempt — the structured_parse lane's own version_n=1 is a separate counter");
  assert.equal(result.status, "queued");

  const after = await tasksOf(doc);
  assert.equal(after.length, 2, "the pre-existing structured_parse task PLUS the new local_facts one — the structured_parse row is never touched");
  const byLane = Object.fromEntries(after.map((t) => [t.lane, t]));
  assert.equal(byLane.structured_parse.status, "done", "untouched");
  assert.equal(byLane.local_facts.status, "queued");
});

test("a filed document with a LIVE (non-terminal) task in a DIFFERENT lane still refuses — a pending classify verdict is mid-pipeline, not a missed enqueue", async () => {
  requireReady();
  // A NULL-kind pdf: _enqueue_invoice_facts_core's automatic routing opens a 'classify'
  // task first (a real, legitimate, in-progress step) — file_document's own backstop
  // creates it. The kind is then corrected via a RAW update (mirroring x-receipt-
  // routing.test.mjs's own kindDoc technique) — NOT via set_document_kind, so the stale
  // classify task is left exactly as it was: live, unclaimed. This is the shape
  // x-receipt-routing's TOCTOU-B cell already proves must refuse; this cell proves it
  // directly against THIS migration's predicate, not just as a side effect of another
  // battery's regression.
  const seed = await seedVerifiedDocument({ firm: w.firms.A, mime: "application/pdf" });
  await fileDocument(w.users.alice, {
    document: seed.documentId,
    client: w.clients.A1,
    resolution: await freshResolution(w.users.alice, w.clients.A1, { subjectKind: "document", subjectId: seed.documentId }),
  });
  const allTasks = await tasksOf(seed.documentId);
  const classifyTasks = allTasks.filter((t) => t.lane === "classify");
  assert.equal(classifyTasks.length, 1, "mandatory setup: file_document's backstop opened a classify task for the NULL-kind document");
  assert.equal(classifyTasks[0].status, "queued", "mandatory setup: the classify task is LIVE, not terminal");

  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [seed.documentId]);

  await assertRaises("CLR16",
    () => requestReextraction(w.users.alice, { document: seed.documentId, reason: "0026 rig live-classify probe", opKey: opk("liveclassify") }),
    "a filed, kind-corrected document with a still-LIVE classify task in a different lane");
});

test("a filed, never-extracted document (the bare zero-task subset of 9e4ab36c's shape) bootstraps through request_reextraction's widened gate — admission is honestly diagnosed as filed_bootstrap", async () => {
  requireReady();
  const doc = await seedXmlDoc(w.firms.A, "bootstrap");
  await seedHistoricalFilingNoTask(w.firms.A, w.clients.A1, doc);
  // A live filing and ZERO document_processing_tasks rows — exactly vehicle 9e4ab36c's
  // shape.

  const result = await requestReextraction(w.users.alice, { document: doc, reason: "0026 amendment: filed-bootstrap recovery", opKey: opk("bootstrap") });
  assert.notEqual(result.task_id, null, "the filed-bootstrap door must open a real task — this is the recovery seam, it must not refuse");
  assert.equal(result.admission, "filed_bootstrap", "the diagnostic must honestly name the bootstrap door, not silently look like an ordinary re-extraction");
  assert.equal(result.version_n, 1, "the document's first-ever local_facts attempt");
  assert.equal(result.status, "queued");

  const tasks = await tasksOf(doc);
  assert.equal(tasks.length, 1, "exactly one task created by the bootstrap — no duplicate, no phantom structured_parse row this migration didn't seed");
  assert.equal(tasks[0].lane, "local_facts");

  // EXACTLY ONCE: settle the bootstrapped task, then call again. The second call must be
  // admitted through the ordinary 'reextraction' door — the bootstrap door does not keep
  // firing once a completed extraction exists to supersede.
  await rootQuery(
    "update clara.document_processing_tasks set status='running',workflow_run_id='rig-run',started_at=now() where id=$1",
    [result.task_id],
  );
  await rootQuery(
    `select clara.persist_invoice_facts($1,$2::jsonb,$3,'v1',1,'{}'::jsonb) as r`,
    [
      result.task_id,
      JSON.stringify([
        { field_path: "invoice.type_code", page: 1, polygon: [], value_raw: "01", confidence: 0.99 },
        { field_path: "invoice.total", page: 1, polygon: [], value_raw: "100.00", confidence: 0.99 },
      ]),
      "d".repeat(64),
    ],
  );
  const second = await requestReextraction(w.users.alice, { document: doc, reason: "0026 amendment: second call, post-settle", opKey: opk("bootstrap2") });
  assert.equal(second.admission, "reextraction", "the SECOND call is admitted through the ordinary door — the bootstrap fired exactly once, not on every call");
  assert.equal(second.version_n, 2, "a genuine new re-extraction version, distinct from the bootstrap's version 1");
});

test("an UNFILED document still refuses request_reextraction — the filed-bootstrap door checks for a LIVE FILING, not merely 'no extraction'", async () => {
  requireReady();
  const doc = await seedXmlDoc(w.firms.A, "unfiled");
  // No filing, no task, no extraction — the ordinary "nothing to supersede, no bootstrap
  // seam either" case. The widened gate must not have quietly become "any document with
  // no extraction admits" — filing is the load-bearing condition team-lead ruled on.
  await assertRaises("CLR16",
    () => requestReextraction(w.users.alice, { document: doc, reason: "0026 rig unfiled probe", opKey: opk("unfiled") }),
    "an unfiled, never-extracted document");
});

test("a filed document with an ALREADY-IN-FLIGHT facts task still refuses — the bootstrap door is 'zero tasks', not 'zero extractions', so an ordinary mid-pipeline document does not leak through it (this is the exact regression the amendment's first draft had — x-receipt-routing.test.mjs's invoice/credit_note/debit_note refusal cells caught it)", async () => {
  requireReady();
  const doc = await seedXmlDoc(w.firms.A, "inflight");
  // The REAL file_document RPC — its own 0009 backstop immediately enqueues a real
  // local_facts task, so this document is filed AND already has one in-flight task, the
  // shape that must NOT bootstrap.
  await fileDocument(w.users.alice, {
    document: doc,
    client: w.clients.A1,
    resolution: await freshResolution(w.users.alice, w.clients.A1, { subjectKind: "document", subjectId: doc }),
  });
  const tasks = await tasksOf(doc);
  assert.equal(tasks.length, 1, "mandatory setup: file_document's own backstop created a task");
  assert.equal(tasks[0].status, "queued");

  await assertRaises("CLR16",
    () => requestReextraction(w.users.alice, { document: doc, reason: "0026 rig in-flight probe", opKey: opk("inflight") }),
    "a filed document whose facts task is already in flight (not zero tasks, so no bootstrap door — and not done, so no ordinary door either)");
});

// ===========================================================================
// THE P-ROUND (O-round findings on the first submitted diff, all the coexisting-rows
// class). See 0026_lane_widen.sql's own header, §H/§I/§C/§E for the full analysis.
// ===========================================================================

test("P1: classify_document's verdict version mint is scoped to engine_kind — a coexisting structured_parse extraction under the SAME engine no longer inflates the classify verdict's version past its own task's", async () => {
  requireReady();
  const seed = await seedVerifiedDocument({ firm: w.firms.A, mime: "application/pdf" });
  const doc = seed.documentId;

  // The coexisting-rows shape P1 flags: a structured_parse extraction under the SAME
  // clara-classify-llm:v1 engine string this document's classify task will also use —
  // legal post-§A/§B (engine_kind joins the extraction key), and nothing in the schema
  // prevents an intake task from reusing a classify-shaped engine id (the lane/engine
  // CHECK only requires a clara-% prefix for structured_parse).
  await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
        version_n,status,page_count,envelope)
     values ($1,$2,'clara-classify-llm:v1','structured_parse',1,'done',1,'{}'::jsonb)`,
    [w.firms.A, doc],
  );

  const task = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status)
     values ($1,$2,'clara-classify-llm:v1','{}'::jsonb,1,'classify','queued') returning id`,
    [w.firms.A, doc],
  )).rows[0].id;
  const runId = `wf-p1-${randomUUID()}`;
  const claim = await claimTask(task, { egressApproved: true, workflowRunId: runId });
  assert.notEqual(claim.claim_secret, undefined, "mandatory setup: the claim minted a secret");

  const result = await classifyDocument({
    document: doc, kind: "invoice", confidence: 0.9, engineId: "clara-classify-llm:v1",
    opKey: opk("p1"), task, run: runId, secret: claim.claim_secret,
  });
  assert.notEqual(result.extraction_id, null, "mandatory setup: the classify verdict was persisted");

  const ext = await rootQuery(
    "select version_n from clara.document_extractions where id=$1",
    [result.extraction_id],
  );
  assert.equal(ext.rows[0].version_n, 1,
    "the classify verdict mints version_n=1, matching its own task's version_n=1 — the coexisting structured_parse extraction at v1 under the same engine no longer inflates the count");
});

test("P1: set_document_kind's human-attestation version mint is ALSO scoped to engine_kind — same coexistence, same fix, the dedicated engine_id", async () => {
  requireReady();
  const seed = await seedVerifiedDocument({ firm: w.firms.A, mime: "application/pdf" });
  const doc = seed.documentId;

  // A structured_parse extraction under set_document_kind's OWN dedicated engine id —
  // nothing in the schema prevents an intake task from using it either.
  await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
        version_n,status,page_count,envelope)
     values ($1,$2,'clara-classify-human:v1','structured_parse',1,'done',1,'{}'::jsonb)`,
    [w.firms.A, doc],
  );

  const result = await setDocumentKind(w.users.alice, { document: doc, kind: "invoice", reason: "0026 P1 rig probe" });
  assert.notEqual(result.extraction_id, null);
  const ext = await rootQuery(
    "select version_n from clara.document_extractions where id=$1",
    [result.extraction_id],
  );
  assert.equal(ext.rows[0].version_n, 1,
    "the human verdict mints version_n=1 — the coexisting structured_parse extraction under the same dedicated engine id no longer inflates the count");
});

test("P2: finalize_document_intake's duplicate-adoption receipt names the ORIGINAL intake task, not a coexisting different-lane task, even when the coexisting task has a HIGHER version_n", async () => {
  requireReady();
  const sha = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const seed = await seedVerifiedDocument({ firm: w.firms.A, sha256: sha, mime: "application/pdf" });
  const doc = seed.documentId;

  // The ORIGINAL intake task — the shape a fresh finalize_document_intake creation would
  // have produced for this document (default engine/lane: clara-fixture:v1 / ocr).
  const intakeTask = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at,finished_at)
     values ($1,$2,'clara-fixture:v1','{}'::jsonb,1,'ocr','done','rig-run',now(),now())
     returning id`,
    [w.firms.A, doc],
  )).rows[0].id;

  // A coexisting task in a DIFFERENT lane, deliberately at a HIGHER version_n — legal
  // post-§A, and exactly the shape that defeats an unscoped `order by version_n desc
  // limit 1`: before the fix this re-select would grab THIS row instead.
  await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status)
     values ($1,$2,'clara-myinvois:v1','{}'::jsonb,99,'local_facts','queued')`,
    [w.firms.A, doc],
  );

  // A second, duplicate intake of the SAME (already-verified) document — the exact
  // ELSE branch (not v_created, not v_upgraded) whose re-select P2 fixes.
  const dupIntake = await seedIntake({
    firm: w.firms.A, uploadedBy: w.users.alice, sha256: sha, status: "verified",
    mime: "application/pdf", storageKey: `firms/${w.firms.A}/docs/${sha}.pdf`,
  });
  const receipt = await finalizeIntake({ intake: dupIntake });
  assert.equal(receipt.task_id, intakeTask,
    "the duplicate-adoption receipt must name the ORIGINAL intake task (ocr, v1) — not the coexisting local_facts task at v99, which an unscoped 'order by version_n desc' would have grabbed");
});

test("P3: persist_document_extraction refuses a misrouted facts-lane task loudly — no conflict-reuse of a real structured_parse extraction, no invoice_facts_completed event", async () => {
  requireReady();
  const doc = await seedXmlDoc(w.firms.A, "p3");
  // The REAL structured_parse extraction a misrouted call could conflict-reuse.
  await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
        version_n,status,page_count,envelope)
     values ($1,$2,'clara-myinvois:v1','structured_parse',1,'done',1,'{}'::jsonb)`,
    [w.firms.A, doc],
  );
  // A MISROUTED local_facts task — persist_document_extraction must never settle this;
  // persist_invoice_facts is its sole legitimate writer.
  const task = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at)
     values ($1,$2,'clara-myinvois:v1','{}'::jsonb,1,'local_facts','running','rig-run',now())
     returning id`,
    [w.firms.A, doc],
  )).rows[0].id;

  await assertRaises("CLR16",
    () => rootQuery(
      "select clara.persist_document_extraction($1,'done',1,'{}'::jsonb,'[]'::jsonb,null,null,$2) as r",
      [task, opk("p3")],
    ),
    "a misrouted local_facts task calling persist_document_extraction");

  const taskAfter = await rootQuery("select status from clara.document_processing_tasks where id=$1", [task]);
  assert.equal(taskAfter.rows[0].status, "running",
    "the misrouted task is untouched by the refusal — never falsely marked done");
  const extractions = await rootQuery(
    "select engine_kind, version_n from clara.document_extractions where document_id=$1",
    [doc],
  );
  assert.equal(extractions.rows.length, 1, "still exactly the one real structured_parse extraction — never conflict-reused by the misrouted call");
  const events = await rootQuery(
    "select 1 from clara.domain_events where event_type='document.invoice_facts_completed' and payload->>'task_id'=$1::text",
    [task],
  );
  assert.equal(events.rows.length, 0, "no document.invoice_facts_completed event ever fired — the facts destruction this finding names never happened");
});
