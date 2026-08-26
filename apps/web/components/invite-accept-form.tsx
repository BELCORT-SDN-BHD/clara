"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Stage = "verifying" | "set-password" | "saving" | "error";

/**
 * The invite-accept flow (app/invite/[token]/page.tsx). Two governed calls,
 * both through Supabase Auth's own SDK — this component never invents an
 * acceptance mechanism of its own:
 *
 *  1. `verifyOtp({ token_hash, type })` — the current official pattern for
 *     consuming a Supabase invite/confirmation link server- OR client-side
 *     (verified via context7 + supabase.com/docs/guides/auth/auth-email-
 *     templates, 2026-08-27). This is what proves the invite is real and
 *     establishes the session — it is the ONLY admission path into this
 *     app; there is no self-serve signup route anywhere
 *     (docs/plan/active/frontend-handoff-2026-08-23.md §0.4).
 *  2. `updateUser({ password })` — once verifyOtp has produced a session,
 *     the invited person sets the password they will sign in with
 *     afterwards (app/login).
 *
 * A failed verify renders a typed, honest error — never a guess, never a
 * silent redirect — matching the product's own fail-closed rendering
 * principle (frontend-handoff §0.11) applied to the one page in this app
 * that runs before any session exists.
 */
export function InviteAcceptForm({
  token,
  type,
}: {
  token: string;
  type: EmailOtpType;
}) {
  const t = useTranslations("Invite");
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type,
      });

      if (cancelled) return;

      if (error) {
        setErrorMessage(error.message);
        setStage("error");
        return;
      }

      setStage("set-password");
    }

    void verify();

    return () => {
      cancelled = true;
    };
  }, [token, type]);

  async function handleSetPassword(event: React.FormEvent) {
    event.preventDefault();
    setStage("saving");
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(error.message);
      setStage("set-password");
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (stage === "verifying") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("verifyingTitle")}</CardTitle>
          <CardDescription>{t("verifyingDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (stage === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("errorTitle")}</CardTitle>
          <CardDescription>{t("errorDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        </CardContent>
      </Card>
    );
  }

  const isSaving = stage === "saving";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("setPasswordTitle")}</CardTitle>
        <CardDescription>{t("setPasswordDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSetPassword} className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSaving}>
            {isSaving ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
