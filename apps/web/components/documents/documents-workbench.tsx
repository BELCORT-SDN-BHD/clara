"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadFiledDocuments, loadFirmClients, loadOpenCandidates } from "@/lib/documents/loaders";
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

  const filed = useHydratedPart(sessionTokenAccessor, () => loadFiledDocuments(clientId));
  const candidates = useHydratedPart(sessionTokenAccessor, () => loadOpenCandidates(clientId));
  const clients = useHydratedPart(sessionTokenAccessor, () => loadFirmClients());

  const refreshFiled = () => void filed.reload();

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-foreground">{t("uploadHeading")}</h2>
            <UploadPanel clientId={clientId} onFiled={refreshFiled} />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-foreground">{t("candidatesHeading")}</h2>
            {candidates.loading && !candidates.data ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
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
            <h2 className="text-sm font-medium text-foreground">{t("filedHeading")}</h2>
            {filed.loading && !filed.data ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : (
              <>
                <FiledDocumentList entries={filed.data ?? []} selectedId={selectedId} onSelect={setSelectedId} />
                <DoorFeedback err={filed.err} clr={filed.clr} />
              </>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-surface p-4 lg:max-w-md">
          <h2 className="text-sm font-medium text-foreground">{t("detailHeading")}</h2>
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">{t("detailEmpty")}</p>
          ) : clients.loading && !clients.data ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <DocumentDetail key={selectedId} documentId={selectedId} clientId={clientId} clients={clients.data ?? []} />
          )}
        </aside>
      </div>
    </main>
  );
}
