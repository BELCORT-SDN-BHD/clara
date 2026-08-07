// x47 rig — migration 0047: the drafted-settlement guard tests IDENTITY, not a
// time-varying status (§7-A acceptance FINDING F1, reproduced 3/3 on 2026-08-07).
//
// THE RACE THIS FILE REPRODUCES, DB HALF. autoDraft_v6 drafts entry E; the event-driven
// rule-post consumer approves E about 100 ms later; autoDraft_v6's settle step then reports
// outcome 'drafted' for E. Before 0047 the guard required E to still BE a draft, so every
// successful unattended post refused its own task's settlement (CLR11 'draft settlement
// entry not found'), stranded the task 'running' with its tokens charged, and — because the
// reconciler's terminal edge re-raised the same error every leader cycle — wedged the whole
// leader loop until a human cancelled the task.
//
// WHAT IS AND IS NOT CLAIMED HERE. These cells drive the DB half only: they approve the
// entry the way the rule-post executor does (status 'approved' WITH checked_via_rule_id set)
// rather than driving a whole propose/sign/post campaign, which the x46 battery already
// owns. The runtime half — one un-settleable task must never abort the sweep — is covered in
// packages/runtime/tests/reconcile-autodraft-settle-unit.test.mjs.
//
// The negative cells matter as much as the positive one: 0047 WIDENS the guard, and a
// widening that quietly became "accept anything" would strand nothing and prove nothing.
// Both remaining human exits from 'draft' must still refuse, and so must a foreign entry.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  primeReadyFiling, admitAutodraft, autodraftDraftEntry, ORIGIN, withActor,
} from "./a21-helpers.mjs";

const AP = "400-000";
const EXP = "500-A01";

async function has0047() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0047_' limit 1");
    return r.rows.length > 0;
  } catch { return false; }
}

let ready = false;
let has47 = false;
let world = null;

before(async () => {
  ready = await waveAEnsureReady();
  has47 = await has0047();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("x47ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("x47exp") });
      // Five cells each admit a real autodraft task on a SHARED firm, so the per-firm daily
      // token budget and the concurrent-sweep cap both run out mid-file and admissions start
      // returning 'refused_budget' — which would fail every cell for a reason that has nothing
      // to do with the guard under test. Lifted the same way wave-a-budget.test.mjs lifts them
      // (operator-set firm_limits, root). NB: max_concurrent_sweeps is raised rather than
      // trusted at its default of 2 because a run-bound admission opens its sweep run BEFORE
      // admitting, so the run's own row counts toward its own cap — §7-A FINDING F5.
      await setFirmLimit(await firmOf(c), { daily: 50_000_000, share: 0.9, maxSweeps: 999 });
    }
  }
});

/** Operator-set per-firm limits (rig lever, root — the wave-a-budget/s6-metering precedent). */
async function setFirmLimit(firm, { daily, share, maxSweeps }) {
  await rootQuery(
    `insert into clara.firm_limits (firm_id, daily_token_limit, sweep_budget_share, max_concurrent_sweeps)
     values ($1,$2,$3,$4)
     on conflict (firm_id) do update
       set daily_token_limit=excluded.daily_token_limit,
           sweep_budget_share=excluded.sweep_budget_share,
           max_concurrent_sweeps=excluded.max_concurrent_sweeps`,
    [firm, daily, share, maxSweeps],
  ).catch((e) => noteLane(`setFirmLimit failed (${e.code}) — firm_limits shape may differ`));
}
after(async () => { printLaneNotes("x47-settle-guard"); printSkipCount("x47-settle-guard"); await endPool(); });

function skip47(t, msg = "0047 not applied — the settle-guard identity battery is dormant") {
  if (!ready || !has47) { markSkip(); t.skip(msg); return true; }
  return false;
}

