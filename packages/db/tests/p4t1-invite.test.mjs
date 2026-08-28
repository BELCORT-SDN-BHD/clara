// P4 tranche-1 -- asks 3/4/6: invite_member, accept_invite, revoke_invite, and the
// _add_member_core / _claim_identity_core extraction accept_invite routes through.

import test from "node:test";
import assert from "node:assert/strict";
import { CLR, AGENT_USER_ID, assertRaises, opk, rootQuery, humanQuery, insertUser, createFirm, seedAdmission } from "./rig-fixtures.mjs";
import { inviteMember, acceptInvite, revokeInvite, expireInvite, rawInvite, freshPersona } from "./p4t1-fixtures.mjs";

/** A firm with an owner + one admin member, ready to issue invites. */
async function scene(tag) {
  const owner = await insertUser("p4t1inv", `${tag}_owner`);
  const token = await seedAdmission(`p4t1-invite-${tag}`);
  const firm = await createFirm(owner, { name: `P4T1 Invite ${tag} ${Date.now()}`, token, opKey: opk(`firm_${tag}`) });
  const admin = await insertUser("p4t1inv", `${tag}_admin`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    firm,
    admin,
    "admin",
    opk(`addadmin_${tag}`),
  ]);
  const bookkeeper = await insertUser("p4t1inv", `${tag}_bk`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    firm,
    bookkeeper,
    "bookkeeper",
    opk(`addbk_${tag}`),
  ]);
  const viewer = await insertUser("p4t1inv", `${tag}_viewer`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    firm,
    viewer,
    "viewer",
    opk(`addviewer_${tag}`),
  ]);
  return { firm, owner, admin, bookkeeper, viewer };
}

// ---------------------------------------------------------------------------
// invite_member (ask 3)
// ---------------------------------------------------------------------------

test("p4t1.invite: floor is admin+ -- a viewer and a bookkeeper both refuse CLR04, an admin succeeds", async () => {
  const sc = await scene("floor");
  await assertRaises(CLR.authz, () => inviteMember(sc.viewer, { email: "cand1@rig.test", role: "viewer", opKey: opk("v") }), "viewer invite_member");
  await assertRaises(CLR.authz, () => inviteMember(sc.bookkeeper, { email: "cand1@rig.test", role: "viewer", opKey: opk("b") }), "bookkeeper invite_member");
  const r = await inviteMember(sc.admin, { email: "cand1@rig.test", role: "viewer", opKey: opk("a") });
  assert.ok(r.invite_id);
  assert.ok(r.token);
});

test("p4t1.invite: an unknown role refuses CLR10", async () => {
  const sc = await scene("badrole");
  await assertRaises(CLR.badRequest, () => inviteMember(sc.admin, { email: "cand2@rig.test", role: "superadmin", opKey: opk("badrole") }), "invite_member bad role");
});

test("p4t1.invite: an email already belonging to an active member of the firm refuses CLR10", async () => {
  const sc = await scene("dupmember");
  const bkEmail = (await rootQuery("select email from clara.users where id = $1", [sc.bookkeeper])).rows[0].email;
  await assertRaises(CLR.badRequest, () => inviteMember(sc.admin, { email: bkEmail, role: "admin", opKey: opk("dupmember") }), "invite_member existing member");
});

test("p4t1.invite: a second pending invite for the same email in the same firm refuses CLR10 (and the DB-level unique index backs it)", async () => {
  const sc = await scene("duppending");
  await inviteMember(sc.admin, { email: "cand3@rig.test", role: "viewer", opKey: opk("dup1") });
  await assertRaises(CLR.badRequest, () => inviteMember(sc.admin, { email: "cand3@rig.test", role: "admin", opKey: opk("dup2") }), "invite_member duplicate pending");
});

test("p4t1.invite: token_hash is stored, never the raw token", async () => {
  const sc = await scene("hash");
  const r = await inviteMember(sc.admin, { email: "cand4@rig.test", role: "viewer", opKey: opk("hash") });
  const row = await rawInvite(r.invite_id);
  assert.ok(row.token_hash, "token_hash must be present");
  assert.notEqual(Buffer.from(row.token_hash).toString("hex"), r.token, "the raw token must not equal the stored hash");
  const cols = Object.keys(row);
  assert.ok(cols.includes("token_hash"));
});

