// STANDALONE chatTurn_v22 + claraWork_v6 e2e — THE CUT'S OWN CHAT WALK AND WORK WALK.
//
// NOT a `node --test` file: it SPAWNS scripts/serve.mjs (through tests/chat-turn-v22-serve.mjs,
// which installs the scripted model first) as a CHILD process, so the real Workflow World, the real
// HTTP boundary, the real pools and the real frozen bodies are all in the loop — the pattern
// tests/work-journal-e2e.mjs, tests/chat-turn-v19-e2e.mjs, v20's and v21's established. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   node tests/chat-turn-v22-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real World plus a real HTTP boundary:
//
//   1. A LOOK-ALIKE IS A QUESTION, NOT A REFUSAL, AND NOTHING IS WRITTEN WHILE IT IS ASKED (#1007).
//      Turn 1 records a supplier bill. Turn 2 sends the SAME particulars: the tool probes, finds
//      the first, and hands the matches back — the model SEES `duplicates_found`, no second Work
//      exists at that moment, and no acknowledgement row does either. Then the person says record
//      it anyway, and a second Work is admitted with EXACTLY ONE acknowledgement row carrying the
//      invoice the probe showed. Two turns are two requests; the count is the measurement.
//
//      AND THE CONTROL THAT KEEPS IT HONEST (v21's trap 1, designed out rather than discovered):
//      the acknowledgement's `shown` array is compared against the FIRST turn's own invoice id,
//      which this file learns from the database rather than from the script. A leg whose script
//      supplied the id would pass with a probe that found nothing.
//
//   2. ONE CLAIM OFF TWO ADVANCES, AND THE REGISTER REFUSES A SPLIT NOBODY CONFIRMED (#931 item
//      10). The model sends a two-advance split with no confirmation and is refused LOCALLY,
//      before any round trip, with the exact list to read back; it reads it back, the person
//      agrees, and one Work is admitted. The run posts ONE entry with ONE credit leg per advance
//      account and leaves TWO `clara.staff_advance_applications` rows.
//
//   3. THE WORK WALK: claraWork_v6 SERVES THESE RUNS. The boot banner names v6's bundle, the
//      registry's own pin is what this file reads rather than a version literal, and the committed
//      receipt records v6's digest — so a run whose receipt named a contract it was not served
//      under would be visible here rather than in a hosted incident.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent shared with its siblings), and
// the file SKIPS CLEANLY when migration 0225, 0275 or 0301 is absent — this cut wires all three
// halves, and a green e2e against a database missing any of them would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";
import { pinnedClaraWorkBannerRe, pinnedClaraWorkBundleId } from "./pinned-work-bundle.mjs";
import { DB_NAME_SHAPE, allowedDbPattern, assertLocalDbGate } from "./local-db-gate.mjs";

