// Fix round (rev-t2) pins for F5 (four unpinned judgement branches — driving
// the REAL dialog and capturing the posted wire body, not just presentational
// text) and F8 (two un-hidden triggers). Every fixture value below is chosen
// to be DISTINCT and non-default, so a mutant that forces a value to a
// hardcoded/nil placeholder is caught by an exact-equality assertion, never a
// substring match that a coincidental default could also satisfy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OpeningRegister } from "./opening-register";

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
const ITEM = {
  id: "i1", firm_id: "f1", client_id: "c1", seed_id: "s1", item_kind: "gl_balance", item_key: "cash-mbb",
  entry_id: "e1", counterparty_id: null, fixed_asset_id: null, item_ref: null, item_date: null,
  amount_cents: 500123, sst_portion_cents: null, sst_rate_bp: null, sst_basis: null, state: "active",
  superseded_by_item: null, supersedes_item_id: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z",
};
const DRYRUN_EMPTY = { seed_id: "s1", client_id: "c1", as_of: "2026-01-15", state: "open", obe_net_cents: 0, deltas: [], unmapped_labels: [], missing_must_asks: [] };

function baseMock(opts: {
  items?: unknown[];
  resolution?: unknown[];
  planRevisionToken?: string;
  entryRevisionToken?: string;
  captureBody?: (fn: string, body: Record<string, unknown>) => void;
}) {
  return (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    if (url.includes("/rest/v1/rpc/")) {
      const fn = url.split("/rest/v1/rpc/")[1]!;
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      opts.captureBody?.(fn, body);
      if (fn === "get_opening_dryrun") return jsonResponse(DRYRUN_EMPTY);
      if (fn === "draft_opening_item") return jsonResponse({ seed_id: "s1", item_id: "i2", entry_id: "e2", status: "draft" });
      if (fn === "approve_opening_seed") return jsonResponse({ seed_id: "s1", status: "finalized" });
      if (fn === "record_opening_target") return jsonResponse({ target_id: "t1", seed_id: "s1", provenance_kind: "keyed" });
      return jsonResponse({});
    }
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([SEED_OPEN_UNTIED]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([{ id: "plan1", state: "open", revision_token: opts.planRevisionToken ?? "rev-plan-default", created_at: "2026-01-01T00:00:00Z" }]);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([{ account_code: "1000", name: "Cash at bank", account_type: "asset", account_class: null, special_acc_type: null, is_active: true }]);
    if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_items")) return jsonResponse(opts.items ?? []);
    if (url.includes("/rest/v1/opening_tb_targets")) return jsonResponse([]);
    if (url.includes("/rest/v1/client_resolutions")) return jsonResponse(opts.resolution ?? []);
    if (url.includes("/rest/v1/journal_entries")) return jsonResponse([{ id: "e1", revision_token: opts.entryRevisionToken ?? "rev-entry-default", status: "draft", is_opening_balance: true, reversal_of: null }]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(OpeningRegister, { clientId: "c1" })),
  });
}

async function mountAndOpenDialog(triggerText: string) {
  const h = await renderComponent(App());
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 6; i++) await h.settle();
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(triggerText));
  if (!trigger) throw new Error(`trigger not found: ${triggerText}`);
  await h.fireEvent(trigger as never, "click");
  for (let i = 0; i < 4; i++) await h.settle();
  return { h, body };
}

