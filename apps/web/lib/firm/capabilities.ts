// THE ONE CAPABILITY DERIVATION for firm-altitude controls — **裁-187, minuted
// as ADR-0078 decision 2**, applied to E-7 / CB-AE2E-014 / CB-AE2E-033 under the
// owner's UIUX steer. (Cited as 裁-190 in this lane's first cut, which is the
// LANE-MODEL ruling — "native lanes only" — and has nothing to say about what a
// screen renders. Corrected in review-550, everywhere.)
//
// WHAT CHANGED, AND WHY IT IS A RULING RATHER THAN A BUG FIX. Until this module
// the build deliberately rendered EVERY governed control to EVERY rank and let
// the DB refuse — `lib/firm/navigation.ts`'s doctrine paragraph, plus
// `components/admin/member-row-menu.tsx`'s and `components/firm-admin/
// threshold-dialog.tsx`'s own headers, all argued the same trade: "teach the
// ceiling" and "never strand a real admin behind a failed courtesy read". The
// owner reported the consequence (a bookkeeper offered Change-threshold and the
// role/remove menu, both of which can only ever refuse) and the orchestrator
// ruled the other way: **a control the caller's rank cannot use is NOT RENDERED
// — not rendered disabled-with-reason, not rendered at all.**
//
// THIS IS AN AFFORDANCE, NEVER A WALL. Every floor below is a MIRROR of a
// governed door's own `clara._human_ctx(clara.role_rank(...))` call, cited to the
// LIVE body's migration and line in FIRM_CAPABILITY_FLOORS. The DB stays the
// wall: a caller who reaches a door another way still meets CLR04, and that
// refusal still renders verbatim. Hiding a control grants nothing and revokes
// nothing.
//
// IT FAILS CLOSED, AND THAT IS THE DIRECTION THE RULING FLIPPED. The prior
// invite gate (`components/admin/members-panel.tsx`, its own header) failed
// OPEN: only a positively-read rank below admin disabled the trigger, so a
// failed read, zero rows, more than one row and a NULL `role_rank` all left the
// control ENABLED. Under the new ruling that would render a control to a caller
// whose rank is UNKNOWN, which is precisely the case the owner objected to. So
// every capability here is false unless a rank was positively read and is
// positively at or above the floor — the same `coalesce(rank, -1)` reading
// `hasNavigationAccess` already applies to navigation, and the same reading the
// SQL itself applies. Review law 2: absence is not evidence, and a derived state
// is not evidence.
//
// THE COST OF FAILING CLOSED, NAMED. A real admin whose `caller_context` read
// fails now sees no member controls. That is a visible, recoverable state (the
// panel's own error banner renders the read failure) rather than a control that
// looks live and answers CLR04 — and it is the direction the ruling asks for.
//
// THESE FLOORS MIRROR THE LIVE DATABASE, WHICH IS NOT YET THE ADR-0078 MATRIX,
// and the divergence is deliberate rather than an oversight. **裁-187's RBAC
// sub-ruling reserves MEMBERS to the OWNER** ("owner only: members, legal
// signatures and the operator-tier acts"), while every members door in the
// database today floors at ADMIN — `set_member_role` (`0157:252`),
// `remove_member` (`0157:350`), `invite_member` (`0147:376`),
// `revoke_invite` (`0157:424`). Mirroring the ADR instead of the live floors
// would hide a control from an admin the database still admits, which is the
// same defect this module exists to fix, pointed the other way: a person told
// "no" by a screen that the door would have said "yes" to. **裁-188's
// wall-removal lane moves those floors**; this table moves in the SAME change,
// and the parity cell is what makes that a red test rather than a memo.

import { isOperatorConsoleEligible } from "../registration/doors";
import { ROLE_LADDER, roleRank, type MemberRole } from "../members/reads";
import type { CallerContextRow } from "./caller-context";

/** The only input this module accepts: a rank and the operator flag, or `null`
 *  for "no rank was positively read". `NavigationScope` (the firm layout's
 *  positively-read scope, handed down by `components/firm-scope-provider.tsx`)
 *  satisfies it structurally, so a consumer holding the provider's scope passes
 *  it unchanged. */
export type CapabilityScope = Pick<CallerContextRow, "role_rank" | "is_operator">;

