// 0042 Wave D-b — THE DUE-ORACLE ADMISSION BATTERY (owner ruling 2026-08-03, WDB-R1/R2/R4).
//
// WHY THIS FILE EXISTS AND WHY IT COVERS TWO FAMILIES AT ONCE. The ruling closed a
// fail-open that lived in BOTH members of the due-oracle family — `clara.adjustment_run_due`
// (0042) and `clara.depreciation_run_due` (0041, LIVE IN PRODUCTION since the D-a ceremony).
// Both hand-rolled the same admission arithmetic and both were wrong the same way, so the
// fix is ONE shared predicate, `clara._assert_due_read_ctx` (migration §S2.0), consulted by
// both. A proof split across the adjustment battery and the FA battery would let one member
// regress while the other stayed green — which is the exact failure WDB-R2 forbids. So the
// cells below ask EVERY question of BOTH oracles, in one place, from one table.
//
// THE DEFECT, IN ONE SENTENCE. The old guard was `if v_jwt is not null and v_jwt <> v_firm
// then raise`, and `clara.jwt_firm()` reads only `status = 'active'` memberships — so it
// returns NULL the moment a membership is REVOKED while the user's JWT is still valid and
// still presents a sub. The comparison was skipped exactly when it mattered, and a SECURITY
// DEFINER body with unconditional RLS visibility handed a removed employee another firm's
// schedule.
//
// WHY THE FIX IS NOT A BARE NULL-REJECTION, AND WHAT THAT COSTS THIS FILE. The leader sweep
// (packages/runtime/lib/leader.mjs) calls both oracles under `set role clara_runtime` with NO
// JWT BY DESIGN — that is *why* null passed. A bare null-raise would silently disable the
// daily sweep, a worse outcome than the hole. The predicate therefore discriminates the
// CALLER, not the VALUE, and this file must prove BOTH directions: the human hole is shut AND
// the machine lane still opens. A file that only proved the refusal would be indistinguishable
// from a file guarding a dead sweep.
//
// WDB-R4 — "a cell that only walks its own fix's path proves nothing". The fix's own path is
// "revoked human is refused". The questions the fix did NOT set out to answer are cells d5–d8:
// the claims-less caller nobody listed, the existence-oracle the early `client_not_found`
// return left open, the lawful roles that must NOT have lost their answer, and a catalog
// census that fails if a future body hand-rolls a THIRD copy of this admission rule.
//
// CONTRACT-BLIND (see the x42-adj-core.mjs header): this lane never reads 0042's SQL. Every
// object is built THROUGH the audited verbs — the revocation included, via
// `clara.remove_member`, so the fixture is a real revocation and not a status column poked
// behind the verb's back.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  noteLane, endPool, printLaneNotes, printSkipCount,
  x42EnsureReady, skip42, caught, opk,
  ROLES, rootQuery, humanQuery, roleQuery,
  freshAdjFirm,
} from "./x42-adj-helpers.mjs";

let live = false;
let f = null;      // the dedicated firm/client/users this file revokes inside
let revoked = null; // the user whose membership was removed while their JWT stays valid

const skipHere = (t) => skip42(t, live, "the due-oracle admission battery");

// The two family members, asked identically. Adding a member to this table is how a future
// oracle joins the family — every cell below iterates it, so a new entry is covered by all
// of them at once and cannot be onboarded with a hand-rolled guard nobody tested.
const ORACLES = [
  { name: "adjustment_run_due", sql: "select clara.adjustment_run_due(p_client => $1) as r", born: "0042" },
  { name: "depreciation_run_due", sql: "select clara.depreciation_run_due(p_client => $1) as r", born: "0041 (LIVE)" },
];

before(async () => {
  live = await x42EnsureReady();
  if (!live) return;
  // A DEDICATED firm, so revoking a membership can never leak into another cell's world.
  f = await freshAdjFirm("dueadm");
  revoked = f.users.keeper;
  // Revoke THROUGH the audited verb, as an owner would. The user row and their JWT sub are
  // untouched — which is the whole point: the credential stays valid, the authority does not.
  const m = await rootQuery(
    "select id from clara.firm_memberships where firm_id = $1 and user_id = $2 and status = 'active'",
    [f.firm, revoked]);
  assert.ok(m.rows[0]?.id, "fixture: the bookkeeper's active membership must exist before revocation");
  await humanQuery(f.users.owner,
    "select clara.remove_member(p_membership => $1, p_op_key => $2)", [m.rows[0].id, opk("x42dueadm")]);
  const after_ = await rootQuery(
    "select status from clara.firm_memberships where firm_id = $1 and user_id = $2 order by created_at desc limit 1",
    [f.firm, revoked]);
  assert.equal(after_.rows[0]?.status, "removed", "fixture: the membership must now be 'removed'");
  noteLane(`x42 due-admission fixture: ${revoked} revoked from firm ${f.firm} via clara.remove_member`);
});

