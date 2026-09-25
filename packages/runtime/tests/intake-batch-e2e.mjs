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
//      the database's own sentence, and (since #965 / migration 0254) the refused file leaves a
//      COMMITTED intake at failed/limit that IS a member of the batch, carrying an explicit
//      `awaiting_capacity` wait. Before #965 the raise rolled that intake back, so the file could
//      not be a member and this leg asserted that absence as a named residual.
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
import { startHeapBound, MiB } from "./heap-bound.mjs";
import { DB_NAME_SHAPE, allowedDbPattern, assertLocalDbGate } from "./local-db-gate.mjs";

// Fail-closed local gate (#1018: shared with every other standalone World e2e driver). The
// trailing `_world` shape is intake-admission-e2e's `clara_<ddd>` PLUS the world-suffixed variant
// this leg's own precedent already used — the suffix applies after WHICHEVER of the three names
// matched, not only after the per-ticket digits.
assertLocalDbGate({
  label: "intake-batch-e2e",
  pattern: allowedDbPattern(
    `${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.INTAKE_CI}|${DB_NAME_SHAPE.PER_TICKET}`,
    { outerOptionalSuffix: "_world" },
  ),
  checkDsnString: true,
});

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
// READING A DEADLINE THAT DOES FIRE, AND THE DISCRIMINATOR THAT MAKES IT READABLE. The message
// carries both firms, both parents, both states, every child's Work status, the cumulative refusal
// and BLOCKED counts and the estate's own per-parent `cancel_blocked` verdict. Firm P's children
// reading `failed` is CONSISTENT WITH, but does not by itself establish, the separate #1028 race
// below: the same census appears when the belt stops counting refusals at all, which is what this
// leg's vacuity control produces. What tells them apart is the blocked signal — `blocked >= 1` with
// `cancel_blocked=canceller_not_active` means the belt DID refuse firm P's children and the parent
// went terminal because the World had already terminalised them (the #1028 race, recorded rather
// than failed — see the LEG 4 disjointness check below); `blocked = 0` with `refusals = 0` means
// the belt is not counting firm P's refusals, which is a regression in the belt and is this leg's
// business.
//
// THE FAULT KNOB STAYS, DELIBERATELY (review SPEC-1027-04). It is the only way to re-run the red
// this fix removes, it is how the fix round re-verified both deadlines, and it is inert by default
// on both branches (`LEG4_FAULT` empty, `settleGateUntil` 0).
//
// TWO DEADLINES, NOT ONE, AND EACH IS MEASURED (review SPEC-1027-01).
//   P-loop 5 s. The worst lateness ever measured for the refusal is 1516 ms (4 sweeps under
//   `late_poison` at 1.5 s, throwaway clara_929) against 10-102 ms unperturbed, so this is 3.3x the
//   worst case. It is also WELL under the ~8 s in which the World drives firm P's OWN children to
//   `failed` (clara_922, clara_927, clara_933): past that point the belt correctly settles firm P's
//   parent and the disjointness assertion below reds whatever this loop does, so a longer deadline
//   here cannot buy a pass. It buys a LATER red, in a different place, with a census that looks
//   like a different defect. Five seconds is the largest number that is still inside the band where
//   waiting can still help.
//   Q-loop 8 s. The worst measured convergence is 2774 ms (6 sweeps under `slow_settle`,
//   clara_928 — where this leg's own settles never landed at all and the WORLD drove the runs
//   terminal), so this is 2.9x it. It is deliberately larger than the P-loop's because the fact it
//   waits for is produced by the engine rather than by this fixture, and it still leaves LEG 4's
//   total polling bounded by 13 s against the 60 s one shared 30 s constant allowed.
const LEG4_P_DEADLINE_MS = Number(process.env.CLARA_P636_LEG4_P_DEADLINE_MS || 5000);
const LEG4_Q_DEADLINE_MS = Number(process.env.CLARA_P636_LEG4_Q_DEADLINE_MS || 8000);
const LEG4_POLL_MS = Number(process.env.CLARA_P636_LEG4_POLL_MS || 500);
// THE FAULT KNOB, on `CLARA_WORK_TEST_FAULT`'s precedent: inert unless asked for, and it moves
// only WHEN THIS FIXTURE ACTS — never what the belt does. Three values, one per observation, each
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
//   `engine_wins`  #1028's own repro: WAITS for firm P's two children — ordinary admitted Work,
//                  the World dispatches them the moment `seedChildren` returns, well before
//                  `applyPoison` even runs — to leave the estate's own live-children census for
//                  that parent EMPTY on their own, then sweeps the belt once more so the
//                  parent's own settlement is visible before the disjointness check below reads
//                  it. This is the SAME mechanism a slow host produces by accident (the third
//                  race #1027 deliberately left unfixed); asking for it here proves the fix
//                  against the exact scenario instead of hoping a slow run happens to land one.
// A ROW LOCK WAS TRIED FIRST AND REJECTED: holding `for update` on a parent row did not make the
// belt's `skip locked` worklist pass it by, it made the whole sweep WAIT (8087 ms under an 8000 ms
// lock, clara_923) and then proceed, which perturbs the leg's clock rather than its observations.
const LEG4_FAULT = process.env.CLARA_P636_LEG4_FAULT || "";
// The default is 1500 ms: the lateness both faults were MEASURED at, and comfortably inside the
// P-loop deadline above. A fault longer than that deadline is a vacuity control, not a repro.
const LEG4_FAULT_MS = Number(process.env.CLARA_P636_LEG4_FAULT_MS || 1500);
// #1028 — `engine_wins`'s OWN deadline: how long it waits for firm P's parent to have no live
// child left, by the estate's own reckoning. Generous on purpose (the measured figure is ~8 s,
// clara_922/927/933 in #1027's own report) because this fault's job is to GUARANTEE the race,
// not to time it; the leg's own P/Q deadlines above are what stays tight.
const LEG4_RACE_DEADLINE_MS = Number(process.env.CLARA_P636_LEG4_RACE_DEADLINE_MS || 20000);

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
  // #1026 — THE HEAP BOUND, armed as soon as the engine is up, on `tests/interview-e2e.mjs`'s
  // precedent and through the same tested helper. THIS process runs the bundle, the world, the
  // leader, the engine and a hundred document ingests at once, and V8 has no reason to collect any
  // of the churn until its ceiling — which is how job 106048901216 died at 4018 MB. The step now
  // also carries an explicit ceiling from `scripts/ci/world-gate.mjs`; the two are different
  // safeguards and the leg keeps both. MEASURED on a throwaway clone of a migrated database: at
  // `--max-old-space-size=2048` WITHOUT this bound the leg peaks at 1.97-2.11 GiB RSS and its
  // occupancy runs right up to the ceiling before every collection; WITH it the peak is far
  // lower (the figures are in packages/runtime/README.md's #1026 section). Best-effort and
  // unref'd: it can neither fail a passing run nor hold one open.
  const heap = startHeapBound();
  if (!heap.stats().available) {
    console.warn("[p636] heap bound UNAVAILABLE (no in-process inspector) — this leg runs on whatever ceiling it was given");
  }
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
  // #964: the daily window moved from a UTC day (08:00 MYT reset) to an Asia/Kuala_Lumpur day
  // (MYT midnight reset). Not re-run by this ticket (see packages/db's document-ingest-window
  // -myt.test.mjs and intake-batch.test.mjs's p964.window.capacity_descriptor_myt for the
  // targeted, executed proof of the same door and the same literal value).
  assert.equal(pack.capacity.resets_at_local, "00:00");
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
  // #965 CLOSED THE NAMED RESIDUAL this assertion used to record. Until migration 0254 a file
  // refused at creation had no intake — the raise rolled it back — so it could not be a member,
  // and the leg asserted that absence. Now the refusal COMMITS its intake at failed/limit and the
  // route's batch path gives it a member with an explicit `awaiting_capacity` wait, so the wall
  // leaves exactly ONE member behind, which is what the batch card must show. The 429 above is
  // byte-unchanged; only what survives it changed.
  const wallMembers = await rig.rootQuery(
    `select m.id, m.dependency, m.dependency_reason, i.status, i.failure_code
       from clara.intake_batch_members m
       join clara.document_intakes i on i.id = m.intake_id
      where m.batch_id=$1`, [wBatch]);
  assert.equal(wallMembers.rows.length, 1,
    "#965: the file the ceiling refused IS a member — the batch read never shows a silent absence");
  assert.equal(wallMembers.rows[0].status, "failed");
  assert.equal(wallMembers.rows[0].failure_code, "limit",
    "…recorded at the lane's existing failed/limit vocabulary");
  assert.equal(wallMembers.rows[0].dependency, "awaiting_capacity",
    "…and its wait is declared through the governed member-dependency door, not by the belt");
  assert.match(String(wallMembers.rows[0].dependency_reason), /document daily limit reached/,
    "…carrying the database's own sentence, the operator remedy the card renders");

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

  // #1151 — THE DELIBERATE DRIFT, DRIVEN RATHER THAN WAITED FOR. A live child can legitimately
  // settle ON ITS OWN — a genuine terminal ingest failure, exactly the shape measured on this rig
  // under load (`waveS-lane06-fix.md`'s own log: "document ingest terminally failed (engine_error)")
  // — strictly BETWEEN this decision and the belt's own sweep below. Under load that happens by
  // chance and reddened this leg once in nine rounds; here it is FORCED, on the one live child the
  // interruption loop below never touches (`live[live.length - 1]`, outside `live.slice(0, half)`),
  // so the census after the belt sweep is proven against the drift every round rather than by luck.
  const spontaneous = live[live.length - 1];
  const spontaneousTask = (await rig.rootQuery(
    "select current_task_id from clara.accounting_work where id=$1", [spontaneous.work_id])).rows[0].current_task_id;
  if (spontaneousTask) {
    await settleRun(spontaneousTask, "failed").catch(() => {});
  }

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

  // #1151 — THE BELT SWEEP WINDOW, BY IDENTITY, not by raw count. A live child settling on its own
  // between the decision and the belt (the spontaneous drift forced above, and the same drift the
  // identity check above already tolerates for the earlier seed-to-decision window) leaves no
  // `cancel_accounting_work` receipt behind — the belt's own worklist (`clara._intake_batch_live_
  // children`) never offered it, because it was no longer live to offer. That is lawful. What is
  // NEVER lawful is a live child left with NEITHER a cancel receipt NOR its own terminal settle —
  // "decided twice" cannot even be observed here (`clara.op_receipts`'s own primary key is
  // `(firm_id, fn, op_key)`, and `childCancelKey` embeds the work id once), so the census that
  // matters is which live children are EXPLAINED, not how many receipt rows exist.
  const opReceipts = await rig.rootQuery(
    `select op_key from clara.op_receipts
      where fn='cancel_accounting_work' and op_key like $1`, [`${cKey}:%`]);
  const cancelledWorkIds = new Set(opReceipts.rows.map((r) => String(r.op_key).slice(`${cKey}:`.length)));
  const liveStatuses = await rig.rootQuery(
    "select id, status from clara.accounting_work where id = any($1::uuid[])",
    [live.map((c) => c.work_id)]);
  const statusByWorkId = new Map(liveStatuses.rows.map((r) => [String(r.id), String(r.status)]));
  const SETTLED_WITHOUT_CANCEL = new Set(["completed", "refused", "failed", "expired"]);
  const unexplained = live.filter((child) =>
    !cancelledWorkIds.has(child.work_id) && !SETTLED_WITHOUT_CANCEL.has(statusByWorkId.get(child.work_id)));
  assert.equal(unexplained.length, 0,
    `every live child is explained by a cancel receipt or its own terminal settle — unexplained: ` +
    `${JSON.stringify(unexplained.map((c) => ({ work_id: c.work_id, status: statusByWorkId.get(c.work_id) })))}`);
  assert.ok(cancelledWorkIds.has(spontaneous.work_id) === false,
    "the spontaneous child settled WITHOUT a cancel receipt — the belt correctly never decided it");
  console.log(`[p636] belt receipt census: ${cancelledWorkIds.size} cancelled by receipt, ` +
    `${live.length - cancelledWorkIds.size} settled on their own (incl. the forced spontaneous child), 0 unexplained`);

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
  // #1028 — THE DISCRIMINATOR both `engine_wins` and the final disjointness check need, read from
  // the ESTATE'S OWN definition of a live child rather than re-spelled here (review SPEC-1028-01).
  // `clara._intake_batch_live_children` is the very predicate
  // `clara.sweep_intake_batch_cancellations` settles a parent by
  // (`packages/db/migrations/0229_intake_batches.sql`), and a Work status is only HALF of it: the
  // function ALSO excludes a child that already holds a committed `clara.operation_receipts` row,
  // which is out of the belt's hands even while its Work status is still non-terminal. A second
  // spelling here — the status set alone — would red a parent the belt settled CORRECTLY as "the
  // belt settled it prematurely", which is the opposite of what this leg exists to say.
  const liveChildrenOf = async (batch) => (await rig.rootQuery(
    "select member_id, work_id from clara._intake_batch_live_children($1::uuid)", [batch])).rows;
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
   *  observed on each, every child's Work status and current task, the BLOCKED count and the
   *  estate's own per-parent `cancel_blocked` verdict, the last belt receipt and how long the leg
   *  waited — read FRESH at the moment of failure, so a red in CI is diagnosable from the job log
   *  alone (the whole point of #1027: the two reds it replaces said only `actual: 'cancelling'`).
   *
   *  THE DISCRIMINATOR (review SPEC-1027-03). `blocked` and `cancel_blocked` are what tell the two
   *  failures apart when firm P's children read `failed`:
   *    blocked >= 1 / cancel_blocked=canceller_not_active — the belt DID see and refuse firm P's
   *      children; if its parent is nevertheless terminal, the World drove those children terminal
   *      first and the belt settled the parent correctly. That is the #1028 race: the LEG 4
   *      disjointness check below records it as the correct outcome it is, rather than failing.
   *    blocked = 0 AND refusals = 0 — the belt is not counting firm P's refusals at all. That is a
   *      REGRESSION in the belt, and it is exactly what the vacuity control (`fanOutCancel`
   *      rewritten so a CLR04 refusal records as a success) produces. */
  async function leg4Diagnosis(headline, { sweeps, elapsedMs, deadlineMs, receipt, settles = null }) {
    const census = async (ids) => (await rig.rootQuery(
      "select id, status, current_task_id from clara.accounting_work where id = any($1::uuid[]) order by id",
      [ids])).rows;
    const [p, q] = [await batchState(pBatch), await batchState(qBatch)];
    const verdict = async (owner, batch) => {
      try {
        return (await getBatch(owner, batch))?.cancel_blocked ?? null;
      } catch (err) {
        return `unreadable: ${err?.message ?? err}`;
      }
    };
    return `${headline} — after ${sweeps} sweep(s) in ${elapsedMs}ms `
      + `(deadline ${deadlineMs}ms, poll ${LEG4_POLL_MS}ms).\n`
      + `  firm P (poisoned) parent=${pBatch} state=${p?.state} `
      + `cancel_blocked=${await verdict(P.owner, pBatch)} `
      + `refusals=${pWatch.refusals} blocked=${pWatch.blocked} over ${pWatch.sweeps} sweep(s)\n`
      + `    children=${JSON.stringify(await census(pChildren.map((c) => c.work_id)))}\n`
      + `  firm Q (healthy)  parent=${qBatch} state=${q?.state} `
      + `cancel_blocked=${await verdict(Q.owner, qBatch)}\n`
      + `    children=${JSON.stringify(await census(qChildren.map((c) => c.work_id)))}\n`
      + `  last belt receipt: ${JSON.stringify(receipt)}`
      + (settles ? `\n  settles: ${JSON.stringify(settles)}` : "");
  }

  /** THE ONE WAIT SHAPE IN THIS LEG, taking its deadline as an argument so each loop's own
   *  measured number is visible at its call site (review STD-3 / SPEC-1027-01). `step(sweeps)`
   *  returns true when the fact has landed; `diagnose(ctx)` builds the deadline's message. */
  async function pollToDeadline({ deadlineMs, step, diagnose }) {
    const startedAt = Date.now();
    for (let sweeps = 1; ; sweeps += 1) {
      if (await step(sweeps)) return { sweeps, elapsedMs: Date.now() - startedAt };
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= deadlineMs) throw new Error(await diagnose({ sweeps, elapsedMs, deadlineMs }));
      await sleep(LEG4_POLL_MS);
    }
  }

  // (1) FIRM P'S REFUSALS ARE COUNTED — over the polled sweeps, never from a single one. The count
  //     is CUMULATIVE: a refusal seen on any sweep is a refusal counted, and 0 across the whole
  //     deadline is the failure.
  //
  //     AND THEY ARE ATTRIBUTED TO FIRM P (review SPEC-1027-02). `batchCancelFailed` is ESTATE-WIDE
  //     — `reconciler-batches.mjs` increments it in a catch-all for ANY parent on the worklist, and
  //     LEG 2's parent is still `cancelling` and still on that worklist here — so a poll that
  //     accepted it alone could be satisfied by somebody else's error, once per sweep. The belt's
  //     `batchCancelBlocked` is incremented ONLY for a parent whose refusals are ALL CLR04, which in
  //     this leg is firm P and nothing else, and the estate's own per-parent door is asserted after
  //     the loop. Neither counter's meaning changes and the belt is untouched.
  const pWatch = { sweeps: 0, refusals: 0, blocked: 0, doorVerdict: null, receipt: null };
  const pRun = await pollToDeadline({
    deadlineMs: LEG4_P_DEADLINE_MS,
    step: async (sweeps) => {
      pWatch.sweeps = sweeps;
      const sweep = await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
      pWatch.receipt = sweep;
      // UNCHANGED, AND NOW ASSERTED ON EVERY SWEEP rather than on one: a belt that says "we do not
      // know" is a failure to report at once, never something to poll through.
      assert.equal(sweep.batchCancelOk, true,
        "a permanently-refusing firm never makes the belt claim 'we do not know' about the whole estate");
      pWatch.refusals += (sweep.batchCancelFailed ?? 0);
      pWatch.blocked += (sweep.batchCancelBlocked ?? 0);
      // THE PER-PARENT VERDICT IS OBSERVED ON THE SAME SWEEP, INSIDE THE SAME DEADLINE (review
      // SPEC-META-01). It is a fact the World can invalidate — once firm P's children go terminal
      // the parent leaves `cancelling` and the field reads null again — so reading it once after
      // the loop would be the very shape #1027 exists to delete.
      pWatch.doorVerdict = (await getBatch(P.owner, pBatch)).cancel_blocked ?? null;
      return pWatch.refusals >= 1 && pWatch.blocked >= 1
        && pWatch.doorVerdict === "canceller_not_active";
    },
    diagnose: (ctx) => leg4Diagnosis(
      "firm P's refusals are COUNTED AND ATTRIBUTED: no sweep reported a refusal, a blocked parent "
      + "and the door's own `canceller_not_active` together",
      { ...ctx, receipt: pWatch.receipt }),
  });
  console.log(`[p636] LEG4 firm P refusals COUNTED: ${pWatch.refusals} refusal(s), `
    + `blocked=${pWatch.blocked}, door=${pWatch.doorVerdict}, `
    + `over ${pRun.sweeps} sweep(s) in ${pRun.elapsedMs}ms`);
  assert.ok(pWatch.refusals >= 1, "firm P's refusals are COUNTED, not swallowed");
  assert.ok(pWatch.blocked >= 1,
    "…and they are ATTRIBUTED: a parent whose every child refused CLR04 is counted as BLOCKED, "
    + "which on this worklist is firm P's condition and nobody else's");
  // THE SAME FACT AT THE ESTATE'S OWN PER-PARENT DOOR, which no other firm's error can satisfy:
  // `clara.get_intake_batch` derives `cancel_blocked` from the stored canceller's LIVE membership
  // (0229:1088-1095), so it names firm P and only firm P. Established INSIDE the loop above; this
  // restates it, as the two lines before it restate their own counters.
  assert.equal(pWatch.doorVerdict, "canceller_not_active",
    "the door reports firm P's stop as BLOCKED by its own canceller's lost authority");
  // NO PAIRED CONTROL ON FIRM Q, AND THE REASON IS THE DOOR'S OWN DERIVATION (review SPEC-META-01):
  // `cancel_blocked` is computed only while a parent is `cancelling` (0229:1088), and no moment in
  // this leg holds firm Q there deterministically — its own sweeps, or the leader's, can settle it
  // at any point — so a `cancel_blocked === null` on firm Q would assert a constant, which is worse
  // than no cell at all. What keeps the verdict above honest is measured instead: under
  // `CLARA_P636_LEG4_FAULT=late_poison` this very loop polls while the door reads null and converges
  // only when it flips (4 sweeps / 1673 ms, throwaway clara_802), and under the vacuity control it
  // never converges at all.

  // (2) Firm Q's children were still asked, and its parent settles once its runs do — polled to its
  //     OWN deadline, with the settle RETRIED inside it and its failure never discarded.
  // THE SECOND FAULT: `slow_settle` holds every settle back for `CLARA_P636_LEG4_FAULT_MS`, which
  // is the documented mechanism of CI job 106051996127's red — "a settle that has not landed by
  // the time the second sweep runs leaves firm Q's parent in `cancelling`".
  const settleGateUntil = LEG4_FAULT === "slow_settle" ? Date.now() + LEG4_FAULT_MS : 0;
  const settleGateOpen = () => Date.now() >= settleGateUntil;
  // EACH CHILD CARRIES ITS OWN STATE, not one overloaded error string (review SPEC-1027-06):
  // "settled" and "nothing-to-settle" are outcomes, "settle-refused" is a failure, and a reader can
  // tell them apart at a glance in the deadline message.
  const qSettles = qChildren.map((child) => ({
    work_id: child.work_id, task_id: null, work_status: null, state: "not-attempted", error: null,
  }));
  const qWatch = { sweeps: 0, state: null, receipt: null };
  const qRun = await pollToDeadline({
    deadlineMs: LEG4_Q_DEADLINE_MS,
    step: async (sweeps) => {
      qWatch.sweeps = sweeps;
      for (const s of qSettles) {
        if (s.state === "settled") continue;
        const row = (await rig.rootQuery(
          "select status, current_task_id from clara.accounting_work where id=$1", [s.work_id])).rows[0];
        s.work_status = row?.status ?? null;
        s.task_id = row?.current_task_id ?? s.task_id;
        if (!row?.current_task_id) {
          // NOT AN ERROR. A child the World has already driven terminal has no run left to settle,
          // and printing that beside a genuine refusal is the opposite of diagnosable.
          s.state = "nothing-to-settle";
          s.error = null;
          continue;
        }
        if (!settleGateOpen()) {
          s.state = "held-by-fault";
          s.error = `held back by CLARA_P636_LEG4_FAULT=${LEG4_FAULT}`;
          continue;
        }
        try {
          await settleRun(row.current_task_id, "cancelled");
          s.state = "settled";
          s.error = null;
        } catch (err) {
          // #1027: NEVER `.catch(() => {})` again. A settle that cannot be performed is RETRIED on
          // the next poll, and if the deadline expires it is named — task id and last error — in
          // the failure message instead of vanishing.
          s.state = "settle-refused";
          s.error = `${err?.code ?? ""} ${err?.message ?? err}`.trim();
        }
      }
      qWatch.receipt = await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
      assert.equal(qWatch.receipt.batchCancelOk, true,
        "a permanently-refusing firm never makes the belt claim 'we do not know' about the whole estate");
      qWatch.state = (await batchState(qBatch))?.state ?? null;
      return qWatch.state === "cancelled";
    },
    diagnose: (ctx) => leg4Diagnosis(
      "firm Q's batch, swept in the SAME belt call as firm P's poison, never reached its terminal state",
      { ...ctx, receipt: qWatch.receipt, settles: qSettles }),
  });
  console.log(`[p636] LEG4 firm Q terminal after ${qRun.sweeps} sweep(s) in ${qRun.elapsedMs}ms; `
    + `settles=${JSON.stringify(qSettles)}`);
  assert.equal(qWatch.state, "cancelled",
    "firm Q's batch, swept in the SAME belt call as firm P's poison, still reached its terminal state");

  // #1028 — `engine_wins`: DELIBERATELY LET THE ENGINE FINISH FIRM P'S CHILDREN FIRST, so the
  // disjointness check below is proved against the exact race rather than against luck. A fixture
  // action (what THIS LEG waits for) — nothing about what the belt does changes, and it is inert
  // on every other run.
  if (LEG4_FAULT === "engine_wins") {
    const raceStarted = Date.now();
    await pollToDeadline({
      deadlineMs: LEG4_RACE_DEADLINE_MS,
      step: async () => {
        if ((await liveChildrenOf(pBatch)).length > 0) return false;
        // One more sweep, the SAME call every other observation in this leg already uses, so the
        // parent's own settlement (if the belt grants one) is visible before this fault returns.
        await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
        return true;
      },
      diagnose: async ({ elapsedMs, deadlineMs }) => {
        const live = await liveChildrenOf(pBatch);
        const rows = (await rig.rootQuery(
          "select id, status from clara.accounting_work where id = any($1::uuid[]) order by id",
          [pChildren.map((c) => c.work_id)])).rows;
        return `[p636] FAULT engine_wins: firm P still had ${live.length} live child(ren) after `
          + `${elapsedMs}ms (deadline ${deadlineMs}ms): live=${JSON.stringify(live)} `
          + `children=${JSON.stringify(rows)}`;
      },
    });
    console.log(`[p636] LEG4 FAULT engine_wins: firm P has NO live child left after `
      + `${Date.now() - raceStarted}ms — the World finished its own children before this leg ever checked`);
  }

  // THE DISJOINTNESS, unpolled ON PURPOSE: this one is a NEGATIVE, and a negative that converges is
  // a negative that was never true. It is read once, at the end.
  //
  // #1028 — WHAT "DECLARED DONE" MEANS IS NOW PRECISE rather than "always still cancelling". Firm
  // P's parent reading non-`cancelling` here is consistent with TWO different facts, and only one
  // is a defect:
  //   a LIVE CHILD REMAINED and the belt settled the parent anyway — the belt declared the estate
  //     done while it still owed an answer, which is the genuine regression this leg exists to
  //     catch, and it still throws exactly as before.
  //   EVERY child of firm P's parent was independently finished BY THE WORLD first — the recovery
  //     belt settling a running Work whose engine run it does not know, `postEntry`'s own comment
  //     above — before this leg ever looked. The parent then has nothing left to be BLOCKED about
  //     and the belt correctly calls it done. That is the #1027/#1028 third race, not a belt
  //     defect: the disjointness this leg proves (a permanently-refusing firm's parent never goes
  //     terminal WHILE STILL OWING A LIVE CHILD an answer) was never violated, only the
  //     interleaving with a slow assertion was. The leg RECORDS this rather than failing.
  // The two are told apart by whether a live child remains — asked of the estate's own
  // `_intake_batch_live_children`, the predicate the belt itself settles by, never a second
  // spelling of it here — and never by how fast anything ran. The refusal was already
  // independently COUNTED and ATTRIBUTED to firm P above, before this read.
  const pFinal = await batchState(pBatch);
  if (pFinal?.state === "cancelling") {
    const pStillLive = await liveChildrenOf(pBatch);
    console.log(`[p636] LEG4 firm P is honestly still stopping — `
      + `${pStillLive.length} live child(ren) remain: ${JSON.stringify(pStillLive)}`);
  } else {
    const pLive = await liveChildrenOf(pBatch);
    const pChildRows = await rig.rootQuery(
      "select id, status from clara.accounting_work where id = any($1::uuid[]) order by id",
      [pChildren.map((c) => c.work_id)]);
    const pTail = `\n  ${await leg4Diagnosis(
      "firm P was declared done while this leg watched",
      { sweeps: pRun.sweeps + qRun.sweeps, elapsedMs: pRun.elapsedMs + qRun.elapsedMs,
        deadlineMs: LEG4_P_DEADLINE_MS + LEG4_Q_DEADLINE_MS, receipt: qWatch.receipt })}`
      + `\n  firm P children (raw): ${JSON.stringify(pChildRows.rows)}`
      + `\n  firm P LIVE children (clara._intake_batch_live_children): ${JSON.stringify(pLive)}`;
    assert.equal(pLive.length, 0,
      "firm P's parent was declared done while it still had a LIVE child — the belt settled it "
      + "prematurely, which IS the defect this leg exists to catch" + pTail);
    console.log(`[p636] LEG4 firm P's parent reached '${pFinal.state}' with NO live child left by `
      + `the estate's own reckoning (the #1028 race, not a belt defect) — refusals were still COUNTED `
      + `(${pWatch.refusals}) and ATTRIBUTED (blocked=${pWatch.blocked}, door read `
      + `canceller_not_active during polling) before the engine got there.`);
  }
  void pChildren;
  await Promise.all(faultWork);

  const h = heap.stats();
  heap.stop();
  console.log(`[p636] heap bound: peak ${Math.round(h.peakBytes / MiB)} MB over ${h.ticks} ticks, `
    + `${h.collections} collection(s), ${h.failures} refusal(s)`);
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
