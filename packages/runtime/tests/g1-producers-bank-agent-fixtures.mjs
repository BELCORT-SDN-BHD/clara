// Shared fixtures for the bank_agent producer battery (g1-producers-bank-agent.test.mjs +
// g1-producers-bank-agent-security.test.mjs — split at the G1 PR-2b fold for the 500-line
// module budget, the same reason g1-wake-bank-fixtures.mjs split out of its own test file).
//
// See reconciler-bank-agent.mjs's own module header for the subject_id/reason contract this stub
// implements.

import { randomUUID, createHash } from "node:crypto";
import { rootQuery, humanQuery, opk } from "./relay-fixtures.mjs";

export const BANK_COA = "1060"; // ck_coa_account_code_0009: plain 4-8 digits or NNN-XXXX.
export const BANK_CODE = "MBB"; // clara.bank_institutions — Maybank, seeded and active on every rig.

export async function hasEmitDoor() {
  const r = await rootQuery("select to_regprocedure('clara.emit_bank_agent_due(uuid,uuid,uuid,text)') is not null as ok");
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
 *  the HIGH-1/HIGH-3 shape — {due, reason, bank_account_id, subject_id} — so this battery can drive
 *  every branch of the closed reason switch and the DB-owned claim without a real predicate. */
export async function ensureBankAgentRunDueStub() {
  await rootQuery(`
    create table if not exists clara._test_g1pr2b_bank_due_stub (
      client_id uuid primary key,
      due boolean not null default false,
      reason text,
      bank_account_id uuid,
      subject_id uuid
    )
  `);
  await rootQuery("grant select on clara._test_g1pr2b_bank_due_stub to clara_runtime");
  await rootQuery(`
    create or replace function clara.bank_agent_run_due(p_client uuid) returns jsonb
      language sql stable as $$
      select coalesce(
        (select jsonb_strip_nulls(jsonb_build_object(
                  'due', due, 'reason', reason, 'bank_account_id', bank_account_id, 'subject_id', subject_id))
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
    `insert into clara._test_g1pr2b_bank_due_stub (client_id, due, reason, bank_account_id, subject_id)
       values ($1, $2, $3, $4, $5)
     on conflict (client_id) do update set due=excluded.due, reason=excluded.reason,
       bank_account_id=excluded.bank_account_id, subject_id=excluded.subject_id`,
    [clientId, reply.due, reply.reason ?? null, reply.bank_account_id ?? null, reply.subject_id ?? null],
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

const sha256hex = (value) => createHash("sha256").update(String(value)).digest("hex");

/** Plant one live statement through the estate's verified-document seed and the statement
 *  belt's required single-transaction statement+lines shape. This is authoritative subject
 *  material for emit_bank_agent_due; no caller-chosen occurrence key exists. */
export async function buildStatementSubject(w, suffix, options = {}) {
  const bankAccountId = options.bankAccountId ?? await buildActiveBankAccount(w, suffix);
  const lineCents = options.lineCents ?? [1000];
  const periodStart = options.periodStart ?? "2024-06-01";
  const periodEnd = options.periodEnd ?? "2024-06-30";
  const lineDate = options.lineDate ?? "2024-06-15";
  const sha = sha256hex(randomUUID());
  const doc = (await rootQuery(
    "select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8) as r",
    [w.firm, w.client, sha, `g1-pr2b-${suffix}.pdf`, "application/pdf", 2048,
      `firms/${w.firm}/docs/${sha}.pdf`, w.owner],
  )).rows[0].r;
  const cents = lineCents.map(String);
  const closing = cents.reduce((sum, value) => sum + BigInt(value), 0n).toString();
  const built = await rootQuery(
    `with stmt as (
       insert into clara.bank_statements(firm_id, client_id, bank_account_id, document_id,
           source_doc_sha256, filing_id, facts_hash, period_start, period_end, statement_date,
           opening_cents, closing_cents, line_count, status, ingest_mode)
         values ($1,$2,$3,$4,$5,$6,decode($5,'hex'),$7::date,$8::date,$8::date,
                 0,$10,$11,'live','structured') returning id
     ), lns as (
       insert into clara.bank_statement_lines(firm_id, client_id, statement_id, bank_account_id,
           line_no, entry_date, amount_cents, description)
         select $1,$2,stmt.id,$3,x.ord,$9::date,x.cents,
                'g1 pr2b subject ' || $12 || ' line ' || x.ord
           from stmt, unnest($13::bigint[]) with ordinality as x(cents, ord)
         returning id, line_no
     )
     select (select id from stmt) as statement_id,
            coalesce((select array_agg(id order by line_no) from lns), '{}'::uuid[]) as line_ids`,
    [w.firm, w.client, bankAccountId, doc.document_id, sha, doc.filing_id,
      periodStart, periodEnd, lineDate, closing, lineCents.length, suffix, cents],
  );
  return { bankAccountId, statementId: built.rows[0].statement_id, lineIds: built.rows[0].line_ids };
}

/** Make a statement's one line satisfy the reconciliation precondition by placing it under the
 *  authoritative open-exception term. */
export async function makeStatementReconcilable(w, subject) {
  assertOneLine(subject);
  await rootQuery(
    `insert into clara.bank_line_exceptions(firm_id,client_id,bank_account_id,statement_id,
        line_id,kind,reason,created_by)
      values($1,$2,$3,$4,$5,'disputed','g1 pr2b reconcilable subject',$6)`,
    [w.firm, w.client, subject.bankAccountId, subject.statementId, subject.lineIds[0], w.owner],
  );
  return subject.statementId;
}

function assertOneLine(subject) {
  if (!Array.isArray(subject.lineIds) || subject.lineIds.length !== 1) {
    throw new Error("g1 pr2b subject fixture requires exactly one line");
  }
}

/** The retry identity is the newest refused RECEIPT id; the receipt's own subject is the anchor
 *  line. retry_after is already due and no later admitted row exists. */
export async function plantRetrySubject(w, subject, suffix) {
  assertOneLine(subject);
  const r = await rootQuery(
    `insert into clara.bank_agent_receipts(firm_id,client_id,act_kind,outcome,subject_id,
        retry_after,acting_actor,on_behalf_of,via_wake_kind,wake_task_id,model_snapshot,
        rationale,inputs_digest,gate_verdicts,approval_arm,op_key)
      values($1,$2,'match','refused',$3,now()-interval '1 minute',$4,null,'bank_agent',null,
        '{"provider":"openai","model":"gpt-5.6-sol","version":"g1-pr2b-test"}'::jsonb,
        'g1 pr2b retry subject','g1-pr2b-test-digest','{"verdict":"refused"}'::jsonb,
        'agent_unattended',$5) returning id`,
    [w.firm, w.client, subject.lineIds[0], w.owner, `g1-pr2b-retry-${suffix}-${randomUUID()}`],
  );
  return r.rows[0].id;
}

/** Build the per-reason DB-owned subject the SQL door will independently re-verify. */
export async function buildReasonSubject(w, reason, suffix, options = {}) {
  const statement = await buildStatementSubject(w, suffix, options);
  if (reason === "unmatched_lines") return { ...statement, subjectId: statement.statementId };
  if (reason === "reconcilable") {
    await makeStatementReconcilable(w, statement);
    return { ...statement, subjectId: statement.statementId };
  }
  if (reason === "retry_later") {
    return { ...statement, subjectId: await plantRetrySubject(w, statement, suffix) };
  }
  throw new Error(`unsupported emit reason ${reason}`);
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
