"use client";

// A reusable confirmation dialog for ONE staff-advances-domain door (book
// application / complete particulars / enrol account / retire account) — the
// exact shape apps/web/components/close/CloseDoorDialog.tsx is the house
// exemplar for: one click opens, one confirm click performs EXACTLY one
// governed call, never a batch; the refusal itself is NOT shown here — it
// renders in the caller's own persistent banner (this workbench's hydrated-
// part err/clr), which survives the dialog closing and the follow-up reload
// that always runs after.
//
// Kept as its own small copy rather than a cross-domain import — the
// reports/DoorDialog.tsx precedent (apps/web/components/reports/DoorDialog.tsx:7):
// "kept as its own small copy... so [each domain] stays independently
// reviewable, each with its own i18n namespace." This train's namespace is
// `StaffAdvances`.

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

export function StaffAdvanceDoorDialog({
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
  /** Gates the CONFIRM button only — NEVER the trigger (the CloseDoorDialog
   *  blocker this house pattern exists to avoid: a `disabled` keyed to a
   *  field only reachable INSIDE the dialog that trigger opens makes the
   *  door permanently unreachable by any input modality). */
  confirmDisabled?: boolean;
  /** Performs exactly one governed call. This component does not inspect the
   *  outcome — the caller's own hydrated-part state is the source of truth
   *  for what happened, rendered outside this dialog. */
  onConfirm: () => Promise<void>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("StaffAdvances.dialog");
  // The single-fire guard (lib/parts/single-fire-guard.ts's own header): `disabled={busy}`
  // alone is a cosmetic affordance, not a correctness guard — a rapid second click
  // before the next React render still reaches `onConfirm` without this.
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
