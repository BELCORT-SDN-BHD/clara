import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { KnowledgePanel } from "@/components/registers/knowledge-panel";
import { ClientIdentitySection } from "@/components/registers/client-identity-section";

/**
 * "/clients/:clientId/knowledge" — one tab of the client workspace (owner
 * ruling Q3; Codex's "data library" folds into documents/knowledge per Q3's
 * own text). Reads clara.client_facts (lib/registers/knowledge.ts) — a real,
 * granted, provenanced register; a document-attached evidence library lives
 * on the Documents tab, not duplicated here.
 *
 * #647 adds ONE Identity section BELOW the knowledge register, carrying both halves C-41 asks
 * for: the client's own identifiers (H-20's missing face) and its counterparties' identities,
 * each linking out to its own routed detail. It deliberately does NOT change the register's four
 * faces above it — identity stays in the counterparty relations and is RENDERED here rather than
 * moved into `clara.knowledge_records` (0192:269-278 reserves those keys, and this wave mints
 * none of them: `knowledge_keys` / `knowledge_plan_item_map` are #654's alone).
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
      <ClientIdentitySection clientId={clientId} />
    </PageShell>
  );
}
