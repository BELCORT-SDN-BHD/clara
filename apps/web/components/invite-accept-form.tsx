"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { cn } from "@/lib/utils";

import {
  readInviteVerification,
  type InviteVerificationFailure,
  type VerifyOtpLikeResponse,
} from "@/lib/invite-verification";
import { createClient } from "@/lib/supabase/client";
import {
  acceptInvite,
  readCallerContextForSubject,
  INVITE_CLARA_TOKEN_PARAM,
  type CallerContextOutcome,
  type CallerContextRow,
} from "@/lib/identity/doors";
import {
  readInvitePreview,
  INVITE_PREVIEW_ROLES,
  INVITE_PREVIEW_NON_BLOCKING_STATUSES,
  type InvitePreviewOutcome,
  type InvitePreviewRole,
  type InvitePreviewRow,
} from "@/lib/firm/invite-preview";
import { isDoorRefusal } from "@/lib/doors";
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

type Stage =
  | "confirm"
  | "verifying"
  /** #625 — `clara.preview_invite` is in flight. Deliberately its own stage rather than a flag on
   *  `set-password`: the password fields must NOT exist while the answer is still unknown, which
   *  is the whole ordering claim AC2's second half rests on. */
  | "previewing"
  /** #625 — a DEFINITE negative from the preview: a revoked, expired or already-accepted
   *  invitation, or the door's own single refusal. No password form is offered, because there is
   *  nothing left to accept. */
  | "blocked"
  | "set-password"
  | "saving"
  /** #625 D1 — the membership is minted AND positively read back. The firm and the role are
   *  stated, and the person leaves by their own explicit act rather than being thrown at `/`. */
  | "joined"
  | "unconfirmed"
  | "error";

/**
 * #625 — THE FOUR NEXT ACTIONS, and the FIVE typed reasons that reach them.
 *
 * `lib/invite-verification.ts` has computed five `InviteVerificationFailure` members since the
 * security review that created it; this surface read only `.ok` and wrote ONE sentence
 * (`Invite.errorDescription`) for all five. The mapping below is the repair, and it is
 * deliberately four faces rather than five:
 *
 *   rejected         → P1  the provider said no. A USED link and an EXPIRED link are
 *                          indistinguishable at this point — GoTrue answers `otp_expired` for
 *                          both — so P1 says so rather than guessing, and carries the provider's
 *                          own sentence verbatim.
 *   no-session       → P2  verified NOBODY: the `email_change` shape this module's header
 *                          documents. Next action: sign out, reopen the link.
 *   no-user          → P3  a partial success from the provider. Retry once, then ask for a new
 *   no-access-token  → P3  invitation. These two share a face ONLY because the invitee's next
 *                          action is identical; each still renders its OWN reason token, so a
 *                          cell (and a support conversation) can still tell them apart.
 *   subject-mismatch → P4  the link belongs to a different sign-in. Sign out fully first.
 *
 * `active-subject-mismatch` is the SAME next action discovered one step later — the ambient
 * session's signature-verified subject is not the one this invite established — so it maps to P4
 * too, and keeps its own distinguishing reason token.
 */
type FailureFace = "P1" | "P2" | "P3" | "P4";

const FACE_FOR_REASON: Record<InviteVerificationFailure, FailureFace> = {
  "rejected": "P1",
  "no-session": "P2",
  "no-user": "P3",
  "no-access-token": "P3",
  "subject-mismatch": "P4",
};

type Failure = {
  face: FailureFace;
  /** The typed discriminant, rendered as a diagnostic token. NOT a next action — two reasons
   *  share P3 — and never parsed by anything. */
  reason: InviteVerificationFailure | "active-subject-mismatch";
  /** The provider's OWN sentence, on P1 only. Never re-worded, and never shown as Clara's. */
  providerMessage: string | null;
};

/** Is this role one of the four `clara.firm_memberships.role` admits? A role outside the ladder
 *  is rendered as its raw value rather than looked up — an unknown key would throw at runtime,
 *  and inventing a label for a role this app cannot rank would be worse than showing the word
 *  the database actually holds. */
