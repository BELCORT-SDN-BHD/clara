// 0042 Wave D-b — the STAFF-ADVANCE lane's OWN shared helper CORE (NOT a test file:
// the name does not end in `.test.mjs`, so `node --test` ignores it). The fixture
// world + root readbacks live in the sibling `x42-adv-world.mjs`, which re-exports
// everything here so a test file imports ONE module (the x41-fa-fixtures /
// x41-fa-world split, forced by the repo's 500-line file ceiling).
//
// CONTRACT-BLIND. Authored from `docs/plan/wave-d-b-design.md` §3 + §7 and
// `docs/plan/wave-d-b-design-abi.md` (§A signatures/envelopes, §B flags keys,
// §D DDL, §F the refusal-token table) ONLY — this lane NEVER reads migration 0042,
// the 0042 section drafts, or the harvested live bodies. Every verb is called by its
// PINNED name with NAMED args; every refusal §F names is asserted by its errcode AND
// its DETAIL {"reason": …} token, verbatim. A 42883 / param-name / token / errcode
// divergence at integration is a FINDING for orchestrator adjudication, never a
// silent test edit. (The C-b lesson: three production bugs were caught only by
// contract-authored cells.)
//
// SELF-CONTAINED. This module deliberately duplicates the small x41 idioms (refusal
// assertions, DB-clock date arithmetic) instead of importing the D-a lane's world,
// so the two 0042 test lanes share nothing but the house harness (`a21-helpers` →
// `wave-a-fixtures` → `rig-helpers`) and the Wave-B multi-user world.
//
// DATE LAW. Every date-sensitive fixture descends from `anchor` — the DATABASE's own
// Asia/Kuala_Lumpur clock, read once per test process — and is walked with pure
// integer arithmetic. Never a JS `new Date()` as "today", never a calendar literal:
// the enrolment watermark, the temporal cap and the void stamps all read real MYT
// time, so a hardcoded fixture date would rot the instant real time crossed it (the
// 2026-08-01 00:10 MYT CI incident).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery, namedCall, opk, noteLane, markSkip, a21EnsureReady } from "./a21-helpers.mjs";

export * from "./a21-helpers.mjs";

// ---------------------------------------------------------------------------
// Suite-scoped COA codes. Grammar '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$' (0009 O9).
// The `-V42` suffix is this lane's OWN (grepped against every other battery).
// ---------------------------------------------------------------------------

export const ADV1 = "350-V42"; // the enrolled staff-advance account  (asset, non-control)
export const ADV2 = "351-V42"; // a SECOND advance account            (multi-enrolment cells)
export const ADV3 = "352-V42"; // a THIRD advance account             (generation/tie cells)
export const BANKV = "100-V42"; // bank / funding leg                  (asset, non-control)
export const BANK2 = "170-V42"; // a second asset code — the add_bank_account control arm
export const WAGES = "610-V42"; // payroll expense — the payroll_deduction counter-leg
export const OTHERV = "620-V42"; // an ordinary expense — never enrolled
export const ARV = "300-V42"; // receivable CONTROL (the non-control refusal cell)
export const APV = "400-V42"; // payable CONTROL
export const FACOST = "200-V42"; // FA cost account  (the cross-domain reservation cells)
export const FAACCUM = "210-V42"; // FA accumulated depreciation
export const FAEXP = "900-V42"; // FA depreciation expense
export const SHAREV = "910-V42"; // share capital — the opening-balance balancing credit

/** Refusal reason tokens — ABI §F. These spellings are LAW for both 0042 lanes. */
export const T = {
  enrolmentBalanceNonzero: "enrolment_balance_nonzero",
  advanceOutstandingOnRetire: "advance_outstanding_on_retire",
  particularsAlreadySet: "particulars_already_set",
  advanceOverApplication: "advance_over_application",
  applicationPredatesAdvance: "application_predates_advance",
  advanceApplicationMissing: "advance_application_missing",
  advanceMovementUnregistered: "advance_movement_unregistered",
  advanceApplicationsOutstanding: "advance_applications_outstanding",
  correctionEntryIrreversible: "correction_entry_irreversible",
  proposalNotRevisable: "proposal_not_revisable",
  // AS-BUILT ADDITION TO §F, adjudicated at the as-built ladder and NOT in the design
  // packet: the refusal that stops a reversal mirror — which `clara.reverse_entry`
  // always dates at TODAY (MYT) — from unwinding a FUTURE-DATED fact. Design §3.3 pins
  // both register acts to the mirror's posting_date, so the only honest way to keep the
  // §3.2 equation meaningful is to refuse the case that pinning cannot describe rather
  // than to re-derive the date. Axes: `void_predates_issue`, `correction_predates_application`.
  advanceReversalPredatesMovement: "advance_reversal_predates_movement",
};

