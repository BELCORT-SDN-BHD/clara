// The SANDBOX EXPORT DISPATCH sweep (Wave F Track-A, F-A5b card 1; design §7 items 10 and 15).
//
// A SIBLING OF reconciler-render.mjs, NOT A WIDENING OF IT. clara.sandbox_exports is its own job
// family with its own verbs and its own lifecycle wall; the two queues' rows never meet. Splitting
// it out follows the same module-size pressure that split reconciler-sst / -lint / -fa /
// -adjustments out of reconciler.mjs.
//
// WHAT IT DECIDES, AND WHAT IT DELIBERATELY DOES NOT. Exactly one thing: whether to start a render
// machine right now. It does not decide what to render, whether an export is allowed, which export
// is next, or whether a produced document may be delivered — clara.sandbox_dispatch_begin picks the
// due rows and the worker's own lease and the export lane's coverage proof decide the rest. The
// dispatch is a doorbell, not a door.
//
// DUE ARITHMETIC IS DB-OWNED (the reconciler-fa.mjs law, verbatim, and reconciler-render.mjs's own
// restatement of it). The leader asks and is TOLD which exports are due; it never re-derives
// due-ness from timestamps client-side. The attempt is stamped inside that call, BEFORE the machine
// API is touched, so a persistently failing dispatch backs off on the cooldown instead of storming
// every cycle.
//
// A LEADER OUTAGE IS A DELAY, NEVER A LOSS. Nothing in this module can lose an export: the queue
// row stays `claimable` whatever happens here, and the wait it actually suffered is recorded on the
// row by clara.claim_sandbox_export's own claim_delay_ms. A leader that never runs costs latency.
//
// ONE MACHINE, ONE STARTER, ONE SET OF SECRETS. The sandbox renderer is the SAME image and the
// SAME Fly app as the report renderer (the sandbox lane's ceremony discipline is explicit that its
// renderer changes are additive to that ceremony), so this belt reuses reconciler-render.mjs's
// readDispatchConfig and startRenderMachine rather than minting a parallel configuration surface
// that could drift out of step with the deploy.
//
// FEATURE-DETECT PER CYCLE, EXACT SIGNATURE (the reconciler-fa.mjs / wiki-projection R5 idiom).
// The runtime image ships before the card-1 migration, so this belt boots dormant and lights on the
// very next cycle after the migration applies, with no restart. to_regprocedure is a plain catalog
// read, so the guard never fails for a privilege reason.

import { readDispatchConfig, startRenderMachine } from "./reconciler-render.mjs";

const DISPATCH_COOLDOWN = process.env.CLARA_SANDBOX_DISPATCH_COOLDOWN
  || process.env.CLARA_RENDER_DISPATCH_COOLDOWN || "10 minutes";
const DISPATCH_MAX = Number(process.env.CLARA_SANDBOX_DISPATCH_MAX
  || process.env.CLARA_RENDER_DISPATCH_MAX || 5);

/** True iff BOTH sandbox dispatch verbs exist with their exact signatures. */
async function hasSandboxDispatchSurface(client) {
  const r = await client.query(
    `select to_regprocedure('clara.sandbox_dispatch_begin(interval,int)') is not null
        and to_regprocedure('clara.sandbox_dispatch_record(uuid[],boolean,jsonb)') is not null as surface`,
  );
  return r.rows[0]?.surface === true;
}

/**
 * Queue hygiene: park the crash-only exports that burned every attempt without reporting, and SAY
 * SO. A reaped export is the one event in this belt that means a firm's working-analysis PDF will
 * not exist without a human, so the line names the views. Its own try/catch: hygiene failing must
 * never stop a dispatch that could still start work, and a swallowed error would be its own
 * silence.
 */
async function reapExhausted(client, log) {
  try {
    const r = (await client.query("select clara.reap_exhausted_sandbox_exports() as r")).rows[0]?.r ?? {};
    const reaped = Number(r?.reaped ?? 0);
    if (reaped > 0) {
      log(`[reconcile] sandbox reap: ${reaped} export(s) parked failed at their attempt cap without a worker report`
        + ` — request a new export for each affected view once the cause is fixed;`
        + ` sandbox_view_ids=${JSON.stringify(r?.reaped_sandbox_view_ids ?? [])}`);
    }
    return reaped;
  } catch (err) {
    log(`[reconcile] sandbox reap error: ${err?.message ?? err}`);
    return 0;
  }
}

