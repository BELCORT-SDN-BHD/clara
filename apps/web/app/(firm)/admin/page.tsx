import { getTranslations } from "next-intl/server";

import { AdminHub } from "@/components/admin/admin-hub";
import { PageHeader, PageShell } from "@/components/common/page-shell";

/**
 * "/admin" — the firm administration hub (P4-6). Cards are shaped from the
 * caller context the parent layout already read. A typed URL still meets the
 * destination's own RLS policy or governed door; this page grants nothing.
 */
export default async function AdminPage() {
  const t = await getTranslations("Admin");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <AdminHub />
    </PageShell>
  );
}
