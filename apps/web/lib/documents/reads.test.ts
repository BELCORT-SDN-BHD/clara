// reads.ts — the client Documents workbench's read shapes. Mocked-fetch style ported
// from doors.test.ts's own precedent: the property under test is that each function
// builds the RIGHT PostgREST path/query and that a batch read short-circuits on empty
// input WITHOUT ever calling fetch (law 2's absence posture) — the CLR/status
// classification itself stays proven in wire.test.ts/read.test.ts; this file never
// re-derives it.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listDocumentsByIds, listActiveFilingsForClient, listFilingsForDocument,
  listOpenCandidatesForClient, listAttemptsByIds, listExtractionsForDocument,
  listRegionsForExtractionIds, listEntriesForDocument, listFirmClients, readCorrectionPreview,
  getDocumentExtract,
} from "./reads";
import type { SessionTokenAccessor } from "@/lib/session";

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
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

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

// --- batch reads: empty input never calls fetch --------------------------------

test("listDocumentsByIds([]) resolves [] WITHOUT calling fetch", async () => {
  let called = false;
  await withMockedFetch(
    async () => { called = true; return okJson([]); },
    async () => {
      const rows = await listDocumentsByIds([], { session: session() });
      assert.deepEqual(rows, []);
    },
  );
  assert.equal(called, false);
});

test("listAttemptsByIds([]) and listRegionsForExtractionIds([]) also short-circuit", async () => {
  let called = false;
  await withMockedFetch(
    async () => { called = true; return okJson([]); },
    async () => {
      assert.deepEqual(await listAttemptsByIds([], { session: session() }), []);
      assert.deepEqual(await listRegionsForExtractionIds([], { session: session() }), []);
    },
  );
  assert.equal(called, false);
});

// --- query construction ----------------------------------------------------------

test("listDocumentsByIds: dedupes ids and builds an in.() filter", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([{ id: "d1" }]); },
    async () => {
      await listDocumentsByIds(["d1", "d2", "d1"], { session: session() });
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/documents\?id=in\.\(d1,d2\)/);
  assert.match(seenUrl, /select=/);
});

test("listActiveFilingsForClient: filters by client_id and retired_at=is.null", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listActiveFilingsForClient("client-1", { session: session() }); },
  );
  assert.match(seenUrl, /document_filings\?client_id=eq\.client-1&retired_at=is\.null/);
});

test("listFilingsForDocument: filters by document_id, no retired_at filter (full history)", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listFilingsForDocument("doc-1", { session: session() }); },
  );
  assert.match(seenUrl, /document_filings\?document_id=eq\.doc-1/);
  assert.doesNotMatch(seenUrl, /retired_at=is/, "the full history must carry no retired_at FILTER (retired_at as a selected COLUMN is fine and expected)");
});

test("listOpenCandidatesForClient: filters by client_id and disposition=eq.open", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listOpenCandidatesForClient("client-1", { session: session() }); },
  );
  assert.match(seenUrl, /attribution_candidates\?client_id=eq\.client-1&disposition=eq\.open/);
});

test("listExtractionsForDocument: orders by version_n.desc", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listExtractionsForDocument("doc-1", { session: session() }); },
  );
  assert.match(seenUrl, /document_extractions\?document_id=eq\.doc-1/);
  assert.match(seenUrl, /order=version_n\.desc/);
});

test("listEntriesForDocument: reads journal_entries directly, filtered by BOTH document_id AND client_id (independent review 2026-08-27, F4)", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listEntriesForDocument("doc-1", "client-1", { session: session() }); },
  );
  assert.match(seenUrl, /\/rest\/v1\/journal_entries\?document_id=eq\.doc-1&client_id=eq\.client-1/, "a client-scoped surface must never list another client's entries unlabeled");
});

test("listFirmClients: orders by name.asc", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listFirmClients({ session: session() }); },
  );
  assert.match(seenUrl, /\/rest\/v1\/clients\?select=/);
  assert.match(seenUrl, /order=name\.asc/);
});

