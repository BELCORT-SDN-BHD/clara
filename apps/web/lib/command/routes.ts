/**
 * ⌘K "Go" route manifest — the two-level IA ruled at
 * docs/plan/active/mohe-grill-rulings-2026-08-27.md Q3:
 *
 *   Firm altitude:   firm home · cross-client Needs-you inbox · client
 *                     register · firm activity (the receipts/open-register
 *                     feed) · admin (tiers/RBAC/metering).
 *   Client workspace: ONE workspace, accounting objects as TABS — journals ·
 *                     documents · bank · close · reports · registers ·
 *                     knowledge.
 *
 * SYNC NOTE (authored on `web/p2-cmdk`, forked from `origin/frontend/web` @
 * 36d2bb0, 2026-08-27): at authoring time `apps/web/app/` holds exactly two
 * pages — `(firm)/page.tsx` ("/") and `(firm)/clients/[clientId]/page.tsx`
 * ("/clients/:clientId") — so every entry below is annotated `status:
 * "built"` (a page.tsx exists at that path today) or `status: "planned"`
 * (the path matches the ruled IA but nothing renders there yet; it is P3
 * workbench-tab / P3-P4 firm-surface work per Q9). This file is a STAND-IN:
 * the sibling auth/rail lanes (p2-auth, p2-rail) may land their own nav
 * source of truth in the same window. When that merges, or when P3 starts
 * building real tab pages, re-derive this manifest from the live `app/`
 * tree instead of hand-maintaining it — do not let `status: "built"` drift
 * from what actually has a page.tsx.
 *
 * Every `href` is a real Next.js path. Selecting a "planned" entry performs
 * a REAL client-side navigation — Next's own not-found rendering is what a
 * visitor sees, which is an honest "nothing built here yet" response, not a
 * fake success. That is why Go is allowed to index the full ruled IA now
 * (unlike Do, which must show no fake dispatch at all): navigation never
 * pretends an outcome, so listing an in-progress destination and being
 * truthful about `status` is enough to satisfy the "no affordance may look
 * live when it is not" corollary (frontend-handoff-2026-08-23.md §5, Q9).
 */

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
}

export interface ClientCommandRoute extends CommandRouteBase {
  scope: "client";
  /** Builds the path given the client id resolved from the current URL. */
  href: (clientId: string) => string;
}

export type CommandRoute = FirmCommandRoute | ClientCommandRoute;

/** Firm-altitude surfaces (Q3). Always offered, regardless of current route. */
export const FIRM_ROUTES: FirmCommandRoute[] = [
  {
    id: "firmHome",
    scope: "firm",
    href: "/",
    status: "built",
    keywords: ["home", "dashboard"],
  },
  {
    id: "needsYou",
    scope: "firm",
    href: "/inbox",
    status: "planned",
    keywords: ["needs you", "inbox", "exceptions", "proactive"],
  },
  {
    id: "clientRegister",
    scope: "firm",
    href: "/clients",
    status: "planned",
    keywords: ["clients", "register", "book of clients"],
  },
  {
    id: "firmActivity",
    scope: "firm",
    href: "/activity",
    status: "planned",
    keywords: ["activity", "receipts", "open register", "audit"],
  },
  {
    id: "admin",
    scope: "firm",
    href: "/admin",
    status: "planned",
    keywords: ["admin", "members", "rbac", "tiers", "metering"],
  },
];

/**
 * Client-workspace tabs (Q3). Offered only when the current URL resolves a
 * `clientId` (see `resolveClientIdFromPathname` below) — ⌘K never invents a
 * client to navigate into.
 */
export const CLIENT_ROUTES: ClientCommandRoute[] = [
  {
    id: "clientWorkspaceHome",
    scope: "client",
    href: (clientId) => `/clients/${clientId}`,
    status: "built",
    keywords: ["workspace", "overview"],
  },
  {
    id: "journals",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/journals`,
    status: "planned",
    keywords: ["journals", "entries", "je", "drafts"],
  },
  {
    id: "documents",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/documents`,
    status: "planned",
    keywords: ["documents", "ocr", "evidence", "upload"],
  },
  {
    id: "bank",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/bank`,
    status: "planned",
    keywords: ["bank", "reconciliation", "statement", "matching"],
  },
  {
    id: "close",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/close`,
    status: "planned",
    keywords: ["close", "period", "fiscal year"],
  },
  {
    id: "reports",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/reports`,
    status: "planned",
    keywords: ["reports", "statutory", "export"],
  },
  {
    id: "registers",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/registers`,
    status: "planned",
    keywords: ["registers", "aging", "fixed assets", "advances"],
  },
  {
    id: "knowledge",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/knowledge`,
    status: "planned",
    keywords: ["knowledge", "wiki", "context"],
  },
];

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
