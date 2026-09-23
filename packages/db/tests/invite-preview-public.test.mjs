// #871 — clara.preview_invite_by_token(p_token, p_origin_digest): the SIGNED-OUT invite preview.
// Migration 0309_invite_preview_public_door.sql.
//
// THE OWNER'S RULING OF 2026-09-23 IS THE CONTRACT (ticket #871, "Owner's ruling (2026-09-23) and
// the re-brief"): a server-only SECURITY DEFINER read in schema `clara`, callable only by a new
// NOLOGIN group role no client credential is a member of; it answers firm name, invited role,
// effective status and a masked address for an OPEN invite, and ONE and the same answer for a
// wrong, expired, revoked or unknown token.
//
// THE SEAMS (WORK-ORDER rule 4 — the public interfaces the brief names, and no cell sits anywhere
// else):
//   S1. THE DOOR ITSELF, driven through `set role clara_invite_preview` — the only principal that
//       may call it. Never `rootQuery`, which is superuser and proves nothing about reachability.
//   S2. THE GRANT BOUNDARY, read off the live catalog: who may EXECUTE, who may not, and whether
//       the role pair carries a credential.
//   S3. THE ROSTER READ `clara.firm_invites_visible`, driven as a real admin session, as the
//       INDEPENDENT source of truth for the effective status in all five states.
//   S4. THE RATE WALL, driven through the door itself (there is no other entrance to it) and read
//       back through `clara.invite_preview_attempts` for the evidence it must leave behind.
//
// `rootQuery` appears ONLY to arrange fixtures and to read facts a masked door deliberately never
// returns (row counts, catalog ACLs, the attempts ledger); never for the assertion under test.
//
// WHY THE FIVE-STATE CELL COMPARES BEHAVIOUR RATHER THAN A STRING IN ALL FIVE STATES. The ruling
// asks for both "the same five-state answer the roster and the signed-in preview give" and "a
// wrong, expired, revoked or unknown token gets one and the same answer". The two meet exactly
// where this estate already draws the line: `pending` and `issuer_lapsed` are the NON-BLOCKING
// statuses (apps/web/lib/firm/invite-preview.ts, #872's owner ruling), and those two are the ones
// the door reports by name; the three that mean "there is nothing left to accept" are behind the
// single refusal. So the five-state cell drives ALL THREE READERS for the same invite in each of
// the five states — the roster, the SIGNED-IN `clara.preview_invite`, and this door — and
// asserts: the roster and the signed-in preview agree in all five; the signed-out door reports
// that same status, firm name, role and MASK verbatim in the two open ones; and the single refusal
// in the other three, where naming the status would be the existence oracle the ruling forbids.
// §D.T7 / §D.T7b of the migration additionally pin the status derivation AND the mask as
// byte-shared with `clara.preview_invite`, so neither can fork between releases.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLR, rootQuery, humanQuery, roleQuery, insertUser, createFirm, seedAdmission, opk,
  ensureReady, endPool, membershipId, setMemberRole, withActor,
} from "./rig-fixtures.mjs";
import { CHAIN_MINTED_ROLES } from "./rig-cluster-reset.mjs";
import {
  inviteMember, revokeInvite, acceptInvite, expireInvite, freshPersona, humanEmailQuery,
} from "./p4t1-fixtures.mjs";

const DOOR = "clara.preview_invite_by_token(text,bytea)";
const GROUP_ROLE = "clara_invite_preview";
const LOGIN_ROLE = "clara_invite_preview_login";
const MIGRATION = "0309_invite_preview_public_door.sql";
const MIGRATION_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", MIGRATION);

let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const catalog = await rootQuery("select to_regprocedure($1) is not null as present", [DOOR]);
  if (catalog.rows[0]?.present !== true) {
    if (process.env.CLARA_ALLOW_MISSING_INVITE_PREVIEW_PUBLIC !== "1") {
      throw new Error(
        `#871 premise ${MIGRATION} is not applied (${DOOR} does not resolve) and ` +
          "CLARA_ALLOW_MISSING_INVITE_PREVIEW_PUBLIC is unset -- this is a FOCUSED run and must " +
          "fail loudly, not skip. Preload ./tests/invite-preview-public-preintegration-gate.mjs " +
          "for an estate sweep against a pre-PR chain.",
      );
    }
    ready = false;
  }
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: ensureReady() found no draft_entry, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

/** A FRESH 32-byte origin digest per call. Every cell needs its own: the wall's second limb keys
 *  on this value with a ceiling of five per quarter-hour, and the attempts table is append-only,
 *  so a shared digest would make each cell's budget depend on how many ran before it. */
const originDigest = () => randomBytes(32);

/** THE DOOR, driven as the ONE principal that may call it. `roleQuery` does `set role <role>` on a
 *  real connection — the same shape every other least-privilege cell in this suite uses. */
async function previewByToken(token, digest = originDigest(), role = GROUP_ROLE) {
  const r = await roleQuery(
    role,
    "select clara.preview_invite_by_token(p_token => $1, p_origin_digest => $2) as result",
    [token, digest],
  );
  return r.rows[0].result;
}

