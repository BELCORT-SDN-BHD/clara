// Wave E lane eta (E-c) — the wake authoring boundary, asserted against a live catalog.
//
// CONTRACT-BLIND on the migration: every assertion below reads pg_proc / pg_policies /
// clara.wake_fn_allowlist / has_function_privilege, never the migration's own text. The migration's
// tail proves the same posture at apply time; this file re-proves it after the fact, which is the
// half that survives someone editing the migration later.
//
// WHAT THIS LANE IS RESPONSIBLE FOR, and therefore what these cells measure: each writing chat tool
// reaches the database through exactly ONE clara.wake_* wrapper; the wrappers are EXECUTE-granted to
// clara_wake_interactive and to nothing else; each carries an interactive-only allowlist row; the
// cores that do the writing are reachable by no application role at all; and delta's four-writer
// definition census is exactly where delta left it.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, ROLES } from "./a21-helpers.mjs";
import { buildWorld, endPool } from "./epsilon-fixtures.mjs";
import { registerBehaviourPhase } from "./eta-behaviour-phase.mjs";

const caught = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const WRAPPERS = Object.freeze([
  ["wake_compose_metric_preview", "clara.wake_compose_metric_preview(uuid,jsonb,uuid[],uuid,text)"],
  ["wake_save_metric_definition_draft", "clara.wake_save_metric_definition_draft(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)"],
  // p_effective_from sits immediately before p_op_key and is REQUIRED — epsilon's core refuses a
  // null, this lane refuses a null, and neither defaults it to today. The signature is pinned here
  // so a future edit that quietly restores a default has to change this line to do it.
  ["wake_draft_report_spec", "clara.wake_draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)"],
  ["wake_request_report_preview", "clara.wake_request_report_preview(uuid,text)"],
]);

const CORES = Object.freeze([
  "clara._eta_compose_metric_preview_core(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text)",
  "clara._eta_save_metric_definition_draft_core(uuid,uuid,uuid,text,uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)",
  "clara._eta_request_report_preview_core(uuid,uuid,uuid,text,uuid,text)",
]);

/** Pre-integration gating, stated once: a PACKAGE-WIDE run may precede the eta migration, so
 *  tests/eta-preintegration-gate.mjs (preloaded by the package test script) sets
 *  CLARA_ALLOW_MISSING_WAVE_E_ETA and this suite skips LOUDLY. A FOCUSED run does not preload the
 *  gate, so an unmigrated database fails here instead of greening through. */
async function etaPresent() {
  return (await rootQuery(
    "select to_regprocedure($1) is not null as ok",
    ["clara.wake_compose_metric_preview(uuid,jsonb,uuid[],uuid,text)"],
  )).rows[0].ok;
}

function gate(t) {
  return etaPresent().then((present) => {
    if (present) return true;
    if (process.env.CLARA_ALLOW_MISSING_WAVE_E_ETA === "1") {
      console.warn("SKIP eta contract: the Wave E eta migration is not applied to this database (explicit pre-integration run).");
      t.skip("Wave E eta not applied -- explicit pre-integration run");
      return false;
    }
    assert.fail("Wave E eta is required for a focused or post-migration run: apply the eta migration, or set CLARA_ALLOW_MISSING_WAVE_E_ETA=1 for the package-wide pre-integration sweep");
    return false;
  });
}

test("every eta wrapper is a pinned security definer reachable ONLY by clara_wake_interactive", async (t) => {
  if (!(await gate(t))) return;
  for (const [name, signature] of WRAPPERS) {
    const row = (await rootQuery(
      `select p.prosecdef, p.proconfig, p.oid::regprocedure::text as signature
         from pg_proc p where p.oid = $1::regprocedure`, [signature],
    )).rows[0];
    assert.ok(row, `${name} exists at its exact signature`);
    assert.equal(row.prosecdef, true, `${name} is SECURITY DEFINER`);
    assert.ok((row.proconfig ?? []).includes("search_path=clara, pg_temp"), `${name} pins its search_path`);
    assert.equal(
      (await rootQuery("select has_function_privilege($1,$2::regprocedure,'EXECUTE') ok", [ROLES.wakeInteractive, signature])).rows[0].ok,
      true, `${name}: clara_wake_interactive holds EXECUTE`);
    for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.runtime, ROLES.wakeProactive, "clara_runtime_login"]) {
      const exists = (await rootQuery("select to_regrole($1) is not null ok", [role])).rows[0].ok;
      if (!exists) continue;
      assert.equal(
        (await rootQuery("select has_function_privilege($1,$2::regprocedure,'EXECUTE') ok", [role, signature])).rows[0].ok,
        false, `${name}: ${role} must hold no EXECUTE`);
    }
    // THE EXACT GRANTEE SURFACE, enumerated rather than sampled — and re-proved CONTINUOUSLY,
    // which is the half the migration cannot do. The migration's tail asserts this same surface,
    // but only at APPLY: a grant added by a LATER migration would never re-run it, and until this
    // cell existed the loop above was the only ongoing check — a hand-list, which by construction
    // cannot refuse a role nobody thought to name. This is the battery's own stated split (the
    // migration proves it at apply, this file re-proves it after the fact) finally honoured for
    // grants. PUBLIC is grantee 0, so the probe this replaces is subsumed.
    const grantees = (await rootQuery(
      `select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
         from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner
        order by g`, [signature],
    )).rows.map((r) => r.g);
    assert.deepEqual(grantees, [ROLES.wakeInteractive],
      `${name}: EXECUTE is granted to exactly clara_wake_interactive and nothing else (found ${JSON.stringify(grantees)})`);
  }
});

