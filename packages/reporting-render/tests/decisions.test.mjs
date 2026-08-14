// Lane ζ unit battery — the render gates. NO database, NO container, NO Fly, NO PDF.
//
// These are the decisions that say whether a document may exist and what it must say about
// itself. Every case below is a REFUSAL case or a boundary; the happy path is one test, because
// the happy path is not what this file is for.

import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import { test } from "node:test";

import {
  DB_DERIVED_MANIFEST_KEYS,
  MANIFEST_KEY_SHAPES,
  RenderRefusal,
  assertPinsIntact,
  assertRequiredKeys,
  decideDuplicateCompletion,
  decideRender,
  decideRetry,
  matchesShape,
  readClaimAssessment,
  readUncertified,
  requiredManifestKeys,
} from "../lib/decisions.mjs";
import { canonicalJson } from "../lib/canonical-json.mjs";

const base = (over = {}) => ({
  claim_assessment: { id: "a1", status: "eligible", claim_removed: false },
  uncertified: false,
  ...over,
});

function refusalReason(fn) {
  try {
    fn();
  } catch (err) {
    ok(err instanceof RenderRefusal, `expected a RenderRefusal, got ${err?.name}: ${err?.message}`);
    return err.reason;
  }
  throw new Error("expected a refusal, got success");
}

// --- §7 gate 2: the claim status must be READ, never derived ------------------------------

test("an absent claim_assessment refuses — 'nothing said stripped' is not a read", () => {
  strictEqual(refusalReason(() => readClaimAssessment({ uncertified: false })), "claim_status_unreadable");
});

test("a non-object claim_assessment refuses", () => {
  strictEqual(refusalReason(() => readClaimAssessment({ claim_assessment: "eligible" })), "claim_status_unreadable");
});

test("a status outside the four ruled states refuses, even one that looks benign", () => {
  for (const status of ["ok", "passed", "ELIGIBLE", "", null, 3]) {
    strictEqual(
      refusalReason(() => readClaimAssessment(base({ claim_assessment: { status, claim_removed: false } }))),
      "claim_status_unreadable",
      `status ${JSON.stringify(status)} should refuse`,
    );
  }
});

test("all four ruled states are readable", () => {
  for (const status of ["eligible", "not_applicable", "stripped", "failed"]) {
    const read = readClaimAssessment(base({
      claim_assessment: { id: "a", status, claim_removed: status === "stripped" },
    }));
    strictEqual(read.status, status);
  }
});

test("claim_removed must agree with the status — disagreement refuses rather than picking a winner", () => {
  strictEqual(
    refusalReason(() => readClaimAssessment(base({ claim_assessment: { status: "stripped", claim_removed: false } }))),
    "claim_manifest_mismatch",
  );
  strictEqual(
    refusalReason(() => readClaimAssessment(base({ claim_assessment: { status: "eligible", claim_removed: true } }))),
    "claim_manifest_mismatch",
  );
});

test("an absent claim_removed flag refuses — it is a positive statement about the page", () => {
  strictEqual(
    refusalReason(() => readClaimAssessment({ claim_assessment: { status: "eligible" } })),
    "claim_removed_unreadable",
  );
});

// --- §11 point 3: the uncertified stamp -----------------------------------------------------

test("an absent uncertified flag refuses — absence is not permission to omit the stamp", () => {
  strictEqual(refusalReason(() => readUncertified({})), "uncertified_flag_unreadable");
  strictEqual(refusalReason(() => readUncertified({ uncertified: "false" })), "uncertified_flag_unreadable");
  strictEqual(refusalReason(() => readUncertified({ uncertified: 0 })), "uncertified_flag_unreadable");
});

test("a readable false is permission; a readable true is the stamp", () => {
  strictEqual(readUncertified({ uncertified: false }), false);
  strictEqual(readUncertified({ uncertified: true }), true);
});

// --- the whole render decision --------------------------------------------------------------

