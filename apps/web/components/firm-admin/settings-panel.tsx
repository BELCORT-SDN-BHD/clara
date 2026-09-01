"use client";

// FS-8 PR-2 (裁-97) — the firm-settings surface, under /admin. Follows the
// Card + SectionHeader shape components/reports/*.tsx already establish
// (SandboxExportsPanel.tsx, FreeformReadsPanel.tsx), threaded into
// components/firm-admin's own read/act idiom (vendor-bindings-panel.tsx:
// useHydratedPart -> {data, err, clr, busy, act}).
//
// SCOPE, EXACTLY (per this order): the high-stakes threshold control is a
// REAL governed write surface (unlike PR-1's Tax tab, which was IA-only
// honest notes) — the estate's normal form idioms apply, i18n via en.json,
// a11y per the real-heading-tree lesson PR-1's fix round paid for (no
// synthetic h1 in the test fixture; this page supplies its own PageHeader
// h1). The grant_firm_capability/revoke_firm_capability honest note rides
// here (FS-0 census residual) because this PR is what finally gives it a
// firm-admin settings surface to sit beside — PR-1 could not place it
// anywhere, since no such surface existed yet.

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { loadFirmSettings, setFirmHighStakesThreshold } from "@/lib/firm-admin/settings";
import { fmtCents } from "@/lib/firm-admin/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ThresholdChangeDialog } from "./threshold-dialog";

export function SettingsPanel() {
  const t = useTranslations("FirmAdminCompliance.settings");
  const tCommon = useTranslations("Common");
  const { data, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (session) => loadFirmSettings(session));
  const firm = data?.[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("thresholdHeading")}</SectionHeader>
          <CardDescription className="text-xs">{t("thresholdSubheading")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {err ? (
            <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
              {err}
            </StateBanner>
          ) : null}
          {!data ? (
            !err ? <LoadingState>{t("loading")}</LoadingState> : null
          ) : !firm ? (
            <StateBanner tone="error">{t("firmNotFound")}</StateBanner>
          ) : (
            <>
              {/* THE PANEL'S OWN receipt of the DB's current value — never
                  buried inside the (unopened, unmounted-until-open) confirm
                  dialog below. A caller who never opens the dialog still
                  sees what is in force today. */}
              <p className="text-sm text-muted-foreground">
                {t("currentValueLabel")}: <span className="font-medium text-foreground">{fmtCents(firm.high_stakes_amount_cents, tCommon("centsUnsafe"))}</span>
              </p>
              <div>
                <ThresholdChangeDialog
                  currentCents={firm.high_stakes_amount_cents}
                  busy={busy}
                  act={act}
                  onSubmit={(cents) => setFirmHighStakesThreshold(sessionTokenAccessor, cents).then(() => undefined)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("capabilitiesHeading")}</SectionHeader>
          <CardDescription className="text-xs">{t("capabilitiesSubheading")}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* FS-0 census residual (2026-08-31): grant_firm_capability/
              revoke_firm_capability are LIVE, firm-owner-floor doors
              (migration 0056) with no UI anywhere in the estate — this is
              the surface the census named for the note ("note on the
              members surface at FS-8"); PR-1 (#487) could not place it
              because no firm-admin settings page existed yet. */}
          <NotBuiltNote className="text-xs">{t("capabilitiesNotBuilt")}</NotBuiltNote>
        </CardContent>
      </Card>
    </div>
  );
}