test("F5-1: Draft-item Confirm is DISABLED while untied + unresolved, ENABLED once a keyed resolution is bound", async () => {
  await withMockedEnv(baseMock({ resolution: [] }), async () => {
    const { h, body } = await mountAndOpenDialog("Draft opening item");
    try {
      const keyField = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-draft-key");
      assert.ok(keyField, "the item-key field must be reachable");
      await h.act(() => setFieldValue(keyField as never, "gl-1"));
      const buttons = buttonsLabelled(body as never, "Draft opening item");
      assert.equal(buttons.length, 2, "trigger + dialog Confirm, both labelled 'Draft opening item'");
      assert.equal((buttons[1] as unknown as { disabled: boolean }).disabled, true, "F5-1: Confirm must stay DISABLED — this seed is untied with NO keyed resolution bound yet");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });

  await withMockedEnv(baseMock({ resolution: [{ id: "r1" }] }), async () => {
    const { h, body } = await mountAndOpenDialog("Draft opening item");
    try {
      const keyField = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-draft-key");
      await h.act(() => setFieldValue(keyField as never, "gl-1"));
      const buttons = buttonsLabelled(body as never, "Draft opening item");
      assert.equal((buttons[1] as unknown as { disabled: boolean }).disabled, false, "F5-1: Confirm must be ENABLED once a keyed resolution IS bound");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("F5-2: the draft's p_resolution posts the REAL bound resolution id, never forced null", async () => {
  let captured: Record<string, unknown> | null = null;
  const mock = baseMock({ resolution: [{ id: "r-distinct-77" }], captureBody: (fn, body) => { if (fn === "draft_opening_item") captured = body; } });
  await withMockedEnv(mock, async () => {
    const { h, body } = await mountAndOpenDialog("Draft opening item");
    try {
      const keyField = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-draft-key");
      await h.act(() => setFieldValue(keyField as never, "gl-1"));
      const buttons = buttonsLabelled(body as never, "Draft opening item");
      await h.act(() => clickButton(buttons[1] as never));
      for (let i = 0; i < 6; i++) await h.settle();
      assert.ok(captured, "draft_opening_item must have been posted");
      assert.equal((captured as unknown as { p_resolution: string }).p_resolution, "r-distinct-77", "F5-2: p_resolution must be the REAL bound id — a forced null here refuses CLR01 on every untied draft");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("F5-3/F5-4: approve_opening_seed posts the REAL plan revision_token and the REAL entryRevisions map — neither a nil placeholder nor {}", async () => {
  let captured: Record<string, unknown> | null = null;
  const mock = baseMock({
    items: [ITEM],
    planRevisionToken: "rev-plan-distinct-42", // gitleaks:allow -- a distinct test-fixture revision token, not a credential
    entryRevisionToken: "rev-entry-distinct-99",
    captureBody: (fn, body) => { if (fn === "approve_opening_seed") captured = body; },
  });
  await withMockedEnv(mock, async () => {
    const { h, body } = await mountAndOpenDialog("Approve seed");
    try {
      const buttons = buttonsLabelled(body as never, "Approve seed");
      assert.equal(buttons.length, 2);
      await h.act(() => clickButton(buttons[1] as never));
      for (let i = 0; i < 6; i++) await h.settle();
      assert.ok(captured, "approve_opening_seed must have been posted");
      const c = captured as unknown as { p_expected_plan_revision: string; p_entry_revisions: Record<string, string> };
      assert.equal(c.p_expected_plan_revision, "rev-plan-distinct-42", "F5-3: the REAL plan revision_token, never a nil/placeholder uuid");
      assert.deepEqual(c.p_entry_revisions, { e1: "rev-entry-distinct-99" }, "F5-4: the REAL entryRevisions map, never {}");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("F8-1: the Add-target-line trigger is reachable on an untied open seed with NO keyed resolution bound — the door has no such precondition", async () => {
  await withMockedEnv(baseMock({ resolution: [] }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Add target line"));
      assert.ok(trigger, "F8-1: Add target line must render even with no bound resolution — record_opening_target has no resolution precondition");
    } finally {
      await h.unmount();
    }
  });
});

test("F8-2: the Cancel-seed trigger is reachable on an open seed that already has drafted items", async () => {
  await withMockedEnv(baseMock({ items: [ITEM] }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Cancel seed"));
      assert.ok(trigger, "F8-2: Cancel seed must render even with items present — the door itself refuses CLR31 registry_not_open, not this component pre-hiding it");
    } finally {
      await h.unmount();
    }
  });
});
