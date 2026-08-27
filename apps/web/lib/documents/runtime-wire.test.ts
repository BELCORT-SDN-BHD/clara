import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRuntimeFetch, expectRuntimeOk, isRuntimeError, RuntimeError } from "./runtime-wire";

test("safeRuntimeFetch: a genuine network failure surfaces as a typed RuntimeError(kind: transport)", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new TypeError("network down"); }) as typeof fetch;
  try {
    await assert.rejects(safeRuntimeFetch("/x", {}, "op"), (e: unknown) => {
      assert.ok(isRuntimeError(e));
      assert.equal(e.status, null);
      assert.equal(e.kind, "transport");
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("safeRuntimeFetch: a deliberate abort re-throws UNCHANGED, never wrapped into a RuntimeError", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new DOMException("aborted", "AbortError"); }) as typeof fetch;
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(safeRuntimeFetch("/x", { signal: controller.signal }, "op"), (e: unknown) => {
      assert.ok(!isRuntimeError(e));
      assert.equal((e as Error).name, "AbortError");
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("expectRuntimeOk: an ok response resolves without reading the body", async () => {
  let bodyRead = false;
  const res = new Response(null, { status: 200 });
  const originalText = res.text.bind(res);
  res.text = async () => { bodyRead = true; return originalText(); };
  await expectRuntimeOk(res, "op");
  assert.equal(bodyRead, false);
});

test("expectRuntimeOk: a failure classifies by STATUS and never quotes the raw body into the message", async () => {
  const res = new Response("sensitive stack trace or internal detail", { status: 500 });
  await assert.rejects(expectRuntimeOk(res, "widget op"), (e: unknown) => {
    assert.ok(isRuntimeError(e));
    assert.equal(e.status, 500);
    assert.equal(e.kind, "server_error");
    assert.equal(e.message, "widget op failed");
    assert.doesNotMatch(e.message, /sensitive/);
    return true;
  });
});

test("expectRuntimeOk: every documented status maps to its OWN kind (404 -> not_found, 401 -> unauthenticated, 403 -> forbidden)", async () => {
  const cases: Array<[number, string]> = [[404, "not_found"], [401, "unauthenticated"], [403, "forbidden"]];
  for (const [status, kind] of cases) {
    await assert.rejects(expectRuntimeOk(new Response("", { status }), "op"), (e: unknown) => {
      assert.ok(isRuntimeError(e));
      assert.equal(e.kind, kind);
      return true;
    });
  }
});

test("expectRuntimeOk: an opaqueredirect response (a manual-redirect fetch caught a 307) classifies as kind 'unauthenticated', never followed/read", async () => {
  let bodyRead = false;
  const opaqueRedirect = {
    type: "opaqueredirect", ok: false, status: 0,
    text: async () => { bodyRead = true; return ""; },
  } as unknown as Response;
  await assert.rejects(expectRuntimeOk(opaqueRedirect, "widget op"), (e: unknown) => {
    assert.ok(isRuntimeError(e));
    assert.equal(e.kind, "unauthenticated");
    assert.equal(e.status, null);
    return true;
  });
  assert.equal(bodyRead, false, "an opaque redirect carries no readable body — it must never be read");
});

test("RuntimeError: constructs with the given message/status/kind, name 'RuntimeError'", () => {
  const e = new RuntimeError("boom", { status: 502, kind: "server_error" });
  assert.equal(e.name, "RuntimeError");
  assert.equal(e.message, "boom");
  assert.equal(e.status, 502);
  assert.equal(e.kind, "server_error");
  assert.ok(isRuntimeError(e));
});
