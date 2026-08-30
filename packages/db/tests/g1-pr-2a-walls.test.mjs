// G1 PR-2a -- §E (the task-bound bank credential) and §F (the write TOCTOU + account binding).
//
// CONTRACT-BLIND where it can be: written from the work order and #437's own recorded residuals
// ("the write TOCTOU between the status read and the wrapper transaction (the DB-side half is
// G1 PR-2)"), not from the migration's SQL text. Every wall below has a RED-first shape -- the
// cell drives the refusal and names the DETAIL reason, so a guard that refused for another cause
// fails here rather than passing on a coincidence.
//
// GATED on clara._bank_wake_task_gate's EXACT SIGNATURE, never a migration number.
//
// NEVER LIVE: this file mints credentials and drives writes; it runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
  a21EnsureReady, buildWorld, firmOf, upsertAccountClassed, upsertPayableAccount,
  grantConsent, idOf,
} from "./a21-helpers.mjs";
import {
  BANKCOA1, BANKCOA2, AR1, AP1, EXPN, REVN, hasBankMatching, caught, addBankAccount,
} from "./x38-match-fixtures.mjs";
import { wakeQuery, ROLES } from "./rig-helpers.mjs";
import { WAKE_ROLE, RATIONALE, MODEL, callWrapper } from "./f-a3-pr1b-wake-fixtures.mjs";
import {
  hasG1Pr2a, makeBankWakeTask, makeUnrelatedWakeTask, retireLiveBankWakeTasks, forgetBankWakeTasks,
} from "./g1-pr-2a-fixtures.mjs";
import { callWake as callCloseWake, derivedOpKey } from "./f-a4-pr1c-fixtures.mjs";

let ready = false;
let W = null;      // buildWorld()
let FIRM = null;
let CLIENT = null;
let ACCT_A = null; // the account a run is bound to
let ACCT_B = null; // a SECOND account of the same client -- the only way to drill the mismatch
let hasPurpose = false;

function gate(t) {
  if (!ready) { markSkip(); t.skip("G1 PR-2a gate absent -- battery dormant"); return true; }
  return false;
}
function gatePurpose(t) {
  if (gate(t)) return true;
  if (!hasPurpose) {
    markSkip();
    t.skip("bank_matching egress purpose not consented on this rig -- the ADMITTED-pack cells cannot run");
    return true;
  }
  return false;
}

/** The verb specs, once. */
const PACK = [{ name: "p_client", cast: "uuid" }, { name: "p_bank_account", cast: "uuid" },
  { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }];
// THE WRITE THIS FILE DRIVES, and the choice is deliberate. wake_propose_bank_line_exception
// derives its client FROM THE LINE, so a fabricated line id makes its own credential_client_pin
// check refuse CLR11 before the gate is ever reached -- the gate now sits LAST, after every
// refusal the wrapper already made. wake_match_bank_line takes p_client directly, so its pin
// passes and the gate is genuinely what answers. (That the pin fires first at all is the
// evidence the gate is not masking it -- G1PR2A-F7 pins the position structurally.)
const MATCH = [{ name: "p_client", cast: "uuid" }, { name: "p_lines", cast: "jsonb" },
  { name: "p_entries", cast: "jsonb" }, { name: "p_adjustments", cast: "jsonb" },
  { name: "p_ack_period_exceptions", cast: "boolean" }, { name: "p_rationale" },
  { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }];
const matchArgs = (lines, key) => [CLIENT, JSON.stringify(lines), "[]", "[]", false,
  RATIONALE, JSON.stringify(MODEL), "d", opk(key)];
