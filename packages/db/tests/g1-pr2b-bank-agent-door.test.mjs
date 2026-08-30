// Gate G1 PR-2b — FIND-1 (opus r1 review of #449): "add a packages/db test cell for the door —
// zero exist today." The runtime package's own battery
// (packages/runtime/tests/g1-producers-bank-agent-security.test.mjs) already drives
// emit_bank_agent_due/claim_close_prep_task BEHAVIOURALLY; this file is the packages/db-side
// CATALOG proof — ownership, SECURITY DEFINER, search_path, and the EXACT EXECUTE matrix
// (aclexplode, the coa-template-pr-a.test.mjs:203 idiom) — so the estate suite's own
// migrate-then-test leg (ADR-0073) proves the door's shape independent of the runtime package.
//
// Migration: packages/db/migrations/UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql (not yet merged
// at authoring time — numbered at merge prep). GATING is on the CATALOG (to_regprocedure), never
// on a migration number or filename, so this file is inert (all cells skip, loudly, with a named
// reason) against any database that has not applied it yet — including `main` today.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, roleQuery, endPool } from "./rig-fixtures.mjs";

const EMIT_SIG = "clara.emit_bank_agent_due(uuid,uuid,text,text)";
const CLAIM_SIG = "clara.claim_close_prep_task(uuid,uuid,uuid,text)";

async function present(sig) {
  const r = await rootQuery("select to_regprocedure($1) is not null as ok", [sig]);
  return r.rows[0]?.ok === true;
}

const hasEmit = await present(EMIT_SIG);
const hasClaim = await present(CLAIM_SIG);
const skipEmit = hasEmit ? false : `${EMIT_SIG} absent — apply UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql first`;
const skipClaim = hasClaim ? false : `${CLAIM_SIG} absent — apply UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql first`;

after(async () => { await endPool(); });

/** The EXACT EXECUTE ACL tuples (grantor/grantee/privilege/grantable), sorted — the
 *  coa-template-pr-a.test.mjs:203 idiom extended per R2-3 (Codex r2 review of #449): a
 *  grantee-only aggregate would miss a wrong GRANTOR or a WITH GRANT OPTION mutant. */
async function execMatrix(sig) {
  const r = await rootQuery(
    `select coalesce(string_agg(format('%s/%s/%s/%s', g.grantor::regrole::text, g.grantee::regrole::text, g.privilege_type, g.is_grantable), ',' order by g.grantee::regrole::text), '<none>') as acl
       from pg_proc p, aclexplode(p.proacl) g
      where p.oid = to_regprocedure($1) and g.privilege_type = 'EXECUTE'`,
    [sig],
  );
  return r.rows[0].acl;
}

test("emit_bank_agent_due: owned by clara_fn_owner, SECURITY DEFINER, search_path pinned", { skip: skipEmit }, async () => {
  const r = await rootQuery(
    `select p.proowner::regrole::name as owner, p.prosecdef as secdef,
            'search_path=clara, pg_temp' = any(coalesce(p.proconfig, '{}'::text[])) as path_pinned
       from pg_proc p where p.oid = to_regprocedure($1)`,
    [EMIT_SIG],
  );
  assert.equal(r.rows[0].owner, "clara_fn_owner");
  assert.equal(r.rows[0].secdef, true);
  assert.equal(r.rows[0].path_pinned, true);
});

test("emit_bank_agent_due: the EXACT EXECUTE ACL tuples are clara_fn_owner (the owner's own materialized grant) + clara_runtime, both non-grantable, and nothing else", { skip: skipEmit }, async () => {
  assert.equal(await execMatrix(EMIT_SIG), "clara_fn_owner/clara_fn_owner/EXECUTE/f,clara_fn_owner/clara_runtime/EXECUTE/f");
});

test("claim_close_prep_task: owned by clara_fn_owner, SECURITY DEFINER, search_path pinned", { skip: skipClaim }, async () => {
  const r = await rootQuery(
    `select p.proowner::regrole::name as owner, p.prosecdef as secdef,
            'search_path=clara, pg_temp' = any(coalesce(p.proconfig, '{}'::text[])) as path_pinned
       from pg_proc p where p.oid = to_regprocedure($1)`,
    [CLAIM_SIG],
  );
  assert.equal(r.rows[0].owner, "clara_fn_owner");
  assert.equal(r.rows[0].secdef, true);
  assert.equal(r.rows[0].path_pinned, true);
});

test("claim_close_prep_task: the EXACT EXECUTE ACL tuples are clara_fn_owner (the owner's own materialized grant) + clara_runtime, both non-grantable, and nothing else", { skip: skipClaim }, async () => {
  assert.equal(await execMatrix(CLAIM_SIG), "clara_fn_owner/clara_fn_owner/EXECUTE/f,clara_fn_owner/clara_runtime/EXECUTE/f");
});

test("clara_runtime still cannot execute _append_event directly — the narrow-door design is not defeated", { skip: skipEmit }, async () => {
  const sig = "clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)";
  const r = await rootQuery("select has_function_privilege('clara_runtime', $1, 'execute') as ok", [sig]);
  assert.equal(r.rows[0].ok, false);
});

test("uq_agent_task_one_live_close_prep: present BY PROPERTY (unique+valid+ready+live, key=client_id)", { skip: skipClaim }, async () => {
  const r = await rootQuery(
    `select x.indisunique, x.indisvalid, x.indisready, x.indislive,
            (select array_to_json(array_agg(a.attname::text order by k.ord))
               from unnest(x.indkey) with ordinality as k(attnum, ord)
               join pg_attribute a on a.attrelid = x.indrelid and a.attnum = k.attnum) as keys
       from pg_index x where x.indexrelid = to_regclass('clara.uq_agent_task_one_live_close_prep')`,
  );
  const row = r.rows[0];
  assert.ok(row, "the index must exist");
  assert.equal(row.indisunique && row.indisvalid && row.indisready && row.indislive, true);
  assert.deepEqual(row.keys, ["client_id"]);
});

