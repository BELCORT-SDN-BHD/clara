// T2: replaces this file's own prior test of the NotBuiltNote placeholder
// (T0 seam) — the real workbench renders now, so that test's own assertions
// (matching "not built"/"train T2") would be a false green against deleted
// code. Render-states + exact-amount pinning on the dry-run tie-out strip
// (AGENTS.md constraint 2): every cell below is a DISTINCT, non-round DB
// figure, asserted individually — a fixture that repeats one value across
// cells would prove nothing (this train's own battery law).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
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
/** The `<TR>` whose OWN text contains `needle`, then its direct `<TD>` cells'
 *  text in column order — a positional read, not a substring search over the
 *  whole page, so a cell-swap bug (the delta column showing the target
 *  figure) reds this test instead of passing on a coincidental match
 *  elsewhere on the page. */
function rowCells(root: Node, needle: string): string[] {
  const row = findIn(root, (n) => n.tagName === "TR" && textOf(n as never).includes(needle));
  if (!row) return [];
  return (row.childNodes ?? []).filter((c) => c.tagName === "TD").map((c) => textOf(c as never));
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
const ACCOUNTS = [{ account_code: "1000", name: "Cash at bank", account_type: "asset", account_class: null, special_acc_type: null, is_active: true }];
// Every DB-returned figure below is a DISTINCT, non-round number — the exact
// pin this train's battery law requires.
const DRYRUN = {
  seed_id: "s1", client_id: "c1", as_of: "2026-01-15", state: "open",
  obe_net_cents: 4269,
  deltas: [{ account_code: "1000", target_debit: 500123, target_credit: 0, actual_debit: 499871, actual_credit: 0, delta_debit: -252, delta_credit: 0 }],
  unmapped_labels: [{ line_key: "L9", source_label: "Misc suspense" }],
  missing_must_asks: [{ item_key: "K1", question: "Confirm the director's loan balance" }],
};

function mockFetch(overrides: Record<string, unknown> = {}) {
  return (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    if (url.includes("/rpc/get_opening_dryrun")) return jsonResponse(overrides.dryrun ?? DRYRUN);
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse(overrides.seeds ?? [SEED_OPEN_UNTIED]);
    // MUST precede the `onboarding_plans` check below — `.includes` would
    // otherwise match this URL too (it is a string prefix of it).
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse(overrides.positionItems ?? []);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse(overrides.plans ?? [{ id: "plan1", state: "open", revision_token: "rev1", created_at: "2026-01-01T00:00:00Z" }]);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(overrides.accounts ?? ACCOUNTS);
    if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_items")) return jsonResponse(overrides.items ?? [ITEM]);
    if (url.includes("/rest/v1/opening_tb_targets")) return jsonResponse(overrides.targets ?? []);
    if (url.includes("/rest/v1/client_resolutions")) return jsonResponse(overrides.resolution ?? []);
    if (url.includes("/rest/v1/journal_entries")) return jsonResponse(overrides.entries ?? [{ id: "e1", revision_token: "rev-e1", status: "draft", is_opening_balance: true, reversal_of: null }]);
    throw new Error(`unexpected fetch in opening-register test: ${url} ${init ? JSON.stringify(init.body) : ""}`);
  }) as typeof fetch;
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(OpeningRegister, { clientId: "c1" })),
  });
}

test("no live seed: an honest empty state renders, with the Create-seed entry dialog reachable — never a fabricated playbook determination", async () => {
  await withMockedEnv(mockFetch({ seeds: [] }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /No opening seed has been created/);
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Create opening seed"));
      assert.ok(trigger, "the entry-point dialog trigger must render even with zero seeds");
    } finally {
      await h.unmount();
    }
  });
});

test("a live seed: the Badge names its state, and the tie-out strip renders every DB-returned figure EXACTLY (no cell fabricated or swapped)", async () => {
  await withMockedEnv(mockFetch(), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      // A DISCRIMINATING badge read: the exact-text SPAN, not a page-wide
      // substring (the page heading itself reads "Opening balances…", so a
      // bare /Open/ match is vacuous — it stays green even if the badge's
      // OWN label were swapped to the wrong state, which is exactly the class
      // of false-positive this train's own mutant battery caught once).
      const badge = findIn(h.container as never, (n) => n.tagName === "SPAN" && textOf(n as never) === "Open");
      assert.ok(badge, "the seed badge must render the exact live-state label 'Open'");
      // THE single signed difference (mobbin takeaway 1/2) — warning tone,
      // carrying the DB's own obe_net_cents verbatim.
      assert.match(h.text(), /RM 42\.69/, "obe_net_cents (4269) must render as RM 42.69, not a client-recomputed figure");
      // The deltas row — six distinct cells, asserted by COLUMN POSITION.
      const cells = rowCells(h.container as never, "1000");
      assert.deepEqual(cells, ["1000", "RM 5,001.23", "RM 0.00", "RM 4,998.71", "RM 0.00", "-RM 2.52", "RM 0.00"]);
      assert.match(h.text(), /Misc suspense/, "an unmapped source label must render");
      assert.match(h.text(), /Confirm the director's loan balance/, "a missing must-ask question must render");
      // The keyed-resolution panel (untied seed) and the drafted item both render.
      assert.match(h.text(), /No keyed resolution minted yet/);
      assert.match(h.text(), /cash-mbb/);
    } finally {
      await h.unmount();
    }
  });
});

test("the Approve-seed gate: Confirm is ENABLED once a draft item exists — the gate reads the real draft count, not a fixed value", async () => {
  await withMockedEnv(mockFetch(), async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Approve seed"));
      assert.ok(trigger, "the Approve-seed trigger must render on an open seed");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Approve seed") && (n as unknown) !== (trigger as unknown));
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "one drafted item exists in this fixture — Confirm must be enabled, not gated shut");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("zero deltas: the tie-out shows the empty note, never a fabricated zero row", async () => {
  await withMockedEnv(mockFetch({ dryrun: { ...DRYRUN, deltas: [], unmapped_labels: [], missing_must_asks: [] } }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(h.text(), /No target\/actual comparison rows yet/);
    } finally {
      await h.unmount();
    }
  });
});
