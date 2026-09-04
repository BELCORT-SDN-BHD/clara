"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { createClient } from "@/lib/supabase/client";
import { rememberSignupEmail } from "@/lib/registration/signup-email-storage";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
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
 * your email", offering a CONTROL onto `/auth/confirm` — the mail carries a
 * six-digit code and nothing to click (裁-92), so the card has to carry the
 * route or there is none. That page's inert GET waits for an explicit button
 * POST; successful verification then returns to /signup with a
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
 * 裁-68 ① — THE DPA GATE MOVED. IT NO LONGER LIVES ON THIS FORM.
 * ===========================================================================
 * v1 of this file carried a checkbox here, gating THIS submit on DPA
 * acceptance and naming the missing durable half in a `NotBuiltNote`. The
 * checkout-gate design (`docs/plan/active/checkout-gate-design.md` §1.1)
 * places the real DPA step LATER — at "/signup" step 2, AFTER `claim_identity`
 * and `request_firm_registration`, once a `clara.users` row and an open
 * registration exist to sign against — and the delegated beta text is read
 * from `clara.dpa_documents` there, not authored as a checkbox label here
 * (`signup-dpa-form.tsx`, rendered by `signup-step.tsx`'s third fork). A
 * checkbox on THIS screen that recorded nothing was already the fake receipt
 * `apps/web/AGENTS.md` forbids; moving the gate to where a real signature can
 * eventually be recorded is the fix, not a smaller version of the same
 * checkbox. This form now gates on nothing but the ordinary field validation
 * every signup form has.
 *
 * The legal text itself is `docs/ops/legal/` — the beta placeholder body
 * (`clara-beta-dpa.md`, 裁-90) plus three research drafts (the OpenAI DPA
 * brief, the client authorization letter, the PDPA s.129 cross-border basis
 * memo). `signup-dpa-form.tsx`'s own header carries the up-to-date account of
 * what is and is not durably recorded today.
 *
 * ===========================================================================
 * THE CONFIRM PAGE NEEDS THE ADDRESS, AND MAY NEVER READ IT FROM A URL (裁-92)
 * ===========================================================================
 * `/auth/confirm` is now a six-digit CODE form (裁-92), not a link — see that
 * page's own header. The email field on the code form is either typed by the
 * person or read from THIS BROWSER's own signup state; it is never
 * accepted from a query parameter (the W-H wall, checkout-gate-design.md
 * §3.3). `rememberSignupEmail` below is the ONLY way that browser state gets
 * written: best-effort `sessionStorage`, guarded so a private-mode browser
 * that throws on the write degrades to "the person types it themselves"
 * rather than crashing the signup step.
 *
 * ===========================================================================
 * THE SEAM
 * ===========================================================================
 * `createSupabaseClient` mirrors `InviteAcceptForm`'s `InviteAuthClient` seam,
 * for the same measured reason: the real browser client cannot be constructed
 * under the Node 20 test runner (`@supabase/realtime-js` throws without a native
 * `WebSocket`). It is a TRANSPORT seam only — the confirmation requirement and
 * every refusal below run identically whichever client is supplied.
 *
 * REVIEW LAW 3 — the proof this interface still describes the REAL client is the
 * default parameter itself (`createSupabaseClient = createClient`): `tsc` must
 * accept `typeof createClient` as `() => SignupAuthClient`, so an SDK shape
 * change reds the typecheck instead of drifting behind a structural type.
 */
export interface SignupAuthClient {
  auth: {
    /**
     * `options` STAYS IN THIS INTERFACE and this form NEVER PASSES IT — the
     * two facts are not in tension. This type describes what the SDK ACCEPTS
     * (it is proved assignable from `typeof createClient` by the default
     * parameter below); what this form SENDS is a behavioural property, and
     * `signup-keyboard.test.tsx`'s "signUp passes NO redirect at all" cell is
     * what pins it — by driving the real handler and reading the real
     * argument, with a hostile value planted in `location.search`. Narrowing
     * the type instead would prove nothing about the call and would make the
     * seam describe something other than the client it stands in for.
     */
    signUp(credentials: {
      email: string;
      password: string;
      options?: { emailRedirectTo?: string };
    }): Promise<{
      data: { user: unknown | null; session: unknown | null };
      error: { message: string; code?: string; status?: number } | null;
    }>;
    signOut(options: { scope: "local" }): Promise<{
      error: { message: string } | null;
    }>;
  };
}

type Stage = "form" | "submitting" | "check-email" | "configuration-error";

const DUPLICATE_ACCOUNT_CODES = new Set(["user_already_exists", "email_exists"]);

function isDuplicateAccountError(error: NonNullable<Awaited<
  ReturnType<SignupAuthClient["auth"]["signUp"]>
>["error"]>): boolean {
  if (typeof error.code === "string" && DUPLICATE_ACCOUNT_CODES.has(error.code)) {
    return true;
  }

  // Older/self-hosted Auth deployments may omit the stable code. Keep the
  // fallback deliberately narrow: the provider's exact duplicate shape, not
  // arbitrary 422s, maps to the same public result as a fresh signup.
  return error.status === 422 && /^user already registered\.?$/i.test(error.message.trim());
}

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
  // The SHARED policy sentence, in its own namespace so all three password
  // surfaces read one string rather than three that can drift apart.
  const tAuth = useTranslations("Auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStage("submitting");
    setError(null);

    const supabase = createSupabaseClient();
    // NO `emailRedirectTo`, AND ITS ABSENCE IS THE POINT (PR 541, H-35).
    //
    // This call used to pass `emailRedirectTo: ${origin}/auth/confirm` under a
    // comment describing a link the mail has not carried since 裁-92: the
    // Confirm-signup template emits `{{ .Token }}` and nothing to click
    // (`docs/ops/wave-g-setup-checklist.md:161`, and the FS-11 Management-API
    // read on 2026-09-03 confirmed the deployed template — "carries
    // `{{ .Token }}` and no link"). The option was inert and the comment
    // described a journey the build no longer has, which is the exact shape
    // review law 3 exists for: the next reader would have "restored" the link
    // flow to make the option meaningful.
    //
    // Deleted rather than annotated. `signUp` accepts the absence — `options`
    // is optional in the SDK and in this module's own `SignupAuthClient`
    // interface, so `tsc` proves the call still type-checks against
    // `typeof createClient`. The route to the code form is now a VISIBLE
    // CONTROL on the check-email card below, not a URL the person types.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      // Duplicate-account errors are an enumeration oracle when surfaced.
      // Normalize the stable Auth codes (with a narrow legacy shape fallback)
      // to the SAME public state as a fresh signup. Other provider failures
      // remain verbatim: they describe availability/validation, not whether a
      // particular email already has an account.
      if (isDuplicateAccountError(signUpError)) {
        // REMEMBER THE ADDRESS HERE TOO, AND THIS LINE IS A WALL (review-544
        // BLOCKER). Flattening the duplicate arm to the same CARD is only half
        // the flattening once that card carries a control: the /auth/confirm
        // link added by H-35 leads somewhere whose EMAIL FIELD is prefilled
        // from this browser's remembered address. Write it only on the fresh
        // arm and the code form arrives prefilled for a new address and blank
        // for an existing one — one tap, and the screen has answered "does
        // this email already have an account". The oracle moves from the card
        // to its destination; the fix is to make the destination identical
        // too.
        //
        // THE W-H BINDING HOLDS. `rememberSignupEmail` may only ever be
        // called with an address THIS BROWSER just watched a human type
        // (signup-email-storage.ts's header), and that is exactly what
        // happened on this submit — whether or not the account already
        // existed. Nothing is disclosed by writing it: the value is the one
        // the person typed into the field above, kept per-tab and per-origin,
        // and it never leaves this browser.
        rememberSignupEmail(email);
        setStage("check-email");
        return;
      }
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
      // W-H's other half: the ONE point this browser has just seen the
      // person type their own address. Best-effort only — see
      // signup-email-storage.ts's header for why a write failure here must
      // never block the transition it is merely a convenience for.
      rememberSignupEmail(email);
      setStage("check-email");
      return;
    }
    if (data?.user && data.session) {
      // `signUp` has already persisted this auto-confirmed session through the
      // browser client. Clear it before the refusal is painted so a reload
      // cannot silently carry the person onward. This is containment, not the
      // wall: `/signup` re-reads a positively confirmed server user, but an
      // AUTOCONFIRMED hosted user satisfies that predicate. The blocking Auth
      // Management-API deploy receipt is the wall against configuration drift;
      // this sign-out contains the browser path only.
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
          {/* THE ROUTE TO THE CODE FORM (H-35 / CB-AE2E-006). Before this,
              the card promised "the next screen" and rendered no way to
              reach it: the mail carries no link (裁-92), so the only route
              was typing the URL. A `<Link>`, not a Button — `/auth/confirm`
              is a real paint-only GET page, and its own header forbids a
              query parameter carrying the address (the W-H wall). None is
              needed: `rememberSignupEmail` ran on EVERY arm that reaches this
              card, so the code form prefills from THIS BROWSER's own
              sessionStorage and the person types only the six digits.

              "EVERY ARM" IS LOAD-BEARING, not incidental (review-544). This
              card is reached two ways — a fresh signup and a duplicate
              account — and the duplicate arm flattens to this identical card
              precisely so the screen is not an enumeration oracle. A control
              whose DESTINATION differs by arm reopens that oracle one click
              later: prefilled means new, blank means existing. So both arms
              write the address, and `signup-a11y.test.tsx` asserts the write
              on all three response shapes rather than only that the rendered
              text matches. An already-confirmed person meets the code form's
              own refusal, which is the same answer they would get by typing
              the URL. */}
          <Link
            href="/auth/confirm"
            className={cn(buttonVariants(), "w-full")}
          >
            {t("checkEmailEnterCode")}
          </Link>
          {/* HONEST ABOUT THE RESEND, because the build refuses one.
              `lib/registration/confirmation-resend.ts`'s production default
              unconditionally answers `unavailable` and no /resend route
              exists in the runtime, so this line points at the recovery path
              that actually works instead of promising a send. Retune it in
              the same change that wires the real resend, never before. */}
          <p className="text-sm text-muted-foreground">{t("checkEmailNoCode")}</p>
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
            {/* THE RULE, BEFORE THE TYPING (PR 541 stage 2). `PASSWORD_MIN_LENGTH`
                and this sentence both come from `lib/auth/password-policy.ts` —
                see its header for why one constant replaced three literals and
                why the number is a measured hosted setting rather than a
                choice. `aria-describedby` binds the hint to the field so a
                screen reader reads the rule with the input, not as loose prose
                somewhere above it. */}
            <p id="signup-password-policy" className="text-xs text-muted-foreground">
              {tAuth("passwordPolicy", { min: PASSWORD_MIN_LENGTH })}
            </p>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              aria-describedby="signup-password-policy"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <StateBanner tone="error">{error}</StateBanner>}

          <Button type="submit" className="w-full" disabled={busy}>
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
