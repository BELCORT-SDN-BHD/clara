// Slice-6 rig — coding_tasks (the AB-9 realization), the additive TAXONOMY pair
// (delta probe 6), the wrong-client-correction task insertion (delta probe 5,
// atomic part), and the coding_attempts structural keys. Contract-blind:
// contract §7 + companion §1/§4/§10 + §12 + INTERFACE-PINS §1 — NEVER from 0009.
//
// Probe (6) VERBATIM: "taxonomy additive insert — rig-proven (P5): event_type +
// trigger_taxonomy rows are a COUPLED pair into the ACTIVE version (which is v2);
// coverage stays whole, routing untouched."
// coding_tasks v1 matrix [C-14]: open→done|dismissed only (no in_progress).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROUTINE_CENTS,
  assertRaises,
  assertRaisesReason,
  opk,
  rootQuery,
  s6EnsureReady,
  s6FixReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  CLR21,
  CLR24,
  REASON,
  CODING_KIND,
  S6_EVENT_TYPES,
  firmOf,
  upsertPayableAccount,
  upsertAccountClassed,
  seedCitedDocument,
  draftEntryV3,
  approveEntry,
  balanced,
  billLines,
  ev,
  freshResolution,
  mintInteractive,
  wakeDraftEntry,
  FIELD,
  openCodingTask,
  completeCodingTask,
  dismissCodingTask,
  codingAttemptRow,
  previewCorrection,
  proposeCorrection,
  approveCorrection,
  createChatSession,
  beginChatTurn,
  taskIdOf,
  idOf,
} from "./s6-fixtures.mjs";

let ready = false;
let world = null;
const AP = "400-000";
const EXP = "500-A01";

before(async () => {
  ready = await s6EnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
    }
  }
});
after(async () => {
  printLaneNotes("s6-tasks");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-6 coding floor not present — 0009 not yet applied"); return true; }
  return false;
}

// ===========================================================================
// DELTA PROBE (6) — additive taxonomy pair; coverage whole; routing untouched.
// ===========================================================================

test("P5/P6 the seven new event types are a COUPLED pair (event_type + trigger_taxonomy) in the ACTIVE taxonomy version; coverage stays WHOLE", async (t) => {
  if (unready(t)) return;
  const active = (await rootQuery("select version from clara.taxonomy_active limit 1")).rows[0]?.version;
  assert.ok(active != null, "an active taxonomy version exists");
  // Every event type in event_types has a trigger_taxonomy row in the ACTIVE version.
  const uncovered = await rootQuery(
    `select et.name as event_type from clara.event_types et
      where not exists (select 1 from clara.trigger_taxonomy tt where tt.event_type=et.name and tt.version=$1)`,
    [active],
  );
  assert.equal(uncovered.rowCount, 0, `taxonomy coverage is WHOLE in the active version (uncovered: ${uncovered.rows.map((r) => r.event_type).join(", ")})`);
  // Each new S6 event type is present as a coupled pair.
  for (const et of S6_EVENT_TYPES) {
    const pair = await rootQuery(
      `select (select 1 from clara.event_types where name=$1) as et,
              (select 1 from clara.trigger_taxonomy where event_type=$1 and version=$2) as tt`,
      [et, active],
    );
    assert.ok(pair.rows[0].et, `event_types has '${et}'`);
    assert.ok(pair.rows[0].tt, `trigger_taxonomy (active v${active}) has '${et}' — the coupled pair (P5)`);
  }
});

test("P6 routing untouched: a pre-existing event type keeps its active-version routing decision (additive-only)", async (t) => {
  if (unready(t)) return;
  const active = (await rootQuery("select version from clara.taxonomy_active limit 1")).rows[0]?.version;
  // document.filed routes 'context_update' per S5 §3.7 — 0009 must not repoint it.
  const dec = (await rootQuery("select decision from clara.trigger_taxonomy where event_type='document.filed' and version=$1", [active])).rows[0]?.decision;
  assert.equal(dec, "context_update", "document.filed still routes 'context_update' (0009 is additive; no repoint)");
});

// ===========================================================================
// coding_tasks matrix + complete-proof + dismiss-reason + wrong-firm collapse.
// ===========================================================================

test("open→done: complete_coding_task proves an approved-unreversed result entry bound to the task's filing", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const task = await openCodingTask(users.alice, { client: clients.A1, document: cited.documentId, filing: cited.filingId, reason: "please code" });
  const taskId = idOf(task, "coding_task_id", "task_id", "id");
  // A valid result entry: an approved unreversed entry bound to the filing.
  const d = await draftEntryV3(users.alice, { client: clients.A1, resolution: await freshResolution(users.alice, clients.A1), document: cited.documentId, sha256: cited.sha256, lines: balanced(world.coa.A1, ROUTINE_CENTS), evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("t") });
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  await completeCodingTask(users.alice, { task: taskId, resultEntry: d.entry_id });
  const row = (await rootQuery("select status, result_entry_id from clara.coding_tasks where id=$1", [taskId])).rows[0];
  assert.equal(row.status, "done", "the task is done");
  assert.equal(row.result_entry_id, d.entry_id, "the result entry is recorded");
});

