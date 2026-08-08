// x54 rig, second file — THE ACCEPTED RESIDUAL OF F9's SYSTEM CLASSIFICATION, pinned.
//
// WHY THIS EXISTS AS A TEST AND NOT ONLY AS A COMMENT. The F9 fix round classifies a stale
// or unresolvable region index as a SYSTEM condition: never `evidence_invalid`, never
// question-shaped, and retryable in-run (autoDraft.v7.errors.ts). The cross-model re-verify
// drove that end to end on a real database and found the half the wording let a reader
// over-read: the runtime's classification does NOT reach the DB's attempt accounting. A
// transient the model never recovers from still settles `failed`, still consumes a durable
// attempt, and at the cap still PARKS the filing — after which admission refuses forever.
//
// That cost is ACCEPTED as a decision (the reducer fix means most transients now recover
// in-run without settling at all; the binding deploy order means the one blanket condition
// should never open; and parking closes only the UNATTENDED lane — the chat and hand doors
// do not consult this registry). Accepted decisions still get pinned: a future reader who
// assumes "transient means free" fails these cells instead of discovering it in production.
//
// SEPARATE FILE, not more cells in x54-region-ordinal.test.mjs, for two reasons: that file
// reached the 500-line cap, and its subject is the ORDINAL. This one's subject is the
// autodraft attempt registry, which 0054 does not touch — so it deliberately does NOT gate
// on the migration at all.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, markSkip, noteLane,
  waveAEnsureReady, buildWorld, firmOf, opk, primeReadyFiling, admitAutodraft, beginAutodraft, settleAutodraft,
  upsertPayableAccount, upsertAccountClassed,
} from "./a21-helpers.mjs";

const AP = "400-000"; // the codes primeReadyFiling books against (wave-a-fixtures.mjs:298-299)
const EXP = "500-A01";

let ready = false;
let world = null;

/** Operator-set per-firm limits (the x47 / wave-a-budget precedent): these cells admit real
 *  autodraft tasks on a SHARED firm, so the daily token budget and the concurrent-sweep cap
 *  would otherwise run out mid-file and return refused_budget — failing the cells for a
 *  reason that has nothing to do with the residual under test. */
async function setFirmLimit(firm) {
  await rootQuery(
    `insert into clara.firm_limits (firm_id, daily_token_limit, sweep_budget_share, max_concurrent_sweeps)
     values ($1,50000000,0.9,999)
     on conflict (firm_id) do update set daily_token_limit=excluded.daily_token_limit,
       sweep_budget_share=excluded.sweep_budget_share, max_concurrent_sweeps=excluded.max_concurrent_sweeps`,
    [firm],
  ).catch((e) => noteLane(`setFirmLimit failed (${e.code}) — firm_limits shape may differ`));
}

function skipHere(t) {
  if (!ready) {
    markSkip();
    t.skip("rig not reachable / pre-Wave-A schema — the transient-residual battery is dormant");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("x54rap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("x54rexp") });
      await setFirmLimit(await firmOf(c));
    }
  }
});

after(async () => {
  printLaneNotes("x54-residual");
  printSkipCount("x54-residual");
  await endPool();
});

