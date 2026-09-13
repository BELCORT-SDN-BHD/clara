import { getTranslations } from "next-intl/server";

import { PeriodicAdjustmentForm } from "@/components/accounting/periodic-adjustment-form";
import { PageHeader, PageShell } from "@/components/common/page-shell";

/**
 * "/clients/:clientId/accounting/adjustments/new" — journeys C8 and C11's direct entry point for a
 * periodic stock adjustment or a supplied payroll/statutory obligation (#643).
 *
 * IT IS A ROUTE AND NOT A DIALOG, for the reason the journal composer's own page states and which
 * applies here with more force: this form is a set of particulars AND the entry they produce, it
 * carries a draft that must survive a reload, and Appendix D reserves a Dialog for "one focused
 * bounded form or decision". A stable URL is also what makes the draft recoverable at all.
 *
 * IT IS A SIBLING ADDRESS OF `…/accounting/journal/new`, NOT A TAB ON IT. The two admit different
 * operations through different doors, and a preparer arrives at one or the other with an intent
 * already formed.
 *
 * IT READS NOTHING ON THE SERVER. The client's chart, the caller's rank and the draft are all
 * client-side concerns, and the one thing this route could have checked here — may this caller
 * record an adjustment — is checked in three better places already: the form renders the denied
 * state, the runtime refuses the POST, and the database rechecks the author's live role AT COMMIT.
 *
 * The client id's own shape guard lives in the layout above, so a malformed address is the scoped
 * not-found before this file is reached.
 */
export default async function NewPeriodicAdjustmentPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("PeriodicAdjustment");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <PeriodicAdjustmentForm clientId={clientId} />
    </PageShell>
  );
}
