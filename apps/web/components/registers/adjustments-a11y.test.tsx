// GATE (b) — structural a11y scan of the adjustments workbench + the Propose
// Template door dialog open (owner ruling Q7). See test/domInspect.ts's header
// for why this rides a hand-written rule engine rather than real axe-core —
// the staff-advances-a11y.test.tsx precedent, ported to this train's own panel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { AdjustmentsRegister } from "./adjustments-register";

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
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
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

const TEMPLATES = [
  { id: "tpl1", client_id: "c1", status: "proposed", name: "Monthly rent accrual", cadence: "monthly", start_date: "2026-01-01", end_date: null, auto_reverse: true, memo_template: "Rent accrual" },
];
const RUNS = [
  { id: "r1", client_id: "c1", template_id: "tpl1", period_start: "2026-01-01", period_end: "2026-01-31", mode: "post", entry_id: "e1", reversal_entry_id: null, amount_cents: 10000, created_at: "2026-02-01T00:00:00Z" },
];
const ACCOUNTS = [
  { client_id: "c1", account_code: "5100", name: "Rent expense", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
  { client_id: "c1", account_code: "2100", name: "Accrued liabilities", account_type: "liability", account_class: null, special_acc_type: null, is_active: true },
];
const RUNS_PROJECTED = RUNS.map((r) => ({ ...r, correctable: false, active_pair_id: null, active_pair_status: null, correction_verb: null, correction_entry: r.entry_id, correction_wall: "entry_not_approved", correction_wall_advice: null }));
const DUE = { due: false, reason: "nothing_due", blocked: [] };
const PAIR_REVERSALS: unknown[] = [];

async function mockFetch(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rest/v1/adjustment_templates?")) return jsonResponse(TEMPLATES);
  if (u.includes("/rest/v1/adjustment_runs?")) return jsonResponse(RUNS);
  if (u.includes("/rest/v1/coa_accounts?")) return jsonResponse(ACCOUNTS);
  if (u.includes("/rest/v1/adjustment_pair_reversals?")) return jsonResponse(PAIR_REVERSALS);
  if (u.includes("/rpc/list_adjustment_runs")) return jsonResponse({ client_id: "c1", runs: RUNS_PROJECTED });
  if (u.includes("/rpc/adjustment_run_due")) return jsonResponse(DUE);
  throw new Error(`unexpected fetch: ${u}`);
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(AdjustmentsRegister, { clientId: "c1" })),
  });
}

