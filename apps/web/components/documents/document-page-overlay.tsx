"use client";

// D2 — THE PAGE-OVERLAY EVIDENCE VIEWER ("page overlay viewer, i want it now").
//
// What this replaces: `document-evidence.tsx` rendered a `NotBuiltBadge` saying
// "A page-image overlay of these regions' locators exists only for the chat
// review card today — not on this tab", above a flat <dl> of field/value pairs.
// The geometry was there the whole time and was reachable from this app; the
// gap was purely a missing renderer.
//
// WHY IT DRIVES OFF THE EXTRACT READ, NOT THE DETAIL PANEL'S OWN REGION LIST.
// `loadDocumentDetail`'s `listRegionsForExtractionIds` does not select
// `locator` at all and `RegionRow` (types.ts:90) has no locator field, so the
// detail panel's regions are geometry-free. `clara.get_document_extract`
// returns `locator` verbatim per region (0090:1661) AND the extraction envelope
// that carries the page dimensions, which is the ONLY place a scale source
// exists. One read, both halves.
//
// WHAT IT REFUSES TO DO. A region whose polygon is missing, short, odd-length
// or non-finite is SKIPPED — never drawn at a guessed position. A page whose
// size the envelope did not record (a truncated envelope, an engine that wrote
// no `pages` array) gets NO overlay at all, and the component says so in
// words: an outline in the wrong place over a client's document is a claim that
// the engine read a figure from somewhere it did not.
//
// ACCESSIBILITY. The <svg> is `aria-hidden` decoration. The FACT LIST beside it
// is the real control — a table of buttons that a keyboard reaches, and
// selecting a fact is what moves the highlight. The overlay adds nothing a
// screen-reader user loses.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getDocumentExtract } from "@/lib/documents/reads";
import { fetchDocumentBytes } from "@/lib/documents/bytes";
import {
  canRenderPage,
  pageBoxesFromEnvelope,
  locatorPage,
  scaleRegionPolygon,
  PDF_PAGE_MIME,
  type PageBox,
} from "@/lib/documents/region-geometry";
import { partitionRegions } from "@/lib/documents/extract-shape";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/common/section-header";
import { LoadingState, StateBanner } from "@/components/common/state";
import { DocumentFactsTable } from "./document-facts-table";
import type { DocumentExtractRegion, DocumentExtractResult } from "@/lib/documents/types";

/** Same non-null container idiom `DocumentExtractPanel` uses: it keeps "not yet
 *  loaded" (`data === null`) apart from "loaded, and the DB legitimately
 *  admitted nothing" (`{result: null}`). */
type ExtractLoad = { result: DocumentExtractResult | null };

export function DocumentPageOverlay({
  documentId,
  clientId,
  mimeType,
}: {
  documentId: string;
  clientId: string;
  /** `documents.mime_type` from the detail read. Used ONLY to decide which page
   *  renderer to try and to render an honest note for a type that has no page
   *  at all. It is NOT a security decision: `fetchDocumentBytes` re-derives the
   *  type from the response and `VIEWABLE_IN_NEW_TAB` gates the new-tab path
   *  independently (C-07). */
  mimeType: string | null;
}) {
  const t = useTranslations("ClientDocuments");
  const { data, loading, err, clr } = useHydratedPart<ExtractLoad>(sessionTokenAccessor, async (session) => {
    const result = await getDocumentExtract(documentId, clientId, 20000, { session });
    return { result };
  });

  if (loading && !data) return <LoadingState>{t("overlayLoading")}</LoadingState>;
  if (!data) return err ? <StateBanner tone="error" code={clr ? clr.code : undefined}>{err}</StateBanner> : null;
  if (data.result === null) return <StateBanner tone="neutral">{t("overlayNotAvailable")}</StateBanner>;

  return <DocumentPageOverlayContent data={data.result} documentId={documentId} mimeType={mimeType} />;
}

/** The pure, fixed-prop body — mountable by an a11y scan with fixture data,
 *  never driving the self-fetching loader above (the `DocumentExtractContent`
 *  precedent). `documentId` is still needed because the BYTES are fetched here;
 *  an a11y fixture simply gets no bytes and renders the honest "page not
 *  loaded" arm, which is itself a state worth scanning. */
