// F1 regression (independent review, fix-required, 2026-08-28): mounted for
// real via test/hookHarness.ts's renderHook, the same instrument
// components/journals/use-amount-input.test.ts uses for the identical
// property — a single static-markup pass cannot observe what happens ACROSS
// a sequence of keystrokes-then-rerenders, which is exactly the bug class
// here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useResidualCentsField } from "./fa-particulars-fields";

test("F1: typing '5' then '0' produces RM50.00 (5000 cents), never the old bug's RM5.00 (500 cents)", async () => {
  let residualCents: number | null = null;
  const onChange = (next: number | null) => {
    residualCents = next;
  };
  const h = await renderHook(() => useResidualCentsField(residualCents, onChange));
  try {
    await h.settle();
    assert.equal(h.current.raw, "");

    await h.act(() => h.current.handleChange("5"));
    await h.rerender(); // simulate the parent re-rendering with the cents this call just emitted
    assert.equal(residualCents, 500, "5 alone is RM5.00 = 500 cents");
    assert.equal(h.current.raw, "5", "the OLD bug would have shown '5.00' here, fighting the next keystroke");

    await h.act(() => h.current.handleChange("50"));
    await h.rerender();
    assert.equal(residualCents, 5000, "the OLD bug would have landed 500 (RM5.00) here — this is the fix");
    assert.equal(h.current.raw, "50");
  } finally {
    await h.unmount();
  }
});

test("F1: typing '12.5' char-by-char never gets clobbered mid-decimal", async () => {
  let residualCents: number | null = null;
  const onChange = (next: number | null) => {
    residualCents = next;
  };
  const h = await renderHook(() => useResidualCentsField(residualCents, onChange));
  try {
    await h.settle();
    for (const partial of ["1", "12", "12.", "12.5"]) {
      await h.act(() => h.current.handleChange(partial));
      await h.rerender();
    }
    assert.equal(h.current.raw, "12.5");
    assert.equal(residualCents, 1250);
  } finally {
    await h.unmount();
  }
});

test("F1: clearing the field emits null, not 0 — residual_cents stays optional", async () => {
  let residualCents: number | null = 500;
  const onChange = (next: number | null) => {
    residualCents = next;
  };
  const h = await renderHook(() => useResidualCentsField(residualCents, onChange));
  try {
    await h.settle();
    assert.equal(h.current.raw, "5.00");
    await h.act(() => h.current.handleChange(""));
    await h.rerender();
    assert.equal(residualCents, null);
    assert.equal(h.current.raw, "");
  } finally {
    await h.unmount();
  }
});

test("F1: an EXTERNAL cents change (not this hook's own emission) resyncs raw — e.g. the parent loaded a different asset", async () => {
  let residualCents: number | null = null;
  const onChange = () => {};
  const h = await renderHook(() => useResidualCentsField(residualCents, onChange));
  try {
    await h.settle();
    await h.act(() => h.current.handleChange("7.00"));
    assert.equal(h.current.raw, "7.00");

    residualCents = 99900; // a different asset's own residual, not this hook's emission
    await h.rerender();
    assert.equal(h.current.raw, "999.00", "an external cents change resyncs the raw text");
  } finally {
    await h.unmount();
  }
});
