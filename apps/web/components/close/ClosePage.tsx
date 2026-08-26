"use client";

// The Close tab (owner ruling Q3) — fiscal-year picker + the selected year's
// close plan (doors, gates, receipt/segregation, the honest not-built proposal
// note). `session === null` while the SessionTokenBridge has not yet resolved a
// session; both children already no-op on that (lib/parts/hooks.ts's own
// `session === null` contract).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { FiscalYearPicker } from "./FiscalYearPicker";
import { ClosePlanPanel } from "./ClosePlanPanel";

export function ClosePage({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientClose");
  const [fiscalYearId, setFiscalYearId] = useState<string | null>(null);

  return (
    <main className="flex flex-col gap-4 p-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
      </div>
      <FiscalYearPicker clientId={clientId} session={sessionTokenAccessor} selected={fiscalYearId} onSelect={setFiscalYearId} />
      {fiscalYearId ? (
        <ClosePlanPanel key={fiscalYearId} clientId={clientId} fiscalYearId={fiscalYearId} session={sessionTokenAccessor} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("plan.selectPrompt")}</p>
      )}
    </main>
  );
}
