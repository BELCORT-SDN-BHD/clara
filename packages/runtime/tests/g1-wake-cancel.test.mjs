// 裁-44 — CANCELLATION AND THE LOST RUN: the two defects that let a wake task keep acting, or stop
// existing, without its books ever saying so.
//
//   FOLD-2 — after `cancel_requested` the pass kept minting credentials and writing, and the settle
//            then stamped 'completed' over the cancel. Both lanes, both halves.
//   FOLD-6 — reconciler-wake.mjs treated EVERY getRun error as transient, so a bound running task
//            whose engine run had genuinely vanished was skipped on every sweep, forever.
//
// Both are driven against the real database. FOLD-2's writes are attempted through the SHIPPING
// tool sets; FOLD-6 drives the shipping reconciler with an engine stub that answers the way a
// missing run answers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as rig from "./rig.mjs";
import { reconcileWakeEngineTasks } from "../lib/reconciler-wake.mjs";
import { skip, skip0138, plantHeldWakeTask, plantQueuedClosePrepTask, readTask } from "./g1-wake-bodies.fixtures.mjs";
import { buildApprovedEntries, buildBankAccount, buildBankPrereqs, injectBankPools } from "./g1-wake-bank-fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();

const bankTools = await import("../workflows/bankAgent.v1.tools.ts");
const bankImpl = await import("../workflows/bankAgent.v1.impl.ts");
const bankInfra = await import("../workflows/bankAgent.v1.infra.ts");
const closeImpl = await import("../workflows/closePrep.v1.impl.ts");
const closeInfra = await import("../workflows/closePrep.v1.infra.ts");

test("G1B-CANCEL-1 裁-44 FOLD-2 (bank) — a cancel between an admitted read and a write mints nothing, writes nothing, and settles CANCELLED", { skip }, async () => {
  const w = await rig.buildFirm("g1bcx1");
  await buildBankPrereqs(w);
  const acct = await buildBankAccount(w, [10000]);
  const [entry] = await buildApprovedEntries(w, [10000]);
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: {} });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);

  const previous = injectBankPools();
  try {
    const rec = bankTools.newBankRunRecord("cancel-1");
    const ctx = { taskId, firmId: w.firm, clientId: w.client, bankAccountId: acct.bankAccountId, dueReason: null };
    const built = bankTools.buildBankAgentTools(ctx, rig.DEFAULT_MODEL, rec);

    // THE READ IS ADMITTED FIRST, which is the whole shape of the defect: the claim CAS proved the
    // task was running, the pass got going, and only THEN did the cancel land.
    const pack = await built.get_bank_pack.execute({ rationale: "the nightly pass begins" });
    assert.equal(pack.error, undefined, `the read must be admitted, or this cell proves nothing — got ${JSON.stringify(pack)?.slice(0, 300)}`);
    const credsBefore = await rig.rootQuery("select count(*)::int as n from clara.wake_credentials where firm_id=$1", [w.firm]);
    const receiptsBefore = await rig.rootQuery("select count(*)::int as n from clara.bank_agent_receipts where client_id=$1", [w.client]);

    // THE CANCEL, through the same transition the reconciler and the control listener use.
    await rig.rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);

    const blocked = await built.match_bank_line.execute({ lines: acct.lineIds, entries: [entry], rationale: "a write that must not land" });
    assert.match(String(blocked.error), /no longer running \(cancel_requested\)/, `the write must refuse LOCALLY and name what it saw — got ${JSON.stringify(blocked)?.slice(0, 300)}`);
    assert.equal(rec.cancelledAs, "cancel_requested", "and the record remembers it, so every later act refuses too");

    // NO MINT, NO DML, NO RECEIPT. The mint count is the load-bearing one: the gate reads the task
    // status on the RUNTIME pool, before bankScoped is ever reached.
    const credsAfter = await rig.rootQuery("select count(*)::int as n from clara.wake_credentials where firm_id=$1", [w.firm]);
    assert.equal(credsAfter.rows[0].n, credsBefore.rows[0].n, "NOT ONE further credential was minted");
    const receiptsAfter = await rig.rootQuery("select count(*)::int as n from clara.bank_agent_receipts where client_id=$1", [w.client]);
    assert.equal(receiptsAfter.rows[0].n, receiptsBefore.rows[0].n, "and no receipt was written");
    const members = await rig.rootQuery(
      `select count(*)::int as n from clara.bank_match_entry_members em
         join clara.bank_matches bm on bm.id = em.match_id where bm.client_id=$1`,
      [w.client],
    );
    assert.equal(members.rows[0].n, 0, "and no books row exists");

    // A SECOND ACT REFUSES WITHOUT EVEN ASKING AGAIN — the record short-circuits, so a model that
    // ignores the refusal cannot spend the rest of its budget hammering a stopped task.
    const again = await built.propose_line_exception.execute({ line_id: acct.lineIds[0], kind: "disputed", reason: "r", rationale: "r" });
    assert.match(String(again.error), /no longer running/, "every later act refuses too");

    // THE CLASSIFIER, and then the SETTLE — the two halves of the ruling, in the order the workflow
    // takes them.
    const outcome = bankImpl.classifyBankOutcome(rec, "");
    assert.equal(outcome.kind, "cancelled");
    assert.equal(outcome.observed, "cancel_requested");

    // FOLD-2(b): the settle is handed 'completed' — what a run that finished its pass would say —
    // and must write 'cancelled' anyway. This is the assertion that reds without the coercion.
    await rig.asRuntime((c) => bankInfra.settleBankTask(c, taskId, "completed", null));
    const t = await readTask(taskId);
    assert.equal(t.status, "cancelled", "a cancel already recorded outranks this run's own verdict");
    assert.equal(t.error_code, null, "a cancellation is not an error");
  } finally {
    globalThis.__claraPools = previous;
  }
});

