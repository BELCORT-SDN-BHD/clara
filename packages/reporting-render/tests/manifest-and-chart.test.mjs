// Lane ζ unit battery — canonical JSON, the environment pins, the derived document metadata, and
// the chart's named axis policies + same-source data table. NO database, NO PDF, NO container.

import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { CanonicalJsonError, canonicalJson, canonicalSha256 } from "../lib/canonical-json.mjs";
import { RenderRefusal } from "../lib/decisions.mjs";
import {
  ENVIRONMENT_PIN_KEYS, buildFinalManifest, documentMetadata, environmentPins, sourceDateEpoch,
} from "../lib/manifest.mjs";
import {
  AXIS_POLICIES, assertChartTableParity, axisBounds, barGeometry, readSeries, readThresholds,
  sameSourceTable, thresholdGeometry,
} from "../lib/chart.mjs";
import { typstLength } from "../lib/layout.mjs";

function reasonOf(fn) {
  try {
    fn();
  } catch (err) {
    ok(err instanceof RenderRefusal || err instanceof CanonicalJsonError,
      `expected a typed refusal, got ${err?.name}: ${err?.message}`);
    return err.reason ?? err.name;
  }
  throw new Error("expected a refusal, got success");
}

// === canonical JSON ============================================================================

test("key order does not change the serialisation or the digest", () => {
  const a = { b: 1, a: { d: [1, 2], c: "x" } };
  const b = { a: { c: "x", d: [1, 2] }, b: 1 };
  strictEqual(canonicalJson(a), canonicalJson(b));
  strictEqual(canonicalSha256(a), canonicalSha256(b));
  strictEqual(canonicalJson(a), '{"a":{"c":"x","d":[1,2]},"b":1}');
});

test("ARRAY order DOES change the digest — a reordered pin is a different pin", () => {
  ok(canonicalSha256({ x: [1, 2] }) !== canonicalSha256({ x: [2, 1] }));
});

test("a non-integer number is REFUSED, not rounded", () => {
  strictEqual(reasonOf(() => canonicalJson({ amount: 12.34 })), "CanonicalJsonError");
});

test("an undefined value is refused — absence must be an explicit null", () => {
  strictEqual(reasonOf(() => canonicalJson({ pin: undefined })), "CanonicalJsonError");
  strictEqual(canonicalJson({ pin: null }), '{"pin":null}');
});

test("control characters and quotes survive a round trip through the escaper", () => {
  const s = canonicalJson({ t: 'a"b\\c\nd\te' });
  deepStrictEqual(JSON.parse(s).t, 'a"b\\c\nd\te');
});

// === the environment pins ======================================================================

const goodEnv = {
  assembler_version: "clara.reporting-render/v1",
  renderer_image_digest: `sha256:${"a".repeat(64)}`,
  renderer_source_commit: "b".repeat(40),
  node_version: "v20.19.5",
  os_version: "linux 6.1.0",
  architecture: "x64",
  font_engine_version: "typst 0.12.0",
};

test("every environment pin is required — no fallback, no default", () => {
  for (const key of ENVIRONMENT_PIN_KEYS) {
    const missing = { ...goodEnv, [key]: undefined };
    strictEqual(reasonOf(() => environmentPins(missing)), "render_environment_pin_missing", `${key} must be required`);
    strictEqual(reasonOf(() => environmentPins({ ...goodEnv, [key]: "  " })), "render_environment_pin_missing");
  }
});

test("a TAG is refused where a digest is required — a tag is a moving pointer", () => {
  strictEqual(
    reasonOf(() => environmentPins({ ...goodEnv, renderer_image_digest: "registry.fly.io/clara-render:latest" })),
    "renderer_image_not_digest_pinned",
  );
  strictEqual(
    reasonOf(() => environmentPins({ ...goodEnv, renderer_image_digest: "sha256:abc" })),
    "renderer_image_not_digest_pinned",
  );
});