const ADD_ACCOUNT = [{ name: "p_client", cast: "uuid" }, { name: "p_coa_account_code" },
  { name: "p_proposal_id", cast: "uuid" }, { name: "p_bank_code" }, { name: "p_account_number" },
  { name: "p_bank_name_display" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
  { name: "p_inputs_digest" }, { name: "p_op_key" }];
const UPSERT_ACCOUNT = [{ name: "p_client", cast: "uuid" }, { name: "p_code" }, { name: "p_name" },
  { name: "p_type" }, { name: "p_special_acc_type" }, { name: "p_account_class" },
  { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" },
  { name: "p_op_key" }];
const STAFF_ADVANCE = [{ name: "p_client", cast: "uuid" }, { name: "p_posting_date", cast: "date" },
  { name: "p_memo" }, { name: "p_lines", cast: "jsonb" }, { name: "p_allocations", cast: "jsonb" },
  { name: "p_kind" }, { name: "p_reason" }, { name: "p_rationale" },
  { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }];
const PROMOTION = [{ name: "p_client", cast: "uuid" }, { name: "p_counterparty", cast: "uuid" },
  { name: "p_identifier_kind" }, { name: "p_identifier_value" }, { name: "p_times_seen", cast: "int" },
  { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" },
  { name: "p_op_key" }];

const mintPlain = (kind, firm, client, obo = null) => rootQuery(
  "select * from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)", [kind, firm, obo, client]);
const mintForTask = (kind, firm, client, task) => rootQuery(
  "select * from clara.mint_wake_credential_for_task($1,$2,$3,$4,'00:15:00'::interval)", [kind, firm, client, task]);

/** A fresh live wake task for CLIENT, unambiguous by construction. */
async function freshTask({ account = ACCT_A, status = "running" } = {}) {
  await retireLiveBankWakeTasks({ firm: FIRM, client: CLIENT });
  forgetBankWakeTasks();
  return makeBankWakeTask({ firm: FIRM, client: CLIENT, bankAccount: account, status });
}
async function freshCloseTask(status = "running") {
  const taskId = (await rootQuery(
    `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','p2a/close') returning id`, [FIRM, CLIENT])).rows[0].id;
  if (status !== "queued") {
    await rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
    if (status !== "running") {
      if (status === "cancelled") {
        await rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);
      }
      await rootQuery("update clara.agent_tasks set status=$2 where id=$1", [taskId, status]);
    }
  }
  return taskId;
}
const reasonOf = (err) => { try { return JSON.parse(err?.detail ?? "{}").reason ?? null; } catch { return null; } };

before(async () => {
  const r0 = await a21EnsureReady();
  if (!(r0.base && r0.has16 && (await hasBankMatching()) && (await hasG1Pr2a()))) {
    noteLane("G1 PR-2a surface (or the bank-matching base) absent -- battery dormant");
    return;
  }
  ready = true;
  W = await buildWorld();
  CLIENT = W.clients.A1;
  FIRM = await firmOf(CLIENT);
  const sub = W.users.alice;
  // TWO bank COA codes, and a third minted per-cell where one is needed: add_bank_account
  // refuses a chart account that is already bound to a live bank account ("one COA, one bank
  // account"), so a second bank account for the same client needs its own code.
  await upsertAccountClassed(sub, { client: CLIENT, code: BANKCOA1, name: "Maybank current (p2a)", type: "asset", opKey: opk("p2a-bcoa") });
  await upsertAccountClassed(sub, { client: CLIENT, code: BANKCOA2, name: "CIMB current (p2a)", type: "asset", opKey: opk("p2a-bcoa2") });
  await upsertAccountClassed(sub, { client: CLIENT, code: AR1, name: "Trade Debtors (p2a)", type: "asset", accountClass: "receivable", opKey: opk("p2a-ar") });
  await upsertPayableAccount(sub, { client: CLIENT, code: AP1, name: "Trade Creditors (p2a)", opKey: opk("p2a-ap") });
  await upsertAccountClassed(sub, { client: CLIENT, code: EXPN, name: "Prof Fees (p2a)", type: "expense", opKey: opk("p2a-exp") });
  await upsertAccountClassed(sub, { client: CLIENT, code: REVN, name: "Revenue (p2a)", type: "income", opKey: opk("p2a-rev") });
  await grantConsent(sub, { firm: FIRM, client: CLIENT }).catch(() => {});
  ACCT_A = idOf(await addBankAccount(sub, { client: CLIENT, coaAccountCode: BANKCOA1, accountNumber: `2001${randomUUID().slice(0, 8)}` }), "bank_account_id", "id");
  ACCT_B = idOf(await addBankAccount(sub, { client: CLIENT, coaAccountCode: BANKCOA2, accountNumber: `2002${randomUUID().slice(0, 8)}` }), "bank_account_id", "id");
  // The egress purpose, exactly as f-a3-pr1b-wake-verbs sets it up (raw inserts: the grant verbs
  // carry their own enum raise and are PR-1c's, not this file's to pre-empt).
  const def = (await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.client_egress_purpose_consents'::regclass and contype='c'
        and pg_get_constraintdef(oid) like '%purpose = ANY%'`)).rows[0]?.def ?? "";
  hasPurpose = def.includes("bank_matching");
  if (hasPurpose) {
    const { consentEvidenceDoc } = await import("./wave-b/wb-0020-helpers.mjs");
    const evidence = await consentEvidenceDoc(sub, { firm: FIRM });
    const consent = await rootQuery(
      `insert into clara.client_egress_purpose_consents(firm_id, client_id, purpose, scope_note, evidence_document_id, granted_by)
         values ($1,$2,'bank_matching','p2a test consent',$3,$4) returning id`,
      [FIRM, CLIENT, evidence.documentId, sub]);
    await rootQuery(
      `insert into clara.client_egress_purpose_activations(firm_id, client_id, purpose, consent_id, activated_by)
         values ($1,$2,'bank_matching',$3,$4)`, [FIRM, CLIENT, consent.rows[0].id, sub]);
  } else {
    noteLane("bank_matching purpose not admitted by the live CHECK -- ADMITTED-pack cells skip, named and counted");
  }
});
after(async () => {
  printLaneNotes("g1-pr-2a-walls");
  printSkipCount("g1-pr-2a-walls");
  await endPool();
});

// =====================================================================================
// §E -- the credential can no longer be minted out of thin air.
// =====================================================================================
test("p2a.E1 plain bank mint counts only bank.agent_due source tasks, never every kind='wake' task", async (t) => {
  if (gate(t)) return;
  await retireLiveBankWakeTasks({ firm: FIRM, client: CLIENT });
  forgetBankWakeTasks();
  const unrelated = await makeUnrelatedWakeTask({ firm: FIRM, client: CLIENT, bankAccount: ACCT_B });
  const err = await caught(() => mintPlain("bank_agent", FIRM, CLIENT));
  assert.ok(err, "E1: a bank_agent mint with only a non-bank wake task must refuse");
  assert.equal(err.code, "CLR10", `E1: expected CLR10, got ${err.code}: ${err.message}`);
  assert.equal(reasonOf(err), "bank_agent_task_absent", `E1: expected bank_agent_task_absent, got ${err.detail}`);
  const exactErr = await caught(() => mintForTask("bank_agent", FIRM, CLIENT, unrelated.taskId));
  assert.equal(reasonOf(exactErr), "wake_task_source_mismatch",
    `E1: the exact minter must refuse the shared-kind/wrong-source task BY SOURCE, got ${exactErr?.detail}`);
  // POSITIVE CONTROL with both tasks live: the unrelated wake is ignored, not counted as a false
  // ambiguity, and the one real bank task is the credential binding.
  const { taskId } = await makeBankWakeTask({ firm: FIRM, client: CLIENT, bankAccount: ACCT_A, status: "running" });
  const ok = await mintPlain("bank_agent", FIRM, CLIENT);
  const bound = (await rootQuery("select agent_task_id from clara.wake_credentials where id=$1", [ok.rows[0].credential_id])).rows[0];
  assert.equal(bound.agent_task_id, taskId,
    "E1: one bank wake plus one unrelated wake binds the bank task, never ambiguous");
  const exact = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  assert.ok(exact.rows[0].secret, "E1: the exact minter admits the real bank-source task");
});

test("p2a.E2 two live wake tasks for one client REFUSE the plain mint rather than picking one", async (t) => {
  if (gate(t)) return;
  await retireLiveBankWakeTasks({ firm: FIRM, client: CLIENT });
  forgetBankWakeTasks();
  await makeBankWakeTask({ firm: FIRM, client: CLIENT, bankAccount: ACCT_A, status: "running" });
  await makeBankWakeTask({ firm: FIRM, client: CLIENT, bankAccount: ACCT_B, status: "running" });
  const err = await caught(() => mintPlain("bank_agent", FIRM, CLIENT));
  assert.ok(err, "E2: an ambiguous binding must refuse, never guess");
  assert.equal(reasonOf(err), "bank_agent_task_ambiguous", `E2: expected bank_agent_task_ambiguous, got ${err.detail}`);
  assert.match(err.message, /2 live/, "E2: the refusal names the count a triage needs");
});

test("p2a.E3 the other wake kinds are UNTOUCHED: they still mint, and still bind no task", async (t) => {
  if (gate(t)) return;
  // The regression twin for §E. mint_wake_credential is one body with seven arms; a change to
  // the bank arm that also moved another would show up here and nowhere else in this file.
  for (const [kind, client] of [["interactive_client", CLIENT], ["close_prep", CLIENT], ["autodraft", CLIENT], ["filing", null], ["proactive", null]]) {
    const r = await mintPlain(kind, FIRM, client);
    const row = (await rootQuery("select wake_kind, agent_task_id from clara.wake_credentials where id=$1", [r.rows[0].credential_id])).rows[0];
    assert.equal(row.wake_kind, kind, `E3: ${kind} still mints`);
    assert.equal(row.agent_task_id, null, `E3: ${kind} binds NO task -- only bank_agent's arm derives one`);
  }
});

test("p2a.E4 mint_wake_credential_for_task admits bank_agent, and refuses a task of the wrong KIND", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshTask();
  const r = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  const row = (await rootQuery("select agent_task_id from clara.wake_credentials where id=$1", [r.rows[0].credential_id])).rows[0];
  assert.equal(row.agent_task_id, taskId, "E4: the exact door binds exactly what it was handed");
  // The RED: a close_prep task id presented under bank_agent. The expected kind comes from the
  // REGISTRY (wake_engine_sources.task_kind), so this proves the registry lookup is live rather
  // than a literal that happens to agree.
  const closeTask = (await rootQuery(
    `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','p2a/model') returning id`, [FIRM, CLIENT])).rows[0].id;
  const err = await caught(() => mintForTask("bank_agent", FIRM, CLIENT, closeTask));
  assert.equal(reasonOf(err), "wake_task_incongruent", `E4: expected wake_task_incongruent, got ${err?.detail}`);
  // POSITIVE CONTROL on the same row after the production claim transition: close_prep still
  // works through the same door once its task is live.
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [closeTask]);
  const okClose = await mintForTask("close_prep", FIRM, CLIENT, closeTask);
  assert.ok(okClose.rows[0].secret, "E4: close_prep's own path through the widened door is unmoved");
});

