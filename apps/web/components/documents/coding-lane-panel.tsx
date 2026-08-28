"use client";

// The coding-lane surface — T7 (port-wave plan §4/§5, §13 Mobbin grounding).
// CONDUCTOR RULING (port-wave-plan-2026-08-28-part2.md §12): nests as a
// SECTION inside the existing Documents tab (the triaged objects are uncoded
// FILINGS) rather than a new client-tab or route — see
// documents-workbench.tsx's own composition of this panel. Three
// independently-hydrated cells (uncoded filings+lanes, open coding tasks,
// open lint findings), each re-deriving on mount and after every door action
// — the SAME pattern documents-workbench.tsx already uses for its own three
// cells.

import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadUncodedFilingsWithLanes } from "@/lib/coding/loaders";
import { listOpenCodingTasks, listOpenLintFindings } from "@/lib/coding/reads";
import { SectionHeader } from "@/components/common/section-header";
import { LoadingState } from "@/components/common/state";
import { UncodedFilingsList } from "./uncoded-filings-list";
import { CodingTasksSection } from "./coding-tasks-section";
import { LintFindingsSection } from "./lint-findings-section";

export function CodingLanePanel({ clientId }: { clientId: string }) {
  const t = useTranslations("CodingQuestionsSignals");

  const uncoded = useHydratedPart(sessionTokenAccessor, () => loadUncodedFilingsWithLanes(clientId));
  const tasks = useHydratedPart(sessionTokenAccessor, () => listOpenCodingTasks(clientId, { session: sessionTokenAccessor }));
  const findings = useHydratedPart(sessionTokenAccessor, () => listOpenLintFindings(clientId, { session: sessionTokenAccessor }));

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader level={2}>{t("panelHeading")}</SectionHeader>
      <p className="max-w-prose text-sm text-muted-foreground">{t("panelDescription")}</p>

      <section className="flex flex-col gap-2">
        <SectionHeader level={3}>{t("uncodedFiling.heading")}</SectionHeader>
        {uncoded.loading && !uncoded.data ? (
          <LoadingState>{t("loading")}</LoadingState>
        ) : (
          <UncodedFilingsList entries={uncoded.data ?? []} busy={uncoded.busy} error={uncoded.err} act={uncoded.act} />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader level={3}>{t("codingTask.heading")}</SectionHeader>
        {tasks.loading && !tasks.data ? (
          <LoadingState>{t("loading")}</LoadingState>
        ) : (
          <CodingTasksSection tasks={tasks.data ?? []} busy={tasks.busy} error={tasks.err} act={tasks.act} />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader level={3}>{t("lintFinding.heading")}</SectionHeader>
        {findings.loading && !findings.data ? (
          <LoadingState>{t("loading")}</LoadingState>
        ) : (
          <LintFindingsSection findings={findings.data ?? []} busy={findings.busy} error={findings.err} act={findings.act} />
        )}
      </section>
    </div>
  );
}
