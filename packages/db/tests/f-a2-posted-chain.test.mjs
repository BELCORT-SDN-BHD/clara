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
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount,
  postingCoreReady, postedChainReady,
  gateChain, gateCore, wakePostEntry, agentPostable, postReceiptCount,
  admitAutodraft, beginAutodraft, settleAutodraft, settleAutodraft6, openSweepRun, reconcileSweepRuns,
  sweepItemRow, sweepRunRow, lastRefusalOf, withTxnOrNull,
  OUTCOME_POSTED, SWEEP_OUTCOMES_PRE_F_A2,
  ensureChart, witnessedFiling, autodraftCred, agentDraft, supplierLines, booksVersion,
  entryRow, skipHere, CHART,
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

/**
 * A sweep run + an ADMITTED task + (optionally) a real posted entry, IN THE PRODUCER'S ORDER.
 *
 * THE OLD FIXTURE WAS STRUCTURALLY UNBUILDABLE, and it took six cells down with it. It POSTED
 * FIRST and admitted afterwards — but after the post the filing holds an APPROVED entry, so
 * `_coding_lane_core` appends `already_coded` (0031:326-329 / 0015:2379-2382), `admit` answers
 * `lane_changed` with NO task_id, the helper returned null, and every `if (!s) return;` greened
 * its cell. The only C.9 cells that ever RAN were the text reads over `pg_get_constraintdef` and
 * `prosrc` — and spelling is not identity.
 *
 * THE REAL PR-2 SEQUENCE, which is also the only one that works: open the run → ADMIT the
 * lane-ready filing while it still has NO entry → begin → draft → post → settle. Every step is
 * ASSERTED, and the admit's own OUTCOME is read rather than just its task id: an admission that
 * answered `lane_changed` is exactly what used to be swallowed.
 *
 * It THROWS on any construction failure with the admit receipt inlined. Both stems are applied
 * whenever this runs, so the surface exists and a failure here is a finding, never a skip.
 */
const PRIMED = new Map();

/**
 * A vendor that already EXISTS for this client, so the sweep lane can RESOLVE it.
 *
 * MEASURED, not guessed: with a brand-new vendor name the admit answers
 * `{lane:'needs_review', outcome:'lane_changed', reasons:['vendor_unresolved']}` — the filing is
 * not lane-ready, so there is no task and every C.9 cell dies on its own setup. Priming is what
 * `primeReadyFiling` does for the legacy lane, in the witness-pair world: post one ordinary
 * entry naming the vendor, which BIRTHS it, and then every later filing that names it resolves
 * to an existing counterparty instead of proposing a birth.
 */
async function primedVendor(client) {
  if (PRIMED.has(client)) return PRIMED.get(client);
  const name = `C9 SWEEP VENDOR ${Date.now().toString(36)} SDN BHD`;
  await ensureChart(OWNER(), client);
  // THE DAILY SWEEP BUDGET IS RAISED FOR THIS FIRM, and it is a fixture accommodation stated
  // rather than hidden: `admit_autodraft_task` reserves against `firm_limits.daily_token_limit`
  // times `sweep_budget_share`, and this file opens a dozen sweeps in one run. Measured: the
  // default exhausts after three and every later admit answers `refused_budget` -- the FIXTURE
  // running out of reserve, not the chain failing. The budget gate has its own cells elsewhere;
  // nothing in C.9 asserts anything about it.
  // UPSERT, not UPDATE. Measured: most rig firms hold NO `firm_limits` row at all, so an UPDATE
  // touches nothing and `admit_autodraft_task` falls back to its own defaults — including
  // `max_concurrent_sweeps = 2`, which is what actually refused here. Each cell below opens its
  // own run and never finalises it, so the third admission onward hit the concurrent-sweep cap.
  await rootQuery(
    `insert into clara.firm_limits(firm_id, daily_token_limit, sweep_budget_share,
        max_concurrent_runs, max_concurrent_sweeps)
     values((select firm_id from clara.clients where id=$1), 100000000, 0.99, 64, 64)
     on conflict (firm_id) do update
        set daily_token_limit = greatest(coalesce(clara.firm_limits.daily_token_limit,0), 100000000),
            sweep_budget_share = greatest(coalesce(clara.firm_limits.sweep_budget_share,0), 0.99),
            max_concurrent_runs = greatest(coalesce(clara.firm_limits.max_concurrent_runs,0), 64),
            max_concurrent_sweeps = greatest(coalesce(clara.firm_limits.max_concurrent_sweeps,0), 64)`,
    [client]);
  const seed = await agentPostable(OWNER(), { client, amount: 601000, vendor: { new: { name } } });
  const wire = await wakePostEntry(seed.cred, { ...seed.args, booksVersion: await booksVersion(client) });
  if (wire?.posted !== true) {
    throw new Error(`primedVendor: the vendor-birthing post did not land (${JSON.stringify(wire?.refusal)})`);
  }
  PRIMED.set(client, name);
  return name;
}

