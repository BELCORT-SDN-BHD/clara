// @frozen — determinism-critical + judgement logic (Wave E lane zeta, design part2 §7 gate 2,
// §10, §11's watermark point 3).
//
// THE RENDERER'S OWN GATES, as pure functions of a manifest. Every one of them is fail-closed and
// every one of them is testable without a database, a container or a PDF — which is the point:
// these are the decisions that say whether a document may exist and what it must say about
// itself, and a decision that can only be exercised by running the whole worker is a decision
// nobody exercises.
//
// THESE GATES ARE NOT THE AUTHORITY, AND SAYING SO MATTERS. The DATABASE refuses the seal
// (epsilon's gate 1, clara._seal_report_artifact_core): no assessment row, an unknown status,
// `failed` for a pre_sign, a draft definition, a missing manifest key. Nothing here can let a
// document past that. What these gates buy is a refusal BEFORE a render is spent, with a reason
// the operator can act on — and, for the watermark, a decision the database structurally cannot
// make for us, because it is about what gets drawn on the page.
//
// REASON TOKENS ARE SHARED VOCABULARY with the SQL side on purpose: a grep for
// `claim_status_unreadable` finds the DB refusal and this one, and they mean the same thing.

/** A typed, fail-closed refusal. `reason` is the stable token; `detail` is for humans. */
export class RenderRefusal extends Error {
  constructor(reason, message, detail = {}) {
    super(message);
    this.name = "RenderRefusal";
    this.reason = reason;
    this.detail = detail;
  }
}

export const CLAIM_STATES = Object.freeze(["eligible", "not_applicable", "stripped", "failed"]);
export const RENDERABLE_KINDS = Object.freeze(["draft_watermarked", "pre_sign"]);

// Mirrors clara._report_manifest_required_keys (epsilon file 4, V5). A MIRROR, NOT THE
// AUTHORITY — the seal recomputes this list in the database and refuses by name on a miss. The
// copy exists so the worker can refuse before spending a render, and zeta's unit battery asserts
// this array against the migration's own array so the two cannot drift silently.
export const REQUIRED_MANIFEST_KEYS_BASE = Object.freeze([
  "report_spec_version_id", "report_parameters",
  "statutory_profile_version_id", "statutory_profile_sha256", "statutory_wording_sha256",
  "house_style_version_id", "house_style_sha256", "chart_spec_version_ids", "chart_spec_sha256",
  "books_snapshot_id", "books_event_sequence",
  "dataset_id", "dataset_sha256",
  "applicability_receipts", "claim_assessment",
  "evaluator_versions", "definition_hashes",
  "assembler_version",
  "renderer_image_digest", "renderer_source_commit",
  "node_version", "os_version", "architecture", "font_engine_version",
  "asset_hashes",
  "locale", "timezone", "document_metadata",
  "render_manifest_sha256",
  "extracted_text_sha256", "extraction_tool",
  "uncertified",
]);

/** The required key list for an artifact kind. `render_manifest_sha256` is in the base list but
 *  is composed BY THE DATABASE at completion, so the worker's own preflight excludes it. */
