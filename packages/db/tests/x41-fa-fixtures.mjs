// Wave D-a (0041) rig — the FA shared helper CORE (NOT a test file: the name does
// not end in `.test.mjs`, so `node --test` ignores it).
//
// CONTRACT-BLIND: written from docs/plan/completed/wave-d-a-fa-design.md v2.1 (+ -part2.md),
// docs/plan/completed/wave-d-contract.md (WD-R1..R15) and the orchestrator's pinned 0041
// interface ONLY — this lane NEVER reads 0041's SQL. Every verb is called by its
// PINNED name with NAMED args; every refusal is asserted by its pinned REASON TOKEN
// (contract §4), never by a bare new SQLSTATE (the new CLR block is claimed by the
// migration lane at assembly). A 42883 / param-name / token divergence at integration
// is a FINDING for orchestrator adjudication, never a silent test edit. (The C-b
// lesson: three production bugs were caught only by contract-authored cells.)
//
// DATE LAW. Every date-sensitive fixture descends from `anchor` — the DATABASE's own
// Asia/Kuala_Lumpur current month, read once per test process through the
// a21-watch-anchors idiom — and is walked with pure integer month arithmetic. Never a
// JS `new Date()` as "today", never a calendar literal. The depreciation due-ness
// evaluator reads the real MYT wall clock, so a hardcoded "2026-08-01" fixture would
// rot the instant real time crossed it (the 2026-08-01 00:10 MYT CI incident).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, namedCall, opk, ROLES,
  noteLane, markSkip, a21EnsureReady, idOf, mytMonthStart,
} from "./a21-helpers.mjs";

export * from "./a21-helpers.mjs";

// ---------------------------------------------------------------------------
// Suite-scoped COA codes. Grammar '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$' (0009 O9).
// Every code is this wave's OWN (grepped against every other battery's codes).
// ---------------------------------------------------------------------------

export const COST = "200-D41"; // enrolled FA cost account          (asset)
export const ACCUM = "210-D41"; // enrolled accumulated depreciation (asset)
export const EXPENSE = "900-D41"; // enrolled depreciation expense     (expense)
export const COST2 = "201-D41"; // a SECOND cost account (second profile / second register)
export const ACCUM2 = "211-D41";
export const EXPENSE2 = "901-D41";
export const LAND = "200-L41"; // the non-depreciable (land) cost account — accum+expense NULL
export const BANK = "100-D41"; // bank (asset, no account_class) — funding / proceeds leg
export const GAIN = "530-D41"; // disposal gain (income)
export const LOSS = "901-Y41"; // disposal loss (expense)
export const OTHER = "600-D41"; // an ordinary expense — never enrolled
export const AR1 = "300-D41"; // receivable control (AF-1 cells)
export const AP1 = "400-D41"; // payable control    (AF-1 cells)
export const SHARE = "910-D41"; // share capital — the K-lane balancing credit

/** Refusal reason tokens — contract §4. These spellings are LAW for both lanes. */
export const T = {
  beltUnregistered: "fa_belt_unregistered_movement",
  kGlBalance: "fa_k_gl_balance_on_enrolled",
  costAdjDeferred: "fa_cost_adjustment_deferred",
  reverseDepreciated: "fa_reverse_while_depreciated",
  reverseDescendants: "fa_reverse_descendants_exist",
  partialSuccessorAdvanced: "fa_partial_reversal_successor_advanced",
  periodDraftOutstanding: "period_draft_outstanding",
  periodEarlierUnmet: "period_earlier_unmet",
  depreciationStale: "depreciation_stale",
  disposalStale: "disposal_stale",
  chargeOverlap: "fa_charge_overlap",
  particularsIncomplete: "fa_particulars_incomplete",
  particularsAlreadyComplete: "fa_particulars_already_complete",
  particularsInvalid: "fa_particulars_invalid",
  reviseEffectiveConflict: "fa_revise_effective_conflict",
  enrolledDeactivation: "fa_enrolled_account_deactivation",
  profileInvalid: "fa_profile_invalid",
  authorityNotLive: "authority_not_live",
  authorityAlreadyLive: "authority_already_live",
  allocationUnborn: "allocation_to_unborn_item",
  lifecycleAdvanced: "fixed_asset_lifecycle_advanced",
  // [ASSEMBLY · adjudication A2] Three ADDITIVE tokens ratified into contract §4 at
  // assembly. Cells that guessed a neighbouring token (or hedged with refusesOneOf) pin
  // these positively instead.
  periodRequestInvalid: "period_request_invalid", // axis not_cadence_aligned | not_ended
  disposalRequestInvalid: "disposal_request_invalid", // the dispose verb's REQUEST-shape axis
  proposalNotRevisable: "fa_proposal_not_revisable", // the revise_entry sixth recut
};

