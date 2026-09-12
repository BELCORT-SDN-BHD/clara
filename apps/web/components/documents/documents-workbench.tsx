"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/parts/read-err-kind";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadFiledDocuments, loadFirmClients, loadOpenCandidates } from "@/lib/documents/loaders";
import { applyDocumentParam, documentUrl, parseDocumentParam } from "@/lib/documents/url-state";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState } from "@/components/common/state";
import { nextPaint } from "@/components/firm/work-question-affordance";
import { FiledDocumentList } from "./filed-document-list";
import { OpenCandidateList } from "./open-candidate-list";
import { UploadPanel } from "./upload-panel";
import { DocumentDetail, DOCUMENT_HEADING_ID } from "./document-detail";
import { DoorFeedback } from "./door-feedback";
import { CodingLanePanel } from "./coding-lane-panel";

/**
 * The client Documents tab (owner ruling Q3) — workbench-first on direct RLS reads
 * (mohe-grill-rulings-2026-08-27.md Q8). Three independently-hydrated cells (filed
 * documents, open candidates, firm clients), each re-deriving on mount and after
 * every door action; the selected document's detail panel is a FOURTH cell, React-
 * `key`ed by `documentId` per lib/parts/hooks.ts's consumer contract (a card whose
 * captured id changes must unmount/remount, never rely on a loader swap alone).
 *
 * THE SELECTION LIVES IN THE URL (#719's Documents half), not in `useState`. It used
 * to be React state alone, so a refresh lost it, a link could not name a document,
 * and Back left the tab. See `lib/documents/url-state.ts` for the parameter's own
 * contract and `openedViaPushRef` below for how the two close paths differ.
 */
