// F-T3 PR-1 -- the six PLATFORM tax-law relations, their seeded law, and the refusal-reason
// vocabulary the whole computation ladder persists through.
// Migration: packages/db/migrations/UNNUMBERED_f_t3_pr_1_tax_platform.sql (numbered at MERGE).
//
// THIS FILE: sections A (closed-world structure census), C (the seeded law's invariants) and
// D (the refusal vocabulary). Two siblings share its fixtures module, split only to stay under
// the file-size gate: f-t3-pr-1-isolation.test.mjs (the ACL census and the two-firm proof) and
// f-t3-pr-1-walls.test.mjs (the mutant panel, the immutability walls, the deliberate-absence
// instruments and 裁-33's no-lifecycle-column census).
//
// Section A deliberately duplicates the migration's own S10 tail: the tail proves the
// migration built the shape on ITS OWN rig at ITS OWN moment, this proves the shape SURVIVES
// on a database that then ran every other migration in the estate, re-derived independently.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool } from "./rig-fixtures.mjs";
import {
  RELATIONS, CODES, RESEARCH_LEAVES, LADDER_REASONS, OQ11_REASON, RULING_33_REASON,
  tableApplied,
} from "./f-t3-pr-1-fixtures.mjs";

let live = false;
before(async () => { live = await tableApplied(); });
after(async () => { await endPool(); });

/** Two-armed gate. A PACKAGE-WIDE run may precede this migration, so the preintegration gate
 *  (preloaded by the package test script) sets CLARA_ALLOW_MISSING_FT3_TAX_PLATFORM and this
 *  suite skips LOUDLY. A FOCUSED run does not preload it, so an unmigrated database FAILS here
 *  instead of greening by skipping every cell -- indistinguishable from a real pass. Final
 *  acceptance is that focused shape, variable UNSET, zero skips. */
const gate = (t) => {
  if (!live) {
    if (process.env.CLARA_ALLOW_MISSING_FT3_TAX_PLATFORM === "1") {
      console.warn("SKIP f-t3-pr-1: the migration is not applied to this database (explicit pre-integration run).");
      t.skip("F-T3 PR-1 tax platform relations not applied -- explicit pre-integration run");
      return true;
    }
    assert.fail("the F-T3 PR-1 tax platform relations are required for a focused or post-migration run: apply the migration, or set CLARA_ALLOW_MISSING_FT3_TAX_PLATFORM=1 for the package-wide pre-integration sweep");
  }
  return false;
};

// ---------------------------------------------------------------------------------------
// A · CLOSED-WORLD STRUCTURE CENSUS
// ---------------------------------------------------------------------------------------

test("ft3-A1 · all six relations exist, are owned by clara_fn_owner, and carry ENABLE + "
  + "FORCE row level security", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select c.relname, pg_get_userbyid(c.relowner) as owner,
              c.relrowsecurity, c.relforcerowsecurity
         from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = 'clara' and c.relname = any ($1) order by c.relname`, [RELATIONS]);
    assert.deepEqual(r.rows.map((x) => x.relname), [...RELATIONS].sort());
    for (const row of r.rows) {
      assert.equal(row.owner, "clara_fn_owner", `${row.relname} owner`);
      assert.equal(row.relrowsecurity, true, `${row.relname} RLS enabled`);
      assert.equal(row.relforcerowsecurity, true, `${row.relname} RLS forced`);
    }
  });

test("ft3-A2 · each relation carries exactly ONE unconditional clara_fn_owner policy, and "
  + "NO firm_id column (mechanics M4 class B: these are law, not tenant data)", async (t) => {
    if (gate(t)) return;
    for (const rel of RELATIONS) {
      const pol = await rootQuery(
        `select policyname, roles::text[] as roles, qual, with_check from pg_policies
          where schemaname = 'clara' and tablename = $1`, [rel]);
      assert.equal(pol.rowCount, 1, `${rel}: exactly one policy`);
      assert.equal(pol.rows[0].policyname, `p_${rel}_owner`);
      assert.deepEqual(pol.rows[0].roles, ["clara_fn_owner"]);
      assert.equal(pol.rows[0].qual, "true");
      assert.equal(pol.rows[0].with_check, "true");

      const col = await rootQuery(
        `select count(*)::int n from pg_attribute a
          where a.attrelid = ('clara.' || $1)::regclass and a.attname = 'firm_id'
            and a.attnum > 0 and not a.attisdropped`, [rel]);
      assert.equal(col.rows[0].n, 0,
        `${rel} must not carry firm_id -- a Malaysian tax band is not tenant data`);
    }
  });

test("ft3-A3 · trigger census on each relation, pinned by name -- exactly three", async (t) => {
  if (gate(t)) return;
  for (const rel of RELATIONS) {
    const r = await rootQuery(
      `select tgname from pg_trigger where tgrelid = ('clara.' || $1)::regclass
         and not tgisinternal order by tgname`, [rel]);
    assert.deepEqual(r.rows.map((x) => x.tgname),
      [`t_${rel}_immutable`, `t_${rel}_no_delete`, `t_${rel}_no_truncate`],
      `${rel}: exactly the immutability guard plus the estate's append-only / no-truncate pair`);
  }
});

