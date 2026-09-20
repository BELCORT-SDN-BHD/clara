// #984 -- THE OPENING LANE BECOMES A WORK. Approving an opening seed or an opening correction now
// mints ONE `clara.accounting_work` row and ONE `clara.operation_receipts` row under a FOURTH
// purpose, `opening_balance`, beside the dedicated `clara.opening_seed_approvals` receipt opening
// has always written. Migration 0239 widens the closed purpose vocabulary in the places that
// assert it independently, and adds a SIBLING admission path so opening never touches the
// model-run machinery `clara._admit_accounting_work_core` exists for.
//
// THE OWNER'S RULING (2026-09-20, on the ticket) reverses the ticket's own recommended Option B:
// #656's AC5 asked for the Work-and-receipt pair here and the wave recorded it as "descoped
// (authority)", which was an authority question rather than a finding that the Work model is
// wrong for opening.
//
// SEAMS (written down before the first test, work-order rule 4). The Agent Brief's "Key
// interfaces" names these, and this file tests at these only:
//
//   1. `clara._assert_adjustment_basis(text, jsonb)` -- the typed-particulars gate that owns the
//      `invalid_purpose` refusal. Called directly (it is an owner-only internal, reached here as
//      root) because that IS its shape: every caller reaches it the same way, from inside a
//      definer body.
//   2. `clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)` -- the human door, driven as
//      a real signed-in SERIALIZABLE session through the wave-B fixture, exactly as
//      `wb-k-approval.test.mjs` drives it. Everything behavioural is asserted there: which rows
//      appear, which rows do NOT, and what opening's own relations still say.
//   3. `clara.approve_opening_correction(uuid,jsonb,text,text)` -- the second human door, on the
//      same footing.
//   4. THE PURPOSE VOCABULARY ITSELF -- both column CHECKs, the two shape CHECKs that read the
//      purpose, and `clara._record_journal_entry_core`'s closed IN-list -- as a CATALOGUE census
//      rather than as a callable. A claim about "every place the vocabulary is closed" is
//      structural by nature, and work-order rule 4's "where this repo's own documented standard
//      asks for a structural cell, that standard wins" is what it rests on;
//      `p638.core.no_regression` in `staff-expense-claim.test.mjs` is the precedent and the cell
//      #984's AC6 re-derives.
//
// NOT A SEAM, and never asserted as one: the contents of `basis` / `effects` as a DOMAIN answer.
// They are read here only to prove the rows name the batch they came from.
//
// FAIL, NEVER SKIP, on a focused run. A sweep against a pre-0239 chain preloads
// `opening-balance-work-preintegration-gate.mjs`; a focused run leaves
// CLARA_ALLOW_MISSING_OPENING_BALANCE_WORK unset and must count ZERO skips.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, opk, assertRaises, printLaneNotes, noteLane,
  wbEnsureReady, buildWaveBWorld, onboardingClient, seedOpeningCoa, stageBeeSet,
  planRevision, approveOpeningSeed, openingApprovalRows, seedRegRow,
} from "./wave-b/wb-fixtures.mjs";

/** The migration whose effects this file describes, and the stem its gate module keys on. */
const MIGRATION = "0239_opening_balance_work";
const STEM = "opening_balance_work$";

/** The fourth value 0239 admits, and the three it must leave exactly where they were. */
const OPENING = "opening_balance";
const PRIOR = ["journal_entry", "periodic_stock_adjustment", "payroll_obligation"];

let ready = false;
let w = null;

before(async () => {
  ready = await wbEnsureReady();
  if (!ready) return;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  if (r.rows[0].n === 0) {
    if (process.env.CLARA_ALLOW_MISSING_OPENING_BALANCE_WORK !== "1") {
      throw new Error(
        `#984 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) `
        + "and CLARA_ALLOW_MISSING_OPENING_BALANCE_WORK is unset -- this is a FOCUSED run and must "
        + "fail loudly, not skip. Preload ./tests/opening-balance-work-preintegration-gate.mjs for "
        + "an estate sweep against a pre-#984 chain.");
    }
    ready = false;
    return;
  }
  w = await buildWaveBWorld();
});

