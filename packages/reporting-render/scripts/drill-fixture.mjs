// THE DRILL'S DOCUMENT IS THE PRODUCT'S OWN EMISSION, NOT A HAND-WRITTEN ONE.
//
// This module exists because of a round-2 blocker that a hand-written fixture was structurally
// incapable of catching: assemble() emitted a `#set document(description: ...)` argument that the
// pinned Typst 0.12.0 does not accept, so `typst compile` would have failed on the preamble of
// EVERY real document — while CI stayed green, because the only thing that ever ran typst was a
// fixture that emitted a preamble nobody ships.
//
// So the fixture is now built BY assemble(), from a payload shaped like the worker's, and the drill
// compiles that. A future engine-version mismatch in the product's own preamble fails the drill
// instead of the first real client render. The same builder backs the unit cells, so the thing the
// tests reason about and the thing CI compiles are one artifact.
//
// It is deliberately NOT a "minimal" document: it exercises the emissions that vary — document
// metadata, the watermark background, the uncertified stamp, a statement table, a metric that
// resolved, a metric that did NOT (printing the DB's sealed n/a label), and a chart with a gap
// point, thresholds and its same-source data table.
import { assemble } from "../lib/layout.mjs";
import { documentMetadata } from "../lib/manifest.mjs";

/** The pinned request the metadata derives from — the same shape clara.render_request_manifest_v1 builds. */
export const DRILL_REQUEST = {
  report_run_id: "00000000-0000-4000-8000-0000000dr111",
  report_class: "statutory",
  reporting_period: { period_start: "2025-01-01", period_end: "2025-12-31" },
  dataset_sha256: "a".repeat(64),
  locale: "en-MY",
  timezone: "Asia/Kuala_Lumpur",
};

const FONT_SHA = "b".repeat(64);

/**
 * Build the drill document. Returns assemble()'s own result, so callers get the exact source the
 * worker would hand the engine.
 *
 * `periodEnd` exists for the drill's control arm: changing it changes a PINNED input (the
 * document's date and keywords both derive from the request), which is what "the manifest reaches
 * the bytes" has to mean.
 *
 * @param {{fontFamily?: string, watermark?: boolean, uncertified?: boolean, periodEnd?: string}} [opts]
 */
export function buildDrillDocument(opts = {}) {
  const fontFamily = opts.fontFamily ?? "DejaVu Sans";
  const request = opts.periodEnd
    ? { ...DRILL_REQUEST, reporting_period: { ...DRILL_REQUEST.reporting_period, period_end: opts.periodEnd } }
    : DRILL_REQUEST;
  const documentMeta = documentMetadata({
    requestManifest: request,
    title: "Statement of financial position",
    uncertified: opts.uncertified ?? true,
    watermark: opts.watermark ?? true,
  });

  const payload = {
    documentMeta,
    placeholderValues: { entity_name: "ACME SDN BHD (202301234567)" },
    wordingByKey: { basis_of_preparation: "Prepared in accordance with the MPERS framework." },
    noteLabels: {},
    metricsByKey: {
      revenue: { point_status: "ok", displayed_text: "1,234,567.89", displayed_scale: 2, na_label: null, cell_id: "c1" },
      // The gap, carrying the DATABASE's sealed disclosure token. A renderer-authored word here is
      // the M4 defect; an absent token is a refusal, which the unit cells exercise separately.
      finance_cost: { point_status: "not_applicable", displayed_text: null, displayed_scale: null, na_label: "N/A", cell_id: "c2" },
    },
    chartsByKey: {
      "00000000-0000-4000-8000-0000000dc111": {
        chart_spec_version_id: "00000000-0000-4000-8000-0000000dc111",
        axis_policy: "include_zero",
        manual_bounds: null,
        points: [
          { series_key: "fy2024", ordinal: 1, cell_id: "p1", point_status: "ok", displayed_text: "1,000.00",
            dimensions: { exact_numerator: "100000", exact_denominator: "100" } },
          { series_key: "fy2025", ordinal: 2, cell_id: "p2", point_status: "ok", displayed_text: "1,500.00",
            dimensions: { exact_numerator: "150000", exact_denominator: "100" } },
          // The chart gap: not plotted, and its table cell prints the sealed token.
          { series_key: "fy2026", ordinal: 3, cell_id: "p3", point_status: "not_applicable", displayed_text: null,
            dimensions: { na_label: "N/A" } },
        ],
        resolved_thresholds: [
          { threshold_key: "gearing_ceiling", source: "metric_constant", constant_key: "gearing_max",
            constant_version: 3, numerator: "120000", denominator: "100" },
        ],
      },
    },
  };

  const layoutAst = {
    ast: "clara.layout/v1",
    sections: [{
      section_key: "statement_of_financial_position",
      blocks: [
        { node: "heading", level: 1, content: { node: "placeholder", key: "entity_name" } },
        { node: "paragraph", content: { node: "wording_ref", wording_key: "basis_of_preparation" } },
        { node: "statement_table", columns: 2, rows: [
          { node: "row", cells: [
            { node: "cell", content: "Revenue" },
            { node: "cell", content: { node: "metric_ref", definition_key: "revenue", decimal_places: 2 } },
          ] },
          { node: "row", cells: [
            { node: "cell", content: "Finance cost" },
            { node: "cell", content: { node: "metric_ref", definition_key: "finance_cost" } },
          ] },
        ] },
        { node: "chart_ref", chart_key: "00000000-0000-4000-8000-0000000dc111" },
      ],
    }],
  };

  return assemble({
    layoutAst,
    payload,
    decision: { kind: "draft_watermarked", status: "passed", watermark: opts.watermark ?? true,
      uncertified: opts.uncertified ?? true },
    style: { author: "BELCORT SDN BHD", paper: "a4", margin: "20mm", body_size_pt: 10 },
    fonts: [{ family: fontFamily, sha256: FONT_SHA }],
  });
}
