// The RENDER DISPATCH sweep (Wave E lane ζ; design part2 §10). Split out of reconciler.mjs like
// reconciler-sst / reconciler-lint / reconciler-fa (module-size budget), and wired into
// runReconcilerSweep behind the leader's flags.
//
// ===========================================================================================
// THIS IS THE ONE PLACE LANE ζ TOUCHES RUNTIME JUDGEMENT LOGIC, AND IT CARRIES A LAW-1
// INDEPENDENT REVIEW (design §10, §12's lane table, acceptance cell A33).
// ===========================================================================================
//
// WHAT IT DECIDES, AND WHAT IT DELIBERATELY DOES NOT. It decides ONE thing: whether to start a
// render machine right now. It does not decide what to render, whether a render is allowed,
// which job is next, or whether a produced document may be sealed — those are DB decisions
// (clara.render_dispatch_begin picks the due jobs; the worker's own gates and epsilon's seal gate
// decide the rest). The dispatch is a doorbell, not a door.
//
// DUE ARITHMETIC IS DB-OWNED (the reconciler-fa.mjs law, verbatim). The leader asks
// clara.render_dispatch_begin and is TOLD which jobs are due; it never re-derives due-ness from
// timestamps client-side. The stamp happens inside that call, BEFORE the Fly API is touched, so a
// persistently failing dispatch backs off on the cooldown instead of storming every ~2s cycle.
//
// THE THREE ARMS OF A33, AND WHERE EACH IS ANSWERED.
//   (i)   dispatch within cadence      -> here, plus clara.render_dispatch_begin's cooldown.
//   (ii)  leader outage -> DELAYED, never STRANDED. Nothing in this module can lose a job: the
//         queue row stays `claimable` whatever happens here, the Fly SCHEDULED machine wakes on
//         its own coarse cadence and claims it, and the wait the job actually suffered is
//         recorded on the row by clara.claim_render_job. A leader that never runs costs latency.
//   (iii) duplicate dispatch -> ONE artifact. Not this module's doing and deliberately so: two
//         machines racing both call clara.claim_render_job, which hands the job to exactly one
//         (for update skip locked); even if both somehow rendered, the storage key is the content
//         address, the PUT is x-upsert:false, and clara.complete_render_job reconciles by
//         READING the sealed artifact's hash. Dispatch is allowed to be sloppy because nothing
//         downstream trusts it to be careful.
//
// FEATURE-DETECT PER CYCLE, EXACT SIGNATURE (the reconciler-fa.mjs / wiki-projection R5 idiom).
// The runtime image ships before the ζ migration, so the belt boots dormant and lights on the
// very next cycle after the migration applies, with no restart. to_regprocedure is a plain
// catalog read, so the guard never fails for a privilege reason.
//
// SECRETS COME FROM THE ENVIRONMENT, NEVER ARGV AND NEVER CODE. The Fly API token is read from
// process.env at call time and is never logged, never interpolated into a message, and never
// passed on a command line.

const DISPATCH_COOLDOWN = process.env.CLARA_RENDER_DISPATCH_COOLDOWN || "10 minutes";
const DISPATCH_MAX = Number(process.env.CLARA_RENDER_DISPATCH_MAX || 5);
const FLY_API = process.env.CLARA_RENDER_FLY_API || "https://api.machines.dev/v1";
const FLY_TIMEOUT_MS = Number(process.env.CLARA_RENDER_FLY_TIMEOUT_MS || 15000);

/** True iff BOTH dispatch verbs exist with their exact signatures. */
async function hasDispatchSurface(client) {
  const r = await client.query(
    `select to_regprocedure('clara.render_dispatch_begin(interval,int)') is not null
        and to_regprocedure('clara.render_dispatch_record(uuid[],boolean,jsonb)') is not null as surface`,
  );
  return r.rows[0]?.surface === true;
}

/**
 * The dispatch configuration, read POSITIVELY. Returns null when the deploy has not been wired,
 * which is a LOUD no-op rather than a failed dispatch: an unwired leader must not burn a cooldown
 * per cycle stamping attempts it was never able to make. The Fly scheduled machine still picks
 * the work up on its own cadence, so unwired means slower, never stranded.
 */
