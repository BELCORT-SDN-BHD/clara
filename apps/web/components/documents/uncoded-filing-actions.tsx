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
import { ErrorMessage } from "@/components/firm/data-state";

export function UncodedFilingActions({
  clientId, documentId, filingId, busy, error, act,
}: {
  clientId: string;
  documentId: string;
  filingId: string;
  busy: boolean;
  error: unknown;
  act: (fn: () => Promise<void>) => Promise<unknown>;
}) {
  const t = useTranslations("CodingQuestionsSignals.uncodedFiling");
  const [taskReason, setTaskReason] = useState("");
  const [questionText, setQuestionText] = useState("");

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <CodingDoorDialog
          triggerLabel={t("openTaskTrigger")}
          title={t("openTaskTitle")}
          confirmLabel={t("openTaskConfirm")}
          busy={busy}
          confirmDisabled={!taskReason.trim()}
          onConfirm={() =>
            act(async () => { await openCodingTask(clientId, documentId, filingId, taskReason.trim()); }).then(() => {
              setTaskReason("");
            })
          }
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
          onConfirm={() =>
            act(async () => { await openQuestion(clientId, "document", documentId, questionText.trim()); }).then(() => {
              setQuestionText("");
            })
          }
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
