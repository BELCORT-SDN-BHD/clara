/**
 * THE ONE NAVIGATION REGISTRY (#614, refresh spec #612 §8 / #604 resolution /
 * docs/plan/active/refresh-2026-09-08-product-spec.md §6.1).
 *
 * Before this file the product's destinations were written down FOUR times: the
 * firm sidebar's own list (`lib/firm/navigation.ts`), the admin hub's card list
 * (the same file's second array), the client workspace's tab strip
 * (`components/client-workspace-nav.tsx`, a private `CLIENT_TABS` const) and the
 * ⌘K Go manifest (`lib/command/routes.ts`). Three of the four could disagree with
 * each other about what exists, and `lib/command/routes.ts`'s own header is the
 * post-mortem of the fourth doing exactly that — ten of fifteen rows wrong, one
 * pointing at a path no `page.tsx` has ever served.
 *
 * So: ONE registry. The sidebar renders it, the breadcrumb reads it, ⌘K derives
 * its Go rows from it, and the client switcher computes destinations with it. A
 * destination that is not here is not in the product's navigation at all.
 *
 * WHAT THIS FILE IS NOT. It is not the authority on WHO may open a destination —
 * `lib/firm/navigation.ts` keeps that job, with the per-floor citations to the
 * migrations that set them, and `hasNavigationAccess` is CALLED here rather than
 * re-implemented (裁-107a). Rank shaping remains legibility, not authority: a
 * hidden entry grants and revokes nothing, and the destination's RLS policy or
 * governed door is still the wall.
 *
 * NO JSX, NO REACT, NO next/navigation. This module is imported by a node test
 * runner cell and by `next.config.ts`'s sibling (`./legacy-routes.ts`), so it
 * stays pure data plus pure functions over strings. Icons are NAMES here; the
 * sidebar maps a name to a lucide component.
 */

import { hasNavigationAccess, type NavigationScope } from "@/lib/firm/navigation";
import type { MemberRole } from "@/lib/members/reads";

export type { NavigationScope };

/**
 * The lucide icon names the shell renders. A closed union, not `string`: the
 * sidebar's own map is exhaustive over it, so adding a row here without choosing
 * an icon is a type error rather than a missing glyph at runtime.
 */
export type NavIconName =
  | "house"
  | "users"
  | "inbox"
  | "activity"
  | "settings"
  | "user"
  | "building"
  | "shield"
  | "fingerprint"
  | "clipboard"
  | "files"
  | "calculator"
  | "book"
  | "chart"
  | "ledger"
  | "bank"
  | "scale"
  | "boxes"
  | "route"
  | "list"
  | "lock"
  | "receipt";

export type FirmNavId = "home" | "clients" | "work" | "activity" | "settings";

export type SettingsSectionId =
  | "account"
  | "firm"
  | "members"
  | "compliance"
  | "vendorBindings"
  | "registrations";

export type ClientNavId =
  | "home"
  | "work"
  | "documents"
  | "accounting"
  | "knowledge"
  | "reports";

export type AccountingItemId =
  | "journals"
  | "bank"
  | "receivables"
  | "assets"
  | "plans"
  | "accounts"
  | "close"
  | "tax";

/** The `?tab=` values `components/registers/registers-workbench.tsx` accepts. */
export type RegisterTab =
  | "opening"
  | "aging"
  | "fixedAssets"
  | "adjustments"
  | "staffAdvances"
  | "accounts";

/** The workbench's own default when `?tab=` is absent — so a bare `/registers`
 *  is the aging view, and the sidebar must mark the aging row current for it. */
export const REGISTERS_DEFAULT_TAB: RegisterTab = "aging";

type Floored = {
  readonly minimumRole: MemberRole;
  readonly operatorOnly?: true;
};

export type FirmNavItem = Floored & {
  readonly id: FirmNavId;
  readonly href: string;
  /** Key under the `AppShell` namespace. */
  readonly labelKey: `firmNav.${FirmNavId}`;
  readonly icon: NavIconName;
};

