// Member-door rank walls -- #455 review's BLOCKER + M1 + M2, closed by
// migrations/UNNUMBERED_member_door_rank_walls.sql. Direct battery cells on the three doors
// (set_member_role, remove_member, revoke_invite): none of them compared the TARGET's current
// rank to the caller's, and set_member_role/remove_member had no self-act refusal either, so an
// admin could demote or remove any owner but the last in two clicks, or an admin could revoke an
// owner-issued invite. Every MUST-RED cell below is a genuine RED-BEFORE this migration lands --
// each call SUCCEEDED against the pre-fix live bodies (verified by running this exact file against
// a rig with the new migration file withheld; see the PR body) -- and pins the typed
// `detail.reason` the fix ships, not just the shared CLR04 code three different walls now raise.
//
// G14 RULED 裁-94 (2026-09-01 morning): KEEP THE WALL -- a subordinate never acts on a strict
// superior, no self-demotion/self-removal. Not a pending default: these cells prove the ruled
// FAIL-CLOSED behaviour is what actually shipped.

import test from "node:test";
import assert from "node:assert/strict";
import {
  CLR, assertRaises, opk, insertUser, createFirm, seedAdmission, addMember, setMemberRole,
  removeMember, membershipId,
} from "./rig-fixtures.mjs";
import { inviteMember, revokeInvite } from "./p4t1-fixtures.mjs";
import { AGENT_USER_ID, rootQuery } from "./rig-fixtures.mjs";

/** The `detail` reason a Clara refusal carries, so a cell pins the NAME and not just the CLR04
 *  class three different walls in these doors now share (the assigned-role ceiling, the new
 *  target-rank wall, and the new self-act wall all raise CLR04). */
function reason(err) {
  if (!err.detail) return `(no detail) ${err.code ?? ""} ${err.message ?? ""}`;
  try { return JSON.parse(err.detail).reason ?? `(no reason key) ${err.detail}`; }
  catch { return `(unparseable detail) ${err.detail}`; }
}

async function scene(tag) {
  const owner = await insertUser("mdrw", `${tag}_owner`);
  const token = await seedAdmission(`mdrw-${tag}`);
  const firm = await createFirm(owner, { name: `MDRW ${tag} ${Date.now()}`, token, opKey: opk(`mdrwfirm_${tag}`) });
  const admin = await insertUser("mdrw", `${tag}_admin`);
  await addMember(owner, { firm, user: admin, role: "admin", opKey: opk(`mdrwadd_${tag}`) });
  return { firm, owner, admin };
}

// ---------------------------------------------------------------------------
// set_member_role -- target-rank wall (1)
// ---------------------------------------------------------------------------

test("mdrw.rank: set_member_role -- an ADMIN cannot demote a co-OWNER (target outranks caller), refuses CLR04/cannot_act_on_superior [RED-BEFORE: this call SUCCEEDED against the pre-fix body]", async () => {
  const sc = await scene("smr_target");
  const owner2 = await insertUser("mdrw", "smr_target_owner2");
  await addMember(sc.owner, { firm: sc.firm, user: owner2, role: "owner", opKey: opk("smr-target-add-owner2") });
  const owner2Membership = await membershipId(sc.firm, owner2);
  const err = await assertRaises(
    CLR.authz,
    () => setMemberRole(sc.admin, { membership: owner2Membership, role: "bookkeeper", opKey: opk("smr-target-demote") }),
    "set_member_role admin demoting a co-owner",
  );
  assert.equal(reason(err), "cannot_act_on_superior", "must be the NEW target-rank wall, not the pre-existing assigned-role ceiling");
});

test("mdrw.rank: set_member_role -- an OWNER demoting an ADMIN succeeds (positive control: target does not outrank caller)", async () => {
  const sc = await scene("smr_pos1");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  await setMemberRole(sc.owner, { membership: adminMembership, role: "bookkeeper", opKey: opk("smr-pos1-demote") });
});

test("mdrw.rank: set_member_role -- owner-on-owner is allowed (target rank equals caller rank, not STRICTLY greater)", async () => {
  const sc = await scene("smr_pos2");
  const owner2 = await insertUser("mdrw", "smr_pos2_owner2");
  await addMember(sc.owner, { firm: sc.firm, user: owner2, role: "owner", opKey: opk("smr-pos2-add-owner2") });
  const owner2Membership = await membershipId(sc.firm, owner2);
  await setMemberRole(sc.owner, { membership: owner2Membership, role: "admin", opKey: opk("smr-pos2-demote") });
});

