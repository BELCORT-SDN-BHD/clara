// STANDALONE accounting-plan occurrence e2e (#640). NOT a `node --test` file: it SPAWNS
// scripts/serve.mjs (through tests/work-journal-serve.mjs, which installs the scripted model
// first) as a CHILD process, so the engine can be crashed between a database commit and its
// workflow checkpoint and respawned against the SAME database — the pattern
// tests/work-journal-e2e.mjs established. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   RELAY_TEST_MODE=1 node tests/plan-occurrence-e2e.mjs
//
// WHAT IT PROVES, and each of these needs a real Postgres world rather than a unit fake:
//
//   1. TWO BELT PASSES IN ONE CYCLE LEAVE ONE OCCURRENCE. Two `reconcilePlanOccurrences` calls
//      issued CONCURRENTLY on two independent clara_runtime connections — the shape a leader
//      handover, a doubled supervisor or a retried cycle actually produces — leave EXACTLY ONE
//      occurrence row and EXACTLY ONE `clara.accounting_work` row for the due event. The
//      database's plan-row lock and its `unique (plan_id, due_date)` are what make that true;
//      this leg measures it through the real belt rather than asserting it about the SQL.
//
//      WHICH of the two answers "converged" is NOT asserted here, deliberately: whether the
//      loser converges on the occurrence or simply finds nothing due depends on where its own
//      candidate query fell relative to the winner's commit, and both are correct. The converge
//      ANSWER itself is pinned under a real lock barrier by
//      `packages/db/tests/accounting-plan-occurrences.test.mjs`'s p640.occ.duplicate, which can
//      hold both callers at the plan row and therefore force the case.
//
//   2. NO ENGINE IS NEEDED TO ADMIT, AND THE RECONCILER DISPATCHES WHAT THE BELT ADMITTED. The
//      Work is admitted with the process that will run it not yet started. That is the ordinary
//      shape for this lane — a plan occurrence has no post-commit enqueue, because the admission
//      happens inside a database function — so `reconciler-work.mjs` §A is the ONLY thing that
//      can start it. This leg starts an engine afterwards and watches the Work run to completion.
//
//   3. A CRASH BETWEEN THE COMMIT AND THE CHECKPOINT REPLAYS ONTO THE SAME IDENTITY.
//      `CLARA_WORK_TEST_FAULT=exit_after_commit` exits the process the instant the database
//      returns a receipt for the plan-initiated posting. On respawn the WDK re-executes the step,
//      the tool call replays onto the same `logical_op_id`, and the estate ends with exactly ONE
//      journal entry, ONE committed receipt and ONE occurrence — and the occurrence still names
//      the same Work it named before the crash.
//
//   4. A THIRD BELT PASS AFTER ALL OF THAT ADMITS NOTHING NEW. The occurrence row is the due
//      event's identity whatever happened to its Work.
//
//   5. A REVERSING PLAN'S SECOND LEG WAITS FOR THE ACCRUAL'S ENTRY, THEN NAMES IT AND POSTS
//      (review round 2, BLOCKER-1). Belt pass one admits the accrual; belt pass two admits NOTHING
//      — an admitted accrual has posted nothing, and that is exactly the state in which the old
//      rule admitted the reversal and left a Work to outlive the accrual's death. The accrual then
//      runs through the ordinary lane, and the next belt pass admits the reversal carrying the
//      accrual's own `entry_id` on the occurrence row AND in the basis. The reversal is then posted
//      too, which is the only place the design's other half can be measured: `reverses_entry_id`
//      sits OUTSIDE the canonical form `clara._journal_basis_canonical` hashes, so the run's echo
//      of the basis still matches the digest admission stored. A unit cell cannot prove that; a
//      real run through the frozen tool schema can.
//
// WHY THE SCRIPTED MODEL IS work-journal-serve.mjs's. A plan-initiated Work is an ordinary
// `accounting_work` run: the same frozen bundle, the same envelope, the same admitted basis to be
// echoed verbatim. Reusing that bootstrap is the point — if a plan-initiated run needed its own
// model script, the two admission paths would not be producing the same kind of Work.
//
// GATED. `CLARA_SKIP_PLAN_E2E=1` opts out, and the file SKIPS CLEANLY (exit 0, with a printed
// reason) when migration 0193 is absent — its runtime half merges alongside its DB half, and a
// green e2e against a database with no `clara.accounting_plans` would be a lie, not a pass.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ephemeralPort } from "./ephemeral-port.mjs";
import { reconcilePlanOccurrences } from "../lib/plan-occurrences.mjs";

