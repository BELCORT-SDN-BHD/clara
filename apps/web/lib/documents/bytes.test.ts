import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchDocumentBytes, ALLOWED_BYTES_CONTENT_TYPES, VIEWABLE_IN_NEW_TAB,
  documentSourceStateOf, documentSourceStateKey, documentBytesPath,
  isDocumentBytesError, isRetryableDocumentSourceState, requestDocumentBytes,
  type DocumentSourceState,
} from "./bytes";
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

// --- C-07 / 裁-175 — THE THREE-LIST DRIFT CELL ---------------------------------
//
// Three lists of MIME types now exist, and each is a hand-mirrored copy of the
// one before it:
//
//   1. packages/runtime/lib/intake.mjs's `MIME_ALIASES` — what may be STORED.
//      The authority; every other list descends from it.
//   2. bytes.ts's `ALLOWED_BYTES_CONTENT_TYPES` — what may be FETCHED. Its own
//      header says it is a deliberate literal copy of (1) plus
//      `application/octet-stream`, "mirrored deliberately … apps/web never
//      depends on packages/runtime at build time". Until this cell there was no
//      guard on EITHER side of that mirror.
//   3. bytes.ts's `VIEWABLE_IN_NEW_TAB` — what may be NAVIGATED TO as a blob.
//      Strictly narrower than (2), and the wall C-07 was missing.
//
// A copy with no guard is the "spelling is not identity" class: a type added to
// the runtime's intake table silently fails to fetch, and — the expensive
// direction — a type added back into (3) silently reopens the blob-origin hole
// that 裁-175 was written about. This cell measures the REAL runtime file on
// disk, not a re-declaration of it.

const RUNTIME_INTAKE = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..",
  "packages", "runtime", "lib", "intake.mjs",
);

/** The canonical values of the runtime's own `MIME_ALIASES` table, read from the
 *  file. Both syntactic forms in that table are parsed: the explicit
 *  `["declared", "canonical"]` pairs, and the OFX/QFX `.map((declared) =>
 *  [declared, "application/x-ofx"])` spread. The block is located by its own
 *  declaration and brace-matched, so a rename or a move goes RED here rather
 *  than quietly yielding an empty set. */
function runtimeCanonicalMimes(): Set<string> {
  const src = readFileSync(RUNTIME_INTAKE, "utf8");
  const start = src.indexOf("const MIME_ALIASES = new Map([");
  assert.notEqual(start, -1, "packages/runtime/lib/intake.mjs no longer declares `const MIME_ALIASES = new Map([` — this cell is measuring nothing; re-anchor it");
  const end = src.indexOf("]);", start);
  assert.notEqual(end, -1, "the MIME_ALIASES table is not terminated by `]);` — re-anchor this cell");
  const block = src.slice(start, end);

  const canonical = new Set<string>();
  for (const m of block.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)) canonical.add(m[2]!);
  for (const m of block.matchAll(/\[\s*declared\s*,\s*"([^"]+)"\s*\]/g)) canonical.add(m[1]!);
  return canonical;
}

test("DRIFT CELL: the web FETCH allowlist is exactly the runtime's intake table plus the null-mime fallback", () => {
  const canonical = runtimeCanonicalMimes();

  // VACUITY CONTROLS — both parse arms must actually have fired, and the set
  // must be able to answer "no". Without these the whole cell passes green
  // against an empty set if either regex stops matching.
  assert.ok(canonical.size >= 10, `parsed only ${canonical.size} canonical MIME values from the runtime table — the parser has stopped matching`);
  assert.ok(canonical.has("application/xml"), "the plain-pair arm did not fire (application/xml is written as an explicit pair)");
  assert.ok(canonical.has("application/x-ofx"), "the .map((declared) => …) spread arm did not fire (application/x-ofx is written only that way)");
  assert.equal(canonical.has("image/svg+xml"), false, "control: the parser must not be inventing entries the runtime does not admit");

  const expected = [...canonical, "application/octet-stream"].sort();
  assert.deepEqual(
    [...ALLOWED_BYTES_CONTENT_TYPES].sort(),
    expected,
    "apps/web's fetch allowlist has drifted from packages/runtime/lib/intake.mjs's MIME_ALIASES. " +
      "The two are deliberate copies (bytes.ts's own header); update BOTH, or the browser refuses a type the runtime stores.",
  );
});

