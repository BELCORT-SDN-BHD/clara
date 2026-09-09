// #617 — THE CONSUMER-HEALTH CATEGORIES, DEFINED ONCE.
//
// Every relay consumer (matcher, autodraft, facts_gate, sst_watch, wiki_projection, wake_engine)
// and every task lane (classify, local_facts) answers the SAME questions about itself on /ready.
// Before this module each consumer carried its own copy of the SQL and its own copy of the
// explanation, which is how a category ends up wired into four consumers and silently missing
// from the fifth. The queries live here; each consumer supplies only what is genuinely its own —
// its consumer name and ITS OWN retry cap, or its lane and ITS OWN stranded threshold.
//
// ---------------------------------------------------------------------------------------------
// THE RELAY-CONSUMER CATEGORIES — THREE READINGS THAT USED TO ARRIVE AS ONE.
//
// `firmsUncheckpointed` is NOT-YET-MEASURED, and `lag` structurally cannot express it: `lag`
// treats a missing checkpoint row as `last_seq = 0`, so a firm this consumer has never touched
// contributes its ENTIRE history to the lag total and is indistinguishable from a firm that fell
// behind — while a firm with a checkpoint and no new events contributes 0, exactly like a firm
// with no events at all. An operator reading `lag: 4000` cannot tell "behind" from "never started
// here". This counts the second case on its own. It is the complement of `firmsTracked`.
//
// `deadLetters.exhausted` is GIVEN UP ON: a pending dead-letter whose attempt_count has reached
// the consumer's own cap is no longer being retried — the cycle skips past it and advances the
// checkpoint — so it needs an operator redrive and will otherwise sit there forever. A pending row
// BELOW the cap is still inside its retry budget. Those are different work items;
// `pendingDeadLetters` (kept, unchanged, for every existing reader) sums them and can say neither.
// Exhausted is a SUBSET of pending, never a sibling: the two counts are never subtracted from each
// other.
//
// The cap is a PARAMETER, never a constant read here: each consumer's MAX_ATTEMPTS is its own
// env-tunable knob and is the same number its cycle compares `attempts >=` against. A second
// hand-typed 5 in this module would be a second answer to one question, and would stop matching
// the behaviour it describes the day a consumer's knob moves.
//
// WHY SQL TEXT AND A ROW MAPPER, not one function that runs its own query, for the relay half:
// wiki_projection also selects `configuration_blocked` and wake_engine five further counters in
// the SAME statement, and `pendingDeadLetters` and `deadLetters.pending` are required to be the
// same number, not two reads of one table taken a round trip apart. Composing the columns keeps
// every consumer at ONE query over ONE snapshot. `relayConsumerHealth` below is the convenience
// wrapper for the consumers that need nothing else.
// ---------------------------------------------------------------------------------------------

/** The NOT-YET-MEASURED column. `$1` = consumer name. Split out because wake_engine composes it
 *  into its own multi-counter statement while computing an exhausted count this module cannot
 *  (its retry cap is per SOURCE, read from clara.wake_engine_sources, not a module constant). */
export const FIRMS_UNCHECKPOINTED_COLUMN = `(select count(*) from clara.firm_event_seq s
          where not exists (select 1 from clara.relay_checkpoints c
                             where c.consumer = $1 and c.firm_id = s.firm_id))::int as firms_uncheckpointed`;

/** The five columns every relay consumer's health statement selects.
 *  `$1` = consumer name, `$2` = that consumer's OWN max attempts. Spine tables only
 *  (firm_event_seq / relay_checkpoints / relay_dead_letters, all 0005-era), so every consumer
 *  that documents itself as safe to call before its own migration stays safe. */
export const RELAY_CONSUMER_HEALTH_COLUMNS = `coalesce((select sum(greatest(s.n - coalesce(c.last_seq, 0), 0))
                   from clara.firm_event_seq s
                   left join clara.relay_checkpoints c on c.consumer = $1 and c.firm_id = s.firm_id), 0)::bigint as lag,
       (select count(*) from clara.relay_dead_letters where consumer = $1 and status = 'pending')::int as pending_dead_letters,
       ${FIRMS_UNCHECKPOINTED_COLUMN},
       (select count(*) from clara.relay_dead_letters
         where consumer = $1 and status = 'pending' and attempt_count >= $2)::int as exhausted_dead_letters,
       (select count(*) from clara.relay_checkpoints where consumer = $1)::int as firms_tracked`;