export async function reconcileSandboxDispatch(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const start = opts.startRenderMachine ?? startRenderMachine; // injectable for the unit battery
  const env = opts.env ?? process.env;

  // The feature-detect is ISOLATED: a catalog read failing is a connection problem, not a dormant
  // surface, and the two must not report the same thing. A thrown probe propagating into the
  // leader's cycle is the zombie-reconciler shape reconciler.mjs documents at length.
  let surface;
  try {
    surface = await hasSandboxDispatchSurface(client);
  } catch (err) {
    log(`[reconcile] sandbox dispatch surface probe error: ${err?.message ?? err}`);
    return { sandboxOk: false, sandboxDue: 0, sandboxDispatched: 0 };
  }
  if (!surface) {
    return { sandboxOk: true, sandboxDue: 0, sandboxDispatched: 0, sandboxDormant: true };
  }

  // REAP-WITHOUT-DISPATCH IS LAWFUL, and it runs FIRST and UNCONDITIONALLY. Reaping is not part of
  // dispatching; it is keeping the queue honest, and gating it on being able to start machines is
  // exactly how the render lane once left crash-only jobs with no terminal state at all on a
  // deployment that deliberately relies on the scheduled machine.
  const reap = await reapExhausted(client, log);

  const cfg = readDispatchConfig(env);
  if (!cfg.configured) {
    // LOUD, EVERY CYCLE, DELIBERATELY: the leader does not log its sweep result, so a de-duplicated
    // line would turn a permanently unwired dispatch into silence after its first occurrence.
    // Nothing is stamped and nothing is lost.
    log(`[reconcile] sandbox dispatch UNWIRED — missing ${cfg.missing.join(", ")}; sandbox exports fall back to the scheduled wake (delayed, not stranded)`);
    return { sandboxOk: false, sandboxDue: 0, sandboxDispatched: 0, sandboxUnconfigured: true,
      sandboxReaped: reap };
  }

  let due;
  try {
    due = (await client.query("select clara.sandbox_dispatch_begin($1::interval, $2::int) as r",
      [DISPATCH_COOLDOWN, DISPATCH_MAX])).rows[0]?.r ?? {};
  } catch (err) {
    log(`[reconcile] sandbox dispatch due-read error: ${err?.message ?? err}`);
    return { sandboxOk: false, sandboxDue: 0, sandboxDispatched: 0 };
  }

  const exportIds = Array.isArray(due?.export_ids) ? due.export_ids : [];
  if (exportIds.length === 0) {
    return { sandboxOk: true, sandboxDue: 0, sandboxDispatched: 0, sandboxReaped: reap };
  }
  // The observed wait is reported on EVERY dispatch, not only a slow one: a number you print only
  // when it looks bad is a number nobody has a baseline for.
  log(`[reconcile] sandbox dispatch due=${exportIds.length} oldest_wait_seconds=${due?.oldest_wait_seconds ?? "?"}`);

  let outcome;
  try {
    const started = await start(cfg, log);
    outcome = { ok: true, detail: started };
  } catch (err) {
    // RECORDED ON THE ROWS, not merely logged: "no export appeared" and "we could not start the
    // renderer" are different facts and the second is the actionable one.
    outcome = { ok: false, detail: { error: String(err?.message ?? err) } };
    log(`[reconcile] sandbox dispatch start failed: ${outcome.detail.error}`);
  }
  let skipped = 0;
  try {
    const rec = (await client.query("select clara.sandbox_dispatch_record($1::uuid[], $2::boolean, $3::jsonb) as r",
      [exportIds, outcome.ok, JSON.stringify(outcome.detail)])).rows[0]?.r ?? {};
    // A SKIPPED RECEIPT IS REPORTED TOO: the verb skips rows that went terminal during the start
    // call — correct, because a terminal row is immutable — but silently skipping them would leave
    // the outcome unrecorded with nothing saying so.
    skipped = Number(rec?.skipped ?? 0);
    if (skipped > 0) {
      log(`[reconcile] sandbox dispatch receipt: ${rec?.recorded ?? 0} recorded, ${skipped} skipped`
        + ` (those exports went terminal during the start call — their outcome is on the row that finished them)`);
    }
  } catch (err) {
    log(`[reconcile] sandbox dispatch receipt error: ${err?.message ?? err}`);
  }
  return {
    sandboxOk: outcome.ok,
    sandboxDue: exportIds.length,
    sandboxDispatched: outcome.ok ? exportIds.length : 0,
    sandboxReaped: reap,
    sandboxReceiptSkipped: skipped,
    sandboxOldestWaitSeconds: Number(due?.oldest_wait_seconds ?? 0),
  };
}