test("p2a.E5 exact bank mint admits cancel_requested but refuses every terminal task without inserting", async (t) => {
  if (gate(t)) return;
  const cancel = await freshTask({ status: "cancel_requested" });
  const cancelCred = await mintForTask("bank_agent", FIRM, CLIENT, cancel.taskId);
  const werr = await caught(() => wakeQuery(WAKE_ROLE, cancelCred.rows[0].secret,
    callWrapper("wake_match_bank_line", MATCH), matchArgs([], "p2a-e5-write")));
  assert.equal(reasonOf(werr), "wake_task_not_running",
    `E5: cancel_requested can mint/read but its write refuses, got ${werr?.detail}`);
  const rerr = await caught(() => wakeQuery(WAKE_ROLE, cancelCred.rows[0].secret,
    callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, ACCT_A, RATIONALE, JSON.stringify(MODEL), opk("p2a-e5-read")]));
  assert.notEqual(reasonOf(rerr), "wake_task_not_running", "E5: cancel_requested still clears the pack-read status arm");

  for (const status of ["completed", "failed", "cancelled"]) {
    const task = await freshTask({ status });
    const before = (await rootQuery("select count(*)::int as n from clara.wake_credentials where agent_task_id=$1", [task.taskId])).rows[0].n;
    const err = await caught(() => mintForTask("bank_agent", FIRM, CLIENT, task.taskId));
    assert.equal(reasonOf(err), "wake_task_not_live", `E5: ${status} must refuse wake_task_not_live, got ${err?.detail}`);
    const afterN = (await rootQuery("select count(*)::int as n from clara.wake_credentials where agent_task_id=$1", [task.taskId])).rows[0].n;
    assert.equal(afterN, before, `E5: ${status} refusal inserts no credential`);
  }
});

