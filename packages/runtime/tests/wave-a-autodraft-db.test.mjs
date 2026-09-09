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
import { autodraftHealth, runAutodraftCycle, runCatchupPass, AUTODRAFT_CONSUMER, AUTODRAFT_MAX_ATTEMPTS } from "../lib/autodraft.mjs";
import { deadLetterCategory, relayFirmCategory } from "../lib/consumer-health.mjs";
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

// #617 — THE CATEGORIES, AGAINST A REAL DATABASE. Spine tables only, so both cells run in the
// SAME pre-0011 tier as the health cell above.
//
// [#686 — 2026-09-09] BOTH CELLS USED TO ASSERT AN ESTATE DELTA
// (`seeded.firmsUncheckpointed - before.firmsUncheckpointed === 1`), on the reasoning that an
// absolute estate number would be a fixture of whatever else had run. It is worse than that: CI
// runs `pnpm -r --if-present test`, i.e. the db, web and runtime suites CONCURRENTLY against ONE
// Postgres, and `clara.firm_event_seq` is shared by every consumer and every suite — so the delta
// was ALSO counting every firm another suite created between the two reads. This exact cell failed
// on PR #686 with `4 !== 1`, and it reproduces on demand by running any two consumer suites at
// once. A delta measures what the cell caused only in a world where nothing else runs, and nothing
// enforces that world.
//
// So the categories are now proved where they are deterministic: the PER-FIRM / PER-ROW readers in
// lib/consumer-health.mjs, which answer the same question over the same SQL text about state no
// other suite can touch (their agreement with the estate columns is pinned in
// tests/consumer-health-readers.test.mjs). What the estate counts still assert is only what
// concurrent noise can STRENGTHEN, never break.

test("#617 autodraftHealth: a firm with events and NO checkpoint counts as UNCHECKPOINTED, not merely as lag", { skip }, async () => {
  // The WIRE SHAPE, pinned. #617 moved this query into lib/consumer-health.mjs, shared with
  // every other relay consumer; the fields and their ORDER are what /ready and its readers
  // actually see, so a future consolidation that renames, reorders or drops one fails HERE.
  const shape = await rig.asRuntime((c) => autodraftHealth(c));
  assert.deepEqual(
    Object.keys(shape),
    ["consumer", "lag", "pendingDeadLetters", "firmsTracked", "firmsUncheckpointed", "deadLetters", "deferredWithdrawals"],
    "autodraftHealth's field set and order (deferredWithdrawals keeps its own place)",
  );
  // buildFirm's own firm/client creation events are enough: they put the firm in firm_event_seq
  // while this consumer has never checkpointed it.
  const { firm } = await rig.buildFirm("ad617u");

  const seededFirm = await rig.asRuntime((c) => relayFirmCategory(c, AUTODRAFT_CONSUMER, firm));
  assert.deepEqual(
    { hasEvents: seededFirm.hasEvents, checkpointed: seededFirm.checkpointed },
    { hasEvents: true, checkpointed: false },
    "a firm with events this consumer has never checkpointed is counted as NOT-YET-MEASURED — and is NOT in firmsTracked, the two being complements",
  );
  assert.equal(
    seededFirm.lag,
    await rig.headSeq(firm),
    "while `lag` reads the missing checkpoint as last_seq 0 and reports the firm's ENTIRE history: exactly the ambiguity this category resolves",
  );
  const seeded = await rig.asRuntime((c) => autodraftHealth(c));
  assert.ok(seeded.firmsUncheckpointed >= 1, "and the estate column carries it — a floor another suite's firms can only raise");

  // The discriminating half: run the consumer over those (non-autodraft) events. The firm now HAS
  // a checkpoint, so it leaves the uncheckpointed category — while `lag` (which reads a missing
  // checkpoint as last_seq 0) was never able to tell the two states apart on its own.
  await rig.asRuntime((c) => runAutodraftCycle(c, { onlyFirm: firm, enqueue: async () => {}, log: () => {} }));
  assert.equal(await rig.checkpointSeq(firm, AUTODRAFT_CONSUMER), await rig.headSeq(firm), "mandatory setup: the cycle converged to head");
  const drainedFirm = await rig.asRuntime((c) => relayFirmCategory(c, AUTODRAFT_CONSUMER, firm));
  assert.deepEqual(
    { hasEvents: drainedFirm.hasEvents, checkpointed: drainedFirm.checkpointed, lag: drainedFirm.lag },
    { hasEvents: true, checkpointed: true, lag: 0 },
    "once checkpointed the firm leaves the not-yet-measured category and joins the tracked one, contributing nothing to lag",
  );
  const drained = await rig.asRuntime((c) => autodraftHealth(c));
  assert.ok(drained.firmsTracked >= 1, "which the estate's tracked count carries in turn");
});

