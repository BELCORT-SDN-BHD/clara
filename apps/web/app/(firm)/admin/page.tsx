import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";

/**
 * "/admin" — users, capabilities, metering rollup (owner ruling Q3; PRD §4
 * item 21). Honest empty state, P2 shell only; the real surface is P4 work.
 * Capabilities are default-on with no per-firm dial (0074:40-43) — this
 * page will surface that state, not build a toggle, when it is built.
 */
export default async function AdminPage() {
  const t = await getTranslations("Admin");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
    </PageShell>
  );
}
