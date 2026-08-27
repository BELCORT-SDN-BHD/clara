import { getTranslations } from "next-intl/server";
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
    <main className="flex flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <ClientWorkspaceOverview clientId={clientId} />
    </main>
  );
}
