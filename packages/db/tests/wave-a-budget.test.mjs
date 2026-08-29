// Wave-A rig — reserve-first token METERING (Codex probes 14/18; contract WA-L5 +
// companion §5). The sweep RESERVES worst-case tokens on firm_usage_daily BEFORE the
// model runs; settle adjusts by actual−reserved; failure refunds fully; a
// concurrent-sweep-run cap bounds how many runs draw on a firm at once.
// Contract-blind. SKIPS (counted).
//
// F-A9 PR-1B RE-CUT (digest law 76 / §9 "meter, never cap"; owner ruling TA-P12 = A).
// THE BUDGET GATE THIS FILE WAS BUILT AROUND IS GONE. `clara.admit_autodraft_task` no
// longer refuses past 0.6×daily (sweep) or 1.0×daily (one_click) — the two columns those
// bounds read (`firm_limits.daily_token_limit`, `.sweep_budget_share`) no longer exist.
// The RESERVE ARITHMETIC IS UNTOUCHED and is still pinned here in full: F-A9 removes the
// BRAKE, never the METER, and the cells below are the proof of exactly that split.
// Three cells whose PREMISE was the removed refusal are INVERTED into their
// positive-by-absence successors (law 31; design Annex C cells C.10/C.12) rather than
// deleted — a firm pushed far past the old bound now ADMITS, and the one refusal that
// remains is the CONCURRENCY floor, which keeps its bound and changes only its spelling
// (`refused_budget` → `refused_concurrency`).

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

/** Operator-set per-firm limits (rig lever, root — s6-metering precedent).
 *  F-A9 PR-1B: `daily_token_limit` and `sweep_budget_share` are DROPPED columns, so the
 *  only lever left here is the KEPT concurrency floor. The parameter is not merely
 *  ignored — writing a column that no longer exists would raise 42703, which is exactly
 *  the stranded-write this repair exists to remove. */
async function setFirmLimit(firm, { maxSweeps = null }) {
  if (maxSweeps === null) return;
  const upd = await rootQuery("update clara.firm_limits set max_concurrent_sweeps = $2 where firm_id=$1", [firm, maxSweeps]);
  if (upd.rowCount === 0) {
    await rootQuery(
      "insert into clara.firm_limits (firm_id, max_concurrent_sweeps) values ($1,$2) on conflict (firm_id) do update set max_concurrent_sweeps = $2",
      [firm, maxSweeps],
    ).catch((e) => noteLane(`setFirmLimit insert fallback failed (${e.code}) — firm_limits shape may differ`));
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
  await setFirmLimit(firm, { maxSweeps: 999 });
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
  await setFirmLimit(firm, { maxSweeps: 2 });
  const rf = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "REFUNDCO SDN BHD", registration: "201801002100" });
  const before = await usedToday(firm);
  const a = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, reserveTokens: RESERVE });
  if (outcomeOf(a) !== "admitted") { noteLane(`full-refund: admit outcome=${outcomeOf(a)} — READY not reached`); return; }
  await beginAutodraft({ task: a.task_id }).catch(() => {});
  await settleAutodraft({ task: a.task_id, outcome: "failed", tokens: 5000, refusal: { reason: "rig fail" } });
  assert.equal(await usedToday(firm), before, "a failed settle refunds the whole reservation (spend back to pre-admission)");
});

// ===========================================================================
// Concurrency — the reservation is still ATOMIC; it just no longer refuses.
// ===========================================================================

