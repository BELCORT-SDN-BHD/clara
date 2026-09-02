import { getTranslations } from "next-intl/server";

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
  if (process.env.CLARA_E2E_TRIGGER_ROUTE_ERROR === "1" && status === "trigger-error") {
    throw new Error("intentional e2e route-boundary probe");
  }
  return <PasswordRecoveryForm invalidLink={status === "invalid"} />;
}
