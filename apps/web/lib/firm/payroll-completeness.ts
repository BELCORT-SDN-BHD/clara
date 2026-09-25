// #1048 — the ONE write door the payroll lane has, and the only web module that names it.
//
// WHY ITS OWN FILE AND NOT A THIRD FUNCTION IN `lib/firm/needs-you.ts`. That module is a shared
// file six lanes edit in this wave, and its own header says what it is for: it reads
// `clara.list_review_queue` verbatim and exposes the two write doors the SAME queue's
// `open_question` rows act on. This door acts on a DIFFERENT row kind, through a different
// database body, with a different refusal vocabulary — so it lives here, and `needs-you.ts` gains
// only the one-line row-kind registration it must (the wave's shared-file rule: keep your hunk
// minimal and put logic in your own new modules).
//
// THE ACT IS A GOVERNED WRITE, so real door semantics apply: a `DoorRefusal` surfaces verbatim,
// is never retried and is never reworded, and the caller re-reads the queue afterwards through
// `lib/firm/use-review-queue.ts`'s `act()` — the same contract every other Needs-you act follows.
//
// THE REFUSALS THIS DOOR CAN GIVE, and what each means on screen (they are the database's own,
// named here so a reader of this module does not have to guess):
//   `no_parked_completeness_question` — the gate says this summary is not waiting on an answer.
//       The commonest cause is benign: somebody else answered first, or a re-read changed what the
//       page says. The row will be gone on the re-read that follows.
//   `payroll_completeness_answer_invalid` — the answer was neither `yes` nor `no`. Unreachable from
//       this surface, which sends one of two literals, and kept as a door-side wall rather than a
//       client-side assumption.
//   `not_filed` — the payslip has no live filing to answer about.
// A refused answer writes nothing at all: the door reserves its op key, checks the gate, and only
// then inserts.

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** The two answers this question has. There is no third, and the database refuses one. */
export type PayrollCompletenessAnswer = "yes" | "no";

/** What `clara.answer_payroll_completeness` hands back. `posted` and `entry_id` are populated only
 *  by a `yes` that the post then accepted: a `yes` whose run is refused for some OTHER reason (a
 *  closed period, an account since removed, a month already booked) still RECORDS the answer — it
 *  is a fact about what a person said — and reports the refusal here instead. */
export type PayrollCompletenessResult = {
  readonly answer_id: string;
  readonly answer: PayrollCompletenessAnswer;
  readonly document_id: string;
  readonly extraction_id: string;
  readonly rows_read: number;
  readonly posted: boolean;
  readonly entry_id: string | null;
  readonly reason: string | null;
  readonly rung: string | null;
};

/**
 * `clara.answer_payroll_completeness(p_document, p_answer, p_note, p_op_key)` — bookkeeper+
 * governed write (migration 0343, #1048).
 *
 * A payroll summary that prints no run total and witnesses nothing about its own completeness
 * parks the question "is this every employee for the month?". A `yes` from a named person becomes
 * the posting basis and the run posts IN THE SAME CALL, from the deterministic evaluator's own row
 * sum, with the entry naming the answer as its witness. A `no` posts nothing and hands the document
 * back to the ordinary blocked row, which then says who declined.
 *
 * `note` is optional and free text — what the person checked the page against. It is stored on the
 * answer row as evidence and is never parsed.
 */
export function answerPayrollCompleteness(
  session: SessionTokenAccessor,
  documentId: string,
  answer: PayrollCompletenessAnswer,
  note: string | null = null,
): Promise<unknown> {
  return callDoor(
    "answer_payroll_completeness",
    {
      p_document: documentId,
      p_answer: answer,
      p_note: note && note.trim() ? note.trim() : null,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}
