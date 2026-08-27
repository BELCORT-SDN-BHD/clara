// lib/journals/api.ts — mocked-fetch style ported from lib/read.test.ts /
// lib/doors.test.ts's own precedent (this module's own header). Covers: every
// read shape (table reads + the review-queue RPC + FIX-1 truncation detection
// + FIX-6 counts.open_drafts), and every door's success + refusal-verbatim
// path + the reversal path. The manual-compose ceremony has its own file,
// ./api-compose.test.ts (kept this file under the repo's 500-line convention).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approveEntry,
  listCoaAccounts,
  listCounterparties,
  listJournalEntries,
  listJournalLines,
  listReviewQueue,
  loadJournalsWorkbench,
  reverseEntry,
  reviseEntry,
} from "./api";
import { isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null = "tok"): SessionTokenAccessor {
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

/** Dispatches a canned response per endpoint substring — the combined loader
 *  hits five endpoints in parallel, so a single-response mock (the read.test.ts
 *  precedent) cannot cover it. */
function routedFetch(routes: Record<string, unknown>): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [needle, body] of Object.entries(routes)) {
      if (url.includes(needle)) return jsonResponse(body);
    }
    throw new Error(`unrouted fetch: ${url}`);
  };
}

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";

// --- reads: each relation's shape --------------------------------------------

test("listJournalEntries: reads journal_entries with client_id scoped, returns rows as-is, untruncated", async () => {
  await withMockedFetch(
    routedFetch({ "journal_entries?": [{ id: "e1", client_id: CLIENT_ID, status: "draft" }] }),
    async () => {
      const { rows, truncated } = await listJournalEntries(fakeSession(), CLIENT_ID);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.id, "e1");
      assert.equal(truncated, false);
    },
  );
});

// FIX-1 (independent review): journal_entries/journal_lines are read WITHOUT a
// caller-supplied limit — a Supabase/PostgREST db-max-rows ceiling would
// otherwise truncate silently. Prove the request asks for FETCH_CAP+1 and that
// hitting exactly that many rows back is treated as truncation.
test("listJournalEntries: requests FETCH_CAP+1 rows and reports truncated when the cap is hit", async () => {
  let seenUrl = "";
  const overCap = Array.from({ length: 1001 }, (_, i) => ({ id: `e${i}` }));
  await withMockedFetch(
    async (input) => {
      seenUrl = String(input);
      return jsonResponse(overCap);
    },
    async () => {
      const { rows, truncated } = await listJournalEntries(fakeSession(), CLIENT_ID);
      assert.equal(truncated, true, "1001 rows back on a 1001-row request means more may exist");
      assert.equal(rows.length, 1000, "the reported rows are capped back to FETCH_CAP, never the raw overflow");
    },
  );
  assert.match(seenUrl, /limit=1001/);
});

test("listJournalEntries: fewer rows than the cap reports untruncated", async () => {
  await withMockedFetch(
    async () => jsonResponse(Array.from({ length: 5 }, (_, i) => ({ id: `e${i}` }))),
    async () => {
      const { rows, truncated } = await listJournalEntries(fakeSession(), CLIENT_ID);
      assert.equal(truncated, false);
      assert.equal(rows.length, 5);
    },
  );
});

test("listJournalEntries: the request URL carries select= and the client_id filter", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (input) => {
      seenUrl = String(input);
      return jsonResponse([]);
    },
    async () => {
      await listJournalEntries(fakeSession(), CLIENT_ID);
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/journal_entries\?/);
  assert.match(seenUrl, new RegExp(`client_id=eq\\.${CLIENT_ID}`));
  assert.match(seenUrl, /select=/);
});

test("listJournalLines: reads journal_lines scoped by client_id, untruncated", async () => {
  await withMockedFetch(
    routedFetch({ "journal_lines?": [{ id: "l1", entry_id: "e1", line_no: 1, account_code: "6000", debit_cents: 100, credit_cents: 0, description: null, counterparty_id: null }] }),
    async () => {
      const { rows, truncated } = await listJournalLines(fakeSession(), CLIENT_ID);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.debit_cents, 100);
      assert.equal(truncated, false);
    },
  );
});

test("listJournalLines: reports truncated when the cap is hit (the class FIX-1 flagged: a truncated line set makes every sum unverifiable)", async () => {
  await withMockedFetch(
    async () => jsonResponse(Array.from({ length: 1001 }, (_, i) => ({ id: `l${i}` }))),
    async () => {
      const { truncated } = await listJournalLines(fakeSession(), CLIENT_ID);
      assert.equal(truncated, true);
    },
  );
});

test("listCoaAccounts: reads coa_accounts scoped by client_id", async () => {
  await withMockedFetch(
    routedFetch({ "coa_accounts?": [{ client_id: CLIENT_ID, account_code: "6000", name: "Office supplies", account_type: "expense", is_active: true }] }),
    async () => {
      const rows = await listCoaAccounts(fakeSession(), CLIENT_ID);
      assert.equal(rows[0]?.name, "Office supplies");
    },
  );
});

