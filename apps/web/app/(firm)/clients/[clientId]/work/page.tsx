import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { AccountingWorkList } from "@/components/work/accounting-work-list";
import { ClientWorkQueue } from "@/components/work/client-work-queue";

/**
 * "/clients/:clientId/work" — the same question as `/work`, scoped to one client (#614, #641).
 *
 * WHY IT EXISTS AT ALL, given the workspace home already shows this queue. The home is a
 * dashboard: the queue sits there as one card among the docs backlog, the bank summary and the
 * close summary, deliberately abbreviated. Work is the destination you go to in order to SETTLE
 * things, and the client level needs the same door as the firm level or "Work" means two different
 * things at two altitudes.
 *
 * IT IS THE SAME LIST COMPONENT AS `/work`, given a client scope (#641). The route's own client id
 * is what scopes the read — a hand-edited `?client=` cannot point this list at another client's
 * books under this client's heading; see `components/work/accounting-work-list.tsx`.
 *
 * THE FILTERS THE JOURNEY ASKS FOR ARE NOW HERE, which is why this page no longer carries a
 * not-built note: visible and clearable filter controls (in a Sheet at narrow widths), server
 * pagination over a keyset cursor, and an Empty state that tells "nothing matches these filters"
 * apart from "this client has no Work yet".
 *
 * The review queue stays BELOW the list: the two answer different questions, and merging them
 * would lose both (that component's own header).
 */
export default async function ClientWorkPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("Work");

  return (
    <PageShell>
      <PageHeader title={t("clientHeading")} description={t("clientBody")} />
      <AccountingWorkList scope={{ kind: "client", clientId }} />
      <ClientWorkQueue clientId={clientId} />
    </PageShell>
  );
}
