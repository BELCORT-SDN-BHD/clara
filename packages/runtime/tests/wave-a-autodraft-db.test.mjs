// Wave A — the autodraft consumer/reconciler against the throwaway DB. Split into two tiers:
//   * runtimeReady-gated (RUN NOW): autodraftHealth reads only spine tables (0005), and the
//     reconciler's autodraft edges no-op cleanly when no autodraft task rows exist (pre-0011
//     the kind CHECK excludes 'autodraft', so every query returns empty).
//   * autodraft-surface-gated (SKIP until 0011): the catch-up admission + sweep-run reconcile
//     exercise the 0011 fns (admit_autodraft_task / list_autodraft_candidates /
//     reconcile_sweep_runs). The heavy admission-race fan-out lives in Lane B's contract-blind
//     battery (§11); this is the runtime-lane integration smoke.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as rig from "./rig.mjs";
import { autodraftHealth, runCatchupPass } from "../lib/autodraft.mjs";
import { reconcileAutoDraftTasks, terminalForAutodraft } from "../lib/reconciler.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

/** SKIP until 0011 applies the FULL autodraft admission surface. Per the team-lead's note,
 *  the gate keys on each fn's EXISTENCE (never assumes it) — including PIN-ADD-1's
 *  list_document_autodraft_candidates, which Lane A's mid-run Codex may land later. A missing
 *  fn -> a clean skip, never a test that runs and errors on an absent surface. */
async function autodraftSurfaceReady() {
  if (!READY) return false;
  const r = await rig.rootQuery(
    `select
       to_regprocedure('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)') is not null as admit,
       to_regprocedure('clara.list_autodraft_candidates()') is not null as candidates,
       to_regprocedure('clara.list_document_autodraft_candidates(uuid)') is not null as resolver,
       to_regprocedure('clara.reconcile_sweep_runs()') is not null as reconcile`,
  );
  return r.rows[0].admit === true && r.rows[0].candidates === true && r.rows[0].resolver === true && r.rows[0].reconcile === true;
}
const surface = await autodraftSurfaceReady();
const skip0011 = surface ? false : "0011 autodraft surface absent (skips until integration)";

after(async () => {
  await rig.endPool();
});

// --- pure matrix -----------------------------------------------------------

test("terminalForAutodraft settles a terminal engine failed (no awaiting_input branch)", () => {
  assert.deepEqual(terminalForAutodraft("failed"), { outcome: "failed", reason: "internal" });
  assert.deepEqual(terminalForAutodraft("lost"), { outcome: "failed", reason: "engine_lost" });
  assert.deepEqual(terminalForAutodraft("cancelled"), { outcome: "failed", reason: "cancelled" });
  assert.deepEqual(terminalForAutodraft("completed"), { outcome: "failed", reason: "internal" });
  assert.equal(terminalForAutodraft("running"), null, "in-flight -> no settle");
});

// --- runs NOW (spine-only) -------------------------------------------------

test("autodraftHealth reports the consumer's own lag + dead-letter counts (spine tables only)", { skip }, async () => {
  const h = await rig.asRuntime((c) => autodraftHealth(c));
  assert.equal(h.consumer, "autodraft");
  assert.equal(typeof h.lag, "number");
  assert.equal(typeof h.pendingDeadLetters, "number");
  assert.ok(h.lag >= 0 && h.pendingDeadLetters >= 0 && h.firmsTracked >= 0);
});

// [ROOT-ERADICATION residue R9 / WDB-R1 — ruled 2026-08-03] THIS CELL USED TO ASSERT A GLOBAL
// ZERO. `reconcileAutoDraftTasks` with no `onlyFirm` walks EVERY firm's agent_tasks, so the
// assertion was not "this cell's world is empty" but "the whole database is empty of autodraft
// work" — a statement no cell owns and no cell can keep true. CI runs `pnpm -r --if-present
// test`, i.e. the db package and the runtime package against ONE shared database, so any earlier
// suite that left a queued autodraft task behind turns this green cell red (measured: the full
// DB suite then the runtime suite, sequentially, on one database -> 999/1000). It has been green
// for many waves only because the two packages' cells happen not to overlap in time, which
// nothing enforces. Pre-existing, NOT introduced by 0042 — but "fix it all at the root" means
// the assertion should say what it always meant.
//
// THE FIX USES THE PRODUCTION KNOB, not a test-only escape hatch: the reconciler already carries
// `onlyFirm`, the same predicate the per-firm sweep uses in production. Scoping the cell to a
// firm id that owns nothing makes the claim true by construction and immune to any other suite.
test("reconcileAutoDraftTasks no-ops cleanly when its own firm has no autodraft task rows", { skip }, async () => {
  const enqueued = [];
  const out = await rig.asRuntime((c) =>
    reconcileAutoDraftTasks(c, {
      // A firm id that exists in no row anywhere — the cell's own empty world.
      onlyFirm: randomUUID(),
      enqueueAutoDraft: async (id) => enqueued.push(id),
      getRun: () => ({ status: Promise.resolve("running") }),
    }),
  );
  assert.deepEqual(out, { autodraftReenqueued: 0, autodraftSettled: 0 });
  assert.deepEqual(enqueued, [], "no autodraft tasks in THIS firm -> nothing re-enqueued");
});

