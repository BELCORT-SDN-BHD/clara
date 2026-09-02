// The former opening-only implementation's cells now pin the signed mode of
// the shared MoneyInput used by equity_net and obe_plug.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { MoneyInput, type MoneyInputChange } from "./money-input";

enableDomInspection();

type Node = { tagName?: string; value?: string; childNodes?: Node[] };

function findInput(container: unknown): Node {
  let found: Node | null = null;
  (function walk(node: Node) {
    if (node.tagName === "INPUT") found = node;
    for (const child of node.childNodes ?? []) walk(child);
  })(container as Node);
  if (!found) throw new Error("expected one money input");
  return found;
}

function Harness({ onChange }: { onChange: (change: MoneyInputChange) => void }) {
  const [cents, setCents] = useState<number | null>(null);
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(MoneyInput, {
      cents,
      mode: "signed",
      onValueChange: (change: MoneyInputChange) => {
        if (change.ok) setCents(change.cents);
        onChange(change);
      },
    }),
  });
}

async function typeOnce(value: string): Promise<{ change: MoneyInputChange | null; raw: string; text: string }> {
  let change: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (next) => { change = next; } }));
  try {
    await h.act(() => { setFieldValue(findInput(h.container) as never, value); });
    return { change, raw: findInput(h.container).value ?? "", text: h.text() };
  } finally {
    await h.unmount();
  }
}

test("signed shared input: typing '5' then '50' lands 5000 cents without clobbering", async () => {
  let last: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (next) => { last = next; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "5"); });
    assert.deepEqual(last, { ok: true, cents: 500 });
    await h.act(() => { setFieldValue(input as never, "50"); });
    assert.deepEqual(last, { ok: true, cents: 5000 });
    assert.equal(findInput(h.container).value, "50");
  } finally {
    await h.unmount();
  }
});

test("signed shared input: a leading minus reaches exact negative cents", async () => {
  assert.deepEqual((await typeOnce("-12.34")).change, { ok: true, cents: -1234 });
});

test("signed shared input: '-' remains a reachable incomplete keystroke", async () => {
  assert.deepEqual((await typeOnce("-")).change, { ok: true, cents: null });
});

test("signed shared input: clearing emits null instead of zero", async () => {
  assert.deepEqual((await typeOnce("")).change, { ok: true, cents: null });
});

test("signed shared input: exponent notation is a typed, visible refusal", async () => {
  const result = await typeOnce("1e3");
  assert.deepEqual(result.change, { ok: false, refusal: { code: "invalid_format", input: "1e3" } });
  assert.match(result.text, /Exponents/);
});

test("signed shared input: '0.50' lands 50 cents and remains exactly typed", async () => {
  const result = await typeOnce("0.50");
  assert.deepEqual(result.change, { ok: true, cents: 50 });
  assert.equal(result.raw, "0.50");
});
