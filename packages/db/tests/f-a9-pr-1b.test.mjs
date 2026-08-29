// F-A9 PR-1B — THE BRAKE CENSUS'S DB HALF, as executable proof.
//
// SPEC OF RECORD. `docs/plan/active/metering-design.md` §3.3 (gates 3,4,5,7) + §3.4;
// `docs/plan/active/metering-annexes.md` Annex C cells C.10–C.13, C.22, C.23; the migration
// `0151_f_a9_pr_1b_brake_census.sql` (the number claimed at merge prep). LAW: digest law 76 / §9 "meter, never cap"
// (owner ruling TA-P12 = A, 2026-08-22 Track-A sitting, widened by the 2026-08-23 gate-6/7
// split); law 6 (append-only history); law 22 (a visible record must not lie).
//
// WHAT LIVES HERE AND WHAT DOES NOT. The BEHAVIOURAL inversions of the cells whose premise
// this item removes live where those cells already lived — `wave-a-budget.test.mjs` (C.10,
// C.12), `x46-blind-contract.test.mjs` (C.11, C.23), `x38-wave-c-b-bank.test.mjs` (gate 7's
// enqueue path) and `rig-runtime-metering.test.mjs` (C.9b) — because a differential belongs
// beside the assertion it replaces. THIS file carries the proofs that have no prior home:
// the extend-only CHECK swap, history's survival, gate 7 at the reservation verbs
// themselves, the closed-world catalog censuses, and the mutant panel that makes each of
// them non-vacuous.
//
// TEXT IS NOT BEHAVIOUR, and the two bodies this PR adds BEYOND the design carry the
// heaviest burden of proof precisely because no ruling names them. Each therefore has a
// catalog cell AND a behavioural one, and the behavioural one stages the pre-F-A9 failure
// mode exactly rather than asserting its absence:
//   * `_settle_processing_call` (gate 7's back half) → `[gate 7-b]` reserves 5 pages, then
//     squeezes the bound below them and settles — the call that used to raise CLR18;
//   * `reconcile_sweep_runs`'s widened bucket → `[C.13-b]` finalizes a run carrying a
//     `refused_concurrency` item and asserts the four counters TOTAL `expected_count`,
//     which is the arithmetic the un-widened bucket gets wrong by exactly one.
//
// GATE. This battery FAILS rather than skips when its own migration is absent — the shape
// `.claude/rules/db-tests.md` calls final-acceptance ("a focused run leaves its variable
// UNSET, which is the shape that fails rather than skips"). It ships in the same PR as the
// migration, so there is no legitimate frontier at which it should be quiet. It is not a
// slice file, so it is not in the `db-slice-frontiers` partition corpus.
//
// ┌── THE MUTANT PANEL ─────────────────────────────────────────────────────────────────┐
// │ Every wall below is proven NON-VACUOUS by a mutant: a probe that must be REFUSED, or │
// │ a positive control that must still be ADMITTED, so "no error" can never be mistaken  │
// │ for "the wall held". Each mutant runs against the SHIPPING catalog, never a copy.    │
// ├──────┬───────────────────────────────┬───────────────────────────────────────────────┤
// │ M1   │ the outcome CHECK             │ an UNKNOWN outcome ('refused_wallet') is      │
// │      │ (extend-only, DDL 1)          │ REFUSED by sweep_run_items_outcome_check —    │
// │      │                               │ so "refused_concurrency inserts" is a         │
// │      │                               │ widening, not a deleted constraint            │
// │ M2   │ history (law 6)               │ a PRE-EXISTING refused_budget row still       │
// │      │                               │ INSERTS and reads back unchanged — the swap   │
// │      │                               │ did not strand the past                       │
// │ M3   │ the KEPT concurrency floor    │ positive control: ONE below the bound still   │
// │      │ (gate 4)                      │ ADMITS, and only AT the bound does it refuse  │
// │      │                               │ refused_concurrency — a body that refused     │
// │      │                               │ unconditionally would fail the control        │
// │ M4   │ gate 7 REMOVED, both arms     │ negative control: gate 6                      │
// │      │                               │ (_reserve_document_ingest) STILL refuses      │
// │      │                               │ CLR18 at ITS OWN docs bound — the removal was │
// │      │                               │ surgical, not a wholesale deletion of CLR18   │
// │ M5   │ the column drop (DDL 2)       │ writing a dropped column RAISES 42703, and    │
// │      │                               │ the six survivors still accept a write — an   │
// │      │                               │ "absent" read that was really a typo cannot   │
// │      │                               │ pass                                          │
// └──────┴───────────────────────────────┴───────────────────────────────────────────────┘

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, opk, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, primeReadyFiling, admitAutodraft, openSweepRun, reconcileSweepRuns,
  upsertPayableAccount, upsertAccountClassed, ORIGIN, WA_DEFAULTS,
} from "./wave-a-race.mjs";

