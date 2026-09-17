// #653 — PREPAYMENT RECOGNITION AND AMORTISATION OVER AN EXPLICIT SERVICE PERIOD: the battery's
// gate, verb wrappers, scene builder and readers (NOT a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it).
//
// IT JOINS TWO EXISTING WORLDS RATHER THAN BUILDING A THIRD, because #653's whole claim is that
// 0140's frozen evaluator and 0193's plan scheduler are ONE lane once a door ties them:
//
//   · `f-a4-pr2a-fixtures.mjs`'s `prepaidScene` supplies the PREPAYMENT half through governed
//     doors only — a closeable fiscal year, a verified document FILED to the client, a dedicated
//     prepaid-asset account, a dedicated expense target, and an APPROVED entry that binds the
//     document and debits exactly one asset line. A hand-built entry would prove the evaluator
//     reads rows, not that it reads BOOKS.
//   · `accounting-plans-fixtures.mjs` supplies the PLAN half — `instructionRef` (a real
//     `clara.accounting_work` row, because `create_accounting_plan` RESOLVES the authority), the
//     runtime scan, the catch-up door, the occurrence readers and the settle/post wrappers.
//
// EVERY DOOR CELL GOES THROUGH `humanQuery(sub, namedCall(...))` AS A BOOKKEEPER. The existing
// prepayment battery reaches the evaluator through `rootQuery` (`f-a4-pr2a-fixtures.mjs:178-179`),
// which is the defect gap-653 §AC8 diagnoses; repeating it here would repeat the defect. `rootQuery`
// appears below ONLY in readers that inspect a row the assertion is ABOUT, never as the caller of
// the door under test.
//
// THE FRONTIER GATE keys on this migration's STABLE STEM (`prepayment_amortisation$`), never its
// number — numbers are claimed at MERGE (standing law), and the `db-slice-frontiers` matrix runs
// this package against databases pinned at EARLIER frontiers where none of these doors exists.
//
// THE PRE-INTEGRATION ESCAPE (`CLARA_ALLOW_MISSING_PREPAYMENT_0223`, set by
// prepayment-0223-preintegration-gate.mjs) is the package-wide sweep's own reason to be quiet. A
// FOCUSED run does not preload that module, so `assertPrepaymentCohortPresent` FAILS loudly there
// rather than skipping in silence: a skip is not evidence (WORK-ORDER item 7).

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import {
  rootQuery, humanQuery, namedCall, opk,
  instructionRef, TZ,
} from "./accounting-plans-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { prepaidScene, recordPeriod, account } from "./f-a4-pr2a-fixtures.mjs";
// The document half, for the scenes that need a SECOND document-bound recognition of their own
// (the ineligible-prepaid-leg cells and the arm-B paging cell). `f-a4-pr2a-fixtures.mjs` reaches
// for the same two writers to build `prepaidScene`'s one document; these build the others.
import { seedVerifiedDocument, fileDocument } from "./rig-docs-fixtures.mjs";
import { openDefaultFY } from "./x56-fixtures.mjs";
import { acceptPublishedLegal } from "./work-journal-fixtures.mjs";
// The raw pool, for the ONE cell that needs two scans genuinely in flight behind a lock barrier.
import { getPool } from "./rig-helpers.mjs";

export * from "./accounting-plans-fixtures.mjs";
// …and the PREPAYMENT half. `account` is this module's only new spelling from that side; the plan
// chain exports neither it nor the scene builders, so no name is shadowed.
export { prepaidScene, recordPeriod, account, getPool };

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** The #653 migration's STABLE STEM. */
export const PREPAY_STEM = "prepayment_amortisation$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function prepaymentLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [PREPAY_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gatePrepayment(t)) return;` — the house per-cell frontier gate, COUNTED skip. */
export async function gatePrepayment(t) {
  if (await prepaymentLaneReady()) return false;
  markSkip();
  t.skip(`#653 prepayment-amortisation lane absent (no ${PREPAY_STEM} migration applied)`);
  return true;
}