export type SettingsSection = Floored & {
  readonly id: SettingsSectionId;
  readonly href: string;
  /** Key under the `Settings` namespace. */
  readonly labelKey: `sections.${SettingsSectionId}.title`;
  readonly purposeKey: `sections.${SettingsSectionId}.purpose`;
  readonly icon: NavIconName;
  /**
   * A destination that still exists because something depends on it, not
   * because the product wants it there. The hub and the settings nav both badge
   * it; `components/firm-admin/vendor-bindings-panel.tsx` carries the
   * explanatory banner.
   */
  readonly legacy?: true;
};

export type ClientNavItem = Floored & {
  readonly id: ClientNavId;
  /** Appended to `/clients/:clientId`; the empty string is the client's home. */
  readonly segment: string;
  readonly labelKey: `clientNav.${ClientNavId}`;
  readonly icon: NavIconName;
};

export type AccountingItem = Floored & {
  readonly id: AccountingItemId;
  readonly segment: string;
  /** Present only for the four rows that are `?tab=` views of the registers workbench. */
  readonly tab?: RegisterTab;
  readonly labelKey: `accounting.${AccountingItemId}`;
  readonly icon: NavIconName;
  /** Renders a "Beta" badge beside the row. The page states its own boundary. */
  readonly beta?: true;
};

/**
 * FIRM ALTITUDE. The floors are unchanged from the pre-#614 registry except
 * where the destination itself is new:
 *  - home/clients: viewer (the shell's `caller_context` scope has no rank floor,
 *    `0141:542-551`; `p_clients_human` `0003:514` is firm-scoped with no rank).
 *  - work: viewer. Its reads today are `list_review_queue` (`0016:4563`, viewer)
 *    and the agent-task queue; the durable Work records (#641) inherit this row.
 *  - activity: bookkeeper (`agent_receipts_visible`, `0103:410`).
 *  - settings: viewer, because the parent performs no read of its own and every
 *    child is independently filtered below.
 */
export const FIRM_NAV: readonly FirmNavItem[] = [
  { id: "home", href: "/", labelKey: "firmNav.home", icon: "house", minimumRole: "viewer" },
  { id: "clients", href: "/clients", labelKey: "firmNav.clients", icon: "users", minimumRole: "viewer" },
  { id: "work", href: "/work", labelKey: "firmNav.work", icon: "inbox", minimumRole: "viewer" },
  { id: "activity", href: "/activity", labelKey: "firmNav.activity", icon: "activity", minimumRole: "bookkeeper" },
  { id: "settings", href: "/settings", labelKey: "firmNav.settings", icon: "settings", minimumRole: "viewer" },
] as const;

/** The saved attention view of Work — a filter on one destination, not a second one. */
export const WORK_NEEDS_YOU_HREF = "/work?view=needs-you";
export const WORK_VIEW_PARAM = "view";
export const WORK_NEEDS_YOU_VIEW = "needs-you";

