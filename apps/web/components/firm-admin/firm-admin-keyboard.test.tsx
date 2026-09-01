// GATE (c) — keyboard-walk tests for T10's door dialogs: propose/sign/revoke
// on the vendor-bindings panel, and the share dialog on ClaraFullScreenThread.
// See test/keyboardWalk.ts's header for exactly what this environment can and
// cannot prove about real key-event dispatch. The P3 workbench lesson: a
// keyboard gate found six permanently-unopenable doors five code reviews
// missed — a different instrument, not another reader; every door dialog in
// this train gets one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { VendorBindingsPanel } from "./vendor-bindings-panel";
import { SettingsPanel } from "./settings-panel";
import { ClaraFullScreenThread } from "../clara/ClaraFullScreenThread";
import messages from "../../messages/en.json";

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

/** M5 (independent review, PR #489): counts non-overlapping occurrences of
 *  `needle` in `haystack` — used to prove a SECOND rendering of a string
 *  appeared (the panel's own line was ALREADY on the page before a dialog
 *  opened; a plain `assert.match` after the click is true both before and
 *  after it and proves nothing about the dialog itself having rendered). */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
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

function App(children: unknown, heading: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, heading), children as never),
  });
}

// --- vendor-bindings panel: propose/sign/revoke -----------------------------

const CLIENTS = [{ id: "c1", name: "Acme Sdn Bhd", status: "active", created_at: "2026-01-01T00:00:00Z" }];
const BINDINGS = [
  {
    binding_id: "b1", counterparty_id: "cp1", counterparty_name: "Supplier One Sdn Bhd", status: "proposed",
    f1_vendor_name_norm: "supplier one sdn bhd", f2_invoice_prefix: "INV-S", registration_at_signing: "202401012345",
    signed_by: null, signed_at: null, expires_at: "2026-12-31T00:00:00Z",
    evidence_count: 3, resolution_count: 0, divergence_documents: 0,
  },
  {
    binding_id: "b2", counterparty_id: "cp2", counterparty_name: "Supplier Two Sdn Bhd", status: "live",
    f1_vendor_name_norm: "supplier two sdn bhd", f2_invoice_prefix: "INV-T", registration_at_signing: "202401019999",
    signed_by: "u1", signed_at: "2026-02-01T00:00:00Z", expires_at: "2026-12-31T00:00:00Z",
    evidence_count: 5, resolution_count: 4, divergence_documents: 0,
  },
];
const COUNTERPARTIES = [{ id: "cp3", name: "Supplier Three Sdn Bhd", registration_normalized: "202401017777" }];

// F2's own read: the Sign/Revoke dialogs now mount VendorBindingDetailView on
// open, which fetches get_vendor_binding — mocked here so opening either
// dialog in these keyboard-walk tests exercises the real detail render.
const BINDING_DETAIL = {
  binding: {
    id: "b1", firm_id: "f1", client_id: "c1", counterparty_id: "cp1", status: "proposed",
    f1_vendor_name_norm: "supplier one sdn bhd", f2_invoice_prefix: "INV-S", registration_at_signing: "202401012345",
    content_hash: "a".repeat(64), created_by: "u1234567-89ab-cdef-0123-456789abcdef", created_at: "2026-01-01T00:00:00Z",
    signed_by: null, signed_at: null, revoked_by: null, revoked_at: null, revoke_reason: null, expires_at: "2026-12-31T00:00:00Z",
  },
  counterparty: { counterparty_id: "cp1", counterparty_name: "Supplier One Sdn Bhd" },
  evidence: [{ entry_id: "e1", document_id: "d1", facts_extraction_id: "f1", ocr_extraction_id: "o1", posting_date: "2026-01-01" }],
  resolutions: [],
};

