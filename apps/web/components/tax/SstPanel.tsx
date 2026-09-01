"use client";

// SST panel (P6-T, F-T1) — SST registration status, the taxable period's
// output tax, and the SST-02 return draft. F-T1 PR-1 (migration 0153,
// merged) is greenfield for `sst_rate_schedule` ONLY (created there, no
// governed door). `sst_threshold_schedule` is NOT new: it was CREATED at
// migration 0016 (0016_a21_compliance_watch.sql:237) and is already
// LIVE-CONSUMED today — `evaluate_sst_watch`/`evaluate_sst_watches_all`
// read it (0016:568/618/883) and `set_turnover_classification` validates
// against it (0016:926). 0153 only ALTERs that existing table (Annex A.1's
// ordered specification), it does not birth it — fixed here after an
// independent review round (PR #487) caught the original comment
// mis-describing an already-live, already-consumed table as inert
// greenfield. The registration/period/return machinery
// (sst-engine-design-part2.md's PR-2 through PR-6 — `sst_registrations`,
// `sst_taxable_periods`, `sst_returns`/`sst_return_02a` + "the producer")
// does not exist on this tip; Track B is paused (裁-80). No verb has been
// named for the SST-02 producer anywhere in the design corpus yet ("the
// producer", unnamed) — so this note names the real objects that DO and do
// not exist rather than inventing a function signature that has never been
// assigned one.

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";

export function SstPanel() {
  const t = useTranslations("ClientTax.sst");
  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent>
        <NotBuiltNote className="text-xs">{t("notBuilt")}</NotBuiltNote>
      </CardContent>
    </Card>
  );
}
