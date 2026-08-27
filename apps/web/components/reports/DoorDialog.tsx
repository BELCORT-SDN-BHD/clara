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
import { createSingleFireGuard, runOnce } from "@/lib/parts/singleFireGuard";

export function DoorDialog({
  triggerLabel,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  busy,
  disabled,
  onConfirm,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: "outline" | "default" | "destructive" | "secondary";
  title: string;
  description?: string;
  confirmLabel: string;
  busy: boolean;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("ClientReports.dialog");
  // The single-fire guard (review finding M3) — see components/close/
  // CloseDoorDialog.tsx's identical comment and lib/parts/singleFireGuard.ts's
  // header for the measured regression this closes.
  const guardRef = useRef(createSingleFireGuard());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size="sm" disabled={disabled} />}>
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
            disabled={busy}
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
