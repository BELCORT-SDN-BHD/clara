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
  BANKCOA1, AR1, AP1, EXPN, REVN, hasBankMatching, caught, addBankAccount,
} from "./x38-match-fixtures.mjs";
import { wakeQuery, ROLES } from "./rig-helpers.mjs";
import { WAKE_ROLE, RATIONALE, MODEL, callWrapper } from "./f-a3-pr1b-wake-fixtures.mjs";
import {
  hasG1Pr2a, makeBankWakeTask, retireLiveBankWakeTasks, forgetBankWakeTasks,
} from "./g1-pr-2a-fixtures.mjs";

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
const EXC = [{ name: "p_line", cast: "uuid" }, { name: "p_kind" }, { name: "p_reason" },
  { name: "p_evidence_document", cast: "uuid" }, { name: "p_rationale" },
  { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }];

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
  await upsertAccountClassed(sub, { client: CLIENT, code: BANKCOA1, name: "Maybank current (p2a)", type: "asset", opKey: opk("p2a-bcoa") });
  await upsertAccountClassed(sub, { client: CLIENT, code: AR1, name: "Trade Debtors (p2a)", type: "asset", accountClass: "receivable", opKey: opk("p2a-ar") });
  await upsertPayableAccount(sub, { client: CLIENT, code: AP1, name: "Trade Creditors (p2a)", opKey: opk("p2a-ap") });
  await upsertAccountClassed(sub, { client: CLIENT, code: EXPN, name: "Prof Fees (p2a)", type: "expense", opKey: opk("p2a-exp") });
  await upsertAccountClassed(sub, { client: CLIENT, code: REVN, name: "Revenue (p2a)", type: "income", opKey: opk("p2a-rev") });
  await grantConsent(sub, { firm: FIRM, client: CLIENT }).catch(() => {});
  ACCT_A = idOf(await addBankAccount(sub, { client: CLIENT, coaAccountCode: BANKCOA1, accountNumber: `2001${randomUUID().slice(0, 8)}` }), "bank_account_id", "id");
  ACCT_B = idOf(await addBankAccount(sub, { client: CLIENT, coaAccountCode: BANKCOA1, accountNumber: `2002${randomUUID().slice(0, 8)}` }), "bank_account_id", "id");
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
test("p2a.E1 mint_wake_credential('bank_agent') REFUSES with no live wake task, and BINDS the one there is", async (t) => {
  if (gate(t)) return;
  await retireLiveBankWakeTasks({ firm: FIRM, client: CLIENT });
  forgetBankWakeTasks();
  const err = await caught(() => mintPlain("bank_agent", FIRM, CLIENT));
  assert.ok(err, "E1: a bank_agent mint with no live wake task must refuse");
  assert.equal(err.code, "CLR10", `E1: expected CLR10, got ${err.code}: ${err.message}`);
  assert.equal(reasonOf(err), "bank_agent_task_absent", `E1: expected bank_agent_task_absent, got ${err.detail}`);
  // POSITIVE CONTROL, and it is what makes the refusal above mean what it says: the ONLY thing
  // that changed is that a task now exists.
  const { taskId } = await freshTask();
  const ok = await mintPlain("bank_agent", FIRM, CLIENT);
  const bound = (await rootQuery("select agent_task_id from clara.wake_credentials where id=$1", [ok.rows[0].credential_id])).rows[0];
  assert.equal(bound.agent_task_id, taskId, "E1: the minted credential names THIS task -- derived by the database, never supplied");
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
  // POSITIVE CONTROL on the same row: close_prep still works through the same door, unchanged.
  const okClose = await mintForTask("close_prep", FIRM, CLIENT, closeTask);
  assert.ok(okClose.rows[0].secret, "E4: close_prep's own path through the widened door is unmoved");
});

// =====================================================================================
// §F -- the write TOCTOU and the account binding.
// =====================================================================================
test("p2a.F1 a bank WRITE refuses while its task is HELD, and stops refusing when it is running", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshTask({ status: "held" });
  const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  const err = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_propose_bank_line_exception", EXC),
    [randomUUID(), "bank_error", "r", null, RATIONALE, JSON.stringify(MODEL), "d", opk("p2a-f1")]));
  assert.equal(err?.code, "CLR03", `F1: expected CLR03, got ${err?.code}: ${err?.message}`);
  assert.equal(reasonOf(err), "wake_task_not_running", `F1: expected wake_task_not_running, got ${err?.detail}`);
  // The control: the SAME call, the SAME credential, one status change. It must now get PAST the
  // gate -- proven by the refusal CHANGING, not by the call succeeding (the line id is fake, so
  // a later rung is exactly what is owed).
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  const err2 = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_propose_bank_line_exception", EXC),
    [randomUUID(), "bank_error", "r", null, RATIONALE, JSON.stringify(MODEL), "d", opk("p2a-f1b")]));
  assert.notEqual(reasonOf(err2), "wake_task_not_running", "F1: a running task must clear the status arm of the gate");
});

