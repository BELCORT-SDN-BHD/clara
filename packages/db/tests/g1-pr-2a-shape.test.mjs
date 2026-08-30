// G1 PR-2a -- §G (the settle CAS), §A/§B (the two rosters), §C (the producer registration) and
// §D (the prose caps + the abandonment roster). The walls that live in the SHAPE of the schema
// rather than in a wake credential; §E/§F are g1-pr-2a-walls.test.mjs's.
//
// GATED on clara._bank_wake_task_gate's EXACT SIGNATURE, never a migration number.
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
  a21EnsureReady, buildWorld, firmOf,
} from "./a21-helpers.mjs";
import { caught } from "./x38-match-fixtures.mjs";
import { getPool } from "./rig-helpers.mjs";
import { truncateGuardError } from "./rig-txn.mjs";
import { hasG1Pr2a, makeBankWakeTask, retireLiveBankWakeTasks, forgetBankWakeTasks } from "./g1-pr-2a-fixtures.mjs";

let ready = false;
let W = null; let FIRM = null; let CLIENT = null; let FY = null;

/** A fiscal year, minted by a raw root insert. close_runs carries a COMPOSITE FK to
 *  (fiscal_years.id, firm_id), so a random uuid would fail on THAT foreign key and the
 *  end_reason_code cells below would then be measuring the wrong constraint entirely -- the
 *  "right conclusion, wrong reason" class this repo has paid for three times. */
let LAST_FY = null;
let LAST_ORDINAL = 0;
async function mintFiscalYear() {
  // CONTIGUOUS: clara.fiscal_years carries a contiguity trigger, so ordinal N > 1 must name its
  // predecessor. The chain is threaded here rather than each caller passing an ordinal, because a
  // caller that got the ordinal wrong would fail with the trigger's message and look like an
  // end_reason_code defect.
  LAST_ORDINAL += 1;
  const id = (await rootQuery(
    `insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal, prior_fy_id, status, fy_end_source, opened_by, opened_at)
       values ($1,$2,$3, make_date(2000 + $4, 1, 1), make_date(2000 + $4, 12, 31), $4, $6, 'open', 'asserted', $5, now())
     returning id`,
    [FIRM, CLIENT, `p2a FY${2000 + LAST_ORDINAL}`, LAST_ORDINAL, W.users.alice, LAST_FY])).rows[0].id;
  LAST_FY = id;
  return id;
}

/** A close run, born in_progress and then settled. clara._tf_assert_close_agent_receipt's INSERT
 *  arm refuses a run BORN with terminal fields ("a close run is born in_progress with no terminal
 *  fields"), so the abandonment cells below cannot insert an abandoned row directly -- the shape
 *  has to be reached the way a real abandon reaches it. The actor is a HUMAN, so no agent receipt
 *  is owed and the deferred wall stands aside. Returns the error when the settling UPDATE is
 *  refused, and null when it lands. */
async function abandonRun({ fy, endReason = "r", endReasonCode = null }) {
  const id = (await rootQuery(
    `insert into clara.close_runs(firm_id, client_id, fiscal_year_id, state, started_by)
       values ($1,$2,$3,'in_progress',$4) returning id`, [FIRM, CLIENT, fy, W.users.alice])).rows[0].id;
  const err = await caught(() => rootQuery(
    `update clara.close_runs set state='abandoned', ended_by=$2, ended_at=now(), end_reason=$3, end_reason_code=$4
      where id=$1`, [id, W.users.alice, endReason, endReasonCode]));
  return { id, err };
}

