import type { AuthResponse } from "@supabase/supabase-js";

/**
 * lib/invite-verification.ts — the fail-closed reading of a Supabase
 * `verifyOtp()` result for the invite-accept flow.
 *
 * Extracted from the form component so the judgement can be tested without a
 * browser (cross-model security review 2026-08-27, finding 2, HIGH).
 *
 * THE ATTACK THIS CLOSES. `verifyOtp` returns `AuthResponse`, whose success
 * shape is `{ data: { user: User | null; session: Session | null }, error:
 * null }` — user and session are BOTH nullable ON SUCCESS (read from the
 * pinned @supabase/auth-js 2.112.4 type declarations). Single-confirmation
 * `email_change` verification is the documented case that returns exactly
 * that: no error, no user, no session. The previous code checked only
 * `error`, so it treated "verified nobody" as "invite confirmed" and moved
 * on to `updateUser({ password })` — which operates on whatever session the
 * BROWSER currently holds. An attacker who sent a logged-in administrator a
 * link carrying the attacker's own email_change token therefore got the
 * admin's own password changed to a value the attacker chose.
 *
 * Two independent walls, both required:
 *
 *  1. The OTP purpose is hard-coded `"invite"` at the call site
 *     (components/invite-accept-form.tsx). No caller-supplied `type` reaches
 *     `verifyOtp` — the page no longer reads one at all.
 *  2. This function. A verification counts ONLY if it positively produced a
 *     user, a session, an access token, and a user id that MATCHES the
 *     session's own user id. The verified subject it returns is then the
 *     thing the password continuation is bound to — never the ambient
 *     browser session.
 */

/**
 * The structural minimum this judgement reads. Declared here rather than
 * borrowed wholesale from the SDK so the failure modes can be constructed in
 * a test without fabricating a complete `User`/`Session`; `SDK_SHAPE_IS_READ`
 * below is the compile-time proof that the SDK's own return type still
 * satisfies it.
 */
export interface VerifyOtpLikeResponse {
  data?: {
    user?: { id?: string | null } | null;
    session?: {
      access_token?: string | null;
      user?: { id?: string | null } | null;
    } | null;
  } | null;
  error?: { message?: string } | null;
}

/**
 * Review law 3 — spelling is not identity. This line fails to compile if
 * `@supabase/supabase-js`'s `AuthResponse` stops being readable by the
 * function below (a renamed or re-typed field), instead of silently letting
 * a shape change slip past a structurally-typed parameter.
 */
export const SDK_SHAPE_IS_READ: AuthResponse extends VerifyOtpLikeResponse
  ? true
  : never = true;

export type InviteVerification =
  | { ok: true; subject: string; accessToken: string }
  | { ok: false; reason: InviteVerificationFailure };

export type InviteVerificationFailure =
  /** Supabase itself rejected the token. */
  | "rejected"
  /** No error, but no session was established (the email_change shape). */
  | "no-session"
  /** No error, but no user was returned. */
  | "no-user"
  /** A session without a usable access token. */
  | "no-access-token"
  /** `data.user.id` and `data.session.user.id` disagree. */
  | "subject-mismatch";

/**
 * Fail-closed: every path that is not a positively complete verification
 * returns `ok: false`. `undefined`/malformed input lands on the same branch a
 * rejection does — absence is never evidence of success.
 */
export function readInviteVerification(
  response: VerifyOtpLikeResponse | null | undefined,
): InviteVerification {
  if (!response || response.error) return { ok: false, reason: "rejected" };

  const data = response.data;
  const user = data?.user ?? null;
  const session = data?.session ?? null;

  if (!session) return { ok: false, reason: "no-session" };
  if (!user) return { ok: false, reason: "no-user" };

  const accessToken = session.access_token;
  if (!accessToken) return { ok: false, reason: "no-access-token" };

  const subject = user.id;
  const sessionSubject = session.user?.id;
  if (!subject || !sessionSubject || subject !== sessionSubject) {
    return { ok: false, reason: "subject-mismatch" };
  }

  return { ok: true, subject, accessToken };
}
