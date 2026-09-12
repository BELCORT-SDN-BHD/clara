// #620 — THE SOURCE-DOCUMENT BYTES ROUTE, end to end
// (packages/runtime/src/documentRoutes.ts + migration 0185's clara.get_document_for_human_read_v2).
//
// THE WHOLE ROUTE, OVER HTTP, AGAINST THE RIG. This mirrors
// packages/runtime/tests/fs7-e2-artifact-route.test.mjs's HTTP layer: a real express server, a real
// signed HS256 JWT minted with jose, a real clara_runtime transaction against the local Postgres
// rig, and RELAY_TEST_MODE's local content-addressed object store — which runs the SAME safeKey
// validator and the SAME hash-en-route verification the Supabase path runs. A stub would have
// proved the route calls a function; this proves the object comes back, that a tampered one does
// not, and that every refusal is the one the ladder promises.
//
// WHY IT MATTERS MORE HERE THAN ANYWHERE ELSE. The Storage RLS policies scope by bucket and key
// SHAPE only (packages/db/deploy/storage-provision.sql:66-80), so the custody credential can read
// any firm's conforming object. Cross-firm denial for source bytes is the definer function plus
// this route, and until #620 the route had no HTTP-level battery at all — its only test file
// exercised two pure helpers with no server, no database and no storage.
//
// EVERY REFUSAL CELL ALSO ASSERTS WHAT DID **NOT** HAPPEN: no bytes in the body, no egress audit
// line, and — where the route got far enough to create one — no leftover temp file. A route that
// refuses correctly but leaves the reader's document spooled in /tmp has not refused.
//
// WHICH OF THOSE tempLeak() ASSERTIONS CAN ACTUALLY FAIL, MEASURED RATHER THAN CLAIMED (#620
// review, F14). The header used to promise that every refusal cell measured the cleanup. It does
// not, and cannot: E2.5 and E2.7 refuse in step 4, BEFORE `const tmp = join(...)` exists at all,
// and E2.9 — like every other `storage_error` reason raised inside `responseFor` — throws before
// `downloadCanonical` mkdirs the destination and opens its write stream. Their assertions are true
// of a file that was never created. They are kept, as cheap insurance against a future reordering
// that spools before the door decides, but they are not evidence. The cells that DO exercise a
// cleanup, each established by deleting that cleanup and running this file:
//   · delete the ROUTE's `finally { rm(tmp) }` (documentRoutes.ts) → 17 pass / 4 fail: E2.1 (the
//     success path), E2.13 (a client abort mid-stream), E2.14 (a byte_size/object disagreement)
//     and E2.17 (a storage failure AFTER the write stream opens).
//   · ALSO delete storage.mjs's checksum-mismatch `rm(destination)` → 16 pass / 5 fail: E2.10
//     joins them.
//   · delete ONLY that storage cleanup → 21 pass / 0 fail. Nothing in this file measures that line
//     in isolation, because the route's own `finally` unlinks the very same path. Said plainly
//     rather than left to be inferred from the pair above.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ISSUER = "https://d620.rig.invalid/auth/v1";
const AUD = "authenticated";
const JWT_SECRET = `d620-${randomUUID().replace(/-/g, "")}`;
process.env.SUPABASE_JWT_ISSUER = ISSUER;
process.env.SUPABASE_JWT_AUD = AUD;
process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
process.env.RELAY_TEST_MODE = "1";
// A per-run object root, so two runs on one host never see each other's bytes.
const STORAGE_ROOT = mkdtempSync(join(tmpdir(), "d620-store-"));
process.env.CLARA_TEST_STORAGE_DIR = STORAGE_ROOT;

const { SignJWT } = await import("jose");
const { register } = await import("tsx/esm/api");
register();

const express = (await import("express")).default;
const route = await import("../src/documentRoutes.ts");
const { _resetJwtConfigForTest } = await import("../lib/authz.mjs");
const { getRuntimePool, endPools } = await import("../lib/pools.mjs");
const { StorageError, hashCanonical } = await import("../lib/storage.mjs");
const {
  documentRoutes, documentContentDisposition, derivedDocumentFilename,
} = route;

// ---------------------------------------------------------------------------------------------
// LAYER 1 — the disposition builder. No server, no DB. The hostile inputs are the point: this
// filename comes from `clara.documents.original_filename`, i.e. from whatever a human named a file
// on their own machine.
// ---------------------------------------------------------------------------------------------
test("E1.1 — a plain filename survives, in both the quoted form and filename*", () => {
  const d = documentContentDisposition("invoice-2024.pdf", "abc123456789.pdf");
  assert.match(d, /^attachment; filename="invoice-2024\.pdf"/);
  assert.match(d, /filename\*=UTF-8''invoice-2024\.pdf$/);
});

