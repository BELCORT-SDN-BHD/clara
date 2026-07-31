// shared/agingApi.ts tests — mocks globalThis.fetch (the bankApi.test.ts /
// counterpartyApi.test.ts idiom). [D1 fix + fix-wave item 4] fixtures here
// are copied LITERALLY from the jsonb_build_object key sets in
// packages/db/migrations/0040_wave_c_c_tieout.sql (_aging_core:3494-3508,
// _statement_core:3576-3588) — not guessed shapes — so a future drift in
// those keys fails a test here, not just in the running app.

import { test } from "node:test";
import assert from "node:assert/strict";
import { arAging, apAging, customerStatement, supplierStatement } from "./agingApi";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function setup() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
}

// The LITERAL _aging_core envelope (0040:3494-3508).
const AGING_ENVELOPE = {
  as_of: "2026-07-31", domain: "ap",
  counterparties: [
    {
      counterparty_id: "cp1", counterparty_name: "Acme Sdn Bhd",
      current_cents: 0, d31_60_cents: 5000000, d61_90_cents: 0, d91_plus_cents: 9365000,
      total_cents: 14365000,
      items: [
        { item_id: "i1", item_kind: "bill", item_date: "2026-05-01", due_date: "2026-05-31",
          overdue: true, outstanding_cents: 5000000, bucket: "d31_60" },
      ],
    },
  ],
  totals: { current_cents: 0, d31_60_cents: 5000000, d61_90_cents: 0, d91_plus_cents: 9365000, total_cents: 14365000 },
};

// The LITERAL _statement_core envelope (0040:3576-3588).
const STATEMENT_ENVELOPE = {
  counterparty_id: "cp1", domain: "ap", from: "2025-08-01", to: "2026-07-31",
  opening_balance_cents: 0,
  rows: [
    { event_date: "2026-05-01", row_type: "item", label: "bill", delta_cents: 5000000,
      running_balance_cents: 5000000, item_id: "i1", allocation_id: null },
    { event_date: "2026-06-15", row_type: "allocation", label: "apply", delta_cents: -1000000,
      running_balance_cents: 4000000, item_id: "i1", allocation_id: "a1" },
  ],
  closing_balance_cents: 4000000,
};

test("arAging posts p_client/p_as_of/p_segment to ar_aging and unwraps the LITERAL envelope's counterparties + totals", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes(AGING_ENVELOPE);
  });
  setup();
  const read = await arAging("jwt", "client-1", "2026-07-31");
  assert.ok(seenUrl.includes("/rpc/ar_aging"));
  assert.equal(seenBody.p_client, "client-1");
  assert.equal(seenBody.p_as_of, "2026-07-31");
  assert.equal(seenBody.p_segment, null, "the reserved-ignored forward hook stays null");
  assert.equal(read.available, true);
  assert.equal(read.rows.length, 1);
  assert.equal(read.rows[0]?.counterparty_name, "Acme Sdn Bhd");
  assert.equal(read.rows[0]?.d31_60_cents, 5000000, "the real d31_60_cents key, not a guessed b31_60_cents");
  assert.equal(read.rows[0]?.items[0]?.overdue, true);
  assert.equal(read.totals?.total_cents, 14365000);
});

test("apAging posts to ap_aging and unwraps the same envelope shape", async (t) => {
  let seenUrl = "";
  t.mock.method(globalThis, "fetch", async (u: string) => { seenUrl = u; return jsonRes(AGING_ENVELOPE); });
  setup();
  const read = await apAging("jwt", "client-1", "2026-07-31");
  assert.ok(seenUrl.includes("/rpc/ap_aging"));
  assert.equal(read.rows.length, 1);
});

test("[D1 fix] arAging/apAging degrade an unrecognised shape (array, or an object with no counterparties key) to available:false, rows:[] — NEVER a silent empty success", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes([]));
  setup();
  const asArray = await arAging("jwt", "client-1", "2026-07-31");
  assert.deepEqual(asArray.rows, []);
  assert.equal(asArray.available, false, "an array reply (the pre-fix guessed shape) is a shape drift, not a legitimate empty read");

  t.mock.method(globalThis, "fetch", async () => jsonRes({ as_of: "2026-07-31", domain: "ap" }));
  const noKey = await arAging("jwt", "client-1", "2026-07-31");
  assert.deepEqual(noKey.rows, []);
  assert.equal(noKey.available, false);

  t.mock.method(globalThis, "fetch", async () => jsonRes(null));
  const nullBody = await arAging("jwt", "client-1", "2026-07-31");
  assert.equal(nullBody.available, false);
});

test("customerStatement/supplierStatement post p_client/p_counterparty/p_from/p_to and unwrap the LITERAL envelope's rows", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes(STATEMENT_ENVELOPE);
  });
  setup();
  const read = await customerStatement("jwt", "client-1", "cp1", "2025-08-01", "2026-07-31");
  assert.ok(seenUrl.includes("/rpc/customer_statement"));
  assert.equal(seenBody.p_counterparty, "cp1");
  assert.equal(read.available, true);
  assert.equal(read.rows.length, 2);
  assert.equal(read.rows[1]?.row_type, "allocation");
  assert.equal(read.rows[1]?.delta_cents, -1000000);
  assert.equal(read.rows[1]?.allocation_id, "a1");

  t.mock.method(globalThis, "fetch", async (u: string) => { seenUrl = u; return jsonRes(STATEMENT_ENVELOPE); });
  await supplierStatement("jwt", "client-1", "cp1", "2025-08-01", "2026-07-31");
  assert.ok(seenUrl.includes("/rpc/supplier_statement"));
});

test("[D1 fix] a statement read with no `rows` key degrades to available:false, never a fake 'no items'", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ counterparty_id: "cp1" }));
  setup();
  const read = await customerStatement("jwt", "client-1", "cp1", "2025-08-01", "2026-07-31");
  assert.deepEqual(read.rows, []);
  assert.equal(read.available, false);
});
