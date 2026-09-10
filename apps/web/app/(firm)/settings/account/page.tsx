import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { AccountSettings } from "@/components/settings/account-settings";
import { SettingsNav } from "@/components/settings/settings-nav";

/**
 * "/settings/account" — the caller's OWN account, as opposed to the firm's.
 *
 * REBUILT BY #626 (refresh spec #612, journey D1). #614 deliberately left
 * this page almost empty — see the git history on this file for that
 * header's reasoning, which still explains why the destination exists at
 * all (the split has to be legible from day one, and sign-out needed a
 * settings home). `<AccountSettings>` (components/settings/account-
 * settings.tsx) is the promised real content: Account, Interface and
 * Notifications, each labelled with its own inventory of what is genuinely
 * persisted and consumed today — that component's own header carries the
 * full accounting.
 *
 * `SettingsNav` is UNCHANGED — the registry it reads
 * (lib/navigation/tree.ts's `SETTINGS_SECTIONS`) stays exactly as #614 left
 * it; this ticket adds fields to the page, not a new registry entry.
 */
export default async function SettingsAccountPage() {
  const t = await getTranslations("Settings.account");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <SettingsNav />
      <AccountSettings />
    </PageShell>
  );
}
