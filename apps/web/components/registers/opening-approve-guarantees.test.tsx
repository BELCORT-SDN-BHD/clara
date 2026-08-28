// Fix round 2 (rev-t2 BLOCKER 2) pins for three previously-unpinned fixes:
// (a) the not_serializable operator hint — positive AND negative (it must
// NOT fire on an ordinary CLR31), (b) N5's revisionsError gate on a REAL
// failing journal_entries read, (c) N6's consent list showing the real
// approved set, with distinct fixture values, plus the >CAP count fallback.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OpeningRegister } from "./opening-register";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; getAttribute?: (name: string) => string | null };
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
/** The open dialog's OWN content only (`data-slot="dialog-content"`,
 *  components/ui/dialog.tsx) — scoping here is what makes a "this list did
 *  NOT render" assertion discriminating: the register's own "Drafted
 *  opening items" TABLE (a sibling surface, not part of this dialog) shows
 *  every item's key regardless of the approve dialog's own cap, so a
 *  page-wide substring check would stay green even if ApprovalItemList's
 *  cap fallback were deleted. */
function findDialogContent(root: Node): Node {
  const el = findIn(root, (n) => n.getAttribute?.("data-slot") === "dialog-content");
  if (!el) throw new Error("open dialog content (data-slot=dialog-content) not found");
  return el;
}
function findAllIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  if (predicate(root)) out.push(root);
  for (const c of root.childNodes ?? []) out.push(...findAllIn(c, predicate));
  return out;
}
function buttonsLabelled(root: Node, text: string): Node[] {
  return findAllIn(root, (n) => n.tagName === "BUTTON" && textOf(n as never).includes(text));
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

const SEED_OPEN_UNTIED = {
  id: "s1", firm_id: "f1", client_id: "c1", plan_id: "plan1", as_of: "2026-01-15", state: "open",
  tie_document_id: null, tie_document_sha256: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z",
  batch_n: 0, finalized_at: null, finalized_by: null, tie_asserted_at: null, through_event_seq: null,
  cancelled_at: null, cancelled_by: null, cancel_reason: null,
};
const ITEM_A = {
  id: "i1", firm_id: "f1", client_id: "c1", seed_id: "s1", item_kind: "gl_balance", item_key: "cash-mbb-77",
  entry_id: "e1", counterparty_id: null, fixed_asset_id: null, item_ref: null, item_date: null,
  amount_cents: 500123, sst_portion_cents: null, sst_rate_bp: null, sst_basis: null, state: "active",
  superseded_by_item: null, supersedes_item_id: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z",
};
const ITEM_B = {
  id: "i2", firm_id: "f1", client_id: "c1", seed_id: "s1", item_kind: "obe_plug", item_key: "obe-adjust-4",
  entry_id: "e2", counterparty_id: null, fixed_asset_id: null, item_ref: null, item_date: null,
  amount_cents: -87654, sst_portion_cents: null, sst_rate_bp: null, sst_basis: null, state: "active",
  superseded_by_item: null, supersedes_item_id: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z",
};
const DRYRUN_EMPTY = { seed_id: "s1", client_id: "c1", as_of: "2026-01-15", state: "open", obe_net_cents: 0, deltas: [], unmapped_labels: [], missing_must_asks: [] };

function baseMock(opts: {
  items?: unknown[];
  entriesStatus?: number;
  entriesBody?: unknown;
  cancelRefusal?: { code: string; message: string; reason: string | null };
  approveRefusal?: { code: string; message: string; reason: string | null };
}) {
  return (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/rpc/get_opening_dryrun")) return jsonResponse(DRYRUN_EMPTY);
    if (url.includes("/rest/v1/rpc/cancel_opening_seed")) {
      if (opts.cancelRefusal) return jsonResponse({ code: opts.cancelRefusal.code, message: opts.cancelRefusal.message, details: opts.cancelRefusal.reason ? JSON.stringify({ reason: opts.cancelRefusal.reason }) : undefined }, 400);
      return jsonResponse({ seed_id: "s1", status: "cancelled" });
    }
    if (url.includes("/rest/v1/rpc/approve_opening_seed")) {
      if (opts.approveRefusal) return jsonResponse({ code: opts.approveRefusal.code, message: opts.approveRefusal.message, details: opts.approveRefusal.reason ? JSON.stringify({ reason: opts.approveRefusal.reason }) : undefined }, 400);
      return jsonResponse({ seed_id: "s1", status: "finalized" });
    }
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([SEED_OPEN_UNTIED]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([{ id: "plan1", state: "open", revision_token: "rev1", created_at: "2026-01-01T00:00:00Z" }]);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([]);
    if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_items")) return jsonResponse(opts.items ?? []);
    if (url.includes("/rest/v1/opening_tb_targets")) return jsonResponse([]);
    if (url.includes("/rest/v1/client_resolutions")) return jsonResponse([]);
    if (url.includes("/rest/v1/journal_entries")) {
      if (opts.entriesStatus && opts.entriesStatus >= 400) return jsonResponse(opts.entriesBody ?? { message: "permission denied" }, opts.entriesStatus);
      return jsonResponse([{ id: "e1", revision_token: "rev-e1", status: "draft", is_opening_balance: true, reversal_of: null }, { id: "e2", revision_token: "rev-e2", status: "draft", is_opening_balance: true, reversal_of: null }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(OpeningRegister, { clientId: "c1" })),
  });
}

async function mountBody() {
  const h = await renderComponent(App());
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 6; i++) await h.settle();
  return { h, body };
}

test("BLOCKER 2(a): the not_serializable hint appears on CLR31/not_serializable, and does NOT appear on an ordinary CLR31 (registry_not_open)", async () => {
  // Positive: approve_opening_seed refuses not_serializable.
  await withMockedEnv(
    baseMock({ items: [ITEM_A], approveRefusal: { code: "CLR31", message: "opening batch approval requires serializable isolation", reason: "not_serializable" } }),
    async () => {
      const { h, body } = await mountBody();
      try {
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Approve seed"));
        assert.ok(trigger);
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        const confirmButtons = buttonsLabelled(body as never, "Approve seed");
        await h.act(() => clickButton(confirmButtons[1] as never));
        for (let i = 0; i < 8; i++) await h.settle();
        assert.match(textOf(body as never), /serializable transaction — the deploy ceremony sets this in the DB/, "the operator hint must render on not_serializable");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );

  // Negative: cancel_opening_seed refuses an ORDINARY CLR31 (registry_not_open).
  await withMockedEnv(
    baseMock({ items: [], cancelRefusal: { code: "CLR31", message: "only an empty open seed may be cancelled", reason: "registry_not_open" } }),
    async () => {
      const { h, body } = await mountBody();
      try {
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Cancel seed"));
        assert.ok(trigger);
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(reasonField);
        const { setFieldValue } = await import("../../test/hookHarness");
        await h.act(() => setFieldValue(reasonField as never, "test"));
        const confirmButtons = buttonsLabelled(body as never, "Cancel seed");
        await h.act(() => clickButton(confirmButtons[1] as never));
        for (let i = 0; i < 8; i++) await h.settle();
        assert.match(textOf(body as never), /only an empty open seed may be cancelled/, "the refusal itself must still render");
        assert.doesNotMatch(textOf(body as never), /serializable transaction — the deploy ceremony sets this in the DB/, "the not_serializable hint must NOT render on an ordinary CLR31");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

test("BLOCKER 2(b): a FAILING journal_entries read renders its own error AND disables Confirm — never an empty-map post", async () => {
  await withMockedEnv(baseMock({ items: [ITEM_A], entriesStatus: 403, entriesBody: { message: "permission denied for table journal_entries" } }), async () => {
    const { h, body } = await mountBody();
    try {
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Approve seed"));
      assert.ok(trigger);
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /Your account can't read this yet/, "the failed revisions read (403 -> ReadError kind 'forbidden') must render its own error inside the dialog");
      const confirmButtons = buttonsLabelled(body as never, "Approve seed");
      assert.equal(confirmButtons.length, 2);
      assert.equal((confirmButtons[1] as unknown as { disabled: boolean }).disabled, true, "BLOCKER 2(b): Confirm must be DISABLED while the revisions read has failed — never let a click post an empty entryRevisions map");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("BLOCKER 2(c): the consent list shows the REAL approved set (distinct key/kind/amount per item), never a bare count, within the cap", async () => {
  await withMockedEnv(baseMock({ items: [ITEM_A, ITEM_B] }), async () => {
    const { h, body } = await mountBody();
    try {
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Approve seed"));
      assert.ok(trigger);
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 4; i++) await h.settle();
      const dialogText = textOf(findDialogContent(body as never));
      assert.match(dialogText, /cash-mbb-77/, "item A's own key must render");
      assert.match(dialogText, /GL balance/, "item A's own kind label must render");
      assert.match(dialogText, /RM 5,001\.23/, "item A's own exact amount must render");
      assert.match(dialogText, /obe-adjust-4/, "item B's own key must render");
      assert.match(dialogText, /OBE plug/, "item B's own kind label must render");
      assert.match(dialogText, /-RM 876\.54/, "item B's own exact (negative) amount must render");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("BLOCKER 2(c): beyond the cap (12), the consent falls back to the count — never a truncated/overflowing per-row list", async () => {
  const manyItems = Array.from({ length: 13 }, (_, i) => ({ ...ITEM_A, id: `i${i}`, item_key: `line-${i}`, entry_id: `e${i}` }));
  await withMockedEnv(baseMock({ items: manyItems }), async () => {
    const { h, body } = await mountBody();
    try {
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Approve seed"));
      assert.ok(trigger);
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 4; i++) await h.settle();
      // Scoped to the OPEN DIALOG's own content — the register's sibling
      // "Drafted opening items" table legitimately lists every item's key
      // regardless of this dialog's own cap; a page-wide check would be
      // vacuous against exactly the mutant this test exists to catch.
      const dialogText = textOf(findDialogContent(body as never));
      assert.match(dialogText, /13 draft items/, "the count fallback must name the real count (13)");
      assert.doesNotMatch(dialogText, /line-0/, "beyond the cap, individual item rows must NOT render INSIDE THE DIALOG (would overflow it)");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
