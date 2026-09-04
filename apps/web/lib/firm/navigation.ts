import type { CallerContextRow } from "./caller-context";
import { firmCapabilities } from "./capabilities";
import { roleRank, type MemberRole } from "../members/reads";
import { isOperatorConsoleEligible } from "../registration/doors";

/**
 * The sidebar and admin hub share one affordance registry. Each floor is the
 * lowest rank admitted by the destination's primary read, not the floor of a
 * write that happens to live on the same page. Writes stay visible at that read
 * floor and meet their own governed door when submitted.
 *
 * - home: viewer baseline; the destination has no read of its own, and the
 *   shell's `caller_context` scope has no rank floor (`0141:542-551`).
 * - Needs-you: viewer (`list_review_queue`, `0016:4563`).
 * - clients: viewer (`p_clients_human`, `0003:514`, and
 *   `p_client_facts_human`, `0055:465`; both are firm-scoped with no rank).
 * - activity: bookkeeper (`agent_receipts_visible`, `0103:410`).
 * - Admin parent: viewer because it performs no read and exposes only children
 *   that are independently filtered; its lowest child reads are viewer-floor
 *   (`0016:4563` and `0002:503-504`).
 * - members: admin for the complete roster/invite surface (email mask
 *   `0141:517`, roster floor `0141:526`, invite floor `0141:538`, and live
 *   `invite_member` admin door `0147:376`).
 * - registrations: owner plus operator firm (`approve_firm_registration`,
 *   `0145:770,782`), reusing `isOperatorConsoleEligible`.
 * - compliance: viewer (`list_review_queue`, `0016:4563`).
 * - vendor bindings: bookkeeper (`list_vendor_bindings`, `0028:960`, and
 *   `get_vendor_binding`, `0028:1016`).
 * - settings: viewer (`p_firms_human`, `0002:503-504`, no rank). Its
 *   `set_firm_high_stakes_threshold` write remains owner-floor (`0022:357`).
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
  readonly messageKey: "home" | "needsYou" | "clients" | "activity" | "admin" | "firm";
};

export type AdminNavigationEntry = NavigationEntry & {
  readonly id: "members" | "registrations" | "compliance" | "vendorBindings" | "settings";
  readonly navMessageKey:
    | "adminSections.members"
    | "adminSections.registrations"
    | "adminSections.compliance"
    | "adminSections.vendorBindings"
    | "adminSections.settings";
  readonly hubTitleKey:
    | "sections.members.title"
    | "sections.registrations.title"
    | "sections.compliance.title"
    | "sections.vendorBindings.title"
    | "sections.settings.title";
  readonly hubPurposeKey:
    | "sections.members.purpose"
    | "sections.registrations.purpose"
    | "sections.compliance.purpose"
    | "sections.vendorBindings.purpose"
    | "sections.settings.purpose";
};

export const FIRM_NAVIGATION: readonly FirmNavigationEntry[] = [
  { id: "home", href: "/", messageKey: "home", minimumRole: "viewer" },
  { id: "needsYou", href: "/needs-you", messageKey: "needsYou", minimumRole: "viewer" },
  { id: "clients", href: "/clients", messageKey: "clients", minimumRole: "viewer" },
  { id: "activity", href: "/activity", messageKey: "activity", minimumRole: "bookkeeper" },
  { id: "admin", href: "/admin", messageKey: "admin", minimumRole: "viewer" },
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
    minimumRole: "viewer",
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
  {
    id: "settings",
    href: "/admin/settings",
    minimumRole: "viewer",
    navMessageKey: "adminSections.settings",
    hubTitleKey: "sections.settings.title",
    hubPurposeKey: "sections.settings.purpose",
  },
] as const;

/** Fail closed on a NULL/unknown rank, matching the DB's `coalesce(rank, -1)`. */
export function hasNavigationAccess(
  scope: NavigationScope,
  entry: NavigationEntry,
): boolean {
  const minimumRank = roleRank(entry.minimumRole)!;
  if ((scope.role_rank ?? -1) < minimumRank) return false;
  if (entry.operatorOnly) return isOperatorConsoleEligible(scope);
  return true;
}

/**
 * "ADMIN" IS THE WRONG WORD BELOW ADMIN RANK, so below admin rank it is not the
 * word (E-7 / CB-AE2E-014, 裁-190). The section's READ floor stays `viewer` and
 * is not touched: a viewer legitimately reaches the compliance register and the
 * firm settings under it, and a bookkeeper the vendor bindings too, so hiding
 * the entry would remove destinations that ARE theirs. Only the LABEL was
 * lying — a bookkeeper reads "Admin", finds nothing administrative, and
 * reasonably concludes the product is offering them something they cannot use.
 *
 * The rename rides `messageKey` rather than a branch in the sidebar, so
 * `components/firm-nav.tsx` (another lane's file) needs no change at all: it
 * already renders `t(item.messageKey)`. `Admin` at admin+ is byte-identical to
 * what shipped, which is also why the existing owner walk in
 * `e2e/firm-navigation-walk.spec.ts` is untouched.
 *
 * The threshold is `canManageMembers` rather than a fresh rank literal: "Admin"
 * is honest exactly when the caller can actually administer the firm's people,
 * and that predicate already carries its mirrored DB floor and its citation.
 */
export function visibleFirmNavigation(scope: NavigationScope): readonly FirmNavigationEntry[] {
  const administers = firmCapabilities(scope).canManageMembers;
  return FIRM_NAVIGATION.filter((entry) => hasNavigationAccess(scope, entry)).map((entry) =>
    entry.id === "admin" && !administers ? { ...entry, messageKey: "firm" as const } : entry,
  );
}

export function visibleAdminNavigation(scope: NavigationScope): readonly AdminNavigationEntry[] {
  return ADMIN_NAVIGATION.filter((entry) => hasNavigationAccess(scope, entry));
}