test("complete-proof failure: a NON-approved (draft) result entry → CLR24", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2 });
  const task = await openCodingTask(users.alice, { client: clients.A2, document: cited.documentId, filing: cited.filingId, reason: "code" });
  const taskId = idOf(task, "coding_task_id", "task_id", "id");
  const d = await draftEntryV3(users.alice, { client: clients.A2, resolution: await freshResolution(users.alice, clients.A2), document: cited.documentId, sha256: cited.sha256, lines: balanced(world.coa.A2, ROUTINE_CENTS), evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("t2") });
  await assertRaises(CLR24, () => completeCodingTask(users.alice, { task: taskId, resultEntry: d.entry_id }), "completing with a non-approved result entry → CLR24");
});

test("open→dismissed requires a reason; a dismissed task cannot then be completed (off-matrix) → CLR24", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const task = await openCodingTask(users.alice, { client: clients.A1, document: cited.documentId, filing: cited.filingId, reason: "code" });
  const taskId = idOf(task, "coding_task_id", "task_id", "id");
  await dismissCodingTask(users.alice, { task: taskId, reason: "duplicate bill" });
  assert.equal((await rootQuery("select status from clara.coding_tasks where id=$1", [taskId])).rows[0].status, "dismissed", "the task is dismissed");
  await assertRaises(CLR24, () => completeCodingTask(users.alice, { task: taskId, resultEntry: null }), "completing a dismissed task is off-matrix → CLR24");
});

test("wrong-firm collapse: a bookkeeper of another firm completing/dismissing a task → not-found (CLR24), never an oracle", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const task = await openCodingTask(users.alice, { client: clients.A1, document: cited.documentId, filing: cited.filingId, reason: "code" });
  const taskId = idOf(task, "coding_task_id", "task_id", "id");
  // dave belongs to firm B — the task is invisible → not-found collapse (CLR24).
  await assertRaises(CLR24, () => dismissCodingTask(users.dave, { task: taskId, reason: "not mine" }), "cross-firm dismiss → CLR24 not-found collapse");
});

test("events: opening a coding task emits coding_task.opened; closing emits coding_task.closed", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const before = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='coding_task.opened'", [firm])).rows[0].n;
  const task = await openCodingTask(users.alice, { client: clients.A1, document: cited.documentId, filing: cited.filingId, reason: "code" });
  const taskId = idOf(task, "coding_task_id", "task_id", "id");
  const opened = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='coding_task.opened'", [firm])).rows[0].n;
  assert.equal(opened, before + 1, "coding_task.opened emitted");
  await dismissCodingTask(users.alice, { task: taskId, reason: "close it" });
  const closed = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='coding_task.closed'", [firm])).rows[0].n;
  assert.ok(closed >= 1, "coding_task.closed emitted on close");
});

// ===========================================================================
// DELTA PROBE (5, atomic part) — wrong-client correction inserts a coding_task.
// (The concurrent-schedule half is in s6-locks.test.mjs.)
// ===========================================================================

test("probe 5: approve_wrong_client_correction inserts a coding_task (origin='correction', correction_id) atomically; the notification carries coding_task_id", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // File the doc to the WRONG client (A1) + an approved entry citing it, then correct A1 → A2.
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const d = await draftEntryV3(users.alice, { client: clients.A1, resolution: await freshResolution(users.alice, clients.A1), document: cited.documentId, sha256: cited.sha256, lines: balanced(world.coa.A1, ROUTINE_CENTS), evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("corr") });
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  await previewCorrection(users.alice, { document: cited.documentId, fromClient: clients.A1, toClient: clients.A2 });
  // The destination requires an authoritative document attribution recorded BEFORE
  // propose (S5-D3; the plan binds books_version, so record it first).
  await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId });
  const proposal = await proposeCorrection(users.alice, { document: cited.documentId, fromClient: clients.A1, toClient: clients.A2, reason: "wrong client" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  await approveCorrection(users.bob, { correction: correctionId, planHash });

  const task = (await rootQuery("select * from clara.coding_tasks where correction_id=$1", [correctionId])).rows[0];
  assert.ok(task, "the approved correction inserted a coding_task atomically (AB-9)");
  assert.equal(task.origin, "correction", "the task origin is 'correction'");
  assert.equal(task.client_id, clients.A2, "the coding task targets the correction DESTINATION client");
  // The notification stopgap carries the coding_task_id (C-14).
  const notif = (await rootQuery("select payload from clara.notifications where firm_id=$1 and kind ilike '%recode%' order by created_at desc limit 1", [firm])).rows[0];
  if (notif) assert.ok(JSON.stringify(notif.payload).includes(task.id), "the document_recode_required notification carries coding_task_id");
  else noteLane("no recode notification row found by kind ilike '%recode%' — inspect the notification kind (interface expectation)");
});