export function readDispatchConfig(env = process.env) {
  const token = env.CLARA_RENDER_FLY_API_TOKEN;
  const app = env.CLARA_RENDER_FLY_APP;
  const machineId = env.CLARA_RENDER_FLY_MACHINE_ID || null;
  const image = env.CLARA_RENDER_IMAGE_REF || null;
  const region = env.CLARA_RENDER_FLY_REGION || "sin";
  const imageDigest = env.CLARA_RENDER_IMAGE_DIGEST || null;
  const sourceCommit = env.CLARA_RENDER_SOURCE_COMMIT || null;
  const missing = [];
  if (!token) missing.push("CLARA_RENDER_FLY_API_TOKEN");
  if (!app) missing.push("CLARA_RENDER_FLY_APP");
  // One of the two start modes must be configured: start a pre-created machine, or create one
  // from a PINNED image reference. Neither present is unwired.
  if (!machineId && !image) missing.push("CLARA_RENDER_FLY_MACHINE_ID or CLARA_RENDER_IMAGE_REF");
  // THE CREATE PATH ALSO NEEDS THE WORKER'S TWO PINS (codex M9), and their absence is reported as
  // UNWIRED rather than discovered at the API call: an unwired leader logs loudly and stamps
  // nothing, whereas a failed create burns a cooldown per cycle to learn the same fact. The START
  // path does not need them — a pre-created machine already carries its own env.
  if (!machineId && image && (!imageDigest || !sourceCommit)) {
    missing.push("CLARA_RENDER_IMAGE_DIGEST + CLARA_RENDER_SOURCE_COMMIT (required by the create path)");
  }
  if (missing.length > 0) return { configured: false, missing };
  return { configured: true, token, app, machineId, image, region, imageDigest, sourceCommit };
}

/**
 * Queue hygiene: park the crash-only jobs that burned every attempt without reporting, and SAY SO.
 *
 * A reaped job is the one event in this belt that means a firm's statutory PDF will not exist
 * without a human, so the line names the runs and the door that repairs them. Its own try/catch:
 * hygiene failing must never stop a dispatch that could still start work, and a swallowed error
 * would be its own silence, so the failure is logged and the belt continues.
 */
async function reapExhausted(client, log) {
  try {
    const r = (await client.query("select clara.reap_exhausted_render_jobs() as r")).rows[0]?.r ?? {};
    const reaped = Number(r?.reaped ?? 0);
    if (reaped > 0) {
      log(`[reconcile] render reap: ${reaped} job(s) parked failed at their attempt cap without a worker report`
        + ` — these need clara.requeue_render_job(<job id>, <why>) once the cause is fixed;`
        + ` run_ids=${JSON.stringify(r?.reaped_run_ids ?? [])}`);
    }
    return reaped;
  } catch (err) {
    log(`[reconcile] render reap error: ${err?.message ?? err}`);
    return 0;
  }
}

/**
 * Start a render machine. Two modes, both idempotent-ish in the direction that matters: starting
 * an already-running machine, or creating a second one, costs money and time but can never
 * produce a second artifact (see arm (iii) above).
 */
