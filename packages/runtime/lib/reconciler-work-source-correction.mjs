// #1030 — THE SOURCE-CORRECTION RE-DERIVATION BELT. Split out of reconciler.mjs like
// reconciler-work.mjs / reconciler-batches.mjs (the module-size budget); the sweep in
// reconciler.mjs wires it as ONE contained belt.
//
// WHAT IT IS FOR. #885 (0268) retires every Work parked on a question about a document fact
// somebody corrects, and admits nothing in its place, because re-admission ON THE CORRECTED FACTS
// needs somebody to re-read the corrected document and propose a basis from it. This belt is that
// somebody.
//
// WHY A BELT AND NOT THE RETIRED RUN, and it is a measurement rather than a preference. The
// retirement puts the parked task into `cancel_requested` and NOTIFYs; the control listener then
// ABORTS that engine run (lib/control.mjs §2) as well as resuming its hook. So the retired run is
// not guaranteed to be resumed at all, and a lane built on its resume would re-derive sometimes.
// A durable backlog read plus an exactly-once settlement is what survives that — and what survives
// this process dying between the admission and the settlement.
//
// THE CRASH WINDOW, AND WHY IT IS SAFE TO LEAVE OPEN. Between `clara.admit_journal_work` and
// `clara.settle_source_corrected_rederivation` a crash leaves a successor admitted and unclaimed.
// The next sweep reads the SAME correction (it is still unsettled), re-derives the same basis from
// the same live facts, and re-admits under the SAME intent key — which the admission door answers
// as a REPLAY with the original work id — then settles. Nothing is duplicated and nothing is
// undone. That is the whole reason the successor's intent key IS the correction's op key.
//
// IT MAKES NO ACCOUNTING JUDGEMENT OF ITS OWN. The derivation is `lib/source-correction-rederive.mjs`,
// a pure function; where the mapping is not obvious it DECLINES by name and the belt records that
// decline, which leaves the estate exactly where #885 left it: a person is told to give the
// instruction again. Everything it does admit is parked on a confirmation question naming both
// figures, and nothing may post until a person answers it.
//
// FEATURE-DETECTED, PER CYCLE, EXACT SIGNATURE (the reconciler-batches.mjs / reconciler-fa.mjs
// idiom): `to_regprocedure` is a plain catalog read that needs no EXECUTE, so an image deployed
// before 0321 lands boots DORMANT and lights on the very next cycle after the migration applies,
// with no restart.

import { rederivedBasis } from "./source-correction-rederive.mjs";
// Same identity test, and the SAME import specifier, reconciler-batches.mjs uses for it, so
// `instanceof` agrees with leader.mjs's onHalt.
import { TaxonomyHaltError } from "./relay.mjs";

const NOOP_LOG = /** @type {(message: string) => void} */ (() => {});
const SWEEP_LIMIT = Number(process.env.CLARA_SOURCE_CORRECTION_SWEEP_LIMIT || 20);

/** What `clara.admit_journal_work` is told served this admission. It is NOT a model name and must
 *  not be dressed as one: this lane spends no tokens and asks nothing. The door requires a
 *  non-blank snapshot so every Work row says who produced it, and this is the honest answer. */
export const REDERIVE_MODEL_ID = "clara-source-correction-rederive:v1";

/**
 * @param {import("pg").PoolClient} client  the leader's already-role-set clara_runtime connection
 * @param {{ log?: (m: string) => void, withRuntime?: (fn: any) => Promise<any> }} deps
 */
