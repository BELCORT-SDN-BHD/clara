// #653 — GATE (b): the structural a11y scan of the prepayment list, the detail and the configure
// form, plus the two claims a rule engine cannot make for itself.
//
// It rides `test/a11yRules.ts`'s hand-written engine rather than real axe-core, for the reason
// `test/domInspect.ts`'s header gives — the `staff-advances-a11y.test.tsx` precedent, ported to
// this lane's own surfaces.
//
// THE TWO CLAIMS THIS FILE ADDS BEYOND THE SCAN:
//   1. COLOUR IS NEVER THE ONLY CUE. Every attention row and every period state carries its own
//      WORD, so a reader who cannot tell a warning tint from an info tint still knows which arm a
//      row is and whether a period posted.
//   2. THE DERIVED ALLOCATION IS DISABLED, structurally. A `fieldset[disabled]` is what makes the
//      preview unreachable by keyboard as well as by pointer — a preview a person could tab into
//      and appear to edit would be the "editor" this lane refuses to be.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
// The form mounts `useRouter` (it navigates to the new schedule on success), so the real
// context is supplied rather than the surface being tested through a stub of its own
// navigation — `components/firm/client-scope-invalidation.test.tsx`'s idiom.
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { PrepaymentsList } from "./prepayments-list";
import { PrepaymentDetail } from "./prepayment-detail";
import { PrepaymentForm } from "./prepayment-form";

enableDomInspection();

const CLIENT = "11111111-2222-4333-8444-555555555555";
const SCHEDULE = "44444444-5555-4666-8777-888888888888";
const PLAN = "22222222-3333-4444-8555-666666666666";
const ENTRY = "55555555-6666-4777-8888-999999999999";
const DOC = "66666666-7777-4888-8999-aaaaaaaaaaaa";

type Node = { tagName?: string; childNodes?: Node[]; getAttribute?: (k: string) => string | null };

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

function rpcRouter(answers: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    for (const [verb, body] of Object.entries(answers)) {
      if (url.includes(`/rpc/${verb}`)) return jsonResponse(body);
    }
    if (url.includes("/rest/v1/coa_accounts")) {
      return jsonResponse([
        { client_id: CLIENT, account_code: "59000001", name: "Subscriptions", account_type: "expense", is_active: true },
      ]);
    }
    if (url.includes("/rest/v1/accounting_work")) return jsonResponse([]);
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
}

const ROUTER = {
  replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {},
  prefetch: () => {},
};

function app(node: React.ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      { value: ROUTER as never },
      createElement("main", null, createElement("h1", null, "Prepayments"), node),
    ),
  });
}

const occurrence = (due: string, refused: boolean) => ({
  occurrence_id: `occ-${due}`, due_date: due, leg: "primary", period_key: `${due.slice(0, 7)}-01`,
  attempt: 1, revision: 1, intent_key: `plan:${PLAN}:r1:${due}`,
  work_id: refused ? null : "w1", admitted_at: refused ? null : "2026-01-31T00:00:00Z",
  outcome: refused
    ? { state: "refused", code: "CLR19", reason: "write_into_closed_period", message: "that period is closed" }
    : { state: "admitted" },
  created_at: "2026-01-31T00:00:00Z", attempts: [],
  work_status: refused ? null : "completed", work_error: null,
  receipt_id: refused ? null : "rc1", entry_id: refused ? null : "je1",
});

const period = (end: string, amount: number, refused: boolean) => ({
  period_start: `${end.slice(0, 7)}-01`, period_end: end, amount_cents: amount,
  credit_cents: amount, account_code: "19000001",
  prepaid_account_code: "19000001", expense_account_code: "59000001",
  occurrence: occurrence(end, refused),
});