/** A minimal, VALID clara.coding_rules row, purely to satisfy the
 *  fk_je_checked_via_rule foreign key. A rig lever, not a product path: the guard reads
 *  "checked_via_rule_id IS NOT NULL", never the rule's contents, so driving a whole
 *  propose/sign campaign here would test the campaign, not the guard. rule_type
 *  'vendor_account' + status 'proposed' is the one shape that satisfies every CHECK on the
 *  table (ck_coding_rules_tier wants all the autopost bound columns NULL;
 *  ck_coding_rules_terminal wants no signer; content_hash wants 64 hex). */
async function seedRuleRow(client) {
  const firm = await firmOf(client);
  const cp = await rootQuery("select id from clara.counterparties where client_id=$1 order by created_at limit 1", [client]);
  const counterparty = cp.rows[0]?.id ?? null;
  assert.ok(counterparty, "mandatory premise: the primed filing left a counterparty to hang a rule off");
  const hash = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const r = await rootQuery(
    `insert into clara.coding_rules
       (firm_id, client_id, rule_type, counterparty_id, account_code, status, origin, content_hash)
     values ($1, $2, 'vendor_account', $3, $4, 'proposed', 'proposed', $5)
     returning id`,
    // EXP, not AP: a trigger refuses a vendor_account rule that targets a CONTROL-class
    // account (CLR27 'a vendor_account rule cannot target a control-class account'), and
    // Trade Creditors is one. Learned from the rig, not assumed.
    [firm, client, counterparty, EXP, hash.slice(0, 64)],
  );
  return r.rows[0].id;
}

/** Drive an admitted autodraft task up to a genuine DRAFT entry, exactly as the sweep does.
 *  Returns { task, entry, client, firm } — or null when the world declines to admit, which
 *  every caller treats as a hard failure rather than a quiet skip (the wave-a lesson: a
 *  premise that silently degrades produces a green cell that measured nothing). */
async function draftUnderTask(client, vendorName) {
  const { users } = world;
  const firm = await firmOf(client);
  const rf = await primeReadyFiling(users.alice, { client, vendorName });
  const admit = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep });
  assert.equal(admit?.outcome, "admitted",
    `mandatory premise: the fixture admits (got ${JSON.stringify(admit)}) — with no task there is`
    + " no settlement to guard and the cell would pass having measured nothing");
  const entry = await autodraftDraftEntry(users.alice, { task: admit.task_id, rf, firm, client, vendorName });
  assert.ok(entry, "mandatory premise: the real autodraft draft path produced an entry");
  const st = await rootQuery("select status, checked_via_rule_id from clara.journal_entries where id=$1", [entry]);
  assert.equal(st.rows[0]?.status, "draft", "mandatory premise: the drafted entry starts as a draft");
  const cp = await rootQuery(
    "select id from clara.counterparties where client_id=$1 and name=$2 order by created_at desc limit 1",
    [client, vendorName]);
  assert.ok(cp.rows[0]?.id, "mandatory premise: the primed filing left this fixture's own vendor counterparty");
  return { task: admit.task_id, entry, client, firm, counterparty: cp.rows[0].id };
}

/** Flip a draft to 'approved' in ONE transaction that also runs the subledger hook, with
 *  checked_via_rule_id optionally stamped.
 *
 *  WHY IT MUST BE THIS SHAPE, and not the two obvious simpler ones:
 *    - It cannot approve through clara.approve_entry and THEN stamp the rule id.
 *      clara._tf_entry_immutable (0016:4955-4961) allows checked_via_rule_id ONLY on the
 *      draft->approved transition; once approved, an approved->approved update permits the
 *      reversal-linkage pair and nothing else. The stamp and the transition are one write or
 *      they are impossible.
 *    - It cannot be a bare UPDATE either. clara._subledger_on_approve (0037:1050) is the hook
 *      "called from ALL FOUR approve paths", and 0037:1397's tie check refuses an approved
 *      entry whose open items were never materialised — which is exactly what a raw flip
 *      leaves behind. Running the hook inside the same transaction is what makes this a
 *      faithful stage of the post-state rather than a broken one.
 *
 *  The result is byte-for-byte the row state clara.execute_rule_post's approve path produces
 *  (0016:1448 sets checked_via_rule_id from p_ctx inside _approve_entry_core), which is all
 *  the guard under test can see. Raw staging per the x31/x34/a21-watch precedent. */
