// #625's own mock lane — the MEMBERSHIP LIFECYCLE walk's mutable roster and invite list.
//
// A file-disjoint sibling of `journals-table-mock.mjs` and `periodic-adjustment-mock.mjs`,
// consulted by `serve-built.mjs` through ONE hook, exactly as those modules describe for
// themselves. What is REAL: the browser, the built Next bundle, the real same-origin
// `/api/invite` route, and every line of client code under test. What is FAKED: PostgREST behind
// them. So this walk proves the JOURNEY and the client's own wire shapes; the DOORS themselves
// are proven in `packages/db/tests/p4t1-invite.test.mjs` and `mdrw-rank-walls.test.mjs`, under
// real least-privileged Postgres roles. A mock-backed walk is never AC7 evidence and this file
// does not pretend otherwise.
//
// =============================================================================================
// THIS LANE TAKES THREE READS OUT OF `serve-built.mjs`'s CORE — A DECLARED HANDOVER.
//
// `/rest/v1/caller_context`, `/rest/v1/firm_members_visible` and `/rest/v1/firm_invites_visible`
// are answered in that file's own body (its `:486`, `:505`, `:520` branches) with FIXED fixtures:
// one roster row, an empty invite array, and a caller context derived from the signed-in address.
// Fixed fixtures cannot be revoked, re-roled or removed, which is precisely what this walk has to
// do — so this lane is consulted BEFORE those branches and answers them for its OWN persona.
//
// THE SCOPE IS THE PERSONA, and it is a real one rather than a flag of convenience. Every handler
// below returns `false` unless the signed-in address is this lane's own
// (`members-lifecycle@example.test`), which `serve-built.mjs` passes in from the session state it
// already keeps. The CORE's own `caller_context` branch answers a MEMBERSHIP only for addresses
// beginning `owner@` or `bookkeeper@` and an empty array for everyone else, so this lane takes
// nothing from any sibling walk: without it, its persona would simply have no membership at all.
//
// The handover is declared in `e2e-fixture-ownership.test.ts` (`CORE_RELATION_HANDOVERS`), which
// fails if a lane pre-empts a CORE relation without saying so — the same discipline
// `SHARED_RPC_VERBS` applies to verbs two lanes answer.
//
// =============================================================================================
// WHAT THE INVITE LEG CAN AND CANNOT PROVE HERE, stated rather than papered over.
//
// `POST /api/invite` is a REAL Next route. Before it calls `clara.invite_member` it checks
// whether this deployment can send mail at all (`lib/members/invite-mail.ts`'s
// `inviteMailCapability`), and the harness deliberately sets no `RESEND_API_KEY` — for the same
// reason `e2e/run.mjs` deliberately sets no `STRIPE_SECRET_KEY`: a key here would send a real
// outbound request to a third party from every test run. `RESEND_ENDPOINT` is a module constant
// with no base override, so there is nothing to point at the mock either.
//
// So the invite leg drives the real dialog, the real courier round trip and the real settled
// banner for the outcome this harness can honestly produce (`mail_not_configured` — nothing was
// created), and the PENDING-ROW half of AC1 is walked over a row this lane seeds. The invite
// door's own behaviour — the token, the pending row it really mints, the CLR10 duplicate wall —
// is proven in the DB battery under real roles, which is where that claim belongs.

// =============================================================================================
// AND THE ACCEPTANCE LEG (round-1 F4): TWO SHAPES THIS HARNESS HAD NO ANSWER FOR AT ALL.
//
// `serve-built.mjs`'s `/auth/v1/verify` branch answers `type: "signup"` and 400s everything else,
// so the `type: "invite"` call `/invite/:token` makes had no answer anywhere — which is why no
// browser leg had ever driven that page past verification, and why the ONE caller migration 0209
// exists for (`clara.preview_invite`, which no CORE branch and no sibling lane answers either) was
// proven only in jsdom. Both are EXTENSIONS rather than handovers: nothing loses a fixture,
// because nothing had one. They are scoped by TOKEN, not by persona — this lane's own
// `supabaseToken` for the verification, and one of its two `ct` tokens for the preview — because
// at that point in the journey the invitee is signed in as nobody this harness tracks.
//
// WHAT THAT LEG STILL DOES NOT PROVE. The door. `clara.preview_invite`'s JWT-email wall, its
// single no-oracle refusal, its mask and its effective status are the DB battery's claim under
// real least-privileged roles (`packages/db/tests/preview-invite.test.mjs`). What the browser adds
// is the part jsdom cannot hold: a real `verifyOtp` round trip, the real session store it writes,
// and the real `Authorization` header the next governed call carries.