test("E1.2 — no filename can break out of the header: quotes, backslashes, separators, dot runs, CRLF", () => {
  for (const hostile of [
    'a"; filename="evil.exe',
    "a\\b.pdf",
    "../../etc/passwd",
    "..\\..\\windows\\system32\\cmd.exe",
    "x\r\nSet-Cookie: a=b",
    " leading-space.pdf",
    "nul\u0000byte.pdf",
    "....//....//x.pdf",
  ]) {
    const d = documentContentDisposition(hostile, "fallback.pdf");
    const quoted = /^attachment; filename="([^"]*)"; filename\*=UTF-8''(.*)$/.exec(d);
    assert.ok(quoted, `the header must stay parseable for ${JSON.stringify(hostile)} (got ${d})`);
    // EXACTLY TWO quote characters — the two delimiters. A third is a breakout.
    assert.equal((d.match(/"/g) ?? []).length, 2, `quote count for ${JSON.stringify(hostile)}`);
    assert.equal(/[\r\n]/.test(d), false, "a header value with CR or LF is header injection");
    assert.equal(/[/\\]/.test(d), false, `a path separator survived for ${JSON.stringify(hostile)}: ${d}`);
    assert.equal(/\.\./.test(quoted[1] ?? ""), false, "a dot run survived the quoted form");
    assert.notEqual(quoted[1], "", "an empty filename= invites the client to pick its own");
  }
});

test("E1.3 — a non-ASCII name is transliterated in the quoted form and carried whole in filename*", () => {
  const d = documentContentDisposition("发票 2024.pdf", "abc.pdf");
  const m = /^attachment; filename="([^"]*)"; filename\*=UTF-8''(.*)$/.exec(d);
  assert.ok(m);
  assert.equal(/[^\x20-\x7e]/.test(m[1] ?? ""), false, "the quoted form must be pure printable ASCII");
  assert.equal(decodeURIComponent(m[2] ?? ""), "发票 2024.pdf", "filename* must carry the REAL name");
  // RFC 5987's attr-char admits none of these; encodeURIComponent leaves them alone, so the
  // builder encodes them itself.
  const apostrophe = documentContentDisposition("it's (a) *star*!.pdf", "abc.pdf");
  assert.equal(/=UTF-8''[^']*$/.test(apostrophe), true, `a raw apostrophe survived: ${apostrophe}`);
});

test("E1.4 — the derived fallback is the content address plus the canonical key's extension", () => {
  const sha = "a".repeat(64);
  assert.equal(derivedDocumentFilename(sha, `firms/${randomUUID()}/docs/${sha}.pdf`), "aaaaaaaaaaaa.pdf");
  assert.equal(derivedDocumentFilename(sha, null), "aaaaaaaaaaaa");
  assert.equal(derivedDocumentFilename("not-a-hash", `x/${sha}.png`), "document.png");
});

// ---------------------------------------------------------------------------------------------
// LAYER 2 — THE WHOLE ROUTE, over HTTP, against the rig.
// ---------------------------------------------------------------------------------------------
let rig = null;
let ready = false;
let server = null;
let baseUrl = "";
let firmA = null;   // { prefix, owner, firm, client }
let firmB = null;
let clientA2 = null;
let doc = null;     // firm A, filed under firmA.client, bytes present
let pool = null;

const mint = async (sub) => new SignJWT({ role: AUD })
  .setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuer(ISSUER).setAudience(AUD)
  .setIssuedAt().setExpirationTime("15m")
  .sign(new TextEncoder().encode(JWT_SECRET));

/** Write real bytes at a real content address in the local store. */
function putLocal(firm, bytes, ext = "pdf") {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = `firms/${firm}/docs/${sha}.${ext}`;
  const dest = join(STORAGE_ROOT, ...key.split("/"));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  return { key, sha };
}

/**
 * A real, verified clara.documents row through the same superuser-only `_seed_verified_document`
 * the db package's own rig fixtures use — called directly here because a runtime test cannot
 * import a sibling package's test helpers (the g1-wake-bank-fixtures.mjs precedent).
 */
async function seedDoc(firm, client, { bytes, filename = "rig.pdf", mime = "application/pdf",
  ghost = false, byteSize = null } = {}) {
  const payload = bytes ?? Buffer.from(`%PDF-1.7\nd620 ${randomUUID()}\n%%EOF\n`);
  const sha = ghost
    ? createHash("sha256").update(`no-object-${randomUUID()}`).digest("hex")
    : putLocal(firm, payload).sha;
  const storagePath = `firms/${firm}/docs/${sha}.pdf`;
  // `byteSize` overrides what the ROW records without touching the OBJECT — the only way to build
  // the disagreement E2.14 measures. No CHECK ties the two, and nothing in intake can produce it
  // (spool.mjs measures the length off the same stream it hashes), which is why the fixture has to
  // be made by hand.
  const r = await rig.rootQuery(
    "select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8) as r",
    [firm, client, sha, filename, mime, byteSize ?? payload.length, storagePath, null]);
  return { id: r.rows[0].r.document_id, sha, bytes: payload, storagePath };
}

/** A document whose custody bond is not stamped. No supported writer produces this shape
 *  post-0007, and clara._tf_documents_immutable guards UPDATE/DELETE only, so the row is inserted
 *  directly as superuser — the technique packages/db/tests/x27-filings-lock-order.test.mjs uses. */
async function seedCustodyPending(firm) {
  const sha = createHash("sha256").update(`pending-${randomUUID()}`).digest("hex");
  const r = await rig.rootQuery(
    `insert into clara.documents(firm_id, sha256, original_filename, mime_type, byte_size,
        storage_path, bytes_verified_at, extraction_status)
     values ($1,$2,'pending.pdf','application/pdf',512,null,null,'pending') returning id`, [firm, sha]);
  return r.rows[0].id;
}

const tempFiles = () => readdirSync(tmpdir()).filter((f) => f.startsWith("clara-docbytes-"));

/**
 * The per-request temp files this route created since `baseline`, after giving the SERVER time to
 * finish its own `finally`.
 *
 * THE WAIT IS NOT A FUDGE, IT IS THE ACTUAL ORDERING. The route removes the file in a `finally`
 * that runs after the response stream ends — so the client's last byte legitimately arrives BEFORE
 * the unlink. A bare synchronous check therefore measures the race, not the cleanup, and its first
 * cut failed on exactly that. Bounded and loud: an unremoved file still fails, three seconds later.
 */
async function tempLeak(baseline, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const leaked = tempFiles().filter((f) => !baseline.has(f));
    if (leaked.length === 0) return [];
    if (Date.now() >= deadline) return leaked;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Drive the route's STORAGE layer into one specific failure, through the seam storage.mjs ships
 * (`globalThis.__claraStorageForTest`, the same one storage-probe.test.mjs and intake-db.test.mjs
 * use). Nothing about the route, the door or the JWT path changes: only what Storage answers.
 */
async function withInjectedStorage(get, fn) {
  const prev = globalThis.__claraStorageForTest;
  globalThis.__claraStorageForTest = { get };
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete globalThis.__claraStorageForTest;
    else globalThis.__claraStorageForTest = prev;
  }
}

/**
 * CAPTURE THE REAL StorageError THE DEPLOYED PATH RAISES, rather than hand-writing one.
 *
 * A cell that constructed `new StorageError("storage_error", …, 503, "unconfigured")` itself would
 * pin the ROUTE's mapping against a literal this test file invented, and would keep passing if
 * realConfig or `classifyGetFailure` ever answered a different status or reason. So the error is
 * taken FROM storage.mjs: RELAY_TEST_MODE is lifted for the duration (which is what puts
 * `responseFor` on its deployed arm), the environment is shaped for the case under test, `fetch`
 * is mocked where a response is needed, and whatever storage.mjs throws is what gets injected
 * below. The mock is torn down BEFORE any request is made to the route, because `get()` in this
 * file goes through the same `globalThis.fetch`.
 */
async function capturedStorageError(t, { env = {}, respond = null } = {}) {
  const prev = { ...process.env };
  process.env.RELAY_TEST_MODE = "";
  for (const key of ["CLARA_STORAGE_URL", "CLARA_STORAGE_ROLE", "CLARA_STORAGE_ROLE_JWT"]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  if (respond) t.mock.method(globalThis, "fetch", respond);
  try {
    await hashCanonical(`firms/${firmA.firm}/docs/${"a".repeat(64)}.pdf`);
    return null;
  } catch (err) {
    return err;
  } finally {
    t.mock.restoreAll();
    for (const key of Object.keys(process.env)) if (!(key in prev)) delete process.env[key];
    Object.assign(process.env, prev);
  }
}

/** A real-config environment: a URL, a dedicated custom role, and a syntactically valid unexpired
 *  role JWT whose `role` claim equals it (never verified locally — realConfig only decodes it).
 *  storage-read-contract.test.mjs's `withRealConfig` builds the identical shape. */
function realConfigEnv() {
  const claims = Buffer.from(JSON.stringify({
    role: "clara_storage_docs", exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  return {
    CLARA_STORAGE_URL: "https://example.supabase.co/storage/v1/object/firm-docs",
    CLARA_STORAGE_ROLE: "clara_storage_docs",
    CLARA_STORAGE_ROLE_JWT: `x.${claims}.y`,
  };
}

/** Wait (bounded) for this route to CREATE a new spool, and return the ones it created. The
 *  mirror of `tempLeak`: that one proves a file is gone, this one proves it was ever there. */
async function tempAppeared(baseline, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = tempFiles().filter((f) => !baseline.has(f));
    if (fresh.length > 0) return fresh;
    if (Date.now() >= deadline) return [];
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const auditCount = async (documentId) => (await rig.rootQuery(
  "select count(*)::int n from clara.audit_log where fn='get_document_for_human_read_v2' and entry_id=$1",
  [documentId])).rows[0].n;

before(async () => {
  if (!process.env.PGHOST && !process.env.DATABASE_URL) return; // no rig target: layer 1 only
  rig = await import("./rig.mjs");
  const probe = await rig.rootQuery(
    `select to_regprocedure('clara.get_document_for_human_read_v2(uuid,uuid,uuid,text)') is not null as door,
            to_regprocedure('clara._seed_verified_document(uuid,uuid,text,text,text,bigint,text,uuid,integer,text,date,uuid)') is not null as seeder`);
  ready = probe.rows[0].door === true && probe.rows[0].seeder === true
    && (await rig.runtimeReady()) && (await rig.documentPipelineReady());
  if (!ready) return;
  _resetJwtConfigForTest();

  firmA = await rig.buildFirm("d620a");
  firmB = await rig.buildFirm("d620b");
  clientA2 = await rig.createClient(firmA.owner, { name: `${firmA.prefix}_c2`, opKey: rig.opk("d620c2") });
  doc = await seedDoc(firmA.firm, firmA.client, { filename: "发票 \"2024\"/q\\..pdf" });

  const app = express();
  app.use(documentRoutes());
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  pool = getRuntimePool();
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (rig) await rig.endPool();
  await endPools();
});

const skipHttp = () => (ready ? false : "#620 route: no rig target, or migration 0185 is not applied");

function get(id, token, query = "", init = {}) {
  return fetch(`${baseUrl}/api/documents/${id}/bytes${query}`,
    token ? { ...init, headers: { authorization: `Bearer ${token}` } } : init);
}

test("E2.1 — an own-firm member previews the real bytes INLINE, with the integrity headers", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const before_ = new Set(tempFiles());
  const res = await get(doc.id, await mint(firmA.owner));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.equal(res.headers.get("content-disposition"), "inline");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("etag"), `"${doc.sha}"`, "the ETag is the row's own content address");
  assert.equal(res.headers.get("content-length"), String(doc.bytes.length));
  const body = Buffer.from(await res.arrayBuffer());
  // THE BYTE-HASH RECEIPT, closed at the client end: what arrived hashes to what the row recorded.
  assert.equal(createHash("sha256").update(body).digest("hex"), doc.sha);
  assert.equal(body.length, doc.bytes.length);
  assert.deepEqual(await tempLeak(before_), [], "the per-request temp file must be removed on the success path");
});

test("E2.2 — ?disposition=attachment is a DOWNLOAD: a sanitised quoted name plus the real one in filename*", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const res = await get(doc.id, await mint(firmA.owner), "?disposition=attachment");
  assert.equal(res.status, 200);
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /^attachment; filename="([^"]*)"; filename\*=UTF-8''(.*)$/.exec(cd);
  assert.ok(m, `the disposition must be a parseable attachment (got ${JSON.stringify(cd)})`);
  assert.equal((cd.match(/"/g) ?? []).length, 2, "exactly two quote delimiters — a third is a breakout");
  assert.equal(/[/\\]/.test(cd), false, "no path separator reaches the header");
  assert.equal(/[\r\n]/.test(cd), false, "no CR/LF reaches the header");
  assert.equal(/[^\x20-\x7e]/.test(m[1] ?? ""), false, "the quoted form is pure printable ASCII");
  assert.equal(decodeURIComponent(m[2] ?? ""), "发票 \"2024\"/q\\..pdf", "filename* carries the row's real name");
  await res.arrayBuffer();
});

test("E2.3 — a download is audited as a DOWNLOAD and a preview as a PREVIEW, on the same document", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const token = await mint(firmA.owner);
  const n0 = await auditCount(doc.id);
  await (await get(doc.id, token, `?disposition=attachment&client=${firmA.client}`)).arrayBuffer();
  await (await get(doc.id, token, `?client=${firmA.client}`)).arrayBuffer();
  const rows = (await rig.rootQuery(
    `select args, actor from clara.audit_log where fn='get_document_for_human_read_v2' and entry_id=$1
      order by at desc, ctid desc limit 2`, [doc.id])).rows;
  assert.equal(await auditCount(doc.id), n0 + 2, "two served reads are two receipted egresses");
  assert.deepEqual(rows.map((r) => r.args.purpose).sort(), ["download", "preview"]);
  assert.equal(rows[0].args.client, firmA.client, "the client scope the reader asked for is on the line");
  assert.equal(rows[0].actor, firmA.owner);
});

test("E2.4 — no bearer is 401 `unauthenticated`, and it costs ZERO database round trips", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  // MEASURED AT THE POOL, not inferred from the source: every DB touch this route can make goes
  // through withRuntime, which acquires a client from this very pool.
  let acquires = 0;
  const onAcquire = () => { acquires += 1; };
  pool.on("acquire", onAcquire);
  try {
    for (const res of [
      await get(doc.id, null),                       // no header at all
      await get(doc.id, "not-a-jwt"),                // unparseable
      await get(doc.id, await mint("not-a-uuid")),   // a VALID signature with a bad subject
    ]) {
      assert.equal(res.status, 401);
      const body = await res.json();
      // ONE WORD. `no_bearer` / `jwt_sub` / `jwt_role` would tell an unauthenticated caller which
      // check their token failed.
      assert.deepEqual(body, { error: "unauthenticated", message: "unauthorized" });
    }
  } finally {
    pool.off("acquire", onAcquire);
  }
  assert.equal(acquires, 0, "a 401 must not reach the database");
});

test("E2.5 — every 404 is BYTE-IDENTICAL: malformed, nonexistent, foreign-firm, wrong client", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const token = await mint(firmA.owner);
  const foreign = await seedDoc(firmB.firm, firmB.client);
  const before_ = new Set(tempFiles());
  const auditBefore = await auditCount(doc.id);
  // THE LAST THREE ARE THE HOSTILE SPELLINGS OF THE SAME PARAMETER, and they are here because a
  // scope the route cannot read is not a scope the route may ignore. Measured against express
  // 5.2.1's default "simple" query parser (`app.get("query parser") === "simple"`):
  // a REPEATED key yields an ARRAY, and a BRACKETED key yields a different key name entirely
  // (`client[]`), so `typeof clientRaw === "string"` is false in both cases. Coercing that to
  // "no scope" served the real PDF for a client the caller explicitly narrowed away from, and
  // wrote an egress receipt claiming args.client = null. All three answer the route's own single
  // 404, per its no-oracle comment and the contract's "malformed `client` → 404".
  const responses = {
    malformed: await get("not-a-uuid", token),
    absent: await get(randomUUID(), token),
    foreignFirm: await get(foreign.id, token),
    wrongClient: await get(doc.id, token, `?client=${clientA2}`),
    foreignClient: await get(doc.id, token, `?client=${firmB.client}`),
    malformedClient: await get(doc.id, token, "?client=not-a-uuid"),
    repeatedClient: await get(doc.id, token, `?client=${firmA.client}&client=${firmA.client}`),
    bracketedClient: await get(doc.id, token, `?client[]=${firmA.client}`),
    keyedClient: await get(doc.id, token, `?client[a]=${firmA.client}`),
  };
  const bodies = {};
  for (const [label, res] of Object.entries(responses)) {
    assert.equal(res.status, 404, `${label} must be 404`);
    bodies[label] = await res.json();
  }
  const first = bodies.malformed;
  for (const [label, body] of Object.entries(bodies)) {
    assert.deepEqual(body, first, `${label}'s 404 body differs — that is an existence oracle`);
  }
  // A reason field on SOME 404s would tell them apart just as well as a different status.
  assert.equal(Object.prototype.hasOwnProperty.call(first, "reason"), false);
  assert.equal(await auditCount(foreign.id), 0, "a refused read is not an egress");
  // NOT ONE of these nine is an egress, and the repeated/bracketed pair is the reason to say it
  // here: their old answer was a 200 that wrote an audit line recording `client: null` — a receipt
  // asserting an unscoped read the caller never asked for.
  assert.equal(await auditCount(doc.id), auditBefore,
    "nine refusals must add nothing to the egress ledger");
  assert.deepEqual(await tempLeak(before_), [], "a refusal must leave no temp file behind");
});

test("E2.6 — a principal with no firm at all is 403 no_membership, never a 404 and never bytes", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const stranger = await rig.insertUser(firmA.prefix, `d620s${randomUUID().slice(0, 4)}`);
  const res = await get(doc.id, await mint(stranger));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, "no_membership");
  assert.equal(JSON.stringify(body).includes("%PDF"), false, "a refusal must never carry document bytes");
});

