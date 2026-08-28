"use client";

// T2's own copy of the house door-dialog mechanism — mirrors
// components/close/CloseDoorDialog.tsx, components/reports/DoorDialog.tsx and
// components/registers/FaDoorDialog.tsx mechanism-for-mechanism (one click
// opens it, one confirm click performs exactly one governed call). Kept as
// its own small copy, not a cross-domain import, for the SAME reason
// reports/DoorDialog.tsx's header states: this domain stays independently
// reviewable with its own i18n namespace ("OpeningCarryDown.dialog" here).

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

export function OpeningDoorDialog({
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
  triggerVariant?: "outline" | "default" | "destructive" | "secondary";
  triggerSize?: "sm" | "default";
  title: string;
  description?: string;
  confirmLabel: string;
  busy: boolean;
  /** Gates the CONFIRM button — never the trigger (the six-unopenable-doors
   *  lesson: a control must never be disabled on a condition only satisfiable
   *  by fields inside the dialog it opens). */
  confirmDisabled?: boolean;
  onConfirm: () => Promise<void>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("OpeningCarryDown.dialog");
  const guardRef = useRef(createSingleFireGuard());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>{triggerLabel}</DialogTrigger>
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
