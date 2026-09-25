// components/bank/payroll-settlements-section.tsx — #947. Mounted for real via
// test/hookHarness.ts's `renderComponent`:
//   - an unsettled run's candidate renders with its date/description/amount, and clicking
//     Accept posts settle_payroll_net_pay with the right client/entry/line and reloads;
//   - a refusal from the settle door renders VISIBLY, never silently un-busies;
//   - the empty state (every run settled, or none posted) renders its own copy, never a bare
//     blank card.
//
// #1059 — REOPENING A WRONGLY ACCEPTED SETTLEMENT. Accepting a candidate returns a receipt
// naming the settlement entry and the match it bound; this panel keeps that pair in memory
// (never re-derived — there is no read that lists a SETTLED run, by design: 0298's own
// `get_payroll_settlement_candidates` filters `unsettled_cents > 0`) and offers a single
// "reverse settlement" ceremony right where the Accept happened. Confirming composes the two
// EXISTING general-purpose doors this ticket names — `unmatch_bank_match` THEN `reverse_entry`,
// in that order (the estate's own reversal belt refuses a reverse while a live match still
// rides the entry) — never a new SQL door.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
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

test("p1059.web.reverse · reversing an accepted settlement composes unmatch_bank_match then reverse_entry with the right ids/reason, and the run is offered again", async () => {
  const seenUnmatchBodies: Record<string, unknown>[] = [];
  const seenReverseBodies: Record<string, unknown>[] = [];
  let candidateCalls = 0;
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rpc/get_payroll_settlement_candidates")) {
        candidateCalls += 1;
        // 1st (mount): unsettled. 2nd (post-accept reload): settled, so the run drops out.
        // 3rd (post-reversal reload): unsettled again — the whole point of #1059.
        return jsonResponse(candidateCalls === 2 ? [] : [RUN]);
      }
      if (url.includes("/rpc/settle_payroll_net_pay")) {
        return jsonResponse({ entry_id: "e2", match_id: "m1", unsettled_cents: 425570, posting_date: "2026-09-02", status: "settled" });
      }
      if (url.includes("/rpc/unmatch_bank_match")) {
        seenUnmatchBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ match_id: "m1", status: "unmatched" });
      }
      if (url.includes("/rpc/reverse_entry")) {
        seenReverseBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ reversal_id: "e3", status: "approved" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        const accept = findButtonByText(h, "Accept");
        await h.act(() => clickButton(accept as never));
        await h.settle();

        // AC1 — the settled run's entry is discoverable from this very panel, with a route to
        // reverse it: the accept receipt (entry e2 / match m1) is what the reversal ceremony
        // below acts on, never re-derived from a fresh read.
        const startReverse = findButtonByText(h, "Reverse settlement");
        await h.act(() => clickButton(startReverse as never));
        await h.settle();

        const reasonInput = h.find((n) => n.tagName === "INPUT" && textOf((n.parentNode ?? {}) as Node).includes("Reason"));
        assert.ok(reasonInput, "the reverse ceremony's reason input must render");
        await h.act(() => { setFieldValue(reasonInput as never, "accepted the wrong candidate"); });

        const confirm = findButtonByText(h, "Confirm reverse");
        await h.act(() => clickButton(confirm as never));
        for (let i = 0; i < 3; i++) await h.settle();

        // THE ORDER (the estate's own reversal belt): unmatch first, then reverse — both with
        // the SAME typed reason, both naming the ids the accept receipt returned.
        assert.equal(seenUnmatchBodies.length, 1, "unmatch_bank_match must have been called exactly once");
        assert.equal(seenUnmatchBodies[0]?.p_match, "m1");
        assert.equal(seenUnmatchBodies[0]?.p_reason, "accepted the wrong candidate");
        assert.equal(seenReverseBodies.length, 1, "reverse_entry must have been called exactly once");
        assert.equal(seenReverseBodies[0]?.p_entry, "e2");
        assert.equal(seenReverseBodies[0]?.p_reason, "accepted the wrong candidate");

        // AC2/AC3 — the run is unsettled again: the SAME candidate reappears in this panel.
        assert.match(h.text(), /SALARY GIRO/);
        assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n as never).includes("Reverse settlement")), null,
          "the reversed settlement's own ceremony is gone once it is no longer just-settled");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p1059.web.refusal · a reverse_entry refusal during the reversal ceremony renders visibly, never a silent un-busy", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([RUN]);
      if (url.includes("/rpc/settle_payroll_net_pay")) {
        return jsonResponse({ entry_id: "e2", match_id: "m1", unsettled_cents: 425570, posting_date: "2026-09-02", status: "settled" });
      }
      if (url.includes("/rpc/unmatch_bank_match")) return jsonResponse({ match_id: "m1", status: "unmatched" });
      if (url.includes("/rpc/reverse_entry")) {
        return jsonResponse({ code: "CLR10", message: "entry e2 rides 1 pending or live bank match(es), as a member or as a reservation's draft anchor; unmatch first, then reverse", details: '{"reason":"live_bank_match_present"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        await h.act(() => clickButton(findButtonByText(h, "Accept") as never));
        await h.settle();
        await h.act(() => clickButton(findButtonByText(h, "Reverse settlement") as never));
        await h.settle();
        const reasonInput = h.find((n) => n.tagName === "INPUT" && textOf((n.parentNode ?? {}) as Node).includes("Reason"));
        await h.act(() => { setFieldValue(reasonInput as never, "wrong candidate"); });
        await h.act(() => clickButton(findButtonByText(h, "Confirm reverse") as never));
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /unmatch first, then reverse/, "the DB's own refusal message renders, verbatim");
        assert.match(h.text(), /CLR10/);
      } finally {
        await h.unmount();
      }
    },
  );
});
