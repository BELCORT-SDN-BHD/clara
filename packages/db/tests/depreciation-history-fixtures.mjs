// #651 [0227, depreciation history] — the battery's frontier gate, its own client factory and the
// verb wrappers for everything 0227 adds. NOT a test file: the name does not end in `.test.mjs`,
// so `node --test` ignores it.
//
// WHY ITS OWN CLIENT FACTORY RATHER THAN `freshFaClient`. `x41-round35-tie.test.mjs`'s `x41.s4`
// sweeps EVERY client whose name matches `X41_FAMILY_NAME_RE` and asserts that every
// register-vs-GL difference is zero or explained by the tie's own pre-enrolment column. This
// battery deliberately builds clients with CLOSED fiscal years, blocked drafts and withdrawn
// entries; naming them `x41_…` would enrol them in a sweep whose allow-list is pinned at exactly
// one entry. Every client here is `p651_…` and is invisible to that sweep (#884 reserves its own
// ground for the same reason; this file's prefix is `p651.` throughout).
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA — `humanQuery` at its least-privileged floor,
// or `roleQuery(ROLES.runtime)` for the machine lane. `rootQuery` appears only as a READBACK, or
// as LABELLED fixture DML where no audited verb can reach the shape (the fiscal-year lifecycle
// and the instruction reference), and each such site says so.

import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, roleQuery, namedCall, opk, ROLES, markSkip, idOf,
  faWorld, buildFaChart, createClient, grantConsent, upsertFaProfile,
  entryRowOf, uniqTag,
  COST, ACCUM, EXPENSE,
} from "./x41-fa-world.mjs";
import { mintChatTaskRef, signAuthorityCompat } from "./fa-authority-sign-compat.mjs";

export * from "./x41-fa-world.mjs";
export { mintChatTaskRef, signAuthorityCompat };

// ===========================================================================================
// 1 · The frontier gate — on 0227's STABLE STEM, never its number (§2.2 rule 2: numbers are
//     claimed at MERGE, stems are not).
// ===========================================================================================

/** `0227_depreciation_history.sql` → `depreciation_history$`. */
export const DEPRECIATION_HISTORY_STEM = "depreciation_history$";