after(async () => {
  printLaneNotes("opening-balance-work");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: wbEnsureReady() failed, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

/** `clara._assert_adjustment_basis` is an owner-only internal; root is how every cell reaches it. */
const assertBasis = (purpose, adjustment) => rootQuery(
  "select clara._assert_adjustment_basis($1, $2::jsonb) as r",
  [purpose, adjustment === null ? null : JSON.stringify(adjustment)]);

// =============================================================================================
// 1 - obw984.basis.vocabulary -- the typed-particulars gate learns ONE value and loses none.
//
// This is the arm the Agent Brief's AC4 names. `clara._assert_adjustment_basis` holds its OWN
// closed list (it raises `invalid_purpose` outside the three) and is reached from every admission
// path, so a purpose the CHECKs admit but this body does not is a purpose no door could mint.
// =============================================================================================
test("obw984.basis.vocabulary: the opening purpose is admitted with NULL particulars, refuses typed ones, and the three prior purposes are untouched", async (t) => {
  if (unready(t)) return;

  // THE NEW ARM. An opening Work carries no typed particulars, exactly as a journal-entry Work
  // does not -- opening's figures are the opening items themselves, already posted entries.
  await assertBasis(OPENING, null);

  // ...and it is a REFUSAL, not an ignore, when somebody offers particulars anyway. The spelling
  // is the journal-entry arm's, because it is the same fault: a purpose that carries none.
  const err = await assertRaises("CLR10", () => assertBasis(OPENING, { period_start: "2026-01-01" }),
    "typed particulars on an opening work");
  const detail = JSON.parse(err.detail ?? "{}");
  assert.equal(detail.reason, "invalid_adjustment", "the refusal names the adjustment, not the purpose");
  assert.equal(detail.constraint, "not_supported",
    "...and says the purpose supports none, which is the journal-entry arm's own word");

  // THE THREE PRIOR PURPOSES, unmoved. A widening that quietly relaxed one of them would pass
  // every assertion above.
  await assertBasis("journal_entry", null);
  await assertRaises("CLR10", () => assertBasis("journal_entry", { period_start: "2026-01-01" }),
    "journal_entry still carries no particulars");
  const missing = await assertRaises("CLR10", () => assertBasis("periodic_stock_adjustment", null),
    "periodic_stock_adjustment still REQUIRES its particulars");
  assert.equal(JSON.parse(missing.detail ?? "{}").constraint, "object",
    "...with its own constraint token, not the opening arm's");

  // AND THE CLOSED SET IS STILL CLOSED. A fifth value is still `invalid_purpose`.
  const unknown = await assertRaises("CLR10", () => assertBasis("opening_balance_batch", null),
    "a value outside the widened four");
  assert.equal(JSON.parse(unknown.detail ?? "{}").reason, "invalid_purpose",
    "the gate still answers invalid_purpose outside the vocabulary -- widened, not opened");
  noteLane(`obw984: clara._assert_adjustment_basis admits ${PRIOR.length + 1} purposes and no more`);
});

/** A freshly onboarded client of firm A with a staged three-item opening seed on a tie document. */
async function stagedSeed() {
  const onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: onb.client, plan: onb.plan });
  return { onb, ...st };
}

/** Every `clara.accounting_work` row of ONE client, oldest first. */
const workRows = async (client) => (await rootQuery(
  "select * from clara.accounting_work where client_id = $1 order by created_at, id", [client])).rows;

/** Every `clara.operation_receipts` row of ONE client, oldest first. */
const receiptRows = async (client) => (await rootQuery(
  "select * from clara.operation_receipts where client_id = $1 order by created_at, id", [client])).rows;

/** Every `clara.agent_tasks` row of ONE client. */
const taskRows = async (client) => (await rootQuery(
  "select * from clara.agent_tasks where client_id = $1", [client])).rows;

/** The rows `clara.agent_tasks` holds against ONE Work — the FK an opening Work must never own. */
const tasksForWork = async (work) => (await rootQuery(
  "select * from clara.agent_tasks where work_id = $1", [work])).rows;

