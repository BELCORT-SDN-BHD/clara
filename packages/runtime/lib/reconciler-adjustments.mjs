// The recurring/reversing-adjustment occurrence daily sweep (Wave D-b §2.3/§2.7 —
// migration 0045). Split out of reconciler.mjs like reconciler-sst.mjs / reconciler-lint.mjs
// / reconciler-fa.mjs (module-size budget), and — like the D-a FA belt — the sweep must
// FEATURE-DETECT its own DB surface: this runtime image ships before 0045 lands (the same
// runtime-image-first, DB-second ceremony order design §2.7 inherits from D-a §3.4), so it
// must boot dormant on pre-0045 and light on the very next cycle after 0045 applies, with
// no restart.
//
// FEATURE-DETECT, EXACT SIGNATURES, PER CYCLE (never cached at startup — the
// wiki-projection.mjs:321-346 R5 idiom, cloned verbatim from reconciler-fa.mjs). Both
// `clara.adjustment_run_due(uuid)` and `clara.run_adjustment_occurrence(uuid,uuid,date,date,
// text)` are plain catalog reads (no EXECUTE needed), so the guard never fails for a
// privilege reason and distinguishes THESE exact signatures from any future overload of
// either name. Both land in the SAME migration (0045), so there is no meaningful
// partially-migrated state to diagnose between them — ONE combined boolean probe (both
// non-null) is sufficient, unlike a design that might straddle two migrations. Absent →
// a clean no-op ({adjOk:true, adjDormant:true}), never a failure — the belt simply has
// nothing to do yet.
//
// DUE ARITHMETIC IS DB-OWNED. Like the FA belt (never the SST/lint belts' unconditional
// per-client evaluation), the adjustment belt asks clara.adjustment_run_due($1) — the
// oldest-unmet-(template,period) probe among non-blocked live templates (design §2.3) —
// whether THIS client has anything to run at all: no live templates, every live template
// blocked on an outstanding occurrence draft, or a fully-caught-up set of templates all read
// as {due:false}, and the runtime never re-derives that arithmetic client-side (the DB owns
// every number). Only a {due:true} answer names a (template_id, period_start, period_end)
// to hand to run_adjustment_occurrence.
//
// PER-CLIENT ERROR ISOLATION (the reconciler-sst.mjs / reconciler-fa.mjs precedent
// verbatim): a poisoned client's due-probe or run-call throw is counted (adjFailed) and the
// sweep moves on to the next client — it never flips adjOk, which gates only the leader's
// DAILY cadence. adjOk goes false ONLY for a WHOLE-BELT failure (client discovery itself
// threw), because pinning it false on one permanently-poisoned client would re-run the belt
// on every leader cycle (~2s) instead of daily, exactly the cadence-law reasoning
// reconciler-sst.mjs documents.
//
// BOUNDED CHAINING PER CLIENT, WITHOUT AN FA-STYLE NOOP BREAK. run_adjustment_occurrence
// clears ONE (template, period) per call; several independently-due templates on the same
// client can each fire in one sweep (design §2.3's admission law is evaluated per template).
// Unlike the FA belt, an occurrence NEVER computes a zero-charge noop — design §2.1 states
// "an occurrence ALWAYS carries a charge" — so `_adj_run_occurrence_core` returns only
// `status: 'posted'|'drafted'` (ABI §A), counted on adjPosted/adjDrafted respectively. A
// 'drafted' outcome is not an FA-style dead end that needs an explicit chase-break: the very
// draft that was just minted makes `_adj_occurrence_outstanding` true for that template, so
// `adjustment_run_due`'s own `blocked[]` predicate excludes that template from being
// reported due again — the DB's own admission law self-limits the chase, no client-side
// mirroring of that arithmetic needed. The loop keeps calling adjustment_run_due while it
// answers due:true (now naming a DIFFERENT template, or nothing left), capped at
// ADJ_PERIOD_CAP so a misconfigured/poisoned client can never spin the belt unboundedly.
//
// OP-KEY LAW (ABI §E, the reconciler row): `adj:<client>:<template>:<period_start>:<rand8>`
// — the random suffix is LOAD-BEARING (cloned from the FA belt's `fa:<client>:<period_start>:
// <rand8>`, widened by a template segment because — unlike FA's one-authority-per-client
// shape — a client can carry MANY live templates at once): an abandoned pending key must
// never brick the (template, period) pair for a later sweep.
//
// SHARED HEARTBEAT. Like every other sweeper, this belt writes NO heartbeat of its own —
// runReconcilerSweep beats 'reconciler' once per full sweep cycle (reconciler.mjs), and this
// module is one more pass folded into that same beat.
//
// AUTHORITY: run_adjustment_occurrence is EXECUTE-granted to clara_runtime GROUP ONLY (ABI
// §A: "EXECUTE clara_runtime ONLY") — a plain call on the already-role-set leader connection
// (setRuntimeRole in leader.mjs), the run_depreciation_period / evaluate_sst_watch /
// run_client_lint precedent, NO reset-role / login-direct dance. run_adjustment_occurrence
// derives its own actor and firm internally (mirroring run_depreciation_period) — the
// runtime supplies only client_id, template_id, the period, and an op_key.
//
// NO NEW LISTEN CONSUMER; NO WDK (contract §4 D boundary: "no new LISTEN consumer loop").
// This sweep is a plain polled belt exactly like reconciler-fa.mjs — it neither listens on a
// channel nor starts a workflow run.

