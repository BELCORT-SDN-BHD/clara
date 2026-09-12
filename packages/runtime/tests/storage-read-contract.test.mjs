// #620 — PROVIDER-CONTRACT CELLS for the Storage READ path
// (packages/runtime/lib/storage.mjs's `classifyGetFailure` / `responseFor` / `downloadCanonical`).
//
// ============================== WHAT CLASS OF EVIDENCE THIS IS ==============================
// PROVIDER CONTRACT (class P), and every cell in this file is labelled so deliberately. It proves
// what THIS CODE does when it is handed the vendor's error envelope — nothing more. It does NOT
// prove that the live Supabase Storage service still returns that envelope: `globalThis.fetch` is
// mocked here and no network call is made. A hosted capture of the GET side is OUTSTANDING and is
// named as such in the ticket's hosted-pending list; the upload side has one (2026-07-26, below),
// the download side does not. Read a green run here as "the classifier is correct about the shapes
// we have evidence for", never as "the provider behaves this way today".
//
// ============================== THE SOURCES THIS FILE RELIES ON =============================
//   1. CAPTURED, IN THIS REPOSITORY: `{"statusCode":"409","error":"Duplicate","message":"…"}`
//      inside an **HTTP 400** — the wrapped-status envelope observed against live storage on
//      2026-07-26 and carried verbatim in packages/runtime/tests/intake-unit.test.mjs:285-325.
//      That incident is why `putCanonical` parses the body at all: `response.status === 409` was
//      never true, so every duplicate upload became a fatal error and the diagnosis cost a day.
//   2. VENDOR-DOCUMENTED: https://supabase.com/docs/guides/storage/debugging/error-codes
//      (fetched 2026-09-12) — the current envelope is `{"code": "...", "message": "..."}` with
//      `NoSuchKey` = 404, `InvalidJWT` = 401, `AccessDenied` = 403, `NoSuchBucket` = 404,
//      `ResourceAlreadyExists` = 409; the page also states that older responses may carry an
//      `httpStatusCode` field beside `code` and `message`.
// BOTH shapes are exercised below, because a deployment can meet either and a classifier that
// knew only the one we captured would answer `unavailable` — i.e. "retry" — for an object that is
// permanently gone.
//
// ============================== THE OTHER HALF: NO VENDOR TEXT ON THE WIRE ==================
// The thrown message deliberately CARRIES a slice of the body (the 2026-07-26 lesson: `(400)`
// alone cannot tell a duplicate from a permission denial), and just as deliberately caps it at 200
// characters so a vendor error PAGE can never become the bulk of a log line. The cells below force
// a 50 KB body and measure the cap. The message never reaches a client: the route answers
// `{error:"storage_error", reason}` and nothing else, which is asserted over HTTP in
// packages/runtime/tests/document-route-e2e.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.RELAY_TEST_MODE = "";
const storage = await import("../lib/storage.mjs");
const { classifyGetFailure, StorageError, hashCanonical, downloadCanonical } = storage;

const FIRM = "11111111-1111-4111-8111-111111111111";
const SHA = "a".repeat(64);
const KEY = `firms/${FIRM}/docs/${SHA}.pdf`;

/** The real-config environment `responseFor` demands before it will make a request at all: a URL,
 *  a dedicated custom role, and a syntactically valid unexpired role JWT whose `role` claim equals
 *  it. Never verified locally — realConfig only decodes it. */
