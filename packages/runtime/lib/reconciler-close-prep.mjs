// The close_prep task-producer belt (Gate G1 PR-2b; g1-wake-engine-design.md §1.1/§5, the
// "close_prep is registered but DEFAULT-DISABLED at ship" section). close_prep is the
// direct_queue carrier (design §1.2): no domain event, no wake_intents hop — a queued
// clara.agent_tasks(kind='close_prep') row IS the whole handoff to the wake engine consumer
// (wake-engine.mjs's own processDirectQueueSource). #437 shipped the consumer body (closePrep_v1)
// and measured that nothing has ever inserted such a row (PROGRESS.md 2026-08-30 noon: "neither
// source has a PRODUCER"). This belt is that missing half, for THIS source.
//
// TWO DB SURFACES ARE FEATURE-DETECTED, PER CYCLE, NEVER CACHED (the reconciler-fa.mjs/
// -adjustments.mjs idiom, cloned verbatim) — and, since the G1 PR-2b fold (Codex r1 review of
// #449, MEDIUM-4), checked for exact SHAPE via pg-fn-surface.mjs, not merely exact NAME:
//   clara.close_prep_due()                      — already shipped in 0138 (F-A4 PR-1c), AHEAD of
//                                                  this belt, the reverse of FA/ADJ's own
//                                                  runtime-image-first ceremony order — but the
//                                                  probe is kept anyway, defensively, exactly as
//                                                  reconciler-render.mjs/-sandbox.mjs keep theirs
//                                                  even once their own migration is already live.
//   clara.claim_close_prep_task(uuid,uuid,uuid,text) — THIS gate's own atomic claim-and-insert
//                                                  door (UNNUMBERED_g1_pr_2b_bank_agent_due_
//                                                  emit.sql), replacing this PR's own first-cut
//                                                  raw `insert into clara.agent_tasks` from the
//                                                  runtime (HIGH-3, Codex r1).
// ABSENT (to_regprocedure itself null) -> a clean {dormant:true} no-op. PRESENT BUT THE WRONG
// SHAPE (a same-name procedure, a scalar where close_prep_due() must be SETOF, a text-returning
// claim door) -> a belt FAILURE (closePrepOk:false), never dormancy (MEDIUM-4).
//
// close_prep_due() IS A SET-RETURNING ORACLE (unlike FA/ADJ's per-client scalar): 0138 already
// scans every open/reopened fiscal year across every firm's every active client in ONE call, and
// it ALREADY carries its own one-book-day idempotency window (0138's own comment: "keyed on the
// CLIENT... because wake_credentials carries a client but no fiscal year"). This belt therefore
// needs NO client loop and NO per-client chase (contrast reconciler-fa.mjs) — it asks ONCE per
// cycle, and for each row the oracle names, calls claim_close_prep_task UNCONDITIONALLY.
//
// IDEMPOTENCY IS NOW DB-OWNED (HIGH-3, Codex r1 review of #449; REPLACES the pre-fold cut's own
// runtime-side check-then-insert, a genuine two-round-trip TOCTOU race). claim_close_prep_task
// atomically claims UNIQUE(fiscal_year_id) — reclaiming a stale, terminal-task row in the SAME
// call when needed (a reopened FY, 0138's own admission law, must not stay stuck behind a
// resolved claim) — before inserting the queued task, all in one statement/transaction. This
// belt calls it UNCONDITIONALLY for every due row and trusts its own {appended, reason} reply;
// there is no runtime-side pre-check left to race.
//
// PER-ROW ERROR ISOLATION (the reconciler-fa.mjs precedent): a poisoned row's claim-call throw
// is counted (closePrepFailed) and the belt moves on to the next row — it never flips
// closePrepOk, which gates only the leader's cadence. closePrepOk goes false ONLY for a
// WHOLE-BELT failure (the oracle call itself threw, a surface check came back 'invalid', or the
// source-enabled lookup threw).
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
//
// TWO INDEPENDENT DB-OWNED WALLS (FIND-6, opus r1 review of #449, STANDS AS RULED / widened):
// claim_close_prep_task now enforces BOTH close_prep_fy_claims's own UNIQUE(fiscal_year_id) —
// at most one live CLAIM per fiscal year — AND a second, client-scoped wall,
// uq_agent_task_one_live_close_prep on clara.agent_tasks itself — at most one LIVE close_prep
// TASK per client, across every fiscal year at once. The advisory relay-leader lock
// (leader.mjs's own acquireLeaderLock) is the reason two producer ticks can never race each
// other in production TODAY — this loop is single-leader by construction — so this second wall
// is defense-in-depth against a future where that operational guarantee no longer holds (a
// second reconciler process, a manual claim_close_prep_task call from an ops surface), not a
// wall this belt's own single-process behaviour currently needs to survive a real race against.
// A client-level refusal surfaces as {appended:false, reason:'client_has_live_close_prep'} —
// counted identically to `already_claimed` below (closePrepSkipped): from this belt's own point
// of view both are "nothing to queue this cycle," and the oracle will re-offer the same
// fiscal-year row on a later tick once the client's other live task resolves.