/** A firm with an owner and one admin who issues the invites. */
async function scene(tag) {
  const owner = await insertUser("p871", `${tag}_owner`);
  const token = await seedAdmission(`p871-${tag}`);
  const firmName = `P871 ${tag} ${Date.now()}`;
  const firm = await createFirm(owner, { name: firmName, token, opKey: opk(`firm_${tag}`) });
  const admin = await insertUser("p871", `${tag}_admin`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    firm, admin, "admin", opk(`addadmin_${tag}`),
  ]);
  return { firm, firmName, owner, admin };
}

// ---------------------------------------------------------------------------
// S1 — the door answers an OPEN invite
// ---------------------------------------------------------------------------

test("p871.door.open: a live pending token answers firm_name, role, the effective status and a MASKED address -- and never the address itself", async (t) => {
  if (unready(t)) return;
  const sc = await scene("open");
  const invitee = freshPersona("open");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "bookkeeper", opKey: opk("open") });

  const out = await previewByToken(issued.token);

  assert.equal(out.outcome, "preview", "an open invite previews");
  assert.equal(out.firm_name, sc.firmName, "the firm the invite is INTO, by name");
  assert.equal(out.role, "bookkeeper", "the role the invite grants");
  assert.equal(out.status, "pending", "the EFFECTIVE status, by the shared expression");
  const [local, domain] = invitee.email.split("@");
  assert.equal(out.masked_email, `${local[0]}***@${domain}`, "a masked hint, not the address");
  assert.notEqual(out.masked_email, invitee.email, "the full address is never returned");
  assert.deepEqual(
    Object.keys(out).sort(),
    ["firm_name", "masked_email", "outcome", "role", "status"],
    "the answer shape is CLOSED -- no token, no invite id, no inviter, no sixth key",
  );
});

test("p871.door.open: the preview MINTS NOTHING -- no membership, no users row, no op receipt, and the invite stays pending", async (t) => {
  if (unready(t)) return;
  const sc = await scene("readonly");
  const invitee = freshPersona("readonly");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "viewer", opKey: opk("ro871") });

  await previewByToken(issued.token);

  const u = await rootQuery("select count(*)::int as n from clara.users where id = $1", [invitee.sub]);
  assert.equal(u.rows[0].n, 0, "a preview never claims an identity");
  const m = await rootQuery("select count(*)::int as n from clara.firm_memberships where user_id = $1", [invitee.sub]);
  assert.equal(m.rows[0].n, 0, "a preview never mints a membership");
  const inv = await rootQuery("select status from clara.firm_invites where id = $1", [issued.invite_id]);
  assert.equal(inv.rows[0].status, "pending", "a preview never consumes the invite");
  const ops = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where firm_id = $1 and fn = 'preview_invite_by_token'",
    [sc.firm],
  );
  assert.equal(ops.rows[0].n, 0, "a read reserves no operation identity -- there is no op_key and nothing to dedupe");
});

// ---------------------------------------------------------------------------
// S1/S3 -- the ONE refusal, and the five states
// ---------------------------------------------------------------------------

test("p871.door.no_oracle: an UNKNOWN, an EXPIRED, a REVOKED and an ACCEPTED token get one BYTE-IDENTICAL answer", async (t) => {
  if (unready(t)) return;
  const sc = await scene("oracle");

  // Four real rows in four different terminal states, plus a token that names nothing.
  const expiredP = freshPersona("oracle_expired");
  const expired = await inviteMember(sc.admin, { email: expiredP.email, role: "viewer", opKey: opk("oe871") });
  await expireInvite(expired.invite_id);

  const revokedP = freshPersona("oracle_revoked");
  const revoked = await inviteMember(sc.admin, { email: revokedP.email, role: "viewer", opKey: opk("or871") });
  await revokeInvite(sc.admin, { invite: revoked.invite_id, opKey: opk("orv871") });

  const acceptedP = freshPersona("oracle_accepted");
  const accepted = await inviteMember(sc.admin, { email: acceptedP.email, role: "viewer", opKey: opk("oa871") });
  await acceptInvite(acceptedP.sub, acceptedP.email, {
    token: accepted.token, displayName: "Oracle Accepted", opKey: opk("oac871"),
  });

  const unknown = await previewByToken("f".repeat(64));
  const onExpired = await previewByToken(expired.token);
  const onRevoked = await previewByToken(revoked.token);
  const onAccepted = await previewByToken(accepted.token);

  assert.deepEqual(unknown, { outcome: "not_previewable" }, "the single refusal is a one-key constant");
  for (const [label, answer] of [["expired", onExpired], ["revoked", onRevoked], ["accepted", onAccepted]]) {
    assert.deepEqual(
      answer, unknown,
      `a ${label} token must answer BYTE-IDENTICALLY to an invented one -- any difference tells a stranger this token exists`,
    );
  }
  // ...and none of the four probes moved a row.
  const rows = await rootQuery(
    "select status from clara.firm_invites where id = any($1::uuid[]) order by status",
    [[expired.invite_id, revoked.invite_id, accepted.invite_id]],
  );
  assert.deepEqual(rows.rows.map((r) => r.status), ["accepted", "pending", "revoked"],
    "the expired row is still stored 'pending' (expiry is computed live), and nothing else moved");
});

