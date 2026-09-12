"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

import { recalledSignupEmail } from "@/lib/registration/signup-email-storage";
import { StateBanner } from "@/components/common/state";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * 裁-92 — the CODE-ENTRY confirmation face. The GET is paint-only (no `.auth.`
 * call anywhere in this module); the two POSTs below are the only
 * token-consuming and mail-sending execution roots, in `verify/handler.ts` and
 * `resend/handler.ts`.
 *
 * §3.3 / cell W-H — THE ADDRESS NEVER COMES FROM A URL. This component is
 * handed no `email` derived from `searchParams` (`page.tsx` never reads one).
 * It has exactly two sources, and neither one is caller-choosable:
 *   · `prefillEmail` — the address THIS BROWSER's own POST just submitted,
 *     echoed back through the unforgeable flash cookie (`confirm-flash.ts`) so
 *     a redirect does not empty the field the person filled in;
 *   · `recalledSignupEmail()` — THIS BROWSER's own `sessionStorage`, written
 *     once by `SignupAccountForm` the moment it saw the person type it.
 * A fresh tab with neither simply types the address, and the form works
 * identically — the cross-device point 裁-92 bought.
 *
 * ===========================================================================
 * THE CODE FIELD (#621) — ONE INPUT, LABELLED, PASTE-TOLERANT
 * ===========================================================================
 * A six-digit code from a provider whose mail carries `{{ .Token }}` and
 * nothing to click. The field is a single `<input>` carrying
 * `inputMode="numeric"` and `autocomplete="one-time-code"` — the pair every
 * mobile keyboard and OS-level code autofill actually keys on — and it
 * NORMALISES what lands in it: digits are kept, everything else (the spaces and
 * dashes a mail client inserts, a pasted "Your code is 123 456") is dropped,
 * and the result is capped at six. So a paste works, an autofill works, and
 * typing works, through one control that a screen reader announces once.
 *
 * WHY NOT shadcn's six-slot `input-otp`. It is available for this project's
 * registry variant (`shadcn view input-otp`, base-nova, 2026-09-12) and it
 * needs a NEW npm dependency, `input-otp`. Adding one means a lockfile write
 * and a workspace install, which this build could not take: two other lanes
 * were writing `packages/db` and `packages/runtime` in the same checkout at the
 * time. `components/work/work-question-form.tsx` records the same decision for
 * the same class of reason — "built on the primitives this project already has
 * and has already contrast-checked" — and the slotted variant is a rendering of
 * the same single underlying input, so nothing about the provider contract,
 * paste, or autofill differs. Recorded as a decision with its evidence.
 *
 * ===========================================================================
 * THE STATES
 * ===========================================================================
 * The CODE attempt's four (裁-109's flattening is unchanged):
 *   wrong-code    a wrong code, an expired one, an unknown address or a banned
 *                 account — Supabase cannot reliably tell them apart, so
 *                 neither does this card. Carries the wall's OWN remaining count.
 *   locked        C1/C2 refused — carries the wall's OWN wait
 *   unavailable   the wall could not be reached; the code is still good
 *   invalid       a malformed submission, or an unauthenticated/mismatched
 *                 flash marker — both mean "nothing here can be trusted"
 *
 * The RESEND's five (#621), deliberately NOT folded into the four above:
 *   resent                a new code is on its way, to the address it went to
 *   resend-locked         the C1/C2 attempt budget — a resend spends one
 *   resend-rate-limited   the provider's own per-address send cooldown
 *   resend-invalid-email  the address is not one that can be sent to
 *   resend-unavailable    we could not ask; nothing was sent
 *
 * THE FORM STAYS LIVE UNDER EVERY STATE. A wrong code, a lockout and a send
 * cooldown are not dead ends: the person edits the code (or waits, per the
 * card's own words) and submits again as a new POST — never retried by this
 * component itself. Only the RESEND control is disabled while a wait the server
 * reported is outstanding, because pressing it again would spend another
 * attempt against a budget that has already said no.
 */

export type ConfirmCodeState =
  | { readonly kind: "form" }
  | { readonly kind: "wrong-code"; readonly remaining: number }
  | { readonly kind: "locked"; readonly waitSeconds: number }
  | { readonly kind: "unavailable" }
  | { readonly kind: "invalid" }
  | { readonly kind: "resent" }
  | { readonly kind: "resend-locked"; readonly waitSeconds: number }
  | { readonly kind: "resend-rate-limited"; readonly waitSeconds: number }
  | { readonly kind: "resend-invalid-email" }
  | { readonly kind: "resend-unavailable" };

const WAIT_MINUTES = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** Keep the digits, drop everything else, stop at six. This is what makes a
 *  paste of "123 456", "123-456" or "Code: 123456" land as `123456` — and what
 *  keeps a typed letter from ever reaching the wall as an attempt. */
export function normalizeConfirmationCode(raw: string): string {
  return raw.replace(/\D+/g, "").slice(0, 6);
}

export function EmailConfirmationCard({
  state,
  prefillEmail = null,
}: {
  state: ConfirmCodeState;
  /** The address this browser's own POST just submitted, read from the flash
   *  cookie by `page.tsx`. Never from a query string. */
  prefillEmail?: string | null;
}) {
  const t = useTranslations("ConfirmEmail");
  // Server and client first render agree: both see the same prop. The only
  // value that appears AFTER mount is this browser's own remembered address,
  // and only when the flash carried none — so there is no hydration mismatch
  // and no way for a link to choose what the field says.
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (prefillEmail !== null && prefillEmail !== "") return;
    const recalled = recalledSignupEmail();
    if (recalled !== null) setEmail(recalled);
  }, [prefillEmail]);

  // The two outcomes that carry a wait the SERVER measured. While one is on
  // screen the resend control is disabled: asking again would spend another
  // attempt against a budget that has already refused.
  const resendWaitSeconds =
    state.kind === "resend-locked" || state.kind === "resend-rate-limited"
      ? state.waitSeconds
      : null;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t("title")}</h1>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.kind === "wrong-code" && (
          <StateBanner tone="error" title={t("wrongCodeTitle")}>
            {t("wrongCodeDescription", { remaining: state.remaining })}
          </StateBanner>
        )}
        {state.kind === "locked" && (
          <StateBanner tone="warning" title={t("lockedTitle")}>
            {t("lockedDescription", { wait: WAIT_MINUTES(state.waitSeconds) })}
          </StateBanner>
        )}
        {state.kind === "invalid" && (
          <StateBanner tone="error" title={t("invalidTitle")}>
            {t("invalidDescription")}
          </StateBanner>
        )}
        {state.kind === "unavailable" && (
          <StateBanner tone="error" title={t("unavailableTitle")}>
            {t("unavailableDescription")}
          </StateBanner>
        )}
        {state.kind === "resent" && (
          <StateBanner tone="info" title={t("resentTitle")}>
            {email === ""
              ? t("resentDescription")
              : t("resentDescriptionAddressed", { email })}
          </StateBanner>
        )}
        {state.kind === "resend-locked" && (
          <StateBanner tone="warning" title={t("resendLockedTitle")}>
            {t("resendLockedDescription", { seconds: state.waitSeconds })}
          </StateBanner>
        )}
        {state.kind === "resend-rate-limited" && (
          <StateBanner tone="warning" title={t("resendRateLimitedTitle")}>
            {t("resendRateLimitedDescription", { seconds: state.waitSeconds })}
          </StateBanner>
        )}
        {state.kind === "resend-invalid-email" && (
          <StateBanner tone="error" title={t("resendInvalidEmailTitle")}>
            {t("resendInvalidEmailDescription")}
          </StateBanner>
        )}
        {state.kind === "resend-unavailable" && (
          <NotBuiltNote>
            <p className="font-medium">{t("resendUnavailableTitle")}</p>
            <p>{t("resendUnavailableDescription")}</p>
          </NotBuiltNote>
        )}

        {/* ONE FORM, TWO DESTINATIONS. The resend control is a second submit
            carrying `formAction` (and `formNoValidate`, so an empty code field
            does not block a request that has no use for one), rather than a
            second form with a hidden copy of the address or a `fetch` this
            component would have to interpret. One address field, one source of
            truth for what gets sent, and both controls keep working with no
            JavaScript at all. */}
        <form method="post" action="/auth/confirm/verify" className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="confirm-email">{t("emailLabel")}</FieldLabel>
            <Input
              id="confirm-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field>
            <FieldContent>
              <FieldLabel htmlFor="confirm-code">
                <FieldTitle>{t("codeLabel")}</FieldTitle>
              </FieldLabel>
              <FieldDescription id="confirm-code-hint">{t("codeHint")}</FieldDescription>
            </FieldContent>
            <Input
              id="confirm-code"
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              // NO `maxLength`, AND ITS ABSENCE IS THE POINT (measured in a real
              // browser, 2026-09-12). `maxlength` truncates the value BEFORE any
              // `input` event fires, so a pasted "654 321" arrived as "654 32"
              // and normalised to a five-digit code — the field's own cap
              // silently eating the paste it exists to accept. The normaliser is
              // the cap instead: it slices to six on every change, so the field
              // can never hold more, and `pattern` still refuses a short
              // submission at the browser's own validation.
              required
              aria-describedby="confirm-code-hint"
              value={code}
              // A paste, an OS autofill and a keystroke all arrive here, and
              // all three are normalised the same way — see
              // `normalizeConfirmationCode`.
              onChange={(event) => setCode(normalizeConfirmationCode(event.target.value))}
            />
          </Field>
          <Button type="submit" className="w-full">
            {t("submit")}
          </Button>
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            formAction="/auth/confirm/resend"
            formNoValidate
            disabled={resendWaitSeconds !== null}
          >
            {t("resend")}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground">
          {t.rich("alreadyConfirmed", {
            link: (chunks) => (
              <Link className="text-primary underline" href="/login">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t.rich("forgotPassword", {
            link: (chunks) => (
              <Link className="text-primary underline" href="/forgot-password">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </CardContent>
    </Card>
  );
}
