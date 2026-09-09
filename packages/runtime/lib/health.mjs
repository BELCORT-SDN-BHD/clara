// Readiness aggregation (Slice 4, contract §4.7). /ready is a LOAD-BALANCER gate:
// it FAILS (503) only on conditions where routing traffic here would be wrong —
//
//   * DB unreachable            (nothing works)
//   * the RUNTIME LANE's probe   (H-48 — the same "nothing works" condition, measured through
//                                the dedicated login rather than only through the pool)
//   * world dead                (when CLARA_START_WORLD=1 — no engine to run turns)
//   * control listener dead     (parked clarifies would never resume)
//   * taxonomy HALT             (the relay cannot route — an un-routable state)
//
// A dead relay LEADER is handled by the supervisor's fail-fast (S4-ND5), not here.
// Relay lag / dead-letters / backlog are WARNINGS only (degraded, still serving) —
// surfaced from clara.relay_health(). The storage write probe (R9, below) joins this
// same WARN-only class: a broken document lane is not "nothing works." The six NON-runtime
// pool lanes (H-48) and the relay pool's background-error counters (裁-149) join that same
// class. Everything is bounded + sanitized: /ready must never hang and never leak raw DB text.
//
// #617 added FOUR readings to that WARN-only class and CHANGED NO FAILURE CONDITION: the
// per-lane pool-error counters (`checks.pool_errors`), the relay leader's own state
// (`checks.leader`), the boot TLS posture (`checks.tls`), and a storage verdict that finally
// distinguishes NOT-CONFIGURED from NOT-YET-MEASURED from FAILING. Its through-line is that an
// UNMEASURED reading must never be reported as a healthy one — `pending`, `skipped`,
// `measured:false`, `unavailable:true` and `firmsUncheckpointed` all exist so that absence of
// evidence stops being served as evidence of health.

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
import { poolErrorHealth, relayPoolHealth, sanitizedErrorCode } from "./pool-error-contract.mjs";
import { laneProbeHealth, READINESS_CRITICAL_LANE } from "./lane-probe.mjs";
import { leaderStateHealth } from "./leader-state.mjs";
import { tlsPostureHealth } from "./tls-ca.mjs";

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

/**
 * #617 — the SAME four questions asked of every relay consumer, in one place, so a new consumer
 * cannot ship with three of them wired and the fourth silently missing (which is exactly how
 * wakeEngineHealth's own heldBelowCheckpoint counter sat inert for three rounds). `label` is the
 * consumer's display name in the warning text and stays byte-identical to what each consumer's
 * lines already said.
 *
 * The two NEW lines are the categories the ticket separates:
 *   * EXHAUSTED dead letters — past this consumer's own MAX_ATTEMPTS, therefore no longer being
 *     retried at all. Time will not fix these; only a redrive will. Reported apart from the
 *     pending total, which mixes them with rows still inside their retry budget.
 *   * UNCHECKPOINTED firms — events exist, no checkpoint row does. `lag` reads a missing
 *     checkpoint as last_seq 0, so these firms inflate lag with their whole history and are
 *     indistinguishable from firms that are merely behind. "Not yet measured" is its own answer.
 * @param {string[]} warnings
 * @param {string} label
 * @param {Record<string, unknown>} h
 */
function relayConsumerWarnings(warnings, label, h) {
  const deadLetters = /** @type {{pending?:number, exhausted?:number}|undefined} */ (h.deadLetters);
  const dead = Number(deadLetters?.pending ?? h.pendingDeadLetters ?? h.pending_dead_letters ?? 0);
  const exhausted = Number(deadLetters?.exhausted ?? 0);
  const lag = Number(h.lag ?? 0);
  const uncheckpointed = Number(h.firmsUncheckpointed ?? 0);
  if (dead > 0) warnings.push(`${dead} ${label} dead-letter(s)`);
  if (exhausted > 0) {
    warnings.push(`${exhausted} ${label} dead-letter(s) EXHAUSTED past max attempts — retrying has stopped; these need a redrive`);
  }
  if (lag > 1000) warnings.push(`${label} lag ${lag}`);
  if (uncheckpointed > 0) {
    warnings.push(`${label}: ${uncheckpointed} firm(s) have events but NO checkpoint — NOT YET MEASURED on those firms, not caught up`);
  }
}

