// LANE-AWARE MINT PACING for the document reconciler (F-A2 opener ④ — the 2026-08-20 corpus
// run's live incident, `docs/plan/completed/f-a1-corpus-measurement.md`, "The incident the run
// exposed" §1). Split out of reconciler-documents.mjs under the same module-size budget that
// split that file out of reconciler.mjs; reconciler-documents.mjs is the only caller.
//
// THE SHAPE. The reconciler's queued branch re-mints a workflow run for EVERY queued task past
// the grace whose prior run is terminal. That is correct when the queue is shallow and
// catastrophic when it is deep: the DATABASE gates concurrency at CLAIM time
// (`claim_document_processing_task` raises CLR18 once the lane's window is full — 0090 §4), so on
// a 2-slot lane a deep queue produced **~46 runs/sweep dying on CLR18** while their retries
// saturated the runtime's pg pool — the figure recorded in
// `docs/plan/completed/f-a1-corpus-measurement.md`, "The incident the run exposed" §1, along with
// the heartbeat starvation and health-check flap it caused. Every one of those runs is pure
// waste: the work they would have done is done by the two that actually claimed.
//
// WHAT THIS MODULE DELIVERS, stated as the exact invariant so nothing has to be inferred:
//
//   **A PER-SWEEP MINT BOUND, IN TWO LAYERS.**
//     * a GLOBAL layer — one sweep never mints more runs than the runtime's own connection pool
//       can absorb (`RUNTIME_POOL_MAX`, imported BY IDENTITY from pools.mjs, never re-spelled as
//       a literal). This is the engine-protective bound: the incident's damage was pool
//       exhaustion, which is a property of the WHOLE sweep and not of any one firm or lane.
//     * a PER-(FIRM, WINDOW) layer — the fairness bound underneath it: at most (free lane slots)
//       for each firm's own concurrency window, so no single firm's backlog eats the sweep.
//   A mint must pass BOTH; a refusal by either spends nothing from the other.
//
// **IT DOES NOT BOUND RUNS IN FLIGHT.** This is a bound on MINTS PER SWEEP, not on the number of
// workflow runs concurrently alive. A minted-but-not-yet-claimed task still reads `queued` with a
// NULL `workflow_run_id` in the next sweep's snapshot, so under claim latency it is minted again
// (registered as a named F-A2 follow-up in PROGRESS.md: the sidecar `runId` clobber at
// reconciler-documents.mjs:198-206 + spool.mjs:124; harmless — the workflow dedupes — but it
// costs pool checkouts). The global cap BOUNDS that accumulation per sweep; it does not
// eliminate it, and closing it properly touches a pre-existing path that needs its own review.
//
// UN-MINTED TASKS ARE NOT DROPPED, NOT FAILED AND NOT TOUCHED AT ALL — they stay exactly as they
// were, `queued`, and the next sweep (~2s later) mints them against whatever has since freed.
//
// AGE DECIDES WHO WINS, on the DB path. `documentTaskSnapshot` orders by `created_at` and the
// reconciler's loop walks it in that order, so both layers are consumed oldest-first, ACROSS
// FIRMS as well as within one. Qualified deliberately: when that SELECT is unavailable the sweep
// falls back to `listTaskMetas()`, which is spool-DIRECTORY order, not age. Progress is still
// guaranteed there (every sweep mints up to the cap and a deferred task is untouched), but the
// oldest-first ORDER is not — it is a property of the snapshot, not of this module.
//
// PACING IS NOT AUTHORIZATION. The CLR18 gate in the database remains the only thing that
// decides whether a claim is legal; this is throughput management sitting in front of it. That
// is what makes it acceptable for the per-firm cap below to be a HINT (see laneCapHints): a hint
// that is too low only paces slower, and one that is too high still cannot exceed the global
// layer.

// THE ENGINE-PROTECTIVE BOUND, BY IDENTITY. `RUNTIME_POOL_MAX` is imported from the module that
// SIZES the pool, never re-spelled here as a literal or re-read from its env var: a second
// spelling is a second source of truth, and the one thing this cap must never do is drift from
// the pool it is protecting (evidence law 3 — a name is a projection of the thing, not the
// thing). Change `CLARA_RUNTIME_POOL_MAX` and this cap moves with it, automatically.
import { RUNTIME_POOL_MAX } from "./pools.mjs";

