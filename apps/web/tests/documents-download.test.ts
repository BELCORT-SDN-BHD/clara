// THE SOURCE-DOCUMENT DOWNLOAD — the browser half, measured the same three ways
// `tests/reports-download.test.ts` measures the artifact one, because they are the same class of
// thing and a difference between them would be a defect rather than a design:
//
//   1. the TRANSPORT — which path is called, which credential travels, which query the door
//      actually receives, and how each refusal is typed;
//   2. the CONTENT-TYPE gate — an HTML login page must never be saved to a person's disk as their
//      client's source document;
//   3. the FILENAME PRECEDENCE, including what happens when the two name sources are hostile.
//
// AND ONE THING THE ARTIFACT SIBLING DOES NOT NEED: the absence of a plain `<a href>`. The download
// affordance this lane adds is exactly the kind a developer "simplifies" into a link, and the link
// silently saves a login page. The last cell is that absence claim, with its instrument and scope
// named.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  documentDownloadFilename,
  downloadDocument,
  safeDownloadName,
} from "../lib/documents/download";
import { documentSourceStateOf, isDocumentBytesError } from "../lib/documents/bytes";
import { isRuntimeError } from "../lib/documents/runtime-wire";

const WEB = join(import.meta.dirname, "..");
const session = { getAccessToken: async () => "test-session-token" };

const DOC = {
  id: "11111111-1111-4111-8111-111111111111",
  sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  original_filename: "april-invoice.pdf",
};

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

/** The DOM half `triggerDownload` needs, installed for the duration of one call and removed again.
 *  This runtime has no `document`, and that is deliberate — the FETCH stays testable in Node, so
 *  the anchor is stubbed only where a cell actually drives the save. */
type SavedAnchor = { href: string; download: string; rel: string; clicked: number; removed: boolean };

async function withAnchor<T>(fn: (saved: SavedAnchor[], revoked: string[]) => Promise<T>): Promise<T> {
  const saved: SavedAnchor[] = [];
  const revoked: string[] = [];
  const globals = globalThis as unknown as { document?: unknown };
  const hadDocument = "document" in globals;
  const previousDocument = globals.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  let n = 0;
  URL.createObjectURL = () => `blob:document-${++n}`;
  URL.revokeObjectURL = (u: string) => { revoked.push(u); };
  globals.document = {
    createElement: () => {
      const a: SavedAnchor & { style: Record<string, string>; click(): void; remove(): void } = {
        href: "", download: "", rel: "", clicked: 0, removed: false,
        style: {},
        click() { this.clicked += 1; },
        remove() { this.removed = true; },
      };
      saved.push(a);
      return a;
    },
    body: { appendChild: () => {} },
  };
  try {
    return await fn(saved, revoked);
  } finally {
    // FLUSH THIS BLOCK'S OWN DEFERRED REVOKE BEFORE PUTTING THE GLOBALS BACK. `triggerDownload`
    // releases the object URL one macrotask after the click (a measured browser behaviour, not a
    // style choice), so without this hop the timer fires during a LATER block and its revoke is
    // recorded against that block's array — which is exactly how this file's own revoke cell went
    // red with three entries it never created.
    await new Promise((r) => setTimeout(r, 0));
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    if (hadDocument) globals.document = previousDocument;
    else delete globals.document;
  }
}

const pdf = (headers: Record<string, string> = {}) =>
  new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), {
    status: 200,
    headers: { "content-type": "application/pdf", ...headers },
  });

// ---------------------------------------------------------------------------------------------
// 1. THE TRANSPORT
// ---------------------------------------------------------------------------------------------
test("the download goes SAME-ORIGIN through the runtime proxy, with the session bearer, no redirect follow, and disposition=attachment", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  await withAnchor(() => withFetch(
    async (url, init) => { seen = { url: String(url), init: init ?? {} }; return pdf(); },
    () => downloadDocument(DOC, { session, client: "c0ffee00-1111-4111-8111-111111111111" }),
  ));
  assert.ok(seen);
  const call = seen as unknown as { url: string; init: RequestInit };
  assert.equal(
    call.url,
    `/api/runtime/documents/${DOC.id}/bytes?client=c0ffee00-1111-4111-8111-111111111111&disposition=attachment`,
    "the client scope and the attachment disposition must BOTH reach the door — the first is what makes a cross-client address answer not-found, the second is what the audit line records as a download",
  );
  // Same-origin by construction: no scheme, no host, so no storage host can be reached from here.
  assert.doesNotMatch(call.url, /^https?:/);
  assert.equal(new Headers(call.init.headers).get("authorization"), "Bearer test-session-token");
  assert.equal(call.init.redirect, "manual");
  assert.equal(call.init.cache, "no-store");
});