/**
 * SETTINGS. Rank-shaped exactly as the old `ADMIN_NAVIGATION` floors were, with
 * one addition: `account`, the caller's own account surface, which is viewer by
 * construction (it reads nothing but the caller's own session).
 *
 *  - firm: viewer (`p_firms_human`, `0002:503-504`, no rank).
 *  - members: admin (roster floor `0141:526`, invite floor `0141:538`, live
 *    `invite_member` admin door `0147:376`).
 *  - compliance: viewer (`list_review_queue`, `0016:4563`).
 *  - vendorBindings: bookkeeper (`list_vendor_bindings` `0028:960`,
 *    `get_vendor_binding` `0028:1016`).
 *  - registrations: owner plus operator firm (`approve_firm_registration`,
 *    `0145:770,782`).
 *
 * REGISTRATIONS IS PROVISIONAL HERE. #615 builds the operator destination and may
 * relocate this row out of a firm's own settings entirely; leave the floor and
 * the `operatorOnly` conjunct alone until it does.
 */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: "account",
    href: "/settings/account",
    labelKey: "sections.account.title",
    purposeKey: "sections.account.purpose",
    icon: "user",
    minimumRole: "viewer",
  },
  {
    id: "firm",
    href: "/settings/firm",
    labelKey: "sections.firm.title",
    purposeKey: "sections.firm.purpose",
    icon: "building",
    minimumRole: "viewer",
  },
  {
    id: "members",
    href: "/settings/members",
    labelKey: "sections.members.title",
    purposeKey: "sections.members.purpose",
    icon: "users",
    minimumRole: "admin",
  },
  {
    id: "compliance",
    href: "/settings/compliance",
    labelKey: "sections.compliance.title",
    purposeKey: "sections.compliance.purpose",
    icon: "shield",
    minimumRole: "viewer",
  },
  {
    id: "vendorBindings",
    href: "/settings/vendor-bindings",
    labelKey: "sections.vendorBindings.title",
    purposeKey: "sections.vendorBindings.purpose",
    icon: "fingerprint",
    minimumRole: "bookkeeper",
    legacy: true,
  },
  {
    id: "registrations",
    href: "/settings/registrations",
    labelKey: "sections.registrations.title",
    purposeKey: "sections.registrations.purpose",
    icon: "clipboard",
    minimumRole: "owner",
    operatorOnly: true,
  },
] as const;

/**
 * CLIENT ALTITUDE. Every item is viewer-floored: RLS and the governed doors are
 * the wall inside a client, and hiding a workbench from a viewer would remove a
 * destination that genuinely is theirs. The floor is still WRITTEN, so a NULL /
 * unreadable rank fails closed out of the client nav exactly as it does out of
 * the firm nav rather than falling through to "everything".
 *
 * THE OBJECT URLS ARE STABLE. `/journals`, `/documents`, `/bank`, `/close`,
 * `/tax`, `/reports`, `/registers`, `/knowledge` are unchanged by this train —
 * every bookmark, every deep link from a Needs-you row, every e2e walk still
 * resolves. What changed is the SHAPE of the menu over them, not the addresses.
 */
export const CLIENT_NAV: readonly ClientNavItem[] = [
  { id: "home", segment: "", labelKey: "clientNav.home", icon: "house", minimumRole: "viewer" },
  { id: "work", segment: "work", labelKey: "clientNav.work", icon: "inbox", minimumRole: "viewer" },
  { id: "documents", segment: "documents", labelKey: "clientNav.documents", icon: "files", minimumRole: "viewer" },
  { id: "accounting", segment: "accounting", labelKey: "clientNav.accounting", icon: "calculator", minimumRole: "viewer" },
  { id: "knowledge", segment: "knowledge", labelKey: "clientNav.knowledge", icon: "book", minimumRole: "viewer" },
  { id: "reports", segment: "reports", labelKey: "clientNav.reports", icon: "chart", minimumRole: "viewer" },
] as const;

/**
 * The children of the Accounting group, in the order a Malaysian firm actually
 * works them. Four of the eight are `?tab=` views of ONE workbench
 * (`/registers`), which is deliberate: they are adjacent views of one object, so
 * the workbench keeps its own in-page `SectionTabs` and the sidebar simply names
 * the four a human navigates to directly. The two the sidebar does NOT name —
 * `?tab=opening` and `?tab=staffAdvances` — stay reachable through those tabs;
 * naming every tab twice would make the sidebar a second, competing tab strip.
 */
export const ACCOUNTING_ITEMS: readonly AccountingItem[] = [
  { id: "journals", segment: "journals", labelKey: "accounting.journals", icon: "ledger", minimumRole: "viewer" },
  { id: "bank", segment: "bank", labelKey: "accounting.bank", icon: "bank", minimumRole: "viewer" },
  { id: "receivables", segment: "registers", tab: "aging", labelKey: "accounting.receivables", icon: "scale", minimumRole: "viewer" },
  { id: "assets", segment: "registers", tab: "fixedAssets", labelKey: "accounting.assets", icon: "boxes", minimumRole: "viewer" },
  { id: "plans", segment: "registers", tab: "adjustments", labelKey: "accounting.plans", icon: "route", minimumRole: "viewer" },
  { id: "accounts", segment: "registers", tab: "accounts", labelKey: "accounting.accounts", icon: "list", minimumRole: "viewer" },
  { id: "close", segment: "close", labelKey: "accounting.close", icon: "lock", minimumRole: "viewer" },
  { id: "tax", segment: "tax", labelKey: "accounting.tax", icon: "receipt", minimumRole: "viewer", beta: true },
] as const;

