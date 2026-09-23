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
// WHAT THE INVITE LEG CAN AND CANNOT PROVE HERE (#1022 widened this from wave 1's own note).
//
// `POST /api/invite` is a REAL Next route. Before it calls `clara.invite_member` it checks
// whether this deployment can send mail at all (`lib/members/invite-mail.ts`'s
// `inviteMailCapability`) — every real deployment reads FOUR required variables, and until #1022
// `e2e/run.mjs` deliberately left them unset (the same reason it deliberately sets no
// `STRIPE_SECRET_KEY`: a key here would send a real outbound request to a third party from every
// test run), so the invite leg always stopped at `mail_not_configured`.
//
// #1022 changed what the harness can honestly produce, WITHOUT changing what leaves this
// machine. `run.mjs` now sets all four required variables to harness-only placeholders, PLUS TWO
// test-only overrides `invite-mail.ts` resolves ITSELF, fenced to loopback (ADV-1's own fence):
// `CLARA_E2E_INVITE_MAIL_ENDPOINT` (#874) redirects `send()`'s POST here instead of Resend, and
// `CLARA_E2E_INVITE_IDENTITY_ENDPOINT` (#1022) redirects `admin()`'s Supabase client — spent by
// BOTH `canMintFor`'s `listUsers` and `mintSupabaseTokenHash`'s `generateLink` — here instead of
// a real Supabase project. Both point at THIS SAME mock origin, under `/e2e-supabase`, so both
// land on the handlers below: `GET /auth/v1/admin/users` (an empty directory — nobody this
// harness invites is already a confirmed user) and `POST /auth/v1/admin/generate_link` (a fixed
// hashed token), scoped by `ours` exactly like every other handler in this file, plus
// `POST /e2e-invite-mail-capture`, which records the message `send()` posted instead of relaying
// it anywhere.
//
// So the invite leg now drives the real dialog, the real courier round trip, the REAL
// `clara.invite_member` verb this lane answers below, and a settled SUCCESS banner with a new
// PENDING ROW rendering — the journey AC2 asks for — with NO outbound call to a real Supabase
// project or a real mail provider at any point: both calls terminate on this same process. The
// invite door's own behaviour — the token's real shape, the CLR10 duplicate wall, the role
// ceiling — is still the DB battery's claim under real least-privileged roles
// (`packages/db/tests/p4t1-invite.test.mjs`); this lane's `invite_member` handler mints a
// REALISTIC receipt (the exact three keys `0147`'s own body returns, `invite_id`/`token_hash`/
// `expires_at`, plus the plaintext `token` merged in above persistence) for ONE happy path and
// the ONE duplicate-email refusal a single-session walk can reach, never the whole wall.

// =============================================================================================
// AND THE ACCEPTANCE LEG (round-1 F4): TWO SHAPES THIS HARNESS HAD NO ANSWER FOR AT ALL.
//
// `serve-built.mjs`'s `/auth/v1/verify` branch answers `type: "signup"` and 400s everything else,
// so the `type: "invite"` call `/invite/:token` makes had no answer anywhere — which is why no
// browser leg had ever driven that page past verification, and why the ONE caller migration 0224
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
  /** #1022 — THE NEW-INVITE LEG. A fresh address (never the seeded pending one above, so the
   *  duplicate-email refusal below is reachable independently), and the fixed identifiers the
   *  `invite_member` and `generate_link` handlers mint for it: a realistic but NOT random shape,
   *  so a walk can assert on the exact receipt rather than merely "something truthy". */
  newInviteEmail: "another-hire@larkin.test",
  newInvite: "5e5e5e5e-5555-4555-8555-555555555572",
  newInvitePlaintextToken: "e2e-members-lifecycle-new-invite-plaintext",
  newInviteHashedToken: "e2e-members-lifecycle-new-invite-hashed",
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
  // #1022 — the real invite door, so the invite leg can drive all the way to a pending row
  // instead of stopping at the courier's own `mail_not_configured` capability gate.
  "invite_member",
  "e2e_members_lifecycle_reset",
  "e2e_members_lifecycle_invite_trace",
]);

