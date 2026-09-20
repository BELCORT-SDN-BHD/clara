// THE TWO SYMBOLS A RESUME NEEDS, AND NOTHING ELSE — a deliberate LEAF (#852).
//
// `isHookNotFound` (is this the engine's single-shot "hook already gone" signal?) and
// `resumePayloadFor` (what does the workflow's hook expect to be handed?) are read by BOTH sides of
// the interruption estate:
//
//   ·  lib/control.mjs           — the control listener, which delivers a terminal clarify by
//                                  resuming its hook; and
//   ·  lib/reconciler-chat-clarify.mjs — the chat lane's reconcile belt, whose whole re-probe IS a
//                                  resume.
//
// THEY LIVE HERE BECAUSE OF THE IMPORT DIRECTION, and that is the entire reason this file exists.
// They were declared in control.mjs, and control.mjs imports `settleCancelledByKind` from
// reconciler.mjs — so the belt reading them from control.mjs closed
// `reconciler → reconciler-chat-clarify → control → reconciler` the moment the belt was registered
// inside `runReconcilerSweep` where every other belt lives. leader.mjs carried the belt outside the
// sweep for exactly that reason, and paid for it by leaving the belt's counters and failures off
// the sweep receipt (#852). Moving the two symbols to a leaf removes the edge instead of routing
// around it.
//
// THE DISCIPLINE THIS FILE IS UNDER: it imports NOTHING first-party, ever. A single relative import
// added here can grow an edge back into reconciler.mjs and the cycle returns — silently, because
// ESM resolves a cycle rather than refusing it. `chat-clarify-sweep-wiring.test.mjs`'s first cell
// asserts the empty import list, so that addition is a failing test rather than a discovery.
//
// PURE. No DB, no world, no clock, no I/O.

/** True iff the error is the engine's single-shot "hook already gone" signal. */
export function isHookNotFound(err) {
  return err != null && (err.name === "HookNotFoundError" || /hook not found/i.test(String(err.message || "")));
}

/** An instant, as the wire carries it. `pg` hands a timestamptz back as a Date; a WDK resume
 *  payload is JSON, and a Date that round-trips through the engine as `{}` is a fact silently
 *  lost. */
function asInstant(v) {
  return v instanceof Date ? v.toISOString() : v ?? null;
}

/**
 * Build the resume payload the workflow's hook awaits, from a row status.
 *
 * A WORK question (#629) carries its OWN IDENTITY into the run: which question, which VERSION, and
 * on whose authority the answer was accepted. `claraWork_v2`'s `recheckAuthorityStep` re-reads that
 * human's CURRENT membership before continuing, and it cannot re-read a human the payload never
 * named. A CHAT clarify keeps exactly the payload it had before 0180 — chatTurn's frozen resume
 * body reads `{kind, answer}` and nothing else, and widening it would be a change to a closure this
 * ticket does not own.
 */
export function resumePayloadFor(row) {
  if (row.status === "answered") {
    if (row.work_id) {
      return {
        kind: "answer",
        answer: row.answer ?? null,
        question_id: row.id,
        question_version: row.question_version ?? null,
        answered_by: row.answered_by ?? null,
        answered_role: row.answered_role ?? null,
        answered_at: asInstant(row.answered_at),
      };
    }
    return { kind: "answer", answer: row.answer ?? null };
  }
  if (row.status === "expired") return { kind: "expired" };
  if (row.status === "cancelled") return { kind: "cancelled" };
  // Defensive — never lease a non-terminal row (predicate excludes it), but if we
  // somehow do, surface it as cancelled so the workflow unblocks and settles.
  return { kind: "cancelled" };
}
