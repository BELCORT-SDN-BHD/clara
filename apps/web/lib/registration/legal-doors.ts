// `clara.accept_legal_document(p_kind, p_version, p_body_sha256, p_op_key)` —
// the governed write behind the signup journey's legal stage (migration 0185).
// It replaces `sign_dpa`, which survives on the database only as a deprecated
// wrapper and is called from nowhere in this app any more.
//
// A CLIENT CALL, exactly as `sign_dpa` was and for the same reason: the caller
// is the person, the door is governed, and the call carries no server-only
// value (unlike `POST /checkout`, whose origin digest IS the rate wall's key
// and may never travel to a browser). `signup-firm-form.tsx` already calls
// `claim_identity` / `request_firm_registration` this way.
//
// THREE THINGS THIS FUNCTION MUST NOT DO:
//
//  · `params.bodySha256` IS FORWARDED VERBATIM — never recomputed, never
//    re-read from a fresh `get_current_legal_documents()` call inside here. It
//    is the hash of the exact bytes the stage rendered to the person, and the
//    door's re-validation of it (`CLR10` / `hash_mismatch`) is the only thing
//    binding an acceptance to what the accepter actually saw.
//  · `params.opKey` IS THE CALLER'S, minted once per (kind, version) attempt
//    and held by the component. Minting one here would hand every retry of a
//    lost response a new identity, which is the whole property the key exists
//    for: a resubmit after a dropped answer must REPLAY, not double-accept.
//  · NOTHING IS RETRIED HERE. A `DoorRefusal` is the DB's considered answer
//    (apps/web/AGENTS.md); it is classified and handed up, never re-attempted.
//
// THE REFUSALS ARE CLASSIFIED BY CODE **AND** REASON, not by sentence. `0185`
// raises `CLR10` with `detail.reason` of `invalid_kind` or `hash_mismatch`,
// `CLR09` with `not_published` or `stale_version`, and `CLR04` for an unknown
// actor. `lib/wire.ts` already parses the DETAIL's `reason` discriminant off
// every refusal, so this module reads that field rather than matching prose —
// the same discipline `sign_dpa`'s caller used, now with a discriminant to
// read instead of a message to guess from.

import { callDoor, isDoorRefusal } from "@/lib/doors";

import type { LegalKind } from "./legal-reads";

export const ACCEPT_LEGAL_DOCUMENT_DOOR = "accept_legal_document";

/** The two reasons that mean "what you were shown is no longer what the DB
 *  holds" — the caller must RE-READ the documents and present the new version
 *  rather than retrying the same submission. */
export const STALE_ACCEPT_REASONS = ["stale_version", "hash_mismatch"] as const;

export type AcceptLegalDocumentParams = {
  readonly documentKind: LegalKind;
  readonly version: number;
  readonly bodySha256: string;
  /** Minted and held by the CALLER, one per (kind, version) attempt. */
  readonly opKey: string;
};

export type AcceptLegalDocumentOutcome =
  | {
      readonly kind: "accepted";
      readonly documentKind: LegalKind;
      readonly version: number;
      readonly acceptedAt: string;
      /** The door's own `already_accepted` status: true when this call found an
       *  existing acceptance rather than recording one. A replayed resubmit
       *  after a lost response lands here, and the person is told so rather
       *  than being shown a second receipt for one act. */
      readonly replay: boolean;
    }
  /** A governed refusal, carried VERBATIM — code and sentence untouched. */
  | {
      readonly kind: "refused";
      readonly code: string;
      readonly reason: string | null;
      readonly message: string;
      /** `reason` is one of `STALE_ACCEPT_REASONS`: the stage must re-read and
       *  show the new version, not offer the same submission again. */
      readonly stale: boolean;
    }
  /** Transport, auth, or a response this build will not act on. Distinct from a
   *  refusal: nothing was decided, so a resubmit under the same op key is
   *  meaningful and safe. */
  | { readonly kind: "unavailable" };

export type AcceptLegalDocument = (
  params: AcceptLegalDocumentParams,
) => Promise<AcceptLegalDocumentOutcome>;

export function isStaleAcceptReason(reason: string | null): boolean {
  return reason !== null && (STALE_ACCEPT_REASONS as readonly string[]).includes(reason);
}

/** THE PRODUCTION IMPLEMENTATION. */
export const acceptLegalDocument: AcceptLegalDocument = async (params) => {
  try {
    const out = await callDoor<Record<string, unknown>>(ACCEPT_LEGAL_DOCUMENT_DOOR, {
      p_kind: params.documentKind,
      p_version: params.version,
      p_body_sha256: params.bodySha256,
      p_op_key: params.opKey,
    });
    const status = out?.status;
    const acceptedAt = out?.accepted_at;
    const version = out?.version;
    const documentKind = out?.kind;
    // POSITIVELY CHECKED. A 200 that carries no acceptance is not evidence that
    // one exists, and the one thing this UI must never do is show a receipt for
    // a row nobody wrote (apps/web/AGENTS.md).
    if (status !== "accepted" && status !== "already_accepted") return { kind: "unavailable" };
    if (documentKind !== params.documentKind) return { kind: "unavailable" };
    if (typeof acceptedAt !== "string" || acceptedAt.length === 0) return { kind: "unavailable" };
    if (typeof version !== "number" || !Number.isInteger(version)) return { kind: "unavailable" };
    return {
      kind: "accepted",
      documentKind: params.documentKind,
      version,
      acceptedAt,
      replay: status === "already_accepted",
    };
  } catch (err) {
    if (isDoorRefusal(err)) {
      const reason = err.reason ?? null;
      return {
        kind: "refused",
        code: err.code ?? "CLR",
        reason,
        message: err.message,
        stale: isStaleAcceptReason(reason),
      };
    }
    return { kind: "unavailable" };
  }
};