test("p2a.F2 after a cancel the WRITES stop but the pack READ still clears the gate (FOLD-2's rule)", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshTask();
  const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  await rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);
  const werr = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_propose_bank_line_exception", EXC),
    [randomUUID(), "bank_error", "r", null, RATIONALE, JSON.stringify(MODEL), "d", opk("p2a-f2")]));
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
  const acct = idOf(await addBankAccount(W.users.alice, {
    client: CLIENT, coaAccountCode: BANKCOA1, accountNumber: `2003${randomUUID().slice(0, 8)}` }), "bank_account_id", "id");
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
    ["wake_propose_bank_line_exception", EXC, [randomUUID(), "bank_error", "r", null, RATIONALE, JSON.stringify(MODEL), "d", opk("p2a-f4b")]],
  ]) {
    const err = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper(verb, specs), params));
    assert.equal(reasonOf(err), "wake_task_account_unbound", `F4: ${verb} must refuse wake_task_account_unbound, got ${err?.detail}`);
  }
});

test("p2a.F5 a subject that resolves to NO bank account is a refusal, never 'any account'", async (t) => {
  if (gate(t)) return;
  const { taskId } = await freshTask();
  const cred = await mintForTask("bank_agent", FIRM, CLIENT, taskId);
  const err = await caught(() => wakeQuery(WAKE_ROLE, cred.rows[0].secret, callWrapper("wake_propose_bank_line_exception", EXC),
    [randomUUID(), "bank_error", "r", null, RATIONALE, JSON.stringify(MODEL), "d", opk("p2a-f5")]));
  assert.equal(reasonOf(err), "wake_act_account_unresolved",
    `F5: an unknown line must refuse as unresolvable, got ${err?.detail}`);
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
  const noAccount = new Set(["wake_add_bank_account", "wake_upsert_account",
    "wake_book_staff_advance_application", "wake_propose_bank_identifier_promotion"]);
  for (const r of rows) {
    const hits = r.prosrc.match(/_bank_wake_task_gate\(/g) ?? [];
    assert.equal(hits.length, 1, `F7: ${r.proname} must call the gate exactly once (found ${hits.length})`);
    const call = r.prosrc.slice(r.prosrc.indexOf("_bank_wake_task_gate("));
    const args = call.slice(0, call.indexOf(");") + 1);
    const required = /,\s*true\s*\)\s*;?$/.test(args.trim());
    assert.equal(!noAccount.has(r.proname), required,
      `F7: ${r.proname}'s account-required flag disagrees with the four verbs that HAVE no account subject`);
    if (r.proname === "wake_get_bank_pack") {
      assert.match(args, /,\s*false\s*,/, "F7: the pack READ must not demand a running task (FOLD-2)");
    } else {
      assert.match(args, /,\s*true\s*,/, `F7: ${r.proname} is a WRITE and must demand a running task`);
    }
    // POSITION, pinned. The gate must be the LAST statement before the core call. Ahead of the
    // wrapper's own client-pin / op_key / rationale checks it MASKS them -- a cross-client call
    // would refuse for the gate's reason instead of credential_client_pin, which is the
    // right-conclusion-wrong-reason class. Nothing else in this battery would see that.
    const after = r.prosrc.slice(r.prosrc.indexOf(args) + args.length);
    assert.match(after, /^\s*\n?\s*return clara\._agent_/,
      `F7: ${r.proname}'s gate must sit immediately before its core call, not ahead of the wrapper's own refusals`);
  }
  const grants = (await rootQuery(
    `select count(*)::int as n from pg_roles r where r.rolname like 'clara\\_%' and r.rolname <> 'clara_fn_owner'
       and has_function_privilege(r.rolname, 'clara._bank_wake_task_gate(text,uuid,boolean,boolean)'::regprocedure, 'EXECUTE')`)).rows[0].n;
  assert.equal(grants, 0, "F7: the gate is reachable only from inside the SECURITY DEFINER wrappers");
});
