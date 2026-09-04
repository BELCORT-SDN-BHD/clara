"use client";

// A reusable confirmation dialog for ONE close-domain door — begin/finalize/
// abandon/reopen/attest are each a law-71-adjacent human act (AGENTS.md
// constraint 14/hard constraint on human doors): one click opens the dialog,
// one confirm click performs EXACTLY one governed call, never a batch. The
// dialog closes ONLY when the attempt SUCCEEDED (CB-AE2E-004): a governed
// refusal keeps it open, with the human's typed reason/attestation still in the
// fields the refusal is asking them to correct, and renders the DB's own message
// verbatim inside the dialog when the caller passes `refusal` — the caller's
// persistent banner (lib/parts/hooks.ts's sticky-refusal design) is behind the
// modal overlay and cannot be read while the dialog stands.

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
import { DoorDialogRefusal, type DialogRefusal } from "@/components/common/dialog-refusal";

export function CloseDoorDialog({
  triggerLabel,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  busy,
  confirmDisabled,
  refusal,
  onConfirm,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: "outline" | "default" | "destructive" | "secondary";
  title: string;
  description?: string;
  confirmLabel: string;
  busy: boolean;
  /**
   * Gates the CONFIRM button — never the trigger.
   *
   * BLOCKER (a11y lane, WCAG 2.1.1 + 4.1.2; and a functional product
   * blocker): this prop was named `disabled` and was handed to the
   * DialogTrigger, while the fields it gates on live INSIDE the dialog that
   * trigger opens. Every caller that passed it therefore rendered a door
   * that was disabled from first paint and could never become enabled — by
   * keyboard OR mouse — because the only way to satisfy the condition was
   * to type into a textarea that could not be reached. Six doors were
   * unreachable this way: attest, abandon, reopen, issue-for-approval,
   * archive-signed-original and register-recipient.
   *
   * The rename is deliberate and is the guard: `confirmDisabled` cannot be
   * mistaken for "you may not open this", and every existing call site had
   * to be re-read to compile.
   */
  confirmDisabled?: boolean;
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
  /** Extra confirmation-time fields (a reason textarea, an attestation input). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("ClientClose.dialog");
  // The single-fire guard (review finding M3): `disabled={busy}` alone is a
  // cosmetic affordance, not a correctness guard — see lib/parts/
  // single-fire-guard.ts's header for the measured regression. `guardRef`
  // persists across the re-renders `busy` itself provokes, so a rapid second
  // click is dropped even in the window before React repaints the disabled
  // button.
  const guardRef = useRef(createSingleFireGuard());
  // CB-AE2E-004: bumped on every settled confirm so a repeated, byte-identical
  // refusal still re-announces and re-takes focus.
  const [attempt, setAttempt] = useState(0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size="sm" />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DoorDialogRefusal refusal={refusal} attempt={attempt} />
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
              if (outcome.value === true) setOpen(false);
            }}
          >
            {busy ? t("working") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
