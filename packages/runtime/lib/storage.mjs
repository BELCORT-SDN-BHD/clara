import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";

export class StorageError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.status = status;
  }
}

function safeKey(key) {
  const value = String(key || "");
  if (!/^firms\/[0-9a-f-]{36}\/docs\/[0-9a-f]{64}\.[a-z0-9]{1,12}$/i.test(value)) {
    throw new StorageError("storage_error", "canonical storage key is invalid");
  }
  return value;
}

function testRoot() {
  return process.env.CLARA_TEST_STORAGE_DIR || join(process.env.CLARA_SPOOL_DIR || ".", "test-storage");
}

function localPath(key) {
  return join(testRoot(), ...safeKey(key).split("/"));
}

/**
 * WHAT A LOCAL OPEN FAILURE MEANS (#630, fifth review round, finding [3]).
 *
 * The eager-open cure below used to swallow `err` and report every failure as "(object absent)".
 * A permission failure, a directory standing where the object should be, or fd exhaustion then
 * read to an operator as MISSING BYTES — and since `storage_error` is in local-facts.mjs's
 * RETRYABLE set (:48), the lane logs `retryable=true ... (object absent)` and re-drives a task
 * whose object is in fact present and unreadable. `localObjectExists` in this same file already
 * keeps ENOENT and everything else apart (:191-199); this is the same discipline for the readers.
 *
 * THE TYPE DOES NOT CHANGE, only the diagnosis. Every arm stays `storage_error`: the retry is
 * bounded (the task stays `running` until requeueStranded's window and the DB attempt cap), and
 * moving EACCES out of the retryable set would be a behaviour change this finding did not ask
 * for and no cell measures. What changes is that the message names the errno instead of
 * asserting something the process never checked.
 *
 * ENOTDIR joins ENOENT: a path component that is not a directory means the object is not there,
 * which is the same fact by a different route. Everything else names itself.
 */
export function localOpenFailure(err, what) {
  const code = err?.code;
  if (code === "ENOENT" || code === "ENOTDIR") {
    return new StorageError("storage_error", `${what} storage read failed (object absent)`);
  }
  return new StorageError("storage_error",
    `${what} storage read failed (${code || "open failed, no errno"})`);
}

/**
 * Open a RELAY_TEST_MODE object EAGERLY and hand back a stream that is already attached to the
 * open file handle.
 *
 * A BARE `createReadStream(path)` IS A LOADED GUN IN A CRASH-ONLY PROCESS (#630). It is lazy: the
 * `open()` runs on a later libuv turn and its failure arrives as an `'error'` EVENT, not as a
 * rejected promise. Every reader below has at least one `await` between creating that stream and
 * the `pipeline()` that would listen to it (`downloadCanonical`'s destination `mkdir` is the
 * measured one), so on a missing object the event fired into an EMPTY listener set, Node re-raised
 * it as an uncaughtException, and `scripts/serve.mjs`'s fatal handler took the whole supervisor
 * down at startup. One absent file under `packages/runtime/test-storage` — the ordinary state of a
 * rebuilt rig whose database still holds `clara.documents` rows — was enough.
 *
 * Opening first also makes the LOCAL failure the SAME failure the deployed one is: a typed,
 * retryable `storage_error`, not a bare ENOENT a route's error mapper reads as an unrecognised
 * internal fault. `artifactResponseFor` below already took this cure for the artifact family and
 * records the same reasoning; this is that cure, shared by the other three.
 */
async function openLocalStream(path, what) {
  let fh;
  try {
    fh = await open(path, "r");
  } catch (err) {
    throw localOpenFailure(err, what);
  }
  // `FileHandle.createReadStream` owns the handle and closes it on end/error/destroy, and the fd
  // is already open — so there is no second `open()` left to fail asynchronously.
  return fh.createReadStream();
}

