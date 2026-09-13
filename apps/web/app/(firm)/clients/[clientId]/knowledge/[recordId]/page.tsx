import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { KnowledgeDetail } from "@/components/registers/knowledge-detail";

/**
 * "/clients/:clientId/knowledge/:recordId" — C13's detail destination (#644).
 *
 * A ROUTED page, not a Sheet: appendix D's overlay hierarchy puts durable
 * detail, history and shareable outcomes behind a real URL, and a knowledge
 * record's revision timeline is exactly that — something a reviewer links to.
 * `recordId` is the STABLE `record_id`, not a revision id, so the URL keeps
 * meaning after a correction adds a revision.
 */
export default async function ClientKnowledgeRecordPage({
  params,
}: {
  params: Promise<{ clientId: string; recordId: string }>;
}) {
  const { clientId, recordId } = await params;
  const t = await getTranslations("ClientKnowledge");

  return (
    <PageShell>
      <PageHeader title={t("detailHeading")} description={t("detailSubheading")} />
      <KnowledgeDetail clientId={clientId} recordId={recordId} />
    </PageShell>
  );
}