test("G1B-CANCEL-2 裁-44 FOLD-2 (close) — the same wall on the close lane, whose every wrapper mints a task-bound credential", { skip: skip0138 }, async () => {
  const w = await rig.buildFirm("g1bcx2");
  const taskId = await plantQueuedClosePrepTask({ firm: w.firm, client: w.client });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);

  const previous = globalThis.__claraPools;
  globalThis.__claraPools = {
    withRuntime: (fn) => rig.asRuntime((c) => fn(c)),
    mintWakeCredentialForTask: async (kind, firmId, clientId, agentTaskId, ttl) =>
      rig.asRuntime(async (c) => {
        const r = await c.query("select credential_id, secret from clara.mint_wake_credential_for_task($1,$2,$3,$4,$5::interval)", [
          kind, firmId, clientId, agentTaskId, ttl,
        ]);
        return { secret: String(r.rows[0].secret) };
      }),
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
    const built = tools.buildClosePrepTools({ taskId, firmId: w.firm, clientId: w.client }, rig.DEFAULT_MODEL, rec);

    const read = await built.list_fiscal_years.execute({ rationale: "the nightly close-prep pass begins" });
    assert.equal(read?.status, "acted", `the read must be admitted first — got ${JSON.stringify(read)?.slice(0, 300)}`);
    assert.equal(rec.reads, 1);
    const receiptsBefore = await rig.rootQuery("select count(*)::int as n from clara.agent_act_receipts where client_id=$1", [w.client]);
    const fyBefore = await rig.rootQuery("select count(*)::int as n from clara.fiscal_years where client_id=$1", [w.client]);

    await rig.rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);

    const blocked = await built.open_fiscal_year.execute({ label: "FY2030", starts_on: "2030-01-01", rationale: "a write that must not land" });
    assert.match(String(blocked.error), /no longer running \(cancel_requested\)/, `the write must refuse LOCALLY — got ${JSON.stringify(blocked)?.slice(0, 300)}`);
    assert.equal(rec.cancelledAs, "cancel_requested");

    const receiptsAfter = await rig.rootQuery("select count(*)::int as n from clara.agent_act_receipts where client_id=$1", [w.client]);
    assert.equal(receiptsAfter.rows[0].n, receiptsBefore.rows[0].n, "no receipt was written after the cancel");
    const fyAfter = await rig.rootQuery("select count(*)::int as n from clara.fiscal_years where client_id=$1", [w.client]);
    assert.equal(fyAfter.rows[0].n, fyBefore.rows[0].n, "and no fiscal year was opened");

    // A READ IS STILL ALLOWED TO COMPLETE, deliberately — a read changes nothing, and letting one
    // finish is what lets the run settle truthfully rather than mid-sentence.
    const stillReads = await built.list_fiscal_years.execute({ rationale: "reads are not gated" });
    assert.equal(stillReads?.status, "acted", "the ruling gates WRITES, not reads");

    const outcome = closeImpl.classifyCloseOutcome(rec, "");
    assert.equal(outcome.kind, "cancelled");
    assert.equal(outcome.observed, "cancel_requested");

    await rig.asRuntime((c) => closeInfra.settleCloseTask(c, taskId, "completed", null));
    const t = await readTask(taskId);
    assert.equal(t.status, "cancelled", "the settle coerces 'completed' to 'cancelled' on this carrier too");
    assert.equal(t.error_code, null);
  } finally {
    globalThis.__claraPools = previous;
  }
});

