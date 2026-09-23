// #940 — A PER-CLIENT ROSTER OF PREPAYMENT ACCOUNTS GATES AMORTISATION AHEAD OF THE SHARED
// NEGATIVE WALL: this battery's frontier gate, verb wrappers and readers (NOT a test file: the
// name does not end in `.test.mjs`, so `node --test` ignores it).
//
// IT EXTENDS #939'S BATTERY RATHER THAN BUILDING A FOURTH WORLD. `prepayment-stated-term-fixtures.mjs`
// already re-exports #653's whole prepayment scene (a closeable fiscal year, a prepaid-asset
// account, an expense target, an APPROVED document-bound recognition, a real `clara.accounting_work`
// for the authority reference) plus the memo-only recognition #939 added. Everything below is the
// one thing those batteries have no shape for: the ROSTER — who may be enrolled, by whom, with
// what reason, and what the schedule door does when nobody has been.
//
// THE FRONTIER GATE keys on this migration's STABLE STEM (`prepayment_account_roster$`), never its
// number — numbers are claimed at MERGE (packages/db/README.md), and the `db-slice-frontiers`
// matrix runs this package against databases pinned at EARLIER frontiers.

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import { rootQuery, humanQuery, namedCall, opk } from "./prepayment-stated-term-fixtures.mjs";

export * from "./prepayment-stated-term-fixtures.mjs";

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** This migration's STABLE STEM. */
export const ROSTER_STEM = "prepayment_account_roster$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function rosterLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [ROSTER_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** The pre-integration discriminator: a FOCUSED run against a database without the lane is a real
 *  failure, and only the package-wide sweep's preloaded gate module turns it into a skip. A skip
 *  is not evidence. */