test("ft3-A4 · the shared immutability trigger function is SECURITY DEFINER, owned by "
  + "clara_fn_owner, and PUBLIC cannot EXECUTE it", async (t) => {
    if (gate(t)) return;
    const fn = await rootQuery(
      `select p.prosecdef, pg_get_userbyid(p.proowner) as owner,
              has_function_privilege('public', p.oid, 'execute') as public_exec
         from pg_proc p where p.oid = 'clara._tf_ft3_law_row_immutable()'::regprocedure`);
    assert.equal(fn.rowCount, 1, "the function exists at its pinned signature");
    assert.equal(fn.rows[0].prosecdef, true);
    assert.equal(fn.rows[0].owner, "clara_fn_owner");
    assert.equal(fn.rows[0].public_exec, false, "PUBLIC holds no EXECUTE");
  });

test("ft3-A5 · column census on the two relations a departure re-shaped -- so a silent "
  + "re-shape is caught here rather than in PR-2", async (t) => {
    if (gate(t)) return;
    const cols = async (rel) => (await rootQuery(
      `select attname from pg_attribute where attrelid = ('clara.' || $1)::regclass
         and attnum > 0 and not attisdropped order by attnum`, [rel])).rows.map((x) => x.attname);

    // Departure 1 (owner_signed_* NULLABLE, OQ-7), departure 3 (direction 'refuse' +
    // refusal_reason_key, OQ-11), departure 4 (requires_apportionment).
    assert.deepEqual(await cols("tax_treatment_codes"), [
      "code", "direction", "fraction_bp", "requires_apportionment", "refusal_reason_key",
      "regime", "statutory_ref", "effective_ya_from", "effective_ya_to", "authority_id",
      "conflict", "notes", "valid_through", "owner_signed_by", "owner_signed_at", "revision",
      "superseded_by", "superseded_at", "seeded_in_migration", "created_at",
    ]);
    // Departure 2: value_int, because loss_carry_forward_years = 10 is neither money nor bp.
    assert.deepEqual(await cols("tax_thresholds"), [
      "id", "ya", "key", "value_cents", "value_bp", "value_int", "authority_id", "conflict",
      "valid_through", "revision", "superseded_by", "superseded_at", "seeded_in_migration",
      "created_at",
    ]);
  });

