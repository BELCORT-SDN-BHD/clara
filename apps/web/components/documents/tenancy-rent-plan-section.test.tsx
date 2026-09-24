// components/documents/tenancy-rent-plan-section.tsx — #949 (AC8). Mounted for real via
// test/hookHarness.ts's `renderComponent`:
//   - a tenancy's terms render WITH THE REGION each one came from, and a derivation says it is
//     one rather than passing itself off as a reading;
//   - the drafted plan renders its two legs and its schedule, and Confirm posts
//     confirm_tenancy_rent_plan;
//   - a treatment that ASKS renders the question, offers NO plan, and refuses to enable Confirm
//     until a written judgement is typed — the gate prompts, it never disables;
//   - a refusal from the confirm door renders VISIBLY, never silently un-busies;
//   - a page that is not a tenancy renders nothing at all rather than an empty panel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import { TenancyRentPlanSection } from "./tenancy-rent-plan-section";
import messages from "../../messages/en.json";

enableDomInspection();

type Node = {
  tagName?: string;
  childNodes?: Node[];
  getAttribute?: (k: string) => string | null;
};

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
    locale: "en",
    messages,
    children: createElement(TenancyRentPlanSection, { clientId: "c1", documentId: "d1" }),
  });
}

const TERMS = {
  document_id: "d1", client_id: "c1", agreement_class: "tenancy",
  terms: [
    {
      id: "t1", term_key: "monthly_rent", amount_cents: 360000, term_date: null, escalation: null,
      printed_raw: "3,600.00", source_extraction_id: "x1", source_region_ids: ["r-rent"],
      basis_kind: "document_region", basis: "the monthly rent this tenancy prints",
      superseded_at: null, supersede_reason: null,
    },
    {
      id: "t2", term_key: "deposit", amount_cents: 720000, term_date: null, escalation: null,
      printed_raw: "7,200.00", source_extraction_id: "x1", source_region_ids: ["r-dep"],
      basis_kind: "document_region", basis: "the deposit this tenancy states",
      superseded_at: null, supersede_reason: null,
    },
    {
      id: "t3", term_key: "term_end", amount_cents: null, term_date: "2028-01-04", escalation: null,
      printed_raw: "24", source_extraction_id: "x1", source_region_ids: ["r-date", "r-months"],
      basis_kind: "derived_from_regions", basis: "24 months from the first day, the last day included",
      superseded_at: null, supersede_reason: null,
    },
  ],
  history: [],
};

const DRAFTS = {
  document_id: "d1", client_id: "c1", agreement_class: "tenancy",
  treatment: {
    drafts: true, framework_code: "MPERS", framework_in_force: "client_exception",
    monthly_rent_cents: 360000, term_start: "2026-01-05", term_end: "2028-01-04",
    term_months: 24, missing_terms: [], standard: "MPERS Section 20",
    basis: "MPERS Section 20: a lessee expenses operating-lease payments on a straight-line basis.",
    reason: null, question: null,
  },
  plan: {
    kind: "recurring_journal", purpose: "Monthly rent", frequency: "monthly",
    day_rule: "day_of_month", day_of_month: 5, timezone: "Asia/Kuala_Lumpur",
    effective_from: "2026-01-05", effective_to: "2028-01-04", occurrences: 24,
    rent_account_code: "6100", rent_account_name: "Rental of Premises",
    payable_account_code: "2050", payable_account_name: "Rent Payable",
    monthly_rent_cents: 360000,
    basis: {
      posting_date: "2026-01-05", memo: "Monthly rent", currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 360000, credit_cents: 0, description: "Monthly rent" },
        { account_code: "2050", debit_cents: 0, credit_cents: 360000, description: "Monthly rent" },
      ],
    },
  },
  refusals: [], confirmed: false, plan_id: null, plan_status: null, inert: true,
};

const ASKS = {
  ...DRAFTS,
  treatment: {
    ...DRAFTS.treatment, drafts: false, framework_code: "MFRS", standard: "MFRS 16",
    reason: "mfrs_lease_over_twelve_months",
    question: "These accounts are prepared on MFRS and this lease runs 24 months. MFRS 16 has the "
      + "lessee recognise a right-of-use asset and a lease liability.",
  },
  plan: null,
};

