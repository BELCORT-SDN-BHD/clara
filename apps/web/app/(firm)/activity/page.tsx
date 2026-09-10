import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { ActivityFeed } from "@/components/firm/activity/activity-feed";

/**
 * "/activity" — the attributable firm activity feed (#632, refresh spec #612 journey B5):
 * a filterable feed derived from the domain-event spine, agent act receipts and #623's
 * committed operation receipts (packages/db/migrations/0181_activity_feed.sql), with links to
 * the Work, object, source and replacement outcome behind every row.
 *
 * CB-AE2E-018 IS DISCHARGED HERE. This route used to lead with a `NotBuiltNote` above a flat,
 * unpaginated `agent_receipts_visible`-only list (`components/firm/firm-activity-feed.tsx`,
 * retired in the same change) — the read is connected now, and the note is gone rather than
 * merely relocated. `lib/firm/receipt-kinds.ts`'s pinned roster is reused by the new feed for
 * agent-receipt-kind labels, so the "which kinds actually project a row" census that module
 * carries is still the honest word on that question.
 */
export default async function FirmActivityPage() {
  const t = await getTranslations("Activity");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("subheading")} />
      <ActivityFeed />
    </PageShell>
  );
}