export function requiredManifestKeys(kind) {
  if (kind === "draft_watermarked") return [...REQUIRED_MANIFEST_KEYS_BASE];
  if (kind === "pre_sign") return [...REQUIRED_MANIFEST_KEYS_BASE, "pre_sign_pdf_sha256"];
  // Fail closed. An unknown kind gets no key list it could satisfy.
  throw new RenderRefusal("render_kind_unknown", `artifact kind ${String(kind)} is not renderable`, { kind });
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * §7 GATE 2 — THE RENDER GATE. Read the claim status POSITIVELY. A missing key, a non-object
 * assessment, a non-string status, or a status outside the four ruled states is a refusal:
 * "nothing said this was stripped" is a derived state, not a read (Law 2).
 */
export function readClaimAssessment(manifest) {
  if (!isPlainObject(manifest)) {
    throw new RenderRefusal("render_manifest_unreadable", "the render manifest is not an object");
  }
  const a = manifest.claim_assessment;
  if (!isPlainObject(a)) {
    throw new RenderRefusal(
      "claim_status_unreadable",
      "the manifest carries no readable claim assessment",
      { claim_assessment: a === undefined ? "(absent)" : typeof a },
    );
  }
  const status = a.status;
  if (typeof status !== "string" || !CLAIM_STATES.includes(status)) {
    throw new RenderRefusal(
      "claim_status_unreadable",
      "the manifest's claim status is missing or is not one of the four ruled states",
      { status: status === undefined ? "(absent)" : status, ruled: CLAIM_STATES },
    );
  }
  // `claim_removed` is a positive statement about what the page will say. It must AGREE with the
  // status; a manifest that says "stripped" while claiming nothing was removed is two statements
  // about one fact, and disagreement refuses rather than picking a winner.
  const removed = a.claim_removed;
  if (typeof removed !== "boolean") {
    throw new RenderRefusal("claim_removed_unreadable",
      "the manifest's claim_removed flag is absent or not a boolean", { claim_removed: removed });
  }
  if (removed !== (status === "stripped")) {
    throw new RenderRefusal("claim_manifest_mismatch",
      "the manifest's claim_removed flag disagrees with its claim status",
      { status, claim_removed: removed });
  }
  return { status, claimRemoved: removed, id: a.id ?? null };
}

/**
 * §11 point 3 — THE UNCERTIFIED STAMP. It comes from the manifest flag, and its ABSENCE is a
 * refusal, never a default of false. Absence is not permission.
 */
export function readUncertified(manifest) {
  const flag = isPlainObject(manifest) ? manifest.uncertified : undefined;
  if (typeof flag !== "boolean") {
    throw new RenderRefusal(
      "uncertified_flag_unreadable",
      "the manifest's uncertified flag is absent or unreadable; absence is not permission to omit the stamp",
      { uncertified: flag === undefined ? "(absent)" : typeof flag },
    );
  }
  return flag;
}

/**
 * THE WHOLE RENDER DECISION, in one place.
 *
 * Returns what the renderer is allowed to draw:
 *   watermark          — stamp every page (a draft, an uncertified pack, or a failed run)
 *   issuable           — whether these bytes may become a pre_sign artifact
 *   claimPhraseAllowed — whether the compliance claim may appear AT ALL. Only `eligible` earns
 *                        it; `stripped` renders the pack WITHOUT the claim (it seals, it just
 *                        does not claim), and `failed`/`not_applicable` never claim.
 */
export function decideRender({ manifest, kind }) {
  if (!RENDERABLE_KINDS.includes(kind)) {
    throw new RenderRefusal("render_kind_unknown", `artifact kind ${String(kind)} is not renderable`,
      { kind, renderable: RENDERABLE_KINDS });
  }
  const claim = readClaimAssessment(manifest);
  const uncertified = readUncertified(manifest);

  if (kind === "pre_sign") {
    if (claim.status === "failed") {
      throw new RenderRefusal("claim_assessment_failed",
        "a failed claim assessment may render a watermarked draft, never a pre-sign artifact",
        { status: claim.status });
    }
    if (uncertified) {
      throw new RenderRefusal("draft_definition_in_dataset",
        "an uncertified dataset references a draft definition and can never be issued",
        { uncertified });
    }
  }
  return {
    kind,
    status: claim.status,
    claimAssessmentId: claim.id,
    watermark: kind === "draft_watermarked" || uncertified || claim.status === "failed",
    issuable: kind === "pre_sign",
    claimPhraseAllowed: claim.status === "eligible",
    uncertified,
  };
}

/**
 * THE PIN CHECK, worker-side. Every key of the job's request manifest must survive into the
 * final manifest with the same value. clara.complete_render_job repeats this in the database and
 * is the authority; this copy turns "the seal refused" into "you changed house_style_sha256"
 * before a container has spent two minutes typesetting.
 *
 * Compared through canonical JSON rather than by reference, so `[a,b]` and `[b,a]` are DIFFERENT
 * — an array whose order moved is a manifest that hashes differently.
 */
export function assertPinsIntact({ requestManifest, finalManifest, canonicalize }) {
  if (!isPlainObject(requestManifest) || !isPlainObject(finalManifest)) {
    throw new RenderRefusal("render_manifest_unreadable", "pin comparison needs two manifest objects");
  }
  for (const key of Object.keys(requestManifest)) {
    const want = canonicalize(requestManifest[key] ?? null);
    const got = canonicalize(finalManifest[key] ?? null);
    if (want !== got) {
      throw new RenderRefusal("render_pin_mutated",
        `the render manifest changed a pinned input (${key})`,
        { key, pinned: requestManifest[key], supplied: finalManifest[key] });
    }
  }
  return true;
}

/**
 * THE DB-DERIVED KEYS — the eleven values the DATABASE owns and the render side may CARRY but
 * never AUTHOR. Mirrored from clara._report_manifest_key_shape (ε 0068), where each maps to the
 * shape `db_derived`, and the validator SKIPS them outright (`if s = 'db_derived' then continue`).
 *
 * WHY THEY ARE EXEMPT FROM SHAPE VALIDATION RATHER THAN LENIENTLY SHAPED: they are compared
 * VALUE FOR VALUE against clara._report_render_pins_v1 at seal, which is a strictly stronger
 * check than any shape. That comparison also settles their NULLABILITY — statutory_profile_sha256
 * is null for a management pack because the pins function returns null for it, not because a null
 * was tolerated. So the worker must not second-guess these: a preflight that refused a null here
 * would refuse manifests the seal accepts, which is the same defect as green-lighting one it
 * rejects, pointed the other way.
 *
 * NOTE FOR ANYONE HOLDING THE EARLIER "class-licensed null" READING: ε did not ship a class
 * licence, and does not need one. Four of these eleven are legitimately null in ordinary cases —
 * statutory_profile_version_id and statutory_profile_sha256 for a management pack,
 * statutory_wording_sha256 when the run binds no profile, and chart_spec_sha256 when it binds no
 * chart ("an empty digest and 'no charts' are different statements", in ε's own words). A
 * two-key licence keyed on report_class would have refused the last two outright.
 */
export const DB_DERIVED_MANIFEST_KEYS = Object.freeze([
  "report_spec_version_id",
  "statutory_profile_version_id",
  "statutory_profile_sha256",
  "statutory_wording_sha256",
  "house_style_version_id",
  "house_style_sha256",
  "chart_spec_version_ids",
  "chart_spec_sha256",
  "books_snapshot_id",
  "dataset_id",
  "dataset_sha256",
]);

/**
 * The per-key shape table for everything the RENDER SIDE attests, mirrored from
 * clara._report_manifest_key_shape. A key with no registered shape is a refusal in ε and here:
 * the two rosters move together, and an unshaped key is one nobody decided about.
 */
export const MANIFEST_KEY_SHAPES = Object.freeze({
  report_parameters: "object",
  applicability_receipts: "object",
  claim_assessment: "object",
  evaluator_versions: "list",
  definition_hashes: "object",
  asset_hashes: "object",
  document_metadata: "object",
  signature_evidence: "evidence_object",
  books_event_sequence: "text",
  assembler_version: "text",
  renderer_source_commit: "text",
  node_version: "text",
  os_version: "text",
  architecture: "text",
  font_engine_version: "text",
  locale: "text",
  timezone: "text",
  extraction_tool: "text",
  renderer_image_digest: "image_digest",
  render_manifest_sha256: "sha256_hex",
  extracted_text_sha256: "sha256_hex",
  pre_sign_pdf_sha256: "sha256_hex",
  signed_original_pdf_sha256: "sha256_hex",
  uncertified: "boolean",
});

/** True iff `value` satisfies the named shape. Mirrors ε's `bad := case s …` arms exactly. */
export function matchesShape(value, shape) {
  switch (shape) {
    case "sha256_hex": return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
    case "image_digest": return typeof value === "string" && /^(sha256:)?[0-9a-f]{64}$/.test(value);
    case "text": return typeof value === "string" && value.trim() !== "";
    case "object": return isPlainObject(value);
    case "list": return Array.isArray(value) && value.length > 0;
    case "evidence_object": return isPlainObject(value) && Object.keys(value).length > 0;
    case "boolean": return typeof value === "boolean";
    default: return false; // an unregistered shape never passes
  }
}

/**
 * The worker's preflight: PRESENCE, then SHAPE. The DB refuses too and is the authority; this
 * copy turns a seal-time refusal into a pre-render one, before a container has spent two minutes
 * typesetting something that could never seal.
 *
 * A null is evidence of nothing — for every key the render side attests, it refuses. For the
 * eleven DB-derived keys nothing is checked here at all, on purpose: see above.
 */
export function assertRequiredKeys({ manifest, kind, composedByDatabase = ["render_manifest_sha256"] }) {
  const keys = requiredManifestKeys(kind).filter((k) => !composedByDatabase.includes(k));
  const missing = keys.filter((k) => !Object.prototype.hasOwnProperty.call(manifest ?? {}, k));
  if (missing.length > 0) {
    throw new RenderRefusal("manifest_key_missing",
      `the render manifest is missing ${missing.length} required key(s)`,
      { missing_keys: missing, kind });
  }
  const bad = [];
  for (const key of keys) {
    if (DB_DERIVED_MANIFEST_KEYS.includes(key)) continue;
    const shape = MANIFEST_KEY_SHAPES[key];
    if (!shape) {
      throw new RenderRefusal("manifest_shape_unregistered",
        `manifest key ${key} has no registered shape; the two rosters move together`, { key });
    }
    const value = manifest[key];
    if (value === null || value === undefined) {
      bad.push({ key, expected: shape, got: "null" });
    } else if (!matchesShape(value, shape)) {
      bad.push({ key, expected: shape, got: Array.isArray(value) ? "array" : typeof value });
    }
  }
  if (bad.length > 0) {
    throw new RenderRefusal("manifest_evidence_invalid",
      `${bad.length} manifest key(s) are not attested in their registered shape`,
      { invalid: bad, kind });
  }
  return true;
}

/**
 * A33 ARM (iii), worker-side. A completion that finds an artifact already sealed for this run is
 * NOT assumed to be a harmless duplicate: the hashes are compared. Equal is idempotent success;
 * different is a determinism failure and the loudest thing this lane can say.
 */
export function decideDuplicateCompletion({ sealedSha256, producedSha256 }) {
  if (typeof sealedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(sealedSha256)) {
    throw new RenderRefusal("render_output_conflict",
      "the already-sealed artifact's hash is unreadable, so no comparison is possible",
      { sealed_sha256: sealedSha256 });
  }
  if (sealedSha256 === producedSha256) return { outcome: "idempotent" };
  return {
    outcome: "conflict",
    refusal: new RenderRefusal("render_output_conflict",
      "this run already carries a DIFFERENT sealed artifact of this kind",
      { sealed_sha256: sealedSha256, produced_sha256: producedSha256 }),
  };
}

/** Bounded retry. Mirrors clara.fail_render_job so the worker's log and the row agree. */
export function decideRetry({ attempts, maxAttempts }) {
  const a = Number(attempts);
  const m = Number(maxAttempts);
  if (!Number.isFinite(a) || !Number.isFinite(m) || m <= 0) {
    // Unreadable bookkeeping is treated as terminal: retrying on an unknown budget is how a
    // poisoned job spins forever.
    return { disposition: "terminal", reason: "attempt_bookkeeping_unreadable" };
  }
  return a >= m ? { disposition: "terminal" } : { disposition: "retry" };
}
