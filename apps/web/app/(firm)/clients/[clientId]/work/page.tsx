import { getTranslations } from "next-intl/server";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { ClientWorkQueue } from "@/components/work/client-needs-you";

/**
 * "/clients/:clientId/work" — the same question as `/work`, scoped to one client
 * (#614).
 *
 * WHY IT EXISTS AT ALL, given the workspace home already shows this queue. The
 * home is a dashboard: the queue sits there as one card among the docs backlog,
 * the bank summary and the close summary, deliberately abbreviated. Work is the
 * destination you go to in order to SETTLE things, and the client level needs
 * the same door as the firm level or "Work" means two different things at two
 * altitudes.
 *
 * IT IS THE SAME COMPONENT AS THE HOME'S SECTION C, given its own read — see
 * components/work/client-needs-you.tsx. One rendering of one queue.
 *
 * HONESTLY PARTIAL, and the note says so: the filterable list and the detail
 * view of a single item arrive with the durable Work records (#641).
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
      <ClientWorkQueue clientId={clientId} />
      <NotBuiltNote>{t("clientNotBuilt")}</NotBuiltNote>
    </PageShell>
  );
}