test("E2.7 — a document whose bytes are not in custody is 409 custody_pending, with the door's own reason", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const pending = await seedCustodyPending(firmA.firm);
  const before_ = new Set(tempFiles());
  const res = await get(pending, await mint(firmA.owner));
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "custody_pending");
  assert.equal(body.reason, "custody_pending", "the DATABASE's word reaches the client verbatim");
  assert.equal(await auditCount(pending), 0, "a refusal is not an egress");
  assert.deepEqual(await tempLeak(before_), [], "a refusal must leave no temp file behind");
});

test("E2.8 — a bad disposition is 400 invalid_input, and it is not an existence probe", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const token = await mint(firmA.owner);
  const mine = await get(doc.id, token, "?disposition=download");
  const absent = await get(randomUUID(), token, "?disposition=download");
  assert.equal(mine.status, 400);
  assert.equal(absent.status, 400, "a malformed request is answered before existence is decided");
  assert.deepEqual(await mine.json(), await absent.json());
  assert.equal((await (await get(doc.id, token, "?disposition=INLINE")).json()).error, "invalid_input");
  // THE HOSTILE SPELLINGS, the disposition half of E2.5's client trio. A bracketed key is a
  // different key name under express's "simple" parser and a repeated one is an array, so neither
  // is the string this route will act on — and `inline` is the default, so silently accepting
  // either would serve a document INLINE to a caller who asked for an attachment.
  for (const q of ["?disposition[]=attachment", "?disposition[a]=attachment",
    "?disposition=attachment&disposition=inline"]) {
    const res = await get(doc.id, token, q);
    assert.equal(res.status, 400, `${q} must be a 400, never a served inline preview`);
    assert.equal((await res.json()).error, "invalid_input", q);
  }
  // …and the two supported values are the differential twin.
  assert.equal((await get(doc.id, token, "?disposition=inline")).status, 200);
  assert.equal((await get(doc.id, token, "?disposition=attachment")).status, 200);
});

