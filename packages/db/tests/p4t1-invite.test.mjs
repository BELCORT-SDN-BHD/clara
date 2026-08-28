// P4 tranche-1 -- asks 3/4/6: invite_member, accept_invite, revoke_invite, and the
// _add_member_core / _claim_identity_core extraction accept_invite routes through.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLR, AGENT_USER_ID, assertRaises, opk, rootQuery, humanQuery, insertUser, createFirm, seedAdmission, getPool } from "./rig-fixtures.mjs";
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

// ---------------------------------------------------------------------------
// [N2 pin regression suite] -- the reviewer's own mutant panel on the round-2 comment-strip
// fix found the fix was still a PARTIAL instrument: it matches TEXT, not SYNTAX, and "absent"
// read as "earliest". Three residual holes, one family: (M5) the wall's PRESENCE was checked
// against RAW prosrc, so a body whose wall exists ONLY in a comment -- no real wall in code at
// all -- read as present; (M6) a `/* block comment */` naming the wall was never stripped;
// (M9) a `--` inside a STRING LITERAL ahead of the wall on the same line erases the wall from
// the line-stripped code, since the strip is syntax-blind and cannot tell a comment marker from
// one sitting inside quotes.
//
// THIS SUITE pushes real decoy `accept_invite` bodies through POSTGRES's OWN regexp_replace,
// via the migration's EXACT pin SQL copied verbatim (never a JS reimplementation -- review law
// 3, "spelling is not identity": a JS copy validates a copy, not the deployed pin) -- for SEVEN
// shapes (M2/M3 as standing regression controls the round-2 fix already got right; M5/M6/M6b/M9
// as the new holes round-3 closes), each proven in BOTH directions: the OLD (round-2, single-
// line-strip) pin's actual outcome, and the NEW (round-3, double-strip + presence-before-order)
// pin's actual outcome. Every mutation runs inside a rolled-back transaction; the real
// clara.accept_invite is never touched. M10 (below) is the drift guard on PIN_F4_NEW itself --
// review law 3 again, one level up: a hardcoded copy that silently stops matching what 0141
// actually ships would make every cell above validate a stale pin, not the deployed one.
// ---------------------------------------------------------------------------

const N2_MIGRATION_PATH = new URL("../migrations/0141_p4_tranche1_invite_rbac.sql", import.meta.url);
// The double-strip expression, copied VERBATIM from 0141 §K (5b) -- both F4 and F3 use it.
const N2_STRIP_EXPR = "regexp_replace(regexp_replace(v_bad, '/\\*.*?\\*/', '', 'gs'), '--[^\\n]*', '', 'g')";

test("p4t1.accept: [N2-M10 drift guard] the double-strip expression PIN_F4_NEW/PIN_F3 embed below is byte-identical to what 0141 actually ships -- exactly twice (F4 and F3)", async () => {
  const migrationSql = readFileSync(N2_MIGRATION_PATH, "utf8");
  const occurrences = migrationSql.split(N2_STRIP_EXPR).length - 1;
  assert.equal(
    occurrences,
    2,
    `this suite's embedded pin copy has DRIFTED from 0141's shipped strip -- found ${occurrences} occurrence(s) of the exact expression in the migration, expected exactly 2 (F4 + F3). Update PIN_F4_NEW/PIN_F3 above to match before trusting any other cell in this file.`,
  );
});

// PIN_F4_OLD: the F4 pin exactly as it shipped at 2b8c1a7d (round 2) -- raw-prosrc presence,
// then a SINGLE line-comment strip before the ordering check.
const PIN_F4_OLD = `do $$
declare v_bad text; v_code text;
begin
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.accept_invite(text,text,text)'::regprocedure;
  if position('does not match this invite' in v_bad) = 0 then
    raise exception 'accept_invite is missing its JWT-email wall' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(v_bad, '--[^\\n]*', '', 'g');
  if position('does not match this invite' in v_code) >= position('_reserve_op' in v_code) then
    raise exception 'F4 has regressed' using errcode = 'CLR10';
  end if;
end $$;`;