let _ready = null;
export async function depreciationHistoryReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [DEPRECIATION_HISTORY_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** The per-cell frontier gate, COUNTED. A FOCUSED invocation (no `--import` of
 *  `depreciation-history-preintegration-gate.mjs`) FAILS LOUDLY below 0227 — a skip is not
 *  evidence, and final acceptance is exactly that focused shape counting ZERO skips. */
export async function gate651(t) {
  if (await depreciationHistoryReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_DEPRECIATION_HISTORY !== "1") {
    assert.fail(
      `#651 migration (${DEPRECIATION_HISTORY_STEM}) is NOT applied to this database, and this is a `
      + "FOCUSED run. A skip is not evidence: apply the migration, or preload "
      + "tests/depreciation-history-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#651 depreciation-history lane absent (no ${DEPRECIATION_HISTORY_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The client factory and the fiscal-year fixture.
// ===========================================================================================

/** A fresh firm-A client on the x41 chart with the COST profile enrolled, named OUTSIDE the x41
 *  family (see this file's header). */
export async function p651Client(label, { enrol = true } = {}) {
  const w = await faWorld();
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `p651_${label}_${uniqTag()}`, opKey: opk("p651cli") });
  await buildFaChart(sub, client);
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  if (enrol) {
    await upsertFaProfile(sub, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });
  }
  return client;
}

/** LABELLED FIXTURE DML. Mint a fiscal year spanning `startsOn`..`endsOn` and walk it to
 *  `status` through the estate's OWN lifecycle edges (`open -> closing -> closed`), which is the
 *  only ladder `clara._tf_fiscal_years_lifecycle` admits. Copied from the established house
 *  helper `accounting-plans-fixtures.mjs:388` (`closeYearAround`), used there and in
 *  `accrual-adjustments.test.mjs:517`. The row is append-only, so a cell that uses this OWNS a
 *  dedicated client.
 *
 *  `finalize_close` is deliberately NOT driven: the thing under test is what the FA lane does
 *  when `clara.fiscal_years.status` says `closed`, and that column is exactly what 0056's CLR19
 *  trigger and 0227's `_fa_assert_period_open` both read. Driving the whole close ceremony
 *  (begin_close, the drawer gates, the segregation floor, the retained-earnings roll) would add
 *  a hundred lines of fixture that prove nothing this battery claims. */
export async function fiscalYear(firm, client, { startsOn, endsOn, label = null, status = "closed", ordinal = 1, owner }) {
  const fy = await rootQuery(
    `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,status,fy_end_source,opened_by)
       values ($1,$2,$3,$4::date,$5::date,$6,'open','asserted',$7) returning id`,
    [firm, client, label ?? String(startsOn).slice(0, 4), startsOn, endsOn, ordinal, owner]);
  const id = fy.rows[0].id;
  if (status === "closing") {
    await rootQuery("update clara.fiscal_years set status='closing' where id=$1", [id]);
  } else if (status === "closed") {
    for (const s of ["closing", "closed"]) {
      await rootQuery("update clara.fiscal_years set status=$2 where id=$1", [id, s]);
    }
  }
  return id;
}

export const fyRow = async (id) =>
  (await rootQuery("select to_jsonb(f) as row from clara.fiscal_years f where f.id=$1", [id])).rows[0]?.row ?? null;

// ===========================================================================================
// 3 · The verbs 0227 adds or recuts, by their PINNED names with NAMED arguments.
// ===========================================================================================

const humanCall = async (sub, fn, specs, vals) =>
  (await humanQuery(sub, namedCall(fn, specs), vals)).rows[0].result;

/** clara.revise_fixed_asset_particulars — 5-arg, UNMOVED (§2.1, verbatim). 0227 makes the
 *  classification travel INSIDE `p_particulars` as `change_class` / `change_reason` (measurement
 *  M1: widening `clara._fa_validate_particulars`' closed key set breaks nothing). */
export const reviseClassified = (sub, {
  client, asset, particulars, effectiveFrom, changeClass = "estimate",
  changeReason = "p651 revised estimate", opKey = null,
}) => {
  const p = { ...particulars };
  if (changeClass !== undefined && changeClass !== null) p.change_class = changeClass;
  if (changeReason !== undefined && changeReason !== null) p.change_reason = changeReason;
  return humanCall(sub, "revise_fixed_asset_particulars", [
    { name: "p_client" }, { name: "p_asset" }, { name: "p_particulars", cast: "jsonb" },
    { name: "p_effective_from", cast: "date" }, { name: "p_op_key" },
  ], [client, asset, JSON.stringify(p), effectiveFrom, opKey ?? opk("p651revise")]);
};

/** clara.complete_fixed_asset_particulars — 0041's human door, unmoved except for 0227's
 *  "a first completion is not a change" wall. */
export const completeWith = (sub, { client, asset, particulars, opKey = null }) =>
  humanCall(sub, "complete_fixed_asset_particulars", [
    { name: "p_client" }, { name: "p_asset" }, { name: "p_particulars", cast: "jsonb" }, { name: "p_op_key" },
  ], [client, asset, JSON.stringify(particulars), opKey ?? opk("p651complete")]);

/** clara.complete_fixed_asset_particulars_for — 0216's runtime twin (clara_runtime only). */
export async function completeForWith({ client, asset, particulars, obo, opKey = null }) {
  const r = await roleQuery(ROLES.runtime, namedCall("complete_fixed_asset_particulars_for", [
    { name: "p_client" }, { name: "p_asset" }, { name: "p_particulars", cast: "jsonb" },
    { name: "p_op_key" }, { name: "p_obo" },
  ]), [client, asset, JSON.stringify(particulars), opKey ?? opk("p651completefor"), obo]);
  return r.rows[0].result;
}

/** clara.preview_depreciation_run(p_client) — VIEWER+, clara_authenticated only. Writes nothing. */
export const previewRun = (sub, client) =>
  humanCall(sub, "preview_depreciation_run", [{ name: "p_client" }], [client]);

/** clara.run_depreciation_period_for(p_client, p_through, p_op_key, p_obo) — clara_runtime ONLY.
 *  The OBO machine door: it clears every DUE period from the authority floor forward, up to
 *  `p_through`, under the named human's LIVE authority. */
export async function runPeriodFor({ client, through = null, opKey = null, obo, asRole = ROLES.runtime }) {
  const r = await roleQuery(asRole, namedCall("run_depreciation_period_for", [
    { name: "p_client" }, { name: "p_through", cast: "date" }, { name: "p_op_key" }, { name: "p_obo" },
  ]), [client, through, opKey ?? opk("p651runfor"), obo]);
  return r.rows[0].result;
}

/** clara.sign_depreciation_authority — 0227's FOUR-argument door, called directly (the compat
 *  helper is for the lanes that must straddle both frontiers; this battery is gated at 0227 and
 *  drives the real signature so a ref refusal is asserted, not routed around). */
export const signWithRef = (sub, { client, authority, ref, opKey = null }) =>
  humanCall(sub, "sign_depreciation_authority", [
    { name: "p_client" }, { name: "p_authority" }, { name: "p_op_key" },
    { name: "p_authority_ref", cast: "jsonb" },
  ], [client, authority, opKey ?? opk("p651sign"), ref === null ? null : JSON.stringify(ref)]);

/** Propose (bookkeeper+) then sign (admin+) with a RESOLVING chat-task reference. */
export async function liveAuthorityWithRef(client, { cadence = "monthly", ref = null } = {}) {
  const w = await faWorld();
  const proposed = await humanCall(w.users.bob, "propose_depreciation_authority", [
    { name: "p_client" }, { name: "p_cadence" }, { name: "p_op_key" },
  ], [client, cadence, opk("p651prop")]);
  const id = idOf(proposed, "authority_id", "id");
  assert.ok(id, `propose_depreciation_authority names the authority (got ${JSON.stringify(proposed)})`);
  const r = ref ?? (await mintChatTaskRef(client));
  const signed = await signWithRef(w.users.hana, { client, authority: id, ref: r });
  return { id, ref: r, signed, signedBy: w.users.hana, cadence };
}

/** clara.withdraw_draft(p_entry, p_reason, p_expected_revision, p_op_key) — bookkeeper+. The
 *  ONE recovery act a blocked depreciation queue has, and no cell in the estate exercised it on
 *  a depreciation draft before this battery. */
export async function withdrawDraftAs(sub, { entry, reason = "p651 recovery", opKey = null }) {
  const e = await entryRowOf(entry);
  return humanCall(sub, "withdraw_draft", [
    { name: "p_entry" }, { name: "p_reason" }, { name: "p_expected_revision" }, { name: "p_op_key" },
  ], [entry, reason, e.revision_token, opKey ?? opk("p651withdraw")]);
}

// ===========================================================================================
// 4 · Catalog readbacks the census cells consult (root; readbacks, never the thing proved).
// ===========================================================================================

/** Every clara function whose source calls `name(` — the `prosrc` census idiom the two
 *  `_wdb_rerun_breach` censuses and 0042 S5.15e itself use. */
export async function callersOf(fragment) {
  const r = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname <> $2
        and (p.prosrc || coalesce(pg_get_functiondef(p.oid), '')) like '%' || $1 || '%'
      order by 1`,
    [fragment, fragment.replace(/\(.*$/, "")]);
  return [...new Set(r.rows.map((x) => x.proname))];
}

export async function functionDef(sig) {
  const r = await rootQuery("select pg_get_functiondef($1::regprocedure) as d", [sig]);
  return r.rows[0]?.d ?? null;
}

export async function prosrcSha(sig) {
  const r = await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure",
    [sig]);
  return r.rows[0]?.sha ?? null;
}

export async function regprocedureExists(sig) {
  const r = await rootQuery("select to_regprocedure($1) is not null as ok", [sig]);
  return Boolean(r.rows[0].ok);
}

/** The ACL letters a role holds on a function — the grant censuses' own instrument. */
export async function roleHasExecute(role, sig) {
  const r = await rootQuery("select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok", [role, sig]);
  return Boolean(r.rows[0].ok);
}

export const draftDepreciationEntries = async (client) =>
  (await rootQuery(
    `select id, status, posting_date::text as posting_date, revision_token
       from clara.journal_entries
      where client_id = $1 and status = 'draft' and flags ? 'depreciation_charges'
      order by posting_date`, [client])).rows;

export const depreciationEntries = async (client) =>
  (await rootQuery(
    `select id, status, posting_date::text as posting_date
       from clara.journal_entries
      where client_id = $1 and flags ? 'depreciation_charges'
      order by posting_date, created_at`, [client])).rows;

export { assert };
