// GATE (c) — keyboard-walk tests for T8's door dialogs (owner ruling Q7).
// The P3 workbench lesson: a keyboard gate found six permanently-unopenable
// doors five code reviews missed — a different instrument, not another
// reader. This train shipped exactly that class of defect once already in
// this same build (two triggers disabled on a client-side candidate count —
// fixed before this file was written) — every trigger below is asserted
// `disabled === false` from first render, never merely "renders".

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
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
  { id: "v1", firm_id: "f1", client_id: "c1", kind: "vendor", name: "Lost Invention Sdn Bhd", name_normalized: "x", registration_no: "123-A", tin: "T1", payment_terms_days: 30, merged_into: null, retired_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "v2", firm_id: "f1", client_id: "c1", kind: "vendor", name: "Lost Invention (old)", name_normalized: "y", registration_no: null, tin: null, payment_terms_days: null, merged_into: null, retired_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];
const AR_AGING = { as_of: "2026-08-28", domain: "ar", counterparties: [], totals: {} };
const AP_AGING = { as_of: "2026-08-28", domain: "ap", counterparties: [], totals: {} };

async function mockFetch(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rpc/ar_aging")) return jsonResponse(AR_AGING);
  if (u.includes("/rpc/ap_aging")) return jsonResponse(AP_AGING);
  if (u.includes("/rest/v1/counterparties?") && u.includes("kind=eq.vendor")) return jsonResponse(VENDORS);
  if (u.includes("/rest/v1/counterparties?") && u.includes("kind=eq.customer")) return jsonResponse([]);
  if (u.includes("/rest/v1/counterparties?")) return jsonResponse(VENDORS);
  // Rung-0 finding: counterparty_aliases carries no clara_authenticated read
  // policy — mocked as an error so any regression that reaches for it fails
  // loudly (see counterparty-hygiene-a11y.test.tsx's own comment).
  if (u.includes("/rest/v1/counterparty_aliases?")) return jsonResponse({ message: "permission denied for table counterparty_aliases" }, 403);
  if (u.includes("/rest/v1/open_items?")) return jsonResponse([]);
  if (u.includes("/rest/v1/open_item_allocations?")) return jsonResponse([]);
  throw new Error(`unexpected fetch: ${u}`);
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(AgingRegister, { clientId: "c1" })),
  });
}

// M5 (independent review, fix-required): a DETERMINISTIC mid-flight probe —
// the merge preview's own ap_aging read is gated behind a manually-resolved
// promise, so "the Merge button is disabled WHILE preview.data is null" can
// be asserted for real rather than raced against however fast the mocked
// fetch happens to resolve.
let releasePreviewFetch: (() => void) | null = null;
async function mockFetchGatedPreview(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rpc/ap_aging")) {
    await new Promise<void>((resolve) => {
      releasePreviewFetch = resolve;
    });
    return jsonResponse(AP_AGING);
  }
  return mockFetch(url);
}

// M15 (independent review, fix-required): a REAL governed refusal driven
// through a dialog's own Confirm button — the wave law is that the code and
// message land VERBATIM in the caller's persistent banner, OUTSIDE any
// dialog, which auto-closes on every confirm attempt regardless of outcome.
const RENAME_REFUSAL = { code: "CLR23", message: "counterparty name collides with an existing identity", details: '{"reason":"alias_collision"}' };
async function mockFetchWithRenameRefusal(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rpc/rename_counterparty")) return jsonResponse(RENAME_REFUSAL, 400);
  return mockFetch(url);
}

