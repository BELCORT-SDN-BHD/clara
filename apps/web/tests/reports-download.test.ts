// FS-7 echelon 2 — the browser half of the artifact download (裁-96②).
//
// THREE THINGS ARE MEASURED HERE, and each is a way the download could be wrong without any of
// them looking wrong in a screenshot:
//   1. the transport — which path is called, which credential travels, and how a refusal is typed;
//   2. the content-type allow-list — an HTML login page must never be saved as a client's accounts;
//   3. the PROXY's response header allow-list, read off the shipped source — a `content-disposition`
//      the proxy silently drops turns an attachment into an inline render inside this app's origin.
//
// NO SIGNED URL, ANYWHERE. The last cell is an absence claim and it names its instrument and its
// scope, per the standing law: a source scan over `apps/web/lib/reports/**` plus the components
// that call it, for every Supabase signed-URL API and for the storage-path shape itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  filenameFromDisposition,
  fetchArtifactBytes,
  isArtifactDownloadRefusal,
} from "../lib/reports/download";
import { isRuntimeError } from "../lib/documents/runtime-wire";

const WEB = join(import.meta.dirname, "..");
const session = { getAccessToken: async () => "test-session-token" };

/** Swap global fetch for one call and always put it back. */
async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const pdf = (headers: Record<string, string> = {}) =>
  new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), {
    status: 200,
    headers: { "content-type": "application/pdf", ...headers },
  });

// ---------------------------------------------------------------------------------------------
// 1. filenameFromDisposition
// ---------------------------------------------------------------------------------------------
test("filenameFromDisposition prefers filename* over the quoted form (RFC 5987's own order)", () => {
  assert.equal(
    filenameFromDisposition(`attachment; filename="fallback.pdf"; filename*=UTF-8''real%20name.pdf`),
    "real name.pdf");
  assert.equal(filenameFromDisposition('attachment; filename="only.pdf"'), "only.pdf");
  assert.equal(filenameFromDisposition("attachment; filename=bare.pdf"), "bare.pdf");
  assert.equal(filenameFromDisposition("attachment"), null);
  assert.equal(filenameFromDisposition(null), null);
});

// ---------------------------------------------------------------------------------------------
// 2. fetchArtifactBytes — the transport
// ---------------------------------------------------------------------------------------------
test("the fetch goes SAME-ORIGIN through the runtime proxy, with the session bearer and no redirect follow", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  await withFetch(async (url, init) => { seen = { url: String(url), init: init ?? {} }; return pdf(); },
    () => fetchArtifactBytes("11111111-1111-4111-8111-111111111111", { session }));
  assert.ok(seen);
  const call = seen as unknown as { url: string; init: RequestInit };
  assert.equal(call.url, "/api/runtime/artifacts/11111111-1111-4111-8111-111111111111/bytes");
  // Same-origin by construction: no scheme, no host, so no storage host can be reached from here.
  assert.doesNotMatch(call.url, /^https?:/);
  assert.equal(new Headers(call.init.headers).get("authorization"), "Bearer test-session-token");
  assert.equal(call.init.redirect, "manual");
  assert.equal(call.init.cache, "no-store");
});

test("the artifact id is URL-ENCODED into the path, so a hostile id cannot add a segment", async () => {
  let url = "";
  await withFetch(async (u) => { url = String(u); return pdf(); },
    () => fetchArtifactBytes("../../secrets", { session }).catch(() => null));
  assert.equal(url.includes("../"), false, `the id must be encoded, got ${url}`);
  assert.match(url, /%2E%2E%2F%2E%2E%2Fsecrets|\.\.%2F/);
});

test("a 403 and a 409 surface as DOOR refusals carrying the database's own typed reason", async () => {
  for (const [status, reason] of [[403, "insufficient_role"], [409, "artifact_superseded"]] as const) {
    const err = await withFetch(
      async () => new Response(JSON.stringify({ error: "x", reason }), {
        status, headers: { "content-type": "application/json" } }),
      () => fetchArtifactBytes("a", { session }).then(() => null, (e) => e));
    assert.ok(isArtifactDownloadRefusal(err), `a ${status} must be a door refusal`);
    assert.equal(err.reason, reason);
    assert.equal(err.status, status);
  }
});

test("a 404 is NOT a door refusal and carries no reason — every 404 the route emits is identical", async () => {
  const err = await withFetch(
    async () => new Response(JSON.stringify({ error: "not_found", message: "not found" }), { status: 404 }),
    () => fetchArtifactBytes("a", { session }).then(() => null, (e) => e));
  assert.equal(isArtifactDownloadRefusal(err), false);
  assert.ok(isRuntimeError(err));
});

test("a 200 carrying HTML is REFUSED before it is blobbed (the login-page-saved-as-accounts class)", async () => {
  for (const mime of ["text/html", "text/html; charset=utf-8", "application/octet-stream", ""]) {
    const err = await withFetch(
      async () => new Response("<html>sign in</html>", { status: 200, headers: mime ? { "content-type": mime } : {} }),
      () => fetchArtifactBytes("a", { session }).then(() => null, (e) => e));
    assert.ok(isRuntimeError(err), `content-type "${mime}" must be refused`);
    assert.equal((err as { kind?: string }).kind, "malformed");
  }
});

test("the two content types the door can serve are accepted, and the filename comes from the SERVER", async () => {
  for (const mime of ["application/pdf", "application/json"]) {
    const out = await withFetch(
      async () => new Response(new Blob(["x"]), {
        status: 200,
        headers: { "content-type": mime, "content-disposition": 'attachment; filename="clara-report-pre_sign-abc123456789.pdf"' },
      }),
      () => fetchArtifactBytes("a", { session }));
    assert.equal(out.mime, mime);
    assert.equal(out.filename, "clara-report-pre_sign-abc123456789.pdf");
  }
});

