// #641 — the Work-list door's wire contract, under test.
//
// ASSERTED ON WHAT WAS ACTUALLY SENT, not on what came back. A list can render the right-looking
// rows off a wrong request that happened to return some — so every cell here reads the RPC body
// the module posted. That is the same discipline `lib/work/reads.test.ts` states for the
// table-read half of this lane.
//
// AND ON THE ONE DERIVATION THIS MODULE OWNS. `workStateLabel` turns a canonical row into the WORD
// a person reads, and "Retrying" is the only one of those words that is not a status: it is
// `attempts > 1` on a Work that is still queued or running. A cell that only checked the happy
// statuses would pass on a build that invented it.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WORK_LIST_DEFAULT_LIMIT,
  getAccountingWorkRow,
  listAccountingWorkPage,
  workStateLabel,
  workStateTone,
  type WorkListRow,
} from "./work-list";
import type { SessionTokenAccessor } from "@/lib/session";

const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

function row(over: Partial<WorkListRow> = {}): WorkListRow {
  return {
    id: WORK,
    client_id: CLIENT,
    client_name: "Rome Properties",
    purpose: "journal_entry",
    status: "queued",
    initiator: USER,
    initiated_by: USER,
    initiator_role: "bookkeeper",
    basis_origin: "user_direct",
    intent_key: "w623:journal_entry:2026-09-01:office-rent",
    memo: "Office rent, September",
    posting_date: "2026-09-01",
    currency: "MYR",
    source_ref_count: 0,
    current_task_id: null,
    entry_id: null,
    receipt_id: null,
    error_code: null,
    error_reason: null,
    attempts: 1,
    current_run_status: "queued",
    pending_question_id: null,
    pending_question_version: null,
    created_at: "2026-09-01T01:00:00.000Z",
    updated_at: "2026-09-01T01:00:00.000Z",
    ...over,
  };
}

test("every filter axis reaches the door under its own parameter name", async () => {
  await withFetch(
    () => json({ rows: [row()], next_cursor: null, truncated: false }),
    async (sent) => {
      await listAccountingWorkPage(
        {
          client: CLIENT,
          status: ["awaiting_input", "failed"],
          purpose: ["journal_entry"],
          initiator: USER,
          since: "2026-09-01",
          until: "2026-09-30",
          q: "rent",
        },
        { session, limit: 50, cursor: "page2" },
      );
      assert.equal(sent.length, 1);
      assert.match(sent[0]!.url, /\/rest\/v1\/rpc\/list_accounting_work$/);
      assert.deepEqual(sent[0]!.body, {
        p_client: CLIENT,
        p_status: ["awaiting_input", "failed"],
        p_initiator: USER,
        p_purpose: ["journal_entry"],
        // THE DATE FENCE IS BUILT ONCE, HERE, in the business timezone: `since` is that day's own
        // start and `until` is the NEXT day's start, because the door compares `created_at <
        // p_until`. An inclusive `23:59:59.999` bound would silently drop a row timestamped in
        // that day's last sub-millisecond — `created_at` carries microsecond precision.
        p_since: "2026-09-01T00:00:00.000+08:00",
        p_until: "2026-10-01T00:00:00.000+08:00",
        p_q: "rent",
        p_cursor: "page2",
        p_limit: 50,
      });
    },
  );
});

test("an absent or empty filter is sent as null, never as an empty array or an empty string", async () => {
  await withFetch(
    () => json({ rows: [], next_cursor: null, truncated: false }),
    async (sent) => {
      await listAccountingWorkPage({ status: [], purpose: [], q: "   " }, { session });
      const body = sent[0]!.body;
      assert.equal(body.p_status, null, "an empty status list is NO filter, not a filter matching nothing");
      assert.equal(body.p_purpose, null);
      assert.equal(body.p_q, null, "whitespace is not a search term");
      assert.equal(body.p_client, null);
      assert.equal(body.p_initiator, null);
      assert.equal(body.p_since, null);
      assert.equal(body.p_until, null);
      assert.equal(body.p_cursor, null);
      assert.equal(body.p_limit, WORK_LIST_DEFAULT_LIMIT);
    },
  );
});

test("the limit is clamped on the way OUT as well as at the door", async () => {
  await withFetch(
    () => json({ rows: [], next_cursor: null, truncated: false }),
    async (sent) => {
      await listAccountingWorkPage({}, { session, limit: 10_000 });
      await listAccountingWorkPage({}, { session, limit: 0 });
      assert.equal(sent[0]!.body.p_limit, 100, "the door's own ceiling");
      assert.equal(sent[1]!.body.p_limit, 1, "and its floor — never a page of zero rows");
    },
  );
});

