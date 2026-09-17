import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { PrepaymentDetail } from "@/components/prepayments/prepayment-detail";

/**
 * "/clients/:clientId/prepayments/:scheduleId" — one derived amortisation's own address (#653).
 *
 * A ROUTE RATHER THAN A SHEET: its allocation, its authority, its period-by-period execution and
 * every refusal is durable detail. Back works, the link from an attention row and the link from
 * the plan are the same URL, and a reload lands on the same schedule.
 */
export default async function PrepaymentSchedulePage({
  params,
}: {
  params: Promise<{ clientId: string; scheduleId: string }>;
}) {
  const { clientId, scheduleId } = await params;
  const t = await getTranslations("Prepayments");

  return (
    <PageShell>
      <PageHeader title={t("detailHeading")} description={t("detailBody")} />
      <PrepaymentDetail clientId={clientId} scheduleId={scheduleId} />
    </PageShell>
  );
}
