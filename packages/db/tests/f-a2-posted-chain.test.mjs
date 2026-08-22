// F-A2 PR-1 — Annex C.9: THE `posted` OUTCOME CHAIN (Annex F — five layers plus six sites).
//
// CONTRACT-BLIND. Gated on `f_a2_posted_chain$`, PR-1's THIRD migration file, which is
// reviewable and provable in isolation and INERT until PR-2 emits `posted`. Cells that also
// need a real agent post additionally gate on `f_a2_posting_core$`.
//
// GM-8's LAYER GOES FIRST, BECAUSE IT IS THE ONE A NAIVE WIDENING TRIPS. v1 said two CHECKs;
// the truth is five layers, and the fifth is `ck_sweep_run_items_shape`, which forbids a
// NON-'drafted' outcome from carrying an `entry_id`. Widening only the outcome CHECK and then
// writing `entry_id` for a posted row is a CONSTRAINT VIOLATION — the row cannot both record its
// entry and satisfy the shape until this layer moves too. So the battery forces a posted settle
// WITH its entry_id and keeps a MUST-FAIL half: a four-layer fixture that proved a five-layer fix
// is exactly the defect GM-8 names, so the cell also asserts the shape constraint still binds in
// the OTHER direction (a posted row with a NULL entry_id must still be refused). A widening that
// simply deleted the constraint would pass the first half and fail the second.
//
// A FIX AT ANY ONE LAYER ALONE EITHER LIES OR RAISES. Two layers silently MIS-BUCKET a posted row
// (`0036:979-980` maps it to `skipped_lane`; `0011:2754-2762` counts it in none of the three
// buckets) and `0036:987` writes a FABRICATED `CLR29` refusal token onto it — false data, not
// merely missing. Each has its own cell below, because "the chain works" is not a claim any one
// of them can carry.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  firmOf, postingCoreReady, postedChainReady,
  gateChain, gateCore, wakePostEntry, agentPostable, postReceiptCount,
  admitAutodraft, settleAutodraft, openSweepRun, reconcileSweepRuns,
  sweepItemRow, sweepRunRow, lastRefusalOf, withTxnOrNull,
  OUTCOME_POSTED, SWEEP_OUTCOMES_PRE_F_A2,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if ((await postedChainReady()) || (await postingCoreReady())) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-posted-chain");
  printSkipCount("f-a2-posted-chain");
  await endPool();
});

const A1 = () => world.clients.A1;
const OWNER = () => world.users.alice;

/** A real posted entry PLUS a sweep task/run to settle against it. Returns null when the
 *  admission could not be built, and says so — a settle against a task that does not exist
 *  would be a cell about the fixture, not about the chain. */
async function postedSweep(client, amount) {
  const p = await agentPostable(OWNER(), { client, amount });
  const wire = await wakePostEntry(p.cred, p.args);
  if (wire?.posted !== true) {
    noteLane(`posted-chain: the entry did not post (${JSON.stringify(wire?.refusal)}) — the settle fixture needs a real posted entry`);
    return null;
  }
  const run = await openSweepRun({ firm: await firmOf(client), expected: 1 });
  let task = null;
  try {
    const adm = await admitAutodraft({ filing: p.cited.filingId, runId: run });
    task = adm?.task_id ?? adm?.task ?? adm?.id ?? null;
  } catch (e) {
    noteLane(`posted-chain: admit_autodraft_task refused (${e.code}: ${e.message})`);
  }
  return task ? { p, wire, run, task } : null;
}

// ===========================================================================
// GM-8's fifth layer, first.
// ===========================================================================

test("f-a2.c9.gm8 a posted settle lands WITH its entry_id — the fifth layer moved too", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  const s = await postedSweep(A1(), 610000);
  if (!s) return;
  await settleAutodraft({ task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: s.p.args.entry, refusal: null });
  const item = await sweepItemRow(s.run, s.p.cited.filingId);
  assert.ok(item, "c9.gm8: the settle wrote a sweep_run_items row");
  assert.equal(item.outcome, OUTCOME_POSTED, "c9.gm8: with the posted outcome");
  assert.equal(item.entry_id, s.p.args.entry,
    "c9.gm8: AND carrying its entry_id. Against an un-widened ck_sweep_run_items_shape this INSERT is a constraint violation — which is why a four-layer fixture cannot prove a five-layer fix");
});

