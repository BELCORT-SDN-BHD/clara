// STANDALONE prepayment-amortisation occurrence e2e (#653). NOT a `node --test` file: it SPAWNS
// scripts/serve.mjs (through tests/work-journal-serve.mjs, which installs the scripted model
// first) as a CHILD process, so the engine can be crashed between a database commit and its
// workflow checkpoint and respawned against the SAME database — the pattern
// tests/plan-occurrence-e2e.mjs established for #640 and this file extends by one fact. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   RELAY_TEST_MODE=1 node tests/prepayment-occurrence-e2e.mjs
//
// WHY IT EXISTS BESIDE plan-occurrence-e2e.mjs RATHER THAN INSIDE IT. #640's e2e proves the plan
// lane's identity and replay for a CONSTANT basis. The one fact #653 adds cannot be measured
// there, and it is the fact the whole slice turns on:
//
//   THE FINAL PERIOD POSTS THE RESIDUAL, THROUGH THE REAL FROZEN TOOL SCHEMA.
//   `clara._plan_occurrence_basis`'s per-period override rewrites the LINES of the basis the run
//   is bound to, and the run echoes that basis back through `claraWork.v1.tools.ts`'s `.strict()`
//   `journalBasisSchema`, after which `clara._record_journal_entry_core` recomputes the digest FROM
//   THE ECHO and compares it with the admitted one. A unit cell cannot prove a varying amount
//   survives that round trip; only a real run can. 100,001 cents over two months is 50,000 then
//   50,001, so "the residual, not the base" is a different NUMBER in the ledger rather than a
//   property asserted about a jsonb column.
//
// WHAT ELSE IT PROVES, each needing a real Postgres world rather than a unit fake:
//
//   1. TWO BELT PASSES IN ONE CYCLE LEAVE ONE OCCURRENCE. Two `reconcilePlanOccurrences` calls
//      issued CONCURRENTLY on two independent clara_runtime connections leave EXACTLY ONE
//      occurrence row and EXACTLY ONE `clara.accounting_work` row for the due event. (Which of the
//      two converges is not asserted, for the reason #640's e2e states: it depends on where each
//      candidate query fell relative to the other's commit, and both are correct. The converge
//      ANSWER is pinned under a real lock barrier by
//      `packages/db/tests/prepayment-occurrences.test.mjs`'s `p653.occ.identity`.)
//   2. A CRASH BETWEEN THE COMMIT AND THE CHECKPOINT REPLAYS ONTO THE SAME IDENTITY, and the
//      estate ends with ONE journal entry, ONE committed receipt and ONE occurrence — carrying the
//      RESIDUAL, not a second base-amount entry.
//   3. A THIRD BELT PASS ADMITS NOTHING NEW.
//
// WHAT IT DOES NOT PROVE, said plainly: the model is SCRIPTED (`work-journal-serve.mjs:88` brace-
// matches the admitted basis out of the envelope), so per AC8 this is LOCAL, SUPPLEMENTARY
// evidence. It is not a provider run and it is not hosted evidence.
//
// GATED. `CLARA_SKIP_PREPAYMENT_E2E=1` opts out, and the file SKIPS CLEANLY (exit 0, with a
// printed reason) when migration 0223 is absent — its runtime half merges alongside its DB half,
// and a green e2e against a database with no `clara.prepayment_schedules` would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ephemeralPort } from "./ephemeral-port.mjs";
import { reconcilePlanOccurrences } from "../lib/plan-occurrences.mjs";

