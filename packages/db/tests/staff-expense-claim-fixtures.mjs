// #638 — STAFF EXPENSE CLAIMS, EMPLOYEE PAYABLES AND ADVANCE SETTLEMENT: the battery's extra
// frontier gate, chart, claim builders, verb wrappers and readers (NOT a test file: the name does
// not end in `.test.mjs`, so `node --test` ignores it).
//
// It sits BESIDE `periodic-adjustment-fixtures.mjs` for the reason that module states about
// `work-journal-fixtures.mjs`: #638's migration is a separate frontier from #623's, #634's and
// #643's, and the four lanes' cells must be able to skip independently when `db-slice-frontiers`
// runs this package against a database pinned between them.
//
// THE WIRE CONTRACT THIS MODULE ENCODES:
//
//   clara.admit_staff_expense_claim_work(p_client, p_author, p_intent_key, p_claim,
//                                        p_basis_origin, p_source_refs, p_model)
//                                          -> {work_id, task_id, logical_op_id, status,
//                                              replayed, claim_id}
//   clara.list_staff_expense_claims(p_client, p_from, p_to)                          -> jsonb[]
//   clara.get_staff_expense_claim(p_claim)                                           -> jsonb
//   clara.get_work_claim_origin(p_work)                                              -> jsonb|null
//   clara.wake_record_journal_entry(...)  — UNCHANGED, and that is the claim this battery tests:
//                                           a staff expense claim is a `journal_entry`-purpose
//                                           Work, so it commits through the SAME frozen wake verb
//                                           with the posting core untouched.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, namedCall, opk, ROLES, MODEL, noteLane,
} from "./work-journal-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { upsertAccountClassed } from "./s6-helpers.mjs";
import { asRole } from "./rig-helpers.mjs";

export * from "./periodic-adjustment-fixtures.mjs";

// #634's document/evidence helpers, re-exported BY NAME rather than by a second `export *` (two
// star exports that both carry `reverseEntry` would silently exclude it). AC4's unwind has a
// document half — "the document released by `t_entry_evidence_release`" — and these are the
// estate's own doors for it.
export {
  evidenceDocument, docRef, linksForEntry, linksForDocument,
} from "./journal-work-evidence-fixtures.mjs";

// ===========================================================================================
// 1 · The #638 frontier gate — keyed on the migration's STABLE STEM, never its number.
// ===========================================================================================

/** The #638 migration's STABLE STEM. */
export const SEC_STEM = "staff_expense_claims$";

