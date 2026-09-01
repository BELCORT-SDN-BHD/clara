"use client";

// Turnover classification panel (P6-T, Track B) — `clara.
// set_turnover_classification` (migration 0016, LIVE — not part of F-T1/
// F-T3 at all, a pre-existing bookkeeper+/admin+ human-lane door: agent
// identity is hard-refused, CLR03). The verb exists and is callable today;
// the gap is purely a missing UI, deferred because building it is scoped to
// Track B's Tax tab, which is paused (裁-80). Named separately from F-T1's
// panel above because its dependency is a paused UI train, not a paused
// backend build.

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";

export function TurnoverClassificationPanel() {
  const t = useTranslations("ClientTax.turnoverClassification");
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
