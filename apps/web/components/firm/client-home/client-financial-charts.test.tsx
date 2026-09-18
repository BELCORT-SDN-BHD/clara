// #660 — the money band's faces: exact money strings, period labels, the partial-month label, and
// the readable table that is ALWAYS in the DOM.
//
// THE CELLS THAT MATTER MOST tell EMPTY from ZERO from UNPUBLISHED from DENIED. All four render
// "no useful number", and a build that collapsed them would tell an accountant "this client has no
// cash" when the truth was "nobody has said which accounts count as cash" — which is a thing
// somebody has to go and do. Four conditions, four sentences, each asserted by its own words.
//
// AND THE TABLE IS NOT A FALLBACK. Appendix D admits a chart only with a readable value/table
// disclosure; a disclosure that renders only when something fails is not one. The cells assert the
// rows are present in the SAME DOM as the chart, every time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import messages from "../../../messages/en.json";
import { ClientFinancialSummary } from "./client-financial-summary";
import {
  EMPTY_FINANCIAL_PACK,
  type CashProposal,
  type ClientFinancialPack,
  type FigureGroup,
} from "@/lib/dashboard/financial-pack";
import { DoorRefusal } from "@/lib/doors";

enableDomInspection();

const CLIENT = "c1c1c1c1-0000-4000-8000-000000000001";
const ENTRY = "e1e1e1e1-0000-4000-8000-000000000002";
const ACCOUNT = "a1a1a1a1-0000-4000-8000-000000000003";

const PERIOD = {
  start: "2026-09-01", end: "2026-09-30", asOf: "2026-09-18", timezone: "Asia/Kuala_Lumpur",
};

function group(overrides: Partial<FigureGroup> = {}): FigureGroup {
  return {
    valueCents: 18_234_055,
    status: "ok",
    unit: "minor_units",
    currency: "MYR",
    period: PERIOD,
    computedAt: "2026-09-18T02:00:00.000Z",
    definitionVersion: "clara.client-financial-pack/v1",
    sourceWatermark: "1:1:",
    coverage: "ok",
    coverageReason: null,
    comparison: null,
    composition: [],
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
      { asOf: "2026-04-30", valueCents: null, available: false, reason: "pre_coverage" },
      { asOf: "2026-05-31", valueCents: 1_000_000, available: true, reason: null },
      { asOf: "2026-06-30", valueCents: 1_200_000, available: true, reason: null },
      { asOf: "2026-07-31", valueCents: 1_500_000, available: true, reason: null },
      { asOf: "2026-08-31", valueCents: 1_700_000, available: true, reason: null },
      { asOf: "2026-09-18", valueCents: 18_234_055, available: true, reason: null },
    ],
    cashSet: {
      versionId: "v1", revision: 1, effectiveFrom: "2026-01-07", memberCount: 2,
      appliedToAllPoints: true,
    },
    series: [
      { month: "2026-04-01", incomeCents: 100_000, expenseCents: 40_000, profitCents: 60_000, partial: false, asOf: "2026-04-30" },
      { month: "2026-09-01", incomeCents: 500_000, expenseCents: 623_456, profitCents: -123_456, partial: true, asOf: "2026-09-18" },
    ],
    unmarkedClosingEntries: 0,
    ...overrides,
  };
}

const proposal: CashProposal = {
  asOf: "2026-09-18",
  publishedVersionId: null,
  candidates: [{
    accountId: ACCOUNT, accountCode: "1010", name: "Maybank Current", isActive: true,
    memberReason: "bank_registry", balanceCents: 18_234_055, alreadyMember: false,
  }],
  neverProposed: ["declared_cash", "declared_petty_cash"],
};

async function mount(opts: {
  load?: (clientId: string, month: string | null) => Promise<ClientFinancialPack>;
  period?: string | null;
  malformedPeriod?: boolean;
} = {}) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en", messages,
      children: createElement(
        AppRouterContext.Provider as never,
        { value: { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} } as never },
        createElement(
          PathnameContext.Provider as never,
          { value: `/clients/${CLIENT}` as never },
          // The band is an `<h2>` SECTION of a page whose `<h1>` is the client's own name. Mounted
          // alone it would open the document on an h2 — a heading-order violation of the HARNESS,
          // not of this component — so the fixture supplies the page's own top-level heading.
          createElement("div", null,
            createElement("h1", null, "Rome Properties Sdn Bhd"),
            createElement(ClientFinancialSummary, {
              clientId: CLIENT,
              period: opts.period ?? null,
              pathname: `/clients/${CLIENT}`,
              search: "",
              malformedPeriod: opts.malformedPeriod ?? false,
              load: opts.load ?? (async () => pack()),
              now: () => Date.parse("2026-09-18T02:00:10.000Z"),
              loadProposal: async () => proposal,
            })),
        ),
      ),
    }),
  );
  for (let i = 0; i < 10; i += 1) await h.settle();
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