/**
 * #617 — the TASK-driven consumers (classify, local_facts). These have no relay checkpoint, so
 * their categories are different ones, and both of the lines here are about work that is
 * FAILING SILENTLY rather than merely waiting:
 *   * STRANDED — rows sitting in 'running' past this lane's own requeue threshold. The queued
 *     backlog cannot see them (a looping task is 'running' for all but a moment of each cycle),
 *     and the pre-existing oldest-running AGE says one row is late without saying whether that
 *     is one poisoned document or the whole lane wedged.
 *   * MAX ATTEMPT COUNT — a task climbing toward its cap. classify already surfaced this;
 *     local_facts did not, and its rows terminally FAIL at the cap, so the count vanished with
 *     the row that carried it.
 * The threshold is read from the consumer's OWN health verdict (`strandedMs`), never re-read
 * from the environment here: two readings of one knob is how a warn silently stops matching the
 * behaviour it is meant to describe.
 * @param {string[]} warnings
 * @param {string} label
 * @param {Record<string, unknown>} h
 */
function taskConsumerWarnings(warnings, label, h) {
  const stranded = Number(h.stranded ?? 0);
  const strandedMs = Number(h.strandedMs ?? 0);
  const oldestRunningMs = Number(h.oldestRunningMs ?? 0);
  const maxAttempts = Number(h.maxAttemptCount ?? 0);
  if (stranded > 0) {
    warnings.push(
      `${label}: ${stranded} task(s) STRANDED in 'running' past ${Math.round(strandedMs)}ms ` +
        `(oldest ${Math.round(oldestRunningMs)}ms) — stalled work, not queued work`,
    );
  }
  if (maxAttempts >= 3) warnings.push(`${label} max attempt_count ${maxAttempts}`);
}

/**
 * #617 — a consumer-health query that THREW. Three things happen, and the first two are the fix:
 *   1. An EXPLICIT `{ok:false, unavailable:true}` ENTRY. Before this the key was simply ABSENT
 *      from `checks`, and an absent key reads as "nothing to report" — the reader could not tell
 *      a consumer whose state is UNKNOWN from one that was never enabled.
 *   2. Only a SANITIZED code on the wire. The old lines carried `err.message.slice(0, 80)` onto
 *      an UNAUTHENTICATED endpoint, in a file whose opening contract forbids exactly that; a
 *      libpq message routinely names roles, relations and hosts.
 *   3. The FULL error goes to the server log, where diagnosis belongs (lane-probe.mjs's posture).
 * @param {Record<string, unknown>} checks
 * @param {string[]} warnings
 * @param {string} key
 * @param {string} label
 * @param {unknown} err
 */