function seed() {
  return {
    /** The signed-in person's own rank. Mutable so a walk could drive a downgrade; today the
     *  unit cell `p625.web.downgrade` owns that claim, because flipping a rank mid-walk needs a
     *  second actor this harness has no second session for. */
    callerRole: "owner",
    callerRoleRank: 3,
    // #1022 — what the identity-provisioning and mail-transport seams RECEIVED this test run,
    // reset alongside every other fixture so one walk's evidence never leaks into the next.
    identityCalls: { listUsers: 0, generateLink: 0 },
    capturedMail: null,
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
  // that page past verification, and why the ONE caller migration 0224 exists for was proven
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

  // ---- #1022: the identity-provisioning admin calls, and the mail capture ------------------
  //
  // Both are reached only when `CLARA_E2E_INVITE_MAIL_ENDPOINT`/`CLARA_E2E_INVITE_IDENTITY_ENDPOINT`
  // are set (`run.mjs`) AND the signed-in caller driving the invite is `ours` — the identity-
  // provisioning calls are issued by `admin()`, built from the SERVICE-ROLE config, never from the
  // browser's own session, so `ours` here means "the last address this harness saw sign in",
  // which is this lane's own owner persona for the one walk that reaches this code at all
  // (`members-invite-walk.spec.ts`). Scoped anyway, on the same principle every other handler in
  // this file states: an unscoped admin-directory answer is a shared endpoint waiting to be
  // claimed by whichever lane trips it next.
  if (request.method === "GET" && path === "/auth/v1/admin/users") {
    if (!ours) return false;
    state.identityCalls.listUsers += 1;
    // An EMPTY directory — every page. Nobody this harness invites is already a confirmed
    // Supabase user, so `canMintFor` sees the empty first page and answers `{ok:true}` on this
    // one round trip; `CAN_MINT_MAX_PAGES`'s own ceiling is the DB battery's claim, not this
    // mock's (`invite-mail-transport.test.ts` already proves the ceiling in isolation).
    sendJson(response, 200, { users: [] }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/auth/v1/admin/generate_link") {
    if (!ours) return false;
    const body = await readCachedJson(request);
    state.identityCalls.generateLink += 1;
    if (body?.type !== "invite" || typeof body?.email !== "string") {
      sendJson(response, 400, { error_code: "validation_failed", msg: "type and email are required" }, cors);
      return true;
    }
    // `_generateLinkResponse` (installed `@supabase/auth-js`) reads `hashed_token` off the TOP
    // LEVEL of this body — verified against the shipped client, not assumed.
    sendJson(response, 200, {
      hashed_token: MEMBERS_LIFECYCLE.newInviteHashedToken,
      action_link: `${MEMBERS_LIFECYCLE.firmName}-invite-link`,
      verification_type: "invite",
      email: body.email,
    }, cors);
    return true;
  }

  // The mail-transport seam's own destination for THIS lane's walk (#874's mechanism, #1022's
  // wiring): `productionInviteMailer.send()` posts here instead of `RESEND_ENDPOINT` whenever
  // `CLARA_E2E_INVITE_MAIL_ENDPOINT` is set, so the exact body a real deployment would have sent
  // to Resend is observable — and captured, never relayed anywhere else.
  if (request.method === "POST" && path === "/e2e-invite-mail-capture") {
    const body = await readCachedJson(request);
    state.capturedMail = {
      to: Array.isArray(body?.to) ? body.to[0] : null,
      subject: typeof body?.subject === "string" ? body.subject : null,
      html: typeof body?.html === "string" ? body.html : null,
    };
    sendJson(response, 200, { id: "e2e-captured-mail" }, cors);
    return true;
  }

  // `clara.preview_invite` (0224), scoped by the CLARA token the `ct` parameter carries — the
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
    // The door's own four keys, in 0224 §A's order, with the address MASKED the way §A masks it
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

  // #1022 — THE READ HALF OF THE SAME CONTROL SHAPE: what the identity and mail seams actually
  // RECEIVED, so a walk can assert positive evidence that both intercepts fired (not merely that
  // the journey happened to look right) — the same "observe what would have been sent" claim
  // #874's own unit suite makes, here made available to a BROWSER walk instead of a node:test one.
  if (request.method === "POST" && path === "/rest/v1/rpc/e2e_members_lifecycle_invite_trace") {
    const body = await readCachedJson(request);
    if (body?.persona !== MEMBERS_LIFECYCLE.email) return false;
    sendJson(response, 200, { identityCalls: state.identityCalls, capturedMail: state.capturedMail }, cors);
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

  // ---- the four governed writes this walk drives to settlement --------------------------------
  // Each MUTATES this lane's own fixtures and answers the door's real receipt shape. The walk's
  // assertions are made on the RE-READ that follows, never on the receipt — which is the
  // hydrate-never-trust contract the panel itself is built on.

  // #1022 — `clara.invite_member`, re-derived from `0147`'s own body: the SAME three-key receipt
  // shape `_finish_op` persists (`invite_id`, `token_hash`, `expires_at`), with the PLAINTEXT
  // `token` merged in above persistence exactly as that migration's own tail comment describes.
  // Real-shaped, not the whole wall: this mock proves the ONE happy path and the ONE duplicate
  // refusal a single-session walk can reach; the role ceiling, the op_key replay contract and
  // every other branch are `packages/db/tests/p4t1-invite.test.mjs`'s claim, not this lane's.
  if (request.method === "POST" && path === "/rest/v1/rpc/invite_member") {
    if (!ours) return false;
    const body = await readCachedJson(request);
    const email = typeof body?.p_email === "string" ? body.p_email : "";
    const role = typeof body?.p_role === "string" ? body.p_role : "";
    if (state.invites.some((i) => i.email === email && i.status === "pending")) {
      sendJson(response, 400, { code: "CLR10", message: "an invite is already pending for this email" }, cors);
      return true;
    }
    const expiresAt = "2099-09-01T00:00:00Z";
    state.invites.push({
      id: MEMBERS_LIFECYCLE.newInvite,
      firm_id: MEMBERS_LIFECYCLE.firmId,
      email,
      role,
      status: "pending",
      invited_by: MEMBERS_LIFECYCLE.subject,
      created_at: "2026-09-23T00:00:00Z",
      expires_at: expiresAt,
      accepted_at: null,
      revoked_at: null,
    });
    sendJson(response, 200, {
      invite_id: MEMBERS_LIFECYCLE.newInvite,
      token_hash: "e2e-members-lifecycle-new-invite-token-hash",
      expires_at: expiresAt,
      token: MEMBERS_LIFECYCLE.newInvitePlaintextToken,
    }, cors);
    return true;
  }

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
