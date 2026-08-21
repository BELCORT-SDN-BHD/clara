// F-A1 (Wave-F Track A) PR-4 — THE STATEMENT WITNESS CUTOVER battery, PART 3: THE WITNESS ARM'S
// OWN PROVENANCE GATES (cells k-m). Parts 1-2 (f-a1-statements.test.mjs / -2.test.mjs) prove the
// INHERITED ladder — the controls the splice carries verbatim from `clara._persist_statement_core`.
// This file proves the only NEW judgement logic the splice introduces, which the first cut of the
// battery could not reach at all: every payload there is built by `witnessReaders(engineId, …)`
// from `statementWitnessTask`'s own stamp, so all three ids agree BY CONSTRUCTION and neither
// refusal branch could ever fire. A guard no cell can reach is a guard nobody has tested.
//
// THE FOUR GATES, in the order the witness arm walks them:
//   (1) the task must carry an engine_id at all;
//   (2) that stamp must be an `llm-%` one — a WITNESS engine, not the legacy Azure one that
//       lane `statement_facts` still admits by design;
//   (3) reader2 must NAME its own engine_id in the payload — tested on the RAW value, because
//       0038's carried `v_e2 := coalesce(nullif(btrim(…)), p_task_engine_id)` turns silence
//       into the task stamp before gate (4) ever sees it;
//   (4) both channels must equal the task's stamp.
// Each is asserted by its OWN message text, never by SQLSTATE + `{"reason":"internal"}` alone —
// all four share that pair, so a cell that stopped at the code would pass against the wrong
// refusal (review law 3: spelling is not identity — here, the CODE is the projection).
//
// NOT contract-blind: these cells are written against this PR's own migration, because a
// refusal's identity IS its message and there is nothing else to read it from. Parts 1-2 keep
// the contract-blind reading. Same fixtures, same readiness law (FAIL loud, never skip).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { firmOf, assertRaisesReason } from "./s6-helpers.mjs";
import { printLaneNotes } from "./rig-runtime-helpers.mjs";
import {
  f_a1sReady, registerAccount, ymBounds, witnessChain, stmtHeader, witnessReaders,
  witnessReadersPerChannel, reader1OnlyPayload, filedStatementDoc, statementWitnessTask,
  taskOnLane, coreV2Direct, persistV2,
} from "./f-a1-statements-fixtures.mjs";

const CLR10 = "CLR10";
const CLR16 = "CLR16";
/** The legacy statement engine literal, verbatim (0038:6231-6238). Since the F-A2 Window-B
 *  activation the router no longer MINTS it — this is what a PRE-WINDOW `statement_facts` task
 *  carries, which is the whole point of gate (2): section 2 of the 0098 migration keeps
 *  `azure-%` admissible on this lane forever, so that backlog stays storable and refusable. */
const AZURE_STATEMENT_ENGINE = "azure-di:prebuilt-bankStatement.us:2024-11-30";

/** What the router stamps on this lane AFTER the F-A2 Window-B activation. Held as its own
 *  constant so the cell below reads the router's stamp POSITIVELY rather than only asserting
 *  the absence of the legacy one. */
const WITNESS_STATEMENT_ENGINE = "llm-openai:gpt-5.6-terra:stmt-witness-v1";

let world = null;
let ready = false;

function mustBeReady() {
  assert.ok(ready, "clara.persist_statement_facts_v2(uuid,jsonb) is not applied on this database (0098_f_a1_statements.sql is not in the chain) — this battery must FAIL, not skip, against a pre-cutover chain");
}

before(async () => {
  ready = await f_a1sReady();
  if (!ready) return;
  world = await buildWorld();
});
after(async () => {
  printLaneNotes("f-a1-statements-3");
  await endPool();
});

test("META: clara.persist_statement_facts_v2 is applied (part 3)", () => { mustBeReady(); });

/** assertRaisesReason PLUS the refusal's own message. The four provenance gates all raise
 *  CLR10 with `{"reason":"internal"}`, so the code+reason pair identifies the FAMILY, never the
 *  gate — pinning the message is what makes the cell name true. */
async function assertNamedRefusal(reason, fragment, fn, label) {
  const err = await assertRaisesReason(CLR10, reason, fn, label);
  assert.ok(String(err.message).includes(fragment),
    `${label}: expected the refusal message to contain "${fragment}" but got "${err.message}"`);
  return err;
}

/** Nothing landed for this document: no extraction row on either witness kind, no statement.
 *  The witness arm sits at step 11, AFTER the whole corroboration ladder and the account bind,
 *  so a gate that raised there must leave the document exactly as it found it. */
