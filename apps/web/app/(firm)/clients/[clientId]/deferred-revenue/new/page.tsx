import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { DeferredRevenueForm } from "@/components/deferred-revenue/deferred-revenue-form";

/**
 * "/clients/:clientId/deferred-revenue/new" — configure a recognition schedule (#941).
 *
 * `?entry=<id>` PREFILLS THE RECEIPT, so the attention band's "configure the schedule" lands on a
 * form that already knows which posted advance it is about. It is read here and passed down rather
 * than read in the client component, so the URL stays the single source of that state and Back
 * works.
 */
export default async function NewRecognitionSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ entry?: string | string[] }>;
}) {
  const { clientId } = await params;
  const { entry } = await searchParams;
  const entryId = Array.isArray(entry) ? (entry[0] ?? null) : (entry ?? null);
  const t = await getTranslations("DeferredRevenue");

  return (
    <PageShell>
      <PageHeader title={t("createHeading")} description={t("createBody")} />
      <DeferredRevenueForm clientId={clientId} entryId={entryId} />
    </PageShell>
  );
}