// ── hrefs ────────────────────────────────────────────────────────────────────

export function clientBase(clientId: string): string {
  return `/clients/${clientId}`;
}

export function clientNavHref(clientId: string, item: ClientNavItem): string {
  return item.segment === "" ? clientBase(clientId) : `${clientBase(clientId)}/${item.segment}`;
}

export function accountingHref(clientId: string, item: AccountingItem): string {
  const path = `${clientBase(clientId)}/${item.segment}`;
  return item.tab === undefined ? path : `${path}?tab=${item.tab}`;
}

// ── rank shaping ─────────────────────────────────────────────────────────────

export function visibleFirmNav(scope: NavigationScope): readonly FirmNavItem[] {
  return FIRM_NAV.filter((item) => hasNavigationAccess(scope, item));
}

export function visibleSettingsSections(scope: NavigationScope): readonly SettingsSection[] {
  return SETTINGS_SECTIONS.filter((item) => hasNavigationAccess(scope, item));
}

export function visibleClientNav(scope: NavigationScope): readonly ClientNavItem[] {
  return CLIENT_NAV.filter((item) => hasNavigationAccess(scope, item));
}

export function visibleAccountingItems(scope: NavigationScope): readonly AccountingItem[] {
  return ACCOUNTING_ITEMS.filter((item) => hasNavigationAccess(scope, item));
}

// ── reading the current URL ──────────────────────────────────────────────────

/**
 * The `?tab=`/`?view=` reader both `resolveActive` and `switchClientDestination`
 * take. Deliberately the SHAPE `useSearchParams()` returns rather than the object
 * itself, so a node cell can hand in a `URLSearchParams` and a page can hand in
 * Next's read-only wrapper without either pretending to be the other.
 */
export interface ReadonlyParams {
  get(name: string): string | null;
}

const EMPTY_PARAMS: ReadonlyParams = { get: () => null };

export type ActiveNav = {
  readonly scope: "firm" | "client";
  readonly clientId: string | null;
  /** The firm item whose destination the caller is ON. Null inside a client. */
  readonly firmItem: FirmNavId | null;
  readonly clientItem: ClientNavId | null;
  readonly accountingItem: AccountingItemId | null;
  /** True whenever the caller is anywhere under Accounting — including the two
   *  register tabs the sidebar does not name. Drives the collapsible's default. */
  readonly accountingOpen: boolean;
  readonly settingsSection: SettingsSectionId | null;
};

/** `/clients/<id>[/...]` → the id, or null at firm altitude. THE resolver for
 *  that one dynamic segment — `lib/command/routes.ts` re-exports this under
 *  its own `resolveClientIdFromPathname` name rather than keeping a second,
 *  hand-duplicated regex (#614 code review). */
