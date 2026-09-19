// #660 — the money envelope's wire contract.
//
// THIS FILE IS ABOUT NOT INVENTING. A body this module cannot read must come back as `unknown`,
// never as `0`. "This client's cash is zero" and "I could not find out what this client's cash is"
// are different sentences and only one of them means a person can stop looking — and on an
// accounting board the wrong one is expensive.
//
// AND ABOUT NOT RENDERING A NUMBER WITHOUT ITS PERIOD. A figure group missing any envelope field is
// `unknown`, not a number with a hole in it: an amount whose interval the reader cannot see is an
// unanswerable claim, not a smaller truth.
//
// THE LAST CELL IS A SOURCE READ, because the rule it defends is an ABSENCE. The comparison
// arithmetic lives in the door (0232), once, so the browser, a later report and #669's tiles
// cannot disagree about what "down 12%" means.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  UNKNOWN_FIGURE,
  getClientFinancialPack,
  hydrateCashProposal,
  hydrateClientFinancialPack,
  hydrateFigure,
} from "./financial-pack";
import type { SessionTokenAccessor } from "@/lib/session";

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENTRY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCOUNT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function figure(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    value_cents: 18_234_055,
    status: "ok",
    unit: "minor_units",
    currency: "MYR",
    period: { start: "2026-09-01", end: "2026-09-30", as_of: "2026-09-18", timezone: "Asia/Kuala_Lumpur" },
    computed_at: "2026-09-18T02:00:00.000Z",
    definition_version: "clara.client-financial-pack/v1",
    source_watermark: "1234:1240:1236,1238",
    coverage: "ok",
    coverage_reason: null,
    comparison: {
      value_cents: 16_000_000,
      delta_cents: 2_234_055,
      delta_pct: 13.96,
      sign_change: false,
      period: { start: "2026-08-31", end: "2026-08-31", as_of: "2026-08-31", timezone: "Asia/Kuala_Lumpur" },
    },
    composition: [],
    ...overrides,
  };
}

test("a complete figure hydrates whole, with its period, its watermark and its comparison", () => {
  const f = hydrateFigure(figure());
  assert.equal(f.status, "ok");
  assert.equal(f.valueCents, 18_234_055);
  assert.equal(f.unit, "minor_units");
  assert.equal(f.currency, "MYR");
  assert.equal(f.definitionVersion, "clara.client-financial-pack/v1");
  assert.equal(f.sourceWatermark, "1234:1240:1236,1238");
  assert.deepEqual(f.period, {
    start: "2026-09-01", end: "2026-09-30", asOf: "2026-09-18", timezone: "Asia/Kuala_Lumpur",
  });
  assert.equal(f.comparison?.deltaPct, 13.96);
  assert.equal(f.comparison?.signChange, false);
});

test("UNKNOWN IS NOT ZERO — a malformed body, a missing body and an unknown status all give a NULL value", () => {
  for (const bad of [null, undefined, 42, "cash", [], {}]) {
    const f = hydrateFigure(bad);
    assert.equal(f.status, "unknown", `${JSON.stringify(bad)} must not hydrate as an answer`);
    assert.equal(f.valueCents, null, `${JSON.stringify(bad)} must NOT become 0`);
  }
  // The door's own "no published cash set" answer: `unknown` with a null value. Never 0.
  const unpublished = hydrateFigure(figure({
    status: "unknown", value_cents: null, coverage: "unknown", coverage_reason: "cash_set_unpublished",
  }));
  assert.equal(unpublished.status, "unknown");
  assert.equal(unpublished.valueCents, null);
  assert.equal(unpublished.coverageReason, "cash_set_unpublished");
});

test("A MISSING ENVELOPE FIELD MAKES THE WHOLE FIGURE UNKNOWN — a number never arrives without its period", () => {
  for (const missing of [
    "period", "unit", "currency", "definition_version", "source_watermark", "computed_at", "coverage",
  ]) {
    const body = figure();
    delete body[missing];
    const f = hydrateFigure(body);
    assert.equal(f.status, "unknown", `a body missing ${missing} must not render a number`);
    assert.equal(f.valueCents, null);
  }
  // A period missing ONE fence is the same failure: the reader cannot tell what it is about.
  for (const fence of ["start", "end", "as_of", "timezone"]) {
    const period = { start: "2026-09-01", end: "2026-09-30", as_of: "2026-09-18", timezone: "Asia/Kuala_Lumpur" } as Record<string, unknown>;
    delete period[fence];
    assert.equal(hydrateFigure(figure({ period })).status, "unknown", `a period without ${fence}`);
  }
});

test("a status word this build does not know is UNKNOWN — the vocabulary is closed at ok|partial|unknown", () => {
  assert.equal(hydrateFigure(figure({ status: "unavailable" })).status, "unknown");
  assert.equal(hydrateFigure(figure({ status: "denied" })).status, "unknown",
    "the door never says denied about itself — it raises CLR04, and the hook sets that word");
  assert.equal(hydrateFigure(figure({ status: 7 })).status, "unknown");
  assert.equal(UNKNOWN_FIGURE.valueCents, null);
  assert.equal(UNKNOWN_FIGURE.status, "unknown");
});

