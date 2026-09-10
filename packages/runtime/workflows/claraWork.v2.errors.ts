// @frozen
//
// FROZEN — part of the claraWork_v2 closure (#629). THE REPAIR ROUTER, v2.
//
// THIS FILE EXISTS FOR EXACTLY ONE PAIR, AND THE PAIR IS NOT THIS TICKET'S OWN.
//
// The manual-journal lane's migration 0182 (#634) teaches `clara._record_journal_entry_core` a NEW
// typed refusal at COMMIT: `CLR13` with `detail.reason = 'source_conflict'` — the document ref the
// Work was admitted against no longer holds, because the filing was retired or because another
// posted entry now claims it. `claraWork.v1.errors.ts` is FROZEN, has no entry for that pair, and
// classifies every unrecognised CLR13 as `state_changed`. That default is right for the pairs it
// was written for (a task transition, a not-yet-retryable Work — both safe to re-read) and WRONG
// for this one: the basis a Work was admitted against is IMMUTABLE for that run, so a re-read
// returns the same document and the same refusal, and every replan the router grants is spent
// proving that. The honest classification is `refusal`: TERMINAL for the loop, RECOVERABLE by a
// human who fixes the source and presses Retry, which makes a NEW run with a NEW basis.
//
// IT IS A DELEGATION, NEVER A SECOND TABLE. v1's classifier is asked first and exactly one pair is
// overridden afterwards, so "every v1 mapping is preserved" is true BY CONSTRUCTION rather than by
// a transcription that would drift the first time v1's table gained a row. The four settle helpers
// are re-exported by identity for the same reason: two vocabularies for `refused` is how a Work
// row and a task row come to disagree about what happened.
//
// WHY IT IS LEGAL TO ADD A FROZEN FILE HERE AND NOT TO EDIT v1's. Freezing binds a DEPLOYED
// closure: a run parked on a v1 hook must find v1's bodies unchanged when it resumes
// (ARCHITECTURE Appendix A). claraWork_v2 is not deployed yet, so its own files are still being
// written; v1's are not touched by a byte.

import {
  budgetExhaustedPayload,
  classifyWorkError as classifyWorkErrorV1,
  taskErrorCodeFor,
  workErrorPayload,
  workOutcomeFor,
  type WorkErrorClass,
  type WorkErrorKind,
} from "./claraWork.v1.errors.js";

export { budgetExhaustedPayload, taskErrorCodeFor, workErrorPayload, workOutcomeFor };
export type { WorkErrorClass, WorkErrorKind };

/** The `(errcode, detail.reason)` pairs v2 classifies DIFFERENTLY from v1, with the kind each
 *  takes. Closed, tiny, and keyed on the same pair the database actually hands back — the
 *  F-A2 pair-classifier discipline v1's own header states, applied to the delta rather than to a
 *  copy of the whole roster. */
const V2_OVERRIDES: ReadonlyArray<readonly [string, string, WorkErrorKind]> = Object.freeze([
  // 0182 (#634) — the Work's document ref no longer holds at commit. TERMINAL and RECOVERABLE:
  // `refusal` is the one kind that is both, and it is what a human can actually act on.
  ["CLR13", "source_conflict", "refusal"],
]);

/**
 * THE ROUTER, v2. Pure — an error object in, a classification out.
 *
 * v1 decides everything except the overridden pairs above. The override rewrites only `kind` and
 * the two consequences that follow from it (`terminal`, `recoverable`), never the code, the reason
 * or the message: those are the DATABASE's own words and this module has no standing to reword
 * them.
 */
export function classifyWorkError(error: unknown): WorkErrorClass {
  const base = classifyWorkErrorV1(error);
  for (const [code, reason, kind] of V2_OVERRIDES) {
    if (base.code !== code || base.reason !== reason) continue;
    return {
      ...base,
      kind,
      // The same two derivations v1's own `classified` makes from a kind, restated here because
      // v1 does not export it. A refusal is terminal for the loop and recoverable by a human.
      terminal: kind === "refusal" || kind === "conflict" || kind === "cancelled" || kind === "invariant",
      recoverable: kind !== "conflict" && kind !== "invariant",
    };
  }
  return base;
}
