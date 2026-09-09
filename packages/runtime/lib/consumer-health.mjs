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
//
// ---------------------------------------------------------------------------------------------
// WHY THERE ARE ALSO PER-FIRM / PER-ROW READERS (`relayFirmCategory`, `deadLetterCategory`).
//
// The columns are ESTATE-WIDE by design — that is what an operator looks at — and that is exactly
// what makes them unusable as a test's own assertion. CI runs `pnpm -r --if-present test`, i.e.
// the db, web and runtime suites CONCURRENTLY against ONE Postgres database, and
// `clara.firm_event_seq` is shared by every consumer and every suite. A cell that asserted its
// own contribution as a DELTA (`after.firmsUncheckpointed - before.firmsUncheckpointed === 1`)
// was therefore also counting every firm some other suite happened to create between the two
// reads: PR #686 failed precisely that way (`4 !== 1`) on a cell that had been green for waves.
//
// The answer is not a looser estate assertion but a NARROWER read. These readers answer the SAME
// question about ONE firm, or ONE dead-letter row — state no concurrent suite can touch — so a
// cell asserts its own category exactly and leaves the estate counts to direction-only checks
// (`>= 1`, `pending >= exhausted`) that concurrent noise can only strengthen.
//
// They are built from the SAME text as the columns: the checkpoint-existence predicate, the
// stream relation and the pending/exhausted predicates each exist ONCE below and are interpolated
// into both the estate column and the reader. A reader carrying its own hand-typed `not exists
// (select 1 from clara.relay_checkpoints ...)` would be a second answer to the question the
// column already answers — the failure mode this whole module exists to prevent — and a test
// standing on it would go on passing while /ready drifted away underneath it.
// ---------------------------------------------------------------------------------------------

/** The stream relation both relay columns aggregate over, named once. The allocator writes a
 *  firm's `clara.firm_event_seq` row on its FIRST event and never removes it, so "has a row here"
 *  IS "this firm has events" — which is how `relayFirmCategory` reads it. */
const FIRM_STREAM = `clara.firm_event_seq s`;

/** The CHECKPOINTED predicate, named once. `$1` = consumer name; `firm` is the firm-id SQL being
 *  compared — `s.firm_id` for the estate column (once per stream row), `$2` for one firm. */
const checkpointExists = (firm) => `exists (select 1 from clara.relay_checkpoints c
                             where c.consumer = $1 and c.firm_id = ${firm})`;

/** The single-firm scope shared by every reader below: `$2` is always the firm id. */
const ONE_FIRM = `s.firm_id = $2`;

/** The NOT-YET-MEASURED column. `scope` is a leading predicate narrowing the stream rows it
 *  counts: empty for the whole estate, `ONE_FIRM + " and "` for a single firm. */
const firmsUncheckpointedColumn = (scope = "") => `(select count(*) from ${FIRM_STREAM}
          where ${scope}not ${checkpointExists("s.firm_id")})::int as firms_uncheckpointed`;

/** The BACKLOG column. `scope` narrows the same relation, here as a trailing clause: empty for the
 *  whole estate, a `where ONE_FIRM` for a single firm. */
const lagColumn = (scope = "") => `coalesce((select sum(greatest(s.n - coalesce(c.last_seq, 0), 0))
                   from ${FIRM_STREAM}
                   left join clara.relay_checkpoints c on c.consumer = $1 and c.firm_id = s.firm_id${scope}), 0)::bigint as lag`;

/** The NOT-YET-MEASURED column. `$1` = consumer name. Split out because wake_engine composes it
 *  into its own multi-counter statement while computing an exhausted count this module cannot
 *  (its retry cap is per SOURCE, read from clara.wake_engine_sources, not a module constant). */
export const FIRMS_UNCHECKPOINTED_COLUMN = firmsUncheckpointedColumn();

/** The BACKLOG column. `$1` = consumer name. Split out for the same reason
 *  `FIRMS_UNCHECKPOINTED_COLUMN` is: wake_engine composes it into its own multi-counter statement
 *  (its dead-letter halves are per-ledger and per-source, so it cannot take the whole set below)
 *  and until #617's follow-up it carried a hand-copied second literal of this text. One backlog
 *  definition across every relay consumer, or an operator is reading two different numbers under
 *  one name the day either copy moves. */
export const LAG_COLUMN = lagColumn();

/** The BACKLOG predicate over ONE clara.relay_dead_letters row, named once. `alias` qualifies the
 *  column — "" where the table is unaliased (the columns below), `"dl."` / `"tdl."` in
 *  wake_engine's aliased statement. */
export const deadLetterPending = (alias = "") => `${alias}status = 'pending'`;

/** The GIVEN-UP-ON predicate over ONE row: pending AND at or past THIS consumer's own cap. `cap`
 *  is the SQL yielding that cap — `$2` for a consumer whose cap is one module constant, and a
 *  per-SOURCE subquery for wake_engine, whose cap is a column (lib/wake-engine.mjs). Exhausted is
 *  defined as a SUBSET of pending here, in the one place, so no reader can drift into treating
 *  the two as siblings. */
