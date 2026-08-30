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
// budget on a cache miss. So storageProbeHealth() is SYNCHRONOUS: it returns the last
// verdict health.mjs uses for its two-failure hard gate, without doing I/O in the request.
// It returns from memory, ~0ms, every time. A background setInterval (started eagerly by
// src/index.ts at boot, unref'd so it never keeps the process alive on its own) refreshes that verdict at
// most once every CACHE_MS (default 60s — a real outage still surfaces within one interval,
// comfortably inside any on-call's noticing window). Each refresh cycle is still individually
// bounded by TIMEOUT_MS (default 3s). The deadline aborts the actual storage requests; interval
// ownership remains held until the aborted call settles and scratch cleanup completes.
//
// TRANSITIONS ARE LOGGED, STEADY STATE IS NOT. The incident's own observability defect #1 was
// "the runtime logs nothing" — fly logs is the real alarm surface for a single-maintainer
// operation, so a red<->green flip gets a console.error line carrying ONLY the classified
// reason. Collapsing `err.code` is not the redaction boundary: storage.mjs keeps a diagnostic
// HTTP status but drops the response body, and this probe retains no detail field. Raw vendor
// text can echo a credential or URL query, so it is never retained or logged; an
// already-known-red cycle stays silent to avoid spamming that log once a
// minute forever. The public verdict (storageProbeHealth()'s return value, which becomes
// checks.storage_write on the UNAUTHENTICATED /ready response) carries only a classified
// `reason` and consecutive count. See docs/ops/DR.md §7 for the still-open other half of
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
 * production intake uses. Never throws: resolves { ok:true } or { ok:false, reason }.
 * Raw vendor detail is not retained because transition logs must never echo secrets. */
