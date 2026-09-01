// Gate G1's TWO WAKE BODIES — the LIFECYCLE half: the claim CAS, the settle path on both
// carriers, and the engine-to-body arc through the per-source kill switch.
//
// WHAT THIS FILE PROVES, AND WHAT IT DELIBERATELY DOES NOT. It proves the judgement logic these
// two closures OWN. It does NOT drive the model loop: the prompt is not a wall and neither is a
// tool schema — every wall these lanes stand behind is in the DB, and g1-wake-walls.test.mjs
// measures those by CALLING them. A cell that mocked a model and asserted it called a tool would
// prove the mock, not the lane.
//
// Shared fixtures — and the reds that found each producer-side contract — live in
// g1-wake-bodies.fixtures.mjs. Every synthetic source registers under rig.mjs's exported
// WAKE_ENGINE_TEST_PREFIX (registerSource() throws on any other prefix) and is deleted in
// after(), so the REAL bank_agent/close_prep rows are never touched. THE DEPENDENT READER:
// packages/db/tests/g1-wake-engine.test.mjs's T1 cell excludes rows by exactly that prefix,
// because CI's db-estate job runs packages/db and packages/runtime CONCURRENTLY against one
// shared postgres — see rig.mjs's own comment on WAKE_ENGINE_TEST_PREFIX for the full class.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as rig from "./rig.mjs";
import { runWakeEngineCycle } from "../lib/wake-engine.mjs";
import {
  skip, skip0138, registerSource, BANK_DUE_TYPE, plantHeldWakeTask, plantQueuedClosePrepTask, readTask, readOutbox,
} from "./g1-wake-bodies.fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();

const bankInfra = await import("../workflows/bankAgent.v1.infra.ts");
const closeInfra = await import("../workflows/closePrep.v1.infra.ts");
const bankEntry = await import("../workflows/bankAgent.v1.ts");
const closeEntry = await import("../workflows/closePrep.v1.ts");
const registry = await import("../workflows/registry.ts");

// =====================================================================================
// A · THE CLAIM CAS — the closing wall wake-engine.mjs names as this build's obligation
//     (#5 unknown-abort, #8 duplicate start). Both bodies, same six cells.
// =====================================================================================

test("G1B-A1 a running, unbound wake task claims and BINDS this run", { skip }, async () => {
  const w = await rig.buildFirm("g1ba1");
  const acct = randomUUID();
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: acct, reason: "unmatched_lines" } });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  const runId = randomUUID();
  const out = await rig.asRuntime((c) => bankInfra.claimBankTask(c, taskId, runId));
  assert.equal(out.claimed, true, "a running unbound task is claimable");
  assert.equal(out.ctx.bankAccountId, acct, "the bank account comes off the EVENT payload, never a guess");
  assert.equal(out.ctx.dueReason, "unmatched_lines");
  assert.equal((await readTask(taskId)).workflow_run_id, runId, "the CAS actually bound the run id");
});