import { matchVerb, readCachedJson } from "./mock-dispatch.mjs";

export const MEMBERS_LIFECYCLE = {
  /** THE SCOPE. Not `owner@`/`bookkeeper@`: those two prefixes are the CORE's own personas and
   *  claiming either would be this lane answering for every sibling walk that signs in as one. */
  email: "members-lifecycle@example.test",
  firmId: "5e5e5e5e-5555-4555-8555-555555555551",
  firmName: "LARKIN & CO",
  subject: "22222222-2222-4222-8222-222222222222",
  ownerMembership: "5e5e5e5e-5555-4555-8555-555555555561",
  bookkeeperMembership: "5e5e5e5e-5555-4555-8555-555555555562",
  viewerMembership: "5e5e5e5e-5555-4555-8555-555555555563",
  pendingInvite: "5e5e5e5e-5555-4555-8555-555555555571",
  pendingInviteEmail: "newhire@larkin.test",
  bookkeeperName: "Siti Rahman",
  viewerName: "Wei Chan",
  /** THE ACCEPTANCE LEG (#625 round-1 F4). Two tokens, because the preview step has two
   *  browser-observable outcomes: one that lets the password form render and one that must not.
   *  `supabaseToken` is the PATH segment `verifyOtp` consumes; the `ct` query parameter carries
   *  Clara's own token, and the two are NOT interchangeable (`invite-accept-form.tsx`'s own
   *  note at `:407-421`). */
  supabaseToken: "e2e-members-lifecycle-invite",
  inviteeEmail: "newhire@larkin.test",
  inviteeSubject: "66666666-6666-4666-8666-666666666661",
  previewPendingToken: "e2e-clara-invite-pending",
  previewRevokedToken: "e2e-clara-invite-revoked",
};

/** The RPC verbs this lane owns, and the ALLOW-LIST its own dispatch runs on: the guard below
 *  returns `false` for any verb absent from this set BEFORE the handler chain reaches a branch,
 *  which is `plans-mock.mjs:286`'s shape (`if (!PLANS_RPC_VERBS.has(verb)) return false;`) and
 *  `L7_RPC_VERBS`'s before it. So a verb answered here without being declared here does not work
 *  at all, and the declaration cannot drift away from the dispatch while the walk stays green.
 *  `e2e-fixture-ownership.test.ts`'s verb census reads this file's SOURCE (a regex over the
 *  literal `/rest/v1/rpc/` openers each branch below carries), so it censuses those branches
 *  whether or not it can see this Set — the two mechanisms are independent on purpose. Do not
 *  write that regex's own shape into a comment here: that census reads comments too, and a
 *  quoted opener in prose is counted as a handler (measured — it reported one). */
export const MEMBERS_LIFECYCLE_RPC_VERBS = new Set([
  "set_member_role",
  "remove_member",
  "revoke_invite",
  "preview_invite",
  "e2e_members_lifecycle_reset",
]);

function seed() {
  return {
    /** The signed-in person's own rank. Mutable so a walk could drive a downgrade; today the
     *  unit cell `p625.web.downgrade` owns that claim, because flipping a rank mid-walk needs a
     *  second actor this harness has no second session for. */
    callerRole: "owner",
    callerRoleRank: 3,
    members: [
      {
        membership_id: MEMBERS_LIFECYCLE.ownerMembership,
        user_id: MEMBERS_LIFECYCLE.subject,
        display_name: "Tao Lim",
        email: MEMBERS_LIFECYCLE.email,
        role: "owner",
        role_rank: 3,
        status: "active",
        created_at: "2026-01-04T00:00:00Z",
        removed_at: null,
      },
      {
        membership_id: MEMBERS_LIFECYCLE.bookkeeperMembership,
        user_id: "33333333-3333-4333-8333-333333333333",
        display_name: MEMBERS_LIFECYCLE.bookkeeperName,
        email: "siti@larkin.test",
        role: "bookkeeper",
        role_rank: 1,
        status: "active",
        created_at: "2026-02-11T00:00:00Z",
        removed_at: null,
      },
      {
        membership_id: MEMBERS_LIFECYCLE.viewerMembership,
        user_id: "44444444-4444-4444-8444-444444444445",
        display_name: MEMBERS_LIFECYCLE.viewerName,
        email: "wei@larkin.test",
        role: "viewer",
        role_rank: 0,
        status: "active",
        created_at: "2026-03-01T00:00:00Z",
        removed_at: null,
      },
    ],
    invites: [
      {
        id: MEMBERS_LIFECYCLE.pendingInvite,
        firm_id: MEMBERS_LIFECYCLE.firmId,
        email: MEMBERS_LIFECYCLE.pendingInviteEmail,
        role: "bookkeeper",
        status: "pending",
        invited_by: MEMBERS_LIFECYCLE.subject,
        created_at: "2026-08-25T00:00:00Z",
        expires_at: "2099-09-01T00:00:00Z",
        accepted_at: null,
        revoked_at: null,
      },
    ],
  };
}

