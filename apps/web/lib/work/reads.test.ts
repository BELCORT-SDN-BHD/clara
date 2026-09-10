// The durable-Work RLS reads, under test — asserted on the REQUEST URL, not on
// what came back afterwards. A reader can render the right-looking thing off a
// wrong query that happened to return one row, which is why every cell here
// measures what was actually asked for.
//
// THE SHARPEST CELL IS THE ONE THAT ASSERTS NO REQUEST WAS MADE. A malformed
// work id must never reach PostgREST: `id=eq.not-a-work` on a `uuid` column is
// HTTP 400 `22P02`, which THROWS, and a throw on a route reaches the error
// boundary ("Something went wrong") instead of the scoped not-found this page
// owns. That is #614's own lesson, applied to a second id; a cell that only
// checked the return value would pass on a reader that fired the request first.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accountNames,
  getAccountingWork,
  getWorkTask,
  listAccountingWork,
  listOperationReceipts,
  loadWorkDetail,
} from "./reads";
import type { SessionTokenAccessor } from "@/lib/session";

const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TASK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ENTRY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withFetch(
  impl: (url: string) => Response,
  run: (urls: string[]) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const urls: string[] = [];
  globalThis.fetch = (async (u: unknown) => {
    urls.push(String(u));
    return impl(String(u));
  }) as typeof fetch;
  try {
    await run(urls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

function workRow(over: Record<string, unknown> = {}) {
  return {
    id: WORK,
    firm_id: "firm-1",
    client_id: CLIENT,
    purpose: "journal_entry",
    status: "completed",
    initiator: "user-1",
    initiator_role: "bookkeeper",
    intent_key: "intent-1",
    logical_op_id: `work:${WORK}:journal_entry:1`,
    basis: { posting_date: "2026-09-01", memo: "Office rent", currency: "MYR", lines: [] },
    basis_digest: "digest",
    basis_origin: "user_direct",
    source_refs: [],
    current_task_id: TASK,
    bundle: { id: "clara-work/v1", digest: "abc123def456789" },
    result: { entry_id: ENTRY, receipt_id: "receipt-1", posted_at: "2026-09-01T02:00:00Z" },
    error: null,
    created_at: "2026-09-01T01:00:00Z",
    updated_at: "2026-09-01T02:00:00Z",
    ...over,
  };
}

test("ONE work is addressed by BOTH its id and its client — RLS scopes the firm, the filter scopes the client", async () => {
  await withFetch(
    () => json([workRow()]),
    async (urls) => {
      const row = await getAccountingWork(CLIENT, WORK, { session });
      assert.equal(row?.id, WORK);
      assert.match(urls[0]!, /\/rest\/v1\/accounting_work\?/);
      assert.match(urls[0]!, new RegExp(`id=eq\\.${WORK}`));
      assert.match(urls[0]!, new RegExp(`client_id=eq\\.${CLIENT}`));
      assert.match(urls[0]!, /select=id%2Cfirm_id%2Cclient_id%2Cpurpose%2Cstatus/);
      assert.match(urls[0]!, /limit=1/);
    },
  );
});

test("an EMPTY result is null — the database's honest answer, never an error it did not raise", async () => {
  await withFetch(
    () => json([]),
    async () => {
      assert.equal(await getAccountingWork(CLIENT, WORK, { session }), null);
    },
  );
});

test("A MALFORMED WORK ID FIRES NO REQUEST AT ALL", async () => {
  await withFetch(
    () => { throw new Error("PostgREST must never be asked this"); },
    async (urls) => {
      assert.equal(await loadWorkDetail(CLIENT, "not-a-work", { session }), null);
      assert.equal(await loadWorkDetail("not-a-client", WORK, { session }), null);
      assert.equal(await getWorkTask("not-a-task", { session }), null);
      assert.equal((await listAccountingWork("not-a-client", { session })).rows.length, 0);
      assert.deepEqual(urls, [], "not one of these malformed addresses may reach the database");
    },
  );
});

test("the client list is newest first and asks for ONE MORE than it shows, so truncation is proven not guessed", async () => {
  await withFetch(
    () => json([workRow()]),
    async (urls) => {
      const bounded = await listAccountingWork(CLIENT, { session });
      assert.equal(bounded.truncated, false);
      assert.match(urls[0]!, new RegExp(`client_id=eq\\.${CLIENT}`));
      assert.match(urls[0]!, /order=created_at\.desc/);
      assert.match(urls[0]!, /limit=201/);
    },
  );

  // A full answer at cap+1 is PROOF the table holds more — never a silent short
  // list. The extra row is dropped from what is rendered.
  await withFetch(
    () => json(Array.from({ length: 201 }, (_, i) => workRow({ id: `w-${i}` }))),
    async () => {
      const bounded = await listAccountingWork(CLIENT, { session });
      assert.equal(bounded.truncated, true);
      assert.equal(bounded.rows.length, 200);
    },
  );
});

test("the task is read off the MASKED human view, never the base table", async () => {
  await withFetch(
    () => json([{ id: TASK, status: "running", error_code: null, created_at: null, updated_at: null }]),
    async (urls) => {
      const task = await getWorkTask(TASK, { session });
      assert.equal(task?.status, "running");
      assert.match(urls[0]!, /\/rest\/v1\/agent_tasks_visible\?/);
      assert.ok(!/\/rest\/v1\/agent_tasks\?/.test(urls[0]!), "the base table is not a human read");
    },
  );
});

test("receipts are scoped to the work AND the client, newest first", async () => {
  await withFetch(
    () => json([]),
    async (urls) => {
      await listOperationReceipts(CLIENT, WORK, { session });
      assert.match(urls[0]!, /\/rest\/v1\/operation_receipts\?/);
      assert.match(urls[0]!, new RegExp(`work_id=eq\\.${WORK}`));
      assert.match(urls[0]!, new RegExp(`client_id=eq\\.${CLIENT}`));
      assert.match(urls[0]!, /order=created_at\.desc/);
    },
  );
});

test("the whole picture reads the entry BY THE ID THE DATABASE WROTE, never by a guessed join", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/accounting_work?")) return json([workRow()]);
      if (url.includes("/agent_tasks_visible?")) return json([{ id: TASK, status: "completed", error_code: null, created_at: null, updated_at: null }]);
      if (url.includes("/operation_receipts?")) return json([{ id: "receipt-1", outcome: "committed", effects: { entry_id: ENTRY } }]);
      if (url.includes("/coa_accounts?")) return json([{ client_id: CLIENT, account_code: "6100", name: "Rent", account_type: "expense", is_active: true }]);
      if (url.includes("/journal_entries?")) return json([{ id: ENTRY, client_id: CLIENT, status: "approved" }]);
      if (url.includes("/journal_lines?")) return json([{ id: "l1", entry_id: ENTRY, line_no: 1, account_code: "6100", debit_cents: 120_000, credit_cents: 0, description: null, counterparty_id: null }]);
      throw new Error(`unexpected read: ${url}`);
    },
    async (urls) => {
      const data = await loadWorkDetail(CLIENT, WORK, { session });
      assert.ok(data);
      assert.equal(data.entry?.id, ENTRY);
      assert.equal(data.lines.length, 1);
      assert.equal(data.receipts[0]?.outcome, "committed");
      const entryUrl = urls.find((u) => u.includes("/journal_entries?"))!;
      assert.match(entryUrl, new RegExp(`id=eq\\.${ENTRY}`));
      assert.match(entryUrl, new RegExp(`client_id=eq\\.${CLIENT}`), "the entry is client-scoped too");
      assert.match(urls.find((u) => u.includes("/journal_lines?"))!, /order=line_no\.asc/);
    },
  );
});

