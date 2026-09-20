// #876 — `loadIntakeReceipts` used to read the CLIENT'S ENTIRE active-filing set
// (`document_filings?client_id=eq.<clientId>&retired_at=is.null`, no document_id filter at all)
// just to check whether the handful of documents its OWN intake rows name are filed here. It now
// asks the bounded question directly, through `listActiveFilingsForDocuments` (reads.ts),
// scoped to exactly the document ids the freshly-read intake rows carry.
//
// `refreshIntakeReceipts` (the settle-poll's OWN tick) is untouched by this ticket — its whole
// point (module header, FIX ROUND 1) is that it reads `document_intakes_visible` ALONE and
// rebuilds every row against the derivation `loadIntakeReceipts` already captured. This file's
// last cell guards that it still issues none of the mount-time reads, filings included.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadIntakeReceipts, refreshIntakeReceipts } from "./receipts";
import type { SessionTokenAccessor } from "@/lib/session";

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
}

const CLIENT = "client-1";

function intakeRow(over: Record<string, unknown> = {}) {
  return {
    id: "i1", uploaded_by: "u1", origin: "documents_tab", original_filename: "invoice.pdf",
    declared_mime: "application/pdf", declared_bytes: 4096, status: "adopted",
    document_id: "doc-1", failure_code: null, expires_at: null,
    created_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:01Z",
    ...over,
  };
}

/** Counts every read by relation/rpc name, and captures the FULL url of the FIRST
 *  `document_filings` request — this file's discriminating evidence. */
