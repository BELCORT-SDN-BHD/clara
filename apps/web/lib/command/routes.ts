/**
 * ⌘K "Go" route manifest — DERIVED, from #614 onward, from the one navigation
 * registry (`lib/navigation/tree.ts`).
 *
 * WHAT THIS FILE USED TO BE, and why it is not that any more. It was a
 * hand-written list of every destination in the product, maintained beside three
 * OTHER hand-written lists of the same destinations. Its own former header was
 * the post-mortem: at the 2026-08-29 audit ten of fifteen rows were wrong in one
 * direction or the other, and `needsYou` pointed at `/inbox`, a path no
 * `page.tsx` has ever served — so the flagship cross-client inbox 404'd from the
 * app's universal entry point while every backstop said green. C-43 then fixed
 * half of it by JOINING the rank floors from the sidebar's registry rather than
 * retyping them here; #614 finishes the job by taking the ROWS from there too.
 *
 * SO THE PALETTE AND THE SIDEBAR CANNOT DISAGREE — not about which destinations
 * exist, not about who is offered them, and not about where they lead. What is
 * still written here is the presentational half a nav registry has no business
 * carrying: the ⌘K message key (deliberately NOT the sidebar's own — "Firm home"
 * here, "Home" in the sidebar, because they are different sentences in different
 * places), the fuzzy-match keywords, and `status`.
 *
 * `status` STAYS BOTH-WAYS MECHANICAL. ./routes.test.ts globs the real `app/`
 * tree, derives every URL a `page.tsx` serves, and asserts three things: a
 * "built" row has a page; a row whose page exists is marked "built" (no false
 * "Not built yet" badge); and every listed href resolves to a page at all. That
 * third assertion is what `/inbox` slipped past — status and tree agreed
 * perfectly about a path nobody ever intended to build.
 *
 * THE ONE ROW WHOSE HREF IS NOT A REGISTRY HREF is "Needs you", and it is worth
 * naming: it is the SAVED VIEW `/work?view=needs-you`, not a destination of its
 * own, so it joins the tree by `navHref: "/work"` and inherits Work's floor. A
 * saved view cannot be more restricted than the destination it filters.
 */

import { hasNavigationAccess, type NavigationScope } from "@/lib/firm/navigation";
import {
  ACCOUNTING_ITEMS,
  CLIENT_NAV,
  FIRM_NAV,
  SETTINGS_SECTIONS,
  WORK_NEEDS_YOU_HREF,
  accountingHref,
  clientNavHref,
  type AccountingItemId,
  type ClientNavId,
  type FirmNavId,
  type SettingsSectionId,
} from "@/lib/navigation/tree";
import type { MemberRole } from "@/lib/members/reads";

export type CommandRouteStatus = "built" | "planned";

export interface CommandRouteBase {
  /** Stable id — also the i18n message key under `CommandPalette.go.routes.<id>`. */
  id: string;
  /** Whether a page.tsx exists at `href` in this checkout today. */
  status: CommandRouteStatus;
  /** Extra fuzzy-match terms beyond the translated label. */
  keywords?: string[];
}

export interface FirmCommandRoute extends CommandRouteBase {
  scope: "firm";
  href: string;
  /**
   * The registry href this row inherits its floor and its visibility from.
   * Equal to `href` for every row except the saved view, which filters `/work`.
   * `components/command/command-palette.tsx` filters on THIS, so a row is
   * offered exactly when the sidebar would offer its destination.
   */
  navHref: string;
  /** DERIVED from the registry row, never retyped (裁-107a). */
  minimumRole: MemberRole;
  operatorOnly?: true;
}

export interface ClientCommandRoute extends CommandRouteBase {
  scope: "client";
  /** Builds the path given the client id resolved from the current URL. */
  href: (clientId: string) => string;
}

export type CommandRoute = FirmCommandRoute | ClientCommandRoute;

type Presentation = { id: string; keywords: string[] };

/**
 * The ⌘K face of each firm destination, keyed by its REGISTRY id. Exhaustive
 * over both id unions by type, so a destination added to the tree without a ⌘K
 * label is a compile error rather than a row that silently renders its own raw
 * message key.
 */
const FIRM_PRESENTATION: Record<FirmNavId, Presentation> = {
  home: { id: "firmHome", keywords: ["home", "dashboard"] },
  clients: { id: "clientRegister", keywords: ["clients", "register", "book of clients"] },
  work: { id: "firmWork", keywords: ["work", "queue", "tasks", "in progress"] },
  activity: { id: "firmActivity", keywords: ["activity", "receipts", "open register", "audit"] },
  settings: { id: "settings", keywords: ["settings", "firm controls", "admin", "members", "compliance"] },
};

const SETTINGS_PRESENTATION: Record<SettingsSectionId, Presentation> = {
  account: { id: "settingsAccount", keywords: ["account", "profile", "sign out", "log out"] },
  firm: { id: "settingsFirm", keywords: ["firm settings", "approvals", "capabilities", "owner"] },
  members: { id: "settingsMembers", keywords: ["members", "roles", "rbac", "invites", "access"] },
  compliance: { id: "settingsCompliance", keywords: ["compliance", "sst", "registration", "watch"] },
  vendorBindings: {
    id: "settingsVendorBindings",
    keywords: ["vendor", "binding", "identity", "propose", "sign", "revoke", "legacy"],
  },
  registrations: { id: "settingsRegistrations", keywords: ["registrations", "approvals", "operator", "queue"] },
};

