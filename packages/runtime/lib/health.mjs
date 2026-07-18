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

const READY_DEADLINE_MS = Number(process.env.CLARA_READY_DEADLINE_MS || 5000);
const HEARTBEAT_STALE_MS = Number(process.env.CLARA_HEARTBEAT_STALE_MS || 30000);

function worldEnabled() {
  return process.env.CLARA_START_WORLD === "1";
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
        } else {
          checks.world = { enabled: false };
        }
        return { ok: true };
      }),
    { ok: false, timeout: true },
  );

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