// INVERTED at F-A9 PR-1B (law 31 / design cell C.10). The cell this replaces raced two
// admissions at just-below 0.6×daily and asserted EXACTLY ONE was refused_budget. That
// assertion's whole premise was the token budget, which is gone — so the cell is not
// deleted but turned over: the SAME race, at the SAME reserve, must now ADMIT BOTH, and
// the reserve arithmetic (the meter) must still be exact and serialized. Deleting it
// would have thrown away the only proof that the shared advisory lock still holds when
// nothing refuses under it.
test("[C.10] the token budget is GONE: two admissions racing far past the OLD 0.6×daily bound BOTH admit, the shared lock still serializes, and both reserves are metered", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  await setFirmLimit(firm, { maxSweeps: 999 });
  // Zero out prior spend, then pre-spend to 61% of the OLD default-shaped bound: with the
  // pre-F-A9 body, 100000 × 0.6 = 60000 and a 55000 pre-spend + one 40000 reserve already
  // exceeded it — that is exactly the state that used to refuse.
  await rootQuery("delete from clara.firm_usage_daily where firm_id=$1 and usage_date=(now() at time zone 'utc')::date", [firm]).catch(() => {});
  await rootQuery("insert into clara.firm_usage_daily (firm_id, usage_date, tokens_used) values ($1, (now() at time zone 'utc')::date, 55000) on conflict (firm_id, usage_date) do update set tokens_used=55000", [firm]).catch((e) => noteLane(`pre-spend seed failed (${e.code}) — firm_usage_daily PK may differ`));
  const before = await usedToday(firm);
  const rf1 = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "CAPA SDN BHD", registration: "201801002200" });
  const rf2 = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "CAPB SDN BHD", registration: "201801002300" });
  // Both admissions run under a real open sweep_run (run-bound; opk() is not a uuid).
  const raceRun = await openSweepRun({ firm, expected: 2 });
  const run = (filing) => (c) => (async () => { await c.query(GUARD); return c.query("select clara.admit_autodraft_task(p_filing => $1, p_origin => 'sweep', p_run_id => $2, p_model => 'gpt-5.6-terra', p_reserve_tokens => $3) as r", [filing, raceRun, RESERVE]); })();
  const out = await concurrentTwoSession({ a: { role: ROLES.runtime, run: run(rf1.filingId) }, b: { role: ROLES.runtime, run: run(rf2.filingId) } });
  assert.ok(!sawDeadlock(out), "the two racing admissions do not deadlock (the per-firm advisory lock still serializes)");
  const outs = [out.a, out.b].map((s) => (s.ok ? outcomeOf(s.receipt?.rows?.[0]?.r ?? s.receipt) : "raised"));
  const admitted = outs.filter((o) => o === "admitted").length;
  if (admitted < 2 && outs.some((o) => o === "lane_changed" || o === "raised")) {
    noteLane(`C.10 race: outcomes ${JSON.stringify(outs)} — READY may not have been reached for both`);
    return;
  }
  assert.equal(outs.filter((o) => o === "refused_budget" || o === "refused_concurrency").length, 0,
    `NO admission is refused on spend any more — the 60%/100% token budget is removed (outcomes ${JSON.stringify(outs)})`);
  assert.equal(admitted, 2, `BOTH admissions proceed past the old bound (outcomes ${JSON.stringify(outs)})`);
  // The METER, still exact: two reserves landed, neither lost to the race.
  assert.equal(await usedToday(firm) - before, RESERVE * 2,
    "both reserves are recorded on firm_usage_daily — F-A9 removes the brake, never the meter");
});

// ===========================================================================
// The one-click/sweep split is gone; the concurrent-sweep cap is not.
// ===========================================================================

// INVERTED at F-A9 PR-1B (law 31 / design cell C.10). The cell this replaces proved the
// asymmetry between the two origins: a sweep refused past 0.6×daily where a one-click
// passed under 1.0×daily. BOTH halves of that asymmetry were spend bounds and both are
// gone, so the successor proves the state the ruling actually creates — the two origins
// are now indistinguishable at this gate, and neither is refused.
test("[C.10] the sweep/one_click spend asymmetry is GONE: at the same pre-spend that used to refuse a sweep, BOTH origins admit", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  await setFirmLimit(firm, { maxSweeps: 999 });
  await rootQuery("delete from clara.firm_usage_daily where firm_id=$1 and usage_date=(now() at time zone 'utc')::date", [firm]).catch(() => {});
  // 55000 pre-spend: under the pre-F-A9 body a sweep reserve (→95000 > 0.6×100000) was
  // refused_budget while a one-click (→95000 ≤ 100000) passed. Now neither is refused.
  await rootQuery("insert into clara.firm_usage_daily (firm_id, usage_date, tokens_used) values ($1, (now() at time zone 'utc')::date, 55000) on conflict (firm_id, usage_date) do update set tokens_used=55000", [firm]).catch((e) => noteLane(`pre-spend seed failed (${e.code}) — firm_usage_daily PK may differ`));
  const rfSweep = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "OCSWEEP SDN BHD", registration: "201801002400" });
  const s = await admitAutodraft({ filing: rfSweep.filingId, origin: ORIGIN.sweep, reserveTokens: RESERVE });
  const rfClick = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "OCCLICK SDN BHD", registration: "201801002500" });
  const c = await admitAutodraft({ filing: rfClick.filingId, origin: ORIGIN.oneClick, reserveTokens: RESERVE });
  if (outcomeOf(s) === "lane_changed" || outcomeOf(c) === "lane_changed") { noteLane(`C.10 origins: lane_changed (s=${outcomeOf(s)} c=${outcomeOf(c)}) — READY not reached`); return; }
  assert.equal(outcomeOf(s), "admitted", `the SWEEP origin is no longer refused past the old 0.6×daily bound (got ${outcomeOf(s)})`);
  assert.equal(outcomeOf(c), "admitted", `the ONE-CLICK origin still admits (got ${outcomeOf(c)})`);
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
  await setFirmLimit(firm, { maxSweeps: 1 });
  await finalizeAllOpenRuns(firm);
  const ownRun = await openSweepRun({ firm, expected: 1 }).catch((e) => { noteLane(`open_sweep_run raised ${e.code}`); return null; });
  const rf = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "OWNRUNCO SDN BHD", registration: "201801002600" });
  const a = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, runId: ownRun, reserveTokens: RESERVE });
  if (outcomeOf(a) === "lane_changed") { noteLane("F5 own-run: lane_changed — READY not reached"); return; }
  assert.notEqual(outcomeOf(a), "refused_concurrency", `a sweep admission under its OWN sole open run at cap=1 must NOT be refused by the concurrency gate (got ${outcomeOf(a)}) — this is the F5 regression`);
  assert.equal(outcomeOf(a), "admitted", `the admission genuinely proceeds once the self-count is excluded (got ${outcomeOf(a)})`);
});

