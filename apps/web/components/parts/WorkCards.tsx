"use client";

// B6 — THE THREE DURABLE-WORK CARDS. The receipt a conversation leaves behind
// when Clara admits an accounting operation, the run's own progress note, and
// the committed effect.
//
// THEY RENDER THE WIRE AND STOP, exactly as the four chatTurn_v14 receipt cards
// do (./V14ReceiptCards.tsx's header for the full argument), and the reason is
// the same one stated positively: what a reader needs from a chat card is the
// IDENTITY of the thing that happened plus a route to where it lives. The Work's
// status, its basis, its receipt and its posted lines are all read LIVE on the
// Work detail page, under the caller's own RLS. Hydrating them here would put a
// second, slower copy of that page inside a transcript — and a copy that goes
// stale the moment the run settles, because a conversation stays on screen
// forever while a Work does not stay queued.
//
// §5's ANNOUNCEMENT BOUNDARY IS WHY NONE OF THESE IS A LIVE REGION. The
// transcript already has one announcement owner (ClaraThreadView's own log);
// a card that also announced itself would say the same result twice. These are
// static content inside that region.
//
// EVERY LINK IS A REAL IN-APP PATH OR IT IS NOT RENDERED. `work_accepted` and
// `work_result` carry a client id and can build one; `work_status` does not
// carry one at all (see ../../lib/parts/types.ts), so it offers none rather than
// inventing a route from a value the wire does not have.
//
// TWO OF THESE THREE ARE LIVE-STREAM-ONLY, AND THE SHARED CONTRACT'S PHRASE
// "PARTS PERSISTED THROUGH THE SETTLE" WAS NEVER IMPLEMENTED. Recorded here
// rather than quietly carried, because it changes what a reader may conclude
// from a card's ABSENCE:
//
//   `work_accepted` IS durable. It is minted by a CHAT turn (`chatTurn_v18`),
//   so it lands in `clara.chat_messages.parts` and is replayed on every later
//   read of that transcript — which is why the B6 conversation still shows it
//   days later.
//
//   `work_status` and `work_result` are NOT. A `claraWork` run writes them to
//   its own writable and they reach a reader through `GET /api/tasks/:id/stream`
//   WHILE THE RUN IS EXECUTING. The stream route's terminal message replays
//   `clara.chat_messages.parts`, and an `accounting_work` task has no chat
//   message — it carries `session_id NULL` by construction — so a reader that
//   attaches after the run ends gets replayed chunks and a `done`, never a
//   durable parts array (packages/runtime/workflows/claraWork.v1.parts.ts states
//   the same thing from the emitter's side).
//
// SO NOTHING IS LOST, AND THE REASON IS NOT THESE CARDS. The durable surface is
// `clara.accounting_work` itself — `status` for what `work_status` narrated,
// `result` (`entry_id`, `receipt_id`) for what `work_result` carried — and the
// Work detail polls that row every 3 s while the Work is non-terminal
// (../work/work-detail.tsx, ../../lib/work/use-work-detail.ts). THAT is the
// mechanism the product relies on; these two cards are a live convenience over
// it, and neither is ever the only record of an effect.
//
// THEY STAY ANYWAY, and not only for parity. The reader must declare every kind
// the runtime can emit (`packages/runtime/scripts/check-parts-parity.mjs` is a CI
// gate), and a declared kind with no render branch is a part that reaches a
// transcript and paints nothing.

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "./PartBadge";
import { PartSummaryCard } from "./PartSummaryCard";
import { usableId } from "./PartCardShell";
import { workDetailHref } from "@/lib/navigation/tree";
import { WorkQuestionForm } from "@/components/work/work-question-form";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getSessionIdentity } from "@/lib/settings/account-identity";
import { accountsForQuestion, getWorkQuestion } from "@/lib/work/questions";
import type { WorkAcceptedPart, WorkQuestionPart, WorkResultPart, WorkStatusPart } from "@/lib/parts/types";

/** The accepted-Work receipt. Links to the durable detail — the persistent
 *  outcome §3 requires an accepted long operation to have. */
export function WorkAcceptedCard({ part }: { part: WorkAcceptedPart }) {
  const t = useTranslations("Clara.parts.workAccepted");
  const addressable = usableId(part.work_id) && usableId(part.client_id);
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("purposeLabel"), part.purpose],
        [t("workLabel"), part.work_id],
        [t("operationLabel"), part.logical_op_id],
      ]}
      note={t("note")}
      link={addressable ? { href: workDetailHref(part.client_id, part.work_id), label: t("link") } : null}
    />
  );
}

/** The compact status line. NOT a card: it is one observed word about a run that
 *  is still going, and wrapping it in a titled panel would give a progress note
 *  the same visual weight as a receipt. Named for a screen reader, so "running"
 *  is never announced as a bare adjective with no subject. */
