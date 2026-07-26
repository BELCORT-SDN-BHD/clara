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
    return createReadStream(localPath(key));
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
    return createReadStream(wikiLocalPath(key));
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
