// #652 — THE ACCRUAL LIST'S STATE LADDER (AC6, appendix C §3).
//
// `accrual-form.test.tsx` proves the FORM's states and `accrual-walk.spec.ts` walks a list that
// always carries rows. Neither of them ever renders this surface with NOTHING in it — and the
// empty state is one of the three the acceptance names by itself, on the surface a firm sees on
// its FIRST day with a client.
//
// TWO RUNGS, AND THE NEGATIVE THAT KEEPS THEM APART:
//   1. A SUCCESSFUL EMPTY READ SAYS SO, in its own sentence, with no table shell pretending to be
//      a register that failed to load.
//   2. AN UNRESOLVED READ IS NOT AN EMPTY ONE. The empty sentence must never render over a read
//      that has not returned — "no accruals" and "we have not read yet" are different facts about
//      the client's books, and the first one is a statement a preparer may act on.
//   Both boundary sentences stay on screen through all of it (AC5): they are properties of the
//   LANE, not of the data, so a client with no accruals still learns what an accrual is and is not.
//
// The mocked-`fetch` shape is `components/plans/plans-render-states.test.tsx`'s, for its reason:
// `AccrualsList` reaches the door through `lib/accruals/api.ts` with no injectable seam, and the
// transport is exactly what the real page uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { AccrualsList } from "./accruals-list";

enableDomInspection();

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCRUAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

/** An RPC answerer that 404s anything it was not asked to answer, LOUDLY: a call that silently
 *  resolved to `{}` would let a cell pass for the wrong reason. */
function rpcRouter(answers: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    for (const [verb, body] of Object.entries(answers)) {
      if (url.includes(`/rpc/${verb}`)) return jsonResponse(body);
    }
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
}

const ROW = {
  accrual_id: ACCRUAL,
  side: "expense",
  plan_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
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
  recorded_by: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-07-01T02:00:00.000Z",
  occurrence_count: 1,
  posted: false,
};

function app(node: ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Accruals"), node),
  });
}

