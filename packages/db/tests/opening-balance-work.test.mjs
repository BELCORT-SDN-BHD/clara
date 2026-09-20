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
//   5. (FIX ROUND, L01W2-SPEC-09) `clara.list_accounting_work`, `clara.get_accounting_work_row`
//      and `clara.list_activity` -- the three READ doors the Work list, the Work detail and the
//      firm Activity feed are fed from, driven as a signed-in BOOKKEEPER. AC7 was proved on the
//      web side against hand-built rows and here against the WRITTEN rows; the premise in
//      between -- that the reads surface an opening Work at all -- was argued from the doors'
//      bodies and never measured. Section 5 measures it. It is a seam the brief names ("renders
//      ... on the Work list, Work detail and firm Activity feed, and is selectable in the Work
//      list's purpose filter"), not a new one.
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
  wbEnsureReady, buildWaveBWorld, onboardingClient, seedOpeningCoa, stageBeeSet, stageFullSet,
  planRevision, approveOpeningSeed, openingApprovalRows, seedRegRow,
  approveOpeningCorrection, supersedeOpeningItem, openingItemRows, entryRow, revMapOf,
  // fix round (L01W2-SPEC-09) -- the three READ doors AC7 is really about, driven as a signed-in
  // bookkeeper rather than argued about from their bodies.
  humanQuery,
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

// =============================================================================================
// 3 - obw984.correction.work -- the SECOND door, on the same footing.
//
// A correction batch is a second approval of the same registry, so it is a SECOND Work: its own
// batch number is what keeps the intent key distinct, and nothing about the first Work moves.
// =============================================================================================
test("obw984.correction.work: approving an opening correction mints a SECOND Work and receipt of the opening purpose, still with no agent task, and leaves the seed's Work exactly where it was", async (t) => {
  if (unready(t)) return;
  const onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  const st = await stageFullSet(w.users.bob,
    { owner: w.users.alice, client: onb.client, plan: onb.plan, firm: w.firms.A });
  await approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(onb.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("obw984-corbase"),
  });
  const seedWorks = await workRows(onb.client);
  assert.equal(seedWorks.length, 1, "mandatory setup: the seed batch minted its one Work");
  const seedWork = seedWorks[0];

  // THE CORRECTION. Superseding an item drafts the reversal/replacement pair and reopens the
  // registry; the correction door then approves that pair as batch 2.
  const arItem = (await openingItemRows(st.seed)).find((i) => i.item_key === "ar:cust1");
  assert.ok(arItem, "mandatory setup: the AR item to correct");
  const sup = await supersedeOpeningItem(w.users.bob, {
    item: arItem.id,
    replacement: {
      item: { item_kind: "ar_open_item", item_key: "ar:cust1:v2", amount_cents: 3_000_000,
        counterparty_id: arItem.counterparty_id, item_ref: "SI-100R", item_date: "2025-12-15" },
    },
    opKey: opk("obw984-sup"),
  });
  const replacement = (await openingItemRows(st.seed)).find((i) => i.item_key === "ar:cust1:v2");
  const drafts = [];
  for (const eid of new Set([sup.reversal_entry_id ?? sup.reversal_id, replacement.entry_id])) {
    const e = await entryRow(eid);
    if (e.status === "draft") drafts.push({ entry_id: eid, revision_token: e.revision_token });
  }
  assert.ok(drafts.length >= 1, "mandatory setup: the correction really drafted something");
  await approveOpeningCorrection(w.users.hana, {
    seed: st.seed, entryRevisions: revMapOf(drafts), opKey: opk("obw984-cor"),
  });

  const works = await workRows(onb.client);
  assert.equal(works.length, 2, "a correction batch is a SECOND Work, not a mutation of the first");
  const corWork = works.find((x) => x.id !== seedWork.id);
  assert.equal(corWork.purpose, OPENING);
  assert.equal(corWork.basis.batch, "correction", "and it says which door approved it");
  assert.equal(corWork.basis.batch_n, 2, "at the registry's own second batch");
  assert.equal(corWork.basis.entry_count, drafts.length);
  assert.equal(corWork.adjustment_basis, null);
  assert.equal(corWork.current_task_id, null);
  assert.equal(corWork.status, "completed");
  assert.notEqual(corWork.intent_key, seedWork.intent_key,
    "the batch number is what keeps the two intent keys apart under one (firm, client) unique index");

  const receipts = await receiptRows(onb.client);
  assert.equal(receipts.length, 2, "one receipt per batch");
  const corReceipt = receipts.find((x) => x.work_id === corWork.id);
  assert.ok(corReceipt, "the correction Work has its own receipt");
  assert.equal(corReceipt.purpose, OPENING);
  assert.equal(corReceipt.task_id, null, "still no run");
  assert.equal(corReceipt.outcome, "committed");
  assert.equal(corReceipt.effects.seed_id, st.seed);
  assert.equal(corReceipt.effects.batch_kind, "correction");
  assert.deepEqual(await taskRows(onb.client), [], "AC3 again: a correction mints no agent task either");

  // THE FIRST WORK IS BYTE-UNCHANGED. `clara.accounting_work` is immutable by trigger, so this
  // is a live re-read of a row nothing was allowed to touch.
  const seedWorkAfter = (await workRows(onb.client)).find((x) => x.id === seedWork.id);
  assert.deepEqual(seedWorkAfter, seedWork, "the seed batch's Work is untouched by the correction");
  noteLane(`obw984: a corrected opening now carries two works (${seedWork.id}, ${corWork.id})`);
});

