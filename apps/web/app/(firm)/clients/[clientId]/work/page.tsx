import { getTranslations } from "next-intl/server";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { AccountingWorkList } from "@/components/work/accounting-work-list";
import { ClientWorkQueue } from "@/components/work/client-work-queue";

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
 * components/work/client-work-queue.tsx. One rendering of one queue.
 *
 * THE DURABLE WORK RECORDS LAND HERE FIRST. `AccountingWorkList` is this
 * client's `clara.accounting_work` rows — what has been asked of the agent and
 * how it ended — and each row links to its own address. It sits ABOVE the review
 * queue because the two answer different questions: this one is the record of an
 * operation, the queue below is what is waiting on a person. See that component's
 * own header for why they are not merged.
 *
 * STILL HONESTLY PARTIAL, and the note still says so: the FILTERS the journey
 * asks for (a visible, clearable filter set, and an empty-with-filters state
 * distinct from an empty list) are not built here yet.
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
      <AccountingWorkList clientId={clientId} />
      <ClientWorkQueue clientId={clientId} />
      <NotBuiltNote>{t("clientNotBuilt")}</NotBuiltNote>
    </PageShell>
  );
}