test("G1B-A1b a run whose CLAIM STEP THROWS settles NOTHING — it never learned whether it holds the task", { skip }, async () => {
  // FOUND BY A SELF-REVIEW PASS, not by a red: the catch block in both entries settles 'failed',
  // and an earlier draft did so unconditionally. If the claim step itself throws (after WDK step
  // retries exhaust), this run never learned whether it holds the task — it could be held by a
  // DIFFERENT run (the #8 shape) — and a settle from there would overwrite someone else's truth.
  // The `holds` gate closes it: the row is left running-with-no-run, which is exactly the shape
  // reconciler-wake.mjs section A picks up and re-enqueues past grace.
  //
  // THE INSTRUMENT: calling the entry directly (tsx, un-transformed) makes its first step call
  // getWorkflowMetadata() outside any workflow context, which throws — the genuine "the claim
  // step threw" shape, produced by the real code path rather than by a stub.
  // THE POOLS MUST BE INJECTED OR THIS CELL IS VACUOUS, and that was measured: without them,
  // settleBankTaskStep throws "runtime pools not injected" inside the catch's own
  // .catch(() => {}), so the task would stay 'running' even with the guard REMOVED — the cell
  // would pass against the very bug it exists to catch. With a real runtime pool wired in, the
  // settle path is genuinely reachable, so a green here means the GUARD stopped it, not the
  // absence of plumbing. (Verified by deleting the guard: the cell reds.)
  const previousPools = globalThis.__claraPools;
  globalThis.__claraPools = { withRuntime: (fn) => rig.asRuntime((c) => fn(c)) };
  const w = await rig.buildFirm("g1ba1b");
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  let threw = false;
  try {
    await bankEntry.bankAgent_v1({ taskId });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "the claim step must genuinely have thrown, or this cell proves nothing");
  const t = await readTask(taskId);
  assert.equal(t.status, "running", "the task is UNTOUCHED — no settle was this run's to make");
  assert.equal(t.workflow_run_id, null, "and still unbound, so the reconciler's re-enqueue path owns it");

  // The SAME shape on the close body, so the gate is proven on both carriers, not just one.
  const closeTask = await plantQueuedClosePrepTask({ firm: w.firm, client: w.client });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [closeTask]);
  await assert.rejects(() => closeEntry.closePrep_v1({ taskId: closeTask }));
  assert.equal((await readTask(closeTask)).status, "running", "closePrep leaves it for the reconciler too");

  // THE NEGATIVE CONTROL for the injection itself: with the same pools wired, a DIRECT settle on
  // a task this run does hold DOES land. Without this, "the task stayed running" could still be
  // explained by a settle path that never works at all.
  await rig.asRuntime((c) => bankInfra.settleBankTask(c, taskId, "failed", "internal"));
  assert.equal((await readTask(taskId)).status, "failed", "the settle path IS reachable — the guard is what stopped it above");
  globalThis.__claraPools = previousPools;
});

test("G1B-A2 the SAME run id re-claims idempotently (a WDK step replay is not a second run)", { skip }, async () => {
  const w = await rig.buildFirm("g1ba2");
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  const runId = randomUUID();
  assert.equal((await rig.asRuntime((c) => bankInfra.claimBankTask(c, taskId, runId))).claimed, true);
  const again = await rig.asRuntime((c) => bankInfra.claimBankTask(c, taskId, runId));
  assert.equal(again.claimed, true, "the same run re-binding itself is a replay, not a conflict");
});

test("G1B-A3 #8 — a DIFFERENT run id stands down and does NOT rebind", { skip }, async () => {
  const w = await rig.buildFirm("g1ba3");
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  const first = randomUUID();
  await rig.asRuntime((c) => bankInfra.claimBankTask(c, taskId, first));
  const second = await rig.asRuntime((c) => bankInfra.claimBankTask(c, taskId, randomUUID()));
  assert.equal(second.claimed, false);
  assert.equal(second.bound, false, "a duplicate start binds NOTHING, so it owes NO settle");
  assert.equal(second.reason, "bound_elsewhere");
  assert.equal((await readTask(taskId)).workflow_run_id, first, "the first run still holds the task");
});

test("G1B-A4 #5 — a cancel_requested task refuses the claim and binds nothing", { skip }, async () => {
  const w = await rig.buildFirm("g1ba4");
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  await rig.rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);
  const out = await rig.asRuntime((c) => bankInfra.claimBankTask(c, taskId, randomUUID()));
  assert.equal(out.claimed, false);
  assert.equal(out.bound, false);
  assert.equal(out.reason, "not_running");
  assert.equal((await readTask(taskId)).workflow_run_id, null, "a cancelled-out-from-under run must not bind itself in");
});

test("G1B-A5 a still-HELD task is not claimable by the body — the engine claims first, always", { skip }, async () => {
  const w = await rig.buildFirm("g1ba5");
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  const out = await rig.asRuntime((c) => bankInfra.claimBankTask(c, taskId, randomUUID()));
  assert.equal(out.claimed, false);
  assert.equal(out.reason, "not_running");
});

test("G1B-A6 THE STRANDING CASE — a bound task with no bank account returns bound:true so the body SETTLES it", { skip }, async () => {
  const w = await rig.buildFirm("g1ba6");
  // The producer contract breached: an event with no bank_account_id in its payload.
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { reason: "unmatched_lines" } });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  const runId = randomUUID();
  const out = await rig.asRuntime((c) => bankInfra.claimBankTask(c, taskId, runId));
  assert.equal(out.claimed, false);
  assert.equal(out.reason, "no_bank_account");
  assert.equal(out.bound, true, "the CAS COMMITTED, so this run owes the task a terminal settle");
  assert.equal((await readTask(taskId)).workflow_run_id, runId, "and the binding is real — this is why bound:true is not cosmetic");
});

