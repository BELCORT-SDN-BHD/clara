// @frozen — determinism-critical (Wave E lane zeta; design part2 §9's pin list, §10's determinism
// obligations).
//
// THE MANIFEST'S SECOND HALF. The database builds the pinned-INPUTS half
// (clara.render_request_manifest_v1) from facts no caller supplies. This module builds the
// ENVIRONMENT-AND-OUTPUT half — the renderer image digest, the source commit, the Node/OS/CPU and
// font-engine versions, the assembler version, the deterministic document metadata, and, after
// the render, the extracted-text hash + the extraction tool and the produced PDF hash — and
// assembles the two into what the seal receives.
//
// EVERY PIN IS REQUIRED AND NOTHING IS DEFAULTED. A pin with a fallback is not a pin: seven years
// from now, "unknown" in renderer_image_digest and a genuinely reproducible render look identical
// in the artifact, and only one of them can be re-rendered. So a missing environment value is a
// refusal here, exactly as a missing manifest key is a refusal at the seal.
//
// NO AMBIENT CLOCK, NO AMBIENT RANDOMNESS. Creation/modification timestamps and the PDF document
// id are DERIVED FROM THE MANIFEST — the reporting period's own end date and the canonical digest
// of the pinned inputs. Two runs of the same job therefore produce the same metadata, which is
// what makes double-render byte equality achievable at all.

import { canonicalJson, canonicalSha256 } from "./canonical-json.mjs";
import { RenderRefusal } from "./decisions.mjs";

/** Every environment pin §9 names, and the fact that each is mandatory, in one list. */
export const ENVIRONMENT_PIN_KEYS = Object.freeze([
  "assembler_version",
  "renderer_image_digest",
  "renderer_source_commit",
  "node_version",
  "os_version",
  "architecture",
  "font_engine_version",
]);

function requireNonEmptyString(value, key) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RenderRefusal("render_environment_pin_missing",
      `the renderer environment pin ${key} is absent or empty; a pin with a fallback is not a pin`,
      { key, value: value === undefined ? "(absent)" : value });
  }
  return value;
}

/**
 * The environment half, validated. `renderer_image_digest` must be a DIGEST (sha256:...), never a
 * tag: a tag is a moving pointer, and "re-render from the archived image" means nothing if the
 * name it was archived under now resolves elsewhere (§10).
 */
export function environmentPins(input) {
  const out = {};
  for (const key of ENVIRONMENT_PIN_KEYS) out[key] = requireNonEmptyString(input?.[key], key);
  if (!/^sha256:[0-9a-f]{64}$/.test(out.renderer_image_digest)) {
    throw new RenderRefusal("renderer_image_not_digest_pinned",
      "renderer_image_digest must be an image DIGEST (sha256:<64 hex>), never a tag",
      { renderer_image_digest: out.renderer_image_digest });
  }
  if (!/^[0-9a-f]{40}$/.test(out.renderer_source_commit)) {
    throw new RenderRefusal("renderer_source_commit_unreadable",
      "renderer_source_commit must be a full 40-character git object name",
      { renderer_source_commit: out.renderer_source_commit });
  }
  return out;
}

/**
 * SOURCE_DATE_EPOCH, derived. The reporting period's END date at 00:00:00 UTC — a fact of the
 * report, not of the machine that typeset it. This is what the layout engine is handed so that
 * whatever timestamp it bakes into the PDF is a function of the document, not of the calendar.
 */
export function sourceDateEpoch(requestManifest) {
  const end = requestManifest?.reporting_period?.period_end;
  if (typeof end !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new RenderRefusal("reporting_period_unreadable",
      "the request manifest carries no readable reporting period end date to derive a deterministic timestamp from",
      { period_end: end });
  }
  const epoch = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(epoch)) {
    throw new RenderRefusal("reporting_period_unreadable", "the reporting period end date is not a real date",
      { period_end: end });
  }
  return Math.floor(epoch / 1000);
}

/**
 * The deterministic Info dictionary + XMP inputs (§10's "normalized PDF metadata"). Determinism
 * comes from SOURCE_DATE_EPOCH, which is derived from the reporting period rather than a clock, so
 * two renders of the same request carry the same dates — and the drill's control arm proves that
 * pin is wired by changing the epoch and requiring the bytes to move.
 *
 * `title` is DB-OWNED and passed in from the resolved layout. This module will not invent one: a
 * statement's title is statutory wording or firm-published template text, and a renderer that
 * composed its own would be typing content into a report.
 */