test("p4t1.invite: an op_key replay returns the SAME token (courier-retry shape), and does not re-mint a second invite row", async () => {
  const sc = await scene("replay");
  const key = opk("replay");
  const first = await inviteMember(sc.admin, { email: "cand5@rig.test", role: "viewer", opKey: key });
  const second = await inviteMember(sc.admin, { email: "cand5@rig.test", role: "viewer", opKey: key });
  assert.equal(second.token, first.token);
  assert.equal(second.invite_id, first.invite_id);
  const n = await rootQuery("select count(*)::int as n from clara.firm_invites where firm_id = $1 and email = $2", [sc.firm, "cand5@rig.test"]);
  assert.equal(n.rows[0].n, 1);
});

// ---------------------------------------------------------------------------
// accept_invite (ask 4) -- the identity-gap-closing path, end to end.
// ---------------------------------------------------------------------------

test("p4t1.accept: an invalid token refuses CLR10", async () => {
  const p = freshPersona("badtoken");
  await assertRaises(CLR.badRequest, () => acceptInvite(p.sub, p.email, { token: "not-a-real-token", displayName: "X", opKey: opk("badtoken") }), "accept_invite bad token");
});

test("p4t1.accept: a JWT-email/invite-email mismatch refuses CLR04, and does NOT consume the invite", async () => {
  const sc = await scene("mismatch");
  const issued = await inviteMember(sc.admin, { email: "match-me@rig.test", role: "bookkeeper", opKey: opk("mm-issue") });
  const impostor = freshPersona("impostor");
  await assertRaises(
    CLR.authz,
    () => acceptInvite(impostor.sub, "someone-else@rig.test", { token: issued.token, displayName: "Impostor", opKey: opk("mm-accept") }),
    "accept_invite email mismatch",
  );
  const row = await rawInvite(issued.invite_id);
  assert.equal(row.status, "pending", "a mismatched attempt must not consume the invite");
});

test("p4t1.accept: [F3] a CASE-VARIANT JWT email still matches the invite -- both sides normalize through _jwt_email()'s lower()", async () => {
  const sc = await scene("casevariant");
  const p = freshPersona("casevariant");
  // Issue to the UPPERCASE spelling: invite_member's own lower() normalizes it at write.
  const issued = await inviteMember(sc.admin, { email: p.email.toUpperCase(), role: "viewer", opKey: opk("cv-issue") });
  // Accept with a THIRD, differently-mixed casing -- proves the match is on the normalized
  // form (via _jwt_email()'s own lower()), not on either side happening to already agree.
  const mixedAccept = p.email.charAt(0).toUpperCase() + p.email.slice(1);
  const result = await acceptInvite(p.sub, mixedAccept, { token: issued.token, displayName: "Case Variant", opKey: opk("cv-accept") });
  assert.equal(result.user_id, p.sub);
  const user = await rootQuery("select email from clara.users where id = $1", [p.sub]);
  assert.equal(user.rows[0].email, p.email.toLowerCase());
});

test("p4t1.accept: end to end -- claims identity, mints an active membership at the invited role, consumes the invite, and the roster event is member.added, not a fabricated invite.accepted", async () => {
  const sc = await scene("e2e");
  const p = freshPersona("joiner");
  const issued = await inviteMember(sc.admin, { email: p.email, role: "bookkeeper", opKey: opk("e2e-issue") });

  const before = await rootQuery("select max(seq)::bigint as s from clara.domain_events where firm_id = $1", [sc.firm]);
  const seqBefore = Number(before.rows[0].s ?? 0);

  const result = await acceptInvite(p.sub, p.email, { token: issued.token, displayName: "Joiner Person", opKey: opk("e2e-accept") });
  assert.equal(result.user_id, p.sub);
  assert.equal(result.firm_id, sc.firm);
  assert.ok(result.membership_id);

  const user = await rootQuery("select display_name, email from clara.users where id = $1", [p.sub]);
  assert.equal(user.rows[0].display_name, "Joiner Person");
  assert.equal(user.rows[0].email, p.email);

  const member = await rootQuery("select role, status from clara.firm_memberships where id = $1", [result.membership_id]);
  assert.equal(member.rows[0].role, "bookkeeper");
  assert.equal(member.rows[0].status, "active");

  const invite = await rawInvite(issued.invite_id);
  assert.equal(invite.status, "accepted");
  assert.ok(invite.accepted_at);

  const events = await rootQuery(
    "select event_type from clara.domain_events where firm_id = $1 and seq > $2 order by seq",
    [sc.firm, seqBefore],
  );
  assert.deepEqual(events.rows.map((r) => r.event_type), ["member.added"], "exactly one new event, member.added -- no separate invite.accepted");

  const audit = await rootQuery(
    "select fn from clara.audit_log where firm_id = $1 and args->>'invite' = $2 order by at desc limit 1",
    [sc.firm, issued.invite_id],
  );
  assert.equal(audit.rows[0].fn, "accept_invite", "the receipt must name the door actually walked, never add_member");
});