test("ft3-A6 · owner_signed_by / owner_signed_at are NULLABLE on both signable relations -- "
  + "OQ-7's fail-closed default (seed unsigned) cannot coexist with NOT NULL", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select c.relname, a.attname, a.attnotnull from pg_attribute a
         join pg_class c on c.oid = a.attrelid
        where a.attrelid = any (array['clara.tax_authorities'::regclass,
                                      'clara.tax_treatment_codes'::regclass])
          and a.attname in ('owner_signed_by', 'owner_signed_at') order by 1, 2`);
    assert.equal(r.rowCount, 4);
    for (const row of r.rows) {
      assert.equal(row.attnotnull, false,
        `${row.relname}.${row.attname} must be nullable -- the wall is the named refusal treatment_code_unsigned plus the one-way-once signature arm, not a NOT NULL`);
    }
  });

test("ft3-A7 · every live-row partial unique index exists with its exact predicate", async (t) => {
  if (gate(t)) return;
  const want = {
    uq_tax_authorities_live: /USING btree \(label\) WHERE \(superseded_at IS NULL\)/,
    uq_tax_rate_bands_live: /USING btree \(regime, ya, band_lower_cents\) WHERE \(superseded_at IS NULL\)/,
    uq_capital_allowance_rates_live: /USING btree \(ca_class, ya_from\) WHERE \(superseded_at IS NULL\)/,
    uq_tax_thresholds_live: /USING btree \(ya, key\) WHERE \(superseded_at IS NULL\)/,
    uq_tax_add_back_class_map_live: /USING btree \(add_back_class\) WHERE \(superseded_at IS NULL\)/,
  };
  for (const [name, re] of Object.entries(want)) {
    const r = await rootQuery(
      "select indexdef from pg_indexes where schemaname = 'clara' and indexname = $1", [name]);
    assert.equal(r.rowCount, 1, `${name} exists`);
    assert.match(r.rows[0].indexdef, re, `${name} predicate`);
  }
});

// ---------------------------------------------------------------------------------------
// C · THE SEEDED LAW
// ---------------------------------------------------------------------------------------

test("ft3-C1 · seeded row counts per relation, scoped by this migration's stable stem "
  + "(never a blind count(*) -- a reused local rig accumulates fixture rows)", async (t) => {
    if (gate(t)) return;
    const want = {
      tax_authorities: 26, tax_treatment_codes: 13, tax_rate_bands: 12,
      capital_allowance_rates: 5, tax_thresholds: 38, tax_add_back_class_map: 12,
    };
    for (const [rel, n] of Object.entries(want)) {
      const r = await rootQuery(
        `select count(*)::int n from clara.${rel} where seeded_in_migration = 'f_t3_pr_1_tax_platform'`);
      assert.equal(r.rows[0].n, n, `${rel} seeded row count`);
    }
  });

test("ft3-C2 · the code set is exactly the thirteen seeded codes, and EVERY ONE IS UNSIGNED "
  + "(OQ-7's fail-closed default: an unsigned code is unusable, so nothing computes wrongly "
  + "-- it simply does not compute)", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select code, owner_signed_by, owner_signed_at from clara.tax_treatment_codes
        where seeded_in_migration = 'f_t3_pr_1_tax_platform' order by code`);
    assert.deepEqual(r.rows.map((x) => x.code), [...CODES].sort());
    for (const row of r.rows) {
      assert.equal(row.owner_signed_by, null, `${row.code} must seed unsigned`);
      assert.equal(row.owner_signed_at, null, `${row.code} must seed unsigned`);
    }
  });

test("ft3-C3 · every code resolves to an authority row, and the three named-but-unopened rulings "
  + "are graded honestly with a valid_through inside the belt's FIRST horizon", async (t) => {
    if (gate(t)) return;
    const orphan = await rootQuery(
      `select c.code from clara.tax_treatment_codes c
         left join clara.tax_authorities a on a.id = c.authority_id where a.id is null`);
    assert.deepEqual(orphan.rows, [], "no code names an authority that does not resolve");

    // Scoped by the migration's own stem, NEVER a blind table-wide filter: this battery's own
    // fixtures commit `x_ft3test_*` rows into this append-only table, and on a REUSED local rig
    // they accumulate across runs (the obligation statutory-deadlines-ddl.test.mjs records).
    const graded = await rootQuery(
      `select label, valid_through from clara.tax_authorities
        where evidence_grade = 'reference_only_unfetched'
          and seeded_in_migration = 'f_t3_pr_1_tax_platform'`);
    assert.deepEqual(graded.rows.map((x) => x.label).sort(),
      ["LHDN_PR_1_2003", "LHDN_PR_4_2015", "LHDN_PR_4_2019"],
      "exactly the three rulings the survey (U3/U4) and the COA dossier name without opening");
    for (const row of graded.rows) {
      assert.ok(row.valid_through <= new Date("2026-08-29T00:00:00Z"),
        `${row.label}: an unread citation must already be due for review`);
    }

    const ungrounded = await rootQuery(
      `select label from clara.tax_authorities
        where evidence_grade = 'official_primary' and (url is null or accessed_at is null)
          and seeded_in_migration = 'f_t3_pr_1_tax_platform'`);
    assert.deepEqual(ungrounded.rows, [],
      "a row claiming a primary official reading carries the URL and the date it was read");
  });

