import { getTranslations } from "next-intl/server";

import { TradeInvoiceForm } from "@/components/accounting/trade-invoice-form";
import { PageHeader, PageShell } from "@/components/common/page-shell";

/**
 * "/clients/:clientId/accounting/invoices/new" — journeys C1, C3 and C6's direct entry point for a
 * trade invoice: a client sales invoice or a supplier bill, and the signed AR/AP open item it
 * births (#655).
 *
 * IT IS A ROUTE AND NOT A DIALOG, for the reason the journal composer's own page states and which
 * applies here with more force: this form carries a party, two dates, a reference, an exact total,
 * opaque tax facts and an unbounded journal basis, it carries a draft that must survive a reload,
 * and appendix C §4 reserves a Dialog for "one focused bounded form or decision". A stable URL is
 * also what makes the draft recoverable at all — Back from the Work page returns here with the
 * figures intact.
 *
 * IT IS A SIBLING ADDRESS OF `…/accounting/journal/new`, `…/accounting/adjustments/new` AND
 * `…/accounting/claims/new`, NOT A TAB ON ANY OF THEM. The four admit different operations through
 * different doors, and a preparer arrives at one of them with an intent already formed.
 *
 * IT READS NOTHING ON THE SERVER. The client's chart, its live counterparties, the caller's rank and
 * the draft are all client-side concerns, and the one thing this route could have checked here —
 * may this caller record a trade invoice — is checked in three better places already: the form
 * renders the denied state, the runtime refuses the POST, and the database rechecks the author's
 * live role AT ADMISSION and again AT COMMIT.
 *
 * The client id's own shape guard lives in the layout above, so a malformed address is the scoped
 * not-found before this file is reached.
 */
export default async function NewTradeInvoicePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("TradeInvoice");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <TradeInvoiceForm clientId={clientId} />
    </PageShell>
  );
}