async function assertNothingPersisted(documentId, label) {
  const ext = (await rootQuery(
    "select count(*)::int as n from clara.document_extractions where document_id=$1", [documentId])).rows[0].n;
  assert.equal(ext, 0, `${label}: no document_extractions row may survive the refusal (found ${ext})`);
  const stmt = (await rootQuery(
    "select count(*)::int as n from clara.bank_statements where document_id=$1", [documentId])).rows[0].n;
  assert.equal(stmt, 0, `${label}: no bank_statements row may survive the refusal (found ${stmt})`);
}

/** A registered account + a fresh filed bank_statement document + an agreeing chain/header, i.e.
 *  everything the ladder needs to reach step 11 — so whatever refuses in these cells refuses on
 *  PROVENANCE and not on some earlier control. */
async function provenanceSetup(month = 4) {
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);
  const acct = await registerAccount(sub, client);
  const { periodStart, periodEnd } = ymBounds(2026, month);
  const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
  const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
  const doc = await filedStatementDoc(sub, client);
  return { sub, client, firm, acct, ch, h, doc };
}

const lines = (ch) => ch.lines.map((l) => ({ ...l }));

// ===========================================================================
// f-a1s.k — THE FOUR PROVENANCE GATES. Each sub-cell drives ONE gate and asserts that gate's own
// message. TWO of them are regression nets against a MEASURED hole rather than restatements of a
// wall that was always there: run against the pre-review successor — same file, before gates (2)
// and (3) existed — k(3) and k(4) do not merely fail, they report `status: done`, i.e. the pair
// PERSISTS. A vision channel that named no engine at all, and a witness pair stamped with an
// Azure engine id, both landed. k(1)/k(2)/k(5) cover gates that already existed but that no cell
// could reach, which is a different (and quieter) kind of gap.
// ===========================================================================

test("f-a1s.k(1) reader1 naming an engine_id that is not the task's own stamp refuses, and nothing persists", async () => {
  mustBeReady();
  const { firm, ch, h, doc } = await provenanceSetup(4);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  const payload = witnessReadersPerChannel({
    engine1: `llm-openai:a-model-that-never-saw-this-page:${randomUUID().slice(0, 8)}`,
    engine2: engineId, h1: { ...h }, lines1: lines(ch), h2: { ...h }, lines2: lines(ch),
  });
  await assertNamedRefusal("internal", "is not the task", () => persistV2(taskId, payload),
    "f-a1s.k(1) reader1 engine_id mismatch");
  await assertNothingPersisted(doc.documentId, "f-a1s.k(1)");
});

test("f-a1s.k(2) reader2 naming an engine_id that is not the task's own stamp refuses, and nothing persists", async () => {
  mustBeReady();
  const { firm, ch, h, doc } = await provenanceSetup(5);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  const payload = witnessReadersPerChannel({
    engine1: engineId,
    engine2: `llm-openai:a-model-that-never-saw-this-page:${randomUUID().slice(0, 8)}`,
    h1: { ...h }, lines1: lines(ch), h2: { ...h }, lines2: lines(ch),
  });
  await assertNamedRefusal("internal", "is not the task", () => persistV2(taskId, payload),
    "f-a1s.k(2) reader2 engine_id mismatch");
  await assertNothingPersisted(doc.documentId, "f-a1s.k(2)");
});

// THE VACUITY CELL. Without the witness arm's RAW reader2 test this payload PERSISTS: 0038's
// carried coalesce silently substitutes the task stamp for the missing value, so the equality
// gate below it compares the task stamp against itself and reports agreement about a channel
// that claimed nothing. A vision read that names no engine is a read with no provenance.
test("f-a1s.k(3) reader2 SILENT on engine_id refuses — silence is not agreement (0038's coalesce fallback must not make the equality gate vacuous)", async () => {
  mustBeReady();
  const { firm, ch, h, doc } = await provenanceSetup(6);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  const payload = witnessReadersPerChannel({
    engine1: engineId, engine2: undefined, // the key is OMITTED, not blank
    h1: { ...h }, lines1: lines(ch), h2: { ...h }, lines2: lines(ch),
  });
  assert.ok(!("engine_id" in payload.readers.reader2),
    "the fixture must actually omit reader2.engine_id — a blank string would exercise a different path");
  await assertNamedRefusal("internal", "requires reader2 to name its own engine_id",
    () => persistV2(taskId, payload), "f-a1s.k(3) reader2 engine_id silence");
  await assertNothingPersisted(doc.documentId, "f-a1s.k(3)");

  // AND THE BLANK-STRING TWIN takes the same door: btrim('')='' reduces to the same silence.
  const doc2 = await filedStatementDoc(world.users.alice, world.clients.A1);
  const t2 = await statementWitnessTask(firm, doc2.documentId);
  await assertNamedRefusal("internal", "requires reader2 to name its own engine_id",
    () => persistV2(t2.taskId, witnessReadersPerChannel({
      engine1: t2.engineId, engine2: "   ", h1: { ...h }, lines1: lines(ch), h2: { ...h }, lines2: lines(ch),
    })), "f-a1s.k(3b) reader2 engine_id blank");
  await assertNothingPersisted(doc2.documentId, "f-a1s.k(3b)");
});

