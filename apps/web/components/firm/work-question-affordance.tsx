"use client";

// #629 (B4) — THE `work_question` INLINE AFFORDANCE. Needs-you's tenth row kind: a persistent
// question a running accounting Work is parked on, answerable from the inbox without leaving it.
//
// IT EXPANDS THE SAME FORM B3 AND B6 RENDER, and that is the whole point of the row kind. The
// acceptance line asks a person to "open the same question from any surface"; an inbox that offered
// its own inputs would be a second question wearing the first one's id, and the two would disagree
// the first time somebody answered from the Work page.
//
// COLLAPSED BY DEFAULT, and the reason is the inbox's own shape rather than a style preference: a
// Needs-you list is a scan surface, and ten expanded forms is not one. "Answer" expands this row's
// form in place; "Close" collapses it and writes nothing — the leave-pending affordance, which is
// what keeps a person from being forced to guess.
//
// FOCUS AFTER ACCEPTANCE IS THE CALLER'S, NOT THIS COMPONENT'S. When the answer lands, the row
// leaves the list on the next read (the question is no longer pending), and §4 says a disappearing
// row must not dump focus onto the document body. This component therefore returns focus to the
// row's own trigger BEFORE it asks for the reload — the trigger is still mounted at that moment,
// and the reload is what removes it.

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { WorkQuestionPanel } from "@/components/work/work-question-panel";
import { ErrorMessage } from "./data-state";
import type { NeedsYouAffordanceProps } from "./needs-you-affordances";

export function WorkQuestionAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  const t = useTranslations("WorkQuestion.inbox");
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);

  const questionId = row.question_id ?? row.id;

  // The row's own reload, run through the SAME act()-and-reload cycle every needs-you affordance
  // uses — never a bespoke read outside it. `act` resolves rather than rejects, so a failed reload
  // shows on the row instead of throwing into the list.
  const onAnswered = useCallback(() => {
    trigger.current?.focus();
    void act(async () => undefined);
  }, [act]);

  if (!questionId) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="needs-you-work-question">
      {error ? <ErrorMessage error={error} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={open ? "outline" : "default"}
          disabled={busy}
          ref={trigger}
          aria-expanded={open}
          data-testid="needs-you-work-question-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("collapseAction") : t("answerAction")}
        </Button>
        {/* NO LINK IS BUILT FROM THE ROW. `clara.list_review_queue`'s row json is a FIXED 30-key
            shape shared by ten kinds and #629 deliberately added no key to it (migration 0180's
            header states why), so a `work_question` row carries the QUESTION, the TASK and the
            CLIENT — and NOT the Work. `/clients/<c>/work/<task>` is a 404 dressed as an
            affordance, which this estate refuses to render. The route to the Work is built inside
            the panel below, from the HYDRATED record, where the work id actually exists. */}
      </div>
      {open ? <WorkQuestionPanel questionId={questionId} onAnswered={onAnswered} onLeavePending={() => setOpen(false)} /> : null}
    </div>
  );
}