if (process.env.CLARA_SKIP_PREPAYMENT_E2E === "1") {
  console.log("[prepay-e2e] skipped (CLARA_SKIP_PREPAYMENT_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate, byte-for-byte the plan e2e's (its own header explains the numeric
// arm: the per-ticket rig databases `clara_640`, `clara_653`, … on a loopback host).
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci|[0-9]{3,4})$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("prepayment-occurrence-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci,clara_<digits>}");
}
{
  if (!process.env.WORKFLOW_POSTGRES_URL) throw new Error("prepayment-occurrence-e2e needs WORKFLOW_POSTGRES_URL");
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("prepayment-occurrence-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.PREPAY_E2E_PORT || (await ephemeralPort());
const ISSUER = "https://clara-prepay-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "prepay-" + randomUUID().replace(/-/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./work-journal-serve.mjs", import.meta.url));
const BASE = `http://127.0.0.1:${PORT}`;
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 12 * 60 * 1000;
setTimeout(() => {
  console.error(`\nPREPAYMENT OCCURRENCE E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regclass('clara.prepayment_schedules') is not null as rel,
           to_regprocedure('clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)') is not null as door,
           to_regprocedure('clara._plan_amortisation_period_line(uuid,date)') is not null as resolver,
           to_regprocedure('clara.prepayment_schedule_v1(uuid,uuid)') is not null as evaluator
  `);
  const p0 = probe.rows[0] ?? {};
  if (!p0.rel || !p0.door || !p0.resolver || !p0.evaluator) {
    console.log("[prepay-e2e] SKIPPED — migration 0223 (clara.prepayment_schedules + clara.create_prepayment_schedule) is not on this database");
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
  /** The posted entry's own lines, from the ledger — never from the basis the run echoed. */
  const linesOfEntry = (entry) =>
    rig.rootQuery(
      "select account_code, debit_cents::int as debit_cents, credit_cents::int as credit_cents from clara.journal_lines where entry_id = $1 order by account_code",
      [entry]).then((r) => r.rows);

  // ---- THE WORLD: a firm, a bookkeeper (maker != checker), a client, three accounts, a fiscal
  // year, a verified document filed to the client, an APPROVED recognition entry that binds it and
  // debits exactly one asset line, the document's HUMAN-STATED service period, and an instruction
  // row the schedule can cite. Every step through a governed door except the document seed, which
  // is the estate's own `clara._seed_verified_document` fixture verb.
  const PREPAID = "19000001";
  const EXPENSE = "59000001";
  const BANK = "11000001";
  const TOTAL = 100001;               // two months: 50,000 then 50,001 — the residual is VISIBLE
  const { owner, firm, client } = await rig.buildFirm("prepay-e2e");
  const checker = await rig.addMember(owner, firm, { role: "bookkeeper", prefix: "chk" });
  const checkerSub = typeof checker === "string" ? checker : (checker.user ?? checker.sub ?? checker.userId);

  const zone = await rig.rootQuery(
    `select ((now() at time zone 'Asia/Kuala_Lumpur')::date)::text as today,
            ((date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur')) - interval '4 months')::date)::text as term_start`);
  const today = zone.rows[0].today;
  const termStart = zone.rows[0].term_start;
  const fyStart = `${termStart.slice(0, 4)}-01-01`;
  const termEnd = (await rig.rootQuery(
    "select ((date_trunc('month', $1::timestamp) + interval '2 months' - interval '1 day')::date)::text as d",
    [termStart])).rows[0].d;
  const postingDate = (await rig.rootQuery("select ($1::date + 14)::text as d", [termStart])).rows[0].d;

  for (const [code, name, type] of [
    [PREPAID, "Prepayments", "asset"], [EXPENSE, "Subscriptions", "expense"], [BANK, "Maybank current", "asset"],
  ]) {
    await rig.humanQuery(owner,
      "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
      [client, code, name, type, rig.opk("acct")]);
  }
  const fy = await rig.humanQuery(owner,
    "select clara.propose_fiscal_year(p_client=>$1,p_starts_on=>$2::date) as r", [client, fyStart]);
  await rig.humanQuery(owner,
    "select clara.open_fiscal_year(p_client=>$1,p_label=>$2,p_starts_on=>$3::date,p_ends_on=>$4::date,p_length_reason=>null,p_op_key=>$5) as r",
    [client, `FY ${fyStart}`, fyStart, fy.rows[0].r.ends_on, rig.opk("fy")]);

  const digest = rig.sha(randomUUID());
  const doc = await rig.rootQuery(
    `select clara._seed_verified_document(p_firm=>$1::uuid, p_client=>null, p_sha256=>$2,
       p_filename=>$3, p_mime=>'application/pdf', p_bytes=>2048, p_storage_path=>$4,
       p_page_count=>1) as r`,
    [firm, digest, `prepay-${digest.slice(0, 8)}.pdf`, `firms/${firm}/docs/${digest}.pdf`]);
  const documentId = doc.rows[0].r.document_id ?? doc.rows[0].r.document;
  await rig.humanQuery(owner,
    "select clara.file_document(p_document=>$1::uuid,p_client=>$2::uuid,p_resolution=>null,p_op_key=>$3) as r",
    [documentId, client, rig.opk("file")]);
  const res = await rig.humanQuery(owner,
    `select clara.record_client_resolution(p_client=>$1::uuid,p_subject_kind=>'document',
       p_subject=>$2::uuid,p_confidence=>1.0,p_method=>'manual',p_evidence=>'{}'::jsonb,p_op_key=>$3) as r`,
    [client, documentId, rig.opk("res")]);
  const resolutionId = res.rows[0].r.resolution_id ?? res.rows[0].r.resolution ?? res.rows[0].r.id;

  const draft = await rig.humanQuery(owner,
    `select clara.draft_entry(p_client=>$1::uuid,p_resolution=>$2::uuid,p_posting_date=>$3::date,
       p_memo=>$4,p_lines=>$5::jsonb,p_document=>$6::uuid,p_sha256=>$7,p_op_key=>$8) as r`,
    [client, resolutionId, postingDate, "prepaid subscription (653 e2e)",
      JSON.stringify([
        { account_code: PREPAID, debit_cents: TOTAL, credit_cents: 0, description: "prepaid" },
        { account_code: BANK, debit_cents: 0, credit_cents: TOTAL, description: "paid" },
      ]), documentId, digest, rig.opk("draft")]);
  const recognition = draft.rows[0].r.entry_id;
  // MAKER != CHECKER, the estate's own rule: an entry that never cleared it would make every
  // "approved" assertion below vacuous.
  await rig.humanQuery(checkerSub,
    "select clara.approve_entry(p_entry=>$1::uuid,p_expected_revision=>$2::uuid,p_attestation=>null,p_op_key=>$3) as r",
    [recognition, draft.rows[0].r.revision_token, rig.opk("appr")]);
  await rig.humanQuery(owner,
    "select clara.record_document_service_period($1::uuid,$2::date,$3::date,$4,$5) as r",
    [documentId, termStart, termEnd, "the invoice states the service term on its face", rig.opk("term")]);

  const instr = await rig.withActor({ role: "clara_runtime" }, (c) =>
    c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,'user_direct','[]'::jsonb,$5::text) as r",
      [client, owner, `p653-instruction-${randomUUID()}`, JSON.stringify({
        posting_date: postingDate, memo: "standing instruction: amortise the subscription", currency: "MYR",
        lines: [
          { account_code: EXPENSE, debit_cents: 1000, credit_cents: 0, description: "instruction" },
          { account_code: BANK, debit_cents: 0, credit_cents: 1000, description: "instruction" },
        ],
      }), "gpt-5.6-terra"]));
  const instructionWork = instr.rows[0].r.work_id;

  const sched = await rig.humanQuery(owner,
    `select clara.create_prepayment_schedule(p_client=>$1::uuid,p_source_entry=>$2::uuid,
       p_expense_account=>$3,p_expense_basis=>$4,p_purpose=>$5,p_authority_ref=>$6::jsonb,p_op_key=>$7) as r`,
    [client, recognition, EXPENSE, "the invoice narrates a twelve-month subscription service",
      "Prepaid subscription amortisation",
      JSON.stringify({ kind: "accounting_work", id: instructionWork }), rig.opk("sched")]);
  const schedule = sched.rows[0].r;
  const plan = schedule.plan_id;
  const lines = schedule.period_lines;
  assert.equal(schedule.period_count, 2, "a two-month term charges two whole calendar months");
  assert.equal(Number(lines[0].amount_cents), 50000, "the base period");
  assert.equal(Number(lines[1].amount_cents), 50001, "…and the FINAL period carries the residual");
  const finalDue = String(lines[1].period_end).slice(0, 10);
  const baseDue = String(lines[0].period_end).slice(0, 10);
  console.log(`[prepay-e2e] schedule ${schedule.schedule_id} on plan ${plan}: ${baseDue}=50000, ${finalDue}=50001 (today ${today})`);

  // =========================================================================
  // 1. TWO BELT PASSES IN ONE CYCLE, AND THE RESIDUAL IS WHAT WAS ADMITTED.
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
  assert.equal(occ1[0].due_date, finalDue,
    "the scan's candidate is the LATEST due event at or before today — for a term that ended, the FINAL period");
  assert.ok(occ1[0].work_id, "the occurrence names its Work");
  const works = await rig.rootQuery(
    "select id from clara.accounting_work where client_id=$1 and intent_key=$2", [client, occ1[0].intent_key]);
  assert.equal(works.rows.length, 1, "exactly ONE Work carries the due event's intent key");
  const work = works.rows[0].id;
  assert.equal(work, occ1[0].work_id);
  assert.equal(await countEntries(client), entriesBefore, "admission posts nothing by itself");

  const admittedRow = await readWork(work);
  assert.equal(admittedRow.status, "queued", "the Work is queued with NO engine running");
  assert.equal(admittedRow.purpose, "journal_entry",
    "an amortisation occurrence is an ORDINARY journal Work — no new purpose, no core recut");
  assert.equal(admittedRow.initiator, owner, "it runs under the plan's authorising human");
  assert.equal(admittedRow.basis.posting_date, finalDue, "…posting on the occurrence's own due date");
  const admittedDebit = admittedRow.basis.lines.find((l) => Number(l.debit_cents) > 0);
  assert.equal(Number(admittedDebit.debit_cents), 50001,
    "THE ADMITTED BASIS CARRIES THE RESIDUAL, not the revision's constant 50,000");
  assert.equal(admittedDebit.account_code, EXPENSE, "…charged to the judged expense account");
  console.log(`[prepay-e2e] PASS 1: two concurrent belt passes → one occurrence, one Work (${work}) carrying 50001`);

  // =========================================================================
  // 2. THE ENGINE DISPATCHES IT, AND A CRASH BETWEEN COMMIT AND CHECKPOINT REPLAYS.
  // =========================================================================
  //
  // QUIESCE EVERY OTHER QUEUED WORK FIRST, and say why: `CLARA_WORK_TEST_FAULT=exit_after_commit`
  // is a PROCESS-wide fault that exits on the FIRST commit the engine makes, whichever Work that
  // belongs to. On a local per-ticket rig the db batteries leave queued Work behind, so without
  // this the crash would land on a stranger's Work and this leg would measure nothing. It
  // terminalises through the estate's OWN verb (`clara.settle_work_run`), never an UPDATE.
  const strays = await rig.rootQuery(
    `select t.id from clara.agent_tasks t
       join clara.accounting_work w on w.id = t.work_id
      where t.kind = 'accounting_work' and t.status in ('queued','running')
        and w.id <> $1 and w.status not in ('completed','refused','failed','cancelled','expired')`,
    [work]);
  for (const row of strays.rows) {
    await rig.withActor({ role: "clara_runtime" }, (c) =>
      c.query("select clara.settle_work_run($1::uuid,'expired'::text,null::text,$2::jsonb,null::jsonb) as r",
        [row.id, JSON.stringify({ reason: "quiesced by prepayment-occurrence-e2e so the process-wide commit fault lands on this schedule's own Work" })],
      )).catch(() => {});
  }
  if (strays.rows.length > 0) {
    console.log(`[prepay-e2e] quiesced ${strays.rows.length} unrelated queued Work item(s)`);
  }

  const faulty = spawnServe({ CLARA_WORK_TEST_FAULT: "exit_after_commit", CLARA_WORK_TEST_SCRIPT: "post" });
  try {
    // This leg deliberately does not wait for `/ready`: the reconciler re-enqueues a queued Work
    // past its grace and the commit follows immediately, so the fault can fire BEFORE readiness
    // would first answer 200. The EXIT is the outcome, so the exit is what it waits for.
    console.log("[prepay-e2e] engine spawned with exit_after_commit armed");
    await waitExit(faulty.child, 240000);
    console.log(`[prepay-e2e] engine exited as scripted: ${JSON.stringify(faulty.state.exitInfo)}`);
    assert.notEqual(faulty.state.exitInfo?.code, 0,
      "the engine must have exited through the commit fault, not shut down cleanly");
    assert.ok(
      (faulty.state.tail ?? []).join("").includes(`exit_after_commit — exiting after commit, before checkpoint (work=${work})`),
      `the fault must have fired on THIS schedule's Work (${work}); tail was:
${(faulty.state.tail ?? []).join("")}`);
  } finally {
    if (!faulty.state.exited) faulty.child.kill("SIGKILL");
  }

  assert.equal(await countCommitted(work), 1, "exactly one committed receipt survived the crash");
  assert.equal(await countEntries(client), entriesBefore + 1, "exactly one journal entry exists after the crash");

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
      `the replayed run settles COMPLETED over a committed receipt (error=${JSON.stringify(row.error)})`);
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

  // THE LEDGER ITSELF CARRIES THE RESIDUAL. This is the assertion the whole file exists for: the
  // per-period override survived the frozen `.strict()` tool schema, the model's faithful echo and
  // the digest comparison, and what reached `clara.journal_lines` is 50,001 — not the revision's
  // stored 50,000, and not two entries of 50,000 and 1.
  const receipt = await rig.rootQuery(
    "select effects->>'entry_id' as entry from clara.operation_receipts where work_id=$1 and outcome='committed' order by created_at limit 1",
    [work]);
  const postedLines = await linesOfEntry(receipt.rows[0].entry);
  const debit = postedLines.find((l) => l.debit_cents > 0);
  const credit = postedLines.find((l) => l.credit_cents > 0);
  assert.equal(debit.account_code, EXPENSE);
  assert.equal(debit.debit_cents, 50001, "THE POSTED ENTRY CHARGES THE RESIDUAL");
  assert.equal(credit.account_code, PREPAID);
  assert.equal(credit.credit_cents, 50001, "…and releases the same amount from the prepaid asset");
  console.log("[prepay-e2e] PASS 2+3: the crash between commit and checkpoint replayed onto the same identity; the ledger holds ONE entry charging 50001");

  // =========================================================================
  // 4. A BELT PASS AFTER ALL OF THAT ADMITS NOTHING NEW.
  // =========================================================================
  const after = await rig.withActor({ role: "clara_runtime" }, (c) =>
    reconcilePlanOccurrences(c, { limit: 50, log: () => {} }));
  assert.equal(after.planOk, true);
  const occ3 = await occurrencesOf(plan);
  assert.equal(occ3.length, 1, "the due event's identity is its occurrence row, whatever happened to its Work");
  assert.equal(await countEntries(client), entriesBefore + 1);
  console.log("[prepay-e2e] PASS 4: a further belt pass admitted nothing new");

  // =========================================================================
  // 5. THE EARLIER PERIOD IS A HUMAN'S EXPLICIT CATCH-UP, AND IT CARRIES THE BASE.
  //
  // The scan never backfills — a future schedule does not authorise history — so the first month
  // of an already-finished term is reachable only through `clara.request_plan_catch_up`'s explicit
  // window. That it admits the BASE (50,000) while the period already posted carries the RESIDUAL
  // (50,001) is the per-period seam measured a second way, on the real lane.
  // =========================================================================
  const catchUp = await rig.humanQuery(owner,
    "select clara.request_plan_catch_up(p_plan=>$1::uuid,p_from=>$2::date,p_to=>$3::date,p_op_key=>$4) as r",
    [plan, baseDue, finalDue, rig.opk("catchup")]);
  assert.equal(catchUp.rows[0].r.admitted, 1, "exactly the one outstanding period is admitted");
  const occ4 = await occurrencesOf(plan);
  assert.equal(occ4.length, 2);
  const baseOcc = occ4.find((o) => o.due_date === baseDue);
  const baseWork = await readWork(baseOcc.work_id);
  const baseDebit = baseWork.basis.lines.find((l) => Number(l.debit_cents) > 0);
  assert.equal(Number(baseDebit.debit_cents), 50000,
    "the earlier period admits ITS OWN amount — the base, not the residual it was admitted beside");
  console.log("[prepay-e2e] PASS 5: the explicit catch-up admitted the earlier period carrying 50000");

  console.log("\nPREPAYMENT OCCURRENCE E2E: PASS (LOCAL, scripted-model — supplementary evidence per AC8)");
  await rig.endPool();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("\nPREPAYMENT OCCURRENCE E2E: FAIL\n", e);
  process.exit(1);
});
