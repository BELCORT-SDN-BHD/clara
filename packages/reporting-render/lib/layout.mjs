// @frozen — determinism-critical (Wave E lane zeta; walks epsilon's `clara.layout/v1` AST).
//
// THE ASSEMBLER. Resolved layout AST + DB-owned payload -> a deterministic typesetting source.
//
// EVERY STRING FROM THE DATABASE IS EMITTED AS A TYPST **STRING LITERAL**, never as markup.
// A single helper (`#s(...)`) turns a literal into content, and escaping a string literal is two
// characters — backslash and quote. This is not a style preference: it means a wording row, a
// client name or a house-style caption can never become typesetting markup, so there is no
// template-injection surface in a document assembled from firm-published and statutory text.
// Anything that wants to be markup has to be a NODE in the closed AST, which epsilon's validator
// already governs.
//
// THE ASSEMBLER NEVER FORMATS A NUMBER (E-R8 floor 1). A `metric_ref` prints the database's own
// `displayed_text`. The AST's `decimal_places` is a structural integer epsilon permits, and this
// module treats a disagreement between it and the point's own `displayed_scale` as a REFUSAL
// rather than silently re-rounding: two authorities for one presentation is how a figure drifts.
//
// NO AMBIENT CLOCK, NO AMBIENT RANDOMNESS, NO SYSTEM FONTS. Timestamps and the document id come
// from manifest.mjs; fonts are content-addressed and passed in by hash.
//
// AN UNKNOWN NODE KIND IS A REFUSAL. A financial statement that silently drops a block it did not
// recognise is worse than one that fails to render: the reader cannot see what is missing.

import { RenderRefusal } from "./decisions.mjs";
import {
  assertChartTableParity, axisBounds, barGeometry, readSeries, readThresholds, sameSourceTable,
  thresholdGeometry,
} from "./chart.mjs";

export const LAYOUT_AST_VERSION = "clara.layout/v1";

/**
 * A LENGTH emitted BARE, because Typst's `margin`/`inset` parameters take a length and reject a
 * string — found by the build spike, where `margin: "20mm"` failed to compile at all.
 *
 * Bare means unquoted, which means this is the one place a house-style value is NOT wrapped in a
 * string literal — so it is the one place an injection could enter. It is closed by a strict
 * allow-list pattern rather than by escaping: a value that is not a plain number followed by one
 * of four unit suffixes is REFUSED, not sanitised. Sanitising invites a debate about what was
 * removed; refusing does not.
 */
export function typstLength(value, field) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?(mm|cm|pt|in)$/.test(raw)) {
    throw new RenderRefusal("style_length_invalid",
      `the house style's ${field} is not a plain length (e.g. 20mm, 1.5cm, 12pt, 1in)`,
      { field, value: raw });
  }
  return raw;
}

/**
 * An IDENTIFIER emitted bare — the only other unquoted position in this assembler besides a
 * length, and the one a comment sits in. A newline is the whole attack: a Typst line comment ends
 * at it, so everything after becomes document source.
 *
 * Allow-list, not escape-list: a plain identifier, dot, colon, dash or underscore, at most 128
 * characters. Anything else refuses. That admits every section key the repo actually uses and no
 * character that can leave a comment, and it does not depend on my having enumerated the escapes
 * correctly.
 */
export function typstIdentifier(value, field) {
  const raw = String(value ?? "");
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(raw)) {
    throw new RenderRefusal("layout_identifier_invalid",
      `${field} is not a plain identifier and cannot be emitted unquoted`,
      { field, value: raw.slice(0, 80) });
  }
  return raw;
}

/** Typst string-literal escaping: backslash and double quote, plus newline normalisation. */
export function typstString(value) {
  return '"' + String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n") + '"';
}

function need(map, key, kind) {
  if (!map || !Object.prototype.hasOwnProperty.call(map, key)) {
    throw new RenderRefusal(`${kind}_unresolved`,
      `the layout references ${kind} "${key}" and the payload does not resolve it`,
      { kind, key });
  }
  return map[key];
}

/**
 * The resolution pass. Walks the AST, resolves every reference from DB-owned payload, and returns
 * both the typesetting source and the list of protected-placeholder values it actually DREW —
 * which is precisely what gate 3 cross-checks against the extracted text (§7(c)).
 */
