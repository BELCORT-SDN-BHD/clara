// G1 PR-2a -- shared fixture CORE (NOT a test file: the name does not end in `.test.mjs`, so
// `node --test` ignores it).
//
// WHY THIS MODULE EXISTS AND WHY IT IS SHARED. G1 PR-2a binds every bank_agent credential to a
// live wake task (the migration's §E) and gates every bank act on that task (§F). A bank_agent
// credential minted out of thin air therefore stops existing: `mint_wake_credential('bank_agent',
// ...)` now REFUSES with bank_agent_task_absent unless the firm/client has exactly one live
// wake task. That is the wall, and it means every battery that drives a bank wake verb has to
// build the producer's own artefacts first. Rather than let each battery grow its own version of
// that chain (and drift), the chain lives here once and f-a3-pr1b-wake-fixtures.mjs's mintCred
// calls it -- the "wall implies fixtures" law, applied at one seam.
//
// WHAT THE CHAIN IS, and it is the REAL producer shape rather than a shortcut: a client-scoped
// `bank.agent_due` domain event whose payload carries bank_account_id (#437's first producer
// contract, found by a RED), a wake_intents row at the ACTIVE taxonomy version with the
// registry's own decision, the held agent_tasks(kind='wake') row drain.mjs would project from it,
// and the held->running claim the engine would make. Nothing here is hand-stamped past what the
// database's own derivation triggers already do: _tf_stamp_wake_intent derives firm/seq/type from
// the event, and _tf_agent_task_insert derives firm/client from the intent's event.

import { rootQuery, roleQuery, ROLES } from "./rig-helpers.mjs";

/** True iff G1 PR-2a's gate is applied. Every consumer branches on THIS, never on a migration
 *  number or filename -- a battery that gated on a number would go quietly false the day the
 *  number was claimed at merge. Probed by EXACT SIGNATURE (law 3: a bare name is a projection of
 *  the function, not the function). */
export async function hasG1Pr2a() {
  const r = await rootQuery(
    "select to_regprocedure('clara._bank_wake_task_gate(text,uuid,boolean,boolean)') as g");
  return r.rows[0].g != null;
}

/** The producing domain event: client-scoped, carrying bank_account_id. Returns its uuid. */
export async function appendBankAgentDueEvent({ firm, client, bankAccount }) {
  const seq = (await rootQuery(
    "select clara._append_event($1,'bank.agent_due',$2,null,null,null,null,null,null,$3::jsonb) as seq",
    [firm, client, JSON.stringify(bankAccount == null ? {} : { bank_account_id: bankAccount })],
  )).rows[0].seq;
  const r = await rootQuery(
    "select id from clara.domain_events where firm_id = $1 and seq = $2", [firm, seq]);
  if (!r.rowCount) throw new Error("appendBankAgentDueEvent: the event did not land");
  return r.rows[0].id;
}

/** The whole producer chain, ending at a task in `status`. Returns { eventId, intentId, taskId }.
 *  `bankAccount: null` deliberately builds a task whose event carries NO account -- the shape
 *  §F refuses as wake_task_account_unbound, and the only way to drill that refusal is to be able
 *  to construct it. */
export async function makeBankWakeTask({ firm, client, bankAccount, status = "running" }) {
  const eventId = await appendBankAgentDueEvent({ firm, client, bankAccount });
  const decision = (await rootQuery(
    "select t.decision from clara.trigger_taxonomy t where t.event_type='bank.agent_due' and t.version=(select version from clara.taxonomy_active)")).rows[0]?.decision;
  if (!decision) throw new Error("makeBankWakeTask: bank.agent_due is not registered in the active taxonomy");
  const intentId = (await roleQuery(
    ROLES.runtime,
    "insert into clara.wake_intents (event_id, decision, taxonomy_version) values ($1, $2, (select version from clara.taxonomy_active)) returning id",
    [eventId, decision],
  )).rows[0].id;
  const taskId = (await rootQuery(
    "insert into clara.agent_tasks (firm_id, kind, status, origin_intent_id) values ($1,'wake','held',$2) returning id",
    [firm, intentId],
  )).rows[0].id;
  if (status !== "held") {
    // held -> running is the engine's own claim leg (0133's matrix delta). Anything past that is
    // driven step by step so the transition trigger adjudicates each hop, exactly as it would in
    // production -- never a direct jump the matrix would refuse.
    await rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
    if (status !== "running") {
      // running -> cancelled is deliberately NOT a legal single hop: cancellation is requested
      // first, then confirmed. Keep the fixture on the real matrix path so terminal-mint cells do
      // not manufacture a state production cannot reach.
      if (status === "cancelled") {
        await rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);
      }
      await rootQuery("update clara.agent_tasks set status=$2 where id=$1", [taskId, status]);
    }
  }
  return { eventId, intentId, taskId };
}

