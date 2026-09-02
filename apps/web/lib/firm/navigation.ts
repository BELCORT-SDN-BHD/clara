import type { CallerContextRow } from "./caller-context";
import { roleRank, type MemberRole } from "../members/reads";
import { isOperatorConsoleEligible } from "../registration/doors";

/**
 * The sidebar and the admin hub share one affordance registry. These floors are
 * copied from the LIVE reads/doors each destination exposes, never inferred from
 * its URL:
 *
 * - firm home + Needs-you: viewer (`list_review_queue` enters `_human_ctx` at
 *   viewer; the home has no read of its own)
 * - client register + activity: bookkeeper (`p_clients_human` and
 *   `agent_receipts_visible`)
 * - members: admin (the invite/role/remove doors)
 * - compliance + vendor bindings: bookkeeper (their read/act doors)
 * - registrations: owner AND the caller's firm is the operator (the identical
 *   predicate exported by `registration/doors.ts`)
 *
 * This is legibility, not authority. A hidden entry grants or revokes nothing;
 * the destination's RLS policy or governed door remains the wall.
 */

export type NavigationScope = Pick<CallerContextRow, "role_rank" | "is_operator">;

type NavigationEntry = {
  readonly href: string;
  readonly minimumRole: MemberRole;
  readonly operatorOnly?: true;
};

export type FirmNavigationEntry = NavigationEntry & {
  readonly id: "home" | "needsYou" | "clients" | "activity" | "admin";
  readonly messageKey: "home" | "needsYou" | "clients" | "activity" | "admin";
};

export type AdminNavigationEntry = NavigationEntry & {
  readonly id: "members" | "registrations" | "compliance" | "vendorBindings";
  readonly navMessageKey:
    | "adminSections.members"
    | "adminSections.registrations"
    | "adminSections.compliance"
    | "adminSections.vendorBindings";
  readonly hubTitleKey:
    | "sections.members.title"
    | "sections.registrations.title"
    | "sections.compliance.title"
    | "sections.vendorBindings.title";
  readonly hubPurposeKey:
    | "sections.members.purpose"
    | "sections.registrations.purpose"
    | "sections.compliance.purpose"
    | "sections.vendorBindings.purpose";
};

export const FIRM_NAVIGATION: readonly FirmNavigationEntry[] = [
  { id: "home", href: "/", messageKey: "home", minimumRole: "viewer" },
  { id: "needsYou", href: "/needs-you", messageKey: "needsYou", minimumRole: "viewer" },
  { id: "clients", href: "/clients", messageKey: "clients", minimumRole: "bookkeeper" },
  { id: "activity", href: "/activity", messageKey: "activity", minimumRole: "bookkeeper" },
  { id: "admin", href: "/admin", messageKey: "admin", minimumRole: "bookkeeper" },
] as const;

export const ADMIN_NAVIGATION: readonly AdminNavigationEntry[] = [
  {
    id: "members",
    href: "/admin/members",
    minimumRole: "admin",
    navMessageKey: "adminSections.members",
    hubTitleKey: "sections.members.title",
    hubPurposeKey: "sections.members.purpose",
  },
  {
    id: "registrations",
    href: "/admin/registrations",
    minimumRole: "owner",
    operatorOnly: true,
    navMessageKey: "adminSections.registrations",
    hubTitleKey: "sections.registrations.title",
    hubPurposeKey: "sections.registrations.purpose",
  },
  {
    id: "compliance",
    href: "/admin/compliance",
    minimumRole: "bookkeeper",
    navMessageKey: "adminSections.compliance",
    hubTitleKey: "sections.compliance.title",
    hubPurposeKey: "sections.compliance.purpose",
  },
  {
    id: "vendorBindings",
    href: "/admin/vendor-bindings",
    minimumRole: "bookkeeper",
    navMessageKey: "adminSections.vendorBindings",
    hubTitleKey: "sections.vendorBindings.title",
    hubPurposeKey: "sections.vendorBindings.purpose",
  },
] as const;

/** Fail closed on a NULL/unknown rank, matching the DB's `coalesce(rank, -1)`. */
export function hasNavigationAccess(
  scope: NavigationScope,
  entry: NavigationEntry,
): boolean {
  const minimumRank = roleRank(entry.minimumRole);
  if (minimumRank === null || (scope.role_rank ?? -1) < minimumRank) return false;
  if (entry.operatorOnly) return isOperatorConsoleEligible(scope);
  return true;
}

export function visibleFirmNavigation(scope: NavigationScope): readonly FirmNavigationEntry[] {
  return FIRM_NAVIGATION.filter((entry) => hasNavigationAccess(scope, entry));
}

export function visibleAdminNavigation(scope: NavigationScope): readonly AdminNavigationEntry[] {
  return ADMIN_NAVIGATION.filter((entry) => hasNavigationAccess(scope, entry));
}
