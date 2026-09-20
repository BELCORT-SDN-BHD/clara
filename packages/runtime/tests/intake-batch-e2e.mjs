// #636 AC2/AC4/AC7 — THE INTAKE BATCH, ON A REAL POSTGRES WORLD.
//
// STANDALONE (not collected by `node --test`), on `intake-admission-e2e.mjs`'s proven shape. Run:
//
//   PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=<throwaway> \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:<port>/<throwaway> \
//   node tests/intake-batch-e2e.mjs
//
// THE SIZE OF LEG 1 IS MEASURED, NOT QUOTED. The wave's own notes said "a World leg with 100
// intakes" (refresh-wave-2026-09-18/DECISIONS.md:243); C83.X2 instructs that the old figures are
// DISCARDED and the inventory re-derived from evidence. Re-derived on clara_636 against the
// shipped defaults (docs_per_day 100 / pages_per_day 1000, 0007:366-367): a fresh firm admits
// EXACTLY 100 <=1MB PDFs in one UTC day — the 101st is refused CLR18 on the DOCS guard with both
// ceilings flush (docs 100, pages 1000) — 100 image/* files (refused on docs), and 20 <=5MB PDFs
// (refused on PAGES). So N = 100 for this leg's <=1MB PDF members, and it happens to equal the
// prose figure; it is written here because it was MEASURED, and `CLARA_P636_E2E_N` lowers it only
// for a local smoke.
//
// FIVE LEGS:
//   1. THE HEADLINE — N children on the real HTTP transport, each begin+attach committing
//      TOGETHER; N-5 reach a supported persistent result (document in custody, admitted Work,
//      COMMITTED operation receipt) while 5 independently (a) wait on a declared fact, (b) fail,
//      (c) stay unassigned. The parent's facets are DERIVED and they overlap.
//   2. CANCEL-REMAINING — every committed receipt survives, the already-settling child answers
//      its own arm, and the parent is never terminal early.
//   3. p636.batch.cancel_resume — a 100-child batch cancelled, the fan-out ABANDONED after child
//      50, then the reconciler belt resumes it: no child cancelled twice, none skipped, every
//      already-committed child still answers `already_completed` with its receipt id, and the
//      parent reaches terminal exactly once.
//   4. p636.poison.cross_firm — firm A's parent whose stored actor has been removed refuses on
//      EVERY child, permanently; firm B's parent, swept in the SAME belt call, still settles.
//   5. THE CAPACITY WALL, end to end on the real route — the (N+1)th upload is refused 429 with
//      the database's own sentence, and the refused file never becomes a member (its intake does
//      not exist, and a member's identity IS its intake).
//
// WHAT IT DELIBERATELY DOES NOT DO. Leg 3 interrupts the fan-out by ABANDONING it after child 50
// rather than by SIGKILLing a spawned engine. That is the same durable state a kill leaves
// behind — each child's cancel is its own transaction, so a killed process leaves exactly "the
// first k children asked, the rest not" — and it is the state the belt has to recover from. The
// transport of the interruption is the part not proven here, and it is named in #636's report.

import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|intake_ci|\d{3})(_world)?$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("intake-batch-e2e is hard-gated to loopback + PGDATABASE in {clara_rt_test,clara_intake_ci,clara_<ddd>}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|intake_ci|\d{3})(?:_world)?(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("intake-batch-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + the same throwaway database");
}

process.env.RELAY_TEST_MODE = "1";
process.env.CLARA_START_WORLD = "1";
process.env.CLARA_DOC_EGRESS_APPROVED = "1";
process.env.WORKFLOW_TARGET_WORLD = "@workflow/world-postgres";
process.env.PORT ||= await ephemeralPort();
process.env.CLARA_INTAKE_CORS_ORIGINS = "https://dashboard.test";
// THE LEADER IS SLOWED, AND THE REASON IS A WINDOWS FILE-LOCKING PROPERTY, NOT A BEHAVIOUR UNDER
// TEST. `recoverPendingDocumentIntakes` OPENS every spool sidecar on each sweep
// (`listIntakeMetas`), and on Windows `rename()` over a destination another handle has open fails
// EPERM — so a sweep landing between two `writeIntakeMeta` calls fails a finalize with `internal`.
// MEASURED here: one child in six at the default 2 s cadence. This leg uploads N of them in a row,
// so the sweep is pushed out of the way; legs 3 and 4 call the batch belt DIRECTLY and never
// depend on the leader's cadence, and the ingest dispatch is the finalize route's own `start()`.
process.env.CLARA_LEADER_POLL_MS ||= "600000";
const tempBase = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
await mkdir(tempBase, { recursive: true });
const scratch = await mkdtemp(join(tempBase, "clara-intake-batch-"));
process.env.CLARA_SPOOL_DIR = join(scratch, "spool");
process.env.CLARA_TEST_STORAGE_DIR = join(scratch, "storage");

const issuer = "https://clara-batch.test/auth/v1";
const audience = "authenticated";
const jwtSecret = `batch-${randomUUID().replaceAll("-", "")}`;
process.env.SUPABASE_JWT_ISSUER = issuer;
process.env.SUPABASE_JWT_AUD = audience;
process.env.SUPABASE_JWT_SECRET = jwtSecret;

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const ORIGIN = "https://dashboard.test";
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mint = (sub) =>
  new SignJWT({ role: audience })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub).setIssuer(issuer).setAudience(audience)
    .setIssuedAt().setExpirationTime("60m").sign(key);

/** THE MEASURED N (see this file's header). Both ceilings are flush at 100 for this file kind. */
const MEASURED_N = Number(process.env.CLARA_P636_E2E_N || 100);
const RESUME_N = Number(process.env.CLARA_P636_RESUME_N || 100);

