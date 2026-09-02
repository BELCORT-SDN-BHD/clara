import { getTranslations } from "next-intl/server";

import { RouteErrorProbe } from "@/components/e2e/route-error-probe";
import { PasswordRecoveryForm } from "@/components/entry/password-recovery-form";

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
      <PasswordRecoveryForm invalidLink={status === "invalid"} />
    </>
  );
}
