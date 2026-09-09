import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsNav } from "@/components/settings/settings-nav";
import { VendorBindingsPanel } from "@/components/firm-admin/vendor-bindings-panel";

/**
 * "/settings/vendor-bindings" — the propose/sign/revoke vendor identity binding
 * governance panel (port-wave plan §4 T10). Moved from "/admin/vendor-bindings"
 * by #614; the old path redirects here.
 *
 * MARKED LEGACY IN THE REGISTRY (`lib/navigation/tree.ts`), and the badge in the
 * settings hub and the settings nav is that mark made visible. Every one of the
 * five doors behind it is CLIENT-scoped (lib/firm-admin/vendor-bindings.ts's own
 * header), so a firm-wide settings section is the wrong home for it — it carries
 * a client picker precisely because the DB offers no firm-wide listing. It stays
 * here until the client-scoped home exists; the panel's own banner says so to the
 * reader.
 */
export default async function SettingsVendorBindingsPage() {
  const t = await getTranslations("FirmAdminCompliance.vendorBindings");

  return (
    <PageShell>
      <PageHeader title={t("pageHeading")} description={t("pageDescription")} />
      <SettingsNav />
      <VendorBindingsPanel />
    </PageShell>
  );
}
