"use client";

// A single-page PDF renderer for doc_review (contract §5 / PIN-ADD-2 follow-up): the
// browser's inert <object> viewer cannot host a region polygon, so for a PDF WITH a
// placeable region we render the cited page to an inert <canvas> (pdf.js, lazy-loaded
// so it never bloats the main bundle) and reuse RegionOverlay on top — the SAME
// normalized-0..1 overlay the image path uses. The bytes are the already-fetched
// same-origin blob: URL (no storage credential, no extra network). On ANY failure the
// component calls onFail so DocViewer degrades to the <object> + page-jump (honest
// degradation — never a blank pane, never a misplaced overlay). pdf.js decodes bytes
// but does not act on them; the page is inert data.

import { useEffect, useRef, useState } from "react";
import { RegionOverlay } from "./RegionOverlay";
import type { Pt } from "./regionGeometry";
import styles from "./cards.module.css";

export function PdfPageCanvas({ blobUrl, page, overlay, onFail }: { blobUrl: string; page: number; overlay: Pt[]; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    setRendered(false);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // The worker is emitted as a same-origin static asset by the bundler; no CDN.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const task = pdfjs.getDocument({ url: blobUrl });
        destroy = () => { try { void task.destroy(); } catch { /* already gone */ } };
        const pdf = await task.promise;
        if (cancelled) return;
        const pageNum = Math.min(Math.max(Math.trunc(page) || 1, 1), pdf.numPages);
        const pg = await pdf.getPage(pageNum);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) { onFail(); return; }
        // Render at 2x for crispness; CSS (.docImage) scales the element to the column
        // width while the 2x backing store keeps text sharp. The overlay is normalized,
        // so it tracks the scaled element regardless of the backing-store size.
        const viewport = pg.getViewport({ scale: 2 });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) { onFail(); return; }
        await pg.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setRendered(true);
      } catch {
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
      if (destroy) destroy();
    };
  }, [blobUrl, page, onFail]);

  return (
    <span className={styles.imageWrap}>
      {/* Inert raster of the cited page; the src is a decoded blob, never executed. */}
      <canvas ref={canvasRef} className={styles.docImage} aria-label="Source document page — inert data; verify against the source" />
      {rendered && overlay.length >= 3 ? <RegionOverlay points={overlay} /> : null}
    </span>
  );
}
