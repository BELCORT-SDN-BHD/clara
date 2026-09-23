// #975 [0279, the closed-year arrears question] — the battery's frontier gate, its client
// factory, its armed-asset helper and the wrappers for the one new door. NOT a test file: the
// name does not end in `.test.mjs`, so `node --test` ignores it.
//
// Mirrors fa-depreciation-policy-fixtures.mjs (this lane's own prior ticket, #932) and
// depreciation-history-fixtures.mjs (the #651 slice this ticket continues).
//
// WHY ITS OWN CLIENT FACTORY. `x41-round35-tie.test.mjs`'s `x41.s4` sweeps every client whose
// name matches the x41 family and asserts every register-vs-GL difference is zero or explained.
// This battery deliberately builds clients with CLOSED fiscal years and deliberately UNPOSTED
// runs; naming them `x41_…` would enrol them in a sweep whose allow-list is pinned at exactly
// one entry. Every client here is `p975_…` and is invisible to that sweep.

import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, roleQuery, humanCall, namedCall, opk, ROLES, markSkip,
  faWorld, buildFaChart, createClient, grantConsent, upsertFaProfile, uniqTag,
  buyAsset, completeSL, mon, dayIn,
  COST, ACCUM, EXPENSE,
} from "./x41-fa-world.mjs";
import { liveAuthorityWithRef, backdateAuthorityFloor } from "./depreciation-history-fixtures.mjs";

export * from "./x41-fa-world.mjs";
export { liveAuthorityWithRef, backdateAuthorityFloor };

// ===========================================================================================
// 1 · The frontier gate — on 0279's STABLE STEM, never its number (a number is claimed at
//     MERGE, a stem is not).
// ===========================================================================================

/** `0279_fa_closed_year_arrears.sql` → `fa_closed_year_arrears$`. */
export const FA_CLOSED_YEAR_ARREARS_STEM = "fa_closed_year_arrears$";

