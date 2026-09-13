import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { PlanReviseForm } from "@/components/plans/plan-revise-form";

/**
 * "/clients/:clientId/plans/:planId/revise" — a NEW revision of one plan (#640).
 *
 * REVISING IS NOT EDITING, and the route name says so. `clara.revise_accounting_plan` supersedes
 * the live revision and writes revision n+1; the predecessor stays readable and every past
 * occurrence keeps naming the revision it RAN under. A route called `/edit` would promise the
 * opposite.
 *
 * THE FORM IS THE SAME COMPONENT the create route uses, pre-filled from the live revision — the
 * two are the same decision made at different times. The purpose, the kind and the authority are
 * frozen on the plan row, so this form renders them read-only rather than offering edits the
 * database would refuse.
 */
export default async function RevisePlanPage({
  params,
}: {
  params: Promise<{ clientId: string; planId: string }>;
}) {
  const { clientId, planId } = await params;
  const t = await getTranslations("Plans");

  return (
    <PageShell>
      <PageHeader title={t("reviseHeading")} description={t("reviseBody")} />
      <PlanReviseForm clientId={clientId} planId={planId} />
    </PageShell>
  );
}
