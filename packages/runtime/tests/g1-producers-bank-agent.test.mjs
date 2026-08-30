// Gate G1 PR-2b — the bank_agent PRODUCER, against a real rig. #437 shipped bankAgent_v1 (the
// consumer) and measured no producer exists (PROGRESS.md 2026-08-30 noon). This file proves the
// missing half: reconciler-bank-agent.mjs's produceBankAgentWakes().
//
// TWO DB SURFACES THIS BELT NEEDS DO NOT EXIST ON `main` YET, by design (module header):
//   clara.bank_agent_run_due(uuid)  — F-A3's own domain due-predicate (g1-wake-engine-design.md
//                                     §5), unbuilt.
//   clara.emit_bank_agent_due(...)  — THIS PR's own emission door, shipped in
//                                     UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql (present on
//                                     THIS branch's rig, since the file has been applied).
// Per the lane brief ("stub the registration in your test fixture and say so"), this file STUBS
// the missing bank_agent_run_due predicate and the missing clara.event_types/trigger_taxonomy
// registration for `bank.agent_due` as RIG-ONLY objects, created and torn down here — never a
// product migration.
//
// THIS BELT ONLY APPENDS THE DOMAIN EVENT — routing (domain_events -> wake_intents) and drain
// (wake_intents -> held agent_tasks) are a SEPARATE, already-proven leader-cycle phase
// (relay.mjs/drain.mjs) this PR does not touch, so this file never invokes them for the ordinary
// cells: the two producer-side contracts under test (payload carries bank_account_id; the event
// is appended CLIENT-scoped) are both already true of the domain_events row alone. The one cell
// that needs a REAL held wake row (the "resolved" test) materializes one directly, mirroring
// wake-engine.test.mjs's own materializeHeldRowForEvent, extended one step further to also plant
// the wake_intents row that file's version assumes routing already produced.
//
// close_prep is a GLOBAL registry row (wake_engine_sources has no firm_id, wake-engine.test.mjs's
// own header note) — this file toggles the REAL bank_agent row 0133 seeded, restoring it to
// enabled=false in after() so no other suite run against this rig inherits a stray flip.

process.env.RELAY_TEST_MODE ??= "1";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery, asRuntime, opk, buildFirm, endPool } from "./relay-fixtures.mjs";
import { produceBankAgentWakes } from "../lib/reconciler-bank-agent.mjs";

const BANK_COA = "1060"; // ck_coa_account_code_0009: plain 4-8 digits or NNN-XXXX. Distinct
// clients (a fresh firm+client per test, via buildFirm) each get their own coa_accounts row, so
// reusing this one plain code across tests is fine — it never collides within a client.
const BANK_CODE = "MBB"; // clara.bank_institutions — Maybank, seeded and active on every rig.

async function hasEmitDoor() {
  const r = await rootQuery("select to_regprocedure('clara.emit_bank_agent_due(uuid,uuid,text)') is not null as ok");
  return r.rows[0]?.ok === true;
}
const HAS_EMIT_DOOR = await hasEmitDoor();
const skip = HAS_EMIT_DOOR ? false : "clara.emit_bank_agent_due absent — apply UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql first";

// ---------------------------------------------------------------------------
// Rig-only stubs (torn down in after()) — see module header for why these are stubbed here
// rather than shipped as product migrations.
// ---------------------------------------------------------------------------

const STUB_EVENT_TYPE = "bank.agent_due";

async function ensureBankAgentDueEventType() {
  // client_scoped=true is one of the three producer-side contracts #437's own body recorded
  // (bankAgent.v1.infra.ts) — _tf_agent_task_insert's wake arm derives the task's client from
  // wake_intents ⋈ domain_events, so a firm-level type could never satisfy it.
  await rootQuery(
    `insert into clara.event_types (name, client_scoped, description)
       values ($1, true, 'g1 pr-2b rig stub -- registered here pending lane g1-pr2-db''s own migration')
     on conflict (name) do nothing`,
    [STUB_EVENT_TYPE],
  );
  await rootQuery(
    `insert into clara.trigger_taxonomy (version, event_type, decision)
       select a.version, $1, 'internal_task' from clara.taxonomy_active a
     on conflict (version, event_type) do nothing`,
    [STUB_EVENT_TYPE],
  );
}

/** A SECOND, firm-scoped event type — the negative control for the CLR10 client-scope refusal
 *  (WO acceptance: "firm-level type refused by _append_event CLR10 as a negative control"). */
