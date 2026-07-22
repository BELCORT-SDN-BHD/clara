"use client";

// The document byte viewer for doc_review (contract §5 / PIN-DELTA-4). Streams the
// document via the runtime route (Bearer session JWT; the browser never holds a
// storage credential) and renders the bytes as INERT data — a raster image element
// for images (in a positioned box so a region polygon can be aligned over it,
// PIN-ADD-2), and for PDFs either the cited page on a pdf.js canvas (when a region is
// placeable, so the polygon aligns) or an inert <object> viewer with `#page=N`
// page-jump. The object URL is revoked on unmount / document change. Honest states:
// idle (no token), loading, unavailable.

import { useCallback, useEffect, useState } from "react";
import { fetchDocumentBytes } from "../reviewApi";
import { RegionOverlay } from "./RegionOverlay";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { XmlStructuredView } from "./XmlStructuredView";
import { isXmlMime } from "./xmlFields";
import type { Pt } from "./regionGeometry";
import styles from "./cards.module.css";

export type DocView = "image" | "pdf-canvas" | "object" | "xml";

/** Which viewer to render (honest degradation — pure, unit-tested):
 *  - an image always aligns the overlay directly;
 *  - a structured XML document (MyInvois/UBL `e_invoice_xml`, contract §7) renders the
 *    structured view — a parsed-field table + a raw-XML <object> fallback, NEVER a
 *    canvas and NEVER an overlay (a geometry-less fact has no region to place);
 *  - a PDF WITH a placeable region and no prior pdf.js failure renders the cited page
 *    on a canvas so the polygon aligns;
 *  - everything else (a PDF with no region, a PDF after a pdf.js failure, or any other
 *    type) falls back to the inert <object> viewer with page-jump — NEVER a blank pane
 *    and NEVER a misplaced overlay. */
export function pickDocView({ mime, hasOverlay, pdfFailed }: { mime: string; hasOverlay: boolean; pdfFailed: boolean }): DocView {
  if (mime.startsWith("image/")) return "image";
  if (isXmlMime(mime)) return "xml";
  if (mime.includes("pdf") && hasOverlay && !pdfFailed) return "pdf-canvas";
  return "object";
}

export function DocViewer({ token, documentId, page, overlay }: { token: string | null; documentId: string; page: number | null; overlay?: Pt[] | null }) {
  const [state, setState] = useState<{ url: string; mime: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A pdf.js render failure (worker/parse) degrades this doc to the <object> viewer.
  const [pdfFailed, setPdfFailed] = useState(false);
  const onPdfFail = useCallback(() => setPdfFailed(true), []);

  useEffect(() => {
    if (!token) return;
    let revoke: (() => void) | null = null;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setState(null);
    setPdfFailed(false); // a new document gets a fresh pdf.js attempt
    fetchDocumentBytes(token, documentId)
      .then((b) => {
        if (cancelled) {
          b.revoke();
          return;
        }
        revoke = b.revoke;
        setState({ url: b.blobUrl, mime: b.mime });
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (revoke) revoke();
    };
  }, [token, documentId]);

  if (!token) return <p className={styles.muted}>Paste a session JWT to view the document.</p>;
  if (loading && !state) return <p className={styles.loadingState}>Loading document…</p>;
  if (err) return <p className={styles.emptyState}>Document unavailable ({err}) — verify against the source document.</p>;
  if (!state) return null;

  const isPdf = state.mime.includes("pdf");
  const src = isPdf && page ? `${state.url}#page=${page}` : state.url;
  const hasOverlay = !!overlay && overlay.length >= 3;
  const view = pickDocView({ mime: state.mime, hasOverlay, pdfFailed });

  return (
    <div className={styles.docViewer}>
      {page ? <div className={styles.pageBar}><span className={styles.muted}>showing page {page}</span></div> : null}
      {view === "image" ? (
        <span className={styles.imageWrap}>
          {/* A raster image element (not a frame that executes): the src is a runtime
              blob: URL from fetched bytes; a positioned box aligns the region overlay. */}
          <img className={styles.docImage} src={state.url} alt="Source document — inert data; verify against the source" />
          {hasOverlay ? <RegionOverlay points={overlay ?? []} /> : null}
        </span>
      ) : view === "pdf-canvas" ? (
        <PdfPageCanvas blobUrl={state.url} page={page ?? 1} overlay={overlay ?? []} onFail={onPdfFail} />
      ) : view === "xml" ? (
        <XmlStructuredView blobUrl={state.url} />
      ) : (
        <object key={src} className={styles.docFrame} data={src} type={state.mime} aria-label="Source document — inert data">
          <p className={styles.muted}>
            Preview unavailable — <a href={state.url} target="_blank" rel="noreferrer">open the document</a>.
          </p>
        </object>
      )}
      <p className={styles.inertNote}>Document text is inert — Clara does not act on it here.</p>
    </div>
  );
}
