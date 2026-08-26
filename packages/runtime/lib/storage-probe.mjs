// /ready storage write probe — R9 (docs/plan/active/harness-audit-rulings-2026-08-26.md),
// follow-up (a) of docs/ops/incident-2026-07-26-intake-storage.md.
//
// THE INCIDENT'S HEADLINE WAS RETRACTED — READ THIS BEFORE TRUSTING ANY "~12h outage" framing
// elsewhere in this repo's history. Intake was never down for new documents; every observed
// failure was a DUPLICATE re-upload (a human re-dropping a file Clara already had), and the
// real bug lived in `putCanonical`'s duplicate-detection branch: Supabase returns a duplicate
// as HTTP 400 wrapping `{"statusCode":"409","error":"Duplicate"}` — the real status is in the
// BODY — and the old code branched on `response.status === 409`, which was therefore never
// true, so every duplicate became a fatal error. The CREATE path (a POST to a fresh key) was
// healthy throughout (incident doc, "WRONG #2"). Two things stay true after the retraction:
// (1) `/ready` never touched storage at all, so a read-only reachability check would have
// stayed green regardless of which bug was real; (2) the duplicate-detection branch is where
// production storage code has actually broken before, and nothing here checked it.
//
// SO THE FIXED-KEY DESIGN IS DELIBERATE, NOT INCIDENTAL. This probe writes to the SAME
// content-addressed key on every cycle (see currentProbe() below). The very first write each
// UTC day is a genuine CREATE; every later cycle that day is a genuine DUPLICATE — the branch
// the real bug lived in. A literal write-fresh-then-delete probe (R9's original wording) would
// use a brand-new key every cycle and so would NEVER exercise the duplicate branch at all — it
// would have stayed green throughout the real incident, for the same reason `/ready` itself
// did: it only ever proves the CREATE path, which was never the problem. A fixed key is the
// stronger check, not a weaker one.
//
// SAME DOOR AS PRODUCTION either way. This calls `putCanonical`/`verifyCanonical` from
// ./storage.mjs UNCHANGED — the exact two functions intake.mjs calls after every real upload
// (`await putCanonical(path, key, mime); await verifyCanonical(key, meta.sha256);`). No
// parallel credential/HTTP logic is written here: a probe through a different door proves the
// wrong thing (the incident's own "WRONG #2" was exactly this mistake — a probe that used PUT,
// the verb the runtime never calls, and mis-measured a privilege gap that was never on the
// runtime's own path).
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
// tests/storage-probe.test.mjs pins the derivation above against that LIVE regex (parsed out
// of the deploy artifact, never retyped) rather than trusting this comment's own paraphrase.
//
// STILL NO DELETE, ON PURPOSE. storage-provision.sql says so explicitly: "Routine custody is
// content-addressed, write-once, read-back verified, and delete-never." DELETE is deliberately
// WITHHELD from the storage role in production — confirmed live (`delete storage.objects`
// raises 42501 permission denied, packages/db/deploy/wave-b-storage-update-amendment.sql) —
// because nothing in the write path ever needs it. A literal delete call here would either
// (a) always fail in production, permanently marking this check not-ok for a capability the
// app never exercises, which is a false alarm, not a finding; or (b) require widening that
// security boundary just to satisfy a health check — forbidden by AGENTS.md constraint 14
// ("the product's security mechanisms are... NEVER weakened or bypassed for testing
// convenience"). The daily-rotating fixed key (above) is what makes this a non-issue: nothing
// needs cleaning up, because the object IS the fixture — ~365 tiny permanent objects/year,
// content-addressed, covered by the existing daily R2 mirror for free.
//
// OFF /READY'S LATENCY BUDGET ENTIRELY, NOT MERELY BOUNDED WITHIN IT. fly.toml polls /ready
// every 15s with a 5s TOTAL timeout, and health.mjs's own DB and intake checks are each
// SEQUENTIALLY bounded (up to READY_DEADLINE_MS) against that same 5s — so a THIRD sequential
// network round trip here, even bounded to a "few seconds", could eat most of the remaining
// budget on a cache miss for a value that cannot change /ready's status code (this check is
// WARN-only; see health.mjs). So storageProbeHealth() is SYNCHRONOUS: it returns the last
// known verdict from memory, ~0ms, every time. A background setInterval (started lazily on
// first use, unref'd so it never keeps the process alive on its own) refreshes that verdict at
// most once every CACHE_MS (default 60s — a real outage still surfaces within one interval,
// comfortably inside any on-call's noticing window). Each refresh cycle is still individually
// bounded by TIMEOUT_MS (default 3s) so a hung storage call can never wedge the interval loop
// itself, even though it can no longer hang /ready either way.
//
// TRANSITIONS ARE LOGGED, STEADY STATE IS NOT. The incident's own observability defect #1 was
// "the runtime logs nothing" — fly logs is the real alarm surface for a single-maintainer
// operation, so a red<->green flip gets a console.error line (carrying the vendor-error detail
// for diagnosis); an already-known-red cycle stays silent to avoid spamming that log once a
// minute forever. The public verdict (storageProbeHealth()'s return value, which becomes
// checks.storage on the UNAUTHENTICATED /ready response) never carries that raw detail — only
// a short classified `reason` code. See docs/ops/DR.md:300 for the still-open other half of
// this follow-up: an EXTERNAL uptime check that pages someone on that transition. This file
// only makes the runtime know and log; it does not page anyone.