function decodeJwtClaims(jwt) {
  try {
    return JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function realConfig() {
  const base = process.env.CLARA_STORAGE_URL;
  const jwt = process.env.CLARA_STORAGE_ROLE_JWT;
  const designatedRole = process.env.CLARA_STORAGE_ROLE
    || (process.env.RELAY_TEST_MODE === "1" ? "clara_storage_docs" : "");
  if (!base || !jwt || !designatedRole) {
    throw new StorageError("storage_error", "Storage custom-role configuration is missing", 503);
  }
  if (["anon", "authenticated", "service_role"].includes(designatedRole)) {
    throw new StorageError("storage_error", "Storage designated role must be a dedicated custom role", 503);
  }
  const claims = decodeJwtClaims(jwt);
  const exp = Number(claims?.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now() + 30_000) {
    throw new StorageError("storage_error", "Storage role credential is expired or malformed", 503);
  }
  if (typeof claims?.role !== "string"
      || ["anon", "authenticated", "service_role"].includes(claims.role)
      || claims.role !== designatedRole) {
    throw new StorageError("storage_error", "Storage credential does not assume the designated custom-role", 503);
  }
  return { base: base.replace(/\/+$/, ""), jwt };
}

function objectUrl(base, key) {
  return `${base}/${safeKey(key).split("/").map(encodeURIComponent).join("/")}`;
}

async function localPut(filePath, key) {
  const dest = localPath(key);
  await mkdir(dirname(dest), { recursive: true });
  try {
    await pipeline(createReadStream(filePath), createWriteStream(dest, { flags: "wx", mode: 0o600 }));
    return { created: true, existed: false };
  } catch (err) {
    if (err?.code === "EEXIST") return { created: false, existed: true };
    await rm(dest, { force: true }).catch(() => {});
    throw err;
  }
}

export async function putCanonical(filePath, key, mime) {
  safeKey(key);
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    return injected?.put ? injected.put(filePath, key, mime) : localPut(filePath, key);
  }
  const { base, jwt } = realConfig();
  const response = await fetch(objectUrl(base, key), {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt, "content-type": mime, "x-upsert": "false" },
    body: createReadStream(filePath),
    duplex: "half",
  });
  // SUPABASE WRAPS ITS REAL STATUS INSIDE THE BODY. A duplicate object comes back as
  // **HTTP 400** with `{"statusCode":"409","error":"Duplicate",...}`, and a permission failure
  // as HTTP 400 with `{"statusCode":"403",...}`. So `response.status === 409` was NEVER true and
  // the re-upload path below was unreachable: every duplicate became a fatal `storage_error`.
  // Found 2026-07-26 by re-uploading an already-ingested document, which is the ordinary case —
  // a human re-dropping a file they already sent. Read the body ONCE and branch on what it says.
  if (response.ok) return { created: true, existed: false };
  const body = await response.text().catch(() => "");
  let inner = null;
  try { inner = JSON.parse(body); } catch { /* not JSON — fall through to the raw body */ }
  if (response.status === 409 || String(inner?.statusCode) === "409" || inner?.error === "Duplicate") {
    return { created: false, existed: true };
  }
  // Carry the BODY, not just the HTTP status: `(400)` alone cannot distinguish a duplicate from
  // a permission denial from a bad key, and discarding it cost a full day of diagnosis.
  throw new StorageError(
    "storage_error",
    `Storage upload failed (${response.status})${body ? ` ${body.slice(0, 200)}` : ""}`,
  );
}

async function responseFor(key) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.get) return injected.get(key);
    return openLocalStream(localPath(key), "canonical");
  }
  const { base, jwt } = realConfig();
  const response = await fetch(objectUrl(base, key), {
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt },
  });
  if (!response.ok || !response.body) throw new StorageError("storage_error", `Storage read failed (${response.status})`);
  return response.body;
}

