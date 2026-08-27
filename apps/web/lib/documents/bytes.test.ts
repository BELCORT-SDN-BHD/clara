import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchDocumentBytes } from "./bytes";
import type { SessionTokenAccessor } from "@/lib/session";

function session(token: string | null = "tok"): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

test("fetchDocumentBytes: a null token throws WITHOUT calling fetch", async () => {
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { called = true; throw new Error("must not be called"); }) as typeof fetch;
  try {
    await assert.rejects(fetchDocumentBytes("doc-1", { session: session(null) }), /not signed in/);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(called, false);
});

test("fetchDocumentBytes: GETs the runtime's signed bytes route with a Bearer token, returns a revocable object URL", async () => {
  let seenUrl = ""; let seenAuth = "";
  const original = globalThis.fetch;
  const revoked: string[] = [];
  const originalRevoke = URL.revokeObjectURL;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:fake-url";
  URL.revokeObjectURL = (u: string) => { revoked.push(u); };
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    seenUrl = String(url);
    seenAuth = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(new Blob(["bytes"]), { status: 200, headers: { "content-type": "application/pdf" } });
  }) as typeof fetch;
  try {
    const out = await fetchDocumentBytes("doc-1", { session: session() });
    assert.match(seenUrl, /\/api\/documents\/doc-1\/bytes$/);
    assert.equal(seenAuth, "Bearer tok");
    assert.equal(out.mime, "application/pdf");
    out.revoke();
    assert.deepEqual(revoked, ["blob:fake-url"]);
  } finally {
    globalThis.fetch = original;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test("fetchDocumentBytes: a non-2xx throws honestly with the status", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(fetchDocumentBytes("doc-1", { session: session() }), /document bytes failed \(404\)/);
  } finally {
    globalThis.fetch = original;
  }
});
