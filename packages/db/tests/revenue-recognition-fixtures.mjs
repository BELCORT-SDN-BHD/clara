// #941 (second half) — DEFERRED REVENUE: RECOGNISE A RECEIPT PAID AHEAD BY A CUSTOMER AS REVENUE
// OVER ITS SERVICE PERIOD. This battery's frontier gate, vocabulary, verb wrappers, scene builder
// and readers (NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// IT EXTENDS #915'S BATTERY RATHER THAN BUILDING A SIXTH WORLD.
// `prepayment-schedule-obo-fixtures.mjs` already re-exports #653's, #939's and #940's whole
// prepayment world — a closeable fiscal year, an accepted legal posture (without which nothing
// posts), an ENROLLED prepaid-asset account, an APPROVED document-bound recognition, the
// memo-only recognition, the roster's two doors and the real `clara_runtime` connection. The ONE
// thing none of them has a shape for is the mirror image of a prepayment: a RECEIPT the client
// took in advance, whose CREDITED LIABILITY leg is the deferred revenue this lane recognises.
//
// THE FRONTIER GATE keys on this migration's STABLE STEM (`deferred_revenue_recognition$`), never
// its number — numbers are claimed at MERGE (packages/db/README.md), and the `db-slice-frontiers`
// matrix runs this package against databases pinned at EARLIER frontiers.

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import { rootQuery, roleQuery, ROLES, humanQuery, namedCall, opk } from "./rig-helpers.mjs";

export * from "./prepayment-schedule-obo-fixtures.mjs";

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** This migration's STABLE STEM. */
export const DEFERRED_STEM = "deferred_revenue_recognition$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function deferredLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [DEFERRED_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** The pre-integration discriminator: a FOCUSED run against a database without the lane is a real
 *  failure, and only the package-wide sweep's preloaded gate module turns it into a skip. A skip
 *  is not evidence (WORK-ORDER rule 4). */