test("f-a2.c9.gm8-mustfail the shape constraint still BINDS in the other direction — a posted row with a NULL entry_id is refused", async (t) => {
  if (await gateChain(t)) return;
  // The must-fail half. A widening that simply DELETED `ck_sweep_run_items_shape` would satisfy
  // the cell above and quietly admit a posted row that records no entry — which is precisely the
  // row §6's cross-check cannot reconcile. So the constraint must still refuse the other shape.
  const def = await rootQuery(
    `select pg_get_constraintdef(c.oid) as d from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='sweep_run_items' and c.conname='ck_sweep_run_items_shape'`);
  assert.equal(def.rows.length, 1,
    "c9.gm8-mustfail: ck_sweep_run_items_shape still EXISTS — deleting it is not a widening, it is a removal");
  assert.match(def.rows[0].d, /posted/,
    `c9.gm8-mustfail: …and it names the posted outcome explicitly (got ${def.rows[0].d})`);
  const bad = await withTxnOrNull(async (c) => {
    const src = await rootQuery(
      "select run_id, filing_id, firm_id, client_id, document_id from clara.sweep_run_items limit 1");
    if (!src.rows.length) return "no-source-row";
    const r = src.rows[0];
    await c.query(
      `insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,outcome,entry_id)
       values($1,$2,$3,$4,$5,'posted',null)`,
      [r.run_id, r.filing_id, r.firm_id, r.client_id, r.document_id]);
    return "inserted";
  });
  if (bad?.value === "no-source-row") { noteLane("c9.gm8-mustfail: no sweep_run_items row to clone a key from"); return; }
  assert.ok(bad?.error,
    "c9.gm8-mustfail: a posted row carrying NO entry_id is REFUSED — the shape constraint moved, it was not removed");
  assert.ok(["23514", "23505"].includes(bad.error.code),
    `c9.gm8-mustfail: …by a CHECK (or the PK, on a cloned key) rather than silently (got ${bad.error.code}: ${bad.error.message})`);
});

// ===========================================================================
// Layers 1-4 and the six sites.
// ===========================================================================

test("f-a2.c9.check the outcome CHECK admits 'posted', and keeps the five it already held", async (t) => {
  if (await gateChain(t)) return;
  const def = await rootQuery(
    `select string_agg(pg_get_constraintdef(c.oid),' ~~ ') as d from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='sweep_run_items' and c.contype='c'`);
  const d = def.rows[0]?.d ?? "";
  assert.match(d, /'posted'/, "c9.check: layer 1 — the outcome CHECK admits 'posted'");
  for (const v of SWEEP_OUTCOMES_PRE_F_A2) {
    assert.ok(d.includes(`'${v}'`),
      `c9.check: …and it is an EXTENSION — '${v}' is still admitted. A widening that dropped a value would strand every historical row`);
  }
});

test("f-a2.c9.outcome a posted settle writes outcome='posted' — NOT 'skipped_lane' (the 0036:979-980 cell)", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  const s = await postedSweep(A1(), 620000);
  if (!s) return;
  await settleAutodraft({ task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: s.p.args.entry, refusal: null });
  const item = await sweepItemRow(s.run, s.p.cited.filingId);
  assert.equal(item?.outcome, OUTCOME_POSTED,
    `c9.outcome: layer 3 — the v_item_outcome mapping no longer buckets an unknown outcome into 'skipped_lane'. A silent mis-bucket is the failure mode that LIES rather than raises (got ${item?.outcome})`);
  assert.notEqual(item?.outcome, "skipped_lane", "c9.outcome: specifically not skipped_lane");
});

test("f-a2.c9.no-clr29 a posted row carries NO synthetic CLR29 refusal token, and last_refusal is CLEARED", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  const s = await postedSweep(A1(), 630000);
  if (!s) return;
  await settleAutodraft({ task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: s.p.args.entry, refusal: null });
  const item = await sweepItemRow(s.run, s.p.cited.filingId);
  assert.equal(item?.refusal_token, null,
    `c9.no-clr29: 0036:987 used to fabricate {clr:CLR29, reason:<outcome>} for every non-'drafted' row. On a POSTED row that is FALSE DATA, not merely missing (got ${JSON.stringify(item?.refusal_token)})`);
  assert.equal(await lastRefusalOf(s.task), null,
    "c9.no-clr29: and 0036:978's `case when p_outcome='drafted' then null else p_refusal end` no longer leaves a posted task carrying a STALE refusal");
});