export async function hashCanonical(key) {
  const body = await responseFor(safeKey(key));
  const hash = createHash("sha256");
  for await (const chunk of body) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyCanonical(key, expectedSha256) {
  const actual = await hashCanonical(key);
  if (actual !== expectedSha256) throw new StorageError("checksum_mismatch", "canonical readback hash mismatch");
  return { sha256: actual };
}

export async function downloadCanonical(key, destination, expectedSha256) {
  const body = await responseFor(safeKey(key));
  await mkdir(dirname(destination), { recursive: true });
  const hash = createHash("sha256");
  const tee = async function* () {
    for await (const chunk of body) {
      hash.update(chunk);
      yield chunk;
    }
  };
  await pipeline(tee(), createWriteStream(destination, { flags: "w", mode: 0o600 }));
  const actual = hash.digest("hex");
  if (expectedSha256 && actual !== expectedSha256) {
    await rm(destination, { force: true }).catch(() => {});
    throw new StorageError("checksum_mismatch", "downloaded canonical object no longer matches its document SHA");
  }
  return { path: destination, sha256: actual };
}

export async function localObjectExists(key) {
  if (process.env.RELAY_TEST_MODE !== "1") return null;
  try {
    const fh = await open(localPath(key), "r");
    await fh.close();
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Wave B — the wiki content-addressed object family (migration 0017 W5). ADDITIVE ONLY: a
// safeWikiKey validator sibling of safeKey + put/verify siblings that share the private
// realConfig()/test-shim plumbing but validate the DISTINCT wiki key grammar
// (firms/{firm}/wiki/{client}/{sha}.md). The docs safeKey regex above is UNTOUCHED, so a wiki
// key can never be put on the docs path and vice-versa. Same private bucket (firm-docs → the
// daily rclone mirror covers wiki bytes for free). Overwrite is structurally impossible
// (x-upsert:false → a 409 is idempotent success). Reuses globalThis.__claraStorageForTest when
// the injected shim is wiki-key-aware; otherwise the local file shim handles wiki keys directly.
// ---------------------------------------------------------------------------
export function safeWikiKey(key) {
  const value = String(key || "");
  if (!/^firms\/[0-9a-f-]{36}\/wiki\/[0-9a-f-]{36}\/[0-9a-f]{64}\.md$/i.test(value)) {
    throw new StorageError("storage_error", "canonical wiki storage key is invalid");
  }
  return value;
}

function wikiLocalPath(key) {
  return join(testRoot(), ...safeWikiKey(key).split("/"));
}
function wikiObjectUrl(base, key) {
  return `${base}/${safeWikiKey(key).split("/").map(encodeURIComponent).join("/")}`;
}
async function wikiLocalPut(filePath, key) {
  const dest = wikiLocalPath(key);
  await mkdir(dirname(dest), { recursive: true });
  try {
    await pipeline(createReadStream(filePath), createWriteStream(dest, { flags: "wx", mode: 0o600 }));
    return { created: true, existed: false };
  } catch (err) {
    if (err?.code === "EEXIST") return { created: false, existed: true };
    await rm(dest, { force: true }).catch(() => {});
    throw err;
  }
}

export async function putWikiCanonical(filePath, key, mime = "text/markdown") {
  safeWikiKey(key);
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    return injected?.put ? injected.put(filePath, key, mime) : wikiLocalPut(filePath, key);
  }
  const { base, jwt } = realConfig();
  const response = await fetch(wikiObjectUrl(base, key), {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt, "content-type": mime, "x-upsert": "false" },
    body: createReadStream(filePath),
    duplex: "half",
  });
  if (response.status === 409) return { created: false, existed: true };
  if (!response.ok) throw new StorageError("storage_error", `wiki storage upload failed (${response.status})`);
  return { created: true, existed: false };
}

async function wikiResponseFor(key) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.get) return injected.get(key);
    return openLocalStream(wikiLocalPath(key), "wiki");
  }
  const { base, jwt } = realConfig();
  const response = await fetch(wikiObjectUrl(base, key), { headers: { authorization: `Bearer ${jwt}`, apikey: jwt } });
  if (!response.ok || !response.body) throw new StorageError("storage_error", `wiki storage read failed (${response.status})`);
  return response.body;
}

