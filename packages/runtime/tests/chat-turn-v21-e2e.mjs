// STANDALONE chatTurn_v21 + claraWork_v5 e2e. NOT a `node --test` file: it SPAWNS scripts/serve.mjs
// (through tests/chat-turn-v21-serve.mjs, which installs the scripted model first) as a CHILD
// process, so the real Workflow World, the real HTTP boundary, the real pools and the real frozen
// bodies are all in the loop — the pattern tests/work-journal-e2e.mjs, tests/chat-turn-v19-e2e.mjs
// and tests/chat-turn-v20-e2e.mjs established. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_wave_b_ci \
//   RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_wave_b_ci \
//   node tests/chat-turn-v21-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real World plus a real HTTP boundary:
//
//   1. THE CHAT ENTRANCE #655 LEFT OPEN, END TO END. One HTTP session, one HTTP turn, the frozen
//      chatTurn_v21 body, the frozen `start_trade_invoice_work` tool,
//      `clara.admit_trade_invoice_work` under `withRuntime`, and then the reconciler's
//      `accounting_work` arm — the ONLY thing that can dispatch a chat-admitted Work, because a
//      frozen file may not import the registry to call `start()`. The Work carries purpose
//      `journal_entry` with NO `WORK_ACCEPTED_PURPOSES` widening, `clara_interpreted`, and a
//      `chat_task` source ref naming the REAL task and session; one `clara.trade_invoices` row
//      lands beside it with the party the DOOR resolved, and the run posts one approved entry.
//
//   2. A REPLAYED CALL RE-RESERVES RATHER THAN ADMITTING A SECOND WORK. The scripted model calls
//      the admission tool TWICE inside ONE turn with a byte-identical payload, so the intent key —
//      `stableOpKey(taskId, tool, input)` — is the same both times and the door must answer the
//      ORIGINAL Work. The measurement is a count: two tool results in the transcript, and still one
//      `accounting_work` row, one `clara.trade_invoices` row, one committed receipt, one card. It
//      is the SAME turn deliberately: a second TURN carries a different task id, mints a different
//      key, and admits a second Work — correctly, because two turns are two requests. A unit cell
//      can prove the key is stable; only this leg can prove the door agrees.
//
//   3. THE CHAT ENTRANCE #651 LEFT OPEN, AND THE HONEST SHAPE OF ITS EMPTY ANSWER. The same turn
//      asks Clara to run depreciation for a client with no enrolled assets.
//      `clara.run_depreciation_period_for` is granted to `clara_runtime` ONLY, so reaching it at all
//      is the grant measured rather than assumed; it answers a typed receipt with `periods_run: 0`
//      and a `still_due` the register itself computed. "Nothing was due, and here is the register's
//      own reason" is a thing the estate can say, and this is the leg that proves it rather than
//      inventing a charge. NO card is minted for it — which is the C-19 measurement from the other
//      side: the transcript carries exactly ONE `work_accepted`, the invoice's.
//
//   4. #658's REPOINTED READ, IN BOTH LANES AND IN THE DURABLE ROW. The bounded knowledge block
//      reaches the CHAT prompt (v21's `loadClientBasisStepV21`) and the RUN prompt (v5's
//      `loadWorkKnowledgeStepV5`); the run leaves a `clara.work_knowledge_reads` row carrying the
//      keys it actually read at an estate face word; and the run's `read_knowledge_source` call
//      comes back with the record's own envelope. Any one alone would be weak — a read-set row
//      without the text is a read nobody used, text without the row is a read nobody can audit, and
//      a registered tool that returns nothing is not a capability.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent shared with its siblings), and
// the file SKIPS CLEANLY when migration 0225, 0227 or 0230 is absent — v21 wires all three halves,
// and a green e2e against a database missing any of them would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";
import { pinnedClaraWorkBannerRe, pinnedClaraWorkBundleId } from "./pinned-work-bundle.mjs";