test("adjustments workbench + Propose Template door dialog OPEN have zero violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /Monthly rent accrual/, "the panel must have loaded far enough to show the proposed template");

      const collapsedViolations = checkAccessibility(body as never);
      assert.deepEqual(collapsedViolations, [], `collapsed: ${JSON.stringify(collapsedViolations)}`);

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Propose template"));
      assert.ok(trigger, "the Propose Template dialog trigger must render");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the trigger must reveal the dialog's cancel control");

      const openViolations = checkAccessibility(body as never);
      assert.deepEqual(openViolations, [], `open dialog: ${JSON.stringify(openViolations)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("adjustments workbench renders the run-due banner honestly (nothing due today)", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /No adjustment run is due right now/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// A REAL governed refusal (retire_adjustment_template's own CLR38) driven
// through the Retire dialog's own Confirm button, asserted VERBATIM in the
// register's persistent banner — the F3-class test the staff-advances-a11y
// precedent minted (a mutant deleting the refusal-banner block must go red).
test("a governed refusal (retire_adjustment_template) renders verbatim in the register's own persistent banner, never merely as a rendered string", async () => {
  await withMockedEnv(
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/rpc/retire_adjustment_template")) {
        return jsonResponse(
          { code: "CLR38", message: "an occurrence draft for this template is still outstanding; approve or withdraw it before retiring the template", details: '{"reason":"occurrence_draft_outstanding"}' },
          400,
        );
      }
      return mockFetch(url).then((r) => { void init; return r; });
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const retireTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Retire"));
        assert.ok(retireTrigger, "the Retire trigger must render for the proposed template row");
        await h.fireEvent(retireTrigger! as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the reason textarea must be reachable inside the dialog");
        await h.act(() => { setFieldValue(textarea as never, "clearing an obsolete draft"); });
        for (let i = 0; i < 2; i++) await h.settle();

        const confirmButton = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Retire" && (n as unknown) !== (retireTrigger as unknown),
        );
        assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "the reason is filled — Confirm must be enabled");

        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 8; i++) await h.settle();

        assert.match(h.text(), /CLR38/, "the CLR code must render, verbatim");
        assert.match(h.text(), /occurrence draft for this template is still outstanding/, "the DB's own message must render, verbatim — never re-worded");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

// F6 (independent review, nit): pin the NEGATIVE direction of the pair-ledger's
// pending gate. Positive coverage (a pending row offers Approve/Cancel) already
// exists in adjustments-keyboard.test.tsx; a mutant that dropped the `status ===
// "pending"` condition entirely (offering Approve/Cancel on every row) would
// leave that positive-only coverage green.
test("pair-reversal ledger offers Approve/Cancel ONLY on a pending row — completed and cancelled rows offer neither", async () => {
  const PAIR_REVERSALS_MIXED = [
    { id: "pr1", client_id: "c1", template_id: "tpl1", occurrence_id: "e1", mirror_id: "e2", occurrence_correction_id: "e3", mirror_correction_id: "e4", maker: "u1", status: "pending", completed_at: null, op_key: "k1", created_at: "2026-02-05T00:00:00Z" },
    { id: "pr2", client_id: "c1", template_id: "tpl1", occurrence_id: "e5", mirror_id: "e6", occurrence_correction_id: "e7", mirror_correction_id: "e8", maker: "u1", status: "completed", completed_at: "2026-02-06T00:00:00Z", op_key: "k2", created_at: "2026-02-04T00:00:00Z" },
    { id: "pr3", client_id: "c1", template_id: "tpl1", occurrence_id: "e9", mirror_id: "e10", occurrence_correction_id: "e11", mirror_correction_id: "e12", maker: "u1", status: "cancelled", completed_at: null, op_key: "k3", created_at: "2026-02-03T00:00:00Z" },
  ];
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rest/v1/adjustment_pair_reversals?")) return jsonResponse(PAIR_REVERSALS_MIXED);
      return mockFetch(url);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.match(h.text(), /Completed/, "the completed row's status badge must render");
        assert.match(h.text(), /Cancelled/, "the cancelled row's status badge must render");

        const approveButtons = findAllIn(h.container as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Approve");
        const cancelButtons = findAllIn(h.container as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
        assert.equal(approveButtons.length, 1, "exactly ONE Approve button — only the pending row's");
        assert.equal(cancelButtons.length, 1, "exactly ONE Cancel button — only the pending row's (the dialog-level Cancel controls are unrelated 'Cancel' text and are not open here)");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// F8 (independent review, nit): the solo-occurrence branch. `list_adjustment_runs`
// can report `correction_verb: "clara.reverse_entry"` for a run whose auto-reverse
// pair mirror was never minted — this train's own door (reverse_adjustment_pair)
// does not apply, and the panel must say so honestly rather than offering a wrong
// button or silence.
test("a solo-occurrence run (correction_verb: clara.reverse_entry) renders the honest note, never a Reverse-pair button", async () => {
  const RUNS_SOLO = RUNS.map((r) => ({ ...r, correctable: true, active_pair_id: null, active_pair_status: null, correction_verb: "clara.reverse_entry", correction_entry: r.entry_id, correction_wall: null, correction_wall_advice: null }));
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_adjustment_runs")) return jsonResponse({ client_id: "c1", runs: RUNS_SOLO });
      return mockFetch(url);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.match(h.text(), /solo occurrence, not an auto-reverse pair/, "the honest solo-occurrence note must render");
        const reversePairButtons = findAllIn(h.container as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Reverse pair"));
        assert.equal(reversePairButtons.length, 0, "no Reverse-pair button for a solo occurrence — that verb is clara.reverse_entry, T6's door, not this train's");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
