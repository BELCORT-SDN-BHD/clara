// #939 — AMORTISE A PREPAYMENT WITH NO SOURCE DOCUMENT FROM A PERSON-STATED SERVICE PERIOD:
// this battery's frontier gate, verb wrappers, scene extension and readers (NOT a test file: the
// name does not end in `.test.mjs`, so `node --test` ignores it).
//
// IT EXTENDS #653'S OWN BATTERY RATHER THAN BUILDING A THIRD WORLD. `prepayment-schedule-fixtures.mjs`
// already assembles the prepayment half (a closeable fiscal year, a prepaid-asset account, an
// expense target, an APPROVED recognition entry) and the plan half (a real `clara.accounting_work`
// for the authority reference). Everything below is the ONE thing that battery has no shape for:
// a recognition entry that binds NO document, which is exactly the entry #939 exists to amortise.
//
// THE FRONTIER GATE keys on this migration's STABLE STEM (`prepayment_stated_term$`), never its
// number — numbers are claimed at MERGE (packages/db/README.md), and the `db-slice-frontiers`
// matrix runs this package against databases pinned at EARLIER frontiers.

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import {
  rootQuery, humanQuery, namedCall, opk, account, prepaymentScene, recordPeriod, monthEndAfter,
} from "./prepayment-schedule-fixtures.mjs";
// The fiscal-year opener, re-exported here because #653's own fixtures import it without passing
// it on: the 120-month cell needs the CONTIGUOUS successor year `clara.open_fiscal_year` demands,
// and the scene builder only ever opens the year the term ENDS in.
import { openDefaultFY } from "./x56-fixtures.mjs";