function knownRole(role: string): InvitePreviewRole | null {
  return (INVITE_PREVIEW_ROLES as readonly string[]).includes(role) ? (role as InvitePreviewRole) : null;
}

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
 * #625 — THE THREE DEAD-INVITATION FACES. A revoked, an expired and an already-accepted
 * invitation each say what happened, name the firm it was for, and give the ONE next action that
 * is actually available. None of them offers a password form: there is nothing left to accept,
 * and a control that can only refuse is not an affordance (E-7 / 裁-187, one journey over).
 *
 * THERE IS NO RESEND, AND THE EXPIRED FACE SAYS SO IN WORDS. `clara.invite_member` refuses a
 * second pending invite for the same address (CLR10, `0147:399`) and the plaintext token is never
 * stored, so it cannot be re-sent — revoke, then invite again, is the real path and the copy
 * names it rather than implying a button that does not exist.
 */
const BLOCKED_TITLE_KEY = {
  expired: "expiredTitle",
  revoked: "revokedTitle",
  accepted: "acceptedTitle",
} as const;
const BLOCKED_BODY_KEY = {
  expired: "expiredDescription",
  revoked: "revokedDescription",
  accepted: "acceptedDescription",
} as const;

function BlockedInvitationFace({
  firm,
  status,
}: {
  firm: string;
  // #872 — `issuer_lapsed` is also excluded: it is a NON-BLOCKING status (see
  // `INVITE_PREVIEW_NON_BLOCKING_STATUSES`), so this face is never reached for it.
  status: Exclude<InvitePreviewRow["status"], "pending" | "issuer_lapsed">;
}) {
  const t = useTranslations("Invite.preview");
  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t(BLOCKED_TITLE_KEY[status])}</h1>
        <CardDescription>{t(BLOCKED_BODY_KEY[status], { firm })}</CardDescription>
      </CardHeader>
      {/* ONLY the already-accepted face has an in-product next step: the person HAS an account,
          so signing in is a real destination. An expired or revoked invitation has no account
          behind it, and a sign-in link there would be a dead end wearing a button. */}
      {status === "accepted" ? (
        <CardContent>
          <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            {t("signIn")}
          </Link>
        </CardContent>
      ) : null}
    </Card>
  );
}

/**
 * #625 — THE NO-ORACLE FACE. ONE face for the door's ONE refusal.
 *
 * `clara.preview_invite` answers an unknown token, a real token belonging to a different address
 * and a session with no verified address with the SAME code, message and detail — deliberately,
 * because telling them apart would let a token holder learn that a secret is live, or let a
 * signed-in stranger enumerate which addresses have invitations outstanding (0141 §B). So this
 * copy names NEITHER possibility. It is the one place on this journey where saying less is the
 * accurate thing to say, and the copy says why rather than sounding evasive.
 */
