// #644 — the shared world for the knowledge batteries (NOT a test file: the name does not end
// in `.test.mjs`). Minted through the ROOT connection on purpose: the subject of these cells is
// the knowledge SUBSTRATE and its doors, so going through create_firm / begin_client_onboarding
// would only add ways to fail for reasons that are not the subject. Every door call a cell makes
// is the real door, as the real role.

import { randomUUID } from "node:crypto";
import { rootQuery } from "./rig-helpers.mjs";

/** True iff 0192's whole cohort is applied. A PARTIAL cohort throws — "wholly present or wholly
 *  absent" is the estate's rule (rig-meta.mjs cohortFailures), and a half-applied knowledge lane
 *  must be visible as a defect rather than skipped as an old frontier. */
export async function knowledgeCohortApplied() {
  const r = await rootQuery(
    `select
       to_regclass('clara.knowledge_keys')                 is not null as keys_table,
       to_regclass('clara.knowledge_records')              is not null as records_table,
       to_regclass('clara.knowledge_plan_item_map')        is not null as map_table,
       to_regclass('clara.knowledge_versions')             is not null as versions_table,
       to_regprocedure('clara.capture_knowledge(text,jsonb,text,text,text,uuid,text,jsonb,date,date,jsonb)')
                                                           is not null as capture_door,
       to_regprocedure('clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)')
                                                           is not null as correct_door,
       to_regprocedure('clara.withdraw_knowledge(uuid,text,text)')      is not null as withdraw_door,
       to_regprocedure('clara.list_client_knowledge(uuid)')             is not null as list_read,
       -- BY NAME, for the reason the promotion probe below gives: the pack gained its explicit
       -- firm binding (p_firm) in the #644 review round, and a cohort probe pinned to one arity
       -- would call a schema PARTIAL for a reason that is not a partial cohort.
       to_regproc('clara.get_knowledge_pack')                           is not null as pack_read,
       -- BY NAME, not by signature. The promotion door gained its explicit firm binding
       -- (p_firm) in the #644 review round, and a cohort probe pinned to one arity would call a
       -- schema PARTIAL for a reason that is not a partial cohort. The name is unambiguous:
       -- 0192 creates exactly one overload of it.
       to_regproc('clara.promote_plan_answers_to_knowledge') is not null as promote_door`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#644 knowledge cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

/** True iff #898's fye-day vocabulary (0240_financial_year_end_day.sql) is applied: the
 *  `financial_year_end_day` catalog row AND the `fye_day` map row naming it. Same "wholly present
 *  or wholly absent" law as `knowledgeCohortApplied` above — this cohort adds no relation and no
 *  function, so its two rows are the whole of it. */
export async function fyeDayCohortApplied() {
  const r = await rootQuery(
    `select
       exists (select 1 from clara.knowledge_keys where knowledge_key = 'financial_year_end_day')
         as key_row,
       exists (select 1 from clara.knowledge_plan_item_map
                where item_key = 'fye_day' and knowledge_key = 'financial_year_end_day')
         as map_row`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#898 fye-day cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

/** True iff #1031's fye pair-wall cohort is applied. The cohort is TWO files that ship together
 *  as one unit -- 0310_knowledge_fye_pair_wall.sql (the rule and the two write doors that consult
 *  it) and its own fix round 0318_knowledge_fye_pair_applicability.sql (the rule re-cut at four
 *  arguments so the sibling is read at the INCOMING APPLICABILITY, and 0310's three-argument form
 *  dropped) -- so this probe asks for the shape the cohort finally ships: the FOUR-argument
 *  ungranted rule exists AND both write doors that can touch either year-end key
 *  (`clara._knowledge_capture_core`, `clara.correct_knowledge`) carry its call in their live body.
 *  A marker probe rather than a bare existence check, the same reason `auditActorRoleCohortApplied`
 *  above gives: each of those two functions has existed since 0192, so a bare `to_regprocedure` on
 *  them would report this cohort applied estate-wide. Same "wholly present or wholly absent" law
 *  as the cohorts above -- a database carrying 0310 WITHOUT 0318 is a half-applied cohort and is
 *  surfaced as PARTIAL rather than skipped, which is exactly what it is. */
export async function fyePairWallCohortApplied() {
  const r = await rootQuery(
    `select
       to_regprocedure('clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb)') is not null as rule_fn,
       (select position('_knowledge_assert_fye_pair(' in p.prosrc) > 0 from pg_proc p
         where p.oid = 'clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)'::regprocedure)
                                                                       as capture_core_calls_it,
       (select position('_knowledge_assert_fye_pair(' in p.prosrc) > 0 from pg_proc p
         where p.oid = 'clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)'::regprocedure)
                                                                       as correct_knowledge_calls_it`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#1031 fye pair-wall cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

/** True iff #913's column drop (0241_knowledge_scope_default_drop.sql) is applied:
 *  `clara.knowledge_keys` no longer carries `scope_default`. Unlike the two cohorts above there
 *  is exactly one thing to lose, not several to land together, so there is no PARTIAL state a
 *  multi-flag count could catch — a single boolean is the whole check. */
export async function scopeDefaultDroppedCohortApplied() {
  const r = await rootQuery(
    `select not exists (
       select 1 from information_schema.columns
        where table_schema = 'clara' and table_name = 'knowledge_keys' and column_name = 'scope_default'
     ) as dropped`,
  );
  return r.rows[0].dropped;
}

/** True iff #993's tightened catalog-key grammar (0242_knowledge_key_grammar.sql) is applied:
 *  BOTH `clara.knowledge_keys.knowledge_key` and `clara.client_fact_keys.fact_key` carry the
 *  `ck_..._key_grammar` CHECK enforcing `^[a-z][a-z0-9_]{0,62}$` -- the exact grammar
 *  `clara.record_work_knowledge_read` already enforces at read-record time (0230:682) -- in place
 *  of each catalog's former `btrim(...) <> ''` CHECK. Same "wholly present or wholly absent" law
 *  as the two cohorts above: one migration mints both constraints together, so a chain that
 *  landed only one of them is a defect to surface, not a frontier to skip past silently. */
export async function keyGrammarCohortApplied() {
  const r = await rootQuery(
    `select
       exists (select 1 from pg_constraint
                where conrelid = 'clara.knowledge_keys'::regclass
                  and conname = 'ck_knowledge_keys_key_grammar') as knowledge_keys_grammar,
       exists (select 1 from pg_constraint
                where conrelid = 'clara.client_fact_keys'::regclass
                  and conname = 'ck_client_fact_keys_key_grammar') as client_fact_keys_grammar`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#993 key-grammar cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

/** True iff #912's audit actor-role cohort (0243_audit_actor_role.sql) is applied: the
 *  `clara.audit_log.actor_role` column AND its own CHECK AND the `t_audit_actor_role` stamp that
 *  fills it AND the recut `clara.list_firm_knowledge` that cites it. Same "wholly present or
 *  wholly absent" law as the cohorts above: one migration lands the column, its stamp and its one
 *  reader together, so a chain carrying only some of them is a defect to surface rather than a
 *  frontier to skip. The register probe looks for the migration's OWN marker in the live body
 *  (`prosrc`) rather than for the function's existence -- `clara.list_firm_knowledge` has existed
 *  since 0220, so a bare `to_regprocedure` would report this cohort applied estate-wide. */
export async function auditActorRoleCohortApplied() {
  const r = await rootQuery(
    `select
       exists (select 1 from information_schema.columns
                where table_schema = 'clara' and table_name = 'audit_log'
                  and column_name = 'actor_role')                          as role_column,
       exists (select 1 from pg_constraint
                where conrelid = 'clara.audit_log'::regclass
                  and conname = 'ck_audit_log_actor_role')                 as role_check,
       exists (select 1 from pg_trigger
                where tgrelid = 'clara.audit_log'::regclass
                  and not tgisinternal and tgname = 't_audit_actor_role')  as stamp_trigger,
       (select position('promoter_role_at_act' in p.prosrc) > 0 from pg_proc p
         where p.oid = 'clara.list_firm_knowledge()'::regprocedure)        as register_recut`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#912 audit actor-role cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

/** One firm, four people at four ranks, two clients. Returns everything a cell addresses. */
export async function knowledgeWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`kn_${suffix}`]))
    .rows[0].id;
  const people = {};
  for (const role of ["owner", "admin", "bookkeeper", "viewer"]) {
    const id = randomUUID();
    await rootQuery(
      "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
      [id, `kn ${role} ${suffix}`, `kn_${role}_${suffix}@rig.test`],
    );
    await rootQuery(
      "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,$3,'active')",
      [firm, id, role],
    );
    people[role] = id;
  }
  const clientA = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [firm, `kn_a_${suffix}`],
  )).rows[0].id;
  const clientB = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [firm, `kn_b_${suffix}`],
  )).rows[0].id;
  return { firm, clientA, clientB, ...people };
}

/** A COMMITTED onboarding plan with the named answers, exactly as clara.update_onboarding_plan
 *  would have left it (item shape read from 0017:1040-1060) and as
 *  clara.commit_client_onboarding leaves the plan itself (state/committed_at/committed_by).
 *  `answers` maps item_key -> { value (jsonb), answeredBy (uuid), state? }. */
export async function committedPlan({ firm, client, committedBy, answers, scopeKind = "client" }) {
  const plan = (await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, client_id, state, committed_at,
        committed_by, contributors)
     values ($1,$2,$3,'committed', now(), $4, array[$4]::uuid[]) returning id`,
    [firm, scopeKind, scopeKind === "client" ? client : null, committedBy],
  )).rows[0].id;
  for (const [itemKey, spec] of Object.entries(answers)) {
    await rootQuery(
      `insert into clara.onboarding_plan_items(plan_id, firm_id, item_kind, item_key, question,
          answer, state, required_for_commit, answered_by, answered_at)
       values ($1,$2,'capture',$3,$4,$5::jsonb,$6,false,$7, now())`,
      [plan, firm, itemKey, `rig question ${itemKey}`, JSON.stringify(spec.value),
        spec.state ?? "answered", spec.answeredBy],
    );
  }
  return plan;
}