test("ft3-C4 · the add_back_class map is TOTAL over the twelve 裁-21 research leaves, covers "
  + "each EXACTLY once, and every mapped code exists", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select m.add_back_class, m.code, c.code is not null as code_resolves
         from clara.tax_add_back_class_map m
         left join clara.tax_treatment_codes c on c.code = m.code
        where m.superseded_at is null order by m.add_back_class`);
    assert.deepEqual(r.rows.map((x) => x.add_back_class), RESEARCH_LEAVES,
      "exactly the twelve leaves of docs/plan/research/coa-template-2026-08-29.json, each once");
    for (const row of r.rows) {
      assert.equal(row.code_resolves, true, `${row.add_back_class} -> ${row.code} resolves`);
    }
  });

test("ft3-C5 · donations_approved maps to the REFUSE code, not to any add-back (OQ-11's "
  + "fail-closed default) -- a flat 100% add-back would OVERSTATE the charge on every client "
  + "that donates to an approved institution, silently", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select m.code, c.direction, c.fraction_bp, c.refusal_reason_key
         from clara.tax_add_back_class_map m
         join clara.tax_treatment_codes c on c.code = m.code
        where m.add_back_class = 'donations_approved' and m.superseded_at is null`);
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].direction, "refuse");
    assert.equal(r.rows[0].fraction_bp, null, "a refuse code carries no numeral to apply");
    assert.equal(r.rows[0].refusal_reason_key, OQ11_REASON);

    // The paired half: the UNAPPROVED leaf is a real s.33(1) add-back, so the two donation
    // families are genuinely distinguished rather than both being refused or both added back.
    const unapproved = await rootQuery(
      `select c.direction, c.fraction_bp from clara.tax_add_back_class_map m
         join clara.tax_treatment_codes c on c.code = m.code
        where m.add_back_class = 'donations_unapproved' and m.superseded_at is null`);
    assert.equal(unapproved.rows[0].direction, "add_back");
    assert.equal(unapproved.rows[0].fraction_bp, 10000);
  });

test("ft3-C6 · the corrected citations landed, and the depreciation row carries its "
  + "unresolved conflict rather than hiding it", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select c.code, c.statutory_ref, c.conflict, a.label from clara.tax_treatment_codes c
         join clara.tax_authorities a on a.id = c.authority_id
        where c.code in ('ADDBACK_FINE_100', 'ADDBACK_DEPRECIATION_100') order by c.code`);
    assert.equal(r.rowCount, 2);
    const fine = r.rows.find((x) => x.code === "ADDBACK_FINE_100");
    const dep = r.rows.find((x) => x.code === "ADDBACK_DEPRECIATION_100");

    // The design's worked example cited s.39(1)(b); the COA cross-reference dropped the
    // over-specified paragraph letter.
    assert.equal(fine.label, "ITA1967_S39_1");
    assert.doesNotMatch(fine.statutory_ref, /39\(1\)\(b\)/,
      "the fine citation must NOT carry the over-specified paragraph (b)");
    // The design's worked example cited s.39(1)(c),(e); the replay re-cut it to (k) + Sch 3.
    assert.equal(dep.label, "ITA1967_S39_1_K");
    assert.doesNotMatch(dep.statutory_ref, /39\(1\)\((c|e)\)/,
      "the depreciation citation must NOT carry the refuted (c)/(e)");
    assert.ok(dep.conflict && dep.conflict.length > 0,
      "the depreciation row records the measured survey-vs-dossier disagreement about what s.39(1)(k) says -- a signer must adjudicate it before signing");
  });

test("ft3-C7 · the rate bands are the PR 8/2025 MSMC ladder plus the standard rate, for "
  + "YA2023-YA2025, in half-open cents intervals", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select regime, ya, band_lower_cents::bigint, band_upper_cents::bigint, rate_bp
         from clara.tax_rate_bands where superseded_at is null
        order by regime, ya, band_lower_cents`);
    assert.equal(r.rowCount, 12);
    for (const ya of [2023, 2024, 2025]) {
      const msmc = r.rows.filter((x) => x.regime === "company_msmc" && x.ya === ya);
      assert.deepEqual(msmc.map((x) => [String(x.band_lower_cents), x.band_upper_cents === null ? null : String(x.band_upper_cents), x.rate_bp]),
        [["0", "15000000", 1500], ["15000000", "60000000", 1700], ["60000000", null, 2400]],
        `company_msmc YA${ya}: 15% on the first RM150,000, 17% to RM600,000, 24% on the excess`);
      const std = r.rows.filter((x) => x.regime === "company_standard" && x.ya === ya);
      assert.deepEqual(std.map((x) => [String(x.band_lower_cents), x.band_upper_cents, x.rate_bp]),
        [["0", null, 2400]], `company_standard YA${ya}: a single 24% band`);
    }
  });

