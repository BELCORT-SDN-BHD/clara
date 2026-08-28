// P4 tranche-1 -- regression: clara.add_member's recut (its body now delegates to the new
// _add_member_core, §D) must refuse and succeed EXACTLY as the live 0005 body did. This is a
// focused smoke test of the four walls the extraction moved, not a re-litigation of the wider
// Slice-2 add_member coverage that already runs elsewhere in the estate suite.

import test from "node:test";
import assert from "node:assert/strict";
import { CLR, opk, rootQuery, humanQuery, insertUser, createFirm, seedAdmission, AGENT_USER_ID, membershipId } from "./rig-fixtures.mjs";

async function scene(tag) {
  const owner = await insertUser("p4t1amreg", `${tag}_owner`);
  const token = await seedAdmission(`p4t1-amreg-${tag}`);
  const firm = await createFirm(owner, { name: `P4T1 AM Regression ${tag} ${Date.now()}`, token, opKey: opk(`firm_${tag}`) });
  return { firm, owner };
}

test("p4t1.add_member_regression: a non-admin refuses CLR04", async () => {
  const sc = await scene("floor");
  const viewer = await insertUser("p4t1amreg", "floor_viewer");
  await humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc.firm, viewer, "viewer", opk("floor_seed")]);
  const target = await insertUser("p4t1amreg", "floor_target");
  await assert.rejects(
    () => humanQuery(viewer, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc.firm, target, "viewer", opk("floor_try")]),
    (e) => e.code === CLR.authz,
  );
});

test("p4t1.add_member_regression: an unknown role refuses CLR10", async () => {
  const sc = await scene("badrole");
  const target = await insertUser("p4t1amreg", "badrole_target");
  await assert.rejects(
    () => humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc.firm, target, "superadmin", opk("badrole")]),
    (e) => e.code === CLR.badRequest,
  );
});

test("p4t1.add_member_regression: the agent identity cannot be added (HIGH-11, CLR10) -- now enforced inside _add_member_core", async () => {
  const sc = await scene("agent");
  await assert.rejects(
    () => humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc.firm, AGENT_USER_ID, "viewer", opk("agent")]),
    (e) => e.code === CLR.badRequest,
  );
});

test("p4t1.add_member_regression: a user with an active membership elsewhere refuses CLR10 (the global unique index, now checked inside the core)", async () => {
  const sc1 = await scene("dupA");
  const sc2 = await scene("dupB");
  const person = await insertUser("p4t1amreg", "dup_person");
  await humanQuery(sc1.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc1.firm, person, "viewer", opk("dup1")]);
  await assert.rejects(
    () => humanQuery(sc2.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc2.firm, person, "viewer", opk("dup2")]),
    (e) => e.code === CLR.badRequest,
  );
});

test("p4t1.add_member_regression: a cross-firm p_firm refuses CLR11 (still checked at the entrance, not the core)", async () => {
  const sc1 = await scene("crossA");
  const sc2 = await scene("crossB");
  const target = await insertUser("p4t1amreg", "cross_target");
  await assert.rejects(
    () => humanQuery(sc1.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc2.firm, target, "viewer", opk("cross")]),
    (e) => e.code === CLR.notFound,
  );
});

test("p4t1.add_member_regression: a successful add mints an active membership, an op_key replay is idempotent, and both _audit + member.added land", async () => {
  const sc = await scene("happy");
  const target = await insertUser("p4t1amreg", "happy_target");
  const key = opk("happy");
  const r1 = await humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4) as receipt", [sc.firm, target, "bookkeeper", key]);
  const r2 = await humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4) as receipt", [sc.firm, target, "bookkeeper", key]);
  assert.deepEqual(r2.rows[0].receipt, r1.rows[0].receipt);

  const mid = await membershipId(sc.firm, target, "active");
  assert.ok(mid);
  const audit = await rootQuery("select fn from clara.audit_log where firm_id = $1 and fn = 'add_member' order by at desc limit 1", [sc.firm]);
  assert.equal(audit.rows[0].fn, "add_member");
  const evt = await rootQuery("select event_type from clara.domain_events where firm_id = $1 order by seq desc limit 1", [sc.firm]);
  assert.equal(evt.rows[0].event_type, "member.added");
});