export type FirmCapabilities = {
  /** Change a member's role, or remove a member. */
  readonly canManageMembers: boolean;
  /** Issue an invitation. */
  readonly canInviteMember: boolean;
  /** Revoke a pending invitation. */
  readonly canRevokeInvite: boolean;
  /** Approve or reject a firm registration request (owner AND operator firm). */
  readonly canDecideFirmRegistrations: boolean;
  /** Propose a vendor identity binding. */
  readonly canProposeVendorBinding: boolean;
  /** Revoke a live vendor identity binding. */
  readonly canRevokeVendorBinding: boolean;
  /** Sign a proposed vendor identity binding. */
  readonly canSignVendorBinding: boolean;
  /** Record an account's SST turnover classification on the client Tax tab.
   *
   *  THE READ IS NOT GATED, ONLY THE CONTROL (review-557, N7). A viewer may see this client's
   *  SST turnover watch — it arrives on `clara.list_review_queue`, which floors at viewer, and
   *  hiding a figure the database willingly returns would be this build inventing a wall. What
   *  a viewer must not be OFFERED is the write, because `set_turnover_classification` floors at
   *  bookkeeper and can only ever answer them CLR04. The door's ADDITIONAL admin+ check on a
   *  watch-LOWERING move is deliberately NOT mirrored: that predicate reads the classification
   *  in force at the effective date, which no human read exposes, so the DB decides it and its
   *  refusal renders verbatim. */
  readonly canClassifyTurnover: boolean;
};

/**
 * THE MIRROR TABLE — one row per capability/door pair, each naming the LIVE
 * body's migration file and the exact line whose
 * `clara._human_ctx(clara.role_rank('<role>'))` this predicate mirrors.
 *
 * `lib/firm/capabilities.test.ts` PARSES those migration lines and requires each
 * to declare the role written here (review law 3: a floor retyped from memory is
 * a projection of the DB's rule, not the rule). It also proves the cited body is
 * the LIVE one — the last surviving define across every define AND drop in
 * migration order, via `test/sqlFunctionCensus.ts`'s `semanticFunctionOperations`
 * (the shared instrument `lib/command/do-action-floors.test.ts` and
 * `lib/members/members-doors.test.ts` already use). A "last CREATE" check is not
 * enough here and this file is the proof: `sign_vendor_identity_binding`'s
 * two-argument body was DROPPED outright at `0154:2725`, so the last CREATE of
 * that overload is a body no caller can reach.
 */
export const FIRM_CAPABILITY_FLOORS = [
  {
    capability: "canManageMembers",
    door: "set_member_role",
    role: "admin",
    migration: "0157_member_door_rank_walls.sql",
    line: 252,
  },
  {
    capability: "canManageMembers",
    door: "remove_member",
    role: "admin",
    migration: "0157_member_door_rank_walls.sql",
    line: 350,
  },
  {
    capability: "canInviteMember",
    door: "invite_member",
    role: "admin",
    migration: "0147_db_hardening_b_hash_only_bearer_tokens.sql",
    line: 376,
  },
  {
    capability: "canRevokeInvite",
    door: "revoke_invite",
    role: "admin",
    migration: "0157_member_door_rank_walls.sql",
    line: 424,
  },
  {
    capability: "canDecideFirmRegistrations",
    door: "approve_firm_registration",
    role: "owner",
    migration: "0145_p4_tranche2_registration_operator_alias.sql",
    line: 770,
  },
  {
    capability: "canDecideFirmRegistrations",
    door: "reject_firm_registration",
    role: "owner",
    migration: "0145_p4_tranche2_registration_operator_alias.sql",
    line: 836,
  },
  {
    capability: "canProposeVendorBinding",
    door: "propose_vendor_identity_binding",
    role: "bookkeeper",
    migration: "0154_binding_proposal_pr_1.sql",
    line: 2506,
  },
  {
    capability: "canRevokeVendorBinding",
    door: "revoke_vendor_identity_binding",
    role: "bookkeeper",
    migration: "0028_vendor_identity_binding.sql",
    line: 903,
  },
  {
    // THE LIVE BODY IS 0154, AND THE TWO-ARGUMENT ONE NO LONGER EXISTS. This
    // citation has now been wrong twice, in two different ways, which is the
    // whole argument for the census the test uses:
    //   · 0028 was the first cut. `lib/firm-admin/vendor-bindings.ts`'s header
    //     censused these five doors on 2026-08-28 against the then-frontier 0140
    //     and called 0028 "LIVE-UNTOUCHED" — 0144 and 0154 both landed after it.
    //   · 0144:333 replaced the TWO-argument body, and this row cited it. Also
    //     dead: `0154_binding_proposal_pr_1.sql:2725` is a hard
    //     `drop function clara.sign_vendor_identity_binding(uuid,text)`, and
    //     0154:2727 creates a THREE-argument body with
    //     `p_attestation text default null` in its place (a signature change
    //     cannot ride CREATE OR REPLACE, so the old overload had to go or stay
    //     shadow-reachable — 0154's own note says exactly that).
    // The web still posts TWO arguments; PostgREST resolves them against the
    // three-argument body through its default. So the live floor is 0154:2742.
    // A "last file that mentions the name" census would have picked this up;
    // a "last file that CREATES it" census would too — but only a census that
    // also honours DROPs can tell a live overload from a dead one, which is why
    // capabilities.test.ts now walks `semanticFunctionOperations`.
    capability: "canSignVendorBinding",
    door: "sign_vendor_identity_binding",
    role: "admin",
    migration: "0154_binding_proposal_pr_1.sql",
    line: 2742,
  },
  {
    // The client Tax tab's ONE governed write (review-557, N7). Created at `0016:905` and never
    // replaced or dropped — the census below proves that rather than this comment asserting it.
    // Its rank check is the plain `_human_ctx(role_rank('bookkeeper'))` on line 916; the
    // watch-lowering admin+ branch further down the body is a per-CALL condition on data no
    // human read exposes, so it stays the DB's to decide and is not a floor to mirror.
    capability: "canClassifyTurnover",
    door: "set_turnover_classification",
    role: "bookkeeper",
    migration: "0016_a21_compliance_watch.sql",
    line: 916,
  },
] as const satisfies readonly {
  capability: keyof FirmCapabilities;
  door: string;
  role: MemberRole;
  migration: string;
  line: number;
}[];

