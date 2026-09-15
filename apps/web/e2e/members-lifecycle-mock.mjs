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

import { readCachedJson } from "./mock-dispatch.mjs";

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
};

/** The RPC verbs this lane owns. Exported so `e2e-fixture-ownership.test.ts` can census them
 *  against every sibling's, the way `L7_RPC_VERBS` is. */
export const MEMBERS_LIFECYCLE_RPC_VERBS = new Set([
  "set_member_role",
  "remove_member",
  "revoke_invite",
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

/**
 * ONE HOOK, consulted by `serve-built.mjs` BEFORE its own three member branches.
 *
 * `email` is the signed-in address `serve-built.mjs` already tracks; it is this lane's whole
 * scope, and every handler returns `false` without it. The census in
 * `e2e-fixture-ownership.test.ts` reads those `return false`s as the guard they are.
 */
export async function handleMembersLifecycleSupabase(request, response, path, url, sendJson, cors, email) {
  const ours = email === MEMBERS_LIFECYCLE.email;

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
