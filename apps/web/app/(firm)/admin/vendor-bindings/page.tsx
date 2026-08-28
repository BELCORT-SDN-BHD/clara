import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { VendorBindingsPanel } from "@/components/firm-admin/vendor-bindings-panel";

/**
 * "/admin/vendor-bindings" — the propose/sign/revoke vendor identity binding
 * governance panel (port-wave plan §4 T10, §4's own text: "vendor identity
 * bindings get a propose/sign/revoke governance panel under /admin"). Every
 * one of the five doors is CLIENT-scoped
 * (lib/firm-admin/vendor-bindings.ts's own header), so this page carries a
 * client picker rather than a firm-wide listing the DB does not offer.
 */
export default async function AdminVendorBindingsPage() {
  const t = await getTranslations("FirmAdminCompliance.vendorBindings");

  return (
    <PageShell>
      <PageHeader title={t("pageHeading")} description={t("pageDescription")} />
      <VendorBindingsPanel />
    </PageShell>
  );
}