test("an eligible, certified pre_sign renders unwatermarked and may carry the claim", () => {
  const d = decideRender({ manifest: base(), kind: "pre_sign" });
  deepStrictEqual(
    { watermark: d.watermark, issuable: d.issuable, claim: d.claimPhraseAllowed },
    { watermark: false, issuable: true, claim: true },
  );
});

test("a failed run may render a watermarked draft but NEVER a pre_sign", () => {
  const manifest = base({ claim_assessment: { id: "a", status: "failed", claim_removed: false } });
  strictEqual(refusalReason(() => decideRender({ manifest, kind: "pre_sign" })), "claim_assessment_failed");
  const draft = decideRender({ manifest, kind: "draft_watermarked" });
  strictEqual(draft.watermark, true);
  strictEqual(draft.claimPhraseAllowed, false);
});

test("an uncertified dataset can never be issued, and its draft is watermarked", () => {
  const manifest = base({ uncertified: true });
  strictEqual(refusalReason(() => decideRender({ manifest, kind: "pre_sign" })), "draft_definition_in_dataset");
  strictEqual(decideRender({ manifest, kind: "draft_watermarked" }).watermark, true);
});

test("a STRIPPED pack seals and renders — it simply may not carry the claim", () => {
  const manifest = base({ claim_assessment: { id: "a", status: "stripped", claim_removed: true } });
  const d = decideRender({ manifest, kind: "pre_sign" });
  strictEqual(d.issuable, true, "stripped seals — it never blocks generation");
  strictEqual(d.claimPhraseAllowed, false, "stripped renders WITHOUT the compliance claim");
  strictEqual(d.watermark, false, "stripped is not a draft");
});

test("not_applicable seals and does not claim", () => {
  const d = decideRender({
    manifest: base({ claim_assessment: { id: "a", status: "not_applicable", claim_removed: false } }),
    kind: "pre_sign",
  });
  strictEqual(d.issuable, true);
  strictEqual(d.claimPhraseAllowed, false);
});

test("a signed original is not a renderable kind — it is retained and retrieved, never regenerated", () => {
  strictEqual(refusalReason(() => decideRender({ manifest: base(), kind: "signed_original" })), "render_kind_unknown");
  strictEqual(refusalReason(() => requiredManifestKeys("signed_original")), "render_kind_unknown");
});

// --- the pin check ---------------------------------------------------------------------------

test("a manifest that edits a pinned input refuses, and NAMES the key", () => {
  const requestManifest = { dataset_sha256: "aa", house_style_sha256: "bb" };
  const finalManifest = { dataset_sha256: "aa", house_style_sha256: "CHANGED", node_version: "v20" };
  try {
    assertPinsIntact({ requestManifest, finalManifest, canonicalize: canonicalJson });
    throw new Error("expected a refusal");
  } catch (err) {
    strictEqual(err.reason, "render_pin_mutated");
    strictEqual(err.detail.key, "house_style_sha256");
  }
});

test("adding environment keys is allowed; the request half must survive verbatim", () => {
  const requestManifest = { dataset_sha256: "aa", chart_spec_version_ids: ["x", "y"] };
  const finalManifest = { ...requestManifest, node_version: "v20.19.5", architecture: "x64" };
  ok(assertPinsIntact({ requestManifest, finalManifest, canonicalize: canonicalJson }));
});

test("REORDERING an array is a mutation — an array whose order moved hashes differently", () => {
  const requestManifest = { chart_spec_version_ids: ["x", "y"] };
  const finalManifest = { chart_spec_version_ids: ["y", "x"] };
  strictEqual(
    refusalReason(() => assertPinsIntact({ requestManifest, finalManifest, canonicalize: canonicalJson })),
    "render_pin_mutated",
  );
});

// --- the required-key preflight ---------------------------------------------------------------

