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
  | "lifebuoy"
  | "receipt";

export type FirmNavId = "home" | "clients" | "work" | "documents" | "activity" | "operator" | "settings";

export type SettingsSectionId =
  | "account"
  | "firm"
  | "members"
  // #654 — the firm-wide Knowledge register.
  | "knowledge"
  // #648 (journey A5): the firm's own setup checklist. Distinct from `firm`, which is the
  // authority-controls surface 裁-187 emptied and 裁-188 will refill.
  | "setup"
  | "compliance"
  | "vendorBindings";

export type ClientNavId =
  | "home"
  | "work"
  | "documents"
  | "accounting"
  | "knowledge"
  | "reports";

export type AccountingItemId =
  | "journals"
  | "periodicAdjustments"
  | "staffExpenseClaims"
  | "prepayments"
  | "bank"
  | "receivables"
  | "assets"
  | "plans"
  | "accruals"
  | "accounts"
  | "close"
  | "tax";

/**
 * A LEAF is a destination BELOW a client-nav row: it has its own address and its
 * own breadcrumb crumb, and it is deliberately NOT a menu entry.
 *
 * WHY IT IS IN THE REGISTRY AT ALL, given the sidebar never renders one. Because
 * the registry is the ONE answer to "where am I" — `resolveActive` has to keep
 * the parent row current while a leaf is open (a human composing a journal entry
 * is still under Accounting), and `breadcrumbFor` has to name the leaf rather
 * than stopping at its parent and claiming the human is on a page they are not.
 * A leaf written anywhere else would be the fifth hand-maintained copy this file
 * exists to have removed.
 *
 * THEY ARE NOT SIDEBAR ROWS, AND THAT IS THE POINT. `/…/accounting/journal/new`
 * is an ACT you arrive at from the Accounting hub, not a place you browse to;
 * `/…/work/:workId` names one durable record and cannot be a static menu entry
 * at all. Adding either to `CLIENT_NAV` would put a permanent row in the menu for
 * a page that is only ever reached with an intent.
 */
export type ClientLeafId =
  | "journalComposer" | "periodicAdjustment" | "staffExpenseClaim" | "tradeInvoice" | "workDetail"
  | "knowledgeRecord" | "counterpartyIdentity";

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