test("E2.9 — a MISSING object is a 502 storage_error with reason object_missing, never a truncated 200", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  // The row is perfectly valid and the DOOR serves it; the STREAM is what fails. A route that
  // streamed first and verified later would have written a broken PDF to the reader's disk under a
  // 200 — which is exactly why this route downloads-then-streams.
  const ghost = await seedDoc(firmA.firm, firmA.client, { ghost: true });
  const before_ = new Set(tempFiles());
  const res = await get(ghost.id, await mint(firmA.owner));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, "storage_error");
  assert.equal(body.reason, "object_missing",
    "the reader must be told to re-upload, not to retry — a 502 with no reason cannot say which");
  assert.equal(JSON.stringify(body).includes("%PDF"), false);
  assert.deepEqual(await tempLeak(before_), [], "the temp file must be removed on the storage-failure path");
});

test("E2.10 — a TAMPERED object is a 502 checksum_mismatch, and nothing is written for the reader", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const real = Buffer.from(`%PDF-1.7\nd620 honest ${randomUUID()}\n%%EOF\n`);
  const seeded = await seedDoc(firmA.firm, firmA.client, { bytes: real });
  // Substitute the object AT ITS OWN KEY: the row still records the honest sha256, so the content
  // address and the bytes now disagree — a swapped object, which is the case a content-addressed
  // download door exists to catch.
  const dest = join(STORAGE_ROOT, ...seeded.storagePath.split("/"));
  writeFileSync(dest, Buffer.from("%PDF-1.7\nTAMPERED\n%%EOF\n"));
  const before_ = new Set(tempFiles());
  const res = await get(seeded.id, await mint(firmA.owner));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, "checksum_mismatch");
  assert.deepEqual(await tempLeak(before_), [], "the partially-written temp file must be gone");
});

