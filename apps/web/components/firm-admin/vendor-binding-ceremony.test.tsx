// The vendor-binding Sign/Revoke ceremony — a real refusal drives THROUGH the
// dialog's own Confirm button (using hookHarness.ts's `clickButton`, the
// direct-prop-invocation mechanism its own header documents as required for
// ANY control inside an open @base-ui/react Dialog portal — `h.fireEvent`
// silently no-ops there) and asserts the CLR code + message land VERBATIM in
// the PANEL's own persistent banner, never inside the dialog — which
// FirmAdminDoorDialog auto-closes on every confirm attempt regardless of
// outcome (CloseDoorDialog's own contract, ported). Security-note load-bearing
// test: sign is a RANK-gated act (admin+, not a proposer≠signer separation —
// F1, independent review) whose trigger this train's own header says is
// never pre-hidden on a client-side role guess — this proves the DB's OWN
// refusal is what actually renders when that rule is exercised.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { VendorBindingsPanel } from "./vendor-bindings-panel";
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

const CLIENTS = [{ id: "c1", name: "Acme Sdn Bhd", status: "active", created_at: "2026-01-01T00:00:00Z" }];
const BINDINGS = [
  {
    binding_id: "b1", counterparty_id: "cp1", counterparty_name: "Supplier One Sdn Bhd", status: "proposed",
    f1_vendor_name_norm: "supplier one sdn bhd", f2_invoice_prefix: "INV-S", registration_at_signing: "202401012345",
    signed_by: null, signed_at: null, expires_at: "2026-12-31T00:00:00Z",
    evidence_count: 3, resolution_count: 0, divergence_documents: 0,
  },
];
const COUNTERPARTIES: unknown[] = [];
// F2's own read: the Sign dialog now mounts VendorBindingDetailView on open.
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

async function mount() {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement("div", null, createElement("h1", null, "Vendor identity bindings"), createElement(VendorBindingsPanel)),
    }),
  );
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

test("Sign refusal (CLR04, insufficient rank): a real click through the dialog's own Confirm button renders the CLR code + message VERBATIM in the panel's own banner, and the dialog closes rather than showing the refusal inside it", async () => {
  const calls: { url: string }[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    calls.push({ url: u });
    if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
    if (u.includes("/rpc/list_vendor_bindings")) return jsonResponse(BINDINGS);
    if (u.includes("/rest/v1/counterparties")) return jsonResponse(COUNTERPARTIES);
    if (u.includes("/rpc/sign_vendor_identity_binding")) {
      return jsonResponse({ code: "CLR04", message: "insufficient rank — sign_vendor_identity_binding requires admin" }, 400);
    }
    if (u.includes("/rpc/get_vendor_binding")) return jsonResponse(BINDING_DETAIL);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const signTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Sign");
      assert.ok(signTrigger, "the Sign trigger must render — never pre-hidden on a client-side role guess");
      await h.fireEvent(signTrigger! as never, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Sign" && (n as unknown) !== (signTrigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");

      // Portal trap (hookHarness.ts's own header): h.fireEvent cannot reach a
      // control inside an open base-ui Dialog's portaled content — the
      // direct-prop-invocation `clickButton` is required.
      await h.act(() => { clickButton(confirmButton as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      // The dialog auto-closes on every confirm attempt (success or
      // refusal) — its own Cancel control only exists while open.
      const cancelStillOpen = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
      assert.equal(cancelStillOpen, null, "the dialog must have closed after the confirm attempt settled");

      const bodyText = textOf(body as never);
      assert.match(bodyText, /CLR04/, "the CLR code must render, verbatim, in the panel's own banner");
      assert.match(bodyText, /insufficient rank/, "the DB's own message must render, verbatim — never re-worded");

      const call = calls.find((c) => c.url.includes("/rpc/sign_vendor_identity_binding"));
      assert.ok(call, "sign_vendor_identity_binding must have actually been called — the DB's rank check is the wall, not a client-side gate");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
