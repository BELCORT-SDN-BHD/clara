// 裁-21 PR-b rig helpers -- NOT a test file (the name does not end in `.test.mjs`, so
// `node --test` never collects it). Door wrappers, fixture builders and the root-side ground-truth
// readers for `coa-template-pr-b.test.mjs`.
//
// Every door is called with NAMED arguments through `namedCall` (rig-helpers.mjs's own idiom), so
// a parameter RENAME in the migration is a rig failure rather than a silent positional shift.
//
// FIXTURE HONESTY. Two builders below reach past the doors, and each says so in its own comment:
// `newInterviewClient` drives a client's birth through the REAL audited plan+commit verbs (no
// surgery at all), while `forceAdoptionRow` and `forgeAdoptedFamilies` write
// coa_template_adoptions as clara_fn_owner to CONSTRUCT states no door can reach (an adopted row
// on an empty chart; an adoption naming a family that was never planted). They construct
// fixtures; they never stand in for a door in a proof.

import { randomUUID } from "node:crypto";
import {
  opk, rootQuery, roleQuery, ROLES, humanQuery, insertUser, addMember, membershipId, removeMember,
  namedCall, getPool,
} from "./rig-fixtures.mjs";

// ---------------------------------------------------------------------------
// The doors
// ---------------------------------------------------------------------------

export async function applyTemplate(sub, { client, template, families = null, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("apply_coa_template", [
      { name: "p_client", cast: "uuid" },
      { name: "p_template", cast: "uuid" },
      { name: "p_families", cast: "text[]" },
      { name: "p_op_key", cast: "text" },
    ]),
    [client, template, families, opKey],
  );
  return r.rows[0].result;
}

export async function addFamily(sub, { client, template, family, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("add_coa_template_family", [
      { name: "p_client", cast: "uuid" },
      { name: "p_template", cast: "uuid" },
      { name: "p_family", cast: "text" },
      { name: "p_op_key", cast: "text" },
    ]),
    [client, template, family, opKey],
  );
  return r.rows[0].result;
}

export async function familyPlan(sub, client, template) {
  const r = await humanQuery(sub, "select clara.coa_template_family_plan($1, $2) as p", [client, template]);
  return r.rows[0].p;
}

export async function chartState(sub, client) {
  const r = await humanQuery(sub, "select clara.coa_chart_state($1) as s", [client]);
  return r.rows[0].s;
}

export async function adoptionRead(sub, client) {
  const r = await humanQuery(sub, "select clara.get_coa_template_adoption($1) as a", [client]);
  return r.rows[0]?.a ?? null;
}

export async function drift(sub, client) {
  const r = await humanQuery(sub, "select * from clara.coa_template_drift($1)", [client]);
  return r.rows;
}

export async function firmDrift(sub) {
  const r = await humanQuery(sub, "select * from clara.firm_coa_drift()");
  return r.rows;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A client born through the REAL audited path, carrying whatever committed interview answers the
 * caller asks for. No surgery: create_client -> update_onboarding_plan (runtime role, the shape
 * the interview workflow itself writes) -> commit_client_onboarding by a DISTINCT admin.
 *
 * `answers` is a map of item_key -> answer JSON, so a cell can plant `entity_type`,
 * `coa_seed_decision` and `msic` exactly as the shipped interview writes them (a bare JSON string
 * for the enums, `{seed: ...}` for the CoA decision -- interview.v2.questions.ts).
 *
 * The client comes back with an EMPTY chart, which is what rung 5 requires.
 */
export async function newInterviewClient(admin, firm, { tag, answers = {} } = {}) {
  const name = `rig_prb_${tag ?? "c"}_${randomUUID().slice(0, 8)}`;
  const created = await humanQuery(
    admin, "select clara.create_client(p_name => $1, p_op_key => $2) as receipt", [name, opk("cli")]);
  const client = created.rows[0].receipt.client_id;

  const plan = (await rootQuery(
    "select id, revision_token from clara.onboarding_plans where client_id = $1 and state = 'open' order by created_at desc limit 1",
    [client])).rows[0];
  if (!plan) throw new Error(`newInterviewClient: ${client} was born without an open onboarding plan`);

  const items = [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }];
  for (const [key, answer] of Object.entries(answers)) {
    items.push({
      item_kind: "must_ask", item_key: key, question: `rig: ${key}?`, answer,
      state: "answered", required_for_commit: false,
    });
  }
  await roleQuery(
    ROLES.runtime,
    "select clara.update_onboarding_plan(p_plan => $1, p_expected_revision => $2, p_items => $3::jsonb, p_answered_by => $4, p_op_key => $5)",
    [plan.id, plan.revision_token, JSON.stringify(items), admin, opk("prbplan")],
  );

  const rev = (await rootQuery("select revision_token from clara.onboarding_plans where id = $1", [plan.id])).rows[0].revision_token;
  // The committer must be a contributor-clean admin DISTINCT from every contributor (CLR05).
  const temp = await insertUser("prb", `c_${client.slice(0, 8)}`);
  await addMember(admin, { firm, user: temp, role: "admin", opKey: opk("prbadd") });
  await humanQuery(
    temp,
    "select clara.commit_client_onboarding(p_client => $1, p_plan => $2, p_expected_plan_revision => $3, p_op_key => $4) as r",
    [client, plan.id, rev, opk("prbcommit")],
  );
  const mem = await membershipId(firm, temp);
  await removeMember(admin, { membership: mem, opKey: opk("prbrm") });

  return client;
}