/** A live kind='wake' task produced by a NON-bank source. The wake carrier is shared by every
 * wake_outbox source, so kind alone is never bank identity. The event type is discovered from the
 * active taxonomy instead of hard-coded; the only fixed negative is that it is not bank.agent_due. */
export async function makeUnrelatedWakeTask({ firm, client, bankAccount, status = "running" }) {
  const source = (await rootQuery(
    `select e.name as event_type, t.decision
       from clara.event_types e
       join clara.trigger_taxonomy t on t.event_type=e.name
        and t.version=(select version from clara.taxonomy_active)
      where e.client_scoped and e.name <> 'bank.agent_due'
        and t.decision in ('notification','background_review','internal_task')
      order by e.name limit 1`,
  )).rows[0];
  if (!source) throw new Error("makeUnrelatedWakeTask: no non-bank client-scoped wake source exists");
  const seq = (await rootQuery(
    "select clara._append_event($1,$2,$3,null,null,null,null,null,null,$4::jsonb) as seq",
    [firm, source.event_type, client, JSON.stringify({ bank_account_id: bankAccount })],
  )).rows[0].seq;
  const eventId = (await rootQuery(
    "select id from clara.domain_events where firm_id=$1 and seq=$2", [firm, seq])).rows[0].id;
  const intentId = (await roleQuery(
    ROLES.runtime,
    "insert into clara.wake_intents(event_id,decision,taxonomy_version) values ($1,$2,(select version from clara.taxonomy_active)) returning id",
    [eventId, source.decision],
  )).rows[0].id;
  const taskId = (await rootQuery(
    "insert into clara.agent_tasks(firm_id,kind,status,origin_intent_id) values ($1,'wake','held',$2) returning id",
    [firm, intentId],
  )).rows[0].id;
  if (status !== "held") {
    await rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
    if (status !== "running") {
      if (status === "cancelled") {
        await rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);
      }
      await rootQuery("update clara.agent_tasks set status=$2 where id=$1", [taskId, status]);
    }
  }
  return { eventId, intentId, taskId, eventType: source.event_type };
}

/** Retire every live wake task for a (firm, client) so a later makeBankWakeTask is UNAMBIGUOUS.
 *  Scoped to one client's own tasks -- never an estate-wide sweep. */
export async function retireLiveBankWakeTasks({ firm, client }) {
  const rows = (await rootQuery(
    `select id, status from clara.agent_tasks
      where firm_id=$1 and client_id=$2 and kind='wake' and status in ('held','running','cancel_requested')`,
    [firm, client],
  )).rows;
  for (const r of rows) {
    if (r.status === "held") {
      await rootQuery("update clara.agent_tasks set status='cancelled' where id=$1", [r.id]);
    } else {
      await rootQuery("update clara.agent_tasks set status='completed' where id=$1", [r.id]);
    }
  }
  return rows.length;
}

/** MEMOIZED per (firm, client, bankAccount): the live wake task a bank_agent credential binds to.
 *  Memoization matters for correctness, not speed -- §E refuses a mint outright when a (firm,
 *  client) has MORE THAN ONE live wake task, so a helper that minted a fresh task per call would
 *  make the second call in any battery refuse bank_agent_task_ambiguous. One task per account is
 *  also the real shape: the pack is per-account and a run works one account for its whole life. */
const _taskCache = new Map();
export async function ensureBankWakeTask({ firm, client, bankAccount }) {
  const key = `${firm}:${client}:${bankAccount}`;
  if (_taskCache.has(key)) return _taskCache.get(key);
  // A DIFFERENT account for the same client would be a second live task and would make every
  // mint for this client ambiguous, so any earlier one is retired first. That is not tidying:
  // it is the very residual §E's own refusal names, reproduced deliberately rather than tripped
  // over.
  await retireLiveBankWakeTasks({ firm, client });
  for (const [k] of _taskCache) if (k.startsWith(`${firm}:${client}:`)) _taskCache.delete(k);
  const made = await makeBankWakeTask({ firm, client, bankAccount, status: "running" });
  _taskCache.set(key, made);
  return made;
}

/** Forget the memo (a battery that deliberately cancels or settles a task must not hand the
 *  settled id to the next caller). */
export function forgetBankWakeTasks() {
  _taskCache.clear();
}
