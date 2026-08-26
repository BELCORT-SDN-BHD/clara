"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { readInviteVerification } from "@/lib/invite-verification";
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

type Stage = "confirm" | "verifying" | "set-password" | "saving" | "error";

/**
 * The invite-accept flow (app/invite/[token]/page.tsx). Two governed calls,
 * both through Supabase Auth's own SDK — this component never invents an
 * acceptance mechanism of its own:
 *
 *  1. `verifyOtp({ token_hash, type: "invite" })` — the current official
 *     pattern for consuming a Supabase invite link (verified via context7 +
 *     supabase.com/docs/guides/auth/auth-email-templates, 2026-08-27). This
 *     is what proves the invite is real and establishes the session — it is
 *     the ONLY admission path into this app; there is no self-serve signup
 *     route anywhere (docs/plan/active/frontend-handoff-2026-08-23.md §0.4).
 *  2. `updateUser({ password })` — once verification has produced a session
 *     for a PROVEN subject, the invited person sets the password they will
 *     sign in with afterwards (app/login).
 *
 * THREE SECURITY PROPERTIES, all from the cross-model review 2026-08-27:
 *
 *  - **The OTP purpose is hard-coded** (finding 2, HIGH). `type: "invite"` is
 *    a literal here and the route no longer reads `?type=` at all. The old
 *    code accepted `signup`/`recovery`/`email_change`/`email` from the query
 *    string; an `email_change` token verifies "successfully" with a NULL user
 *    and NULL session, leaving a logged-in administrator's session in place —
 *    and the form then changed the ADMINISTRATOR's password.
 *  - **Verification is fail-closed and the continuation is bound to the
 *    verified subject** (finding 2). `readInviteVerification` accepts only a
 *    result carrying user + session + access token with matching subjects,
 *    and the password step re-reads the ambient session's SIGNATURE-VERIFIED
 *    subject (`getClaims()`) and refuses unless it is that same subject. The
 *    form never assumes the browser's ambient session is the invitee's.
 *  - **Nothing is consumed without an explicit human act** (finding 9,
 *    MEDIUM). The token in the URL is a single-use bearer capability;
 *    verifying it inside `useEffect` on mount let an email-security scanner,
 *    link preview or prefetching browser burn the invite before the employee
 *    ever saw it. The first stage is now a confirmation the person has to
 *    click. On success the flow ends with `router.replace("/")`, which drops
 *    the token-bearing URL out of the history stack rather than leaving it
 *    behind a Back button.
 *
 * A failed verify renders a typed, honest error — never a guess, never a
 * silent redirect — matching the product's own fail-closed rendering
 * principle (frontend-handoff §0.11) applied to the one page in this app
 * that runs before any session exists.
 */
export function InviteAcceptForm({ token }: { token: string }) {
  const t = useTranslations("Invite");
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  // The subject verifyOtp positively proved. Everything after verification is
  // bound to THIS id, not to whatever session the browser happens to hold.
  const [verifiedSubject, setVerifiedSubject] = useState<string | null>(null);

  async function handleAcceptInvite() {
    setStage("verifying");
    setErrorMessage(null);

    const supabase = createClient();
    const response = await supabase.auth.verifyOtp({
      token_hash: token,
      // HARD-CODED. Never a caller-supplied OTP purpose — see finding 2 above.
      type: "invite",
    });

    const verification = readInviteVerification(response);

    if (!verification.ok) {
      setErrorMessage(
        response.error?.message ?? t("verificationIncomplete"),
      );
      setStage("error");
      return;
    }

    setVerifiedSubject(verification.subject);
    setStage("set-password");
  }

  async function handleSetPassword(event: React.FormEvent) {
    event.preventDefault();
    setStage("saving");
    setErrorMessage(null);

    const supabase = createClient();

    // Bind the continuation to the verified subject. `updateUser` acts on the
    // session the browser currently holds; unless that session's
    // signature-verified subject IS the one this invite established, refuse.
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    const activeSubject = claimsData?.claims?.sub;

    if (
      claimsError ||
      !verifiedSubject ||
      !activeSubject ||
      activeSubject !== verifiedSubject
    ) {
      setErrorMessage(t("subjectMismatch"));
      setStage("error");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(error.message);
      setStage("set-password");
      return;
    }

    // replace(), not push(): the current history entry is the token-bearing
    // invite URL, and the token must not survive in the back stack.
    router.replace("/");
    router.refresh();
  }

  if (stage === "confirm") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("confirmTitle")}</CardTitle>
          <CardDescription>{t("confirmDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            className="w-full"
            onClick={() => void handleAcceptInvite()}
          >
            {t("confirmSubmit")}
          </Button>
        </CardContent>
      </Card>
    );
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
            {/*
              `minLength` is a UI convenience ONLY — a direct SDK/Auth API call
              bypasses it entirely. The authoritative password policy lives in
              hosted Supabase Auth and is an owner/deploy obligation recorded
              in README.md ("Security posture"), review finding 10.
            */}
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
