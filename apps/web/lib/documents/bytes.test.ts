import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchDocumentBytes } from "./bytes";
import { isRuntimeError } from "./runtime-wire";
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

test("fetchDocumentBytes: GETs the same-origin runtime proxy route with a Bearer token, returns a revocable object URL for an allow-listed content-type", async () => {
  let seenUrl = ""; let seenAuth = "";
  const original = globalThis.fetch;
  const revoked: string[] = [];
  const originalRevoke = URL.revokeObjectURL;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:fake-url";
  URL.revokeObjectURL = (u: string) => { revoked.push(u); };
  let seenRedirect: string | undefined;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    seenUrl = String(url);
    seenAuth = new Headers(init?.headers).get("authorization") ?? "";
    seenRedirect = init?.redirect;
    return new Response(new Blob(["bytes"]), { status: 200, headers: { "content-type": "application/pdf" } });
  }) as typeof fetch;
  try {
    const out = await fetchDocumentBytes("doc-1", { session: session() });
    assert.equal(seenUrl, "/api/runtime/documents/doc-1/bytes", "must be the same-origin runtime proxy, never runtimeBase()-prefixed");
    assert.equal(seenAuth, "Bearer tok");
    assert.equal(seenRedirect, "manual", "an unauthenticated 307-to-/login must never be silently followed into a 200 text/html page");
    assert.equal(out.mime, "application/pdf");
    out.revoke();
    assert.deepEqual(revoked, ["blob:fake-url"]);
  } finally {
    globalThis.fetch = original;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test("fetchDocumentBytes: a non-2xx throws a typed RuntimeError, classified by status, never a raw body slice", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope — internal detail", { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(fetchDocumentBytes("doc-1", { session: session() }), (e: unknown) => {
      assert.ok(isRuntimeError(e));
      assert.equal(e.kind, "not_found");
      assert.doesNotMatch(e.message, /internal detail/);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchDocumentBytes: a 200 with a content-type OUTSIDE the intake allowlist (e.g. text/html — an unauthenticated redirect-follow landing on a login page) is REFUSED before blobbing, never opened", async () => {
  const original = globalThis.fetch;
  let blobbed = false;
  globalThis.fetch = (async () => {
    const res = new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    const originalBlob = res.blob.bind(res);
    res.blob = async () => { blobbed = true; return originalBlob(); };
    return res;
  }) as typeof fetch;
  try {
    await assert.rejects(fetchDocumentBytes("doc-1", { session: session() }), (e: unknown) => {
      assert.ok(isRuntimeError(e));
      assert.equal(e.kind, "malformed");
      assert.match(e.message, /text\/html/);
      return true;
    });
    assert.equal(blobbed, false, "a disallowed content-type must never reach .blob()");
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchDocumentBytes: application/octet-stream (the route's own null-mime fallback) is allowed through", async () => {
  const original = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:fake-url";
  globalThis.fetch = (async () => new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/octet-stream" } })) as typeof fetch;
  try {
    const out = await fetchDocumentBytes("doc-1", { session: session() });
    assert.equal(out.mime, "application/octet-stream");
  } finally {
    globalThis.fetch = original;
    URL.createObjectURL = originalCreate;
  }
});

test("fetchDocumentBytes: forwards an AbortSignal through to the underlying fetch", async () => {
  let seenSignal: AbortSignal | undefined;
  const original = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:fake-url";
  globalThis.fetch = (async (_url, init) => {
    seenSignal = init?.signal ?? undefined;
    return new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/pdf" } });
  }) as typeof fetch;
  try {
    const controller = new AbortController();
    await fetchDocumentBytes("doc-1", { session: session(), signal: controller.signal });
    assert.equal(seenSignal, controller.signal);
  } finally {
    globalThis.fetch = original;
    URL.createObjectURL = originalCreate;
  }
});
