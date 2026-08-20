// F-A2 openers ①② — witnessFacts_v2's ENVELOPE, COVERAGE-RECEIPT and WIRING cells (no DB, no
// network).
//
// The wire this file judges is the one the DB half locks (the ①② window's migration pair):
//   text   witness.coverage = {ocr_extraction_id, regions_total, regions_shown, truncated, pages,
//                              downgraded_fields}
//   vision witness.coverage = {input_sha256, truncated:false, downgraded_fields}
// with `invoice.sst_registration` ANSWERED on both channels and NEVER cited. The evaluator reads
// every member POSITIVELY, so the cells here care as much about what is OMITTED on a malformed
// input as about what is emitted on a good one: an omitted member costs the arm a refusal, while
// a COERCED one would buy the arm with a number nobody measured.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  toWriterCitations,
  toWriterEnvelope,
  witnessTextCoverage,
  witnessVisionCoverage,
  WITNESS_ANSWER_UNUSABLE,
} from "../workflows/witnessFacts.v2.envelope.mjs";
import {
  buildWitnessTextPrompt,
  WITNESS_BELT_FIELDS,
  WITNESS_RAW_MAX_CHARS,
  WITNESS_REFERENCE_ANSWER_FIELDS,
  WITNESS_SST_FIELD,
} from "../workflows/witnessFacts.v2.prompts.mjs";
import {
  makeWitnessFactsServicesV2,
  WITNESS_ENGINE_SNAPSHOT as V2_SNAPSHOT,
  WITNESS_ENGINE_VERSION as V2_ENGINE_VERSION,
  WITNESS_MODEL_ID as V2_MODEL_ID,
  witnessModelTimeoutMs,
  WITNESS_MODEL_TIMEOUT_DEFAULT_MS,
} from "../workflows/witnessFacts.v2.services.mjs";
import {
  makeWitnessFactsServices,
  WITNESS_ENGINE_SNAPSHOT as V1_SNAPSHOT,
  WITNESS_ENGINE_VERSION as V1_ENGINE_VERSION,
} from "../workflows/witnessFacts.v1.services.mjs";

const SRC = (name) => readFileSync(fileURLToPath(new URL(`../workflows/${name}`, import.meta.url)), "utf8");
const value = (raw) => ({ state: "value", raw });
function wireAnswers(overrides = {}) {
  const out = {};
  for (const f of WITNESS_BELT_FIELDS) out[f] = { state: "not_printed", raw: null };
  for (const f of WITNESS_REFERENCE_ANSWER_FIELDS) out[f] = { state: "not_printed", raw: null };
  return { ...out, ...overrides };
}
const envelopeOf = (overrides, coverage) =>
  toWriterEnvelope("text", { answers: wireAnswers(overrides), contest: false }, coverage);

// ======================================================================================
// ① The SST answer: admission, and the downgrade path R6 exists for.
// ======================================================================================

test("f-a2.o1 the SST field is admitted as an answer on both channels", () => {
  for (const channel of ["text", "vision"]) {
    const env = toWriterEnvelope(channel, { answers: wireAnswers(), contest: false }, {});
    assert.deepEqual(env.witness.answers[WITNESS_SST_FIELD], { state: "not_printed" },
      `${channel}: a not_printed answer carries NO raw key`);
    assert.deepEqual(Object.keys(env.witness.answers).sort(),
      [...WITNESS_BELT_FIELDS, ...WITNESS_REFERENCE_ANSWER_FIELDS].sort(),
      `${channel}: fourteen keys, nothing else — an unknown key is a structural refusal`);
  }
  const printed = envelopeOf({ [WITNESS_SST_FIELD]: value("Nombor Pendaftaran ST W10-1808-32000123") }, {});
  assert.deepEqual(printed.witness.answers[WITNESS_SST_FIELD],
    { state: "value", raw: "Nombor Pendaftaran ST W10-1808-32000123" },
    "the rendering reaches the writer verbatim, label and all");
  assert.deepEqual(printed.witness.coverage.downgraded_fields, [], "and nothing was downgraded");
});