test("every eta core that writes is reachable by no application role", async (t) => {
  if (!(await gate(t))) return;
  for (const signature of CORES) {
    assert.ok((await rootQuery("select to_regprocedure($1) is not null ok", [signature])).rows[0].ok,
      `${signature} exists at its exact signature`);
    for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive, "clara_runtime_login"]) {
      const exists = (await rootQuery("select to_regrole($1) is not null ok", [role])).rows[0].ok;
      if (!exists) continue;
      assert.equal(
        (await rootQuery("select has_function_privilege($1,$2::regprocedure,'EXECUTE') ok", [role, signature])).rows[0].ok,
        false, `${signature}: ${role} must not reach the ungranted core`);
    }
    // The same enumerated surface as the wrappers, expecting EMPTY. "Ungranted" is this lane's
    // whole privilege claim, and a claim of ABSENCE is exactly the kind a sampled hand-list cannot
    // make: it can only report the roles it names. This asks the catalog for every non-owner
    // grantee and requires there to be none.
    const grantees = (await rootQuery(
      `select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
         from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner
        order by g`, [signature],
    )).rows.map((r) => r.g);
    assert.deepEqual(grantees, [],
      `${signature}: the core carries NO non-owner EXECUTE grantee (found ${JSON.stringify(grantees)})`);
  }
});