/** One constraint definition, by relation and name. */
const constraintDef = async (table, name) => (await rootQuery(
  "select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = $1::regclass and conname = $2",
  [table, name])).rows[0]?.d ?? null;

/** One routine's source, by signature. */
const bodyOf = async (sig) => (await rootQuery(
  "select prosrc from pg_proc where oid = $1::regprocedure", [sig])).rows[0]?.prosrc ?? null;

// =============================================================================================
// 4 - obw984.vocabulary.census -- WHERE the vocabulary is closed, and where it deliberately is not.
//
// STRUCTURAL BY NATURE, and that is the standard this file is held to (work-order rule 4): the
// claim is about EVERY place the estate closes the purpose set, and no dynamic call can make a
// claim about a place it does not reach. It is the sibling of `p638.core.no_regression` in
// `staff-expense-claim.test.mjs`, which #984 re-derived to the same four-value expectation.
//
// AC5's OWN WORDS are what the posting-core half rests on: "the posting core's purpose lookup is
// unchanged, PROVEN BY RE-READING ITS BODY; an opening Work never reaches it."
// =============================================================================================
test("obw984.vocabulary.census: the purpose vocabulary is four values in the four places the columns close it, the two admission cores are NOT both widened, and the posting core still reads the three", async (t) => {
  if (unready(t)) return;

  // --- 1 · THE TWO COLUMN CHECKS --------------------------------------------------------------
  const FOUR = "CHECK ((purpose = ANY (ARRAY['journal_entry'::text, "
    + "'periodic_stock_adjustment'::text, 'payroll_obligation'::text, 'opening_balance'::text])))";
  for (const [table, name] of [
    ["clara.accounting_work", "accounting_work_purpose_check"],
    ["clara.operation_receipts", "operation_receipts_purpose_check"],
  ]) {
    const d = await constraintDef(table, name);
    assert.equal(d, FOUR, `${name} is not 0239's four-value text`);
    for (const v of PRIOR) {
      assert.ok(d.includes(`'${v}'::text`), `${name} lost ${v} - 0239 is a widening, not a rewrite`);
    }
    assert.ok(d.includes(`'${OPENING}'::text`), `${name} does not admit ${OPENING}`);
  }

  // --- 2 · THE TWO SHAPE CHECKS THAT READ THE PURPOSE -----------------------------------------
  const adj = await constraintDef("clara.accounting_work", "ck_accounting_work_adjustment_basis");
  assert.ok(adj.includes("journal_entry") && adj.includes(OPENING),
    "both no-particulars purposes must be on the NULL side of ck_accounting_work_adjustment_basis");
  const shape = await constraintDef("clara.operation_receipts", "ck_operation_receipts_outcome_shape");
  assert.ok(shape.includes("entry_id"),
    "the three model-served purposes still have to name the ONE entry their receipt posted");
  assert.ok(shape.includes("seed_id"),
    "and an opening batch names its SEED, because it has N entries and owns none of them singly");

  // --- 3 · THE RUN THE OPENING LANE DOES NOT HAVE ---------------------------------------------
  // This is also AC5's second half, at constraint level: `clara._record_journal_entry_core` writes
  // its receipt with a NON-NULL task (the run it was woken for). If an opening Work ever reached
  // the posting core, the receipt it wrote would violate the CHECK below, so the estate refuses
  // that path rather than merely not taking it.
  const taskCheck = await constraintDef("clara.operation_receipts", "ck_operation_receipts_task_by_purpose");
  assert.ok(taskCheck, "0239's purpose-keyed task CHECK is absent");
  assert.ok(taskCheck.includes(OPENING), "...and does not name the purpose it exempts");
  const notNull = await rootQuery(
    "select attnotnull as n from pg_attribute where attrelid = 'clara.operation_receipts'::regclass and attname = 'task_id'");
  assert.equal(notNull.rows[0].n, false, "task_id is nullable now");
  const fk = await rootQuery(
    "select count(*)::int as n from pg_constraint where conrelid = 'clara.operation_receipts'::regclass and conname = 'operation_receipts_task_id_fkey' and contype = 'f'");
  assert.equal(fk.rows[0].n, 1, "nullable is not unbound: the agent_tasks FK is still there");

  // --- 4 · THE TWO ADMISSION CORES, and which of them learned the value -----------------------
  const modelCore = await bodyOf(
    "clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)");
  assert.ok(modelCore.includes("'journal_entry','periodic_stock_adjustment','payroll_obligation'"),
    "the model-served admission core still holds its own closed three-value list");
  assert.equal(modelCore.includes(OPENING), false,
    "...and does NOT know the opening purpose: it inserts an agent_tasks row and demands a model name, which is exactly what an opening approval must not acquire");
  const sibling = await bodyOf(
    "clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text)");
  assert.ok(sibling, "the sibling admission path exists");
  assert.equal(sibling.includes("agent_tasks"), false, "the sibling names no agent task (AC3)");
  assert.ok(sibling.includes("clara._assert_adjustment_basis"),
    "...and asks the vocabulary gate, so §B's new arm is live rather than decorative");
  for (const role of ["public", "clara_authenticated", "clara_runtime", "clara_agent_ro"]) {
    const g = await rootQuery(
      "select has_function_privilege($1, 'clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text)'::regprocedure, 'execute') as g",
      [role]);
    assert.equal(g.rows[0].g, false, `${role} can execute the sibling admission path - it is reachable only from the two opening doors`);
  }

  // --- 5 · THE POSTING CORE, RE-READ (AC5) ----------------------------------------------------
  const postingCore = await bodyOf(
    "clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)");
  assert.ok(postingCore.includes("'journal_entry','periodic_stock_adjustment','payroll_obligation'"),
    "the posting core's purpose lookup is still the 0195 three");
  assert.equal(postingCore.includes(OPENING), false,
    "AC5: the posting core does NOT name the opening purpose - work_not_found is the correct answer for it, and an opening Work never arrives because its entries are approved by clara._approve_opening_entry before the Work row is written");
  noteLane("obw984: the vocabulary is four values on both CHECKs; the model-served admission core and the posting core still read exactly three");
});

