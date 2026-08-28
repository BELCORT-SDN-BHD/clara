"use client";

// T4's own copy of the house door-dialog mechanism — mirrors
// components/close/CloseDoorDialog.tsx and components/registers/FaDoorDialog.tsx
// mechanism-for-mechanism (one click opens it, one confirm click performs
// exactly one governed call). Kept as its own small copy, not a cross-domain
// import, for the SAME reason reports/DoorDialog.tsx's header states: this
// domain (adjustments, templates & accounts) stays independently reviewable
// with its own i18n namespace ("AdjustmentsAccounts.dialog" here).

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

export function AdjustmentDoorDialog({
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  title,
  description,
  confirmLabel,
  busy,
  confirmDisabled,
  onConfirm,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: "outline" | "default" | "destructive" | "secondary" | "ghost";
  triggerSize?: "sm" | "xs";
  title: string;
  description?: string;
  confirmLabel: string;
  busy: boolean;
  /** Gates the CONFIRM button only — NEVER the trigger. See
   *  CloseDoorDialog.tsx's own note for the blocker this house convention
   *  closes: a `disabled` keyed to a field only reachable INSIDE the dialog
   *  that trigger opens makes the door permanently unreachable. */
  confirmDisabled?: boolean;
  /** Performs exactly one governed call. This component does not inspect the
   *  outcome — the caller's own hydrated-part state is the source of truth
   *  for what happened, rendered outside this dialog. */
  onConfirm: () => Promise<void>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("AdjustmentsAccounts.dialog");
  // The single-fire guard (lib/parts/single-fire-guard.ts's own header):
  // `disabled={busy}` alone is a cosmetic affordance, not a correctness guard.
  const guardRef = useRef(createSingleFireGuard());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>
        {triggerLabel}
      </DialogTrigger>
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
