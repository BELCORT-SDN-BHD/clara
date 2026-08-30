// The bank_agent event-producer belt (Gate G1 PR-2b; g1-wake-engine-design.md §1.1/§3.6,
// bank-agency-design.md §3.6 "The clock", bank-agency-annexes-1-mechanics.md's reason-to-action
// table). bank_agent is the wake_outbox carrier (design §1.2): a producer's only job is to
// append a CLIENT-scoped `bank.agent_due` domain event carrying `bank_account_id` in the
// payload — everything downstream (routing, drain, wake_intents, held agent_tasks(kind='wake'))
// is already generic and untouched by this file. #437 shipped the consumer body (bankAgent_v1)
// and measured that nothing has ever appended this event (PROGRESS.md 2026-08-30 noon: "neither
// source has a PRODUCER"). This belt is that missing half, for THIS source.
//
// TWO DB SURFACES ARE FEATURE-DETECTED, PER CYCLE, NEVER CACHED (the reconciler-fa.mjs/
// wiki-projection.mjs:321-346 R5 idiom, cloned) — and, since the G1 PR-2b fold (Codex r1 review
// of #449, MEDIUM-4), checked for exact SHAPE via pg-fn-surface.mjs, not merely exact NAME:
//   clara.bank_agent_run_due(uuid)      — F-A3's own DOMAIN due-predicate (design §1.1: "a new
//                                          source ships its own clara.<source>_run_due(p_client
//                                          uuid) returns jsonb"; design §5: "the ONLY things
//                                          missing are (1) bank_agent_run_due... F-A3's own
//                                          obligation, unblocked by this gate").
//   clara.emit_bank_agent_due(uuid,uuid,text,text) — THIS gate's own emission door
//                                          (UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql), needed
//                                          because clara._append_event is deliberately ungranted
//                                          to clara_runtime (0005 §D's own header comment:
//                                          "callable only inside definer writers").
// NEITHER exists on `main` at the moment this belt ships; BOTH must exist before it does
// anything. ABSENT (to_regprocedure itself null) -> a clean {dormant:true} no-op, the SAME
// runtime-image-first ceremony order reconciler-fa.mjs and reconciler-adjustments.mjs already
// establish. PRESENT BUT THE WRONG SHAPE (a same-name procedure, a text-returning function, a
// SETOF where a scalar is expected — MEDIUM-4) -> a belt FAILURE (bankAgentOk:false), never
// dormancy: a genuinely broken surface must not silently park the cadence.
//
// THE DUE PREDICATE'S CONTRACT THIS BELT ASSUMES, WIDENED AT THE G1 PR-2b FOLD (HIGH-1/HIGH-3,
// Codex r1 review of #449): `bank_agent_run_due(p_client uuid) returns jsonb` answers
// `{"due":boolean,"reason":<code>,"bank_account_id":<uuid|absent>,"due_key":<text|absent>}`.
// `reason` is the ONLY discriminator this belt switches on — `due` is read as a consistency
// check, never the primary branch (a design departure from the pre-fold cut, which branched on
// `due` alone and could not express bank-agency-annexes-1-mechanics.md's own closed reason
// table). THE CLOSED SWITCH, read from that table verbatim (bank-agency-annexes-1-mechanics.md
// §D.0's tail) and enforced here so a reason the table does not name is a loud, counted failure
// rather than a silent no-op or — worse — a silent EMIT:
//   'unmatched_lines' | 'reconcilable' | 'retry_later'  -> EMIT (due:true, needs bank_account_id
//        + due_key)
//   'chase_statement'                                    -> NOTIFY, never emit. No door reachable
//        by clara_runtime exists for this yet (measured: no clara_runtime-granted notification
//        writer in this codebase serves this purpose) — DEFERRED to F-A3's own predicate PR,
//        which is who builds the first real caller of this branch; this belt proves the branch
//        fires and appends ZERO events for it, never more.
//   'purpose_unconsented' | 'held' | 'nothing_due'       -> nothing (due:false, the ordinary
//        quiet case)
//   anything else                                        -> a COUNTED FAILURE (bankAgentFailed),
//        no event, no notification — an unrecognised reason is a wiring drift between this
//        belt and F-A3's predicate, and it must be loud (the reconciler-fa.mjs:114-130
//        "ANOMALOUS SHAPE, LOUD" precedent, sharpened from a log line to a counted failure
//        because a silently-added tenth reason is exactly the shape a real HIGH would take).
//
// ONE ASK PER CLIENT PER CYCLE, NO CHASE-LOOP (unchanged from the pre-fold cut): appending an
// event does no WORK itself (the consumer and its dispatched workflow do the actual work,
// asynchronously, later), so nothing about a client's due-ness changes between two calls in the
// SAME cycle — chasing would either spin forever on an unchanged due:true answer or append the
// SAME (account, due_key) twice in one tick (which the DB claim below would correctly refuse,
// but at the cost of a wasted call every cycle). A second due occurrence for the same client is
// picked up on a LATER cycle, one at a time.
//
// IDEMPOTENCY IS NOW DB-OWNED (HIGH-3, Codex r1 review of #449; REPLACES the pre-fold cut's own
// runtime-side check-then-write, which was a genuine two-round-trip TOCTOU race between two
// runtime connections). emit_bank_agent_due atomically claims
// UNIQUE(client_id, bank_account_id, due_key) BEFORE appending, in the SAME statement as the
// append — this belt calls it UNCONDITIONALLY on an emit-worthy reason and trusts its own
// {appended, reason} reply; there is no runtime-side pre-check left to race. `appended:false`
// (reason `already_claimed`) is counted as `bankAgentSkipped`, exactly the outcome the pre-fold
// cut's own runtime check produced, just without the race.
//
// PER-CLIENT ERROR ISOLATION (the reconciler-fa.mjs precedent): a poisoned client's due-probe or
// emit-call throw is counted (bankAgentFailed) and the belt moves on to the next client — it
// never flips bankAgentOk, which gates only the leader's cadence. bankAgentOk goes false ONLY
// for a WHOLE-BELT failure (client discovery itself threw, a surface check came back 'invalid',
// or a surface/enabled probe itself threw).
//
// wake_engine_sources.enabled IS THE FIRST GATE, read fresh every cycle — a disabled source
// appends literally nothing (design §3's per-source kill switch, applied here at the producer
// end exactly as reconciler-close-prep.mjs applies it at its own). An absent registry row reads
// as disabled too.

