import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { StaffExpenseClaimsTable } from "@/components/accounting/staff-expense-claims-table";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { Button } from "@/components/ui/button";
import { staffExpenseClaimHref } from "@/lib/navigation/tree";

/**
 * "/clients/:clientId/accounting/claims" — the RESULT surface for #638: every staff expense claim
 * this client has recorded, with its claimant, its itemisation, its two dates, how it was settled,
 * its posted entry, its operation receipt and its correction chain.
 *
 * IT IS ITS OWN DESTINATION, NOT A TAB ON THE REGISTERS WORKBENCH, and C6 forces that rather than
 * preferring it. An employee payable is a NON-CONTROL liability leg plus this register: it may not
 * be an open item, because `clara.open_items` is counterparty-keyed and an employee may not be a
 * counterparty at all (migration 0042's tail 20, re-asserted by 0043, 0044 and 0045). So the
 * claimant's money cannot appear in `aging-register.tsx` without repealing four live tail
 * assertions — and it appears here instead, linking across to the SHIPPED staff-advance statement
 * for the advance half rather than re-drawing it.
 *
 * THE PRIMARY ACT IS A VISIBLE BUTTON, and it is offered to everyone who can see this page — the
 * form's own denied state is where a viewer meets the floor, so hiding the control here would be a
 * second, quieter answer to the same question. (Appendix D: "the primary action is a visible Button
 * or route link".)
 *
 * The read itself is the client's, under their own RLS, through `clara.list_staff_expense_claims`.
 * This route performs none of it on the server.
 */
export default async function StaffExpenseClaimsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("StaffExpenseClaim");

  return (
    <PageShell>
      <PageHeader title={t("history.heading")} description={t("history.body")} />
      <div>
        <Button render={<Link href={staffExpenseClaimHref(clientId)} />}>{t("history.newAction")}</Button>
      </div>
      <StaffExpenseClaimsTable clientId={clientId} />
    </PageShell>
  );
}
