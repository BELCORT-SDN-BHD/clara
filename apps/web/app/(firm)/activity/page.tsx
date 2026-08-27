import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { FirmActivityFeed } from "@/components/firm/firm-activity-feed";

/**
 * "/activity" — the firm activity feed: the receipts/open-register inversion
 * made surface (ADR-0074), at firm altitude across every client. Reads
 * clara.agent_receipts_visible (lib/firm/reads.ts) — an AUDIT TRAIL of what
 * happened, never conflated with Needs-you's queue of what awaits.
 */
export default async function FirmActivityPage() {
  const t = await getTranslations("FirmActivity");

  return (
    <PageShell>
      {/* The orientation line moved OUT of FirmActivityFeed and into the page
          header — same `FirmActivity.subheading` key, now in the one place
          every surface puts its "what am I looking at" sentence. */}
      <PageHeader title={t("heading")} description={t("subheading")} />
      <FirmActivityFeed />
    </PageShell>
  );
}
