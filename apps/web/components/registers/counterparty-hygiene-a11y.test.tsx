// GATE (b) — structural a11y scan of the T8 AR/AP + counterparty surfaces
// (owner ruling Q7): the extended aging tab (statement panel open) and the
// NEW counterparty hygiene panel, collapsed AND with its heaviest-treatment
// dialog — the three-step merge ceremony — open through the preview step.
// See test/domInspect.ts's header for why this rides a hand-written rule
// engine rather than real axe-core (the close-a11y.test.tsx precedent).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { AgingRegister } from "./aging-register";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

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

const VENDORS = [
  { id: "v1", firm_id: "f1", client_id: "c1", kind: "vendor", name: "Lost Invention Sdn Bhd", name_normalized: "lostinventionsdnbhd", registration_no: "123456-A", tin: "T1111", payment_terms_days: 30, merged_into: null, retired_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "v2", firm_id: "f1", client_id: "c1", kind: "vendor", name: "Lost Invention (old)", name_normalized: "lostinventionold", registration_no: null, tin: null, payment_terms_days: null, merged_into: null, retired_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];
const CUSTOMERS = [
  { id: "cu1", firm_id: "f1", client_id: "c1", kind: "customer", name: "ABC Trading", name_normalized: "abctrading", registration_no: null, tin: null, payment_terms_days: 30, merged_into: null, retired_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];
// M8/M12/M13 (independent review, fix-required): every fixture cents value
// is DISTINCT and non-round on purpose — a mutant that swaps which field
// feeds a rendered amount, or that drops a `+`/`-`, produces a DIFFERENT
// exact string here, never a coincidentally-matching round number.
const AR_AGING = {
  as_of: "2026-08-28", domain: "ar",
  counterparties: [{ counterparty_id: "cu1", counterparty_name: "ABC Trading", current_cents: 123456, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 123456, items: [{ item_id: "i1", item_kind: "invoice", item_date: "2026-08-01", due_date: "2026-08-31", overdue: false, outstanding_cents: 123456, bucket: "current" }] }],
  totals: { current_cents: 123456, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 123456 },
};
const AP_AGING = {
  as_of: "2026-08-28", domain: "ap",
  counterparties: [{ counterparty_id: "v1", counterparty_name: "Lost Invention Sdn Bhd", current_cents: 567890, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 567890, items: [{ item_id: "i2", item_kind: "bill", item_date: "2026-08-01", due_date: "2026-08-31", overdue: false, outstanding_cents: 567890, bucket: "current" }] }],
  totals: { current_cents: 567890, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 567890 },
};
const STATEMENT = {
  counterparty_id: "cu1", domain: "ar", from: "2026-01-01", to: "2026-08-28",
  opening_balance_cents: 54321,
  rows: [
    { event_date: "2026-03-15", row_type: "item", label: "invoice", delta_cents: 123456, running_balance_cents: 177777, item_id: "i1", allocation_id: null },
    { event_date: "2026-05-01", row_type: "allocation", label: "apply", delta_cents: -22222, running_balance_cents: 155555, item_id: "i1", allocation_id: "al1" },
  ],
  closing_balance_cents: 155555,
};

let lastStatementBody: Record<string, unknown> | null = null;

async function mockFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const u = String(url);
  if (u.includes("/rpc/ar_aging")) return jsonResponse(AR_AGING);
  if (u.includes("/rpc/ap_aging")) return jsonResponse(AP_AGING);
  if (u.includes("/rpc/customer_statement") || u.includes("/rpc/supplier_statement")) {
    // F1 pinning: capture the exact wire body sent for the p_from assertion.
    lastStatementBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    return jsonResponse(STATEMENT);
  }
  if (u.includes("/rest/v1/counterparties?") && u.includes("kind=eq.vendor")) return jsonResponse(VENDORS);
  if (u.includes("/rest/v1/counterparties?") && u.includes("kind=eq.customer")) return jsonResponse(CUSTOMERS);
  if (u.includes("/rest/v1/counterparties?")) return jsonResponse([...VENDORS, ...CUSTOMERS]);
  // Rung-0 finding: counterparty_aliases carries no clara_authenticated
  // read policy — a real live call would 42501 permission-denied. Mocked as
  // an error here (never a silent [] or fake row) so any regression that
  // reaches for this endpoint fails loudly, never quietly.
  if (u.includes("/rest/v1/counterparty_aliases?")) return jsonResponse({ message: "permission denied for table counterparty_aliases" }, 403);
  if (u.includes("/rest/v1/open_items?")) return jsonResponse([]);
  if (u.includes("/rest/v1/open_item_allocations?")) return jsonResponse([]);
  throw new Error(`unexpected fetch: ${u}`);
}

function App() {
  // Wrapped in an <h1> the same way the real client-workspace page renders
  // above the registers tab (the documented pattern in every P3 a11y test).
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(AgingRegister, { clientId: "c1" })),
  });
}

