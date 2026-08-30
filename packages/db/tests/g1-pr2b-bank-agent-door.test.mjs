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
import { rootQuery, endPool } from "./rig-fixtures.mjs";

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

/** The EXACT EXECUTE-grantee matrix, sorted — the coa-template-pr-a.test.mjs:203 idiom (aclexplode,
 *  privilege_type='EXECUTE'), which catches an ADDITIONAL wrong grantee that has_function_privilege
 *  spot-checks would miss (Codex r1's own M5 mutant: `grant ... to clara_wake_bank`). */
async function execMatrix(sig) {
  const r = await rootQuery(
    `select coalesce(string_agg(g.grantee::regrole::text, ',' order by g.grantee::regrole::text), '<none>') as acl
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

test("emit_bank_agent_due: the EXACT EXECUTE matrix is clara_fn_owner (the owner's own materialized grant) + clara_runtime, and nothing else", { skip: skipEmit }, async () => {
  assert.equal(await execMatrix(EMIT_SIG), "clara_fn_owner,clara_runtime");
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

test("claim_close_prep_task: the EXACT EXECUTE matrix is clara_fn_owner (the owner's own materialized grant) + clara_runtime, and nothing else", { skip: skipClaim }, async () => {
  assert.equal(await execMatrix(CLAIM_SIG), "clara_fn_owner,clara_runtime");
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
