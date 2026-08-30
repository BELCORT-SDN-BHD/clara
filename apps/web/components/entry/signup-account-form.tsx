"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

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
import { NotBuiltNote } from "@/components/common/not-built-note";
import { StateBanner } from "@/components/common/state";

/**
 * SIGNUP, STEP 1 OF 2 — create the Supabase account (design §4 A step 1).
 *
 * ===========================================================================
 * WHY SIGNUP IS TWO VISITS AND NOT ONE FORM
 * ===========================================================================
 * The design's chain is four steps: `signUp` → `claim_identity` →
 * `request_firm_registration` → land on /pending. Steps 2 and 3 are Clara doors
 * called as `clara_authenticated`, so they need a SESSION. Step 1 does not
 * produce one.
 *
 * PRD §8's interim guardrail requires email confirmation, and with confirmation
 * enabled `supabase.auth.signUp` resolves `{ user, session: null }` — Supabase's
 * own documented detector for "confirmation required" is exactly
 * `data.user && !data.session` (verified against the current Supabase docs via
 * context7, 2026-08-30). There is no token to call a door with until the person
 * clicks the link in their inbox.
 *
 * So the journey is: this form creates the account and stops honestly at "check
 * your email". The link opens `/auth/confirm`, whose inert GET waits for an
 * explicit button POST; successful verification then returns to /signup with a
 * cookie session, and `SignupFirmForm` runs steps 2 and 3. Collapsing the two
 * into one screen is not a polish decision that was skipped — it is not
 * expressible, and a form that appeared to do it would be reporting success for
 * doors it never called. That is the exact defect P4-1 repaired one route over.
 *
 * NOTHING IS CARRIED ACROSS THE EMAIL ROUND TRIP. The firm name and the person's
 * display name are collected on step 2, on the very form that submits them —
 * deliberately NOT stashed in `options.data` here for step 2 to replay. Every
 * value a door receives was typed on the screen that sent it, so there is no
 * client-held state that can silently disagree with what the person believes
 * they submitted.
 *
 * ===========================================================================
 * 裁-57 — WHY THIS SURFACE EXISTS AT ALL
 * ===========================================================================
 * Beta is a PAID launch, and this is the tier-3 self-serve entrance: sign up,
 * pay, start your own firm. It is NOT an invited-free tier — "invite" everywhere
 * else in this app means an RBAC membership invite INTO a firm that already
 * exists (`app/(entry)/invite/[token]`, a different journey for a different
 * person).
 *
 * ===========================================================================
 * 裁-68 ① — THE DPA GATE, AND EXACTLY HOW MUCH OF IT IS BUILT
 * ===========================================================================
 * The tier-3 gate is three walls plus payment: DPA e-sign at signup, 裁-36's
 * rate wall, and 裁-26's email-bound admission token. THIS FORM BUILDS THE
 * ACCEPTANCE UI AND NOTHING MORE, and says so on the page rather than in a
 * comment nobody reads.
 *
 * The checkbox genuinely gates the submit — an unaccepted box means no account
 * is created, and the keyboard suite drives that gate rather than reading it off
 * the source. What does NOT exist today is the durable half: there is no door in
 * the estate that records an acceptance, so nothing here may claim one was
 * recorded. `NotBuiltNote` below names P4-D as its owner, on the page, in the
 * person's own words. A checkbox that quietly recorded nothing while looking
 * like a signature is precisely the fake receipt `apps/web/AGENTS.md` forbids.
 *
 * The legal text itself is `docs/ops/legal/` — three drafts (the OpenAI DPA
 * brief, the client authorization letter, the PDPA s.129 cross-border basis
 * memo), each headed "DRAFT FOR OWNER REVIEW AND SIGNATURE" and each written by
 * an agent rather than a lawyer. 裁-68 says the text is "owner-confirmed once";
 * that confirmation has not happened on this tip. So the note states both
 * missing halves — the record and the confirmation — instead of presenting a
 * draft as a binding agreement.
 *
 * ===========================================================================
 * THE SEAM
 * ===========================================================================
 * `createSupabaseClient` mirrors `InviteAcceptForm`'s `InviteAuthClient` seam,
 * for the same measured reason: the real browser client cannot be constructed
 * under the Node 20 test runner (`@supabase/realtime-js` throws without a native
 * `WebSocket`). It is a TRANSPORT seam only — the DPA gate, the confirmation
 * requirement and every refusal below run identically whichever client is
 * supplied, and nothing injectable can make an unaccepted DPA create an account.
 *
 * REVIEW LAW 3 — the proof this interface still describes the REAL client is the
 * default parameter itself (`createSupabaseClient = createClient`): `tsc` must
 * accept `typeof createClient` as `() => SignupAuthClient`, so an SDK shape
 * change reds the typecheck instead of drifting behind a structural type.
 */
export interface SignupAuthClient {
  auth: {
    signUp(credentials: {
      email: string;
      password: string;
      options?: { emailRedirectTo?: string };
    }): Promise<{
      data: { user: unknown | null; session: unknown | null };
      error: { message: string } | null;
    }>;
    signOut(options: { scope: "local" }): Promise<{
      error: { message: string } | null;
    }>;
  };
}