/**
 * Map a row carrying `RELAY_CONSUMER_HEALTH_COLUMNS` (or any superset of it — wake_engine's row
 * carries five more counters) onto the shared health fields. Each consumer then names the fields
 * it publishes in its own return literal, so its wire shape stays readable at its own call site.
 * @param {Record<string, any>} row
 * @returns {{lag:number, pendingDeadLetters:number, firmsTracked:number, firmsUncheckpointed:number,
 *            deadLetters:{pending:number, exhausted:number}}}
 */
export function relayConsumerCategories(row) {
  return {
    lag: Number(row.lag),
    pendingDeadLetters: row.pending_dead_letters,
    firmsTracked: row.firms_tracked,
    firmsUncheckpointed: row.firms_uncheckpointed,
    deadLetters: { pending: row.pending_dead_letters, exhausted: row.exhausted_dead_letters },
  };
}

/**
 * The whole relay-consumer health read, for a consumer whose statement needs nothing else.
 * ONE query, ONE snapshot.
 * @param {{query: (sql: string, params?: any[]) => Promise<{rows: any[]}>}} client
 * @param {string} consumer consumer name, as it appears in relay_checkpoints / relay_dead_letters
 * @param {number} maxAttempts THIS consumer's own retry cap (the one its cycle compares against)
 */
export async function relayConsumerHealth(client, consumer, maxAttempts) {
  const r = await client.query(`select\n       ${RELAY_CONSUMER_HEALTH_COLUMNS}`, [consumer, maxAttempts]);
  return relayConsumerCategories(r.rows[0]);
}

/**
 * The TASK-lane health read (classify, local_facts). These lanes have no relay checkpoint, so
 * their categories are different ones:
 *
 *   * `stranded` is the COUNT of rows sitting in 'running' past this lane's own requeue
 *     threshold, beside the pre-existing oldest-running AGE. The age says one row has been
 *     running too long; it cannot say whether that is one poisoned document or the whole lane
 *     wedged, and those need different responses. The QUEUED backlog can see neither: a looping
 *     task is 'running' for all but a moment of each stranded cycle, so a wedged worker shows as
 *     a perfectly idle one.
 *   * `maxAttemptCount` is the lane's worst attempt_count — the same condition from the other
 *     side, and the retry cap doing (or not doing) its job.
 *
 * `strandedMs` is echoed back so /ready reports the threshold the count was actually measured
 * against instead of re-reading the environment variable itself: two readings of one knob is how
 * a warning silently stops matching the behaviour it describes.
 *
 * @param {{query: (sql: string, params?: any[]) => Promise<{rows: any[]}>}} client
 * @param {string} lane document_processing_tasks.lane
 * @param {number} strandedMs THIS lane's own requeue threshold (the one its cycle requeues on)
 */
export async function taskLaneHealth(client, lane, strandedMs) {
  const r = await client.query(
    `select
       count(*) filter (where status='queued')::int as queued,
       count(*) filter (where status='running')::int as running,
       coalesce(extract(epoch from (now() - min(created_at) filter (where status='queued'))) * 1000, 0)::bigint as oldest_queued_ms,
       coalesce(extract(epoch from (now() - min(coalesce(started_at, updated_at)) filter (where status='running'))) * 1000, 0)::bigint as oldest_running_ms,
       coalesce(max(attempt_count), 0)::int as max_attempt_count,
       count(*) filter (where status='running'
                          and coalesce(started_at, updated_at) < now() - ($2::bigint * interval '1 millisecond'))::int as stranded
     from clara.document_processing_tasks where lane=$1 and status in ('queued','running')`,
    [lane, strandedMs],
  );
  return {
    queued: Number(r.rows[0].queued),
    running: Number(r.rows[0].running),
    oldestQueuedMs: Number(r.rows[0].oldest_queued_ms),
    oldestRunningMs: Number(r.rows[0].oldest_running_ms),
    maxAttemptCount: Number(r.rows[0].max_attempt_count),
    stranded: Number(r.rows[0].stranded),
    strandedMs,
  };
}