test("f-a2.o1 a value answer for the SST field never carries a `value` slot, even if one arrives", () => {
  const env = envelopeOf({ [WITNESS_SST_FIELD]: { state: "value", raw: "SST W10-1808-32000123", value: "W10-1808-32000123" } }, {});
  assert.deepEqual(env.witness.answers[WITNESS_SST_FIELD], { state: "value", raw: "SST W10-1808-32000123" },
    "R5: lock 3 reads STATE only, so the slot is not offered and not carried");
});

test("f-a2.o1/R6 a DOWNGRADED SST answer is recorded — it must not wear an honest silence's clothes", () => {
  const cases = {
    "blank raw": value("   "),
    "null raw": { state: "value", raw: null },
    "over the 200-char bound (M6)": value("W".repeat(WITNESS_RAW_MAX_CHARS + 1)),
    "an unknown state token": { state: "maybe", raw: "SST W10-1808-32000123" },
    "not an object at all": "SST W10-1808-32000123",
  };
  for (const [label, wire] of Object.entries(cases)) {
    const env = envelopeOf({ [WITNESS_SST_FIELD]: wire }, {});
    assert.deepEqual(env.witness.answers[WITNESS_SST_FIELD], { state: "not_printed" },
      `${label}: the persisted answer is byte-identical to an honest silence…`);
    assert.deepEqual(env.witness.coverage.downgraded_fields, [WITNESS_SST_FIELD],
      `${label}: …so the RECEIPT is the only place the difference survives, and lock 3 reads it`);
    assert.equal("corroboration_ineligible" in env, false,
      `${label}: D5 — a non-belt downgrade must NOT condemn a document whose amounts are perfectly readable`);
  }
});

test("f-a2.o1/R6 an HONEST not_printed leaves downgraded_fields EMPTY — the two cases must differ", () => {
  const honest = envelopeOf({ [WITNESS_SST_FIELD]: { state: "not_printed", raw: null } }, {});
  assert.deepEqual(honest.witness.answers[WITNESS_SST_FIELD], { state: "not_printed" });
  assert.deepEqual(honest.witness.coverage.downgraded_fields, [],
    "without this half the R6 cell proves nothing: the persisted answers are identical in both cases");
});

test("f-a2.v2 a BELT downgrade still condemns the read, and is ALSO listed (M1 unchanged)", () => {
  const env = envelopeOf({ "invoice.amount_due": value("   ") }, {});
  assert.equal(env.corroboration_ineligible, WITNESS_ANSWER_UNUSABLE);
  assert.deepEqual(env.witness.coverage.downgraded_fields, ["invoice.amount_due"]);
  const both = envelopeOf({ "invoice.total": value(""), [WITNESS_SST_FIELD]: value("") }, {});
  assert.deepEqual(both.witness.coverage.downgraded_fields, ["invoice.total", WITNESS_SST_FIELD],
    "the list is every field this read downgraded, in the roster's own order");
});

test("f-a2.o1 a citation naming the SST field is DROPPED before it can forfeit the persist", () => {
  const out = toWriterCitations({
    citations: [
      { field_path: WITNESS_SST_FIELD, region_idx: 5, raw: "SST W10-1808-32000123" },
      { field_path: "invoice.vendor_registration", region_idx: 11, raw: "202301030264 (1524187-D)" },
    ],
  });
  assert.deepEqual(out, [{ field_path: "invoice.vendor_registration", region_idx: 11, raw: "202301030264 (1524187-D)" }],
    "the writer's allowlist is deliberately unwidened; a citation naming the SST field raises CLR10 and "
    + "forfeits the WHOLE call, so it is dropped here rather than sent");
});

// ======================================================================================
// ① The coverage receipt.
// ======================================================================================

test("f-a2.o1/L1 the TEXT receipt carries exactly the six members the evaluator reads", () => {
  const built = buildWitnessTextPrompt({
    regions: [{ idx: 3, page: 1, text_content: "TOTAL RM 1.00" }, { idx: 7, page: 2, text_content: "SST 6% RM 0.06" }],
  });
  const env = envelopeOf({}, witnessTextCoverage({
    ocrExtractionId: "0d4c4a1e-0000-4000-8000-00000000abcd",
    regionsTotal: 2,
    shown: built.shown,
    truncated: built.truncated,
    pages: built.pages,
  }));
  assert.deepEqual(env.witness.coverage, {
    ocr_extraction_id: "0d4c4a1e-0000-4000-8000-00000000abcd",
    regions_total: 2,
    regions_shown: 2,
    truncated: false,
    pages: [1, 2],
    downgraded_fields: [],
  });
  assert.strictEqual(env.witness.coverage.truncated, false, "a JSON boolean — the evaluator compares it as one");
  assert.strictEqual(env.witness.coverage.regions_total, 2, "JSON numbers, not digit strings");
});