test("a download with no client scope sends no client param — never a guessed one", async () => {
  let url = "";
  await withAnchor(() => withFetch(
    async (u) => { url = String(u); return pdf(); },
    () => downloadDocument(DOC, { session }),
  ));
  assert.equal(url, `/api/runtime/documents/${DOC.id}/bytes?disposition=attachment`);
});

test("each refusal the route can answer with reaches the surface as its OWN state, through the download path too", async () => {
  const cases = [
    [401, { error: "unauthenticated" }, "unauthenticated"],
    [403, { error: "no_membership" }, "denied"],
    [404, { error: "not_found" }, "not_found"],
    [409, { error: "custody_pending" }, "custody_pending"],
    [502, { error: "storage_error", reason: "object_missing" }, "storage_unavailable"],
    [503, { error: "storage_error", reason: "unconfigured" }, "storage_unavailable"],
    [502, { error: "checksum_mismatch" }, "integrity"],
  ] as const;
  for (const [status, body, expected] of cases) {
    const err = await withAnchor(() => withFetch(
      async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
      () => downloadDocument(DOC, { session }).then(() => null, (e: unknown) => e),
    ));
    assert.ok(isDocumentBytesError(err), `a ${status} must be a typed document-bytes failure`);
    assert.equal(documentSourceStateOf(err), expected, `${status} ${JSON.stringify(body)}`);
  }
});

