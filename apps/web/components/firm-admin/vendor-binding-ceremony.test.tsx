// The vendor-binding ceremony — #921 [0273] RETIRED THE PROPOSE AND SIGN
// CONTROLS OUTRIGHT (migration 0273 revoked clara_authenticated's EXECUTE on
// both doors for every rank; D6 keeps only "historical receipts and
// in-flight legacy visibility"). This file used to drive a real refusal
// through the Sign dialog's own Confirm button — that dialog no longer
// exists, so those cells go with it (full history: git blame on this file
// before #921). What survives is the negative space those cells used to take
// for granted (the trigger renders unconditionally): the cells below prove
// the OPPOSITE now holds — no propose or sign control renders, AT ANY RANK,
// including the ranks that used to clear the floor (bookkeeper for propose,
// admin for sign) — this is a RETIREMENT, not a rank-shaped narrowing, so an
// owner is refused identically to a viewer. Revoke is UNCHANGED (0273 never
// touched it) and stays offered to bookkeeper+ on a "live" row.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { FirmScopeProvider } from "@/components/firm-scope-provider";
import { renderComponent, textOf } from "../../test/hookHarness";
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

/** A HISTORICAL "proposed" row — the door that creates one is revoked, so the only way one
 *  exists on a real database now is a row created before #921 [0273] applied. D6's "historical
 *  receipts" half: it stays visible, with no action underneath it (no Sign, and it is not
 *  "live" so not Revoke either). */
const BINDINGS_PROPOSED = [
  {
    binding_id: "b1", counterparty_id: "cp1", counterparty_name: "Supplier One Sdn Bhd", status: "proposed",
    f1_vendor_name_norm: "supplier one sdn bhd", f2_invoice_prefix: "INV-S", registration_at_signing: "202401012345",
    signed_by: null, signed_at: null, expires_at: "2026-12-31T00:00:00Z",
    evidence_count: 3, resolution_count: 0, divergence_documents: 0,
  },
];

/** A "live" row — D6's "in-flight legacy visibility" half: Revoke stays offered to
 *  bookkeeper+, unchanged by #921 [0273] (0273 never touched revoke_vendor_identity_binding). */
const BINDINGS_LIVE = [
  {
    binding_id: "b2", counterparty_id: "cp2", counterparty_name: "Supplier Two Sdn Bhd", status: "live",
    f1_vendor_name_norm: "supplier two sdn bhd", f2_invoice_prefix: "INV-T", registration_at_signing: "202401019999",
    signed_by: "u1234567-89ab-cdef-0123-456789abcdef", signed_at: "2026-01-03T00:00:00Z", expires_at: "2026-12-31T00:00:00Z",
    evidence_count: 5, resolution_count: 2, divergence_documents: 0,
  },
];

async function mount(scope: { role_rank: number | null; is_operator: boolean }) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(FirmScopeProvider, {
        scope,
        children: createElement("div", null, createElement("h1", null, "Vendor identity bindings"), createElement(VendorBindingsPanel)),
      }),
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

/** viewer 0 · bookkeeper 1 · admin 2 · owner 3 (clara.role_rank, 0002:326-331). The TWO
 *  BOUNDARY ranks, not the full ladder: viewer never cleared either retired floor, and owner
 *  clears every floor this table has ever named (propose's old bookkeeper+ AND sign's old
 *  admin+ both sit strictly below it) — so "owner sees neither control" is the single strongest
 *  witness that #921 is an unconditional retirement, not a rank-shaped narrowing, and adding
 *  bookkeeper/admin cells beside it would prove nothing an owner's absence does not already
 *  imply monotonically. Kept to two ranks (not one) so a cell also holds the ceiling and floor
 *  distinct: each mount/unmount is a real jsdom render of the whole panel tree, and this file
 *  found in review that iterating the full four-rank ladder across three cells pushed the test
 *  process's heap into OOM territory — the same reason `capabilities.test.ts`'s own "turns on at
 *  exactly its own floor" cell samples the boundary ranks rather than the whole ladder. */
const OWNER_SCOPE = { role_rank: 3, is_operator: false };
const VIEWER_SCOPE = { role_rank: 0, is_operator: false };

test("no Propose control renders, at any rank — #921 [0273] retired the door, not merely rank-gated it", async () => {
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
    if (u.includes("/rpc/list_vendor_bindings")) return jsonResponse(BINDINGS_LIVE);
    // #921's own vacuity control drove this branch RED against the pre-retirement
    // UI (git blame): the old ProposeBindingDialog also reads counterparties, and
    // an unmocked 404 there crashed the whole panel — a false "no button found"
    // for the WRONG reason. Answered honestly (empty register) so a genuine
    // regression is what turns this cell red, not an unrelated fetch failure.
    if (u.includes("/rest/v1/counterparties")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    for (const scope of [OWNER_SCOPE, VIEWER_SCOPE]) {
      const { h, body } = await mount(scope);
      try {
        // BY ROLE and BY TEXT — a control rendered as a non-button, or a leftover
        // label, would slip past one of the two (firm-navigation-walk.spec.ts's own
        // house convention for a retired control).
        assert.equal(
          findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Propose binding"),
          null,
          `rank ${scope.role_rank}: the Propose trigger must not render — the door has no rank left that reaches it`,
        );
        assert.doesNotMatch(textOf(body as never), /Propose binding/, `rank ${scope.role_rank}: the label must not survive anywhere in the page text`);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    }
  });
});

test("no Sign control renders, at any rank, even for a historical 'proposed' row — #921 [0273]", async () => {
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
    if (u.includes("/rpc/list_vendor_bindings")) return jsonResponse(BINDINGS_PROPOSED);
    if (u.includes("/rest/v1/counterparties")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    for (const scope of [OWNER_SCOPE, VIEWER_SCOPE]) {
      const { h, body } = await mount(scope);
      try {
        // The historical row itself still renders as HISTORY (D6's "historical
        // receipts" half) — its absence would mean the panel broke, not that Sign
        // was correctly retired.
        assert.match(textOf(body as never), /Supplier One Sdn Bhd/, `rank ${scope.role_rank}: the historical row must still render`);
        assert.equal(
          findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Sign"),
          null,
          `rank ${scope.role_rank}: the Sign trigger must not render — the door has no rank left that reaches it`,
        );
        assert.doesNotMatch(textOf(body as never), /Sign this vendor identity binding/, `rank ${scope.role_rank}: the Sign dialog title must not survive anywhere in the page text`);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    }
  });
});

test("Revoke stays offered on a live binding to bookkeeper+, and absent below it — #921 [0273] left this door untouched (D6's in-flight-legacy-visibility half)", async () => {
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
    if (u.includes("/rpc/list_vendor_bindings")) return jsonResponse(BINDINGS_LIVE);
    if (u.includes("/rest/v1/counterparties")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const viewer = await mount({ role_rank: 0, is_operator: false });
    try {
      assert.equal(
        findIn(viewer.body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Revoke"),
        null,
        "a viewer, below the bookkeeper floor, is offered no Revoke trigger",
      );
    } finally {
      await viewer.h.unmount();
      for (let i = 0; i < 3; i++) await viewer.h.settle();
    }

    const bookkeeper = await mount({ role_rank: 1, is_operator: false });
    try {
      assert.ok(
        findIn(bookkeeper.body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Revoke"),
        "a bookkeeper, at revoke_vendor_identity_binding's own floor (0028:903), is offered Revoke",
      );
    } finally {
      await bookkeeper.h.unmount();
      for (let i = 0; i < 3; i++) await bookkeeper.h.settle();
    }
  });
});
