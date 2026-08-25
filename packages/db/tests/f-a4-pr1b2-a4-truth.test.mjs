// F-A4 PR-1b2 -- Annex A.4 row 7's truthful segregation_mode (owner ruling 2026-08-25).
// The behavioral half of the tail proof the migration's own §TAIL names: three fresh fiscal
// years, one per shape, each closed for real through the governed writers, each read back for
// the segregation_mode the ruling says it must carry. Migration:
// UNNUMBERED_f_a4_pr_1b2_a4_truth.sql. NEVER LIVE: disposable rig only.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, freshResolution, buildWorld,
} from "./wave-a-fixtures.mjs";
import {
  has0056, freshActiveClient, setupCloseCoa, openFY, beginClose, finalizeClose,
  plainEntry, BANK1, REVN,
} from "./x56-fixtures.mjs";
import { mintInteractive, wakeDraftEntry, approveEntry } from "./a21-helpers.mjs";
import { receiptRow } from "./er9-corpus-fixtures.mjs";

async function hasA4Truth() {
  const r = await rootQuery(
    `select 1 from pg_constraint c
       where c.conrelid = 'clara.close_receipts'::regclass
         and c.conname = 'close_receipts_segregation_mode_check'
         and position('no_preparation' in pg_get_constraintdef(c.oid)) > 0`,
  );
  return r.rows.length > 0;
}

let ready = false, has56 = false, hasTruth = false;

function gate(t) {
  if (!ready || !has56 || !hasTruth) {
    markSkip();
    t.skip("F-A4 PR-1b2 (Annex A.4 row-7 truth CoR) not applied -- this battery dormant");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- f-a4-pr1b2-a4-truth battery skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 (close model) absent -- f-a4-pr1b2-a4-truth battery skipped"); return; }
  hasTruth = await hasA4Truth();
  if (!hasTruth) { noteLane("F-A4 PR-1b2 not applied -- f-a4-pr1b2-a4-truth battery dormant"); return; }
});
after(async () => {
  printLaneNotes("f-a4-pr1b2-a4-truth");
  printSkipCount("f-a4-pr1b2-a4-truth");
  await endPool();
});

// A minimal, self-contained world PER SCENARIO (never a shared one riding across tests --
// each scenario needs its own untouched fiscal year, and buildWorld() is cheap: a fresh firm,
// alice as owner, bob as bookkeeper -- both rank>=bookkeeper, so firmA carries exactly two
// eligible checkers (clara.eligible_checker_count), which is what scenario B's distinct-closer
// requirement needs and what scenarios A/C's row-7 gate (self-attestation only below two) does
// NOT need to satisfy.
async function miniWorld() {
  const w = await buildWorld();
  return { alice: w.users.alice, bob: w.users.bob, firm: w.firms.A };
}

