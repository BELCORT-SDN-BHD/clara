// loaders.ts — combined reads for the workbench's hydrated cards. Fetch mocked at
// the boundary (every underlying reads.ts/intake.ts call ultimately goes through
// `fetch`), routed by matching each relation name in the URL — the property under
// test is the MERGE/FILTER logic these loaders add on top of reads.ts's single-
// relation calls, not the PostgREST query construction itself (already proven in
// reads.test.ts). `fakeT` stands in for the real `useTranslations()` — it returns
// the KEY itself, so a test can assert on the EXACT key readErrorKey resolved to
// without depending on any English wording (copy.ts's own job).

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFiledDocuments, loadFirmClients, loadOpenCandidates, loadDocumentDetail, type Translator } from "./loaders";
import type { SessionTokenAccessor } from "@/lib/session";

const fakeT: Translator = (key) => key;

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
}

function withMockedFetch(routes: Record<string, unknown>, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    const u = String(url);
    for (const [needle, body] of Object.entries(routes)) {
      if (u.includes(needle)) return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unmocked fetch: ${u}`);
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

function doc(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id, sha256: "x".repeat(64), original_filename: `${id}.pdf`, mime_type: "application/pdf",
    byte_size: 1, storage_path: "p", uploaded_by: "u1", created_at: "2026-01-01T00:00:00Z",
    bytes_verified_at: null, page_count: null, extraction_status: "done", document_kind: null,
    financial_date: null, retention_state: "unanchored", retain_until: null, retention_basis: null,
    legal_hold: false, legal_hold_reason: null, ...overrides,
  };
}

test("loadFiledDocuments: merges filing+document and DROPS a filing whose document could not be read", async () => {
  await withMockedFetch(
    {
      document_filings: [
        { id: "f1", document_id: "d1", client_id: "c1", filed_at: "2026-01-02T00:00:00Z", filed_by: "u1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "r1" },
        { id: "f2", document_id: "d-missing", client_id: "c1", filed_at: "2026-01-01T00:00:00Z", filed_by: "u1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "r2" },
      ],
      // Only d1 comes back from the batch documents read — d-missing is absent
      // (simulating a row this pass could not see), never asserted as anything.
      documents: [doc("d1")],
    },
    async () => {
      const entries = await loadFiledDocuments("c1", fakeT, { session: session() });
      assert.equal(entries.length, 1);
      assert.equal(entries[0]!.filing.id, "f1");
      assert.equal(entries[0]!.document.id, "d1");
    },
  );
});

test("loadOpenCandidates: resolves a candidate down to its document via the attempt, dropping unresolvable ones", async () => {
  await withMockedFetch(
    {
      attribution_candidates: [
        { id: "cand1", attempt_id: "att1", client_id: "c1", rank: 1, rule_kind: "name_exact", disposition: "open", created_at: "2026-01-01T00:00:00Z" },
      ],
      attribution_attempts: [
        { id: "att1", document_id: "d1", matcher_version: "v1", outcome: "candidate", conflict_reason: null, created_at: "2026-01-01T00:00:00Z" },
      ],
      documents: [doc("d1")],
    },
    async () => {
      const entries = await loadOpenCandidates("c1", fakeT, { session: session() });
      assert.equal(entries.length, 1);
      assert.equal(entries[0]!.candidate.id, "cand1");
      assert.equal(entries[0]!.document.id, "d1");
    },
  );
});

test("loadOpenCandidates: zero open candidates never attempts the attempts/documents batch reads", async () => {
  const seen: string[] = [];
  const original = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    seen.push(String(url));
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;
  try {
    const entries = await loadOpenCandidates("c1", fakeT, { session: session() });
    assert.deepEqual(entries, []);
    assert.equal(seen.length, 1, "only the candidates read itself should fire — attempts/documents batches short-circuit on empty input");
  } finally {
    globalThis.fetch = original;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
});

test("loadFirmClients: a 403 (forbidden) translates via readErrorKey('forbidden'), distinct from other kinds", async () => {
  const original = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "permission denied for table clients" }), { status: 403 })) as typeof fetch;
  try {
    await assert.rejects(loadFirmClients(fakeT, { session: session() }), (e: unknown) => {
      assert.ok(e instanceof Error);
      assert.equal(e.message, "readError.forbidden");
      return true;
    });
  } finally {
    globalThis.fetch = original;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
});

test("loadFiledDocuments: a 401 (session expired) translates via readErrorKey('unauthenticated'), distinct from a 403", async () => {
  const original = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "JWT expired" }), { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(loadFiledDocuments("c1", fakeT, { session: session() }), (e: unknown) => {
      assert.ok(e instanceof Error);
      assert.equal(e.message, "readError.unauthenticated");
      return true;
    });
  } finally {
    globalThis.fetch = original;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
});

test("loadDocumentDetail: returns null when the document itself cannot be read (never crashes, never fabricates)", async () => {
  await withMockedFetch(
    {
      documents: [], document_filings: [], document_extractions: [], journal_entries: [],
      document_processing_tasks_visible: [],
    },
    async () => {
      const bundle = await loadDocumentDetail("doc-gone", "c1", fakeT, { session: session() });
      assert.equal(bundle, null);
    },
  );
});

test("loadDocumentDetail: scopes the entries leg to BOTH document_id AND clientId (F4)", async () => {
  let seenEntriesUrl: string | null = null;
  const original = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("journal_entries")) { seenEntriesUrl = u; return new Response(JSON.stringify([]), { status: 200 }); }
    // Anchored to the RELATION PATH, not a loose substring: `documents`'s own
    // select list contains a `document_kind` COLUMN, whose name itself contains
    // "document_" — a naive `!u.includes("document_")` exclusion misfires on it.
    if (/\/rest\/v1\/documents\?/.test(u)) return new Response(JSON.stringify([doc("d1")]), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;
  try {
    const bundle = await loadDocumentDetail("d1", "client-9", fakeT, { session: session() });
    assert.ok(bundle);
    assert.match(seenEntriesUrl ?? "", /document_id=eq\.d1&client_id=eq\.client-9/);
  } finally {
    globalThis.fetch = original;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
});

test("loadDocumentDetail: only reads regions for the CURRENT (done, non-superseded) extraction", async () => {
  let seenRegionsUrl: string | null = null;
  const original = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("document_regions")) { seenRegionsUrl = u; return new Response(JSON.stringify([]), { status: 200 }); }
    if (u.includes("document_extractions")) {
      return new Response(JSON.stringify([
        { id: "ex-old", document_id: "d1", engine_id: "e1", engine_kind: "ocr", version_n: 1, superseded_by: "ex-new", status: "done", page_count: 1, extracted_at: "2026-01-01T00:00:00Z" },
        { id: "ex-new", document_id: "d1", engine_id: "e1", engine_kind: "ocr", version_n: 2, superseded_by: null, status: "done", page_count: 1, extracted_at: "2026-01-02T00:00:00Z" },
        { id: "ex-failed", document_id: "d1", engine_id: "e1", engine_kind: "ocr", version_n: 3, superseded_by: null, status: "failed", page_count: null, extracted_at: "2026-01-03T00:00:00Z" },
      ]), { status: 200 });
    }
    if (u.includes("documents")) return new Response(JSON.stringify([doc("d1")]), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;
  try {
    const bundle = await loadDocumentDetail("d1", "client-1", fakeT, { session: session() });
    assert.ok(bundle);
    assert.ok(seenRegionsUrl, "regions must be fetched (a current extraction exists)");
    assert.match(seenRegionsUrl!, /extraction_id=in\.\(ex-new\)/);
  } finally {
    globalThis.fetch = original;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
});