let state = seed();

/** The invited person, as the auth endpoints describe them. Deliberately NOT this lane's roster
 *  persona: an invitee is by definition not a member of anything yet. */
function invitee() {
  return {
    id: MEMBERS_LIFECYCLE.inviteeSubject,
    aud: "authenticated",
    role: "authenticated",
    email: MEMBERS_LIFECYCLE.inviteeEmail,
    email_confirmed_at: "2026-09-16T00:00:00.000Z",
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T00:00:00.000Z",
    is_anonymous: false,
  };
}

/** The same unsigned three-part shape `serve-built.mjs` mints (`:279-291`): supabase-js reads the
 *  payload for `sub`/`exp`, and PostgREST is this harness, so nothing verifies a signature. */
function inviteeAccessToken() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: MEMBERS_LIFECYCLE.inviteeSubject,
    aud: "authenticated",
    role: "authenticated",
    email: MEMBERS_LIFECYCLE.inviteeEmail,
    exp: 4_102_444_800,
    iat: 1_788_112_800,
  })).toString("base64url");
  return `${header}.${payload}.${Buffer.from("e2e-signature").toString("base64url")}`;
}

/**
 * ONE HOOK, consulted by `serve-built.mjs` BEFORE its own three member branches.
 *
 * `email` is the signed-in address `serve-built.mjs` already tracks; it is this lane's whole
 * scope, and every handler returns `false` without it. The census in
 * `e2e-fixture-ownership.test.ts` reads those `return false`s as the guard they are.
 */