import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { putCanonical, verifyCanonical, StorageError } from "./storage.mjs";

const PROBE_FIRM_ID = "00000000-0000-4000-8000-000000000000";

function cacheMs() {
  // Floor 1000ms: this value now FEEDS setInterval (not a staleness compare), so 0 would be
  // a sustained storage hot loop from a health check — the old async design's "0 = no cache"
  // meaning no longer exists. Out-of-range values fall back to the 60s default.
  const n = Number(process.env.CLARA_STORAGE_PROBE_CACHE_MS);
  return Number.isFinite(n) && n >= 1000 ? n : 60_000;
}

function timeoutMs() {
  const n = Number(process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 3_000;
}

/** Today's (UTC) probe payload/key — see the header comment for why the date is folded in. */
function currentProbe() {
  const utcDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
  const payload = Buffer.from(`clara-ready-storage-probe-v1:${utcDate}\n`, "utf8");
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const key = `firms/${PROBE_FIRM_ID}/docs/${sha256}.probe`;
  return { payload, sha256, key };
}

/** Test-only: the exact key/sha the live probe would use RIGHT NOW, so a test can pin
 * behaviour (e.g. against the live RLS policy grammar) without retyping the derivation. */
export function _currentProbeForTest() {
  const { key, sha256 } = currentProbe();
  return { firmId: PROBE_FIRM_ID, sha256, key };
}

/** One write -> read-back-verify round trip through the SAME storage.mjs functions
 * production intake uses. Never throws: resolves { ok:true } or { ok:false, reason, detail }.
 * `detail` is for server-side logging ONLY — never forward it into the public verdict. */
async function runProbeOnce() {
  const { payload, sha256, key } = currentProbe();
  let scratchDir;
  try {
    scratchDir = await mkdtemp(join(tmpdir(), "clara-storage-probe-"));
    const scratchFile = join(scratchDir, "probe.bin");
    await writeFile(scratchFile, payload);
    await putCanonical(scratchFile, key, "application/octet-stream");
    await verifyCanonical(key, sha256);
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

/** Race `fn()` against a hard deadline; resolves to `onTimeout` if it doesn't settle in time. */
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

/** Test-only: run exactly one bounded round trip, bypassing the cache/interval machinery so
 * the correctness arms (success/failure/timeout/mismatch) can assert deterministically instead
 * of racing a background interval. */
export async function _probeStorageOnceForTest() {
  return withHardTimeout(runProbeOnce, timeoutMs(), { ok: false, reason: "storage_probe_timeout" });
}

// Optimistic until the first cycle completes: a fresh boot has no evidence of a problem yet,
// this check is WARN-only (never gates readiness), and the window is bounded to one TIMEOUT_MS.
let cachedResult = { ok: true, pending: true };
let intervalHandle = null;
let inFlight = null; // the current/most-recent refresh cycle's promise (test determinism seam)
let busy = false; // never let two probe cycles overlap (a slow cycle + a short CACHE_MS otherwise races)

async function refreshOnce() {
  if (busy) return;
  busy = true;
  try {
    const wasOk = cachedResult.ok;
    const result = await withHardTimeout(runProbeOnce, timeoutMs(), { ok: false, reason: "storage_probe_timeout" });
    cachedResult = { ok: result.ok, reason: result.reason, pending: false };
    if (wasOk !== result.ok) {
      // Deliberate alarm line — see the header comment ("TRANSITIONS ARE LOGGED...").
      console.error(
        `[storage-probe] ${wasOk ? "GREEN -> RED" : "RED -> GREEN"}` +
          `${result.reason ? ` (${result.reason})` : ""}${result.detail ? `: ${result.detail}` : ""}`,
      );
    }
  } finally {
    busy = false;
  }
}

function ensureStarted() {
  if (intervalHandle) return;
  inFlight = refreshOnce();
  intervalHandle = setInterval(() => {
    inFlight = refreshOnce();
  }, cacheMs());
  intervalHandle.unref?.();
}

/**
 * Synchronous — returns the last known verdict instantly, no I/O on the calling path (see the
 * header comment: this is off /ready's latency budget entirely). A background interval,
 * started lazily on first use, keeps the verdict refreshed at most once per CACHE_MS.
 * @returns {{ok:boolean, reason?:string, pending?:boolean}}
 */
export function storageProbeHealth() {
  ensureStarted();
  return { ...cachedResult };
}

/** Test-only: full reset (cache + interval + in-flight state) so the next storageProbeHealth()
 * call starts a fresh cycle instead of serving stale state left by an earlier test. */
export function _resetStorageProbeCacheForTest() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  inFlight = null;
  busy = false;
  cachedResult = { ok: true, pending: true };
}

/** Test-only: await the most recently started (or currently in-flight) background refresh
 * cycle — starts the loop if it hasn't been started yet — so a test can assert on a SETTLED
 * verdict instead of racing the interval. */
export async function _waitForStorageProbeSettleForTest() {
  storageProbeHealth();
  await inFlight;
  return { ...cachedResult };
}
