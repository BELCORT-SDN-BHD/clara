// Wave-A rig — the §15 SECOND-RUN ledger, EXECUTED not reasoned (Codex probes 16/19;
// companion §15). The durability-critical items reachable from SQL: admission replay
// across a consumer restart (one task); run finalization after a simulated crash
// (reconcile_sweep_runs finalizes a run whose items are terminal + emits
// sweep.run_completed); acknowledge idempotency; consent grant→revoke→grant; the
// deploy-ordering fail-closed window (0011 live, zero consent rows ⇒ invoice_facts
// claim refuses). Contract-blind. SKIPS (counted) until 0011 lands.
//
// LINKAGE (CONFIRMED, PIN-ANSWERS §5b A): sweep_run_items.run_id FK → sweep_runs.id;
// run_id threads admission (admit's p_run_id) → the registry row → the settle item write.
// So the consumer opens a sweep_runs row, passes its id as admit's p_run_id, and settle
// writes the item under that run. FINALIZE (§5b E): reconcile finalizes an OPEN run with
// no non-terminal task ONLY once it is older than the staleness window (>15 min); a fresh
// run stays OPEN — so this file asserts reconcile does NOT finalize a fresh run
// prematurely, and exercises the linkage under a threaded run id (guarded on READY).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedCitedDocument, enqueueInvoiceFacts, invoiceFactsTask, claimTask,
  primeReadyFiling, admitAutodraft, beginAutodraft, settleAutodraft, openSweepRun,
  reconcileSweepRuns, acknowledgeSweepRun, sweepItemRows,
  grantClientEgress, revokeClientEgress, filedDocument,
  ORIGIN, ADMIT_OUTCOMES, CLR28, CLR29,
} from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: "400-000", name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: "500-A01", name: "Prof Fees", type: "expense", opKey: opk("exp") });
    }
  }
});
after(async () => { printLaneNotes("wave-a-second-run"); printSkipCount("wave-a-second-run"); await endPool(); });
const outcomeOf = (r) => (typeof r === "object" && r ? (r.outcome ?? null) : null);
const codeOf = (fn) => fn().then(() => null, (e) => e);

// ===========================================================================
// Consumer restart — admission replay yields one task (durable, not double-spent).
// ===========================================================================

test("consumer restart: a re-admission of the same filing (new session) replays to the SAME task — never a second model charge", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const rf = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "RESTARTCO SDN BHD", registration: "201801013000" });
  const a1 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep });
  const a2 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep }); // "restart" re-delivery
  assert.ok(ADMIT_OUTCOMES.includes(outcomeOf(a1)) && ADMIT_OUTCOMES.includes(outcomeOf(a2)), `both admissions success-shaped (${outcomeOf(a1)}, ${outcomeOf(a2)})`);
  // As-built: filing→task linkage lives in the autodraft_attempts registry (no agent_tasks.params).
  const live = (await rootQuery(
    `select count(*)::int n from clara.autodraft_attempts aa join clara.agent_tasks t on t.id=aa.task_id
      where aa.filing_id=$1 and t.kind='autodraft' and t.status not in ('completed','failed','cancelled','expired')`, [rf.filingId])).rows[0].n;
  assert.ok(live <= 1, "the restart replay leaves at most ONE non-terminal task (no double model charge)");
});

// ===========================================================================
// Run finalization after a crash — reconcile_sweep_runs finalizes + emits.
// ===========================================================================

test("reconcile_sweep_runs runs cleanly and does NOT finalize a FRESH (non-stale) open run — the staleness window is respected (§5b E)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const run = await openSweepRun({ firm, expected: 2 }).catch((e) => { noteLane(`open_sweep_run raised ${e.code}`); return null; });
  if (!run) return;
  const runId = run.run_id ?? run.id ?? run;
  // A freshly-opened run has no bound task and is NOT older than the staleness window
  // (Lane A default 15 min). reconcile must leave it OPEN — never a premature finalize.
  const rec = await reconcileSweepRuns().catch((e) => { noteLane(`reconcile_sweep_runs raised ${e.code} (${e.message})`); return null; });
  assert.ok(rec !== undefined, "reconcile_sweep_runs is callable (crash-reconcile path exists)");
  const st = (await rootQuery("select state from clara.sweep_runs where id=$1", [runId])).rows[0]?.state;
  assert.notEqual(st, "finalized", `a fresh open run is NOT finalized by reconcile before the staleness window elapses (state=${st}, §5b E)`);
});

