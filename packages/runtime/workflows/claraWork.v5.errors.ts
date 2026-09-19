// @frozen
//
// FROZEN — part of the claraWork_v5 closure. THE REPAIR ROUTER, v5.
//
// IT IS A DELEGATION WITH EXACTLY ONE OVERRIDE — v3's discipline, applied again. v4's classifier
// is asked (which asks v3's, which asks v2's, which asks v1's) and its answer is returned
// unchanged for every pair but one, so "every v1, v2, v3 and v4 mapping is preserved" is true BY
// CONSTRUCTION rather than by a transcription that would drift the first time any of those tables
// gained a row.
//
// THE ONE ROW, AND IT IS THE ROW v4's OWN HEADER SAID A LATER READER WOULD LOOK FOR.
//
//   (CLR40, fa_cost_adjustment_deferred) → REFUSAL.  Rider #882(a).
//
// WHAT IT IS. `clara._tf_fa_movement_belt` (0041:2727-2731) raises it when an entry CREDITS an
// enrolled fixed-asset COST account with no disposal proposal behind it — the supplier
// credit/rebate class, which rides a `supplier_credit_note` kind that does not exist yet. The door
// does not merely refuse: it states the v1 remedy in its own message, "reverse the acquisition
// entry and re-book it at the corrected cost", which is carried VERBATIM below rather than
// re-worded, because a governed refusal is the database's considered answer.
//
// WHY THE INHERITED DEFAULT IS WRONG FOR IT. CLR40 appears in no `(code, reason)` table in v1…v4,
// so it falls to `claraWork.v1.errors.ts`'s step 5 — "anything nobody designed for is a VISIBLE
// fault" — and classifies `invariant`. That settles the Work `failed` / `internal` and
// NOT RECOVERABLE. Every one of those three is false here: nothing is broken, the database made a
// considered accounting decision, and a human holding the remedy the door just handed them can act
// on it and re-run. An `invariant` tells that person "something is wrong with Clara" and offers
// them no Retry — over a refusal that named the fix in its own sentence. `refusal` settles the
// Work `refused` with `agent_tasks.error_code = 'tool_error'`, terminal for the loop (the model
// does not get another attempt with mutated figures — it must not, because the whole point is that
// this ADJUSTMENT SHAPE is not admitted) and `recoverable: true`, which is what a human's Retry
// after the reverse-and-rebook genuinely is.
//
// AND THE OTHER TWO CLR40 REASONS ARE DELIBERATELY NOT ADDED. `fa_k_gl_balance_on_enrolled`
// (0041:2717) and `fa_belt_unregistered_movement` (0041:2733) keep today's `invariant` reading.
// #882(a)'s stanza names them here precisely so the integrator does not widen a one-row rider into
// a three-row reclassification: those two are raised at a DIFFERENT wall (an opening leg on an
// enrolled account; a movement with no register act behind it at all), and whether a human's Retry
// can succeed after either is a question that belongs to whoever owns that lane, not to a cut made
// for something else. One row was ruled; one row ships.
//
// THE ADJACENCY IS THE FA BELT, NOT THE CLR38 DEPRECIATION FAMILY. Stated because the two look
// alike from a distance and are not: CLR38 is the depreciation AUTHORITY ladder (#651's lane,
// `chatTurn_v21`'s door), and this is the movement belt that guards the register's own accounts.
// A future row about a depreciation authority does not belong in this table.
//
// WHY THIS FILE'S OTHER HALVES EXIST IF THEY ADD NOTHING. Two reasons, both v4's. First, the
// closure must not reach into a predecessor for its ERROR CONTRACT by accident: v5's impl and
// tools import from HERE. Second, `particularsPendingNote` and `questionNotOpenedPayload` are
// v4's bodies and are re-exported BY IMPORT rather than copied — a second copy of a settle payload
// is how two versions come to tell a human two different things about one situation.

import {
  budgetExhaustedPayload,
  classifyWorkError as classifyWorkErrorV4,
  egressRefusalPayload,
  particularsPendingNote,
  questionNotOpenedPayload,
  taskErrorCodeFor,
  workErrorPayload,
  workOutcomeFor,
  EGRESS_NOT_AUTHORIZED,
  type WorkErrorClass,
  type WorkErrorKind,
} from "./claraWork.v4.errors.js";

