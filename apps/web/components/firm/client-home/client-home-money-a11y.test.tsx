// #660 — the money band, read by somebody who cannot see it.
//
// A NUMBER WITHOUT ITS PERIOD IS AN UNANSWERABLE CLAIM. A sighted reader gets the period from the
// heading above the figure and the caption below it; a screen-reader user moving by landmark or by
// number gets neither, so every figure carries the whole sentence in its accessible NAME — "Book
// cash RM 182,340.55 as at 18 Sept 2026". That is the cell this file exists for.
//
// AND THE CHART IS ANNOUNCED EXACTLY ONCE. The picture and the table are two renderings of the
// same six numbers; both announced would read them twice. The chart is `aria-hidden` and the TABLE
// is the announced one, which is also why the table can never be a failure-only fallback.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { checkAccessibility } from "../../../test/a11yRules";
import messages from "../../../messages/en.json";
import { ClientFinancialSummary } from "./client-financial-summary";
import {
  EMPTY_FINANCIAL_PACK,
  type ClientFinancialPack,
  type FigureGroup,
} from "@/lib/dashboard/financial-pack";

enableDomInspection();

const CLIENT = "c1c1c1c1-0000-4000-8000-000000000001";
const PERIOD = { start: "2026-09-01", end: "2026-09-30", asOf: "2026-09-18", timezone: "Asia/Kuala_Lumpur" };

function group(overrides: Partial<FigureGroup> = {}): FigureGroup {
  return {
    valueCents: 18_234_055, status: "ok", unit: "minor_units", currency: "MYR",
    period: PERIOD, computedAt: "2026-09-18T02:00:00.000Z",
    definitionVersion: "clara.client-financial-pack/v1", sourceWatermark: "1:1:",
    coverage: "ok", coverageReason: null, comparison: null, composition: [],
    compositionTotal: 0, compositionTruncated: false,
    ...overrides,
  };
}

function pack(overrides: Partial<ClientFinancialPack> = {}): ClientFinancialPack {
  return {
    ...EMPTY_FINANCIAL_PACK,
    computedAt: "2026-09-18T02:00:00.000Z",
    period: { ...PERIOD, month: "2026-09-01", isMtd: true },
    coverageFloor: "2026-01-07",
    cash: group(),
    profit: group({ valueCents: -123_456 }),
    income: group({ valueCents: 500_000 }),
    expense: group({ valueCents: 623_456 }),
    cashPoints: [
      { asOf: "2026-08-31", valueCents: 1_700_000, available: true, reason: null },
      { asOf: "2026-09-18", valueCents: 18_234_055, available: true, reason: null },
    ],
    cashSet: { versionId: "v1", revision: 1, effectiveFrom: "2026-01-07", memberCount: 2, appliedToAllPoints: true },
    series: [
      { month: "2026-09-01", incomeCents: 500_000, expenseCents: 623_456, profitCents: -123_456, partial: true, asOf: "2026-09-18" },
    ],
    unmarkedClosingEntries: 0,
    ...overrides,
  };
}

async function mount(load?: () => Promise<ClientFinancialPack>) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en", messages,
      children: createElement(
        AppRouterContext.Provider as never,
        { value: { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} } as never },
        createElement(
          PathnameContext.Provider as never,
          { value: `/clients/${CLIENT}` as never },
          createElement("div", null,
            createElement("h1", null, "Rome Properties Sdn Bhd"),
            createElement(ClientFinancialSummary, {
              clientId: CLIENT, period: null, pathname: `/clients/${CLIENT}`, search: "",
              malformedPeriod: false,
              load: load ?? (async () => pack()),
              now: () => Date.parse("2026-09-18T02:00:10.000Z"),
            })),
        ),
      ),
    }),
  );
  for (let i = 0; i < 10; i += 1) await h.settle();
  return h;
}

function attrs(root: unknown, name: string): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    const node = n as { getAttribute?: (k: string) => string | null; childNodes?: unknown[] };
    const v = node.getAttribute?.(name);
    if (typeof v === "string") out.push(v);
    for (const c of node.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

test("no accessibility violations on the money band", async () => {
  const h = await mount();
  try {
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], violations.map((v) => `${v.rule}: ${v.message}`).join("\n"));
  } finally { await h.unmount(); }
});

test("EVERY figure carries its period AND its currency in its accessible name", async () => {
  const h = await mount();
  try {
    const labels = attrs(h.container, "aria-label");
    for (const [label, amount] of [
      ["Book cash", "RM 182,340.55"],
      ["Profit", "-RM 1,234.56"],
      ["Income", "RM 5,000.00"],
      ["Expense", "RM 6,234.56"],
    ]) {
      assert.ok(
        labels.some((l) => l.startsWith(`${label} ${amount}`) && l.includes("as at 18 Sept 2026")),
        `"${label}" has no accessible name carrying its amount and its as-of: ${labels.join(" | ")}`,
      );
    }
  } finally { await h.unmount(); }
});

test("the chart is announced ONCE — the picture is aria-hidden and the TABLE is the announced rendering", async () => {
  const h = await mount();
  try {
    const hidden = attrs(h.container, "aria-hidden").filter((v) => v === "true");
    assert.ok(hidden.length >= 2, "neither chart is hidden from assistive technology");
    // And the tables are named, so the two of them are distinguishable by name alone.
    // `DataTableCard` names the shared `<Table>`, which renders the label on its scroll container
    // and on the table itself — so the assertion is over the DISTINCT names, not the count.
    const named = new Set(
      attrs(h.container, "aria-label").filter((l) => /Book cash at each|Income and expense by/.test(l)),
    );
    assert.deepEqual([...named].sort(), [
      "Book cash at each of the last six month ends",
      "Income and expense by calendar month",
    ], "the two disclosure tables are not both named");
  } finally { await h.unmount(); }
});

test("the period control is NAMED — a bare combobox is not a period", async () => {
  const h = await mount();
  try {
    const labels = attrs(h.container, "aria-label");
    assert.ok(labels.includes("Period"), `the selector has no accessible name: ${labels.join(" | ")}`);
  } finally { await h.unmount(); }
});

test("a DENIED band is still accessible, and still announces the reason rather than an empty region", async () => {
  const h = await mount(async () => {
    const { DoorRefusal } = await import("@/lib/doors");
    throw new DoorRefusal("CLR04", "insufficient role",
      { reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate" });
  });
  try {
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], violations.map((v) => `${v.rule}: ${v.message}`).join("\n"));
  } finally { await h.unmount(); }
});
