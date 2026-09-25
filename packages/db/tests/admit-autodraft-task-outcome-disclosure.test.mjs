// #1132 -- clara.sweep_run_items.outcome has no admitted member, a trap for a future reader of
// clara.admit_autodraft_task (riders sweep wave, lane 07).
//
// THE SEAM IS DOCUMENTATION, NOT BEHAVIOUR. #1132's Agent Brief lists two candidate fixes: (1) a
// clear, documented place to read the real admission outcome, or (2) widening
// clara.sweep_run_items.outcome with an 'admitted' member. The lane's owner ruling (SWEEP-PLAN.md
// / the orchestrator's lane notes) takes path (1) only: a catalog COMMENT on
// clara.admit_autodraft_task, plus a packages/db/README.md section. The enum is NOT widened.
// Migration: 0349_admit_autodraft_task_outcome_disclosure.sql. Frontier-gated on its own STABLE
// STEM (`admit_autodraft_task_outcome_disclosure$`), never its number -- numbers are claimed at
// merge (packages/db/README.md), the `firm_setup_committed_tin_backfill$` idiom.
//
// THE TRAP, GROUNDED RATHER THAN MERELY ASSERTED (wave-3 addendum: "a door's behaviour is
// asserted only after it was driven"). clara.admit_autodraft_task's mint pipeline
// (packages/db/migrations/0036_wave_c0_deferred_belts.sql:1468-1470, unmoved by this file and
// re-pinned in the tail) returns through clara._finish_op on a genuine 'admitted' outcome, which
// writes ONLY clara.op_receipts -- no clara.sweep_run_items insert exists on that return arm.
// EVERY OTHER return arm the same function carries DOES insert a run-bound
// clara.sweep_run_items row under one of exactly four labels (noop_existing x4,
// refused_attempts x2, skipped_lane x3, refused_concurrency x1 -- NOT refused_budget, which the
// live body writes nowhere outside its own comments; p1132.disclosure re-derives all of this
// from the body rather than restating it) when
// p_run_id is not null. p1132.trap drives BOTH arms on the SAME filing and the SAME run --
// first a genuine 'admitted' admission (no item), then an immediate re-admission of the same
// filing on the same run, which the registry short-circuit answers 'noop_existing' (one item) --
// so the "zero rows" assertion is proven to discriminate a real difference rather than being
// vacuously true of an always-empty query (the vacuity control the WO's rule 4 asks for, done by
// contrast rather than by editing an applied migration, which this file may never do).
//
// WHAT IS UNDER TEST, one cell per acceptance criterion of #1132:
//   AC1 (the chosen path) --
//     p1132.comment.discloses_no_sweep_item_and_names_op_receipts
//     p1132.readme.section_discloses_no_sweep_item_and_names_op_receipts
//   AC2 (the NOT-chosen path, confirmed still not taken) is folded into the same grounding cell --
//   the trap itself, driven for real --
//     p1132.trap.admitted_writes_no_sweep_item_noop_does_and_the_enum_still_lacks_admitted

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIT_OUTCOMES,
  ORIGIN,
  admitAutodraft,
  buildWorld,
  endPool,
  firmOf,
  noteLane,
  openSweepRun,
  primeReadyFiling,
  printLaneNotes,
  printSkipCount,
  rootQuery,
  skipUnready,
  sweepItemRows,
  upsertAccountClassed,
  upsertPayableAccount,
  waveAEnsureReady,
} from "./wave-a-fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const README_PATH = join(HERE, "..", "README.md");
const STEM = "admit_autodraft_task_outcome_disclosure$";
const FN_SIG = "clara.admit_autodraft_task(uuid,text,uuid,text,bigint)";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 3;