const CLIENT_PRESENTATION: Record<ClientNavId, Presentation> = {
  home: { id: "clientWorkspaceHome", keywords: ["workspace", "overview"] },
  work: { id: "clientWork", keywords: ["work", "needs you", "queue"] },
  documents: { id: "documents", keywords: ["documents", "ocr", "evidence", "upload"] },
  accounting: { id: "clientAccounting", keywords: ["accounting", "books", "ledger"] },
  knowledge: { id: "knowledge", keywords: ["knowledge", "wiki", "context"] },
  reports: { id: "reports", keywords: ["reports", "statutory", "export"] },
};

const ACCOUNTING_PRESENTATION: Record<AccountingItemId, Presentation> = {
  journals: { id: "journals", keywords: ["journals", "entries", "je", "drafts"] },
  bank: { id: "bank", keywords: ["bank", "reconciliation", "statement", "matching"] },
  receivables: { id: "registersAging", keywords: ["receivables", "payables", "aging", "ar", "ap", "registers"] },
  assets: { id: "registersAssets", keywords: ["fixed assets", "depreciation", "nbv", "registers"] },
  plans: { id: "registersPlans", keywords: ["plans", "adjustments", "accruals", "registers"] },
  accounts: { id: "registersAccounts", keywords: ["accounts", "chart of accounts", "coa", "registers"] },
  close: { id: "close", keywords: ["close", "period", "fiscal year"] },
  tax: { id: "clientTax", keywords: ["tax", "sst", "cp204", "income tax", "computation"] },
};

/** The floor, taken from the registry row itself — never a second literal here. */
function floorOf(entry: { minimumRole: MemberRole; operatorOnly?: true }) {
  return entry.operatorOnly
    ? { minimumRole: entry.minimumRole, operatorOnly: entry.operatorOnly }
    : { minimumRole: entry.minimumRole };
}

/**
 * Firm-altitude surfaces. Always offered regardless of the current route —
 * subject to the caller's rank, which `command-palette.tsx` applies with the
 * sidebar's own `hasNavigationAccess` on the SAME registry rows.
 *
 * The saved view sits immediately after Work: it is the attention view of that
 * destination, and a human typing "needs you" is looking for it, not for the
 * unfiltered list.
 */
export const FIRM_ROUTES: FirmCommandRoute[] = [
  ...FIRM_NAV.flatMap((item): FirmCommandRoute[] => {
    const row: FirmCommandRoute = {
      ...FIRM_PRESENTATION[item.id],
      scope: "firm",
      href: item.href,
      navHref: item.href,
      status: "built",
      ...floorOf(item),
    };
    if (item.id !== "work") return [row];
    const workItem = item;
    return [
      row,
      {
        id: "needsYou",
        scope: "firm",
        href: WORK_NEEDS_YOU_HREF,
        navHref: workItem.href,
        status: "built",
        keywords: ["needs you", "inbox", "exceptions", "proactive", "attention"],
        ...floorOf(workItem),
      },
    ];
  }),
  ...SETTINGS_SECTIONS.map((section): FirmCommandRoute => ({
    ...SETTINGS_PRESENTATION[section.id],
    scope: "firm",
    href: section.href,
    navHref: section.href,
    status: "built",
    ...floorOf(section),
  })),
];

/**
 * Client-workspace destinations. Offered only when the current URL resolves a
 * `clientId` (see `resolveClientIdFromPathname`) — ⌘K never invents a client to
 * navigate into.
 *
 * The four `?tab=` rows are the same four the sidebar names under Accounting,
 * for the same reason: they are the register views a human navigates TO. The two
 * the sidebar omits (`?tab=opening`, `?tab=staffAdvances`) stay reachable through
 * the workbench's own in-page tabs, and are deliberately not indexed twice.
 */
export const CLIENT_ROUTES: ClientCommandRoute[] = [
  ...CLIENT_NAV.map((item): ClientCommandRoute => ({
    ...CLIENT_PRESENTATION[item.id],
    scope: "client",
    href: (clientId: string) => clientNavHref(clientId, item),
    status: "built",
  })),
  ...ACCOUNTING_ITEMS.map((item): ClientCommandRoute => ({
    ...ACCOUNTING_PRESENTATION[item.id],
    scope: "client",
    href: (clientId: string) => accountingHref(clientId, item),
    status: "built",
  })),
];

/**
 * The hrefs a caller may be offered, as the SIDEBAR would compute them — one
 * predicate, called on the registry's own rows. `command-palette.tsx` filters
 * its Go rows through this rather than re-deriving a floor comparison, so a ⌘K
 * row and a sidebar row for one destination cannot disagree.
 */
export function permittedNavHrefs(scope: NavigationScope): Set<string> {
  const hrefs = new Set<string>();
  for (const item of FIRM_NAV) if (hasNavigationAccess(scope, item)) hrefs.add(item.href);
  for (const section of SETTINGS_SECTIONS) if (hasNavigationAccess(scope, section)) hrefs.add(section.href);
  return hrefs;
}

/**
 * Resolves the current client id from a pathname, matching the ONE dynamic
 * route this scaffold has today (`/clients/[clientId]`, and any of its
 * future sub-paths). Returns `null` at firm altitude. Never fabricates a
 * client identity — the id is read verbatim from the URL segment, exactly
 * as `app/(firm)/clients/[clientId]/page.tsx` already does (hard constraint
 * 2: the DB, not the UI, owns identity — this only echoes back what the URL
 * itself already asserts).
 */
export function resolveClientIdFromPathname(pathname: string): string | null {
  const match = /^\/clients\/([^/]+)(?:\/.*)?$/.exec(pathname);
  const segment = match?.[1];
  if (!segment) return null;
  // A malformed percent-encoding ("%E0%A4%A") throws from decodeURIComponent;
  // this runs in the palette's render body, so an uncaught throw would crash
  // the whole component over a garbage URL. Garbage in → no client context.
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
