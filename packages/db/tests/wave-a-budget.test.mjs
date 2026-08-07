// Wave-A rig — reserve-first token BUDGET (Codex probes 14/18; contract WA-L5 +
// companion §5). The sweep RESERVES worst-case tokens under the shared per-firm
// budget advisory lock BEFORE the model runs; settle adjusts by actual−reserved;
// failure refunds fully; concurrent admissions at the share cap → exactly one
// refuses (atomic reservation, not a raceable read); one-click is exempt from the
// sweep share but bound by the plain daily limit; NULL-limit → fn default; a
// concurrent-sweep-run cap bounds overshoot. Contract-blind. SKIPS (counted).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  primeReadyFiling, admitAutodraft, beginAutodraft, settleAutodraft, openSweepRun, autodraftDraftEntry,
  ORIGIN, WA_DEFAULTS, concurrentTwoSession, sawDeadlock, GUARD,
} from "./wave-a-race.mjs";

let ready = false;
let world = null;
const RESERVE = WA_DEFAULTS.reserveTokens;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: "400-000", name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: "500-A01", name: "Prof Fees", type: "expense", opKey: opk("exp") });
    }
  }
});
after(async () => { printLaneNotes("wave-a-budget"); printSkipCount("wave-a-budget"); await endPool(); });

/** Operator-set per-firm limits (rig lever, root — s6-metering precedent). */
async function setFirmLimit(firm, { daily = null, share = null, maxSweeps = null }) {
  const sets = [], vals = [firm];
  if (daily !== null) { sets.push(`daily_token_limit = $${vals.length + 1}`); vals.push(daily); }
  if (share !== null) { sets.push(`sweep_budget_share = $${vals.length + 1}`); vals.push(share); }
  if (maxSweeps !== null) { sets.push(`max_concurrent_sweeps = $${vals.length + 1}`); vals.push(maxSweeps); }
  if (!sets.length) return;
  const upd = await rootQuery(`update clara.firm_limits set ${sets.join(", ")} where firm_id=$1`, vals);
  if (upd.rowCount === 0) {
    const cols = ["firm_id"], ph = ["$1"], ins = [firm];
    if (daily !== null) { cols.push("daily_token_limit"); ph.push(`$${ins.length + 1}`); ins.push(daily); }
    if (share !== null) { cols.push("sweep_budget_share"); ph.push(`$${ins.length + 1}`); ins.push(share); }
    if (maxSweeps !== null) { cols.push("max_concurrent_sweeps"); ph.push(`$${ins.length + 1}`); ins.push(maxSweeps); }
    await rootQuery(`insert into clara.firm_limits (${cols.join(",")}) values (${ph.join(",")}) on conflict (firm_id) do update set ${sets.join(", ")}`, ins).catch((e) => noteLane(`setFirmLimit insert fallback failed (${e.code}) — firm_limits shape may differ`));
  }
}
async function usedToday(firm) {
  const r = await rootQuery("select coalesce(tokens_used,0)::bigint as t from clara.firm_usage_daily where firm_id=$1 and usage_date=(now() at time zone 'utc')::date", [firm]);
  return Number(r.rows[0]?.t ?? 0);
}
const outcomeOf = (r) => (typeof r === "object" && r ? (r.outcome ?? null) : null);

// ===========================================================================
// Reserve-first + settle/refund arithmetic.
// ===========================================================================

