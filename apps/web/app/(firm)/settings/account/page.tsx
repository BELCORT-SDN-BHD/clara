import { getTranslations } from "next-intl/server";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { LogoutButton } from "@/components/logout-button";
import { SettingsNav } from "@/components/settings/settings-nav";

/**
 * "/settings/account" — the caller's OWN account, as opposed to the firm's.
 *
 * NEW WITH #614, and deliberately almost empty. The refresh spec puts a real
 * account surface in #626; this page exists now for two reasons that do not
 * depend on it:
 *
 *   1. THE SPLIT HAS TO BE LEGIBLE FROM THE FIRST DAY /settings EXISTS. A
 *      settings hub whose every section is about the FIRM teaches a reader that
 *      "settings" means "firm settings", and #626 then has to un-teach it.
 *   2. SIGN OUT IS AN ACCOUNT ACT AND HAD NO HOME. It has always been a control
 *      in the shell chrome — reasonable, since it is the only way out of the
 *      holding state — but "end my session" is not navigation, and a reader
 *      looking for it under Settings previously found nothing. It is here AND
 *      still in the sidebar footer; one act, two entrances, one implementation
 *      (components/logout-button.tsx's own header on why it is not forked).
 *
 * WHAT IT HONESTLY DOES NOT DO is stated on the page rather than in this comment,
 * through the house `NotBuiltNote` — the dashed edge that means "named, not
 * delivered".
 */
export default async function SettingsAccountPage() {
  const t = await getTranslations("Settings.account");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <SettingsNav />
      <section className="flex flex-col items-start gap-2">
        <SectionHeader level={2}>{t("sessionHeading")}</SectionHeader>
        <LogoutButton variant="outline" align="stretch" />
      </section>
      <NotBuiltNote>{t("notBuilt")}</NotBuiltNote>
    </PageShell>
  );
}