const STEM = "f_a9_pr_1b_brake_census";
let world = null;

before(async () => {
  const applied = await rootQuery(
    "select version from clara.schema_migrations where version like $1", [`%\\_${STEM}`]);
  if (applied.rowCount !== 1) {
    throw new Error(
      `f-a9-pr-1b: the brake-census migration (stem ${STEM}) is NOT applied — this battery ships in the same PR as its migration and has no frontier at which it may be quiet. Applied rows matching the stem: ${applied.rowCount}`);
  }
  noteLane(`migration stem present as ${applied.rows[0].version}`);
  world = await buildWorld();
  for (const c of [world.clients.A1, world.clients.A2]) {
    await upsertPayableAccount(world.users.alice, { client: c, code: "400-000", name: "Trade Creditors", opKey: opk("fa9ap") });
    await upsertAccountClassed(world.users.alice, { client: c, code: "500-A01", name: "Prof Fees", type: "expense", opKey: opk("fa9exp") });
  }
});
after(async () => { printLaneNotes("f-a9-pr-1b"); printSkipCount("f-a9-pr-1b"); await endPool(); });

const caught = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const outcomeOf = (r) => (typeof r === "object" && r ? (r.outcome ?? null) : null);

/** A real, FK-satisfying sweep_run_items row, minted as the owner against a REAL filing
 *  produced by the ordinary fixture path (the table is append-only and PK'd on
 *  (run_id, filing_id), so a fresh run per call keeps every plant independent).
 *  Returns its keys. */
async function plantItem({ client, vendorName, registration, run: intoRun = null, expected = 1 }, outcome) {
  const firm = await firmOf(client);
  const rf = await primeReadyFiling(world.users.alice, { client, vendorName, registration });
  const run = intoRun ?? (await openSweepRun({ firm, expected }));
  const r = await rootQuery(
    `insert into clara.sweep_run_items(run_id, filing_id, firm_id, client_id, document_id, outcome, refusal_token)
     select $1, f.id, f.firm_id, f.client_id, f.document_id, $3,
            jsonb_build_object('clr','CLR29','reason',$3::text)
       from clara.document_filings f where f.id=$2
     returning run_id, filing_id, outcome`,
    [run, rf.filingId, outcome]);
  return r.rows[0];
}

/** A minimal document_intakes row, minted as the owner — the ONLY thing
 *  clara._reserve_document_ingest needs as a parent (it raises CLR10 without one). */
async function plantIntake(firm, user) {
  const r = await rootQuery(
    `insert into clara.document_intakes(firm_id, uploaded_by, origin, original_filename,
        declared_mime, declared_bytes, op_key)
     values($1, $2, 'documents_tab', $3, 'application/pdf', 1024, $4) returning id`,
    [firm, user, `fa9-${randomUUID()}.pdf`, opk("fa9intake")]);
  return r.rows[0].id;
}

// ===========================================================================
// DDL 1 — the outcome CHECK is EXTENDED, never replaced. (C.13 + M1 + M2.)
// ===========================================================================

test("[DDL 1] the outcome CHECK admits all SIX pre-existing values PLUS refused_concurrency — a widening, asserted value by value", async () => {
  const def = await rootQuery(
    `select pg_get_constraintdef(c.oid) as d from pg_constraint c
      where c.conrelid='clara.sweep_run_items'::regclass and c.conname='sweep_run_items_outcome_check'`);
  assert.equal(def.rowCount, 1, "sweep_run_items_outcome_check still EXISTS — a widening that DELETED the constraint would satisfy every insert below and prove nothing");
  const d = def.rows[0].d;
  for (const v of ["drafted", "skipped_lane", "refused_budget", "refused_attempts", "noop_existing", "posted", "refused_concurrency"]) {
    assert.ok(d.includes(`'${v}'`), `the CHECK admits '${v}' (def: ${d})`);
  }
});