function hrefs(h: { container: unknown }): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    const node = n as { getAttribute?: (k: string) => string | null; childNodes?: unknown[] };
    const href = node.getAttribute?.("href");
    if (typeof href === "string") out.push(href);
    for (const c of node.childNodes ?? []) walk(c);
  };
  walk(h.container);
  return out;
}

// ===========================================================================================

test("EXACT money strings, with the currency and the period beside them", async () => {
  const h = await mount();
  try {
    const body = text(h);
    assert.match(body, /RM 182,340\.55/, "book cash is not rendered at its exact minor units");
    assert.match(body, /-RM 1,234\.56/, "a LOSS is printed as a loss, never clamped at zero");
    assert.match(body, /RM 5,000\.00/, "income");
    assert.match(body, /RM 6,234\.56/, "expense");
    assert.match(body, /18 Sept 2026/, "the as-of is on the face");
    // The accessible NAME carries the period, so a number read aloud can be checked.
    const walk = (n: unknown, out: string[]): string[] => {
      const node = n as { getAttribute?: (k: string) => string | null; childNodes?: unknown[] };
      const label = node.getAttribute?.("aria-label");
      if (typeof label === "string") out.push(label);
      for (const c of node.childNodes ?? []) walk(c, out);
      return out;
    };
    const labels = walk(h.container, []);
    assert.ok(
      labels.some((l) => /Book cash RM 182,340\.55 as at 18 Sept 2026/.test(l)),
      `no figure carries its period in its accessible name: ${labels.join(" | ")}`,
    );
  } finally { await h.unmount(); }
});

test("THE READABLE TABLE IS ALWAYS IN THE DOM, beside the chart and not instead of it", async () => {
  const h = await mount();
  try {
    const body = text(h);
    // The cash trend's table, row by row, including the gap row.
    assert.match(body, /31 May 2026/);
    assert.match(body, /RM 10,000\.00/);
    // The series table, with its own month column and profit column.
    assert.match(body, /April 2026/);
    assert.match(body, /September 2026/);
    // And the table labels exist, so a screen reader can name both tables.
    const walk = (n: unknown, out: string[]): string[] => {
      const node = n as { getAttribute?: (k: string) => string | null; childNodes?: unknown[]; tagName?: string };
      if (node.tagName?.toLowerCase() === "table") {
        out.push(node.getAttribute?.("aria-label") ?? "(unnamed)");
      }
      for (const c of node.childNodes ?? []) walk(c, out);
      return out;
    };
    const tables = walk(h.container, []);
    assert.ok(tables.length >= 2, `expected both disclosure tables, found ${tables.length}`);
    assert.ok(tables.every((label) => label !== "(unnamed)"), `an unnamed table: ${tables.join(" | ")}`);
  } finally { await h.unmount(); }
});

test("a PRE-COVERAGE point says so and is never RM 0.00", async () => {
  const h = await mount();
  try {
    const body = text(h);
    assert.match(body, /Before the books begin/);
    assert.equal(/30 Apr 2026 RM 0\.00/.test(body), false, "a gap was drawn as a zero");
  } finally { await h.unmount(); }
});

test("the PARTIAL current month is labelled with its exact as-of", async () => {
  const h = await mount();
  try {
    const body = text(h);
    assert.match(body, /September 2026 is a part month/);
    assert.match(body, /figures run to 18 Sept 2026/);
    assert.match(body, /September 2026 to 18 Sept 2026/, "the table row repeats it where the number is");
  } finally { await h.unmount(); }
});