test("a short commit is refused — an abbreviated object name is ambiguous over seven years", () => {
  strictEqual(
    reasonOf(() => environmentPins({ ...goodEnv, renderer_source_commit: "b".repeat(7) })),
    "renderer_source_commit_unreadable",
  );
});

// === derived, clock-free metadata ===============================================================

const request = {
  report_run_id: "11111111-1111-1111-1111-111111111111",
  report_class: "statutory",
  dataset_sha256: "c".repeat(64),
  reporting_period: { id: "p1", period_start: "2025-01-01", period_end: "2025-12-31" },
};

test("SOURCE_DATE_EPOCH comes from the reporting period, not from a clock", () => {
  strictEqual(sourceDateEpoch(request), Date.parse("2025-12-31T00:00:00Z") / 1000);
});

test("an unreadable reporting period refuses rather than falling back to now()", () => {
  strictEqual(reasonOf(() => sourceDateEpoch({})), "reporting_period_unreadable");
  strictEqual(reasonOf(() => sourceDateEpoch({ reporting_period: { period_end: "31/12/2025" } })), "reporting_period_unreadable");
});

test("document metadata is a pure function of the pinned request — two calls agree exactly", () => {
  const a = documentMetadata({ requestManifest: request, title: "Financial statements", uncertified: false, watermark: false });
  const b = documentMetadata({ requestManifest: request, title: "Financial statements", uncertified: false, watermark: false });
  deepStrictEqual(a, b);
  strictEqual(a.creation_date_utc, "2025-12-31T00:00:00Z");
  strictEqual(a.modification_date_utc, a.creation_date_utc);
  strictEqual(a.document_id, canonicalSha256(request));
  deepStrictEqual(a.trailer_id, [a.document_id.slice(0, 32), a.document_id.slice(0, 32)]);
});

test("a different pinned input gives a different document id", () => {
  const other = documentMetadata({
    requestManifest: { ...request, dataset_sha256: "d".repeat(64) },
    title: "Financial statements", uncertified: false, watermark: false,
  });
  const base = documentMetadata({ requestManifest: request, title: "Financial statements", uncertified: false, watermark: false });
  ok(other.document_id !== base.document_id);
});

test("the assembler will not invent a title", () => {
  strictEqual(
    reasonOf(() => documentMetadata({ requestManifest: request, title: "", uncertified: false, watermark: false })),
    "render_environment_pin_missing",
  );
});

// === the final manifest =========================================================================

const outputs = {
  extracted_text_sha256: "e".repeat(64),
  extraction_tool: { name: "pdftotext (poppler-utils)", version: "22.12.0" },
};
const docMeta = documentMetadata({ requestManifest: request, title: "FS", uncertified: false, watermark: false });

test("the final manifest carries the request half VERBATIM plus the environment half", () => {
  const m = buildFinalManifest({
    requestManifest: request, requestSha256: "f".repeat(64), environment: goodEnv,
    documentMeta: docMeta, outputs,
  });
  for (const [k, v] of Object.entries(request)) deepStrictEqual(m[k], v);
  strictEqual(m.renderer_image_digest, goodEnv.renderer_image_digest);
  strictEqual(m.render_request_sha256, "f".repeat(64));
  ok(!("render_manifest_sha256" in m), "the DATABASE composes render_manifest_sha256, not the worker");
});

test("an UNPINNED extractor refuses — the scan's own instrument must be nameable", () => {
  strictEqual(
    reasonOf(() => buildFinalManifest({
      requestManifest: request, requestSha256: "f".repeat(64), environment: goodEnv,
      documentMeta: docMeta, outputs: { ...outputs, extraction_tool: { name: "pdftotext" } },
    })),
    "extraction_tool_unpinned",
  );
  strictEqual(
    reasonOf(() => buildFinalManifest({
      requestManifest: request, requestSha256: "f".repeat(64), environment: goodEnv,
      documentMeta: docMeta, outputs: { ...outputs, extraction_tool: undefined },
    })),
    "extraction_tool_unpinned",
  );
});

