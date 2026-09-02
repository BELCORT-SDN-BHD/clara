import { getTranslations } from "next-intl/server";

import { renderPasswordResetRoute } from "@/components/entry/password-reset-route";

export async function generateMetadata() {
  const t = await getTranslations("PasswordReset");
  return { title: t("title") };
}

export default async function RecoveryPasswordPage() {
  return renderPasswordResetRoute();
}
