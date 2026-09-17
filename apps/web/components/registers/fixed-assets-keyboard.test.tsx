// GATE (c) — keyboard-walk tests for T3's fixed-asset door dialogs (owner
// ruling Q7). The P3 workbench lesson: a keyboard gate once found SIX
// permanently-unopenable doors five code reviews missed — every door dialog
// in this train gets one of these. Mirrors components/close/
// close-keyboard.test.tsx's own idiom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { clickButton, renderComponent, setFieldValue, setNativeValue, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import messages from "../../messages/en.json";
import { CompleteParticularsDialog, DisposeDialog } from "./fa-row-actions";
import { DoorRefusal } from "@/lib/doors";
import type { FixedAssetRow } from "@/lib/registers/fixed-assets";
import type { AccountRow } from "@/lib/registers/accounts";

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

function reactProps(node: Node): Record<string, unknown> {
  const key = Object.keys(node).find((candidate) => candidate.startsWith("__reactProps"));
  return key ? ((node as Record<string, unknown>)[key] as Record<string, unknown>) : {};
}

function byId(root: Node, id: string): Node {
  const node = findIn(root, (candidate) => reactProps(candidate).id === id);
  assert.ok(node, `expected #${id} to render`);
  return node;
}

const ASSET: FixedAssetRow = {
  id: "a1", description: "Delivery van", status: "pending", particulars_complete: false,
  acquired_date: "2026-01-15", effective_from: "2026-01-15", cost_cents: 8000000, residual_cents: null,
  accumulated_cents: null, nbv_cents: null, method: null, rate_bps: null, useful_life_months: null,
  start_date: null, asset_account: "1500", accum_account: null, expense_account: null, ca_class: null,
  is_commercial_vehicle: null, is_new: null, superseded_by_asset_id: null, disposed_at: null,
  disposal_entry_id: null, uncharged_due_count: 0, split_month_advisory_count: 0,
  disposal_draft_outstanding: false, disposal_draft_entry_id: null,
  // #639 (0216) — the acquisition every register row shape now projects. Present here so the
  // fixture is a real FixedAssetRow rather than a partial one a cast would have hidden.
  acquisition_entry_id: "e1", acquisition_line_id: "l1", acquisition_document_id: null,
};
const ACCOUNTS: AccountRow[] = [
  { account_code: "1500", name: "Office equipment", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "4900", name: "Gain on disposal", account_type: "income", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "5900", name: "Loss on disposal", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
];

function withProvider(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

test("Complete-particulars dialog: trigger is enabled from first render (no fields to gate it on before it opens), reaches its fields, and closes back to a reachable trigger", async () => {
  const h = await renderComponent(
    withProvider(createElement(CompleteParticularsDialog, { clientId: "c1", asset: ASSET, accounts: ACCOUNTS, busy: false, act: async () => true })),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
    assert.ok(trigger, "the trigger must render as a real <button>");
    assert.equal((trigger as unknown as { disabled: boolean }).disabled, false, "the trigger must be enabled before any input — it gates nothing reachable only inside itself");
    assert.ok(focusableElements(h.container as never).includes(trigger as never), "the trigger must be keyboard-reachable");

    (trigger as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger");

    await h.fireEvent(trigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const methodSelect = findIn(body as never, (n) => n.tagName === "SELECT");
    assert.ok(methodSelect, "the dialog must reach the particulars form (a real <select> for method)");
    assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

    const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Complete particulars") && (n as unknown) !== (trigger as unknown));
    assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
    assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm stays disabled until the particulars are complete (no method chosen yet) — the trigger itself is never this gate");

    const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
    assert.ok(cancelButton, "the Cancel control must render as a real <button>");
    await h.fireEvent(cancelButton as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
    assert.ok(
      triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
      "the trigger must be reachable again after the dialog closes — focus is not stranded on a removed node",
    );
  } finally {
    await h.unmount();
    for (let i = 0; i < 5; i++) await h.settle();
  }
});

test("p639 a CLR37 that names an AXIS lands focus on that CONTROL, marks it invalid, and keeps the draft", async () => {
  // ROUND-1 REVIEW (SPEC F1). Brief-639's Web slice item 6 — "read `details.axis`/`details.field`
  // off the DoorRefusal and focus the named control (AC7)" — was delivered only as a runtime
  // helper for the future claraWork_v4 tool; nothing under `apps/web` read an axis at all, so the
  // human door showed a generic banner and left focus on the confirm button. This cell drives the
  // REAL dialog with the REAL refusal shape the door raises (`clara._fa_complete_particulars_core`
  // :713 — "a residual value cannot exceed cost", `axis: "residual"`).
  const refusal = new DoorRefusal("CLR37", "a residual value cannot exceed cost", {
    reason: "fa_particulars_invalid",
    status: 400,
    pgCode: "CLR37",
    codeSource: "sqlstate",
    detail: { reason: "fa_particulars_invalid", axis: "residual" },
  });
  const h = await renderComponent(
    withProvider(createElement(CompleteParticularsDialog, {
      clientId: "c1", asset: ASSET, accounts: ACCOUNTS, busy: false,
      // The caller's `act` resolves FALSE on a refusal (lib/firm/use-async-read.ts), which is what
      // keeps the dialog — and everything typed into it — open.
      act: async () => false,
      error: refusal,
    })),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
    assert.ok(trigger);
    await h.fireEvent(trigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    // A submittable draft: the door's own two always-required fields plus the straight-line driver.
    // ONE FIELD PER act(), deliberately: `FaParticularsFields` is a controlled component whose
    // `patch` spreads the CURRENT `value` prop, so three changes batched into one act would each
    // start from the same stale object and only the last would survive.
    for (const [id, value] of [
      ["fa-complete-a1-start", "2026-08-20"],
      ["fa-complete-a1-life", "60"],
      ["fa-complete-a1-residual", "99,999.00"],
    ] as const) {
      await h.act(() => setFieldValue(byId(body as never, id) as never, value));
      for (let i = 0; i < 2; i++) await h.settle();
    }

    const confirm = findIn(
      body as never,
      (node) => node.tagName === "BUTTON" && textOf(node as never).includes("Complete particulars") && node !== trigger,
    );
    assert.ok(confirm);
    await clickButton(confirm as never);
    for (let i = 0; i < 6; i++) await h.settle();

    // THE REFUSAL TRAVELS INTO THE DIALOG — behind a modal backdrop, the caller's page banner is
    // unreadable, so the sentence has to be here beside the fields it is about.
    const text = textOf(body as never);
    assert.match(text, /a residual value cannot exceed cost/,
      "the DB's own message renders inside the open dialog, verbatim");
    assert.match(text, /CLR37/, "…with its code, the way every other governed refusal paints");

    // …AND FOCUS IS ON THE CONTROL THE AXIS NAMES, not on the confirm button and not on the banner.
    const residual = byId(body as never, "fa-complete-a1-residual");
    assert.equal(activeElement(), residual,
      "axis 'residual' must put the reader AT the residual control");
    assert.equal(
      (residual as unknown as { getAttribute: (k: string) => string | null }).getAttribute("aria-invalid"),
      "true",
      "…and the control says it is the invalid one, so a screen reader hears WHICH field");

    // THE DRAFT SURVIVES. A refusal asks for a correction; destroying the other eight answers
    // would make the correction more expensive than the mistake.
    assert.equal((byId(body as never, "fa-complete-a1-life") as unknown as { value: string }).value, "60");
  } finally {
    await h.unmount();
    for (let i = 0; i < 5; i++) await h.settle();
  }
});

test("Dispose dialog sends exact typed proceeds and cost-portion cents", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const bodies: Record<string, unknown>[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request);
    if (!url.includes("/rpc/dispose_fixed_asset")) throw new Error(`unexpected fetch: ${url}`);
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ status: "posted", entry_id: "e1", asset_id: "a1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");

  const h = await renderComponent(
    withProvider(createElement(DisposeDialog, {
      clientId: "c1",
      asset: { ...ASSET, status: "active", particulars_complete: true },
      accounts: ACCOUNTS,
      busy: false,
      act: async (fn: () => Promise<void>) => { await fn(); return true; },
    })),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Dispose");
    assert.ok(trigger);
    await h.fireEvent(trigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    await h.act(() => {
      setFieldValue(byId(body as never, "fa-disp-date-a1") as never, "2026-08-27");
      setFieldValue(byId(body as never, "fa-disp-proceeds-a1") as never, "1,234.56");
      setFieldValue(byId(body as never, "fa-disp-memo-a1") as never, "Sold vehicle");
      setFieldValue(byId(body as never, "fa-disp-portion-a1") as never, "250.00");
    });
    for (const [id, value] of [
      ["fa-disp-proc-acct-a1", "1500"],
      ["fa-disp-gain-a1", "4900"],
      ["fa-disp-loss-a1", "5900"],
    ] as const) {
      const select = byId(body as never, id);
      await h.act(() => {
        setNativeValue(select as never, "value", value);
        const onChange = reactProps(select).onChange as ((event: unknown) => void) | undefined;
        onChange?.({ target: select, currentTarget: select });
      });
    }
    for (let i = 0; i < 2; i++) await h.settle();

    const confirm = findIn(
      body as never,
      (node) => node.tagName === "BUTTON" && textOf(node as never) === "Dispose" && node !== trigger,
    );
    assert.ok(confirm);
    await clickButton(confirm as never);
    for (let i = 0; i < 4; i++) await h.settle();

    assert.equal(bodies.length, 1);
    const { p_op_key: opKey, ...bodyWithoutOpKey } = bodies[0]!;
    assert.equal(typeof opKey, "string");
    assert.deepEqual(bodyWithoutOpKey, {
      p_client: "c1",
      p_asset: "a1",
      p_disposal_date: "2026-08-27",
      p_proceeds_cents: 123456,
      p_proceeds_account: "1500",
      p_gain_account: "4900",
      p_loss_account: "5900",
      p_memo: "Sold vehicle",
      p_cost_portion_cents: 25000,
    });
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
    for (let i = 0; i < 5; i++) await h.settle();
  }
});

test("Dispose dialog: every field (date, proceeds, account selects, memo, cost portion) is keyboard-reachable and Confirm is gated on the required fields, not the trigger", async () => {
  const h = await renderComponent(
    withProvider(createElement(DisposeDialog, { clientId: "c1", asset: { ...ASSET, status: "active", particulars_complete: true }, accounts: ACCOUNTS, busy: false, act: async () => true })),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Dispose"));
    assert.ok(trigger, "the Dispose trigger must render");
    assert.equal((trigger as unknown as { disabled: boolean }).disabled, false, "the trigger is enabled from first render");

    await h.fireEvent(trigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    assert.doesNotMatch(
      textOf(body as never),
      /0\.00/,
      "blank proceeds must not be echoed as a fabricated 0.00 before the human types",
    );

    const selects = findAll(body as never, (n) => n.tagName === "SELECT");
    assert.equal(selects.length, 3, "proceeds/gain/loss account pickers must all render as real <select> elements");
    for (const s of selects) assert.ok(focusableElements(body as never).includes(s as never), "every account select must be keyboard-reachable");
    assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

    const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Dispose") && (n as unknown) !== (trigger as unknown));
    assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
    assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm stays disabled until the required fields (date, gain, loss account) are filled");
  } finally {
    await h.unmount();
    for (let i = 0; i < 5; i++) await h.settle();
  }
});

function findAll(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  if (predicate(root)) out.push(root);
  for (const c of root.childNodes ?? []) out.push(...findAll(c, predicate));
  return out;
}
