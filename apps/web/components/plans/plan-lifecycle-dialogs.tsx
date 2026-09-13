"use client";

// #640 — PAUSE, RESUME, END and CATCH UP. Four focused decisions, four Dialogs, one rule between
// them: NOTHING HERE PAINTS AN OUTCOME IT WAS NOT TOLD BY A FRESH READ.
//
// WHY A DIALOG AND NOT A BARE BUTTON. Appendix D's own rule for Dialog: "a focused, bounded
// decision that can complete without losing page context". Each of these NAMES the plan it is
// about — a person operating a list of similar schedules must see which one they are stopping —
// and the safe answer holds initial focus, because a destructive default is how a keyboard user
// ends a schedule by pressing Enter.
//
// PAUSE IS NOT CANCEL, AND THE DIALOG SAYS SO IN WORDS. `clara.pause_accounting_plan` blocks
// FUTURE admission and touches nothing in flight; cancelling an already admitted Work is
// `clara.cancel_accounting_work`, a separately named action on the Work's own page. A human who
// pressed the wrong one would either keep a schedule they meant to stop or abandon an operation
// they meant to keep, and neither is recoverable by pressing the other.
//
// ONE OP KEY PER OPEN DECISION (components/work/work-cancel-dialog.tsx's `useDecisionKey`, the
// same discipline): minted when the dialog opens, reused for every attempt at that decision so an
// unobserved first attempt and its retry are ONE operation to `clara._reserve_op`; a fresh press
// of the trigger is a new decision and mints a new key.
//
// THE FOCUS RETURNS TO THE TRIGGER. `DialogContent` restores it on close, and the walk asserts it:
// a control that disappears while focus is inside it is how a keyboard user ends up on `<body>`.

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StateBanner } from "@/components/common/state";
import { endPlan, pausePlan, requestCatchUp, resumePlan } from "@/lib/plans/api";
import { validateCatchUpWindow, type CatchUpIssue } from "@/lib/plans/schedule";

type ActRunner = (fn: () => Promise<void>) => Promise<boolean>;

/** A stable key per OPEN DECISION — see the header. */
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

