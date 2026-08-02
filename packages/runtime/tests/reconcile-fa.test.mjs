// Wave D-a — the FA depreciation sweep (lib/reconciler-fa.mjs), DB INTEGRATION. Proves the
// SWEEP WIRING end-to-end against a real 0041 database: the feature-detect finds the surface,
// clara.depreciation_run_due drives the loop, and clara.run_depreciation_period is really
// executable on a group-role (clara_runtime) connection with NO login dance — so a live leader
// cycle mints real ledger rows for a real enrolled, authorised client.
//
// The depreciation ARITHMETIC itself is exhaustively proven in packages/db/tests/x41-*.test.mjs;
// this file never re-asserts a figure the DB owns. DORMANCY on a pre-0041 database is the
// unit lane's cell (reconcile-fa-unit.test.mjs) — it needs a mock, not a second database.
//
// Env from the ENVIRONMENT (rig.mjs throws otherwise); RELAY_TEST_MODE=1; serial. Row-scoped
// assertions, NEVER TRUNCATE (the truncate/deadlock law). Every fixture object is built
// through an AUDITED verb; every date descends from the DATABASE's Asia/Kuala_Lumpur clock
// (a calendar literal would rot the moment real time crossed it — the 2026-08-01 00:10 MYT
// CI incident), and the sweep's own due arithmetic is never re-derived here.

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, asRuntime, opk, buildFirm, endPool } from "./relay-fixtures.mjs";
import { reconcileFaRuns } from "../lib/reconciler-fa.mjs";

const COST = "200-R41";
const ACCUM = "210-R41";
const EXPENSE = "900-R41";
const BANK = "100-R41";

async function probe0041() {
  const r = await rootQuery(
    "select to_regprocedure('clara.run_depreciation_period(uuid,date,date,text)') is not null as ok",
  );
  return r.rows[0]?.ok === true;
}
const HAS41 = await probe0041();
const skip = HAS41 ? false : "0041 depreciation surface absent — migrate the target first";

after(async () => {
  await endPool();
});

/** Month windows off the DATABASE's own MYT clock. n months back, as {start,end}. */
async function mytMonth(n) {
  const r = await rootQuery(
    // ::text, never a bare ::date — pg maps a date column to a JS Date at the SESSION zone,
    // and re-serialising that through JSON would silently shift the fixture a day west.
    `select ((date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur')::date) - make_interval(months => $1))::date)::text as s,
            ((date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur')::date) - make_interval(months => $1) + interval '1 month - 1 day')::date)::text as e`,
    [n],
  );
  return { start: r.rows[0].s, end: r.rows[0].e };
}

const upsertAcct = (sub, client, code, name, type) =>
  humanQuery(sub, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
    [client, code, name, type, opk("acct")]);

async function seedResolution(firm, client) {
  const r = await rootQuery(
    `insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by)
       values($1,$2,'manual',null,1.0,'human','{}'::jsonb,null) returning id`,
    [firm, client],
  );
  return r.rows[0].id;
}

/** Draft + approve an acquisition: Dr cost / Cr bank. Deliberately BELOW the firm's default
 *  RM10,000 high-stakes threshold so the single-owner rig firm can lawfully self-check it. */
async function buyAsset(sub, { client, resolution, cents, postingDate }) {
  const lines = [
    { account_code: COST, debit_cents: cents, credit_cents: 0, description: "asset cost" },
    { account_code: BANK, debit_cents: 0, credit_cents: cents, description: "paid" },
  ];
  const d = (await humanQuery(sub,
    `select clara.draft_entry(p_client=>$1,p_resolution=>$2,p_posting_date=>$3::date,p_memo=>$4,
       p_lines=>$5::jsonb,p_op_key=>$6) as r`,
    [client, resolution, postingDate, "fa sweep rig acquisition", JSON.stringify(lines), opk("draft")],
  )).rows[0].r;
  await humanQuery(sub, "select clara.approve_entry(p_entry=>$1,p_expected_revision=>$2,p_op_key=>$3) as r",
    [d.entry_id, d.revision_token, opk("appr")]);
  return d.entry_id;
}

