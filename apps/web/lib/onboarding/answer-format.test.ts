// H-26 / H-27 — the typed answer formatter's battery.
//
// THE TRANSLATOR IS REAL, not a stub that returns its own key. Every cell below resolves
// against the SHIPPED `messages/en.json`, through a resolver that walks the real catalog and
// substitutes `{placeholder}`s — so a message key this module emits but the catalog does not
// carry is a hard failure here, and the strings asserted are the strings a person actually
// reads. (A stub translator would have made every "the prose renders" cell pass while the
// product rendered a raw dotted key path — the `needs-you.test.ts` precedent, applied to a
// module whose whole job is wording.)

import { test } from "node:test";
import assert from "node:assert/strict";

import messages from "../../messages/en.json";
import {
  FORMATTED_ITEM_KEYS,
  formatPlanItemAnswer,
  INTERNAL_ITEM_KEYS,
  isInternalItemKey,
  verbatimAnswerText,
  type AnswerTranslator,
} from "./answer-format";

const CATALOG = (messages as unknown as Record<string, Record<string, unknown> | undefined>).ClientOnboarding?.answer as Record<string, unknown>;

/** Resolves a dotted key against the real catalog and substitutes `{name}` placeholders.
 *  THROWS on a key the catalog does not carry — that is the point of using it. */
const t: AnswerTranslator = (key, values) => {
  let node: unknown = CATALOG;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) node = undefined;
    else node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") {
    throw new Error(`ClientOnboarding.answer.${key} is missing from messages/en.json (resolved: ${String(node)})`);
  }
  return node.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = values?.[name];
    return v === undefined ? whole : String(v);
  });
};

/** The two things NO formatted answer may ever contain — the defect this module exists for. */
function assertNeverABlob(text: string, what: string): void {
  assert.doesNotMatch(text, /\[object Object\]/, `${what} must never render "[object Object]"`);
  assert.doesNotMatch(text, /[{}]/, `${what} must never render JSON braces; got: ${text}`);
}

