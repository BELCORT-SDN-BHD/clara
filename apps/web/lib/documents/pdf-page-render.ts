// D2 — the PDF half of the page-overlay viewer's page renderer.
//
// SPLIT OUT ON PURPOSE, and the split is the whole bundle strategy. Everything
// in this file is behind a DYNAMIC `import("pdfjs-dist")` inside an async
// function that only a browser event can reach, so:
//
//   * the library is a separate client chunk, fetched the first time a human
//     opens the overlay on a PDF and never on any other page of the app;
//   * it is NEVER in the server graph, so it does not enter the Worker script
//     OpenNext builds — the deployed Worker is unchanged in size by this file;
//   * the worker script ships from `public/` (same origin, `/pdf.worker.min.mjs`),
//     never from a CDN. `wrangler.jsonc`'s assets binding serves it, and the
//     report-only CSP's `worker-src 'self' blob:` admits exactly that.
//
// THE MEASUREMENT is recorded in the PR body: the client chunk delta from
// adding pdfjs-dist, taken from two real `next build` runs.
//
// There is NO server-side page-image endpoint anywhere in packages/runtime —
// `documentRoutes.ts:50` streams the ORIGINAL bytes and nothing else — so
// rendering a page has to happen in the browser. That is not a preference; it
// is the only place the bytes are decodable.

/** What one rendered PDF page hands back to the overlay: the pixels, and the
 *  page's own size in CSS pixels so the geometry module can scale polygons into
 *  it. `pageCount` comes from the document, never from a region list. */
export type RenderedPdfPage = {
  canvas: HTMLCanvasElement;
  cssWidth: number;
  cssHeight: number;
  pageCount: number;
};

/**
 * Renders one page of a PDF (1-based, matching Azure's `pageNumber` and
 * therefore the locator's `page`) into a detached `<canvas>` at `targetWidth`
 * CSS pixels.
 *
 * Rendered at `devicePixelRatio` so the page is not soft on a retina display,
 * with the CSS size held at `targetWidth` — the overlay's polygons are scaled
 * against the CSS size, so the two must not be conflated.
 *
 * Throws on anything pdf.js throws (an encrypted file, a corrupt byte stream, a
 * page number past the end). The caller renders the honest failure; this
 * function never returns a blank canvas that would look like an empty page.
 */
export async function renderPdfPageToCanvas(
  blobUrl: string,
  pageNumber: number,
  targetWidth: number,
): Promise<RenderedPdfPage> {
  const pdfjs = await import("pdfjs-dist");

  // Same-origin, from public/. A CDN worker would be a third-party script
  // executing over client documents — refused by the CSP and by the product.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // The LOADING TASK, kept — `destroy()` lives on the task, not on the
  // document proxy (pdfjs-dist types/src/display/api.d.ts:860 vs :1461), and
  // it is what tears down the worker. Calling it is not optional: without it
  // every open of the overlay leaves a parsed PDF and a live worker for as
  // long as the tab lives.
  const loadingTask = pdfjs.getDocument({ url: blobUrl });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const cssScale = targetWidth / base.width;
    const dpr = typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const viewport = page.getViewport({ scale: cssScale * dpr });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const cssWidth = viewport.width / dpr;
    const cssHeight = viewport.height / dpr;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("2d canvas context is unavailable");
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    return { canvas, cssWidth, cssHeight, pageCount: doc.numPages };
  } finally {
    void loadingTask.destroy();
  }
}
