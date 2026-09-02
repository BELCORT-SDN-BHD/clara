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
// NO DEEP FRAGMENT, DELIBERATELY. The rows carry `entry_id`/`document_id`/`filing_id` and it
// is tempting to append `#entry-<id>`. Not one of the workbench tabs renders an anchor or
// reads a hash today (measured: zero `useSearchParams`-driven selection and zero
// `id={...}` anchors on a row in `components/journals`, `components/documents`,
// `components/registers`), so a fragment would be a link that LOOKS like it selects the
// object and does not. The tab is what exists; the tab is what is offered. When a tab learns
// to select a row from the URL, this map is where that lands.

import type { ReviewQueueRow } from "@/lib/journals/types";

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
const OWNING_TAB: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, {
  // A draft journal entry is approved/revised/withdrawn on the journals workbench.
  draft: "/journals",
  // A filing with no coding, and the coding task itself, both act on the documents tab.
  uncoded_filing: "/documents",
  coding_task: "/documents",
  // An open question about a document is settled beside the document.
  open_question: "/documents",
  // The SST compliance watch renders on the firm admin compliance surface, which is NOT
  // client-scoped — so this kind deliberately has no client tab and keeps the root.
  // A lint finding is raised against the books; the journals workbench is where it is fixed.
  lint_finding: "/journals",
  // Both "incomplete" kinds are register rows missing particulars.
  fixed_asset_incomplete: "/registers",
  staff_advance_incomplete: "/registers",
});

/**
 * The href an inbox row should open, or `null` when there is nowhere honest to send it.
 *
 * `null` for a row with no `client_id`: every destination in this map is a tab under
 * `/clients/<clientId>`, so without one there is no page, and the caller renders no link
 * rather than a broken one.
 */
export function needsYouRowHref(row: Pick<ReviewQueueRow, "row_kind" | "client_id">): string | null {
  if (!row.client_id) return null;
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
