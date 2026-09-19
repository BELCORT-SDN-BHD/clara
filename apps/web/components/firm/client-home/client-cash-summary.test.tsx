// #660 — BOOK CASH, the tile, on its own.
//
// THE CELL THAT MATTERS MOST is the one that refuses to print a zero it does not have. Three
// different conditions on this tile all mean "no useful number" — nobody has said which accounts
// count as cash, the comparison period is before this client's books begin, and the caller may not
// see the figure at all — and each one has a DIFFERENT next action. A build that collapsed them
// would tell an accountant "this client has no cash" when the truth was "nobody has chosen the
// cash accounts yet", which is a thing somebody has to go and do.
//
// THE TILE IS MOUNTED DIRECTLY, not through the band, because the band's own composite cells
// (`client-financial-charts.test.tsx`) cannot fail on the tile's arms one at a time: a composite
// that renders four faces asserts the page, and this file asserts the face.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import messages from "../../../messages/en.json";
import { ClientCashSummary } from "./client-cash-summary";
import type { CashSetRef, FigureGroup } from "@/lib/dashboard/financial-pack";

enableDomInspection();

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

const SET: CashSetRef = {
  versionId: "v1", revision: 1, effectiveFrom: "2026-01-07", memberCount: 2, appliedToAllPoints: true,
};

async function mount(props: {
  figure: FigureGroup;
  cashSet?: CashSetRef | null;
  loading?: boolean;
  onOpenCashSet?: (() => void) | null;
}) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en", messages,
      // The tile is an `<h3>` inside a page whose `<h1>` is the client's name; mounted alone it
      // would open the document on an h3, which is a heading-order violation of the HARNESS.
      children: createElement("div", null,
        createElement("h1", null, "Rome Properties Sdn Bhd"),
        createElement("h2", null, "Money"),
        createElement(ClientCashSummary, {
          figure: props.figure,
          cashSet: props.cashSet ?? SET,
          loading: props.loading ?? false,
          onOpenCashSet: props.onOpenCashSet === undefined ? () => {} : props.onOpenCashSet,
        })),
    }),
  );
  for (let i = 0; i < 4; i += 1) await h.settle();
  return h;
}

function text(h: { container: unknown }): string {
  const collect = (n: unknown): string => {
    const node = n as { nodeValue?: string; childNodes?: unknown[] };
    if (typeof node.nodeValue === "string") return node.nodeValue;
    return (node.childNodes ?? []).map(collect).join(" ");
  };
  return collect(h.container).replace(/\s+/g, " ");
}

test("the figure is exact, carries its period in its accessible name, and says it is not a bank balance", async () => {
  const h = await mount({ figure: group() });
  try {
    const body = text(h);
    assert.match(body, /RM 182,340\.55/);
    assert.match(body, /not a bank statement balance/,
      "the tile does not say what BOOK cash is not, which is the sentence the bank section needs");
    assert.match(body, /Over 2 cash accounts \(version 1\)/, "the basis of the figure is not stated");
  } finally { await h.unmount(); }
});

test("AN UNPUBLISHED CASH SET IS A DOOR, NEVER RM 0.00 — and a caller who may not author one is told who can", async () => {
  const h = await mount({
    figure: group({ valueCents: null, status: "unknown", coverage: "unknown", coverageReason: "cash_set_unpublished" }),
    cashSet: null,
  });
  try {
    const body = text(h);
    assert.match(body, /Nobody has said which accounts count as cash/);
    assert.match(body, /This is not a figure of zero/);
    assert.match(body, /Choose cash accounts/, "the entrance to the dialog that fixes it is absent");
    assert.doesNotMatch(body, /RM 0\.00/, "an unpublished set was rendered as a zero");
  } finally { await h.unmount(); }

  const viewer = await mount({
    figure: group({ valueCents: null, status: "unknown", coverage: "unknown", coverageReason: "cash_set_unpublished" }),
    cashSet: null,
    onOpenCashSet: null,
  });
  try {
    const body = text(viewer);
    assert.match(body, /An administrator or owner can choose them/);
    assert.doesNotMatch(body, /Choose cash accounts/, "a control offered to somebody who cannot use it");
  } finally { await viewer.unmount(); }
});

test("A COMPARISON THE DOOR WITHHELD IS SAID, NOT SKIPPED — and never rendered as `against RM 0.00`", async () => {
  // The preceding month-end is before this client's coverage floor: the door sends the comparison
  // with null amounts and `available:false`, because `points[]` already calls that date unknown.
  const h = await mount({
    figure: group({
      coverage: "partial", coverageReason: "pre_coverage",
      comparison: {
        valueCents: null, deltaCents: null, deltaPct: null, signChange: false,
        available: false, reason: "pre_coverage",
        period: { start: "2026-08-31", end: "2026-08-31", asOf: "2026-08-31", timezone: "Asia/Kuala_Lumpur" },
      },
    }),
  });
  try {
    const body = text(h);
    assert.match(body, /RM 182,340\.55/, "a partial answer still keeps its number");
    assert.match(body, /No comparison for 31 Aug 2026 to 31 Aug 2026/);
    assert.doesNotMatch(body, /against RM 0\.00/, "a fabricated zero reached the comparison line");
    assert.match(body, /before this client.s books begin/, "the partial coverage is not explained");
  } finally { await h.unmount(); }
});

test("a comparison the door DID answer is printed with its amount, its percentage and its interval", async () => {
  const h = await mount({
    figure: group({
      comparison: {
        valueCents: 16_000_000, deltaCents: 2_234_055, deltaPct: 13.96, signChange: false,
        available: true, reason: null,
        period: { start: "2026-08-31", end: "2026-08-31", asOf: "2026-08-31", timezone: "Asia/Kuala_Lumpur" },
      },
    }),
  });
  try {
    const body = text(h);
    assert.match(body, /RM 22,340\.55 \(13\.96%\) against RM 160,000\.00/);
    assert.match(body, /compared with 31 Aug 2026 to 31 Aug 2026/);
  } finally { await h.unmount(); }
});

test("a cash set DECLARED after these months were booked says that, not that the definition changed", async () => {
  const h = await mount({
    figure: group({ coverage: "partial", coverageReason: "cash_set_published_after_books_start" }),
  });
  try {
    const body = text(h);
    assert.match(body, /chosen after some of these months were booked/);
    assert.doesNotMatch(body, /The cash accounts changed during these six months/,
      "a client whose set never changed was told it changed");
  } finally { await h.unmount(); }
});

test("DENIED is a sentence about permission, and carries no number at all", async () => {
  const h = await mount({ figure: group({ valueCents: null, status: "denied", coverage: null, coverageReason: null }) });
  try {
    const body = text(h);
    assert.match(body, /Your role does not include/);
    assert.doesNotMatch(body, /RM 1/, "a denied figure still rendered an amount");
  } finally { await h.unmount(); }
});