// THE SERVING claraWork BUNDLE, READ FROM THE REGISTRY'S OWN PIN — never retyped in this file. The
// pin has moved v1 -> v2 (#629), v2 -> v3 (#631), v3 -> v4 (wave 2026-09-15) and v4 -> v5 (this
// cut), and startWorld logs one banner per RETAINED body, so a version literal here would match a
// banner no run is served by and compare a digest no run can record.
const WORK_BUNDLE_ID = pinnedClaraWorkBundleId();
const WORK_BUNDLE_BANNER_RE = pinnedClaraWorkBannerRe();

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[v21-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate. BYTE-IDENTICAL to `chat-turn-v20-e2e.mjs`'s, deliberately: this file
// spawns the same server against the same throwaway databases, and a gate that admitted one more
// name here would be a second, looser answer to one question.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("chat-turn-v21-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("chat-turn-v21-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}
{
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("chat-turn-v21-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.V21_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-v21-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "v21-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./chat-turn-v21-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;
/** The child's own probe lines, spelled here too — the two files cannot import each other (the
 *  bootstrap boots a server on import), so the literals are duplicated and asserted in both. */
const CHAT_KNOWLEDGE_LINE = "[v21-serve] KNOWLEDGE BLOCK REACHED THE CHAT PROMPT";
const RUN_KNOWLEDGE_LINE = "[v21-serve] KNOWLEDGE BLOCK REACHED THE RUN PROMPT";
const RECORD_READ_LINE = "[v21-serve] READ_KNOWLEDGE_SOURCE ANSWERED";
const BLOCK_NAMES_RECORD_LINE = "[v21-serve] THE BLOCK NAMES THE RECORD";

const WATCHDOG_MS = 12 * 60 * 1000;
setTimeout(() => {
  console.error(`\nCHAT TURN V21 E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  const state = {
    exited: false, banner: null, serving: null,
    chatKnowledge: false, runKnowledge: false, recordReads: new Map(), blockNamedRecord: null,
    stdout: "", stderr: "",
  };
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
    if (line.includes(CHAT_KNOWLEDGE_LINE)) state.chatKnowledge = true;
    if (line.includes(RUN_KNOWLEDGE_LINE)) state.runKnowledge = true;
    if (line.includes(BLOCK_NAMES_RECORD_LINE)) {
      state.blockNamedRecord = line.slice(line.indexOf(BLOCK_NAMES_RECORD_LINE) + BLOCK_NAMES_RECORD_LINE.length).trim();
      process.stdout.write(`[child] ${line}\n`);
    }
    if (line.includes(RECORD_READ_LINE)) {
      // KEYED BY RECORD, never "the first one seen". These databases are shared throwaways and an
      // engine's reconciler will dispatch an EARLIER run's Work; that run reads the same env-supplied
      // record id against a different firm and is correctly refused `record_not_in_scope`. Collecting
      // by id lets this leg assert about ITS OWN record and leaves the stranger's answer visible
      // rather than mistaken for it.
      const payload = line.slice(line.indexOf(RECORD_READ_LINE) + RECORD_READ_LINE.length).trim();
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        parsed = { unparsed: payload };
      }
      if (typeof parsed.record_id === "string") state.recordReads.set(parsed.record_id, parsed);
      process.stdout.write(`[child] ${line}\n`);
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

/** The engine's OWN boot, on top of `/ready` — the wave-2 CI boot race. `/ready`'s world conjunct is
 *  an estate-wide heartbeat row, so a predecessor that stopped seconds ago satisfies it. */
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
    + `\n--- child stdout (tail) ---\n${engine.state.stdout || "(none)"}`
    + `\n--- child stderr (tail) ---\n${engine.state.stderr || "(none)"}`,
  );
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
const SST = "6310";
const PAYABLE = "2000";
const BANK = "1150";
const TOTAL_CENTS = 106000;

/** The model's tool input, in the frozen schema's own snake_case. Written out rather than derived
 *  from `lib/trade-invoice-basis.ts`: this file is a CONTRACT test of the whole path, and a fixture
 *  sharing the carrier's builder could not tell a wrong derivation from a right one. The unit
 *  battery pins the builder; this pins what a model actually sends. */
function invoiceInput(counterpartyId) {
  return {
    kind: "supplier_bill",
    counterparty: { id: counterpartyId },
    document_date: "2026-03-04",
    due_date: "2026-04-15",
    due_date_source: "stated",
    reference: "ALPHA-2026-0042",
    currency: "MYR",
    total_cents: TOTAL_CENTS,
    tax_facts: { stated_code: "SR", stated_cents: 6000 },
    posting_date: "2026-03-31",
    memo: "Alpha Supplies bill, office paper and SST",
    lines: [
      { account_code: EXPENSE, description: "office supplies", debit_cents: 100000, credit_cents: 0 },
      { account_code: SST, description: "SST on purchases", debit_cents: 6000, credit_cents: 0 },
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
    select to_regclass('clara.trade_invoices') is not null as invoices,
           to_regprocedure('clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)') is not null as admit,
           to_regprocedure('clara.run_depreciation_period_for(uuid,date,text,uuid)') is not null as dep_door,
           to_regprocedure('clara.retrieve_knowledge(uuid,text,date,text[],integer,uuid)') is not null as retrieve,
           to_regprocedure('clara.read_knowledge_record_for(uuid,uuid,uuid)') is not null as read_record,
           to_regclass('clara.work_knowledge_reads') is not null as reads,
           to_regclass('clara.work_execution_traces') is not null as traces
  `);
  const p = probe.rows[0] ?? {};
  if (!p.invoices || !p.admit) {
    console.log("[v21-e2e] SKIPPED — migration 0225 (clara.trade_invoices + admit_trade_invoice_work) is not on this database");
    process.exit(0);
  }
  if (!p.dep_door) {
    console.log("[v21-e2e] SKIPPED — migration 0227 (clara.run_depreciation_period_for) is not on this database");
    process.exit(0);
  }
  if (!p.retrieve || !p.read_record || !p.reads) {
    console.log("[v21-e2e] SKIPPED — migration 0230 (retrieve_knowledge + read_knowledge_record_for + work_knowledge_reads) is not on this database");
    process.exit(0);
  }
  if (!p.traces) {
    console.log("[v21-e2e] SKIPPED — migration 0195 (work_execution_traces) is not on this database");
    process.exit(0);
  }

  const countReceipts = (work) =>
    rig
      .rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);

  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type, cls] of [
      [EXPENSE, "Office Supplies", "expense", null],
      [SST, "SST on Purchases", "expense", null],
      [BANK, "Maybank Current", "asset", null],
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
      [client, `Alpha Supplies ${randomUUID().slice(0, 8)}`, rig.opk("cp")]);
    const answer = cp.rows[0].r;
    const counterparty = typeof answer === "string" ? answer : (answer.counterparty_id ?? answer.id);
    assert.ok(counterparty, `create_counterparty named its row (got ${JSON.stringify(answer)})`);

    // ONE GOVERNED KNOWLEDGE RECORD, so both lanes have something real to read and the run has a
    // record to look up in full. Written through the HUMAN door, exactly as a bookkeeper would.
    const captured = await rig.humanQuery(owner,
      `select clara.capture_knowledge(p_knowledge_key => 'sst_regime', p_value => $1::jsonb,
         p_basis => $2, p_op_key => $3, p_scope_kind => 'client', p_client => $4) as r`,
      // `service_tax` is one of SST_REGIMES_V1's four admitted members (sales_tax / service_tax /
      // both / not_registered) — the catalog validates the VALUE, not just the key, and a fixture
      // that invented one is refused CLR10 `knowledge_value_invalid` before this leg ever boots.
      [JSON.stringify("service_tax"), "the client's SST certificate, filed 2026-01-04", rig.opk("kn"), client]);
    const knowledge = captured.rows[0].r ?? {};
    const recordId = knowledge.record_id ?? knowledge.record?.record_id ?? null;
    assert.ok(recordId, `capture_knowledge named its record (got ${JSON.stringify(knowledge)})`);
    console.log(`[v21-e2e] seeded knowledge record ${recordId} for client ${client} / firm ${firm}`);

    return { owner, firm, client, counterparty, recordId, jwt: await mint(owner) };
  }

  async function pollWork(workId, jwt, pred, label, deadlineMs = 120000) {
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

  // SEEDED BEFORE THE ENGINE, because the tool inputs have to be in the child's environment when it
  // starts: the scripted model reads them from env at module load.
  const one = await seedClient("v21-chat");

  const engine = spawnServe({
    CLARA_V21_INVOICE: JSON.stringify(invoiceInput(one.counterparty)),
    CLARA_V21_DEPRECIATION: JSON.stringify({ client_id: one.client, through: "2026-03-31" }),
    CLARA_V21_RECORD_ID: one.recordId,
    CLARA_V21_CLIENT_ID: one.client,
    CLARA_V21_ADMIT_TIMES: "2",
  });
  try {
    await waitReady(45000, engine);
    assert.ok(engine.state.banner, "the world-start banner names the serving bundle digest");
    console.log(`[v21-e2e] engine ready; serving bundle digest=${engine.state.banner}`);

    // ---- one real chatTurn_v21 turn, two acts ----------------------------
    const session = await api("POST", "/api/chat/sessions", { clientId: one.client, title: "v21" }, one.jwt);
    assert.equal(session.status, 201, `session created (got ${session.status} ${JSON.stringify(session.body)})`);
    const sessionId = session.body.id ?? session.body.session_id;
    assert.ok(sessionId, `the session id comes back (${JSON.stringify(session.body)})`);

    const startedAt = Date.now();
    const turn = await api(
      "POST",
      `/api/chat/${sessionId}/turns`,
      {
        turnKey: `tk_${randomUUID().slice(0, 12)}`,
        parts: [{
          type: "text",
          text: "Record Alpha Supplies' March bill for RM1,060 including SST, and clear whatever depreciation is due.",
        }],
      },
      one.jwt,
    );
    assert.equal(turn.status, 202, `the turn is accepted (got ${turn.status} ${JSON.stringify(turn.body)})`);
    const chatTaskId = turn.body.task_id;
    assert.ok(chatTaskId, "and it names the chat task");

    // ---- 1. the trade-invoice Work the frozen tool admitted ---------------
    let invoiceWork = null;
    while (Date.now() - startedAt < 120000) {
      const r = await rig.rootQuery(
        "select w.* from clara.accounting_work w join clara.trade_invoices t on t.work_id = w.id where w.client_id = $1",
        [one.client],
      );
      if (r.rows.length > 0) {
        invoiceWork = r.rows[0];
        break;
      }
      await sleep(250);
    }
    assert.ok(invoiceWork, "the chat turn admitted a Work through clara.admit_trade_invoice_work");
    assert.equal(invoiceWork.purpose, "journal_entry",
      "a trade invoice rides the EXISTING purpose — WORK_ACCEPTED_PURPOSES did not widen for it");
    assert.equal(invoiceWork.initiator, one.owner, "admitted for the HUMAN who was talking, not a service identity");
    assert.equal(invoiceWork.basis_origin, "clara_interpreted", "a chat-originated basis is labelled INTERPRETED, never user_direct");
    assert.equal(invoiceWork.source_refs.length, 1, "one source ref");
    assert.equal(invoiceWork.source_refs[0].kind, "chat_task");
    assert.equal(String(invoiceWork.source_refs[0].task_id), String(chatTaskId), "the ref points at the REAL chat task");
    assert.equal(String(invoiceWork.source_refs[0].session_id), String(sessionId), "read off the task, never from a model argument");

    const invoiceRows = await rig.rootQuery(
      "select *, due_date::text as due_text from clara.trade_invoices where client_id = $1", [one.client]);
    assert.equal(invoiceRows.rows.length, 1, "exactly ONE trade-invoice row");
    const invoice = invoiceRows.rows[0];
    assert.equal(invoice.kind, "supplier_bill");
    assert.equal(Number(invoice.total_cents), TOTAL_CENTS, "the stated total, in exact cents");
    assert.equal(String(invoice.counterparty_id), String(one.counterparty), "the party the DOOR resolved");
    assert.equal(invoice.due_text, "2026-04-15");
    assert.equal(invoice.due_date_source, "stated", "the tool claimed `stated` and the door agreed — it never claims the derivation");

    const done = await pollWork(invoiceWork.id, one.jwt, (b) => TERMINAL.has(b.work.status), "v21 invoice work settles", 120000);
    const latencyMs = Date.now() - startedAt;
    assert.equal(done.work.status, "completed",
      `the reconciler dispatched it and it completed (got ${done.work.status} / ${JSON.stringify(done.work.error)})`);
    assert.ok(done.work.result?.entry_id, "with a posted entry");
    assert.equal(await countReceipts(invoiceWork.id), 1, "and EXACTLY ONE committed operation receipt");

    const entry = await rig.rootQuery("select status from clara.journal_entries where id = $1", [done.work.result.entry_id]);
    assert.equal(entry.rows[0].status, "approved", "posted approved, not left as a draft");
    console.log(`[v21-e2e] PASS 1: a real chatTurn_v21 turn admitted a trade-invoice Work and claraWork_v5 ran it to a posted entry in ${latencyMs}ms`);

    // ---- 2. the depreciation door, reached and answering honestly --------
    // The register is empty, so nothing is due. What matters is that the tool REACHED a
    // `clara_runtime`-only door (a grant refusal would have been 42501) and that the receipt says
    // what happened rather than inventing a charge.
    const depAudit = await rig.rootQuery(
      "select args from clara.audit_log where fn = 'run_depreciation_period_for' and firm_id = $1 order by at desc limit 1",
      [one.firm]);
    assert.equal(depAudit.rows.length, 1,
      "the depreciation tool reached clara.run_depreciation_period_for — a grant refusal would have left no audit row at all");
    const depPayload = depAudit.rows[0].args ?? {};
    assert.equal(String(depPayload.client), String(one.client), "on the conversation's OWN client — the provenance wall held");
    assert.equal(String(depPayload.through), "2026-03-31", "with the `through` bound the model gave, as a date the DOOR parsed");
    assert.equal(Number(depPayload.periods_run), 0,
      "and it charged NOTHING on an empty register — 'nothing was due' is an answer, not a failure");
    const charged = await rig.rootQuery(
      "select count(*)::int as n from clara.journal_entries where client_id = $1 and id <> $2",
      [one.client, done.work.result.entry_id]);
    assert.equal(charged.rows[0].n, 0, "no second entry appeared: the run posted the invoice and nothing else");
    console.log("[v21-e2e] PASS 2: the depreciation tool reached its clara_runtime-only door, ran 0 periods on an empty register and charged nothing");

    // ---- 3. #658's read, in both lanes and in the durable row ------------
    assert.equal(done.work.bundle?.digest, engine.state.banner,
      "the Work records the digest the process logged — the SAME claraWork bundle the registry pins");
    assert.equal(done.work.bundle?.id, WORK_BUNDLE_ID,
      "…and it is the bundle the REGISTRY pins, read from the pin rather than retyped as a version");
    assert.equal(engine.state.chatKnowledge, true,
      "chatTurn_v21 rendered the BOUNDED knowledge block into the CHAT prompt — the repoint reached the model, not just the database");
    assert.equal(engine.state.runKnowledge, true,
      "and claraWork_v5 rendered it into the RUN prompt");

    const reads = await rig.rootQuery(
      "select seq, status, keys, knowledge_version, purpose, truncated from clara.work_knowledge_reads where work_id = $1 order by seq",
      [invoiceWork.id]);
    assert.ok(reads.rows.length >= 1, `the run recorded its read-set (got ${reads.rows.length} row(s))`);
    const read = reads.rows[0];
    assert.equal(Number(read.seq), 1, "the first attempt lands on seq 1");
    assert.equal(read.purpose, "accounting_work", "recorded under the purpose it read FOR");
    assert.ok(["ok", "partial"].includes(read.status),
      `the estate's FACE word, never the runtime's 'unavailable' (got ${read.status})`);
    assert.ok(Array.isArray(read.keys) && read.keys.includes("sst_regime"),
      `the keys it ACTUALLY read, including the record this client has (got ${JSON.stringify(read.keys)})`);
    assert.match(String(read.knowledge_version), /^\d+$/, "and the watermark, as a revision token");

    const traces = await rig.rootQuery(
      "select seq, capability_id, registry_version, observed_revisions from clara.work_execution_traces"
      + " where work_id = $1 order by seq", [invoiceWork.id]);
    const preload = traces.rows.find((r) => r.capability_id === "accounting_work.retrieve_knowledge");
    assert.ok(preload, `the preload left its own trace row (rows=${JSON.stringify(traces.rows.map((r) => [r.seq, r.capability_id]))})`);
    assert.equal(preload.registry_version, "clara-capability-registry/v2",
      "recorded under the v2 registry — v1 does not carry this capability id and would have answered a null purpose");
    console.log(`[v21-e2e] PASS 3: the block reached BOTH prompts, the read-set row carries keys=${JSON.stringify(read.keys)} at status=${read.status}, and the preload traced under registry v2`);

    // ---- 4. read_knowledge_source actually returned the record ----------
    // THE ID CAME FROM THE BLOCK, not only from this leg's env (review ADV-S-1). A tool whose
    // only identifier is a `record_id` is unreachable if the block does not print one, and the
    // out-of-band `CLARA_V21_RECORD_ID` is exactly what hid that: the leg passed while the
    // renderer printed no id at all, for three tools that need one.
    assert.equal(engine.state.blockNamedRecord, one.recordId,
      "the knowledge block the RUN was shown names the record by id — the model could have learnt "
      + `it from its own context (saw ${JSON.stringify(engine.state.blockNamedRecord)})`);
    const mine = engine.state.recordReads.get(one.recordId);
    assert.ok(mine,
      `the run called read_knowledge_source for THIS leg's record (saw ${JSON.stringify([...engine.state.recordReads.keys()])})`);
    assert.equal(mine.ok, true, `the tool RETURNED DATA rather than a refusal (got ${JSON.stringify(mine)})`);
    assert.equal(mine.record_status, "ok", "the door's own envelope rode through verbatim");
    for (const k of ["record", "key", "source"]) {
      assert.ok(mine.keys?.includes(k), `the envelope carries \`${k}\` (got ${JSON.stringify(mine.keys)})`);
    }
    assert.ok(!mine.keys.includes("bytes") && !mine.keys.includes("content"),
      "and NOT the source document's bytes — that door is 0190's and is not reachable from a knowledge read");
    console.log("[v21-e2e] PASS 4: read_knowledge_source answered the run with the record, its key catalog and its source pins");

    // ---- 5. the transcript, and the C-19 measurement from the other side --
    let parts = [];
    const partsBy = Date.now() + 60000;
    while (Date.now() < partsBy) {
      const r = await rig.rootQuery(
        "select parts from clara.chat_messages where session_id = $1 and role = 'assistant' order by seq desc limit 1",
        [sessionId],
      );
      parts = r.rows[0]?.parts ?? [];
      if (parts.some((x) => x.type === "work_accepted")) break;
      await sleep(250);
    }
    const accepted = parts.filter((x) => x.type === "work_accepted");
    assert.equal(accepted.length, 1,
      `EXACTLY ONE work_accepted card, from TWO admissions and a depreciation run. The two admissions`
      + ` return the SAME work_id and \`toTypedParts_v21\` dedupes on it; the depreciation run mints NO`
      + ` card at all (no existing kind can address its receipt truthfully), and an absent card is the`
      + ` honest rendering of an absent Work (parts=${JSON.stringify(parts.map((x) => x.type))})`);
    assert.equal(String(accepted[0].work_id), String(invoiceWork.id));
    assert.equal(accepted[0].purpose, "journal_entry");
    assert.ok(!parts.some((x) => x.type === "refusal" && /could not be completed into a review card/.test(String(x.message ?? ""))),
      "C-19 did NOT append its incomplete-coding refusal: the depreciation tool is deliberately out of the intent signal,"
      + " so a turn that also posted nothing to a card is not accused of failing to");

    // ---- 6. THE REPLAY: the SAME turn admits twice and gets ONE Work ----
    // WHY THE SAME TURN AND NOT A SECOND ONE, because the first draft of this leg got it wrong and
    // the correction is the interesting part. The intent key is
    // `stableOpKey(ctx.taskId, TOOL, input)`: a SECOND CHAT TURN carries a different task id, so it
    // mints a different key and the door admits a second Work — correctly, because two turns are
    // two requests. The property #655's stanza actually claims is that a REPLAYED CALL under one
    // identity re-reserves, and the only place a World leg can produce that is inside one turn.
    // The scripted model therefore calls `start_trade_invoice_work` TWICE with a byte-identical
    // payload (CLARA_V21_ADMIT_TIMES=2), and the measurement is a count.
    const admitCalls = await rig.rootQuery(
      "select count(*)::int as n from clara.chat_messages m, jsonb_array_elements(m.parts) p"
      + " where m.session_id = $1 and p->>'type' = 'tool_result' and p->>'tool' = 'start_trade_invoice_work'",
      [sessionId]);
    assert.equal(admitCalls.rows[0].n, 2,
      `the model really did call the admission tool TWICE in one turn (got ${admitCalls.rows[0].n}) —`
      + " without this control the count below would pass for the wrong reason");
    const worksAfter = await rig.rootQuery(
      "select count(*)::int as n from clara.accounting_work w join clara.trade_invoices t on t.work_id = w.id where w.client_id = $1",
      [one.client]);
    const invoicesAfter = await rig.rootQuery(
      "select count(*)::int as n from clara.trade_invoices where client_id = $1", [one.client]);
    assert.equal(worksAfter.rows[0].n, 1,
      "ONE trade-invoice Work after TWO identical admissions in one turn — the door re-reserved");
    assert.equal(invoicesAfter.rows[0].n, 1, "and ONE clara.trade_invoices row");
    assert.equal(await countReceipts(invoiceWork.id), 1, "and still exactly one committed receipt");
    console.log("[v21-e2e] PASS 5: two byte-identical admissions in ONE turn re-reserved the SAME Work — one invoice, one Work, one receipt");
  } finally {
    engine.child.kill("SIGKILL");
    await sleep(250);
  }

  console.log("\nCHAT TURN V21 E2E: PASS (5 legs)");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nCHAT TURN V21 E2E: FAIL\n", err);
  process.exit(1);
});