export function clientIdOf(pathname: string): string | null {
  const match = /^\/clients\/([^/?#]+)(?:\/.*)?$/.exec(pathname);
  const segment = match?.[1];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** The path segments after `/clients/:id`, e.g. `["registers"]` or `[]`. */
function clientSubPath(pathname: string, clientId: string): string[] {
  const base = clientBase(clientId);
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  return rest.split("/").filter(Boolean);
}

const NOTHING_ACTIVE = {
  firmItem: null,
  clientItem: null,
  accountingItem: null,
  accountingOpen: false,
  settingsSection: null,
} as const;

/**
 * Which ONE entry in the whole tree is the page the caller is looking at.
 *
 * The contract the sidebar depends on: AT MOST ONE of `firmItem`, `clientItem`
 * and `accountingItem` is non-null, so `aria-current="page"` lands exactly
 * once in the sidebar. Inside a client, the firm group's Clients row is NOT
 * current — the client group above it already says where you are, and two
 * `aria-current`s in one nav is the defect this rule exists to prevent.
 * `settingsSection` is a second mark by design: it accompanies
 * `firmItem: "settings"` rather than replacing it, because the section is
 * marked current in the in-page settings nav, never in the sidebar, so it
 * cannot collide with the sidebar's own single `aria-current`.
 *
 * The three cases worth naming:
 *   · `/registers` with no `?tab=` is the aging view (the workbench's own
 *     default), so "Receivables & payables" is current for the bare path.
 *   · `/registers?tab=opening` / `?tab=staffAdvances` are real views the sidebar
 *     does not name: nothing is current, and the group is still OPEN, which is
 *     the honest answer rather than marking a sibling.
 *   · `/clients/:id/clara/:threadId` is client scope with nothing active — the
 *     escalated thread is not a workbench.
 */
export function resolveActive(pathname: string, params: ReadonlyParams = EMPTY_PARAMS): ActiveNav {
  const clientId = clientIdOf(pathname);

  if (clientId === null) {
    if (pathname === "/") return { scope: "firm", clientId: null, ...NOTHING_ACTIVE, firmItem: "home" };
    if (pathname === "/clients") return { scope: "firm", clientId: null, ...NOTHING_ACTIVE, firmItem: "clients" };
    if (pathname === "/work" || pathname.startsWith("/work/")) {
      return { scope: "firm", clientId: null, ...NOTHING_ACTIVE, firmItem: "work" };
    }
    if (pathname === "/activity" || pathname.startsWith("/activity/")) {
      return { scope: "firm", clientId: null, ...NOTHING_ACTIVE, firmItem: "activity" };
    }
    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
      const section = SETTINGS_SECTIONS.find(
        (s) => pathname === s.href || pathname.startsWith(`${s.href}/`),
      );
      return {
        scope: "firm",
        clientId: null,
        ...NOTHING_ACTIVE,
        firmItem: "settings",
        settingsSection: section?.id ?? null,
      };
    }
    return { scope: "firm", clientId: null, ...NOTHING_ACTIVE };
  }

  const rest = clientSubPath(pathname, clientId);
  const segment = rest[0] ?? "";

  const accounting = ACCOUNTING_ITEMS.filter((item) => item.segment === segment);
  if (accounting.length > 0) {
    if (segment !== "registers") {
      return {
        scope: "client",
        clientId,
        ...NOTHING_ACTIVE,
        accountingItem: accounting[0]!.id,
        accountingOpen: true,
      };
    }
    const tab = params.get("tab") ?? REGISTERS_DEFAULT_TAB;
    const named = accounting.find((item) => item.tab === tab);
    return {
      scope: "client",
      clientId,
      ...NOTHING_ACTIVE,
      accountingItem: named?.id ?? null,
      accountingOpen: true,
    };
  }

  const item = CLIENT_NAV.find((entry) => entry.segment === segment);
  if (item) {
    return {
      scope: "client",
      clientId,
      ...NOTHING_ACTIVE,
      clientItem: item.id,
      accountingOpen: item.id === "accounting",
    };
  }

  // A client sub-path the tree does not name — `/clara/:threadId` today.
  return { scope: "client", clientId, ...NOTHING_ACTIVE };
}

// ── breadcrumbs ──────────────────────────────────────────────────────────────

/**
 * A crumb is either a LITERAL name read from the database (the firm, the client)
 * or a MESSAGE KEY (every destination the registry names). Keeping the two apart
 * is what stops a firm called "Settings" from being translated.
 *
 * The LAST crumb never carries an href: it is the page you are on, and a link to
 * here is a link to nowhere.
 *
 * `scope` marks the ONE crumb that is the current ALTITUDE's identity — the
 * firm crumb at firm altitude, the client crumb (name or placeholder) at client
 * altitude — and `app-breadcrumb.tsx`'s narrow arm keeps exactly this crumb and
 * the last one visible. THIS USED TO BE A HEURISTIC ("the last `kind: 'text'`
 * crumb") rather than a flag, and it broke on the one case that mattered most:
 * before the client layout publishes the client's name, `clientCrumbOf` below
 * returns a `kind: "message"` placeholder crumb (never the raw id — #614 A7),
 * so "the last text crumb" landed back on the FIRM crumb and the narrow arm
 * showed firm identity while the URL was already inside a client. An explicit
 * flag, set once per `breadcrumbFor` return path regardless of which `kind` the
 * scope crumb happens to be, does not have that failure mode.
 */
export type Crumb =
  | { readonly kind: "text"; readonly text: string; readonly href?: string; readonly scope?: true }
  | {
      readonly kind: "message";
      readonly ns: "AppShell" | "Settings";
      readonly key: string;
      readonly href?: string;
      readonly scope?: true;
    };

export interface BreadcrumbNames {
  readonly firmName: string;
  readonly clientName?: string | null;
}

/**
 * The ordered ancestry of the current page, firm first.
 *
 *   /work                      →  <firm> › Work
 *   /settings/members          →  <firm> › Settings › Members
 *   /clients/:id/journals      →  <firm> › Clients › <client> › Accounting › Journals
 *
 * THE SAVED VIEW IS NOT A CRUMB. `/work?view=needs-you` breadcrumbs identically
 * to `/work`: a saved view is a filter on one destination, not a deeper location,
 * and the page's own view strip carries `aria-current` for it. Making it a crumb
 * would promise a level of the tree that does not exist.
 *
 * A CLIENT SUB-PATH THE TREE DOES NOT NAME (the escalated Clara thread) ends at
 * the client's own name, as the current page. That is honest — you are in this
 * client, on a surface the menu does not contain — and it keeps the client's
 * identity visible, which is the crumb that matters most at that altitude.
 */
export function breadcrumbFor(
  pathname: string,
  params: ReadonlyParams = EMPTY_PARAMS,
  names: BreadcrumbNames,
): Crumb[] {
  const active = resolveActive(pathname, params);
  // TWO firm crumbs, not one, because `scope` may land on only ONE of them.
  // `firm` is the plain ancestry link client-scope trails use to point back at
  // firm home; `firmScope` is the SAME crumb with `scope: true`, used only when
  // firm altitude IS the current scope. Reusing one object for both would mark
  // the firm crumb as the scope identity even inside a client, which is exactly
  // the bug this flag exists to not have.
  const firm: Crumb = { kind: "text", text: names.firmName, href: "/" };
  const firmScope: Crumb = { ...firm, scope: true };

  if (active.scope === "firm") {
    if (active.firmItem === "home" || active.firmItem === null) {
      return [{ kind: "text", text: names.firmName, scope: true }];
    }
    const item = FIRM_NAV.find((entry) => entry.id === active.firmItem)!;
    if (active.firmItem !== "settings") {
      return [firmScope, { kind: "message", ns: "AppShell", key: item.labelKey }];
    }
    const settings: Crumb = { kind: "message", ns: "AppShell", key: item.labelKey, href: item.href };
    if (active.settingsSection === null) {
      return [firmScope, { kind: "message", ns: "AppShell", key: item.labelKey }];
    }
    const section = SETTINGS_SECTIONS.find((s) => s.id === active.settingsSection)!;
    return [firmScope, settings, { kind: "message", ns: "Settings", key: section.labelKey }];
  }

  const clientId = active.clientId!;
  const clients: Crumb = { kind: "message", ns: "AppShell", key: "firmNav.clients", href: "/clients" };
  // The client's own name is not known on the first render after a hard load
  // (the layout that reads it publishes it one commit later). The stand-in is
  // the neutral "Client" placeholder — NEVER the raw id (a UUID is not an
  // identity a person or a screen reader should meet, not even for one paint)
  // and never a guessed name (#614 A7). EITHER WAY this is the client-scope
  // identity crumb, so `scope: true` is set on both arms — the placeholder is
  // still "who you are with" for as long as the real name has not landed.
  const clientCrumbOf = (href?: string): Crumb =>
    names.clientName != null
      ? { kind: "text", text: names.clientName, scope: true, ...(href === undefined ? {} : { href }) }
      : {
          kind: "message",
          ns: "AppShell",
          key: "scope.clientPlaceholder",
          scope: true,
          ...(href === undefined ? {} : { href }),
        };
  const clientCrumb: Crumb = clientCrumbOf(clientBase(clientId));

  if (active.clientItem === "home") {
    return [firm, clients, clientCrumbOf()];
  }
  if (active.clientItem !== null) {
    const item = CLIENT_NAV.find((entry) => entry.id === active.clientItem)!;
    return [firm, clients, clientCrumb, { kind: "message", ns: "AppShell", key: item.labelKey }];
  }
  if (active.accountingOpen) {
    const accountingItem = CLIENT_NAV.find((entry) => entry.id === "accounting")!;
    const accounting: Crumb = {
      kind: "message",
      ns: "AppShell",
      key: accountingItem.labelKey,
      href: clientNavHref(clientId, accountingItem),
    };
    if (active.accountingItem === null) {
      // A register tab the sidebar does not name. The workbench itself is the
      // page; its own SectionTabs say which view.
      return [firm, clients, clientCrumb, accounting, { kind: "message", ns: "AppShell", key: "clientNav.registersView" }];
    }
    const child = ACCOUNTING_ITEMS.find((entry) => entry.id === active.accountingItem)!;
    return [firm, clients, clientCrumb, accounting, { kind: "message", ns: "AppShell", key: child.labelKey }];
  }
  return [firm, clients, clientCrumbOf()];
}

// ── switching client ─────────────────────────────────────────────────────────

/**
 * WHERE THE SAME QUESTION LIVES UNDER A DIFFERENT CLIENT.
 *
 * Switching client from the Journals workbench should land on the NEW client's
 * journals, not dump the human back at a workspace home they then have to
 * re-navigate — that is the whole point of a scope switcher rather than a link to
 * the register. What travels is the DESTINATION KIND (and, for the registers
 * workbench, the `?tab=` that says which view of it), never anything identifying
 * the client you left.
 *
 * THREE THINGS DELIBERATELY DO NOT TRAVEL:
 *   · A THREAD. `/clients/A/clara/:threadId` is one conversation about one
 *     client; there is no corresponding thread under B, and inventing one would
 *     be the cross-client leak `components/client-scope-provider.tsx` exists to
 *     prevent. The switch lands on B's home.
 *   · Any OTHER query parameter. A filter, a page cursor, a selected row id are
 *     all about the client you are leaving. Only `?tab=` (a view of a workbench,
 *     not a datum) and `?view=` (a saved view of Work) are carried.
 *   · A firm-altitude path. `/activity` is not a client destination at all, so
 *     the switch lands on B's home rather than pretending Activity is scoped.
 */
export function switchClientDestination(
  pathname: string,
  params: ReadonlyParams,
  toClientId: string,
): string {
  const active = resolveActive(pathname, params);
  const base = clientBase(toClientId);
  if (active.scope !== "client") return base;

  if (active.clientItem !== null) {
    const item = CLIENT_NAV.find((entry) => entry.id === active.clientItem)!;
    const href = clientNavHref(toClientId, item);
    if (item.id !== "work") return href;
    const view = params.get(WORK_VIEW_PARAM);
    return view === null ? href : `${href}?${WORK_VIEW_PARAM}=${encodeURIComponent(view)}`;
  }

  if (active.accountingOpen) {
    const fromId = active.clientId!;
    const rest = clientSubPath(pathname, fromId);
    const segment = rest[0] ?? "";
    const path = `${base}/${segment}`;
    if (segment !== "registers") return path;
    const tab = params.get("tab");
    return tab === null ? path : `${path}?tab=${encodeURIComponent(tab)}`;
  }

  return base;
}