test("p871.door.five_states: in EVERY one of the five effective states the roster, the SIGNED-IN preview and this door agree about the same invite", async (t) => {
  if (unready(t)) return;
  const sc = await scene("five");

  /** The roster's own answer for one invite, read as the OWNER (admin+ floor, firm-scoped). */
  const roster = async (inviteId) => {
    const r = await humanQuery(sc.owner, "select status from clara.firm_invites_visible where id = $1", [inviteId]);
    return r.rows[0] ? r.rows[0].status : null;
  };

  /** THE SIGNED-IN PREVIEW (#625's clara.preview_invite), driven as the INVITED address's own
   *  session -- the third reader the 2026-09-23 ruling names. It reports its own effective status
   *  in all five states (p625.preview.status_faces), so this is a driven comparison rather than an
   *  inference from a shared expression (spec review SPEC-871-B, 2026-09-24). */
  const signedIn = async (persona, token) => {
    const r = await humanEmailQuery(
      persona.sub, persona.email, "select clara.preview_invite(p_token => $1) as result", [token],
    );
    return r.rows[0].result;
  };

  const seen = [];

  // 1 -- pending
  const pendingP = freshPersona("five_pending");
  const pending = await inviteMember(sc.admin, { email: pendingP.email, role: "bookkeeper", opKey: opk("f5p") });
  seen.push(["pending", await roster(pending.invite_id), await previewByToken(pending.token),
    await signedIn(pendingP, pending.token)]);

  // 2 -- expired
  const expiredP = freshPersona("five_expired");
  const expired = await inviteMember(sc.admin, { email: expiredP.email, role: "viewer", opKey: opk("f5e") });
  await expireInvite(expired.invite_id);
  seen.push(["expired", await roster(expired.invite_id), await previewByToken(expired.token),
    await signedIn(expiredP, expired.token)]);

  // 3 -- revoked
  const revokedP = freshPersona("five_revoked");
  const revoked = await inviteMember(sc.admin, { email: revokedP.email, role: "viewer", opKey: opk("f5r") });
  await revokeInvite(sc.admin, { invite: revoked.invite_id, opKey: opk("f5rv") });
  seen.push(["revoked", await roster(revoked.invite_id), await previewByToken(revoked.token),
    await signedIn(revokedP, revoked.token)]);

  // 4 -- accepted
  const acceptedP = freshPersona("five_accepted");
  const accepted = await inviteMember(sc.admin, { email: acceptedP.email, role: "viewer", opKey: opk("f5a") });
  await acceptInvite(acceptedP.sub, acceptedP.email, {
    token: accepted.token, displayName: "Five Accepted", opKey: opk("f5ac"),
  });
  seen.push(["accepted", await roster(accepted.invite_id), await previewByToken(accepted.token),
    await signedIn(acceptedP, accepted.token)]);

  // 5 -- issuer_lapsed: a STILL-PENDING invite whose issuer no longer holds admin standing (#872).
  const lapsedP = freshPersona("five_lapsed");
  const lapsed = await inviteMember(sc.admin, { email: lapsedP.email, role: "viewer", opKey: opk("f5l") });
  const adminMembership = await membershipId(sc.firm, sc.admin);
  await setMemberRole(sc.owner, { membership: adminMembership, role: "bookkeeper", opKey: opk("f5demote") });
  seen.push(["issuer_lapsed", await roster(lapsed.invite_id), await previewByToken(lapsed.token),
    await signedIn(lapsedP, lapsed.token)]);

  // The roster is the INDEPENDENT source of truth: it must have produced all five, in order.
  assert.deepEqual(
    seen.map(([, rosterStatus]) => rosterStatus),
    ["pending", "expired", "revoked", "accepted", "issuer_lapsed"],
    "the five states were actually reached -- otherwise the comparison below is vacuous",
  );

  // THE SIGNED-IN PREVIEW AGREES WITH THE ROSTER IN ALL FIVE STATES. Two independent readers, one
  // derivation -- this is the half of AC3 that holds verbatim everywhere.
  assert.deepEqual(
    seen.map(([, , , inPreview]) => inPreview.status),
    ["pending", "expired", "revoked", "accepted", "issuer_lapsed"],
    "the signed-in preview reports the same five effective statuses the roster does, for the same five invites",
  );

  const OPEN = new Set(["pending", "issuer_lapsed"]);
  for (const [label, rosterStatus, answer, inPreview] of seen) {
    assert.equal(inPreview.status, rosterStatus,
      `${label}: the signed-in preview and the roster agree about this invite`);
    if (OPEN.has(rosterStatus)) {
      assert.equal(answer.outcome, "preview", `${label}: an OPEN invite previews`);
      assert.equal(answer.status, rosterStatus,
        `${label}: the door reports the roster's own effective status, verbatim`);
      assert.equal(answer.status, inPreview.status,
        `${label}: ...and the SIGNED-OUT door reports exactly what the SIGNED-IN preview reports`);
      assert.equal(answer.firm_name, inPreview.firm_name, `${label}: one firm name, two doors`);
      assert.equal(answer.role, inPreview.role, `${label}: one role, two doors`);
      assert.equal(answer.masked_email, inPreview.masked_email,
        `${label}: one MASK, two doors -- the signed-out page never publishes more address than the signed-in one`);
    } else {
      // A CLOSED invite: the signed-in preview still names its status to the invited address (it
      // has already proved who it is), while the signed-out door answers the ONE refusal. The
      // ruling's "never an existence oracle" is what makes the two differ here, deliberately.
      assert.deepEqual(answer, { outcome: "not_previewable" },
        `${label}: a CLOSED invite gets the single refusal, identical to an unknown token's`);
    }
  }

  // ...and re-promoting the issuer returns the SAME invite to 'pending' on both surfaces: the fifth
  // status is read-time only and reversible (#872's owner ruling), which is a property of the
  // SHARED expression rather than of either reader.
  await setMemberRole(sc.owner, { membership: adminMembership, role: "admin", opKey: opk("f5repromote") });
  assert.equal(await roster(lapsed.invite_id), "pending", "the roster returns to pending");
  const again = await previewByToken(lapsed.token);
  assert.equal(again.status, "pending", "and so does the door -- one expression, two readers");
});