test("a filtered read that matches nothing is a page, not an error — and says truncated=false", async () => {
  await withFetch(
    () => json({ rows: [], next_cursor: null, truncated: false }),
    async () => {
      const page = await listAccountingWorkPage({ status: ["cancelled"] }, { session });
      assert.deepEqual(page.rows, []);
      assert.equal(page.next_cursor, null);
      assert.equal(
        page.truncated,
        false,
        "an empty page is a successful read; the CALLER tells 'no matches' from 'no work' by "
        + "whether it applied any filters, never by a different wire shape",
      );
    },
  );
});

test("a malformed envelope degrades to empty-and-not-truncated rather than crashing a caller", async () => {
  await withFetch(
    () => json({ rows: "not an array", next_cursor: 7, truncated: "yes" }),
    async () => {
      const page = await listAccountingWorkPage({}, { session });
      assert.deepEqual(page.rows, []);
      assert.equal(page.next_cursor, null);
      assert.equal(page.truncated, false);
    },
  );
});

test("the addressed-row door is called by id alone — no client, no filters", async () => {
  await withFetch(
    () => json(row({ memo: "oldest" })),
    async (sent) => {
      const one = await getAccountingWorkRow(WORK, { session });
      assert.match(sent[0]!.url, /\/rest\/v1\/rpc\/get_accounting_work_row$/);
      assert.deepEqual(sent[0]!.body, { p_work: WORK });
      assert.equal(one.memo, "oldest");
    },
  );
});

test("a CLR11 from the addressed-row door reaches the caller as the door's own refusal", async () => {
  await withFetch(
    () => json({ code: "CLR11", message: "accounting work not found", details: JSON.stringify({ reason: "accounting_work_not_found" }) }, 400),
    async () => {
      await assert.rejects(
        () => getAccountingWorkRow(WORK, { session }),
        (e: unknown) => {
          const err = e as { code?: string; reason?: string };
          assert.equal(err.code, "CLR11");
          assert.equal(err.reason, "accounting_work_not_found");
          return true;
        },
      );
    },
  );
});

// ── the state word ────────────────────────────────────────────────────────────

test("the state word is derived from canonical fields, and RETRYING is a count of real runs", () => {
  assert.equal(workStateLabel(row({ status: "queued", attempts: 1 })), "queued");
  assert.equal(workStateLabel(row({ status: "running", attempts: 1 })), "executing");
  assert.equal(
    workStateLabel(row({ status: "queued", attempts: 2 })),
    "retrying",
    "a second run of the same Work is what makes 'Retrying' a fact",
  );
  assert.equal(workStateLabel(row({ status: "running", attempts: 3 })), "retrying");
  assert.equal(workStateLabel(row({ status: "awaiting_input", attempts: 1 })), "needsYou");
  assert.equal(
    workStateLabel(row({ status: "awaiting_input", attempts: 4 })),
    "needsYou",
    "a parked Work is waiting on a PERSON however many runs it has had — 'Retrying' would hide that",
  );
  assert.equal(workStateLabel(row({ status: "stopping", attempts: 1 })), "stopping");
  for (const terminal of ["completed", "refused", "failed", "cancelled", "expired"] as const) {
    assert.equal(workStateLabel(row({ status: terminal, attempts: 2 })), terminal);
  }
  assert.equal(
    workStateLabel(row({ status: "some_future_status", attempts: 1 })),
    "unknown",
    "a status this build has not learned renders through the unknown arm, never crashes a lookup",
  );
});

test("the badge tone never carries meaning the word does not", () => {
  // C08.6: colour is not the only cue. This only pins that the tones are a TOTAL function of the
  // word — the WORD itself is what the Badge renders, and the list cell asserts that.
  const words = ["queued", "executing", "retrying", "needsYou", "stopping",
    "completed", "refused", "failed", "cancelled", "expired", "unknown"] as const;
  for (const w of words) {
    const tone = workStateTone(w);
    assert.ok(["default", "secondary", "destructive", "outline"].includes(tone), `${w} has a real tone`);
  }
  assert.equal(workStateTone("completed"), "default");
  assert.equal(workStateTone("failed"), "destructive");
  assert.equal(workStateTone("needsYou"), "secondary");
});
