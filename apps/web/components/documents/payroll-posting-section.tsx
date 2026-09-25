"use client";

// #1148 — THE DOCUMENT PAGE'S PAYROLL POSTING SECTION (the brief's web half).
//
// WHAT WAS WRONG. The accounting view of a payroll summary showed the entries the payslip DID
// produce and said nothing at all about one that produced none — "No posted entry currently stands
// on this document", full stop. The whole answer existed the entire time:
// `clara._payroll_posting_verdict` builds the sentence naming what stopped the post, in ONE body,
// so the words a person reads and the decision the lane took cannot drift. It was simply
// ungranted, and the only surfaces that could reach it were the Needs-you queue and the entry's own
// receipt — neither of which is where a person looking at the payslip is standing. Migration 0363
// grants the read; this section is the page that uses it.
//
// IT RENDERS THE DATABASE'S SENTENCE VERBATIM. It does not summarise it, reword it, translate it or
// build a second one out of `rung` and `reason`: a sentence assembled here would be a second
// opinion about the same facts, and the two would drift the first time a rung changed. The only
// words this file owns are its heading and the one line naming where a parked question is answered.
//
// IT OFFERS NO ACT, AND THAT IS THE TICKET'S OWN BOUNDARY. A parked completeness question is a
// professional judgement, answered through `clara.answer_payroll_completeness` where the Needs-you
// affordance for it already lives (`components/firm/payroll-completeness-question-affordance.tsx`).
// A question printed with no way to answer it is a dead end, so the page SAYS where the answer is
// given — it does not grow a second button for the same door.
//
// IT DOES NOT SPEAK ON THE SUCCESS PATH (fix round, review findings SPEC-01 / ADV-02). The tenth
// rung of the posting gate stops a SECOND entry, and its first scope is the payslip's OWN: a
// payroll summary that posted perfectly well answers `blocked / no_duplicate_entry` with a sentence
// written for a re-file attempt made from somewhere else — "This payslip was not posted again --
// open that entry to decide whether this is a correction or a re-upload." Printed here, directly
// under the entries list that already shows that entry and under "A posted entry of <client>
// currently stands on this document.", it asks a person to decide something there is nothing to
// decide about. So this section renders NOTHING in that one state — not a reworded sentence and not
// a second one, because the page above it has already said what stands. Every other scope names
// somebody ELSE's entry, which IS the re-upload the sentence is for and which the reader learns
// nowhere else; and a `ready` verdict still speaks, because "ready to post but no entry exists yet"
// is true and is a fact this page has no other way to show. `blocksOnThisDocumentsOwnEntry` holds
// the rule, in the module that owns the door's answer.
//
// IT COSTS A NON-PAYROLL PAGE NOTHING. The gate is the document's own kind, which the detail bundle
// has already read, so an invoice page makes no door call at all. The kind can still move under the
// page (a correction, a re-classification), and the door refuses that by name; the honest answer on
// screen is silence, not a banner about a question nobody asked.

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  blocksOnThisDocumentsOwnEntry, getPayrollPostingState, isNotAPayrollSummary,
  type PayrollPostingState,
} from "@/lib/documents/payroll-posting-state";
import { SectionHeader } from "@/components/common/section-header";
import { DoorFeedback } from "./door-feedback";

/** The one document kind this section is about. The string is the estate's own
 *  (`clara.document_capabilities.document_kind`), and the door refuses any other by name. */
const PAYROLL_SUMMARY = "payroll_summary";

/** Wraps the read's answer in a non-null container so `useHydratedPart`'s `data` can tell "not yet
 *  loaded" from "loaded, and the door said this is not a payslip" — the same shape
 *  `DocumentStatePanel`'s `StateLoad` uses, and for the identical reason. */
type PostingLoad = { state: PayrollPostingState | null };

export function PayrollPostingSection({
  documentId, documentKind,
}: {
  documentId: string;
  /** `clara.documents.document_kind`, as the detail bundle already read it. */
  documentKind: string | null;
}) {
  const t = useTranslations("ClientDocuments.payrollPosting");
  const isPayroll = documentKind === PAYROLL_SUMMARY;

  const part = useHydratedPart<PostingLoad>(
    isPayroll ? sessionTokenAccessor : null,
    useCallback(
      async (s): Promise<PostingLoad> => {
        try {
          return { state: await getPayrollPostingState(documentId, { session: s }) };
        } catch (e) {
          // THE ONE REFUSAL THIS SURFACE ANSWERS WITH SILENCE. Caught HERE rather than read off the
          // hook's `err`, because the hook keeps a finished sentence and the discriminant is gone
          // by then. Every other failure is re-thrown and becomes a banner.
          if (isNotAPayrollSummary(e)) return { state: null };
          throw e;
        }
      },
      [documentId],
    ),
  );

  if (!isPayroll) return null;

  const state = part.data?.state ?? null;
  if (!state) {
    // Either nothing has settled yet, or the door said this is not a payslip. Neither is a sentence
    // a person needs; a genuine failure is, and `part.err` is it.
    return part.err ? (
      <div data-testid="payroll-posting-error">
        <DoorFeedback err={part.err} clr={part.clr} />
      </div>
    ) : null;
  }

  // THE SUCCESS PATH IS NOT A REFUSAL: see the header. The door was still asked (the page cannot
  // know the verdict without asking); this is the one ANSWER the panel has nothing to add to. A
  // standing failure alongside it is still a banner, exactly as in the branch above — silence is
  // for a sentence that would be wrong, never for a failure a person is owed.
  if (blocksOnThisDocumentsOwnEntry(state)) {
    return part.err ? (
      <div data-testid="payroll-posting-error">
        <DoorFeedback err={part.err} clr={part.clr} />
      </div>
    ) : null;
  }

  return (
    <section className="flex flex-col gap-1" data-testid="payroll-posting-panel">
      <SectionHeader level={4}>{t("heading")}</SectionHeader>
      {state.sentence ? (
        <p className="text-sm" data-testid="payroll-posting-sentence" data-rung={state.rung ?? ""}>
          {state.sentence}
        </p>
      ) : null}
      {state.completeness?.parked ? (
        <p className="text-xs text-muted-foreground" data-testid="payroll-posting-parked">
          {t("parkedNote")}
        </p>
      ) : null}
      <DoorFeedback err={part.err} clr={part.clr} />
    </section>
  );
}