function useDecisionDialog() {
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

export function PausePlanDialog({
  planId, purpose, busy, onAct,
}: { planId: string; purpose: string; busy: boolean; onAct: ActRunner }) {
  const t = useTranslations("Plans");
  const dialog = useDecisionDialog();
  const [reason, setReason] = useState("");

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{t("pause")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pauseTitle", { purpose })}</DialogTitle>
          <DialogDescription>{t("pauseBody")}</DialogDescription>
        </DialogHeader>
        {/* THE DISTINCTION, stated where the decision is made rather than in a help page. */}
        <StateBanner tone="info" silent>{t("pauseNotCancel")}</StateBanner>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-muted-foreground" htmlFor="plan-pause-reason">
            {t("pauseReasonLabel")}
          </label>
          <Textarea
            id="plan-pause-reason"
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" autoFocus />}>{t("keepScheduling")}</DialogClose>
          <Button
            disabled={busy}
            onClick={async () => {
              const ok = await onAct(async () => {
                await pausePlan(planId, reason.trim() === "" ? null : reason.trim(), dialog.key());
              });
              if (ok) dialog.setOpen(false);
            }}
          >
            {t("pauseConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResumePlanDialog({
  planId, purpose, busy, onAct,
}: { planId: string; purpose: string; busy: boolean; onAct: ActRunner }) {
  const t = useTranslations("Plans");
  const dialog = useDecisionDialog();
  return (
    <Dialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>{t("resume")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("resumeTitle", { purpose })}</DialogTitle>
          <DialogDescription>{t("resumeBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" autoFocus />}>{t("keepPaused")}</DialogClose>
          <Button
            disabled={busy}
            onClick={async () => {
              const ok = await onAct(async () => {
                await resumePlan(planId, dialog.key());
              });
              if (ok) dialog.setOpen(false);
            }}
          >
            {t("resumeConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EndPlanDialog({
  planId, purpose, busy, onAct,
}: { planId: string; purpose: string; busy: boolean; onAct: ActRunner }) {
  const t = useTranslations("Plans");
  const dialog = useDecisionDialog();
  const [reason, setReason] = useState("");
  const missingReason = reason.trim() === "";

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{t("end")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("endTitle", { purpose })}</DialogTitle>
          {/* ENDING IS TERMINAL AND THE DIALOG SAYS SO: `clara.accounting_plans`' own trigger
              refuses to restart an ended plan, so the honest sentence is "create a new one". */}
          <DialogDescription>{t("endBody")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-muted-foreground" htmlFor="plan-end-reason">
            {t("endReasonLabel")}
          </label>
          <Textarea
            id="plan-end-reason"
            value={reason}
            disabled={busy}
            aria-invalid={missingReason ? true : undefined}
            aria-describedby="plan-end-reason-error"
            onChange={(e) => setReason(e.target.value)}
          />
          {/* THE REASON IS REQUIRED BY THE DOOR (`end_accounting_plan` refuses a blank one), so the
              form says so at the control instead of letting the refusal arrive a second later. */}
          <p id="plan-end-reason-error" className="text-xs text-error" role={missingReason ? "alert" : undefined}>
            {missingReason ? t("endReasonRequired") : ""}
          </p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" autoFocus />}>{t("keepScheduling")}</DialogClose>
          <Button
            disabled={busy || missingReason}
            onClick={async () => {
              const ok = await onAct(async () => {
                await endPlan(planId, reason.trim(), dialog.key());
              });
              if (ok) dialog.setOpen(false);
            }}
          >
            {t("endConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CatchUpDialog({
  planId, purpose, effectiveFrom, today, busy, onAct,
}: {
  planId: string;
  purpose: string;
  effectiveFrom: string | null;
  today: string | null;
  busy: boolean;
  onAct: ActRunner;
}) {
  const t = useTranslations("Plans");
  const dialog = useDecisionDialog();
  const [from, setFrom] = useState(effectiveFrom ?? "");
  const [to, setTo] = useState(today ?? "");
  const [attempted, setAttempted] = useState(false);
  const issues = validateCatchUpWindow(from, to, effectiveFrom);
  const message = (field: CatchUpIssue["field"]): string | null => {
    if (!attempted) return null;
    const issue = issues.find((i) => i.field === field);
    if (issue === undefined) return null;
    const codes: Record<string, string> = {
      fromRequired: t("catchUpFromRequired"),
      toRequired: t("catchUpToRequired"),
      fromInvalid: t("catchUpFromInvalid"),
      toInvalid: t("catchUpToInvalid"),
      toBeforeFrom: t("catchUpToBeforeFrom"),
      beforeAuthority: t("catchUpBeforeAuthority"),
    };
    return codes[issue.code] ?? issue.code;
  };

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{t("catchUp")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("catchUpTitle", { purpose })}</DialogTitle>
          {/* THE SCOPE IS EXPLICIT AND THE DIALOG SAYS WHY: a schedule does not authorise its own
              history, so a person names the window they want and the door refuses one that reaches
              back past the authority it would ride on. */}
          <DialogDescription>{t("catchUpBody")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground" htmlFor="plan-catch-up-from">
              {t("catchUpFromLabel")}
            </label>
            <Input
              id="plan-catch-up-from"
              type="date"
              value={from}
              disabled={busy}
              aria-invalid={message("catchUpFrom") === null ? undefined : true}
              aria-describedby="plan-catch-up-from-error"
              onChange={(e) => setFrom(e.target.value)}
            />
            <p id="plan-catch-up-from-error" className="text-xs text-error" role={message("catchUpFrom") === null ? undefined : "alert"}>
              {message("catchUpFrom") ?? ""}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground" htmlFor="plan-catch-up-to">
              {t("catchUpToLabel")}
            </label>
            <Input
              id="plan-catch-up-to"
              type="date"
              value={to}
              disabled={busy}
              aria-invalid={message("catchUpTo") === null ? undefined : true}
              aria-describedby="plan-catch-up-to-error"
              onChange={(e) => setTo(e.target.value)}
            />
            <p id="plan-catch-up-to-error" className="text-xs text-error" role={message("catchUpTo") === null ? undefined : "alert"}>
              {message("catchUpTo") ?? ""}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{t("catchUpBounded")}</p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" autoFocus />}>{t("catchUpCancel")}</DialogClose>
          <Button
            disabled={busy}
            onClick={async () => {
              setAttempted(true);
              if (validateCatchUpWindow(from, to, effectiveFrom).length > 0) return;
              const ok = await onAct(async () => {
                await requestCatchUp(planId, from, to, dialog.key());
              });
              if (ok) dialog.setOpen(false);
            }}
          >
            {t("catchUpConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
