// D2 — the pdf.js worker asset, byte-pinned against the installed library.
//
// `public/pdf.worker.min.mjs` is a COPY of
// `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, committed so the browser
// fetches it same-origin (`/pdf.worker.min.mjs`) instead of from a CDN — a
// third-party script executing over a client's documents is not something this
// product does, and the report-only CSP's `worker-src 'self' blob:` would
// report it anyway.
//
// A COPY WITH NO GUARD IS THE DEFECT THIS FILE EXISTS TO PREVENT. pdf.js
// refuses to run a worker built from a different version than the main library
// ("The API version does not match the Worker version"), and a `pnpm up` that
// moves `pdfjs-dist` while leaving this asset behind produces exactly that —
// silently, at runtime, in a browser, on the one surface nobody unit-tests.
// This is the same class as `bytes.test.ts`'s three-list MIME drift cell:
// spelling is not identity, so the bytes are compared, not the version string.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVED = join(WEB_ROOT, "public", "pdf.worker.min.mjs");

/** Resolved through Node's own resolver rather than a hand-written
 *  `node_modules/...` path: pnpm's store layout means the physical directory is
 *  not where a naive join would look, and a path that silently missed would
 *  turn this cell green against a file that does not exist. */
function installedWorkerPath(): string {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("pdfjs-dist/package.json", { paths: [WEB_ROOT] });
  return join(dirname(pkg), "build", "pdf.worker.min.mjs");
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("the served pdf.js worker is byte-identical to the installed pdfjs-dist build", () => {
  const installed = installedWorkerPath();

  // VACUITY CONTROLS. Both files must actually exist and be substantial — a
  // missing or empty file would otherwise make the hash comparison below
  // trivially true (two identical hashes of nothing).
  assert.ok(statSync(installed).size > 100_000, "the installed pdfjs-dist worker is implausibly small — the resolve found the wrong file");
  assert.ok(statSync(SERVED).size > 100_000, "public/pdf.worker.min.mjs is implausibly small or truncated");

  assert.equal(
    sha256(SERVED),
    sha256(installed),
    "public/pdf.worker.min.mjs has drifted from the installed pdfjs-dist build. " +
      "pdf.js refuses a worker whose version differs from the API's, so this fails in a browser and nowhere else. " +
      "Re-copy it: cp apps/web/node_modules/pdfjs-dist/build/pdf.worker.min.mjs apps/web/public/pdf.worker.min.mjs",
  );
});

test("the worker is served from public/ — never referenced from a CDN anywhere in apps/web", () => {
  // The other half of the same guarantee. The byte pin above is worthless if a
  // future edit points `GlobalWorkerOptions.workerSrc` at unpkg or cdnjs.
  const renderer = readFileSync(join(WEB_ROOT, "lib", "documents", "pdf-page-render.ts"), "utf8");
  assert.match(renderer, /workerSrc\s*=\s*"\/pdf\.worker\.min\.mjs"/, "the worker source must be the same-origin public/ path");
  assert.doesNotMatch(renderer, /https?:\/\/(?!.*\bdocumentation\b)[^\s"']*pdf\.worker/i, "no CDN URL may appear as a worker source");
});