export async function handleMembersLifecycleSupabase(request, response, path, url, sendJson, cors, email) {
  const ours = email === MEMBERS_LIFECYCLE.email;

  // THE EXACT-VERB ALLOW-LIST, AND IT RUNS FIRST — `plans-mock.mjs:286`'s shape, and
  // `L7_RPC_VERBS`'s before it. A POST to an RPC path this lane does not DECLARE falls through
  // with its body stream never opened, so whichever hook runs next in `serve-built.mjs`'s chain
  // still sees it whole, in any order. It is also what makes the exported Set load-bearing: a
  // verb answered below but not declared above cannot be reached at all.
  if (request.method === "POST" && path.startsWith("/rest/v1/rpc/")) {
    if (!matchVerb(MEMBERS_LIFECYCLE_RPC_VERBS, path.slice("/rest/v1/rpc/".length))) return false;
  }

  // ---- the acceptance leg: verifyOtp, then the preview door --------------------------------
  //
  // THIS TAKES NOTHING FROM THE CORE. `serve-built.mjs`'s own `/auth/v1/verify` branch answers
  // `type: "signup"` and 400s everything else, so the `type: "invite"` shape `/invite/:token`
  // sends had no answer in this harness at all — which is why no browser leg had ever driven
  // that page past verification, and why the ONE caller migration 0209 exists for was proven
  // only in jsdom. The scope here is not a persona but a TOKEN: this lane's own
  // `supabaseToken`, and nothing else.
  if (request.method === "POST" && path === "/auth/v1/verify") {
    const body = await readCachedJson(request);
    if (body?.type !== "invite" || body?.token_hash !== MEMBERS_LIFECYCLE.supabaseToken) return false;
    sendJson(response, 200, {
      access_token: inviteeAccessToken(),
      token_type: "bearer",
      expires_in: 7_200,
      expires_at: 4_102_444_800,
      refresh_token: "e2e-members-lifecycle-refresh",
      user: invitee(),
    }, cors);
    return true;
  }

  // `clara.preview_invite` (0209), scoped by the CLARA token the `ct` parameter carries — the
  // one this lane minted, never a persona: at this point in the journey the invitee is signed in
  // as nobody this harness tracks. TWO tokens, because the step has two browser-observable
  // outcomes: `pending` lets the password form render BELOW the preview block, and a definite
  // negative must render neither.
  if (request.method === "POST" && path === "/rest/v1/rpc/preview_invite") {
    const body = await readCachedJson(request);
    const status =
      body?.p_token === MEMBERS_LIFECYCLE.previewPendingToken ? "pending"
      : body?.p_token === MEMBERS_LIFECYCLE.previewRevokedToken ? "revoked"
      : null;
    if (status === null) return false;
    // The door's own four keys, in 0209 §A's order, with the address MASKED the way §A masks it
    // (one leading character, three FIXED stars, the domain).
    sendJson(response, 200, {
      firm_name: MEMBERS_LIFECYCLE.firmName,
      role: "bookkeeper",
      status,
      masked_email: `${MEMBERS_LIFECYCLE.inviteeEmail[0]}***@${MEMBERS_LIFECYCLE.inviteeEmail.split("@")[1]}`,
    }, cors);
    return true;
  }

  // THE LANE'S OWN CONTROL, scoped by a persona named in the BODY — `journal-work-mock.mjs:645`'s
  // shape (`if (body?.client !== …) return false;`). A control endpoint that mutated shared
  // fixture state for ANY body would be a lane claiming a shared endpoint, which is exactly what
  // the ownership census exists to prevent.
  if (request.method === "POST" && path === "/rest/v1/rpc/e2e_members_lifecycle_reset") {
    const body = await readCachedJson(request);
    if (body?.persona !== MEMBERS_LIFECYCLE.email) return false;
    state = seed();
    sendJson(response, 200, { ok: true }, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/caller_context") {
    if (!ours) return false;
    sendJson(response, 200, [{
      user_id: MEMBERS_LIFECYCLE.subject,
      firm_id: MEMBERS_LIFECYCLE.firmId,
      firm_name: MEMBERS_LIFECYCLE.firmName,
      role: state.callerRole,
      role_rank: state.callerRoleRank,
      is_operator: false,
    }], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/firm_members_visible") {
    if (!ours) return false;
    sendJson(response, 200, state.members, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/firm_invites_visible") {
    if (!ours) return false;
    sendJson(response, 200, state.invites, cors);
    return true;
  }

  // ---- the three governed writes this walk drives to settlement -------------------------------
  // Each MUTATES this lane's own fixtures and answers the door's real receipt shape. The walk's
  // assertions are made on the RE-READ that follows, never on the receipt — which is the
  // hydrate-never-trust contract the panel itself is built on.

  if (request.method === "POST" && path === "/rest/v1/rpc/set_member_role") {
    if (!ours) return false;
    const body = await readCachedJson(request);
    const row = state.members.find((m) => m.membership_id === body?.p_membership);
    if (!row) {
      sendJson(response, 404, { code: "CLR11", message: "membership not in your firm" }, cors);
      return true;
    }
    row.role = String(body?.p_role ?? row.role);
    row.role_rank = { viewer: 0, bookkeeper: 1, admin: 2, owner: 3 }[row.role] ?? null;
    sendJson(response, 200, { membership_id: row.membership_id, role: row.role }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/remove_member") {
    if (!ours) return false;
    const body = await readCachedJson(request);
    const row = state.members.find((m) => m.membership_id === body?.p_membership);
    if (!row) {
      sendJson(response, 404, { code: "CLR11", message: "membership not in your firm" }, cors);
      return true;
    }
    // THE LAST-OWNER BACKSTOP, modelled because the walk must not be able to walk into a state
    // the real trigger (`clara._tf_guard_last_owner`, `0003:415`) forbids. Its message is the
    // DB's own, verbatim.
    if (row.role === "owner" && state.members.filter((m) => m.role === "owner" && m.status === "active").length === 1) {
      sendJson(response, 400, { code: "CLR09", message: "cannot demote/remove the last active owner" }, cors);
      return true;
    }
    row.status = "removed";
    row.removed_at = "2026-09-16T00:00:00Z";
    sendJson(response, 200, { membership_id: row.membership_id, status: "removed" }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/revoke_invite") {
    if (!ours) return false;
    const body = await readCachedJson(request);
    const row = state.invites.find((i) => i.id === body?.p_invite);
    if (!row) {
      sendJson(response, 404, { code: "CLR11", message: "invite not in your firm" }, cors);
      return true;
    }
    if (row.status !== "pending") {
      sendJson(response, 400, { code: "CLR09", message: `this invite is no longer open (status: ${row.status})` }, cors);
      return true;
    }
    row.status = "revoked";
    row.revoked_at = "2026-09-16T00:00:00Z";
    sendJson(response, 200, { invite_id: row.id, status: "revoked" }, cors);
    return true;
  }

  return false;
}