test("652.list.empty — a client with NO accruals gets the empty sentence, both boundary statements, and no table shell", async () => {
  await withMockedEnv(rpcRouter({ list_accrual_adjustments: { client_id: CLIENT, accruals: [] } }), async () => {
    const h = await renderComponent(app(createElement(AccrualsList, { clientId: CLIENT })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.match(text, /No accruals recorded for this client yet\./,
        "the successful empty read has its own sentence");
      assert.doesNotMatch(text, /What is accrued/,
        "no table header renders over an empty register");
      assert.doesNotMatch(text, /can't read this yet/,
        "an empty read is not a refused one");
      // AC5's two sentences are properties of the lane, so they survive an empty register.
      assert.match(text, /Accepting an accrual records it; it does not post it/);
      assert.match(text, /An accrual is a schedule, not a period-fact adjustment/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("652.list.unresolved — the empty sentence NEVER renders over a read that has not returned", async () => {
  const never = new Promise<Response>(() => {});
  await withMockedEnv((() => never) as unknown as typeof fetch, async () => {
    const h = await renderComponent(app(createElement(AccrualsList, { clientId: CLIENT })));
    try {
      await h.settle();
      const text = h.text();
      assert.doesNotMatch(text, /No accruals recorded for this client yet\./,
        "\"nothing is accrued\" is a claim about the books; an unread register may not make it");
      assert.match(text, /Accepting an accrual records it; it does not post it/,
        "the boundary statement is on screen on first paint, before any read resolves");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("652.list.rows — one recorded accrual renders its term, its legs and the configured/posted word", async () => {
  await withMockedEnv(rpcRouter({ list_accrual_adjustments: { client_id: CLIENT, accruals: [ROW] } }), async () => {
    const h = await renderComponent(app(createElement(AccrualsList, { clientId: CLIENT })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.doesNotMatch(text, /No accruals recorded for this client yet\./);
      assert.match(text, /Monthly office rent accrual/);
      assert.match(text, /2026-07-01 to 2026-07-31/, "the service period is beside the money, always");
      assert.match(text, /Dr 6100 \/ Cr 2020/);
      assert.match(text, /Configured/, "an accrual with no committed receipt is CONFIGURED, not posted");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// ==============================================================================================
// #942 — THE SIDE ON THE REGISTER. Two accruals of one client can now run opposite ways, so a row
// that did not say which way it ran would be printing its two legs in the wrong order for half of
// them.
// ==============================================================================================

const REVENUE_ROW = {
  ...ROW,
  accrual_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddde",
  side: "revenue",
  purpose: "Unbilled advisory fees",
  expense_account_code: "4000",
  liability_account_code: "1180",
};

test("942.list.side — each row names its side and prints its two legs in POSTING order", async () => {
  await withMockedEnv(
    rpcRouter({ list_accrual_adjustments: { client_id: CLIENT, accruals: [ROW, REVENUE_ROW] } }),
    async () => {
      const h = await renderComponent(app(createElement(AccrualsList, { clientId: CLIENT })));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Dr 6100 \/ Cr 2020/, "an expense accrual debits its expense account");
        assert.match(text, /Dr 1180 \/ Cr 4000/,
          "a revenue accrual debits the accrued-income asset and credits the revenue account");
        assert.match(text, /Expense/);
        assert.match(text, /Revenue/);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// #1152 — THE FILTER IS NOW A SERVER ROUND TRIP, NEVER A BROWSER-SIDE NARROWING (the pre-#1152
// version of this cell drove `rpcRouter`'s single static answer and asserted on what the
// component narrowed LOCALLY; that claim no longer holds — the component renders exactly the
// rows the door hands it). This router answers per `p_side`, so the assertion below can only pass
// if the SECOND read genuinely reached the server with `p_side: "revenue"` and the server did the
// narrowing.
test("942.list.filter — the register can be narrowed to one side, and the narrowing is a SERVER round trip, not a component-side filter", async () => {
  const bodies: Record<string, unknown>[] = [];
  const sideAwareRouter = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!url.includes("/rpc/list_accrual_adjustments")) return jsonResponse({ message: `unmocked ${url}` }, 404);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    const side = body.p_side ?? null;
    const rows = side === "revenue" ? [REVENUE_ROW] : side === "expense" ? [ROW] : [ROW, REVENUE_ROW];
    return jsonResponse({ client_id: CLIENT, from: null, to: null, side, accruals: rows, next_cursor: null });
  }) as typeof fetch;

  await withMockedEnv(sideAwareRouter, async () => {
    const h = await renderComponent(app(createElement(AccrualsList, { clientId: CLIENT })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.equal(bodies.length, 1, "one read on mount");
      assert.equal(bodies[0]?.p_side, null, "the first read asks for every side, no filter set yet");
      assert.match(h.text(), /Unbilled advisory fees/);
      assert.match(h.text(), /Monthly office rent accrual/);

      const filter = h.find((n) => (n as { getAttribute?: (k: string) => string | null })
        .getAttribute?.("id") === "accruals-side-filter");
      assert.ok(filter, "the register offers a side filter");
      await h.fireEvent(filter, "change", (n) => setFieldValue(n, "revenue"));
      for (let i = 0; i < 3; i++) await h.settle();

      assert.equal(bodies.length, 2, "changing the side control makes a SECOND round trip to the door");
      assert.equal(bodies[1]?.p_side, "revenue", "…carrying the newly selected side to the server");
      const text = h.text();
      assert.match(text, /Unbilled advisory fees/);
      assert.doesNotMatch(text, /Monthly office rent accrual/,
        "the expense accrual is gone because the SERVER excluded it from the answer, not a component-side filter");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// ==============================================================================================
// #1071 — THE AMOUNT COLUMN NAMES ITS OWN KIND. `amount_cents` means two different things
// depending on `method.rule`: under `stated_amount` it is the figure THIS accrual posts EVERY
// period; under `stated_period_amount` (#937) it is the TOTAL across the whole authority window,
// and the per-period figures live only in `period_amounts` (rendered on the detail view, #1070 —
// the register never shows them, by that ticket's own "out of scope" line). Before this ticket the
// Amount column printed the bare figure for both rows alike, so a reader scanning the register
// could not tell — FROM THE AMOUNT COLUMN ALONE — which fact they were looking at. The Term
// column's method sentence (asserted by `942.list.side` et al. via `methodLabel`) already answers
// this, but not beside the money, which is where a reader who skips straight to the figure needs
// it. The Term column is deliberately left untouched by this ticket.
// ==============================================================================================

const PERIOD_TOTAL_ROW = {
  ...ROW,
  accrual_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddaa",
  purpose: "Unbilled consulting retainer, stated per period",
  method: { rule: "stated_period_amount" },
  // Deliberately NOT the same figure as ROW's, and not a round multiple of it, so a cell that
  // matched the wrong row's amount cannot pass by accident.
  amount_cents: 200000,
};

test("1071.list.amount-kind — the Amount column names whether its figure is per period or a window total", async () => {
  await withMockedEnv(
    rpcRouter({ list_accrual_adjustments: { client_id: CLIENT, accruals: [ROW, PERIOD_TOTAL_ROW] } }),
    async () => {
      const h = await renderComponent(app(createElement(AccrualsList, { clientId: CLIENT })));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        // AC1 — a `stated_amount` row's figure is unambiguously per-period, and now says so.
        assert.match(text, /1,200\.00Per period/,
          "ROW's Amount cell names its own figure as the per-period one, right beside the money");
        // AC2 — a `stated_period_amount` row's figure is unambiguously the window total, and says
        // so rather than looking like the same kind of figure as ROW's.
        assert.match(text, /2,000\.00Window total/,
          "PERIOD_TOTAL_ROW's Amount cell names its own figure as the window total, not a per-period one");
        // The two labels differ, so the column is distinguishable row to row (AC3) and neither
        // label leaked onto the other row's figure.
        assert.doesNotMatch(text, /1,200\.00Window total/);
        assert.doesNotMatch(text, /2,000\.00Per period/);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
