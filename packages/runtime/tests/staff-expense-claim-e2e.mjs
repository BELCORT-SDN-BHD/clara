// STANDALONE staff-expense-claim e2e (#638). NOT a `node --test` file: it SPAWNS scripts/serve.mjs
// (through tests/work-journal-serve.mjs, which installs the scripted model first) as a CHILD
// process, so the engine can be crashed mid-run and respawned against the SAME database — the
// pattern tests/interview-kill-resume-e2e.mjs established and tests/work-journal-e2e.mjs and
// tests/periodic-adjustment-e2e.mjs reuse. Run:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   node tests/staff-expense-claim-e2e.mjs
//
// WHAT IT PROVES, and every one of these needs a real Postgres World plus a real HTTP boundary:
//   1. ADMIT -> RUN -> COMMIT, THROUGH THE UNCHANGED FROZEN BUNDLE. One POST to the new sibling
//      route produces one Work whose purpose is the UNWIDENED `journal_entry`, one run served by
//      the SAME `clara-work/v3` body a documentless journal entry is served by, one approved entry
//      whose expense debits and single non-control payable credit are the claim's own itemisation,
//      one `clara.operation_receipts` row, one `clara.staff_expense_claims` row — born at
//      ADMISSION, before any run — and a `posted` row on its status ledger written by the receipt's
//      own trigger. That the typed claim never reaches the model is the whole design, and only a
//      real run can show it: the envelope the model echoes carries `basis` and nothing else.
//   2. A LOST ACKNOWLEDGEMENT. The same intentKey re-POSTed returns the SAME Work AND the SAME
//      claim with `replayed:true`, and mints no second task, no second entry and no second claim.
//   3. A CHANGED CLAIM under that key is a 409 `intent_payload_conflict` naming the Work leg 1
//      admitted — proved with a change that does NOT move the derived journal at all (the claimant's
//      identifier), so this is the leg that shows `clara._claim_basis_canonical` is genuinely in the
//      comparison rather than the basis digest doing all the work.
//   4. A CRASH AFTER COMMIT, BEFORE CHECKPOINT, ON THE ADVANCE ARM.
//      `CLARA_WORK_TEST_FAULT=exit_after_commit` exits the process the instant the database returns
//      a receipt. On respawn the WDK re-executes the step, the tool call REPLAYS onto the same
//      logical identity, and exactly ONE entry, ONE committed receipt, ONE claim row AND ONE
//      `clara.staff_advance_applications` row exist — the last of which is written by a DEFERRED
//      constraint trigger at COMMIT, so nothing but a real World can show it survived the window.
//   5. CURRENT AUTHORITY ON A REPLAY. A lost-response retry under an intent key whose author has
//      since been REMOVED from the firm is refused on live authority, not answered `replayed:true`
//      — the door re-checks membership BEFORE it reaches the replay branch, precisely because the
//      branch would otherwise hand a removed member a Work.
//   6. PER-ITEM CONTINUATION. A claim carrying one item that names the fact it still lacks posts
//      the independent items and records the waiting one on its own status ledger, by name.
//   7. C1's OPTIONAL ATTACHMENT. A claim admitted with `sourceRefs:[{kind:'document'}]` reaches
//      commit with an `entry_evidence_links` row born inside the posting transaction and a
//      `source_document_id` the claim row keeps; a claim with NO attachment is equally lawful.
//      Skipped cleanly when 0182 is absent.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out (the heavy-test precedent shared with its siblings), and
// the file SKIPS CLEANLY when migration 0206 is absent — its runtime half merges alongside its DB
// half, and a green e2e against a database with no `clara.staff_expense_claims` would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[sec-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate. BYTE-IDENTICAL to `periodic-adjustment-e2e.mjs`'s, deliberately: this
// file spawns the same server against the same throwaway databases, and a gate that admitted one
// more name here would be a second, looser answer to one question.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("staff-expense-claim-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("staff-expense-claim-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}
{
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("staff-expense-claim-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const PORT = process.env.SEC_E2E_PORT || (await ephemeralPort());
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-sec-e2e.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "sec-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The SAME child bootstrap the journal e2e spawns: its default script reads the chart and then
// echoes the ADMITTED BASIS verbatim, which is exactly what a claim run does too — the typed claim
// is in a relation the run never reads.
const serveScript = fileURLToPath(new URL("./work-journal-serve.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 10 * 60 * 1000;
setTimeout(() => {
  console.error(`\nSTAFF EXPENSE CLAIM E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
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
  // READ LINE BY LINE, NOT CHUNK BY CHUNK — a `data` event is a slice of a pipe, not a promise of a
  // whole line (wave2-ci-two-build-banner.md).
  const ingest = (line) => {
    const m = /\[clara-runtime\] bundle clara-work\/v3 digest=([0-9a-f]{64})/.exec(line);
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

/** WAIT FOR *THIS* ENGINE'S OWN BOOT — `/ready`'s world conjunct is an estate-wide heartbeat, so a
 *  predecessor that stopped seconds ago satisfies it. The idiom (and the reason) are
 *  periodic-adjustment-e2e.mjs's, verbatim. */
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

const TRAVEL = "6200";
const MEALS = "6210";
const PAYABLE = "2010";
const BANK = "1150";
const ADVANCE = "1190";

/** The wire claim the walk admits. Written out rather than derived from
 *  `lib/staff-expense-claim-basis.ts` on purpose: this file is a CONTRACT test of the HTTP door, and
 *  a fixture that shared the door's own builder could not tell a wrong derivation from a right one.
 *  The unit battery pins the builder; this pins the wire. */
function claim(over = {}) {
  return {
    claimant: {
      accountCode: ADVANCE,
      personLabel: "Farah binti Idris",
      attestation: "Dedicated to Farah; she is not a director and this is not a related-party balance.",
      confirmDedicated: true,
      identifier: "EMP-0042",
    },
    sourceKind: "instruction",
    instruction: "Farah's March travel claim, two receipts she emailed in.",
    incurredDate: "2026-03-04",
    postingDate: "2026-03-31",
    items: [
      {
        description: "KL–Penang return flight",
        expenseAccountCode: TRAVEL,
        amountCents: 48000,
        suppliedTax: { stated_code: "SR", stated_cents: 2880 },
      },
      { description: "Client dinner", expenseAccountCode: MEALS, amountCents: 12500 },
    ],
    settlement: "reimbursement",
    payableAccountCode: PAYABLE,
    ...over,
  };
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regclass('clara.staff_expense_claims') is not null as claims,
           to_regclass('clara.staff_expense_claim_status') is not null as ledger,
           to_regprocedure('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)') is not null as admit
  `);
  if (!probe.rows[0]?.claims || !probe.rows[0]?.ledger || !probe.rows[0]?.admit) {
    console.log("[sec-e2e] SKIPPED — migration 0206 (clara.staff_expense_claims + clara.admit_staff_expense_claim_work) is not on this database");
    process.exit(0);
  }

  const EVIDENCE_READY = (await rig.rootQuery(
    "select to_regclass('clara.entry_evidence_links') is not null as ok")).rows[0]?.ok === true;

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
    rig.rootQuery("select count(*)::int as n from clara.operation_receipts where work_id = $1 and outcome = 'committed'", [work])
      .then((r) => r.rows[0].n);
  const claims = (client) =>
    rig.rootQuery(
      "select *, incurred_date::text as incurred_text, posting_date::text as posting_text"
      + " from clara.staff_expense_claims where client_id = $1 order by created_at", [client])
      .then((r) => r.rows);
  const ledger = (claimId) =>
    rig.rootQuery("select * from clara.staff_expense_claim_status where claim_id = $1 order by recorded_at, state", [claimId])
      .then((r) => r.rows);
  const applications = (client) =>
    rig.rootQuery("select * from clara.staff_advance_applications where client_id = $1 order by created_at", [client])
      .then((r) => r.rows);
  const readWork = (id) => rig.rootQuery("select * from clara.accounting_work where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const tasksFor = (work) => rig.rootQuery("select id from clara.agent_tasks where work_id = $1", [work]).then((r) => r.rows);
  const linesOf = (entry) =>
    rig.rootQuery("select * from clara.journal_lines where entry_id=$1 order by line_no", [entry]).then((r) => r.rows);

  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type] of [
      [TRAVEL, "Travel and Accommodation", "expense"],
      [MEALS, "Staff Meals and Entertainment", "expense"],
      [PAYABLE, "Other Payables", "liability"],
      [BANK, "Maybank Current", "asset"],
      [ADVANCE, "Staff advance — Farah", "asset"],
    ]) {
      await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r", [
        client, code, name, type, rig.opk("acct"),
      ]);
    }
    return { owner, firm, client, jwt: await mint(owner) };
  }

  /**
   * ONE REAL STAFF ADVANCE, through the estate's OWN doors — never a hand-written register row.
   * Enrol (admin+), then draft and approve an ordinary coded entry DEBITING the enrolled account so
   * 0043's soft-birth arm (reached through `clara._approve_entry_core`, one of the four pinned hook
   * callers) births the `clara.staff_advances` row. The checker is a DISTINCT human, because the
   * estate's maker/checker floor is not this ticket's to route around.
   */
  async function seedAdvance(world, { cents, issueDate }) {
    await rig.humanQuery(world.owner,
      `select clara.enrol_staff_advance_account(p_client=>$1::uuid, p_account_code=>$2::text,
         p_person_label=>$3::text, p_confirm_dedicated=>true, p_attestation=>$4::text,
         p_op_key=>$5::text) as r`,
      [world.client, ADVANCE, "Farah binti Idris",
        "#638 e2e: dedicated to one named person; not a related-party balance", rig.opk("enrol")]);
    const checker = await rig.addMember(world.owner, world.firm, { role: "bookkeeper", prefix: "sec_chk" });
    const res = await rig.humanQuery(world.owner,
      `select clara.record_resolution(p_client=>$1::uuid, p_subject_kind=>'manual', p_subject=>null::uuid,
         p_confidence=>0.98::numeric, p_method=>'human', p_evidence=>'{}'::jsonb, p_op_key=>$2::text) as r`,
      [world.client, rig.opk("res")]);
    const resolution = res.rows[0].r.resolution_id ?? res.rows[0].r.id ?? res.rows[0].r;
    const draft = await rig.humanQuery(world.owner,
      `select clara.draft_entry(p_client=>$1::uuid, p_resolution=>$2::uuid, p_posting_date=>$3::date,
         p_memo=>$4::text, p_lines=>$5::jsonb, p_op_key=>$6::text) as r`,
      [world.client, resolution, issueDate, "#638 e2e: advance paid to Farah",
        JSON.stringify([
          { account_code: ADVANCE, debit_cents: cents, credit_cents: 0, description: "advance paid out" },
          { account_code: BANK, debit_cents: 0, credit_cents: cents, description: "from bank" },
        ]), rig.opk("draft")]);
    const d = draft.rows[0].r;
    await rig.humanQuery(checker,
      "select clara.approve_entry(p_entry=>$1::uuid, p_expected_revision=>$2::uuid, p_op_key=>$3::text) as r",
      [d.entry_id, d.revision_token, rig.opk("approve")]);
    const rows = await rig.rootQuery(
      "select * from clara.staff_advances where client_id=$1 order by created_at", [world.client]);
    assert.equal(rows.rows.length, 1, "the disbursement soft-birthed exactly ONE register row");
    return rows.rows[0];
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
  // 1-3, 5-7: one long-lived engine.
  // =========================================================================
  const first = spawnServe();
  try {
    await waitReady(45000, first);
    assert.ok(first.state.banner, "the world-start banner names the serving bundle digest");
    console.log(`[sec-e2e] engine ready; serving bundle digest=${first.state.banner}`);

    // ---- 1. admit -> run -> commit ---------------------------------------
    const one = await seedClient("sec-commit");
    const intent = randomUUID();
    const admitted = await api("POST", "/api/work/staff-expense-claim", {
      clientId: one.client, intentKey: intent, claim: claim(),
    }, one.jwt);
    assert.equal(admitted.status, 202, `admission 202 (got ${admitted.status} ${JSON.stringify(admitted.body)})`);
    assert.equal(admitted.body.status, "queued");
    assert.equal(admitted.body.replayed, false);
    assert.ok(admitted.body.claim_id, "the 202 NAMES the claim it already wrote");
    assert.equal(admitted.body.logical_op_id, `work:${admitted.body.work_id}:journal_entry:1`,
      "the server-assigned identity carries the UNWIDENED journal_entry purpose");

    const workId = admitted.body.work_id;
    const admittedRow = await readWork(workId);
    assert.equal(admittedRow.purpose, "journal_entry");
    assert.equal(admittedRow.adjustment_basis, null,
      "a claim carries NO adjustment_basis — 0195's INSERTION 5 is guarded on that column, not on the purpose");
    assert.equal(admittedRow.basis.lines.length, 3,
      "the DOOR derived the journal from the claim: two expense debits and one settlement credit");

    // THE CLAIM IS ALREADY DURABLE, before any run has touched it.
    const born = await claims(one.client);
    assert.equal(born.length, 1, "exactly ONE claim row, written inside the ADMISSION transaction");
    assert.equal(born[0].id, admitted.body.claim_id);
    assert.equal(String(born[0].amount_cents), "60500", "the EXACT itemised total");
    assert.equal(born[0].incurred_text, "2026-03-04", "the incurred date is its OWN fact");
    assert.equal(born[0].posting_text, "2026-03-31");
    assert.equal(born[0].claimant_label, "Farah binti Idris");
    assert.equal(born[0].claimant_identifier, "EMP-0042");
    assert.deepEqual(born[0].items[0].supplied_tax, { stated_code: "SR", stated_cents: 2880 },
      "supplied tax facts are carried VERBATIM and validated against nothing");
    assert.deepEqual((await ledger(born[0].id)).map((s) => s.state), ["admitted"],
      "the ledger opens at `admitted` and nothing else — nothing has posted yet");

    // …AND THE CLAIMANT WAS AUTO-ENROLLED, inside that same transaction.
    const enrolments = await rig.rootQuery(
      "select * from clara.staff_advance_accounts where client_id=$1", [one.client]);
    assert.equal(enrolments.rows.length, 1, "the door enrolled the new claimant");
    assert.equal(enrolments.rows[0].person_label, "Farah binti Idris");
    assert.equal(enrolments.rows[0].created_by, one.owner, "attributed to the authorising human");

    const settled = await pollWork(workId, one.jwt, (b) => TERMINAL.has(b.work.status), "first commit");
    assert.equal(settled.work.status, "completed",
      `the run settles completed (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
    assert.equal(settled.work.bundle?.id, "clara-work/v3",
      "…served by the UNCHANGED frozen bundle: nothing about this lane needed a new workflow version");

    assert.equal(await countEntries(one.client), 1, "exactly ONE journal entry");
    assert.equal(await countReceipts(workId), 1, "exactly ONE committed operation receipt");
    const entry = (await rig.rootQuery(
      "select id, status, posting_date::text as posting_date from clara.journal_entries where client_id=$1",
      [one.client])).rows[0];
    assert.equal(entry.status, "approved");
    assert.equal(entry.posting_date, "2026-03-31", "the EXACT supplied posting date, never a timezone-shifted one");
    const lines = await linesOf(entry.id);
    assert.equal(lines.length, 3);
    assert.equal(String(lines.find((l) => l.account_code === TRAVEL).debit_cents), "48000");
    assert.equal(String(lines.find((l) => l.account_code === MEALS).debit_cents), "12500");
    assert.equal(String(lines.find((l) => l.account_code === PAYABLE).credit_cents), "60500",
      "the employee payable is a NON-CONTROL liability leg, never an AP open item");
    assert.equal(
      (await rig.rootQuery("select count(*)::int n from clara.open_items where client_id=$1", [one.client])).rows[0].n,
      0, "…and no open item was minted");

    const posted = (await ledger(born[0].id)).find((s) => s.state === "posted");
    assert.ok(posted, "the operation_receipts trigger appended `posted`");
    assert.equal(posted.entry_id, entry.id);
    assert.ok(posted.receipt_id);
    console.log("[sec-e2e] PASS 1: admit -> run -> commit; claim born at admission, one entry, one receipt, one posted ledger row");

    // ---- 2. lost acknowledgement -----------------------------------------
    const tasksBefore = (await tasksFor(workId)).length;
    const replay = await api("POST", "/api/work/staff-expense-claim", {
      clientId: one.client, intentKey: intent, claim: claim(),
    }, one.jwt);
    assert.equal(replay.status, 202);
    assert.equal(replay.body.replayed, true, "the SAME intent key resolves to the Work it already admitted");
    assert.equal(replay.body.work_id, workId);
    assert.equal(replay.body.claim_id, born[0].id, "…and to the SAME claim");
    assert.equal((await tasksFor(workId)).length, tasksBefore, "no second run");
    assert.equal(await countEntries(one.client), 1, "no second entry");
    assert.equal((await claims(one.client)).length, 1, "no second claim");
    assert.equal((await rig.rootQuery(
      "select count(*)::int n from clara.staff_advance_accounts where client_id=$1", [one.client])).rows[0].n,
    1, "…and no second enrolment for one person");
    console.log("[sec-e2e] PASS 2: a lost acknowledgement replays onto the same Work, the same claim and the same enrolment");

    // ---- 3. a CHANGED claim under that key --------------------------------
    //
    // ONLY THE CLAIMANT'S IDENTIFIER MOVED, so the DERIVED journal — its lines, its memo, its
    // posting date — is byte-identical and `basis_digest` is identical too. Without
    // `clara._claim_basis_canonical` in the comparison this would answer `replayed:true` and the
    // changed identity would silently vanish.
    const conflict = await api("POST", "/api/work/staff-expense-claim", {
      clientId: one.client, intentKey: intent,
      claim: claim({ claimant: { ...claim().claimant, identifier: "EMP-9999" } }),
    }, one.jwt);
    assert.equal(conflict.status, 409, `a changed claim is a conflict (got ${conflict.status} ${JSON.stringify(conflict.body)})`);
    assert.equal(conflict.body.error, "intent_payload_conflict");
    assert.equal(conflict.body.work_id, workId, "…and the 409 NAMES the Work that key already holds");
    assert.equal(await countEntries(one.client), 1, "no second effect");
    console.log("[sec-e2e] PASS 3: the typed claim is in the intent-payload comparison, not only the basis digest");

    // ---- 6. per-item continuation ----------------------------------------
    const cont = await seedClient("sec-items");
    const contAdmit = await api("POST", "/api/work/staff-expense-claim", {
      clientId: cont.client, intentKey: randomUUID(),
      claim: claim({
        items: [
          { description: "KL–Penang return flight", expenseAccountCode: TRAVEL, amountCents: 48000 },
          { description: "Taxi, receipt undated", pendingFact: "incurred_date" },
        ],
      }),
    }, cont.jwt);
    assert.equal(contAdmit.status, 202, JSON.stringify(contAdmit.body));
    const contDone = await pollWork(contAdmit.body.work_id, cont.jwt, (b) => TERMINAL.has(b.work.status), "continuation");
    assert.equal(contDone.work.status, "completed", JSON.stringify(contDone.work.error));
    const contLines = await linesOf(contDone.work.result.entry_id);
    assert.equal(contLines.length, 2, "the pending item posted NO line");
    assert.equal(String(contLines.find((l) => l.account_code === PAYABLE).credit_cents), "48000");
    const contLedger = await ledger(contAdmit.body.claim_id);
    const waiting = contLedger.find((s) => s.state === "items_pending");
    assert.ok(waiting, "the ledger shows BOTH halves — what posted and what is still waiting");
    assert.equal(waiting.detail.items[0].pending_fact, "incurred_date",
      "…and NAMES the fact that is missing rather than leaving it to be guessed");
    assert.ok(contLedger.some((s) => s.state === "posted"));
    console.log("[sec-e2e] PASS 6: an item waiting on a named fact waits alone while the independent items post");

    // ---- 7. C1's OPTIONAL ATTACHMENT --------------------------------------
    if (EVIDENCE_READY) {
      const ev = await seedClient("sec-evidence");
      const doc = await seedFiledDocument(ev.firm, ev.client, "sec-receipts");
      const evAdmit = await api("POST", "/api/work/staff-expense-claim", {
        clientId: ev.client, intentKey: randomUUID(), claim: claim({ sourceKind: "document" }),
        sourceRefs: [{ kind: "document", documentId: doc }],
      }, ev.jwt);
      assert.equal(evAdmit.status, 202, `a cited admission is a 202 (got ${evAdmit.status} ${JSON.stringify(evAdmit.body)})`);
      const evClaim = (await claims(ev.client))[0];
      assert.equal(evClaim.source_document_id, doc,
        "the claim row keeps the document it was recorded from — the history's 'Source'");
      const evDone = await pollWork(evAdmit.body.work_id, ev.jwt, (b) => TERMINAL.has(b.work.status), "cited work settles");
      assert.equal(evDone.work.status, "completed", JSON.stringify(evDone.work.error));
      const evLinks = await rig.rootQuery("select * from clara.entry_evidence_links where entry_id=$1",
        [evDone.work.result.entry_id]);
      assert.equal(evLinks.rows.length, 1, "exactly ONE evidence link, born inside the posting transaction");
      assert.equal(evLinks.rows[0].attached_via, "work_commit");

      const unfiled = await api("POST", "/api/work/staff-expense-claim", {
        clientId: ev.client, intentKey: randomUUID(), claim: claim(),
        sourceRefs: [{ kind: "document", documentId: "00000000-0000-4000-8000-000000638fff" }],
      }, ev.jwt);
      assert.equal(unfiled.status, 400, `an unfiled citation is a 400 (got ${unfiled.status} ${JSON.stringify(unfiled.body)})`);
      assert.deepEqual(unfiled.body, { error: "invalid_basis", field: "sourceRefs[1]", reason: "not_filed" });
      console.log("[sec-e2e] PASS 7: an attached receipt rides admission -> commit -> evidence link; an unfiled one is a typed 400");
    } else {
      console.log("[sec-e2e] PASS 7: SKIPPED — migration 0182 (clara.entry_evidence_links) is not on this database");
    }

    // ---- 5. CURRENT AUTHORITY ON A REPLAY ---------------------------------
    //
    // A lost-response retry is still an act, and it is still the author's. The door re-checks live
    // membership BEFORE it reaches the replay branch, precisely because the branch would otherwise
    // hand a removed member a Work.
    const gone = await seedClient("sec-revoked");
    const goneMember = await rig.addMember(gone.owner, gone.firm, { role: "bookkeeper", prefix: "sec_rev" });
    const goneJwt = await mint(goneMember);
    const goneIntent = randomUUID();
    const goneAdmit = await api("POST", "/api/work/staff-expense-claim", {
      clientId: gone.client, intentKey: goneIntent, claim: claim(),
    }, goneJwt);
    assert.equal(goneAdmit.status, 202, JSON.stringify(goneAdmit.body));
    await rig.humanQuery(gone.owner,
      "select clara.remove_member(p_firm=>$1::uuid, p_user=>$2::uuid, p_op_key=>$3::text) as r",
      [gone.firm, goneMember, rig.opk("rm")]);
    const afterRevoke = await api("POST", "/api/work/staff-expense-claim", {
      clientId: gone.client, intentKey: goneIntent, claim: claim(),
    }, goneJwt);
    assert.ok([401, 403, 404].includes(afterRevoke.status),
      `a removed member's replay is refused on LIVE authority, never answered replayed:true `
      + `(got ${afterRevoke.status} ${JSON.stringify(afterRevoke.body)})`);
    assert.equal((await claims(gone.client)).length, 1, "…and no second claim was written");
    console.log("[sec-e2e] PASS 5: a replay under revoked authority is refused, not replayed");
  } finally {
    if (!first.state.exited) first.child.kill("SIGKILL");
    await waitExit(first.child).catch(() => {});
  }

  // =========================================================================
  // 4. crash AFTER the database commit, BEFORE the workflow checkpoint — ON THE ADVANCE ARM.
  //
  // The allocation is minted by a DEFERRED CONSTRAINT TRIGGER at COMMIT, after the receipt row the
  // trigger reaches the claim through, and BEFORE `t_je_adv_movement_belt` counts coverage. Nothing
  // but a real World can show that all four writes — entry, receipt, claim and allocation — are one
  // transaction that survives a SIGKILL in the checkpoint window.
  // =========================================================================
  {
    const crash = await seedClient("sec-crash");
    const advance = await seedAdvance(crash, { cents: 200000, issueDate: "2026-02-01" });
    const faulty = spawnServe({ CLARA_WORK_TEST_FAULT: "exit_after_commit" });
    let workId = null;
    let claimId = null;
    try {
      await waitReady(45000, faulty);
      const admit = await api("POST", "/api/work/staff-expense-claim", {
        clientId: crash.client, intentKey: randomUUID(),
        claim: claim({
          claimant: { accountCode: ADVANCE },
          settlement: "advance_application",
          advanceAccountCode: ADVANCE,
          advanceId: advance.id,
          payableAccountCode: undefined,
        }),
      }, crash.jwt);
      assert.equal(admit.status, 202, `advance-arm admission 202 (got ${admit.status} ${JSON.stringify(admit.body)})`);
      workId = admit.body.work_id;
      claimId = admit.body.claim_id;
      // The tool calls process.exit(137) the instant the commit returns. The engine dies with the
      // entry, the receipt AND the allocation on disk and the step NOT checkpointed.
      await waitExit(faulty.child, 90000);
      assert.notEqual(faulty.state.exitInfo?.code, 0, `the engine died mid-run (exit ${JSON.stringify(faulty.state.exitInfo)})`);
    } finally {
      if (!faulty.state.exited) faulty.child.kill("SIGKILL");
      await waitExit(faulty.child).catch(() => {});
    }

    assert.equal(await countEntries(crash.client), 2,
      "the claim's entry survived the crash beside the seeded disbursement — it was COMMITTED before the process died");
    assert.equal((await applications(crash.client)).length, 1,
      "…and so did the allocation the DEFERRED birth trigger minted at commit: the four writes are one transaction");
    const midWork = await readWork(workId);
    assert.notEqual(midWork.status, "completed", "and the Work is NOT yet completed — the run never checkpointed");

    await sleep(500);
    const respawned = spawnServe();
    try {
      await waitReady(45000, respawned);
      const settled = await pollWork(workId, crash.jwt, (b) => TERMINAL.has(b.work.status), "crashed work resumes and settles", 120000);
      assert.equal(settled.work.status, "completed",
        `the resumed run settles completed (got ${settled.work.status} / ${JSON.stringify(settled.work.error)})`);
      assert.equal(settled.work.result?.replayed, true, "the re-executed step's tool call REPLAYED onto the original receipt");
      assert.equal(await countEntries(crash.client), 2, "EXACTLY ONE claim entry across the crash");
      assert.equal(await countReceipts(workId), 1, "EXACTLY ONE committed operation receipt across the crash");
      assert.equal((await claims(crash.client)).length, 1, "EXACTLY ONE clara.staff_expense_claims row across the crash");
      const apps = await applications(crash.client);
      assert.equal(apps.length, 1, "EXACTLY ONE clara.staff_advance_applications row across the crash");
      assert.equal(apps[0].kind, "claim", "…minted under 0043's own `claim` kind");
      assert.equal(String(apps[0].amount_cents), "60500");
      assert.equal(apps[0].advance_id, advance.id);
      const outstanding = await rig.rootQuery(
        "select clara._adv_outstanding($1::uuid, $2::date) as n", [advance.id, "2026-03-31"]);
      assert.equal(Number(outstanding.rows[0].n), 200000 - 60500,
        "outstanding moved by EXACTLY the allocated cents at the effective date");
      assert.ok((await ledger(claimId)).some((s) => s.state === "posted"));
      console.log("[sec-e2e] PASS 4: crash after commit / before checkpoint -> resume -> replayed receipt; one entry, one receipt, one claim, one allocation");
    } finally {
      if (!respawned.state.exited) respawned.child.kill("SIGKILL");
      await waitExit(respawned.child).catch(() => {});
    }
  }

  console.log("\nSTAFF EXPENSE CLAIM E2E: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nSTAFF EXPENSE CLAIM E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
