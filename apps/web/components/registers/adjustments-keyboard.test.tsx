// GATE (c) — keyboard-walk tests for the adjustments workbench's door dialogs
// (owner ruling Q7). See test/keyboardWalk.ts's header for exactly what this
// environment can and cannot prove about real key-event dispatch. The P3
// workbench lesson: a keyboard gate found six permanently-unopenable doors
// five code reviews missed — a different instrument, not another reader;
// every door dialog in this train gets one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
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
  { id: "tpl1", client_id: "c1", status: "live", name: "Monthly rent accrual", cadence: "monthly", start_date: "2026-01-01", end_date: null, auto_reverse: true, memo_template: "Rent accrual" },
];
const RUNS = [
  { id: "r1", client_id: "c1", template_id: "tpl1", period_start: "2026-01-01", period_end: "2026-01-31", mode: "post", entry_id: "e1", reversal_entry_id: null, amount_cents: 10000, created_at: "2026-02-01T00:00:00Z" },
];
const ACCOUNTS = [
  { client_id: "c1", account_code: "5100", name: "Rent expense", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
];
const RUNS_PROJECTED = RUNS.map((r) => ({ ...r, correctable: true, active_pair_id: null, active_pair_status: null, correction_verb: "clara.reverse_adjustment_pair", correction_wall: null, correction_wall_advice: null }));
const DUE = { due: false, reason: "nothing_due", blocked: [] };
const PAIR_REVERSALS = [
  { id: "pr1", client_id: "c1", template_id: "tpl1", occurrence_id: "e1", mirror_id: "e2", occurrence_correction_id: "e3", mirror_correction_id: "e4", maker: "u1", status: "pending", completed_at: null, op_key: "k1", created_at: "2026-02-05T00:00:00Z" },
];

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

test("adjustments workbench: every door trigger is keyboard-reachable, in DOM order, no positive tabindex", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      // A live template with a pending pair reversal exercises every trigger
      // this train's ceremony can show at once: Propose (always), Retire (live,
      // not retired), Run now, Reverse pair (correctable run), Approve/Cancel
      // (pending pair) — Sign is deliberately absent (only a proposed template
      // shows it, and this fixture's template is already live).
      const triggers = ["Propose template", "Retire", "Run now", "Reverse pair", "Approve", "Cancel"];
      for (const label of triggers) {
        const t = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(label));
        assert.ok(t, `the ${label} trigger must render as a real <button>`);
        assert.ok(focusableElements(h.container as never).includes(t as never), `${label} must be keyboard-reachable`);
      }
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations on the collapsed panel");
    } finally {
      await h.unmount();
    }
  });
});

test("Reverse Pair door dialog: opens on click, reaches Confirm/Cancel, leaves its trigger reachable again on close", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Reverse pair"));
      assert.ok(trigger, "the Reverse Pair trigger must render for a correctable run");

      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");

      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the dialog must reveal its Cancel control");
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
      assert.ok(cancelButton, "the Cancel control must render as a real <button>");
      await h.fireEvent(cancelButton as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Reverse pair"));
      assert.ok(
        triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
        "the trigger must be reachable again after the dialog closes — focus is not stranded on a removed node",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("Retire Template door dialog (per-row): the trigger is enabled from first render, and Confirm gates on the required reason field it opens", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const retireTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Retire"));
      assert.ok(retireTrigger, "the Retire trigger must render for the live template row");
      assert.equal((retireTrigger as unknown as { disabled: boolean }).disabled, false, "the trigger itself is never gated — only Confirm is");

      await h.fireEvent(retireTrigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(textarea, "the click must genuinely open the dialog and reach the reason field");

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Retire" && (n as unknown) !== (retireTrigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm stays disabled while the reason is empty");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
