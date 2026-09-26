// #1148 — `clara.get_payroll_posting_state` (migration 0363), the payroll lane's granted,
// DOCUMENT-SCOPED read of why a payslip did not post, and the only web module that names it.
//
// WHY IT EXISTS AT ALL. `clara._payroll_posting_verdict` decides everything a person wants to know
// — the sentence naming what stopped the post, the verdict, the rung, the reason, the completeness
// state — and is ungranted. Before 0363 the only way to SEE it was a Needs-you queue row or the
// entry's own receipt, so the document page could show the entries a payslip DID produce and had
// nothing at all to say about a payslip that produced none. This read is that sentence.
//
// WHAT IT IS NOT. It is not a write and it offers none: the completeness question a parked summary
// asks is a professional judgement behind `clara.answer_payroll_completeness` (`lib/firm/payroll-
// completeness.ts`), and a person answers it where that act lives. Nothing here retries, rewords or
// re-derives the database's sentence — `lib/documents/tenancy-reads.ts`'s own posture.
//
// TRANSPORT IS `callDoor`, NOT `getRows`. The door is a `security definer` function, so it is an
// RPC and PostgREST wants a POST for one — the same reason `tenancy-reads.ts` and `reads.ts` give.
//
// THE ARGUMENT NAME IS EXACT and pinned in migration 0363: `p_document`.

import { callDoor, isDoorRefusal, type CallDoorOptions } from "../doors";

/** The completeness object 0343 added to the verdict and 0363 projects whole. `parked` is the flag
 *  the Needs-you queue splits on: a payslip that prints no total and witnesses nothing is not
 *  refused, it is a question waiting for a named person. The three counts are bigint-shaped on the
 *  database side and are repaired here. */
export type PayrollPostingCompleteness = {
  readonly parked: boolean;
  readonly rows_read: number;
  readonly gross_sum_cents: number | null;
  readonly net_sum_cents: number | null;
};

/** What `clara.get_payroll_posting_state` answers: five of the verdict's keys, the caller's own
 *  document id, and (fix round) the duplicate's scope. NOT the `rung_vector` — that is the
 *  evaluator's internal ladder, and 0363 does not project it, so nothing downstream can render it
 *  by accident — and not `detail`, of which only the one token below crosses. */
export type PayrollPostingState = {
  readonly document_id: string | null;
  /** The database's own sentence, built in ONE body so the words on this page and the decision the
   *  lane took cannot drift. Rendered verbatim. */
  readonly sentence: string | null;
  /** `"ready"` or `"blocked"` — 0297 §D's own vocabulary. */
  readonly verdict: string | null;
  /** The FIRST failing rung, which is the condition a person is told about. Null when ready. */
  readonly rung: string | null;
  /** That rung's own refusal token. Null when ready. */
  readonly reason: string | null;
  readonly completeness: PayrollPostingCompleteness | null;
  /** #1148 FIX ROUND — WHOSE ENTRY THE TENTH RUNG FOUND. `no_duplicate_entry` fires for four
   *  scopes (`same_document`, `same_filing`, `same_month_payroll_run`, `payroll_obligation`) and
   *  0363 §A(3b) projects the verdict's own token for the one it matched. Null on every other rung,
   *  and null rather than absent so a surface never has to tell "nothing is duplicated" from "the
   *  door did not say". See `blocksOnThisDocumentsOwnEntry` below. */
  readonly duplicate_scope: string | null;
};

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** NORMALISED AT THE BOUNDARY, never trusted. A numeric that crosses a JSON boundary as a `bigint`
 *  column can arrive as a STRING, and an absent object must stay NULL rather than becoming an empty
 *  one a caller would read `undefined` out of and paint as "nothing is parked". The same posture
 *  `lib/documents/tenancy-types.ts` takes for #949. */
export function toPayrollPostingState(raw: unknown): PayrollPostingState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const c = (r.completeness ?? null) as Record<string, unknown> | null;
  return {
    document_id: str(r.document_id),
    sentence: str(r.sentence),
    verdict: str(r.verdict),
    rung: str(r.rung),
    reason: str(r.reason),
    completeness: c
      ? {
          parked: c.parked === true,
          rows_read: num(c.rows_read) ?? 0,
          gross_sum_cents: num(c.gross_sum_cents),
          net_sum_cents: num(c.net_sum_cents),
        }
      : null,
    duplicate_scope: str(r.duplicate_scope),
  };
}

/** #1148 FIX ROUND (review findings SPEC-01 / ADV-02) — IS THE BLOCK THIS DOCUMENT'S OWN ENTRY?
 *
 *  `clara._payroll_posting_verdict`'s tenth rung stops a SECOND entry, and its first scope is the
 *  payslip's own: a payroll summary that posted perfectly well reads `blocked /
 *  no_duplicate_entry`, with the sentence 0343 wrote for a re-file attempt made from somewhere else
 *  — "… is already posted (…). This payslip was not posted again -- open that entry to decide
 *  whether this is a correction or a re-upload." On the document's own page, printed under the very
 *  entry it means, that sentence asks a person to decide something there is nothing to decide
 *  about.
 *
 *  THE SENTENCE IS NOT REWORDED AND NOT REPLACED — one body owns the words. What the page does with
 *  this predicate is render NOTHING, because the entries list above it already says what stands on
 *  the document. Every OTHER scope is a different document's entry, which is exactly the re-upload
 *  the sentence is for and which the reader has no other way to learn. */
export function blocksOnThisDocumentsOwnEntry(state: PayrollPostingState): boolean {
  return state.rung === "no_duplicate_entry" && state.duplicate_scope === "same_document";
}

/**
 * `clara.get_payroll_posting_state(p_document)` — a VIEWER-floor, firm-scoped read (migration 0363,
 * #1148).
 *
 * Refuses `CLR11` for a document that is not this firm's AND for one that does not exist, with the
 * same message for both on purpose: the refusal must not be a way to enumerate another firm's
 * documents. Refuses `CLR10` + `not_a_payroll_summary` for a document of this firm that is not a
 * payslip — see `isNotAPayrollSummary` below for the one caller that answers it with silence.
 */
export async function getPayrollPostingState(
  documentId: string, opts: CallDoorOptions = {},
): Promise<PayrollPostingState> {
  return toPayrollPostingState(
    await callDoor("get_payroll_posting_state", { p_document: documentId }, opts),
  );
}

/** THE ONE REFUSAL A SURFACE ANSWERS BY RENDERING NOTHING. A panel that mounts on the document page
 *  decides from the document's own kind whether to ask at all, so this arm is reached only when the
 *  kind moved under it — a correction, or a re-classification between the page's read and this one.
 *  "This is not a payslip" is not a failure a person needs a banner about; every OTHER refusal is,
 *  and stays one. */
export function isNotAPayrollSummary(e: unknown): boolean {
  return isDoorRefusal(e) && e.code === "CLR10" && e.reason === "not_a_payroll_summary";
}