test("DRIFT CELL: the VIEWER list is a STRICT subset of the fetch list, and admits no script host or non-inline type", () => {
  for (const mime of VIEWABLE_IN_NEW_TAB) {
    assert.ok(
      ALLOWED_BYTES_CONTENT_TYPES.has(mime),
      `${mime} is viewable but not fetchable — fetchDocumentBytes would refuse it before the viewer gate ever saw it`,
    );
  }
  assert.ok(
    VIEWABLE_IN_NEW_TAB.size < ALLOWED_BYTES_CONTENT_TYPES.size,
    "the viewer list has grown to the size of the fetch list — that IS the C-07 defect (the intake list reused as the viewer list)",
  );

  // THE SECURITY ASSERTION, named type by type. `image/svg+xml` is not in the
  // intake table today; it is pinned here anyway, because the failure mode is a
  // future widening of intake reaching this list by inheritance.
  for (const mime of [
    "application/xml", "image/svg+xml", "text/csv", "text/tab-separated-values",
    "application/x-ofx", "application/octet-stream", "image/tiff", "image/heic",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]) {
    assert.equal(
      VIEWABLE_IN_NEW_TAB.has(mime),
      false,
      `${mime} must never be navigated to as a blob: URL — a blob inherits apps/web's own origin and the caller's session (C-07 / 裁-175)`,
    );
  }

  // …and the four that MUST be there, or the gate refuses every real document.
  for (const mime of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
    assert.equal(VIEWABLE_IN_NEW_TAB.has(mime), true, `${mime} is the viewer's whole purpose and must stay admitted`);
  }
});

test("fetchDocumentBytes still FETCHES application/xml — the split gates viewing, not reading", async () => {
  // The structured extraction view reads an XML e-invoice through this same
  // path; narrowing the FETCH list instead of adding a viewer list would have
  // broken that. The two lists answer two different questions.
  const original = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:fake-url";
  globalThis.fetch = (async () => new Response(new Blob(["<x/>"]), { status: 200, headers: { "content-type": "application/xml" } })) as typeof fetch;
  try {
    const out = await fetchDocumentBytes("doc-1", { session: session() });
    assert.equal(out.mime, "application/xml");
    assert.equal(VIEWABLE_IN_NEW_TAB.has(out.mime), false, "…and it is still refused at the VIEWER gate");
  } finally {
    globalThis.fetch = original;
    URL.createObjectURL = originalCreate;
  }
});

// --- #620 — THE KIND BRANCHING, AND WHY IT IS NOT kindForStatus ----------------
//
// The byte route answers SEVEN distinct refusals, and a human is told a different
// true thing by each. Five of them are status-only and were already classified;
// the two that are NOT are the whole point of these cells:
//
//   · 409 `custody_pending`  — kindForStatus(409) says "unexpected", which is a
//     lie about a state the estate models explicitly (the row is readable, its
//     bytes are not durably verified yet) and which would withhold the Retry
//     that is the honest recovery for it.
//   · 502 `checksum_mismatch` — kindForStatus(502) says "server_error", which
//     would OFFER a Retry. Retrying re-reads the same wrong bytes. Sharing a
//     kind with a transient server failure would share its affordance.
//
// So both are read off the route's OWN typed `{error}` token. These cells drive
// the classifier through every status the route contract names, and the control
// at the end is what stops the ladder collapsing into one bucket.

