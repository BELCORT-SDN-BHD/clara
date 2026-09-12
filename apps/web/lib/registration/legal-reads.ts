// THE TWO LEGAL DOCUMENTS — `clara.get_current_legal_documents()` (migration
// 0185), the door that replaces `get_current_dpa_document()` for every surface
// in this app.
//
// WHY A SECOND KIND CHANGES THE SHAPE RATHER THAN ADDING A SECOND READ.
// `dpa_documents` had no `kind` column at all, so the old read could answer
// only "the one current agreement", and the step that rendered it had to admit
// in print that the terms of service existed as a text nobody was asked to
// accept. The new door returns ONE ROW PER KIND PRESENT — `terms` and
// `dpa` — each carrying its own version, publication status, body, hash and
// THIS CALLER'S acceptance of THAT version. A kind may be absent entirely
// (nothing seeded), and that is a legitimate answer, not a read failure.
//
// A READ THAT RIDES `callDoor`, LABELLED AS ONE (apps/web/AGENTS.md: "a
// read-flavoured RPC still rides `callDoor` as transport but is NOT a governed
// act — label it as a read at the call site"). Nothing here treats the answer
// as a receipt; the only receipt on this journey is `accept_legal_document`'s,
// and it lives in `./legal-doors.ts`.
//
// `body` IS THE EXACT TEXT TO RENDER, `body_sha256` THE EXACT HASH TO SUBMIT
// BACK, AND NOTHING HERE RECOMPUTES EITHER. The door refuses `CLR10` with
// `detail.reason = "hash_mismatch"` when the submitted hash disagrees with the
// row's own — the wall that binds an acceptance to the bytes the person was
// actually shown. Recomputing on this side would make that wall agree with
// itself unconditionally.
//
// `status` IS NOT COSMETIC. `draft` means placeholder text: it is rendered as
// a clearly-labelled preview that CANNOT be accepted (`accept_legal_document`
// refuses `CLR09` / `not_published` anyway — the UI simply must not offer a
// control the DB will refuse, and must never let a person believe they have
// signed something that is still being written).

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** The door, by exact name. A constant so a cell asserts the SPELLING this
 *  module calls rather than re-typing it (review law 3). */
export const CURRENT_LEGAL_DOCUMENTS_DOOR = "get_current_legal_documents";

/** The two kinds this product asks a person to accept, in the order they are
 *  presented. Terms first: it is the agreement that governs the service, and
 *  the DPA is the annex about the data it processes. */
export const LEGAL_KINDS = ["terms", "dpa"] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export type LegalDocumentStatus = "draft" | "published" | "superseded";

export function isLegalKind(value: unknown): value is LegalKind {
  return typeof value === "string" && (LEGAL_KINDS as readonly string[]).includes(value);
}

/** One row of the door's result, exactly as `0185` declares it. */
export type LegalDocumentRow = {
  readonly kind: LegalKind;
  readonly version: number;
  readonly status: LegalDocumentStatus;
  readonly title: string;
  readonly body: string;
  /** A `text` column holding plain lowercase hex (0185 §A: the CHECK recomputes
   *  it from the body). OPAQUE here: forwarded to `accept_legal_document`'s
   *  `p_body_sha256` verbatim, never parsed, compared or recomputed on this side.
   *  Its SHAPE is checked (see `BODY_SHA256`) — that is a decode, not a
   *  recompute: it says "this is a sha256 hex digest", never "this is the
   *  digest of this body". */
  readonly body_sha256: string;
  readonly effective_from: string | null;
  readonly published_at: string | null;
  /** THIS CALLER's acceptance of THIS version, or null. The door — not this
   *  app — decides what counts as accepted. */
  readonly accepted_at: string | null;
  readonly accepted_version: number | null;
};

/** THE SHAPE 0185 GUARANTEES, and the ONLY thing checked about the hash here.
 *  `legal_documents.body_sha256` is `text not null` under
 *  `check (body_sha256 = encode(sha256(convert_to(body,'UTF8')),'hex'))`, so a
 *  row that actually came from the shipped door carries exactly 64 lowercase
 *  hex characters. Anything else — a `\x`-prefixed `bytea` rendering (the
 *  RETIRED `dpa_documents` shape), an uppercase digest, a truncated one — is
 *  a value `accept_legal_document` would refuse `CLR10 / hash_mismatch` on
 *  anyway, and forwarding it would spend an op key to learn that. Dropping the
 *  row instead is what the decoder already does for every other field it
 *  cannot vouch for. NOT a recompute: this never asserts the digest MATCHES
 *  the body, which is the door's wall and must stay the door's wall. */
const BODY_SHA256 = /^[0-9a-f]{64}$/;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value));
}

/** Runtime decoder — transport output is untrusted until every field's shape is
 *  positively checked, the same discipline `isRegistrationRequestRow` applies
 *  to the registration read. A row this build cannot read is DROPPED rather
 *  than half-rendered: a legal stage that painted a partial document would be
 *  asking somebody to accept bytes it could not vouch for. */
export function isLegalDocumentRow(value: unknown): value is LegalDocumentRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    isLegalKind(row.kind) &&
    typeof row.version === "number" &&
    Number.isInteger(row.version) &&
    (row.status === "draft" || row.status === "published" || row.status === "superseded") &&
    typeof row.title === "string" &&
    row.title.length > 0 &&
    typeof row.body === "string" &&
    row.body.length > 0 &&
    typeof row.body_sha256 === "string" &&
    BODY_SHA256.test(row.body_sha256) &&
    isNullableString(row.effective_from) &&
    isNullableString(row.published_at) &&
    isNullableString(row.accepted_at) &&
    isNullableInteger(row.accepted_version)
  );
}

