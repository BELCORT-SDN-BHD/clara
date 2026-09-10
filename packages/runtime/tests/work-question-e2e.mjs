// STANDALONE shared-work-question e2e (#629). NOT a `node --test` file: it SPAWNS scripts/serve.mjs
// (through tests/work-question-serve.mjs, which installs the scripted model first) as a CHILD
// process, so the engine can be crashed mid-run and respawned against the SAME database, and TWO
// engines can be run at once against it. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5651 PGUSER=postgres PGDATABASE=clara_wave_b_ci \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5651/clara_wave_b_ci \
//   RELAY_TEST_MODE=1 node tests/work-question-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real Postgres world plus a real HTTP boundary:
//   1. ASK. A run that needs a fact opens ONE persistent question with typed FIELDS, version 1 and
//      its Work's basis digest; the Work is `awaiting_input`; and the firm inbox
//      (`clara.list_review_queue`) offers the same question as a `work_question` row.
//   2. ANSWER, ONCE. The first-answer gate accepts one answer; the SAME key + payload REPLAYS the
//      original receipt; the same key with a DIFFERENT payload is a typed conflict; a SECOND
//      member's answer converges on `already_answered` with the winner's identity. The listener
//      then delivers it, the run resumes, and exactly ONE entry and ONE committed receipt exist.
//   3. CRASH BEFORE RESUME. `CLARA_WORK_TEST_FAULT=exit_before_deliver` kills the process AFTER the
//      lease UPDATE committed and BEFORE `resumeHook`. On respawn the lease has expired, the row is
//      re-leased, the hook is still unconsumed, and the answer is delivered EXACTLY ONCE.
//   4. CRASH AFTER RESUME, BEFORE SETTLEMENT. `exit_after_commit` kills it the instant the database
//      returns a receipt for the post-answer segment. On respawn the WDK re-executes the step, the
//      tool call REPLAYS onto the same logical identity, and one entry / one receipt exist.
//   5. LEASE EXPIRY WITH TWO WORKERS. Worker A holds a question past its own lease WITHOUT renewing
//      (`stall_deliver`, `CLARA_CTL_LEASE_SECONDS=2`); worker B re-leases and delivers. Exactly one
//      resume wins, one entry and one receipt exist, and A never stamps B's delivery as its own.
//   6. EXPIRY IS RECOVERABLE. A past-due question is expired, delivered as `{kind:'expired'}`, the
//      Work settles `expired` (recoverable), and a Retry makes a NEW run that asks AGAIN — as a
//      NEW row with `question_version = 2`.
//   7. ROLE LOSS BLOCKS CONTINUATION. The initiator's membership is deactivated before the answer
//      is delivered; `claraWork_v2`'s authority recheck settles the Work `refused`/`authority_lost`
//      and NOTHING is posted.
//
// WHAT IT DELIBERATELY DOES NOT DRIVE: the HookNotFound reconciliation (leg 8 of the work order).
// Forcing a REAL engine to lose a hook while its run stays suspended is not reachable from outside
// the WDK, and a leg that faked it would be evidence about the fake. It is proven deterministically
// instead in tests/control-work-question.test.mjs against a real Postgres with an injected world —
// both directions (a terminal run and a moved-on task stamp delivered; a live run with no hook
// rests at `hook_missing` and the Work reconciler settles it `expired`).
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out, and the file SKIPS CLEANLY when migration 0180 is absent.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[wq-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate (the work-journal-e2e precedent, verbatim).
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("work-question-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
{
  if (!process.env.WORKFLOW_POSTGRES_URL) throw new Error("work-question-e2e needs WORKFLOW_POSTGRES_URL");
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("work-question-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const ISSUER = "https://clara-wq-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "wq-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./work-question-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 12 * 60 * 1000;
setTimeout(() => {
  console.error(`\nWORK QUESTION E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  delete base.CLARA_CTL_LEASE_SECONDS;
  return Object.assign(base, extra);
}

function spawnServe(port, extra = {}) {
  const child = spawn(process.execPath, [serveScript], { env: childEnv(port, extra), stdio: ["ignore", "pipe", "pipe"] });
  const state = { exited: false, exitInfo: null, banner: null };
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
    if (/FATAL|Error:|exit_before_deliver|exit_after_commit|stall_deliver|lease lost/.test(d)) process.stderr.write(`[child:${port}] ${d}`);
  });
  return { child, state, port };
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

async function waitReady(port, deadlineMs = 60000) {
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
  throw new Error(`serve child on ${port} did not become ready (/health + /ready 200)`);
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

/** The basis every leg admits. The ANSWER's values are the SAME date and amount, because
 *  `clara.admit_journal_work` digests the basis before the run exists and the recording verb
 *  refuses any echo that does not hash to it — see work-question-serve.mjs's header. */
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

const ANSWER = { posting_date: POSTING_DATE, amount_cents: CENTS };
const TERMINAL = new Set(["completed", "refused", "failed", "cancelled", "expired"]);

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regprocedure('clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb)') is not null as open_fn,
           to_regprocedure('clara.answer_work_question(uuid,integer,jsonb,text)') is not null as answer_fn,
           to_regprocedure('clara.work_authority_snapshot(uuid)') is not null as authority_fn
  `);
  const p = probe.rows[0] ?? {};
  if (!p.open_fn || !p.answer_fn || !p.authority_fn) {
    console.log("[wq-e2e] SKIPPED — migration 0180 (work questions) is not on this database");
    process.exit(0);
  }

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countReceipts = (work) =>
    rig
      .rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  const questionsFor = (work) =>
    rig
      .rootQuery(
        "select id, question_version, status, delivery_state, delivery_attempts, answered_by, answered_role, fields, answer"
        + " from clara.agent_interruptions where work_id = $1 order by question_version",
        [work],
      )
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

  /** Wait for a Work to reach a state, over the REAL read route. */
  async function pollWork(port, workId, jwt, pred, label, deadlineMs = 90000) {
    const end = Date.now() + deadlineMs;
    let last = null;
    while (Date.now() < end) {
      const r = await api(port, "GET", `/api/work/${workId}`, undefined, jwt);
      last = r;
      if (r.status === 200 && pred(r.body)) return r.body;
      await sleep(250);
    }
    throw new Error(`pollWork timeout (${label}); last=${JSON.stringify(last)}`);
  }

  /** Wait for the run to PARK on a question, read from the database. */
  async function pollQuestion(workId, label, deadlineMs = 90000) {
    const end = Date.now() + deadlineMs;
    while (Date.now() < end) {
      const rows = await questionsFor(workId);
      const pending = rows.find((r) => r.status === "pending");
      if (pending) return pending;
      await sleep(250);
    }
    throw new Error(`pollQuestion timeout (${label})`);
  }

  const answerQuestion = (sub, question, version, answer, opKey) =>
    rig
      .humanQuery(sub, "select clara.answer_work_question($1::uuid,$2::int,$3::jsonb,$4::text) as r", [
        question, version, JSON.stringify(answer), opKey,
      ])
      .then((r) => r.rows[0].r);

  const admit = async (port, ctx, memo, intentKey) =>
    api(port, "POST", "/api/work/journal", { clientId: ctx.client, intentKey, basis: basisFor(memo) }, ctx.jwt);

  // =========================================================================
  // 1 + 2: ask, answer once, deliver, post once.
  // =========================================================================
  const PORT_A = await ephemeralPort();
  let a = spawnServe(PORT_A);
  try {
    await waitReady(PORT_A);
    assert.ok(a.state.banner, "C88.8: the world-start banner names the serving bundle digest");
    console.log(`[wq-e2e] engine A ready on ${PORT_A}; serving clara-work/v2 digest=${a.state.banner}`);

    // ---- 1. the run asks -------------------------------------------------
    const one = await seedClient("wq-ask");
    const admitted = await admit(PORT_A, one, "office rent — wq 1", randomUUID());
    assert.equal(admitted.status, 202, `admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
    const workId = admitted.body.work_id;

    const q = await pollQuestion(workId, "leg 1");
    assert.equal(q.question_version, 1, "the first question on a Work is version 1");
    assert.deepEqual(
      q.fields.map((f) => [f.key, f.kind, f.required]),
      [["posting_date", "date", true], ["amount_cents", "money", true]],
      "the TYPED fields the model declared are stored verbatim",
    );
    assert.equal(q.delivery_state, "pending");
    const parked = await api(PORT_A, "GET", `/api/work/${workId}`, undefined, one.jwt);
    assert.equal(parked.body.work.status, "awaiting_input", "the Work is honest about being blocked");

    const record = await rig
      .humanQuery(one.owner, "select clara.get_work_question($1::uuid) as r", [q.id])
      .then((r) => r.rows[0].r);
    assert.equal(record.question_id, q.id);
    assert.equal(record.work_id, workId);
    assert.ok(record.reason, "the record carries the REASON the model gave — no surface can show one it never got");
    assert.equal(record.work_status, "awaiting_input");
    assert.equal(record.basis_digest, record.work_basis_digest, "the question pins the Work's basis");

    const queue = await rig
      .humanQuery(one.owner, "select clara.list_review_queue($1::jsonb,null,200) as r", [JSON.stringify({ client_id: one.client })])
      .then((r) => r.rows[0].r);
    const inboxRows = queue.rows.filter((r) => r.row_kind === "work_question");
    assert.equal(inboxRows.length, 1, "Needs-you offers the SAME question");
    assert.equal(inboxRows[0].id, q.id);
    assert.equal(inboxRows[0].section, "needs_you");
    assert.equal(queue.counts.work_questions, 1, "…and the counts envelope names them");
    console.log("[wq-e2e] PASS 1: the run parked on ONE typed question, offered on the Work AND in Needs-you");

    // ---- 2. the first-answer gate ---------------------------------------
    const bob = await rig.addMember(one.owner, one.firm, { role: "bookkeeper", prefix: "wqbob" });
    const opKey = `wq-${randomUUID()}`;
    const accepted = await answerQuestion(one.owner, q.id, 1, ANSWER, opKey);
    assert.equal(accepted.status, "answered");
    assert.equal(accepted.answered_by, one.owner);

    const replayed = await answerQuestion(one.owner, q.id, 1, ANSWER, opKey);
    assert.deepEqual(replayed, accepted, "the SAME key + payload REPLAYS the original receipt");

    let conflicted = null;
    try {
      await answerQuestion(one.owner, q.id, 1, { ...ANSWER, amount_cents: 1 }, opKey);
    } catch (e) {
      conflicted = e;
    }
    assert.ok(conflicted, "the same key with a DIFFERENT payload is refused");
    assert.equal(conflicted.code, "CLR10");
    assert.equal(JSON.parse(conflicted.detail).reason, "op_key_conflict");

    let loser = null;
    try {
      await answerQuestion(bob, q.id, 1, ANSWER, `wq-${randomUUID()}`);
    } catch (e) {
      loser = e;
    }
    assert.ok(loser, "a SECOND member's answer is refused");
    assert.equal(loser.code, "CLR13");
    const loserDetail = JSON.parse(loser.detail);
    assert.equal(loserDetail.reason, "already_answered");
    assert.equal(loserDetail.current.answered_by, one.owner, "…and is handed the WINNER's identity");

    const settled = await pollWork(PORT_A, workId, one.jwt, (b) => TERMINAL.has(b.work.status), "leg 2 settles");
    assert.equal(settled.work.status, "completed", `the Work completes (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
    assert.equal(await countEntries(one.client), 1, "exactly ONE journal entry");
    assert.equal(await countReceipts(workId), 1, "exactly ONE committed operation receipt");
    const delivered = (await questionsFor(workId))[0];
    assert.equal(delivered.status, "answered");
    assert.equal(delivered.delivery_state, "delivered", "the listener stamped the delivery it actually made");
    assert.equal(delivered.answered_role, "owner", "the role whose live authority accepted the answer is recorded");

    const entry = await rig
      .rootQuery("select posting_date::text as posting_date from clara.journal_entries where id = $1", [settled.work.result.entry_id]);
    assert.equal(entry.rows[0].posting_date, POSTING_DATE, "the posted date is the answered date, exactly");
    const lines = await rig.rootQuery(
      "select account_code, debit_cents, credit_cents from clara.journal_lines where entry_id = $1 order by account_code",
      [settled.work.result.entry_id],
    );
    assert.deepEqual(
      lines.rows.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
      [["1100", 0, CENTS], ["6100", CENTS, 0]],
      "the EXACT answered cents, both sides",
    );
    assert.equal(settled.work.bundle?.digest, a.state.banner, "the Work records the v2 digest the process logged");
    const receipt = await rig.rootQuery("select bundle_digest from clara.operation_receipts where work_id = $1", [workId]);
    assert.equal(receipt.rows[0].bundle_digest, a.state.banner, "…and so does the receipt — one bundle, one claim");
    console.log("[wq-e2e] PASS 2: one accepted answer, replayed key, typed conflict, converged loser, ONE entry + ONE receipt");

    // ---- 7. role loss blocks continuation --------------------------------
    // Driven BEFORE the crash legs so it runs on this same long-lived engine. The initiator is a
    // BOOKKEEPER (not the owner — an owner cannot be deactivated without breaking the firm), and
    // their membership is retired BEFORE the answer, so the delivery is deterministic.
    const roleCtx = await seedClient("wq-role");
    const initiator = await rig.addMember(roleCtx.owner, roleCtx.firm, { role: "bookkeeper", prefix: "wqinit" });
    const initiatorJwt = await mint(initiator);
    const roleAdmit = await api(
      PORT_A, "POST", "/api/work/journal",
      { clientId: roleCtx.client, intentKey: randomUUID(), basis: basisFor("office rent — wq role") },
      initiatorJwt,
    );
    assert.equal(roleAdmit.status, 202, `role-loss admission 202 (got ${roleAdmit.status} ${JSON.stringify(roleAdmit.body)})`);
    const roleWork = roleAdmit.body.work_id;
    const roleQ = await pollQuestion(roleWork, "leg 7");
    await rig.rootQuery("update clara.firm_memberships set status='removed' where firm_id=$1 and user_id=$2", [roleCtx.firm, initiator]);
    await answerQuestion(roleCtx.owner, roleQ.id, 1, ANSWER, `wq-${randomUUID()}`);
    const roleSettled = await pollWork(PORT_A, roleWork, roleCtx.jwt, (b) => TERMINAL.has(b.work.status), "leg 7 settles");
    assert.equal(roleSettled.work.status, "refused", `role loss REFUSES the Work (got ${roleSettled.work.status})`);
    assert.equal(roleSettled.work.error?.reason, "authority_lost");
    assert.equal(roleSettled.work.error?.recoverable, false, "a Retry would run under the same absent authority");
    assert.equal(await countEntries(roleCtx.client), 0, "nothing was posted");
    assert.equal(await countReceipts(roleWork), 0, "and no receipt was written");
    console.log("[wq-e2e] PASS 7: role loss settles refused/authority_lost with no effect");

    // ---- 6. expiry is recoverable ----------------------------------------
    const expCtx = await seedClient("wq-expire");
    const expAdmit = await admit(PORT_A, expCtx, "office rent — wq expire", randomUUID());
    const expWork = expAdmit.body.work_id;
    const expQ = await pollQuestion(expWork, "leg 6");
    // `expires_at` is immutable (0006) and `clara.expire_due_interruptions` only moves a row that
    // is genuinely past due, so the deadline is reached the only way it can be from outside: the
    // row is moved to `expired` through the transition 0006's own allowlist admits, and the
    // LISTENER's delivery of `{kind:'expired'}` is what this leg measures.
    await rig.rootQuery("update clara.agent_interruptions set status='expired' where id=$1", [expQ.id]);
    const expSettled = await pollWork(PORT_A, expWork, expCtx.jwt, (b) => TERMINAL.has(b.work.status), "leg 6 settles");
    assert.equal(expSettled.work.status, "expired", `an expired question expires the Work (got ${expSettled.work.status})`);
    assert.equal(expSettled.work.error?.recoverable, true, "…recoverably");
    assert.equal(await countEntries(expCtx.client), 0, "nothing was posted");

    const retried = await api(PORT_A, "POST", `/api/work/${expWork}/retry`, { opKey: randomUUID() }, expCtx.jwt);
    assert.ok(retried.status === 202 || retried.status === 200, `retry accepted (got ${retried.status} ${JSON.stringify(retried.body)})`);
    const second = await (async () => {
      const end = Date.now() + 90000;
      while (Date.now() < end) {
        const rows = await questionsFor(expWork);
        const v2 = rows.find((r) => r.question_version === 2);
        if (v2) return v2;
        await sleep(250);
      }
      throw new Error("the retried run never asked again");
    })();
    assert.equal(second.status, "pending", "the retry asks a NEW question");
    assert.equal(second.question_version, 2, "…as version 2, with the version-1 row kept as history");
    assert.equal((await questionsFor(expWork)).length, 2);
    console.log("[wq-e2e] PASS 6: expiry leaves the Work recoverable; Retry asks again as version 2");
  } finally {
    a.child.kill("SIGKILL");
    await waitExit(a.child).catch(() => {});
  }

  // =========================================================================
  // 3: a crash BETWEEN the lease and the resume.
  // =========================================================================
  {
    const PORT_B = await ephemeralPort();
    const ctx = await seedClient("wq-crash1");
    let engine = spawnServe(PORT_B);
    let workId = null;
    let questionId = null;
    try {
      await waitReady(PORT_B);
      const admitted = await admit(PORT_B, ctx, "office rent — wq crash before", randomUUID());
      workId = admitted.body.work_id;
      const q = await pollQuestion(workId, "leg 3");
      questionId = q.id;
    } finally {
      engine.child.kill("SIGKILL");
      await waitExit(engine.child).catch(() => {});
    }

    // The answer is accepted while NO engine is running — the durable question is the whole point.
    await answerQuestion(ctx.owner, questionId, 1, ANSWER, `wq-${randomUUID()}`);

    // A faulted engine: it leases the row, commits the lease, and exits BEFORE resuming.
    const faulted = spawnServe(PORT_B, { CLARA_WORK_TEST_FAULT: "exit_before_deliver" });
    await waitExit(faulted.child, 90000);
    const afterCrash = (await questionsFor(workId))[0];
    assert.equal(afterCrash.delivered_at ?? null, null, "the crash left the answer UNDELIVERED");
    assert.ok(afterCrash.delivery_attempts >= 1, "…with the attempt counted");
    assert.equal(await countEntries(ctx.client), 0, "and nothing posted");

    const recovered = spawnServe(PORT_B, { CLARA_CTL_LEASE_SECONDS: "2" });
    try {
      await waitReady(PORT_B);
      const settled = await pollWork(PORT_B, workId, ctx.jwt, (b) => TERMINAL.has(b.work.status), "leg 3 settles");
      assert.equal(settled.work.status, "completed", `the respawned engine completes the Work (got ${settled.work.status})`);
      assert.equal(await countEntries(ctx.client), 1, "EXACTLY ONE entry after the crash and the retry");
      assert.equal(await countReceipts(workId), 1, "EXACTLY ONE committed receipt");
      const row = (await questionsFor(workId))[0];
      assert.equal(row.delivery_state, "delivered");
      console.log("[wq-e2e] PASS 3: a crash between the lease and the resume delivers exactly once on respawn");
    } finally {
      recovered.child.kill("SIGKILL");
      await waitExit(recovered.child).catch(() => {});
    }
  }

  // =========================================================================
  // 4: a crash AFTER the post-answer commit, before the settle.
  // =========================================================================
  {
    const PORT_C = await ephemeralPort();
    const ctx = await seedClient("wq-crash2");
    let workId = null;
    let questionId = null;
    const faulted = spawnServe(PORT_C, { CLARA_WORK_TEST_FAULT: "exit_after_commit" });
    try {
      await waitReady(PORT_C);
      const admitted = await admit(PORT_C, ctx, "office rent — wq crash after", randomUUID());
      workId = admitted.body.work_id;
      const q = await pollQuestion(workId, "leg 4");
      questionId = q.id;
      await answerQuestion(ctx.owner, questionId, 1, ANSWER, `wq-${randomUUID()}`);
      // The fault fires inside the POST-ANSWER segment, the instant the database returns a receipt.
      await waitExit(faulted.child, 120000);
    } finally {
      faulted.child.kill("SIGKILL");
      await waitExit(faulted.child).catch(() => {});
    }
    assert.equal(await countReceipts(workId), 1, "the database COMMITTED before the crash — one receipt");
    assert.equal(await countEntries(ctx.client), 1, "…and one entry");

    const recovered = spawnServe(PORT_C);
    try {
      await waitReady(PORT_C);
      const settled = await pollWork(PORT_C, workId, ctx.jwt, (b) => TERMINAL.has(b.work.status), "leg 4 settles");
      assert.equal(settled.work.status, "completed", `the replayed step completes the Work (got ${settled.work.status})`);
      assert.equal(await countEntries(ctx.client), 1, "STILL exactly one entry — the replay resolved the ORIGINAL receipt");
      assert.equal(await countReceipts(workId), 1, "STILL exactly one committed receipt");
      console.log("[wq-e2e] PASS 4: a crash after the post-answer commit replays onto the same identity");
    } finally {
      recovered.child.kill("SIGKILL");
      await waitExit(recovered.child).catch(() => {});
    }
  }

  // =========================================================================
  // 5: two workers, one lease expiry.
  // =========================================================================
  {
    const PORT_D = await ephemeralPort();
    const PORT_E = await ephemeralPort();
    const ctx = await seedClient("wq-two");
    let workId = null;
    let questionId = null;
    const opener = spawnServe(PORT_D);
    try {
      await waitReady(PORT_D);
      const admitted = await admit(PORT_D, ctx, "office rent — wq two workers", randomUUID());
      workId = admitted.body.work_id;
      questionId = (await pollQuestion(workId, "leg 5")).id;
    } finally {
      opener.child.kill("SIGKILL");
      await waitExit(opener.child).catch(() => {});
    }
    await answerQuestion(ctx.owner, questionId, 1, ANSWER, `wq-${randomUUID()}`);

    // WORKER A holds the row past its own two-second lease WITHOUT renewing it. WORKER B re-leases
    // and delivers. The claimant condition on the delivered stamp is what keeps A from counting
    // B's delivery as its own.
    // A STARTS FIRST, AND THE ORDER IS THE POINT. Both workers race the same row, so a
    // simultaneous start would sometimes have B lease it before A ever saw it — and the leg would
    // then prove only "two processes, one entry", which is true of one process too. Starting A and
    // letting one control cycle elapse makes A the FIRST claimant deterministically; B then finds
    // a live lease, waits it out, and re-leases when A's two seconds expire without a renewal.
    const workerA = spawnServe(PORT_D, { CLARA_WORK_TEST_FAULT: "stall_deliver", CLARA_CTL_LEASE_SECONDS: "2" });
    let workerB = null;
    try {
      await waitReady(PORT_D);
      await sleep(3500);
      workerB = spawnServe(PORT_E, { CLARA_CTL_LEASE_SECONDS: "2" });
      await waitReady(PORT_E);
      const settled = await pollWork(PORT_E, workId, ctx.jwt, (b) => TERMINAL.has(b.work.status), "leg 5 settles", 120000);
      assert.equal(settled.work.status, "completed", `one of the two workers delivered (got ${settled.work.status})`);
      assert.equal(await countEntries(ctx.client), 1, "EXACTLY ONE entry, with two workers racing the same answer");
      assert.equal(await countReceipts(workId), 1, "EXACTLY ONE committed receipt");
      const row = (await questionsFor(workId))[0];
      assert.equal(row.delivery_state, "delivered");
      assert.ok(row.delivery_attempts >= 2, `both workers attempted (attempts=${row.delivery_attempts})`);
      console.log(`[wq-e2e] PASS 5: two workers, a lost lease, ONE delivery and ONE entry (attempts=${row.delivery_attempts})`);
    } finally {
      workerA.child.kill("SIGKILL");
      workerB?.child.kill("SIGKILL");
      await waitExit(workerA.child).catch(() => {});
      if (workerB) await waitExit(workerB.child).catch(() => {});
    }
  }

  console.log("\nWORK QUESTION E2E: ALL LEGS PASSED");
  await rig.endPool();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\nWORK QUESTION E2E FAILED:", err);
  process.exit(1);
});