export function documentMetadata({ requestManifest, title, uncertified, watermark }) {
  requireNonEmptyString(title, "document_title");
  const epoch = sourceDateEpoch(requestManifest);
  const iso = new Date(epoch * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  // ONLY WHAT THE PRODUCED FILE ACTUALLY CARRIES IS PINNED HERE (round 2). Earlier drafts also
  // pinned a `subject` and a derived `document_id`/`trailer_id`. The pinned engine (Typst 0.12.0)
  // can set title, author, keywords and a date, and has no facility for a PDF Subject or for the
  // trailer /ID — nothing in this package ever wrote them, and no post-processing step exists to.
  // So they were pins on values the artifact could not hold: the manifest would have described a
  // document that does not exist, and §7(d)'s cross-check could not have caught the disagreement
  // because it never looked at them. Removed rather than left as a claim nobody verifies.
  //
  // If the engine pin moves to >=0.13, `subject` comes back through `#set document(description:)`
  // and joins the checked set in lexicon.mjs; the trailer /ID would still need a post-processing
  // tool this image deliberately does not carry.
  return {
    title,
    // Author is the FIRM's published identity in the house style, not a person and not the
    // renderer. Producer/Creator name the pinned toolchain, which is already in the manifest.
    keywords: [
      `report_run:${requestManifest?.report_run_id ?? ""}`,
      `dataset:${requestManifest?.dataset_sha256 ?? ""}`,
      uncertified ? "uncertified" : "certified-eligible-checks",
      watermark ? "watermarked" : "unwatermarked",
    ].join(" "),
    creation_date_utc: iso,
    modification_date_utc: iso,
    source_date_epoch: epoch,
  };
}

/**
 * Assemble what the seal receives. The request half is copied VERBATIM — this function never
 * edits a pin, and clara.complete_render_job re-proves that key by key in the database.
 *
 * `render_manifest_sha256` is deliberately ABSENT: it is composed in the database at completion,
 * because the seal gate re-derives it from Postgres's own jsonb text form and asking Node to
 * reproduce that form exactly would make a cross-language match load-bearing for the seal.
 */
export function buildFinalManifest({ requestManifest, requestSha256, environment, documentMeta, outputs }) {
  if (typeof requestSha256 !== "string" || !/^[0-9a-f]{64}$/.test(requestSha256)) {
    throw new RenderRefusal("render_request_hash_mismatch",
      "the claimed job's request hash is missing or malformed", { request_sha256: requestSha256 });
  }
  // EPSILON'S REGISTERED SHAPE FOR `extraction_tool` IS `text`, NOT an object
  // (clara._report_manifest_key_shape, ε 0068). An earlier draft here emitted {name, version} and
  // would have been refused by the seal on EVERY artifact — caught by reading ε's shape table
  // rather than by a rig run, which is the whole reason the table was mirrored before the spike.
  // The two parts are still both REQUIRED; they are joined into one non-blank string, because a
  // version without its tool names nothing and a tool without its version is not a pin.
  const extraction = outputs?.extraction_tool;
  if (!extraction || typeof extraction.name !== "string" || typeof extraction.version !== "string"
      || extraction.name.trim() === "" || extraction.version.trim() === "") {
    throw new RenderRefusal("extraction_tool_unpinned",
      "the extraction tool's name and EXACT version are required beside the extracted-text hash; an unpinned extractor makes the scan's own result unrepeatable",
      { extraction_tool: extraction ?? "(absent)" });
  }
  const extractionText = `${extraction.name.trim()} ${extraction.version.trim()}`;
  if (typeof outputs?.extracted_text_sha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(outputs.extracted_text_sha256)) {
    throw new RenderRefusal("extracted_text_hash_missing",
      "the gate-3 extracted-text sha256 is required in the manifest",
      { extracted_text_sha256: outputs?.extracted_text_sha256 });
  }
  const final = {
    ...requestManifest,
    ...environment,
    document_metadata: documentMeta,
    extracted_text_sha256: outputs.extracted_text_sha256,
    extraction_tool: extractionText,
    render_request_sha256: requestSha256,
  };
  if (outputs.pre_sign_pdf_sha256 !== undefined) {
    final.pre_sign_pdf_sha256 = outputs.pre_sign_pdf_sha256;
  }
  return final;
}

/** The canonical form of the pinned request, for logging and for the double-render comparison. */
export function requestFingerprint(requestManifest) {
  return { canonical: canonicalJson(requestManifest), sha256: canonicalSha256(requestManifest) };
}
