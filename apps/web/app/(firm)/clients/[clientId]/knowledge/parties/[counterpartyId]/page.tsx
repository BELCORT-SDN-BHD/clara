import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { CounterpartyIdentityPanel } from "@/components/registers/counterparty-identity-panel";

/**
 * "/clients/:clientId/knowledge/parties/:counterpartyId" — ONE counterparty's identity (#647).
 *
 * A ROUTED page, not a Sheet, for the reason `knowledge/[recordId]` states: appendix D's overlay
 * hierarchy puts durable detail, history and shareable outcomes behind a real URL, and an
 * identity's correction history is exactly something a reviewer links to.
 *
 * WHY `parties/` AND NOT `/knowledge/:counterpartyId`. `leafFor` (lib/navigation/tree.ts) resolves
 * by EXACT LENGTH, and it already answers `knowledgeRecord` for ANY two-segment path under
 * `knowledge`. A second kind of detail at that depth would be indistinguishable from a knowledge
 * record id, so the literal middle segment is what lets both resolve a real leaf and both put a
 * correct breadcrumb on screen.
 *
 * This leaf inherits the `app/(firm)/layout.tsx` entrance (lib/require-firm-scope.ts) like every
 * other page under `clients/[clientId]`, so it needs no new scope row of its own.
 */
export default async function ClientCounterpartyIdentityPage({
  params,
}: {
  params: Promise<{ clientId: string; counterpartyId: string }>;
}) {
  const { clientId, counterpartyId } = await params;
  const t = await getTranslations("ArApCounterparty.identity");

  return (
    <PageShell>
      <PageHeader title={t("detailHeading")} description={t("detailSubheading")} />
      <CounterpartyIdentityPanel clientId={clientId} counterpartyId={counterpartyId} />
    </PageShell>
  );
}