test("mdrw.rank: set_member_role -- an ADMIN demoting a BOOKKEEPER succeeds (positive control: target well below caller)", async () => {
  const sc = await scene("smr_pos3");
  const bookkeeper = await insertUser("mdrw", "smr_pos3_bk");
  await addMember(sc.owner, { firm: sc.firm, user: bookkeeper, role: "bookkeeper", opKey: opk("smr-pos3-add-bk") });
  const bkMembership = await membershipId(sc.firm, bookkeeper);
  await setMemberRole(sc.admin, { membership: bkMembership, role: "viewer", opKey: opk("smr-pos3-demote") });
});

// ---------------------------------------------------------------------------
// set_member_role -- self-act refusal (3, M2)
// ---------------------------------------------------------------------------

test("mdrw.self: set_member_role -- an OWNER (NOT the sole owner) cannot change their OWN role, refuses CLR04/cannot_act_on_self [RED-BEFORE: this call SUCCEEDED against the pre-fix body -- the M2 lockout foot-gun]", async () => {
  const sc = await scene("smr_self_owner");
  // A second owner keeps sc.owner from being the SOLE owner -- otherwise this call would hit the
  // carve-out and raise clara._tf_guard_last_owner's CLR09 instead (see the dedicated
  // "SOLE owner demoting themselves" cell below, which pins that exact interaction).
  const owner2 = await insertUser("mdrw", "smr_self_owner_owner2");
  await addMember(sc.owner, { firm: sc.firm, user: owner2, role: "owner", opKey: opk("smr-self-owner-add-owner2") });
  const ownerMembership = await membershipId(sc.firm, sc.owner);
  const err = await assertRaises(
    CLR.authz,
    () => setMemberRole(sc.owner, { membership: ownerMembership, role: "admin", opKey: opk("smr-self-demote") }),
    "set_member_role owner acting on their own membership",
  );
  assert.equal(reason(err), "cannot_act_on_self", "must be the self-act wall -- rank/ceiling would NOT fire here (equal rank, no escalation)");
});

test("mdrw.self: set_member_role -- an ADMIN cannot change their OWN role, refuses CLR04/cannot_act_on_self", async () => {
  const sc = await scene("smr_self_admin");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  const err = await assertRaises(
    CLR.authz,
    () => setMemberRole(sc.admin, { membership: adminMembership, role: "bookkeeper", opKey: opk("smr-self-demote-admin") }),
    "set_member_role admin acting on their own membership",
  );
  assert.equal(reason(err), "cannot_act_on_self", "must be the self-act wall");
});

test("mdrw.self: set_member_role -- the SOLE owner demoting themselves still raises CLR09 (last-owner), NOT this wall's CLR04/cannot_act_on_self [regression found by this PR's own rig run against T14 in rig-isolation.test.mjs -- the self-act wall must carve out the case clara._tf_guard_last_owner already owns]", async () => {
  const owner = await insertUser("mdrw", "smr_sole_owner");
  const token = await seedAdmission("mdrw-smr-sole");
  const firm = await createFirm(owner, { name: `MDRW smr sole owner ${Date.now()}`, token, opKey: opk("mdrw-smr-sole-firm") });
  const ownerMembership = await membershipId(firm, owner);
  await assertRaises(
    CLR.lastOwner,
    () => setMemberRole(owner, { membership: ownerMembership, role: "admin", opKey: opk("smr-sole-demote") }),
    "set_member_role sole owner demoting themselves must still be the last-owner trigger",
  );
});

