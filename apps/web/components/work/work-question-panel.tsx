"use client";

// #629 (B3) — THE PARKED QUESTION, ANSWERABLE WHERE IT IS READ.
//
// WHAT THIS REPLACES. The Work detail used to render the question's TEXT and then a link to
// Needs-you, with the sentence "answering is #629's surface rather than this one's". #629 is this
// surface too: the acceptance line asks a person to answer "from any surface", and the page that
// already knows the Work is the most natural one of the three. The link stays — a person who wants
// the whole inbox should be able to get there — but they are no longer SENT there to type one date.
//
// IT HYDRATES; IT DOES NOT TRUST THE PAGE'S OWN READ. `loadWorkDetail` reads the interruption row
// directly (a plain RLS table read) and that read stays — it is the fallback text when this door is
// unreachable. What the FORM needs is the typed fields, the reason and the version, which live
// behind `clara.get_work_question`, and it re-reads them here rather than accepting a projection
// built for a banner.
//
// A BACKGROUND POLL MUST NOT STEAL FOCUS, AND A RE-ASKED QUESTION MUST NOT BE MISSED. The two pull
// in opposite directions and the KEY is where they are reconciled: the Work detail keys this panel
// on the PENDING INTERRUPTION ROW (`work-detail.tsx`), which does not change while one question is
// open — so the detail's 3-second poll re-reads the Work row and never re-mounts this, and §4's
// "merely opening a background update does not steal focus" holds by construction rather than by a
// focus guard — but which DOES change the moment the run asks again, because a re-asked question is
// a NEW row with the next version (0180). Keying on the Work alone kept question 1's accepted
// record on screen while question 2 waited; keying on the question is what makes the remount the
// reload.

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkQuestionForm } from "@/components/work/work-question-form";
import { workDetailHref } from "@/lib/navigation/tree";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getSessionIdentity } from "@/lib/settings/account-identity";
import { accountsForQuestion, getPendingWorkQuestion, getWorkQuestion } from "@/lib/work/questions";

export type WorkQuestionPanelProps = {
  /** Address by WORK when the caller knows the Work (B3), by QUESTION when it knows the question
   *  (B4, B6). Exactly one is required; both resolve to the SAME record. */
  workId?: string;
  questionId?: string;
  /** Called after an accepted answer, so the surface can re-read what it owns. */
  onAnswered?: () => void;
  /** Called when the question SETTLES for any reason — accepted here, or converged onto an answer,
   *  an expiry or a cancellation that happened elsewhere. A surface that lists pending questions
   *  has to re-read on the second case too: `use-review-queue.ts` loads on mount and on `act` and
   *  has no poll, so a row that converged without this callback stayed in Needs-you for ever. */
  onSettled?: () => void;
  /** TRUE while the form's submit is in flight — see `WorkQuestionFormProps.onBusy`. */
  onBusy?: (busy: boolean) => void;
  onLeavePending?: () => void;
  /** The run's own words, read from the interruption ROW by the calling page, rendered ONLY when
   *  this door cannot be. B3 owns such a read already (`loadWorkDetail`); handing it down is what
   *  lets the Work detail's banner stop printing the question a second time (§5's one-owner rule
   *  applied to text, not only to announcements) without losing the fallback. */
  fallbackQuestion?: { question: string | null; context: string | null } | null;
};

export function WorkQuestionPanel({
  workId, questionId, onAnswered, onSettled, onBusy, onLeavePending, fallbackQuestion = null,
}: WorkQuestionPanelProps) {
  const t = useTranslations("WorkQuestion.inbox");
  const load = useCallback(async () => {
    const record = questionId ? await getWorkQuestion(questionId) : workId ? await getPendingWorkQuestion(workId) : null;
    const identity = await getSessionIdentity();
    // The chart, ONLY when the question declares an `account` field — see accountsForQuestion.
    return { record, identity, accounts: await accountsForQuestion(record) };
  }, [questionId, workId]);
  const { data, loading, err } = useHydratedPart(sessionTokenAccessor, load);

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </div>
    );
  }
  if (err !== null || !data?.record || !data.identity) {
    // Nothing to read and nothing to fall back on: render nothing, exactly as before.
    if (err === null && !fallbackQuestion?.question) return null;
    // THE DOOR COULD NOT BE READ, or admitted nothing to this caller. The question does not
    // disappear from the page when that happens: the calling surface's own row read is rendered
    // here instead, which is where the question text now lives on B3.
    return (
      <div className="flex flex-col gap-2" data-testid="work-question-fallback">
        {fallbackQuestion?.question ? (
          <p className="text-sm font-medium text-foreground" data-testid="work-question-fallback-text">
            {fallbackQuestion.question}
          </p>
        ) : null}
        {fallbackQuestion?.context ? (
          <p className="text-xs text-secondary-ink">{fallbackQuestion.context}</p>
        ) : null}
        {err !== null ? <StateBanner tone="warning">{t("loadFailed")}</StateBanner> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <WorkQuestionForm
        record={data.record}
        userId={data.identity.userId}
        accounts={data.accounts}
        onAnswered={onAnswered}
        onSettled={onSettled}
        onBusy={onBusy}
        onLeavePending={onLeavePending}
      />
      {/* THE ROUTE TO THE WORK, built from the HYDRATED record rather than from whatever the
          calling surface happened to have. Offered only where this panel is NOT already on the
          Work's own page (`questionId` addressing means the caller knew the question, not the
          Work) — a link back to the page you are reading is noise. */}
      {questionId && data.record.client_id ? (
        <a
          className="text-sm font-medium text-primary underline underline-offset-2"
          href={workDetailHref(data.record.client_id, data.record.work_id)}
        >
          {t("openWork")}
        </a>
      ) : null}
    </div>
  );
}
