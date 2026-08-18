// review.ts's getMachineTotal — F-A1 PR-3a follow-up (fold M-1 from the fa1-byte-verify
// review of f-a1/pr3a-consumers). getMachineTotal carried the SAME defect class the two
// runtime toolfaces (autoDraft.v8.tools.ts / chatTurn.v12.tools.ts) were widened to fix:
// `engine_kind === "invoice_facts"` alone, and a cross-regime-blind `version_n desc` sort
// that would let a stale legacy generation outrank a fresher witness pair. Widened here with
// the SAME M7 selection rule (design §3.8) — see getMachineTotal's own header for the
// full statement. Mocks globalThis.fetch — the accounts/api.test.ts idiom — no live DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getMachineTotal } from "./review";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const DOC = "22222222-2222-4222-8222-222222222222";

/** A minimal, shape-accurate get_document_extract payload (0009 shape; F-A1 PR-1's
 *  `extracted_at` addition on both extractions[] and regions[] entries). */
function extractPayload(extractions: Record<string, unknown>[], regions: Record<string, unknown>[]) {
  return { document: { id: DOC }, unassigned: false, filing: { id: "fil-1" }, extractions, regions, max_chars: 20000 };
}

test("a witness-only extract (llm_text_facts, engine_confidence NULL) yields the machine total + quote — the widened filter must SELECT it, not drop it", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  t.mock.method(globalThis, "fetch", async () =>
    jsonRes(
      extractPayload(
        [{ id: "ext-w", status: "done", version_n: 1, extracted_at: "2026-08-19T10:00:00+00:00" }],
        [
          {
            id: "reg-w", extraction_id: "ext-w", engine_kind: "llm_text_facts", version_n: 1,
            extracted_at: "2026-08-19T10:00:00+00:00", field_path: "invoice.total",
            monetary_cents: 60000, engine_confidence: null, text_content: "RM 600.00",
          },
        ],
      ),
    ),
  );
  const out = await getMachineTotal("jwt", DOC);
  assert.deepEqual(out, { cents: 60000, region: "reg-w", confidence: null, quote: "RM 600.00" });
});

test("a legacy-only extract (invoice_facts) behaves BYTE-IDENTICALLY to today: same filter, same stable sort, same [0] pick", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  t.mock.method(globalThis, "fetch", async () =>
    jsonRes(
      extractPayload(
        [
          { id: "ext-1", status: "done", version_n: 1, extracted_at: "2026-08-01T00:00:00+00:00" },
          { id: "ext-2", status: "done", version_n: 2, extracted_at: "2026-08-02T00:00:00+00:00" },
        ],
        [
          {
            id: "reg-v1", extraction_id: "ext-1", engine_kind: "invoice_facts", version_n: 1,
            extracted_at: "2026-08-01T00:00:00+00:00", field_path: "invoice.total",
            monetary_cents: 100000, engine_confidence: 0.97, text_content: "RM 1,000.00",
          },
          {
            id: "reg-v2", extraction_id: "ext-2", engine_kind: "invoice_facts", version_n: 2,
            extracted_at: "2026-08-02T00:00:00+00:00", field_path: "invoice.total",
            monetary_cents: 250000, engine_confidence: 0.99, text_content: "RM 2,500.00",
          },
        ],
      ),
    ),
  );
  const out = await getMachineTotal("jwt", DOC);
  // The LATEST version_n wins, exactly as the pre-widening sort-and-take-[0] already did —
  // no witness rows are present, so the cross-regime branch never engages.
  assert.deepEqual(out, { cents: 250000, region: "reg-v2", confidence: 0.99, quote: "RM 2,500.00" });
});

test("cross-regime precedence: a witness pair minted AFTER a legacy read WINS by extracted_at, never by version_n", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  t.mock.method(globalThis, "fetch", async () =>
    jsonRes(
      extractPayload(
        [
          { id: "ext-legacy", status: "done", version_n: 3, extracted_at: "2026-08-01T00:00:00+00:00" },
          { id: "ext-witness", status: "done", version_n: 1, extracted_at: "2026-08-10T00:00:00+00:00" },
        ],
        [
          {
            id: "reg-legacy", extraction_id: "ext-legacy", engine_kind: "invoice_facts", version_n: 3,
            extracted_at: "2026-08-01T00:00:00+00:00", field_path: "invoice.total",
            monetary_cents: 111100, engine_confidence: 0.98, text_content: "RM 1,111.00",
          },
          {
            id: "reg-witness", extraction_id: "ext-witness", engine_kind: "llm_text_facts", version_n: 1,
            extracted_at: "2026-08-10T00:00:00+00:00", field_path: "invoice.total",
            monetary_cents: 222200, engine_confidence: null, text_content: "RM 2,222.00",
          },
        ],
      ),
    ),
  );
  const out = await getMachineTotal("jwt", DOC);
  // The FRESHER witness pair wins despite version_n=1 < version_n=3 — a bare cross-regime
  // version_n sort (the pre-widening defect class) would have picked the legacy row instead.
  assert.deepEqual(out, { cents: 222200, region: "reg-witness", confidence: null, quote: "RM 2,222.00" });
});
