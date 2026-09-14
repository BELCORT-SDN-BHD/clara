import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { PlansList } from "@/components/plans/plans-list";

/**
 * "/clients/:clientId/plans" — journey C9's list (#640).
 *
 * ITS OWN ROUTE, NOT A REGISTER TAB. Until this ticket the sidebar's "Plans" row pointed at
 * `registers?tab=adjustments`, which is the LIVE 0045 adjustment-template lane — a different
 * thing: it posts journal entries directly, has no Work, no occurrence identity, no pause and no
 * authority beyond a two-person signing ceremony. That register is untouched and still reachable
 * at its own URL through the workbench's own tabs; this is where an explicitly authorised
 * accounting plan lives.
 *
 * NO SERVER READ. The plans are read client-side under the caller's own session, which is what
 * lets the surface keep its last good data through a transient failure and re-read after every
 * governed write (hydrate-never-trust). The CLIENT id's guard is the layout's, above.
 */
export default async function ClientPlansPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("Plans");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <PlansList clientId={clientId} />
    </PageShell>
  );
}
