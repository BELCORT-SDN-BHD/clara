// 0042 Wave D-b — the ADJUSTMENT-TEMPLATE lane's helper CORE: vocabulary, readiness,
// MYT date arithmetic, refusal assertions and the pinned verb wrappers (NOT a test
// file: the name does not end in `.test.mjs`, so `node --test` ignores it). The
// fixture world, the root readbacks and the fixture surgery live in the sibling
// `x42-adj-helpers.mjs`, which re-exports THIS module so a cell file imports ONE leaf.
//
// WHY A SPLIT: the repo enforces a 500-line file ceiling (the x41-fa-fixtures /
// x41-fa-world precedent). Nothing here depends on the sibling.
//
// CONTRACT-BLIND. Every line was written from `docs/plan/wave-d-b-design.md`
// (WDB-G1..G16, §1–§9), `docs/plan/wave-d-b-design-abi.md` (§A signatures, §B flags,
// §C lines/memo/period/index law, §D DDL, §E op-key matrix, §F refusal tokens, §G
// event payloads) and `docs/plan/wave-d-contract.md` §4 ONLY. This lane NEVER reads
// 0042's SQL. Every verb is called by its PINNED name with NAMED args; every refusal
// is asserted by its pinned ERRCODE + `detail.reason` TOKEN (ABI §F is LAW). A 42883 /
// param-name / token divergence at integration is a FINDING for orchestrator
// adjudication, never a silent test edit. (The C-b lesson: three production bugs were
// caught only by contract-authored cells.)
//
// READINESS. The migration number is claimed at MERGE (standing law), so the gate is
// the CATALOG — the table `clara.adjustment_templates` plus the fn
// `propose_adjustment_template` — never a `schema_migrations` version string and never
// a file on disk (the x38 `hasBankMatching()` precedent).
//
// DATE LAW. Every date-sensitive fixture descends from the DATABASE's own
// Asia/Kuala_Lumpur clock, read once per test process, and is walked with pure integer
// calendar arithmetic. Never a JS `new Date()` as "today", never a calendar literal.
// The poster's ENDED test and WDB-G4's catch-up boundary both read the real MYT wall
// clock, so a hardcoded "2026-08-01" fixture would rot the instant real time crossed
// it (the 2026-08-01 00:10 MYT CI incident).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, humanQuery, roleQuery, getPool, namedCall, opk, idOf,
  noteLane, markSkip, printLaneNotes, printSkipCount, endPool,
  createClient, createFirm, seedAdmission, insertUser, addMember,
  upsertAccountClassed, freshResolution, draftEntryV3, approveEntry, reverseEntry,
  reviseEntry, withdrawDraft, assertRaises, assertRaisesOneOf, CLR, PG,
} from "./a21-helpers.mjs";
import { addBankAccount } from "./x38-match-fixtures.mjs";

export {
  ROLES, rootQuery, humanQuery, roleQuery, getPool, namedCall, opk, idOf,
  noteLane, markSkip, printLaneNotes, printSkipCount, endPool,
  createClient, createFirm, seedAdmission, insertUser, addMember,
  upsertAccountClassed, freshResolution, draftEntryV3, approveEntry, reverseEntry,
  reviseEntry, withdrawDraft, assertRaises, assertRaisesOneOf, CLR, PG, addBankAccount,
};

export const uniqTag = () => randomUUID().slice(0, 6);

// ---------------------------------------------------------------------------
// Suite-scoped COA codes. Grammar '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$' (0009 O9).
// Every code carries this lane's OWN `D42` discriminator (grepped against x41's D41,
// x38's C38 and every other battery's codes before choosing).
// ---------------------------------------------------------------------------

