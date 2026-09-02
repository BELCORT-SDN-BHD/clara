import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import {
  MoneyInput,
  type MoneyInputChange,
  type MoneyInputMode,
} from "./money-input";

enableDomInspection();

type Node = {
  tagName?: string;
  value?: string;
  inputMode?: string;
  disabled?: boolean;
  readOnly?: boolean;
  childNodes?: Node[];
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
};

function findInput(container: unknown): Node {
  let found: Node | null = null;
  (function walk(node: Node) {
    if (node.tagName === "INPUT") found = node;
    for (const child of node.childNodes ?? []) walk(child);
  })(container as Node);
  if (!found) throw new Error("expected the money input to render");
  return found;
}

function Harness({
  mode = "unsigned",
  initialCents = 0,
  onChange,
}: {
  mode?: MoneyInputMode;
  initialCents?: number | null;
  onChange: (change: MoneyInputChange) => void;
}) {
  const [cents, setCents] = useState<number | null>(initialCents);
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(MoneyInput, {
      "aria-label": "Amount",
      cents,
      mode,
      onValueChange: (change: MoneyInputChange) => {
        if (change.ok) setCents(change.cents);
        onChange(change);
      },
    }),
  });
}

test("MoneyInput: typing RM50 key by key keeps '50' visible and emits exactly 5000 cents", async () => {
  let last: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (change) => { last = change; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "5"); });
    assert.deepEqual(last, { ok: true, cents: 500 });
    await h.act(() => { setFieldValue(input as never, "50"); });
    assert.deepEqual(last, { ok: true, cents: 5000 });
    assert.equal(findInput(h.container).value, "50", "the parent echo must not reformat or drop the second keystroke");
  } finally {
    await h.unmount();
  }
});

test("MoneyInput: a grouped paste emits exact cents and blur formats through the existing formatter", async () => {
  let last: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (change) => { last = change; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "1234.56"); });
    assert.deepEqual(last, { ok: true, cents: 123456 });
    await h.fireEvent(input as never, "focusout");
    assert.equal(findInput(h.container).value, "1,234.56", "blur uses formatCents instead of float formatting");
  } finally {
    await h.unmount();
  }
});

test("MoneyInput: malformed text emits a typed refusal and visible error, never accepted zero", async () => {
  const changes: MoneyInputChange[] = [];
  const h = await renderComponent(createElement(Harness, { onChange: (change) => { changes.push(change); } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "not money"); });
    assert.deepEqual(changes.at(-1), {
      ok: false,
      refusal: { code: "invalid_format", input: "not money" },
    });
    assert.equal(changes.some((change) => change.ok && change.cents === 0), false, "junk must never fall back to accepted zero cents");
    assert.match(h.text(), /Enter an amount like 1,234\.56/);
    assert.equal(input.getAttribute?.("aria-invalid"), "true");
    const describedBy = input.getAttribute?.("aria-describedby");
    assert.ok(describedBy, "the visible refusal copy must be associated to the input");
    const refusal = h.find((node) => (node as Node).getAttribute?.("id") === describedBy) as Node | null;
    assert.ok(refusal, "aria-describedby must resolve to the rendered refusal copy");
    assert.equal(refusal?.getAttribute?.("role"), "alert");
  } finally {
    await h.unmount();
  }
});

test("MoneyInput: exponent notation is visibly refused instead of becoming RM1,000.00", async () => {
  let last: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (change) => { last = change; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "1e3"); });
    assert.deepEqual(last, { ok: false, refusal: { code: "invalid_format", input: "1e3" } });
    assert.match(h.text(), /Exponents and decimal commas aren't accepted/);
  } finally {
    await h.unmount();
  }
});

test("MoneyInput: decimal-comma input is visibly refused before commas can be stripped", async () => {
  let last: MoneyInputChange | null = null;
  const h = await renderComponent(createElement(Harness, { onChange: (change) => { last = change; } }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "1234,56"); });
    assert.deepEqual(last, { ok: false, refusal: { code: "invalid_format", input: "1234,56" } });
    assert.match(h.text(), /decimal commas aren't accepted/);
  } finally {
    await h.unmount();
  }
});

test("MoneyInput: signed mode accepts -50.00 and unsigned mode visibly refuses it", async () => {
  let signedChange: MoneyInputChange | null = null;
  const signed = await renderComponent(createElement(Harness, {
    mode: "signed",
    initialCents: null,
    onChange: (change) => { signedChange = change; },
  }));
  try {
    await signed.act(() => { setFieldValue(findInput(signed.container) as never, "-50.00"); });
    assert.deepEqual(signedChange, { ok: true, cents: -5000 });
    assert.doesNotMatch(signed.text(), /Enter zero or a positive amount/);
  } finally {
    await signed.unmount();
  }

  let unsignedChange: MoneyInputChange | null = null;
  const unsigned = await renderComponent(createElement(Harness, { onChange: (change) => { unsignedChange = change; } }));
  try {
    await unsigned.act(() => { setFieldValue(findInput(unsigned.container) as never, "-50.00"); });
    assert.deepEqual(unsignedChange, {
      ok: false,
      refusal: { code: "negative_not_allowed", input: "-50.00" },
    });
    assert.match(unsigned.text(), /Enter zero or a positive amount/);
  } finally {
    await unsigned.unmount();
  }
});

test("MoneyInput: refusal state passes the shared a11y and keyboard instruments", async () => {
  const h = await renderComponent(createElement(Harness, { onChange: () => {} }));
  try {
    const input = findInput(h.container);
    await h.act(() => { setFieldValue(input as never, "1e3"); });
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
    assert.match(textOf(h.container as never), /Exponents/);
  } finally {
    await h.unmount();
  }
});

test("MoneyInput: decimal keyboard, disabled, and read-only states reach the native input", () => {
  const markup = renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(MoneyInput, {
      "aria-label": "Amount",
      cents: 500,
      mode: "unsigned",
      onValueChange: () => {},
      disabled: true,
      readOnly: true,
    }),
  }));
  assert.match(markup, /inputMode="decimal"/);
  assert.match(markup, / disabled=""/);
  assert.match(markup, / readOnly=""/);
});