export function DocumentPageOverlayContent({
  data,
  documentId,
  mimeType,
}: {
  data: DocumentExtractResult;
  documentId: string;
  mimeType: string | null;
}) {
  const t = useTranslations("ClientDocuments");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { facts } = useMemo(() => partitionRegions(data.regions), [data.regions]);

  /** Page boxes, per extraction — a region names its own `extraction_id`, and
   *  two extractions of one document can legitimately disagree about page size
   *  (a re-extraction by a different engine). Keying by extraction is what
   *  keeps a v2 region from being scaled against v1's page. */
  const boxesByExtraction = useMemo(() => {
    const map = new Map<string, Map<number, PageBox>>();
    for (const e of data.extractions) {
      map.set(e.id, pageBoxesFromEnvelope(e.envelope_text));
    }
    return map;
  }, [data.extractions]);

  const mime = mimeType ?? data.document.mime_type;
  const renderable = mime !== null && canRenderPage(mime);

  /** The page to show. Driven by the SELECTED fact when it names one, so
   *  clicking a fact on page 3 brings page 3 up; otherwise the first page any
   *  region names, otherwise page 1. */
  const selectedRegion = selectedId === null ? null : data.regions.find((r) => r.id === selectedId) ?? null;
  const firstRegionPage = data.regions.map((r) => locatorPage(r.locator)).find((p) => p !== null) ?? null;
  const page = (selectedRegion ? locatorPage(selectedRegion.locator) : null) ?? firstRegionPage ?? 1;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
      <div className="min-w-0 flex-1">
        {!renderable ? (
          <StateBanner tone="neutral" className="text-xs">
            {t("overlayNoPageForType", { mime: mime ?? t("openDocumentUnknownType") })}
          </StateBanner>
        ) : (
          <PageWithOverlay
            documentId={documentId}
            page={page}
            regions={data.regions}
            boxesByExtraction={boxesByExtraction}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <SectionHeader level={4}>{t("factsHeading")}</SectionHeader>
        <DocumentFactsTable facts={facts} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
    </div>
  );
}

type PageState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "raster"; url: string; revoke: () => void }
  | { kind: "canvas"; canvas: HTMLCanvasElement; cssWidth: number; cssHeight: number; revoke: () => void }
  | { kind: "error"; message: string };

/** The page element plus its polygon layer. Owns the byte fetch, the object-URL
 *  lifetime, and the RENDERED size measurement — the polygons are scaled
 *  against what is actually on screen, re-measured on every resize, never
 *  against an assumed width. */