type Stage = "form" | "submitting" | "check-email" | "configuration-error";

// NOTE the absence of a `= {}` default on the parameter itself. React always
// passes a props object, and defaulting the whole parameter widens the inferred
// props to `| undefined`, which makes `createElement(SignupAccountForm, {...})`
// fall through every typed overload to bare `Attributes` — so a test passing the
// seam gets "createSupabaseClient does not exist" from tsc. Every prop is
// individually optional, which is what callers actually need.
export function SignupAccountForm({
  createSupabaseClient = createClient,
}: {
  createSupabaseClient?: () => SignupAuthClient;
}) {
  const t = useTranslations("Signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dpaAccepted, setDpaAccepted] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // The DPA gate, re-checked at the act and not only in the disabled
    // attribute. `disabled` is a rendering; this is the client-side gate. They
    // agree today, and this branch keeps them agreeing if a later lane restyles
    // the control into something that can be clicked while it looks disabled.
    // It is not an Auth wall: the public anon key can call signUp directly.
    if (!dpaAccepted) return;

    setStage("submitting");
    setError(null);

    const supabase = createSupabaseClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Bring the confirmed person BACK to /signup, where the session they
        // now hold lets `SignupFirmForm` run steps 2 and 3. Supabase requires
        // this URL to be allowlisted in the project's Redirect URLs — an
        // owner-configured dashboard setting, not committed here.
        //
        // Guarded for SSR: this component is a Client Component and this
        // handler only ever runs in a browser, but reading `window` without
        // the guard would make the module hostile to any future server render.
        emailRedirectTo:
          typeof window === "undefined"
            ? undefined
            : `${window.location.origin}/auth/confirm`,
      },
    });

    if (signUpError) {
      // Supabase's own message, VERBATIM — never re-worded. This is not a
      // governed Clara refusal (no CLR code exists for it); it is the auth
      // provider's answer, and the person is owed it as given.
      setError(signUpError.message);
      setStage("form");
      return;
    }

    // Branch on Supabase's TWO documented success shapes, not merely `user`.
    // With confirmation ON the detector is exactly `data.user &&
    // !data.session`; only that shape may promise an email. With auto-confirm
    // both values exist, proving the project is misconfigured; fail closed
    // instead of opening the firm step under an unenforced confirmation policy.
    if (data?.user && !data.session) {
      setStage("check-email");
      return;
    }
    if (data?.user && data.session) {
      // `signUp` has already persisted this auto-confirmed session through the
      // browser client. Clear it before the refusal is painted so a reload
      // cannot silently carry the person onward. This is containment, not the
      // wall: `/signup` independently requires a positively confirmed server
      // user because hosted Auth can be called without this component.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // The server fork still refuses the unconfirmed session. A transport
        // failure here must not turn a misconfigured success into a UI success.
      }
      setStage("configuration-error");
      return;
    }

    // A response carrying neither documented shape is not a success we can act
    // on. Absence is not evidence (review law 2).
    setError(t("noAccountReturned"));
    setStage("form");
  }

  if (stage === "configuration-error") {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("configurationErrorTitle")}</h1>
          <CardDescription>{t("configurationErrorDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <StateBanner tone="error">{t("configurationErrorBanner")}</StateBanner>
        </CardContent>
      </Card>
    );
  }

  if (stage === "check-email") {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("checkEmailTitle")}</h1>
          <CardDescription>{t("checkEmailDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StateBanner tone="info">{t("checkEmailBanner")}</StateBanner>
          <p className="text-sm text-muted-foreground">
            {t.rich("checkEmailSignIn", {
              link: (chunks) => (
                <Link className="text-primary underline" href="/login">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </CardContent>
      </Card>
    );
  }

  const busy = stage === "submitting";

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t("title")}</h1>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid gap-1.5">
            <Label htmlFor="signup-email">{t("emailLabel")}</Label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signup-password">{t("passwordLabel")}</Label>
            {/*
              `minLength` is a UI convenience ONLY — a direct SDK/Auth API call
              bypasses it entirely. The authoritative password policy lives in
              hosted Supabase Auth and is an owner/deploy obligation recorded
              in README.md ("Security posture"), review finding 10.
            */}
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {/* 裁-68 ① — the DPA acceptance gate. A native checkbox with a real
              <label>: the same idiom Bank's acknowledgement controls use, and
              the one the a11y `label` rule and the keyboard walk both read
              without a portal in the way. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <input
                id="signup-dpa"
                type="checkbox"
                className="mt-1"
                checked={dpaAccepted}
                onChange={(event) => setDpaAccepted(event.target.checked)}
              />
              <Label htmlFor="signup-dpa" className="text-sm font-normal">
                {t("dpaLabel")}
              </Label>
            </div>
            <NotBuiltNote>{t("dpaNotBuilt")}</NotBuiltNote>
          </div>

          {error && <StateBanner tone="error">{error}</StateBanner>}

          <Button type="submit" className="w-full" disabled={busy || !dpaAccepted}>
            {busy ? t("submitting") : t("submit")}
          </Button>

          <p className="text-sm text-muted-foreground">
            {t.rich("haveAccount", {
              link: (chunks) => (
                <Link className="text-primary underline" href="/login">
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
