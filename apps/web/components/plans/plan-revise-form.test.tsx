// #936 — THE GENERIC PLAN REVISION IS NOT THE ROAD TO AN ACCRUAL'S FIGURES.
//
// #936's first sentence is the defect: "Changing an accrual's amount no longer leaves the books
// contradicting themselves. Today the only way to change an accrual's amount is the generic plan
// revision door … while the accrual's own detail row … stays at the first revision." The dedicated
// door `clara.correct_accrual_adjustment` (0284) closed the DATABASE half and the accrual surface
// grew a correction form — but the generic revise route stayed open, and
// `clara.revise_accounting_plan` accepts an accrual's plan happily: it knows nothing about
// accruals. A bookkeeper reaching the plan from the Plans register could still write exactly the
// contradiction the ticket exists to end.
//
// This battery holds the wall at the only surface that can START that act. The discriminator is
// `clara.accrual_adjustments.plan_id` read through `list_accrual_adjustments` — the plan read
// carries no such field, and `kind` cannot stand in for it, because an accrual's plan is a
// `reversing_journal` and so is an ordinary reversing journal nobody configured from an accrual
// (MEASURED on the lane rig: 115 reversing plans with an accrual, 3 without).
//
// THE THREE STATES, one cell each: accrual-backed (no form, the correction named), not
// accrual-backed (the form), and an accruals read that FAILED (no form, the read failure said).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { PlanReviseForm } from "./plan-revise-form";

enableDomInspection();

const CLIENT = "11111111-2222-4333-8444-555555555555";
const PLAN = "22222222-3333-4444-8555-666666666666";
const ACCRUAL = "44444444-5555-4666-8777-888888888888";
const WORK = "33333333-4444-4555-8666-777777777777";

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

/** The app-router context `PlanForm`'s own `useRouter()` needs to mount at all — the provider
 *  shape `components/app-shell/app-breadcrumb.test.tsx` uses. Without it the CONTROL cell below
 *  could not tell "the form did not render because this plan is accrual-backed" from "the form
 *  threw". */
function app(node: ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      { value: { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} } as never },
      createElement("div", null, createElement("h1", null, "Plans"), node),
    ),
  });
}

type Node = { tagName?: string; childNodes?: unknown[]; getAttribute?: (k: string) => string | null };

/** Every `<a href>` in the rendered tree, in document order — the reader
 *  `plans-render-states.test.tsx` uses, so a link assertion reads alike on both surfaces. */
function hrefs(container: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.tagName === "A") {
      const href = n.getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of (n.childNodes as Node[] | undefined) ?? []) walk(c);
  };
  walk(container);
  return out;
}

/** A `fetch` that answers each RPC verb from a table, and 404s anything else LOUDLY. Rows for
 *  `/rest/v1/...` reads the form makes are answered empty so the FORM can mount. */
function rpcRouter(answers: Record<string, unknown>, stat: Record<string, number> = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    for (const [verb, body] of Object.entries(answers)) {
      if (url.includes(`/rpc/${verb}`)) return jsonResponse(body, stat[verb] ?? 200);
    }
    if (url.includes("/rest/v1/")) return jsonResponse([]);
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
}

const PLAN_DETAIL = {
  plan_id: PLAN,
  client_id: CLIENT,
  kind: "reversing_journal",
  status: "active",
  purpose: "Monthly audit fee accrual",
  authority_kind: "explicit_instruction",
  authority_ref: { kind: "accounting_work", id: WORK },
  authorised_by: "u1",
  authorised_at: "2026-09-01T00:00:00Z",
  authority_from: "2026-07-01",
  covered_through: "2026-09-30",
  created_by: "u1",
  created_at: "2026-09-01T00:00:00Z",
  paused_at: null, paused_by: null, paused_reason: null,
  ended_at: null, ended_by: null, ended_reason: null,
  current_revision: 1,
  live_revision: {
    revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-07-01", effective_to: "2026-08-31",
    basis: {
      posting_date: "2026-07-01", memo: "audit fee", currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "fee" },
        { account_code: "2100", debit_cents: 0, credit_cents: 120000, description: "accrual" },
      ],
    },
    basis_digest: "a".repeat(64), auto_reverse: true, reversal_day_rule: "first_day_of_next_month",
  },
  revisions: [],
};