function gate(t) {
  if (!ready) { markSkip(); t.skip("G1 PR-2a surface absent -- battery dormant"); return true; }
  return false;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reasonOf = (err) => { try { return JSON.parse(err?.detail ?? "{}").reason ?? null; } catch { return null; } };

/** A fresh live wake task, bound to a synthetic account id (this file never calls a bank verb,
 *  so the account only has to EXIST in the payload, not resolve to a bank_accounts row). */
async function freshWakeTask(status = "running") {
  await retireLiveBankWakeTasks({ firm: FIRM, client: CLIENT });
  forgetBankWakeTasks();
  return makeBankWakeTask({ firm: FIRM, client: CLIENT, bankAccount: randomUUID(), status });
}

before(async () => {
  const r0 = await a21EnsureReady();
  if (!(r0.base && (await hasG1Pr2a()))) { noteLane("G1 PR-2a surface absent -- battery dormant"); return; }
  ready = true;
  W = await buildWorld();
  CLIENT = W.clients.A1;
  FIRM = await firmOf(CLIENT);
  FY = await mintFiscalYear();
});
after(async () => {
  printLaneNotes("g1-pr-2a-shape");
  printSkipCount("g1-pr-2a-shape");
  await endPool();
});

// =====================================================================================
// §G -- the settle becomes a conditional CAS.
// =====================================================================================
test("p2a.G1 a settle naming the WRONG run refuses; naming the right one settles", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshWakeTask();
  await rootQuery("update clara.agent_tasks set workflow_run_id='run-A' where id=$1", [taskId]);
  const err = await caught(() => rootQuery(
    "select clara._settle_wake_task_cas(p_task => $1, p_outcome => $2, p_error_code => $3, p_expect_run => $4, p_expect_status => $5)",
    [taskId, "completed", null, "run-B", "running"]));
  assert.ok(err, "G1: a settle from a run that does not hold the task must refuse");
  assert.equal(err.code, "CLR10", `G1: expected CLR10, got ${err.code}: ${err.message}`);
  assert.equal(reasonOf(err), "wake_settle_run_mismatch", `G1: expected wake_settle_run_mismatch, got ${err.detail}`);
  assert.equal((await rootQuery("select status from clara.agent_tasks where id=$1", [taskId])).rows[0].status,
    "running", "G1: a REFUSED settle must leave the row alone -- refusing, never no-opping, is only half of it");
  // Control: one argument differs.
  await rootQuery("select clara._settle_wake_task_cas(p_task => $1, p_outcome => $2, p_error_code => $3, p_expect_run => $4, p_expect_status => $5)",
    [taskId, "completed", null, "run-A", "running"]);
  assert.equal((await rootQuery("select status from clara.agent_tasks where id=$1", [taskId])).rows[0].status, "completed");
});

test("p2a.G1b a settle of an UNBOUND task that names a run refuses -- a null run id is not a wildcard", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshWakeTask();
  const err = await caught(() => rootQuery(
    "select clara._settle_wake_task_cas(p_task => $1, p_outcome => $2, p_error_code => $3, p_expect_run => $4, p_expect_status => $5)",
    [taskId, "failed", "internal", "run-Z", "running"]));
  assert.equal(reasonOf(err), "wake_settle_run_mismatch",
    `G1b: an unbound task must not silently satisfy a run expectation, got ${err?.detail}`);
  assert.match(err.message, /<unbound>/, "G1b: the refusal says the task is unbound rather than printing a null");
});

test("p2a.G2 a settle naming the WRONG status refuses; the right one settles", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshWakeTask();
  const err = await caught(() => rootQuery(
    "select clara._settle_wake_task_cas(p_task => $1, p_outcome => $2, p_error_code => $3, p_expect_run => $4, p_expect_status => $5)",
    [taskId, "completed", null, null, "cancel_requested"]));
  assert.equal(reasonOf(err), "wake_settle_status_mismatch", `G2: expected wake_settle_status_mismatch, got ${err?.detail}`);
  await rootQuery(
    "select clara._settle_wake_task_cas(p_task => $1, p_outcome => $2, p_error_code => $3, p_expect_run => $4, p_expect_status => $5)",
    [taskId, "completed", null, null, "running"]);
  assert.equal((await rootQuery("select status from clara.agent_tasks where id=$1", [taskId])).rows[0].status, "completed");
});

