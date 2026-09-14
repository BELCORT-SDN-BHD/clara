import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PeriodicAdjustmentsTable } from "@/components/accounting/periodic-adjustments-table";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { Button } from "@/components/ui/button";
import { periodicAdjustmentHref } from "@/lib/navigation/tree";

/**
 * "/clients/:clientId/accounting/adjustments" — the RESULT surface for #643: every periodic stock
 * adjustment and supplied payroll obligation this client has recorded, with its exact particulars,
 * its posted entry, its operation receipt and its correction chain.
 *
 * IT IS ITS OWN DESTINATION, NOT `registers?tab=adjustments`. That tab is the 0045 PLAN lane —
 * templates, schedules, occurrences — and a periodic count has no schedule and no template. One
 * address for two unrelated lanes would make every later reader guess which one a row belongs to,
 * the same reason the table behind this page is `clara.periodic_adjustments` rather than
 * `clara.adjustment_*`.
 *
 * THE PRIMARY ACT IS A VISIBLE BUTTON, and it is offered to everyone who can see this page — the
 * form's own denied state is where a viewer meets the floor, so hiding the control here would be a
 * second, quieter answer to the same question. (Appendix D: "the primary action is a visible
 * Button or route link".)
 *
 * The read itself is the client's, under their own RLS, through `clara.list_periodic_adjustments`.
 * This route performs none of it on the server.
 */
export default async function PeriodicAdjustmentsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("PeriodicAdjustment");

  return (
    <PageShell>
      <PageHeader title={t("history.heading")} description={t("history.body")} />
      <div>
        <Button render={<Link href={periodicAdjustmentHref(clientId)} />}>{t("history.newAction")}</Button>
      </div>
      <PeriodicAdjustmentsTable clientId={clientId} />
    </PageShell>
  );
}
