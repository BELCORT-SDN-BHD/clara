import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ComplianceRegisterPanel } from "@/components/firm-admin/compliance-register-panel";

/**
 * "/settings/compliance" — the firm-altitude compliance register (port-wave
 * plan §4 T10). Moved from "/admin/compliance" by #614; the old path redirects
 * here.
 *
 * Every non-resolved SST-registration watch across the firm, read from
 * `clara.list_review_queue`'s own `compliance` envelope object
 * (lib/firm-admin/compliance.ts's own header). The ack/snooze/resolve acts on a
 * specific watch live on its Needs-you row, not here.
 */
export default async function SettingsCompliancePage() {
  const t = await getTranslations("FirmAdminCompliance.compliance");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("pageDescription")} />
      <SettingsNav />
      <ComplianceRegisterPanel />
    </PageShell>
  );
}
