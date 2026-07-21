"use client";

// The document byte viewer for doc_review (contract §5 / PIN-DELTA-4). Streams the
// document via the runtime route (Bearer session JWT; the browser never holds a
// storage credential) and renders the bytes as INERT data — a raster image element
// for images (in a positioned box so a region polygon can be aligned over it,
// PIN-ADD-2), an inert object element for PDFs. A cited region's page drives `#page=N`
// so a per-leg chip jumps to its backup page. The object URL is revoked on unmount /
// document change. Honest states: idle (no token), loading, unavailable.

import { useEffect, useState } from "react";
import { fetchDocumentBytes } from "../reviewApi";
import { RegionOverlay } from "./RegionOverlay";
import type { Pt } from "./regionGeometry";
import styles from "./cards.module.css";

export function DocViewer({ token, documentId, page, overlay }: { token: string | null; documentId: string; page: number | null; overlay?: Pt[] | null }) {
  const [state, setState] = useState<{ url: string; mime: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let revoke: (() => void) | null = null;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setState(null);
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
  const isImage = state.mime.startsWith("image/");
  const src = isPdf && page ? `${state.url}#page=${page}` : state.url;
  const showOverlay = isImage && !!overlay && overlay.length >= 3;

  // An image renders in a positioned wrapper so the normalized region polygon can be
  // aligned over it (PIN-ADD-2). A PDF renders through an inert <object> and uses
  // page-jump only — we cannot align a polygon inside the embedded viewer, so we do
  // not draw a misleading overlay there (honest degradation).
  return (
    <div className={styles.docViewer}>
      {page ? <div className={styles.pageBar}><span className={styles.muted}>showing page {page}</span></div> : null}
      {isImage ? (
        <span className={styles.imageWrap}>
          {/* A raster image element (not a frame that executes): the src is a runtime
              blob: URL from fetched bytes; a positioned box aligns the region overlay. */}
          <img className={styles.docImage} src={state.url} alt="Source document — inert data; verify against the source" />
          {showOverlay ? <RegionOverlay points={overlay} /> : null}
        </span>
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
