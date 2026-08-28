import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadCounterparties, loadCounterpartyAliases, loadCounterpartyOpenItems,
  loadOpenItemAllocationsForItems, unallocateCandidateGroups, getCustomerStatement,
  getSupplierStatement, domainForKind, loadCounterpartyMergePreview,
  type OpenItemAllocationRow,
} from "./counterparty";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
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

test("loadCounterparties: reads counterparties scoped by client_id + kind, name ascending", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadCounterparties(fakeSession("tok"), "c1", "vendor");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/counterparties\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /kind=eq\.vendor/);
  assert.match(seenUrl, /order=name\.asc/);
});

test("loadCounterpartyAliases: reads counterparty_aliases scoped by client_id only (every counterparty's aliases at once)", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadCounterpartyAliases(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/counterparty_aliases\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.doesNotMatch(seenUrl, /counterparty_id=/);
});

test("loadCounterpartyOpenItems: reads open_items scoped by client_id + domain + counterparty_id, item_date ascending", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadCounterpartyOpenItems(fakeSession("tok"), "c1", "ar", "cp1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/open_items\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /domain=eq\.ar/);
  assert.match(seenUrl, /counterparty_id=eq\.cp1/);
  assert.match(seenUrl, /order=item_date\.asc/);
});

test("loadOpenItemAllocationsForItems: empty itemIds short-circuits to [] with NO network call", async () => {
  let called = false;
  await withMockedFetch(
    async () => {
      called = true;
      return jsonResponse([], 200);
    },
    async () => {
      const rows = await loadOpenItemAllocationsForItems(fakeSession("tok"), "c1", []);
      assert.deepEqual(rows, []);
    },
  );
  assert.equal(called, false, "an empty itemIds list must never reach fetch — item_id=in.() is malformed PostgREST syntax");
});

test("loadOpenItemAllocationsForItems: a non-empty itemIds list filters item_id=in.(...)", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadOpenItemAllocationsForItems(fakeSession("tok"), "c1", ["i1", "i2"]);
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/open_item_allocations\?/);
  assert.match(seenUrl, /item_id=in\.%28i1%2Ci2%29/);
});

test("getCustomerStatement: POSTs /rpc/customer_statement with p_client/p_counterparty/p_from/p_to", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ counterparty_id: "cp1", domain: "ar", from: null, to: "2026-08-28", opening_balance_cents: 0, rows: [], closing_balance_cents: 0 }, 200);
    },
    async () => {
      await getCustomerStatement("c1", "cp1", null, "2026-08-28", { session: fakeSession("tok") });
    },
  );
  assert.match(seenUrl, /\/rpc\/customer_statement$/);
  assert.deepEqual(seenBody, { p_client: "c1", p_counterparty: "cp1", p_from: null, p_to: "2026-08-28" });
});

test("getSupplierStatement: POSTs /rpc/supplier_statement", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse({ counterparty_id: "cp1", domain: "ap", from: null, to: "2026-08-28", opening_balance_cents: 0, rows: [], closing_balance_cents: 0 }, 200);
    },
    async () => {
      await getSupplierStatement("c1", "cp1", null, "2026-08-28", { session: fakeSession("tok") });
    },
  );
  assert.match(seenUrl, /\/rpc\/supplier_statement$/);
});

test("domainForKind: customer -> ar, vendor -> ap", () => {
  assert.equal(domainForKind("customer"), "ar");
  assert.equal(domainForKind("vendor"), "ap");
});