test("reserve-first: admit RESERVES the worst-case tokens on firm_usage_daily BEFORE the model runs (spend rises by the reserve)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // maxSweeps high: the run-bound admitAutodraft opens a sweep_run per call and these
  // accumulate on the shared firm across tests — only the cap test constrains it.
  await setFirmLimit(firm, { daily: 1_000_000, share: 0.6, maxSweeps: 999 });
  const rf = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "RESERVECO SDN BHD", registration: "201801002000" });
  const before = await usedToday(firm);
  const a = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, reserveTokens: RESERVE });
  if (outcomeOf(a) !== "admitted") { noteLane(`reserve-first: admit outcome=${outcomeOf(a)} — READY not reached; reservation unverified`); return; }
  const after = await usedToday(firm);
  assert.equal(after - before, RESERVE, `firm_usage_daily rose by the RESERVE (${RESERVE}) at admission, before any model spend (Δ=${after - before})`);
  // Settle 'drafted' at a LOWER actual → refund the difference (used adjusts to actual).
  // A 'drafted' settle needs a genuine drafted entry (via the real autodraft draft path).
  const entry = await autodraftDraftEntry(users.alice, { task: a.task_id, rf, firm, client: clients.A1, vendorName: "RESERVECO SDN BHD" });
  await settleAutodraft({ task: a.task_id, outcome: "drafted", tokens: 12000, entry });
  const settled = await usedToday(firm);
  assert.equal(settled - before, 12000, `settle adjusts spend to ACTUAL (12000), refunding reserve−actual (Δ=${settled - before})`);
});

test("failure full-refund: settle('failed') refunds the WHOLE reservation (spend returns to pre-admission)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  await setFirmLimit(firm, { daily: 1_000_000, share: 0.6, maxSweeps: 2 });
  const rf = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "REFUNDCO SDN BHD", registration: "201801002100" });
  const before = await usedToday(firm);
  const a = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, reserveTokens: RESERVE });
  if (outcomeOf(a) !== "admitted") { noteLane(`full-refund: admit outcome=${outcomeOf(a)} — READY not reached`); return; }
  await beginAutodraft({ task: a.task_id }).catch(() => {});
  await settleAutodraft({ task: a.task_id, outcome: "failed", tokens: 5000, refusal: { reason: "rig fail" } });
  assert.equal(await usedToday(firm), before, "a failed settle refunds the whole reservation (spend back to pre-admission)");
});

// ===========================================================================
// Concurrency — atomic reservation: exactly one of two racing admits refuses.
// ===========================================================================

test("concurrency: two admissions racing at just-below the share cap → EXACTLY ONE refuses refused_budget (atomic reservation under the shared budget lock)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // 0.6 * 100000 = 60000 → one reserve (40000) fits, two (80000) do not.
  await setFirmLimit(firm, { daily: 100_000, share: 0.6, maxSweeps: 999 });
  // Zero out any prior spend for a clean window.
  await rootQuery("delete from clara.firm_usage_daily where firm_id=$1 and usage_date=(now() at time zone 'utc')::date", [firm]).catch(() => {});
  const rf1 = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "CAPA SDN BHD", registration: "201801002200" });
  const rf2 = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "CAPB SDN BHD", registration: "201801002300" });
  // Both admissions run under a real open sweep_run (run-bound; opk() is not a uuid).
  const raceRun = await openSweepRun({ firm, expected: 2 });
  const run = (filing) => (c) => (async () => { await c.query(GUARD); return c.query("select clara.admit_autodraft_task(p_filing => $1, p_origin => 'sweep', p_run_id => $2, p_model => 'gpt-5.6-terra', p_reserve_tokens => $3) as r", [filing, raceRun, RESERVE]); })();
  const out = await concurrentTwoSession({ a: { role: ROLES.runtime, run: run(rf1.filingId) }, b: { role: ROLES.runtime, run: run(rf2.filingId) } });
  assert.ok(!sawDeadlock(out), "the two racing admissions do not deadlock (shared budget advisory lock serializes)");
  const outs = [out.a, out.b].map((s) => (s.ok ? outcomeOf(s.receipt?.rows?.[0]?.r ?? s.receipt) : "raised"));
  const refused = outs.filter((o) => o === "refused_budget").length;
  const admitted = outs.filter((o) => o === "admitted").length;
  if (admitted + refused < 2) { noteLane(`budget race: outcomes ${JSON.stringify(outs)} — READY may not have been reached for both`); return; }
  assert.equal(refused, 1, `exactly ONE admission is refused_budget (outcomes ${JSON.stringify(outs)})`);
  assert.equal(admitted, 1, "exactly one admission reserved successfully");
});

