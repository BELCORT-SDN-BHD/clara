// The former journal-local hook's regression cells now exercise the shared
// MoneyInput used by EntryLinesEditor. Keeping this file means deletion of the
// old implementation cannot leave its once-vacuous coverage green by accident.

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
  const [cents, setCents] = useState<number | null>(0);
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(MoneyInput, {
      "aria-label": "Debit",
      cents,
      mode: "unsigned",
      onValueChange: (change: MoneyInputChange) => {
        if (change.ok) setCents(change.cents);
        onChange(change);
      },
    }),
  });
}

test("FIX-3: typing '0.50' character-by-character preserves raw text and emits 50 cents", async () => {
  let last: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (change) => { last = change; } }));
  try {
    const input = findInput(h.container);
    for (const partial of ["0", "0.", "0.5", "0.50"]) {
      await h.act(() => { setFieldValue(input as never, partial); });
    }
    assert.deepEqual(last, { ok: true, cents: 50 });
    assert.equal(findInput(h.container).value, "0.50");
  } finally {
    await h.unmount();
  }
});

test("FIX-3: typing '1234.56' produces exactly 123456 cents", async () => {
  let last: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (change) => { last = change; } }));
  try {
    const input = findInput(h.container);
    for (const partial of ["1", "12", "123", "1234", "1234.", "1234.5", "1234.56"]) {
      await h.act(() => { setFieldValue(input as never, partial); });
    }
    assert.deepEqual(last, { ok: true, cents: 123456 });
    assert.equal(findInput(h.container).value, "1234.56");
  } finally {
    await h.unmount();
  }
});

test("task #14: an unsigned leading minus is visibly and structurally refused", async () => {
  let last: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (change) => { last = change; } }));
  try {
    await h.act(() => { setFieldValue(findInput(h.container) as never, "-5"); });
    assert.deepEqual(last, { ok: false, refusal: { code: "negative_not_allowed", input: "-5" } });
    assert.match(h.text(), /zero or a positive amount/);
  } finally {
    await h.unmount();
  }
});

test("resync: an external cents change formats the replacement value", async () => {
  function ResyncHarness() {
    const [cents, setCents] = useState<number | null>(0);
    return createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement("div", null,
        createElement(MoneyInput, { cents, mode: "unsigned", onValueChange: () => {} }),
        createElement("button", { type: "button", onClick: () => setCents(999) }, "Reset"),
      ),
    });
  }
  const h = await renderComponent(createElement(ResyncHarness));
  try {
    const button = h.find((node) => node.tagName === "BUTTON");
    assert.ok(button);
    await h.fireEvent(button, "click");
    assert.equal(findInput(h.container).value, "9.99");
  } finally {
    await h.unmount();
  }
});

test("resync: the component's own cents echo never clobbers mid-typed raw text", async () => {
  let last: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (change) => { last = change; } }));
  try {
    await h.act(() => { setFieldValue(findInput(h.container) as never, "2.5"); });
    assert.deepEqual(last, { ok: true, cents: 250 });
    assert.equal(findInput(h.container).value, "2.5");
  } finally {
    await h.unmount();
  }
});
