"use client";

// T7's own copy of the DocumentsDoorDialog/CloseDoorDialog exemplar
// (components/documents/DocumentsDoorDialog.tsx:1-9, itself copying
// components/close/CloseDoorDialog.tsx:1-10) — kept as its own small copy
// rather than a cross-domain import, matching the reports domain's
// DoorDialog precedent (components/reports/DoorDialog.tsx:7). One click
// opens, one confirm performs EXACTLY one governed call, never a batch.

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogClose, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";

export function CodingDoorDialog({
  triggerLabel, triggerVariant = "outline", triggerSize = "sm",
  title, description, confirmLabel, busy, confirmDisabled, onConfirm, children,
}: {
  triggerLabel: string;
  triggerVariant?: "outline" | "default" | "destructive" | "secondary";
  triggerSize?: "sm" | "xs";
  title: string;
  description?: string;
  confirmLabel: string;
  busy: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => Promise<void>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("CodingQuestionsSignals.dialog");
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