/** The skip reasons a run receipt's `skipped` array may carry (contract §5). */
export const SKIP_REASONS = [
  "none_method", "fully_depreciated", "incomplete", "disposal_draft_outstanding", "not_in_service",
];

// ---------------------------------------------------------------------------
// Readiness — the gate is the clara.schema_migrations row (the a21Has0016
// template), NEVER the migration file on disk.
// ---------------------------------------------------------------------------

let _live = null;
let _anchor = null;

export async function x41Has0041() {
  try {
    const r = await rootQuery("select version from clara.schema_migrations where version ~ '^0041_'");
    return r.rows.length > 0;
  } catch {
    return false; // schema_migrations absent — certainly not at 0041
  }
}

/** Best-effort migrate + the 0011/0016 base, then the 0041 gate. Cached. Also
 *  reads the DB's Asia/Kuala_Lumpur anchor month once per process. */
export async function x41EnsureReady() {
  if (_live !== null) return _live;
  const ready = await a21EnsureReady();
  _live = Boolean(ready.base && ready.has16 && (await x41Has0041()));
  if (!_live) {
    noteLane("0041 absent (or the 0011/0016 surface is not ready) — the Wave-D-a FA battery is dormant");
    return _live;
  }
  const s = await mytMonthStart(0);
  const [y, m] = s.split("-").map(Number);
  _anchor = { y, m };
  noteLane(`x41 DB-clock anchor: current MYT month ${y}-${String(m).padStart(2, "0")}`);
  return _live;
}

/** Loud + COUNTED (the house skip16 / x37 skipHere discipline): a dormant suite
 *  must show up in printSkipCount, never quietly green. */
export function skip41(t, live, label = "the Wave-D-a FA battery") {
  if (!live) {
    markSkip();
    t.skip(`0041 not applied (clara.schema_migrations has no '0041_%' row) — ${label} is dormant`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// DATE ARITHMETIC over the DB anchor. `Date.UTC` appears only inside daysIn() as
// pure calendar arithmetic (the a21-watch-anchors idiom), never as "today".
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, "0");
export const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const dstr = (y, m, d) => `${y}-${pad2(m)}-${pad2(Math.min(d, daysIn(y, m)))}`;

export function anchorYM() {
  assert.ok(_anchor, "x41EnsureReady() must run before any date fixture (the DB clock anchor)");
  return _anchor;
}

/** {y,m} shifted n months off the DB anchor (n negative = into the past). */
export function shift(n) {
  const a = anchorYM();
  const total = a.y * 12 + (a.m - 1) + n;
  const y = Math.floor(total / 12);
  return { y, m: total - y * 12 + 1 };
}

/** The month n months off the anchor as {y,m,start,end,key}. n=0 is the month in
 *  progress (NEVER due — a monthly period is due only once the month has ended). */
export function mon(n) {
  const { y, m } = shift(n);
  return { y, m, start: dstr(y, m, 1), end: dstr(y, m, daysIn(y, m)), key: `${y}-${pad2(m)}` };
}

/** 'YYYY-MM-DD' for `day` of a mon() month (clamped to the month's length). */
export const dayIn = (m, day) => dstr(m.y, m.m, day);

/** Whole months from month A to month B, inclusive of both ends. */
export const monthSpan = (a, b) => (b.y * 12 + b.m) - (a.y * 12 + a.m) + 1;

/** The LAST FY that has ENDED for a client whose FYE is (month, day), expressed
 *  as {open, close, openY, closeY}. Derived from the DB anchor, never a literal. */
export function lastEndedFy(fyMonth = 12, fyDay = 31) {
  const a = anchorYM();
  // The FY closing (a.y, fyMonth, fyDay) has ended once the anchor month is past it.
  const closeY = a.m > fyMonth ? a.y : a.y - 1;
  const close = dstr(closeY, fyMonth, fyDay);
  // day AFTER the PREVIOUS year's own end (S5.26, round-8 M4 F1) -- byte-identical to the
  // old month-truncated formula whenever fyDay is a true month-end (31, or Feb-29 in a leap
  // year), and now CORRECT for any other lawful fyDay too.
  const prevCloseStr = dstr(closeY - 1, fyMonth, fyDay);
  const [py, pm, pd] = prevCloseStr.split('-').map(Number);
  const openDt = new Date(Date.UTC(py, pm - 1, pd + 1));
  const open = dstr(openDt.getUTCFullYear(), openDt.getUTCMonth() + 1, openDt.getUTCDate());
  const openY = openDt.getUTCFullYear(); const openM = openDt.getUTCMonth() + 1;
  return { open, close, openY, openM, closeY, closeM: fyMonth };
}

// ---------------------------------------------------------------------------
// REFUSAL ASSERTIONS — by NAMED REASON TOKEN. The 0041 SQLSTATE block is claimed
// by the migration lane at assembly, so a bare code assertion here would pin the
// wrong thing; the contract pins the TOKEN. The token is read from the exception
// DETAIL json ({"reason": "..."}), and failing that matched against the message —
// a migration that names the rule in prose but drops the DETAIL discriminant is a
// LANE NOTE (a finding), not a false red.
// ---------------------------------------------------------------------------

export function reasonToken(err) {
  const d = String(err?.detail ?? "");
  const m = /"reason"\s*:\s*"([a-z0-9_]+)"/.exec(d);
  return m ? m[1] : null;
}

export async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

/** fn() MUST refuse, and the refusal MUST name `token`. */
export async function refuses(fn, token, label) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected the NAMED refusal '${token}' but the call SUCCEEDED`);
  const got = reasonToken(err);
  if (got === token) return err;
  const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
  assert.ok(
    blob.includes(token),
    `${label}: expected the named refusal '${token}'; got reason='${got ?? "(none)"}' code=${err.code ?? "(none)"} — ${err.message}`,
  );
  noteLane(`${label}: '${token}' matched in the message text, not the DETAIL {"reason":…} discriminant — finding (contract §4 pins DETAIL)`);
  return err;
}

/** fn() MUST refuse with ONE of `tokens` — used only where the design states the
 *  precondition but the contract assigns no single token to it. The observed token
 *  is recorded so a divergence is VISIBLE rather than silently tolerated. */
export async function refusesOneOf(fn, tokens, label) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected a NAMED refusal (one of ${tokens.join(" / ")}) but the call SUCCEEDED`);
  const got = reasonToken(err);
  const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
  const hit = tokens.find((tok) => got === tok || blob.includes(tok));
  assert.ok(
    hit,
    `${label}: expected one of ${tokens.join(" / ")}; got reason='${got ?? "(none)"}' code=${err.code ?? "(none)"} — ${err.message}`,
  );
  noteLane(`${label}: refused by '${hit}'`);
  return err;
}

