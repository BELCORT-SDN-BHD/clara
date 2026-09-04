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
  refusal,
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
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("ArApCounterparty.dialog");
  // The single-fire guard (lib/parts/single-fire-guard.ts's own header): `disabled={busy}`
  // alone is a cosmetic affordance, not a correctness guard.
  const guardRef = useRef(createSingleFireGuard());
  // CB-AE2E-004: bumped on every settled confirm so a repeated, byte-identical
  // refusal still re-announces and re-takes focus.
  const [attempt, setAttempt] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
      // review-549 MAJOR 1: a fresh OPEN starts with no settled confirm of its own, so
      // the panel's standing refusal (which may belong to a sibling dialog, or to this
      // one's previous visit) is not shown until this dialog settles a confirm again.
        if (next) setAttempt(0);
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} disabled={triggerDisabled} />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DoorDialogRefusal refusal={refusalForThisDialog(refusal, attempt)} attempt={attempt} />
        <DialogFooter>
          {/* The house shape (close/CloseDoorDialog.tsx, reports/DoorDialog.tsx):
              DialogClose, not a plain onClick — restored after a fix-round
              false start (F5 correction, independent review): a stale
              premise assumed clickButton throws on DialogClose in this
              harness; #390 (T9, merged to main) added the
              KeyboardEvent/MouseEvent/FocusEvent stubs to installDom
              precisely so it does not — see hookHarness.ts's own header. */}
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("cancel")}</DialogClose>
          <Button
            variant={confirmVariant}
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
