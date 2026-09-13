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
