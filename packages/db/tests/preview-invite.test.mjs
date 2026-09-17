// #625 — clara.preview_invite(p_token): the ONE pre-password read that lets an invitee see WHICH
// FIRM and WHICH ROLE they are about to join, before they set a password and before the
// acceptance door runs. Migration 0224.
//
// EVERY CELL CALLS THROUGH A REAL LEAST-PRIVILEGED PERSONA. `asHumanEmail` (p4t1-fixtures.mjs:11)
// does `set role clara_authenticated` and sets a real `request.jwt.claims` blob carrying `sub`
// AND `email` — the two claims the door reads. `rootQuery` appears ONLY for arranging fixtures
// and for reading facts a masked door deliberately never returns (row counts, token_hash,
// catalog ACLs); never for the assertion under test.
//
// THE FOUR PROPERTIES THIS BATTERY EXISTS FOR:
//   1. the RECIPIENT sees firm_name + role + effective status + a MASKED address;
//   2. NO EXISTENCE ORACLE — an invented token and a real token previewed by the wrong
//      signed-in address produce a BYTE-IDENTICAL refusal (code, message, detail);
//   3. the three non-pending effective statuses each report themselves, mint nothing and move
//      no row;
//   4. `token_hash` is unreachable — not in the answer, not through a table grant, and the
//      function itself is EXECUTE-reachable by `clara_authenticated` and nobody else.
// …plus (5) a NON-REGRESSION pin: 0224 recuts no body, so the five member doors and
// `_jwt_email()` must hash exactly as they did before it applied, and `accept_invite`'s
// JWT-email wall must still sit BEFORE `_reserve_op` in its own stripped source.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLR, PG, assertRaises, opk, rootQuery, insertUser, createFirm, seedAdmission,
  humanQuery, ensureReady, endPool, membershipId, setMemberRole,
} from "./rig-fixtures.mjs";
import { inviteMember, revokeInvite, acceptInvite, expireInvite, freshPersona, humanEmailQuery } from "./p4t1-fixtures.mjs";

const PREVIEW_DOOR = "clara.preview_invite(text)";
const PREVIEW_MIGRATION = "0224_preview_invite.sql";

/** The SIX bodies 0224 must leave untouched, with the sha256 of their `prosrc` MEASURED on this
 *  rig at 193 migrations (0001→0198) before 0224 existed — never transcribed from a creating
 *  file, because several of these are splices (`set_member_role` alone was emitted at 0005:707,
 *  0145:592 and 0157:248, so a pin taken from any one of those files matches nothing).
 *  The migration's own §0 prestate carries the same six numbers and refuses to apply if one has
 *  moved; this cell is the same fact asserted from the other side, AFTER it applied. */
const DOOR_PINS = [
  ["clara.accept_invite(text,text,text)", "42a153231c724aaace9fb9dae7abe3551667c6669e7dacd1d5495b35c31aeef2"],
  ["clara.invite_member(text,text,text)", "809d29ed4d702a7672931497a953ae0a66387b412597c5150b92d541ccc2636c"],
  ["clara.revoke_invite(uuid,text)", "2943909c1ee1a324d2fd6c986026b86f1aa43e6d3410f92fdcdb6727ae9220f3"],
  ["clara.set_member_role(uuid,text,text)", "84457f830741fafe3f37348b503e934f491752aa65fbdaccaf49d50ab63b8c26"],
  ["clara.remove_member(uuid,text)", "3ad0b907cb2057f237010d22099760d07d1c55c634d6b0e4708e813f60f20b54"],
  ["clara._jwt_email()", "cca5a3865ccd8a2e98e5c2ec8bc8570dcf90c04c8e83f2883b77d2fe223bb9c9"],
];