function makeFetch(counts: Record<string, number>, urls: Record<string, string>, opts: {
  intakes?: unknown[];
  unassigned?: unknown[];
  caller?: unknown[];
  filings?: unknown[];
  docs?: unknown[];
} = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const relation = url.includes("/rpc/")
      ? url.slice(url.indexOf("/rpc/") + 5).split("?")[0]!
      : (/\/rest\/v1\/([a-z_]+)/.exec(url)?.[1] ?? "unknown");
    counts[relation] = (counts[relation] ?? 0) + 1;
    if (!(relation in urls)) urls[relation] = url;
    const body = (() => {
      switch (relation) {
        case "document_intakes_visible": return opts.intakes ?? [];
        case "list_unassigned_documents": return opts.unassigned ?? [];
        case "caller_context": return opts.caller ?? [];
        case "document_filings": return opts.filings ?? [];
        case "documents": return opts.docs ?? [];
        default: return [];
      }
    })();
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
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

test("#876 — loadIntakeReceipts no longer issues a CLIENT-WIDE filings request on mount", async () => {
  const counts: Record<string, number> = {};
  const urls: Record<string, string> = {};
  await withMockedFetch(
    makeFetch(counts, urls, {
      intakes: [intakeRow({ document_id: "doc-1" })],
      filings: [{ id: "f1", document_id: "doc-1", client_id: CLIENT, filed_at: "2026-04-02T00:00:00Z", filed_by: "u1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "r1" }],
      docs: [{ id: "doc-1", mime_type: "application/pdf", document_kind: "invoice" }],
    }),
    async () => {
      await loadIntakeReceipts(CLIENT, { session: session() });
    },
  );
  assert.ok((counts.document_filings ?? 0) >= 1, "control: loadIntakeReceipts must still read document_filings at all");
  assert.doesNotMatch(urls.document_filings!, /client_id=eq\./,
    `the mount-time filings read must never filter by the whole client — saw ${urls.document_filings}`);
  assert.match(urls.document_filings!, /document_id=in\.\(doc-1\)/,
    `the mount-time filings read must be scoped to EXACTLY the intake rows' own document ids — saw ${urls.document_filings}`);
});

test("#876 — an intake row still resolves filedHere correctly through the bounded read", async () => {
  await withMockedFetch(
    makeFetch({}, {}, {
      intakes: [intakeRow({ document_id: "doc-1" })],
      filings: [{ id: "f1", document_id: "doc-1", client_id: CLIENT, filed_at: "2026-04-02T00:00:00Z", filed_by: "u1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "r1" }],
      docs: [{ id: "doc-1", mime_type: "application/pdf", document_kind: "invoice" }],
    }),
    async () => {
      const load = await loadIntakeReceipts(CLIENT, { session: session() });
      assert.equal(load.receipts.length, 1);
      assert.equal(load.receipts[0]!.filedHere, true, "the bounded read must still find the filing that names this exact document");
      assert.equal(load.receipts[0]!.documentKind, "invoice");
    },
  );
});

test("#876 — a document with NO filing at all issues no wasted document_filings row and renders unfiled", async () => {
  await withMockedFetch(
    makeFetch({}, {}, {
      intakes: [intakeRow({ document_id: "doc-1", uploaded_by: "u1" })],
      caller: [{ user_id: "u1", firm_id: "f1", firm_name: "F", role: "owner", role_rank: 40, is_operator: false }],
      unassigned: [{ id: "doc-1", mime_type: "application/pdf", document_kind: null, extraction_status: "pending", unassigned: true }],
      filings: [],
    }),
    async () => {
      const load = await loadIntakeReceipts(CLIENT, { session: session() });
      assert.equal(load.receipts[0]!.filedHere, false);
      assert.equal(load.receipts[0]!.unassigned, true);
    },
  );
});

test("#876 — a filing to a DIFFERENT client is never read as filedHere here (document_filings is firm-scoped, not client-scoped, at RLS)", async () => {
  // The correctness catch the bounded read introduces: listActiveFilingsForDocuments carries no
  // client opinion (a document filed to another client is a legitimate row in ITS answer), so
  // rule (a)'s "filed to THIS client" must be enforced client-side, on the bounded result, or a
  // firm-wide filing scope would leak a foreign client's filed document into this one's receipts.
  await withMockedFetch(
    makeFetch({}, {}, {
      intakes: [intakeRow({ document_id: "doc-1", uploaded_by: "someone-else" })],
      filings: [{ id: "f1", document_id: "doc-1", client_id: "a-DIFFERENT-client", filed_at: "2026-04-02T00:00:00Z", filed_by: "u1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "r1" }],
      caller: [{ user_id: "u1", firm_id: "f1", firm_name: "F", role: "owner", role_rank: 40, is_operator: false }],
    }),
    async () => {
      const load = await loadIntakeReceipts(CLIENT, { session: session() });
      assert.equal(load.receipts.length, 0,
        "a document filed to a different client, uploaded by someone else, is neither filed HERE nor mine-and-unattributed — it must not render at all");
    },
  );
});

test("#876 — an EMPTY intake list never even calls the filings relation (listActiveFilingsForDocuments's own short-circuit)", async () => {
  const counts: Record<string, number> = {};
  await withMockedFetch(
    makeFetch(counts, {}, { intakes: [] }),
    async () => { await loadIntakeReceipts(CLIENT, { session: session() }); },
  );
  assert.equal(counts.document_filings ?? 0, 0, "no intake rows means no document ids to ask about — the request must never be sent");
});

test("#876 control: refreshIntakeReceipts (the settle-poll's own tick) still issues NONE of the mount-time reads", async () => {
  const counts: Record<string, number> = {};
  let previous: Awaited<ReturnType<typeof loadIntakeReceipts>> | null = null;
  await withMockedFetch(
    makeFetch({}, {}, {
      intakes: [intakeRow({ document_id: "doc-1" })],
      filings: [{ id: "f1", document_id: "doc-1", client_id: CLIENT, filed_at: "2026-04-02T00:00:00Z", filed_by: "u1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "r1" }],
      docs: [{ id: "doc-1", mime_type: "application/pdf", document_kind: "invoice" }],
    }),
    async () => { previous = await loadIntakeReceipts(CLIENT, { session: session() }); },
  );
  assert.ok(previous, "control: the mount-time load must have produced a derivation to refresh against");
  await withMockedFetch(
    makeFetch(counts, {}, { intakes: [intakeRow({ document_id: "doc-1", status: "adopted" })] }),
    async () => { await refreshIntakeReceipts(previous!, { session: session() }); },
  );
  assert.equal(counts.document_filings ?? 0, 0, "a tick must never re-read filings — #876 must not regress FIX ROUND 1's own promise");
  assert.equal(counts.list_unassigned_documents ?? 0, 0);
  assert.equal(counts.caller_context ?? 0, 0);
  assert.equal(counts.documents ?? 0, 0);
  assert.ok((counts.document_intakes_visible ?? 0) >= 1, "control: the tick's own read still happened");
});
