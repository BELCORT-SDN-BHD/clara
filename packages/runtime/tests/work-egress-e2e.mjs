// STANDALONE work-egress e2e (#631, seam 4). NOT a `node --test` file: it SPAWNS scripts/serve.mjs
// (through tests/work-journal-serve.mjs, which installs the scripted model first) as a CHILD
// process, so the whole run — HTTP admission, the durable World, the frozen claraWork body the
// REGISTRY pins, the egress dispatch and the posting core — is exercised the way the production
// image runs it.
// Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   node tests/work-egress-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real Postgres World plus a real HTTP boundary:
//
//   A. AN AUTHORISED RUN. One admitted Work becomes one approved entry, one committed receipt AND
//      a complete execution trace — `dispatch → model_call → tool_call → settle`, in that order,
//      on ONE run id — with the `accounting_work` authorisation consumed EXACTLY ONCE. The trace
//      is read back through the HUMAN door (`clara.get_work_execution_trace`), because a
//      diagnostic nobody can read is not a diagnostic.
//
//   B. A WITHDRAWAL. The firm's owner revokes the client's `accounting_work` purpose through the
//      door that already exists. The next run's PREPARE refuses, the model is NEVER CALLED (the
//      scripted model counts its own invocations and the trace's `model_call` row is absent), the
//      Work settles `refused` with `egress_not_authorized`, NO entry and NO committed receipt
//      exist, and the refusal message names NO PROVIDER. A Retry mints a NEW run that refuses
//      again at the same place — which is what "typed non-retryable Work state" means when the
//      thing that changed is the firm's authority rather than the figures.
//
//   C. THE LEAK PROBE, widened. `world-e2e.mjs:224-239`'s idiom — a regex scan over the durable
//      surfaces a run writes — now also scans `clara.work_execution_traces`, with the PII set the
//      redaction battery plants: NRIC, bank account, email, Malaysian phone, JWT, api key, DSN.
//      The basis carries them; the trace must not.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent this lane shares), and the
// file SKIPS CLEANLY when migration 0195 is absent — its runtime half merges alongside its DB
// half, and a green e2e against a database with no `clara.work_execution_traces` would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";
import { pinnedClaraWorkBannerRe, pinnedClaraWorkBundleId } from "./pinned-work-bundle.mjs";