test("EMPTY is not ZERO is not UNPUBLISHED is not DENIED — four conditions, four sentences", async () => {
  // 1. A COMPLETE read over an EMPTY population: `ok` + 0 + its own sentence.
  const empty = await mount({
    load: async () => pack({
      cash: group({ valueCents: 0, coverageReason: "no_posted_entries" }),
      profit: group({ valueCents: 0, coverageReason: "no_posted_entries" }),
      income: group({ valueCents: 0, coverageReason: "no_posted_entries" }),
      expense: group({ valueCents: 0, coverageReason: "no_posted_entries" }),
    }),
  });
  try {
    assert.match(text(empty), /No entries have been posted for this client yet/);
  } finally { await empty.unmount(); }

  // 2. A REAL zero in a historic month: the number IS 0.00 and carries its period.
  const realZero = await mount({
    period: "2026-03-01",
    load: async () => pack({ profit: group({ valueCents: 0, coverageReason: null }) }),
  });
  try {
    assert.match(text(realZero), /RM 0\.00/);
    assert.equal(/No entries have been posted/.test(text(realZero)), false);
  } finally { await realZero.unmount(); }

  // 3. NO PUBLISHED CASH SET: a face with a door on it, and NO figure at all.
  const unpublished = await mount({
    load: async () => pack({
      cash: group({ valueCents: null, status: "unknown", coverage: "unknown", coverageReason: "cash_set_unpublished" }),
      cashSet: null,
    }),
  });
  try {
    const body = text(unpublished);
    assert.match(body, /Nobody has said which accounts count as cash/);
    assert.match(body, /This is not a figure of zero/);
    assert.match(body, /Choose cash accounts/, "the entrance to the fix is offered");
    assert.equal(/RM 0\.00/.test(body.split("Profit")[0] ?? ""), false, "an unpublished set rendered as zero cash");
  } finally { await unpublished.unmount(); }

  // 4. DENIED: values cleared, a sentence naming the permission, and NO authoring entrance.
  const denied = await mount({
    load: async () => {
      throw new DoorRefusal("CLR04", "insufficient role",
        { reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate" });
    },
  });
  try {
    const body = text(denied);
    assert.match(body, /You cannot see this client/);
    assert.equal(/RM /.test(body), false, "a denied band still printed money");
    assert.equal(/Choose cash accounts/.test(body), false,
      "a caller below the read floor was offered the admin-floored authoring door");
  } finally { await denied.unmount(); }
});

test("the unmarked-history disclosure keeps the NUMBER and names the count", async () => {
  const h = await mount({
    load: async () => pack({
      profit: group({ valueCents: -123_456, coverage: "partial", coverageReason: "closing_transfer_unmarked_history" }),
      unmarkedClosingEntries: 2,
    }),
  });
  try {
    const body = text(h);
    assert.match(body, /-RM 1,234\.56/, "a partial answer withheld its number");
    assert.match(body, /2 year-end closing entries in this period are not marked/);
    assert.match(body, /The figures are otherwise as posted/);
  } finally { await h.unmount(); }
});

test("a composition row links ONE journal entry to the EXISTING journals address", async () => {
  const h = await mount({
    load: async () => pack({
      profit: group({
        valueCents: -123_456,
        composition: [{
          accountId: ACCOUNT, accountCode: "5000", name: "Office Rent", memberReason: null,
          accountType: "expense", openingCents: 0, movementCents: 623_456, closingCents: 623_456,
          entries: [{ entryId: ENTRY, postingDate: "2026-09-03", memo: "September rent", amountCents: 623_456 }],
          entriesTotal: 1, entriesTruncated: false,
        }],
      }),
    }),
  });
  try {
    const links = hrefs(h);
    assert.ok(
      links.includes(`/clients/${CLIENT}/journals?tab=posted&entry=${ENTRY}`),
      `the drilldown does not address the existing journals page: ${links.join(" | ")}`,
    );
    assert.match(text(h), /September rent/);
  } finally { await h.unmount(); }
});

test("the freshness sentence makes the SMALLER, true promise — there is no commit event to invalidate on", async () => {
  const h = await mount();
  try {
    assert.match(text(h), /refresh at most every 30 seconds while this tab is open/);
    assert.match(text(h), /Money figures read at /);
  } finally { await h.unmount(); }
});

test("a malformed ?period= is SAID on the face, never silently corrected", async () => {
  const h = await mount({ malformedPeriod: true });
  try {
    assert.match(text(h), /That period could not be read/);
    assert.match(text(h), /showing the current month to date instead/);
  } finally { await h.unmount(); }
});
