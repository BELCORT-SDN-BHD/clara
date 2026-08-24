// F-A5 PR-2 -- the CENSUS battery: posture, the C.2 roster in BOTH directions, C1 unmoved, the
// allowlist belt. For migrations/UNNUMBERED_f_a5_reporting_agency_pr2{a,b,c,d,e}*.sql.
//
// Design of record: docs/plan/active/reporting-agency-design.md (v2) SS3.1, SS5; annex
// reporting-agency-annexes-1-mechanics.md (A.1 enumeration, C censuses).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool } from "./rig-helpers.mjs";
import {
  PR2_WRAPPERS, PR2_WRAPPER_SIGS, PR2_NEW_CORES, NO_REACH_ROLES,
  pr2Ready, skipHere,
} from "./f-a5-reporting-agency-pr2-fixtures.mjs";

let ready = false;
before(async () => { ready = await pr2Ready(); });
after(async () => { await endPool(); });

// =============================================================================================
// POSTURE. Every wrapper: SECURITY DEFINER, search_path pinned, owned by clara_fn_owner.
// =============================================================================================
test("posture -- every one of the 17 wrappers is a search_path-pinned SECURITY DEFINER owned by clara_fn_owner", async (t) => {
  if (!ready) return skipHere(t, "the wrappers are absent");
  for (const name of PR2_WRAPPERS) {
    const sig = PR2_WRAPPER_SIGS[name];
    const posture = (await rootQuery(
      `select p.prosecdef as definer, 'search_path=clara, pg_temp' = any(p.proconfig) as pinned,
              pg_get_userbyid(p.proowner) as owner
         from pg_proc p where p.oid = $1::regprocedure`, [sig])).rows[0];
    assert.equal(posture.definer, true, `${name} is SECURITY DEFINER`);
    assert.equal(posture.pinned, true, `${name} pins search_path`);
    assert.equal(posture.owner, "clara_fn_owner", `${name} is owned by clara_fn_owner`);
  }
});

// =============================================================================================
// C.2, direction 1 -- exact grantee set. aclexplode reads what the catalog holds (PUBLIC
// included), never a hand-sampled role list -- the shape that catches a role invented later.
// =============================================================================================
test("C.2(1) -- every wrapper's EXACT EXECUTE grantee set is {clara_wake_interactive}, nothing else", async (t) => {
  if (!ready) return skipHere(t, "the wrappers are absent");
  for (const name of PR2_WRAPPERS) {
    const sig = PR2_WRAPPER_SIGS[name];
    const grantees = (await rootQuery(
      `select coalesce(string_agg(distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
              ',' order by case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end), '') g
         from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner`,
      [sig])).rows[0].g;
    assert.deepEqual(grantees.split(",").filter(Boolean), ["clara_wake_interactive"], `${name} grantees`);
  }
});

test("C.2(1b) -- no named role (both non-inheriting login shells included) can execute any wrapper except via clara_wake_interactive", async (t) => {
  if (!ready) return skipHere(t, "the wrappers are absent");
  const others = NO_REACH_ROLES.filter((r) => r !== "clara_wake_interactive");
  for (const name of PR2_WRAPPERS) {
    const sig = PR2_WRAPPER_SIGS[name];
    for (const role of others) {
      const has = (await rootQuery(
        "select has_function_privilege($1, $2::regprocedure, 'execute') h", [role, sig])).rows[0].h;
      assert.equal(has, false, `${role} must not execute ${name}`);
    }
  }
});

// =============================================================================================
// Every core -- PR-1's, PR-2's nine, and the wrapper-less enqueue core -- stays reachable by NO
// application role. A core with EXECUTE is a wall drawn and not armed.
// =============================================================================================
test("cores -- all nine new PR-2 cores, plus the wrapper-less enqueue core, are reachable by NO application role", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const cores = [...PR2_NEW_CORES, "clara._enqueue_render_job_core(uuid,uuid,uuid,text,uuid,text)"];
  for (const sig of cores) {
    for (const role of NO_REACH_ROLES) {
      const has = (await rootQuery(
        "select has_function_privilege($1, $2::regprocedure, 'execute') h", [role, sig])).rows[0].h;
      assert.equal(has, false, `${role} must not execute ${sig}`);
    }
  }
});