test("p2a.E5b exact close_prep mint refuses pre-claim and terminal tasks without inserting a credential", async (t) => {
  if (gate(t)) return;
  // close_prep's legal matrix has exactly three terminal states; unlike chat_turn it has no
  // expired transition. queued is included as the distinct pre-claim/non-live shape.
  for (const status of ["queued", "completed", "failed", "cancelled"]) {
    const taskId = await freshCloseTask(status);
    const beforeN = (await rootQuery(
      "select count(*)::int as n from clara.wake_credentials where agent_task_id=$1", [taskId])).rows[0].n;
    const err = await caught(() => mintForTask("close_prep", FIRM, CLIENT, taskId));
    assert.equal(reasonOf(err), "wake_task_not_live",
      `E5b: close_prep task status ${status} must refuse wake_task_not_live, got ${err?.detail}`);
    const afterN = (await rootQuery(
      "select count(*)::int as n from clara.wake_credentials where agent_task_id=$1", [taskId])).rows[0].n;
    assert.equal(afterN, beforeN, `E5b: ${status} refusal inserts zero credentials`);
  }
});

test("p2a.E5c a close credential minted while running cannot WRITE after settle/cancel; FOLD-2 still permits a post-cancel READ", async (t) => {
  if (gate(t)) return;
  const OPEN_FY = [{ name: "p_client", cast: "uuid" }, { name: "p_label" },
    { name: "p_starts_on", cast: "date" }, { name: "p_rationale" },
    { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }];
  const LIST_FY = [{ name: "p_client", cast: "uuid" }, { name: "p_rationale" },
    { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }];

  for (const status of ["completed", "cancelled"]) {
    const taskId = await freshCloseTask("running");
    const cred = await mintForTask("close_prep", FIRM, CLIENT, taskId);
    if (status === "cancelled") {
      await rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);
    }
    await rootQuery("update clara.agent_tasks set status=$2 where id=$1", [taskId, status]);
    const writeErr = await caught(() => callCloseWake(
      cred.rows[0].secret, "wake_open_fiscal_year", OPEN_FY,
      [CLIENT, `p2a ${status}`, "2027-01-01", RATIONALE, JSON.stringify(MODEL),
        derivedOpKey(taskId, "wake_open_fiscal_year", CLIENT)],
    ));
    assert.equal(reasonOf(writeErr), "wake_task_not_live",
      `E5c: close write after ${status} must refuse wake_task_not_live, got ${writeErr?.detail}`);

    if (status === "cancelled") {
      const readErr = await caught(() => callCloseWake(
        cred.rows[0].secret, "wake_list_fiscal_years", LIST_FY,
        [CLIENT, RATIONALE, JSON.stringify(MODEL),
          derivedOpKey(taskId, "wake_list_fiscal_years", CLIENT)],
      ));
      assert.notEqual(reasonOf(readErr), "wake_task_not_live",
        "E5c/FOLD-2: cancellation stops acts, but a read may still inspect why the pass stopped");
    }
  }

  const gateShape = (await rootQuery(
    `select p.prosrc, p.provolatile,
            (select count(*)::int from pg_roles r
              where r.rolname like 'clara\\_%' and r.rolname <> 'clara_fn_owner'
                and has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as non_owner_grants
       from pg_proc p where p.oid='clara._close_wake_ctx(text,text,uuid,text)'::regprocedure`,
  )).rows[0];
  assert.equal(gateShape.provolatile, "v", "E5c: the row-locking close gate is catalogued VOLATILE, never STABLE");
  assert.match(gateShape.prosrc, /for update of t/i, "E5c: the write arm holds the bound task through commit");
  assert.equal(gateShape.non_owner_grants, 0, "E5c: recutting the internal gate did not widen its 0138 ungranted floor");
  for (const verb of ["wake_list_fiscal_years", "wake_get_close_plan", "wake_get_close_readiness",
    "wake_verify_close", "wake_snapshot_state", "wake_dry_run_close_readiness"]) {
    assert.match(gateShape.prosrc, new RegExp(`['"]${verb}['"]`),
      `E5c/FOLD-2: the plain-read roster still names ${verb}`);
  }
});