test("a missing extracted-text hash refuses", () => {
  strictEqual(
    reasonOf(() => buildFinalManifest({
      requestManifest: request, requestSha256: "f".repeat(64), environment: goodEnv,
      documentMeta: docMeta, outputs: { ...outputs, extracted_text_sha256: undefined },
    })),
    "extracted_text_hash_missing",
  );
});

// === charts =====================================================================================

const pts = (vals) => vals.map((v, i) => ({
  ordinal: i, series_key: "revenue", cell_id: `cell-${i}`, point_status: v === null ? "not_applicable" : "ok",
  displayed_text: v === null ? null : String(v),
  dimensions: v === null ? {} : { exact_numerator: String(v * 100), exact_denominator: "100" },
}));

test("a missing point is a GAP, never a zero", () => {
  const s = readSeries(pts([10, null, 30]));
  strictEqual(s[1].plotted, false);
  strictEqual(s[1].value, null);
  const g = barGeometry({ points: s, bounds: axisBounds({ policy: "include_zero", points: s }) });
  strictEqual(g[1].fraction, null, "a gap must not be plotted at the axis floor");
});

test("each named axis policy produces its declared bounds", () => {
  const s = readSeries(pts([20, 50, 30]));
  strictEqual(axisBounds({ policy: "include_zero", points: s }).loFloat, 0);
  strictEqual(axisBounds({ policy: "data_extent", points: s }).loFloat, 20);
  const sym = axisBounds({ policy: "symmetric", points: readSeries(pts([-10, 40])) });
  strictEqual(sym.loFloat, -40);
  strictEqual(sym.hiFloat, 40);
});

test("disclosed_manual takes its bounds from the SPEC and renders a disclosure line", () => {
  const s = readSeries(pts([20, 50]));
  const b = axisBounds({
    policy: "disclosed_manual", points: s,
    manualBounds: { min: { numerator: "1000", denominator: "100" }, max: { numerator: "6000", denominator: "100" } },
  });
  strictEqual(b.loFloat, 10);
  strictEqual(b.hiFloat, 60);
  ok(b.disclosure && b.disclosure.length > 0, "a manual axis discloses itself conspicuously");
});

test("disclosed_manual without spec bounds refuses — the renderer never picks a clip", () => {
  strictEqual(
    reasonOf(() => axisBounds({ policy: "disclosed_manual", points: readSeries(pts([1, 2])) })),
    "axis_manual_bounds_absent",
  );
});

test("an unnamed axis policy refuses rather than falling back", () => {
  for (const bogus of ["auto", "nice", "", null, undefined]) {
    strictEqual(reasonOf(() => axisBounds({ policy: bogus, points: readSeries(pts([1, 2])) })), "axis_policy_unknown");
  }
  deepStrictEqual([...AXIS_POLICIES], ["include_zero", "data_extent", "symmetric", "disclosed_manual"]);
});

test("a series with nothing evaluated refuses — an empty series is a missing evaluation", () => {
  strictEqual(
    reasonOf(() => axisBounds({ policy: "include_zero", points: readSeries(pts([null, null])) })),
    "chart_series_has_no_plottable_point",
  );
});

test("A32b: the data table is the SAME rows as the plot, asserted by CELL ID", () => {
  const s = readSeries(pts([10, null, 30]));
  const table = sameSourceTable(s);
  ok(assertChartTableParity({ plottedPoints: s, tableRows: table }));
  deepStrictEqual(table.map((r) => r.cell_id), ["cell-0", "cell-1", "cell-2"]);
  // The table prints the DATABASE's own string, never a re-formatted number.
  deepStrictEqual(table.map((r) => r.displayed_text), ["10", null, "30"]);
});

test("A32b: a table re-derived from a different row set FAILS parity", () => {
  const s = readSeries(pts([10, 20, 30]));
  const tampered = sameSourceTable(s).slice(0, 2);
  strictEqual(
    reasonOf(() => assertChartTableParity({ plottedPoints: s, tableRows: tampered })),
    "chart_table_not_same_source",
  );
});

