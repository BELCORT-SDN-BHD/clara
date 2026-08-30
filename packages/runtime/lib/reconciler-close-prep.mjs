// The close_prep task-producer belt (Gate G1 PR-2b; g1-wake-engine-design.md §1.1/§5, the
// "close_prep is registered but DEFAULT-DISABLED at ship" section). close_prep is the
// direct_queue carrier (design §1.2): no domain event, no wake_intents hop — a queued
// clara.agent_tasks(kind='close_prep') row IS the whole handoff to the wake engine consumer
// (wake-engine.mjs's own processDirectQueueSource). #437 shipped the consumer body (closePrep_v1)
// and measured that nothing has ever inserted such a row (PROGRESS.md 2026-08-30 noon: "neither
// source has a PRODUCER"). This belt is that missing half, for THIS source.
//
// FEATURE-DETECT, EXACT SIGNATURE, PER CYCLE (the reconciler-fa.mjs/-adjustments.mjs idiom,
// cloned verbatim). clara.close_prep_due() already shipped in 0138 (F-A4 PR-1c) — AHEAD of this
// belt, the reverse of FA/ADJ's own runtime-image-first ceremony order — but the probe is kept
// anyway, defensively, exactly as reconciler-render.mjs/-sandbox.mjs keep theirs even once their
// own migration is already live: a runtime image that somehow ships ahead of a future signature
// change to this function boots dormant rather than throwing.
//
// close_prep_due() IS A SET-RETURNING ORACLE (unlike FA/ADJ's per-client scalar): 0138 already
// scans every open/reopened fiscal year across every firm's every active client in ONE call, and
// it ALREADY carries its own one-book-day idempotency window (0138's own comment: "keyed on the
// CLIENT... because wake_credentials carries a client but no fiscal year"). This belt therefore
// needs NO client loop and NO per-client chase (contrast reconciler-fa.mjs) — it asks ONCE per
// cycle, and for each row the oracle names, ensures at most one LIVE close_prep task exists for
// that client before inserting a new queued one.
//
// THIS BELT'S OWN IDEMPOTENCY LAYER IS A SEPARATE, NARROWER WINDOW than the oracle's. The
// oracle's one-book-day window is keyed on a MINTED wake_credentials ROW, which is written only
// once the wake engine actually CLAIMS and DISPATCHES the task (design §1.2b: the credential is
// minted by the dispatched workflow's own first step, never by the producer or the consumer).
// Two belt ticks inside the SAME leader poll interval (~2s), before any claim has happened, would
// therefore both see the SAME due row and both insert a SECOND queued task for the same client —
// the two-tick duplicate this PR's acceptance list names. The fix mirrors close_prep_due()'s own
// shape: before inserting, check for an existing NON-TERMINAL close_prep task for that client
// (status in queued/running/cancel_requested) and skip if one is already there. Single-leader
// (this belt runs only inside the ONE leader-lock-holding cycle) makes a plain check-then-insert
// race-free — no concurrent invocation of this belt can ever exist to race it.
//
// PER-ROW ERROR ISOLATION (the reconciler-fa.mjs precedent): a poisoned row's existence-check or
// insert throw is counted (closePrepFailed) and the belt moves on to the next row — it never
// flips closePrepOk, which gates only the leader's cadence. closePrepOk goes false ONLY for a
// WHOLE-BELT failure (the oracle call itself threw, or the source-enabled lookup threw).
//
// wake_engine_sources.enabled IS THE FIRST GATE, read fresh every cycle (never cached) — a
// disabled source must append literally NOTHING, per design §3 ("a source with enabled=false is
// never claimed, its held/queued rows accumulate visibly... re-enabling it resumes exactly where
// the checkpoint/queue left off"). Applied here at the PRODUCER end too: a disabled close_prep
// means this belt inserts zero rows, so nothing accumulates that the operator did not ask for.
// An ABSENT registry row (pre-registration, or a rig this migration has not reached) reads as
// disabled too — the fail-closed default a producer must have on an ambiguous "is this even
// wired up yet".
//
// model_snapshot IS AUDIT-ONLY. _tf_agent_task_insert's close_prep arm (0120:1482-1495) requires
// a non-blank model_snapshot, but no wake body ever reads agent_tasks.model_snapshot back —
// closePrep.v1.ts picks its own model from CLARA_CLOSE_PREP_MODEL / CLARA_CHAT_MODEL at run time
// (closePrep.v1.ts:76). This belt stamps the SAME env precedence so the audit column matches
// what the run will actually use, but the value is informational, never load-bearing.
//
// SHARED HEARTBEAT. Like every other sweeper in this family, this belt writes no heartbeat of
// its own — runReconcilerSweep beats 'reconciler' once per full cycle; this module is one more
// pass folded into that same beat.