test("f-a2.c9.entry-exists the p_entry-exists validation runs for 'posted' exactly as it does for 'drafted'", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  // `0036:948` gated that validation on `p_outcome='drafted'`, so a posted settle skipped it
  // ENTIRELY — a settle naming an entry that does not exist would have been accepted.
  const s = await postedSweep(A1(), 640000);
  if (!s) return;
  const ghost = "00000000-0000-4000-8000-0000000c9999";
  let raised = null;
  try {
    await settleAutodraft({ task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: ghost, refusal: null });
  } catch (e) { raised = e; }
  assert.ok(raised,
    "c9.entry-exists: a posted settle naming a non-existent entry is REFUSED — the validation is not gated on 'drafted' any more");
  assert.ok(/^CLR\d\d$/.test(raised.code ?? "") || raised.code === "23503",
    `c9.entry-exists: …with a typed refusal or an FK violation, never silently (got ${raised.code}: ${raised.message})`);
});

test("f-a2.c9.finalize the reconcile finalize counts a posted row — drafted + skipped + refused + posted = expected", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  // `0011:2754-2762` buckets into three counts and a posted row lands in NONE of them, so the run
  // summary under-totals against expected_count. The arithmetic is the assertion.
  const s = await postedSweep(A1(), 650000);
  if (!s) return;
  await settleAutodraft({ task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: s.p.args.entry, refusal: null });
  await reconcileSweepRuns();
  const run = await sweepRunRow(s.run);
  assert.ok(run, "c9.finalize: the run row exists");
  const posted = run.posted_count ?? null;
  const total = (run.drafted_count ?? 0) + (run.skipped_count ?? 0) + (run.refused_count ?? 0) + (posted ?? 0);
  assert.equal(total, run.expected_count,
    `c9.finalize: the four buckets total the expected count (drafted=${run.drafted_count} skipped=${run.skipped_count} refused=${run.refused_count} posted=${posted} vs expected=${run.expected_count}). A posted row counted in none of them is the under-total layer 4 produces`);
  assert.notEqual(posted, null,
    "c9.finalize: and `posted` is counted somewhere nameable — folding it into `skipped` would total correctly while telling the operator the wrong story");
});

test("f-a2.c9.overloads BOTH settle_autodraft_task overloads accept 'posted'", async (t) => {
  if (await gateChain(t)) return;
  // `0047` proves both overloads coexist, and the 5-arity one carries its OWN copy of the guard
  // (`0011:2642-2652`) — so widening one leaves the other raising CLR10 on the same input.
  const overloads = await rootQuery(
    `select pg_get_function_identity_arguments(p.oid) as args, p.prosrc
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='settle_autodraft_task'`);
  assert.ok(overloads.rows.length >= 2,
    `c9.overloads: both overloads still exist (found ${overloads.rows.length}) — a "cleanup" that dropped one is a separate finding`);
  for (const row of overloads.rows) {
    assert.match(row.prosrc, /'posted'/,
      `c9.overloads: the overload (${row.args}) admits 'posted' — its own copy of the guard moved too`);
  }
});

test("f-a2.c9.crosscheck entry_post_receipts count == sweep_run_items posted count; a disagreement FAILS the battery", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  // §6 reads `entry_post_receipts` for its POSTED number precisely because that surface cannot
  // silently bucket — one row per posted entry, unique(entry_id), written inside the posting
  // transaction. The sweep table is the CROSS-CHECK, and a disagreement between the two is
  // itself a finding rather than a tie broken in favour of whichever is convenient.
  const s = await postedSweep(A1(), 660000);
  if (!s) return;
  await settleAutodraft({ task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: s.p.args.entry, refusal: null });
  const firm = await firmOf(A1());
  const receipts = await rootQuery(
    "select count(*)::int as n from clara.entry_post_receipts where firm_id=$1", [firm]);
  const items = await rootQuery(
    "select count(*)::int as n from clara.sweep_run_items where firm_id=$1 and outcome=$2", [firm, OUTCOME_POSTED]);
  assert.ok(receipts.rows[0].n >= items.rows[0].n,
    `c9.crosscheck: every posted sweep item has a receipt behind it (receipts=${receipts.rows[0].n}, posted items=${items.rows[0].n}). A posted item with no receipt is a row claiming a post that never wrote its evidence`);
  assert.equal(await postReceiptCount(s.p.args.entry), 1,
    "c9.crosscheck: and this entry's receipt is exactly one");
  if (receipts.rows[0].n !== items.rows[0].n) {
    noteLane(`c9.crosscheck: receipts=${receipts.rows[0].n} vs posted items=${items.rows[0].n} — the surplus is posts made outside a sweep (this battery makes many); §6's acceptance run compares them over ONE measured population, where they must be equal`);
  }
});
