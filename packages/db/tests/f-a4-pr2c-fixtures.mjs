// F-A4 PR-2c close-prep chat lane fixtures. Not a test file: the battery imports this core so
// both shipping files remain below the repository's 500-line convention.
// CONTRACT-BLIND: readiness and every behavioural claim are read from the live database.

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, opk,
} from "./wave-a-fixtures.mjs";
import { beginClose } from "./x56-fixtures.mjs";
import {
  WRAPPERS, RATIONALE, MODEL, derivedOpKey, callWake, mintClosePrepSession, tokens,
} from "./f-a4-pr1c-fixtures.mjs";

export const CHAT_RATIONALE = "f-a4-pr2c battery: attended close-prep chat judgement";
export const UUID_SPEC = { cast: "uuid" };
export const TRIPLE = [
  { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" },
];

export async function hasPR2C() {
  const r = await rootQuery(
    `select to_regprocedure(
              'clara.mint_chat_close_credential(uuid,uuid,uuid,uuid,interval)') is not null as mint,
            to_regprocedure(
              'clara._assert_wake_task_congruent(uuid,uuid,uuid,text,uuid)') is not null as task_floor,
            to_regprocedure(
              'clara._assert_attended_close_floor(text,uuid,uuid)') is not null as human_floor,
            (select count(*)::int from clara.wake_fn_allowlist
              where wake_kind='interactive_client' and function_name = any($1::text[])) = 12
              as allowlist`,
    [WRAPPERS]);
  return Object.values(r.rows[0]).every(Boolean);
}

/** A real chat session and queued chat_turn task. Like begin_chat_turn, it stamps created_by;
 * the task trigger independently derives firm/client from the session. */
export async function createChatTask(firm, client, onBehalfOf) {
  const q = await rootQuery(
    `insert into clara.chat_sessions(firm_id,client_id,created_by,visibility)
       values($1,$2,$3,'private') returning id`,
    [firm, client, onBehalfOf]);
  const t = await rootQuery(
    `insert into clara.agent_tasks(session_id,kind,status,created_by,model_snapshot)
       values($1,'chat_turn','queued',$2,$3) returning id,firm_id,client_id`,
    [q.rows[0].id, onBehalfOf, JSON.stringify(MODEL)]);
  const row = t.rows[0];
  if (row.firm_id !== firm || row.client_id !== client) {
    throw new Error("chat task trigger did not derive the session's exact firm/client");
  }
  return { session: q.rows[0].id, task: row.id };
}

export async function mintChatCloseSession(firm, client, onBehalfOf) {
  const task = await createChatTask(firm, client, onBehalfOf);
  const c = await rootQuery(
    `select * from clara.mint_chat_close_credential(
       p_firm=>$1,p_client=>$2,p_agent_task=>$3,p_on_behalf_of=>$4,
       p_ttl=>'00:30:00'::interval)`,
    [firm, client, task.task, onBehalfOf]);
  return {
    ...task, credentialId: c.rows[0].credential_id, secret: c.rows[0].secret,
    onBehalfOf,
  };
}

export async function mintLegacy(kind, firm, onBehalfOf, client) {
  const c = await rootQuery(
    `select * from clara.mint_wake_credential(
       p_wake_kind=>$1,p_firm=>$2,p_on_behalf_of=>$3,
       p_ttl=>'00:30:00'::interval,p_client=>$4)`,
    [kind, firm, onBehalfOf, client]);
  return { credentialId: c.rows[0].credential_id, secret: c.rows[0].secret };
}

export function listFy(session, client, opKey = null) {
  return callWake(session.secret, "wake_list_fiscal_years",
    [{ name: "p_client", ...UUID_SPEC }, ...TRIPLE],
    [client, CHAT_RATIONALE, JSON.stringify(MODEL),
      opKey ?? derivedOpKey(session.task, "wake_list_fiscal_years", client)]);
}

export function getPlan(session, fy, opKey = null) {
  return callWake(session.secret, "wake_get_close_plan",
    [{ name: "p_fiscal_year_id", ...UUID_SPEC }, ...TRIPLE],
    [fy, CHAT_RATIONALE, JSON.stringify(MODEL),
      opKey ?? derivedOpKey(session.task, "wake_get_close_plan", fy)]);
}

export function begin(session, fy, opKey = null) {
  return callWake(session.secret, "wake_begin_close",
    [{ name: "p_fy", ...UUID_SPEC }, ...TRIPLE],
    [fy, CHAT_RATIONALE, JSON.stringify(MODEL),
      opKey ?? derivedOpKey(session.task, "wake_begin_close", fy)]);
}

export function openFy(session, client, label, startsOn, opKey = null) {
  return callWake(session.secret, "wake_open_fiscal_year",
    [{ name: "p_client", ...UUID_SPEC }, { name: "p_label" },
      { name: "p_starts_on", cast: "date" }, ...TRIPLE],
    [client, label, startsOn, CHAT_RATIONALE, JSON.stringify(MODEL),
      opKey ?? derivedOpKey(session.task, "wake_open_fiscal_year", client)]);
}

export const caughtShape = (e) => ({
  code: e?.code, detail: e?.detail, message: e?.message,
});

/** The design's "refusal token": SQLSTATE plus the structured DETAIL bytes. Message wording is
 * compared separately only where the amended design expressly requires it (cell 6). */
export const refusalToken = (e) => JSON.stringify({ code: e?.code, detail: e?.detail ?? null });

export async function completeChatTask(task) {
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [task]);
  await rootQuery("update clara.agent_tasks set status='completed' where id=$1", [task]);
}

