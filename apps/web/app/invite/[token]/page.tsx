import type { EmailOtpType } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import { InviteAcceptForm } from "@/components/invite-accept-form";

export async function generateMetadata() {
  const t = await getTranslations("Invite");
  return { title: t("verifyingTitle") };
}

const KNOWN_OTP_TYPES: readonly EmailOtpType[] = [
  "invite",
  "signup",
  "recovery",
  "email_change",
  "email",
];

function resolveType(value: string | undefined): EmailOtpType {
  if (value && (KNOWN_OTP_TYPES as readonly string[]).includes(value)) {
    return value as EmailOtpType;
  }
  // Supabase's default invite email template links here without a `type`
  // query param in this app's own shape (the token rides in the path,
  // docs/plan/active/frontend-handoff-2026-08-23.md deviation note below) —
  // "invite" is the only admission path this route exists for.
  return "invite";
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
 * get the `/invite/[token]` URL this lane's brief asked for; `?type=` is
 * accepted for forward compatibility with Supabase's other OTP email kinds
 * but defaults to "invite" since that is the only kind this route is wired
 * for.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { token } = await params;
  const { type } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-shell p-6">
      <div className="w-full max-w-sm">
        <InviteAcceptForm token={token} type={resolveType(type)} />
      </div>
    </main>
  );
}
