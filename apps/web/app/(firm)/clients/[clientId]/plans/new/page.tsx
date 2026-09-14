import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { PlanForm } from "@/components/plans/plan-form";

/**
 * "/clients/:clientId/plans/new" — the create form (#640).
 *
 * A ROUTE RATHER THAN A DIALOG, and appendix C §4 is explicit about why: "a long source comparison
 * or multi-section accounting form uses a full detail destination". A plan carries a purpose, an
 * authority, a schedule and a complete journal basis; putting that in an overlay would make a
 * half-typed schedule one Escape away from gone.
 *
 * THE STATIC SEGMENT WINS OVER THE DYNAMIC ONE. Next.js resolves `plans/new` here rather than to
 * `plans/[planId]`, and the detail route's own uuid guard answers not-found for the literal
 * "new" either way — so neither depends on the other's resolution order to be correct.
 */
export default async function NewPlanPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("Plans");

  return (
    <PageShell>
      <PageHeader title={t("createHeading")} description={t("createBody")} />
      <PlanForm clientId={clientId} />
    </PageShell>
  );
}
