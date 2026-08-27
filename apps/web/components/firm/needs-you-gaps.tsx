"use client";

// The two confirmed backend gaps (this build's coordinator ruling, DB-census
// verified): clara.firm_open_questions and clara.client_identifier_promotions
// carry no human read surface anywhere in the migrations (owner-only RLS, no
// grant, no read RPC). Named honestly rather than worked around — the mission's
// "UI never invents a number, verb, receipt or link" extends to never inventing a
// read that does not exist.

import { useTranslations } from "next-intl";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { SectionHeader } from "@/components/common/section-header";

export function NeedsYouGaps() {
  const t = useTranslations("NeedsYou");
  return (
    <NotBuiltNote>
      {/* P3 finale (fold-seam truing, gate (b)): this is the ONLY heading
          NeedsYouInbox ever renders anywhere in its tree — NeedsYouCounts and
          the row list carry no heading of their own — so level={3} assumed a
          level-2 ancestor that never existed, producing a genuine h1
          (/needs-you's own PageHeader) -> h3 skip on the real page. Level 2
          is correct per SectionHeader's own doc comment: this note IS "a
          major section of a page", not a sub-section of one. */}
      <SectionHeader level={2}>{t("gapsHeading")}</SectionHeader>
      <p>{t("gapFirmQuestions")}</p>
      <p>{t("gapIdentifierPromotions")}</p>
    </NotBuiltNote>
  );
}