/** Record a live client fact through the REAL admin-floored door (0055's record_client_fact). */
export async function recordFact(admin, { client, key, value, basis = "rig fixture" }) {
  const r = await humanQuery(
    admin,
    namedCall("record_client_fact", [
      { name: "p_client", cast: "uuid" },
      { name: "p_fact_key", cast: "text" },
      { name: "p_fact_value", cast: "jsonb" },
      { name: "p_basis", cast: "text" },
      { name: "p_basis_kind", cast: "text" },
      { name: "p_source_document_id", cast: "uuid" },
      { name: "p_op_key", cast: "text" },
    ]),
    [client, key, JSON.stringify(value), basis, "owner_instruction", null, opk("fact")],
  );
  return r.rows[0].result;
}

/**
 * FIXTURE SURGERY, declared as such: an 'adopted' adoption row written directly as the table
 * owner, so a cell can reach rung 6 (`already_adopted`) -- a state the doors cannot produce,
 * because the door that writes an adoption also plants the chart that makes rung 5 fire first.
 * Never used as evidence that a door works.
 */
export async function forceAdoptionRow(firm, client, template, version, families, actor) {
  const r = await rootQuery(
    `insert into clara.coa_template_adoptions
       (firm_id, client_id, template_id, template_version, state, families, adopted_by, adopted_at)
     values ($1, $2, $3, $4, 'adopted', $5::text[], $6, now()) returning id`,
    [firm, client, template, version, families, actor],
  );
  return r.rows[0].id;
}

/** FIXTURE SURGERY: widen an existing adoption's families[] so a family that was never planted
 *  becomes an ADOPTED one -- the only way to construct the drift read's `missing` class. */
export async function forgeAdoptedFamilies(adoptionId, families) {
  await rootQuery("update clara.coa_template_adoptions set families = $2::text[] where id = $1",
    [adoptionId, families]);
}

// ---------------------------------------------------------------------------
// Root-side ground truth (superuser bypasses RLS -- ground truth, never a wall proof)
// ---------------------------------------------------------------------------

export async function platformStarter() {
  const r = await rootQuery(
    "select id, version from clara.coa_templates where scope = 'platform' and template_key = 'my_sme_starter' and version = 1");
  return r.rows[0] ?? null;
}

/** The client's REAL chart as a MAP code -> shape (the roster-maps-not-counts lesson). */
export async function clientChartMap(client) {
  const r = await rootQuery(
    `select account_code, name, account_type, account_class, special_acc_type, is_active, is_bank_account
       from clara.coa_accounts where client_id = $1 order by account_code`, [client]);
  const m = {};
  for (const row of r.rows) {
    m[row.account_code] = {
      name: row.name, type: row.account_type, class: row.account_class,
      special: row.special_acc_type, active: row.is_active, bank: row.is_bank_account,
    };
  }
  return m;
}

/**
 * THE EXPECTED MAP, DERIVED BY QUERY from the template rows and the entity overrides -- never a
 * literal. The acceptance list is explicit that the applied set is pinned "against 0150's seed by
 * query, not by literal": a hand-typed roster would re-encode the migration's own opinion and
 * would go green against a template that had silently changed underneath it.
 */
