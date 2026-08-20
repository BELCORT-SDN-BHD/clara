// LANE-AWARE MINT PACING for the document reconciler (F-A2 opener ④ — the 2026-08-20 corpus
// run's live incident, `docs/plan/completed/f-a1-corpus-measurement.md`, "The incident the run
// exposed" §1). Split out of reconciler-documents.mjs under the same module-size budget that
// split that file out of reconciler.mjs; reconciler-documents.mjs is the only caller.
//
// THE SHAPE. The reconciler's queued branch re-mints a workflow run for EVERY queued task past
// the grace whose prior run is terminal. That is correct when the queue is shallow and
// catastrophic when it is deep: the DATABASE gates concurrency at CLAIM time
// (`claim_document_processing_task` raises CLR18 once the lane's window is full — 0090 §4), so
// on a 2-slot lane a 46-deep queue mints 46 runs per sweep, of which ~44 die on CLR18 while
// their retries saturate the runtime's pg pool. Measured live: heartbeat starvation and a
// health-check flap. Every one of those runs is pure waste — the work they would have done is
// done by the two that actually claimed.
//
// THE FIX, owner-ratified: mint at most (free lane slots) runs per sweep. Un-minted tasks are
// NOT dropped, NOT failed and NOT touched at all — they stay exactly as they were, `queued`, and
// the next sweep (~2s later) mints them against the slots that have since freed. Because the
// reconciler's snapshot is ordered by `created_at` and its loop walks it in that order, the
// pacing is FIFO: the oldest queued task is always the next one minted, so a paced task cannot
// be starved by a younger one.
//
// PACING IS NOT AUTHORIZATION. The CLR18 gate in the database remains the only thing that
// decides whether a claim is legal; this is throughput management sitting in front of it. That
// is what makes it acceptable for the cap below to be a HINT (see laneCapHints): a hint that is
// too low only paces slower, and a hint that is too high only returns the pre-fix behaviour —
// bounded, because the budget is still spent per sweep.

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

/**
 * One sweep's mint budget: cap − already-running, per (firm, window), decremented as it is spent.
 *
 * `runningRows` is a POSITIVE observation — rows a read actually returned — never a derivation.
 * When the census read is unavailable the caller passes what it DID see (or an empty list), and
 * the budget degrades to the full cap: still bounded at ~2 mints per firm per window per sweep,
 * which is the property that matters versus the 46 the incident measured. It never degrades to
 * "unlimited", and it never degrades to "zero".
 *
 * @param {Array<{firmId:string, lane:string, running:number}>} runningRows
 * @param {{shared:number, llm_witness:number}} [caps]
 */
export function makeLaneMintBudget(runningRows = [], caps = laneCapHints()) {
  const used = new Map();
  for (const row of runningRows) {
    const group = laneConcurrencyGroup(String(row?.lane ?? ""));
    if (!group) continue;
    const n = Number(row.running);
    const key = `${row.firmId}|${group}`;
    used.set(key, (used.get(key) ?? 0) + (Number.isFinite(n) && n > 0 ? n : 0));
  }
  const remaining = new Map();
  const remainingFor = (firmId, lane) => {
    const group = laneConcurrencyGroup(String(lane ?? ""));
    if (!group) return Infinity; // ungated lane — the DB never counts it, so neither do we
    const key = `${firmId}|${group}`;
    if (!remaining.has(key)) {
      const cap = Number(caps?.[group]);
      const free = (Number.isFinite(cap) && cap > 0 ? cap : 2) - (used.get(key) ?? 0);
      remaining.set(key, free > 0 ? free : 0);
    }
    return remaining.get(key);
  };
  return {
    remainingFor,
    /** Spend one slot for this (firm, lane). FALSE means the window is full for this sweep and
     *  the caller must leave the task queued rather than mint a run that could only die on
     *  CLR18. Ungated lanes always return true and consume nothing. */
    tryMint(firmId, lane) {
      const left = remainingFor(firmId, lane);
      if (left === Infinity) return true;
      if (left <= 0) return false;
      remaining.set(`${firmId}|${laneConcurrencyGroup(String(lane))}`, left - 1);
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