/**
 * The live body of `clara.admit_autodraft_task`, LINE COMMENTS STRIPPED, reduced to the two facts
 * the #1132 disclosure claims about it. Deriving them here rather than restating them is the whole
 * point of the fix round (ADV-L07-04): the first cut of the comment named `refused_budget` — which
 * the live body writes nowhere outside its own comments — and named two success tokens where the
 * body returns three.
 *
 * WHY THE FIRST QUOTED LITERAL IN EACH `values(...)` IS THE OUTCOME: every one of the ten inserts
 * writes the column list `(run_id, filing_id, firm_id, client_id, document_id, outcome[,
 * refusal_token])`, and the first five values are identifiers (`p_run_id`, `a.filing_id`, …), never
 * literals. So the first `'…'` in the values list is the `outcome` column, and the refusal token's
 * own literals come after it.
 */
function disclosedFacts(prosrc) {
  const body = prosrc.replace(/--[^\n]*/g, "");
  const written = new Set();
  for (const m of body.matchAll(/insert\s+into\s+clara\.sweep_run_items[\s\S]*?;/gi)) {
    const values = /values\s*\(([\s\S]*)\)/i.exec(m[0]);
    const first = values && /'([a-z_]+)'/.exec(values[1]);
    if (first) written.add(first[1]);
  }
  const success = new Set();
  const caseArm = /'outcome'\s*,\s*case\b([\s\S]*?)\bend\b/i.exec(body);
  if (caseArm) for (const t of caseArm[1].matchAll(/'([a-z_]+)'/g)) success.add(t[1]);
  return { body, written: [...written].sort(), success: [...success].sort() };
}

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
async function laneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  return r.rows[0].n > 0;
}

before(async () => { ready = await laneReady(); });
after(async () => {
  if (ready) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_ADMIT_AUTODRAFT_TASK_OUTCOME_DISCLOSURE === "1") {
    console.warn(`SKIP admit-autodraft-task-outcome-disclosure: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("admit-autodraft-task-outcome-disclosure lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #1132 admission outcome disclosure is required for a focused run: apply 0349_admit_autodraft_task_outcome_disclosure.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// AC1 -- the catalog comment.
// ---------------------------------------------------------------------------------------------
cell("p1132.comment.discloses_no_sweep_item_and_names_op_receipts", async () => {
  const r = await rootQuery(
    `select obj_description($1::regprocedure, 'pg_proc') as c`, [FN_SIG]);
  const comment = r.rows[0]?.c;
  assert.ok(comment, "clara.admit_autodraft_task carries no catalogue comment at all");
  for (const token of ["sweep_run_items", "op_receipts", "#1132"]) {
    assert.ok(comment.includes(token),
      `clara.admit_autodraft_task's comment must name ${token} -- a trap nobody wrote down is a trap nobody can avoid (got: ${JSON.stringify(comment)})`);
  }
  assert.match(comment, /no[a-z ]*sweep[- _]run[- _]item|writes no .*sweep_run_items/i,
    `the comment must plainly state that a successful admission writes no sweep-run-item row (got: ${JSON.stringify(comment)})`);
});

