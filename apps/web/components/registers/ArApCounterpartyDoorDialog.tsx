"use client";

// A reusable confirmation dialog for ONE counterparty-domain door (create /
// set terms / add alias / retire alias / rename / merge) — the exact shape
// components/close/CloseDoorDialog.tsx is the house exemplar for: one click
// opens, one confirm click performs EXACTLY one governed call, never a
// batch; the refusal itself is NOT shown here — it renders in the caller's
// own persistent banner, which survives the dialog closing and the
// follow-up reload that always runs after.
//
// Kept as its own small copy rather than a cross-domain import — the
// reports/DoorDialog.tsx precedent (apps/web/components/reports/DoorDialog.tsx:7):
// "kept as its own small copy... so [each domain] stays independently
// reviewable, each with its own i18n namespace." This train's namespace is
// `ArApCounterparty`.

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";

export function ArApCounterpartyDoorDialog({
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerDisabled,
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  busy,
  confirmDisabled,
  onConfirm,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: "outline" | "default" | "destructive" | "secondary" | "ghost";
  triggerSize?: "sm" | "xs";
  /** Client-side gating may SHAPE input, never HIDE an openable door — this
   *  stays undefined at every real call site in this train; it exists only
   *  so a future caller cannot reach for `confirmDisabled` on the trigger by
   *  mistake (house lesson 8). */
  triggerDisabled?: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  busy: boolean;
  /** Gates the CONFIRM button only — never the trigger. */
  confirmDisabled?: boolean;
  /** Performs exactly one governed call. This component does not inspect the
   *  outcome — the caller's own hydrated-part state is the source of truth
   *  for what happened, rendered outside this dialog. */
  onConfirm: () => Promise<void>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("ArApCounterparty.dialog");
  // The single-fire guard (lib/parts/single-fire-guard.ts's own header): `disabled={busy}`
  // alone is a cosmetic affordance, not a correctness guard.
  const guardRef = useRef(createSingleFireGuard());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} disabled={triggerDisabled} />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          {/* F5 (independent review, fix-required): a plain Button with an
              explicit onClick, not DialogClose — DialogClose's own internal
              click handler (base-ui's FloatingFocusManager) checks
              `event instanceof KeyboardEvent`, which THROWS in this test
              harness's fake DOM (no such global) when driven via the shared
              `clickButton` instrument. A plain onClick closes the SAME
              `open` state Dialog watches, so behaviour (including base-ui's
              own focus restoration on the `open` transition) is identical —
              this is not a test workaround, it removes a real fragility. */}
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant={confirmVariant}
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