// ---------------------------------------------------------------------------
// S2 -- the grant boundary
// ---------------------------------------------------------------------------

test("p871.grant.only_the_group: the catalog ACL is exactly {clara_fn_owner, clara_invite_preview}, and every other role in this estate is refused EXECUTE", async (t) => {
  if (unready(t)) return;
  const posture = await rootQuery(
    `select pg_get_userbyid(p.proowner) as owner, p.prosecdef, array_to_string(p.proconfig, ',') as config,
            array_to_string(p.proacl, ',') as acl
       from pg_proc p where p.oid = $1::regprocedure`,
    [DOOR],
  );
  assert.deepEqual(
    posture.rows[0],
    {
      owner: "clara_fn_owner",
      prosecdef: true,
      config: "search_path=clara, pg_temp",
      acl: "clara_fn_owner=X/clara_fn_owner,clara_invite_preview=X/clara_fn_owner",
    },
    "owner, SECURITY DEFINER, pinned search_path and the EXACT ACL TEXT (grantor included, so a WITH GRANT OPTION cannot hide)",
  );

  const REFUSED = [
    "clara_authenticated", "clara_runtime", "clara_runtime_login", "clara_agent_ro",
    "clara_agent_read_login", "clara_freeform_ro", "clara_freeform_login",
    "clara_wake_interactive", "clara_wake_proactive", "clara_wake_bank", "clara_wake_filing",
    "clara_wake_write_login", "clara_wake_bank_login", "clara_stripe_webhook",
    "clara_stripe_webhook_login", "clara_auth_wall", "clara_auth_wall_login",
  ];
  const reach = await rootQuery(
    `select r as role, has_function_privilege(r, $1, 'EXECUTE') as may
       from unnest($2::text[]) r where to_regrole(r) is not null`,
    [DOOR, REFUSED],
  );
  assert.equal(reach.rows.length, REFUSED.length, "every role in the roster exists on this rig -- the probe is not vacuous");
  assert.deepEqual(reach.rows.filter((x) => x.may).map((x) => x.role), [],
    "no application role, no runtime role and no other lane may EXECUTE the signed-out door");

  // THE SERVICE CREDENTIAL. Supabase's platform roles do not exist on this rig, so "service_role
  // is refused" is proven by the ACL TEXT above (two entries, neither of them service_role)
  // rather than by a probe that would silently pass on a role that is not there.
  const platform = await rootQuery(
    "select coalesce(string_agg(rolname, ','), '(none)') as present from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')",
  );
  assert.equal(platform.rows[0].present, "(none)",
    "the platform roles are absent here; the ACL text is what proves none of them holds this grant");

  const allowed = await rootQuery(
    `select r as role, has_function_privilege(r, $1, 'EXECUTE') as may from unnest($2::text[]) r`,
    [DOOR, [GROUP_ROLE, LOGIN_ROLE]],
  );
  assert.deepEqual(allowed.rows.map((x) => x.may), [true, true],
    "the group role may call it, and the NOLOGIN shell inherits that reach");
});

test("p871.grant.credential_less: both new roles are NOLOGIN, carry no escalation bit, hold no table privilege, and NO client credential is a member of the group", async (t) => {
  if (unready(t)) return;
  const roles = await rootQuery(
    `select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
       from pg_roles where rolname = any($1::text[]) order by rolname`,
    [[GROUP_ROLE, LOGIN_ROLE]],
  );
  assert.deepEqual(roles.rows.map((r) => r.rolname), [GROUP_ROLE, LOGIN_ROLE], "both roles exist");
  for (const r of roles.rows) {
    assert.equal(r.rolcanlogin, false, `${r.rolname} must be NOLOGIN -- the credential is an out-of-band operator ceremony`);
    assert.deepEqual(
      [r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole], [false, false, false, false],
      `${r.rolname} carries no escalation bit`,
    );
  }

  // THE MEMBERSHIP CHAIN, and who ELSE is in it. `postgres` is the rig's own superuser, granted the
  // shell exactly as 0163 grants it so a cell can SET ROLE with no password; any OTHER member
  // would be a client credential reaching a server-only door.
  const members = await rootQuery(
    `select g.rolname as grp, m.rolname as member
       from pg_auth_members am
       join pg_roles g on g.oid = am.roleid
       join pg_roles m on m.oid = am.member
      where g.rolname = any($1::text[]) order by g.rolname, m.rolname`,
    [[GROUP_ROLE, LOGIN_ROLE]],
  );
  assert.deepEqual(
    members.rows.map((r) => `${r.grp}<-${r.member}`),
    [`${GROUP_ROLE}<-${LOGIN_ROLE}`, `${LOGIN_ROLE}<-postgres`],
    "exactly the 0163 chain: the shell is in the group, and only the rig superuser is in the shell",
  );

  const grants = await rootQuery(
    `select coalesce(string_agg(format('%s:%s:%s', grantee, table_name, privilege_type), ', '), '(none)') as g
       from information_schema.role_table_grants
      where table_schema = 'clara' and grantee = any($1::text[])`,
    [[GROUP_ROLE, LOGIN_ROLE]],
  );
  assert.equal(grants.rows[0].g, "(none)",
    "the lane holds ZERO relation privilege -- the wall's evidence table is written by the definer body, never by the caller");
});

