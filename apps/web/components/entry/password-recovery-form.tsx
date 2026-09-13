"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { waitSeconds } from "@/app/(entry)/auth/confirm/wait-seconds";
import { StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export interface PasswordRecoveryAuthClient {
  auth: {
    resetPasswordForEmail(
      email: string,
      options: { redirectTo: string },
    ): Promise<{ error: { message: string; code?: string } | null }>;
  };
}

/**
 * #622 — the four failure shapes `/auth/recover/handler.ts` classifies a
 * failed PKCE code exchange into, read off `/forgot-password?status=` by
 * `forgot-password/page.tsx`. Distinct from each other, and distinct from
 * the existing `invalidLink` boolean below (which `password-reset-form.tsx`
 * still uses, UNCHANGED, for its own absent-recovery-session fallback — a
 * different mechanism: a missing/expired browser SESSION on
 * `/auth/recover/password`, not a classified provider error on the code
 * exchange that got someone there).
 */
export type RecoveryLinkFailure = "expired" | "used_or_unknown" | "refused" | "rate_limited";

const LINK_FAILURE_KEYS: Readonly<Record<RecoveryLinkFailure, { title: string; description: string }>> = {
  expired: { title: "linkExpiredTitle", description: "linkExpiredDescription" },
  used_or_unknown: { title: "linkUsedOrUnknownTitle", description: "linkUsedOrUnknownDescription" },
  refused: { title: "linkRefusedTitle", description: "linkRefusedDescription" },
  rate_limited: { title: "linkRateLimitedTitle", description: "linkRateLimitedDescription" },
};

/**
 * THE RECOVERY-REQUEST'S OWN RATE LIMIT (distinct from the four link-failure
 * states above, which come from the LINK EXCHANGE, not from submitting this
 * form). Orchestrator decision for #622: read `error.code` on
 * `resetPasswordForEmail` and render a distinct state — no new attempt-budget
 * table, no new runtime wall in this PR; this is client-side classification
 * of the SAME Supabase-owned SMTP send cooldown that already fires today, not
 * a new limiter.
 *
 * GoTrue's message for `over_email_send_rate_limit` embeds the wait ITSELF —
 * "For security purposes, you can only request this after N seconds." (the
 * exact `SMTP.MaxFrequency` format, verified via Context7 `/supabase/auth`,
 * 2026-09-13) — so this parses that number rather than inventing one. A
 * message this build cannot parse a number out of (a future provider copy
 * change, a localized deployment) still falls back to a DEFAULT wait rather
 * than losing the state entirely, via the shared `waitSeconds` clamp-and-flag
 * idiom `wait-seconds.ts` already owns for the confirm lane's identical
 * shape (`resend-wall.ts`'s own `over_email_send_rate_limit`-shaped
 * `rate_limited` outcome carries the same default).
 */
const DEFAULT_REQUEST_RATE_LIMIT_SECONDS = 60;

function parseProviderWaitSeconds(message: string): number | undefined {
  const match = /(\d+)\s*seconds?/i.exec(message);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function PasswordRecoveryForm({
  invalidLink = false,
  linkFailure,
  createSupabaseClient = createClient,
}: {
  invalidLink?: boolean;
  linkFailure?: RecoveryLinkFailure;
  createSupabaseClient?: () => PasswordRecoveryAuthClient;
}) {
  const t = useTranslations("PasswordRecovery");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<{ seconds: number; atLeast: boolean } | null>(null);

  // FOCUS LANDS ON THE FAILURE BANNER (appendix D's pending-submit-identity
  // gap; the same rule `signup-legal-stage.tsx`'s own header records for its
  // accepted-agreement receipt). Disabling every input while `sending` is
  // true — below — can drop the browser's focus onto `<body>` if the person
  // was still focused in a field when the pending state committed; a failed
  // submit must not leave a keyboard/screen-reader user stranded there. The
  // banner cannot be focused from inside `submit` itself: it does not exist
  // until React commits the render that shows it, so the request is asked
  // for as state and carried out in an effect — the same two-step
  // `focusRequest` shape `signup-legal-stage.tsx` uses for its own banner.
  const bannerRef = useRef<HTMLDivElement>(null);
  const [focusBanner, setFocusBanner] = useState(false);
  useEffect(() => {
    if (!focusBanner) return;
    bannerRef.current?.focus();
    setFocusBanner(false);
  }, [focusBanner]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setRateLimited(null);
    const origin = new URL(window.location.href).origin;
    const { error: sendError } = await createSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/recover`,
    });
    if (sendError) {
      if (sendError.code === "over_email_send_rate_limit") {
        const wait = waitSeconds(parseProviderWaitSeconds(sendError.message), DEFAULT_REQUEST_RATE_LIMIT_SECONDS);
        setRateLimited({ seconds: wait.seconds, atLeast: wait.atLeast });
        setSending(false);
        setFocusBanner(true);
        return;
      }
      setError(sendError.message);
      setSending(false);
      setFocusBanner(true);
      return;
    }
    setSent(true);
    setSending(false);
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("sentTitle")}</h1>
          <CardDescription>{t("sentDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm text-primary underline" href="/login">{t("backToLogin")}</Link>
        </CardContent>
      </Card>
    );
  }

  const linkFailureCopy = linkFailure ? LINK_FAILURE_KEYS[linkFailure] : null;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t("title")}</h1>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={submit} aria-busy={sending}>
          {/* NO `ref`/`tabIndex` here, deliberately: this banner is driven by a
              PROP (the `status` this page was navigated to, off a full page
              load), never by this component's own submit — so it is never a
              `setFocusBanner` target below, and must not share `bannerRef`
              with the submit-driven banner, which CAN be mounted at the same
              time as this one (a person who arrived on a link-failure status
              and then submits a fresh request). Two elements racing to claim
              one ref in the same commit is exactly the bug a shared ref would
              reintroduce. */}
          {linkFailureCopy ? (
            <StateBanner tone={linkFailure === "rate_limited" ? "warning" : "error"} title={t(linkFailureCopy.title)}>
              {t(linkFailureCopy.description)}
            </StateBanner>
          ) : invalidLink ? (
            <StateBanner tone="error">{t("invalidLink")}</StateBanner>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="recovery-email">{t("emailLabel")}</Label>
            <Input
              id="recovery-email"
              type="email"
              autoComplete="email"
              required
              disabled={sending}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {rateLimited ? (
            <StateBanner ref={bannerRef} tabIndex={-1} tone="warning" title={t("requestRateLimitedTitle")}>
              {rateLimited.atLeast
                ? t("requestRateLimitedDescriptionAtLeast", { seconds: rateLimited.seconds })
                : t("requestRateLimitedDescription", { seconds: rateLimited.seconds })}
            </StateBanner>
          ) : error ? (
            <StateBanner ref={bannerRef} tabIndex={-1} tone="error">{error}</StateBanner>
          ) : null}
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? t("sending") : t("submit")}
          </Button>
          <Link className="text-sm text-primary underline" href="/login">{t("backToLogin")}</Link>
        </form>
      </CardContent>
    </Card>
  );
}
