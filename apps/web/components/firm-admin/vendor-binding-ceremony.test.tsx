// The vendor-binding Sign/Revoke ceremony — a real refusal drives THROUGH the
// dialog's own Confirm button (using hookHarness.ts's `clickButton`, the
// direct-prop-invocation mechanism its own header documents as required for
// ANY control inside an open @base-ui/react Dialog portal — `h.fireEvent`
// silently no-ops there) and asserts the CLR code + message land VERBATIM in
// the PANEL's own persistent banner, never inside the dialog — which
// FirmAdminDoorDialog auto-closes on every confirm attempt regardless of
// outcome (CloseDoorDialog's own contract, ported). Security-note load-bearing
// test: sign is a RANK-gated act (admin+) AND, as of the pre-beta hardening
// batch (裁-18a, mohe-grill-rulings, 2026-08-28), a PERSON-gated one too — the
// signer must not be the binding's own proposer, unconditionally. This file's
// own cell below drives the RANK refusal specifically; the trigger this
// train's own header says is never pre-hidden on a client-side role OR
// identity guess — this proves the DB's OWN refusal is what actually renders
// when either rule is exercised.

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

// MED-3 (independent review, 2026-08-29): the signer<>proposer wall's CLR04 refusal carries a
// stable `reason` token in its DETAIL (`{"reason":"signer_is_proposer"}`), distinct from the
// bare-message shape the RANK-floor refusal above carries (which has no reason token). This
// cell proves the estate's generic wire.ts reason-parsing pipeline (`parseReasonToken`,
// already wired into every StateBanner via `clr.reason`) actually surfaces THIS wall's reason
// — no vendor-bindings.ts change was needed (confirmed: `signVendorIdentityBinding` is a bare
// `callDoor` passthrough, no error transform), but nothing proved the reason renders until now.
test("Sign refusal (CLR04, signer_is_proposer): the wall's stable reason token renders in the panel's own banner, distinguishing it from a bare rank refusal", async () => {
  const calls: { url: string }[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    calls.push({ url: u });
    if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
    if (u.includes("/rpc/list_vendor_bindings")) return jsonResponse(BINDINGS);
    if (u.includes("/rest/v1/counterparties")) return jsonResponse(COUNTERPARTIES);
    if (u.includes("/rpc/sign_vendor_identity_binding")) {
      // The exact PostgREST error envelope shape (code/message/details) a real
      // DETAIL '{"reason":"signer_is_proposer"}' raise produces (wire.ts's
      // classifyPgrestFailure reads `body.details`, JSON-parses it via
      // parseReasonToken).
      return jsonResponse({
        code: "CLR04",
        message: "the signer cannot be the same person who proposed this binding; let Clara propose it, or add a second admin",
        details: JSON.stringify({ reason: "signer_is_proposer" }),
      }, 400);
    }
    if (u.includes("/rpc/get_vendor_binding")) return jsonResponse(BINDING_DETAIL);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const signTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Sign");
      assert.ok(signTrigger, "the Sign trigger must render");
      await h.fireEvent(signTrigger! as never, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Sign" && (n as unknown) !== (signTrigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
      await h.act(() => { clickButton(confirmButton as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /CLR04/, "the CLR code must render, verbatim");
      assert.match(bodyText, /let Clara propose it, or add a second admin/, "the wall's own message, in the OWNER'S RULED WORDS, must render verbatim");
      // THE DISCRIMINATING ASSERTION (MED-3, rev-hb F2: structured, not English-prose
      // matching): every panel renders the reason in the EXACT `${code} · ${reason}` slot
      // format (compliance-register-panel.tsx / vendor-bindings-panel.tsx / this component
      // all share it) — pin THAT exact shape, not merely "the token appears somewhere",
      // which is what tells a caller this is SPECIFICALLY the signer<>proposer wall,
      // distinguishable from a bare rank refusal (the previous cell, no reason token at all)
      // or any other CLR04 in the estate.
      assert.match(bodyText, /CLR04 · signer_is_proposer/, "the wall's stable reason token must render in the banner's own CODE · REASON slot, not just appear anywhere in the page text");

      const call = calls.find((c) => c.url.includes("/rpc/sign_vendor_identity_binding"));
      assert.ok(call, "sign_vendor_identity_binding must have actually been called — the DB's wall is the wall, not a client-side gate");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// 裁-18a (mohe-grill-rulings, 2026-08-28) copy re-true pin: before this ruling landed,
// signDescription claimed "the same admin who proposed it may also sign it" — the DB now
// REFUSES exactly that (a signer<>proposer wall, unconditional even for a single-admin firm),
// so the old claim would be actively false if it survived. This cell opens the real Sign
// dialog (no confirm — just the description that renders while the human is deciding) and
// pins both halves: the corrected copy renders, and the retired copy does not.
test("Sign dialog description states the signer<>proposer rule (裁-18a), not the retired same-admin claim", async () => {
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
    if (u.includes("/rpc/list_vendor_bindings")) return jsonResponse(BINDINGS);
    if (u.includes("/rest/v1/counterparties")) return jsonResponse(COUNTERPARTIES);
    if (u.includes("/rpc/get_vendor_binding")) return jsonResponse(BINDING_DETAIL);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const signTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Sign");
      assert.ok(signTrigger, "the Sign trigger must render");
      await h.fireEvent(signTrigger! as never, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      const dialogText = textOf(body as never);
      assert.match(dialogText, /an admin who did not propose this binding/,
        "the corrected copy (裁-18a) must render in the open Sign dialog");
      assert.doesNotMatch(dialogText, /the same admin who proposed it may also sign it/,
        "the retired, now-false copy must not render");
      // rev-hb F1: both exits, in the owner's own words.
      assert.match(dialogText, /let Clara propose it, or add a second admin/,
        "the Sign dialog's own description must name both lawful exits, verbatim");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