// ---------------------------------------------------------------------------------------------
// AC1 -- THE DISCLOSURE IS MEASURED AGAINST THE BODY, NOT AGAINST ITS AUTHOR'S MEMORY.
//
// ADV-L07-04 found the first cut of this disclosure wrong in three ways at once, and every one of
// them was a claim about the body that nobody re-derived FROM the body. This cell derives the
// facts and requires the comment and the README to agree with them, so the disclosure cannot drift
// from its subject again -- which matters more here than anywhere else in this file, because the
// disclosure IS the whole deliverable of #1132.
// ---------------------------------------------------------------------------------------------
cell("p1132.disclosure.agrees_with_the_live_body", async () => {
  const src = await rootQuery(`select p.prosrc from pg_proc p where p.oid = $1::regprocedure`, [FN_SIG]);
  const { written, success } = disclosedFacts(src.rows[0].prosrc);
  const c = await rootQuery(`select obj_description($1::regprocedure, 'pg_proc') as c`, [FN_SIG]);
  const comment = c.rows[0]?.c ?? "";
  const readme = readFileSync(README_PATH, "utf8");
  const idx = readme.indexOf("## 0349");
  const nextIdx = readme.indexOf("\n## ", idx + 7);
  const section = nextIdx >= 0 ? readme.slice(idx, nextIdx) : readme.slice(idx);

  // The floors: a body that stopped writing sweep rows, or stopped returning a success CASE,
  // would make every assertion below pass over an empty set.
  assert.ok(written.length >= 3, `the live body still writes sweep_run_items outcomes (found ${JSON.stringify(written)})`);
  assert.ok(success.length >= 2, `the live body still returns a success CASE (found ${JSON.stringify(success)})`);

  for (const outcome of written) {
    assert.ok(comment.includes(outcome), `the catalog comment must name the sweep outcome ${outcome}, which the live body writes`);
    assert.ok(section.includes(outcome), `the 0349 README section must name the sweep outcome ${outcome}`);
  }
  for (const token of success) {
    assert.ok(comment.includes(token), `the catalog comment must name the success outcome ${token}, which the live body returns`);
    assert.ok(section.includes(token), `the 0349 README section must name the success outcome ${token}`);
  }

  // The other direction, which is the half the first cut got wrong: a sweep outcome the body
  // CANNOT write must not be presented as one it does. `refused_budget` is the measured case --
  // the 15-drafts/day cap that once wrote it was retired, the token survives in the column's own
  // CHECK, and the first cut of this comment listed it among the arms that write a row.
  const phantom = ["refused_budget", "drafted", "posted"].filter((o) => !written.includes(o));
  assert.ok(phantom.includes("refused_budget"), "refused_budget is still absent from the live body -- otherwise this control means nothing");
  // Only the AFFIRMATIVE sentences: the comment is required BELOW to say "never writes
  // refused_budget", which is the opposite claim and must not trip this one.
  const affirmative = comment.split(/(?<=\.)\s+/).filter((sentence) => !/\bnever writes\b/i.test(sentence)).join(" ");
  for (const o of phantom) {
    assert.equal(
      new RegExp(`writes[^.]*\\b${o}\\b`, "i").test(affirmative),
      false,
      `the catalog comment must not present ${o} as an outcome this function writes -- it does not`,
    );
  }
  assert.match(comment, /never writes refused_budget|It never writes refused_budget/i,
    "the comment must say plainly that refused_budget is NOT written, since the CHECK still carries it");

  // And the coarser-label hazard, which is the trap the ticket exists to disclose: three returned
  // outcomes are recorded under two labels.
  for (const pair of [["already_done", "noop_existing"], ["skipped_direction", "skipped_lane"], ["lane_changed", "skipped_lane"]]) {
    assert.ok(comment.includes(pair[0]), `the comment must name the returned outcome ${pair[0]}, which is recorded as ${pair[1]}`);
    assert.ok(section.includes(pair[0]), `the README section must name the returned outcome ${pair[0]}`);
  }
});

// ---------------------------------------------------------------------------------------------
// AC1 -- the README section.
// ---------------------------------------------------------------------------------------------
cell("p1132.readme.section_discloses_no_sweep_item_and_names_op_receipts", () => {
  const readme = readFileSync(README_PATH, "utf8");
  const heading = "## 0349";
  const idx = readme.indexOf(heading);
  assert.ok(idx >= 0, "packages/db/README.md carries no ## 0349 section for #1132");
  const nextHeadingIdx = readme.indexOf("\n## ", idx + heading.length);
  const section = nextHeadingIdx >= 0 ? readme.slice(idx, nextHeadingIdx) : readme.slice(idx);
  for (const token of ["admit_autodraft_task", "sweep_run_items", "op_receipts", "#1132"]) {
    assert.ok(section.includes(token), `the 0349 README section must name ${token}`);
  }
  assert.match(section, /no[a-z ]*sweep[- _]run[- _]item|writes no .*sweep_run_items/i,
    "the 0349 README section must plainly state that a successful admission writes no sweep-run-item row");
});

