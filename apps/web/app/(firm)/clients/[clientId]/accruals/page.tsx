import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { AccrualsList } from "@/components/accruals/accruals-list";

/**
 * "/clients/:clientId/accruals" — journey C08.1's list (#652).
 *
 * ITS OWN TOP-LEVEL CLIENT SEGMENT, beside `plans` rather than under `accounting/`. The reason is
 * #643's own, restated: `accounting/adjustments` is the PERIODIC-ADJUSTMENT lane (a stock count, a
 * supplied payroll obligation — no schedule, no future occurrence, one posting), and an accrual is
 * a SCHEDULE that accrues on a due date and reverses on the first of the following month. One
 * prefix for two unrelated lanes makes every later reader guess which one a row belongs to.
 *
 * NO SERVER READ. The accruals are read client-side under the caller's own session, which is what
 * lets the surface keep its last good data through a transient failure and re-read after every
 * governed write (hydrate-never-trust). The CLIENT id's guard is the layout's, above.
 */
export default async function ClientAccrualsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("Accruals");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <AccrualsList clientId={clientId} />
    </PageShell>
  );
}
