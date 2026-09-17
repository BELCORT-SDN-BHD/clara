// STANDALONE chatTurn_v19 e2e. NOT a `node --test` file: it SPAWNS scripts/serve.mjs (through
// tests/chat-turn-v19-serve.mjs, which installs the scripted model first) as a CHILD process, so
// the real Workflow World, the real HTTP boundary, the real pools and the real frozen bodies are
// all in the loop — the pattern tests/work-journal-e2e.mjs and tests/periodic-adjustment-e2e.mjs
// established. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   node tests/chat-turn-v19-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real World plus a real HTTP boundary:
//
//   1. THE CHAT ENTRANCE #643 LEFT OPEN, END TO END. One HTTP session, one HTTP turn, the frozen
//      chatTurn_v19 body, the frozen `start_periodic_adjustment_work` tool,
//      `clara.admit_periodic_adjustment_work` under `withRuntime`, and then the reconciler's
//      `accounting_work` arm — which is the ONLY thing that can dispatch a chat-admitted Work,
//      because a frozen file may not import the registry to call `start()`. The Work carries the
//      periodic purpose, `clara_interpreted`, a `chat_task` source ref naming the REAL task and
//      session, and typed particulars on `adjustment_basis`; the run posts one approved entry with
//      the derived lines, one committed receipt, and one `clara.periodic_adjustments` row.
//
//   2. IT MINTS NO claraWork BUNDLE OF ITS OWN — it runs whatever body the IMAGE pins, byte for
//      byte (written at `clara-work/v2`; #631 repointed the class to v3 in wave 3 and the wave
//      2026-09-15 cut to v4, and the assertions read the BANNER and the registry's own pin rather
//      than a version typed here). Two independent measurements. The Work's own `bundle.digest`
//      equals the digest the process logged at world start — the same bundle a documentless
//      journal entry is served by, no bundle of its own, no new closure. AND the run's
//      model never saw the particulars: the child scans every run prompt for `adjustment_basis`,
//      `particulars_source`, `count_reference`, `inventory_account_code` and `obligation_kind` and
//      prints one line if it ever finds them. The assertion is that the line never appeared, with
//      the posted entry standing as the positive control that the admitted BASIS did reach it
//      (a run that saw nothing would have posted nothing).
//
//   3. THE GOVERNED CAPTURE #644 LEFT OPEN. The same turn's second act calls
//      `remember_client_information`, which lands exactly ONE `clara.knowledge_records` revision
//      through `clara.capture_knowledge_for` — asserted through the HUMAN read door
//      `clara.list_client_knowledge`, under the owner's own claims, because a row only this test's
//      superuser connection could see would prove nothing about what a professional can read.
//      The record names the human as `asserted_by`, carries the trust the DATABASE derived from
//      the source kind, and is stamped `recorded_via = 'clara_runtime'`.
//
//   4. THE TWO CARDS ARE ON THE TRANSCRIPT, DURABLY. `work_accepted` (with the PERIODIC purpose
//      v18's tool never emits) and `knowledge_receipt` are both in the settled turn's
//      `clara.chat_messages.parts`, so a human reloading the conversation days later still sees
//      what Clara did.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent shared with its siblings), and
// the file SKIPS CLEANLY when migration 0194 OR 0192 is absent — v19 wires both halves, and a
// green e2e against a database missing either would be a lie.

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
  console.log("[v19-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate. BYTE-IDENTICAL to `work-journal-e2e.mjs`'s and
// `periodic-adjustment-e2e.mjs`'s, deliberately: this file spawns the same server against the same
// throwaway databases, and a gate that admitted one more name here would be a second, looser answer
// to one question.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("chat-turn-v19-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("chat-turn-v19-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}
{
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("chat-turn-v19-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.V19_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-v19-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "v19-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("./chat-turn-v19-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;
/** The child's own probe line, spelled here too — the two files cannot import each other (the
 *  bootstrap boots a server on import), so the literal is duplicated and asserted in both. */
const PARTICULARS_LEAK_LINE = "[v19-serve] ADJUSTMENT PARTICULARS REACHED THE RUN PROMPT";

const WATCHDOG_MS = 10 * 60 * 1000;
setTimeout(() => {
  console.error(`\nCHAT TURN V19 E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  const state = { exited: false, banner: null, serving: null, particularsLeaked: false, stdout: "", stderr: "" };
  child.on("exit", () => {
    state.exited = true;
  });
  // LINE-BUFFERED, never per chunk — see waitBooted's header for why.
  const ingest = (line) => {
    // THE SERVING BUNDLE, which at this tip is v3: #631 repointed `workflows.claraWork` v2 -> v3 in
    // the same wave that merged this file. The claim the legs below make is UNCHANGED — a chat-
    // admitted Work runs on the image's OWN claraWork bundle, whatever version that is, and the
    // typed particulars never reach its prompt — so the digest is read from the banner rather than
    // pinned to a version here.
    const m = WORK_BUNDLE_BANNER_RE.exec(line);
    if (m && !state.banner) state.banner = m[1];
    if (!state.serving) {
      const serving = /\[clara-runtime\] serving .*/.exec(line);
      if (serving) state.serving = serving[0];
    }
    if (line.includes(PARTICULARS_LEAK_LINE)) {
      state.particularsLeaked = true;
      process.stderr.write(`[child] ${line}\n`);
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

const INVENTORY = "1200";
const COST = "5040";

/** The model's tool input, in the frozen schema's own snake_case. Written out rather than derived
 *  from `lib/periodic-adjustment-basis.ts`: this file is a CONTRACT test of the whole path, and a
 *  fixture sharing the builder could not tell a wrong derivation from a right one. */
const ADJUSTMENT_INPUT = {
  purpose: "periodic_stock_adjustment",
  period_start: "2026-01-01",
  period_end: "2026-12-31",
  instruction: "Posting the 2026 year-end stocktake the client's supervisor signed off.",
  method: "opening_closing_count",
  opening_cents: 400000,
  closing_cents: 650000,
  counted_at: "2026-12-31",
  count_reference: "STOCKTAKE-2026-12",
  inventory_account_code: INVENTORY,
  cost_account_code: COST,
};

const KNOWLEDGE_INPUT = {
  knowledge_key: "trade_nature",
  value: "services",
  source_kind: "user_statement",
  basis: "the client's director said so in this conversation while we were posting the stocktake",
};

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regclass('clara.periodic_adjustments') is not null as pa_tbl,
           to_regprocedure('clara.admit_periodic_adjustment_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)') is not null as pa_admit,
           to_regclass('clara.knowledge_records') is not null as kn_tbl,
           to_regprocedure('clara.capture_knowledge_for(uuid,uuid,text,jsonb,text,text,text,jsonb,date,date,jsonb,text)') is not null as kn_capture,
           to_regprocedure('clara.get_knowledge_pack(uuid,text,uuid)') is not null as kn_pack
  `);
  const p = probe.rows[0] ?? {};
  if (!p.pa_tbl || !p.pa_admit) {
    console.log("[v19-e2e] SKIPPED — migration 0194 (clara.periodic_adjustments + clara.admit_periodic_adjustment_work) is not on this database");
    process.exit(0);
  }
  if (!p.kn_tbl || !p.kn_capture || !p.kn_pack) {
    console.log("[v19-e2e] SKIPPED — migration 0192 (clara.knowledge_records + capture_knowledge_for + get_knowledge_pack) is not on this database");
    process.exit(0);
  }

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countReceipts = (work) =>
    rig
      .rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);

  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type] of [[INVENTORY, "Inventory / Stock", "asset"], [COST, "Cost of Sales", "expense"]]) {
      await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r", [
        client, code, name, type, rig.opk("acct"),
      ]);
    }
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

  const engine = spawnServe({
    CLARA_V19_ADJUSTMENT: JSON.stringify(ADJUSTMENT_INPUT),
    CLARA_V19_KNOWLEDGE: JSON.stringify(KNOWLEDGE_INPUT),
  });
  try {
    await waitReady(45000, engine);
    assert.ok(engine.state.banner, "the world-start banner names the serving bundle digest");
    console.log(`[v19-e2e] engine ready; serving bundle digest=${engine.state.banner}`);

    const one = await seedClient("v19-chat");

    // ---- one real chatTurn_v19 turn, two acts ----------------------------
    const session = await api("POST", "/api/chat/sessions", { clientId: one.client, title: "v19" }, one.jwt);
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
          text: "closing stock was 6,500.00 against an opening 4,000.00 for 2026 — post the stocktake, and note they are a services business",
        }],
      },
      one.jwt,
    );
    assert.equal(turn.status, 202, `the turn is accepted (got ${turn.status} ${JSON.stringify(turn.body)})`);
    const chatTaskId = turn.body.task_id;
    assert.ok(chatTaskId, "and it names the chat task");

    // ---- 1. the Work the frozen tool admitted ----------------------------
    let work = null;
    while (Date.now() - startedAt < 90000) {
      const r = await rig.rootQuery("select * from clara.accounting_work where client_id = $1", [one.client]);
      if (r.rows.length > 0) {
        work = r.rows[0];
        break;
      }
      await sleep(250);
    }
    assert.ok(work, "the chat turn admitted a Work through clara.admit_periodic_adjustment_work");
    assert.equal(work.purpose, "periodic_stock_adjustment", "the PERIODIC purpose, not journal_entry");
    assert.equal(work.initiator, one.owner, "admitted for the HUMAN who was talking, not a service identity");
    assert.equal(work.basis_origin, "clara_interpreted", "a chat-originated basis is labelled INTERPRETED, never user_direct");
    assert.equal(work.source_refs.length, 1, "one source ref");
    assert.equal(work.source_refs[0].kind, "chat_task");
    assert.equal(String(work.source_refs[0].task_id), String(chatTaskId), "the ref points at the REAL chat task");
    assert.equal(String(work.source_refs[0].session_id), String(sessionId), "read off the task, never from a model argument");
    assert.equal(work.logical_op_id, `work:${work.id}:periodic_stock_adjustment:1`, "the server-assigned identity names the PURPOSE");
    assert.ok(/^[0-9a-f]{64}$/.test(work.basis_digest), "the DATABASE derived the digest — the tool never sends one");

    // The typed particulars, on the column 0194 put them on, in the DATABASE's own spelling.
    assert.ok(work.adjustment_basis, "the Work carries typed particulars");
    assert.equal(work.adjustment_basis.method, "opening_closing_count");
    assert.equal(Number(work.adjustment_basis.adjustment_cents), 250000, "closing minus opening, in exact cents");
    assert.equal(work.adjustment_basis.inventory_account_code, INVENTORY);
    assert.equal(work.adjustment_basis.cost_account_code, COST);
    assert.equal(work.adjustment_basis.count_reference, "STOCKTAKE-2026-12");
    assert.equal(work.adjustment_basis.currency, "MYR");
    // The DERIVED basis — the lines the particulars imply, which the run will echo.
    assert.deepEqual(
      work.basis.lines.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
      [[INVENTORY, 250000, 0], [COST, 0, 250000]],
      "a rise DEBITS inventory and CREDITS cost of sales, in exact cents",
    );

    const done = await pollWork(work.id, one.jwt, (b) => TERMINAL.has(b.work.status), "v19 work settles", 90000);
    const latencyMs = Date.now() - startedAt;
    assert.equal(done.work.status, "completed", `the reconciler dispatched it and it completed (got ${done.work.status} / ${JSON.stringify(done.work.error)})`);
    assert.ok(done.work.result?.entry_id, "with a posted entry");
    assert.equal(await countEntries(one.client), 1, "EXACTLY ONE journal entry for this client");
    assert.equal(await countReceipts(work.id), 1, "and EXACTLY ONE committed operation receipt");

    const entry = await rig.rootQuery("select status, origin, document_id, flags from clara.journal_entries where id = $1", [done.work.result.entry_id]);
    assert.equal(entry.rows[0].status, "approved", "posted approved, not left as a draft");
    assert.equal(entry.rows[0].document_id, null, "documentless — a chat basis is not a document and none is invented");
    assert.ok(entry.rows[0].flags && entry.rows[0].flags.closing_stock !== undefined,
      `the entry carries the closing_stock marker the close gate reads (flags=${JSON.stringify(entry.rows[0].flags)})`);

    const adjustment = await rig.rootQuery("select * from clara.periodic_adjustments where client_id = $1", [one.client]);
    assert.equal(adjustment.rows.length, 1, "exactly ONE periodic_adjustments row");
    assert.equal(Number(adjustment.rows[0].amount_cents), 250000, "carrying the exact signed movement");
    assert.equal(String(adjustment.rows[0].entry_id), String(done.work.result.entry_id), "and naming the entry beside it");
    console.log(`[v19-e2e] PASS 1: a real chatTurn_v19 turn admitted a periodic-adjustment Work and the reconciler ran it to a posted entry in ${latencyMs}ms`);

    // ---- 2. the IMAGE's OWN claraWork body, byte for byte (v2 when written; whatever the
    //         registry pins now) ---------------------------------------------------------------
    assert.equal(done.work.bundle?.digest, engine.state.banner,
      "the Work records the digest the process logged — the SAME claraWork bundle a documentless journal entry"
      + " runs on, read from the banner rather than pinned to a version typed here");
    assert.equal(done.work.bundle?.id, WORK_BUNDLE_ID,
      "…and it is the bundle the REGISTRY pins, which is what makes 'the image's own body' a measurement rather than a hope");
    assert.equal(engine.state.particularsLeaked, false,
      "the run's model NEVER saw adjustment_basis, particulars_source, count_reference, inventory_account_code or obligation_kind "
      + "— the particulars ride a column the run does not read (the posted entry above is the positive control that the BASIS did reach it)");
    console.log(`[v19-e2e] PASS 2: the periodic-adjustment Work ran the image's own unchanged claraWork bundle (${engine.state.banner.slice(0, 12)}…), and its particulars never reached the run's prompt`);

    // ---- 3. the governed capture, read through the HUMAN door ------------
    let records = [];
    const capturedBy = Date.now() + 90000;
    while (Date.now() < capturedBy) {
      const r = await rig.humanQuery(one.owner, "select clara.list_client_knowledge($1::uuid) as pack", [one.client]);
      records = (r.rows[0]?.pack?.records ?? []).filter((x) => x.source_kind !== "legacy_client_fact");
      if (records.length > 0) break;
      await sleep(250);
    }
    assert.equal(records.length, 1, `exactly ONE knowledge record, read through clara.list_client_knowledge (got ${JSON.stringify(records)})`);
    const record = records[0];
    assert.equal(record.knowledge_key, "trade_nature");
    assert.equal(record.value, "services", "the human's own answer, unchanged");
    assert.equal(record.source_kind, "user_statement");
    assert.equal(record.trust, "asserted", "the trust is DERIVED from the source kind by the database, never supplied by the tool");
    assert.equal(record.state, "live");
    assert.equal(String(record.asserted_by), String(one.owner), "the door names the HUMAN whose statement it is — the runtime never impersonates");
    assert.equal(record.recorded_via, "clara_runtime", "and stamps the lane that wrote it");
    assert.equal(record.revision_n, 1);
    assert.ok(/^\d+$/.test(String(record.knowledge_version)), "the watermark rides as TEXT, never as a JSON number");
    console.log("[v19-e2e] PASS 3: remember_client_information landed ONE governed record, readable through the human door");

    // ---- 4. both cards are on the durable transcript ---------------------
    let parts = [];
    const partsBy = Date.now() + 60000;
    while (Date.now() < partsBy) {
      const r = await rig.rootQuery(
        "select parts from clara.chat_messages where session_id = $1 and role = 'assistant' order by seq desc limit 1",
        [sessionId],
      );
      parts = r.rows[0]?.parts ?? [];
      if (parts.some((x) => x.type === "work_accepted") && parts.some((x) => x.type === "knowledge_receipt")) break;
      await sleep(250);
    }
    const accepted = parts.filter((x) => x.type === "work_accepted");
    const receipts = parts.filter((x) => x.type === "knowledge_receipt");
    assert.equal(accepted.length, 1, `exactly ONE work_accepted card (parts=${JSON.stringify(parts.map((x) => x.type))})`);
    assert.equal(accepted[0].purpose, "periodic_stock_adjustment", "carrying the PURPOSE v18's tool never emits");
    assert.equal(String(accepted[0].work_id), String(work.id));
    assert.equal(accepted[0].logical_op_id, work.logical_op_id);
    assert.equal(receipts.length, 1, "exactly ONE knowledge_receipt card");
    assert.equal(String(receipts[0].record_id), String(record.record_id), "addressing the STABLE record identity, not the revision");
    assert.equal(receipts[0].knowledge_key, "trade_nature");
    assert.equal(String(receipts[0].client_id), String(one.client));
    assert.equal(receipts[0].revision_kind, "capture");
    console.log("[v19-e2e] PASS 4: both cards are in clara.chat_messages.parts — the transcript still shows them after a reload");
  } finally {
    engine.child.kill("SIGKILL");
    await sleep(250);
  }

  console.log("\nCHAT TURN V19 E2E: PASS (4 legs)");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nCHAT TURN V19 E2E: FAIL\n", err);
  process.exit(1);
});
