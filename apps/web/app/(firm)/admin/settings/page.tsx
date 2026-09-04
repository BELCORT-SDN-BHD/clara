import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsPanel } from "@/components/firm-admin/settings-panel";

/**
 * "/admin/settings" — the firm's authority controls.
 *
 * FS-8 PR-2 (裁-97) built this page around the high-stakes threshold control.
 * **裁-187 retired that control outright** and its dialog
 * (`components/firm-admin/threshold-dialog.tsx`) was deleted with it, so this
 * header no longer points at either; what remains is the approvals note and the
 * honest capabilities note (the FS-0 census residual). `SettingsPanel`'s own
 * header carries the ruling, the live-database facts the copy must stay true to
 * while 裁-188's wall-removal lane is outstanding, and what that lane changes
 * here when it lands.
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
