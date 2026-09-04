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
 * SYNC NOTE — TRUED 2026-08-29 (MBB-5, docs/plan/active/mohe-alignment-audit-
 * 2026-08-29.md §2). The original note recorded that at P2 authoring time
 * `apps/web/app/` held exactly two pages, so most entries were annotated
 * `status: "planned"`, and it told the next lane to "re-derive this manifest
 * from the live `app/` tree instead of hand-maintaining it". That never
 * happened: P3 and all eleven port-wave trains landed real pages and left
 * this file alone, so ten of fifteen Go rows were wrong in one direction or
 * the other — `needsYou` pointed at `/inbox`, a path with no page.tsx
 * anywhere in the tree, and nine live workbenches were badged "Not built
 * yet" on the surface most likely to be exercised in a demo.
 *
 * `status` is now BOTH-WAYS MECHANICAL. ./routes.test.ts globs the real
 * `app/` tree, derives every URL a `page.tsx` serves, and asserts three
 * things: a "built" row has a page; a row whose page exists is marked
 * "built" (no false "Not built yet" badge); and every listed href resolves
 * to a page at all. That third assertion is deliberately STRICTER than the
 * original rationale below, and the /inbox row is why: §9.2 of the port-wave
 * plan specified the backstop as "every `status` checked against whether a
 * `page.tsx` exists at that path", and /inbox PASSED that check — status was
 * "planned" and no page existed. Status-to-tree could never see a route
 * pointing at a path nobody ever intends to build.
 *
 * Every `href` is a real Next.js path. The original rationale for listing an
 * unbuilt destination — a "planned" entry navigates for real, and Next's own
 * not-found rendering is an honest "nothing here yet", not a fake success —
 * still holds for a path the IA genuinely reserves. It is kept here because
 * it is why Go may index the ruled IA at all (unlike Do, which must show no
 * fake dispatch): navigation never pretends an outcome. What it can no
 * longer excuse is a row pointing somewhere the tree does not go — hence the
 * third assertion. There are no "planned" rows today; a future one must land
 * with its page in the same PR (port-wave plan §3.6: truing this file is
 * part of a train's OWN merge, never a later sweep).
 * Admin child cards use registry-driven hrefs rather than literal links, so
 * each child also needs its own exact row here to remain discoverable.
 */

import { ADMIN_NAVIGATION, FIRM_NAVIGATION } from "@/lib/firm/navigation";
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
   * C-43 — the rank floor, DERIVED from the sidebar's own registry, never
   * retyped here. See `FIRM_ROUTES` below for the join and why it is a join.
   * Shaped as `NavigationEntry` so `hasNavigationAccess` can be CALLED on it
   * rather than a second copy of that predicate being written (裁-107a).
   */
  minimumRole: MemberRole;
  operatorOnly?: true;
}

export interface ClientCommandRoute extends CommandRouteBase {
  scope: "client";
  /** Builds the path given the client id resolved from the current URL. */
  href: (clientId: string) => string;
}

export type CommandRoute = FirmCommandRoute | ClientCommandRoute;