let _ready = null;
export async function secLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [SEC_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/**
 * `if (await gateSec(t)) return;` — the house per-cell frontier gate.
 *
 * IT SKIPS ONLY FOR THE PACKAGE-WIDE PRE-INTEGRATION SWEEP, which preloads
 * `tests/staff-expense-claim-preintegration-gate.mjs` and thereby sets the env var below. A
 * FOCUSED invocation does not preload it and therefore FAILS loudly when the lane is absent — the
 * `firm-document-limits` idiom, and the reason a skipped battery is never evidence.
 */
export async function gateSec(t) {
  if (await secLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_STAFF_EXPENSE_CLAIMS === "1") {
    markSkip();
    t.skip(`#638 staff-expense-claim lane absent (no ${SEC_STEM} migration applied)`);
    return true;
  }
  assert.fail(
    "#638: the staff-expense-claim lane is absent. Apply 0221_staff_expense_claims.sql (or its "
    + "numbered suite copy), or set CLARA_ALLOW_MISSING_STAFF_EXPENSE_CLAIMS=1 for the "
    + "package-wide pre-integration sweep.",
  );
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary. Every assertion in this battery uses THESE strings.
// ===========================================================================================

export const SEC_REASON = {
  invalidClaim: "invalid_claim",
  claimantMissing: "claimant_missing",
  claimantNotEnrolled: "claimant_not_enrolled",
  incurredMissing: "incurred_date_missing",
  incurredAfterPosting: "incurred_after_posting",
  itemAccountNotExpense: "item_account_not_expense",
  itemsDoNotSum: "items_do_not_sum",
  allZero: "claim_all_zero",
  payableIsControl: "payable_account_is_control",
  advanceNotEnrolled: "advance_not_enrolled",
  allocationMismatch: "advance_allocation_mismatch",
  overApplication: "advance_over_application",
  movementUnregistered: "advance_movement_unregistered",
  applicationMissing: "advance_application_missing",
  genericControlLeg: "generic_control_leg",
  closedPeriod: "write_into_closed_period",
  correctionAlreadyCorrected: "correction_target_already_corrected",
  correctionLive: "correction_target_live",
  sourceAlreadyPosted: "source_already_posted",
  intentConflict: "intent_payload_conflict",
};

export const SETTLEMENT = {
  reimbursement: "reimbursement",
  advance: "advance_application",
  settled: "already_settled",
};

/** The chart this battery posts against, ON TOP of `WCHART` and `PACHART`. Codes are the starter
 *  template's own (0150) wherever one exists. */
export const SECHART = {
  travel: "6200",         // expense   — a claimable expense account
  meals: "6210",          // expense   — a second one, so a claim can be ITEMISED
  payable: "2010",        // liability — Other Payables, account_class NULL (non-control)
  control: "2000",        // liability — Trade Payables CONTROL (account_class = 'payable')
  bank: "1150",           // asset     — WCHART.bank, reused as the already-settled payment leg
  advance: "1190",        // asset     — a staff-advance account, ENROLLED by ensureSecChart
  advanceFresh: "1191",   // asset     — never enrolled: the AUTO-ENROLMENT fixture
  notAnExpense: "1200",   // asset     — the "right code, wrong class" probe
};

// ===========================================================================================
// 3 · The chart.
// ===========================================================================================

/** Add this battery's accounts to a client that already carries `WCHART`, and ENROL the one
 *  staff-advance account through the estate's OWN admin door (0043). `advanceFresh` is left
 *  UNENROLLED on purpose: the auto-enrolment cells need a code with no live enrolment. */
export async function ensureSecChart(sub, client, label = "sec") {
  const mk = (code, name, type, accountClass = null) =>
    upsertAccountClassed(sub, { client, code, name, type, accountClass, opKey: opk("sec-coa") })
      .catch((e) => noteLane(`ensureSecChart(${label}/${code}) raised ${e.code}: ${e.message}`));
  await mk(SECHART.travel, "Travel and Accommodation", "expense");
  await mk(SECHART.meals, "Staff Meals and Entertainment", "expense");
  await mk(SECHART.payable, "Other Payables", "liability", null);
  await mk(SECHART.control, "Trade Payables Control", "liability", "payable");
  await mk(SECHART.advance, "Staff advance — Farah", "asset");
  await mk(SECHART.advanceFresh, "Staff advance — new claimant", "asset");
  await enrolAdvanceFor(sub, { client, code: SECHART.advance, person: "Farah binti Idris" })
    .catch((e) => noteLane(`ensureSecChart(${label}/enrol) raised ${e.code}: ${e.message}`));
}

/** 0043's admin-floored enrolment door, under its own name so this module does not shadow the
 *  periodic-adjustment fixture's `enrolAdvance`. */
export async function enrolAdvanceFor(sub, { client, code, person, opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.enrol_staff_advance_account(p_client => $1::uuid, p_account_code => $2::text,
       p_person_label => $3::text, p_confirm_dedicated => true, p_attestation => $4::text,
       p_op_key => $5::text) as result`,
    [client, code, person,
      "#638 rig: this account is dedicated to one named person and carries no other balances",
      opKey ?? opk("sec-enrol")]);
  return r.rows[0].result;
}

/** The LIVE enrolment id for a code on a client, or null. */
export async function liveEnrolment(client, code) {
  const r = await rootQuery(
    "select id from clara.staff_advance_accounts where client_id=$1 and account_code=$2 and active",
    [client, code]);
  return r.rows[0]?.id ?? null;
}

// ===========================================================================================
// 4 · Claim builders. Exact minor units only — never a float anywhere here.
// ===========================================================================================

export const SEC_DATE = { incurred: "2026-03-04", posting: "2026-03-31" };

/**
 * The canonical REIMBURSEMENT claim: two itemised expense lines summing exactly to the claim,
 * credited to the NON-CONTROL `2010 Other Payables`.
 *
 * `claimant` names an EXISTING enrolment by account code — the door resolves a live enrolment on
 * that code and auto-enrols only when there is none.
 */
export function claim({
  claimantCode = SECHART.advance,
  personLabel = "Farah binti Idris",
  attestation = "#638 rig: dedicated to one named person; not a related-party balance",
  confirmDedicated = true,
  identifier = null,
  enrolmentId = null,
  sourceKind = "instruction",
  instruction = "Farah's March travel claim, two receipts attached to the email she sent.",
  incurredDate = SEC_DATE.incurred,
  postingDate = SEC_DATE.posting,
  items = null,
  amountCents = null,
  settlement = SETTLEMENT.reimbursement,
  payableAccountCode = SECHART.payable,
  advanceAccountCode = null,
  advanceId = null,
  paymentAccountCode = null,
  correctsClaimId = null,
  currency = "MYR",
} = {}) {
  const lines = items ?? [
    { description: "KL–Penang return flight", expense_account_code: SECHART.travel, amount_cents: 48000,
      supplied_tax: { stated_code: "SR", stated_cents: 2880, note: "as printed on the receipt" } },
    { description: "Client dinner", expense_account_code: SECHART.meals, amount_cents: 12500 },
  ];
  const total = amountCents ?? lines
    .filter((l) => !l.pending_fact)
    .reduce((n, l) => n + (typeof l.amount_cents === "number" ? l.amount_cents : 0), 0);
  const claimant = enrolmentId !== null
    ? { enrolment_id: enrolmentId }
    : {
      account_code: claimantCode,
      person_label: personLabel,
      attestation,
      confirm_dedicated: confirmDedicated,
      ...(identifier === null ? {} : { identifier }),
    };
  const out = {
    claimant,
    source_kind: sourceKind,
    instruction,
    incurred_date: incurredDate,
    posting_date: postingDate,
    items: lines,
    amount_cents: total,
    currency,
    settlement,
  };
  if (settlement === SETTLEMENT.reimbursement) out.payable_account_code = payableAccountCode;
  if (settlement === SETTLEMENT.advance) {
    out.advance_account_code = advanceAccountCode ?? claimantCode;
    if (advanceId !== null) out.advance_id = advanceId;
  }
  if (settlement === SETTLEMENT.settled) out.payment_account_code = paymentAccountCode ?? SECHART.bank;
  if (correctsClaimId !== null) out.corrects_claim_id = correctsClaimId;
  return out;
}

/** The journal basis the door DERIVES from a claim — restated here so a cell can post the Work
 *  through `clara.wake_record_journal_entry` with the exact bytes admission stored. */
export function basisForClaim(c) {
  const lines = c.items
    .filter((i) => !i.pending_fact)
    .map((i) => ({
      account_code: String(i.expense_account_code).trim(),
      debit_cents: i.amount_cents,
      credit_cents: 0,
      description: String(i.description).trim().slice(0, 2000),
    }));
  const creditCode = c.settlement === SETTLEMENT.reimbursement
    ? c.payable_account_code
    : c.settlement === SETTLEMENT.advance ? c.advance_account_code : c.payment_account_code;
  lines.push({
    account_code: String(creditCode).trim(),
    debit_cents: 0,
    credit_cents: c.amount_cents,
    description: c.settlement,
  });
  return {
    posting_date: c.posting_date,
    memo: String(c.instruction).trim().slice(0, 4000),
    currency: "MYR",
    lines,
  };
}

// ===========================================================================================
// 5 · Verb wrappers. Named arguments only.
// ===========================================================================================

export async function admitStaffExpenseClaimWork({
  client, author, intentKey = null, claim: c, origin = "user_direct", sourceRefs = [],
  model = MODEL,
}) {
  const r = await roleQuery(ROLES.runtime, namedCall("admit_staff_expense_claim_work", [
    { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_intent_key", cast: "text" }, { name: "p_claim", cast: "jsonb" },
    { name: "p_basis_origin", cast: "text" }, { name: "p_source_refs", cast: "jsonb" },
    { name: "p_model", cast: "text" },
  ]), [client, author, intentKey ?? `sec-intent-${randomUUID()}`, JSON.stringify(c), origin,
    JSON.stringify(sourceRefs), model]);
  return r.rows[0].result;
}

/**
 * HOLD THE DOOR'S OWN CLIENT RUNG from a THIRD session, so two concurrent admissions are BOTH
 * past their (unlocked) world half before either can take it.
 *
 * `clara.admit_staff_expense_claim_work` step 6 takes `pg_advisory_xact_lock(203005004,
 * hashtext(client))`. A race that is not barriered is a coin toss: whichever caller reaches step 5
 * after the other has committed refuses for the ordinary reason and proves nothing about the
 * window. Holding the rung makes the window DETERMINISTIC — both callers pass step 5 against the
 * same world, then queue.
 *
 * `fn` receives a `release()`; the lock also dies with the transaction, so a throwing body cannot
 * wedge the rig.
 */
export async function withClientRungHeld(client, fn) {
  return asRole(ROLES.runtime, async (c) => {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(203005004, hashtext($1::text))", [client]);
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await c.query("commit");
    };
    try {
      return await fn(release);
    } finally {
      await release().catch(() => { /* the transaction's end releases it anyway */ });
    }
  });
}

/** Wait until `n` sessions are BLOCKED on the claim door's client rung (classid 203005004), read
 *  from `pg_locks` rather than slept for — a fixed sleep is the flake this battery must not add. */
export async function awaitRungWaiters(n, timeoutMs = 30000) {
  const started = Date.now();
  for (;;) {
    const waiting = (await rootQuery(
      "select count(*)::int as n from pg_locks"
      + " where locktype='advisory' and classid=203005004 and not granted")).rows[0].n;
    if (waiting >= n) return waiting;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `awaitRungWaiters: ${waiting} of ${n} session(s) queued on the claim door's client rung `
        + `after ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function listStaffExpenseClaims(sub, { client, from = null, to = null }) {
  const r = await humanQuery(sub,
    "select clara.list_staff_expense_claims(p_client => $1::uuid, p_from => $2::date,"
    + " p_to => $3::date) as result", [client, from, to]);
  return r.rows[0].result;
}

export async function getStaffExpenseClaim(sub, claimId) {
  const r = await humanQuery(sub,
    "select clara.get_staff_expense_claim(p_claim => $1::uuid) as result", [claimId]);
  return r.rows[0].result;
}

export async function getWorkClaimOrigin(sub, workId) {
  const r = await humanQuery(sub,
    "select clara.get_work_claim_origin(p_work => $1::uuid) as result", [workId]);
  return r.rows[0].result;
}

// ===========================================================================================
// 6 · Readers.
// ===========================================================================================

export async function claimsForClient(client) {
  const r = await rootQuery(
    "select *, incurred_date::text as incurred_date_text, posting_date::text as posting_date_text"
    + " from clara.staff_expense_claims where client_id = $1 order by created_at", [client]);
  return r.rows;
}

export async function claimRow(id) {
  const r = await rootQuery(
    "select *, incurred_date::text as incurred_date_text, posting_date::text as posting_date_text"
    + " from clara.staff_expense_claims where id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function claimCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.staff_expense_claims where client_id = $1", [client]);
  return r.rows[0].n;
}

export async function claimStatus(claimId) {
  const r = await rootQuery(
    "select * from clara.staff_expense_claim_status where claim_id = $1 order by recorded_at, state",
    [claimId]);
  return r.rows;
}

export async function applicationsForEntry(entry) {
  const r = await rootQuery(
    "select *, effective_date::text as effective_date_text from clara.staff_advance_applications"
    + " where entry_id = $1 order by created_at", [entry]);
  return r.rows;
}

export async function advancesForClient(client) {
  const r = await rootQuery(
    "select *, issue_date::text as issue_date_text from clara.staff_advances where client_id = $1"
    + " order by created_at", [client]);
  return r.rows;
}

/** 0043's own outstanding arithmetic, asked as root so a cell never re-derives it. */
export async function advanceOutstanding(advanceId, asOf) {
  const r = await rootQuery(
    "select clara._adv_outstanding($1::uuid, $2::date) as n", [advanceId, asOf]);
  return Number(r.rows[0].n);
}

/**
 * Seed one staff advance the way the books really make one: an ordinary coded entry DEBITING the
 * enrolled account, drafted by `maker` and approved by a DISTINCT human, so 0043's soft-birth arm
 * (`clara._adv_on_approve` arm 3, reached through `clara._approve_entry_core` — one of the four
 * pinned callers) births the `clara.staff_advances` row. Never a direct insert: the thing under
 * test on the claim lane is whether the register agrees with the GL, and a hand-written register
 * row would make that agreement a fixture rather than a fact.
 */
export async function seedAdvance(maker, checker, {
  client, code = SECHART.advance, cents, issueDate, memo = "#638 rig: advance paid to the claimant",
}) {
  const { freshResolution, approveEntry } = await import("./rig-fixtures.mjs");
  const { draftEntryV3 } = await import("./s6-helpers.mjs");
  const before = (await advancesForClient(client)).length;
  const d = await draftEntryV3(maker, {
    client,
    resolution: await freshResolution(maker, client, { subjectKind: "manual", subjectId: null }),
    postingDate: issueDate,
    memo,
    lines: [
      { account_code: code, debit_cents: cents, credit_cents: 0, description: "advance paid out" },
      { account_code: SECHART.bank, debit_cents: 0, credit_cents: cents, description: "from bank" },
    ],
    opKey: opk("sec-disburse"),
  });
  await approveEntry(checker, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("sec-approve"),
  });
  const rows = await advancesForClient(client);
  if (rows.length !== before + 1) {
    throw new Error(`seedAdvance: expected ONE new staff_advances row, had ${before}, now ${rows.length}`);
  }
  return { entry: d.entry_id, advance: rows[rows.length - 1] };
}

/** The entry's lines WITH their row ids — `linesOf` (work-journal-fixtures) projects neither `id`
 *  nor the line the register keys an allocation to, and the belt reads coverage PER LINE, so a
 *  cell that wants to prove the allocation sits on the very credit leg needs the id. */
export async function linesWithIds(entry) {
  const r = await rootQuery(
    "select id, line_no, account_code, debit_cents, credit_cents, description"
    + " from clara.journal_lines where entry_id=$1 order by line_no", [entry]);
  return r.rows;
}
