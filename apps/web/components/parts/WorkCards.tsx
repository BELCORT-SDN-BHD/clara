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

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { CancelOutcome, CancelWorkDialog } from "@/components/work/work-cancel-dialog";
import { useFirmScopeOrNull } from "@/components/firm-scope-provider";
import { isCancellableWorkStatus, TERMINAL_WORK_STATUSES } from "@/lib/work/types";
import { roleRankOf } from "@/lib/identity/caller-context";
import type { CancelWorkResult } from "@/lib/work/api";

import { Badge } from "./PartBadge";
import { PartSummaryCard } from "./PartSummaryCard";
import { usableId } from "./PartCardShell";
import { workDetailHref } from "@/lib/navigation/tree";
import { WorkQuestionForm } from "@/components/work/work-question-form";
import { WorkQuestionPanel } from "@/components/work/work-question-panel";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getSessionIdentity } from "@/lib/settings/account-identity";
import { getAccountingWork } from "@/lib/work/reads";
import { accountsForQuestion, getWorkQuestion } from "@/lib/work/questions";
import type { WorkAcceptedPart, WorkQuestionPart, WorkResultPart, WorkStatusPart } from "@/lib/parts/types";

/**
 * The accepted-Work receipt. Links to the durable detail — the persistent outcome §3 requires an
 * accepted long operation to have.
 *
 * #629 (B6) — THE GAP THIS CLOSES. `work_question` above is the run's LIVE-STREAM face and this
 * file's own header states plainly that it does not survive past the run: a Work that parks on a
 * question while nobody is watching the transcript used to become unanswerable from here after a
 * reload, because the ONLY durable part on the Work is this one, and it never looked past its own
 * three identifiers. `work_accepted` IS durable (minted by `chatTurn_v18` into
 * `clara.chat_messages.parts`), so it is the one card that can still FIND the question later.
 *
 * ONE LIGHT READ, ON MOUNT, DECIDES WHETHER TO OFFER IT. `getAccountingWork` is the Work queue's
 * own single-row read — not `loadWorkDetail`'s whole bundle (task, receipts, chart, entry, lines,
 * interruption), which is built for a page that also renders a basis table and has no business
 * being spent by a chat card that only needs one column. When that read says `awaiting_input`, this
 * card mounts the SAME `WorkQuestionPanel` B3 (the Work detail) and B4 (Needs-you) render,
 * addressed by WORK id — `getPendingWorkQuestion` / `clara.get_work_pending_question`, exactly as
 * B3 addresses it — so the three surfaces keep answering one question rather than three.
 * `announce="none"`: this card sits inside the transcript's own announcement boundary (this file's
 * header, §5), so the panel's banners render as plain boxes with no role, the same posture
 * `WorkQuestionCard` already takes below for the live-stream question.
 *
 * NO NEW POLLING, and the gate is read ONCE. After an accepted or converged answer, it is the
 * PANEL's own form that re-reads `clara.get_work_question` and switches to its accepted/converged
 * rendering in place (`work-question-form.tsx`'s `reread`) — this card does not need to ask "is the
 * Work still parked" again to keep showing that outcome, and doing so would risk unmounting the
 * very panel that just rendered the accepted record. A Work that is NOT parked at mount renders
 * exactly as it always has — no panel, no read beyond the one status check.
 */
/** #630 — the rail card's convergence interval. The same 3 s the Work detail page polls on
 *  (`lib/work/use-work-detail.ts`'s WORK_POLL_MS): one Work, two surfaces, one rhythm. */
export const WORK_CARD_POLL_MS = 3_000;