async function stageApproval(entry, checker, counterparty, rule = null) {
  await withActor({ transaction: true }, async (client) => {
    // ORDER IS LOAD-BEARING, and all three steps are the approve paths' own order.
    //
    // (1) BIND THE COUNTERPARTY ON THE CONTROL LEG — WHILE THE ENTRY IS STILL A DRAFT.
    // clara._subledger_classify_entry reads the LINE's counterparty_id, and a NULL there
    // fails the kind check (0037:1088-1091) with a message that hard-codes the word
    // 'customer' whatever the domain actually is, so a MISSING binding reads as a WRONG kind
    // (the detail jsonb is where the real reason lives). The acceptance campaign's own
    // receipt records this binding as happening "at approve, not at draft" — and it has to
    // happen just BEFORE the flip, because clara._tf_line_immutable refuses any line change
    // once the entry is approved ('lines of an approved/withdrawn entry are immutable').
    await client.query(
      `update clara.journal_lines jl
          set counterparty_id = $2
         from clara.journal_entries e, clara.coa_accounts ca
        where jl.entry_id = $1 and e.id = jl.entry_id
          and ca.client_id = e.client_id and ca.account_code = jl.account_code
          and ca.account_class in ('payable','receivable')`,
      [entry, counterparty],
    );
    // (2) THE TRANSITION ITSELF, carrying the rule stamp — one write, because
    // clara._tf_entry_immutable (0016:4955-4961) allows checked_via_rule_id ONLY here.
    await client.query(
      `update clara.journal_entries
          set status='approved', checker_actor=$2, approved_at=now(),
              checked_via_rule_id=$3, updated_at=now()
        where id=$1`,
      [entry, checker, rule],
    );
    // (3) THE SUBLEDGER HOOK, which every real approve path calls after its own status flip.
    await client.query("select clara._subledger_on_approve($1)", [entry]);
  });
}

/** Approve the entry the way clara.execute_rule_post's approve path does — 'approved' WITH
 *  checked_via_rule_id set. */
async function approveViaRulePath(entry, rule, checker, counterparty) {
  await stageApproval(entry, checker, counterparty, rule);
  const st = await rootQuery("select status, checked_via_rule_id from clara.journal_entries where id=$1", [entry]);
  assert.equal(st.rows[0]?.status, "approved", "staging premise: the entry is now approved");
  assert.ok(st.rows[0]?.checked_via_rule_id, "staging premise: the approval carries a rule id (this is what makes it a RULE post)");
}

/** The 6-arity settle — the shape autoDraft_v6's own settle step uses. */
async function settle6(task, { outcome = "drafted", tokens = 100, entry = null, refusal = null, runId }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.settle_autodraft_task(p_task=>$1,p_outcome=>$2,p_tokens=>$3::bigint,p_entry=>$4,p_refusal=>$5::jsonb,p_workflow_run_id=>$6) as r",
    [task, outcome, tokens, entry, refusal, runId]);
  return r.rows[0].r;
}
/** The 5-arity settle — the shape reconciler.mjs's terminal edge uses. */
async function settle5(task, { outcome = "drafted", tokens = 0, entry = null, refusal = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.settle_autodraft_task(p_task=>$1,p_outcome=>$2,p_tokens=>$3::bigint,p_entry=>$4,p_refusal=>$5::jsonb) as r",
    [task, outcome, tokens, entry, refusal]);
  return r.rows[0].r;
}

/** The task's engine run id, as begin_autodraft_task recorded it — the 6-arity refuses any
 *  other value with a benign 'run_superseded' no-op, so a cell that guessed here would
 *  measure the run-identity check instead of the guard under test. */