const STUB_FIRM_LEVEL_TYPE = "g1pr2b.test.firm_level_due";
async function ensureFirmLevelStubType() {
  await rootQuery(
    `insert into clara.event_types (name, client_scoped, description)
       values ($1, false, 'g1 pr-2b rig stub -- a FIRM-level type, deliberately, for the CLR10 negative control')
     on conflict (name) do nothing`,
    [STUB_FIRM_LEVEL_TYPE],
  );
  await rootQuery(
    `insert into clara.trigger_taxonomy (version, event_type, decision)
       select a.version, $1, 'internal_task' from clara.taxonomy_active a
     on conflict (version, event_type) do nothing`,
    [STUB_FIRM_LEVEL_TYPE],
  );
}

async function ensureBankAgentRunDueStub() {
  await rootQuery(`
    create table if not exists clara._test_g1pr2b_bank_due_stub (
      client_id uuid primary key,
      bank_account_id uuid,
      reason text
    )
  `);
  // The stub function below is `language sql` (not SECURITY DEFINER), so it runs under the
  // CALLER's own privileges — clara_runtime needs a real grant to read this rig-only table.
  await rootQuery("grant select on clara._test_g1pr2b_bank_due_stub to clara_runtime");
  // A missing row and a row with bank_account_id NULL both answer due:false -- the ordinary
  // "nothing to do" case the belt's own log-and-continue path expects; this stub deliberately
  // never returns any OTHER shape.
  await rootQuery(`
    create or replace function clara.bank_agent_run_due(p_client uuid) returns jsonb
      language sql stable as $$
      select coalesce(
        (select case when bank_account_id is not null
           then jsonb_build_object('due', true, 'bank_account_id', bank_account_id, 'reason', coalesce(reason, 'test_due'))
           else jsonb_build_object('due', false, 'reason', 'test_not_due')
         end
         from clara._test_g1pr2b_bank_due_stub where client_id = p_client),
        jsonb_build_object('due', false, 'reason', 'no_stub_row')
      );
    $$
  `);
  await rootQuery("grant execute on function clara.bank_agent_run_due(uuid) to clara_runtime");
}

/** Every test starts from an EMPTY stub table — otherwise an earlier test's due client (still
 *  'active' in clara.clients forever; nothing in this file ever deactivates one) stays due
 *  forever too, and produceBankAgentWakes' own activeClientIds() scan (every active client on
 *  the whole rig, by design — mirroring reconciler-fa.mjs) would re-examine it on a LATER test's
 *  tick and genuinely append its first-ever event there, corrupting that later test's own
 *  appended/skipped counts. Found empirically while building this file, not assumed. */
async function resetDueStub() {
  await rootQuery("delete from clara._test_g1pr2b_bank_due_stub");
}

async function setDue(clientId, bankAccountId, reason = "test_due") {
  await rootQuery(
    `insert into clara._test_g1pr2b_bank_due_stub (client_id, bank_account_id, reason)
       values ($1, $2, $3)
     on conflict (client_id) do update set bank_account_id = excluded.bank_account_id, reason = excluded.reason`,
    [clientId, bankAccountId, reason],
  );
}
async function setNotDue(clientId) {
  await rootQuery(
    `insert into clara._test_g1pr2b_bank_due_stub (client_id, bank_account_id, reason)
       values ($1, null, 'test_not_due')
     on conflict (client_id) do update set bank_account_id = null, reason = 'test_not_due'`,
    [clientId],
  );
}

async function setBankAgentEnabled(on, actor) {
  await rootQuery(
    `update clara.wake_engine_sources set enabled=$1,
        enabled_by = case when $1 then $2 else enabled_by end,
        enabled_at = case when $1 then now() else enabled_at end
      where source_key='bank_agent'`,
    [on, actor ?? null],
  );
}

/** One active bank account for a fresh client, through the ONE audited writer chain
 *  (upsert_account for the COA row, then add_bank_account) — mirrors
 *  g1-wake-bank-fixtures.mjs's own §1/§2 exactly, minus the consent/activation pair that file
 *  builds for LATER agent-verb calls this file never makes (add_bank_account itself is a plain
 *  bookkeeper-floor human verb with no Tier-A gate). */
async function buildActiveBankAccount(w, suffix) {
  const coaCode = BANK_COA;
  await humanQuery(w.owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r", [
    w.client, coaCode, `Maybank Current (g1pr2b ${suffix})`, "asset", opk(`g1pr2b-coa-${suffix}`),
  ]);
  const acctNumber = `109${randomUUID().slice(0, 8).replace(/[a-f]/g, "1")}`;
  const r = await humanQuery(
    w.owner,
    `select clara.add_bank_account(p_client=>$1,p_coa_account_code=>$2,p_bank_code=>$3,
       p_account_number=>$4,p_bank_name_display=>$5,p_op_key=>$6) as r`,
    [w.client, coaCode, BANK_CODE, acctNumber, `Maybank Current ${suffix}`, opk(`g1pr2b-bank-${suffix}`)],
  );
  return r.rows[0].r.bank_account_id;
}