test("p871.grant.from_scratch: exactly ONE migration mints these two roles, and its number is above 0154's cluster role census", async (t) => {
  if (unready(t)) return;
  // A from-scratch chain stays lawful because migrations apply in ASCENDING numeric order
  // (scripts/migrate.mjs: the `a.num - b.num` sort), so at the moment 0154's
  // `count(*) ... like 'clara%' <> 14` census runs, a role minted at 0309 does not exist yet. This
  // cell proves the two premises that argument rests on, from the corpus itself.
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const minting = files.filter((f) => {
    const sql = readFileSync(join(dir, f), "utf8");
    return [...sql.matchAll(/create role (clara_[a-z0-9_]+)\b/g)].some(
      (m) => m[1] === GROUP_ROLE || m[1] === LOGIN_ROLE,
    );
  });
  assert.deepEqual(minting, ["0309_invite_preview_public_door.sql"],
    "exactly one migration mints the invite-preview role pair");
  assert.ok(Number(minting[0].slice(0, 4)) > 154,
    `${minting[0]} must sort after 0154, whose tail pins the cluster-wide clara role count at 14`);

  const migrator = readFileSync(join(dir, "..", "scripts", "migrate.mjs"), "utf8");
  assert.ok(/migrations\.sort\(\(a, b\) => a\.num - b\.num\)/.test(migrator),
    "the migrator applies files in ascending numeric order -- the premise the argument above rests on");

  // ...and the live cluster now carries exactly the two extra roles the migration's own tail asserted.
  const census = await rootQuery("select count(*)::int as n from pg_roles where rolname like 'clara%'");
  assert.equal(census.rows[0].n, 20, "18 before this file, 20 after -- 0154's own pin of 14 is at a point 155 files earlier");
});

// ---------------------------------------------------------------------------
// S2 -- the migration's own PRESTATE, against the census a LIVE project has
// ---------------------------------------------------------------------------

test("p871.prestate.hosted_shaped: the prestate names the roles it needs and NEVER pins an absolute clara% count -- the old pin would have aborted the hosted release window", async (t) => {
  if (unready(t)) return;
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  // (1) THE ROSTER IS THE CHAIN'S OWN, derived rather than re-typed here. `CHAIN_MINTED_ROLES` is
  // itself derived from deploy/roles-bootstrap.sql at module load (rig-cluster-reset.mjs's drift
  // guard), so this comparison has an INDEPENDENT source of truth on both sides.
  const block = sql.slice(
    sql.indexOf("-- (b) THE CHAIN-MINTED ROLES"),
    sql.indexOf("if v_bad <> '(none)' then"),
  );
  assert.ok(block.length > 0, "the prestate's (b) section is where this cell says it is");
  const roster = [...block.matchAll(/\('(clara_[a-z0-9_]+)'\)/g)].map((m) => m[1]).sort();
  const expected = CHAIN_MINTED_ROLES.filter((r) => r !== GROUP_ROLE && r !== LOGIN_ROLE).slice().sort();
  assert.deepEqual(roster, expected,
    "the prestate requires exactly the chain-minted roles that exist BEFORE this file, by name");

  // (2) AND NOWHERE IN THE PRESTATE IS A CLUSTER-WIDE clara% COUNT COMPARED WITH A LITERAL. That
  // shape is unsound on any live project, because deploy/storage-provision.sql mints roles the
  // migration chain never does (adversarial ADV-L05-01, 2026-09-24).
  const prestate = sql.slice(sql.indexOf("do $pre$"), sql.indexOf("end $pre$;"));
  assert.ok(
    !/rolname like 'clara%'[\s\S]{0,240}?<>\s*\d+/.test(prestate),
    "the prestate must not compare a cluster-wide clara% census with a literal",
  );

  // (3) DRIVEN, on a HOSTED-SHAPED census: one role the chain never mints, present. The roster
  // predicate must still admit; the census the file no longer pins must read 19, which is exactly
  // what the removed `<> 18` pin would have aborted on.
  await withActor({}, async (client) => {
    await client.query("begin");
    try {
      await client.query("create role clara_p871_deploy_probe nologin noinherit");
      const shaped = await client.query(
        "select count(*)::int as n from pg_roles where rolname like 'clara%'",
      );
      assert.equal(shaped.rows[0].n, 21,
        "the transaction is hosted-shaped: this file's own two roles plus one deploy-minted role");

      const missing = await client.query(
        `select coalesce(string_agg(t.name, ', ' order by t.name), '(none)') as missing
           from unnest($1::text[]) t(name) where to_regrole(t.name) is null`,
        [roster],
      );
      assert.equal(missing.rows[0].missing, "(none)",
        "the prestate's roster predicate still admits a cluster carrying deploy-minted roles");

      // VACUITY CONTROL, and the reproduction of the blocker: the REMOVED absolute form, run on
      // the same transaction with this file's own two roles discounted, reads 19 and not 18 --
      // i.e. the shipped pin raised CLR10 here and stopped the hosted migrate step at 0309.
      const old = await client.query(
        "select count(*)::int - 2 as pre_0309 from pg_roles where rolname like 'clara%'",
      );
      assert.equal(old.rows[0].pre_0309, 19,
        "the removed `<> 18` pin would have aborted on this census -- which is why it is gone");
    } finally {
      await client.query("rollback");
    }
  });

  // ...and the lane cluster is exactly as it was.
  const after = await rootQuery(
    "select count(*)::int as n from pg_roles where rolname = 'clara_p871_deploy_probe'",
  );
  assert.equal(after.rows[0].n, 0, "the probe role never survives the rollback");
});