// =====================================================================================
// B · THE SETTLE PATH — both outcomes, BOTH projections. The stranded-row cure is that
//     agent_tasks and wakes_outbox move in ONE transaction and can never disagree.
// =====================================================================================

test("G1B-B1 a completed wake run settles agent_tasks AND wakes_outbox in one act", { skip }, async () => {
  const w = await rig.buildFirm("g1bb1");
  const { taskId, intentId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  // drain.mjs is the only real writer of wakes_outbox; plant its row the same shape.
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, status) values ($1,'held') on conflict do nothing", [intentId]);
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  await rig.asRuntime((c) => bankInfra.settleBankTask(c, taskId, "completed", null));
  const t = await readTask(taskId);
  assert.equal(t.status, "completed");
  assert.equal(t.error_code, null, "a completed task NEVER carries an error_code — _settle_wake_task forces that");
  const ob = await readOutbox(intentId);
  // 裁-44 / FIND-3 — THIS WAS `if (ob) assert…`, which made the cell's own HEADLINE latently
  // vacuous: a settle that stopped writing the outbox projection at all (readOutbox returning
  // null) would have passed silently, and "settles agent_tasks AND wakes_outbox in one act" is
  // exactly the claim that would then be false. The row is planted three lines up, so its
  // presence is a fact this cell may assert rather than hope for.
  assert.ok(ob, "the wakes_outbox row this cell planted must still be there — a missing projection is the defect, not a skip condition");
  assert.equal(ob.status, "settled", "the paired projection moved in the SAME transaction");
});

test("G1B-B2 a FAILING run settles 'failed' carrying its reason, first-write-wins", { skip }, async () => {
  const w = await rig.buildFirm("g1bb2");
  const { taskId, intentId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, status) values ($1,'held') on conflict do nothing", [intentId]);
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  await rig.asRuntime((c) => bankInfra.settleBankTask(c, taskId, "failed", "model_error"));
  assert.equal((await readTask(taskId)).status, "failed");
  assert.equal((await readTask(taskId)).error_code, "model_error", "the reason is DURABLE — this is the dead letter for a body-side failure");
  // A crash-recovery replay carrying a DIFFERENT code must never erase the first cause.
  await rig.asRuntime((c) => bankInfra.settleBankTask(c, taskId, "failed", "internal").catch(() => {}));
  assert.equal((await readTask(taskId)).error_code, "model_error", "first-write-wins: a replay cannot rewrite the original cause");
});

