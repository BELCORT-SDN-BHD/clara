// THE SIBLING-STALENESS CLASS (the sweep addendum to #541's L7 order).
//
// Every register on these tabs is a PAGE of panels, and each panel owns its own read.
// `act()` reloads the hook it belongs to and nothing else — which is correct, and
// which means a write that moves what a SIBLING is showing leaves that sibling
// asserting a figure the DB no longer agrees with. Five instances, each fixed by
// wiring an existing channel rather than adding a read:
//
//   1. a depreciation run posts entries -> the fixed-asset table's cost/accumulated/
//      NBV and the register<->GL tie both move, and neither re-read;
//   2. `FaRegisterTieBanner` destructured no `reload` at all, so its tie was whatever
//      the DB said at first paint, for the life of the page;
//   3. booking a staff-advance application left the per-account statement stale (its
//      reload effect watched only the SELECTED ACCOUNT, which a write never changes);
//   4. renaming or merging a counterparty left the aging table above it showing the
//      old name — and, after a merge, rows that no longer exist;
//   5. the `DataState` loading gate UNMOUNTED the panel that owns the act, so every
//      attempt tore down the open dialog and everything typed into it. That one is the
//      completion of CB-AE2E-004: a dialog that correctly refuses to close is no use
//      if its parent throws it away.
//
// EVERY CELL HERE COUNTS WIRE CALLS, before and after, because that is the only
// post-condition that discriminates. "The panel still renders" is true whether or not
// it re-read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { FixedAssetsRegister } from "./fixed-assets-register";
import { AgingRegister } from "./aging-register";
import { StaffAdvancesRegister } from "./staff-advances-register";

enableDomInspection();

type Node = { tagName?: string; value?: string; childNodes?: Node[] };

function bodyOf(): Node {
  return (globalThis as unknown as { document: { body: Node } }).document.body;
}

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

function App(el: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: el });
}

/** One counter per verb, so a cell can say WHICH read re-ran. */
function counters() {
  return {} as Record<string, number>;
}

// ---------------------------------------------------------------------------
// The fixed-asset page's own fixtures.
// ---------------------------------------------------------------------------

const ASSET = {
  id: "fa11111-1111-4111-8111-111111111111",
  description: "Delivery van",
  status: "active",
  acquired_date: "2026-01-01",
  cost_cents: 8000000,
  accumulated_cents: 1000000,
  nbv_cents: 7000000,
  method: "straight_line",
  // The Revise dialog SEEDS from the row (fa-row-actions.tsx:67-77) and its Confirm
  // gates on `particularsReadyToSubmit` — so a row whose particulars are already
  // complete is what makes that door reachable with one typed field.
  useful_life_months: 60,
  rate_bps: null,
  residual_cents: 0,
  start_date: "2026-01-01",
  ca_class: null,
  is_commercial_vehicle: false,
  is_new: true,
  particulars_complete: true,
  disposal_draft_outstanding: false,
  disposal_draft_entry_id: null,
};

const TIE_ROW = {
  asset_account: "1500", accum_account: "1590",
  register_cost_cents: 8000000, gl_cost_cents: 8000000, cost_diff_cents: 0,
  register_accum_cents: 1000000, gl_accum_cents: 1000000, accum_diff_cents: 0,
  gl_pre_enrolment_cost_cents: 0, gl_pre_enrolment_accum_cents: 0,
  gl_foreign_register_cost_cents: 0, gl_foreign_register_accum_cents: 0,
  pending_draft_rows: 0, cost_reported_here: true, before_baseline: false,
};

