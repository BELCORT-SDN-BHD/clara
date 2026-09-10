// STANDALONE accounting-Work e2e (#623). NOT a `node --test` file: it SPAWNS scripts/serve.mjs
// (through tests/work-journal-serve.mjs, which installs the scripted model first) as a CHILD
// process, so the engine can be crashed mid-run and respawned against the SAME database — the
// pattern tests/interview-kill-resume-e2e.mjs established. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   node tests/work-journal-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real Postgres world plus a real HTTP boundary:
//   1. ADMIT -> RUN -> COMMIT. One POST produces one Work, one run, one approved journal entry
//      with its lines, and ONE `clara.operation_receipts` row attributing the act.
//   2. A LOST ACKNOWLEDGEMENT. The same intentKey re-POSTed returns the SAME Work with
//      `replayed:true` and mints no second task and no second entry.
//   3. A CHANGED PAYLOAD under that key is a 409 with a typed conflict and no second effect.
//   4. A RUN THAT PRODUCED NOTHING settles `failed`/`no_effect` — not `completed` — and Retry
//      creates a NEW run for the SAME logical operation identity, which then commits under that
//      identity (C-62 / C54.1).
//   5. A CRASH AFTER COMMIT, BEFORE CHECKPOINT. `CLARA_WORK_TEST_FAULT=exit_after_commit` exits
//      the process the instant the database returns a receipt. On respawn the WDK re-executes the
//      step, the tool call REPLAYS onto the same logical identity, and exactly ONE entry and ONE
//      committed receipt exist.
//   6. THE CHAT-ORIGIN DISPATCH LATENCY, measured rather than asserted: a Work admitted with no
//      post-commit enqueue (which is what chatTurn_v18's frozen tool can do, and all it can do)
//      is picked up by the reconciler's `accounting_work` arm, and this file prints how long that
//      took.
//   7. B6 END TO END, THROUGH THE REAL chatTurn_v18 CLOSURE. Reviewed finding R7: every existing
//      cell for `start_journal_work` drove it against FAKE pools, so nothing proved that a real
//      chat turn — the frozen v18 body, a real session, a real `withRuntime` checkout, the real
//      admission verb — produces a Work at all. This leg posts a turn over HTTP, lets the scripted
//      model call the tool with the SAME figures as leg 1, and then asserts BOTH halves of the
//      journey: the admitted row's `basis`, `basis_digest`, `basis_origin='clara_interpreted'`
//      and its `chat_task` source ref, AND that the reconciler dispatched it through to a
//      completed Work with exactly one entry and one committed receipt. Legs 1 and 6 each prove
//      one half against a synthetic admission; only this one joins them.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent), and the file SKIPS CLEANLY
// when migration 0178 is absent — its runtime half merges alongside its DB half, and a green e2e
// against a database with no `clara.accounting_work` would be a lie, not a pass.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[work-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate (the intake-e2e / kill-resume precedent).
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("work-journal-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("work-journal-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}
{
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("work-journal-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.WORK_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-work-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "work-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./work-journal-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 10 * 60 * 1000;
setTimeout(() => {
  console.error(`\nWORK JOURNAL E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
    // The reconciler's grace is what scenario 6 measures; keep the default so the number printed
    // is the one production would see, not a tuned one.
  });
  delete base.CLARA_WORK_TEST_FAULT;
  delete base.CLARA_WORK_TEST_SCRIPT;
  return Object.assign(base, extra);
}

function spawnServe(extra = {}) {
  const child = spawn(process.execPath, [serveScript], { env: childEnv(extra), stdio: ["ignore", "pipe", "pipe"] });
  const state = { exited: false, exitInfo: null, banner: null };
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    const m = /\[clara-runtime\] bundle clara-work\/v1 digest=([0-9a-f]{64})/.exec(d);
    if (m && !state.banner) state.banner = m[1];
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    if (/FATAL|Error:|exit_after_commit/.test(d)) process.stderr.write(`[child] ${d}`);
  });
  return { child, state };
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

async function waitReady(deadlineMs = 45000) {
  const end = Date.now() + deadlineMs;
  let healthy = false;
  while (Date.now() < end) {
    try {
      if (!healthy && (await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).ok) healthy = true;
      if (healthy) {
        const r = await fetch(`${BASE}/ready`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (r.status === 200) return;
      }
    } catch {
      /* booting */
    }
    await sleep(250);
  }
  throw new Error("serve child did not become ready (/health + /ready 200)");
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

function basisFor(memo, cents = 120000) {
  return {
    postingDate: "2026-09-01",
    memo,
    currency: "MYR",
    lines: [
      { accountCode: "6100", debitCents: cents, creditCents: 0, description: "office rent" },
      { accountCode: "1100", debitCents: 0, creditCents: cents, description: "Maybank" },
    ],
  };
}

/** The B6 leg's scripted `start_journal_work` input — THE SAME FIGURES leg 1 posts through the C3
 *  composer, so the two admission paths can be compared byte for byte on the admitted basis. */
const CHAT_TOOL_INPUT = {
  posting_date: "2026-09-01",
  memo: "office rent — e2e 1",
  lines: [
    { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
    { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
  ],
  rationale: "the human named the date, the amount and both accounts",
};

/** The DATABASE-shaped basis both paths must land on: `toDbBasis` (the route) and
 *  `basisFromInput` (the frozen chat tool) are different translators of one contract. */
const EXPECTED_DB_BASIS = {
  posting_date: "2026-09-01",
  memo: "office rent — e2e 1",
  currency: "MYR",
  lines: [
    { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
    { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
  ],
};

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regclass('clara.accounting_work') is not null as work_tbl,
           to_regprocedure('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)') is not null as admit
  `);
  if (!probe.rows[0]?.work_tbl || !probe.rows[0]?.admit) {
    console.log("[work-e2e] SKIPPED — migration 0178 (clara.accounting_work + clara.admit_journal_work) is not on this database");
    process.exit(0);
  }

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countReceipts = (work) =>
    rig
      .rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  const readWork = (id) => rig.rootQuery("select * from clara.accounting_work where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const tasksFor = (work) =>
    rig
      .rootQuery("select id, status, workflow_run_id, error_code from clara.agent_tasks where work_id = $1 order by created_at", [work])
      .then((r) => r.rows);

  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type] of [["6100", "Rent expense", "expense"], ["1100", "Maybank current account", "asset"]]) {
      await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r", [
        client,
        code,
        name,
        type,
        rig.opk("acct"),
      ]);
    }
    return { owner, firm, client, jwt: await mint(owner) };
  }

  async function pollWork(workId, jwt, pred, label, deadlineMs = 60000) {
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
  // 1-4, 6: one long-lived engine.
  // =========================================================================
  const first = spawnServe({ CLARA_CHAT_TEST_BASIS: JSON.stringify(CHAT_TOOL_INPUT) });
  try {
    await waitReady();
    assert.ok(first.state.banner, "C88.8: the world-start banner names the serving bundle digest");
    console.log(`[work-e2e] engine ready; serving bundle digest=${first.state.banner}`);

    // ---- 1. admit -> run -> commit ---------------------------------------
    const one = await seedClient("we-commit");
    const intent = randomUUID();
    const admitted = await api("POST", "/api/work/journal", { clientId: one.client, intentKey: intent, basis: basisFor("office rent — e2e 1") }, one.jwt);
    assert.equal(admitted.status, 202, `admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
    assert.equal(admitted.body.status, "queued");
    assert.equal(admitted.body.replayed, false);
    assert.equal(admitted.body.logical_op_id, `work:${admitted.body.work_id}:journal_entry:1`, "server-assigned logical identity");

    const done = await pollWork(admitted.body.work_id, one.jwt, (b) => TERMINAL.has(b.work.status), "work settles");
    assert.equal(done.work.status, "completed", `the Work completes (got ${done.work.status} / ${JSON.stringify(done.work.error)})`);
    assert.ok(done.work.result?.entry_id, "the result names the posted entry");
    assert.ok(done.work.result?.receipt_id, "and its operation receipt");
    assert.equal(done.work.bundle?.digest, first.state.banner, "the Work records the digest the process logged (C88.8/C-70)");
    assert.equal(done.task.workflow_run_id, true, "the read serves run-BOUNDNESS, never the engine's run id");

    assert.equal(await countEntries(one.client), 1, "exactly ONE journal entry");
    assert.equal(await countReceipts(admitted.body.work_id), 1, "exactly ONE committed operation receipt");

    const entry = await rig.rootQuery("select * from clara.journal_entries where id = $1", [done.work.result.entry_id]);
    assert.equal(entry.rows[0].status, "approved", "the entry is posted approved, not left as a draft");
    assert.equal(entry.rows[0].origin, "agent");
    assert.equal(entry.rows[0].document_id, null, "documentless — no fabricated document id");
    const lines = await rig.rootQuery("select account_code, debit_cents, credit_cents from clara.journal_lines where entry_id = $1 order by account_code", [
      done.work.result.entry_id,
    ]);
    assert.deepEqual(
      lines.rows.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
      [["1100", 0, 120000], ["6100", 120000, 0]],
      "the EXACT admitted cents, both sides",
    );
    const receipt = await rig.rootQuery("select * from clara.operation_receipts where work_id = $1", [admitted.body.work_id]);
    assert.equal(receipt.rows[0].on_behalf_of, one.owner, "the receipt names the HUMAN whose authority was rechecked");
    assert.notEqual(receipt.rows[0].acting_actor, one.owner, "and the AGENT as the acting actor — no human impersonation");
    assert.equal(receipt.rows[0].bundle_digest, first.state.banner);
    console.log("[work-e2e] PASS 1: admit -> run -> one approved documentless entry + one receipt");

    // ---- 2. a lost acknowledgement, re-POSTed -----------------------------
    const replay = await api("POST", "/api/work/journal", { clientId: one.client, intentKey: intent, basis: basisFor("office rent — e2e 1") }, one.jwt);
    assert.equal(replay.status, 202);
    assert.equal(replay.body.work_id, admitted.body.work_id, "the SAME Work");
    assert.equal(replay.body.replayed, true, "and it says so");
    await sleep(500);
    assert.equal((await tasksFor(admitted.body.work_id)).length, 1, "no second run");
    assert.equal(await countEntries(one.client), 1, "no second entry");
    console.log("[work-e2e] PASS 2: a re-POSTed intentKey replays onto the same Work");

    // ---- 3. a changed payload under the same key --------------------------
    const conflict = await api(
      "POST",
      "/api/work/journal",
      { clientId: one.client, intentKey: intent, basis: basisFor("office rent — e2e 1", 130000) },
      one.jwt,
    );
    assert.equal(conflict.status, 409, `a changed basis under the same intent is a 409 (got ${conflict.status})`);
    assert.equal(conflict.body.error, "intent_payload_conflict");
    assert.equal(await countEntries(one.client), 1, "the conflict created NO second effect");
    console.log("[work-e2e] PASS 3: a changed payload under the same intent key is a typed conflict with no effect");

    // ---- 7. B6: a REAL chatTurn_v18 turn admits the Work -------------------
    // Everything in this leg is the production path: an HTTP session, an HTTP turn, the frozen
    // v18 body, the frozen tool, `clara.admit_journal_work` under `withRuntime`, and then the
    // reconciler's `accounting_work` arm — which is the ONLY thing that can dispatch a
    // chat-admitted Work, because a frozen file may not import the registry to call `start()`.
    const chat = await seedClient("we-b6");
    const session = await api("POST", "/api/chat/sessions", { clientId: chat.client, title: "B6" }, chat.jwt);
    assert.equal(session.status, 201, `session created (got ${session.status} ${JSON.stringify(session.body)})`);
    const sessionId = session.body.id ?? session.body.session_id;
    assert.ok(sessionId, `the session id comes back (${JSON.stringify(session.body)})`);

    const turn = await api(
      "POST",
      `/api/chat/${sessionId}/turns`,
      {
        turnKey: `tk_${randomUUID().slice(0, 12)}`,
        parts: [{ type: "text", text: "record RM 1,200 office rent paid from Maybank on 2026-09-01: Dr 6100 / Cr 1100" }],
      },
      chat.jwt,
    );
    assert.equal(turn.status, 202, `the turn is accepted (got ${turn.status} ${JSON.stringify(turn.body)})`);
    const chatTaskId = turn.body.task_id;
    assert.ok(chatTaskId, "and it names the chat task");

    // The Work the TOOL admitted, found by the client it was pinned to (the chat turn never
    // returns a work id — the card does, and the card is the web's business).
    const b6StartedAt = Date.now();
    let b6Work = null;
    while (Date.now() - b6StartedAt < 90000) {
      const r = await rig.rootQuery("select * from clara.accounting_work where client_id = $1", [chat.client]);
      if (r.rows.length > 0) {
        b6Work = r.rows[0];
        break;
      }
      await sleep(250);
    }
    assert.ok(b6Work, "the chat turn admitted a Work through clara.admit_journal_work");
    assert.equal(b6Work.purpose, "journal_entry");
    assert.equal(b6Work.initiator, chat.owner, "admitted for the HUMAN who was talking, not a service identity");
    assert.deepEqual(b6Work.basis, EXPECTED_DB_BASIS, "the frozen tool's translation lands on the SAME basis the composer's does");
    assert.ok(/^[0-9a-f]{64}$/.test(b6Work.basis_digest), "the DATABASE derived the digest — the tool never sends one");
    assert.equal(b6Work.basis_origin, "clara_interpreted", "a chat-originated basis is labelled INTERPRETED, never user_direct");
    assert.equal(b6Work.source_refs.length, 1, "one source ref");
    assert.equal(b6Work.source_refs[0].kind, "chat_task", "and it names the conversation this basis came from");
    assert.equal(String(b6Work.source_refs[0].task_id), String(chatTaskId), "the ref points at the REAL chat task");
    assert.equal(String(b6Work.source_refs[0].session_id), String(sessionId), "read off the task, never from a model argument");
    assert.equal(b6Work.logical_op_id, `work:${b6Work.id}:journal_entry:1`, "server-assigned logical identity");

    const b6Done = await pollWork(b6Work.id, chat.jwt, (b) => TERMINAL.has(b.work.status), "b6 work settles", 90000);
    const b6LatencyMs = Date.now() - b6StartedAt;
    assert.equal(b6Done.work.status, "completed", `the reconciler dispatched it and it completed (got ${b6Done.work.status} / ${JSON.stringify(b6Done.work.error)})`);
    assert.ok(b6Done.work.result?.entry_id, "with a posted entry");
    assert.equal(await countEntries(chat.client), 1, "EXACTLY ONE journal entry for this client");
    assert.equal(await countReceipts(b6Work.id), 1, "and EXACTLY ONE committed operation receipt");
    const b6Entry = await rig.rootQuery("select status, origin, document_id from clara.journal_entries where id = $1", [b6Done.work.result.entry_id]);
    assert.equal(b6Entry.rows[0].status, "approved");
    assert.equal(b6Entry.rows[0].document_id, null, "documentless — a chat basis is not a document and none is invented");
    console.log(`[work-e2e] PASS 7: a real chatTurn_v18 turn admitted clara_interpreted Work and the reconciler ran it to a posted entry in ${b6LatencyMs}ms`);

    // ---- 6. the chat-origin dispatch latency (measured) --------------------
    // chatTurn_v18's frozen tool CANNOT enqueue (freeze-lint forbids a frozen file importing the
    // registry), so a chat-admitted Work is dispatched by the reconciler alone. Admit through the
    // verb with NO post-commit start and time the pickup.
    const chatOrigin = await seedClient("we-latency");
    const chatIntent = randomUUID();
    const startedAt = Date.now();
    const chatAdmit = await rig.asRuntime((c) =>
      c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,'clara_interpreted',$5::jsonb,$6::text) as r", [
        chatOrigin.client,
        chatOrigin.owner,
        chatIntent,
        JSON.stringify({
          posting_date: "2026-09-01",
          memo: "office rent — chat origin",
          currency: "MYR",
          lines: [
            { account_code: "6100", debit_cents: 90000, credit_cents: 0, description: null },
            { account_code: "1100", debit_cents: 0, credit_cents: 90000, description: null },
          ],
        }),
        JSON.stringify([{ kind: "chat_task", task_id: null, session_id: null }]),
        rig.DEFAULT_MODEL,
      ]),
    );
    const chatWorkId = chatAdmit.rows[0].r.work_id;
    const chatDone = await pollWork(chatWorkId, chatOrigin.jwt, (b) => TERMINAL.has(b.work.status), "chat-origin work settles", 90000);
    const latencyMs = Date.now() - startedAt;
    assert.equal(chatDone.work.status, "completed", `the reconciler-dispatched Work completes (got ${chatDone.work.status})`);
    assert.equal(await countEntries(chatOrigin.client), 1);
    console.log(`[work-e2e] PASS 6: a Work admitted with NO post-commit enqueue was dispatched by the reconciler and completed in ${latencyMs}ms`);

    // ---- 4. a run that produced nothing, then Retry ------------------------
    const nothing = await seedClient("we-noeffect");
    const nothingIntent = randomUUID();
    const nothingAdmit = await api(
      "POST",
      "/api/work/journal",
      { clientId: nothing.client, intentKey: nothingIntent, basis: basisFor("office rent — narrate only") },
      nothing.jwt,
    );
    assert.equal(nothingAdmit.status, 202);
    // The engine that will run it must be the NARRATE script; swap engines around this one Work.
    first.child.kill("SIGKILL");
    await waitExit(first.child);
    const narrator = spawnServe({ CLARA_WORK_TEST_SCRIPT: "narrate" });
    let retriedWorkId = nothingAdmit.body.work_id;
    try {
      await waitReady();
      const failed = await pollWork(retriedWorkId, nothing.jwt, (b) => TERMINAL.has(b.work.status), "narrate-only work settles", 90000);
      assert.equal(failed.work.status, "failed", `a run that produced nothing is FAILED, not completed (got ${failed.work.status})`);
      assert.equal(failed.work.error?.code, "no_effect");
      assert.equal(failed.work.error?.recoverable, true, "and it stays recoverable");
      assert.equal(await countEntries(nothing.client), 0, "nothing was posted");
    } finally {
      if (!narrator.state.exited) narrator.child.kill("SIGKILL");
      await waitExit(narrator.child).catch(() => {});
    }

    const poster = spawnServe();
    try {
      await waitReady();
      const opKey = `retry_${randomUUID()}`;
      const retry = await api("POST", `/api/work/${retriedWorkId}/retry`, { opKey }, nothing.jwt);
      assert.equal(retry.status, 202, `retry 202 (got ${retry.status} ${JSON.stringify(retry.body)})`);
      assert.equal(retry.body.work_id, retriedWorkId, "the SAME Work");
      assert.equal(retry.body.logical_op_id, `work:${retriedWorkId}:journal_entry:1`, "and the SAME logical operation identity (C-62)");

      const retried = await pollWork(retriedWorkId, nothing.jwt, (b) => b.work.status === "completed", "retried work completes", 90000);
      assert.ok(retried.work.result?.entry_id);
      assert.equal(await countEntries(nothing.client), 1, "the retry posted exactly ONE entry");
      assert.equal(await countReceipts(retriedWorkId), 1, "under the SAME logical identity, ONE committed receipt");
      const runs = await tasksFor(retriedWorkId);
      assert.equal(runs.length, 2, "two runs, one Work, one identity");
      console.log("[work-e2e] PASS 4: a no-effect run settles failed/recoverable; Retry makes a NEW run for the SAME identity and commits");
    } finally {
      if (!poster.state.exited) poster.child.kill("SIGKILL");
      await waitExit(poster.child).catch(() => {});
    }
  } finally {
    if (!first.state.exited) first.child.kill("SIGKILL");
    await waitExit(first.child).catch(() => {});
  }

  // =========================================================================
  // 5. crash AFTER the database commit, BEFORE the workflow checkpoint.
  // =========================================================================
  {
    const crash = await seedClient("we-crash");
    const faulty = spawnServe({ CLARA_WORK_TEST_FAULT: "exit_after_commit" });
    let workId = null;
    try {
      await waitReady();
      const admit = await api(
        "POST",
        "/api/work/journal",
        { clientId: crash.client, intentKey: randomUUID(), basis: basisFor("office rent — crash window") },
        crash.jwt,
      );
      assert.equal(admit.status, 202);
      workId = admit.body.work_id;
      // The tool calls process.exit(137) the instant the commit returns. The engine dies with the
      // entry ON DISK and the step NOT checkpointed — the window nothing else can produce.
      await waitExit(faulty.child, 90000);
      assert.notEqual(faulty.state.exitInfo?.code, 0, `the engine died mid-run (exit ${JSON.stringify(faulty.state.exitInfo)})`);
    } finally {
      if (!faulty.state.exited) faulty.child.kill("SIGKILL");
      await waitExit(faulty.child).catch(() => {});
    }

    assert.equal(await countEntries(crash.client), 1, "the entry survived the crash — it was COMMITTED before the process died");
    const midWork = await readWork(workId);
    assert.notEqual(midWork.status, "completed", "and the Work is NOT yet completed — the run never checkpointed");

    await sleep(500);
    const respawned = spawnServe();
    try {
      await waitReady();
      const settled = await pollWork(workId, crash.jwt, (b) => TERMINAL.has(b.work.status), "crashed work resumes and settles", 120000);
      assert.equal(settled.work.status, "completed", `the resumed run settles completed (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
      assert.equal(settled.work.result?.replayed, true, "the re-executed step's tool call REPLAYED onto the original receipt");
      assert.equal(await countEntries(crash.client), 1, "EXACTLY ONE journal entry across the crash");
      assert.equal(await countReceipts(workId), 1, "EXACTLY ONE committed operation receipt across the crash");
      console.log("[work-e2e] PASS 5: crash after commit / before checkpoint -> resume -> replayed receipt, one entry, one receipt");
    } finally {
      if (!respawned.state.exited) respawned.child.kill("SIGKILL");
      await waitExit(respawned.child).catch(() => {});
    }
  }

  console.log("\nWORK JOURNAL E2E: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nWORK JOURNAL E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
