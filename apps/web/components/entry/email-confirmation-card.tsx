"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  requestConfirmationResend as defaultRequestConfirmationResend,
  type RequestConfirmationResend,
} from "@/lib/registration/confirmation-resend";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 裁-92 — the CODE-ENTRY confirmation face. Replaces the prior explicit-click
 * link card in full (checkout-gate-design.md §3.6): the GET is still
 * paint-only (no `.auth.` call anywhere in this module — the form's POST is
 * the sole token-consuming execution root, in `verify/handler.ts`), but what
 * it paints is now an address + six-digit-code form instead of a hidden
 * `token_hash` and a single button.
 *
 * §3.3 / cell W-H — THE ADDRESS NEVER COMES FROM A URL. This component is
 * handed no `email` prop derived from `searchParams` (`page.tsx` never reads
 * one), and the ONLY prefill source is `recalledSignupEmail()` — THIS
 * BROWSER's own `sessionStorage`, written once by `SignupAccountForm` the
 * moment it saw the person type their own address. A person on a fresh tab,
 * a different device, or with storage cleared simply types it — the form
 * works identically either way, which is the whole cross-device point 裁-92
 * bought (design §3.2).
 *
 * THE THREE DISTINGUISHABLE REFUSAL CARDS (§3.6) plus the two defensive
 * states this module adds honestly:
 *
 *   wrong-code    the code did not match — carries the wall's OWN remaining-
 *                 attempt count (never guessed here)
 *   expired       Supabase answered `otp_expired` — N3, fix round 2026-09-01:
 *                 this does NOT mean the window definitely passed. Upstream
 *                 returns the same code for a wrong code, a truly expired
 *                 one, AND an unknown address alike, so the copy this state
 *                 renders says "that code didn't work", never "expired" —
 *                 see `verify/handler.ts`'s `isExpiredOtpError` for why
 *                 that's honest rather than a downgrade
 *   locked        C1/C2 refused — carries the wall's OWN wait
 *   unavailable   the Lane-B seam (`confirmation-wall.ts`) has not been wired
 *                 up yet — an honest `NotBuiltNote`, never mistaken for a
 *                 real lockout
 *   invalid       a malformed submission (missing/duplicated field) — never
 *                 reached by a real browser using this form as rendered
 *
 * THE FORM STAYS LIVE UNDER EVERY STATE (`signup-firm-form.tsx`'s own
 * precedent: "the REFUSAL state stays keyboard-operable — the person can
 * correct and resubmit"). A wrong code or a lockout is not a dead end; the
 * person edits the code (or waits, per the locked card's own words) and
 * submits again as a new POST — never retried by this component itself.
 */

export type ConfirmCodeState =
  | { readonly kind: "form" }
  | { readonly kind: "wrong-code"; readonly remaining: number }
  | { readonly kind: "expired" }
  | { readonly kind: "locked"; readonly waitSeconds: number }
  | { readonly kind: "unavailable" }
  | { readonly kind: "invalid" };

// M3, fix round 2026-09-01: the resend control no longer calls the browser
// Supabase client's resend method AT ALL — see `lib/registration/
// confirmation-resend.ts`'s header for the ORCHESTRATOR RULING and why.
// `resendStage` narrows accordingly: there is no longer a provider error
// MESSAGE to show (that required a real network call this component no
// longer makes) — only the seam's own two honest outcomes, "sent" or
// "unavailable".
type ResendStage = "idle" | "sending" | "sent" | "unavailable";

const WAIT_MINUTES = (seconds: number) => Math.max(1, Math.round(seconds / 60));

export function EmailConfirmationCard({
  state,
  requestResend = defaultRequestConfirmationResend,
}: {
  state: ConfirmCodeState;
  requestResend?: RequestConfirmationResend;
}) {
  const t = useTranslations("ConfirmEmail");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendStage, setResendStage] = useState<ResendStage>("idle");

  // Client-only prefill (§3.3): the initial render — server AND client, before
  // this effect runs — is identical and empty, so there is no hydration
  // mismatch. Only after mount does THIS BROWSER's own remembered address (if
  // any) appear, and a person is always free to overwrite it.
  useEffect(() => {
    const recalled = recalledSignupEmail();
    if (recalled !== null) setEmail(recalled);
  }, []);

  async function handleResend() {
    if (email.trim() === "") return;
    setResendStage("sending");
    // No direct Supabase resend call anywhere in this function — M3's whole
    // point. See `lib/registration/confirmation-resend.ts`'s header for what
    // "Lane B wires this through the wall" means in practice.
    const outcome = await requestResend(email);
    setResendStage(outcome.kind === "sent" ? "sent" : "unavailable");
  }

  const showResend = state.kind === "expired" || state.kind === "locked";

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
        {state.kind === "expired" && (
          <StateBanner tone="warning" title={t("expiredTitle")}>
            {t("expiredDescription")}
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
          <NotBuiltNote>
            <p className="font-medium">{t("unavailableTitle")}</p>
            <p>{t("unavailableDescription")}</p>
          </NotBuiltNote>
        )}

        <form method="post" action="/auth/confirm/verify" className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-email">{t("emailLabel")}</Label>
            <Input
              id="confirm-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-code">{t("codeLabel")}</Label>
            <Input
              id="confirm-code"
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              minLength={6}
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            {t("submit")}
          </Button>
        </form>

        {showResend && (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={resendStage === "sending" || email.trim() === ""}
              onClick={() => void handleResend()}
            >
              {resendStage === "sending" ? t("resending") : t("resend")}
            </Button>
            {resendStage === "sent" && (
              <StateBanner tone="info">{t("resent")}</StateBanner>
            )}
            {resendStage === "unavailable" && (
              <NotBuiltNote>{t("resendUnavailable")}</NotBuiltNote>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
