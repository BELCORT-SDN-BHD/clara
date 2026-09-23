// 裁-17 ④ — WHERE A NEEDS-YOU ROW ACTUALLY LIVES.
//
// The inbox's only link was `/clients/<id>` — the workspace ROOT — for every one of the nine
// row kinds. A draft entry, an uncoded filing, a coding task and a lint finding each have a
// tab that owns them, and dropping a professional on the overview to hunt for it is the
// difference between an inbox that dispatches work and one that merely announces it.
//
// THE RULE THIS FILE OBEYS, AND WHY IT LOOKS CONSERVATIVE. A link is offered only when THIS
// checkout serves a page at the path — the same both-ways contract
// `lib/command/routes.ts` holds itself to, and for the same reason its own header records:
// a row pointing at a path nobody intends to build passed every earlier check and shipped a
// 404 on the most-demoed surface in the product. So:
//   * every href below is one of the CLIENT_ROUTES tabs, which `routes.test.ts` already
//     proves against the real `app/` tree, and ./needs-you-links.test.ts re-proves that this
//     module emits nothing outside that set;
//   * a row with no `client_id` gets NO link at all — every workbench tab is client-scoped,
//     so there is nowhere to send a firm-altitude row;
//   * a row kind with no owning tab keeps the workspace root, which is the honest answer for
//     a batch-level row (`seeding_proposal` is one row per CLIENT, not per object) rather
//     than a guess at a tab it does not belong to.
//
// ONE `?tab=` DESTINATION, AND IT IS NOT A DEEP LINK INTO AN OBJECT (#974's fix round). The
// registers workbench serves SIX views off one path and defaults to `aging` when `?tab=` is
// absent, so for a row whose verbs live on a NON-default view the bare path is the wrong place,
// not merely a vaguer one. `CLIENT_ROUTES` already names those views (`ACCOUNTING_ITEMS` carries
// the `tab` for each), so this is still "the tab that exists is the tab that is offered" — the
// view is simply named instead of defaulted. It says nothing about selecting a ROW, which is what
// the next paragraph still refuses.
//
// NO DEEP FRAGMENT, DELIBERATELY. The rows carry `entry_id`/`document_id`/`filing_id` and it
// is tempting to append `#entry-<id>`. Not one of the workbench tabs renders an anchor or
// reads a hash today (measured: zero `useSearchParams`-driven selection and zero
// `id={...}` anchors on a row in `components/journals`, `components/documents`,
// `components/registers`), so a fragment would be a link that LOOKS like it selects the
// object and does not. The tab is what exists; the tab is what is offered. When a tab learns
// to select a row from the URL, this map is where that lands.
//
// AND ONE DESTINATION THAT LOOKS BUILDABLE AND IS NOT — `work_question` (#659, withdrawn in that
// ticket's own fix round). A `work_question` row is one pending question a running accounting Work
// is parked on, and `/clients/:clientId/work/:workId` is a page this checkout really serves, so
// the deep link looks obviously right. The ROW cannot address it. `clara.list_review_queue`
// selects `wqi.task_id` — an `agent_tasks` id — while the accounting Work reaches the row only
// through `join clara.accounting_work wqw on wqw.id = wqi.work_id`, a DIFFERENT column of the same
// interruption that the row does not publish. A link built from `task_id` spells a Work-detail URL
// that resolves nothing (`lib/work/reads.ts`'s `getAccountingWork` answers null for an id that is
// not an `accounting_work.id`). So this kind keeps the workspace root, where it has always gone,
// and the RESIDUAL is against 0180's queue row rather than against this file: when
// `work_question_rows` publishes `work_id`, the link becomes buildable off THAT — never off
// `task_id`. `packages/db/tests/firm-portfolio-pack.test.mjs`'s
// `p659.links.work_question_row_cannot_address_its_work` measures both facts on a real parked Work
// and reds the day that column appears.

import type { ReviewQueueRow } from "@/lib/journals/types";
import { fixedAssetHref, type RegisterTab } from "@/lib/navigation/tree";

/** The client-workspace tab each row kind belongs to, as a path SUFFIX under
 *  `/clients/<clientId>`. `""` is the workspace root — the honest destination for a row that
 *  is not about one object on one tab. Keys are `REVIEW_QUEUE_ROW_KINDS` members; an
 *  unknown kind (a tenth the DB ships before this file learns it) falls through to the root,
 *  which is exactly the behaviour every row had before P6-5. */
//
// A NULL-PROTOTYPE MAP, deliberately. `row_kind` is a DB string reaching a bare index
// expression, and on an ordinary object literal `OWNING_TAB["constructor"]` resolves through
// the prototype chain to a FUNCTION — which `?? ""` happily accepts and a template literal
// then stringifies into an href. `components/firm/needs-you-affordances.tsx` already carries
// the same defence for the same column (and `needs-you-a11y.test.tsx` drives `constructor`
// and `toString` through the real inbox because of it); this is that discipline, not a new
// one. `Object.create(null)` removes the chain rather than filtering it, so there is no
// predicate here to get wrong.
/** The registers-workbench view that mounts `DepreciationAuthorityPanel` (#974). */
const FIXED_ASSETS_TAB: RegisterTab = "fixedAssets";

