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
import { SectionHeader } from "@/components/common/section-header";
import { FiscalYearPicker } from "./FiscalYearPicker";
import { FiscalYearOpener } from "./FiscalYearOpener";
import { ClosePlanPanel } from "./ClosePlanPanel";
import { ClosePrepHoldPanel } from "./ClosePrepHoldPanel";
import { FutureAttestationPanel } from "./FutureAttestationPanel";
import { AgentActReceiptsPanel } from "./AgentActReceiptsPanel";

export function ClosePage({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientClose");
  const [fiscalYearId, setFiscalYearId] = useState<string | null>(null);
  const years = useHydratedPart(sessionTokenAccessor, (s) => listFiscalYears(clientId, { session: s }));

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />

      {/* T1: client-scoped (not fiscal-year-scoped) — mounted once, above the
          picker, since opening the FIRST fiscal year is the precondition for
          everything below it (port-wave-plan §9.3's FIRST-EXECUTION note). */}
      <FiscalYearOpener clientId={clientId} session={sessionTokenAccessor} onOpened={years.reload} />

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

      {/* T1: the remaining client-scoped (not fiscal-year-scoped) doors —
          hold/release_close_prep, record_future_attestation,
          list_agent_act_receipts. Each owns its own read/reload; none
          depends on which fiscal year is selected above. */}
      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("closePrep.heading")}</SectionHeader>
        <ClosePrepHoldPanel clientId={clientId} session={sessionTokenAccessor} />
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("futureAttestation.heading")}</SectionHeader>
        <FutureAttestationPanel clientId={clientId} session={sessionTokenAccessor} />
      </section>
      <AgentActReceiptsPanel clientId={clientId} session={sessionTokenAccessor} />
    </PageShell>
  );
}