/** The SQLSTATEs ABI §F assigns to those sites. 0042 claims CLR38/39/40. */
export const E = { badRequest: "CLR10", authz: "CLR04", notFound: "CLR11", adv: "CLR39", belt: "CLR40" };

/** The three EA-1955 policy facts ABI §D.7 seeds (effective_from 2026-08-01). */
export const EA1955_FACTS = ["s22_prior_month_wage_cap", "s24_2c_interest_free_recovery", "s27_no_interest"];

/** The proposal kinds `book_staff_advance_application` admits (ABI §A). `correction`
 *  is NOT here on purpose — corrections are HOOK-BORN ONLY (design §3.2). */
export const APPLICATION_KINDS = ["payroll_deduction", "bank_return", "claim"];

// ---------------------------------------------------------------------------
// Readiness — the gate is the clara.schema_migrations row (the x41Has0041
// template), NEVER the migration file on disk.
// ---------------------------------------------------------------------------

let _live = null;
let _anchor = null;

export async function x42Has0042() {
  try {
    const r = await rootQuery("select version from clara.schema_migrations where version ~ '^0042_'");
    return r.rows.length > 0;
  } catch {
    return false; // schema_migrations absent — certainly not at 0042
  }
}

/** Best-effort migrate + the 0011/0016 base, then the 0042 gate. Cached. Also reads
 *  the DB's Asia/Kuala_Lumpur anchor (year, month AND day) once per process. */
export async function x42EnsureReady() {
  if (_live !== null) return _live;
  const ready = await a21EnsureReady();
  _live = Boolean(ready.base && ready.has16 && (await x42Has0042()));
  if (!_live) {
    noteLane("0042 absent (or the 0011/0016 surface is not ready) — the Wave-D-b advance battery is dormant");
    return _live;
  }
  const r = await rootQuery(
    `select extract(year from d)::int as y, extract(month from d)::int as m, extract(day from d)::int as d
       from (select (now() at time zone 'Asia/Kuala_Lumpur')::date as d) s`,
  );
  _anchor = { y: r.rows[0].y, m: r.rows[0].m, d: r.rows[0].d };
  noteLane(`x42-adv DB-clock anchor: MYT today ${_anchor.y}-${pad2(_anchor.m)}-${pad2(_anchor.d)}`);
  return _live;
}

/** Loud + COUNTED (the house skip16 / skip41 discipline): a dormant suite must show
 *  up in printSkipCount, never quietly green. */