test("reconcileAutoDraftTasks is a clean no-op when enqueueAutoDraft is not wired (legacy callers)", { skip }, async () => {
  const out = await rig.asRuntime((c) => reconcileAutoDraftTasks(c, { getRun: () => ({ status: Promise.resolve("running") }) }));
  assert.deepEqual(out, { autodraftReenqueued: 0, autodraftSettled: 0 });
});

// --- SKIP until 0011 -------------------------------------------------------

// [WDB-R4 — the question the R9 fix did NOT ask.] Scoping a no-op assertion to a firm that
// cannot own rows makes it un-pollutable AND makes it VACUOUS: it would stay green if arm (A)
// were deleted outright, or if `onlyFirm` silently matched nothing for every firm. A cell that
// only walks its own fix's path proves nothing. So this one plants a genuinely stuck autodraft
// task and asks the reconciler THREE questions the scoping fix does not answer on its own:
//   (i)   scoped to the task's OWN firm, is it found and re-enqueued? (arm A is alive)
//   (ii)  scoped to a DIFFERENT firm, is it left alone? (the predicate is real, not decoration)
//   (iii) once the task leaves `queued`, is it dropped? (the status half of the predicate)
// It then leaves the database as it found it: the planted task is cancelled through the LEGAL
// queued->cancelled transition (`_tf_agent_task_update`; agent_tasks are never deleted), so this
// cell cannot become the pollution it exists to guard against.
// Gated on skip0011 rather than `skip` because `kind='autodraft'` is a 0011 CHECK value.
test("the autodraft reconciler's firm predicate is load-bearing: a planted stuck task is re-enqueued for ITS firm, invisible to another, and dropped once it leaves queued", { skip: skip0011 }, async () => {
  const mine = await rig.buildFirm("r9a");
  const other = await rig.buildFirm("r9b");
  const planted = (
    await rig.rootQuery(
      `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot, created_at)
         values ($1, $2, 'autodraft', 'queued', $3, now() - interval '1 hour') returning id`,
      [mine.firm, mine.client, rig.DEFAULT_MODEL],
    )
  ).rows[0].id;

  const run = async (firm) => {
    const enqueued = [];
    const out = await rig.asRuntime((c) =>
      reconcileAutoDraftTasks(c, {
        onlyFirm: firm,
        enqueueAutoDraft: async (id) => enqueued.push(id),
        getRun: () => ({ status: Promise.resolve("running") }),
      }),
    );
    return { out, enqueued };
  };

  const foreign = await run(other.firm);
  assert.deepEqual(foreign.enqueued, [], "(ii) a task belonging to another firm is not re-enqueued");
  assert.equal(foreign.out.autodraftReenqueued, 0, "(ii) …and the count agrees — the firm predicate is real");

  const own = await run(mine.firm);
  assert.deepEqual(own.enqueued, [planted], "(i) scoped to its own firm the stuck task IS re-enqueued — arm (A) is alive, so the zero above is a fact and not a vacuum");
  assert.equal(own.out.autodraftReenqueued, 1, "(i) …and exactly one, not a duplicate sweep");

  // Leave it as we found it, through the legal transition — and check the status half too.
  await rig.rootQuery("update clara.agent_tasks set status = 'cancelled' where id = $1", [planted]);
  const after = await run(mine.firm);
  assert.deepEqual(after.enqueued, [], "(iii) a task that has left `queued` is no longer a candidate");
  assert.equal(
    (await rig.rootQuery("select count(*)::int n from clara.agent_tasks where kind='autodraft' and status='queued' and workflow_run_id is null and firm_id in ($1,$2)", [mine.firm, other.firm])).rows[0].n,
    0,
    "this cell leaves no stuck autodraft row behind — it must not become the pollution it guards against",
  );
});

test("runCatchupPass drives list_autodraft_candidates + reconcile_sweep_runs without throwing", { skip: skip0011 }, async () => {
  const enqueued = [];
  const out = await rig.asRuntime((c) => runCatchupPass(c, { enqueue: async (id) => enqueued.push(id), log: () => {} }));
  assert.equal(typeof out.firms, "number");
  assert.equal(typeof out.admitted, "number");
  assert.ok(out.admitted >= 0, "an empty candidate set admits nothing");
});
