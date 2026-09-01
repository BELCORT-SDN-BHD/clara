import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsPanel } from "@/components/firm-admin/settings-panel";

/**
 * "/admin/settings" — FS-8 PR-2 (裁-97). The owner-only high-stakes
 * threshold control (`clara.set_firm_high_stakes_threshold`, live since
 * migration 0022 §B) plus the honest capabilities note (FS-0 census
 * residual). The DB is the wall: this page renders the control for every
 * viewer regardless of role — see components/firm-admin/threshold-dialog.tsx's
 * own header for the in-repo precedent this follows.
 */
export default async function AdminSettingsPage() {
  const t = await getTranslations("FirmAdminCompliance.settings");

  return (
    <PageShell>
      <PageHeader title={t("pageHeading")} description={t("pageDescription")} />
      <SettingsPanel />
    </PageShell>
  );
}
