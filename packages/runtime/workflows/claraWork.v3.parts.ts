// @frozen
//
// FROZEN — part of the claraWork_v3 closure (#631). A DECLARER, in the sense chatTurn.v16.parts.ts
// established and states the law for: the runtime declares a wire shape,
// `apps/web/lib/parts/types.ts` READS it, and `packages/runtime/scripts/check-parts-parity.mjs`
// refuses a commit where the reader trails an emittable declaration.
//
// THIS FILE REPLACES claraWork.v1.parts.ts IN THE DECLARER SET, and that swap is the whole of how
// #738 could be delivered lawfully.
//
// THE PROBLEM, MEASURED. #738 asks the `work_status` part to carry `client_id`, so Cancel Work can
// live on the status line rather than on `WorkAcceptedCard`. `work_status` is DECLARED in
// claraWork.v1.parts.ts, which is `@frozen` and `deployed: true`, so its text may not move. And
// `declaredPartShapesAcross` (check-parts-parity.mjs:382-392) HARD-THROWS on a discriminant
// declared in two files, so a successor cannot simply re-declare the kind beside it. Emitting an
// undeclared field instead would break the law every one of these module headers states — that the
// DECLARER is the authority on the shape and the reader is transcribed from it.
//
// THE RESOLUTION. The declarer SET names the closure whose declarations are currently authoritative.
// v3 declares BOTH of v1's kinds — `work_status` (widened by one field) and `work_result` (byte-
// identical) — and `packages/runtime/scripts/check-parts-parity.mjs` lists THIS file instead of
// v1's. Nothing about v1's file changes; it is still frozen, still built, still exported, and a
// run parked on a v1 hook still emits exactly what it always did. What changed is which file the
// census reads as the current declaration, and the v3 shape is a strict SUPERSET of v1's, so a
// reader transcribed from it reads a v1 run's parts correctly too — with `client_id` absent, which
// is why the reader declares it optional and says so.
//
// `work_question` is v2's and is reached BY IMPORT, never re-declared, for the same reason.
//
// IDENTIFIERS ONLY, exactly as v1 and v2 carry them. Nothing from an entry's content, a question's
// content or a Work's basis rides on any of these kinds: a card re-derives authoritative state
// from a pinned DB read on mount and after every action (hydrate-never-trust).
//
// LIVE-STREAM-ONLY, like every member of this lane's union, and for the same structural reason: an
// `accounting_work` task carries `session_id NULL`, so there is no `clara.chat_messages.parts`
// array for a late reader to replay. THE DURABLE SURFACE IS `clara.accounting_work` itself, plus —
// new in #631 — `clara.get_work_execution_trace` for the Diagnostics section. Nothing here may
// ever be the ONLY record of an effect.

import type { WorkQuestionPart } from "./claraWork.v2.parts.js";

export type { WorkQuestionPart };

/**
 * ONE observable status of a running Work.
 *
 * v1's shape PLUS `client_id` (#738). The field is not decoration: every action a human can take
 * from a status line — Cancel Work, open the Work detail at `/clients/:client_id/work/:work_id`,
 * re-read `clara.get_work_question` — is CLIENT-SCOPED, and a card that had only the work id could
 * build no route and make no scoped read at all. It was carried on `work_result` from the start
 * (v1's own note on the field), and a status line that could not do what a result line could was
 * the asymmetry #738 names.
 *
 * `status` IS `string`, not a union of literals, and that is measured rather than lazy: the status
 * vocabulary lives in a CHECK constraint on `clara.accounting_work.status` that later purposes
 * extend, and a literal union transcribed today would make a status the wire already carries
 * unrenderable the day the CHECK grows.
 *
 * `status` is the LAST-HEARD status, carried for the narrow reason v1 states: this kind exists to
 * make a LIVE run observable between durable reads. A card renders it as last-heard and re-reads
 * the row; it is never authority.
 */
export type WorkStatusPart = {
  type: "work_status";
  work_id: string;
  client_id: string;
  status: string;
};

/**
 * ONE completed Work's authoritative effect: the posted journal entry and its receipt.
 *
 * BYTE-IDENTICAL to v1's declaration. It is restated here only because this file replaces v1's in
 * the declarer set, and a set that declared `work_status` without `work_result` would leave the
 * second kind undeclared — which the census would report as an emittable kind the reader carries
 * for no declarer.
 *
 * FOUR FIELDS, EACH ONE FORCED.
 *   `work_id`    — the route back to the Work detail this effect belongs to.
 *   `client_id`  — the scope every hydrating read is filtered by, and the route segment.
 *   `entry_id`   — the posted entry, and the link into Journals.
 *   `receipt_id` — the `clara.operation_receipts` row that attributes the act.
 *
 * NOTHING FROM THE ENTRY'S OWN CONTENT RIDES HERE — no amounts, no memo, no posting date, no
 * revision token. A card that re-read the entry and a card that rendered a remembered amount would
 * disagree the moment a correction is posted, and the amount is the one field where a stale copy
 * is a lie a human would act on.
 */
export type WorkResultPart = {
  type: "work_result";
  work_id: string;
  client_id: string;
  entry_id: string;
  receipt_id: string;
};

/** The three kinds THIS closure can emit, as ONE union. */
export type ClaraWorkPartAdditionsV3 = WorkStatusPart | WorkResultPart | WorkQuestionPart;

/** The three discriminants, spelled ONCE, in declaration order. The union above is the authority
 *  on the SHAPES; this array exists so a census can assert the NAMES without retyping them. */
export const CLARA_WORK_PART_KINDS_V3 = ["work_status", "work_result", "work_question"] as const;
