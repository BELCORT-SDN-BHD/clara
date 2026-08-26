// Card 1, Annex B section B.3 — THE SANDBOX ASSEMBLER'S RENDER-TIME REFUSALS.
//
// Design of record: card1-substitution-seam-design.md §2.5 (the placeholder case, BL-8's typed
// malformed-shape guard, and the deliberate divergence from metric_ref's na_label fallback) +
// card1-substitution-seam-annexes.md Annex B.3.
//
// EVERY WALL IS FORCED IN BOTH POLARITIES: a refusal cell's differential twin must RENDER, and the
// two fixtures differ in exactly the term the wall reads. A cell that only ever sees the refusal
// arm cannot tell a working guard from a broken renderer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutSandbox, shapeSandboxPayload, SANDBOX_BLOCK_KINDS } from "../lib/layout-sandbox.mjs";
import { RenderRefusal } from "../lib/decisions.mjs";
import { typstString } from "../lib/layout.mjs";

const WATERMARK = { watermark: "WORKING ANALYSIS — FOR DISCUSSION ONLY." };

/** A well-formed widened `clara.sandbox_export_payload` result, one placeholder block. */
function payload(over = {}) {
  return {
    sandbox_export_id: "11111111-1111-1111-1111-111111111111",
    sandbox_view_id: "22222222-2222-2222-2222-222222222222",
    firm_id: "33333333-3333-3333-3333-333333333333",
    locale: "en",
    body_sha256: "a".repeat(64),
    watermark: WATERMARK,
    body: { blocks: [
      { kind: "text", basis_ref: "cell1", displayed_text: "Revenue for the period was" },
      { kind: "placeholder", basis_ref: "cell1" },
    ] },
    cells: { cell1: {
      cell_id: "44444444-4444-4444-4444-444444444444",
      cell_status: "ok",
      displayed_text: "1,234.50",
    } },
    ...over,
  };
}

const refusal = (fn) => {
  try { fn(); } catch (e) { return e; }
  return null;
};

test("B3.1 — a resolvable placeholder emits the DATABASE's own displayed_text, verbatim", () => {
  const out = layoutSandbox({ payload: payload() });
  assert.match(out.source, /s\("1,234\.50"\)/,
    "the cell's displayed_text is typeset as a string literal, byte for byte");
  assert.deepEqual(out.substituted, [{
    basis_ref: "cell1",
    cell_id: "44444444-4444-4444-4444-444444444444",
    displayed_text: "1,234.50",
  }], "the drawn figure is reported so a gate can cross-check it against the extracted text");
  // E-R8 floor 1: NEVER reformatted. A renderer that re-rounded would produce a second authority
  // for one presentation, which is how a figure drifts.
  assert.ok(!out.source.includes("1234.5") && !out.source.includes("1,234.5)"),
    "the figure is not re-rounded, re-scaled or re-separated");
});

test("B3.2 — the ABSENT-entry cell: a dropped `cells` entry REFUSES sandbox_cell_unresolved; the twin with it present renders", () => {
  const broken = payload({ cells: {} }); // simulate a payload-builder filter mis-scoping
  const e = refusal(() => layoutSandbox({ payload: broken }));
  assert.ok(e instanceof RenderRefusal, `expected a RenderRefusal, got ${e}`);
  assert.equal(e.reason, "sandbox_cell_unresolved");
  assert.equal(e.detail.key, "cell1");
  // THE TWIN: identical in every other term.
  const ok = layoutSandbox({ payload: payload() });
  assert.match(ok.source, /1,234\.50/);
});

