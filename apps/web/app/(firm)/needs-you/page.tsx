import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { NeedsYouInbox } from "@/components/firm/needs-you-inbox";

/**
 * "/needs-you" — the cross-client Needs-you inbox (owner ruling Q3). Reads
 * clara.list_review_queue at firm altitude (lib/firm/needs-you.ts) — the ONE
 * paginated multi-source queue the DB ships (drafts, uncoded filings, open
 * questions, coding tasks) — plus the two additive read/act surfaces
 * migration 0137 added: firm-level questions and client-identifier promotion
 * proposals (see NeedsYouInbox's own NeedsYouGaps panel,
 * lib/firm/needs-you-gaps.ts).
 */
export default async function NeedsYouPage() {
  const t = await getTranslations("NeedsYou");

  return (
    <PageShell>
      <PageHeader title={t("heading")} />
      <NeedsYouInbox />
    </PageShell>
  );
}
