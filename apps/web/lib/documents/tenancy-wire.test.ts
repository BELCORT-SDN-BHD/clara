// lib/documents/tenancy-reads.ts + tenancy-doors.ts — the #949 tenancy lane's wire shape
// (migration 0300). Pins the argument names, the normalisation at the boundary, and the fresh
// op_key. Both modules live in one cell file because they are one wire: a read whose shape the
// door's own arguments have to match.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getContractTerms, getTenancyRentPlanDraft } from "./tenancy-reads";
import { confirmTenancyRentPlan, confirmTenancyRentPlanRevision, recordContractTerms } from "./tenancy-doors";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

test("getContractTerms: posts p_document and keeps each term's own REGIONS", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({
        document_id: "d1", client_id: "c1", agreement_class: "tenancy",
        terms: [
          {
            id: "t1", term_key: "monthly_rent", amount_cents: "360000", term_date: null,
            escalation: null, printed_raw: "3,600.00", source_extraction_id: "x1",
            source_region_ids: ["r1"], basis_kind: "document_region",
            basis: "the monthly rent this tenancy prints", superseded_at: null, supersede_reason: null,
          },
          {
            id: "t2", term_key: "term_end", amount_cents: null, term_date: "2028-01-04",
            escalation: null, printed_raw: "24", source_extraction_id: "x1",
            source_region_ids: ["r2", "r3"], basis_kind: "derived_from_regions",
            basis: "24 months from the first day", superseded_at: null, supersede_reason: null,
          },
        ],
        history: [],
      });
    },
    async () => {
      const read = await getContractTerms("d1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/get_contract_terms"));
      assert.deepEqual(seenBody, { p_document: "d1" });
      assert.equal(read.agreement_class, "tenancy");
      assert.equal(read.terms.length, 2);
      assert.equal(
        read.terms[0]?.amount_cents,
        360000,
        "a bigint arriving as a STRING is repaired at the boundary, not in a component",
      );
      assert.deepEqual(read.terms[0]?.source_region_ids, ["r1"], "the region travels — it is what the page cites");
      assert.equal(read.terms[1]?.basis_kind, "derived_from_regions", "a derivation says so");
      assert.equal(read.terms[1]?.source_region_ids.length, 2, "…and names BOTH regions it needed");
      assert.deepEqual(read.history, []);
    },
  );
});

test("getContractTerms: an agreement with no recorded term reads as empty arrays, never null", async () => {
  await withMockedFetch(
    async () => jsonResponse({ document_id: "d1", client_id: "c1", agreement_class: "tenancy" }),
    async () => {
      const read = await getContractTerms("d1", { session: fakeSession("tok") });
      assert.deepEqual(read.terms, []);
      assert.deepEqual(read.history, []);
    },
  );
});

test("getTenancyRentPlanDraft: carries the treatment, the basis legs and the inert flag", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (u) => {
      seenUrl = String(u);
      return jsonResponse({
        document_id: "d1", client_id: "c1", agreement_class: "tenancy",
        treatment: {
          drafts: true, framework_code: "MPERS", framework_in_force: "client_exception",
          monthly_rent_cents: "360000", term_start: "2026-01-05", term_end: "2028-01-04",
          term_months: 24, missing_terms: [], standard: "MPERS Section 20",
          basis: "MPERS Section 20 ... MFRS 16 ...", reason: null, question: null,
        },
        plan: {
          kind: "recurring_journal", purpose: "Monthly rent", frequency: "monthly",
          day_rule: "day_of_month", day_of_month: 5, timezone: "Asia/Kuala_Lumpur",
          effective_from: "2026-01-05", effective_to: "2028-01-04", occurrences: 24,
          rent_account_code: "6100", rent_account_name: "Rental of Premises",
          payable_account_code: "2050", payable_account_name: "Rent Payable",
          monthly_rent_cents: "360000",
          basis: {
            posting_date: "2026-01-05", memo: "Monthly rent", currency: "MYR",
            lines: [
              { account_code: "6100", debit_cents: "360000", credit_cents: 0, description: "Monthly rent" },
              { account_code: "2050", debit_cents: 0, credit_cents: "360000", description: "Monthly rent" },
            ],
          },
        },
        refusals: [], confirmed: false, plan_id: null, plan_status: null, inert: true,
      });
    },
    async () => {
      const draft = await getTenancyRentPlanDraft("d1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/get_tenancy_rent_plan_draft"));
      assert.equal(draft.treatment?.drafts, true);
      assert.equal(draft.treatment?.standard, "MPERS Section 20");
      assert.equal(draft.plan?.occurrences, 24);
      assert.equal(draft.plan?.lines.length, 2);
      assert.equal(draft.plan?.lines[0]?.debit_cents, 360000);
      assert.equal(draft.plan?.lines[1]?.credit_cents, 360000);
      assert.equal(draft.plan?.payable_account_name, "Rent Payable");
      assert.equal(draft.inert, true);
      assert.equal(draft.confirmed, false);
    },
  );
});

