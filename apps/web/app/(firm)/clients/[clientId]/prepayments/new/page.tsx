import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { PrepaymentForm } from "@/components/prepayments/prepayment-form";

/**
 * "/clients/:clientId/prepayments/new" — configure an amortisation (#653).
 *
 * `?entry=<id>` PREFILLS THE RECOGNITION, so the attention band's "configure the schedule" lands
 * on a form that already knows which posted prepayment it is about. It is read here and passed
 * down rather than read in the client component, so the URL stays the single source of that state
 * and Back works.
 */
export default async function NewPrepaymentSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ entry?: string | string[] }>;
}) {
  const { clientId } = await params;
  const { entry } = await searchParams;
  const entryId = Array.isArray(entry) ? (entry[0] ?? null) : (entry ?? null);
  const t = await getTranslations("Prepayments");

  return (
    <PageShell>
      <PageHeader title={t("createHeading")} description={t("createBody")} />
      <PrepaymentForm clientId={clientId} entryId={entryId} />
    </PageShell>
  );
}
