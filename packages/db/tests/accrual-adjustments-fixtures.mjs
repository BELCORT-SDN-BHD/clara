// #652 — EVIDENCED ACCRUAL AND REVERSAL ADJUSTMENTS: the battery's gate, verb wrappers and readers
// (NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// It EXTENDS `accounting-plans-fixtures.mjs` (which extends work-cancel → work-journal) rather than
// building a second world, for that file's own reason: #652's whole claim is that an accrual RIDES
// the delivered `reversing_journal` plan contract — 0193 admits the occurrence, 0178 admits the
// Work, 0184 settles it — so the cells need exactly the chart, the basis builders, the plan verbs
// and the post/settle wrappers those files already carry. What this module adds is ONE liability
// account (the accrual's credit leg, which the #623 chart does not have) and the four #652 doors.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (#652's own doors):
//
//   clara.create_accrual_adjustment(p_client, p_purpose, p_authority_ref, p_accrual,
//       p_frequency, p_day_rule, p_day_of_month, p_timezone, p_effective_from, p_effective_to,
//       p_op_key)
//         -> {accrual_id, plan_id, revision_id, revision, kind, status, posted,
//             configuration_receipt{fn,op_key}, occurrence|null, next_occurrences[], overlap_warning}
//   clara.create_accrual_adjustment_for(p_client, p_author, …same…)   -- clara_runtime ONLY
//   clara.list_accrual_adjustments(p_client, p_from, p_to, p_side?) -- #1075 (0334) added p_side,
//       server-side, default null (every side) -> {client_id, from, to, side, accruals[]}
//   clara.get_accrual_adjustment(p_accrual)                -> {accrual_id, …, plan{}, occurrences[]}
//
// THE TYPED PARTICULARS (`p_accrual`) — every refusal path is prefixed `accrual.` so it can never
// collide with the journal basis's own (`posting_date`, `memo`, `lines[N]…`):
//
//   {expense_account_code, liability_account_code, amount_cents, currency,
//    service_period_start, service_period_end, term_source, method:{rule},
//    instruction, memo?, source_document_id?, document_service_period_id?}
//
// THE FRONTIER GATE keys on this migration's STABLE STEM (`accrual_adjustments$`), never its
// number — numbers are claimed at MERGE (standing law), and the `db-slice-frontiers` matrix runs
// this package against databases pinned at EARLIER frontiers where none of these doors exists.

import assert from "node:assert/strict";
import {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk,
  freshWorkClient, WCHART,
} from "./accounting-plans-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { upsertAccountClassed } from "./s6-helpers.mjs";

export * from "./accounting-plans-fixtures.mjs";

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** The #652 migration's STABLE STEM. */
export const ACCRUAL_STEM = "accrual_adjustments$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed against
 *  `clara.schema_migrations`, never inferred from a file listing. */
