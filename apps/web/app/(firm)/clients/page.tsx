import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { ClientRegisterList } from "@/components/firm/client-register-list";

/**
 * "/clients" — the client register (owner ruling Q3). Reads clara.clients,
 * enriched with entity_type/msic from clara.client_facts where a live fact
 * exists (lib/firm/reads.ts). Each row links into its workspace at
 * /clients/:clientId.
 */
export default async function ClientsRegisterPage() {
  const t = await getTranslations("ClientsRegister");

  return (
    <PageShell>
      <PageHeader title={t("heading")} />
      <ClientRegisterList />
    </PageShell>
  );
}