/** The existing PR-1c G0 walk, normalized to deterministic status + sorted rung tokens. It uses
 * only close_prep credentials (obo NULL), so A8 must be a literal no-op on all twelve wrappers. */
export async function walkClockedAllTwelve(sc) {
  const fresh = () => mintClosePrepSession(sc.firm, sc.client);
  const fired = [];
  const call = async (subject, name, specs, extra) => {
    const s = await fresh();
    // Cell 2 isolates A8. Ask the live, ungranted helper for its key so the M5 hash mutant leaves
    // this MUST-NOT-RED control green; cell 1 independently derives the key and is M5's sole red.
    const expected = await rootQuery(
      "select clara._close_expected_op_key($1,$2,$3) as k", [s.task, name, subject]);
    return callWake(s.secret, name, specs,
      [...extra, RATIONALE, JSON.stringify(MODEL), expected.rows[0].k]);
  };
  fired.push(["wake_list_fiscal_years", await call(sc.client, "wake_list_fiscal_years",
    [{ name: "p_client", ...UUID_SPEC }, ...TRIPLE], [sc.client])]);
  fired.push(["wake_get_close_plan", await call(sc.fy, "wake_get_close_plan",
    [{ name: "p_fiscal_year_id", ...UUID_SPEC }, ...TRIPLE], [sc.fy])]);
  fired.push(["wake_get_close_readiness", await call(sc.fy, "wake_get_close_readiness",
    [{ name: "p_client", ...UUID_SPEC }, { name: "p_fy", ...UUID_SPEC }, ...TRIPLE],
    [sc.client, sc.fy])]);
  fired.push(["wake_dry_run_close_readiness", await call(sc.fy,
    "wake_dry_run_close_readiness",
    [{ name: "p_client", ...UUID_SPEC }, { name: "p_fy", ...UUID_SPEC }, ...TRIPLE],
    [sc.client, sc.fy])]);
  const minted = await call(sc.client, "wake_mint_month_snapshot",
    [{ name: "p_client", ...UUID_SPEC }, { name: "p_month_start", cast: "date" }, ...TRIPLE],
    [sc.client, "2025-02-01"]);
  fired.push(["wake_mint_month_snapshot", minted]);
  fired.push(["wake_snapshot_state", await call(minted.result.snapshot_id,
    "wake_snapshot_state", [{ name: "p_snapshot", ...UUID_SPEC }, ...TRIPLE],
    [minted.result.snapshot_id])]);
  fired.push(["wake_run_depreciation_catchup", await call(sc.client,
    "wake_run_depreciation_catchup",
    [{ name: "p_client", ...UUID_SPEC }, { name: "p_through", cast: "date" }, ...TRIPLE],
    [sc.client, "2025-12-31"])]);
  const begun = await call(sc.fy, "wake_begin_close",
    [{ name: "p_fy", ...UUID_SPEC }, ...TRIPLE], [sc.fy]);
  fired.push(["wake_begin_close", begun]);
  const run = begun.result.close_run_id;
  fired.push(["wake_propose_close", await call(run, "wake_propose_close",
    [{ name: "p_close_run", ...UUID_SPEC }, { name: "p_drafted", cast: "jsonb" },
      { name: "p_narrative" }, ...TRIPLE], [run, JSON.stringify([]), "nothing outstanding"])]);
  fired.push(["wake_abandon_close", await call(run, "wake_abandon_close",
    [{ name: "p_close_run", ...UUID_SPEC }, { name: "p_reason" }, ...TRIPLE],
    [run, "pr2c G0: done measuring"])]);
  const humanRun = await beginClose(sc.alice, { fy: sc.fy });
  if (!humanRun.close_run_id) throw new Error("clocked walk: human begin returned no run");
  const fin = await humanQuery(sc.alice, "select clara.finalize_close($1,$2,$3) as r",
    [sc.fy, "pr2c G0 self-attestation", opk("fa4pr2c-g0fin")]);
  const receipt = fin.rows[0].r.receipt_id ?? fin.rows[0].r.close_receipt_id;
  await call(sc.client, "wake_open_fiscal_year",
    [{ name: "p_client", ...UUID_SPEC }, { name: "p_label" },
      { name: "p_starts_on", cast: "date" }, ...TRIPLE],
    [sc.client, "FY2026 expected refusal", "2026-01-01"]);
  await humanQuery(sc.alice, "select clara.set_client_fy_end($1,$2,$3,$4) as r",
    [sc.client, 12, 31, opk("fa4pr2c-g0fye")]);
  fired.push(["wake_open_fiscal_year", await call(sc.client, "wake_open_fiscal_year",
    [{ name: "p_client", ...UUID_SPEC }, { name: "p_label" },
      { name: "p_starts_on", cast: "date" }, ...TRIPLE],
    [sc.client, "FY2026 agent-opened", "2026-01-01"])]);
  fired.push(["wake_verify_close", await call(receipt, "wake_verify_close",
    [{ name: "p_receipt", ...UUID_SPEC }, ...TRIPLE], [receipt])]);
  if (fired.length !== WRAPPERS.length) throw new Error("clocked walk did not fire all wrappers");
  return fired.map(([name, answer]) => ({ name, status: answer.status, tokens: tokens(answer),
    receiptId: answer.receipt_id })).sort((a, b) => a.name.localeCompare(b.name));
}