function withRealConfig(fn) {
  const prev = { ...process.env };
  process.env.RELAY_TEST_MODE = "";
  process.env.CLARA_STORAGE_URL = "https://example.supabase.co/storage/v1/object/firm-docs";
  process.env.CLARA_STORAGE_ROLE = "clara_storage_docs";
  const claims = Buffer.from(JSON.stringify({
    role: "clara_storage_docs", exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  process.env.CLARA_STORAGE_ROLE_JWT = `x.${claims}.y`;
  return (async () => {
    try { return await fn(); } finally { Object.assign(process.env, prev); }
  })();
}

// =============================================================================================
// P1 — THE CLASSIFIER, over both documented envelopes. Pure: no fetch, no environment.
// =============================================================================================
test("P1.1 [PROVIDER CONTRACT] the WRAPPED status wins over the transport status", () => {
  // The captured shape: HTTP 400 carrying the service's real status in the body.
  for (const [wrapped, reason] of [["404", "object_missing"], ["410", "object_missing"],
    ["401", "credential_refused"], ["403", "credential_refused"], ["500", "unavailable"],
    ["503", "unavailable"]]) {
    const body = JSON.stringify({ statusCode: wrapped, error: "X", message: "y" });
    assert.deepEqual(classifyGetFailure(400, body), { reason, status: 502 },
      `HTTP 400 wrapping statusCode ${wrapped}`);
  }
  // …and `httpStatusCode`, the legacy field name the vendor's page names beside `code`/`message`.
  assert.equal(classifyGetFailure(400, JSON.stringify({ httpStatusCode: 404, message: "x" })).reason,
    "object_missing");
});

test("P1.2 [PROVIDER CONTRACT] the documented symbolic codes classify without any numeric status", () => {
  for (const [code, reason] of [["NoSuchKey", "object_missing"], ["NoSuchBucket", "object_missing"],
    ["InvalidJWT", "credential_refused"], ["AccessDenied", "credential_refused"]]) {
    assert.equal(classifyGetFailure(400, JSON.stringify({ code, message: "m" })).reason, reason,
      `documented code ${code}`);
    // Case is not identity, and neither is the vendor's spelling: a lower-cased spelling from a
    // different client library must classify the same way.
    assert.equal(classifyGetFailure(400, JSON.stringify({ code: code.toLowerCase(), message: "m" })).reason,
      reason);
  }
  // A MESSAGE that merely quotes a code back is NOT a code. This is the vacuity control: a
  // substring matcher would classify this as object_missing and be wrong.
  assert.equal(
    classifyGetFailure(500, JSON.stringify({ message: "upstream said NoSuchKey while retrying" })).reason,
    "unavailable",
    "prose that mentions a code must not be read as that code");
});

test("P1.3 [PROVIDER CONTRACT] a bare (unwrapped) status classifies, and anything unknown is `unavailable`", () => {
  assert.equal(classifyGetFailure(404, "").reason, "object_missing");
  assert.equal(classifyGetFailure(401, "").reason, "credential_refused");
  assert.equal(classifyGetFailure(403, "").reason, "credential_refused");
  assert.equal(classifyGetFailure(500, "").reason, "unavailable");
  assert.equal(classifyGetFailure(502, "<html>bad gateway</html>").reason, "unavailable");
  // Unknown NEVER means safe: a shape this classifier does not recognise is the RETRYABLE answer,
  // never "the object is gone" (which would tell a reader to re-upload a document that is fine).
  assert.equal(classifyGetFailure(418, JSON.stringify({ statusCode: "not-a-number" })).reason, "unavailable");
  assert.equal(classifyGetFailure(400, "not json at all").reason, "unavailable");
  assert.equal(classifyGetFailure(400, null).reason, "unavailable");
  // Every arm is a 502: the STATUS is the route's business, the REASON is the classification's.
  for (const s of [400, 404, 401, 500]) assert.equal(classifyGetFailure(s, "").status, 502);
});

// =============================================================================================
// P2 — THE READ PATH ITSELF, with `globalThis.fetch` mocked (the intake-unit.test.mjs technique).
// =============================================================================================
async function expectReadFailure(t, respond, { reason, status = 502 }, label) {
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", respond);
  let err = null;
  try { await hashCanonical(KEY); } catch (e) { err = e; }
  assert.ok(err instanceof StorageError, `${label}: expected a StorageError, got ${err}`);
  assert.equal(err.code, "storage_error", label);
  assert.equal(err.reason, reason, `${label}: reason (${err.message})`);
  assert.equal(err.status, status, label);
  return err;
}

test("P2.1 [PROVIDER CONTRACT] a wrapped 404 reaches the caller as reason object_missing", async (t) => {
  await withRealConfig(async () => {
    await expectReadFailure(t, async () => new Response(
      JSON.stringify({ statusCode: "404", error: "NotFound", message: "Object not found" }),
      { status: 400 }), { reason: "object_missing" }, "wrapped 404");
  });
});

test("P2.2 [PROVIDER CONTRACT] a bare 401 and a bare 403 are credential_refused, not object_missing", async (t) => {
  await withRealConfig(async () => {
    await expectReadFailure(t, async () => new Response(
      JSON.stringify({ code: "InvalidJWT", message: "jwt expired" }), { status: 401 }),
    { reason: "credential_refused" }, "bare 401");
    await expectReadFailure(t, async () => new Response(
      JSON.stringify({ code: "AccessDenied", message: "new row violates row-level security policy" }),
      { status: 403 }), { reason: "credential_refused" }, "bare 403");
  });
});

test("P2.3 [PROVIDER CONTRACT] a bare 404 is object_missing and a bare 500 is unavailable", async (t) => {
  await withRealConfig(async () => {
    await expectReadFailure(t, async () => new Response(
      JSON.stringify({ code: "NoSuchKey", message: "The specified key does not exist." }), { status: 404 }),
    { reason: "object_missing" }, "bare 404");
    await expectReadFailure(t, async () => new Response("upstream error", { status: 500 }),
      { reason: "unavailable" }, "bare 500");
  });
});

test("P2.4 [PROVIDER CONTRACT] a REJECTED fetch is unavailable — never object_missing", async (t) => {
  await withRealConfig(async () => {
    // DNS failure, connection refused, an aborted timeout: none of them is evidence about the
    // object, and answering object_missing would tell a reader to re-upload a document that is
    // perfectly fine on the other side of a network blip.
    const err = await expectReadFailure(t, async () => { throw new TypeError("fetch failed"); },
      { reason: "unavailable" }, "rejected fetch");
    assert.match(err.message, /network/, "the operator must be able to see it was a transport fault");
  });
});

test("P2.5 [PROVIDER CONTRACT] the thrown message carries at most a 200-character slice of the body", async (t) => {
  await withRealConfig(async () => {
    const huge = `${"X".repeat(50_000)}END`;
    const err = await expectReadFailure(t, async () => new Response(huge, { status: 500 }),
      { reason: "unavailable" }, "oversized body");
    assert.equal(err.message.includes("END"), false, "the tail of a 50 KB body must not survive");
    // The message is `Storage read failed (500) ` + at most 200 body characters.
    assert.ok(err.message.length <= "Storage read failed (500) ".length + 200,
      `the message is ${err.message.length} characters — the cap is 200 of body`);
    assert.ok(err.message.includes("Storage read failed (500)"), "the status still has to be in it");
    // …and the cap applies to a rejected fetch's cause message too.
    const net = await expectReadFailure(t, async () => { throw new Error("Y".repeat(50_000)); },
      { reason: "unavailable" }, "oversized network message");
    assert.ok(net.message.length <= "Storage read failed (network: )".length + 200);
  });
});

test("P2.6 [PROVIDER CONTRACT] an unconfigured runtime is `unconfigured` on a 503, and makes NO request", async (t) => {
  const prev = { ...process.env };
  process.env.RELAY_TEST_MODE = "";
  delete process.env.CLARA_STORAGE_URL;
  delete process.env.CLARA_STORAGE_ROLE;
  delete process.env.CLARA_STORAGE_ROLE_JWT;
  let called = 0;
  t.mock.method(globalThis, "fetch", async () => { called += 1; return new Response("", { status: 200 }); });
  try {
    let err = null;
    try { await hashCanonical(KEY); } catch (e) { err = e; }
    assert.ok(err instanceof StorageError);
    assert.equal(err.reason, "unconfigured");
    assert.equal(err.status, 503, "a deployment fault is a 503, not a 502 about the provider");
    assert.equal(called, 0, "realConfig must refuse BEFORE a request is made");
  } finally {
    Object.assign(process.env, prev);
  }
});

test("P2.7 [PROVIDER CONTRACT] a key that is not a canonical docs address never reaches the network", async (t) => {
  await withRealConfig(async () => {
    let called = 0;
    t.mock.method(globalThis, "fetch", async () => { called += 1; return new Response("", { status: 200 }); });
    let err = null;
    try { await hashCanonical(`firms/${FIRM}/reports/${SHA}.pdf`); } catch (e) { err = e; }
    assert.ok(err instanceof StorageError);
    assert.equal(err.reason, "invalid_key",
      "a key-shape refusal is NOT one of the four provider outcomes — it happened before any request");
    assert.equal(called, 0);
  });
});

test("P2.8 [PROVIDER CONTRACT] a 200 whose bytes do not match is checksum_mismatch, not storage_error", async (t) => {
  await withRealConfig(async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "d620-contract-"));
    try {
      t.mock.restoreAll();
      t.mock.method(globalThis, "fetch", async () => new Response("these are not the expected bytes",
        { status: 200 }));
      let err = null;
      try { await downloadCanonical(KEY, join(dir, "out.bin"), SHA); } catch (e) { err = e; }
      assert.ok(err instanceof StorageError);
      // A DIFFERENT CODE, and that is the whole point: `storage_error` means "we could not fetch
      // it, retrying may help"; `checksum_mismatch` means "we fetched it and it is not the
      // document this row describes", where retrying helps with nothing.
      assert.equal(err.code, "checksum_mismatch");
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
