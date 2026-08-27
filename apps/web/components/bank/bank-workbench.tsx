"use client";

// The /bank tab's own six-way sub-nav: accounts · statements · matching ·
// exceptions · reconciliation · agent. In-page tab state (not URL-addressed
// sub-routes) — a deliberate simplification for this pass; every OTHER P3
// workbench tab (journals/documents/bank itself) is already URL-as-truth at
// the /clients/:clientId/<tab> level (owner ruling Q3).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
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
      <nav aria-label={t("accounts")} className="flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            aria-current={tab === tb ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === tb ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => setTab(tb)}
          >
            {t(tb)}
          </button>
        ))}
      </nav>

      {tab === "accounts" && <AccountsSection clientId={clientId} />}
      {tab === "statements" && <StatementsSection clientId={clientId} />}
      {tab === "matching" && <MatchingSection clientId={clientId} />}
      {tab === "exceptions" && <ExceptionsSection clientId={clientId} />}
      {tab === "reconciliation" && <ReconciliationSection clientId={clientId} />}
      {tab === "agency" && <AgencySection clientId={clientId} />}
    </div>
  );
}
