// #643 — PERIODIC STOCK ADJUSTMENTS AND SUPPLIED PAYROLL OBLIGATIONS: the battery's extra gate,
// chart, particulars builders, verb wrappers and readers (NOT a test file: the name does not end
// in `.test.mjs`, so `node --test` ignores it).
//
// It sits BESIDE `work-journal-fixtures.mjs` rather than inside it, for the reason #634's own
// sibling module states: #643's migration is a separate frontier from #623's and #634's, and the
// three lanes' cells must be able to skip independently when `db-slice-frontiers` runs this
// package against a database pinned between them.
//
// THE WIRE CONTRACT THIS MODULE ENCODES:
//
//   clara.admit_periodic_adjustment_work(p_client, p_author, p_intent_key, p_purpose, p_basis,
//                                        p_adjustment, p_basis_origin, p_source_refs, p_model)
//                                          -> {work_id, task_id, logical_op_id, status, replayed}
//   clara.list_periodic_adjustments(p_client, p_from, p_to)                          -> jsonb[]
//   clara.wake_record_journal_entry(...)   — UNCHANGED, and that is a claim this battery tests:
//                                            a periodic-adjustment Work commits through the SAME
//                                            frozen wake verb, because the typed particulars live
//                                            on the Work row rather than in the echoed basis.

import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, namedCall, opk, ROLES, MODEL, noteLane,
} from "./work-journal-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { upsertAccountClassed } from "./s6-helpers.mjs";

export * from "./work-journal-fixtures.mjs";

// ===========================================================================================
// 1 · The #643 frontier gate — keyed on the migration's STABLE STEM, never its number.
// ===========================================================================================

/** The #643 migration's STABLE STEM. */
export const PA_STEM = "periodic_adjustments$";

let _ready = null;
export async function paLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [PA_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gatePa(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gatePa(t) {
  if (await paLaneReady()) return false;
  markSkip();
  t.skip(`#643 periodic-adjustment lane absent (no ${PA_STEM} migration applied)`);
  return true;
}

// ---- #797 ------------------------------------------------------------------------------
/** #797's OWN frontier, keyed on ITS migration's stable stem. Separate from `PA_STEM` because the
 *  settlement particular is a LATER file: a database pinned at 0194 must run every #643 cell and
 *  skip only the ones below. */
export const PA_SETTLED_STEM = "payroll_settled_cents$";

let _settledReady = null;
export async function paSettledLaneReady() {
  if (_settledReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [PA_SETTLED_STEM]);
      _settledReady = r.rows[0].n > 0;
    } catch {
      _settledReady = false;
    }
  }
  return _settledReady;
}

/** `if (await gatePaSettled(t)) return;` — the same house shape, with a COUNTED skip. */
export async function gatePaSettled(t) {
  if (!(await paLaneReady()) || !(await paSettledLaneReady())) {
    markSkip();
    t.skip(`#797 settled_cents particular absent (no ${PA_SETTLED_STEM} migration applied)`);
    return true;
  }
  return false;
}
// ---- #797 ends -------------------------------------------------------------------------

// ===========================================================================================
// 2 · The closed vocabulary. Every assertion in this battery uses THESE strings.
// ===========================================================================================

export const PA_REASON = {
  invalidAdjustment: "invalid_adjustment",
  invalidPurpose: "invalid_purpose",
  allZero: "adjustment_all_zero",
  linesMismatch: "adjustment_lines_mismatch",
  accountRelationship: "adjustment_account_relationship",
  advanceNotEnrolled: "advance_not_enrolled",
  scopeOverbroad: "scope_overbroad",
  staleBasis: "stale_basis",
  correctionNotFound: "correction_target_not_found",
  correctionLive: "correction_target_live",
  correctionAlreadyCorrected: "correction_target_already_corrected",
  closedPeriod: "write_into_closed_period",
};

export const PA_PURPOSE = {
  stock: "periodic_stock_adjustment",
  payroll: "payroll_obligation",
};

/** The chart this battery posts against, on TOP of `WCHART`. The codes are the starter
 *  template's own (0150) wherever one exists, so a reader of a fixture and a reader of a real
 *  client's books see the same numbers. */