test("p4t1.accept: a revoked invite refuses CLR09 and does not mint a membership", async () => {
  const sc = await scene("revoked");
  const p = freshPersona("revjoiner");
  const issued = await inviteMember(sc.admin, { email: p.email, role: "viewer", opKey: opk("rev-issue") });
  await revokeInvite(sc.admin, { invite: issued.invite_id, opKey: opk("rev-revoke") });
  await assertRaises(
    CLR.lastOwner,
    () => acceptInvite(p.sub, p.email, { token: issued.token, displayName: "X", opKey: opk("rev-accept") }),
    "accept_invite on a revoked invite",
  );
  const member = await rootQuery("select 1 from clara.firm_memberships fm join clara.users u on u.id = fm.user_id where u.email = $1", [p.email]);
  assert.equal(member.rows.length, 0);
});

test("p4t1.accept: an expired invite refuses CLR09 -- the raw row STAYS 'pending' (a refusal's RAISE would roll back any write in the same call), but firm_invites_visible computes the effective 'expired' status live", async () => {
  const sc = await scene("expired");
  const p = freshPersona("expjoiner");
  const issued = await inviteMember(sc.admin, { email: p.email, role: "viewer", opKey: opk("exp-issue") });
  await expireInvite(issued.invite_id);
  await assertRaises(CLR.lastOwner, () => acceptInvite(p.sub, p.email, { token: issued.token, displayName: "X", opKey: opk("exp-accept") }), "accept_invite on an expired invite");
  const row = await rawInvite(issued.invite_id);
  assert.equal(row.status, "pending", "the base table's stored status is never rewritten by a refused accept attempt");
  const visible = await humanQuery(sc.admin, "select status from clara.firm_invites_visible where id = $1", [issued.invite_id]);
  assert.equal(visible.rows[0].status, "expired", "the masked view must compute the effective status live off expires_at");
});

test("p4t1.accept: double-accept (already accepted) refuses CLR09, not a silent second membership", async () => {
  const sc = await scene("double");
  const p = freshPersona("doublejoiner");
  const issued = await inviteMember(sc.admin, { email: p.email, role: "viewer", opKey: opk("dbl-issue") });
  await acceptInvite(p.sub, p.email, { token: issued.token, displayName: "First", opKey: opk("dbl-accept1") });
  await assertRaises(CLR.lastOwner, () => acceptInvite(p.sub, p.email, { token: issued.token, displayName: "Second", opKey: opk("dbl-accept2") }), "accept_invite double-accept");
});

test("p4t1.accept: an op_key replay on the SAME accept call returns the SAME receipt (idempotent), not a duplicate membership", async () => {
  const sc = await scene("acceptreplay");
  const p = freshPersona("replayjoiner");
  const issued = await inviteMember(sc.admin, { email: p.email, role: "viewer", opKey: opk("ar-issue") });
  const key = opk("ar-accept");
  const first = await acceptInvite(p.sub, p.email, { token: issued.token, displayName: "Once", opKey: key });
  const second = await acceptInvite(p.sub, p.email, { token: issued.token, displayName: "Once", opKey: key });
  assert.deepEqual(second, first);
  const n = await rootQuery("select count(*)::int as n from clara.firm_memberships where user_id = $1", [p.sub]);
  assert.equal(n.rows[0].n, 1);
});