test("listCounterparties: reads counterparties scoped by client_id", async () => {
  await withMockedFetch(
    routedFetch({ "counterparties?": [{ id: "cp1", name: "Acme Sdn Bhd" }] }),
    async () => {
      const rows = await listCounterparties(fakeSession(), CLIENT_ID);
      assert.equal(rows[0]?.name, "Acme Sdn Bhd");
    },
  );
});

// --- reads: the review-queue RPC ---------------------------------------------

test("listReviewQueue: POSTs to rpc/list_review_queue with the client scope, filters to row_kind==='draft'", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  await withMockedFetch(
    async (input, init) => {
      seenUrl = String(input);
      seenBody = init?.body ? JSON.parse(String(init.body)) : null;
      return jsonResponse({
        rows: [
          { row_kind: "draft", section: "needs_review", entry_id: "e1", client_id: CLIENT_ID, id: "e1", amount_cents: 5000, sort: ["1", "a", "b", "c", "d"] },
          { row_kind: "uncoded_filing", section: "needs_you", filing_id: "f1", client_id: CLIENT_ID, id: "f1" },
        ],
        counts: { open_drafts: 1 },
      });
    },
    async () => {
      const { rows, counts } = await listReviewQueue(fakeSession(), CLIENT_ID);
      assert.equal(rows.length, 1, "only row_kind==='draft' rows survive the filter");
      assert.equal(rows[0]?.row_kind, "draft");
      assert.equal(rows[0]?.section, "needs_review", "section is rendered verbatim, never relabeled");
      assert.equal(rows[0]?.amount_cents, 5000, "amount_cents is the DB-computed sum, passed through unchanged");
      assert.equal(counts.open_drafts, 1);
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/rpc\/list_review_queue$/);
  assert.deepEqual((seenBody as { p_scope: unknown }).p_scope, { client_id: CLIENT_ID });
  assert.equal((seenBody as { p_cursor: unknown }).p_cursor, null);
});

test("listReviewQueue: a malformed row degrades defensively, never throws", async () => {
  await withMockedFetch(
    async () => jsonResponse({ rows: [{ row_kind: "draft" }] }),
    async () => {
      const { rows } = await listReviewQueue(fakeSession(), CLIENT_ID);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.id, "");
      assert.equal(rows[0]?.amount_cents, null);
    },
  );
});

// FIX-6 (independent review): counts.open_drafts is DB-computed PRE-limit — it
// must survive even when the p_limit page has pushed every draft row off the
// page entirely (a large needs_you backlog of a DIFFERENT row_kind).
test("listReviewQueue: counts.open_drafts survives even when the page carries zero draft rows", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse({
        rows: [{ row_kind: "uncoded_filing", section: "needs_you", filing_id: "f1", id: "f1" }],
        counts: { open_drafts: 7 },
      }),
    async () => {
      const { rows, counts } = await listReviewQueue(fakeSession(), CLIENT_ID);
      assert.equal(rows.length, 0, "the page itself carries zero draft rows");
      assert.equal(counts.open_drafts, 7, "but the TRUE total is still visible from counts");
    },
  );
});

test("listReviewQueue: a missing counts block degrades to open_drafts: 0, never throws", async () => {
  await withMockedFetch(
    async () => jsonResponse({ rows: [] }),
    async () => {
      const { counts } = await listReviewQueue(fakeSession(), CLIENT_ID);
      assert.equal(counts.open_drafts, 0);
    },
  );
});

// --- the combined loader ------------------------------------------------------

test("loadJournalsWorkbench: fetches all five endpoints and assembles the shape", async () => {
  await withMockedFetch(
    routedFetch({
      "rpc/list_review_queue": { rows: [] },
      "journal_entries?": [{ id: "e1" }],
      "journal_lines?": [{ id: "l1" }],
      "coa_accounts?": [{ account_code: "6000" }],
      "counterparties?": [{ id: "cp1" }],
    }),
    async () => {
      const data = await loadJournalsWorkbench(fakeSession(), CLIENT_ID);
      assert.equal(data.entries.length, 1);
      assert.equal(data.entriesTruncated, false);
      assert.equal(data.lines.length, 1);
      assert.equal(data.linesTruncated, false);
      assert.equal(data.accounts.length, 1);
      assert.equal(data.counterparties.length, 1);
      assert.deepEqual(data.queueRows, []);
      assert.equal(data.queueCounts.open_drafts, 0);
    },
  );
});

// --- governed writes: success + refusal-verbatim -----------------------------

