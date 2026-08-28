// F3 (independent review, fix-required, 2026-08-28): a DIRECT test on
// CentsInput/useCentsInput — shared by T4's adjustment-lines-editor.tsx and
// T5's staff-advance-lines-editor.tsx, it had ZERO direct coverage of its
// own before this. Key-by-key sequences, proven behaviourally, not asserted:
// this file's own header explains the bug it exists to avoid (a value
// RE-DERIVED from `cents` every render fights the user mid-keystroke). The
// discriminating test is typing a WHOLE number with no decimals ("50") and
// asserting the field reads exactly "50" — a naive `(cents/100).toFixed(2)`
// re-derivation would show "50.00" instead, which is a DIFFERENT string for
// the SAME cents value, so this catches the `value={raw}` -> re-derived
// mutant the plain cents assertion alone would miss.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { CentsInput } from "./staff-advance-money-input";

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

function Harness({ onChange }: { onChange: (cents: number) => void }) {
  const [cents, setCents] = useState(0);
  return createElement(CentsInput, {
    ariaLabel: "Amount",
    cents,
    onChange: (c: number) => {
      setCents(c);
      onChange(c);
    },
  });
}

function findInput(container: unknown): Node {
  const inputs = findAllIn(container as Node, (n) => n.tagName === "INPUT");
  if (inputs.length !== 1) throw new Error(`expected exactly one input, found ${inputs.length}`);
  return inputs[0]!;
}

test("typing '5' then '0' (two keystrokes) lands 5000 cents, and the field reads exactly '50' — never '50.00' (proves value={raw}, not a re-derivation from cents)", async () => {
  let lastCents = -1;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { lastCents = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "5"); });
    assert.equal(lastCents, 500, "typing '5' alone must be read as RM5.00 (500 cents)");
    await h.act(() => { setFieldValue(input as never, "50"); });
    assert.equal(lastCents, 5000, "typing '50' must be read as RM50.00 (5000 cents)");
    const inputAfter = findInput(h.container);
    assert.equal((inputAfter as unknown as { value: string }).value, "50", "the field must echo exactly what was typed, '50' — a value RE-DERIVED from cents would show '50.00' instead");
  } finally {
    await h.unmount();
  }
});

test("typing '0.50' lands 50 cents", async () => {
  let lastCents = -1;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { lastCents = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "0.50"); });
    assert.equal(lastCents, 50, "'0.50' must parse to exactly 50 cents");
  } finally {
    await h.unmount();
  }
});

test("typing '12.34' lands 1234 cents", async () => {
  let lastCents = -1;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { lastCents = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "12.34"); });
    assert.equal(lastCents, 1234, "'12.34' must parse to exactly 1234 cents");
  } finally {
    await h.unmount();
  }
});

test("a pasted/typed leading minus is stripped — debit/credit/allocation cents are unconditionally non-negative", async () => {
  let lastCents = -1;
  const h = await renderComponent(createElement(Harness, { onChange: (c) => { lastCents = c; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "-12.34"); });
    assert.equal(lastCents, 1234, "a leading minus must be stripped, never posted as a negative cents value");
  } finally {
    await h.unmount();
  }
});
