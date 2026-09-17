// STANDALONE fixed-asset acquisition e2e (#639). NOT a `node --test` file: it SPAWNS
// scripts/serve.mjs (through tests/work-journal-serve.mjs, which installs the scripted model
// first) as a CHILD process, so the engine can be crashed mid-run and respawned against the SAME
// database — the pattern tests/interview-kill-resume-e2e.mjs established and
// tests/work-journal-e2e.mjs and tests/periodic-adjustment-e2e.mjs reuse.
// Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   node tests/fixed-asset-acquisition-e2e.mjs
//
// WHY THIS FILE EXISTS AT ALL. Migration 0216's birth trigger is DEFERRED: it fires at COMMIT,
// inside the same transaction the posting core opened, in a process the run controls. Every db
// cell drives it through `clara.wake_record_journal_entry` on one connection; only a real Postgres
// World with a real engine can show it surviving the things a production run actually does — an
// HTTP admission, a workflow checkpoint, a crash in the window between the database commit and
// that checkpoint, and a respawned engine re-executing the step.
//
// WHAT IT PROVES, and every one of these needs a real World plus a real HTTP boundary:
//   1. THE ADMISSION BARRIER AND THE COMMIT. One POST to `/api/work/journal` whose basis debits an
//      ENROLLED fixed-asset cost account produces one Work, one run served by the UNCHANGED frozen
//      `clara-work/v3` bundle, one approved entry, one committed `clara.operation_receipts` row
//      AND — the whole point of #639 — exactly ONE `clara.fixed_assets` row, born in the same
//      transaction, with NO depreciation particulars. Before 0216 this POST could not commit at
//      all: the deferred belt refused it at COMMIT with CLR40 `fa_belt_unregistered_movement`.
//   2. THE ACQUISITION IS COMPLETE WHILE THE PARTICULARS WAIT. The register row is `active`, its
//      cost is exact, and `depreciation_start_date` / `useful_life_months` are NULL.
//   3. A LOST ACKNOWLEDGEMENT. The same intentKey re-POSTed returns the SAME Work with
//      `replayed:true` and mints no second run, no second entry and NO SECOND ASSET.
//   4. A CRASH AFTER COMMIT, BEFORE CHECKPOINT. `CLARA_WORK_TEST_FAULT=exit_after_commit` exits
//      the process the instant the database returns a receipt. The entry AND the register row
//      survive (they were committed together); on respawn the WDK re-executes the step, the tool
//      call REPLAYS onto the same logical identity, and the register row is still the SAME asset
//      id — one acquisition, one asset, across a crash.
//   5. CURRENT AUTHORITY, RE-READ AT THE PARTICULARS DOOR. The initiator is demoted to viewer
//      AFTER the acquisition posted; `clara.complete_fixed_asset_particulars_for` then refuses
//      `insufficient_role` and the register row is untouched — the recheck the dependent question
//      exists for, because a parked question may be answered hours later.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent shared with its siblings), and
// the file SKIPS CLEANLY when migration 0216 is absent — its runtime half merges alongside its DB
// half, and a green e2e against a database with no acquisition birth trigger would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[fa-acq-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate. BYTE-IDENTICAL to `work-journal-e2e.mjs`'s and
// `periodic-adjustment-e2e.mjs`'s, deliberately: this file spawns the same server against the same
// throwaway databases, and a gate that admitted one more name here would be a second, looser
// answer to one question.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("fixed-asset-acquisition-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("fixed-asset-acquisition-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}
{
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("fixed-asset-acquisition-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.FA_ACQ_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-fa-acq-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "fa-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./work-journal-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 10 * 60 * 1000;
setTimeout(() => {
  console.error(`\nFIXED ASSET ACQUISITION E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
  process.exit(1);
}, WATCHDOG_MS);

const mint = (sub) =>
  new SignJWT({ role: AUD })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(key);

function childEnv(extra = {}) {
  const base = Object.assign({}, process.env, {
    PORT,
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
  const state = { exited: false, exitInfo: null, banner: null, serving: null, stdout: "", stderr: "" };
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  // READ LINE BY LINE, NOT CHUNK BY CHUNK — a `data` event is a slice of a pipe, not a promise of
  // a whole line (the banner incident recorded in wave2-ci-two-build-banner.md).
  const ingest = (line) => {
    const m = /\[clara-runtime\] bundle clara-work\/v3 digest=([0-9a-f]{64})/.exec(line);
    if (m && !state.banner) state.banner = m[1];
    if (!state.serving) {
      const serving = /\[clara-runtime\] serving .*/.exec(line);
      if (serving) state.serving = serving[0];
    }
  };
  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    state.stdout = `${state.stdout}${d}`.slice(-8000);
    pending += d;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) ingest(line);
  });
  child.stdout.on("end", () => {
    if (pending) ingest(pending);
    pending = "";
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    state.stderr = `${state.stderr}${d}`.slice(-8000);
    if (/FATAL|Error:|exit_after_commit/.test(d)) process.stderr.write(`[child] ${d}`);
  });
  return { child, state };
}

/** Wait for THIS engine's own boot — `/ready`'s world conjunct is an estate-wide heartbeat, so a
 *  predecessor stopped seconds ago satisfies it. The idiom is `periodic-adjustment-e2e.mjs`'s. */
async function waitBooted(engine, deadlineMs = 30000) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    if (engine.state.serving && engine.state.banner) return;
    if (engine.state.exited) break;
    await sleep(100);
  }
  throw new Error(
    `engine answered /ready but never finished its OWN boot within ${deadlineMs}ms`
    + `\n  provenance line: ${engine.state.serving ?? "(never logged)"}`
    + `\n  bundle banner:   ${engine.state.banner ?? "(never logged)"}`
    + `\n  exit: ${JSON.stringify(engine.state.exitInfo)}`
    + `\n--- child stdout (tail) ---\n${engine.state.stdout || "(none)"}`
    + `\n--- child stderr (tail) ---\n${engine.state.stderr || "(none)"}`,
  );
}

function waitExit(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const t = setTimeout(() => reject(new Error("timeout waiting for serve child exit")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function waitReady(deadlineMs = 45000, engine = null) {
  const end = Date.now() + deadlineMs;
  let healthy = false;
  while (Date.now() < end) {
    try {
      if (!healthy && (await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).ok) healthy = true;
      if (healthy) {
        const r = await fetch(`${BASE}/ready`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (r.status === 200) {
          if (engine) await waitBooted(engine);
          return;
        }
      }
    } catch {
      /* booting */
    }
    await sleep(250);
  }
  throw new Error(
    "serve child did not become ready (/health + /ready 200)"
    + (engine ? `\n--- child stdout (tail) ---\n${engine.state.stdout || "(none)"}\n--- child stderr (tail) ---\n${engine.state.stderr || "(none)"}\n--- exit: ${JSON.stringify(engine.state.exitInfo)} ---` : ""),
  );
}

async function api(method, path, body, jwt) {
  const init = {
    method,
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, init);
  let parsed = null;
  try {
    parsed = await r.json();
  } catch {
    /* non-JSON */
  }
  return { status: r.status, body: parsed };
}

// The enrolled trio. Distinct from `work-journal-e2e.mjs`'s 6100/1100 so a shared rig carries both.
const FA_COST = "1510";
const FA_ACCUM = "1519";
const FA_EXPENSE = "6510";
const BANK = "1101";
const COST_CENTS = 850_000; // RM 8,500 — below the firm's high-stakes threshold on purpose

/** Dr <enrolled fixed-asset cost account> / Cr bank. The acquisition, in the ROUTE's own spelling. */
function acquisitionBasis(memo, cents = COST_CENTS) {
  return {
    postingDate: "2026-09-01",
    memo,
    currency: "MYR",
    lines: [
      { accountCode: FA_COST, debitCents: cents, creditCents: 0, description: "compressor" },
      { accountCode: BANK, debitCents: 0, creditCents: cents, description: "Maybank" },
    ],
  };
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select exists (select 1 from pg_trigger
                    where tgrelid = 'clara.journal_entries'::regclass
                      and tgname = 't_je_fa_acquisition_birth') as birth,
           to_regprocedure('clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)')
             is not null as door,
           to_regclass('clara.fixed_assets') is not null as reg
  `);
  if (!probe.rows[0]?.birth || !probe.rows[0]?.door || !probe.rows[0]?.reg) {
    console.log("[fa-acq-e2e] SKIPPED — migration 0216 (t_je_fa_acquisition_birth + clara.complete_fixed_asset_particulars_for) is not on this database");
    process.exit(0);
  }

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countReceipts = (work) =>
    rig.rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  // `acquired_date` IS CAST TO TEXT IN SQL, and that is not a style choice: `pg` parses a DATE
  // column into a JS `Date` at LOCAL midnight, so `toISOString()` on this host shifts it a day
  // backwards — the exact "timezone-shifted date" this cell exists to refuse. The database's own
  // rendering is the only one that cannot lie.
  const assets = (client) =>
    rig.rootQuery(
      `select f.*, f.acquired_date::text as acquired_date_text
         from clara.fixed_assets f where f.client_id = $1 order by f.created_at, f.id`,
      [client]).then((r) => r.rows);
  const readWork = (id) => rig.rootQuery("select * from clara.accounting_work where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const tasksFor = (work) => rig.rootQuery("select id from clara.agent_tasks where work_id = $1", [work]).then((r) => r.rows);

  /** A firm + client carrying the chart AND the fixed-asset enrolment, both through the estate's
   *  own human doors — a raw INSERT into `clara.fa_account_profiles` would seed a state the
   *  enrolment verb refuses (no registered bank account may be enrolled in any role). */
  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type] of [
      [FA_COST, "Plant & machinery", "asset"],
      [FA_ACCUM, "Accumulated depreciation — P&M", "asset"],
      [FA_EXPENSE, "Depreciation expense", "expense"],
      [BANK, "Maybank current account", "asset"],
    ]) {
      await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
        [client, code, name, type, rig.opk("acct")]);
    }
    await rig.humanQuery(owner,
      `select clara.upsert_fa_account_profile(p_client=>$1, p_asset_account=>$2, p_accum_account=>$3,
         p_depr_expense_account=>$4, p_op_key=>$5) as r`,
      [client, FA_COST, FA_ACCUM, FA_EXPENSE, rig.opk("faenrol")]);
    return { owner, firm, client, jwt: await mint(owner) };
  }

  async function pollWork(workId, jwt, pred, label, deadlineMs = 90000) {
    const end = Date.now() + deadlineMs;
    let last = null;
    while (Date.now() < end) {
      const r = await api("GET", `/api/work/${workId}`, undefined, jwt);
      last = r;
      if (r.status === 200 && pred(r.body)) return r.body;
      await sleep(250);
    }
    throw new Error(`pollWork timeout (${label}); last=${JSON.stringify(last)}`);
  }

  const TERMINAL = new Set(["completed", "refused", "failed", "cancelled", "expired"]);

  // =========================================================================
  // 1-3, 5: one long-lived engine.
  // =========================================================================
  const first = spawnServe();
  try {
    await waitReady(45000, first);
    assert.ok(first.state.banner, "the world-start banner names the serving bundle digest");
    console.log(`[fa-acq-e2e] engine ready; serving bundle digest=${first.state.banner}`);

    // ---- 1 + 2. admit -> run -> commit; the asset is born, the particulars wait --------------
    const one = await seedClient("fa-commit");
    const intent = randomUUID();
    const admitted = await api("POST", "/api/work/journal",
      { clientId: one.client, intentKey: intent, basis: acquisitionBasis("compressor purchased") }, one.jwt);
    assert.equal(admitted.status, 202, `admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
    assert.equal(admitted.body.replayed, false);
    const workId = admitted.body.work_id;

    const done = await pollWork(workId, one.jwt, (b) => TERMINAL.has(b.work.status), "acquisition settles");
    assert.equal(done.work.status, "completed",
      `the acquisition COMMITS (got ${done.work.status} / ${JSON.stringify(done.work.error)}) — before 0216 this was a `
      + "CLR40 fa_belt_unregistered_movement at COMMIT and the Work settled failed");
    assert.equal(done.work.bundle?.id, "clara-work/v3",
      "…served by the UNCHANGED frozen bundle: closing this lane needed no new workflow version");
    assert.ok(done.work.result?.entry_id && done.work.result?.receipt_id);

    assert.equal(await countEntries(one.client), 1, "exactly ONE journal entry");
    assert.equal(await countReceipts(workId), 1, "exactly ONE committed operation receipt");
    const born = await assets(one.client);
    assert.equal(born.length, 1, "…and exactly ONE fixed-asset register row, born in the SAME transaction");
    const asset = born[0];
    assert.equal(asset.acquisition_entry_id, done.work.result.entry_id, "the register row names the approving entry");
    assert.ok(asset.acquisition_line_id, "…and the cost LINE it was born from");
    assert.equal(String(asset.cost_cents), String(COST_CENTS), "the EXACT minor units, never a float");
    assert.equal(asset.asset_account_code, FA_COST);
    assert.equal(asset.acquired_date_text, "2026-09-01",
      "the acquisition date is the supplied posting date, never a timezone-shifted one");
    assert.equal(asset.status, "active");
    assert.equal(asset.acquisition_document_id, null, "a Work-lane acquisition carries no document");

    // 2 · THE ACQUISITION IS COMPLETE WHILE THE PARTICULARS WAIT.
    assert.equal(asset.depreciation_start_date, null, "no in-service date yet…");
    assert.equal(asset.useful_life_months, null, "…no useful life…");
    assert.equal(asset.depreciation_method, null, "…and no method: the acquisition did not need them");
    const detail = await rig.humanQuery(one.owner, "select clara.get_fixed_asset(p_asset => $1) as r", [asset.id]);
    const read = detail.rows[0].r;
    assert.equal(read.acquisition.entry_id, done.work.result.entry_id,
      "the read's ACQUISITION block names the journal entry…");
    assert.equal(read.acquisition.work_id, workId, "…the Work, resolved by join…");
    assert.equal(read.acquisition.receipt_id, done.work.result.receipt_id, "…and the operation receipt");
    assert.equal(read.particulars.complete, false, "…while the PARTICULARS block is separately incomplete");
    console.log("[fa-acq-e2e] PASS 1+2: admit -> run -> one entry, one receipt and ONE register row in one commit; particulars wait alone");

    // ---- 3. a lost acknowledgement ------------------------------------------------------
    const tasksBefore = (await tasksFor(workId)).length;
    const replay = await api("POST", "/api/work/journal",
      { clientId: one.client, intentKey: intent, basis: acquisitionBasis("compressor purchased") }, one.jwt);
    assert.equal(replay.status, 202);
    assert.equal(replay.body.replayed, true, "the SAME intent key resolves to the Work it already admitted");
    assert.equal(replay.body.work_id, workId);
    await sleep(500);
    assert.equal((await tasksFor(workId)).length, tasksBefore, "no second run");
    assert.equal(await countEntries(one.client), 1, "no second entry");
    assert.equal((await assets(one.client)).length, 1, "and NO SECOND ASSET — the birth is idempotent on the cost line");
    console.log("[fa-acq-e2e] PASS 3: a lost acknowledgement replays onto the same Work and births no twin");

    // ---- 5. current authority, re-read at the particulars door ---------------------------
    //
    // A BOOKKEEPER admits and posts an acquisition of their own; the owner then demotes them to
    // viewer. The runtime particulars door must refuse — the recheck the dependent question
    // exists for, because a parked question may be answered hours after it was asked, and by then
    // the human who asked may have been demoted, deactivated or lost the client.
    //
    // THE BOOKKEEPER, not the owner: demoting the sole owner is refused by the estate's own
    // last-owner protection (CLR09), so a cell that tried it would be testing that wall instead.
    const bookkeeper = await rig.addMember(one.owner, one.firm, { role: "bookkeeper", prefix: "fa-bk" });
    const bkJwt = await mint(bookkeeper);
    const second = await api("POST", "/api/work/journal",
      { clientId: one.client, intentKey: randomUUID(), basis: acquisitionBasis("lathe purchased", 640_000) },
      bkJwt);
    assert.equal(second.status, 202, `the bookkeeper's admission 202 (got ${second.status} ${JSON.stringify(second.body)})`);
    const secondDone = await pollWork(second.body.work_id, bkJwt, (b) => TERMINAL.has(b.work.status), "second acquisition settles");
    assert.equal(secondDone.work.status, "completed", `the bookkeeper's acquisition commits (got ${secondDone.work.status})`);
    const bkAsset = (await assets(one.client)).find((a) => a.acquisition_entry_id === secondDone.work.result.entry_id);
    assert.ok(bkAsset, "…and births its own register row");

    const membership = (await rig.rootQuery(
      "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
      [one.firm, bookkeeper])).rows[0];
    await rig.humanQuery(one.owner,
      "select clara.set_member_role(p_membership=>$1, p_role=>$2, p_op_key=>$3) as r",
      [membership.id, "viewer", rig.opk("fa-demote")]);

    let refused = null;
    try {
      await rig.asRuntime((c) => c.query(
        `select clara.complete_fixed_asset_particulars_for(p_client=>$1, p_asset=>$2,
           p_particulars=>$3::jsonb, p_op_key=>$4, p_obo=>$5) as r`,
        [one.client, bkAsset.id,
          JSON.stringify({ method: "straight_line", useful_life_months: 60, start_date: "2026-09-01" }),
          rig.opk("fa-for"), bookkeeper],
      ));
    } catch (e) {
      refused = e;
    }
    assert.ok(refused, "a demoted initiator cannot have the answer applied on their behalf");
    assert.equal(refused.code, "CLR04", `…and the refusal is an AUTHORITY refusal (got ${refused.code})`);
    assert.match(String(refused.detail ?? ""), /insufficient_role/,
      "…named, so a surface can say which authority was lost rather than showing a generic failure");
    const untouched = (await assets(one.client)).find((a) => a.id === bkAsset.id);
    assert.equal(untouched.depreciation_method, null, "the register row is untouched — a refusal erases nothing");
    assert.equal(String(untouched.cost_cents), "640000", "…and the acquisition it already recorded still stands");

    // …and the SAME door succeeds for a human who still holds the floor, so the refusal above is
    // about authority rather than about the door being unreachable.
    const applied = await rig.asRuntime((c) => c.query(
      `select clara.complete_fixed_asset_particulars_for(p_client=>$1, p_asset=>$2,
         p_particulars=>$3::jsonb, p_op_key=>$4, p_obo=>$5) as r`,
      [one.client, bkAsset.id,
        JSON.stringify({ method: "straight_line", useful_life_months: 60, start_date: "2026-09-01",
          description: "Bench lathe" }),
        rig.opk("fa-for-ok"), one.owner],
    ));
    assert.equal(applied.rows[0].r.particulars_complete, true,
      "the owner still holds the floor, so the run applies the answer on their behalf");
    assert.equal(await countEntries(one.client), 2,
      "…and answering wrote NO second journal: two acquisitions, two entries, and nothing else");
    console.log("[fa-acq-e2e] PASS 5: the particulars door re-reads LIVE authority, refuses a demoted initiator by name, and writes no journal when it succeeds");
  } finally {
    if (!first.state.exited) first.child.kill("SIGKILL");
    await waitExit(first.child).catch(() => {});
  }

  // =========================================================================
  // 4. crash AFTER the database commit, BEFORE the workflow checkpoint.
  // =========================================================================
  {
    const crash = await seedClient("fa-crash");
    const faulty = spawnServe({ CLARA_WORK_TEST_FAULT: "exit_after_commit" });
    let workId = null;
    try {
      await waitReady(45000, faulty);
      const admit = await api("POST", "/api/work/journal",
        { clientId: crash.client, intentKey: randomUUID(), basis: acquisitionBasis("compressor — crash window") },
        crash.jwt);
      assert.equal(admit.status, 202);
      workId = admit.body.work_id;
      // The tool calls process.exit(137) the instant the commit returns. The engine dies with the
      // entry AND the register row on disk and the step NOT checkpointed — the window nothing else
      // can produce, and the one that matters here: the register row is born by a DEFERRED trigger
      // at COMMIT, so if it were not truly part of that transaction it would be missing now.
      await waitExit(faulty.child, 90000);
      assert.notEqual(faulty.state.exitInfo?.code, 0, `the engine died mid-run (exit ${JSON.stringify(faulty.state.exitInfo)})`);
    } finally {
      if (!faulty.state.exited) faulty.child.kill("SIGKILL");
      await waitExit(faulty.child).catch(() => {});
    }

    assert.equal(await countEntries(crash.client), 1, "the entry survived the crash — it was COMMITTED before the process died");
    const survivors = await assets(crash.client);
    assert.equal(survivors.length, 1,
      "…and so did the REGISTER ROW: the deferred birth trigger runs inside that same transaction, not after it");
    const assetBefore = survivors[0].id;
    const midWork = await readWork(workId);
    assert.notEqual(midWork.status, "completed", "and the Work is NOT yet completed — the run never checkpointed");

    await sleep(500);
    const respawned = spawnServe();
    try {
      await waitReady(45000, respawned);
      const settled = await pollWork(workId, crash.jwt, (b) => TERMINAL.has(b.work.status), "crashed work resumes and settles", 120000);
      assert.equal(settled.work.status, "completed",
        `the resumed run settles completed (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
      assert.equal(settled.work.result?.replayed, true, "the re-executed step's tool call REPLAYED onto the original receipt");
      assert.equal(await countEntries(crash.client), 1, "EXACTLY ONE journal entry across the crash");
      assert.equal(await countReceipts(workId), 1, "EXACTLY ONE committed operation receipt across the crash");
      const after = await assets(crash.client);
      assert.equal(after.length, 1, "EXACTLY ONE register row across the crash");
      assert.equal(after[0].id, assetBefore,
        "…and it is the SAME asset id — a replay returns the acquisition that already happened, never a second one");
      console.log("[fa-acq-e2e] PASS 4: crash after commit / before checkpoint -> resume -> replayed receipt, one entry, one receipt, the SAME asset");
    } finally {
      if (!respawned.state.exited) respawned.child.kill("SIGKILL");
      await waitExit(respawned.child).catch(() => {});
    }
  }

  console.log("\nFIXED ASSET ACQUISITION E2E: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFIXED ASSET ACQUISITION E2E: FAIL");
  console.error(err);
  process.exit(1);
});