test("B3.3 — the MALFORMED-entry cell (BL-8), a DIFFERENT axis from B3.2: a present-but-wrong entry REFUSES sandbox_cell_malformed BEFORE typstString can coerce it", () => {
  // Arm 1: cell_status mutated away from 'ok'.
  const notOk = payload({ cells: { cell1: {
    cell_id: "44444444-4444-4444-4444-444444444444", cell_status: "undefined", displayed_text: "—",
  } } });
  const e1 = refusal(() => layoutSandbox({ payload: notOk }));
  assert.ok(e1 instanceof RenderRefusal);
  assert.equal(e1.reason, "sandbox_cell_malformed");
  assert.equal(e1.detail.cell_status, "undefined");

  // Arm 2: 'ok' but displayed_text is not a string. THIS is the arm that matters most:
  // typstString is `'"' + String(value ?? "") ...` — it coerces null to "" and NEVER THROWS, so
  // without this guard the figure would render as an empty string, silently, inside a document a
  // human is about to rely on.
  const nullText = payload({ cells: { cell1: {
    cell_id: "44444444-4444-4444-4444-444444444444", cell_status: "ok", displayed_text: null,
  } } });
  const e2 = refusal(() => layoutSandbox({ payload: nullText }));
  assert.ok(e2 instanceof RenderRefusal);
  assert.equal(e2.reason, "sandbox_cell_malformed", "a null displayed_text raises the SAME token, not a coercion");

  // Arm 3, the coercion made visible: prove typstString really would have swallowed it, so this
  // cell is testing a live hazard rather than a hypothetical one.
  assert.equal(typstString(null), '""', "typstString coerces null to an empty literal and does not throw — which is exactly why the guard must run first");

  // THE TWIN: a well-formed entry renders.
  assert.match(layoutSandbox({ payload: payload() }).source, /1,234\.50/);
});

test("B3.4 — there is NO na_label-shaped fallback: a placeholder either prints the cell's own text or REFUSES, never a renderer-authored token", () => {
  // Every non-ok shape a real payload could carry, driven through the assembler. NONE of them may
  // produce output; all of them must refuse. This is the deliberate divergence from metric_ref's
  // NA-disclosure branch (design §2.5) proven, not asserted in prose.
  const shapes = [
    { cell_status: "undefined", displayed_text: "—" },
    { cell_status: "absent", displayed_text: "—" },
    { cell_status: "refused", displayed_text: "—" },
    { cell_status: "ok", displayed_text: undefined },
    { cell_status: "ok", displayed_text: 1234.5 },
    { cell_status: undefined, displayed_text: "1,234.50" },
  ];
  for (const shape of shapes) {
    const e = refusal(() => layoutSandbox({ payload: payload({
      cells: { cell1: { cell_id: "44444444-4444-4444-4444-444444444444", ...shape } },
    }) }));
    assert.ok(e instanceof RenderRefusal,
      `shape ${JSON.stringify(shape)} produced output instead of refusing`);
    assert.equal(e.reason, "sandbox_cell_malformed", `shape ${JSON.stringify(shape)}`);
  }
  // And the assembler's own vocabulary is closed: nothing outside these two kinds renders.
  assert.deepEqual([...SANDBOX_BLOCK_KINDS], ["text", "placeholder"]);
  const unknown = refusal(() => layoutSandbox({ payload: payload({
    body: { blocks: [{ kind: "chart_ref", basis_ref: "cell1" }] },
  }) }));
  assert.equal(unknown.reason, "sandbox_block_kind_unsupported",
    "an unrecognised block kind refuses rather than being silently dropped");
});

test("B3.5 (this lane's addition) — the watermark wall is unconditional and is a REFUSAL, never a renderer-authored default", () => {
  for (const wm of [undefined, null, {}, { watermark: "" }, { watermark: "   " }, { watermark: 42 }]) {
    const e = refusal(() => layoutSandbox({ payload: payload({ watermark: wm }) }));
    assert.ok(e instanceof RenderRefusal, `watermark ${JSON.stringify(wm)} did not refuse`);
    assert.equal(e.reason, "sandbox_watermark_unsealed");
  }
  const ok = layoutSandbox({ payload: payload() });
  assert.equal(ok.watermark, WATERMARK.watermark, "the PINNED policy text is carried verbatim, never re-resolved or re-worded");
});

test("B3.6 (this lane's addition) — a payload with NO `cells` key at all refuses rather than reading as 'no cells'", () => {
  // ABSENCE IS NOT EVIDENCE. A pre-seam payload (one built by the un-widened
  // clara.sandbox_export_payload) carries no `cells` object. Treating that as an empty map would
  // make every placeholder in the body silently unresolvable-but-plausible; it is instead a
  // payload this assembler cannot reason about, and it says so.
  const pre = payload();
  delete pre.cells;
  const e = refusal(() => shapeSandboxPayload(pre));
  assert.ok(e instanceof RenderRefusal);
  assert.equal(e.reason, "sandbox_payload_unseamed");
  // The twin: an EMPTY cells object on a placeholder-free body is lawful and renders.
  const textOnly = payload({
    body: { blocks: [{ kind: "text", basis_ref: "cell1", displayed_text: "prose only" }] },
    cells: {},
  });
  assert.match(layoutSandbox({ payload: textOnly }).source, /s\("prose only"\)/);
});