/** The lanes `claim_document_processing_task` actually gates, and the window each is counted in
 *  (0090 §4, read off the migration body — NOT from the lane's spelling):
 *    * 'shared'      — ocr | invoice_facts | statement_facts share ONE window, sized by
 *                      `coalesce(ocr_concurrency,2)` and counted across all three together;
 *    * 'llm_witness' — its OWN window, `coalesce(llm_witness_concurrency,2)`, counted over that
 *                      lane alone (F-A1 PR-1 / M10 — deliberately not folded into the triple).
 *  Every other lane ('structured_parse', 'none', 'statement_parse', 'local_facts', 'classify')
 *  passes the claim ungated, so pacing it would throttle a lane the database never throttles.
 *  Returns null for those — they are never paced. */
export function laneConcurrencyGroup(lane) {
  if (lane === "ocr" || lane === "invoice_facts" || lane === "statement_facts") return "shared";
  if (lane === "llm_witness") return "llm_witness";
  return null;
}

/** The lanes whose running rows are worth counting — exactly the gated set above. */
export const GATED_LANES = Object.freeze(["ocr", "invoice_facts", "statement_facts", "llm_witness"]);

/**
 * The per-window caps, as HINTS mirroring the database's own defaults.
 *
 * WHY A HINT AND NOT A READ. The caps live in `clara.firm_document_limits`, on which
 * `clara_runtime` deliberately holds no SELECT — the 0008 read surface grants the runtime the
 * task table and nothing about firm configuration. Reading them would mean widening the
 * runtime's read surface for a throughput optimisation, which is a bad trade for a value whose
 * authority is the database's own gate rather than this process. So the runtime mirrors the DB's
 * `coalesce(...,2)` defaults and lets a deployment that raised a firm's limit say so with an env
 * var. Stated plainly so nobody later mistakes this for the authoritative limit.
 *
 * Finite-guarded and floored at 1 (the leader.mjs idiom): junk, zero or a negative would mean
 * "mint nothing, ever", which would strand every gated lane — a config typo must be able to slow
 * the pipeline, never to stop it.
 *
 * @param {Record<string, string|undefined>} [env]
 */
export function laneCapHints(env = process.env) {
  const positive = (raw, fallback) => {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    shared: positive(env?.CLARA_OCR_CONCURRENCY_HINT, 2),
    llm_witness: positive(env?.CLARA_LLM_WITNESS_CONCURRENCY_HINT, 2),
  };
}

/** The budget's map key. A JSON identity TUPLE, never a delimiter-joined string: a `|` (or any
 *  other separator) is a guess about what a firm id or a lane name can never contain, and a wrong
 *  guess silently merges two windows into one — the kind of defect that shows up as "pacing is
 *  mysteriously too strict for one firm" and nothing else. One keying discipline across this
 *  module, so there is no second rule to remember. */
function windowKey(firmId, group) {
  return JSON.stringify([String(firmId ?? ""), group]);
}

/**
 * One sweep's mint budget, in the two layers the module header names.
 *
 * `runningRows` is a POSITIVE observation — rows a read actually returned — never a derivation.
 * When the census read is unavailable the caller passes what it DID see (or an empty list), and
 * the per-firm layer degrades to the full cap. It never degrades to "unlimited" (the global layer
 * still binds) and never to "zero" (a blind sweep must still make progress).
 *
 * @param {Array<{firmId:string, lane:string, running:number}>} runningRows
 * @param {{shared:number, llm_witness:number}} [caps]
 * @param {number} [globalCap]  total mints this sweep may spend across ALL firms and lanes.
 *   Defaults to the runtime pool's own size, imported by identity — see the header.
 */
