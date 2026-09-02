// Shared fixtures for Gate G1's two wake bodies (bankAgent_v1, closePrep_v1).
//
// Split out of g1-wake-bodies.test.mjs when that file crossed the repo's 500-line module budget,
// so the LIFECYCLE cells and the WALL cells could each be read on their own. Every helper here
// encodes a producer-side contract that was MEASURED against the rig, not assumed — each one is
// commented with the red that found it, because those reds are the actual findings.

import { after } from "node:test";
import * as rig from "./rig.mjs";

export const READY = await rig.runtimeReady();

async function hasG1() {
  if (!READY) return false;
  const r = await rig.rootQuery("select to_regclass('clara.wake_engine_sources') as t");
  return r.rows[0].t != null;
}
export const G1 = await hasG1();
export const skip = !READY ? "Slice-4 (0006) surface absent" : !G1 ? "Gate G1 (wake_engine_sources) not applied" : false;

async function has0138() {
  if (!G1) return false;
  const r = await rig.rootQuery("select to_regprocedure('clara._close_expected_op_key(uuid,text,uuid)') as p");
  return r.rows[0].p != null;
}
export const HAS_0138 = await has0138();
export const skip0138 = skip || (HAS_0138 ? false : "F-A4 PR-1c (0138) not applied");

const REGISTERED = [];

export async function registerSource(row) {
  const on = row.enabled ?? false;
  if (on && row.carrier === "wake_outbox" && row.eventType) {
    // The same estate invariant wake-engine.test.mjs enforces at registration: AT MOST ONE
    // enabled wake_outbox source per event_type, because loadEnabledSources correlates a row to
    // its source by event_type ALONE. A stale enabled source sharing the type would answer this
    // file's lookups instead of the one the cell just registered.
    await rig.rootQuery(
      `update clara.wake_engine_sources set enabled=false, disabled_by=$2, disabled_at=now(),
              disabled_reason='g1-bodies test isolation: superseded by a later registerSource'
        where carrier='wake_outbox' and event_type=$1 and enabled`,
      [row.eventType, row.actor],
    );
  }
  await rig.rootQuery(
    `insert into clara.wake_engine_sources
       (source_key, carrier, event_type, task_kind, wake_kind, workflow_export, login_pool,
        max_attempts, enabled, enabled_by, enabled_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $9 then now() else null end)`,
    [row.sourceKey, row.carrier, row.eventType ?? null, row.taskKind, row.wakeKind,
      row.workflowExport, row.loginPool ?? "runtime", row.maxAttempts ?? 5, on, on ? row.actor : null],
  );
  REGISTERED.push(row.sourceKey);
}

after(async () => {
  if (REGISTERED.length) {
    await rig.rootQuery("delete from clara.wake_engine_sources where source_key = any($1)", [REGISTERED]);
  }
  await rig.endPool();
});

/** THE FIRST CONTRACT, found by a red. The estate's own synthetic wake type (rig.relay.wake) is
 *  registered client_scoped=FALSE, and clara._append_event refuses a client_id on a firm-level
 *  type outright: CLR10 "firm-level event <type> must not carry a client_id". So a wake source
 *  whose consumer needs a client — every clocked lane, since the credential mint requires a
 *  firm-congruent ACTIVE client — MUST register its event type with client_scoped=true. When
 *  F-A3 registers bank.agent_due in clara.event_types, that flag is not optional: registered
 *  firm-level, the type can never produce a runnable bank task. */
export const BANK_DUE_TYPE = "bank.agent_due";

export async function ensureClientScopedWakeType() {
  await rig.rootQuery(
    `insert into clara.event_types (name, client_scoped, description)
       values ($1, true, 'g1-bodies rig: the registered CLIENT-SCOPED bank wake source')
     on conflict (name) do nothing`,
    [BANK_DUE_TYPE],
  );
  await rig.rootQuery(
    `insert into clara.trigger_taxonomy (version, event_type, decision)
       select a.version, $1, 'background_review' from clara.taxonomy_active a
     on conflict (version, event_type) do nothing`,
    [BANK_DUE_TYPE],
  );
}

/** A held wake task carrying a bank_account_id on its ORIGINATING EVENT's payload.
 *
 *  TWO MORE PRODUCER CONTRACTS, the second also found by a red — an earlier draft set client_id
 *  on the agent_tasks INSERT and the claim still came back 'no_client':
 *
 *   1. THE PAYLOAD carries bank_account_id (and optionally the due reason). readBankTaskContext
 *      reads it because clara_wake_bank has no SELECT on bank_accounts and wake_get_bank_pack
 *      requires an account — so the account must arrive WITH the work.
 *   2. THE EVENT MUST BE THE REGISTERED `bank.agent_due` SOURCE and client-scoped.
 *      _tf_agent_task_insert's wake arm (0011:1223-1230)
 *      DERIVES the task's firm_id and client_id from wake_intents joined to domain_events, so a
 *      client_id supplied on the task INSERT is discarded. bank-agency-design.md:326 already
 *      says the belt appends a "client-scoped bank.agent_due domain event" — this is the bytes
 *      agreeing with the prose.
 */
export async function plantHeldWakeTask({ owner, client, payload }) {
  const firm = await rig.firmOfClient(client);
  await ensureClientScopedWakeType();
  const ev = await rig.asFnOwner(async (c) => {
    const s = await c.query(
      `select clara._append_event(p_firm => $1, p_type => $2, p_client => $3, p_actor => $4,
          p_obo => null, p_wake_kind => null, p_entry => null, p_document => null,
          p_resolution => null, p_payload => $5::jsonb) as seq`,
      [firm, BANK_DUE_TYPE, client, owner, JSON.stringify(payload)],
    );
    const e = await c.query("select id from clara.domain_events where firm_id=$1 and seq=$2", [firm, Number(s.rows[0].seq)]);
    return e.rows[0];
  });
  const version = await rig.activeTaxonomyVersion();
  const wi = await rig.asRuntime((c) =>
    c.query(
      `insert into clara.wake_intents (event_id, decision, taxonomy_version)
       values ($1,
               (select tt.decision
                  from clara.trigger_taxonomy tt
                  join clara.domain_events de on de.id = $1
                 where tt.version = $2 and tt.event_type = de.event_type),
               $2)
       returning id`,
      [ev.id, version],
    ),
  );
  const t = await rig.rootQuery(
    "insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id",
    [wi.rows[0].id],
  );
  return { taskId: t.rows[0].id, intentId: wi.rows[0].id, eventId: ev.id, firm };
}

/** A queued close_prep task. _tf_agent_task_insert's close_prep arm (0120:1482-1495) demands a
 *  prevalidated firm+client, no session/intent, 'queued' status and a non-blank model snapshot. */
export async function plantQueuedClosePrepTask({ firm, client }) {
  const t = await rig.rootQuery(
    `insert into clara.agent_tasks (kind, status, firm_id, client_id, model_snapshot)
       values ('close_prep','queued',$1,$2,$3) returning id`,
    [firm, client, rig.DEFAULT_MODEL],
  );
  return t.rows[0].id;
}

export const readTask = (id) =>
  rig.rootQuery("select status, error_code, workflow_run_id, firm_id, client_id from clara.agent_tasks where id=$1", [id])
    .then((r) => r.rows[0]);

export const readOutbox = (intentId) =>
  rig.rootQuery("select status from clara.wakes_outbox where intent_id=$1", [intentId]).then((r) => r.rows[0] ?? null);
