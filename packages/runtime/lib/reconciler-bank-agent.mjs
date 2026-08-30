// The bank_agent event-producer belt (Gate G1 PR-2b; g1-wake-engine-design.md §1.1/§3.6,
// bank-agency-design.md §3.6 "The clock"). bank_agent is the wake_outbox carrier (design §1.2):
// a producer's only job is to append a CLIENT-scoped `bank.agent_due` domain event carrying
// `bank_account_id` in the payload — everything downstream (routing, drain, wake_intents, held
// agent_tasks(kind='wake')) is already generic and untouched by this file. #437 shipped the
// consumer body (bankAgent_v1) and measured that nothing has ever appended this event
// (PROGRESS.md 2026-08-30 noon: "neither source has a PRODUCER"). This belt is that missing
// half, for THIS source.
//
// TWO DB SURFACES ARE FEATURE-DETECTED, PER CYCLE, NEVER CACHED (the reconciler-fa.mjs/
// wiki-projection.mjs:321-346 R5 idiom, cloned):
//   clara.bank_agent_run_due(uuid)      — F-A3's own DOMAIN due-predicate (design §1.1: "a new
//                                          source ships its own clara.<source>_run_due(p_client
//                                          uuid) returns jsonb"; design §5: "the ONLY things
//                                          missing are (1) bank_agent_run_due... F-A3's own
//                                          obligation, unblocked by this gate").
//   clara.emit_bank_agent_due(uuid,uuid,text) — THIS gate's own emission door
//                                          (UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql), needed
//                                          because clara._append_event is deliberately ungranted
//                                          to clara_runtime (0005 §D's own header comment:
//                                          "callable only inside definer writers").
// NEITHER exists on `main` at the moment this belt ships; BOTH must exist before it does
// anything. Absent either -> a clean {dormant:true} no-op, the SAME runtime-image-first ceremony
// order reconciler-fa.mjs and reconciler-adjustments.mjs already establish for a domain
// predicate that lands after the runtime image. This is a DELIBERATE, NAMED design choice
// recorded here (and in this PR's own report) rather than in the design doc, which does not ask
// for it: building a stand-in bank_agent_run_due inside THIS file would mean inventing F-A3's
// own domain judgement logic (what "due" means for a bank account — an unmatched line, a
// completable reconciliation, a missing statement past its expected date;
// bank-agency-design.md:315-326) inside a PR scoped to the producer PLUMBING, not the domain
// predicate. Feature-detection is the estate's own established answer to exactly this
// sequencing question, not a shortcut invented for this file.
//
// THE DUE PREDICATE'S CONTRACT THIS BELT ASSUMES (mirrored from depreciation_run_due's own
// shape, since bank_agent_run_due is explicitly built "to the depreciation_run_due idiom",
// bank-agency-design.md:315): `bank_agent_run_due(p_client uuid) returns jsonb` answering
// `{"due":false,"reason":<code>}` or `{"due":true,"bank_account_id":<uuid>,"reason":<code>}` —
// ONE due account per call, like FA's one period per call. UNLIKE FA, this belt does NOT
// chase-loop a client after a hit: appending an event does no WORK itself (the consumer and its
// dispatched workflow do the actual work, asynchronously, later), so nothing about a client's
// due-ness changes between two calls in the SAME cycle — chasing would either spin forever on an
// unchanged due:true answer, or (worse) append the SAME account twice in one tick. One ask per
// client per cycle is the right cadence; a second due account for the same client is picked up
// on a LATER cycle, one at a time.
//
// THIS BELT'S OWN IDEMPOTENCY IS INDEPENDENT OF THE PREDICATE'S OWN STATE (the two-tick cell
// this PR's acceptance list names): whatever bank_agent_run_due answers, this belt never appends
// a second live event for the same bank account while an earlier one is still unresolved.
// "Unresolved" is read POSITIVELY off the SAME carrier the wake engine consumer itself reads
// (wake-engine.mjs's readHeldWakeRows/processWakeOutboxFirm): a domain_events row of type
// bank.agent_due whose payload names this account, joined through wake_intents to an
// agent_tasks row whose status has not yet reached a terminal value (kind='wake': held/running/
// cancel_requested are the non-terminal states, 0133's own matrix). A crash between this check
// and the emit is fail-SAFE, never fail-duplicate: emit_bank_agent_due either committed (the
// next cycle's check sees it and skips) or it did not (nothing to skip; the next cycle emits
// fresh).
//
// PER-CLIENT ERROR ISOLATION (the reconciler-fa.mjs precedent): a poisoned client's due-probe or
// emit-call throw is counted (bankAgentFailed) and the belt moves on to the next client — it
// never flips bankAgentOk, which gates only the leader's cadence. bankAgentOk goes false ONLY
// for a WHOLE-BELT failure (client discovery itself threw, or a surface/enabled probe threw).
//
// wake_engine_sources.enabled IS THE FIRST GATE, read fresh every cycle — a disabled source
// appends literally nothing (design §3's per-source kill switch, applied here at the producer
// end exactly as reconciler-close-prep.mjs applies it at its own). An absent registry row reads
// as disabled too.

