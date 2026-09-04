"use client";

// The open_coding_task / open_question(document scope) inline actions for an
// UNCODED filing — shared between the coding-lane workbench's own uncoded-
// filings list and the needs-you registry's `uncoded_filing` affordance
// (components/firm/uncoded-filing-affordance.tsx). Mobbin grounding
// (docs/plan/active/mobbin-grounding-wave-2026-08-28.md, T7 takeaway 3):
// `open_coding_task` is the RAISING half surfaced as a needs-you inline act;
// `open_question` scoped to this filing's own document is this surface's
// other honest response to a blocked filing (its scope_kind is constrained
// to document/vendor/client/bank_line at the live catalog — lib/coding/
// types.ts's own header — 'document' is the one this row genuinely has an id
// for).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { openCodingTask, openQuestion } from "@/lib/coding/doors";
import { CodingDoorDialog } from "./CodingDoorDialog";

// F1, independent review — CORRECTED SHAPE: this component carries NO error
// prop and renders no error itself. Its two real callers disagree on their
// error's shape (the workbench's `useHydratedPart` splits `err: string|null`
// + a separate `clr`; the needs-you registry's `useReviewQueue` hands a raw
// `unknown` exception with no separate `clr` at all) and each already has
// the RIGHT house component for its own shape (`ActionRefusal` for the
// former, `ErrorMessage` for the latter, exactly as the existing
// `OpenQuestionAffordance` already does for the needs-you side) — forcing
// one shape onto both here was the actual bug: it silently dropped the CLR
// code for whichever caller's shape didn't match. Each caller now renders
// its OWN error, in its OWN idiom, around this component.

export function UncodedFilingActions({
  clientId, documentId, filingId, busy, act,
}: {
  clientId: string;
  documentId: string;
  filingId: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("CodingQuestionsSignals.uncodedFiling");
  const [taskReason, setTaskReason] = useState("");
  const [questionText, setQuestionText] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <CodingDoorDialog
          triggerLabel={t("openTaskTrigger")}
          title={t("openTaskTitle")}
          confirmLabel={t("openTaskConfirm")}
          busy={busy}
          confirmDisabled={!taskReason.trim()}
          onConfirm={async () => {
            // F5, independent review: clear ONLY on success — `act()` never
            // rejects (it catches internally), so a plain `.then()` fired on
            // a REFUSAL too and silently discarded what the human typed.
            // `succeeded` is set inside the door call itself, so it is only
            // ever true when that call did not throw.
            let succeeded = false;
            await act(async () => { await openCodingTask(clientId, documentId, filingId, taskReason.trim()); succeeded = true; });
            if (succeeded) setTaskReason("");
            return succeeded;
          }}
        >
          <Textarea
            aria-label={t("openTaskReasonLabel")}
            placeholder={t("openTaskReasonPlaceholder")}
            value={taskReason}
            onChange={(e) => setTaskReason(e.target.value)}
          />
        </CodingDoorDialog>

        <CodingDoorDialog
          triggerLabel={t("askQuestionTrigger")}
          title={t("askQuestionTitle")}
          confirmLabel={t("askQuestionConfirm")}
          busy={busy}
          confirmDisabled={!questionText.trim()}
          onConfirm={async () => {
            let succeeded = false;
            await act(async () => { await openQuestion(clientId, "document", documentId, questionText.trim()); succeeded = true; });
            if (succeeded) setQuestionText("");
            return succeeded;
          }}
        >
          <Textarea
            aria-label={t("askQuestionLabel")}
            placeholder={t("askQuestionPlaceholder")}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />
        </CodingDoorDialog>
      </div>
    </div>
  );
}