export const PACHART = {
  inventory: "1200",      // asset      — Inventory / Stock
  cost: "5040",           // expense    — Cost of Sales
  payrollExpense: "6010", // expense    — EPF Contribution (Employer)
  liability: "2100",      // liability  — EPF (KWSP) Payable
  advance: "1185",        // asset      — a staff-advance account, ENROLLED by ensurePaChart
  advanceLoose: "1186",   // asset      — the same shape, NEVER enrolled: the refusal's fixture
  bank: "1150",           // asset      — WCHART.bank, reused as the payment leg
  notAnAsset: "4100",     // income     — the "right code, wrong class" probe
};

// ===========================================================================================
// 3 · The chart + the staff-advance enrolment.
// ===========================================================================================

/** Add this battery's accounts to a client that already carries `WCHART`, and ENROL the one
 *  staff-advance account through the estate's OWN admin door (`clara.enrol_staff_advance_account`,
 *  0043) — never a direct insert, because the thing under test is exactly whether the payroll arm
 *  agrees with that register. */
export async function ensurePaChart(sub, client, label = "pa") {
  const mk = (code, name, type) =>
    upsertAccountClassed(sub, { client, code, name, type, accountClass: null, opKey: opk("pa-coa") })
      .catch((e) => noteLane(`ensurePaChart(${label}/${code}) raised ${e.code}: ${e.message}`));
  await mk(PACHART.inventory, "Inventory / Stock", "asset");
  await mk(PACHART.cost, "Cost of Sales", "expense");
  await mk(PACHART.payrollExpense, "EPF Contribution (Employer)", "expense");
  await mk(PACHART.liability, "EPF (KWSP) Payable", "liability");
  await mk(PACHART.advance, "Staff advance — Aisyah", "asset");
  await mk(PACHART.advanceLoose, "Staff advance — never enrolled", "asset");
  await mk(PACHART.notAnAsset, "Sales (pa)", "income");
  await enrolAdvance(sub, { client, code: PACHART.advance, person: "Aisyah binti Rahman" })
    .catch((e) => noteLane(`ensurePaChart(${label}/enrol) raised ${e.code}: ${e.message}`));
}