export const freshUuid = () => randomUUID();

/** Shared live-catalog instrument for battery cell 8 and the additive PR-1c census arm. */
export async function assertPR2CWallCensus() {
  // interactive_client is shared across domains (bank/freeform/question wrappers already carry
  // rows under it) -- scope to the close roster by function_name, never a bare kind select.
  const allow = await rootQuery(
    `select function_name from clara.wake_fn_allowlist
      where wake_kind='interactive_client' and function_name = any($1::text[])
      order by function_name`,
    [WRAPPERS]);
  assert.deepEqual(allow.rows.map((r) => r.function_name), [...WRAPPERS].sort());
  const grants = await rootQuery(
    `select p.proname,
            case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end as grantee
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where n.nspname='clara'
        and p.proname in ('mint_chat_close_credential','_assert_wake_task_congruent',
                          '_assert_attended_close_floor')
        and a.privilege_type='EXECUTE' and a.grantee<>p.proowner order by 1,2`);
  assert.deepEqual(grants.rows,
    [{ proname: "mint_chat_close_credential", grantee: "clara_runtime" }]);
  const shared = await rootQuery(
    `select sig from unnest(array[
      'clara.wake_list_fiscal_years(uuid,text,jsonb,text)',
      'clara.wake_get_close_plan(uuid,text,jsonb,text)',
      'clara.wake_get_close_readiness(uuid,uuid,text,jsonb,text)',
      'clara.wake_verify_close(uuid,text,jsonb,text)',
      'clara.wake_snapshot_state(uuid,text,jsonb,text)',
      'clara.wake_dry_run_close_readiness(uuid,uuid,text,jsonb,text)',
      'clara.wake_open_fiscal_year(uuid,text,date,text,jsonb,text)',
      'clara.wake_begin_close(uuid,text,jsonb,text)',
      'clara.wake_abandon_close(uuid,text,text,jsonb,text)',
      'clara.wake_propose_close(uuid,jsonb,text,text,jsonb,text)',
      'clara.wake_run_depreciation_catchup(uuid,date,text,jsonb,text)',
      'clara.wake_mint_month_snapshot(uuid,date,text,jsonb,text)']::text[]) sig
      where not has_function_privilege('clara_wake_interactive',sig,'EXECUTE')`);
  assert.deepEqual(shared.rows, [], "shared interactive role executes every exact wrapper");
  const reserved = await rootQuery(
    `with r as (select rolname from pg_roles where rolname like 'clara_wake!_%' escape '!'),
          f(sig) as (values
            ('clara.finalize_close(uuid,text,text)'),
            ('clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'),
            ('clara.attest_close_exception(uuid,text,text,text,text,uuid)'),
            ('clara.settle_close_proposal(uuid,text,text,text)'),
            ('clara.hold_close_prep(uuid,text,text)'),
            ('clara.release_close_prep(uuid,text,text)'))
       select r.rolname,f.sig from r cross join f
        where has_function_privilege(r.rolname,f.sig,'EXECUTE') order by 1,2`);
  assert.deepEqual(reserved.rows, [], "every extant wake role reaches zero reserved/hold doors");
}