// ---------------------------------------------------------------------------
// PINNED VERB WRAPPERS — NAMED args verbatim from the 0041 interface contract §2.
// A param-name divergence at integration is a FINDING, never a rig bug.
// ---------------------------------------------------------------------------

export const humanCall = async (sub, fn, specs, vals) =>
  (await humanQuery(sub, namedCall(fn, specs), vals)).rows[0].result;

export const upsertFaProfile = (sub, { client, assetAccount, accumAccount = null, expenseAccount = null, opKey = null }) =>
  humanCall(sub, "upsert_fa_account_profile", [
    { name: "p_client" }, { name: "p_asset_account" }, { name: "p_accum_account" },
    { name: "p_depr_expense_account" }, { name: "p_op_key" },
  ], [client, assetAccount, accumAccount, expenseAccount, opKey ?? opk("x41enrol")]);

export const retireFaProfile = (sub, { client, assetAccount, opKey = null }) =>
  humanCall(sub, "retire_fa_account_profile", [
    { name: "p_client" }, { name: "p_asset_account" }, { name: "p_op_key" },
  ], [client, assetAccount, opKey ?? opk("x41retprof")]);

export const completeParticulars = (sub, { client, asset, particulars, opKey = null }) =>
  humanCall(sub, "complete_fixed_asset_particulars", [
    { name: "p_client" }, { name: "p_asset" }, { name: "p_particulars", cast: "jsonb" }, { name: "p_op_key" },
  ], [client, asset, JSON.stringify(particulars), opKey ?? opk("x41complete")]);

export const reviseParticulars = (sub, { client, asset, particulars, effectiveFrom, opKey = null }) =>
  humanCall(sub, "revise_fixed_asset_particulars", [
    { name: "p_client" }, { name: "p_asset" }, { name: "p_particulars", cast: "jsonb" },
    { name: "p_effective_from", cast: "date" }, { name: "p_op_key" },
  ], [client, asset, JSON.stringify(particulars), effectiveFrom, opKey ?? opk("x41revise")]);

export const proposeAuthority = (sub, { client, cadence = "monthly", opKey = null }) =>
  humanCall(sub, "propose_depreciation_authority", [
    { name: "p_client" }, { name: "p_cadence" }, { name: "p_op_key" },
  ], [client, cadence, opKey ?? opk("x41prop")]);

