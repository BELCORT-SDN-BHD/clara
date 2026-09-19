// #660 — the money band, driven by a keyboard alone.
//
// THE PERIOD CONTROL AND EVERY DRILLDOWN MUST BE REACHABLE, and the table's scroll container has
// to be among them: a `overflow-auto` region that scrolls with the mouse and not with the keyboard
// is a WCAG 2.1.1 failure that no visual review catches. `components/ui/table.tsx`'s own container
// carries `tabindex="0"` for exactly that reason (`table-scroll-region.test.tsx:34-39`), and this
// file checks that the money band's two disclosure tables inherit it rather than hand-rolling a
// scroll box that does not.
//
// AND NO POSITIVE TABINDEX ANYWHERE. A positive value reorders the whole document's tab sequence,
// not just this band's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { checkKeyboardWalk, focusableElements, positiveTabIndexElements } from "../../../test/keyboardWalk";
import messages from "../../../messages/en.json";
import { ClientFinancialSummary } from "./client-financial-summary";
import {
  EMPTY_FINANCIAL_PACK,
  type ClientFinancialPack,
  type FigureGroup,
} from "@/lib/dashboard/financial-pack";

enableDomInspection();

const CLIENT = "c1c1c1c1-0000-4000-8000-000000000001";
const ENTRY = "e1e1e1e1-0000-4000-8000-000000000002";
const ACCOUNT = "a1a1a1a1-0000-4000-8000-000000000003";
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

function pack(): ClientFinancialPack {
  return {
    ...EMPTY_FINANCIAL_PACK,
    computedAt: "2026-09-18T02:00:00.000Z",
    period: { ...PERIOD, month: "2026-09-01", isMtd: true },
    coverageFloor: "2026-01-07",
    cash: group(),
    profit: group({
      valueCents: -123_456,
      composition: [{
        accountId: ACCOUNT, accountCode: "5000", name: "Office Rent", memberReason: null,
        accountType: "expense", openingCents: 0, movementCents: 623_456, closingCents: 623_456,
        entries: [{ entryId: ENTRY, postingDate: "2026-09-03", memo: "September rent", amountCents: 623_456 }],
        entriesTotal: 1, entriesTruncated: false,
      }],
    }),
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
  };
}

async function mount() {
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
              load: async () => pack(),
              now: () => Date.parse("2026-09-18T02:00:10.000Z"),
            })),
        ),
      ),
    }),
  );
  for (let i = 0; i < 10; i += 1) await h.settle();
  return h;
}

test("the keyboard walk is clean over the whole money band", async () => {
  const h = await mount();
  try {
    const violations = checkKeyboardWalk(h.container as never);
    assert.deepEqual(violations, [], violations.map((v) => `${v.rule}: ${v.message}`).join("\n"));
  } finally { await h.unmount(); }
});

test("NO positive tabindex — this band never reorders the document's own tab sequence", async () => {
  const h = await mount();
  try {
    assert.deepEqual(positiveTabIndexElements(h.container as never), []);
  } finally { await h.unmount(); }
});

test("the period control and the drilldown are both reachable, and the drilldown addresses ONE entry", async () => {
  const h = await mount();
  try {
    const focusable = focusableElements(h.container as never) as unknown as {
      getAttribute: (k: string) => string | null;
      tagName: string;
    }[];
    const labels = focusable.map((n) => n.getAttribute("aria-label") ?? "");
    assert.ok(labels.includes("Period"), `the period control is not keyboard-reachable: ${labels.join(" | ")}`);

    const links = focusable
      .filter((n) => n.tagName.toLowerCase() === "a")
      .map((n) => n.getAttribute("href") ?? "");
    assert.ok(
      links.includes(`/clients/${CLIENT}/journals?tab=posted&entry=${ENTRY}`),
      `the drilldown is not keyboard-reachable: ${links.join(" | ")}`,
    );
  } finally { await h.unmount(); }
});

test("the disclosure tables inherit the shared scroll region, which is itself focusable", async () => {
  const h = await mount();
  try {
    // `components/ui/table.tsx`'s container carries tabindex="0" so the region scrolls with the
    // keyboard. A hand-rolled `overflow-auto` box would scroll with a mouse and not with a
    // keyboard — a WCAG 2.1.1 failure no visual review catches.
    const scrollRegions: string[] = [];
    const walk = (n: unknown): void => {
      const node = n as {
        getAttribute?: (k: string) => string | null;
        childNodes?: unknown[];
      };
      const cls = node.getAttribute?.("class") ?? "";
      if (/overflow-(auto|x-auto|y-auto)/.test(cls)) {
        scrollRegions.push(node.getAttribute?.("tabindex") ?? "(none)");
      }
      for (const c of node.childNodes ?? []) walk(c);
    };
    walk(h.container);
    assert.ok(scrollRegions.length >= 2, `expected both tables' scroll regions, found ${scrollRegions.length}`);
    assert.ok(
      scrollRegions.every((t) => t === "0"),
      `a scroll region is not keyboard-reachable: ${scrollRegions.join(" | ")}`,
    );
  } finally { await h.unmount(); }
});
