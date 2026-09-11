// STANDALONE work-cancellation e2e (#630). NOT a `node --test` file: it SPAWNS scripts/serve.mjs
// (through tests/work-cancel-serve.mjs, which installs the scripted model first) as a CHILD process,
// so the engine can be held mid-run, crashed and respawned against the SAME database. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5673 PGUSER=postgres PGDATABASE=clara_wave_b_ci \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5673/clara_wave_b_ci \
//   RELAY_TEST_MODE=1 node tests/work-cancel-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real Postgres world plus a real HTTP boundary:
//   1. CANCEL BEFORE THE RUN. A queued Work cancels to a TERMINAL with no run, no entry and no
//      receipt; the same op key REPLAYS; a different key answers `already_terminal`.
//   2. CANCEL BEFORE ADMISSION. The model is HELD before its `record_journal_entry` call; the human
//      cancels; the Work reads `stopping` FIRST (read over the real route, never inferred); the held
//      tool call is refused `work_cancelled`; the model's SECOND attempt is refused too; the Work
//      settles `cancelled` with the run's own requested outcome preserved under `error.superseded`;
//      ZERO entries and ZERO receipts.
//   3. CANCEL DURING THE BOUNDARY. A separate connection holds `clara.accounting_work FOR UPDATE`
//      while the released tool call blocks on it; the cancel queues BEHIND the posting; on release
//      the operation WINS — one entry, one receipt, the cancel answers `already_completed` with the
//      receipt id, and the Work is `completed`. Never `cancelled` with money in the ledger.
//   4. CANCEL AFTER COMMIT, BEFORE CHECKPOINT. `CLARA_WORK_TEST_FAULT=exit_after_commit` kills the
//      engine the instant the database returns a receipt; the cancel is issued INSIDE that gap and
//      answers `already_completed`; the respawned run replays onto the same logical identity and
//      exactly one entry and one receipt exist.
//   5. ROLE REVOCATION BEFORE THE WRITE, THEN TAKEOVER. The initiator's membership is deactivated
//      while the model is held; the commit refuses `obo_not_active`; the Work settles `refused`; the
//      REVOKED user's own reads return ZERO rows of the Work, its receipts and the firm's journal; a
//      currently authorised colleague takes responsibility over the real route and the new run posts
//      exactly ONE entry under the colleague, with `initiator` unchanged and `work.taken_over` in
//      the firm timeline.
//   6. PERIOD LOCK BEFORE THE WRITE. The target fiscal year is closed while the model is held; the
//      commit refuses CLR19 `write_into_closed_period`; the Work settles `refused` carrying the
//      typed reason and no entry exists.
//   7. RESTART WHILE STOPPING. The worker is killed between the cancel write and the settle; on
//      respawn the reconciler settles the Work per the receipt law and the terminal is read back.
//   8. STOP REPLY IS NOT CANCEL WORK. Cancelling the CHAT-TURN task that started a Work leaves the
//      Work running, and it goes on to complete.
//
// THE HOLD IS A TEST-FILE AFFORDANCE, NOT A NEW FROZEN FAULT. `claraWork_v2` is deploy-locked, so a
// new `CLARA_WORK_TEST_FAULT` arm inside it would mean a whole new version file set for a test
// affordance. The window lives in tests/work-cancel-serve.mjs's model instead — see its header.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out, and the file SKIPS CLEANLY when migration 0184 is absent.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[wc-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate (the work-journal-e2e precedent, verbatim).
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("work-cancel-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
{
  if (!process.env.WORKFLOW_POSTGRES_URL) throw new Error("work-cancel-e2e needs WORKFLOW_POSTGRES_URL");
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("work-cancel-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const ISSUER = "https://clara-wc-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "wc-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./work-cancel-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;
// The gate directory lives under the package's own shared rig state, beside `test-storage/`, so a
// stale gate from a killed run is visible and removable rather than hidden in a temp dir.
const GATE_DIR = fileURLToPath(new URL("./.work-cancel-gates", import.meta.url));

const WATCHDOG_MS = 14 * 60 * 1000;
setTimeout(() => {
  console.error(`\nWORK CANCEL E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
  process.exit(1);
}, WATCHDOG_MS);

const mint = (sub) =>
  new SignJWT({ role: AUD })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(key);

function childEnv(port, extra = {}) {
  const base = Object.assign({}, process.env, {
    PORT: String(port),
    RELAY_TEST_MODE: "1",
    CLARA_START_WORLD: "1",
    WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
    SUPABASE_JWT_ISSUER: ISSUER,
    SUPABASE_JWT_AUD: AUD,
    SUPABASE_JWT_SECRET: jwtSecret,
  });
  delete base.CLARA_WORK_TEST_FAULT;
  delete base.CLARA_WORK_CANCEL_GATE;
  delete base.CLARA_WORK_CANCEL_HELD;
  return Object.assign(base, extra);
}

function spawnServe(port, extra = {}) {
  const child = spawn(process.execPath, [serveScript], { env: childEnv(port, extra), stdio: ["ignore", "pipe", "pipe"] });
  const state = { exited: false, exitInfo: null, banner: null, stderr: "" };
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    const m = /\[clara-runtime\] bundle clara-work\/v2 digest=([0-9a-f]{64})/.exec(d);
    if (m && !state.banner) state.banner = m[1];
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    state.stderr = `${state.stderr}${d}`.slice(-8000);
    if (/FATAL|Error:|exit_after_commit|hold released|\[wc-serve\] (branch|tool-result)/.test(d)) process.stderr.write(`[child:${port}] ${d}`);
  });
  return { child, state, port };
}

function waitExit(child, timeoutMs = 40000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const t = setTimeout(() => reject(new Error("timeout waiting for serve child exit")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function waitReady(port, deadlineMs = 90000, engine = null) {
  const base = `http://127.0.0.1:${port}`;
  const end = Date.now() + deadlineMs;
  let healthy = false;
  while (Date.now() < end) {
    try {
      if (!healthy && (await fetch(`${base}/health`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).ok) healthy = true;
      if (healthy) {
        const r = await fetch(`${base}/ready`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (r.status === 200) return;
      }
    } catch {
      /* booting */
    }
    await sleep(250);
  }
  throw new Error(
    `serve child on ${port} did not become ready (/health + /ready 200)`
    + (engine ? `\n--- child stderr ---\n${engine.state.stderr || "(none)"}\n--- exit: ${JSON.stringify(engine.state.exitInfo)} ---` : ""),
  );
}

async function api(port, method, path, body, jwt) {
  const init = {
    method,
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`http://127.0.0.1:${port}${path}`, init);
  let parsed = null;
  try {
    parsed = await r.json();
  } catch {
    /* non-JSON */
  }
  return { status: r.status, body: parsed };
}

const POSTING_DATE = "2026-09-05";
const CENTS = 98765;

function basisFor(memo, cents = CENTS) {
  return {
    postingDate: POSTING_DATE,
    memo,
    currency: "MYR",
    lines: [
      { accountCode: "6100", debitCents: cents, creditCents: 0, description: "office rent" },
      { accountCode: "1100", debitCents: 0, creditCents: cents, description: "Maybank" },
    ],
  };
}

const TERMINAL = new Set(["completed", "refused", "failed", "cancelled", "expired"]);

/** One hold gate: the path the model polls, and the marker it writes on arrival. */
function makeGate(label) {
  mkdirSync(GATE_DIR, { recursive: true });
  const id = `${label}-${randomUUID().slice(0, 8)}`;
  const gate = join(GATE_DIR, `${id}.open`);
  const held = join(GATE_DIR, `${id}.held`);
  rmSync(gate, { force: true });
  rmSync(held, { force: true });
  return {
    env: { CLARA_WORK_CANCEL_GATE: gate, CLARA_WORK_CANCEL_HELD: held },
    open: () => writeFileSync(gate, "open"),
    /** Wait until THIS Work is inside the window. One supervisor serves every queued Work, so a
     *  bare "somebody is held" marker let a leg act on a sibling leg's leftover — see
     *  work-cancel-serve.mjs's `waitForGate` for the measurement. */
    async waitHeld(workId, deadlineMs = 120000) {
      const end = Date.now() + deadlineMs;
      let seen = "";
      while (Date.now() < end) {
        if (existsSync(held)) {
          seen = readFileSync(held, "utf8");
          if (workId === undefined || seen.includes(workId)) return true;
        }
        await sleep(100);
      }
      throw new Error(`the model never reached the hold for work ${workId ?? "(any)"} (${id}); saw: ${seen}`);
    },
    cleanup: () => {
      rmSync(gate, { force: true });
      rmSync(held, { force: true });
    },
  };
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regprocedure('clara.cancel_accounting_work(uuid,uuid,text)') is not null as cancel_fn,
           to_regprocedure('clara.take_over_accounting_work(uuid,uuid,text,text)') is not null as takeover_fn
  `);
  const p = probe.rows[0] ?? {};
  if (!p.cancel_fn || !p.takeover_fn) {
    console.log("[wc-e2e] SKIPPED — migration 0184 (work cancel ordering) is not on this database");
    process.exit(0);
  }

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countReceipts = (work) =>
    rig
      .rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  const readWork = (id) =>
    rig.rootQuery("select * from clara.accounting_work where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const tasksForWork = (work) =>
    rig
      .rootQuery("select id, status, error_code, cancelled_by from clara.agent_tasks where work_id=$1 order by created_at", [work])
      .then((r) => r.rows);

  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type] of [["6100", "Rent expense", "expense"], ["1100", "Maybank current account", "asset"]]) {
      await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r", [
        client, code, name, type, rig.opk("acct"),
      ]);
    }
    return { owner, firm, client, jwt: await mint(owner) };
  }

  async function pollWork(port, workId, jwt, pred, label, deadlineMs = 120000) {
    const end = Date.now() + deadlineMs;
    let last = null;
    while (Date.now() < end) {
      const r = await api(port, "GET", `/api/work/${workId}`, undefined, jwt);
      last = r;
      if (r.status === 200 && pred(r.body)) return r.body;
      await sleep(200);
    }
    throw new Error(`pollWork timeout (${label}); last=${JSON.stringify(last)}`);
  }

  /** Wait for a Work row to reach a state, read from the DATABASE (for states the route's poll
   *  could race past, and for legs where no engine is serving the route). */
  async function pollRow(workId, pred, label, deadlineMs = 120000) {
    const end = Date.now() + deadlineMs;
    let last = null;
    while (Date.now() < end) {
      last = await readWork(workId);
      if (last && pred(last)) return last;
      await sleep(200);
    }
    throw new Error(`pollRow timeout (${label}); last status=${last?.status ?? "-"}`);
  }

  /**
   * WHO IS QUEUED BEHIND THIS BACKEND, asked of PostgreSQL rather than assumed from a sleep. A
   * transaction waiting on a row lock reports `wait_event_type = 'Lock'` and names its blockers in
   * `pg_blocking_pids`, so "the tool call is now blocked on the holder's lock" becomes something
   * the leg MEASURES instead of a comment beside a timer.
   */
  const blockedBy = (pid) =>
    rig
      .rootQuery(
        `select pid from pg_stat_activity
          where wait_event_type = 'Lock' and $1 = any(pg_blocking_pids(pid))`,
        [pid],
      )
      .then((r) => r.rows.map((row) => row.pid));

  async function waitBlocked(pid, n, label, deadlineMs = 30000) {
    const end = Date.now() + deadlineMs;
    let last = [];
    while (Date.now() < end) {
      last = await blockedBy(pid);
      if (last.length >= n) return last;
      await sleep(50);
    }
    throw new Error(`waitBlocked timeout (${label}): expected >= ${n} blocked, saw ${last.length}`);
  }

  const admit = (port, ctx, memo, intentKey) =>
    api(port, "POST", "/api/work/journal", { clientId: ctx.client, intentKey, basis: basisFor(memo) }, ctx.jwt);

  const cancel = (port, ctx, workId, opKey) =>
    api(port, "POST", `/api/work/${workId}/cancel`, { opKey }, ctx.jwt);

  // =========================================================================
  // 1. cancel while QUEUED — no run, no effect, replay, already_terminal.
  // =========================================================================
  const PORT = await ephemeralPort();
  {
    const ctx = await seedClient("wc-queued");
    // Admit through the VERB, with no post-commit enqueue and no engine running, so the Work is
    // genuinely still queued when the cancel lands. (The route would enqueue; nothing would be
    // there to pick it up, but the reconciler of a later leg's engine might.)
    const admitted = await rig.asRuntime((c) =>
      c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,'user_direct','[]'::jsonb,$5::text) as r", [
        ctx.client, ctx.owner, randomUUID(),
        JSON.stringify({
          posting_date: POSTING_DATE, memo: "office rent — queued cancel", currency: "MYR",
          lines: [
            { account_code: "6100", debit_cents: CENTS, credit_cents: 0, description: "office rent" },
            { account_code: "1100", debit_cents: 0, credit_cents: CENTS, description: "Maybank" },
          ],
        }),
        rig.DEFAULT_MODEL,
      ]),
    ).then((r) => r.rows[0].r);

    const key = `cancel-${randomUUID()}`;
    const first = await rig.asRuntime((c) =>
      c.query("select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as r", [admitted.work_id, ctx.owner, key]),
    ).then((r) => r.rows[0].r);
    assert.equal(first.cancelled, true, "leg 1: the door cancelled it");
    assert.equal(first.status, "cancelled", "leg 1: a Work with no engine run reaches the TERMINAL directly");

    const replay = await rig.asRuntime((c) =>
      c.query("select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as r", [admitted.work_id, ctx.owner, key]),
    ).then((r) => r.rows[0].r);
    assert.equal(replay.replayed, true, "leg 1: the SAME key replays");
    assert.equal(replay.status, first.status);

    const second = await rig.asRuntime((c) =>
      c.query("select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as r",
        [admitted.work_id, ctx.owner, `cancel-${randomUUID()}`]),
    ).then((r) => r.rows[0].r);
    assert.equal(second.cancelled, false, "leg 1: a second cancel under a NEW key is not an error");
    assert.equal(second.reason, "already_terminal");

    const row = await readWork(admitted.work_id);
    assert.equal(row.status, "cancelled");
    assert.equal((await tasksForWork(admitted.work_id))[0].status, "cancelled");
    assert.equal(await countEntries(ctx.client), 0, "leg 1: nothing was posted");
    assert.equal(await countReceipts(admitted.work_id), 0, "leg 1: no receipt");
    console.log("[wc-e2e] PASS 1: cancel while queued — terminal, replayed, already_terminal, zero effect");
  }

  // =========================================================================
  // 2. cancel BEFORE ADMISSION — held model, stopping first, no effect.
  // =========================================================================
  const gate2 = makeGate("leg2");
  {
    const ctx = await seedClient("wc-before");
    const engine = spawnServe(PORT, gate2.env);
    let workId = null;
    try {
      await waitReady(PORT, 90000, engine);
      assert.ok(engine.state.banner, "the world-start banner names the serving bundle digest");
      const admitted = await admit(PORT, ctx, "office rent — cancel before admission", randomUUID());
      assert.equal(admitted.status, 202, `leg 2 admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
      workId = admitted.body.work_id;

      await gate2.waitHeld(workId);
      // The model is INSIDE the window: running, nothing admitted.
      const live = await api(PORT, "GET", `/api/work/${workId}`, undefined, ctx.jwt);
      assert.equal(live.body.work.status, "running", "leg 2: the run holds the Work while the model decides");

      const cancelled = await cancel(PORT, ctx, workId, `cancel-${randomUUID()}`);
      assert.equal(cancelled.status, 200, `leg 2 cancel 200 (got ${cancelled.status} ${JSON.stringify(cancelled.body)})`);
      assert.equal(cancelled.body.cancelled, true);
      assert.equal(cancelled.body.status, "stopping",
        "leg 2: the Work shows STOPPING — the terminal is not yet known");

      // …and it is readable as `stopping` over the REAL route, which is what B3/B7 render.
      const stopping = await api(PORT, "GET", `/api/work/${workId}`, undefined, ctx.jwt);
      assert.equal(stopping.body.work.status, "stopping", "leg 2: the route serves stopping");
      assert.equal(stopping.body.task.status, "cancel_requested");

      // Release the model. Its held tool call now meets the boundary.
      gate2.open();
      const settled = await pollWork(PORT, workId, ctx.jwt, (b) => TERMINAL.has(b.work.status), "leg 2 settles");
      assert.equal(settled.work.status, "cancelled",
        `leg 2: the Work terminalises CANCELLED (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
      assert.equal(settled.work.error?.reason, "cancelled", "leg 2: under the cancellation's own reason");
      // TWO PATHS REACH THE SAME TERMINAL, and which one wins is a RACE between the control
      // listener's engine abort and the held tool call's own boundary refusal. Both are correct and
      // the leg measures the terminal rather than the winner:
      //   · the abort lands first  -> the run settles `cancelled` itself (claraWork's own
      //     `clara_work_cancelled` tag), and there is nothing to supersede.
      //   · the tool call lands first -> the boundary refuses CLR13 `work_cancelled`, the frozen v1
      //     roster classifies it `state_changed`, the loop exhausts its replans and asks for
      //     `failed` — and 0184's settle TRANSLATES that to `cancelled`, preserving the request
      //     under `error.superseded`.
      // The translation arm itself is pinned deterministically in packages/db/tests/work-cancel.test.mjs
      // (wc.14, all three requested outcomes) and in tests/control-work-cancel.test.mjs.
      if (settled.work.error?.superseded) {
        assert.ok(["failed", "refused", "expired"].includes(settled.work.error.superseded.outcome),
          `leg 2: the superseded outcome is the run's own (${JSON.stringify(settled.work.error.superseded)})`);
        console.log(`[wc-e2e]   leg 2 path: the held tool call met the boundary; the run asked for `
          + `${settled.work.error.superseded.outcome} and the settle translated it`);
      } else {
        console.log("[wc-e2e]   leg 2 path: the engine abort landed first; the run settled cancelled itself");
      }
      assert.equal(await countEntries(ctx.client), 0, "leg 2: ZERO entries — no effect was created");
      assert.equal(await countReceipts(workId), 0, "leg 2: ZERO receipts");
      console.log("[wc-e2e] PASS 2: cancel before admission — stopping, then cancelled, superseded preserved, zero effect");
    } finally {
      gate2.open();          // never leave a held child behind
      if (!engine.state.exited) engine.child.kill("SIGKILL");
      await waitExit(engine.child).catch(() => {});
      gate2.cleanup();
    }
  }

  // =========================================================================
  // 3. cancel DURING the boundary — the admitted operation wins.
  // =========================================================================
  const gate3 = makeGate("leg3");
  {
    const ctx = await seedClient("wc-boundary");
    const engine = spawnServe(PORT, gate3.env);
    let workId = null;
    const holder = await rig.getPool().connect();
    try {
      await waitReady(PORT, 90000, engine);
      const admitted = await admit(PORT, ctx, "office rent — boundary race", randomUUID());
      assert.equal(admitted.status, 202);
      workId = admitted.body.work_id;
      await gate3.waitHeld(workId);

      // A THIRD party holds the Work row. The released tool call will block on it INSIDE the
      // posting transaction — the "after admission, before commit" window, which IS a lock wait.
      await holder.query("begin");
      await holder.query("select 1 from clara.accounting_work where id = $1 for update", [workId]);
      const holderPid = (await holder.query("select pg_backend_pid() as p")).rows[0].p;

      // THE ARRIVAL ORDER IS OBSERVED, NOT TIMED. This leg's whole claim is that the POSTING enters
      // the Work row's lock queue BEFORE the cancel does; PostgreSQL grants a contended row lock in
      // arrival order, so a `sleep()` here would be a guess about how long the path from gate-open
      // to `for update` takes on a loaded runner — and on a slow one the leg would invert and fail
      // a system that behaved correctly. Instead: open the gate, WAIT until PostgreSQL itself says
      // one backend is queued behind the holder, and only then send the cancel.
      gate3.open();
      const posting = await waitBlocked(holderPid, 1, "leg 3: the tool call reaches the boundary");
      assert.equal(await countEntries(ctx.client), 0,
        "leg 3: …and it blocked BEFORE it wrote anything — the entry is still unposted");

      // The cancel queues BEHIND the posting transaction. Proven the same way: two backends are now
      // waiting on the holder, and the one that arrived first is the posting.
      let cancelAnswer = null;
      let cancelError = null;
      const racing = cancel(PORT, ctx, workId, `cancel-${randomUUID()}`)
        .then((v) => { cancelAnswer = v; }, (e) => { cancelError = e; });
      const queue = await waitBlocked(holderPid, 2, "leg 3: the cancel queues behind the posting");
      assert.ok(queue.includes(posting[0]),
        "leg 3: the posting is STILL queued — it did not slip past while the cancel arrived");
      assert.equal(cancelAnswer, null, "leg 3: the cancel is BLOCKED while the boundary is held");

      await holder.query("commit");
      await racing;

      assert.equal(cancelError, null, `leg 3: the cancel completed (${cancelError?.message ?? ""})`);
      assert.equal(cancelAnswer.status, 200, `leg 3 cancel 200 (got ${cancelAnswer.status} ${JSON.stringify(cancelAnswer.body)})`);
      assert.equal(cancelAnswer.body.cancelled, false, "leg 3: the ADMITTED OPERATION won");
      assert.equal(cancelAnswer.body.reason, "already_completed");
      assert.ok(cancelAnswer.body.receipt_id, "leg 3: the answer names the receipt that won");
      assert.ok(cancelAnswer.body.entry_id, "leg 3: …and the entry it recorded");

      const settled = await pollWork(PORT, workId, ctx.jwt, (b) => TERMINAL.has(b.work.status), "leg 3 settles");
      assert.equal(settled.work.status, "completed", "leg 3: NEVER cancelled with money in the ledger");
      assert.equal(await countEntries(ctx.client), 1, "leg 3: EXACTLY ONE entry");
      assert.equal(await countReceipts(workId), 1, "leg 3: EXACTLY ONE receipt");
      console.log("[wc-e2e] PASS 3: cancel during the boundary — the operation committed, the cancel answered already_completed");
    } finally {
      await holder.query("rollback").catch(() => {});
      holder.release();
      gate3.open();
      if (!engine.state.exited) engine.child.kill("SIGKILL");
      await waitExit(engine.child).catch(() => {});
      gate3.cleanup();
    }
  }

  // =========================================================================
  // 4. cancel after commit, before checkpoint (crash) — one entry, replayed.
  // =========================================================================
  {
    const ctx = await seedClient("wc-crash");
    const faulty = spawnServe(PORT, { CLARA_WORK_TEST_FAULT: "exit_after_commit" });
    let workId = null;
    try {
      await waitReady(PORT, 90000, faulty);
      const admitted = await admit(PORT, ctx, "office rent — crash window", randomUUID());
      assert.equal(admitted.status, 202);
      workId = admitted.body.work_id;
      // The tool calls process.exit(137) the instant the commit returns: the entry is ON DISK and
      // the step is NOT checkpointed.
      await waitExit(faulty.child, 120000);
      assert.notEqual(faulty.state.exitInfo?.code, 0, `leg 4: the engine died mid-run (${JSON.stringify(faulty.state.exitInfo)})`);
    } finally {
      if (!faulty.state.exited) faulty.child.kill("SIGKILL");
      await waitExit(faulty.child).catch(() => {});
    }

    assert.equal(await countEntries(ctx.client), 1, "leg 4: the entry survived the crash — it was COMMITTED");
    const mid = await readWork(workId);
    assert.notEqual(mid.status, "completed", "leg 4: and the Work is NOT yet completed — the run never checkpointed");

    // THE CANCEL LANDS INSIDE THE GAP. No engine is running; the door alone must answer honestly.
    const inGap = await rig.asRuntime((c) =>
      c.query("select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as r",
        [workId, ctx.owner, `cancel-${randomUUID()}`]),
    ).then((r) => r.rows[0].r);
    assert.equal(inGap.cancelled, false, "leg 4: a cancel in the crash gap cancels nothing");
    assert.equal(inGap.reason, "already_completed", "leg 4: the receipt on disk is the witness with standing");
    assert.equal((await readWork(workId)).status, "completed", "leg 4: …and the Work is settled by it");

    const respawned = spawnServe(PORT);
    try {
      await waitReady(PORT, 90000, respawned);
      await pollRow(workId, (w) => TERMINAL.has(w.status), "leg 4 respawn settles");
      assert.equal(await countEntries(ctx.client), 1, "leg 4: EXACTLY ONE entry across the crash and the cancel");
      assert.equal(await countReceipts(workId), 1, "leg 4: EXACTLY ONE receipt");
      const done = await readWork(workId);
      assert.equal(done.status, "completed");
      assert.ok(done.result?.entry_id, "leg 4: the Work carries the entry it completed BY");
      console.log("[wc-e2e] PASS 4: cancel in the commit/checkpoint gap — already_completed, one entry, one receipt");
    } finally {
      if (!respawned.state.exited) respawned.child.kill("SIGKILL");
      await waitExit(respawned.child).catch(() => {});
    }
  }

  // =========================================================================
  // 5. role revocation before the write, then TAKEOVER by a colleague.
  // =========================================================================
  const gate5 = makeGate("leg5");
  {
    const ctx = await seedClient("wc-revoke");
    // A SECOND active bookkeeper — the colleague who will take responsibility.
    const colleagueSub = await rig.addMember(ctx.owner, ctx.firm, { role: "bookkeeper", prefix: "wc5" });
    const colleagueJwt = await mint(colleagueSub);
    // …and a THIRD member who will be the Work's initiator and then lose authority. The firm owner
    // cannot be removed, so the initiator must be somebody else.
    const initiatorSub = await rig.addMember(ctx.owner, ctx.firm, { role: "bookkeeper", prefix: "wc5i" });
    const initiatorJwt = await mint(initiatorSub);

    const engine = spawnServe(PORT, gate5.env);
    let workId = null;
    try {
      await waitReady(PORT, 90000, engine);
      const admitted = await api(PORT, "POST", "/api/work/journal",
        { clientId: ctx.client, intentKey: randomUUID(), basis: basisFor("office rent — revoked mid-run") }, initiatorJwt);
      assert.equal(admitted.status, 202, `leg 5 admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
      workId = admitted.body.work_id;
      await gate5.waitHeld(workId);

      // REVOKE while the model is held — after admission, before the write.
      const membership = await rig.rootQuery(
        "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
        [ctx.firm, initiatorSub]).then((r) => r.rows[0].id);
      await rig.humanQuery(ctx.owner,
        "select clara.remove_member(p_membership => $1::uuid, p_op_key => $2::text)",
        [membership, rig.opk("revoke")]);

      gate5.open();
      const settled = await pollRow(workId, (w) => TERMINAL.has(w.status), "leg 5 settles");
      console.log(`[wc-e2e]   leg 5: the commit was refused — ${JSON.stringify(settled.error)}`);
      assert.equal(settled.status, "refused",
        `leg 5: the Work settles REFUSED (got ${settled.status} / ${JSON.stringify(settled.error)})`);
      assert.equal(await countEntries(ctx.client), 0, "leg 5: no entry was written under lost authority");
      assert.equal(await countReceipts(workId), 0, "leg 5: and no receipt");

      // THE REVOKED ACTOR READS NOTHING. Measured through their OWN least-privileged connection.
      const revokedReads = await rig.humanQuery(initiatorSub,
        `select (select count(*)::int from clara.accounting_work where id=$1) as work,
                (select count(*)::int from clara.operation_receipts where work_id=$1) as receipts,
                (select count(*)::int from clara.journal_entries where client_id=$2) as entries`,
        [workId, ctx.client]).then((r) => r.rows[0]);
      assert.deepEqual(revokedReads, { work: 0, receipts: 0, entries: 0 },
        "leg 5: the revoked actor reads ZERO rows of the Work, its receipts and the firm's journal");

      // A CURRENTLY AUTHORISED COLLEAGUE TAKES RESPONSIBILITY, over the real route.
      const taken = await api(PORT, "POST", `/api/work/${workId}/take-over`,
        { opKey: `takeover-${randomUUID()}` }, colleagueJwt);
      assert.equal(taken.status, 202, `leg 5 takeover 202 (got ${taken.status} ${JSON.stringify(taken.body)})`);
      assert.equal(taken.body.taken_over, true);
      assert.equal(String(taken.body.responsible), String(colleagueSub), "leg 5: the colleague is responsible now");
      assert.equal(String(taken.body.initiated_by), String(initiatorSub),
        "leg 5: who ASKED is unchanged — it is history, and `initiated_by` is where 0184 keeps it");

      const done = await pollRow(workId, (w) => TERMINAL.has(w.status), "leg 5 takeover run settles", 150000);
      assert.equal(done.status, "completed",
        `leg 5: the taken-over run posts the entry (got ${done.status} / ${JSON.stringify(done.error)})`);
      assert.equal(await countEntries(ctx.client), 1, "leg 5: EXACTLY ONE entry, under the colleague");
      assert.equal(await countReceipts(workId), 1, "leg 5: EXACTLY ONE receipt");
      const receipt = await rig.rootQuery(
        "select on_behalf_of from clara.operation_receipts where work_id=$1 and outcome='committed'", [workId]);
      assert.equal(String(receipt.rows[0].on_behalf_of), String(colleagueSub),
        "leg 5: the receipt names WHOSE live authority was spent");
      const events = await rig.rootQuery(
        "select payload from clara.domain_events where firm_id=$1 and event_type='work.taken_over'", [ctx.firm]);
      assert.equal(events.rows.filter((e) => e.payload?.work === workId).length, 1,
        "leg 5: the takeover appears in the firm timeline");

      // …and the revoked user STILL reads nothing, after the entry exists.
      const after = await rig.humanQuery(initiatorSub,
        "select (select count(*)::int from clara.journal_entries where client_id=$1) as entries", [ctx.client]);
      assert.equal(after.rows[0].entries, 0, "leg 5: revocation after commit does not restore read access either");
      console.log("[wc-e2e] PASS 5: revocation before the write, revoked reader blind, colleague took over and posted once");
    } finally {
      gate5.open();
      if (!engine.state.exited) engine.child.kill("SIGKILL");
      await waitExit(engine.child).catch(() => {});
      gate5.cleanup();
    }
  }

  // =========================================================================
  // 6. period lock before the write.
  // =========================================================================
  const gate6 = makeGate("leg6");
  {
    const ctx = await seedClient("wc-period");
    await rig.rootQuery(
      `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,status,fy_end_source,opened_by)
       values($1,$2,'wc FY','2026-01-01','2026-12-31',1,'open','asserted',$3) returning id`,
      [ctx.firm, ctx.client, ctx.owner]);
    const engine = spawnServe(PORT, gate6.env);
    let workId = null;
    try {
      await waitReady(PORT, 90000, engine);
      const admitted = await admit(PORT, ctx, "office rent — period locked mid-run", randomUUID());
      assert.equal(admitted.status, 202);
      workId = admitted.body.work_id;
      await gate6.waitHeld(workId);

      // LOCK THE PERIOD while the model is held. open -> closing -> closed is the estate's own
      // lifecycle; no other edge is admitted.
      for (const s of ["closing", "closed"]) {
        await rig.rootQuery("update clara.fiscal_years set status=$2 where client_id=$1", [ctx.client, s]);
      }

      gate6.open();
      const settled = await pollRow(workId, (w) => TERMINAL.has(w.status), "leg 6 settles");
      assert.equal(settled.status, "refused",
        `leg 6: a locked period refuses the posting (got ${settled.status} / ${JSON.stringify(settled.error)})`);
      assert.equal(settled.error?.code, "CLR19", "leg 6: the estate's period wall is the refuser");
      assert.equal(settled.error?.reason, "write_into_closed_period", "leg 6: …under its exact typed reason");
      assert.equal(settled.error?.recoverable, true, "leg 6: reopen the period and Retry — a human CAN act on it");
      assert.equal(await countEntries(ctx.client), 0, "leg 6: nothing was posted into a closed period");
      assert.equal(await countReceipts(workId), 0, "leg 6: and no receipt");
      console.log("[wc-e2e] PASS 6: period locked between admission and commit — CLR19, refused, zero effect");
    } finally {
      gate6.open();
      if (!engine.state.exited) engine.child.kill("SIGKILL");
      await waitExit(engine.child).catch(() => {});
      gate6.cleanup();
    }
  }

  // =========================================================================
  // 7. restart while STOPPING — the reconciler settles it after respawn.
  // =========================================================================
  const gate7 = makeGate("leg7");
  {
    const ctx = await seedClient("wc-restart");
    const engine = spawnServe(PORT, gate7.env);
    let workId = null;
    try {
      await waitReady(PORT, 90000, engine);
      const admitted = await admit(PORT, ctx, "office rent — killed while stopping", randomUUID());
      assert.equal(admitted.status, 202);
      workId = admitted.body.work_id;
      await gate7.waitHeld(workId);

      // THE KILL COMES FIRST, AND THAT IS WHAT MAKES THIS LEG DETERMINISTIC. `clara.cancel_
      // accounting_work` pg_notifies `clara_runtime_ctl` inside its own transaction, and the control
      // listener living in THIS child wakes on that notification immediately — so cancelling first
      // and killing second is a race between a SIGKILL and a settle that has already been triggered,
      // which the test only usually wins. Killing the worker BEFORE the cancel write removes the
      // race entirely: there is no listener left to hear the NOTIFY, and "stranded between the
      // cancel write and the settle" becomes the state the leg actually constructs.
      //
      // The cancel therefore goes through the DOOR rather than the route (the route died with the
      // engine). Legs 1 and 3 already prove the route reaches the same door.
      engine.child.kill("SIGKILL");
      await waitExit(engine.child);
    } finally {
      if (!engine.state.exited) engine.child.kill("SIGKILL");
      await waitExit(engine.child).catch(() => {});
    }

    const cancelled = await rig
      .asRuntime((c) =>
        c.query("select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as r", [
          workId, ctx.owner, `cancel-${randomUUID()}`,
        ]))
      .then((r) => r.rows[0].r);
    assert.equal(cancelled.status, "stopping", "leg 7: the cancel was written while nothing was alive to settle it");
    assert.equal((await readWork(workId)).status, "stopping", "leg 7: the Work is stranded at stopping");
    const respawned = spawnServe(PORT, gate7.env);
    try {
      // The respawned engine's own held model must not block the reconciler; open the gate so a
      // re-executed step can proceed and the leg measures the SETTLE, not the hold.
      gate7.open();
      await waitReady(PORT, 90000, respawned);
      const settled = await pollRow(workId, (w) => TERMINAL.has(w.status), "leg 7 reconciler settles", 150000);
      assert.ok(["cancelled", "completed"].includes(settled.status),
        `leg 7: the stranded Work reaches a terminal per the receipt law (got ${settled.status})`);
      const receipts = await countReceipts(workId);
      assert.equal(settled.status, receipts > 0 ? "completed" : "cancelled",
        "leg 7: and the terminal is the one the BOOKS justify");
      console.log(`[wc-e2e] PASS 7: restart while stopping — the estate converged on ${settled.status} (${receipts} receipt(s))`);
    } finally {
      if (!respawned.state.exited) respawned.child.kill("SIGKILL");
      await waitExit(respawned.child).catch(() => {});
      gate7.cleanup();
    }
  }

  // =========================================================================
  // 8. Stop reply is NOT Cancel Work — TWO ROWS, NO CASCADE.
  //
  // WHAT THIS LEG PROVES, EXACTLY: cancelling a chat turn's task does not touch an accounting_work
  // task or Work of the same firm, client and author. It does NOT admit the Work through
  // `chatTurn_v18`'s `start_journal_work` — that closure is FROZEN and cannot call `start()`, so a
  // chat-originated Work sits `queued` with `workflow_run_id` null until the reconciler's re-enqueue
  // grace dispatches it, and driving a scripted chat model through the whole turn to reach that
  // state would be a second engine harness for one assertion. The STRUCTURAL claim underneath —
  // that no cascade edge exists for a future change to travel along — is pinned in the database
  // battery instead (`packages/db/tests/work-cancel.test.mjs`, wc.32), which reads the catalog for
  // a parent/child column, an FK and a trigger path rather than inferring one from a passing test.
  // =========================================================================
  {
    const ctx = await seedClient("wc-stopreply");
    const engine = spawnServe(PORT);
    let workId = null;
    try {
      await waitReady(PORT, 90000, engine);
      // A real chat turn, and a Work admitted beside it — two SEPARATE clara.agent_tasks rows.
      const session = await rig.createChatSession({ author: ctx.owner, client: ctx.client });
      const turn = await rig.beginChatTurn({ session, author: ctx.owner });
      const turnTask = turn.task_id ?? turn.taskId;
      assert.ok(turnTask, `leg 8: the chat turn minted a task (${JSON.stringify(turn)})`);

      const admitted = await admit(PORT, ctx, "office rent — stop reply does not cancel me", randomUUID());
      assert.equal(admitted.status, 202);
      workId = admitted.body.work_id;
      const workTask = admitted.body.task_id;
      assert.notEqual(String(workTask), String(turnTask), "leg 8: the Work's run is its OWN task row");

      // STOP REPLY.
      await rig.humanQuery(ctx.owner,
        "select clara.cancel_agent_task(p_task => $1::uuid, p_op_key => $2::text)",
        [turnTask, rig.opk("stop")]);

      const done = await pollRow(workId, (w) => TERMINAL.has(w.status), "leg 8 work completes");
      assert.equal(done.status, "completed",
        `leg 8: stopping the reply did NOT cancel the accepted Work (got ${done.status} / ${JSON.stringify(done.error)})`);
      assert.equal(await countEntries(ctx.client), 1, "leg 8: the Work posted its entry");
      const turnRow = await rig.readTask(turnTask);
      assert.ok(["cancel_requested", "cancelled"].includes(turnRow.status),
        `leg 8: and the chat turn itself IS cancelled (${turnRow.status})`);
      console.log("[wc-e2e] PASS 8: Stop reply and Cancel Work are separate acts on separate rows (no cascade between two live tasks; the catalog-level claim is wc.32)");
    } finally {
      if (!engine.state.exited) engine.child.kill("SIGKILL");
      await waitExit(engine.child).catch(() => {});
    }
  }

  rmSync(GATE_DIR, { recursive: true, force: true });
  console.log("\nWORK CANCEL E2E: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nWORK CANCEL E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
