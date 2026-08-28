import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { ComplianceRegisterPanel } from "@/components/firm-admin/compliance-register-panel";

/**
 * "/admin/compliance" — the firm-altitude compliance register (port-wave
 * plan §4 T10). Every non-resolved SST-registration watch across the firm,
 * read from `clara.list_review_queue`'s own `compliance` envelope object
 * (lib/firm-admin/compliance.ts's own header). The ack/snooze/resolve acts
 * on a specific watch live on its needs-you row, not here.
 */
export default async function AdminCompliancePage() {
  const t = await getTranslations("FirmAdminCompliance.compliance");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("pageDescription")} />
      <ComplianceRegisterPanel />
    </PageShell>
  );
}
