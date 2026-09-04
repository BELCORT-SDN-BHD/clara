"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadFiledDocuments, loadFirmClients, loadOpenCandidates } from "@/lib/documents/loaders";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState } from "@/components/common/state";
import { FiledDocumentList } from "./filed-document-list";
import { OpenCandidateList } from "./open-candidate-list";
import { UploadPanel } from "./upload-panel";
import { DocumentDetail } from "./document-detail";
import { DoorFeedback } from "./door-feedback";
import { CodingLanePanel } from "./coding-lane-panel";

/**
 * The client Documents tab (owner ruling Q3) — workbench-first on direct RLS reads
 * (mohe-grill-rulings-2026-08-27.md Q8). Three independently-hydrated cells (filed
 * documents, open candidates, firm clients), each re-deriving on mount and after
 * every door action; the selected document's detail panel is a FOURTH cell, React-
 * `key`ed by `documentId` per lib/parts/hooks.ts's consumer contract (a card whose
 * captured id changes must unmount/remount, never rely on a loader swap alone).
 */
export function DocumentsWorkbench({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientDocuments");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filed = useHydratedPart(sessionTokenAccessor, () => loadFiledDocuments(clientId, t));
  const candidates = useHydratedPart(sessionTokenAccessor, () => loadOpenCandidates(clientId, t));
  const clients = useHydratedPart(sessionTokenAccessor, () => loadFirmClients(t));

  /** SIBLING FLAW P1 — the coding lane's staleness, closed structurally.
   *
   *  Every act on this tab that creates or retires a FILING changes the coding
   *  lane's population: an uncoded filing appears, or disappears, and a coding
   *  task can be spawned with it. `CodingLanePanel` hydrates three cells of its
   *  own on mount and re-reads them only after ITS OWN door acts
   *  (coding-lane-panel.tsx:34-36), so a confirm-and-file, an upload that
   *  auto-files, a retire, or a wrong-client correction here left every one of
   *  them painting a population that no longer existed — with no error and no
   *  visible cue that the numbers were old.
   *
   *  The fix is an EPOCH rather than a callback chain: `refreshFiled` bumps it,
   *  and `CodingLanePanel` is React-`key`ed by it, so the whole panel unmounts
   *  and re-hydrates all three cells from scratch. A prop-drilled "reload"
   *  would have had to reach three sibling hooks inside a component this one
   *  does not own, and would have gone stale the moment a fourth cell was
   *  added. The key cannot: it is the panel's identity. */
  const [filingEpoch, setFilingEpoch] = useState(0);

  /** THE ONE place a filing-changing act re-derives this tab.
   *
   *  SIBLING FLAW (D1, web half): this used to reload the FILED cell only.
   *  `UploadPanel`'s `onFiled` (an upload that auto-files) and
   *  `CorrectionWizard`'s `onDone` (a wrong-client correction) both route
   *  through here, and both can leave a NEW open attribution candidate — or
   *  clear one — while the "Needs your confirmation" section above kept its
   *  pre-act rows. `OpenCandidateList`'s own confirm already re-read that cell
   *  through `candidates.act`; nothing else did. */
  const refreshFiled = () => {
    void filed.reload();
    void candidates.reload();
    setFilingEpoch((n) => n + 1);
  };

  /** The same refresh MINUS the candidates re-read, for acts fired through
   *  `candidates.act` — `useHydratedPart` already re-reads that cell itself
   *  after every write, success or refusal (hooks.ts:229/237), so calling
   *  `refreshFiled` there would issue the identical read twice. */
  const refreshAfterCandidateAct = () => {
    void filed.reload();
    setFilingEpoch((n) => n + 1);
  };

  return (
    <PageShell>
      <PageHeader title={t("heading")} />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section className="flex flex-col gap-2">
            <SectionHeader level={2}>{t("uploadHeading")}</SectionHeader>
            <UploadPanel clientId={clientId} onFiled={refreshFiled} />
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeader level={2}>{t("candidatesHeading")}</SectionHeader>
            {candidates.loading && !candidates.data ? (
              <LoadingState>{t("loading")}</LoadingState>
            ) : (
              <OpenCandidateList
                entries={candidates.data ?? []}
                busy={candidates.busy}
                err={candidates.err}
                clr={candidates.clr}
                act={(fn) => candidates.act(fn, refreshAfterCandidateAct)}
              />
            )}
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeader level={2}>{t("filedHeading")}</SectionHeader>
            {filed.loading && !filed.data ? (
              <LoadingState>{t("loading")}</LoadingState>
            ) : (
              <>
                <FiledDocumentList entries={filed.data ?? []} selectedId={selectedId} onSelect={setSelectedId} />
                <DoorFeedback err={filed.err} clr={filed.clr} />
              </>
            )}
          </section>
        </div>

        {/* The detail aside is a panel, so it wears the panel radius the Card
            primitive uses (rounded-xl) rather than the row-card one — the two
            rungs were reading the same before this pass. */}
        <aside className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-surface p-4 lg:max-w-md">
          <SectionHeader level={2}>{t("detailHeading")}</SectionHeader>
          {!selectedId ? (
            <EmptyState>{t("detailEmpty")}</EmptyState>
          ) : clients.loading && !clients.data ? (
            <LoadingState>{t("loading")}</LoadingState>
          ) : (
            <DocumentDetail
              key={selectedId}
              documentId={selectedId}
              clientId={clientId}
              clients={clients.data ?? []}
              clientsErr={clients.err}
              clientsClr={clients.clr}
              onFiledChanged={refreshFiled}
            />
          )}
        </aside>
      </div>

      {/* T7 (port-wave plan §4/§5) — the coding-lane surface. CONDUCTOR
          RULING (part2.md §12): nests as a section inside this tab rather
          than a new client-tab array entry — the triaged objects are uncoded
          FILINGS, which is this tab's own subject matter. Full-width, below
          the upload/candidates/filed row, so its own three sub-sections have
          room to breathe rather than competing with the narrow left column. */}
      <CodingLanePanel key={filingEpoch} clientId={clientId} />
    </PageShell>
  );
}
