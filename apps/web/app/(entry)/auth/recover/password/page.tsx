import { getTranslations } from "next-intl/server";

import { renderPasswordResetRoute } from "@/components/entry/password-reset-route";

export async function generateMetadata() {
  const t = await getTranslations("PasswordReset");
  return { title: t("title") };
}

export default async function RecoveryPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // #622 review round — `handler.ts` forwards the validated-elsewhere return
  // target as THIS page's own `?next=` on a successful code exchange (an
  // internal, server-constructed redirect, never the Supabase-facing
  // `redirectTo`). Read here and passed straight through, RAW: the actual
  // wall is `password-reset-form.tsx`'s `resolveSameOriginPath` read, not
  // this hop.
  const { next } = await searchParams;
  return renderPasswordResetRoute(undefined, next ?? null);
}