test("[M1] MUTANT: an UNKNOWN outcome is REFUSED by name — so 'refused_concurrency inserts' is a widening, not a missing constraint", async () => {
  const seat = { client: world.clients.A1, vendorName: "FA9 MUTANT SDN BHD", registration: "201801003300" };
  // POSITIVE CONTROL: the SAME plant with the NEW value succeeds, so the refusal below is
  // about the VALUE and not about the fixture, the FKs or the shape CHECK.
  const ok = await plantItem(seat, "refused_concurrency");
  assert.equal(ok.outcome, "refused_concurrency", "the new value inserts — the widening is real");
  const e = await caught(() => plantItem(seat, "refused_wallet"));
  assert.ok(e, "an unknown outcome string must be refused");
  assert.equal(e.code, "23514", `the refusal is a CHECK violation (got ${e.code}: ${e.message})`);
  assert.match(String(e.constraint ?? e.message), /sweep_run_items_outcome_check/,
    `and it is THIS constraint that refused, by name (got ${e.constraint ?? e.message})`);
});

test("[C.13] a historical refused_budget row is UNTOUCHED: it still inserts, reads back byte-identical, and its refusal token is preserved", async () => {
  const planted = await plantItem(
    { client: world.clients.A2, vendorName: "FA9 HISTORY SDN BHD", registration: "201801003400" }, "refused_budget");
  assert.equal(planted.outcome, "refused_budget", "a refused_budget row still INSERTS after the swap (law 6 — the past keeps its spelling forever)");
  const back = await rootQuery(
    "select outcome, refusal_token->>'reason' as reason from clara.sweep_run_items where run_id=$1 and filing_id=$2",
    [planted.run_id, planted.filing_id]);
  assert.equal(back.rows[0].outcome, "refused_budget", "and it reads back UNCHANGED — nothing rewrote history");
  assert.equal(back.rows[0].reason, "refused_budget", "including its refusal token's own reason");
});

test("[C.13] reconcile_sweep_runs buckets BOTH spellings into refused_count — a renamed string may not silently vanish from a visible summary (law 22)", async () => {
  const src = await rootQuery(
    "select prosrc from pg_proc where oid='clara.reconcile_sweep_runs()'::regprocedure");
  const code = src.rows[0].prosrc.replace(/--[^\n]*/g, "");
  assert.match(code, /outcome in \('refused_budget','refused_concurrency','refused_attempts'\)/,
    "the refused_count bucket names all three refusal spellings; without refused_concurrency a finalized run would under-total against expected_count");
});

// BEHAVIOURAL half of the cell above. The prosrc match proves the bucket was EDITED; only
// the arithmetic proves it WORKS — and under-totalling is the whole defect, so the sum is
// the assertion (the shape f-a2-posted-chain.test.mjs:357-359 uses for `posted`).
test("[C.13-b] BEHAVIOURAL: a finalized run carrying a refused_concurrency item totals drafted+skipped+refused+posted = expected_count", async () => {
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const run = await openSweepRun({ firm, expected: 2 });
  await plantItem({ client, vendorName: "FA9 RECON A SDN BHD", registration: "201801003500", run }, "refused_concurrency");
  await plantItem({ client, vendorName: "FA9 RECON B SDN BHD", registration: "201801003600", run }, "noop_existing");
  await reconcileSweepRuns();

  const r = await rootQuery(
    `select state, expected_count, drafted_count, skipped_count, refused_count, posted_count
       from clara.sweep_runs where id=$1`, [run]);
  const row = r.rows[0];
  assert.ok(row, "the run row exists");
  assert.equal(row.state, "finalized", `the run finalized once its two items landed (got ${JSON.stringify(row)})`);
  // THE PREMISE IS MEASURED: the refusal really did land in refused_count, not merely
  // "somewhere". Without PR-1B's bucket edit this reads 0 and the total below is short by
  // exactly one — a refusal the operator's summary would have silently dropped.
  assert.equal(Number(row.refused_count), 1,
    `the refused_concurrency item is counted in refused_count (got ${JSON.stringify(row)}) — an unextended bucket counts it in NONE of the four`);
  const total = Number(row.drafted_count) + Number(row.skipped_count)
    + Number(row.refused_count) + Number(row.posted_count);
  assert.equal(total, Number(row.expected_count),
    `the four buckets total the expected count (drafted=${row.drafted_count} skipped=${row.skipped_count} refused=${row.refused_count} posted=${row.posted_count} vs expected=${row.expected_count})`);
});

