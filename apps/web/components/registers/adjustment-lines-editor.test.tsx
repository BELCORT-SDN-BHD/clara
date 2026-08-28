// F3 (independent review, fix-required, 2026-08-28): AdjustmentLinesEditor
// had ZERO test coverage — three mutants survived green (returning null;
// breaking the debit/credit XOR at line ~95; the T3-F1-class money-input bug
// reintroduced in the shared CentsInput). This file drives real key
// sequences through the rendered editor and asserts on the emitted `lines`
// array — never a rendered-string proxy. `enableDomInspection()` is required
// at module top (before any render) for NextIntlClientProvider's own
// context to reach the tree — the same requirement every other component
// test in this domain carries.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { AdjustmentLinesEditor, sumAdjustmentLines } from "./adjustment-lines-editor";
import type { AdjustmentTemplateLineInput } from "@/lib/registers/adjustments";

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

function byAriaLabel(label: string) {
  return (n: Node) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("aria-label") === label;
}

const ACCOUNTS = [
  { client_id: "c1", account_code: "5100", name: "Rent expense", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
  { client_id: "c1", account_code: "2100", name: "Accrued liabilities", account_type: "liability", account_class: null, special_acc_type: null, is_active: true },
];

function Harness({ onLines }: { onLines: (lines: AdjustmentTemplateLineInput[]) => void }) {
  const [lines, setLines] = useState<AdjustmentTemplateLineInput[]>([
    { account_code: "5100", debit_cents: 0, credit_cents: 0 },
    { account_code: "2100", debit_cents: 0, credit_cents: 0 },
  ]);
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(AdjustmentLinesEditor, {
      lines,
      accounts: ACCOUNTS,
      onChange: (next: AdjustmentTemplateLineInput[]) => {
        setLines(next);
        onLines(next);
      },
    }),
  });
}

test("AdjustmentLinesEditor renders two real rows with real Debit/Credit inputs (not null, not a placeholder)", async () => {
  const h = await renderComponent(createElement(Harness, { onLines: () => {} }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const debitInputs = findAllIn(h.container as never, byAriaLabel("Debit"));
    const creditInputs = findAllIn(h.container as never, byAriaLabel("Credit"));
    assert.equal(debitInputs.length, 2, "both default lines' debit fields must be reachable");
    assert.equal(creditInputs.length, 2, "both default lines' credit fields must be reachable");
  } finally {
    await h.unmount();
  }
});

test("typing into a line's Debit field clears that SAME line's credit (the XOR), and leaves the other line untouched", async () => {
  let captured: AdjustmentTemplateLineInput[] = [];
  const h = await renderComponent(createElement(Harness, { onLines: (l) => { captured = l; } }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();

    // Pre-set line 0's credit to a nonzero value first, so clearing it on
    // the SAME line is an observable, discriminating change — not merely
    // "still zero, always was".
    const creditInputs = findAllIn(h.container as never, byAriaLabel("Credit"));
    await h.act(() => { setFieldValue(creditInputs[0] as never, "10.00"); });
    for (let i = 0; i < 2; i++) await h.settle();
    assert.equal(captured[0]!.credit_cents, 1000, "the credit field must have taken the typed value first");

    const debitInputsAfter = findAllIn(h.container as never, byAriaLabel("Debit"));
    await h.act(() => { setFieldValue(debitInputsAfter[0] as never, "5"); });
    await h.act(() => { setFieldValue(debitInputsAfter[0] as never, "50"); });
    for (let i = 0; i < 2; i++) await h.settle();

    assert.equal(captured[0]!.debit_cents, 5000, "line 0's debit must land 5000 cents");
    assert.equal(captured[0]!.credit_cents, 0, "line 0's credit must be cleared to 0 the moment its own debit is set (the XOR)");
    assert.equal(captured[1]!.debit_cents, 0, "the OTHER line's debit must be untouched");
    assert.equal(captured[1]!.credit_cents, 0, "the OTHER line's credit must be untouched");
  } finally {
    await h.unmount();
  }
});

test("typing into a line's Credit field clears that SAME line's debit (the XOR, mirrored)", async () => {
  let captured: AdjustmentTemplateLineInput[] = [];
  const h = await renderComponent(createElement(Harness, { onLines: (l) => { captured = l; } }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();

    const debitInputs = findAllIn(h.container as never, byAriaLabel("Debit"));
    await h.act(() => { setFieldValue(debitInputs[1] as never, "25.00"); });
    for (let i = 0; i < 2; i++) await h.settle();
    assert.equal(captured[1]!.debit_cents, 2500, "the debit field must have taken the typed value first");

    const creditInputsAfter = findAllIn(h.container as never, byAriaLabel("Credit"));
    await h.act(() => { setFieldValue(creditInputsAfter[1] as never, "12.34"); });
    for (let i = 0; i < 2; i++) await h.settle();

    assert.equal(captured[1]!.credit_cents, 1234, "line 1's credit must land 1234 cents");
    assert.equal(captured[1]!.debit_cents, 0, "line 1's debit must be cleared to 0 the moment its own credit is set (the XOR)");
  } finally {
    await h.unmount();
  }
});

test("sumAdjustmentLines: balanced only when total debits equal total credits", () => {
  const balanced = sumAdjustmentLines([
    { account_code: "5100", debit_cents: 1000, credit_cents: 0 },
    { account_code: "2100", debit_cents: 0, credit_cents: 1000 },
  ]);
  assert.equal(balanced.balanced, true);
  assert.equal(balanced.debitCents, 1000);
  assert.equal(balanced.creditCents, 1000);

  const unbalanced = sumAdjustmentLines([
    { account_code: "5100", debit_cents: 1000, credit_cents: 0 },
    { account_code: "2100", debit_cents: 0, credit_cents: 500 },
  ]);
  assert.equal(unbalanced.balanced, false);
});
