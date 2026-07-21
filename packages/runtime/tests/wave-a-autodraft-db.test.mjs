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

test("reconcileAutoDraftTasks no-ops cleanly when no autodraft task rows exist", { skip }, async () => {
  const enqueued = [];
  const out = await rig.asRuntime((c) =>
    reconcileAutoDraftTasks(c, {
      enqueueAutoDraft: async (id) => enqueued.push(id),
      getRun: () => ({ status: Promise.resolve("running") }),
    }),
  );
  assert.deepEqual(out, { autodraftReenqueued: 0, autodraftSettled: 0 });
  assert.deepEqual(enqueued, [], "no autodraft tasks -> nothing re-enqueued");
});

test("reconcileAutoDraftTasks is a clean no-op when enqueueAutoDraft is not wired (legacy callers)", { skip }, async () => {
  const out = await rig.asRuntime((c) => reconcileAutoDraftTasks(c, { getRun: () => ({ status: Promise.resolve("running") }) }));
  assert.deepEqual(out, { autodraftReenqueued: 0, autodraftSettled: 0 });
});

// --- SKIP until 0011 -------------------------------------------------------

test("runCatchupPass drives list_autodraft_candidates + reconcile_sweep_runs without throwing", { skip: skip0011 }, async () => {
  const enqueued = [];
  const out = await rig.asRuntime((c) => runCatchupPass(c, { enqueue: async (id) => enqueued.push(id), log: () => {} }));
  assert.equal(typeof out.firms, "number");
  assert.equal(typeof out.admitted, "number");
  assert.ok(out.admitted >= 0, "an empty candidate set admits nothing");
});