test("p871.prestate.first_or_redo: the prestate admits all-four-absent and all-four-present, and refuses every half", async (t) => {
  if (unready(t)) return;
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  // The file is re-applied by CLARA_MIGRATION_REDO during a fix round, so every statement it owns
  // must survive a second run over its own effects (packages/db/README.md, "Redo (#957)").
  for (const shape of [
    "create table if not exists clara.invite_preview_attempts",
    "create index if not exists ix_invite_preview_attempts_token_attempted",
    "create index if not exists ix_invite_preview_attempts_origin_attempted",
    "drop policy if exists p_invite_preview_attempts_owner",
    "drop trigger if exists t_invite_preview_attempts_append_only",
    "drop trigger if exists t_invite_preview_attempts_no_truncate",
    "create or replace function clara.preview_invite_by_token",
  ]) {
    assert.ok(sql.includes(shape), `0309 must be redo-safe: missing "${shape}"`);
  }
  assert.ok(/a half-applied state this file will not repair/.test(sql),
    "and a partial state is refused rather than repaired -- the file cannot know which half is older");
  // The tail's census check is RELATIVE to what the prestate recorded, and mode-aware, so a redo
  // (delta 0) is as lawful as a first apply (delta 2).
  assert.ok(/v_delta := case when v_mode = 'REDO' then 0 else 2 end;/.test(sql),
    "the tail's role-census delta is relative and mode-aware");
});

// ---------------------------------------------------------------------------
// S4 -- the rate wall
// ---------------------------------------------------------------------------

test("p871.wall.digests: a missing or wrong-length digest, and an absent token, are the ONLY facts this door raises on", async (t) => {
  if (unready(t)) return;
  const sc = await scene("digest");
  const invitee = freshPersona("digest");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "viewer", opKey: opk("dg871") });

  const raised = async (token, digest) => {
    try {
      await previewByToken(token, digest);
      return null;
    } catch (e) {
      return { code: e.code ? e.code : null, message: e.message ? e.message : null };
    }
  };
  assert.deepEqual(await raised(issued.token, null), { code: CLR.badRequest, message: "a digest is required" });
  assert.deepEqual(await raised(issued.token, randomBytes(31)), { code: CLR.badRequest, message: "a digest is required" });
  assert.deepEqual(await raised("   ", randomBytes(32)), { code: CLR.badRequest, message: "a token is required" });
  // ...and neither refusal left an attempt behind, because neither could be keyed.
  const before = await rootQuery("select count(*)::int as n from clara.invite_preview_attempts");
  await raised(issued.token, null);
  const after = await rootQuery("select count(*)::int as n from clara.invite_preview_attempts");
  assert.equal(after.rows[0].n, before.rows[0].n, "an unkeyable call counts against nobody's budget");
});

test("p871.wall.origin_limb: five previews from one address are served, the sixth is rate-limited with the door's own wait -- and an UNKNOWN token spends the budget exactly as a real one does", async (t) => {
  if (unready(t)) return;
  const sc = await scene("wall_origin");
  const invitee = freshPersona("wall_origin");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "viewer", opKey: opk("wo871") });
  const digest = originDigest();

  // FIVE DIFFERENT tokens, so only the ORIGIN limb can be what refuses. Four of them name nothing
  // at all: enumeration must cost the same as a legitimate read.
  const answers = [];
  for (let i = 0; i < 4; i += 1) answers.push(await previewByToken(String(i).repeat(64), digest));
  answers.push(await previewByToken(issued.token, digest));
  assert.deepEqual(
    answers.map((a) => a.outcome), ["not_previewable", "not_previewable", "not_previewable", "not_previewable", "preview"],
    "the first five are served",
  );

  const sixth = await previewByToken(issued.token, digest);
  assert.equal(sixth.outcome, "rate_limited", "the sixth call from this address is walled");
  assert.ok(Number.isInteger(sixth.retry_after_seconds), "the wait is an integer");
  assert.ok(sixth.retry_after_seconds >= 0 && sixth.retry_after_seconds <= 900,
    `the wait is inside the door's own clamp, got ${sixth.retry_after_seconds}`);
  assert.deepEqual(Object.keys(sixth).sort(), ["outcome", "retry_after_seconds"],
    "a walled answer names no limb -- which budget was exhausted is not a caller's business");

  // THE EVIDENCE: FIVE rows for this digest -- one per ADMITTED call, four of them for tokens that
  // name nothing. The sixth call was refused and left nothing behind, which is what bounds the
  // table and stops a refusal from extending the window that refused it (ADV-L05-04).
  const rows = await rootQuery(
    "select count(*)::int as n from clara.invite_preview_attempts where origin_digest = $1", [digest],
  );
  assert.equal(rows.rows[0].n, 5, "every ADMITTED call left evidence; the refused one left none");
});

