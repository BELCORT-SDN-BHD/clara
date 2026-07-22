// The SST compliance-watch daily sweep (Wave A2.1 §2.2 — the repair belt / migration 0016).
// Split out of reconciler.mjs for the module-size budget (the reconciler-documents.mjs
// precedent) and re-exported from there, so existing import sites keep resolving.
//
// Re-evaluates EVERY active client's SST-registration watch from the books and writes ONE
// append-only compliance_eval_runs receipt. The first-cycle-at-boot sweep is what catches
// PRE-EXISTING crossings right after the 0016 deploy ceremony (the event-driven spine only
// re-evaluates a client on a NEW approval — the belt covers everyone).
//
// WHY THE ITERATION LIVES HERE AND NOT IN THE DB WRAPPER (the firm-wide-stall fix).
// clara.evaluate_sst_watches_all loops every active client inside ONE function call, and
// node-pg wraps a lone statement in ONE implicit transaction. Every CHANGED client makes the
// evaluator call clara._append_event, whose first act is an upsert on clara.firm_event_seq —
// a ROW LOCK on the firm's counter row held until that transaction COMMITS. So a single
// all-clients call holds the firm's event-sequence lock for the whole sweep, and EVERY
// concurrent writer emitting any domain event (approve_entry, a draft, a chat turn, an
// ingest) blocks behind it. The worst case is the first leader cycle after the 0016 deploy:
// no watch rows exist yet, so nearly every client takes the 'created' branch ⇒ maximal
// locking. The sweep also runs on the LEADER connection after the relay/drain cycles, so it
// would stall event routing too.
//
// So: the runtime selects the active client ids and calls clara.evaluate_sst_watch ONE CLIENT
// PER STATEMENT — each its own implicit transaction, so the firm_event_seq lock is taken and
// released per client instead of being held across the whole sweep. Reading clara.clients is
// permitted: 0008 grants SELECT to clara_runtime with policy p_clients_runtime_read
// (using (true)).
//
// THE RECEIPT. clara.compliance_eval_runs backs list_review_queue's `stale_evaluator` flag
// (>48h ⇒ stale), and evaluate_sst_watches_all is its ONLY writer — there is no
// runtime-callable receipt writer. So after the per-client pass converges the state we call
// evaluate_sst_watches_all ONCE to write the receipt. That final pass is cheap AND
// lock-light: the evaluator is idempotent recomputation, the per-client pass already applied
// every transition, and a no-change evaluation appends only a compliance_watch_events row —
// clara._append_event fires ONLY on created / re_armed / tier_change (0016), so the converged
// pass takes NO firm_event_seq lock. Residual, deliberately accepted: a books write landing
// BETWEEN the per-client pass and the receipt call can make that one client change again, so
// the receipt call may take the lock for a single client's transition — bounded to one
// client, versus the whole firm before.
//
// AUTHORITY: both evaluators are runtime-GROUP-granted (the reconcile_autopost_rules
// precedent) — a plain call on the clara_runtime connection, NO login-direct dance.
//
// Every layer is error-isolated (this never throws; the leader retries next cycle): a
// per-client failure is logged and counted, and sstOk goes false if ANY client failed or the
// receipt call threw.

/** Active client ids, stably ordered (matches the DB wrapper's `order by c.id`). */
async function activeClientIds(client) {
  const r = await client.query("select id from clara.clients where status = 'active' order by id");
  return r.rows.map((row) => String(row.id));
}

/** @param {import("pg").ClientBase} client  a clara_runtime connection */
export async function reconcileSstWatches(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const opKey = `sstsweep:${new Date().toISOString()}`;
  const out = { sstOk: true, sstExamined: 0, sstChanged: 0, sstFailed: 0, sstRunId: null };

  let ids;
  try {
    ids = await activeClientIds(client);
  } catch (err) {
    log(`[reconcile] sst watches client discovery error: ${err?.message ?? err}`);
    return { sstOk: false, sstExamined: 0, sstChanged: 0, sstFailed: 0, sstRunId: null };
  }

  // One statement — and so one transaction, and one short-lived firm_event_seq lock — per
  // client. The evaluator is exception-isolated in the DB (it returns {status:'failed'}
  // rather than raising), so a throw here means an infrastructure fault; either way we count
  // it and CONTINUE, never abandoning the remaining clients.
  for (const clientId of ids) {
    out.sstExamined += 1;
    try {
      const r = (await client.query("select clara.evaluate_sst_watch($1, $2) as r", [clientId, `${opKey}:${clientId}`])).rows[0]?.r ?? {};
      if (r?.status === "failed") {
        out.sstFailed += 1;
        log(`[reconcile] sst watch client=${clientId} failed: ${r?.error ?? "?"}`);
      } else if (r?.changed === true) {
        out.sstChanged += 1;
      }
    } catch (err) {
      out.sstFailed += 1;
      log(`[reconcile] sst watch client=${clientId} error: ${err?.message ?? err}`);
    }
  }

  // The receipt, LAST — after the per-client pass has converged the state (see the header).
  try {
    const r = (await client.query("select clara.evaluate_sst_watches_all($1) as r", [`${opKey}:receipt`])).rows[0]?.r ?? {};
    out.sstRunId = r?.run_id ?? null;
    // The receipt's own counts are authoritative — it re-evaluates every client, so its
    // clients_failed already includes any persistent per-client failure (using it REPLACES,
    // never adds to, the per-client tally: adding would double-count). The per-client pass
    // owns `changed` (the converged receipt pass sees nothing left to change by design).
    out.sstExamined = Number(r?.clients_examined ?? out.sstExamined);
    out.sstFailed = Number(r?.clients_failed ?? out.sstFailed);
  } catch (err) {
    out.sstOk = false;
    log(`[reconcile] evaluate_sst_watches_all error: ${err?.message ?? err}`);
  }
  // CADENCE LAW: sstOk gates the leader's daily timer (lastSstRun advances only on sstOk),
  // so it goes false ONLY for a WHOLE-BELT failure (client discovery threw, or the receipt
  // call threw — the belt genuinely did not run / did not record). A PER-CLIENT failure must
  // NOT gate it: every other client was evaluated and the receipt was written, and pinning
  // sstOk false on one permanently-poisoned client would re-run the belt on EVERY leader
  // cycle (~2s / every nudge) instead of daily — unbounded compliance_eval_runs growth +
  // sustained evaluator load. The poisoned client stays VISIBLE: logged per run here, and
  // carried in the daily receipt's clients_failed / error_note (a21 battery).

  log(`[reconcile] sst watches examined=${out.sstExamined} changed=${out.sstChanged} failed=${out.sstFailed}`);
  return out;
}
