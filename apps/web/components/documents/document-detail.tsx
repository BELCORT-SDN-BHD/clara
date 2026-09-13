"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart, type PartClr } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/parts/read-err-kind";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadDocumentDetail } from "@/lib/documents/loaders";
import type { ClientRow } from "@/lib/documents/types";
import { DocumentMetadata } from "./document-metadata";
import { DocumentEvidence } from "./document-evidence";
import { DocumentEntries } from "./document-entries";
import { DocumentFilingsHistory } from "./document-filings-history";
import { DocumentAdmin } from "./document-admin";
import { DocumentExtractPanel } from "./document-extract-panel";
import { DocumentStatePanel } from "./document-state-panel";
import { CorrectionWizard } from "./correction-wizard";
import { DoorFeedback } from "./door-feedback";
import { Button } from "@/components/ui/button";
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
export const DOCUMENT_HEADING_ID = "document-detail-heading";

export function DocumentDetail({
  documentId, clientId, clients, clientsErr, clientsClr, onFiledChanged, onNotFound,
}: {
  documentId: string;
  clientId: string;
  clients: ClientRow[];
  clientsErr: string | null;
  clientsClr: PartClr;
  onFiledChanged: () => void;
  /** The read settled and this client cannot show this document — a stale link, another client's
   *  document, or a row that is simply not there (the door collapses all three into one shape, on
   *  purpose: no existence oracle). The WORKBENCH owns what happens next, because the answer is a
   *  URL change plus a standing "not available in this client" state, and neither belongs to a
   *  panel that is about to unmount. Called once per settled read, never while one is in flight. */
  onNotFound?: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  /** CAPTURES THE FAILURE'S KIND on its way past, so this panel can tell a transport failure from a
   *  denial. `useHydratedPart` keeps only a finished sentence, which is why the banner below could
   *  never decide whether a Retry would be honest — and so offered none for anything. */
  const readKind = useReadErrKind();
  const { data, loading, busy, err, clr, act, reload } = useHydratedPart(
    sessionTokenAccessor,
    () => readKind.wrap(() => loadDocumentDetail(documentId, clientId, t)),
  );
  const [correcting, setCorrecting] = useState(false);
  // C-07: lifted out of DocumentExtractPanel so the metadata control's
  // "not viewable here" refusal can OPEN the structured view it points at.
  // A refusal that names an alternative the human then has to go and find is
  // half an answer.
  const [extractOpen, setExtractOpen] = useState(false);
  /** Fires `onNotFound` at most once per mounted document. This component is React-`key`ed by
   *  `documentId` (documents-workbench.tsx), so a fresh id is a fresh mount and a fresh ref — the
   *  guard is per document, not per session. */
  const notifiedNotFound = useRef(false);
  /** Whether this mount has ever actually been in flight — see the effect below. */
  const sawLoading = useRef(false);

  /** REPORTED, NOT RENDERED IN PLACE, when the read SETTLED and found nothing: the address named a
   *  document this client cannot show, and the honest answer includes clearing the parameter that
   *  keeps saying otherwise. A thrown `err` is a different thing — a failure to READ proves nothing
   *  about whether the document is there — so that one keeps its own banner below.
   *
   *  In an EFFECT rather than in the render branch it belongs to: the callback changes the parent's
   *  state and its URL, and doing that during this component's render is the "cannot update a
   *  component while rendering a different one" class. */
  useEffect(() => {
    // A READ THAT HAS NOT STARTED IS NOT A READ THAT FOUND NOTHING, and telling the two apart is
    // the whole correctness of this effect. `useHydratedPart` initialises `loading` to FALSE and
    // flips it inside its own mount effect, so the first commit shows {loading:false, data:null,
    // err:null} — indistinguishable, by value, from a settled empty read. Measured, not supposed:
    // without the latch below every open of a perfectly good document immediately cleared its own
    // `?document=` and painted "not available in this client".
    if (loading) { sawLoading.current = true; return; }
    if (!sawLoading.current || data || err || notifiedNotFound.current) return;
    notifiedNotFound.current = true;
    onNotFound?.();
  }, [loading, data, err, onNotFound]);

  /** RETRY ONLY WHERE A SECOND ATTEMPT CAN ANSWER DIFFERENTLY — the Activity feed's own per-state
   *  discipline. A read that failed in transit or on the server recovers by itself; a 401/403/404
   *  answers identically however many times it is asked, and a governed refusal (`clr`) is a
   *  DECISION rather than a failure. Offering a control there would be offering a control that
   *  cannot work. `null` kind means the failure was not a typed wire error at all (a write's
   *  refusal sharing this cell's err slot, say) — withheld for the same reason. */
  const retryable = clr === null && (readKind.kind === "transport" || readKind.kind === "server_error");
  const retryAction = retryable ? (
    <Button type="button" variant="outline" size="sm" data-testid="document-detail-retry" onClick={() => { void reload(); }}>
      {t("retry")}
    </Button>
  ) : undefined;

  if (loading && !data) {
    return <LoadingState>{t("loading")}</LoadingState>;
  }

  if (!data) {
    // loadDocumentDetail resolves null when the document itself could not be read —
    // an honest "not reachable today" (reportsApi precedent), never a crash, and
    // distinct from a thrown err (rendered below via DoorFeedback).
    return err
      ? <DoorFeedback err={err} clr={clr} action={retryAction} />
      : <EmptyState>{t("documentNotReachable")}</EmptyState>;
  }

  const actAndRefreshFiled = (fn: () => Promise<void>) => act(fn, onFiledChanged);

  return (
    <div className="flex flex-col gap-4">
      <DocumentMetadata
        document={data.document}
        tasks={data.processingTasks}
        clientId={clientId}
        headingId={DOCUMENT_HEADING_ID}
        onShowExtraction={() => setExtractOpen(true)}
      />

      {/* #624 — the FOUR independent states, directly under the identity block and ABOVE
          filings/evidence/entries. Placement is deliberate: a professional opening a document
          asks "what has Clara done with this?" before they ask anything else, and the old answer
          — one `extraction: {status}` badge in the block above — could say "done" about a
          document nothing had been read from. Its own hydrated cell (one governed RPC that
          resolves its own scope and can honestly answer null), so a states refresh never drags
          five unrelated relation reads with it. */}
      <DocumentStatePanel documentId={documentId} clientId={clientId} />

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

      <DoorFeedback err={err} clr={clr} action={retryAction} />

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
