import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, open, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";

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

/** The Windows locking codes a `rename()` over a destination ANOTHER HANDLE HOLDS OPEN raises. */
const RENAME_CONTENDED = new Set(["EPERM", "EACCES", "EBUSY"]);
/**
 * How long `renameIntoPlace` may keep retrying before it surfaces the failure.
 *
 * 250 ms, not the 2000 ms this shipped with in its first cut (#966, fix round 1). The deadline is
 * a budget for a CONTENDED window, and the contention this exists for is a reader's handle, which
 * lives for microseconds — 250 ms is already a thousand times that. What the deadline also buys is
 * the cost of a handle that is never released (a stuck indexer or AV scan): every intake status
 * transition goes through `atomicJson`, so a stuck handle costs the FULL deadline once per
 * transition per intake, on the intake path, across a hundred-child batch. Measured on this rig at
 * two seconds: `EPERM after 2003 ms`. The failure is the same either way; only the stall differs,
 * and `tests/intake-sidecar-race.test.mjs`'s `p966.giveup` pins it. `CLARA_SPOOL_RENAME_RETRY_MS`
 * remains the knob for an operator who knows their host holds files for longer.
 */
const RENAME_RETRY_MS = Math.max(0, Number(process.env.CLARA_SPOOL_RENAME_RETRY_MS || 250));

/**
 * `rename(from, to)` THAT A CONCURRENT READ CANNOT FAIL (#966).
 *
 * THE PROPERTY, MEASURED ON THE RIG, NOT ASSUMED: on Windows a `rename()` whose DESTINATION is
 * held open by another handle fails `EPERM`, and `fs.open(path,'r')` — what a sidecar read takes —
 * is exactly such a handle. Against a tight reader loop, 414 of 500 bare renames failed. The
 * reconciler's intake-recovery belt opened every pending sidecar on every ~2 s sweep, so a live
 * intake's own status write landed in that window often enough to be MEASURED: one child in six at
 * the default cadence (`tests/intake-batch-e2e.mjs`'s header), surfacing as a 500 on the byte PUT
 * and an intake failed with an untyped `internal`.
 *
 * The belt's half of the fix (skip from directory metadata, open at most ten) shrinks the window;
 * this closes it. A reader's handle lives for microseconds, so a bounded retry converts a hard
 * failure into a sub-millisecond wait. It is the shape `graceful-fs` has shipped for a decade
 * (`node_modules/graceful-fs/polyfills.js`: "Windows. On some operations `EPERM` and `EACCESS` are
 * thrown", retried against a deadline) — restated here rather than depended on, because this
 * package takes no dependency for six lines and the deadline belongs to the caller's latency
 * budget, not to a library's.
 *
 * NOT A SILENT SWALLOW: past the deadline the original error is thrown, unchanged, and the caller
 * waits no longer than the deadline for that answer (`p966.giveup`). And ONLY the three contention
 * codes retry — `ENOENT`, `ENOSPC` and every other failure surface immediately.
 */
async function renameIntoPlace(from, to) {
  const deadline = Date.now() + RENAME_RETRY_MS;
  let delay = 1;
  for (;;) {
    try {
      return await rename(from, to);
    } catch (err) {
      if (!RENAME_CONTENDED.has(err?.code) || Date.now() >= deadline) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 50);
    }
  }
}

/**
 * THE TEMP FILE IS THIS CALL'S ALONE (#1043).
 *
 * It used to be named `${path}.${pid}.${Date.now()}.tmp`, whose only per-call component is a
 * MILLISECOND — so two writers of the SAME sidecar inside ONE process computed the SAME temp path
 * whenever they landed in the same millisecond, and "atomic" stopped being true for both of them:
 * they `writeFile` into one inode and each `rename` it away. The loser's rename finds nothing to
 * move and throws `ENOENT` (which `renameIntoPlace` deliberately does not retry), and — far more
 * often — the two writes interleave so the body the WINNER renames into place is a splice of both.
 * A spliced `intake-<id>.json` reads back as "not found" for a live capability
 * (`intake.mjs`'s `requireCapability` catches the parse error to `null`); a spliced
 * `task-<id>.json` hard-fails `documentIngest_v2`.
 *
 * TWO SUCH WRITERS EXIST ON THE ORDINARY INTAKE PATH, and one of them is a belt, so this is not a
 * corner: `intake.mjs`'s `finalizeDocumentIntake` writes the full transport sidecar for the task
 * `clara.finalize_document_intake` just minted, while `reconciler-documents.mjs`'s
 * `documentTaskIndex` merges EVERY `clara.document_processing_tasks` row onto its own sidecar on
 * every sweep — and that row is committed before the intake path's own write runs. MEASURED on the
 * rig at 300 rounds of the two shapes: 6 ENOENT rejections and 116 unparseable sidecars; CI job
 * 107339673336 is the same defect in the wild (#1043).
 *
 * `randomUUID()` is the same per-call uniqueness `intake.mjs`'s `taskTempPath` already uses for the
 * spool's other temp file, so the two temp shapes agree. The pid stays because it is what tells a
 * human reading a spool directory whose leftover a temp file is. Both still end in `.tmp`, so
 * `SPOOL_REAPABLE` and `listJsonEntries` ignore them exactly as before.
 */
