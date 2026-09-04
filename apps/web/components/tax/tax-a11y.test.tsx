// GATE (b)/(c) — the Tax tab (P6-T, 裁-34), plus CB-AE2E-032's COPY gate.
//
// TRUED 2026-09-04. This file used to assert the OLD notes' internal build-log prose — "F-T1
// PR-2 onward, paused", "F-T3 PR-2…9, paused", "Track B's Tax tab UI resumes" — which meant the
// suite was PINNING the very leak CB-AE2E-032 records: lane ids, migration numbers, an owner
// ruling id and raw SQL signatures, shown to a Malaysian accountant. Those three assertions are
// replaced by a mechanical census over EVERY `ClientTax.*` string, so the class cannot come back
// under different words.
//
// THE TAB NOW FETCHES, so unlike the previous cut there IS a wire to mock: one
// `list_review_queue` call for the SST watch (its `compliance` envelope plus the queue row that
// carries `watch_id`) and one `coa_accounts` read for the classification control's account list.
//
// NO synthetic <h1> wrapper: `TaxWorkbenchPage` renders its OWN `PageHeader` h1 (the route's
// page.tsx supplies none), so the fixture renders the component bare and lets the real
// h1/h2/h3 tree stand — the only tree in which heading-order, the axe rule that actually
// applies here, means anything.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { TaxWorkbenchPage } from "./TaxWorkbenchPage";

enableDomInspection();

const CLIENT = "client-1111";

const WATCH_ROW = {
  row_kind: "compliance_watch", section: "needs_you", client_id: CLIENT, counterparty_id: null,
  filing_id: null, entry_id: null, question_id: null, task_id: null, document_id: null,
  lane: null, auto: false, rule_backed: true, high_stakes: false, aged_since: "2026-08-01T00:00:00Z",
  amount_cents: null, period: null, question_text: null, created_at: "2026-08-01T00:00:00Z",
  id: "watch-1", coding_kind: null, watch_id: "watch-1", tier: "crossed", finding_id: null,
  asset_id: null, advance_id: null, client_name: null, batch_ids: null, open_proposal_count: null,
};

const ENVELOPE = {
  watermark: "w", counts: {
    ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 0,
    open_tasks: 0, compliance_watches: 1, lint_findings: 0,
  },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  compliance: {
    stale_evaluator: false,
    clients: [{
      client_id: CLIENT, service_group: "Group F", state: "crossed",
      confirmed_included_cents: 55_000_000, unknown_or_mixed_cents: 1_200_000,
      screening_proxy_cents: 56_200_000, earliest_crossing_month: "2026-06",
      application_due: "2026-07-31", future_method_status: "not_attested",
    }],
  },
  rows: [WATCH_ROW], next_cursor: null,
};

const ACCOUNTS = [
  { account_code: "4000", name: "Consulting fees", account_type: "income", account_class: null, special_acc_type: null, is_active: true },
];

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

const HAPPY: typeof fetch = async (u) => {
  const url = String(u);
  if (url.includes("/rpc/list_review_queue")) return jsonResponse(ENVELOPE);
  if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(ACCOUNTS);
  throw new Error(`unexpected fetch: ${url}`);
};

function renderTaxTab() {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(TaxWorkbenchPage, { clientId: CLIENT }),
    }),
  );
}

test("the Tax tab (SST watch / income tax computation / turnover classification) has zero a11y violations", async () => {
  await withMockedEnv(HAPPY, async () => {
    const h = await renderTaxTab();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /SST/, "the SST panel heading must render");
      assert.match(h.text(), /Income tax computation/, "the tax computation panel heading must render");
      assert.match(h.text(), /Turnover classification/, "the turnover classification panel heading must render");
      // The LIVE section: DB-owned figures, not a note.
      assert.match(h.text(), /Group F/, "the client's own service group must render from the envelope");
      assert.match(h.text(), /Threshold crossed/, "the watch STATE must render from the envelope, in the product's own words");
      assert.match(h.text(), /550,000\.00/, "the confirmed taxable turnover must render as the DB's own figure");
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });
});

// CB-AE2E-032's OWN GATE, and the reason this file changed. Every user-visible ClientTax string
// is scanned for internal vocabulary — a lane id, a migration number, an owner-ruling id or a
// raw `clara.*` verb signature. The map's own suggested pattern, extended with "Track B" (a lane
// name that carries no digits and so escapes the F-T\d arm).
test("CB-AE2E-032: no ClientTax string leaks a lane id, a migration number, a ruling id or a raw verb signature", () => {
  const LEAK = /F-T\d|PR-\d|Track B|migration \d{4}|裁-\d+|clara\.[a-z_]+/;
  const offenders: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === "string") {
      if (LEAK.test(node)) offenders.push(`${path}: ${node}`);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    }
  };
  walk((messages as Record<string, unknown>).ClientTax, "ClientTax");
  assert.deepEqual(offenders, [], offenders.join("\n"));

  // POSITIVE CONTROL: the scanner must actually be able to say YES. Without this, a walk that
  // silently visited nothing would report a clean tab for the wrong reason — which is exactly
  // how the previous cut of this file managed to pin the leak instead of catching it.
  const control: string[] = [];
  const walkControl = (node: unknown, path: string): void => {
    if (typeof node === "string") { if (LEAK.test(node)) control.push(path); return; }
    if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walkControl(v, `${path}.${k}`);
  };
  walkControl({ a: "paused, 裁-80", b: "clara.set_turnover_classification", c: "fine" }, "ctl");
  assert.deepEqual(control.sort(), ["ctl.a", "ctl.b"], "the leak detector must fire on known-bad strings");
});

test("the Tax tab keyboard walk: every focusable control belongs to the ONE live door on this tab", async () => {
  await withMockedEnv(HAPPY, async () => {
    const h = await renderTaxTab();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Turnover classification/, "the fixture must have rendered real content before any count below means anything");

      // TRUED, NOT RELAXED. The old cell asserted ZERO focusable controls, pinning 裁-44's
      // "never an input grid". That rule is about the COMPUTATION — a professional must never
      // type a tax computation into this tab — and it is still true: nothing below writes a
      // computation. What this tab now has is the three compliance-watch triggers and the
      // turnover-classification control, every one of them a LIVE governed door that existed
      // before this train and had no surface. The cell now pins WHICH controls exist, which is
      // a stronger claim than "none": a computation form appearing here still reds it.
      const names = focusableElements(h.container as never)
        .map((n) => (n as { tagName?: string }).tagName ?? "?")
        .sort();
      assert.ok(names.length > 0, "the live doors must be reachable");
      assert.deepEqual(
        [...new Set(names)].sort(),
        ["BUTTON", "INPUT", "SELECT", "TEXTAREA"],
        JSON.stringify(names),
      );
      const violations = checkKeyboardWalk(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });
});
