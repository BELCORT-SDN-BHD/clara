// @frozen — determinism-critical (Wave E lane zeta; design part2 §8's chart AST, matrix A32a's
// named axis policies and A32b's same-source data table).
//
// CHARTS ARE DETERMINISTIC VECTOR GEOMETRY, and every number they plot is DB-owned.
//
// TWO KINDS OF NUMBER, AND THE LINE BETWEEN THEM IS THE WHOLE POINT.
//   (1) REPORTED FIGURES — what a reader sees as an amount. These are never computed here. The
//       same-source table prints `displayed_text`, the string the database already produced.
//   (2) PAGE GEOMETRY — how many millimetres tall a bar is. That is typesetting, not accounting,
//       and it is computed here from the EXACT RATIONAL the database attached to each point
//       (exact_numerator / exact_denominator), as BigInt, so the comparison and the axis bounds
//       are exact. A float appears exactly once, at the last step, turning an exact ratio into a
//       page coordinate — and it can never flow back into a figure, because figures are strings.
//
// AXIS POLICIES ARE NAMED, NEVER ARBITRARY (E-R14, matrix A32a). Four policies, and an unknown
// one is a refusal rather than a fallback: a renderer free to choose a clip is a number-injection
// path with a picture around it.

import { RenderRefusal } from "./decisions.mjs";

export const AXIS_POLICIES = Object.freeze(["include_zero", "data_extent", "symmetric", "disclosed_manual"]);

/** An exact rational, as BigInts. Never a float. */
function rational(num, den) {
  if (den === 0n) {
    throw new RenderRefusal("chart_point_unreadable", "a dataset point carries a zero denominator");
  }
  return den < 0n ? { n: -num, d: -den } : { n: num, d: den };
}

function toBigInt(value, what) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new RenderRefusal("chart_point_unreadable",
    `a dataset point's ${what} is not an exact integer`, { [what]: value });
}

/** a < b for exact rationals, by cross-multiplication (both denominators are positive). */
function lt(a, b) {
  return a.n * b.d < b.n * a.d;
}
function ratioToFloat(r) {
  // The ONE float in this module, and it produces a page coordinate. See the header.
  return Number(r.n) / Number(r.d);
}

/**
 * Read a chart dataset's points into plottable form. `point_status` is honoured: a point the
 * evaluator did not produce (`n/a`, refused, suppressed) is NOT plotted as zero — plotting a
 * missing value as zero is a fabricated figure, so it becomes an explicit gap that the chart and
 * the same-source table both show as a gap.
 */
export function readSeries(points) {
  if (!Array.isArray(points)) {
    throw new RenderRefusal("chart_dataset_unreadable", "a chart dataset carries no points array");
  }
  return points.map((p) => {
    const ok = p?.point_status === "ok";
    if (!ok) {
      // The gap's DISCLOSURE TOKEN travels with the gap (round-2 M4). ε seals dimensions.na_label
      // from δ's display_token, and the same-source table has to print something in that cell —
      // so it prints the sealed token or refuses. Carrying it here is what lets layout.mjs do
      // that without a renderer-authored word.
      return { seriesKey: String(p?.series_key ?? ""), ordinal: Number(p?.ordinal ?? 0),
        cellId: p?.cell_id ?? null, plotted: false, displayedText: p?.displayed_text ?? null,
        naLabel: p?.dimensions?.na_label ?? null, value: null };
    }
    const dims = p?.dimensions ?? {};
    const value = rational(toBigInt(dims.exact_numerator, "exact_numerator"),
      toBigInt(dims.exact_denominator, "exact_denominator"));
    return { seriesKey: String(p.series_key), ordinal: Number(p.ordinal), cellId: p.cell_id ?? null,
      plotted: true, displayedText: p.displayed_text ?? null, naLabel: null, value };
  });
}

/**
 * The axis bounds a NAMED policy produces. Returned as exact rationals plus their float page
 * forms, and always recorded in the render receipt so the sealed manifest can say which policy
 * produced which bounds (matrix A32a asks for exactly that).
 */