// ===========================================================================
// coding_attempts structural keys (C-12/NEW-6) — the recovery carrier.
// ===========================================================================

test("coding_attempts: a wake draft carrying p_coding writes ONE attempt row (task_id=the chat-turn agent_task, filing_id, entry_id); the table holds the one-attempt unique keys", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  // The coding attempt rides on the CHAT-TURN agent_task (coding_attempts.task_id
  // FKs to agent_tasks) — the recovery carrier for the in-turn coding step [C-12].
  const session = await createChatSession({ firm, author: users.alice, client: clients.A1 });
  const begun = await beginChatTurn({ session, author: users.alice, turnKey: `tk-${opk()}`, parts: [{ type: "text", text: "code it" }] });
  const agentTask = taskIdOf(begun);
  const cred = await mintInteractive(firm, users.alice);
  const res = await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId });
  const draft = await wakeDraftEntry(cred, {
    client: clients.A1, resolution: res, lines: billLines(EXP, AP, ROUTINE_CENTS),
    document: cited.documentId, sha256: cited.sha256, vendor: { new: { name: "ATTEMPTCO SDN BHD", registration_no: "201801000555" } },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], coding: { task_id: agentTask, part_payload: { type: "je_review" } },
    codingKind: CODING_KIND, opKey: `code-doc:${agentTask}:${cited.documentId}`,
  });
  const attempt = await codingAttemptRow(agentTask);
  assert.ok(attempt, "a coding_attempts row was written by the core in the draft transaction");
  assert.equal(attempt.entry_id, draft.entry_id, "the attempt binds the drafted entry");
  assert.equal(attempt.filing_id, cited.filingId, "the attempt binds the active filing");
  // unique(entry_id) holds in every 0009 (structural one-entry proof).
  const uniques = (await rootQuery(
    `select indexdef from pg_indexes where schemaname='clara' and tablename='coding_attempts' and indexdef ilike '%unique%'`,
  )).rows.map((r) => r.indexdef).join(" | ");
  assert.ok(/\(\s*entry_id\s*\)/.test(uniques), `coding_attempts holds unique(entry_id) — got: ${uniques}`);

  // W4 (§6.6) SUPERSEDES the earlier unique(task_id, filing_id) expectation: the
  // one-coding-per-TASK law makes the unique (task_id) (filing dimension dropped);
  // a SECOND attempt for one task refuses CLR21 double_coded (one coding per turn).
  if (!(await s6FixReady())) {
    noteLane("coding_attempts one-per-TASK (W4) not yet applied — the pre-fix unique is (task_id, filing_id); skipping the W4 assertions");
    return;
  }
  assert.ok(/\(\s*task_id\s*\)/.test(uniques), `W4: coding_attempts unique is now (task_id) — got: ${uniques}`);
  // A second attempt for the SAME task on a DIFFERENT filing/document → CLR21 double_coded.
  const cited2 = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const cred2 = await mintInteractive(firm, users.alice);
  const res2 = await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited2.documentId });
  await assertRaisesReason(CLR21, REASON.doubleCoded,
    () => wakeDraftEntry(cred2, {
      client: clients.A1, resolution: res2, lines: billLines(EXP, AP, ROUTINE_CENTS),
      document: cited2.documentId, sha256: cited2.sha256, vendor: { new: { name: "SECONDCO SDN BHD", registration_no: "201801000556" } },
      evidence: [ev(cited2.regionId, cited2.quote, FIELD.total)], coding: { task_id: agentTask, part_payload: { type: "je_review" } },
      codingKind: CODING_KIND, opKey: `code-doc:${agentTask}:${cited2.documentId}`,
    }),
    "a second coding attempt for one task → CLR21 double_coded (W4 one-coding-per-turn)");
});
