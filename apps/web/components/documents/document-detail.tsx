"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useHydratedPart, type PartClr } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/parts/read-err-kind";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadDocumentDetail } from "@/lib/documents/loaders";
import { readSourceDependents, readSourceRevisions, type CorrectionPreview } from "@/lib/documents/reads";
import { listProcessingTasksForDocument } from "@/lib/documents/intake";
import { useSettlePoll } from "@/lib/documents/use-settle-poll";
import type { ProcessingStatus, ProcessingTaskRow } from "@/lib/documents/types";
import { findEntryForDocument, type DocumentClaim } from "@/lib/work/evidence";
import {
  applyDocumentTabParam, documentUrl, parseDocumentTabParam, type DocumentTab,
} from "@/lib/documents/url-state";
import type { ClientRow } from "@/lib/documents/types";
import { partitionRegions } from "@/lib/documents/extract-shape";
import { DocumentMetadata } from "./document-metadata";
import { DocumentEntries } from "./document-entries";
import { DocumentFilingsHistory } from "./document-filings-history";
import { DocumentAdmin } from "./document-admin";
import { DocumentExtractPanel } from "./document-extract-panel";
import { DocumentStatePanel } from "./document-state-panel";
import { DocumentEvidence } from "./document-evidence";
import { DocumentFactsTable } from "./document-facts-table";
import { DocumentKindDialog } from "./document-kind-dialog";
import { CorrectionWizard } from "./correction-wizard";
import { CorrectionImpactSheet } from "./correction-impact-sheet";
import { SourceCorrectionBand } from "./source-correction-band";
import { SourceDependentsPanel } from "./source-dependents-panel";
import { DoorFeedback } from "./door-feedback";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { SectionHeader } from "@/components/common/section-header";
import { SectionTabs } from "@/components/common/section-tabs";
import { EmptyState, LoadingState } from "@/components/common/state";

/**
 * The document-detail panel — ONE `useHydratedPart` over `loadDocumentDetail`,
 * re-derived on mount and after every door action here or in a child (hydrate-
 * never-trust; contract §3.2). Callers MUST `key` this by `documentId` (hooks.ts's
 * consumer contract) — see documents-workbench.tsx. `onFiledChanged` (independent
 * review 2026-08-27, N9) re-hydrates the PARENT's "Filed to this client" list after
 * any act here that can change it — retiring a filing, or a wrong-client correction
 * moving the document away.
 *
 * #646 — THREE ROUTED VIEWS OF ONE OBJECT.
 *
 * This panel used to stack every section in one column: metadata, four states, filings, evidence,
 * entries, admin, correction. Nothing in it was addressable, Back did nothing inside it, and a
 * person asked to "look at the accounting" had to scroll past the page image to find it. AC2 asks
 * for "Original, typed facts and accounting/Work as distinct routed views", and AC6 for the
 * composition that carries them.
 *
 *   ORIGINAL     the page image with its region overlay, the filing history it came in on, and the
 *                management doors (kind, legal hold, re-extraction, wrong-client correction).
 *   FACTS        the typed facts, each with its own revision door.
 *   ACCOUNTING   the entries standing on this document, the live evidence link, and what is
 *                standing on its reading (knowledge, questions, parked Work).
 *
 * THE ADDRESS IS `?document=<id>&tab=original|facts|accounting`, on the SAME route — #624's
 * `?document=` deep link keeps its exact meaning, and the default view writes no `tab` parameter at
 * all, so every link already sent still opens the same page. See `lib/documents/url-state.ts`.
 *
 * A TAB SWITCH IS `router.replace`, NOT `push`: switching between adjacent views of one object is a
 * change of what this view is SHOWING, not a new place to come back to, and pushing each hop would
 * make Back walk backwards through every tab a person glanced at before finally closing the
 * document. That is Activity's own rule for a filter change, and `registers-workbench.tsx` applies
 * it to this exact parameter.
 *
 * TAB SWITCHING NEVER INVOKES A WRITE AND NEVER DISCARDS A DRAFT (appendix C §4 and §3). Both
 * dialogs and the correction wizard are rendered OUTSIDE the switched panels, so their unsent input
 * survives — the panels mount and unmount, the controls do not.
 */
export const DOCUMENT_HEADING_ID = "document-detail-heading";

