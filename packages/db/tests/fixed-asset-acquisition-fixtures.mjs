// #639 [0201, fixed-asset acquisition] — the battery's frontier gate, verb wrappers and the ONE
// world that carries BOTH the fixed-asset register (0041) and the accounting-work lane
// (0178/0195). NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it.
//
// WHY A THIRD FIXTURE MODULE RATHER THAN A FOURTEENTH CELL IN `x41-wave-d-a-fa.test.mjs`. The
// defect #639 exists to close is a LANE defect, not an arithmetic one: `clara._fa_on_approve` is
// reached only by the four `clara._subledger_on_approve` callers (0037:3840-3845), and the Work
// lane's posting core approves with a raw `update ... set status='approved'` (0195:2110-2113) and
// calls no hook. `x41-wave-d-a-fa.test.mjs` drives `clara._approve_entry_core` — the DOCUMENT
// lane's core — which is precisely why thirteen cells stayed green for 137 migrations while a
// `claraWork_v3` acquisition could not commit at all. This module exists to drive the PRODUCTION
// command, `clara.wake_record_journal_entry`, under a real `clara_runtime` credential OBO the
// initiator, against an enrolled fixed-asset cost account.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA, never `rootQuery` (DECISIONS §1.10). Root
// reads appear only as READBACKS (the `x41-fa-world.mjs` law) and each is a readback, not the
// thing being proved.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk, markSkip,
  COST, BANK,
  faWorld, freshFaClient, faRows, mon, dayIn,
} from "./x41-fa-world.mjs";
import {
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry,
  acceptPublishedLegal, workRow, receiptsForWork, settleWorkRun,
} from "./work-journal-fixtures.mjs";
import { draftEntryV3 as s6DraftEntry, filedDocument } from "./s6-helpers.mjs";
import { approveEntry as rigApproveEntry, freshResolution as rigFreshResolution }
  from "./rig-fixtures.mjs";

export * from "./x41-fa-world.mjs";
export {
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry,
  acceptPublishedLegal, workRow, receiptsForWork, settleWorkRun,
};

// ===========================================================================================
// 1 · The frontier gate — on 0201's STABLE STEM, never its number (numbers are claimed at MERGE).
// ===========================================================================================

/** #639's migration STEM. `0201_fixed_asset_acquisition.sql` → `fixed_asset_acquisition$`. */
export const FA_ACQ_STEM = "fixed_asset_acquisition$";

let _acq = null;
export async function faAcquisitionReady() {
  if (_acq === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [FA_ACQ_STEM]);
      _acq = r.rows[0].n > 0;
    } catch {
      _acq = false;
    }
  }
  return _acq;
}

/** The per-cell frontier gate, COUNTED. A focused invocation (no `--import` of the
 *  preintegration gate) fails loudly instead: a skip is not evidence. */
export async function gateAcq(t) {
  if (await faAcquisitionReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_ACQUISITION !== "1") {
    assert.fail(
      `#639 migration (${FA_ACQ_STEM}) is NOT applied to this database, and this is a FOCUSED run. `
      + "A skip is not evidence: apply the migration, or preload "
      + "tests/fixed-asset-acquisition-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#639 fixed-asset acquisition lane absent (no ${FA_ACQ_STEM} migration applied)`);
  return true;
}

/** The accounting-work lane gate (0178). Without it there is no Work lane to drive at all. */
let _work = null;
export async function workLaneReady() {
  if (_work === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        ["accounting_work_journal_successor$"]);
      _work = r.rows[0].n > 0;
    } catch {
      _work = false;
    }
  }
  return _work;
}