/**
 * C-43 — THE FIRM GO ROWS ARE DERIVED, NOT A SECOND COPY.
 *
 * WHAT WAS WRONG. `FIRM_ROUTES` was a flat hand-written constant with no rank
 * field at all, and `command-palette.tsx` filtered it by TEXT only. Meanwhile
 * `lib/firm/navigation.ts` held the real floors the sidebar applies — activity
 * at bookkeeper, members at admin, registrations at owner-plus-operator. So a
 * viewer whose sidebar correctly hid Activity, Members and Firm registrations
 * still saw all three in ⌘K, on the surface most likely to be used in front of
 * a client. Nothing granted them anything (the destination's own RLS and its
 * door remain the wall — navigation.ts's own note) but ⌘K was telling a
 * professional that a room existed for them when it did not.
 *
 * WHY A JOIN AND NOT A `minimumRole` FIELD PER ROW. Adding a floor to each row
 * here would have been the third place a floor is written and the second place
 * it can rot. This file's OWN header records what that costs: the SYNC NOTE at
 * the top is the post-mortem of hand-maintaining a copy of the route tree, in
 * which ten of fifteen rows were wrong and one pointed at `/inbox`, a path no
 * `page.tsx` has ever served. So the floor is not written here — it is LOOKED UP
 * from the sidebar's registry by `href`, at module load, and a row whose href is
 * in neither registry THROWS at import time rather than shipping a row with no
 * floor. `routes.test.ts` re-asserts the equality per row so the guard is a
 * measurement and not only a construction.
 *
 * WHAT STAYS HERE. The presentational half a nav registry has no business
 * carrying: the ⌘K message key (`CommandPalette.go.routes.<id>` — deliberately
 * NOT the sidebar's own key, since "Firm home" and "Home" are different sentences
 * in different places), the fuzzy-match keywords, and `status`, which this file's
 * mechanical page-tree check owns both ways.
 */
const FIRM_ROUTE_PRESENTATION: readonly {
  id: string;
  /** The join key. Must equal a `FIRM_NAVIGATION` or `ADMIN_NAVIGATION` href. */
  href: string;
  status: CommandRouteStatus;
  keywords: string[];
}[] = [
  {
    id: "firmHome",
    href: "/",
    status: "built",
    keywords: ["home", "dashboard"],
  },
  {
    // TRUED (MBB-5, 2026-08-29): the href was `/inbox`, which no page.tsx has
    // ever served — `grep -rn "/inbox" apps/web` returned this line and nothing
    // else, and next.config.ts declares no redirects/rewrites. The real page has
    // been `app/(firm)/needs-you/page.tsx` since P3. Selecting the flagship
    // cross-client inbox from the app's universal entry point landed on Next's
    // bare 404, OUTSIDE the firm shell.
    id: "needsYou",
    href: "/needs-you",
    status: "built",
    keywords: ["needs you", "inbox", "exceptions", "proactive"],
  },
  {
    // TRUED (MBB-5): app/(firm)/clients/page.tsx is live.
    id: "clientRegister",
    href: "/clients",
    status: "built",
    keywords: ["clients", "register", "book of clients"],
  },
  {
    // TRUED (MBB-5): app/(firm)/activity/page.tsx is live.
    id: "firmActivity",
    href: "/activity",
    status: "built",
    keywords: ["activity", "receipts", "open register", "audit"],
  },
  {
    // TRUED (N3, independent review, port-wave T10, 2026-08-28): a page.tsx
    // has existed at /admin since P2 (the honest-empty shell) — this entry
    // was already stale before T10 touched the file. T10 is the train that
    // makes the surface real (the two sub-routes below), so it is the one
    // that trues the parent too, per §3.6's own rule: truing routes.ts is
    // part of a train's merge, never a later sweep.
    id: "admin",
    href: "/admin",
    status: "built",
    keywords: ["admin", "firm controls", "tiers", "metering"],
  },
  {
    // T10 (port-wave plan §4 T10): the compliance register, under /admin.
    id: "adminCompliance",
    href: "/admin/compliance",
    status: "built",
    keywords: ["compliance", "sst", "registration", "watch"],
  },
  {
    // T10 (port-wave plan §4 T10): the vendor identity binding governance
    // panel, under /admin.
    id: "adminVendorBindings",
    href: "/admin/vendor-bindings",
    status: "built",
    keywords: ["vendor", "binding", "identity", "propose", "sign", "revoke"],
  },
  {
    // P4-4/P4-6: the members, roles and invitations surface.
    id: "adminMembers",
    href: "/admin/members",
    status: "built",
    keywords: ["members", "roles", "rbac", "invites", "access"],
  },
  {
    // P4-5: the operator approval queue, under /admin.
    id: "adminRegistrations",
    href: "/admin/registrations",
    status: "built",
    keywords: ["registrations", "approvals", "operator", "queue"],
  },
  {
    // FS-8 PR-2 (裁-97): the firm-settings surface, under /admin — the
    // high-stakes threshold control + the capabilities honest note.
    id: "adminSettings",
    href: "/admin/settings",
    status: "built",
    keywords: ["settings", "threshold", "high stakes", "capabilities", "owner"],
  },
];