test("f-a2.o1/L1 TRUNCATION propagates from the builder to the receipt", () => {
  const regions = Array.from({ length: 4000 }, (_, i) => ({ idx: i + 1, page: 1, text_content: "X".repeat(40) }));
  const built = buildWitnessTextPrompt({ regions });
  assert.equal(built.truncated, true, "the 60,000-character budget really was exceeded");
  const cov = witnessTextCoverage({
    ocrExtractionId: "0d4c4a1e-0000-4000-8000-00000000abcd",
    regionsTotal: regions.length,
    shown: built.shown,
    truncated: built.truncated,
    pages: built.pages,
  });
  assert.equal(cov.truncated, true, "v1 computed this and threw it away; lock 1 exists because of that");
  assert.ok(cov.regions_shown < cov.regions_total,
    "and the counts disagree, which is lock 1's second, independent way of seeing the same fact");
});

test("f-a2.o1/L1 `pages` is read POSITIVELY off the regions actually SHOWN", () => {
  const built = buildWitnessTextPrompt({
    regions: [
      { idx: 9, page: 2, text_content: "over the page" },
      { idx: 2, page: 1, text_content: "first page" },
      { idx: 4, page: null, text_content: "a region whose published page is NULL" },
      { idx: 5, page: 2, text_content: "second line, page 2" },
    ],
  });
  assert.deepEqual(built.pages, [1, 2], "distinct, ascending — and a null page contributes NOTHING rather than page 1");
  assert.equal(built.shown, 4, "the null-page region is still shown and still citable");
});

test("f-a2.o1/L1 a malformed receipt member is OMITTED, never coerced into a measurement", () => {
  assert.deepEqual(witnessTextCoverage({}), {}, "nothing measured, nothing claimed");
  assert.deepEqual(witnessTextCoverage({ regionsTotal: "5", shown: 5.5, truncated: "false", ocrExtractionId: "  ", pages: "1,2" }), {},
    "a string count, a fractional count, the STRING 'false', a blank id and a non-array pages list are all refused");
  assert.deepEqual(witnessTextCoverage({ truncated: true }), { truncated: true });
  assert.deepEqual(witnessTextCoverage({ pages: [1, "2", null, 3] }), { pages: [1, 3] },
    "a non-integer page is dropped rather than parsed");
});

test("f-a2.o1/L1 the VISION receipt names the SAME digest the writer checks the input pin against", () => {
  const sha = "a".repeat(64);
  const env = toWriterEnvelope("vision", { answers: wireAnswers(), contest: false }, witnessVisionCoverage({ inputSha256: sha }));
  assert.deepEqual(env.witness.coverage, { truncated: false, input_sha256: sha, downgraded_fields: [] });
  assert.deepEqual(witnessVisionCoverage({}), { truncated: false },
    "an absent digest is omitted — the receipt makes an existing wall readable, it does not invent one");
  assert.deepEqual(witnessVisionCoverage({ inputSha256: "A".repeat(64) }), { truncated: false, input_sha256: "A".repeat(64) },
    "copied THROUGH, never re-cased: it must string-equal the input_pin beside it");
});

test("f-a2.o1/R6 `downgraded_fields` is ALWAYS an array — even with no coverage at all", () => {
  for (const coverage of [undefined, null, "nonsense", 7, ["a"], {}]) {
    const env = toWriterEnvelope("text", { answers: wireAnswers({ [WITNESS_SST_FIELD]: value("") }), contest: false }, coverage);
    assert.ok(Array.isArray(env.witness.coverage.downgraded_fields),
      `coverage=${JSON.stringify(coverage)}: lock 3 reads this list positively and refuses a non-array`);
    assert.deepEqual(env.witness.coverage.downgraded_fields, [WITNESS_SST_FIELD]);
  }
  const bare = toWriterEnvelope("text", { answers: wireAnswers(), contest: false });
  assert.deepEqual(bare.witness.coverage, { downgraded_fields: [] },
    "no receipt members are invented to fill the gap — lock 1 refuses, which is the correct verdict");
});

