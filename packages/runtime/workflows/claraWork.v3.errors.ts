// @frozen
//
// FROZEN — part of the claraWork_v3 closure (#631). THE REPAIR ROUTER, v3.
//
// IT IS A DELEGATION, NEVER A SECOND TABLE — the discipline v2's own header states, applied again.
// v2's classifier is asked first (which asks v1's first), and exactly THREE pairs are overridden
// afterwards, so "every v1 and v2 mapping is preserved" is true BY CONSTRUCTION rather than by a
// transcription that would drift the first time either table gained a row.
//
// THE THREE PAIRS, AND WHY EACH ONE IS WRONG UNDER THE INHERITED DEFAULT.
//
//   (CLR13, work_cancelled) → CANCELLED.  0184's posting core raises this when the Work is
//     `stopping`/`cancelled`, or when its task carries `cancel_requested`. v1's table has no entry
//     for it, so the CLR13 default classifies it `state_changed` — "the world moved under a safe
//     re-read", i.e. RETRYABLE inside the loop. It is not: a cancelled Work stays cancelled, the
//     model re-plans against a wall, and every replan the router grants is SPENT (#737: up to
//     `budgets.replans` refused model turns before `budget_exhausted → failed` finally translates
//     to `cancelled`). The honest kind is `cancelled` — terminal, with `agent_tasks.error_code`
//     NULL and the Work settling `cancelled`, which is what a human who pressed Stop is owed.
//
//   (CLR13, work_settled) → REFUSAL.  Raised when the Work already reached a terminal state. Also
//     `state_changed` under the default, and also not: the Work is finished and a re-read returns
//     the same terminal row forever. `refusal` is TERMINAL for the loop and RECOVERABLE by a human
//     — a Retry mints a NEW run on a NEW identity, which is exactly the act that can succeed.
//
//   (CLR13, egress_not_authorized) → REFUSAL.  #631's own: migration 0195's posting core refuses a
//     run that holds no consumed, un-withdrawn `accounting_work` authorisation. Under the default
//     it would be `state_changed`, and the model would be handed another turn to "try again" —
//     spending the client's authorised model budget on a run that is, by construction, no longer
//     authorised to call a model at all. `refusal` stops the loop at once. It is RECOVERABLE in
//     the strict sense the kind means (a Retry after the firm accepts the current agreements, or
//     after the client is re-activated, genuinely succeeds) and the human-facing face says so
//     WITHOUT naming a provider.
//
// WHY IT IS LEGAL TO ADD A FROZEN FILE HERE AND NOT TO EDIT v1's OR v2's. Freezing binds a
// DEPLOYED closure: a run parked on a v1 or v2 hook must find those bodies unchanged when it
// resumes (ARCHITECTURE Appendix A). claraWork_v3 is not deployed yet, so its own files are still
// being written; v1's and v2's are not touched by a byte.

import {
  budgetExhaustedPayload,
  classifyWorkError as classifyWorkErrorV2,
  taskErrorCodeFor,
  workErrorPayload,
  workOutcomeFor,
  type WorkErrorClass,
  type WorkErrorKind,
} from "./claraWork.v2.errors.js";

export { budgetExhaustedPayload, taskErrorCodeFor, workErrorPayload, workOutcomeFor };
export type { WorkErrorClass, WorkErrorKind };

/** The typed reason 0195's posting core raises when this run holds no consumed model-egress
 *  authorisation. Spelled ONCE, here, so the classifier, the trace writer and the web roster
 *  cannot drift apart on a string. */
export const EGRESS_NOT_AUTHORIZED = "egress_not_authorized";

/** The `(errcode, detail.reason)` pairs v3 classifies DIFFERENTLY from v2, with the kind each
 *  takes. Closed, tiny, and keyed on the same pair the database actually hands back. */
const V3_OVERRIDES: ReadonlyArray<readonly [string, string, WorkErrorKind]> = Object.freeze([
  ["CLR13", "work_cancelled", "cancelled"],
  ["CLR13", "work_settled", "refusal"],
  ["CLR13", EGRESS_NOT_AUTHORIZED, "refusal"],
]);

/**
 * THE ROUTER, v3. Pure — an error object in, a classification out.
 *
 * v2 (and through it v1) decides everything except the three overridden pairs above. The override
 * rewrites only `kind` and the two consequences that follow from it (`terminal`, `recoverable`),
 * never the code, the reason or the message: those are the DATABASE's own words and this module
 * has no standing to reword them.
 */
export function classifyWorkError(error: unknown): WorkErrorClass {
  const base = classifyWorkErrorV2(error);
  for (const [code, reason, kind] of V3_OVERRIDES) {
    if (base.code !== code || base.reason !== reason) continue;
    // EVERY FIELD NAMED, never `{...base, kind}` — the parts-parity census refuses an object
    // spread it cannot classify (check-parts-parity.mjs:320), because a spread is exactly how an
    // unreviewed `type:` discriminant reaches a transcript part without anyone seeing it.
    return {
      kind,
      code: base.code,
      reason: base.reason,
      message: base.message,
      terminal: kind === "refusal" || kind === "conflict" || kind === "cancelled" || kind === "invariant",
      recoverable: kind !== "conflict" && kind !== "invariant",
    };
  }
  return base;
}

/**
 * THE REFUSAL A RUN SETTLES WITH WHEN THE DISPATCH ITSELF WAS REFUSED — i.e. before any model was
 * called at all, so there is no database error to classify.
 *
 * NO PROVIDER DISCLOSURE, and that is the acceptance line rather than a style choice: "revoked,
 * exhausted or wrong-purpose authorization yields a typed non-retryable Work state WITHOUT
 * provider disclosure". The message names the AGREEMENT and the CLIENT, which is what an owner can
 * act on; it names no vendor, no model id and no internal reason token beyond the typed one.
 *
 * `recoverable: true` is honest and is not a contradiction of "non-retryable": the RUN is over and
 * the loop gets no further turn, and a human's Retry after the firm accepts the current agreements
 * — or after the client is made active again — genuinely succeeds. What would be dishonest is
 * offering a Retry that must fail identically forever, which is what `authority_lost` correctly
 * refuses to do.
 */
export function egressRefusalPayload(): Record<string, unknown> {
  return {
    code: "CLR13",
    reason: EGRESS_NOT_AUTHORIZED,
    message:
      "Clara is not currently authorised to use a model on this client's books, so this Work was "
      + "stopped before anything was sent and nothing was posted. An owner can restore it by "
      + "accepting the current Terms and Data Processing Agreement for the firm, and by making "
      + "sure this client is active.",
    recoverable: true,
  };
}