test("a work with NO result reads no entry and no lines — nothing is invented for a run that has not committed", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/accounting_work?")) return json([workRow({ status: "queued", result: null, current_task_id: null })]);
      if (url.includes("/operation_receipts?")) return json([]);
      if (url.includes("/coa_accounts?")) return json([]);
      throw new Error(`unexpected read: ${url}`);
    },
    async (urls) => {
      const data = await loadWorkDetail(CLIENT, WORK, { session });
      assert.equal(data?.entry, null);
      assert.deepEqual(data?.lines, []);
      assert.equal(data?.task, null, "a work with no current task reads none");
      assert.ok(!urls.some((u) => u.includes("/journal_entries?")), "no entry read fires");
      assert.ok(!urls.some((u) => u.includes("/agent_tasks_visible?")), "no task read fires");
    },
  );
});

test("a FAILED chart read degrades to codes — it never takes the whole page down", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/accounting_work?")) return json([workRow({ result: null, current_task_id: null })]);
      if (url.includes("/operation_receipts?")) return json([]);
      if (url.includes("/coa_accounts?")) return json({ message: "boom" }, 500);
      throw new Error(`unexpected read: ${url}`);
    },
    async () => {
      const data = await loadWorkDetail(CLIENT, WORK, { session });
      assert.ok(data, "the work still resolves");
      assert.deepEqual(data.accounts, []);
    },
  );
});

test("accountNames maps a code to its name, and leaves an unknown code to render as itself", () => {
  const names = accountNames([
    { client_id: CLIENT, account_code: "6100", name: "Rent", account_type: "expense", is_active: true },
  ]);
  assert.equal(names.get("6100"), "Rent");
  assert.equal(names.get("9999"), undefined);
});