// THE SERVING claraWork BUNDLE, READ FROM THE REGISTRY'S OWN PIN — never retyped in this file. The
// pin has moved v1 -> v2 (#629), v2 -> v3 (#631), v3 -> v4, v4 -> v5, and v5 -> v6 (this cut), and
// startWorld logs one banner per RETAINED body, so a version literal here would match a banner no
// run is served by and compare a digest no run can record.
const WORK_BUNDLE_ID = pinnedClaraWorkBundleId();
const WORK_BUNDLE_BANNER_RE = pinnedClaraWorkBannerRe();

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[v22-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

assertLocalDbGate({
  label: "chat-turn-v22-e2e",
  pattern: allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}`),
  checkDsnString: true,
  checkDsnParsed: true,
});

const PORT = process.env.V22_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-v22-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "v22-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./chat-turn-v22-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;
/** The child's own probe lines, spelled here too — the two files cannot import each other (the
 *  bootstrap boots a server on import), so the literals are duplicated and asserted in both. */
const DUPLICATE_QUESTION_LINE = "[v22-serve] THE LOOK-ALIKE CAME BACK AS A QUESTION";
const SPLIT_REFUSED_LINE = "[v22-serve] THE UNCONFIRMED SPLIT WAS REFUSED";
const CLAIM_ACCEPTED_LINE = "[v22-serve] THE CONFIRMED SPLIT WAS ACCEPTED";

const WATCHDOG_MS = 14 * 60 * 1000;
setTimeout(() => {
  console.error(`\nCHAT TURN V22 E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  const state = {
    exited: false, banner: null, serving: null,
    duplicateQuestion: null, splitRefusal: null, claimAccepted: null,
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
    for (const [marker, field] of [
      [DUPLICATE_QUESTION_LINE, "duplicateQuestion"],
      [SPLIT_REFUSED_LINE, "splitRefusal"],
      [CLAIM_ACCEPTED_LINE, "claimAccepted"],
    ]) {
      if (!line.includes(marker)) continue;
      const payload = line.slice(line.indexOf(marker) + marker.length).trim();
      try {
        state[field] = JSON.parse(payload);
      } catch {
        state[field] = { unparsed: payload };
      }
      process.stdout.write(`[child] ${line}\n`);
      continue;
    }
    // AND EVERY OTHER LINE THIS LEG'S OWN SCRIPT WRITES. The three above are what the parent
    // ASSERTS on; these are what a human reads when one of them never arrives, and without them
    // a failure says only "the model did not see it" with no way to tell whether it was called
    // at all.
    if (line.startsWith("[v22-serve]")) process.stdout.write(`[child] ${line}\n`);
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
const BANK = "1150";
const TRAVEL = "6200";
const ADVANCE = "1240";
const TOTAL_CENTS = 106000;
/** The two advances, and the split that discharges them. The first is older, so a proposal that
 *  ordered by date would name it first — which is what makes the CONFIRMED list the interesting
 *  one rather than the obvious one. */
const ADVANCE_A_CENTS = 60000;
const ADVANCE_B_CENTS = 90000;
const CLAIM_CENTS = 120000;

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
      { account_code: EXPENSE, description: "office supplies", debit_cents: TOTAL_CENTS, credit_cents: 0 },
      { account_code: PAYABLE, description: "payable", debit_cents: 0, credit_cents: TOTAL_CENTS },
    ],
    document_id: null,
    basis_origin: "clara_interpreted",
  };
}

/** The claim, with a two-advance split and NO confirmation. The script sends this first on purpose:
 *  the refusal it draws is #931's own rule, and the list the refusal hands back is what the model
 *  reads to the person. */
