// #809 — THE PLAN AUTHORITY PICKER'S READ, under test.
//
// Nothing on main covered this read at all: #640 wrote it, wave-2 integration moved it, and the
// walk the ticket names (`plans-walk.spec.ts`) never visits the plan form. So the convergence
// carries its own cell, and it asserts the five things that decide whether a picker of
// AUTHORITIES is trustworthy:
//
//   · it reads the DOOR (`clara.list_accounting_work`), filtered to the one client — never a
//     direct table read of clara.accounting_work, which is the second reader #809 deleted;
//   · it caps at 200 candidates and still reports truncation when more exist;
//   · reaching that cap means WALKING the door's cursor, because the door clamps a page to 100 —
//     and the cursor is round-tripped VERBATIM, never decoded;
//   · a malformed client id answers empty WITHOUT issuing a request;
//   · a REFUSAL is not an empty list. Routing through the door raised this read's floor to
//     bookkeeper, and "you may not read this" rendered as "this client has no instructions" is
//     the one mistake this control must never make.

import assert from "node:assert/strict";
import { test } from "node:test";

import { listPlanAuthorityWork } from "./api";
import type { WorkListRow } from "../work/work-list";
import type { SessionTokenAccessor } from "@/lib/session";

const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Sent = { url: string; body: Record<string, unknown> };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withFetch(
  impl: (sent: Sent) => Response,
  run: (sent: Sent[]) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const sent: Sent[] = [];
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const record = { url: String(u), body };
    sent.push(record);
    return impl(record);
  }) as typeof fetch;
  try {
    await run(sent);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

function row(n: number): WorkListRow {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    client_id: CLIENT,
    client_name: "Rome Properties",
    purpose: "journal_entry",
    status: "completed",
    initiator: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    initiated_by: null,
    initiator_role: "bookkeeper",
    basis_origin: "user_direct",
    intent_key: `w623:journal_entry:${n}`,
    memo: n % 2 === 0 ? `Office rent ${n}` : null,
    posting_date: "2026-09-01",
    currency: "MYR",
    source_ref_count: 0,
    current_task_id: null,
    entry_id: null,
    receipt_id: null,
    error_code: null,
    error_reason: null,
    attempts: 1,
    current_run_status: null,
    pending_question_id: null,
    pending_question_version: null,
    created_at: "2026-09-01T01:00:00.000Z",
    updated_at: "2026-09-01T01:00:00.000Z",
  };
}

/** `count` rows starting at `from`, in one door envelope. */
function page(from: number, count: number, next: string | null) {
  return {
    rows: Array.from({ length: count }, (_, i) => row(from + i)),
    next_cursor: next,
    truncated: next !== null,
  };
}

test("listPlanAuthorityWork: reads the list_accounting_work DOOR, filtered to the one client — never a table read of clara.accounting_work", async () => {
  await withFetch(
    () => json(page(1, 3, null)),
    async (sent) => {
      const out = await listPlanAuthorityWork(CLIENT, { session });
      assert.equal(sent.length, 1, "one page was enough");
      assert.match(sent[0]!.url, /\/rest\/v1\/rpc\/list_accounting_work$/,
        "the DOOR, not /rest/v1/accounting_work — one list reader is the whole ticket");
      assert.equal(sent[0]!.body.p_client, CLIENT, "filtered to the one client");
      assert.equal(sent[0]!.body.p_cursor, null, "the first page carries no cursor");
      assert.equal(sent[0]!.body.p_limit, 100, "at the door's own page ceiling, so the cap needs the fewest walks");
      assert.equal(out.rows.length, 3);
      assert.equal(out.truncated, false, "a short first page is a complete list");
      // The row is the DOOR's own row type — the label the form renders comes off it flat.
      assert.equal(out.rows[0]!.intent_key, "w623:journal_entry:1");
      assert.equal(out.rows[1]!.memo, "Office rent 2");
    },
  );
});

test("listPlanAuthorityWork: walks the door's cursor to the 200 cap and round-trips next_cursor VERBATIM", async () => {
  const CURSOR_1 = "b3BhcXVlLWN1cnNvci0x";
  const CURSOR_2 = "b3BhcXVlLWN1cnNvci0y";
  await withFetch(
    (s) => {
      if (s.body.p_cursor === null) return json(page(1, 100, CURSOR_1));
      if (s.body.p_cursor === CURSOR_1) return json(page(101, 100, CURSOR_2));
      return json(page(201, 100, null));
    },
    async (sent) => {
      const out = await listPlanAuthorityWork(CLIENT, { session });
      assert.equal(sent.length, 2, "two pages of 100 reach the 200 cap — the third is never asked for");
      assert.equal(sent[1]!.body.p_cursor, CURSOR_1,
        "the SECOND request carries the first page's next_cursor, byte for byte and never decoded");
      assert.equal(out.rows.length, 200, "capped at 200 candidates");
      assert.equal(out.truncated, true, "…and truncation is reported, because the door said there is more");
      assert.equal(out.rows[199]!.id, row(200).id, "the cap keeps the NEWEST 200, in the door's own order");
    },
  );
});

test("listPlanAuthorityWork: a complete list at exactly the cap is NOT reported as truncated", async () => {
  const CURSOR_1 = "b3BhcXVlLWN1cnNvci0x";
  await withFetch(
    (s) => (s.body.p_cursor === null ? json(page(1, 100, CURSOR_1)) : json(page(101, 100, null))),
    async () => {
      const out = await listPlanAuthorityWork(CLIENT, { session });
      assert.equal(out.rows.length, 200);
      assert.equal(out.truncated, false,
        "exactly 200 with no further page is a COMPLETE list — truncation means 'more exist', never 'you hit the cap'");
    },
  );
});

test("listPlanAuthorityWork: a non-UUID client id answers empty WITHOUT issuing a request", async () => {
  await withFetch(
    () => {
      throw new Error("no request may be issued for a malformed client id");
    },
    async (sent) => {
      const out = await listPlanAuthorityWork("not-a-uuid", { session });
      assert.deepEqual(out, { rows: [], truncated: false });
      assert.equal(sent.length, 0, "an eq. filter on a uuid column with a non-uuid is a 400, never a state");
    },
  );
});

test("listPlanAuthorityWork: a REFUSAL reaches the caller's error arm — never an empty candidate list", async () => {
  await withFetch(
    () => json({ code: "CLR04", message: "insufficient role" }, 403),
    async () => {
      await assert.rejects(
        () => listPlanAuthorityWork(CLIENT, { session }),
        "a caller below the door's bookkeeper floor must THROW: rendering a refusal as 'this client has no instructions' would offer a plan no authority backs",
      );
    },
  );
});

test("listPlanAuthorityWork: a refusal on the SECOND page also throws rather than returning the first page's rows", async () => {
  const CURSOR_1 = "b3BhcXVlLWN1cnNvci0x";
  await withFetch(
    (s) => (s.body.p_cursor === null
      ? json(page(1, 100, CURSOR_1))
      : json({ code: "CLR04", message: "insufficient role" }, 403)),
    async () => {
      await assert.rejects(() => listPlanAuthorityWork(CLIENT, { session }),
        "a partial walk is not a complete answer, and a silently short list is a wrong one");
    },
  );
});
