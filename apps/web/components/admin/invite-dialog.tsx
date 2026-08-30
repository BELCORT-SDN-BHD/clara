"use client";

// THE INVITE DIALOG — one email, one role, one submit.
//
// SINGLE-EMAIL BY CONSTRUCTION. `clara.invite_member(p_email, p_role, p_op_key)`
// takes ONE address (`0147:372`). The Mobbin grounding flagged Tailscale's
// comma-separated multi-invite field as a pattern that does not match the
// signature (§3 takeaway 6, and flag 4): an input accepting "a,b@x.com" would
// either silently use the first address or need a client-side loop the design
// never specified — and `accept_invite`'s wall is per-token, per-email anyway.
// One invite per submit.
//
// NOTHING HERE VALIDATES THE EMAIL OR THE ROLE. The field is `type="email"` for
// the keyboard and autofill a browser gives it, and it carries no `required`, no
// pattern and no submit gate: `invite_member` answers CLR10 'a valid email is
// required' (`0147:380`) and CLR10 'bad role' (`0147:382`) in its own words, and
// a client-side copy of either would be a second, drifting judgement in front of
// the real one. The Send button is disabled only while a call is IN FLIGHT.
//
// THE ROLE CHOOSER IS A NATIVE `<select>` (components/common/native-select.tsx),
// not the vendored Select popup — that file's own header states the house
// reasoning: a real `<select>` keeps the browser's keyboard and mobile behaviour
// and stays a `SELECT` node the a11y and keyboard gates can see. Each option
// carries a one-line description of what the role can do, which is the Mobbin
// grounding's §3 takeaway 2 (TheyDo's shape, not Tailscale's bare list) expressed
// in the primitive this app already has.

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";
import { ROLE_LADDER, type MemberRole } from "@/lib/members/reads";

export function InviteDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  /** Performs exactly one courier round trip. The dialog does not inspect the
   *  outcome — the panel decides whether to close (it stays open on a governed
   *  refusal so the admin can correct the email or the role and try again). */
  onSubmit: (email: string, role: MemberRole) => Promise<void>;
}) {
  const t = useTranslations("Members.inviteDialog");
  const tRoles = useTranslations("Members.roleOptions");
  const tDialog = useTranslations("Members.dialog");
  const emailId = useId();
  const roleId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("bookkeeper");
  const guardRef = useRef(createSingleFireGuard());

  // A closed dialog forgets what was typed. Without this, re-opening after a
  // successful invite would present the address that was just invited — one
  // click from CLR10 'an invite is already pending for this email' and a
  // confusing refusal for something the admin did not mean to do again.
  useEffect(() => {
    if (!open) {
      setEmail("");
      setRole("bookkeeper");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={emailId}>{t("emailLabel")}</Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="off"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={roleId}>{t("roleLabel")}</Label>
            <NativeSelect
              id={roleId}
              className="w-full"
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
            >
              {ROLE_LADDER.map((r) => (
                <option key={r} value={r}>
                  {tRoles(r)}
                </option>
              ))}
            </NativeSelect>
            {/* The ceiling is NAMED, never enforced here: `invite_member`
                (`0147:386`) is what refuses CLR04, and this sentence only tells
                the admin what to expect from it. */}
            <p className="max-w-prose text-xs text-muted-foreground">{t("ceilingNote")}</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{tDialog("cancel")}</DialogClose>
          <Button
            disabled={busy}
            onClick={async () => {
              // `runOnce` releases its own guard in a `finally`, so a REFUSAL
              // stays retryable from this same open dialog once the admin edits
              // the address — the guard closes the double-click window, it does
              // not close the dialog for good.
              await runOnce(guardRef.current, async () => {
                await onSubmit(email, role);
              });
            }}
          >
            {busy ? tDialog("working") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
