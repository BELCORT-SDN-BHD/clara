import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { ClientWorkspaceOverview } from "@/components/firm/client-workspace-overview";

/**
 * Client-workspace "Home" tab ("/clients/:clientId") — the real client record
 * (lib/firm/reads.ts's loadClientById) plus a client-scoped slice of the
 * Needs-you queue (clara.list_review_queue). `clientId` still comes verbatim
 * from the URL — the workspace layout below it is what scopes reads by it
 * (components/client-scope-provider.tsx); this page just consumes it.
 */
export default async function ClientWorkspacePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("ClientWorkspace");

  return (
    <PageShell>
      <PageHeader title={t("heading")} />
      <ClientWorkspaceOverview clientId={clientId} />
    </PageShell>
  );
}