after(async () => {
  printLaneNotes("x42-due-admission");
  printSkipCount("x42-due-admission");
  await endPool();
});

// ---------------------------------------------------------------------------
// (a) THE RULED DEFECT — a revoked human is REFUSED by BOTH oracles.
// ---------------------------------------------------------------------------

test("x42.d1 a REVOKED membership with a still-valid JWT is refused by BOTH due oracles (the ruled fail-open)", async (t) => {
  if (skipHere(t)) return;
  // BEFORE the fix this returned a schedule instead of raising: jwt_firm() went null on the
  // revoked membership, the `is not null` guard passed, and the definer body answered.
  for (const o of ORACLES) {
    const err = await caught(() => humanQuery(revoked, o.sql, [f.client]));
    assert.ok(err, `${o.name} [${o.born}]: a revoked member got an ANSWER — the fail-open is back`);
    assert.equal(err.code, "CLR04",
      `${o.name}: expected CLR04 (clara._human_ctx's 'actor has no active membership'); got ${err.code} — ${err.message}`);
    noteLane(`x42.d1 ${o.name}: revoked member refused ${err.code} "${err.message}"`);
  }
});

// ---------------------------------------------------------------------------
// (b) NO COLLATERAL DAMAGE — the lawful human still gets an answer.
// ---------------------------------------------------------------------------

test("x42.d2 a LIVE member of the client's own firm still reads BOTH oracles", async (t) => {
  if (skipHere(t)) return;
  for (const o of ORACLES) {
    const r = await humanQuery(f.users.owner, o.sql, [f.client]);
    assert.ok(r.rows[0].r && typeof r.rows[0].r === "object",
      `${o.name}: a lawful member must still receive the due envelope`);
    assert.equal(typeof r.rows[0].r.due, "boolean",
      `${o.name}: the envelope must still carry a boolean 'due' (the ABI shape is unchanged)`);
  }
});

