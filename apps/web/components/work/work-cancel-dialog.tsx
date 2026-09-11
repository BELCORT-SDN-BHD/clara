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

import { useRef, useState, type ReactNode } from "react";
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
import { WorkBasisTable } from "@/components/work/work-tables";
import { journalEntryHref } from "@/lib/navigation/tree";
import { cancelWork, takeOverWork, type CancelWorkResult, type TakeOverWorkResult } from "@/lib/work/api";
import { isCancellableWorkStatus, type WorkBasis } from "@/lib/work/types";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

/**
 * ONE DECISION, ONE DIALOG, ONE RESET. Both dialogs in this file open the same way — mint a fresh
 * op key for the new decision, forget the previous answer — and an earlier cut wrote that block out
 * twice, byte for byte. A later change to WHEN a key is renewed would have had to find both.
 */
function useDecisionDialog(): {
  open: boolean;
  setOpen: (next: boolean) => void;
  onOpenChange: (next: boolean) => void;
  key: () => string;
} {
  const [open, setOpen] = useState(false);
  const decision = useDecisionKey();
  return {
    open,
    setOpen,
    onOpenChange: (next: boolean) => {
      setOpen(next);
      if (next) decision.renew();
    },
    key: decision.key,
  };
}

/**
 * THE TWO ANSWERS NOBODY OBSERVED, in one place. `lost` and `unavailable` mean the same thing to a
 * reader — nobody can say whether the door ran — and they are the two that keep a dialog OPEN,
 * because the human's next act is to try the SAME decision again. Rendered identically by both
 * dialogs, from one implementation, so a copy-edit cannot land on one of them.
 */
