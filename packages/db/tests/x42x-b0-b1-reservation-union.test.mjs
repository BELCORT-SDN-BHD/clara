// WAVE D-b SPLIT — CROSS-SLICE CONTRACT (i): D-b0 → D-b1, THE RESERVATION UNION.
//
// census §2 Class B is the split's ONLY "second splice of the same authority in a later
// slice": `clara._acct_role_reserved` / `_acct_role_reserved_at` are authored as a UNION of an
// FA arm (fa_account_profiles / fixed_assets, D-b0's) and an ADVANCE arm (staff_advance_accounts
// / staff_advances / _adv_enrolment_at, D-b1's). D-b0 ships an FA-ONLY shell; D-b1 RE-CREATES
// both with the advance arms added. Errata E9 named the hazard that makes this dangerous:
// `create or replace` on an ABSENT body CREATES it silently, so a mis-ordered or missing
// re-create is invisible unless something MEASURES the completion.
//
// THIS FILE IS THAT MEASUREMENT, and it is FRONTIER-AWARE on purpose: one file, two arms,
// each asserting what is TRUE at the frontier it finds. It belongs in EVERY slice's CI list —
// on D-b0's rig it proves the shell is genuinely FA-only, on D-b1's and later it proves the
// completion happened AND that the FA answers did not move. Run on both, it is the contract.
//
// THE INVARIANT, in one sentence: the union GAINS arms and never CHANGES an FA answer. Both
// arms assert the SAME pinned FA expectations, so the pair of runs is the proof.
//
// Rig-gated (skips without a migrated DB); pollution-proof (stages its own world).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, namedCall, opk, endPool, printLaneNotes, printSkipCount, noteLane,
  createClient, upsertAccountClassed, grantConsent,
  x41EnsureReady, upsertFaProfile, wb, uniqTag,
} from "./x41-fa-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await wb.buildWaveBWorld();
});
after(async () => {
  printLaneNotes("x42x-b0-b1-reservation-union");
  printSkipCount("x42x-b0-b1-reservation-union");
  await endPool();
});

const skipHere = (t) => {
  if (!live) { t.skip("no migrated rig (0041 absent) — the split contract battery is dormant"); return true; }
  return false;
};

/** The COMMENT-STRIPPED definition. MANDATORY here: every slice carries `[SPLIT D-bN]` notes
 *  that NAME the objects it deliberately does not ship, and pg_get_functiondef returns them
 *  verbatim, so raw text is the wrong instrument (E19). */