test("E2.11 — a storage failure AFTER the door still carries the door's audit line, and that is the contract", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  // Pinned rather than left implicit. The door writes its egress line INSIDE the read transaction
  // and that transaction commits before a single byte is fetched, so a 502 leaves a line saying the
  // read was AUTHORISED — never that bytes were delivered. Someone auditing egress must know the
  // line means "the estate agreed to serve this", which is exactly the decision worth recording;
  // the delivery evidence is the 200 on the wire. Moving the line after the stream would mean a
  // served document with no receipt whenever the process died mid-stream — strictly worse.
  const ghost = await seedDoc(firmA.firm, firmA.client, { ghost: true });
  const res = await get(ghost.id, await mint(firmA.owner));
  assert.equal(res.status, 502);
  await res.json();
  assert.equal(await auditCount(ghost.id), 1,
    "the door committed its decision; a 502 after it does not un-commit the receipt");
});

test("E2.13 — a client that ABORTS mid-stream leaves no spooled copy of the document behind", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  // THE ABORT IS THE ORDINARY CASE, NOT A CORNER ONE. #620 is the change that makes it routine:
  // the viewer overlay's own useEffect cleanup aborts the in-flight byte read on every document
  // and page switch, and a reader who closes the tab or hits Cancel does the same thing. The route
  // spools the WHOLE decrypted object to os.tmpdir() before it writes a byte — downloadCanonical
  // verifies the content address en route, which is the reason the door downloads-then-streams —
  // so a stream whose promise never settles means the `finally` that unlinks the spool never runs.
  // What is left behind is a byte-identical, unowned copy of the CLIENT'S SOURCE DOCUMENT, and
  // nothing in the estate ever removes it: this route is the only producer of a clara-docbytes-*
  // file anywhere in the repository, so there is no sweeper to catch up later.
  //
  // MULTI-MEGABYTE ON PURPOSE. A small document is written to the socket in one turn and the
  // stream ends before any client could abort, so the cell would pass on broken code. 8 MiB is
  // larger than the socket and undici buffers together, so the server is genuinely mid-pipe and
  // under backpressure when the abort lands.
  const big = Buffer.alloc(8 * 1024 * 1024, 0x41);
  big.write("%PDF-1.7\n620 abort\n");
  const bulky = await seedDoc(firmA.firm, firmA.client, { bytes: big, filename: "bulky.pdf" });
  const before_ = new Set(tempFiles());
  const ac = new AbortController();
  const res = await get(bulky.id, await mint(firmA.owner), "", { signal: ac.signal });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  const first = await reader.read();
  assert.ok((first.value?.length ?? 0) > 0, "the stream must have STARTED before the abort");
  assert.ok(first.value.length < big.length, "the abort must land mid-transfer, not after the end");
  ac.abort();
  await reader.cancel().catch(() => {});
  assert.deepEqual(await tempLeak(before_), [],
    "an aborted read must not leave the reader's own document spooled in os.tmpdir()");
});

