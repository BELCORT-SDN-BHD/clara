import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { DeferredRevenueDetail } from "@/components/deferred-revenue/deferred-revenue-detail";

/**
 * "/clients/:clientId/deferred-revenue/:scheduleId" — one derived recognition's own address (#941).
 *
 * A ROUTE RATHER THAN A SHEET: its allocation, its authority, its period-by-period execution and
 * every refusal is durable detail. Back works, the link from an attention row and the link from
 * the plan are the same URL, and a reload lands on the same schedule.
 */
export default async function RecognitionSchedulePage({
  params,
}: {
  params: Promise<{ clientId: string; scheduleId: string }>;
}) {
  const { clientId, scheduleId } = await params;
  const t = await getTranslations("DeferredRevenue");

  return (
    <PageShell>
      <PageHeader title={t("detailHeading")} description={t("detailBody")} />
      <DeferredRevenueDetail clientId={clientId} scheduleId={scheduleId} />
    </PageShell>
  );
}
