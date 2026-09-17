// `?document=<uuid>` — the Documents workbench's URL-state model (#719's Documents half).
//
// WHAT WAS WRONG. Selecting a filed document set React state and nothing else. A refresh lost it, a
// shared link could not name it, and the browser Back button did whatever the previous PAGE was —
// so a person who opened a document, read it, and pressed Back left the tab entirely. Every other
// detail surface in this app that is worth returning to already had this (`?event=` on Activity,
// `?tab=` on Registers, `?entry=` on Journals); the Documents aside was the one that did not, and
// the Activity feed's own link builder says so in its header.
//
// THE IDIOM IS ACTIVITY'S, DELIBERATELY (components/firm/activity/activity-feed.tsx:79-100):
// opening is a `router.push` so Back closes it, a page LOADED directly at `?document=` has no such
// history entry to pop and closes with `router.replace` instead, and every other query parameter on
// the URL survives both. The one difference is the shape of the value — Activity's `?event=` is a
// `<source>:<id>` pair because its rows come from three unions; a document is one table with one
// uuid primary key, so the parameter is the bare uuid and this module says nothing more about it.
//
// THE VALUE IS SHAPE-CHECKED BEFORE IT IS USED, for the reason `lib/client-id.ts` exists: a
// malformed id reaching a PostgREST `id=eq.<value>` filter on a uuid column is a 400 `22P02` that
// THROWS, so the page renders its error boundary instead of an honest "not available" state. A
// hand-edited or stale URL is a NOT-FOUND question, not a database one.

import { isUuidShape } from "@/lib/client-id";

/** What `?document=` currently says, as three distinct answers rather than two.
 *
 *  `"malformed"` is not folded into `null`: a URL carrying `?document=not-a-uuid` is a person
 *  following a stale or hand-edited link and they are owed the not-found state plus a URL that
 *  stops repeating the lie, whereas no parameter at all is simply "nothing is open". */
export type DocumentUrlSelection =
  | { kind: "none" }
  | { kind: "document"; id: string }
  | { kind: "malformed"; raw: string };

export const DOCUMENT_PARAM = "document";

export function parseDocumentParam(params: Pick<URLSearchParams, "get">): DocumentUrlSelection {
  const raw = params.get(DOCUMENT_PARAM);
  if (raw === null || raw.trim().length === 0) return { kind: "none" };
  if (!isUuidShape(raw)) return { kind: "malformed", raw };
  return { kind: "document", id: raw };
}

/** Folds a document selection onto an existing `URLSearchParams`, leaving every other parameter
 *  untouched and DELETING the key rather than writing `""` when nothing is selected — so the URL
 *  never accumulates a dead `?document=` across closes. Returns a NEW instance; the input is not
 *  mutated. (Both properties are Activity's `applyActivityUrlState`'s, for the same reasons.) */
export function applyDocumentParam(base: Pick<URLSearchParams, "toString">, documentId: string | null): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  if (documentId) next.set(DOCUMENT_PARAM, documentId);
  else next.delete(DOCUMENT_PARAM);
  return next;
}

/** `pathname` + the parameters, with the `?` only when there is something to put after it — a
 *  trailing bare `?` is a different string for the same address and makes a `router.replace` that
 *  should be a no-op into a real history write. */
export function documentUrl(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

// ---------------------------------------------------------------------------------------------
// `?tab=original|facts|accounting` — #646's routed views, on the SAME route.
//
// WHY A SECOND PARAMETER AND NOT A ROUTE SEGMENT. `?document=` is #624's published contract:
// `documents-viewer-walk.spec.ts` drives deep links and Back through it, and every shared link a
// professional has already sent names a document that way. A segment would be a MIGRATION of that
// contract; a second parameter is an ADDITION to it, and the three views are adjacent views of ONE
// object rather than three destinations — appendix C §4's own line about Tabs.
//
// THE SPELLING IS `tab`, DELIBERATELY, BECAUSE THE ESTATE ALREADY PUBLISHES IT.
// `components/registers/registers-workbench.tsx:31-41` reads `searchParams.get("tab")` behind a
// CHECKED default, and this module's own header lists that as the idiom it follows. Giving one
// concept two names on one surface is a net loss.
//
// THE DEFAULT IS CHECKED, never a cast: a hand-edited `?tab=ledger` is not an error state, it is
// simply not one of the three views, and the honest answer is to render Original. Unlike
// `?document=`, a malformed tab is NOT a distinct third answer — there is nothing to "not find",
// and telling someone their tab name was wrong would be noise on top of a page that is already
// showing them the document they asked for.

export const TAB_PARAM = "tab";

export const DOCUMENT_TABS = ["original", "facts", "accounting"] as const;
export type DocumentTab = (typeof DOCUMENT_TABS)[number];
export const DEFAULT_DOCUMENT_TAB: DocumentTab = "original";

export function isDocumentTab(value: string | null): value is DocumentTab {
  return (DOCUMENT_TABS as readonly string[]).includes(value ?? "");
}

/** What `?tab=` currently says, folded onto the three real views. */
export function parseDocumentTabParam(params: Pick<URLSearchParams, "get">): DocumentTab {
  const raw = params.get(TAB_PARAM);
  return isDocumentTab(raw) ? raw : DEFAULT_DOCUMENT_TAB;
}

/** Folds a tab selection onto existing parameters, leaving every other one untouched and DELETING
 *  the key for the default view rather than writing `?tab=original` — the URL for "the document,
 *  as it opens" stays exactly the link #624 published, so no existing deep link changes meaning
 *  and no history entry differs by a parameter nobody chose. Returns a NEW instance. */
export function applyDocumentTabParam(
  base: Pick<URLSearchParams, "toString">,
  tab: DocumentTab | null,
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  if (tab && tab !== DEFAULT_DOCUMENT_TAB) next.set(TAB_PARAM, tab);
  else next.delete(TAB_PARAM);
  return next;
}