test("cores -- every new core is SECURITY DEFINER, search_path-pinned, owned by clara_fn_owner", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  for (const sig of PR2_NEW_CORES) {
    const posture = (await rootQuery(
      `select p.prosecdef as definer, 'search_path=clara, pg_temp' = any(p.proconfig) as pinned,
              pg_get_userbyid(p.proowner) as owner
         from pg_proc p where p.oid = $1::regprocedure`, [sig])).rows[0];
    assert.equal(posture.definer, true, `${sig} is SECURITY DEFINER`);
    assert.equal(posture.pinned, true, `${sig} pins search_path`);
    assert.equal(posture.owner, "clara_fn_owner", `${sig} is owned by clara_fn_owner`);
  }
});

// =============================================================================================
// C.2, direction 2 -- the allowlist holds EXACTLY these 17 names, all 'interactive', and no
// extra row (a superset failure would let a name A.1 never wrote reach the wake door).
// =============================================================================================
test("C.2(2) -- the allowlist holds exactly the 17 named wrappers, interactive-only, no superset row", async (t) => {
  if (!ready) return skipHere(t, "the wrappers are absent");
  const rows = (await rootQuery(
    "select wake_kind, function_name from clara.wake_fn_allowlist where function_name = any($1::text[])",
    [PR2_WRAPPERS])).rows;
  assert.equal(rows.length, PR2_WRAPPERS.length, "one allowlist row per named wrapper");
  for (const row of rows) assert.equal(row.wake_kind, "interactive", `${row.function_name} is interactive-only`);
  // never 'proactive' -- law 71's proactive-says-nothing posture (PRD invariant 2(c)/11).
  const proactiveLeak = (await rootQuery(
    "select count(*)::int n from clara.wake_fn_allowlist where function_name = any($1::text[]) and wake_kind = 'proactive'",
    [PR2_WRAPPERS])).rows[0].n;
  assert.equal(proactiveLeak, 0, "no F-A5 PR-2 wrapper is ever admitted under the proactive kind");
  // the one extraction that gets NO wrapper (design SS3.1 A.1) must carry no allowlist row either.
  const enqueueLeak = (await rootQuery(
    "select count(*)::int n from clara.wake_fn_allowlist where function_name = 'wake_enqueue_render_job'")).rows[0].n;
  assert.equal(enqueueLeak, 0, "wake_enqueue_render_job carries no allowlist row -- A.1 never names it");
});

// =============================================================================================
// C1 -- the delta four-writer census stays unmoved (survey C1; tests/eta-contract.test.mjs:172-190
// re-run unchanged elsewhere). Re-asserted here as a live PR-2-scoped positive check.
// =============================================================================================
test("C1 -- the app-executable metric-definition writer census is still exactly FOUR (the human verbs), unmoved by PR-2", async (t) => {
  if (!ready) return skipHere(t, "PR-2 is absent");
  const rows = (await rootQuery(
    `select distinct f.oid::regprocedure::text sig
       from pg_proc f
       cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
         'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
       join pg_roles g on g.rolname = app.rolname
      where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
        and lower(f.prosrc) ~ '(insert\\s+into|update|delete\\s+from|merge\\s+into)\\s+clara\\.(metric_definitions|metric_definition_versions)\\M'
      order by 1`)).rows;
  assert.equal(rows.length, 4, `expected 4 app-executable definition writers, found: ${rows.map((r) => r.sig).join(", ")}`);
  for (const r of rows) {
    assert.ok(!r.sig.startsWith("clara.wake_") && !r.sig.startsWith("clara._agent_"),
      `${r.sig} must be a human verb, not an agent-lane addition`);
  }
});
