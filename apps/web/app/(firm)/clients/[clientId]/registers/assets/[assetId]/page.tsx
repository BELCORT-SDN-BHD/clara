import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { FixedAssetDetailView } from "@/components/registers/fixed-asset-detail";

/**
 * "/clients/:clientId/registers/assets/:assetId" — C7's asset detail (#639).
 *
 * A ROUTED page, not a Sheet and not a fifth register tab: appendix D's overlay hierarchy puts
 * durable detail, history and shareable outcomes behind a real URL, and one asset's acquisition,
 * its source, its depreciation configuration, its projected schedule and its correction chain is
 * exactly that — something a reviewer links to and returns to with Back.
 *
 * THE LIST STAYS WHERE IT IS. `registers?tab=fixedAssets` is still the register; this is the
 * detail under it, on the `knowledge/:recordId` precedent (#644) rather than a second register.
 */
export default async function ClientFixedAssetPage({
  params,
}: {
  params: Promise<{ clientId: string; assetId: string }>;
}) {
  const { clientId, assetId } = await params;
  const t = await getTranslations("FixedAssetDetail");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("subheading")} />
      <FixedAssetDetailView clientId={clientId} assetId={assetId} />
    </PageShell>
  );
}
