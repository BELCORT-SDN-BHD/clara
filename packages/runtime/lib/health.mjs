// Readiness aggregation (Slice 4, contract §4.7). /ready is a LOAD-BALANCER gate:
// it FAILS (503) only on conditions where routing traffic here would be wrong —
//
//   * DB unreachable            (nothing works)
//   * world dead                (when CLARA_START_WORLD=1 — no engine to run turns)
//   * control listener dead     (parked clarifies would never resume)
//   * taxonomy HALT             (the relay cannot route — an un-routable state)
//   * storage cold/unknown or red twice after proof (uploads cannot enter canonical custody)
//
// A dead relay LEADER is handled by the supervisor's fail-fast (S4-ND5), not here.
// Relay lag / dead-letters / backlog are WARNINGS only (degraded, still serving) —
// surfaced from clara.relay_health(). The storage write probe (R9, below) tolerates one
// warm-state transient failure, hard-fails cold/unknown or on the second consecutive warm
// failure, and recovers on success. Everything is bounded + sanitized: /ready must never hang
// or leak secrets.

import { withRuntime } from "./pools.mjs";
import { scannerReachable } from "./scan.mjs";
import { listTaskMetas, spoolHealth } from "./spool.mjs";
import { matcherHealth } from "./matcher.mjs";
import { autodraftHealth } from "./autodraft.mjs";
import { wakeEngineHealth } from "./wake-engine.mjs";
import { localFactsHealth } from "./local-facts.mjs";
import { sstWatchHealth } from "./sst-watch.mjs";
import { factsGateHealth } from "./facts-gate.mjs";
import { classifyHealth } from "./classify.mjs";
import { wikiProjectionHealth } from "./wiki-projection-ops.mjs";
import { storageProbeHealth } from "./storage-probe.mjs";
import { readinessHasHardFailure } from "./readiness-policy.mjs";

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
            const aDeferred = Number(ah.deferredWithdrawals ?? 0);
            if (aDead > 0) warnings.push(`${aDead} autodraft dead-letter(s)`);
            if (aLag > 1000) warnings.push(`autodraft lag ${aLag}`);
            if (aDeferred > 0) warnings.push(`${aDeferred} deferred withdrawal(s) awaiting owner-task settle`);
          } catch (err) {
            warnings.push(`autodraft_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
          }

          // wake-engine consumer health -> warnings only (Gate G1 design §6's own RED-first cell:
          // "an engine death that does not show up in /ready as a WARN within one poll interval
          // is a defect" — this wiring IS that assertion's positive half, mirroring autodraft's
          // own warn-only law: a stalled wake engine must never take chat traffic down).
          try {
            const weh = await wakeEngineHealth(c);
            checks.wakeEngine = { ok: true, ...weh };
            const weDead = Number(weh.pendingDeadLetters ?? 0);
            const weLag = Number(weh.lag ?? 0);
            const weHeld = Number(weh.heldForDisabledSource ?? 0);
            const weCancelStuck = Number(weh.cancelRequestedStuck ?? 0);
            // round-8 (SHOULD D, native adversarial leg) — wakeEngineHealth computed this counter
            // (round-7's own defense-in-depth for the checkpoint-durability hole family) but
            // nothing surfaced it: every sibling signal above gets a WARN line, this one alone sat
            // inert, so its own docstring's "surfaces on /ready" claim was false as shipped —
            // wired the same way the four siblings already are, so a FUTURE hole of this exact
            // shape is loud on /ready instead of silent, which is the entire reason the counter
            // exists in the first place.
            const weBelowCp = Number(weh.heldBelowCheckpoint ?? 0);
            if (weDead > 0) warnings.push(`${weDead} wake-engine dead-letter(s)`);
            if (weLag > 1000) warnings.push(`wake-engine lag ${weLag}`);
            if (weHeld > 0) warnings.push(`${weHeld} held/queued wake-engine row(s) awaiting a disabled/unregistered source`);
            // NOTE-b (opus, round-4 review): surface an accumulating cancel_requested stall the
            // same way every other wake-engine signal above is surfaced — a WARN, not silence.
            if (weCancelStuck > 0) warnings.push(`${weCancelStuck} wake-engine row(s) stuck in cancel_requested`);
            if (weBelowCp > 0) warnings.push(`${weBelowCp} held wake-engine row(s) sitting AT OR BELOW their firm's own checkpoint (stranded — never re-scanned)`);
          } catch (err) {
            warnings.push(`wake_engine_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
          }

          // local_facts consumer health -> warnings only (Wave A2): a stalled MyInvois
          // facts consumer must never take chat traffic down (the matcher/autodraft law).
          try {
            const lh = await localFactsHealth(c);
            checks.localFacts = { ok: true, ...lh };
            const queueWarnMs = Number(process.env.CLARA_DOCUMENT_QUEUE_WARN_MS || 60000);
            if (Number(lh.oldestQueuedMs ?? 0) > queueWarnMs) warnings.push(`local_facts oldest queued ${Math.round(Number(lh.oldestQueuedMs))}ms`);
          } catch (err) {
            warnings.push(`local_facts_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
          }

          // rule-post consumer health check RETIRED with the loop itself — F-A2 PR-3
          // drops clara.execute_rule_post and the rules-execution tier whole.

          // sst_watch consumer health -> warnings only (Wave A2.1): a stalled SST compliance
          // watch must never take chat traffic down. Queries pre-0016-safe spine tables only.
          try {
            const sh = await sstWatchHealth(c);
            checks.sstWatch = { ok: true, ...sh };
            const sDead = Number(sh.pendingDeadLetters ?? sh.pending_dead_letters ?? 0);
            const sLag = Number(sh.lag ?? 0);
            if (sDead > 0) warnings.push(`${sDead} sst_watch dead-letter(s)`);
            if (sLag > 1000) warnings.push(`sst_watch lag ${sLag}`);
          } catch (err) {
            warnings.push(`sst_watch_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
          }

          // facts_gate consumer health -> warnings only (Wave A2.1): a stalled classifier→facts
          // gate must never take chat traffic down. Queries pre-0016-safe spine tables only.
          try {
            const fh = await factsGateHealth(c);
            checks.factsGate = { ok: true, ...fh };
            const fDead = Number(fh.pendingDeadLetters ?? fh.pending_dead_letters ?? 0);
            const fLag = Number(fh.lag ?? 0);
            if (fDead > 0) warnings.push(`${fDead} facts_gate dead-letter(s)`);
            if (fLag > 1000) warnings.push(`facts_gate lag ${fLag}`);
          } catch (err) {
            warnings.push(`facts_gate_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
          }

          // classify consumer health -> warnings only (Wave A2.1): a stalled doc classifier must
          // never take chat traffic down. document_processing_tasks is 0009-era (pre-0016-safe).
          try {
            const ch = await classifyHealth(c);
            checks.classify = { ok: true, ...ch };
            const queueWarnMs = Number(process.env.CLARA_DOCUMENT_QUEUE_WARN_MS || 60000);
            if (Number(ch.oldestQueuedMs ?? 0) > queueWarnMs) warnings.push(`classify oldest queued ${Math.round(Number(ch.oldestQueuedMs))}ms`);
            // A task stuck 'running' past the stranded threshold is the poison-loop signature —
            // invisible to the queued-only signal above, because a looping task is 'running' for
            // all but a moment of each stranded cycle. Same finite guard as the worker's own
            // knob, so junk env can never disable the warn.
            const strandedEnv = Number(process.env.CLARA_CLASSIFY_STRANDED_MS);
            const strandedMs = Number.isFinite(strandedEnv) && strandedEnv > 0 ? strandedEnv : 10 * 60000;
            if (Number(ch.oldestRunningMs ?? 0) > strandedMs)
              warnings.push(`classify oldest running ${Math.round(Number(ch.oldestRunningMs))}ms (stranded/looping?)`);
            const maxAttempts = Number(ch.maxAttemptCount ?? 0);
            if (maxAttempts >= 3) warnings.push(`classify max attempt_count ${maxAttempts}`);
          } catch (err) {
            warnings.push(`classify_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
          }

          // wiki_projection consumer health -> warnings ONLY (Wave B): a stalled wiki projection
          // must never take chat traffic down, and /ready NEVER gates on wiki freshness (WB-R3 —
          // projection lag is surfaced in the pack; books_version stays the authoritative token).
          // Queries pre-0017-safe spine tables only, so it is safe before 0017 is applied.
          try {
            const wh = await wikiProjectionHealth(c);
            checks.wikiProjection = { ok: true, ...wh };
            const wDead = Number(wh.pendingDeadLetters ?? wh.pending_dead_letters ?? 0);
            const wLag = Number(wh.lag ?? 0);
            if (wDead > 0) warnings.push(`${wDead} wiki_projection dead-letter(s)`);
            if (wLag > 1000) warnings.push(`wiki_projection lag ${wLag}`);
            // F3: a runtime misconfiguration is a distinct, louder signal than an ordinary
            // dead-letter — the projection is stalled until the deployment is fixed.
            if (wh.configurationBlocked) warnings.push("wiki_projection BLOCKED on a runtime misconfiguration");
          } catch (err) {
            warnings.push(`wiki_projection_health unavailable: ${String(err?.message ?? err).slice(0, 80)}`);
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

  // Storage write probe (R9, docs/plan/active/harness-audit-rulings-2026-08-26.md — the
  // MEASUREMENT half of follow-up (a) of docs/ops/incident-2026-07-26-intake-storage.md; the
  // ALARM half is DR.md §7's still-open "external /ready uptime checks" item, not this
  // change). Cold/unknown is a hard gate until the eager boot probe succeeds; after that proof
  // the second consecutive failure becomes a hard gate. storageProbeHealth() is SYNCHRONOUS
  // (storage-probe.mjs runs
  // the actual round trip on its own background interval, off this call entirely) — no await,
  // no bounded() wrap, ~0ms: three SEQUENTIAL bounded() network round trips already share fly's
  // 5s /ready timeout above, so the storage verdict must never spend any of that budget.
  // The object it returns is already the full public shape (classified reason + consecutive
  // count only — never raw vendor error text) — safe to assign as-is to
  // an unauthenticated endpoint's response.
  const storage = storageProbeHealth();
  checks.storage_write = storage;
  if (!storage.ok) {
    warnings.push(
      `storage write probe failed (${storage.consecutive_failures} consecutive): ` +
        `${storage.reason || (storage.pending ? "first probe still pending" : "unknown")}`,
    );
  }

  if (!result || result.ok !== true) {
    // DB unreachable or the whole check timed out.
    checks.db = { ok: false, error: result?.timeout ? "db_timeout" : "db_unreachable" };
    return { ready: false, checks, warnings };
  }

  const failed = readinessHasHardFailure(checks, worldEnabled());

  return { ready: !failed, checks, warnings };
}