// ===========================================================================
// Gates 3 + 5 — the two unattended SPEND brakes, at the body. (C.10/C.11's
// behavioural halves live in wave-a-budget / x46; these are the catalog halves.)
// ===========================================================================

test("[gates 3+5] admit_autodraft_task carries NO spend brake in executable text, and NO clara function names a dropped column", async () => {
  const src = await rootQuery(
    "select prosrc from pg_proc where oid='clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure");
  const code = src.rows[0].prosrc.replace(/--[^\n]*/g, "");
  for (const dead of ["daily_token_limit", "sweep_budget_share", "sales_admission_daily_cap",
    "refused_budget", "refused_sales_cap", "v_cap_sales", "v_used_sales"]) {
    assert.equal(code.includes(dead), false, `admit_autodraft_task still carries '${dead}' in EXECUTABLE text`);
  }
  // Closed-world, whole catalog: comment-stripped, because the migration deliberately leaves
  // comments naming the removed columns so a reader does not restore a "missing" belt.
  const stranded = await rootQuery(
    `select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.proname),'(none)') as n
       from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='clara'
        and regexp_replace(p.prosrc,'--[^\n]*','','g') ~ '(daily_token_limit|sweep_budget_share|sales_admission_daily_cap)'`);
  assert.equal(stranded.rows[0].n, "(none)",
    `a clara function still reads a dropped column: ${stranded.rows[0].n}. PL/pgSQL is late-bound, so this fails on the first real call, not at migrate time`);
});

test("[C.22] the 7A-R5 backfill door SURVIVED the sales quota's removal — read positively, not as an absence of complaint", async () => {
  const src = await rootQuery(
    "select prosrc from pg_proc where oid='clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure");
  const code = src.rows[0].prosrc.replace(/--[^\n]*/g, "");
  assert.ok(code.includes("sales_backlog_held"), "the sales_backlog_held refusal is still emitted — the cap went, the governance door did not");
  assert.ok(code.includes("sales_admission_watermark"), "the watermark is still read by the rewritten shared select");
  assert.ok(code.includes("sales_backfill_batches"), "the backfill-batch claim survives");
  assert.ok(code.includes("sales_lane_active"), "the 7A-R1 kill switch survives");
});

// ===========================================================================
// Gate 4 — KEPT bound, RENAMED string, with its positive control. (C.12 + M3.)
// ===========================================================================

test("[M3/C.12] the concurrency floor is KEPT, not merely renamed: ONE below the bound ADMITS, and only AT the bound does it refuse refused_concurrency", async (t) => {
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  await rootQuery(
    "insert into clara.firm_limits (firm_id, max_concurrent_sweeps) values ($1,2) on conflict (firm_id) do update set max_concurrent_sweeps=2", [firm]);
  await rootQuery(
    "update clara.sweep_runs set state='finalized', window_ended_at=now(), finalized_at=now() where firm_id=$1 and state='open'", [firm]);

  // POSITIVE CONTROL first: one other open run, cap 2 → the caller's own run is excluded
  // (0048's F5 fix), so exactly one OTHER is open, which is BELOW the bound. Must ADMIT.
  await openSweepRun({ firm, expected: 1 });
  const ownRunOk = await openSweepRun({ firm, expected: 1 });
  const rfOk = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "FA9 UNDERCAP SDN BHD", registration: "201801003100" });
  const ok = await admitAutodraft({ filing: rfOk.filingId, origin: ORIGIN.sweep, runId: ownRunOk, reserveTokens: WA_DEFAULTS.reserveTokens });
  if (outcomeOf(ok) === "lane_changed") { noteLane("M3 positive control: lane_changed — READY not reached"); t.diagnostic("control skipped"); return; }
  assert.equal(outcomeOf(ok), "admitted",
    `BELOW the bound the admission proceeds (got ${JSON.stringify(ok)}) — without this control, "it refuses" could be an unconditional refusal`);

  // Now AT the bound: a SECOND genuinely-other open run.
  await openSweepRun({ firm, expected: 1 });
  const ownRunNo = await openSweepRun({ firm, expected: 1 });
  const rfNo = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "FA9 ATCAP SDN BHD", registration: "201801003200" });
  const no = await admitAutodraft({ filing: rfNo.filingId, origin: ORIGIN.sweep, runId: ownRunNo, reserveTokens: WA_DEFAULTS.reserveTokens });
  if (outcomeOf(no) === "lane_changed") { noteLane("M3 refusal arm: lane_changed — READY not reached"); return; }
  assert.equal(outcomeOf(no), "refused_concurrency", `AT the bound the admission is refused (got ${JSON.stringify(no)})`);
  assert.equal(no?.reason, "refused_concurrency", "the returned reason is renamed in lockstep with the outcome");
  const item = await rootQuery(
    "select outcome, refusal_token->>'gate' as gate from clara.sweep_run_items where run_id=$1 and filing_id=$2",
    [ownRunNo, rfNo.filingId]);
  assert.equal(item.rows[0]?.outcome, "refused_concurrency", "the item row carries the renamed outcome");
  assert.equal(item.rows[0]?.gate, "concurrency",
    "and the token's own gate discriminator still says CONCURRENCY — spelling is not identity, so the gate is read from the discriminator, never inferred from the string");
});

