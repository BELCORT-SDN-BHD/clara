import { getTranslations } from "next-intl/server";

import { PasswordResetForm } from "@/components/entry/password-reset-form";

export async function generateMetadata() {
  const t = await getTranslations("PasswordReset");
  return { title: t("title") };
}

export default function RecoveryPasswordPage() {
  return <PasswordResetForm />;
}