test("G1B-B3 every error code both bodies can emit is inside agent_tasks' own closed roster", { skip }, async () => {
  // Review law 3: the roster is read from the LIVE catalog, never from the migration source, and
  // never from the constant list in the workflow file. A code outside it would turn a truthful
  // failure into a constraint violation at the exact moment the run is trying to tell the truth.
  const r = await rig.rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
      where c.conrelid = 'clara.agent_tasks'::regclass and c.contype='c'
        and pg_get_constraintdef(c.oid) like '%error_code%'`,
  );
  assert.ok(r.rows.length >= 1, "agent_tasks carries an error_code CHECK to read");
  const def = r.rows.map((x) => x.def).join(" ");
  const emitted = new Set();
  for (const fn of [bankEntry.bankErrorCode, closeEntry.closeErrorCode]) {
    emitted.add(fn(new Error("a plain failure")));
    emitted.add(fn(new Error("the request timed out")));
    emitted.add(fn(new Error("tool call blew up")));
    emitted.add(fn(new Error("the model provider refused")));
  }
  emitted.add("internal"); // the bound-but-unusable settle's own literal
  for (const code of emitted) {
    assert.ok(def.includes(`'${code}'`), `error_code '${code}' must be in the live CHECK roster (${def})`);
  }
});

// =====================================================================================
// C · THE ENGINE-TO-BODY ARC, and the per-source kill switch through its REAL door.
// =====================================================================================

test("G1B-C1 a DISABLED source claims nothing; enabling through set_wake_source_enabled claims on the NEXT cycle", { skip }, async () => {
  const w = await rig.buildFirm("g1bc1");
  const key = `${rig.WAKE_ENGINE_TEST_PREFIX}c1_${randomUUID().slice(0, 8)}`;
  await registerSource({
    sourceKey: key, carrier: "wake_outbox", eventType: BANK_DUE_TYPE, taskKind: "wake",
    wakeKind: "bank_agent", workflowExport: "bankAgent", loginPool: "bank", enabled: false, actor: w.owner,
  });
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });

  const dispatched = [];
  const enqueue = async (workflowExport, id) => { dispatched.push([workflowExport, id]); };

  // NEGATIVE: disabled means the engine never claims. The row stays exactly where it was.
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue }));
  assert.equal((await readTask(taskId)).status, "held", "a disabled source's held row is UNTOUCHED");
  assert.equal(dispatched.length, 0, "and nothing was dispatched");

  // THE POSITIVE CONTROL, through the REAL audited door. set_wake_source_enabled is owner-floor
  // AND operator-firm-gated: _human_ctx(owner) alone proves only "owner of SOME firm". The
  // ceremony's own raw act (docs/ops/g1-operator-firm-ceremony.md) sets firms.is_operator; this
  // cell walks that same door rather than UPDATEing the registry behind its back, then puts the
  // flag back so the estate is left exactly as found (uq_firms_one_operator admits only one).
  //
  // uq_firms_one_operator is a genuine database-wide partial UNIQUE INDEX, not a roster this
  // cell can narrow by identity (T1's prefix-exclusion trick, packages/db/tests/g1-wake-engine
  // .test.mjs, does not apply here — that fixes an unscoped READ against a table of many rows;
  // this is a WRITE-WRITE conflict on a real singleton, and no read-side filter can make a
  // second `is_operator=true` row legal). The contention set is FOUR writers across THREE other
  // files, not just one: packages/db/tests/g1-wake-engine.test.mjs's own OP fixture (legitimately
  // live for that file's ENTIRE run — T2z, MUST D, M3, N1 need it throughout, so it cannot
  // release between cells the way this cell's own critical section can; its own after() now
  // releases it, see that file's own after() comment) plus packages/db/tests/p4t2-approval
  // .test.mjs and p4t2-reads.test.mjs's own operator scenes (packages/db/tests/p4t2-fixtures.mjs's
  // markOperator/clearOperator, scoped to what THEY marked — PR #501 finding F1) — none holding
  // any ordering guarantee against this file under CI's concurrent `pnpm -r --if-present test`
  // (the G1B-C1 instance of the #485/#490 class: measured firing even WITHOUT concurrency, on a
  // reused database, once g1-wake-engine.test.mjs alone had run and left OP set). A single hard
  // "the rig starts empty" assertion is a FALSE premise whenever any one of those fixtures is
  // live, so it is RESTATED here: this cell does not need the estate to have STARTED empty — it
  // needs to OBTAIN exclusive use of the one global slot before it proceeds, waiting out
  // whichever legitimate holder is currently live rather than assuming there is none.
  //
  // THE OBSERVATION IS THE TAKE, and ONE shared implementation (opus review round on PR #501,
  // findings F2 and the new-MEDIUM): an earlier version of this cell read `select ... where
  // is_operator`, branched on the row count, and only THEN issued the UPDATE as a separate
  // statement — a genuine TOCTOU window where any of the four writers above taking the slot
  // between the two round-trips would surface as a raw, uncaught `23505 unique_violation`
  // crashing the cell, not the loud, named assertion this comment promises. Fixing it HERE
  // alone was not enough either: p4t2-fixtures.mjs's own bare take had the identical exposure,
  // just wider (its whole critical section, not one round-trip). rig.mjs's `claimOperatorFirm`
  // is the ONE shared fix both sides route through — never a second hand-copied loop: the
  // UPDATE itself is the only authority asked, its answer (success, or a NAMED constraint
  // violation identifying a live holder) IS the observation, so there is no separate read to go
  // stale between it and the write, and success is confirmed by rowCount, never merely "did not
  // throw". A bounded, generous poll (never a silent skip: an exhausted wait still fails loud,
  // by name). Not wrapped in a try/assert.fail here: claimOperatorFirm's own thrown Error
  // already carries the loud, named message this cell needs — node:test fails the cell on any
  // thrown error, and re-wrapping would only discard the original stack for no benefit.
  await rig.claimOperatorFirm(w.firm);
  try {
    await rig.asHuman(w.owner, (c) =>
      c.query("select clara.set_wake_source_enabled($1, true, $2, $3)", [key, "g1-bodies battery: the positive control", `g1b:${key}:on`]),
    );
    const row = await rig.rootQuery("select enabled, enabled_by from clara.wake_engine_sources where source_key=$1", [key]);
    assert.equal(row.rows[0].enabled, true, "the REAL door flipped it");
    assert.ok(row.rows[0].enabled_by, "and stamped who — an audited act, not a silent UPDATE");

    await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue }));
    assert.equal((await readTask(taskId)).status, "running", "the VERY NEXT cycle claims it — no restart, no cache");
    assert.deepEqual(dispatched, [["bankAgent", taskId]], "and dispatches THE REGISTRY KEY the seed row names");
  } finally {
    await rig.rootQuery("update clara.firms set is_operator = false where id = $1", [w.firm]);
  }
});