function claimInput(enrolmentId, advanceA, advanceB) {
  return {
    settlement: "advance_application",
    claimant: { enrolment_id: enrolmentId },
    source_kind: "instruction",
    instruction: "Settle Farah's March trip against her two advances",
    incurred_date: "2026-03-10",
    posting_date: "2026-03-31",
    items: [
      { description: "Flights", expense_account_code: TRAVEL, amount_cents: 70000 },
      { description: "Hotel", expense_account_code: TRAVEL, amount_cents: 50000 },
    ],
    advance_account_code: ADVANCE,
    advance_allocations: [
      { advance_id: advanceA, amount_cents: ADVANCE_A_CENTS },
      { advance_id: advanceB, amount_cents: CLAIM_CENTS - ADVANCE_A_CENTS },
    ],
  };
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regprocedure('clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)') is not null as admit,
           to_regprocedure('clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)') is not null as probe,
           to_regprocedure('clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)') is not null as ack,
           to_regclass('clara.trade_invoice_duplicate_acks') is not null as acks,
           to_regprocedure('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)') is not null as claim,
           to_regclass('clara.staff_advance_applications') is not null as applications
  `);
  const p = probe.rows[0] ?? {};
  if (!p.admit) {
    console.log("[v22-e2e] SKIPPED — migration 0225 (clara.admit_trade_invoice_work) is not on this database");
    process.exit(0);
  }
  if (!p.probe || !p.ack || !p.acks) {
    console.log("[v22-e2e] SKIPPED — migration 0275 (the duplicate probe and its acknowledgement) is not on this database");
    process.exit(0);
  }
  if (!p.claim || !p.applications) {
    console.log("[v22-e2e] SKIPPED — migration 0301 (the claim allocation list) is not on this database");
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
      [TRAVEL, "Travel and Accommodation", "expense", null],
      [BANK, "Maybank Current", "asset", null],
      [ADVANCE, "Staff advance — Farah", "asset", null],
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
    return { owner, firm, client, counterparty, jwt: await mint(owner) };
  }

  /** ONE REAL STAFF ADVANCE, through the estate's OWN doors — never a hand-written register row.
   *  The enrolment happens once; each disbursement entry soft-births one `clara.staff_advances`
   *  row through 0043's own hook, which is why this helper approves an ordinary coded entry rather
   *  than inserting one. */
  async function seedAdvance(world, checker, { cents, issueDate }) {
    const res = await rig.humanQuery(world.owner,
      `select clara.record_client_resolution(p_client=>$1::uuid, p_subject_kind=>'manual',
         p_subject=>null::uuid, p_confidence=>0.98::numeric, p_method=>'human',
         p_evidence=>'{}'::jsonb, p_op_key=>$2::text) as r`,
      [world.client, rig.opk("res")]);
    const answer = res.rows[0].r;
    const resolution = typeof answer === "string" ? answer : (answer.resolution_id ?? answer.id);
    assert.ok(resolution, `record_client_resolution named its row (got ${JSON.stringify(answer)})`);
    const draft = await rig.humanQuery(world.owner,
      `select clara.draft_entry(p_client=>$1::uuid, p_resolution=>$2::uuid, p_posting_date=>$3::date,
         p_memo=>$4::text, p_lines=>$5::jsonb, p_op_key=>$6::text) as r`,
      [world.client, resolution, issueDate, `#1135 e2e: advance paid to Farah on ${issueDate}`,
        JSON.stringify([
          { account_code: ADVANCE, debit_cents: cents, credit_cents: 0, description: "advance paid out" },
          { account_code: BANK, debit_cents: 0, credit_cents: cents, description: "from bank" },
        ]), rig.opk("draft")]);
    const d = draft.rows[0].r;
    await rig.humanQuery(checker,
      "select clara.approve_entry(p_entry=>$1::uuid, p_expected_revision=>$2::uuid, p_op_key=>$3::text) as r",
      [d.entry_id, d.revision_token, rig.opk("approve")]);
    return d.entry_id;
  }

  async function pollWork(workId, jwt, pred, label, deadlineMs = 150000) {
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
  const one = await seedClient("v22-chat");
  const checker = await rig.addMember(one.owner, one.firm, { role: "bookkeeper", prefix: "v22_chk" });
  await rig.humanQuery(one.owner,
    `select clara.enrol_staff_advance_account(p_client=>$1::uuid, p_account_code=>$2::text,
       p_person_label=>$3::text, p_confirm_dedicated=>true, p_attestation=>$4::text,
       p_op_key=>$5::text) as r`,
    [one.client, ADVANCE, "Farah binti Idris",
      "#1135 e2e: dedicated to one named person; not a related-party balance", rig.opk("enrol")]);
  await seedAdvance(one, checker, { cents: ADVANCE_A_CENTS, issueDate: "2026-02-01" });
  await seedAdvance(one, checker, { cents: ADVANCE_B_CENTS, issueDate: "2026-02-15" });
  const enrolments = await rig.rootQuery(
    "select * from clara.staff_advance_accounts where client_id = $1", [one.client]);
  assert.equal(enrolments.rows.length, 1, "one enrolment, for one named person");
  const enrolmentId = enrolments.rows[0].id;
  const advances = await rig.rootQuery(
    "select * from clara.staff_advances where client_id = $1 order by issue_date", [one.client]);
  assert.equal(advances.rows.length, 2, "two disbursements soft-birthed two register rows");
  const advanceA = advances.rows[0].id;
  const advanceB = advances.rows[1].id;

  // ONE ACT PER TURN, AND THE TURN'S OWN WORDS ARE WHAT SELECT IT. Without a cue the script would
  // do everything it can on every turn — which is what a real model would NOT do, and which would
  // make "the claim landed on turn three" a claim this file could not support.
  const INVOICE_CUE = "Alpha Supplies";
  const CLAIM_CUE = "against the February advances";

  const engine = spawnServe({
    CLARA_V22_INVOICE: JSON.stringify(invoiceInput(one.counterparty)),
    CLARA_V22_INVOICE_CUE: INVOICE_CUE,
    CLARA_V22_CLAIM: JSON.stringify(claimInput(enrolmentId, advanceA, advanceB)),
    CLARA_V22_CLAIM_CUE: CLAIM_CUE,
    CLARA_V22_CLIENT_ID: one.client,
  });
  try {
    await waitReady(60000, engine);
    assert.ok(engine.state.banner, "the world-start banner names the serving bundle digest");
    assert.match(engine.state.serving ?? "", /chatTurn=chatTurn_v22/, "the engine serves THIS cut's chat body");
    assert.match(engine.state.serving ?? "", /claraWork=claraWork_v6/, "…and THIS cut's Work body");
    console.log(`[v22-e2e] engine ready; serving bundle=${WORK_BUNDLE_ID} digest=${engine.state.banner}`);

    /** ONE SESSION PER TURN, and that is the shape the measurement wants rather than a convenience.
     *  Two recordings of one document are two REQUESTS — a preparer comes back to it, or a
     *  colleague does — and the duplicate probe is CLIENT-scoped precisely because a session is not
     *  what makes two documents the same document. Driving them through one session would also make
     *  turn 2's intent key depend on turn 1's transcript, which is not what is being measured. */
    async function newSession(title) {
      const r = await api("POST", "/api/chat/sessions", { clientId: one.client, title }, one.jwt);
      assert.equal(r.status, 201, `session created (got ${r.status} ${JSON.stringify(r.body)})`);
      const id = r.body.id ?? r.body.session_id;
      assert.ok(id, `the session id comes back (${JSON.stringify(r.body)})`);
      return id;
    }

    /** ONE SESSION, THREE TURNS, IN ORDER. The route refuses a second turn while the first is in
     *  progress (409 `this session already has a turn in progress`), which is correct: a session is
     *  a conversation and a person does not speak twice at once. So each turn waits for its
     *  predecessor to SETTLE — which is also what makes turn 2's probe meaningful, because turn 1's
     *  invoice has to be on the books before anything can look like it. */
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

    async function turn(text, title) {
      const sessionId = await newSession(title);
      const r = await api("POST", `/api/chat/${sessionId}/turns`,
        { turnKey: `tk_${randomUUID().slice(0, 12)}`, parts: [{ type: "text", text }] }, one.jwt);
      assert.equal(r.status, 202, `the turn is accepted (got ${r.status} ${JSON.stringify(r.body)})`);
      assert.ok(r.body.task_id, "and it names the chat task");
      return r.body.task_id;
    }

    async function waitInvoices(n, label, deadlineMs = 150000) {
      const end = Date.now() + deadlineMs;
      let rows = [];
      while (Date.now() < end) {
        const r = await rig.rootQuery(
          "select * from clara.trade_invoices where client_id = $1 order by created_at", [one.client]);
        rows = r.rows;
        if (rows.length >= n) return rows;
        await sleep(250);
      }
      throw new Error(`waitInvoices timeout (${label}); saw ${rows.length} of ${n}`);
    }

    // ---- 1. TURN ONE: the bill nobody has seen before ---------------------
    const startedAt = Date.now();
    const firstTask = await turn(`Record ${INVOICE_CUE}' March bill for RM1,060 including SST.`, "v22-first");
    const afterFirst = await waitInvoices(1, "turn 1 admits one invoice");
    assert.equal(afterFirst.length, 1, "exactly ONE trade-invoice row after the first turn");
    const firstInvoice = afterFirst[0];
    assert.equal(firstInvoice.kind, "supplier_bill");
    assert.equal(Number(firstInvoice.total_cents), TOTAL_CENTS, "the stated total, in exact cents");
    assert.equal(String(firstInvoice.counterparty_id), String(one.counterparty), "the party the DOOR resolved");
    const firstWork = await rig.rootQuery(
      "select * from clara.accounting_work where id = $1", [firstInvoice.work_id]);
    assert.equal(firstWork.rows[0].purpose, "journal_entry",
      "a trade invoice rides the EXISTING purpose — WORK_ACCEPTED_PURPOSES did not widen for it");
    assert.equal(String(firstWork.rows[0].source_refs[0].task_id), String(firstTask),
      "the source ref points at the REAL chat task");
    // NOTHING WAS ACKNOWLEDGED: the probe found nothing, so no row exists. This is the control the
    // leg below needs — without it, "one ack row" could have been true before anything was asked.
    const acksAfterFirst = await rig.rootQuery(
      "select count(*)::int n from clara.trade_invoice_duplicate_acks where client_id = $1", [one.client]);
    assert.equal(acksAfterFirst.rows[0].n, 0,
      "a recording nobody was warned about leaves NO acknowledgement — the row means something");
    // AND THE CLAIM HAS NOT HAPPENED YET, which is what makes turn three's measurement about turn
    // three: one act per turn, selected by the turn's own words.
    const claimsAfterFirst = await rig.rootQuery(
      "select count(*)::int n from clara.staff_expense_claims where client_id = $1", [one.client]);
    assert.equal(claimsAfterFirst.rows[0].n, 0, "turn one recorded a bill and nothing else");
    console.log(`[v22-e2e] PASS 1: turn one admitted one trade-invoice Work and acknowledged nothing`);

    // ---- 2. TURN TWO: the same bill again, and the question ---------------
    assert.ok(TASK_TERMINAL.has(await settleTask(firstTask)), "turn one settled before turn two speaks");
    const secondTask = await turn(`Record ${INVOICE_CUE}' March bill for RM1,060 including SST.`, "v22-again");
    const end = Date.now() + 150000;
    while (Date.now() < end && engine.state.duplicateQuestion === null) await sleep(250);
    assert.ok(engine.state.duplicateQuestion,
      `the model SAW a look-alike come back as a question`
      + `\n--- child stdout (tail) ---\n${engine.state.stdout || "(none)"}`);
    const asked = engine.state.duplicateQuestion;
    assert.equal(asked.match_count, 1, "one look-alike, which is what this client actually holds");
    assert.deepEqual(asked.references, ["ALPHA-2026-0042"], "…named by its own reference");
    assert.match(String(asked.question), /Record this one anyway, or stop\?/,
      "and the question asks rather than refuses — the owner's ruling, in the words the model reads");

    const afterSecond = await waitInvoices(2, "the acknowledged recording lands");
    assert.equal(afterSecond.length, 2, "and then, and only then, a SECOND invoice");
    const secondInvoice = afterSecond.find((r) => String(r.id) !== String(firstInvoice.id));
    assert.ok(secondInvoice, "the second row is a different row");
    const secondWork = await rig.rootQuery(
      "select * from clara.accounting_work where id = $1", [secondInvoice.work_id]);
    assert.equal(String(secondWork.rows[0].source_refs[0].task_id), String(secondTask),
      "admitted by the SECOND turn — two turns are two requests, and the intent keys differ");

    const acks = await rig.rootQuery(
      "select * from clara.trade_invoice_duplicate_acks where client_id = $1", [one.client]);
    assert.equal(acks.rows.length, 1, "EXACTLY ONE acknowledgement row, written before the admission");
    const ack = acks.rows[0];
    assert.equal(String(ack.acknowledged_by), String(one.owner),
      "attributed to the HUMAN the turn acted for, never a service identity");
    // THE CONTROL (v21's trap 1, designed out). The ids the acknowledgement carries are the PROBE's
    // own measurement, and this file learns the expected one from the database rather than from the
    // script — a leg whose script supplied the id would pass with a probe that found nothing.
    // THE DOOR STORES THE WHOLE MATCH, not the bare id it was handed: 0275 resolves each id it is
    // given into the row it names and records the reference, the date, the total and who recorded
    // it, so a reviewer reading the acknowledgement months later sees WHAT the preparer was shown
    // rather than a uuid. The id is what this leg compares.
    const shown = Array.isArray(ack.shown) ? ack.shown.map((x) => String(x.invoice_id)) : [];
    assert.deepEqual(shown, [String(firstInvoice.id)],
      "the acknowledgement names the invoice the probe actually showed, and nothing else");
    console.log(`[v22-e2e] PASS 2: a look-alike asked, the person said go ahead, and one acknowledgement rode with the recording`);

    // ---- 3. the two Works run on claraWork_v6 -----------------------------
    for (const [label, work] of [["first", firstInvoice.work_id], ["second", secondInvoice.work_id]]) {
      const done = await pollWork(work, one.jwt, (b) => TERMINAL.has(b.work.status), `v22 ${label} invoice work settles`);
      assert.equal(done.work.status, "completed",
        `the reconciler dispatched the ${label} Work and it completed (got ${done.work.status} / ${JSON.stringify(done.work.error)})`);
      assert.ok(done.work.result?.entry_id, "with a posted entry");
      assert.equal(await countReceipts(work), 1, "and EXACTLY ONE committed operation receipt");
      const receipt = await rig.rootQuery(
        "select bundle_digest from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work]);
      assert.equal(receipt.rows[0].bundle_digest, engine.state.banner,
        "the receipt records the bundle that ACTUALLY served the run — the one the boot banner named");
    }
    console.log(`[v22-e2e] PASS 3: both Works ran on ${WORK_BUNDLE_ID} and their receipts record its digest`);

    // ---- 4. TURN THREE: one claim, two advances, and the split a person confirmed
    assert.ok(TASK_TERMINAL.has(await settleTask(secondTask)), "turn two settled before turn three speaks");
    const claimTask = await turn(`Settle Farah's March trip ${CLAIM_CUE}.`, "v22-claim");
    const endClaim = Date.now() + 150000;
    while (Date.now() < endClaim && engine.state.splitRefusal === null) await sleep(250);
    assert.ok(engine.state.splitRefusal,
      `the unconfirmed split was refused LOCALLY, before any round trip`
      + `\n--- child stdout (tail) ---\n${engine.state.stdout || "(none)"}`);
    assert.equal(engine.state.splitRefusal.constraint, "confirmation");
    assert.equal(engine.state.splitRefusal.proposed?.length, 2,
      "and the refusal handed the model the exact list to read back");

    let claimWork = null;
    while (Date.now() < endClaim) {
      const r = await rig.rootQuery(
        "select w.* from clara.accounting_work w join clara.staff_expense_claims c on c.work_id = w.id where w.client_id = $1",
        [one.client]);
      if (r.rows.length > 0) {
        claimWork = r.rows[0];
        break;
      }
      await sleep(250);
    }
    assert.ok(claimWork, "the confirmed split admitted exactly one claim Work");
    assert.equal(String(claimWork.source_refs[0].task_id), String(claimTask));
    const claimDone = await pollWork(claimWork.id, one.jwt, (b) => TERMINAL.has(b.work.status), "v22 claim work settles");
    assert.equal(claimDone.work.status, "completed",
      `the claim Work completed (got ${claimDone.work.status} / ${JSON.stringify(claimDone.work.error)})`);
    const claimEntry = claimDone.work.result?.entry_id;
    assert.ok(claimEntry, "with a posted entry");

    const lines = await rig.rootQuery(
      "select * from clara.journal_lines where entry_id = $1 order by line_no", [claimEntry]);
    const creditLines = lines.rows.filter((l) => Number(l.credit_cents) > 0);
    // ONE CREDIT LEG PER ADVANCE ACCOUNT, WHICH IS NOT THE SAME AS ONE PER ADVANCE — measured
    // here rather than assumed, and the distinction is 0301's own. Both of this client's advances
    // sit on the SAME enrolled account, so the journal carries ONE credit on it for the whole
    // claim; what tells the two advances apart is the APPLICATION ROWS below, which is exactly why
    // the register keeps them. A claim spanning two enrolled accounts would carry two legs, and
    // the allocation line's optional `account_code` is what says so.
    assert.equal(creditLines.length, 1, "one credit leg, because both advances sit on one enrolled account");
    assert.equal(creditLines[0].account_code, ADVANCE);
    assert.equal(Number(creditLines[0].credit_cents), CLAIM_CENTS,
      "and it credits the claim exactly — the split is in the register, never in a second leg");
    const debitLines = lines.rows.filter((l) => Number(l.debit_cents) > 0);
    assert.equal(debitLines.length, 2, "and the two expense items are the two debits");

    const applications = await rig.rootQuery(
      "select * from clara.staff_advance_applications where client_id = $1 order by amount_cents", [one.client]);
    assert.equal(applications.rows.length, 2, "TWO clara.staff_advance_applications rows, one per advance");
    assert.deepEqual(
      applications.rows.map((r) => Number(r.amount_cents)).sort((a, b) => a - b),
      [ADVANCE_A_CENTS, CLAIM_CENTS - ADVANCE_A_CENTS].sort((a, b) => a - b),
      "each carrying the amount the human confirmed for THAT advance",
    );
    assert.deepEqual(
      applications.rows.map((r) => String(r.advance_id)).sort(),
      [String(advanceA), String(advanceB)].sort(),
      "…against the two advances they named, and no others",
    );
    console.log(`[v22-e2e] PASS 4: one chat turn, a split nobody had confirmed refused, then two advances discharged by one entry and two application rows`);

    console.log(`\nCHAT TURN V22 E2E: ALL PASS (${Date.now() - startedAt}ms)`);
  } finally {
    engine.child.kill("SIGTERM");
    await sleep(500);
    if (!engine.state.exited) engine.child.kill("SIGKILL");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nCHAT TURN V22 E2E: FAILED\n", err);
    process.exit(1);
  },
);
