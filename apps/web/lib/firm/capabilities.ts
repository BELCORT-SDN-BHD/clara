// THE ONE CAPABILITY DERIVATION for firm-altitude controls (裁-190, under the
// owner's UIUX steer on E-7 / CB-AE2E-014 / CB-AE2E-033).
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

import { isOperatorConsoleEligible } from "../registration/doors";
import { roleRank, type MemberRole } from "../members/reads";
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
};

/**
 * THE MIRROR TABLE — one row per capability/door pair, each naming the LIVE
 * body's migration file and the exact line whose
 * `clara._human_ctx(clara.role_rank('<role>'))` this predicate mirrors.
 *
 * `lib/firm/capabilities.test.ts` PARSES those migration lines and requires each
 * to declare the role written here (review law 3: a floor retyped from memory is
 * a projection of the DB's rule, not the rule). It also proves each cited
 * migration is the LAST one in `packages/db/migrations` that creates that door,
 * so a citation cannot rot behind a later `CREATE OR REPLACE`.
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
    // THE LIVE BODY IS 0144, NOT 0028 — caught by this module's own parity cell
    // on its first run, and worth recording because a sibling module still says
    // otherwise. `lib/firm-admin/vendor-bindings.ts`'s header censused these
    // five doors on 2026-08-28 against the then-frontier 0140 and concluded
    // 0028 was "LIVE-UNTOUCHED"; `0144_db_hardening_a_barrier_signer_wall.sql`
    // and `0154_binding_proposal_pr_1.sql` both landed after that census. The
    // web posts TWO arguments (`p_binding`, `p_op_key`), so PostgREST resolves
    // the two-argument overload, whose live body is 0144:333. 0154:2727 is a
    // THIRD-argument overload (`p_attestation`) this surface never calls — and
    // it floors at admin too, which the parity cell proves rather than assumes.
    capability: "canSignVendorBinding",
    door: "sign_vendor_identity_binding",
    role: "admin",
    migration: "0144_db_hardening_a_barrier_signer_wall.sql",
    line: 344,
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
