// #660 — PERIOD PROFIT, the tile, on its own.
//
// PROFIT IS A FLOW AND CASH IS A BALANCE, and this tile's whole job is to say so in words a reader
// cannot misread: "for 1 Sep to 18 Sep", never "as at". The cell that matters most is the LOSS: a
// negative profit is printed as a negative number, because nothing anywhere in this band clamps a
// figure at zero, and a board that showed RM 0.00 for a loss-making month would be lying in the
// one direction that costs money.
//
// AND THE ONE CASE THE ESTATE'S RULE CANNOT SEE is on the face, in a sentence about this client's
// books rather than a technical footnote: a close finalised before the `closing_transfer` marker
// existed is invisible to the exclusion predicate, so the door counts it and DISCLOSES it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import messages from "../../../messages/en.json";
import { ClientProfitSummary } from "./client-profit-summary";
import type { FigureGroup } from "@/lib/dashboard/financial-pack";

enableDomInspection();

const PERIOD = { start: "2026-09-01", end: "2026-09-30", asOf: "2026-09-18", timezone: "Asia/Kuala_Lumpur" };

function group(overrides: Partial<FigureGroup> = {}): FigureGroup {
  return {
    valueCents: -123_456, status: "ok", unit: "minor_units", currency: "MYR",
    period: PERIOD, computedAt: "2026-09-18T02:00:00.000Z",
    definitionVersion: "clara.client-financial-pack/v1", sourceWatermark: "1:1:",
    coverage: "ok", coverageReason: null, comparison: null, composition: [],
    compositionTotal: 0, compositionTruncated: false,
    ...overrides,
  };
}

async function mount(props: {
  profit?: FigureGroup;
  income?: FigureGroup;
  expense?: FigureGroup;
  unmarkedClosingEntries?: number | null;
  loading?: boolean;
}) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en", messages,
      children: createElement("div", null,
        createElement("h1", null, "Rome Properties Sdn Bhd"),
        createElement("h2", null, "Money"),
        createElement(ClientProfitSummary, {
          profit: props.profit ?? group(),
          income: props.income ?? group({ valueCents: 500_000 }),
          expense: props.expense ?? group({ valueCents: 623_456 }),
          unmarkedClosingEntries: props.unmarkedClosingEntries ?? 0,
          loading: props.loading ?? false,
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

function labels(h: { container: unknown }): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    const node = n as { getAttribute?: (k: string) => string | null; childNodes?: unknown[] };
    const label = node.getAttribute?.("aria-label");
    if (typeof label === "string") out.push(label);
    for (const c of node.childNodes ?? []) walk(c);
  };
  walk(h.container);
  return out;
}

test("A LOSS IS A LOSS — the exact negative amount, its interval said as an interval, and both halves beside it", async () => {
  const h = await mount({});
  try {
    const body = text(h);
    assert.match(body, /-RM 1,234\.56/, "a loss was clamped or re-signed");
    assert.match(body, /For 1 Sept 2026 to 18 Sept 2026/,
      "profit is a FLOW and must be labelled over its interval, never `as at` a date");
    assert.match(body, /RM 5,000\.00/, "income");
    assert.match(body, /RM 6,234\.56/, "expense");
    // "profit fell", "income fell" and "costs rose" are three different next actions.
    assert.ok(labels(h).some((l) => /Income RM 5,000\.00/.test(l)),
      `the halves carry no accessible name of their own: ${labels(h).join(" | ")}`);
  } finally { await h.unmount(); }
});

test("AN UNMARKED PRE-0120 CLOSE IS DISCLOSED WITH ITS COUNT, and the number stays", async () => {
  const h = await mount({
    profit: group({ coverage: "partial", coverageReason: "closing_transfer_unmarked_history" }),
    unmarkedClosingEntries: 2,
  });
  try {
    const body = text(h);
    assert.match(body, /2 year-end closing entries in this period are not marked as such/);
    assert.match(body, /-RM 1,234\.56/, "a disclosed figure is still a figure — coverage is a statement ABOUT it");
  } finally { await h.unmount(); }
});

test("an EMPTY population is a complete read and says so — `no entries posted`, not a silent RM 0.00", async () => {
  const h = await mount({
    profit: group({ valueCents: 0, coverage: "ok", coverageReason: "no_posted_entries" }),
    income: group({ valueCents: 0, coverage: "ok", coverageReason: "no_posted_entries" }),
    expense: group({ valueCents: 0, coverage: "ok", coverageReason: "no_posted_entries" }),
  });
  try {
    const body = text(h);
    assert.match(body, /RM 0\.00/, "a complete read over an empty population IS zero and is shown");
    assert.match(body, /No entries have been posted for this client yet/,
      "the zero was left to stand on its own as if it were a fact about the money");
  } finally { await h.unmount(); }
});

test("an UNKNOWN figure renders its reason and no amount; a DENIED one renders the permission sentence", async () => {
  const unknown = await mount({
    profit: group({ valueCents: null, status: "unknown", coverage: "unknown", coverageReason: "client_not_visible" }),
  });
  try {
    const body = text(unknown);
    assert.match(body, /This figure could not be read/);
    assert.doesNotMatch(body, /RM 1,234\.56/, "an unknown figure printed a number");
  } finally { await unknown.unmount(); }

  const denied = await mount({
    profit: group({ valueCents: null, status: "denied", coverage: null, coverageReason: null }),
  });
  try {
    assert.match(text(denied), /Your role does not include/);
  } finally { await denied.unmount(); }
});