// S1 (independent review, fix-required): pins F7 — after a SUCCESSFUL
// apply_open_items/unallocate_group, the PARENT aging table re-reads (never
// stays stale), and the Apply dialog's own candidate pool (fed from that
// same fresh read) reflects it. Counted with a real call counter, never
// inferred from timing. `v1` carries two open items so Apply has a genuine
// source (a credit, negative outstanding) and target (a claim, positive) —
// BEFORE has both; AFTER has only the target, the credit fully applied away
// (`_aging_core`'s own `outstanding_cents <> 0` filter — a settled item
// simply stops appearing, never a placeholder row).
let apAgingCallCount = 0;
let applyOpenItemsBody: Record<string, unknown> | null = null;
const AP_AGING_S1_BEFORE = {
  as_of: "2026-08-28", domain: "ap",
  counterparties: [{
    counterparty_id: "v1", counterparty_name: "Lost Invention Sdn Bhd",
    current_cents: 60000, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 60000,
    items: [
      { item_id: "i1", item_kind: "bill", item_date: "2026-08-01", due_date: "2026-08-31", overdue: false, outstanding_cents: 100000, bucket: "current" },
      { item_id: "i2", item_kind: "credit_note", item_date: "2026-08-02", due_date: null, overdue: false, outstanding_cents: -40000, bucket: "current" },
    ],
  }],
  totals: { current_cents: 60000, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 60000 },
};
const AP_AGING_S1_AFTER = {
  as_of: "2026-08-28", domain: "ap",
  counterparties: [{
    counterparty_id: "v1", counterparty_name: "Lost Invention Sdn Bhd",
    current_cents: 60000, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 60000,
    items: [{ item_id: "i1", item_kind: "bill", item_date: "2026-08-01", due_date: "2026-08-31", overdue: false, outstanding_cents: 60000, bucket: "current" }],
  }],
  totals: { current_cents: 60000, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 60000 },
};
const STATEMENT_S1 = { counterparty_id: "v1", domain: "ap", from: "2026-01-01", to: "2026-08-28", opening_balance_cents: 0, rows: [], closing_balance_cents: 0 };

async function mockFetchS1Apply(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const u = String(url);
  if (u.includes("/rpc/ap_aging")) {
    apAgingCallCount += 1;
    return jsonResponse(apAgingCallCount === 1 ? AP_AGING_S1_BEFORE : AP_AGING_S1_AFTER);
  }
  if (u.includes("/rpc/supplier_statement")) return jsonResponse(STATEMENT_S1);
  if (u.includes("/rpc/apply_open_items")) {
    applyOpenItemsBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({ group_id: "g1", domain: "ap", applied_cents: 40000 });
  }
  return mockFetch(url);
}

// The unallocate cell needs one EXISTING application the statement panel's
// own open_item_allocations read can surface as a candidate group — v1's
// item i1, already the target of one prior apply.
const OPEN_ITEMS_S1 = [{ id: "i1", client_id: "c1", domain: "ap", counterparty_id: "v1", entry_id: "e1", item_kind: "bill", item_date: "2026-08-01", due_date: "2026-08-31", amount_cents: 100000 }];
const OPEN_ITEM_ALLOCATIONS_S1 = [{ id: "a1", client_id: "c1", domain: "ap", item_id: "i1", application_group: "g0", operation_kind: "apply", reverses_allocation_id: null, amount_cents: -40000, reason: "prior application", created_by: "u1", created_at: "2026-08-02T00:00:00Z" }];

async function mockFetchS1Unallocate(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rpc/ap_aging")) {
    apAgingCallCount += 1;
    return jsonResponse(apAgingCallCount === 1 ? AP_AGING_S1_AFTER : AP_AGING_S1_BEFORE); // unallocating REOPENS the credit, so the counts invert
  }
  if (u.includes("/rpc/supplier_statement")) return jsonResponse(STATEMENT_S1);
  if (u.includes("/rpc/unallocate_group")) return jsonResponse({ group_id: "g1", reversed_group: "g0", allocations: 2 });
  if (u.includes("/rest/v1/open_items?")) return jsonResponse(OPEN_ITEMS_S1);
  if (u.includes("/rest/v1/open_item_allocations?")) return jsonResponse(OPEN_ITEM_ALLOCATIONS_S1);
  return mockFetch(url);
}

test("aging tab: every top-level door trigger is keyboard-reachable, in DOM order, no positive tabindex, never disabled by a client-side count", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const triggers = ["Create counterparty", "Rename", "Set terms", "Add alias", "Merge…"];
      for (const label of triggers) {
        const t = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(label));
        assert.ok(t, `the ${label} trigger must render as a real <button>`);
        assert.equal((t as unknown as { disabled: boolean }).disabled, false, `${label} must never be disabled from the outside — client gating shapes what's INSIDE the dialog, never hides the door`);
        assert.ok(focusableElements(h.container as never).includes(t as never), `${label} must be keyboard-reachable`);
      }
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations on the collapsed panel");
    } finally {
      await h.unmount();
    }
  });
});