// =====================================================================================
// §F -- the write TOCTOU and the account binding.
// =====================================================================================
test("p2a.F1 a bank WRITE refuses while its task is HELD, and stops refusing when it is running", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshTask({ status: "held" });
  const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  const err = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_match_bank_line", MATCH),
    matchArgs([], "p2a-f1")));
  assert.equal(err?.code, "CLR03", `F1: expected CLR03, got ${err?.code}: ${err?.message}`);
  assert.equal(reasonOf(err), "wake_task_not_running", `F1: expected wake_task_not_running, got ${err?.detail}`);
  // The control: the SAME call, the SAME credential, one status change. It must now get PAST the
  // gate -- proven by the refusal CHANGING, not by the call succeeding (the line id is fake, so
  // a later rung is exactly what is owed).
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  const err2 = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_match_bank_line", MATCH),
    matchArgs([], "p2a-f1b")));
  assert.notEqual(reasonOf(err2), "wake_task_not_running", "F1: a running task must clear the status arm of the gate");
});

test("p2a.F2 after a cancel the WRITES stop but the pack READ still clears the gate (FOLD-2's rule)", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshTask();
  const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  await rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);
  const werr = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_match_bank_line", MATCH),
    matchArgs([], "p2a-f2")));
  assert.equal(reasonOf(werr), "wake_task_not_running", `F2: a write after cancel_requested must refuse, got ${werr?.detail}`);
  const rerr = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, ACCT_A, RATIONALE, JSON.stringify(MODEL), opk("p2a-f2r")]));
  assert.notEqual(reasonOf(rerr), "wake_task_not_running",
    "F2: the READ must NOT be refused for status -- a cancelled pass may still see why it stopped");
});

test("p2a.F3 an act on ANOTHER of the client's bank accounts refuses; the task's own account passes", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshTask({ account: ACCT_A });
  const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  const err = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, ACCT_B, RATIONALE, JSON.stringify(MODEL), opk("p2a-f3")]));
  assert.equal(err?.code, "CLR03", `F3: expected CLR03, got ${err?.code}: ${err?.message}`);
  assert.equal(reasonOf(err), "wake_task_account_mismatch", `F3: expected wake_task_account_mismatch, got ${err?.detail}`);
  // Same client, same firm, same credential, live account -- ONLY the account differs. Without
  // this control the cell would pass just as well against a gate that refused everything.
  const ok = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, ACCT_A, RATIONALE, JSON.stringify(MODEL), opk("p2a-f3b")]));
  assert.notEqual(reasonOf(ok), "wake_task_account_mismatch", "F3: the task's OWN account must clear the account arm");
});

test("p2a.F3b the ADMITTED pack read's receipt names the task's account as its subject", async (t) => {
  if (gatePurpose(t)) return;
  // Its OWN account, minted here. bank_agent_receipts carries a partial unique index over
  // (act_kind, subject_id) WHERE outcome='admitted' -- at most ONE admitted pack_read per account,
  // ever -- so a cell that needs a genuine admission cannot reuse an account an earlier cell has
  // already read. Without this the cell would fail on a uniqueness collision and look like a gate
  // defect.
  // ck_coa_account_code_0009: NNNN..NNNNNNNN or NNN-[0-9A-Z]{2,4}. Four uppercase hex characters.
  const code = `172-${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
  await upsertAccountClassed(W.users.alice, { client: CLIENT, code, name: "HSBC current (p2a f3b)", type: "asset", opKey: opk("p2a-bcoa3") });
  const acct = idOf(await addBankAccount(W.users.alice, {
    client: CLIENT, coaAccountCode: code, accountNumber: `2003${randomUUID().slice(0, 8)}` }), "bank_account_id", "id");
  const { taskId } = await freshTask({ account: acct });
  const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  const key = opk("p2a-f3b-admit");
  const r = await wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, acct, RATIONALE, JSON.stringify(MODEL), key]);
  assert.match(r.rows[0].r.digest ?? "", /^[0-9a-f]{64}$/, "F3b: a real pack came back");
  const rec = (await rootQuery(
    "select subject_id, act_kind, outcome from clara.bank_agent_receipts where firm_id=$1 and op_key=$2", [FIRM, key])).rows[0];
  assert.ok(rec, "F3b: the pack read wrote its receipt");
  assert.equal(rec.act_kind, "pack_read");
  assert.equal(rec.outcome, "admitted");
  assert.equal(rec.subject_id, acct,
    "F3b: the receipt's subject IS the account the task was minted for -- the account-bound provenance the work order asks for");
});

test("p2a.F4 a task whose producing event carried NO bank_account_id refuses every act", async (t) => {
  if (gate(t)) return;
  // The producer contract, drilled from the failing side. #437 found it by a RED; this keeps it
  // found.
  await retireLiveBankWakeTasks({ firm: FIRM, client: CLIENT });
  forgetBankWakeTasks();
  const { taskId } = await makeBankWakeTask({ firm: FIRM, client: CLIENT, bankAccount: null, status: "running" });
  const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  for (const [verb, specs, params] of [
    ["wake_get_bank_pack", PACK, [CLIENT, ACCT_A, RATIONALE, JSON.stringify(MODEL), opk("p2a-f4a")]],
    ["wake_match_bank_line", MATCH, matchArgs([], "p2a-f4b")],
  ]) {
    const err = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper(verb, specs), params));
    assert.equal(reasonOf(err), "wake_task_account_unbound", `F4: ${verb} must refuse wake_task_account_unbound, got ${err?.detail}`);
  }
});

test("p2a.F4b payload UUID spelling is not account identity: nonexistent and cross-client accounts refuse", async (t) => {
  if (gate(t)) return;
  for (const [label, account] of [["nonexistent", randomUUID()], ["cross-client", ACCT_B]]) {
    // The cross-client arm is replaced below with an actually foreign account. Keeping both
    // cases in one loop makes their only difference the payload identity.
    let payloadAccount = account;
    if (label === "cross-client") {
      const otherCode = `173-${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
      await upsertAccountClassed(W.users.alice, { client: W.clients.A2, code: otherCode,
        name: "Foreign-client bank (p2a)", type: "asset", opKey: opk("p2a-foreign-coa") });
      payloadAccount = idOf(await addBankAccount(W.users.alice, {
        client: W.clients.A2, coaAccountCode: otherCode, accountNumber: `2999${randomUUID().slice(0, 8)}`,
      }), "bank_account_id", "id");
    }
    const { taskId } = await freshTask({ account: payloadAccount });
    const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
    const err = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret,
      callWrapper("wake_get_bank_pack", PACK),
      [CLIENT, ACCT_A, RATIONALE, JSON.stringify(MODEL), opk(`p2a-f4b-${label}`)]));
    assert.equal(reasonOf(err), "wake_task_account_incongruent",
      `F4b: ${label} payload UUID must refuse as unproven identity, got ${err?.detail}`);
  }
});

