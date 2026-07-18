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
  if (response.status === 409) return { created: false, existed: true };
  if (!response.ok) throw new StorageError("storage_error", `Storage upload failed (${response.status})`);
  return { created: true, existed: false };
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