test("the preflight names every missing key, and excludes the one the DATABASE composes", () => {
  try {
    assertRequiredKeys({ manifest: { locale: "en" }, kind: "pre_sign" });
    throw new Error("expected a refusal");
  } catch (err) {
    strictEqual(err.reason, "manifest_key_missing");
    ok(err.detail.missing_keys.includes("pre_sign_pdf_sha256"));
    ok(err.detail.missing_keys.includes("extracted_text_sha256"));
    ok(!err.detail.missing_keys.includes("render_manifest_sha256"),
      "render_manifest_sha256 is composed in the database at completion, not by the worker");
    ok(!err.detail.missing_keys.includes("locale"));
  }
});

// === THE SHAPE TABLE, MIRRORED FROM ε's BYTES =================================================
//
// Read from clara._report_manifest_key_shape / _validate_report_manifest_shapes_v1 on ε's pushed
// branch — NOT from the design and NOT from a relay. The model is: eleven DB-derived keys are
// SKIPPED entirely (their correctness is the value-for-value pins comparison at seal, which is
// strictly stronger than any shape), and every key the render side attests is shape-checked with
// null always a refusal.
//
// This replaces an earlier "class-licensed null" reading. ε shipped no class licence and needs
// none: four of the eleven are legitimately null in ordinary cases, two of them for reasons that
// have nothing to do with report_class, so a two-key class licence would have refused manifests
// the seal accepts.

/** A manifest whose ATTESTED keys are all shape-valid; the DB-derived eleven left null. */
const shapedManifest = (over = {}) => {
  const m = {};
  for (const k of requiredManifestKeys("pre_sign")) {
    if (k === "render_manifest_sha256") continue;
    if (DB_DERIVED_MANIFEST_KEYS.includes(k)) { m[k] = null; continue; }
    switch (MANIFEST_KEY_SHAPES[k]) {
      case "sha256_hex": m[k] = "a".repeat(64); break;
      case "image_digest": m[k] = `sha256:${"b".repeat(64)}`; break;
      case "list": m[k] = [{ evaluator_version_id: "e1" }]; break;
      case "object": m[k] = { any: "thing" }; break;
      case "evidence_object": m[k] = { signed: true }; break;
      case "boolean": m[k] = false; break;
      default: m[k] = "non-blank"; break;
    }
  }
  return { ...m, ...over };
};

test("ALL ELEVEN db_derived keys may be null — their nullability is settled by the pins comparison", () => {
  ok(assertRequiredKeys({ manifest: shapedManifest(), kind: "pre_sign" }));
  strictEqual(DB_DERIVED_MANIFEST_KEYS.length, 11);
  // The four that are legitimately null in ordinary runs, and why a class licence was the wrong
  // shape: only the first two have anything to do with report_class.
  for (const k of ["statutory_profile_version_id", "statutory_profile_sha256",
    "statutory_wording_sha256", "chart_spec_sha256"]) {
    ok(DB_DERIVED_MANIFEST_KEYS.includes(k), `${k} must be db_derived`);
  }
});

test("an ATTESTED key that is null REFUSES — a null is evidence of nothing", () => {
  for (const key of ["extracted_text_sha256", "renderer_image_digest", "assembler_version",
    "evaluator_versions", "definition_hashes", "uncertified"]) {
    try {
      assertRequiredKeys({ manifest: shapedManifest({ [key]: null }), kind: "pre_sign" });
      throw new Error(`expected a refusal for a null ${key}`);
    } catch (err) {
      strictEqual(err.reason, "manifest_evidence_invalid");
      ok(err.detail.invalid.some((b) => b.key === key && b.got === "null"),
        `${key} must be named in the refusal`);
    }
  }
});