test("a transient-coded failure is still a DURABLE failed attempt: two of them park the filing at the cap, and admission then refuses — so 'automatic recovery once the migration lands' is FALSE for a parked filing", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const { filingId: filing } = await primeReadyFiling(users.alice, { client: clients.A1 });
  // The exact refusal shape autoDraft.v7 settles with when the model exhausts its budget on
  // a system condition: code "transient", a system reason, NOT evidence_invalid.
  const transient = { type: "refusal", code: "transient", reason: "evidence_index_unavailable", message: "no region index published" };

  for (const attempt of [1, 2]) {
    const admitted = await admitAutodraft({ filing });
    assert.ok(admitted.task_id, `attempt ${attempt} must admit (got ${JSON.stringify(admitted)})`);
    await beginAutodraft({ task: admitted.task_id }); // the CAS queued -> running the runtime does first
    await settleAutodraft({ task: admitted.task_id, outcome: "failed", tokens: 0, refusal: transient });
    const reg = await rootQuery("select attempt_count, state from clara.autodraft_attempts where filing_id=$1", [filing]);
    assert.equal(Number(reg.rows[0].attempt_count), attempt, `the transient consumed attempt ${attempt} — the DB does not distinguish it from any other failure`);
  }

  const parked = await rootQuery("select attempt_count, state, last_refusal from clara.autodraft_attempts where filing_id=$1", [filing]);
  assert.equal(parked.rows[0].state, "parked", "at the cap the registry parks the filing");
  assert.equal(parked.rows[0].last_refusal?.code, "transient", "…carrying the system refusal, so the reason it parked is at least legible");

  const after0 = await admitAutodraft({ filing });
  assert.equal(after0.outcome, "refused_attempts", "and every later admission is refused, whatever the world now looks like");
});

test("…but the half ruling 2 DOES deliver still holds on the same run: a transient settle leaves NO durable human question behind", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const { filingId: filing } = await primeReadyFiling(users.alice, { client: clients.A2 });
  const admitted = await admitAutodraft({ filing });
  assert.ok(admitted.task_id);
  await beginAutodraft({ task: admitted.task_id });
  const before0 = await rootQuery("select count(*)::int as n from clara.open_questions");
  await settleAutodraft({
    task: admitted.task_id, outcome: "failed", tokens: 0,
    refusal: { type: "refusal", code: "transient", reason: "evidence_snapshot_changed", message: "the extraction moved" },
  });
  const after0 = await rootQuery("select count(*)::int as n from clara.open_questions");
  assert.equal(after0.rows[0].n, before0.rows[0].n, "settling a system condition must never open a question a bookkeeper cannot answer");
});

test("NOTHING unparks a filing: the set of live writers of autodraft_attempts.state is closed, and every one of them excludes 'parked'", async (t) => {
  if (skipHere(t)) return;
  // Measured against the CATALOG rather than the migration files — the claim in
  // autoDraft.v7.errors.ts's header is "NONE EXISTS; registered", and this is that claim as
  // a test. If a future migration adds an unpark verb, this cell fails and the header has to
  // be corrected with it rather than quietly going stale.
  const writers = await rootQuery(
    `select p.oid::regprocedure::text as sig from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.prosrc ~ 'autodraft_attempts[[:space:]]+(aa[[:space:]]+)?set'
      order by 1`,
  );
  assert.deepEqual(
    writers.rows.map((r) => r.sig),
    [
      "clara.admit_autodraft_task(uuid,text,uuid,text,bigint)",
      "clara.reconcile_sweep_runs()",
      "clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)",
      "clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)",
    ],
    "the set of functions that can write the registry state is closed — a new one must be adjudicated, not discovered",
  );

  const admit = (await rootQuery("select prosrc from pg_proc where oid='clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure")).rows[0].prosrc;
  assert.ok(
    admit.indexOf("a.state='parked' then") < admit.indexOf("a.task_status in ('failed','cancelled','expired') then"),
    "the parked refusal returns BEFORE the supersede arm that sets state='idle' — so a parked filing can never reach the one admission path that would clear it",
  );

  const recon = (await rootQuery("select prosrc from pg_proc where oid='clara.reconcile_sweep_runs()'::regprocedure")).rows[0].prosrc;
  assert.match(recon, /autodraft_attempts aa set state='idle',attempt_count=0,[\s\S]{0,140}?where aa\.run_id=sr\.id and aa\.state='active'/, "the reconciler only ever touches 'active' rows");

  for (const sig of ["clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)", "clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)"]) {
    const s = (await rootQuery("select prosrc from pg_proc where oid=$1::regprocedure", [sig])).rows[0].prosrc;
    assert.match(s, /update clara\.autodraft_attempts set reserved_tokens=0, state='idle'\s*\n\s*where task_id=p_task and state='active';/, `${sig}: the cancelled/expired arm is scoped to 'active'`);
  }
});
