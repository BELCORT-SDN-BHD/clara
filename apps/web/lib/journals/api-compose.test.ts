// lib/journals/api.ts's manual-compose ceremony (record_client_resolution then
// draft_entry) — split out of api.test.ts to keep each file under the repo's
// file-size convention. Mocked-fetch style ported from lib/read.test.ts /
// lib/doors.test.ts's own precedent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { composeManualEntry, draftManualEntry, recordManualResolution } from "./api";
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

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";

test("composeManualEntry: calls record_client_resolution THEN draft_entry, in order, resolution id threaded through", async () => {
  const calls: string[] = [];
  await withMockedFetch(
    async (input, init) => {
      const url = String(input);
      if (url.includes("record_client_resolution")) {
        calls.push("resolution");
        return jsonResponse({ resolution_id: "res-1" });
      }
      if (url.includes("draft_entry")) {
        calls.push("draft");
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(body.p_resolution, "res-1", "the resolution id from step 1 must thread into step 2");
        return jsonResponse({ entry_id: "e9", revision_token: "rev-9", status: "draft" });
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async () => {
      const out = await composeManualEntry(fakeSession(), CLIENT_ID, {
        postingDate: "2026-08-27",
        memo: "opening float",
        lines: [
          { account_code: "1000", debit_cents: 10000, credit_cents: 0 },
          { account_code: "3000", debit_cents: 0, credit_cents: 10000 },
        ],
      });
      assert.deepEqual(out, { entry_id: "e9", revision_token: "rev-9", status: "draft" });
    },
  );
  assert.deepEqual(calls, ["resolution", "draft"]);
});

// N3 wire-shape assertion for draft_entry (a renamed/typo'd arg key stays
// green on the return-value-only test above but breaks on the real DB).
test("draftManualEntry: the wire body carries the exact arg names draft_entry expects (N3 wire-shape assertion)", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (input, init) => {
      seenBody = init?.body ? JSON.parse(String(init.body)) : {};
      return jsonResponse({ entry_id: "e9", revision_token: "rev-9", status: "draft" });
    },
    async () => {
      await draftManualEntry(fakeSession(), CLIENT_ID, "res-1", "2026-08-27", "opening float", [
        { account_code: "1000", debit_cents: 10000, credit_cents: 0 },
        { account_code: "3000", debit_cents: 0, credit_cents: 10000 },
      ]);
    },
  );
  assert.deepEqual(Object.keys(seenBody).sort(), [
    "p_client",
    "p_document",
    "p_evidence",
    "p_flags",
    "p_lines",
    "p_memo",
    "p_op_key",
    "p_posting_date",
    "p_proposed_counterparty",
    "p_resolution",
    "p_sha256",
  ]);
  assert.equal(seenBody.p_client, CLIENT_ID);
  assert.equal(seenBody.p_resolution, "res-1");
  assert.equal(seenBody.p_posting_date, "2026-08-27");
  assert.equal(seenBody.p_memo, "opening float");
  assert.equal(seenBody.p_document, null);
  assert.equal(seenBody.p_sha256, null);
  assert.deepEqual(seenBody.p_flags, {});
});

test("composeManualEntry: step 2 refusing (CLR07) propagates that EXACT refusal — step 1 already landed", async () => {
  await withMockedFetch(
    async (input) => {
      const url = String(input);
      if (url.includes("record_client_resolution")) return jsonResponse({ resolution_id: "res-1" });
      if (url.includes("draft_entry")) return jsonResponse({ code: "CLR07", message: "entry is unbalanced by 50c" }, 400);
      throw new Error(`unexpected url: ${url}`);
    },
    async () => {
      await assert.rejects(
        composeManualEntry(fakeSession(), CLIENT_ID, {
          postingDate: "2026-08-27",
          memo: "unbalanced test",
          lines: [{ account_code: "1000", debit_cents: 10050, credit_cents: 0 }, { account_code: "3000", debit_cents: 0, credit_cents: 10000 }],
        }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          assert.equal((e as { code: string }).code, "CLR07");
          return true;
        },
      );
    },
  );
});

test("recordManualResolution: sends subject_kind: 'manual', subject: null, confidence: 1", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (input, init) => {
      seenBody = init?.body ? JSON.parse(String(init.body)) : {};
      return jsonResponse({ resolution_id: "res-1" });
    },
    async () => {
      await recordManualResolution(fakeSession(), CLIENT_ID);
    },
  );
  assert.equal(seenBody.p_client, CLIENT_ID);
  assert.equal(seenBody.p_subject_kind, "manual");
  assert.equal(seenBody.p_subject, null);
  assert.equal(seenBody.p_confidence, 1);
});
