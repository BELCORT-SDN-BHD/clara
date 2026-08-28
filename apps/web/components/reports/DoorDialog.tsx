"use client";

// A reusable confirmation dialog for ONE reports-domain door — issue-for-
// approval, archive-signed-original, register/supersede-recipient. Mirrors
// components/close/CloseDoorDialog.tsx mechanism-for-mechanism (one click
// opens it, one confirm click performs exactly one governed call); kept as its
// own small copy rather than a cross-domain import so components/close and
// components/reports stay independently reviewable, each with its own i18n
// namespace ("ClientReports.dialog" here vs "ClientClose.dialog" there).

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

export function DoorDialog({
  triggerLabel,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  busy,
  confirmDisabled,
  onConfirm,
  onOpenChange,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: "outline" | "default" | "destructive" | "secondary";
  title: string;
  description?: string;
  confirmLabel: string;
  busy: boolean;
  /** Gates the CONFIRM button — never the trigger. See components/close/
   *  CloseDoorDialog.tsx's own note for the blocker this rename closes: the
   *  prop used to disable the TRIGGER on a condition that could only be
   *  satisfied by fields inside the dialog that trigger opens, which made
   *  issue-for-approval, archive-signed-original and register-recipient
   *  permanently unopenable. */
  confirmDisabled?: boolean;
  onConfirm: () => Promise<void>;
  /** Additive (T9 fix round, F4/F9): fires on EVERY open/close transition —
   *  a caller that wants a fresh deliberate act each time the dialog opens
   *  (a freshly-minted op_key, a reset consent checkbox) hooks this rather
   *  than re-deriving open state of its own. Optional; every existing caller
   *  that does not pass it is unaffected. */
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("ClientReports.dialog");
  // The single-fire guard (review finding M3) — see components/close/
  // CloseDoorDialog.tsx's identical comment and lib/parts/single-fire-guard.ts's
  // header for the measured regression this closes.
  const guardRef = useRef(createSingleFireGuard());

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        onOpenChange?.(v);
      }}
    >
      <DialogTrigger render={<Button variant={triggerVariant} size="sm" />}>
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
