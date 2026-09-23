// STANDALONE trade-invoice e2e (#655). NOT a `node --test` file: it SPAWNS scripts/serve.mjs
// (through tests/work-journal-serve.mjs, which installs the scripted model first) as a CHILD
// process, so the engine can be crashed mid-run and respawned against the SAME database — the
// pattern tests/interview-kill-resume-e2e.mjs established and tests/work-journal-e2e.mjs,
// tests/periodic-adjustment-e2e.mjs and tests/staff-expense-claim-e2e.mjs reuse. Run:
//
//   export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"
//   PGHOST=127.0.0.1 PGPORT=55705 PGUSER=postgres PGDATABASE=clara_655 \
//   CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55705/clara_655 \
//   node tests/trade-invoice-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real Postgres World plus a real HTTP boundary:
//   1. ADMIT -> RUN -> COMMIT, THROUGH THE UNCHANGED FROZEN BUNDLE. One POST to the new FOURTH
//      sibling route produces one Work whose purpose is the UNWIDENED `journal_entry`, one run
//      served by the SAME claraWork body a documentless journal entry is served by — the bundle the
//      REGISTRY pins, read rather than retyped here — one approved entry, one
//      `clara.operation_receipts` row, one `clara.trade_invoices` row born at ADMISSION before any
//      run, a `posted` row on its status ledger written by the receipt's own trigger, and — the
//      thing only a real World can show — ONE `clara.open_items` row minted by a DEFERRED
//      constraint trigger at COMMIT. That the typed invoice never reaches the model is the whole
//      design: the envelope the model echoes carries `basis` and nothing else.
//   2. A LOST ACKNOWLEDGEMENT. The same intentKey re-POSTed returns the SAME Work AND the SAME
//      invoice with `replayed:true`, and mints no second task, no second entry, no second invoice
//      and no second open item.
//   3. A CHANGED INVOICE under that key is a 409 `intent_payload_conflict` — proved with a change
//      that does NOT move the journal basis at all (the document reference), so this is the leg
//      that shows `clara._trade_invoice_canonical` is genuinely in the comparison rather than the
//      basis digest doing all the work.
//   4. A CRASH AFTER COMMIT, BEFORE CHECKPOINT. `CLARA_WORK_TEST_FAULT=exit_after_commit` (the
//      barrier at claraWork.v4.tools.ts:310-313) exits the process the instant the database
//      returns a receipt. On respawn the WDK re-executes the step, the tool call REPLAYS onto the
//      same logical identity, and exactly ONE entry, ONE committed receipt, ONE invoice row AND
//      ONE open item exist — the last of which is written by a DEFERRED constraint trigger at
//      COMMIT, so nothing but a real World can show it survived the window.
//   5. THE DUE-DATE BASIS ON THE REAL LANE. An invoice with NO stated due date, for a counterparty
//      whose agreed terms the database holds, reaches `clara.open_items.due_date` as
//      `document_date + payment_terms_days` (DECISIONS §6.2.0 R-A — payment terms run from the
//      DOCUMENT, not from the day it was keyed in) with `due_date_source='counterparty_terms'` —
//      and the 202 body says so, so the browser can render the basis it did not compute.
//   6. A REPLAY THAT LANDS WHILE THE WORK IS PARKED ON A QUESTION (#980). The run asks a typed
//      clarifying question and parks (`awaiting_input`); the SAME intent key is re-POSTed into
//      that window; a human answers; and the whole thing converges on ONE outcome — one Work,
//      one task, one question, one entry, one receipt, one invoice, one open item — with a
//      further replay AFTER the answer still resolving to the same Work. AC4 of #655 built this
//      convergence lane-agnostically and other lanes cover it; nothing drove a trade invoice
//      through the parked half until now.
//   7. AN EXPLICIT CANCEL INSIDE THE COMMIT WINDOW (#980). The model is HELD after it has read
//      the chart and before its `record_journal_entry` call — the Work is `running`, the run
//      holds the task and nothing has been admitted — and the human cancels there. The Work
//      reads `stopping` over the real route, terminalises `cancelled`, and the ledger is
//      untouched: ZERO entries, ZERO receipts, ZERO open items, and the invoice row born at
//      admission never gains its `posted` status row.
//
// TWO SERVE SCRIPTS, and leg 7 borrows rather than reinvents. Legs 1-6 spawn
// tests/work-journal-serve.mjs (leg 6 with its `ask_question` script, added for this file by
// #980). Leg 7 spawns tests/work-cancel-serve.mjs UNCHANGED, because the deterministic
// before-admission window and its gate-file protocol already exist there and belong to that
// file's header; a second copy of the hold inside the shared harness would be one more thing to
// keep in step for no new fact. The model in either file is lane-agnostic — it reads the chart
// and echoes the admitted basis — so a trade-invoice Work runs through it exactly as a
// documentless journal entry does, which is the point leg 1 already makes about the bundle.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent shared with its siblings), and
// the file SKIPS CLEANLY when migration 0225 is absent — its runtime half merges alongside its DB
// half, and a green e2e against a database with no `clara.trade_invoices` would be a lie.
//
// A NOTE ON THE LOCAL GATE (#1018: shared with every other standalone World e2e driver). The
// siblings hard-gate PGDATABASE to `clara_(rt_test|wave_b_ci)`. The 2026-09-18 wave gave each
// implementer a DEDICATED cluster and database (`clara_<ticket>`), and the riders wave of
// 2026-09-20 gives each LANE one (`clara_l<NN>`, riders/RIG.md), so the gate admits both shapes —
// still loopback-only, still a parsed-DSN equality check against the PG env, and still
// fail-closed on anything else.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";
import { pinnedClaraWorkBannerRe, pinnedClaraWorkBundleId } from "./pinned-work-bundle.mjs";
import { DB_NAME_SHAPE, allowedDbPattern, assertLocalDbGate } from "./local-db-gate.mjs";