test("p871.wall.bounded: a sustained flood on ONE link leaves exactly five rows and does NOT slide the window -- a stranger with the link cannot wall a real invitee for ever", async (t) => {
  if (unready(t)) return;
  const sc = await scene("wall_bounded");
  const invitee = freshPersona("wall_bounded");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "viewer", opKey: opk("wb871") });

  // TWELVE reads of one link, each from a DIFFERENT address, so only the TOKEN limb can refuse.
  // This is the shape of the attack the adversarial round drove: a forwarded e-mail, a retrying
  // client or a crawler holding a public URL.
  const answers = [];
  for (let i = 0; i < 12; i += 1) answers.push(await previewByToken(issued.token, originDigest()));
  assert.deepEqual(
    answers.map((a) => a.outcome),
    ["preview", "preview", "preview", "preview", "preview",
     "rate_limited", "rate_limited", "rate_limited", "rate_limited", "rate_limited",
     "rate_limited", "rate_limited"],
    "five served, seven walled",
  );

  const hash = await rootQuery("select sha256(convert_to(btrim($1), 'UTF8')) as h", [issued.token]);
  const rows = await rootQuery(
    "select count(*)::int as n from clara.invite_preview_attempts where token_hash = $1", [hash.rows[0].h],
  );
  assert.equal(rows.rows[0].n, 5,
    "the table is BOUNDED at the ceiling: seven refusals wrote nothing, so an unauthenticated flood of a PUBLIC page cannot grow an append-only, unprunable relation without limit");

  const waits = answers.slice(5).map((a) => a.retry_after_seconds);
  for (const w of waits) assert.ok(Number.isInteger(w) && w >= 0 && w <= 900, `wait inside the clamp: ${w}`);
});

test("p871.wall.no_slide: with an AGED window the advertised wait is the oldest ADMITTED attempt's own expiry, and a refusal never pushes it out", async (t) => {
  if (unready(t)) return;
  const sc = await scene("wall_slide");
  const invitee = freshPersona("wall_slide");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "viewer", opKey: opk("ws871") });

  // A WORKED EXAMPLE, planted rather than produced, so the expected numbers come from the
  // timestamps and not from re-running the door's own arithmetic. Five attempts on this token, at
  // 14, 13, 12, 11 and 10 minutes ago -- all inside the quarter-hour window, the ceiling reached.
  const hash = (await rootQuery("select sha256(convert_to(btrim($1), 'UTF8')) as h", [issued.token])).rows[0].h;
  await rootQuery(
    `insert into clara.invite_preview_attempts(token_hash, origin_digest, attempted_at)
     select $1, $2, now() - (m || ' minutes')::interval from unnest(array[14,13,12,11,10]) m`,
    [hash, randomBytes(32)],
  );

  // The oldest attempt expires 15 minutes after it happened, i.e. in about ONE minute. That is the
  // whole of the wait a walled caller should be told about, and it is what a future call actually
  // needs: once that row leaves the window four remain, which is under the ceiling.
  const first = await previewByToken(issued.token, originDigest());
  assert.equal(first.outcome, "rate_limited", "the ceiling is reached, so this read is walled");
  assert.ok(first.retry_after_seconds >= 55 && first.retry_after_seconds <= 61,
    `the wait is the OLDEST attempt's own expiry (~60s), got ${first.retry_after_seconds}`);

  // THE SECOND REFUSAL IS MEASURED AGAINST THE SAME FIVE ROWS. Were a refusal still counted -- the
  // shipped-first ordering -- this call would read a window of six and answer with the THIRD
  // planted row's expiry (~180s) instead: every reload would push a real invitee's link further
  // out, which is the self-perpetuating lockout ADV-L05-04 measured.
  const second = await previewByToken(issued.token, originDigest());
  assert.equal(second.outcome, "rate_limited");
  assert.ok(second.retry_after_seconds <= first.retry_after_seconds && second.retry_after_seconds >= 45,
    `a refusal may never push the wait OUT (first ${first.retry_after_seconds}s, second ${second.retry_after_seconds}s)`);

  const rows = await rootQuery(
    "select count(*)::int as n from clara.invite_preview_attempts where token_hash = $1", [hash],
  );
  assert.equal(rows.rows[0].n, 5, "the two refusals wrote nothing: the five planted rows are all there is");
});

