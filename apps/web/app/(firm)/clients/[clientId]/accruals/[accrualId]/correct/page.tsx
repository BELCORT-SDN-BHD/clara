import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { AccrualCorrectionForm } from "@/components/accruals/accrual-correction-form";

/**
 * "/clients/:clientId/accruals/:accrualId/correct" — a NEW accrual-detail row correcting this
 * one (#936).
 *
 * CORRECTING IS NOT EDITING, and the route name says so — the same distinction
 * `/clients/:clientId/plans/:planId/revise` states for its own route. `clara.
 * correct_accrual_adjustment` writes a SUCCESSOR row and advances the plan to a new live
 * revision; the row being corrected is kept, stamped with the one pointer 0222's append-only
 * trigger has ever admitted. A route called `/edit` would promise the opposite.
 */
export default async function CorrectAccrualPage({
  params,
}: {
  params: Promise<{ clientId: string; accrualId: string }>;
}) {
  const { clientId, accrualId } = await params;
  const t = await getTranslations("Accruals");

  return (
    <PageShell>
      <PageHeader title={t("correctHeading")} description={t("correctBody")} />
      <AccrualCorrectionForm clientId={clientId} accrualId={accrualId} />
    </PageShell>
  );
}