async function runIdOf(task) {
  const r = await rootQuery("select workflow_run_id from clara.agent_tasks where id=$1", [task]);
  return r.rows[0]?.workflow_run_id ?? null;
}

// ===========================================================================
// THE ACCEPTANCE CRITERION — the exact F1 race, DB half.
// ===========================================================================

test("x47.a THE FIX: an entry the RULE-POST path already approved still settles 'drafted' CLEANLY through the 6-arity (the §7-A F1 race, DB half)", async (t) => {
  if (skip47(t)) return;
  const { clients } = world;
  const staged = await draftUnderTask(clients.A1, "X47RULECO SDN BHD");
  const rule = await seedRuleRow(clients.A1);

  // THE RACE, COMPRESSED: the rule-post consumer wins, and the drafter settles afterwards.
  await approveViaRulePath(staged.entry, rule, world.users.alice, staged.counterparty);

  const runId = await runIdOf(staged.task);
  assert.ok(runId, "mandatory premise: the task carries the engine run id begin_autodraft_task recorded");
  const settled = await settle6(staged.task, { entry: staged.entry, runId });

  assert.equal(settled?.outcome, "drafted",
    `the settlement is accepted and reports its outcome (got ${JSON.stringify(settled)}) — BEFORE 0047 this`
    + " raised CLR11 'draft settlement entry not found' and stranded the task");
  assert.equal(settled?.status, "completed", `the task reaches 'completed' (got ${JSON.stringify(settled)})`);
  assert.equal(settled?.entry_id, staged.entry, "the receipt names the entry this task produced");

  // ...and the task really is terminal in the table, not merely in the return value. This is
  // the property whose absence WAS the incident: a task left 'running' is what the reconciler
  // kept re-settling, and what starved every other sweeper behind it.
  const row = await rootQuery("select status from clara.agent_tasks where id=$1", [staged.task]);
  assert.equal(row.rows[0]?.status, "completed", "the agent_task is terminal — nothing is left for the reconciler to strand on");

  // The durable receipt records the drafted outcome against the entry.
  const item = await rootQuery(
    "select outcome, entry_id from clara.sweep_run_items where entry_id=$1 order by created_at desc limit 1", [staged.entry]);
  if (item.rows.length === 0) {
    noteLane("x47.a: no sweep_run_items row — the admission was not run-bound in this world; the settle receipt is unverified");
  } else {
    assert.equal(item.rows[0].outcome, "drafted", "the sweep receipt records 'drafted'");
  }
});

test("x47.b the SAME rule-approved entry settles cleanly through the 5-ARITY — the overload reconciler.mjs's terminal edge actually calls", async (t) => {
  if (skip47(t)) return;
  const { clients } = world;
  const staged = await draftUnderTask(clients.A2, "X47RECONCO SDN BHD");
  const rule = await seedRuleRow(clients.A2);
  await approveViaRulePath(staged.entry, rule, world.users.alice, staged.counterparty);

  // 0047 recuts BOTH overloads, and this is why that is not belt-and-braces: the reconciler's
  // crash-after-draft edge settles through the 5-arity with tokens=0, so a fix applied only to
  // the 6-arity would leave the leader loop wedging on exactly the tasks it exists to rescue.
  const settled = await settle5(staged.task, { entry: staged.entry });
  assert.equal(settled?.outcome, "drafted", `the 5-arity accepts it too (got ${JSON.stringify(settled)})`);
  assert.equal(settled?.status, "completed", "the task reaches 'completed' through the reconciler's own call shape");
});

// ===========================================================================
// THE WIDENING IS NARROW — every other exit from 'draft' still refuses.
// ===========================================================================