test("an ABSENT delta_pct stays null — it is `no percentage exists`, not a field to fill in", () => {
  const zeroDenominator = hydrateFigure(figure({
    comparison: { value_cents: 0, delta_cents: 50_000, delta_pct: null, sign_change: false, period: null },
  }));
  assert.equal(zeroDenominator.comparison?.deltaPct, null);
  assert.notEqual(zeroDenominator.comparison?.deltaCents, null, "the AMOUNT is still carried");
  assert.equal(zeroDenominator.comparison?.deltaCents, 50_000);
  // PostgREST can hand a numeric back as a string; a well-formed one is read, anything else is null.
  assert.equal(hydrateFigure(figure({
    comparison: { value_cents: 1, delta_cents: 1, delta_pct: "12.50", sign_change: false, period: null },
  })).comparison?.deltaPct, 12.5);
  assert.equal(hydrateFigure(figure({
    comparison: { value_cents: 1, delta_cents: 1, delta_pct: "n/a", sign_change: false, period: null },
  })).comparison?.deltaPct, null);
});

test("a composition entry with NO id is dropped — a drilldown row whose whole point is an address is not rendered without one", () => {
  const f = hydrateFigure(figure({
    composition: [{
      account_id: ACCOUNT,
      account_code: "1010",
      name: "Maybank Current",
      member_reason: "bank_registry",
      opening_cents: 1_000,
      movement_cents: 500,
      closing_cents: 1_500,
      entries: [
        { entry_id: ENTRY, posting_date: "2026-09-03", memo: "rent", amount_cents: -50_000 },
        { posting_date: "2026-09-04", memo: "no id", amount_cents: 1 },
      ],
      entries_total: 2,
      entries_truncated: false,
    }],
  }));
  assert.equal(f.composition.length, 1);
  assert.equal(f.composition[0]?.entries.length, 1);
  assert.equal(f.composition[0]?.entries[0]?.entryId, ENTRY);
  assert.equal(f.composition[0]?.entries[0]?.amountCents, -50_000, "a negative movement is kept signed");
});

test("THE ACCOUNT LEVEL CARRIES ITS OWN CAP — a list cut at 50 accounts says so, and an uncut one says that too", () => {
  // The entry level already reported `entries_truncated` + `entries_total`; the account level
  // emits the same pair, because a table listing 50 accounts that sums to less than the headline
  // above it, with nothing saying it was cut, is the same class of silent wrongness as a
  // fabricated zero.
  const cut = hydrateFigure(figure({ composition: [], composition_total: 61, composition_truncated: true }));
  assert.equal(cut.compositionTotal, 61);
  assert.equal(cut.compositionTruncated, true);
  const whole = hydrateFigure(figure({ composition: [], composition_total: 3, composition_truncated: false }));
  assert.equal(whole.compositionTotal, 3);
  assert.equal(whole.compositionTruncated, false);
  // A body that says nothing about the cap is not a body that says the list is complete.
  const silent = hydrateFigure(figure());
  assert.equal(silent.compositionTotal, null);
  assert.equal(silent.compositionTruncated, false);
});

test("AN UNAVAILABLE COMPARISON IS NOT A ZERO — the door's own availability survives hydration", () => {
  // A month-end before this client's coverage floor: `points[]` calls it unknown, and the
  // comparison beside the headline must not answer RM 0.00 for the same date.
  const f = hydrateFigure(figure({
    comparison: {
      value_cents: null, delta_cents: null, delta_pct: null, sign_change: false,
      available: false, reason: "pre_coverage",
      period: { start: "2026-08-31", end: "2026-08-31", as_of: "2026-08-31", timezone: "Asia/Kuala_Lumpur" },
    },
  }));
  assert.equal(f.comparison?.valueCents, null);
  assert.equal(f.comparison?.deltaCents, null);
  assert.equal(f.comparison?.available, false);
  assert.equal(f.comparison?.reason, "pre_coverage");
  // An older door that says nothing about availability is treated as available — it answered.
  const legacy = hydrateFigure(figure());
  assert.equal(legacy.comparison?.available, true);
  assert.equal(legacy.comparison?.reason, null);
});

