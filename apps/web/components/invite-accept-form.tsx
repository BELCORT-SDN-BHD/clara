"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
  readInviteVerification,
  type VerifyOtpLikeResponse,
} from "@/lib/invite-verification";
import { createClient } from "@/lib/supabase/client";
import {
  acceptInvite,
  readCallerContextForSubject,
  INVITE_CLARA_TOKEN_PARAM,
  type CallerContextOutcome,
} from "@/lib/identity/doors";
import { isDoorRefusal } from "@/lib/doors";
import { Button, buttonVariants } from "@/components/ui/button";
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

type Stage =
  | "confirm"
  | "verifying"
  | "set-password"
  | "saving"
  | "unconfirmed"
  | "error";

/** A governed refusal as this surface renders it: the DB's own CLR code and
 *  its own message, both VERBATIM. `code` is null for an ordinary failure
 *  (transport, no session) — there is no DB verdict to show a chip for. */
type Refusal = { code: string | null; message: string };

/**
 * Takes Clara's invite token OUT of the address bar, once the door has
 * consumed it (ruling 2026-08-30, requirement 3).
 *
 * WHEN, AND WHY EXACTLY THEN. This runs only after `accept_invite` RETURNS
 * SUCCESSFULLY — the point at which the token is spent and worthless. It does
 * NOT run on a refusal, and that is deliberate: a refused invite is still
 * `pending` and still needs its token, so stripping it there would destroy a
 * live credential the person may need in order to reload and try again. The
 * spent-token case is the one worth scrubbing, because the URL outlives the
 * page — in a screenshot, a shared link, a synced history, a Back navigation.
 *
 * `replaceState`, never `pushState`: the goal is that the token-bearing entry
 * stops existing, not that a second entry is stacked on top of it. This is a
 * pure history mutation — it does not re-render, does not re-fetch, and does
 * not disturb the `inviteToken` prop the component is still holding, so a
 * retry after an unconfirmed read still works.
 *
 * SURGICAL: only this one parameter is removed. The path (Supabase's own
 * token) and every unrelated query parameter survive untouched.
 *
 * Guarded on every hop: SSR (no `window`), and any environment without
 * `history.replaceState`. A missing history API must never break an
 * acceptance that already succeeded in the DB.
 */
function stripInviteTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  if (typeof window.history?.replaceState !== "function") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(INVITE_CLARA_TOKEN_PARAM)) return;
  url.searchParams.delete(INVITE_CLARA_TOKEN_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * THE THREE AUTH CALLS THIS SURFACE MAKES, and nothing else — a structural
 * type, so the client can be substituted at the seam without this component
 * ever seeing a different shape.
 *
 * WHY A SEAM EXISTS AT ALL. It mirrors the one `callDoor`/`getRows` already
 * expose ("pass an explicit accessor only for a test" — lib/doors.ts's
 * `CallDoorOptions.session`), and it is a TRANSPORT seam only: every wall on
 * this journey — the hard-coded `type: "invite"`, `readInviteVerification`'s
 * fail-closed reading, the `getClaims()` subject binding, and the door's own
 * refusals — runs identically whichever client is supplied. Nothing here can
 * be injected to make a refused acceptance look accepted.
 *
 * It is needed because the real browser client cannot be constructed under the
 * Node 20 test runner at all: `@supabase/realtime-js` throws at construction
 * without a native `WebSocket` (Node 22+), and its auth timers keep the
 * process alive afterwards. Measured on this branch, not assumed.
 *
 * REVIEW LAW 3 — spelling is not identity. The proof that this interface still
 * describes the REAL client is the default parameter below
 * (`createSupabaseClient = createClient`): `tsc` must accept `typeof
 * createClient` as `() => InviteAuthClient`, so an SDK shape change fails the
 * typecheck instead of silently diverging behind a structurally-typed prop.
 * The proof is the production wiring itself, not a separate assertion that
 * could rot beside it (lib/invite-verification.ts's `SDK_SHAPE_IS_READ` is the
 * same idea, one layer down).
 */
export interface InviteAuthClient {
  auth: {
    verifyOtp(params: {
      token_hash: string;
      type: "invite";
    }): Promise<VerifyOtpLikeResponse>;
    getClaims(): Promise<{
      data?: { claims?: { sub?: string } } | null;
      error?: { message?: string } | null;
    }>;
    updateUser(attributes: {
      password: string;
    }): Promise<{ error?: { message: string } | null }>;
  };
}

/**
 * The invite-accept flow (app/(entry)/invite/[token]/page.tsx). THREE governed
 * calls now — two through Supabase Auth's own SDK, then the Clara door that
 * actually mints the person:
 *
 *  1. `verifyOtp({ token_hash, type: "invite" })` — the current official
 *     pattern for consuming a Supabase invite link (verified via context7 +
 *     supabase.com/docs/guides/auth/auth-email-templates, 2026-08-27). This
 *     is what proves the invite is real and establishes the session.
 *
 *     *** COMMENT-ONLY TRUING BY P4-3 — no behaviour, no wall and no refusal
 *     on this journey is touched by that train. This line used to end "— it
 *     is the ONLY admission path into this app; there is no self-serve signup
 *     route anywhere (docs/plan/active/frontend-handoff-2026-08-23.md §0.4)".
 *     The handoff citation stands, unamended; only the conclusion inverts, by
 *     **裁-57** (2026-08-30 evening): beta is a PAID launch and signup IS
 *     self-serve, so `app/(entry)/signup/page.tsx` is a second admission path
 *     for a different person — someone starting their OWN firm, where this
 *     journey admits someone joining a firm that already exists. The sentence
 *     is corrected rather than left standing because it asserts the absence of
 *     a route the same train adds. P4-3's only other contact with this file's
 *     journey is the route MOVE into the (entry) group, which adds no URL
 *     segment and leaves /invite/:token byte-identical. ***
 *  2. `updateUser({ password })` — once verification has produced a session
 *     for a PROVEN subject, the invited person sets the password they will
 *     sign in with afterwards (app/login).
 *  3. `clara.accept_invite(p_token, p_display_name, p_op_key)` — ADDED BY
 *     P4-1. See below: without it the whole journey completes nothing.
 *
 * THREE SECURITY PROPERTIES, all from the cross-model review 2026-08-27, all
 * still exactly as P2 built them — this train inserts a step, it does not
 * touch a wall:
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
 * ===========================================================================
 * P4-1 — THE REPAIR, AND WHY IT WAS A BETA BLOCKER
 * ===========================================================================
 * Before this train this component contained no `callDoor` call and never
 * named `accept_invite`. But `clara.accept_invite` (live body `0145:694`) is
 * the ONLY caller of `_claim_identity_core` and `_add_member_core` — the only
 * path in the estate that mints a `clara.users` row and a `firm_memberships`
 * row for a real person. So an invitee verified the OTP, set a password, saw a
 * success redirect, and landed on `/` with a valid Supabase session, NO user
 * row, NO membership, and their invite still `pending`. `clara.jwt_firm()`
 * returned NULL, so every RLS-scoped read returned zero rows and every
 * governed write raised CLR04. The UI reported success for a journey that
 * completed nothing.
 *
 * ORDERING IS THE WHOLE POINT. The redirect happens ONLY after the door has
 * returned AND a membership read has positively seen the membership. A success
 * path that runs before the membership exists is the defect this train
 * removes; re-introducing it in an error branch would be the same bug wearing
 * a different hat, so every failure branch below stays on this page.
 *
 * On a refusal the password is NOT rolled back (that part genuinely
 * succeeded), the door is NOT retried by this component, and nothing
 * redirects. The person reads the DB's own sentence and can change something
 * and submit again as a NEW call — `lib/doors.ts`'s standing contract.
 *
 * ===========================================================================
 * TWO TOKENS, AND THE OPEN QUESTION ABOUT HOW THEY TRAVEL — reported to the
 * lead as a rung-0 scope note, NOT worked around here.
 * ===========================================================================
 * This journey needs TWO independent secrets, from two different systems:
 *
 *   `supabaseTokenHash`  the `/invite/[token]` PATH SEGMENT. Supabase's own
 *                        `token_hash`, consumed by `verifyOtp`. Unchanged
 *                        from P2 — the email template points at
 *                        `{{ .SiteURL }}/invite/{{ .TokenHash }}`.
 *   `inviteToken`        CLARA's own invite token: the 64-hex-char secret
 *                        `clara.invite_member` mints at `0147:404` (two
 *                        concatenated `gen_random_uuid()`s), stores as
 *                        `sha256(token)` in `firm_invites.token_hash`, and
 *                        returns to its caller exactly once above
 *                        persistence. `accept_invite` re-computes that
 *                        sha256 over its `p_token` argument (`0145:702`) and
 *                        looks the invite up by it.
 *
 * They are NOT interchangeable: `sha256(<a Supabase token_hash>)` never equals
 * a Clara `firm_invites.token_hash`, so passing the path segment to
 * `accept_invite` would refuse `CLR10 "invalid invite token"` on every single
 * acceptance. Nothing in the P4 design corpus or the four mohe-grill ruling
 * ledgers says how both secrets travel in one URL, and the courier that will
 * hold Clara's plaintext token is P4-4's (its order: the plaintext "goes into
 * the mail body and nowhere else").
 *
 * So this component takes the Clara token as its OWN prop and does not decide
 * the URL shape. `app/(entry)/invite/[token]/page.tsx` sources it through one named
 * constant, which is the single line the ruling repoints. **When it is absent
 * the surface refuses honestly and consumes nothing** — see the guard below:
 * the one outcome that is never acceptable is reporting success for a journey
 * that cannot complete, which is the very defect this train exists to remove.
 */
export function InviteAcceptForm({
  token,
  inviteToken,
  createSupabaseClient = createClient,
}: {
  /** Supabase's `token_hash` from the URL path segment. */
  token: string;
  /** Clara's own invite token. Nullable — see the header's "TWO TOKENS". */
  inviteToken: string | null;
  /** The transport seam. Defaults to the real browser client; see
   *  `InviteAuthClient` for why it is substitutable and what it cannot do. */
  createSupabaseClient?: () => InviteAuthClient;
}) {
  const t = useTranslations("Invite");
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  // The subject verifyOtp positively proved. Everything after verification is
  // bound to THIS id, not to whatever session the browser happens to hold.
  const [verifiedSubject, setVerifiedSubject] = useState<string | null>(null);

  // One op_key per ATTEMPT, keyed by the display name it was minted for.
  // Re-submitting the SAME name after a transport failure replays the door's
  // cached receipt (`_reserve_op`'s dedupe branch) instead of hitting the
  // CLR09 "no longer open (status: accepted)" dead end a fresh key would give
  // someone who is by then already a member. Changing the name mints a fresh
  // key, because the door's request hash binds the display name (`0145:731`)
  // and reusing the key with different args is itself a CLR10.
  const attempt = useRef<{ name: string; opKey: string } | null>(null);
  function opKeyFor(name: string): string {
    if (!attempt.current || attempt.current.name !== name) {
      attempt.current = { name, opKey: crypto.randomUUID() };
    }
    return attempt.current.opKey;
  }

  async function handleAcceptInvite() {
    setStage("verifying");
    setErrorMessage(null);

    const supabase = createSupabaseClient();
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

  /** The membership post-condition. Reads `clara.caller_context` — self-scoped
   *  by `jwt_sub()`, so it reports the freshly-minted membership on the SAME
   *  access token the invitee arrived with. Redirects only on a positive read;
   *  every other outcome (zero rows, a failed read) takes the fail-closed
   *  branch and stays on this page, because absence is not evidence. */
  async function confirmMembershipThenLeave(): Promise<void> {
    // No proven subject means there is nothing to bind a row TO, so no read can
    // be positive. Unreachable from the shipped flow (this stage is only
    // reached through the subject-binding check) — kept because a guard that
    // depends on an upstream invariant for its safety is one refactor away
    // from being wrong, and this branch costs nothing.
    if (!verifiedSubject) {
      setStage("unconfirmed");
      return;
    }

    let outcome: CallerContextOutcome;
    try {
      outcome = await readCallerContextForSubject(verifiedSubject);
    } catch {
      // The read never came back. Different fact from "the DB said no", same
      // fail-closed answer — absence is not evidence.
      setStage("unconfirmed");
      return;
    }

    // no_membership · ambiguous · malformed · wrong_subject — every one denies.
    // A 200 carrying `[{}]`, two rows, or a row for somebody else are exactly
    // the shapes that used to sail through a `rows[0] ?? null` read.
    if (!outcome.ok) {
      setStage("unconfirmed");
      return;
    }

    // replace(), not push(): the current history entry is the token-bearing
    // invite URL, and the token must not survive in the back stack.
    router.replace("/");
    router.refresh();
  }

  async function handleSetPassword(event: React.FormEvent) {
    event.preventDefault();
    setStage("saving");
    setErrorMessage(null);
    setRefusal(null);

    const supabase = createSupabaseClient();

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

    // THE STEP P4-1 ADDS. The password is set; now mint the person. Until this
    // returns, nothing about this journey has happened in Clara's books.
    const name = displayName.trim();
    try {
      await acceptInvite({
        // Non-null by the guard at the top of the render — the surface never
        // reaches this stage without Clara's token.
        token: inviteToken!,
        displayName: name,
        opKey: opKeyFor(name),
      });
    } catch (e) {
      // VERBATIM: the DB's own code and its own sentence, never re-worded and
      // never retried here. A non-refusal failure has no CLR verdict to show.
      //
      // The token is NOT stripped on this path: a refused invite is still
      // `pending` and still needs its token. Nothing here echoes the token
      // either — the rendered text is the DB's message, and no branch of this
      // component ever interpolates `inviteToken` into copy or a log line.
      setRefusal(
        isDoorRefusal(e)
          ? { code: e.code, message: e.message }
          : { code: null, message: e instanceof Error ? e.message : String(e) },
      );
      setStage("set-password");
      return;
    }

    // CONSUMED. Scrub it from the address bar before anything else — before the
    // membership read, so even the branch that keeps the person on this page
    // (unconfirmed) is left holding a URL with no live secret in it.
    stripInviteTokenFromUrl();

    await confirmMembershipThenLeave();
  }

  // FAIL-CLOSED, BEFORE THE CLICK GATE. Without Clara's token this journey
  // provably cannot complete, so the surface says so and consumes nothing —
  // it does not burn the single-use Supabase OTP on a dead end, and it never
  // reports success.
  //
  // TWO CAUSES REACH THIS SCREEN, and the copy must be true under BOTH — the
  // reason it no longer claims "this link has not been used up":
  //   (a) a genuinely malformed link (`ct` absent from the mail), where the
  //       invite IS still pending and a fresh link is the answer; and
  //   (b) an invitee who ALREADY ACCEPTED, then reloaded after
  //       `stripInviteTokenFromUrl()` removed the spent token from the URL.
  //       They are a member; a fresh invite would refuse them, and telling
  //       them the link is unused is simply false.
  // Only (b) has a real next step inside the product, so the surface offers
  // it: the sign-in route. `<Link>`, not a Button — this is navigation, and
  // it must work as a link (middle-click, copy, keyboard) rather than mimic one.
  if (!inviteToken || inviteToken.trim() === "") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("linkIncompleteTitle")}</CardTitle>
          <CardDescription>{t("linkIncompleteDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            {t("linkIncompleteSignIn")}
          </Link>
        </CardContent>
      </Card>
    );
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
          <StateBanner tone="error">{errorMessage}</StateBanner>
        </CardContent>
      </Card>
    );
  }

  // The door SUCCEEDED — the membership and the `clara.users` row are
  // committed and the invite is consumed — but the read that proves it did not
  // come back positive. Never a success redirect on a derived state: this says
  // exactly what is known, and offers the one honest recovery, which re-reads
  // and NEVER re-calls the door.
  if (stage === "unconfirmed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("unconfirmedTitle")}</CardTitle>
          <CardDescription>{t("unconfirmedDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            className="w-full"
            onClick={() => void confirmMembershipThenLeave()}
          >
            {t("unconfirmedRetry")}
          </Button>
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
          <div className="grid gap-1.5">
            <Label htmlFor="display-name">{t("nameLabel")}</Label>
            {/*
              The display name `accept_invite` records against the new
              `clara.users` row. The EMAIL is deliberately NOT a field here and
              never will be: the door reads it from the verified JWT claim
              (`clara._jwt_email()`) and walls the acceptance on it matching
              the invite's own email. A form-supplied email would let a token
              holder bind an invite to an address they do not control.
            */}
            <Input
              id="display-name"
              type="text"
              autoComplete="name"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
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
          {errorMessage && <StateBanner tone="error">{errorMessage}</StateBanner>}
          {refusal && (
            <StateBanner
              tone="error"
              title={t("refusalTitle")}
              code={refusal.code}
            >
              {refusal.message}
            </StateBanner>
          )}
          <Button type="submit" className="w-full" disabled={isSaving}>
            {isSaving ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