/**
 * THE OPERATOR CONJUNCT, cited separately because it is not a rank at all.
 * `approve_firm_registration`/`reject_firm_registration` each raise CLR04 a
 * second time unless the CALLER'S OWN firm carries `is_operator`. The predicate
 * itself is not re-derived here — `isOperatorConsoleEligible`
 * (`lib/registration/doors.ts`) is the one shared copy `lib/firm/navigation.ts`
 * already uses, and this module composes it rather than growing a third.
 */
export const FIRM_CAPABILITY_CONJUNCTS = [
  {
    capability: "canDecideFirmRegistrations",
    door: "approve_firm_registration",
    migration: "0145_p4_tranche2_registration_operator_alias.sql",
    line: 782,
  },
  {
    capability: "canDecideFirmRegistrations",
    door: "reject_firm_registration",
    migration: "0145_p4_tranche2_registration_operator_alias.sql",
    line: 839,
  },
] as const;

/** Every capability false — the ONE denied value, so a fail-closed branch cannot
 *  accidentally leave one field true. */
const NOTHING: FirmCapabilities = {
  canManageMembers: false,
  canInviteMember: false,
  canRevokeInvite: false,
  canDecideFirmRegistrations: false,
  canProposeVendorBinding: false,
  canRevokeVendorBinding: false,
  canSignVendorBinding: false,
  canClassifyTurnover: false,
};

/** `>= floor`, fail-closed on a NULL/unknown rank — the SQL's own
 *  `coalesce(clara.actor_role_rank(), -1)` reading, and the same one
 *  `hasNavigationAccess` applies. */
function atLeast(rank: number | null, role: MemberRole): boolean {
  return (rank ?? -1) >= roleRank(role)!;
}

/**
 * The capability object. `null` — no scope read, a failed read, or a read this
 * caller could not resolve to exactly one row — denies everything.
 */
export function firmCapabilities(scope: CapabilityScope | null): FirmCapabilities {
  if (scope === null) return NOTHING;
  const rank = scope.role_rank;
  if (typeof rank !== "number") return NOTHING;
  return {
    canManageMembers: atLeast(rank, "admin"),
    canInviteMember: atLeast(rank, "admin"),
    canRevokeInvite: atLeast(rank, "admin"),
    canDecideFirmRegistrations:
      atLeast(rank, "owner") && isOperatorConsoleEligible({ role_rank: rank, is_operator: scope.is_operator }),
    canProposeVendorBinding: atLeast(rank, "bookkeeper"),
    canRevokeVendorBinding: atLeast(rank, "bookkeeper"),
    canSignVendorBinding: atLeast(rank, "admin"),
    canClassifyTurnover: atLeast(rank, "bookkeeper"),
  };
}