// ===========================================================================
// Gate 7 — REMOVED at BOTH arms, with gate 6 as the negative control. (M4.)
// ===========================================================================

test("[gate 7] BOTH processing-call reservation verbs are free of the per-UTC-day page budget, and both keep their meter", async () => {
  for (const sig of ["clara._reserve_processing_call(uuid,integer)", "clara._settle_processing_call(uuid,integer)"]) {
    const src = await rootQuery("select prosrc from pg_proc where oid=$1::regprocedure", [sig]);
    const code = src.rows[0].prosrc.replace(/--[^\n]*/g, "");
    assert.equal(code.includes("pages_per_day"), false,
      `${sig} still reads firm_document_limits.pages_per_day — leaving the settle arm would RELOCATE the brake to after the vendor pages were bought, not remove it`);
    assert.equal(/\bv_limit\b/.test(code), false, `${sig} still declares or reads v_limit`);
    assert.ok(code.includes("pg_advisory_xact_lock(203005001"),
      `${sig} keeps its advisory rung — 0041 tail 13(c)'s census pins this as the ONE key reachable under the fa-roles leaf`);
  }
  const res = await rootQuery("select prosrc from pg_proc where oid='clara._reserve_processing_call(uuid,integer)'::regprocedure");
  assert.ok(res.rows[0].prosrc.includes("insert into clara.processing_call_reservations"),
    "the METER survives: the reservation row is still written");
  const set = await rootQuery("select prosrc from pg_proc where oid='clara._settle_processing_call(uuid,integer)'::regprocedure");
  assert.ok(set.rows[0].prosrc.includes("state='settled',settled_pages=p_pages"),
    "and the settle arm still RECORDS the actual pages");
});

