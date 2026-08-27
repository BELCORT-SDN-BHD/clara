"use client";

// The Close tab (owner ruling Q3) — fiscal-year picker + the selected year's
// close plan (doors, gates, receipt/segregation, the honest not-built proposal
// note). `session === null` while the SessionTokenBridge has not yet resolved a
// session; both children already no-op on that (lib/parts/hooks.ts's own
// `session === null` contract).
//
// M1 (independent review): the fiscal-year list is hydrated HERE, not inside
// FiscalYearPicker, so ClosePlanPanel can trigger BOTH reloads (the plan's own,
// and the picker's) after every door act — otherwise the picker's status badge
// and the plan panel can show two contradictory answers for the same year
// (e.g. the picker still reading "closed" a moment after Abandon ran).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listFiscalYears } from "@/lib/close/api";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { EmptyState } from "@/components/common/state";
import { FiscalYearPicker } from "./FiscalYearPicker";
import { ClosePlanPanel } from "./ClosePlanPanel";

export function ClosePage({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientClose");
  const [fiscalYearId, setFiscalYearId] = useState<string | null>(null);
  const years = useHydratedPart(sessionTokenAccessor, (s) => listFiscalYears(clientId, { session: s }));

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <FiscalYearPicker years={years.data} err={years.err} selected={fiscalYearId} onSelect={setFiscalYearId} />
      {fiscalYearId ? (
        <ClosePlanPanel
          key={fiscalYearId}
          clientId={clientId}
          fiscalYearId={fiscalYearId}
          session={sessionTokenAccessor}
          reloadYears={years.reload}
        />
      ) : (
        <EmptyState>{t("plan.selectPrompt")}</EmptyState>
      )}
    </PageShell>
  );
}