function UnobservedBanner({ kind, noun }: { kind: "lost" | "unavailable"; noun: "cancel" | "takeOver" }) {
  const t = useTranslations("WorkCancel");
  // The two key families, written out rather than assembled from fragments: `check-message-keys.mjs`
  // reads this file for LITERAL keys, and a key built by concatenation is a key it cannot see.
  const keys = noun === "cancel"
    ? { lostTitle: "lostTitle", lostBody: "lostBody", unavailableTitle: "unavailableTitle", unavailableBody: "unavailableBody" }
    : { lostTitle: "takeOverLostTitle", lostBody: "takeOverLostBody", unavailableTitle: "takeOverUnavailableTitle", unavailableBody: "takeOverUnavailableBody" };
  return (
    <StateBanner tone="error" title={kind === "lost" ? t(keys.lostTitle) : t(keys.unavailableTitle)}>
      {kind === "lost" ? t(keys.lostBody) : t(keys.unavailableBody)}
    </StateBanner>
  );
}

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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CancelWorkResult | null>(null);
  const dialog = useDecisionDialog();
  const { open, setOpen } = dialog;
  const decision = { key: dialog.key };
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
          setResult(null);
          dialog.onOpenChange(next);
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
            <UnobservedBanner kind={result.kind} noun="cancel" />
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
export function CancelOutcome({
  result,
  clientId,
  silent = false,
}: {
  result: CancelWorkResult | null;
  clientId: string;
  /**
   * #630 (review) — ONE ANNOUNCEMENT OWNER. `StateBanner` computes `role="alert"`/`role="status"`
   * unless told otherwise, and the Clara transcript is itself a `role="log" aria-live="polite"`
   * region: a banner mounted inside it is a NESTED live region, which is the DS-04 defect #629
   * removed from this exact surface and which `apps/web/test/a11yRules.ts`'s `nested-live-region`
   * gate refuses. The rail's card passes `silent`; the Work detail page, which owns its own
   * announcement, does not.
   */
  silent?: boolean;
}) {
  const t = useTranslations("WorkCancel");
  if (result === null) return null;
  if (result.kind === "denied") {
    return (
      <StateBanner tone="warning" title={t("deniedTitle")} silent={silent}>
        {t("deniedBody")}
      </StateBanner>
    );
  }
  if (result.kind === "not_found") {
    return (
      <StateBanner tone="neutral" title={t("notFoundTitle")} silent={silent}>
        {t("notFoundBody")}
      </StateBanner>
    );
  }
  if (result.kind === "conflict" || result.kind === "invalid") {
    return (
      <StateBanner tone="error" title={t("conflictTitle")} silent={silent} code={result.kind === "conflict" ? (result.status ?? undefined) : (result.reason ?? undefined)}>
        {t("conflictBody")}
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
        silent={silent}
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
      <StateBanner tone="neutral" title={t("alreadyTerminalTitle")} silent={silent} code={result.status}>
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
  basis,
  accountNames,
  onTakenOver,
  onAnswer,
  takeOver = takeOverWork,
  session = sessionTokenAccessor,
}: {
  workId: string;
  /** From the Work's own row. Used ONLY to decide whether to show the confirm step up front; the
   *  DATABASE decides whether a digest is required and refuses without one. */
  basisOrigin: string;
  basisDigest: string;
  /**
   * #630 (review) — THE BASIS THE COLLEAGUE IS BEING ASKED TO CONFIRM, rendered inside the confirm
   * dialog. An earlier cut passed only the DIGEST — a hash — under copy that says "Read it below",
   * with nothing below it to read: the door's digest check proves the digest matches the STORED
   * basis, never that a human ever saw it, so the confirmation was ceremony. The figures are
   * already on the same page (`WorkBasisTable`); they belong in the modal that asks about them,
   * because a modal is exactly what a reader cannot see past.
   */
  basis?: WorkBasis | null;
  accountNames?: ReadonlyMap<string, string>;
  onTakenOver: () => void | Promise<void>;
  /** THE ANSWER GOES TO THE PAGE, for the reason `CancelWorkDialog.onAnswer` records: an accepted
   *  takeover makes the Work `queued`, this whole offer unmounts with that status change, and an
   *  outcome rendered here would vanish at the moment it was supposed to be read. */
  onAnswer?: (result: TakeOverWorkResult) => void;
  takeOver?: typeof takeOverWork;
  session?: SessionTokenAccessor;
}) {
  const t = useTranslations("WorkCancel");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TakeOverWorkResult | null>(null);
  const dialog = useDecisionDialog();
  const { open, setOpen } = dialog;
  const decision = { key: dialog.key };
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
    onAnswer?.(answer);
    setBusy(false);
    if (answer.kind === "accepted" || answer.kind === "not_takeable" || answer.kind === "denied") setOpen(false);
    await onTakenOver();
  };

  // #630 (review) — THE ANSWERS THAT KEEP THE MODAL OPEN ARE RENDERED INSIDE IT. `lost`,
  // `unavailable`, `invalid` and `confirm_basis` all leave the dialog open; rendered outside
  // `DialogContent` they mounted behind the overlay, inert and unreadable, while the human looked
  // at a dialog that appeared to have done nothing.
  const inDialog: ReactNode = result === null ? null
    : result.kind === "lost" || result.kind === "unavailable"
      ? <UnobservedBanner kind={result.kind} noun="takeOver" />
      : result.kind === "confirm_basis"
        ? (
          <StateBanner tone="warning" title={t("takeOverConfirmTitle")}>
            {t("takeOverConfirmBody")}
          </StateBanner>
        )
        : result.kind === "invalid"
          ? (
            <StateBanner tone="error" title={t("takeOverUnavailableTitle")} code={result.reason ?? undefined}>
              {t("takeOverUnavailableBody")}
            </StateBanner>
          )
          : null;

  const action = interpreted ? (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setResult(null);
        dialog.onOpenChange(next);
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
        {/* …AND HERE IS WHAT "IT" IS. The same table the page renders, inside the modal that asks
            about it, because a person cannot read the page behind a dialog. Absent basis (a row
            this build could not parse) renders nothing rather than an empty promise. */}
        {basis ? (
          <div className="max-h-64 overflow-y-auto rounded-md border border-border p-3">
            <WorkBasisTable basis={basis} names={accountNames ?? new Map()} />
          </div>
        ) : null}
        {inDialog}
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
      {/* THE NON-MODAL PATH'S OWN ARMS. A `user_direct` basis needs no confirm step, so its offer
          is a bare Button with no dialog to render an answer inside — these are the same arms the
          modal renders in `inDialog`, shown here only when there is no modal. Every answer that
          CLOSES the offer is the PAGE's (see `onAnswer`), because an accepted takeover unmounts
          this whole component with the status change. */}
      {!interpreted ? inDialog : null}
    </div>
  );
}

/** The takeover's answer, rendered by the PAGE so it survives the status change that produced it. */
export function TakeOverOutcome({ result }: { result: TakeOverWorkResult | null }) {
  const t = useTranslations("WorkCancel");
  if (result === null) return null;
  if (result.kind === "accepted") {
    return (
      <StateBanner tone="info" title={t("takeOverAcceptedTitle")}>
        {t("takeOverAcceptedBody")}
      </StateBanner>
    );
  }
  if (result.kind === "not_takeable") {
    return (
      <StateBanner tone="error" title={t("notTakeableTitle")} code={result.status ?? undefined}>
        {t("notTakeableBody")}
      </StateBanner>
    );
  }
  if (result.kind === "denied") {
    // #630 (review) — THE TAKEOVER'S OWN WORDS. An earlier cut reused the cancel's copy here, so a
    // colleague refused a HANDOVER was told "You cannot cancel this Work" about something they had
    // not tried to cancel.
    return (
      <StateBanner tone="warning" title={t("takeOverDeniedTitle")}>
        {t("takeOverDeniedBody")}
      </StateBanner>
    );
  }
  if (result.kind === "unavailable" || result.kind === "lost") {
    return <UnobservedBanner kind={result.kind} noun="takeOver" />;
  }
  return null;
}
