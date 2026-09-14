// `?report=<uuid>` — the Reports tab's item address (#719's Reports half).
//
// WHAT WAS MISSING. The Reports page read no search parameters at all, so nothing could address one
// report: a link could only ever name the tab and leave the reader to find the row. The Activity
// feed's own link builder said so in its header. Journals has `?entry=`, Documents has `?document=`
// (lib/documents/url-state.ts); this is the third, written to the same three rules.
//
// THE VALUE IS SHAPE-CHECKED BEFORE IT IS USED, for the reason `lib/client-id.ts` exists: a
// malformed id reaching a PostgREST `id=eq.<value>` filter on a uuid column is a 400 `22P02` that
// THROWS. Nothing here issues that read — the page filters an already-loaded list — but the check
// still earns its place: a hand-edited or stale URL is a NOT-FOUND question, and answering it as one
// keeps the surface's three states apart rather than folding a typo into "no such report".
//
// WHAT IT ADDRESSES IS A `clara.report_artifacts` ROW, not a report RUN. The artifact is what the
// tab renders one card per, what a download is offered for, and what carries the id a link can
// name; `report_run_id` is a field ON that card. A parameter named after the run would address a
// group rather than the thing on screen.

import { isUuidShape } from "@/lib/client-id";

/** What `?report=` currently says, as three distinct answers rather than two. `"malformed"` is not
 *  folded into `none`: a URL carrying `?report=not-a-uuid` is a person following a stale or
 *  hand-edited link, and they are owed the not-found state rather than the whole list with no
 *  explanation of why their link did nothing. */
export type ReportUrlSelection =
  | { kind: "none" }
  | { kind: "report"; id: string }
  | { kind: "malformed"; raw: string };

export const REPORT_PARAM = "report";

export function parseReportParam(raw: string | null | undefined): ReportUrlSelection {
  if (raw === null || raw === undefined || raw.trim().length === 0) return { kind: "none" };
  if (!isUuidShape(raw)) return { kind: "malformed", raw };
  return { kind: "report", id: raw };
}
