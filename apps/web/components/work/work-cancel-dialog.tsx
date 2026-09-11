"use client";

// #630 — CANCEL WORK, and TAKE RESPONSIBILITY. Two controls, two dialogs, one rule between them:
// NOTHING HERE PAINTS AN OUTCOME IT WAS NOT TOLD BY A FRESH READ.
//
// WHY "Cancel Work" IS NOT "Stop". The rail's own control stops a REPLY — the response stream and
// the chat turn behind it — and it must not touch Work a person already accepted. This one stops
// the durable unit. The two are separately named everywhere they appear, because a human who
// pressed the wrong one would either lose a reply they wanted or keep an operation they meant to
// stop, and neither is recoverable by pressing the other.
//
// WHY A DIALOG. Appendix D's own rule: "a focused, bounded decision that can complete without
// losing page context". One question, two answers, and the SAFE one holds initial focus — a
// destructive default is how a keyboard user cancels something by pressing Enter.
//
// THE ANSWER IS NOT A BOOLEAN, and the four arms below are the four true things the database can
// come back with (see lib/work/api.ts's own header). The one that matters most is
// `already_completed`: the operation won the race, the entry is on the books, and this component's
// job is to SAY SO and link to it — never to report a cancellation that did not happen.
//
// THE OP KEY SURVIVES AN UNOBSERVED OUTCOME. `lost` and `unavailable` both mean nobody can say
// whether the door ran, so the retry rides the SAME key and lets `clara._reserve_op` answer. A
// fresh key would ask a second question the database cannot connect to the first.

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StateBanner } from "@/components/common/state";
import { journalEntryHref } from "@/lib/navigation/tree";
import { cancelWork, takeOverWork, type CancelWorkResult, type TakeOverWorkResult } from "@/lib/work/api";
import { isCancellableWorkStatus } from "@/lib/work/types";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

/** A stable key per OPEN DECISION. Minted when the dialog opens and reused for every attempt at
 *  that decision, so an unobserved first attempt and its retry are ONE operation to the database.
 *  A new press of the trigger is a new decision and mints a new one. */
function useDecisionKey(): { key: () => string; renew: () => void } {
  const ref = useRef<string | null>(null);
  return {
    key: () => {
      if (ref.current === null) ref.current = crypto.randomUUID();
      return ref.current;
    },
    renew: () => {
      ref.current = null;
    },
  };
}

