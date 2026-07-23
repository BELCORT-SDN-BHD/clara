// The wiki lint belt daily sweep (Wave B §B2 — migration 0017, design part3 Block L /
// L3, WB-R8 "lint daily on the per-client belt (never firm-wide locks)", AMB-10).
// Split out of reconciler.mjs for the module-size budget (the reconciler-documents.mjs /
// reconciler-sst.mjs precedent) — this module is the reconciler-sst.mjs clone contract the
// design pin names verbatim, adapted from evaluate_sst_watch/evaluate_sst_watches_all to
// run_client_lint/run_lint_all.
//
// Re-evaluates EVERY active client's lint findings (wiki hygiene: contradictions, stale
// claims, orphan pages, page/byte caps, the WB-R5 opening-TB tie watch) from the books/wiki
// tables and writes ONE append-only lint_runs receipt. The first-cycle-at-boot sweep is what
// catches PRE-EXISTING conditions right after the 0017 deploy ceremony (a converged pass emits
// no new events; only a genuine transition does) — the belt covers everyone from cold start.
//
// WHY THE ITERATION LIVES HERE AND NOT IN THE DB WRAPPER (the firm-wide-stall fix, mirrored
// verbatim from reconciler-sst.mjs). clara.run_lint_all loops every active client inside ONE
// function call, and node-pg wraps a lone statement in ONE implicit transaction. Every CHANGED
// client makes run_client_lint call clara._append_event, whose first act is an upsert on
// clara.firm_event_seq — a ROW LOCK on the firm's counter row held until that transaction
// COMMITS. So a single all-clients call would hold the firm's event-sequence lock for the
// whole sweep, and EVERY concurrent writer emitting any domain event (approve_entry, a draft, a
// chat turn, an ingest) would block behind it. The worst case is the first leader cycle after
// the 0017 deploy: no lint_findings rows exist yet, so nearly every wiki-bearing client can take
// a 'created' branch ⇒ maximal locking. The sweep also runs on the LEADER connection after the
// relay/drain cycles, so it would stall event routing too.
//
// So: the runtime selects the active client ids and calls clara.run_client_lint ONE CLIENT PER
// STATEMENT — each its own implicit transaction, so the firm_event_seq lock is taken and
// released per client instead of being held across the whole sweep. Reading clara.clients is
// permitted: 0008 grants SELECT to clara_runtime with policy p_clients_runtime_read
// (using (true)).
//
// run_client_lint NEVER RAISES (AMB-10 — the belt-never-raise law outranks the generic
// CLR10-on-null-op_key; a raising lint fn could wedge the belt, the SST-belt precedent). Every
// call — even an unknown/non-active client or a malformed op_key — returns a jsonb receipt
// ({'status': 'ok'|'skipped'|'failed', ...}), never a thrown exception from the fn body itself.
// A THROW from the per-client statement here therefore means an infrastructure fault
// (connection loss, statement timeout), not a books-side condition; it is counted and the pass
// continues — never abandoning the remaining clients.
//
// THE RECEIPT. clara.lint_runs is the L3 append-only receipt (clients_examined/_changed/_failed,
// through_event_seq, error_note) and clara.run_lint_all is its ONLY runtime-callable writer —
// there is no other receipt path. So after the per-client pass converges the state we call
// run_lint_all ONCE to write the receipt. The design pin (part3 L3) is explicit: "the runtime
// NEVER calls this as the sweep itself" — run_lint_all is the receipt writer called ONCE, LAST,
// after convergence, never the per-client mechanism. That final pass is cheap AND lock-light:
// run_client_lint is idempotent recomputation, the per-client pass already applied every
// transition, and a converged (no-change) evaluation takes NO firm_event_seq lock (0017's
// run_client_lint emits `lint.finding_transition` only on a real created/superseded/recheck
// transition). Residual, deliberately accepted (the sstsweep precedent): a books write landing
// BETWEEN the per-client pass and the receipt call can make that one client change again, so the
// receipt call may take the lock for a single client's transition — bounded to one client,
// versus the whole firm before.
//
// AUTHORITY: both run_client_lint and run_lint_all are runtime-GROUP-granted (the
// evaluate_sst_watch precedent, part3 L3) — a plain call on the clara_runtime connection, NO
// login-direct dance.
//
// Every layer is error-isolated (this never throws; the leader retries next cycle): a
// per-client failure is logged and counted, and lintOk goes false if ANY client discovery
// threw or the receipt call threw (a WHOLE-BELT failure) — never for a single poisoned client
// (see the CADENCE LAW note below, mirrored from reconciler-sst.mjs).

