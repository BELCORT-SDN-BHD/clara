import { getTranslations } from "next-intl/server";

import { RouteErrorProbe } from "@/components/e2e/route-error-probe";
import { PasswordRecoveryForm } from "@/components/entry/password-recovery-form";
import { parseRecoveryLinkFailure } from "@/lib/auth/recovery-link-status";

export async function generateMetadata() {
  const t = await getTranslations("PasswordRecovery");
  return { title: t("title") };
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
      {/*
       * #622 — `/auth/recover/handler.ts` classifies a failed PKCE code
       * exchange into one of four statuses (`expired` / `used_or_unknown` /
       * `refused` / `rate_limited`), never `invalid` any more for a code it
       * actually tried to exchange. `invalid` stays its own boolean arm
       * below — the missing-`code`-param case and any status this build
       * does not recognise both still land there, unchanged from before
       * this train. `parseRecoveryLinkFailure` (#622 review round) is the
       * ONE shared guard, imported rather than re-declared here, so this
       * page's allowlist and the WRITER's (`handler.ts`) vocabulary cannot
       * drift apart — `tests/recovery-link-status.test.ts` pins the tie.
       */}
      <PasswordRecoveryForm
        invalidLink={status === "invalid"}
        linkFailure={parseRecoveryLinkFailure(status) ?? undefined}
      />
    </>
  );
}
