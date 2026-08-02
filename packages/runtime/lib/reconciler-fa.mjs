// The FA depreciation-run daily sweep (Wave D-a §3.4 — migration 0041). Split out of
// reconciler.mjs like reconciler-sst.mjs / reconciler-lint.mjs (module-size budget), and
// the ONLY due-check in the leader family that must FEATURE-DETECT its own DB surface: the
// D-a ceremony order is runtime-image-first, DB-second (design §3.4; the same "R5" reasoning
// wiki-projection.mjs:321-346 documents for its own to_regprocedure guards) — this image
// deploys BEFORE 0041 lands, so the sweep must boot dormant on 0040 and light on the very
// next cycle after 0041 applies, with no restart.
//
// FEATURE-DETECT, EXACT SIGNATURE, PER CYCLE (never cached at startup — the wiki-projection
// idiom verbatim): to_regprocedure('clara.run_depreciation_period(uuid,date,date,text)') is a
// plain catalog read (no EXECUTE needed), so the guard never fails for a privilege reason, and
// distinguishes THIS signature from any future overload of the name. Absent → a clean no-op
// ({faOk:true, dormant:true}), never a failure — the belt simply has nothing to do yet.
//
// DUE ARITHMETIC IS DB-OWNED. Unlike the SST/lint belts (which evaluate every active client
// unconditionally), the FA belt asks clara.depreciation_run_due($1) — the oldest-unmet-period
// probe (0041) — whether THIS client has anything to run at all: no live authority, an
// outstanding earlier draft, or a fully-caught-up register all read as {due:false}, and the
// runtime never re-derives that arithmetic client-side (the DB owns every number). Only a
// {due:true} answer names a (period_start, period_end) to hand to run_depreciation_period.
//
// PER-CLIENT ERROR ISOLATION (the reconciler-sst.mjs precedent verbatim): a poisoned client's
// due-probe or run-call throw is counted (faFailed) and the sweep moves on to the next client
// — it never flips faOk, which gates only the leader's DAILY cadence. faOk goes false ONLY for
// a WHOLE-BELT failure (client discovery itself threw), because pinning it false on one
// permanently-poisoned client would re-run the belt on every leader cycle (~2s) instead of
// daily, exactly the cadence-law reasoning reconciler-sst.mjs documents.
//
// BOUNDED CHAINING PER CLIENT. run_depreciation_period clears ONE period per call; the design
// says "iterate as periods clear" so several already-overdue months catch up in one sweep. Each
// client's inner loop re-asks depreciation_run_due after every successful call and keeps going
// while it answers due:true, capped at FA_PERIOD_CAP so a misconfigured/poisoned client can
// never spin the belt unboundedly.
//
// AUTHORITY: run_depreciation_period is granted to the clara_runtime GROUP (design §3.4:
// "the leader runs under set role clara_runtime; clara_runtime_login privileges are
// inherit-false") — a plain call on the already-role-set leader connection, the
// evaluate_sst_watch / run_client_lint precedent, NO reset-role / login-direct dance
// (contrast rule-post.mjs's execute_rule_post, which IS login-direct and does not apply here).
// run_depreciation_period derives its own actor (authority.signed_by) and firm (from the
// client row) internally — the runtime supplies only client_id, the period, and an op_key.

import { randomUUID } from "node:crypto";

const FA_PERIOD_CAP = 24; // bounded — never loop unboundedly on a poisoned/misconfigured client

/** True iff clara.run_depreciation_period(uuid,date,date,text) exists — the EXACT signature,
 *  never an overloaded-name to_regproc probe (the wiki-projection.mjs:321-346 R5 idiom).
 *  Evaluated PER CYCLE, never cached at startup, so the belt lights the moment 0041 lands. */
async function hasDepreciationSurface(client) {
  const r = await client.query("select to_regprocedure('clara.run_depreciation_period(uuid,date,date,text)') is not null as surface");
  return r.rows[0]?.surface === true;
}

