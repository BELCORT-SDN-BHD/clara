"use client";

// A reusable confirmation dialog for ONE firm-admin-domain door — propose/sign/
// revoke a vendor identity binding, share a chat session. Mirrors
// components/close/CloseDoorDialog.tsx mechanism-for-mechanism (one click
// opens it, one confirm click performs exactly one governed call); kept as its
// own small copy rather than a cross-domain import so components/firm-admin
// stays independently reviewable, each domain with its own i18n namespace
// ("FirmAdminCompliance.dialog" here — components/reports/DoorDialog.tsx's own
// header states the same reasoning for its domain).

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

export function FirmAdminDoorDialog({
  triggerLabel,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  busy,
  confirmDisabled,
  refusal,
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
   *  CloseDoorDialog.tsx's own note for the blocker this rename closes. */
  confirmDisabled?: boolean;
  /** Performs exactly one governed call. This component does not inspect the
   *  outcome — the caller's own hydrated-part state (err/clr) is the source of
   *  truth for what happened, rendered outside this dialog. */
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
  /** Additive (ported from components/reports/DoorDialog.tsx's own T9 fix
   *  round, F4/F9): fires on EVERY open/close transition — a caller that
   *  wants a fresh deliberate act each time the dialog opens (a freshly-
   *  minted op_key, a reset typed field) hooks this rather than re-deriving
   *  open state of its own. Optional; every existing caller that does not
   *  pass it is unaffected. */
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("FirmAdminCompliance.dialog");
  // The single-fire guard (review finding M3, ported): `disabled={busy}` alone
  // is a cosmetic affordance, not a correctness guard — see lib/parts/
  // single-fire-guard.ts's header for the measured regression this closes.
  const guardRef = useRef(createSingleFireGuard());
  // CB-AE2E-004: bumped on every settled confirm so a repeated, byte-identical
  // refusal still re-announces and re-takes focus.
  const [attempt, setAttempt] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // review-549 MAJOR 1: a fresh OPEN starts with no settled confirm of its own,
        // so the panel's standing refusal (which may belong to a sibling dialog, or to
        // this one's previous visit) is not shown until this dialog settles one again.
        if (v) setAttempt(0);
        setOpen(v);
        onOpenChange?.(v);
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