// #1027 — LEG 4'S OWN CONVERGENCE, AND THE FAULTS THAT PROVE IT IS NEEDED.
//
// WHAT WAS WRONG. LEG 4 used to make TWO single-shot observations — one belt sweep then one read,
// twice — of facts the World produces asynchronously, and it swallowed its own settle failures
// (`settleRun(...).catch(() => {})`). Both observations have reddened CI, on BOTH branches, in the
// same block: job 105954490814 on `main` at `batchCancelFailed: 0` ("firm P's refusals are
// COUNTED"), and job 106051996127 on the integration branch at firm Q's parent still `cancelling`.
// Neither is a defect in the belt. The belt is convergent by design ("the guard is the state",
// 0229:993) and everything around it already polls; this block was the only thing here that read
// once and judged.
//
// MEASURED ON THIS RIG, not inferred. With firm Q's children RUNNING and this leg's own settles
// held back entirely, firm Q's parent still reached `cancelled` — after 6 sweeps over 2774 ms,
// driven by the WORLD settling those runs rather than by this leg (throwaway clara_928). A single
// sweep and a single read at t+0 cannot see that, and there is nothing for it to see: at that
// instant the honest state IS `cancelling`. Symmetrically, with the poisoned parent's own decision
// landing 1.5 s late, the un-polled block fails immediately on `batchCancelFailed: 0`
// (clara_931) while the polled one counts the refusal after 4 sweeps in 1516 ms (clara_929). On an
// unperturbed run both converge on the FIRST sweep in under 20 ms (clara_930), so the happy path
// costs nothing.
//
// SO LEG 4 POLLS, in `tests/queue-drain.mjs`'s shape: a `for(;;)` that re-runs the sweep and
// re-reads the state, a stated deadline of its own (nothing unrelated was lengthened), and a throw
// that names what was last observed. The refusal count is CUMULATIVE over the polled sweeps and
// still has to reach at least one; firm Q still has to reach `cancelled` and nothing weaker; every
// sweep still asserts `batchCancelOk`; and a settle that cannot be performed is RETRIED inside the
// same deadline and then NAMED — task id and last error — instead of being discarded.
//
// READING A DEADLINE THAT DOES FIRE. The message carries both firms, both parents, both states and
// every child's Work status. If firm P's children are already `failed` there, this race is not what
// happened: the poisoned parent was declared done because its children died on their own under the
// World, which is a different (and correct) belt behaviour meeting a leg that assumes they stay
// live. That is NOT fixed here — it is a separate defect, recorded in #1027's report as a
// follow-up — and the census is what lets the next reader tell the two apart in one glance.
const LEG4_DEADLINE_MS = Number(process.env.CLARA_P636_LEG4_DEADLINE_MS || 30000);
const LEG4_POLL_MS = Number(process.env.CLARA_P636_LEG4_POLL_MS || 500);
// THE FAULT KNOB, on `CLARA_WORK_TEST_FAULT`'s precedent: inert unless asked for, and it moves
// only WHEN THIS FIXTURE ACTS — never what the belt does. Two values, one per observation, each
// the documented mechanism of one CI red:
//   `late_poison`  the poisoned parent's own cancellation decision lands `CLARA_P636_LEG4_FAULT_MS`
//                  late, so the first sweep has nothing of firm P's to refuse. Keep it WELL under
//                  the few seconds firm P's children survive (measured: an 8000 ms delay let the
//                  World drive them to `failed` first, which is the OTHER defect, not this one).
//   `slow_settle`  firm Q's children are held RUNNING (a claimed run each, as LEG 2 does) and every
//                  settle is held back for `CLARA_P636_LEG4_FAULT_MS`, so the second sweep sees a
//                  parent whose runs have not landed. With the children left queued instead, the
//                  fault is inert — `cancel_accounting_work` terminalises them itself and the
//                  parent settles with or without this leg's settles (measured, clara_925).
// A ROW LOCK WAS TRIED FIRST AND REJECTED: holding `for update` on a parent row did not make the
// belt's `skip locked` worklist pass it by, it made the whole sweep WAIT (8087 ms under an 8000 ms
// lock, clara_923) and then proceed, which perturbs the leg's clock rather than its observations.
const LEG4_FAULT = process.env.CLARA_P636_LEG4_FAULT || "";
const LEG4_FAULT_MS = Number(process.env.CLARA_P636_LEG4_FAULT_MS || 6000);