async function atomicJson(path, value) {
  await ensureSpoolDir();
  const next = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(next, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    await renameIntoPlace(next, path);
  } catch (err) {
    // The temp file is ours and nobody else will ever collect it. Leaving it behind would turn a
    // transient write failure into unbounded spool growth (and a `.tmp` the TTL sweep ignores).
    await rm(next, { force: true }).catch(() => {});
    throw err;
  }
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

/**
 * Read-merge-write ONE task sidecar, patching in `patch` over whatever is CURRENTLY on
 * disk (read immediately before writing, not from an earlier snapshot). LENIENT by
 * default: a missing sidecar merges onto `{}` rather than throwing — safe for a caller
 * (the reconciler) that may legitimately encounter a task with no sidecar yet. Pass
 * `{requireExists:true}` for a caller whose contract is "this task's sidecar already
 * exists, or something is badly wrong" (a claim note; a documentIngest failure note) —
 * see `noteTransientFailure`/`noteTerminalFailure`'s own header for why that mode is
 * NOT optional for them (Q1: `invoiceFacts_v1` is sidecar-free BY DESIGN, and a lenient
 * merge there would silently CREATE a phantom sidecar file for a workflow that is
 * supposed to never have one).
 *
 * THE RACE THIS NARROWS (documentIngest task #28, P4): a caller that reads ALL sidecars
 * up front and writes them back ONE AT A TIME later (a bulk snapshot) can write a STALE
 * merge over a field a DIFFERENT process updated in between — e.g. the reconciler's
 * batch read racing a task's own `noteTransientFailure`/`noteTerminalFailure` call,
 * silently erasing `lastError`. Reading fresh, right before the write, shrinks that
 * window from "however long the caller's batch loop takes" to "the time between this
 * one read and this one write" — the SAME granularity every other sidecar mutator in
 * this file already uses. It does NOT eliminate the race: a write landing in that exact
 * gap still loses. A hard guarantee needs real locking or a version/mtime compare-and-
 * swap, which is a larger change and out of scope here — recorded, not silently claimed.
 */
export async function mergeTaskMeta(id, patch, { requireExists = false } = {}) {
  const current = await readTaskMeta(id);
  if (requireExists && !current) {
    throw Object.assign(new Error(`document task ${id} has no durable runtime metadata`), { code: "internal" });
  }
  const next = { ...(current ?? {}), ...patch, updatedAt: new Date().toISOString() };
  await writeTaskMeta(id, next);
  return next;
}

/**
 * The task genuinely IS still 'running' in Postgres for every EXISTING call site
 * (documentIngest task #28: a transient/retryable failure never persists 'failed' — see
 * documentIngest.behavior_v2.mjs's own header) — so `status` defaults to `"running"`,
 * preserving every 2/3-arg call exactly (the v1 alias below, the RETRYABLE branch, and
 * Q4's "DB plane genuinely unknown" branch all still say "running", unchanged).
 *
 * R1 residual (the R-round's closing finding): `documentIngest.behavior_v2.mjs`'s
 * "verified state is neither 'failed' nor 'done'" branch (R1(c)) can have ACTUALLY
 * CONFIRMED a concrete, non-"running" status (e.g. 'queued', 'held_egress') via its own
 * re-read — stamping "running" there regardless would falsify the one field this
 * function exists to keep honest, in the exact branch whose whole point is honesty about
 * unverified state. That caller passes the VERIFIED status as this 4th argument instead
 * of relying on the default.
 *
 * `requireExists:true` — Q1: `intake.mjs`'s `makeDocumentServices()` aliases the OLD
 * `noteTaskFailure` name to THIS function, for `invoiceFacts.v1.behavior.mjs`'s own
 * (frozen, deployed) fallback call. That lane is deliberately sidecar-free (PIN-AB-6 —
 * its own header: "RECEIPT-DRIVEN... never a spool sidecar"), and its OLD updater threw
 * on a missing sidecar rather than creating one. A lenient merge here would silently
 * CREATE a phantom `task-<id>.json` for a workflow that structurally never has one —
 * this mode reproduces the throw-and-create-nothing behaviour exactly, so the alias is
 * truly v1-identical, not merely same-shaped.
 */
export async function noteTransientFailure(taskId, code, note, status = "running") {
  return mergeTaskMeta(taskId, { status, lastError: code, ...(note ? { lastErrorNote: note } : {}) }, { requireExists: true });
}

/**
 * The task genuinely IS 'failed' in Postgres — a terminal failure (or a transient one
 * that exhausted its retry budget) that DID persist 'failed'. `note` is optional
 * diagnostic text for the cases the DB write itself could not be trusted at face value
 * (a persist call that raised instead of committing, or a crash-redelivery replaying
 * the SAME terminal branch under a different code — see documentIngest.behavior_v2.mjs)
 * — recorded here rather than swallowed, so a human reading the sidecar sees BOTH "why
 * did this fail" and "did Postgres even hear about it", never just a discarded
 * exception. `requireExists:true` for the same reason as `noteTransientFailure` above.
 */
export async function noteTerminalFailure(taskId, code, note) {
  return mergeTaskMeta(taskId, { status: "failed", lastError: code, ...(note ? { lastErrorNote: note } : {}) }, { requireExists: true });
}

/** Parse ONE sidecar. `null` when it is gone (a sweep racing a `removeIntakeSpool` is not an
 *  event), the `{corrupt, file}` marker on anything else — the contract `listJson` has always had.
 *  THE HANDLE LIVES ONLY INSIDE THIS FUNCTION, and on Windows it is what a concurrent rename over
 *  the same path collides with; every caller should decide whether to call it BEFORE calling it. */
async function readJsonAt(path, name) {
  try {
    const fh = await open(path, "r");
    try {
      return JSON.parse(await fh.readFile("utf8"));
    } finally {
      await fh.close();
    }
  } catch (err) {
    return err?.code === "ENOENT" ? null : { corrupt: true, file: name };
  }
}

/**
 * THE SPOOL'S SIDECARS AS DIRECTORY METADATA — nothing is opened (#966).
 *
 * Each entry carries the file's `mtimeMs` and a LAZY `read()`. That shape exists so a caller can
 * decide what to skip before taking a handle: `stat()` does not hold one a Windows `rename()` can
 * block (measured in `tests/intake-sidecar-race.test.mjs`), while `open()` does. The recovery belt
 * reads at most the ten sidecars it can act on, and never one a live upload is mid-write on.
 *
 * `mtimeMs` is the honest recency signal here, more so than the sidecar's own `updatedAt` field:
 * every status transition goes through `atomicJson`, so the file's mtime moves with the field —
 * and the RACE is a property of the file, not of anything inside it. A file whose metadata cannot
 * be read is handed back with `mtimeMs: 0`, i.e. never "recently written", so it is never skipped
 * on the strength of a read that did not land.
 *
 * @returns {Promise<Array<{name:string, path:string, mtimeMs:number, read:() => Promise<any>}>>}
 */
async function listJsonEntries(prefix) {
  const dir = await ensureSpoolDir();
  const entries = [];
  for (const name of await readdir(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith(".json")) continue;
    const path = join(dir, name);
    let mtimeMs = 0;
    try {
      const info = await stat(path);
      if (!info.isFile()) continue;
      mtimeMs = info.mtimeMs;
    } catch (err) {
      if (err?.code === "ENOENT") continue; // collected between the readdir and the stat
    }
    entries.push({ name, path, mtimeMs, read: () => readJsonAt(path, name) });
  }
  return entries;
}

/** Every sidecar, PARSED — the eager shape, expressed over the lazy one so the two can never
 *  drift. A caller that can skip work should take the entries instead. */
async function listJson(prefix) {
  const rows = [];
  for (const entry of await listJsonEntries(prefix)) {
    const row = await entry.read();
    if (row !== null) rows.push(row);
  }
  return rows;
}

export const listIntakeMetaEntries = () => listJsonEntries("intake-");
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

/**
 * Which files in the spool this reaper owns.
 *
 * It used to demand a uuid (`intake-[0-9a-f-]{36}`), which meant the ONE shape nothing else can
 * clean up — an intake file whose name is not a uuid, i.e. a foreign or malformed file no
 * `removeIntakeSpool(id)` will ever be called for — was the one shape it left behind forever
 * (#966, fix round 1: such a file also costs the recovery belt a read on every sweep). Nothing
 * legitimate loses by the wider match: every path this package writes comes from `intakePaths()`,
 * which enforces the uuid itself, and `atomicJson`'s temp files end in `.tmp` and are still not
 * matched — they are removed by the writer that made them.
 */
const SPOOL_REAPABLE = /^intake-.+\.(?:bin|json)$/i;

export async function sweepSpoolTtl(now = Date.now()) {
  const { dir, ttlMs } = spoolConfig();
  await ensureSpoolDir();
  let removed = 0;
  for (const name of await readdir(dir)) {
    if (!SPOOL_REAPABLE.test(name)) continue;
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