const stripSqlComments = (src) => (src ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const strippedDef = async (name) => stripSqlComments((await rootQuery(
  "select pg_get_functiondef(p.oid) as def from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1",
  [name])).rows[0]?.def ?? null);

const tableExists = async (name) => (await rootQuery(
  "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'", [name])).rowCount > 0;

/** THE FRONTIER, read off schema_migrations — never off a file on disk. */
const applied = async (re) => Number((await rootQuery(
  "select count(*)::int as n from clara.schema_migrations where version ~ $1", [re])).rows[0].n);

/** ------------------------------------------------------------------------------------------
 *  FRONTIER PREDICATES BY STABLE NAME, NEVER BY NUMBER  [light re-confirm RC4 / LENS-3]
 *  ------------------------------------------------------------------------------------------
 *  Migration numbers are claimed at MERGE time (slices/forks/RENUMBER.md); the slice NAME never
 *  moves. A `^0042_` / `^0043_` pair therefore stops meaning what it says the moment an
 *  intervening hotfix takes a number: with D-b0 merged as 0043, `^0043_` reads D-b0 as D-b1, and
 *  a frontier-aware contract silently skips the arm that IS live and runs the arm that is not —
 *  against a database that has none of the objects that arm names. Keying on the full stable
 *  name makes every arm below renumber-proof, and makes the renumber inventory in RENUMBER.md
 *  §2 a list of FILENAMES to rename rather than a list of regexes to re-derive.
 *
 *  THE ROSTER IS DELIBERATELY WHOLE — all four slices, in every x42x contract, whichever pair
 *  that contract asserts on. That is what makes RENUMBER.md §2 one edit per file in one known
 *  place for EVERY slice, instead of a per-file re-derivation of which two regexes this
 *  particular contract happens to consume. The two this file does not read are kept, not
 *  trimmed; each carries its own disable so the exemption stays visible and scoped to the line.
 */
const V_B0 = "^[0-9]{4}_wave_d_b0_shared_authorities$";
const V_B1 = "^[0-9]{4}_wave_d_b1_staff_advances$";
// eslint-disable-next-line no-unused-vars -- whole-roster invariant; see the note above
const V_B3 = "^[0-9]{4}_wave_d_b3_af2_composite$";
// eslint-disable-next-line no-unused-vars -- whole-roster invariant; see the note above
const V_B2 = "^[0-9]{4}_wave_d_b2_recurring_adjustments$";

const reservedRoles = async (client, code) => (await rootQuery(
  "select domain, role, owner_ref from clara._acct_role_reserved($1, $2) order by domain, role", [client, code])).rows;

const COST = "200-XB01";
const ACCUM = "210-XB01";
const EXPEN = "900-XB01";
const FREE = "560-XB01";
const ADVC = "186-XB01";

/** A client whose FA profile claims COST/ACCUM/EXPEN, plus a FREE ordinary expense code and a
 *  candidate ADVANCE code. Identical on both sides of the boundary — which is what makes the
 *  FA expectations comparable across the two runs. */
async function stageWorld() {
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `xb01_${uniqTag()}`, opKey: opk("xb01cli") });
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  for (const [code, name, type] of [
    [COST, "Plant (xb01)", "asset"], [ACCUM, "Accum Depr (xb01)", "asset"],
    [EXPEN, "Depreciation Expense (xb01)", "expense"], [FREE, "Sundry (xb01)", "expense"],
    [ADVC, "Staff advances (xb01)", "asset"],
  ]) {
    await upsertAccountClassed(sub, { client, code, name, type, accountClass: null, opKey: opk("xb01coa") });
  }
  await upsertFaProfile(sub, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPEN });
  return { sub, client };
}

// ===========================================================================

test("x42x.ru1 THE FA ANSWER IS THE SAME ON BOTH SIDES OF THE BOUNDARY: the three profile codes read RESERVED with domain='fa', an ordinary code reads FREE, and an UN-ENROLLED candidate advance code reads FREE — pinned identically pre- and post-0043", async (t) => {
  if (skipHere(t)) return;
  const { client } = await stageWorld();

  for (const [code, role] of [[COST, "asset"], [ACCUM, "accum"], [EXPEN, "expense"]]) {
    const rows = await reservedRoles(client, code);
    assert.equal(rows.length, 1, `${code}: exactly one reservation (got ${JSON.stringify(rows)})`);
    assert.equal(rows[0].domain, "fa", `${code}: the reservation's domain is the FA one`);
    assert.ok(rows[0].role, `${code}: the reservation names a role (got ${rows[0].role}, expected the ${role} slot)`);
  }
  assert.deepEqual(await reservedRoles(client, FREE), [], "an ordinary expense code is FREE");
  assert.deepEqual(await reservedRoles(client, ADVC), [],
    "an UN-ENROLLED candidate advance code is FREE — true at BOTH frontiers, which is what makes the union additive rather than a behaviour change");
  noteLane(`x42x.ru1: the FA answers are pinned at frontier D-b0=${await applied(V_B0)} D-b1=${await applied(V_B1)}`);
});

