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

import { findEntryClient, findEntryForDocument, listClientEvidenceDocuments, listSpokenForDocuments, mergeSpokenFor, type EvidenceDocument } from "./evidence";
import type { SessionTokenAccessor } from "@/lib/session";

const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VERIFIED = "d1111111-1111-4111-8111-111111111111";
const UNVERIFIED = "d2222222-2222-4222-8222-222222222222";
/** A SIBLING client of the same firm: the document is actively filed to both
 *  (`uq_document_filing_active` is per (document, client), 0007:93) and this one holds the
 *  posted entry. Every claimant-scope cell below is about telling the two apart. */
const SIBLING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
    (url) => (url.includes("entry_evidence_links") ? [{ entry_id: "e1", client_id: CLIENT }] : []),
    async (urls) => {
      assert.deepEqual(await findEntryForDocument(VERIFIED, { session }), { entryId: "e1", clientId: CLIENT });
      assert.ok(urls[0]!.includes("released_at=is.null"),
        `the links read must exclude released bindings (asked: ${urls[0]})`);
    },
  );
});

test("t728d: the conflict lookup is FIRM-WIDE and names the claimant — a sibling client's entry resolves, with a route into THAT client's journal", async () => {
  // The evidence invariant has no client column: `uq_entry_evidence_links_document` is per
  // document alone (0182:345) and `_document_posting_entry` joins on the FIRM. A document
  // actively filed to two clients of one firm can therefore be held by a sibling's entry, and a
  // client-scoped read (which both arms carried until the delta review) answered null — a refusal
  // with no way to reach the entry it is about.
  await withRows(
    (url) => (url.includes("entry_evidence_links") ? [{ entry_id: "sib-1", client_id: SIBLING }] : []),
    async (urls) => {
      assert.deepEqual(await findEntryForDocument(VERIFIED, { session }),
        { entryId: "sib-1", clientId: SIBLING },
        "the claimant travels with the entry, because the route is built from it");
      assert.equal(urls[0]!.includes("client_id=eq."), false,
        `the read must not narrow to the asking client (asked: ${urls[0]})`);
      assert.ok(urls[0]!.includes("select=entry_id,client_id"), urls[0]);
    },
  );
});

test("t728d: findEntryClient names the claimant of one entry id, firm-scoped by RLS alone", async () => {
  await withRows(
    () => [{ client_id: SIBLING }],
    async (urls) => {
      assert.equal(await findEntryClient("e-9", { session }), SIBLING);
      assert.ok(urls[0]!.includes("journal_entries?id=eq.e-9"), urls[0]);
      assert.equal(urls[0]!.includes("client_id=eq."), false,
        `the composer's fallback must not narrow to the asking client either (asked: ${urls[0]})`);
    },
  );
  // …and an id that resolves to nothing readable is null, never a guessed route.
  await withRows(() => [], async () => {
    assert.equal(await findEntryClient("e-9", { session }), null);
  });
});

test("t634: the conflict lookup falls through to the DOCUMENT-CODING lane, approved and not reversed", async () => {
  await withRows(
    (url) => (url.includes("entry_evidence_links") ? [] : [{ id: "coded-1", client_id: SIBLING }]),
    async (urls) => {
      assert.deepEqual(await findEntryForDocument(VERIFIED, { session }), { entryId: "coded-1", clientId: SIBLING });
      const coded = urls[1] ?? "";
      assert.ok(coded.includes("status=eq.approved"), coded);
      assert.ok(coded.includes("reversed_by=is.null"), coded);
    },
  );
});

test("t634: nothing holds the document — a link is never invented", async () => {
  await withRows(() => [], async () => {
    assert.equal(await findEntryForDocument(VERIFIED, { session }), null);
  });
});

// ---------------------------------------------------------------------------
// #728 finding 5 — clara.list_spoken_for_documents and the picker's own merge.
// ---------------------------------------------------------------------------