// THE SERVING claraWork BUNDLE, READ FROM THE REGISTRY'S OWN PIN — never retyped in this file. The
// pin has moved v1 -> v2 (#629), v2 -> v3 (#631) and v3 -> v4 (the wave 2026-09-15 successor cut),
// and startWorld logs one banner per RETAINED body, so a version literal here does not fail loudly
// when the pin moves past it: it matches a banner no run is served by, and compares a digest no run
// can record. tests/pinned-work-bundle.mjs reads the pin and checks it against that body's own
// bundle module.
const WORK_BUNDLE_ID = pinnedClaraWorkBundleId();
const WORK_BUNDLE_BANNER_RE = pinnedClaraWorkBannerRe();

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[egress-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate. BYTE-IDENTICAL to `work-journal-e2e.mjs`'s, deliberately.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("work-egress-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("work-egress-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}
{
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("work-egress-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.EGRESS_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-egress-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "eg-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./work-journal-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 10 * 60 * 1000;
setTimeout(() => {
  console.error(`\nWORK EGRESS E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  const state = { exited: false, banner: null, serving: null, stdout: "", stderr: "" };
  child.on("exit", () => { state.exited = true; });
  // LINE-BUFFERED, never per chunk — see waitBooted's header for why.
  const ingest = (line) => {
    // The SERVING bundle is v3's (#631 repointed claraWork v2 -> v3). v1 and v2 still print for the
    // parked-run census; this captures the one the image dispatches, which is the digest the Work
    // row, the receipt and every trace row record.
    const m = WORK_BUNDLE_BANNER_RE.exec(line);
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
    if (/FATAL|Error:/.test(d)) process.stderr.write(`[child] ${d}`);
  });
  return { child, state };
}

/**
 * THE ENGINE'S OWN BOOT, on top of `/ready` — the wave-2 CI boot race, applied here too.
 *
 * `/ready`'s world and control conjuncts are HEARTBEAT ROWS, and `clara.runtime_heartbeats` carries
 * one row per component for the WHOLE ESTATE inside a 30s staleness window (lib/health.mjs), so an
 * engine spawned onto a database a sibling leg was beating into answers 200 on the PREDECESSOR's
 * beats. In `db-live-gates` every Wave-B leg shares one database and they run back to back, which
 * is exactly that condition. Measured red-first in reports/wave2-ci-boot-race.md: an unfixed
 * `/ready` returned 200 in 1124ms while the banner had never been logged.
 *
 * A per-CHUNK regex has the second half of the same defect: several console.log calls arrive in one
 * event and one line can arrive split across two, so a banner cut by a chunk boundary reads as never
 * logged. stdout is line-buffered below for that reason.
 *
 * WAITING IS NOT WEAKENING: every fact asserted about the engine before is still asserted — only
 * after the process could actually have logged it. An engine whose world never starts still fails
 * this wait, bounded, with its own stdout/stderr attached.
 */
async function waitBooted(engine, deadlineMs = 30000) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    if (engine.state.serving && engine.state.banner) return;
    if (engine.state.exited) break;
    await sleep(100);
  }
  throw new Error(
    `engine answered /ready but never finished its OWN boot within ${deadlineMs}ms`
    + ` (/ready's world check is an estate-wide heartbeat — a predecessor stopped seconds ago satisfies it)`
    + `\n  provenance line: ${engine.state.serving ?? "(never logged)"}`
    + `\n  bundle banner:   ${engine.state.banner ?? "(never logged)"}`
    + `\n--- child stdout (tail) ---\n${engine.state.stdout || "(none)"}`
    + `\n--- child stderr (tail) ---\n${engine.state.stderr || "(none)"}`,
  );
}


async function waitReady(deadlineMs = 90000, engine = null) {
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
  try { parsed = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status, body: parsed };
}

// The PII the leak probe plants in the basis and hunts for in the trace. Assembled from pieces for
// the reason tests/work-trace-redaction.test.mjs gives: `scripts/check-leaks.mjs` scans committed
// source for credential-shaped literals and cannot tell a fixture from a real key.
const join = (...p) => p.join("");
const PLANTED = Object.freeze({
  nric: join("880214", "-08-", "5531"),
  bank: join("5141 ", "8822 ", "9310 ", "7742"),
  email: join("siti.rahmah", "@", "example.com.my"),
  phone: join("+60 ", "12-345 ", "6789"),
  jwt: join("ey", "JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", ".", "ey", "JzdWIiOiIxMjM0NSJ9", ".", "QWxpY2VJblRoZUxlZGdlcg"),
  apiKey: join("sk", "-proj-", "ZH4kQ9maRuntimeSecretValue1234"),
  dsn: join("postgres", "://", "clara", ":", "hunter2", "@db.internal:5432/books"),
});

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regclass('clara.work_execution_traces') is not null as tbl,
           to_regprocedure('clara.prepare_work_egress_dispatch(uuid,text)') is not null as prepare,
           to_regprocedure('clara.get_work_execution_trace(uuid)') is not null as reader
  `);
  if (!probe.rows[0]?.tbl || !probe.rows[0]?.prepare || !probe.rows[0]?.reader) {
    console.log("[egress-e2e] SKIPPED — migration 0195 (clara.work_execution_traces + the dispatch wrapper) is not on this database");
    process.exit(0);
  }

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countCommitted = (work) =>
    rig.rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  const traceRows = (work) =>
    rig.rootQuery("select * from clara.work_execution_traces where work_id = $1 order by run_id, seq", [work]).then((r) => r.rows);
  /** The settle ROW lands in its own statement, microseconds AFTER `clara.settle_work_run` commits
   *  — deliberately, because a trace write that could roll a settle back would be the diagnostic
   *  deciding the accounting (claraWork.v3.impl.ts states the rule). So a reader that polled the
   *  WORK to terminal can legitimately arrive before the row does; this waits for it rather than
   *  racing it, and fails loudly if it never comes. */
  async function traceWithPhase(work, phase, label, deadlineMs = 20000) {
    const end = Date.now() + deadlineMs;
    let rows = [];
    while (Date.now() < end) {
      rows = await traceRows(work);
      if (rows.some((r) => r.phase === phase)) return rows;
      await sleep(200);
    }
    throw new Error(`trace phase timeout (${label}: no ${phase} row); phases=${rows.map((r) => r.phase).join(" → ")}`);
  }
  const authorizations = (client) =>
    rig.rootQuery(
      "select id, consumed_at, invalidated_at, invalidated_reason, event_seq, event_type from clara.egress_dispatch_authorizations where client_id = $1 and purpose = 'accounting_work' order by issued_at",
      [client]).then((r) => r.rows);

  async function seedClient(label) {
    // `rig.buildFirm` accepts BOTH published legal texts as the owner — the derived activation
    // basis #631 assumes, and the state `clara.claim_paid_firm` actually leaves a real firm in.
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type] of [["6100", "Rent expense", "expense"], ["1100", "Maybank current account", "asset"]]) {
      await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
        [client, code, name, type, rig.opk("acct")]);
    }
    return { owner, firm, client, jwt: await mint(owner) };
  }

  const TERMINAL = new Set(["completed", "refused", "failed", "cancelled", "expired"]);
  async function pollWork(workId, jwt, pred, label, deadlineMs = 120000) {
    const end = Date.now() + deadlineMs;
    let last = null;
    while (Date.now() < end) {
      const r = await api("GET", `/api/work/${workId}`, undefined, jwt);
      last = r;
      if (r.status === 200 && pred(r.body)) return r.body;
      await sleep(250);
    }
    throw new Error(`pollWork timeout (${label}); last=${JSON.stringify(last).slice(0, 900)}`);
  }

  const basis = (memo) => ({
    postingDate: "2026-09-01",
    memo,
    currency: "MYR",
    lines: [
      { accountCode: "6100", debitCents: 120000, creditCents: 0, description: "office rent" },
      { accountCode: "1100", debitCents: 0, creditCents: 120000, description: "Maybank" },
    ],
  });

  const engine = spawnServe();
  try {
    await waitReady(90000, engine);
    assert.ok(engine.state.banner, "the world-start banner names the SERVING bundle digest");
    console.log(`[egress-e2e] engine ready; serving ${WORK_BUNDLE_ID} digest=${engine.state.banner}`);

    // =====================================================================
    // LEG A — an authorised run: one effect, one receipt, a complete trace.
    // =====================================================================
    const a = await seedClient("eg-ok");
    const admitA = await api("POST", "/api/work/journal", {
      clientId: a.client, intentKey: randomUUID(), basis: basis("office rent — egress e2e A"),
    }, a.jwt);
    assert.equal(admitA.status, 202, `A: admitted (got ${admitA.status} ${JSON.stringify(admitA.body)})`);
    const workA = admitA.body.work_id;
    const doneA = await pollWork(workA, a.jwt, (b) => TERMINAL.has(b.work?.status), "A settles");
    assert.equal(doneA.work.status, "completed", `A: the Work completes (got ${doneA.work.status} / ${JSON.stringify(doneA.work.error)})`);
    assert.equal(doneA.work.bundle?.id, WORK_BUNDLE_ID, "A: served by the bundle the registry pins");
    assert.equal(await countEntries(a.client), 1, "A: exactly ONE entry");
    assert.equal(await countCommitted(workA), 1, "A: exactly ONE committed receipt");

    // THE AUTHORISATION, SPENT EXACTLY ONCE.
    const authA = await authorizations(a.client);
    assert.equal(authA.length, 1, `A: one prepared authorisation (got ${authA.length})`);
    assert.ok(authA[0].consumed_at, "A: …and it was consumed");
    assert.equal(authA[0].invalidated_at, null, "A: …and never invalidated");
    assert.equal(authA[0].event_type, "work.segment");

    // THE TRACE, in order, on ONE run.
    const rowsA = await traceWithPhase(workA, "settle", "A");
    const runIds = new Set(rowsA.map((r) => r.run_id));
    assert.equal(runIds.size, 1, `A: one run id across the trace (got ${[...runIds].join(",")})`);
    const phases = rowsA.map((r) => r.phase);
    for (const want of ["dispatch", "model_call", "tool_call", "settle"]) {
      assert.ok(phases.includes(want), `A: the trace carries a ${want} row (got ${phases.join(" → ")})`);
    }
    assert.deepEqual(
      phases.filter((p) => p !== "dispatch"),
      ["model_call", "tool_call", "settle"],
      `A: the run's steps are traced IN ORDER (got ${phases.join(" → ")})`,
    );
    const modelRow = rowsA.find((r) => r.phase === "model_call");
    assert.equal(modelRow.outcome, "ok");
    assert.equal(modelRow.purpose, "accounting_work", "A: the model call records the purpose it spent");
    assert.equal(modelRow.authorization_id, authA[0].id, "A: …and the authorisation it spent");
    assert.ok(modelRow.consent_ref, "A: …with the consent the database derived, not one the runtime asserted");
    assert.ok(modelRow.activation_ref);
    assert.match(modelRow.input_digest, /^[0-9a-f]{64}$/, "A: the input is a DIGEST, never the input");
    assert.equal(modelRow.bundle_id, WORK_BUNDLE_ID);
    assert.equal(modelRow.bundle_digest, engine.state.banner, "A: the trace names the digest the process logged");
    assert.equal(modelRow.registry_version, "clara-capability-registry/v1");
    assert.equal(modelRow.capability_id, "accounting_work.model_segment");
    const toolRow = rowsA.find((r) => r.phase === "tool_call");
    assert.equal(toolRow.capability_id, "accounting_work.record_journal_entry");
    assert.equal(toolRow.receipt_id, doneA.work.result.receipt_id, "A: the tool row names the receipt it produced");
    const settleRow = rowsA.find((r) => r.phase === "settle");
    assert.equal(settleRow.outcome, "ok");

    // THE HUMAN DOOR. A diagnostic nobody can read is not a diagnostic.
    const read = await rig.asHuman(a.owner, (c) =>
      c.query("select clara.get_work_execution_trace($1::uuid) as r", [workA])).then((r) => r.rows[0].r);
    assert.equal(Array.isArray(read), true);
    assert.equal(read.length, rowsA.length, "A: the human read returns every row");
    assert.equal("payload" in read[0], false, "A: …and no payload, because the relation has none");
    console.log("[egress-e2e] PASS A: authorised run -> one entry, one receipt, dispatch→model_call→tool_call→settle, consumed once");

    // =====================================================================
    // LEG B — a withdrawal: refused before the model, and refused again on Retry.
    // =====================================================================
    const b = await seedClient("eg-revoked");
    // Mint the derived consent by preparing ONE dispatch, then withdraw it through the owner door.
    // (The pair is synthesised on first dispatch; there is nothing to revoke before that, which is
    // itself the point of "no per-client switch".)
    const warm = await rig.asRuntime((c) =>
      c.query("select clara.prepare_egress_dispatch($1::uuid,$2::uuid,'accounting_work',1::bigint,'work.segment',null) as v",
        [b.firm, b.client])).then((r) => r.rows[0].v);
    assert.equal(warm.verdict, "granted", "B: mandatory setup — the derived basis authorises before the withdrawal");
    await rig.humanQuery(b.owner,
      "select clara.revoke_client_egress_purpose(p_client=>$1,p_purpose=>$2,p_reason=>$3,p_op_key=>$4) as r",
      [b.client, "accounting_work", "#631 e2e: the firm withdrew model use for this client", rig.opk("eg-revoke")]);

    const admitB = await api("POST", "/api/work/journal", {
      clientId: b.client, intentKey: randomUUID(), basis: basis("office rent — egress e2e B"),
    }, b.jwt);
    assert.equal(admitB.status, 202, "B: ADMISSION still succeeds — the withdrawal is an EGRESS fact, not an admission one");
    const workB = admitB.body.work_id;
    const doneB = await pollWork(workB, b.jwt, (x) => TERMINAL.has(x.work?.status), "B settles");
    assert.equal(doneB.work.status, "refused", `B: the Work is REFUSED (got ${doneB.work.status})`);
    assert.equal(doneB.work.error?.reason, "egress_not_authorized", `B: …by name (got ${JSON.stringify(doneB.work.error)})`);
    assert.equal(await countEntries(b.client), 0, "B: no entry");
    assert.equal(await countCommitted(workB), 0, "B: no committed receipt");

    // NO PROVIDER DISCLOSURE. The acceptance line, asserted on the exact string a human reads.
    const face = JSON.stringify(doneB.work.error);
    for (const vendor of ["OpenAI", "Anthropic", "Azure", "Gemini", "gpt-", "claude-", "vendor"]) {
      assert.equal(face.includes(vendor), false, `B: the refusal names ${vendor}`);
    }
    assert.match(String(doneB.work.error.message), /Terms and Data Processing Agreement/,
      "B: it names the AGREEMENT, which is the thing an owner can act on");

    // THE MODEL WAS NEVER CALLED: the trace has a refused dispatch and NO model_call row.
    const rowsB = await traceWithPhase(workB, "settle", "B");
    const phasesB = rowsB.map((r) => r.phase);
    assert.ok(phasesB.includes("dispatch"), `B: the refused dispatch is RECORDED (got ${phasesB.join(" → ")})`);
    assert.equal(phasesB.includes("model_call"), false, "B: …and no model call was made at all");
    assert.equal(rowsB.find((r) => r.phase === "dispatch" && r.outcome === "refused") !== undefined, true,
      "B: the dispatch row says refused");

    // RETRY: a NEW run, refused at the same place, still with no model call.
    const retry = await api("POST", `/api/work/${workB}/retry`, { opKey: `eg-retry-${randomUUID()}` }, b.jwt);
    assert.ok([200, 202].includes(retry.status), `B: retry accepted (got ${retry.status} ${JSON.stringify(retry.body)})`);
    const doneB2 = await pollWork(workB, b.jwt,
      (x) => TERMINAL.has(x.work?.status) && x.work?.current_task_id !== doneB.work.current_task_id, "B retry settles");
    assert.equal(doneB2.work.status, "refused", "B: the retry is refused again");
    assert.equal(doneB2.work.error?.reason, "egress_not_authorized", "B: …at the same place, by the same name");
    assert.equal(await countEntries(b.client), 0, "B: still no entry after the retry");
    const rowsB2 = await traceWithPhase(workB, "settle", "B retry");
    assert.equal(rowsB2.some((r) => r.phase === "model_call"), false, "B: the retry called no model either");
    assert.ok(new Set(rowsB2.map((r) => r.run_id)).size >= 2, "B: …and it really was a NEW run");
    console.log("[egress-e2e] PASS B: withdrawal -> refused before the model, no effect, retry refuses identically, no provider named");

    // =====================================================================
    // LEG C — the leak probe, widened to clara.work_execution_traces.
    // =====================================================================
    const c = await seedClient("eg-leak");
    const poisoned = basis(`rent for ${PLANTED.email}; IC ${PLANTED.nric}; acct ${PLANTED.bank}; tel ${PLANTED.phone}`);
    poisoned.lines[0].description = `token ${PLANTED.jwt} key ${PLANTED.apiKey}`;
    poisoned.lines[1].description = `store ${PLANTED.dsn}`;
    const admitC = await api("POST", "/api/work/journal", {
      clientId: c.client, intentKey: randomUUID(), basis: poisoned,
    }, c.jwt);
    assert.equal(admitC.status, 202, `C: admitted (got ${admitC.status} ${JSON.stringify(admitC.body)})`);
    const workC = admitC.body.work_id;
    await pollWork(workC, c.jwt, (x) => TERMINAL.has(x.work?.status), "C settles");

    const traceText = await rig
      .rootQuery("select to_jsonb(t)::text as t from clara.work_execution_traces t where t.work_id = $1", [workC])
      .then((r) => r.rows.map((x) => x.t).join("\n"));
    assert.ok(traceText.length > 0, "C: there are trace rows to scan");
    for (const [name, literal] of Object.entries(PLANTED)) {
      assert.equal(traceText.includes(literal), false,
        `C: the planted ${name} reached clara.work_execution_traces`);
    }
    // THE CONTROL: the basis really did carry them, so the probe is not passing on an empty input.
    const admittedBasis = await rig
      .rootQuery("select basis::text as b from clara.accounting_work where id = $1", [workC])
      .then((r) => r.rows[0].b);
    assert.equal(admittedBasis.includes(PLANTED.nric), true,
      "C: mandatory control — the ADMITTED basis carries the planted NRIC (the Work row is the leak surface #631 records, not one it fixes)");
    console.log("[egress-e2e] PASS C: no planted identifier or secret reaches the execution trace");
  } finally {
    engine.child.kill("SIGKILL");
    await sleep(300);
    if (typeof rig?.endPool === "function") await rig.endPool().catch(() => {});
  }

  console.log("\nWORK EGRESS E2E: PASS (3 legs)");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nWORK EGRESS E2E: FAIL\n", err);
    process.exit(1);
  },
);
