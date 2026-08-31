"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { claimIdentity, requestFirmRegistration } from "@/lib/identity/doors";
import { isDoorRefusal } from "@/lib/doors";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StateBanner } from "@/components/common/state";

/**
 * SIGNUP, STEP 2 OF 2 — the two governed doors (design §4 A steps 2 and 3).
 *
 * Rendered by `app/(entry)/signup/page.tsx` when the caller ALREADY HOLDS a
 * session: the person confirmed their email, Supabase sent them back here, and
 * there is now a token to call `clara_authenticated` doors with. See
 * `SignupAccountForm`'s header for why the journey is two visits.
 *
 * ===========================================================================
 * THE ORDER OF THE TWO CALLS IS THE DB's, NOT A UI PREFERENCE
 * ===========================================================================
 *   1. `clara.claim_identity(p_display_name, p_op_key)`  — live body 0141:250
 *   2. `clara.request_firm_registration(p_firm_name, p_note, p_op_key)`
 *                                                        — live body 0145:370
 *
 * `request_firm_registration` raises **CLR04 'unknown actor'** (0145:376-378)
 * for an actor with no `clara.users` row, and `claim_identity` is the only door
 * that mints one outside an invite. Reversing these two refuses every time. The
 * sequencing is asserted by the suite, not left to this comment.
 *
 * IF STEP 1 REFUSES, STEP 2 IS NOT ATTEMPTED. The `await` ordering is the
 * mechanism — a throw from `claimIdentity` skips the second call entirely — and
 * the suite proves it by counting the calls the transport actually saw, not by
 * reading this paragraph.
 *
 * ===========================================================================
 * THE EMAIL IS NEVER SOURCED FROM THIS FORM
 * ===========================================================================
 * There is no email field here, and neither door takes one. `claim_identity`
 * reads it from the verified JWT claim INSIDE the door (`clara._jwt_email()`,
 * 0141:152/261) and refuses CLR04 if the JWT carries no verified email at all
 * (0141:270). A form field would let a caller claim another person's address.
 * The suite asserts the absence positively — it walks the args this component
 * actually posts and requires no email-shaped key among them, rather than
 * asserting that no `<input type="email">` is rendered, which would be a claim
 * about the markup instead of about the wire.
 *
 * ===========================================================================
 * REFUSALS RENDER VERBATIM, AND ARE NEVER PRE-EMPTED
 * ===========================================================================
 * Eight refusals are reachable here (the full census is in
 * `lib/identity/doors.ts`'s header). Two matter most to a real person, and both
 * are CLR09 from `request_firm_registration`:
 *
 *   'actor already belongs to a firm'            (0145:392) — "I am already
 *       staff somewhere else and want my own firm". Design §4 A names this as
 *       the case that must refuse at REQUEST time with a legible message rather
 *       than be discovered at approval time. It does, and the sentence the
 *       person reads is the DB's own.
 *   'an open registration request already exists' (0145:406, 426)
 *
 * NEITHER IS PRE-EMPTED IN THIS UI. There is no client-side membership check in
 * front of the submit, and no copy of either message: pre-disabling would be the
 * UI guessing the DB's answer, and a copied sentence is a sentence that drifts
 * the day a migration re-words the original. The control lets the click happen
 * and renders the verdict — the same discipline design §4 D applies to the
 * last-owner wall.
 *
 * A REFUSAL IS NEVER RETRIED by this component (`lib/doors.ts`'s standing
 * contract). The person changes something and submits again as a NEW call.
 *
 * ===========================================================================
 * op_key — TWO DOORS, TWO DIFFERENT IDEMPOTENCY CONTRACTS
 * ===========================================================================
 * Both keys are minted by this component and held stable across a retry of the
 * SAME attempt, so a transport failure after the DB already committed replays
 * the receipt instead of colliding with the state that first call created.
 *
 * They are RE-MINTED whenever the person edits a field, and that is required
 * rather than tidy: `request_firm_registration`'s replay is ARG-COMPLETE
 * (0145:396-403) — the same op_key with a DIFFERENT firm name refuses CLR10
 * 'op_key reused with different args'. Someone who fixes a typo in their firm
 * name and resubmits would otherwise be permanently refused by their own first
 * attempt. `claim_identity`'s contract differs (0141:256-259: structural
 * dedupe, no stored key) and re-minting is harmless there; one rule for both is
 * simpler than two and is correct for both.
 */

/** A refusal as this surface renders it: the DB's own CLR code and its own
 *  message, both VERBATIM. `code` is null for an ordinary failure (transport,
 *  no session) — there is no DB verdict to show a chip for. */
type Refusal = { code: string | null; message: string };

const newOpKey = (): string => crypto.randomUUID();

export function SignupFirmForm() {
  const t = useTranslations("Signup");
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  // One key per door, per ATTEMPT. `useRef` rather than state: changing them
  // must not re-render, and they must survive a re-render that does happen.
  const identityKey = useRef(newOpKey());
  const registrationKey = useRef(newOpKey());

  /** Any field edit starts a NEW attempt — see the op_key note in the header. */
  function onEdit<T>(set: (v: T) => void) {
    return (value: T) => {
      identityKey.current = newOpKey();
      registrationKey.current = newOpKey();
      set(value);
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setRefusal(null);

    try {
      // STEP 2 — mint the clara.users row. Must precede step 3 (CLR04
      // 'unknown actor'); a throw here skips the next call entirely.
      await claimIdentity({
        displayName,
        opKey: identityKey.current,
      });

      // STEP 3 — record the registration request.
      await requestFirmRegistration({
        firmName,
        // `null` and `""` are the same thing to the door (it nullif/btrims at
        // 0145:389), so an untouched textarea sends null rather than "".
        note: note.trim() === "" ? null : note,
        opKey: registrationKey.current,
      });
    } catch (e) {
      // A governed refusal renders with its CLR chip; anything else (transport,
      // no session) renders as a plain failure with NO chip, because there is no
      // DB verdict to show. Three distinguishable states, never one blur.
      if (isDoorRefusal(e)) {
        setRefusal({ code: e.code, message: e.message });
      } else {
        setRefusal({
          code: null,
          message: e instanceof Error ? e.message : t("unknownFailure"),
        });
      }
      setBusy(false);
      return;
    }

    // STEP 4 — land on the holding page, and ONLY after both doors returned.
    // `replace`, not `push`: signup is complete and there is nothing to go back
    // to. The holding page re-reads the request from the DB rather than trusting
    // anything this component holds (hydrate-never-trust).
    router.replace("/pending");
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t("firmTitle")}</h1>
        <CardDescription>{t("firmDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid gap-1.5">
            <Label htmlFor="signup-name">{t("nameLabel")}</Label>
            <Input
              id="signup-name"
              autoComplete="name"
              required
              value={displayName}
              onChange={(event) => onEdit(setDisplayName)(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signup-firm">{t("firmNameLabel")}</Label>
            <Input
              id="signup-firm"
              required
              value={firmName}
              onChange={(event) => onEdit(setFirmName)(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signup-note">{t("noteLabel")}</Label>
            <Textarea
              id="signup-note"
              rows={3}
              value={note}
              onChange={(event) => onEdit(setNote)(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">{t("noteHint")}</p>
          </div>

          {refusal && (
            <StateBanner
              tone="error"
              code={refusal.code ?? undefined}
              title={t("refusalTitle")}
            >
              {refusal.message}
            </StateBanner>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t("firmSubmitting") : t("firmSubmit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