const ENTRY = "e1111111-1111-4111-8111-111111111111";
/** A SIBLING client of the same firm — the claimant a firm-wide read may name (migration 0183's
 *  own scope: uq_document_filing_active is per (document, client), the evidence invariant is not). */
const OTHER_CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("t728: listSpokenForDocuments reads the RPC and returns the rows verbatim", async () => {
  await withRows(
    (url) => (url.includes("/rest/v1/rpc/list_spoken_for_documents")
      ? [{ document_id: VERIFIED, entry_id: ENTRY, client_id: CLIENT, client_name: "Acme Sdn Bhd", via: "evidence_link" }]
      : []),
    async (urls) => {
      const rows = await listSpokenForDocuments(CLIENT, { session });
      assert.deepEqual(rows, [{ document_id: VERIFIED, entry_id: ENTRY, client_id: CLIENT, client_name: "Acme Sdn Bhd", via: "evidence_link" }]);
      assert.ok(urls[0]!.includes("list_spoken_for_documents"));
    },
  );
});

test("t728: listSpokenForDocuments THROWS on a malformed (non-array) envelope — never an empty answer", async () => {
  // An empty array is a REAL answer meaning "nothing is spoken for", and every caller renders it
  // by enabling every option. Coercing a malformed envelope into it would silently turn "we could
  // not check" into "we checked and it is free" — the exact conflation mergeSpokenFor's third
  // state exists to prevent (review round, N11). Both callers catch and show their own
  // "check unavailable" line, which the two picker cells pin.
  await withRows(() => ({ not: "an array" }), async () => {
    await assert.rejects(() => listSpokenForDocuments(CLIENT, { session }), /array of rows/);
  });
});

const DOC_A: EvidenceDocument = { documentId: "d1", filename: "a.pdf", kind: "invoice", filedAt: "2026-09-01T00:00:00Z", financialDate: null };
const DOC_B: EvidenceDocument = { documentId: "d2", filename: "b.pdf", kind: "receipt", filedAt: "2026-09-02T00:00:00Z", financialDate: null };

test("t728: mergeSpokenFor annotates exactly the named documents, never hides one", async () => {
  const merged = mergeSpokenFor([DOC_A, DOC_B], [
    { document_id: "d1", entry_id: ENTRY, client_id: CLIENT, client_name: "Acme Sdn Bhd", via: "coding" },
  ]);
  assert.deepEqual(merged.map((d) => d.documentId), ["d1", "d2"], "both documents survive the merge — nothing is filtered out");
  assert.deepEqual(merged[0]!.spokenFor, { entryId: ENTRY, clientId: CLIENT, clientName: "Acme Sdn Bhd", via: "coding" });
  assert.equal(merged[1]!.spokenFor, null);
});

test("t728: the CLAIMANT is carried through the merge even when it is a sibling client, and a missing name stays null rather than becoming a string", async () => {
  const merged = mergeSpokenFor([DOC_A], [
    { document_id: "d1", entry_id: ENTRY, client_id: OTHER_CLIENT, client_name: null, via: "evidence_link" },
  ]);
  assert.deepEqual(merged[0]!.spokenFor, { entryId: ENTRY, clientId: OTHER_CLIENT, clientName: null, via: "evidence_link" },
    "the claimant client is the one the surface links to — the asking client would send a person to a journal the entry is not in");
});

test("t728: mergeSpokenFor with an EMPTY successful read disables nothing", async () => {
  const merged = mergeSpokenFor([DOC_A, DOC_B], []);
  assert.ok(merged.every((d) => d.spokenFor === null));
});

test("t728: mergeSpokenFor with a FAILED read (null) disables nothing — never conflated with 'nothing is spoken for'", async () => {
  const merged = mergeSpokenFor([DOC_A, DOC_B], null);
  assert.ok(merged.every((d) => d.spokenFor === null),
    "a failed check must read exactly like an empty one to the picker — no document is disabled on the strength of a read that never happened");
});