test("ft3-C8 · the thresholds cover twelve keys across YA2023-YA2025 plus the YA2024/2025 "
  + "foreign-holding pair, each with exactly one value column populated", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select key, ya, value_cents::bigint, value_bp, value_int from clara.tax_thresholds
        where superseded_at is null order by key, ya`);
    assert.equal(r.rowCount, 38);
    for (const row of r.rows) {
      const set = [row.value_cents, row.value_bp, row.value_int].filter((v) => v !== null);
      assert.equal(set.length, 1, `${row.key}/${row.ya}: exactly one value column`);
    }
    const byKey = (k) => r.rows.filter((x) => x.key === k);
    assert.deepEqual(byKey("msmc_foreign_holding_max_bp").map((x) => x.ya), [2024, 2025],
      "the >20% foreign/non-citizen test is effective FROM YA2024 -- a YA2023 row would assert a test that did not yet bite");
    assert.equal(String(byKey("msmc_paid_up_max")[0].value_cents), "250000000", "RM2,500,000 in cents");
    assert.equal(String(byKey("sva_asset_max")[0].value_cents), "200000", "RM2,000 in cents");
    assert.equal(byKey("cp204_floor_bp")[0].value_bp, 8500, "s.107C(3)'s 85% floor");
    // Departure 2's whole reason: a count of years is neither money nor a rate.
    assert.equal(byKey("loss_carry_forward_years")[0].value_int, 10, "s.44(5F)'s ten YAs");
    assert.equal(byKey("loss_carry_forward_years")[0].value_cents, null);
    assert.equal(byKey("loss_carry_forward_years")[0].value_bp, null);
  });

// ---------------------------------------------------------------------------------------
// D · THE REFUSAL VOCABULARY. Part 2 section 9's law: "a string with no reason row cannot be
// persisted at all, only raised". This is cell C21's PR-1 half.
// ---------------------------------------------------------------------------------------

test("ft3-D1 · all twenty-two LADDER refusal strings are seeded as PLATFORM rows "
  + "(firm_id NULL -- lawful for every firm), version 1, each mapping to the cell_status part "
  + "2 section 9 assigns it", async (t) => {
    if (gate(t)) return;
    const keys = Object.keys(LADDER_REASONS);
    // Both sides are sorted IN JS. Postgres's default collation ignores the underscore, so
    // `order by reason_key` puts losses_brought_forward_unknown before loss_relief_rules_unread
    // while JS's codepoint sort does the opposite -- a collation difference, not a defect, and
    // comparing an SQL-ordered list against a JS-sorted one would fail for that reason alone.
    const r = await rootQuery(
      `select reason_key, cell_status, version, firm_id, display_token, effective_from
         from clara.metric_na_reason_versions where reason_key = any ($1)`, [keys]);
    assert.deepEqual(r.rows.map((x) => x.reason_key).sort(), [...keys].sort(),
      "the closed ladder vocabulary is present in full -- nothing missing, nothing extra");
    for (const row of r.rows) {
      assert.equal(row.cell_status, LADDER_REASONS[row.reason_key],
        `${row.reason_key} maps to the wrong cell_status`);
      assert.equal(row.firm_id, null,
        `${row.reason_key} must be a platform row: _tf_metric_catalog_scope's verdict conjunct is 'pf is not null', which is what makes a firm_id NULL row lawful for EVERY firm`);
      assert.equal(row.version, 1);
    }
  });

