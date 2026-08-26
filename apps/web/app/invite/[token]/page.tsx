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
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-shell p-6">
      <div className="w-full max-w-sm">
        <InviteAcceptForm token={token} />
      </div>
    </main>
  );
}
