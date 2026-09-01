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

import { useRef, type ReactNode } from "react";
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

export function MembersConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  busy: boolean;
  /** Performs exactly one governed call. This component never inspects the
   *  outcome — the panel's own hydrated state (err/clr) is the source of truth
   *  for what happened, and it renders OUTSIDE this dialog so a refusal survives
   *  the close. */
  onConfirm: () => Promise<void>;
  children?: ReactNode;
}) {
  const t = useTranslations("Members.dialog");
  // The single-fire guard (review finding M3, ported): `disabled={busy}` alone is
  // a cosmetic affordance, not a correctness guard — two fast clicks would
  // otherwise send two governed calls. See lib/parts/single-fire-guard.ts.
  const guardRef = useRef(createSingleFireGuard());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("cancel")}</DialogClose>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              const ran = await runOnce(guardRef.current, onConfirm);
              if (ran) onOpenChange(false);
            }}
          >
            {busy ? t("working") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