test("G1B-C2 the export the engine dispatches RESOLVES in the registry — spelling is not identity", { skip }, async () => {
  // Review law 3. The engine bracket-indexes workflowsByName with the registry ROW's
  // workflow_export string; a body that exists under a different key would still throw at
  // start(). Prove the two SEED rows' own values resolve to real functions.
  const seeded = await rig.rootQuery(
    "select source_key, workflow_export, enabled from clara.wake_engine_sources where source_key in ('bank_agent','close_prep') order by source_key",
  );
  assert.equal(seeded.rows.length, 2, "0133 §G seeded both rows");
  for (const row of seeded.rows) {
    assert.equal(row.enabled, false, `${row.source_key} MUST still be disabled — this PR flips nothing`);
    assert.equal(
      typeof registry.workflowsByName[row.workflow_export],
      "function",
      `workflow_export '${row.workflow_export}' must resolve to a real export`,
    );
  }
});

// =====================================================================================
// E2E · A REAL VERB CALL, THROUGH THE REAL CREDENTIAL, WITH THE REAL TOOL SET.
//
// THIS IS THE INSTRUMENT THE REST OF THE BATTERY DID NOT HAVE, and its absence cost four
// defects that an independent review found by reading migrations — the only place a jsonb
// SUB-SHAPE disagreement between this code and the database becomes visible is a call that
// actually reaches the verb. Typecheck cannot see inside a SQL string; freeze-lint hashes
// bytes; the arity gate counts arguments. None of them can see that `p_model` was missing
// the one key rung B2 reads, or that a read's refusal was being counted as a read.
//
// The cell deliberately asserts the ADMITTED path, not merely "no throw": a refusal here is
// indistinguishable from a shape bug, which is exactly how the shape bugs survived.
// =====================================================================================

test("G1B-E2a a REAL task-bound close credential calling a REAL wrapper is ADMITTED — the shape contract, end to end", { skip: skip0138 }, async () => {
  const w = await rig.buildFirm("g1be2a");
  const taskId = await plantQueuedClosePrepTask({ firm: w.firm, client: w.client });

  // The pools the frozen closure reaches through globalThis. Real ones: a runtime connection for
  // the mint, and the WRITE floor (clara_wake_interactive) the twelve wrappers are granted to.
  const previous = globalThis.__claraPools;
  globalThis.__claraPools = {
    withRuntime: (fn) => rig.asRuntime((c) => fn(c)),
    mintWakeCredentialForTask: async (kind, firmId, clientId, agentTaskId, ttl) =>
      rig.asRuntime(async (c) => {
        const r = await c.query(
          "select credential_id, secret from clara.mint_wake_credential_for_task($1,$2,$3,$4,$5::interval)",
          [kind, firmId, clientId, agentTaskId, ttl],
        );
        return { secret: String(r.rows[0].secret) };
      }),
    // The wake secret is bound TXN-LOCALLY exactly as pools.mjs's own withWriteWakeScoped does —
    // set_config(..., true), one transaction, committed. Anything looser would not exercise the
    // wake_context() path the wrappers actually read.
    withWriteWakeScoped: (secret, fn) =>
      rig.withActor({ role: "clara_wake_interactive" }, async (c) => {
        await c.query("begin");
        await c.query("select set_config('clara.wake_secret', $1, true)", [secret]);
        try {
          const out = await fn(c);
          await c.query("commit");
          return out;
        } catch (e) {
          await c.query("rollback").catch(() => {});
          throw e;
        }
      }),
  };

  try {
    const tools = await import("../workflows/closePrep.v1.tools.ts");
    const rec = tools.newCloseRunRecord();
    const ctx = { taskId, firmId: w.firm, clientId: w.client };
    const built = tools.buildClosePrepTools(ctx, rig.DEFAULT_MODEL, rec);

    const out = await built.list_fiscal_years.execute({ rationale: "the nightly close-prep pass is checking which years have ended" });

    // THE ASSERTION THAT MATTERS. A wrong p_model shape, a wrong op-key derivation, an unbound
    // credential, a client-pin mismatch — every one of them lands as status='refused' (or an
    // {error} from a raise), and every one of them would have shipped silently.
    assert.equal(
      out?.status,
      "acted",
      `the wrapper must ADMIT the call — got ${JSON.stringify(out)?.slice(0, 400)}. A 'refused' here is a SHAPE disagreement with the DB, not a books problem.`,
    );
    assert.ok(out.receipt_id, "and it wrote its own receipt, in its own transaction");
    assert.equal(rec.reads, 1, "the read counter counted the ADMITTED read");

    // THE COUNTER'S OTHER DIRECTION, driven for real rather than asserted: the SAME tool called
    // with a blank rationale is refused by Tier B, and must NOT count. This is the M4 defect's
    // own regression — an earlier read() counted anything that did not throw.
    const refused = await built.list_fiscal_years.execute({ rationale: " " });
    assert.equal(refused?.status, "refused", "a blank rationale is a Tier-B refusal, RETURNED not raised (0138:1799-1800)");
    assert.equal(rec.reads, 1, "and a refusal does NOT count as a read — otherwise the run settles 'completed' having done nothing");
  } finally {
    globalThis.__claraPools = previous;
  }
});

