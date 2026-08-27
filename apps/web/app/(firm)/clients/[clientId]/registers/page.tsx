import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { RegistersWorkbench } from "@/components/registers/registers-workbench";

/**
 * "/clients/:clientId/registers" — one tab of the client workspace (owner
 * ruling Q3). The five read-only register domains that exist today: AR/AP
 * aging, fixed assets, adjustments, staff advances, chart of accounts (census,
 * this build's coordinator ruling). `RegistersWorkbench` reads `?tab=` via
 * `useSearchParams`, which Next.js requires a Suspense boundary around (the
 * /login page's own precedent).
 */
export default async function ClientRegistersPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("ClientRegisters");

  return (
    <PageShell>
      <PageHeader title={t("heading")} />
      <Suspense fallback={null}>
        <RegistersWorkbench clientId={clientId} />
      </Suspense>
    </PageShell>
  );
}
