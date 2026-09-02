"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
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
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StateBanner } from "@/components/common/state";

/**
 * Email + password sign-in via Supabase Auth cookie sessions.
 *
 * *** WHAT THIS COMMENT USED TO SAY, AND WHY ONLY ITS CONCLUSION CHANGED.
 * It read: "Invite-only (docs/plan/active/frontend-handoff-2026-08-23.md §0.4)
 * — there is deliberately no 'create an account' link or self-serve signup
 * route anywhere in this app; an account exists only once someone accepts an
 * invite (`app/(entry)/invite/[token]/page.tsx`)." The handoff citation stands,
 * unamended, and the
 * sentence was true of every tip before this one. It is kept here rather than
 * deleted because deleting it would erase why the link below was once
 * deliberately absent — which is exactly what makes a later reader re-litigate
 * a settled question.
 *
 * **裁-57 (2026-08-30 evening) inverts the conclusion.** Beta is a PAID launch
 * and there is no invited-free tier: "基本没有邀请免费这种东西, 只有signup 然后付费
 * stripe开始自己的firm". Signup is tier-3 self-serve (裁-43, restated), so the
 * "create an account" link below is now REQUIRED rather than forbidden — a
 * sign-in page that hides the only self-serve entrance strands every new firm
 * at the door. "Invite" keeps its other meaning intact: an RBAC membership
 * invite INTO an existing firm (app/(entry)/invite/[token]), which is a
 * different journey for a different person and is untouched by this. ***
 *
 * TWO ENTRANCES, AND THIS PAGE NOW NAMES BOTH: /signup for someone starting
 * their own firm, and the invite link in their inbox for someone joining one.
 *
 * ===========================================================================
 * THE TRANSPORT SEAM (added by P4-3, so this surface can be SCANNED)
 * ===========================================================================
 * `createSupabaseClient` is the same seam `InviteAcceptForm` has carried since
 * P2 (`InviteAuthClient`), added here for the same measured reason: the real
 * browser client cannot be constructed under the Node 20 test runner. It is
 * not merely awkward — `@supabase/realtime-js` needs a native `WebSocket`, and
 * the auth client's own refresh timers KEEP THE PROCESS ALIVE after the test
 * finishes. Measured on this branch: a login scan that constructed the real
 * client ran to a 200-SECOND timeout instead of the ~80ms the assertions take,
 * and would have hung `pnpm test` for the whole app.
 *
 * This surface had never been in either a11y or keyboard scan before P4-3
 * (`components/login-a11y.test.tsx`), and the seam is what makes registering it
 * possible at all.
 *
 * IT IS A TRANSPORT SEAM ONLY. Every wall on this journey — the open-redirect
 * guard below, and Supabase's own credential check — runs identically whichever
 * client is supplied. Nothing injectable can make a failed sign-in look like a
 * successful one: this component navigates only when `signInWithPassword`
 * returns no error, and a stub that returns no error is a stub asserting a
 * successful sign-in, which is what the test intends to simulate.
 *
 * REVIEW LAW 3 — the proof that this interface still describes the REAL client
 * is the default parameter itself (`createSupabaseClient = createClient`):
 * `tsc` must accept `typeof createClient` as `() => LoginAuthClient`, so an SDK
 * shape change reds the typecheck rather than drifting behind a structural type.
 */
export interface LoginAuthClient {
  auth: {
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{ error: { message: string } | null }>;
  };
}

export function LoginForm({
  createSupabaseClient = createClient,
}: {
  createSupabaseClient?: () => LoginAuthClient;
}) {
  const t = useTranslations("Login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createSupabaseClient();
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
        <h1 className="text-base font-semibold">{t("title")}</h1>
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
          <Link className="text-sm text-primary underline" href="/forgot-password">
            {t("forgotPassword")}
          </Link>
          {/* 裁-57 — the self-serve entrance, see this file's header. */}
          <p className="text-sm text-muted-foreground">
            {t.rich("noAccount", {
              link: (chunks) => (
                <Link className="text-primary underline" href="/signup">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