// PIN_F4_NEW: the F4 pin exactly as it ships in 0141 §K (5b) at this commit -- block comments
// AND line comments stripped, presence checked on the STRIPPED code (both markers), THEN the
// ordering check -- also on the stripped code.
const PIN_F4_NEW = `do $$
declare v_bad text; v_code text;
begin
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.accept_invite(text,text,text)'::regprocedure;
  v_code := regexp_replace(regexp_replace(v_bad, '/\\*.*?\\*/', '', 'gs'), '--[^\\n]*', '', 'g');
  if position('does not match this invite' in v_code) = 0 then
    raise exception 'accept_invite has no JWT-email wall in CODE' using errcode = 'CLR10';
  end if;
  if position('_reserve_op' in v_code) = 0 then
    raise exception 'accept_invite no longer calls _reserve_op in CODE' using errcode = 'CLR10';
  end if;
  if position('does not match this invite' in v_code) >= position('_reserve_op' in v_code) then
    raise exception 'F4 has regressed' using errcode = 'CLR10';
  end if;
end $$;`;

/** Runs `ddl` (a CREATE OR REPLACE on clara.accept_invite) then `pin` inside one transaction
 *  that is ALWAYS rolled back -- the real accept_invite is never mutated. Returns the pin's
 *  raised errcode, or null if the pin stayed silent. */
async function underPin(ddl, pin) {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    await c.query("set local role clara_fn_owner");
    await c.query(ddl);
    await c.query("reset role");
    try {
      await c.query(pin);
      return null;
    } catch (e) {
      return e.code ?? "RAISED";
    }
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    c.release();
  }
}

const decoyAccept = (body) => `create or replace function clara.accept_invite(p_token text, p_display_name text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
${body}
  return '{}'::jsonb;
end $fn$`;

const RESERVE_CALL = "  perform clara._reserve_op(null::uuid, 'accept_invite', p_op_key, null::bytea);";
const WALL_RAISE = "  raise exception 'the signed-in email does not match this invite';";

test("p4t1.accept: [N2-M2] mis-ordered body + an early LINE comment naming the wall -- both pins already correctly raise (round-2 control, unchanged by round 3)", async () => {
  const ddl = decoyAccept(`  -- the signed-in email does not match this invite (ONLY a comment)\n${RESERVE_CALL}\n${WALL_RAISE}`);
  const oldOutcome = await underPin(ddl, PIN_F4_OLD);
  const newOutcome = await underPin(ddl, PIN_F4_NEW);
  assert.equal(oldOutcome, "CLR10", "OLD pin already catches this mis-ordering despite the masking line comment");
  assert.equal(newOutcome, "CLR10", "NEW pin still catches it -- round 3 must not regress round 2's fix");
});

test("p4t1.accept: [N2-M3] correct body + an early LINE comment naming the dedupe call -- both pins already correctly stay silent (round-2 control, unchanged by round 3)", async () => {
  const ddl = decoyAccept(`  -- this body calls clara._reserve_op below, after the wall\n${WALL_RAISE}\n${RESERVE_CALL}`);
  const oldOutcome = await underPin(ddl, PIN_F4_OLD);
  const newOutcome = await underPin(ddl, PIN_F4_NEW);
  assert.equal(oldOutcome, null, "OLD pin already does not false-alarm on this correct body");
  assert.equal(newOutcome, null, "NEW pin still does not false-alarm -- round 3 must not introduce a new false positive");
});

test("p4t1.accept: [N2-M5] the wall exists ONLY as a comment, with NO real wall anywhere in code -- the OLD pin was fooled (the exact catastrophe this pin exists to prevent); the NEW pin correctly refuses", async () => {
  const ddl = decoyAccept(`  -- the signed-in email does not match this invite\n${RESERVE_CALL}`);
  const oldOutcome = await underPin(ddl, PIN_F4_OLD);
  const newOutcome = await underPin(ddl, PIN_F4_NEW);
  assert.equal(oldOutcome, null, "OLD pin: FOOLED -- a body with no real email wall at all reads as fine (raw-prosrc presence check finds the comment)");
  assert.equal(newOutcome, "CLR10", "NEW pin: presence is checked on the STRIPPED code, so a comment-only wall is correctly read as absent");
});

