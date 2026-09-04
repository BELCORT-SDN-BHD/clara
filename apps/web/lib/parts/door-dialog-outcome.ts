// THE TWO JUDGEMENTS EVERY DOOR DIALOG MAKES, IN ONE PLACE (review-549 MAJOR 1 and 2).
//
// There are fifteen door-dialog wrappers in this app, deliberately file-disjoint per
// domain (each file's own header records that decision). What was NOT meant to be
// duplicated is the JUDGEMENT they share, and CB-AE2E-004's first cut hand-copied a
// three-line predicate into all fifteen. That is exactly the shape the class defect
// took in the first place: `outcome.ran` and `outcome.value === true` both compile,
// both look plausible, and a wrapper quietly reverted to the wrong one stays green
// because the class cell can only mount one wrapper at a time.
//
// Hoisting the predicate does not merge the components — it merges the DECISION, so a
// mutant has exactly one place to land and one cell can pin it for all fifteen.

/** What `runOnce` (lib/parts/single-fire-guard.ts) reports back. */
export type DoorConfirmOutcome<T = boolean | void> = { ran: boolean; value: T | undefined };

/**
 * MAY THIS DIALOG CLOSE?
 *
 * `true` ONLY on an explicit `true` from the handler — which `useHydratedPart`'s
 * `act()` (and `useAsyncRead`'s) returns on a clean call and never on a caught
 * refusal. Everything else keeps the dialog open:
 *
 *   - `ran: false` — a concurrent click the single-fire guard dropped. Nothing
 *     happened, so nothing may close.
 *   - `value: false` — the door REFUSED. This is the case the whole item exists for:
 *     `act()` catches the refusal and resolves, so the only distinguishing fact is
 *     this boolean, and closing here destroys the field the refusal is asking the
 *     human to correct.
 *   - `value: undefined` — a handler that reported nothing. Fail closed: a dialog
 *     left standing is recoverable (the human closes it); a dialog that closed over
 *     an unread refusal is not.
 */
export function closeOnConfirmedOk(outcome: DoorConfirmOutcome): boolean {
  return outcome.value === true;
}

/**
 * WHOSE REFUSAL IS THIS?
 *
 * A caller's standing `err`/`clr` is PANEL-scoped: one hydrated part serves every
 * dialog on that panel, and several of them are open-able at once (finalize and
 * abandon coexist for the whole of a close run; four opening dialogs sit in one
 * header; every gate row on the close plan carries its own attest dialog). Handing
 * that one object to all of them paints a refusal RAISED BY ANOTHER DOOR inside this
 * dialog's modal — and, because the banner takes focus when it appears, steals focus
 * to a message about something the human did not just do.
 *
 * `attempt` is the wrapper's own count of SETTLED confirms. Until this dialog has
 * settled one, the panel's refusal is somebody else's news and is not shown here.
 * The wrapper resets the count when the dialog opens, so a refusal from an earlier
 * visit does not paint on a fresh one either.
 *
 * IT IS NOT A CLAIM OF AUTHORSHIP, and must not be read as one: if two dialogs have each
 * settled a confirm, both will show the panel's latest refusal.
 *
 * WHY THAT RESIDUE IS UNREACHABLE TODAY, and what would make it reachable. Every door dialog
 * in this app is MODAL — `components/ui/dialog.tsx` renders a `DialogOverlay` and Base UI traps
 * focus — so exactly one is open at a time, and the wrapper resets its attempt count on each
 * OPEN. A dialog therefore cannot be looking at a refusal it did not itself just cause: to
 * reach the residue you would have to see two dialogs at once, each having confirmed since it
 * opened, which modality forbids.
 *
 * So the guard is complete for the product as it stands, and it becomes incomplete the day a
 * NON-MODAL door dialog appears — an inline panel, a drawer that leaves its siblings live. That
 * is the condition to watch, and it is a design change someone would make on purpose, not a
 * regression that could creep in. The narrow fix for that day is a refusal object per dialog,
 * which needs `act()` to return the failure rather than only a boolean.
 */
export function refusalForThisDialog<T>(refusal: T | undefined, attempt: number): T | undefined {
  return attempt > 0 ? refusal : undefined;
}