test("every capture shape the interview writes renders as prose, and none of it is a blob", () => {
  const cases: { key: string; answer: unknown; expect: RegExp }[] = [
    // interview.v2.core.ts:107 — the verified registration.
    { key: "ssm", answer: { registration: "202401047756", normalized: "202401047756", form: "unified", format_verified: true }, expect: /Registration 202401047756 — format checked/ },
    // interview.v2.core.ts:146 — the escape hatch.
    { key: "ssm", answer: { registration: "SA1234567-X", normalized: "sa1234567x", form: "unrecognized", format_verified: false }, expect: /Registration SA1234567-X — recorded as given/ },
    // interview.v2.segments.ts:186-222.
    { key: "framework", answer: { framework_code: "MPERS", framework_label: "MPERS", framework_version: "2025" }, expect: /Reporting framework MPERS · edition 2025/ },
    { key: "framework", answer: { framework_code: "MFRS", framework_label: "MFRS", entered_as: "OTHER" }, expect: /Reporting framework MFRS · entered as OTHER/ },
    // interview.v2.segments.ts:245-270.
    { key: "accounting_basis", answer: { accounting_basis: "accrual", accounting_basis_label: "accrual", entity_type: "sdn_bhd" }, expect: /Accounting basis accrual/ },
    { key: "accounting_basis", answer: { accounting_basis: "accrual", accounting_basis_label: "accrual", observed_basis: "cash", entity_type: "sdn_bhd" }, expect: /records observed on cash today/ },
    // interview.v2.segments.ts:377-406.
    { key: "mpers_eligibility", answer: { determination: "eligible", test: "ca2016_s244_private_entity" }, expect: /A private entity under CA 2016 s\.244/ },
    { key: "mpers_eligibility", answer: { determination: "ineligible", test: "ca2016_s244_private_entity" }, expect: /NOT a private entity/ },
    { key: "mpers_eligibility", answer: { determination: "parent_unknown", test: "ca2016_s244_private_entity" }, expect: /parent has not been identified/ },
    // v3.questions.ts:83 (firm_template) and v2.questions.ts:104 (lhdn_mpers_standard) — the
    // SAME meaning written by two live workflow versions.
    { key: "coa_seed_decision", answer: { seed: "firm_template" }, expect: /firm's standard chart of accounts/ },
    { key: "coa_seed_decision", answer: { seed: "lhdn_mpers_standard" }, expect: /firm's standard chart of accounts/ },
    { key: "coa_seed_decision", answer: { seed: "manual" }, expect: /own chart/ },
    // v3.questions.ts:89-97 — the row the checklist mounts the apply control on.
    { key: "coa_chart_apply", answer: { chart: "firm_template", applied: false }, expect: /standard chart is not applied yet/ },
    { key: "coa_chart_apply", answer: { chart: "firm_template", applied: true }, expect: /standard chart has been applied/ },
    { key: "coa_chart_apply", answer: { chart: "manual", applied: false }, expect: /own chart — nothing to apply/ },
    // v2.questions.ts:63-65 — the two DB-contract opening keys.
    { key: "first_year_zero_opening", answer: { opening: "zero" }, expect: /opening position is zero/ },
    { key: "carry_down_deferred", answer: { opening: "carry_down", captured: false }, expect: /still has to be carried down/ },
    { key: "carry_down_deferred", answer: { opening: "carry_down", captured: true }, expect: /was carried down/ },
    // v2.questions.ts:73-74.
    { key: "fa_depreciation_method", answer: { non_straight_line: false }, expect: /No fixed assets on a non-straight-line method/ },
    { key: "fa_nonstraightline_todo", answer: { non_straight_line: true, captured: false }, expect: /still have to be captured/ },
    // v2.questions.ts:107.
    { key: "sample_invoices", answer: { attached: true }, expect: /Sample invoices were attached/ },
    { key: "sample_invoices", answer: { attached: false }, expect: /No sample invoices were attached/ },
    // clientOnboarding.v4.ts:102 — internal, but it still has to read honestly if rendered.
    { key: "interview_run", answer: { run_id: "run-7" }, expect: /Bound to interview run run-7/ },
  ];

  for (const c of cases) {
    const out = formatPlanItemAnswer(c.key, c.answer, t);
    assert.match(out.text, c.expect, `${c.key}: ${JSON.stringify(c.answer)} rendered "${out.text}"`);
    assertNeverABlob(out.text, c.key);
  }
  // The table below is walked, never re-listed: `FORMATTED_ITEM_KEYS` is the module's own.
  for (const key of FORMATTED_ITEM_KEYS) {
    assert.ok(cases.some((c) => c.key === key), `${key} is in the formatter's table but has no cell here`);
  }
});

test("a scalar answer passes through untouched — a human resolution is a string, and stays one", () => {
  assert.equal(formatPlanItemAnswer("legal_name", "ROME PUBLIC ADVISORY", t).text, "ROME PUBLIC ADVISORY");
  assert.equal(formatPlanItemAnswer("fye", 12, t).text, "12");
  assert.equal(formatPlanItemAnswer("anything", true, t).text, "true");
  assert.equal(formatPlanItemAnswer("anything", null, t).text, "");
});

test("THE FALLBACK: an UNKNOWN object renders ordered key: value lines, never JSON and never [object Object]", () => {
  const out = formatPlanItemAnswer("a_shape_from_a_later_vN", { alpha: "one", beta: 2, gamma: true }, t);
  assert.equal(out.text, "alpha: one · beta: 2 · gamma: true", `got: ${out.text}`);
  assertNeverABlob(out.text, "the unknown-object fallback");
  // Order is the object's OWN key order, so a reader sees the record as stored.
  assert.ok(out.text.indexOf("alpha") < out.text.indexOf("gamma"));
});

test("THE FALLBACK ALSO CATCHES A KNOWN KEY WHOSE PAYLOAD DRIFTED — it never asserts prose the data does not support", () => {
  // `ssm` with no `format_verified` cannot be said to be verified OR unverified: the writer
  // states verification affirmatively, so an absent flag is an unreadable shape, not a false.
  const drifted = formatPlanItemAnswer("ssm", { registration: "202401047756", form: "unified" }, t);
  assert.match(drifted.text, /registration: 202401047756/, `got: ${drifted.text}`);
  assert.doesNotMatch(drifted.text, /format checked/, "an absent format_verified must not be read as verified");
  assert.equal(drifted.unverified, false, "and it must not be read as UNVERIFIED either — absence is not evidence");

  // A fourth `seed` a later _vN mints falls through rather than being folded into one of the
  // three this build knows.
  const unknownSeed = formatPlanItemAnswer("coa_seed_decision", { seed: "some_future_seed" }, t);
  assert.equal(unknownSeed.text, "seed: some_future_seed", `got: ${unknownSeed.text}`);
});

test("the UNVERIFIED flag is read POSITIVELY — only `format_verified: false` sets it", () => {
  assert.equal(formatPlanItemAnswer("ssm", { registration: "X", normalized: "x", form: "unrecognized", format_verified: false }, t).unverified, true);
  assert.equal(formatPlanItemAnswer("ssm", { registration: "X", normalized: "x", form: "unified", format_verified: true }, t).unverified, false);
  assert.equal(formatPlanItemAnswer("ssm", { registration: "X" }, t).unverified, false);
  assert.equal(formatPlanItemAnswer("legal_name", "Rome", t).unverified, false);
});

test("ACKNOWLEDGED WARNINGS ARE PRESERVED as their own lines, carrying acknowledged_by — never swallowed into the summary", () => {
  // The object MERGE shape (`withWarnings`, interview.v2.core.ts:268-273).
  const merged = formatPlanItemAnswer("ssm", {
    registration: "SA1234567-X", normalized: "sa1234567x", form: "unrecognized", format_verified: false,
    warnings: [{ code: "registration_unverified", message: "not a recognised format", acknowledged: true, acknowledged_by: "user-9" }],
  }, t);
  assert.equal(merged.warnings.length, 1);
  assert.match(merged.warnings[0]!, /Warning acknowledged by user-9: not a recognised format/);
  // The warning is NOT folded into the answer line, and the answer line is still the shape's.
  assert.match(merged.text, /Registration SA1234567-X/);
  assert.doesNotMatch(merged.text, /warnings/, "the warnings array must never render as a field of the value");

  // The NON-OBJECT WRAP shape (`{value, warnings}`) — the value is unwrapped, not rendered as
  // a "value:" field.
  const wrapped = formatPlanItemAnswer("turnover", {
    value: "<RM1M",
    warnings: [{ code: "w1", message: "a warning", acknowledged: true, acknowledged_by: "user-3" }],
  }, t);
  assert.equal(wrapped.text, "<RM1M", `the wrap must unwrap; got: ${wrapped.text}`);
  assert.equal(wrapped.warnings.length, 1);
});

test("the internal-key set is SHARED and closed — interview_run, and the helper agrees with it", () => {
  assert.deepEqual([...INTERNAL_ITEM_KEYS], ["interview_run"]);
  assert.equal(isInternalItemKey("interview_run"), true);
  assert.equal(isInternalItemKey("legal_name"), false);
});

test("verbatimAnswerText is the translator-free path and is blob-free on every shape", () => {
  assert.equal(verbatimAnswerText("Rome"), "Rome");
  assert.equal(verbatimAnswerText({ chart: "firm_template", applied: false }), "chart: firm_template · applied: false");
  assert.equal(verbatimAnswerText([1, 2, 3]), "1, 2, 3");
  assert.equal(verbatimAnswerText({ a: { b: "c" } }), "a: b: c");
  assert.equal(verbatimAnswerText({ a: null }), "a: —");
  assertNeverABlob(verbatimAnswerText({ nested: { deep: { deeper: "x" } } }), "a nested object");
});

test("a CYCLIC or pathologically deep answer terminates and still never renders a blob", () => {
  const cyclic: Record<string, unknown> = { name: "loop" };
  cyclic.self = cyclic;
  const out = verbatimAnswerText(cyclic);
  assert.match(out, /name: loop/);
  assert.match(out, /…/, "the depth floor renders an honest ellipsis rather than recursing forever");
  assertNeverABlob(out, "a cyclic object");
});