/**
 * The floors, by href, from the TWO registries the sidebar itself reads. Built
 * once at module load. `ADMIN_NAVIGATION` is folded in after `FIRM_NAVIGATION`
 * and their hrefs are disjoint (`/admin` vs `/admin/*`), so there is no
 * precedence question to get wrong.
 */
const NAVIGATION_FLOOR_BY_HREF = new Map<string, { minimumRole: MemberRole; operatorOnly?: true }>(
  [...FIRM_NAVIGATION, ...ADMIN_NAVIGATION].map((entry) => [
    entry.href,
    entry.operatorOnly
      ? { minimumRole: entry.minimumRole, operatorOnly: entry.operatorOnly }
      : { minimumRole: entry.minimumRole },
  ]),
);

/** Firm-altitude surfaces (Q3). Always offered, regardless of current route —
 *  subject to the caller's rank, which `command-palette.tsx` applies with the
 *  sidebar's own `hasNavigationAccess`. */
export const FIRM_ROUTES: FirmCommandRoute[] = FIRM_ROUTE_PRESENTATION.map((row) => {
  const floor = NAVIGATION_FLOOR_BY_HREF.get(row.href);
  if (!floor) {
    // FAIL CLOSED AT IMPORT, not at render. A Go row with no floor would be a
    // row nothing filters — the exact defect C-43 is. Throwing here makes the
    // build/first-import the place it is caught, and `routes.test.ts` executes
    // this module, so it is caught by the suite too.
    throw new Error(
      `⌘K Go row "${row.id}" points at ${row.href}, which is in neither FIRM_NAVIGATION nor ADMIN_NAVIGATION — a Go row must be a navigable surface with a known rank floor.`,
    );
  }
  return {
    id: row.id,
    scope: "firm",
    href: row.href,
    status: row.status,
    keywords: row.keywords,
    ...floor,
  };
});

/**
 * Client-workspace tabs (Q3). Offered only when the current URL resolves a
 * `clientId` (see `resolveClientIdFromPathname` below) — ⌘K never invents a
 * client to navigate into.
 */
// TRUED (MBB-5, 2026-08-29): all seven workbench tabs below read `status:
// "planned"` while every one of them has had a real page.tsx mounting a real
// workbench since P3 (#364/#367) and the port wave. `messages/en.json`'s
// `plannedBadge` resolves to the literal string "Not built yet", so ⌘K told
// every user the entire shipped product was unbuilt.
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
    status: "built",
    keywords: ["journals", "entries", "je", "drafts"],
  },
  {
    id: "documents",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/documents`,
    status: "built",
    keywords: ["documents", "ocr", "evidence", "upload"],
  },
  {
    id: "bank",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/bank`,
    status: "built",
    keywords: ["bank", "reconciliation", "statement", "matching"],
  },
  {
    id: "close",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/close`,
    status: "built",
    keywords: ["close", "period", "fiscal year"],
  },
  {
    // P6-T (裁-34): the Tax tab IA shell — three honest NotBuiltNotes on
    // this tip (Track B paused, 裁-80). "built" is correct per this file's
    // own contract: the row asserts a page.tsx exists at the href, not that
    // every panel inside it has a live backend door.
    id: "clientTax",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/tax`,
    status: "built",
    keywords: ["tax", "sst", "cp204", "income tax", "computation"],
  },
  {
    id: "reports",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/reports`,
    status: "built",
    keywords: ["reports", "statutory", "export"],
  },
  {
    id: "registers",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/registers`,
    status: "built",
    keywords: ["registers", "aging", "fixed assets", "advances"],
  },
  {
    id: "knowledge",
    scope: "client",
    href: (clientId) => `/clients/${clientId}/knowledge`,
    status: "built",
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
