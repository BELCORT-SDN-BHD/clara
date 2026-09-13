"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useFocusOnFlag } from "@/hooks/use-focus-on-flag";
import { StateBanner } from "@/components/common/state";
import { PasswordRecoveryForm } from "@/components/entry/password-recovery-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { resolveSameOriginPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/client";

export interface PasswordResetAuthClient {
  auth: {
    updateUser(attributes: { password: string }): Promise<{
      error: {
        message: string;
        name?: string;
        status?: number;
        code?: string;
      } | null;
    }>;
  };
}

type PasswordResetError = NonNullable<
  Awaited<ReturnType<PasswordResetAuthClient["auth"]["updateUser"]>>["error"]
>;

function isRecoverySessionFailure(error: PasswordResetError): boolean {
  return error.name === "AuthSessionMissingError"
    || error.name === "AuthInvalidJwtError"
    || error.status === 401
    || error.code === "session_not_found"
    || error.code === "refresh_token_not_found"
    || error.code === "refresh_token_already_used"
    || error.code === "bad_jwt";
}

export function PasswordResetForm({
  /**
   * #622 review round — the validated same-origin return target, carried
   * through the WHOLE recovery journey (`login-form.tsx`'s "Forgot
   * password?" link -> `/forgot-password?next=` -> a short-lived cookie ->
   * `/auth/recover/handler.ts` reads it, clears it, and forwards it as this
   * page's own `?next=` -> here) so a person blocked at, say,
   * `/work?view=needs-you` lands back there after resetting instead of on
   * Home. RAW and UNVALIDATED at this point — every hop above only carries
   * the value along; this component is the ONE place it is actually
   * resolved, via the SAME `resolveSameOriginPath` wall `login-form.tsx`
   * itself reads `?next=` through, for the identical reason: a value that
   * crossed this many hops (a cookie, a redirect, a query string) is
   * exactly the shape review law 2 distrusts by default, so it is proved
   * same-origin here rather than assumed safe because an earlier hop
   * "should" have checked it.
   */
  next = null,
  createSupabaseClient = createClient,
}: {
  next?: string | null;
  createSupabaseClient?: () => PasswordResetAuthClient;
}) {
  const t = useTranslations("PasswordReset");
  /** The shared password-policy sentence — see `lib/auth/password-policy.ts`. */
  const tAuth = useTranslations("Auth");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FOCUS LANDS ON THE FAILURE BANNER (appendix D's pending-submit-identity
  // gap) — `hooks/use-focus-on-flag.ts` owns the mechanism and the argument
  // (#622 review round: this was a hand-copied triplet in three components).
  // `sessionInvalid` is excluded on purpose: that fork replaces this whole
  // component with `PasswordRecoveryForm`, whose OWN mount is not something
  // this hook should reach across into.
  const { ref: bannerRef, requestFocus } = useFocusOnFlag<HTMLDivElement>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { error: updateError } = await createSupabaseClient().auth.updateUser({ password });
    if (updateError) {
      if (isRecoverySessionFailure(updateError)) {
        setSessionInvalid(true);
        setSaving(false);
        return;
      }
      // Supabase owns the 12-character + breached-password policy; the provider
      // refusal remains byte-for-byte visible instead of being reclassified here.
      setError(updateError.message);
      setSaving(false);
      requestFocus();
      return;
    }
    setSaved(true);
    setSaving(false);
  }

  if (sessionInvalid) return <PasswordRecoveryForm invalidLink />;

  if (saved) {
    // `saved` starts `false` and is only ever flipped by a client-side
    // `setSaved(true)` inside `submit` above, so this branch never renders
    // during SSR — `window` is always available by the time it does, the
    // same guarantee `login-form.tsx`'s own `handleLogin` relies on for the
    // identical read. `new URL(window.location.href).origin`, not
    // `window.location.origin` directly — the same idiom `password-recovery-
    // form.tsx`'s own submit handler already uses to compute its
    // `redirectTo` origin, and the one this component's own test harness
    // (`test/hookHarness.ts`'s stub `window.location` carries only `href`,
    // not `origin`) actually requires to exercise a real value end to end.
    const continueTo = resolveSameOriginPath(next, new URL(window.location.href).origin);
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("savedTitle")}</h1>
          <CardDescription>{t("savedDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm text-primary underline" href={continueTo}>{t("continue")}</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t("title")}</h1>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={submit} aria-busy={saving}>
          <div className="grid gap-1.5">
            <Label htmlFor="new-password">{t("passwordLabel")}</Label>
            {/* THE RULE, BEFORE THE TYPING (PR 541 stage 2). This face used to
                be the only one that stated the policy, and it stated it in the
                CardDescription — one surface's prose rather than a fact the
                other two could share. It is a hint beside the field here, from
                the same constant and the same string the signup and invite
                faces render. See `lib/auth/password-policy.ts`, including why
                the breached-password clause that used to live in that
                description is GONE rather than moved. */}
            <p id="new-password-policy" className="text-xs text-muted-foreground">
              {tAuth("passwordPolicy", { min: PASSWORD_MIN_LENGTH })}
            </p>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              aria-describedby="new-password-policy"
              required
              disabled={saving}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? <StateBanner ref={bannerRef} tabIndex={-1} tone="error">{error}</StateBanner> : null}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? t("saving") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