async function runProbeOnce(signal) {
  const { payload, sha256, key } = currentProbe();
  let scratchDir;
  try {
    scratchDir = await mkdtemp(join(tmpdir(), "clara-storage-probe-"));
    const scratchFile = join(scratchDir, "probe.bin");
    await writeFile(scratchFile, payload, { signal });
    await putCanonical(scratchFile, key, "application/octet-stream", { signal });
    await verifyCanonical(key, sha256, { signal });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof StorageError
      ? (err.code === "checksum_mismatch" ? "storage_probe_readback_mismatch" : "storage_error")
      : "storage_probe_error";
    return { ok: false, reason };
  } finally {
    if (scratchDir) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Start one abortable probe cycle. `verdict` resolves at the deadline, while `settled`
 * remains pending until the aborted operation and its finally cleanup have actually ended. */
function startHardTimeout(fn, ms, onTimeout) {
  const controller = new AbortController();
  let timeoutWon = false;
  let timer;
  const operation = Promise.resolve().then(() => fn(controller.signal));
  const verdict = new Promise((resolve) => {
    timer = setTimeout(() => {
      timeoutWon = true;
      controller.abort();
      resolve(onTimeout);
    }, ms);
    timer.unref?.();
    operation.then(
      (value) => {
        if (timeoutWon) return;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (timeoutWon) return;
        clearTimeout(timer);
        resolve({ ok: false, reason: "storage_probe_error" });
      },
    );
  });
  const settled = operation.then(
    () => undefined,
    () => undefined,
  ).finally(() => clearTimeout(timer));
  return { controller, verdict, settled };
}

/** Test-only: run exactly one bounded round trip, bypassing the cache/interval machinery so
 * the correctness arms (success/failure/timeout/mismatch) can assert deterministically instead
 * of racing a background interval. */
export async function _probeStorageOnceForTest() {
  const cycle = startHardTimeout(runProbeOnce, timeoutMs(), { ok: false, reason: "storage_probe_timeout" });
  const verdict = await cycle.verdict;
  await cycle.settled;
  return verdict;
}

// Fail closed until the first successful write/readback establishes positive evidence. The
// two-consecutive-failure tolerance begins only in that warm, previously-proven state.
let cachedResult = { ok: true, reason: null, pending: true, consecutive_failures: 0 };
let intervalHandle = null;
let inFlight = null; // the current/most-recent refresh cycle's promise (test determinism seam)
let activeRefresh = null;
let activeController = null;
let cacheGeneration = 0;

async function refreshOnce(generation) {
  const cycle = startHardTimeout(runProbeOnce, timeoutMs(), { ok: false, reason: "storage_probe_timeout" });
  activeController = cycle.controller;
  try {
    const result = await cycle.verdict;
    if (generation !== cacheGeneration) return;
    const wasOk = cachedResult.ok;
    const wasPending = cachedResult.pending;
    const previousFailures = cachedResult.consecutive_failures;
    const consecutiveFailures = result.ok ? 0 : cachedResult.consecutive_failures + 1;
    cachedResult = {
      ok: result.ok,
      reason: result.ok ? null : (result.reason ?? "storage_probe_error"),
      pending: result.ok ? false : wasPending,
      consecutive_failures: consecutiveFailures,
    };
    if (wasPending && !result.ok && consecutiveFailures === 1) {
      console.error(`[storage-probe] COLD -> RED (${cachedResult.reason})`);
    } else if (wasPending && result.ok && previousFailures > 0) {
      console.error("[storage-probe] RED -> GREEN");
    } else if (!wasPending && wasOk !== result.ok) {
      // Deliberate alarm line — see the header comment ("TRANSITIONS ARE LOGGED...").
      console.error(
        `[storage-probe] ${wasOk ? "GREEN -> RED" : "RED -> GREEN"}` +
          `${result.reason ? ` (${result.reason})` : ""}`,
      );
    }
  } finally {
    await cycle.settled;
    if (activeController === cycle.controller) activeController = null;
  }
}

function startRefresh() {
  if (activeRefresh) return activeRefresh;
  const generation = cacheGeneration;
  const refresh = refreshOnce(generation);
  const tracked = refresh.finally(() => {
    if (activeRefresh === tracked) activeRefresh = null;
  });
  activeRefresh = tracked;
  return tracked;
}

/** Start the background probe eagerly at runtime boot. Safe to call more than once. */
export function startStorageProbe() {
  if (intervalHandle) return;
  inFlight = startRefresh();
  intervalHandle = setInterval(() => {
    inFlight = startRefresh();
  }, cacheMs());
  intervalHandle.unref?.();
}

/**
 * Synchronous — returns the last known verdict instantly, no I/O on the calling path (see the
 * header comment: this is off /ready's latency budget entirely). The boot-started background
 * interval keeps the verdict refreshed at most once per CACHE_MS.
 * @returns {{ok:boolean, reason:string|null, pending:boolean, consecutive_failures:number}}
 */
export function storageProbeHealth() {
  return { ...cachedResult };
}

/** Test-only: full reset (cache + interval + in-flight state) so the next storageProbeHealth()
 * call starts a fresh cycle instead of serving stale state left by an earlier test. */
export function _resetStorageProbeCacheForTest() {
  if (intervalHandle) clearInterval(intervalHandle);
  activeController?.abort();
  cacheGeneration += 1;
  intervalHandle = null;
  inFlight = null;
  activeRefresh = null;
  activeController = null;
  cachedResult = { ok: true, reason: null, pending: true, consecutive_failures: 0 };
}

/** Test-only: await the most recently started (or currently in-flight) background refresh
 * cycle — starts the loop if it hasn't been started yet — so a test can assert on a SETTLED
 * verdict instead of racing the interval. */
export async function _waitForStorageProbeSettleForTest() {
  startStorageProbe();
  await inFlight;
  return { ...cachedResult };
}

/** Test-only: force one additional sequential refresh without waiting for the interval. */
export async function _refreshStorageProbeForTest() {
  inFlight = startRefresh();
  await inFlight;
  return { ...cachedResult };
}