test("p2a.G3 missing status is refused by the strict door; legacy skip is quarantined behind one private compatibility body", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshWakeTask();
  const strictErr = await caught(() => rootQuery(
    "select clara._settle_wake_task_cas($1,$2,$3,$4,$5)", [taskId, "failed", "internal", null, null]));
  assert.equal(reasonOf(strictErr), "wake_settle_status_required",
    `G3: the strict door must require a status expectation, got ${strictErr?.detail}`);
  assert.equal((await rootQuery("select status from clara.agent_tasks where id=$1", [taskId])).rows[0].status,
    "running", "G3: the missing-expectation refusal leaves the task unchanged");

  const body = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._settle_wake_task(uuid,text,text)'::regprocedure")).rows[0].prosrc;
  assert.match(body, /_settle_wake_task_compat/,
    "G3: the frozen three-argument door delegates only to the named compatibility body");
  const grants = (await rootQuery(
    `select count(*)::int as n from pg_roles r
      where r.rolname like 'clara\\_%' and r.rolname <> 'clara_fn_owner'
        and has_function_privilege(r.rolname, 'clara._settle_wake_task_compat(uuid,text,text)'::regprocedure, 'EXECUTE')`)).rows[0].n;
  assert.equal(grants, 0, "G3: the expectation-skipping compatibility implementation is private");
  const comment = (await rootQuery(
    "select obj_description('clara._settle_wake_task_compat(uuid,text,text)'::regprocedure,'pg_proc') as c")).rows[0].c;
  assert.match(comment ?? "", /D1 cutover/i,
    "G3: the compatibility body's catalog comment names the D1 cutover that revokes the old door");

  // Frozen v1 callers still resolve while they drain. This is compatibility evidence, not a
  // claim that the short call performs a CAS: the private-body assertions above quarantine the
  // skip, and the strict call above proves new callers cannot inherit it.
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [taskId, "failed", "internal"]);
  const row = (await rootQuery("select status, error_code from clara.agent_tasks where id=$1", [taskId])).rows[0];
  assert.equal(row.status, "failed");
  assert.equal(row.error_code, "internal");
  // And 0133's own first-write-wins rule survives the recut: a replay carrying a different code
  // must not overwrite the first cause.
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [taskId, "failed", "timeout"]);
  assert.equal((await rootQuery("select error_code from clara.agent_tasks where id=$1", [taskId])).rows[0].error_code,
    "internal", "G3: first-write-wins on error_code is unchanged by the CAS recut");
});

test("p2a.G3b NULL is a real expected run: a concurrent bind after observation refuses", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshWakeTask(); // observed running + workflow_run_id NULL
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query("begin");
    await c1.query("update clara.agent_tasks set workflow_run_id='run-B' where id=$1", [taskId]);
    const raced = c2.query(
      "select clara._settle_wake_task_cas($1,$2,$3,$4,$5)",
      [taskId, "failed", "internal", null, "running"]).catch((e) => e);
    let sawBlock = false;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const row = (await rootQuery(
        "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1", [pid2])).rows[0];
      if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(pid1))) { sawBlock = true; break; }
      await sleep(25);
    }
    assert.ok(sawBlock, "G3b: the settle must observably wait behind the concurrent run bind");
    await c1.query("commit");
    const err = await raced;
    assert.ok(err instanceof Error, "G3b: binding run B after NULL was observed must refuse settlement");
    assert.equal(reasonOf(err), "wake_settle_run_mismatch",
      `G3b: NULL must be compared as an expected value, got ${err?.code} ${err?.detail ?? ""}`);
  } finally {
    for (const c of [c1, c2]) {
      try { await c.query("rollback"); } catch { /* not in a txn */ }
      try { await c.query("reset role"); await c.query("reset all"); } catch { /* closing anyway */ }
      c.release();
    }
  }
});

