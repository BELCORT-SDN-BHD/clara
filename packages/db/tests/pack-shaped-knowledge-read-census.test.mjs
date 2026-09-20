// #991 -- THE PACK-SHAPED-READ OWNERSHIP RULE, AS A CLASS, NOT A FUNCTION.
//
// Owner's ruling (2026-09-20, issue #991): the rule already decided for
// clara.get_knowledge_pack -- runtime-only access while a human reads the raw register -- covers
// the whole CLASS of assembled pack-shaped knowledge reads, not just the one function it
// originally named. Before this file, the mechanical half of that rule lived in two places: the
// function's own migration tail (clara.get_knowledge_pack, 0192) and one lane's hand-written,
// hand-listed assertion (knowledge-retrieval.test.mjs `p658.retrieve.no_human_grant`, #783), which
// hand-lists three functions against a hand-listed set of eight roles. Nothing stated or verified
// the rule AT THE LEVEL OF THE SHAPE, so the second lane to build a pack-shaped read had to
// re-derive the same proof by hand.
//
// THIS FILE is that class's own census cell. The enumeration below is DATA: a fifth pack-shaped
// read is a new array entry (pkc.4 proves it), never a new assertion.
//
// SEEDED CLASS (four, all confirmed clara_runtime-only on main at the time of #991):
//   clara.get_knowledge_pack         (0192)
//   clara.retrieve_knowledge         (0230, #658)
//   clara.read_knowledge_record_for  (0230, #658)
//   clara.read_knowledge_history_for (0230, #658)
//
// clara.get_context_pack is DELIBERATELY excluded: it is granted to clara_authenticated and
// clara_agent_ro BY DESIGN (0005:1137) and is not a knowledge pack -- #991's own out-of-scope.
// pkc.4/pkc.5 prove the exclusion is a curation choice, never the detector being blind to it.
//
// THE PROBE generalizes the hand-written one #783 first wrote: `executors()` reads EVERY
// clara-custom role that holds EXECUTE on a signature straight off the catalog through
// `has_function_privilege` (the same instrument f-a2-grants.test.mjs's own `executors()` uses,
// and the reason it is used rather than reading `proacl` alone -- `proacl` is NULL/empty under
// the default PUBLIC grant, which would then read "nobody" when it means "everybody"). A role
// this file has never heard of, born in a migration written after #991 landed, is caught exactly
// like one of the eight the original hand list named.
//
// Both directions are one measurement: clara_runtime must be among a function's executors, and
// nothing else may be (`clara_fn_owner` excepted -- it owns every definer body by construction,
// "the owner can run its own body" is not a boundary, f-a2-grants.test.mjs's APP_ROLES comment).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, getPool, endPool, ensureReady, rootQuery,
} from "./rig-helpers.mjs";

/** The class, seeded 2026-09-20 (#991). Exact identities, as pg_get_function_identity_arguments
 *  reports them -- the readiness gate below resolves each through `to_regprocedure` and skips
 *  loudly (never silently passes) if one is absent from the catalog. */
export const PACK_SHAPED_KNOWLEDGE_READS = [
  "clara.get_knowledge_pack(uuid,text,uuid)",
  "clara.retrieve_knowledge(uuid,text,date,text[],integer,uuid)",
  "clara.read_knowledge_record_for(uuid,uuid,uuid)",
  "clara.read_knowledge_history_for(uuid,uuid,uuid)",
];

/** Deliberately OUTSIDE the class (#991's own acceptance criteria): an assembled read of a
 *  different purpose, human/agent-read granted by design. Named once so pkc.4/pkc.5 can prove
 *  the boundary is drawn on purpose rather than the detector missing it. */
const NOT_A_KNOWLEDGE_PACK = "clara.get_context_pack(uuid,text)";

/** Every clara-custom role holding EXECUTE on `signature`, read straight off the live catalog.
 *  `query` is whichever connection the caller passes -- the root pool for a clean read, or a
 *  transaction-scoped client for the CONTROL below, so a real, uncommitted GRANT is visible to
 *  this same probe without leaking onto any other session. */
async function executors(query, signature) {
  const r = await query(
    `select r.rolname from pg_roles r
      where r.rolname like 'clara%'
        and has_function_privilege(r.rolname, $1::regprocedure, 'EXECUTE')
      order by r.rolname`,
    [signature],
  );
  return r.rows.map((x) => x.rolname);
}

/**
 * THE CENSUS. For every signature in `functions` (data, never hand-edited per finding): assert
 * clara_runtime holds EXECUTE and no other application role does. Returns FINDINGS as data
 * (never throws), so both a clean read and a deliberately broken one can inspect exactly what
 * was seen -- the shape opcen.* (operation-census.test.mjs) and the f-a2/f-a4 census cells all
 * share in this estate.
 */
async function packShapedReadFindings({ query = rootQuery, functions = PACK_SHAPED_KNOWLEDGE_READS } = {}) {
  const findings = [];
  for (const fn of functions) {
    const holders = await executors(query, fn);
    if (!holders.includes(ROLES.runtime)) {
      findings.push({
        label: "runtime_missing", function: fn, role: ROLES.runtime,
        detail: `clara_runtime must hold EXECUTE on ${fn} and does not`,
      });
    }
    for (const role of holders) {
      if (role === ROLES.runtime || role === ROLES.fnOwner) continue;
      findings.push({
        label: "unexpected_grantee", function: fn, role,
        detail: `${role} must NOT hold EXECUTE on the pack-shaped read ${fn}`,
      });
    }
  }
  return findings;
}