let _ready = null;
export async function fa975Ready() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [FA_CLOSED_YEAR_ARREARS_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

const MISSING = `#975 migration (${FA_CLOSED_YEAR_ARREARS_STEM}) is NOT applied to this database`;

/** The per-CELL frontier gate, COUNTED. A FOCUSED invocation (no `--import` of
 *  fa-arrears-resolution-preintegration-gate.mjs) FAILS LOUDLY below 0279 — a skip is not
 *  evidence, and final acceptance is exactly that focused shape counting ZERO skips. */
export async function gate975(t) {
  if (await fa975Ready()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_CLOSED_YEAR_ARREARS !== "1") {
    assert.fail(
      `${MISSING}, and this is a FOCUSED run. A skip is not evidence: apply the migration, or `
      + "preload tests/fa-arrears-resolution-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#975 closed-year arrears question absent (no ${FA_CLOSED_YEAR_ARREARS_STEM} migration applied)`);
  return true;
}

/** `0281_fa_arrears_judgement_scope.sql` → `fa_arrears_judgement_scope$`. #975's fix round
 *  (spec review SPEC-975-1, adversarial ADV-L04-2/3/4): the refusal states the NAMED year's own
 *  amount, a judgement licenses only the figure it was made about, and reopen_prior is refused on
 *  a year that is only closing. Its own stem, because a chain can carry 0279 without it. */
export const FA_ARREARS_JUDGEMENT_SCOPE_STEM = "fa_arrears_judgement_scope$";

let _ready0281 = null;
async function fa975bReady() {
  if (_ready0281 === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [FA_ARREARS_JUDGEMENT_SCOPE_STEM]);
      _ready0281 = r.rows[0].n > 0;
    } catch {
      _ready0281 = false;
    }
  }
  return _ready0281;
}

/** The per-CELL frontier gate for the fix round, COUNTED — `gate975`'s exact shape on 0281's own
 *  stem. A FOCUSED invocation FAILS LOUDLY below 0281: a skip is not evidence. */
export async function gate975b(t) {
  if (await gate975(t)) return true;
  if (await fa975bReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_ARREARS_JUDGEMENT_SCOPE !== "1") {
    assert.fail(
      `#975 fix-round migration (${FA_ARREARS_JUDGEMENT_SCOPE_STEM}) is NOT applied to this `
      + "database, and this is a FOCUSED run. A skip is not evidence: apply the migration, or "
      + "preload tests/fa-arrears-judgement-scope-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#975 arrears judgement scope absent (no ${FA_ARREARS_JUDGEMENT_SCOPE_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The client factory, the fiscal-year fixture and the armed asset.
// ===========================================================================================

/** A fresh firm-A client on the x41 chart with the COST profile enrolled, named OUTSIDE the
 *  x41 family (see this file's header). */
export async function p975Client(label) {
  const w = await faWorld();
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `p975_${label}_${uniqTag()}`, opKey: opk("p975cli") });
  await buildFaChart(sub, client);
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  await upsertFaProfile(sub, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });
  return client;
}

/** LABELLED FIXTURE DML — the same helper `depreciation-history-fixtures.mjs:99` uses, and for
 *  the same reason: a fiscal year's lifecycle is walked through the edges
 *  `clara._tf_fiscal_years_lifecycle` admits (`open -> closing -> closed -> reopened`), because
 *  the thing under test is what the FA lane does when `clara.fiscal_years.status` SAYS closed,
 *  and that column is exactly what `clara._fa_assert_period_open` and 0056's own CLR19 trigger
 *  read. Driving the whole close ceremony would add a hundred lines of fixture that prove
 *  nothing this battery claims. */
export async function fiscalYear(firm, client, { startsOn, endsOn, label = null, status = "closed", ordinal = 1, priorFy = null, owner }) {
  // `clara._tf_fiscal_years_contiguity` (0056:269) makes a gap or an overlap impossible: any
  // ordinal past the first must NAME its predecessor and start the day after it ends. A battery
  // that builds a second closed year therefore passes `priorFy`.
  const fy = await rootQuery(
    `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,prior_fy_id,status,fy_end_source,opened_by)
       values ($1,$2,$3,$4::date,$5::date,$6,$7,'open','asserted',$8) returning id`,
    [firm, client, label ?? String(startsOn).slice(0, 4), startsOn, endsOn, ordinal, priorFy, owner]);
  const id = fy.rows[0].id;
  const ladder = { closing: ["closing"], closed: ["closing", "closed"], reopened: ["closing", "closed", "reopened"] };
  for (const s of ladder[status] ?? []) {
    await rootQuery("update clara.fiscal_years set status=$2 where id=$1", [id, s]);
  }
  return id;
}

/** LABELLED FIXTURE DML. Walk an already-closed year to `reopened` through the ONE lifecycle
 *  edge the trigger admits for it (`closed -> reopened`), which is what
 *  `clara.reopen_fiscal_year` itself does to the row. This ticket changes nothing in that door
 *  and drives its EFFECT on the status column rather than its whole ceremony. */
export const reopenYear = (fy) =>
  rootQuery("update clara.fiscal_years set status='reopened' where id=$1", [fy]);

export const fyRow = async (fy) =>
  (await rootQuery("select to_jsonb(f) as row from clara.fiscal_years f where f.id=$1", [fy])).rows[0]?.row ?? null;

/** A client with ONE chargeable straight-line asset in service from month `from`, particulars
 *  complete and a live authority whose window floor is backdated so the floor never skips a
 *  month this battery is about. Copied from depreciation-history.test.mjs's own `armed`. */
export async function armed975(label, { cents = 360_000, life = 36, from = -3, floorFrom = -18 } = {}) {
  const w = await faWorld();
  const client = await p975Client(label);
  const start = mon(from);
  const { asset } = await buyAsset({ client, cents, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life, start: start.start, description: `p975 ${label}` });
  const au = await liveAuthorityWithRef(client);
  if (floorFrom !== null) await backdateAuthorityFloor(au.id, mon(floorFrom).start);
  return { w, client, asset, start, au };
}

// ===========================================================================================
// 3 · The one new door, by its PINNED name with NAMED arguments.
// ===========================================================================================

/** `clara.record_fa_arrears_resolution` — the accountant's own answer to the materiality
 *  question, bookkeeper+ through `clara._human_ctx`. */
export const recordResolution = (sub, {
  client, fiscalYear: fy, choice, arrearsCents, periodStart = null, periodEnd = null,
  reason = "p975 judged", opKey = null,
}) =>
  humanCall(sub, "record_fa_arrears_resolution", [
    { name: "p_client" }, { name: "p_fiscal_year" }, { name: "p_choice" },
    { name: "p_arrears_cents", cast: "bigint" }, { name: "p_period_start", cast: "date" },
    { name: "p_period_end", cast: "date" }, { name: "p_reason" }, { name: "p_op_key" },
  ], [client, fy, choice, arrearsCents, periodStart, periodEnd, reason, opKey ?? opk("p975res")]);

/** READBACK of the durable record, root-side: the cells assert what was STORED, not only what
 *  the door returned. */
export const resolutionRows = async (client) =>
  (await rootQuery(
    `select r.id, r.firm_id, r.client_id, r.fiscal_year_id, r.arrears_cents, r.choice,
            r.period_start::text as period_start, r.period_end::text as period_end,
            r.reason, r.active, r.decided_by, r.decided_at, r.superseded_by, r.superseded_at,
            u.email as decided_by_email
       from clara.fa_arrears_resolutions r
       left join clara.users u on u.id = r.decided_by
      where r.client_id = $1 order by r.decided_at, r.id`, [client])).rows;

/** The closed-year arrears the run would fold forward, measured through the same helper the
 *  doors consult. Root-side: it is an UNGRANTED internal, so no persona can reach it. */
export const closedArrears = async (client, through) =>
  (await rootQuery(
    "select clara._fa_closed_arrears(p_client => $1, p_through => $2::date) as r",
    [client, through])).rows[0].r;

export { assert, rootQuery, humanQuery, roleQuery, ROLES, namedCall, opk, mon, dayIn };