function consumerUnavailable(checks, warnings, key, label, err) {
  console.error(`[clara-runtime] /ready ${label} health query FAILED:`, /** @type {{message?:unknown}} */ (err)?.message ?? err);
  const code = sanitizedErrorCode(err);
  checks[key] = { ok: false, unavailable: true, error: code };
  warnings.push(`${label} unavailable (${code}) — this consumer's state is UNKNOWN, not healthy`);
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
            consumerUnavailable(checks, warnings, "relay", "relay_health", err);
          }

          // Matcher consumer health -> warnings only (§4.4: a stalled matcher
          // must never take chat traffic down).
          try {
            const mh = await matcherHealth(c);
            checks.matcher = { ok: true, ...mh };
            relayConsumerWarnings(warnings, "matcher", mh);
          } catch (err) {
            consumerUnavailable(checks, warnings, "matcher", "matcher_health", err);
          }

          // Autodraft consumer health -> warnings only (§3 / WA-L6: a stalled or dead sweep
          // consumer must never take chat traffic down — it surfaces as a staleness badge).
          try {
            const ah = await autodraftHealth(c);
            checks.autodraft = { ok: true, ...ah };
            relayConsumerWarnings(warnings, "autodraft", ah);
            const aDeferred = Number(ah.deferredWithdrawals ?? 0);
            if (aDeferred > 0) warnings.push(`${aDeferred} deferred withdrawal(s) awaiting owner-task settle`);
          } catch (err) {
            consumerUnavailable(checks, warnings, "autodraft", "autodraft_health", err);
          }

          // wake-engine consumer health -> warnings only (Gate G1 design §6's own RED-first cell:
          // "an engine death that does not show up in /ready as a WARN within one poll interval
          // is a defect" — this wiring IS that assertion's positive half, mirroring autodraft's
          // own warn-only law: a stalled wake engine must never take chat traffic down).
          try {
            const weh = await wakeEngineHealth(c);
            checks.wakeEngine = { ok: true, ...weh };
            relayConsumerWarnings(warnings, "wake-engine", weh);
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
            if (weHeld > 0) warnings.push(`${weHeld} held/queued wake-engine row(s) awaiting a disabled/unregistered source`);
            // NOTE-b (opus, round-4 review): surface an accumulating cancel_requested stall the
            // same way every other wake-engine signal above is surfaced — a WARN, not silence.
            if (weCancelStuck > 0) warnings.push(`${weCancelStuck} wake-engine row(s) stuck in cancel_requested`);
            if (weBelowCp > 0) warnings.push(`${weBelowCp} held wake-engine row(s) sitting AT OR BELOW their firm's own checkpoint (stranded — never re-scanned)`);
          } catch (err) {
            consumerUnavailable(checks, warnings, "wakeEngine", "wake_engine_health", err);
          }

          // local_facts consumer health -> warnings only (Wave A2): a stalled MyInvois
          // facts consumer must never take chat traffic down (the matcher/autodraft law).
          try {
            const lh = await localFactsHealth(c);
            checks.localFacts = { ok: true, ...lh };
            const queueWarnMs = Number(process.env.CLARA_DOCUMENT_QUEUE_WARN_MS || 60000);
            if (Number(lh.oldestQueuedMs ?? 0) > queueWarnMs) warnings.push(`local_facts oldest queued ${Math.round(Number(lh.oldestQueuedMs))}ms`);
            taskConsumerWarnings(warnings, "local_facts", lh);
          } catch (err) {
            consumerUnavailable(checks, warnings, "localFacts", "local_facts_health", err);
          }

          // rule-post consumer health check RETIRED with the loop itself — F-A2 PR-3
          // drops clara.execute_rule_post and the rules-execution tier whole.

          // sst_watch consumer health -> warnings only (Wave A2.1): a stalled SST compliance
          // watch must never take chat traffic down. Queries pre-0016-safe spine tables only.
          try {
            const sh = await sstWatchHealth(c);
            checks.sstWatch = { ok: true, ...sh };
            relayConsumerWarnings(warnings, "sst_watch", sh);
          } catch (err) {
            consumerUnavailable(checks, warnings, "sstWatch", "sst_watch_health", err);
          }

          // facts_gate consumer health -> warnings only (Wave A2.1): a stalled classifier→facts
          // gate must never take chat traffic down. Queries pre-0016-safe spine tables only.
          try {
            const fh = await factsGateHealth(c);
            checks.factsGate = { ok: true, ...fh };
            relayConsumerWarnings(warnings, "facts_gate", fh);
          } catch (err) {
            consumerUnavailable(checks, warnings, "factsGate", "facts_gate_health", err);
          }

          // classify consumer health -> warnings only (Wave A2.1): a stalled doc classifier must
          // never take chat traffic down. document_processing_tasks is 0009-era (pre-0016-safe).
          try {
            const ch = await classifyHealth(c);
            checks.classify = { ok: true, ...ch };
            const queueWarnMs = Number(process.env.CLARA_DOCUMENT_QUEUE_WARN_MS || 60000);
            if (Number(ch.oldestQueuedMs ?? 0) > queueWarnMs) warnings.push(`classify oldest queued ${Math.round(Number(ch.oldestQueuedMs))}ms`);
            taskConsumerWarnings(warnings, "classify", ch);
          } catch (err) {
            consumerUnavailable(checks, warnings, "classify", "classify_health", err);
          }

          // wiki_projection consumer health -> warnings ONLY (Wave B): a stalled wiki projection
          // must never take chat traffic down, and /ready NEVER gates on wiki freshness (WB-R3 —
          // projection lag is surfaced in the pack; books_version stays the authoritative token).
          // Queries pre-0017-safe spine tables only, so it is safe before 0017 is applied.
          try {
            const wh = await wikiProjectionHealth(c);
            checks.wikiProjection = { ok: true, ...wh };
            relayConsumerWarnings(warnings, "wiki_projection", wh);
            // F3: a runtime misconfiguration is a distinct, louder signal than an ordinary
            // dead-letter — the projection is stalled until the deployment is fixed.
            if (wh.configurationBlocked) warnings.push("wiki_projection BLOCKED on a runtime misconfiguration");
          } catch (err) {
            consumerUnavailable(checks, warnings, "wikiProjection", "wiki_projection_health", err);
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

  // Storage write probe (R9 — the MEASUREMENT half of follow-up (a) of the 2026-07-26
  // intake-storage incident; the ALARM/ROUTING half is a still-open "external /ready uptime
  // checks" item that lives outside this repository. #617: the two `docs/…` paths this comment
  // used to cite do not exist here; the operator-facing contract is
  // packages/runtime/README.md, "Health, TLS and serving identity", whose recovery checklist
  // reads these very fields). WARN-only, like every other intake-adjacent signal above: a storage outage
  // takes the DOCUMENT LANE down, not "nothing works" — the /ready contract at the top of this
  // file fails only on the latter. storageProbeHealth() is SYNCHRONOUS (storage-probe.mjs runs
  // the actual round trip on its own background interval, off this call entirely) — no await,
  // no bounded() wrap, ~0ms: the SEQUENTIAL bounded() network round trips above (today TWO —
  // the main DB check at :99 and the intake snapshot at :286, each able to spend the full
  // READY_DEADLINE_MS) already share fly's 5s /ready timeout, and this check's own verdict
  // cannot change the status code, so it must never spend any of that budget. THE LANE PROBE
  // (H-48, below) IS IN THIS SAME CLASS and for this same reason — it was briefly a third
  // sequential bounded() call and review-558 caught that; see its own paragraph. The count is
  // written as "today TWO" rather than a bare number so a future third round trip has to
  // re-read this sentence rather than inherit a stale one. The object it returns is already
  // the full public
  // shape (ok/reason/pending/skipped only — never the raw vendor error text) — safe to assign
  // as-is to an unauthenticated endpoint's response.
  //
  // THREE STATES, READ AS THREE (#617). The old reader was `if (!storage.ok)`, against a verdict
  // whose cold-start value was `{ok:true, pending:true}` — so an UNMEASURED storage lane was
  // reported HEALTHY and warned about nothing, and an estate with no storage secrets at all was
  // reported with the SAME `ok:false, reason:'storage_error'` as a live storage outage. Now:
  // `skipped` (not configured) and `pending` (not yet measured) each get their own WARN line and
  // their own field, and neither can be mistaken for a measured green. All three stay WARN-only.
  const storage = storageProbeHealth();
  checks.storage = storage;
  if (storage.skipped) {
    warnings.push(
      `storage is NOT CONFIGURED (${storage.reason}) — document custody is inert on this deployment, ` +
        "which is not the same fact as a storage failure",
    );
  } else if (storage.pending) {
    warnings.push("storage probe pending (not yet measured) — read the next poll before concluding anything");
  } else if (!storage.ok) {
    warnings.push(`storage write probe failed: ${storage.reason || "unknown"}`);
  }

  // 裁-149 clause 1 — the relay pool's background-error counters. WARN-ONLY and deliberately
  // so: the affected client is already out of the pool and the next checkout opens a fresh
  // connection, so a background error is an AVAILABILITY SIGNAL, not a reason to take chat
  // traffic down. The counter is monotonic since process start; `errors > 0` therefore means
  // "this process has seen N of them", which is exactly what an operator needs to correlate
  // against a pooler restart. It never touches `failed` below.
  const relayPool = relayPoolHealth();
  checks.relay_pool = relayPool;
  if (relayPool.errors > 0) {
    warnings.push(`relay pool background error(s) since boot: ${relayPool.errors} (last ${relayPool.last_error_code} at ${relayPool.last_error_at})`);
  }

  // #617 — the SAME contract, now per DEDICATED-LOGIN LANE. Until this, the seven lane pools
  // carried console-only listeners: a Supavisor restart that recycled the write floor or the
  // freeform reader was logged and then invisible, so an operator reading /ready could not tell
  // a lane that had been dropping connections all morning from one that had never faltered.
  // WARN-ONLY for the reason the relay pool's own paragraph above gives, and keyed on the same
  // lane names `checks.pools` uses so the two reports can be read side by side. A lane MISSING
  // from this map is a lazy pool this process never constructed — not a lane with zero errors.
  const poolErrors = poolErrorHealth();
  checks.pool_errors = poolErrors;
  for (const [lane, counters] of Object.entries(poolErrors)) {
    if (counters.errors > 0) {
      warnings.push(
        `pool lane '${lane}' background error(s) since boot: ${counters.errors} ` +
          `(last ${counters.last_error_code} at ${counters.last_error_at})`,
      );
    }
  }

  // #617 — the RELAY LEADER's own state. Until now nothing about the single most consequential
  // component in the process reached /ready: `checks.world`/`checks.control` are heartbeats
  // written by OTHER tasks, so they prove the process is alive and say nothing about whether it
  // holds the 'router' advisory lock or how often its session has died and re-acquired.
  //
  // WARN, NEVER A 503, AND THAT IS DELIBERATE — the /ready contract at the top of this file
  // states it: "A dead relay LEADER is handled by the supervisor's fail-fast (S4-ND5), not
  // here." A leader that is mid-reconnect is degraded, not un-routable; a HALT already takes the
  // process down by its own path (and, when the world is on, `checks.taxonomy` is the 503 for
  // the un-routable state itself). `checks.leader.ok` records the halt for the window before the
  // exit; it does not add a new failure condition.
  const leader = leaderStateHealth();
  checks.leader = leader;
  if (leader.halted) {
    warnings.push(`relay leader HALTED (${leader.halted.reason} at ${leader.halted.at}) — the process exits non-zero for supervision`);
  } else if (leader.started && !leader.held) {
    warnings.push(
      `relay leader is NOT HELD (reconnecting; ${leader.reconnects} reconnect(s) since boot` +
        `${leader.last_error_code ? `, last ${leader.last_error_code}` : ""}) — routing and the reconciler belts are paused`,
    );
  }

  // #617 — the TLS posture this process actually booted with. `assertLaneDsnTlsPosture` has
  // always computed it and then thrown it away into a log line; an operator asking "did the
  // verify-full ceremony take on this machine?" had to find that boot line, and a machine
  // restarted since had nothing to show. NAMES AND COUNTS ONLY — variable names, never a DSN,
  // and `validated` is a COUNT rather than the sslrootcert PATHS the assert returns.
  //
  // `measured:false` means the boot assert has NOT RUN here (a world-off health check, a rig
  // that never constructed the pools). That is not the same fact as "ran and found nothing
  // pinned", and it must never be reported as a clean posture. It warns only in PRODUCTION,
  // where `assertProductionPoolConfig` is supposed to have run: on a rig, silence is correct.
  const tls = tlsPostureHealth();
  checks.tls = tls;
  const production = process.env.RELAY_TEST_MODE !== "1";
  if (!tls.measured) {
    if (production) warnings.push("TLS posture NOT MEASURED — the boot assert has not run in this process");
  } else if (production) {
    if (tls.unpinned.length > 0) {
      warnings.push(`${tls.unpinned.length} DSN(s) pin NO CA: ${tls.unpinned.join(", ")} — lane TLS is unauthenticated in practice`);
    }
    if (tls.weak_mode.length > 0) {
      warnings.push(`${tls.weak_mode.length} DSN(s) do not request a VERIFYING sslmode: ${tls.weak_mode.join(", ")}`);
    }
  }

  // H-48 — the per-lane probe. Seven logins, one `select 1` each AFTER its own SET ROLE.
  //
  // SYNCHRONOUS, ~0ms, AND DELIBERATELY SO (review-558 MAJOR-1). This read spends NONE of fly's
  // 5s /ready budget: `laneProbeHealth()` returns the last verdict from memory and a background
  // interval in lib/lane-probe.mjs does the connecting. The first cut awaited a THIRD
  // sequential `bounded()` here — the exact hazard the storage-probe paragraph above already
  // names — and H-48's own headline case, a lane whose host BLACK-HOLES rather than refuses,
  // would then have pushed /ready past fly's 5s timeout: the operator gets a timed-out health
  // check INSTEAD of the `pool lane 'x' unreachable` warning this feature exists to give.
  //
  // A PENDING verdict (the window before the first background cycle settles) is NOT a warning
  // and NOT a failure: an unmeasured lane must never 503 a healthy machine. Unconfigured lazy
  // lanes report `skipped` and are not warnings either — the bank and the two checkout lanes
  // are lazy by ruling because their ceremonies are gated on later events. Only the RUNTIME
  // lane's failure joins the readiness failure set, and it joins the one that already existed
  // (`checks.db`, which still measures that pool LIVE on this request path every poll); every
  // other lane WARNS with its lane name — never its DSN, never raw DB text.
  const laneProbe = laneProbeHealth();
  const lanes = laneProbe.pending ? null : laneProbe.lanes;
  if (lanes === null) {
    checks.pools = { pending: true, stalled: laneProbe.stalled };
    // A STALLED loop is not the same fact as "not measured yet", and until r2 it read as one:
    // a cycle that blows its hard bound resets the verdict to pending, so a probe that kept
    // timing out was indistinguishable from a fresh boot, silently, forever. That is the
    // absence-is-not-evidence shape. It WARNS rather than fails — a stalled INSTRUMENT is not
    // a broken lane, and taking chat traffic down because a health probe wedged would be the
    // feature causing the outage it exists to report.
    if (laneProbe.stalled) {
      warnings.push(`per-lane pool probe has not settled a cycle in ${Math.round(laneProbe.since_ms)}ms (the probe loop is stalled, not the lanes)`);
    }
  } else {
    checks.pools = lanes;
    for (const lane of lanes) {
      if (lane.skipped) continue;
      if (lane.ok) continue;
      if (lane.lane === READINESS_CRITICAL_LANE) continue; // folded into `failed` below, not a warning
      warnings.push(`pool lane '${lane.lane}' unreachable (${lane.error})`);
    }
  }
  // The runtime lane is the ONE lane whose failure is a readiness failure. It is kept as its own
  // conjunct rather than folded into `checks.db` on purpose: `checks.db` reports what the main
  // bounded round trip actually saw, and overwriting it with a probe's verdict would make the
  // response lie about which instrument failed. A SKIPPED runtime lane is not a failure (that is
  // a test-mode rig with no base source), and neither is a PENDING one — `lanes` is null before
  // the first background cycle settles, `Array.isArray(null)` is false, so an UNMEASURED lane
  // can never 503 a healthy machine. Only an explicit ok:false does.
  const runtimeLane = Array.isArray(lanes) ? lanes.find((l) => l.lane === READINESS_CRITICAL_LANE) : null;
  const runtimeLaneFailed = Boolean(runtimeLane && runtimeLane.skipped !== true && runtimeLane.ok === false);

  if (!result || result.ok !== true) {
    // DB unreachable or the whole check timed out.
    checks.db = { ok: false, error: result?.timeout ? "db_timeout" : "db_unreachable" };
    return { ready: false, checks, warnings };
  }

  const failed =
    checks.db?.ok === false ||
    runtimeLaneFailed ||
    (worldEnabled() && (checks.world?.ok === false || checks.control?.ok === false || checks.taxonomy?.ok === false));

  return { ready: !failed, checks, warnings };
}