if (process.env.CLARA_SKIP_PLAN_E2E === "1") {
  console.log("[plan-e2e] skipped (CLARA_SKIP_PLAN_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate (the work-journal-e2e precedent, widened by ONE arm).
//
// THE NUMERIC ARM IS THE PER-TICKET RIG DATABASE (`clara_640`, `clara_615`, …) the local
// implementation rigs use, and it is deliberately narrow: three or four digits and nothing else,
// still on a loopback host, still with the parsed-DSN gate below agreeing on host, port and
// database. It exists so this file can be driven on the machine the work is done on rather than
// only in CI; it widens nothing about where the e2e may point.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci|[0-9]{3,4})$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("plan-occurrence-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci,clara_<digits>}");
}
{
  if (!process.env.WORKFLOW_POSTGRES_URL) throw new Error("plan-occurrence-e2e needs WORKFLOW_POSTGRES_URL");
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("plan-occurrence-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.PLAN_E2E_PORT || (await ephemeralPort());
const ISSUER = "https://clara-plan-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "plan-" + randomUUID().replace(/-/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./work-journal-serve.mjs", import.meta.url));
const BASE = `http://127.0.0.1:${PORT}`;
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 12 * 60 * 1000;
setTimeout(() => {
  console.error(`\nPLAN OCCURRENCE E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
  process.exit(1);
}, WATCHDOG_MS);

function childEnv(extra = {}) {
  const base = Object.assign({}, process.env, {
    PORT: String(PORT),
    RELAY_TEST_MODE: "1",
    CLARA_START_WORLD: "1",
    WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
    SUPABASE_JWT_ISSUER: ISSUER,
    SUPABASE_JWT_AUD: AUD,
    SUPABASE_JWT_SECRET: jwtSecret,
  });
  delete base.CLARA_WORK_TEST_FAULT;
  delete base.CLARA_WORK_TEST_SCRIPT;
  delete base.CLARA_CHAT_TEST_BASIS;
  return Object.assign(base, extra);
}

function spawnServe(extra = {}) {
  const child = spawn(process.execPath, [serveScript], { env: childEnv(extra), stdio: ["ignore", "pipe", "pipe"] });
  // THE TAIL IS KEPT so a readiness timeout can PRINT what the child was doing. A boot failure
  // that reports only "did not become ready" is a diagnosis nobody can act on.
  const state = { exited: false, exitInfo: null, tail: [] };
  const keep = (d) => {
    state.tail.push(String(d));
    if (state.tail.length > 40) state.tail.shift();
  };
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", keep);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    keep(d);
    if (/FATAL|Error:|exit_after_commit/.test(d)) process.stderr.write(`[child] ${d}`);
  });
  return { child, state };
}

function waitExit(child, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const t = setTimeout(() => reject(new Error("timeout waiting for serve child exit")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function waitReady(spawned, deadlineMs = 180000) {
  const end = Date.now() + deadlineMs;
  let healthy = false;
  let lastReady = null;
  while (Date.now() < end) {
    if (spawned?.state?.exited) {
      throw new Error(`serve child exited during boot: ${JSON.stringify(spawned.state.exitInfo)}
${(spawned.state.tail ?? []).join("")}`);
    }
    try {
      if (!healthy && (await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).ok) healthy = true;
      if (healthy) {
        const r = await fetch(`${BASE}/ready`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (r.status === 200) return;
        lastReady = `${r.status} ${await r.text().catch(() => "")}`.slice(0, 600);
      }
    } catch {
      /* booting */
    }
    await sleep(250);
  }
  throw new Error(
    `serve child did not become ready (/health ${healthy ? "ok" : "never ok"}; last /ready = ${lastReady ?? "never answered"})
`
    + (spawned?.state?.tail ?? []).join(""),
  );
}

/** Poll one Work until it reaches a terminal status, or fail loudly with the last one seen. The
 *  e2e's own idiom, lifted out of leg 2+3 so leg 5 does not grow a second copy. */
async function waitTerminal(id, readWork, timeoutMs) {
  const TERMINAL = new Set(["completed", "refused", "failed", "cancelled", "expired"]);
  const end = Date.now() + timeoutMs;
  let row = null;
  while (Date.now() < end) {
    row = await readWork(id);
    if (row && TERMINAL.has(row.status)) return row;
    await sleep(500);
  }
  throw new Error(`Work ${id} never reached a terminal (last=${JSON.stringify(row?.status)})`);
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regclass('clara.accounting_plans') is not null as plans_tbl,
           to_regprocedure('clara.wake_due_plan_occurrences(integer,text)') is not null as scan,
           to_regprocedure('clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)') is not null as create_door
  `);
  if (!probe.rows[0]?.plans_tbl || !probe.rows[0]?.scan || !probe.rows[0]?.create_door) {
    console.log("[plan-e2e] SKIPPED — migration 0193 (clara.accounting_plans + clara.wake_due_plan_occurrences) is not on this database");
    process.exit(0);
  }

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countCommitted = (work) =>
    rig.rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  const readWork = (id) => rig.rootQuery("select * from clara.accounting_work where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const occurrencesOf = (plan) =>
    rig.rootQuery(
      "select id, due_date::text as due_date, leg, revision, intent_key, work_id, outcome from clara.accounting_plan_occurrences where plan_id = $1 order by due_date",
      [plan]).then((r) => r.rows);

  // ---- the world: a firm, a client, the two accounts the basis posts to ---------------------
  const { owner, firm, client } = await rig.buildFirm("plan-e2e");
  for (const [code, name, type] of [["6100", "Rent expense", "expense"], ["1100", "Maybank current account", "asset"]]) {
    await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
      [client, code, name, type, rig.opk("acct")]);
  }

  // TODAY IN THE PLAN'S OWN ZONE. Never `new Date()`: the due arithmetic is Asia/Kuala_Lumpur's,
  // and a UTC "today" is a different calendar day for eight hours of every day.
  const zone = await rig.rootQuery(
    "select ((now() at time zone 'Asia/Kuala_Lumpur')::date)::text as today, (((now() at time zone 'Asia/Kuala_Lumpur')::date - interval '2 months')::date)::text as back");
  const today = zone.rows[0].today;
  const effectiveFrom = `${zone.rows[0].back.slice(0, 7)}-01`;
  const dueDate = `${today.slice(0, 7)}-01`;

  // THE AUTHORITY IS A REAL ROW: an admitted Work carrying the instruction, exactly as the door
  // requires. A plan citing anything this database does not hold is refused at creation.
  const instruction = await rig.withActor({ role: "clara_runtime" }, (c) =>
    c.query(
      `select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,'user_direct','[]'::jsonb,$5::text) as r`,
      [client, owner, `plan-e2e-instruction-${randomUUID()}`,
        JSON.stringify({
          posting_date: effectiveFrom, memo: "standing instruction: book the monthly rent", currency: "MYR",
          lines: [
            { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
            { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
          ],
        }), "gpt-5.6-terra"]));
  const instructionWork = instruction.rows[0].r.work_id;

  const planBasis = {
    posting_date: effectiveFrom,
    memo: "monthly office rent (plan e2e)",
    currency: "MYR",
    lines: [
      { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
      { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
    ],
  };
  const created = await rig.humanQuery(owner,
    `select clara.create_accounting_plan(
        p_client => $1::uuid, p_kind => 'recurring_journal', p_purpose => $2::text,
        p_authority_kind => 'explicit_instruction', p_authority_ref => $3::jsonb,
        p_frequency => 'monthly', p_day_rule => 'day_of_month', p_day_of_month => 1,
        p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => $4::date, p_effective_to => null,
        p_basis => $5::jsonb, p_reversal_day_rule => null, p_op_key => $6::text) as r`,
    [client, "Monthly office rent", JSON.stringify({ kind: "accounting_work", id: instructionWork }),
      effectiveFrom, JSON.stringify(planBasis), rig.opk("plan")]);
  const plan = created.rows[0].r.plan_id;
  console.log(`[plan-e2e] plan ${plan} authorised by ${owner}; effective_from=${effectiveFrom}, due=${dueDate}`);

  // =========================================================================
  // 1. TWO BELT PASSES IN ONE CYCLE.
  // =========================================================================
  const entriesBefore = await countEntries(client);
  const [passA, passB] = await Promise.all([
    rig.withActor({ role: "clara_runtime" }, (c) => reconcilePlanOccurrences(c, { limit: 50, log: () => {} })),
    rig.withActor({ role: "clara_runtime" }, (c) => reconcilePlanOccurrences(c, { limit: 50, log: () => {} })),
  ]);
  assert.equal(passA.planOk, true, "belt pass A succeeded");
  assert.equal(passB.planOk, true, "belt pass B succeeded");
  assert.equal(passA.planDormant, false, "the belt is not dormant on a 0193 database");

  const occ1 = await occurrencesOf(plan);
  assert.equal(occ1.length, 1, `two concurrent belt passes leave ONE occurrence, got ${JSON.stringify(occ1)}`);
  assert.equal(occ1[0].due_date, dueDate, "the occurrence is this month's due day");
  assert.equal(occ1[0].intent_key, `plan:${plan}:r1:${dueDate}`);
  assert.ok(occ1[0].work_id, "the occurrence names its Work");

  const works = await rig.rootQuery(
    "select id from clara.accounting_work where client_id=$1 and intent_key=$2", [client, occ1[0].intent_key]);
  assert.equal(works.rows.length, 1, "exactly ONE Work carries the due event's intent key");
  const work = works.rows[0].id;
  assert.equal(work, occ1[0].work_id);
  assert.equal(await countEntries(client), entriesBefore, "admission posts nothing by itself");

  // Across the two passes: one admitted it, one converged on it.
  const admittedCount = (passA.planAdmitted ?? 0) + (passB.planAdmitted ?? 0);
  const convergedCount = (passA.planConverged ?? 0) + (passB.planConverged ?? 0);
  console.log(`[plan-e2e] PASS 1: two concurrent belt passes → admitted=${admittedCount} converged=${convergedCount}, one occurrence, one Work (${work})`);
  assert.ok(admittedCount >= 1, "at least one pass admitted the due event");

  const admittedRow = await readWork(work);
  assert.equal(admittedRow.status, "queued", "the Work is queued with NO engine running");
  assert.equal(admittedRow.purpose, "journal_entry");
  assert.equal(admittedRow.initiator, owner, "it runs under the plan's authorising human");
  assert.equal(admittedRow.basis.posting_date, dueDate, "…posting on the occurrence's own due date");

  // =========================================================================
  // 2 + 3. THE ENGINE DISPATCHES IT, AND A CRASH BETWEEN COMMIT AND CHECKPOINT REPLAYS.
  // =========================================================================
  //
  // QUIESCE EVERY OTHER QUEUED WORK FIRST, AND SAY WHY. `CLARA_WORK_TEST_FAULT=exit_after_commit`
  // is a PROCESS-wide fault: it exits on the FIRST commit the engine makes, whichever Work that
  // belongs to. `reconciler-work.mjs` §A dispatches oldest-first, so on a database that already
  // holds queued accounting_work from other batteries — which is exactly what a local per-ticket
  // rig looks like, because packages/db's plan batteries admit Work they never run — the crash
  // would land on a stranger's Work and this leg would measure nothing about the plan's.
  //
  // It is a NO-OP on the CI rig (`clara_wave_b_ci` reaches this step with the three sibling e2es'
  // Work already settled), and it terminalises through the estate's OWN verb rather than an
  // UPDATE: `clara.settle_work_run` is what the reconciler itself calls for a stranded pair.
  const strays = await rig.rootQuery(
    `select t.id from clara.agent_tasks t
       join clara.accounting_work w on w.id = t.work_id
      where t.kind = 'accounting_work' and t.status in ('queued','running')
        and w.id <> $1 and w.status not in ('completed','refused','failed','cancelled','expired')`,
    [work]);
  for (const row of strays.rows) {
    await rig.withActor({ role: "clara_runtime" }, (c) =>
      c.query(
        "select clara.settle_work_run($1::uuid,'expired'::text,null::text,$2::jsonb,null::jsonb) as r",
        [row.id, JSON.stringify({ reason: "quiesced by plan-occurrence-e2e so the process-wide commit fault lands on the plan's own Work" })],
      )).catch(() => {});
  }
  if (strays.rows.length > 0) {
    console.log(`[plan-e2e] quiesced ${strays.rows.length} unrelated queued Work item(s) so the commit fault lands on this plan's own`);
  }

  const faulty = spawnServe({ CLARA_WORK_TEST_FAULT: "exit_after_commit", CLARA_WORK_TEST_SCRIPT: "post" });
  try {
    // THIS LEG DELIBERATELY DOES NOT WAIT FOR `/ready`. The reconciler's accounting_work §A
    // re-enqueues a queued Work past its 2-second grace and the commit follows immediately, so the
    // fault can — and on a warm rig usually does — fire BEFORE the readiness probe would first
    // answer 200. Waiting for readiness here would turn the leg's own expected outcome into a boot
    // failure. The EXIT is the outcome this leg is about, so the exit is what it waits for.
    console.log("[plan-e2e] engine spawned with exit_after_commit armed; waiting for the reconciler to dispatch the plan's Work and the commit fault to fire");
    await waitExit(faulty.child, 240000);
    console.log(`[plan-e2e] engine exited as scripted: ${JSON.stringify(faulty.state.exitInfo)}`);
    assert.notEqual(faulty.state.exitInfo?.code, 0,
      "the engine must have exited through the commit fault, not shut down cleanly");
    assert.ok(
      (faulty.state.tail ?? []).join("").includes(`exit_after_commit — exiting after commit, before checkpoint (work=${work})`),
      `the fault must have fired on THIS plan's Work (${work}); tail was:
${(faulty.state.tail ?? []).join("")}`,
    );
  } finally {
    if (!faulty.state.exited) faulty.child.kill("SIGKILL");
  }

  // The receipt is on the books even though the run never checkpointed.
  const committedAfterCrash = await countCommitted(work);
  assert.equal(committedAfterCrash, 1, `exactly one committed receipt survived the crash (got ${committedAfterCrash})`);
  const entriesAfterCrash = await countEntries(client);
  assert.equal(entriesAfterCrash, entriesBefore + 1, "exactly one journal entry exists after the crash");

  const respawn = spawnServe({ CLARA_WORK_TEST_SCRIPT: "post" });
  try {
    await waitReady(respawn);
    const end = Date.now() + 180000;
    let row = null;
    const TERMINAL = new Set(["completed", "refused", "failed", "cancelled", "expired"]);
    while (Date.now() < end) {
      row = await readWork(work);
      if (row && TERMINAL.has(row.status)) break;
      await sleep(500);
    }
    assert.ok(row && TERMINAL.has(row.status), `the Work reached a terminal (last=${JSON.stringify(row?.status)})`);
    assert.equal(row.status, "completed",
      `the replayed run settles COMPLETED over a committed receipt, never failed (error=${JSON.stringify(row.error)})`);
  } finally {
    respawn.child.kill("SIGKILL");
    await waitExit(respawn.child).catch(() => {});
  }

  assert.equal(await countEntries(client), entriesBefore + 1,
    "STILL exactly one journal entry after the replay — the tool call replayed onto the same logical identity");
  assert.equal(await countCommitted(work), 1, "STILL exactly one committed receipt");
  const occ2 = await occurrencesOf(plan);
  assert.equal(occ2.length, 1, "STILL exactly one occurrence");
  assert.equal(occ2[0].work_id, work, "…and it still names the same Work it named before the crash");
  assert.equal(occ2[0].outcome.state, "admitted");
  console.log("[plan-e2e] PASS 2+3: the reconciler dispatched a plan-admitted Work, the crash between commit and checkpoint replayed onto the same identity, and the estate holds one entry, one receipt, one occurrence");

  // =========================================================================
  // 4. A BELT PASS AFTER ALL OF THAT ADMITS NOTHING NEW.
  // =========================================================================
  const after = await rig.withActor({ role: "clara_runtime" }, (c) =>
    reconcilePlanOccurrences(c, { limit: 50, log: () => {} }));
  assert.equal(after.planOk, true);
  const occ3 = await occurrencesOf(plan);
  assert.equal(occ3.length, 1, "the due event's identity is its occurrence row, whatever happened to its Work");
  assert.equal(await countEntries(client), entriesBefore + 1);
  console.log("[plan-e2e] PASS 4: a further belt pass admitted nothing new");


  // =========================================================================
  // 5. A REVERSING PLAN'S SECOND LEG WAITS FOR THE ACCRUAL'S ENTRY, THEN NAMES IT.
  //
  // Review round 2's BLOCKER-1, measured on the real World rather than argued: the reversal is NOT
  // admissible while its accrual is merely admitted (that is precisely the state in which the old
  // rule admitted it, leaving a reversal Work to outlive the accrual's death and post a leg
  // reversing nothing). It becomes admissible the moment the accrual's own posting COMMITS, it
  // names that journal entry, and the reversal then posts through the ordinary lane — which is
  // also the only way to prove that the extra `reverses_entry_id` key on the basis does not break
  // the digest the run's echo is bound to.
  // =========================================================================
  const monthEnd = await rig.rootQuery(
    "select ((date_trunc('month', $1::date) + interval '1 month' - interval '1 day')::date)::text as d", [today]);
  if (monthEnd.rows[0].d === today) {
    console.log("[plan-e2e] PASS 5 SKIPPED — today is the month end, so a month-end reversing plan has no outstanding reversal leg");
  } else {
    const revBasis = {
      posting_date: effectiveFrom,
      memo: "monthly audit fee accrual (plan e2e, reversing)",
      currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 99000, credit_cents: 0, description: "accrued audit fee" },
        { account_code: "1100", debit_cents: 0, credit_cents: 99000, description: "accrual" },
      ],
    };
    const revCreated = await rig.humanQuery(owner,
      `select clara.create_accounting_plan(
          p_client => $1::uuid, p_kind => 'reversing_journal', p_purpose => $2::text,
          p_authority_kind => 'explicit_instruction', p_authority_ref => $3::jsonb,
          p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
          p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => $4::date, p_effective_to => null,
          p_basis => $5::jsonb, p_reversal_day_rule => 'next_period_first_day', p_op_key => $6::text) as r`,
      [client, "Monthly audit fee accrual", JSON.stringify({ kind: "accounting_work", id: instructionWork }),
        effectiveFrom, JSON.stringify(revBasis), rig.opk("revplan")]);
    const revPlan = revCreated.rows[0].r.plan_id;

    const beltOnce = () => rig.withActor({ role: "clara_runtime" }, (c) =>
      reconcilePlanOccurrences(c, { limit: 50, log: () => {} }));

    await beltOnce();
    const r1 = await occurrencesOf(revPlan);
    assert.equal(r1.length, 1, `the ACCRUAL is admitted first, got ${JSON.stringify(r1)}`);
    assert.equal(r1[0].leg, "primary");
    const accrualWork = r1[0].work_id;
    assert.ok(accrualWork);
    assert.equal(await countCommitted(accrualWork), 0, "…with nothing posted yet");

    // THE WALL, on the real belt: an ADMITTED accrual is not a POSTED one.
    await beltOnce();
    const r2 = await occurrencesOf(revPlan);
    assert.equal(r2.length, 1,
      `a reversal must NOT be admitted while its accrual has posted nothing; got ${JSON.stringify(r2.map((x) => [x.due_date, x.leg]))}`);

    const engine = spawnServe({ CLARA_WORK_TEST_SCRIPT: "post" });
    try {
      await waitReady(engine);
      const accrualRow = await waitTerminal(accrualWork, readWork, 240000);
      assert.equal(accrualRow.status, "completed",
        `the accrual posted through the ordinary lane (error=${JSON.stringify(accrualRow.error)})`);
      const entry = await rig.rootQuery(
        "select effects->>'entry_id' as e from clara.operation_receipts where work_id=$1 and outcome='committed'",
        [accrualWork]);
      const accrualEntry = entry.rows[0]?.e;
      assert.ok(accrualEntry, "the accrual's committed receipt names its journal entry");

      // NOW the reversal is due, and it names that entry.
      await beltOnce();
      const r3 = await rig.rootQuery(
        `select due_date::text as due_date, leg, work_id, reverses_entry_id
           from clara.accounting_plan_occurrences where plan_id=$1 order by due_date`, [revPlan]);
      assert.equal(r3.rows.length, 2,
        `the reversal becomes due once its accrual has POSTED; got ${JSON.stringify(r3.rows)}`);
      const reversal = r3.rows.find((x) => x.leg === "reversal");
      assert.ok(reversal?.work_id, "the reversal is admitted");
      assert.equal(reversal.reverses_entry_id, accrualEntry,
        "…and the occurrence NAMES the entry it undoes");
      const reversalWork = await readWork(reversal.work_id);
      assert.ok(reversalWork.basis.memo.includes(accrualEntry),
        `the basis the reversal is authorised to post names it too (memo=${JSON.stringify(reversalWork.basis.memo)})`);
      assert.equal(reversalWork.basis.lines[0].credit_cents, revBasis.lines[0].debit_cents,
        "the accrual's debit is the reversal's credit");
      assert.equal(reversalWork.basis.lines[1].debit_cents, revBasis.lines[1].credit_cents,
        "…and the credit is the debit");

      // AND IT POSTS, WHICH IS WHY THIS LEG EXISTS. The entry id rides the MEMO — inside the
      // canonical form the digest is taken over, and the one basis field that reaches
      // `clara.journal_entries`. The first cut carried it as a new top-level basis key instead;
      // the digest was indeed unaffected, but `journalBasisSchema` in the FROZEN
      // claraWork.v1.tools.ts is `.strict()`, so the run's faithful echo failed validation and the
      // Work settled `failed`/`no_effect`. This assertion is the one that caught it.
      const reversalRow = await waitTerminal(reversal.work_id, readWork, 240000);
      assert.equal(reversalRow.status, "completed",
        `the reversal posted through the ordinary lane (error=${JSON.stringify(reversalRow.error)})`);
      assert.equal(await countCommitted(reversal.work_id), 1, "one committed receipt for the reversal");
      const postedMemo = await rig.rootQuery(
        `select je.memo from clara.journal_entries je
           join clara.operation_receipts rc on rc.effects->>'entry_id' = je.id::text
          where rc.work_id = $1 and rc.outcome = 'committed'`, [reversal.work_id]);
      assert.ok(postedMemo.rows[0]?.memo?.includes(accrualEntry),
        `the POSTED reversal names the entry it reverses in the ledger itself (memo=${JSON.stringify(postedMemo.rows[0]?.memo)})`);
      console.log(`[plan-e2e] PASS 5: the reversal waited for the accrual's entry (${accrualEntry}), named it, and posted`);
    } finally {
      engine.child.kill("SIGKILL");
      await waitExit(engine.child).catch(() => {});
    }
  }

  console.log(`[plan-e2e] OK — plan=${plan} work=${work} firm=${firm}`);
  await rig.endPool?.();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[plan-e2e] FAILED:", err?.stack ?? err);
  process.exit(1);
});