async function postedSweep(client, amount, { post = true } = {}) {
  await ensureChart(OWNER(), client);
  const vendorName = await primedVendor(client);
  const cited = await witnessedFiling(OWNER(), { client, gross: amount, vendorName });
  const run = await openSweepRun({ firm: cited.firm, expected: 1 });

  // ONE TOKEN PER ADMIT. The daily reserve budget is real and this file opens a dozen sweeps:
  // measured, the default reservation exhausts it partway through and later admits answer
  // `refused_budget` -- a fixture running out of budget, not a finding about the chain.
  const adm = await admitAutodraft({ filing: cited.filingId, runId: run, reserveTokens: 1 })
    .catch((e) => ({ error: e }));
  if (adm?.error) throw new Error(`postedSweep: admit_autodraft_task refused (${adm.error.code}: ${adm.error.message})`);
  if (!["admitted", "re_admitted"].includes(adm?.outcome)) {
    throw new Error(`postedSweep: admit did not ADMIT — receipt ${JSON.stringify(adm)}. 'lane_changed' means the filing was already coded (the defect this ordering exists to avoid); 'refused_budget' means the fixture, not the chain, ran out of reserve`);
  }
  const task = adm?.task_id ?? adm?.task ?? adm?.id ?? null;
  if (!task) throw new Error(`postedSweep: the admit returned no task id — receipt ${JSON.stringify(adm)}`);

  // THE WORKFLOW RUN ID IS PINNED AND HANDED BACK. The 6-arity settle takes one, and a settle
  // whose id does not match the one the task BEGAN under is a different worker as far as the
  // verb is concerned -- measured: it answers without writing the item.
  const workflowRunId = `rig-c9-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const begun = await beginAutodraft({ task, workflowRunId }).catch((e) => ({ error: e }));
  if (begun?.error) throw new Error(`postedSweep: begin_autodraft_task refused (${begun.error.code}: ${begun.error.message})`);

  const cred = await autodraftCred(client);
  const draft = await agentDraft(OWNER(), cred, {
    client, cited, codingKind: "supplier_bill", lines: supplierLines(amount),
    vendor: { new: { name: vendorName } },
  });
  const args = {
    entry: draft.entry_id, expectedRevision: draft.revision_token,
    client, booksVersion: await booksVersion(client),
  };
  if (!post) return { p: { cited, cred, args }, cited, cred, draft, args, wire: null, run, task, workflowRunId };

  const wire = await wakePostEntry(cred, args);
  if (wire?.posted !== true) throw new Error(`postedSweep: the entry did not post (${JSON.stringify(wire?.refusal)})`);
  return { p: { cited, cred, args }, cited, cred, draft, args, wire, run, task, workflowRunId };
}

// ===========================================================================
// GM-8's fifth layer, first.
// ===========================================================================

test("f-a2.c9.gm8 a posted settle lands WITH its entry_id — the fifth layer moved too", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  const s = await postedSweep(A1(), 610000);
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
  // A NON-CONFLICTING KEY, so the CHECK is the only thing that can answer. The old probe cloned
  // an EXISTING row's key and then accepted 23505 — a unique violation — as proof that the
  // shape constraint refused. It is not: a PK collision fires whether or not the CHECK exists,
  // so the cell would have passed against a database with the constraint DELETED, which is the
  // precise failure it is written to catch. A fresh run id for the same firm keeps the FKs
  // satisfiable while making the key new.
  const src = await postedSweep(A1(), 615000);
  const freshRun = await openSweepRun({ firm: src.cited.firm, expected: 1 });
  const bad = await withTxnOrNull((c) => c.query(
    `insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,outcome,entry_id)
     values($1,$2,$3,$4,$5,'posted',null)`,
    [freshRun, src.cited.filingId, src.cited.firm, A1(), src.cited.documentId]));
  assert.ok(bad?.error,
    "c9.gm8-mustfail: a posted row carrying NO entry_id is REFUSED — the shape constraint moved, it was not removed");
  assert.equal(bad.error.code, "23514",
    `c9.gm8-mustfail: …by the CHECK itself, on a key that collides with nothing (got ${bad.error.code}: ${bad.error.message}). Accepting 23505 here would pass against a database with the constraint deleted`);
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
  // AND THE SIX-ARITY ONE IS CALLED, not merely grepped. A prosrc regex proves the string is in
  // the body; it says nothing about whether that overload ACCEPTS the outcome, which is the
  // claim. The 6-arity form is the one the producer calls.
  const s = await postedSweep(A1(), 670000);
  const settled = await settleAutodraft6({
    task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: s.p.args.entry, refusal: null,
    workflowRunId: s.workflowRunId,
  }).catch((e) => ({ error: e }));
  assert.ok(!settled?.error,
    `c9.overloads: the SIX-arity overload accepts a posted settle (${settled?.error?.code}: ${settled?.error?.message})`);
  const item = await sweepItemRow(s.run, s.cited.filingId);
  assert.equal(item?.outcome, OUTCOME_POSTED,
    `c9.overloads: …and writes the posted outcome through that path too (got ${item?.outcome})`);
  assert.equal(item?.entry_id, s.p.args.entry, "c9.overloads: …carrying its entry_id");
});

test("f-a2.c9.posted-needs-receipt-A a REFUSED draft settled 'posted' is REFUSED — the validator partitions by outcome (C4)", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  // C4's must-fail A. The validator widened its OUTER gate to `p_outcome in ('drafted','posted')`
  // and APPENDED a receipt disjunct while leaving `e.status='draft'` unconditional inside the
  // exists — so a Tier-B-REFUSED draft settled 'posted' was ADMITTED, `last_refusal` cleared, the
  // item recorded posted WITH an entry_id, posted_count incremented, and the task landed
  // 'completed'. After that `admit` answers `already_done` forever and the FILING IS SILENTLY
  // ABANDONED with its draft still sitting there. That is the cost, and it is not a wrong number.
  const s = await postedSweep(A1(), 680000, { post: false });
  assert.equal((await entryRow(s.args.entry))?.status, "draft",
    "c9.posted-needs-receipt-A: mandatory setup — the entry is a DRAFT");
  assert.equal(await postReceiptCount(s.args.entry), 0,
    "c9.posted-needs-receipt-A: …with NO post receipt, which is the whole shape");
  const before = await sweepRunRow(s.run);

  let raised = null;
  try {
    await settleAutodraft({ task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: s.args.entry, refusal: null });
  } catch (e) { raised = e; }
  assert.ok(raised,
    "c9.posted-needs-receipt-A: a posted settle naming a DRAFT with no receipt is REFUSED");
  assert.match(String(raised.code ?? ""), /^CLR\d\d$/,
    `c9.posted-needs-receipt-A: …with a TYPED refusal, the same shape the drafted arm gives (got ${raised.code}: ${raised.message})`);

  // THE FOUR NEGATIVES, because the damage was never the raise — it was everything that
  // happened after the admission.
  assert.equal(await sweepItemRow(s.run, s.cited.filingId), null,
    "c9.posted-needs-receipt-A: NO posted sweep item was written for that run/filing");
  assert.equal((await sweepRunRow(s.run))?.posted_count ?? 0, before?.posted_count ?? 0,
    "c9.posted-needs-receipt-A: posted_count is unmoved");
  assert.notEqual(
    (await rootQuery("select state from clara.autodraft_attempts where task_id=$1 order by id desc limit 1", [s.task])).rows[0]?.state,
    "completed",
    "c9.posted-needs-receipt-A: the task did NOT land completed — a completed task is what makes admit answer already_done and abandons the filing");
});

test("f-a2.c9.posted-needs-receipt-B an APPROVED entry with a rule id and NO receipt is refused under 'posted' (C4)", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  // C4's must-fail B. The other unconditional arm: `e.status='approved' and checked_via_rule_id
  // is not null` is the RULE-POST shape, lawful for a `drafted` settle and never evidence of a
  // post. Under the partition it must not satisfy the posted arm.
  const s = await postedSweep(A1(), 690000, { post: false });
  // A REAL rule id: the column is FK-bound, so the shape needs a live vendor_account rule, and
  // that in turn needs a live canonical vendor (CLR27 otherwise). The sweep's own primed vendor
  // is exactly one.
  const cpRow = await rootQuery(
    `select id from clara.counterparties where client_id=$1 and merged_into is null
       and retired_at is null order by id desc limit 1`, [A1()]);
  const cp = cpRow.rows[0]?.id;
  const rule = cp ? await rootQuery(
    `insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,account_code,status,
        pinned,origin,content_hash,created_by)
     values($1,$2,'vendor_account',$3,$4,'proposed',false,'authored',
        encode(sha256(convert_to($5,'UTF8')),'hex'),$6) returning id`,
    [s.cited.firm, A1(), cp, CHART.expense, `c9-ruleid-${Date.now()}`, OWNER()]).catch((e) => ({ error: e })) : null;
  const ruleId = rule?.rows?.[0]?.id ?? null;
  const forged = ruleId ? await withTxnOrNull((c) => c.query(
    `update clara.journal_entries set status='approved', checker_actor=$2, approved_at=now(),
        checked_via_rule_id=$3 where id=$1`,
    [s.args.entry, OWNER(), ruleId])) : { error: rule?.error ?? new Error("no counterparty") };
  if (forged?.error) {
    // A precondition that genuinely cannot be met exits through t.skip with the obligation
    // NAMED — never a passing note (C3).
    skipHere(t, `c9.posted-needs-receipt-B: an approved+rule-id entry could not be constructed (${forged.error.code}: ${forged.error.message}) — the C4 arm for that shape is UNPROVEN and must be re-attempted`);
    return;
  }
  assert.equal(await postReceiptCount(s.args.entry), 0,
    "c9.posted-needs-receipt-B: the forged approval carries NO receipt");
  let raised = null;
  try {
    await settleAutodraft({ task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: s.args.entry, refusal: null });
  } catch (e) { raised = e; }
  assert.ok(raised,
    "c9.posted-needs-receipt-B: a rule-posted approval is not a POST — the posted arm demands the receipt");
  assert.equal(await sweepItemRow(s.run, s.cited.filingId), null,
    "c9.posted-needs-receipt-B: …and nothing was recorded for it");
});