function mockVendorBindingsFetch(u: string): Response {
  if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
  if (u.includes("/rpc/list_vendor_bindings")) return jsonResponse(BINDINGS);
  if (u.includes("/rest/v1/counterparties")) return jsonResponse(COUNTERPARTIES);
  if (u.includes("/rpc/get_vendor_binding")) return jsonResponse(BINDING_DETAIL);
  throw new Error(`unexpected fetch: ${u}`);
}

async function mountVendorBindingsWithClientSelected() {
  const h = await renderComponent(App(createElement(VendorBindingsPanel), "Vendor identity bindings"));
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 3; i++) await h.settle();
  const select = h.find((n) => n.tagName === "SELECT");
  assert.ok(select, "the client picker select must render");
  await h.act(() => {
    (select as unknown as { value: string }).value = "c1";
    const propsKey = Object.keys(select as object).find((k) => k.startsWith("__reactProps"));
    const props = propsKey ? (select as unknown as Record<string, { onChange?: (e: unknown) => void }>)[propsKey] : undefined;
    props?.onChange?.({ target: select, currentTarget: select });
  });
  for (let i = 0; i < 4; i++) await h.settle();
  return { h, body };
}

test("Propose binding dialog: opens on click, reaches its counterparty select and Confirm/Cancel, leaves its trigger reachable again on close", async () => {
  await withMockedEnv(
    async (u) => mockVendorBindingsFetch(String(u)),
    async () => {
      const { h, body } = await mountVendorBindingsWithClientSelected();
      try {
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Propose binding"));
        assert.ok(trigger, "the Propose binding trigger must render");

        (trigger as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");

        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /Cancel/, "opening the dialog must reveal its Cancel control");
        assert.match(bodyText, /Supplier Three Sdn Bhd/, "the counterparty select's own real option must be reachable");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

        const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
        assert.ok(cancelButton, "the Cancel control must render as a real <button>");
        await h.fireEvent(cancelButton as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const triggerAfterClose = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Propose binding"));
        assert.ok(
          triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
          "the trigger must be reachable again after the dialog closes — focus is not stranded on a removed node",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("Sign dialog: the trigger is enabled from first render for a PROPOSED binding — never pre-gated on a client-side role guess", async () => {
  await withMockedEnv(
    async (u) => mockVendorBindingsFetch(String(u)),
    async () => {
      const { h, body } = await mountVendorBindingsWithClientSelected();
      try {
        const signTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Sign");
        assert.ok(signTrigger, "the Sign trigger must render for the proposed binding");
        assert.equal((signTrigger as unknown as { disabled: boolean }).disabled, false, "the trigger is never gated — every viewer sees it, the DB's own rank check is the wall");

        await h.fireEvent(signTrigger as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        // F2 (independent review): the consent must show what it approves —
        // the detail view's own real content, not merely "no crash".
        assert.match(textOf(body as never), /u1234567/, "the Sign dialog's own detail view (get_vendor_binding) must have actually rendered");

        const confirmButton = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Sign" && (n as unknown) !== (signTrigger as unknown),
        );
        assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "Sign has no required field — Confirm is enabled once open");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the Sign dialog is open");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("Revoke dialog (live binding): Confirm gates on the required reason field it opens", async () => {
  await withMockedEnv(
    async (u) => mockVendorBindingsFetch(String(u)),
    async () => {
      const { h, body } = await mountVendorBindingsWithClientSelected();
      try {
        const revokeTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Revoke");
        assert.ok(revokeTrigger, "the Revoke trigger must render for the live binding");
        assert.equal((revokeTrigger as unknown as { disabled: boolean }).disabled, false, "the trigger itself is never gated — only Confirm is");

        await h.fireEvent(revokeTrigger as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        assert.match(textOf(body as never), /u1234567/, "the Revoke dialog's own detail view (get_vendor_binding) must have actually rendered");

        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the click must genuinely open the dialog and reach the reason field");

        const confirmButton = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Revoke" && (n as unknown) !== (revokeTrigger as unknown),
        );
        assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm stays disabled while the reason is empty");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// --- the share dialog on ClaraFullScreenThread ------------------------------

function mockShareFetch(u: string, body?: string): Response {
  if (u.includes("/rest/v1/chat_sessions")) {
    return jsonResponse([{ id: "s1", firm_id: "f1", client_id: null, created_by: "u1", visibility: "private", title: "Q on the August close", created_at: "2026-08-01T00:00:00Z" }]);
  }
  if (u.includes("/rpc/share_chat_session")) return jsonResponse({ session_id: "s1", visibility: "firm" });
  // The thread view's own reads/SSE are not this test's subject; any other
  // call is treated as "not yet arrived" via a hung stream — this test only
  // exercises the header's own Share control, not the conversation body.
  void body;
  return jsonResponse([], 404);
}

test("Share session dialog: opens on click, reaches Confirm/Cancel, and the trigger is reachable via keyboard focus", async () => {
  await withMockedEnv(
    async (u) => mockShareFetch(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(ClaraFullScreenThread, { threadId: "s1", returnHref: "/" }), "Clara"));
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Share with firm"));
        assert.ok(trigger, "the Share trigger must render once the session has loaded as private");

        (trigger as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), trigger, "keyboard focus must actually reach the Share trigger");

        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.match(textOf(body as never), /Cancel/, "opening the dialog must reveal its Cancel control");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the Share dialog is open");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// --- settings panel: the high-stakes threshold dialog (FS-8 PR-2, 裁-97) ----

// Stateful mock (the counterparty-hygiene-a11y.test.tsx idiom): the panel's
// `act()` ALWAYS re-reads after a write (useHydratedPart's own contract:
// "never assume the write's own response is the new truth") — and
// settings-panel.tsx:67 THROWS AWAY the RPC's own response body
// (`.then(() => undefined)`), so the panel's displayed value can only ever
// come from that follow-up GET, never from the door's envelope.
//
// M3 (independent review, PR #489, fix-required): the RPC handler
// deliberately returns/stores a value the TYPED INPUT CANNOT PRODUCE
// (20000000 cents = RM 200,000.00) regardless of what `p_cents` the caller
// actually sent (150000.00 = 15000000 cents) — proving the panel displays
// what the GET says, not an echo of the input it was given. Before this
// fix the mock stored exactly 15000000, the SAME number "150000.00"
// parses to, so a panel that echoed the typed input instead of ever
// reading the DB back would have passed identically.
let currentHighStakesCents = 10000000;

function mockSettingsFetch(u: string): Response {
  if (u.includes("/rest/v1/firms")) return jsonResponse([{ id: "f1", high_stakes_amount_cents: currentHighStakesCents }]);
  if (u.includes("/rpc/set_firm_high_stakes_threshold")) {
    const oldCents = currentHighStakesCents;
    currentHighStakesCents = 20000000; // deliberately NOT what "150000.00" parses to
    return jsonResponse({ firm_id: "f1", old_cents: oldCents, new_cents: currentHighStakesCents });
  }
  throw new Error(`unexpected fetch: ${u}`);
}

test("Change threshold trigger is enabled from first render, regardless of role — the DB's OWNER floor is the wall, never a client-side guess", async () => {
  await withMockedEnv(
    async (u) => mockSettingsFetch(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(SettingsPanel), "Firm settings"));
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Change threshold");
        assert.ok(trigger, "the Change threshold trigger must render once the current value has loaded");
        assert.equal(
          (trigger as unknown as { disabled: boolean }).disabled,
          false,
          "the trigger is never gated on a client-side role guess — every viewer sees it, the DB's owner floor is the wall",
        );

        (trigger as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");

        // M5 (independent review, PR #489, fix-required): the panel's OWN
        // "RM 100,000.00" line is already on the page before this click —
        // settings-panel.tsx renders it unconditionally once the read has
        // loaded. A plain `assert.match` for that string after the click is
        // true whether or not the dialog rendered anything at all, so the
        // discriminating check is an OCCURRENCE COUNT: one instance before
        // the dialog opens (the panel's own line), two after (the panel's
        // line PLUS the dialog's own copy of it).
        const beforeCount = countOccurrences(textOf(body as never), "RM 100,000.00");
        assert.equal(beforeCount, 1, "before opening, the CURRENT value must appear exactly once (the panel's own line)");

        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.equal(
          countOccurrences(bodyText, "RM 100,000.00"),
          2,
          "opening the dialog must add a SECOND rendering of the current value — the dialog's own copy, not just the panel's pre-existing one",
        );
        assert.match(bodyText, /Cancel/, "opening the dialog must reveal its Cancel control");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

        const amountField = findIn(body as never, (n) => n.tagName === "INPUT" && n !== trigger);
        assert.ok(amountField, "the new-threshold amount field must render as a real <input>");
        const confirmButtonBeforeInput = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Change threshold" && n !== trigger);
        assert.ok(confirmButtonBeforeInput, "the dialog's own Confirm control must render");
        assert.equal(
          (confirmButtonBeforeInput as unknown as { disabled: boolean }).disabled,
          true,
          "Confirm stays disabled until a valid amount is typed — an obviously-malformed-input guard, not a role gate",
        );

        await h.act(() => { setFieldValue(amountField as never, "150000.00"); });
        for (let i = 0; i < 2; i++) await h.settle();

        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Change threshold" && n !== trigger);
        assert.ok(confirmButton, "the Confirm control must still render after typing a valid amount");
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "Confirm must enable once a valid positive amount is present");

        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        // Discriminating post-condition: the dialog genuinely closed on a
        // real confirm (a fabricated success would leave it open), and the
        // re-read after the write shows the value the FOLLOW-UP GET
        // returns — never the door's own response body (discarded at
        // settings-panel.tsx:67) and never an echo of the typed input
        // (150000.00 -> 15000000 cents; the mock deliberately stores
        // 20000000 instead, so RM 200,000.00 can only appear here if the
        // panel genuinely re-read rather than assumed).
        assert.doesNotMatch(textOf(body as never), /Change the high-stakes threshold/, "the dialog must actually close on a real confirm");
        assert.match(textOf(body as never), /RM 200,000\.00/, "the panel must show the DB's re-read value, not an echo of the typed 150000.00");

        // N3 discriminating test (independent review, PR #489, fix-required):
        // reopening the dialog must not resurrect the amount just confirmed.
        // FirmAdminDoorDialog's Confirm handler closes via a plain
        // `setOpen(false)` — a controlled-prop change Base UI does not treat
        // as an interaction (DialogStore.js:48 only invokes onOpenChange from
        // real interaction handlers), so a reset gated on the CLOSE
        // transition never runs on a successful confirm. The reset must
        // instead fire on OPEN, which a real trigger press always reaches.
        const triggerOnReopen = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Change threshold");
        assert.ok(triggerOnReopen, "the trigger must still render after the dialog closes on confirm");

        await h.fireEvent(triggerOnReopen as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const amountFieldOnReopen = findIn(body as never, (n) => n.tagName === "INPUT" && n !== triggerOnReopen);
        assert.ok(amountFieldOnReopen, "the amount field must render again on reopen");
        assert.equal(
          (amountFieldOnReopen as unknown as { value: string }).value,
          "",
          "reopening must show an EMPTY amount field — a stale confirmed value would mean the reset never fired, and the fix moves it to fire on OPEN instead of the CLOSE that a confirm never reaches",
        );

        const confirmButtonOnReopen = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Change threshold" && n !== triggerOnReopen,
        );
        assert.ok(confirmButtonOnReopen, "the dialog's own Confirm control must render again on reopen");
        assert.equal(
          (confirmButtonOnReopen as unknown as { disabled: boolean }).disabled,
          true,
          "Confirm must be disabled again on reopen — a stale non-empty amount would otherwise leave it wrongly enabled",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
