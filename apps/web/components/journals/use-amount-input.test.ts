// use-amount-input.ts — mounted for real via test/hookHarness.ts (the property
// under test is WHAT HAPPENS ACROSS A SEQUENCE of keystrokes-then-rerenders,
// which a single static-markup pass cannot observe). Simulates the ACTUAL
// round-trip a controlled input goes through: `handleChange` fires (as a real
// keystroke would), the emitted cents value updates a PARENT-held variable,
// then the component re-renders with that new `cents` prop — exactly what
// EntryLinesEditor's `lines` state does on every keystroke.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useAmountInput } from "./use-amount-input";

test("FIX-3: typing '0.50' character-by-character keeps the raw text exactly as typed, and emits 50 cents (never 500)", async () => {
  let cents = 0;
  const onChange = (next: number) => {
    cents = next;
  };
  const h = await renderHook(() => useAmountInput(cents, onChange));
  try {
    await h.settle();
    assert.equal(h.current.raw, "");

    await h.act(() => h.current.handleChange("0"));
    await h.rerender(); // simulate the parent re-rendering with the (unchanged) cents prop
    assert.equal(h.current.raw, "0", "the OLD bug would have shown '' here (0 is falsy)");

    await h.act(() => h.current.handleChange("0."));
    await h.rerender();
    assert.equal(h.current.raw, "0.", "the OLD bug's toFixed(2) derivation could never produce a trailing dot");

    await h.act(() => h.current.handleChange("0.5"));
    await h.rerender();
    assert.equal(cents, 50, "0.5 ringgit is 50 cents");
    assert.equal(h.current.raw, "0.5", "the OLD bug would have reformatted this to '0.50' or worse mid-type");

    await h.act(() => h.current.handleChange("0.50"));
    await h.rerender();
    assert.equal(h.current.raw, "0.50");
    assert.equal(cents, 50, "still 50 cents — NOT the OLD bug's 500 (RM5.00)");
  } finally {
    await h.unmount();
  }
});

test("FIX-3: typing '1234.56' produces exactly 123456 cents, never 100 (the OLD bug's outcome)", async () => {
  let cents = 0;
  const onChange = (next: number) => {
    cents = next;
  };
  const h = await renderHook(() => useAmountInput(cents, onChange));
  try {
    await h.settle();
    for (const partial of ["1", "12", "123", "1234", "1234.", "1234.5", "1234.56"]) {
      await h.act(() => h.current.handleChange(partial));
      await h.rerender();
    }
    assert.equal(h.current.raw, "1234.56");
    assert.equal(cents, 123456);
  } finally {
    await h.unmount();
  }
});

test("N9: a pasted leading minus is stripped before it ever reaches onChange", async () => {
  let cents = -1;
  const onChange = (next: number) => {
    cents = next;
  };
  const h = await renderHook(() => useAmountInput(0, onChange));
  try {
    await h.settle();
    await h.act(() => h.current.handleChange("-5"));
    assert.equal(h.current.raw, "5", "the minus never even reaches the displayed raw text");
    assert.equal(cents, 500);
  } finally {
    await h.unmount();
  }
});

test("resync: an EXTERNAL cents change (not this component's own emission) resets raw — the FIX-5 revision-reset path", async () => {
  const onChange = () => {};
  let cents = 0;
  const h = await renderHook(() => useAmountInput(cents, onChange));
  try {
    await h.settle();
    await h.act(() => h.current.handleChange("7.00"));
    assert.equal(h.current.raw, "7.00");

    // Simulate the PARENT resetting the line (e.g. a fresh draft loaded with a
    // different amount) — this is NOT the component's own emission.
    cents = 999;
    await h.rerender();
    assert.equal(h.current.raw, "9.99", "an external cents change resyncs the raw text");
  } finally {
    await h.unmount();
  }
});

test("resync: the component's OWN emission (same cents echoed back) does NOT clobber mid-typed raw text", async () => {
  let cents = 0;
  const onChange = (next: number) => {
    cents = next;
  };
  const h = await renderHook(() => useAmountInput(cents, onChange));
  try {
    await h.settle();
    await h.act(() => h.current.handleChange("2.5"));
    await h.rerender(); // parent echoes the SAME 250 cents this call just emitted
    assert.equal(cents, 250);
    assert.equal(h.current.raw, "2.5", "still exactly what was typed — this is the whole fix");
  } finally {
    await h.unmount();
  }
});