const chargesOf = async (asset) => (await rootQuery(
  `select period_start::text as period_start, period_end::text as period_end,
          amount_cents::bigint as amount_cents, entry_id, unwind_of, is_live
     from clara.fa_depreciation where asset_id=$1 order by period_start`, [asset])).rows;

const liveCharges = async (asset) => (await chargesOf(asset)).filter((r) => r.is_live && !r.unwind_of);

const dueFor = async (client) => (await asRuntime((c) =>
  c.query("select clara.depreciation_run_due($1) as r", [client]))).rows[0].r;

test("the FA sweep runs end-to-end on a real 0041 database: feature-detect → depreciation_run_due → run_depreciation_period, under the clara_runtime GROUP role with no login dance", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("fa");
  const resolution = await seedResolution(firm, client);
  await upsertAcct(owner, client, COST, "Plant & Machinery (fa rig)", "asset");
  await upsertAcct(owner, client, ACCUM, "Accum Depreciation (fa rig)", "asset");
  await upsertAcct(owner, client, EXPENSE, "Depreciation Expense (fa rig)", "expense");
  await upsertAcct(owner, client, BANK, "Bank (fa rig)", "asset");

  // ENROL the cost account — the belt's watermark starts here, so the acquisition below is
  // the first entry the register ever sees on it.
  await humanQuery(owner,
    `select clara.upsert_fa_account_profile(p_client=>$1,p_asset_account=>$2,p_accum_account=>$3,
       p_depr_expense_account=>$4,p_op_key=>$5) as r`,
    [client, COST, ACCUM, EXPENSE, opk("enrol")]);

  const m3 = await mytMonth(3);
  const m1 = await mytMonth(1);
  await buyAsset(owner, { client, resolution, cents: 360_000, postingDate: m3.start });
  const asset = (await rootQuery(
    "select id from clara.fixed_assets where client_id=$1 order by created_at limit 1", [client])).rows[0]?.id;
  assert.ok(asset, "the approved acquisition soft-birthed a register row (the 0041 approve hook)");

  await humanQuery(owner,
    "select clara.complete_fixed_asset_particulars(p_client=>$1,p_asset=>$2,p_particulars=>$3::jsonb,p_op_key=>$4) as r",
    [client, asset, JSON.stringify({
      method: "straight_line", useful_life_months: 36, residual_cents: 0,
      start_date: m3.start, description: "fa sweep rig lathe",
    }), opk("complete")]);

  // ---- NOTHING IS DUE WITHOUT AN AUTHORITY. -------------------------------
  assert.equal((await dueFor(client)).due, false,
    "with no live signed authority the DB answers due:false — the sweep never calls into a refusal");
  const dormantSweep = await asRuntime((c) => reconcileFaRuns(c, { log: () => {} }));
  assert.equal(dormantSweep.dormant, false, "0041 IS applied here, so the feature-detect lights the belt");
  assert.equal(dormantSweep.faOk, true, "…and a whole-belt pass reports faOk");
  assert.ok(dormantSweep.faExamined >= 1, "…having examined at least this client");
  assert.equal((await liveCharges(asset)).length, 0, "…and charged NOTHING without an authority");

  // ---- THE AUTHORITY CEREMONY (propose bookkeeper+, SIGN admin+). ---------
  const proposed = (await humanQuery(owner,
    "select clara.propose_depreciation_authority(p_client=>$1,p_cadence=>$2,p_op_key=>$3) as r",
    [client, "monthly", opk("prop")])).rows[0].r;
  const authority = proposed.authority_id ?? proposed.id;
  assert.ok(authority, `propose_depreciation_authority names the authority (got ${JSON.stringify(proposed)})`);
  await humanQuery(owner,
    "select clara.sign_depreciation_authority(p_client=>$1,p_authority=>$2,p_op_key=>$3) as r",
    [client, authority, opk("sign")]);

  const due = await dueFor(client);
  assert.equal(due.due, true, "a live authority + a complete, in-service asset makes a period due");
  assert.equal(due.period_start, m3.start, "…the OLDEST unmet period (the sweep calls only that one)");
  assert.equal(due.cadence, "monthly", "…carrying the authority's cadence");

  // ---- SWEEP 1: the RAMP run. --------------------------------------------
  const lines = [];
  const first = await asRuntime((c) => reconcileFaRuns(c, { log: (m) => lines.push(m) }));
  assert.equal(first.faOk, true, "the sweep reports faOk");
  assert.equal(first.dormant, false, "…and is not dormant");
  assert.ok(first.faPosted >= 1, `…and really called the run verb (faPosted=${first.faPosted})`);
  assert.ok(lines.some((l) => l.includes(client)), `…logging this client's run (lines: ${lines.join(" | ")})`);

  const ramp = (await rootQuery(
    `select id, status, origin, flags from clara.journal_entries
      where client_id=$1 and origin='scheduled_run' order by created_at`, [client])).rows;
  assert.equal(ramp.length, 1, "ONE scheduled_run entry exists — the machine period entry");
  assert.equal(ramp[0].status, "draft", "the FIRST run under a fresh authority DRAFTS (the one-time ramp, WD-R5)");
  assert.ok(ramp[0].flags?.depreciation_charges, "…carrying the depreciation_charges proposal (contract §5)");
  assert.equal((await liveCharges(asset)).length, 0, "…and materialises NO ledger row until it is approved");
  assert.equal((await dueFor(client)).due, false,
    "while that draft is outstanding the probe answers false — draft-N blocks N+1, so the sweep idles honestly");

  // ---- THE HUMAN APPROVES; the sweep then CHAINS the remaining periods. ---
  const rev = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [ramp[0].id])).rows[0].revision_token;
  await humanQuery(owner, "select clara.approve_entry(p_entry=>$1,p_expected_revision=>$2,p_op_key=>$3) as r",
    [ramp[0].id, rev, opk("rampok")]);

  const second = await asRuntime((c) => reconcileFaRuns(c, { log: () => {} }));
  assert.equal(second.faOk, true, "the second sweep also reports faOk");
  assert.ok(second.faPosted >= 1, "…and chained the remaining overdue periods in ONE sweep");

  const charged = await liveCharges(asset);
  assert.ok(charged.length >= 3, `every ended month from the in-service month is now charged (got ${charged.length})`);
  assert.equal(charged[0].period_start, m3.start, "…starting at the in-service month");
  assert.equal(charged[charged.length - 1].period_end, m1.end,
    "…and running through the LAST ENDED month (the month in progress is never due)");
  for (let i = 1; i < charged.length; i++) {
    assert.ok(charged[i - 1].period_end < charged[i].period_start,
      `live charge ranges never overlap (${charged[i - 1].period_end} vs ${charged[i].period_start})`);
  }
  const monthly = Math.floor(360_000 / 36);
  for (const row of charged) {
    assert.equal(Number(row.amount_cents), monthly, "…each month charging the DB-computed straight-line figure");
  }

  // The books moved with the register — the sweep posts through the approve core, never
  // by writing a ledger row of its own.
  const gl = (await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as n from clara.journal_lines l
       join clara.journal_entries e on e.id = l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved'`, [client, EXPENSE])).rows[0].n;
  assert.equal(Number(gl), monthly * charged.length, "the depreciation expense GL carries exactly what the register says");

  // ---- SWEEP 3: caught up ⇒ a clean no-op, nothing double-charged. --------
  assert.equal((await dueFor(client)).due, false, "a caught-up client makes nothing due");
  const third = await asRuntime((c) => reconcileFaRuns(c, { log: () => {} }));
  assert.equal(third.faOk, true, "a caught-up sweep still reports faOk");
  assert.equal((await liveCharges(asset)).length, charged.length,
    "…and charges NOTHING a second time (the sweep is idle, not repetitive)");
});