export const EXPA = "900-D42"; // ordinary expense — the accrual template's debit leg
export const EXPB = "901-D42"; // a SECOND expense — the lines_changed forge target
export const ACCR = "400-D42"; // accruals (liability, NO account_class) — the credit leg
export const ACCR2 = "401-D42"; // a second accrual account (second template / isolation)
export const PREP = "150-D42"; // prepayments (asset, non-control) — advance-enrollable
export const PREP2 = "151-D42"; // a second prepayment — the propose-time advance cell
export const BANKX = "100-D42"; // the client's BANK coa code (mapped by add_bank_account)
export const ARX = "300-D42"; // receivable CONTROL (account_class set) — ineligible
export const INACT = "600-D42"; // the account this lane deactivates (root surgery)
export const FACOST = "200-D42"; // an FA cost account — reserved via an FA profile
export const FAACC = "210-D42"; // its accumulated-depreciation pair
export const FAEXP = "902-D42"; // its depreciation-expense role

/** The lane's chart: [code, name, account_type, account_class]. */
export const CHART = [
  [EXPA, "Audit fee (x42)", "expense", null],
  [EXPB, "Professional fees (x42)", "expense", null],
  [ACCR, "Accruals (x42)", "liability", null],
  [ACCR2, "Accruals 2 (x42)", "liability", null],
  [PREP, "Prepayments (x42)", "asset", null],
  [PREP2, "Prepayments 2 (x42)", "asset", null],
  [BANKX, "Maybank current (x42)", "asset", null],
  [ARX, "Trade Debtors (x42)", "asset", "receivable"],
  [INACT, "Sundry (x42, deactivated)", "expense", null],
  [FACOST, "Plant & Machinery (x42)", "asset", null],
  [FAACC, "Accum Depreciation (x42)", "asset", null],
  [FAEXP, "Depreciation Expense (x42)", "expense", null],
];

// ---------------------------------------------------------------------------
// Refusal vocabulary — ABI §F. These spellings (errcode AND detail.reason) are LAW
// for both lanes; a divergence is a finding, never a constant to edit here.
// ---------------------------------------------------------------------------

export const CLR38 = "CLR38"; // the poster/admission + template lifecycle family
export const CLR39 = "CLR39"; // approve-time staleness + the pair locks
export const CLR10 = "CLR10"; // malformed / lifecycle refusals
export const CLR04 = "CLR04"; // role floors

export const T = {
  periodOutOfWindow: "period_out_of_window", // CLR38
  periodAlreadyMet: "period_already_met", // CLR38
  occurrenceDraftOutstanding: "occurrence_draft_outstanding", // CLR38 (poster AND retire)
  templateNotLive: "template_not_live", // CLR38
  periodRequestInvalid: "period_request_invalid", // CLR38 (+ axis)
  templateDuplicate: "template_duplicate", // CLR10
  templateFyStale: "template_fy_stale", // CLR10
  // ONE word, THREE altitudes (design §2.1 "as one body"): CLR10 at propose, CLR38 at the
  // poster, and — since the as-built ladder — a blocked[] reason on the due oracle, which
  // must never advertise a period the poster is guaranteed to refuse.
  templateLineIneligible: "template_line_ineligible", // CLR10 / CLR38 / blocked[]
  notAnAutoPair: "not_an_auto_pair", // CLR10
  proposalNotRevisable: "proposal_not_revisable", // CLR10
  adjustmentStale: "adjustment_stale", // CLR39 (+ axis)
  adjustmentPairLocked: "adjustment_pair_locked", // CLR39
  pairDraftLocked: "pair_draft_locked", // CLR39
};

/** Arm (2)'s SEVEN re-validation axes, in the design's own §2.6 order. */
export const STALE_AXES = [
  "origin", "issuer_receipt", "template_retired", "lines_changed",
  "period_invalid", "mode", "line_eligibility",
];

/** The two axes `period_request_invalid` may name (ABI §F). */
export const PERIOD_AXES = ["not_cadence_aligned", "not_ended"];

// ---------------------------------------------------------------------------
// Readiness — the CATALOG is the gate (the migration number claims at merge).
// ---------------------------------------------------------------------------

let _live = null;
let _mytToday = null;

export async function hasAdjustments() {
  try {
    const r = await rootQuery(
      `select
         (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='clara' and c.relname='adjustment_templates' and c.relkind='r' limit 1) as tbl,
         (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='clara' and p.proname='propose_adjustment_template' limit 1) as fn`,
    );
    return r.rows[0]?.tbl != null && r.rows[0]?.fn != null;
  } catch {
    return false; // the catalog is not reachable — certainly not at 0042
  }
}

