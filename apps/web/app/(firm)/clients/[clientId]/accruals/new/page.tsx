import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { AccrualForm } from "@/components/accruals/accrual-form";

/**
 * "/clients/:clientId/accruals/new" — the configuration form (#652).
 *
 * A ROUTE RATHER THAN A DIALOG, and appendix C §4 is explicit about why: "a long source comparison
 * or multi-section accounting form uses a full detail destination". An accrual carries a purpose,
 * an authority, two account legs, an amount, a service period, a selection method, an instruction
 * and a schedule; putting that in an overlay would make a half-typed term one Escape away from gone.
 *
 * THE STATIC SEGMENT WINS OVER THE DYNAMIC ONE. Next.js resolves `accruals/new` here rather than to
 * `accruals/[accrualId]`, and the detail route's own uuid guard answers not-found for the literal
 * "new" either way — so neither depends on the other's resolution order to be correct.
 */
export default async function NewAccrualPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("Accruals");

  return (
    <PageShell>
      <PageHeader title={t("createHeading")} description={t("createBody")} />
      <AccrualForm clientId={clientId} />
    </PageShell>
  );
}
