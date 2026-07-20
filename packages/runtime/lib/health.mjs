// Readiness aggregation (Slice 4, contract §4.7). /ready is a LOAD-BALANCER gate:
// it FAILS (503) only on conditions where routing traffic here would be wrong —
//
//   * DB unreachable            (nothing works)
//   * world dead                (when CLARA_START_WORLD=1 — no engine to run turns)
//   * control listener dead     (parked clarifies would never resume)
//   * taxonomy HALT             (the relay cannot route — an un-routable state)
//
// A dead relay LEADER is handled by the supervisor's fail-fast (S4-ND5), not here.
// Relay lag / dead-letters / backlog are WARNINGS only (degraded, still serving) —
// surfaced from clara.relay_health(). Everything is bounded + sanitized: /ready must
// never hang and never leak raw DB text.

import { withRuntime } from "./pools.mjs";
import { scannerReachable } from "./scan.mjs";
import { listTaskMetas, spoolHealth } from "./spool.mjs";
import { matcherHealth } from "./matcher.mjs";
import { autodraftHealth } from "./autodraft.mjs";

const READY_DEADLINE_MS = Number(process.env.CLARA_READY_DEADLINE_MS || 5000);
const HEARTBEAT_STALE_MS = Number(process.env.CLARA_HEARTBEAT_STALE_MS || 30000);

function worldEnabled() {
  return process.env.CLARA_START_WORLD === "1";
}

async function intakeReadinessSnapshot() {
  const spool = await spoolHealth();
  const scanner = await scannerReachable();
  const metas = (await listTaskMetas()).filter((row) => row && !row.corrupt);
  let held = metas.filter((row) => row.status === "held_egress").length;
  const queuedMetas = metas.filter((row) => row.status === "queued");
  let queued = queuedMetas.length;
  let oldestQueuedMs = queuedMetas.reduce((age, row) => {
    const at = Date.parse(row.createdAt || row.updatedAt || "");
    return Number.isFinite(at) ? Math.max(age, Date.now() - at) : age;
  }, 0);
  let source = "spool_index";
  try {
    const db = await withRuntime((client) =>
      client.query(
        `select count(*) filter (where status='held_egress')::int as held,
                count(*) filter (where status='queued' and workflow_run_id is null)::int as queued,
                extract(epoch from (now()-min(created_at) filter
                  (where status='queued' and workflow_run_id is null)))*1000 as oldest_queued_ms
           from clara.document_processing_tasks
          where status in ('held_egress','queued')`,
      ),
    );
    held = Number(db.rows[0]?.held ?? 0);
    queued = Number(db.rows[0]?.queued ?? 0);
    oldestQueuedMs = db.rows[0]?.oldest_queued_ms == null ? 0 : Number(db.rows[0].oldest_queued_ms);
    source = "database";
  } catch {
    // Migration 0007 exposes writers but currently no runtime SELECT grant; the
    // durable sidecar index is the bounded fallback until that DB surface exists.
  }
  return { ok: true, spool, scanner, held, queued, oldestQueuedMs, source };
}

