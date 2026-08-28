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
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
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
// F2 (independent review, fix-required): correction_entry is DELIBERATELY
// distinct from both entry_id and id here — "occ-e1" vs "e1"/"r1" — so a
// test asserting p_occurrence === "occ-e1" actually discriminates the DB's
// own resolved field from either plausible client-side re-derivation.
const RUNS_PROJECTED = RUNS.map((r) => ({ ...r, correctable: true, active_pair_id: null, active_pair_status: null, correction_verb: "clara.reverse_adjustment_pair", correction_entry: "occ-e1", correction_wall: null, correction_wall_advice: null }));
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

test("Reverse Pair door dialog: opens on click, reaches Confirm/Cancel, no keyboard-walk violations while open", async () => {
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

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reverse pair" && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable while open, distinct from the trigger");

      // F7 (independent review, fix-required — RECORDED, not fixed by
      // trying harder here): a genuine "does Cancel close the dialog" proof
      // was attempted and FAILED for a real reason, not a flaky one —
      // hookHarness.ts's own `clickButton` header documents that
      // `@base-ui/react`'s `DialogClose` (Cancel) checks `event instanceof
      // KeyboardEvent` internally, which this fake-DOM harness's dispatched
      // events never satisfy, via `fireEvent` OR `clickButton` — "a
      // SEPARATE, deeper gap this function does not close." Asserting
      // "the trigger is reachable again" after a Cancel click (the
      // ORIGINAL shape here) was vacuous for exactly this reason: Cancel
      // never provably closes anything in this environment, so the
      // assertion always passed regardless of whether the real product
      // does. The genuine "does this dialog actually close" proof below
      // rides the CONFIRM path instead — `clickButton` IS proven to reach a
      // door dialog's own Confirm handler end to end — and lives in the F2
      // test immediately below, which also checks the dialog's own Confirm
      // button is GONE after a real, successful confirm.
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

// F2 (independent review, fix-required): a real Reverse-pair Confirm click
// must send the DB's own `correction_entry` as `p_occurrence` — never a
// client-side re-derivation from `entry_id` (or `id`). Both wrong
// derivations are distinguishable from the fixture's deliberately-distinct
// "occ-e1" (see RUNS_PROJECTED's own comment above).
test("F2: Reverse Pair's Confirm posts p_occurrence = the DB's own correction_entry, never entry_id/id", async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/rpc/reverse_adjustment_pair")) {
      capturedBody = init?.body ? JSON.parse(String(init.body)) : {};
      return jsonResponse({ pair_id: "pr2", status: "pending" });
    }
    return mockFetch(url);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Reverse pair"));
      assert.ok(trigger, "the Reverse Pair trigger must render");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const reasonField = findIn(body as never, (n) => n.tagName === "INPUT" && (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("id") === "adj-reverse-pair-reason");
      assert.ok(reasonField, "the reason field must be reachable inside the dialog");
      await h.act(() => { setFieldValue(reasonField as never, "wrong period charged"); });
      for (let i = 0; i < 2; i++) await h.settle();

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reverse pair" && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable");
      await h.act(() => { clickButton(confirmButton as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      assert.ok(capturedBody, "reverse_adjustment_pair must have been called");
      assert.equal((capturedBody as Record<string, unknown>).p_occurrence, "occ-e1", "p_occurrence must be the DB's own correction_entry, not entry_id (\"e1\") or id (\"r1\")");

      // F7 (independent review, fix-required): the GENUINE close proof — via
      // the Confirm path, which clickButton IS proven to reach end to end
      // (unlike Cancel/DialogClose, see the sibling test's own note above).
      const confirmAfterSuccess = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reverse pair" && (n as unknown) !== (trigger as unknown),
      );
      assert.equal(confirmAfterSuccess, null, "the dialog's own Confirm button must be GONE after a real, successful confirm — the dialog genuinely closed, never a never-closes mutant");
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
