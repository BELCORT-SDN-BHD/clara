// #644 — the shared world for the two knowledge batteries (NOT a test file: the name does not end
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
       to_regprocedure('clara.get_knowledge_pack(uuid,text)')           is not null as pack_read,
       to_regprocedure('clara.promote_plan_answers_to_knowledge(uuid,text,boolean)')
                                                           is not null as promote_door`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#644 knowledge cohort is PARTIAL: ${JSON.stringify(row)}`);
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
