import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { AccrualDetail } from "@/components/accruals/accrual-detail";

/**
 * "/clients/:clientId/accruals/:accrualId" — one accrual's durable detail (#652).
 *
 * A STABLE ADDRESS IS THE POINT, not a convenience — the same reasoning
 * `/clients/:clientId/plans/:planId` states: the list links to it, the plan links back, an
 * occurrence row links to its Work and its posted entry, and all of it is this one URL. Browser
 * Back works, and a reload lands on the same accrual.
 *
 * NO SERVER READ. The accrual and its whole lineage are read client-side under the caller's own
 * session, so the surface keeps its own loading/failed state. The malformed-id guard therefore
 * lives with the read (lib/accruals/api.ts) and in the component, not here; the CLIENT id's guard
 * is the layout's.
 */
export default async function ClientAccrualDetailPage({
  params,
}: {
  params: Promise<{ clientId: string; accrualId: string }>;
}) {
  const { clientId, accrualId } = await params;
  const t = await getTranslations("Accruals");

  return (
    <PageShell>
      <PageHeader title={t("detailHeading")} description={t("detailBody")} />
      <AccrualDetail clientId={clientId} accrualId={accrualId} />
    </PageShell>
  );
}