export async function gateWorkLane(t) {
  if (await workLaneReady()) return false;
  markSkip();
  t.skip("#623 accounting-work lane absent — the Work-lane acquisition cells are dormant");
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts by NAME.
// ===========================================================================================

export const ACQ = {
  beltUnregistered: "fa_belt_unregistered_movement",
  costAdjustmentDeferred: "fa_cost_adjustment_deferred",
  kGlBalance: "fa_k_gl_balance_on_enrolled",
  genericControlLeg: "generic_control_leg",
  closedPeriod: "write_into_closed_period",
  oboNotActive: "obo_not_active",
  insufficientRole: "insufficient_role",
  oboNotInitiator: "obo_not_initiator",
  particularsAlreadyComplete: "fa_particulars_already_complete",
  particularsInvalid: "fa_particulars_invalid",
  staleQuestion: "stale_question",
  clientInactive: "client_inactive",
};

/** The birth trigger's pinned name — it MUST sort before `t_je_fa_movement_belt`, which is what
 *  makes the acquisition register row exist before the belt looks for it. */
export const BIRTH_TRIGGER = "t_je_fa_acquisition_birth";
export const BELT_TRIGGER = "t_je_fa_movement_belt";

// ===========================================================================================
// 3 · The world. The FA world (wave-B firm A: alice owner, bob + grace bookkeepers, hana admin,
//     carol viewer) PLUS the two facts the Work lane needs on top of it.
// ===========================================================================================

let _legal = false;
/** 0195's posting core refuses a run holding no consumed `accounting_work` egress authorisation,
 *  and that authority is DERIVED from the firm owner's acceptance of the CURRENT published Terms
 *  and DPA. A world whose owners accepted nothing would refuse every posting for a reason that
 *  has nothing to do with #639. Tolerant of a chain that publishes no legal text. */
export async function acqWorld() {
  const w = await faWorld();
  if (!_legal) {
    for (const owner of [w.users.alice, w.users.dave, w.users.erin]) {
      await acceptPublishedLegal(owner);
    }
    _legal = true;
  }
  return w;
}

/** A fresh firm-A client with the x41 chart, the COST profile enrolled and the Work lane armed. */
export async function acqClient(label, opts = {}) {
  await acqWorld();
  return freshFaClient(label, opts);
}

/** Dr <cost account> / Cr bank, exactly balanced, exact minor units. */
export function acqBasis({
  cents = 850_000, account = COST, creditAccount = BANK, postingDate = null,
  memo = "Compressor purchased, paid from Maybank",
} = {}) {
  return {
    posting_date: postingDate ?? dayIn(mon(-1), 15),
    memo,
    currency: "MYR",
    lines: [
      { account_code: account, debit_cents: cents, credit_cents: 0, description: "asset cost" },
      { account_code: creditAccount, debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
  };
}

/** ARM a Work: admit it, claim its run, mint the `interactive_client` credential the run holds.
 *  Every positive fixture posts through THAT credential, because #639's AC2 is about the
 *  initiator's LIVE authority at commit, not about the snapshot admission took. */
export async function armedAcquisition({ client, author = null, basis = null } = {}) {
  const w = await acqWorld();
  const who = author ?? w.users.bob;
  const b = basis ?? acqBasis();
  const work = await admitJournalWork({ client, author: who, basis: b });
  const runId = `run-${randomUUID()}`;
  await claimWorkRun({ task: work.task_id, runId });
  const cred = await mintClientObo({ firm: w.firms.A, obo: who, client });
  return { ...work, runId, cred, client, author: who, basis: b };
}

/** Drive the PRODUCTION command. This is the whole point of the battery. */
export const postAcquisition = (a, over = {}) => wakeRecordJournalEntry(a.cred.secret, {
  client: a.client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis,
  runId: a.runId, ...over,
});

/** Admit + claim + mint + post, in one call, for the cells whose subject is the OUTCOME. */
export async function workLaneAcquisition({ client, author = null, basis = null } = {}) {
  const a = await armedAcquisition({ client, author, basis });
  const out = await postAcquisition(a);
  return { ...a, out };
}

/** A DOCUMENT-BACKED acquisition, through the document lane's own cores.
 *
 *  This is the lane whose register rows `clara._fa_on_approve` arm 4 births at STATEMENT time —
 *  before the deferred birth trigger runs and before it could write `acquisition_document_id`,
 *  which 0017's post-approval immutability wall then makes unwritable forever. It is therefore the
 *  lane that proves the READ resolves the acquisition entry's own document as the authority.
 */
export async function documentLaneAcquisition(sub, {
  firm, client, cents = 640_000, postingDate, secondCostCents = null,
}) {
  const doc = await filedDocument(sub, { firm, client });
  // TWO COST LINES ON ONE INVOICE, when asked for. `clara._fa_on_approve` arm 4 births ONE row per
  // debit line on an enrolled cost account BY DESIGN (0041 §9.4, :2591-2593) — a machine and its
  // freight on one supplier invoice is the ordinary case, not an exotic one — so this fixture can
  // produce the pair the co-acquisition cell is about.
  const lines = secondCostCents === null
    ? [
      { account_code: COST, debit_cents: cents, credit_cents: 0, description: "asset cost" },
      { account_code: BANK, debit_cents: 0, credit_cents: cents, description: "paid" },
    ]
    : [
      { account_code: COST, debit_cents: cents, credit_cents: 0, description: "asset cost" },
      { account_code: COST, debit_cents: secondCostCents, credit_cents: 0, description: "delivery and install" },
      { account_code: BANK, debit_cents: 0, credit_cents: cents + secondCostCents, description: "paid" },
    ];
  const draft = await s6DraftEntry(sub, {
    client,
    resolution: rigFreshResolution(sub, client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    memo: `p639 document-lane acquisition ${opk("memo")}`,
    postingDate,
    lines,
    opKey: opk("p639-docdraft"),
  });
  const w = await acqWorld();
  await rigApproveEntry(sub === w.users.alice ? w.users.bob : w.users.alice, {
    entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("p639-docapr"),
  });
  return { ...doc, entry: draft.entry_id };
}

// ===========================================================================================
// 4 · Readbacks (root — never the lane under test).
// ===========================================================================================

export const assetsOf = (client) => faRows(client);

export async function assetForEntry(entry) {
  const r = await rootQuery(
    "select to_jsonb(f) as row from clara.fixed_assets f where f.acquisition_entry_id=$1 order by f.created_at, f.id",
    [entry]);
  return r.rows.map((x) => x.row);
}

export async function triggerOrderOnJournalEntries() {
  const r = await rootQuery(
    `select tgname, tgdeferrable, tginitdeferred, (tgconstraint <> 0) as is_constraint
       from pg_trigger where tgrelid = 'clara.journal_entries'::regclass and not tgisinternal
      order by tgname`);
  return r.rows;
}

/** The approve PATHS the estate actually has: every function body that sets an entry
 *  `status='approved'`. The census `x41-wave-d-a-fa.test.mjs:186` runs counts FUNCTIONS that
 *  mention `clara._fa_on_approve`; it stayed green when 0178 minted a FIFTH approve path that
 *  reaches no hook, which is how the defect survived 137 migrations. */
export async function approvePathBodies() {
  const r = await rootQuery(
    `select p.proname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.prosrc ~ 'journal_entries[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*''approved'''
      order by p.proname`);
  return r.rows.map((x) => x.proname);
}

export async function faHookCallers() {
  const r = await rootQuery(
    `select p.proname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and position('clara._fa_on_approve(' in p.prosrc) > 0
        and p.proname <> '_fa_on_approve'
      order by p.proname`);
  return r.rows.map((x) => x.proname);
}

export async function subledgerHookCallers() {
  const r = await rootQuery(
    `select p.proname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and position('clara._subledger_on_approve(' in p.prosrc) > 0
        and p.proname <> '_subledger_on_approve'
      order by p.proname`);
  return r.rows.map((x) => x.proname);
}

// ===========================================================================================
// 5 · The two new #639 doors, called by NAME with NAMED arguments.
// ===========================================================================================

/** The runtime-callable particulars door, OBO the initiator. `clara_runtime` ONLY. */
export async function completeParticularsFor({
  client, asset, particulars, opKey = null, obo,
} = {}) {
  const r = await roleQuery(ROLES.runtime, namedCall("complete_fixed_asset_particulars_for", [
    { name: "p_client", cast: "uuid" }, { name: "p_asset", cast: "uuid" },
    { name: "p_particulars", cast: "jsonb" }, { name: "p_op_key", cast: "text" },
    { name: "p_obo", cast: "uuid" },
  ]), [client, asset, JSON.stringify(particulars), opKey ?? opk("p639-forcomplete"), obo]);
  return r.rows[0].result;
}

/** #629's opener, driven exactly as `claraWork_v4` will drive it (runtime-only). */
export async function openWorkQuestion({
  task, hookToken = null, question = null, fields = null, reason = null, sourceRef = null,
} = {}) {
  const r = await roleQuery(ROLES.runtime, namedCall("open_work_question", [
    { name: "p_task", cast: "uuid" }, { name: "p_hook_token", cast: "text" },
    { name: "p_question", cast: "jsonb" }, { name: "p_fields", cast: "jsonb" },
    { name: "p_reason", cast: "text" }, { name: "p_source_ref", cast: "jsonb" },
  ]), [
    task, hookToken ?? opk("p639-hook"),
    JSON.stringify(question ?? { type: "form", text: "How should this asset be depreciated?" }),
    JSON.stringify(fields ?? FA_PARTICULARS_FIELDS), reason,
    sourceRef === null ? null : JSON.stringify(sourceRef),
  ]);
  return r.rows[0].result;
}

/** The dependent particulars question's declared fields — the shape `claraWork_v4` must send,
 *  written here so the successor contract in the report is a transcription of something PROVEN
 *  to pass `clara._assert_work_question_fields` rather than a guess. */
export const FA_PARTICULARS_FIELDS = [
  { key: "method", label: "Depreciation method", kind: "choice", required: true,
    options: [
      { value: "straight_line", label: "Straight line" },
      { value: "reducing_balance", label: "Reducing balance" },
      { value: "none", label: "Not depreciated" },
    ] },
  { key: "useful_life_months", label: "Useful life (months)", kind: "text", required: false, unit: "months" },
  { key: "rate_bps", label: "Annual rate (basis points)", kind: "text", required: false, unit: "bps" },
  { key: "residual_cents", label: "Residual value", kind: "money", required: false },
  { key: "start_date", label: "In-service (depreciation start) date", kind: "date", required: true },
  { key: "description", label: "Asset description", kind: "text", required: false },
];

export async function answerWorkQuestion(sub, { question, version, answer, opKey = null }) {
  const r = await humanQuery(sub, namedCall("answer_work_question", [
    { name: "p_question", cast: "uuid" }, { name: "p_question_version", cast: "int" },
    { name: "p_answer", cast: "jsonb" }, { name: "p_op_key", cast: "text" },
  ]), [question, version, JSON.stringify(answer), opKey ?? opk("p639-answer")]);
  return r.rows[0].result;
}

export async function pendingQuestion(sub, work) {
  const r = await humanQuery(sub,
    "select clara.get_work_pending_question(p_work => $1::uuid) as r", [work]);
  return r.rows[0].r;
}

// ===========================================================================================
// 6 · Counting helpers — a refusal must leave NOTHING behind, and both halves are asserted.
// ===========================================================================================

export async function entryCountOf(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.journal_entries where client_id=$1", [client]);
  return r.rows[0].n;
}

export async function committedReceiptCountOf(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.operation_receipts where client_id=$1 and outcome='committed'",
    [client]);
  return r.rows[0].n;
}

export async function assetCountOf(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.fixed_assets where client_id=$1", [client]);
  return r.rows[0].n;
}

