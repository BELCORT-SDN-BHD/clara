// /ready storage write probe — R9 (docs/plan/active/harness-audit-rulings-2026-08-26.md),
// follow-up (a) of docs/ops/incident-2026-07-26-intake-storage.md: "Add a storage write-probe
// to /ready. This outage reported ready:true for ~12 hours. The probe must exercise the write
// privilege, not just reachability."
//
// SAME DOOR AS PRODUCTION. This calls `putCanonical`/`verifyCanonical` from ./storage.mjs
// UNCHANGED — the exact two functions intake.mjs calls after every real upload
// (`await putCanonical(path, key, mime); await verifyCanonical(key, meta.sha256);`). No parallel
// credential/HTTP logic is written here: a probe through a different door proves the wrong
// thing (the incident itself was a permission gap on THIS door that a reachability-only check
// would never have seen).
//
// THE PROBE KEY IS A RESERVED SENTINEL, NEVER A REAL FIRM. PROBE_FIRM_ID below passes the live
// storage RLS policy's UUID-shape predicate (`^firms/[0-9a-f]{8}-...-[1-5][0-9a-f]{3}-[89ab]...`
// in packages/db/deploy/storage-provision.sql — valid version/variant nibbles) but every other
// nibble is zero, so it can never collide with a real, randomly-generated firm id and reads
// unmistakably as the health-probe object in any listing — never inside a real firm's document
// tree. Reusing the docs key family (rather than a new `health/` prefix) is deliberate: it is
// the ONLY namespace the storage role is actually granted INSERT+SELECT on today, so this is
// the SAME grant/policy pair production intake depends on. A `health/`-prefixed key would need
// its own new RLS policy — a separate, reviewed migration, out of this PR's narrow diff.
//
// THIS ROUND TRIP DOES NOT DELETE, ON PURPOSE. storage-provision.sql says so explicitly:
// "Routine custody is content-addressed, write-once, read-back verified, and delete-never."
// DELETE is deliberately WITHHELD from the storage role in production — confirmed live
// (`delete storage.objects` raises 42501 permission denied, packages/db/deploy/
// wave-b-storage-update-amendment.sql) — because nothing in the write path ever needs it. A
// literal delete call here would either (a) always fail in production, permanently marking
// this check not-ok for a capability the app never exercises, which is a false alarm, not a
// finding; or (b) require widening that security boundary just to satisfy a health check —
// forbidden by AGENTS.md constraint 14 ("the product's security mechanisms are... NEVER
// weakened or bypassed for testing convenience"). Instead the payload and key are FIXED, so a
// repeat write is the same idempotent "already exists" outcome every real upload already
// treats as success (see putCanonical's own 409-handling comment in storage.mjs) — nothing
// accumulates, so there is nothing that needs cleaning up.
//
// CACHED, NOT PER-CALL. fly.toml polls /ready every 15s with a 5s total timeout
// (packages/runtime/fly.toml). A live network round trip to Supabase Storage on every single
// poll is needless load on a third-party service and eats into that 5s budget for no benefit
// once the write path has already proven itself healthy a moment ago — so the verdict is
// cached and only refreshed at most once per CACHE_MS (default 60s: a real outage still
// surfaces within one interval, well inside any on-call's noticing window, while ~3 of every 4
// polls in that window cost nothing but an in-memory read).
//
// NEVER HANGS /READY. The whole probe (temp-file write + upload + read-back) races its own
// hard deadline (TIMEOUT_MS, default 3s — comfortably inside the fly.toml 5s /ready timeout
// even stacked after the DB/intake checks' own bounded() calls in health.mjs). A hang on
// either side times out to not-ok; it never blocks.

import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { putCanonical, verifyCanonical, StorageError } from "./storage.mjs";

const PROBE_FIRM_ID = "00000000-0000-4000-8000-000000000000";
const PROBE_PAYLOAD = Buffer.from("clara-ready-storage-probe-v1\n", "utf8");
const PROBE_SHA256 = createHash("sha256").update(PROBE_PAYLOAD).digest("hex");
const PROBE_KEY = `firms/${PROBE_FIRM_ID}/docs/${PROBE_SHA256}.probe`;

function cacheMs() {
  const n = Number(process.env.CLARA_STORAGE_PROBE_CACHE_MS);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
}

function timeoutMs() {
  const n = Number(process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 3_000;
}

/** One write -> read-back-verify round trip through the SAME storage.mjs functions
 * production intake uses. Never throws: resolves { ok:true } or { ok:false, reason, detail }. */
async function runProbeOnce() {
  let scratchDir;
  try {
    scratchDir = await mkdtemp(join(tmpdir(), "clara-storage-probe-"));
    const scratchFile = join(scratchDir, "probe.bin");
    await writeFile(scratchFile, PROBE_PAYLOAD);
    await putCanonical(scratchFile, PROBE_KEY, "application/octet-stream");
    await verifyCanonical(PROBE_KEY, PROBE_SHA256);
    return { ok: true };
  } catch (err) {
    const reason = err instanceof StorageError
      ? (err.code === "checksum_mismatch" ? "storage_probe_readback_mismatch" : err.code)
      : "storage_probe_error";
    return { ok: false, reason, detail: String(err?.message ?? err).slice(0, 120) };
  } finally {
    if (scratchDir) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Race `fn()` against a hard deadline; resolves to `onTimeout` if it doesn't settle in time.
 * Mirrors health.mjs's own bounded() — duplicated locally (a few lines) rather than imported,
 * to avoid a health.mjs <-> storage-probe.mjs import cycle. */
function withHardTimeout(fn, ms, onTimeout) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(onTimeout);
    }, ms);
    timer.unref?.();
    fn().then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(onTimeout);
      },
    );
  });
}

let cachedAt = 0;
let cachedResult = null;

/**
 * @returns {Promise<{ok:boolean, reason?:string, detail?:string, cached?:boolean}>}
 */
export async function storageProbeHealth() {
  const now = Date.now();
  if (cachedResult && now - cachedAt < cacheMs()) return { ...cachedResult, cached: true };
  const result = await withHardTimeout(runProbeOnce, timeoutMs(), { ok: false, reason: "storage_probe_timeout" });
  cachedAt = Date.now();
  cachedResult = result;
  return { ...result, cached: false };
}

/** Test-only: force the next storageProbeHealth() call to re-probe instead of serving the
 * cached verdict. */
export function _resetStorageProbeCacheForTest() {
  cachedAt = 0;
  cachedResult = null;
}
