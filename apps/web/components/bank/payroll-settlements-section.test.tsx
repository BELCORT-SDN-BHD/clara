// components/bank/payroll-settlements-section.tsx — #947. Mounted for real via
// test/hookHarness.ts's `renderComponent`:
//   - an unsettled run's candidate renders with its date/description/amount, and clicking
//     Accept posts settle_payroll_net_pay with the right client/entry/line and reloads;
//   - a refusal from the settle door renders VISIBLY, never silently un-busies;
//   - the empty state (every run settled, or none posted) renders its own copy, never a bare
//     blank card.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import { PayrollSettlementsSection } from "./payroll-settlements-section";
import messages from "../../messages/en.json";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

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

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(PayrollSettlementsSection, { clientId: "c1" }),
  });
}

const RUN = {
  entry_id: "e1", document_id: "d1", filing_id: "f1", posting_date: "2026-08-31",
  period_month: "2026-08-01", net_pay_cents: 425570, unsettled_cents: 425570,
  candidates: [
    { line_id: "l1", statement_id: "s1", bank_account_id: "b1", bank_account_display: "Maybank 1234",
      entry_date: "2026-09-02", value_date: "2026-09-02", description: "SALARY GIRO",
      amount_cents: -425570, date_delta_days: 2, class_hint: "payroll" },
  ],
};

async function mountAndSettle() {
  const h = await renderComponent(App());
  for (let i = 0; i < 3; i++) await h.settle();
  return h;
}

function findButtonByText(h: Awaited<ReturnType<typeof renderComponent>>, needle: string): Node {
  const found: Node[] = [];
  function walk(n: Node) {
    if (n.tagName === "BUTTON" && textOf(n as never).includes(needle)) found.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  }
  walk(h.container as unknown as Node);
  assert.equal(found.length, 1, `expected exactly one button containing "${needle}", found ${found.length}`);
  return found[0]!;
}

test("p947.web.accept · an unsettled run's candidate renders, and accepting it posts settle_payroll_net_pay with the right ids", async () => {
  const seenBodies: Record<string, unknown>[] = [];
  let settleCalls = 0;
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([RUN]);
      if (url.includes("/rpc/settle_payroll_net_pay")) {
        settleCalls += 1;
        seenBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ entry_id: "e2", match_id: "m1", unsettled_cents: 425570, posting_date: "2026-09-02" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        assert.match(h.text(), /SALARY GIRO/);
        assert.match(h.text(), /RM 4,255\.70/);
        const accept = findButtonByText(h, "Accept");
        await h.act(() => clickButton(accept as never));
        await h.settle();
        assert.equal(settleCalls, 1);
        assert.equal(seenBodies[0]?.p_client, "c1");
        assert.equal(seenBodies[0]?.p_entry, "e1");
        assert.equal(seenBodies[0]?.p_line, "l1");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p947.web.refusal · a settle_payroll_net_pay refusal renders visibly, never a silent un-busy", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([RUN]);
      if (url.includes("/rpc/settle_payroll_net_pay")) {
        return jsonResponse({ code: "CLR10", message: "statement line l1 (100 cents) does not match this run's unsettled net pay (425570 cents)", details: '{"reason":"amount_mismatch"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        const accept = findButtonByText(h, "Accept");
        await h.act(() => clickButton(accept as never));
        await h.settle();
        assert.match(h.text(), /does not match this run's unsettled net pay/, "the DB's own refusal message renders, verbatim");
        assert.match(h.text(), /CLR10/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p947.web.empty · no unsettled run renders the empty state, never a bare blank card", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        assert.match(h.text(), /No payroll run is waiting/i);
      } finally {
        await h.unmount();
      }
    },
  );
});