// ===========================================================================
// one-click exemption + NULL-limit + concurrent-sweep cap.
// ===========================================================================

test("one-click is exempt from sweep_budget_share but BOUND by the plain daily limit; sweep is refused where one-click passes", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  await setFirmLimit(firm, { daily: 100_000, share: 0.6, maxSweeps: 999 });
  await rootQuery("delete from clara.firm_usage_daily where firm_id=$1 and usage_date=(now() at time zone 'utc')::date", [firm]).catch(() => {});
  // Pre-spend to 50000 (above 0.6*100000=60000? no, below). Push to 55000 so a sweep
  // reserve (40000 → 95000 > 60000) is refused, but a one-click (bound by daily
  // 100000 → 95000 ≤ 100000) is admitted.
  await rootQuery("insert into clara.firm_usage_daily (firm_id, usage_date, tokens_used) values ($1, (now() at time zone 'utc')::date, 55000) on conflict (firm_id, usage_date) do update set tokens_used=55000", [firm]).catch((e) => noteLane(`pre-spend seed failed (${e.code}) — firm_usage_daily PK may differ`));
  const rfSweep = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "OCSWEEP SDN BHD", registration: "201801002400" });
  const s = await admitAutodraft({ filing: rfSweep.filingId, origin: ORIGIN.sweep, reserveTokens: RESERVE });
  const rfClick = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "OCCLICK SDN BHD", registration: "201801002500" });
  const c = await admitAutodraft({ filing: rfClick.filingId, origin: ORIGIN.oneClick, reserveTokens: RESERVE });
  if (outcomeOf(s) === "lane_changed" || outcomeOf(c) === "lane_changed") { noteLane(`one-click exemption: lane_changed (s=${outcomeOf(s)} c=${outcomeOf(c)}) — READY not reached`); return; }
  assert.equal(outcomeOf(s), "refused_budget", `the sweep origin is refused past 0.6×daily (got ${outcomeOf(s)})`);
  assert.notEqual(outcomeOf(c), "refused_budget", `the one-click origin is exempt from the sweep share and admitted under the daily limit (got ${outcomeOf(c)})`);
});

// F5 FIX (ledger #27, docs/.. .tmp/H2-ACCEPTANCE-REPORT.txt FINDING F5, migration 0048).
// open_sweep_run always opens a run BEFORE any item is admitted under it, so the run's own
// clara.sweep_runs row is ALREADY state='open' by the time admit_autodraft_task's
// concurrency-cap query runs inside that same call. The test this replaces pinned that
// self-count as CORRECT ("the cap check sees EXACTLY THE ONE open run ≥
// max_concurrent_sweeps") — opening a single run at cap=1 and admitting UNDER THAT SAME
// run, asserting refused_budget. That was the bug, not a documented safety reason: it meant
// a firm at max_concurrent_sweeps=1 refused EVERY admission under its own sole open run,
// unconditionally — a sweep refusing work its own presence caused.
//
// The REAL property the old test protected is genuine and is NOT weakened by 0048: the cap
// bounds how many sweep runs may draw on a firm's shared per-firm resources AT THE SAME
// TIME. It was never meant to mean "a run may not admit under itself". 0048 excludes only
// the CALLER's own run id from the count — two cells below pin both halves: the fix itself,
// and a contrast cell proving a genuinely OTHER concurrently-open run still trips the cap.
async function finalizeAllOpenRuns(firm) {
  // Rig lever (root-level, test-only): force a clean concurrency-cap slate on a firm so
  // these two cells are not at the mercy of runs earlier tests in this file left open on
  // the SAME shared firm (see the accumulation note at the top of this file — clients.A1
  // and clients.A2 share one firm, and admitAutodraft auto-opens a run per sweep-origin
  // call with no explicit runId). ck_sweep_runs_terminal requires BOTH finalized_at and
  // window_ended_at whenever state='finalized'.
  await rootQuery(
    "update clara.sweep_runs set state='finalized', window_ended_at=now(), finalized_at=now() where firm_id=$1 and state='open'",
    [firm],
  );
}