export function makeLaneMintBudget(runningRows = [], caps = laneCapHints(), globalCap = RUNTIME_POOL_MAX) {
  const used = new Map();
  for (const row of runningRows) {
    const group = laneConcurrencyGroup(String(row?.lane ?? ""));
    if (!group) continue;
    const n = Number(row.running);
    const key = windowKey(row?.firmId, group);
    used.set(key, (used.get(key) ?? 0) + (Number.isFinite(n) && n > 0 ? n : 0));
  }
  // Finite-guarded like every other bound here: a junk pool size must never mean "no global
  // cap". Floored at 1 so a misconfiguration slows the sweep instead of stopping it dead.
  const parsedGlobal = Math.floor(Number(globalCap));
  let globalRemaining = Number.isFinite(parsedGlobal) && parsedGlobal > 0 ? parsedGlobal : 5;
  const remaining = new Map();
  const remainingFor = (firmId, lane) => {
    const group = laneConcurrencyGroup(String(lane ?? ""));
    if (!group) return Infinity; // ungated lane — the DB never counts it, so neither do we
    const key = windowKey(firmId, group);
    if (!remaining.has(key)) {
      const cap = Number(caps?.[group]);
      const free = (Number.isFinite(cap) && cap > 0 ? cap : 2) - (used.get(key) ?? 0);
      remaining.set(key, free > 0 ? free : 0);
    }
    return remaining.get(key);
  };
  return {
    remainingFor,
    /** What is left of the SWEEP-WIDE bound. Exposed so the caller can say in its log whether a
     *  deferral was the engine-protective cap or a firm's own full window — two different
     *  operator actions, and guessing between them from a single counter is exactly the
     *  derived-state reading evidence law 2 forbids. */
    remainingGlobal() { return globalRemaining; },
    /** Spend one slot for this (firm, lane). FALSE means this sweep will not mint the task — the
     *  caller must leave it queued rather than mint a run that could only die on CLR18 or add a
     *  checkout the pool cannot absorb. Ungated lanes still consume the GLOBAL slot (they mint a
     *  real run and take a real connection); they just have no per-firm window to consume.
     *
     *  BOTH LAYERS OR NEITHER. A refusal by either layer spends nothing from the other, so a
     *  firm whose window is full cannot quietly drain the global budget on tasks it was never
     *  going to mint. */
    tryMint(firmId, lane) {
      if (globalRemaining <= 0) return false;
      const left = remainingFor(firmId, lane);
      if (left !== Infinity && left <= 0) return false;
      if (left !== Infinity) {
        remaining.set(windowKey(firmId, laneConcurrencyGroup(String(lane))), left - 1);
      }
      globalRemaining -= 1;
      return true;
    },
  };
}

/** The running-task census the budget is built from — a real GROUP BY over the one table the
 *  runtime holds SELECT on (0008), scoped exactly as the reconciler's task snapshot is.
 *  Deliberately NOT capped by a LIMIT: an under-counted `running` inflates the budget, which is
 *  the failure this whole module exists to prevent. */
export async function laneRunningCounts(client, onlyFirm) {
  const r = await client.query(
    `select firm_id, lane, count(*)::int as running
       from clara.document_processing_tasks
      where status='running' and lane = any($2::text[])
        and ($1::uuid is null or firm_id=$1)
      group by firm_id, lane`,
    [onlyFirm ?? null, GATED_LANES],
  );
  return r.rows.map((row) => ({ firmId: String(row.firm_id), lane: String(row.lane), running: Number(row.running) }));
}

/** The DEGRADED census: what the sweep's OWN snapshot already saw running. Weaker than the
 *  GROUP BY — the snapshot carries a LIMIT, so it can under-count — but it is still a read that
 *  actually happened, which is the bar evidence law 2 sets, and under-counting here only widens
 *  the budget toward the cap, never past it. */
export function runningCountsFromSnapshot(tasks = []) {
  /** Keyed by IDENTITY, never by a joined string — a delimiter is a guess about what a firm id
   *  or a lane name may contain, and a wrong guess would silently merge two windows into one. */
  const counts = new Map();
  for (const task of tasks) {
    if (!task || task.status !== "running") continue;
    const lane = String(task.lane ?? "");
    if (!laneConcurrencyGroup(lane)) continue;
    const firmId = String(task.firmId ?? "");
    const key = JSON.stringify([firmId, lane]);
    const seen = counts.get(key);
    if (seen) seen.running += 1;
    else counts.set(key, { firmId, lane, running: 1 });
  }
  return [...counts.values()];
}
