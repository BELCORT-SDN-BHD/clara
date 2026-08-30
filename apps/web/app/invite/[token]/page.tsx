import { getTranslations } from "next-intl/server";

import { InviteAcceptForm } from "@/components/invite-accept-form";

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
 * "/invite/[token]" — the invite-accept flow, and the ONLY account-creation
 * surface in this app (no self-serve signup route exists anywhere;
 * docs/plan/active/frontend-handoff-2026-08-23.md §0.4). Public
 * (proxy.ts allowlists "/invite").
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
 * THE ONE LINE THE PENDING RULING REPOINTS (P4-1 rung-0 scope note).
 *
 * This journey needs TWO independent secrets. The PATH SEGMENT is Supabase's
 * `token_hash`, consumed by `verifyOtp` — unchanged from P2. `accept_invite`
 * needs a DIFFERENT one: CLARA's own invite token, minted by
 * `clara.invite_member` (`0147:404`) and matched by `sha256()` against
 * `firm_invites.token_hash` (`0145:702`). Feeding the path segment to the door
 * would refuse `CLR10 "invalid invite token"` every time — the two secrets
 * are not interchangeable.
 *
 * Nothing in the P4 design corpus or the four mohe-grill ruling ledgers says
 * how both travel in one URL, and the courier that will hold Clara's plaintext
 * token is P4-4's. So this constant is the provisional seam, chosen because it
 * is the one shape that leaves the path segment and every P2 wall
 * byte-untouched. When the ruling lands, this name (and P4-4's link builder)
 * is what changes — not the form, which takes the token as a plain prop.
 *
 * The document already carries `referrer: "no-referrer"` below, so this half
 * of the link leaks no further than the path half it sits beside.
 */
const CLARA_INVITE_TOKEN_PARAM = "ct";

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
  const raw = query[CLARA_INVITE_TOKEN_PARAM];
  const inviteToken = typeof raw === "string" && raw !== "" ? raw : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-shell p-6">
      <div className="w-full max-w-sm">
        <InviteAcceptForm token={token} inviteToken={inviteToken} />
      </div>
    </main>
  );
}
