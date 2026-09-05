"use client";

// Tax computation panel (P6-T, F-T3) — the R1-R10 income-tax computation and
// the CP204 estimate, draft only. F-T3 PR-1 (migration 0152, merged, BUILT
// 2026-08-29) shipped six developer-seeded platform relations (law tables +
// the add_back_class map) — "no governed door is built" (tax-computation-
// design-part2.md's own PR-1 row). The computation itself is
// `clara.evaluate_tax_computation_v1`, the ONE registered member named in
// that same design's PR-6 row — unbuilt; PR-2 through PR-9 are paused
// (裁-80). Even once built, 裁-33 walls `issued` behind a named refusal
// (`tax_issue_unavailable`, seeded in PR-1): this surface can only ever
// reach DRAFT, never file anything, by design — not a build gap to close.
//
// CB-AE2E-032: the identifiers above stay HERE, in source, where they are
// useful to whoever builds the lane. What changed is the string the panel
// RENDERS: it named all of them to a Malaysian accountant, for whom "F-T3
// PR-2…9, paused (裁-80)" is not a sentence about their books and 裁-80 leaks
// an internal decision id. The user-facing note now says what the product
// cannot do yet and keeps the never-files promise as product behaviour rather
// than as a ruling citation.

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";

export function TaxComputationPanel() {
  const t = useTranslations("ClientTax.computation");
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