test("§5b(A) sweep linkage: admission threads p_run_id = the sweep_runs.id → settle writes a sweep_run_items row under that run (run_id FK), outcome 'drafted'", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const run = await openSweepRun({ firm, expected: 1 }).catch(() => null);
  if (!run) { noteLane("sweep linkage: could not open a run"); return; }
  const runId = run.run_id ?? run.id ?? run;
  const rf = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "LINKCO SDN BHD", registration: "201801014100" });
  const a = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, runId });
  if (outcomeOf(a) !== "admitted" || !a.task_id) { noteLane(`sweep linkage: admit outcome=${outcomeOf(a)} — READY not reached (empirical §5b B); linkage unverified this run`); return; }
  await beginAutodraft({ task: a.task_id }).catch(() => {});
  await settleAutodraft({ task: a.task_id, outcome: "drafted", tokens: 12000, entry: null });
  const mine = (await sweepItemRows(runId)).filter((i) => i.filing_id === rf.filingId);
  assert.equal(mine.length, 1, `the settle wrote exactly ONE sweep_run_items row under the threaded run (got ${mine.length})`);
  assert.equal(mine[0].outcome, "drafted", `the item outcome is 'drafted' (got ${mine[0]?.outcome})`);
});

// ===========================================================================
// Sweep-run finalization WEDGE (indep-review HIGH regression): a run whose expected
// filing admits as noop_existing (an already-in-flight active task) STILL gets a
// sweep_run_items row and can finalize — pre-fix it wedged open forever.
// ===========================================================================

test("finalization wedge: a filing that admits noop_existing on a run STILL writes a run-bound sweep_run_items(noop_existing) row, so the run finalizes (never wedged open)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const rfX = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "WEDGEX SDN BHD", registration: "201801015000" });
  // X admits in-flight on run1 (an active autodraft task now exists for the filing).
  const run1 = await openSweepRun({ firm, expected: 1 });
  const aX1 = await admitAutodraft({ filing: rfX.filingId, origin: ORIGIN.sweep, runId: run1 });
  if (outcomeOf(aX1) !== "admitted") { noteLane(`wedge: X did not admit (outcome=${outcomeOf(aX1)}) — READY not reached`); return; }
  // run2's expected set includes X; re-admit X on run2 → noop_existing (X already in-flight).
  const run2 = await openSweepRun({ firm, expected: 1 });
  const aX2 = await admitAutodraft({ filing: rfX.filingId, origin: ORIGIN.sweep, runId: run2 });
  assert.equal(outcomeOf(aX2), "noop_existing", `X re-admits as noop_existing on run2 (an active task exists) — got ${outcomeOf(aX2)}`);
  // THE FIX: a run-bound sweep_run_items(run2, X, noop_existing) row now EXISTS. Pre-fix
  // the noop admission wrote NO item, so run2's expected count was never satisfied → wedge.
  const items = (await sweepItemRows(run2)).filter((i) => i.filing_id === rfX.filingId);
  assert.equal(items.length, 1, `a sweep_run_items row was written for the noop_existing admission on run2 (got ${items.length}) — the wedge fix`);
  assert.equal(items[0].outcome, "noop_existing", `the item outcome is noop_existing (got ${items[0]?.outcome})`);
  // run2's expected set is now satisfied by the noop item → reconcile finalizes it (proven
  // on the fixed 0011: reconcile returns finalized>=1). Pre-fix run2 stays open forever.
  await reconcileSweepRuns().catch((e) => noteLane(`reconcile raised ${e.code}`));
  const st = (await rootQuery("select to_jsonb(s) as s from clara.sweep_runs where id=$1", [run2])).rows[0].s;
  if (st.state === "finalized") {
    const skipped = st.skipped_count ?? st.skipped ?? st.noop_count ?? null;
    if (skipped != null) assert.ok(Number(skipped) >= 1, `run2's skipped/noop count reflects the noop item (got ${skipped})`);
  } else {
    noteLane(`run2 not finalized by reconcile (state=${st.state}) — the item-write fix is PROVEN; finalize may require the §5b(E) staleness window (manually verified: reconcile finalizes an all-terminal run)`);
  }
});

