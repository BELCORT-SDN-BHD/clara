// The former register-local implementation's cells now exercise the shared
// unsigned MoneyInput used by staff advances and opening-balance editors.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { MoneyInput, type MoneyInputChange } from "../common/money-input";

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
  const [cents, setCents] = useState<number | null>(0);
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(MoneyInput, {
      "aria-label": "Amount",
      cents,
      mode: "unsigned",
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

test("unsigned shared input: typing '5' then '50' lands 5000 cents and preserves raw text", async () => {
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

test("unsigned shared input: '0.50' lands 50 cents", async () => {
  assert.deepEqual((await typeOnce("0.50")).change, { ok: true, cents: 50 });
});

test("unsigned shared input: '12.34' lands 1234 cents", async () => {
  assert.deepEqual((await typeOnce("12.34")).change, { ok: true, cents: 1234 });
});

test("unsigned shared input: a leading minus is refused, never stripped to a positive amount", async () => {
  const result = await typeOnce("-12.34");
  assert.deepEqual(result.change, { ok: false, refusal: { code: "negative_not_allowed", input: "-12.34" } });
  assert.equal(result.raw, "-12.34");
  assert.match(result.text, /zero or a positive amount/);
});