// =============================================================================================
// 5 - obw984.read_doors -- THE THREE READS A PERSON ACTUALLY LOOKS AT, driven with a REAL
// approved opening batch.
//
// WHY THIS CELL EXISTS (fix round, L01W2-SPEC-09). AC7 -- "an opening Work renders with a human
// label on the Work list, Work detail and firm Activity feed, and is selectable in the Work
// list's purpose filter" -- was proved on the WEB side against hand-built component rows, and on
// the DB side only by asserting the `clara.accounting_work` and `clara.operation_receipts` ROWS.
// Between the two sat an unmeasured premise: that the read doors those components are fed from
// SURFACE an opening Work at all. The premise was argued (the doors carry no closed purpose list
// and join only outward), never measured -- and an argument about four bodies is exactly the kind
// of claim a later recut falsifies silently.
//
// THE SEAMS, and they are the doors the browser calls, not internals:
//   * `clara.list_accounting_work` -- the Work list AND its purpose filter (one door, two AC7
//     clauses: the row is listed, and `p_purpose => {opening_balance}` selects it).
//   * `clara.get_accounting_work_row` -- the Work detail read.
//   * `clara.list_activity` -- the firm Activity feed.
// Read as BOB, a BOOKKEEPER who did not approve anything: the floor these doors enforce is
// bookkeeper, and a Work only its approver could see would be a different defect.
//
// NON-VACUOUS BY CONSTRUCTION, twice over: every read below is taken BEFORE the approval on the
// same client and must be empty, and each filter is asked once for a value the Work does not
// carry (`p_purpose => {journal_entry}`, `p_kinds => {journal}`) and must exclude it.
//
// AND MEASURED ONCE AGAINST A BROKEN SUBJECT (the vacuity control rule 4 asks for): with
// `clara.list_accounting_work` recut on the rig to carry one extra clause,
// `and w.purpose <> 'opening_balance'`, this cell failed on exactly the right assertion -- "the
// Work list now shows exactly the one Work the batch minted, 0 !== 1" -- while the other four
// cells in this file stayed green, because they read the ROWS and not the DOORS. The door was
// then restored byte for byte from 0203 (`prosrc` md5 back to b115f2806f642522cca4611f21ad931e,
// owner clara_fn_owner, SECURITY INVOKER, both pins and the ACL unchanged).
// =============================================================================================