test("mdrw.self: set_member_role -- the last HUMAN owner is protected even with an AGENT owner present (mutation check: the carve-out's exists-subquery must exclude agents, mirroring clara._tf_guard_last_owner's own `u.is_agent = false` -- dropping that clause would make this cell RED, since the agent would then count as a covering 'other owner' and the self-act wall would wrongly fire CLR04 instead of falling through to CLR09)", async () => {
  await rootQuery("delete from clara.firm_memberships where user_id = $1", [AGENT_USER_ID]);
  const owner = await insertUser("mdrw", "smr_sole_agent_owner");
  const token = await seedAdmission("mdrw-smr-sole-agent");
  const firm = await createFirm(owner, { name: `MDRW smr sole+agent ${Date.now()}`, token, opKey: opk("mdrw-smr-sole-agent-firm") });
  await rootQuery("insert into clara.firm_memberships (firm_id, user_id, role, status) values ($1, $2, 'owner', 'active')", [firm, AGENT_USER_ID]);
  try {
    const ownerMembership = await membershipId(firm, owner);
    await assertRaises(
      CLR.lastOwner,
      () => setMemberRole(owner, { membership: ownerMembership, role: "admin", opKey: opk("smr-sole-agent-demote") }),
      "set_member_role last human owner demoting themselves with an agent owner present must still be the last-owner trigger",
    );
  } finally {
    await rootQuery("delete from clara.firm_memberships where user_id = $1 and firm_id = $2", [AGENT_USER_ID, firm]).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// remove_member -- target-rank wall (1) + wall-first reorder (2)
// ---------------------------------------------------------------------------

test("mdrw.rank: remove_member -- an ADMIN cannot remove a co-OWNER, refuses CLR04/cannot_act_on_superior [RED-BEFORE: this call SUCCEEDED against the pre-fix body -- remove_member had NO rank comparison at all]", async () => {
  const sc = await scene("rm_target");
  const owner2 = await insertUser("mdrw", "rm_target_owner2");
  await addMember(sc.owner, { firm: sc.firm, user: owner2, role: "owner", opKey: opk("rm-target-add-owner2") });
  const owner2Membership = await membershipId(sc.firm, owner2);
  const err = await assertRaises(
    CLR.authz,
    () => removeMember(sc.admin, { membership: owner2Membership, opKey: opk("rm-target-remove") }),
    "remove_member admin removing a co-owner",
  );
  assert.equal(reason(err), "cannot_act_on_superior");
  const still = await membershipId(sc.firm, owner2);
  assert.ok(still, "a refused remove must not have removed the membership");
});

test("mdrw.rank: remove_member -- an OWNER removing an ADMIN succeeds (positive control)", async () => {
  const sc = await scene("rm_pos1");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  await removeMember(sc.owner, { membership: adminMembership, opKey: opk("rm-pos1-remove") });
});

test("mdrw.rank: remove_member -- an ADMIN removing a BOOKKEEPER succeeds (positive control)", async () => {
  const sc = await scene("rm_pos2");
  const bookkeeper = await insertUser("mdrw", "rm_pos2_bk");
  await addMember(sc.owner, { firm: sc.firm, user: bookkeeper, role: "bookkeeper", opKey: opk("rm-pos2-add-bk") });
  const bkMembership = await membershipId(sc.firm, bookkeeper);
  await removeMember(sc.admin, { membership: bkMembership, opKey: opk("rm-pos2-remove") });
});

test("mdrw.rank: remove_member -- owner-on-owner is allowed when a second owner remains (positive control; the last-owner backstop is a SEPARATE, untouched guard)", async () => {
  const sc = await scene("rm_pos3");
  const owner2 = await insertUser("mdrw", "rm_pos3_owner2");
  await addMember(sc.owner, { firm: sc.firm, user: owner2, role: "owner", opKey: opk("rm-pos3-add-owner2") });
  const owner2Membership = await membershipId(sc.firm, owner2);
  await removeMember(sc.owner, { membership: owner2Membership, opKey: opk("rm-pos3-remove") });
});

// ---------------------------------------------------------------------------
// remove_member -- self-act refusal (3, M2)
// ---------------------------------------------------------------------------

test("mdrw.self: remove_member -- an actor cannot remove their OWN membership, refuses CLR04/cannot_act_on_self [RED-BEFORE: this call SUCCEEDED against the pre-fix body -- the M2 lockout foot-gun]", async () => {
  const sc = await scene("rm_self");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  const err = await assertRaises(
    CLR.authz,
    () => removeMember(sc.admin, { membership: adminMembership, opKey: opk("rm-self-remove") }),
    "remove_member admin removing their own membership",
  );
  assert.equal(reason(err), "cannot_act_on_self");
  const still = await membershipId(sc.firm, sc.admin);
  assert.ok(still, "a refused remove must not have removed the membership");
});

test("mdrw.self: remove_member -- the SOLE owner removing themselves still raises CLR09 (last-owner), NOT this wall's CLR04/cannot_act_on_self [regression found by this PR's own rig run against T14/T14-HIGH-11 in rig-isolation.test.mjs]", async () => {
  const owner = await insertUser("mdrw", "rm_sole_owner");
  const token = await seedAdmission("mdrw-rm-sole");
  const firm = await createFirm(owner, { name: `MDRW rm sole owner ${Date.now()}`, token, opKey: opk("mdrw-rm-sole-firm") });
  const ownerMembership = await membershipId(firm, owner);
  await assertRaises(
    CLR.lastOwner,
    () => removeMember(owner, { membership: ownerMembership, opKey: opk("rm-sole-remove") }),
    "remove_member sole owner removing themselves must still be the last-owner trigger",
  );
});

test("mdrw.self: remove_member -- the last HUMAN owner is protected even with an AGENT owner present (mutation check, same shape as T14 HIGH-11 in rig-isolation.test.mjs, kept here so THIS battery independently proves the carve-out's `u.is_agent = false` exclusion is live -- dropping it would let the agent count as a covering 'other owner' and turn this cell RED)", async () => {
  await rootQuery("delete from clara.firm_memberships where user_id = $1", [AGENT_USER_ID]);
  const owner = await insertUser("mdrw", "rm_sole_agent_owner");
  const token = await seedAdmission("mdrw-rm-sole-agent");
  const firm = await createFirm(owner, { name: `MDRW rm sole+agent ${Date.now()}`, token, opKey: opk("mdrw-rm-sole-agent-firm") });
  await rootQuery("insert into clara.firm_memberships (firm_id, user_id, role, status) values ($1, $2, 'owner', 'active')", [firm, AGENT_USER_ID]);
  try {
    const ownerMembership = await membershipId(firm, owner);
    await assertRaises(
      CLR.lastOwner,
      () => removeMember(owner, { membership: ownerMembership, opKey: opk("rm-sole-agent-remove") }),
      "remove_member last human owner removing themselves with an agent owner present must still be the last-owner trigger",
    );
  } finally {
    await rootQuery("delete from clara.firm_memberships where user_id = $1 and firm_id = $2", [AGENT_USER_ID, firm]).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// revoke_invite -- target-rank wall (1) + wall-first reorder (2). No self case (invites have no
// actor-in-place to self-act on).
// ---------------------------------------------------------------------------

test("mdrw.rank: revoke_invite -- an ADMIN cannot revoke an OWNER-issued OWNER-role invite, refuses CLR04/cannot_act_on_superior [RED-BEFORE: this call SUCCEEDED against the pre-fix body -- revoke_invite had NO rank comparison at all]", async () => {
  const sc = await scene("rv_target");
  const issued = await inviteMember(sc.owner, { email: "rv-target-owner-invite@rig.test", role: "owner", opKey: opk("rv-target-issue") });
  const err = await assertRaises(
    CLR.authz,
    () => revokeInvite(sc.admin, { invite: issued.invite_id, opKey: opk("rv-target-revoke") }),
    "revoke_invite admin revoking an owner-role invite",
  );
  assert.equal(reason(err), "cannot_act_on_superior");
});

test("mdrw.rank: revoke_invite -- an OWNER revoking their own OWNER-role invite succeeds (positive control: owner-on-owner allowed)", async () => {
  const sc = await scene("rv_pos1");
  const issued = await inviteMember(sc.owner, { email: "rv-pos1-owner-invite@rig.test", role: "owner", opKey: opk("rv-pos1-issue") });
  await revokeInvite(sc.owner, { invite: issued.invite_id, opKey: opk("rv-pos1-revoke") });
});

test("mdrw.rank: revoke_invite -- an ADMIN revoking a BOOKKEEPER-role invite succeeds (positive control: target well below caller)", async () => {
  const sc = await scene("rv_pos2");
  const issued = await inviteMember(sc.admin, { email: "rv-pos2-bk-invite@rig.test", role: "bookkeeper", opKey: opk("rv-pos2-issue") });
  await revokeInvite(sc.admin, { invite: issued.invite_id, opKey: opk("rv-pos2-revoke") });
});