const pdfBytes = (marker) =>
  Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Page /Marker (${marker}) >> endobj\nstartxref\n0\n%%EOF\n`);
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const basis = () => ({
  posting_date: "2026-04-05", memo: "p636 batch child", currency: "MYR",
  lines: [
    { account_code: "6100", debit_cents: 12345, credit_cents: 0, description: "rent" },
    { account_code: "1100", debit_cents: 0, credit_cents: 12345, description: "bank" },
  ],
});

async function waitHealthy() {
  for (let i = 0; i < 200; i += 1) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* booting */ }
    await sleep(100);
  }
  throw new Error("runtime did not become healthy");
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.documentPipelineReady())) throw new Error("migration 0007 is absent");
  const lane = await rig.rootQuery(
    "select to_regprocedure('clara.get_intake_batch(uuid,integer)') is not null as ok");
  if (!lane.rows[0].ok) throw new Error("migration 0229 is absent — apply it before running this leg");
  // THE WORLD DOES NOT SELF-BOOTSTRAP (WO-G G1b). Without `workflow.workflow_runs` the server
  // logs "durable world FAILED to start" and EXITS ZERO, which would make this whole file a
  // silent green. Asked here, loudly, before anything else runs.
  const world = await rig.rootQuery("select to_regclass('workflow.workflow_runs') as rel");
  if (!world.rows[0].rel) {
    throw new Error("the Workflow World is not bootstrapped on this database — run `pnpm --filter @clara/runtime exec bootstrap` with WORKFLOW_POSTGRES_URL set, then re-run this leg");
  }

  await import("../.output/server/index.mjs");
  await waitHealthy();
  // …and the leader's FIRST sweep still runs at boot whatever the cadence is. It opens every
  // spool sidecar (`listIntakeMetas`), which is the handle that makes the next `rename()` EPERM on
  // Windows. Let it finish before the first upload rather than racing it.
  await sleep(Number(process.env.CLARA_P636_BOOT_SETTLE_MS || 8000));

  const { openBatch, cancelBatch, childCancelKey } = await import("../lib/intake-batches.mjs");
  const { reconcileIntakeBatchCancellations } = await import("../lib/reconciler-batches.mjs");
  const { withRuntime } = await import("../lib/pools.mjs");

  const asRuntime = (sql, params) => rig.asRuntime((c) => c.query(sql, params)).then((r) => r.rows[0]);
  const getBatch = (sub, batch, preview = 25) => rig.humanQuery(sub,
    "select clara.get_intake_batch($1::uuid,$2::int) as r", [batch, preview]).then((r) => r.rows[0].r);
  const batchState = (id) => rig.rootQuery(
    "select state, cancelled_at from clara.intake_batches where id=$1", [id]).then((r) => r.rows[0]);


  async function ensureChart(owner, client) {
    for (const [code, name, type] of [["6100", "Rent expense", "expense"], ["1100", "Maybank current", "asset"]]) {
      await rig.humanQuery(owner,
        "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
        [client, code, name, type, `p636-coa-${randomUUID()}`]);
    }
  }

  /** The browser's own attribution act, through the estate's real doors. */
  async function fileToClient(owner, documentId, client) {
    const res = await rig.humanQuery(owner,
      `select clara.record_client_resolution(p_client => $1, p_subject_kind => 'document', p_subject => $2,
         p_confidence => 1.0, p_method => 'human', p_evidence => '{"source":"p636-e2e"}'::jsonb,
         p_op_key => $3) as out`,
      [client, documentId, `p636-res-${randomUUID()}`]);
    const out = res.rows[0].out;
    await rig.humanQuery(owner,
      "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4)",
      [documentId, client, out?.resolution_id ?? out, `p636-file-${randomUUID()}`]);
  }

  /** A Work naming `documentId`, through the REAL admission door. The 0229 trigger stamps it. */
  const admitWork = (client, owner, documentId) => asRuntime(
    "select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,'user_direct',$5::jsonb,$6::text) as r",
    [client, owner, `p636-${randomUUID()}`, JSON.stringify(basis()),
      JSON.stringify([{ kind: "document", document_id: documentId }]), rig.DEFAULT_MODEL]).then((r) => r.r);

  const claimRun = (task, runId) => asRuntime(
    "select clara.claim_work_run($1::uuid,$2::text,$3::jsonb) as r",
    [task, runId, JSON.stringify({ id: "clara-work/v3", digest: "f".repeat(64), model: rig.DEFAULT_MODEL })]);

  async function authoriseWorkEgress(workId, runId) {
    try {
      const task = (await rig.rootQuery(
        "select current_task_id from clara.accounting_work where id=$1", [workId])).rows[0]?.current_task_id;
      if (!task) return;
      const prepared = (await asRuntime(
        "select clara.prepare_work_egress_dispatch($1::uuid,$2::text) as r", [task, runId])).r;
      if (prepared?.verdict !== "granted") return;
      await asRuntime(
        "select clara.consume_egress_dispatch($1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint,$6::text,$7::text) as r",
        [prepared.firm_id, prepared.authorization_id, prepared.client_id, prepared.purpose,
          String(prepared.event_seq), prepared.event_type, null]);
    } catch (err) { if (err?.code !== "42883") throw err; }
  }

  /** A COMMITTED operation receipt, the honest way: the real posting core under a real credential.
   *
   *  IT RETRIES THROUGH THE REAL DOOR, and the reason is measured. The leader is NUDGED by
   *  `listen clara_events`, so its cadence knob cannot keep it out of the way; its accounting-work
   *  belt settles a RUNNING Work whose engine run the World does not know, and this fixture's run
   *  ids are synthetic, so a Work can settle `failed` between the claim and the post. That is the
   *  estate behaving correctly. The fixture answers it the way a person would — `clara.
   *  retry_accounting_work`, the REAL recovery door — and the receipt law still holds: exactly one
   *  committed receipt per logical identity, however many attempts it took. */
  async function postEntry({ firm, owner, client, workId, logicalOpId }) {
    const TERMINAL = new Set(["completed", "refused", "failed", "cancelled", "expired"]);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const w = (await rig.rootQuery(
        "select current_task_id, status from clara.accounting_work where id=$1", [workId])).rows[0];
      if (TERMINAL.has(w.status)) {
        const committed = await rig.rootQuery(
          "select count(*)::int n from clara.operation_receipts where work_id=$1 and outcome='committed'", [workId]);
        if (committed.rows[0].n > 0) return;           // already posted; nothing to redo
        await asRuntime("select clara.retry_accounting_work($1::uuid,$2::uuid,$3::text) as r",
          [workId, owner, `p636-retry-${randomUUID()}`]);
        continue;
      }
      const runId = `p636-run-${randomUUID()}`;
      try { await claimRun(w.current_task_id, runId); } catch { continue; }
      await authoriseWorkEgress(workId, runId);
      const cred = (await rig.rootQuery(
        "select credential_id, secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)",
        ["interactive_client", firm, owner, "15 minutes", client])).rows[0];
      const c = await rig.getPool().connect();
      let posted = false;
      try {
        await c.query("set role clara_wake_interactive");
        await c.query("begin");
        await c.query("select set_config('clara.wake_secret', $1, true)", [cred.secret]);
        await c.query(
          "select clara.wake_record_journal_entry($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::text,$7::text) as r",
          [client, workId, logicalOpId, JSON.stringify(basis()), "f".repeat(64), runId, "#636 rig"]);
        await c.query("commit");
        posted = true;
      } catch (err) {
        if (err?.code !== "CLR13") throw err;          // anything but "the belt got there first"
      } finally {
        await c.query("rollback").catch(() => {});
        await c.query("reset role").catch(() => {});
        await c.query("reset all").catch(() => {});
        c.release();
      }
      if (!posted) continue;
      await settleRun(w.current_task_id, "completed").catch(() => {});
      return;
    }
    throw new Error(`postEntry: could not reach a committed receipt for work ${workId}`);
  }

  const settleRun = (task, outcome) => asRuntime(
    "select clara.settle_work_run($1::uuid,$2::text,null::text,null::jsonb,null::jsonb) as r", [task, outcome]);

  // =========================================================================================
  // LEG 1 — THE HEADLINE, on the real HTTP transport.
  // =========================================================================================
  const A = await rig.buildFirm("p636-headline");
  await ensureChart(A.owner, A.client);
  const jwtA = await mint(A.owner);
  const parent = await withRuntime((c) => openBatch(c, {
    actor: A.owner, origin: "documents_tab", label: "April source batch",
    opKey: `p636-open-${randomUUID()}`,
  }));
  assert.equal(parent.status, "ok", `the batch opened: ${JSON.stringify(parent)}`);
  const batchId = parent.batch.batch_id;

  const started = Date.now();
  const members = [];
  const hostFlaked = [];
  for (let i = 0; i < MEASURED_N; i += 1) {
    const bytes = pdfBytes(`p636-${i}-${randomUUID()}`);
    const begun = await fetch(`${BASE}/api/intake/documents`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwtA}`, "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        filename: `source-${i}.pdf`, mime: "application/pdf", declared_bytes: bytes.length,
        origin: "documents_tab", batch_id: batchId,
      }),
    });
    assert.equal(begun.status, 201, `child ${i} began (got ${begun.status})`);
    const body = await begun.json();
    assert.equal(body.batch_id, batchId, "the begin answer names the batch it joined");
    assert.ok(body.member_id, "…and the membership id, because both committed in ONE transaction");
    const put = await fetch(`${BASE}/api/intake/documents/${body.intake_id}/bytes`, {
      method: "PUT",
      headers: { authorization: `Bearer ${body.upload_token}`, "content-type": "application/octet-stream", origin: ORIGIN },
      body: bytes,
    });
    // FIX ROUND 1: the PUT is treated exactly as the finalize below already is. The same Windows
    // file-locking family costs a child here too — the recovery belt OPENS every spool sidecar on
    // each sweep, so on a World that carries a backlog of stale ingest tasks a `rename()` in this
    // route loses the race and the route answers 500. Counting it beside the finalize flakes is
    // the honest treatment; asserting 204 hard made ONE host flake at child 84 of 100 throw away a
    // 45-minute leg that had proven nothing yet. The leg still refuses to say anything on a run
    // that lost too many children (`members.length >= 10`), and every child is accounted for.
    if (put.status !== 204) {
      hostFlaked.push({ i, stage: "put", status: put.status,
        detail: (await put.text().catch(() => "")).slice(0, 200) });
      continue;
    }
    // (b) THE ONE THAT FAILS: its bytes arrived and then the estate's OWN failure door refused it,
    // so it is a member with an intake and no document — the honest shape of a failed source.
    if (i === MEASURED_N - 4) {
      await asRuntime("select clara.fail_document_intake($1::uuid,$2::text,$3::text) as r",
        [body.intake_id, "storage_error", `p636-fail-${randomUUID()}`]);
      members.push({ i, intake: body.intake_id, member: body.member_id, document: null });
      continue;
    }
    const sealed = await fetch(`${BASE}/api/intake/documents/${body.intake_id}/finalize`, {
      method: "POST",
      headers: { authorization: `Bearer ${body.upload_token}`, "content-type": "application/json", origin: ORIGIN },
      body: "{}",
    });
    // A HOST FLAKE, COUNTED RATHER THAN HIDDEN. On Windows `rename()` over a destination another
    // handle has open fails EPERM, and the reconciler's intake-recovery belt OPENS every spool
    // sidecar on each sweep (`listIntakeMetas`) — so a sweep landing between two `writeIntakeMeta`
    // calls fails that child's finalize with `internal`. It is the #693 family (a Windows-only
    // file-locking property of this host), not a property of the batch, and this leg records how
    // many children it cost rather than pretending they succeeded.
    if (sealed.status !== 202) {
      const detail = await sealed.text().catch(() => "");
      hostFlaked.push({ i, stage: "finalize", status: sealed.status, detail: detail.slice(0, 200) });
      continue;
    }
    const receipt = await sealed.json();
    members.push({ i, intake: body.intake_id, member: body.member_id, document: receipt.document_id });
  }
  if (hostFlaked.length > 0) {
    console.log(`[p636] ${hostFlaked.length} child(ren) lost to the Windows EPERM spool race (#693 family): ${JSON.stringify(hostFlaked)}`);
  }
  assert.ok(members.length >= 10,
    `too many children were lost to the host (${hostFlaked.length} of ${MEASURED_N}) for this leg to say anything`);
  console.log(`[p636] ${MEASURED_N} children uploaded in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // THE FIVE THAT WAIT / FAIL / STAY UNASSIGNED, each for its OWN reason.
  const landed = members.length;
  const waiter = members[landed - 5];
  const failer = members.find((m) => m.document === null) ?? members[landed - 4];
  const unassignedA = members[landed - 3];
  const unassignedB = members[landed - 2];
  const capacityWaiter = members[landed - 1];
  const persistent = members.filter((m) => m.document !== null
    && m !== waiter && m !== unassignedA && m !== unassignedB && m !== capacityWaiter);

  await asRuntime(
    "select clara.set_intake_batch_member_dependency($1::uuid,$2::uuid,'awaiting_fact',$3::text,$4::text) as r",
    [A.owner, waiter.intake, "which client does this belong to?", `p636-dep-${randomUUID()}`]);
  await asRuntime("select clara.set_intake_batch_member_dependency($1::uuid,$2::uuid,'awaiting_capacity',$3::text,$4::text) as r",
    [A.owner, capacityWaiter.intake, "document daily limit reached (docs)", `p636-dep-${randomUUID()}`]);
  // (b) already FAILED in the upload loop, through clara.fail_document_intake — the estate's own
  // door, not fixture DML. A processing task cannot be hand-failed (`illegal document processing
  // transition queued -> failed`, measured), and a fabricated one would prove nothing anyway.
  assert.equal(failer.document, null, "the failed child never reached custody");
  // (c) STAYS UNASSIGNED: unassignedA/B are simply never filed.
  void unassignedA; void unassignedB;

  const posted = [];
  for (const m of persistent) {
    await fileToClient(A.owner, m.document, A.client);
    const admitted = await admitWork(A.client, A.owner, m.document);
    await postEntry({ firm: A.firm, owner: A.owner, client: A.client, workId: admitted.work_id,
      logicalOpId: admitted.logical_op_id });
    posted.push({ ...m, ...admitted });
  }

  const pack = await getBatch(A.owner, batchId);
  console.log(`[p636] facets: ${JSON.stringify(Object.fromEntries(
    Object.entries(pack.facets).map(([k, v]) => [k, v.count])))}`);
  assert.equal(pack.facets.admitted.count, persistent.length,
    `${persistent.length} children reached admitted Work (of ${landed} that landed, from ${MEASURED_N} uploaded)`);
  assert.equal(pack.facets.settled.count, persistent.length,
    "…and every one of them holds a COMMITTED operation receipt");
  assert.equal(persistent.length + 5 + hostFlaked.length, MEASURED_N,
    "every uploaded child is accounted for: persistent + the five + whatever the host lost");
  // THE FIVE THAT DID NOT are accounted for INDEPENDENTLY, each under its own facet — and the
  // populations are reported SEPARATELY (F6), never rolled into one "not done" number. The facets
  // OVERLAP by construction, so this is a lower bound on their union, never a sum.
  assert.ok(pack.facets.waiting.count + pack.facets.failed.count >= 5,
    `waiting=${pack.facets.waiting.count} + failed=${pack.facets.failed.count} accounts for the five`);
  assert.equal(pack.waiting_basis.by_dependency.awaiting_fact, 1);
  assert.equal(pack.waiting_basis.by_dependency.awaiting_capacity, 1);
  assert.ok(pack.facets.failed.count >= 1, "the extraction failure is FAILED, never waiting");
  // FIX ROUND 1, ADV-636-05: the failed/waiting arms used to be LOWER bounds only, so this leg
  // passed on the run that reported 35 failed children of which 31 had already posted (ADV-636-02).
  // A lower bound cannot tell 35 from 4. These two are the disjointness the product promises.
  // The bound is over UPLOADED children, not landed ones: a child lost to the host flake above is
  // still a MEMBER — `begin` commits the membership in the same transaction as the intake — and
  // the route's own catch arm fails its intake, so it legitimately lands in `failed`. What must
  // never happen is a member counted as failed AND as settled.
  assert.ok(pack.facets.failed.count <= MEASURED_N - persistent.length,
    `a member that POSTED is never also failed, so failed (${pack.facets.failed.count}) cannot `
    + `exceed the children that did not post (${MEASURED_N - persistent.length} of ${MEASURED_N})`);
  const settledIds = new Set(pack.facets.settled.rows.map((r) => r.work_id));
  const alsoFailed = pack.facets.failed.rows.filter((r) => r.work_id && settledIds.has(r.work_id));
  assert.deepEqual(alsoFailed, [],
    "no previewed child appears under BOTH settled and failed — 'business-complete' and "
    + "'extraction failed' are not compatible states the way 'admitted' and 'waiting' are");
  assert.ok(pack.facets.unassigned.count >= 2, "the unfiled sources are UNASSIGNED");
  assert.equal(typeof pack.pending_members, "number",
    "the door reports how many members are still in flight — the count the stop dialog needs");
  assert.equal(pack.cancel_blocked, null, "nothing about this batch's stop is blocked");
  assert.equal(pack.capacity.resets_at_local, "08:00");
  assert.ok(!("total" in pack) && !("total" in pack.facets.admitted),
    "no denominator anywhere — AC3 forbids a fabricated percentage");

  // =========================================================================================
  // LEG 5 — THE CAPACITY WALL, end to end on the real route, ON ITS OWN FIRM so leg 1's host
  // flakes (a failed intake REFUNDS its reservation) cannot move the ceiling under it.
  // =========================================================================================
  const W = await rig.buildFirm("p636-wall");
  const jwtW = await mint(W.owner);
  const wBatch = (await withRuntime((c) => openBatch(c, {
    actor: W.owner, label: "at the wall", opKey: `p636-open-${randomUUID()}` }))).batch.batch_id;
  const createIntake = `select clara.create_document_intake($1::uuid,'documents_tab',null::uuid,$2::text,
      'application/pdf',1048576::bigint,$3::text,$4::timestamptz,$5::text) as r`;
  for (let i = 0; i < 100; i += 1) {
    await asRuntime(createIntake, [W.owner, `wall-${i}.pdf`, sha(`p636-wall-${W.firm}-${i}`),
      new Date(Date.now() + 900_000).toISOString(), `p636-wall-${randomUUID()}`]);
  }
  const overflow = pdfBytes("p636-overflow");
  const refused = await fetch(`${BASE}/api/intake/documents`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwtW}`, "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      filename: "one-too-many.pdf", mime: "application/pdf", declared_bytes: overflow.length,
      origin: "documents_tab", batch_id: wBatch,
    }),
  });
  assert.equal(refused.status, 429, "the 101st file is refused at the measured daily ceiling");
  assert.equal((await refused.json()).error, "limit");
  const wallMembers = await rig.rootQuery(
    "select count(*)::int n from clara.intake_batch_members where batch_id=$1", [wBatch]);
  assert.equal(wallMembers.rows[0].n, 0,
    "THE NAMED RESIDUAL, executed: a file refused BEFORE its intake exists never becomes a member — the member's identity IS its intake");

  // =========================================================================================
  // LEG 2 — CANCEL-REMAINING keeps every committed receipt.
  // =========================================================================================
  const B = await rig.buildFirm("p636-cancel");
  await ensureChart(B.owner, B.client);
  const bBatch = (await withRuntime((c) => openBatch(c, {
    actor: B.owner, label: "cancel me", opKey: `p636-open-${randomUUID()}` }))).batch.batch_id;
  const bChildren = await seedChildren(B, bBatch, 3);
  // one committed, one running, one queued
  await postChild(B, bChildren[0]);
  await claimRun(bChildren[1].task_id, `p636-run-${randomUUID()}`);
  const bKey = `p636-cancel-${randomUUID()}`;
  const cancelled = await cancelBatch(withRuntime, { actor: B.owner, batchId: bBatch, opKey: bKey });
  assert.equal(cancelled.status, "ok");
  assert.equal(cancelled.decision.state, "cancelling", "never terminal while a child is live");
  assert.equal(cancelled.decision.children.length, 2, "the committed child is not a cancellation target");
  const survivingReceipt = await rig.rootQuery(
    "select count(*)::int n from clara.operation_receipts where work_id=$1 and outcome='committed'",
    [bChildren[0].work_id]);
  assert.equal(survivingReceipt.rows[0].n, 1, "the committed receipt survived the cancellation");
  const bPack = await getBatch(B.owner, bBatch);
  assert.equal(bPack.facets.settled.count, 1, "and the card REVEALS it while stopping");

  // =========================================================================================
  // LEG 3 — p636.batch.cancel_resume.
  // =========================================================================================
  const C = await rig.buildFirm("p636-resume");
  await ensureChart(C.owner, C.client);
  const cBatch = (await withRuntime((c) => openBatch(c, {
    actor: C.owner, label: "resume me", opKey: `p636-open-${randomUUID()}` }))).batch.batch_id;
  const cChildren = await seedChildren(C, cBatch, RESUME_N);
  const committedIds = [];
  for (const child of cChildren.slice(0, 5)) {
    await postChild(C, child);
    committedIds.push(child.work_id);
  }
  const cKey = `p636-resume-${randomUUID()}`;
  const decision = await withRuntime((c) => c.query(
    "select clara.cancel_intake_batch($1::uuid,$2::uuid,$3::text) as r", [C.owner, cBatch, cKey]))
    .then((r) => r.rows[0].r);
  assert.equal(decision.state, "cancelling");
  const live = decision.children;
  // THE FIVE THAT COMMITTED ARE NOT LIVE — asserted by IDENTITY, not by arithmetic. The World is
  // running, so some of the other children may legitimately have settled on their own between the
  // seed and the decision; what must never happen is a committed child appearing on a
  // cancellation worklist.
  const liveWorkIds = new Set(live.map((c) => c.work_id));
  for (const workId of committedIds) {
    assert.ok(!liveWorkIds.has(workId),
      "a child holding a COMMITTED receipt is never a cancellation target — its receipt is a fact");
  }
  assert.ok(live.length >= 2 && live.length <= RESUME_N - committedIds.length,
    `the live child list is the un-committed remainder (${live.length} of at most ${RESUME_N - committedIds.length})`);

  // THE INTERRUPTION: the first half of the fan-out runs, then the process "dies". Each child's
  // cancel is its OWN transaction, so this is exactly the durable state a SIGKILL leaves behind.
  const half = Math.floor(live.length / 2);
  for (const child of live.slice(0, half)) {
    await withRuntime((c) => c.query(
      "select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as r",
      [child.work_id, decision.cancel_requested_by, childCancelKey(decision.cancel_op_key, child.work_id)]));
  }
  const midway = await batchState(cBatch);
  assert.equal(midway.state, "cancelling", "the parent is still stopping — nothing is terminal early");

  // THE RESUME. The belt reads the worklist from the door, re-issues with the STORED decision.
  const beltOut = await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
  assert.equal(beltOut.batchCancelOk, true);
  console.log(`[p636] belt after the interruption: ${JSON.stringify(beltOut)}`);

  // NO CHILD WAS CANCELLED TWICE: every governed decision leaves exactly one op receipt per
  // (firm, fn, op_key), and the replayed halves returned the STORED result rather than deciding
  // again. The ledger is the witness.
  const opReceipts = await rig.rootQuery(
    `select count(*)::int n from clara.op_receipts
      where fn='cancel_accounting_work' and op_key like $1`, [`${cKey}:%`]);
  assert.equal(opReceipts.rows[0].n, live.length,
    `exactly one op receipt per live child (${opReceipts.rows[0].n} of ${live.length}) — none decided twice, none skipped`);

  // Every already-committed child still answers `already_completed` with its receipt id.
  for (const workId of committedIds) {
    const again = await withRuntime((c) => c.query(
      "select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as r",
      [workId, C.owner, `p636-postcheck-${randomUUID()}`])).then((r) => r.rows[0].r);
    assert.ok(again.receipt_id || again.status === "completed" || again.already_completed,
      `a committed child answers its own arm, never a cancellation: ${JSON.stringify(again)}`);
    const kept = await rig.rootQuery(
      "select count(*)::int n from clara.operation_receipts where work_id=$1 and outcome='committed'", [workId]);
    assert.equal(kept.rows[0].n, 1, "…and its receipt is untouched");
  }

  // The parent reaches terminal EXACTLY once: settle the stopped runs, then sweep twice.
  for (const child of live) {
    const task = (await rig.rootQuery(
      "select current_task_id from clara.accounting_work where id=$1", [child.work_id])).rows[0].current_task_id;
    if (task) await settleRun(task, "cancelled").catch(() => {});
  }
  await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
  const finalState = await batchState(cBatch);
  assert.equal(finalState.state, "cancelled", "the parent settled");
  assert.ok(finalState.cancelled_at, "…and it is dated");
  // EXACTLY ONCE, asserted about THIS parent rather than about the belt's global counter (other
  // firms' parents settle in the same sweep): a second sweep does not re-date it. The guard is the
  // state, so the flip is idempotent and convergent.
  await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
  const stillFinal = await batchState(cBatch);
  assert.equal(stillFinal.state, "cancelled");
  assert.equal(stillFinal.cancelled_at.toISOString(), finalState.cancelled_at.toISOString(),
    "a second sweep does not re-stamp a settled parent — the terminal flip happened exactly once");

  // =========================================================================================
  // LEG 4 — p636.poison.cross_firm.
  // =========================================================================================
  const P = await rig.buildFirm("p636-poison");
  await ensureChart(P.owner, P.client);
  const Q = await rig.buildFirm("p636-healthy");
  await ensureChart(Q.owner, Q.client);
  // The poisoned parent's decision is made by a BOOKKEEPER, not the owner: the estate refuses to
  // remove a firm's last active owner (`cannot demote/remove the last active owner`, measured), so
  // a poison that revoked the owner would be testing that wall instead of this belt.
  const pAgent = await rig.addMember(P.owner, P.firm, { role: "bookkeeper", prefix: "p636poison" });
  const pBatch = (await withRuntime((c) => openBatch(c, {
    actor: pAgent, label: "poisoned", opKey: `p636-open-${randomUUID()}` }))).batch.batch_id;
  const qBatch = (await withRuntime((c) => openBatch(c, {
    actor: Q.owner, label: "healthy", opKey: `p636-open-${randomUUID()}` }))).batch.batch_id;
  const pChildren = await seedChildren(P, pBatch, 2);
  const qChildren = await seedChildren(Q, qBatch, 2);
  if (LEG4_FAULT === "slow_settle") {
    // The `slow_settle` fault needs firm Q's children RUNNING, because that is the only shape in
    // which the settle is load-bearing at all: a child the World has not dispatched yet is
    // terminalised by `cancel_accounting_work` itself, and its parent settles on the next sweep
    // with or without this leg's settles. MEASURED here: with Q's children left queued, the
    // gated-shut settle changed nothing and the leg still passed (run clara_925). CI's failing
    // run had them dispatched, which is why its settle mattered — so the fault claims a run on
    // each, exactly as LEG 2 does to hold a child live.
    for (const child of qChildren) await claimRun(child.task_id, `p636-leg4-fault-${randomUUID()}`);
  }
  await withRuntime((c) => c.query("select clara.cancel_intake_batch($1::uuid,$2::uuid,$3::text)",
    [Q.owner, qBatch, `p636-healthy-${randomUUID()}`]));
  // THE POISON: firm P's stored actor loses its membership, so EVERY child of that parent refuses
  // CLR04 for ever. Labelled fixture DML; the estate's own removal door is clara.remove_member.
  const applyPoison = async () => {
    await withRuntime((c) => c.query("select clara.cancel_intake_batch($1::uuid,$2::uuid,$3::text)",
      [pAgent, pBatch, `p636-poison-${randomUUID()}`]));
    await rig.rootQuery("update clara.firm_memberships set status='removed' where user_id=$1 and firm_id=$2",
      [pAgent, P.firm]);
  };
  const faultWork = [];
  if (LEG4_FAULT === "late_poison") {
    // THE FAULT: the poisoned parent's own decision lands AFTER the first sweep, so that sweep has
    // nothing of firm P's to refuse and reports `batchCancelFailed: 0` — CI job 105954490814's red
    // on `main`, made deterministic. Nothing about the belt changes; only WHEN the fixture acts.
    faultWork.push(sleep(LEG4_FAULT_MS).then(applyPoison).then(
      () => console.log(`[p636] LEG4 FAULT: the poisoned parent's decision landed ${LEG4_FAULT_MS}ms late`),
      (err) => console.error(`[p636] LEG4 FAULT: late poison FAILED — ${err?.message ?? err}`)));
  } else {
    await applyPoison();
  }
  /** WHAT A DEADLINE IN THIS LEG SAYS. Both firms by name, both parents by id, the state actually
   *  observed on each, every child's Work status and current task, the last belt receipt and how
   *  long the leg waited — read FRESH at the moment of failure, so a red in CI is diagnosable from
   *  the job log alone (the whole point of #1027: the two reds it replaces said only
   *  `actual: 'cancelling'`). */
  async function leg4Diagnosis(headline, { sweeps, elapsedMs, receipt, settles = null }) {
    const census = async (ids) => (await rig.rootQuery(
      "select id, status, current_task_id from clara.accounting_work where id = any($1::uuid[]) order by id",
      [ids])).rows;
    const [p, q] = [await batchState(pBatch), await batchState(qBatch)];
    return `${headline} — after ${sweeps} sweep(s) in ${elapsedMs}ms `
      + `(deadline ${LEG4_DEADLINE_MS}ms, poll ${LEG4_POLL_MS}ms).\n`
      + `  firm P (poisoned) parent=${pBatch} state=${p?.state} `
      + `children=${JSON.stringify(await census(pChildren.map((c) => c.work_id)))}\n`
      + `  firm Q (healthy)  parent=${qBatch} state=${q?.state} `
      + `children=${JSON.stringify(await census(qChildren.map((c) => c.work_id)))}\n`
      + `  last belt receipt: ${JSON.stringify(receipt)}`
      + (settles ? `\n  settles: ${JSON.stringify(settles)}` : "");
  }

  // (1) FIRM P'S REFUSALS ARE COUNTED — over the polled sweeps, never from a single one. The
  //     count is CUMULATIVE: a refusal seen on any sweep is a refusal counted, and 0 across the
  //     whole deadline is the failure.
  const leg4StartedAt = Date.now();
  const pWatch = { sweeps: 0, refusals: 0, blocked: 0, receipt: null };
  for (;;) {
    pWatch.sweeps += 1;
    const sweep = await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
    pWatch.receipt = sweep;
    // UNCHANGED, AND NOW ASSERTED ON EVERY SWEEP rather than on one: a belt that says "we do not
    // know" is a failure to report at once, never something to poll through.
    assert.equal(sweep.batchCancelOk, true,
      "a permanently-refusing firm never makes the belt claim 'we do not know' about the whole estate");
    pWatch.refusals += (sweep.batchCancelFailed ?? 0);
    pWatch.blocked += (sweep.batchCancelBlocked ?? 0);
    if (pWatch.refusals >= 1) break;
    if (Date.now() - leg4StartedAt >= LEG4_DEADLINE_MS) {
      throw new Error(await leg4Diagnosis(
        "firm P's refusals are COUNTED, not swallowed: batchCancelFailed stayed 0",
        { sweeps: pWatch.sweeps, elapsedMs: Date.now() - leg4StartedAt, receipt: sweep }));
    }
    await sleep(LEG4_POLL_MS);
  }
  console.log(`[p636] LEG4 firm P refusals COUNTED: ${pWatch.refusals} refusal(s), `
    + `blocked=${pWatch.blocked}, over ${pWatch.sweeps} sweep(s) in ${Date.now() - leg4StartedAt}ms`);
  assert.ok(pWatch.refusals >= 1, "firm P's refusals are COUNTED, not swallowed");

  // (2) Firm Q's children were still asked, and its parent settles once its runs do — polled to
  //     the same deadline, with the settle RETRIED inside it and its failure never discarded.
  // THE SECOND FAULT: `slow_settle` holds every settle back for `CLARA_P636_LEG4_FAULT_MS`, which
  // is the documented mechanism of CI job 106051996127's red — "a settle that has not landed by
  // the time the second sweep runs leaves firm Q's parent in `cancelling`".
  const settleGateUntil = LEG4_FAULT === "slow_settle" ? Date.now() + LEG4_FAULT_MS : 0;
  const settleGateOpen = () => Date.now() >= settleGateUntil;
  const qSettles = qChildren.map((child) => ({ work_id: child.work_id, task_id: null, settled: false, error: null }));
  const qWatch = { sweeps: 0, state: null, receipt: null };
  const qStartedAt = Date.now();
  for (;;) {
    for (const s of qSettles) {
      if (s.settled) continue;
      const task = (await rig.rootQuery(
        "select current_task_id from clara.accounting_work where id=$1", [s.work_id])).rows[0]?.current_task_id;
      s.task_id = task ?? s.task_id;
      if (!task) { s.error = "no current task to settle at this poll"; continue; }
      if (!settleGateOpen()) { s.error = `held back by CLARA_P636_LEG4_FAULT=${LEG4_FAULT}`; continue; }
      try {
        await settleRun(task, "cancelled");
        s.settled = true; s.error = null;
      } catch (err) {
        // #1027: NEVER `.catch(() => {})` again. A settle that cannot be performed is RETRIED on
        // the next poll, and if the deadline expires it is named — task id and last error — in
        // the failure message instead of vanishing.
        s.error = `${err?.code ?? ""} ${err?.message ?? err}`.trim();
      }
    }
    qWatch.sweeps += 1;
    qWatch.receipt = await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
    assert.equal(qWatch.receipt.batchCancelOk, true,
      "a permanently-refusing firm never makes the belt claim 'we do not know' about the whole estate");
    qWatch.state = (await batchState(qBatch))?.state ?? null;
    if (qWatch.state === "cancelled") break;
    if (Date.now() - qStartedAt >= LEG4_DEADLINE_MS) {
      throw new Error(await leg4Diagnosis(
        "firm Q's batch, swept in the SAME belt call as firm P's poison, never reached its terminal state",
        { sweeps: qWatch.sweeps, elapsedMs: Date.now() - qStartedAt, receipt: qWatch.receipt, settles: qSettles }));
    }
    await sleep(LEG4_POLL_MS);
  }
  console.log(`[p636] LEG4 firm Q terminal after ${qWatch.sweeps} sweep(s) in ${Date.now() - qStartedAt}ms; `
    + `settles=${JSON.stringify(qSettles)}`);
  assert.equal(qWatch.state, "cancelled",
    "firm Q's batch, swept in the SAME belt call as firm P's poison, still reached its terminal state");
  // THE DISJOINTNESS, unpolled ON PURPOSE: this one is a NEGATIVE, and a negative that converges
  // is a negative that was never true. It is read once, at the end, and its message carries the
  // same census as a deadline would — firm P's parent going terminal here means its children went
  // terminal on their own (the World ran them), which is a different fact from the two above and
  // must not be mistaken for one.
  const pFinal = await batchState(pBatch);
  const pTail = pFinal?.state === "cancelling" ? "" : `\n  ${await leg4Diagnosis(
    "firm P was declared done while this leg watched",
    { sweeps: pWatch.sweeps + qWatch.sweeps, elapsedMs: Date.now() - leg4StartedAt, receipt: qWatch.receipt })}`;
  assert.equal(pFinal.state, "cancelling",
    "…and firm P's is honestly still stopping, rather than silently declared done" + pTail);
  void pChildren;
  await Promise.all(faultWork);

  console.log("[p636] intake-batch-e2e: ALL LEGS PASSED");
  await rig.endPool?.().catch?.(() => {});
  process.exit(0);

  // -------------------------------------------------------------------------------------------
  /** N members of `firm`, each with a document in custody, filed, and an admitted Work.
   *  The verified intake is LABELLED fixture DML (no single door drives bytes to `verified`
   *  without a real upload); `clara.finalize_document_intake` — the REAL door — creates the
   *  document, which is what 0229's custody trigger keys on. */
  async function seedChildren(f, batch, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const digest = sha(`${batch}-${i}-${randomUUID()}`);
      const intake = (await rig.rootQuery(
        `insert into clara.document_intakes(firm_id,uploaded_by,origin,original_filename,declared_mime,
           declared_bytes,status,sha256,storage_key,op_key)
         values ($1,$2,'documents_tab',$3,'application/pdf',2048,'verified',$4,$5,$6) returning id`,
        [f.firm, f.owner, `seed-${i}.pdf`, digest, `firms/${f.firm}/docs/${digest}.pdf`,
          `p636-seed-${randomUUID()}`])).rows[0].id;
      await asRuntime("select clara.attach_intake_to_batch($1::uuid,$2::uuid,$3::uuid,$4::text) as r",
        [f.owner, batch, intake, `p636-attach-${randomUUID()}`]);
      // `clara-fixture:%` is the DECLARED test-namespace engine, admitted on any lane by
      // ck_processing_task_lane_engine_0015 — the same escape rig-docs-fixtures' finalizeIntake
      // relies on. A null engine_id is a NOT NULL violation, not a default.
      await asRuntime("select clara.finalize_document_intake($1::uuid,null::text,$2::text,'{}'::jsonb,1::int,'ocr'::text,null::uuid,null::uuid,$3::text) as r",
        [intake, "clara-fixture:v1", `p636-fin-${randomUUID()}`]);
      const document = (await rig.rootQuery(
        "select document_id from clara.document_intakes where id=$1", [intake])).rows[0].document_id;
      await fileToClient(f.owner, document, f.client);
      const admitted = await admitWork(f.client, f.owner, document);
      out.push({ intake, document, ...admitted });
    }
    return out;
  }

  async function postChild(f, child) {
    await postEntry({ firm: f.firm, owner: f.owner, client: f.client, workId: child.work_id,
      logicalOpId: child.logical_op_id });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
