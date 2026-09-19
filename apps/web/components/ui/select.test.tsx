// components/ui/select.tsx — #1005 (the wrapper's own label-resolving path).
//
// Base UI's `<Select.Value>` renders the RAW `value` unless it is given a label source
// (https://base-ui.com/react/components/select#formatting-the-value). This file proves
// the WRAPPER mechanism directly. Five of the eleven converted call sites ALSO have their
// own dedicated first-render trigger-text cell (fix-round SPEC-1005-1/ADV-9 closed the
// residual): matching-section.test.tsx, activity-filters.test.tsx,
// knowledge-panel-freshness.test.tsx, knowledge-firm-panel.test.tsx and
// accounting-work-list.test.tsx (WorkListFilterBar's client/purpose/initiator triggers —
// this is the file `work-list-filters.tsx` itself is proved through). The remaining five —
// correction-wizard.tsx, document-kind-control.tsx, document-kind-dialog.tsx,
// unassigned-sources.tsx and work-question-form.tsx — now each carry their own first-render
// cell too (mounted with a preset value, no popup interaction needed), landed in the same
// fix round; see each file's own `.test.tsx`. `select-value-label-census.test.ts`
// (apps/web/tests/) is the repo-wide census that no NEW call site can skip both paths
// silently, including a bypass that reaches Base UI's own `Select.Value` around this
// wrapper.
//
// TypeScript already refuses a `<SelectValue>` with neither `items` nor a function
// `children` (the discriminated union in select.tsx) — these cells prove the RUNTIME
// behaviour of the two paths TypeScript allows, not the compile-time refusal itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

enableDomInspection();

async function mount(element: ReturnType<typeof createElement>) {
  const h = await renderComponent(element);
  for (let i = 0; i < 2; i++) await h.settle();
  return h;
}

test("[1005] items path: a sentinel value ('__all') renders its label, never the sentinel string, on first render", async () => {
  const h = await mount(
    createElement(
      Select,
      { value: "__all", onValueChange: () => {} },
      createElement(
        SelectTrigger,
        null,
        createElement(SelectValue, {
          placeholder: "Choose a period",
          items: [
            { value: "__all", label: "All periods" },
            { value: "p1", label: "Jan 2026" },
          ],
        }),
      ),
      createElement(
        SelectContent,
        null,
        createElement(SelectItem, { value: "__all" }, "All periods"),
        createElement(SelectItem, { value: "p1" }, "Jan 2026"),
      ),
    ),
  );
  try {
    // The popup is never opened — this is genuinely the FIRST render's own text.
    assert.match(h.text(), /All periods/, "the sentinel's label must render");
    assert.doesNotMatch(h.text(), /__all\b/, "the raw sentinel value must never render");
  } finally {
    await h.unmount();
  }
});

test("[1005] items path: a composed, field-built label (bank_name + account_number + coa code) renders whole, not the row id", async () => {
  const account = { id: "00b7052a-14d8-44dd-8966-c334945bf61a", bank_name_display: "Maybank", account_number: "5144-8700-3061", coa_account_code: "1020" };
  const h = await mount(
    createElement(
      Select,
      { value: account.id, onValueChange: () => {} },
      createElement(
        SelectTrigger,
        null,
        createElement(SelectValue, {
          placeholder: "Choose an account",
          items: [{ value: account.id, label: `${account.bank_name_display} ${account.account_number} · ${account.coa_account_code}` }],
        }),
      ),
      createElement(
        SelectContent,
        null,
        createElement(SelectItem, { value: account.id }, `${account.bank_name_display} ${account.account_number} · ${account.coa_account_code}`),
      ),
    ),
  );
  try {
    assert.match(h.text(), /Maybank 5144-8700-3061 · 1020/, "the composed label must render whole");
    assert.doesNotMatch(h.text(), /00b7052a-14d8-44dd-8966-c334945bf61a/, "the row id must never render");
  } finally {
    await h.unmount();
  }
});

test("[1005] items path: a value absent from items falls back to the placeholder, never the raw value", async () => {
  const h = await mount(
    createElement(
      Select,
      { value: "not-in-the-list", onValueChange: () => {} },
      createElement(
        SelectTrigger,
        null,
        createElement(SelectValue, {
          placeholder: "Nothing selected",
          items: [{ value: "a", label: "Option A" }],
        }),
      ),
      createElement(SelectContent, null, createElement(SelectItem, { value: "a" }, "Option A")),
    ),
  );
  try {
    assert.match(h.text(), /Nothing selected/, "an unmatched value must fall back to the placeholder");
    assert.doesNotMatch(h.text(), /not-in-the-list/, "an unmatched raw value must never render");
  } finally {
    await h.unmount();
  }
});

test("[1005] function-child path: a caller-supplied resolver (client-period-selector.tsx's own shape) still renders its resolved label", async () => {
  const items: Record<string, string> = { mtd: "Month to date", "2026-03": "March 2026" };
  const h = await mount(
    createElement(
      Select,
      { value: "2026-03", onValueChange: () => {} },
      createElement(
        SelectTrigger,
        null,
        createElement(SelectValue, {
          children: (value: unknown) => items[String(value)] ?? "",
        }),
      ),
      createElement(SelectContent, null, createElement(SelectItem, { value: "2026-03" }, "March 2026")),
    ),
  );
  try {
    assert.match(h.text(), /March 2026/, "the function child's resolved label must render");
    assert.doesNotMatch(h.text(), /2026-03/, "the raw value must never render alongside it");
  } finally {
    await h.unmount();
  }
});

test("[1005]: a node with textOf still reports the resolved label (sanity on the harness's own text walker)", async () => {
  const h = await mount(
    createElement(
      Select,
      { value: "x", onValueChange: () => {} },
      createElement(
        SelectTrigger,
        { id: "sanity-trigger" },
        createElement(SelectValue, { items: [{ value: "x", label: "Exactly X" }] }),
      ),
      createElement(SelectContent, null, createElement(SelectItem, { value: "x" }, "Exactly X")),
    ),
  );
  try {
    const trigger = h.find((n) => (n as unknown as { id?: string }).id === "sanity-trigger");
    assert.ok(trigger, "the trigger must be findable by id");
    assert.match(textOf(trigger!), /Exactly X/);
  } finally {
    await h.unmount();
  }
});