test("E2.14 — a row whose byte_size disagrees with the stored object still serves a CORRECT 200", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  // TWO AUTHORITIES FOR ONE NUMBER IS THE DEFECT. The body is the file `downloadCanonical` just
  // wrote and hash-verified against the row's sha256; the Content-Length header was taken from
  // `clara.documents.byte_size`, a column no CHECK ties to the stored object and which
  // `clara._seed_verified_document` (and any direct writer) can set freely. When they disagree
  // Node kills the connection mid-body, so the reader gets an opaque transport failure instead of
  // either the document or the typed answer the error ladder exists to give.
  //
  // DEFENSIVE, NOT A LIVE BUG: ordinary intake measures the length off the same stream it hashes
  // (spool.mjs:270 -> intake.mjs:229), so real rows agree. This cell pins which of the two
  // authorities wins when they do not.
  const payload = Buffer.from(`%PDF-1.7\nd620 skew ${randomUUID()}\n%%EOF\n`);
  const skewed = await seedDoc(firmA.firm, firmA.client,
    { bytes: payload, byteSize: payload.length + 4096, filename: "skew.pdf" });
  const before_ = new Set(tempFiles());
  const res = await get(skewed.id, await mint(firmA.owner));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-length"), String(payload.length),
    "the header must describe the ARTEFACT it precedes, not a column that disagrees with it");
  // The ETag stays the ROW's content address: that is the estate's integrity receipt, and it is
  // the number the bytes were actually verified against.
  assert.equal(res.headers.get("etag"), `"${skewed.sha}"`);
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(body.length, payload.length, "a killed connection is not an answer");
  assert.equal(createHash("sha256").update(body).digest("hex"), skewed.sha);
  assert.deepEqual(await tempLeak(before_), []);
});

