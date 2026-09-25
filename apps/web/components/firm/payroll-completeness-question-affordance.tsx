"use client";

// #1048 — the inline act on a `payroll_completeness_question` row: the two answers to "this
// summary prints no total; is this every employee for the month?". Registered in
// ./needs-you-affordances.tsx, the ./open-question-affordance.tsx pattern every inline affordance
// follows: its own file, one line in that table, never a branch added to needs-you-row.tsx itself.
//
// WHY THIS KIND HAS AN INLINE ACT WHEN NO OTHER PAYROLL KIND DOES. `payroll_posting_blocked`,
// `payroll_net_pay_unsettled` and the two rent kinds all deliberately render nothing: each is
// cleared somewhere ELSE (add the missing account, accept a specific bank line, confirm a
// revision), and the posting lane has no "post it anyway" door because nothing in it is posted on
// a guess. This row is the opposite. The question is the whole row, it has exactly two answers,
// and the act belongs nowhere else in the product — there is no payroll workbench to send a person
// to. A row whose only possible destination is a document page that cannot answer it would be the
// "nothing dark" failure the standing owner ruling names: a feature nobody can reach.
//
// THE SENTENCE IS THE DATABASE'S OWN. `row.question_text` is built once, in
// `clara._payroll_posting_verdict`, and rendered verbatim by the row above these buttons — it
// already carries the month, the number of lines read and the gross and net those lines total. So
// this component adds NO figures of its own: a second rendering of the same numbers is a second
// opinion about them, and the two would drift the first time the gate changed.
//
// A NOTE IS OPTIONAL, AND OFFERED ON BOTH ANSWERS. It is what the person checked the page against
// ("the EPF submission lists two employees for May"), stored on the answer row as evidence. It is
// never required: the standing ruling is that a compliance gate PROMPTS, it never disables, and a
// bookkeeper who has the payslip in front of them should not be blocked from saying so by a form.
//
// A `yes` POSTS, AND THE BUTTON SAYS SO before it is pressed. An act that books a journal entry
// must not read like a checkbox.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { answerPayrollCompleteness } from "@/lib/firm/payroll-completeness";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "./data-state";
import type { NeedsYouAffordanceProps } from "./needs-you-affordances";

export function PayrollCompletenessQuestionAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  const t = useTranslations("NeedsYou");
  const tc = useTranslations("Common");
  const [mode, setMode] = useState<"yes" | "no" | null>(null);
  const [note, setNote] = useState("");

  // The door answers about a DOCUMENT's newest reading, so a row without one cannot be acted on.
  // The queue always projects it for this kind; this is the belt, not an expected state.
  if (!row.document_id) return null;
  const documentId = row.document_id;

  const submit = async () => {
    if (!mode) return;
    const answer = mode;
    const ok = await act(() =>
      answerPayrollCompleteness(sessionTokenAccessor, documentId, answer, note).then(() => undefined),
    );
    // Clear ONLY on success (N13): a refusal must not discard what the person typed — they should
    // be able to read the refusal, adjust and resubmit.
    if (ok) {
      setMode(null);
      setNote("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      {mode ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {mode === "yes" ? t("payrollCompletenessConfirmYes") : t("payrollCompletenessConfirmNo")}
          </p>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("payrollCompletenessNotePlaceholder")}
            aria-label={t("payrollCompletenessNotePlaceholder")}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submit()} disabled={busy}>
              {busy ? t("submitting") : t("submit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setMode(null);
                setNote("");
              }}
              disabled={busy}
            >
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("yes")} disabled={busy}>
            {t("payrollCompletenessYes")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("no")} disabled={busy}>
            {t("payrollCompletenessNo")}
          </Button>
        </div>
      )}
    </div>
  );
}