// =============================================================================================
// 2 - obw984.seed.work -- approving an opening SEED mints exactly one Work and one receipt.
//
// The Agent Brief's AC2 and AC3, at the human door. The counts are CLIENT-SCOPED because every
// cell here stages its own client: a firm-scoped census would be moved by any sibling file in an
// estate sweep (the lesson `p646.horn_a.no_work` carries in its own header). The scoping is not
// vacuous -- the very same predicate is what SEES the one Work this approval mints.
// =============================================================================================
test("obw984.seed.work: approving an opening seed mints exactly ONE accounting_work and ONE operation_receipt of the opening purpose, with no agent task and no model name, and opening's own receipt relation is unchanged", async (t) => {
  if (unready(t)) return;
  const s = await stagedSeed();

  // PRESTATE, MEASURED: an opening client has no Work of any kind before it is approved. That is
  // the defect this ticket repairs, pinned as the starting point rather than assumed.
  assert.deepEqual(await workRows(s.onb.client), [], "no accounting_work before the approval");
  assert.deepEqual(await receiptRows(s.onb.client), [], "no operation_receipt before the approval");
  assert.deepEqual(await taskRows(s.onb.client), [], "no agent_task before the approval");

  const opKey = opk("obw984-seed");
  const receipt = await approveOpeningSeed(w.users.hana, {
    seed: s.seed, planRevision: await planRevision(s.onb.plan), tieSha256: s.doc.sha256,
    entryRevisions: s.revMap, opKey,
  });
  assert.equal(receipt.status, "finalized", "mandatory setup: the batch really approved");

  // --- THE WORK -------------------------------------------------------------------------------
  const works = await workRows(s.onb.client);
  assert.equal(works.length, 1, "exactly ONE accounting_work row for the whole batch");
  const work = works[0];
  assert.equal(work.purpose, OPENING, "under the new opening purpose");
  assert.equal(work.status, "completed",
    "already finished: the entries are approved and the registry finalized before the row is written");
  assert.equal(work.basis_origin, "user_direct", "a person approved it");
  assert.equal(work.adjustment_basis, null, "an opening Work carries no typed particulars");
  assert.equal(work.current_task_id, null, "and names no run");
  assert.deepEqual(work.source_refs, [], "documentless: the tie is a fact on the basis, not an evidence claim");
  assert.equal(work.initiator, w.users.hana, "the approver is the initiator");
  assert.equal(work.initiated_by, w.users.hana);
  assert.equal(work.initiator_role, "admin", "at the rank the door floors on");
  assert.equal(work.basis.seed_id, s.seed, "the basis names the seed it came from");
  assert.equal(work.basis.batch_n, 1, "and the batch");
  assert.equal(work.basis.entry_count, s.drafts.all.length, "and how many entries it carried");
  assert.equal(work.basis.tie_document_id, s.doc.documentId, "and the tie document, as a fact");
  assert.equal(work.basis.batch, "seed", "and which door approved it");
  assert.equal(work.logical_op_id, `work:${work.id}:${OPENING}:1`,
    "the logical operation identity is the house shape, purpose included");

  // --- THE RECEIPT ----------------------------------------------------------------------------
  const receipts = await receiptRows(s.onb.client);
  assert.equal(receipts.length, 1, "exactly ONE operation_receipt");
  const r = receipts[0];
  assert.equal(r.purpose, OPENING);
  assert.equal(r.work_id, work.id, "naming the Work it belongs to");
  assert.equal(r.outcome, "committed");
  assert.equal(r.refusal, null);
  assert.equal(r.task_id, null,
    "NO run: the receipt's task is null, which 0239's own purpose-keyed CHECK now requires here");
  assert.equal(r.acting_actor, w.users.hana, "the human acted");
  assert.equal(r.on_behalf_of, w.users.hana, "for themselves; no agent stood in");
  assert.equal(r.via_wake_kind, "opening_approval", "through the opening door, not a wake");
  assert.equal(r.run_id, opKey, "the run id is the operation key the door was called with");
  assert.equal(r.effects.seed_id, s.seed, "the effects name the seed");
  assert.equal(r.effects.batch_n, 1);
  assert.equal(r.effects.entry_count, s.drafts.all.length);
  assert.equal(Object.prototype.hasOwnProperty.call(r.effects, "entry_id"), false,
    "and NAME NO ENTRY: a batch has N, and clara._tf_assert_agent_post_receipt counts receipts that name one");
  assert.match(r.payload_digest, /^[0-9a-f]{64}$/);

  // --- WHAT DID NOT HAPPEN --------------------------------------------------------------------
  assert.deepEqual(await taskRows(s.onb.client), [],
    "AC3: no agent_task was created for this client - an opening approval is deterministic and human-made");
  assert.deepEqual(await tasksForWork(work.id), [],
    "and none points at this Work, which is the FK a model run would have to take");

  // --- AND OPENING'S OWN RECEIPT RELATION IS UNTOUCHED -----------------------------------------
  const approvals = await openingApprovalRows(s.seed);
  assert.equal(approvals.length, s.drafts.all.length,
    "the dedicated per-entry receipt relation still carries one row per entry, unchanged");
  assert.equal((await seedRegRow(s.seed)).state, "finalized",
    "and the registry finalized exactly as before");
  noteLane(`obw984: an approved opening seed now carries work ${work.id} and receipt ${r.id}`);
});
