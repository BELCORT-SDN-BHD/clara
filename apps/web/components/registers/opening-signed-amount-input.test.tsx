// F1 (fix round, rev-t2, HIGH — accounting): a DIRECT test on
// SignedAmountInput/useSignedAmountInput, mirroring
// staff-advance-money-input.test.tsx's own key-by-key proof style. The
// discriminating cases are exactly the ones the finding named: "5" then "0"
// (two keystrokes) must land 5000 cents, not 500 re-derived wrong; a
// negative amount must be REACHABLE by keystroke (the sign IS the accounting
// direction for equity_net/obe_plug); "" and "-" alone are `null`, never
// coerced to 0 or NaN; "1e3" is refused (parseAmountToCents's regex has no
// exponent arm); "0.50" echoes back exactly "0.50" (never re-derived to
// "0.50" from a recomputed toFixed — the same value= {raw} discipline
// staff-advance-money-input.tsx's own header names).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { SignedAmountInput } from "./opening-signed-amount-input";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

function findAllIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

function findInput(container: unknown): Node {
  const inputs = findAllIn(container as Node, (n) => n.tagName === "INPUT");
  if (inputs.length !== 1) throw new Error(`expected exactly one input, found ${inputs.length}`);
  return inputs[0]!;
}

function Harness({ onChange }: { onChange: (cents: number | null) => void }) {
  const [cents, setCents] = useState<number | null>(null);
  return createElement(SignedAmountInput, {
    cents,
    onChange: (c: number | null) => {
      setCents(c);
      onChange(c);
    },
  });
}

test("typing '5' then '0' (two keystrokes) lands 5000 cents, and the field reads exactly '50'", async () => {
  let last: number | null = -1;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { last = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "5"); });
    assert.equal(last, 500, "typing '5' alone must be read as RM5.00 (500 cents)");
    await h.act(() => { setFieldValue(input as never, "50"); });
    assert.equal(last, 5000, "typing '50' must be read as RM50.00 (5000 cents) — the bug this fix exists for landed 5-then-0 as RM5.000, still 500 cents");
    const inputAfter = findInput(h.container);
    assert.equal((inputAfter as unknown as { value: string }).value, "50", "the field must echo exactly what was typed");
  } finally {
    await h.unmount();
  }
});

test("a leading '-' is REACHABLE by keystroke — the sign is the accounting direction", async () => {
  let last: number | null = 0;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { last = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "-12.34"); });
    assert.equal(last, -1234, "'-12.34' must parse to exactly -1234 cents, not be stripped or erased");
  } finally {
    await h.unmount();
  }
});

test("'-' alone is null (not NaN, not 0, not erased into a positive number)", async () => {
  let last: number | null = 0;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { last = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "-"); });
    assert.equal(last, null, "'-' alone (mid-keystroke on a negative number) must be null — not yet a number, never silently 0");
  } finally {
    await h.unmount();
  }
});

test("'' is null, never coerced to 0 — a signed accounting amount has no safe default direction", async () => {
  let last: number | null = 0;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { last = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "5"); });
    assert.equal(last, 500);
    await h.act(() => { setFieldValue(input as never, ""); });
    assert.equal(last, null, "clearing the field must be null, never fall back to 0 or the last value");
  } finally {
    await h.unmount();
  }
});

test("'1e3' is refused (null) — the parser has no exponent arm", async () => {
  let last: number | null = 0;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { last = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "1e3"); });
    assert.equal(last, null, "'1e3' must not silently parse as 100000 cents (or anything else) — it is not a valid decimal amount");
  } finally {
    await h.unmount();
  }
});

test("'0.50' lands 50 cents and echoes back exactly '0.50', never re-derived", async () => {
  let last: number | null = 0;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { last = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "0.50"); });
    assert.equal(last, 50, "'0.50' must parse to exactly 50 cents");
    const inputAfter = findInput(h.container);
    assert.equal((inputAfter as unknown as { value: string }).value, "0.50", "the field must echo exactly '0.50', not a recomputed string");
  } finally {
    await h.unmount();
  }
});