test("each registered shape is enforced as ε enforces it", () => {
  // NB: `kind` is pre_sign throughout, because ζ has no signed_original arm at all — a signed
  // original is retained and retrieved, never rendered — so signature_evidence never reaches this
  // worker's preflight. Its shape is still mirrored in the table for completeness with ε's.
  const wrong = {
    extracted_text_sha256: "not-hex",
    renderer_image_digest: "registry.fly.io/clara-render:latest",
    assembler_version: "   ",
    evaluator_versions: [],
    definition_hashes: ["an", "array"],
    document_metadata: "a string, not an object",
    uncertified: "false",
  };
  for (const [key, value] of Object.entries(wrong)) {
    const manifest = shapedManifest({ [key]: value });
    try {
      assertRequiredKeys({ manifest, kind: "pre_sign" });
      throw new Error(`expected a refusal for a malformed ${key}`);
    } catch (err) {
      strictEqual(err.reason, "manifest_evidence_invalid", `${key} should be refused`);
      ok(err.detail.invalid.some((b) => b.key === key), `${key} must be named`);
    }
  }
  // The evidence_object arm is unreachable from ζ's kinds, so it is exercised directly.
  ok(!matchesShape({}, "evidence_object"));
  ok(matchesShape({ signed: true }, "evidence_object"));
});

test("an image digest is accepted BARE or sha256-prefixed — ε's regex allows both", () => {
  ok(matchesShape("c".repeat(64), "image_digest"));
  ok(matchesShape(`sha256:${"c".repeat(64)}`, "image_digest"));
  ok(!matchesShape("sha512:" + "c".repeat(64), "image_digest"));
});

test("a MISSING key is still manifest_key_missing — absence and null are different facts", () => {
  const manifest = shapedManifest();
  delete manifest.extracted_text_sha256;
  strictEqual(refusalReason(() => assertRequiredKeys({ manifest, kind: "pre_sign" })), "manifest_key_missing");
});

test("every attested required key has a registered shape — the two rosters move together", () => {
  for (const kind of ["draft_watermarked", "pre_sign"]) {
    for (const k of requiredManifestKeys(kind)) {
      if (k === "render_manifest_sha256") continue;
      if (DB_DERIVED_MANIFEST_KEYS.includes(k)) continue;
      ok(MANIFEST_KEY_SHAPES[k], `${k} has no registered shape`);
    }
  }
});

// --- A33 arm (iii): duplicate completion --------------------------------------------------------

test("a duplicate completion with the SAME hash is idempotent success", () => {
  const sha = "a".repeat(64);
  deepStrictEqual(decideDuplicateCompletion({ sealedSha256: sha, producedSha256: sha }), { outcome: "idempotent" });
});

test("a duplicate completion with a DIFFERENT hash is a conflict, never a quiet pass", () => {
  const r = decideDuplicateCompletion({ sealedSha256: "a".repeat(64), producedSha256: "b".repeat(64) });
  strictEqual(r.outcome, "conflict");
  strictEqual(r.refusal.reason, "render_output_conflict");
});

test("an unreadable sealed hash REFUSES outright — no comparison means no idempotency claim", () => {
  // This branch throws rather than returning a verdict, deliberately: the other two arms answer
  // a question that was actually asked ("are these the same bytes?"), and this one is the case
  // where the question cannot be asked at all. A returned "conflict" would read as a measurement.
  strictEqual(
    refusalReason(() => decideDuplicateCompletion({ sealedSha256: null, producedSha256: "b".repeat(64) })),
    "render_output_conflict",
  );
  strictEqual(
    refusalReason(() => decideDuplicateCompletion({ sealedSha256: "not-a-hash", producedSha256: "b".repeat(64) })),
    "render_output_conflict",
  );
});

// --- bounded retry --------------------------------------------------------------------------

test("retry is bounded, and unreadable bookkeeping is TERMINAL rather than infinite", () => {
  strictEqual(decideRetry({ attempts: 1, maxAttempts: 5 }).disposition, "retry");
  strictEqual(decideRetry({ attempts: 5, maxAttempts: 5 }).disposition, "terminal");
  strictEqual(decideRetry({ attempts: 6, maxAttempts: 5 }).disposition, "terminal");
  strictEqual(decideRetry({ attempts: "x", maxAttempts: 5 }).disposition, "terminal");
  strictEqual(decideRetry({ attempts: 1, maxAttempts: 0 }).disposition, "terminal");
});

test("decideDuplicateCompletion is exported alongside a real refusal type", () => {
  throws(() => { throw new RenderRefusal("x", "y"); }, RenderRefusal);
});