test("x47.c a HUMAN-approved entry (checked_via_rule_id NULL) still REFUSES with CLR11 — the liveness term was widened, not deleted", async (t) => {
  if (skip47(t)) return;
  const { clients } = world;
  const staged = await draftUnderTask(clients.A1, "X47HUMANCO SDN BHD");

  // The difference from x47.a is exactly one column, and it is the column that carries the
  // identity: 0016's own tail (0016:5109-5112) refuses any deploy whose HUMAN approve wrapper
  // can set checked_via_rule_id, so NULL here means "a human signed this", not "a rule did".
  await stageApproval(staged.entry, world.users.alice, staged.counterparty, null);
  const st = await rootQuery("select status, checked_via_rule_id from clara.journal_entries where id=$1", [staged.entry]);
  assert.equal(st.rows[0]?.status, "approved", "staging premise: approved");
  assert.equal(st.rows[0]?.checked_via_rule_id, null, "staging premise: and NOT via a rule");

  const runId = await runIdOf(staged.task);
  await assert.rejects(
    () => settle6(staged.task, { entry: staged.entry, runId }),
    (e) => e.code === "CLR11" && /draft settlement entry not found/.test(e.message ?? ""),
    "a human approval inside the settle window is a KNOWN uncovered transition (0047 header) — it must still"
    + " refuse, so that a future widening is a deliberate decision rather than a silent side effect",
  );
});

test("x47.d a WITHDRAWN entry still REFUSES with CLR11 — the third exit from 'draft' is not admitted either", async (t) => {
  if (skip47(t)) return;
  const { clients } = world;
  const staged = await draftUnderTask(clients.A2, "X47WITHDRAWCO SDN BHD");

  // 'withdrawn' is the status the first cut of 0047 did not know existed: the header reasoned
  // about a BINARY draft/approved domain, and 0007:1013 had already widened it to three. The
  // migration's own prestate arm caught that on the rig. This cell pins the consequence.
  await rootQuery(
    `update clara.journal_entries
        set status='withdrawn', withdrawn_by=$2, withdrawn_at=now(),
            withdrawal_reason='x47.d — the third exit from draft', updated_at=now()
      where id=$1`,
    [staged.entry, world.users.alice],
  );
  const st = await rootQuery("select status from clara.journal_entries where id=$1", [staged.entry]);
  assert.equal(st.rows[0]?.status, "withdrawn", "staging premise: withdrawn");

  const runId = await runIdOf(staged.task);
  await assert.rejects(
    () => settle6(staged.task, { entry: staged.entry, runId }),
    (e) => e.code === "CLR11",
    "a withdrawn draft is frozen evidence (0007:1011, draft->withdrawn only) and is not something this task"
    + " 'produced' in any live sense — it must still refuse",
  );
});

test("x47.e the guard still FAILS CLOSED: a null entry, and an entry belonging to a DIFFERENT client, both refuse", async (t) => {
  if (skip47(t)) return;
  const { clients } = world;
  const staged = await draftUnderTask(clients.A1, "X47CLOSEDCO SDN BHD");
  const runId = await runIdOf(staged.task);

  // (1) NULL — the outcome claims a draft and names none.
  await assert.rejects(
    () => settle6(staged.task, { entry: null, runId }),
    (e) => e.code === "CLR11",
    "outcome 'drafted' with no entry is still refused — widening the STATUS term must not weaken the EXISTENCE term",
  );

  // (2) A REAL entry that belongs to another client's filing. This is the arm that proves
  // 0047 kept the four identity terms doing the work: id + firm + client + filing. If the
  // recut had dropped the whole existence test rather than the status leg, this would settle.
  const foreign = await draftUnderTask(clients.A2, "X47FOREIGNCO SDN BHD");
  assert.notEqual(foreign.client, staged.client, "staging premise: the two fixtures really are different clients");
  await assert.rejects(
    () => settle6(staged.task, { entry: foreign.entry, runId }),
    (e) => e.code === "CLR11",
    "an entry from another client's filing is not this task's output — identity, which the status term never proved,"
    + " is what the guard rests on and it must still bite",
  );
});