function PageWithOverlay({
  documentId,
  page,
  regions,
  boxesByExtraction,
  selectedId,
  onSelect,
}: {
  documentId: string;
  page: number;
  regions: readonly DocumentExtractRegion[];
  boxesByExtraction: Map<string, Map<number, PageBox>>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("ClientDocuments");
  const [state, setState] = useState<PageState>({ kind: "idle" });
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);

  // ONE effect owns the whole byte lifetime: fetch, render, revoke. `cancelled`
  // guards every setState after an await so an unmount mid-fetch cannot write
  // to a dead component, and the cleanup revokes the object URL whichever
  // branch created it — a leaked blob holds the whole file in memory.
  useEffect(() => {
    let cancelled = false;
    let revoke: (() => void) | null = null;
    const controller = new AbortController();

    setState({ kind: "loading" });
    void (async () => {
      try {
        const bytes = await fetchDocumentBytes(documentId, { signal: controller.signal });
        revoke = bytes.revoke;
        if (cancelled) { bytes.revoke(); return; }

        if (bytes.mime === PDF_PAGE_MIME) {
          const width = hostRef.current?.clientWidth ?? 640;
          const { renderPdfPageToCanvas } = await import("@/lib/documents/pdf-page-render");
          const rendered = await renderPdfPageToCanvas(bytes.blobUrl, page, Math.max(240, width));
          if (cancelled) { bytes.revoke(); return; }
          setState({ kind: "canvas", canvas: rendered.canvas, cssWidth: rendered.cssWidth, cssHeight: rendered.cssHeight, revoke: bytes.revoke });
          setSize({ width: rendered.cssWidth, height: rendered.cssHeight });
        } else {
          setState({ kind: "raster", url: bytes.blobUrl, revoke: bytes.revoke });
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Error && e.name === "AbortError") return;
        setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      revoke?.();
    };
  }, [documentId, page]);

  // Attach the rendered canvas into the DOM. React does not own this node —
  // pdf.js painted it — so it is appended and removed by hand, and the host is
  // emptied first so a re-render never stacks two pages.
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || state.kind !== "canvas") return;
    host.replaceChildren(state.canvas);
    return () => { host.replaceChildren(); };
  }, [state]);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const img = host.querySelector("img, canvas") as HTMLElement | null;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(host);
    return () => observer.disconnect();
  }, [measure]);

  /** Every drawable polygon for THIS page, in rendered pixels. A region that
   *  scales to null is absent from this list — skipped, never approximated. */
  const polygons = useMemo(() => {
    if (!size) return [];
    const out: Array<{ id: string; points: string; bbox: { x: number; y: number; width: number; height: number } }> = [];
    for (const region of regions) {
      if (locatorPage(region.locator) !== page) continue;
      const boxes = boxesByExtraction.get(region.extraction_id);
      if (!boxes) continue;
      const scaled = scaleRegionPolygon(region.locator, boxes, size.width, size.height);
      if (!scaled) continue;
      out.push({ id: region.id, points: scaled.points, bbox: scaled.bbox });
    }
    return out;
  }, [regions, boxesByExtraction, page, size]);

  // Scroll the selected region into view. Uses the polygon's own bounding box
  // rather than a DOM measurement of the <polygon>, which Safari reports
  // inconsistently for SVG children inside a transformed parent.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const hit = polygons.find((p) => p.id === selectedId);
    const scroller = scrollerRef.current;
    if (!hit || !scroller) return;
    scroller.scrollTo({
      top: Math.max(0, hit.bbox.y - scroller.clientHeight / 2 + hit.bbox.height / 2),
      behavior: "smooth",
    });
  }, [selectedId, polygons]);

  /** The overlay is absent, and the reason is stated. Three genuinely different
   *  causes, and conflating them would hide the one that is actionable: no
   *  regions at all, regions that name no page this component is showing, or a
   *  page whose SIZE the envelope never recorded (so there is no scale source —
   *  the honest limit the ruling's own open question named). */
  const pageHasRegions = regions.some((r) => locatorPage(r.locator) === page);
  const pageHasBoxes = regions.some((r) => {
    if (locatorPage(r.locator) !== page) return false;
    return boxesByExtraction.get(r.extraction_id)?.has(page) === true;
  });

  return (
    <div className="flex flex-col gap-2">
      <div ref={scrollerRef} className="max-h-[32rem] overflow-auto rounded-md border border-border bg-muted p-2">
        <div ref={hostRef} className="relative mx-auto w-full">
          {state.kind === "loading" || state.kind === "idle" ? (
            <LoadingState>{t("overlayPageLoading")}</LoadingState>
          ) : state.kind === "error" ? (
            <StateBanner tone="error" className="text-xs">{t("overlayPageFailed", { message: state.message })}</StateBanner>
          ) : state.kind === "raster" ? (
            // A PLAIN <img>, deliberately, not next/image: the source is a
            // `blob:` object URL minted in THIS browser from bytes already in
            // memory. next/image's optimizer works by having the SERVER fetch
            // the URL, which cannot reach a blob: — and there is nothing to
            // optimize, since the bytes are the client's own document.
            <img
              src={state.url}
              alt={t("overlayPageAlt", { page })}
              className="block h-auto w-full"
              onLoad={measure}
            />
          ) : (
            <div ref={canvasHostRef} className="[&>canvas]:block [&>canvas]:h-auto [&>canvas]:w-full" />
          )}

          {polygons.length > 0 && size ? (
            <svg
              // DECORATION. The facts table beside this is the accessible
              // control; nothing here is reachable or announced, by design.
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${size.width} ${size.height}`}
              preserveAspectRatio="none"
            >
              {polygons.map((p) => (
                <polygon
                  key={p.id}
                  points={p.points}
                  className={
                    p.id === selectedId
                      ? "fill-info/25 stroke-info"
                      : "fill-transparent stroke-border"
                  }
                  strokeWidth={p.id === selectedId ? 2 : 1}
                />
              ))}
            </svg>
          ) : null}
        </div>
      </div>

      {state.kind !== "loading" && state.kind !== "error" && polygons.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {!pageHasRegions
            ? t("overlayNoRegionsOnPage", { page })
            : !pageHasBoxes
              ? t("overlayNoPageSize")
              : t("overlayNoDrawableGeometry")}
        </p>
      ) : null}

      {/* A control the human can use when the polygons are the thing in the
          way — never a hidden state they cannot get out of. */}
      {selectedId !== null ? (
        <Button type="button" size="xs" variant="ghost" onClick={() => onSelect("")}>
          {t("overlayClearSelection")}
        </Button>
      ) : null}
    </div>
  );
}