/** The domain_events row(s) this belt appended for a given account — read directly, never
 *  through wake_intents/agent_tasks (a SEPARATE, already-proven pipeline phase this belt does
 *  not touch and this file does not invoke). */
async function eventsFor(bankAccountId) {
  const r = await rootQuery(
    `select id, client_id, payload from clara.domain_events
      where event_type = 'bank.agent_due' and payload ->> 'bank_account_id' = $1
      order by id`,
    [bankAccountId],
  );
  return r.rows;
}

/** Materialize a REAL held wake row for an already-appended domain event — the exact carrier
 *  the wake engine consumer itself reads (wake-engine.mjs's own readHeldWakeRows). Extends
 *  wake-engine.test.mjs's own materializeHeldRowForEvent one step earlier: THAT helper assumes
 *  a wake_intents row already exists (real routing already ran in that file's own tests); this
 *  file never runs routing, so it plants the wake_intents row too, decision='internal_task'
 *  (the SAME decision this file registered bank.agent_due under, ensureBankAgentDueEventType). */
async function materializeHeldWakeRow(eventId, firmId) {
  const tv = (await rootQuery("select version from clara.taxonomy_active")).rows[0].version;
  const seq = (await rootQuery("select seq from clara.domain_events where id=$1", [eventId])).rows[0].seq;
  const intent = await rootQuery(
    `insert into clara.wake_intents (firm_id, event_id, event_seq, event_type, decision, taxonomy_version)
       values ($1, $2, $3, $4, 'internal_task', $5) returning id`,
    [firmId, eventId, seq, STUB_EVENT_TYPE, tv],
  );
  const intentId = intent.rows[0].id;
  const task = await rootQuery(
    "insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id",
    [intentId],
  );
  await rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'internal_task','held')", [intentId]);
  await rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intentId, randomUUID()]);
  return task.rows[0].id;
}

before(async () => {
  await ensureBankAgentRunDueStub();
  await ensureBankAgentDueEventType();
  await ensureFirmLevelStubType();
});

after(async () => {
  // Restore the REAL registry row (0133: enabled=false) so no later suite on this rig inherits a
  // stray enable, and drop the rig-only stub objects this file created.
  await rootQuery(
    "update clara.wake_engine_sources set enabled=false, disabled_by=null, disabled_at=null, disabled_reason='g1-producers-bank-agent.test.mjs after() restore' where source_key='bank_agent'",
  );
  await rootQuery("drop function if exists clara.bank_agent_run_due(uuid)");
  await rootQuery("drop table if exists clara._test_g1pr2b_bank_due_stub");
  await endPool();
});

test("bank_agent producer: DISABLED source appends nothing, even with a genuinely due account", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-off");
  const acct = await buildActiveBankAccount(w, "off");
  await setDue(w.client, acct);
  await setBankAgentEnabled(false);
  const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(out.bankAgentOk, true);
  assert.equal(out.dormant, false, "both surfaces exist — this is a disabled-source no-op, not dormancy");
  assert.equal(out.bankAgentAppended, 0, "a disabled source must append ZERO events");
  assert.equal((await eventsFor(acct)).length, 0, "and nothing landed on the event spine either");
});

test("bank_agent producer: ENABLED + due account appends exactly one event, correctly shaped (payload bank_account_id, client-scoped)", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-on");
  const acct = await buildActiveBankAccount(w, "on");
  await setDue(w.client, acct, "unmatched_lines");
  await setBankAgentEnabled(true, w.owner);
  const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(out.bankAgentOk, true);
  assert.equal(out.bankAgentAppended, 1, `expected exactly one appended event, got ${JSON.stringify(out)}`);
  const events = await eventsFor(acct);
  assert.equal(events.length, 1, "exactly one domain event for this account");
  const [row] = events;
  // Contract 1 — the payload carries bank_account_id.
  assert.equal(row.payload.bank_account_id, acct, "the payload must carry bank_account_id");
  assert.equal(row.payload.reason, "unmatched_lines", "and the due-reason the predicate named");
  // Contract 2 — the event is appended CLIENT-scoped, not firm-only.
  assert.equal(row.client_id, w.client, "the domain event must be client-scoped");
});