export function assemble({ layoutAst, payload, decision, style, fonts }) {
  if (!layoutAst || typeof layoutAst !== "object" || layoutAst.ast !== LAYOUT_AST_VERSION
      || !Array.isArray(layoutAst.sections) || layoutAst.sections.length === 0) {
    throw new RenderRefusal("layout_ast_unreadable",
      `the resolved layout is not a non-empty ${LAYOUT_AST_VERSION} document`,
      { ast: layoutAst?.ast });
  }
  const placeholders = payload?.placeholderValues ?? {};
  const wording = payload?.wordingByKey ?? {};
  const metrics = payload?.metricsByKey ?? {};
  const charts = payload?.chartsByKey ?? {};
  const notes = payload?.noteLabels ?? {};

  const drawnPlaceholders = [];
  const chartReceipts = [];
  const out = [];

  const emit = (line) => out.push(line);

  // --- the preamble: page, fonts (content-addressed, no system fallback), and the two helpers.
  emit(`// generated by @clara/reporting-render — do not edit; every render is reproducible from its manifest`);
  emit(`#let s(t) = text(t)`);
  // THE MANIFEST'S DOCUMENT METADATA IS APPLIED, NOT JUST DECLARED (codex M11). An earlier draft
  // set only title and author while the manifest pinned subject, keywords, a derived document id
  // and derived dates — so an artifact could be sealed against metadata the PDF never carried, and
  // the §7(d) metadata scan would read a document that disagreed with its own manifest. Everything
  // pinned is now emitted; extract.mjs reads it back and the worker cross-checks it before sealing.
  const meta = payload.documentMeta;
  emit(`#set document(title: ${typstString(meta.title)}, author: ${typstString(style?.author ?? "")}`
    + `, description: ${typstString(meta.subject ?? "")}`
    + `, keywords: ${typstString(meta.keywords ?? "")}`
    + `, date: datetime(year: ${Number(meta.creation_date_utc.slice(0, 4))},`
    + ` month: ${Number(meta.creation_date_utc.slice(5, 7))},`
    + ` day: ${Number(meta.creation_date_utc.slice(8, 10))}))`);
  emit(`#set page(paper: ${typstString(style?.paper ?? "a4")}, margin: ${typstLength(style?.margin ?? "20mm", "margin")}`
    + (decision.watermark ? `, background: rotate(-30deg, text(60pt, fill: rgb("#00000014"), ${typstString(watermarkText(decision))})))` : ")"));
  if (!Array.isArray(fonts) || fonts.length === 0) {
    throw new RenderRefusal("render_fonts_unpinned",
      "no content-addressed font was supplied; system fonts are forbidden and an unpinned font makes the bytes unreproducible");
  }
  for (const f of fonts) {
    if (typeof f?.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256)) {
      throw new RenderRefusal("render_fonts_unpinned",
        "every embedded font must be content-addressed by sha256", { font: f?.family ?? "(unnamed)" });
    }
  }
  emit(`#set text(font: ${typstString(fonts[0].family)}, size: ${Number(style?.body_size_pt ?? 10)}pt)`);

  // --- the uncertified stamp. It is drawn from the MANIFEST FLAG, and decisions.mjs already
  // refused a manifest whose flag was absent or unreadable (absence is not permission).
  if (decision.uncertified) {
    emit(`#align(center, box(stroke: 1pt, inset: 6pt, s(${typstString(uncertifiedText())})))`);
  }

  for (const section of layoutAst.sections) {
    if (!section || typeof section.section_key !== "string" || !Array.isArray(section.blocks)) {
      throw new RenderRefusal("layout_ast_unreadable", "a layout section is malformed",
        { section_key: section?.section_key });
    }
    // NOT INTERPOLATED RAW (codex B2). A Typst line comment ends at the newline, so a section_key
    // containing one escapes the comment and everything after it becomes DOCUMENT SOURCE — which
    // in a financial statement means a fabricated figure inside sealed bytes. ε validates
    // section_key as nonblank and nothing more, so "it comes from the database" is not a defence:
    // the wall is that DB text never becomes markup, and a comment is markup like any other line.
    // Same remedy class as typstLength: refuse what is not a plain identifier rather than sanitise
    // it, because a sanitiser invites an argument about what was stripped.
    emit(`// section ${typstIdentifier(section.section_key, "section_key")}`);
    for (const block of section.blocks) emit(renderNode(block));
  }

  return {
    typst: out.join("\n") + "\n",
    resolvedPlaceholders: drawnPlaceholders,
    chartReceipts,
  };

  // ---------------------------------------------------------------------------------------
  function watermarkText(d) {
    if (d.status === "failed") return "DRAFT — CHECKS FAILED — NOT FOR ISSUE";
    if (d.kind === "draft_watermarked") return "DRAFT — NOT FOR ISSUE";
    return "UNCERTIFIED — NOT FOR ISSUE";
  }
  function uncertifiedText() {
    return "UNCERTIFIED: this pack references at least one metric definition that has not been approved.";
  }

  function renderNode(n) {
    if (!n || typeof n !== "object" || typeof n.node !== "string") {
      throw new RenderRefusal("layout_node_malformed", "a layout block is not a node object");
    }
    switch (n.node) {
      case "heading": {
        const level = Number.isInteger(n.level) ? n.level : 1;
        return `#heading(level: ${level})[#${inline(n.content, n.binds)}]`;
      }
      case "paragraph":
        return `#par[#${inline(n.content, n.binds)}]`;
      case "page_break":
        return `#pagebreak()`;
      case "statement_table":
        return renderTable(n);
      case "chart_ref":
        return renderChart(n);
      // A bare row/cell/text/placeholder/metric_ref/wording_ref/note_ref at block level is
      // rendered through the same inline path, so the grammar has one resolution point.
      case "row":
      case "cell":
      case "text":
      case "placeholder":
      case "metric_ref":
      case "wording_ref":
      case "note_ref":
        return `#par[#${inline(n, undefined)}]`;
      default:
        throw new RenderRefusal("layout_node_unknown",
          `layout node "${n.node}" is not a kind this assembler renders; a statement that silently drops a block it did not recognise is worse than one that fails`,
          { node: n.node });
    }
  }

  /** Resolve a node (or an array of them) to a Typst content expression. */
  function inline(content, binds) {
    if (Array.isArray(content)) return content.map((c) => inline(c, undefined)).join(" + ");
    if (typeof content === "string") {
      // A raw string only reaches here from a node epsilon's validator already cleared of any
      // protected-placeholder binding, so it is firm-published or statutory text.
      if (binds) {
        throw new RenderRefusal("protected_placeholder_literal",
          `a node binding protected placeholder "${binds}" carries a literal instead of resolving it from the database`,
          { binds });
      }
      return `s(${typstString(content)})`;
    }
    if (!content || typeof content !== "object") {
      throw new RenderRefusal("layout_node_malformed", "a layout node's content is neither text nor a node");
    }
    switch (content.node) {
      case "text":
        return inline(content.value, content.binds);
      case "placeholder": {
        const value = need(placeholders, content.key, "protected_placeholder");
        drawnPlaceholders.push({ key: content.key, value: String(value) });
        return `s(${typstString(value)})`;
      }
      case "wording_ref":
        return `s(${typstString(need(wording, content.wording_key, "statutory_wording"))})`;
      case "note_ref":
        return `s(${typstString(need(notes, content.note_key, "note_reference"))})`;
      case "metric_ref": {
        const m = need(metrics, content.definition_key, "metric");
        if (m.point_status !== "ok") {
          // A figure the evaluator did not produce is printed as the DATABASE's own N/A marker,
          // never as a zero, never as a blank a reader would take for nothing — and never as a
          // word this renderer chose. An absent token REFUSES: the alternative is a statement
          // whose disclosure language was authored by the typesetter (codex M4).
          if (typeof m.na_label !== "string" || m.na_label.trim() === "") {
            throw new RenderRefusal("na_label_unsealed",
              `metric "${content.definition_key}" has no value and no sealed n/a label; the renderer does not author disclosure language`,
              { definition_key: content.definition_key, point_status: m.point_status });
          }
          return `s(${typstString(m.na_label)})`;
        }
        if (content.decimal_places !== undefined
            && Number(content.decimal_places) !== Number(m.displayed_scale)) {
          throw new RenderRefusal("metric_presentation_conflict",
            `the layout asks for ${content.decimal_places} decimal places and the database produced ${m.displayed_scale}; the renderer does not re-round a figure`,
            { definition_key: content.definition_key, layout_decimal_places: content.decimal_places,
              db_displayed_scale: m.displayed_scale });
        }
        return `s(${typstString(m.displayed_text)})`;
      }
      case "row":
      case "cell":
        return inline(content.cells ?? content.content, content.binds);
      default:
        throw new RenderRefusal("layout_node_unknown",
          `layout node "${content.node}" is not a kind this assembler renders`, { node: content.node });
    }
  }

  function renderTable(n) {
    const columns = Number.isInteger(n.columns) ? n.columns : null;
    if (columns === null || columns < 1) {
      throw new RenderRefusal("layout_node_malformed", "a statement table needs a structural column count",
        { columns: n.columns });
    }
    if (!Array.isArray(n.rows)) {
      throw new RenderRefusal("layout_node_malformed", "a statement table needs a rows array");
    }
    const cells = [];
    for (const row of n.rows) {
      if (row?.node !== "row" || !Array.isArray(row.cells)) {
        throw new RenderRefusal("layout_node_malformed", "a statement table row is malformed");
      }
      for (const cell of row.cells) {
        if (cell?.node !== "cell") {
          throw new RenderRefusal("layout_node_malformed", "a statement table cell is malformed");
        }
        cells.push(`[#${inline(cell.content, cell.binds)}]`);
      }
    }
    return `#table(columns: ${columns}, ${cells.join(", ")})`;
  }

  /**
   * A chart AND its same-source data table, from the SAME points (matrix A32b). The table is part
   * of the sealed artifact, not something a viewer generates: it is emitted right here, beside
   * the geometry, from the identical array.
   */
  function renderChart(n) {
    const chart = need(charts, n.chart_key, "chart_dataset");
    const points = readSeries(chart.points);
    const bounds = axisBounds({
      policy: chart.axis_policy,
      points,
      manualBounds: chart.manual_bounds,
    });
    const table = sameSourceTable(points);
    assertChartTableParity({ plottedPoints: points, tableRows: table });
    const geometry = barGeometry({ points, bounds });

    // The SEALED thresholds, read from the dataset the seal froze — never re-resolved here, and
    // NOT defaulted (codex M3). `?? []` looked harmless and was the whole defect: readThresholds
    // refuses a non-array precisely so a payload that lost the key cannot render, and the default
    // converted that refusal into an empty threshold set — a chart that draws with its control
    // lines silently gone, then seals. The DB column is `not null default '[]'`, so an ABSENT
    // array means the payload is malformed, which is exactly what must not be papered over.
    const thresholds = readThresholds(chart.resolved_thresholds);
    const thresholdLines = thresholdGeometry({ thresholds, bounds });

    chartReceipts.push({
      chart_key: n.chart_key,
      chart_spec_version_id: chart.chart_spec_version_id ?? null,
      axis_policy: bounds.policy,
      axis_lo: `${bounds.lo.n}/${bounds.lo.d}`,
      axis_hi: `${bounds.hi.n}/${bounds.hi.d}`,
      cell_ids: table.map((r) => r.cell_id),
      thresholds: thresholdLines.map((t) => ({
        threshold_key: t.thresholdKey, constant_key: t.constantKey,
        constant_version: t.constantVersion, within_axis: t.withinAxis,
      })),
    });

    const bars = geometry.map((g) => g.plotted
      ? `rect(width: 8mm, height: ${(g.fraction * 40).toFixed(4)}mm)`
      : `rect(width: 8mm, height: 0mm, stroke: (dash: "dotted"))`).join(", ");
    const rows = table.map((r) => `[#s(${typstString(r.series_key)})], [#s(${typstString(r.displayed_text ?? "n/a")})]`).join(", ");
    // A threshold OUTSIDE the axis is disclosed in words rather than drawn at the edge: a line
    // clamped to the frame reads as a real one at the wrong height.
    const drawn = thresholdLines.filter((t) => t.withinAxis)
      .map((t) => `line(start: (0mm, ${((1 - t.fraction) * 40).toFixed(4)}mm), end: (60mm, ${((1 - t.fraction) * 40).toFixed(4)}mm))`)
      .join(", ");
    const offAxis = thresholdLines.filter((t) => !t.withinAxis)
      .map((t) => `${t.thresholdKey} (outside the plotted range)`);
    const lines = [
      `#stack(dir: ltr, spacing: 3mm, ${bars})`,
      drawn ? `#place(dx: 0mm, dy: 0mm, ${drawn})` : null,
      offAxis.length > 0 ? `#s(${typstString(`Thresholds not shown: ${offAxis.join("; ")}`)})` : null,
      bounds.disclosure ? `#s(${typstString(bounds.disclosure)})` : null,
      `#table(columns: 2, [#s("Series")], [#s("Value")], ${rows})`,
    ].filter(Boolean);
    return lines.join("\n");
  }
}
