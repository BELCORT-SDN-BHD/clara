// A one-shot render helper for packages/db/scripts/fa5-pr3-real-seal-drill.mjs's byte-reproduction
// arms (F-A5 PR-3). Runs INSIDE the clara-render docker image (the absolute /app/... import paths
// below are where the Dockerfile's COPY lands this package). Reads a JSON job description from
// argv[2], assembles + renders it with the SAME pure functions the production worker uses
// (lib/layout.mjs's assemble(), lib/engine.mjs's renderPdf()), writes the PDF bytes to argv[3],
// and prints {sha256, byteSize, typstLength} to stdout.
//
// DELIBERATELY DOES NOT TOUCH THE DB OR STORAGE. The drill's re-render arms replay an already-
// derived payload; claiming a queue row or fetching fonts by content hash is the WORKER's job
// (render-worker.mjs), already exercised for real earlier in the same drill run. This script is
// the engine half only -- the same split double-render-drill.mjs's own render() closure makes.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { assemble } from "/app/packages/reporting-render/lib/layout.mjs";
import { renderPdf } from "/app/packages/reporting-render/lib/engine.mjs";

const inputPath = process.argv[2];
const outPdfPath = process.argv[3];
if (!inputPath || !outPdfPath) {
  process.stderr.write("usage: node fa5-pr3-render-one.mjs <job.json> <out.pdf>\n");
  process.exit(1);
}
const job = JSON.parse(readFileSync(inputPath, "utf8"));

const assembled = assemble({
  layoutAst: job.layoutAst,
  payload: job.payload,
  decision: job.decision,
  style: job.style,
  fonts: job.fonts,
});

const bytes = await renderPdf({
  source: assembled.typst,
  fontDir: job.fontDir,
  sourceDateEpoch: job.sourceDateEpoch,
});

writeFileSync(outPdfPath, bytes);
const sha256 = createHash("sha256").update(bytes).digest("hex");
process.stdout.write(JSON.stringify({ sha256, byteSize: bytes.length, typstLength: assembled.typst.length }));