export async function expectedChartMap(template, families, entityType) {
  const r = await rootQuery(
    `select a.account_code,
            clara._coa_effective_account_name(a.template_id, a.account_code, a.name, $3) as eff_name,
            a.account_type, a.account_class, a.special_acc_type
       from clara.coa_template_accounts a
      where a.template_id = $1 and a.family_key = any ($2::text[])
      order by a.account_code`,
    [template, families, entityType],
  );
  const m = {};
  for (const row of r.rows) {
    if (row.eff_name === null) continue; // suppressed for this entity type
    m[row.account_code] = {
      name: row.eff_name, type: row.account_type, class: row.account_class,
      special: row.special_acc_type, active: true, bank: false,
    };
  }
  return m;
}

/** The template's `core` family keys, read live -- the fail-closed plan is compared against THIS. */
export async function coreFamilies(template) {
  const r = await rootQuery(
    "select family_key from clara.coa_template_families where template_id = $1 and inclusion = 'core' order by family_key",
    [template]);
  return r.rows.map((x) => x.family_key);
}

export async function accountCount(client) {
  const r = await rootQuery("select count(*)::int as n from clara.coa_accounts where client_id = $1", [client]);
  return r.rows[0].n;
}

export async function eventCount(firm, type) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.domain_events where firm_id = $1 and event_type = $2", [firm, type]);
  return r.rows[0].n;
}

export async function auditCount(firm, fn) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.audit_log where firm_id = $1 and fn = $2", [firm, fn]);
  return r.rows[0].n;
}

export async function rawAdoption(client) {
  const r = await rootQuery(
    "select * from clara.coa_template_adoptions where client_id = $1 order by created_at desc", [client]);
  return r.rows;
}

// ---------------------------------------------------------------------------
// The mutant harness -- identical in shape to PR-a's, restated here so this file stands alone.
// ---------------------------------------------------------------------------

/**
 * Run `fn(client)` inside ONE transaction that is ALWAYS rolled back. DDL, CREATE OR REPLACE and
 * DML are all transactional in PostgreSQL, so a mutant that drops a constraint, replaces a body or
 * deletes a seeded row is undone by the rollback -- the shipping schema is never left mutated even
 * when the probe inside unexpectedly SUCCEEDS, which is exactly what a mutant cell tries to make
 * happen. The probe MUST run on the client this hands back.
 */
export async function withRolledBackTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    try { await client.query("rollback"); } catch { /* may already be aborted */ }
    try { await client.query("reset role"); } catch { /* best effort */ }
    client.release();
  }
}

/** Run `sql` inside a mutant transaction AS the given human (jwt claims), on THAT client. */
export async function asHumanOn(client, sub, sql, params) {
  // The claim shape is rig-helpers.mjs's own (`role: "authenticated"`, the PostgREST claim, not
  // the database role name) -- copied rather than paraphrased, because a claim that merely LOOKS
  // right would make every mutant probe fail for the wrong reason.
  await client.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub, role: "authenticated" })]);
  await client.query(`set local role ${ROLES.authenticated}`);
  try {
    return await client.query(sql, params);
  } finally {
    // BEST-EFFORT, and the reason is a defect this rig actually hit: a probe that RAISES leaves
    // the transaction aborted, and a bare `reset role` in this finally then throws 25P02 -- which
    // REPLACES the real SQLSTATE the caller was measuring. A mutant panel whose instrument
    // overwrites its own reading proves nothing.
    try { await client.query("reset role"); } catch { /* transaction already aborted */ }
  }
}

/** Did `fn()` raise? Returns the SQLSTATE, or null when the call SUCCEEDED. */
export async function raisedCode(fn) {
  try { await fn(); return null; } catch (e) { return e.code ?? "(no code)"; }
}

/** The `detail` reason a Clara refusal carries, so a cell pins the NAME and not just the class. */
export async function refusalReason(fn) {
  try { await fn(); return null; } catch (e) {
    if (!e.detail) return `(no detail) ${e.code ?? ""} ${e.message ?? ""}`;
    try { return JSON.parse(e.detail).reason ?? `(no reason key) ${e.detail}`; }
    catch { return `(unparseable detail) ${e.detail}`; }
  }
}
