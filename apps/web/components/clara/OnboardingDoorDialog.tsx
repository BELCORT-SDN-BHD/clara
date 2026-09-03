"use client";

// T11's own confirmation dialog — deliberately a small, file-disjoint copy of
// CloseDoorDialog.tsx / CodingDoorDialog.tsx, NOT a shared import: the house
// pattern this repo already settled on (port-wave-plan-2026-08-28.md §3.5 —
// "one door dialog per domain, file-disjoint by construction… every train
// writes its own"; apps/web/components/reports/DoorDialog.tsx's own header
// records the same decision). One click opens, one Confirm performs EXACTLY
// one governed call, never a batch; the dialog closes once the attempt
// SETTLES (success or refusal) — the refusal itself renders in the CALLER's
// own persistent banner (lib/parts/hooks.ts's sticky-refusal design), never
// inside this dialog.

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

export function OnboardingDoorDialog({
  triggerLabel,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  busy,
  confirmDisabled,
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
  onConfirm: () => Promise<void>;
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
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
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("cancel")}</DialogClose>
          <Button
            disabled={busy || confirmDisabled === true}
            onClick={async () => {
              const ran = await runOnce(guardRef.current, onConfirm);
              if (ran) setOpen(false);
            }}
          >
            {busy ? t("working") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
