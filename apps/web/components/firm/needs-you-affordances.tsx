// T0 seam (port-wave plan §3.2) — the row-kind -> inline-affordance dispatch
// table. Before this file, needs-you-row.tsx held exactly one hardcoded branch
// (`row.row_kind === "open_question"`) for the one row kind that carries an
// inline act. The port wave adds inline affordances for four more kinds across
// four different trains (T7: coding_task, lint_finding; T10: compliance_watch;
// T3: fixed_asset_incomplete; T5: staff_advance_incomplete) — a fifth branch
// added by each would make needs-you-row.tsx a file every train edits, which is
// exactly the merge risk this seam PR exists to remove.
//
// The fix: needs-you-row.tsx dispatches through NEEDS_YOU_AFFORDANCES, a flat
// table keyed by row_kind. Each train adds ONE line to this table pointing at a
// component it owns in ITS OWN file (the open_question entry below,
// ./open-question-affordance.tsx, is the pattern to copy) — a one-line addition
// to a growing object literal, not an edit to shared conditional logic.
//
// This table is a dispatch mechanism BEHIND the closed-world membership check,
// never a replacement for it: lib/firm/needs-you.ts's isKnownReviewQueueRowKind
// (FIX-1, independent review, 2026-08-27) stays the one place that decides
// whether a row_kind is recognized at all. A row_kind absent from this table
// simply renders no inline affordance (today's behavior for the seven kinds
// that are link-only) — it is never itself evidence that the kind is unknown.

import type { ComponentType } from "react";

import type { ReviewQueueRow, ReviewQueueRowKind } from "@/lib/firm/needs-you";
import { OpenQuestionAffordance } from "./open-question-affordance";
import { StaffAdvanceIncompleteAffordance } from "./staff-advance-incomplete-affordance";

export type NeedsYouAffordanceProps = {
  row: ReviewQueueRow;
  /** True while ANY act on this row (this row's own `act` call) is in flight —
   *  the same `busy` NeedsYouInbox already threads through every row today. */
  busy: boolean;
  /** This row's own acting-key-scoped error (N13/R1's per-row attachment,
   *  needs-you-inbox.tsx) — null unless the LAST act on this specific row
   *  refused. Render it verbatim; never retry, never reword. */
  error: unknown;
  /** Runs `fn` through the SAME act()-and-reload cycle every needs-you row
   *  action uses (lib/firm/use-review-queue.ts's `act()`) — never a bespoke
   *  door call outside it. Already scoped to this row's acting key by the
   *  caller (needs-you-inbox.tsx); an affordance just calls its own door(s)
   *  inside `fn`. */
  act: (fn: () => Promise<void>) => Promise<boolean>;
};

export type NeedsYouAffordance = ComponentType<NeedsYouAffordanceProps>;

/** Row kinds with no entry here render no inline act — a same-page link into
 *  the object that owns their verbs remains the whole affordance, exactly as
 *  it is today for every kind but open_question.
 *
 *  BUILT ON A NULL-PROTOTYPE OBJECT (independent review, fix-required,
 *  2026-08-28): a plain `{}` literal inherits `Object.prototype`, so
 *  `NEEDS_YOU_AFFORDANCES["constructor"]` and `["toString"]` resolve to
 *  INHERITED FUNCTIONS rather than `undefined` — proven to regress main's
 *  clean no-render behavior (a THROW for `"constructor"`, the literal text
 *  `"[object Undefined]"` rendered for `"toString"`). `row.row_kind` is not
 *  DB-reachable as either value today, but this table is the exemplar every
 *  later train's own row-kind registry copies (T3/T5/T7/T10), so the
 *  mechanism is fixed at its root rather than trusted to every future copy
 *  independently avoiding the trap. `Object.assign` onto `Object.create(null)`
 *  — never a plain object literal — for every entry added here, present and
 *  future. */
export const NEEDS_YOU_AFFORDANCES: Partial<Record<ReviewQueueRowKind, NeedsYouAffordance>> = Object.assign(
  Object.create(null),
  {
    open_question: OpenQuestionAffordance,
    // T5 (port-wave plan §3.2, §5's staffAdvances row): the inline "complete
    // particulars" act on a staff_advance_incomplete row — see
    // ./staff-advance-incomplete-affordance.tsx's own header for the grounding.
    staff_advance_incomplete: StaffAdvanceIncompleteAffordance,
  } satisfies Partial<Record<ReviewQueueRowKind, NeedsYouAffordance>>,
);

/** Looked up by row_kind (a `string` on the wire — see ReviewQueueRow) rather
 *  than the narrowed type, so a caller can pass `row.row_kind` directly after
 *  its own isKnownReviewQueueRowKind check without re-widening it back.
 *
 *  `Object.hasOwn` is the SECOND belt (independent review, fix-required,
 *  2026-08-28) — kept even though NEEDS_YOU_AFFORDANCES' null prototype
 *  already makes an inherited-property hit impossible today: a maintainer
 *  who later spreads this table into a plain object elsewhere, or copies
 *  this getter's shape without noticing the null-proto construction above,
 *  still gets a getter that is safe on its own. `Object.hasOwn` is a static
 *  method (never called ON the table), so it is unaffected by the table
 *  having no prototype at all. */
export function getNeedsYouAffordance(rowKind: string): NeedsYouAffordance | undefined {
  if (!Object.hasOwn(NEEDS_YOU_AFFORDANCES, rowKind)) return undefined;
  return NEEDS_YOU_AFFORDANCES[rowKind as ReviewQueueRowKind];
}
