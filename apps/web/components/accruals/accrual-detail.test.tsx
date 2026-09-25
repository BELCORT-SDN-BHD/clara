// #1070 — THE ACCRUAL DETAIL VIEW RENDERS BOTH FACTS THE DATABASE ALREADY ANSWERS WITH.
//
// `clara.get_accrual_adjustment` already answers with `side` and, where applicable,
// `period_amounts` (`lib/accruals/api.ts:161,173`). The create and correction forms already render
// both (`accrual-form.tsx`, `accrual-correction-form.tsx`, both via
// `AccrualPeriodAmountsBlock`/the `factSide` fact); the register renders the side
// (`accruals-list.tsx:186`). Before this ticket, the read-only detail view rendered neither the
// per-period schedule nor — no, it DID render the side (`accrual-detail.tsx:94`, #942) — but never
// the per-period schedule: it read only the window-total `amount_cents`, so a reader of a
// `stated_period_amount` accrual saw the total and no breakdown by due date.
//
// THE TWO SLICES THIS FILE PROVES, each the acceptance line's own fact:
//   1. Viewing a per-period accrual's detail shows each due date's stated amount.
//   2. Viewing any accrual's detail shows which side it runs, labelled consistently with the list
//      and forms (already built; proven here because no dedicated test file existed for this
//      component at all, per the ticket's third acceptance line).
//
// The mocked-`fetch` shape is `accruals-list.test.tsx`'s own, for the same reason: `AccrualDetail`
// reaches the door through `lib/accruals/api.ts` with no injectable seam, and the transport is
// exactly what the real page uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { AccrualDetail } from "./accrual-detail";
import type { AccrualDetail as AccrualDetailRow } from "../../lib/accruals/api";

enableDomInspection();

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCRUAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WORK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

/** An RPC answerer that 404s anything it was not asked to answer, LOUDLY — `accruals-list.test.tsx`'s
 *  own guard, for the same reason: a call that silently resolved to `{}` would let a cell pass for
 *  the wrong reason. */
function rpcRouter(answers: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    for (const [verb, body] of Object.entries(answers)) {
      if (url.includes(`/rpc/${verb}`)) return jsonResponse(body);
    }
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
}

/** `clara.get_accrual_adjustment`'s own shape — `lib/accruals/api.ts`'s `AccrualDetail`, a
 *  `stated_amount` accrual (`period_amounts: []`) so the per-period section has nothing to show. */
const ROW: AccrualDetailRow = {
  accrual_id: ACCRUAL,
  side: "expense",
  plan_id: PLAN,
  revision: 1,
  purpose: "Monthly office rent accrual",
  expense_account_code: "6100",
  liability_account_code: "2020",
  amount_cents: 120000,
  currency: "MYR",
  effective_from: "2026-07-01",
  effective_to: "2026-07-31",
  service_period_start: "2026-07-01",
  service_period_end: "2026-07-31",
  term_source: "human_stated",
  method: { rule: "stated_amount" },
  document_service_period_id: null,
  source_document_id: null,
  plan_status: "active",
  plan_kind: "reversing_journal",
  recorded_by: WORK,
  created_at: "2026-06-30T02:00:00.000Z",
  occurrence_count: 1,
  posted: false,
  client_id: CLIENT,
  authority_kind: "explicit_instruction",
  authority_ref: { kind: "accounting_work", id: WORK },
  instruction: "The client's standing instruction of 2026-06-30, minuted by the engagement partner.",
  corrects_accrual_id: null,
  corrected_by_accrual_id: null,
  plan: {
    plan_id: PLAN,
    kind: "reversing_journal",
    status: "active",
    purpose: "Monthly office rent accrual",
    authorised_by: WORK,
    authorised_at: "2026-06-30T02:00:00.000Z",
    authority_from: "2026-07-01",
    current_revision: 1,
    frequency: "monthly",
    day_rule: "last_day_of_month",
    day_of_month: null,
    timezone: "Asia/Kuala_Lumpur",
    basis: null,
    basis_digest: null,
    auto_reverse: true,
    reversal_day_rule: "next_period_first_day",
  },
  occurrences: [],
  reversal: null,
  period_amounts: [],
};

/** The same accrual, restated under `stated_period_amount` (#937) with two due dates whose stated
 *  amounts do NOT split the window total evenly (60000/60000 would be indistinguishable from an
 *  even divide the component might compute itself — an independent-source-of-truth literal, per
 *  the house TDD rule). */
const PERIOD_ROW: AccrualDetailRow = {
  ...ROW,
  method: { rule: "stated_period_amount" },
  period_amounts: [
    { due_date: "2026-07-31", amount_cents: 45000 },
    { due_date: "2026-08-31", amount_cents: 75000 },
  ],
};

/** The same accrual on the REVENUE side, for the side-labelling slice. */
const REVENUE_ROW: AccrualDetailRow = {
  ...ROW,
  side: "revenue",
  expense_account_code: "4000",
  liability_account_code: "1180",
};

function app(node: ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Accrual"), node),
  });
}

test("1070.detail.periods — a per-period accrual's detail shows each due date's stated amount, not only the window total", async () => {
  await withMockedEnv(rpcRouter({ get_accrual_adjustment: PERIOD_ROW }), async () => {
    const h = await renderComponent(app(createElement(AccrualDetail, { clientId: CLIENT, accrualId: ACCRUAL })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.match(text, /2026-07-31/, "the first period's own due date is on screen");
      assert.match(text, /450\.00/, "the first period's own stated amount is on screen");
      assert.match(text, /2026-08-31/, "the second period's own due date is on screen");
      assert.match(text, /750\.00/, "the second period's own stated amount is on screen");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("1070.detail.no-periods — a stated_amount accrual's detail shows no per-period schedule (period_amounts is [])", async () => {
  await withMockedEnv(rpcRouter({ get_accrual_adjustment: ROW }), async () => {
    const h = await renderComponent(app(createElement(AccrualDetail, { clientId: CLIENT, accrualId: ACCRUAL })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.match(text, /Monthly office rent accrual/, "the sanity check that the row rendered at all");
      assert.doesNotMatch(text, /Amount for each period/,
        "no per-period heading renders when the array the door answered with is empty");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("1070.detail.side — an accrual's detail shows which side it runs, labelled consistently with the list and forms", async () => {
  await withMockedEnv(rpcRouter({ get_accrual_adjustment: REVENUE_ROW }), async () => {
    const h = await renderComponent(app(createElement(AccrualDetail, { clientId: CLIENT, accrualId: ACCRUAL })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.match(text, /Which way it accrues/, "the labelling convention the list and forms already use");
      assert.match(text, /Income earned, not yet invoiced/, "the revenue side's own value, not the expense default");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
