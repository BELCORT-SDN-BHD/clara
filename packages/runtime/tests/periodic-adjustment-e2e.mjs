// STANDALONE periodic-adjustment e2e (#643). NOT a `node --test` file: it SPAWNS scripts/serve.mjs
// (through tests/work-journal-serve.mjs, which installs the scripted model first) as a CHILD
// process, so the engine can be crashed mid-run and respawned against the SAME database — the
// pattern tests/interview-kill-resume-e2e.mjs established and tests/work-journal-e2e.mjs reuses.
// Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   node tests/periodic-adjustment-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real Postgres World plus a real HTTP boundary:
//   1. ADMIT -> RUN -> COMMIT, THROUGH THE UNCHANGED FROZEN BUNDLE. One POST to the new sibling
//      route produces one Work whose purpose is `periodic_stock_adjustment`, one run served by the
//      SAME claraWork body a documentless journal entry is served by — the bundle the REGISTRY
//      pins, read rather than retyped here — one approved entry
//      carrying the `closing_stock` marker the close gate reads, one `clara.operation_receipts`
//      row whose purpose is the Work's and whose `effects` name the adjustment, and one
//      `clara.periodic_adjustments` row with the exact signed movement. That the typed particulars
//      never reach the model is the whole design, and only a real run can show it: the envelope
//      the model echoes carries `basis` and nothing else.
//   2. A LOST ACKNOWLEDGEMENT. The same intentKey re-POSTed returns the SAME Work with
//      `replayed:true` and mints no second task, no second entry and no second adjustment.
//   3. A CHANGED SET OF PARTICULARS under that key is a 409 `intent_payload_conflict` naming the
//      Work leg 1 admitted — with the SAME lines and the SAME basis digest, so this is the one
//      leg that proves `clara._adjustment_basis_canonical` is actually in the comparison.
//   4. A CRASH AFTER COMMIT, BEFORE CHECKPOINT. `CLARA_WORK_TEST_FAULT=exit_after_commit` exits
//      the process the instant the database returns a receipt. On respawn the WDK re-executes the
//      step, the tool call REPLAYS onto the same logical identity, and exactly ONE entry, ONE
//      committed receipt and ONE adjustment row exist.
//   6. #643's UPLOAD/REFERENCE ENTRANCE. A Work admitted with `sourceRefs:[{kind:'document'}]` —
//      what the form's evidence chooser sends — reaches commit with an `entry_evidence_links` row
//      born inside the posting transaction, a receipt whose effects name the document, and a
//      `clara.periodic_adjustments.source_document_id` that keeps it; an UNFILED citation is a
//      typed 400 naming `sourceRefs[1]` / `not_filed`, which is the refusal the chooser renders.
//      Skipped cleanly when 0182 is absent.
//   5. A LOCKED PERIOD, THROUGH THE REAL BOUNDARY. A sealed fiscal year is refused at ADMISSION
//      with a typed 400 naming `adjustment.periodEnd` — the CLR19 mapping `workErrorStatus` gained
//      for this door, which unmapped answered a bare 500 for an ordinary, actionable refusal.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent shared with its sibling), and
// the file SKIPS CLEANLY when migration 0194 is absent — its runtime half merges alongside its DB
// half, and a green e2e against a database with no `clara.periodic_adjustments` would be a lie.

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
  console.log("[pa-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate. BYTE-IDENTICAL to `work-journal-e2e.mjs`'s, deliberately: this file
// spawns the same server, against the same throwaway databases, and a gate that admitted one more
// name here would be a second, looser answer to one question. That file's gate moved to admit the
// riders wave's per-lane `clara_l<NN>` (#980); this one moves with it, for the same reason and in
// the same shape, so the two stay one answer. Still loopback-only, still a parsed-DSN equality
// check against the PG env, still fail-closed on anything else.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci|l\d{2})$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error(
    "periodic-adjustment-e2e is hard-gated to a loopback host + PGDATABASE in "
    + "{clara_rt_test, clara_wave_b_ci, clara_l<NN>}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci|l[0-9][0-9])(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("periodic-adjustment-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci|l<NN>)");
}
{
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("periodic-adjustment-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.PA_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-pa-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "pa-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The SAME child bootstrap the journal e2e spawns: its default script reads the chart and then
// echoes the ADMITTED BASIS verbatim, which is exactly what a periodic-adjustment run does too —
// the particulars are on a column the run never reads.
const serveScript = fileURLToPath(new URL("./work-journal-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 10 * 60 * 1000;
setTimeout(() => {
  console.error(`\nPERIODIC ADJUSTMENT E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  const state = { exited: false, exitInfo: null, banner: null, serving: null, stdout: "", stderr: "" };
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  // READ LINE BY LINE, NOT CHUNK BY CHUNK. A `data` event is a slice of a pipe, not a promise of a
  // whole line: several console.log calls can arrive in one event, and one line can arrive split
  // across two. A per-chunk regex reads a banner cut by a chunk boundary as never logged — see
  // docs/plan/active/refresh-wave-2026-09-14/reports/wave2-ci-two-build-banner.md.
  const ingest = (line) => {
    // #631 REPOINTED IT AGAIN, v2 -> v3 (the egress gate and the execution trace), so the SERVING
    // banner is v3's. v1 and v2 still print for the parked-run census; this captures the one the
    // image DISPATCHES, which is the digest the Work row and the receipt record.
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

/**
 * WAIT FOR *THIS* ENGINE'S OWN BOOT — the thing `/ready` does not prove. `/ready`'s world conjunct
 * reads `clara.runtime_heartbeats`, one row per component for the WHOLE ESTATE, inside a 30s
 * staleness window (packages/runtime/lib/health.mjs:50,492-500): a freshly spawned engine on a
 * database a PREVIOUS engine was just serving can be answered 200 by that predecessor's beat before
 * it has printed a line of its own. The provenance line and the bundle banner are both logged only
 * after `await getWorld().start?.()` (plugins/startWorld.ts), so a raced assertion on either is a
 * false failure about a fine engine, not evidence anything is wrong — see
 * docs/plan/active/refresh-wave-2026-09-14/reports/wave2-ci-two-build-banner.md and
 * tests/two-build-cutover-e2e.mjs's `waitBooted`, whose idiom this mirrors for a single-bundle engine.
 * This file spawns three engines in turn (first, faulty, respawned) against the SAME database, so
 * every respawn after the first can borrow a predecessor's still-fresh beat.
 *
 * WAITING IS NOT WEAKENING: every fact this file asserted about the engine before, it still asserts
 * — only after the process could actually have logged it. An engine whose world never starts still
 * fails this wait, bounded, with its own stdout/stderr attached.
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
    + `\n  exit: ${JSON.stringify(engine.state.exitInfo)}`
    + `\n--- child stdout (tail) ---\n${engine.state.stdout || "(none)"}`
    + `\n--- child stderr (tail) ---\n${engine.state.stderr || "(none)"}`,
  );
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
  try {
    parsed = await r.json();
  } catch {
    /* non-JSON */
  }
  return { status: r.status, body: parsed };
}

const INVENTORY = "1200";
const COST = "5040";

/** The particulars the walk admits, and the lines they imply. Written out rather than derived from
 *  `lib/periodic-adjustment-basis.ts` on purpose: this file is a CONTRACT test of the HTTP door,
 *  and a fixture that shared the door's own builder could not tell a wrong derivation from a right
 *  one. The unit battery pins the builder; this pins the wire. */
function stockAdjustment(over = {}) {
  return {
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    method: "opening_closing_count",
    openingCents: 400000,
    closingCents: 650000,
    adjustmentCents: 250000,
    countedAt: "2026-12-31",
    countReference: "STOCKTAKE-2026-12",
    inventoryAccountCode: INVENTORY,
    costAccountCode: COST,
    instruction: "Posting the 2026 year-end stocktake the client's supervisor signed off.",
    ...over,
  };
}

function stockBasis(memo, cents = 250000) {
  return {
    postingDate: "2026-12-31",
    memo,
    currency: "MYR",
    lines: [
      { accountCode: INVENTORY, debitCents: cents, creditCents: 0, description: "stock movement" },
      { accountCode: COST, debitCents: 0, creditCents: cents, description: "cost of sales" },
    ],
  };
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regclass('clara.periodic_adjustments') is not null as pa_tbl,
           to_regprocedure('clara.admit_periodic_adjustment_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)') is not null as admit
  `);
  if (!probe.rows[0]?.pa_tbl || !probe.rows[0]?.admit) {
    console.log("[pa-e2e] SKIPPED — migration 0194 (clara.periodic_adjustments + clara.admit_periodic_adjustment_work) is not on this database");
    process.exit(0);
  }

  // #634's relation, probed separately: the evidence leg below is a claim about 0182 and this file
  // must skip it honestly on a database that predates it rather than red on a missing table.
  const EVIDENCE_READY = (await rig.rootQuery(
    "select to_regclass('clara.entry_evidence_links') is not null as ok")).rows[0]?.ok === true;

  /** One byte-verified document, actively filed to this client — the estate's own seeding verb, the
   *  same one `work-journal-e2e.mjs` uses. An unverified upload is not evidence
   *  (`clara._journal_document_filed`'s custody floor), so a hand-written INSERT here would be
   *  seeding a state the door refuses by name. */
  const seedFiledDocument = async (firm, client, tag) => {
    const sha256 = (randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 64);
    const r = await rig.rootQuery(
      `select clara._seed_verified_document(
         p_firm => $1::uuid, p_client => $2::uuid, p_sha256 => $3::text, p_filename => $4::text,
         p_mime => 'application/pdf', p_bytes => 1024::bigint, p_storage_path => $5::text,
         p_document_kind => 'other') as receipt`,
      [firm, client, sha256, `${tag}.pdf`, `firms/${firm}/docs/${sha256}.pdf`],
    );
    return r.rows[0].receipt.document_id;
  };

  const countEntries = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const countReceipts = (work) =>
    rig
      .rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  const adjustments = (client) =>
    rig.rootQuery("select * from clara.periodic_adjustments where client_id = $1 order by created_at", [client]).then((r) => r.rows);
  const readWork = (id) => rig.rootQuery("select * from clara.accounting_work where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const tasksFor = (work) =>
    rig.rootQuery("select id from clara.agent_tasks where work_id = $1", [work]).then((r) => r.rows);

  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type] of [["1200", "Inventory / Stock", "asset"], ["5040", "Cost of Sales", "expense"]]) {
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

  // =========================================================================
  // 1-3, 5: one long-lived engine.
  // =========================================================================
  const first = spawnServe();
  try {
    await waitReady(45000, first);
    assert.ok(first.state.banner, "the world-start banner names the serving bundle digest");
    console.log(`[pa-e2e] engine ready; serving bundle digest=${first.state.banner}`);

    // ---- 1. admit -> run -> commit ---------------------------------------
    const one = await seedClient("pa-commit");
    const intent = randomUUID();
    const admitted = await api("POST", "/api/work/periodic-adjustment", {
      clientId: one.client,
      intentKey: intent,
      purpose: "periodic_stock_adjustment",
      basis: stockBasis("2026 stocktake"),
      adjustment: stockAdjustment(),
    }, one.jwt);
    assert.equal(admitted.status, 202, `admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
    assert.equal(admitted.body.status, "queued");
    assert.equal(admitted.body.replayed, false);
    assert.equal(admitted.body.logical_op_id, `work:${admitted.body.work_id}:periodic_stock_adjustment:1`,
      "the server-assigned identity names the PURPOSE");

    const workId = admitted.body.work_id;
    const admittedRow = await readWork(workId);
    assert.equal(admittedRow.purpose, "periodic_stock_adjustment");
    assert.ok(admittedRow.adjustment_basis, "the typed particulars live on the WORK ROW");
    assert.equal(admittedRow.adjustment_basis.method, "opening_closing_count");
    assert.equal(admittedRow.adjustment_basis.currency, "MYR");
    assert.equal(admittedRow.basis.method, undefined,
      "…and NOT in `basis` — the basis is what the run echoes through a FROZEN schema that knows nothing about them");

    const settled = await pollWork(workId, one.jwt, (b) => TERMINAL.has(b.work.status), "first commit");
    assert.equal(settled.work.status, "completed", `the run settles completed (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
    assert.equal(settled.work.bundle?.id, WORK_BUNDLE_ID,
      "…served by the image’s PINNED claraWork bundle: nothing about this lane minted a bundle of its own");

    assert.equal(await countEntries(one.client), 1, "exactly ONE journal entry");
    assert.equal(await countReceipts(workId), 1, "exactly ONE committed operation receipt");
    const entry = (await rig.rootQuery(
      "select id, status, flags, posting_date::text as posting_date from clara.journal_entries where client_id=$1", [one.client])).rows[0];
    assert.equal(entry.status, "approved");
    assert.equal(entry.posting_date, "2026-12-31", "the EXACT supplied posting date, never a timezone-shifted one");
    assert.ok(entry.flags && Object.prototype.hasOwnProperty.call(entry.flags, "closing_stock"),
      "the posted entry carries the marker the close gate reads — the producer C-29 asks for");

    const receipt = (await rig.rootQuery(
      "select * from clara.operation_receipts where work_id=$1 and outcome='committed'", [workId])).rows[0];
    assert.equal(receipt.purpose, "periodic_stock_adjustment", "the receipt's purpose is the Work's");
    assert.equal(receipt.effects.entry_id, entry.id);
    assert.ok(receipt.effects.adjustment_id, "the receipt NAMES its adjustment");

    const rows = await adjustments(one.client);
    assert.equal(rows.length, 1, "exactly ONE clara.periodic_adjustments row");
    assert.equal(rows[0].id, receipt.effects.adjustment_id);
    assert.equal(String(rows[0].amount_cents), "250000", "the EXACT signed movement");
    assert.equal(rows[0].entry_id, entry.id);
    assert.equal(rows[0].receipt_id, receipt.id);
    assert.equal(rows[0].basis.count_reference, "STOCKTAKE-2026-12", "…and the counted particulars, verbatim");
    console.log("[pa-e2e] PASS 1: admit -> run -> commit; one entry (marked), one receipt, one adjustment, frozen bundle unchanged");

    // ---- 2. lost acknowledgement -----------------------------------------
    const tasksBefore = (await tasksFor(workId)).length;
    const replay = await api("POST", "/api/work/periodic-adjustment", {
      clientId: one.client,
      intentKey: intent,
      purpose: "periodic_stock_adjustment",
      basis: stockBasis("2026 stocktake"),
      adjustment: stockAdjustment(),
    }, one.jwt);
    assert.equal(replay.status, 202);
    assert.equal(replay.body.replayed, true, "the SAME intent key resolves to the Work it already admitted");
    assert.equal(replay.body.work_id, workId);
    assert.equal((await tasksFor(workId)).length, tasksBefore, "no second run");
    assert.equal(await countEntries(one.client), 1, "no second entry");
    assert.equal((await adjustments(one.client)).length, 1, "no second adjustment");
    console.log("[pa-e2e] PASS 2: a lost acknowledgement replays onto the same Work");

    // ---- 3. a CHANGED set of particulars under that key --------------------
    //
    // THE LINES AND THE MEMO ARE IDENTICAL, so `basis_digest` is identical too. Only the PERIOD
    // moved. Without `clara._adjustment_basis_canonical` in the comparison this would answer
    // `replayed:true` and the changed period would silently vanish.
    const conflict = await api("POST", "/api/work/periodic-adjustment", {
      clientId: one.client,
      intentKey: intent,
      purpose: "periodic_stock_adjustment",
      basis: stockBasis("2026 stocktake"),
      adjustment: stockAdjustment({ periodStart: "2025-01-01", periodEnd: "2025-12-31", countedAt: "2025-12-31" }),
    }, one.jwt);
    assert.equal(conflict.status, 409, `a changed set of particulars is a conflict (got ${conflict.status} ${JSON.stringify(conflict.body)})`);
    assert.equal(conflict.body.error, "intent_payload_conflict");
    assert.equal(conflict.body.work_id, workId, "…and the 409 NAMES the Work that key already holds");
    assert.equal(await countEntries(one.client), 1, "no second effect");
    console.log("[pa-e2e] PASS 3: the typed particulars are in the intent-payload comparison, not only the basis digest");

    // ---- 5. a LOCKED PERIOD, refused at ADMISSION with a typed 400 --------
    const sealed = await seedClient("pa-sealed");
    await rig.rootQuery(
      `insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal, status,
          fy_end_source, opened_by)
       values((select firm_id from clara.clients where id=$1), $1, '#643 sealed', '2026-01-01',
          '2026-12-31', 1, 'closed', 'asserted', $2)`,
      [sealed.client, sealed.owner]);
    const locked = await api("POST", "/api/work/periodic-adjustment", {
      clientId: sealed.client,
      intentKey: randomUUID(),
      purpose: "periodic_stock_adjustment",
      basis: stockBasis("into a sealed year"),
      adjustment: stockAdjustment(),
    }, sealed.jwt);
    assert.equal(locked.status, 400,
      `a sealed year is a NAMED refusal, never a bare 500 (got ${locked.status} ${JSON.stringify(locked.body)})`);
    assert.equal(locked.body.reason, "write_into_closed_period");
    assert.equal(locked.body.field, "adjustment.periodEnd",
      "…beside the control that caused it, in the wire spelling the browser's mapper reads");
    assert.equal(await countEntries(sealed.client), 0, "and nothing was admitted");
    console.log("[pa-e2e] PASS 5: a locked period is a typed 400 at admission, beside its own control");

    // ---- 6. #643's UPLOAD/REFERENCE ENTRANCE, END TO END ------------------
    // AC3 asks this operation to be reachable "from the direct Accounting entry point AND from an
    // upload/reference". On this door the second entrance is the CITATION: the form's evidence
    // chooser (`apps/web/components/accounting/evidence-chooser.tsx`, the composer's own component)
    // sends `sourceRefs:[{kind:'document'}]`, and this leg walks that claim the whole way — through
    // the real HTTP route, the real admission door, the real run, to the evidence link the posting
    // core writes inside the posting transaction and the `source_document_id` the adjustment row
    // keeps. Only a real World can show the last two: they are written by the RUN, not by the door.
    if (EVIDENCE_READY) {
      const ev = await seedClient("pa-evidence");
      const doc = await seedFiledDocument(ev.firm, ev.client, "pa-count-sheet");
      const evAdmit = await api("POST", "/api/work/periodic-adjustment", {
        clientId: ev.client,
        intentKey: randomUUID(),
        purpose: "periodic_stock_adjustment",
        basis: stockBasis("2026 stocktake, with the count sheet"),
        adjustment: stockAdjustment(),
        sourceRefs: [{ kind: "document", documentId: doc }],
      }, ev.jwt);
      assert.equal(evAdmit.status, 202,
        `a cited admission is a 202 (got ${evAdmit.status} ${JSON.stringify(evAdmit.body)})`);
      const evWork = await readWork(evAdmit.body.work_id);
      assert.equal(evWork.source_refs?.[0]?.kind, "document",
        "the Work carries the document the preparer chose — the route really threads p_source_refs");
      assert.equal(evWork.source_refs[0].document_id, doc);
      assert.ok(evWork.adjustment_basis, "…beside the typed particulars, never inside them");

      const evDone = await pollWork(evAdmit.body.work_id, ev.jwt, (b) => TERMINAL.has(b.work.status), "cited work settles");
      assert.equal(evDone.work.status, "completed",
        `the cited Work completes (got ${evDone.work.status} / ${JSON.stringify(evDone.work.error)})`);
      assert.equal(await countEntries(ev.client), 1, "exactly ONE journal entry");

      const evReceipt = (await rig.rootQuery(
        "select effects from clara.operation_receipts where work_id=$1 and outcome='committed'", [evAdmit.body.work_id])).rows[0];
      assert.equal(evReceipt.effects.document_id, doc, "the receipt's effects NAME the evidence");
      assert.ok(evReceipt.effects.adjustment_id, "…and its adjustment");

      const evLinks = await rig.rootQuery("select * from clara.entry_evidence_links where entry_id=$1",
        [evDone.work.result.entry_id]);
      assert.equal(evLinks.rows.length, 1, "exactly ONE evidence link, born inside the posting transaction");
      assert.equal(evLinks.rows[0].document_id, doc);
      assert.equal(evLinks.rows[0].attached_via, "work_commit");

      const evRows = await adjustments(ev.client);
      assert.equal(evRows.length, 1);
      assert.equal(evRows[0].source_document_id, doc,
        "the durable adjustment row keeps the document it was recorded from — the history's 'Source'");

      // AN UNFILED DOCUMENT IS A 400 NAMING THE CONTROL, never a 500 and never a silent drop. This
      // is the refusal the form's chooser renders (`fieldForServerPath` maps `sourceRefs[N]` onto
      // the `evidence` control), and the token is the DATABASE's own `constraint`, folded into
      // `reason` by `workErrorResponse`.
      const unfiled = await api("POST", "/api/work/periodic-adjustment", {
        clientId: ev.client,
        intentKey: randomUUID(),
        purpose: "periodic_stock_adjustment",
        basis: stockBasis("a document this client does not have"),
        adjustment: stockAdjustment(),
        sourceRefs: [{ kind: "document", documentId: "00000000-0000-4000-8000-000000643fff" }],
      }, ev.jwt);
      assert.equal(unfiled.status, 400,
        `an unfiled citation is a 400 (got ${unfiled.status} ${JSON.stringify(unfiled.body)})`);
      // #981 · THE CARRIER, OVER THE REAL WIRE. The promoted keys are what they always were —
      // that is the compatibility claim, and it is measured here off an actual HTTP response
      // rather than off `workErrorResponse` — and the door's whole typed detail now rides beside
      // them under `detail`, additively.
      const { detail: unfiledDetail, ...unfiledPromoted } = unfiled.body;
      assert.deepEqual(unfiledPromoted, { error: "invalid_basis", field: "sourceRefs[1]", reason: "not_filed" });
      assert.deepEqual(unfiledDetail,
        { reason: "invalid_source_ref", field: "source_refs[1]", constraint: "not_filed" },
        "the door's own object, verbatim: the category reason the wire overwrote, the DB's 1-based "
        + "path, and the raw constraint token");
      assert.equal(await countEntries(ev.client), 1, "…and nothing else was admitted");
      console.log("[pa-e2e] PASS 6: a cited document rides admission -> commit -> evidence link + adjustment row; an unfiled one is a typed 400 on the chooser");
    } else {
      console.log("[pa-e2e] PASS 6: SKIPPED — migration 0182 (clara.entry_evidence_links) is not on this database");
    }
  } finally {
    if (!first.state.exited) first.child.kill("SIGKILL");
    await waitExit(first.child).catch(() => {});
  }

  // =========================================================================
  // 4. crash AFTER the database commit, BEFORE the workflow checkpoint.
  // =========================================================================
  {
    const crash = await seedClient("pa-crash");
    const faulty = spawnServe({ CLARA_WORK_TEST_FAULT: "exit_after_commit" });
    let workId = null;
    try {
      await waitReady(45000, faulty);
      const admit = await api("POST", "/api/work/periodic-adjustment", {
        clientId: crash.client,
        intentKey: randomUUID(),
        purpose: "periodic_stock_adjustment",
        basis: stockBasis("stocktake — crash window"),
        adjustment: stockAdjustment(),
      }, crash.jwt);
      assert.equal(admit.status, 202);
      workId = admit.body.work_id;
      // The tool calls process.exit(137) the instant the commit returns. The engine dies with the
      // entry, the receipt AND the adjustment row on disk and the step NOT checkpointed — the
      // window nothing else can produce, and the one this lane's third write has to survive.
      await waitExit(faulty.child, 90000);
      assert.notEqual(faulty.state.exitInfo?.code, 0, `the engine died mid-run (exit ${JSON.stringify(faulty.state.exitInfo)})`);
    } finally {
      if (!faulty.state.exited) faulty.child.kill("SIGKILL");
      await waitExit(faulty.child).catch(() => {});
    }

    assert.equal(await countEntries(crash.client), 1, "the entry survived the crash — it was COMMITTED before the process died");
    assert.equal((await adjustments(crash.client)).length, 1, "…and so did its adjustment row: the three writes are one transaction");
    const midWork = await readWork(workId);
    assert.notEqual(midWork.status, "completed", "and the Work is NOT yet completed — the run never checkpointed");

    await sleep(500);
    const respawned = spawnServe();
    try {
      await waitReady(45000, respawned);
      const settled = await pollWork(workId, crash.jwt, (b) => TERMINAL.has(b.work.status), "crashed work resumes and settles", 120000);
      assert.equal(settled.work.status, "completed", `the resumed run settles completed (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
      assert.equal(settled.work.result?.replayed, true, "the re-executed step's tool call REPLAYED onto the original receipt");
      assert.equal(await countEntries(crash.client), 1, "EXACTLY ONE journal entry across the crash");
      assert.equal(await countReceipts(workId), 1, "EXACTLY ONE committed operation receipt across the crash");
      const rows = await adjustments(crash.client);
      assert.equal(rows.length, 1, "EXACTLY ONE clara.periodic_adjustments row across the crash");
      assert.equal(rows[0].work_id, workId);
      console.log("[pa-e2e] PASS 4: crash after commit / before checkpoint -> resume -> replayed receipt, one entry, one receipt, one adjustment");
    } finally {
      if (!respawned.state.exited) respawned.child.kill("SIGKILL");
      await waitExit(respawned.child).catch(() => {});
    }
  }

  console.log("\nPERIODIC ADJUSTMENT E2E: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nPERIODIC ADJUSTMENT E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
