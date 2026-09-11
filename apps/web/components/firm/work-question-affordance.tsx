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
// WHERE FOCUS GOES WHEN THE ROW DISAPPEARS (§4, and a reviewed finding).
//
// An answered question is no longer pending, so `clara.list_review_queue` stops returning this row
// and the reload unmounts it — TRIGGER INCLUDED. Focusing that trigger before asking for the reload,
// which is what this component used to do, therefore put focus on an element that was about to
// vanish: the browser drops focus to `<body>`, a screen reader loses its place, and the next Tab
// starts from the top of the document. "The trigger is still mounted at that moment" was true and
// beside the point.
//
// So: the reload is AWAITED first, and only then is focus placed — on the trigger if it survived
// (a failed act leaves the row in place, and the person should be where they were), otherwise on
// the nearest enclosing section's HEADING, which is the stable landmark this list lives under
// (`app/(firm)/work/page.tsx` renders `<section>` + `SectionHeader level={2}`). The heading is
// captured BEFORE the reload, while this subtree is still in the document, because afterwards there
// is nothing left to walk up from. A heading is given `tabindex="-1"` only if it lacks one — it is
// a programmatic focus target, never a tab stop.

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { WorkQuestionPanel } from "@/components/work/work-question-panel";
import { ErrorMessage } from "./data-state";
import type { NeedsYouAffordanceProps } from "./needs-you-affordances";

/** The stable landmark a disappearing row hands focus to: the heading of the section this list is
 *  rendered under. Exported so its own cell drives the real walk rather than a description of it.
 *
 *  Each level is queried SEPARATELY rather than as one `"h1, h2, h3"` selector list: the a11y
 *  harness's `querySelector` (test/domInspect.ts:89) matches simple selectors only and reads a
 *  comma list as a conjunction, so the grouped form silently matches nothing there. Three cheap
 *  calls, and the cell that drives this walk is real in both environments. */
export function landmarkHeadingFor(node: HTMLElement | null): HTMLElement | null {
  const section = node?.closest("section") ?? null;
  if (section === null) return null;
  for (const level of ["h1", "h2", "h3"]) {
    const heading = section.querySelector(level);
    if (heading instanceof HTMLElement) return heading;
    // The harness's stub nodes are not `HTMLElement` instances; a node with `focus` is enough.
    if (heading !== null && typeof (heading as { focus?: unknown }).focus === "function") {
      return heading as unknown as HTMLElement;
    }
  }
  return null;
}

/**
 * IS THIS ROW STILL THERE?
 *
 * THE REF IS THE SIGNAL, and that is the whole reason the trigger is read through a getter AFTER
 * the reload rather than captured before it: React sets a ref callback's element to `null` when the
 * component unmounts, so a null trigger IS "the row left the list" — reported by React itself,
 * needing no DOM query and behaving identically in a browser and in the RTL harness's stub DOM.
 * `isConnected` is consulted where the environment provides it, as a second belt for a node
 * detached without its ref being cleared.
 */
function stillMounted(el: HTMLElement | null): boolean {
  if (el === null) return false;
  if (typeof el.isConnected === "boolean") return el.isConnected;
  return true;
}

/**
 * THE ORDER, as a seam a cell can drive. Reload FIRST, focus SECOND.
 *
 * The landmark is passed in because it must be read while this subtree is still in the document;
 * the trigger is read through a getter because React nulls its ref exactly when the row unmounts,
 * which is the signal that the trigger is gone.
 */
export async function focusAfterRowReload(
  act: (fn: () => Promise<void>) => Promise<boolean>,
  getTrigger: () => HTMLElement | null,
  landmark: HTMLElement | null,
): Promise<void> {
  await act(async () => undefined);
  restoreFocusAfterRow(getTrigger(), landmark);
}

/** Put focus somewhere a person can work from, AFTER the list has settled. */
export function restoreFocusAfterRow(trigger: HTMLElement | null, landmark: HTMLElement | null): void {
  if (stillMounted(trigger)) {
    trigger?.focus();
    return;
  }
  if (landmark === null || !stillMounted(landmark)) return;
  if (!landmark.hasAttribute("tabindex")) landmark.setAttribute("tabindex", "-1");
  landmark.focus();
}

export function WorkQuestionAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  const t = useTranslations("WorkQuestion.inbox");
  const [open, setOpen] = useState(false);
  /** TRUE while the nested form's write is out. The row's own `busy` is the QUEUE's `act` state and
   *  the form does not go through `act`, so Close stayed enabled during a submit — and collapsing
   *  unmounts the form, whose `alive` guard then swallows the accepted answer and leaves this row
   *  in a queue with no poll to correct it. */
  const [submitting, setSubmitting] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const container = useRef<HTMLDivElement | null>(null);

  const questionId = row.question_id ?? row.id;

  // The row's own reload, run through the SAME act()-and-reload cycle every needs-you affordance
  // uses — never a bespoke read outside it. `act` resolves rather than rejects, so a failed reload
  // shows on the row instead of throwing into the list.
  const onAnswered = useCallback(() => {
    void focusAfterRowReload(act, () => trigger.current, landmarkHeadingFor(container.current));
  }, [act]);

  if (!questionId) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="needs-you-work-question" ref={container}>
      {error ? <ErrorMessage error={error} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={open ? "outline" : "default"}
          disabled={busy || submitting}
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
      {open ? (
        <WorkQuestionPanel
          questionId={questionId}
          onAnswered={onAnswered}
          // A CONVERGENCE IS A SETTLEMENT TOO. Somebody else answered it, it expired, or the Work
          // was cancelled — the row is no longer answerable either way, and the same reload-then-
          // focus path is what takes it out of the list without dumping focus.
          onSettled={onAnswered}
          onBusy={setSubmitting}
          onLeavePending={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
