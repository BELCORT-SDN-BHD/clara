import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { BankWorkbench } from "@/components/bank/bank-workbench";

/**
 * "/clients/:clientId/bank" — the real P3 Bank workbench (owner ruling Q3;
 * mission scope mohe-grill-rulings-2026-08-27.md Q8/Q9): accounts,
 * statements, matching, exceptions, reconciliation ("certify"), and the
 * agent lane's hold + identifier-promotion confirm door. Every affordance
 * here is grounded against a LIVE, named DB verb (see lib/bank/'s own
 * module headers) — the eleven-verb bank-RULES machine (migration 0129) is
 * PERMANENTLY RETIRED and has no surface anywhere below this page.
 */
export default async function ClientBankPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("ClientBank");

  return (
    <PageShell>
      <PageHeader title={t("heading")} />
      <BankWorkbench clientId={clientId} />
    </PageShell>
  );
}
