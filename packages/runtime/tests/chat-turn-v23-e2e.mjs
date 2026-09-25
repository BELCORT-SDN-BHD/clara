// STANDALONE chatTurn_v23 + claraWork_v7 e2e — THE CLOSING CUT'S OWN CHAT WALK AND WORK WALK.
//
// NOT a `node --test` file: it SPAWNS scripts/serve.mjs (through tests/chat-turn-v23-serve.mjs,
// which installs the scripted model first) as a CHILD process, so the real Workflow World, the real
// HTTP boundary, the real pools and the real frozen bodies are all in the loop — the pattern
// tests/chat-turn-v19-e2e.mjs, v20's, v21's and v22's established. Run:
//
//   PGHOST=127.0.0.1 PGPORT=55710 PGUSER=postgres PGDATABASE=clara_wave_b_ci \
//   RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55710/clara_wave_b_ci \
//   node tests/chat-turn-v23-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real World plus a real HTTP boundary:
//
//   1. THE SEVEN DEFERRED TOOLS ARE REACHABLE FROM A REAL TURN. v22's roster cell asserts they are
//      absent "and that is a ruling"; the reason was that every door behind them was
//      `clara_authenticated`-only, so a tool over one could only ever answer a grant refusal. This
//      leg drives two of them through the pooled `clara_agent_ro` credential `readScoped` mints and
//      shows the DOORS ANSWERING — which is the claim the ruling turned on, and the one no unit
//      cell can make.
//        a. `read_tenancy_terms` against a document this firm does not hold: the wake door's own
//           CLR11 reaches the tool and becomes `not_found`. A grant refusal (CLR03) would look
//           different, and that difference is the whole measurement.
//        b. `read_rent_settlement_candidates` against this leg's REAL client: the door answers, no
//           month is waiting, and the tool returns its empty sentence rather than a refusal.
//   2. THE IDENTIFIERS REACH THE MODEL THROUGH THE PROMPT (v21's ADV-S-1, designed out rather than
//      discovered). The document and the client are parsed out of the PERSON'S OWN MESSAGE by the
//      serve child; nothing in this leg's environment carries either id, so a tool whose only
//      identifier never reached the model could not appear to work.
//   3. THE WORK WALK: claraWork_v7 SERVES THESE RUNS. A chat turn admits a trade-invoice Work; the
//      run posts; and the COMMITTED RECEIPT carries v7's bundle digest — the same digest the boot
//      banner logged, read off the registry's own pin rather than retyped. A run whose receipt
//      named a contract it was not served under would be visible here rather than in a hosted
//      incident.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent shared with its siblings), and
// the file SKIPS CLEANLY when 0225, 0352 or 0353 is absent — this cut wires all three halves, and a
// green e2e against a database missing any of them would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";
import { pinnedClaraWorkBannerRe, pinnedClaraWorkBundleId } from "./pinned-work-bundle.mjs";
import { DB_NAME_SHAPE, allowedDbPattern, assertLocalDbGate } from "./local-db-gate.mjs";

