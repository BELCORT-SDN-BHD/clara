import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { KnowledgePanel } from "@/components/registers/knowledge-panel";

/**
 * "/clients/:clientId/knowledge" — one tab of the client workspace (owner
 * ruling Q3; Codex's "data library" folds into documents/knowledge per Q3's
 * own text). Reads clara.client_facts (lib/registers/knowledge.ts) — a real,
 * granted, provenanced register; a document-attached evidence library lives
 * on the Documents tab, not duplicated here.
 */
export default async function ClientKnowledgePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("ClientKnowledge");

  return (
    <PageShell>
      {/* `subheading` moved out of KnowledgePanel into the page header — same
          key, one place, same as the Activity feed's own orientation line. */}
      <PageHeader title={t("heading")} description={t("subheading")} />
      <KnowledgePanel clientId={clientId} />
    </PageShell>
  );
}