// THE GATE THAT MAKES THE MIGRATION'S "THE DB IS THE DECIDER" CLAIM TRUE. All three ids agreeing
// is not enough: they can all agree on an AZURE id, because lane `statement_facts` deliberately
// keeps `azure-%` admissible for every pre-cutover task. Without this gate a legacy task routed
// (or replayed) into the v2 verb would mint llm_text_facts / llm_vision_facts rows stamped with
// an engine that never received a witness egress.
test("f-a1s.k(4) the LIVE router's own azure-stamped statement_facts task refuses at the llm-% gate even though all three engine ids agree", async () => {
  mustBeReady();
  const { firm, ch, h, doc } = await provenanceSetup(7);

  // THE PREMISE IS READ, NOT TYPED — and the F-A2 Window-B activation MOVED it, exactly as the
  // earlier cut of this comment predicted it would ("if this ever fails, the router arm has
  // landed and THIS cell's premise, not the gate, is what moved"). The router's bank_statement
  // arm now stamps the WITNESS literal, so the live router no longer produces the azure-stamped
  // row this gate exists for. What still produces one is the PRE-WINDOW BACKLOG: a task minted
  // before the activation window and still on the lane afterwards. Lane `statement_facts` keeps
  // `azure-%` admissible precisely so that population stays storable, so the cell drives that
  // row — read the router's own stamp first (positive evidence that the arm re-keyed), then
  // build the backlog shape it is really about.
  const minted = (await rootQuery(
    `select id, lane, engine_id, version_n, status from clara.document_processing_tasks
      where document_id=$1 and lane='statement_facts'`, [doc.documentId])).rows;
  assert.equal(minted.length, 1, `filing a bank_statement document must mint exactly one statement_facts task (found ${minted.length})`);
  assert.equal(minted[0].engine_id, WITNESS_STATEMENT_ENGINE,
    `post-activation the router stamps the witness statement literal on this lane (got ${minted[0].engine_id})`);
  assert.notEqual(minted[0].engine_id, AZURE_STATEMENT_ENGINE,
    "the retiring vendor literal must never be minted again — no NEW task can reach this gate, only the pre-window backlog can");

  // …and that minted row is TERMINAL (it settled for want of a witness consent grant) and
  // immutable — re-arming it raises CLR16 'terminal document processing task is immutable',
  // which is the right answer and not a wall this cell may go around. So the cell drives a
  // RE-VERSIONED task carrying the AZURE literal: version_n 2 clears the
  // (document, engine, version, lane) unique key, and a re-versioned attempt on a statement is
  // an ordinary thing for this lane.
  assert.ok(["failed", "done"].includes(minted[0].status),
    `the router-minted task is expected terminal on a rig with no consent grant (got ${minted[0].status})`);
  const reVersioned = await statementWitnessTask(firm, doc.documentId, {
    engineId: AZURE_STATEMENT_ENGINE, versionN: minted[0].version_n + 1,
  });
  assert.equal(reVersioned.engineId, AZURE_STATEMENT_ENGINE);

  const err = await assertNamedRefusal("internal", "requires an llm-% engine stamp",
    () => persistV2(reVersioned.taskId, witnessReaders(AZURE_STATEMENT_ENGINE, { ...h }, lines(ch), { ...h }, lines(ch))),
    "f-a1s.k(4) azure-stamped task");
  assert.ok(String(err.message).includes(AZURE_STATEMENT_ENGINE),
    `the refusal must name the offending stamp so a human can see WHICH engine was refused (got "${err.message}")`);
  await assertNothingPersisted(doc.documentId, "f-a1s.k(4)");
});

