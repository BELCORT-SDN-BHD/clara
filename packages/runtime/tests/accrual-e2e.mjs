// STANDALONE accrual e2e (#652). NOT a `node --test` file: it SPAWNS scripts/serve.mjs (through
// tests/work-journal-serve.mjs, which installs the scripted model first) as a CHILD process, so the
// engine can be crashed between a database commit and its workflow checkpoint and respawned against
// the SAME database — the pattern tests/work-journal-e2e.mjs established and
// tests/plan-occurrence-e2e.mjs applied to the plan lane. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   RELAY_TEST_MODE=1 node tests/accrual-e2e.mjs
//
// WHAT IT PROVES, and each of these needs a real Postgres world rather than a unit fake:
//
//   1. CONFIGURING AN ACCRUAL NEEDS NO ENGINE, AND POSTS NOTHING. `clara.create_accrual_adjustment`
//      writes the plan, its revision, the accrual record, the current period's occurrence and the
//      admitted Work in ONE commit with the process that will run it not yet started — and the
//      ledger is untouched. The configuration receipt (`clara.op_receipts`) exists; the execution
//      receipt (`clara.operation_receipts`) does not. That boundary is the ticket's own acceptance
//      line and this is where it is measured end to end.
//
//   2. A CRASH BETWEEN THE COMMIT AND THE CHECKPOINT REPLAYS ONTO THE SAME IDENTITY.
//      `CLARA_WORK_TEST_FAULT=exit_after_commit` exits the process the instant the database returns
//      a receipt for the accrual's posting. On respawn the WDK re-executes the step, the tool call
//      replays onto the same `logical_op_id`, and the estate ends with exactly ONE journal entry,
//      ONE committed receipt, ONE occurrence — and STILL ONE accrual record. The last clause is
//      #652's own: a replay that minted a second durable accrual would be two records of one
//      business fact.
//
//   3. THE REVERSAL WAITS FOR THE ACCRUAL'S ENTRY, THEN NAMES IT AND POSTS. An ADMITTED accrual is
//      not a POSTED one (0193's orphan wall). Once the accrual's own posting COMMITS, the belt
//      admits the reversal carrying that `entry_id` on the occurrence row AND in the basis, and the
//      reversal posts through the ordinary lane — the only place the design's other half can be
//      measured, because the entry id rides the MEMO rather than a new top-level basis key the
//      FROZEN `.strict()` tool schema would reject.
//
//   4. CANCELLATION AND RETRY LEAVE ONE ACCRUAL AND ONE EFFECT (C88.13's own four words: trigger,
//      one effect, retry, cancellation). A cancelled reversal Work is re-admitted only by the
//      HUMAN's explicitly scoped `clara.request_plan_catch_up` — never by the next belt pass — and
//      the re-attempt runs under the same occurrence identity, keeping its predecessor in the
//      occurrence's append-only `attempts` ledger. Through all of it there is exactly ONE row in
//      `clara.accrual_adjustments`.
//
//   5. THE READ SURFACE AGREES WITH THE LEDGER. `clara.get_accrual_adjustment` is asked at each
//      boundary and its `posted` flag, its occurrence list and its `reversal.reverses_entry_id`
//      are compared against `clara.journal_entries` and `clara.operation_receipts` directly.
//
// GATED. `CLARA_SKIP_ACCRUAL_E2E=1` opts out, and the file SKIPS CLEANLY (exit 0, with a printed
// reason) when migration 0222 is absent — its runtime half merges alongside its DB half, and a
// green e2e against a database with no `clara.accrual_adjustments` would be a lie, not a pass.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ephemeralPort } from "./ephemeral-port.mjs";
import { reconcilePlanOccurrences } from "../lib/plan-occurrences.mjs";
import { DB_NAME_SHAPE, allowedDbPattern, assertLocalDbGate } from "./local-db-gate.mjs";