export async function hashWikiCanonical(key) {
  const body = await wikiResponseFor(safeWikiKey(key));
  const hash = createHash("sha256");
  for await (const chunk of body) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyWikiCanonical(key, expectedSha256) {
  const actual = await hashWikiCanonical(key);
  if (actual !== expectedSha256) throw new StorageError("checksum_mismatch", "wiki canonical readback hash mismatch");
  return { sha256: actual };
}

// ---------------------------------------------------------------------------
// Wave E lane ζ — the sealed-report object family (design part2 §9, "Custody"). ADDITIVE ONLY,
// and the third key family beside safeKey (docs) and safeWikiKey (wiki): a safeReportKey
// validator plus put/verify siblings sharing the same private realConfig()/test-shim plumbing.
// The docs and wiki regexes above are UNTOUCHED, so a report key can never be put on the docs or
// wiki path and vice-versa.
//
// Same `firm-docs` bucket, deliberately (§9): the wiki family made exactly this call so the daily
// R2 mirror covers the bytes for free — a new bucket needs its own mirror, restore drill and role.
//
// THE BUCKET POLICY IS NOT INHERITED, AND THAT IS THE POINT (§9, R18/MINOR 25). safeKey's live
// regex admits only `firms/…/docs/…` and the role check is about the ROLE, not the prefix — so
// the storage role's policy must be extended to the `reports/` prefix DELIBERATELY. That
// extension is a named ceremony step with a positive read (upload one object, read it back by
// key) before the first seal — a ceremony this repository does not carry a runbook for (#617:
// the `docs/ops/DR.md` cited here does not exist); it is not implied by this code either.
//
// Overwrite is structurally impossible (x-upsert:false → a 409 is idempotent success), which is
// what makes an at-least-once render safe: the key is the content address, so a second identical
// render writes the same bytes to the same key and the second PUT is a no-op.
// ---------------------------------------------------------------------------
export function safeReportKey(key) {
  const value = String(key || "");
  if (!/^firms\/[0-9a-f-]{36}\/reports\/[0-9a-f]{64}\.(pdf|json)$/i.test(value)) {
    throw new StorageError("storage_error", "canonical report storage key is invalid");
  }
  return value;
}

function reportLocalPath(key) {
  return join(testRoot(), ...safeReportKey(key).split("/"));
}
function reportObjectUrl(base, key) {
  return `${base}/${safeReportKey(key).split("/").map(encodeURIComponent).join("/")}`;
}
async function reportLocalPut(filePath, key) {
  const dest = reportLocalPath(key);
  await mkdir(dirname(dest), { recursive: true });
  try {
    await pipeline(createReadStream(filePath), createWriteStream(dest, { flags: "wx", mode: 0o600 }));
    return { created: true, existed: false };
  } catch (err) {
    if (err?.code === "EEXIST") return { created: false, existed: true };
    await rm(dest, { force: true }).catch(() => {});
    throw err;
  }
}

export async function putReportCanonical(filePath, key, mime = "application/pdf") {
  safeReportKey(key);
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    return injected?.put ? injected.put(filePath, key, mime) : reportLocalPut(filePath, key);
  }
  const { base, jwt } = realConfig();
  const response = await fetch(reportObjectUrl(base, key), {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt, "content-type": mime, "x-upsert": "false" },
    body: createReadStream(filePath),
    duplex: "half",
  });
  if (response.ok) return { created: true, existed: false };
  // Supabase wraps its real status inside the BODY (the 2026-07-26 finding the docs family
  // documents above): a duplicate comes back as HTTP 400 with {"statusCode":"409",...}. Read the
  // body once and branch on what it says — a duplicate report object is idempotent SUCCESS, and
  // treating it as a fatal error is exactly what would make an at-least-once render unsafe.
  const body = await response.text().catch(() => "");
  let inner = null;
  try { inner = JSON.parse(body); } catch { /* not JSON — fall through to the raw body */ }
  if (response.status === 409 || String(inner?.statusCode) === "409" || inner?.error === "Duplicate") {
    return { created: false, existed: true };
  }
  throw new StorageError(
    "storage_error",
    `report storage upload failed (${response.status})${body ? ` ${body.slice(0, 200)}` : ""}`,
  );
}