/** The estate's own admin-floored enrolment door. */
export async function enrolAdvance(sub, { client, code, person, opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.enrol_staff_advance_account(p_client => $1::uuid, p_account_code => $2::text,
       p_person_label => $3::text, p_confirm_dedicated => true, p_attestation => $4::text,
       p_op_key => $5::text) as result`,
    [client, code, person,
      "#643 rig: this account is dedicated to one named person and carries no other balances",
      opKey ?? opk("pa-enrol")]);
  return r.rows[0].result;
}

/** Retire a live enrolment through the same door's sibling (which takes the ENROLMENT id, not the
 *  account code), so a cell can prove the payroll arm reads the register rather than a snapshot
 *  taken at chart time. */
export async function retireAdvance(sub, { client, code, opKey = null }) {
  const found = await rootQuery(
    "select id from clara.staff_advance_accounts where client_id=$1 and account_code=$2 and active",
    [client, code]);
  const enrolment = found.rows[0]?.id ?? null;
  if (enrolment === null) throw new Error(`retireAdvance: no live enrolment on ${code}`);
  const r = await humanQuery(sub,
    `select clara.retire_staff_advance_account(p_client => $1::uuid, p_enrolment => $2::uuid,
       p_reason => $3::text, p_op_key => $4::text) as result`,
    [client, enrolment, "#643 rig: withdrawn on purpose", opKey ?? opk("pa-retire")]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · Particulars + basis builders. Exact minor units only — never a float anywhere here.
// ===========================================================================================

export const PA_PERIOD = { start: "2026-01-01", end: "2026-12-31" };

/**
 * The canonical STOCK particulars: an `opening_closing_count` whose movement is the accountant's
 * own arithmetic (closing − opening). The default is a RISE, so the posted pair is
 * Dr 1200 / Cr 5040.
 */
export function stockAdjustment({
  periodStart = PA_PERIOD.start,
  periodEnd = PA_PERIOD.end,
  method = "opening_closing_count",
  openingCents = 400000,
  closingCents = 650000,
  adjustmentCents = null,
  countedAt = "2026-12-31",
  countReference = "STOCKTAKE-2026-12",
  inventoryAccountCode = PACHART.inventory,
  costAccountCode = PACHART.cost,
  currency = "MYR",
  instruction = "Posting the 2026 year-end stocktake the client's supervisor signed off.",
  correctsAdjustmentId = null,
  omit = [],
} = {}) {
  const out = {
    period_start: periodStart,
    period_end: periodEnd,
    method,
    inventory_account_code: inventoryAccountCode,
    cost_account_code: costAccountCode,
    adjustment_cents: adjustmentCents ?? (closingCents - openingCents),
    currency,
    instruction,
  };
  if (method === "opening_closing_count") {
    out.opening_cents = openingCents;
    out.closing_cents = closingCents;
  }
  if (countedAt !== null) out.counted_at = countedAt;
  if (countReference !== null) out.count_reference = countReference;
  if (correctsAdjustmentId !== null) out.corrects_adjustment_id = correctsAdjustmentId;
  for (const key of omit) delete out[key];
  return out;
}

/** The canonical PAYROLL particulars: an employer EPF contribution the client supplied. */
export function payrollObligation({
  periodStart = "2026-08-01",
  periodEnd = "2026-08-31",
  obligationKind = "epf",
  expenseAccountCode = PACHART.payrollExpense,
  liabilityAccountCode = PACHART.liability,
  advanceAccountCode = null,
  paymentAccountCode = null,
  amountCents = 130000,
  settledCents = null,                                                        // #797
  currency = "MYR",
  particularsSource = "Payroll summary for August 2026 supplied by the client's HR officer",
  instruction = "Book the employer EPF contribution for August 2026 as an accrued liability.",
  correctsAdjustmentId = null,
  omit = [],
} = {}) {
  const out = {
    period_start: periodStart,
    period_end: periodEnd,
    obligation_kind: obligationKind,
    expense_account_code: expenseAccountCode,
    liability_account_code: liabilityAccountCode,
    amount_cents: amountCents,
    currency,
    particulars_source: particularsSource,
    instruction,
  };
  if (advanceAccountCode !== null) out.advance_account_code = advanceAccountCode;
  if (paymentAccountCode !== null) out.payment_account_code = paymentAccountCode;
  // #797 · the OPTIONAL settlement split. `null` means the key is ABSENT — the shape the frozen
  // chat closure produces — which is a different fact from an explicit `0` and is why this is a
  // presence flag rather than a defaulted figure.
  if (settledCents !== null) out.settled_cents = settledCents;
  if (correctsAdjustmentId !== null) out.corrects_adjustment_id = correctsAdjustmentId;
  for (const key of omit) delete out[key];
  return out;
}

/**
 * THE JOURNAL BASIS THE PARTICULARS IMPLY — the SAME derivation the web form makes, restated here
 * so a fixture and the product cannot drift. It is deliberately a pure function of the
 * particulars: `clara._assert_adjustment_relationships` is the authority on whether the two agree,
 * and a builder that "helpfully" fixed up a mismatch would make every relationship cell vacuous.
 */
export function basisForStock(adj, { postingDate = null, memo = null } = {}) {
  const amount = adj.adjustment_cents;
  const abs = Math.abs(amount);
  const rise = amount > 0;
  return {
    posting_date: postingDate ?? adj.period_end,
    memo: memo ?? `Periodic stock adjustment ${adj.period_start} to ${adj.period_end}`,
    currency: "MYR",
    lines: [
      {
        account_code: adj.inventory_account_code,
        debit_cents: rise ? abs : 0,
        credit_cents: rise ? 0 : abs,
        description: "stock movement",
      },
      {
        account_code: adj.cost_account_code,
        debit_cents: rise ? 0 : abs,
        credit_cents: rise ? abs : 0,
        description: "cost of sales",
      },
    ],
  };
}

/** The payroll basis: Dr expense for the whole obligation, and the credit split across the named
 *  liability / advance / payment legs. The SPLIT is supplied — `creditSplit` names the cents on
 *  each optional leg and the liability takes the remainder. */
export function basisForPayroll(adj, { postingDate = null, memo = null, creditSplit = {} } = {}) {
  const total = adj.amount_cents;
  const advance = creditSplit.advance ?? 0;
  const payment = creditSplit.payment ?? 0;
  const lines = [
    {
      account_code: adj.expense_account_code,
      debit_cents: total,
      credit_cents: 0,
      description: `${adj.obligation_kind} ${adj.period_start}`,
    },
    {
      account_code: adj.liability_account_code,
      debit_cents: 0,
      credit_cents: total - advance - payment,
      description: "obligation",
    },
  ];
  if (advance > 0) {
    lines.push({
      account_code: adj.advance_account_code,
      debit_cents: 0,
      credit_cents: advance,
      description: "advance recovered",
    });
  }
  if (payment > 0) {
    lines.push({
      account_code: adj.payment_account_code,
      debit_cents: 0,
      credit_cents: payment,
      description: "settled",
    });
  }
  return {
    posting_date: postingDate ?? adj.period_end,
    memo: memo ?? `${adj.obligation_kind} obligation ${adj.period_start} to ${adj.period_end}`,
    currency: "MYR",
    lines,
  };
}

// ===========================================================================================
// 5 · Verb wrappers. Named arguments only.
// ===========================================================================================

export async function admitPeriodicAdjustmentWork({
  client, author, intentKey = null, purpose = PA_PURPOSE.stock, basis, adjustment,
  origin = "user_direct", sourceRefs = [], model = MODEL,
}) {
  const r = await roleQuery(ROLES.runtime, namedCall("admit_periodic_adjustment_work", [
    { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_intent_key", cast: "text" }, { name: "p_purpose", cast: "text" },
    { name: "p_basis", cast: "jsonb" }, { name: "p_adjustment", cast: "jsonb" },
    { name: "p_basis_origin", cast: "text" }, { name: "p_source_refs", cast: "jsonb" },
    { name: "p_model", cast: "text" },
  ]), [client, author, intentKey ?? `pa-intent-${randomUUID()}`, purpose, JSON.stringify(basis),
    JSON.stringify(adjustment), origin, JSON.stringify(sourceRefs), model]);
  return r.rows[0].result;
}

export async function listPeriodicAdjustments(sub, { client, from = null, to = null }) {
  const r = await humanQuery(sub,
    "select clara.list_periodic_adjustments(p_client => $1::uuid, p_from => $2::date,"
    + " p_to => $3::date) as result", [client, from, to]);
  return r.rows[0].result;
}

export async function reverseEntry(sub, { entry, reason, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.reverse_entry(p_entry => $1::uuid, p_reason => $2::text, p_op_key => $3::text) as result",
    [entry, reason, opKey ?? opk("pa-reverse")]);
  return r.rows[0].result;
}

// ===========================================================================================
// 6 · Readers.
// ===========================================================================================

export async function adjustmentsForClient(client) {
  const r = await rootQuery(
    "select *, period_start::text as period_start_text, period_end::text as period_end_text"
    + " from clara.periodic_adjustments where client_id = $1 order by created_at", [client]);
  return r.rows;
}

export async function adjustmentRow(id) {
  const r = await rootQuery("select * from clara.periodic_adjustments where id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function adjustmentCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.periodic_adjustments where client_id = $1", [client]);
  return r.rows[0].n;
}

/** The posted entry's own `flags`, read as root — the close gate's one input. */
export async function entryFlags(entry) {
  const r = await rootQuery("select flags from clara.journal_entries where id = $1", [entry]);
  return r.rows[0]?.flags ?? null;
}

export async function entryLinksFor(sub, { client, entries }) {
  const r = await humanQuery(sub,
    "select clara.list_entry_links(p_client => $1::uuid, p_entries => $2::uuid[]) as result",
    [client, entries]);
  return r.rows[0].result;
}

/** Seed a CLOSED fiscal year on a client, as root. `clara.fiscal_years` is append-only, so every
 *  cell that needs one owns a dedicated client (the `w623.post.closed-period` precedent). */
export async function seedFiscalYear(client, {
  label = "#643 FY", startsOn, endsOn, status = "closed", openedBy,
}) {
  const r = await rootQuery(
    `insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal,
        status, fy_end_source, opened_by)
     values((select firm_id from clara.clients where id = $1), $1, $2, $3::date, $4::date,
        (select coalesce(max(ordinal), 0) + 1 from clara.fiscal_years where client_id = $1),
        $5, 'asserted', $6)
     returning id`, [client, label, startsOn, endsOn, status, openedBy]);
  return r.rows[0].id;
}