test("E2.15 — an UNCONFIGURED runtime reaches the reader as 503 storage_error/unconfigured", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  // THE JOIN NOTHING ELSE MAKES. P2.6 in storage-read-contract.test.mjs proves realConfig raises a
  // 503/unconfigured; E2.9 proves a 502/object_missing on the wire. Between them sat the route's
  // OWN mapping — `{ status: err.status ?? 502, code: err.code }` plus the typed reason — and no
  // cell at any layer exercised the 503 arm or the credential_refused reason end to end. The
  // reason matters because the four outcomes want four different human answers: "fix the
  // deployment" is not "retry", and the route is where that word reaches the reader.
  //
  // SCOPED HONESTLY: apps/web collapses 502 and 503 into one `storage_unavailable` state (pinned
  // at apps/web/lib/documents/bytes.test.ts:292-293), so this is contract conformance and drift
  // protection, not a user-visible defect today.
  const real = await capturedStorageError(t);
  assert.ok(real instanceof StorageError, "realConfig must refuse an unconfigured runtime");
  assert.equal(real.status, 503, "captured from storage.mjs, not written here");
  assert.equal(real.reason, "unconfigured");
  const token = await mint(firmA.owner);
  const before_ = new Set(tempFiles());
  const res = await withInjectedStorage(() => { throw real; }, () => get(doc.id, token));
  assert.equal(res.status, 503, "a deployment fault is a 503, not a 502 about the provider");
  assert.deepEqual(await res.json(),
    { error: "storage_error", message: "document unavailable", reason: "unconfigured" });
  assert.deepEqual(await tempLeak(before_), []);
});