test("p4t1.accept: [F4] a stale op_key + the same token cannot be replayed by an IMPOSTOR to steal the original caller's receipt -- the JWT-email wall runs before the dedupe short-circuit", async () => {
  const sc = await scene("f4replay");
  const joiner = freshPersona("f4joiner");
  const issued = await inviteMember(sc.admin, { email: joiner.email, role: "viewer", opKey: opk("f4-issue") });
  const sharedKey = opk("f4-shared");
  const legit = await acceptInvite(joiner.sub, joiner.email, { token: issued.token, displayName: "Legit", opKey: sharedKey });
  assert.equal(legit.user_id, joiner.sub);

  // The impostor has the SAME token (e.g. a forwarded email) and somehow the SAME op_key, but
  // their OWN JWT does not carry the invited address. Pre-fix, _reserve_op ran before the email
  // wall, so this call would have found the already-reserved receipt for (firm, accept_invite,
  // sharedKey) and returned the LEGITIMATE joiner's user_id/membership_id -- without the
  // impostor ever proving they owned the invited email.
  const impostor = freshPersona("f4impostor");
  await assertRaises(
    CLR.authz,
    () => acceptInvite(impostor.sub, impostor.email, { token: issued.token, displayName: "Impostor", opKey: sharedKey }),
    "accept_invite replay with a mismatched email must refuse, never return the original receipt",
  );
  const impostorRow = await rootQuery("select 1 from clara.users where id = $1", [impostor.sub]);
  assert.equal(impostorRow.rows.length, 0, "the impostor must not even get an identity minted from this call");
  const membershipCount = await rootQuery("select count(*)::int as n from clara.firm_memberships where firm_id = $1", [sc.firm]);
  assert.equal(membershipCount.rows[0].n, 5, "still exactly the scene's owner+admin+bookkeeper+viewer plus the legitimate joiner -- no impostor membership");
});

test("p4t1.accept: [N2-M2] the tail census's F4 pin is comment-STRIPPED, not comment-naive -- a genuinely mis-ordered body carrying a red-herring comment is still caught, and a genuinely correct body carrying an early mention of the dedupe call does not false-alarm", async () => {
  // The reviewer's own mutant on the round-2 pin: a raw position()-on-prosrc match is
  // comment-maskable both ways. This cell reproduces the MIGRATION'S OWN comment-stripping
  // regex (regexp_replace(prosrc, '--[^\n]*', '', 'g')) against two real, owner-created decoy
  // functions and proves the stripped check gets BOTH directions right where the old raw-text
  // check would not have.
  const DECOY_BAD = "_n2m2_decoy_masked_regression";
  const DECOY_GOOD = "_n2m2_decoy_false_alarm";
  try {
    // BAD: the REAL code order is dedupe-THEN-wall (the F4 regression shape) -- but an early
    // comment names the wall text before the real dedupe call, exactly what would let a
    // comment-naive pin read this as wall-before-dedupe and PASS a genuine regression.
    await rootQuery(`
      create function clara.${DECOY_BAD}() returns void language plpgsql as $body$
      begin
        -- does not match this invite -- an early, misleading comment naming the wall
        perform pg_sleep(0);                          -- stands in for the real dedupe call
        raise exception 'does not match this invite';  -- the REAL wall raise, AFTER dedupe
      end $body$;
    `);
    // GOOD: the REAL code order is wall-THEN-dedupe (correct, matching F4) -- but an early
    // comment names the dedupe stand-in before the real wall raise, exactly what would let a
    // comment-naive pin read this as dedupe-before-wall and FALSE-ALARM a correct body.
    await rootQuery(`
      create function clara.${DECOY_GOOD}() returns void language plpgsql as $body$
      begin
        -- pg_sleep is mentioned here, in a comment, well before the real wall raise below
        if true then raise exception 'does not match this invite'; end if;
        perform pg_sleep(0);                          -- never reached; stands in for the real dedupe call
      end $body$;
    `);

    const [bad, good] = await Promise.all([
      rootQuery("select prosrc from pg_proc where oid = $1::regprocedure", [`clara.${DECOY_BAD}()`]),
      rootQuery("select prosrc from pg_proc where oid = $1::regprocedure", [`clara.${DECOY_GOOD}()`]),
    ]);
    const badSrc = bad.rows[0].prosrc;
    const goodSrc = good.rows[0].prosrc;
    const stripComments = (s) => s.replace(/--[^\n]*/g, "");
    // Real code marker for "the dedupe call ran" is `pg_sleep` here (standing in for
    // `_reserve_op`, since these decoys must not actually reach a real op_receipts row).
    const posWallRaw = (s) => s.indexOf("does not match this invite");
    const posDedupeRaw = (s) => s.indexOf("pg_sleep");

    // (a) The OLD, comment-naive check would have gotten BOTH of these wrong.
    assert.ok(posWallRaw(badSrc) < posDedupeRaw(badSrc), "old check: BAD decoy reads as wall-before-dedupe (WRONG -- the real order is dedupe-before-wall)");
    assert.ok(posWallRaw(goodSrc) >= posDedupeRaw(goodSrc), "old check: GOOD decoy reads as dedupe-before-wall (WRONG -- the real order is wall-before-dedupe, dedupe never runs)");

    // (b) The NEW, comment-stripped check (the migration's own regexp_replace + position, 0141
    //     §K's F4 pin) gets both right.
    const badCode = stripComments(badSrc);
    const goodCode = stripComments(goodSrc);
    assert.ok(posWallRaw(badCode) >= posDedupeRaw(badCode), "stripped check: BAD decoy correctly reads as dedupe-before-wall (a real regression) once the misleading comment is gone");
    assert.ok(posWallRaw(goodCode) < posDedupeRaw(goodCode), "stripped check: GOOD decoy correctly reads as wall-before-dedupe once the misleading comment is gone");
  } finally {
    await rootQuery(`drop function if exists clara.${DECOY_BAD}()`);
    await rootQuery(`drop function if exists clara.${DECOY_GOOD}()`);
  }
});