async function reportResponseFor(key) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.get) return injected.get(key);
    return openLocalStream(reportLocalPath(key), "report");
  }
  const { base, jwt } = realConfig();
  const response = await fetch(reportObjectUrl(base, key), { headers: { authorization: `Bearer ${jwt}`, apikey: jwt } });
  if (!response.ok || !response.body) throw new StorageError("storage_error", `report storage read failed (${response.status})`);
  return response.body;
}

export async function hashReportCanonical(key) {
  const body = await reportResponseFor(safeReportKey(key));
  const hash = createHash("sha256");
  for await (const chunk of body) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyReportCanonical(key, expectedSha256) {
  const actual = await hashReportCanonical(key);
  if (actual !== expectedSha256) throw new StorageError("checksum_mismatch", "report canonical readback hash mismatch");
  return { sha256: actual };
}

// ---------------------------------------------------------------------------
// THE ARTIFACT PREFIXES — the READ half of the two sealed-artifact families (FS-7 echelon 2,
// 裁-96②), plus the sandbox family's WRITE half.
//
// TWO PREFIXES, ONE KEY SPACE, AND THE SHAPE IS THE DATABASE'S. `firms/<firm>/reports/<sha>.<ext>`
// is what clara.report_artifacts' ck_ra_content_addressed CHECK derives; `firms/<firm>/sandbox/
// <sha>.pdf` is what clara.complete_sandbox_export refuses to deviate from. This validator admits
// exactly those two and nothing else, so a key that reached here from anywhere but one of those
// two writers cannot be fetched — the traversal wall is the SHAPE, not an escaping pass.
//
// IT IS DELIBERATELY NOT A WIDENING OF safeReportKey. That validator is the seal path's own, its
// callers pass only `reports/` keys, and loosening it would silently let a report writer put bytes
// under the sandbox prefix. A second, read-side validator that admits both is additive: neither
// writer's wall moves.
export function safeArtifactKey(key) {
  const value = String(key || "");
  if (!/^firms\/[0-9a-f-]{36}\/reports\/[0-9a-f]{64}\.(pdf|json)$/i.test(value)
      && !/^firms\/[0-9a-f-]{36}\/sandbox\/[0-9a-f]{64}\.pdf$/i.test(value)) {
    throw new StorageError("storage_error", "canonical artifact storage key is invalid");
  }
  return value;
}

function artifactLocalPath(key) {
  return join(testRoot(), ...safeArtifactKey(key).split("/"));
}
function artifactObjectUrl(base, key) {
  return `${base}/${safeArtifactKey(key).split("/").map(encodeURIComponent).join("/")}`;
}

async function artifactResponseFor(key) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.get) return injected.get(key);
    // A MISSING OBJECT IS A StorageError IN BOTH MODES, and that costs one stat to guarantee.
    // Without it the local path raises a bare ENOENT from the stream, which a route's error mapper
    // reads as an unrecognised internal fault (500) while the real Supabase path raises a
    // StorageError (502) for the identical condition — so the local test would have been measuring
    // a different failure than the deployed one. Measured, not assumed: this is the divergence the
    // FS-7 e2 route battery's missing-object cell actually caught.
    const path = artifactLocalPath(key);
    try {
      const fh = await open(path, "r");
      await fh.close();
    } catch (err) {
      // Through the SAME classifier as the other three families (#630 finding [3]): this catch
      // carried the identical "always absent" claim. For ENOENT the message is byte-identical to
      // what it was, so nothing that reads it changes; a permission failure now says so.
      throw localOpenFailure(err, "artifact");
    }
    return createReadStream(path);
  }
  const { base, jwt } = realConfig();
  const response = await fetch(artifactObjectUrl(base, key), {
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt },
  });
  if (!response.ok || !response.body) {
    throw new StorageError("storage_error", `artifact storage read failed (${response.status})`);
  }
  return response.body;
}