const WORK_BUNDLE_ID = pinnedClaraWorkBundleId();
const WORK_BUNDLE_BANNER_RE = pinnedClaraWorkBannerRe();

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[ti-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

assertLocalDbGate({
  label: "trade-invoice-e2e",
  pattern: allowedDbPattern(
    `${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}|${DB_NAME_SHAPE.PER_TICKET}(?:_world)?|${DB_NAME_SHAPE.PER_LANE}`,
  ),
  checkDsnParsed: true,
});

const PORT = process.env.TI_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-ti-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "ti-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./work-journal-serve.mjs", import.meta.url));
// #980 · leg 7's window. The cancel lane's own bootstrap, spawned as-is.
const cancelServeScript = fileURLToPath(new URL("./work-cancel-serve.mjs", import.meta.url));
const GATE_DIR = fileURLToPath(new URL("./.trade-invoice-gates", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 10 * 60 * 1000;
setTimeout(() => {
  console.error(`\nTRADE INVOICE E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  delete base.CLARA_WORK_ASK_ONLY_CLIENT;
  delete base.CLARA_CHAT_TEST_BASIS;
  // #980 · the cancel harness's hold is opt-in the same way: an inherited gate would hold every
  // OTHER leg's model at a window it never asked for.
  delete base.CLARA_WORK_CANCEL_GATE;
  delete base.CLARA_WORK_CANCEL_HELD;
  return Object.assign(base, extra);
}

function spawnServe(extra = {}, script = serveScript) {
  const child = spawn(process.execPath, [script], { env: childEnv(extra), stdio: ["ignore", "pipe", "pipe"] });
  const state = { exited: false, exitInfo: null, banner: null, serving: null, stdout: "", stderr: "" };
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  const ingest = (line) => {
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
    if (/FATAL|Error:|exit_after_commit/.test(d)) process.stderr.write(`[child] ${d}`);
  });
  return { child, state };
}

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
    child.once("exit", () => { clearTimeout(t); resolve(); });
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
  try { parsed = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status, body: parsed };
}

/**
 * ONE HOLD GATE for leg 7: the path tests/work-cancel-serve.mjs polls, and the marker it writes on
 * arrival. Lifted from tests/work-cancel-e2e.mjs's `makeGate`, including the reason it waits for
 * a marker naming THIS Work: one supervisor serves every queued accounting Work, leftovers from
 * earlier legs included, so a bare "somebody is held" marker lets a leg act on another leg's Work.
 */
function makeGate(label) {
  mkdirSync(GATE_DIR, { recursive: true });
  const id = `${label}-${randomUUID().slice(0, 8)}`;
  const gate = join(GATE_DIR, `${id}.open`);
  const held = join(GATE_DIR, `${id}.held`);
  rmSync(gate, { force: true });
  rmSync(held, { force: true });
  return {
    env: { CLARA_WORK_CANCEL_GATE: gate, CLARA_WORK_CANCEL_HELD: held },
    // `open()` re-creates the directory first: it is the one call that MUST NOT throw (a held
    // child waits on this file forever), and the directory is shared with every other gate on
    // this rig. `mkdirSync(…, {recursive:true})` on an existing directory is a no-op.
    open: () => {
      mkdirSync(GATE_DIR, { recursive: true });
      writeFileSync(gate, "open");
    },
    async waitHeld(workId, deadlineMs = 120000) {
      const end = Date.now() + deadlineMs;
      let seen = "";
      while (Date.now() < end) {
        if (existsSync(held)) {
          seen = readFileSync(held, "utf8");
          if (seen.includes(workId)) return true;
        }
        await sleep(100);
      }
      throw new Error(`the model never reached the hold for work ${workId} (${id}); saw: ${seen}`);
    },
    cleanup: () => {
      rmSync(gate, { force: true });
      rmSync(held, { force: true });
    },
  };
}

const EXPENSE = "6300";
const SST = "6310";
const PAYABLE = "2000";
const BANK = "1150";

/** The WIRE invoice and basis the walk admits. Written out rather than derived from
 *  `lib/trade-invoice-basis.ts` on purpose: this file is a CONTRACT test of the HTTP door, and a
 *  fixture that shared the door's own builder could not tell a wrong derivation from a right one.
 *  The unit battery pins the builder; this pins the wire. */
function invoiceWire(counterpartyId, over = {}) {
  return {
    counterparty: { id: counterpartyId },
    documentDate: "2026-03-04",
    dueDate: "2026-04-15",
    dueDateSource: "stated",
    reference: "ALPHA-2026-0042",
    currency: "MYR",
    totalCents: 106000,
    taxFacts: { stated_code: "SR", stated_cents: 6000 },
    ...over,
  };
}

function basisWire(over = {}) {
  return {
    postingDate: "2026-03-31",
    memo: "Alpha Supplies bill, office paper and SST",
    currency: "MYR",
    lines: [
      { accountCode: EXPENSE, debitCents: 100000, creditCents: 0, description: "office supplies" },
      { accountCode: SST, debitCents: 6000, creditCents: 0, description: "SST on purchases" },
      { accountCode: PAYABLE, debitCents: 0, creditCents: 106000, description: "payable" },
    ],
    ...over,
  };
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regclass('clara.trade_invoices') is not null as invoices,
           to_regclass('clara.trade_invoice_status') is not null as ledger,
           to_regprocedure('clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)') is not null as admit,
           (select count(*)::int from pg_trigger
             where tgrelid='clara.journal_entries'::regclass and tgname='t_je_open_item_birth') as birth
  `);
  const p = probe.rows[0] ?? {};
  if (!p.invoices || !p.ledger || !p.admit || p.birth !== 1) {
    console.log("[ti-e2e] SKIPPED — migration 0225 (clara.trade_invoices + clara.admit_trade_invoice_work + t_je_open_item_birth) is not on this database");
    process.exit(0);
  }

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countReceipts = (work) =>
    rig.rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  const invoices = (client) =>
    rig.rootQuery(
      "select *, document_date::text as document_text, due_date::text as due_text"
      + " from clara.trade_invoices where client_id = $1 order by created_at", [client])
      .then((r) => r.rows);
  const ledger = (invoiceId) =>
    rig.rootQuery("select * from clara.trade_invoice_status where invoice_id = $1 order by recorded_at, state", [invoiceId])
      .then((r) => r.rows);
  const openItems = (client) =>
    rig.rootQuery(
      "select id, entry_id, domain, item_kind, amount_cents, counterparty_id,"
      + " item_date::text as item_date, due_date::text as due_date"
      + " from clara.open_items where client_id = $1 order by created_at", [client])
      .then((r) => r.rows);
  const tasksFor = (work) => rig.rootQuery("select id from clara.agent_tasks where work_id = $1", [work]).then((r) => r.rows);
  // #980 · the park's own row. Read as root because `clara_runtime` holds no SELECT on it and the
  // leg is measuring the ESTATE, not what one role can see.
  const questionsFor = (work) =>
    rig.rootQuery(
      "select id, question_version, status, delivery_state, answered_by, fields, answer"
      + " from clara.agent_interruptions where work_id = $1 order by question_version", [work])
      .then((r) => r.rows);
  const linesOf = (entry) =>
    rig.rootQuery("select * from clara.journal_lines where entry_id=$1 order by line_no", [entry]).then((r) => r.rows);

  async function seedClient(label, { termsDays = null } = {}) {
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
    if (termsDays !== null) {
      await rig.humanQuery(owner,
        "select clara.set_counterparty_terms(p_counterparty=>$1::uuid,p_days=>$2::integer,p_op_key=>$3::text) as r",
        [counterparty, termsDays, rig.opk("terms")]);
    }
    return { owner, firm, client, counterparty, jwt: await mint(owner) };
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
  // 1, 2, 3, 5: one long-lived engine.
  // =========================================================================
  const first = spawnServe();
  try {
    await waitReady(45000, first);
    assert.ok(first.state.banner, "the world-start banner names the serving bundle digest");
    console.log(`[ti-e2e] engine ready; serving bundle digest=${first.state.banner} (pin=${WORK_BUNDLE_ID})`);

    // ---- 1. admit -> run -> commit -> THE OPEN ITEM AT COMMIT --------------
    const one = await seedClient("ti-commit");
    const intent = randomUUID();
    const admitted = await api("POST", "/api/work/trade-invoice", {
      clientId: one.client, intentKey: intent, kind: "supplier_bill",
      invoice: invoiceWire(one.counterparty), basis: basisWire(),
    }, one.jwt);
    assert.equal(admitted.status, 202, `admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
    assert.equal(admitted.body.status, "queued");
    assert.equal(admitted.body.replayed, false);
    assert.ok(admitted.body.invoice_id, "the 202 NAMES the trade invoice it already wrote");
    assert.equal(admitted.body.kind, "supplier_bill");
    assert.equal(admitted.body.counterparty_id, one.counterparty, "…and the party the door RESOLVED");
    assert.equal(admitted.body.due_date, "2026-04-15");
    assert.equal(admitted.body.due_date_source, "stated");
    assert.equal(admitted.body.logical_op_id, `work:${admitted.body.work_id}:journal_entry:1`,
      "the server-assigned identity carries the UNWIDENED journal_entry purpose");

    const workId = admitted.body.work_id;
    // THE INVOICE ROW IS DURABLE BEFORE ANY RUN — it was written inside the admission transaction.
    const bornNow = await invoices(one.client);
    assert.equal(bornNow.length, 1, "exactly ONE trade invoice, born at ADMISSION");
    assert.equal(bornNow[0].work_id, workId);
    assert.deepEqual(await ledger(bornNow[0].id).then((rs) => rs.map((r) => r.state)), ["admitted"],
      "…and its status ledger says exactly that, before any run");

    const settled = await pollWork(workId, one.jwt, (b) => TERMINAL.has(b?.work?.status), "leg 1 commit");
    assert.equal(settled.work.status, "completed", `the Work completed (got ${JSON.stringify(settled.work)})`);
    assert.equal(await countEntries(one.client), 1, "exactly ONE entry");
    assert.equal(await countReceipts(workId), 1, "exactly ONE committed operation receipt");

    const inv = (await invoices(one.client))[0];
    const states = await ledger(inv.id);
    assert.deepEqual(states.map((r) => r.state).sort(), ["admitted", "posted"],
      "the receipt's own AFTER INSERT trigger appended the posted row");
    const posted = states.find((r) => r.state === "posted");
    assert.ok(posted.entry_id && posted.receipt_id, "…carrying BOTH the entry and the receipt");

    const lines = await linesOf(posted.entry_id);
    assert.equal(lines.length, 3, "Dr expense / Dr SST / Cr payable");
    const control = lines.find((l) => l.account_code === PAYABLE);
    assert.equal(control.counterparty_id, one.counterparty,
      "the posting core STAMPED the party on the control leg after the line insert");

    // THE THING ONLY A REAL WORLD CAN SHOW: the open item minted by a DEFERRED constraint trigger
    // at COMMIT, which no unit test and no in-transaction probe can observe.
    const items = await openItems(one.client);
    assert.equal(items.length, 1, "exactly ONE open item");
    assert.equal(items[0].domain, "ap");
    assert.equal(items[0].item_kind, "bill");
    assert.equal(String(items[0].amount_cents), "106000");
    assert.equal(items[0].counterparty_id, one.counterparty);
    assert.equal(items[0].due_date, "2026-04-15", "the STATED due date reached the item verbatim");
    assert.equal(items[0].entry_id, posted.entry_id);
    console.log("[ti-e2e] 1 OK — admit -> run -> commit -> entry + receipt + posted ledger + ONE AP open item");

    // ---- 2. a lost acknowledgement ----------------------------------------
    const replay = await api("POST", "/api/work/trade-invoice", {
      clientId: one.client, intentKey: intent, kind: "supplier_bill",
      invoice: invoiceWire(one.counterparty), basis: basisWire(),
    }, one.jwt);
    assert.equal(replay.status, 202, `replay 202 (got ${replay.status} ${JSON.stringify(replay.body)})`);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.work_id, workId, "the SAME Work");
    assert.equal(replay.body.invoice_id, inv.id, "…and the SAME trade invoice");
    assert.equal((await invoices(one.client)).length, 1, "no second invoice");
    assert.equal(await countEntries(one.client), 1, "no second entry");
    assert.equal(await countReceipts(workId), 1, "no second receipt");
    assert.equal((await openItems(one.client)).length, 1, "no second open item");
    assert.equal((await tasksFor(workId)).length, 1, "no second task");
    console.log("[ti-e2e] 2 OK — a lost acknowledgement resolves to ONE of everything");

    // ---- 3. a changed invoice under that key ------------------------------
    // The reference does NOT appear in the journal basis at all, so a conflict here can only come
    // from clara._trade_invoice_canonical comparing the PARTICULARS.
    const conflict = await api("POST", "/api/work/trade-invoice", {
      clientId: one.client, intentKey: intent, kind: "supplier_bill",
      invoice: invoiceWire(one.counterparty, { reference: "ALPHA-2026-0043" }), basis: basisWire(),
    }, one.jwt);
    assert.equal(conflict.status, 409, `a changed invoice is a 409 (got ${conflict.status} ${JSON.stringify(conflict.body)})`);
    // The shared `workErrorResponse` answers this one under `error`, with the EXISTING Work's id
    // beside it — "the work id is the whole point of this 409", so the surface can offer a link to
    // what was already submitted instead of a dead end.
    assert.equal(conflict.body.error, "intent_payload_conflict");
    assert.equal(conflict.body.work_id, workId, "…naming the Work leg 1 admitted");
    assert.equal((await invoices(one.client)).length, 1, "and it wrote nothing");
    console.log("[ti-e2e] 3 OK — a changed invoice under one key is a typed 409, from the particulars comparison");

    // ---- 5. the due-date basis, derived by the database --------------------
    const terms = await seedClient("ti-terms", { termsDays: 30 });
    const termsAdmitted = await api("POST", "/api/work/trade-invoice", {
      clientId: terms.client, intentKey: randomUUID(), kind: "supplier_bill",
      invoice: invoiceWire(terms.counterparty, { dueDate: null, dueDateSource: "absent" }),
      basis: basisWire(),
    }, terms.jwt);
    assert.equal(termsAdmitted.status, 202, `terms admission 202 (got ${termsAdmitted.status} ${JSON.stringify(termsAdmitted.body)})`);
    // THE BROWSER SAID 'absent'; THE DATABASE KNEW BETTER, and the 202 hands back what it decided.
    assert.equal(termsAdmitted.body.due_date_source, "counterparty_terms",
      "the door derived the basis from the party's agreed terms — the browser could not have");
    // R-A: document_date 2026-03-04 + 30 = 2026-04-03. The posting date is 2026-03-31, 27 days
    // later, so this number names the anchor rather than agreeing with both.
    assert.equal(termsAdmitted.body.due_date, "2026-04-03", "document_date 2026-03-04 + 30 days");
    const termsSettled = await pollWork(termsAdmitted.body.work_id, terms.jwt,
      (b) => TERMINAL.has(b?.work?.status), "leg 5 commit");
    assert.equal(termsSettled.work.status, "completed");
    const termsItems = await openItems(terms.client);
    assert.equal(termsItems.length, 1);
    assert.equal(termsItems[0].due_date, "2026-04-03",
      "…and the DERIVED due date reached the open item, so the aging surface reads what the terms say");
    console.log("[ti-e2e] 5 OK — stated -> counterparty_terms -> absent is the DATABASE's derivation, end to end");
  } finally {
    first.child.kill("SIGTERM");
    await waitExit(first.child).catch(() => { /* best effort */ });
  }

  // =========================================================================
  // 4: a crash after commit, before checkpoint.
  // =========================================================================
  const four = await seedClient("ti-crash");
  const crashIntent = randomUUID();
  let crashWork = null;
  const crasher = spawnServe({ CLARA_WORK_TEST_FAULT: "exit_after_commit" });
  try {
    await waitReady(45000, crasher);
    const a = await api("POST", "/api/work/trade-invoice", {
      clientId: four.client, intentKey: crashIntent, kind: "supplier_bill",
      invoice: invoiceWire(four.counterparty), basis: basisWire(),
    }, four.jwt);
    assert.equal(a.status, 202, `crash-leg admission 202 (got ${a.status} ${JSON.stringify(a.body)})`);
    crashWork = a.body.work_id;
    // The engine exits the instant the database returns a receipt (claraWork.v4.tools.ts:310-313).
    await waitExit(crasher.child, 120000);
    console.log(`[ti-e2e] 4 — engine exited mid-run: ${JSON.stringify(crasher.state.exitInfo)}`);
  } finally {
    crasher.child.kill("SIGKILL");
    await waitExit(crasher.child).catch(() => { /* already gone */ });
  }

  // THE EFFECT IS ALREADY ON THE BOOKS, even though nothing checkpointed.
  assert.equal(await countEntries(four.client), 1, "the committed entry survived the crash");
  assert.equal(await countReceipts(crashWork), 1, "…with ONE committed receipt");
  const crashItems = await openItems(four.client);
  assert.equal(crashItems.length, 1,
    "…and ONE open item — written by a DEFERRED constraint trigger at COMMIT, so it survived the window too");

  const respawn = spawnServe();
  try {
    await waitReady(45000, respawn);
    const settled = await pollWork(crashWork, four.jwt, (b) => TERMINAL.has(b?.work?.status), "leg 4 respawn");
    assert.equal(settled.work.status, "completed", "the respawned run settled the SAME Work");
    assert.equal(await countEntries(four.client), 1, "STILL exactly ONE entry after the replay");
    assert.equal(await countReceipts(crashWork), 1, "STILL exactly ONE committed receipt");
    assert.equal((await invoices(four.client)).length, 1, "STILL exactly ONE trade invoice");
    assert.equal((await openItems(four.client)).length, 1, "STILL exactly ONE open item");
    console.log("[ti-e2e] 4 OK — exit_after_commit then respawn yields ONE receipt and ONE open item");
  } finally {
    respawn.child.kill("SIGTERM");
    await waitExit(respawn.child).catch(() => { /* best effort */ });
  }

  // =========================================================================
  // 6: a replay that lands while the Work is PARKED on a clarifying question.
  //
  // #655 AC4 built the convergence lane-agnostically — a duplicate, lost or restarted submission
  // resolves to exactly ONE receipt — and `tests/control-work-question.test.mjs` is green on the
  // park itself. What had never been driven is the two together ON THIS LANE: a replay arriving
  // while the run is blocked on a human, and the outcome once that human answers.
  // =========================================================================
  const six = await seedClient("ti-park");
  const sixOther = await seedClient("ti-park-bystander");
  const parkIntent = randomUUID();
  const parked = spawnServe({ CLARA_WORK_TEST_SCRIPT: "ask_question", CLARA_WORK_ASK_ONLY_CLIENT: six.client });
  let bystanderWork = null;
  try {
    await waitReady(45000, parked);

    // ---- THE BYSTANDER, admitted FIRST and deliberately not this leg's ----
    //
    // Reviewed finding (L10-A3). ONE supervisor serves every queued accounting Work on the
    // database — leftovers from earlier legs and from earlier crashed runs included; leg 7's
    // `makeGate` already says so and gates its marker on the Work id. The `ask_question` script
    // had no such gate, so it asked on WHATEVER Work this engine picked up, and a foreign Work
    // parked on a question nobody is holding never terminalises: `awaiting_input` is a state no
    // leg polls out of, so the next leg times out instead of measuring anything. Three such rows
    // were left on this rig's database by exactly that path.
    //
    // So the script now asks only on the client this leg admitted, and this Work — a real one,
    // served by the same engine, in the same window — is the cell that says so.
    const bystander = await api("POST", "/api/work/trade-invoice", {
      clientId: sixOther.client, intentKey: randomUUID(), kind: "supplier_bill",
      invoice: invoiceWire(sixOther.counterparty), basis: basisWire(),
    }, sixOther.jwt);
    assert.equal(bystander.status, 202,
      `leg 6 bystander admission 202 (got ${bystander.status} ${JSON.stringify(bystander.body)})`);
    bystanderWork = bystander.body.work_id;

    const admitted = await api("POST", "/api/work/trade-invoice", {
      clientId: six.client, intentKey: parkIntent, kind: "supplier_bill",
      invoice: invoiceWire(six.counterparty), basis: basisWire(),
    }, six.jwt);
    assert.equal(admitted.status, 202, `leg 6 admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
    const workId = admitted.body.work_id;
    const invoiceId = admitted.body.invoice_id;

    // ---- the run asks and parks ------------------------------------------
    const question = await (async () => {
      const end = Date.now() + 90000;
      while (Date.now() < end) {
        const pending = (await questionsFor(workId)).find((r) => r.status === "pending");
        if (pending) return pending;
        await sleep(250);
      }
      throw new Error("leg 6: the run never asked a question");
    })();
    assert.equal(question.question_version, 1, "leg 6: the first question on a Work is version 1");
    assert.deepEqual(
      question.fields.map((f) => [f.key, f.kind, f.required]),
      [["posting_date", "date", true], ["amount_cents", "money", true]],
      "leg 6: the harness's typed fields are stored verbatim — if the shared script changes its "
      + "question, this pin says so rather than the answer below silently failing validation",
    );
    const blocked = await api("GET", `/api/work/${workId}`, undefined, six.jwt);
    assert.equal(blocked.body.work.status, "awaiting_input", "leg 6: the Work is honest about being blocked");
    assert.equal(await countEntries(six.client), 0, "leg 6: a parked run has posted nothing");
    assert.deepEqual((await ledger(invoiceId)).map((r) => r.state), ["admitted"],
      "leg 6: …and the invoice ledger says exactly that");

    // ---- THE REPLAY LANDS IN THE WINDOW ----------------------------------
    const replayWhileParked = await api("POST", "/api/work/trade-invoice", {
      clientId: six.client, intentKey: parkIntent, kind: "supplier_bill",
      invoice: invoiceWire(six.counterparty), basis: basisWire(),
    }, six.jwt);
    assert.equal(replayWhileParked.status, 202,
      `leg 6 parked replay 202 (got ${replayWhileParked.status} ${JSON.stringify(replayWhileParked.body)})`);
    assert.equal(replayWhileParked.body.replayed, true, "leg 6: the parked replay is a REPLAY, not a second admission");
    assert.equal(replayWhileParked.body.work_id, workId, "leg 6: the SAME Work");
    assert.equal(replayWhileParked.body.invoice_id, invoiceId, "leg 6: …and the SAME trade invoice");
    assert.equal((await tasksFor(workId)).length, 1, "leg 6: the replay minted no second task");
    assert.equal((await invoices(six.client)).length, 1, "leg 6: …no second invoice");
    assert.equal((await questionsFor(workId)).length, 1, "leg 6: …and it did not re-ask the question");
    const still = await api("GET", `/api/work/${workId}`, undefined, six.jwt);
    assert.equal(still.body.work.status, "awaiting_input", "leg 6: the replay did not un-park the Work");

    // ---- the human answers, and the run resumes --------------------------
    const answer = await rig
      .humanQuery(six.owner, "select clara.answer_work_question($1::uuid,$2::int,$3::jsonb,$4::text) as r", [
        question.id, 1, JSON.stringify({ posting_date: "2026-03-31", amount_cents: 106000 }), `ti-${randomUUID()}`,
      ])
      .then((r) => r.rows[0].r);
    assert.equal(answer.status, "answered");
    assert.equal(answer.answered_by, six.owner);

    const settled = await pollWork(workId, six.jwt, (b) => TERMINAL.has(b?.work?.status), "leg 6 resume");
    assert.equal(settled.work.status, "completed",
      `leg 6: the answered Work completes (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
    assert.equal(await countEntries(six.client), 1, "leg 6: exactly ONE entry");
    assert.equal(await countReceipts(workId), 1, "leg 6: exactly ONE committed receipt");
    assert.equal((await invoices(six.client)).length, 1, "leg 6: exactly ONE invoice");
    assert.equal((await openItems(six.client)).length, 1, "leg 6: exactly ONE open item");
    assert.deepEqual((await ledger(invoiceId)).map((r) => r.state).sort(), ["admitted", "posted"],
      "leg 6: …and the ledger gained exactly one row");

    // ---- and a replay AFTER the answer converges on the same thing -------
    // The intent key is the caller's identity for this intent, and the park changed nothing about
    // that: a browser that lost the acknowledgement while the question was open, and presses again
    // after somebody else answered it, must reach the SAME receipt rather than a second bill.
    const replayAfter = await api("POST", "/api/work/trade-invoice", {
      clientId: six.client, intentKey: parkIntent, kind: "supplier_bill",
      invoice: invoiceWire(six.counterparty), basis: basisWire(),
    }, six.jwt);
    assert.equal(replayAfter.status, 202);
    assert.equal(replayAfter.body.work_id, workId, "leg 6: the post-answer replay names the SAME Work");
    assert.equal(replayAfter.body.replayed, true);
    assert.equal(await countEntries(six.client), 1, "leg 6: STILL exactly ONE entry");
    assert.equal(await countReceipts(workId), 1, "leg 6: STILL exactly ONE committed receipt");
    assert.equal((await openItems(six.client)).length, 1, "leg 6: STILL exactly ONE open item");

    // ---- …and the BYSTANDER was never asked ------------------------------
    // Same engine, same window, a different client: it must have taken the `post` branch and
    // settled on its own. If the script ever asks on any Work it picks up again, this reds on the
    // question count first and on the terminal second, in seconds rather than in a 90s timeout.
    assert.deepEqual(await questionsFor(bystanderWork), [],
      "leg 6: the ask_question script asked NOTHING of a Work this leg did not admit");
    const bystanderSettled = await pollWork(bystanderWork, sixOther.jwt,
      (b) => TERMINAL.has(b?.work?.status), "leg 6 bystander");
    assert.equal(bystanderSettled.work.status, "completed",
      `leg 6: the bystander Work ran to a terminal of its own (got ${bystanderSettled.work.status} / `
      + `${JSON.stringify(bystanderSettled.work.error)})`);
    assert.equal(await countEntries(sixOther.client), 1, "leg 6: …posting exactly ONE entry");
    console.log("[ti-e2e] 6 OK — parked on a question, replayed into the window, answered, ONE of everything; a foreign Work was never asked");
  } finally {
    parked.child.kill("SIGTERM");
    await waitExit(parked.child).catch(() => { /* best effort */ });
  }

  // =========================================================================
  // 7: an explicit cancel INSIDE the commit window.
  //
  // The window is tests/work-cancel-serve.mjs's hold, reused as-is: the model has read the chart,
  // its `record_journal_entry` call has not been made, the Work is `running` and the ledger is
  // untouched. That is where a human pressing Cancel actually lands.
  // =========================================================================
  const gate = makeGate("ti-cancel");
  const seven = await seedClient("ti-cancel");
  let cancelWork = null;
  const canceller = spawnServe(gate.env, cancelServeScript);
  try {
    await waitReady(45000, canceller);
    const admitted = await api("POST", "/api/work/trade-invoice", {
      clientId: seven.client, intentKey: randomUUID(), kind: "supplier_bill",
      invoice: invoiceWire(seven.counterparty), basis: basisWire(),
    }, seven.jwt);
    assert.equal(admitted.status, 202, `leg 7 admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
    cancelWork = admitted.body.work_id;
    const invoiceId = admitted.body.invoice_id;

    await gate.waitHeld(cancelWork);
    const live = await api("GET", `/api/work/${cancelWork}`, undefined, seven.jwt);
    assert.equal(live.body.work.status, "running", "leg 7: the run holds the Work while the model decides");
    assert.equal(await countEntries(seven.client), 0, "leg 7: nothing has been admitted to the ledger yet");

    const cancelled = await api("POST", `/api/work/${cancelWork}/cancel`, { opKey: `ti-cancel-${randomUUID()}` }, seven.jwt);
    assert.equal(cancelled.status, 200, `leg 7 cancel 200 (got ${cancelled.status} ${JSON.stringify(cancelled.body)})`);
    assert.equal(cancelled.body.cancelled, true);
    assert.equal(cancelled.body.status, "stopping", "leg 7: STOPPING — the terminal is not yet known");
    const stopping = await api("GET", `/api/work/${cancelWork}`, undefined, seven.jwt);
    assert.equal(stopping.body.work.status, "stopping", "leg 7: and the real route serves it");

    // Release the model. Its held tool call now meets the ordering boundary.
    gate.open();
    const settled = await pollWork(cancelWork, seven.jwt, (b) => TERMINAL.has(b?.work?.status), "leg 7 settles");
    assert.equal(settled.work.status, "cancelled",
      `leg 7: the Work terminalises CANCELLED (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
    assert.equal(settled.work.error?.reason, "cancelled", "leg 7: under the cancellation's own reason");

    // NO JOURNAL EFFECT, on every surface this lane writes to. The invoice row itself SURVIVES:
    // it was born inside the admission transaction, before any run, and a cancelled Work does not
    // retract an admitted intent — what it must never gain is the `posted` row the receipt's own
    // trigger appends, and the open item that a committed entry mints.
    assert.equal(await countEntries(seven.client), 0, "leg 7: ZERO entries");
    assert.equal(await countReceipts(cancelWork), 0, "leg 7: ZERO committed receipts");
    assert.equal((await openItems(seven.client)).length, 0, "leg 7: ZERO open items");
    const states = (await ledger(invoiceId)).map((r) => r.state);
    assert.ok(!states.includes("posted"),
      `leg 7: the invoice never reached posted (ledger: ${JSON.stringify(states)})`);
    assert.equal((await invoices(seven.client)).length, 1,
      "leg 7: the invoice admitted before the run is still there — a cancel is not a retraction");
    console.log(`[ti-e2e] 7 OK — cancelled inside the commit window; no journal effect (ledger: ${JSON.stringify(states)})`);
  } finally {
    gate.open();            // never leave a held child behind
    canceller.child.kill("SIGTERM");
    await waitExit(canceller.child).catch(() => { /* best effort */ });
    gate.cleanup();
    // NO recursive removal of GATE_DIR — reviewed finding L10-A5. `cleanup()` already removes
    // this gate's two files, and the directory is shared: a recursive rm here deletes a
    // concurrently running gate's files out from under it, and `open()` (which does not create
    // its parent) then throws ENOENT on the very path that keeps a held child from hanging.
  }

  console.log("[ti-e2e] PASS — all legs green");
  process.exit(0);
}

main().catch((err) => {
  console.error("[ti-e2e] FAILED:", err?.stack ?? err);
  process.exit(1);
});
