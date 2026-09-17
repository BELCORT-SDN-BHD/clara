import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsNav } from "@/components/settings/settings-nav";
import { KnowledgeFirmPanel } from "@/components/registers/knowledge-firm-panel";

/**
 * "/settings/knowledge" — the FIRM knowledge register (#654, migration
 * 0205_firm_knowledge_defaults.sql; journeys C13 + D2).
 *
 * WHY IT IS A SETTINGS SECTION AND NOT A CLIENT TAB. A firm default is a rule the
 * firm holds on its own behalf; it has no client to belong to, and the client
 * register deliberately hides a firm row a client's own record overrides
 * (0192:1355-1363). Journey D2's own requirement is that "accounting policy links
 * to Knowledge", so the firm-altitude Knowledge destination lives beside the other
 * firm-altitude settings.
 *
 * NO SCOPE CHECK HERE, and that is not an omission. This page sits under
 * `app/(firm)`, whose layout already calls `requireFirmScope()` — the ONE
 * implementation, at one of its registered entrances (`lib/require-firm-scope.ts`).
 * A second call in this page would make it another entrance, and
 * `tests/firm-scope-surfaces.test.ts` matches the registry against the real app
 * tree BOTH WAYS, so it would go red on sight. The five sibling settings pages are
 * registered the same way — that is, not at all, because the ancestor covers them.
 *
 * NOTHING ON THIS PAGE IS A WALL EITHER. `clara.list_firm_knowledge` floors itself
 * at viewer and scopes to the session's own firm; the acts inside it go through
 * `clara.capture_knowledge` / `correct_knowledge` / `withdraw_knowledge`, each of
 * which rechecks `clara._knowledge_floor` for itself — admin+ for anything
 * firm-scoped (#603 Q22).
 */
export default async function SettingsKnowledgePage() {
  const t = await getTranslations("FirmKnowledge");

  return (
    <PageShell>
      <PageHeader title={t("pageHeading")} description={t("pageDescription")} />
      <SettingsNav />
      <KnowledgeFirmPanel />
    </PageShell>
  );
}
