import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { PlanDetail } from "@/components/plans/plan-detail";

/**
 * "/clients/:clientId/plans/:planId" — journey C9's durable detail (#640).
 *
 * A STABLE ADDRESS IS THE POINT, not a convenience — the same reasoning
 * `/clients/:clientId/work/:workId` states: an occurrence row links to its Work, a Work's identity
 * block links back to its plan, and both are this one URL. Browser Back works, and a reload lands
 * on the same plan.
 *
 * NO SERVER READ. The plan, its preview and its occurrence history are read client-side under the
 * caller's own session, so each keeps its own loading/failed state and a failed preview never
 * blanks a perfectly readable history. The malformed-id guard therefore lives with the read
 * (lib/plans/api.ts) and in the component, not here; the CLIENT id's guard is the layout's.
 */
export default async function ClientPlanDetailPage({
  params,
}: {
  params: Promise<{ clientId: string; planId: string }>;
}) {
  const { clientId, planId } = await params;
  const t = await getTranslations("Plans");

  return (
    <PageShell>
      <PageHeader title={t("detailHeading")} description={t("detailBody")} />
      <PlanDetail clientId={clientId} planId={planId} />
    </PageShell>
  );
}