// ======================================================================================
// The wiring: two globals, two engine ids, and v1 untouched.
// ======================================================================================

test("f-a2.v2 each version reads its OWN services global, and startWorld injects BOTH", () => {
  const startWorld = readFileSync(fileURLToPath(new URL("../plugins/startWorld.ts", import.meta.url)), "utf8");
  assert.match(startWorld, /__claraWitnessFactsServices = makeWitnessFactsServices\(\)/,
    "v1's injection line is still there — ADDITIVE, never replaced (policy (c))");
  assert.match(startWorld, /__claraWitnessFactsServicesV2 = makeWitnessFactsServicesV2\(\)/,
    "…and v2's is a NEW line beside it");
  assert.match(SRC("witnessFacts.v1.impl.ts"), /\}\)\.__claraWitnessFactsServices;/, "v1 reads v1's slot");
  assert.match(SRC("witnessFacts.v2.impl.ts"), /\}\)\.__claraWitnessFactsServicesV2;/, "v2 reads v2's slot");
  assert.ok(!SRC("witnessFacts.v2.impl.ts").includes("__claraWitnessFactsServices;"),
    "v2 must never fall back to v1's bundle — that is how a v1 read gets stamped :v2");
});

test("f-a2.v2 the two bundles stamp DIFFERENT engine ids, and v1's still says :v1", () => {
  assert.equal(V1_ENGINE_VERSION, "v1", "witnessFacts.v1.services.mjs is byte-untouched by this window");
  assert.match(V1_SNAPSHOT.engineId, /:v1$/);
  assert.equal(V2_ENGINE_VERSION, "v2", "the contract version moves with the WORKFLOW class");
  assert.equal(V2_SNAPSHOT.engineId, `llm-openai:${V2_MODEL_ID}:v2`,
    "this literal is what the window's DB migration splices into both live router bodies");
  assert.match(V2_SNAPSHOT.engineId, /^llm-/, "the lane<->engine prefix CHECK refuses an llm_witness task otherwise (0090 §3)");
  assert.notEqual(V1_SNAPSHOT.engineId, V2_SNAPSHOT.engineId,
    "distinguishable rows are what let the corpus re-measurement produce NEW reads rather than replaying stale receipts");

  const [v1Bundle, v2Bundle] = [makeWitnessFactsServices(), makeWitnessFactsServicesV2()];
  assert.equal(v1Bundle.engineSnapshot.engineId, V1_SNAPSHOT.engineId, "each bundle carries its own snapshot…");
  assert.equal(v2Bundle.engineSnapshot.engineId, V2_SNAPSHOT.engineId, "…and the behaviour refuses to egress when the task disagrees");
});

test("f-a2.o3 the v2 bundle CARRIES the opener ③ model-call timeout", () => {
  // The registry repoint makes v2's bundle the one every new witness task runs under. If the
  // timeout lived only on v1's, opener ③ would be repaired on a bundle nothing calls any more.
  assert.equal(witnessModelTimeoutMs({}, () => {}, new Set()), WITNESS_MODEL_TIMEOUT_DEFAULT_MS);
  assert.equal(witnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "60000" }, () => {}, new Set()), 60_000);
  for (const junk of ["", "abc", "0", "-1", "Infinity"]) {
    assert.equal(witnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: junk }, () => {}, new Set()),
      WITNESS_MODEL_TIMEOUT_DEFAULT_MS, `${JSON.stringify(junk)} must never mean "no timeout"`);
  }
  const warnings = [];
  assert.equal(witnessModelTimeoutMs({ CLARA_WITNESS_LLM_TIMEOUT_MS: "90000" }, (m) => warnings.push(m), new Set()), 90_000,
    "the deprecated name still binds, so an already-configured machine does not silently revert");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /DEPRECATED/);
  assert.equal(witnessModelTimeoutMs({}, (m) => warnings.push(m), new Set()).toString(), String(WITNESS_MODEL_TIMEOUT_DEFAULT_MS));
  assert.equal(warnings.length, 1, "an ABSENT knob is not a mistake and stays quiet");
});