test("getTenancyRentPlanDraft: a treatment that ASKS carries the question and NO plan", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse({
        document_id: "d1", client_id: "c1", agreement_class: "tenancy",
        treatment: {
          drafts: false, framework_code: "MFRS", framework_in_force: "firm_default",
          monthly_rent_cents: 360000, term_start: "2026-01-05", term_end: "2028-01-04",
          term_months: 24, missing_terms: [], standard: "MFRS 16",
          basis: "…", reason: "mfrs_lease_over_twelve_months",
          question: "MFRS 16 has the lessee recognise a right-of-use asset…",
        },
        plan: null, refusals: [], confirmed: false, plan_id: null, inert: true,
      }),
    async () => {
      const draft = await getTenancyRentPlanDraft("d1", { session: fakeSession("tok") });
      assert.equal(draft.plan, null, "nothing is offered to post when the standard may not admit it");
      assert.equal(draft.treatment?.reason, "mfrs_lease_over_twelve_months");
      assert.match(draft.treatment?.question ?? "", /right-of-use asset/);
    },
  );
});

test("recordContractTerms: posts the whole term set at once, with a fresh op_key", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ document_id: "d1", client_id: "c1", recorded: 1, superseded: 0, terms: [] });
    },
    async () => {
      await recordContractTerms(
        {
          clientId: "c1", documentId: "d1",
          terms: [{
            term_key: "monthly_rent", amount_cents: 360000, basis_kind: "document_region",
            source_region_ids: ["r1"], basis: "as read",
          }],
        },
        { session: fakeSession("tok") },
      );
      assert.ok(seenUrl.includes("/rpc/record_contract_terms"));
      assert.equal(seenBody.p_client, "c1");
      assert.equal(seenBody.p_document, "d1");
      assert.equal((seenBody.p_terms as unknown[]).length, 1);
      assert.equal(typeof seenBody.p_op_key, "string");
    },
  );
});

test("confirmTenancyRentPlan: sends p_judgement EXPLICITLY, null included, with a fresh op_key", async () => {
  const seen: Record<string, unknown>[] = [];
  await withMockedFetch(
    async (u, init) => {
      seen.push({ url: String(u), body: JSON.parse(String(init?.body)) });
      return jsonResponse({ plan_id: "p1", confirmation_id: "cf1", status: "active" });
    },
    async () => {
      await confirmTenancyRentPlan({ clientId: "c1", documentId: "d1" }, { session: fakeSession("tok") });
      await confirmTenancyRentPlan(
        { clientId: "c1", documentId: "d1", payableAccount: "2020", judgement: "short-term in substance" },
        { session: fakeSession("tok") },
      );
      const first = seen[0]?.body as Record<string, unknown>;
      const second = seen[1]?.body as Record<string, unknown>;
      assert.ok(String(seen[0]?.url).includes("/rpc/confirm_tenancy_rent_plan"));
      assert.equal(first.p_judgement, null, "null is an ANSWER on this wire, never an omitted key");
      assert.ok("p_rent_account" in first && "p_payable_account" in first);
      assert.equal(second.p_payable_account, "2020");
      assert.equal(second.p_judgement, "short-term in substance");
      assert.notEqual(first.p_op_key, second.p_op_key, "a fresh key per click");
    },
  );
});

test("confirmTenancyRentPlanRevision: its own door, its own arguments", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ plan_id: "p1", revision: 2, from_cents: 360000, to_cents: 396000 });
    },
    async () => {
      const r = await confirmTenancyRentPlanRevision(
        { clientId: "c1", documentId: "d1", judgement: "tracks CPI" },
        { session: fakeSession("tok") },
      );
      assert.ok(seenUrl.includes("/rpc/confirm_tenancy_rent_plan_revision"));
      assert.equal(seenBody.p_judgement, "tracks CPI");
      assert.equal(r.revision, 2);
      assert.equal(r.to_cents, 396000);
    },
  );
});