/** One failed response, exactly as the route shapes it. */
function refusal(status: number, body: Record<string, string> | null): typeof fetch {
  return (async () => body === null
    ? new Response("", { status })
    : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

async function stateFor(status: number, body: Record<string, string> | null): Promise<DocumentSourceState> {
  const original = globalThis.fetch;
  globalThis.fetch = refusal(status, body);
  try {
    return await fetchDocumentBytes("doc-1", { session: session() }).then(
      () => { throw new Error(`a ${status} must not resolve`); },
      (e: unknown) => documentSourceStateOf(e),
    );
  } finally {
    globalThis.fetch = original;
  }
}

test("#620: every refusal the route contract names lands on its OWN state — no shared bucket", async () => {
  assert.equal(await stateFor(401, { error: "unauthenticated" }), "unauthenticated");
  assert.equal(await stateFor(403, { error: "no_membership" }), "denied");
  assert.equal(await stateFor(404, { error: "not_found" }), "not_found");
  assert.equal(await stateFor(409, { error: "custody_pending" }), "custody_pending");
  assert.equal(await stateFor(502, { error: "storage_error", reason: "unavailable" }), "storage_unavailable");
  assert.equal(await stateFor(503, { error: "storage_error", reason: "unconfigured" }), "storage_unavailable");
  assert.equal(await stateFor(502, { error: "checksum_mismatch" }), "integrity");
  assert.equal(await stateFor(500, null), "server_error");

  // THE CONTROL. Without it every line above passes against a classifier that
  // returned one constant.
  const distinct = new Set([
    await stateFor(401, { error: "unauthenticated" }),
    await stateFor(403, { error: "no_membership" }),
    await stateFor(404, { error: "not_found" }),
    await stateFor(409, { error: "custody_pending" }),
    await stateFor(502, { error: "storage_error" }),
    await stateFor(502, { error: "checksum_mismatch" }),
    await stateFor(500, null),
  ]);
  assert.equal(distinct.size, 7, "seven refusals must produce seven states");
});

test("#620: a 502 with NO typed token is a server failure, NOT a storage verdict", async () => {
  // The same-origin proxy answers 502 `{error:"runtime_redirected"}` when the
  // runtime redirects. Keying "storage unavailable" off the STATUS would tell a
  // human the document store is down when the runtime is what misbehaved.
  assert.equal(await stateFor(502, { error: "runtime_redirected" }), "server_error");
  assert.equal(await stateFor(502, null), "server_error");
});

test("#620: the typed tokens are CARRIED, and the vendor body text is not", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ error: "storage_error", reason: "credential_refused", message: "signature verification failed for role clara_storage_docs" }),
    { status: 502, headers: { "content-type": "application/json" } },
  )) as typeof fetch;
  try {
    await assert.rejects(fetchDocumentBytes("doc-1", { session: session() }), (e: unknown) => {
      assert.ok(isDocumentBytesError(e));
      assert.equal(e.error, "storage_error");
      assert.equal(e.reason, "credential_refused");
      assert.equal(e.status, 502);
      assert.doesNotMatch(e.message, /signature verification|storage_docs/, "vendor body text must never reach the message");
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("#620: an opaqueredirect (this app's own 307-to-/login) is the EXPIRED-SESSION state, not a transport failure", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    const res = new Response(null, { status: 200 });
    Object.defineProperty(res, "type", { value: "opaqueredirect" });
    return res;
  }) as typeof fetch;
  try {
    const state = await fetchDocumentBytes("doc-1", { session: session() }).then(() => null, (e: unknown) => documentSourceStateOf(e));
    assert.equal(state, "unauthenticated");
  } finally {
    globalThis.fetch = original;
  }
});

test("#620: RETRY is offered exactly where a second attempt can answer differently", () => {
  for (const state of ["custody_pending", "storage_unavailable", "transport", "server_error"] as const) {
    assert.equal(isRetryableDocumentSourceState(state), true, `${state} recovers on its own — Retry is honest`);
  }
  for (const state of ["denied", "not_found", "integrity", "malformed", "unauthenticated"] as const) {
    assert.equal(isRetryableDocumentSourceState(state), false, `${state} answers identically on a second attempt — a Retry button there is a control that cannot work`);
  }
});

test("#620: every state maps to its OWN copy key, and the key is a KEY (never English)", () => {
  const states: DocumentSourceState[] = [
    "unauthenticated", "denied", "not_found", "custody_pending",
    "storage_unavailable", "integrity", "malformed", "transport", "server_error",
  ];
  const keys = states.map(documentSourceStateKey);
  assert.equal(new Set(keys).size, states.length, "no two states may share copy");
  assert.equal(documentSourceStateKey("integrity"), "sourceState.integrity");
  for (const key of keys) assert.match(key, /^sourceState\.[a-z_]+$/);
});

test("#620: the client scope and the download disposition travel in the QUERY, and a preview adds neither", () => {
  assert.equal(documentBytesPath("doc-1"), "/api/runtime/documents/doc-1/bytes");
  assert.equal(documentBytesPath("doc-1", { purpose: "preview" }), "/api/runtime/documents/doc-1/bytes");
  assert.equal(
    documentBytesPath("doc-1", { client: "c-1" }),
    "/api/runtime/documents/doc-1/bytes?client=c-1",
  );
  assert.equal(
    documentBytesPath("doc-1", { client: "c-1", purpose: "download" }),
    "/api/runtime/documents/doc-1/bytes?client=c-1&disposition=attachment",
  );
  // The id is ENCODED into the path, so a hostile id cannot add a segment.
  assert.equal(documentBytesPath("../../secrets").includes("../"), false);
});

test("#620: requestDocumentBytes SENDS the client + disposition it was given, and reads the server's filename", async () => {
  let seenUrl = "";
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    seenUrl = String(url);
    return new Response(new Blob(["x"]), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=\"april.pdf\"; filename*=UTF-8''april%20invoice.pdf",
      },
    });
  }) as typeof fetch;
  try {
    const out = await requestDocumentBytes("doc-1", { session: session(), client: "c-9", purpose: "download" });
    assert.equal(seenUrl, "/api/runtime/documents/doc-1/bytes?client=c-9&disposition=attachment");
    assert.equal(out.mime, "application/pdf");
    assert.equal(out.filename, "april invoice.pdf", "RFC 5987's filename* wins, which is the order the spec requires");
  } finally {
    globalThis.fetch = original;
  }
});
