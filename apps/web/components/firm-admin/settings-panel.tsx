"use client";

// FS-8 PR-2 (裁-97) — the firm-settings surface, under /admin. Follows the
// Card + SectionHeader shape components/reports/*.tsx already establish
// (SandboxExportsPanel.tsx, FreeformReadsPanel.tsx), threaded into
// components/firm-admin's own read/act idiom (vendor-bindings-panel.tsx:
// useHydratedPart -> {data, err, clr, busy, act}).
//
// THE HIGH-STAKES THRESHOLD IS GONE FROM THIS SURFACE (裁-187, owner,
// 2026-09-04, permanent; minuted as ADR-0078 decision 2). The owner abolished
// EVERY attestation ceremony and EVERY maker-checker wall: "我要废除所有
// attestation机制 … 废除所有marker checker 机制, 只有基本的RBAC的权限划分".
// `firms.high_stakes_amount_cents` and `set_firm_high_stakes_threshold` are named
// in that ruling's own scope census, and the ruling's execution clause says in as
// many words that "the threshold verb and its control retire".
//
// SO THE CONTROL IS REMOVED OUTRIGHT, not hidden and not disabled. A threshold
// that gates nothing is worse than absent: a number still on screen, still
// editable, would be this surface asserting authority over a wall the database
// is in the middle of taking down. The panel reads NOTHING now, because the
// value it used to read is no longer settable from anywhere.
//
// **THE COPY DESCRIBES THE PRE-裁-188 WINDOW, AND IT MUST.** An earlier cut of
// `approvalsNote` said "There is no approval threshold … the amount involved
// does not change who may act". That was FALSE against the live database and was
// caught in review. The threshold's CONTROL is retired; the WALL is not, and the
// two are removed by different lanes:
//   · every firm still carries `firms.high_stakes_amount_cents`
//     (`0002_foundation.sql:204`);
//   · `clara.is_high_stakes` (LIVE at `0009_coding_floor.sql:1513-1521`) fires on
//     an opening balance, a year-end entry, a tax-affecting entry, a stamped
//     `amount_override` OR the summed debits reaching that amount — so the amount
//     is not even the only trigger;
//   · `clara._approve_entry_core` (LIVE at
//     `0016_a21_compliance_watch.sql:1425-1443`) still raises **CLR05** "high-stakes
//     entry needs a distinct checker" / "solo high-stakes approval requires an
//     attestation".
// **裁-188's wall-removal database lane is the one that deletes that refusal**,
// and the last sentence of `approvalsNote` comes out in the SAME change — not
// before it, or this page starts lying in the other direction. The two cells
// that pin the sentence are `e2e/firm-navigation-walk.spec.ts` and
// `firm-admin-pages-a11y.test.tsx`.
//
// WHAT IS DELIBERATELY NOT DONE HERE. The verb itself still exists in the
// database until 裁-188's wall-removal lane lands, and `lib/firm-admin/
// settings.ts` (outside this lane's file ownership) still wraps it, with its own
// unit test. That module is the retirement lane's to remove alongside the
// migration; deleting it from the web first would leave a live door with no
// build-time record of it at all.
//
// The grant_firm_capability/revoke_firm_capability honest note (FS-0 census
// residual) is unchanged and is now this page's only content.

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";

export function SettingsPanel() {
  const t = useTranslations("FirmAdminCompliance.settings");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("approvalsHeading")}</SectionHeader>
          <CardDescription className="text-xs">{t("approvalsSubheading")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="max-w-prose text-sm text-muted-foreground">{t("approvalsNote")}</p>
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