// BEHAVIOURAL half of the cell above, and the one that matters most in this PR: the settle
// arm is the body the DESIGN DOES NOT NAME, added on a measurement, so proving it by
// `prosrc does not contain "pages_per_day"` alone would be text-only evidence for the one
// decision a reviewer is most entitled to see executed.
//
// THE FIXTURE IS THE PRE-F-A9 FAILURE MODE, STAGED EXACTLY. Reserve 5 pages under a
// generous bound (so the RESERVE side is not what is under test), then squeeze
// `pages_per_day` to 1 — legal, the column carries a `> 0` CHECK — and settle those same 5.
// Before this PR that settle raised CLR18 'actual processing-call pages exceed daily limit':
// the pages were already bought and the reservation could then neither settle nor be
// retried. That is the stranded-reservation state removing only the reserve arm would have
// created, which is why gate 7's REMOVE takes both arms.
test("[gate 7-b] BEHAVIOURAL: pages RESERVED under a generous bound still SETTLE after the bound is squeezed below them — the brake's back half is gone, the meter is not", async () => {
  const client = world.clients.A1;
  const firm = await firmOf(client);
  await primeReadyFiling(world.users.alice, { client, vendorName: "FA9 SETTLE SDN BHD", registration: "201801003700" });
  const doc = await rootQuery(
    `select d.id from clara.documents d
      where d.firm_id=$1
        and not exists (select 1 from clara.document_processing_tasks t
                         where t.document_id=d.id and t.lane='invoice_facts'
                           and t.status in ('queued','held_egress','running'))
      limit 1`, [firm]);
  assert.equal(doc.rowCount, 1, "mandatory setup: a document of the firm with no live invoice_facts task");
  const prior = await rootQuery("select pages_per_day from clara.firm_document_limits where firm_id=$1", [firm]);
  let task = null;
  try {
    await rootQuery(
      `insert into clara.firm_document_limits(firm_id, pages_per_day) values ($1, 1000)
         on conflict (firm_id) do update set pages_per_day = 1000`, [firm]);
    const v = await rootQuery(
      "select coalesce(max(version_n),0)+1 as v from clara.document_processing_tasks where document_id=$1 and lane='invoice_facts'",
      [doc.rows[0].id]);
    task = (await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,version_n,lane,status)
       values($1,$2,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,$3,'invoice_facts','queued') returning id`,
      [firm, doc.rows[0].id, v.rows[0].v])).rows[0].id;

    // (1) RESERVE 5 under the generous bound, and read the row back — "the settle worked"
    // would also be satisfied by a reservation that never existed.
    const reserved = await caught(() => rootQuery("select clara._reserve_processing_call($1,5)", [task]));
    assert.equal(reserved, null, `the reserve succeeds under a generous bound (got ${reserved?.code}: ${reserved?.message})`);
    const before = await rootQuery(
      "select state, pages_reserved, settled_pages from clara.processing_call_reservations where task_id=$1", [task]);
    assert.equal(before.rowCount, 1, "the reservation row exists");
    assert.equal(before.rows[0].state, "reserved", `and it is un-settled going in (got ${JSON.stringify(before.rows[0])})`);
    assert.equal(Number(before.rows[0].pages_reserved), 5, "reserving exactly the 5 pages the settle will claim");

    // (2) SQUEEZE the bound below what is already reserved. This is the pre-F-A9 refusal's
    // exact precondition: the day's total (>= 5) now exceeds pages_per_day (1).
    await rootQuery("update clara.firm_document_limits set pages_per_day = 1 where firm_id=$1", [firm]);
    const cap = await rootQuery("select pages_per_day from clara.firm_document_limits where firm_id=$1", [firm]);
    assert.equal(Number(cap.rows[0].pages_per_day), 1, "the firm's page cap really is squeezed below the reservation");

    // (3) SETTLE the same 5. Pre-F-A9 this raised CLR18 and stranded the reservation.
    const settled = await caught(() => rootQuery("select clara._settle_processing_call($1,5)", [task]));
    assert.equal(settled, null,
      `the settle is NOT refused past the (removed) page budget — got ${settled?.code}: ${settled?.message}. A CLR18 here is gate 7's back half still enforcing, i.e. the brake relocated to after the vendor pages were bought`);
    const after = await rootQuery(
      "select state, settled_pages from clara.processing_call_reservations where task_id=$1", [task]);
    assert.equal(after.rows[0].state, "settled", `the reservation reaches 'settled' (got ${JSON.stringify(after.rows[0])})`);
    assert.equal(Number(after.rows[0].settled_pages), 5,
      "and it RECORDS all five actual pages — the meter survives the brake's removal");
  } finally {
    if (task) {
      await rootQuery("delete from clara.processing_call_reservations where task_id=$1", [task]).catch(() => {});
      await rootQuery("delete from clara.document_processing_tasks where id=$1", [task]).catch(() => {});
    }
    if (prior.rowCount === 0) {
      await rootQuery("delete from clara.firm_document_limits where firm_id=$1", [firm]).catch(() => {});
    } else {
      await rootQuery("update clara.firm_document_limits set pages_per_day=$2 where firm_id=$1",
        [firm, prior.rows[0].pages_per_day]).catch(() => {});
    }
  }
});