export * from "./prepayment-schedule-fixtures.mjs";
export { openDefaultFY };

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** This migration's STABLE STEM. */
export const STATED_TERM_STEM = "prepayment_stated_term$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function statedTermLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [STATED_TERM_STEM]);
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
export async function assertStatedTermLanePresent(t) {
  if (await statedTermLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_STATED_TERM === "1") {
    console.warn(
      `SKIP prepayment-stated-term: no ${STATED_TERM_STEM} migration applied (pre-integration run).`);
    t.skip("#939 prepayment-stated-term lane absent — explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#939: the prepayment stated-term lane is absent. Apply 0305_prepayment_stated_term.sql, or set "
    + "CLARA_ALLOW_MISSING_PREPAYMENT_STATED_TERM=1 for the package-wide pre-integration sweep.");
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts on. #939 mints exactly the tokens its own door
//     needs and reuses 0140/0223's five prepayment tokens verbatim everywhere else.
// ===========================================================================================

export const STATED_TERM_REASON = {
  reasonMissing: "prepayment_stated_term_reason_missing",
  datesMissing: "prepayment_stated_term_dates_missing",
  datesNotFinite: "prepayment_stated_term_dates_not_finite",
  datesOutOfDomain: "prepayment_stated_term_dates_out_of_domain",
  datesInverted: "prepayment_stated_term_dates_inverted",
  termTooLong: "prepayment_stated_term_too_long",
  sourceHasDocument: "prepayment_stated_term_source_has_document",
  entryNotFound: "prepayment_source_entry_not_found",
};

/** #939 AC4 — THE CORRECTION PATH'S OWN TOKENS. Decision 3 is "a mis-stated term is corrected by
 *  superseding it and opening a new schedule from the next period; already-posted periods are never
 *  touched", so each way that act can be REFUSED is named rather than answered by a constraint. The
 *  four below are this lane's own; every other refusal the door can raise is one of the create
 *  door's (`PREPAY_REASON`), because they are the same facts asked a second time. */
export const CORRECTION_REASON = {
  scheduleSuperseded: "prepayment_schedule_superseded",
  termNotCorrected: "prepayment_term_not_corrected",
  noOpenPeriod: "prepayment_correction_no_open_period",
  nothingRemaining: "prepayment_correction_nothing_remaining",
};

/** The two axes `prepayment_term_not_corrected` distinguishes: the statement this schedule rode is
 *  still the live one (nothing was corrected at all), and a re-statement that moved neither date
 *  (ADV-02's own rule — `term_live` flips, `term_moved` does not, and only the second is grounds). */
export const CORRECTION_AXIS = {
  termLive: "term_live",
  termUnmoved: "term_unmoved",
};

export const REPLACE_DOOR_SIG =
  "clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)";

export const REPLACE_REASON_TEXT =
  "#939 battery: the client sent the policy schedule and the term we were told was a month out";

export const STATED_TERM_DOOR_SIG =
  "clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)";
export const EVALUATOR_V2_SIG =
  "clara.prepayment_schedule_v2(bigint,text,text,date,date)";

export const STATED_REASON_TEXT =
  "#939 battery: the client paid twelve months of insurance and said so on the phone; no invoice yet";

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

export async function recordStatedTerm(sub, {
  client, sourceEntry, start, end, reason = STATED_REASON_TEXT, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("record_prepayment_stated_term", [
    { name: "p_client", cast: "uuid" }, { name: "p_source_entry", cast: "uuid" },
    { name: "p_period_start", cast: "date" }, { name: "p_period_end", cast: "date" },
    { name: "p_reason", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [client, sourceEntry, start, end, reason, opKey ?? opk("p939-state")]);
  return r.rows[0].result;
}

/** The new evaluator, called as the OWNER — it is ungranted by design, exactly like
 *  `clara.prepayment_schedule_v1`, so a cell that reached it as a human would be measuring a
 *  grant this lane must never mint. */
export async function scheduleV2({ totalCents, accountCode, releaseSide, termStart, termEnd }) {
  const r = await rootQuery(
    `select clara.prepayment_schedule_v2($1::bigint,$2::text,$3::text,$4::date,$5::date) as r`,
    [totalCents, accountCode, releaseSide, termStart, termEnd]);
  return r.rows[0].r;
}

export async function scheduleV1(client, sourceEntry) {
  const r = await rootQuery(
    "select clara.prepayment_schedule_v1($1::uuid,$2::uuid) as r", [client, sourceEntry]);
  return r.rows[0].r;
}

// ===========================================================================================
// 4 · The scene extension — a MEMO-ONLY recognition.
// ===========================================================================================

/**
 * AN APPROVED RECOGNITION THAT BINDS NO DOCUMENT and debits exactly one asset line — the prepaid
 * account this scene already owns. `ck_je_basis` (0003:127) permits exactly this entry, which is
 * why `clara.prepayment_schedule_v1` answers it with a FIRST-CLASS `prepayment_term_underivable`
 * refusal rather than an error, and why #939 exists at all.
 *
 * Built through `draft_entry` / `approve_entry` with maker != checker, like every other
 * recognition in this family: an entry a fixture wrote by hand would prove the doors read rows,
 * not that they read BOOKS.
 */
export async function memoOnlyRecognition(scene, { cents = 120000, postingDate = null } = {}) {
  const { draftEntryV3, approveEntry, freshResolution } = await import("./wave-a-reads.mjs");
  const u = randomUUID().slice(0, 8);
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    // A MANUAL resolution, because there is no document to resolve the client through. That is the
    // whole shape under test: the ledger admits a memo journal, and the term has nowhere to live.
    resolution: await freshResolution(scene.alice, scene.client,
      { subjectKind: "manual", subjectId: null }),
    memo: `#939 memo-only prepayment ${u}`,
    postingDate: postingDate ?? scene.postingDate,
    lines: [
      { account_code: scene.prepaid, debit_cents: cents, credit_cents: 0, description: "prepaid" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
    opKey: opk("p939-draft"),
  });
  await approveEntry(scene.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p939-appr") });
  return { entry: d.entry_id, cents };
}

/**
 * A MEMO-ONLY, APPROVED RECOGNITION WHOSE ONE DEBITED ASSET LEG IS NOT A PREPAYMENT — by default
 * the estate's own receivable CONTROL account.
 *
 * It exists because #939 removed arm B's `document_id is not null` filter, and that filter was
 * doing a second job nobody had asked it to do: it kept memo-only entries out of the band
 * entirely. With it gone, the ONLY thing standing between arm B and every memo-only receivable a
 * firm posts is `clara._adj_line_eligibility_breach`, so that wall has to be driven on this lane
 * rather than assumed to carry over from the document one.
 *
 * A CONTROL-CLASS LINE REQUIRES A COUNTERPARTY (CLR23, measured on this rig), which is the estate
 * saying the same thing this fixture is about: a receivable is somebody's, and a prepayment is
 * nobody's.
 */
export async function memoOnlyIneligible(scene, { cents = 77000, code = "374-C56" } = {}) {
  const { draftEntryV3, approveEntry, freshResolution } = await import("./wave-a-reads.mjs");
  const u = randomUUID().slice(0, 8);
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    resolution: await freshResolution(scene.alice, scene.client,
      { subjectKind: "manual", subjectId: null }),
    memo: `#939 memo-only receivable ${u}`,
    postingDate: scene.postingDate,
    lines: [
      { account_code: code, debit_cents: cents, credit_cents: 0, description: "receivable" },
      { account_code: "684-C56", debit_cents: 0, credit_cents: cents, description: "sale" },
    ],
    vendor: { kind: "customer", new: { name: `p939 customer ${u}` } },
    opKey: opk("p939-ctl"),
  });
  await approveEntry(scene.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p939-ctla") });
  return { entry: d.entry_id, code, cents };
}

/** #653's scene plus a memo-only recognition of the same client, so a cell can drive the whole
 *  memo-only lane from one call. `recordTerm` stays true: the scene's OWN document-bound entry is
 *  what the v1/v2 agreement cell needs. */
export async function statedTermScene(tag, opts = {}) {
  const scene = await prepaymentScene(tag, opts);
  const memo = await memoOnlyRecognition(scene, { cents: opts.memoCents ?? opts.cents ?? 120000 });
  return { ...scene, memoEntry: memo.entry, memoCents: memo.cents };
}

/**
 * A SCENE WHOSE DOCUMENT TERM IS THE CARRIER'S 120-MONTH MAXIMUM — the longest term
 * `clara.prepayment_schedule_v1` can ever see, because `clara.record_document_service_period` and
 * `ck_dsp_max_periods` both stop at 120 charged months.
 *
 * It cannot be built by asking `prepaymentScene` for 120 months: that builder opens the fiscal
 * year the term ENDS in, and `clara.open_fiscal_year` refuses a year that is not CONTIGUOUS with
 * its predecessor (measured: "fiscal year starting 2036-01-01 is not contiguous with its
 * predecessor ending 2026-12-31"). So the scene is built SHORT, its immediate successor year is
 * opened — which is all v1's FY arm asks for, an OPEN year starting after the entry's own year —
 * and the term is then re-recorded at its maximum through the same human door, which supersedes
 * the short one.
 */
export async function maxTermScene(tag, { cents = 1200000 } = {}) {
  const scene = await prepaymentScene(tag, { cents, termMonthsBack: 1, termMonths: 2 });
  const year = Number(scene.termStart.slice(0, 4));
  await openDefaultFY(scene.alice, {
    client: scene.client, startsOn: `${year + 1}-01-01`, tag: `p939 ${tag} successor` });
  const termEnd = await monthEndAfter(scene.termStart, 119);
  await recordPeriod(scene.bob, {
    document: scene.document, start: scene.termStart, end: termEnd,
    basis: "#939 battery: a ten-year maintenance contract, the carrier's stated maximum" });
  return { ...scene, termEnd, termMonths: 120 };
}

/** A SECOND expense account, for the cells that need a target distinct from the scene's. */
export async function extraExpenseAccount(sub, client, { code = "59000002", name = "Insurance" } = {}) {
  return account(sub, { client, code, name, type: "expense" });
}

// ===========================================================================================
// 5 · Readers. `rootQuery` ONLY — each inspects a row the assertion is ABOUT, never the door
//     under test.
// ===========================================================================================

export async function statedTermRow(id) {
  const r = await rootQuery(
    `select id, firm_id, client_id, source_entry_id,
            period_start::text as period_start, period_end::text as period_end,
            reason, stated_by, stated_at, superseded_by, superseded_at
       from clara.prepayment_stated_terms where id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function statedTermsFor(sourceEntry) {
  const r = await rootQuery(
    `select id, period_start::text as period_start, period_end::text as period_end,
            reason, superseded_by, superseded_at
       from clara.prepayment_stated_terms where source_entry_id = $1 order by stated_at`,
    [sourceEntry]);
  return r.rows;
}

/** The schedule row's own term-provenance columns, read off the relation rather than off a door
 *  whose projection is itself under test. */
export async function scheduleTermSource(id) {
  const r = await rootQuery(
    `select term_source, stated_term_id, service_period_id, document_id, schedule_version
       from clara.prepayment_schedules where id = $1`, [id]);
  return r.rows[0] ?? null;
}

/** How many schedules stand over one recognition entry — the instrument for "a create-time
 *  refusal writes no schedule row", which is a claim about the RELATION and not about the door's
 *  answer. */
export async function scheduleCountFor(sourceEntry) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.prepayment_schedules where source_entry_id = $1",
    [sourceEntry]);
  return r.rows[0].n;
}

/** Whether one application role can EXECUTE one signature. The instrument for "the machine role
 *  cannot reach it" — a POSITIVE read of the catalog, never the absence of a grant statement. */
export async function roleCanExecute(role, signature) {
  const r = await rootQuery(
    "select has_function_privilege($1, to_regprocedure($2), 'execute') as ok", [role, signature]);
  return r.rows[0].ok;
}

/** Every function whose name matches a pattern, so a cell can assert that NO wake wrapper exists
 *  for this door rather than assert that one it happens to know of is absent. */
export async function functionsMatching(pattern) {
  const r = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname ~ $1 order by 1`, [pattern]);
  return r.rows.map((x) => x.proname);
}

/** THE CORRECTION DOOR (#939 AC4). A bookkeeper who has already superseded the term states why,
 *  cites a fresh instruction, and the estate opens the replacement schedule over the periods the
 *  original never admitted. Named arguments, as every wrapper here. */
export async function replacePrepaymentSchedule(sub, {
  client, schedule, reason = REPLACE_REASON_TEXT, authorityRef, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("replace_prepayment_schedule", [
    { name: "p_client", cast: "uuid" }, { name: "p_schedule", cast: "uuid" },
    { name: "p_reason", cast: "text" }, { name: "p_authority_ref", cast: "jsonb" },
    { name: "p_op_key", cast: "text" },
  ]), [client, schedule, reason, JSON.stringify(authorityRef), opKey ?? opk("p939-replace")]);
  return r.rows[0].result;
}

/** One schedule row's supersession stamp, read off the RELATION — the instrument for "the
 *  predecessor stays on the record and names its successor", which is a claim about the row rather
 *  than about the door's answer. */
export async function scheduleSupersession(id) {
  const r = await rootQuery(
    `select id, superseded_by, superseded_at, replaces_schedule_id
       from clara.prepayment_schedules where id = $1`, [id]);
  return r.rows[0] ?? null;
}

/** How many LIVE schedules stand over one recognition entry. `scheduleCountFor` counts the whole
 *  chain (which a correction lengthens on purpose); this counts the rule that must never break —
 *  at most one schedule per recognition is live at a time. */
export async function liveScheduleCountFor(sourceEntry) {
  const r = await rootQuery(
    `select count(*)::int as n from clara.prepayment_schedules
      where source_entry_id = $1 and superseded_at is null`, [sourceEntry]);
  return r.rows[0].n;
}

export const nowhereId = () => randomUUID();
