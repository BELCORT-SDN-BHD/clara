// #636 — the INTAKE BATCH cancellation belt. Split out of reconciler.mjs like
// reconciler-work.mjs / reconciler-documents.mjs / reconciler-fa.mjs (the module-size budget);
// the sweep in reconciler.mjs wires it as ONE contained belt.
//
// WHAT IT IS FOR. `clara.cancel_intake_batch` makes ONE governed decision and hands back the live
// children; the route then fans `clara.cancel_accounting_work` out, one call per transaction. A
// process that dies between child 50 and child 51 leaves the parent `cancelling` with children
// nobody has asked to stop. This belt is what finishes the job, and it is why the parent STORES
// its decision.
//
// IT CANNOT USE ITS OWN IDENTITY, BY CONSTRUCTION. Every child key is derived from the STORED
// `cancel_op_key` and every call carries the STORED `cancel_requested_by`, both read back from
// `clara.sweep_intake_batch_cancellations`. MEASURED on the rig: `clara._work_door_ctx` hashes
// `{work, author}` (0184:262-264), so a fan-out re-issued under a different author raises CLR10
// `op_key_conflict` on every child. A belt that minted a fresh key would be a SECOND decision.
//
// WHY THE WORKLIST IS A DOOR AND NOT A QUERY. `clara_runtime` holds no SELECT and no policy on
// `clara.operation_receipts` — 0178's own tail asserts both (0178:1619-1630) — and none on
// `clara.intake_batches`. So the pool can read neither the committed receipts that decide which
// children are still live nor the `cancelling` parent itself. The sweep verb is the only shape
// left, and it also performs the terminal flip for a parent with nothing live.
//
// FEATURE-DETECTED, PER CYCLE, EXACT SIGNATURE (the reconciler-fa.mjs / wiki-projection.mjs
// idiom): `to_regprocedure` is a plain catalog read that needs no EXECUTE, so an image deployed
// before 0229 lands boots DORMANT and lights on the very next cycle after the migration applies,
// with no restart.
//
// ERROR ISOLATION PER PARENT. A poisoned parent's fan-out is counted and the belt moves to the
// next one; `batchCancelOk` goes false ONLY for a whole-belt failure (the worklist call itself),
// because pinning it false for one permanently-refusing parent would say "we do not know" about
// a sweep that in fact settled everything else. A parent that can NEVER progress is counted
// separately as `batchCancelBlocked` and logged by name, so "one child refused once" and "this
// batch will never finish stopping" are not the same number (fix round 1, ADV-636-03).

import { resumeCancel } from "./intake-batches.mjs";

const NOOP_LOG = /** @type {(message: string) => void} */ (() => {});
const BATCH_SWEEP_LIMIT = Number(process.env.CLARA_INTAKE_BATCH_SWEEP_LIMIT || 20);

/**
 * @param {import("pg").PoolClient} client  the leader's already-role-set clara_runtime connection
 * @param {{ log?: (m: string) => void, withRuntime?: (fn: any) => Promise<any> }} deps
 */
export async function reconcileIntakeBatchCancellations(client, { log = NOOP_LOG, withRuntime = null } = {}) {
  const present = await client.query(
    "select to_regprocedure('clara.sweep_intake_batch_cancellations(integer)') is not null as ok");
  if (!present.rows[0]?.ok) {
    return { batchCancelOk: true, batchCancelDormant: true, batchCancelSettled: 0, batchCancelChildren: 0 };
  }

  let worklist;
  try {
    const r = await client.query(
      "select clara.sweep_intake_batch_cancellations($1::int) as result", [BATCH_SWEEP_LIMIT]);
    worklist = r.rows[0]?.result ?? { batches: [], settled: [] };
  } catch (err) {
    log(`[reconcile] intake batch cancellations: the worklist itself failed — ${err?.message ?? err}`);
    return { batchCancelOk: false, batchCancelSettled: 0, batchCancelChildren: 0 };
  }

  const settled = Array.isArray(worklist.settled) ? worklist.settled.length : 0;
  let children = 0; let failed = 0; let blocked = 0;

  // The fan-out needs its OWN transaction per child, so it cannot ride the leader's connection:
  // one call per transaction is what lets a child that already posted answer `already_completed`
  // without rolling its siblings back. The factory is RESOLVED LAZILY from lib/pools.mjs rather
  // than taken from `deps`, so no caller of runReconcilerSweep has to grow a new argument; a test
  // injects its own through `deps.withRuntime` and never touches a real pool.
  let runInTxn = withRuntime;
  if (typeof runInTxn !== "function" && (worklist.batches ?? []).length > 0) {
    runInTxn = (await import("./pools.mjs")).withRuntime;
  }
  if (typeof runInTxn !== "function") {
    return { batchCancelOk: true, batchCancelSettled: settled, batchCancelChildren: 0 };
  }

  for (const parent of worklist.batches ?? []) {
    try {
      // AWAITED IN A LOOP, DELIBERATELY: per-parent isolation, by design
      const out = await resumeCancel(runInTxn, parent, { log });
      children += (out.cancelled?.length ?? 0);
      if ((out.refused?.length ?? 0) > 0) failed += out.refused.length;
      // FIX ROUND 1, ADV-636-03. A parent whose EVERY child refused CLR04 cannot make progress on
      // any future sweep either: the fan-out must re-issue with the STORED actor (clara._work_door_ctx
      // hashes {work, author}, so any other identity is CLR10 op_key_conflict), and that actor has
      // lost authority. It is not a transient refusal and must not read as one — `batchCancelFailed`
      // alone left the belt looking like it was retrying something. `clara.get_intake_batch` names
      // the same condition to the human as `cancel_blocked`.
      const refusals = out.refused ?? [];
      if (refusals.length > 0 && refusals.every((r) => r.code === "CLR04")) {
        blocked += 1;
        log(`[reconcile] intake batch cancellations: parent ${parent?.batch_id} is BLOCKED — `
          + `its stored canceller no longer holds authority, so ${refusals.length} child(ren) `
          + "cannot be stopped under that decision and no future sweep will change that");
      }
    } catch (err) {
      failed += 1;
      log(`[reconcile] intake batch cancellations: parent ${parent?.batch_id} fan-out failed — ${err?.message ?? err}`);
    }
  }

  return {
    batchCancelOk: true,
    batchCancelSettled: settled,
    batchCancelChildren: children,
    batchCancelFailed: failed,
    batchCancelBlocked: blocked,
  };
}
