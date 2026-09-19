// #658 — the shared world and door wrappers for the knowledge-RETRIEVAL battery (NOT a test file:
// the name does not end in `.test.mjs`). Migration: 0230_knowledge_retrieval.sql.
//
// Every DOOR call below goes through the least-privileged persona that should succeed —
// `roleQuery(ROLES.runtime, …)` for the five runtime names, `humanQuery(sub, …)` for the two human
// ones. `rootQuery` appears ONLY to mint a world or to read a table back for a "no row landed"
// count, never as the caller of the act a cell is about (DECISIONS §1.10 / WORK-ORDER rule 3).

import { randomUUID } from "node:crypto";
import { humanQuery, roleQuery, rootQuery, ROLES } from "./rig-helpers.mjs";

/** True iff 0230's whole cohort is applied. A PARTIAL cohort throws — "wholly present or wholly
 *  absent" is the estate's rule (rig-meta.mjs cohortFailures), and a half-applied retrieval lane
 *  must be visible as a defect rather than skipped as an old frontier. */
export async function knowledgeRetrievalCohortApplied() {
  const r = await rootQuery(
    `select
       to_regclass('clara.work_knowledge_reads')                                    is not null as reads_table,
       to_regprocedure('clara.retrieve_knowledge(uuid,text,date,text[],int,uuid)')  is not null as retrieve_door,
       to_regprocedure('clara.read_knowledge_record_for(uuid,uuid,uuid)')           is not null as record_for,
       to_regprocedure('clara.read_knowledge_history_for(uuid,uuid,uuid)')          is not null as history_for,
       to_regprocedure('clara.record_work_knowledge_read(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text)')
                                                                                    is not null as read_writer,
       to_regprocedure('clara.work_knowledge_drift(uuid)')                          is not null as drift_human,
       to_regprocedure('clara.work_knowledge_drift_for(uuid,uuid)')                 is not null as drift_runtime,
       to_regprocedure('clara._work_knowledge_drift_core(uuid,uuid)')               is not null as drift_core,
       to_regprocedure('clara.list_work_knowledge_reads_for_record(uuid)')          is not null as record_reads`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#658 knowledge-retrieval cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

/** The CORE tier's definition, read from the LIVE catalog rather than transcribed: a key is core
 *  when it is authority-bearing, when its kind is `policy`, or when it is one of the five keys
 *  clara.client_facts still carries (clara.client_fact_keys). Measured on the rig at brief time:
 *  seven keys. */
export async function coreKeys() {
  const r = await rootQuery(
    `select knowledge_key from clara.knowledge_keys where kind = 'policy' or authority_bearing
     union
     select fact_key from clara.client_fact_keys
     order by 1`,
  );
  return r.rows.map((x) => x.knowledge_key);
}

/** One firm, four people at four ranks, two clients — knowledge-fixtures' shape, minted here so
 *  the retrieval battery does not depend on 0192's fixture module's future. */
export async function retrievalWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`kr_${suffix}`]))
    .rows[0].id;
  const people = {};
  for (const role of ["owner", "admin", "bookkeeper", "viewer"]) {
    const id = randomUUID();
    await rootQuery(
      "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
      [id, `kr ${role} ${suffix}`, `kr_${role}_${suffix}@rig.test`],
    );
    await rootQuery(
      "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,$3,'active')",
      [firm, id, role],
    );
    people[role] = id;
  }
  const clientA = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [firm, `kr_a_${suffix}`],
  )).rows[0].id;
  const clientB = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [firm, `kr_b_${suffix}`],
  )).rows[0].id;
  return { firm, clientA, clientB, ...people };
}

/** A live accounting Work and the `kind='accounting_work'` task that names it — the pair the sole
 *  writer's positive join (0195:1525-1529) resolves. Minted with root DML on purpose: the subject
 *  of these cells is the knowledge read-set, not the admission door. */
export async function workWithTask(firm, client, initiator) {
  const digest = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const work = (await rootQuery(
    `insert into clara.accounting_work(
        firm_id, client_id, purpose, status, initiator, initiator_role, intent_key,
        logical_op_id, basis, basis_digest, basis_origin, source_refs, initiated_by)
     values ($1,$2,'journal_entry','awaiting_input',$3,'bookkeeper',$4,$5,
             '{"rig":"p658"}'::jsonb,$6,'user_direct','[]'::jsonb,$3) returning id`,
    [firm, client, initiator, `p658_${randomUUID()}`, `p658_${randomUUID()}`, digest],
  )).rows[0].id;
  const task = (await rootQuery(
    `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot, created_by, work_id)
     values ($1,$2,'accounting_work','queued','rig/p658',$3,$4) returning id`,
    [firm, client, initiator, work],
  )).rows[0].id;
  return { work, task };
}

/** A task of ANOTHER kind (`autodraft`), carrying no Work at all — the writer must refuse it,
 *  which is how the absent FK's binding is shown to be carried by the positive join instead.
 *  (`ck_agent_tasks_work_id_kind` makes "a Work id" and "kind = accounting_work" the same fact,
 *  so any other kind is by construction a task with no Work.) */
