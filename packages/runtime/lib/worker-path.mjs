// Resolve a worker module that ships in packages/runtime/lib.
//
// WHY THIS EXISTS — a live defect found by the first XML ever ingested (Gate S, 2026-07-28).
// Both worker-spawning modules used the natural idiom:
//
//     new Worker(new URL("./structured-worker.mjs", import.meta.url), …)
//
// which is correct from SOURCE and wrong in the DEPLOYED image. Nitro INLINES
// lib/structured.mjs and lib/local-facts.mjs into .output/server/index.mjs, so `import.meta.url`
// becomes the bundle's and the sibling URL resolves to `.output/server/structured-worker.mjs` —
// a path the Dockerfile never writes (it copies packages/runtime/lib to /app/lib). The Worker
// constructor then emitted ERR_MODULE_NOT_FOUND, structured.mjs mapped that to code:'internal',
// and the task failed with no usable cause anywhere. `structured_parse` had never once succeeded
// in production — its only lifetime execution was the ingest that exposed this.
//
// THE WORKER MUST STAY IN lib/. It imports ./scan.mjs and ./myinvois.mjs as siblings, and
// myinvois-ubl.mjs reaches fast-xml-parser by upward node_modules resolution. Copying it beside
// the bundle would only move the same failure one import deeper.
//
// WHY IT PROBES THE FILESYSTEM rather than picking a layout: the two layouts are both legitimate
// and the module cannot know which one it was loaded under — from source `import.meta.url` is the
// real file, from the bundle it is a path that never existed. Probing is what makes one
// expression correct in both, and the RIG runs the source layout while production runs the
// bundled one, so a test that passes locally is otherwise no evidence at all about the image.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Where a lib-resident worker can legitimately live, most specific first.
 *  Exported so a test can assert the candidate ORDER without touching a filesystem. */
export function libWorkerCandidates(name, importerUrl) {
  const out = [];
  // An explicit deployment anchor always wins, so an image with an unexpected layout can be
  // corrected by configuration rather than by a code change.
  const envDir = process.env.CLARA_LIB_DIR;
  if (envDir) out.push(pathToFileURL(join(envDir, name)).href);
  // Source layout: the importer really is packages/runtime/lib/<something>.mjs.
  out.push(new URL(`./${name}`, importerUrl).href);
  // Deployed layout: the importer was inlined into <root>/.output/server/index.mjs, and the
  // Dockerfile put the lib tree at <root>/lib.
  out.push(new URL(`../../lib/${name}`, importerUrl).href);
  return out;
}

/**
 * The URL of a lib-resident worker module, verified to exist.
 *
 * Throws — naming every path it tried — rather than handing back a URL that will fail inside the
 * Worker constructor. That is the whole point: the original defect was invisible precisely
 * because the failure surfaced far from its cause, as a bare `internal` on a task row.
 */
export function resolveLibWorker(name, importerUrl) {
  const tried = [];
  for (const href of libWorkerCandidates(name, importerUrl)) {
    let path;
    try {
      path = fileURLToPath(href);
    } catch {
      continue; // not a file: URL — cannot host a worker
    }
    tried.push(path);
    if (existsSync(path)) return new URL(href);
  }
  throw Object.assign(
    new Error(`worker module '${name}' is missing from every known layout; tried: ${tried.join(" | ")}`),
    { code: "internal" },
  );
}
