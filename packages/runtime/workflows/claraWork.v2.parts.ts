// @frozen
//
// FROZEN — part of the claraWork_v2 closure (#629). A DECLARER, in the sense chatTurn.v16.parts.ts
// established and states the law for: the runtime declares a wire shape,
// `apps/web/lib/parts/types.ts` READS it, and `packages/runtime/scripts/check-parts-parity.mjs`
// refuses a commit where the reader trails an emittable declaration.
//
// ONE NEW KIND. `work_status` and `work_result` are v1's and are re-exported here BY IMPORT, not
// re-declared: they are the same wire shapes, and two declarations of one kind is how a reader and
// a writer come to disagree about it.
//
// IDENTIFIERS ONLY, exactly like its two siblings. A `work_question` card carries the question's
// IDENTITY and nothing else: the text, the reason, the typed fields, the deadline and the accepted
// answer all come from `clara.get_work_question`, re-read on mount and after every action
// (hydrate-never-trust). A question's fields do not change, but its STATUS does — somebody else may
// answer it while the card is on screen — and a card that rendered a remembered status would be
// offering a form for a question that is already settled. That is the exact failure #629's
// "converge duplicate, concurrent, stale, expired, changed-basis, answered-elsewhere and
// permission-lost surfaces on the authoritative result" line names.
//
// LIVE-STREAM-ONLY, like its siblings, and for the same structural reason: an `accounting_work`
// task carries `session_id NULL`, so there is no `clara.chat_messages.parts` array for a late
// reader to replay. THE DURABLE SURFACE IS THE DATABASE — `clara.agent_interruptions` through the
// two read doors 0180 grants — which is why nothing here may ever be the ONLY record of a question.

import type { WorkResultPart, WorkStatusPart } from "./claraWork.v1.parts.js";

export type { WorkResultPart, WorkStatusPart };

/**
 * ONE persistent question a running Work has parked on.
 *
 * HYDRATES `clara.agent_interruptions` (migration 0180) through `clara.get_work_question` —
 * bookkeeper+, firm-scoped, no oracle. ACTS through `clara.answer_work_question`, which is the
 * first-answer gate: one current authorised answer, replayed on the same op key, refused on a
 * reused key with a different payload, and converged with the authoritative record on every loser.
 *
 * FIVE FIELDS, EACH ONE FORCED.
 *   `work_id`          — the route back to the Work detail this question belongs to.
 *   `client_id`        — the scope every hydrating read is filtered by, and the route segment of
 *                        `/clients/:clientId/work/:workId`. NOT NULL on the row: a work question
 *                        is client-scoped by construction, because its `account` fields are
 *                        validated against THAT client's chart.
 *   `question_id`      — the record every surface reads, and the id the answer door takes.
 *   `question_version` — half of the answer door's own argument pair, and the half that makes
 *                        `stale_question` a comparison rather than a guess. A re-asked question is
 *                        a NEW row with the NEXT version, so a card holding version 1 must be told
 *                        it is stale rather than allowed to answer version 2's question with
 *                        version 1's draft.
 *   `status`           — the LAST-HEARD status, carried for the same narrow reason `work_status`
 *                        carries one: this kind exists to make a LIVE run observable between
 *                        durable reads. A card renders it as last-heard and re-reads the record;
 *                        it is never authority.
 *
 * NOTHING FROM THE QUESTION'S CONTENT RIDES HERE — no text, no reason, no fields, no options, no
 * deadline. A card that rendered a remembered field set and a card that re-read the record would
 * disagree the moment the question was re-asked, and the FIELDS are where a stale copy would make
 * a human type an answer into a form nobody is waiting for.
 */
export type WorkQuestionPart = {
  type: "work_question";
  work_id: string;
  client_id: string;
  question_id: string;
  question_version: number;
  status: string;
};

/** The three kinds THIS closure can emit, as ONE union — the shape a claraWork_v2 run's stream
 *  widens the transcript vocabulary by. */
export type ClaraWorkPartAdditionsV2 = WorkStatusPart | WorkResultPart | WorkQuestionPart;

/** The three discriminants, spelled ONCE, in declaration order. The union above is the authority
 *  on the SHAPES; this array exists so a census can assert the NAMES without retyping them. */
export const CLARA_WORK_PART_KINDS_V2 = ["work_status", "work_result", "work_question"] as const;
