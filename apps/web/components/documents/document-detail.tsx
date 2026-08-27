"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadDocumentDetail } from "@/lib/documents/loaders";
import type { ClientRow } from "@/lib/documents/types";
import { DocumentMetadata } from "./document-metadata";
import { DocumentEvidence } from "./document-evidence";
import { DocumentEntries } from "./document-entries";
import { DocumentFilingsHistory } from "./document-filings-history";
import { DocumentAdmin } from "./document-admin";
import { CorrectionWizard } from "./correction-wizard";
import { DoorFeedback } from "./door-feedback";

/**
 * The document-detail panel — ONE `useHydratedPart` over `loadDocumentDetail`,
 * re-derived on mount and after every door action here or in a child (hydrate-
 * never-trust; contract §3.2). Callers MUST `key` this by `documentId` (hooks.ts's
 * consumer contract) — see documents-workbench.tsx.
 */
export function DocumentDetail({ documentId, clientId, clients }: { documentId: string; clientId: string; clients: ClientRow[] }) {
  const t = useTranslations("ClientDocuments");
  const { data, loading, busy, err, clr, act, reload } = useHydratedPart(
    sessionTokenAccessor,
    () => loadDocumentDetail(documentId),
  );
  const [correcting, setCorrecting] = useState(false);

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (!data) {
    // loadDocumentDetail resolves null when the document itself could not be read —
    // an honest "not reachable today" (reportsApi precedent), never a crash, and
    // distinct from a thrown err (rendered below via DoorFeedback).
    return err ? <DoorFeedback err={err} clr={clr} /> : <p className="text-sm text-muted-foreground">{t("documentNotReachable")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <DocumentMetadata document={data.document} tasks={data.processingTasks} />

      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">{t("filingsHeading")}</h3>
        <DocumentFilingsHistory filings={data.filings} busy={busy} act={act} />
      </section>

      <DocumentEvidence regions={data.regions} />

      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">{t("entriesHeading")}</h3>
        <DocumentEntries entries={data.entries} />
      </section>

      <DocumentAdmin document={data.document} busy={busy} act={act} onCorrect={() => setCorrecting(true)} />

      <DoorFeedback err={err} clr={clr} />

      <CorrectionWizard
        open={correcting}
        document={data.document}
        fromClient={clientId}
        clients={clients}
        onClose={() => setCorrecting(false)}
        onDone={() => { setCorrecting(false); void reload(); }}
      />
    </div>
  );
}
