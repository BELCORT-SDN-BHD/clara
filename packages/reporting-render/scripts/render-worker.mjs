// clara-render — the render worker's main loop (Wave E lane ζ; design part2 §10).
//
// A BATCH JOB, NOT A SERVER. It boots, drains whatever the queue holds, and exits — the
// packages/backup shape exactly. It listens on no port, accepts no inbound connection, and dials
// out to exactly two places: Postgres and object storage.
//
// CONCURRENCY 1 IN V1 (§10). One job at a time, one short-lived DSN session per job. That is what
// keeps the pooler commitment honest ("adds no standing sessions; peak adds 1").
//
// THE ORDER IS THE DESIGN'S, AND IT ONLY LOOKS CIRCULAR UNTIL YOU READ IT (§9): the PDF bytes are
// produced -> the pinned extractor reads them -> the gate-3 scan runs over that extraction -> the
// extraction's hash and the tool version JOIN the manifest -> the manifest is sealed. The scan
// therefore runs strictly BEFORE the seal and its output is an INPUT to the seal.
//
// EVERY FAILURE IS RECORDED ON THE JOB. A worker that dies silently leaves a lease to expire and
// the job returns to claimable; a worker that REFUSES writes the reason to the row, so the
// difference between "nothing happened" and "we refused, and here is why" is readable in SQL.

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { arch, platform, release, version as osVersion } from "node:os";
import { join } from "node:path";

import { bytesSha256, canonicalSha256 } from "../lib/canonical-json.mjs";
import { RenderRefusal, assertRequiredKeys, decideRender } from "../lib/decisions.mjs";
import { scanFinalArtifact } from "../lib/lexicon.mjs";
import { assemble } from "../lib/layout.mjs";
import { buildFinalManifest, documentMetadata, environmentPins, sourceDateEpoch } from "../lib/manifest.mjs";
import { ENGINE_NAME, engineVersion, renderPdf } from "../lib/engine.mjs";
import { EXTRACTOR_NAME, extractMetadata, extractText, extractorVersion } from "../lib/extract.mjs";
import { claimJob, completeJob, failJob, jobPayload, leaseAlive, withSession } from "../lib/db.mjs";
import { fetchFonts } from "../lib/fonts.mjs";
import { putAndVerify, stageBytes } from "../lib/objects.mjs";

const WORKER_ID = process.env.CLARA_RENDER_WORKER_ID || `clara-render:${randomUUID()}`;
const LEASE_SECONDS = Number(process.env.CLARA_RENDER_LEASE_SECONDS || 1200);
const MAX_JOBS = Number(process.env.CLARA_RENDER_MAX_JOBS || 25);
// NB: there is deliberately NO image-wide font directory. Fonts are fetched per job by content
// hash into that job's own temp dir (see runOneJob), and the engine is pointed at THAT. A
// long-lived shared font directory would be a place fonts could accumulate outside content
// addressing — which is the system-font hazard wearing a different path.

function log(msg) {
  // No timestamp: the machine's log already carries one, and a second clock in the line would be
  // the only nondeterministic thing this process prints.
  process.stdout.write(`clara-render: ${msg}\n`);
}

/** The environment half of the manifest, measured once per boot. Every value is REQUIRED. */
async function measureEnvironment() {
  const engine = await engineVersion();
  const extractor = await extractorVersion();
  const pins = environmentPins({
    assembler_version: process.env.CLARA_RENDER_ASSEMBLER_VERSION || "clara.reporting-render/v1",
    renderer_image_digest: process.env.CLARA_RENDER_IMAGE_DIGEST,
    renderer_source_commit: process.env.CLARA_RENDER_SOURCE_COMMIT,
    node_version: process.version,
    os_version: `${platform()} ${release()} ${osVersion()}`,
    architecture: arch(),
    font_engine_version: `${ENGINE_NAME} ${engine}`,
  });
  return { pins, extractor: { name: EXTRACTOR_NAME, version: extractor } };
}