/** The pre-integration discriminator: a FOCUSED run against a database without the lane is a real
 *  failure, and only the package-wide sweep's preloaded gate module turns it into a skip. */
export async function assertPrepaymentCohortPresent(t) {
  if (await prepaymentLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_0223 === "1") {
    markSkip();
    t.skip("#653 prepayment-amortisation lane absent (pre-integration sweep)");
    return true;
  }
  assert.fail(
    "#653: the prepayment-amortisation lane is absent. Apply the migration, or set "
    + "CLARA_ALLOW_MISSING_PREPAYMENT_0223=1 for the package-wide pre-integration sweep.");
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts on.
// ===========================================================================================

/** The typed `detail.reason` tokens #653's own door raises. The five prepayment tokens are
 *  0140's OWN spellings, re-derived rather than re-invented (brief: "Same tokens, no new ones"). */
export const PREPAY_REASON = {
  sourceUnfit: "prepayment_source_unfit",
  termUnderivable: "prepayment_term_underivable",
  targetIneligible: "prepayment_target_ineligible",
  targetUnderivable: "prepayment_target_underivable",
  belowGranularity: "prepayment_amount_below_period_granularity",
  scheduleExists: "prepayment_schedule_exists",
  scheduleNotFound: "prepayment_schedule_not_found",
  periodLineMissing: "amortisation_period_line_missing",
  // …and the 0193 tokens this lane inherits unchanged.
  planKindUnsupported: "plan_kind_unsupported",
  invalidSchedule: "invalid_schedule",
  invalidBasis: "invalid_basis",
  clientNotFound: "client_not_found",
  clientInactive: "client_inactive",
  invalidOpKey: "invalid_op_key",
  authorityRefUnresolved: "authority_ref_unresolved",
  operationInFlight: "operation_in_flight",
};

export const AMORTISATION_KIND = "amortisation_schedule";
// `TZ` and `assert` already arrive through the star export above (accounting-plans-fixtures.mjs).
export const TARGET_BASIS =
  "#653 battery: the invoice narrates a twelve-month software subscription, charged to subscriptions";

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

export async function createPrepaymentSchedule(sub, {
  client, sourceEntry, expenseAccount, expenseBasis = TARGET_BASIS,
  purpose = "Prepaid subscription amortisation", authorityRef, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("create_prepayment_schedule", [
    { name: "p_client", cast: "uuid" }, { name: "p_source_entry", cast: "uuid" },
    { name: "p_expense_account", cast: "text" }, { name: "p_expense_basis", cast: "text" },
    { name: "p_purpose", cast: "text" }, { name: "p_authority_ref", cast: "jsonb" },
    { name: "p_op_key", cast: "text" },
  ]), [client, sourceEntry, expenseAccount, expenseBasis, purpose,
    JSON.stringify(authorityRef), opKey ?? opk("p653-create")]);
  return r.rows[0].result;
}

export async function getPrepaymentSchedule(sub, schedule) {
  const r = await humanQuery(sub, namedCall("get_prepayment_schedule", [
    { name: "p_schedule", cast: "uuid" },
  ]), [schedule]);
  return r.rows[0].result;
}

export async function listPrepaymentSchedules(sub, client) {
  const r = await humanQuery(sub, namedCall("list_prepayment_schedules", [
    { name: "p_client", cast: "uuid" },
  ]), [client]);
  return r.rows[0].result;
}

export async function listPrepaymentAttention(sub, client) {
  const r = await humanQuery(sub, namedCall("list_prepayment_attention", [
    { name: "p_client", cast: "uuid" },
  ]), [client]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · The scene.
// ===========================================================================================

/** Today, and the month arithmetic every scene is shaped against, computed IN POSTGRES in the
 *  plan's own zone. Never `new Date()`: the due arithmetic is Asia/Kuala_Lumpur's and a UTC
 *  "today" is a different calendar day for eight hours out of every twenty-four. */
export async function planCalendar() {
  const r = await rootQuery(
    `select ((now() at time zone $1)::date)::text as today,
            (date_trunc('month', (now() at time zone $1))::date)::text as month_start`, [TZ]);
  return r.rows[0];
}

/** `YYYY-MM-01` of the month `n` months before this one, in the plan zone. */
export async function monthStartBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', (now() at time zone $1)) - ($2 || ' months')::interval)::date)::text as d`,
    [TZ, String(n)]);
  return r.rows[0].d;
}

/** The last day of the month `k` months after `from`'s month. The same arithmetic
 *  `clara._plan_due_nth(..., 'last_day_of_month', ...)` performs, computed in Postgres for the
 *  same reason. */
export async function monthEndAfter(from, k) {
  const r = await rootQuery(
    `select ((date_trunc('month', $1::timestamp) + (($2 + 1) || ' months')::interval
              - interval '1 day')::date)::text as d`, [from, String(k)]);
  return r.rows[0].d;
}

/**
 * THE PREPAYMENT SCENE, shaped so its TERM is a whole number of calendar months ending in the
 * PAST where the cells need admissible occurrences.
 *
 * `termMonthsBack` is how many months before the current one the term's first charged month is;
 * `termMonths` is how many whole months it charges.
 *
 * THE FISCAL YEARS ARE CALENDAR YEARS, and that is the estate's own shape rather than a choice
 * here: `clara.propose_fiscal_year` derives `ends_on` from the CLIENT's fy-end (12/31 by default),
 * so a year opened on any day but 1 January is a SHORT year and `clara.open_fiscal_year` refuses
 * it without a stated `length_reason` (measured: "a fiscal year spanning ~4 months needs its
 * length_reason stated"). So the scene opens the calendar year the term STARTS in, and — when the
 * term runs into the next one — opens that successor too, because `clara.prepayment_schedule_v1`
 * refuses a term that runs past its fiscal year with no OPEN successor (`0140:1097-1106`). A scene
 * that tripped that arm by accident would measure the wrong refusal.
 *
 * The RECOGNITION ENTRY posts fourteen days into the term's own first month, binds the document
 * and debits the prepaid asset for `cents` — `prepaidScene`'s own shape, through
 * `draft_entry`/`approve_entry` with maker != checker.
 */
export async function prepaymentScene(tag, {
  cents = 120000, termMonthsBack = 4, termMonths = 3, recordTerm = true,
} = {}) {
  const termStart = await monthStartBack(termMonthsBack);
  const termEnd = await monthEndAfter(termStart, termMonths - 1);
  const postingDate = await rootQuery("select (($1::date + 14))::text as d", [termStart])
    .then((r) => r.rows[0].d);
  const fyStart = `${termStart.slice(0, 4)}-01-01`;
  const scene = await prepaidScene(tag, { cents, startsOn: fyStart, postingDate });
  // THE MODEL-EGRESS BASIS, without which NO occurrence of this schedule could ever post. It is
  // DERIVED (0195:502) from the firm owner's acceptance of the current published Terms and DPA, and
  // `clara._record_journal_entry_core` re-verifies it at the write — so a scene that skipped this
  // would measure CLR13 `egress_not_authorized` where it meant to measure something else. Measured:
  // the locked-period cell answered CLR13 instead of CLR19 before this line existed.
  await acceptPublishedLegal(scene.alice);
  if (termEnd.slice(0, 4) !== termStart.slice(0, 4)) {
    await openDefaultFY(scene.alice, {
      client: scene.client, startsOn: `${termEnd.slice(0, 4)}-01-01`, tag: `p653 ${tag}` });
  }
  // THE TERM IS RECORDED BY THE BOOKKEEPER, not the owner: `record_document_service_period` is
  // bookkeeper-floored (`0140:944-959`) and a scene that only ever exercised it as an owner would
  // leave the floor itself unmeasured.
  if (recordTerm) {
    await recordPeriod(scene.bob, { document: scene.document, start: termStart, end: termEnd });
  }
  const ref = await instructionRef({ client: scene.client, author: scene.bob });
  return { ...scene, termStart, termEnd, postingDate, fyStart, authorityRef: ref, termMonths };
}

/** A SECOND expense account on this client's chart, for the target cells. */
export async function expenseAccount(sub, client, { code, name = "Other subscriptions" }) {
  return account(sub, { client, code, name, type: "expense" });
}

// ===========================================================================================
// 5 · Readers. `rootQuery` ONLY — each of these inspects a row the assertion is ABOUT, never
//     the door under test.
// ===========================================================================================

export async function scheduleRow(id) {
  const r = await rootQuery(
    `select id, firm_id, client_id, plan_id, revision, source_entry_id, prepaid_account_code,
            expense_account_code, expense_account_basis, service_period_id, document_id,
            term_start::text as term_start, term_end::text as term_end, basis_kind, period_lines,
            total_cents, period_count, remainder_placement, schedule_version, created_by, created_at
       from clara.prepayment_schedules where id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function scheduleRowsFor(client) {
  const r = await rootQuery(
    "select id, plan_id, source_entry_id from clara.prepayment_schedules where client_id = $1 order by created_at",
    [client]);
  return r.rows;
}

/** The relation's ACL and RLS posture — the census cell's instrument. */
export async function relationPosture(relname) {
  const r = await rootQuery(
    `select c.relrowsecurity, c.relforcerowsecurity, c.relacl::text as relacl
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = $1`, [relname]);
  return r.rows[0] ?? null;
}

/** Every EXECUTE grant on one function signature that an APPLICATION role holds, as
 *  `{grantee, privilege}` rows.
 *
 *  THE OWNER'S OWN ENTRY IS EXCLUDED, deliberately: `revoke all … from public` materialises
 *  `clara_fn_owner=X/clara_fn_owner` on every governed body in the estate, so including it would
 *  make "this function is ungranted" read as one grant on every row and the census would measure
 *  nothing. The question this instrument answers is which APPLICATION role can reach the body;
 *  the owner/definer/search_path posture is migration 0223's own tail census. */
export async function functionGrants(signature) {
  const r = await rootQuery(
    `select pg_get_userbyid(a.grantee) as grantee, a.privilege_type
       from pg_proc p, aclexplode(p.proacl) a
      where p.oid = to_regprocedure($1)
        and pg_get_userbyid(a.grantee) <> 'clara_fn_owner'
      order by 1, 2`, [signature]);
  return r.rows.map((x) => ({ grantee: x.grantee, privilege: x.privilege_type }));
}

/** The registered `clara.evaluator_versions` member hash for the frozen evaluator, recomputed
 *  LIVE off `pg_get_functiondef` — the same instrument `scripts/check-frozen-evaluators.mjs`
 *  uses, so the cell measures the freeze rather than restating it. */
export async function evaluatorFreezeMatches() {
  const r = await rootQuery(
    `select m.member_signature,
            encode(m.body_sha256, 'hex') as registered,
            encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(m.member_signature))::text, 'UTF8')), 'hex') as live
       from clara.evaluator_version_members m
       join clara.evaluator_versions e on e.id = m.evaluator_version_id
      where e.evaluator_name = 'prepayment_schedule'`);
  return r.rows;
}

/** The named period line of a live schedule, by `period_end` — the exact join key the fixed
 *  `last_day_of_month` cadence guarantees. */
export function lineFor(schedule, periodEnd) {
  const lines = schedule.period_lines ?? [];
  return lines.find((l) => String(l.period_end).slice(0, 10) === periodEnd) ?? null;
}

/** A fresh uuid, for the "names nothing" cells. */
export const nowhere = () => randomUUID();

// ===========================================================================================
// 6 · The two UNFIT sources, built through the estate's own doors.
//
//     Both exist so `prepayment_source_unfit` is measured on a REAL entry rather than on a row
//     a fixture wrote by hand: the evaluator's two arms are "the entry is not approved" and "the
//     entry's prepaid leg is ambiguous", and each needs an entry the estate actually admitted.
// ===========================================================================================

/** `wave-a-reads`' entry writers, imported lazily for the reason `f-a4-pr2a-fixtures.mjs` states
 *  for its own copy: the module is heavy and only the two cells below need it. */
async function entryWriters() {
  return import("./wave-a-reads.mjs");
}

/** A DRAFT (never approved) entry binding no document and debiting the prepaid asset. The
 *  evaluator refuses it `prepayment_source_unfit` BEFORE it ever looks for a term, so the absent
 *  document is not what this fixture is measuring. */
export async function unapprovedEntry(scene, { cents = 45000 } = {}) {
  const { draftEntryV3, freshResolution } = await entryWriters();
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    resolution: freshResolution(scene.alice, scene.client, { subjectKind: "manual", subjectId: null }),
    memo: `#653 unapproved recognition ${randomUUID().slice(0, 8)}`,
    postingDate: scene.postingDate,
    lines: [
      { account_code: scene.prepaid, debit_cents: cents, credit_cents: 0, description: "prepaid" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
    opKey: opk("p653-unappr"),
  });
  return d.entry_id;
}