// =====================================================================================
// R2-3 (Codex r2 review of #449): the battery above never actually DROVE the door AS
// clara_runtime, only read catalog metadata as root. Drive both doors under the real role, and
// assert explicit denials on the claim tables' direct SELECT/DELETE (clara_runtime must go
// through the SECURITY DEFINER doors only, never touch the claim rows directly).
// =====================================================================================

test("emit_bank_agent_due: driven AS clara_runtime, refuses an unknown client with CLR10 (not merely readable by root)", { skip: skipEmit }, async () => {
  await assert.rejects(
    roleQuery("clara_runtime", "select clara.emit_bank_agent_due($1,$2,$3,$4)", [randomUUID(), randomUUID(), "g1pr2b-door-k1", "unmatched_lines"]),
    /CLR10|unknown or inactive client/i,
  );
});

test("emit_bank_agent_due: driven AS clara_runtime, refuses an out-of-set reason with CLR10 (R2-1's own wall, exercised under the real role)", { skip: skipEmit }, async () => {
  await assert.rejects(
    roleQuery("clara_runtime", `select clara.emit_bank_agent_due($1,$2,$3,$4)`, [randomUUID(), randomUUID(), "g1pr2b-door-k2", "chase_statement"]),
    /CLR10|closed emit-worthy reason set/i,
  );
});

test("claim_close_prep_task: driven AS clara_runtime, refuses a blank model_snapshot with CLR10", { skip: skipClaim }, async () => {
  await assert.rejects(
    roleQuery("clara_runtime", `select clara.claim_close_prep_task($1,$2,$3,$4)`, [randomUUID(), randomUUID(), randomUUID(), ""]),
    /CLR10|model_snapshot is required/i,
  );
});

test("clara_runtime cannot SELECT or DELETE either claim table directly — the SECURITY DEFINER door is the only reachable path", { skip: skipEmit || skipClaim }, async () => {
  for (const table of ["bank_agent_due_claims", "close_prep_fy_claims"]) {
    for (const priv of ["select", "delete"]) {
      const r = await rootQuery("select has_table_privilege('clara_runtime', $1, $2) as ok", [`clara.${table}`, priv]);
      assert.equal(r.rows[0].ok, false, `clara_runtime must NOT have ${priv} on clara.${table}`);
    }
    // Behavioural confirmation, not merely the catalog grant read above (review law 2).
    await assert.rejects(roleQuery("clara_runtime", `select 1 from clara.${table} limit 1`), /permission denied/i);
    await assert.rejects(roleQuery("clara_runtime", `delete from clara.${table}`), /permission denied/i);
  }
});

test("R2-3/R1: both claim tables keep the exact owner-ALL + authenticated-SELECT policy roster and authenticated-SELECT-only non-owner ACL", { skip: skipEmit || skipClaim }, async () => {
  const expectedPolicies = {
    bank_agent_due_claims: "p_bank_agent_due_claims_owner/*/clara_fn_owner,p_bank_agent_due_claims_read/r/clara_authenticated",
    close_prep_fy_claims: "p_close_prep_fy_claims_owner/*/clara_fn_owner,p_close_prep_fy_claims_read/r/clara_authenticated",
  };
  for (const [table, policies] of Object.entries(expectedPolicies)) {
    const r = await rootQuery(
      `select
         (select coalesce(string_agg(format('%s/%s/%s', p.polname, p.polcmd,
                    (select string_agg(x::regrole::text, '+' order by x) from unnest(p.polroles) x)),
                    ',' order by p.polname), '<none>')
            from pg_policy p where p.polrelid=c.oid) as policies,
         (select coalesce(string_agg(g.grantee::regrole::text || ':' || g.privilege_type, ','
                    order by g.grantee::regrole::text, g.privilege_type), '<none>')
            from aclexplode(c.relacl) g where g.grantee <> 'clara_fn_owner'::regrole) as non_owner_acl
       from pg_class c where c.oid=('clara.' || $1)::regclass`,
      [table],
    );
    assert.equal(r.rows[0].policies, policies, `${table}: policy roster drifted`);
    assert.equal(r.rows[0].non_owner_acl, "clara_authenticated:SELECT", `${table}: unexpected non-owner table privilege`);
  }
});

// =====================================================================================
// R2-5 (Codex r2 review of #449): the migration's own status-drift guard runs ONLY at apply
// time — it cannot detect a LATER migration widening agent_tasks' status domain. This cell is
// the PERSISTENT twin: it lives in the test suite (re-run on every CI pass, not just this
// migration's own apply), asserting the exact final CHECK text this file's two NOT-IN
// predicates (the close_prep_fy_claims reclaim + uq_agent_task_one_live_close_prep) assume. A
// status-widening mutant must red THIS cell until the two predicates are deliberately updated.
// =====================================================================================

test("R2-5: agent_tasks status CHECK is still the exact nine-value domain this migration's NOT-IN predicates assume", async () => {
  const r = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'clara.agent_tasks'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%queued%'`,
  );
  assert.equal(
    r.rows[0]?.def,
    "CHECK ((status = ANY (ARRAY['queued'::text, 'held'::text, 'running'::text, 'awaiting_input'::text, 'cancel_requested'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'expired'::text])))",
    "agent_tasks' status domain drifted — revisit close_prep_fy_claims' reclaim check and uq_agent_task_one_live_close_prep's predicate (both NOT-IN the five live statuses) before trusting either wall again",
  );
});