export async function accrualLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [ACCRUAL_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateAccruals(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gateAccruals(t) {
  if (await accrualLaneReady()) return false;
  markSkip();
  t.skip(`#652 accrual lane absent (no ${ACCRUAL_STEM} migration applied)`);
  return true;
}

/** The pre-integration discriminator: a FOCUSED run against a database without the lane is a real
 *  failure, and only the package-wide sweep's preloaded gate module turns it into a skip. */
export async function assertAccrualCohortPresent(t) {
  if (await accrualLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_ACCRUAL_ADJUSTMENTS === "1") {
    markSkip();
    t.skip("#652 accrual lane absent (pre-integration sweep)");
    return true;
  }
  assert.fail(
    "#652: the accrual lane is absent. Apply the migration, or set "
    + "CLARA_ALLOW_MISSING_ACCRUAL_ADJUSTMENTS=1 for the package-wide pre-integration sweep.");
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts on.
// ===========================================================================================

/** The typed `detail.reason` tokens #652's own doors raise. */
export const ACCRUAL_REASON = {
  invalidOpKey: "invalid_op_key",
  invalidAccrual: "invalid_accrual",
  silentTerm: "silent_term",
  zeroAmount: "accrual_zero_amount",
  methodUnsupported: "accrual_method_unsupported",
  accountRelationship: "accrual_account_relationship",
  termDocumentMismatch: "accrual_term_document_mismatch",
  termWindowMismatch: "accrual_term_window_mismatch",
  scheduleYieldsNone: "accrual_schedule_yields_no_occurrence",
  invalidPurpose: "invalid_purpose",
  clientNotFound: "client_not_found",
  clientInactive: "client_inactive",
  accrualNotFound: "accrual_not_found",
  authorityLost: "authority_lost",
  insufficientRole: "insufficient_role",
  operationInFlight: "operation_in_flight",
  // …and the ones this lane INHERITS verbatim rather than restating (0178/0182/0193).
  invalidBasis: "invalid_basis",
  invalidSourceRef: "invalid_source_ref",
  authorityRefInvalid: "authority_ref_invalid",
  authorityRefUnresolved: "authority_ref_unresolved",
  catchUpBeforeAuthority: "catch_up_before_authority",
};

/** The closed selection-rule set `accrual.method.rule` admits: one member per rule the schedule
 *  actually performs, and no more.
 *
 *  `stated_amount` (0222) — the frozen revision basis carries the amount a human stated and
 *  `clara._plan_occurrence_basis` only moves the posting date, so "the amount stated here, every
 *  period" is the whole of what it selects.
 *
 *  `stated_period_amount` (#937, 0303) — one figure per DUE DATE, resolved at admission by
 *  `clara._plan_accrual_period_line` and handed to the shared basis builder as a line override;
 *  the revision's constant is never a fallback. It joined the set when the lane that HONOURS it
 *  landed, which is the rule review round 1's finding A2 stated.
 *
 *  `source_document_amount` and `prior_period_amount` stay withdrawn (owner ruling 2026-09-18):
 *  nothing performs them. */
export const ACCRUAL_METHODS = ["stated_amount", "stated_period_amount"];

/** The liability account this lane accrues into. The #623 chart (`WCHART`) carries an expense, a
 *  bank asset, a receivable control and a retired expense — no liability at all — so the accrual's
 *  CREDIT leg needs one, and a control-classed leg is refused by the relationship wall. */
export const ACHART = {
  expense: WCHART.expense,      // 6100 Office Rent — the debit leg
  liability: "2020",            // liability, no control class — the accrual credit leg
  bank: WCHART.bank,            // 1150 — the asset an accrual may NOT credit
  payableControl: "2050",       // liability, account_class='payable' — the CONTROL leg refused
  retired: WCHART.retired,      // 6199 — deactivated, the inactive-account probe
};

export const ACCRUAL_TZ = "Asia/Kuala_Lumpur";

// ===========================================================================================
// 3 · The world this battery adds on top of the plan world.
// ===========================================================================================

/** A brand-new client of `sub`'s firm carrying BOTH charts — the #623 one and this lane's two
 *  liability accounts. Every cell that writes an accrual takes one of these, so an append-only
 *  accrual row can never leak into a sibling cell. */
export async function freshAccrualClient(sub, tag = "p652") {
  const client = await freshWorkClient(sub, tag);
  await ensureAccrualChart(sub, client);
  return client;
}

export async function ensureAccrualChart(sub, client) {
  await upsertAccountClassed(sub, {
    client, code: ACHART.liability, name: "Accruals", type: "liability", accountClass: null,
    opKey: opk("p652-coa"),
  });
  await upsertAccountClassed(sub, {
    client, code: ACHART.payableControl, name: "Trade Creditors (652)", type: "liability",
    accountClass: "payable", opKey: opk("p652-coa"),
  });
}

/** The canonical, complete set of typed particulars. Every cell derives its own by spreading this
 *  and overriding ONE field, so a refusal cell can never accidentally be testing two holes. */
export function accrual({
  expenseAccount = ACHART.expense,
  liabilityAccount = ACHART.liability,
  cents = 120000,
  currency = "MYR",
  servicePeriodStart = "2026-07-01",
  servicePeriodEnd = "2026-07-31",
  termSource = "human_stated",
  method = { rule: "stated_amount" },
  instruction = "the client's standing instruction of 2026-06-30, minuted by the engagement partner",
  memo = "Accrued July office rent",
  sourceDocumentId = null,
  documentServicePeriodId = null,
  // #937 — the PER-PERIOD amounts, present ONLY under the `stated_period_amount` rule. `null`
  // leaves the key off the object entirely, which is what every `stated_amount` cell sends and
  // what 0303's own wall requires of them.
  periodAmounts = null,
  omit = [],
} = {}) {
  const a = {
    expense_account_code: expenseAccount,
    liability_account_code: liabilityAccount,
    amount_cents: cents,
    currency,
    service_period_start: servicePeriodStart,
    service_period_end: servicePeriodEnd,
    term_source: termSource,
    method,
    instruction,
    memo,
    source_document_id: sourceDocumentId,
    document_service_period_id: documentServicePeriodId,
  };
  if (periodAmounts !== null) a.period_amounts = periodAmounts;
  for (const k of omit) delete a[k];
  return a;
}

// ===========================================================================================
// 4 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a divergence
//     there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

const CREATE_SPECS = [
  { name: "p_client", cast: "uuid" }, { name: "p_purpose", cast: "text" },
  { name: "p_authority_ref", cast: "jsonb" }, { name: "p_accrual", cast: "jsonb" },
  { name: "p_frequency", cast: "text" }, { name: "p_day_rule", cast: "text" },
  { name: "p_day_of_month", cast: "int" }, { name: "p_timezone", cast: "text" },
  { name: "p_effective_from", cast: "date" }, { name: "p_effective_to", cast: "date" },
  { name: "p_op_key", cast: "text" },
];

function createParams({
  client, purpose, authorityRef, accrual: a, frequency, dayRule, dayOfMonth, timezone,
  effectiveFrom, effectiveTo, opKey,
}) {
  return [client, purpose, JSON.stringify(authorityRef), JSON.stringify(a), frequency, dayRule,
    dayOfMonth, timezone, effectiveFrom, effectiveTo, opKey];
}

/** The HUMAN door — `clara_authenticated`, bookkeeper floor inside its own body. */
export async function createAccrualAdjustment(sub, {
  client, purpose = "Monthly office rent accrual", authorityRef,
  accrual: a = accrual(), frequency = "monthly", dayRule = "last_day_of_month",
  dayOfMonth = null, timezone = ACCRUAL_TZ, effectiveFrom, effectiveTo = null, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("create_accrual_adjustment", CREATE_SPECS),
    createParams({
      client, purpose, authorityRef, accrual: a, frequency, dayRule, dayOfMonth, timezone,
      effectiveFrom, effectiveTo, opKey: opKey ?? opk("p652-create"),
    }));
  return r.rows[0].result;
}

/** The OBO door — `clara_runtime` ONLY, actor taken from an ARGUMENT because a runtime connection
 *  carries no human JWT. Invoked on a REAL least-privileged runtime connection, never as root. */
export async function createAccrualAdjustmentFor({
  client, author, purpose = "Monthly office rent accrual", authorityRef,
  accrual: a = accrual(), frequency = "monthly", dayRule = "last_day_of_month",
  dayOfMonth = null, timezone = ACCRUAL_TZ, effectiveFrom, effectiveTo = null, opKey = null,
}) {
  const specs = [CREATE_SPECS[0], { name: "p_author", cast: "uuid" }, ...CREATE_SPECS.slice(1)];
  const params = createParams({
    client, purpose, authorityRef, accrual: a, frequency, dayRule, dayOfMonth, timezone,
    effectiveFrom, effectiveTo, opKey: opKey ?? opk("p652-create-for"),
  });
  const r = await roleQuery(ROLES.runtime, namedCall("create_accrual_adjustment_for", specs),
    [params[0], author, ...params.slice(1)]);
  return r.rows[0].result;
}

export async function listAccrualAdjustments(sub, { client, from = null, to = null, side = null } = {}) {
  // #1075 (0334) added p_side FOURTH, server-side, default null. The parameter is sent to the
  // door ONLY when a caller actually asks for it: every OTHER caller of this fixture (the base
  // #652 battery, gated on 0222 alone, and #942's own revenue-side battery, gated on 0304) never
  // passes `side`, and this keeps their named call at the exact three-argument shape those
  // batteries have always sent — so neither becomes an unstated dependency on 0334 having
  // applied. Only accrual-list-side-filter.test.mjs (frontier-gated on 0334's own stem) passes
  // `side` and reaches the fourth argument.
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_from", cast: "date" }, { name: "p_to", cast: "date" },
  ];
  const params = [client, from, to];
  if (side !== null) {
    specs.push({ name: "p_side", cast: "text" });
    params.push(side);
  }
  const r = await humanQuery(sub, namedCall("list_accrual_adjustments", specs), params);
  return r.rows[0].result;
}

export async function getAccrualAdjustment(sub, accrualId) {
  const r = await humanQuery(sub, namedCall("get_accrual_adjustment", [
    { name: "p_accrual", cast: "uuid" },
  ]), [accrualId]);
  return r.rows[0].result;
}

// ===========================================================================================
// 5 · Readers. Root-level, and ONLY ever for the corroborating half of an assertion whose SUBJECT
//     was exercised through a door — never for the claim under test (WORK-ORDER rule 10).
// ===========================================================================================

export async function accrualRows(client) {
  const r = await rootQuery(
    `select id, firm_id, client_id, plan_id, revision, purpose, expense_account_code,
            liability_account_code, amount_cents, currency,
            effective_from::text as effective_from,
            case when effective_to is null then null else effective_to::text end as effective_to,
            service_period_start::text as service_period_start,
            service_period_end::text as service_period_end, term_source,
            document_service_period_id, method, authority_kind, authority_ref,
            source_document_id, instruction, corrects_accrual_id, corrected_by_accrual_id,
            recorded_by, created_at
       from clara.accrual_adjustments where client_id=$1 order by created_at`, [client]);
  return r.rows;
}

export async function accrualCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.accrual_adjustments where client_id=$1", [client]);
  return r.rows[0].n;
}

/** Every configuration receipt (`clara.op_receipts`) whose key starts with `opKeyPrefix`. The
 *  nested-reservation proof reads it: the outer door and the plan door hold DISTINCT rows on the
 *  same `(firm, fn, op_key)` triple (0004:46). */
export async function opReceiptRows(firm, opKeyPrefix) {
  const r = await rootQuery(
    `select fn, op_key, result is not null as finished
       from clara.op_receipts where firm_id=$1 and op_key like $2 order by fn`,
    [firm, `${opKeyPrefix}%`]);
  return r.rows;
}

/** Whether the 0140 service-period carrier and its human door are on this chain. A cell that needs
 *  a document-bound term treats their absence as a counted skip rather than a failure: 0140 is a
 *  DIFFERENT lane's frontier and #652 does not depend on it for its own term law. */
export async function servicePeriodLaneReady() {
  const r = await rootQuery(
    `select (to_regclass('clara.document_service_periods') is not null
             and to_regprocedure('clara.record_document_service_period(uuid,date,date,text,text)')
                 is not null) as ok`);
  return r.rows[0].ok === true;
}

/** A document FILED to this client through the estate's own doors, carrying a LIVE human-stated
 *  service period written by 0140's own human door (`record_document_service_period`, bookkeeper
 *  floor, HUMAN-ONLY BY LAW). Returns `{document, servicePeriodId}`.
 *
 *  EVERY STEP IS A GOVERNED DOOR. A hand-built filing row would prove the accrual door reads rows;
 *  this proves it reads BOOKS — and the term it binds is one a human anchored, which is the whole
 *  of 0140's "a model-derived period is NOT an anchored fact" law. */
export async function filedDocumentWithTerm(sub, { firm, client, start, end }) {
  const { seedVerifiedDocument, fileDocument } = await import("./rig-docs-fixtures.mjs");
  const doc = await seedVerifiedDocument({ firm, client: null, filename: `p652-${opk("doc")}.pdf` });
  await fileDocument(sub, { document: doc.documentId, client, opKey: opk("p652-file") });
  const r = await humanQuery(sub, namedCall("record_document_service_period", [
    { name: "p_document", cast: "uuid" }, { name: "p_period_start", cast: "date" },
    { name: "p_period_end", cast: "date" }, { name: "p_basis", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [doc.documentId, start, end,
    "#652 rig: the supplier's own invoice states this service term on its face",
    opk("p652-term")]);
  const answer = r.rows[0].result;
  return {
    document: doc.documentId,
    servicePeriodId: answer?.service_period_id ?? answer?.id ?? answer?.period_id ?? null,
    answer,
  };
}

/** The 0140 term row, read UNDER THE BOOKKEEPER PERSONA rather than as root — `p_dsp_human`
 *  (0140:619-627) carries a bookkeeper floor, and the whole point of the read is that a
 *  least-privileged human can see the term the accrual bound. */
export async function servicePeriodAsHuman(sub, id) {
  const r = await humanQuery(sub,
    `select id, document_id, period_start::text as period_start, period_end::text as period_end,
            basis_kind, superseded_at
       from clara.document_service_periods where id = $1::uuid`, [id]);
  return r.rows[0] ?? null;
}

export { assert };