test("x42.d3 a live member of ANOTHER firm is still refused CLR11 — the pre-existing wall did not move", async (t) => {
  if (skipHere(t)) return;
  const other = await freshAdjFirm("dueadm_other");
  for (const o of ORACLES) {
    const err = await caught(() => humanQuery(other.users.owner, o.sql, [f.client]));
    assert.ok(err, `${o.name}: a cross-firm read SUCCEEDED`);
    assert.equal(err.code, "CLR11",
      `${o.name}: cross-firm must stay CLR11 'client is not in your firm'; got ${err.code} — ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// (c) THE MACHINE LANE SURVIVES — the half whose absence would be worse than the hole.
// ---------------------------------------------------------------------------

test("x42.d4 the RUNTIME lane (role clara_runtime, NO JWT) still reads BOTH oracles — the leader sweep is not dark", async (t) => {
  if (skipHere(t)) return;
  for (const o of ORACLES) {
    const r = await roleQuery(ROLES.runtime, o.sql, [f.client]);
    assert.ok(r.rows[0].r && typeof r.rows[0].r === "object",
      `${o.name}: the JWT-less runtime lane MUST still be admitted — refusing it silently disables the daily sweep, which is a worse outcome than the hole this fix closes`);
    assert.equal(typeof r.rows[0].r.due, "boolean", `${o.name}: the sweep's envelope shape is unchanged`);
    noteLane(`x42.d4 ${o.name}: runtime lane admitted with no JWT (due=${r.rows[0].r.due})`);
  }
});

// ---------------------------------------------------------------------------
// (d) WDB-R4 — THE QUESTIONS THE FIX DID NOT SET OUT TO ANSWER.
// ---------------------------------------------------------------------------

test("x42.d5 a CLAIMS-LESS caller on a human role is refused by BOTH oracles (nobody listed this case; the old guard admitted it too)", async (t) => {
  if (skipHere(t)) return;
  // Not the revoked case and not the cross-firm case: a session on clara_authenticated that
  // never presented claims at all. The old `v_jwt is not null` guard passed this exactly as
  // it passed the revoked one — same null, same silent admission — so a fix aimed only at
  // revocation would have left it open. It must land on CLR03, not on an answer.
  for (const o of ORACLES) {
    const err = await caught(() => roleQuery(ROLES.authenticated, o.sql, [f.client]));
    assert.ok(err, `${o.name}: an anonymous claims-less session got an ANSWER`);
    assert.equal(err.code, "CLR03",
      `${o.name}: expected CLR03 'no valid read context' (the clara.coding_lane wording); got ${err.code} — ${err.message}`);
  }
});

test("x42.d6 an unadmitted caller cannot use these oracles to probe which client ids EXIST", async (t) => {
  if (skipHere(t)) return;
  // The oracles resolve the client's firm BEFORE admission (the predicate needs it), and both
  // used to return {reason:'client_not_found'} for an unknown id with no authorisation check
  // at all — an existence oracle for anyone who could reach the function. The verdict now
  // lands before ANY branch returns, so a revoked caller must get the SAME refusal for a
  // real client and for a fabricated uuid: the two cases must be indistinguishable.
  const NONEXISTENT = "00000000-0000-4000-8000-0000deadbeef";
  for (const o of ORACLES) {
    const real = await caught(() => humanQuery(revoked, o.sql, [f.client]));
    const fake = await caught(() => humanQuery(revoked, o.sql, [NONEXISTENT]));
    assert.ok(fake, `${o.name}: a revoked caller learned that a fabricated client id does not exist`);
    assert.equal(fake.code, real.code,
      `${o.name}: a real client and a fabricated one must be indistinguishable to an unadmitted caller (real=${real?.code}, fake=${fake.code})`);
    assert.equal(fake.message, real.message,
      `${o.name}: the refusal TEXT must not differ either (real="${real?.message}", fake="${fake.message}")`);
  }
});

test("x42.d7 EVERY lawful role keeps its answer — the viewer floor took nothing away", async (t) => {
  if (skipHere(t)) return;
  // The human arm now delegates to clara._human_ctx at the VIEWER floor. viewer is rank 0,
  // so this should cost no lawful member anything — but "should" is not a measurement, and a
  // floor set one rank too high would quietly break the least-privileged staff first, i.e.
  // the people least likely to be running the acceptance suite.
  const g = await freshAdjFirm("dueadm_roles");
  const viewerUser = (await rootQuery(
    "insert into clara.users (id, display_name, email, is_agent) values (gen_random_uuid(), $1, $2, false) returning id",
    [`x42dueadm_viewer_${Date.now()}`, `x42dueadm_viewer_${Date.now()}@rig.test`])).rows[0].id;
  await humanQuery(g.users.owner,
    "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)",
    [g.firm, viewerUser, "viewer", opk("x42dueadmv")]);
  const cast = [
    ["owner", g.users.owner], ["admin", g.users.admin],
    ["bookkeeper", g.users.keeper], ["viewer", viewerUser],
  ];
  for (const o of ORACLES) {
    for (const [role, sub] of cast) {
      const r = await humanQuery(sub, o.sql, [g.client]);
      assert.ok(r.rows[0].r && typeof r.rows[0].r === "object",
        `${o.name}: a lawful ${role} must still read the due envelope`);
    }
  }
  noteLane("x42.d7 all four membership roles (owner/admin/bookkeeper/viewer) still read both oracles");
});

test("x42.d8 the family is WHOLE — exactly two bodies decide on jwt_firm() this way, and both go through the ONE shared predicate", async (t) => {
  if (skipHere(t)) return;
  // The census, not the two bodies we happened to look at. Two independent questions:
  //   (1) both due oracles consult the shared predicate — a fix that landed on one member is
  //       precisely the split the ruling forbids; and
  //   (2) NO body anywhere in the schema still carries the fail-open SHAPE. This is the arm
  //       that catches a future author copying the old guard into a third oracle: it greps
  //       the live catalog rather than trusting this wave's memory of the census.
  const consumers = await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
        and p.prosrc like '%clara._assert_due_read_ctx(%' order by 1`);
  assert.deepEqual(consumers.rows.map((x) => x.proname), ["adjustment_run_due", "depreciation_run_due"],
    "both due oracles — and only they — must consult clara._assert_due_read_ctx");

  const failOpen = await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
        and p.prosrc like '%is not null and%<> v_firm%' order by 1`);
  assert.deepEqual(failOpen.rows.map((x) => x.proname), [],
    `these bodies still carry the null-tolerant firm guard: ${failOpen.rows.map((x) => x.proname).join(", ")}`);

  // And the predicate itself must stay unreachable from every caller-facing role: it is an
  // internal assertion, never something a client can invoke to probe its own admission.
  const acl = await rootQuery(
    "select coalesce(array_to_string(p.proacl::text[], ' '), '(default)') as acl from pg_proc p " +
    "where p.oid = 'clara._assert_due_read_ctx(uuid)'::regprocedure");
  for (const role of [ROLES.authenticated, ROLES.runtime, ROLES.agentRo]) {
    assert.ok(!acl.rows[0].acl.includes(`${role}=X`),
      `clara._assert_due_read_ctx must not be granted to ${role} — it is an internal predicate`);
  }
});