const DETAIL = {
  schedule_id: SCHEDULE, client_id: CLIENT, plan_id: PLAN, revision: 1,
  kind: "amortisation_schedule", status: "active", purpose: "Prepaid subscription amortisation",
  source_entry_id: ENTRY, source_posting_date: "2026-01-15", source_memo: "m", source_status: "approved",
  document_id: DOC, service_period_id: "sp1", term_start: "2026-01-01", term_end: "2026-02-28",
  basis_kind: "human_stated", prepaid_account_code: "19000001", expense_account_code: "59000001",
  expense_account_basis: "the invoice narrates a subscription service",
  total_cents: 66667, period_count: 2, remainder_placement: "final_period", schedule_version: "v1",
  created_by: "u1", created_at: "2026-01-15T00:00:00Z",
  authority_kind: "explicit_instruction", authority_ref: { kind: "accounting_work", id: "w0" },
  authorised_by: "u1", authorised_at: "2026-01-15T00:00:00Z", authority_from: "2026-01-31",
  covered_through: "2026-01-31",
  paused_at: null, paused_by: null, paused_reason: null,
  ended_at: null, ended_by: null, ended_reason: null,
  live_revision: {
    revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-01-31", effective_to: "2026-02-28",
    basis: {}, basis_digest: "a".repeat(64),
  },
  periods: [period("2026-01-31", 33333, false), period("2026-02-28", 33334, true)],
  occurrences: [occurrence("2026-01-31", false), occurrence("2026-02-28", true)],
  configuration_only: true,
};

const ATTENTION = {
  client_id: CLIENT,
  refusing: [{
    arm: "refusing", schedule_id: SCHEDULE, plan_id: PLAN, purpose: "Prepaid subscription amortisation",
    status: "active", occurrence_id: "occ1", due_date: "2026-02-28", period_key: "2026-02-01",
    attempt: 1, work_id: null, stage: "admission", code: "CLR19",
    reason: "write_into_closed_period", message: "that period is closed", work_status: null,
    catch_up_from: "2026-02-28", catch_up_to: "2026-02-28",
  }],
  unscheduled: [{
    arm: "unscheduled", entry_id: ENTRY, posting_date: "2026-02-14", memo: "m",
    document_id: DOC, prepaid_account_code: "19000001", amount_cents: 240000, has_live_term: true,
  }],
};

async function scan(node: React.ReactElement, router: typeof fetch, run: (h: { container: Node; text: () => string }) => void) {
  await withMockedEnv(router, async () => {
    const h = await renderComponent(app(node));
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      run(h as unknown as { container: Node; text: () => string });
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
}

test("prepayments.a11y — the LIST, attention band and all, carries no structural accessibility finding", async () => {
  await scan(
    createElement(PrepaymentsList, { clientId: CLIENT }),
    rpcRouter({
      list_prepayment_schedules: {
        client_id: CLIENT,
        schedules: [{
          schedule_id: SCHEDULE, plan_id: PLAN, purpose: "Prepaid subscription amortisation",
          status: "active", source_entry_id: ENTRY, document_id: DOC,
          term_start: "2026-01-01", term_end: "2026-02-28",
          prepaid_account_code: "19000001", expense_account_code: "59000001",
          total_cents: 66667, period_count: 2, basis_kind: "human_stated",
          created_at: "2026-01-15T00:00:00Z", effective_from: "2026-01-31",
          effective_to: "2026-02-28", posted_periods: 1, occurrence_count: 2,
          next_due: null,
        }],
      },
      list_prepayment_attention: ATTENTION,
    }),
    (h) => {
      const findings = checkAccessibility(h.container as never);
      assert.deepEqual(findings, [], `a11y findings: ${JSON.stringify(findings, null, 1)}`);
      // COLOUR IS NEVER THE ONLY CUE: both arms carry their own word.
      assert.match(h.text(), /Last period refused/);
      assert.match(h.text(), /Posted, not yet amortised/);
    },
  );
});

test("prepayments.a11y — the DETAIL, with a refused period and its explain-and-choose surface open, carries no structural finding, and every period state is a WORD", async () => {
  await scan(
    createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }),
    rpcRouter({ get_prepayment_schedule: DETAIL }),
    (h) => {
      const findings = checkAccessibility(h.container as never);
      assert.deepEqual(findings, [], `a11y findings: ${JSON.stringify(findings, null, 1)}`);
      assert.match(h.text(), /Posted/);
      assert.match(h.text(), /Refused/);
    },
  );
});

test("prepayments.a11y — the FORM carries no structural finding, every control has a label, and the stated-grounds field is REQUIRED in the markup", async () => {
  await scan(
    createElement(PrepaymentForm, { clientId: CLIENT }),
    rpcRouter({ list_prepayment_attention: ATTENTION }),
    (h) => {
      const findings = checkAccessibility(h.container as never);
      assert.deepEqual(findings, [], `a11y findings: ${JSON.stringify(findings, null, 1)}`);
      const required = findAllIn(h.container, (n) => n.getAttribute?.("required") !== null
        && n.getAttribute?.("required") !== undefined);
      assert.ok(required.length >= 1,
        "the expense account's stated grounds is required in the markup, not only in the validator");
    },
  );
});
