"use client";

// D2 — the PDF page, isolated behind `next/dynamic(..., { ssr: false })`.
//
// WHY IT IS ITS OWN FILE AND ITS OWN COMPONENT (fold, MAJOR 2). The first cut
// reached pdfjs-dist through `await import()` inside an effect and claimed in a
// comment that this kept the library out of the server graph. IT DID NOT, and
// this PR's own measurement said so: Turbopack emitted a 433,095-byte SSR chunk
// beside the client one, because a "use client" component's module graph is
// still compiled for server rendering no matter where in the file the import
// sits. An `await` inside `useEffect` is a RUNTIME fact; bundling is a STATIC
// one, and only the bundler's own exclusion moves it.
//
// `next/dynamic` with `ssr: false` is that exclusion: the module is not part of
// the server render at all, so it does not enter the Worker script OpenNext
// builds. The delta is recorded in the PR body from two real builds.
//
// This component owns exactly one thing — turning a blob URL into a painted
// canvas in its own host node — and reports the page's intrinsic CSS size back
// so the caller has an initial scale estimate before its own ResizeObserver
// takes over.

import { useEffect, useRef } from "react";
import { renderPdfPageToCanvas } from "@/lib/documents/pdf-page-render";

export default function DocumentPdfPage({
  blobUrl,
  page,
  targetWidth,
  onSized,
  onFailed,
}: {
  blobUrl: string;
  page: number;
  /** The host's measured width at mount, used as the render resolution. The
   *  canvas is then laid out at 100% of its container (see the classes below),
   *  so a later resize re-lays it out correctly — only its sharpness is fixed
   *  at this number, never its geometry. */
  targetWidth: number;
  /** The page's intrinsic CSS size, for the caller's first scale estimate. */
  onSized: (width: number, height: number) => void;
  onFailed: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rendered = await renderPdfPageToCanvas(blobUrl, page, targetWidth);
        if (cancelled) return;
        // React does not own this node — pdf.js painted it — so it is attached
        // by hand, and the host is emptied first so a re-render never stacks
        // two pages.
        hostRef.current?.replaceChildren(rendered.canvas);
        onSized(rendered.cssWidth, rendered.cssHeight);
      } catch (e) {
        if (cancelled) return;
        onFailed(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; hostRef.current?.replaceChildren(); };
  }, [blobUrl, page, targetWidth, onSized, onFailed]);

  // `w-full` on the canvas, and the canvas carries NO inline pixel size (see
  // pdf-page-render.ts's own note): the page element and the polygon overlay
  // must be the SAME box, and the overlay is sized to this host. An inline
  // width would beat these classes and pin the canvas while the host moved.
  return <div ref={hostRef} className="[&>canvas]:block [&>canvas]:h-auto [&>canvas]:w-full" />;
}