export const signAuthority = (sub, { client, authority, opKey = null }) =>
  humanCall(sub, "sign_depreciation_authority", [
    { name: "p_client" }, { name: "p_authority" }, { name: "p_op_key" },
  ], [client, authority, opKey ?? opk("x41sign")]);

export const retireAuthorityVerb = (sub, { client, authority, reason = "x41 retire", opKey = null }) =>
  humanCall(sub, "retire_depreciation_authority", [
    { name: "p_client" }, { name: "p_authority" }, { name: "p_reason" }, { name: "p_op_key" },
  ], [client, authority, reason, opKey ?? opk("x41retauth")]);

/** The MACHINE path — the leader runs it under `set role clara_runtime` (design §3.4). */
export async function runPeriod({ client, periodStart, periodEnd, opKey = null }) {
  const r = await roleQuery(ROLES.runtime, namedCall("run_depreciation_period", [
    { name: "p_client" }, { name: "p_period_start", cast: "date" },
    { name: "p_period_end", cast: "date" }, { name: "p_op_key" },
  ]), [client, periodStart, periodEnd, opKey ?? opk("x41run")]);
  return r.rows[0].result;
}

export const runManual = (sub, { client, periodStart, periodEnd, opKey = null }) =>
  humanCall(sub, "run_depreciation_manual", [
    { name: "p_client" }, { name: "p_period_start", cast: "date" },
    { name: "p_period_end", cast: "date" }, { name: "p_op_key" },
  ], [client, periodStart, periodEnd, opKey ?? opk("x41manual")]);

export function disposeAsset(sub, {
  client, asset, disposalDate, proceedsCents = 0, proceedsAccount = null,
  gainAccount = GAIN, lossAccount = LOSS, memo = "x41 disposal",
  costPortionCents = null, opKey = null,
}) {
  const specs = [
    { name: "p_client" }, { name: "p_asset" }, { name: "p_disposal_date", cast: "date" },
    { name: "p_proceeds_cents", cast: "bigint" }, { name: "p_proceeds_account" },
    { name: "p_gain_account" }, { name: "p_loss_account" }, { name: "p_memo" }, { name: "p_op_key" },
  ];
  const vals = [client, asset, disposalDate, proceedsCents, proceedsAccount,
    gainAccount, lossAccount, memo, opKey ?? opk("x41disp")];
  if (costPortionCents !== null) {
    specs.push({ name: "p_cost_portion_cents", cast: "bigint" });
    vals.push(costPortionCents);
  }
  return humanCall(sub, "dispose_fixed_asset", specs, vals);
}

export const setClientFyEnd = (sub, { client, month, day, opKey = null }) =>
  humanCall(sub, "set_client_fy_end", [
    { name: "p_client" }, { name: "p_month", cast: "int" }, { name: "p_day", cast: "int" }, { name: "p_op_key" },
  ], [client, month, day, opKey ?? opk("x41fy")]);

/** The sweep's due probe — granted to clara_runtime AND clara_authenticated. */
export async function runDue(client, { asRole = ROLES.runtime } = {}) {
  const r = await roleQuery(asRole, "select clara.depreciation_run_due(p_client => $1) as r", [client]);
  return r.rows[0].r;
}
export async function runDueAsHuman(sub, client) {
  const r = await humanQuery(sub, "select clara.depreciation_run_due(p_client => $1) as r", [client]);
  return r.rows[0].r;
}

// --- read RPCs (grant-loop idiom; each returns ONE jsonb object, never an array) ---
const readOne = async (sub, sql, params) => (await humanQuery(sub, sql, params)).rows[0].r;
export const listFixedAssets = (sub, client) => readOne(sub, "select clara.list_fixed_assets(p_client => $1) as r", [client]);
export const getFixedAsset = (sub, asset) => readOne(sub, "select clara.get_fixed_asset(p_asset => $1) as r", [asset]);
export const listDepreciationRuns = (sub, client) => readOne(sub, "select clara.list_depreciation_runs(p_client => $1) as r", [client]);
export const getDepreciationRun = (sub, run) => readOne(sub, "select clara.get_depreciation_run(p_run => $1) as r", [run]);
export const getAuthority = (sub, client) => readOne(sub, "select clara.get_depreciation_authority(p_client => $1) as r", [client]);
export const faRegisterTie = (sub, client, asOf) =>
  readOne(sub, "select clara.fa_register_tie(p_client => $1, p_as_of => $2::date) as r", [client, asOf]);

export const receiptEntry = (receipt) => idOf(receipt, "entry_id", "id");
export const uniqTag = () => randomUUID().slice(0, 6);
