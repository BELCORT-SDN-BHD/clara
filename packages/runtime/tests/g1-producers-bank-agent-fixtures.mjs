// Shared fixtures for the bank_agent producer battery (g1-producers-bank-agent.test.mjs +
// g1-producers-bank-agent-security.test.mjs — split at the G1 PR-2b fold for the 500-line
// module budget, the same reason g1-wake-bank-fixtures.mjs split out of its own test file).
//
// See reconciler-bank-agent.mjs's own module header for the due_key/reason contract this stub
// implements.

import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery, opk } from "./relay-fixtures.mjs";

export const BANK_COA = "1060"; // ck_coa_account_code_0009: plain 4-8 digits or NNN-XXXX.
export const BANK_CODE = "MBB"; // clara.bank_institutions — Maybank, seeded and active on every rig.

export async function hasEmitDoor() {
  const r = await rootQuery("select to_regprocedure('clara.emit_bank_agent_due(uuid,uuid,text,text)') is not null as ok");
  return r.rows[0]?.ok === true;
}

export const STUB_EVENT_TYPE = "bank.agent_due";

export async function ensureBankAgentDueEventType() {
  await rootQuery(
    `insert into clara.event_types (name, client_scoped, description)
       values ($1, true, 'g1 pr-2b rig stub -- registered here pending lane g1-pr2-db''s own migration')
     on conflict (name) do nothing`,
    [STUB_EVENT_TYPE],
  );
  await rootQuery(
    `insert into clara.trigger_taxonomy (version, event_type, decision)
       select a.version, $1, 'internal_task' from clara.taxonomy_active a
     on conflict (version, event_type) do nothing`,
    [STUB_EVENT_TYPE],
  );
}

/** A SECOND, firm-scoped event type — the negative control for the CLR10 client-scope refusal. */
export const STUB_FIRM_LEVEL_TYPE = "g1pr2b.test.firm_level_due";
export async function ensureFirmLevelStubType() {
  await rootQuery(
    `insert into clara.event_types (name, client_scoped, description)
       values ($1, false, 'g1 pr-2b rig stub -- a FIRM-level type, deliberately, for the CLR10 negative control')
     on conflict (name) do nothing`,
    [STUB_FIRM_LEVEL_TYPE],
  );
  await rootQuery(
    `insert into clara.trigger_taxonomy (version, event_type, decision)
       select a.version, $1, 'internal_task' from clara.taxonomy_active a
     on conflict (version, event_type) do nothing`,
    [STUB_FIRM_LEVEL_TYPE],
  );
}

/** The stub `bank_agent_run_due(uuid)`: a rig-only table drives the reply per client, carrying
 *  the HIGH-1/HIGH-3 shape — {due, reason, bank_account_id, due_key} — so this battery can drive
 *  every branch of the closed reason switch and the DB-owned claim without a real predicate. */
export async function ensureBankAgentRunDueStub() {
  await rootQuery(`
    create table if not exists clara._test_g1pr2b_bank_due_stub (
      client_id uuid primary key,
      due boolean not null default false,
      reason text,
      bank_account_id uuid,
      due_key text
    )
  `);
  await rootQuery("grant select on clara._test_g1pr2b_bank_due_stub to clara_runtime");
  await rootQuery(`
    create or replace function clara.bank_agent_run_due(p_client uuid) returns jsonb
      language sql stable as $$
      select coalesce(
        (select jsonb_strip_nulls(jsonb_build_object(
                  'due', due, 'reason', reason, 'bank_account_id', bank_account_id, 'due_key', due_key))
         from clara._test_g1pr2b_bank_due_stub where client_id = p_client),
        jsonb_build_object('due', false, 'reason', 'nothing_due')
      );
    $$
  `);
  await rootQuery("grant execute on function clara.bank_agent_run_due(uuid) to clara_runtime");
}

/** Every test starts from an EMPTY stub table — otherwise an earlier test's due client (still
 *  'active' in clara.clients forever) stays due forever too, and produceBankAgentWakes' own
 *  activeClientIds() scan (every active client on the whole rig) would re-examine it on a LATER
 *  test's tick. Found empirically while building this battery, not assumed. */
export async function resetDueStub() {
  await rootQuery("delete from clara._test_g1pr2b_bank_due_stub");
}

export async function stubReply(clientId, reply) {
  await rootQuery(
    `insert into clara._test_g1pr2b_bank_due_stub (client_id, due, reason, bank_account_id, due_key)
       values ($1, $2, $3, $4, $5)
     on conflict (client_id) do update set due=excluded.due, reason=excluded.reason,
       bank_account_id=excluded.bank_account_id, due_key=excluded.due_key`,
    [clientId, reply.due, reply.reason ?? null, reply.bank_account_id ?? null, reply.due_key ?? null],
  );
}

export async function setBankAgentEnabled(on, actor) {
  await rootQuery(
    `update clara.wake_engine_sources set enabled=$1,
        enabled_by = case when $1 then $2 else enabled_by end,
        enabled_at = case when $1 then now() else enabled_at end
      where source_key='bank_agent'`,
    [on, actor ?? null],
  );
}

/** One active bank account for a fresh client, through the ONE audited writer chain
 *  (upsert_account for the COA row, then add_bank_account) — mirrors g1-wake-bank-fixtures.mjs's
 *  own §1/§2, minus the consent/activation pair that file builds for LATER agent-verb calls this
 *  battery never makes (add_bank_account itself is a plain bookkeeper-floor human verb, no
 *  Tier-A gate). */
export async function buildActiveBankAccount(w, suffix) {
  const coaCode = BANK_COA;
  await humanQuery(w.owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r", [
    w.client, coaCode, `Maybank Current (g1pr2b ${suffix})`, "asset", opk(`g1pr2b-coa-${suffix}`),
  ]);
  const acctNumber = `109${randomUUID().slice(0, 8).replace(/[a-f]/g, "1")}`;
  const r = await humanQuery(
    w.owner,
    `select clara.add_bank_account(p_client=>$1,p_coa_account_code=>$2,p_bank_code=>$3,
       p_account_number=>$4,p_bank_name_display=>$5,p_op_key=>$6) as r`,
    [w.client, coaCode, BANK_CODE, acctNumber, `Maybank Current ${suffix}`, opk(`g1pr2b-bank-${suffix}`)],
  );
  return r.rows[0].r.bank_account_id;
}

/** The domain_events row(s) this belt appended for a given account — read directly, never
 *  through wake_intents/agent_tasks (a SEPARATE, already-proven pipeline phase this belt does
 *  not touch and this battery does not invoke). */
export async function eventsFor(bankAccountId) {
  const r = await rootQuery(
    `select id, client_id, payload from clara.domain_events
      where event_type = 'bank.agent_due' and payload ->> 'bank_account_id' = $1
      order by id`,
    [bankAccountId],
  );
  return r.rows;
}