export {
  budgetExhaustedPayload,
  egressRefusalPayload,
  particularsPendingNote,
  questionNotOpenedPayload,
  taskErrorCodeFor,
  workErrorPayload,
  workOutcomeFor,
  EGRESS_NOT_AUTHORIZED,
};
export type { WorkErrorClass, WorkErrorKind };

/** The typed reason 0041's fixed-asset movement belt raises for a cost credit on an enrolled
 *  account. Spelled ONCE so the classifier, the cell that proves the settle and any later reader
 *  cannot drift apart on a string. */
export const FA_COST_ADJUSTMENT_DEFERRED = "fa_cost_adjustment_deferred";

/** The `(errcode, detail.reason)` pairs v5 classifies DIFFERENTLY from v4, with the kind each
 *  takes. Closed, one row, and keyed on the same pair the database actually hands back. */
const V5_OVERRIDES: ReadonlyArray<readonly [string, string, WorkErrorKind]> = Object.freeze([
  ["CLR40", FA_COST_ADJUSTMENT_DEFERRED, "refusal"],
]);

/**
 * THE ROUTER, v5. Pure — an error object in, a classification out.
 *
 * v4 (and through it v3, v2 and v1) decides everything except the one overridden pair above. The
 * override rewrites only `kind` and the two consequences that follow from it (`terminal`,
 * `recoverable`), NEVER the code, the reason or the message: those are the DATABASE's own words —
 * including the remedy sentence this rider exists to carry — and this module has no standing to
 * reword them.
 */
export function classifyWorkError(error: unknown): WorkErrorClass {
  const base = classifyWorkErrorV4(error);
  for (const [code, reason, kind] of V5_OVERRIDES) {
    if (base.code !== code || base.reason !== reason) continue;
    // EVERY FIELD NAMED, never `{...base, kind}` — the parts-parity census refuses an object
    // spread it cannot classify, because a spread is exactly how an unreviewed `type:`
    // discriminant reaches a transcript part without anyone seeing it.
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
 * The payload a run settles with when the CLIENT'S GOVERNED KNOWLEDGE COULD NOT BE READ (#658,
 * D16 as ratified by DECISIONS §6.2.0 R-D).
 *
 * WHY THIS IS A TERMINAL AND NOT A SHRUG, WHICH IS WHERE v4 LEFT IT. v4 read
 * `clara.get_knowledge_pack` and carried on when the read failed, on the reasoning that "a Work's
 * authority is its ADMITTED BASIS and a context read may not decide the accounting"
 * (`knowledge-conflicts.mjs:93-98`). That reasoning was sound for a RECENCY DUMP and is not sound
 * for a core-first governed read: the whole point of `clara.retrieve_knowledge` is that the CORE
 * tier is what this client's work always needs — the currency, the framework, the policies the
 * firm recorded — and posting to a client's books while unable to see any of it is a confident
 * mistake rather than a graceful degradation.
 *
 * IT FIRES ON ANY `{status:'unavailable'}` ANSWER, AND THAT IS NOT A SIMPLIFICATION. The door is
 * ATOMIC: `clara.retrieve_knowledge` decides all three tiers in one CTE chain in one statement and
 * catches nothing, so it either answers with every tier or raises. There is no per-tier
 * readability signal, this module must not be written as though there were, and the five reasons
 * (`refused`, `read_failed`, `malformed`, `no_client`, `no_purpose`) are the five ways that one
 * event arrives. A `{status:'ok'}` answer never fires it, however small `tiers.core` is: a core of
 * zero on a client that genuinely has no policies recorded is not a failure, and treating it as
 * one would stop every Work for every new client.
 *
 * `recoverable: true` AND NOTHING POSTED. The read is taken before the model loop, so there is no
 * committed effect to be honest about, and a Retry after the read succeeds genuinely works.
 */
export function knowledgeReadFailedPayload(clientId: string, reason: string | null): Record<string, unknown> {
  const named = reason === null || reason === "" ? "unknown" : reason;
  return {
    code: "knowledge_read_failed",
    reason: named,
    message:
      `This Work stopped before it started: the client's recorded knowledge could not be read (${named}), `
      + "so Clara could not see the rules this firm has written down for this client. NOTHING WAS POSTED. "
      + "This is a read that did not succeed, not a client with nothing recorded — retry once the read works.",
    client_id: clientId,
    recoverable: true,
  };
}
