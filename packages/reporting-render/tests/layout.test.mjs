// THE ASSEMBLER'S REFUSAL BRANCHES, exercised in plain node.
//
// This file exists because round-3 review found the M4 fix correct but UNCOVERED: no test imported
// assemble() or reached renderChart at all, so the disclosure-text refusals were reachable only
// through the Docker drill's happy path — which never trips them. A branch whose only prover is a
// happy path is a branch nobody has proven.
//
// Everything here runs without Typst, without Docker and without a database: assemble() returns
// SOURCE, so what the renderer would put in a sealed PDF is inspectable as a string.
import assert from "node:assert/strict";
import { test } from "node:test";

import { RenderRefusal } from "../lib/decisions.mjs";
import { assemble } from "../lib/layout.mjs";
import { buildDrillDocument, drillInputs } from "../scripts/drill-fixture.mjs";

/** The refusal reason of `fn`, or null when it did not refuse. */
function reasonOf(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof RenderRefusal) return err.reason;
    throw err;
  }
}

/** The drill fixture's own inputs, with one chart point rewritten by `mutate`. */
function withChartPoint(mutate) {
  const built = drillInputs();
  const chart = Object.values(built.payload.chartsByKey)[0];
  chart.points = chart.points.map((p) => (p.point_status === "ok" ? p : mutate({ ...p })));
  return built;
}

test("the same-source table prints the DB's figure for a plotted point and its sealed label for a gap", () => {
  const { typst } = buildDrillDocument();
  // The plotted figures are the database's own strings, never re-formatted here.
  assert.match(typst, /\[#s\("fy2024"\)\], \[#s\("1,000\.00"\)\]/);
  assert.match(typst, /\[#s\("fy2025"\)\], \[#s\("1,500\.00"\)\]/);
  // The gap prints the SEALED token. Before the M4 fix this cell said "n/a" — a word the database
  // never sealed and no evaluator ever produced, sitting inside a statutory artifact.
  assert.match(typst, /\[#s\("fy2026"\)\], \[#s\("N\/A"\)\]/);
  assert.doesNotMatch(typst, /"n\/a"/,
    "a lower-case n/a is the renderer's own word; only the DB's sealed label may appear");
});

test("a chart gap with no sealed na_label REFUSES rather than inventing disclosure text", () => {
  const built = withChartPoint((p) => ({ ...p, dimensions: {} }));
  assert.equal(reasonOf(() => assemble(built)), "na_label_unsealed");

  // A blank label is not a label: whitespace would print as an empty cell and read as "nothing to
  // report", which is a disclosure the renderer would be making on its own.
  const blank = withChartPoint((p) => ({ ...p, dimensions: { na_label: "   " } }));
  assert.equal(reasonOf(() => assemble(blank)), "na_label_unsealed");
});

test("a PLOTTED chart point with no displayed_text REFUSES — the figure is the database's", () => {
  const built = drillInputs();
  const chart = Object.values(built.payload.chartsByKey)[0];
  chart.points = chart.points.map((p) => (p.point_status === "ok" ? { ...p, displayed_text: null } : p));
  assert.equal(reasonOf(() => assemble(built)), "chart_point_text_unsealed");
});

test("a metric_ref with no value and no sealed na_label REFUSES (the sibling path)", () => {
  const built = drillInputs();
  built.payload.metricsByKey.finance_cost = {
    point_status: "not_applicable", displayed_text: null, displayed_scale: null, na_label: null, cell_id: "c2",
  };
  assert.equal(reasonOf(() => assemble(built)), "na_label_unsealed");

  // And it prints the sealed label when there IS one — the positive arm, so the refusal above is
  // evidence about the label rather than about the path being broken.
  const ok = buildDrillDocument();
  assert.match(ok.typst, /\[#s\("Finance cost"\)\], \[#s\("N\/A"\)\]/);
});

test("a section_key that is not a plain identifier REFUSES — the comment cannot be escaped", () => {
  const built = drillInputs();
  built.layoutAst.sections[0].section_key = "notes\n#par[#text(\"RM 1,000,000\")]";
  assert.equal(reasonOf(() => assemble(built)), "layout_identifier_invalid");
});

test("the preamble emits only arguments the pinned engine accepts", () => {
  const { typst } = buildDrillDocument();
  const setDocument = typst.split("\n").find((l) => l.startsWith("#set document("));
  assert.ok(setDocument, "the document metadata must be emitted at all");
  for (const arg of ["title:", "author:", "keywords:", "date:"]) {
    assert.ok(setDocument.includes(arg), `#set document must carry ${arg}`);
  }
  // `description:` arrived in Typst 0.13.0 and the image pins 0.12.0. Emitting it failed the
  // preamble of EVERY real document while a hand-written drill fixture stayed green, so the
  // absence is asserted here as well as compiled in CI.
  assert.doesNotMatch(setDocument, /description:/,
    "description: is a 0.13-only argument; the pinned engine rejects the whole preamble");
});
