// Member-door rank walls -- #455 review's BLOCKER + M1 + M2, closed by
// migrations/0157_member_door_rank_walls.sql. Direct battery cells on the three doors
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
//
// #482 REVIEW FIX ROUND -- MATERIAL-1 (contract regression): the first cut of the wall-first
// reorder moved the STATUS/LIFECYCLE checks above `_reserve_op` in all three doors, which breaks
// a legitimate same-op_key retry after success (a lost HTTP response, a courier re-drive) --
// ARCHITECTURE.md's "a retry is a no-op, not a duplicate". The fix follows accept_invite's own
// established split (0141:432/442): AUTHZ-class walls (firm scope, the target-rank wall, the
// self-act wall) run BEFORE `_reserve_op`; LIFECYCLE-class checks (active/pending status) run
// AFTER it, inside the non-replay branch. Two new cell families prove this:
//   "mdrw.replay" -- calling the SAME door twice with the SAME op_key returns the IDENTICAL
//     cached receipt. Genuinely RED-BEFORE the reorder fix for remove_member/revoke_invite
//     (their own mutation invalidates the premature status check on retry); the set_member_role
//     cell is NOT independently RED-BEFORE -- set_member_role never mutates m.status itself, so a
//     same-function replay alone cannot expose the bug -- kept anyway because the review's fix
//     applies the split to all three doors uniformly, for cross-operation consistency (a
//     concurrent remove_member landing between two set_member_role replay attempts is exactly the
//     race this uniformity closes).
//   "mdrw.precedence" -- a FRESH op_key acting on an ALREADY-INACTIVE target that ALSO outranks
//     the caller. Genuinely RED-BEFORE for all three doors: under the broken order the premature
//     status/lifecycle check masked the rank wall entirely (CLR11/CLR09 instead of CLR04); the
//     fix is a CHOSEN CONTRACT (review point b), not drift, and these cells pin it.
//
// #482 REVIEW ADDENDUM -- the Codex adversarial leg (law 28), concurrency/TOCTOU class, all
// PRE-EXISTING hazards hardened in passing (confirmed against the pre-PR live prosrc), not
// introduced by this file:
//   "mdrw.race" (F-C1, HIGH) -- a deterministic two-session cell: a holder transaction demotes
//     the actor while holding the firm lock; the racer (still committed-admin at call time)
//     blocks on the same lock, then resumes AFTER the demotion commits. Genuinely RED-BEFORE the
//     F-C1 fix: without the post-lock fresh actor re-read, the target-rank wall alone does not
//     catch "actor no longer meets the door's FLOOR at all" when the target is ranked low enough
//     to pass a plain relative-rank comparison.
//   "mdrw.crossfirm" (F-C2, HIGH) -- the STATIC shape the review's own test bar asks for: an
//     actor scoped only to firm B is refused on a firm-A invite id. This does NOT by itself prove
//     the TOCTOU race is closed (the original pre-fix code already refused this non-racing case
//     via inv.firm_id <> c.firm) -- the race-closure evidence is the shared fix pattern (a fresh,
//     firm-qualified actor read) verified by the F-C1 two-session cell above, plus the
//     migration's own tail-census code proof that clara.actor_role_rank() -- the non-firm-
//     qualified helper both findings named -- is gone from all three bodies entirely.
//   F-C3 (LOW) has no cell here, per the review's own stated fallback: a timing-based
//     non-blocking-probe assertion is flaky, so closure is the migration's own §K census pin
//     (`where id = p_invite and firm_id = c.firm for update` present in code) plus this being a
//     direct code read -- stated as such, not asserted here.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, assertRaises, opk, insertUser, createFirm, seedAdmission, addMember, setMemberRole,
  removeMember, membershipId, rootQuery, humanQuery, ensureReady, endPool, AGENT_USER_ID, getPool,
} from "./rig-fixtures.mjs";
import { inviteMember, revokeInvite } from "./p4t1-fixtures.mjs";