import { randomUUID } from "node:crypto";
// Same identity test as reconciler.mjs's isLeaderHalt, inlined rather than imported: reconciler.mjs
// imports THIS module, so importing back would cycle. SAME import specifier (./relay.mjs) as
// reconciler.mjs's own import, so `instanceof` agrees with leader.mjs:218 — see reconciler.mjs:21-26.
import { TaxonomyHaltError } from "./relay.mjs";

const ADJ_PERIOD_CAP = 24; // bounded — never loop unboundedly on a poisoned/misconfigured client (the FA belt's cap, cloned)

/** True iff BOTH clara.adjustment_run_due(uuid) and clara.run_adjustment_occurrence(uuid,
 *  uuid,date,date,text) exist — the EXACT signatures, never an overloaded-name to_regproc
 *  probe (the wiki-projection.mjs:321-346 R5 idiom). Evaluated PER CYCLE, never cached at
 *  startup, so the belt lights the moment 0045 lands. */
async function hasAdjustmentSurface(client) {
  const r = await client.query(
    "select to_regprocedure('clara.adjustment_run_due(uuid)') is not null " +
      "and to_regprocedure('clara.run_adjustment_occurrence(uuid,uuid,date,date,text)') is not null as surface",
  );
  return r.rows[0]?.surface === true;
}

/** Active client ids, stably ordered (the reconciler-sst.mjs / reconciler-lint.mjs /
 *  reconciler-fa.mjs precedent verbatim; 0008 grants SELECT to clara_runtime via
 *  p_clients_runtime_read). The due-ness filter (any live template? anything unmet and
 *  unblocked?) is entirely clara.adjustment_run_due's job — this belt scans every active
 *  client, same as its siblings, and lets the DB say no. */
async function activeClientIds(client) {
  const r = await client.query("select id from clara.clients where status = 'active' order by id");
  return r.rows.map((row) => String(row.id));
}

