"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { resolveSameOriginPath } from "@/lib/safe-redirect";
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
import { StateBanner } from "@/components/common/state";

/**
 * Email + password sign-in via Supabase Auth cookie sessions. Invite-only
 * (docs/plan/active/frontend-handoff-2026-08-23.md §0.4) — there is
 * deliberately no "create an account" link or self-serve signup route
 * anywhere in this app; an account exists only once someone accepts an
 * invite (app/invite/[token]).
 */
export function LoginForm() {
  const t = useTranslations("Login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
      return;
    }

    // Open-redirect wall (lib/safe-redirect.ts): the raw `?next=` value is
    // PARSED against this origin and only its proved-same-origin canonical
    // path is navigated to. Lexical startsWith() checks are not sufficient —
    // WHATWG URL normalization strips %09/%0A/%0D before interpreting the
    // URL, which turns "/%09/evil.example" into a protocol-relative external
    // destination (security review finding 4). proxy.ts only ever WRITES a
    // pathname here; this guards the READ side against a crafted link.
    const next = resolveSameOriginPath(
      searchParams.get("next"),
      window.location.origin,
    );
    router.push(next);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* P3 polish: `gap-1.5` between a label and its field — the product's
            one label-to-field gap — and the sign-in failure now renders in the
            same <StateBanner> as every other failure in the app. Supabase's
            own `signInError.message` is still passed through verbatim. */}
        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          <div className="grid gap-1.5">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && <StateBanner tone="error">{error}</StateBanner>}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