/**
 * Every document the door returned, decoded. An empty array is an honest
 * answer ("nothing is seeded"); a genuine transport or authorisation failure
 * THROWS, exactly like every other read in this app, and
 * `./legal-server-reads.ts` is the caller that decides what a failure renders.
 */
export async function loadCurrentLegalDocuments(
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<LegalDocumentRow[]> {
  const rows = await callDoor<unknown>(CURRENT_LEGAL_DOCUMENTS_DOOR, {}, { session, signal });
  if (!Array.isArray(rows)) return [];
  return rows.filter(isLegalDocumentRow);
}

// ───────────────────────────────────────────────────────────────────────────
// THE DERIVATION — what a document LOOKS like right now, and whether checkout
// may open. It lives HERE, beside the read and its types, rather than in
// `./legal-server-reads.ts`, for one measured reason: the legal stage is a
// CLIENT component, and value-importing the server loader would drag
// `next/headers` into the browser bundle (`next build` refuses it outright).
// One derivation, read by the stage's cards, by its Continue control and by
// the server loader — never three ideas of "accepted" free to disagree.
// ───────────────────────────────────────────────────────────────────────────

/** The fields every PRESENT document carries, whatever its face. */
export type PresentLegalDocument = {
  readonly title: string;
  readonly version: number;
  readonly body: string;
  readonly bodySha256: string;
  readonly effectiveFrom: string | null;
};

/**
 * The five faces one legal document can wear, and there is no sixth:
 *
 *   accepted    this caller has accepted THIS version — a persistent receipt,
 *               no control, and one of the two halves the checkout gate needs
 *   acceptable  published and not yet accepted — the only face that carries an
 *               acceptance control
 *   draft       placeholder text still being prepared. Rendered as a LABELLED
 *               PREVIEW that cannot be accepted; the door would refuse it
 *               (`CLR09` / `not_published`) and offering the control anyway
 *               would be inviting somebody to sign an unfinished agreement
 *   superseded  a version that is no longer current — nothing to accept here.
 *               `get_current_legal_documents()` selects only `published` and
 *               `draft` rows, so this face is not reachable through that door
 *               today; it exists because `status` is a three-value column and a
 *               face this file could not name would be rendered as something it
 *               is not. Defensive, and labelled as such rather than pruned into
 *               a silent `else`.
 *   absent      no document of this kind exists at all
 */
export type LegalDocumentFace =
  | ({ readonly kind: LegalKind; readonly face: "accepted"; readonly acceptedAt: string; readonly acceptedVersion: number } & PresentLegalDocument)
  | ({ readonly kind: LegalKind; readonly face: "acceptable" } & PresentLegalDocument)
  | ({ readonly kind: LegalKind; readonly face: "draft" } & PresentLegalDocument)
  | ({ readonly kind: LegalKind; readonly face: "superseded" } & PresentLegalDocument)
  | { readonly kind: LegalKind; readonly face: "absent" };

export type LegalStageState =
  /** Exactly one face per kind in `LEGAL_KINDS`, in that order. */
  | { readonly kind: "ready"; readonly documents: readonly LegalDocumentFace[] }
  | { readonly kind: "unavailable" };

function present(row: LegalDocumentRow): PresentLegalDocument {
  return {
    title: row.title,
    version: row.version,
    body: row.body,
    bodySha256: row.body_sha256,
    effectiveFrom: row.effective_from,
  };
}

/**
 * One face per kind, derived from the door's rows and from nothing else.
 *
 * ACCEPTANCE IS THE DOOR'S FACT, AND IT IS VERSION-EXACT: `accepted_at` is
 * only honoured when `accepted_version` is the version this row actually
 * carries. A caller who accepted v1 of a document now at v2 is NOT accepted —
 * they are shown v2 with its control, which is exactly what
 * `accept_legal_document` would enforce anyway (`CLR09` / `stale_version`).
 */
export function legalFaces(rows: readonly LegalDocumentRow[]): LegalDocumentFace[] {
  return LEGAL_KINDS.map((kind): LegalDocumentFace => {
    const row = rows.find((candidate) => candidate.kind === kind);
    if (row === undefined) return { kind, face: "absent" };
    if (row.accepted_at !== null && row.accepted_version === row.version) {
      return {
        kind,
        face: "accepted",
        acceptedAt: row.accepted_at,
        acceptedVersion: row.accepted_version,
        ...present(row),
      };
    }
    if (row.status === "published") return { kind, face: "acceptable", ...present(row) };
    if (row.status === "draft") return { kind, face: "draft", ...present(row) };
    return { kind, face: "superseded", ...present(row) };
  });
}

/**
 * THE CHECKOUT GATE'S ONE QUESTION. True only when EVERY kind this product
 * asks for wears the `accepted` face. An unavailable read, an absent document
 * and a draft all answer false — absence of a document is never evidence that
 * nothing needs accepting.
 */
export function allLegalAccepted(state: LegalStageState): boolean {
  if (state.kind !== "ready") return false;
  return LEGAL_KINDS.every((kind) =>
    state.documents.some((doc) => doc.kind === kind && doc.face === "accepted"),
  );
}
