import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { WORK_HEADING_ID, WorkDetail } from "@/components/work/work-detail";

/**
 * "/clients/:clientId/work/:workId" — journey B3's durable detail.
 *
 * A STABLE ADDRESS IS THE POINT, not a convenience. §3's "Accepted long
 * operation" rule is that an accepted request gets a persistent Work link the
 * human may navigate away from and come back to — so this is a route, browser
 * Back works, and the link in a chat card, in the client queue and in the
 * composer's own success navigation are all the same URL.
 *
 * THE HEADING CARRIES AN ID AND THE CLIENT COMPONENT FOCUSES IT (§4: "Work
 * detail focuses its heading when reached by navigation"). The id is declared
 * beside the component that moves focus to it, so the two cannot drift.
 *
 * NO SERVER READ. The Work is read client-side under the caller's own RLS, which
 * is what lets the page poll a non-terminal Work and keep the last dated value
 * through a transient failure — behaviour a server render cannot have. The
 * malformed-id guard therefore lives with the read (lib/work/reads.ts) and in
 * the component, not here; the CLIENT id's guard is the layout's, above.
 */
export default async function ClientWorkDetailPage({
  params,
}: {
  params: Promise<{ clientId: string; workId: string }>;
}) {
  const { clientId, workId } = await params;
  const t = await getTranslations("WorkDetail");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} headingId={WORK_HEADING_ID} />
      <WorkDetail clientId={clientId} workId={workId} />
    </PageShell>
  );
}