/** `clara.list_accounting_work` with named arguments, as the browser sends them. */
const listWork = async (sub, { client = null, purpose = null, limit = 25 } = {}) => (await humanQuery(sub,
  "select clara.list_accounting_work(p_client => $1::uuid, p_purpose => $2::text[], p_limit => $3::int) as r",
  [client, purpose, limit])).rows[0].r;

/** `clara.get_accounting_work_row` -- the Work detail's own read. */
const getWorkRow = async (sub, work) => (await humanQuery(sub,
  "select clara.get_accounting_work_row(p_work => $1::uuid) as r", [work])).rows[0].r;

/** `clara.list_activity` at the SEVEN-parameter arity 0202 gave it. This file is gated on 0239,
 *  which is far above 0202, so the arity is not in question here (activity-feed.test.mjs, which
 *  runs against pre-0202 frontiers too, is where the adaptive wrapper belongs). */
const listActivity = async (sub, { client = null, kinds = null, work = null, limit = 50 } = {}) => (await humanQuery(sub,
  "select clara.list_activity($1::text,$2::int,$3::uuid,$4::text[],$5::timestamptz,$6::timestamptz,$7::uuid) as r",
  [null, limit, client, kinds, null, null, work])).rows[0].r;

test("obw984.read_doors: an approved opening batch is listed, addressable and on the Activity feed through the REAL read doors, and its purpose selects it", async (t) => {
  if (unready(t)) return;
  const s = await stagedSeed();
  const BOB = w.users.bob;

  // --- PRESTATE, through the same doors ------------------------------------------------------
  assert.deepEqual((await listWork(BOB, { client: s.onb.client })).rows, [],
    "the Work list shows nothing for this client before the approval");
  assert.deepEqual((await listActivity(BOB, { client: s.onb.client, kinds: ["work"] })).rows, [],
    "and the Activity feed carries no work-kind row for it either");

  const opKey = opk("obw984-reads");
  const receipt = await approveOpeningSeed(w.users.hana, {
    seed: s.seed, planRevision: await planRevision(s.onb.plan), tieSha256: s.doc.sha256,
    entryRevisions: s.revMap, opKey,
  });
  assert.equal(receipt.status, "finalized", "mandatory setup: the batch really approved");
  const work = (await workRows(s.onb.client))[0];
  const rec = (await receiptRows(s.onb.client))[0];

  // --- 1 - THE WORK LIST ----------------------------------------------------------------------
  const page = await listWork(BOB, { client: s.onb.client });
  assert.equal(page.rows.length, 1, "the Work list now shows exactly the one Work the batch minted");
  assert.equal(page.rows[0].id, work.id, "and it is that row, not another");
  assert.equal(page.rows[0].purpose, OPENING,
    "listed UNDER THE NEW PURPOSE - the door carries no closed purpose list, which this measures rather than argues");
  assert.equal(page.rows[0].status, "completed", "already finished when it appears");
  assert.equal(page.rows[0].current_task_id, null, "and names no run, on the wire too");
  assert.equal(page.rows[0].client_name, (await rootQuery(
    "select name from clara.clients where id = $1", [s.onb.client])).rows[0].name,
  "the list's client join resolves for an ONBOARDING client, which is the only kind an opening batch has");

  // --- 2 - THE PURPOSE FILTER (AC7's last clause) ---------------------------------------------
  const filtered = await listWork(BOB, { client: s.onb.client, purpose: [OPENING] });
  assert.deepEqual(filtered.rows.map((r) => r.id), [work.id],
    "p_purpose => {opening_balance} SELECTS it - the filter the Work list's chip sends is honoured server-side");
  const otherPurpose = await listWork(BOB, { client: s.onb.client, purpose: ["journal_entry"] });
  assert.deepEqual(otherPurpose.rows, [],
    "...and p_purpose => {journal_entry} excludes it, so the filter above is not a filter that passes everything");

  // --- 3 - THE WORK DETAIL READ ---------------------------------------------------------------
  const row = await getWorkRow(BOB, work.id);
  assert.equal(row.id, work.id, "the detail door addresses the opening Work by id");
  assert.equal(row.purpose, OPENING, "under the same purpose the list gave");
  assert.equal(row.status, "completed");
  assert.equal(row.attempts, 0, "no run attempts: nothing was ever woken for it");
  assert.equal(row.current_run_status, null);
  assert.equal(row.entry_id, null,
    "and it names no single entry - a batch has N, which is why its result names the seed instead");

  // --- 4 - THE FIRM ACTIVITY FEED -------------------------------------------------------------
  const feed = await listActivity(BOB, { client: s.onb.client, kinds: ["work"] });
  const mine = feed.rows.filter((r) => r.source === "operation_receipt");
  assert.equal(mine.length, 1, "the feed carries exactly one operation-receipt row for this client");
  assert.equal(mine[0].id, rec.id, "and it is the receipt the approval wrote");
  assert.equal(mine[0].event_type, OPENING,
    "the feed's event_type for a receipt is its Work's PURPOSE - this is the value describeActivity() renders, and it reaches the browser only because the door's join to clara.accounting_work found the row");
  assert.equal(mine[0].work_id, work.id, "linked to the Work it belongs to");
  assert.equal(mine[0].kind, "work", "filed under the work kind, which is the filter it must answer");
  const scoped = await listActivity(BOB, { client: s.onb.client, work: work.id });
  assert.deepEqual(scoped.rows.map((r) => r.id), [rec.id],
    "a p_work-scoped feed read returns the same one row, so the Work detail's own timeline finds it");
  const journalOnly = await listActivity(BOB, { client: s.onb.client, kinds: ["journal"] });
  assert.equal(journalOnly.rows.some((r) => r.id === rec.id), false,
    "...and the journal kind does NOT carry it, so the work-kind read above is a real filter");
  noteLane(`obw984: the three read doors surface opening work ${work.id} / receipt ${rec.id} to a bookkeeper`);
});