export async function assertDeferredLanePresent(t) {
  if (await deferredLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_DEFERRED_REVENUE === "1") {
    console.warn(
      `SKIP revenue-recognition: no ${DEFERRED_STEM} migration applied (pre-integration run).`);
    t.skip("#941 deferred-revenue lane absent — explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#941: the deferred-revenue recognition lane is absent. Apply "
    + "0308_deferred_revenue_recognition.sql, or set CLARA_ALLOW_MISSING_DEFERRED_REVENUE=1 for "
    + "the package-wide pre-integration sweep.");
  return true;
}

// ===========================================================================================
// 2 · Signatures and the closed vocabulary this battery asserts on.
//
//     THE TOKENS ARE THIS LANE'S OWN, not 0140's `prepayment_*` ones, and that is a decision
//     rather than an omission. A bookkeeper recognising a customer's advance reads the refusal on
//     a DEFERRED REVENUE surface; being told "this prepayment is unfit" would name the wrong half
//     of the books. The SHAPE is the prepayment lane's, token for token (`_source_unfit` with an
//     `axis`, `_term_underivable` with a `missing` and a `remedy`, `_target_*`), so every surface
//     that renders one renders the other with no second grammar.
// ===========================================================================================

export const DR_HUMAN_SIG =
  "clara.create_revenue_recognition_schedule(uuid,uuid,text,text,text,jsonb,text,text)";
export const DR_OBO_SIG =
  "clara.create_revenue_recognition_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text,text)";
export const DR_READ_SIG = "clara.read_revenue_recognition_source_for(uuid,uuid,uuid)";
export const DR_CORE_SIG =
  "clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)";
export const DR_PLAN_CORE_SIG =
  "clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)";
export const DR_PERIOD_LINE_SIG = "clara._plan_revenue_recognition_period_line(uuid,date)";

export const RECOGNITION_KIND = "revenue_recognition_schedule";
/** The ONE pattern this estate offers. Usage-based and milestone recognition need a measure of
 *  progress the estate does not carry, so the door refuses them BY NAME rather than guessing one. */
export const RECOGNITION_PATTERN = "straight_line";

export const DR_REASON = {
  sourceUnfit: "deferred_revenue_source_unfit",
  termUnderivable: "deferred_revenue_term_underivable",
  targetIneligible: "revenue_target_ineligible",
  targetUnderivable: "revenue_target_underivable",
  belowGranularity: "deferred_revenue_amount_below_period_granularity",
  scheduleExists: "deferred_revenue_schedule_exists",
  scheduleNotFound: "revenue_recognition_schedule_not_found",
  periodLineMissing: "revenue_recognition_period_line_missing",
  patternUnsupported: "recognition_pattern_unsupported",
  readScopeRequired: "revenue_recognition_read_scope_required",
  sourceNotFound: "revenue_recognition_source_not_found",
};

/** #941 AC3 — THE CORRECTION PATH'S OWN TOKENS, this lane's vocabulary rather than the
 *  prepayment lane's, for the reason the block above states: a bookkeeper recognising a customer's
 *  advance reads the refusal on a DEFERRED REVENUE surface. The SHAPE is the prepayment lane's,
 *  token for token, so a surface that renders one renders the other. */
export const DR_CORRECTION_REASON = {
  scheduleSuperseded: "deferred_revenue_schedule_superseded",
  termNotCorrected: "deferred_revenue_term_not_corrected",
  noOpenPeriod: "deferred_revenue_correction_no_open_period",
  nothingRemaining: "deferred_revenue_correction_nothing_remaining",
};

export const DR_CORRECTION_AXIS = { termLive: "term_live", termUnmoved: "term_unmoved" };

export const DR_REPLACE_SIG =
  "clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)";

export const DR_REPLACE_REASON =
  "#941 battery: the member's agreement ran longer than the term we were first told";

/** The ONE axis #941 adds to #940's enrolment door, beside its `not_asset_class` twin. */
export const NOT_LIABILITY_AXIS = "not_liability_class";

export const DR_AXIS = {
  notPosted: "source_not_posted",
  notEnrolled: "deferred_account_not_enrolled",
  ineligible: "deferred_account_ineligible",
  accountMissing: "account_missing",
  accountUnknown: "account_unknown",
  notIncomeClass: "not_income_class",
  basisMissing: "basis_missing",
};

/** The roster purpose this lane opens (#940 carried the column from birth; #941 states its rule). */
export const DEFERRED_PURPOSE = "deferred_revenue";

/** The battery's own stated grounds for the revenue classification — the door refuses a blank one
 *  by name, so a scene that supplied none would measure that refusal instead of the lane. */
export const REVENUE_BASIS =
  "#941 battery: the membership agreement runs twelve months from 1 January, recognised into "
  + "subscriptions income as the service is rendered";

export const DEFERRED_ENROL_REASON =
  "#941 battery: this account holds customer advances for services not yet rendered";

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

/** #940's enrolment door, called with THIS lane's purpose. */
export async function enrolDeferredAccount(sub, {
  client, account, reason = DEFERRED_ENROL_REASON, purpose = DEFERRED_PURPOSE, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("enrol_prepayment_account", [
    { name: "p_client", cast: "uuid" }, { name: "p_account", cast: "text" },
    { name: "p_purpose", cast: "text" }, { name: "p_reason", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [client, account, purpose, reason, opKey ?? opk("p941-enrol")]);
  return r.rows[0].result;
}

const DR_SPECS = [
  { name: "p_client", cast: "uuid" }, { name: "p_source_entry", cast: "uuid" },
  { name: "p_revenue_account", cast: "text" }, { name: "p_revenue_basis", cast: "text" },
  { name: "p_purpose", cast: "text" }, { name: "p_authority_ref", cast: "jsonb" },
  { name: "p_op_key", cast: "text" }, { name: "p_pattern", cast: "text" },
];

/** THE HUMAN DOOR — `clara_authenticated` only, bookkeeper floor in its own body. */
export async function createRecognitionSchedule(sub, {
  client, sourceEntry, revenueAccount, revenueBasis = REVENUE_BASIS,
  purpose = "Membership fee recognition", authorityRef, opKey = null,
  pattern = RECOGNITION_PATTERN,
}) {
  const r = await humanQuery(sub, namedCall("create_revenue_recognition_schedule", DR_SPECS),
    [client, sourceEntry, revenueAccount, revenueBasis, purpose,
      JSON.stringify(authorityRef), opKey ?? opk("p941-create"), pattern]);
  return r.rows[0].result;
}

const DR_OBO_SPECS = [
  { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
  { name: "p_source_entry", cast: "uuid" }, { name: "p_revenue_account", cast: "text" },
  { name: "p_revenue_basis", cast: "text" }, { name: "p_purpose", cast: "text" },
  { name: "p_authority_ref", cast: "jsonb" }, { name: "p_op_key", cast: "text" },
  { name: "p_pattern", cast: "text" },
];

/**
 * THE OBO TWIN — `clara_runtime` ONLY, the actor taken from an ARGUMENT because a runtime
 * connection carries no human JWT. Invoked on a REAL least-privileged runtime connection, never as
 * root: a door reached as `postgres` would prove nothing about the grant it rides.
 */
export async function createRecognitionScheduleFor({
  client, author, sourceEntry, revenueAccount, revenueBasis = REVENUE_BASIS,
  purpose = "Membership fee recognition", authorityRef, opKey = null,
  pattern = RECOGNITION_PATTERN,
}) {
  const r = await roleQuery(ROLES.runtime,
    namedCall("create_revenue_recognition_schedule_for", DR_OBO_SPECS),
    [client, author, sourceEntry, revenueAccount, revenueBasis, purpose,
      JSON.stringify(authorityRef), opKey ?? opk("p941-obo"), pattern]);
  return r.rows[0].result;
}

/** The same OBO call on whatever role a cell names — the instrument for "no other lane reaches it". */
export async function createRecognitionScheduleForAs(role, {
  client, author, sourceEntry, revenueAccount, revenueBasis = REVENUE_BASIS,
  purpose = "Membership fee recognition", authorityRef, opKey = null,
  pattern = RECOGNITION_PATTERN,
}) {
  const r = await roleQuery(role,
    namedCall("create_revenue_recognition_schedule_for", DR_OBO_SPECS),
    [client, author, sourceEntry, revenueAccount, revenueBasis, purpose,
      JSON.stringify(authorityRef), opKey ?? opk("p941-obo"), pattern]);
  return r.rows[0].result;
}

const DR_READ_SPECS = [
  { name: "p_firm", cast: "uuid" }, { name: "p_client", cast: "uuid" },
  { name: "p_source_entry", cast: "uuid" },
];

/** The machine-lane read of the RECORDED term — `clara_runtime` only, no document bytes ever. */
export async function readRecognitionSourceFor({ firm, client, sourceEntry }) {
  const r = await roleQuery(ROLES.runtime,
    namedCall("read_revenue_recognition_source_for", DR_READ_SPECS), [firm, client, sourceEntry]);
  return r.rows[0].result;
}

export async function readRecognitionSourceForAs(role, { firm, client, sourceEntry }) {
  const r = await roleQuery(role,
    namedCall("read_revenue_recognition_source_for", DR_READ_SPECS), [firm, client, sourceEntry]);
  return r.rows[0].result;
}

/** Every clara function of the DEFERRED-REVENUE LANE with the six application roles' EXECUTE bits,
 *  read POSITIVELY off the catalog. "The runtime role reaches the twin and the narrow read and
 *  NOTHING ELSE" is a claim about every member of the lane, so the lane is enumerated rather than
 *  sampled. */
export async function recognitionLaneGrants() {
  const r = await rootQuery(
    `select p.oid::regprocedure::text as signature, p.proname,
            has_function_privilege('clara_authenticated', p.oid, 'execute') as authenticated,
            has_function_privilege('clara_runtime', p.oid, 'execute') as runtime,
            has_function_privilege('clara_agent_ro', p.oid, 'execute') as agent_ro,
            has_function_privilege('clara_wake_interactive', p.oid, 'execute') as wake_interactive,
            has_function_privilege('clara_wake_proactive', p.oid, 'execute') as wake_proactive,
            has_function_privilege('public', p.oid, 'execute') as pub
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and (p.proname ~ 'revenue_recognition' or p.proname ~ 'deferred_revenue')
      order by 1`);
  return r.rows;
}

export async function getRecognitionSchedule(sub, schedule) {
  const r = await humanQuery(sub, namedCall("get_revenue_recognition_schedule", [
    { name: "p_schedule", cast: "uuid" },
  ]), [schedule]);
  return r.rows[0].result;
}

export async function listRecognitionSchedules(sub, client) {
  const r = await humanQuery(sub, namedCall("list_revenue_recognition_schedules", [
    { name: "p_client", cast: "uuid" },
  ]), [client]);
  return r.rows[0].result;
}

export async function listRecognitionAttention(sub, client) {
  const r = await humanQuery(sub, namedCall("list_revenue_recognition_attention", [
    { name: "p_client", cast: "uuid" },
  ]), [client]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · The scene — a RECEIPT taken in advance, which is the prepayment's mirror image.
// ===========================================================================================

/** The codes this battery plants. Eight digits, because `ck_coa_account_code_0009` admits only
 *  the eight-digit or the three-dash-suffix form; every scene builds its own client, so fixed
 *  values are safe. The STANDARD-CHART codes (2030, 2150, 4000) are consumed by the
 *  standard-chart cell through `clara.apply_coa_template`, never minted here (lane rule (a)). */
export const DEFERRED_CODE = "20300001";
export const REVENUE_CODE = "40000001";
export const SST_OUTPUT_CODE = "21500001";
export const BANK_CODE = "170-C56";

async function entryWriters() {
  return import("./wave-a-reads.mjs");
}

/**
 * AN APPROVED RECEIPT: Dr bank / Cr the deferred-revenue liability, optionally with an SST OUTPUT
 * TAX line credited beside it. Built through `draft_entry` / `approve_entry` with maker != checker,
 * like every other recognition in this family: an entry a fixture wrote by hand would prove the
 * door reads rows, not that it reads BOOKS.
 *
 * `document` binds the receipt to a filed document (the document term lane); omitting it leaves the
 * receipt MEMO-ONLY, which is #939's stated-term lane.
 */
export async function advanceReceipt(scene, {
  cents = 120000, deferred = DEFERRED_CODE, document = null, sha256 = null,
  sstCents = 0, sst = SST_OUTPUT_CODE, postingDate = null, tag = "receipt",
  /** A SECOND credited liability leg, for the ambiguity cell. */
  extraLiability = null,
  /** Credit this INCOME account instead of a liability, for the no-candidate cell. */
  creditIncome = null,
  /** Leave the entry in DRAFT, for the not-posted cell. */
  approve = true,
} = {}) {
  const { draftEntryV3, approveEntry, freshResolution } = await entryWriters();
  const u = randomUUID().slice(0, 8);
  const extra = extraLiability ? extraLiability.cents : 0;
  const lines = [
    { account_code: BANK_CODE, debit_cents: cents + sstCents + extra, credit_cents: 0,
      description: "advance received" },
    { account_code: creditIncome ?? deferred, debit_cents: 0, credit_cents: cents,
      description: creditIncome ? "revenue" : "deferred revenue" },
  ];
  if (sstCents > 0) {
    lines.push({ account_code: sst, debit_cents: 0, credit_cents: sstCents,
      description: "SST output tax" });
  }
  if (extraLiability) {
    lines.push({ account_code: extraLiability.code, debit_cents: 0,
      credit_cents: extraLiability.cents, description: "a second advance" });
  }
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    resolution: await freshResolution(scene.alice, scene.client, document === null
      ? { subjectKind: "manual", subjectId: null }
      : { subjectKind: "document", subjectId: document }),
    memo: `#941 ${tag} ${u}`,
    postingDate: postingDate ?? scene.postingDate,
    ...(document === null ? {} : { document, sha256 }),
    lines,
    opKey: opk("p941-draft"),
  });
  if (approve) {
    await approveEntry(scene.bob, {
      entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p941-appr") });
  }
  return { entry: d.entry_id, cents, sstCents };
}

/**
 * THE DEFERRED-REVENUE SCENE. #653's prepayment world (fiscal years, legal acceptance, an
 * authority reference that RESOLVES) plus this lane's own three accounts and one APPROVED
 * memo-only advance receipt.
 *
 * `enrol` false leaves the liability account OFF the roster, which is the shape the not-enrolled
 * refusal is measured on.
 */
export async function deferredRevenueScene(tag, {
  cents = 120000, termMonthsBack = 4, termMonths = 3, enrol = true, sstCents = 0,
} = {}) {
  const { prepaymentScene, account } = await import("./prepayment-schedule-fixtures.mjs");
  const scene = await prepaymentScene(tag, { cents, termMonthsBack, termMonths });
  const deferred = await account(scene.alice, {
    client: scene.client, code: DEFERRED_CODE, name: "Deferred revenue", type: "liability" });
  const revenue = await account(scene.alice, {
    client: scene.client, code: REVENUE_CODE, name: "Subscriptions income", type: "income" });
  // THE SST OUTPUT ACCOUNT CARRIES THE ESTATE'S OWN STAMP (`special_acc_type = 'sst_output'`),
  // because that stamp — not its code and not its name — is what the door excludes it by.
  const { upsertAccount } = await import("./rig-fixtures.mjs");
  await upsertAccount(scene.alice, {
    client: scene.client, code: SST_OUTPUT_CODE, name: "SST output tax payable",
    type: "liability", special: "sst_output", opKey: opk("p941-sst") });
  if (enrol) {
    await enrolDeferredAccount(scene.bob, { client: scene.client, account: deferred });
  }
  const receipt = await advanceReceipt(scene, { cents, sstCents });
  return { ...scene, deferred, revenue, sst: SST_OUTPUT_CODE,
    receipt: receipt.entry, receiptCents: cents, sstCents };
}

// ===========================================================================================
// 5 · Readers. `rootQuery` ONLY — each inspects a row the assertion is ABOUT, never the door
//     under test.
// ===========================================================================================

export async function recognitionScheduleRow(id) {
  const r = await rootQuery(
    `select id, firm_id, client_id, plan_id, plan_kind, revision, source_entry_id,
            deferred_account_code, revenue_account_code, revenue_account_basis,
            service_period_id, document_id, term_start::text as term_start,
            term_end::text as term_end, basis_kind, period_lines, total_cents, period_count,
            remainder_placement, recognition_pattern, schedule_version, evaluator_version_id,
            created_by, created_at, term_source, stated_term_id
       from clara.revenue_recognition_schedules where id = $1`, [id]);
  return r.rows[0] ?? null;
}

/** THE CORRECTION DOOR (#941 AC3) — the mirror of clara.replace_prepayment_schedule. */
export async function replaceRecognitionSchedule(sub, {
  client, schedule, reason = DR_REPLACE_REASON, authorityRef, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("replace_revenue_recognition_schedule", [
    { name: "p_client", cast: "uuid" }, { name: "p_schedule", cast: "uuid" },
    { name: "p_reason", cast: "text" }, { name: "p_authority_ref", cast: "jsonb" },
    { name: "p_op_key", cast: "text" },
  ]), [client, schedule, reason, JSON.stringify(authorityRef), opKey ?? opk("p941-replace")]);
  return r.rows[0].result;
}

/** One recognition schedule's supersession stamp, read off the RELATION. */
export async function recognitionScheduleSupersession(id) {
  const r = await rootQuery(
    `select id, superseded_by, superseded_at, replaces_schedule_id
       from clara.revenue_recognition_schedules where id = $1`, [id]);
  return r.rows[0] ?? null;
}

/** How many LIVE schedules stand over one receipt — the rule that must never break. */
export async function liveRecognitionScheduleCountFor(sourceEntry) {
  const r = await rootQuery(
    `select count(*)::int as n from clara.revenue_recognition_schedules
      where source_entry_id = $1 and superseded_at is null`, [sourceEntry]);
  return r.rows[0].n;
}

export async function recognitionScheduleCountFor(sourceEntry) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.revenue_recognition_schedules where source_entry_id = $1",
    [sourceEntry]);
  return r.rows[0].n;
}

/** The live balance of one account on one client's books, in cents, DEBIT-POSITIVE — summed off
 *  the posted journal lines of entries that have not been reversed. The instrument for "the
 *  liability clears to zero" and for "the SST leg never moves". */
export async function accountBalance(client, code) {
  const r = await rootQuery(
    `select coalesce(sum(jl.debit_cents - jl.credit_cents), 0)::bigint as cents
       from clara.journal_lines jl
       join clara.journal_entries je on je.id = jl.entry_id
      where jl.client_id = $1 and jl.account_code = $2
        and je.status = 'approved' and je.reversed_by is null`, [client, code]);
  return BigInt(r.rows[0].cents);
}

/** Every posted line touching one account — so a cell can say WHICH entries moved it rather than
 *  only that the total did not. */
export async function accountLines(client, code) {
  const r = await rootQuery(
    `select je.id as entry_id, je.posting_date::text as posting_date, je.memo,
            jl.debit_cents, jl.credit_cents
       from clara.journal_lines jl
       join clara.journal_entries je on je.id = jl.entry_id
      where jl.client_id = $1 and jl.account_code = $2 and je.status = 'approved'
      order by je.posting_date, je.id`, [client, code]);
  return r.rows;
}

export const nowhereRecognitionId = () => randomUUID();