/** True iff clara.bank_agent_run_due(uuid) exists — the EXACT signature, per cycle. Absent is
 *  F-A3's own obligation not yet landed (design §5) — a clean, expected, silent dormancy, never
 *  a failure. */
async function hasBankAgentRunDueSurface(client) {
  const r = await client.query("select to_regprocedure('clara.bank_agent_run_due(uuid)') is not null as surface");
  return r.rows[0]?.surface === true;
}

/** True iff clara.emit_bank_agent_due(uuid,uuid,text) exists — THIS gate's own emission door.
 *  Feature-detected for the same reason every other belt in this family detects its own DB
 *  surface: this runtime image and its migration are not guaranteed to land in the same
 *  ceremony window. */
async function hasEmitBankAgentDueSurface(client) {
  const r = await client.query("select to_regprocedure('clara.emit_bank_agent_due(uuid,uuid,text)') is not null as surface");
  return r.rows[0]?.surface === true;
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

/** True iff a LIVE (unresolved) bank.agent_due event already exists for this exact bank account —
 *  this belt's own idempotency layer, read positively off the same carrier the wake engine
 *  consumer itself reads (domain_events -> wake_intents -> agent_tasks), but LEFT-joined all the
 *  way from the event: the router/drain pipeline (relay.mjs/drain.mjs) that turns a domain event
 *  into a held agent_tasks row runs on its OWN leader-cycle phase, separate from and AFTER this
 *  belt's own emission call in the SAME cycle (leader.mjs: routing, then drain, then the
 *  reconciler sweep this belt lives in) — so a domain_events row this belt JUST appended has, for
 *  a real window, no wake_intents row yet at all. An INNER join through wake_intents/agent_tasks
 *  would see NOTHING during that window and let a second tick emit a SECOND event for the same
 *  account before the first is even routed — exactly the two-tick duplicate this check exists to
 *  prevent (measured empirically while building this belt's own test, not assumed). The event is
 *  therefore "live" when it has NO derived task yet (not yet routed/drained — definitely still
 *  unresolved) OR its derived wake task's status has not yet reached a terminal value (held/
 *  running/cancel_requested — 0133's matrix). completed/failed/cancelled are resolved and no
 *  longer block a fresh due-emission for the same account. */
async function hasLiveBankAgentDueEvent(client, bankAccountId) {
  const r = await client.query(
    `select 1
       from clara.domain_events de
       left join clara.wake_intents wi on wi.event_id = de.id
       left join clara.agent_tasks at on at.origin_intent_id = wi.id and at.kind = 'wake'
      where de.event_type = 'bank.agent_due'
        and de.payload ->> 'bank_account_id' = $1
        and (at.id is null or at.status in ('held','running','cancel_requested'))
      limit 1`,
    [bankAccountId],
  );
  return r.rowCount > 0;
}

/**
 * Produce at most one `bank.agent_due` event per active client per cycle, when
 * clara.bank_agent_run_due says one is due and no live (unresolved) event already exists for
 * the account it names. Disabled source or either absent DB surface both return a clean no-op.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 */
export async function produceBankAgentWakes(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const out = {
    bankAgentOk: true,
    bankAgentExamined: 0,
    bankAgentAppended: 0,
    bankAgentSkipped: 0,
    bankAgentFailed: 0,
    dormant: false,
  };

  let dueSurface;
  let emitSurface;
  try {
    dueSurface = await hasBankAgentRunDueSurface(client);
    emitSurface = await hasEmitBankAgentDueSurface(client);
  } catch (err) {
    log(`[reconcile] bank_agent surface probe error: ${err?.message ?? err}`);
    return { ...out, bankAgentOk: false };
  }
  if (!dueSurface || !emitSurface) {
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
      if (due?.due !== true) {
        // ANOMALOUS SHAPE, LOUD (the reconciler-fa.mjs:114-130 precedent). due:false is the
        // ordinary "nothing to do" case and stays quiet; any OTHER shape is named rather than
        // silently treated as not-due.
        if (due?.due !== false) {
          log(`[reconcile] bank_agent client=${clientId} due-probe returned an unexpected shape (expected {due:boolean,...}, got ${JSON.stringify(dueRow)}) — treating as not-due this cycle`);
        }
        continue;
      }
      const bankAccountId = due.bank_account_id;
      if (!bankAccountId) {
        log(`[reconcile] bank_agent client=${clientId} due:true carried no bank_account_id (got ${JSON.stringify(dueRow)}) — refusing to emit an unaddressed event`);
        continue;
      }
      if (await hasLiveBankAgentDueEvent(client, bankAccountId)) {
        out.bankAgentSkipped += 1;
        continue;
      }
      await client.query("select clara.emit_bank_agent_due($1, $2, $3)", [clientId, bankAccountId, due.reason ?? null]);
      out.bankAgentAppended += 1;
      log(`[reconcile] bank_agent due client=${clientId} account=${bankAccountId} reason=${due.reason ?? "?"}`);
    } catch (err) {
      out.bankAgentFailed += 1;
      log(`[reconcile] bank_agent client=${clientId} error: ${err?.message ?? err}`);
    }
  }

  log(`[reconcile] bank_agent examined=${out.bankAgentExamined} appended=${out.bankAgentAppended} skipped=${out.bankAgentSkipped} failed=${out.bankAgentFailed}`);
  return out;
}