test("[M4] MUTANT/negative control: gate 6 (_reserve_document_ingest) STILL refuses CLR18 at its own docs bound — the removal was surgical, not a deletion of CLR18", async () => {
  const src = await rootQuery(
    "select prosrc from pg_proc where oid='clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)'::regprocedure");
  const code = src.rows[0].prosrc.replace(/--[^\n]*/g, "");
  assert.ok(code.includes("docs_per_day"), "gate 6 still reads docs_per_day — owner-ruled KEEP, re-classified engine protection");
  assert.ok(code.includes("pages_per_day"), "gate 6 still reads pages_per_day");
  assert.ok(code.includes("CLR18"), "gate 6 still raises CLR18");

  // BEHAVIOURAL: drive the firm's docs bound to its own consumed count and prove the refusal
  // still fires. pages/docs_per_day carry `> 0` CHECKs, so the bound is staged the way
  // production reaches it — a legal cap the day's reservations have already consumed.
  const firm = await firmOf(world.clients.A2);
  const prior = await rootQuery("select docs_per_day, pages_per_day from clara.firm_document_limits where firm_id=$1", [firm]);
  const intakeA = await plantIntake(firm, world.users.alice);
  const intakeB = await plantIntake(firm, world.users.alice);
  try {
    // Count what the firm's own UTC-day ledger already holds, then set the bound to
    // consumed+1 — docs_per_day carries a `> 0` CHECK, so "no budget left" is staged the way
    // production reaches it: a legal cap the day's reservations have already consumed.
    const used = Number((await rootQuery(
      `select count(*)::int as n from clara.document_ingest_reservations
        where firm_id=$1 and state <> 'refunded'
          and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')`, [firm])).rows[0].n);
    await rootQuery(
      `insert into clara.firm_document_limits(firm_id, docs_per_day) values ($1, $2)
         on conflict (firm_id) do update set docs_per_day = $2`, [firm, used + 1]);
    // POSITIVE CONTROL: the last allowed doc still reserves. Without it, the refusal below
    // could be an unconditional CLR18 from some other arm of the same body.
    const first = await caught(() => rootQuery(
      "select clara._reserve_document_ingest($1,$2,1,now()+interval '1 hour')", [firm, intakeA]));
    assert.equal(first, null, `the LAST allowed ingest reservation still succeeds (got ${first?.code}: ${first?.message})`);
    const second = await caught(() => rootQuery(
      "select clara._reserve_document_ingest($1,$2,1,now()+interval '1 hour')", [firm, intakeB]));
    assert.ok(second, "a reservation PAST docs_per_day must still be refused — gate 6 is the owner's KEEP");
    assert.equal(second.code, "CLR18", `and it refuses with CLR18 (got ${second.code}: ${second.message})`);
    assert.match(second.message, /document daily limit reached/, `naming the document daily limit (got ${second.message})`);
  } finally {
    if (prior.rowCount === 0) {
      await rootQuery("delete from clara.firm_document_limits where firm_id=$1", [firm]).catch(() => {});
    } else {
      await rootQuery("update clara.firm_document_limits set docs_per_day=$2, pages_per_day=$3 where firm_id=$1",
        [firm, prior.rows[0].docs_per_day, prior.rows[0].pages_per_day]).catch(() => {});
    }
    await rootQuery("delete from clara.document_ingest_reservations where firm_id=$1 and intake_id = any($2::uuid[])", [firm, [intakeA, intakeB]]).catch(() => {});
    await rootQuery("delete from clara.document_intakes where id = any($1::uuid[])", [[intakeA, intakeB]]).catch(() => {});
  }
});

test("[gate 7] the surviving pages_per_day readers are EXACTLY gate 6's KEPT family plus the limits trigger and settle_ingest_reservation — a closed-world census, both directions", async () => {
  const r = await rootQuery(
    `select coalesce(string_agg(p.proname, ', ' order by p.proname),'(none)') as n
       from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='clara' and regexp_replace(p.prosrc,'--[^\n]*','','g') like '%pages\\_per\\_day%'`);
  assert.equal(r.rows[0].n,
    "_reserve_document_ingest, _resize_document_reservation, _settle_document_reservation, _tf_firm_document_limits_upsert, settle_ingest_reservation",
    `the pages_per_day readers moved: ${r.rows[0].n}. A NEW name here is an unclassified live usage gate; a MISSING one is a KEPT bound that was removed by accident`);
});

// ===========================================================================
// DDL 2 — the column drop, and the late-binding trap. (M5.)
// ===========================================================================

