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
// NO CLIENT-SIDE EMAIL OR ROLE JUDGEMENT. The field is `type="email"` for the
// keyboard and autofill a browser gives it, and it carries no `required`, no
// pattern and no submit gate. The courier refuses a raw empty address as
// `unsupported_address`; a spaces-only address canonicalises to empty and the
// door answers CLR10 'a valid email is required' (`0147:380`). An unknown role
// reaches the door's CLR10 'bad role' (`0147:382`). Copying any of those gates
// here would create a second, drifting judgement. The Send button is disabled
// only while a call is IN FLIGHT.
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";
import { refusalForThisDialog } from "@/lib/parts/door-dialog-outcome";
import { DoorDialogRefusal, type DialogRefusal } from "@/components/common/dialog-refusal";
import { ROLE_LADDER, type MemberRole } from "@/lib/members/reads";

export function InviteDialog({
  open,
  onOpenChange,
  busy,
  refusal,
  addressInvalid = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  /** #625 AC3 — the panel's standing failure, rendered VERBATIM inside this modal. Until this
   *  existed, a refused invitation painted in the page-level StateBanner BEHIND the backdrop:
   *  the dialog correctly stayed open holding the typed address, and the sentence explaining why
   *  was unreadable without throwing that address away. Same paint, same law and same
   *  `refusalForThisDialog` guard the confirm dialog uses. */
  refusal?: DialogRefusal;
  /** #625 AC6 — is the SERVER's verdict specifically about this ADDRESS? The panel decides, from
   *  typed courier codes only (see its own comment). This component never judges an address: the
   *  header below records why a second client-side gate would be worse than none, and that is
   *  unchanged. All this flag does is put a server verdict beside the control it concerns. */
  addressInvalid?: boolean;
  /** Performs exactly one courier round trip. The dialog does not inspect the
   *  outcome — the panel decides whether to close (it stays open on a governed
   *  refusal so the admin can correct the email or the role and try again). */
  onSubmit: (email: string, role: MemberRole) => Promise<void>;
}) {
  const t = useTranslations("Members.inviteDialog");
  const tRoles = useTranslations("Members.roleOptions");
  const tDialog = useTranslations("Members.dialog");
  const emailId = useId();
  const emailErrorId = useId();
  const roleId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("bookkeeper");
  const guardRef = useRef(createSingleFireGuard());
  // CB-AE2E-004's counter, in this dialog too: bumped on every SETTLED submit so a repeated,
  // byte-identical refusal still re-announces and re-takes focus, and so a refusal raised before
  // this dialog ever submitted is somebody else's news and is not painted here.
  const [attempt, setAttempt] = useState(0);

  // A closed dialog forgets what was typed. Without this, re-opening after a
  // successful invite would present the address that was just invited — one
  // click from CLR10 'an invite is already pending for this email' and a
  // confusing refusal for something the admin did not mean to do again.
  useEffect(() => {
    if (!open) {
      setEmail("");
      setRole("bookkeeper");
    }
    // A fresh visit starts with no settled attempt of its own, so an older refusal cannot paint
    // on it — the same reset `MembersConfirmDialog` performs for the same reason.
    setAttempt(0);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {/* #625 — the address moves into a Field (appendix D row 28) so a SERVER verdict about
              it can sit beside the control, carrying `data-invalid` and `aria-invalid` rather
              than only a paragraph somewhere else on the screen. The input keeps every property
              it had: `type="email"` for the keyboard and autofill, and NO `required`, NO pattern
              and NO submit gate — the courier and the door remain the only judges. */}
          <Field data-invalid={addressInvalid || undefined}>
            <FieldLabel htmlFor={emailId}>{t("emailLabel")}</FieldLabel>
            <Input
              id={emailId}
              type="email"
              autoComplete="off"
              placeholder={t("emailPlaceholder")}
              aria-invalid={addressInvalid || undefined}
              aria-describedby={addressInvalid ? emailErrorId : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {addressInvalid ? <FieldError id={emailErrorId}>{t("addressInvalid")}</FieldError> : null}
          </Field>
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
        {/* The FORM-LEVEL half, distinct from the field's own message above: whatever the server
            refused, in its own words, with its own code chip. A governed refusal about the ROLE
            lands here and nowhere near the address. */}
        <DoorDialogRefusal refusal={refusalForThisDialog(refusal, attempt)} attempt={attempt} />
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{tDialog("cancel")}</DialogClose>
          <Button
            disabled={busy}
            onClick={async () => {
              // `runOnce` releases its own guard in a `finally`, so a REFUSAL
              // stays retryable from this same open dialog once the admin edits
              // the address — the guard closes the double-click window, it does
              // not close the dialog for good.
              const outcome = await runOnce(guardRef.current, async () => {
                await onSubmit(email, role);
              });
              // Only a submit that actually RAN counts: a click the single-fire guard dropped
              // changed nothing, so it must not license painting a refusal either.
              if (outcome.ran) setAttempt((n) => n + 1);
            }}
          >
            {busy ? tDialog("working") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