test("Create Counterparty dialog: opens on click, reaches every field and Confirm/Cancel, leaves its trigger reachable again on close", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Create counterparty"));
      assert.ok(trigger, "the Create counterparty trigger must render");

      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");

      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the dialog must reveal its Cancel control");
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
      assert.ok(cancelButton, "the Cancel control must render as a real <button>");
      await h.act(() => { clickButton(cancelButton as never); });
      for (let i = 0; i < 6; i++) await h.settle();

      // DISCRIMINATING post-condition (F5, independent review): the dialog's
      // own Cancel control must be GONE from document.body — true only if
      // the click genuinely closed the dialog, not merely true because the
      // trigger (which lives outside the portal and was never removed) is
      // still there regardless of whether Cancel did anything at all.
      const cancelStillThere = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
      assert.equal(cancelStillThere, null, "the dialog must have actually closed — Cancel's own control is gone from the DOM");

      const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Create counterparty"));
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

// THE STRONGEST CELL — a destructive, irreversible act, three steps, and the
// wave's own binding requirement that the destructive Merge control simply
// does not exist as an enabled affordance until a REAL preview has loaded.
test("Merge Counterparties dialog: the destructive confirm is gated by REAL preview state at every step, both steps pass the keyboard walk, and the trigger survives Cancel", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Merge…"));
      assert.ok(trigger, "the Merge trigger must render for a live counterparty with a real candidate");
      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger");

      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      // STEP 1 (pick): Preview is disabled until BOTH the other party and a
      // reason are filled — never a merge available on partial input.
      let previewButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Preview merge"));
      assert.ok(previewButton, "the Preview merge button must be reachable");
      assert.equal((previewButton as unknown as { disabled: boolean }).disabled, true, "Preview stays disabled with no other party and no reason picked yet");
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations at the pick step");

      const otherSelect = findIn(body as never, (n) => n.tagName === "SELECT");
      assert.ok(otherSelect, "the other-party select must be reachable inside the portal");
      await h.act(() => { setFieldValue(otherSelect as never, "v2"); });

      const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(reasonField, "the reason textarea must be reachable inside the portal");
      await h.act(() => { setFieldValue(reasonField as never, "duplicate vendor, same registration"); });
      for (let i = 0; i < 2; i++) await h.settle();

      previewButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Preview merge"));
      assert.equal((previewButton as unknown as { disabled: boolean }).disabled, false, "Preview enables once both fields are filled");

      // STEP 2 (preview): the destructive Merge control's `disabled` prop is
      // wired to `busy || preview.loading || !preview.data`
      // (MergeCounterpartiesDialog.tsx) — gated on the SAME preview state
      // this test proves loaded for real, below, never on the step alone.
      await h.act(() => { clickButton(previewButton as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /What each side carries/, "the preview card must have rendered before Merge can ever enable");
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations at the preview step");

      const backButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Back");
      assert.ok(backButton, "the Back control must be reachable");
      const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
      assert.ok(cancelButton, "the Cancel control must be reachable at the preview step too");
      const mergeButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Merge");
      assert.ok(mergeButton, "the destructive Merge control must be reachable, distinct from the trigger");
      assert.equal((mergeButton as unknown as { disabled: boolean }).disabled, false, "Merge enables once the preview has genuinely loaded");

      await h.act(() => { clickButton(cancelButton as never); });
      for (let i = 0; i < 6; i++) await h.settle();

      // DISCRIMINATING post-condition (F5): the destructive Merge button
      // itself must be GONE from document.body — true only if Cancel
      // actually closed the dialog.
      const mergeStillThere = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Merge");
      assert.equal(mergeStillThere, null, "the dialog must have actually closed — the destructive Merge control is gone from the DOM");

      const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Merge…"));
      assert.ok(
        triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
        "the trigger must be reachable again after Cancel — focus is not stranded on a removed node",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

// M5 (independent review, fix-required): the Merge button's own `disabled`
// PROPERTY is `true` DURING the preview read, not merely `false` once it
// resolves — proven with a deliberately-gated fetch, not a race.
test("Merge Counterparties dialog: the destructive Merge button stays disabled WHILE the preview read is genuinely in flight", async () => {
  releasePreviewFetch = null;
  await withMockedEnv(mockFetchGatedPreview, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Merge…"));
      assert.ok(trigger, "the Merge trigger must render");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const otherSelect = findIn(body as never, (n) => n.tagName === "SELECT");
      await h.act(() => { setFieldValue(otherSelect as never, "v2"); });
      const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      await h.act(() => { setFieldValue(reasonField as never, "duplicate vendor"); });
      for (let i = 0; i < 2; i++) await h.settle();

      const previewButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Preview merge"));
      await h.act(() => { clickButton(previewButton as never); });
      for (let i = 0; i < 3; i++) await h.settle();

      // The ap_aging fetch is HUNG on releasePreviewFetch (a captured
      // resolver means the gate is armed and waiting) — preview.data is
      // provably still null at this point, not merely "probably".
      assert.notEqual(releasePreviewFetch, null, "the preview read must genuinely still be in flight (the gate armed, not yet released)");
      const mergeWhileLoading = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Merge");
      assert.ok(mergeWhileLoading, "the Merge button renders in the footer regardless of load state");
      assert.equal((mergeWhileLoading as unknown as { disabled: boolean }).disabled, true, "Merge must be disabled while preview.data is still null");

      releasePreviewFetch?.();
      for (let i = 0; i < 8; i++) await h.settle();

      const mergeAfterLoad = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Merge");
      assert.equal((mergeAfterLoad as unknown as { disabled: boolean }).disabled, false, "Merge enables once the gate is released and preview.data lands for real");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

// M15 (independent review, fix-required): a REAL refusal driven through a
// dialog's own Confirm button, verbatim in the caller's PERSISTENT banner —
// outside the dialog, which has already auto-closed by the time this is
// checked (the wave law, apps/web/components/close/CloseDoorDialog.tsx's
// own precedent).
test("F15: a governed refusal (rename_counterparty) renders verbatim in the hygiene panel's own persistent banner, after the dialog has closed", async () => {
  await withMockedEnv(mockFetchWithRenameRefusal, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Rename"));
      assert.ok(trigger, "the Rename trigger must render");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      // Two vendors each render their OWN "Rename" trigger with identical
      // text — scope every subsequent search to the OPEN dialog's own
      // content (data-slot="dialog-content"), never the whole document,
      // or a plain text match risks grabbing the OTHER vendor's closed
      // trigger instead of this dialog's real confirm button.
      const dialogContent = findIn(
        body as never,
        (n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("data-slot") === "dialog-content",
      );
      assert.ok(dialogContent, "the open dialog's own content region must be reachable");

      const nameField = findIn(dialogContent as never, (n) => n.tagName === "INPUT");
      assert.ok(nameField, "the rename dialog's own name field must be reachable");
      await h.act(() => { setFieldValue(nameField as never, "Lost Invention Holdings"); });
      for (let i = 0; i < 2; i++) await h.settle();

      const confirmButton = findIn(dialogContent as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Rename"));
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "the new name differs from the current one — Confirm must be enabled");

      await h.act(() => { clickButton(confirmButton as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      // The dialog auto-closes on every confirm attempt regardless of
      // outcome — its own Cancel control is the closed signal.
      const cancelStillThere = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
      assert.equal(cancelStillThere, null, "the dialog must have closed after the confirm attempt settled");

      assert.match(h.text(), /CLR23/, "the CLR code must render, verbatim, in the panel's own persistent banner");
      assert.match(h.text(), /collides with an existing identity/, "the DB's own message must render, verbatim — never re-worded");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

// S1 (independent review, fix-required): a successful apply_open_items
// re-reads the PARENT aging table (F7's own `onActed`), and the Apply
// dialog's own candidate pool — fed from that same fresh read — reflects
// it: the fully-applied credit i2 disappears from the picker.
test("S1: apply_open_items success re-reads aging exactly once more (1 -> 2), and the Apply dialog's own candidates reflect it", async () => {
  apAgingCallCount = 0;
  applyOpenItemsBody = null;
  await withMockedEnv(mockFetchS1Apply, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const apButton = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Payables"));
      assert.ok(apButton, "the Payables toggle must render");
      await h.fireEvent(apButton as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.equal(apAgingCallCount, 1, "exactly ONE ap_aging call before any act — the domain-toggle's own load");

      const viewStatement = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("View statement"));
      assert.ok(viewStatement, "the View statement trigger must render for v1's AP row");
      await h.fireEvent(viewStatement as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const applyTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Apply open items"));
      assert.ok(applyTrigger, "the Apply open items trigger must render (two candidate items exist)");
      await h.fireEvent(applyTrigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const dialogContent = findIn(
        body as never,
        (n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("data-slot") === "dialog-content",
      );
      assert.ok(dialogContent, "the Apply dialog's own content must be reachable");
      const selects = (function collectSelects(n: Node, out: Node[]): Node[] {
        if (n.tagName === "SELECT") out.push(n);
        for (const c of n.childNodes ?? []) collectSelects(c, out);
        return out;
      })(dialogContent as never, []);
      assert.equal(selects.length, 2, "the source and target selects must both be reachable");
      await h.act(() => { setFieldValue(selects[0] as never, "i2"); }); // source: the credit
      await h.act(() => { setFieldValue(selects[1] as never, "i1"); }); // target: the claim

      const amountInput = findIn(dialogContent as never, (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type !== undefined);
      assert.ok(amountInput, "the amount field must be reachable");
      await h.act(() => { setFieldValue(amountInput as never, "400.00"); });
      const reasonField = findIn(dialogContent as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(reasonField, "the reason field must be reachable");
      await h.act(() => { setFieldValue(reasonField as never, "apply the credit note"); });
      for (let i = 0; i < 2; i++) await h.settle();

      const confirmButton = findIn(dialogContent as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Apply") && !textOf(n as never).includes("open items"));
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "every field is filled — Confirm must be enabled");

      await h.act(() => { clickButton(confirmButton as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      const applications = applyOpenItemsBody?.p_applications as Array<{ amount_cents?: number }> | undefined;
      assert.equal(applications?.[0]?.amount_cents, 40000, "MoneyInput preserves apply_open_items's exact integer-cent wire argument");
      assert.equal(apAgingCallCount, 2, "exactly ONE MORE ap_aging call after the successful act — F7's onActed, never stale");

      // Reopen Apply — its OWN candidate pool (agingItems, from the parent's
      // fresh read) must now show only i1: i2 fully applied away.
      const applyTriggerAgain = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Apply open items"));
      assert.ok(applyTriggerAgain, "the Apply trigger must still render");
      await h.fireEvent(applyTriggerAgain as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /needs at least two currently-outstanding open items/, "with only ONE item left, the dialog's own honest empty message must render — proving its candidate pool is the FRESH read, not the stale one");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

// S1 (independent review, fix-required): the same pin for unallocate_group.
test("S1: unallocate_group success re-reads aging exactly once more (1 -> 2)", async () => {
  apAgingCallCount = 0;
  await withMockedEnv(mockFetchS1Unallocate, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const apButton = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Payables"));
      assert.ok(apButton, "the Payables toggle must render");
      await h.fireEvent(apButton as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.equal(apAgingCallCount, 1, "exactly ONE ap_aging call before any act");

      const viewStatement = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("View statement"));
      assert.ok(viewStatement, "the View statement trigger must render for v1's AP row");
      await h.fireEvent(viewStatement as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const unallocateTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Unallocate"));
      assert.ok(unallocateTrigger, "the Unallocate trigger must render for the prior application group");
      await h.fireEvent(unallocateTrigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const dialogContent = findIn(
        body as never,
        (n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("data-slot") === "dialog-content",
      );
      assert.ok(dialogContent, "the Unallocate dialog's own content must be reachable");
      const reasonField = findIn(dialogContent as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(reasonField, "the reason field must be reachable");
      await h.act(() => { setFieldValue(reasonField as never, "applied to the wrong bill"); });
      for (let i = 0; i < 2; i++) await h.settle();

      const confirmButton = findIn(dialogContent as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Unallocate"));
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "the reason is filled — Confirm must be enabled");

      await h.act(() => { clickButton(confirmButton as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(apAgingCallCount, 2, "exactly ONE MORE ap_aging call after the successful act — F7's onActed, never stale");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
