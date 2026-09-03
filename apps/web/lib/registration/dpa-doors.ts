// `clara.sign_dpa` — WIRED FOR REAL by FS-4 C-6 Lane B. Lane A's honest stub
// (which always answered `{kind:"unavailable"}` rather than fabricate a
// signature) has done its job and retires here.
//
// A CLIENT CALL, WHICH IS THE DESIGN'S OWN DECISION AND NOT AN OMISSION.
// checkout-gate-design part 1 §1.1 settles step ④ explicitly: "`sign_dpa` is
// called the same way ③ calls its doors — from the client, over PostgREST".
// The caller is the person, the door is governed, and `signup-firm-form.tsx`
// already calls `claim_identity` / `request_firm_registration` this way. It
// carries no server-only value — unlike ⑤, whose origin digest is the rate
// wall's key and therefore may never travel to a browser. If a later lane
// needs this server-side, it adds `POST /signup/dpa` as a route handler and
// registers it — never a Server Action.
//
// TWO THINGS THIS FUNCTION MUST NOT DO, both inherited from Lane A's contract
// and both still true now that the call is real:
//
//  · `params.bodySha256` IS FORWARDED VERBATIM. Never recomputed, never
//    re-read from a fresh `get_current_dpa_document()` call inside here. It is
//    the hash of the exact bytes `signup-dpa-form.tsx` rendered to the person.
//    The design's whole point (part 2 §1.1, "that last wall is the one that
//    matters"; 裁-90's byte-identity law) is that `sign_dpa` re-validates the
//    SUBMITTED hash against the row's current value and refuses `CLR10 the
//    signed text does not match the current agreement` on a mismatch — e.g.
//    the document was superseded between render and click. Recomputing here
//    would make the door agree with itself unconditionally and silently delete
//    the only thing binding a signature to what the signer saw.
//  · `params.opKey` IS THE CALLER'S, minted once per attempt and held in a
//    `useRef`. Minting one here would hand every retry of the same click a new
//    key. (`sign_dpa` is also structurally idempotent on `dpa_signatures`'
//    `unique (user_id, dpa_version)`, so a double-click replays rather than
//    double-signs — but the op_key contract is worth keeping right.)
//
// THE RETURN IS WIDENED, and 裁-107(a) is why it is widened NOW rather than
// left at Lane A's bare `{kind:"signed"}`. That ruling's rule: a dropped door
// PARAMETER is a defect by default, a dropped RETURN FIELD is a decision by
// default — and Lane A's own note named the field that would matter first
// ("`replay` is the field that will matter FIRST ... Lane B widens this arm
// when that receipt surface is built"). That surface is built here: the DPA
// step now has a next step to route a real signature to (checkout), and the
// difference between "we just recorded your signature" and "you had already
// signed this" is a sentence the person reads. `signature_id` and `signed_at`
// ride along as the receipt evidence this estate's discipline wants.

import { callDoor, isDoorRefusal } from "@/lib/doors";

export type SignDpaParams = {
  readonly version: string;
  readonly bodySha256: string;
  /** Minted and held by the CALLER (`signup-dpa-form.tsx`'s `useRef`), never
   *  by this function — see the header for why re-minting per call would be
   *  the wrong fix even though it type-checks. */
  readonly opKey: string;
};

export type SignDpaOutcome =
  | {
      readonly kind: "signed";
      readonly signatureId: string;
      readonly signedAt: string;
      /** The door's own `replay` marker: true when this call found an existing
       *  signature rather than minting one. */
      readonly replay: boolean;
    }
  /** A governed refusal, carried VERBATIM — `CLR10 unknown dpa version`,
   *  `CLR09 that dpa version is not current`, `CLR10 the signed text does not
   *  match the current agreement`, `CLR04` for an agent or unknown actor. The
   *  form renders the DB's own sentence; nothing here re-words it, and nothing
   *  retries it (apps/web/AGENTS.md). */
  | { readonly kind: "refused"; readonly code: string; readonly message: string }
  /** Transport, auth, or a response this build will not act on. Distinct from
   *  a refusal: nothing was decided, so a retry is meaningful. */
  | { readonly kind: "unavailable" };

export type SignDpa = (params: SignDpaParams) => Promise<SignDpaOutcome>;

export const SIGN_DPA_DOOR = "sign_dpa";

/** THE PRODUCTION IMPLEMENTATION. */
export const signDpa: SignDpa = async (params) => {
  try {
    const out = await callDoor<Record<string, unknown>>(SIGN_DPA_DOOR, {
      p_version: params.version,
      p_body_sha256: params.bodySha256,
      p_op_key: params.opKey,
    });
    const signatureId = out?.signature_id;
    const signedAt = out?.signed_at;
    // POSITIVELY checked. A 200 that carries no signature id is not evidence
    // that a signature exists, and the one thing this UI must never do is show
    // a receipt for a row nobody saw (apps/web/AGENTS.md: the UI never invents
    // a receipt).
    if (typeof signatureId !== "string" || signatureId.length === 0
      || typeof signedAt !== "string" || signedAt.length === 0) {
      return { kind: "unavailable" };
    }
    return { kind: "signed", signatureId, signedAt, replay: out?.replay === true };
  } catch (err) {
    if (isDoorRefusal(err)) {
      return { kind: "refused", code: err.code ?? "CLR", message: err.message };
    }
    return { kind: "unavailable" };
  }
};
