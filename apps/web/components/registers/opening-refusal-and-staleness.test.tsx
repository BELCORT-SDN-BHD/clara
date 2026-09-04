// Fix round (rev-t2) pins for F2 (dry-run staleness after
// record_opening_target), F6 (a refusal must never wipe what the human
// typed) and F7 (a fixed-asset row's Supersede is gated with a visible
// reason, never a silently-doomed call).

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

type Node = { tagName?: string; childNodes?: Node[]; getAttribute?: (name: string) => string | null };
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
/** The dry-run strip's OWN subtree only (`data-testid="opening-dryrun-strip"`,
 *  opening-dryrun-strip.tsx:38) — scoping the read here, rather than to the
 *  whole page, is what makes a staleness assertion DISCRIMINATING: the
 *  targets TABLE elsewhere on the page refreshes through a completely
 *  different mechanism (the workbench's own combined read, reloaded by
 *  every `act()`), so a page-wide text match would stay green even if the
 *  strip's OWN separate fetch never re-ran. */
function findStrip(root: Node): Node {
  const strip = findIn(root, (n) => n.getAttribute?.("data-testid") === "opening-dryrun-strip");
  if (!strip) throw new Error("opening-dryrun-strip not found");
  return strip;
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

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(OpeningRegister, { clientId: "c1" })),
  });
}

const SEED_OPEN_UNTIED = {
  id: "s1", firm_id: "f1", client_id: "c1", plan_id: "plan1", as_of: "2026-01-15", state: "open",
  tie_document_id: null, tie_document_sha256: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z",
  batch_n: 0, finalized_at: null, finalized_by: null, tie_asserted_at: null, through_event_seq: null,
  cancelled_at: null, cancelled_by: null, cancel_reason: null,
};
const DRYRUN_EMPTY = { seed_id: "s1", client_id: "c1", as_of: "2026-01-15", state: "open", obe_net_cents: 0, deltas: [], unmapped_labels: [], missing_must_asks: [] };