const WALL_MARKER_DOOR = "clara.set_member_role(uuid,text,text)";
const MDRW_MIGRATION = "0157_member_door_rank_walls.sql";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll pg_stat_activity until `pid` is OBSERVABLY blocked on `blockerPid`'s lock, or throw.
 *  db-tests.md: "never a sleep, which proves nothing about whether the block actually happened."
 *  Same shape as coa-template-pr-a-helpers.mjs's waitBlockedByOrThrow, kept local to this file. */
async function waitBlockedByOrThrow(pid, blockerPid, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await sleep(25);
  }
  throw new Error(`waitBlockedByOrThrow: backend ${pid} never observably blocked on ${blockerPid} within ${timeoutMs}ms`);
}

let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const catalog = await rootQuery(
    `select position('cannot_act_on_superior' in prosrc) > 0 as walled
       from pg_proc where oid = $1::regprocedure`,
    [WALL_MARKER_DOOR],
  );
  if (catalog.rows[0]?.walled !== true) {
    if (process.env.CLARA_ALLOW_MISSING_MDRW !== "1") {
      throw new Error(
        `mdrw premise ${MDRW_MIGRATION} is not applied (set_member_role carries no ` +
          "cannot_act_on_superior wall) and CLARA_ALLOW_MISSING_MDRW is unset -- this is a " +
          "FOCUSED run and must fail loudly, not skip. Preload " +
          "./tests/mdrw-preintegration-gate.mjs for an estate sweep against a pre-PR chain.",
      );
    }
    ready = false;
  }
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: ensureReady() found no draft_entry, or ${MDRW_MIGRATION} is not applied ` +
      "(set_member_role carries no cannot_act_on_superior wall)");
    return true;
  }
  return false;
}

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

/** Scope the agent-owner test cleanup to firms THIS FILE created (N4, #482 review): a bare
 *  `delete ... where user_id = AGENT_USER_ID` touches SHARED estate state -- if some OTHER
 *  test's own agent-owner fixture (e.g. T14 HIGH-11 in rig-isolation.test.mjs) left a row behind
 *  after a crash, this delete would remove it too and could itself trip
 *  clara._tf_guard_last_owner if that foreign firm has no other active owner. Joining through
 *  clara.firms on this file's own name prefix keeps the cleanup blast radius to "firms mdrw
 *  itself created", never a foreign fixture. */
async function deleteAgentFromMdrwFirms() {
  await rootQuery(
    "delete from clara.firm_memberships fm using clara.firms f where fm.user_id = $1 and fm.firm_id = f.id and f.name like 'MDRW %'",
    [AGENT_USER_ID],
  );
}

// ---------------------------------------------------------------------------
// set_member_role -- target-rank wall (1)
// ---------------------------------------------------------------------------

test("mdrw.rank: set_member_role -- an ADMIN cannot demote a co-OWNER (target outranks caller), refuses CLR04/cannot_act_on_superior [RED-BEFORE: this call SUCCEEDED against the pre-fix body]", async (t) => {
  if (unready(t)) return;
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

test("mdrw.rank: set_member_role -- an OWNER demoting an ADMIN succeeds (positive control: target does not outrank caller)", async (t) => {
  if (unready(t)) return;
  const sc = await scene("smr_pos1");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  await setMemberRole(sc.owner, { membership: adminMembership, role: "bookkeeper", opKey: opk("smr-pos1-demote") });
});

test("mdrw.rank: set_member_role -- owner-on-owner is allowed (target rank equals caller rank, not STRICTLY greater)", async (t) => {
  if (unready(t)) return;
  const sc = await scene("smr_pos2");
  const owner2 = await insertUser("mdrw", "smr_pos2_owner2");
  await addMember(sc.owner, { firm: sc.firm, user: owner2, role: "owner", opKey: opk("smr-pos2-add-owner2") });
  const owner2Membership = await membershipId(sc.firm, owner2);
  await setMemberRole(sc.owner, { membership: owner2Membership, role: "admin", opKey: opk("smr-pos2-demote") });
});

test("mdrw.rank: set_member_role -- admin-on-admin is allowed (target rank equals caller rank, not STRICTLY greater) [N1, #482 review: the header already claimed this, only owner-on-owner was pinned]", async (t) => {
  if (unready(t)) return;
  const sc = await scene("smr_pos_aa");
  const admin2 = await insertUser("mdrw", "smr_pos_aa_admin2");
  await addMember(sc.owner, { firm: sc.firm, user: admin2, role: "admin", opKey: opk("smr-pos-aa-add") });
  const admin2Membership = await membershipId(sc.firm, admin2);
  await setMemberRole(sc.admin, { membership: admin2Membership, role: "bookkeeper", opKey: opk("smr-pos-aa-demote") });
});

test("mdrw.rank: set_member_role -- an ADMIN demoting a BOOKKEEPER succeeds (positive control: target well below caller)", async (t) => {
  if (unready(t)) return;
  const sc = await scene("smr_pos3");
  const bookkeeper = await insertUser("mdrw", "smr_pos3_bk");
  await addMember(sc.owner, { firm: sc.firm, user: bookkeeper, role: "bookkeeper", opKey: opk("smr-pos3-add-bk") });
  const bkMembership = await membershipId(sc.firm, bookkeeper);
  await setMemberRole(sc.admin, { membership: bkMembership, role: "viewer", opKey: opk("smr-pos3-demote") });
});

// ---------------------------------------------------------------------------
// set_member_role -- self-act refusal (3, M2)
// ---------------------------------------------------------------------------

test("mdrw.self: set_member_role -- an OWNER (NOT the sole owner) cannot change their OWN role, refuses CLR04/cannot_act_on_self [RED-BEFORE: this call SUCCEEDED against the pre-fix body -- the M2 lockout foot-gun]", async (t) => {
  if (unready(t)) return;
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

test("mdrw.self: set_member_role -- an ADMIN cannot change their OWN role, refuses CLR04/cannot_act_on_self [RED-BEFORE: this call SUCCEEDED against the pre-fix body -- the M2 lockout foot-gun]", async (t) => {
  if (unready(t)) return;
  const sc = await scene("smr_self_admin");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  const err = await assertRaises(
    CLR.authz,
    () => setMemberRole(sc.admin, { membership: adminMembership, role: "bookkeeper", opKey: opk("smr-self-demote-admin") }),
    "set_member_role admin acting on their own membership",
  );
  assert.equal(reason(err), "cannot_act_on_self", "must be the self-act wall");
});

test("mdrw.self: set_member_role -- the SOLE owner demoting themselves still raises CLR09 (last-owner), NOT this wall's CLR04/cannot_act_on_self [regression found by this PR's own rig run against T14 in rig-isolation.test.mjs -- the self-act wall must carve out the case clara._tf_guard_last_owner already owns]", async (t) => {
  if (unready(t)) return;
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

test("mdrw.self: set_member_role -- the last HUMAN owner is protected even with an AGENT owner present (mutation check: the carve-out's exists-subquery must exclude agents, mirroring clara._tf_guard_last_owner's own `u.is_agent = false` -- dropping that clause would make this cell RED, since the agent would then count as a covering 'other owner' and the self-act wall would wrongly fire CLR04 instead of falling through to CLR09)", async (t) => {
  if (unready(t)) return;
  await deleteAgentFromMdrwFirms();
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

test("mdrw.rank: remove_member -- an ADMIN cannot remove a co-OWNER, refuses CLR04/cannot_act_on_superior [RED-BEFORE: this call SUCCEEDED against the pre-fix body -- remove_member had NO rank comparison at all]", async (t) => {
  if (unready(t)) return;
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

test("mdrw.rank: remove_member -- an OWNER removing an ADMIN succeeds (positive control)", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rm_pos1");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  await removeMember(sc.owner, { membership: adminMembership, opKey: opk("rm-pos1-remove") });
});

test("mdrw.rank: remove_member -- an ADMIN removing a BOOKKEEPER succeeds (positive control)", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rm_pos2");
  const bookkeeper = await insertUser("mdrw", "rm_pos2_bk");
  await addMember(sc.owner, { firm: sc.firm, user: bookkeeper, role: "bookkeeper", opKey: opk("rm-pos2-add-bk") });
  const bkMembership = await membershipId(sc.firm, bookkeeper);
  await removeMember(sc.admin, { membership: bkMembership, opKey: opk("rm-pos2-remove") });
});

test("mdrw.rank: remove_member -- owner-on-owner is allowed when a second owner remains (positive control; the last-owner backstop is a SEPARATE, untouched guard)", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rm_pos3");
  const owner2 = await insertUser("mdrw", "rm_pos3_owner2");
  await addMember(sc.owner, { firm: sc.firm, user: owner2, role: "owner", opKey: opk("rm-pos3-add-owner2") });
  const owner2Membership = await membershipId(sc.firm, owner2);
  await removeMember(sc.owner, { membership: owner2Membership, opKey: opk("rm-pos3-remove") });
});

// ---------------------------------------------------------------------------
// remove_member -- self-act refusal (3, M2)
// ---------------------------------------------------------------------------

test("mdrw.self: remove_member -- an actor cannot remove their OWN membership, refuses CLR04/cannot_act_on_self [RED-BEFORE: this call SUCCEEDED against the pre-fix body -- the M2 lockout foot-gun]", async (t) => {
  if (unready(t)) return;
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

test("mdrw.self: remove_member -- the SOLE owner removing themselves still raises CLR09 (last-owner), NOT this wall's CLR04/cannot_act_on_self [regression found by this PR's own rig run against T14/T14-HIGH-11 in rig-isolation.test.mjs]", async (t) => {
  if (unready(t)) return;
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

test("mdrw.self: remove_member -- the last HUMAN owner is protected even with an AGENT owner present (mutation check, same shape as T14 HIGH-11 in rig-isolation.test.mjs, kept here so THIS battery independently proves the carve-out's `u.is_agent = false` exclusion is live -- dropping it would let the agent count as a covering 'other owner' and turn this cell RED)", async (t) => {
  if (unready(t)) return;
  await deleteAgentFromMdrwFirms();
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

test("mdrw.rank: revoke_invite -- an ADMIN cannot revoke an OWNER-issued OWNER-role invite, refuses CLR04/cannot_act_on_superior [RED-BEFORE: this call SUCCEEDED against the pre-fix body -- revoke_invite had NO rank comparison at all]", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rv_target");
  const issued = await inviteMember(sc.owner, { email: "rv-target-owner-invite@rig.test", role: "owner", opKey: opk("rv-target-issue") });
  const err = await assertRaises(
    CLR.authz,
    () => revokeInvite(sc.admin, { invite: issued.invite_id, opKey: opk("rv-target-revoke") }),
    "revoke_invite admin revoking an owner-role invite",
  );
  assert.equal(reason(err), "cannot_act_on_superior");
});

test("mdrw.rank: revoke_invite -- an OWNER revoking their own OWNER-role invite succeeds (positive control: owner-on-owner allowed)", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rv_pos1");
  const issued = await inviteMember(sc.owner, { email: "rv-pos1-owner-invite@rig.test", role: "owner", opKey: opk("rv-pos1-issue") });
  await revokeInvite(sc.owner, { invite: issued.invite_id, opKey: opk("rv-pos1-revoke") });
});

test("mdrw.rank: revoke_invite -- an ADMIN revoking a BOOKKEEPER-role invite succeeds (positive control: target well below caller)", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rv_pos2");
  const issued = await inviteMember(sc.admin, { email: "rv-pos2-bk-invite@rig.test", role: "bookkeeper", opKey: opk("rv-pos2-issue") });
  await revokeInvite(sc.admin, { invite: issued.invite_id, opKey: opk("rv-pos2-revoke") });
});

// ---------------------------------------------------------------------------
// #482 review MATERIAL-1 -- replay cells: a same-op_key retry after success returns the SAME
// cached receipt, never a fresh refusal.
// ---------------------------------------------------------------------------

test("mdrw.replay: remove_member -- a same-op_key retry after a successful removal returns the SAME cached receipt, not a fresh CLR11 [RED-BEFORE the MATERIAL-1 reorder fix: the status/lifecycle check ran BEFORE _reserve_op, so a legitimate retry (lost response, courier re-drive) hit 'membership is not active' instead of the dedupe]", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rm_replay");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  const opKey = opk("rm-replay");
  const first = await humanQuery(sc.owner, "select clara.remove_member(p_membership => $1, p_op_key => $2) as receipt", [adminMembership, opKey]);
  const second = await humanQuery(sc.owner, "select clara.remove_member(p_membership => $1, p_op_key => $2) as receipt", [adminMembership, opKey]);
  assert.deepEqual(second.rows[0].receipt, first.rows[0].receipt, "a same-op_key retry must return the IDENTICAL cached receipt, not re-evaluate lifecycle state");
});

test("mdrw.replay: revoke_invite -- a same-op_key retry after a successful revoke returns the SAME cached receipt, not a fresh CLR09 [RED-BEFORE the MATERIAL-1 reorder fix]", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rv_replay");
  const issued = await inviteMember(sc.owner, { email: "rv-replay@rig.test", role: "bookkeeper", opKey: opk("rv-replay-issue") });
  const opKey = opk("rv-replay");
  const first = await humanQuery(sc.owner, "select clara.revoke_invite(p_invite => $1, p_op_key => $2) as receipt", [issued.invite_id, opKey]);
  const second = await humanQuery(sc.owner, "select clara.revoke_invite(p_invite => $1, p_op_key => $2) as receipt", [issued.invite_id, opKey]);
  assert.deepEqual(second.rows[0].receipt, first.rows[0].receipt, "a same-op_key retry must return the IDENTICAL cached receipt");
});

test("mdrw.replay: set_member_role -- a same-op_key retry after a successful role change returns the SAME cached receipt (NOT independently RED-BEFORE -- set_member_role never mutates m.status itself, so a same-function replay alone cannot expose the reorder bug; kept for the review's 'apply the split to all three doors uniformly', which closes a cross-operation race a plain replay of this door alone cannot exercise)", async (t) => {
  if (unready(t)) return;
  const sc = await scene("smr_replay");
  const adminMembership = await membershipId(sc.firm, sc.admin);
  const opKey = opk("smr-replay");
  const first = await humanQuery(sc.owner, "select clara.set_member_role(p_membership => $1, p_role => $2, p_op_key => $3) as receipt", [adminMembership, "bookkeeper", opKey]);
  const second = await humanQuery(sc.owner, "select clara.set_member_role(p_membership => $1, p_role => $2, p_op_key => $3) as receipt", [adminMembership, "bookkeeper", opKey]);
  assert.deepEqual(second.rows[0].receipt, first.rows[0].receipt, "a same-op_key retry must return the IDENTICAL cached receipt");
});

// ---------------------------------------------------------------------------
// #482 review MATERIAL-1 point (b) -- precedence cells: a FRESH op_key acting on an
// ALREADY-INACTIVE target that also outranks the caller answers the AUTHZ refusal (CLR04), not
// the LIFECYCLE refusal (CLR11/CLR09) -- a chosen contract, pinned so it cannot silently drift.
// ---------------------------------------------------------------------------

test("mdrw.precedence: set_member_role -- a FRESH op_key acting on an ALREADY-INACTIVE co-owner answers CLR04/cannot_act_on_superior, not CLR11 'membership is not active' [RED-BEFORE the MATERIAL-1 reorder fix: the status check ran before the rank wall and masked it]", async (t) => {
  if (unready(t)) return;
  const sc = await scene("smr_prec");
  const owner2 = await insertUser("mdrw", "smr_prec_owner2");
  await addMember(sc.owner, { firm: sc.firm, user: owner2, role: "owner", opKey: opk("smr-prec-add-owner2") });
  const owner2Membership = await membershipId(sc.firm, owner2);
  await removeMember(sc.owner, { membership: owner2Membership, opKey: opk("smr-prec-remove-owner2") });
  const err = await assertRaises(
    CLR.authz,
    () => setMemberRole(sc.admin, { membership: owner2Membership, role: "bookkeeper", opKey: opk("smr-prec-act") }),
    "set_member_role admin acting on an already-inactive co-owner with a fresh op_key",
  );
  assert.equal(reason(err), "cannot_act_on_superior", "AUTHZ (rank) must be evaluated before the deferred LIFECYCLE (status) check");
});

test("mdrw.precedence: remove_member -- a FRESH op_key acting on an ALREADY-INACTIVE co-owner answers CLR04/cannot_act_on_superior, not CLR11 'membership is not active' [RED-BEFORE the MATERIAL-1 reorder fix]", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rm_prec");
  const owner2 = await insertUser("mdrw", "rm_prec_owner2");
  await addMember(sc.owner, { firm: sc.firm, user: owner2, role: "owner", opKey: opk("rm-prec-add-owner2") });
  const owner2Membership = await membershipId(sc.firm, owner2);
  await removeMember(sc.owner, { membership: owner2Membership, opKey: opk("rm-prec-remove-owner2") });
  const err = await assertRaises(
    CLR.authz,
    () => removeMember(sc.admin, { membership: owner2Membership, opKey: opk("rm-prec-act") }),
    "remove_member admin acting on an already-inactive co-owner with a fresh op_key",
  );
  assert.equal(reason(err), "cannot_act_on_superior", "AUTHZ (rank) must be evaluated before the deferred LIFECYCLE (status) check");
});

test("mdrw.precedence: revoke_invite -- a FRESH op_key acting on an ALREADY-REVOKED OWNER-role invite answers CLR04/cannot_act_on_superior, not CLR09 'no longer open' [RED-BEFORE the MATERIAL-1 reorder fix]", async (t) => {
  if (unready(t)) return;
  const sc = await scene("rv_prec");
  const issued = await inviteMember(sc.owner, { email: "rv-prec-owner-invite@rig.test", role: "owner", opKey: opk("rv-prec-issue") });
  await revokeInvite(sc.owner, { invite: issued.invite_id, opKey: opk("rv-prec-revoke1") });
  const err = await assertRaises(
    CLR.authz,
    () => revokeInvite(sc.admin, { invite: issued.invite_id, opKey: opk("rv-prec-act") }),
    "revoke_invite admin acting on an already-revoked owner-role invite with a fresh op_key",
  );
  assert.equal(reason(err), "cannot_act_on_superior", "AUTHZ (rank) must be evaluated before the deferred LIFECYCLE (status) check");
});

// ---------------------------------------------------------------------------
// #482 review addendum, Codex adversarial leg (law 28) -- F-C1/F-C2/F-C3, concurrency/TOCTOU.
// ---------------------------------------------------------------------------

test("mdrw.race: set_member_role -- F-C1 (Codex adversarial leg, HIGH): an actor demoted WHILE blocked on the firm lock is refused on the FRESH post-lock rank, not the stale pre-lock floor-pass [two-session, deterministic]", async (t) => {
  if (unready(t)) return;
  const sc = await scene("fc1_race");
  // The racer's TARGET is ranked low enough (viewer) that a plain relative-rank comparison alone
  // would still ALLOW a demoted-to-bookkeeper actor to act on it -- the discriminator here is
  // whether the door re-checks the ADMIN FLOOR itself, not just relative rank.
  const target = await insertUser("mdrw", "fc1_race_target");
  await addMember(sc.owner, { firm: sc.firm, user: target, role: "viewer", opKey: opk("fc1-add-target") });
  const adminMembership = await membershipId(sc.firm, sc.admin);
  const targetMembership = await membershipId(sc.firm, target);

  const holder = await getPool().connect();
  const racer = await getPool().connect();
  let racerResult = null;
  try {
    // Holder: the OWNER, inside an OPEN transaction, demotes the admin to bookkeeper -- this
    // call's own body takes and HOLDS the firm lock (`perform ... for update`) until the holder
    // transaction commits.
    await holder.query("set role clara_authenticated");
    await holder.query("begin");
    await holder.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: sc.owner, role: "authenticated" })]);
    await holder.query(
      "select clara.set_member_role(p_membership => $1, p_role => $2, p_op_key => $3)",
      [adminMembership, "bookkeeper", opk("fc1-holder-demote")],
    );
    const holderPid = (await holder.query("select pg_backend_pid() as pid")).rows[0].pid;

    // Racer: the actor (STILL committed as admin at this instant) tries to act on the target --
    // _human_ctx's floor check runs and passes on the stale-but-currently-committed 'admin' row,
    // THEN the racer's own call reaches the SAME firm lock and blocks.
    await racer.query("set role clara_authenticated");
    await racer.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: sc.admin, role: "authenticated" })]);
    const racerPid = (await racer.query("select pg_backend_pid() as pid")).rows[0].pid;
    const racerPromise = racer
      .query(
        "select clara.set_member_role(p_membership => $1, p_role => $2, p_op_key => $3)",
        [targetMembership, "bookkeeper", opk("fc1-racer-act")],
      )
      .then(() => ({ ok: true }))
      .catch((e) => ({ ok: false, code: e.code, detail: e.detail }));

    // Do NOT sleep-and-hope: PROVE the racer is genuinely blocked on the holder's own lock before
    // releasing it, or this cell would only ever exercise whichever side of the race happened to
    // win on this run (db-tests.md: "wait with waitBlockedByOrThrow ... never a sleep, which
    // proves nothing about whether the block actually happened").
    await waitBlockedByOrThrow(racerPid, holderPid);

    // Release the lock: the holder's demotion COMMITS, then the racer's blocked call resumes and
    // must re-evaluate the actor's rank fresh.
    await holder.query("commit");
    racerResult = await racerPromise;
  } finally {
    await holder.query("rollback").catch(() => {});
    await holder.query("reset role").catch(() => {});
    await holder.query("reset all").catch(() => {});
    holder.release();
    await racer.query("rollback").catch(() => {});
    await racer.query("reset role").catch(() => {});
    await racer.query("reset all").catch(() => {});
    racer.release();
  }

  assert.equal(racerResult.ok, false, "F-C1: the now-demoted actor's call must be REFUSED, not silently completed on stale privilege");
  assert.equal(racerResult.code, CLR.authz, "must refuse CLR04");
  let racerReason = null;
  try { racerReason = JSON.parse(racerResult.detail ?? "null")?.reason ?? null; } catch { /* leave null */ }
  assert.equal(racerReason, "actor_rank_changed", "must be the F-C1 fresh-actor-rank refusal specifically, not some other CLR04");
});

test("mdrw.crossfirm: revoke_invite -- an actor with active membership ONLY in firm B is refused on a valid firm-A invite id, CLR11, not success [F-C2 static shape -- see this file's header for why the race-closure evidence is elsewhere]", async (t) => {
  if (unready(t)) return;
  const scA = await scene("fc2_firmA");
  const issued = await inviteMember(scA.owner, { email: "fc2-crossfirm-invite@rig.test", role: "bookkeeper", opKey: opk("fc2-issue") });
  const ownerB = await insertUser("mdrw", "fc2_ownerB");
  const tokenB = await seedAdmission("mdrw-fc2-b");
  const firmB = await createFirm(ownerB, { name: `MDRW fc2 firmB ${Date.now()}`, token: tokenB, opKey: opk("mdrw-fc2-firmB") });
  const adminB = await insertUser("mdrw", "fc2_adminB");
  await addMember(ownerB, { firm: firmB, user: adminB, role: "admin", opKey: opk("fc2-b-add-admin") });
  await assertRaises(
    CLR.notFound,
    () => revokeInvite(adminB, { invite: issued.invite_id, opKey: opk("fc2-crossfirm-revoke") }),
    "revoke_invite: an actor scoped to firm B must not touch a firm-A invite",
  );
});