/** An APPROVED entry that debits TWO asset accounts, so which leg is the prepayment is a guess —
 *  and the evaluator refuses a guess (`0140:1046-1057`). */
export async function ambiguousAssetEntry(scene, { cents = 60000, secondAsset = "19000002" } = {}) {
  const { draftEntryV3, approveEntry, freshResolution } = await entryWriters();
  await account(scene.alice, {
    client: scene.client, code: secondAsset, name: "Other prepayments", type: "asset" });
  const half = Math.floor(cents / 2);
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    resolution: freshResolution(scene.alice, scene.client, { subjectKind: "manual", subjectId: null }),
    memo: `#653 two-asset recognition ${randomUUID().slice(0, 8)}`,
    postingDate: scene.postingDate,
    lines: [
      { account_code: scene.prepaid, debit_cents: half, credit_cents: 0, description: "prepaid a" },
      { account_code: secondAsset, debit_cents: cents - half, credit_cents: 0, description: "prepaid b" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
    opKey: opk("p653-two"),
  });
  await approveEntry(scene.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p653-twoa") });
  return d.entry_id;
}

/**
 * THE ESTATE'S OWN RECEIVABLE CONTROL ACCOUNT, seeded on every client's chart by the standard COA
 * (`account_class = 'receivable'`) and MEASURED on the rig rather than minted here — a hand-made
 * "13000001 Trade receivables" carries a NULL `account_class` and is therefore NOT a control
 * account by `clara._adj_line_eligibility_breach`'s own rule (`0042:643`). A cell that built its
 * own code would measure a different estate.
 */
export const CONTROL_ASSET_CODE = "374-C56";

/**
 * A SECOND document for this scene's client, FILED through the governed door — every extra
 * recognition needs its own, because `journal_entries.document_id` is what arm B keys on.
 */
export async function extraDocument(scene, { tag = "extra" } = {}) {
  const u = randomUUID().slice(0, 8);
  const doc = await seedVerifiedDocument({
    firm: scene.firm, client: null, filename: `p653-${tag}-${u}.pdf` });
  await fileDocument(scene.alice, {
    document: doc.documentId, client: scene.client, opKey: opk("p653-file") });
  return doc;
}

/**
 * AN APPROVED, DOCUMENT-BOUND ENTRY WHOSE ONE DEBITED ASSET LEG IS NOT A PREPAYMENT — by default
 * the estate's own receivable CONTROL account, i.e. the shape of every ordinary sales invoice.
 *
 * It satisfies the frozen evaluator's whole predicate (approved, binds a document, debits exactly
 * ONE asset line), which is precisely why it is the cell that matters: without a wall on the
 * PREPAID leg the lane would amortise a receivable into an expense, monthly, for a whole stated
 * term. `recordTerm` puts a live service period on its document, so the refusal under test is the
 * eligibility wall rather than the absent-term one.
 */
export async function ineligibleAssetEntry(scene, {
  cents = 77000, code = CONTROL_ASSET_CODE, recordTerm = true, tag = "ctl",
} = {}) {
  const { draftEntryV3, approveEntry, freshResolution } = await entryWriters();
  const doc = await extraDocument(scene, { tag });
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    resolution: await freshResolution(scene.alice, scene.client,
      { subjectKind: "document", subjectId: doc.documentId }),
    memo: `#653 ordinary invoice ${randomUUID().slice(0, 8)}`,
    postingDate: scene.postingDate,
    document: doc.documentId, sha256: doc.sha256,
    lines: [
      { account_code: code, debit_cents: cents, credit_cents: 0, description: "receivable" },
      { account_code: "684-C56", debit_cents: 0, credit_cents: cents, description: "sale" },
    ],
    // A CONTROL-CLASS LINE REQUIRES A COUNTERPARTY (CLR23, measured on this rig), which is the
    // estate saying the same thing this cell is about: a receivable is somebody's, and a
    // prepayment is nobody's. Born at approve, the x56/x37 idiom.
    vendor: { kind: "customer", new: { name: `p653 customer ${randomUUID().slice(0, 8)}` } },
    opKey: opk("p653-ctl"),
  });
  await approveEntry(scene.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p653-ctla") });
  if (recordTerm) {
    await recordPeriod(scene.bob, {
      document: doc.documentId, start: scene.termStart, end: scene.termEnd });
  }
  return { entry: d.entry_id, document: doc.documentId, code, cents };
}

