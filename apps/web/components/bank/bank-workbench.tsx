"use client";

// The /bank tab's own six-way sub-nav: accounts · statements · matching ·
// exceptions · reconciliation · agent. In-page tab state (not URL-addressed
// sub-routes) — a deliberate simplification for this pass; every OTHER P3
// workbench tab (journals/documents/bank itself) is already URL-as-truth at
// the /clients/:clientId/<tab> level (owner ruling Q3).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionTabs } from "@/components/common/section-tabs";
import { AccountsSection } from "./accounts-section";
import { StatementsSection } from "./statements-section";
import { MatchingSection } from "./matching-section";
import { ExceptionsSection } from "./exceptions-section";
import { ReconciliationSection } from "./reconciliation-section";
import { AgencySection } from "./agency-section";

const TABS = ["accounts", "statements", "matching", "exceptions", "reconciliation", "agency"] as const;
type BankTab = (typeof TABS)[number];

export function BankWorkbench({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.tabs");
  const [tab, setTab] = useState<BankTab>("accounts");

  return (
    <div className="flex flex-col gap-4">
      {/* P3 polish: the filled-primary pill strip became the shared
          <SectionTabs> underline. --primary is the interaction colour, and
          spending it on "which section am I reading" left this page's real
          primary actions (Add account, Enter statement, Match) with nothing
          louder to say. N17's fix travels with it intact: the strip is
          labelled for ITSELF (`navLabel`), never with the active tab's own
          name — that was the defect, and SectionTabs' `label` prop carries the
          same rule for every lane. It is a tablist now rather than a <nav>
          landmark, which is what it always was: these buttons select among
          panels, they do not navigate. */}
      <SectionTabs
        label={t("navLabel")}
        items={TABS.map((tb) => ({ value: tb, label: t(tb) }))}
        value={tab}
        onSelect={setTab}
      />

      {tab === "accounts" && <AccountsSection clientId={clientId} />}
      {tab === "statements" && <StatementsSection clientId={clientId} />}
      {tab === "matching" && <MatchingSection clientId={clientId} />}
      {tab === "exceptions" && <ExceptionsSection clientId={clientId} />}
      {tab === "reconciliation" && <ReconciliationSection clientId={clientId} />}
      {tab === "agency" && <AgencySection clientId={clientId} />}
    </div>
  );
}