export type ClientLeaf = Floored & {
  readonly id: ClientLeafId;
  /** The `CLIENT_NAV` row that stays `aria-current` while this leaf is open. */
  readonly parent: ClientNavId;
  /** Key under the `AppShell` namespace — the leaf's own breadcrumb crumb. */
  readonly labelKey: `clientLeaf.${ClientLeafId}`;
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
 *  - operator: owner AND the caller's own firm carries `is_operator`
 *    (`clara.list_operator_support_queue`, `0188 §2` — the
 *    `approve_firm_registration` predicate byte for byte). #615.
 *  - settings: viewer, because the parent performs no read of its own and every
 *    child is independently filtered below.
 *
 * THE OPERATOR ROW IS FIRM-ALTITUDE, NOT A SETTINGS CHILD, and that is the
 * change #614's own provisional note anticipated. An operator's support queue is
 * estate-wide work about OTHER people's admission — registrations, payments and
 * provider problems — and it is not a property of the firm the operator happens
 * to be a member of. Journey D3's own requirement is not to merge operator
 * controls into normal client navigation, so it gets its own destination; the
 * `settings/registrations` section it replaces is gone from this registry, and
 * both old addresses 307 to `/operator` (`./legacy-routes.ts`).
 */
export const FIRM_NAV: readonly FirmNavItem[] = [
  { id: "home", href: "/", labelKey: "firmNav.home", icon: "house", minimumRole: "viewer" },
  { id: "clients", href: "/clients", labelKey: "firmNav.clients", icon: "users", minimumRole: "viewer" },
  { id: "work", href: "/work", labelKey: "firmNav.work", icon: "inbox", minimumRole: "viewer" },
  // #633 — the firm's unassigned sources. MEASURED FLOOR, not a chosen one: on the
  // #633 rig (clara_633, PG 17.11) a VIEWER persona reads
  // `clara.list_unassigned_documents(50)` successfully — it is SECURITY INVOKER, so
  // its floor is whatever RLS admits — while `record_client_resolution` refuses a
  // viewer CLR04 "insufficient role" and admits a bookkeeper. The destination is
  // therefore viewer-visible and the ACT's higher floor surfaces as the DB's own
  // refusal on the row, never as an empty page for someone who can legitimately look.
  { id: "documents", href: "/documents", labelKey: "firmNav.documents", icon: "files", minimumRole: "viewer" },
  { id: "activity", href: "/activity", labelKey: "firmNav.activity", icon: "activity", minimumRole: "bookkeeper" },
  {
    id: "operator",
    href: "/operator",
    labelKey: "firmNav.operator",
    icon: "lifebuoy",
    minimumRole: "owner",
    operatorOnly: true,
  },
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
 *
 * REGISTRATIONS HAS LEFT THIS LIST (#615). It was provisional here from the day
 * #614 moved it, with a note saying the operator destination might take it; it
 * did. The queue is now one arm of `/operator`'s estate-wide support queue, at
 * the same owner+operator floor it always had, and `/settings/registrations`
 * 307s there.
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
  // #654 — VIEWER, the floor `clara.list_firm_knowledge` itself takes (the same
  // floor `clara.list_client_knowledge` uses, 0192:1316). A firm default is the
  // firm's own standing rule and hiding the register from a viewer would grant
  // and revoke nothing; the PROMOTE act inside it is admin+ and the door
  // (`clara.capture_knowledge` at firm scope) rechecks that floor for itself.
  {
    id: "knowledge",
    href: "/settings/knowledge",
    labelKey: "sections.knowledge.title",
    purposeKey: "sections.knowledge.purpose",
    icon: "book",
    minimumRole: "viewer",
  },
  {
    // #648 (journey A5). admin, and the floor is written in two places on purpose: here, so the
    // section is ABSENT from a bookkeeper's menu by rank, and inside `clara.get_firm_setup` /
    // the four firm setup doors, so a deep link is refused by the database rather than by a menu.
    id: "setup",
    href: "/settings/setup",
    labelKey: "sections.setup.title",
    purposeKey: "sections.setup.purpose",
    icon: "clipboard",
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
  // #643 — the periodic stock adjustments and supplied payroll obligations this client has
  // recorded, with their particulars, their posted entry and their correction chain. It is its OWN
  // destination under `accounting/adjustments`, deliberately NOT `registers?tab=adjustments`: that
  // tab is the 0045 PLAN lane (templates, schedules, occurrences), and a periodic count has no
  // schedule and no template. One prefix for two unrelated lanes would make every later reader
  // guess which one a row belongs to — the same reason migration 0194 is `clara.periodic_adjustments`
  // and not `clara.adjustment_*`.
  { id: "periodicAdjustments", segment: "accounting/adjustments", labelKey: "accounting.periodicAdjustments", icon: "boxes", minimumRole: "viewer" },
  // #638 — the staff expense claims this client has recorded: who claimed, what they itemised, when
  // it was incurred, how it was settled. It is its OWN destination under `accounting/claims` and
  // NOT a view of the registers workbench, for the reason C6 forces: an employee payable is a
  // non-control liability plus this register, and it may not appear in the AR/AP aging tab at all
  // (0042 tail 20 forbids an employee counterparty, which is what an open item structurally is).
  // The advance half stays where it is, at `registers?tab=staffAdvances`, and the claim register
  // links across to it rather than re-drawing a statement panel that already ships.
  { id: "staffExpenseClaims", segment: "accounting/claims", labelKey: "accounting.staffExpenseClaims", icon: "receipt", minimumRole: "viewer" },
  { id: "bank", segment: "bank", labelKey: "accounting.bank", icon: "bank", minimumRole: "viewer" },
  { id: "receivables", segment: "registers", tab: "aging", labelKey: "accounting.receivables", icon: "scale", minimumRole: "viewer" },
  { id: "assets", segment: "registers", tab: "fixedAssets", labelKey: "accounting.assets", icon: "boxes", minimumRole: "viewer" },
  // #640 — REPOINTED from `registers?tab=adjustments` to its own route. Plans are no longer a
  // view of the registers workbench: `/clients/:id/plans` is the C9 list and
  // `/clients/:id/plans/:planId` is one plan's own durable address (a schedule, its authority,
  // its preview and its occurrence history is a detail destination, not a tab). The adjustment
  // register stays exactly where it was, reachable at `registers?tab=adjustments` through the
  // workbench's own SectionTabs — this row simply stops being the sidebar's name for it, which
  // is why the two tabs the sidebar already does not name keep working the same way.
  { id: "plans", segment: "plans", labelKey: "accounting.plans", icon: "route", minimumRole: "viewer" },
  // #652 — the client's evidenced accruals, with their service terms, their authority and their
  // reversal bindings. Its OWN top-level client segment beside `plans`, deliberately NOT under
  // `accounting/`: an accrual RIDES a `reversing_journal` plan (it accrues on a due date and
  // reverses on the first of the following month), which is a schedule and not a period-fact
  // adjustment. `accounting/adjustments` is #643's lane — a stock count or a supplied payroll
  // obligation, no schedule and no future occurrence — and one prefix for two unrelated lanes makes
  // every later reader guess which one a row belongs to.
  { id: "accruals", segment: "accruals", labelKey: "accounting.accruals", icon: "route", minimumRole: "viewer" },
  // #653 — the prepayments this client has RECOGNISED and the amortisation each one runs on. Its
  // own destination beside `plans` rather than a view of it: a prepayment schedule IS an
  // amortisation_schedule accounting plan, but what a person comes here for is the prepaid asset,
  // the term its document states and the period-by-period charge — which the generic plan surface
  // does not carry and should not learn.
  { id: "prepayments", segment: "prepayments", labelKey: "accounting.prepayments", icon: "route", minimumRole: "viewer" },
  { id: "accounts", segment: "registers", tab: "accounts", labelKey: "accounting.accounts", icon: "list", minimumRole: "viewer" },
  { id: "close", segment: "close", labelKey: "accounting.close", icon: "lock", minimumRole: "viewer" },
  { id: "tax", segment: "tax", labelKey: "accounting.tax", icon: "receipt", minimumRole: "viewer", beta: true },
] as const;

/**
 * THE TWO LEAVES, and the floor each one is written at.
 *
 *  - journalComposer: BOOKKEEPER. Not because a viewer cannot read a form, but
 *    because this page's whole purpose is to admit an accounting operation, and
 *    the write door behind it (`clara.admit_journal_work`, reached through the
 *    runtime's `POST /api/work/journal`) rechecks that the author is an ACTIVE
 *    bookkeeper-or-above with access to the client. Offering the composer to a
 *    viewer would be offering a control that can only ever refuse — 裁-187's
 *    ruling, which `lib/firm/capabilities.ts` states in full. The route itself
 *    still renders for a viewer, as the DENIED state rather than as a form: an
 *    address a human typed deserves an explanation, not a blank.
 *  - workDetail: VIEWER, matching its parent. It is a READ of one durable Work
 *    record, and `clara.accounting_work`'s own RLS policy is the wall.
 *
 * THE FLOOR IS LEGIBILITY, NOT AUTHORITY — the same sentence this file's header
 * makes about every other row. Hiding the hub's primary action from a viewer
 * grants and revokes nothing; the DB refuses either way.
 *
 * `workDetail`'S LABEL IS STILL A CONSTANT, AND THAT IS NOW A STATED LIMIT RATHER
 * THAN A FACT ABOUT THE COLUMN. This note used to say `clara.accounting_work.purpose`
 * carried a CLOSED ONE-MEMBER CHECK — true when it was written, stale since
 * migration 0194 widened it to three (`journal_entry`,
 * `periodic_stock_adjustment`, `payroll_obligation`). #638 corrects it rather
 * than leaving a reader to mis-scope the label work, and states what actually
 * holds today: the crumb is a static key because this module is pure functions
 * over a URL and holds no row, so a data-driven crumb needs the PAGE to pass the
 * label in. The Work list and the Work detail DO label every purpose, through
 * `lib/work/purpose-label.ts` — and a staff expense claim is labelled there from
 * `clara.get_work_claim_origin` rather than from a purpose value at all, because
 * a claim's purpose is deliberately the plain `journal_entry` every other manual
 * posting carries (migration 0221's header says why a fourth purpose cannot
 * post). So the crumb reading "Journal entry" on a claim Work is CORRECT, and
 * the remaining limit is only that a periodic adjustment's crumb says it too.
 */
export const CLIENT_LEAVES: readonly ClientLeaf[] = [
  { id: "journalComposer", parent: "accounting", labelKey: "clientLeaf.journalComposer", minimumRole: "bookkeeper" },
  // #643 — BOOKKEEPER, for `journalComposer`'s own reason: the write door behind it
  // (`clara.admit_periodic_adjustment_work`, bookkeeper+) can only ever refuse a viewer, and
  // offering a control that can only refuse is 裁-187's rule. The route still renders for a viewer
  // as the DENIED state rather than as a form. The HISTORY row above it is viewer, because reading
  // the client's own adjustments is the same class of act as reading their journals.
  { id: "periodicAdjustment", parent: "accounting", labelKey: "clientLeaf.periodicAdjustment", minimumRole: "bookkeeper" },
  // #638 — BOOKKEEPER, for `journalComposer`'s own reason: the write door behind it
  // (`clara.admit_staff_expense_claim_work`, bookkeeper+) can only ever refuse a viewer, and
  // offering a control that can only refuse is 裁-187's rule. The route still renders for a viewer
  // as the DENIED state rather than as a form. The HISTORY row above it is viewer, because reading
  // the client's own claims is the same class of act as reading their journals.
  { id: "staffExpenseClaim", parent: "accounting", labelKey: "clientLeaf.staffExpenseClaim", minimumRole: "bookkeeper" },
  // #655 — BOOKKEEPER, for `journalComposer`'s own reason: the write door behind it
  // (`clara.admit_trade_invoice_work`, bookkeeper+) can only ever refuse a viewer, and offering a
  // control that can only refuse is 裁-187's rule. The route still renders for a viewer as the
  // DENIED state rather than as a form. There is no history row beside it: the invoices a client
  // has recorded are read on /registers (the aging surface) and on /journals, both already built,
  // and #669 owns the outstanding tiles.
  { id: "tradeInvoice", parent: "accounting", labelKey: "clientLeaf.tradeInvoice", minimumRole: "bookkeeper" },
  { id: "workDetail", parent: "work", labelKey: "clientLeaf.workDetail", minimumRole: "viewer" },
  // #644 — /…/knowledge/:recordId names ONE knowledge record, so it is a leaf for the same
  // reason workDetail is: a durable record cannot be a static menu row, and the breadcrumb has to
  // name it rather than stopping at Knowledge and claiming the reader is on the register.
  { id: "knowledgeRecord", parent: "knowledge", labelKey: "clientLeaf.knowledgeRecord", minimumRole: "viewer" },
  // #647 — /…/knowledge/parties/:counterpartyId names ONE counterparty's identity, its source,
  // its correction history and its merge lineage. A leaf for `knowledgeRecord`'s own reason, and
  // VIEWER because reading who a supplier is, and who said so, is the same class of act as
  // reading the client's other knowledge; every write behind it is bookkeeper+ or admin+ and
  // refuses a viewer at the door rather than being hidden here.
  { id: "counterpartyIdentity", parent: "knowledge", labelKey: "clientLeaf.counterpartyIdentity", minimumRole: "viewer" },
  // #639's `/registers/assets/:assetId` REGISTERS NO LEAF, and the reason is the one #652 wrote
  // two rows below for its own `/accruals`. The branch shipped a `fixedAsset` row here parented on
  // `accounting`, but the path's FIRST segment is `registers` — a top-level `ACCOUNTING_ITEMS`
  // segment — so `resolveActive` answers that list on `rest[0]` alone and returns before
  // `CLIENT_NAV.find` / `leafFor` are ever reached. Measured at wave integration by #652's own
  // reachability wall (`tree.test.ts`), which is the first place the two branches met: the row
  // was a promise the resolver could not keep. The ROUTE and `fixedAssetHref` below are untouched
  // — the asset detail page is real and linked from the register row, the needs-you inbox and
  // the Work identity block; what it does not get today is its own crumb, and giving it one is a
  // nav change (the crumb builder reads a leaf only under `clientItem`, never under
  // `accountingItem`), not an integration repair. `AppShell.clientLeaf.fixedAsset` is left in
  // `messages/en.json` for that follow-up.
  // #652's `/accruals/new` and `/accruals/:accrualId` register NO leaf, for the reason `plans` —
  // the precedent this route was cut beside — registers none: `accruals` is a TOP-LEVEL
  // `ACCOUNTING_ITEMS` segment, and `resolveActive` answers that list on `rest[0]` alone and
  // returns before `CLIENT_NAV.find` / `leafFor` are reached. A row here would be a promise the
  // resolver cannot keep — and `tree.test.ts`'s reachability cell now refuses one.
] as const;

export function clientLeaf(id: ClientLeafId): ClientLeaf {
  return CLIENT_LEAVES.find((leaf) => leaf.id === id)!;
}

// ── hrefs ────────────────────────────────────────────────────────────────────

export function clientBase(clientId: string): string {
  return `/clients/${clientId}`;
}

/** `/clients/:clientId/accounting/journal/new` — the C3 composer. */
export function journalComposerHref(clientId: string): string {
  return `${clientBase(clientId)}/accounting/journal/new`;
}

/** `/clients/:clientId/accounting/adjustments/new` — the C8/C11 periodic-adjustment form. */
export function periodicAdjustmentHref(clientId: string): string {
  return `${clientBase(clientId)}/accounting/adjustments/new`;
}

/** `/clients/:clientId/accounting/claims` — the C3/C6 staff-expense-claim register (#638). */
export function staffExpenseClaimsHref(clientId: string): string {
  return `${clientBase(clientId)}/accounting/claims`;
}

/** `/clients/:clientId/accounting/invoices/new` — the C1/C3 trade-invoice form (#655). A SIBLING
 *  address of the journal composer and the claim form, never a tab on either: the three admit
 *  different operations through different doors, and a preparer arrives with an intent formed. */
export function tradeInvoiceHref(clientId: string): string {
  return `${clientBase(clientId)}/accounting/invoices/new`;
}

/** `/clients/:clientId/accounting/claims/new` — the C1/C3 claim form (#638). */
export function staffExpenseClaimHref(clientId: string): string {
  return `${clientBase(clientId)}/accounting/claims/new`;
}

/** `/clients/:clientId/registers?tab=staffAdvances` — the SHIPPED staff-advance register, which the
 *  claim register links across to rather than re-drawing. The tab is deliberately not a sidebar row
 *  (see `ACCOUNTING_ITEMS`' own header); a link from the surface that names an advance is exactly
 *  the entrance it was left reachable through. */
export function staffAdvancesHref(clientId: string): string {
  return `${clientBase(clientId)}/registers?tab=staffAdvances`;
}

/** `/clients/:clientId/work/:workId` — one durable Work record's own address.
 *  The id is percent-encoded here even though every caller holds a uuid: this
 *  function builds a URL, and a URL builder that trusts its input is how a
 *  malformed id becomes a malformed route. */
export function workDetailHref(clientId: string, workId: string): string {
  return `${clientBase(clientId)}/work/${encodeURIComponent(workId)}`;
}

/** `/clients/:clientId/knowledge/:recordId` — ONE knowledge record's own address. The id is the
 *  STABLE `record_id`, not a revision id, so the URL keeps meaning after a correction appends a
 *  revision. Percent-encoded for the reason `workDetailHref` states. */
export function knowledgeRecordHref(clientId: string, recordId: string): string {
  return `${clientBase(clientId)}/knowledge/${encodeURIComponent(recordId)}`;
}

/** `/clients/:clientId/knowledge/parties/:counterpartyId` — ONE counterparty's identity (#647).
 *  The `parties` segment is what keeps this path distinguishable from a knowledge RECORD id:
 *  `leafFor` answers `knowledgeRecord` for ANY two-segment path under `knowledge`, so a
 *  three-segment path with a literal middle is the only shape that can carry a second kind of
 *  detail without making `/knowledge/:recordId` ambiguous. Percent-encoded for the reason
 *  `workDetailHref` states. */
export function counterpartyIdentityHref(clientId: string, counterpartyId: string): string {
  return `${clientBase(clientId)}/knowledge/parties/${encodeURIComponent(counterpartyId)}`;
}

/** `/clients/:clientId/registers/assets/:assetId` — ONE fixed asset's own address (#639).
 *
 *  A REAL ROUTE SEGMENT UNDER THE REGISTER, not a second register and not a `?tab=`: the list
 *  stays at `registers?tab=fixedAssets` and this is the detail, on the `knowledge/:recordId`
 *  precedent. Percent-encoded for the reason `workDetailHref` states. */
export function fixedAssetHref(clientId: string, assetId: string): string {
  return `${clientBase(clientId)}/registers/assets/${encodeURIComponent(assetId)}`;
}

/** `/clients/:clientId/journals` — the posted-and-drafts surface. With an entry
 *  id it becomes the ONE address that opens the journal table on that entry, so
 *  a refusal that names an entry ("that document already backs a posted entry")
 *  has somewhere real to send a human, and Back returns them to what they were
 *  doing. The id is percent-encoded for the reason `workDetailHref` states. */
export function journalEntryHref(clientId: string, entryId?: string | null): string {
  const base = `${clientBase(clientId)}/journals`;
  return entryId ? `${base}?tab=posted&entry=${encodeURIComponent(entryId)}` : base;
}

export function clientNavHref(clientId: string, item: ClientNavItem): string {
  return item.segment === "" ? clientBase(clientId) : `${clientBase(clientId)}/${item.segment}`;
}

/** `/clients/:clientId/plans` — the C9 plan list (#640). */
export function plansHref(clientId: string): string {
  return `${clientBase(clientId)}/plans`;
}

/** `/clients/:clientId/plans/new` — the create form. A ROUTE rather than a Dialog because a plan
 *  carries a schedule, an authority and a full journal basis, and appendix C §4 sends a
 *  multi-section accounting form to a detail destination rather than an overlay. */
export function planCreateHref(clientId: string): string {
  return `${clientBase(clientId)}/plans/new`;
}

/** `/clients/:clientId/plans/:planId/revise` — the same form, superseding the live revision. */
export function planReviseHref(clientId: string, planId: string): string {
  return `${planDetailHref(clientId, planId)}/revise`;
}

/** `/clients/:clientId/plans/:planId` — one accounting plan's own address (#640). A plan's
 *  schedule, authority, next-occurrence preview and occurrence history is durable detail, so it
 *  is a ROUTE rather than a Sheet: Back works, the link in an occurrence row and the link from a
 *  Work's identity block are the same URL, and a reload lands on the same plan. The id is
 *  percent-encoded for the reason `workDetailHref` states. */
export function planDetailHref(clientId: string, planId: string): string {
  return `${clientBase(clientId)}/plans/${encodeURIComponent(planId)}`;
}

/** `/clients/:clientId/accruals` — the C08.1 accrual list (#652). */
export function accrualsHref(clientId: string): string {
  return `${clientBase(clientId)}/accruals`;
}

/** `/clients/:clientId/accruals/new` — the configuration form. A ROUTE rather than a Dialog because
 *  an accrual carries a term, a method, an authority and two account legs, and appendix C §4 sends
 *  a multi-section accounting form to a detail destination rather than an overlay. */
export function accrualCreateHref(clientId: string): string {
  return `${clientBase(clientId)}/accruals/new`;
}

/** `/clients/:clientId/accruals/:accrualId` — one accrual's own address (#652). Its particulars,
 *  its authority, its plan and its occurrence lineage are durable detail, so it is a ROUTE rather
 *  than a Sheet: Back works, and a reload lands on the same accrual. The id is percent-encoded for
 *  the reason `workDetailHref` states. */
export function accrualDetailHref(clientId: string, accrualId: string): string {
  return `${clientBase(clientId)}/accruals/${encodeURIComponent(accrualId)}`;
}

/** `/clients/:clientId/prepayments` — the C8/C9 prepayment list (#653). */
export function prepaymentsHref(clientId: string): string {
  return `${clientBase(clientId)}/prepayments`;
}

/** `/clients/:clientId/prepayments/new` — the configure form. A ROUTE rather than a Dialog for the
 *  reason `planCreateHref` gives: it carries a posted entry, a judged account with its stated
 *  grounds and a derived allocation preview, which appendix C §4 sends to a detail destination.
 *  `entry` prefills the recognition when a person arrives from an attention row. */
export function prepaymentCreateHref(clientId: string, entryId?: string): string {
  const base = `${clientBase(clientId)}/prepayments/new`;
  return entryId ? `${base}?entry=${encodeURIComponent(entryId)}` : base;
}

/** `/clients/:clientId/prepayments/:scheduleId` — one derived amortisation's own address (#653).
 *  Its allocation, its authority, its period-by-period execution and every refusal is durable
 *  detail, so it is a ROUTE: Back works, a link from an attention row and a link from the plan are
 *  the same URL, and a reload lands on the same schedule. */
export function prepaymentDetailHref(clientId: string, scheduleId: string): string {
  return `${clientBase(clientId)}/prepayments/${encodeURIComponent(scheduleId)}`;
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

/** Whether this caller's rank is offered a leaf's own entry point — the hub's
 *  primary action, the composer's form. Called with the SAME predicate every
 *  other row goes through, never a second rank comparison. */
export function canOpenClientLeaf(scope: NavigationScope, id: ClientLeafId): boolean {
  return hasNavigationAccess(scope, clientLeaf(id));
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
  /**
   * The LEAF below `clientItem`, when the URL names one. It ACCOMPANIES its
   * parent rather than replacing it — exactly as `settingsSection` accompanies
   * `firmItem: "settings"` — because the sidebar must keep marking the parent
   * row current while a human is on a leaf, and the breadcrumb is the only
   * surface that names the leaf itself. So this is not a second sidebar mark and
   * cannot collide with the one `aria-current` the sidebar renders.
   */
  readonly clientLeaf: ClientLeafId | null;
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
  clientLeaf: null,
} as const;

/**
 * Which LEAF, if any, the sub-path below a client-nav row names.
 *
 * EXACT LENGTHS, not prefixes. `/…/work/:workId/anything` is not the Work detail
 * — no page serves it — and answering "workDetail" for it would put a crumb on
 * the screen for a route that 404s. A deeper path resolves to its PARENT row with
 * no leaf, which is the honest reading: you are under Work, on a surface the tree
 * does not name.
 */
function leafFor(parent: ClientNavId, rest: readonly string[]): ClientLeafId | null {
  if (parent === "accounting" && rest.length === 3 && rest[1] === "journal" && rest[2] === "new") {
    return "journalComposer";
  }
  if (parent === "accounting" && rest.length === 3 && rest[1] === "adjustments" && rest[2] === "new") {
    return "periodicAdjustment";
  }
  // #638 — the claim FORM, the third member of the `accounting/<lane>/new` family above. The
  // branch registered the `staffExpenseClaim` leaf and its "Record staff expense claim" label but
  // never this arm, so the leaf resolved nowhere; #652's reachability wall caught it the first
  // time the two branches met, at wave integration. The claim LIST (`accounting/claims`) stays an
  // `ACCOUNTING_ITEMS` row and is matched two segments deep by `segment2`, exactly as
  // `accounting/adjustments` is.
  if (parent === "accounting" && rest.length === 3 && rest[1] === "claims" && rest[2] === "new") {
    return "staffExpenseClaim";
  }
  // #655 — the trade-invoice FORM, the fourth member of the same `accounting/<lane>/new` family.
  // Registered here in the SAME commit as its `CLIENT_LEAVES` row and its href helper, because
  // #638 proved what happens otherwise: a leaf whose arm nobody wrote resolves nowhere, and
  // `tree.test.ts`'s reachability wall only catches it once the branches meet. There is no
  // `accounting/invoices` LIST row: the invoices a client has recorded are read on /registers and
  // /journals, both already built.
  if (parent === "accounting" && rest.length === 3 && rest[1] === "invoices" && rest[2] === "new") {
    return "tradeInvoice";
  }
  if (parent === "work" && rest.length === 2) return "workDetail";
  // #647 — the three-segment arm sorts BEFORE the two-segment one only in reading order; the
  // exact-length rule keeps them disjoint, so `/knowledge/:recordId` and
  // `/knowledge/parties/:counterpartyId` can never answer each other's leaf.
  if (parent === "knowledge" && rest.length === 3 && rest[1] === "parties") return "counterpartyIdentity";
  if (parent === "knowledge" && rest.length === 2) return "knowledgeRecord";
  return null;
}

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
  // #643 — ONE accounting row sits two segments deep (`accounting/adjustments`), so the match is
  // against the joined pair as well as the first segment. EXACTLY two, never a prefix: a deeper
  // path under it is that row's own LEAF (`…/adjustments/new`), and marking the history row
  // current there would both lose the leaf's breadcrumb and put `aria-current` on a page the human
  // is not on.
  const segment2 = rest.length === 2 ? `${rest[0]}/${rest[1]}` : "";

  const accounting = ACCOUNTING_ITEMS.filter(
    (item) => item.segment === segment || (segment2 !== "" && item.segment === segment2));
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
      clientLeaf: leafFor(item.id, rest),
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
    if (active.clientLeaf === null) {
      return [firm, clients, clientCrumb, { kind: "message", ns: "AppShell", key: item.labelKey }];
    }
    // A LEAF DEEPENS THE TRAIL BY ONE, and its parent becomes a link — the row
    // the sidebar is still marking current is now an ancestor you can go back
    // to, which is exactly what a breadcrumb is for.
    const leaf = CLIENT_LEAVES.find((entry) => entry.id === active.clientLeaf)!;
    return [
      firm,
      clients,
      clientCrumb,
      { kind: "message", ns: "AppShell", key: item.labelKey, href: clientNavHref(clientId, item) },
      { kind: "message", ns: "AppShell", key: leaf.labelKey },
    ];
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
 *
 * A LEAF DOES NOT TRAVEL EITHER, and it falls out by construction rather than by
 * a rule: the client arm below rebuilds the destination from the `CLIENT_NAV`
 * ROW, never from the incoming path, so `/clients/A/work/<workId>` lands on
 * `/clients/B/work` and `/clients/A/accounting/journal/new` on
 * `/clients/B/accounting`. Both are the right answers for the same reason a
 * thread is not portable — `<workId>` names one client's record, and a
 * half-typed journal entry belongs to the client it was typed under (the draft
 * itself is keyed on that client too; see lib/work/journal-draft.ts).
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
