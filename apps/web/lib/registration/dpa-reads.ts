// clara.dpa_documents — the C-1 table (PR #478, `UNNUMBERED_checkout_gate_c1_
// dpa.sql`) this train's DPA step reads from. NOT ON MAIN as this Lane-A PR
// ships; §478's own migration grants `clara_authenticated` NOTHING on this
// table (owner-only RLS, zero application-role grants — its header says so
// explicitly: "C-1 creates no human door and grants no application role
// direct table access"). So a browser read of this relation fails TODAY for
// two independent, and eventually overlapping, reasons: the relation does
// not exist yet, and once it does, nothing grants a read path to it. This
// module treats both identically — see `loadCurrentDpaDocumentState` in
// `./dpa-server-reads.ts` for the honest "unavailable" degrade.
//
// THE C-1 SHAPE, measured off the live migration text rather than assumed
// from the design packet's part-2 sketch (which omitted a body column even
// though part 3 needs the exact bytes shown to the signer):
//
//   clara.dpa_documents(version text primary key, body text not null,
//     body_sha256 bytea not null, source_path text not null,
//     effective_from timestamptz not null, effective_to timestamptz,
//     created_at timestamptz not null default now())
//   -- uq_dpa_documents_current: a partial unique index on (true) where
//   -- effective_to is null — AT MOST ONE current row.
//
// `body` IS THE EXACT TEXT TO RENDER. There is no repo-file read here: the
// row's own `source_path` is provenance metadata (which file the seeded body
// came from), never a path this app fetches at request time — `apps/web`
// runs on Cloudflare Workers and has no filesystem access to `docs/` at all,
// and even on a Node target reading arbitrary repo paths from a request
// handler would be the wrong layer for it. The DB is the one system of
// record for what the signer is shown (part 2 §1.1's own words: "of the
// EXACT text served to a signer").

import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

export const DPA_DOCUMENTS_RELATION = "dpa_documents";

export const DPA_DOCUMENT_COLUMNS = [
  "version",
  "body",
  "body_sha256",
  "effective_from",
  "effective_to",
] as const;

export const DPA_DOCUMENTS_SELECT = DPA_DOCUMENT_COLUMNS.join(",");

export type DpaDocumentRow = {
  readonly version: string;
  readonly body: string;
  /** PostgREST's own text rendering of `bytea` (`\x`-prefixed hex). Opaque
   *  here — nothing in this train recomputes or compares it; `sign_dpa`
   *  (Lane B) is the door that will. */
  readonly body_sha256: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
};

/** Runtime decoder — transport output is untrusted until every field's shape
 *  is positively checked, the same discipline `isRegistrationRequestRow`
 *  applies to the registration read. */
export function isDpaDocumentRow(value: unknown): value is DpaDocumentRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.version === "string" &&
    row.version.length > 0 &&
    typeof row.body === "string" &&
    row.body.length > 0 &&
    typeof row.body_sha256 === "string" &&
    typeof row.effective_from === "string" &&
    (row.effective_to === null || typeof row.effective_to === "string")
  );
}

/**
 * The CURRENT document — `effective_to IS NULL`, of which the partial unique
 * index guarantees at most one. Returns `null` for "no current row" (a
 * legitimate, honest answer — e.g. every version has been superseded, or the
 * read succeeded against zero rows); throws (a `ReadError`, from `getRows`)
 * for a genuine transport/grant failure, exactly like every other read in
 * this app. The caller (`./dpa-server-reads.ts`) is the one that decides
 * both outcomes render the same honest "unavailable" card.
 */
export async function loadCurrentDpaDocument(
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<DpaDocumentRow | null> {
  const rows = await getRows<unknown>(DPA_DOCUMENTS_RELATION, {
    select: DPA_DOCUMENTS_SELECT,
    filters: { effective_to: "is.null" },
    order: "effective_from.desc",
    limit: 1,
    session,
    signal,
  });
  const row = rows[0];
  return isDpaDocumentRow(row) ? row : null;
}