if (process.env.CLARA_SKIP_ACCRUAL_E2E === "1") {
  console.log("[accrual-e2e] skipped (CLARA_SKIP_ACCRUAL_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate (#1018: shared with every other standalone World e2e driver),
// verbatim from plan-occurrence-e2e.mjs (its own header states the reasoning: a loopback host, a
// named rig database, and a parsed DSN that agrees with all three).
assertLocalDbGate({
  label: "accrual-e2e",
  pattern: allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}|${DB_NAME_SHAPE.PER_TICKET_3_OR_4}`),
  checkDsnParsed: true,
});

const PORT = process.env.ACCRUAL_E2E_PORT || (await ephemeralPort());
const ISSUER = "https://clara-accrual-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "accrual-" + randomUUID().replace(/-/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./work-journal-serve.mjs", import.meta.url));
const BASE = `http://127.0.0.1:${PORT}`;
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 14 * 60 * 1000;
setTimeout(() => {
  console.error(`\nACCRUAL E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  // THE TAIL IS KEPT so a readiness timeout can PRINT what the child was doing.
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
    select to_regclass('clara.accrual_adjustments') is not null as accrual_tbl,
           to_regprocedure('clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,int,text,date,date,text)') is not null as door,
           to_regprocedure('clara.get_accrual_adjustment(uuid)') is not null as read_door,
           to_regprocedure('clara.wake_due_plan_occurrences(integer,text)') is not null as scan
  `);
  const p = probe.rows[0] ?? {};
  if (!p.accrual_tbl || !p.door || !p.read_door || !p.scan) {
    console.log("[accrual-e2e] SKIPPED — migration 0222 (clara.accrual_adjustments + its doors) is not on this database");
    process.exit(0);
  }

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countCommitted = (work) =>
    rig.rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  const readWork = (id) => rig.rootQuery("select * from clara.accounting_work where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const accrualRows = (client) =>
    rig.rootQuery("select id, amount_cents, revision, plan_id from clara.accrual_adjustments where client_id=$1", [client])
      .then((r) => r.rows);
  const occurrencesOf = (plan) =>
    rig.rootQuery(
      `select id, due_date::text as due_date, leg, revision, attempt, intent_key, work_id,
              reverses_entry_id, jsonb_array_length(attempts) as attempt_count, outcome
         from clara.accounting_plan_occurrences where plan_id = $1 order by due_date`,
      [plan]).then((r) => r.rows);
  const readAccrual = (owner, id) =>
    rig.humanQuery(owner, "select clara.get_accrual_adjustment($1::uuid) as r", [id]).then((r) => r.rows[0].r);

  // ---- the world: a firm, a client, the expense leg and the NON-CONTROL liability leg ---------
  const { owner, firm, client } = await rig.buildFirm("accrual-e2e");
  for (const [code, name, type] of [
    ["6100", "Rent expense", "expense"],
    ["2020", "Accruals", "liability"],
  ]) {
    await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
      [client, code, name, type, rig.opk("acct")]);
  }

  // TODAY IN THE PLAN'S OWN ZONE. Never `new Date()`: the due arithmetic is Asia/Kuala_Lumpur's,
  // and a UTC "today" is a different calendar day for eight hours of every day.
  const zone = await rig.rootQuery(`
    select ((now() at time zone 'Asia/Kuala_Lumpur')::date)::text as today,
           (((now() at time zone 'Asia/Kuala_Lumpur')::date - interval '2 months')::date)::text as back,
           ((date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur')::date) - interval '1 day')::date)::text as prev_month_end`);
  const today = zone.rows[0].today;
  const effectiveFrom = `${zone.rows[0].back.slice(0, 7)}-01`;
  const accrualDue = zone.rows[0].prev_month_end;
  // THE AUTHORITY ENDS ON THE LAST ACCRUAL IT AUTHORISES, and the stated term brackets exactly
  // that window (0222's SIXTH MEASUREMENT): every occurrence then posts inside the term its own
  // line names, and the latest due date is in the past on EVERY calendar day — which is why this
  // e2e no longer skips its reversal legs at a month end (review round 1, A1 + A5). 0193's
  // `_plan_window_ceiling` (0193:1008) lifts an auto-reversing plan's ceiling to the reversal of
  // `effective_to`, so an authority ending on its last accrual can still undo it.
  const effectiveTo = accrualDue;
  const reversalDue = `${today.slice(0, 7)}-01`;

  // THE AUTHORITY IS A REAL ROW: an admitted Work carrying the instruction, exactly as the door
  // requires. An accrual citing anything this database does not hold is refused at configuration.
  const instruction = await rig.withActor({ role: "clara_runtime" }, (c) =>
    c.query(
      `select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,'user_direct','[]'::jsonb,$5::text) as r`,
      [client, owner, `accrual-e2e-instruction-${randomUUID()}`,
        JSON.stringify({
          posting_date: effectiveFrom, memo: "standing instruction: accrue the monthly rent", currency: "MYR",
          lines: [
            { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
            { account_code: "2020", debit_cents: 0, credit_cents: 120000, description: "accrual" },
          ],
        }), "gpt-5.6-terra"]));
  const instructionWork = instruction.rows[0].r.work_id;

  // =========================================================================
  // 1. CONFIGURING NEEDS NO ENGINE, AND POSTS NOTHING.
  // =========================================================================
  const entriesBefore = await countEntries(client);
  const configKey = rig.opk("accrual");
  const particulars = {
    expense_account_code: "6100",
    liability_account_code: "2020",
    amount_cents: 120000,
    currency: "MYR",
    service_period_start: effectiveFrom,
    service_period_end: effectiveTo,
    term_source: "human_stated",
    method: { rule: "stated_amount" },
    instruction: "the client's standing instruction of the engagement letter, minuted by the partner",
    memo: "monthly office rent accrual (accrual e2e)",
  };
  const configured = await rig.humanQuery(owner,
    `select clara.create_accrual_adjustment(
        p_client => $1::uuid, p_purpose => $2::text, p_authority_ref => $3::jsonb,
        p_accrual => $4::jsonb, p_frequency => 'monthly', p_day_rule => 'last_day_of_month',
        p_day_of_month => null, p_timezone => 'Asia/Kuala_Lumpur',
        p_effective_from => $5::date, p_effective_to => $6::date, p_op_key => $7::text) as r`,
    [client, "Monthly office rent accrual", JSON.stringify({ kind: "accounting_work", id: instructionWork }),
      JSON.stringify(particulars), effectiveFrom, effectiveTo, configKey]);
  const answer = configured.rows[0].r;
  const plan = answer.plan_id;
  const accrualId = answer.accrual_id;

  assert.equal(answer.kind, "reversing_journal",
    "an accrual rides the DELIVERED reversing_journal contract — it mints no plan kind");
  assert.equal(answer.posted, false, "accepting a configuration posts nothing");
  assert.equal(answer.configuration_receipt?.fn, "create_accrual_adjustment");
  assert.equal(answer.configuration_receipt?.op_key, configKey);
  assert.equal(answer.occurrence?.admitted, true, "the current period's occurrence was admitted");
  assert.equal(answer.occurrence?.leg, "primary");
  assert.equal(answer.occurrence?.due_date, accrualDue,
    "…on LAST month's month end, the latest due event inside the authority window");
  const accrualWork = answer.occurrence.work_id;
  assert.ok(accrualWork, "…and it names a real Work");

  const configReceipts = await rig.rootQuery(
    "select fn from clara.op_receipts where firm_id=$1 and op_key like $2 order by fn", [firm, `${configKey}%`]);
  assert.deepEqual(configReceipts.rows.map((r) => r.fn), ["create_accounting_plan", "create_accrual_adjustment"],
    "TWO configuration reservations on DISTINCT fn values: the outer door's own, and the plan verb "
    + "it nests on the derived key");

  assert.equal((await accrualRows(client)).length, 1, "ONE accrual record");
  assert.equal((await occurrencesOf(plan)).length, 1, "ONE occurrence");
  assert.equal(await countEntries(client), entriesBefore, "and the LEDGER is untouched: configuration is not posting");
  assert.equal(await countCommitted(accrualWork), 0, "no EXECUTION receipt exists yet");
  const queued = await readWork(accrualWork);
  assert.equal(queued.status, "queued", "the Work is queued with NO engine running");
  assert.equal(queued.purpose, "journal_entry",
    "an accrual occurrence is a journal_entry Work — this lane mints no accounting_work purpose");
  assert.equal(queued.adjustment_basis, null,
    "…and carries NO adjustment_basis: the posting core's #643 arm would write clara.periodic_adjustments, "
    + "whose purpose CHECK is closed to two values");
  assert.equal(queued.initiator, owner, "it runs under the accrual's authorising human");

  const read1 = await readAccrual(owner, accrualId);
  assert.equal(read1.posted, false, "the read agrees: nothing posted");
  assert.equal(read1.amount_cents, 120000);
  assert.equal(read1.term_source, "human_stated");
  console.log(`[accrual-e2e] PASS 1: accrual ${accrualId} configured on plan ${plan}; one commit, no engine, nothing posted`);

  // =========================================================================
  // 2. A CRASH BETWEEN THE COMMIT AND THE CHECKPOINT REPLAYS ONTO THE SAME IDENTITY.
  // =========================================================================
  //
  // QUIESCE EVERY OTHER QUEUED WORK FIRST, for plan-occurrence-e2e.mjs's own stated reason:
  // `CLARA_WORK_TEST_FAULT=exit_after_commit` is a PROCESS-wide fault and the reconciler dispatches
  // oldest-first, so on a local per-ticket rig the crash would otherwise land on a stranger's Work.
  const strays = await rig.rootQuery(
    `select t.id from clara.agent_tasks t
       join clara.accounting_work w on w.id = t.work_id
      where t.kind = 'accounting_work' and t.status in ('queued','running')
        and w.id <> $1 and w.status not in ('completed','refused','failed','cancelled','expired')`,
    [accrualWork]);
  for (const row of strays.rows) {
    await rig.withActor({ role: "clara_runtime" }, (c) =>
      c.query(
        "select clara.settle_work_run($1::uuid,'expired'::text,null::text,$2::jsonb,null::jsonb) as r",
        [row.id, JSON.stringify({ reason: "quiesced by accrual-e2e so the process-wide commit fault lands on the accrual's own Work" })],
      )).catch(() => {});
  }
  if (strays.rows.length > 0) {
    console.log(`[accrual-e2e] quiesced ${strays.rows.length} unrelated queued Work item(s)`);
  }

  const faulty = spawnServe({ CLARA_WORK_TEST_FAULT: "exit_after_commit", CLARA_WORK_TEST_SCRIPT: "post" });
  try {
    console.log("[accrual-e2e] engine spawned with exit_after_commit armed; waiting for the accrual's posting to commit and the fault to fire");
    await waitExit(faulty.child, 240000);
    assert.notEqual(faulty.state.exitInfo?.code, 0,
      "the engine must have exited through the commit fault, not shut down cleanly");
    assert.ok(
      (faulty.state.tail ?? []).join("").includes(`exit_after_commit — exiting after commit, before checkpoint (work=${accrualWork})`),
      `the fault must have fired on THIS accrual's Work (${accrualWork}); tail was:
${(faulty.state.tail ?? []).join("")}`,
    );
  } finally {
    if (!faulty.state.exited) faulty.child.kill("SIGKILL");
  }

  assert.equal(await countCommitted(accrualWork), 1, "exactly one committed receipt survived the crash");
  assert.equal(await countEntries(client), entriesBefore + 1, "exactly one journal entry exists after the crash");
  assert.equal((await accrualRows(client)).length, 1, "…and STILL exactly one accrual record");

  // PAUSE THE PLAN BEFORE THE RESPAWN, and the reason is a measurement rather than tidiness: the
  // respawned engine runs the WHOLE reconciler, so the instant the accrual's entry lands its plan's
  // reversal becomes admissible and that engine admits AND posts it — which is the lane working,
  // and which would leave legs 3 and 4 with nothing left to cancel. `clara.pause_accounting_plan`
  // blocks FUTURE admission only and never touches an already admitted Work (0193's own comment),
  // so the accrual's own replay is entirely unaffected and the reversal simply waits for §3 to
  // resume the plan and drive the belt by hand.
  await rig.humanQuery(owner, "select clara.pause_accounting_plan($1::uuid,$2::text,$3::text) as r",
    [plan, "held by accrual-e2e so the reversal leg is driven deliberately", rig.opk("accrual-pause")]);

  const respawn = spawnServe({ CLARA_WORK_TEST_SCRIPT: "post" });
  let accrualEntry = null;
  try {
    await waitReady(respawn);
    const row = await waitTerminal(accrualWork, readWork, 240000);
    assert.equal(row.status, "completed",
      `the replayed run settles COMPLETED over a committed receipt (error=${JSON.stringify(row.error)})`);
    const entry = await rig.rootQuery(
      "select effects->>'entry_id' as e from clara.operation_receipts where work_id=$1 and outcome='committed'",
      [accrualWork]);
    accrualEntry = entry.rows[0]?.e;
    assert.ok(accrualEntry, "the committed receipt names its journal entry");
  } finally {
    respawn.child.kill("SIGKILL");
    await waitExit(respawn.child).catch(() => {});
  }
  // THE REPLAY CLAIM IS PER OPERATION IDENTITY, NOT PER CLIENT, and this is why: the respawned
  // engine runs the WHOLE reconciler, so the moment the accrual's entry is on the books its plan's
  // REVERSAL becomes admissible and that same engine may admit and post it before it is killed.
  // That is the lane working, not a defect — so the crash-replay assertions are made about the
  // ACCRUAL'S OWN identity, which is what "replayed onto the same logical identity" means.
  assert.equal(await countCommitted(accrualWork), 1, "STILL exactly one committed receipt");
  const accrualEntries = await rig.rootQuery(
    `select count(distinct rc.effects->>'entry_id')::int as n from clara.operation_receipts rc
      where rc.work_id = $1 and rc.outcome = 'committed'`, [accrualWork]);
  assert.equal(accrualEntries.rows[0].n, 1,
    "STILL exactly ONE journal entry for the accrual's own logical identity after the replay");
  const primaryOccs = (await occurrencesOf(plan)).filter((o) => o.leg === "primary");
  assert.equal(primaryOccs.length, 1, "STILL exactly one accrual occurrence");
  assert.equal(primaryOccs[0].work_id, accrualWork, "…and it still names the Work it named before the crash");
  assert.equal((await accrualRows(client)).length, 1, "STILL exactly one accrual record");

  const read2 = await readAccrual(owner, accrualId);
  assert.equal(read2.posted, true, "…and only NOW does the read say posted");
  const primary = read2.occurrences.find((o) => o.leg === "primary");
  assert.equal(primary.entry_id, accrualEntry, "the read joins occurrence → committed receipt → entry");
  assert.ok(primary.receipt_id);
  console.log(`[accrual-e2e] PASS 2: the crash between commit and checkpoint replayed onto entry ${accrualEntry}; one entry, one receipt, one occurrence, one accrual`);

  // =========================================================================
  // 3. THE REVERSAL WAITS FOR THE ACCRUAL'S ENTRY, THEN NAMES IT AND POSTS.
  // =========================================================================
  {
    const beltOnce = () => rig.withActor({ role: "clara_runtime" }, (c) =>
      reconcilePlanOccurrences(c, { limit: 50, log: () => {} }));

    // THE PLAN IS STILL PAUSED FROM LEG 2, so a belt pass admits NOTHING: pausing blocks future
    // admission, and the reversal is a future due event even though its accrual is on the books.
    await beltOnce();
    assert.equal((await occurrencesOf(plan)).length, 1,
      "a paused plan admits no reversal, however posted its accrual is");

    await rig.humanQuery(owner, "select clara.resume_accounting_plan($1::uuid,$2::text) as r",
      [plan, rig.opk("accrual-resume")]);
    await beltOnce();
    const r3 = await occurrencesOf(plan);
    assert.equal(r3.length, 2, `the reversal becomes due once its accrual has POSTED; got ${JSON.stringify(r3.map((x) => [x.due_date, x.leg]))}`);
    const reversal = r3.find((x) => x.leg === "reversal");
    assert.ok(reversal?.work_id, "the reversal is admitted");
    assert.equal(reversal.due_date, reversalDue, "a reversal falls on the first of the month after its accrual");
    assert.equal(reversal.reverses_entry_id, accrualEntry, "…and the occurrence NAMES the entry it undoes");

    const revWork = await readWork(reversal.work_id);
    assert.ok(revWork.basis.memo.includes(accrualEntry),
      `the basis the reversal is authorised to post names it too (memo=${JSON.stringify(revWork.basis.memo)})`);
    assert.equal(revWork.basis.lines[0].credit_cents, 120000, "the accrual's debit is the reversal's credit");
    assert.equal(revWork.basis.lines[1].debit_cents, 120000, "…and the credit is the debit");

    const read3 = await readAccrual(owner, accrualId);
    assert.equal(read3.reversal?.reverses_entry_id, accrualEntry,
      "and the accrual's own read surfaces the bound reversal, where a surface can render it");
    assert.equal((await accrualRows(client)).length, 1,
      "a scan-admitted occurrence never mints a second accrual record — one business fact, one row");

    // =========================================================================
    // 4. CANCELLATION AND RETRY LEAVE ONE ACCRUAL AND ONE EFFECT.
    // =========================================================================
    //
    // CANCEL WITH NO ENGINE RUNNING, which is the deterministic half of 0184's ordering boundary:
    // nothing is settling, so the cancel wins outright and the Work posts nothing.
    // ON THE RUNTIME ROLE, because that is the only lane granted the cancel door
    // (0184:1365 — `clara_runtime` alone; a human reaches it through the runtime's own
    // authenticated route, never through PostgREST). The AUTHOR is still the human, passed as an
    // argument, exactly as that route passes it.
    const cancelled = await rig.withActor({ role: "clara_runtime" }, (c) =>
      c.query("select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as r",
        [reversal.work_id, owner, rig.opk("accrual-cancel")]));
    assert.ok(cancelled.rows[0].r, "the cancel door answered");
    const cancelledRow = await readWork(reversal.work_id);
    assert.ok(["cancelled", "stopping"].includes(cancelledRow.status),
      `the reversal Work is cancelled or stopping (got ${cancelledRow.status})`);
    assert.equal(await countCommitted(reversal.work_id), 0, "a cancelled reversal posted nothing");

    // THE BELT DOES NOT OVERRULE THE HUMAN. A cancelled due event stays cancelled until a person
    // asks for it again, by an explicitly scoped window.
    await beltOnce();
    const afterBelt = await occurrencesOf(plan);
    assert.equal(afterBelt.length, 2, "the belt admitted nothing new");
    assert.equal(afterBelt.find((x) => x.leg === "reversal").work_id, reversal.work_id,
      "…and did not re-admit the cancelled reversal: that is the human's explicitly scoped catch-up");

    const caught = await rig.humanQuery(owner,
      "select clara.request_plan_catch_up($1::uuid,$2::date,$3::date,$4::text) as r",
      [plan, reversalDue, reversalDue, rig.opk("accrual-catchup")]);
    assert.equal(caught.rows[0].r.admitted, 1, "the human's catch-up re-admits the cancelled period");
    const afterRetry = await occurrencesOf(plan);
    assert.equal(afterRetry.length, 2, "STILL two occurrences — a re-attempt is the SAME due event");
    const retried = afterRetry.find((x) => x.leg === "reversal");
    assert.equal(retried.attempt, 2, "…under attempt 2");
    assert.equal(retried.attempt_count, 2,
      "…and its predecessor is kept in the occurrence's append-only attempts ledger");
    assert.notEqual(retried.work_id, reversal.work_id, "the retry is a NEW Work under the same identity");
    assert.equal(retried.reverses_entry_id, accrualEntry, "…still bound to the accrual's own entry");
    assert.equal((await accrualRows(client)).length, 1,
      "THROUGH ALL OF IT: one accrual record. Trigger, one effect, retry and cancellation "
      + "(C88.13) leave one durable accounting fact");

    const engine = spawnServe({ CLARA_WORK_TEST_SCRIPT: "post" });
    try {
      await waitReady(engine);
      const posted = await waitTerminal(retried.work_id, readWork, 240000);
      assert.equal(posted.status, "completed",
        `the retried reversal posted through the ordinary lane (error=${JSON.stringify(posted.error)})`);
      assert.equal(await countCommitted(retried.work_id), 1, "one committed receipt for the reversal");
      const postedMemo = await rig.rootQuery(
        `select je.memo from clara.journal_entries je
           join clara.operation_receipts rc on rc.effects->>'entry_id' = je.id::text
          where rc.work_id = $1 and rc.outcome = 'committed'`, [retried.work_id]);
      assert.ok(postedMemo.rows[0]?.memo?.includes(accrualEntry),
        `the POSTED reversal names the entry it reverses in the ledger itself (memo=${JSON.stringify(postedMemo.rows[0]?.memo)})`);
      assert.equal(await countEntries(client), entriesBefore + 2,
        "two entries in all: the accrual and its reversal — and not one more");
    } finally {
      engine.child.kill("SIGKILL");
      await waitExit(engine.child).catch(() => {});
    }
    console.log(`[accrual-e2e] PASS 3+4: the reversal waited for entry ${accrualEntry}, named it, survived a cancel and a human catch-up retry, and posted — one accrual record throughout`);
  }

  console.log(`[accrual-e2e] OK — accrual=${accrualId} plan=${plan} work=${accrualWork} firm=${firm}`);
  await rig.endPool?.();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[accrual-e2e] FAILED:", err?.stack ?? err);
  process.exit(1);
});