let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const catalog = await rootQuery("select to_regprocedure($1) is not null as present", [PREVIEW_DOOR]);
  if (catalog.rows[0]?.present !== true) {
    if (process.env.CLARA_ALLOW_MISSING_PREVIEW_INVITE !== "1") {
      throw new Error(
        `preview-invite premise ${PREVIEW_MIGRATION} is not applied (${PREVIEW_DOOR} does not resolve) ` +
          "and CLARA_ALLOW_MISSING_PREVIEW_INVITE is unset -- this is a FOCUSED run and must fail " +
          "loudly, not skip. Preload ./tests/preview-invite-preintegration-gate.mjs for an estate " +
          "sweep against a pre-PR chain.",
      );
    }
    ready = false;
  }
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: ensureReady() found no draft_entry, or ${PREVIEW_MIGRATION} is not applied`);
    return true;
  }
  return false;
}

/** A firm with an owner and one admin, ready to issue invites. */
async function scene(tag) {
  const owner = await insertUser("p625", `${tag}_owner`);
  const token = await seedAdmission(`p625-preview-${tag}`);
  const firmName = `P625 Preview ${tag} ${Date.now()}`;
  const firm = await createFirm(owner, { name: firmName, token, opKey: opk(`firm_${tag}`) });
  const admin = await insertUser("p625", `${tag}_admin`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    firm, admin, "admin", opk(`addadmin_${tag}`),
  ]);
  return { firm, firmName, owner, admin };
}

/** The door, called as the signed-in person `sub`/`email` — a real clara_authenticated session. */
async function preview(sub, email, token) {
  const r = await humanEmailQuery(
    sub, email,
    "select clara.preview_invite(p_token => $1) as result",
    [token],
  );
  return r.rows[0].result;
}

/** Everything a refusal carries that a caller could read: the three fields PostgREST relays. */
async function refusalOf(fn) {
  try {
    await fn();
  } catch (e) {
    return { code: e.code ?? null, message: e.message ?? null, detail: e.detail ?? null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1 — the recipient
// ---------------------------------------------------------------------------

test("p625.preview.recipient: the invited address reads firm_name, role, a pending status and a MASKED address -- and never the address itself", async (t) => {
  if (unready(t)) return;
  const sc = await scene("recipient");
  const invitee = freshPersona("recipient");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "bookkeeper", opKey: opk("rcp") });

  const out = await preview(invitee.sub, invitee.email, issued.token);

  assert.equal(out.firm_name, sc.firmName, "the firm the invite is INTO, by name");
  assert.equal(out.role, "bookkeeper", "the role the invite grants");
  assert.equal(out.status, "pending", "the EFFECTIVE status, computed the way firm_invites_visible computes it");
  // The MASK: first character of the local part, three fixed stars (no length leak), the domain.
  const [local, domain] = invitee.email.split("@");
  assert.equal(out.masked_email, `${local[0]}***@${domain}`, "a masked hint, not the address");
  assert.notEqual(out.masked_email, invitee.email, "the full address is never returned");
  assert.deepEqual(
    Object.keys(out).sort(),
    ["firm_name", "masked_email", "role", "status"],
    "FOUR keys, and no fifth -- the answer shape is closed",
  );
});

test("p625.preview.recipient: the preview MINTS NOTHING -- no membership, no users row, and the invite stays pending", async (t) => {
  if (unready(t)) return;
  const sc = await scene("readonly");
  const invitee = freshPersona("readonly");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "viewer", opKey: opk("ro") });

  await preview(invitee.sub, invitee.email, issued.token);

  const u = await rootQuery("select count(*)::int as n from clara.users where id = $1", [invitee.sub]);
  assert.equal(u.rows[0].n, 0, "a preview never claims an identity");
  const m = await rootQuery("select count(*)::int as n from clara.firm_memberships where user_id = $1", [invitee.sub]);
  assert.equal(m.rows[0].n, 0, "a preview never mints a membership");
  const inv = await rootQuery("select status from clara.firm_invites where id = $1", [issued.invite_id]);
  assert.equal(inv.rows[0].status, "pending", "a preview never consumes the invite");
  const ops = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where firm_id = $1 and fn = 'preview_invite'",
    [sc.firm],
  );
  assert.equal(ops.rows[0].n, 0, "a read reserves no operation identity -- there is no op_key and nothing to dedupe");
});

// ---------------------------------------------------------------------------
// 2 — no existence oracle
// ---------------------------------------------------------------------------

test("p625.preview.no_oracle: an invented token and a REAL token previewed by the wrong signed-in address refuse BYTE-IDENTICALLY", async (t) => {
  if (unready(t)) return;
  const sc = await scene("oracle");
  const invitee = freshPersona("oracle_target");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "admin", opKey: opk("orc") });
  const stranger = freshPersona("oracle_stranger");

  const invented = await refusalOf(() => preview(stranger.sub, stranger.email, "f".repeat(64)));
  const wrongEmail = await refusalOf(() => preview(stranger.sub, stranger.email, issued.token));

  assert.ok(invented, "an invented token must refuse");
  assert.ok(wrongEmail, "a real token previewed by the wrong address must refuse");
  assert.deepEqual(
    wrongEmail, invented,
    "code, message AND detail must be identical -- any difference is an oracle telling a stranger that this token exists",
  );
  assert.equal(invented.code, CLR.badRequest, "the shared refusal is CLR10");
  // …and the real invite is untouched by either probe.
  const row = await rootQuery("select status from clara.firm_invites where id = $1", [issued.invite_id]);
  assert.equal(row.rows[0].status, "pending");
});

test("p625.preview.no_oracle: a signed-in session with NO verified email claim gets that same refusal, not a different one", async (t) => {
  if (unready(t)) return;
  const sc = await scene("noemail");
  const invitee = freshPersona("noemail_target");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "viewer", opKey: opk("nem") });

  const invented = await refusalOf(() => preview(invitee.sub, invitee.email, "e".repeat(64)));
  // `asHumanEmail` with a null email writes `"email": null` into the claims blob, which
  // `clara._jwt_email()` reads back as NULL -- the same shape a JWT with no verified address has.
  const noEmail = await refusalOf(() => preview(invitee.sub, null, issued.token));
  assert.deepEqual(noEmail, invented, "a caller the wall cannot match is not told whether the token is real");
});

// ---------------------------------------------------------------------------
// 3 — the three non-pending faces
// ---------------------------------------------------------------------------

test("p625.preview.status_faces: revoked / expired / already-accepted each report their OWN effective status and move no row", async (t) => {
  if (unready(t)) return;
  const sc = await scene("faces");

  // (a) REVOKED — the row's own status.
  const revokee = freshPersona("faces_revoked");
  const revoked = await inviteMember(sc.admin, { email: revokee.email, role: "viewer", opKey: opk("f_rev_i") });
  await revokeInvite(sc.admin, { invite: revoked.invite_id, opKey: opk("f_rev_r") });
  const revokedOut = await preview(revokee.sub, revokee.email, revoked.token);
  assert.equal(revokedOut.status, "revoked");
  assert.equal(revokedOut.firm_name, sc.firmName, "a dead invite still names the firm it was for");

  // (b) EXPIRED — the row is STILL `pending`; the status is computed off `expires_at`, exactly
  //     the expression `firm_invites_visible` uses (0141:532-534). A stored-status read would
  //     say `pending` here and the invitee would be shown a password form for a dead link.
  const stale = freshPersona("faces_expired");
  const expired = await inviteMember(sc.admin, { email: stale.email, role: "viewer", opKey: opk("f_exp_i") });
  await expireInvite(expired.invite_id);
  const stored = await rootQuery("select status from clara.firm_invites where id = $1", [expired.invite_id]);
  assert.equal(stored.rows[0].status, "pending", "control: the STORED status is still pending");
  const expiredOut = await preview(stale.sub, stale.email, expired.token);
  assert.equal(expiredOut.status, "expired", "the EFFECTIVE status, computed live off expires_at");

  // (c) ACCEPTED — previewed by the person who accepted it, who is now a member.
  const joiner = freshPersona("faces_accepted");
  const accepted = await inviteMember(sc.admin, { email: joiner.email, role: "bookkeeper", opKey: opk("f_acc_i") });
  await acceptInvite(joiner.sub, joiner.email, { token: accepted.token, displayName: "Faces Joiner", opKey: opk("f_acc_a") });
  const acceptedOut = await preview(joiner.sub, joiner.email, accepted.token);
  assert.equal(acceptedOut.status, "accepted");
  assert.equal(acceptedOut.role, "bookkeeper");

  // NOTHING MOVED. Three previews, three rows, each still in the state its own act left it.
  const after = await rootQuery(
    "select id, status from clara.firm_invites where id = any($1::uuid[]) order by id",
    [[revoked.invite_id, expired.invite_id, accepted.invite_id]],
  );
  const byId = Object.fromEntries(after.rows.map((r) => [r.id, r.status]));
  assert.equal(byId[revoked.invite_id], "revoked");
  assert.equal(byId[expired.invite_id], "pending", "expiry is COMPUTED, never persisted by a read");
  assert.equal(byId[accepted.invite_id], "accepted");
  const n = await rootQuery("select count(*)::int as n from clara.firm_invites where firm_id = $1", [sc.firm]);
  assert.equal(n.rows[0].n, 3, "no fourth invite row appeared");
});

// ---------------------------------------------------------------------------
// 4 — nothing leaks
// ---------------------------------------------------------------------------

test("p625.preview.no_leak: token_hash is in no key and no value of the answer", async (t) => {
  if (unready(t)) return;
  const sc = await scene("leak");
  const invitee = freshPersona("leak");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "viewer", opKey: opk("leak") });
  const raw = await rootQuery("select encode(token_hash,'hex') as hex from clara.firm_invites where id = $1", [issued.invite_id]);
  const hex = raw.rows[0].hex;

  const out = await preview(invitee.sub, invitee.email, issued.token);
  const serialised = JSON.stringify(out);
  assert.equal(serialised.includes("token_hash"), false, "no key names it");
  assert.equal(serialised.includes(hex), false, "no value carries it");
  assert.equal(serialised.includes(issued.token), false, "and the plaintext token is not echoed back either");
  assert.equal(serialised.includes(invitee.email), false, "nor the full address");
  assert.equal(serialised.includes(String(issued.invite_id)), false, "nor the invite id -- a preview names no row");
});

test("p625.preview.no_leak: clara_authenticated still holds ZERO table privilege on clara.firm_invites -- 0141 §B is untouched", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') as privs
       from information_schema.role_table_grants
      where table_schema = 'clara' and table_name = 'firm_invites' and grantee = 'clara_authenticated'`,
  );
  assert.equal(r.rows[0].privs, "", "the base table stays reachable only through the definer doors and the masked view");
});

