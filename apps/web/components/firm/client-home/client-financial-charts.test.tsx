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

import { renderComponent, textOf } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import messages from "../../../messages/en.json";
import { ClientFinancialSummary } from "./client-financial-summary";
import { WORK_STALE_AFTER_MS } from "@/lib/work/use-work-detail";
import {
  EMPTY_FINANCIAL_PACK,
  hydrateClientFinancialPack,
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
    compositionTotal: 0,
    compositionTruncated: false,
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
  now?: () => number;
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
              now: opts.now ?? (() => Date.parse("2026-09-18T02:00:10.000Z")),
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

test("THE DRILLDOWN RENDERS FROM A REAL DOOR PAYLOAD - the wire shape, hydrated, not a hand-built pack", async () => {
  // EVERY OTHER CELL IN THIS FILE HANDS THE COMPONENT A TYPED PACK, and that is exactly how a
  // whole feature can be green while being dead in production: the door emitted the profit
  // composition at TOP LEVEL, the parser read it from INSIDE the profit group, and nothing
  // reconciled the two - so `pack.profit.composition` was permanently `[]` against the real door
  // while the mock and the prop-injected cells stayed green. This cell therefore starts from the
  // JSON `clara.get_client_financial_pack` actually returns (snake_case, group-nested), runs it
  // through the SAME hydration the browser runs, and asserts the drilldown reaches the screen.
  const envelope = {
    value_cents: -123_456,
    status: "ok",
    unit: "minor_units",
    currency: "MYR",
    period: { start: "2026-09-01", end: "2026-09-30", as_of: "2026-09-18", timezone: "Asia/Kuala_Lumpur" },
    computed_at: "2026-09-18T02:00:00.000Z",
    definition_version: "clara.client-financial-pack/v1",
    source_watermark: "1234:1240:",
    coverage: "ok",
    coverage_reason: null,
    comparison: null,
  };
  const raw = {
    computed_at: "2026-09-18T02:00:00.000Z",
    period: { ...envelope.period, month: "2026-09-01", is_mtd: true },
    coverage_floor: "2026-01-07",
    cash: { ...envelope, value_cents: 18_234_055, points: [], set: null, composition: [],
            composition_total: 0, composition_truncated: false },
    profit: {
      ...envelope,
      composition: [{
        account_id: ACCOUNT, account_code: "5000", name: "Office Rent", account_type: "expense",
        opening_cents: 0, movement_cents: 623_456, closing_cents: 623_456,
        entries: [{ entry_id: ENTRY, posting_date: "2026-09-03", memo: "September rent",
                    amount_cents: 623_456 }],
        entries_total: 1, entries_truncated: false,
      }],
      composition_total: 51,
      composition_truncated: true,
    },
    income: { ...envelope, value_cents: 500_000 },
    expense: { ...envelope, value_cents: 623_456 },
    series: [{ month: "2026-09-01", income_cents: 500_000, expense_cents: 623_456,
               profit_cents: -123_456, partial: true, as_of: "2026-09-18" }],
    unmarked_closing_entries: 0,
    unmarked_closing_entries_series: 2,
    series_coverage_reason: "closing_transfer_unmarked_history",
  };
  const h = await mount({ load: async () => hydrateClientFinancialPack(raw) });
  try {
    const body = text(h);
    assert.match(body, /Office Rent/, "the drilldown row never reached the screen from the door's own shape");
    assert.match(body, /September rent/);
    assert.ok(hrefs(h).some((u) => u.includes(`entry=${ENTRY}`)),
      "the drilldown row carries no address to the journals page");
    // The ACCOUNT-level cap discloses itself, exactly as the entry level does.
    assert.match(body, /Showing 1 of 51 accounts/,
      "a table cut at 50 accounts said nothing about the accounts it left out");
    // And the disclosure covers all six drawn months, not only the selected one.
    assert.match(body, /2 year-end closing entries in these six months/);
  } finally { await h.unmount(); }
});

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

// ===========================================================================================
// #1001 — the CASH arm's own composition table, mirroring the profit arm's pattern above but
// headlined by the CLOSING balance (the cumulative basis book cash itself is computed on) rather
// than the period's movement, and carrying each row's member reason.

test("ticket 1001 — the cash arm renders its composition, headlined by the CLOSING balance — never the period's movement", async () => {
  const h = await mount({
    load: async () => pack({
      cash: group({
        composition: [{
          accountId: ACCOUNT, accountCode: "1010", name: "Maybank Current",
          memberReason: "bank_registry", accountType: null,
          openingCents: 17_000_000, movementCents: 1_234_055, closingCents: 18_234_055,
          entries: [{ entryId: ENTRY, postingDate: "2026-09-10", memo: "Client payment", amountCents: 1_234_055 }],
          entriesTotal: 1, entriesTruncated: false,
        }],
        compositionTotal: 1,
      }),
    }),
  });
  try {
    const body = text(h);
    assert.match(body, /Client payment/, "the cash drilldown row never reached the screen");
    assert.ok(
      hrefs(h).includes(`/clients/${CLIENT}/journals?tab=posted&entry=${ENTRY}`),
      "the cash drilldown row does not address the existing journals page",
    );
    // THE HEADLINE IS THE CLOSING BALANCE, NOT THE MOVEMENT. Opening 170,000.00 + movement
    // 12,340.55 = closing 182,340.55 — three DIFFERENT numbers, so a swap cannot hide behind two
    // fields sharing a value. The row's own balance cell is asserted directly by its testid,
    // rather than by string presence, because RM 182,340.55 also happens to be this fixture's
    // book-cash headline above it and a body-wide match would pass even if the row itself were
    // wrong.
    const balanceCell = h.find((n) => (n as unknown as { getAttribute?: (k: string) => string | null })
      .getAttribute?.("data-testid") === "client-cash-drilldown-balance");
    assert.ok(balanceCell, "the composition row's balance cell is not queryable");
    const balanceText = textOf(balanceCell as never).replace(/\s+/g, " ").trim();
    assert.equal(balanceText, "RM 182,340.55", `the row's headline is not the closing balance: "${balanceText}"`);
    assert.notEqual(balanceText, "RM 12,340.55", "the row presented the period's MOVEMENT as its balance");
  } finally { await h.unmount(); }
});

test("ticket 1001 — each cash row says WHY it is cash, through a closed lookup — never the raw member_reason token", async () => {
  const h = await mount({
    load: async () => pack({
      cash: group({
        composition: [
          {
            accountId: ACCOUNT, accountCode: "1010", name: "Maybank Current",
            memberReason: "bank_registry", accountType: null,
            openingCents: 0, movementCents: 0, closingCents: 100_000,
            entries: [], entriesTotal: 0, entriesTruncated: false,
          },
          {
            accountId: "a2a2a2a2-0000-4000-8000-000000000005", accountCode: "1050", name: "Petty Cash Tin",
            memberReason: "declared_petty_cash", accountType: null,
            openingCents: 0, movementCents: 0, closingCents: 5_000,
            entries: [], entriesTotal: 0, entriesTruncated: false,
          },
        ],
        compositionTotal: 2,
      }),
    }),
  });
  try {
    const body = text(h);
    assert.match(body, /Registered bank account/, "the bank-registry row does not say why it is cash");
    assert.match(body, /Declared petty cash/, "the declared-petty-cash row does not say why it is cash");
    assert.equal(/bank_registry/.test(body), false, "the raw member_reason token reached the screen");
    assert.equal(/declared_petty_cash/.test(body), false, "the raw member_reason token reached the screen");
  } finally { await h.unmount(); }
});

test("ticket 1001 — both truncation disclosures appear on the cash arm when they apply", async () => {
  const h = await mount({
    load: async () => pack({
      cash: group({
        composition: [{
          accountId: ACCOUNT, accountCode: "1010", name: "Maybank Current",
          memberReason: "bank_registry", accountType: null,
          openingCents: 0, movementCents: 500_000, closingCents: 500_000,
          entries: [{ entryId: ENTRY, postingDate: "2026-09-03", memo: "One of many", amountCents: 10_000 }],
          entriesTotal: 41, entriesTruncated: true,
        }],
        compositionTotal: 63,
        compositionTruncated: true,
      }),
    }),
  });
  try {
    const body = text(h);
    assert.match(body, /Showing 1 of 41 entries/, "the entry-level cap on the cash arm said nothing about it");
    assert.match(body, /Showing 1 of 63 accounts/, "the account-level cap on the cash arm said nothing about it");
  } finally { await h.unmount(); }
});

test("ticket 1001 — with NO published cash account set, the cash arm keeps its empty state and renders NO composition table", async () => {
  const h = await mount({
    load: async () => pack({
      cash: group({
        valueCents: null, status: "unknown", coverage: "unknown", coverageReason: "cash_set_unpublished",
        composition: [], compositionTotal: 0, compositionTruncated: false,
      }),
      cashPoints: [],
      cashSet: null,
    }),
  });
  try {
    const body = text(h);
    assert.match(body, /Nobody has said which accounts count as cash/, "the existing empty-state entrance regressed");
    assert.equal(
      h.find((n) => (n as unknown as { getAttribute?: (k: string) => string | null })
        .getAttribute?.("data-testid") === "client-cash-drilldown-balance"),
      null,
      "a composition table rendered for an unpublished cash set",
    );
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

test("896.L07-A06 — once the connection goes stale, client-money-delayed lands on the rendered StateBanner as a real data-testid", async () => {
  // #896's fix made StateBanner forward `data-testid` (and other native div attributes) instead of
  // dropping it — this band's own "delayed" banner (client-financial-summary.tsx) is a SECOND call
  // site that newly gets a queryable `data-testid="client-money-delayed"` in the rendered DOM,
  // untested by #896's own cells (which only covered work-question-form.tsx's banner). This cell
  // reproduces the real staleness path `useFinancialPack` uses in production: a real `setInterval`
  // re-checks `now() - readAt >= WORK_STALE_AFTER_MS` on its own tick (use-financial-pack.ts) — no
  // component prop can force `delayed` directly, so the interval callback is captured and fired by
  // hand, the same idiom use-financial-pack.test.ts's own `withTimers` uses for this exact hook.
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const ticks: (() => void)[] = [];
  globalThis.setInterval = ((cb: TimerHandler) => { ticks.push(cb as () => void); return 999 as never; }) as typeof setInterval;
  globalThis.clearInterval = (() => undefined) as typeof clearInterval;
  let now = Date.parse("2026-09-18T02:00:10.000Z");
  let fail = false;
  try {
    // `load` fails on every call AFTER the first — a successful read always resets `delayed` to
    // false (use-financial-pack.ts's own `read()`, success branch), which is the "sixty seconds
    // with no successful read" the ticket's staleness clock actually measures, matching
    // use-financial-pack.test.ts's own "60 seconds with no successful read is DELAYED" cell.
    const h = await mount({ now: () => now, load: async () => { if (fail) throw new Error("network"); return pack(); } });
    try {
      assert.equal(
        h.find((n) => (n as unknown as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid") === "client-money-delayed"),
        null,
        "control: freshly read, the delayed banner must not render yet",
      );
      now += WORK_STALE_AFTER_MS;
      fail = true;
      await h.act(() => { for (const cb of ticks) cb(); });
      for (let i = 0; i < 10; i += 1) await h.settle();
      const banner = h.find((n) => (n as unknown as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid") === "client-money-delayed");
      assert.ok(banner, "once delayed, the banner must render with its data-testid queryable in the DOM");
    } finally { await h.unmount(); }
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
