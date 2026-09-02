import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import type { FaParticularsInput } from "@/lib/registers/fixed-assets";
import { FaParticularsFields } from "./fa-particulars-fields";

enableDomInspection();

type Node = {
  tagName?: string;
  value?: string;
  childNodes?: Node[];
  getAttribute?: (name: string) => string | null;
};

const BASE: FaParticularsInput = {
  method: "straight_line",
  useful_life_months: 60,
  rate_bps: null,
  residual_cents: null,
  start_date: "2026-01-01",
  description: null,
  ca_class: null,
  is_commercial_vehicle: null,
  is_new: null,
};

function findById(container: unknown, id: string): Node {
  let found: Node | null = null;
  (function walk(node: Node) {
    if (node.getAttribute?.("id") === id) found = node;
    for (const child of node.childNodes ?? []) walk(child);
  })(container as Node);
  if (!found) throw new Error(`expected #${id}`);
  return found;
}

function Harness({ onChange }: { onChange: (next: FaParticularsInput) => void }) {
  const [value, setValue] = useState(BASE);
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null,
      createElement(FaParticularsFields, {
        idPrefix: "asset",
        value,
        onChange: (next: FaParticularsInput) => {
          setValue(next);
          onChange(next);
        },
      }),
      createElement("button", { type: "button", onClick: () => setValue({ ...BASE, residual_cents: 99_900 }) }, "Load asset"),
    ),
  });
}

test("F1: the migrated residual door preserves '5' then '50' and emits RM50.00", async () => {
  let last = BASE;
  const h = await renderComponent(createElement(Harness, { onChange: (next) => { last = next; } }));
  try {
    const input = findById(h.container, "asset-residual");
    await h.act(() => { setFieldValue(input as never, "5"); });
    assert.equal(last.residual_cents, 500);
    await h.act(() => { setFieldValue(input as never, "50"); });
    assert.equal(last.residual_cents, 5000);
    assert.equal(findById(h.container, "asset-residual").value, "50");
  } finally {
    await h.unmount();
  }
});

test("F1: a decimal sequence remains raw while exact cents reach the parent", async () => {
  let last = BASE;
  const h = await renderComponent(createElement(Harness, { onChange: (next) => { last = next; } }));
  try {
    const input = findById(h.container, "asset-residual");
    for (const partial of ["1", "12", "12.", "12.5"]) {
      await h.act(() => { setFieldValue(input as never, partial); });
    }
    assert.equal(last.residual_cents, 1250);
    assert.equal(findById(h.container, "asset-residual").value, "12.5");
  } finally {
    await h.unmount();
  }
});

test("F1: clearing the residual emits null, never zero", async () => {
  let last: FaParticularsInput = { ...BASE, residual_cents: 500 };
  const h = await renderComponent(createElement(Harness, { onChange: (next) => { last = next; } }));
  try {
    const input = findById(h.container, "asset-residual");
    await h.act(() => { setFieldValue(input as never, ""); });
    assert.equal(last.residual_cents, null);
  } finally {
    await h.unmount();
  }
});

test("F1: a new asset's externally supplied cents resync the shared field", async () => {
  const h = await renderComponent(createElement(Harness, { onChange: () => {} }));
  try {
    const button = h.find((node) => node.tagName === "BUTTON");
    assert.ok(button);
    await h.fireEvent(button, "click");
    assert.equal(findById(h.container, "asset-residual").value, "999.00");
  } finally {
    await h.unmount();
  }
});

test("F1: a stored residual of 0 is visibly 0.00, never blank", async () => {
  const h = await renderComponent(createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(FaParticularsFields, {
      idPrefix: "stored-zero",
      value: { ...BASE, residual_cents: 0 },
      onChange: () => {},
    }),
  }));
  try {
    assert.equal(findById(h.container, "stored-zero-residual").value, "0.00");
  } finally {
    await h.unmount();
  }
});