/** Build the payload shape layout.mjs consumes from what clara.render_job_payload returned. */
function shapePayload(p, documentMeta) {
  const metricsByKey = {};
  for (const pt of p.dataset_points ?? []) {
    metricsByKey[pt.series_key] = {
      point_status: pt.point_status,
      displayed_text: pt.displayed_text,
      displayed_scale: pt.dimensions?.displayed_scale,
      // CARRIED VERBATIM, NEVER AUTHORED (codex M4). An earlier draft substituted "n/a" when the
      // sealed token was missing, which meant a payload or schema regression could change what a
      // statement SAYS about a missing figure without changing a single sealed byte — the worker
      // writing disclosure language is exactly what E-R8 and the manifest rulings forbid. ε now
      // seals dimensions.na_label from δ's own display_token (null for an ok cell), so a non-ok
      // point with no label is a defect upstream; layout.mjs refuses it rather than inventing one.
      na_label: pt.dimensions?.na_label ?? null,
      cell_id: pt.cell_id,
    };
  }
  const wordingByKey = {};
  for (const w of p.statutory_wording ?? []) wordingByKey[w.wording_key] = w.wording_text;
  const chartsByKey = {};
  for (const c of p.chart_datasets ?? []) {
    chartsByKey[String(c.chart_spec_version_id)] = {
      chart_spec_version_id: c.chart_spec_version_id,
      axis_policy: c.axis_policy,
      manual_bounds: c.chart_spec_ast?.manual_bounds ?? null,
      points: c.points ?? [],
      // Carried from the SEALED dataset, never re-resolved here (ε B5). `?? []` is not a default
      // that hides an absence: the DB column is `not null default '[]'` so an absent array means
      // the payload itself is malformed, and chart.mjs refuses on a non-array rather than
      // treating it as "no thresholds".
      resolved_thresholds: c.resolved_thresholds,
    };
  }
  // Protected placeholder VALUES come from the request manifest and the payload — DB values only.
  // There is no user- or model-supplied string anywhere in this map, which is what makes the
  // gate-3 cross-check meaningful rather than circular.
  const placeholderValues = {};
  for (const pp of p.protected_placeholders ?? []) {
    const source = pp.placeholder_key;
    const resolved = p.request_manifest?.report_parameters?.[source]
      ?? p.request_manifest?.reporting_period?.[source]
      ?? null;
    if (resolved !== null && resolved !== undefined) placeholderValues[source] = String(resolved);
  }
  return { metricsByKey, wordingByKey, chartsByKey, placeholderValues, noteLabels: {}, documentMeta };
}