export async function assertRosterLanePresent(t) {
  if (await rosterLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_ACCOUNT_ROSTER === "1") {
    console.warn(
      `SKIP prepayment-account-roster: no ${ROSTER_STEM} migration applied (pre-integration run).`);
    t.skip("#940 prepayment-account-roster lane absent — explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#940: the prepayment-account roster lane is absent. Apply 0306_prepayment_account_roster.sql, or "
    + "set CLARA_ALLOW_MISSING_PREPAYMENT_ACCOUNT_ROSTER=1 for the package-wide pre-integration sweep.");
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts on. #940 mints ONE new refusal token for the
//     enrolment act and reuses 0140/0223's `prepayment_source_unfit` — with a NEW AXIS — at the
//     schedule door, because "this source entry is not fit to be amortised" is exactly what a
//     debited leg on no roster says. No second token for an old fact.
// ===========================================================================================

/** The ENROLMENT family's SQLSTATE. `clara.upsert_fa_account_profile` (0041) and
 *  `clara.retire_fa_account_profile` both answer CLR37 for exactly this act — an account-enrolment
 *  register refusing a code — and the ticket's own words are "in the shape of the fixed-asset
 *  account profiles". */
export const CLR37 = "CLR37";

export const ROSTER_REASON = {
  invalid: "prepayment_account_enrolment_invalid",
};

/** The axes the enrolment door answers with. The first five are the SHARED wall's own tokens,
 *  carried through verbatim (`clara._adj_line_eligibility_breach`, 0042) rather than restated. */
export const ROSTER_AXIS = {
  accountUnknown: "account_unknown",
  accountInactive: "account_inactive",
  controlAccount: "control_account",
  bankAccount: "bank_account",
  accountReserved: "account_reserved",
  notAssetClass: "not_asset_class",
  purposeUnknown: "purpose_unknown",
  purposeRuleNotStated: "purpose_rule_not_stated",
  reasonMissing: "reason_missing",
  notEnrolled: "not_enrolled",
};

/** The schedule door's NEW axis on its existing `prepayment_source_unfit` token. */
export const PREPAID_NOT_ENROLLED_AXIS = "prepaid_account_not_enrolled";

export const ROSTER_PURPOSE = { prepayment: "prepayment", deferredRevenue: "deferred_revenue" };

export const ENROL_DOOR_SIG = "clara.enrol_prepayment_account(uuid,text,text,text,text)";
export const RETIRE_DOOR_SIG = "clara.retire_prepayment_account(uuid,text,text,text)";

export const ENROL_REASON_TEXT =
  "#940 battery: this account holds the client's prepaid insurance and nothing else";

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

export async function enrolPrepaymentAccount(sub, {
  client, account, purpose = ROSTER_PURPOSE.prepayment, reason = ENROL_REASON_TEXT, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("enrol_prepayment_account", [
    { name: "p_client", cast: "uuid" }, { name: "p_account", cast: "text" },
    { name: "p_purpose", cast: "text" }, { name: "p_reason", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [client, account, purpose, reason, opKey ?? opk("p940-enrol")]);
  return r.rows[0].result;
}

export async function retirePrepaymentAccount(sub, {
  client, account, purpose = ROSTER_PURPOSE.prepayment, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("retire_prepayment_account", [
    { name: "p_client", cast: "uuid" }, { name: "p_account", cast: "text" },
    { name: "p_purpose", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [client, account, purpose, opKey ?? opk("p940-retire")]);
  return r.rows[0].result;
}

/**
 * AN APPROVED, DOCUMENT-BOUND RECOGNITION WHOSE ONE DEBITED ASSET LEG IS AN ORDINARY, ELIGIBLE,
 * UNENROLLED account — the shape #940 exists for, and the one #653's battery has no fixture of.
 *
 * `ineligibleAssetEntry` proves the NEGATIVE wall on a receivable control account; this proves the
 * gap that wall leaves open. The code below passes every one of the wall's five axes — active,
 * no `account_class`, no bank stamp, no bank binding, no fixed-asset or staff-advance reservation —
 * so before this ticket the door would derive a twelve-month amortisation of a deposit into expense
 * and arm B would advertise it. Its document carries a live service period, so the refusal under
 * test is the ROSTER rather than the absent-term one.
 */
export async function plainAssetRecognition(scene, {
  code, name = "Utility deposit", cents = 66000, tag = "plain", recordTerm = true,
} = {}) {
  const { draftEntryV3, approveEntry, freshResolution } = await import("./wave-a-reads.mjs");
  const { extraDocument, recordPeriod, account: mintAccount } =
    await import("./prepayment-schedule-fixtures.mjs");
  await mintAccount(scene.alice, { client: scene.client, code, name, type: "asset" });
  const doc = await extraDocument(scene, { tag });
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    resolution: await freshResolution(scene.alice, scene.client,
      { subjectKind: "document", subjectId: doc.documentId }),
    memo: `#940 unenrolled prepaid leg ${randomUUID().slice(0, 8)}`,
    postingDate: scene.postingDate,
    document: doc.documentId, sha256: doc.sha256,
    lines: [
      { account_code: code, debit_cents: cents, credit_cents: 0, description: "deposit" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
    opKey: opk("p940-plain"),
  });
  await approveEntry(scene.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p940-plaina") });
  if (recordTerm) {
    await recordPeriod(scene.bob, {
      document: doc.documentId, start: scene.termStart, end: scene.termEnd });
  }
  return { entry: d.entry_id, document: doc.documentId, code, cents };
}

/** Reserve an account in the FIXED-ASSET roster, through 0041's OWN door — the instrument for
 *  "an account reserved by the fixed-asset roster cannot be enrolled here" (owner decision 6).
 *  A hand-written `fa_account_profiles` row would prove this battery can write a row; the door
 *  proves the reservation is the estate's. */
export async function reserveAsFixedAssetCost(sub, { client, assetAccount, opKey = null }) {
  const r = await humanQuery(sub, namedCall("upsert_fa_account_profile", [
    { name: "p_client" }, { name: "p_asset_account" }, { name: "p_accum_account" },
    { name: "p_depr_expense_account" }, { name: "p_op_key" },
  ]), [client, assetAccount, null, null, opKey ?? opk("p940-fa")]);
  return r.rows[0].result;
}

/** Bind a chart account as a REGISTERED BANK ACCOUNT, through 0038's own door — the instrument
 *  for the shared wall's `bank_account` axis, and for the one cell that proves the wall still
 *  guards the prepaid leg AFTER the roster gate admits it. */
export async function bindBankAccount(sub, {
  client, coaAccountCode, bankCode = "MBB", accountNumber, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("add_bank_account", [
    { name: "p_client" }, { name: "p_bank_code" }, { name: "p_account_number" },
    { name: "p_coa_account_code" }, { name: "p_op_key" },
  ]), [client, bankCode, accountNumber, coaAccountCode, opKey ?? opk("p940-bank")]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · Readers. `rootQuery` ONLY — each inspects a row the assertion is ABOUT, never the door
//     under test.
// ===========================================================================================

export async function enrolmentRow(id) {
  const r = await rootQuery(
    `select id, firm_id, client_id, account_code, purpose, reason, active,
            enrolled_at, created_by, retired_by, retired_at
       from clara.prepayment_account_enrolments where id = $1`, [id]);
  return r.rows[0] ?? null;
}

/** Every enrolment row a client ever held for one account and purpose, oldest first — the
 *  instrument for "an enrolment interval is never overwritten". */
export async function enrolmentsFor(client, account, purpose = ROSTER_PURPOSE.prepayment) {
  const r = await rootQuery(
    `select id, account_code, purpose, reason, active, enrolled_at, retired_at
       from clara.prepayment_account_enrolments
      where client_id = $1 and account_code = $2 and purpose = $3
      order by enrolled_at, id`, [client, account, purpose]);
  return r.rows;
}

/** How many LIVE enrolments a client holds at all — the instrument for "a refusal enrolled
 *  nothing", which is a claim about the RELATION and not about the door's answer. */
export async function liveEnrolmentCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.prepayment_account_enrolments where client_id = $1 and active",
    [client]);
  return r.rows[0].n;
}

export const nowhereRosterId = () => randomUUID();