test("x42x.ru2 THE SHELL: with 0042 applied and 0043 NOT, both reservation authorities exist and are FA-ONLY — no advance relation is read, and the advance registers do not exist to be read", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B1) > 0) {
    t.skip("D-b1 IS applied — this is the PRE arm of the boundary; the POST arm (ru3) is the live one here");
    return;
  }
  assert.equal(await applied(V_B0), 1, "the PRE arm needs the D-b0 migration applied");
  for (const t2 of ["staff_advance_accounts", "staff_advances"]) {
    assert.equal(await tableExists(t2), false, `clara.${t2} does not exist yet — D-b1 has not shipped`);
  }
  for (const fn of ["_acct_role_reserved", "_acct_role_reserved_at"]) {
    const def = await strippedDef(fn);
    assert.ok(def, `clara.${fn} exists at D-b0 (the FA-ONLY shell)`);
    assert.equal(/staff_advance/.test(def), false, `clara.${fn} reads NO advance relation at D-b0`);
    assert.equal(/_adv_enrolment_at/.test(def), false, `clara.${fn} calls NO D-b1 body at D-b0`);
    assert.ok(/_fa_reserved_roles|fa_account_profiles|fixed_assets/.test(def), `clara.${fn} carries its FA disjunct at D-b0`);
  }
  // THE ARM THAT MATTERS: the ADVANCE-ARM WORK IS REFUSED, not silently absent. The enrolment
  // verb — the only door that could make an advance code reserved — does not exist at all, so
  // asking for it is a NAMED refusal from Postgres itself rather than a quiet no-op.
  assert.equal((await rootQuery(
    "select 1 from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='enrol_staff_advance_account'")).rowCount,
    0, "the enrolment verb does not exist at D-b0 — advance-arm work is unreachable, by construction");
  noteLane("x42x.ru2 [PRE arm]: the D-b0 shell is genuinely FA-only — verified on the catalog, comments stripped");
});

test("x42x.ru3 THE COMPLETION: once 0043 is applied both authorities carry the advance arm, still carry the FA one, and an ENROLLED code that read FREE before now reads RESERVED with domain='staff_advance' — the union completed, it did not replace", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B1) === 0) {
    t.skip("D-b1 is not applied — this is the POST arm of the boundary; the PRE arm (ru2) is the live one here");
    return;
  }
  for (const fn of ["_acct_role_reserved", "_acct_role_reserved_at"]) {
    const def = await strippedDef(fn);
    assert.ok(/staff_advance/.test(def), `clara.${fn} gained its ADVANCE arm at D-b1 (E9: a silent create would look identical without this)`);
    assert.ok(/_fa_reserved_roles|fa_account_profiles|fixed_assets/.test(def), `clara.${fn} still carries its FA disjunct — the completion did not replace the shell`);
  }

  const { client } = await stageWorld();
  assert.deepEqual(await reservedRoles(client, ADVC), [], "mandatory setup: the candidate advance code starts FREE");

  await humanQuery(w.users.hana, namedCall("enrol_staff_advance_account", [
    { name: "p_client" }, { name: "p_account_code" }, { name: "p_person_label" },
    { name: "p_confirm_dedicated", cast: "boolean" }, { name: "p_attestation" }, { name: "p_op_key" },
  ]), [client, ADVC, `XB01 Staff ${uniqTag()}`, true,
    "xb01 contract: the code is dedicated to one person and carries no other traffic", opk("xb01enrol")]);

  const rows = await reservedRoles(client, ADVC);
  assert.equal(rows.length, 1, `the enrolled code is now RESERVED (got ${JSON.stringify(rows)})`);
  assert.equal(rows[0].domain, "staff_advance", "…in the ADVANCE domain — the arm D-b1 added");

  // …and the FA answers are UNMOVED by the completion, measured on the same world.
  for (const code of [COST, ACCUM, EXPEN]) {
    const fa = await reservedRoles(client, code);
    assert.equal(fa.length, 1, `${code}: still exactly one reservation after the completion`);
    assert.equal(fa[0].domain, "fa", `${code}: still the FA domain — the advance arm is ADDITIVE`);
  }
  assert.deepEqual(await reservedRoles(client, FREE), [], "an ordinary code is still FREE after the completion");
  noteLane("x42x.ru3 [POST arm]: the reservation union completed at D-b1 — advance arm gained, FA answers unmoved");
});
