// H-34 — "No counterparties recorded yet for this client" while customers exist.
//
// TWO independent facts composed into one false claim:
//
//   (1) The panel's kind state initialised to "vendor", and the ONLY read it issued
//       was `loadCounterparties(session, clientId, kind)`, which sends
//       `filters: { client_id: eq.…, kind: eq.… }` (lib/registers/counterparty.ts:87).
//       A customer row was therefore STRUCTURALLY unreachable until the human
//       pressed the Customers toggle.
//   (2) The empty branch resolved `ArApCounterparty.empty` — "No counterparties
//       recorded yet for this client." — a claim about the CLIENT, not about the
//       one kind the read actually asked for. Absence is not evidence, in the copy
//       layer.
//
// Worse in context: the panel is nested inside AgingRegister, whose own domain state
// defaults to "ar" = receivables = CUSTOMERS. So on first paint the aging table above
// showed customer aging while the panel below asserted the client had no
// counterparties at all.
//
// The fix reads BOTH kinds (two calls of the same function — no new read, no new
// grant) and puts each kind's count on its own toggle, so a human can never read
// "none" while the other toggle shows a number.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { CounterpartyHygienePanel } from "./counterparty-hygiene-panel";

enableDomInspection();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const CUSTOMER = {
  id: "cu1", firm_id: "f1", client_id: "c1", kind: "customer", name: "ABC Trading",
  name_normalized: "abctrading", registration_no: null, tin: null, payment_terms_days: 30,
  merged_into: null, retired_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

/** Records every `kind=eq.…` this panel actually asked the wire for. */
function mockWithKinds(rowsByKind: Record<string, unknown[]>, seen: string[]): typeof fetch {
  return (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/counterparties")) {
      const m = /kind=eq\.(\w+)/.exec(url);
      const kind = m?.[1] ?? "";
      seen.push(kind);
      return jsonResponse(rowsByKind[kind] ?? []);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
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
    children: createElement(CounterpartyHygienePanel, { clientId: "c1" }),
  });
}

test("H-34: zero vendors + one customer must NOT claim the client has no counterparties", async () => {
  const seen: string[] = [];
  await withMockedEnv(mockWithKinds({ vendor: [], customer: [CUSTOMER] }, seen), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();

      // BOTH kinds were read — the wire assertion, so the scoping stays visible.
      assert.deepEqual([...seen].sort(), ["customer", "vendor"], "the panel must ask for both kinds, not only the active one");

      // The empty sentence names the KIND that was read.
      assert.match(text, /No vendor is recorded yet for this client/);
      assert.doesNotMatch(text, /No counterparties recorded yet for this client/, "the old sentence claimed something the read never asked");

      // …and the other toggle carries its own count, so "none" is never the last
      // word a human reads.
      assert.match(text, /Customers\s*1/, "the Customers toggle must carry its own count");
      assert.match(text, /Vendors\s*0/, "and the active toggle its own");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// MUST-NOT-RED CONTROL: the panel still shows the ACTIVE kind's rows, and only
// those — reading both kinds must not start rendering both lists at once.
test("H-34 control: the active kind's list is what renders — reading both kinds does not merge them", async () => {
  const seen: string[] = [];
  const VENDOR = { ...CUSTOMER, id: "v1", kind: "vendor", name: "Lost Invention Sdn Bhd", name_normalized: "lostinventionsdnbhd" };
  await withMockedEnv(mockWithKinds({ vendor: [VENDOR], customer: [CUSTOMER] }, seen), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.match(text, /Lost Invention Sdn Bhd/, "the active (vendor) kind's row renders");
      assert.doesNotMatch(text, /ABC Trading/, "the inactive kind's rows must NOT render — only its count");
      assert.match(text, /Customers\s*1/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