export async function reconcileWorkSourceCorrections(client, { log = NOOP_LOG, withRuntime = null } = {}) {
  // THE PROBE IS ISOLATED, AND "ABSENT" AND "UNREADABLE" MUST NOT REPORT THE SAME THING — the
  // reconciler-batches.mjs:60-75 precedent, cloned rather than reinvented. `Dormant: false` on a
  // throw is the half that carries the meaning: a catalog read that FAILED is a connection or
  // session problem, not a missing 0321.
  let present;
  try {
    present = await client.query(
      "select to_regprocedure('clara.source_correction_rederivations(integer)') is not null as ok");
  } catch (err) {
    if (err instanceof TaxonomyHaltError || err?.halt) throw err;
    log(`[reconcile] source correction re-derivation: surface probe error — ${err?.message ?? err}`);
    return {
      sourceCorrectionOk: false, sourceCorrectionDormant: false,
      sourceCorrectionAdmitted: 0, sourceCorrectionDeclined: 0,
    };
  }
  if (!present.rows[0]?.ok) {
    return {
      sourceCorrectionOk: true, sourceCorrectionDormant: true,
      sourceCorrectionAdmitted: 0, sourceCorrectionDeclined: 0,
    };
  }

  let backlog;
  try {
    const r = await client.query(
      "select clara.source_correction_rederivations($1::int) as result", [SWEEP_LIMIT]);
    backlog = Array.isArray(r.rows[0]?.result) ? r.rows[0].result : [];
  } catch (err) {
    if (err instanceof TaxonomyHaltError || err?.halt) throw err;
    log(`[reconcile] source correction re-derivation: the worklist itself failed — ${err?.message ?? err}`);
    return { sourceCorrectionOk: false, sourceCorrectionAdmitted: 0, sourceCorrectionDeclined: 0 };
  }
  if (backlog.length === 0) {
    return { sourceCorrectionOk: true, sourceCorrectionAdmitted: 0, sourceCorrectionDeclined: 0 };
  }

  // One transaction per correction, so a correction that refuses cannot roll a sibling back. The
  // factory is resolved LAZILY from lib/pools.mjs rather than taken from `deps`, so no caller of
  // runReconcilerSweep grows an argument; a test injects its own and never touches a real pool.
  let runInTxn = withRuntime;
  if (typeof runInTxn !== "function") runInTxn = (await import("./pools.mjs")).withRuntime;
  if (typeof runInTxn !== "function") {
    return { sourceCorrectionOk: true, sourceCorrectionAdmitted: 0, sourceCorrectionDeclined: 0 };
  }

  let admitted = 0; let declined = 0; let failed = 0;
  for (const b of backlog) {
    const opKey = b?.op_key ?? "(no op key)";
    try {
      const derived = rederivedBasis(b);
      // AWAITED IN A LOOP, DELIBERATELY: per-correction isolation, by design.
      if (!derived.ok) {
        await runInTxn((c) => c.query(
          "select clara.settle_source_corrected_rederivation($1::text, $2::uuid, $3::text) as r",
          [b.op_key, null, derived.reason]));
        declined += 1;
        continue;
      }
      await runInTxn(async (c) => {
        const a = await c.query(
          `select clara.admit_journal_work($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text,
             $6::jsonb, $7::text) as r`,
          [b.client_id, b.corrected_by, b.op_key, JSON.stringify(derived.basis),
            "clara_interpreted", JSON.stringify(b.retired_source_refs ?? []), REDERIVE_MODEL_ID]);
        const successor = a.rows[0]?.r?.work_id ?? null;
        await c.query(
          "select clara.settle_source_corrected_rederivation($1::text, $2::uuid, $3::text) as r",
          [b.op_key, successor, null]);
      });
      admitted += 1;
    } catch (err) {
      if (err instanceof TaxonomyHaltError || err?.halt) throw err;
      failed += 1;
      // Logged EVERY cycle, never de-duplicated: a persistent strand that logs once is one grep
      // away from invisible (reconciler.mjs's own law for its belt errors).
      log(`[reconcile] source correction re-derivation: ${opKey} failed — ${err?.message ?? err}`);
    }
  }

  return {
    sourceCorrectionOk: true,
    sourceCorrectionAdmitted: admitted,
    sourceCorrectionDeclined: declined,
    sourceCorrectionFailed: failed,
  };
}