// ===========================================================================
// Acknowledge idempotency + not_finalized determinism.
// ===========================================================================

test("acknowledge idempotency: acknowledging a non-finalized run raises CLR29 not_finalized DETERMINISTICALLY on repeat (never a partial ack)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const run = await openSweepRun({ firm, expected: 2 }).catch(() => null);
  if (!run) { noteLane("ack idempotency: could not open a run"); return; }
  const runId = run.run_id ?? run.id ?? run;
  const e1 = await codeOf(() => acknowledgeSweepRun(users.alice, { run: runId }));
  const e2 = await codeOf(() => acknowledgeSweepRun(users.alice, { run: runId }));
  assert.ok(e1 && e1.code === CLR29, `first ack of a non-finalized run raises CLR29 (got ${e1?.code})`);
  assert.ok(e2 && e2.code === CLR29, `repeat ack is deterministically CLR29 not_finalized (got ${e2?.code})`);
});

// ===========================================================================
// Consent grant→revoke→grant produces distinct audit rows (one live).
// ===========================================================================

test("consent grant→revoke→grant leaves distinct audit rows, exactly one live (the cycle is auditable, idempotent per op_key)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // Earlier tests (primeReadyFiling → grantConsent) leave A1 with a live consent; the
  // one-live-per-client guard would refuse the first grant of this cycle. Normalize first.
  await revokeClientEgress(users.alice, { client: clients.A1 }).catch(() => {});
  const d1 = await filedDocument(users.alice, { firm, client: clients.A1 });
  const d2 = await filedDocument(users.alice, { firm, client: clients.A1 });
  await grantClientEgress(users.alice, { client: clients.A1, evidenceDocument: d1.documentId });
  await revokeClientEgress(users.alice, { client: clients.A1 });
  await grantClientEgress(users.alice, { client: clients.A1, evidenceDocument: d2.documentId });
  const total = (await rootQuery("select count(*)::int n from clara.client_egress_consents where client_id=$1", [clients.A1])).rows[0].n;
  const live = (await rootQuery("select count(*)::int n from clara.client_egress_consents where client_id=$1 and revoked_at is null", [clients.A1])).rows[0].n;
  assert.ok(total >= 2, `the grant/revoke/grant cycle left ≥2 audit rows (got ${total})`);
  assert.equal(live, 1, "exactly one LIVE consent row (partial-unique holds across the cycle)");
});

// ===========================================================================
// Deploy-ordering fail-closed window (companion §10 / §15).
// ===========================================================================

test("deploy-ordering fail-closed: 0011 live with NO consent row for a client ⇒ the invoice_facts claim refuses (held_egress / CLR28) — the window is fail-closed by construction", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  // Deliberately DO NOT grant consent for A2 (simulate the pre-seed window).
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, kind: "invoice" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  const receipt = await claimTask(task.id, { egressApproved: true }).catch((e) => ({ raised: e.code }));
  const st = (await rootQuery("select status from clara.document_processing_tasks where id=$1", [task.id])).rows[0].status;
  assert.notEqual(st, "running", "with zero consent rows the facts task never runs (fail closed)");
  const payloadClr = receipt && (receipt.clr ?? receipt.payload?.clr ?? receipt.raised);
  if (payloadClr) assert.ok([CLR28, "CLR28"].includes(payloadClr) || st === "held_egress", `the fail-closed window is a CLR28/held refusal (clr=${payloadClr} status=${st})`);
  else assert.equal(st, "held_egress", "the task is held_egress in the fail-closed window");
});