test("p625.preview.no_leak: the door reaches clara_authenticated and NOBODY else -- runtime, agent, wake and PUBLIC all 42501", async (t) => {
  if (unready(t)) return;
  const acl = await rootQuery(
    "select coalesce(array_to_string(proacl, ','), '<null>') as acl from pg_proc where oid = $1::regprocedure",
    [PREVIEW_DOOR],
  );
  assert.equal(
    acl.rows[0].acl,
    "clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner",
    "the EXACT ACL text, grantor included -- a WITH GRANT OPTION or a PUBLIC grant cannot hide behind a privilege probe",
  );
  for (const role of ["clara_runtime", "clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive"]) {
    const has = await rootQuery("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, PREVIEW_DOOR]);
    assert.equal(has.rows[0].ok, false, `${role} must not reach the invite preview`);
  }
  const pub = await rootQuery(
    "select exists (select 1 from aclexplode((select proacl from pg_proc where oid = $1::regprocedure)) a where a.grantee = 0) as leaks",
    [PREVIEW_DOOR],
  );
  assert.equal(pub.rows[0].leaks, false, "no PUBLIC EXECUTE");
});

test("p625.preview.no_leak: a runtime session actually RAISES 42501 -- the ACL is enforced, not merely declared", async (t) => {
  if (unready(t)) return;
  await assertRaises(
    PG.insufficientPrivilege,
    async () => {
      const { withActor } = await import("./rig-helpers.mjs");
      return withActor({ role: "clara_runtime" }, (c) =>
        c.query("select clara.preview_invite(p_token => $1)", ["a".repeat(64)]));
    },
    "clara_runtime calling preview_invite",
  );
});

// ---------------------------------------------------------------------------
// 5 — non-regression: 0224 recuts nothing
// ---------------------------------------------------------------------------

test("p625.doors.nonregression: the five member doors and _jwt_email() hash EXACTLY as they did before 0224 applied", async (t) => {
  if (unready(t)) return;
  for (const [sig, expected] of DOOR_PINS) {
    const r = await rootQuery(
      "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure",
      [sig],
    );
    assert.ok(r.rows[0], `${sig} must still resolve`);
    assert.equal(r.rows[0].sha, expected, `${sig} has DRIFTED -- 0224 recuts no body, so this is a real regression`);
  }
});

test("p625.doors.nonregression: accept_invite's JWT-email wall still precedes _reserve_op in its own stripped source", async (t) => {
  if (unready(t)) return;
  // 0141 §K(5b)'s own double-strip, copied VERBATIM from the migration rather than
  // re-implemented in JS -- review law 3, "spelling is not identity".
  const STRIP = "regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'gs'), '--[^\\n]*', '', 'g')";
  const MIGRATION = new URL("../migrations/0141_p4_tranche1_invite_rbac.sql", import.meta.url);
  const shipped = "regexp_replace(regexp_replace(v_bad, '/\\*.*?\\*/', '', 'gs'), '--[^\\n]*', '', 'g')";
  assert.equal(
    readFileSync(MIGRATION, "utf8").split(shipped).length - 1, 2,
    "this cell's strip has drifted from the expression 0141 §K actually ships (expected 2 occurrences: F4 + F3)",
  );
  const r = await rootQuery(
    `select position('does not match this invite' in ${STRIP}) as wall,
            position('_reserve_op' in ${STRIP}) as reserve
       from pg_proc p where p.oid = 'clara.accept_invite(text,text,text)'::regprocedure`,
  );
  const { wall, reserve } = r.rows[0];
  assert.ok(Number(wall) > 0, "the wall must be present in CODE, not only in a comment");
  assert.ok(Number(reserve) > 0, "…and so must the dedupe call this cell orders it against");
  assert.ok(Number(wall) < Number(reserve), "F4: the JWT-email wall must still run BEFORE _reserve_op");
});

// ---------------------------------------------------------------------------
// 6 — the THIRD wall accept_invite carries and this door does NOT
// ---------------------------------------------------------------------------
//
// A NAMED DIVERGENCE, PINNED SO IT CANNOT WIDEN SILENTLY. `clara.accept_invite` walls on THREE
// facts, not two: sha256(token), `_jwt_email()` — and, since 0157's F2 fix, the ISSUER'S CURRENT
// RANK (`if clara.role_rank(inv.role) > coalesce(v_issuer_rank, -1) then raise ... CLR04`). That
// third wall reads `clara.firm_memberships` for the person who ISSUED the invitation, which is a
// fact `clara.firm_invites_visible` does not carry either — so the admin roster and this preview
// agree with each other and BOTH are blind to it. The consequence is real and is written down
// rather than implied: an invitation issued by someone who has since been demoted, or who has
// left the firm at all (`coalesce(..., -1)` refuses every role for a non-member issuer), still
// previews as `pending`, the password form renders, the password is really set, and only the
// acceptance door refuses — with its own actionable sentence, rendered verbatim.
//
// WHY THIS DOOR IS NOT WIDENED TO MATCH. Reporting it would need a FIFTH effective status, and
// the invite-outcome face set is fixed at four by the wave's own ruling (DECISIONS §2 #625) while
// the effective-status expression is bound to `firm_invites_visible`'s (brief-625 §3) — a fifth
// value would put the preview and the roster into disagreement about the same row. Closing it
// properly is a product decision plus a matching widening of the VIEW, i.e. its own ticket.
// Until then, this cell is the record: preview says `pending`, accept says CLR04.

test("p625.preview.issuer_rank: an invitation whose ISSUER was demoted still previews as `pending` and is then REFUSED by accept_invite -- the one wall this door does not reproduce, pinned", async (t) => {
  if (unready(t)) return;
  const sc = await scene("issuer");
  const invitee = freshPersona("issuer_rank");
  // The admin issues at its own ceiling …
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "admin", opKey: opk("isr_i") });
  // … and the OWNER then demotes that admin, which is the ordinary shape: the invitation outlives
  // the authority that minted it.
  const adminMembership = await membershipId(sc.firm, sc.admin);
  await setMemberRole(sc.owner, { membership: adminMembership, role: "bookkeeper", opKey: opk("isr_d") });

  const shown = await preview(invitee.sub, invitee.email, issued.token);
  assert.equal(shown.status, "pending", "the ROW is untouched, so the effective status is still pending");
  assert.equal(shown.role, "admin", "…and it still advertises the role it was minted with");
  assert.equal(shown.firm_name, sc.firmName);

  // THE DIVERGENCE ITSELF. If this ever stops refusing — or starts refusing with a different
  // code or sentence — the preview door's documented blind spot has moved and this file, the
  // 0224 header, `apps/web/lib/firm/invite-preview.ts` and `packages/db/README.md`'s residual
  // must move with it.
  const refusal = await refusalOf(() => acceptInvite(invitee.sub, invitee.email, {
    token: issued.token, displayName: "Issuer Rank", opKey: opk("isr_a"),
  }));
  assert.ok(refusal, "accept_invite must refuse an invitation that outranks its issuer's CURRENT rank");
  assert.equal(refusal.code, CLR.authz, "CLR04 -- an authority refusal, not a lifecycle one");
  assert.match(refusal.message, /invite exceeds the issuer's rank/, "0157 F2's own sentence, verbatim");

  // The refusal is total: nothing was minted on the way to it.
  const m = await rootQuery("select count(*)::int as n from clara.firm_memberships where user_id = $1", [invitee.sub]);
  assert.equal(m.rows[0].n, 0, "a refused acceptance mints no membership");
  const row = await rootQuery("select status from clara.firm_invites where id = $1", [issued.invite_id]);
  assert.equal(row.rows[0].status, "pending", "…and leaves the invitation exactly where it was");

  // AND THE ROSTER IS BLIND IN THE SAME PLACE, which is why the preview is not the outlier: the
  // admin who lists invitations sees `pending` too.
  const seen = await humanEmailQuery(
    sc.owner, null,
    "select status from clara.firm_invites_visible where id = $1",
    [issued.invite_id],
  );
  assert.equal(seen.rows[0].status, "pending", "clara.firm_invites_visible does not carry the issuer's rank either");
});