test("f-a2.c9.posted-drafted-unmoved the DRAFTED arm's admitted set is byte-identical — the partition extends, never narrows (C4)", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  // The differential half. A partition that fenced the draft arm could just as easily have
  // BROKEN it, and `drafted` is the arm the whole estate uses today.
  const s = await postedSweep(A1(), 700000, { post: false });
  const settled = await settleAutodraft({ task: s.task, outcome: "drafted", tokens: 10, entry: s.args.entry, refusal: null })
    .catch((e) => ({ error: e }));
  assert.ok(!settled?.error,
    `c9.posted-drafted-unmoved: the SAME draft that a posted settle refuses is still ADMITTED under 'drafted' (${settled?.error?.code}: ${settled?.error?.message})`);
  const item = await sweepItemRow(s.run, s.cited.filingId);
  assert.equal(item?.outcome, "drafted", "c9.posted-drafted-unmoved: …and records the drafted outcome");
  assert.equal(item?.entry_id, s.args.entry, "c9.posted-drafted-unmoved: …with its entry_id, exactly as before");
});

test("f-a2.c9.crosscheck entry_post_receipts count == sweep_run_items posted count; a disagreement FAILS the battery", async (t) => {
  if (await gateChain(t)) return;
  if (await gateCore(t)) return;
  // §6 reads `entry_post_receipts` for its POSTED number precisely because that surface cannot
  // silently bucket — one row per posted entry, unique(entry_id), written inside the posting
  // transaction. The sweep table is the CROSS-CHECK, and a disagreement between the two is
  // itself a finding rather than a tie broken in favour of whichever is convenient.
  const s = await postedSweep(A1(), 660000);
  await settleAutodraft({ task: s.task, outcome: OUTCOME_POSTED, tokens: 10, entry: s.p.args.entry, refusal: null });
  // `receipts >= items` was satisfied by ANY surplus, and this battery makes a large one — so
  // the inequality could not fail, and the note beside it recorded the gap as normal. Annex
  // C.9's literal estate-wide "count == count" is unimplementable for the reason that note
  // half-stated: posts made outside a sweep are real and legitimate. So the claim is split into
  // the three things that ARE true and ARE falsifiable.
  //
  // (a) EXACT EQUALITY over the population THIS cell opened.
  const scoped = await rootQuery(
    `select (select count(*)::int from clara.sweep_run_items i
              where i.run_id=$1 and i.outcome=$2) as items,
            (select count(*)::int from clara.sweep_run_items i
               join clara.entry_post_receipts r on r.entry_id=i.entry_id
              where i.run_id=$1 and i.outcome=$2) as receipted`, [s.run, OUTCOME_POSTED]);
  assert.equal(scoped.rows[0].items, 1,
    `c9.crosscheck: this run holds exactly the ONE posted item it opened (got ${scoped.rows[0].items})`);
  assert.equal(scoped.rows[0].receipted, scoped.rows[0].items,
    "c9.crosscheck: …and every one of them has its receipt — EXACT equality over a measured population, which is what §6's acceptance run computes");

  // (b) THE ESTATE-WIDE ANTI-JOIN, which IS unconditional and IS falsifiable: no posted sweep
  //     item anywhere may lack a receipt. A row claiming a post that never wrote its evidence.
  const orphans = await rootQuery(
    `select count(*)::int as n from clara.sweep_run_items i
      where i.outcome=$1
        and not exists(select 1 from clara.entry_post_receipts r where r.entry_id=i.entry_id)`,
    [OUTCOME_POSTED]);
  assert.equal(orphans.rows[0].n, 0,
    `c9.crosscheck: ZERO posted sweep items anywhere lack an entry_post_receipts row (found ${orphans.rows[0].n})`);

  // (c) …and the converse, scoped to what this run measured: no entry in this run posted
  //     without its item recording it.
  const unrecorded = await rootQuery(
    `select count(*)::int as n from clara.entry_post_receipts r
      where r.entry_id = $2
        and not exists(select 1 from clara.sweep_run_items i
                        where i.run_id=$1 and i.entry_id=r.entry_id and i.outcome=$3)`,
    [s.run, s.p.args.entry, OUTCOME_POSTED]);
  assert.equal(unrecorded.rows[0].n, 0,
    "c9.crosscheck: …and this run's posted entry is recorded by its item, so the two surfaces agree in BOTH directions");
  assert.equal(await postReceiptCount(s.p.args.entry), 1,
    "c9.crosscheck: and this entry's receipt is exactly one");
});