/** @param {import("pg").ClientBase} client  a clara_runtime connection */
export async function reconcileAdjustmentRuns(client, opts = {}) {
  const log = opts.log ?? (() => {});

  // THE PROBE IS ISOLATED, exactly as reconciler-fa.mjs and reconciler-render.mjs:192-198 do it:
  // a catalog read that THROWS is a connection or session problem, never a dormant surface, and
  // reporting the two identically would tell leader.mjs:195 the daily belt succeeded and park
  // the adjustment cadence for another 24 HOURS on the strength of a failed read. adjOk:false
  // instead — retried next cycle. Bare, the throw also escaped the belt and aborted the sweep
  // behind it.
  let surface;
  try {
    surface = await hasAdjustmentSurface(client);
  } catch (err) {
    // A HALT must still reach the leader even through this probe catch (the belt() wrapper's own
    // law in reconciler.mjs) — re-check before containing.
    if (err instanceof TaxonomyHaltError || err?.halt) throw err;
    log(`[reconcile] adjustment surface probe error: ${err?.message ?? err}`);
    return { adjOk: false, adjExamined: 0, adjPosted: 0, adjDrafted: 0, adjFailed: 0, adjDormant: false, adjBlockedClients: 0, adjTransientBlockedClients: 0 };
  }
  if (!surface) {
    // the adjustment surface (0045) is not yet applied — a clean no-op, never a failure
    // (the image boots dormant on pre-0045 per the design's runtime-image-first ceremony
    // order).
    return { adjOk: true, adjExamined: 0, adjPosted: 0, adjDrafted: 0, adjFailed: 0, adjDormant: true, adjBlockedClients: 0, adjTransientBlockedClients: 0 };
  }

  const out = { adjOk: true, adjExamined: 0, adjPosted: 0, adjDrafted: 0, adjFailed: 0, adjDormant: false, adjBlockedClients: 0, adjTransientBlockedClients: 0 };

  let ids;
  try {
    ids = await activeClientIds(client);
  } catch (err) {
    log(`[reconcile] adjustment runs client discovery error: ${err?.message ?? err}`);
    return { adjOk: false, adjExamined: 0, adjPosted: 0, adjDrafted: 0, adjFailed: 0, adjDormant: false, adjBlockedClients: 0, adjTransientBlockedClients: 0 };
  }

  // One client at a time; each client's whole due-probe/run chain is isolated in ONE
  // try/catch (a poisoned client counts as adjFailed and the loop CONTINUES — the remaining
  // clients are never abandoned, and adjOk — the daily cadence gate — stays true).
  for (const clientId of ids) {
    out.adjExamined += 1;
    try {
      for (let i = 0; i < ADJ_PERIOD_CAP; i++) {
        const dueRow = (await client.query("select clara.adjustment_run_due($1) as r", [clientId])).rows[0]?.r;
        const due = dueRow ?? {};
        if (due?.due !== true) {
          // ANOMALOUS SHAPE, LOUD [round-8 F2, cloned from reconciler-fa.mjs's round-7 E3
          // cure]. clara.adjustment_run_due's documented contract (0045 §2.3) always answers
          // {due:boolean,...} -- due:false is the ordinary "nothing to do" case and stays
          // quiet, exactly as before. Any OTHER shape (a null/empty row, a due-probe whose
          // result silently changed shape) reads as due:false too under the `?? {}` fallback
          // and `due?.due !== true` above -- INDISTINGUISHABLE from a healthy idle client
          // without this branch. A malformed/missing answer is now named in the log; the
          // sweep still does not crash or spin -- it breaks the chase for this client on
          // THIS cycle, exactly as before, and tries again next cycle.
          if (due?.due !== false) {
            log(`[reconcile] adjustment run client=${clientId} due-probe returned an unexpected shape (expected {due:boolean,...}, got ${JSON.stringify(dueRow)}) — treating as not-due this cycle`);
          } else if (due?.reason === "all_blocked") {
            // THE SECOND silent state the FA belt does not carry [round-8 F2]:
            // adjustment_run_due's OWN due:false/reason distinguishes "every live template
            // is blocked" from an ordinary caught-up "nothing_due" (0045 §2.3's
            // jsonb_build_object -- 'reason' is 'all_blocked' only when v_blocked is
            // non-empty).
            //
            // BUT all_blocked ITSELF MIXES TWO KINDS [round-9 fix wave, lane N2; r9 finding
            // 8, LOW]. The DB's blocked[] rows carry one of four reasons (0045 §2.3, the
            // dashboard's own blockedReasonLabel, adjustmentModel.ts:208), and only THREE
            // are terminal (template_line_ineligible, period_correction_unsound,
            // period_shape_already_met — the sweep can never clear them unassisted).
            // `occurrence_draft_outstanding` is TRANSIENT and self-clearing: it is the
            // belt's OWN expected output the moment it drafts a catch-up occurrence a human
            // has not approved yet (design SS2.3), reachable on a perfectly healthy firm the
            // very next cycle after the belt runs. MEASURED on a real 60-client lane pass:
            // `allBlocked=5`, every one of the five naming ONLY
            // occurrence_draft_outstanding — the ordinary drafted-yesterday-awaiting-
            // approval state, not five stuck firms. Counting it as terminal trains the
            // operator to ignore the alarm line, and the day a template really is
            // terminally blocked it reads identically.
            //
            // SO THE COUNT SPLITS BY KIND, per blocked row, never per client wholesale — one
            // client can carry BOTH a transient and a terminal block on two different
            // templates in the same cycle, and each axis must see its own row. Counted on
            // its own axis (never adjFailed -- nothing here THREW) so the belt's own
            // nightly line can tell "genuinely stuck" from "awaiting an ordinary approval"
            // at a glance, and logged with the blocked[] detail so the client + reasons are
            // named, not just the count.
            const blockedRows = Array.isArray(due.blocked) ? due.blocked : [];
            const terminalRows = blockedRows.filter((b) => b?.reason !== "occurrence_draft_outstanding");
            const transientRows = blockedRows.filter((b) => b?.reason === "occurrence_draft_outstanding");
            if (terminalRows.length > 0) {
              out.adjBlockedClients += 1;
              log(`[reconcile] adjustment run client=${clientId} all_blocked (terminal) — a live template is stuck and needs a human decision: ${JSON.stringify(terminalRows)}`);
            }
            if (transientRows.length > 0) {
              out.adjTransientBlockedClients += 1;
              log(`[reconcile] adjustment run client=${clientId} all_blocked (transient) — an occurrence draft is outstanding, awaiting the ordinary approve-or-withdraw: ${JSON.stringify(transientRows)}`);
            }
          } else if (due?.reason === "client_not_found") {
            // A THIRD named shape [round-9 fix wave, lane N2; r9 finding 8]: the due-probe
            // asking about a client activeClientIds JUST listed and the DB not resolving
            // it. This is a BROKEN PREMISE, not idleness — before this branch it fell
            // through both the anomalous-shape test (due:false IS present, so `due?.due
            // !== false` is false) and the all_blocked test (the reason does not match),
            // landing byte-identical to a healthy nothing_due. Named here rather than left
            // silent; never counted as blocked (nothing on THIS client's live templates was
            // examined at all).
            log(`[reconcile] adjustment run client=${clientId} due-probe reports client_not_found — a broken premise (the client was listed by activeClientIds moments earlier), not a healthy idle state`);
          }
          break; // no live template due, every live template blocked/caught up, a broken premise, or an anomalous shape (logged above)
        }
        const opKey = `adj:${clientId}:${due.template_id}:${due.period_start}:${randomUUID().slice(0, 8)}`;
        const r = (
          await client.query("select clara.run_adjustment_occurrence($1,$2,$3,$4,$5) as r", [
            clientId,
            due.template_id,
            due.period_start,
            due.period_end,
            opKey,
          ])
        ).rows[0]?.r ?? {};
        // ANY non-throw is success for cadence purposes (design §2.3 / ABI §A) — a refusal
        // throws (isolated by the outer try/catch), so reaching here means 'posted' or
        // 'drafted' — the ABI's only two terminal statuses (an occurrence ALWAYS carries a
        // charge, design §2.1, so there is no FA-style zero-charge noop to special-case
        // here). A 'drafted' outcome is still real progress (it births the ramp/catch-up
        // draft the human must approve) and it self-limits the chase — the draft just
        // minted is exactly what makes THIS template `blocked` on the next due-probe, so
        // the loop naturally moves on to a different due template (or stops) without any
        // client-side mirroring of that admission arithmetic.
        if (r?.status === "drafted") {
          out.adjDrafted += 1;
        } else {
          out.adjPosted += 1;
        }
        log(
          `[reconcile] adjustment run client=${clientId} template=${due.template_id} ` +
            `period=${due.period_start}..${due.period_end} status=${r?.status ?? "?"}`,
        );
      }
    } catch (err) {
      out.adjFailed += 1;
      log(`[reconcile] adjustment run client=${clientId} error: ${err?.message ?? err}`);
    }
  }

  log(`[reconcile] adjustment runs examined=${out.adjExamined} posted=${out.adjPosted} drafted=${out.adjDrafted} failed=${out.adjFailed} allBlocked=${out.adjBlockedClients} transientBlocked=${out.adjTransientBlockedClients}`);
  return out;
}
