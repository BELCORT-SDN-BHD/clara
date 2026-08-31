import { getTranslations } from "next-intl/server";

import { InviteAcceptForm } from "@/components/invite-accept-form";
import { INVITE_CLARA_TOKEN_PARAM } from "@/lib/identity/doors";

export async function generateMetadata() {
  const t = await getTranslations("Invite");
  return {
    title: t("confirmTitle"),
    // The URL carries a single-use bearer token; keep it out of the Referer
    // header of anything this page links to (review finding 9). The proxy
    // sets the same header on the response — this is the document-level
    // belt to that braces.
    referrer: "no-referrer" as const,
  };
}

/**
 * "/invite/[token]" — the invite-accept flow: how a person joins an EXISTING
 * firm. Public (proxy.ts allowlists "/invite").
 *
 * MOVED into the `(entry)` route group by P4-3. A route group adds no URL
 * segment, so this page still answers on `/invite/:token` — every invite link
 * already sitting in someone's inbox, and the Supabase email template that
 * builds them, are byte-untouched by the move.
 * `tests/firm-scope-surfaces.test.ts` asserts that URL from the tree.
 * The `<main>`, the ground and the card shadow moved up to
 * `app/(entry)/layout.tsx`; nothing about this journey's behaviour changed, and
 * P4-1's own suites still drive it end to end.
 *
 * *** WHAT "ONLY" USED TO SAY HERE, AND WHY IT NO LONGER DOES. This comment read
 * "the ONLY account-creation surface in this app (no self-serve signup route
 * exists anywhere; docs/plan/active/frontend-handoff-2026-08-23.md §0.4)". The
 * handoff citation stands and is unchanged; only its conclusion inverts, by
 * ruling. **裁-57 (2026-08-30 evening)** — beta is a PAID launch, and signup is
 * tier-3 self-serve: sign up, pay through Stripe, start your own firm. "Invite"
 * now means exactly what THIS page does: an RBAC membership invite INTO a firm
 * that already exists. There are two account-creation surfaces now — this one
 * and `app/(entry)/signup/page.tsx` — and they are for two different people. ***
 *
 * `token` is the Supabase `token_hash` from the invite email link. This
 * app's invite email template (owner-configured in the Supabase dashboard,
 * not committed here) must point at `{{ .SiteURL }}/invite/{{ .TokenHash }}`
 * rather than Supabase's own default `/auth/v1/verify?token=...` shape, to
 * get the `/invite/[token]` URL this lane's brief asked for.
 *
 * NO OTP PURPOSE IS READ FROM THE REQUEST (cross-model security review
 * 2026-08-27, finding 2, HIGH). This route used to accept
 * `?type=signup|recovery|email_change|email` "for forward compatibility" and
 * pass it into `verifyOtp`. That let an attacker launder a DIFFERENT OTP
 * purpose through this page: an `email_change` token verifies without error
 * while returning a null user AND null session, so a logged-in
 * administrator's own session survived the "verification" and the form then
 * changed the ADMINISTRATOR's password. The purpose is now a hard-coded
 * literal in components/invite-accept-form.tsx and nothing about it is
 * caller-controlled. A future OTP kind gets its OWN route with its own
 * verification, never a query parameter on this one.
 */
/**
 * THE INVITE LINK CARRIES TWO SECRETS — ruled 2026-08-30, option (a):
 * `/invite/<supabase_token_hash>?ct=<clara_token>`.
 *
 * The PATH SEGMENT is Supabase's `token_hash`, consumed by `verifyOtp` — P2's
 * shipped contract, byte-untouched by the ruling. The QUERY PARAM carries
 * Clara's own invite token, which `clara.accept_invite` sha256's and looks the
 * invite up by (`0145:702`). They are not interchangeable: the path segment
 * fed to the door refuses `CLR10 "invalid invite token"` every time.
 *
 * The param NAME is `INVITE_CLARA_TOKEN_PARAM`, declared once in
 * `lib/identity/doors.ts` and imported at both ends — here (reads it) and
 * P4-4's courier (builds the link) — so neither end can drift by re-typing the
 * string. See that declaration for the courier's plaintext-handling obligation.
 */

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;

  // A repeated parameter arrives as an array. Take NO token rather than
  // guessing which of two a caller meant — the form's own guard then refuses
  // honestly and consumes nothing, which is the fail-closed answer.
  const raw = query[INVITE_CLARA_TOKEN_PARAM];
  const inviteToken = typeof raw === "string" && raw !== "" ? raw : null;

  return <InviteAcceptForm token={token} inviteToken={inviteToken} />;
}
