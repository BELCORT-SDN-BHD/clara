"use client";

// The depreciation authority panel — propose/sign/retire (WD-R9: sign is
// ADMIN+), plus the runs list and the run-depreciation door. The propose/
// sign shape mirrors the reports domain's register/supersede-recipient doors
// (components/reports/ExportRecipientsPanel.tsx), extended to a three-state
// ceremony per the port-wave plan §4/T3.

import { useTranslations } from "next-intl";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { getDepreciationAuthority } from "@/lib/registers/depreciation";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { AuthorityCeremony } from "./fa-authority-ceremony";
import { DepreciationRunsPanel } from "./fa-depreciation-runs-panel";

export function DepreciationAuthorityPanel({ clientId, onPosted }: { clientId: string; onPosted?: () => void }) {
  const t = useTranslations("FixedAssetsDepreciation.authority");
  const { data, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (s) => getDepreciationAuthority(s, clientId));

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      <p className="text-xs text-muted-foreground">{t("subheading")}</p>
      {data && err ? (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined} className="text-xs">
          {err}
        </StateBanner>
      ) : null}
      {!data ? (
        err ? <StateBanner tone="error" className="text-xs">{String(err)}</StateBanner> : null
      ) : (
        <>
          <AuthorityCeremony clientId={clientId} data={data} busy={busy} act={act} />
          <DepreciationRunsPanel clientId={clientId} hasLiveAuthority={data.authority?.status === "live"} onPosted={onPosted} />
        </>
      )}
    </div>
  );
}
