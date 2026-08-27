"use client";

// A reusable confirmation dialog for ONE close-domain door — begin/finalize/
// abandon/reopen/attest are each a law-71-adjacent human act (AGENTS.md
// constraint 14/hard constraint on human doors): one click opens the dialog,
// one confirm click performs EXACTLY one governed call, never a batch. The
// dialog closes once the attempt SETTLES (success or refusal) — the refusal
// itself is not shown here; it renders in the caller's own persistent banner
// (lib/parts/hooks.ts's sticky-refusal design: it survives the dialog closing
// and the follow-up reload that always runs after).

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

export function CloseDoorDialog({
  triggerLabel,
  triggerVariant = "outline",
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
  /** Performs exactly one governed call. This component does not inspect the
   *  outcome — the caller's own hydrated-part state (err/clr) is the source of
   *  truth for what happened, rendered outside this dialog. */
  onConfirm: () => Promise<void>;
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
