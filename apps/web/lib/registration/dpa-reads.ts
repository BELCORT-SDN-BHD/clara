// THE CURRENT DPA DOCUMENT — repointed by FS-4 C-6 Lane B from a relation read
// onto the real door, `clara.get_current_dpa_document()` (`0163`).
//
// WHAT LANE A MEASURED, AND WHY THE RELATION READ COULD NEVER HAVE WORKED.
// C-1 (`0158`) creates `clara.dpa_documents` with RLS enabled AND forced, one
// `clara_fn_owner` policy, and ZERO application-role grants — its own header
// says "C-1 creates no human door and grants no application role direct table
// access". That is the estate's blanket law for every table on this train
// (design part 2 §1), so `getRows("dpa_documents")` was not waiting for a
// grant that was coming; it was reading a relation that would never answer.
// C-3 healed the acknowledged build-order drift by adding the door, and the
// door is what this module now calls. `0163`'s own comment names this file as
// the door's frontend home.
//
// A READ THAT RIDES `callDoor`, LABELLED AS ONE (apps/web/AGENTS.md: "A
// read-flavoured RPC still rides `callDoor` as transport but is NOT a governed
// act — label it as a read at the call site"). `get_current_dpa_document()` is
// `stable`, writes nothing, and takes no arguments; `callDoor` is only the
// PostgREST transport here, and nothing in this module treats the answer as a
// receipt.
//
// THE SHAPE IS THE DOOR'S, NOT THE TABLE'S. `returns table(version, body,
// body_sha256, published_at)` — four columns, and `published_at` is the row's
// `effective_from` under the door's own name. There is no `effective_to` in
// the result and there must not be: the door's `where d.effective_to is null`
// IS the currency test, so a client-side re-check would be a second
// implementation of a predicate the DB already owns, free to disagree with it.
// PostgREST returns a set-returning function as an ARRAY, and the partial
// unique index `uq_dpa_documents_current` (on `(true) where effective_to is
// null`) is what makes "at most one" a database property rather than a hope.
//
// `body` IS THE EXACT TEXT TO RENDER, and `body_sha256` is the exact hash to
// submit back. `0158`'s own `ck_dpa_documents_body_sha` CHECK
// (`body_sha256 = sha256(convert_to(body,'UTF8'))`) means the two cannot
// disagree at rest, and 裁-90's byte-identity law is what `sign_dpa` enforces
// at signing time: the hash the person submits is compared against the current
// row's own, and a mismatch refuses `CLR10 the signed text does not match the
// current agreement`. Nothing here recomputes the hash — see `./dpa-doors.ts`
// for why recomputing it would delete the only thing binding a signature to
// the bytes the signer actually saw.
//
// THERE IS NO REPO-FILE READ. The row's `source_path` is provenance metadata
// (which file the seeded body came from) and is not returned by the door at
// all; `apps/web` runs on Cloudflare Workers and has no filesystem access to
// `docs/`. The DB is the one system of record for what a signer is shown.

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** The door, by exact name. Kept as a constant so a cell asserts the SPELLING
 *  this module actually calls rather than re-typing it (review law 3). */
export const CURRENT_DPA_DOCUMENT_DOOR = "get_current_dpa_document";

export type DpaDocumentRow = {
  readonly version: string;
  readonly body: string;
  /** PostgREST's own text rendering of `bytea` — `\x`-prefixed lowercase hex.
   *  OPAQUE here: it is forwarded to `sign_dpa`'s `p_body_sha256` verbatim and
   *  is never parsed, compared or recomputed on this side. */
  readonly body_sha256: string;
  /** The row's `effective_from`, under the door's own column name. */
  readonly published_at: string;
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
    row.body_sha256.length > 0 &&
    typeof row.published_at === "string"
  );
}

/**
 * The CURRENT document. Returns `null` for "no current row" — a legitimate,
 * honest answer (every version superseded, or the seed has not run) — and
 * throws for a genuine transport or authorisation failure, exactly like every
 * other read in this app. `./dpa-server-reads.ts` is the caller that decides
 * both outcomes render the same honest "unavailable" card, and the design
 * agrees: with no current row the step renders a `NotBuiltNote` and the
 * checkout control is ABSENT, not disabled-looking (part 3 §2, NIT-8).
 *
 * THE FAIL-CLOSED SUCCESSOR IS STRUCTURAL, not this function's manners: even
 * if a stale row somehow reached the form, `sign_dpa` refuses `unknown dpa
 * version` and `that dpa version is not current`, so no signature, no
 * checkout, no firm.
 */
export async function loadCurrentDpaDocument(
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<DpaDocumentRow | null> {
  const rows = await callDoor<unknown>(CURRENT_DPA_DOCUMENT_DOOR, {}, { session, signal });
  if (!Array.isArray(rows)) return null;
  const row = rows[0];
  return isDpaDocumentRow(row) ? row : null;
}