// === THE ONE BARE (UNQUOTED) VALUE, AND ITS WALL ===============================================
//
// Found by the phase-2 build spike: Typst's `margin` takes a LENGTH and rejects a string, so
// `margin: "20mm"` did not compile at all. Emitting it bare makes it the single house-style value
// that is NOT wrapped in a string literal — i.e. the only possible injection point in an otherwise
// literal-only assembler — so it is closed by a strict allow-list rather than by escaping.

test("a plain length is emitted BARE so Typst accepts it", () => {
  for (const v of ["20mm", "1.5cm", "12pt", "1in", "0mm"]) strictEqual(typstLength(v, "margin"), v);
});

test("anything that is not a plain length is REFUSED, not sanitised", () => {
  // NB: the strings below are ATTACK INPUTS asserted to be rejected — nothing here executes them.
  // The literal containing `eval(` is a hostile house-style value the wall must refuse; it is a
  // fixture for the refusal, never a call.
  for (const v of ["20", "20 mm", "20em", "", null, undefined, "20mm)", "20mm, fill: red",
    '20mm") + eval("x', "-5mm", "2e3mm"]) {
    strictEqual(reasonOf(() => typstLength(v, "margin")), "style_length_invalid",
      `${JSON.stringify(v)} must be refused`);
  }
});

// === SEALED THRESHOLDS (ε B5) ==================================================================

const constantThreshold = (over = {}) => ({
  threshold_key: "sst_ceiling", source: "metric_constant", constant_key: "sst_threshold",
  constant_id: "c1", constant_version: 3, numerator: "3000", denominator: "100",
  currency_power: 1, days_power: 0, count_power: 0,
  effective_from: "2025-01-01", effective_to: null, as_of: "2025-12-31", ...over,
});

test("a metric_constant threshold plots from its SEALED numerator/denominator", () => {
  const t = readThresholds([constantThreshold()]);
  strictEqual(t.length, 1);
  strictEqual(t[0].constantVersion, 3);
  const bounds = axisBounds({ policy: "include_zero", points: readSeries(pts([10, 50])) });
  const g = thresholdGeometry({ thresholds: t, bounds });
  strictEqual(g[0].withinAxis, true);
  strictEqual(Number(g[0].fraction.toFixed(4)), 0.6); // 30 of a 0..50 axis
});

test("a metric_version threshold REFUSES — the sealed row carries identity, not a value", () => {
  strictEqual(
    reasonOf(() => readThresholds([{ threshold_key: "target", source: "metric_version",
      definition_version_id: "d1", formula_sha256: "f".repeat(64), unit_key: "money" }])),
    "chart_threshold_value_unsealed",
  );
});

test("an unknown threshold source refuses rather than being skipped", () => {
  strictEqual(reasonOf(() => readThresholds([{ threshold_key: "x", source: "vibes" }])),
    "chart_threshold_source_unknown");
});

test("a missing resolved_thresholds array refuses — the renderer never resolves thresholds itself", () => {
  strictEqual(reasonOf(() => readThresholds(undefined)), "chart_thresholds_unreadable");
  strictEqual(reasonOf(() => readThresholds(null)), "chart_thresholds_unreadable");
  deepStrictEqual(readThresholds([]), []);
});

test("a threshold OUTSIDE the axis is reported, never clamped to the frame", () => {
  const t = readThresholds([constantThreshold({ numerator: "900000", denominator: "100" })]);
  const bounds = axisBounds({ policy: "data_extent", points: readSeries(pts([10, 50])) });
  const g = thresholdGeometry({ thresholds: t, bounds });
  strictEqual(g[0].withinAxis, false, "a clamped line reads as a real one at the wrong height");
});

test("a point whose exact rational is not an integer pair refuses", () => {
  strictEqual(
    reasonOf(() => readSeries([{ ordinal: 0, series_key: "r", point_status: "ok", displayed_text: "1.5",
      dimensions: { exact_numerator: 1.5, exact_denominator: 1 } }])),
    "chart_point_unreadable",
  );
});
