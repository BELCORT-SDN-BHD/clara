// STANDALONE chatTurn_v20 + claraWork_v4 e2e. NOT a `node --test` file: it SPAWNS scripts/serve.mjs
// (through tests/chat-turn-v20-serve.mjs, which installs the scripted model first) as a CHILD
// process, so the real Workflow World, the real HTTP boundary, the real pools and the real frozen
// bodies are all in the loop — the pattern tests/work-journal-e2e.mjs and
// tests/chat-turn-v19-e2e.mjs established. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   node tests/chat-turn-v20-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real World plus a real HTTP boundary:
//
//   1. THE CHAT ENTRANCE #638 LEFT OPEN, END TO END. One HTTP session, one HTTP turn, the frozen
//      chatTurn_v20 body, the frozen `start_staff_expense_claim_work` tool,
//      `clara.admit_staff_expense_claim_work` under `withRuntime`, and then the reconciler's
//      `accounting_work` arm — the ONLY thing that can dispatch a chat-admitted Work, because a
//      frozen file may not import the registry to call `start()`. The Work carries purpose
//      `journal_entry` (0221's amendment: a fourth purpose cannot post without recutting the posting
//      core), `clara_interpreted`, and a `chat_task` source ref naming the REAL task and session;
//      one `clara.staff_expense_claims` row lands beside it, the run posts one approved entry whose
//      credit leg is the employee payable, and exactly one committed receipt.
//
//   2. THE CHAT ENTRANCE #652 LEFT OPEN, AND THE HONEST SHAPE OF ITS SUCCESS. The same turn's second
//      act configures an accrual whose authority window has NOT OPENED YET: one
//      `clara.accrual_adjustments` row, one `reversing_journal` plan, and NO occurrence — so the
//      tool answers `ok` with `work_accepted: null` and the transcript carries NO card for it.
//      "Configured, nothing due yet" is a thing the estate can say, and this is the leg that proves
//      it rather than inventing a Work id for an empty schedule.
//
//   3. claraWork_v4's KNOWLEDGE CONTEXT (#654 stanza (a)), MEASURED IN BOTH PLACES IT CAN BE. The
//      client's governed knowledge reaches the RUN'S PROMPT (the child prints a line when it sees
//      the block) AND the run's `model_call` execution-trace row carries `knowledge_version` as an
//      OBSERVED REVISION. Either alone would be weak: a trace row without the text is a read nobody
//      used, and text without the trace is a read nobody can audit.
//
//   4. THE CLAIM'S PARTICULARS NEVER REACHED THE RUN. #638's design claim is that a claim Work runs
//      the image's own claraWork body byte for byte, because the typed particulars live in a
//      relation the run never reads. The child scans every run prompt for five field names that
//      exist ONLY on the claim and prints one line if it ever finds them; the assertion is that the
//      line never appeared, with the posted entry standing as the positive control that the admitted
//      BASIS did reach it.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent shared with its siblings), and
// the file SKIPS CLEANLY when migration 0221 OR 0222 is absent — v20 wires both halves, and a green
// e2e against a database missing either would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[v20-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate. BYTE-IDENTICAL to `chat-turn-v19-e2e.mjs`'s, deliberately: this file
// spawns the same server against the same throwaway databases, and a gate that admitted one more
// name here would be a second, looser answer to one question.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("chat-turn-v20-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("chat-turn-v20-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}
{
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("chat-turn-v20-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.V20_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-v20-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "v20-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./chat-turn-v20-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;
/** The child's own probe lines, spelled here too — the two files cannot import each other (the
 *  bootstrap boots a server on import), so the literals are duplicated and asserted in both. */
const CLAIM_LEAK_LINE = "[v20-serve] CLAIM PARTICULARS REACHED THE RUN PROMPT";
const KNOWLEDGE_SEEN_LINE = "[v20-serve] KNOWLEDGE CONTEXT REACHED THE RUN PROMPT";

const WATCHDOG_MS = 12 * 60 * 1000;
setTimeout(() => {
  console.error(`\nCHAT TURN V20 E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  const state = { exited: false, banner: null, serving: null, claimLeaked: false, knowledgeSeen: false, stdout: "", stderr: "" };
  child.on("exit", () => {
    state.exited = true;
  });
  // LINE-BUFFERED, never per chunk — the wave-2 CI boot race's second half: several console.log
  // calls arrive in one event and one line can arrive split across two, so a banner cut by a chunk
  // boundary reads as never logged.
  const ingest = (line) => {
    // THE SERVING BUNDLE, which at this tip is v4: the wave 2026-09-15 cut repointed
    // `workflows.claraWork` v3 -> v4 in the same commit that added this file. The claim the legs
    // below make is UNCHANGED from v19's — a chat-admitted Work runs on the image's OWN claraWork
    // bundle, whatever version that is — so the digest is read from the banner rather than pinned.
    const m = /\[clara-runtime\] bundle clara-work\/v4 digest=([0-9a-f]{64})/.exec(line);
    if (m && !state.banner) state.banner = m[1];
    if (!state.serving) {
      const serving = /\[clara-runtime\] serving .*/.exec(line);
      if (serving) state.serving = serving[0];
    }
    if (line.includes(CLAIM_LEAK_LINE)) {
      state.claimLeaked = true;
      process.stderr.write(`[child] ${line}\n`);
    }
    if (line.includes(KNOWLEDGE_SEEN_LINE)) state.knowledgeSeen = true;
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

const TRAVEL = "6410";
const MEALS = "6420";
const PAYABLE = "2110";
const AUDIT_FEE = "6800";
const ACCRUALS = "2190";

/** The model's tool input, in the frozen schema's own snake_case. Written out rather than derived
 *  from `lib/staff-expense-claim-basis.ts`: this file is a CONTRACT test of the whole path, and a
 *  fixture sharing the builder could not tell a wrong derivation from a right one. */
const CLAIM_INPUT = {
  settlement: "reimbursement",
  payable_account_code: PAYABLE,
  claimant: {
    account_code: "1155",
    person_label: "Farah binti Idris",
    attestation: "Dedicated to Farah; she is not a director and this is not a related-party balance.",
    confirm_dedicated: true,
    identifier: "EMP-0042",
  },
  source_kind: "instruction",
  instruction: "Farah's March travel claim, two receipts she emailed in.",
  incurred_date: "2026-03-04",
  posting_date: "2026-03-31",
  items: [
    { description: "KL-Penang return flight", expense_account_code: TRAVEL, amount_cents: 48000 },
    { description: "Client dinner", expense_account_code: MEALS, amount_cents: 12500 },
  ],
};

const CLAIM_TOTAL_CENTS = 60500;

/** An accrual whose authority window is ENTIRELY IN THE FUTURE, bracketed by its own stated term
 *  (the wave's R4 ratification). Nothing is due, so nothing is admitted — which is the branch this
 *  leg exists to prove. */
const ACCRUAL_INPUT = {
  purpose: "Audit fee accrual for FY2027",
  expense_account_code: AUDIT_FEE,
  liability_account_code: ACCRUALS,
  amount_cents: 450000,
  service_period_start: "2027-01-01",
  service_period_end: "2027-12-31",
  term_source: "human_stated",
  method: "stated_amount",
  instruction: "The partner confirmed the audit engagement letter covers calendar 2027.",
  effective_from: "2027-01-31",
  effective_to: "2027-12-31",
  frequency: "monthly",
  day_rule: "last_day_of_month",
};

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regclass('clara.staff_expense_claims') is not null as claim_tbl,
           to_regprocedure('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)') is not null as claim_door,
           to_regclass('clara.accrual_adjustments') is not null as accrual_tbl,
           to_regprocedure('clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,int,text,date,date,text)') is not null as accrual_door,
           to_regprocedure('clara.get_knowledge_pack(uuid,text,uuid)') is not null as kn_pack,
           to_regclass('clara.work_execution_traces') is not null as traces
  `);
  const p = probe.rows[0] ?? {};
  if (!p.claim_tbl || !p.claim_door) {
    console.log("[v20-e2e] SKIPPED — migration 0221 (clara.staff_expense_claims + admit_staff_expense_claim_work) is not on this database");
    process.exit(0);
  }
  if (!p.accrual_tbl || !p.accrual_door) {
    console.log("[v20-e2e] SKIPPED — migration 0222 (clara.accrual_adjustments + create_accrual_adjustment_for) is not on this database");
    process.exit(0);
  }
  if (!p.kn_pack || !p.traces) {
    console.log("[v20-e2e] SKIPPED — migration 0192 (get_knowledge_pack) or 0195 (work_execution_traces) is not on this database");
    process.exit(0);
  }

  const countReceipts = (work) =>
    rig
      .rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);

  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type] of [
      [TRAVEL, "Travel and Accommodation", "expense"],
      [MEALS, "Staff Meals and Entertainment", "expense"],
      [PAYABLE, "Other Payables", "liability"],
      [AUDIT_FEE, "Audit and Assurance Fees", "expense"],
      [ACCRUALS, "Accruals", "liability"],
      ["1155", "Staff advance — Farah", "asset"],
      ["1000", "Maybank Current", "asset"],
    ]) {
      await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r", [
        client, code, name, type, rig.opk("acct"),
      ]);
    }
    return { owner, firm, client, jwt: await mint(owner) };
  }

  /**
   * ONE REAL accounting Work to carry the accrual's INSTRUCTION, admitted through 0178's own
   * runtime door.
   *
   * WHY THE ACCRUAL NEEDS ONE AT ALL, and why this test seeds it rather than letting the model name
   * something: `clara.create_accrual_adjustment_for` RESOLVES `p_authority_ref` against
   * `clara.accounting_work` in the same firm and client (0222 §D), and refuses
   * `authority_ref_unresolved` otherwise. An accrual is an instruction, and the instruction lives on
   * a row somebody authorised — a remembered preference or a sentence in a conversation cannot
   * supply it. So this is the fixture's own authority, and the chat tool cites it by id exactly as a
   * model would after reading the Work list.
   */
  async function seedAuthorityWork(world) {
    const basis = {
      posting_date: "2026-03-31",
      memo: "Engagement letter filed for the 2027 audit",
      currency: "MYR",
      lines: [
        { account_code: AUDIT_FEE, debit_cents: 1000, credit_cents: 0 },
        { account_code: PAYABLE, debit_cents: 0, credit_cents: 1000 },
      ],
    };
    const r = await rig.asRuntime((c) =>
      c.query(
        "select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::text) as r",
        [world.client, world.owner, rig.opk("authority"), JSON.stringify(basis), "user_direct", JSON.stringify([]), rig.DEFAULT_MODEL],
      ));
    const receipt = r.rows[0]?.r ?? null;
    assert.ok(receipt?.work_id, `the authority Work was admitted (${JSON.stringify(receipt)})`);
    return String(receipt.work_id);
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

  // SEEDED BEFORE THE ENGINE, because the accrual's authority id has to be in the child's
  // environment when it starts: the scripted model reads its tool inputs from env at module load.
  const one = await seedClient("v20-chat");
  const authorityWorkId = await seedAuthorityWork(one);

  const engine = spawnServe({
    CLARA_V20_CLAIM: JSON.stringify(CLAIM_INPUT),
    CLARA_V20_ACCRUAL: JSON.stringify({ ...ACCRUAL_INPUT, authority_work_id: authorityWorkId }),
  });
  try {
    await waitReady(45000, engine);
    assert.ok(engine.state.banner, "the world-start banner names the serving bundle digest");
    console.log(`[v20-e2e] engine ready; serving bundle digest=${engine.state.banner}`);

    // ---- one real chatTurn_v20 turn, two acts ----------------------------
    const session = await api("POST", "/api/chat/sessions", { clientId: one.client, title: "v20" }, one.jwt);
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
          text: "Farah is claiming RM480 for the Penang flight and RM125 for a client dinner — reimburse her; and accrue the 2027 audit fee of RM4,500 monthly.",
        }],
      },
      one.jwt,
    );
    assert.equal(turn.status, 202, `the turn is accepted (got ${turn.status} ${JSON.stringify(turn.body)})`);
    const chatTaskId = turn.body.task_id;
    assert.ok(chatTaskId, "and it names the chat task");

    // ---- 1. the claim Work the frozen tool admitted -----------------------
    let claimWork = null;
    while (Date.now() - startedAt < 120000) {
      const r = await rig.rootQuery(
        "select w.* from clara.accounting_work w join clara.staff_expense_claims c on c.work_id = w.id where w.client_id = $1",
        [one.client],
      );
      if (r.rows.length > 0) {
        claimWork = r.rows[0];
        break;
      }
      await sleep(250);
    }
    assert.ok(claimWork, "the chat turn admitted a Work through clara.admit_staff_expense_claim_work");
    assert.equal(claimWork.purpose, "journal_entry",
      "0221's amendment: a claim rides the EXISTING purpose — a fourth one cannot post without recutting the posting core");
    assert.equal(claimWork.adjustment_basis, null, "and it carries no adjustment basis — the particulars live in their own relation");
    assert.equal(claimWork.initiator, one.owner, "admitted for the HUMAN who was talking, not a service identity");
    assert.equal(claimWork.basis_origin, "clara_interpreted", "a chat-originated basis is labelled INTERPRETED, never user_direct");
    assert.equal(claimWork.source_refs.length, 1, "one source ref");
    assert.equal(claimWork.source_refs[0].kind, "chat_task");
    assert.equal(String(claimWork.source_refs[0].task_id), String(chatTaskId), "the ref points at the REAL chat task");
    assert.equal(String(claimWork.source_refs[0].session_id), String(sessionId), "read off the task, never from a model argument");
    assert.ok(/^[0-9a-f]{64}$/.test(claimWork.basis_digest), "the DATABASE derived the digest — the tool never sends one");

    const claimRows = await rig.rootQuery("select * from clara.staff_expense_claims where client_id = $1", [one.client]);
    assert.equal(claimRows.rows.length, 1, "exactly ONE claim row");
    const claimRow = claimRows.rows[0];
    assert.equal(claimRow.settlement, "reimbursement");
    assert.equal(Number(claimRow.total_cents ?? claimRow.amount_cents), CLAIM_TOTAL_CENTS,
      "the itemised total, in exact cents, derived by the DOOR and not by the tool");

    // THE DERIVED JOURNAL — the door's own work, which is why the tool sends no basis at all.
    const legs = claimWork.basis.lines.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]);
    assert.deepEqual(
      legs.filter((l) => l[1] > 0).sort(),
      [[MEALS, 12500, 0], [TRAVEL, 48000, 0]].sort(),
      "each item DEBITS its own expense account, in exact cents",
    );
    assert.deepEqual(
      legs.filter((l) => l[2] > 0),
      [[PAYABLE, 0, CLAIM_TOTAL_CENTS]],
      "and the ONE credit is the employee payable — an employee is never a counterparty",
    );

    const done = await pollWork(claimWork.id, one.jwt, (b) => TERMINAL.has(b.work.status), "v20 claim work settles", 120000);
    const latencyMs = Date.now() - startedAt;
    assert.equal(done.work.status, "completed",
      `the reconciler dispatched it and it completed (got ${done.work.status} / ${JSON.stringify(done.work.error)})`);
    assert.ok(done.work.result?.entry_id, "with a posted entry");
    assert.equal(await countReceipts(claimWork.id), 1, "and EXACTLY ONE committed operation receipt");

    const entry = await rig.rootQuery("select status, document_id from clara.journal_entries where id = $1", [done.work.result.entry_id]);
    assert.equal(entry.rows[0].status, "approved", "posted approved, not left as a draft");
    assert.equal(entry.rows[0].document_id, null, "documentless — a chat claim is not a document and none is invented");
    console.log(`[v20-e2e] PASS 1: a real chatTurn_v20 turn admitted a staff-expense-claim Work and the reconciler ran it to a posted entry in ${latencyMs}ms`);

    // ---- 2. the accrual, configured, with nothing due --------------------
    let accrual = null;
    const accrualBy = Date.now() + 120000;
    while (Date.now() < accrualBy) {
      const r = await rig.rootQuery("select * from clara.accrual_adjustments where client_id = $1", [one.client]);
      if (r.rows.length > 0) {
        accrual = r.rows[0];
        break;
      }
      await sleep(250);
    }
    assert.ok(accrual, "the same turn configured an accrual through clara.create_accrual_adjustment_for");
    assert.equal(Number(accrual.amount_cents), 450000, "carrying the exact stated amount");
    assert.equal(accrual.term_source, "human_stated", "the term is one a PERSON stated — the schema can express nothing else");
    assert.ok(accrual.plan_id, "and it names the reversing_journal plan the schedule rides");

    const plan = await rig.rootQuery("select kind, status from clara.accounting_plans where id = $1", [accrual.plan_id]);
    assert.equal(plan.rows[0].kind, "reversing_journal", "D12: an accrual rides the EXISTING plan kind, it does not widen the CHECK");
    assert.equal(plan.rows[0].status, "active");

    const occurrences = await rig.rootQuery("select count(*)::int as n from clara.accounting_plan_occurrences where plan_id = $1", [accrual.plan_id]);
    assert.equal(occurrences.rows[0].n, 0,
      "NOTHING IS DUE: the authority window opens in 2027, so no occurrence was admitted and no Work exists to name");
    console.log("[v20-e2e] PASS 2: the accrual is configured on a reversing_journal plan with NO occurrence — 'configured, nothing due yet' is a real state");

    // ---- 3. claraWork_v4's knowledge context, in both places -------------
    assert.equal(done.work.bundle?.digest, engine.state.banner,
      "the Work records the digest the process logged — the SAME claraWork bundle a documentless journal entry runs on");
    assert.equal(engine.state.knowledgeSeen, true,
      "claraWork_v4 rendered the client's governed knowledge into the RUN's prompt (#654 stanza (a)) — a trace row without the text would be a read nobody used");

    const traces = await rig.rootQuery(
      "select observed_revisions from clara.work_execution_traces where work_id = $1 and phase = 'model_call' order by seq",
      [claimWork.id],
    );
    assert.ok(traces.rows.length >= 1, `the run left at least one model_call trace row (got ${traces.rows.length})`);
    const observed = traces.rows[0].observed_revisions ?? {};
    assert.ok(Object.prototype.hasOwnProperty.call(observed, "knowledge_version"),
      `the model_call row records which knowledge watermark the run reasoned on (observed=${JSON.stringify(observed)})`);
    assert.match(String(observed.knowledge_version), /^\d+$/, "as a revision token, never as free text");
    console.log(`[v20-e2e] PASS 3: the run read the client's knowledge AND recorded knowledge_version=${observed.knowledge_version} as an observed revision`);

    // ---- 4. the claim's particulars never reached the run ----------------
    assert.equal(engine.state.claimLeaked, false,
      "the run's model NEVER saw person_label, confirm_dedicated, payable_account_code, settlement or pending_fact "
      + "— the particulars ride a relation the run does not read (the posted entry above is the positive control that the BASIS did reach it)");

    // ---- and the transcript ---------------------------------------------
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
      `EXACTLY ONE work_accepted card — the claim's. The accrual configured a schedule with nothing due, and an absent card`
      + ` is the honest rendering of an absent Work (parts=${JSON.stringify(parts.map((x) => x.type))})`);
    assert.equal(String(accepted[0].work_id), String(claimWork.id));
    assert.equal(accepted[0].purpose, "journal_entry", "carrying the purpose 0221's amendment gives a claim");
    assert.equal(String(accepted[0].client_id), String(one.client));
    console.log("[v20-e2e] PASS 4: the claim's particulars never reached the run, and the transcript carries exactly one card — the Work that exists");
  } finally {
    engine.child.kill("SIGKILL");
    await sleep(250);
  }

  console.log("\nCHAT TURN V20 E2E: PASS (4 legs)");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nCHAT TURN V20 E2E: FAIL\n", err);
  process.exit(1);
});