function closePrepModelSnapshot() {
  return process.env.CLARA_CLOSE_PREP_MODEL || process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";
}

/** True iff clara.close_prep_due() exists — the EXACT signature, evaluated PER CYCLE, never
 *  cached at startup (the wiki-projection.mjs:321-346 R5 idiom). */
async function hasClosePrepDueSurface(client) {
  const r = await client.query("select to_regprocedure('clara.close_prep_due()') is not null as surface");
  return r.rows[0]?.surface === true;
}

/** True iff wake_engine_sources names close_prep ENABLED right now. An absent row reads as
 *  disabled (fail-closed — never append on an ambiguous "not registered yet"). */
async function isCloseSourceEnabled(client) {
  const r = await client.query(
    "select enabled from clara.wake_engine_sources where source_key = 'close_prep' and carrier = 'direct_queue'",
  );
  return r.rows[0]?.enabled === true;
}

/** True iff the client already carries a non-terminal close_prep task (queued/running/
 *  cancel_requested) — this belt's own idempotency layer, independent of close_prep_due()'s own
 *  1-book-day/wake_credentials window (see module header: that window only starts once the task
 *  is actually claimed, so two ticks before any claim would otherwise both insert). */
async function hasLiveClosePrepTask(client, clientId) {
  const r = await client.query(
    `select 1 from clara.agent_tasks
      where kind = 'close_prep' and client_id = $1 and status in ('queued','running','cancel_requested')
      limit 1`,
    [clientId],
  );
  return r.rowCount > 0;
}

/**
 * Produce ONE close_prep task per (firm, client, fiscal_year) close_prep_due() names as due,
 * skipping any client that already carries a live close_prep task. Disabled source or an absent
 * DB surface both return a clean no-op.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 */
export async function produceClosePrepTasks(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const out = {
    closePrepOk: true,
    closePrepExamined: 0,
    closePrepQueued: 0,
    closePrepSkipped: 0,
    closePrepFailed: 0,
    dormant: false,
  };

  let surface;
  try {
    surface = await hasClosePrepDueSurface(client);
  } catch (err) {
    log(`[reconcile] close_prep due-surface probe error: ${err?.message ?? err}`);
    return { ...out, closePrepOk: false };
  }
  if (!surface) {
    return { ...out, dormant: true };
  }

  let enabled;
  try {
    enabled = await isCloseSourceEnabled(client);
  } catch (err) {
    log(`[reconcile] close_prep source-enabled probe error: ${err?.message ?? err}`);
    return { ...out, closePrepOk: false };
  }
  if (!enabled) {
    return out; // the disabled-source law: zero appends, and this is not a belt FAILURE
  }

  let rows;
  try {
    rows = (await client.query("select firm_id, client_id, fiscal_year_id, ends_on, reason from clara.close_prep_due()")).rows;
  } catch (err) {
    log(`[reconcile] close_prep due-oracle error: ${err?.message ?? err}`);
    return { ...out, closePrepOk: false };
  }

  const modelSnapshot = closePrepModelSnapshot();
  for (const row of rows) {
    out.closePrepExamined += 1;
    try {
      if (await hasLiveClosePrepTask(client, row.client_id)) {
        out.closePrepSkipped += 1;
        continue;
      }
      await client.query(
        `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
           values ($1, $2, 'close_prep', 'queued', $3)`,
        [row.firm_id, row.client_id, modelSnapshot],
      );
      out.closePrepQueued += 1;
      log(`[reconcile] close_prep queued client=${row.client_id} fiscal_year=${row.fiscal_year_id} reason=${row.reason}`);
    } catch (err) {
      out.closePrepFailed += 1;
      log(`[reconcile] close_prep queue client=${row.client_id} error: ${err?.message ?? err}`);
    }
  }

  log(`[reconcile] close_prep examined=${out.closePrepExamined} queued=${out.closePrepQueued} skipped=${out.closePrepSkipped} failed=${out.closePrepFailed}`);
  return out;
}