export function WorkStatusLine({ part }: { part: WorkStatusPart }) {
  const t = useTranslations("Clara.parts.workStatus");
  return (
    // `text-secondary-ink`, NOT `text-muted-foreground`, and the reason is a
    // MEASUREMENT rather than a preference. This line is the only part on these
    // three cards that sits directly on the assistant bubble's `bg-clara-muted`
    // rather than on a `bg-card` panel, and axe measured `muted-foreground`
    // (#687171) on that ground at 4.49:1 — short of the 4.5:1 AA floor, caught
    // by this ticket's browser walk. `InterviewRunCard.tsx` records the same
    // defect and the same remedy: `secondary-ink` (#4b5353) is an existing
    // catalogued secondary-prose token, strictly darker on every channel, and
    // clears clara-muted at 7.08:1. The token-contrast gate does not carry a
    // `muted-foreground-on-clara-muted` pair because the product must simply not
    // use that pairing; the pair that IS catalogued is this one.
    <p className="flex flex-wrap items-center gap-2 text-xs text-secondary-ink">
      <span>{t("label")}</span>
      {/* The DB's own status word, verbatim — never translated, because it is a
          value the database owns rather than this app's copy. The label beside
          it is this app's words, which is what makes the pair readable. */}
      <Badge tone="info">{part.status}</Badge>
      <span className="wrap-anywhere">{t("workLabel", { work: part.work_id })}</span>
    </p>
  );
}

/** The committed effect: one entry, one receipt. Links to the journals
 *  workbench, which holds the live read of that entry's lines and total — the
 *  same destination `EntryPostedCard` uses, and for the same reason. */
export function WorkResultCard({ part }: { part: WorkResultPart }) {
  const t = useTranslations("Clara.parts.workResult");
  const addressable = usableId(part.client_id);
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("entryLabel"), part.entry_id],
        [t("receiptLabel"), part.receipt_id],
        [t("workLabel"), part.work_id],
      ]}
      note={t("note")}
      link={
        addressable
          ? { href: `/clients/${encodeURIComponent(part.client_id)}/journals`, label: t("link") }
          : null
      }
    />
  );
}

/**
 * #629 — THE SHARED QUESTION, IN THE CONVERSATION THAT STARTED THE WORK.
 *
 * IT HYDRATES AND IT DOES NOT REMEMBER. The part carries identifiers and a LAST-HEARD status; the
 * question text, its reason, its typed fields and its accepted answer are read from
 * `clara.get_work_question` on mount and re-read after every action. That is what makes this card
 * converge rather than argue when somebody answers the same question from Needs-you while this
 * transcript is on screen — the exact "answer accepted elsewhere" row of the shared state contract.
 *
 * IT RENDERS THE SAME FORM B3 AND B4 RENDER. Not a chat-shaped variant of it: the acceptance line
 * is that the three surfaces show one question and post one answer, and a card with its own inputs
 * would be a second question wearing the first one's identifiers.
 *
 * NO LIVE REGION, exactly like its three siblings above — and it is passed, not assumed. The form
 * renders `StateBanner`s, which compute `role="alert"`/`"status"`, so a card that simply mounted it
 * would open up to six live regions inside a log that already announces its own updates: one
 * accepted answer spoken twice, and a converging card speaking a state the transcript had already
 * said. `announce="none"` renders exactly the same boxes with exactly the same text and no role at
 * all. §5, one announcement owner per transition.
 */
export function WorkQuestionCard({ part }: { part: WorkQuestionPart }) {
  const t = useTranslations("WorkQuestion.card");
  const addressable = usableId(part.work_id) && usableId(part.client_id);
  const load = useCallback(async () => {
    const record = await getWorkQuestion(part.question_id);
    return {
      record,
      identity: await getSessionIdentity(),
      // ONLY WHEN THE QUESTION ACTUALLY ASKS FOR ONE. The chart is a client-scoped read and a card
      // in a transcript should not issue it to render a date field.
      accounts: await accountsForQuestion(record),
    };
  }, [part.question_id]);
  const { data, loading } = useHydratedPart(sessionTokenAccessor, load);

  return (
    <PartSummaryCard
      title={t("title")}
      rows={[[t("workLabel", { work: part.work_id }), `#${part.question_version}`]]}
      note={loading ? t("loading") : data?.record ? null : t("unavailable")}
      link={addressable ? { href: workDetailHref(part.client_id, part.work_id), label: t("openWork") } : null}
    >
      {data?.record && data.identity ? (
        <WorkQuestionForm
          record={data.record}
          userId={data.identity.userId}
          announce="none"
          accounts={data.accounts}
        />
      ) : null}
    </PartSummaryCard>
  );
}