function allocRow(over: Partial<OpenItemAllocationRow>): OpenItemAllocationRow {
  return {
    id: "a0", client_id: "c1", domain: "ar", item_id: "i0", application_group: "g0",
    operation_kind: "apply", reverses_allocation_id: null, amount_cents: 100,
    reason: "r", created_by: "u1", created_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

test("unallocateCandidateGroups: groups rows by application_group, keeping every row in its group (never summed)", () => {
  const rows = [
    allocRow({ id: "a1", application_group: "g1", amount_cents: 500 }),
    allocRow({ id: "a2", application_group: "g1", amount_cents: -500 }),
    allocRow({ id: "a3", application_group: "g2", amount_cents: 200 }),
  ];
  const groups = unallocateCandidateGroups(rows);
  assert.equal(groups.length, 2);
  const g1 = groups.find((g) => g.application_group === "g1");
  assert.equal(g1?.rows.length, 2);
  assert.deepEqual(g1?.rows.map((r) => r.amount_cents).sort(), [-500, 500]);
});

test("unallocateCandidateGroups: excludes an 'unallocate' row's own group (it is already a negation, never a candidate)", () => {
  const rows = [allocRow({ id: "a1", application_group: "g1", operation_kind: "unallocate", reverses_allocation_id: "a0" })];
  assert.deepEqual(unallocateCandidateGroups(rows), []);
});

test("unallocateCandidateGroups: excludes a group whose row has ALREADY been reversed (visible in the same read)", () => {
  const rows = [
    allocRow({ id: "a1", application_group: "g1" }),
    allocRow({ id: "a2", application_group: "g2", operation_kind: "unallocate", reverses_allocation_id: "a1" }),
  ];
  const groups = unallocateCandidateGroups(rows);
  // g1's own row (a1) is reversed -> g1 is not a candidate. g2 is itself an
  // 'unallocate' row -> excluded by the operation_kind filter above.
  assert.deepEqual(groups, []);
});

test("loadCounterpartyMergePreview: THREE parallel fresh reads (counterparties + aliases + aging), assembled with no computed figure", async () => {
  const calls: string[] = [];
  await withMockedFetch(
    async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/rest/v1/counterparties?")) {
        return jsonResponse(
          [
            { id: "survivor", firm_id: "f1", client_id: "c1", kind: "vendor", name: "Acme", name_normalized: "acme", registration_no: null, tin: null, payment_terms_days: 30, merged_into: null, retired_at: null, created_at: "t", updated_at: "t" },
            { id: "merged", firm_id: "f1", client_id: "c1", kind: "vendor", name: "Acme Sdn Bhd", name_normalized: "acmesdnbhd", registration_no: null, tin: null, payment_terms_days: null, merged_into: null, retired_at: null, created_at: "t", updated_at: "t" },
          ],
          200,
        );
      }
      if (u.includes("/rest/v1/counterparty_aliases?")) return jsonResponse([], 200);
      if (u.includes("/rpc/ap_aging")) {
        return jsonResponse({ as_of: "2026-08-28", domain: "ap", counterparties: [{ counterparty_id: "merged", counterparty_name: "Acme Sdn Bhd", current_cents: 1000, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 1000, items: [] }], totals: {} }, 200);
      }
      throw new Error(`unexpected fetch: ${u}`);
    },
    async () => {
      const preview = await loadCounterpartyMergePreview(fakeSession("tok"), "c1", "vendor", "survivor", "merged", "2026-08-28");
      assert.equal(preview.domain, "ap");
      assert.equal(preview.survivor.counterparty.name, "Acme");
      assert.equal(preview.survivor.aging, null, "the survivor carries no outstanding items in this fixture — a real DB-confirmed absence, not a guess");
      assert.equal(preview.merged.aging?.total_cents, 1000, "the merged side's outstanding figure is the FRESH aging read's own value, never computed here");
    },
  );
  assert.equal(calls.length, 3, "exactly three reads: counterparties, counterparty_aliases, ap_aging");
});

test("loadCounterpartyMergePreview: throws if the fresh counterparties read is missing one of the two ids (never a guessed/partial preview)", async () => {
  await withMockedFetch(
    async (url) => {
      const u = String(url);
      if (u.includes("/rest/v1/counterparties?")) return jsonResponse([], 200);
      if (u.includes("/rest/v1/counterparty_aliases?")) return jsonResponse([], 200);
      if (u.includes("/rpc/ap_aging")) return jsonResponse({ as_of: "2026-08-28", domain: "ap", counterparties: [], totals: {} }, 200);
      throw new Error(`unexpected fetch: ${u}`);
    },
    async () => {
      await assert.rejects(() => loadCounterpartyMergePreview(fakeSession("tok"), "c1", "vendor", "survivor", "merged", "2026-08-28"));
    },
  );
});