test("a refusal SAVES NOTHING — no anchor, no click, no object URL left behind", async () => {
  await withAnchor(async (saved, revoked) => {
    await withFetch(
      async () => new Response(JSON.stringify({ error: "no_membership" }), { status: 403, headers: { "content-type": "application/json" } }),
      () => downloadDocument(DOC, { session }).then(() => null, () => null),
    );
    assert.deepEqual(saved, [], "a refused download must never reach the anchor — a file appearing on disk after a denial is the worst possible failure here");
    assert.deepEqual(revoked, []);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. THE CONTENT-TYPE GATE
// ---------------------------------------------------------------------------------------------
test("a 200 carrying HTML is REFUSED before it is blobbed (the login-page-saved-as-a-client-document class)", async () => {
  for (const mime of ["text/html", "text/html; charset=utf-8", "application/json", ""]) {
    const err = await withAnchor((saved) => withFetch(
      async () => new Response("<html>sign in</html>", { status: 200, headers: mime ? { "content-type": mime } : {} }),
      async () => {
        const e = await downloadDocument(DOC, { session }).then(() => null, (x: unknown) => x);
        assert.deepEqual(saved, [], `content-type "${mime}" must never reach the anchor`);
        return e;
      },
    ));
    assert.ok(isRuntimeError(err), `content-type "${mime}" must be refused`);
    assert.equal((err as { kind?: string }).kind, "malformed");
  }
});

test("every type the door can STORE is downloadable — the download is not gated by the VIEWER list", async () => {
  // This is the whole reason the affordance exists: an e-invoice XML and a bank OFX can never be
  // previewed (a blob: URL inherits this origin), and a person still needs the file.
  for (const mime of ["application/xml", "application/x-ofx", "text/csv", "image/tiff",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"]) {
    await withAnchor(async (saved) => {
      await withFetch(
        async () => new Response(new Blob(["x"]), { status: 200, headers: { "content-type": mime } }),
        () => downloadDocument(DOC, { session }),
      );
      assert.equal(saved.length, 1, `${mime} must be saveable`);
      assert.equal(saved[0]!.clicked, 1);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 3. THE FILENAME PRECEDENCE
// ---------------------------------------------------------------------------------------------
test("filename precedence: Content-Disposition, then the row's original_filename, then the content address", () => {
  const base = { originalFilename: "row-name.pdf", sha256: DOC.sha256, mime: "application/pdf" };
  assert.equal(documentDownloadFilename({ ...base, disposition: "server-name.pdf" }), "server-name.pdf");
  assert.equal(documentDownloadFilename({ ...base, disposition: null }), "row-name.pdf");
  assert.equal(
    documentDownloadFilename({ ...base, disposition: null, originalFilename: null }),
    "9f86d081884c.pdf",
    "with neither name, the honest one is what the bytes hash to — never a fabricated pretty name",
  );
  assert.equal(
    documentDownloadFilename({ disposition: null, originalFilename: null, sha256: DOC.sha256, mime: "application/x-ofx" }),
    "9f86d081884c.ofx",
  );
  assert.equal(
    documentDownloadFilename({ disposition: null, originalFilename: null, sha256: DOC.sha256, mime: "application/octet-stream" }),
    "9f86d081884c.bin",
    "a type this app cannot name gets .bin — honest, rather than a guessed extension",
  );
});

test("an UPLOADER-SUPPLIED name cannot walk out of the download directory or carry control characters", () => {
  // `documents.original_filename` is stored verbatim from the upload. A row carrying a traversal
  // or a newline must not be handed to `a.download` as-is.
  assert.equal(safeDownloadName("../../etc/passwd"), "passwd");
  assert.equal(safeDownloadName("C:\\Windows\\system32\\evil.exe"), "evil.exe");
  assert.equal(safeDownloadName("a\u0000b\u001fc.pdf"), "abc.pdf");
  assert.equal(safeDownloadName("..."), "");
  assert.equal(safeDownloadName("   "), "");
  // …and an emptied name falls through the precedence rather than producing a nameless save.
  assert.equal(
    documentDownloadFilename({ disposition: "../", originalFilename: "...", sha256: DOC.sha256, mime: "application/pdf" }),
    "9f86d081884c.pdf",
  );
});

test("the derived filename is what actually reaches the anchor, and the object URL is revoked after the click", async () => {
  await withAnchor(async (saved, revoked) => {
    await withFetch(
      async () => pdf({ "content-disposition": "attachment; filename=\"clara-source-april.pdf\"" }),
      () => downloadDocument(DOC, { session }),
    );
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.download, "clara-source-april.pdf");
    assert.equal(saved[0]!.href, "blob:document-1");
    assert.equal(saved[0]!.clicked, 1);
    assert.equal(saved[0]!.rel, "noopener");
    // THE ANCHOR AND THE URL BOTH OUTLIVE THE CLICK BY A TICK — revoking in the same task has
    // cancelled an in-flight save in more than one engine, and the click still looks like it
    // worked. So the revoke must NOT have happened yet at this point, and MUST have happened
    // after one macrotask.
    assert.deepEqual(revoked, [], "revoking in the same task is the measured way to cancel a save that looks successful");
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(revoked, ["blob:document-1"], "…and the URL is released one tick later, so nothing leaks");
    assert.equal(saved[0]!.removed, true);
  });
});

// ---------------------------------------------------------------------------------------------
// 3b. THE PROXY'S RESPONSE HEADER ALLOW-LIST, read off the shipped source.
//
// The byte route sets five headers that MEAN something and one of them was being dropped. An
// allow-list that silently omits a header is a header that does not exist, however carefully the
// route sets it: `content-disposition` is what makes a download a download rather than an inline
// render inside this app's origin, `etag` is the served bytes' own content address, and
// `cache-control: private, no-store` plus `nosniff` are the two that keep a client's source
// document out of a shared cache and out of a re-interpreted content type.
// ---------------------------------------------------------------------------------------------
const PROXY = join(WEB, "app", "api", "runtime", "[...path]", "route.ts");

test("the runtime proxy forwards every header the byte route's contract sets — etag included", () => {
  const src = readFileSync(PROXY, "utf8");
  const block = /const RESPONSE_HEADERS = \[([\s\S]*?)\] as const;/.exec(src);
  assert.ok(block, "the proxy must carry a named RESPONSE_HEADERS allow-list");
  const names = [...(block[1] ?? "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  for (const required of ["content-type", "content-length", "content-disposition",
    "cache-control", "x-content-type-options", "etag"]) {
    assert.ok(names.includes(required), `the proxy drops ${required}`);
  }
  // AN ALLOW-LIST, still: the header set is BUILT by name, never copied wholesale from the
  // upstream response — the same discipline the outbound half already carries.
  assert.doesNotMatch(src, /res\.headers\.forEach|new Headers\(res\.headers\)/);
});

// ---------------------------------------------------------------------------------------------
// 4. ABSENCE, SCOPED AND INSTRUMENTED: no plain link, no client-side storage URL.
//
// SCOPE, stated: every `.ts`/`.tsx` file, recursively, under `apps/web/lib/documents` and
// `apps/web/components/documents`. Nothing outside those two trees is claimed by this cell.
// It reads comments as code on purpose — a comment naming the minting API is exactly where the
// next developer copies the call from — which is why the needle list lives HERE and the scanned
// files describe the census in words rather than in identifiers.
// ---------------------------------------------------------------------------------------------
const CENSUS_ROOTS = [join(WEB, "lib", "documents"), join(WEB, "components", "documents")];

const FORBIDDEN = [
  "createSignedUrl", "createSignedUrls", "getPublicUrl", "signedUrl",
  "/storage/v1/object", "supabase.storage",
];

/** An `<a href>` pointed at the byte route, in any of the shapes a hand would write it. The route
 *  authorises on a header a navigation cannot carry, so such a link saves this app's own login
 *  page instead of the document — see `lib/download-mechanism.ts`'s header. */
const HREF_TO_BYTE_ROUTE = /href\s*=\s*[^\n>]{0,60}\/api\/runtime\/documents/;

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) filesUnder(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** THE CENSUS ITSELF — one function, called by the claim AND by its control below. */
function scanDocumentsSurface(files: string[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const needle of FORBIDDEN) if (src.includes(needle)) hits.push(`${file}: ${needle}`);
    if (HREF_TO_BYTE_ROUTE.test(src)) hits.push(`${file}: an <a href> pointed at the byte route`);
  }
  return hits;
}

test("ABSENCE: the documents surface mints no storage URL and links no anchor at the byte route", () => {
  const scope = CENSUS_ROOTS.flatMap((r) => filesUnder(r));
  assert.ok(scope.length >= 10, `the scope must be non-trivial (found ${scope.length} files)`);
  // NAME the two files the scope must contain — without this, a root silently dropping out leaves
  // this cell green on a scope that no longer covers the code it claims.
  for (const required of [join(WEB, "lib", "documents", "download.ts"),
    join(WEB, "components", "documents", "document-source-actions.tsx")]) {
    assert.ok(scope.includes(required), `the census no longer reaches ${required}`);
  }
  const hits = scanDocumentsSurface(scope);
  assert.deepEqual(hits, [], `forbidden download mechanics found:\n${hits.join("\n")}`);
});

test("the absence census is ARMED: it reds on a file carrying either needle", () => {
  // THE CONTROL EXECUTES THE GATE, never a copy of its predicate — the same function the claim
  // above calls, pointed at this test file's own fixtures rather than at the real tree. The
  // fixtures are STRINGS assembled here rather than files on disk, because a committed file
  // holding a live minting call is a copyable example sitting in the repo, which is the exact
  // thing this cell exists to prevent.
  const dirtyLink = 'const el = <a href={`/api/runtime/documents/${id}/bytes`}>Download</a>;';
  const dirtyMint = 'const u = supabase.storage.from("firm-docs").createSignedUrl(k, 60);';
  assert.ok(HREF_TO_BYTE_ROUTE.test(dirtyLink), "the link needle must fire on a real link");
  assert.ok(FORBIDDEN.some((n) => dirtyMint.includes(n)), "the minting needles must fire on a real minting call");
  // …and must stay silent on prose that merely mentions the same subject.
  const clean = "// the byte route lives at /api/runtime/documents/:id/bytes and needs a header";
  assert.equal(HREF_TO_BYTE_ROUTE.test(clean), false);
});