export function DocumentsWorkbench({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientDocuments");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selection = useMemo(() => parseDocumentParam(searchParams), [searchParams]);
  const selectedId = selection.kind === "document" ? selection.id : null;

  /** CAPTURES THE FAILURE'S KIND for the filed list, so its banner can offer a Retry for a read that
   *  failed in transit or on the server and withhold one for a denial — `useHydratedPart` keeps only
   *  a finished sentence, which is why no read on this whole surface had a recovery control. */
  const filedKind = useReadErrKind();
  const filed = useHydratedPart(sessionTokenAccessor, () => filedKind.wrap(() => loadFiledDocuments(clientId, t)));
  const candidates = useHydratedPart(sessionTokenAccessor, () => loadOpenCandidates(clientId, t));
  const clients = useHydratedPart(sessionTokenAccessor, () => loadFirmClients(t));

  /** The id a URL named that this client cannot show — a hand-edited or stale link, or a
   *  well-formed uuid whose read came back empty. Held so the aside can say "not available in this
   *  client" AFTER the parameter has been cleared: clearing it alone would drop the person onto
   *  "Select a document…", which is not an answer to the address they followed. */
  const [missing, setMissing] = useState<string | null>(null);

  /** Tells the two close paths apart (Activity's own idiom, activity-feed.tsx:79-100): a row click
   *  PUSHES a real history entry and closing that one pops it, so Back and the in-page close agree.
   *  A page loaded DIRECTLY at `?document=…` — a bookmark, a shared link — has no entry to pop, so
   *  closing that one rewrites the URL instead of stepping the person out of the tab entirely. */
  const openedViaPushRef = useRef(false);

  /** Every rendered filed row's own clickable element, keyed by document id. A Map rather than one
   *  ref: any row on the page can be the one a person opened, only one detail is ever open, and the
   *  row that opened it may have been re-sorted or filtered away by the time it closes — the lookup
   *  treats all of those as "gone" rather than guessing. */
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const lastSelectedRef = useRef<string | null>(null);

  const replaceUrl = useCallback((documentId: string | null) => {
    router.replace(documentUrl(pathname, applyDocumentParam(searchParams, documentId)));
  }, [router, pathname, searchParams]);

  const select = useCallback((documentId: string) => {
    setMissing(null);
    if (documentId === selectedId) return;
    if (selectedId !== null) {
      // ALREADY OPEN ⇒ REPLACE. Stepping from one document to the next is a change of what this
      // one view is showing, not a new place to come back to; pushing each hop would make Back
      // walk the person backwards through every row they clicked before finally reaching the list.
      // The same reasoning Activity applies to a filter change.
      router.replace(documentUrl(pathname, applyDocumentParam(searchParams, documentId)));
      return;
    }
    openedViaPushRef.current = true;
    router.push(documentUrl(pathname, applyDocumentParam(searchParams, documentId)));
  }, [router, pathname, searchParams, selectedId]);

  const close = useCallback(() => {
    if (openedViaPushRef.current) {
      openedViaPushRef.current = false;
      router.back();
      return;
    }
    replaceUrl(null);
  }, [router, replaceUrl]);

  /** A URL naming something this client cannot show: clear the parameter so the address stops
   *  repeating it, and remember the id so the aside can answer the question that was asked. */
  const reportMissing = useCallback((raw: string) => {
    setMissing(raw);
    openedViaPushRef.current = false;
    replaceUrl(null);
  }, [replaceUrl]);

  const malformed = selection.kind === "malformed" ? selection.raw : null;
  useEffect(() => {
    if (malformed !== null) reportMissing(malformed);
  }, [malformed, reportMissing]);

  /** FOCUS, BOTH DIRECTIONS, and exactly one transition each.
   *
   *  OPEN: the detail's own heading takes focus, so a keyboard reader who activated a row lands in
   *  what they opened rather than continuing down the table behind it.
   *  CLOSE: focus returns to the row that opened it. The in-page close path already leaves focus
   *  somewhere real (whatever the person's click or keypress last touched stays put), which is why
   *  this CHECKS first — the physical Back button never held DOM focus, so an SPA re-render after a
   *  pop leaves focus nowhere at all.
   *
   *  `nextPaint` before either (the SAME timing #629's row-focus fix and #728's Activity fix use):
   *  React has not committed the new subtree when this effect runs, and the heading is rendered by
   *  a child that mounts a frame later. A short POLL after it, because a panel that mounts
   *  @base-ui/react primitives parks focus on a guard element for one frame before settling — a
   *  single `focus()` fired into that frame is silently undone. */
  useEffect(() => {
    const previous = lastSelectedRef.current;
    lastSelectedRef.current = selectedId;
    if (previous === selectedId) return;
    if (typeof document === "undefined") return;

    let cancelled = false;
    const doc = document as unknown as { getElementById?: (id: string) => HTMLElement | null };

    const focusHeading = async () => {
      if (typeof doc.getElementById !== "function") return;
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        await nextPaint();
        if (cancelled) return;
        const heading = doc.getElementById(DOCUMENT_HEADING_ID);
        if (!heading) continue;
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
        heading.focus();
        if (document.activeElement === heading) return; // settled; a focus guard would have taken it back
      }
    };

    const restoreRow = async () => {
      await nextPaint();
      if (cancelled) return;
      const active = document.activeElement;
      const activeIsUseless = active === null || active === document.body || active === document.documentElement;
      if (!activeIsUseless) return; // an in-page close already left focus somewhere real
      const row = previous ? rowRefs.current.get(previous) : null;
      if (row && typeof row.focus === "function") { row.focus(); return; }
      if (typeof doc.getElementById !== "function") return;
      const heading = doc.getElementById(DOCUMENT_HEADING_ID);
      if (heading && typeof heading.focus === "function") heading.focus();
    };

    void (selectedId !== null ? focusHeading() : previous !== null ? restoreRow() : Promise.resolve());
    return () => { cancelled = true; };
  }, [selectedId]);

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
                <FiledDocumentList
                  entries={filed.data ?? []}
                  selectedId={selectedId}
                  onSelect={select}
                  rowRef={(documentId, el) => {
                    if (el) rowRefs.current.set(documentId, el);
                    else rowRefs.current.delete(documentId);
                  }}
                />
                <DoorFeedback
                  err={filed.err}
                  clr={filed.clr}
                  action={filed.clr === null && (filedKind.kind === "transport" || filedKind.kind === "server_error") ? (
                    <Button type="button" variant="outline" size="sm" data-testid="documents-filed-retry" onClick={() => { void filed.reload(); }}>
                      {t("retry")}
                    </Button>
                  ) : undefined}
                />
              </>
            )}
          </section>
        </div>

        {/* The detail aside is a panel, so it wears the panel radius the Card
            primitive uses (rounded-xl) rather than the row-card one — the two
            rungs were reading the same before this pass. */}
        <aside className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-surface p-4 lg:max-w-md">
          <SectionHeader
            level={2}
            action={selectedId ? (
              <Button type="button" size="sm" variant="ghost" data-testid="document-detail-close" onClick={close}>
                {t("closeDetail")}
              </Button>
            ) : undefined}
          >
            {t("detailHeading")}
          </SectionHeader>
          {!selectedId ? (
            missing !== null ? (
              <div data-testid="document-not-available">
                <EmptyState>{t("documentNotAvailable")}</EmptyState>
              </div>
            ) : (
              <EmptyState>{t("detailEmpty")}</EmptyState>
            )
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
              onNotFound={() => reportMissing(selectedId)}
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