test("p871.wall.token_limb: one token polled from five different addresses is served, the sixth is rate-limited", async (t) => {
  if (unready(t)) return;
  const sc = await scene("wall_token");
  const invitee = freshPersona("wall_token");
  const issued = await inviteMember(sc.admin, { email: invitee.email, role: "viewer", opKey: opk("wt871") });

  const served = [];
  for (let i = 0; i < 5; i += 1) served.push(await previewByToken(issued.token, originDigest()));
  assert.deepEqual(served.map((a) => a.outcome), ["preview", "preview", "preview", "preview", "preview"],
    "five reads of one link, each from a different address, are served");

  const sixth = await previewByToken(issued.token, originDigest());
  assert.equal(sixth.outcome, "rate_limited",
    "the sixth is walled by the TOKEN limb -- a link cannot be polled without limit even from a fresh address");
  assert.ok(sixth.retry_after_seconds >= 0 && sixth.retry_after_seconds <= 900);

  // The wall is the door's ONLY refusal here: the invite is still open and unmoved.
  const inv = await rootQuery("select status from clara.firm_invites where id = $1", [issued.invite_id]);
  assert.equal(inv.rows[0].status, "pending");
});

test("p871.wall.evidence: the attempts table holds the token hash, the peppered digest and a timestamp -- and nothing else", async (t) => {
  if (unready(t)) return;
  const cols = await rootQuery(
    `select string_agg(attname, ',' order by attnum) as cols from pg_attribute
      where attrelid = 'clara.invite_preview_attempts'::regclass and attnum > 0 and not attisdropped`,
  );
  assert.equal(cols.rows[0].cols, "id,token_hash,origin_digest,attempted_at",
    "no address, no e-mail, no plaintext token, no invite id");

  const posture = await rootQuery(
    `select c.relrowsecurity as rls, c.relforcerowsecurity as forced,
            (select count(*)::int from pg_policy where polrelid = c.oid) as policies,
            (select count(*)::int from pg_trigger where tgrelid = c.oid and not tgisinternal) as triggers
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'invite_preview_attempts'`,
  );
  assert.deepEqual(posture.rows[0], { rls: true, forced: true, policies: 1, triggers: 2 },
    "forced RLS, one owner policy, and the append-only + no-truncate guards clara.confirmation_attempts carries");

  // APPEND-ONLY, DRIVEN: the guard is asserted by making it fire, not by reading its name.
  await assert.rejects(
    () => rootQuery("delete from clara.invite_preview_attempts where id = (select id from clara.invite_preview_attempts limit 1)"),
    (e) => typeof e.message === "string" && e.message.length > 0,
    "a delete on the wall's evidence is refused",
  );
});

test("p871.derivation: the shared status expression AND the shared MASK are present in BOTH bodies on the live catalog (and neither pin is vacuous)", async (t) => {
  if (unready(t)) return;
  const SHARED = `case
           when i.status = 'pending' and i.expires_at <= now() then 'expired'
           when i.status = 'pending' and coalesce(
                  (select clara.role_rank(m.role) from clara.firm_memberships m
                     where m.user_id = i.invited_by and m.firm_id = i.firm_id and m.status = 'active'),
                  -1) < clara.role_rank('admin')
             then 'issuer_lapsed'
           else i.status
         end as status`;
  // THE MASK GETS ITS OWN PIN. The status forking would make two readers disagree about one invite;
  // the MASK forking would make the SIGNED-OUT, public page publish more of a stranger's address
  // than the signed-in one does -- and the masked address is the one field the 2026-09-23 ruling
  // says must never widen. Nothing pinned it until spec review SPEC-871-C asked for it.
  const MASK = `v_at := position('@' in inv.email);
  if v_at > 1 then
    v_masked := left(inv.email, 1) || '***@' || substr(inv.email, v_at + 1);
  else
    v_masked := '***';
  end if;`;
  const strip = (s) => s.replace(/\s+/g, "");
  const bodies = await rootQuery(
    `select t.sig, p.prosrc from (values ($1),($2)) t(sig) join pg_proc p on p.oid = t.sig::regprocedure`,
    ["clara.preview_invite(text)", DOOR],
  );
  assert.equal(bodies.rows.length, 2, "both bodies resolve");
  for (const row of bodies.rows) {
    assert.ok(strip(row.prosrc).includes(strip(SHARED)),
      `${row.sig} must carry the SHARED five-state expression verbatim -- a fork is how the two reads start disagreeing about one invite`);
    assert.ok(strip(row.prosrc).includes(strip(MASK)),
      `${row.sig} must carry the SHARED masking block verbatim -- a fork is how a public page starts publishing more address than a signed-in one`);
  }
  // Vacuity control: the same comparisons against MUTATED expressions must fail, so a green above
  // means "the text matched", never "the matcher matches anything".
  const mutatedStatus = SHARED.replace("'issuer_lapsed'", "'issuer_departed'");
  const mutatedMask = MASK.replace("left(inv.email, 1)", "left(inv.email, 3)");
  for (const row of bodies.rows) {
    assert.ok(!strip(row.prosrc).includes(strip(mutatedStatus)), `${row.sig}: the status matcher is not vacuous`);
    assert.ok(!strip(row.prosrc).includes(strip(mutatedMask)), `${row.sig}: the mask matcher is not vacuous`);
  }
  // ...and the migration's OWN tail carries both pins, so a later recut of either body is caught by
  // the chain itself and not only by this battery.
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  assert.ok(/the two reads have FORKED/.test(sql), "the tail pins the status expression in both bodies");
  assert.ok(/the two masks have FORKED/.test(sql), "the tail pins the masking block in both bodies");
});
