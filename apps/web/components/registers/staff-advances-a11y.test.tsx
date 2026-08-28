// GATE (b) — structural a11y scan of the staff-advances workbench + the Enrol
// Account door dialog open (owner ruling Q7). See test/domInspect.ts's header
// for why this rides a hand-written rule engine rather than real axe-core —
// the close-a11y.test.tsx precedent, ported to this train's own panel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { StaffAdvancesRegister } from "./staff-advances-register";

enableDomInspection();

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

const ACCOUNTS = [
  { client_id: "c1", account_code: "2100", name: "Staff advances — Ah Chong", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { client_id: "c1", account_code: "5100", name: "Wages and salaries", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
];

const ENROLMENTS = [
  { id: "en1", client_id: "c1", account_code: "2100", person_label: "Ah Chong", enrolment_attestation: "Not a related party.", active: true, enrolled_at: "2026-01-01T00:00:00Z", retired_by: null, retired_at: null, retired_reason: null },
];

const SUMMARY = { client_id: "c1", as_of: "2026-08-28", advances: [], outstanding_cents: 0, incomplete_count: 0, policy_notes: [] };
const TIE = { client_id: "c1", as_of: "2026-08-28", tie: true, accounts: [] };

async function mockFetch(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rest/v1/staff_advances?")) return jsonResponse([]);
  if (u.includes("/rest/v1/staff_advance_accounts?")) return jsonResponse(ENROLMENTS);
  if (u.includes("/rest/v1/coa_accounts?")) return jsonResponse(ACCOUNTS);
  if (u.includes("/rpc/staff_advance_summary")) return jsonResponse(SUMMARY);
  if (u.includes("/rpc/staff_advance_tie")) return jsonResponse(TIE);
  throw new Error(`unexpected fetch: ${u}`);
}

function App() {
  // Wrapped in an <h1> the same way the real client-workspace page renders
  // above the registers tab (the documented pattern in every P3 a11y test).
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(StaffAdvancesRegister, { clientId: "c1" })),
  });
}

test("staff-advances workbench + Enrol Account door dialog OPEN have zero violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.match(h.text(), /Ah Chong/, "the panel must have loaded far enough to show the enrolled account");

      const collapsedViolations = checkAccessibility(body as never);
      assert.deepEqual(collapsedViolations, [], `collapsed: ${JSON.stringify(collapsedViolations)}`);

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Enrol account"));
      assert.ok(trigger, "the Enrol Account dialog trigger must render");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the trigger must reveal the dialog's cancel control");
      assert.match(bodyText, /related-party/, "the dialog must render the real G15 attestation copy, not a placeholder");

      const openViolations = checkAccessibility(body as never);
      assert.deepEqual(openViolations, [], `open dialog: ${JSON.stringify(openViolations)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("staff-advances workbench renders the tie-out state banner honestly (register ties to the GL)", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.match(h.text(), /ties to the general ledger/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