function NoOracleFace() {
  const t = useTranslations("Invite.preview");
  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t("mismatchTitle")}</h1>
        <CardDescription>{t("mismatchDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          {t("signIn")}
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * #625 — P1…P4. Five typed verification reasons, four next actions; see FACE_FOR_REASON above
 * for which reason lands where and why `no-user` and `no-access-token` share one.
 *
 * EVERY FACE RENDERS ITS OWN REASON TOKEN. It is a diagnostic, not a next action: the two
 * reasons that share P3 are indistinguishable to the invitee (their next step is identical) and
 * must stay distinguishable to anyone reading over their shoulder.
 */
const FAILURE_TITLE_KEY = {
  P1: "rejectedTitle",
  P2: "noSessionTitle",
  P3: "partialTitle",
  P4: "subjectTitle",
} as const;
const FAILURE_BODY_KEY = {
  P1: "rejectedDescription",
  P2: "noSessionDescription",
  P3: "partialDescription",
  P4: "subjectDescription",
} as const;

function VerificationFailureFace({ failure }: { failure: Failure }) {
  const t = useTranslations("Invite.failure");
  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t(FAILURE_TITLE_KEY[failure.face])}</h1>
        <CardDescription>{t(FAILURE_BODY_KEY[failure.face])}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* THE PROVIDER'S OWN SENTENCE, on P1 only and labelled as theirs. It is the one branch
            where an upstream string is the honest answer, because the provider is what refused —
            everywhere else this app renders its own words or the database's, never a vendor's. */}
        {failure.providerMessage ? (
          <StateBanner tone="error" title={t("providerLabel")}>{failure.providerMessage}</StateBanner>
        ) : null}
        {/* The one in-product next step the two sign-out faces share. P1 and P3 have none: their
            next action is to ask for a fresh invitation, which is not a route. */}
        {failure.face === "P2" || failure.face === "P4" ? (
          <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            {t("signIn")}
          </Link>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("reasonLabel", { reason: failure.reason })}</p>
      </CardContent>
    </Card>
  );
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
 *     sign in with afterwards (`app/(entry)/login/page.tsx`).
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
  const tPreview = useTranslations("Invite.preview");
  const tJoined = useTranslations("Invite.joined");
  /** The role LABELS, borrowed from the roster's own namespace rather than duplicated here.
   *  Two spellings of "Bookkeeper" in one messages file is a second vocabulary for one fact. */
  const tRoles = useTranslations("Members.roles");
  /** The shared password-policy sentence — see `lib/auth/password-policy.ts`. */
  const tAuth = useTranslations("Auth");
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  // The subject verifyOtp positively proved. Everything after verification is
  // bound to THIS id, not to whatever session the browser happens to hold.
  const [verifiedSubject, setVerifiedSubject] = useState<string | null>(null);
  /** #625 — what `clara.preview_invite` answered, kept in its TYPED form rather than flattened,
   *  because the three shapes drive three different renderings and collapsing them here would
   *  delete the distinction before the render that cares ever sees it. */
  const [preview, setPreview] = useState<InvitePreviewOutcome | null>(null);
  /** #625 — the typed verification failure, replacing one collapsed sentence for five reasons. */
  const [failure, setFailure] = useState<Failure | null>(null);
  /** #625 D1 — the `caller_context` row that PROVED the membership. Already read by
   *  `confirmMembership` below; it used to be discarded on the way to `router.replace("/")`. */
  const [joined, setJoined] = useState<CallerContextRow | null>(null);

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
      // ONE OF FIVE, mapped to one of four next actions — see FACE_FOR_REASON's own comment.
      // The provider's sentence rides P1 only: it is the one branch where an upstream string is
      // the honest answer, because the provider is what refused.
      setFailure({
        face: FACE_FOR_REASON[verification.reason],
        reason: verification.reason,
        providerMessage: verification.reason === "rejected" ? (response.error?.message ?? null) : null,
      });
      setStage("error");
      return;
    }

    setVerifiedSubject(verification.subject);

    // #625 — THE PREVIEW STEP, AND WHY IT IS EXACTLY HERE. A session now exists for a PROVEN
    // subject, which is the first moment `clara.preview_invite`'s JWT-email wall can pass; and
    // the password fields have not rendered, which is the last moment the answer can still change
    // what this person is asked to do. `set-password` is reached only from the `pending` branch.
    setStage("previewing");
    const outcome = await readInvitePreview(inviteToken ?? "");
    setPreview(outcome);

    // A DEFINITE NEGATIVE BLOCKS; AN INDEFINITE READ DEGRADES. The door stays the authority:
    // `clara.accept_invite` re-checks every one of these facts inside its own transaction, so a
    // read that never came back is not a verdict and must not become one here. This is the same
    // reading `confirmMembership` already applies to the membership post-condition, in the other
    // direction — absence is not evidence either way.
    if (
      outcome.ok
        ? !(INVITE_PREVIEW_NON_BLOCKING_STATUSES as readonly string[]).includes(outcome.preview.status)
        : outcome.kind === "refused"
    ) {
      setStage("blocked");
      return;
    }
    setStage("set-password");
  }

  /** #625 D1 — the ONE navigation this surface performs, and a person performs it.
   *
   *  `replace()`, not `push()`: the current history entry is the invite URL, and even with the
   *  `ct` parameter already scrubbed there is nothing there worth a Back button. */
  function enterWorkspace(): void {
    router.replace("/");
    router.refresh();
  }

  /** The membership post-condition. Reads `clara.caller_context` — self-scoped
   *  by `jwt_sub()`, so it reports the freshly-minted membership on the SAME
   *  access token the invitee arrived with. Settles on the JOINED stage only on a positive read;
   *  every other outcome (zero rows, a failed read) takes the fail-closed
   *  branch and stays on this page, because absence is not evidence.
   *
   *  #625 D1 CHANGED WHAT "POSITIVE" LEADS TO, NOT WHAT COUNTS AS POSITIVE. This function used
   *  to end in `router.replace("/")`, throwing away the firm name and role it had just read; it
   *  now KEEPS that row and renders it, and the person leaves by their own explicit act. Every
   *  fail-closed branch below is byte-unchanged. */
  async function confirmMembership(): Promise<void> {
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

    // THE SETTLED POSITIVE. Not a redirect: the row that PROVED the membership is what the
    // joined stage renders, so "the accepted role and scope are visible before entering the
    // workspace" is a fact on the screen rather than a claim about a page the person has not
    // reached yet.
    setJoined(outcome.context);
    setStage("joined");
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
      // #625 — the SAME next action as P4 (sign out fully, then reopen the link), discovered one
      // step later. It keeps its own reason token so the two are distinguishable in a support
      // conversation without inventing a fifth face for one next action.
      setFailure({ face: "P4", reason: "active-subject-mismatch", providerMessage: null });
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

    await confirmMembership();
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
          <h1 className="text-base font-semibold">{t("linkIncompleteTitle")}</h1>
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
          <h1 className="text-base font-semibold">{t("confirmTitle")}</h1>
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
          <h1 className="text-base font-semibold">{t("verifyingTitle")}</h1>
          <CardDescription>{t("verifyingDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // #625 — the preview read is out. Its OWN stage, because the password fields must not exist
  // while the answer is unknown: a person who is shown a password form has already been told,
  // implicitly, that there is something here to accept.
  if (stage === "previewing") {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{tPreview("checkingTitle")}</h1>
          <CardDescription>{tPreview("checkingDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // #625 — A DEFINITE NEGATIVE. Four faces, four next actions, and NO password form on any of
  // them: there is nothing left to accept, so offering the fields would be offering a control
  // that can only refuse (E-7 / 裁-187's reading, one journey over).
  if (stage === "blocked") {
    if (
      preview?.ok
      && !(INVITE_PREVIEW_NON_BLOCKING_STATUSES as readonly string[]).includes(preview.preview.status)
    ) {
      return (
        <BlockedInvitationFace
          firm={preview.preview.firm_name}
          status={preview.preview.status as Exclude<InvitePreviewRow["status"], "pending" | "issuer_lapsed">}
        />
      );
    }
    return <NoOracleFace />;
  }

  if (stage === "error") {
    // `failure` is set on every path that reaches this stage. The fallback is not a second
    // vocabulary: it renders P1 — "the provider said no, and a used link and an expired one are
    // indistinguishable here" — which is the honest reading of an unclassified failure, and it
    // carries whatever sentence we do hold rather than inventing one.
    return (
      <VerificationFailureFace
        failure={failure ?? { face: "P1", reason: "rejected", providerMessage: errorMessage }}
      />
    );
  }

  // #625 D1 — THE SETTLED POSITIVE. The membership is minted AND positively read back, and the
  // row that proved it is rendered rather than discarded: which firm was joined, and at which
  // role. Nothing navigates on its own.
  if (stage === "joined" && joined) {
    const role = knownRole(joined.role);
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{tJoined("title", { firm: joined.firm_name })}</h1>
          <CardDescription>{tJoined("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{tJoined("roleLabel")}</dt>
            <dd className="font-medium text-foreground">{role ? tRoles(role) : joined.role}</dd>
          </dl>
          <Button type="button" className="w-full" onClick={enterWorkspace}>
            {tJoined("enter")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // The door SUCCEEDED — the membership and the `clara.users` row are
  // committed and the invite is consumed — but the read that proves it did not
  // come back positive. Never a success redirect on a derived state: this says
  // exactly what is known, and offers the one honest recovery, which re-reads
  // and NEVER re-calls the door.
  // `stage === "joined" && !joined` is unreachable by construction (`confirmMembership` sets the
  // row and the stage in one batch), but a settled acceptance must never fall through to a
  // password form for something that already happened — so it takes the honest recovery this
  // face already offers, which RE-READS and never re-calls the door.
  if (stage === "unconfirmed" || (stage === "joined" && !joined)) {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("unconfirmedTitle")}</h1>
          <CardDescription>{t("unconfirmedDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            className="w-full"
            onClick={() => void confirmMembership()}
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
        <h1 className="text-base font-semibold">{t("setPasswordTitle")}</h1>
        <CardDescription>{t("setPasswordDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* #625 — THE PREVIEW BLOCK, ABOVE THE FIELDS AND OUTSIDE THE FORM. It answers the
            question AC2 asks ("which firm, and at which role?") at the last moment before the
            person commits anything. It is a statement of what the invitation SAYS, never an
            authority: `clara.accept_invite` re-checks every one of these facts inside its own
            transaction, which is why an INDEFINITE read degrades to one honest line rather than
            blocking a journey the door is still perfectly able to complete. */}
        {preview?.ok && (INVITE_PREVIEW_NON_BLOCKING_STATUSES as readonly string[]).includes(preview.preview.status) ? (
          <section
            aria-labelledby="invite-preview-heading"
            className="rounded-lg border border-border bg-muted/40 p-4"
          >
            <h2 id="invite-preview-heading" className="text-sm font-semibold">
              {tPreview("heading")}
            </h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{tPreview("firmLabel")}</dt>
              <dd className="font-medium text-foreground">{preview.preview.firm_name}</dd>
              <dt className="text-muted-foreground">{tPreview("roleLabel")}</dt>
              <dd className="font-medium text-foreground">
                {knownRole(preview.preview.role) ? tRoles(preview.preview.role as InvitePreviewRole) : preview.preview.role}
              </dd>
              {/* A HINT, never an address: the door masks it (0224 §A) and this renders what it
                  sent. Nothing here reconstructs an address, and the form still has no email
                  field — the door reads that from the verified JWT claim. */}
              <dt className="text-muted-foreground">{tPreview("emailLabel")}</dt>
              <dd className="font-medium text-foreground">{preview.preview.masked_email}</dd>
            </dl>
            <p className="mt-3 max-w-prose text-xs text-muted-foreground">{tPreview("roleNote")}</p>
            {/* #872 — a NOTICE, never a block: the owner ruling is explicit that acceptance stays
                open in this state, so the ONLY difference from `pending` is this one line.
                WHAT THAT LINE MAY AND MAY NOT SAY (fix round 2026-09-20, adversarial ADV-L10-02):
                it must not promise that accepting is unaffected. `issuer_lapsed` is true when the
                issuer's rank is below admin; `clara.accept_invite` refuses CLR04 when the invited
                role outranks the issuer's CURRENT rank, and for a REMOVED issuer that is every
                role there is (coalesce(NULL,-1) = -1 < role_rank('viewer') = 0). The two overlap,
                and `clara.preview_invite` returns no issuer rank, so this surface cannot tell the
                acceptable case from the refused one. It therefore claims nothing and says the
                firm re-checks at the end — the same register `indefiniteNote` uses for the other
                question this surface cannot decide. Pinned by
                `p872.web.issuer_lapsed_removed` in invite-accept-form.test.tsx. */}
            {preview.preview.status === "issuer_lapsed" ? (
              <p className="mt-3 max-w-prose text-xs text-muted-foreground">{tPreview("issuerLapsedNote")}</p>
            ) : null}
          </section>
        ) : preview && !preview.ok && preview.kind === "indefinite" ? (
          <p className="max-w-prose text-xs text-muted-foreground">{tPreview("indefiniteNote")}</p>
        ) : null}
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
            {/* THE RULE, BEFORE THE TYPING (PR 541 stage 2) — the same constant
                and the same sentence the other two password surfaces render.
                See `lib/auth/password-policy.ts` for why this is one site. */}
            <p id="invite-password-policy" className="text-xs text-muted-foreground">
              {tAuth("passwordPolicy", { min: PASSWORD_MIN_LENGTH })}
            </p>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              aria-describedby="invite-password-policy"
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
