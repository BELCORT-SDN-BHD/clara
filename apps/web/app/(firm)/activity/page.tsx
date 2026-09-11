import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { ActivityFeed } from "@/components/firm/activity/activity-feed";
import { UNWIRED_AGENT_RECEIPT_KINDS } from "@/lib/firm/receipt-kinds";

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
 *
 * COVERAGE HONESTY (review finding 13): the subheading no longer promises "reports" among the
 * kinds this feed shows — `report_agent` is one of `UNWIRED_AGENT_RECEIPT_KINDS`
 * (`lib/firm/receipt-kinds.ts`), a typed-empty stub today, so naming it there would be the exact
 * over-promise CB-AE2E-018 exists to close. The coverage sentence below is DRIVEN by that same
 * roster rather than a hand-typed list, so a future kind getting wired repaints this note for
 * free instead of leaving it to rot the way the retired page's own `FirmActivity.coverageNote`
 * did (it still named "general agent acts" as unwired after `agent_act` was wired, 裁-190).
 */
export default async function FirmActivityPage() {
  const t = await getTranslations("Activity");
  const tReceipt = await getTranslations("FirmActivity");
  const unwiredKinds = UNWIRED_AGENT_RECEIPT_KINDS.map((kind) => tReceipt(`receiptKinds.${kind}`)).join(", ");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("subheading")} />
      <p className="max-w-prose text-xs text-muted-foreground">{t("coverageNote", { kinds: unwiredKinds })}</p>
      <ActivityFeed />
    </PageShell>
  );
}
