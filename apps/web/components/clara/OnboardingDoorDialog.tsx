"use client";

// T11's own confirmation dialog — deliberately a small, file-disjoint copy of
// CloseDoorDialog.tsx / CodingDoorDialog.tsx, NOT a shared import: the house
// pattern this repo already settled on (port-wave-plan-2026-08-28.md §3.5 —
// "one door dialog per domain, file-disjoint by construction… every train
// writes its own"; apps/web/components/reports/DoorDialog.tsx's own header
// records the same decision). One click opens, one Confirm performs EXACTLY
// one governed call, never a batch; the dialog closes ONLY when that call
// SUCCEEDED (CB-AE2E-004). A refusal keeps it open with the human's typed input
// intact, and renders the DB's own message verbatim inside the dialog when the
// caller passes `refusal` — the caller's persistent page banner
// (lib/parts/hooks.ts's sticky-refusal design) is behind the modal backdrop and
// cannot be read while this dialog stands.

import { useRef, useState, type ReactNode } from "react";
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
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";
import { closeOnConfirmedOk, refusalForThisDialog } from "@/lib/parts/door-dialog-outcome";
import { DoorDialogRefusal, type DialogRefusal } from "@/components/common/dialog-refusal";

export function OnboardingDoorDialog({
  triggerLabel,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  busy,
  confirmDisabled,
  refusal,
  onConfirm,
  onOpen,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: "outline" | "default" | "destructive" | "secondary";
  title: string;
  description?: string;
  confirmLabel: string;
  busy: boolean;
  /** Gates the CONFIRM button only — never the trigger (CloseDoorDialog's own
   *  header names the six-doors-unreachable blocker this naming discipline
   *  exists to prevent: a `disabled` gated on content only reachable INSIDE
   *  the dialog the trigger opens). */
  confirmDisabled?: boolean;
  /** Performs exactly one governed call. This component does not inspect the
   *  outcome — the caller's own hydrated-part state (err/clr) is the source
   *  of truth for what happened, rendered outside this dialog. */
  /** The caller's OWN standing failure (a hydrated part's `err`/`clr`), rendered
   *  VERBATIM inside this dialog. CB-AE2E-004: the dialog now stays open on a
   *  refusal, and the caller's page-level banner is behind the modal backdrop —
   *  so the refusal the human must read has to travel in here with them. Omit it
   *  and nothing extra renders; the dialog still stays open. */
  refusal?: DialogRefusal;
  /** Performs exactly one governed call and RESOLVES ITS OUTCOME: `true` only
   *  when the door accepted. `useHydratedPart`'s `act()` already returns exactly
   *  this, so `onConfirm={() => act(...)}` is the whole contract; a handler that
   *  cannot know (or a dropped re-entrant click) answers anything but `true` and
   *  this dialog stays open. CB-AE2E-004: the previous `Promise<void>` contract
   *  made a refusal indistinguishable from a success, and every wrapper closed on
   *  both — destroying the input the refusal was asking the human to correct. */
  onConfirm: () => Promise<boolean>;
  /** Fired when the dialog OPENS — for a body whose contents need a read the card should
   *  not make for every row on every render (裁-27's revision trail). Never fired on close,
   *  and never on a re-render: `onOpenChange` only reports transitions. */
  onOpen?: () => void;
  /** Extra confirmation-time fields (a name input, a reason textarea, an
   *  attestation input). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("ClientOnboarding.dialog");
  // The single-fire guard (CloseDoorDialog's own M3 finding): `disabled={busy}`
  // alone is a cosmetic affordance, not a correctness guard — `guardRef`
  // persists across the re-renders `busy` itself provokes, so a rapid second
  // click is dropped even in the window before React repaints the disabled
  // button.
  const guardRef = useRef(createSingleFireGuard());
  // CB-AE2E-004: bumped on every settled confirm so a repeated, byte-identical
  // refusal still re-announces and re-takes focus.
  const [attempt, setAttempt] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // review-549 MAJOR 1: a fresh OPEN starts with no settled confirm of its own,
        // so the panel's standing refusal (which may belong to a sibling dialog, or to
        // this one's previous visit) is not shown until this dialog settles one again.
        if (next) setAttempt(0);
        setOpen(next);
        if (next) onOpen?.();
      }}
    >
      <DialogTrigger render={<Button variant={triggerVariant} size="sm" />}>{triggerLabel}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DoorDialogRefusal refusal={refusalForThisDialog(refusal, attempt)} attempt={attempt} />
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("cancel")}</DialogClose>
          <Button
            disabled={busy || confirmDisabled === true}
            onClick={async () => {
              // CB-AE2E-004 — close ONLY on an explicit success. `outcome.ran`
              // says the click was not dropped as re-entrant; it says NOTHING
              // about whether the door accepted, because `act()`
              // (lib/parts/hooks.ts) catches every refusal and resolves. A
              // refused act now resolves `false`, and this dialog stays open
              // with the refusal — and whatever the human typed — standing.
              const outcome = await runOnce(guardRef.current, onConfirm);
              if (outcome.ran) setAttempt((n) => n + 1);
              if (closeOnConfirmedOk(outcome)) setOpen(false);
            }}
          >
            {busy ? t("working") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