test("the pack hydrates its six cash points, its cash set and its six-month series", () => {
  const pack = hydrateClientFinancialPack({
    computed_at: "2026-09-18T02:00:00.000Z",
    period: { start: "2026-09-01", end: "2026-09-30", as_of: "2026-09-18", timezone: "Asia/Kuala_Lumpur", month: "2026-09-01", is_mtd: true },
    coverage_floor: "2026-01-07",
    cash: figure({
      points: [
        { as_of: "2026-04-30", value_cents: null, available: false, reason: "pre_coverage" },
        { as_of: "2026-09-18", value_cents: 18_234_055, available: true, reason: null },
      ],
      set: { version_id: "v1", revision: 2, effective_from: "2026-01-07", member_count: 3, applied_to_all_points: true },
    }),
    profit: figure({ value_cents: -30_000 }),
    income: figure({ value_cents: 0 }),
    expense: figure({ value_cents: 30_000 }),
    series: [
      { month: "2026-09-01", income_cents: 0, expense_cents: 30_000, profit_cents: -30_000, partial: true, as_of: "2026-09-18" },
    ],
    unmarked_closing_entries: 2,
    unmarked_closing_entries_series: 3,
    series_coverage_reason: "closing_transfer_unmarked_history",
  });
  assert.equal(pack.period?.isMtd, true);
  assert.equal(pack.coverageFloor, "2026-01-07");
  assert.equal(pack.cashPoints.length, 2);
  // A PRE-COVERAGE POINT IS A GAP, NEVER A ZERO.
  assert.equal(pack.cashPoints[0]?.available, false);
  assert.equal(pack.cashPoints[0]?.valueCents, null);
  assert.equal(pack.cashPoints[0]?.reason, "pre_coverage");
  assert.equal(pack.cashSet?.appliedToAllPoints, true);
  assert.equal(pack.cashSet?.memberCount, 3);
  assert.equal(pack.series[0]?.partial, true);
  assert.equal(pack.series[0]?.profitCents, -30_000, "a loss is carried as a loss");
  assert.equal(pack.unmarkedClosingEntries, 2);
  // THE SIX MONTHS THE CHART DRAWS carry their own disclosure: an unmarked close three months
  // back is counted into that bar, and the selected period's own count cannot see it.
  assert.equal(pack.unmarkedClosingEntriesSeries, 3);
  assert.equal(pack.seriesCoverageReason, "closing_transfer_unmarked_history");
  // A point whose availability the body did not state is NOT drawable — absent means unavailable.
  const guessy = hydrateClientFinancialPack({ cash: figure({ points: [{ as_of: "2026-09-18", value_cents: 5 }] }) });
  assert.equal(guessy.cashPoints[0]?.available, false);
});

test("the proposal read keeps INACTIVE candidates and carries the never-proposed sentence", () => {
  const p = hydrateCashProposal({
    as_of: "2026-09-18",
    published_version_id: null,
    candidates: [
      { account_id: ACCOUNT, account_code: "1020", name: "CIMB Savings", is_active: false, member_reason: "bank_registry", balance_cents: 30_000, already_member: false },
      { account_code: "1030", member_reason: "bank_registry" },
    ],
    never_proposed: ["declared_cash", "declared_petty_cash"],
  });
  assert.equal(p.candidates.length, 1, "a candidate with no account_id is not selectable and is dropped");
  assert.equal(p.candidates[0]?.isActive, false, "a RETIRED bank account is still a candidate");
  assert.equal(p.candidates[0]?.balanceCents, 30_000);
  assert.deepEqual(p.neverProposed, ["declared_cash", "declared_petty_cash"]);
});

/** The house door-wire harness (`lib/documents/reads.test.ts:22-31`): a stubbed `fetch` and the
 *  one env var `pgrestRpc` refuses to build a URL without. */
function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

test("the door is called with all three arguments, month-to-date sending EXPLICIT nulls", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> | null = null;
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String((init as { body?: string } | undefined)?.body));
      return new Response(JSON.stringify(figure()), { status: 200, headers: { "content-type": "application/json" } });
    },
    async () => { await getClientFinancialPack(CLIENT, {}, { session }); },
  );
  assert.match(seenUrl, /\/rpc\/get_client_financial_pack/);
  assert.deepEqual(seenBody, { p_client: CLIENT, p_as_of: null, p_month: null },
    "month-to-date is an EXPLICIT null, never an omitted argument — the door's own default is a "
    + "different code path from a caller that meant `this month`");

  await withMockedFetch(
    async (url, init) => {
      seenBody = JSON.parse(String((init as { body?: string } | undefined)?.body));
      return new Response(JSON.stringify(figure()), { status: 200, headers: { "content-type": "application/json" } });
    },
    async () => { await getClientFinancialPack(CLIENT, { month: "2026-03-01" }, { session }); },
  );
  assert.deepEqual(seenBody, { p_client: CLIENT, p_as_of: null, p_month: "2026-03-01" });
});

test("this module performs NO cents arithmetic — the comparison lives in the door, once", () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "financial-pack.ts"), "utf8");
  // Strip comments and string literals: the header EXPLAINS the rule in prose, and the prose must
  // not be what the probe is reading.
  const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/"[^"]*"/g, '""');
  for (const forbidden of ["delta_cents -", "- comparison", "/ Math.abs", "* 100", "/ 100"]) {
    assert.equal(body.includes(forbidden), false, `financial-pack.ts computes ${forbidden}`);
  }
  // And it never coerces a cents value out of a string, which would silently round a bigint.
  assert.equal(/Number\(\s*raw\.\w*_cents/.test(body), false, "a cents value must not go through Number()");
});
