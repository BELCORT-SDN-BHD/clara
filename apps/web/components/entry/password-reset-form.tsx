"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { StateBanner } from "@/components/common/state";
import { PasswordRecoveryForm } from "@/components/entry/password-recovery-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createSupabaseClient = createClient,
}: {
  createSupabaseClient?: () => PasswordResetAuthClient;
}) {
  const t = useTranslations("PasswordReset");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      return;
    }
    setSaved(true);
    setSaving(false);
  }

  if (sessionInvalid) return <PasswordRecoveryForm invalidLink />;

  if (saved) {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("savedTitle")}</h1>
          <CardDescription>{t("savedDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm text-primary underline" href="/">{t("continue")}</Link>
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
        <form className="flex flex-col gap-6" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor="new-password">{t("passwordLabel")}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? <StateBanner tone="error">{error}</StateBanner> : null}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? t("saving") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
