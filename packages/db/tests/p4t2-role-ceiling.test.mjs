// P4 tranche-2 -- F2, direct battery cells for the role-ceiling wall this migration adds at FOUR
// entrances (set_member_role, add_member, invite_member, accept_invite): an actor may never
// assign, invite, or promote to a role ABOVE their own rank. Round 1 proved the wall only
// indirectly, through the ask-8 approve/reject door floor -- the reviewer's re-verify panel asked
// for direct cells on the entrances themselves, one negative (an admin escalates) and one positive
// (an owner does the same act legitimately) per entrance, so a future edit cannot silently widen
// the ceiling back open while every OTHER cell in the estate stays green.

import test from "node:test";
import assert from "node:assert/strict";
import { CLR, assertRaises, opk, insertUser, createFirm, seedAdmission, addMember, setMemberRole, membershipId } from "./rig-fixtures.mjs";
import { inviteMember, acceptInvite, freshPersona } from "./p4t1-fixtures.mjs";

async function scene(tag) {
  const owner = await insertUser("p4t2rc", `${tag}_owner`);
  const token = await seedAdmission(`p4t2-rc-${tag}`);
  const firm = await createFirm(owner, { name: `P4T2 Role Ceiling ${tag} ${Date.now()}`, token, opKey: opk(`rcfirm_${tag}`) });
  const admin = await insertUser("p4t2rc", `${tag}_admin`);
  await addMember(owner, { firm, user: admin, role: "admin", opKey: opk(`rcadd_${tag}`) });
  return { firm, owner, admin };
}

// ---------------------------------------------------------------------------
// set_member_role
// ---------------------------------------------------------------------------

test("p4t2.role_ceiling: set_member_role -- an ADMIN cannot promote a member to 'owner' (self-promotion), refuses CLR04", async () => {
  const sc = await scene("smr_self");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  await assertRaises(
    CLR.authz,
    () => setMemberRole(sc.admin, { membership: adminMembership, role: "owner", opKey: opk("smr-self-promote") }),
    "set_member_role admin self-promotion to owner",
  );
});

test("p4t2.role_ceiling: set_member_role -- an OWNER promoting another member to 'owner' succeeds (positive control)", async () => {
  const sc = await scene("smr_owner");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  await setMemberRole(sc.owner, { membership: adminMembership, role: "owner", opKey: opk("smr-owner-promote") });
});

// ---------------------------------------------------------------------------
// add_member (F2 round 2's own third escalation route)
// ---------------------------------------------------------------------------

test("p4t2.role_ceiling: add_member -- an ADMIN cannot add a new member directly as 'owner', refuses CLR04", async () => {
  const sc = await scene("am_admin");
  const target = await insertUser("p4t2rc", "am_admin_target");
  await assertRaises(
    CLR.authz,
    () => addMember(sc.admin, { firm: sc.firm, user: target, role: "owner", opKey: opk("am-admin-owner") }),
    "add_member admin adding a new owner",
  );
});

test("p4t2.role_ceiling: add_member -- an OWNER adding a new member as 'owner' succeeds (positive control)", async () => {
  const sc = await scene("am_owner");
  const target = await insertUser("p4t2rc", "am_owner_target");
  await addMember(sc.owner, { firm: sc.firm, user: target, role: "owner", opKey: opk("am-owner-owner") });
});

// ---------------------------------------------------------------------------
// invite_member
// ---------------------------------------------------------------------------

test("p4t2.role_ceiling: invite_member -- an ADMIN cannot issue an 'owner'-role invite, refuses CLR04", async () => {
  const sc = await scene("im_admin");
  await assertRaises(
    CLR.authz,
    () => inviteMember(sc.admin, { email: "im-admin-owner@rig.test", role: "owner", opKey: opk("im-admin-owner") }),
    "invite_member admin issuing an owner invite",
  );
});

test("p4t2.role_ceiling: invite_member -- an OWNER issuing an 'owner'-role invite succeeds (positive control)", async () => {
  const sc = await scene("im_owner");
  const issued = await inviteMember(sc.owner, { email: "im-owner-owner@rig.test", role: "owner", opKey: opk("im-owner-owner") });
  assert.ok(issued.token);
});

// ---------------------------------------------------------------------------
// accept_invite -- F2 round 2's ruling (i): a pending invite whose issuer's rank no longer covers
// its role must refuse AT ACCEPT, not merely at issue -- the fourth escalation route (a pending
// owner-role invite minted before this fix, or an issuer later demoted, would otherwise still
// mint an owner membership untouched). Cells exactly as the reviewer specified.
// ---------------------------------------------------------------------------

test("p4t2.role_ceiling: accept_invite -- an admin-issued 'owner' invite refuses AT ACCEPT (CLR04, issuer exceeds their own rank), even though invite_member itself would already refuse to ISSUE it -- proves the re-check independently via a raw fixture row naming the admin as issuer", async () => {
  const sc = await scene("ai_admin");
  // invite_member itself already refuses an admin issuing an owner invite (the cell above) -- to
  // prove accept_invite's OWN re-check independently (the exact "pending invite minted before
  // this fix" shape the ruling targets), issue a LEGITIMATE bookkeeper invite from the admin, then
  // root-escalate its stored role to 'owner' after the fact, simulating an invite that predates
  // the fix or whose issuer was demoted post-issue.
  const issued = await inviteMember(sc.admin, { email: "ai-admin-owner@rig.test", role: "bookkeeper", opKey: opk("ai-admin-issue") });
  const { rootQuery } = await import("./rig-helpers.mjs");
  await rootQuery("update clara.firm_invites set role = 'owner' where id = $1", [issued.invite_id]);

  const p = freshPersona("ai_admin_target");
  await assertRaises(
    CLR.authz,
    () => acceptInvite(p.sub, p.email, { token: issued.token, displayName: "AI Admin Target", opKey: opk("ai-admin-accept") }),
    "accept_invite on an owner-role invite whose issuer is only an admin",
  );
});

test("p4t2.role_ceiling: accept_invite -- an owner-issued 'owner' invite accepts normally (positive control)", async () => {
  const sc = await scene("ai_owner");
  const issued = await inviteMember(sc.owner, { email: "ai-owner-owner@rig.test", role: "owner", opKey: opk("ai-owner-issue") });
  const p = freshPersona("ai_owner_target");
  const r = await acceptInvite(p.sub, p.email, { token: issued.token, displayName: "AI Owner Target", opKey: opk("ai-owner-accept") });
  assert.ok(r.membership_id);
});