import { checkFunctionSurface } from "./pg-fn-surface.mjs";

const EMIT_REASONS = new Set(["unmatched_lines", "reconcilable", "retry_later"]);
const NOTIFY_REASONS = new Set(["chase_statement"]);
const QUIET_REASONS = new Set(["purpose_unconsented", "held", "nothing_due"]);

/** The closed reason->action switch (HIGH-1, bank-agency-annexes-1-mechanics.md §D.0's tail).
 *  PURE — no I/O — so it is unit-testable on its own and the belt below is thin glue over it. */
export function classifyBankDueReason(due) {
  const reason = due?.reason;
  if (typeof reason !== "string" || reason.length === 0) {
    return { action: "malformed", detail: `reason missing or not a string (got ${JSON.stringify(due)})` };
  }
  if (EMIT_REASONS.has(reason)) {
    if (due?.due !== true) return { action: "malformed", detail: `reason '${reason}' requires due:true (got ${JSON.stringify(due)})` };
    if (!due?.bank_account_id) return { action: "malformed", detail: `reason '${reason}' requires bank_account_id (got ${JSON.stringify(due)})` };
    if (!due?.due_key) return { action: "malformed", detail: `reason '${reason}' requires due_key (got ${JSON.stringify(due)})` };
    return { action: "emit", reason };
  }
  if (NOTIFY_REASONS.has(reason)) {
    return { action: "notify_deferred", reason };
  }
  if (QUIET_REASONS.has(reason)) {
    if (due?.due !== false) return { action: "malformed", detail: `reason '${reason}' requires due:false (got ${JSON.stringify(due)})` };
    return { action: "quiet", reason };
  }
  return { action: "malformed", detail: `unrecognised reason '${reason}' — not in the closed reason table (bank-agency-annexes-1-mechanics.md §D.0)` };
}

/** True iff wake_engine_sources names bank_agent ENABLED right now. An absent row reads as
 *  disabled (fail-closed). */
async function isBankAgentSourceEnabled(client) {
  const r = await client.query(
    "select enabled from clara.wake_engine_sources where source_key = 'bank_agent' and carrier = 'wake_outbox'",
  );
  return r.rows[0]?.enabled === true;
}

/** Active client ids, stably ordered (the reconciler-fa.mjs/-adjustments.mjs precedent
 *  verbatim; 0008 grants clara_runtime the read). Due-ness is entirely bank_agent_run_due's
 *  job — this belt asks every active client and lets the DB say no. */
async function activeClientIds(client) {
  const r = await client.query("select id from clara.clients where status = 'active' order by id");
  return r.rows.map((row) => String(row.id));
}

