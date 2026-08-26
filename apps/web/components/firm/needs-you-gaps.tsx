"use client";

// The two confirmed backend gaps (this build's coordinator ruling, DB-census
// verified): clara.firm_open_questions and clara.client_identifier_promotions
// carry no human read surface anywhere in the migrations (owner-only RLS, no
// grant, no read RPC). Named honestly rather than worked around — the mission's
// "UI never invents a number, verb, receipt or link" extends to never inventing a
// read that does not exist.

import { useTranslations } from "next-intl";

export function NeedsYouGaps() {
  const t = useTranslations("NeedsYou");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{t("gapsHeading")}</span>
      <p>{t("gapFirmQuestions")}</p>
      <p>{t("gapIdentifierPromotions")}</p>
    </div>
  );
}