test("ft3-D2 · delta D-9's row exists by name: the close belt enforces closing_position "
  + "ONLY, so the pl_rows array the whole ladder reads is unenforced and needs its own "
  + "named refusal", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select cell_status, semantics from clara.metric_na_reason_versions
        where reason_key = 'close_snapshot_missing_pl_rows'`);
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].cell_status, "absent");
    assert.equal(r.rows[0].semantics.delta, "D-9",
      "the row names the delta that minted it, so a reader can find why it exists");
  });

test("ft3-D3 · OQ-11's fail-closed row is seeded and counted SEPARATELY from the closed "
  + "ladder set -- it retires the day the owner rules the other way", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select cell_status, firm_id, version, semantics from clara.metric_na_reason_versions
        where reason_key = $1`, [OQ11_REASON]);
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].cell_status, "refused");
    assert.equal(r.rows[0].firm_id, null);
    assert.equal(r.rows[0].version, 1);
    assert.equal(r.rows[0].semantics.oq, "OQ-11");
  });

test("ft3-D3b · 裁-33's draft-only wall has its NAME seeded: a tax computation goes to DRAFT only "
  + "and is never issued, so PR-7's transition wall has a persistable string before the verb "
  + "that raises it exists", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select cell_status, firm_id, version, semantics from clara.metric_na_reason_versions
        where reason_key = $1`, [RULING_33_REASON]);
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].cell_status, "refused");
    assert.equal(r.rows[0].firm_id, null);
    assert.equal(r.rows[0].version, 1);
    assert.equal(r.rows[0].semantics.ruling, "裁-33");
  });

// 裁-33's OTHER half — no F-T3 relation carries a lifecycle-state column — is ft3-H2.
// ft3-D4 is scoped to F-T3's own keys, NEVER a table-wide count(*):
// clara.metric_na_reason_versions is a SHARED, append-only, estate-wide catalog that other
// batteries in this same suite also write to, so an absolute total measures the whole RUN
// rather than this migration. A focused run hides that; a full sweep does not — which is
// exactly the obligation statutory-deadlines-ddl.test.mjs records for its own table.
test("ft3-D4 · F-T3's OWN 24 keys are a closed world -- exactly one row each, no duplicate "
  + "version -- and the nine Wave-E rows are untouched", async (t) => {
  if (gate(t)) return;
  const mine = [...Object.keys(LADDER_REASONS), OQ11_REASON, RULING_33_REASON];
  assert.equal(mine.length, 24, "22 ladder strings + 2 ruling strings");
  const r = await rootQuery(
    `select reason_key, count(*)::int n from clara.metric_na_reason_versions
      where firm_id is null and version = 1 and reason_key = any ($1) group by reason_key`,
    [mine]);
  assert.equal(r.rowCount, 24, "every one of F-T3's 24 keys exists as a platform v1 row");
  for (const row of r.rows) {
    assert.equal(row.n, 1, `${row.reason_key}: exactly one platform v1 row`);
  }
  // The Wave-E rows F-T3 must not disturb are the PLATFORM VERSION-1 nine, not "every row
  // carrying a Wave-E key". MEASURED: another battery in this same suite mints `divide_by_zero`
  // v2/v3/v4 as legitimate platform rows -- the unique is (firm_id, reason_key, version) NULLS
  // NOT DISTINCT, so a later version is lawful and is that lane's business, not this file's.
  // `firm_id is null and version = 1` is the predicate no other lane can move: those rows
  // already exist, so the unique forbids a second one.
  const pre = await rootQuery(
    `select count(*)::int n from clara.metric_na_reason_versions
      where firm_id is null and version = 1
        and reason_key = any (array['divide_by_zero','negative_denominator','absent',
        'prior_period_absent','account_set_drift','account_set_resolution_absent',
        'account_set_resolution_ambiguous','account_set_expansion','sign_presentation_mismatch'])`);
  assert.equal(pre.rows[0].n, 9, "the nine Wave-E platform v1 rows are untouched");
});

test("ft3-D5 · every REFUSE code's refusal_reason_key resolves to a seeded platform reason "
  + "row -- a refusal a code names but no row backs could never reach a metric_cell", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select c.code, c.refusal_reason_key,
              exists (select 1 from clara.metric_na_reason_versions n
                       where n.reason_key = c.refusal_reason_key and n.firm_id is null) as backed
         from clara.tax_treatment_codes c where c.direction = 'refuse' order by c.code`);
    assert.ok(r.rowCount >= 1, "there is at least one refuse code (OQ-11's)");
    for (const row of r.rows) {
      assert.equal(row.backed, true,
        `${row.code} names ${row.refusal_reason_key}, which has no seeded reason row`);
    }
  });
