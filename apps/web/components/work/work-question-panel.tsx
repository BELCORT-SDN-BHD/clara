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
import { WorkQuestionForm, type WorkQuestionAnnounce } from "@/components/work/work-question-form";
import { RestateWorkPanel } from "@/components/work/work-restate";
import { workDetailHref } from "@/lib/navigation/tree";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getSessionIdentity } from "@/lib/settings/account-identity";
import {
  accountsForQuestion, getPendingWorkQuestion, getWorkQuestion, type WorkQuestionRecord,
} from "@/lib/work/questions";

/**
 * #839 — THE RESTATE GATE, as a PURE function so a cell can drive it directly rather than through
 * `getSessionIdentity()`'s real Supabase browser client — the one seam this module's own header
 * says the RTL harness cannot reach (see `work-cards.test.tsx`'s "WHY 'ACCEPTED' IS NOT HERE").
 *
 * TRUE only when the CALLER asked for it (`offerRestate` — B3's own separate `RestateWorkPanel`
 * mount means this panel defaults OFF, see `WorkQuestionPanelProps.offerRestate`), the WORK is
 * still `awaiting_input` (matching exactly when `work-detail.tsx` offers its own copy — a question
 * round settling does not by itself mean the Work stopped waiting on a person), and the record
 * actually carries a `basis` to prefill (absent on a pre-0265 database, or on a record this build
 * could not read at all).
 */
export function offersRestateFor(
  record: WorkQuestionRecord | null | undefined,
  offerRestate: boolean,
): boolean {
  // #885 (third fix round) — …AND NOT A WORK THAT HAS ALREADY POSTED. `clara.restate_accounting_
  // work` refuses one CLR13 `not_restatable` (a committed receipt reads as completed), so offering
  // the control there is a 403 dressed as an affordance — the same rule L09-ADV-06 was fixed under.
  // The working exit for that Work is Cancel Work, which its own card already offers.
  return offerRestate && record?.work_status === "awaiting_input" && Boolean(record?.basis)
    && record?.work_posted !== true;
}

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
  /** Who announces (§5) — passed straight through to `WorkQuestionForm`, and to this panel's OWN
   *  door-unreachable banner below (which the form never sees). Default "self": B3 and B4 each own
   *  their surface's announcement boundary. #629 (B6) passes "none" from inside the Clara
   *  transcript, which already announces its own updates. */
  announce?: WorkQuestionAnnounce;
  /**
   * #839 — offer "Restate as a new instruction" beside the form, reusing `RestateWorkPanel`
   * exactly as the Work detail does (`work-detail.tsx` mounts it as a SIBLING of this same panel).
   *
   * DEFAULT FALSE, AND DELIBERATELY OPT-IN. The Work detail (B3) already mounts its OWN
   * `RestateWorkPanel` beside its `WorkQuestionPanel`, fed by the full `AccountingWorkRow` it loads
   * separately — turning this on there too would render restate TWICE (#839's own third acceptance
   * line: "no second restate door or duplicate restate UI").
   *
   * EXACTLY ONE CALLER PASSES `true`, AND IT DECIDES PER MOUNT. `WorkCards.tsx`'s
   * `WorkAcceptedCard` is the rail's single owner of this control, and it withholds it in two
   * cases the shipped branch did not consider (fix round, findings L09-ADV-05 and L09-ADV-06): the
   * rail is mounted on EVERY `(firm)` route including the Work detail itself, where B3's own panel
   * is already on screen; and `clara.restate_accounting_work` floors at bookkeeper, so the offer
   * carries the same rank gate the sibling Cancel control on that card already applies. Needs-you's
   * row (`work-question-affordance.tsx`) keeps the default — see this lane's fix report.
   */
  offerRestate?: boolean;
};

export function WorkQuestionPanel({
  workId, questionId, onAnswered, onSettled, onBusy, onLeavePending, fallbackQuestion = null, announce,
  offerRestate = false,
}: WorkQuestionPanelProps) {
  const t = useTranslations("WorkQuestion.inbox");
  const silent = announce === "none";
  const load = useCallback(async () => {
    const record = questionId ? await getWorkQuestion(questionId) : workId ? await getPendingWorkQuestion(workId) : null;
    const identity = await getSessionIdentity();
    // The chart, ONLY when the question declares an `account` field — see accountsForQuestion.
    return { record, identity, accounts: await accountsForQuestion(record) };
  }, [questionId, workId]);
  const { data, loading, err, reload } = useHydratedPart(sessionTokenAccessor, load);

  // #839 — THE RESTATE OFFER IS COMPUTED ONCE AND RENDERED ON EVERY ARM THAT HAS A RECORD, and
  // that is a correction rather than a convenience (fix round, review finding L09-SPEC-04). It used
  // to sit inside the final return, BELOW the `!data.identity` guard — but restating needs the
  // QUESTION RECORD (the work id, the client id, the admitted basis) and the caller's session
  // token, and nothing else. `getSessionIdentity()` is the FORM's input: it stamps who is
  // answering. Gating restate on it made the control unreachable exactly where the identity read
  // comes back empty, and unreachable to any cell too — that read is a real `@supabase/ssr`
  // browser client this harness has no seam for, which is why AC2 had no render proof at all.
  const record = data?.record ?? null;
  const restate = record !== null && offersRestateFor(record, offerRestate) ? (
    <RestateWorkPanel
      work={{ id: record.work_id, basis: record.basis ?? null }}
      clientId={record.client_id}
      session={sessionTokenAccessor}
      onRestated={reload}
    />
  ) : null;

  if (loading) {
    // THE QUESTION IS ALREADY KNOWN; only its typed fields are not. The calling page read the
    // interruption row before this door was called, so printing the run's own words NOW rather than
    // after a round trip is strictly better — and it keeps ONE owner for that text either way, which
    // is the whole point of the caller having handed it down instead of rendering it itself.
    return (
      <div className="flex flex-col gap-2">
        {fallbackQuestion?.question ? (
          <p className="text-sm font-medium text-foreground" data-testid="work-question-fallback-text">
            {fallbackQuestion.question}
          </p>
        ) : null}
        {fallbackQuestion?.context ? (
          <p className="text-xs text-secondary-ink">{fallbackQuestion.context}</p>
        ) : null}
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-9 w-full max-w-sm" />
        </div>
      </div>
    );
  }
  if (err !== null || !data?.record || !data.identity) {
    // Nothing to read and nothing to fall back on: render nothing — except the restate offer, if
    // the record itself DID arrive and only the identity did not. A person who can still see the
    // Work's admitted basis can still say the instruction was wrong.
    if (err === null && !fallbackQuestion?.question) return restate;
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
        {err !== null ? <StateBanner tone="warning" silent={silent}>{t("loadFailed")}</StateBanner> : null}
        {restate}
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
        announce={announce}
      />
      {/* #839 — AND THE OTHER ANSWER, matching `work-detail.tsx`'s own placement of this exact
          sibling beside its copy of this form. Gated on the WORK's own status (not the question's):
          B3 offers restate for as long as the Work is `awaiting_input`, whatever this particular
          question round's own state is, and this mirrors that rather than tying restate to one
          question's lifecycle. `basis` is the presence check — a record read from a database below
          the 0265 frontier carries no such key and renders nothing here, honestly. Built above, so
          the three arms of this component cannot drift into three different offers. */}
      {restate}
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
