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

  const refreshFiled = () => void filed.reload();

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
                act={(fn) => candidates.act(fn, refreshFiled)}
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
    </PageShell>
  );
}