test("aging tab (AR table + counterparty hygiene panel), collapsed, has zero a11y violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /ABC Trading/, "the aging table must have loaded far enough to show the real counterparty");
      assert.match(h.text(), /Lost Invention Sdn Bhd/, "the hygiene panel (default vendor tab) must have loaded far enough to show a real vendor");
      // M14 (independent review): the aging table's own DB-returned client
      // total, exact string — this component test inherited a pre-existing
      // gap (no assertion at all on the totals row) that this closes.
      assert.match(h.text(), /RM 1,234\.56/, "the aging table's own client-total row must render the DB's exact figure, never a client-computed one");

      const violations = checkAccessibility(body as never);
      assert.deepEqual(violations, [], `collapsed: ${JSON.stringify(violations)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("counterparty statement panel OPEN (View statement) has zero a11y violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      lastStatementBody = null;
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("View statement"));
      assert.ok(trigger, "the View statement trigger must render on the aging row");
      await h.fireEvent(trigger! as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      assert.match(h.text(), /Statement/, "the statement panel heading must have rendered");

      // F1 (independent review, fix-required): p_from is NEVER null on the
      // wire — a null p_from makes _statement_core return zero rows and zero
      // opening balance (BETWEEN NULL AND x is never true), proven on a live
      // rig. Pin it here so a regression back to null fails this test.
      // Cast, not a plain narrow: TS's control-flow analysis sees only the
      // synchronous `lastStatementBody = null` above and cannot see that the
      // AWAITED settle() calls let mockFetch (a separate closure) reassign
      // it in between — without the cast it narrows the read to `null`
      // statically and `p_from` below reports as a property of `never`.
      const capturedBody = lastStatementBody as Record<string, unknown> | null;
      assert.ok(capturedBody, "the statement RPC must have been called");
      assert.notEqual(capturedBody.p_from, null, "p_from must never be null");
      assert.match(String(capturedBody.p_from), /^\d{4}-01-01$/, "p_from defaults to 1 January of the current business year");

      // M12/M13 (independent review): exact rendered amounts, FIVE distinct
      // non-round fixture values across opening / a positive delta / that
      // row's own running balance / a negative delta / the closing balance
      // (which equals the SECOND row's running balance, not the first) —
      // each its own DB-returned figure, never derived by this screen. A
      // mutant that grabs the wrong row, drops a sign, or re-sums produces
      // a DIFFERENT string here.
      const bodyText = textOf(body as never);
      assert.match(bodyText, /RM 543\.21/, "the opening balance must render the DB's exact figure");
      assert.match(bodyText, /RM 1,234\.56/, "the first row's positive delta must render the DB's exact figure");
      assert.match(bodyText, /RM 1,777\.77/, "the first row's own running balance must render the DB's exact figure");
      assert.match(bodyText, /-RM 222\.22/, "the second row's negative delta must render the DB's exact figure, sign included");
      assert.match(bodyText, /RM 1,555\.55/, "the closing balance must render the SECOND row's running balance, not the first's");

      const violations = checkAccessibility(body as never);
      assert.deepEqual(violations, [], `statement panel open: ${JSON.stringify(violations)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("Merge Counterparties dialog OPEN through the preview step has zero a11y violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();

      const mergeTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Merge…"));
      assert.ok(mergeTrigger, "a Merge trigger must render (two live vendors exist as candidates for each other)");
      await h.fireEvent(mergeTrigger! as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const otherSelect = findIn(body as never, (n) => n.tagName === "SELECT" && (n.childNodes ?? []).some((c) => c.tagName === "OPTION" && textOf(c as never).includes("Select a counterparty")));
      assert.ok(otherSelect, "the merge dialog's own other-party select must be reachable inside the portal");
      await h.act(() => { setFieldValue(otherSelect as never, "v2"); });

      const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(reasonField, "the reason textarea must be reachable inside the dialog");
      await h.act(() => { setFieldValue(reasonField as never, "duplicate vendor, same registration"); });

      const previewButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Preview merge"));
      assert.ok(previewButton, "the Preview merge button must be reachable, distinct from the trigger");
      // House law (apps/web/AGENTS.md, "Testing a dialog"): assert the gate,
      // THEN act — clickButton is not a substitute for checking `disabled`.
      assert.equal((previewButton as unknown as { disabled: boolean }).disabled, false, "Preview must be enabled once both fields are filled");
      await h.act(() => { clickButton(previewButton as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      // The dialog's content is PORTALED into document.body, a separate
      // subtree from h.container — h.text() only reads h.container, so any
      // assertion on content inside an OPEN dialog must read textOf(body)
      // instead (the T5 staff-advances-a11y.test.tsx precedent).
      const bodyText = textOf(body as never);
      assert.match(bodyText, /What each side carries/, "the preview step must have rendered the comparison card's own title");
      assert.match(bodyText, /Lost Invention Sdn Bhd/, "the survivor side's real name must render");
      assert.match(bodyText, /Lost Invention \(old\)/, "the merged side's real name must render");
      // M8 (independent review): the survivor's exact DB-returned
      // outstanding figure, from the merge preview's own FRESH ap_aging
      // read — never a stale figure carried over from the aging table this
      // dialog was opened from.
      assert.match(bodyText, /RM 5,678\.90/, "the survivor's outstanding must render the fresh preview read's exact figure");

      const violations = checkAccessibility(body as never);
      assert.deepEqual(violations, [], `merge dialog at preview step: ${JSON.stringify(violations)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