test("p2a.G4 FOR UPDATE makes the CAS read the COMMITTED row: a raced status expectation refuses by NAME, not by the trigger", async (t) => {
  if (gate(t)) return;
  // WHAT THIS CELL HAD TO BECOME, and the mutant panel is what forced it. The first draft asserted
  // "the second settle blocks on the first's row lock" -- true, and NOT DISCRIMINATING: the
  // UPDATE at the end of the body takes that row lock by itself, so deleting the explicit
  // FOR UPDATE reded nothing. A cell that cannot fail against the defect it names is decoration.
  //
  // The property the clause actually buys is that the CAS conjuncts are evaluated against the
  // COMMITTED row rather than a snapshot taken before the racing transaction committed. So: T1
  // settles the task inside an open window; T2, from another session, settles it expecting
  // 'running'. WITH the lock, T2 waits at the SELECT, then reads 'completed' and refuses
  // wake_settle_status_mismatch -- its own typed refusal, naming the real cause. WITHOUT it, T2
  // reads the stale 'running', PASSES its own CAS, and is refused downstream by the transition
  // trigger's CLR13 instead: the right outcome for the wrong stated reason, which is exactly the
  // class this file exists to keep out of a dead-letter triage.
  const { taskId } = await freshWakeTask();
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  try {
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query("begin");
    await c1.query("select clara._settle_wake_task($1,$2,$3)", [taskId, "completed", null]);
    const raced = c2.query(
      "select clara._settle_wake_task_cas(p_task => $1, p_outcome => $2, p_error_code => $3, p_expect_run => $4, p_expect_status => $5)",
      [taskId, "failed", "internal", null, "running"]).catch((e) => e);
    // PROVE the interleave with pg_blocking_pids, never a sleep (db-tests.md): if T2 never
    // observably blocked, the window this cell describes did not happen and its verdict would be
    // about something else.
    let sawBlock = false;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const row = (await rootQuery(
        "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1", [pid2])).rows[0];
      if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(pid1))) { sawBlock = true; break; }
      await sleep(25);
    }
    assert.ok(sawBlock, "G4: T2 must observably block on T1 -- otherwise the race this cell describes never happened");
    await c1.query("commit");
    const err = await raced;
    assert.ok(err instanceof Error, "G4: the raced settle must refuse");
    assert.equal(reasonOf(err), "wake_settle_status_mismatch",
      `G4: the CAS must read the COMMITTED status and refuse BY NAME; got ${err.code} ${err.detail ?? ""} -- a CLR13 here means the conjunct was evaluated against a stale snapshot`);
  } finally {
    for (const c of [c1, c2]) {
      try { await c.query("rollback"); } catch { /* not in a txn */ }
      try { await c.query("reset role"); await c.query("reset all"); } catch { /* closing anyway */ }
      c.release();
    }
  }
});