async function startRenderMachine(cfg, log) {
  const headers = { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" };
  const signal = AbortSignal.timeout(FLY_TIMEOUT_MS);
  if (cfg.machineId) {
    const res = await fetch(`${FLY_API}/apps/${encodeURIComponent(cfg.app)}/machines/${encodeURIComponent(cfg.machineId)}/start`,
      { method: "POST", headers, signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // The BODY is carried, not just the status (the storage.mjs lesson): a 4xx from Fly can be
      // "already started", "not found" or "payment required", and those need different humans.
      throw new Error(`fly machine start failed (${res.status}) ${body.slice(0, 200)}`);
    }
    log(`[reconcile] render dispatch started machine ${cfg.machineId}`);
    return { mode: "start", machine_id: cfg.machineId };
  }
  // THE TWO MANDATORY WORKER PINS RIDE ON THE MACHINE (codex M9). The worker REFUSES to seal
  // without CLARA_RENDER_IMAGE_DIGEST and CLARA_RENDER_SOURCE_COMMIT — correctly, since a manifest
  // that cannot name the image it came from is not reproducible. But this create path supplied
  // neither, so a leader configured with CLARA_RENDER_IMAGE_REF would have created a machine that
  // booted, refused, and exited without claiming anything: every request silently falling through
  // to the scheduled wake, with the renderer looking alive the whole time. The refusal was right;
  // the dispatcher was not feeding it.
  //
  // They are read from the leader's own env and REQUIRED here rather than defaulted: a machine
  // started without them can do nothing useful, so failing the dispatch (which is recorded on the
  // job rows) is strictly better than starting one that will exit.
  const digest = cfg.imageDigest;
  const commit = cfg.sourceCommit;
  if (!digest || !commit) {
    throw new Error(
      "cannot create a render machine without CLARA_RENDER_IMAGE_DIGEST and CLARA_RENDER_SOURCE_COMMIT — "
      + "the worker refuses to seal without them, so the machine would boot and exit having done nothing",
    );
  }
  const res = await fetch(`${FLY_API}/apps/${encodeURIComponent(cfg.app)}/machines`, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      region: cfg.region,
      config: {
        image: cfg.image,
        auto_destroy: true,
        restart: { policy: "no" },
        guest: { cpu_kind: "shared", cpus: 1, memory_mb: 1024 },
        env: {
          CLARA_RENDER_IMAGE_DIGEST: digest,
          CLARA_RENDER_SOURCE_COMMIT: commit,
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`fly machine create failed (${res.status}) ${body.slice(0, 200)}`);
  }
  const created = await res.json().catch(() => ({}));
  log(`[reconcile] render dispatch created machine ${created?.id ?? "(id absent)"}`);
  return { mode: "create", machine_id: created?.id ?? null };
}

/**
 * One dispatch pass.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 */
export async function reconcileRenderDispatch(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const start = opts.startRenderMachine ?? startRenderMachine; // injectable for the unit battery
  const env = opts.env ?? process.env;

  // The feature-detect is ISOLATED like everything else in this belt. A catalog read failing is
  // a connection problem, not a dormant surface, and the two must not report the same thing: a
  // thrown probe used to propagate out of here into the leader's cycle, which is the shape of the
  // section-I zombie reconciler.mjs documents at length.
  let surface;
  try {
    surface = await hasDispatchSurface(client);
  } catch (err) {
    log(`[reconcile] render dispatch surface probe error: ${err?.message ?? err}`);
    return { renderOk: false, renderDue: 0, renderDispatched: 0 };
  }
  if (!surface) {
    return { renderOk: true, renderDue: 0, renderDispatched: 0, renderDormant: true };
  }

  // REAP-WITHOUT-DISPATCH IS LAWFUL, and the surface probe above deliberately does not ask about
  // the reap verb. The probe answers "can this leader dispatch", which gates the dispatch half; the
  // reap is queue hygiene that a deployment with no Fly wiring still needs. If the verb is missing
  // (a database behind this build), the call below fails, is logged, and returns 0 — the same
  // fail-soft shape the due-read has, and the dormant check above already covers the pre-migration
  // case for the whole belt.
  //
  // QUEUE HYGIENE RUNS FIRST, AND UNCONDITIONALLY (round-4 major). The reap used to live inside
  // the due-read below, which sits after the unwired early return — so on a deployment that
  // deliberately relies on the scheduled machine (a SUPPORTED configuration, named in the very log
  // line under it) a crash-only job at its attempt cap was never terminated at all: no terminal
  // state, no reason, nothing an operator could read, forever. Reaping is not part of dispatching;
  // it is keeping the queue honest, and it must not be gated on being able to start machines.
  const reap = await reapExhausted(client, log);

  const cfg = readDispatchConfig(env);
  if (!cfg.configured) {
    // LOUD, EVERY CYCLE, DELIBERATELY. The leader does not log its sweep result, so a
    // de-duplicated line would turn a permanently unwired dispatch into silence after its first
    // occurrence — the same argument reconciler.mjs makes for its cancel-edge logging. Nothing is
    // stamped and nothing is lost; the scheduled machine remains the fallback.
    log(`[reconcile] render dispatch UNWIRED — missing ${cfg.missing.join(", ")}; renders fall back to the scheduled wake (delayed, not stranded)`);
    return { renderOk: false, renderDue: 0, renderDispatched: 0, renderUnconfigured: true,
      renderReaped: reap };
  }

  let due;
  try {
    due = (await client.query("select clara.render_dispatch_begin($1::interval, $2::int) as r",
      [DISPATCH_COOLDOWN, DISPATCH_MAX])).rows[0]?.r ?? {};
  } catch (err) {
    log(`[reconcile] render dispatch due-read error: ${err?.message ?? err}`);
    return { renderOk: false, renderDue: 0, renderDispatched: 0 };
  }

  const jobIds = Array.isArray(due?.job_ids) ? due.job_ids : [];
  if (jobIds.length === 0) {
    return { renderOk: true, renderDue: 0, renderDispatched: 0, renderReaped: reap };
  }
  // The observed wait is reported on every dispatch, not only on a slow one: A33 arm (ii) asks
  // for the delay to be recorded, and a number you only print when it looks bad is a number
  // nobody has a baseline for.
  log(`[reconcile] render dispatch due=${jobIds.length} oldest_wait_seconds=${due?.oldest_wait_seconds ?? "?"}`);

  let outcome;
  try {
    const started = await start(cfg, log);
    outcome = { ok: true, detail: started };
  } catch (err) {
    // The failure is RECORDED on the rows, not merely logged: "no render appeared" and "we could
    // not start the renderer" are different facts and the second is the actionable one.
    outcome = { ok: false, detail: { error: String(err?.message ?? err) } };
    log(`[reconcile] render dispatch start failed: ${outcome.detail.error}`);
  }
  let skipped = 0;
  try {
    const rec = (await client.query("select clara.render_dispatch_record($1::uuid[], $2::boolean, $3::jsonb) as r",
      [jobIds, outcome.ok, JSON.stringify(outcome.detail)])).rows[0]?.r ?? {};
    // A SKIPPED RECEIPT IS REPORTED TOO. The verb skips rows that went terminal during the Fly
    // round trip — correct, because a terminal row is immutable — but silently skipping them would
    // leave "we could not start the renderer" unrecorded for those jobs with nothing saying so.
    skipped = Number(rec?.skipped ?? 0);
    if (skipped > 0) {
      log(`[reconcile] render dispatch receipt: ${rec?.recorded ?? 0} recorded, ${skipped} skipped`
        + ` (those jobs went terminal during the start call — their outcome is on the row that finished them)`);
    }
  } catch (err) {
    log(`[reconcile] render dispatch receipt error: ${err?.message ?? err}`);
  }
  return {
    renderOk: outcome.ok,
    renderDue: jobIds.length,
    renderDispatched: outcome.ok ? jobIds.length : 0,
    renderReaped: reap,
    renderReceiptSkipped: skipped,
    renderOldestWaitSeconds: Number(due?.oldest_wait_seconds ?? 0),
  };
}

/**
 * The daily belt half: enqueue a render for any sealed run that has neither an artifact nor a
 * job. This is the fallback for lane ε's seal not yet carrying its one-line enqueue — a missing
 * call DELAYS a render rather than losing it. Feature-detected on its own signature, same idiom.
 */
export async function reconcileRenderEnqueue(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const limit = Number(opts.limit ?? process.env.CLARA_RENDER_ENQUEUE_LIMIT ?? 25);
  const has = await client.query(
    "select to_regprocedure('clara.enqueue_missing_render_jobs(int)') is not null as surface");
  if (has.rows[0]?.surface !== true) return { renderEnqueueOk: true, renderEnqueued: 0, renderEnqueueDormant: true };
  try {
    const r = (await client.query("select clara.enqueue_missing_render_jobs($1::int) as r", [limit])).rows[0]?.r ?? {};
    const failed = Number(r?.failed ?? 0);
    if (failed > 0) {
      // Named, not counted-and-forgotten: the DB returns the per-run errors and they are the
      // only thing that says WHICH run cannot be enqueued.
      log(`[reconcile] render enqueue: ${failed} run(s) failed — ${JSON.stringify(r?.errors ?? [])}`);
    }
    log(`[reconcile] render enqueue examined=${r?.examined ?? 0} enqueued=${r?.enqueued ?? 0} failed=${failed}`);
    return { renderEnqueueOk: true, renderEnqueued: Number(r?.enqueued ?? 0), renderEnqueueFailed: failed };
  } catch (err) {
    log(`[reconcile] render enqueue error: ${err?.message ?? err}`);
    return { renderEnqueueOk: false, renderEnqueued: 0 };
  }
}