test("G1B-LOST-1 裁-44 FOLD-6 — a bound running wake task whose engine run is GONE settles failed/engine_lost", { skip }, async () => {
  // THE DEFECT: settleFromEngineTruth caught every getRun error and `continue`d. §A cannot see this
  // row (workflow_run_id is not null) and §B walked away from it, so a task whose engine run had
  // genuinely vanished stayed 'running' on both projections forever — the exact stranding
  // clara._settle_wake_task exists to cure. reconciler.mjs's own §C has always made the
  // distinction; this belt simply asks the same question with the same instrument.
  const w = await rig.buildFirm("g1blost");
  const { taskId, intentId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, status) values ($1,'held') on conflict do nothing", [intentId]);
  await rig.rootQuery("update clara.agent_tasks set status='running', workflow_run_id=$2 where id=$1", [taskId, randomUUID()]);

  // The engine's own "run id unknown" signal, in the shape reconciler-documents.mjs's
  // isRunNotFound actually tests for (a RunNotFound name, or a "run … not found" message). Written
  // as the NAME, so this cell is not pinned to a message string.
  const lost = () => {
    const e = new Error("nope");
    e.name = "RunNotFoundError";
    throw e;
  };
  const out = await rig.asRuntime((c) => reconcileWakeEngineTasks(c, { onlyFirm: w.firm, getRun: () => ({ get status() { return lost(); } }) }));
  assert.ok(out.wakeSettled >= 1, `the belt must have settled it — got ${JSON.stringify(out)}`);
  const t = await readTask(taskId);
  assert.equal(t.status, "failed", "a run the engine no longer has is LOST, and a lost run on a running task is a failure");
  assert.equal(t.error_code, "engine_lost", "with terminalFor's own code for exactly this — no value minted here");

  // THE NEGATIVE CONTROL, and it is the half that keeps this from being a blunt instrument: a
  // GENUINELY TRANSIENT error must still skip, or one flaky probe would terminal-ize live work.
  const w2 = await rig.buildFirm("g1blost2");
  const second = await plantHeldWakeTask({ owner: w2.owner, client: w2.client, payload: { bank_account_id: randomUUID() } });
  await rig.rootQuery("update clara.agent_tasks set status='running', workflow_run_id=$2 where id=$1", [second.taskId, randomUUID()]);
  const flaky = () => {
    throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
  };
  const out2 = await rig.asRuntime((c) =>
    reconcileWakeEngineTasks(c, { onlyFirm: w2.firm, getRun: () => ({ get status() { return flaky(); } }) }),
  );
  assert.equal(out2.wakeSettled, 0, "a transient probe failure settles nothing");
  assert.equal((await readTask(second.taskId)).status, "running", "and the row is left exactly where the next sweep will find it");
});
