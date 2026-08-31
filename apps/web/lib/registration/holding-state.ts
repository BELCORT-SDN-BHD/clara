// THE HOLDING STATE'S DECISION — which of the six renderings /pending owes a
// caller, derived from the SELF-scope read and NOTHING else.
//
// Extracted from the page as a pure function on purpose: this is the judgement
// logic of design §4 E (it decides WHAT IS TRUE of a person), and a decision
// living inside a Server Component's body can only be exercised through a live
// request scope. Here every branch — including the two nobody wants to see — is
// driven directly by `tests/holding-state.test.ts`, and each has a RED-before
// mutant. A fail-closed branch nobody has watched close is a branch nobody has
// seen work (review law 1).
//
// SIX RENDERINGS, NOT THREE — a scope note, reported rather than folded away.
// The order names three: pending · rejected-with-its-reason · invite-expected.
// The read can positively return three more facts, and collapsing any of them
// into one of the three would be this module reporting something it did not
// observe (review law 2):
//
//   `approved`     `firm_registration_requests_visible.status` admits
//                  'open' | 'approved' | 'rejected' (the base table's CHECK,
//                  0145:330). An approved applicant reaching /pending is a real
//                  state — the scope spine sent them here, so their session
//                  still carries no membership even though their request was
//                  granted. Calling that "invite-expected" would tell someone
//                  their firm does not exist when the DB says it does.
//   `unidentified` `loadOwnRegistrationRequests` returns `{ok: false,
//                  reason: "no_session"}` when the caller could not be
//                  verified. That is NOT the same as "you have no requests" —
//                  its own module's header records exactly this distinction —
//                  and rendering it as invite-expected would confidently tell a
//                  signed-in applicant their pending application does not exist
//                  on nothing more than a claims blip.
//   `read-failed`  the read threw. Loading, empty and error are three
//                  distinguishable states (order §0.5); an empty holding page
//                  over a failed read is a defect the Wave-A reviews caught by
//                  name.
//
// The order's "and nothing else" is about the page's FURNITURE — no stepper, no
// ETA, no cross-sell (the Mobbin grounding §1's three named anti-patterns) — and
// that clause is obeyed literally. It is not a cap on how many true things the
// read can say.
//
// STATUS IS THE DB's WORD, NOT THE SCREEN's. The DB says 'open'; the screen says
// "pending". `lib/registration/reads.ts`'s header records the same split from
// the read side. The translation happens HERE, once, in the copy layer — never
// by re-writing what the row said.
//
// PREVIOUS ASYMMETRY (native security review of #461, round 2): this mapper
// trusted `getRows<RegistrationRequestRow>` as if a TypeScript generic decoded
// the HTTP response. `readCallerContextForSubject` in `lib/identity/doors.ts`
// already validated every hydrated column AND rebound the row to the verified
// subject. The holding read did neither, even though it decides what is true of
// the same person. `isRegistrationRequestRow` and the subject comparison below
// close that asymmetry; a 200 carrying a partial or foreign row is a denial.

import type {
  RegistrationRequestRow,
} from "./reads";
import type { OwnRegistrationResult } from "./server-reads";
import type { CallerContextDenial } from "@/lib/identity/doors";

export type HoldingState =
  /** An open request. `firmName` is the DB's, verbatim. */
  | { readonly kind: "pending"; readonly firmName: string }
  /** Decided against, carrying the DB's OWN reason — or honestly reporting that
   *  no reason was recorded, which is a different thing from an empty one. */
  | { readonly kind: "rejected"; readonly firmName: string; readonly reason: string | null }
  /** Decided for, but this session still has no membership. */
  | { readonly kind: "approved"; readonly firmName: string }
  /** A verified caller with NO requests at all — the ordinary case for someone
   *  waiting on an invite into an existing firm. */
  | { readonly kind: "invite-expected" }
  /** The caller could not be verified. Fail-closed, and NOT emptiness. */
  | { readonly kind: "unidentified" }
  /** The read did not succeed. Fail-closed, and NOT emptiness. */
  | {
      readonly kind: "read-failed";
      readonly reason?: CallerContextDenial | "read_error";
    };

/** The page redirects on a positively observed membership; the other six
 * decisions are renderable holding states. */
export type HoldingDecision = HoldingState | { readonly kind: "member" };

/** Runtime decoder for ALL TEN columns declared by
 * `REGISTRATION_REQUESTS_SELECT`. A typed `getRows<T>` call does not validate
 * bytes supplied by an HTTP peer, so nothing below may inspect status or copy
 * text until this predicate has positively seen every field's shape. */
export function isRegistrationRequestRow(
  value: unknown,
): value is RegistrationRequestRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.applicant === "string" &&
    typeof row.firm_name === "string" &&
    (row.note === null || typeof row.note === "string") &&
    typeof row.status === "string" &&
    (row.decided_by === null || typeof row.decided_by === "string") &&
    (row.decided_at === null || typeof row.decided_at === "string") &&
    (row.reason === null || typeof row.reason === "string") &&
    (row.firm_id === null || typeof row.firm_id === "string") &&
    typeof row.created_at === "string"
  );
}

/**
 * NEWEST FIRST, AND ONLY THE NEWEST DECIDES.
 *
 * `loadRegistrationRequestsForApplicant` orders `created_at.desc` and returns a
 * LIST, because decided rows accumulate: a rejected applicant who requests again
 * genuinely has two (`uq_firm_registration_requests_open_applicant` caps only
 * the OPEN ones, 0145:340-341). The screen reports where the person stands
 * TODAY, which is the newest row — never a scan for the nicest status, and never
 * a claim that there is exactly one row.
 *
 * The ordering is the DB's, not re-derived here: re-sorting client-side would be
 * a second implementation of the same ordering, free to disagree with the first.
 */
export function holdingStateFrom(
  result: OwnRegistrationResult,
  verifiedSubject: string | null = result.ok ? result.subject : null,
): HoldingDecision {
  if (!result.ok) return { kind: "unidentified" };
  const context: unknown = result.context;
  if (typeof context !== "object" || context === null || !("ok" in context)) {
    return { kind: "read-failed", reason: "malformed" };
  }
  if (context.ok === true) return { kind: "member" };
  if (context.ok !== false || !("reason" in context) || typeof context.reason !== "string") {
    return { kind: "read-failed", reason: "malformed" };
  }
  if (context.reason !== "no_membership") {
    return { kind: "read-failed", reason: context.reason as CallerContextDenial };
  }
  const newest = result.rows[0];
  if (newest === undefined) return { kind: "invite-expected" };
  if (!isRegistrationRequestRow(newest)) {
    return { kind: "read-failed", reason: "malformed" };
  }
  if (newest.applicant !== verifiedSubject) {
    return { kind: "read-failed", reason: "wrong_subject" };
  }

  switch (newest.status) {
    case "open":
      return { kind: "pending", firmName: newest.firm_name };
    case "rejected":
      // `reason` is nullable on the base table (0145:333). Passed through as
      // null rather than defaulted to a sentence: "no reason was recorded" and
      // "the reason is "" " are different facts, and the renderer says which.
      return { kind: "rejected", firmName: newest.firm_name, reason: newest.reason };
    case "approved":
      return { kind: "approved", firmName: newest.firm_name };
    default:
      // A STATUS THIS BUILD HAS NEVER SEEN. `RegistrationRequestStatus` is
      // deliberately widened to `string` in ./reads.ts so an added value reaches
      // here instead of crashing — and the fail-closed answer is to admit the
      // row is unreadable, not to guess which of the three known states it most
      // resembles. A new status added by a migration will land here loudly.
      return { kind: "read-failed" };
  }
}