/** Best-effort migrate + the shared base, then the 0042 catalog gate. Also reads the
 *  DB's OWN Asia/Kuala_Lumpur current DATE once per process (never a JS clock). */
export async function x42EnsureReady() {
  if (_live !== null) return _live;
  const { a21EnsureReady } = await import("./a21-helpers.mjs");
  const base = await a21EnsureReady();
  _live = Boolean(base.base && base.has16 && (await hasAdjustments()));
  if (!_live) {
    noteLane("0042 absent (clara.adjustment_templates / propose_adjustment_template not in the catalog) — the Wave-D-b adjustment battery is dormant");
    return _live;
  }
  const r = await rootQuery("select (now() at time zone 'Asia/Kuala_Lumpur')::date::text as d");
  _mytToday = r.rows[0].d;
  noteLane(`x42 DB-clock anchor: MYT today = ${_mytToday}`);
  return _live;
}

/** Loud + COUNTED (the house skip16 / skip41 discipline): a dormant suite must show
 *  up in printSkipCount, never quietly green. */
export function skip42(t, live, label = "the Wave-D-b adjustment battery") {
  if (!live) {
    markSkip();
    t.skip(`0042 not applied (clara.adjustment_templates absent) — ${label} is dormant`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// DATE ARITHMETIC over the DB's MYT anchor. `Date.UTC` appears ONLY as pure calendar
// arithmetic (the a21-watch-anchors idiom), never as "today".
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, "0");
export const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const dstr = (y, m, d) => `${y}-${pad2(m)}-${pad2(Math.min(d, daysIn(y, m)))}`;

/** 'YYYY-MM-DD' — the DB's own Asia/Kuala_Lumpur current date. */
export function mytToday() {
  assert.ok(_mytToday, "x42EnsureReady() must run before any date fixture (the DB clock anchor)");
  return _mytToday;
}

/** {y, m, d} of the MYT anchor date. */
export function anchorParts() {
  const [y, m, d] = mytToday().split("-").map(Number);
  return { y, m, d };
}

/** `iso` shifted by `n` whole days, as 'YYYY-MM-DD' (pure calendar arithmetic). */
export function addDays(iso, n) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** ISO-date comparison as plain string comparison ('YYYY-MM-DD' sorts lexically). */
export const dlt = (a, b) => String(a) < String(b);

/** The month `n` months off the MYT anchor month as {y,m,start,end,label,key}.
 *  n=0 is the month IN PROGRESS: its period_end lies in the future on every day but
 *  the month's last, so a monthly occurrence for it is not ENDED. */
export function mon(n) {
  const a = anchorParts();
  const total = a.y * 12 + (a.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  const end = dstr(y, m, daysIn(y, m));
  return { y, m, start: dstr(y, m, 1), end, label: monthLabel(end), key: `${y}-${pad2(m)}` };
}

/** 'YYYY-MM-DD' for `day` of a mon() month (clamped to the month's length). */
export const dayIn = (m, day) => dstr(m.y, m.m, day);

/** Postgres `to_char(d, 'Mon YYYY')` rebuilt INDEPENDENTLY here — 'Mon' is the
 *  three-letter English abbreviation and (unlike 'Month') is NOT blank-padded. The
 *  array is fixed so no JS locale can leak into an asserted memo string (ABI §C). */
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(iso) {
  const [y, m] = String(iso).split("-").map(Number);
  return `${MON3[m - 1]} ${y}`;
}

/** Postgres `'FY' || to_char(d, 'YYYY')` — the annual period label (ABI §C). */
export const fyLabel = (iso) => `FY${String(iso).slice(0, 4)}`;

/** The financial year whose CLOSE is (closeYear, fyMonth, fyDay): period_start is the
 *  day AFTER the previous close, period_end is the close itself. Derived, never a
 *  literal; the client's FYE defaults to 31 December when unset (0041's coalesce). */
export function fyWindow(closeYear, fyMonth = 12, fyDay = 31) {
  const end = dstr(closeYear, fyMonth, fyDay);
  const prev = dstr(closeYear - 1, fyMonth, fyDay);
  return { start: addDays(prev, 1), end, label: fyLabel(end) };
}

/** The LAST financial year that has ENDED against the MYT anchor, for FYE (m, d). */
export function lastEndedFy(fyMonth = 12, fyDay = 31) {
  const t = mytToday();
  let y = anchorParts().y;
  while (!dlt(dstr(y, fyMonth, fyDay), t)) y -= 1; // walk back until the close is strictly past
  return fyWindow(y, fyMonth, fyDay);
}

/** The canonical period label for a cadence + period_end (ABI §C). */
export const periodLabel = (cadence, periodEnd) =>
  (cadence === "annual" ? fyLabel(periodEnd) : monthLabel(periodEnd));

/** Occurrence memo grammar (ABI §C): `memo_template || ' — ' || period_label`. The
 *  separator is an EM DASH (U+2014) with a space each side — asserted byte for byte,
 *  because a hyphen here would be a real divergence. */
export const occurrenceMemo = (memoTemplate, cadence, periodEnd) =>
  `${memoTemplate} — ${periodLabel(cadence, periodEnd)}`;

/** Mirror memo grammar (design §2.4): the occurrence memo, 'Auto-reversal: '-prefixed. */
export const mirrorMemo = (memo) => `Auto-reversal: ${memo}`;

// ---------------------------------------------------------------------------
// REFUSAL ASSERTIONS — by ERRCODE + NAMED REASON TOKEN (ABI §F). The token is read
// from the exception DETAIL json ({"reason": "..."}); failing that it is matched
// against the message text and the weaker match is recorded as a LANE NOTE (a
// finding — the ABI pins the DETAIL discriminant, not prose).
// ---------------------------------------------------------------------------

export function reasonToken(err) {
  const d = String(err?.detail ?? "");
  const m = /"reason"\s*:\s*"([a-z0-9_]+)"/.exec(d);
  return m ? m[1] : null;
}

/** The named `axis` discriminant out of a refusal's DETAIL json. */
export const axisOf = (err) =>
  /"axis"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;

export async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

/** fn() MUST refuse; the refusal MUST name `token`, and (when `code` is supplied) MUST
 *  carry exactly that SQLSTATE. Both halves are ABI §F law. */
export async function refuses(fn, token, label, { code = null } = {}) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected the NAMED refusal '${token}' but the call SUCCEEDED`);
  const got = reasonToken(err);
  if (got !== token) {
    const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
    assert.ok(
      blob.includes(token),
      `${label}: expected the named refusal '${token}'; got reason='${got ?? "(none)"}' code=${err.code ?? "(none)"} — ${err.message}`,
    );
    noteLane(`${label}: '${token}' matched in the message text, not the DETAIL {"reason":…} discriminant — finding (ABI §F pins DETAIL)`);
  }
  if (code) {
    assert.equal(err.code, code,
      `${label}: ABI §F pins errcode ${code} for '${token}' (got ${err.code ?? "(none)"} — ${err.message})`);
  }
  return err;
}

/** fn() MUST refuse with `token` AND name one of `axes` in its DETAIL. */
export async function refusesAxis(fn, token, axes, label, { code = null } = {}) {
  const err = await refuses(fn, token, label, { code });
  const got = axisOf(err);
  const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
  const hit = axes.find((a) => got === a || blob.includes(a));
  assert.ok(hit,
    `${label}: the refusal names one of axis ${axes.join(" / ")} (got axis='${got ?? "(none)"}' — ${err.message})`);
  if (axes.length > 1 || got !== axes[0]) noteLane(`${label}: refused on axis '${got ?? hit}'`);
  return err;
}

/** fn() MUST refuse with ONE of `tokens` — used ONLY where the design states the
 *  precondition but the ABI assigns it no single token. The observed token is recorded
 *  so a divergence is VISIBLE rather than silently tolerated. */
export async function refusesOneOf(fn, tokens, label) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected a NAMED refusal (one of ${tokens.join(" / ")}) but the call SUCCEEDED`);
  const got = reasonToken(err);
  const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
  const hit = tokens.find((tok) => got === tok || blob.includes(tok));
  assert.ok(hit,
    `${label}: expected one of ${tokens.join(" / ")}; got reason='${got ?? "(none)"}' code=${err.code ?? "(none)"} — ${err.message}`);
  noteLane(`${label}: refused by '${hit}'`);
  return err;
}

/** fn() MUST refuse with one of `codes` — the shape for rules the design STATES but
 *  ABI §F leaves unnamed (propose-time line validation; the FYE annual guard). The
 *  observed reason is recorded so the assembly lane can promote it into §F. */
export async function refusesCode(fn, codes, label) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected a refusal but the call SUCCEEDED`);
  assert.ok(codes.includes(err.code),
    `${label}: expected SQLSTATE ${codes.join("/")}; got ${err.code ?? "(none)"} — ${err.message}`);
  noteLane(`${label}: refused ${err.code} reason='${reasonToken(err) ?? "(none)"}' (ABI §F names no token for this rule — assembly may promote it)`);
  return err;
}

// ---------------------------------------------------------------------------
// PINNED VERB WRAPPERS — NAMED args verbatim from ABI §A. A param-name divergence at
// integration is a FINDING, never a rig bug.
// ---------------------------------------------------------------------------

const humanCall = async (sub, fn, specs, vals) =>
  (await humanQuery(sub, namedCall(fn, specs), vals)).rows[0].result;

export const proposeTemplate = (sub, {
  client, name, cadence = "monthly", start, end = null, autoReverse = false,
  lines, memo = "x42 accrual", opKey = null,
}) => humanCall(sub, "propose_adjustment_template", [
  { name: "p_client" }, { name: "p_name" }, { name: "p_cadence" },
  { name: "p_start_date", cast: "date" }, { name: "p_end_date", cast: "date" },
  { name: "p_auto_reverse", cast: "boolean" }, { name: "p_lines", cast: "jsonb" },
  { name: "p_memo_template" }, { name: "p_op_key" },
], [client, name, cadence, start, end, autoReverse, JSON.stringify(lines), memo, opKey ?? opk("x42prop")]);

export const signTemplate = (sub, { client, template, opKey = null }) =>
  humanCall(sub, "sign_adjustment_template", [
    { name: "p_client" }, { name: "p_template" }, { name: "p_op_key" },
  ], [client, template, opKey ?? opk("x42sign")]);

export const retireTemplate = (sub, { client, template, reason = "x42 retire", opKey = null }) =>
  humanCall(sub, "retire_adjustment_template", [
    { name: "p_client" }, { name: "p_template" }, { name: "p_reason" }, { name: "p_op_key" },
  ], [client, template, reason, opKey ?? opk("x42ret")]);

/** The MACHINE path — EXECUTE granted to clara_runtime ONLY (ABI §A). The op-key shape
 *  is the reconciler's own `adj:<client>:<template>:<period_start>:<rand8>` (ABI §E —
 *  the random suffix is load-bearing). Returns {receipt, opKey} so a cell that must
 *  reach the poster's op-receipt row (the issuer axis) knows the key it reserved. */
export async function runOccurrenceKeyed({ client, template, periodStart, periodEnd, opKey = null }) {
  const key = opKey ?? `adj:${client}:${template}:${periodStart}:${randomUUID().slice(0, 8)}`;
  const r = await roleQuery(ROLES.runtime, namedCall("run_adjustment_occurrence", [
    { name: "p_client" }, { name: "p_template" },
    { name: "p_period_start", cast: "date" }, { name: "p_period_end", cast: "date" },
    { name: "p_op_key" },
  ]), [client, template, periodStart, periodEnd, key]);
  return { receipt: r.rows[0].result, opKey: key };
}
export const runOccurrence = async (args) => (await runOccurrenceKeyed(args)).receipt;

/** The human twin — bookkeeper+ (ABI §A). */
export const runManual = (sub, { client, template, periodStart, periodEnd, opKey = null }) =>
  humanCall(sub, "run_adjustment_manual", [
    { name: "p_client" }, { name: "p_template" },
    { name: "p_period_start", cast: "date" }, { name: "p_period_end", cast: "date" },
    { name: "p_op_key" },
  ], [client, template, periodStart, periodEnd, opKey ?? opk("x42man")]);

/** The due oracle. Rendered on /rules and read by the sweep, so BOTH the runtime role
 *  and a human are exercised by the cells. */
export async function adjustmentRunDue(client, { asRole = ROLES.runtime } = {}) {
  const r = await roleQuery(asRole, "select clara.adjustment_run_due(p_client => $1) as r", [client]);
  return r.rows[0].r;
}
export async function adjustmentRunDueAsHuman(sub, client) {
  const r = await humanQuery(sub, "select clara.adjustment_run_due(p_client => $1) as r", [client]);
  return r.rows[0].r;
}

export const reversePair = (sub, { client, occurrence, reason = "x42 pair correction", opKey = null }) =>
  humanCall(sub, "reverse_adjustment_pair", [
    { name: "p_client" }, { name: "p_occurrence" }, { name: "p_reason" }, { name: "p_op_key" },
  ], [client, occurrence, reason, opKey ?? opk("x42pair")]);

export function approvePairReversal(sub, { client, pair, attestation = null, opKey = null }) {
  const specs = [{ name: "p_client" }, { name: "p_pair" }, { name: "p_op_key" }];
  const vals = [client, pair, opKey ?? opk("x42pairapr")];
  if (attestation != null) { specs.push({ name: "p_attestation" }); vals.push(attestation); }
  return humanCall(sub, "approve_pair_reversal", specs, vals);
}

export const cancelPairReversal = (sub, { client, pair, reason = "x42 pair cancel", opKey = null }) =>
  humanCall(sub, "cancel_pair_reversal", [
    { name: "p_client" }, { name: "p_pair" }, { name: "p_reason" }, { name: "p_op_key" },
  ], [client, pair, reason, opKey ?? opk("x42pcan")]);

/** The advance enrolment (ABI §A). This lane calls it ONLY to RESERVE a code, which is
 *  the line-eligibility rule's fifth axis (design §2.1) and arm (2)'s seventh. */
export const enrolAdvance = (sub, {
  client, accountCode, personLabel = "x42 staff member", confirmDedicated = true,
  attestation = "x42: dedicated advance account, not a related party", opKey = null,
}) => humanCall(sub, "enrol_staff_advance_account", [
  { name: "p_client" }, { name: "p_account_code" }, { name: "p_person_label" },
  { name: "p_confirm_dedicated", cast: "boolean" }, { name: "p_attestation" }, { name: "p_op_key" },
], [client, accountCode, personLabel, confirmDedicated, attestation, opKey ?? opk("x42adv")]);

/** 0041's PUBLIC enrolment door — the OTHER way a code becomes role-reserved
 *  (`_acct_role_reserved` reads FA profiles ∪ FA register ∪ advance enrolments). */
export const upsertFaProfile = (sub, { client, assetAccount, accumAccount = null, expenseAccount = null, opKey = null }) =>
  humanCall(sub, "upsert_fa_account_profile", [
    { name: "p_client" }, { name: "p_asset_account" }, { name: "p_accum_account" },
    { name: "p_depr_expense_account" }, { name: "p_op_key" },
  ], [client, assetAccount, accumAccount, expenseAccount, opKey ?? opk("x42fa")]);

/** 0041's chain-of-recuts FYE door — 0042 splices the annual-template guard into it. */
export const setClientFyEnd = (sub, { client, month, day, opKey = null }) =>
  humanCall(sub, "set_client_fy_end", [
    { name: "p_client" }, { name: "p_month", cast: "int" }, { name: "p_day", cast: "int" },
    { name: "p_op_key" },
  ], [client, month, day, opKey ?? opk("x42fy")]);
