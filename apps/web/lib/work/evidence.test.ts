// #634 — THE EVIDENCE CHOOSER'S OWN READS, under test.
//
// TWO READS, NOT A JOIN, and each one is a fact about the estate rather than a
// preference: `clara.documents` has no client column (the FILING binds a
// document to a client), and `uq_document_filing_active` admits at most one live
// filing per (document, client). So a cell here asserts what the CHOOSER offers,
// which is the only thing a preparer can act on.
//
// THE READS ARE MOCKED AT `fetch`, so each cell exercises the real PostgREST
// URLs `lib/documents/reads.ts` builds — including the `released_at=is.null`
// clause `findEntryForDocument` now carries.

import assert from "node:assert/strict";
import { test } from "node:test";

import { findEntryForDocument, listClientEvidenceDocuments } from "./evidence";
import type { SessionTokenAccessor } from "@/lib/session";

const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VERIFIED = "d1111111-1111-4111-8111-111111111111";
const UNVERIFIED = "d2222222-2222-4222-8222-222222222222";

function filing(documentId: string): Record<string, unknown> {
  return {
    id: `f-${documentId}`, document_id: documentId, client_id: CLIENT,
    filed_at: "2026-09-02T03:00:00Z", filed_by: "u1", basis: null, retired_at: null,
    retirement_reason: null, revision_token: "rev",
  };
}

function document(id: string, bytesVerifiedAt: string | null): Record<string, unknown> {
  return {
    id, sha256: "abc", original_filename: `${id}.pdf`, mime_type: "application/pdf",
    byte_size: 1024, storage_path: "s", uploaded_by: "u1", created_at: "2026-09-01T00:00:00Z",
    bytes_verified_at: bytesVerifiedAt, page_count: 1, extraction_status: "done",
    document_kind: "invoice", financial_date: "2026-09-01", retention_state: null,
    retain_until: null, retention_basis: null, legal_hold: false, legal_hold_reason: null,
  };
}

/** Swap `fetch`, record the URLs asked for, answer by route, restore always. */
async function withRows(
  answer: (url: string) => unknown,
  run: (urls: string[]) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  // `lib/read.ts` refuses to build a request without an origin — the same
  // harness `lib/read.test.ts` uses, for the same reason.
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const urls: string[] = [];
  globalThis.fetch = (async (u: unknown) => {
    urls.push(String(u));
    return new Response(JSON.stringify(answer(String(u))), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await run(urls);
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

test("t634: an UNVERIFIED document is not offered as evidence", async () => {
  // Cross-model review, confirmed against the migration. `clara.
  // _journal_document_filed` applies the estate's custody floor —
  // `bytes_verified_at is not null` — so an unverified upload is not evidence.
  // Offering it builds a chooser whose option can only come back `not_filed`:
  // the form inviting a refusal it could have predicted.
  await withRows(
    (url) =>
      url.includes("document_filings")
        ? [filing(VERIFIED), filing(UNVERIFIED)]
        : [document(VERIFIED, "2026-09-01T00:00:00Z"), document(UNVERIFIED, null)],
    async () => {
      const docs = await listClientEvidenceDocuments(CLIENT, { session });
      assert.deepEqual(docs.map((d) => d.documentId), [VERIFIED],
        "only the byte-verified filing is offerable");
    },
  );
});

test("t634: a filing whose DOCUMENT ROW the caller cannot read is dropped, not blanked", async () => {
  await withRows(
    (url) => (url.includes("document_filings") ? [filing(VERIFIED), filing(UNVERIFIED)] : [document(VERIFIED, "2026-09-01T00:00:00Z")]),
    async () => {
      const docs = await listClientEvidenceDocuments(CLIENT, { session });
      assert.deepEqual(docs.map((d) => d.documentId), [VERIFIED]);
    },
  );
});

test("t634: no filings means no reads and no options", async () => {
  await withRows(
    () => [],
    async (urls) => {
      assert.deepEqual(await listClientEvidenceDocuments(CLIENT, { session }), []);
      assert.equal(urls.length, 1, "a request the caller can prove is pointless is never sent");
    },
  );
});

test("t634: the conflict lookup ignores a RELEASED binding", async () => {
  // A reversal RELEASES the link (migration 0182's `t_entry_evidence_release`),
  // which frees the document for the correction. Without the clause this
  // function would send a human to an entry that is no longer in the books, for
  // a document the door has already freed — the opposite of the conflict it is
  // explaining.
  await withRows(
    (url) => (url.includes("entry_evidence_links") ? [{ entry_id: "e1" }] : []),
    async (urls) => {
      assert.equal(await findEntryForDocument(CLIENT, VERIFIED, { session }), "e1");
      assert.ok(urls[0]!.includes("released_at=is.null"),
        `the links read must exclude released bindings (asked: ${urls[0]})`);
    },
  );
});

test("t634: the conflict lookup falls through to the DOCUMENT-CODING lane, approved and not reversed", async () => {
  await withRows(
    (url) => (url.includes("entry_evidence_links") ? [] : [{ id: "coded-1" }]),
    async (urls) => {
      assert.equal(await findEntryForDocument(CLIENT, VERIFIED, { session }), "coded-1");
      const coded = urls[1] ?? "";
      assert.ok(coded.includes("status=eq.approved"), coded);
      assert.ok(coded.includes("reversed_by=is.null"), coded);
    },
  );
});

test("t634: nothing holds the document — a link is never invented", async () => {
  await withRows(() => [], async () => {
    assert.equal(await findEntryForDocument(CLIENT, VERIFIED, { session }), null);
  });
});