// THE NULL-STAMP GATE, proven in BOTH halves, because the honest answer is that the v2 WRAPPER
// can never deliver it: it passes `t.engine_id`, and the column is NOT NULL. So this cell proves
// (a) the structural fact, by a POSITIVE catalog read plus the insert actually refusing, and
// (b) that the guard nonetheless FIRES through the only door that can reach it — a direct call
// on the core, which is where a future second wrapper would arrive.
test("f-a1s.k(5) the null task-stamp gate: a null-engine_id task is structurally unbuildable, and the guard still fires on the direct core door", async () => {
  mustBeReady();
  const { client, firm, ch, h, doc } = await provenanceSetup(8);

  // (a1) POSITIVE catalog read — the column is NOT NULL and carries the non-blank CHECK.
  const col = (await rootQuery(
    `select a.attnotnull from pg_attribute a
      where a.attrelid = 'clara.document_processing_tasks'::regclass and a.attname = 'engine_id'`)).rows[0];
  assert.equal(col?.attnotnull, true, "document_processing_tasks.engine_id is NOT NULL (0007:151) — this is the read that makes the wrapper door safe, not the absence of a counterexample");
  const nonBlank = (await rootQuery(
    `select count(*)::int as n from pg_constraint con
      where con.conrelid = 'clara.document_processing_tasks'::regclass and con.contype = 'c'
        and pg_get_constraintdef(con.oid) like '%btrim(engine_id)%'`)).rows[0].n;
  assert.ok(nonBlank >= 1, "a CHECK forbidding a blank engine_id is live (0007:151)");

  // (a2) …and the wall actually answers: the insert refuses 23502, it is not merely undeclared.
  let insertErr = null;
  try {
    await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
         status,workflow_run_id,started_at)
       values($1,$2,null,1,'statement_facts','running',$3,now())`,
      [firm, doc.documentId, `rig-nullengine-${randomUUID().slice(0, 8)}`]);
  } catch (e) { insertErr = e; }
  assert.equal(insertErr?.code, "23502", `a null-engine_id task must be refused by the NOT NULL wall (got ${insertErr?.code ?? "NO ERROR — the row was accepted"})`);

  // (b) THE GUARD ITSELF FIRES. `_persist_statement_core_v2` is revoked from PUBLIC and never
  // granted to clara_runtime, so root is the only door — and it is the shape a second wrapper
  // would take. Nothing about the payload is wrong here; only the stamp is missing.
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  await assertNamedRefusal("internal", "requires the task to carry its own engine_id",
    () => coreV2Direct({
      firm, client, documentId: doc.documentId, taskId, taskEngineId: null,
      payload: witnessReaders(engineId, { ...h }, lines(ch), { ...h }, lines(ch)),
    }), "f-a1s.k(5) null task engine_id on the direct core door");
  await assertNothingPersisted(doc.documentId, "f-a1s.k(5)");
});

// ===========================================================================
// f-a1s.l — THE SECOND CHANNEL IS MANDATORY ON THE WITNESS LANE. 'witness' sets `v_two` exactly
// as 'ocr' does, so a payload carrying only reader1 is `readers_disagree` — never a quietly
// accepted single read. This is the same law REQUIRED-3 defends one layer down: an absent
// second channel and a silent one both have to refuse, or "the pair corroborated" is a claim
// about one read.
// ===========================================================================

test("f-a1s.l a witness payload carrying ONLY reader1 refuses readers_disagree — the vision channel is mandatory", async () => {
  mustBeReady();
  const { firm, ch, h, doc } = await provenanceSetup(9);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  await assertRaisesReason(CLR10, "readers_disagree",
    () => persistV2(taskId, reader1OnlyPayload(engineId, h, ch)),
    "f-a1s.l reader1-only witness payload");
  await assertNothingPersisted(doc.documentId, "f-a1s.l");
});

// ===========================================================================
// f-a1s.m — THE LANE GUARD (the v2 wrapper's first refusal, CLR16). The wrapper serves
// `statement_facts` ONLY: `statement_parse` keeps riding the v1 wrapper and the v1 core, and
// nothing else may enter through this door at all. The cell proves the LANE branch specifically
// — the task genuinely exists, which is the half a not-found probe cannot distinguish.
// ===========================================================================

test("f-a1s.m the lane guard: a task that EXISTS but is not on the statement_facts lane refuses CLR16", async () => {
  mustBeReady();
  const { sub, client, firm } = await provenanceSetup(10);
  const doc = await filedStatementDoc(sub, client);
  const { taskId } = await taskOnLane(firm, doc.documentId, {
    lane: "ocr", engineId: `azure-di:prebuilt-read:${randomUUID().slice(0, 8)}`,
  });

  // POSITIVE: the row is really there, on a really different lane. Without this read the CLR16
  // below would be indistinguishable from the not-found half of the same refusal.
  const row = (await rootQuery(
    "select lane, status from clara.document_processing_tasks where id=$1", [taskId])).rows[0];
  assert.ok(row, "the lane-guard cell's task must genuinely exist");
  assert.equal(row.lane, "ocr");
  assert.equal(row.status, "running", "…and be in the state the wrapper would otherwise accept, so only the LANE differs");

  await assertRaisesReason(CLR16, null, () => persistV2(taskId, { pages_used: 1, readers: {} }),
    "f-a1s.m off-lane task");

  // A task id that names nothing takes the SAME door — recorded so the shared message is not
  // mistaken for a shared cause.
  await assertRaisesReason(CLR16, null, () => persistV2(randomUUID(), { pages_used: 1, readers: {} }),
    "f-a1s.m unknown task id");
  await assertNothingPersisted(doc.documentId, "f-a1s.m");
});