// =====================================================================================
// §A / §B -- the two rosters, extend-only in both directions.
// =====================================================================================
test("p2a.A1 llm_usage_events admits bank_agent + close_prep, still admits the nine, and admits no stranger the estate has not ruled", async (t) => {
  if (gate(t)) return;
  // THE ROSTER IS EXTEND-ONLY AND NOT CLOSED, so this cell is written as a BAND rather than an
  // exact count. 裁-49 rules two values and this migration adds exactly those; 裁-44's `tax_prep`
  // is a THIRD and rides F-T3 PR-9's own migration AFTER this one. An exact-eleven pin would go
  // false the day PR-9 lands — a floor its author would have to true for a change that is not a
  // regression — while a bare "the eleven are present" check would let anything at all be
  // smuggled in beside them. The band gives both: every ruled member must be there, and nothing
  // may appear that the estate has not ruled.
  const RULED = ["document_extraction", "chat", "unattended_posting", "freeform_read", "interview_extraction",
    "filing_attribution", "web_fetch", "tier1_policy_fetch", "reporting", "bank_agent", "close_prep"];
  const NAMED_SUCCESSOR = ["tax_prep"]; // 裁-44, F-T3 PR-9's own migration
  const def = (await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.llm_usage_events'::regclass and conname='ck_llm_usage_events_call_kind'`)).rows[0].def;
  const members = (def.match(/'[a-z0-9_]+'::text/g) ?? []).map((m) => m.slice(1, m.indexOf("'::")));
  for (const k of RULED) assert.ok(members.includes(k), `A1: the roster must admit ${k}`);
  const strangers = members.filter((m) => !RULED.includes(m) && !NAMED_SUCCESSOR.includes(m));
  assert.deepEqual(strangers, [],
    `A1: the roster carries ${strangers.join(", ")}, which neither 裁-49 nor 裁-44 ruled — extend-only means ruled-then-added, not added`);
  assert.ok(!members.includes("bank_agent_x"), "A1: control -- a near-miss spelling is not a member");
  // And the count is REPORTED, never asserted: what this migration leaves behind is eleven, and
  // twelve after PR-9. A reader of the lane notes gets the number without a cell breaking on it.
  noteLane(`A1: ck_llm_usage_events_call_kind carries ${members.length} member(s): ${members.join(", ")}`);
});

test("p2a.A2 close_prep's login pool is trued to the write pool, and BOTH sources stay disabled", async (t) => {
  if (gate(t)) return;
  // SCOPED to the two rows G1 seeded, deliberately: g1-wake-engine.test.mjs's own S3 cell
  // registers a synthetic source on this rig, so a whole-table closed-world assertion here would
  // be an ORDERING dependency between two files rather than a claim about this migration.
  const rows = (await rootQuery(
    "select source_key, login_pool, enabled from clara.wake_engine_sources where source_key in ('bank_agent','close_prep') order by source_key")).rows;
  assert.deepEqual(rows.map((r) => r.source_key), ["bank_agent", "close_prep"],
    "A2: both G1 rows are still there -- this migration registers no third source and removes neither");
  assert.equal(rows.find((r) => r.source_key === "close_prep").login_pool, "write", "A2: 裁-49's truing");
  assert.equal(rows.find((r) => r.source_key === "bank_agent").login_pool, "bank", "A2: bank_agent's pool is untouched");
  for (const r of rows) assert.equal(r.enabled, false, `A2: ${r.source_key} stays disabled -- 裁-40's flip is the owner's ceremony`);
});

test("p2a.B1 agent_tasks admits all_writes_refused, still admits the six, and still refuses a stranger", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshWakeTask();
  await rootQuery("update clara.agent_tasks set status='failed', error_code='all_writes_refused' where id=$1", [taskId]);
  assert.equal((await rootQuery("select error_code from clara.agent_tasks where id=$1", [taskId])).rows[0].error_code,
    "all_writes_refused", "B1: the new code lands on a real row, not just in a constraint's text");
  const { taskId: t2 } = await freshWakeTask();
  const err = await caught(() => rootQuery(
    "update clara.agent_tasks set status='failed', error_code='every_write_refused' where id=$1", [t2]));
  assert.ok(err, "B1: a near-miss spelling is still refused -- the roster is closed, not opened");
  const def = (await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.agent_tasks'::regclass and conname='agent_tasks_error_code_check'`)).rows[0].def;
  for (const k of ["model_error", "tool_error", "timeout", "engine_lost", "limit", "internal", "all_writes_refused"]) {
    assert.ok(def.includes(`'${k}'`), `B1: the roster must admit ${k}`);
  }
  assert.equal((def.match(/'[a-z0-9_]+'::text/g) ?? []).length, 7, "B1: exactly seven members");
});

// =====================================================================================
// §C -- the producer registration, in BOTH halves of the coupled pair.
// =====================================================================================
test("p2a.C1 bank.agent_due is registered client_scoped at a WAKE-BOUND decision, and coverage stays whole", async (t) => {
  if (gate(t)) return;
  const et = (await rootQuery("select client_scoped from clara.event_types where name='bank.agent_due'")).rows[0];
  assert.ok(et, "C1: the type is registered");
  assert.equal(et.client_scoped, true,
    "C1: a firm-level type refuses a client_id outright, so a firm-scoped bank.agent_due could never produce a runnable task");
  const tx = (await rootQuery(
    `select decision from clara.trigger_taxonomy
      where event_type='bank.agent_due' and version=(select version from clara.taxonomy_active)`)).rows[0];
  assert.ok(tx, "C1: the taxonomy half is registered too -- registering one alone is a half-registration");
  assert.ok(["internal_task", "notification", "background_review"].includes(tx.decision),
    `C1: the decision must be one relay.mjs treats as wake-bound; got ${tx.decision}`);
  assert.equal(tx.decision, "internal_task", "C1: and specifically internal_task -- Clara's own work, not a human notification");
  const gaps = (await rootQuery(
    `select count(*)::int as n from clara.event_types e
      where not exists (select 1 from clara.trigger_taxonomy t
                         where t.event_type=e.name and t.version=(select version from clara.taxonomy_active))`)).rows[0].n;
  assert.equal(gaps, 0, "C1: coverage is WHOLE over the entire registry");
});

test("p2a.C2 a bank.agent_due event REALLY appends with a client, and an unregistered type is still refused", async (t) => {
  if (gate(t)) return;
  const seq = (await rootQuery(
    "select clara._append_event($1,'bank.agent_due',$2,null,null,null,null,null,null,$3::jsonb) as seq",
    [FIRM, CLIENT, JSON.stringify({ bank_account_id: randomUUID() })])).rows[0].seq;
  const ev = (await rootQuery("select client_id, payload from clara.domain_events where firm_id=$1 and seq=$2", [FIRM, seq])).rows[0];
  assert.equal(ev.client_id, CLIENT, "C2: the event carries the client the wake insert arm will derive from it");
  assert.ok(ev.payload.bank_account_id, "C2: and the account the run's gate will read");
  // The control: registering one name must not have opened the gate for every name.
  const err = await caught(() => rootQuery(
    "select clara._append_event($1,'bank.agent_not_a_real_type',$2,null,null,null,null,null,null,'{}'::jsonb)", [FIRM, CLIENT]));
  assert.ok(err, "C2: an unregistered event type is still refused");
});

// =====================================================================================
// §D -- the prose caps and the abandonment roster.
// =====================================================================================
test("p2a.D1 every model-authored prose column is capped at 4000, and 4000 itself is admitted", async (t) => {
  if (gate(t)) return;
  const long = "x".repeat(4001);
  const cases = [
    ["clara.bank_agent_proposals", "rationale"],
    ["clara.close_proposals", "narrative"],
    ["clara.close_proposals", "rationale"],
    ["clara.close_runs", "end_reason"],
  ];
  for (const [rel, col] of cases) {
    const def = (await rootQuery(
      `select string_agg(pg_get_constraintdef(oid), ' | ') as d from pg_constraint
        where conrelid=$1::regclass and contype='c' and pg_get_constraintdef(oid) like '%length(' || $2 || ')%'`,
      [rel, col])).rows[0].d;
    assert.ok(def && def.includes("4000"), `D1: ${rel}.${col} carries a 4000-character cap (${def})`);
  }
  // Behavioural, on the one table this battery can populate cheaply: the CHECK really refuses.
  const { err } = await abandonRun({ fy: FY, endReason: long });
  assert.ok(err, "D1: a 4001-character end_reason is refused by the database, not merely by a TypeScript schema");
  assert.equal(err.constraint, "ck_close_runs_end_reason_len",
    `D1: and refused by the length CHECK BY NAME, never by an FK or another guard (${err.constraint}: ${err.message})`);
  // The control at the boundary: exactly 4000 lands.
  const okRun = await abandonRun({ fy: await mintFiscalYear(), endReason: "x".repeat(4000) });
  assert.equal(okRun.err, null, `D1: 4000 characters is admitted (${okRun.err?.message})`);
});

test("p2a.D1b drafted[].text is capped per ELEMENT, and a lawful drafted array still passes", async (t) => {
  if (gate(t)) return;
  const ok = await rootQuery("select clara._drafted_prose_within($1::jsonb, 4000) as v",
    [JSON.stringify([{ check_key: "a", item_key: "b", text: "x".repeat(4000) }])]);
  assert.equal(ok.rows[0].v, true, "D1b: exactly 4000 is admitted");
  const bad = await rootQuery("select clara._drafted_prose_within($1::jsonb, 4000) as v",
    [JSON.stringify([{ check_key: "a", item_key: "b", text: "ok" }, { check_key: "c", item_key: "d", text: "x".repeat(4001) }])]);
  assert.equal(bad.rows[0].v, false, "D1b: a LATER element over the cap is caught -- the walk is per-element, not first-element");
  const empty = await rootQuery("select clara._drafted_prose_within('[]'::jsonb, 4000) as v");
  assert.equal(empty.rows[0].v, true, "D1b: an empty array is close_proposals_drafted_check's business, not this one's");
});

test("p2a.D2 the abandonment roster is a closed, forced-RLS vocabulary and end_reason_code is FK-bound to it", async (t) => {
  if (gate(t)) return;
  const rls = (await rootQuery(
    `select relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='close_abandon_reasons'`)).rows[0];
  assert.equal(rls.relrowsecurity, true, "D2: RLS enabled");
  assert.equal(rls.relforcerowsecurity, true, "D2: RLS FORCED");
  const codes = (await rootQuery("select code from clara.close_abandon_reasons order by sort_order")).rows.map((r) => r.code);
  assert.ok(codes.includes("other"), "D2: 'other' exists so a cause outside the roster is recordable, not unrecordable");
  assert.ok(codes.length >= 5, `D2: the roster is populated (${codes.length})`);
  // The wall that bites TODAY: an unrostered code is refused. A REAL fiscal year, because the
  // composite FK to (fiscal_years.id, firm_id) would otherwise be what refused this row.
  const bad = await abandonRun({ fy: await mintFiscalYear(), endReasonCode: "not_a_real_code" });
  assert.ok(bad.err, "D2: an unrostered end_reason_code is refused");
  assert.equal(bad.err.code, "23503", `D2: refused by the FOREIGN KEY specifically, got ${bad.err.code}: ${bad.err.message}`);
  // POSITIVE CONTROL on the identical shape: a ROSTERED code lands. Without it the cell above
  // would pass just as well against a column nothing could ever be written to.
  const good = await abandonRun({ fy: await mintFiscalYear(), endReasonCode: "other" });
  assert.equal(good.err, null, `D2: a rostered code lands (${good.err?.message})`);
  assert.equal((await rootQuery("select end_reason_code from clara.close_runs where id=$1", [good.id])).rows[0].end_reason_code,
    "other", "D2: and it is stored, not silently dropped");
  // And a rostered code on a run that is NOT abandoned is refused -- a code is a cause, and a run
  // that did not end has none.
  const fyOpen = await mintFiscalYear();
  const err2 = await caught(() => rootQuery(
    `insert into clara.close_runs(firm_id, client_id, fiscal_year_id, state, started_by, end_reason_code)
       values ($1,$2,$3,'in_progress',$4,'other')`, [FIRM, CLIENT, fyOpen, W.users.alice]));
  assert.ok(err2, "D2: a code on a non-abandoned run is refused");
  assert.equal(err2.constraint, "ck_close_runs_end_reason_code_abandoned",
    `D2: and by the pairing CHECK by name, not by something else (${err2.constraint}: ${err2.message})`);
  // The carrier is written by NO PRODUCTION VERB yet -- that is the named follow-up, and it is
  // recorded as a measurement rather than a comment: the only row carrying a code is the one this
  // cell wrote by hand. A verb that started setting it would show up here.
  // SCOPED TO THIS RUN'S OWN CLIENT. An estate-wide count would go false the SECOND time this
  // file runs against one database (this cell's own previous row survives) -- found by the mutant
  // panel, where every §G and §D mutant reded D2 for that reason and not for the wall it removed.
  const written = (await rootQuery(
    "select count(*)::int as n from clara.close_runs where client_id=$1 and end_reason_code is not null and id <> $2",
    [CLIENT, good.id])).rows[0].n;
  assert.equal(written, 0, "D2: nothing but this cell's own hand-written row carries a code -- the writer is still owed");
});

test("p2a.D3 retirement preserves history but blocks new assignments; roster rows are append-or-retire only", async (t) => {
  if (gate(t)) return;
  const existing = await abandonRun({ fy: await mintFiscalYear(), endReasonCode: "operator_abandoned" });
  assert.equal(existing.err, null, `D3: pre-retirement reference must land (${existing.err?.message})`);
  await rootQuery("update clara.close_abandon_reasons set active=false where code='operator_abandoned'");
  assert.equal((await rootQuery("select end_reason_code from clara.close_runs where id=$1", [existing.id])).rows[0].end_reason_code,
    "operator_abandoned", "D3: retirement leaves existing references intact");
  const fresh = await abandonRun({ fy: await mintFiscalYear(), endReasonCode: "operator_abandoned" });
  assert.equal(reasonOf(fresh.err), "close_abandon_reason_inactive",
    `D3: a new assignment of a retired code must refuse, got ${fresh.err?.detail}`);

  for (const [label, sql, params] of [
    ["code edit", "update clara.close_abandon_reasons set code=$2 where code=$1", ["other", "other_renamed"]],
    ["label edit", "update clara.close_abandon_reasons set label=label || ' changed' where code=$1", ["other"]],
    ["description edit", "update clara.close_abandon_reasons set description=description || ' changed' where code=$1", ["other"]],
    ["sort edit", "update clara.close_abandon_reasons set sort_order=998 where code=$1", ["other"]],
    ["reactivate", "update clara.close_abandon_reasons set active=true where code=$1", ["operator_abandoned"]],
    ["delete", "delete from clara.close_abandon_reasons where code=$1", ["other"]],
  ]) {
    const err = await caught(() => rootQuery(sql, params));
    assert.equal(reasonOf(err), "close_abandon_reason_immutable",
      `D3: ${label} must refuse through the lifecycle wall, got ${err?.detail}`);
  }
  const trunc = await truncateGuardError("truncate clara.close_abandon_reasons cascade");
  assert.equal(reasonOf(trunc), "close_abandon_reason_immutable",
    `D3: TRUNCATE must refuse through the roster lifecycle wall, got ${trunc?.detail}`);
});