test("E2.16 — a REFUSED custody credential reaches the reader as 502 storage_error/credential_refused", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  // The documented InvalidJWT envelope, classified by storage.mjs itself and injected verbatim:
  // a rotated or expired custody credential must tell the operator "rotate", which is a different
  // instruction from "re-upload" (object_missing) and from "retry" (unavailable).
  const real = await capturedStorageError(t, {
    env: realConfigEnv(),
    respond: async () => new Response(JSON.stringify({ code: "InvalidJWT", message: "jwt expired" }),
      { status: 401 }),
  });
  assert.ok(real instanceof StorageError);
  assert.equal(real.status, 502);
  assert.equal(real.reason, "credential_refused", "captured from classifyGetFailure, not written here");
  assert.match(real.message, /jwt expired/, "the vendor body stays IN the server-side error…");
  const token = await mint(firmA.owner);
  const before_ = new Set(tempFiles());
  const res = await withInjectedStorage(() => { throw real; }, () => get(doc.id, token));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.deepEqual(body,
    { error: "storage_error", message: "document unavailable", reason: "credential_refused" });
  // …AND NEVER ON THE WIRE. The reader gets the estate's word, not the provider's prose.
  assert.equal(JSON.stringify(body).includes("jwt expired"), false,
    "vendor body text must not reach the client");
  assert.deepEqual(await tempLeak(before_), []);
});

test("E2.17 — a storage failure AFTER the write stream opens CREATES a spool and then removes it", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  // THE ONE STORAGE-FAILURE SHAPE THE OTHER CELLS CANNOT REACH. E2.9's missing object and every
  // other `storage_error` reason are raised inside `responseFor`, i.e. BEFORE
  // `downloadCanonical` mkdirs the destination and opens its write stream — so their "no leftover
  // temp file" assertion is true of a file that was never created, and it could not fail. This
  // cell fails the stream MID-BODY instead: one chunk is written, the spool is observed on disk,
  // and only then does the source throw. It is the only cell in which the storage-failure path's
  // cleanup is a measurement rather than a tautology.
  const token = await mint(firmA.owner);
  const before_ = new Set(tempFiles());
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const body = (async function* () {
    yield Buffer.alloc(256 * 1024, 0x41);
    await held;      // hold the stream open so the spool is observable on disk
    throw new StorageError("storage_error",
      "Storage read failed (network: connection reset by peer)", 502, "unavailable");
  })();
  const pending = withInjectedStorage(async () => body, () => get(doc.id, token));
  const created = await tempAppeared(before_);
  release();
  const res = await pending;
  assert.equal(created.length, 1,
    "the route must have SPOOLED a file before the failure — otherwise this cell proves nothing");
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(),
    { error: "storage_error", message: "document unavailable", reason: "unavailable" });
  assert.deepEqual(await tempLeak(before_), [],
    "the partially written spool must be removed on the storage-failure path");
});

test("E2.12 — a removed member is refused on the very NEXT request, with the same token", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const user = await rig.addMember(firmA.owner, firmA.firm, { role: "bookkeeper", prefix: "d620rm" });
  // (rig.mjs's OWN addMember(ownerSub, firm, {role, prefix}) shadows relay-fixtures' export of the
  // same name and returns the new user id — that is the shape used above.)
  const membership = (await rig.rootQuery(
    "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [firmA.firm, user])).rows[0]?.id;
  assert.ok(membership);
  const token = await mint(user); // ONE token, used on both sides of the removal
  const served = await get(doc.id, token);
  assert.equal(served.status, 200, "the ADMITTED twin: an active member is served");
  await served.arrayBuffer();
  await rig.removeMember(firmA.owner, { membership, opKey: rig.opk("d620rm") });
  const refused = await get(doc.id, token);
  assert.ok(refused.status === 403 || refused.status === 404,
    `a removed member must be refused on the next request (got ${refused.status})`);
  assert.equal((await refused.text()).includes("%PDF"), false);
});