// RENAMED, NOT WEAKENED, at F-A9 PR-1B (design cell C.12): the BOUND is byte-unchanged —
// this is still the same genuinely-other-open-run contrast — and only the outcome string
// moves off the one it used to share with two now-removed spend caps (law 22). The
// refusal_token's `gate` discriminator is asserted too, so a body that renamed the string
// while quietly refusing for some other reason could not pass this cell.
test("[C.12] contrast: with max_concurrent_sweeps=1 and ONE OTHER genuinely-concurrent open run, a second run's admission IS STILL refused — now spelled refused_concurrency (the safety property F5's fix must not lose)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  await setFirmLimit(firm, { maxSweeps: 1 });
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
  assert.equal(outcomeOf(a), "refused_concurrency", `a sweep admission is still refused when a genuinely OTHER run is already open at the cap (got ${outcomeOf(a)})`);
  assert.equal(a?.reason, "refused_concurrency", `the receipt's reason is renamed with the outcome (got ${JSON.stringify(a)})`);
  // The refusal is still the CONCURRENCY gate, read from the item row's own discriminator
  // rather than inferred from the renamed string (spelling is not identity).
  const item = await rootQuery(
    "select outcome, refusal_token->>'gate' as gate, refusal_token->>'reason' as reason from clara.sweep_run_items where run_id=$1 and filing_id=$2",
    [ownRun, rf.filingId],
  );
  assert.equal(item.rows[0]?.outcome, "refused_concurrency", "the sweep_run_items row carries the renamed outcome");
  assert.equal(item.rows[0]?.gate, "concurrency", "and it is still the CONCURRENCY gate that refused, by the token's own discriminator");
  assert.equal(item.rows[0]?.reason, "refused_concurrency", "the token's reason is renamed in lockstep with the outcome");
});

// REPLACES the pre-F-A9 "NULL daily limit → the fn-constant default applies" cell, whose
// premise was a column that no longer exists (design cell C.9b's shape, applied to the
// unattended lane): the successor proves admission works with NO token-limit column in
// existence at all, which is the positive-by-absence form of the same protection.
test("[C.10] no daily-limit column EXISTS any more, and a sweep admission still proceeds (the late-binding trap, proven closed)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  await setFirmLimit(firm, { maxSweeps: 999 });
  const cols = await rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name='firm_limits' and column_name in ('daily_token_limit','sweep_budget_share','sales_admission_daily_cap')");
  assert.equal(cols.rowCount, 0, `firm_limits still carries ${JSON.stringify(cols.rows)} — F-A9 PR-1B drops all three`);
  await rootQuery("delete from clara.firm_usage_daily where firm_id=$1 and usage_date=(now() at time zone 'utc')::date", [firm]).catch(() => {});
  const rf = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "NULLLIMCO SDN BHD", registration: "201801002700" });
  const a = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, reserveTokens: RESERVE });
  if (outcomeOf(a) === "lane_changed") { noteLane("no-limit-column: lane_changed — READY not reached"); return; }
  assert.equal(outcomeOf(a), "admitted", `a sweep admits with no token-limit column in existence (got ${outcomeOf(a)}) — PL/pgSQL is late-bound, so a stranded read would surface HERE, on the first real call`);
});