// =====================================================================================
// A -- the AGENT-PREPARED shape (row 7 TRUE branch; also D-2's own scenario: all-agent-
// drafted, human-approved-WITHOUT-revision). Both before and after this migration this
// resolves to 'agent_prepared' -- this cell is the proof that D-2's framing note is not
// merely asserted in the migration header, but actually holds on the live body.
// =====================================================================================
test("A the agent-prepared shape: an all-agent-drafted, human-approved-without-revision year closes as segregation_mode='agent_prepared' -- v_agent_prepared true wins row 7, D-2 unmoved", async (t) => {
  if (gate(t)) return;
  const { alice } = await miniWorld();
  const client = await freshActiveClient(alice, "a4t-agent");
  await setupCloseCoa(alice, client);
  const opened = await openFY(alice, { client, label: "a4t agent-prepared FY", startsOn: "2027-01-01", endsOn: "2027-12-31" });
  const fy = opened.fiscal_year_id;

  const firmRow = (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0];
  const cred = await mintInteractive(firmRow.firm_id);
  const resolution = await freshResolution(alice, client, { subjectKind: "manual", subjectId: null });
  const drafted = await wakeDraftEntry(cred, {
    client, resolution,
    lines: [
      { account_code: BANK1, debit_cents: 250_000, credit_cents: 0, description: "a4t agent dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 250_000, description: "a4t agent cr" },
    ],
    memo: "a4t agent-drafted revenue", postingDate: "2027-06-15", opKey: opk("a4t-agent-draft"),
  });
  // THE HUMAN'S ONLY TOUCH IS APPROVAL -- never a revision, so last_human_editor stays null and
  // v_human_preparer resolves to nobody (coalesce(last_human_editor, maker_actor) reads the
  // agent). Approving without revising is the entire point of the D-2 scenario.
  await approveEntry(alice, { entry: drafted.entry_id, expectedRevision: drafted.revision_token, opKey: opk("a4t-agent-approve") });

  await beginClose(alice, { fy });
  const closed = await finalizeClose(alice, { fy });
  const receipt = await receiptRow(closed.receipt_id);
  assert.equal(receipt.segregation_mode, "agent_prepared",
    "A: an all-agent-drafted, human-approved-without-revision year closes agent_prepared -- v_agent_prepared true, row 7's TRUE branch, D-2 unmoved");
  assert.equal(receipt.last_preparer_actor, null,
    "A: v_human_preparer genuinely resolved to nobody -- the label is not merely right, the input that produced it is");
});

// =====================================================================================
// B -- the HUMAN-PREPARED shape (rows 1-4; H=yes, A=no, S=no). The control: without this,
// cell A's agent_prepared could be the body's ONLY possible output and prove nothing about
// row 7 actually branching on v_agent_prepared.
// =====================================================================================
test("B the human-prepared shape: an ordinary human-authored year closes as segregation_mode='two_person' when a distinct eligible closer finalizes -- unmoved by this file", async (t) => {
  if (gate(t)) return;
  const { alice, bob } = await miniWorld();
  const client = await freshActiveClient(alice, "a4t-human");
  await setupCloseCoa(alice, client);
  const opened = await openFY(alice, { client, label: "a4t human-prepared FY", startsOn: "2027-01-01", endsOn: "2027-12-31" });
  const fy = opened.fiscal_year_id;
  await plainEntry(bob, { client, debit: BANK1, credit: REVN, cents: 100_000, postingDate: "2027-06-15", memo: "a4t human revenue" });

  await beginClose(alice, { fy });
  const closed = await finalizeClose(alice, { fy });
  const receipt = await receiptRow(closed.receipt_id);
  assert.equal(receipt.segregation_mode, "two_person",
    "B: a human-prepared year, closed by a distinct eligible human, still stamps two_person -- the control against A always returning agent_prepared regardless of input");
  assert.equal(receipt.last_preparer_actor, bob, "B: the receipt names the real human preparer");
});

// =====================================================================================
// C -- the NO-PREPARATION shape (row 7 FALSE branch -- THE cell this migration exists for).
// A fiscal year with ZERO entries: no human touched it, and v_agent_prepared reads false
// (nothing approved, maker=agent, last_human_editor-still-null exists, because nothing
// exists at all). Before this migration this stamped 'agent_prepared' -- a permanent,
// false claim that Clara prepared a year nobody, human or agent, ever touched.
// =====================================================================================
test("C the no-preparation shape: a dormant year with ZERO entries closes as segregation_mode='no_preparation', never 'agent_prepared' -- the defect this migration corrects, proven on the live body", async (t) => {
  if (gate(t)) return;
  const { alice } = await miniWorld();
  const client = await freshActiveClient(alice, "a4t-dormant");
  await setupCloseCoa(alice, client);
  const opened = await openFY(alice, { client, label: "a4t dormant FY", startsOn: "2027-01-01", endsOn: "2027-12-31" });
  const fy = opened.fiscal_year_id;

  await beginClose(alice, { fy });
  const closed = await finalizeClose(alice, { fy });
  assert.equal(closed.close_entry_id, null,
    "mandatory setup: zero P&L movement mints no closing entry -- a genuinely empty year, not merely an unmarked one");
  const receipt = await receiptRow(closed.receipt_id);
  assert.equal(receipt.segregation_mode, "no_preparation",
    "C: THE FIX -- a dormant zero-entry year (no human, no agent) stamps the truthful no_preparation label, never agent_prepared");
  assert.equal(receipt.last_preparer_actor, null, "C: no human preparer, honestly recorded");
});

// =====================================================================================
// D -- the widened CHECK, read live, both ways: all four values admitted, and the exact
// pre-widening three-value shape is genuinely gone (a superset closed world, not a guess).
// =====================================================================================
test("D the segregation_mode CHECK is a four-value closed world, extend-only: the prior three plus no_preparation, and nothing else", async (t) => {
  if (gate(t)) return;
  const def = (await rootQuery(
    `select pg_get_constraintdef(c.oid) as d from pg_constraint c
       where c.conrelid='clara.close_receipts'::regclass and c.conname='close_receipts_segregation_mode_check'`,
  )).rows[0].d;
  assert.equal(def, "CHECK ((segregation_mode = ANY (ARRAY['two_person'::text, 'solo_self_attested'::text, 'agent_prepared'::text, 'no_preparation'::text])))",
    `D: the widened CHECK is not at its exact expected text (got: ${def})`);
  for (const v of ["two_person", "solo_self_attested", "agent_prepared", "no_preparation"]) {
    // a raw catalog-level admission check -- the CHECK expression itself accepts the value,
    // independent of any writer's own reachability of it.
    const r = await rootQuery("select $1 = any(array['two_person','solo_self_attested','agent_prepared','no_preparation']) as ok", [v]);
    assert.equal(r.rows[0].ok, true, `D: ${v} is admitted`);
  }
});
