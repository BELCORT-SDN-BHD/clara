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
// A BACKGROUND POLL MUST NOT STEAL FOCUS. This panel mounts once per parked Work and does not
// re-mount on the detail's 3-second poll (the poll re-reads the Work row; this component's own key
// is the question id, which does not change while a question is pending). §4's rule — "merely
// opening a background update does not steal focus" — is preserved by construction rather than by
// a focus guard.

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkQuestionForm } from "@/components/work/work-question-form";
import { workDetailHref } from "@/lib/navigation/tree";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getSessionIdentity } from "@/lib/settings/account-identity";
import { getPendingWorkQuestion, getWorkQuestion } from "@/lib/work/questions";

export type WorkQuestionPanelProps = {
  /** Address by WORK when the caller knows the Work (B3), by QUESTION when it knows the question
   *  (B4, B6). Exactly one is required; both resolve to the SAME record. */
  workId?: string;
  questionId?: string;
  /** Called after an accepted answer, so the surface can re-read what it owns. */
  onAnswered?: () => void;
  onLeavePending?: () => void;
};

export function WorkQuestionPanel({ workId, questionId, onAnswered, onLeavePending }: WorkQuestionPanelProps) {
  const t = useTranslations("WorkQuestion.inbox");
  const load = useCallback(async () => {
    const record = questionId ? await getWorkQuestion(questionId) : workId ? await getPendingWorkQuestion(workId) : null;
    const identity = await getSessionIdentity();
    return { record, identity };
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
  if (err !== null) return <StateBanner tone="warning">{t("loadFailed")}</StateBanner>;
  if (!data?.record || !data.identity) return null;

  return (
    <div className="flex flex-col gap-2">
      <WorkQuestionForm
        record={data.record}
        userId={data.identity.userId}
        onAnswered={onAnswered}
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