// ---------------------------------------------------------------------------------------------
// THE GROUNDING CELL -- not gated on 0349 at all (it tests EXISTING, unchanged behaviour that
// predates this ticket); gated on the ordinary Wave-A 0011 readiness the fixtures it calls need.
// ---------------------------------------------------------------------------------------------
let world = null;
let waveAReady = false;
before(async () => {
  waveAReady = await waveAEnsureReady();
  if (waveAReady) {
    world = await buildWorld();
    const firm = await firmOf(world.clients.A1);
    await upsertPayableAccount(world.users.alice, { client: world.clients.A1, code: "400-000", name: "Trade Creditors", opKey: `p1132-ap-${Date.now()}` });
    await upsertAccountClassed(world.users.alice, { client: world.clients.A1, code: "500-A01", name: "Prof Fees", type: "expense", opKey: `p1132-exp-${Date.now()}` });
    void firm;
  }
});
after(() => { printLaneNotes("admit-autodraft-task-outcome-disclosure"); printSkipCount("admit-autodraft-task-outcome-disclosure"); });

async function opReceiptResult(filing, origin) {
  const r = await rootQuery(
    `select result from clara.op_receipts
     where fn='admit_autodraft_task' and op_key='autodraft:'||$1::text||':'||$2`,
    [filing, origin],
  );
  return r.rows[0]?.result ?? null;
}

test("p1132.trap.admitted_writes_no_sweep_item_noop_does_and_the_enum_still_lacks_admitted", async (t) => {
  if (skipUnready(t, waveAReady)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const rf = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "P1132TRAP SDN BHD", registration: "201801016200" });

  // First admission, on run1: the genuine 'admitted' arm.
  const run1 = await openSweepRun({ firm, expected: 1 });
  const a1 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, runId: run1 });
  if (!(ADMIT_OUTCOMES.includes(a1?.outcome) && a1.outcome === "admitted")) {
    noteLane(`p1132.trap: filing did not admit (outcome=${a1?.outcome}) -- READY not reached; the ground fact is unverified this run`);
    return;
  }
  const itemsAfterAdmit = (await sweepItemRows(run1)).filter((i) => i.filing_id === rf.filingId);
  assert.equal(itemsAfterAdmit.length, 0,
    `a genuine 'admitted' outcome must write NO clara.sweep_run_items row (got ${itemsAfterAdmit.length}) -- exactly the trap #1132's documentation names`);
  const receipt = await opReceiptResult(rf.filingId, ORIGIN.sweep);
  assert.ok(receipt, "the real admission outcome must be readable from clara.op_receipts");
  assert.equal(receipt.outcome, "admitted", `clara.op_receipts carries the real outcome (got ${JSON.stringify(receipt)})`);

  // Second admission of the SAME filing, on a SECOND run: the registry short-circuit answers
  // 'noop_existing', which the same function DOES write a run-bound item for -- the contrast
  // that proves the first assertion discriminates a real difference (the vacuity control).
  const run2 = await openSweepRun({ firm, expected: 1 });
  const a2 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, runId: run2 });
  assert.equal(a2?.outcome, "noop_existing", `the second admission of an in-flight filing answers noop_existing (got ${a2?.outcome})`);
  const itemsAfterNoop = (await sweepItemRows(run2)).filter((i) => i.filing_id === rf.filingId);
  assert.equal(itemsAfterNoop.length, 1,
    `a 'noop_existing' outcome DOES write a run-bound clara.sweep_run_items row (got ${itemsAfterNoop.length}) -- the contrast arm`);
  assert.equal(itemsAfterNoop[0].outcome, "noop_existing");

  // AC2, confirmed still not taken: the enum-widening alternative the ticket's own brief offers
  // as a fallback was NOT built -- 'admitted' is still not a member of the CHECK.
  const chk = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
     where c.conrelid='clara.sweep_run_items'::regclass and c.conname='sweep_run_items_outcome_check'`);
  assert.doesNotMatch(chk.rows[0].def, /'admitted'/,
    "clara.sweep_run_items.outcome must still admit no 'admitted' member -- #1132 took the documentation path, not the enum widening");
});
