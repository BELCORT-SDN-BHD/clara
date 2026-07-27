// interview_v2 / F1 — the Malaysian business-registration grammar, and the pair that shows the
// bug: the exact inputs the frozen v1 validator refuses and the v2 one accepts.
//
// Pure closure logic — no WDK engine, no DB. Serial by runner config.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const v1core = await import("../workflows/interview.v1.core.ts");
const core = await import("../workflows/interview.v2.core.ts");
const q = await import("../workflows/interview.v2.questions.ts");
const grammar = await import("../lib/malaysian-registration.mjs");
const shared = await import("../lib/invoice-vendor-identity.mjs");
const { scriptedAsk, ANSWER } = await import("./wave-b-interview-testkit.mjs");

const { askAndConfirmSegmentV2, questionOf, validateBusinessRegistration } = core;
const firmSeg = (k) => q.FIRM_SEGMENTS_V2.find((s) => s.key === k);

const ACCEPTED = [
  ["1475415-P", "legacy_numeric", "the owner-ruled old ROB digits+check-letter form"],
  ["1050274-A", "legacy_numeric", "the v1 ROC example — still accepted"],
  ["SA1234567-X", "state_prefixed_business", "the state-prefixed ROB form v1 refused outright"],
  ["JM0123456-A", "state_prefixed_business", "another state prefix"],
  ["202401001234", "unified_12", "the unified 12-digit form"],
  ["202401001234-K", "unified_12_check", "the unified form with a check letter"],
  ["LLP0012345-LGN", "llp_registration", "an LLP/PLT general registration"],
  ["LLP0012345-LCA", "llp_registration", "an LLP professional-practice registration"],
  ["201501005365 (1130695-T)", "combined_unified_and_legacy", "the Gate-F certificate's combined print"],
  ["202401047756 (1593602-X)", "combined_unified_and_legacy", "the X6 letterhead's combined print"],
  ["201901000001 (LLP0012345-LGN)", "combined_unified_and_legacy", "an LLP's combined print"],
];

test("F1: every real Malaysian registration form is accepted and classified", () => {
  for (const [input, form, why] of ACCEPTED) {
    const v = grammar.classifyBusinessRegistration(input);
    assert.equal(v.ok, true, `${input} — ${why}`);
    assert.equal(v.form, form, `${input} classified`);
    assert.equal(grammar.looksLikeBusinessRegistration(input), true, input);
  }
});

test("F1: an LLP/PLT registration is accepted in every print it appears in (the fourth family)", () => {
  // A PLT accounting practice is a common shape for both this product's FIRMS and their clients.
  // Three leading letters and a three-letter suffix reach none of the other families, so without
  // its own pattern an LLP hit exactly the re-ask-forever wall the state-prefixed form did.
  for (const [input, expected] of [
    ["LLP0012345-LGN", "llp_registration"],
    ["LLP0012345-LCA", "llp_registration"],
    ["llp0012345-lgn", "llp_registration"],
    ["LLP 0012345 - LGN", "llp_registration"],
    ["LLP0012345", "llp_registration"],
    ["201901000001 (LLP0012345-LGN)", "combined_unified_and_legacy"],
  ]) {
    const v = grammar.classifyBusinessRegistration(input);
    assert.equal(v.ok, true, `${input} must be accepted`);
    assert.equal(v.form, expected, `${input} classified`);
  }
  // The suffix is matched as a SHAPE, not against a closed list: a list I am not certain of is
  // the exact mechanism that produced F1 in the first place.
  assert.equal(grammar.looksLikeBusinessRegistration("LLP0012345-XYZ"), true, "an unenumerated suffix is still an LLP number");
  // And the family is announced to the person, not just accepted silently.
  assert.match(grammar.describeBusinessRegistrationForms(), /LLP0012345-LGN/);
  assert.match(questionOf(firmSeg("ssm"), {}), /LLP0012345-LGN/);
});

test("F1: the LLP key normalizes to the registry rule too (all four families, one normalizer)", () => {
  for (const s of ["LLP0012345-LGN", "201901000001 (LLP0012345-LGN)", "llp0012345-lgn"]) {
    assert.equal(grammar.normalizeRegistration(s), shared.registrationKey(s), `${s} — one normalization rule, pinned`);
  }
  assert.equal(grammar.normalizeRegistration("LLP0012345-LGN"), "llp0012345lgn");
  assert.equal(grammar.normalizeRegistration("201901000001 (LLP0012345-LGN)"), "201901000001llp0012345lgn");
  // Case- and separator-insensitive, so the same LLP typed three ways is ONE registration.
  const keys = new Set(["LLP0012345-LGN", "llp0012345 lgn", "LLP0012345LGN"].map(grammar.normalizeRegistration));
  assert.equal(keys.size, 1, "one registration, however it was punctuated");
});