export function WorkAcceptedCard({ part }: { part: WorkAcceptedPart }) {
  const t = useTranslations("Clara.parts.workAccepted");
  const tw = useTranslations("WorkCancel");
  const addressable = usableId(part.work_id) && usableId(part.client_id);
  const load = useCallback(async () => {
    if (!addressable) return null;
    return await getAccountingWork(part.client_id, part.work_id);
  }, [addressable, part.client_id, part.work_id]);
  const { data: work, reload } = useHydratedPart(sessionTokenAccessor, load);
  const parked = work?.status === "awaiting_input";
  const headingId = `work-accepted-${part.work_id}`;

  // #630 (review) — THE CARD CONVERGES, and before this it could not. `useHydratedPart` reads on
  // mount and on an explicit `reload()` only, so the single re-read a cancel triggers landed while
  // the Work was still `stopping` — and the card then showed `stopping` for ever, on a row the
  // database had long since settled. The Work detail page solves this with `WORK_POLL_MS = 3_000`;
  // the same interval, with the same "stop at the terminal" law, is what makes the sentence this
  // card prints ("this Work will show its final state once that is settled") true.
  //
  // IT POLLS ONLY WHILE THERE IS SOMETHING TO CONVERGE: a Work that is terminal, absent, or not
  // addressable schedules nothing, so a transcript full of finished Work cards is silent.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const status = work?.status ?? null;
  const converging = status !== null && !TERMINAL_WORK_STATUSES.has(status);
  useEffect(() => {
    if (!addressable || !converging) return undefined;
    const id = setInterval(() => { void reloadRef.current(); }, WORK_CARD_POLL_MS);
    return () => clearInterval(id);
  }, [addressable, converging]);
  // #630 — CANCEL WORK LIVES ON *THIS* CARD, not on the `work_status` line, and the reason is a
  // measurement rather than a preference: `work_status` carries no client id (this file's own header
  // records it), so a control there could not build the entry link the `already_completed` answer
  // needs, and the dialog would have to render an outcome it cannot address. This card already
  // hydrates the LIVE Work row, so the offer is made against the database's current status rather
  // than against the status the part was written with — which for a part in a transcript is almost
  // always stale.
  // …AND THE OFFER CARRIES THE ESTATE'S OWN FLOOR. `clara.cancel_accounting_work` floors at
  // bookkeeper, so a viewer or clerk pressing this could only ever be handed a 403 — a destructive
  // control shown to people who can never use it. The rank is the DATABASE's `role_rank`, and a
  // card mounted outside the firm scope (a node cell) reads null and offers nothing.
  const scope = useFirmScopeOrNull();
  const bookkeeperPlus = typeof scope?.role_rank === "number" && scope.role_rank >= roleRankOf("bookkeeper");
  const cancellable = bookkeeperPlus && work !== null && isCancellableWorkStatus(work.status);
  // …and the ANSWER lives on the card rather than inside the dialog, for the reason work-detail's
  // own copy of this state records: the trigger unmounts with the status change that produced it.
  const [cancelState, setCancelState] = useState<CancelWorkResult | null>(null);

  return (
    <PartSummaryCard
      title={t("title")}
      titleId={headingId}
      rows={[
        [t("purposeLabel"), part.purpose],
        [t("workLabel"), part.work_id],
        [t("operationLabel"), part.logical_op_id],
      ]}
      note={t("note")}
      link={addressable ? { href: workDetailHref(part.client_id, part.work_id), label: t("link") } : null}
    >
      {parked ? <WorkQuestionPanel workId={part.work_id} announce="none" /> : null}
      {cancellable ? (
        <CancelWorkDialog
          workId={part.work_id}
          clientId={part.client_id}
          onCancelled={reload}
          onAnswer={setCancelState}
          // #630 (review) — WHERE FOCUS GOES WHEN THIS TRIGGER UNMOUNTS. An accepted cancel moves
          // the Work out of a cancellable status and takes the trigger with it, so Base UI's own
          // focus return lands on a node that no longer exists and the reader is dropped on
          // `<body>` — in a long scrolling transcript, that is losing their place entirely. The
          // Work detail page names its heading for exactly this; the card names its own.
          returnFocusTo={headingId}
        />
      ) : null}
      {/* SILENT, because this card lives inside the transcript's `role="log" aria-live="polite"`
          region and a banner with its own `role="status"`/`role="alert"` there is a NESTED live
          region — the DS-04 defect #629 removed from this surface, and one the a11y gate refuses.
          The log announces the card's mutation; the banner must not announce itself as well. */}
      <CancelOutcome result={cancelState} clientId={part.client_id} silent />
      {/* THE CONVERGED STATE, from the SAME hydrated row the offer was made against. `stopping` is
          rendered by name so the rail says the same word the Work detail does while an admitted
          operation settles — one vocabulary across both surfaces. */}
      {work !== null && (work.status === "stopping" || work.status === "cancelled") ? (
        <p className="text-xs text-secondary-ink">
          {work.status === "stopping" ? tw("stoppingBody") : tw("cancelledBody")}
        </p>
      ) : null}
    </PartSummaryCard>
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
