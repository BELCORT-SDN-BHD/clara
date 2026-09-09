import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SettingsPanel } from "@/components/firm-admin/settings-panel";

/**
 * "/settings/firm" — the firm's authority controls. Moved from
 * "/admin/settings" by #614; the old path redirects here.
 *
 * THE PATH CHANGED BUT THE SURFACE DID NOT. FS-8 PR-2 (裁-97) built this page
 * around the high-stakes threshold control; **裁-187 retired that control
 * outright** and its dialog was deleted with it. What remains is the approvals
 * note and the honest capabilities note. `SettingsPanel`'s own header carries the
 * ruling, the live-database facts the copy must stay true to while 裁-188's
 * wall-removal lane is outstanding, and what that lane changes here when it lands.
 *
 * THE ROUTE IS NOW "FIRM", NOT "SETTINGS", because it sits UNDER /settings: a
 * path reading `/settings/settings` says nothing about which settings, and this
 * section is specifically the firm-wide ones (the caller's own live at
 * /settings/account).
 */
export default async function SettingsFirmPage() {
  const t = await getTranslations("FirmAdminCompliance.settings");

  return (
    <PageShell>
      <PageHeader title={t("pageHeading")} description={t("pageDescription")} />
      <SettingsNav />
      <SettingsPanel />
    </PageShell>
  );
}