/** #904 — the `ProcessingStatus` values a task can still move FROM. Module-scoped: a fresh Set
 *  every render would be harmless but pointless churn for a lookup this cheap. */
const NON_TERMINAL_TASK_STATUS: ReadonlySet<ProcessingStatus> = new Set(["queued", "held_egress", "running"]);

export function DocumentDetail({
  documentId, clientId, clients, clientsErr, clientsClr, onFiledChanged, onNotFound, settlePoll,
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
  /** #904 — timing override for the processing-tasks settle poll below, the SAME shape
   *  `documents-workbench.tsx` already accepts for its own intake-receipts poll and forwards to
   *  `useIntakeBatch`. Unset in production (the hook's own defaults apply); a test passes a
   *  zero-delay budget so a bounded poll can be observed without waiting out its real backoff. */
  settlePoll?: { maxTicks?: number; baseDelayMs?: number; maxDelayMs?: number };
}) {
  const t = useTranslations("ClientDocuments");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab: DocumentTab = useMemo(() => parseDocumentTabParam(searchParams), [searchParams]);

  /** CAPTURES THE FAILURE'S KIND on its way past, so this panel can tell a transport failure from a
   *  denial. `useHydratedPart` keeps only a finished sentence, which is why the banner below could
   *  never decide whether a Retry would be honest — and so offered none for anything. */
  const readKind = useReadErrKind();
  const { data, loading, busy, err, clr, act, reload } = useHydratedPart(
    sessionTokenAccessor,
    () => readKind.wrap(() => loadDocumentDetail(documentId, clientId, t)),
  );

  /** #904 — THE PROCESSING TASKS REFRESH LIVE, bounded, while any of them is still moving.
   *
   *  BEFORE THIS, a task that moved `running` -> `done` (or `failed`) while the panel stayed open
   *  was invisible until a manual reload — #650's final report named this the workbench's own gap
   *  (the intake-receipts settle poll below covers the PRE-FILING queue, not a filed document's own
   *  extraction/OCR tasks). This reuses the SAME bounded, backed-off, hidden-tab-paused idiom
   *  `documents-workbench.tsx` already runs for the receipts list (`lib/documents/use-settle-poll.ts`)
   *  rather than inventing a second one.
   *
   *  L07-02 (fix round) — `onTick` is `listProcessingTasksForDocument` ALONE, ONE read, matching
   *  `use-settle-poll.ts`'s own onTick contract ("One read.") and the sibling receipts poll's law
   *  (README.md, "A tick costs ONE read"). It USED to be the panel's whole-bundle `reload()` (five
   *  or six reads a tick, up to ~72 over a poll's life) — the exact pattern fix round 1 removed from
   *  the receipts poll for the same cost reason. `taskOverride` carries the freshest read; cleared
   *  whenever `data` itself changes (a real `reload()`, from a mount, an act, or the manual Refresh
   *  below) so a stale override can never shadow a fresher full bundle.
   *
   *  `resetKey: documentId` restarts the budget on a different document even though this component
   *  is already React-`key`ed by it at the workbench (documents-workbench.tsx's own consumer
   *  contract) — belt, matching `use-settle-poll.ts`'s own stated reason for the option existing. */
  const [taskOverride, setTaskOverride] = useState<ProcessingTaskRow[] | null>(null);
  useEffect(() => { setTaskOverride(null); }, [data]);
  const tasks = taskOverride ?? data?.processingTasks ?? [];
  const tasksPoll = useSettlePoll({
    enabled: tasks.some((task) => NON_TERMINAL_TASK_STATUS.has(task.status)),
    onTick: async () => { setTaskOverride(await listProcessingTasksForDocument(documentId)); },
    resetKey: documentId,
    ...settlePoll,
  });

  /** #646 — the source lineage, its OWN hydrated cell. It is a different read at a different floor
   *  (`clara.list_source_revisions` is bookkeeper+, while the detail bundle is a set of viewer-level
   *  RLS reads), so folding it into the bundle above would make a viewer's whole document panel
   *  refuse. Here, a viewer simply gets no band and no revision controls, and everything else on
   *  the surface still renders. */
  const revisions = useHydratedPart(sessionTokenAccessor, () => readSourceRevisions(documentId));
  const dependents = useHydratedPart(sessionTokenAccessor, () => readSourceDependents(documentId));

  const [correcting, setCorrecting] = useState(false);
  const [impact, setImpact] = useState<
    { preview: CorrectionPreview; toClientName: string; fromClientName: string } | null>(null);
  // C-07: lifted out of DocumentExtractPanel so the metadata control's
  // "not viewable here" refusal can OPEN the structured view it points at.
  // A refusal that names an alternative the human then has to go and find is
  // half an answer.
  const [extractOpen, setExtractOpen] = useState(false);
  /** The live posting claim on this document, read DIRECTLY from `clara.entry_evidence_links` (and
   *  the document-coding lane's own arm) rather than through a wrapper — wave DECISIONS §7. */
  const [claim, setClaim] = useState<DocumentClaim | null>(null);
  /** Fires `onNotFound` at most once per mounted document. This component is React-`key`ed by
   *  `documentId` (documents-workbench.tsx), so a fresh id is a fresh mount and a fresh ref — the
   *  guard is per document, not per session. */
  const notifiedNotFound = useRef(false);
  /** Whether this mount has ever actually been in flight — see the effect below. */
  const sawLoading = useRef(false);

  const clientName = useCallback(
    (id: string) => clients.find((c) => c.id === id)?.name || id, [clients]);

  const selectTab = useCallback((next: DocumentTab) => {
    router.replace(documentUrl(pathname, applyDocumentTabParam(searchParams, next)));
  }, [router, pathname, searchParams]);

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

  /** The live claim, re-read on mount and after any act here. A link is never invented: the reader
   *  answers null when nothing holds the document. */
  useEffect(() => {
    let alive = true;
    void findEntryForDocument(documentId)
      .then((c) => { if (alive) setClaim(c); })
      .catch(() => { if (alive) setClaim(null); });
    return () => { alive = false; };
  }, [documentId, data]);

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
  const reloadAll = () => {
    void reload();
    void revisions.reload();
    void dependents.reload();
  };
  const { facts, layout } = partitionRegions(data.regions);
  const layoutCount = layout.reduce((n, group) => n + group.regions.length, 0);
  const factsVersion = revisions.data?.facts_version ?? null;

  return (
    <div className="flex flex-col gap-4">
      <DocumentMetadata
        document={data.document}
        tasks={tasks}
        clientId={clientId}
        headingId={DOCUMENT_HEADING_ID}
        onShowExtraction={() => setExtractOpen(true)}
        tasksExhausted={tasksPoll.exhausted && tasks.some((task) => NON_TERMINAL_TASK_STATUS.has(task.status))}
        onRefreshTasks={() => void reload()}
      />

      {/* #646 — the correction band stands ABOVE the tab strip so both of its sentences are
          readable from every view. */}
      <SourceCorrectionBand revisions={revisions.data ?? null} clientId={clientId} clientName={clientName} />

      {/* #624 — the FOUR independent states, directly under the identity block and ABOVE the
          routed views. Placement is deliberate: a professional opening a document asks "what has
          Clara done with this?" before they ask anything else, and the old answer — one
          `extraction: {status}` badge in the block above — could say "done" about a document
          nothing had been read from. Its own hydrated cell (one governed RPC that resolves its own
          scope and can honestly answer null), so a states refresh never drags five unrelated
          relation reads with it. */}
      <DocumentStatePanel documentId={documentId} clientId={clientId} showWorkLinks />

      <SectionTabs
        label={t("viewsLabel")}
        value={tab}
        onSelect={selectTab}
        items={[
          { value: "original", label: t("viewOriginal") },
          { value: "facts", label: t("viewFacts") },
          { value: "accounting", label: t("viewAccounting") },
        ]}
      />

      {tab === "original" ? (
        <div className="flex flex-col gap-4" data-testid="document-view-original">
          {/* #624's READING SURFACE, CARRIED IN VERBATIM. `DocumentEvidence` keeps the page overlay
              LAZY behind its own toggle, and that is not a detail: opening it fetches the document's
              full bytes and, for a PDF, a separate pdf.js chunk — not something to spend on every
              mount of a panel a person may only be skimming (that file's own header). Mounting the
              overlay unconditionally here would also have changed what `documents-viewer-walk.spec.ts`
              measures on the default view, and #624's walk stays green verbatim. */}
          <DocumentEvidence
            regions={data.regions}
            documentId={documentId}
            clientId={clientId}
            mimeType={data.document.mime_type}
          />
          <section className="flex flex-col gap-1">
            <SectionHeader level={4}>{t("filingsHeading")}</SectionHeader>
            <DocumentFilingsHistory filings={data.filings} busy={busy} act={actAndRefreshFiled} />
          </section>
        </div>
      ) : null}

      {tab === "facts" ? (
        <div className="flex flex-col gap-3" data-testid="document-view-facts">
          <SectionHeader level={4}>{t("evidenceHeading")}</SectionHeader>
          <DocumentFactsTable
            facts={facts}
            revise={factsVersion === null ? null : {
              documentId, factsVersion, busy: busy || revisions.busy, onRevised: reloadAll,
            }}
          />
          {/* The partition is total, so the regions NOT in the facts table are accounted for by
              name and count rather than silently missing. */}
          {layoutCount > 0 ? (
            <p className="text-xs text-muted-foreground">{t("evidenceLayoutElsewhere", { count: layoutCount })}</p>
          ) : null}
          {factsVersion === null ? (
            <p className="text-xs text-muted-foreground" data-testid="facts-revision-unavailable">
              {t("factsRevisionUnavailable")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="facts-version">
              {t("factsVersionNote", { version: factsVersion })}
            </p>
          )}
          <DoorFeedback err={revisions.err} clr={revisions.clr} />
        </div>
      ) : null}

      {tab === "accounting" ? (
        <div className="flex flex-col gap-4" data-testid="document-view-accounting">
          <section className="flex flex-col gap-1">
            <SectionHeader level={4}>{t("entriesHeading")}</SectionHeader>
            <DocumentEntries entries={data.entries} />
            {claim ? (
              <p className="text-xs text-muted-foreground" data-testid="document-live-claim">
                <Link
                  className="underline underline-offset-2"
                  href={`/clients/${claim.clientId}/journals`}
                >
                  {t("liveClaim", { client: claim.clientName ?? claim.clientId })}
                </Link>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="document-no-claim">{t("noLiveClaim")}</p>
            )}
          </section>
          <SourceDependentsPanel
            dependents={dependents.data ?? null}
            clientId={clientId}
            busy={busy || dependents.busy}
            act={(fn) => dependents.act(fn, reloadAll)}
          />
          <DoorFeedback err={dependents.err} clr={dependents.clr} />
        </div>
      ) : null}

      <DocumentExtractPanel
        documentId={documentId}
        clientId={clientId}
        open={extractOpen}
        onOpenChange={setExtractOpen}
      />

      {/* THE MANAGEMENT DOORS SIT OUTSIDE THE SWITCHED PANELS, and that is what makes an unsent
          reason survive a tab switch: these components never unmount when the view changes. */}
      <div className="flex flex-col gap-3">
        <SectionHeader level={4}>{t("kindHeading")}</SectionHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DocumentKindDialog
            documentId={documentId}
            currentKind={data.document.document_kind}
            busy={busy}
            act={act}
            refusal={err ? { err, clr } : undefined}
            onChanged={reloadAll}
          />
        </div>
        <DocumentAdmin document={data.document} busy={busy} act={act} onCorrect={() => setCorrecting(true)} />
      </div>

      <DoorFeedback err={err} clr={clr} action={retryAction} />

      <CorrectionWizard
        open={correcting}
        // ONE OVERLAY AT A TIME (appendix C §4): while the impact Sheet is open the wizard is
        // SUSPENDED, not closed — its step, its destination and its attestation are all still
        // there when the Sheet closes.
        suspended={impact !== null}
        document={data.document}
        fromClient={clientId}
        clients={clients}
        clientsErr={clientsErr}
        clientsClr={clientsClr}
        onShowImpact={(preview, toClient) => setImpact({
          preview, toClientName: clientName(toClient), fromClientName: clientName(clientId),
        })}
        onClose={() => setCorrecting(false)}
        // D1 (sibling finding): a wrong-client correction moves the document
        // AWAY from this client, which can re-open an attribution candidate for
        // it — but this callback only ever reloaded the detail bundle and the
        // FILED list. The "Needs your confirmation" cell above kept painting
        // its pre-correction rows until something else happened to re-read it.
        // `onFiledChanged` now re-reads BOTH cells (documents-workbench.tsx).
        onDone={() => { setCorrecting(false); reloadAll(); onFiledChanged(); }}
      />
      <CorrectionImpactSheet impact={impact} onOpenChange={(open) => { if (!open) setImpact(null); }} />
    </div>
  );
}