test("with no disposition the caller's fallback name is used — never a name read from the body", async () => {
  const out = await withFetch(async () => pdf(),
    () => fetchArtifactBytes("a", { session, fallbackFilename: "offered-name.pdf" }));
  assert.equal(out.filename, "offered-name.pdf");
});

// ---------------------------------------------------------------------------------------------
// 3. THE PROXY'S RESPONSE HEADER ALLOW-LIST, read off the shipped source.
// ---------------------------------------------------------------------------------------------
const PROXY = join(WEB, "app", "api", "runtime", "[...path]", "route.ts");

test("the runtime proxy forwards content-disposition (without it, an attachment renders INLINE)", () => {
  const src = readFileSync(PROXY, "utf8");
  const block = /const RESPONSE_HEADERS = \[([\s\S]*?)\] as const;/.exec(src);
  assert.ok(block, "the proxy must carry a named RESPONSE_HEADERS allow-list");
  const names = [...(block[1] ?? "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  for (const required of ["content-type", "content-length", "content-disposition",
    "cache-control", "x-content-type-options"]) {
    assert.ok(names.includes(required), `the proxy drops ${required}`);
  }
  // AN ALLOW-LIST, still: the header set is BUILT by name, never copied wholesale from the
  // upstream response — the same discipline the outbound half already carries.
  assert.doesNotMatch(src, /res\.headers\.forEach|new Headers\(res\.headers\)/);
});

// ---------------------------------------------------------------------------------------------
// 4. ZERO CLIENT-SIDE STORAGE-URL MINTING — the instrument, its SCOPE, and its ARMING.
//
// SCOPE, stated: every `.ts`/`.tsx` file, recursively, under `apps/web/lib/reports` and
// `apps/web/components/reports`. Nothing outside those two trees is claimed by this cell.
//
// IT READS COMMENTS AS CODE, AND THAT IS THE DESIGN. A comment naming the minting API is exactly
// where the next developer copies the call from, so a hit inside a comment is a finding rather
// than a false positive. The cost of that choice is real and was paid once: a documentation
// paragraph in `lib/reports/types.ts` spelled the three identifiers out to explain this very
// census, and hosted CI correctly reported the instrument's own documentation. THE NEEDLE LIST
// THEREFORE LIVES HERE AND NOWHERE ELSE — prose in a scanned file names the API in words.
// ---------------------------------------------------------------------------------------------
const CENSUS_ROOTS = [join(WEB, "lib", "reports"), join(WEB, "components", "reports")];

/** The vendored storage client's URL-minting surface, the storage REST path, and the bucket
 *  handle. This array is the census's whole vocabulary; nothing else spells these. */
const FORBIDDEN = [
  "createSignedUrl", "createSignedUrls", "getPublicUrl", "signedUrl",
  "/storage/v1/object", "supabase.storage", ".from(\"reports\")",
];

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) filesUnder(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** THE CENSUS ITSELF. The claim and its positive control both run THIS function against the real
 *  directories — never a copy of its predicate against a string literal (裁-112). */
function storageIdentifierHits(roots: string[] = CENSUS_ROOTS): string[] {
  const hits: string[] = [];
  for (const file of roots.flatMap((r) => filesUnder(r))) {
    const src = readFileSync(file, "utf8");
    for (const needle of FORBIDDEN) if (src.includes(needle)) hits.push(`${file}: ${needle}`);
    // The key prefixes are matched as PATH SHAPES rather than words, so a comment saying the word
    // "reports" does not trip it while an actual `firms/<id>/reports/<sha>` template would.
    if (/firms\/\$\{|firms\/[0-9a-f-]{8}/.test(src)) hits.push(`${file}: a storage path template`);
  }
  return hits;
}

test("ABSENCE, scoped and instrumented: nothing under lib/reports or components/reports mints a storage URL", () => {
  const scope = CENSUS_ROOTS.flatMap((r) => filesUnder(r));
  assert.ok(scope.length >= 10, `the scope must be non-trivial (found ${scope.length} files)`);
  const hits = storageIdentifierHits();
  assert.deepEqual(hits, [], `client-side storage identifiers found:\n${hits.join("\n")}`);
});

test("the absence census is ARMED: a call site planted INSIDE the scanned path reds it", () => {
  // The previous control asserted that a string literal contained one of the needles — a copy of
  // the predicate, not the gate, and it would have stayed green if the directory walk, the
  // extension filter or the roots had silently stopped covering anything. This one plants a real
  // file inside the real scope and runs the real census over the real tree.
  const planted = join(WEB, "lib", "reports", `census-arming-control-${process.pid}.ts`);
  writeFileSync(planted,
    "// scratch positive control, removed in the same test\n" +
    "export const probe = 'supabase.storage.from(\"reports\").createSignedUrl(k, 60)';\n");
  try {
    const hits = storageIdentifierHits();
    assert.ok(hits.some((h) => h.includes(basename(planted))),
      `the census did not see a call site planted in its own scope:\n${hits.join("\n")}`);
    // and it names WHICH needle it matched, so a later edit that quietly narrows FORBIDDEN cannot
    // leave this control green on some other coincidental match.
    assert.ok(hits.some((h) => h.includes(basename(planted)) && h.endsWith("createSignedUrl")),
      `the census matched the planted file but not by the minting identifier:\n${hits.join("\n")}`);
  } finally {
    // Fail-closed by construction: if this ever fails to run, the planted file stays in the scope
    // and the cell above goes RED on the next run rather than quietly passing.
    rmSync(planted, { force: true });
  }
  assert.deepEqual(storageIdentifierHits(), [],
    "the control must leave no residue behind in the scanned tree");
});