export const deadLetterExhausted = (alias = "", cap = "$2") => `${deadLetterPending(alias)} and ${alias}attempt_count >= ${cap}`;

/** The five columns every relay consumer's health statement selects.
 *  `$1` = consumer name, `$2` = that consumer's OWN max attempts. Spine tables only
 *  (firm_event_seq / relay_checkpoints / relay_dead_letters, all 0005-era), so every consumer
 *  that documents itself as safe to call before its own migration stays safe. */
export const RELAY_CONSUMER_HEALTH_COLUMNS = `${LAG_COLUMN},
       (select count(*) from clara.relay_dead_letters where consumer = $1 and ${deadLetterPending()})::int as pending_dead_letters,
       ${FIRMS_UNCHECKPOINTED_COLUMN},
       (select count(*) from clara.relay_dead_letters
         where consumer = $1 and ${deadLetterExhausted()})::int as exhausted_dead_letters,
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
 * ONE FIRM's reading of the two relay columns above — the same three predicates, restricted to a
 * single firm instead of summed over the estate (see the header's per-firm note):
 *
 *   * `hasEvents`     — the firm has a `clara.firm_event_seq` row, i.e. it is in the not-yet-
 *                       measured column's outer relation at all.
 *   * `checkpointed`  — this consumer has a `clara.relay_checkpoints` row for it. So the firm
 *                       contributes to `firmsUncheckpointed` exactly when
 *                       `hasEvents && !checkpointed`, and to `firmsTracked` exactly when
 *                       `checkpointed` — the complement the estate counts state in aggregate.
 *   * `lag`           — what this firm contributes to the shared `lag` sum, which is why a
 *                       missing checkpoint still reports the firm's ENTIRE history here: that is
 *                       the ambiguity `firmsUncheckpointed` exists to resolve, not a bug.
 *
 * @param {{query: (sql: string, params?: any[]) => Promise<{rows: any[]}>}} client
 * @param {string} consumer consumer name, as it appears in relay_checkpoints
 * @param {string} firmId
 * @returns {Promise<{hasEvents:boolean, checkpointed:boolean, lag:number}>}
 */
export async function relayFirmCategory(client, consumer, firmId) {
  const r = await client.query(
    `select exists (select 1 from ${FIRM_STREAM} where ${ONE_FIRM}) as has_events,
            ${checkpointExists("$2")} as checkpointed,
            ${lagColumn(`\n                   where ${ONE_FIRM}`)}`,
    [consumer, firmId],
  );
  const row = r.rows[0];
  return { hasEvents: row.has_events, checkpointed: row.checkpointed, lag: Number(row.lag) };
}

/**
 * ONE dead-letter row's category, under the SAME predicates as the two dead-letter columns:
 *
 *   * `"absent"`    — no row for (consumer, event) at all. `clara.relay_dead_letters` is keyed
 *                     (consumer, event_id), so there is at most one row to classify.
 *   * `"resolved"`  — a row exists but has been redriven; it is in NEITHER count.
 *   * `"pending"`   — counted by `deadLetters.pending`, still inside its retry budget.
 *   * `"exhausted"` — counted by BOTH `deadLetters.pending` and `deadLetters.exhausted`, because
 *                     exhausted is a subset. Returned in place of "pending" because a row at the
 *                     cap is the strictly more specific answer, and a caller that wants the
 *                     backlog question answered is asking `!== "absent" && !== "resolved"`.
 *
 * `maxAttempts` keeps `$2` and the event id takes `$3` so the shared exhausted predicate is used
 * verbatim rather than renumbered — one text, two callers.
 *
 * @param {{query: (sql: string, params?: any[]) => Promise<{rows: any[], rowCount?: number}>}} client
 * @param {string} consumer
 * @param {string} eventId clara.domain_events id the dead letter is keyed to
 * @param {number} maxAttempts THIS consumer's own retry cap (the one its cycle compares against)
 * @returns {Promise<"absent"|"resolved"|"pending"|"exhausted">}
 */
export async function deadLetterCategory(client, consumer, eventId, maxAttempts) {
  const r = await client.query(
    `select ${deadLetterPending()} as pending, ${deadLetterExhausted()} as exhausted
       from clara.relay_dead_letters where consumer = $1 and event_id = $3`,
    [consumer, maxAttempts, eventId],
  );
  return deadLetterCategoryFromRow(r.rows[0]);
}

/**
 * Map a row carrying the two dead-letter predicates above (`pending`, `exhausted`) onto the
 * category, or `undefined`/absence onto `"absent"`. A row mapper for the same reason
 * `relayConsumerCategories` is one: wake_engine's cap is a per-SOURCE column rather than `$2`
 * (lib/wake-engine.mjs), so it composes its own statement — and must still land on ONE
 * classification of the four, not a second opinion about what "exhausted" outranks.
 * @param {{pending:boolean, exhausted:boolean}|undefined} row
 * @returns {"absent"|"resolved"|"pending"|"exhausted"}
 */
export function deadLetterCategoryFromRow(row) {
  if (!row) return "absent";
  return row.exhausted ? "exhausted" : row.pending ? "pending" : "resolved";
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
