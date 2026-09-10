// @frozen
//
// FROZEN — part of the claraWork_v1 closure (#623). A DECLARER, in the sense
// chatTurn.v16.parts.ts established and states the law for: the runtime declares a wire shape,
// `apps/web/lib/parts/types.ts` READS it, and `packages/runtime/scripts/check-parts-parity.mjs`
// refuses a commit where the reader trails an emittable declaration.
//
// TWO KINDS, AND THEY ARE THE WORK LANE'S OWN. `work_accepted` is NOT here: it is minted by a
// CHAT turn (chatTurn.v18) and therefore declared beside that closure, exactly as v13's and
// v14's part shapes live beside the tools that mint them. What is declared HERE is what a
// claraWork RUN itself writes to its own durable stream.
//
// IDENTIFIERS ONLY — the same hydrate-never-trust law every member of the union already obeys
// (apps/web/lib/parts/types.ts: "a card re-derives authoritative state from a pinned DB read
// function on mount and after every action"). A Work's status changes while a card is on
// screen; a receipt id does not.
//
// BOTH KINDS ARE LIVE-STREAM-ONLY, AND THAT IS A PROPERTY OF THIS LANE RATHER THAN AN OVERSIGHT.
// They are written to the RUN'S WRITABLE and reach a reader through `GET /api/tasks/:id/stream`
// while the run is executing. They are NOT persisted anywhere a later read can recover them: the
// stream route's terminal message replays `clara.chat_messages.parts`, and an `accounting_work`
// task has no chat message — it carries `session_id NULL` by construction — so a reader that
// attaches after the run ends gets the engine's replayed chunks and a terminal `done`, never a
// durable parts array. THE DURABLE SURFACE IS `clara.accounting_work` ITSELF: `status` for what
// `work_status` narrated, and `result` (`entry_id`, `receipt_id`) for what `work_result` carried.
// The Work detail polls that row every 3s while the Work is non-terminal (#623's web contract),
// which is why nothing is lost when a stream is missed — and why nothing here may ever be the
// ONLY record of an effect.
//
// (`lib/authz.mjs`'s `assertTaskStreamAccess` grew an `accounting_work` arm for the same finding
// that produced this note: until it did, the stream 404'd for every Work because the access check
// inner-joined `clara.chat_sessions`.)

/**
 * ONE observable status of a running Work.
 *
 * HYDRATES `clara.accounting_work` (migration 0178) through the ordinary bookkeeper+ RLS read
 * the Work detail page already makes — there is no status getter verb and this part is not a
 * substitute for one. The `status` field IS carried, unlike most identifier-only parts, and the
 * reason is narrow: this kind exists to make a LIVE run observable between durable reads (§6:
 * "界面在最终边界明确前显示正在停止"), so a card renders it as the last-heard status and
 * re-reads the row rather than treating it as authority. The estate's own precedent for
 * carrying a moving value is not this one — it is the absence of `state` on `close_proposal`,
 * and the difference is that a close proposal HAS a single-row read and this stream part is
 * consumed while the row is still moving.
 *
 * `status` IS `string`, not a union of literals, and that is measured rather than lazy: the
 * status vocabulary lives in a CHECK constraint on `clara.accounting_work.status` that later
 * purposes extend, and a literal union transcribed today would make a status the wire already
 * carries unrenderable the day the CHECK grows — the exact failure `receipt_kind`'s own open
 * type exists to avoid.
 */
export type WorkStatusPart = {
  type: "work_status";
  work_id: string;
  status: string;
};

/**
 * ONE completed Work's authoritative effect: the posted journal entry and its receipt.
 *
 * HYDRATES `clara.journal_entries` / `clara.journal_lines` (by `entry_id`) and
 * `clara.operation_receipts` (by `receipt_id`), both through the bookkeeper+ RLS reads the Work
 * detail already makes. ACTS through nothing — a receipt records what happened and there is
 * nothing to settle.
 *
 * FOUR FIELDS, EACH ONE FORCED.
 *   `work_id`    — the route back to the Work detail this effect belongs to.
 *   `client_id`  — the scope every one of those reads is filtered by, and the route segment of
 *                  `/clients/:clientId/work/:workId`. NOT NULL on the row: an accounting Work
 *                  is client-scoped by construction (unlike `agent_receipt`, whose client is
 *                  structurally nullable).
 *   `entry_id`   — the posted entry, and the link into Journals.
 *   `receipt_id` — the `clara.operation_receipts` row that attributes the act: which human's
 *                  authority was rechecked, which agent acted, which bundle digest, which run.
 *
 * NOTHING FROM THE ENTRY'S OWN CONTENT RIDES HERE — no amounts, no memo, no posting date, no
 * revision token. A card that re-read the entry and a card that rendered a remembered amount
 * would disagree the moment a correction is posted, and the amount is the one field where a
 * stale copy is a lie a human would act on.
 */
export type WorkResultPart = {
  type: "work_result";
  work_id: string;
  client_id: string;
  entry_id: string;
  receipt_id: string;
};

/** The two kinds this closure adds, as ONE union — the shape a Work run's stream widens the
 *  transcript vocabulary by. */
export type ClaraWorkPartAdditions = WorkStatusPart | WorkResultPart;

/** The two discriminants, spelled ONCE, in declaration order. The union above is the authority
 *  on the SHAPES; this array exists so a census can assert the NAMES without retyping them. */
export const CLARA_WORK_PART_KINDS = ["work_status", "work_result"] as const;