export function axisBounds({ policy, points, manualBounds }) {
  if (!AXIS_POLICIES.includes(policy)) {
    throw new RenderRefusal("axis_policy_unknown",
      `axis policy ${String(policy)} is not one of the four named policies`,
      { policy, named: AXIS_POLICIES });
  }
  const plotted = points.filter((p) => p.plotted);
  if (plotted.length === 0) {
    throw new RenderRefusal("chart_series_has_no_plottable_point",
      "a chart series has no evaluated point to plot; an empty series is a missing evaluation, not a chart with a gap");
  }
  let min = plotted[0].value;
  let max = plotted[0].value;
  for (const p of plotted) {
    if (lt(p.value, min)) min = p.value;
    if (lt(max, p.value)) max = p.value;
  }
  const zero = { n: 0n, d: 1n };
  let lo = min;
  let hi = max;
  let disclosure = null;

  if (policy === "include_zero") {
    if (lt(zero, lo)) lo = zero;
    if (lt(hi, zero)) hi = zero;
  } else if (policy === "data_extent") {
    // lo/hi already the data extent.
  } else if (policy === "symmetric") {
    // Symmetric about zero at the larger magnitude, exactly.
    const negLo = { n: -lo.n, d: lo.d };
    const mag = lt(negLo, hi) ? hi : negLo;
    lo = { n: -mag.n, d: mag.d };
    hi = mag;
  } else {
    // disclosed_manual — the bounds come from the chart spec (DB rows), never from the renderer,
    // and the chart carries a conspicuous disclosure line saying so.
    if (!manualBounds || manualBounds.min === undefined || manualBounds.max === undefined) {
      throw new RenderRefusal("axis_manual_bounds_absent",
        "the disclosed_manual policy requires bounds from the chart spec; the renderer never picks one",
        { manualBounds: manualBounds ?? "(absent)" });
    }
    lo = rational(toBigInt(manualBounds.min.numerator, "manual min numerator"),
      toBigInt(manualBounds.min.denominator, "manual min denominator"));
    hi = rational(toBigInt(manualBounds.max.numerator, "manual max numerator"),
      toBigInt(manualBounds.max.denominator, "manual max denominator"));
    disclosure = "Axis range is manually set and does not begin at zero.";
  }
  if (!lt(lo, hi) && !(lo.n * hi.d === hi.n * lo.d)) {
    throw new RenderRefusal("axis_bounds_invalid", "the axis lower bound is above its upper bound");
  }
  return { policy, lo, hi, loFloat: ratioToFloat(lo), hiFloat: ratioToFloat(hi), disclosure };
}

/**
 * A32b — THE SAME-SOURCE DATA TABLE. Built from the SAME point objects the chart plots, carrying
 * each point's CELL ID, so the parity assertion is by cell id rather than by comparing rendered
 * strings. A table re-derived at render time, or one whose numbers agree today by coincidence, is
 * a FAIL: same-source means the same rows.
 */
export function sameSourceTable(points) {
  return points.map((p) => ({
    ordinal: p.ordinal,
    series_key: p.seriesKey,
    cell_id: p.cellId,
    // The reported figure: the database's own string. Never re-formatted here.
    displayed_text: p.plotted ? p.displayedText : null,
    // And for a gap, the DB's own sealed disclosure token — null for a plotted point, so the two
    // fields are never both populated and the table cell has exactly one lawful source.
    na_label: p.plotted ? null : p.naLabel,
    plotted: p.plotted,
  })).sort((a, b) => (a.series_key < b.series_key ? -1 : a.series_key > b.series_key ? 1 : a.ordinal - b.ordinal));
}

/**
 * The parity proof itself, as a function rather than as a comment: the plotted set and the table
 * must be the same cells, in the same multiplicity. CI asserts this; so does the worker, before
 * it seals anything.
 */
export function assertChartTableParity({ plottedPoints, tableRows }) {
  const key = (r) => `${r.cell_id ?? "null"}#${r.series_key ?? r.seriesKey}#${r.ordinal}`;
  const a = plottedPoints.map((p) => key({ cell_id: p.cellId, series_key: p.seriesKey, ordinal: p.ordinal })).sort();
  const b = tableRows.map(key).sort();
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    throw new RenderRefusal("chart_table_not_same_source",
      "the chart's plotted cells and its accompanying data table are not the same rows",
      { plotted_count: a.length, table_count: b.length });
  }
  return true;
}