// THE SERVING claraWork BUNDLE, READ FROM THE REGISTRY'S OWN PIN — never retyped in this file. The
// pin has moved v1 -> v2 -> v3 -> v4 -> v5 -> v6 -> v7 (this cut), and startWorld logs one banner
// per RETAINED body, so a version literal here would match a banner no run is served by and compare
// a digest no run can record.
const WORK_BUNDLE_ID = pinnedClaraWorkBundleId();
const WORK_BUNDLE_BANNER_RE = pinnedClaraWorkBannerRe();

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[v23-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

assertLocalDbGate({
  label: "chat-turn-v23-e2e",
  pattern: allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}`),
  checkDsnString: true,
  checkDsnParsed: true,
});

const PORT = process.env.V23_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-v23-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "v23-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./chat-turn-v23-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;
/** The child's own probe lines, spelled here too — the two files cannot import each other (the
 *  bootstrap boots a server on import), so the literals are duplicated and asserted in both. */
const TENANCY_LINE = "[v23-serve] THE TENANCY READ ANSWERED";
const RENT_LINE = "[v23-serve] THE RENT CANDIDATE READ ANSWERED";

const WATCHDOG_MS = 14 * 60 * 1000;
setTimeout(() => {
  console.error(`\nCHAT TURN V23 E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  const state = { exited: false, banner: null, serving: null, tenancy: null, rent: null, stdout: "", stderr: "" };
  child.on("exit", () => {
    state.exited = true;
  });
  // LINE-BUFFERED, never per chunk — the wave-2 CI boot race's second half: several console.log
  // calls arrive in one event and one line can arrive split across two, so a banner cut by a chunk
  // boundary reads as never logged.
  const ingest = (line) => {
    const m = WORK_BUNDLE_BANNER_RE.exec(line);
    if (m && !state.banner) state.banner = m[1];
    if (!state.serving) {
      const serving = /\[clara-runtime\] serving .*/.exec(line);
      if (serving) state.serving = serving[0];
    }
    for (const [marker, field] of [[TENANCY_LINE, "tenancy"], [RENT_LINE, "rent"]]) {
      if (!line.includes(marker)) continue;
      const payload = line.slice(line.indexOf(marker) + marker.length).trim();
      try {
        state[field] = JSON.parse(payload);
      } catch {
        state[field] = { unparsed: payload };
      }
      process.stdout.write(`[child] ${line}\n`);
    }
    // AND EVERY OTHER LINE THIS LEG'S OWN SCRIPT WRITES. The two above are what the parent ASSERTS
    // on; these are what a human reads when one of them never arrives.
    if (line.startsWith("[v23-serve]")) process.stdout.write(`[child] ${line}\n`);
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

/** The engine's OWN boot, on top of `/ready` — the wave-2 CI boot race. `/ready`'s world conjunct is
 *  an estate-wide heartbeat row, so a predecessor that stopped seconds ago satisfies it. */
async function waitBooted(engine, deadlineMs = 40000) {
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
    + `\n--- child stdout (tail) ---\n${engine.state.stdout || "(none)"}`
    + `\n--- child stderr (tail) ---\n${engine.state.stderr || "(none)"}`,
  );
}

async function waitReady(deadlineMs = 60000, engine = null) {
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
  try {
    parsed = await r.json();
  } catch {
    /* non-JSON */
  }
  return { status: r.status, body: parsed };
}

const EXPENSE = "6300";
const PAYABLE = "2000";
const TOTAL_CENTS = 106000;

function invoiceInput(counterpartyId) {
  return {
    kind: "supplier_bill",
    counterparty: { id: counterpartyId },
    document_date: "2026-03-04",
    due_date: "2026-04-15",
    due_date_source: "stated",
    reference: `V23-${randomUUID().slice(0, 8)}`,
    currency: "MYR",
    total_cents: TOTAL_CENTS,
    tax_facts: { stated_code: "SR", stated_cents: 6000 },
    posting_date: "2026-03-31",
    memo: "#1144 e2e: a bill, so claraWork_v7 has a run to serve",
    lines: [
      { account_code: EXPENSE, description: "office supplies", debit_cents: TOTAL_CENTS, credit_cents: 0 },
      { account_code: PAYABLE, description: "payable", debit_cents: 0, credit_cents: TOTAL_CENTS },
    ],
    document_id: null,
    basis_origin: "clara_interpreted",
  };
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regprocedure('clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)') is not null as admit,
           to_regprocedure('clara.wake_list_review_queue(jsonb,jsonb,integer)') is not null as queue,
           to_regprocedure('clara.wake_get_payroll_settlement_candidates(uuid)') is not null as payroll,
           to_regprocedure('clara.wake_get_contract_terms(uuid)') is not null as terms,
           to_regprocedure('clara.wake_get_rent_settlement_candidates(uuid)') is not null as rent,
           to_regprocedure('clara.confirm_tenancy_rent_plan_for(uuid,uuid,uuid,text,text,text,text)') is not null as confirm
  `);
  const p = probe.rows[0] ?? {};
  if (!p.admit) {
    console.log("[v23-e2e] SKIPPED — migration 0225 (clara.admit_trade_invoice_work) is not on this database");
    process.exit(0);
  }
  if (!p.queue || !p.payroll) {
    console.log("[v23-e2e] SKIPPED — migration 0352 (the payroll and agreement agent read twins) is not on this database");
    process.exit(0);
  }
  if (!p.terms || !p.rent || !p.confirm) {
    console.log("[v23-e2e] SKIPPED — migration 0353 (the tenancy agent twins and the OBO confirmations) is not on this database");
    process.exit(0);
  }

  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type, cls] of [
      [EXPENSE, "Office Supplies", "expense", null],
      [PAYABLE, "Trade Payables Control", "liability", "payable"],
    ]) {
      const args = cls === null
        ? ["select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
          [client, code, name, type, rig.opk("acct")]]
        : ["select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_account_class=>$5,p_op_key=>$6) as r",
          [client, code, name, type, cls, rig.opk("acct")]];
      await rig.humanQuery(owner, args[0], args[1]);
    }
    const cp = await rig.humanQuery(owner,
      "select clara.create_counterparty(p_client=>$1,p_kind=>'vendor',p_name=>$2,p_registration_no=>null,p_tin=>null,p_op_key=>$3) as r",
      [client, `Beta Supplies ${randomUUID().slice(0, 8)}`, rig.opk("cp")]);
    const answer = cp.rows[0].r;
    const counterparty = typeof answer === "string" ? answer : (answer.counterparty_id ?? answer.id);
    assert.ok(counterparty, `create_counterparty named its row (got ${JSON.stringify(answer)})`);
    return { owner, firm, client, counterparty, jwt: await mint(owner) };
  }

  const one = await seedClient("v23-chat");

  // ONE ACT PER TURN, AND THE TURN'S OWN WORDS ARE WHAT SELECT IT. The cues carry no identifier:
  // every id this leg's tools receive is parsed by the child out of the PERSON'S message (v21's
  // ADV-S-1), which is why they are interpolated into the turn text below and into nothing else.
  const INVOICE_CUE = "Beta Supplies";
  const TENANCY_CUE = "what does that tenancy say";
  const RENT_CUE = "which months of rent are still open";

  const engine = spawnServe({
    CLARA_V23_INVOICE: JSON.stringify(invoiceInput(one.counterparty)),
    CLARA_V23_INVOICE_CUE: INVOICE_CUE,
    CLARA_V23_TENANCY_CUE: TENANCY_CUE,
    CLARA_V23_RENT_CUE: RENT_CUE,
    CLARA_V23_CLIENT_ID: one.client,
  });
  try {
    const startedAt = Date.now();
    await waitReady(60000, engine);
    assert.ok(engine.state.banner, "the world-start banner names the serving bundle digest");
    assert.match(engine.state.serving ?? "", /chatTurn=chatTurn_v23/, "the engine serves THIS cut's chat body");
    assert.match(engine.state.serving ?? "", /claraWork=claraWork_v7/, "…and THIS cut's Work body");
    console.log(`[v23-e2e] engine ready; serving bundle=${WORK_BUNDLE_ID} digest=${engine.state.banner}`);

    const build = await api("GET", "/api/build-info", undefined, one.jwt);
    assert.equal(build.status, 200, "build-info answers a signed-in caller");
    assert.equal(build.body?.pins?.chatTurn, "chatTurn_v23", "/api/build-info names the chat pin");
    assert.equal(build.body?.pins?.claraWork, "claraWork_v7", "…and the Work pin");
    assert.equal(build.body?.bundles?.[0]?.id, WORK_BUNDLE_ID, "…newest bundle first, and it is the pinned one");
    assert.equal(build.body?.bundles?.[0]?.digest, engine.state.banner,
      "…carrying the SAME digest the boot banner logged — one identity, two surfaces");

    async function newSession(title) {
      const r = await api("POST", "/api/chat/sessions", { clientId: one.client, title }, one.jwt);
      assert.equal(r.status, 201, `session created (got ${r.status} ${JSON.stringify(r.body)})`);
      const id = r.body.id ?? r.body.session_id;
      assert.ok(id, `the session id comes back (${JSON.stringify(r.body)})`);
      return id;
    }

    async function turnIn(sessionId, text) {
      const r = await api("POST", `/api/chat/${sessionId}/turns`,
        { turnKey: `tk_${randomUUID().slice(0, 12)}`, parts: [{ type: "text", text }] }, one.jwt);
      assert.equal(r.status, 202, `the turn is accepted (got ${r.status} ${JSON.stringify(r.body)})`);
      assert.ok(r.body.task_id, "and it names the chat task");
      return r.body.task_id;
    }

    async function turn(text, title) {
      return turnIn(await newSession(title), text);
    }

    const TASK_TERMINAL = new Set(["completed", "failed", "cancelled", "refused", "expired"]);
    async function settleTask(taskId, deadlineMs = 150000) {
      const end = Date.now() + deadlineMs;
      let last = null;
      while (Date.now() < end) {
        const row = await rig.readTask(taskId);
        last = row?.status ?? null;
        if (last !== null && TASK_TERMINAL.has(last)) return last;
        await sleep(250);
      }
      throw new Error(`the chat turn never settled (task ${taskId}); last status=${last}`);
    }

    async function waitProbe(field, label, deadlineMs = 60000) {
      const end = Date.now() + deadlineMs;
      while (Date.now() < end) {
        if (engine.state[field] !== null) return engine.state[field];
        await sleep(200);
      }
      throw new Error(`the serve child never reported ${label}`
        + `\n--- child stdout (tail) ---\n${engine.state.stdout || "(none)"}`);
    }

    // ---- 1. read_tenancy_terms — the DOOR answers, and its CLR11 becomes `not_found` ---------
    //
    // THE DOCUMENT IS ONE THIS FIRM DOES NOT HOLD, deliberately: `clara.wake_get_contract_terms`
    // refuses it with 0300's own CLR11 ("document % is not a live filing in your firm"), which is
    // the SAME answer another firm's real tenancy gets — the tenant wall, reached rather than
    // described. What this leg measures is that the refusal arriving at the model is the DOOR's and
    // not a grant refusal: CLR03 would mean the credential could not reach the door at all, which
    // is exactly the state that made v22 defer this tool.
    const strangerDocument = randomUUID();
    const tenancyTask = await turn(
      `I have an agreement filed as ${strangerDocument} — ${TENANCY_CUE}?`,
      "v23-tenancy",
    );
    const tenancy = await waitProbe("tenancy", "the tenancy read");
    assert.ok(TASK_TERMINAL.has(await settleTask(tenancyTask)), "the tenancy turn settled");
    assert.equal(tenancy.ok, false, "a document this firm does not hold is refused");
    assert.equal(tenancy.code, "CLR11",
      "…by the DOOR's own tenant wall, not by a grant refusal — CLR03 here would mean the "
      + "credential never reached the door, which is the state this cut exists to end");
    assert.equal(tenancy.reason, "not_found");
    assert.equal(tenancy.message, "I cannot find that agreement under your firm.",
      "…and the sentence is #1137's own, which another firm's real tenancy answers identically");
    console.log("[v23-e2e] PASS 1: read_tenancy_terms reached 0353's wake door and carried its CLR11 verbatim");

    // ---- 2. read_rent_settlement_candidates — the door answers for a REAL client --------------
    //
    // AND THE ANSWER IS NOT A REFUSAL, which is the other half of the measurement: the first leg
    // shows the wall holding, this one shows the door OPENING for a client the credential does
    // hold. No month of rent is waiting on this freshly-seeded client, so the tool returns its
    // empty sentence — the panel's own words, not a refusal dressed as an answer.
    const rentTask = await turn(
      `For client ${one.client} — ${RENT_CUE}?`,
      "v23-rent",
    );
    const rent = await waitProbe("rent", "the rent candidate read");
    assert.ok(TASK_TERMINAL.has(await settleTask(rentTask)), "the rent turn settled");
    assert.equal(rent.ok, true, "the door ANSWERED for a client this credential holds");
    assert.equal(rent.status, "read");
    assert.equal(rent.months, 0, "no month of rent is waiting on a client with no tenancy");
    assert.equal(rent.deposits, 0, "…and no deposit is offered either");
    assert.equal(rent.empty_sentence, "No month of rent is waiting on its payment.",
      "…so the tool says so in the panel's own words rather than refusing");
    console.log("[v23-e2e] PASS 2: read_rent_settlement_candidates reached both 0353 doors on a real client");

    // ---- 3. THE WORK WALK — claraWork_v7 serves the run, and the RECEIPT says so --------------
    const invoiceTask = await turn(
      `Record ${INVOICE_CUE}' March bill for RM1,060 including SST.`,
      "v23-invoice",
    );
    assert.ok(TASK_TERMINAL.has(await settleTask(invoiceTask)), "the recording turn settled");

    async function waitInvoice(deadlineMs = 150000) {
      const end = Date.now() + deadlineMs;
      let rows = [];
      while (Date.now() < end) {
        const r = await rig.rootQuery(
          "select * from clara.trade_invoices where client_id = $1 order by created_at", [one.client]);
        rows = r.rows;
        if (rows.length >= 1) return rows[0];
        await sleep(250);
      }
      throw new Error(`the chat turn admitted no trade invoice; saw ${rows.length}`);
    }
    const invoice = await waitInvoice();
    assert.equal(Number(invoice.total_cents), TOTAL_CENTS, "the stated total, in exact cents");

    async function waitReceipt(workId, deadlineMs = 180000) {
      const end = Date.now() + deadlineMs;
      let rows = [];
      while (Date.now() < end) {
        const r = await rig.rootQuery(
          "select * from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [workId]);
        rows = r.rows;
        if (rows.length >= 1) return rows[0];
        await sleep(500);
      }
      throw new Error(`the Work never committed a receipt (work ${workId}); saw ${rows.length}`);
    }
    const receipt = await waitReceipt(invoice.work_id);
    assert.equal(String(receipt.bundle_digest), String(engine.state.banner),
      "the COMMITTED receipt carries the digest the boot banner logged — a run whose receipt named "
      + "a contract it was not served under would be visible here rather than in a hosted incident");

    const work = await rig.rootQuery(
      "select bundle from clara.accounting_work where id = $1", [invoice.work_id]);
    assert.equal(String(work.rows[0]?.bundle?.id), WORK_BUNDLE_ID, "the Work row names the pinned bundle");
    assert.equal(String(work.rows[0]?.bundle?.digest), String(engine.state.banner), "…with the same digest");

    const traces = await rig.rootQuery(
      "select distinct bundle_id from clara.work_execution_traces where task_id = $1", [invoice.work_id]);
    for (const row of traces.rows) {
      assert.equal(String(row.bundle_id), WORK_BUNDLE_ID, "every trace row this run wrote names the pinned bundle");
    }
    console.log(`[v23-e2e] PASS 3: one chat turn admitted a Work, claraWork_v7 served it, and the receipt names ${WORK_BUNDLE_ID}`);

    console.log(`\nCHAT TURN V23 E2E: ALL PASS (${Date.now() - startedAt}ms)`);
  } finally {
    engine.child.kill("SIGTERM");
    await sleep(500);
    if (!engine.state.exited) engine.child.kill("SIGKILL");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nCHAT TURN V23 E2E: FAILED\n", err);
    process.exit(1);
  },
);