async function runOneJob(client, job, env) {
  const jobId = job.render_job_id;
  const request = job.request_manifest;
  const decision = decideRender({ manifest: request, kind: job.kind });
  const payload = await jobPayload(client, jobId, WORKER_ID);
  if (!payload) {
    throw new RenderRefusal("render_payload_absent", "the database returned no payload for a job this worker holds", { jobId });
  }

  const documentMeta = documentMetadata({
    requestManifest: request,
    title: payload.style_spec?.document_title ?? payload.layout_ast?.sections?.[0]?.section_key ?? "Financial statements",
    uncertified: decision.uncertified,
    watermark: decision.watermark,
  });

  const assembled = assemble({
    layoutAst: payload.layout_ast,
    payload: shapePayload(payload, documentMeta),
    decision,
    style: payload.style_spec ?? {},
    fonts: payload.asset_manifest?.fonts ?? [],
  });

  const dir = await mkdtemp(join(tmpdir(), "clara-render-job-"));
  try {
    // FONTS ARE FETCHED PER JOB, BY CONTENT HASH, into this job's own directory. Per job rather
    // than once per boot because the house style is a property of the RUN — two jobs in one drain
    // can belong to different firms with different typefaces, and a shared directory would let the
    // first job's fonts satisfy the second job's engine invocation. That is precisely the silent
    // substitution the content addressing exists to prevent.
    const fontDir = join(dir, "fonts");
    const fonts = await fetchFonts({
      firmId: job.firm_id,
      assetManifest: payload.asset_manifest,
      fontDir,
    });
    log(`job=${jobId} fonts=${fonts.map((f) => `${f.family}@${f.sha256.slice(0, 12)}`).join(" ")}`);

    // FENCE 1 — BEFORE THE EXPENSIVE STEP. The leader's sweep parks an at-cap job `failed` as soon
    // as its lease is dead — immediately, with no grace margin — and a legitimately slow render is
    // the likeliest reason its own lease died. There is no window in which this worker is safe to
    // keep going: typesetting after losing the job spends money on bytes the seal will refuse (a
    // completion needs a LIVE lease). So the worker asks whether it still holds the row and abandons
    // if it does not — WITHOUT calling fail_render_job, because a worker that no longer holds the
    // lease has no authority to write that row's outcome (the stale-authority defect M1 closed).
    if (!(await leaseAlive(client, jobId, WORKER_ID))) {
      log(`job=${jobId} ABANDONED before render: the lease is no longer ours (reaped or reclaimed)`);
      return { abandoned: true };
    }
    const bytes = await renderPdf({
      source: assembled.typst,
      fontDir,
      sourceDateEpoch: sourceDateEpoch(request),
    });
    const pdfPath = join(dir, "artifact.pdf");
    await stageBytes(pdfPath, bytes);
    const sha256 = bytesSha256(bytes);

    // --- §7 gate 3, over the FINAL BYTES, before anything is sealed.
    const text = await extractText(pdfPath);
    const metadata = await extractMetadata(pdfPath);
    const scan = scanFinalArtifact({
      text,
      metadata,
      lexicon: payload.claim_phrase_lexicon,
      claimPhraseAllowed: decision.claimPhraseAllowed,
      resolvedPlaceholders: assembled.resolvedPlaceholders,
      // The manifest's pinned metadata is cross-checked against what the PDF actually carries,
      // not merely recorded beside it (codex M11).
      documentMeta,
    });
    const extractedTextSha256 = bytesSha256(Buffer.from(text, "utf8"));

    const finalManifest = buildFinalManifest({
      requestManifest: request,
      requestSha256: job.manifest_sha256,
      environment: env.pins,
      documentMeta: { ...documentMeta, scan_receipt: scan, chart_receipts: assembled.chartReceipts },
      outputs: {
        extracted_text_sha256: extractedTextSha256,
        extraction_tool: env.extractor,
        ...(job.kind === "pre_sign" ? { pre_sign_pdf_sha256: sha256 } : {}),
      },
    });
    assertRequiredKeys({ manifest: finalManifest, kind: job.kind });

    // FENCE 2 — BEFORE UPLOAD AND SEAL. The render is done and cost what it cost; what must not
    // happen now is a write against a row this worker no longer holds. Checked here rather than
    // relying on complete_render_job's own liveness refusal, because that refusal arrives AFTER the
    // object has been PUT into storage — and the storage key is content-addressed and
    // overwrite-impossible, so a stranded object is the one part of this that cannot be undone.
    if (!(await leaseAlive(client, jobId, WORKER_ID))) {
      log(`job=${jobId} ABANDONED before upload: the lease is no longer ours; the rendered bytes are discarded rather than stored`);
      return { abandoned: true };
    }

    // --- custody BEFORE the seal: the registry row must never point at an object that is not
    // there. The PUT is overwrite-impossible and the read-back re-hashes it.
    const stored = await putAndVerify({ filePath: pdfPath, firmId: job.firm_id, sha256 });

    const sealed = await completeJob(client, {
      jobId, workerId: WORKER_ID, sha256, byteSize: bytes.length, manifest: finalManifest,
    });
    log(`job=${jobId} kind=${job.kind} sealed artifact=${sealed?.report_artifact_id} sha256=${sha256}`
      + ` object=${stored.created ? "created" : "already-present"}`
      + ` reuse=${sealed?.idempotent_reuse === true} waited_ms=${job.claim_delay_ms ?? "?"}`
      + ` manifest_fingerprint=${canonicalSha256(request).slice(0, 12)}`);
    return { sealed: true };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const env = await measureEnvironment();
  log(`worker=${WORKER_ID} engine=${env.pins.font_engine_version} extractor=${env.extractor.name} ${env.extractor.version}`);
  let done = 0;
  let refused = 0;
  let abandoned = 0;
  for (let i = 0; i < MAX_JOBS; i++) {
    const finished = await withSession(async (client) => {
      const job = await claimJob(client, WORKER_ID, LEASE_SECONDS);
      if (!job) return true; // nothing claimable — drained
      try {
        const result = await runOneJob(client, job, env);
        // ABANDONED IS NOT SEALED, and it is not a refusal either. A fenced worker lost its lease
        // mid-job: it wrote nothing, it owes the row nothing, and counting it as a seal would make
        // the drain's own log claim an artifact that does not exist.
        if (result?.abandoned) abandoned += 1;
        else done += 1;
      } catch (err) {
        refused += 1;
        const reason = err instanceof RenderRefusal
          ? { reason: err.reason, message: err.message, detail: err.detail }
          : { reason: "render_worker_error", message: String(err?.message ?? err) };
        // The reason lands on the ROW. A refusal nobody can read in SQL is a refusal that looks
        // exactly like a machine that never ran.
        await failJob(client, { jobId: job.render_job_id, workerId: WORKER_ID, reason }).catch((e) => {
          log(`job=${job.render_job_id} could not record its failure: ${e?.message ?? e}`);
        });
        log(`job=${job.render_job_id} REFUSED ${reason.reason}: ${reason.message}`);
      }
      return false;
    });
    if (finished) break;
  }
  log(`DONE — sealed=${done} refused=${refused} abandoned=${abandoned}`);
  // A refusal is a legitimate outcome of a run (a failed claim assessment, an unresolvable pin),
  // not a crash: exit 0 so the scheduled machine's restart policy does not spin on it. The
  // refusals are on the rows, which is where an operator looks.
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  log(`FATAL ${err?.message ?? err}`);
  process.exit(1);
});