let ready = false;
before(async () => {
  await ensureReady();
  const r = await rootQuery(
    "select bool_and(to_regprocedure(f) is not null) as ok from unnest($1::text[]) f",
    [PACK_SHAPED_KNOWLEDGE_READS],
  );
  ready = r.rows[0].ok === true;
});
after(endPool);

function unready(t) {
  if (!ready) {
    t.skip("#991: one or more of the seeded pack-shaped knowledge reads is absent from this catalog");
    return true;
  }
  return false;
}

test("pkc.1 the class census: all four seeded pack-shaped knowledge reads are clara_runtime's alone, against the LIVE grants", async (t) => {
  if (unready(t)) return;
  assert.deepEqual(await packShapedReadFindings(), [],
    "the pack-shaped-read class carries an unexpected grant or a missing runtime grant");
});

test("pkc.2 the census asserts POSITIVELY that clara_runtime holds EXECUTE, not only that nobody else does", async (t) => {
  if (unready(t)) return;
  for (const fn of PACK_SHAPED_KNOWLEDGE_READS) {
    const holders = await executors(rootQuery, fn);
    assert.ok(holders.includes(ROLES.runtime),
      `clara_runtime must be among ${fn}'s executors, got ${JSON.stringify(holders)}`);
  }
});

test("pkc.3 CONTROL: a real GRANT to a human role on an enumerated function is caught, naming the function and the role -- rolled back, never committed", async (t) => {
  if (unready(t)) return;
  const target = PACK_SHAPED_KNOWLEDGE_READS[0];
  const client = await getPool().connect();
  try {
    await client.query("reset role");
    await client.query("begin");
    await client.query(`grant execute on function ${target} to ${ROLES.authenticated}`);
    const scopedQuery = (sql, params) => client.query(sql, params);
    const findings = await packShapedReadFindings({ query: scopedQuery });
    const hit = findings.find((f) => f.label === "unexpected_grantee"
      && f.function === target && f.role === ROLES.authenticated);
    assert.ok(hit,
      `expected the leaked grant on ${target} to ${ROLES.authenticated} to be reported, got ${JSON.stringify(findings)}`);
  } finally {
    await client.query("rollback").catch(() => {});
    await client.query("reset all").catch(() => {});
    client.release();
  }
  // The rollback actually cleared it -- read OUTSIDE the transaction, on the root pool.
  assert.deepEqual(await packShapedReadFindings(), [], "the control's GRANT survived its own rollback");
});

test("pkc.4 a fifth, correctly runtime-only entry is a DATA change only; get_context_pack, run through the same detector, proves the exclusion is curation not blindness", async (t) => {
  if (unready(t)) return;
  // clara.work_knowledge_drift_for is clara_runtime-only on main (#658 tail) but is NOT a member
  // of the seeded class above -- passing it through the SAME function with no code change proves
  // that adding a pack-shaped read touches the enumeration, never the logic.
  const fifth = "clara.work_knowledge_drift_for(uuid,uuid)";
  const live = (await rootQuery("select to_regprocedure($1) is not null as ok", [fifth])).rows[0].ok;
  if (!live) { t.skip("clara.work_knowledge_drift_for is absent from this catalog"); return; }
  const extended = [...PACK_SHAPED_KNOWLEDGE_READS, fifth];
  assert.deepEqual(await packShapedReadFindings({ functions: extended }), [],
    "a fifth, correctly runtime-only entry must pass with no change to the census logic");

  // ...and the NEGATIVE: clara.get_context_pack, run through the identical detector, IS flagged --
  // so its absence from the seeded class above is a deliberate curation of the CLASS (#991's own
  // out-of-scope: "not a knowledge pack"), never the detector failing to see its grants.
  const contextPackFindings = await packShapedReadFindings({ functions: [NOT_A_KNOWLEDGE_PACK] });
  assert.ok(
    contextPackFindings.some((f) => f.label === "unexpected_grantee" && f.role === ROLES.authenticated),
    "get_context_pack's clara_authenticated grant would trip the same detector -- excluded by curation, not blindness",
  );
  assert.ok(
    contextPackFindings.some((f) => f.label === "unexpected_grantee" && f.role === ROLES.agentRo),
    "and its clara_agent_ro grant likewise",
  );
});

test("pkc.5 clara.get_context_pack itself is untouched by this file: still clara_authenticated + clara_agent_ro, and never a member of the seeded class", async (t) => {
  if (unready(t)) return;
  assert.ok(!PACK_SHAPED_KNOWLEDGE_READS.includes(NOT_A_KNOWLEDGE_PACK),
    "get_context_pack must never be swept into the pack-shaped-read enumeration");
  const holders = await executors(rootQuery, NOT_A_KNOWLEDGE_PACK);
  assert.ok(holders.includes(ROLES.authenticated), "get_context_pack keeps its clara_authenticated grant");
  assert.ok(holders.includes(ROLES.agentRo), "get_context_pack keeps its clara_agent_ro grant");
});