test("F2 BLOCKER residual: the tie-out strip RE-FETCHES after EDITING an EXISTING line_key — a count-based key is blind to this (record_opening_target's own upsert), an act-epoch is not", async () => {
  let dryrunFetchCount = 0;
  // A REAL stateful mock reproducing the live body's own
  // `on conflict(seed_id,line_key) do update set debit_cents=excluded…`
  // (against `uq_opening_tb_targets_key UNIQUE(seed_id,line_key)`): the
  // SAME line_key overwrites the SAME row — the target COUNT never moves,
  // only the figure does. `obe_net_cents` below stands in for "the dry-run's
  // own reflection of the target's current value" so this test can prove
  // the NEW figure was actually re-read, not merely that some fetch fired.
  let targets: { id: string; line_key: string; debit_cents: number; credit_cents: number }[] = [
    { id: "t1", line_key: "target-a", debit_cents: 1000, credit_cents: 0 },
  ];
  const mock = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    if (url.includes("/rest/v1/rpc/get_opening_dryrun")) {
      dryrunFetchCount++;
      const currentDebit = targets[0]?.debit_cents ?? 0;
      return jsonResponse({ ...DRYRUN_EMPTY, obe_net_cents: currentDebit });
    }
    if (url.includes("/rest/v1/rpc/record_opening_target")) {
      const body = init?.body ? (JSON.parse(String(init.body)) as { p_line: { line_key: string; debit_cents: number; credit_cents: number } }) : null;
      const line = body?.p_line;
      if (line) {
        const existingIdx = targets.findIndex((t) => t.line_key === line.line_key);
        if (existingIdx >= 0) {
          // THE UPSERT: same row, same count, new figures — record_opening_target's
          // own `on conflict … do update` reproduced faithfully.
          targets = targets.map((t, i) => (i === existingIdx ? { ...t, debit_cents: line.debit_cents, credit_cents: line.credit_cents } : t));
        } else {
          targets = [...targets, { id: `t${targets.length + 1}`, line_key: line.line_key, debit_cents: line.debit_cents, credit_cents: line.credit_cents }];
        }
      }
      return jsonResponse({ target_id: targets[0]?.id ?? "t1", seed_id: "s1", provenance_kind: "keyed" });
    }
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([SEED_OPEN_UNTIED]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([{ id: "plan1", state: "open", revision_token: "rev1", created_at: "2026-01-01T00:00:00Z" }]);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([{ account_code: "1000", name: "Cash", account_type: "asset", account_class: null, special_acc_type: null, is_active: true }]);
    if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_tb_targets")) return jsonResponse(targets.map((t) => ({ id: t.id, firm_id: "f1", client_id: "c1", seed_id: "s1", line_key: t.line_key, account_code: "1000", source_label: t.line_key, debit_cents: t.debit_cents, credit_cents: t.credit_cents, provenance_kind: "keyed", document_id: null, source_sha256: null, extraction_ref: null, entered_by: "u1", created_at: "2026-01-15T00:00:00Z" })));
    if (url.includes("/rest/v1/client_resolutions")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${url} ${init ? "" : ""}`);
  }) as typeof fetch;

  await withMockedEnv(mock, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(findStrip(h.container as never)), /RM 10\.00/, "the STRIP (scoped, not the whole page) must show the ORIGINAL figure (1000 cents) on mount");
      const targetCountBefore = findAllIn(h.container as never, (n) => n.tagName === "TR" && textOf(n as never).includes("target-a")).length;
      assert.equal(targetCountBefore, 1, "one target row exists before the edit");
      const fetchCountBeforeEdit = dryrunFetchCount;
      assert.ok(fetchCountBeforeEdit >= 1, "the strip must have fetched at least once on mount");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Add target line"));
      assert.ok(trigger, "the Add-target trigger must render");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      // EDIT the SAME line_key with a DIFFERENT amount — never a second, distinct key.
      const lineKeyField = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-target-key");
      assert.ok(lineKeyField, "the line-key field must be reachable");
      await h.act(() => setFieldValue(lineKeyField as never, "target-a"));
      const debitField = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-target-debit");
      assert.ok(debitField, "the debit field must be reachable");
      await h.act(() => setFieldValue(debitField as never, "99.99"));

      const confirmButtons = buttonsLabelled(body as never, "Add target line");
      assert.equal(confirmButtons.length, 2);
      await h.act(() => clickButton(confirmButtons[1] as never));
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(targets.length, 1, "the upsert must have kept exactly ONE row — this is the count-blind case the epoch fix exists for");
      assert.equal(targets[0]!.debit_cents, 9999, "the row's OWN figure must have changed to the edited amount");
      const stripTextAfter = textOf(findStrip(body as never));
      assert.match(stripTextAfter, /RM 99\.99/, "F2 BLOCKER: the STRIP (scoped) must show the EDITED figure (RM 99.99) — a stale strip would still read RM 10.00 despite the target count never moving");
      assert.doesNotMatch(stripTextAfter, /RM 10\.00/, "the strip must NOT still carry the pre-edit figure");
      assert.ok(dryrunFetchCount > fetchCountBeforeEdit, `the strip's own fetch count must have increased (was ${fetchCountBeforeEdit}, now ${dryrunFetchCount})`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("F6: a refused draft_opening_item does NOT wipe the typed item key — reopening the dialog still shows it", async () => {
  const mock = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/rpc/get_opening_dryrun")) return jsonResponse(DRYRUN_EMPTY);
    if (url.includes("/rest/v1/rpc/draft_opening_item")) return jsonResponse({ code: "CLR10", message: "opening item is malformed" }, 400);
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([SEED_OPEN_UNTIED]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([{ id: "plan1", state: "open", revision_token: "rev1", created_at: "2026-01-01T00:00:00Z" }]);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([{ account_code: "1000", name: "Cash", account_type: "asset", account_class: null, special_acc_type: null, is_active: true }]);
    if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_tb_targets")) return jsonResponse([]);
    if (url.includes("/rest/v1/client_resolutions")) return jsonResponse([{ id: "r1" }]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(mock, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Draft opening item"));
      assert.ok(trigger);
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      const keyField = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-draft-key");
      assert.ok(keyField);
      await h.act(() => setFieldValue(keyField as never, "typed-before-refusal"));

      const buttons = buttonsLabelled(body as never, "Draft opening item");
      await h.act(() => clickButton(buttons[1] as never));
      for (let i = 0; i < 8; i++) await h.settle();

      assert.match(textOf(body as never), /opening item is malformed/, "the refusal must render");

      // CB-AE2E-004 (2026-09-04) — THE LAW CHANGED, and this cell changed with it.
      // It used to assert `closedConfirm.length === 1`, i.e. that the dialog had
      // CLOSED on the refusal, and then reopened it to look for the typed value.
      // Closing on a refusal was the class defect: `runOnce` reported only that
      // the handler had run, `act()` catches every refusal and resolves, so the
      // wrapper closed on failure and success alike — taking the field the refusal
      // was asking the human to correct with it. The dialog now STAYS open.
      const stillOpen = buttonsLabelled(body as never, "Draft opening item");
      assert.equal(stillOpen.length, 2, "the dialog must STAY OPEN on a refusal — trigger AND confirm are both in the tree");

      const keyFieldAfter = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-draft-key");
      assert.ok(keyFieldAfter, "the field the human typed into is still mounted");
      assert.equal((keyFieldAfter as unknown as { value: string }).value, "typed-before-refusal", "F6: the typed item key must SURVIVE a refusal — it must not have been wiped by an unconditional reset");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("F6-2: a refused record_opening_target does NOT wipe the typed line key — reopening the dialog still shows it", async () => {
  const mock = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/rpc/get_opening_dryrun")) return jsonResponse(DRYRUN_EMPTY);
    if (url.includes("/rest/v1/rpc/record_opening_target")) return jsonResponse({ code: "CLR10", message: "opening target is malformed" }, 400);
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([SEED_OPEN_UNTIED]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([{ id: "plan1", state: "open", revision_token: "rev1", created_at: "2026-01-01T00:00:00Z" }]);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([{ account_code: "1000", name: "Cash", account_type: "asset", account_class: null, special_acc_type: null, is_active: true }]);
    if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_tb_targets")) return jsonResponse([]);
    if (url.includes("/rest/v1/client_resolutions")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(mock, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Add target line"));
      assert.ok(trigger);
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      const lineKeyField = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-target-key");
      assert.ok(lineKeyField);
      await h.act(() => setFieldValue(lineKeyField as never, "typed-target-before-refusal"));
      const debitField = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-target-debit");
      await h.act(() => setFieldValue(debitField as never, "10"));

      const buttons = buttonsLabelled(body as never, "Add target line");
      await h.act(() => clickButton(buttons[1] as never));
      for (let i = 0; i < 8; i++) await h.settle();

      assert.match(textOf(body as never), /opening target is malformed/, "the refusal must render");

      // CB-AE2E-004: the dialog STAYS OPEN on a refusal — no reopen step, because
      // there is nothing to reopen. See the F6 cell above for the full reasoning.
      const stillOpen = buttonsLabelled(body as never, "Add target line");
      assert.equal(stillOpen.length, 2, "the dialog must STAY OPEN on a refusal");

      const lineKeyFieldAfter = findIn(body as never, (n) => (n as unknown as { id?: string }).id === "opening-target-key");
      assert.ok(lineKeyFieldAfter, "the field the human typed into is still mounted");
      assert.equal((lineKeyFieldAfter as unknown as { value: string }).value, "typed-target-before-refusal", "F6-2: the typed line key must SURVIVE a refusal");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

const FINALIZED_SEED = { ...SEED_OPEN_UNTIED, state: "finalized", batch_n: 1, finalized_at: "2026-01-16T00:00:00Z", finalized_by: "u1" };
const FA_ITEM = { id: "ifa", firm_id: "f1", client_id: "c1", seed_id: "s1", item_kind: "fixed_asset", item_key: "van-1", entry_id: "efa", counterparty_id: null, fixed_asset_id: "fa1", item_ref: null, item_date: null, amount_cents: 8000000, sst_portion_cents: null, sst_rate_bp: null, sst_basis: null, state: "active", superseded_by_item: null, supersedes_item_id: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z" };
const GL_ITEM = { id: "igl", firm_id: "f1", client_id: "c1", seed_id: "s1", item_kind: "gl_balance", item_key: "cash-1", entry_id: "egl", counterparty_id: null, fixed_asset_id: null, item_ref: null, item_date: null, amount_cents: 500000, sst_portion_cents: null, sst_rate_bp: null, sst_basis: null, state: "active", superseded_by_item: null, supersedes_item_id: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z" };

test("F7: a fixed_asset row's Supersede Confirm is DISABLED with a visible reason; a non-FA row's is ENABLED", async () => {
  const mock = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/rpc/get_opening_dryrun")) return jsonResponse({ ...DRYRUN_EMPTY, state: "finalized" });
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([FINALIZED_SEED]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([{ id: "plan1", state: "open", revision_token: "rev1", created_at: "2026-01-01T00:00:00Z" }]);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([]);
    if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_items")) return jsonResponse([FA_ITEM, GL_ITEM]);
    if (url.includes("/rest/v1/opening_tb_targets")) return jsonResponse([]);
    if (url.includes("/rest/v1/client_resolutions")) return jsonResponse([{ id: "r1" }]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(mock, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const supersedeTriggers = buttonsLabelled(h.container as never, "Supersede");
      assert.equal(supersedeTriggers.length, 2, "both the fixed-asset and the GL rows must offer a Supersede trigger — never hidden by kind");

      // Fixed-asset row is FIRST (FA_ITEM sorted before GL_ITEM by item_key "van-1" > "cash-1"? — open by explicit row order instead).
      for (const trigger of supersedeTriggers) {
        await h.fireEvent(trigger as never, "click");
      }
      for (let i = 0; i < 6; i++) await h.settle();

      const confirmButtons = buttonsLabelled(body as never, "Supersede").filter((b) => !supersedeTriggers.includes(b));
      assert.equal(confirmButtons.length, 2, "both dialogs must have opened, each with its own Confirm");

      const disabledFlags = confirmButtons.map((b) => (b as unknown as { disabled: boolean }).disabled);
      assert.ok(disabledFlags.includes(true), "F7: the fixed-asset row's Confirm must be DISABLED");
      assert.ok(disabledFlags.includes(false), "F7: the non-FA row's Confirm must stay ENABLED");
      assert.match(textOf(body as never), /cannot be superseded by a plain reversal/, "F7: the visible reason must render on the fixed-asset dialog");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