const OWNING_TAB: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, {
  // A draft journal entry is approved/revised/withdrawn on the journals workbench.
  draft: "/journals",
  // A filing with no coding, and the coding task itself, both act on the documents tab.
  uncoded_filing: "/documents",
  coding_task: "/documents",
  // An open question about a document is settled beside the document.
  open_question: "/documents",
  // #659 — REPOINTED. The comment that used to sit here said the SST watch "renders on the firm
  // admin compliance surface, which is NOT client-scoped", and that stopped being true when
  // `components/tax/SstWatchSection.tsx:114` began mounting `ComplianceWatchAffordance` on
  // `/clients/:id/tax`. The three acts (acknowledge, snooze, resolve) are a click away there, on
  // the client whose turnover crossed. The stale sentence is DELETED rather than softened: a
  // comment that explains a destination the file no longer chooses is worse than none.
  compliance_watch: "/tax",
  // A lint finding is raised against the books; the journals workbench is where it is fixed.
  lint_finding: "/journals",
  // Both "incomplete" kinds are register rows missing particulars. `fixed_asset_incomplete` is
  // REPOINTED by #639: the row carries the ASSET id in its shared `id` column
  // (0041's S4.9 splice says so in its own words), and since 0216 there is a real route that
  // selects that asset from the URL. This file's header named exactly that condition — "when a
  // tab learns to select a row from the URL, this map is where that lands" — so the suffix here
  // stays the register tab and `needsYouRowHref` narrows it to the detail below.
  fixed_asset_incomplete: "/registers",
  staff_advance_incomplete: "/registers",
  // #974 (0260) — THE ONE `?tab=` DESTINATION THIS MAP NAMES, and it is named rather than
  // defaulted for two reasons, not one. (a) A bare `/registers` is the AGING view
  // (`REGISTERS_DEFAULT_TAB`, lib/navigation/tree.ts), and the sign/withdraw controls this row
  // exists to dispatch to are `DepreciationAuthorityPanel`, mounted inside
  // `components/registers/fixed-assets-register.tsx` — the `?tab=fixedAssets` view. Sending the
  // row to the default view would land a professional one tab away from the only act the row
  // names. (b) #974's AC1 asks for an affordance "distinct from every other kind's"; the two
  // register kinds beside it already take the bare path, so sharing it would fail that line.
  // The tab is typed against `RegisterTab` rather than spelled inline, so renaming a workbench
  // view is a TYPECHECK failure here instead of a link that silently falls back to aging.
  depreciation_authority_pending: `/registers?tab=${FIXED_ASSETS_TAB}`,
  // #946 (0297) — the documents tab, SHARED with the three kinds above it and deliberately so.
  // A blocked payroll run is about ONE document that was read and did not post: the page whose
  // two readings disagreed, or the payslip to re-file once the missing account exists. Its
  // verbs are not on the journals workbench, because there is no entry yet — that absence is
  // the row. (`?tab=` is not used here: the documents tab has no view that selects a single
  // document from the URL, so naming one would be a link to a view that does not exist.)
  payroll_posting_blocked: "/documents",
  // #947 (0298) — the bank tab, bare (not `?tab=matching`). `PayrollSettlementsSection` mounts
  // inside the Matching view, which is where the act this row names — find the bank line, accept
  // it — actually lives, but `ACCOUNTING_ITEMS`'s own `bank` entry (lib/navigation/tree.ts)
  // names no `tab`, so `?tab=matching` is not a view `CLIENT_ROUTES` itself emits today
  // (this file's own test proves every query-carrying suffix against that set, the same way
  // `depreciation_authority_pending`'s `?tab=fixedAssets` is proven — adding the matching
  // symmetric entry for bank is scoped OUT of this ticket, recorded as a follow-up rather than
  // widening a shared navigation registry four other lanes touch this wave). A bare `/bank`
  // lands one tab away (the default is `accounts`) rather than zero, which is still the honest
  // answer today.
  payroll_net_pay_unsettled: "/bank",
});

/**
 * The href an inbox row should open, or `null` when there is nowhere honest to send it.
 *
 * `null` for a row with no `client_id`: every destination in this map is a tab under
 * `/clients/<clientId>`, so without one there is no page, and the caller renders no link
 * rather than a broken one.
 *
 * `task_id` IS ACCEPTED AND DELIBERATELY UNUSED — see the `work_question` note in this file's
 * header. Keeping it in the signature is how the next reader learns that the field is on the row,
 * was tried, and does not address a Work.
 */
export function needsYouRowHref(
  row: Pick<ReviewQueueRow, "row_kind" | "client_id"> & { id?: string | null; task_id?: string | null },
): string | null {
  if (!row.client_id) return null;
  // #639 — THE ONE DEEP DESTINATION THIS MAP OFFERS, and it is not a fragment: `id` on a
  // `fixed_asset_incomplete` row IS the asset id (0041 S4.9), and `/registers/assets/:assetId` is
  // a page this checkout really serves (routes.test.ts proves it against the real app/ tree). The
  // guard is deliberate: a row whose id is missing or malformed falls back to the register tab
  // rather than building a URL out of nothing.
  if (row.row_kind === "fixed_asset_incomplete" && typeof row.id === "string" && row.id.length > 0) {
    return fixedAssetHref(row.client_id, row.id);
  }
  const suffix = OWNING_TAB[row.row_kind] ?? "";
  return `/clients/${row.client_id}${suffix}`;
}

/** True when the row opens something more specific than the workspace root — the label
 *  changes with it ("Open the journals tab" vs "Open the client"), so a human knows where a
 *  click lands before making it. */
export function hasOwningTab(row: Pick<ReviewQueueRow, "row_kind">): boolean {
  return typeof OWNING_TAB[row.row_kind] === "string";
}

/** Every suffix this module can emit — the set ./needs-you-links.test.ts checks against
 *  `CLIENT_ROUTES`, so a tab renamed in one place cannot silently rot here. */
export function owningTabSuffixes(): string[] {
  return Array.from(new Set(Object.values(OWNING_TAB)));
}
