// #960 — `clara.set_firm_document_limits`, the firm's own processing-cap writer (migration 0270).
//
// Mocked-fetch style (`lib/registration/legal-doors.test.ts`'s precedent, which is itself
// `lib/registration/doors.test.ts`'s). What is pinned here is the ARGUMENT NAMES the door
// requires, that a cap the person did not touch is OMITTED rather than sent as a value, the
// positive checks on the answer, and the classification of a refusal by CODE AND REASON rather
// than by its sentence.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  newProcessingCapsOpKey,
  SET_FIRM_DOCUMENT_LIMITS_DOOR,
  setFirmDocumentLimits,
} from "./capacity-doors";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";

type Seen = { url: string; body: Record<string, unknown> };

function withDoor(reply: () => Response, run: (calls: Seen[]) => Promise<void>): Promise<void> {
  const calls: Seen[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return reply();
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A receipt exactly as migration 0270's `_finish_op` builds it — transcribed from the door's
 *  own battery (`packages/db/tests/firm-document-limits-writer.test.mjs` cell 2), never from
 *  this module's decoder. */
const RECEIPT = {
  status: "set",
  firm_id: "aaaaaaaa-1111-4111-8111-111111111111",
  caps: { docs_per_day: 11, pages_per_day: 77, ocr_concurrency: 3, llm_witness_concurrency: 4 },
  previous: { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 },
  changed: ["pages_per_day"],
  created: false,
  updated_at: "2026-09-20T04:00:00.000Z",
};

test("#960 the door is called by name, and a cap the person did not touch is OMITTED", async () => {
  await withDoor(
    () => json(RECEIPT),
    async (calls) => {
      const outcome = await setFirmDocumentLimits({
        edits: { pagesPerDay: 77 },
        opKey: "op-caps-held-by-the-caller",
      });

      assert.equal(calls.length, 1);
      const call = calls[0] as Seen;
      assert.ok(call.url.endsWith(`/rpc/${SET_FIRM_DOCUMENT_LIMITS_DOOR}`), call.url);
      // OMITTED, not null: the three caps this call says nothing about are absent from the body,
      // so the door's own defaults decide them and nothing in this app has to know what they are.
      assert.deepEqual(call.body, {
        p_pages_per_day: 77,
        p_op_key: "op-caps-held-by-the-caller",
      });

      assert.deepEqual(outcome, {
        kind: "set",
        caps: { docsPerDay: 11, pagesPerDay: 77, ocrConcurrency: 3, llmWitnessConcurrency: 4 },
        previous: { docsPerDay: 11, pagesPerDay: 22, ocrConcurrency: 3, llmWitnessConcurrency: 4 },
        changed: ["pagesPerDay"],
        created: false,
      });
    },
  );
});

test("#960 a receipt this build cannot read whole is UNAVAILABLE, never half-rendered", async () => {
  // Every field is positively checked. Five shapes, each breaking exactly one thing a card
  // would otherwise paint: a cap missing from `caps`, a non-integer cap, a `changed` entry
  // naming a column this build does not know, a non-boolean `created`, and the PENDING status
  // `_reserve_op` hands back while another call is still in flight.
  const broken: readonly unknown[] = [
    { ...RECEIPT, caps: { docs_per_day: 11, pages_per_day: 77, ocr_concurrency: 3 } },
    { ...RECEIPT, caps: { ...RECEIPT.caps, ocr_concurrency: 3.5 } },
    { ...RECEIPT, changed: ["max_concurrent_runs"] },
    { ...RECEIPT, created: "false" },
    { ...RECEIPT, status: "pending" },
  ];
  for (const body of broken) {
    await withDoor(
      () => json(body),
      async () => {
        const outcome = await setFirmDocumentLimits({ edits: { pagesPerDay: 77 }, opKey: "k" });
        assert.deepEqual(outcome, { kind: "unavailable" }, JSON.stringify(body));
      },
    );
  }
});

test("#960 a refusal is classified by CODE and REASON, and its sentence travels verbatim", async () => {
  // The ceiling refusal NAMES the number, which is the only place this app learns it — so the
  // sentence is carried through untouched rather than re-worded into a house string.
  await withDoor(
    () => json(
      { code: "CLR10", message: "docs_per_day may not exceed the estate ceiling of 10000",
        details: JSON.stringify({ reason: "cap_above_ceiling" }) },
      400,
    ),
    async () => {
      const outcome = await setFirmDocumentLimits({ edits: { docsPerDay: 10001 }, opKey: "k" });
      assert.deepEqual(outcome, {
        kind: "refused",
        code: "CLR10",
        reason: "cap_above_ceiling",
        message: "docs_per_day may not exceed the estate ceiling of 10000",
      });
    },
  );
  // CLR04 carries NO detail — `clara._human_ctx`'s own shape. The code alone is the
  // discriminant and no reason is invented from the message.
  await withDoor(
    () => json({ code: "CLR04", message: "insufficient role" }, 403),
    async () => {
      const outcome = await setFirmDocumentLimits({ edits: { docsPerDay: 5 }, opKey: "k" });
      assert.deepEqual(outcome,
        { kind: "refused", code: "CLR04", reason: null, message: "insufficient role" });
    },
  );
});

test("#960 every save mints its OWN operation identity — two saves of the SAME edit never share one", () => {
  // THE DEFECT THIS CELL EXISTS FOR (adversarial review ADV-L10-01 / spec review S-960-1,
  // 2026-09-20): the first cut derived the key from `(caller, the four values)`, so the SAME
  // person setting a cap back to a number they had set before re-minted the SAME key.
  // `clara._reserve_op` then replayed the ORIGINAL receipt (0004:46-59 — replay is keyed on
  // `(firm, fn, op_key)` and `clara.op_receipts` rows never expire), the door wrote nothing, and
  // the card rendered "Saved …" off a receipt it had not earned. Proved live against clara_l10:
  // set(8) → set(2) → set(8) left the stored cap at 2 and wrote two audit rows, not three.
  const a = newProcessingCapsOpKey();
  const b = newProcessingCapsOpKey();
  assert.notEqual(a, b, "a second save is a second operation and must re-enter the door");
  assert.match(a, /^op-caps-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "the key is this door's own prefix plus one uuid — nothing derived from what was typed");
  // 64 mints, all distinct: the property this door needs is UNIQUENESS per submission, and a
  // single pair passing could be luck.
  const many = new Set(Array.from({ length: 64 }, () => newProcessingCapsOpKey()));
  assert.equal(many.size, 64);
});