export function CancelWorkDialog({
  workId,
  clientId,
  onCancelled,
  onAnswer,
  returnFocusTo,
  cancel = cancelWork,
  session = sessionTokenAccessor,
}: {
  workId: string;
  clientId: string;
  /** Re-read the Work after ANY completed attempt, refusal included — hydrate-never-trust. */
  onCancelled: () => void | Promise<void>;
  /**
   * THE ANSWER GOES TO THE PAGE, NOT TO THIS COMPONENT. Measured in the browser walk: an accepted
   * cancel moves the Work out of a cancellable status, the trigger that owns this dialog unmounts
   * with it — and an outcome rendered HERE unmounted too, taking the `already_completed` receipt
   * link with it the instant it mattered most. The caller holds the result and renders
   * `CancelOutcome` somewhere that survives the status change.
   */
  onAnswer?: (result: CancelWorkResult) => void;
  /**
   * WHERE FOCUS GOES WHEN THE TRIGGER IS NOT THERE TO RETURN TO. Base UI returns focus to the
   * control that opened the dialog, which is exactly right for a dismissal — and impossible after
   * an accepted cancel, because the Work's status moves and this component's own trigger unmounts
   * with it. Measured in the browser walk: focus fell to `<body>` and a keyboard reader lost their
   * place on the page. The id names a focusable landmark (the Work's heading carries `tabIndex=-1`
   * for the same reason the page focuses it on arrival); absent, nothing is moved.
   */
  returnFocusTo?: string;
  cancel?: typeof cancelWork;
  session?: SessionTokenAccessor;
}) {
  const t = useTranslations("WorkCancel");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CancelWorkResult | null>(null);
  const decision = useDecisionKey();
  void clientId;   // the answer's entry link is rendered by the PAGE, from the same value

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const answer = await cancel(session, { workId, opKey: decision.key() });
    setResult(answer);
    onAnswer?.(answer);
    setBusy(false);
    // AN OUTCOME NOBODY OBSERVED KEEPS THE DIALOG OPEN and keeps the key: the human's next act is
    // to try the same decision again, not to start a different one.
    if (answer.kind !== "lost" && answer.kind !== "unavailable") setOpen(false);
    // …and when the answer moves the Work OUT of a cancellable status, this trigger is about to
    // unmount. Hand focus to the named landmark on the next tick, AFTER the close has run its own
    // focus return — otherwise the return wins and lands on a node that no longer exists.
    if (returnFocusTo !== undefined
        && answer.kind === "answered"
        && !isCancellableWorkStatus(answer.status)) {
      setTimeout(() => {
        const doc: { getElementById?: (id: string) => { focus?: () => void } | null } | undefined =
          typeof document === "undefined" ? undefined : document;
        doc?.getElementById?.(returnFocusTo)?.focus?.();
      }, 0);
    }
    await onCancelled();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setResult(null);
            decision.renew();
          }
        }}
      >
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>{t("cancelWork")}</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            {/* WHAT STAYS, said before what stops. The one thing a person needs to know before
                they press this is that already-recorded accounting is not undone by it. */}
            <DialogDescription>{t("dialogBody")}</DialogDescription>
          </DialogHeader>
          {result !== null && (result.kind === "lost" || result.kind === "unavailable") ? (
            <StateBanner tone="error" title={result.kind === "lost" ? t("lostTitle") : t("unavailableTitle")}>
              {result.kind === "lost" ? t("lostBody") : t("unavailableBody")}
            </StateBanner>
          ) : null}
          <DialogFooter>
            {/* THE SAFE ACTION HOLDS INITIAL FOCUS. `autoFocus` on the close, never on the
                destructive confirm: Enter must not cancel a person's Work for them. */}
            <DialogClose render={<Button variant="outline" autoFocus />}>{t("keepRunning")}</DialogClose>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void submit()}>
              {busy ? t("cancelling") : t("confirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* THE IN-DIALOG ARM ONLY. Everything that survives the dialog's close is the PAGE's to
          render (see `onAnswer`); what stays here is the pair that keeps the dialog open, because
          those are answers the human is still inside the decision for. */}
    </>
  );
}

/** The answer, rendered OUTSIDE the dialog, because by the time it exists the dialog has closed and
 *  the page is what the person is reading. Never a toast: an accounting outcome is a persistent
 *  record, not a thing that disappears after four seconds. */
export function CancelOutcome({ result, clientId }: { result: CancelWorkResult | null; clientId: string }) {
  const t = useTranslations("WorkCancel");
  if (result === null) return null;
  if (result.kind === "denied") {
    return (
      <StateBanner tone="warning" title={t("deniedTitle")}>
        {t("deniedBody")}
      </StateBanner>
    );
  }
  if (result.kind === "not_found") {
    return (
      <StateBanner tone="neutral" title={t("notFoundTitle")}>
        {t("notFoundBody")}
      </StateBanner>
    );
  }
  if (result.kind === "conflict" || result.kind === "invalid") {
    return (
      <StateBanner tone="error" title={t("conflictTitle")} code={result.kind === "conflict" ? (result.status ?? undefined) : (result.reason ?? undefined)}>
        {t("notTakeableBody")}
      </StateBanner>
    );
  }
  if (result.kind !== "answered") return null;

  // THE OPERATION WON THE RACE. The entry stands, the Work is completed, and the link is the whole
  // point of this arm: a person who just pressed Cancel needs to see WHAT was recorded.
  if (result.reason === "already_completed") {
    return (
      <StateBanner
        tone="info"
        title={t("completedAfterCancelTitle")}
        action={
          result.entryId === null ? undefined : (
            <Link
              href={journalEntryHref(clientId, result.entryId)}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {t("viewEntry")}
            </Link>
          )
        }
      >
        {t("completedAfterCancelBody")}
      </StateBanner>
    );
  }
  if (result.reason === "already_terminal") {
    return (
      <StateBanner tone="neutral" title={t("alreadyTerminalTitle")} code={result.status}>
        {t("alreadyTerminalBody")}
      </StateBanner>
    );
  }
  // `stopping` / `cancelled` / `already_stopping` are all rendered by the PAGE from the Work's own
  // row, which the caller re-read the moment this answer arrived. Repeating them here would give
  // the page two owners for one fact and a screen reader two announcements of it.
  return null;
}