test("p4t1.accept: [C2] the SAME op_key + token but a CHANGED display_name refuses 'op_key reused with different args', never silently replays the first receipt", async () => {
  const sc = await scene("c2args");
  const p = freshPersona("c2argsjoiner");
  const issued = await inviteMember(sc.admin, { email: p.email, role: "viewer", opKey: opk("c2args-issue") });
  const key = opk("c2args-accept");
  const first = await acceptInvite(p.sub, p.email, { token: issued.token, displayName: "First Name", opKey: key });
  assert.equal(first.user_id, p.sub);
  await assertRaises(
    CLR.badRequest,
    () => acceptInvite(p.sub, p.email, { token: issued.token, displayName: "Different Name", opKey: key }),
    "accept_invite replay with the same op_key but a different display_name",
  );
  const n = await rootQuery("select count(*)::int as n from clara.firm_memberships where user_id = $1", [p.sub]);
  assert.equal(n.rows[0].n, 1, "still exactly one membership -- the changed-args call never proceeded to mint anything");
});

test("p4t1.accept: [C2] two DIFFERENT actors sharing the SAME invited-email JWT claim and the SAME op_key+token cannot replay each other's receipt -- the dedupe hash is actor-bound", async () => {
  const sc = await scene("c2actor");
  const invitedEmail = `p4t1_c2actor_${Date.now()}@rig.test`;
  const issued = await inviteMember(sc.admin, { email: invitedEmail, role: "viewer", opKey: opk("c2actor-issue") });
  const key = opk("c2actor-accept");
  const p1 = freshPersona("c2actor1");
  const p2 = freshPersona("c2actor2");
  const first = await acceptInvite(p1.sub, invitedEmail, { token: issued.token, displayName: "Actor One", opKey: key });
  assert.equal(first.user_id, p1.sub);
  // p2's JWT claims the SAME invited email (the rig can fabricate this even though a real
  // Supabase session could not) -- the email wall alone would let p2 through, so it is the
  // actor-bound hash that has to catch this: without it, p2 would receive p1's cached receipt
  // (p1's own user_id/membership_id) verbatim.
  await assertRaises(
    CLR.badRequest,
    () => acceptInvite(p2.sub, invitedEmail, { token: issued.token, displayName: "Actor One", opKey: key }),
    "accept_invite replay with the same op_key/token/display_name but a DIFFERENT actor",
  );
  const p2row = await rootQuery("select 1 from clara.users where id = $1", [p2.sub]);
  assert.equal(p2row.rows.length, 0, "p2 must not receive p1's identity, nor a minted identity of their own, from this refused call");
});