// =====================================================================================
// D · closePrep_v1's own carrier — direct_queue, its own claim, its own settle.
// =====================================================================================

test("G1B-D1 closePrep claims a running direct_queue task and binds; a foreign run stands down UNBOUND", { skip }, async () => {
  const w = await rig.buildFirm("g1bd1");
  const taskId = await plantQueuedClosePrepTask({ firm: w.firm, client: w.client });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  const runId = randomUUID();
  const ok = await rig.asRuntime((c) => closeInfra.claimCloseTask(c, taskId, runId));
  assert.equal(ok.claimed, true);
  assert.equal(ok.ctx.clientId, w.client, "a direct_queue task carries its client on the ROW — no event chain to read");
  const foreign = await rig.asRuntime((c) => closeInfra.claimCloseTask(c, taskId, randomUUID()));
  assert.equal(foreign.claimed, false);
  assert.equal(foreign.bound, false, "a duplicate start binds nothing and therefore settles nothing");
  assert.equal((await readTask(taskId)).workflow_run_id, runId);
});

test("G1B-D2 a close_prep settle needs no outbox row — v_intent is null BY CONSTRUCTION, not by a missed match", { skip }, async () => {
  const w = await rig.buildFirm("g1bd2");
  const taskId = await plantQueuedClosePrepTask({ firm: w.firm, client: w.client });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  await rig.asRuntime((c) => closeInfra.settleCloseTask(c, taskId, "completed", null));
  assert.equal((await readTask(taskId)).status, "completed", "the settle verb handles a carrier with no wakes_outbox row");
});

test("G1B-D3 the claim CAS is KIND-SCOPED — closePrep cannot claim a wake task, and vice versa", { skip }, async () => {
  // Review law 3: a task id is not proof of its kind. A dispatch bug that handed the wrong body
  // a task id must refuse, not act on a task whose lifecycle it does not own.
  const w = await rig.buildFirm("g1bd3");
  const { taskId: wakeTask } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [wakeTask]);
  const crossed = await rig.asRuntime((c) => closeInfra.claimCloseTask(c, wakeTask, randomUUID()));
  assert.equal(crossed.claimed, false, "closePrep refuses a kind='wake' task");
  assert.equal((await readTask(wakeTask)).workflow_run_id, null, "and binds nothing to it");

  const closeTask = await plantQueuedClosePrepTask({ firm: w.firm, client: w.client });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [closeTask]);
  const crossedBack = await rig.asRuntime((c) => bankInfra.claimBankTask(c, closeTask, randomUUID()));
  assert.equal(crossedBack.claimed, false, "bankAgent refuses a kind='close_prep' task");
  assert.equal((await readTask(closeTask)).workflow_run_id, null);
});