/**
 * Download one sealed artifact to a local path, hashing EN ROUTE and refusing on mismatch.
 *
 * THE HASH IS NOT OPTIONAL HERE, unlike downloadCanonical's. Both artifact families are
 * content-addressed — the sha256 IS the last path segment — so a byte stream that does not hash to
 * the expected value is either a tampered object or the wrong object, and there is no third
 * reading. Serving it to a human would hand them a document the estate cannot vouch for, which is
 * the one thing a download door exists to prevent.
 */
export async function downloadArtifactCanonical(key, destination, expectedSha256) {
  if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new StorageError("storage_error", "an artifact download requires the row's own sha256");
  }
  const body = await artifactResponseFor(safeArtifactKey(key));
  await mkdir(dirname(destination), { recursive: true });
  const hash = createHash("sha256");
  const tee = async function* () {
    for await (const chunk of body) {
      hash.update(chunk);
      yield chunk;
    }
  };
  await pipeline(tee(), createWriteStream(destination, { flags: "w", mode: 0o600 }));
  const actual = hash.digest("hex");
  if (actual !== expectedSha256) {
    await rm(destination, { force: true }).catch(() => {});
    throw new StorageError("checksum_mismatch", "the stored artifact no longer matches its sealed sha256");
  }
  return { path: destination, sha256: actual };
}

/**
 * Put one sandbox export's bytes at their content address. Overwrite-impossible (`x-upsert:false`),
 * the putReportCanonical shape exactly — including the Supabase quirk where a duplicate arrives as
 * HTTP 400 carrying `{"statusCode":"409"}` in the body, which is idempotent SUCCESS for a
 * content-addressed key and must never be treated as a fatal error.
 */
export async function putSandboxCanonical(filePath, key, mime = "application/pdf") {
  const value = safeArtifactKey(key);
  if (!/\/sandbox\//.test(value)) {
    throw new StorageError("storage_error", "a sandbox export writes under the sandbox prefix only");
  }
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.put) return injected.put(filePath, key, mime);
    const dest = artifactLocalPath(key);
    await mkdir(dirname(dest), { recursive: true });
    try {
      await pipeline(createReadStream(filePath), createWriteStream(dest, { flags: "wx", mode: 0o600 }));
      return { created: true, existed: false };
    } catch (err) {
      if (err?.code === "EEXIST") return { created: false, existed: true };
      await rm(dest, { force: true }).catch(() => {});
      throw err;
    }
  }
  const { base, jwt } = realConfig();
  const response = await fetch(artifactObjectUrl(base, key), {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt, "content-type": mime, "x-upsert": "false" },
    body: createReadStream(filePath),
    duplex: "half",
  });
  if (response.ok) return { created: true, existed: false };
  const raw = await response.text().catch(() => "");
  let inner = null;
  try { inner = JSON.parse(raw); } catch { /* not JSON — fall through to the raw body */ }
  if (response.status === 409 || String(inner?.statusCode) === "409" || inner?.error === "Duplicate") {
    return { created: false, existed: true };
  }
  throw new StorageError(
    "storage_error",
    `sandbox storage upload failed (${response.status})${raw ? ` ${raw.slice(0, 200)}` : ""}`,
  );
}

/** The sandbox family's read-back hash, the verifyReportCanonical sibling. */
export async function hashSandboxCanonical(key) {
  const body = await artifactResponseFor(safeArtifactKey(key));
  const hash = createHash("sha256");
  for await (const chunk of body) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifySandboxCanonical(key, expectedSha256) {
  const actual = await hashSandboxCanonical(key);
  if (actual !== expectedSha256) {
    throw new StorageError("checksum_mismatch", "sandbox canonical readback hash mismatch");
  }
  return { sha256: actual };
}