// --- readCorrectionPreview: a read RPC riding callDoor's transport ---------------

test("readCorrectionPreview: POSTs to rpc/preview_wrong_client_correction with no op_key", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  const preview = {
    document_id: "doc-1", from_client: "c1", to_client: "c2", filing_id: "f1",
    books_version: 1, items: [], period_model: "m", closed_period_blockers: [], subledger_model: "s",
  };
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return okJson(preview);
    },
    async () => {
      const result = await readCorrectionPreview("doc-1", "c1", "c2", { session: session() });
      assert.deepEqual(result, preview);
    },
  );
  assert.match(seenUrl, /\/rpc\/preview_wrong_client_correction/);
  assert.deepEqual(seenBody, { p_document: "doc-1", p_from_client: "c1", p_to_client: "c2" });
});

test("readCorrectionPreview: a governed refusal (CLR) still surfaces verbatim through callDoor", async () => {
  // preview_wrong_client_correction is a READ (no op_key, mutates nothing), but it
  // still rides callDoor's POST .../rpc/ transport — a refusal from it classifies
  // through the exact same status-then-CLR ordering as any write (wire.ts's
  // classifyPgrestFailure has no opinion on which verb called it); this test proves
  // THIS module's wiring surfaces that refusal verbatim, not the ordering itself
  // (already proven independently in wire.test.ts).
  await withMockedFetch(
    async () => new Response(JSON.stringify({ code: "CLR01", message: "CLR01: client attribution not established." }), { status: 400 }),
    async () => {
      const { isDoorRefusal } = await import("@/lib/doors");
      await assert.rejects(
        readCorrectionPreview("doc-1", "c1", "c2", { session: session() }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          return true;
        },
      );
    },
  );
});

// --- T6: get_document_extract -----------------------------------------------------

test("getDocumentExtract: posts get_document_extract with document/client/max_chars and returns the envelope verbatim", async () => {
  let seenFn = ""; let seenBody: unknown;
  const envelope = {
    document: { id: "doc-1", sha256: "abc", original_filename: "invoice.pdf", mime_type: "application/pdf", byte_size: 1024, bytes_verified_at: "2026-04-01T00:00:00Z", page_count: 1, extraction_status: "done", document_kind: "invoice", financial_date: "2026-04-01" },
    unassigned: false,
    filing: { id: "filing-1", client_id: "c1", filed_at: "2026-04-02T00:00:00Z", basis: "human" },
    extractions: [{ id: "e1", engine_id: "eng-1", engine_kind: "invoice_facts", version_n: 1, status: "done", page_count: 1, extracted_at: "2026-04-01T00:00:01Z", envelope_text: "{}", raw_sha256: null, normalization_version: null }],
    regions: [],
    max_chars: 20000,
  };
  await withMockedFetch(
    async (url, init) => {
      const s = String(url);
      seenFn = s.split("/rpc/")[1] ?? "";
      seenBody = JSON.parse(String(init?.body));
      return okJson(envelope);
    },
    async () => {
      const out = await getDocumentExtract("doc-1", "c1", 20000, { session: session() });
      assert.deepEqual(out, envelope);
    },
  );
  assert.equal(seenFn, "get_document_extract");
  assert.deepEqual(seenBody, { p_document: "doc-1", p_client: "c1", p_max_chars: 20000 });
});

// F2 (independent review, fix-required): the `admitted` CTE legitimately
// resolves to zero rows — a document filed to a DIFFERENT client than
// `p_client` and not unassigned — so the RPC's own 200 response body is the
// JSON literal `null`, not a refusal. Proves this module returns that `null`
// VERBATIM (never asserts it away) so the caller can render an honest
// not-available state instead of a silent blank.
test("getDocumentExtract: returns null verbatim when the DB admits nothing (wrong-client / not-unassigned), never throws", async () => {
  await withMockedFetch(
    async () => okJson(null),
    async () => {
      const out = await getDocumentExtract("doc-1", "other-client", 20000, { session: session() });
      assert.equal(out, null);
    },
  );
});