/**
 * THRESHOLD LINES, PLOTTED FROM THE SEALED COPY — never re-resolved here.
 *
 * Epsilon resolves a chart's thresholds ONCE, at seal, as of the run's period END, and freezes
 * them into report_datasets.resolved_thresholds inside the dataset digest. Re-resolving at render
 * time would answer a different question the moment a newer constant version lands; the sealed
 * copy is the truth about the period being reported.
 *
 * TWO SOURCES, AND ONLY ONE OF THEM CARRIES A VALUE.
 *   · `metric_constant` — the resolver copied the constant's exact numerator/denominator, so the
 *     line has a position and is drawn.
 *   · `metric_version` — the resolver recorded WHICH definition version the threshold names, plus
 *     its formula digest and unit, but NOT a value: the value for this period is a cell, and
 *     which cell is not something this module can determine from the threshold row alone. So it
 *     REFUSES rather than guessing a position. A threshold line drawn at an invented height is a
 *     fabricated figure with a ruler through it — the one thing E-R8 floor 1 exists to prevent.
 *     Named as a gap rather than silently skipped, because a threshold that quietly vanishes from
 *     a chart is a chart that says something different from the one the preparer approved.
 */
export function readThresholds(resolvedThresholds) {
  if (!Array.isArray(resolvedThresholds)) {
    throw new RenderRefusal("chart_thresholds_unreadable",
      "the sealed dataset carries no resolved_thresholds array; the renderer never resolves thresholds itself");
  }
  return resolvedThresholds.map((t) => {
    if (t?.source === "metric_constant") {
      return {
        thresholdKey: String(t.threshold_key ?? ""),
        source: "metric_constant",
        constantKey: t.constant_key ?? null,
        constantVersion: t.constant_version ?? null,
        value: rational(toBigInt(t.numerator, "threshold numerator"),
          toBigInt(t.denominator, "threshold denominator")),
      };
    }
    if (t?.source === "metric_version") {
      throw new RenderRefusal("chart_threshold_value_unsealed",
        `threshold ${String(t.threshold_key)} names a metric version but the sealed row carries no value; the renderer will not derive one`,
        {
          threshold_key: t?.threshold_key ?? null,
          definition_version_id: t?.definition_version_id ?? null,
          fix: "seal the threshold's value alongside its identity, or plot the metric as a series instead",
        });
    }
    throw new RenderRefusal("chart_threshold_source_unknown",
      `threshold source ${String(t?.source)} is not one this renderer plots`, { source: t?.source ?? null });
  });
}

/** Threshold positions as fractions of the plot height, on the SAME axis as the bars. */
export function thresholdGeometry({ thresholds, bounds }) {
  const span = bounds.hiFloat - bounds.loFloat;
  if (!(span > 0)) {
    throw new RenderRefusal("axis_bounds_invalid", "the axis span is zero; nothing can be plotted against it");
  }
  return thresholds.map((t) => ({
    thresholdKey: t.thresholdKey,
    constantKey: t.constantKey,
    constantVersion: t.constantVersion,
    fraction: (ratioToFloat(t.value) - bounds.loFloat) / span,
    // A threshold outside the axis is REPORTED rather than clamped: clamping would draw the line
    // somewhere it is not, and a reader cannot tell a clamped line from a real one.
    withinAxis: !lt(t.value, bounds.lo) && !lt(bounds.hi, t.value),
  }));
}

/** Page geometry for a bar series: fractions of the plot height, in [0,1]. Typesetting only. */
export function barGeometry({ points, bounds }) {
  const span = bounds.hiFloat - bounds.loFloat;
  if (!(span > 0)) {
    throw new RenderRefusal("axis_bounds_invalid", "the axis span is zero; nothing can be plotted against it");
  }
  return points.map((p) => ({
    ordinal: p.ordinal,
    series_key: p.seriesKey,
    cell_id: p.cellId,
    plotted: p.plotted,
    // A gap, not a zero. See readSeries.
    fraction: p.plotted ? (ratioToFloat(p.value) - bounds.loFloat) / span : null,
  }));
}