export async function nonWorkTask(firm, client, initiator) {
  return (await rootQuery(
    `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot, created_by)
     values ($1,$2,'autodraft','queued','rig/p658',$3) returning id`,
    [firm, client, initiator],
  )).rows[0].id;
}

const CAPTURE = `select clara.capture_knowledge(
  p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3, p_op_key => $4,
  p_scope_kind => $5, p_client => $6, p_source_kind => $7, p_applies_when => $8::jsonb,
  p_effective_from => $9::date, p_effective_to => $10::date, p_source => $11::jsonb) as r`;

/** clara.capture_knowledge as a human — the real door, at the floor the key's catalog row sets. */
export function capture(sub, o) {
  return humanQuery(sub, CAPTURE, [
    o.key, JSON.stringify(o.value), o.basis ?? "p658 rig basis", o.opKey ?? `p658_${randomUUID()}`,
    o.scope ?? "client", o.client ?? null, o.sourceKind ?? "user_statement",
    JSON.stringify(o.appliesWhen ?? {}), o.from ?? null, o.to ?? null,
    JSON.stringify(o.source ?? {}),
  ]).then((r) => r.rows[0].r);
}

/** clara.retrieve_knowledge, as clara_runtime unless a persona is named. Arguments in the door's
 *  own order: (p_client, p_purpose, p_as_of, p_keys, p_limit, p_firm). */
export function retrieve(o) {
  const sql = `select clara.retrieve_knowledge(
    p_client => $1, p_purpose => $2, p_as_of => $3::date, p_keys => $4::text[],
    p_limit => $5, p_firm => $6) as r`;
  const args = [o.client, o.purpose ?? "accounting_work", o.asOf ?? null, o.keys ?? null,
    o.limit ?? 40, o.firm ?? null];
  if (o.sub) return humanQuery(o.sub, sql, args).then((r) => r.rows[0].r);
  return roleQuery(o.role ?? ROLES.runtime, sql, args).then((r) => r.rows[0].r);
}

export function readRecordFor(o) {
  return roleQuery(o.role ?? ROLES.runtime,
    "select clara.read_knowledge_record_for(p_firm => $1, p_client => $2, p_record => $3) as r",
    [o.firm, o.client, o.record]).then((r) => r.rows[0].r);
}

export function readHistoryFor(o) {
  return roleQuery(o.role ?? ROLES.runtime,
    "select clara.read_knowledge_history_for(p_firm => $1, p_client => $2, p_record => $3) as r",
    [o.firm, o.client, o.record]).then((r) => r.rows[0].r);
}

/** The sole writer. Note what it is NOT given: work, firm and client, which it derives. */
export function recordRead(o) {
  return roleQuery(o.role ?? ROLES.runtime,
    `select clara.record_work_knowledge_read(
       p_task => $1, p_run => $2, p_seq => $3, p_purpose => $4, p_as_of => $5::date,
       p_knowledge_version => $6, p_keys => $7::text[], p_tiers => $8::jsonb,
       p_records_shown => $9, p_truncated => $10, p_status => $11, p_reason => $12) as r`,
    [o.task, o.run ?? "wrun_P658RIG0000000000000001", o.seq ?? 1, o.purpose ?? "accounting_work",
      o.asOf ?? null, o.knowledgeVersion ?? "0", o.keys ?? [],
      JSON.stringify(o.tiers ?? { core: 0, requested: 0, remainder: 0 }),
      o.recordsShown ?? 0, o.truncated ?? false, o.status ?? "ok", o.reason ?? null],
  ).then((r) => r.rows[0].r);
}

export function drift(sub, work) {
  return humanQuery(sub, "select clara.work_knowledge_drift(p_work => $1) as r", [work])
    .then((r) => r.rows[0].r);
}

export function driftFor(firm, work, role = ROLES.runtime) {
  return roleQuery(role, "select clara.work_knowledge_drift_for(p_firm => $1, p_work => $2) as r",
    [firm, work]).then((r) => r.rows[0].r);
}

export function listReadsForRecord(sub, record) {
  return humanQuery(sub,
    "select clara.list_work_knowledge_reads_for_record(p_record => $1) as r", [record])
    .then((r) => r.rows[0].r);
}

/** The estate's `_knowledge_row_json` field set — the shape every knowledge read emits, used by
 *  the shadow-parity cell to compare three reads on the rows they share. */
export const ROW_JSON_FIELDS = [
  "record_id", "revision_id", "revision_n", "scope_kind", "client_id", "knowledge_key", "kind",
  "value", "applies_when", "applies_when_digest", "effective_from", "effective_to", "source_kind",
  "trust", "source", "basis", "asserted_by", "recorded_via", "recorded_at", "knowledge_version",
  "revision_kind", "revision_reason", "supersedes_id", "superseded_by", "superseded_at", "state",
  "editable", "correctable",
];

export function projectRow(row) {
  const out = {};
  for (const f of ROW_JSON_FIELDS) out[f] = row[f] ?? null;
  return out;
}