/** The accrual row #936 writes for that plan, as `list_accrual_adjustments` returns it. */
const ACCRUAL_ROW = {
  accrual_id: ACCRUAL,
  plan_id: PLAN,
  revision: 1,
  purpose: "Monthly audit fee accrual",
  expense_account_code: "6100",
  liability_account_code: "2100",
  amount_cents: 120000,
  currency: "MYR",
  effective_from: "2026-07-01",
  effective_to: "2026-08-31",
  service_period_start: "2026-07-01",
  service_period_end: "2026-08-31",
  term_source: "human_stated",
  method: { rule: "stated_amount" },
  document_service_period_id: null,
  source_document_id: null,
  plan_status: "active",
  plan_kind: "reversing_journal",
  recorded_by: "u1",
  created_at: "2026-09-01T00:00:00Z",
};

async function drive(run: (h: Awaited<ReturnType<typeof renderComponent>>) => void): Promise<void> {
  const h = await renderComponent(app(createElement(PlanReviseForm, { clientId: CLIENT, planId: PLAN })));
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    run(h);
  } finally {
    await h.unmount();
    for (let i = 0; i < 3; i++) await h.settle();
  }
}

test("plans.revise — ticket 936: an ACCRUAL-BACKED plan renders no revision form; it names the correction and links to it", async () => {
  await withMockedEnv(rpcRouter({
    get_accounting_plan: PLAN_DETAIL,
    list_accrual_adjustments: { client_id: CLIENT, accruals: [ACCRUAL_ROW] },
  }), async () => {
    await drive((h) => {
      const text = h.text();
      assert.match(text, /figures are stated on an accrual/,
        `the surface must SAY why it will not revise here; got: ${text}`);
      // WHAT WOULD GO WRONG, in the words of the books rather than of the schema.
      assert.match(text, /the accrual's own record kept the old figures/);
      assert.ok(
        hrefs(h.container).includes(`/clients/${CLIENT}/accruals/${ACCRUAL}/correct`),
        `the correction door is named and reachable; got ${JSON.stringify(hrefs(h.container))}`,
      );
      // AND THE FORM IS NOT THERE. A form that can write the contradiction is not made safe by a
      // warning printed above it.
      assert.doesNotMatch(text, /Save as a new revision/,
        "no revision form may render for a plan an accrual's figures are stated on");
    });
  });
});

test("plans.revise — a plan NO accrual is stated on still renders the revision form, unchanged", async () => {
  await withMockedEnv(rpcRouter({
    get_accounting_plan: { ...PLAN_DETAIL, kind: "recurring_journal", purpose: "Monthly office rent" },
    list_accrual_adjustments: { client_id: CLIENT, accruals: [] },
  }), async () => {
    await drive((h) => {
      const text = h.text();
      assert.doesNotMatch(text, /figures are stated on an accrual/,
        "an ordinary plan must not be told to go and correct an accrual it has not got");
      assert.doesNotMatch(text, /This plan cannot be revised/);
      assert.match(text, /Save as a new revision/, `the revision form renders; got: ${text}`);
    });
  });
});

test("plans.revise — when the accruals read FAILS the form does not render: a surface that cannot tell must not choose the risky answer", async () => {
  await withMockedEnv(rpcRouter(
    {
      get_accounting_plan: PLAN_DETAIL,
      list_accrual_adjustments: { message: "permission denied for function list_accrual_adjustments" },
    },
    { list_accrual_adjustments: 403 },
  ), async () => {
    await drive((h) => {
      const text = h.text();
      assert.match(text, /can't read this yet/,
        `the failed read is classified and said; got: ${text}`);
      assert.doesNotMatch(text, /permission denied for function/,
        "an internal function name must never reach the screen");
      assert.doesNotMatch(text, /Save as a new revision/,
        "the form must not render over a read that did not succeed — it is the read that tells this route whether revising here would contradict the books");
    });
  });
});