test("p4t1.invite: [C3] op_receipts.result stores the invite's raw token in plaintext, owner-only -- the SAME zero-app-grant bearer-credential-at-rest shape as clara.firm_admissions.token (pinned as measured, not silently changed here; an estate-wide pass is a named follow-up, see PR body)", async () => {
  const sc = await scene("c3token");
  const key = opk("c3token");
  const r = await inviteMember(sc.admin, { email: "c3token@rig.test", role: "viewer", opKey: key });
  const receipt = await rootQuery(
    "select result from clara.op_receipts where firm_id = $1 and fn = 'invite_member' and op_key = $2",
    [sc.firm, key],
  );
  assert.equal(receipt.rows.length, 1, "expected exactly one op_receipts row for this op_key");
  assert.equal(receipt.rows[0].result.token, r.token, "the raw token is stored in op_receipts.result in plaintext");
  const grant = await rootQuery("select has_table_privilege('clara_authenticated', 'clara.op_receipts'::regclass, 'select') as ok");
  assert.equal(grant.rows[0].ok, false, "no app role has a SELECT path onto op_receipts -- the token is owner-reachable only");
});

test("p4t1.accept: the global one-active-membership invariant refuses a joiner who already belongs elsewhere (CLR10, from the shared _add_member_core)", async () => {
  const sc1 = await scene("global1");
  const sc2 = await scene("global2");
  const p = freshPersona("doublefirm");
  // p joins sc1 first, via a normal invite.
  const issued1 = await inviteMember(sc1.admin, { email: p.email, role: "viewer", opKey: opk("g1-issue") });
  await acceptInvite(p.sub, p.email, { token: issued1.token, displayName: "Already A Member", opKey: opk("g1-accept") });
  // sc2 invites the SAME email and p tries to accept -- must refuse on the global unique index.
  const issued2 = await inviteMember(sc2.admin, { email: p.email, role: "viewer", opKey: opk("g2-issue") });
  await assertRaises(CLR.badRequest, () => acceptInvite(p.sub, p.email, { token: issued2.token, displayName: "X", opKey: opk("g2-accept") }), "accept_invite while already active elsewhere");
});

test("p4t1.accept: the agent identity cannot accept an invite (CLR04, defensive wall inside _claim_identity_core)", async () => {
  const sc = await scene("agentaccept");
  const issued = await inviteMember(sc.admin, { email: "agent-imposter@rig.test", role: "viewer", opKey: opk("agent-issue") });
  await assertRaises(
    CLR.authz,
    () => acceptInvite(AGENT_USER_ID, "agent-imposter@rig.test", { token: issued.token, displayName: "Agent", opKey: opk("agent-accept") }),
    "accept_invite as the agent id",
  );
});

// ---------------------------------------------------------------------------
// revoke_invite (ask 6, write half)
// ---------------------------------------------------------------------------

test("p4t1.revoke: floor is admin+ -- bookkeeper refuses CLR04, admin succeeds", async () => {
  const sc = await scene("revfloor");
  const issued = await inviteMember(sc.admin, { email: "revfloor@rig.test", role: "viewer", opKey: opk("rf-issue") });
  await assertRaises(CLR.authz, () => revokeInvite(sc.bookkeeper, { invite: issued.invite_id, opKey: opk("rf-bk") }), "bookkeeper revoke_invite");
  const r = await revokeInvite(sc.admin, { invite: issued.invite_id, opKey: opk("rf-admin") });
  assert.equal(r.status, "revoked");
});

test("p4t1.revoke: an invite in another firm refuses CLR11", async () => {
  const sc1 = await scene("crossA");
  const sc2 = await scene("crossB");
  const issued = await inviteMember(sc1.admin, { email: "cross@rig.test", role: "viewer", opKey: opk("cross-issue") });
  await assertRaises(CLR.notFound, () => revokeInvite(sc2.admin, { invite: issued.invite_id, opKey: opk("cross-revoke") }), "revoke_invite cross-firm");
});

test("p4t1.revoke: revoking an already-revoked invite refuses CLR09", async () => {
  const sc = await scene("doublerevoke");
  const issued = await inviteMember(sc.admin, { email: "doublerevoke@rig.test", role: "viewer", opKey: opk("dr-issue") });
  await revokeInvite(sc.admin, { invite: issued.invite_id, opKey: opk("dr-1") });
  await assertRaises(CLR.lastOwner, () => revokeInvite(sc.admin, { invite: issued.invite_id, opKey: opk("dr-2") }), "double revoke_invite");
});
