"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
    ): Promise<{ error: { message: string } | null }>;
  };
}

export function PasswordRecoveryForm({
  invalidLink = false,
  createSupabaseClient = createClient,
}: {
  invalidLink?: boolean;
  createSupabaseClient?: () => PasswordRecoveryAuthClient;
}) {
  const t = useTranslations("PasswordRecovery");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const origin = new URL(window.location.href).origin;
    const { error: sendError } = await createSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/recover`,
    });
    if (sendError) {
      setError(sendError.message);
      setSending(false);
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

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t("title")}</h1>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={submit}>
          {invalidLink ? <StateBanner tone="error">{t("invalidLink")}</StateBanner> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="recovery-email">{t("emailLabel")}</Label>
            <Input
              id="recovery-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {error ? <StateBanner tone="error">{error}</StateBanner> : null}
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? t("sending") : t("submit")}
          </Button>
          <Link className="text-sm text-primary underline" href="/login">{t("backToLogin")}</Link>
        </form>
      </CardContent>
    </Card>
  );
}