function faMock(seen: Record<string, number>, opts: { runRefuses?: boolean; slowReload?: boolean } = {}): typeof fetch {
  return (async (u: RequestInfo | URL) => {
    const url = String(u);
    const bump = (k: string) => { seen[k] = (seen[k] ?? 0) + 1; };
    if (url.includes("/rpc/list_fixed_assets")) {
      bump("assets");
      // THE LOADING WINDOW, MADE OBSERVABLE (addendum 5). The defect is only visible
      // WHILE `act()`'s reload is in flight: after it settles the table is back, so a
      // cell that reads only at the end cannot tell the fixed gate from the broken one
      // (measured — the first cut of this cell stayed GREEN under the reverting
      // mutant). Every read after the first takes several real macrotask turns, which
      // forces React to actually commit the intermediate render this cell inspects.
      if (opts.slowReload && (seen.assets ?? 0) > 1) {
        for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
      }
      return jsonResponse({ assets: [ASSET], incomplete_count: 0 });
    }
    if (url.includes("/rpc/fa_register_tie")) { bump("tie"); return jsonResponse({ client_id: "c1", as_of: "2026-01-01", tie: true, accounts: [TIE_ROW], incomplete_count: 0, pending_draft_count: 0 }); }
    if (url.includes("/rpc/get_depreciation_authority")) { bump("authority"); return jsonResponse({
      client_id: "c1",
      // The envelope's OWN shape (lib/registers/depreciation.ts): `fy_end` and
      // `ramp_earned` are read unconditionally by AuthorityCeremony, so a fixture
      // that omits them throws rather than rendering — the same
      // fixture-does-not-match-the-contract trap the e2e readiness fixture hit.
      fy_end: { month: 12, day: 31, fallback: false },
      ramp_earned: true,
      authority: { id: "au1", status: "live", cadence: "monthly", proposed_by: "u1", proposed_at: "t", signed_by: "u2", signed_at: "t" },
      history: [],
    }); }
    if (url.includes("/rpc/list_depreciation_runs")) { bump("runs"); return jsonResponse({ client_id: "c1", runs: [] }); }
    if (url.includes("/rpc/run_depreciation_manual")) {
      bump("run_manual");
      if (opts.runRefuses) return jsonResponse({ code: "CLR37", message: "no live depreciation authority", details: '{"reason":"fa_authority_missing"}' }, 400);
      return jsonResponse({ run_id: "r1", charged_cents: 100000, entries: 1 });
    }
    if (url.includes("/rest/v1/coa_accounts")) { bump("coa"); return jsonResponse([{ account_code: "1500", name: "Motor vehicles", account_type: "asset", account_class: null, special_acc_type: null, is_active: true }]); }
    if (url.includes("/rest/v1/fa_account_profiles")) { bump("profiles"); return jsonResponse([]); }
    if (url.includes("/rpc/complete_fixed_asset_particulars") || url.includes("/rpc/revise_fixed_asset_particulars")) {
      bump("revise");
      return jsonResponse({ code: "CLR37", message: "the register already carries an approved balance", details: '{"reason":"fa_already_approved"}' }, 400);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

test("addendum 1+2: a POSTED depreciation run re-reads the fixed-asset table AND the register↔GL tie", async () => {
  const seen = counters();
  await withMockedEnv(faMock(seen), async () => {
    const h = await renderComponent(App(createElement(FixedAssetsRegister, { clientId: "c1" })));
    const body = bodyOf();
    (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const assetsBefore = seen.assets ?? 0;
      const tieBefore = seen.tie ?? 0;
      assert.ok(assetsBefore > 0 && tieBefore > 0, "both reads must have run at least once at mount");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Run depreciation"));
      assert.ok(trigger, "the run trigger must render on a live authority");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const start = findIn(body, (n) => (n as unknown as { id?: string }).id === "fa-run-start");
      const end = findIn(body, (n) => (n as unknown as { id?: string }).id === "fa-run-end");
      assert.ok(start && end, "the period fields must be reachable inside the dialog");
      await h.act(() => { setFieldValue(start as never, "2026-04-01"); setFieldValue(end as never, "2026-04-30"); });
      for (let i = 0; i < 2; i++) await h.settle();

      const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Run depreciation" && (n as unknown) !== (trigger as unknown));
      assert.ok(confirm, "the dialog's own Confirm must be reachable");
      await h.act(() => clickButton(confirm as never));
      for (let i = 0; i < 10; i++) await h.settle();

      assert.equal(seen.run_manual, 1, "exactly one governed run");
      // THE DISCRIMINATING POST-CONDITION. Before the fix both counts stayed put: the
      // run's own panel reloaded its runs list and nothing else on the page.
      assert.ok((seen.assets ?? 0) > assetsBefore, `the fixed-asset table must re-read after a posted run (${assetsBefore} -> ${seen.assets})`);
      assert.ok((seen.tie ?? 0) > tieBefore, `the register↔GL tie must re-read after a posted run (${tieBefore} -> ${seen.tie})`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 4; i++) await h.settle();
    }
  });
});

// MUST-NOT-RED CONTROL for item 1: `onPosted` rides `act`'s `onOk`, which never fires
// on the catch path. A REFUSED run must refresh nothing — otherwise the wiring is not
// "after a post", it is "after a click", and the two are different claims.
test("addendum 1 control: a REFUSED depreciation run does NOT re-read the table or the tie", async () => {
  const seen = counters();
  await withMockedEnv(faMock(seen, { runRefuses: true }), async () => {
    const h = await renderComponent(App(createElement(FixedAssetsRegister, { clientId: "c1" })));
    const body = bodyOf();
    (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const assetsBefore = seen.assets ?? 0;
      const tieBefore = seen.tie ?? 0;

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Run depreciation"));
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      const start = findIn(body, (n) => (n as unknown as { id?: string }).id === "fa-run-start");
      const end = findIn(body, (n) => (n as unknown as { id?: string }).id === "fa-run-end");
      await h.act(() => { setFieldValue(start as never, "2026-04-01"); setFieldValue(end as never, "2026-04-30"); });
      for (let i = 0; i < 2; i++) await h.settle();
      const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Run depreciation" && (n as unknown) !== (trigger as unknown));
      await h.act(() => clickButton(confirm as never));
      for (let i = 0; i < 10; i++) await h.settle();

      assert.equal(seen.run_manual, 1, "the door was reached");
      assert.equal(seen.assets ?? 0, assetsBefore, "a refused run posts nothing, so nothing it could have moved is re-read");
      assert.equal(seen.tie ?? 0, tieBefore, "…and the tie is untouched too");
      // CB-AE2E-004 + addendum 5, together: the refusal keeps the dialog open AND the
      // panel that owns it is still mounted, so the typed period survives.
      const startAfter = findIn(body, (n) => (n as unknown as { id?: string }).id === "fa-run-start");
      assert.ok(startAfter, "the dialog must still be open after the refusal");
      assert.equal((startAfter as unknown as { value: string }).value, "2026-04-01", "the typed period start survives");
    } finally {
      await h.unmount();
      for (let i = 0; i < 4; i++) await h.settle();
    }
  });
});

// ---------------------------------------------------------------------------
// Item 4: the aging table above the counterparty hygiene panel.
// ---------------------------------------------------------------------------

const CUSTOMER = {
  id: "cp1", firm_id: "f1", client_id: "c1", kind: "customer", name: "ABC Trading",
  name_normalized: "abctrading", registration_no: null, tin: null, payment_terms_days: 30,
  merged_into: null, retired_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

function agingMock(seen: Record<string, number>): typeof fetch {
  return (async (u: RequestInfo | URL) => {
    const url = String(u);
    const bump = (k: string) => { seen[k] = (seen[k] ?? 0) + 1; };
    if (url.includes("/rpc/ar_aging") || url.includes("/rpc/ap_aging")) {
      bump("aging");
      return jsonResponse({ client_id: "c1", as_of: "2026-01-01", domain: "ar", rows: [], totals: null });
    }
    if (url.includes("/rest/v1/counterparties")) { bump("counterparties"); return jsonResponse([CUSTOMER]); }
    if (url.includes("/rpc/rename_counterparty")) { bump("rename"); return jsonResponse({ counterparty_id: "cp1", name: "ABC Trading Sdn Bhd" }); }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

test("addendum 4: a counterparty RENAME re-reads the aging table above the hygiene panel", async () => {
  const seen = counters();
  await withMockedEnv(agingMock(seen), async () => {
    const h = await renderComponent(App(createElement(AgingRegister, { clientId: "c1" })));
    const body = bodyOf();
    (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const agingBefore = seen.aging ?? 0;
      assert.ok(agingBefore > 0, "the aging read must have run at mount");

      // The hygiene panel opens on vendors; the fixture's row is a customer, so switch.
      const customersToggle = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Customers"));
      assert.ok(customersToggle, "the kind toggle must render");
      await h.act(() => clickButton(customersToggle as never));
      for (let i = 0; i < 4; i++) await h.settle();

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Rename");
      assert.ok(trigger, "the rename trigger must render on a live counterparty");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const field = findIn(body, (n) => n.tagName === "INPUT");
      assert.ok(field, "the new-name field must be reachable");
      await h.act(() => setFieldValue(field as never, "ABC Trading Sdn Bhd"));
      for (let i = 0; i < 2; i++) await h.settle();

      const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Rename" && (n as unknown) !== (trigger as unknown));
      assert.ok(confirm, "the dialog's own Confirm must be reachable");
      await h.act(() => clickButton(confirm as never));
      for (let i = 0; i < 10; i++) await h.settle();

      assert.equal(seen.rename, 1, "exactly one governed rename");
      // THE DISCRIMINATING POST-CONDITION: before the fix this count did not move, and
      // the table above kept the old name for the life of the page.
      assert.ok((seen.aging ?? 0) > agingBefore, `the aging table must re-read after a rename (${agingBefore} -> ${seen.aging})`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 4; i++) await h.settle();
    }
  });
});

// ---------------------------------------------------------------------------
// Item 3: the per-account statement panel below the staff-advance register.
// ---------------------------------------------------------------------------

const ADVANCE = {
  id: "sa1", client_id: "c1", enrolment_id: "en1", account_code: "1180",
  issue_date: "2026-03-01", amount_cents: 150000, purpose: null, reference: null,
  voided_by_entry_id: null, void_effective_date: null,
};

const ENROLMENT = {
  id: "en1", client_id: "c1", account_code: "1180", person_label: "Ah Chong",
  active: true, enrolled_by: "u1", enrolled_at: "2026-01-01T00:00:00Z",
  retired_by: null, retired_at: null, retire_reason: null,
};

function staffMock(seen: Record<string, number>): typeof fetch {
  return (async (u: RequestInfo | URL) => {
    const url = String(u);
    const bump = (k: string) => { seen[k] = (seen[k] ?? 0) + 1; };
    if (url.includes("/rest/v1/staff_advances")) { bump("advances"); return jsonResponse([ADVANCE]); }
    if (url.includes("/rest/v1/staff_advance_accounts")) { bump("accounts"); return jsonResponse([ENROLMENT]); }
    if (url.includes("/rest/v1/coa_accounts")) { bump("coa"); return jsonResponse([{ account_code: "1180", name: "Staff advances", account_type: "asset", account_class: null, special_acc_type: null, is_active: true }]); }
    // The envelopes' OWN shapes — `summary.advances` and `accounts[].active` are read
    // unconditionally (staff-advances-register.tsx:76-78), so a thinner fixture throws
    // instead of rendering.
    if (url.includes("/rpc/staff_advance_summary")) { bump("summary"); return jsonResponse({ client_id: "c1", as_of: "2026-03-31", advances: [], accounts: [], policy_notes: [] }); }
    if (url.includes("/rpc/staff_advance_tie")) { bump("tie"); return jsonResponse({ client_id: "c1", as_of: "2026-03-31", tie: true, accounts: [], notes: [] }); }
    if (url.includes("/rpc/staff_advance_statement")) { bump("statement"); return jsonResponse({ client_id: "c1", account_code: "1180", opening_cents: 0, closing_cents: 150000, movements: [] }); }
    if (url.includes("/rpc/complete_staff_advance_particulars")) { bump("complete"); return jsonResponse({ advance_id: "sa1", purpose: "site visit float", reference: "PV-1" }); }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

test("addendum 3: completing an advance's particulars re-reads the per-account STATEMENT panel below", async () => {
  const seen = counters();
  await withMockedEnv(staffMock(seen), async () => {
    const h = await renderComponent(App(createElement(StaffAdvancesRegister, { clientId: "c1" })));
    const body = bodyOf();
    (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const statementBefore = seen.statement ?? 0;
      assert.ok(statementBefore > 0, "the statement read must have run at mount");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
      assert.ok(trigger, "an advance with no purpose offers Complete particulars");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const inputs: Node[] = [];
      (function walk(n: Node) {
        if (n.tagName === "INPUT") inputs.push(n);
        for (const c of n.childNodes ?? []) walk(c);
      })(body);
      assert.ok(inputs.length >= 2, "the purpose and reference fields must be reachable inside the dialog");
      await h.act(() => { setFieldValue(inputs[0] as never, "site visit float"); setFieldValue(inputs[1] as never, "PV-1"); });
      for (let i = 0; i < 2; i++) await h.settle();

      // The Confirm carries its OWN label ("Save particulars"), distinct from the
      // trigger's — so this locator can only ever match the dialog's button.
      const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Save particulars");
      assert.ok(confirm, "the dialog's own Confirm must be reachable");
      await h.act(() => clickButton(confirm as never));
      for (let i = 0; i < 10; i++) await h.settle();

      assert.equal(seen.complete, 1, "exactly one governed call");
      // THE DISCRIMINATING POST-CONDITION. The statement panel's reload effect used to
      // depend on the SELECTED ACCOUNT alone — which this write never changes — so this
      // count stayed exactly where it was and the statement kept its pre-write answer.
      assert.ok(
        (seen.statement ?? 0) > statementBefore,
        `the statement panel must re-read after a settled write above it (${statementBefore} -> ${seen.statement})`,
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 4; i++) await h.settle();
    }
  });
});

// ---------------------------------------------------------------------------
// Item 5 runs LAST, deliberately.
// ---------------------------------------------------------------------------
//
// It is the only cell here that reads MID-ACT: it fires a confirm without awaiting it,
// inspects the in-flight render, and only then settles. That leaves this harness's
// stub DOM and timer queue in a state a following `renderComponent` in the same file
// cannot mount cleanly into (measured — with this cell earlier, the two cells after it
// reported their own mount reads as never having run). A harness artefact, not a
// product fact, and ordering is the honest containment for it.

test("addendum 5: the table is NOT replaced by a loading placeholder while an act is in flight", async () => {
  const seen = counters();
  await withMockedEnv(faMock(seen, { slowReload: true }), async () => {
    const h = await renderComponent(App(createElement(FixedAssetsRegister, { clientId: "c1" })));
    const body = bodyOf();
    (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      assert.match(h.text(), /Delivery van/, "the table must have loaded once");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Revise"));
      assert.ok(trigger, "an active, complete row offers Revise");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const eff = findIn(body, (n) => (n as unknown as { id?: string }).id?.startsWith("fa-revise-eff") === true);
      assert.ok(eff, "the effective-from field must be reachable inside the dialog");
      await h.act(() => setFieldValue(eff as never, "2026-05-01"));
      for (let i = 0; i < 2; i++) await h.settle();

      const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Revise" && (n as unknown) !== (trigger as unknown));
      assert.ok(confirm, "the dialog's own Confirm must be reachable");

      // Fire the confirm WITHOUT awaiting it to completion, then let React commit the
      // in-flight render. The reload is deliberately slow (see the mock), so this is
      // the middle of the act, not the end of it.
      const inFlight = h.act(() => clickButton(confirm as never));
      for (let i = 0; i < 3; i++) await h.settle();

      // THE DISCRIMINATING POST-CONDITION, and the only one that separates the fixed
      // gate from the broken one. `act()` flips `loading` true on the reload it always
      // fires; with `loading={loading}` DataState returned its LoadingState INSTEAD of
      // the table right here — unmounting the row, the open dialog and the typed field
      // together, which is what would have silently defeated CB-AE2E-004 on this page.
      assert.match(h.text(), /Delivery van/, "the row must still be rendered DURING the act — not replaced by a loading placeholder");
      assert.doesNotMatch(h.text(), /Loading the fixed-asset register|Loading…/, "…and no loading placeholder stands in its place");

      await inFlight;
      for (let i = 0; i < 12; i++) await h.settle();

      // After it settles: the refusal is verbatim, the dialog is still open
      // (CB-AE2E-004), and the typed value survived — because its parent never went away.
      assert.match(textOf(body as never), /already carries an approved balance/, "the DB's own refusal renders verbatim");
      const effAfter = findIn(body, (n) => (n as unknown as { id?: string }).id?.startsWith("fa-revise-eff") === true);
      assert.ok(effAfter, "the dialog is still open");
      assert.equal((effAfter as unknown as { value: string }).value, "2026-05-01", "and what the human typed is still there");
    } finally {
      await h.unmount();
      for (let i = 0; i < 4; i++) await h.settle();
    }
  });
});
