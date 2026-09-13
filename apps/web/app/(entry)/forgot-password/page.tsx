import { getTranslations } from "next-intl/server";

import { RouteErrorProbe } from "@/components/e2e/route-error-probe";
import { PasswordRecoveryForm, type RecoveryLinkFailure } from "@/components/entry/password-recovery-form";

export async function generateMetadata() {
  const t = await getTranslations("PasswordRecovery");
  return { title: t("title") };
}

/**
 * #622 — `/auth/recover/handler.ts` classifies a failed PKCE code exchange
 * into one of four statuses (`expired` / `used_or_unknown` / `refused` /
 * `rate_limited`), never `invalid` any more for a code it actually tried to
 * exchange. `invalid` is kept as its own arm below — the missing-`code`-
 * param case and any status this build does not recognise both still land
 * there, unchanged from before this train.
 */
const LINK_FAILURE_STATUSES: ReadonlySet<string> = new Set([
  "expired",
  "used_or_unknown",
  "refused",
  "rate_limited",
]);

function linkFailureFor(status: string | undefined): RecoveryLinkFailure | undefined {
  return status !== undefined && LINK_FAILURE_STATUSES.has(status)
    ? (status as RecoveryLinkFailure)
    : undefined;
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <>
      <RouteErrorProbe trigger={status === "trigger-error"} />
      <PasswordRecoveryForm invalidLink={status === "invalid"} linkFailure={linkFailureFor(status)} />
    </>
  );
}