test("the allowlist belt admits interactive and never proactive", async (t) => {
  if (!(await gate(t))) return;
  const rows = (await rootQuery(
    `select wake_kind, function_name from clara.wake_fn_allowlist
      where function_name = any($1::text[]) order by function_name, wake_kind`,
    [WRAPPERS.map(([name]) => name)],
  )).rows;
  assert.deepEqual(rows.map((r) => [r.function_name, r.wake_kind]),
    WRAPPERS.map(([name]) => [name, "interactive"]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    "each eta wrapper carries exactly one allowlist row, kind interactive");
  assert.equal(rows.filter((r) => r.wake_kind === "proactive").length, 0,
    "no eta wrapper is reachable from a proactive wake");
});

test("the evaluator and the catalog writers stay ungranted to every wake role", async (t) => {
  if (!(await gate(t))) return;
  // The containment this lane rests on: a wrapper reaches these as an internal ungranted call under
  // clara_fn_owner. If any wake role gained EXECUTE directly, the wrapper would stop being the only
  // door and the allowlist belt would be decorative.
  for (const signature of [
    "clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)",
    "clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)",
    "clara.propose_metric_definition(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)",
    "clara.approve_metric_definition(uuid,bytea,text,text,text)",
    "clara.draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)",
  ]) {
    if (!(await rootQuery("select to_regprocedure($1) is not null ok", [signature])).rows[0].ok) continue;
    for (const role of [ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
      assert.equal(
        (await rootQuery("select has_function_privilege($1,$2::regprocedure,'EXECUTE') ok", [role, signature])).rows[0].ok,
        false, `${signature} must stay ungranted to ${role}`);
    }
  }
});

test("eta does not move delta's four app-executable definition writers", async (t) => {
  if (!(await gate(t))) return;
  // Delta's own security tail and its catalog battery both pin this at four. A granted eta wrapper
  // carrying definition DML would read as a fifth here, which is why every eta write lives in an
  // ungranted core.
  const rows = (await rootQuery(
    `select f.oid::regprocedure::text as signature from pg_proc f
       cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
         'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
       join pg_roles g on g.rolname = app.rolname
      where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
        and lower(f.prosrc) ~ '(insert\\s+into|update|delete\\s+from|merge\\s+into)\\s+clara\\.(metric_definitions|metric_definition_versions)\\M'
      group by 1 order by 1`,
  )).rows;
  assert.deepEqual(rows.map((r) => r.signature.replace(/^clara\./, "")).sort(), [
    "approve_metric_definition(uuid,bytea,text,text,text)",
    "propose_metric_definition(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)",
    "reject_metric_definition(uuid,text,text)",
    "supersede_metric_definition(uuid,uuid,text,text)",
  ], "the definition-writer census is delta's four, unmoved by this lane");
});

test("the render preview refuses by name, and names why the chain is deferred", async (t) => {
  if (!(await gate(t))) return;
  const body = (await rootQuery(
    "select pg_get_functiondef($1::regprocedure) as d",
    ["clara._eta_request_report_preview_core(uuid,uuid,uuid,text,uuid,text)"],
  )).rows[0].d;
  assert.match(body, /report_preview_deferred/,
    "the core names the deferral rather than failing on something incidental");
  assert.match(body, /draft_watermarked/,
    "the render kind stays pinned to a watermarked draft even in the refusal");
  assert.doesNotMatch(body, /'pre_sign'/,
    "no eta path names the issuance kind as a value it could request");
  for (const verb of ["open_report_run", "evaluate_fs_pack_v1", "seal_report_dataset"]) {
    assert.ok(body.includes(verb), `the refusal names ${verb} as part of what it is blocked on`);
  }
});

// THE REGRESSION CELL for the defect my authoring gates structurally could not see. The first
// wake_draft_report_spec delegated straight to clara.draft_report_spec, a HUMAN-lane verb. It would
// have raised CLR04 for every wake caller and never once executed — and node --check, eslint, the
// runtime build, the bundle grep and freeze-lint are all blind to a runtime identity failure,
// because none of them runs SQL. Two halves: the mechanism, measured; and a catalog-derived guard
// so the shape cannot come back silently.
test("no eta function delegates to a human-context verb, and the human wall is measured", async (t) => {
  if (!(await gate(t))) return;
  // (a) THE MECHANISM. clara._human_ctx resolves the actor from request.jwt.claims; with no human
  // claims set it raises CLR04 before the verb does any work. A wake credential populates
  // clara.wake_secret, an entirely different GUC, so a wake lane can never satisfy it.
  // effective_from is a FIXED literal, never a derived date: epsilon's core takes it as an
  // argument precisely because the estate forbids deriving a date from the session clock, and a
  // probe that computed one here would model the defect the argument exists to prevent.
  const unclaimed = await caught(() => rootQuery(
    "select clara.draft_report_spec($1::uuid,$2,$3,$4::uuid,$5,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,$6::date,$7)",
    [randomUUID(), "probe", "probe", randomUUID(), "en", "2026-01-01", `eta-clr04-${randomUUID()}`],
  ));
  assert.equal(unclaimed?.code, "CLR04", `${unclaimed?.code} ${unclaimed?.message}`);
  assert.match(unclaimed.message, /no authenticated actor/i,
    "the human wall answers, and it answers before any argument is looked at");
  // (b) THE GUARD, catalog-derived rather than a hand-list: ANY clara function whose body resolves a
  // human context is a human-lane verb, and no eta wrapper or core may name one.
  const humanVerbs = (await rootQuery(
    `select p.proname from pg_proc p where p.pronamespace='clara'::regnamespace
       and p.prosrc like '%_human_ctx(%' order by p.proname`,
  )).rows.map((r) => r.proname);
  assert.ok(humanVerbs.length > 5, `the catalog positively yields human-lane verbs (${humanVerbs.length})`);
  const etaBodies = (await rootQuery(
    `select p.proname, pg_get_functiondef(p.oid) as d from pg_proc p
      where p.pronamespace='clara'::regnamespace
        and (p.proname like 'wake\\_%metric%' or p.proname like 'wake\\_%report%' or p.proname like '\\_eta\\_%')
      order by p.proname`,
  )).rows;
  assert.ok(etaBodies.length >= 7, `every eta wrapper and core is inspected (${etaBodies.length})`);
  const offenders = [];
  for (const row of etaBodies) {
    for (const verb of humanVerbs) {
      if (row.proname === verb) continue;
      if (new RegExp(`\\bclara\\.${verb}\\s*\\(`).test(row.d)) offenders.push(`${row.proname} -> ${verb}`);
    }
  }
  assert.deepEqual(offenders, [],
    "an eta function calling a human-context verb is unreachable from a wake credential by construction");
});

// THE BEHAVIOURAL HALF. Everything above reads the CATALOG; nothing above ever invokes the surface
// it contracts, so the argument binding, the op key, and every refusal branch are unproven by it.
// tests/eta-behaviour-phase.mjs states, cell by cell, what a catalog read cannot see and why.
test("the wake authoring surface, invoked end to end under a real wake credential", async (t) => {
  if (!(await gate(t))) return;
  await registerBehaviourPhase(t, await buildWorld());
});

after(async () => { await endPool(); });
