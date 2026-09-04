"use client";

// The confirmation dialog both destructive member acts share — "Remove from
// firm" and "Revoke invitation". Mirrors components/firm-admin/FirmAdminDoorDialog.tsx
// mechanism-for-mechanism (one confirm click performs exactly one governed call,
// guarded against a double fire) and is kept as its own small copy in this domain
// rather than imported across domains, exactly as that file's own header explains:
// components/admin stays independently reviewable and owns its own i18n
// namespace ("Members.dialog" here).
//
// ONE DIFFERENCE FROM ITS SIBLING, and it is why this file exists at all: the
// dialog is CONTROLLED. Its remove variant is opened from inside a DropdownMenu
// item, and a menu item that closes the menu cannot also be a DialogTrigger
// living inside it — the trigger would unmount with the popup before the dialog
// ever opened. So the row owns the open state and this component renders no
// trigger of its own.
//
// WHY A CONFIRM AT ALL, given that the house rule is "let the DB refuse". These
// two acts are the ones with NO DB-side "are you sure" to lean on. `revoke_invite`
// has no such wall, and `remove_member`'s only wall is the last-owner CLR09,
// which does not fire for anyone else — so a misclick on the wrong row removes a
// real person with no undo verb (design §4 D: there is no re-activation door).
// That is Height's own copy pattern in the Mobbin grounding (§3 takeaway 4), and
// it is a MISCLICK guard, not an authority guard: nothing here pre-empts a wall.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";
import { closeOnConfirmedOk, refusalForThisDialog } from "@/lib/parts/door-dialog-outcome";
import { DoorDialogRefusal, type DialogRefusal } from "@/components/common/dialog-refusal";

export function MembersConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  refusal,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  busy: boolean;
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
  const t = useTranslations("Members.dialog");
  // The single-fire guard (review finding M3, ported): `disabled={busy}` alone is
  // a cosmetic affordance, not a correctness guard — two fast clicks would
  // otherwise send two governed calls. See lib/parts/single-fire-guard.ts.
  const guardRef = useRef(createSingleFireGuard());
  // CB-AE2E-004: bumped on every settled confirm so a repeated, byte-identical
  // refusal still re-announces and re-takes focus.
  const [attempt, setAttempt] = useState(0);
  // review-549 MAJOR 1, the CONTROLLED variant: this dialog's `open` is a prop, so
  // there is no local setter to hang the reset on — the effect is the same rule.
  useEffect(() => {
    if (open) setAttempt(0);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              // CB-AE2E-004 — close ONLY on an explicit success. `outcome.ran`
              // says the click was not dropped as re-entrant; it says NOTHING
              // about whether the door accepted, because `act()`
              // (lib/parts/hooks.ts) catches every refusal and resolves. A
              // refused act now resolves `false`, and this dialog stays open
              // with the refusal — and whatever the human typed — standing.
              const outcome = await runOnce(guardRef.current, onConfirm);
              if (outcome.ran) setAttempt((n) => n + 1);
              if (closeOnConfirmedOk(outcome)) onOpenChange(false);
            }}
          >
            {busy ? t("working") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
