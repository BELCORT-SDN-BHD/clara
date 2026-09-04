"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart, type PartClr } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadDocumentDetail } from "@/lib/documents/loaders";
import type { ClientRow } from "@/lib/documents/types";
import { DocumentMetadata } from "./document-metadata";
import { DocumentEvidence } from "./document-evidence";
import { DocumentEntries } from "./document-entries";
import { DocumentFilingsHistory } from "./document-filings-history";
import { DocumentAdmin } from "./document-admin";
import { DocumentExtractPanel } from "./document-extract-panel";
import { CorrectionWizard } from "./correction-wizard";
import { DoorFeedback } from "./door-feedback";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState } from "@/components/common/state";

/**
 * The document-detail panel — ONE `useHydratedPart` over `loadDocumentDetail`,
 * re-derived on mount and after every door action here or in a child (hydrate-
 * never-trust; contract §3.2). Callers MUST `key` this by `documentId` (hooks.ts's
 * consumer contract) — see documents-workbench.tsx. `onFiledChanged` (independent
 * review 2026-08-27, N9) re-hydrates the PARENT's "Filed to this client" list after
 * any act here that can change it — retiring a filing, or a wrong-client correction
 * moving the document away.
 */
export function DocumentDetail({
  documentId, clientId, clients, clientsErr, clientsClr, onFiledChanged,
}: {
  documentId: string;
  clientId: string;
  clients: ClientRow[];
  clientsErr: string | null;
  clientsClr: PartClr;
  onFiledChanged: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  const { data, loading, busy, err, clr, act, reload } = useHydratedPart(
    sessionTokenAccessor,
    () => loadDocumentDetail(documentId, clientId, t),
  );
  const [correcting, setCorrecting] = useState(false);
  // C-07: lifted out of DocumentExtractPanel so the metadata control's
  // "not viewable here" refusal can OPEN the structured view it points at.
  // A refusal that names an alternative the human then has to go and find is
  // half an answer.
  const [extractOpen, setExtractOpen] = useState(false);

  if (loading && !data) {
    return <LoadingState>{t("loading")}</LoadingState>;
  }

  if (!data) {
    // loadDocumentDetail resolves null when the document itself could not be read —
    // an honest "not reachable today" (reportsApi precedent), never a crash, and
    // distinct from a thrown err (rendered below via DoorFeedback).
    return err ? <DoorFeedback err={err} clr={clr} /> : <EmptyState>{t("documentNotReachable")}</EmptyState>;
  }

  const actAndRefreshFiled = (fn: () => Promise<void>) => act(fn, onFiledChanged);

  return (
    <div className="flex flex-col gap-4">
      <DocumentMetadata
        document={data.document}
        tasks={data.processingTasks}
        onShowExtraction={() => setExtractOpen(true)}
      />

      <section className="flex flex-col gap-1">
        <SectionHeader level={4}>{t("filingsHeading")}</SectionHeader>
        <DocumentFilingsHistory filings={data.filings} busy={busy} act={actAndRefreshFiled} />
      </section>

      <DocumentEvidence
        regions={data.regions}
        documentId={documentId}
        clientId={clientId}
        mimeType={data.document.mime_type}
      />

      <section className="flex flex-col gap-1">
        <SectionHeader level={4}>{t("entriesHeading")}</SectionHeader>
        <DocumentEntries entries={data.entries} />
      </section>

      <DocumentExtractPanel
        documentId={documentId}
        clientId={clientId}
        open={extractOpen}
        onOpenChange={setExtractOpen}
      />

      <DocumentAdmin document={data.document} busy={busy} act={act} onCorrect={() => setCorrecting(true)} />

      <DoorFeedback err={err} clr={clr} />

      <CorrectionWizard
        open={correcting}
        document={data.document}
        fromClient={clientId}
        clients={clients}
        clientsErr={clientsErr}
        clientsClr={clientsClr}
        onClose={() => setCorrecting(false)}
        // D1 (sibling finding): a wrong-client correction moves the document
        // AWAY from this client, which can re-open an attribution candidate for
        // it — but this callback only ever reloaded the detail bundle and the
        // FILED list. The "Needs your confirmation" cell above kept painting
        // its pre-correction rows until something else happened to re-read it.
        // `onFiledChanged` now re-reads BOTH cells (documents-workbench.tsx).
        onDone={() => { setCorrecting(false); void reload(); onFiledChanged(); }}
      />
    </div>
  );
}