test("F1: the fix, shown as a pair — v1 REFUSES exactly what v2 accepts (and v1 is unchanged)", () => {
  // The bug: a sole proprietor's state-prefixed ROB number, an LLP/PLT number in any print, and
  // the combined print the owner's own SSM certificate carries (recorded in the Gate-F receipt
  // as "finding F1's boundary").
  for (const input of ["SA1234567-X", "JM0123456-A", "LLP0012345-LGN", "LLP0012345-LCA", "201901000001 (LLP0012345-LGN)", "201501005365 (1130695-T)", "202401047756 (1593602-X)"]) {
    assert.equal(v1core.validateSsm(input).ok, false, `v1 refuses ${input} — the bug, still present in the frozen v1`);
    assert.equal(validateBusinessRegistration(input).ok, true, `v2 accepts ${input} — the fix`);
  }
  // And v1's own accepted forms did not regress in v1.
  assert.equal(v1core.validateSsm("202401001234-K").ok, true);
  assert.equal(v1core.validateSsm("1050274-A").ok, true);
});

test("F1: garbage is refused LOUDLY — the reason names the accepted forms", () => {
  for (const bad of ["", "   ", "hello", "12345", "RM1,234.00", "2026-07-27", "A", "the registered office at 1 Jalan Ampang Kuala Lumpur 50450"]) {
    const v = validateBusinessRegistration(bad);
    assert.equal(v.ok, false, `refused: ${JSON.stringify(bad)}`);
    assert.equal(typeof v.reason, "string");
    assert.ok(v.reason.length > 0, "a refusal always carries a reason");
  }
  // A refusal must SHOW the way out (the v1 failure mode was a shape you could not guess).
  assert.match(validateBusinessRegistration("hello").reason, /202401001234|SA1234567-X/);
});

test("F1: an SST registration is NOT a company registration (the X6 exclusion, same hazard here)", () => {
  // `W10-2408-32000157` is the measured SST number from the X6 corpus. One letter, not two, so
  // the state-prefixed pattern cannot reach it — and it must not be filed as an SSM number.
  assert.equal(grammar.looksLikeBusinessRegistration("W10-2408-32000157"), false);
});

test("F1: normalization IS the counterparty registry's key — pinned to registrationKey, not re-derived", () => {
  const corpus = [
    ...ACCEPTED.map(([s]) => s),
    "W10-2408-32000157", "202401047756(1593602-X)", "hello world", "", "  1050274-a  ",
  ];
  for (const s of corpus) {
    assert.equal(
      grammar.normalizeRegistration(s),
      shared.registrationKey(s),
      `normalizeRegistration and registrationKey must agree on ${JSON.stringify(s)} — two definitions of one rule is how they drift`,
    );
  }
  // The combined print's key is the CONCATENATION — exactly what X6 measured the registry storing.
  assert.equal(grammar.normalizeRegistration("202401047756 (1593602-X)"), "2024010477561593602x");
});

test("F1: the shared module gained the new gate ADDITIVELY — looksLikeRegistration is unchanged", () => {
  assert.equal(typeof shared.looksLikeBusinessRegistration, "function", "the new export is reachable from the shared module");
  assert.equal(shared.looksLikeBusinessRegistration, grammar.looksLikeBusinessRegistration, "one definition, re-exported");
  // The invoice lane's gate keeps its own (deliberately looser) behaviour — these cells are the
  // X6 calibration: it accepts what it always accepted and refuses what it always refused.
  assert.equal(shared.looksLikeRegistration("202401047756 (1593602-X)"), true);
  assert.equal(shared.looksLikeRegistration("W10-2408-32000157"), true, "the loose matching gate accepts it; the LABEL vocabulary is what excludes SST there");
  assert.equal(shared.looksLikeRegistration("RM1,234.00"), false);
  assert.equal(shared.looksLikeRegistration("2026-07-27"), false);
  assert.equal(shared.looksLikeRegistration("ab"), false);
});

test("F1: the recorded answer is verbatim + normalized + form (not a bare string)", async () => {
  const s = scriptedAsk([ANSWER("202401047756 (1593602-X)"), ANSWER("yes")]);
  const res = await askAndConfirmSegmentV2(firmSeg("ssm"), s.ask, {});
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.registration, "202401047756 (1593602-X)");
  assert.equal(res.value.normalized, "2024010477561593602x");
  assert.equal(res.value.form, "combined_unified_and_legacy");
  assert.equal(res.items[0].item_key, "ssm");
  assert.equal(res.items[0].item_kind, "must_ask");
  assert.equal(res.items[0].required_for_commit, true);
});

test("F1: the question itself lists the accepted forms (a person is told the shapes UP FRONT)", () => {
  const question = questionOf(firmSeg("ssm"), {});
  assert.match(question, /SA1234567-X/);
  assert.match(question, /202401001234/);
});