test("p4t1.accept: [N2-M6] a /* block comment */ naming the wall masks a genuinely mis-ordered body -- the OLD pin (line-strip only) was fooled; the NEW pin (block-then-line strip) correctly refuses", async () => {
  const ddl = decoyAccept(`  /* the signed-in email does not match this invite -- block comment */\n${RESERVE_CALL}\n${WALL_RAISE}`);
  const oldOutcome = await underPin(ddl, PIN_F4_OLD);
  const newOutcome = await underPin(ddl, PIN_F4_NEW);
  assert.equal(oldOutcome, null, "OLD pin: FOOLED -- block comments are not line comments, so /* ... */ survives the single strip and its own text satisfies the order check");
  assert.equal(newOutcome, "CLR10", "NEW pin: block comments are stripped FIRST, so no comment text survives to mask the real dedupe-before-wall order");
});

test("p4t1.accept: [N2-M6b] a MULTI-LINE /* */ block comment (proving the 'gs' flag actually spans newlines, not merely that block-stripping exists) also cannot mask a mis-ordered body", async () => {
  const ddl = decoyAccept(
    `  /* preamble\n     the signed-in email does not match this invite\n     end of note */\n${RESERVE_CALL}\n${WALL_RAISE}`,
  );
  const oldOutcome = await underPin(ddl, PIN_F4_OLD);
  const newOutcome = await underPin(ddl, PIN_F4_NEW);
  assert.equal(oldOutcome, null, "OLD pin: FOOLED -- same M6 hole, multi-line changes nothing for a strip that never touches block comments at all");
  assert.equal(newOutcome, "CLR10", "NEW pin: the 'gs' flag lets the block-comment strip span newlines (not just single-line /* */), so a three-line comment is stripped just as completely as a one-line one");
});

test("p4t1.accept: [N2-M6b correct twin] a correctly-ordered body with an early MULTI-LINE block comment mentioning the dedupe call does not false-alarm under the NEW pin -- even though a block comment surviving the OLD pin's line-only strip WOULD have false-alarmed it", async () => {
  const ddl = decoyAccept(
    `  /* preamble\n     this body calls clara._reserve_op below\n     end of note */\n${WALL_RAISE}\n${RESERVE_CALL}`,
  );
  const oldOutcome = await underPin(ddl, PIN_F4_OLD);
  const newOutcome = await underPin(ddl, PIN_F4_NEW);
  assert.equal(oldOutcome, "CLR10", "OLD pin: FALSE-ALARMS -- the block comment (never stripped) still carries an early '_reserve_op' mention, which the line-only strip leaves intact ahead of the real wall");
  assert.equal(newOutcome, null, "NEW pin: the whole block comment is gone before the order check ever runs, so the correctly-ordered real code (wall, then dedupe) reads correctly and stays silent");
});

test("p4t1.accept: [N2-M9] a '--' inside a STRING LITERAL, ahead of the wall text on the same line, erases the wall from the mis-ordered body's stripped code -- the OLD pin was fooled; the NEW pin fails CLOSED because presence is now mandatory on the stripped code", async () => {
  const ddl = decoyAccept(`${RESERVE_CALL}\n  raise exception 'problem -- the signed-in email does not match this invite';`);
  const oldOutcome = await underPin(ddl, PIN_F4_OLD);
  const newOutcome = await underPin(ddl, PIN_F4_NEW);
  assert.equal(oldOutcome, null, "OLD pin: FOOLED -- the strip is syntax-blind and deletes from the literal's own '--' to end of line, erasing the wall text entirely, so the order check reads position 0 and passes a genuinely mis-ordered body");
  assert.equal(newOutcome, "CLR10", "NEW pin: the same syntax-blind erasure still happens, but presence is now checked BEFORE ordering and fails CLOSED on 'wall not found in code' rather than silently reading position 0 as 'ran first'");
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