/**
 * The cardinality fold for a RAW `clara.caller_context` read, so a panel that
 * reads the view itself (rather than taking the layout's provider scope) applies
 * the same three-way judgement `lib/require-firm-scope.ts`'s `resolveFirmScope`
 * does: zero rows, more than one row, and a not-yet-loaded read are all `null`.
 *
 * `uq_membership_active_user` (`0002:221-222`) makes "at most one" a DB
 * guarantee, so a second row is a structural surprise — and a surprise denies
 * rather than picking the first row.
 */
export function capabilityScopeFromRows(rows: readonly CallerContextRow[] | null): CapabilityScope | null {
  if (rows === null || rows.length !== 1) return null;
  return rows[0] ?? null;
}

/** Convenience for the common shape: read rows -> scope -> capabilities. */
export function firmCapabilitiesFromRows(rows: readonly CallerContextRow[] | null): FirmCapabilities {
  return firmCapabilities(capabilityScopeFromRows(rows));
}

// ---------------------------------------------------------------------------
// THE TWO RANK-ONLY WALLS INSIDE `set_member_role`/`remove_member`
//
// The floors above decide whether a caller may reach the members doors AT ALL.
// These two decide, for a caller who may, WHICH rows and WHICH roles the doors
// will accept — and both refuse on RANK ALONE, with no reference to who the
// actor is, so both are honestly derivable from the caller context this page
// already read. That is what puts them inside 裁-187's ruling rather than
// behind the person-wall exception:
//
//   · THE ASSIGNED-ROLE CEILING — `0157_member_door_rank_walls.sql:277-279`:
//     `if clara.role_rank(p_role) > clara.role_rank(v_actor_role) then raise …
//     'cannot assign a role above your own rank' (CLR04)`. So an admin offered
//     the "Owner" item is offered a control that can only refuse.
//   · THE SUPERIOR WALL — `0157:320-321`: `if clara.role_rank(m.role) >
//     clara.role_rank(v_actor_role) then raise … 'cannot act on a member ranked
//     above you' (CLR04, reason `cannot_act_on_superior`)`. `>` not `>=`, so
//     admin-on-admin and owner-on-owner stay allowed — the derivation below
//     mirrors that comparison exactly rather than tightening it.
//
// WHAT IS STILL NOT PRE-EMPTED, and must not be: the LAST-OWNER trigger
// (`clara._tf_guard_last_owner`, `0003:415`) refuses CLR09 on a COUNT of the
// firm's active non-agent owners. No client-side read has that count, so the
// click happens and the DB's own message renders verbatim.
//
// **A THIRD RANK-ONLY CEILING IS DELIBERATELY LEFT UNSHAPED, and it is named
// here rather than left for the next reviewer to find.** `invite_member` carries
// the same shape at `0147_db_hardening_b_hash_only_bearer_tokens.sql:386` —
// 'cannot invite to a role above your own rank' (CLR04) — so by the reasoning
// above the InviteDialog's role select could be truncated too. It is not, for
// one reason: that control already TEACHES the ceiling in words
// (`Members.inviteDialog.ceilingNote`, "You can invite someone at your own rank
// or below. The firm refuses anything higher."), which is the affordance the
// row menu lacked and the reason the row menu was the defect. Making the two
// uniform is a product call, not a mechanical one, and it is the owner's:
// either the select is filtered and the note retires with it, or the note stays
// and the row menu arguably should have kept its full ladder. This lane changed
// the one the owner actually reported.
// ---------------------------------------------------------------------------

/** The roles this caller may ASSIGN — the ladder truncated at their own rank,
 *  mirroring 0157:277-279. Empty on an unreadable rank (fail closed). */
export function assignableRoles(scope: CapabilityScope | null): readonly MemberRole[] {
  const rank = scope?.role_rank;
  if (typeof rank !== "number") return [];
  return ROLE_LADDER.filter((role) => roleRank(role)! <= rank);
}

/** May this caller act on a member currently holding `memberRole`? Mirrors
 *  0157:320-321's `>` comparison. Fails closed on an unreadable caller rank AND
 *  on a member role outside the ladder — an unrankable row is one the UI cannot
 *  reason about, so it offers nothing. */
export function canActOnMemberOfRole(scope: CapabilityScope | null, memberRole: string): boolean {
  const callerRank = scope?.role_rank;
  if (typeof callerRank !== "number") return false;
  const targetRank = roleRank(memberRole);
  if (targetRank === null) return false;
  return targetRank <= callerRank;
}