test("[M5] MUTANT: writing a dropped firm_limits column RAISES 42703, and the six survivors still accept a write", async () => {
  const firm = await firmOf(world.clients.A1);
  for (const dead of ["daily_token_limit", "sweep_budget_share", "sales_admission_daily_cap"]) {
    const e = await caught(() => rootQuery(`update clara.firm_limits set ${dead} = 1 where firm_id=$1`, [firm]));
    assert.ok(e, `writing clara.firm_limits.${dead} must fail — the column is dropped`);
    assert.equal(e.code, "42703", `and it fails as undefined_column, not as something else (got ${e.code}: ${e.message})`);
  }
  // POSITIVE CONTROL: the survivors are genuinely writable, so the three failures above are
  // about the COLUMNS and not about the statement, the role, or the row's absence.
  const ok = await rootQuery(
    `insert into clara.firm_limits(firm_id, max_concurrent_runs, max_concurrent_sweeps, sales_lane_active, sales_admission_watermark)
     values($1, 3, 2, false, null)
     on conflict (firm_id) do update set max_concurrent_runs=3, max_concurrent_sweeps=2
     returning max_concurrent_runs, max_concurrent_sweeps, sales_lane_active`, [firm]);
  assert.equal(Number(ok.rows[0].max_concurrent_runs), 3, "max_concurrent_runs is still writable");
  assert.equal(Number(ok.rows[0].max_concurrent_sweeps), 2, "max_concurrent_sweeps is still writable");
});

test("[§3.4] the three single-column CHECKs FELL WITH their columns, ck_firm_limits_max_concurrent_sweeps did not, and firm_document_limits is untouched", async () => {
  const cons = await rootQuery(
    `select conname from pg_constraint where conrelid='clara.firm_limits'::regclass order by conname`);
  const names = cons.rows.map((r) => r.conname);
  for (const gone of ["firm_limits_daily_token_limit_check", "ck_firm_limits_sweep_budget_share", "ck_firm_limits_sales_admission_daily_cap"]) {
    assert.equal(names.includes(gone), false, `${gone} survived its column — DROP COLUMN removes a single-column CHECK, so a survivor means the column did not really go`);
  }
  assert.ok(names.includes("ck_firm_limits_max_concurrent_sweeps"), `ck_firm_limits_max_concurrent_sweeps is explicitly untouched by §3.4 (present: ${names.join(", ")})`);
  const fdl = await rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name='firm_document_limits' order by column_name");
  assert.deepEqual(fdl.rows.map((r) => r.column_name),
    ["docs_per_day", "firm_id", "llm_witness_concurrency", "ocr_concurrency", "pages_per_day", "updated_at", "updated_by"],
    "no column of firm_document_limits is dropped by F-A9 — gates 6 and 8 are KEEPs");
});

// ===========================================================================
// The roster consequence, measured with the census's OWN instrument.
// ===========================================================================

test("[roster] _reserve_processing_call LEFT the S5.25 bare-clock set; _settle_processing_call and admit_autodraft_task did NOT — measured, never predicted", async () => {
  const re = "\\m(now\\(\\)|current_timestamp\\M|localtimestamp\\M|clock_timestamp\\(\\)|statement_timestamp\\(\\)|transaction_timestamp\\(\\))";
  const flags = async (sig) => {
    const r = await rootQuery(
      `select lower(regexp_replace(regexp_replace(regexp_replace(
                coalesce(p.prosrc,'')||coalesce(pg_get_functiondef(p.oid),''),
                '/\\*[\\s\\S]*?\\*/','','g'),'--[^\n]*','','g'),'\\s+',' ','g')) ~* $2 as f
         from pg_proc p where p.oid=$1::regprocedure`, [sig, re]);
    return r.rows[0].f;
  };
  assert.equal(await flags("clara._reserve_processing_call(uuid,integer)"), false,
    "_reserve_processing_call no longer reads a bare clock token — its two now() reads were inside the removed page budget, which is why this PR's roster edit moves the name behind a reverse gate");
  assert.equal(await flags("clara._settle_processing_call(uuid,integer)"), true,
    "_settle_processing_call STILL reads one (settled_at=now()) — it stays on the roster, and asserting that here is what stops a silent roster over-reach");
  assert.equal(await flags("clara.admit_autodraft_task(uuid,text,uuid,text,bigint)"), true,
    "admit_autodraft_task STILL reads one (v_today survives on the reserve write and autodraft_attempts.usage_date) — it stays on the roster too");
});