/**
 * ANOTHER ELIGIBLE RECOGNITION on this scene's client: approved, document-bound, debiting the
 * scene's own prepaid asset — an arm-B row. `postingDate` is the caller's, so the paging cell can
 * order them by a date it chose.
 */
export async function extraRecognition(scene, { cents = 12000, postingDate, tag = "many" } = {}) {
  const { draftEntryV3, approveEntry, freshResolution } = await entryWriters();
  const doc = await extraDocument(scene, { tag });
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    resolution: await freshResolution(scene.alice, scene.client,
      { subjectKind: "document", subjectId: doc.documentId }),
    memo: `#653 recognition ${postingDate}`,
    postingDate: postingDate ?? scene.postingDate,
    document: doc.documentId, sha256: doc.sha256,
    lines: [
      { account_code: scene.prepaid, debit_cents: cents, credit_cents: 0, description: "prepaid" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
    opKey: opk("p653-many"),
  });
  await approveEntry(scene.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p653-manya") });
  return { entry: d.entry_id, document: doc.documentId, postingDate };
}

/** CLOSE the fiscal year that contains `day` for `client`, walking the estate's own lifecycle
 *  edges (open -> closing -> closed), which is the only ladder its trigger admits.
 *
 *  A FIXTURE SHORTCUT AROUND AN ABSENT WRITER, stated as one rather than hidden — the estate's
 *  close ladder is a multi-step ceremony (`begin_close` / attestations / `finalize_close`) whose
 *  own batteries own it, and a cell about a LOCKED period needs the locked state rather than the
 *  ceremony. The scene owns a DEDICATED client, so a year closed here closes nothing under another
 *  cell's feet. `accounting-plans-fixtures.mjs`'s `closeYearAround` is the same shortcut for a
 *  client that has no year at all; this one closes the year the scene already opened. */
export async function closeFiscalYearOf(client, day) {
  const fy = await rootQuery(
    `select id from clara.fiscal_years
      where client_id = $1 and $2::date between starts_on and ends_on
      order by ordinal limit 1`, [client, day]);
  const id = fy.rows[0]?.id;
  if (!id) throw new Error(`closeFiscalYearOf: no fiscal year contains ${day} for client ${client}`);
  for (const s of ["closing", "closed"]) {
    await rootQuery("update clara.fiscal_years set status = $2 where id = $1", [id, s]);
  }
  return id;
}
