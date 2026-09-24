import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { DeferredRevenueList } from "@/components/deferred-revenue/deferred-revenue-list";

/**
 * "/clients/:clientId/deferred-revenue" — the revenue side's own list (#941).
 *
 * ITS OWN ROUTE, BESIDE `prepayments` RATHER THAN INSIDE IT. The two lanes are mirror images —
 * the same evaluator, the same cadence, the same monthly Work — but a prepayment is money the
 * client PAID ahead and an advance is money the client RECEIVED ahead, and folding them into one
 * destination would put an asset being released and a liability being earned in the same table
 * with a sign column to tell them apart.
 *
 * NO SERVER READ. The schedules and the attention band are read client-side under the caller's own
 * session, which is what lets the surface keep its last good data through a transient failure and
 * re-read after every governed write (hydrate-never-trust). The CLIENT id's guard is the layout's.
 */
export default async function ClientDeferredRevenuePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("DeferredRevenue");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <DeferredRevenueList clientId={clientId} />
    </PageShell>
  );
}