export function skip42(t, live, label = "the Wave-D-b staff-advance battery") {
  if (!live) {
    markSkip();
    t.skip(`0042 not applied (clara.schema_migrations has no '0042_%' row) — ${label} is dormant`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// DATE ARITHMETIC over the DB anchor. `Date.UTC` appears only inside daysIn(),
// today() and dayDiff() as pure calendar arithmetic, never as "today".
// ---------------------------------------------------------------------------

function pad2(n) { return String(n).padStart(2, "0"); }
export const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const dstr = (y, m, d) => `${y}-${pad2(m)}-${pad2(Math.min(d, daysIn(y, m)))}`;

export function anchorYMD() {
  assert.ok(_anchor, "x42EnsureReady() must run before any date fixture (the DB clock anchor)");
  return _anchor;
}

/** {y,m} shifted n months off the DB anchor month (n negative = into the past). */
export function shift(n) {
  const a = anchorYMD();
  const total = a.y * 12 + (a.m - 1) + n;
  const y = Math.floor(total / 12);
  return { y, m: total - y * 12 + 1 };
}

/** The month n months off the anchor as {y,m,start,end,key}. n=0 is the month in
 *  progress. */
export function mon(n) {
  const { y, m } = shift(n);
  return { y, m, start: dstr(y, m, 1), end: dstr(y, m, daysIn(y, m)), key: `${y}-${pad2(m)}` };
}

/** 'YYYY-MM-DD' for `day` of a mon() month (clamped to the month's length). */
export const dayIn = (m, day) => dstr(m.y, m.m, day);

/** MYT today, and MYT today + n days — pure calendar arithmetic off the DB anchor.
 *  The `after retired_at` watermark cells need a date unambiguously LATER than a
 *  retirement stamped during the run, under either an inclusive or an exclusive
 *  reading of the window's upper bound — a SAME-DAY movement is the ambiguous case
 *  and is deliberately never the pin. */
export function today(offsetDays = 0) {
  const a = anchorYMD();
  const t = new Date(Date.UTC(a.y, a.m - 1, a.d));
  t.setUTCDate(t.getUTCDate() + offsetDays);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** Whole days from 'YYYY-MM-DD' a to 'YYYY-MM-DD' b (b − a). */
export function dayDiff(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export const uniqTag = () => randomUUID().slice(0, 6);

// ---------------------------------------------------------------------------
// REFUSAL ASSERTIONS. ABI §F pins BOTH the errcode and the DETAIL {"reason": …}
// discriminant, so `refusesWith` asserts both; `refuses` pins the token alone;
// `refusesNamed` is for preconditions the design states but §F assigns no token to
// — it still PROVES a refusal happened and RECORDS the observed (code, reason) so a
// divergence is visible rather than silently tolerated.
// ---------------------------------------------------------------------------

export function reasonToken(err) {
  const m = /"reason"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""));
  return m ? m[1] : null;
}

/** The DETAIL `axis` discriminant, where a site carries one. Two refusals may share a
 *  token and still be different defects with different remedies (the belt's unregistered
 *  MIRROR vs its unregistered ordinary debit); the axis is what a cell pins to prove it
 *  exercised the arm it meant to, rather than passing on a same-token neighbour. */
export function axisToken(err) {
  const m = /"axis"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""));
  return m ? m[1] : null;
}

export const errBlob = (err) => `${err?.message ?? ""} ${err?.detail ?? ""} ${err?.hint ?? ""}`;

/** The whole DETAIL object. ABI §F pins the {"reason": …} discriminant there; the
 *  as-built ladder additionally requires a refusal to carry its REMEDY in machine-
 *  readable form beside it (`remedy`, `reenrolment_balance_cents`, `reversible_on`),
 *  so a surface never has to parse English to know what the caller can actually do.
 *  Returns {} when a site carries no JSON detail — an assertion on a missing key then
 *  fails loudly instead of throwing somewhere unrelated. */
export function detailOf(err) {
  try {
    const d = JSON.parse(String(err?.detail ?? ""));
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

export async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

/** fn() MUST refuse, and the refusal MUST name `token` in its DETAIL discriminant
 *  (a message-text-only match is tolerated but recorded as a finding). */
export async function refuses(fn, token, label) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected the NAMED refusal '${token}' but the call SUCCEEDED`);
  const got = reasonToken(err);
  if (got === token) return err;
  assert.ok(
    errBlob(err).includes(token),
    `${label}: expected the named refusal '${token}'; got reason='${got ?? "(none)"}' code=${err.code ?? "(none)"} — ${err.message}`,
  );
  noteLane(`${label}: '${token}' matched in the message text, not the DETAIL {"reason":…} discriminant — finding (ABI §F pins DETAIL)`);
  return err;
}

/** ABI §F in full: the errcode AND the reason token are LAW at this site. */
export async function refusesWith(fn, code, token, label) {
  const err = await refuses(fn, token, label);
  assert.equal(err.code, code,
    `${label}: ABI §F assigns SQLSTATE ${code} here; got ${err.code ?? "(none)"} (reason='${reasonToken(err)}') — ${err.message}`);
  return err;
}

/** fn() MUST refuse; the token is UNPINNED by §F, so record what fired. `codes`
 *  (optional) pins the SQLSTATE class the design does state. */
export async function refusesNamed(fn, label, { codes = null } = {}) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected a NAMED refusal but the call SUCCEEDED`);
  if (codes) {
    assert.ok(codes.includes(err.code),
      `${label}: expected one of SQLSTATE ${codes.join("/")}; got ${err.code ?? "(none)"} — ${err.message}`);
  }
  noteLane(`${label}: refused code=${err.code ?? "(none)"} reason='${reasonToken(err) ?? "(none)"}'`);
  return err;
}

/** THE UNSPECIFIED-AXIS PROBE (the x42v.r3 shape, generalised at integration).
 *
 *  For an axis the design genuinely does NOT pin, an assertion in either direction is a
 *  fabrication: demanding a refusal invents a law, and demanding success turns the cell into a
 *  landmine the day the law is written on purpose. So this RECORDS what the build did — and
 *  still holds the one thing that is always law: if it refuses, it refuses by NAME (a Clara
 *  CLR* refusal), never with an incidental error. `why` states, in the lane notes, what the
 *  design says and why the recorded behaviour is a lawful reading of it. */
export async function recordOnly(fn, label, why) {
  const err = await caught(fn);
  noteLane(`${label}: ${err ? `refused code=${err.code ?? "(none)"} reason='${reasonToken(err) ?? "(none)"}'` : "was ADMITTED"} — ${why}`);
  if (err) {
    assert.ok(/^CLR/.test(String(err.code ?? "")),
      `${label}: an unpinned axis may refuse or admit, but a refusal must be a NAMED Clara refusal (got ${err.code ?? "(none)"} — ${err.message})`);
  }
  return err;
}

// ---------------------------------------------------------------------------
// PINNED VERB WRAPPERS — NAMED args verbatim from ABI §A.
// ---------------------------------------------------------------------------

export const humanCall = async (sub, fn, specs, vals) =>
  (await humanQuery(sub, namedCall(fn, specs), vals)).rows[0].result;

/** enrol_staff_advance_account(p_client, p_account_code, p_person_label,
 *  p_confirm_dedicated, p_attestation, p_op_key) → admin+ → {enrolment_id, status}. */
export const enrolAdvance = (sub, {
  client, accountCode, personLabel = "Rig Staff Member", confirmDedicated = true,
  attestation = "x42 attestation: dedicated single-person advance account; not a related party.",
  opKey = null,
}) => humanCall(sub, "enrol_staff_advance_account", [
  { name: "p_client" }, { name: "p_account_code" }, { name: "p_person_label" },
  { name: "p_confirm_dedicated", cast: "boolean" }, { name: "p_attestation" }, { name: "p_op_key" },
], [client, accountCode, personLabel, confirmDedicated, attestation, opKey ?? opk("x42enrol")]);

/** retire_staff_advance_account(p_client, p_enrolment, p_reason, p_op_key) → admin+. */
export const retireAdvance = (sub, { client, enrolment, reason = "x42 retire", opKey = null }) =>
  humanCall(sub, "retire_staff_advance_account", [
    { name: "p_client" }, { name: "p_enrolment" }, { name: "p_reason" }, { name: "p_op_key" },
  ], [client, enrolment, reason, opKey ?? opk("x42retire")]);

/** book_staff_advance_application(p_client, p_posting_date, p_memo, p_lines,
 *  p_allocations, p_kind, p_reason, p_op_key) → bookkeeper+, the WCA-R7 envelope. */
export const bookApplication = (sub, {
  client, postingDate, memo = "x42 advance application", lines, allocations,
  kind = "payroll_deduction", reason = "x42 rig application", opKey = null,
}) => humanCall(sub, "book_staff_advance_application", [
  { name: "p_client" }, { name: "p_posting_date", cast: "date" }, { name: "p_memo" },
  { name: "p_lines", cast: "jsonb" }, { name: "p_allocations", cast: "jsonb" },
  { name: "p_kind" }, { name: "p_reason" }, { name: "p_op_key" },
], [client, postingDate, memo, JSON.stringify(lines), JSON.stringify(allocations),
  kind, reason, opKey ?? opk("x42app")]);

/** complete_staff_advance_particulars(p_client, p_advance, p_purpose, p_reference,
 *  p_op_key) → bookkeeper+, set-once. */
export const completeAdvanceParticulars = (sub, {
  client, advance, purpose = "Travel float", reference = "MEMO/2026/001", opKey = null,
}) => humanCall(sub, "complete_staff_advance_particulars", [
  { name: "p_client" }, { name: "p_advance" }, { name: "p_purpose" },
  { name: "p_reference" }, { name: "p_op_key" },
], [client, advance, purpose, reference, opKey ?? opk("x42partic")]);

/** propose_adjustment_template(...) — borrowed ONLY for the cross-domain
 *  reservation cell (§3.1: a template line may not sit on an enrolled advance
 *  code). The adjustment family itself belongs to the sibling x42-adj lane. */
export const proposeTemplate = (sub, {
  client, name = "x42 cross-domain probe", cadence = "monthly", startDate, endDate = null,
  autoReverse = false, lines, memoTemplate = "x42 probe accrual", opKey = null,
}) => humanCall(sub, "propose_adjustment_template", [
  { name: "p_client" }, { name: "p_name" }, { name: "p_cadence" },
  { name: "p_start_date", cast: "date" }, { name: "p_end_date", cast: "date" },
  { name: "p_auto_reverse", cast: "boolean" }, { name: "p_lines", cast: "jsonb" },
  { name: "p_memo_template" }, { name: "p_op_key" },
], [client, name, cadence, startDate, endDate, autoReverse, JSON.stringify(lines),
  memoTemplate, opKey ?? opk("x42tmpl")]);

/** upsert_fa_account_profile(...) — borrowed ONLY for the FA↔advance reservation
 *  cells (0041's live verb; the shared `_acct_role_reserved` union). */
export const upsertFaProfile = (sub, { client, assetAccount, accumAccount = null, expenseAccount = null, opKey = null }) =>
  humanCall(sub, "upsert_fa_account_profile", [
    { name: "p_client" }, { name: "p_asset_account" }, { name: "p_accum_account" },
    { name: "p_depr_expense_account" }, { name: "p_op_key" },
  ], [client, assetAccount, accumAccount, expenseAccount, opKey ?? opk("x42faprof")]);

/** retire_fa_account_profile(p_client, p_asset_account, p_op_key) — borrowed ONLY by
 *  the admission-predicate battery, which has to prove that the remedy the refusal
 *  NAMES ("retire that fixed-asset profile") is one a caller can actually perform. */
export const retireFaProfile = (sub, { client, assetAccount, opKey = null }) =>
  humanCall(sub, "retire_fa_account_profile", [
    { name: "p_client" }, { name: "p_asset_account" }, { name: "p_op_key" },
  ], [client, assetAccount, opKey ?? opk("x42fartr")]);

/** add_bank_account(...) — borrowed ONLY for the bank-belt cell (0038's live verb;
 *  `_fa_assert_code_unreserved` reads the shared union after D-b). */
export const addBankAccount = (sub, { client, bankCode = "MBB", accountNumber, coaAccountCode, opKey = null }) =>
  humanCall(sub, "add_bank_account", [
    { name: "p_client" }, { name: "p_bank_code" }, { name: "p_account_number" },
    { name: "p_coa_account_code" }, { name: "p_op_key" },
  ], [client, bankCode, accountNumber, coaAccountCode, opKey ?? opk("x42bankacct")]);

// --- read RPCs (grant-loop idiom; viewer+) ---
const readOne = async (sub, sql, params) => (await humanQuery(sub, sql, params)).rows[0].r;

export const advanceSummary = (sub, client, asOf) =>
  readOne(sub, "select clara.staff_advance_summary(p_client => $1, p_as_of => $2::date) as r", [client, asOf]);
export const advanceStatement = (sub, client, accountCode, from, to) =>
  readOne(sub, `select clara.staff_advance_statement(p_client => $1, p_account_code => $2,
     p_from => $3::date, p_to => $4::date) as r`, [client, accountCode, from, to]);
export const advanceTie = (sub, client, asOf) =>
  readOne(sub, "select clara.staff_advance_tie(p_client => $1, p_as_of => $2::date) as r", [client, asOf]);

// ---------------------------------------------------------------------------
// PAYLOAD SHAPE DISCOVERY. ABI §A pins the ROW schemas ({account_code, …}) but not
// the envelope key that carries them. These readers find the array by MEANING,
// assert the VALUES exactly, and record the observed spelling as a lane note — so a
// naming divergence surfaces as a FINDING instead of a vacuous assertion.
// ---------------------------------------------------------------------------

/** The first array-of-objects in `payload` whose elements all carry `key`. */
export function rowsBy(payload, key, label) {
  if (Array.isArray(payload)) return payload;
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && key in x)) {
      noteLane(`${label}: rows projected under '${k}' (${v.length} row(s))`);
      return v;
    }
  }
  // An EMPTY payload is legitimate — return an empty array so an "expected zero
  // rows" assertion is honest rather than a crash, but only when the envelope
  // really does carry an empty array (never when it is shaped unexpectedly).
  for (const [, v] of Object.entries(payload ?? {})) if (Array.isArray(v) && v.length === 0) return v;
  assert.fail(`${label}: no row array carrying '${key}' in the envelope (keys: ${Object.keys(payload ?? {}).join(", ")})`);
  return [];
}

/** The first key of `obj` matching `re` whose value is numeric — {key, value} or null. */
export function numKey(obj, re) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (!re.test(k)) continue;
    const n = Number(v);
    if (v !== null && v !== "" && Number.isFinite(n)) return { key: k, value: n };
  }
  return null;
}

/** A numeric field that MUST be present — asserted, never silently absent. */
export function numOf(obj, re, label) {
  const hit = numKey(obj, re);
  assert.ok(hit, `${label}: the row carries a ${re} figure (got keys: ${Object.keys(obj ?? {}).join(", ")})`);
  return hit.value;
}
