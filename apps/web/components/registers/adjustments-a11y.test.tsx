// GATE (b) — structural a11y scan of the adjustments workbench + the Propose
// Template door dialog open (owner ruling Q7). See test/domInspect.ts's header
// for why this rides a hand-written rule engine rather than real axe-core —
// the staff-advances-a11y.test.tsx precedent, ported to this train's own panel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { AdjustmentsRegister } from "./adjustments-register";

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

const TEMPLATES = [
  { id: "tpl1", client_id: "c1", status: "proposed", name: "Monthly rent accrual", cadence: "monthly", start_date: "2026-01-01", end_date: null, auto_reverse: true, memo_template: "Rent accrual" },
];
const RUNS = [
  { id: "r1", client_id: "c1", template_id: "tpl1", period_start: "2026-01-01", period_end: "2026-01-31", mode: "post", entry_id: "e1", reversal_entry_id: null, amount_cents: 10000, created_at: "2026-02-01T00:00:00Z" },
];
const ACCOUNTS = [
  { client_id: "c1", account_code: "5100", name: "Rent expense", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
  { client_id: "c1", account_code: "2100", name: "Accrued liabilities", account_type: "liability", account_class: null, special_acc_type: null, is_active: true },
];
const RUNS_PROJECTED = RUNS.map((r) => ({ ...r, correctable: false, active_pair_id: null, active_pair_status: null, correction_verb: null, correction_wall: "entry_not_approved", correction_wall_advice: null }));
const DUE = { due: false, reason: "nothing_due", blocked: [] };
const PAIR_REVERSALS: unknown[] = [];

async function mockFetch(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rest/v1/adjustment_templates?")) return jsonResponse(TEMPLATES);
  if (u.includes("/rest/v1/adjustment_runs?")) return jsonResponse(RUNS);
  if (u.includes("/rest/v1/coa_accounts?")) return jsonResponse(ACCOUNTS);
  if (u.includes("/rest/v1/adjustment_pair_reversals?")) return jsonResponse(PAIR_REVERSALS);
  if (u.includes("/rpc/list_adjustment_runs")) return jsonResponse({ client_id: "c1", runs: RUNS_PROJECTED });
  if (u.includes("/rpc/adjustment_run_due")) return jsonResponse(DUE);
  throw new Error(`unexpected fetch: ${u}`);
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(AdjustmentsRegister, { clientId: "c1" })),
  });
}

test("adjustments workbench + Propose Template door dialog OPEN have zero violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /Monthly rent accrual/, "the panel must have loaded far enough to show the proposed template");

      const collapsedViolations = checkAccessibility(body as never);
      assert.deepEqual(collapsedViolations, [], `collapsed: ${JSON.stringify(collapsedViolations)}`);

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Propose template"));
      assert.ok(trigger, "the Propose Template dialog trigger must render");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the trigger must reveal the dialog's cancel control");

      const openViolations = checkAccessibility(body as never);
      assert.deepEqual(openViolations, [], `open dialog: ${JSON.stringify(openViolations)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("adjustments workbench renders the run-due banner honestly (nothing due today)", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /No adjustment run is due right now/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// A REAL governed refusal (retire_adjustment_template's own CLR38) driven
// through the Retire dialog's own Confirm button, asserted VERBATIM in the
// register's persistent banner — the F3-class test the staff-advances-a11y
// precedent minted (a mutant deleting the refusal-banner block must go red).
test("a governed refusal (retire_adjustment_template) renders verbatim in the register's own persistent banner, never merely as a rendered string", async () => {
  await withMockedEnv(
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/rpc/retire_adjustment_template")) {
        return jsonResponse(
          { code: "CLR38", message: "an occurrence draft for this template is still outstanding; approve or withdraw it before retiring the template", details: '{"reason":"occurrence_draft_outstanding"}' },
          400,
        );
      }
      return mockFetch(url).then((r) => { void init; return r; });
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const retireTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Retire"));
        assert.ok(retireTrigger, "the Retire trigger must render for the proposed template row");
        await h.fireEvent(retireTrigger! as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the reason textarea must be reachable inside the dialog");
        await h.act(() => { setFieldValue(textarea as never, "clearing an obsolete draft"); });
        for (let i = 0; i < 2; i++) await h.settle();

        const confirmButton = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Retire" && (n as unknown) !== (retireTrigger as unknown),
        );
        assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "the reason is filled — Confirm must be enabled");

        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 8; i++) await h.settle();

        assert.match(h.text(), /CLR38/, "the CLR code must render, verbatim");
        assert.match(h.text(), /occurrence draft for this template is still outstanding/, "the DB's own message must render, verbatim — never re-worded");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});
