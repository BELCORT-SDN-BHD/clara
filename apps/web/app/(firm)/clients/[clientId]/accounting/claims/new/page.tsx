import { getTranslations } from "next-intl/server";

import { StaffExpenseClaimForm } from "@/components/accounting/staff-expense-claim-form";
import { PageHeader, PageShell } from "@/components/common/page-shell";

/**
 * "/clients/:clientId/accounting/claims/new" — journeys C1, C3 and C6's direct entry point for a
 * staff expense claim (#638).
 *
 * IT IS A ROUTE AND NOT A DIALOG, for the reason the journal composer's own page states and which
 * applies here with more force: this form carries a claimant, two dates, an unbounded itemisation
 * and an optional attachment, it carries a draft that must survive a reload, and appendix C §4
 * reserves a Dialog for "one focused bounded form or decision". A stable URL is also what makes the
 * draft recoverable at all.
 *
 * IT IS A SIBLING ADDRESS OF `…/accounting/journal/new` AND `…/accounting/adjustments/new`, NOT A
 * TAB ON EITHER. The three admit different operations through different doors, and a preparer
 * arrives at one of them with an intent already formed.
 *
 * IT READS NOTHING ON THE SERVER. The client's chart, its live staff-advance enrolments, the
 * caller's rank and the draft are all client-side concerns, and the one thing this route could have
 * checked here — may this caller record a claim — is checked in three better places already: the
 * form renders the denied state, the runtime refuses the POST, and the database rechecks the
 * author's live role AT ADMISSION and again AT COMMIT.
 *
 * The client id's own shape guard lives in the layout above, so a malformed address is the scoped
 * not-found before this file is reached.
 */
export default async function NewStaffExpenseClaimPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("StaffExpenseClaim");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <StaffExpenseClaimForm clientId={clientId} />
    </PageShell>
  );
}