test("F5 fix: with max_concurrent_sweeps=1 and NO OTHER open run, admission under the caller's OWN open run is NOT refused (the run's own presence does not count against its own cap)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  await setFirmLimit(firm, { daily: 10_000_000, share: 0.6, maxSweeps: 1 });
  await finalizeAllOpenRuns(firm);
  const ownRun = await openSweepRun({ firm, expected: 1 }).catch((e) => { noteLane(`open_sweep_run raised ${e.code}`); return null; });
  const rf = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "OWNRUNCO SDN BHD", registration: "201801002600" });
  const a = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, runId: ownRun, reserveTokens: RESERVE });
  if (outcomeOf(a) === "lane_changed") { noteLane("F5 own-run: lane_changed — READY not reached"); return; }
  assert.notEqual(outcomeOf(a), "refused_budget", `a sweep admission under its OWN sole open run at cap=1 must NOT be refused_budget by the concurrency gate (got ${outcomeOf(a)}) — this is the F5 regression`);
  assert.equal(outcomeOf(a), "admitted", `the admission genuinely proceeds once the self-count is excluded (got ${outcomeOf(a)})`);
});

test("contrast: with max_concurrent_sweeps=1 and ONE OTHER genuinely-concurrent open run, a second run's admission IS STILL refused_budget/concurrency (the safety property F5's fix must not lose)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  await setFirmLimit(firm, { daily: 10_000_000, share: 0.6, maxSweeps: 1 });
  await finalizeAllOpenRuns(firm);
  // R1: a genuinely OTHER sweep run, left open — simulates an in-flight sweep (or a stale
  // run reconcile_sweep_runs has not yet finalized). Never admitted under; only its
  // state='open' row matters here.
  await openSweepRun({ firm, expected: 1 }).catch((e) => { noteLane(`open_sweep_run raised ${e.code}`); return null; });
  // R2: the caller's own run, opened SECOND — its own presence must NOT be what trips the
  // cap; R1's presence is what must.
  const ownRun = await openSweepRun({ firm, expected: 1 }).catch((e) => { noteLane(`open_sweep_run raised ${e.code}`); return null; });
  const rf = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "OTHERRUNCO SDN BHD", registration: "201801002700" });
  const a = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, runId: ownRun, reserveTokens: RESERVE });
  if (outcomeOf(a) === "lane_changed") { noteLane("F5 contrast: lane_changed — READY not reached"); return; }
  assert.equal(outcomeOf(a), "refused_budget", `a sweep admission is still refused_budget when a genuinely OTHER run is already open at the cap (got ${outcomeOf(a)})`);
});

test("NULL daily limit → the fn-constant default applies; a normal reserve still admits (companion §5 / P10)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  await setFirmLimit(firm, { daily: null, share: 0.6, maxSweeps: 999 });
  await rootQuery("update clara.firm_limits set daily_token_limit = null where firm_id=$1", [firm]).catch(() => {});
  await rootQuery("delete from clara.firm_usage_daily where firm_id=$1 and usage_date=(now() at time zone 'utc')::date", [firm]).catch(() => {});
  const rf = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "NULLLIMCO SDN BHD", registration: "201801002700" });
  const a = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, reserveTokens: RESERVE });
  if (outcomeOf(a) === "lane_changed") { noteLane("NULL-limit: lane_changed — READY not reached"); return; }
  assert.equal(outcomeOf(a), "admitted", `a modest reserve admits under the NULL→default daily limit (got ${outcomeOf(a)})`);
});
