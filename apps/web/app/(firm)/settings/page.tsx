import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsHub } from "@/components/settings/settings-hub";

/**
 * "/settings" — the firm's settings hub (#614; formerly "/admin", which now
 * redirects here — see lib/navigation/legacy-routes.ts).
 *
 * Cards are shaped from the caller context the parent layout already read. A
 * typed URL still meets the destination's own RLS policy or governed door; this
 * page grants nothing.
 *
 * THE TITLE IS A PLAIN STRING AGAIN. Under /admin it came from a client
 * component so it could say "Firm" to a caller who could not administer anything
 * (E-7 / CB-AE2E-014, 裁-187). "Settings" is true at every rank, so the rank-aware
 * title machinery retired with the word that needed it.
 */
export default async function SettingsPage() {
  const t = await getTranslations("Settings");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <SettingsHub />
    </PageShell>
  );
}