test("p2a.F4c a credential bound to a shared-kind WRONG-SOURCE task is refused again at the gate", async (t) => {
  if (gate(t)) return;
  await retireLiveBankWakeTasks({ firm: FIRM, client: CLIENT });
  const unrelated = await makeUnrelatedWakeTask({ firm: FIRM, client: CLIENT, bankAccount: ACCT_A });
  const secret = `${randomUUID()}${randomUUID()}`;
  await rootQuery(
    `insert into clara.wake_credentials(wake_kind,firm_id,client_id,secret_hash,expires_at,agent_task_id)
       values ('bank_agent',$1,$2,sha256(convert_to($3,'UTF8')),now()+interval '15 minutes',$4)`,
    [FIRM, CLIENT, secret, unrelated.taskId]);
  const err = await caught(() => wakeQuery(WAKE_ROLE, secret, callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, ACCT_A, RATIONALE, JSON.stringify(MODEL), opk("p2a-f4c")]));
  assert.equal(reasonOf(err), "wake_task_source_mismatch",
    `F4c: the transaction-local gate must independently prove source identity, got ${err?.detail}`);
});

test("p2a.F5 a subject that resolves to NO bank account is a refusal, never 'any account'", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshTask();
  const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  const err = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_match_bank_line", MATCH),
    matchArgs([randomUUID()], "p2a-f5")));
  assert.equal(reasonOf(err), "wake_act_account_unresolved",
    `F5: a line id that resolves to no bank account must refuse as unresolvable, got ${err?.detail}`);
  // THE CONTROL, and it is the discriminating half: the SAME credential on a subject that DOES
  // resolve is not refused for this reason. Without it the cell would pass just as well against
  // a gate that refused every act.
  const ok = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, ACCT_A, RATIONALE, JSON.stringify(MODEL), opk("p2a-f5b")]));
  assert.notEqual(reasonOf(ok), "wake_act_account_unresolved", "F5: a resolvable subject clears the arm");
});

test("p2a.F6 the CHAT lane is untouched: an interactive_client credential still clears the gate", async (t) => {
  if (gate(t)) return;
  // The single most consequential control in this file. Thirteen of the fourteen gated verbs are
  // also interactive_client doors; a gate that fired there would break chatTurn.v14's whole bank
  // tool set, and nothing else in this battery would notice.
  const cred = await mintPlain("interactive_client", FIRM, CLIENT, W.users.alice);
  const err = await caught(() => wakeQuery(ROLES.wakeInteractive, cred.rows[0].secret, callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, ACCT_A, RATIONALE, JSON.stringify(MODEL), opk("p2a-f6")]));
  for (const r of ["wake_task_unbound", "wake_task_not_running", "wake_task_account_mismatch",
                   "wake_task_account_unbound", "wake_act_account_unresolved", "wake_task_kind_mismatch"]) {
    assert.notEqual(reasonOf(err), r, `F6: the chat lane must never see the clocked lane's gate (${r})`);
  }
});

