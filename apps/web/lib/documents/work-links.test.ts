// #633 AC8 — the document -> Work read.
//
// The gap map's correction is the thing these cells pin: there was never a missing
// READ. `clara.entry_evidence_links` has carried a select grant to
// `clara_authenticated` since 0182:360 under FORCE RLS `firm_id = clara.jwt_firm()`
// (:358-359). What was missing is that nothing asked for `work_id`. So the assertions
// below are about the REQUEST — which relation, which columns, which predicate — and
// about the honest handling of the one read that may legitimately fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTRY_EVIDENCE_LINK_COLS, loadDocumentWorkLinks, workHref } from "./work-links";
import type { SessionTokenAccessor } from "@/lib/session";

const DOC = "d1111111-1111-4111-8111-111111111111";
const CLIENT = "c1111111-1111-4111-8111-111111111111";
const ENTRY = "e1111111-1111-4111-8111-111111111111";
const WORK = "w1111111-1111-4111-8111-111111111111";

const session = (): SessionTokenAccessor => ({ getAccessToken: async () => "tok" });

function withFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
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

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

test("loadDocumentWorkLinks: reads entry_evidence_links DIRECTLY, asks for work_id, and skips released links", async () => {
  let seen = "";
  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes("entry_evidence_links")) {
      seen = url;
      return json([{ entry_id: ENTRY, client_id: CLIENT, work_id: WORK, logical_op_id: "op-1", attached_at: "2026-04-01T00:00:00Z" }]);
    }
    if (url.includes("list_spoken_for_documents")) {
      return json([{ document_id: DOC, entry_id: ENTRY, client_id: CLIENT, client_name: "Rome Properties", via: "evidence_link" }]);
    }
    return json([]);
  }, async () => {
    const out = await loadDocumentWorkLinks(DOC, CLIENT, { session: session() });
    assert.equal(out.links.length, 1);
    assert.equal(out.links[0]!.workId, WORK, "the work id is the whole point of the new column");
    assert.equal(out.links[0]!.logicalOpId, "op-1");
    assert.equal(out.links[0]!.via, "evidence_link", "the complementary door supplies `via`");
    assert.equal(out.links[0]!.clientName, "Rome Properties", "and the CLAIMANT's name");
    assert.equal(out.claimantReadFailed, false);
  });
  assert.match(seen, /entry_evidence_links/, "the relation is read directly — no SECURITY DEFINER wrapper");
  assert.match(seen, /document_id=eq\./);
  assert.match(seen, /released_at=is\.null/, "a reversed entry's link is not Work this file is still producing");
  assert.ok(seen.includes(encodeURIComponent(ENTRY_EVIDENCE_LINK_COLS)) || seen.includes(ENTRY_EVIDENCE_LINK_COLS), seen);
});

test("loadDocumentWorkLinks: no live link is an EMPTY answer, never a fabricated one", async () => {
  await withFetch(async () => json([]), async () => {
    const out = await loadDocumentWorkLinks(DOC, CLIENT, { session: session() });
    assert.deepEqual(out.links, []);
    assert.equal(out.claimantReadFailed, false);
  });
});

test("loadDocumentWorkLinks: a link with a NULL work_id keeps its entry — it is not silently dropped and not called 'no Work'", async () => {
  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes("entry_evidence_links")) {
      return json([{ entry_id: ENTRY, client_id: CLIENT, work_id: null, logical_op_id: null, attached_at: null }]);
    }
    return json([]);
  }, async () => {
    const out = await loadDocumentWorkLinks(DOC, CLIENT, { session: session() });
    assert.equal(out.links.length, 1, "the link EXISTS; only its work id is absent");
    assert.equal(out.links[0]!.workId, null);
    assert.equal(out.links[0]!.entryId, ENTRY);
  });
});

test("loadDocumentWorkLinks: a failed claimant read degrades the DETAIL, never the links themselves", async () => {
  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes("entry_evidence_links")) {
      return json([{ entry_id: ENTRY, client_id: CLIENT, work_id: WORK, logical_op_id: "op-1", attached_at: null }]);
    }
    if (url.includes("list_spoken_for_documents")) return json({ message: "denied" }, 403);
    return json([]);
  }, async () => {
    const out = await loadDocumentWorkLinks(DOC, CLIENT, { session: session() });
    assert.equal(out.links.length, 1, "the direct read stands on its own");
    assert.equal(out.links[0]!.workId, WORK);
    assert.equal(out.links[0]!.via, null);
    assert.equal(out.claimantReadFailed, true, "and the surface is told the detail is missing rather than guessing it");
  });
});

test("loadDocumentWorkLinks: a claimant row for ANOTHER document never decorates this one", async () => {
  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes("entry_evidence_links")) {
      return json([{ entry_id: ENTRY, client_id: CLIENT, work_id: WORK, logical_op_id: null, attached_at: null }]);
    }
    if (url.includes("list_spoken_for_documents")) {
      // Same entry id, DIFFERENT document — `list_spoken_for_documents` answers for a
      // whole client, so it legitimately returns rows this document has no claim on.
      return json([{ document_id: "d9999999-9999-4999-8999-999999999999", entry_id: ENTRY, client_id: CLIENT, client_name: "Other", via: "coding" }]);
    }
    return json([]);
  }, async () => {
    const out = await loadDocumentWorkLinks(DOC, CLIENT, { session: session() });
    assert.equal(out.links[0]!.via, null, "a row about another document must not supply this one's `via`");
    assert.equal(out.links[0]!.clientName, null);
  });
});

test("workHref: the Work's OWN surface — a link, never an inline cancel control on the document", () => {
  assert.equal(workHref(CLIENT, WORK), `/clients/${CLIENT}/work/${WORK}`);
});
