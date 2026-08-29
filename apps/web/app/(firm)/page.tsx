import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";

/**
 * Firm-altitude home ("/") — still an honest empty state: a title and an
 * orientation line, no summary of its own.
 *
 * TRUED 2026-08-29 (MBB-6). The four firm-altitude surfaces the IA ruling
 * names (docs/plan/active/mohe-grill-rulings-2026-08-27.md Q3) — the
 * Needs-you inbox, the client register, firm activity, admin — are BUILT and
 * each has its own page, reachable from the sidebar (components/firm-nav.tsx)
 * and from ⌘K. What is still absent is a firm-home ROLL-UP over them, which
 * is why this page renders a header and nothing else. The old copy said the
 * surfaces themselves were "built in P3/P4"; P3 shipped 2026-08-27.
 */
export default async function FirmHomePage() {
  const t = await getTranslations("FirmHome");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
    </PageShell>
  );
}