test("p2a.F6b all four formerly-exempt wrappers refuse task-A inputs/evidence targeting account B before core", async (t) => {
  if (gatePurpose(t)) return;
  // First produce durable pack evidence for B. Promotion has no account-shaped argument; its
  // inputs_digest must resolve through this receipt, whose subject_id is the account read.
  const taskB = await freshTask({ account: ACCT_B });
  const credB = await mintForTask("bank_agent", FIRM, CLIENT, taskB.taskId);
  const packB = await wakeQuery(WAKE_ROLE, credB.rows[0].secret, callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, ACCT_B, RATIONALE, JSON.stringify(MODEL), opk("p2a-f6b-pack-b")]);
  const digestB = packB.rows[0].r.digest;

  const taskA = await freshTask({ account: ACCT_A });
  const credA = await mintForTask("bank_agent", FIRM, CLIENT, taskA.taskId);
  const packA = await wakeQuery(WAKE_ROLE, credA.rows[0].secret, callWrapper("wake_get_bank_pack", PACK),
    [CLIENT, ACCT_A, RATIONALE, JSON.stringify(MODEL), opk("p2a-f6b-pack-a")]);
  const digestA = packA.rows[0].r.digest;
  const cases = [
    ["wake_add_bank_account", ADD_ACCOUNT,
      [CLIENT, BANKCOA2, null, "MBB", `3888${randomUUID().slice(0, 8)}`, "Target B", RATIONALE,
        JSON.stringify(MODEL), digestB, opk("p2a-f6b-add")], "wake_act_account_unresolved"],
    ["wake_upsert_account", UPSERT_ACCOUNT,
      [CLIENT, BANKCOA2, "Target B", "asset", null, null, RATIONALE,
        JSON.stringify(MODEL), digestB, opk("p2a-f6b-upsert")], "wake_task_account_mismatch"],
    ["wake_book_staff_advance_application", STAFF_ADVANCE,
      [CLIENT, "2026-08-30", "Target B staff advance",
        JSON.stringify([{ account_code: BANKCOA2, debit_cents: 100, credit_cents: 0 },
          { account_code: EXPN, debit_cents: 0, credit_cents: 100 }]), "[]", "advance", "test",
        RATIONALE, JSON.stringify(MODEL), digestB, opk("p2a-f6b-staff")], "wake_task_account_mismatch"],
    ["wake_propose_bank_identifier_promotion", PROMOTION,
      [CLIENT, randomUUID(), "bank_account", "8899041722", 1, RATIONALE,
        JSON.stringify(MODEL), digestB, opk("p2a-f6b-promotion")], "wake_task_account_mismatch"],
  ];
  for (const [verb, specs, params, want] of cases) {
    const beforeProposals = (await rootQuery("select count(*)::int as n from clara.bank_agent_proposals where client_id=$1", [CLIENT])).rows[0].n;
    const err = await caught(() => wakeQuery(WAKE_ROLE, credA.rows[0].secret, callWrapper(verb, specs), params));
    assert.equal(reasonOf(err), want, `F6b: ${verb} must refuse before its core, got ${err?.detail}`);
    const afterProposals = (await rootQuery("select count(*)::int as n from clara.bank_agent_proposals where client_id=$1", [CLIENT])).rows[0].n;
    assert.equal(afterProposals, beforeProposals, `F6b: ${verb} refusal reached no proposal-writing core`);
  }

  // RIGHT-ANSWER control for the evidence-derived verb: a pack receipt from this SAME task and
  // account clears the account gate. The deliberately absent counterparty may make the core
  // refuse later; either outcome proves the account derivation is not an always-refuse wall.
  const promotionControl = await caught(() => wakeQuery(WAKE_ROLE, credA.rows[0].secret,
    callWrapper("wake_propose_bank_identifier_promotion", PROMOTION),
    [CLIENT, randomUUID(), "bank_account", "8899041723", 1, RATIONALE,
      JSON.stringify(MODEL), digestA, opk("p2a-f6b-promotion-control")]));
  for (const gateReason of ["wake_act_account_unresolved", "wake_task_account_mismatch",
    "wake_task_account_unbound", "wake_task_account_incongruent"]) {
    assert.notEqual(reasonOf(promotionControl), gateReason,
      `F6b: same-task/same-account promotion evidence must clear ${gateReason}`);
  }
});