function routed(terms: unknown, draft: unknown, onConfirm?: () => Response) {
  return async (u: RequestInfo | URL): Promise<Response> => {
    const url = String(u);
    if (url.includes("/rpc/get_contract_terms")) return jsonResponse(terms);
    if (url.includes("/rpc/get_tenancy_rent_plan_draft")) return jsonResponse(draft);
    if (url.includes("/rpc/confirm_tenancy_rent_plan")) {
      return onConfirm ? onConfirm() : jsonResponse({ plan_id: "p1", confirmation_id: "cf1", status: "active" });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

async function mountAndSettle() {
  const h = await renderComponent(App());
  for (let i = 0; i < 4; i++) await h.settle();
  return h;
}

function byTestId(h: Awaited<ReturnType<typeof renderComponent>>, id: string): Node | null {
  let found: Node | null = null;
  function walk(n: Node) {
    if (found) return;
    if (n.getAttribute?.("data-testid") === id) { found = n; return; }
    for (const c of n.childNodes ?? []) walk(c);
  }
  walk(h.container as unknown as Node);
  return found;
}

test("p949.web.terms · every term renders with the region it was read from, and a derivation says it is one", async () => {
  await withMockedEnv(routed(TERMS, DRAFTS), async () => {
    const h = await mountAndSettle();
    const body = textOf(h.container as never);

    assert.match(body, /Tenancy terms and rent plan/);
    assert.match(body, /Monthly rent/);
    assert.match(body, /RM 3,600\.00/, "the figure the page prints, as money");
    assert.match(body, /as printed: 3,600\.00/, "…beside the VERBATIM rendering the tenancy carries");
    assert.match(body, /RM 7,200\.00/);
    assert.match(body, /2028-01-04/);

    const rent = byTestId(h, "contract-term-monthly_rent");
    assert.ok(rent, "the rent term renders");
    assert.equal(
      rent!.getAttribute?.("data-region-ids"),
      "r-rent",
      "the region it cites is ON the element, so the overlay and a walk can both find it",
    );
    assert.match(textOf(rent as never), /Read from the page/);
    assert.match(textOf(rent as never), /1 region on the page/);

    const end = byTestId(h, "contract-term-term_end");
    assert.equal(end!.getAttribute?.("data-region-ids"), "r-date r-months");
    assert.match(
      textOf(end as never),
      /Derived from what the page prints/,
      "a DERIVATION never passes itself off as a reading",
    );
    assert.match(textOf(end as never), /2 regions on the page/);
  });
});

test("p949.web.draft · the drafted plan shows its schedule and BOTH legs, crediting the payable", async () => {
  await withMockedEnv(routed(TERMS, DRAFTS), async () => {
    const h = await mountAndSettle();
    const plan = byTestId(h, "tenancy-plan-draft");
    assert.ok(plan, "the draft renders");
    const text = textOf(plan as never);
    assert.match(text, /RM 3,600\.00 a month, from 2026-01-05 to 2028-01-04 \(24 months\)/);
    assert.match(text, /Debit 6100 RM 3,600\.00/);
    assert.match(text, /Credit 2050 RM 3,600\.00/);
    assert.doesNotMatch(text, /Credit 1010/, "no leg credits a bank account");
    assert.match(textOf(byTestId(h, "tenancy-treatment") as never), /MPERS Section 20/);
  });
});

test("p949.web.confirm · Confirm posts confirm_tenancy_rent_plan with this client and document", async () => {
  const bodies: Record<string, unknown>[] = [];
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rpc/confirm_tenancy_rent_plan")) {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ plan_id: "p1", confirmation_id: "cf1", status: "active" });
      }
      return routed(TERMS, DRAFTS)(u);
    },
    async () => {
      const h = await mountAndSettle();
      await clickButton(byTestId(h, "tenancy-confirm-plan") as never);
      for (let i = 0; i < 4; i++) await h.settle();
      assert.equal(bodies.length, 1, "exactly one confirmation per click");
      assert.equal(bodies[0]?.p_client, "c1");
      assert.equal(bodies[0]?.p_document, "d1");
      assert.equal(bodies[0]?.p_judgement, null, "no judgement is owed when the branch drafts");
      assert.equal(typeof bodies[0]?.p_op_key, "string");
    },
  );
});

test("p949.web.asks · a treatment that ASKS shows the question, offers NO plan, and holds Confirm until a judgement is written", async () => {
  await withMockedEnv(routed(TERMS, ASKS), async () => {
    const h = await mountAndSettle();
    assert.equal(byTestId(h, "tenancy-plan-draft"), null, "nothing is offered to post");
    assert.match(
      textOf(byTestId(h, "tenancy-question") as never),
      /right-of-use asset/,
      "the standard's own question is what a person reads instead",
    );
    assert.ok(byTestId(h, "tenancy-judgement"), "a place to write the judgement is offered — the gate PROMPTS");
    assert.ok(byTestId(h, "tenancy-judgement-required"), "…and says why Confirm is not live yet");
    const button = byTestId(h, "tenancy-confirm-plan");
    assert.equal((button as unknown as { disabled?: boolean }).disabled, true, "Confirm is held, not hidden");
  });
});

test("p949.web.refusal · a refusal from the confirm door renders VISIBLY, with its code", async () => {
  await withMockedEnv(
    routed(TERMS, DRAFTS, () =>
      jsonResponse(
        { code: "CLR10", message: "a rent plan may not credit 1010", details: JSON.stringify({ reason: "plan_credits_bank_account" }) },
        400,
      )),
    async () => {
      const h = await mountAndSettle();
      await clickButton(byTestId(h, "tenancy-confirm-plan") as never);
      for (let i = 0; i < 4; i++) await h.settle();
      const body = textOf(h.container as never);
      assert.match(body, /may not credit 1010/, "the database's own sentence, never re-worded");
      assert.match(body, /CLR10/, "…and its code");
    },
  );
});

test("p949.web.notATenancy · a hire purchase renders no panel at all, rather than an empty one", async () => {
  await withMockedEnv(
    routed(
      { document_id: "d1", client_id: "c1", agreement_class: "hire_purchase", terms: [], history: [] },
      {
        document_id: "d1", client_id: "c1", agreement_class: "hire_purchase",
        treatment: null, plan: null,
        refusals: [{ reason: "not_a_tenancy", detail: { agreement_class: "hire_purchase" } }],
        confirmed: false, plan_id: null, inert: true,
      },
    ),
    async () => {
      const h = await mountAndSettle();
      assert.equal(byTestId(h, "tenancy-rent-plan-panel"), null, "a panel headed Tenancy on a hire purchase is a lie the layout tells");
    },
  );
});