import { checkFunctionSurface } from "./pg-fn-surface.mjs";
import { TaxonomyHaltError } from "./relay.mjs";

function closePrepModelSnapshot() {
  return process.env.CLARA_CLOSE_PREP_MODEL || process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";
}

/** True iff wake_engine_sources names close_prep ENABLED right now. An absent row reads as
 *  disabled (fail-closed — never append on an ambiguous "not registered yet"). */
async function isCloseSourceEnabled(client) {
  const r = await client.query(
    "select enabled from clara.wake_engine_sources where source_key = 'close_prep' and carrier = 'direct_queue'",
  );
  return r.rows[0]?.enabled === true;
}

/**
 * Produce ONE close_prep task per (firm, client, fiscal_year) close_prep_due() names as due,
 * atomically claimed via clara.claim_close_prep_task. Disabled source or either absent/invalid
 * DB surface both return a clean no-op (absent) or a counted failure (invalid — MEDIUM-4).
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

  let dueSurface;
  let claimSurface;
  try {
    dueSurface = await checkFunctionSurface(client, { signature: "clara.close_prep_due()", returnType: "record", returnsSet: true });
    claimSurface = await checkFunctionSurface(client, { signature: "clara.claim_close_prep_task(uuid,uuid,uuid,text)", returnType: "jsonb" });
  } catch (err) {
    // FIND-9 (opus r1 review of #449): a HALT must reach the leader even through a per-belt
    // catch (the reconciler-fa.mjs:82-87 idiom, applied to EVERY catch in this belt).
    if (err instanceof TaxonomyHaltError || err?.halt) throw err;
    log(`[reconcile] close_prep surface probe error: ${err?.message ?? err}`);
    return { ...out, closePrepOk: false };
  }
  if (dueSurface.status === "invalid") {
    log(`[reconcile] close_prep due-surface present but INVALID shape: ${JSON.stringify(dueSurface.detail)}`);
    return { ...out, closePrepOk: false };
  }
  if (claimSurface.status === "invalid") {
    log(`[reconcile] close_prep claim-surface present but INVALID shape: ${JSON.stringify(claimSurface.detail)}`);
    return { ...out, closePrepOk: false };
  }
  if (dueSurface.status === "absent" || claimSurface.status === "absent") {
    return { ...out, dormant: true };
  }

  let enabled;
  try {
    enabled = await isCloseSourceEnabled(client);
  } catch (err) {
    if (err instanceof TaxonomyHaltError || err?.halt) throw err; // FIND-9
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
    if (err instanceof TaxonomyHaltError || err?.halt) throw err; // FIND-9
    log(`[reconcile] close_prep due-oracle error: ${err?.message ?? err}`);
    return { ...out, closePrepOk: false };
  }

  const modelSnapshot = closePrepModelSnapshot();
  for (const row of rows) {
    out.closePrepExamined += 1;
    try {
      const reply = (await client.query("select clara.claim_close_prep_task($1, $2, $3, $4) as r", [row.firm_id, row.client_id, row.fiscal_year_id, modelSnapshot])).rows[0]?.r;
      if (reply?.appended === true) {
        out.closePrepQueued += 1;
        log(`[reconcile] close_prep queued client=${row.client_id} fiscal_year=${row.fiscal_year_id} reason=${row.reason} task=${reply.task_id}`);
      } else if (reply?.appended === false) {
        // FIND-6: `already_claimed` (the fiscal-year wall) and `client_has_live_close_prep`
        // (the NEW client-scoped wall) are counted identically — from this belt's own point of
        // view both mean "nothing to queue this cycle," and the reason is still named in the log.
        out.closePrepSkipped += 1;
        log(`[reconcile] close_prep client=${row.client_id} fiscal_year=${row.fiscal_year_id} skipped — reason=${reply.reason ?? "unknown"}`);
      } else {
        out.closePrepFailed += 1;
        log(`[reconcile] close_prep client=${row.client_id} claim_close_prep_task returned an unexpected shape (expected {appended:boolean,...}, got ${JSON.stringify(reply)})`);
      }
    } catch (err) {
      if (err instanceof TaxonomyHaltError || err?.halt) throw err; // FIND-9
      out.closePrepFailed += 1;
      log(`[reconcile] close_prep claim client=${row.client_id} error: ${err?.message ?? err}`);
    }
  }

  log(`[reconcile] close_prep examined=${out.closePrepExamined} queued=${out.closePrepQueued} skipped=${out.closePrepSkipped} failed=${out.closePrepFailed}`);
  return out;
}
