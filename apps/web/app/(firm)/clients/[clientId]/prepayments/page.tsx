import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { PrepaymentsList } from "@/components/prepayments/prepayments-list";

/**
 * "/clients/:clientId/prepayments" — journeys C8 and C9's list (#653).
 *
 * ITS OWN ROUTE, BESIDE `plans` RATHER THAN INSIDE IT. A prepayment schedule IS an
 * `amortisation_schedule` accounting plan, and the plan surface stays exactly as #640 built it —
 * but what a person comes HERE for is the prepaid asset, the service period its document states
 * and the period-by-period charge, none of which the generic plan surface carries or should learn.
 *
 * NO SERVER READ. The schedules and the attention band are read client-side under the caller's own
 * session, which is what lets the surface keep its last good data through a transient failure and
 * re-read after every governed write (hydrate-never-trust). The CLIENT id's guard is the layout's.
 */
export default async function ClientPrepaymentsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("Prepayments");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <PrepaymentsList clientId={clientId} />
    </PageShell>
  );
}