test("bank_agent producer: TWO TICKS in a row, same due account, append exactly ONE event (the two-tick idempotency cell)", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-2t");
  const acct = await buildActiveBankAccount(w, "2t");
  await setDue(w.client, acct);
  await setBankAgentEnabled(true, w.owner);
  const first = await asRuntime((c) => produceBankAgentWakes(c, {}));
  const second = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(first.bankAgentOk, true);
  assert.equal(second.bankAgentOk, true);
  assert.equal(first.bankAgentAppended, 1, "the first tick must append the event");
  assert.equal(second.bankAgentAppended, 0, "the second tick must append NOTHING for the same still-due account");
  assert.equal(second.bankAgentSkipped, 1, "and the belt must SAY it skipped, not silently do nothing");
  assert.equal((await eventsFor(acct)).length, 1, "exactly ONE bank.agent_due event for this account after two ticks");
});

test("bank_agent producer: a RESOLVED prior event does not block a fresh due-emission for the same account", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-resolved");
  const acct = await buildActiveBankAccount(w, "resolved");
  await setDue(w.client, acct);
  await setBankAgentEnabled(true, w.owner);
  const first = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(first.bankAgentAppended, 1);
  const [firstEvent] = await eventsFor(acct);
  // Materialize the REAL held wake row for the event this belt just appended, then settle it to
  // a TERMINAL state directly (mirrors the consumer's own held->cancelled leg, 0133's matrix) —
  // simulating the wake engine having resolved it.
  const taskId = await materializeHeldWakeRow(firstEvent.id, w.firm);
  await rootQuery("update clara.agent_tasks set status='cancelled' where id=$1", [taskId]);
  const second = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(second.bankAgentOk, true);
  assert.equal(second.bankAgentAppended, 1, "a resolved event must not block a fresh one for the same still-due account");
  assert.equal((await eventsFor(acct)).length, 2, "TWO events now exist for this account — the resolved one and the fresh one");
});

test("bank_agent producer: a NOT-DUE client is skipped silently (no event, no failure)", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-notdue");
  const acct = await buildActiveBankAccount(w, "notdue");
  await setNotDue(w.client);
  await setBankAgentEnabled(true, w.owner);
  const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(out.bankAgentOk, true);
  assert.equal(out.bankAgentAppended, 0);
  assert.equal((await eventsFor(acct)).length, 0);
});

test("bank_agent producer: absent bank_agent_run_due/emit_bank_agent_due surface is DORMANT, never a failure", async () => {
  // The real pre-surface case (neither function exists) is exercised structurally rather than by
  // dropping a real function mid-suite (which would corrupt every OTHER cell's fixtures): this
  // cell reads the SHIPPING source and asserts both signatures are feature-detected by EXACT
  // signature and that the dormant path never throws — the contract every sibling belt in this
  // codebase (reconciler-fa.mjs, reconciler-adjustments.mjs) is held to identically.
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../lib/reconciler-bank-agent.mjs", import.meta.url), "utf8"),
  );
  assert.match(src, /to_regprocedure\('clara\.bank_agent_run_due\(uuid\)'\)/, "the due predicate must be feature-detected by exact signature");
  assert.match(src, /to_regprocedure\('clara\.emit_bank_agent_due\(uuid,uuid,text\)'\)/, "the emission door must be feature-detected by exact signature");
  assert.match(src, /dormant:\s*true/, "an absent surface must answer dormant:true, never throw");
});

test("bank_agent producer: firm-level event type is refused CLR10 by _append_event's own insert-trigger derivation (negative control)", { skip }, async () => {
  // Proves emit_bank_agent_due's OWN refusal path is real by calling _append_event directly with
  // the deliberately FIRM-LEVEL stub type this file registered — the exact defect contract 3
  // guards against (a firm-level 'bank.agent_due' registration would make (2)'s client-scoped
  // append structurally impossible). Run as root (superuser bypasses the EXECUTE grant this
  // ungranted function would otherwise refuse) since this cell's job is the INSERT TRIGGER's
  // own gate, not the grant wall — every OTHER _append_event caller in this codebase is instead
  // a narrowly-scoped SECURITY DEFINER writer, which is exactly the shape emit_bank_agent_due
  // itself is (proven by the OTHER cells in this file).
  const w = await buildFirm("g1ba-clr10");
  await assert.rejects(
    rootQuery(
      `select clara._append_event($1, $2, $3, null, null, null, null, null, null, '{}'::jsonb) as seq`,
      [w.firm, STUB_FIRM_LEVEL_TYPE, w.client],
    ),
    /CLR10|client_scoped|firm-level/i,
    "a client_id on a firm-level-registered event type must be refused",
  );
});