export function TakeOverWorkAction({
  workId,
  basisOrigin,
  basisDigest,
  onTakenOver,
  takeOver = takeOverWork,
  session = sessionTokenAccessor,
}: {
  workId: string;
  /** From the Work's own row. Used ONLY to decide whether to show the confirm step up front; the
   *  DATABASE decides whether a digest is required and refuses without one. */
  basisOrigin: string;
  basisDigest: string;
  onTakenOver: () => void | Promise<void>;
  takeOver?: typeof takeOverWork;
  session?: SessionTokenAccessor;
}) {
  const t = useTranslations("WorkCancel");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TakeOverWorkResult | null>(null);
  const decision = useDecisionKey();
  const interpreted = basisOrigin !== "user_direct";

  const submit = async (withDigest: boolean) => {
    if (busy) return;
    setBusy(true);
    const answer = await takeOver(session, {
      workId,
      opKey: decision.key(),
      basisDigest: withDigest ? basisDigest : null,
    });
    setResult(answer);
    setBusy(false);
    if (answer.kind === "accepted" || answer.kind === "not_takeable" || answer.kind === "denied") setOpen(false);
    await onTakenOver();
  };

  const action = interpreted ? (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setResult(null);
          decision.renew();
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{t("takeOver")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("takeOverConfirmTitle")}</DialogTitle>
          {/* THE CONFIRM EXISTS BECAUSE THE BASIS WAS INTERPRETED. Taking responsibility for
              figures Clara derived from prose means saying you have read them; the digest the
              database gets back is the receipt for that sentence. */}
          <DialogDescription>{t("takeOverConfirmBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" autoFocus />}>{t("takeOverCancel")}</DialogClose>
          <Button type="button" disabled={busy} onClick={() => void submit(true)}>
            {busy ? t("takingOver") : t("takeOverConfirmAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void submit(false)}>
      {busy ? t("takingOver") : t("takeOver")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      <StateBanner tone="warning" title={t("takeOverHeading")} action={action}>
        {t("takeOverBody")}
      </StateBanner>
      {result !== null && result.kind === "accepted" ? (
        <StateBanner tone="info" title={t("takeOverAcceptedTitle")}>
          {t("takeOverAcceptedBody")}
        </StateBanner>
      ) : null}
      {result !== null && result.kind === "not_takeable" ? (
        <StateBanner tone="error" title={t("notTakeableTitle")} code={result.status ?? undefined}>
          {t("notTakeableBody")}
        </StateBanner>
      ) : null}
      {result !== null && result.kind === "confirm_basis" ? (
        <StateBanner tone="warning" title={t("takeOverConfirmTitle")}>
          {t("takeOverConfirmBody")}
        </StateBanner>
      ) : null}
      {result !== null && result.kind === "denied" ? (
        <StateBanner tone="warning" title={t("deniedTitle")}>
          {t("deniedBody")}
        </StateBanner>
      ) : null}
      {result !== null && (result.kind === "unavailable" || result.kind === "lost") ? (
        <StateBanner tone="error" title={result.kind === "lost" ? t("lostTitle") : t("unavailableTitle")}>
          {result.kind === "lost" ? t("lostBody") : t("unavailableBody")}
        </StateBanner>
      ) : null}
    </div>
  );
}