/** Active client ids, stably ordered (matches the DB wrapper's `order by c.id`; WB-R1 — the
 *  belt does not even examine onboarding/archived clients, the shared exclusion guard). */
async function activeClientIds(client) {
  const r = await client.query("select id from clara.clients where status = 'active' order by id");
  return r.rows.map((row) => String(row.id));
}

/** @param {import("pg").ClientBase} client  a clara_runtime connection */
export async function reconcileLintBelt(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const opKey = `lintsweep:${new Date().toISOString()}`;
  const out = { lintOk: true, lintExamined: 0, lintChanged: 0, lintFailed: 0, lintRunId: null };

  let ids;
  try {
    ids = await activeClientIds(client);
  } catch (err) {
    log(`[reconcile] lint belt client discovery error: ${err?.message ?? err}`);
    return { lintOk: false, lintExamined: 0, lintChanged: 0, lintFailed: 0, lintRunId: null };
  }

  // One statement — and so one transaction, and one short-lived firm_event_seq lock — per
  // client. run_client_lint NEVER raises (AMB-10; it returns {status:'failed', error, sqlstate}
  // instead), so a throw here means an infrastructure fault; either way we count it and
  // CONTINUE, never abandoning the remaining clients.
  for (const clientId of ids) {
    out.lintExamined += 1;
    try {
      const r = (await client.query("select clara.run_client_lint($1, $2) as r", [clientId, `${opKey}:${clientId}`])).rows[0]?.r ?? {};
      if (r?.status === "failed") {
        out.lintFailed += 1;
        log(`[reconcile] lint client=${clientId} failed: ${r?.error ?? "?"}`);
      } else if (r?.changed === true) {
        out.lintChanged += 1;
      }
    } catch (err) {
      out.lintFailed += 1;
      log(`[reconcile] lint client=${clientId} error: ${err?.message ?? err}`);
    }
  }

  // The receipt, LAST — after the per-client pass has converged the state (see the header).
  // run_lint_all internally re-loops every active client itself (its own single statement /
  // single implicit transaction from THIS caller's perspective, exactly like
  // evaluate_sst_watches_all) and is the ONLY writer of clara.lint_runs.
  try {
    const r = (await client.query("select clara.run_lint_all($1) as r", [`${opKey}:receipt`])).rows[0]?.r ?? {};
    out.lintRunId = r?.run_id ?? null;
    // The receipt's own counts are authoritative — it re-evaluates every client, so its
    // clients_failed already includes any persistent per-client failure (using it REPLACES,
    // never adds to, the per-client tally: adding would double-count). The per-client pass
    // owns `changed` (the converged receipt pass sees nothing left to change by design).
    out.lintExamined = Number(r?.clients_examined ?? out.lintExamined);
    out.lintFailed = Number(r?.clients_failed ?? out.lintFailed);
  } catch (err) {
    out.lintOk = false;
    log(`[reconcile] run_lint_all error: ${err?.message ?? err}`);
  }
  // CADENCE LAW (mirrored from reconciler-sst.mjs): lintOk gates the leader's daily timer
  // (lastLintRun advances only on lintOk), so it goes false ONLY for a WHOLE-BELT failure
  // (client discovery threw, or the receipt call threw — the belt genuinely did not run / did
  // not record). A PER-CLIENT failure must NOT gate it: every other client was evaluated and
  // the receipt was written, and pinning lintOk false on one permanently-poisoned client would
  // re-run the belt on EVERY leader cycle (~2s / every nudge) instead of daily — unbounded
  // lint_runs growth + sustained load. The poisoned client stays VISIBLE: logged per run here,
  // and carried in the daily receipt's clients_failed / error_note.

  log(`[reconcile] lint belt examined=${out.lintExamined} changed=${out.lintChanged} failed=${out.lintFailed}`);
  return out;
}