/** Run fn with an overall wall-clock deadline; on timeout resolve to `onTimeout`. */
async function bounded(fn, onTimeout) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(onTimeout), READY_DEADLINE_MS);
  });
  try {
    return await Promise.race([fn(), deadline]);
  } catch {
    return onTimeout;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full readiness snapshot. Returns { ready, checks, warnings }.
 * @returns {Promise<{ready:boolean, checks:Record<string,unknown>, warnings:string[]}>}
 */
export async function checkReadiness() {
  const checks = {};
  const warnings = [];

  // Single bounded round-trip: DB reachability + (when enabled) heartbeats,
  // taxonomy pointer, and relay_health warnings — all as clara_runtime.
  const result = await bounded(
    () =>
      withRuntime(async (c) => {
        // DB reachable (this query returning at all proves it).
        checks.db = { ok: true };

        if (worldEnabled()) {
          const hb = await c.query(
            `select component, extract(epoch from (now() - beat_at)) * 1000 as age_ms
               from clara.runtime_heartbeats
              where component = any($1)`,
            [["world", "control"]],
          );
          const ageOf = (name) => {
            const row = hb.rows.find((r) => r.component === name);
            return row ? Number(row.age_ms) : Infinity;
          };
          const worldAge = ageOf("world");
          const controlAge = ageOf("control");
          checks.world = { ok: worldAge <= HEARTBEAT_STALE_MS, age_ms: Number.isFinite(worldAge) ? Math.round(worldAge) : null };
          checks.control = {
            ok: controlAge <= HEARTBEAT_STALE_MS,
            age_ms: Number.isFinite(controlAge) ? Math.round(controlAge) : null,
          };

          // Taxonomy HALT — a missing active pointer means the relay cannot route.
          const tax = await c.query("select count(*)::int as n from clara.taxonomy_active");
          checks.taxonomy = { ok: Number(tax.rows[0]?.n ?? 0) > 0 };

          // Relay health -> warnings only (degraded, still serving). Keys per 0006
          // relay_health(): pending_intents, held_outbox, pending_dead_letters.
          try {
            const rh = await c.query("select clara.relay_health() as h");
            const h = rh.rows[0]?.h ?? {};
            checks.relay = { ok: true, ...(typeof h === "object" ? h : {}) };
            const dead = Number(h.pending_dead_letters ?? 0);
            const backlog = Number(h.pending_intents ?? 0) + Number(h.held_outbox ?? 0);
            if (dead > 0) warnings.push(`${dead} pending dead-letter(s)`);
            if (backlog > 1000) warnings.push(`relay backlog ${backlog} (intents+outbox)`);
          } catch (err) {
            warnings.push(`relay_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
          }

          // Matcher consumer health -> warnings only (§4.4: a stalled matcher
          // must never take chat traffic down).
          try {
            const mh = await matcherHealth(c);
            checks.matcher = { ok: true, ...mh };
            const mDead = Number(mh.pendingDeadLetters ?? mh.pending_dead_letters ?? 0);
            const mLag = Number(mh.lag ?? 0);
            if (mDead > 0) warnings.push(`${mDead} matcher dead-letter(s)`);
            if (mLag > 1000) warnings.push(`matcher lag ${mLag}`);
          } catch (err) {
            warnings.push(`matcher_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
          }

          // Autodraft consumer health -> warnings only (§3 / WA-L6: a stalled or dead sweep
          // consumer must never take chat traffic down — it surfaces as a staleness badge).
          try {
            const ah = await autodraftHealth(c);
            checks.autodraft = { ok: true, ...ah };
            const aDead = Number(ah.pendingDeadLetters ?? ah.pending_dead_letters ?? 0);
            const aLag = Number(ah.lag ?? 0);
            if (aDead > 0) warnings.push(`${aDead} autodraft dead-letter(s)`);
            if (aLag > 1000) warnings.push(`autodraft lag ${aLag}`);
          } catch (err) {
            warnings.push(`autodraft_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
          }
        } else {
          checks.world = { enabled: false };
        }
        return { ok: true };
      }),
    { ok: false, timeout: true },
  );

  const intake = await bounded(intakeReadinessSnapshot, { ok: false, timeout: true });
  checks.intake = intake.ok
    ? {
        spool: intake.spool,
        scanner: intake.scanner,
        held_egress: intake.held,
        queued_unbound: intake.queued,
        oldest_queued_ms: Math.round(intake.oldestQueuedMs),
        source: intake.source,
      }
    : { ok: false, error: "intake_check_timeout" };
  if (!intake.ok) warnings.push("intake readiness check unavailable");
  else {
    if (!intake.spool.ok) warnings.push("intake spool is not writable");
    else if (intake.spool.used_bytes / intake.spool.quota_bytes >= 0.9) warnings.push("intake spool is at least 90% full");
    if (!intake.scanner.ok) warnings.push("intake malware scanner is unreachable");
    if (intake.held > 0) warnings.push(`${intake.held} document task(s) held for egress approval`);
    const queueWarnMs = Number(process.env.CLARA_DOCUMENT_QUEUE_WARN_MS || 60000);
    if (intake.oldestQueuedMs > queueWarnMs) warnings.push(`oldest unbound document task age ${Math.round(intake.oldestQueuedMs)}ms`);
  }

  if (!result || result.ok !== true) {
    // DB unreachable or the whole check timed out.
    checks.db = { ok: false, error: result?.timeout ? "db_timeout" : "db_unreachable" };
    return { ready: false, checks, warnings };
  }

  const failed =
    checks.db?.ok === false ||
    (worldEnabled() && (checks.world?.ok === false || checks.control?.ok === false || checks.taxonomy?.ok === false));

  return { ready: !failed, checks, warnings };
}