/** Active client ids, stably ordered (the reconciler-sst.mjs / reconciler-lint.mjs precedent
 *  verbatim; 0008 grants SELECT to clara_runtime via p_clients_runtime_read). The due-ness
 *  filter (live authority? anything overdue?) is entirely clara.depreciation_run_due's job —
 *  this belt scans every active client, same as its siblings, and lets the DB say no. */
async function activeClientIds(client) {
  const r = await client.query("select id from clara.clients where status = 'active' order by id");
  return r.rows.map((row) => String(row.id));
}

/** @param {import("pg").ClientBase} client  a clara_runtime connection */
export async function reconcileFaRuns(client, opts = {}) {
  const log = opts.log ?? (() => {});

  if (!(await hasDepreciationSurface(client))) {
    // 0041 not yet applied — a clean no-op, never a failure (the image boots dormant on 0040
    // per the design's runtime-image-first ceremony order).
    return { faOk: true, faExamined: 0, faPosted: 0, faNoop: 0, faFailed: 0, dormant: true };
  }

  const out = { faOk: true, faExamined: 0, faPosted: 0, faNoop: 0, faFailed: 0, dormant: false };

  let ids;
  try {
    ids = await activeClientIds(client);
  } catch (err) {
    log(`[reconcile] fa runs client discovery error: ${err?.message ?? err}`);
    return { faOk: false, faExamined: 0, faPosted: 0, faNoop: 0, faFailed: 0, dormant: false };
  }

  // One client at a time; each client's whole due-probe/run chain is isolated in ONE
  // try/catch (a poisoned client counts as faFailed and the loop CONTINUES — the remaining
  // clients are never abandoned, and faOk — the daily cadence gate — stays true).
  for (const clientId of ids) {
    out.faExamined += 1;
    try {
      for (let i = 0; i < FA_PERIOD_CAP; i++) {
        const due = (await client.query("select clara.depreciation_run_due($1) as r", [clientId])).rows[0]?.r ?? {};
        if (due?.due !== true) break; // no live authority, an outstanding draft, or caught up
        const opKey = `fa:${clientId}:${due.period_start}:${randomUUID().slice(0, 8)}`;
        const r = (await client.query("select clara.run_depreciation_period($1,$2,$3,$4) as r", [clientId, due.period_start, due.period_end, opKey])).rows[0]?.r ?? {};
        // ANY non-throw is success for cadence purposes (0041 contract §5) — a refusal
        // throws (isolated by the outer try/catch), so reaching here means 'noop', 'posted',
        // or 'drafted'. Keep chasing while depreciation_run_due stays due:true, so several
        // already-overdue periods clear in one sweep.
        //
        // 'noop' IS COUNTED SEPARATELY AND BREAKS THE CHASE [round-3 fold]. A noop persists
        // NOTHING — no entry, no receipt, no ledger row — so the same period is still unmet
        // when the probe is re-asked: counting it as a post reported 24 "posts" for 24 acts
        // that changed nothing, and chasing on regardless burned the whole per-client cap
        // every cycle. With the DB-side due oracle (one arithmetic answering both questions)
        // a due:true period can no longer compute to nothing, so this is now belt-and-braces
        // — but a belt that also tells the truth in the log and the receipt.
        if (r?.status === "noop") {
          out.faNoop += 1;
          log(`[reconcile] fa run client=${clientId} period=${due.period_start}..${due.period_end} status=noop (nothing computed — not chasing further)`);
          break;
        }
        out.faPosted += 1;
        log(`[reconcile] fa run client=${clientId} period=${due.period_start}..${due.period_end} status=${r?.status ?? "?"}`);
      }
    } catch (err) {
      out.faFailed += 1;
      log(`[reconcile] fa run client=${clientId} error: ${err?.message ?? err}`);
    }
  }

  log(`[reconcile] fa runs examined=${out.faExamined} posted=${out.faPosted} noop=${out.faNoop} failed=${out.faFailed}`);
  return out;
}
