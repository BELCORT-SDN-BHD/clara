import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { AccountingHub } from "@/components/accounting/accounting-hub";

/**
 * "/clients/:clientId/accounting" — the index of the client's accounting
 * surfaces (#614).
 *
 * NEW, and it exists because the sidebar's Accounting group needs a real
 * destination behind its label: a breadcrumb ancestor has to lead somewhere, and
 * a disclosure that is only a disclosure is a dead end for anyone who arrives
 * with the sidebar collapsed. See components/accounting/accounting-hub.tsx.
 *
 * It reads nothing of its own — the cards are navigation, and every surface
 * behind them meets its own RLS and its own doors.
 */
export default async function ClientAccountingPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("ClientAccounting");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <AccountingHub clientId={clientId} />
    </PageShell>
  );
}
