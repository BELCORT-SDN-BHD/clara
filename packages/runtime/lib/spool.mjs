import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, open, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_BYTES = 20 * 1024 * 1024;
const PREFIX_BYTES = 8192;
const activeByPrincipal = new Map();
let activeIngress = 0;
let reservedBytes = 0;
let draining = false;
let idleWaiters = [];

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function spoolConfig() {
  const defaultDir = process.platform === "win32" ? join(tmpdir(), "clara-spool") : "/data/spool";
  return {
    dir: process.env.CLARA_SPOOL_DIR || defaultDir,
    quotaBytes: Math.floor(positiveNumber(process.env.CLARA_SPOOL_QUOTA_MB, 512) * 1024 * 1024),
    // Never reap a still-valid 15-minute upload capability. The reconciler first
    // transitions expired DB intakes, then this filesystem TTL removes residue.
    ttlMs: Math.max(15 * 60_000, Math.floor(positiveNumber(process.env.CLARA_SPOOL_TTL_MIN, 60) * 60_000)),
  };
}

function safeId(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new Error("invalid intake/task id");
  return String(id).toLowerCase();
}

export function intakePaths(id) {
  const base = join(spoolConfig().dir, `intake-${safeId(id)}`);
  return { bytes: `${base}.bin`, meta: `${base}.json` };
}

export function taskMetaPath(id) {
  return join(spoolConfig().dir, `task-${safeId(id)}.json`);
}

export async function ensureSpoolDir() {
  const { dir } = spoolConfig();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function atomicJson(path, value) {
  await ensureSpoolDir();
  const next = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(next, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(next, path);
}

export async function writeIntakeMeta(id, value) {
  await atomicJson(intakePaths(id).meta, value);
}

export async function readIntakeMeta(id) {
  try {
    const fh = await open(intakePaths(id).meta, "r");
    try {
      return JSON.parse(await fh.readFile("utf8"));
    } finally {
      await fh.close();
    }
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeTaskMeta(id, value) {
  await atomicJson(taskMetaPath(id), value);
}

export async function readTaskMeta(id) {
  try {
    const fh = await open(taskMetaPath(id), "r");
    try {
      return JSON.parse(await fh.readFile("utf8"));
    } finally {
      await fh.close();
    }
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

async function listJson(prefix) {
  const dir = await ensureSpoolDir();
  const names = await readdir(dir);
  const rows = [];
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".json")) continue;
    try {
      const fh = await open(join(dir, name), "r");
      try {
        rows.push(JSON.parse(await fh.readFile("utf8")));
      } finally {
        await fh.close();
      }
    } catch (err) {
      if (err?.code !== "ENOENT") rows.push({ corrupt: true, file: name });
    }
  }
  return rows;
}

export const listIntakeMetas = () => listJson("intake-");
export const listTaskMetas = () => listJson("task-");

export async function removeIntakeSpool(id, { metadata = true } = {}) {
  const paths = intakePaths(id);
  await rm(paths.bytes, { force: true }).catch(() => {});
  if (metadata) await rm(paths.meta, { force: true }).catch(() => {});
}

export async function removeTaskMeta(id) {
  await rm(taskMetaPath(id), { force: true }).catch(() => {});
}

export async function spoolUsage() {
  const dir = await ensureSpoolDir();
  let usedBytes = 0;
  let files = 0;
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".bin")) continue;
    try {
      const s = await stat(join(dir, name));
      if (s.isFile()) {
        usedBytes += s.size;
        files += 1;
      }
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }
  }
  return { usedBytes, files, reservedBytes, quotaBytes: spoolConfig().quotaBytes };
}

export async function spoolRequest(readable, { intakeId, declaredBytes, maxBytes = MAX_BYTES }) {
  const expected = Number(declaredBytes);
  if (!Number.isSafeInteger(expected) || expected <= 0 || expected > maxBytes) {
    const err = new Error("declared upload size is invalid");
    err.code = "too_large";
    throw err;
  }
  const usage = await spoolUsage();
  if (usage.usedBytes + reservedBytes + expected > usage.quotaBytes) {
    const err = new Error("spool quota exhausted");
    err.code = "limit";
    throw err;
  }

  const { bytes } = intakePaths(intakeId);
  await ensureSpoolDir();
  reservedBytes += expected;
  let count = 0;
  const hash = createHash("sha256");
  const prefixChunks = [];
  let prefixLength = 0;
  const meter = new Transform({
    transform(chunk, _enc, callback) {
      count += chunk.length;
      if (count > maxBytes || count > expected) {
        const err = new Error("upload exceeds its declared or absolute size cap");
        err.code = "too_large";
        callback(err);
        return;
      }
      hash.update(chunk);
      if (prefixLength < PREFIX_BYTES) {
        const take = Math.min(chunk.length, PREFIX_BYTES - prefixLength);
        prefixChunks.push(Buffer.from(chunk.subarray(0, take)));
        prefixLength += take;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(readable, meter, createWriteStream(bytes, { flags: "w", mode: 0o600, highWaterMark: 64 * 1024 }));
    if (count !== expected) {
      const err = new Error(`upload length ${count} does not match declared length ${expected}`);
      err.code = "too_large";
      throw err;
    }
    return { path: bytes, byteSize: count, sha256: hash.digest("hex"), prefix: Buffer.concat(prefixChunks) };
  } catch (err) {
    await rm(bytes, { force: true }).catch(() => {});
    throw err;
  } finally {
    reservedBytes -= expected;
  }
}

export function tryEnterIngress(principalId) {
  if (draining) return null;
  const key = String(principalId);
  const current = activeByPrincipal.get(key) || 0;
  if (activeIngress >= 2 || current >= 2) return null;
  activeIngress += 1;
  activeByPrincipal.set(key, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeIngress -= 1;
    const next = (activeByPrincipal.get(key) || 1) - 1;
    if (next <= 0) activeByPrincipal.delete(key);
    else activeByPrincipal.set(key, next);
    if (activeIngress === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  };
}

export async function stopIntakeIngress() {
  draining = true;
  if (activeIngress === 0) return;
  await new Promise((resolve) => idleWaiters.push(resolve));
}

export function intakeIngressState() {
  return { draining, active: activeIngress };
}

export function _resetIntakeGateForTest() {
  draining = false;
}

export async function spoolHealth() {
  const { dir, quotaBytes } = spoolConfig();
  try {
    await ensureSpoolDir();
    await access(dir);
    const probe = join(dir, `.ready-${process.pid}-${Date.now()}`);
    await writeFile(probe, "ok", { mode: 0o600 });
    await rm(probe, { force: true });
    const usage = await spoolUsage();
    return { ok: true, writable: true, used_bytes: usage.usedBytes, quota_bytes: quotaBytes };
  } catch {
    return { ok: false, writable: false, used_bytes: null, quota_bytes: quotaBytes };
  }
}

export async function sweepSpoolTtl(now = Date.now()) {
  const { dir, ttlMs } = spoolConfig();
  await ensureSpoolDir();
  let removed = 0;
  for (const name of await readdir(dir)) {
    if (!/^intake-[0-9a-f-]{36}\.(?:bin|json)$/i.test(name)) continue;
    const path = join(dir, name);
    try {
      const s = await stat(path);
      if (now - s.mtimeMs > ttlMs) {
        await rm(path, { force: true });
        removed += 1;
      }
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }
  }
  return { spoolRemoved: removed };
}

export { createReadStream };