test("#617 autodraftHealth: dead letters split into pending vs EXHAUSTED at this consumer's own cap", { skip }, async () => {
  // `before` is kept for ONE field: deferredWithdrawals is a PROCESS-LOCAL counter
  // (deferredWithdrawalState.size, lib/autodraft.mjs), so unlike the estate counts no concurrent
  // suite can move it and comparing it across this cell's work is still exact.
  const before = await rig.asRuntime((c) => autodraftHealth(c));
  const { firm } = await rig.buildFirm("ad617x");
  // Any real event of this firm's own stream carries the dead-letter row (the stamping trigger
  // derives firm/seq/type from it). A raw relay-infra seed — never a books/event insert.
  const eventId = (
    await rig.rootQuery("select id from clara.domain_events where firm_id=$1 order by seq desc limit 1", [firm])
  ).rows[0].id;
  await rig.rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
       values ($1, $2, 'rig-seeded #617', null)`,
    [AUTODRAFT_CONSUMER, eventId],
  );

  // BOUNDARY, from below. One attempt short of the cap the row is still inside its retry budget:
  // it counts as pending and NOT as exhausted. Without this arm the cell would pass for an
  // implementation that simply called every pending dead letter exhausted.
  await rig.rootQuery("update clara.relay_dead_letters set attempt_count = $3 where consumer = $1 and event_id = $2", [
    AUTODRAFT_CONSUMER,
    eventId,
    AUTODRAFT_MAX_ATTEMPTS - 1,
  ]);
  assert.equal(
    await rig.asRuntime((c) => deadLetterCategory(c, AUTODRAFT_CONSUMER, eventId, AUTODRAFT_MAX_ATTEMPTS)),
    "pending",
    "a pending dead letter one short of the cap is counted as pending and NOT as exhausted",
  );
  const retrying = await rig.asRuntime((c) => autodraftHealth(c));
  assert.ok(retrying.deadLetters.pending >= 1, "and the estate backlog carries it");
  assert.equal(retrying.pendingDeadLetters, retrying.deadLetters.pending, "the compatibility field still mirrors the pending total");

  // AT the cap: retrying has stopped (the cycle skips past it and advances the checkpoint), so it
  // needs an operator redrive and is reported as its own category.
  await rig.rootQuery("update clara.relay_dead_letters set attempt_count = $3 where consumer = $1 and event_id = $2", [
    AUTODRAFT_CONSUMER,
    eventId,
    AUTODRAFT_MAX_ATTEMPTS,
  ]);
  assert.equal(
    await rig.asRuntime((c) => deadLetterCategory(c, AUTODRAFT_CONSUMER, eventId, AUTODRAFT_MAX_ATTEMPTS)),
    "exhausted",
    "at the cap the row is EXHAUSTED",
  );
  const exhausted = await rig.asRuntime((c) => autodraftHealth(c));
  assert.ok(exhausted.deadLetters.exhausted >= 1, "and the estate's exhausted count carries it");
  assert.ok(
    exhausted.deadLetters.pending >= exhausted.deadLetters.exhausted,
    "an exhausted row is STILL pending — exhausted is a subset, so the two counts must not be subtracted from each other (exact: one snapshot)",
  );
  assert.equal(
    exhausted.deferredWithdrawals,
    before.deferredWithdrawals,
    "and a poisoned event is NOT a deferred withdrawal — F2-R's process-local signal stays its own category",
  );
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
  // autodraftSettleFailed joined the receipt in the §7-A F1 fix (migration 0047's runtime
  // half): the terminal edge now isolates per task, and a refused settle has to be COUNTED
  // rather than thrown. deepEqual on the whole shape is what noticed the new key — kept
  // exact, and updated, rather than loosened to a subset match.
  assert.deepEqual(out, { autodraftReenqueued: 0, autodraftSettled: 0, autodraftSettleFailed: 0 });
  assert.deepEqual(enqueued, [], "no autodraft tasks in THIS firm -> nothing re-enqueued");
});

test("reconcileAutoDraftTasks is a clean no-op when enqueueAutoDraft is not wired (legacy callers)", { skip }, async () => {
  const out = await rig.asRuntime((c) => reconcileAutoDraftTasks(c, { getRun: () => ({ status: Promise.resolve("running") }) }));
  // ...and the unwired no-op returns the SAME shape as the wired one — including the F1
  // failure counter, which must exist at zero rather than be absent on this early-return path.
  assert.deepEqual(out, { autodraftReenqueued: 0, autodraftSettled: 0, autodraftSettleFailed: 0 });
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