test("p2a.F6c multi-account staff lines and a foreign-client promotion receipt resolve to NULL and refuse; active COA identity is uniquely indexed", async (t) => {
  if (gatePurpose(t)) return;
  const indexDef = (await rootQuery(
    `select indexdef from pg_indexes
      where schemaname='clara' and tablename='bank_accounts'
        and indexname='uq_bank_accounts_coa_active'`)).rows[0]?.indexdef ?? "";
  assert.match(indexDef, /CREATE UNIQUE INDEX/i, "F6c: the active bank-account COA premise is UNIQUE");
  assert.match(indexDef, /\(client_id, coa_account_code\)/i,
    `F6c: uniqueness is exactly (client_id, coa_account_code), got ${indexDef}`);
  assert.match(indexDef, /WHERE active/i, `F6c: uniqueness is the active-row partial index, got ${indexDef}`);

  const taskA = await freshTask({ account: ACCT_A });
  const credA = await mintForTask("bank_agent", FIRM, CLIENT, taskA.taskId);
  const multiErr = await caught(() => wakeQuery(WAKE_ROLE, credA.rows[0].secret,
    callWrapper("wake_book_staff_advance_application", STAFF_ADVANCE),
    [CLIENT, "2026-08-30", "Two bank accounts are not one subject",
      JSON.stringify([{ account_code: BANKCOA1, debit_cents: 100, credit_cents: 0 },
        { account_code: BANKCOA2, debit_cents: 0, credit_cents: 100 }]),
      "[]", "advance", "test", RATIONALE, JSON.stringify(MODEL), "d", opk("p2a-f6c-two")],
  ));
  assert.equal(reasonOf(multiErr), "wake_act_account_unresolved",
    `F6c: two distinct active bank accounts must derive NULL and refuse, got ${multiErr?.detail}`);

  const foreignClient = W.clients.A2;
  const foreignCode = `174-${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
  await upsertAccountClassed(W.users.alice, { client: foreignClient, code: foreignCode,
    name: "Foreign receipt account (p2a)", type: "asset", opKey: opk("p2a-f6c-foreign-coa") });
  const foreignAccount = idOf(await addBankAccount(W.users.alice, {
    client: foreignClient, coaAccountCode: foreignCode, accountNumber: `4777${randomUUID().slice(0, 8)}`,
  }), "bank_account_id", "id");
  const { consentEvidenceDoc } = await import("./wave-b/wb-0020-helpers.mjs");
  const evidence = await consentEvidenceDoc(W.users.alice, { firm: FIRM });
  const consent = await rootQuery(
    `insert into clara.client_egress_purpose_consents(firm_id, client_id, purpose, scope_note, evidence_document_id, granted_by)
       values ($1,$2,'bank_matching','p2a foreign receipt consent',$3,$4) returning id`,
    [FIRM, foreignClient, evidence.documentId, W.users.alice]);
  await rootQuery(
    `insert into clara.client_egress_purpose_activations(firm_id, client_id, purpose, consent_id, activated_by)
       values ($1,$2,'bank_matching',$3,$4)`,
    [FIRM, foreignClient, consent.rows[0].id, W.users.alice]);
  await retireLiveBankWakeTasks({ firm: FIRM, client: foreignClient });
  const foreignTask = await makeBankWakeTask({ firm: FIRM, client: foreignClient,
    bankAccount: foreignAccount, status: "running" });
  const foreignCred = await mintForTask("bank_agent", FIRM, foreignClient, foreignTask.taskId);
  const foreignPack = await wakeQuery(WAKE_ROLE, foreignCred.rows[0].secret,
    callWrapper("wake_get_bank_pack", PACK),
    [foreignClient, foreignAccount, RATIONALE, JSON.stringify(MODEL), opk("p2a-f6c-foreign-pack")]);
  const foreignDigest = foreignPack.rows[0].r.digest;
  const foreignErr = await caught(() => wakeQuery(WAKE_ROLE, credA.rows[0].secret,
    callWrapper("wake_propose_bank_identifier_promotion", PROMOTION),
    [CLIENT, randomUUID(), "bank_account", "8899041799", 1, RATIONALE,
      JSON.stringify(MODEL), foreignDigest, opk("p2a-f6c-foreign-promotion")],
  ));
  assert.equal(reasonOf(foreignErr), "wake_act_account_unresolved",
    `F6c: a receipt belonging to another client must not resolve promotion authority, got ${foreignErr?.detail}`);
});

test("p2a.F7 CENSUS: all fourteen bank wrappers carry exactly one gate call, and the gate is ungranted", async (t) => {
  if (gate(t)) return;
  const rows = (await rootQuery(
    `select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname in
        ('wake_add_bank_account','wake_book_staff_advance_application','wake_complete_bank_reconciliation',
         'wake_get_bank_pack','wake_match_bank_line','wake_propose_bank_identifier_promotion',
         'wake_propose_bank_line_exception','wake_resolve_and_book_bank_line','wake_resolve_bank_line_exception',
         'wake_settle_from_bank_line','wake_unmatch_bank_match','wake_upsert_account',
         'wake_void_bank_reconciliation','wake_void_bank_statement')`)).rows;
  assert.equal(rows.length, 14, "F7: the closed world is fourteen wrappers -- an overload or a rename fails here");
  for (const r of rows) {
    const hits = r.prosrc.match(/_bank_wake_task_gate\(/g) ?? [];
    assert.equal(hits.length, 1, `F7: ${r.proname} must call the gate exactly once (found ${hits.length})`);
    const call = r.prosrc.slice(r.prosrc.indexOf("_bank_wake_task_gate("));
    const args = call.slice(0, call.indexOf(");") + 1);
    assert.match(args, /,\s*true\s*\)\s*;?$/,
      `F7: ${r.proname} must fail closed when its account derivation is unavailable or non-unique`);
    if (r.proname === "wake_get_bank_pack") {
      assert.match(args, /,\s*false\s*,/, "F7: the pack READ must not demand a running task (FOLD-2)");
    } else {
      assert.match(args, /,\s*true\s*,/, `F7: ${r.proname} is a WRITE and must demand a running task`);
    }
    // POSITION, pinned. The gate must be the LAST statement before the core call. Ahead of the
    // wrapper's own client-pin / op_key / rationale checks it MASKS them -- a cross-client call
    // would refuse for the gate's reason instead of credential_client_pin, which is the
    // right-conclusion-wrong-reason class. Nothing else in this battery would see that.
    // `args` ends at the gate call's closing paren, so what follows starts with its semicolon.
    const after = r.prosrc.slice(r.prosrc.indexOf(args) + args.length);
    assert.match(after, /^;\s*return clara\._agent_/,
      `F7: ${r.proname}'s gate must sit immediately before its core call, not ahead of the wrapper's own refusals`);
  }
  const grants = (await rootQuery(
    `select count(*)::int as n from pg_roles r where r.rolname like 'clara\\_%' and r.rolname <> 'clara_fn_owner'
       and has_function_privilege(r.rolname, 'clara._bank_wake_task_gate(text,uuid,boolean,boolean)'::regprocedure, 'EXECUTE')`)).rows[0].n;
  assert.equal(grants, 0, "F7: the gate is reachable only from inside the SECURITY DEFINER wrappers");
});