test("approveEntry: success posts to rpc/approve_entry with the revision + a fresh op_key", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (input, init) => {
      seenBody = init?.body ? JSON.parse(String(init.body)) : {};
      return new Response("", { status: 200 });
    },
    async () => {
      await approveEntry(fakeSession(), "e1", "rev-1", "I approve this");
    },
  );
  assert.equal(seenBody.p_entry, "e1");
  assert.equal(seenBody.p_expected_revision, "rev-1");
  assert.equal(seenBody.p_attestation, "I approve this");
  assert.equal(typeof seenBody.p_op_key, "string");
  assert.ok((seenBody.p_op_key as string).length > 0);
});

test("approveEntry: a CLR06 stale-revision refusal surfaces as DoorRefusal, verbatim", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR06", message: "stale revision token" }, 400),
    async () => {
      await assert.rejects(approveEntry(fakeSession(), "e1", "stale-rev"), (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR06");
        assert.match((e as Error).message, /stale revision token/);
        return true;
      });
    },
  );
});

test("approveEntry: a CLR05 distinct-checker refusal surfaces verbatim", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR05", message: "a distinct checker is required for a high-stakes entry" }, 400),
    async () => {
      await assert.rejects(approveEntry(fakeSession(), "e1", "rev-1"), (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR05");
        return true;
      });
    },
  );
});

test("reviseEntry: success returns the new revision_token", async () => {
  await withMockedFetch(
    async () => jsonResponse({ revision_token: "rev-2" }),
    async () => {
      const next = await reviseEntry(fakeSession(), "e1", [{ account_code: "6000", debit_cents: 100, credit_cents: 0 }], "rev-1");
      assert.equal(next, "rev-2");
    },
  );
});

// N3 (independent review, "proven gap: renaming p_lines stayed green"): a
// wire-shape body assertion, keyed on the EXACT arg names PostgREST calls
// revise_entry with — a typo'd/renamed key here is a silent no-op on the DB
// side (an unknown named arg raises its own error, but a same-shaped RENAME
// that happens to still typecheck client-side would not be caught by the
// return-value-only test above).
test("reviseEntry: the wire body carries the exact arg names revise_entry expects (N3 wire-shape assertion)", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (input, init) => {
      seenBody = init?.body ? JSON.parse(String(init.body)) : {};
      return jsonResponse({ revision_token: "rev-2" });
    },
    async () => {
      await reviseEntry(fakeSession(), "e1", [{ account_code: "6000", debit_cents: 100, credit_cents: 0, description: "x" }], "rev-1");
    },
  );
  assert.deepEqual(Object.keys(seenBody).sort(), [
    "p_amount_override",
    "p_duplicate_override",
    "p_entry",
    "p_evidence",
    "p_expected_revision",
    "p_lines",
    "p_op_key",
    "p_proposed_counterparty",
  ]);
  assert.equal(seenBody.p_entry, "e1");
  assert.equal(seenBody.p_expected_revision, "rev-1");
  assert.deepEqual(seenBody.p_lines, [{ account_code: "6000", debit_cents: 100, credit_cents: 0, description: "x" }]);
  assert.equal(seenBody.p_proposed_counterparty, null);
  assert.equal(seenBody.p_evidence, null);
});

test("reviseEntry: a CLR07 unbalanced refusal surfaces verbatim", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR07", message: "entry is unbalanced by 10c" }, 400),
    async () => {
      await assert.rejects(
        reviseEntry(fakeSession(), "e1", [{ account_code: "6000", debit_cents: 100, credit_cents: 0 }], "rev-1"),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          assert.equal((e as { code: string }).code, "CLR07");
          return true;
        },
      );
    },
  );
});

// --- the reversal path (law 6: reverse-not-delete) ---------------------------

test("reverseEntry: success posts p_entry/p_reason/op_key to rpc/reverse_entry, returns the receipt", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (input, init) => {
      seenBody = init?.body ? JSON.parse(String(init.body)) : {};
      return jsonResponse({ reversal_id: "e2", status: "approved" });
    },
    async () => {
      const out = await reverseEntry(fakeSession(), "e1", "duplicate posting");
      assert.deepEqual(out, { reversal_id: "e2", status: "approved" });
    },
  );
  assert.equal(seenBody.p_entry, "e1");
  assert.equal(seenBody.p_reason, "duplicate posting");
});

test("reverseEntry: a CLR10 already-reversed refusal surfaces verbatim, never retried", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "entry already reversed" }, 400),
    async () => {
      await assert.rejects(reverseEntry(fakeSession(), "e1", "again"), (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR10");
        return true;
      });
    },
  );
});

// --- manual compose: the two-call ceremony ------------------------------------
// Split into ./api-compose.test.ts to keep this file under the repo's file-size
// convention (500 lines) — covers composeManualEntry/draftManualEntry/
// recordManualResolution, including the N3 wire-shape assertion and the
// "step 2 refuses, step 1 already landed" case.
