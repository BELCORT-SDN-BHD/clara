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
//
// F3(b), independent review: a cell whose INITIAL load failed used to render
// through to its list with `data ?? []` — an empty table with no error
// anywhere, since the list's own per-row/section attribution only fires once
// `actingId` is set (post-act), never on a plain failed read. Each cell now
// distinguishes loading / a genuine failed load / real data explicitly.

import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadUncodedFilingsWithLanes } from "@/lib/coding/loaders";
import { listOpenCodingTasks, listOpenLintFindings } from "@/lib/coding/reads";
import { SectionHeader } from "@/components/common/section-header";
import { LoadingState } from "@/components/common/state";
import { CodingActionRefusal } from "./coding-action-refusal";
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
        ) : !uncoded.data && uncoded.err ? (
          <CodingActionRefusal err={uncoded.err} clr={uncoded.clr} />
        ) : (
          <UncodedFilingsList
            entries={uncoded.data ?? []}
            busy={uncoded.busy}
            error={uncoded.err}
            clr={uncoded.clr}
            // SIBLING FLAW P2 — the cross-cell staleness INSIDE this panel.
            //
            // `open_coding_task` on an uncoded filing is precisely the act that
            // MINTS a row in the "Open coding tasks" cell rendered directly
            // below. `uncoded.act` re-read its own cell and nothing else, so
            // the human watched the filing leave the list above while the task
            // it created never appeared — a state that reads as "nothing
            // happened" and invites a second click on the same door.
            //
            // Composed through `act`'s own `onOk` channel rather than a
            // `.then()` on the returned promise: `onOk` fires ONLY on the
            // write's success path (hooks.ts:224-227), so a refusal does not
            // trigger a pointless re-read, and the ordering stays "write, then
            // both re-reads" instead of racing the hook's own reload.
            act={(fn) => uncoded.act(fn, () => { void tasks.reload(); })}
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader level={3}>{t("codingTask.heading")}</SectionHeader>
        {tasks.loading && !tasks.data ? (
          <LoadingState>{t("loading")}</LoadingState>
        ) : !tasks.data && tasks.err ? (
          <CodingActionRefusal err={tasks.err} clr={tasks.clr} />
        ) : (
          <CodingTasksSection tasks={tasks.data ?? []} busy={tasks.busy} error={tasks.err} clr={tasks.clr} act={tasks.act} />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader level={3}>{t("lintFinding.heading")}</SectionHeader>
        {findings.loading && !findings.data ? (
          <LoadingState>{t("loading")}</LoadingState>
        ) : !findings.data && findings.err ? (
          <CodingActionRefusal err={findings.err} clr={findings.clr} />
        ) : (
          <LintFindingsSection findings={findings.data ?? []} busy={findings.busy} error={findings.err} clr={findings.clr} act={findings.act} />
        )}
      </section>
    </div>
  );
}