/**
 * Produce at most one `bank.agent_due` event per active client per cycle, when
 * clara.bank_agent_run_due names an emit-worthy reason, DB-claimed via
 * clara.emit_bank_agent_due. Disabled source or either absent/invalid DB surface both return a
 * clean no-op (absent) or a counted failure (invalid — MEDIUM-4).
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 */
export async function produceBankAgentWakes(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const out = {
    bankAgentOk: true,
    bankAgentExamined: 0,
    bankAgentAppended: 0,
    bankAgentSkipped: 0,
    bankAgentNotifyDeferred: 0,
    bankAgentFailed: 0,
    dormant: false,
  };

  let dueSurface;
  let emitSurface;
  try {
    dueSurface = await checkFunctionSurface(client, { signature: "clara.bank_agent_run_due(uuid)", returnType: "jsonb" });
    emitSurface = await checkFunctionSurface(client, { signature: "clara.emit_bank_agent_due(uuid,uuid,text,text)", returnType: "jsonb" });
  } catch (err) {
    log(`[reconcile] bank_agent surface probe error: ${err?.message ?? err}`);
    return { ...out, bankAgentOk: false };
  }
  if (dueSurface.status === "invalid") {
    log(`[reconcile] bank_agent due-surface present but INVALID shape: ${JSON.stringify(dueSurface.detail)}`);
    return { ...out, bankAgentOk: false };
  }
  if (emitSurface.status === "invalid") {
    log(`[reconcile] bank_agent emit-surface present but INVALID shape: ${JSON.stringify(emitSurface.detail)}`);
    return { ...out, bankAgentOk: false };
  }
  if (dueSurface.status === "absent" || emitSurface.status === "absent") {
    return { ...out, dormant: true };
  }

  let enabled;
  try {
    enabled = await isBankAgentSourceEnabled(client);
  } catch (err) {
    log(`[reconcile] bank_agent source-enabled probe error: ${err?.message ?? err}`);
    return { ...out, bankAgentOk: false };
  }
  if (!enabled) {
    return out; // the disabled-source law: zero appends, and this is not a belt FAILURE
  }

  let ids;
  try {
    ids = await activeClientIds(client);
  } catch (err) {
    log(`[reconcile] bank_agent client discovery error: ${err?.message ?? err}`);
    return { ...out, bankAgentOk: false };
  }

  for (const clientId of ids) {
    out.bankAgentExamined += 1;
    try {
      const dueRow = (await client.query("select clara.bank_agent_run_due($1) as r", [clientId])).rows[0]?.r;
      const due = dueRow ?? {};
      const verdict = classifyBankDueReason(due);
      if (verdict.action === "quiet") {
        continue;
      }
      if (verdict.action === "notify_deferred") {
        // HIGH-1: no clara_runtime-reachable notification door exists yet for chase_statement —
        // deferred to F-A3's own predicate PR (this belt's own module header names the search
        // that came up empty). Proven: this branch fires, and it appends NOTHING.
        out.bankAgentNotifyDeferred += 1;
        log(`[reconcile] bank_agent client=${clientId} reason=chase_statement — notification DEFERRED (no runtime-reachable door yet, F-A3's own obligation), zero events`);
        continue;
      }
      if (verdict.action === "malformed") {
        out.bankAgentFailed += 1;
        log(`[reconcile] bank_agent client=${clientId} malformed due-probe reply: ${verdict.detail}`);
        continue;
      }
      // verdict.action === "emit"
      const bankAccountId = due.bank_account_id;
      const dueKey = due.due_key;
      const reply = (await client.query("select clara.emit_bank_agent_due($1, $2, $3, $4) as r", [clientId, bankAccountId, dueKey, verdict.reason])).rows[0]?.r;
      if (reply?.appended === true) {
        out.bankAgentAppended += 1;
        log(`[reconcile] bank_agent due client=${clientId} account=${bankAccountId} reason=${verdict.reason} due_key=${dueKey} seq=${reply.seq}`);
      } else if (reply?.appended === false) {
        out.bankAgentSkipped += 1;
        log(`[reconcile] bank_agent client=${clientId} account=${bankAccountId} due_key=${dueKey} already claimed — skipped`);
      } else {
        out.bankAgentFailed += 1;
        log(`[reconcile] bank_agent client=${clientId} emit_bank_agent_due returned an unexpected shape (expected {appended:boolean,...}, got ${JSON.stringify(reply)})`);
      }
    } catch (err) {
      out.bankAgentFailed += 1;
      log(`[reconcile] bank_agent client=${clientId} error: ${err?.message ?? err}`);
    }
  }

  log(`[reconcile] bank_agent examined=${out.bankAgentExamined} appended=${out.bankAgentAppended} skipped=${out.bankAgentSkipped} notifyDeferred=${out.bankAgentNotifyDeferred} failed=${out.bankAgentFailed}`);
  return out;
}
