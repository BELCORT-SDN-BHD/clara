// F-T3 PR-1 -- the walls. Sibling of f-t3-pr-1.test.mjs (same fixtures module; split only to
// stay under the file-size gate).
// Migration: packages/db/migrations/0152_f_t3_pr_1_tax_platform.sql (authored UNNUMBERED; number claimed at merge prep 2026-08-30).
//
// THIS FILE: E (the CHECK mutant panel -- each mutant pinned to the EXACT constraint name,
// because one that fails for the wrong reason has proven nothing about the wall it aimed at),
// F (the live-row unique walls), G (immutability: ARM ZERO, supersede-only, the one-way-once
// signature, append-only, no-truncate, and the TWO lawful updates), H (the deliberate absences
// and 裁-33's no-lifecycle-column census, each with a positive control), I (the scope binding).
//
// Every write goes as clara_fn_owner, and every adversarial cell that would otherwise leave a
// row in a shared, append-only, DELETE-forever-blocked platform table runs in a rolled-back
// transaction. The few rows that DO commit carry an `x_ft3test_<pid>_<n>` prefix and are never
// counted by any seed assertion (those scope on seeded_in_migration) -- the obligation
// statutory-deadlines-ddl.test.mjs records for its own reused-rig case.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, roleQuery, endPool, assertRaises, ROLES } from "./rig-fixtures.mjs";
import { truncateGuardError } from "./rig-txn.mjs";
import {
  RELATIONS, LIFECYCLE_COLUMNS, tableApplied, inRolledBackTx, authorityRow, codeRow,
  insertLawRow, insertMutant, freshAuthority,
} from "./f-t3-pr-1-fixtures.mjs";

let live = false;
before(async () => { live = await tableApplied(); });
after(async () => { await endPool(); });

const gate = (t) => {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_FT3_TAX_PLATFORM === "1") {
    console.warn("SKIP f-t3-pr-1-walls: the migration is not applied to this database (explicit pre-integration run).");
    t.skip("F-T3 PR-1 tax platform relations not applied -- explicit pre-integration run");
    return true;
  }
  assert.fail("the F-T3 PR-1 tax platform relations are required for a focused or post-migration run: apply the migration, or set CLARA_ALLOW_MISSING_FT3_TAX_PLATFORM=1 for the package-wide pre-integration sweep");
};

// ---------------------------------------------------------------------------------------
// E · THE MUTANT PANEL -- one per CHECK wall, pinned to the exact constraint name.
// ---------------------------------------------------------------------------------------

test("ft3-E1 · tax_authorities: an official_primary claim WITHOUT a url or an accessed_at is "
  + "refused -- a grade nobody can re-walk is a claim, not a citation", async (t) => {
    if (gate(t)) return;
    await insertMutant("tax_authorities", authorityRow({ url: null }),
      "ck_tax_authorities_primary_is_grounded");
    await insertMutant("tax_authorities", authorityRow({ accessed_at: null }),
      "ck_tax_authorities_primary_is_grounded");
    // The differential half: the SAME row graded honestly as unfetched IS admitted.
    const ok = await insertLawRow("tax_authorities",
      authorityRow({ url: null, accessed_at: null, evidence_grade: "reference_only_unfetched" }));
    assert.equal(ok.rowCount, 1, "an honestly-graded unfetched reference is lawful");
  });

test("ft3-E2 · tax_authorities: the closed vocabularies and the two paired stamps", async (t) => {
  if (gate(t)) return;
  await insertMutant("tax_authorities", authorityRow({ kind: "blog_post" }),
    "ck_tax_authorities_kind");
  await insertMutant("tax_authorities", authorityRow({ evidence_grade: "probably_fine" }),
    "ck_tax_authorities_evidence_grade");
  await insertMutant("tax_authorities", authorityRow({ owner_signed_at: "2026-08-29T00:00:00Z" }),
    "ck_tax_authorities_signature_paired");
  await insertMutant("tax_authorities", authorityRow({ superseded_at: "2026-08-29T00:00:00Z" }),
    "ck_tax_authorities_supersession_paired");
  await insertMutant("tax_authorities", authorityRow({ url: "ftp://hasil.gov.my/x" }),
    "tax_authorities_url_check");
  await insertMutant("tax_authorities", authorityRow({ label: "   " }),
    "tax_authorities_label_check");
});

test("ft3-E3 · tax_treatment_codes: THE REFUSE SHAPE, both directions -- a refuse code with a "
  + "fraction, and a computing code without one, are each refused by their own named "
  + "constraint (departure 3: a refusal has no numeral to apply)", async (t) => {
    if (gate(t)) return;
    const a = await freshAuthority();
    await insertMutant("tax_treatment_codes",
      codeRow(a, { direction: "refuse", fraction_bp: 10000, refusal_reason_key: "s44_6_relief_unmodelled" }),
      "ck_tax_treatment_codes_refuse_has_no_fraction");
    await insertMutant("tax_treatment_codes",
      codeRow(a, { direction: "add_back", fraction_bp: null }),
      "ck_tax_treatment_codes_refuse_has_no_fraction");
    await insertMutant("tax_treatment_codes",
      codeRow(a, { direction: "refuse", fraction_bp: null, refusal_reason_key: null }),
      "ck_tax_treatment_codes_refuse_names_reason");
    await insertMutant("tax_treatment_codes",
      codeRow(a, { direction: "add_back", fraction_bp: 10000, refusal_reason_key: "close_not_sealed" }),
      "ck_tax_treatment_codes_refuse_names_reason");
    await insertMutant("tax_treatment_codes",
      codeRow(a, { direction: "refuse", fraction_bp: null, refusal_reason_key: "s44_6_relief_unmodelled",
                   requires_apportionment: true }),
      "ck_tax_treatment_codes_refuse_not_apportioned");
    // The differential: a well-formed refuse code IS admitted.
    const ok = await insertLawRow("tax_treatment_codes",
      codeRow(a, { direction: "refuse", fraction_bp: null, refusal_reason_key: "s44_6_relief_unmodelled" }));
    assert.equal(ok.rows[0].direction, "refuse");
    assert.equal(ok.rows[0].fraction_bp, null);
  });

test("ft3-E4 · tax_treatment_codes: the closed vocabularies, the fraction range, the code "
  + "shape and the YA window", async (t) => {
    if (gate(t)) return;
    const a = await freshAuthority();
    await insertMutant("tax_treatment_codes", codeRow(a, { direction: "maybe" }),
      "ck_tax_treatment_codes_direction");
    await insertMutant("tax_treatment_codes", codeRow(a, { regime: "partnership" }),
      "ck_tax_treatment_codes_regime");
    await insertMutant("tax_treatment_codes", codeRow(a, { fraction_bp: 10001 }),
      "tax_treatment_codes_fraction_bp_check");
    await insertMutant("tax_treatment_codes", codeRow(a, { fraction_bp: -1 }),
      "tax_treatment_codes_fraction_bp_check");
    await insertMutant("tax_treatment_codes", codeRow(a, { code: "addback_lowercase" }),
      "tax_treatment_codes_code_check");
    await insertMutant("tax_treatment_codes",
      codeRow(a, { effective_ya_from: 2025, effective_ya_to: 2024 }),
      "ck_tax_treatment_codes_ya_window");
    await insertMutant("tax_treatment_codes",
      codeRow(a, { owner_signed_at: "2026-08-29T00:00:00Z" }),
      "ck_tax_treatment_codes_signature_paired");
  });

test("ft3-E5 · tax_rate_bands, capital_allowance_rates and tax_thresholds: the span, window "
  + "and exactly-one-value walls", async (t) => {
    if (gate(t)) return;
    const a = await freshAuthority();
    const band = (o) => ({
      regime: "company_msmc", ya: 2099, band_lower_cents: 100, band_upper_cents: 200,
      rate_bp: 1500, authority_id: a, conflict: null, valid_through: "2026-12-31",
      superseded_by: null, superseded_at: null, seeded_in_migration: "rig_fixture", ...o });
    const BAND_COLS = ["regime", "ya", "band_lower_cents", "band_upper_cents", "rate_bp",
      "authority_id", "conflict", "valid_through", "superseded_by", "superseded_at",
      "seeded_in_migration"];
    await insertMutant("tax_rate_bands", band({ band_upper_cents: 100 }),
      "ck_tax_rate_bands_span", "23514", BAND_COLS);
    await insertMutant("tax_rate_bands", band({ regime: "company_tiny" }),
      "ck_tax_rate_bands_regime", "23514", BAND_COLS);
    await insertMutant("tax_rate_bands", band({ rate_bp: 10001 }),
      "tax_rate_bands_rate_bp_check", "23514", BAND_COLS);
    const CA_COLS = ["ca_class", "ya_from", "ya_to", "ia_bp", "aa_bp", "authority_id",
      "conflict", "valid_through", "superseded_by", "superseded_at", "seeded_in_migration"];
    const ca = (o) => ({ ca_class: `x_ft3_${process.pid}`, ya_from: 2099, ya_to: null,
      ia_bp: 2000, aa_bp: 1400, authority_id: a, conflict: null, valid_through: "2026-12-31",
      superseded_by: null, superseded_at: null, seeded_in_migration: "rig_fixture", ...o });
    await insertMutant("capital_allowance_rates", ca({ ya_from: 2099, ya_to: 2098 }),
      "ck_capital_allowance_rates_ya_window", "23514", CA_COLS);
    await insertMutant("capital_allowance_rates", ca({ ca_class: "  " }),
      "capital_allowance_rates_ca_class_check", "23514", CA_COLS);

    const TH_COLS = ["ya", "key", "value_cents", "value_bp", "value_int", "authority_id",
      "conflict", "valid_through", "superseded_by", "superseded_at", "seeded_in_migration"];
    const th = (o) => ({ ya: 2099, key: `x_ft3_${process.pid}`, value_cents: 1, value_bp: null,
      value_int: null, authority_id: a, conflict: null, valid_through: "2026-12-31",
      superseded_by: null, superseded_at: null, seeded_in_migration: "rig_fixture", ...o });
    await insertMutant("tax_thresholds", th({ value_bp: 100 }),
      "ck_tax_thresholds_exactly_one_value", "23514", TH_COLS);
    await insertMutant("tax_thresholds", th({ value_cents: null }),
      "ck_tax_thresholds_exactly_one_value", "23514", TH_COLS);
    await insertMutant("tax_thresholds", th({ value_cents: null, value_bp: 1, value_int: 1 }),
      "ck_tax_thresholds_exactly_one_value", "23514", TH_COLS);
  });

test("ft3-E6 · tax_add_back_class_map: a leaf may not name a code that does not exist -- without "
  + "the FK the map could quietly point the propose step at nothing", async (t) => {
    if (gate(t)) return;
    const a = await freshAuthority();
    const MAP_COLS = ["add_back_class", "code", "source_edition", "source_document",
      "authority_id", "basis", "valid_through", "superseded_by", "superseded_at",
      "seeded_in_migration"];
    await insertMutant("tax_add_back_class_map", {
      add_back_class: `x_ft3_${process.pid}`, code: "NO_SUCH_CODE",
      source_edition: "2026-08-29", source_document: "rig fixture", authority_id: a,
      basis: "rig fixture", valid_through: "2026-12-31", superseded_by: null,
      superseded_at: null, seeded_in_migration: "rig_fixture",
    }, "tax_add_back_class_map_code_fkey", "23503", MAP_COLS);
  });

// ---------------------------------------------------------------------------------------
// F · THE LIVE-ROW UNIQUE WALLS
// ---------------------------------------------------------------------------------------

test("ft3-F1 · a second LIVE row on the same key is refused on every relation that carries a "
  + "live-row unique index, and the seeded law is what the second row collides with", async (t) => {
    if (gate(t)) return;
    const a = await freshAuthority();
    const dup = async (sql, vals, index) => {
      await assert.rejects(() => roleQuery(ROLES.fnOwner, sql, vals), (err) => {
        assert.equal(err.code, "23505", `expected a unique violation, got ${err.code}`);
        assert.equal(err.constraint, index);
        return true;
      });
    };
    await dup(
      `insert into clara.tax_rate_bands (regime, ya, band_lower_cents, band_upper_cents, rate_bp,
         authority_id, valid_through, seeded_in_migration)
       values ('company_msmc', 2025, 0, 1, 1, $1, '2026-12-31', 'rig_fixture')`,
      [a], "uq_tax_rate_bands_live");
    await dup(
      `insert into clara.capital_allowance_rates (ca_class, ya_from, ia_bp, aa_bp, authority_id,
         valid_through, seeded_in_migration)
       values ('motor_vehicle', 2023, 1, 1, $1, '2026-12-31', 'rig_fixture')`,
      [a], "uq_capital_allowance_rates_live");
    await dup(
      `insert into clara.tax_thresholds (ya, key, value_cents, authority_id, valid_through,
         seeded_in_migration)
       values (2025, 'sva_asset_max', 1, $1, '2026-12-31', 'rig_fixture')`,
      [a], "uq_tax_thresholds_live");
    await dup(
      `insert into clara.tax_add_back_class_map (add_back_class, code, source_edition,
         source_document, authority_id, basis, valid_through, seeded_in_migration)
       values ('entertainment', 'ADDBACK_ENTERTAINMENT_50', '2026-08-29', 'rig fixture', $1,
               'rig fixture', '2026-12-31', 'rig_fixture')`,
      [a], "uq_tax_add_back_class_map_live");
    await dup(
      `insert into clara.tax_authorities (kind, label, url, accessed_at, fetched_by,
         evidence_grade, valid_through, seeded_in_migration)
       values ('act_section', 'ITA1967_S44_6', 'https://x.gov.my/a', '2026-08-29', 'rig',
               'official_primary', '2026-12-31', 'rig_fixture')`,
      [], "uq_tax_authorities_live");
  });

// ---------------------------------------------------------------------------------------
// G · IMMUTABILITY. Every cell proves a REFUSAL paired with the write the same wall must let
// through, so a guard that simply refuses everything cannot pass.
// ---------------------------------------------------------------------------------------

test("ft3-G1 · any non-allowlisted column update is refused CLR10, on a table with a "
  + "signature and on one without", async (t) => {
    if (gate(t)) return;
    const auth = await insertLawRow("tax_authorities", authorityRow());
    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        "update clara.tax_authorities set quote = 'a different sentence' where id = $1",
        [auth.rows[0].id]),
      "editing an authority's quote in place");

    const code = await insertLawRow("tax_treatment_codes", codeRow(auth.rows[0].id));
    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        "update clara.tax_treatment_codes set fraction_bp = 5000 where code = $1",
        [code.rows[0].code]),
      "editing a code's fraction in place -- a fraction change is a NEW code, not an edit");
    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        "update clara.tax_treatment_codes set statutory_ref = 's.1(1)' where code = $1",
        [code.rows[0].code]),
      "editing a code's citation in place");
  });

test("ft3-G2 · THE FIRST LAWFUL UPDATE: an UNSIGNED code can be signed exactly once, and the "
  + "signature is one-way-once -- it cannot be re-signed, re-attributed or withdrawn (OQ-7's "
  + "replacement for the NOT NULL the design asked for)", async (t) => {
    if (gate(t)) return;
    const a = await freshAuthority();
    const code = (await insertLawRow("tax_treatment_codes", codeRow(a))).rows[0].code;
    const users = await rootQuery("select id from clara.users where not is_agent limit 2");
    assert.ok(users.rowCount >= 2, "this cell needs two distinct human users to re-attribute");

    // Unsigned on arrival -- the fail-closed default.
    const before0 = await rootQuery(
      "select owner_signed_by from clara.tax_treatment_codes where code = $1", [code]);
    assert.equal(before0.rows[0].owner_signed_by, null);

    // A HALF signature is refused by the trigger's paired arm.
    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        "update clara.tax_treatment_codes set owner_signed_at = now() where code = $1", [code]),
      "a half signature (owner_signed_at without owner_signed_by)");

    // The lawful act.
    const signed = await roleQuery(ROLES.fnOwner,
      `update clara.tax_treatment_codes set owner_signed_by = $1, owner_signed_at = now()
        where code = $2 returning owner_signed_by`, [users.rows[0].id, code]);
    assert.equal(signed.rows[0].owner_signed_by, users.rows[0].id);

    // Once only, in every direction.
    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        `update clara.tax_treatment_codes set owner_signed_by = $1, owner_signed_at = now()
          where code = $2`, [users.rows[1].id, code]),
      "re-attributing a signature to a different human");
    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        `update clara.tax_treatment_codes set owner_signed_by = null, owner_signed_at = null
          where code = $1`, [code]),
      "withdrawing a signature");
  });

test("ft3-G3 · THE SECOND LAWFUL UPDATE: a full, paired supersession stamp succeeds; a half "
  + "stamp is refused; and an already-superseded row is immutable outright", async (t) => {
    if (gate(t)) return;
    const pred = (await insertLawRow("tax_authorities", authorityRow())).rows[0].id;
    const succ = (await insertLawRow("tax_authorities", authorityRow())).rows[0].id;
    const third = (await insertLawRow("tax_authorities", authorityRow())).rows[0].id;

    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        "update clara.tax_authorities set superseded_at = now() where id = $1", [pred]),
      "a half supersession stamp");

    const ok = await roleQuery(ROLES.fnOwner,
      `update clara.tax_authorities set superseded_by = $1, superseded_at = now()
        where id = $2 returning superseded_by`, [succ, pred]);
    assert.equal(ok.rows[0].superseded_by, succ);

    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        `update clara.tax_authorities set superseded_by = $1, superseded_at = now()
          where id = $2`, [third, pred]),
      "re-superseding an already-superseded row");
    // And the terminal state beats even the signature arm.
    const users = await rootQuery("select id from clara.users where not is_agent limit 1");
    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        `update clara.tax_authorities set owner_signed_by = $1, owner_signed_at = now()
          where id = $2`, [users.rows[0].id, pred]),
      "signing a superseded row");
  });

test("ft3-G4 · DELETE is refused CLR08 and TRUNCATE is refused CLR08 on every relation "
  + "(the estate's generic append-only pair, reused rather than re-minted)", async (t) => {
    if (gate(t)) return;
    const auth = (await insertLawRow("tax_authorities", authorityRow())).rows[0].id;
    await assertRaises("CLR08",
      () => roleQuery(ROLES.fnOwner, "delete from clara.tax_authorities where id = $1", [auth]),
      "deleting a live authority row");

    // CASCADE, deliberately: a PLAIN truncate of an FK-referenced table is refused by Postgres
    // itself with 0A000 BEFORE any BEFORE TRUNCATE trigger runs (tax_authorities is referenced
    // by five of these six, tax_treatment_codes by the map), and a cell accepting that 0A000
    // would be measuring Postgres's FK rule rather than this file's wall. truncateGuardError
    // bounds the lock wait and retries, so the assertion observes the GUARD's CLR08 rather than
    // a deadlock against a concurrent writer (db-tests.md).
    for (const rel of RELATIONS) {
      const err = await truncateGuardError(
        `set role ${ROLES.fnOwner}; truncate clara.${rel} cascade`);
      assert.ok(err, `${rel}: TRUNCATE CASCADE succeeded -- the guard did not fire`);
      assert.equal(err.code, "CLR08", `${rel}: expected the no-truncate guard's CLR08`);
    }
    // And the plain form on a relation NOTHING references, so the CASCADE above cannot be
    // hiding a guard that only ever fires on a cascaded child.
    const plain = await truncateGuardError(
      `set role ${ROLES.fnOwner}; truncate clara.tax_thresholds`);
    assert.ok(plain, "a plain TRUNCATE of tax_thresholds succeeded -- the guard did not fire");
    assert.equal(plain.code, "CLR08");
  });

// ---------------------------------------------------------------------------------------
// H · THE DELIBERATE ABSENCES. Each is a zero COUNT, and each carries a positive control: an
// instrument that has only ever returned zero has not been shown able to return one.
// ---------------------------------------------------------------------------------------

test("ft3-H1 · the five deliberate absences are absent, and the instrument that says so DOES "
  + "flip to one when a row is injected in a rolled-back transaction", async (t) => {
    if (gate(t)) return;
    const probes = [
      ["ICT accelerated capital allowance (survey U1: the gazette P.U.(A) 328/2024 was unreadable at an official source)",
       "select count(*)::int n from clara.capital_allowance_rates where ca_class ilike '%ict%'",
       `insert into clara.capital_allowance_rates (ca_class, ya_from, ia_bp, aa_bp, authority_id, valid_through, seeded_in_migration)
        select 'ict_equipment', 2099, 4000, 2000, id, '2026-12-31', 'rig_probe' from clara.tax_authorities limit 1`],
      ["sva_annual_cap (survey U2: PR 3/2021 unfetched)",
       "select count(*)::int n from clara.tax_thresholds where key = 'sva_annual_cap'",
       `insert into clara.tax_thresholds (ya, key, value_cents, authority_id, valid_through, seeded_in_migration)
        select 2099, 'sva_annual_cap', 2000000, id, '2026-12-31', 'rig_probe' from clara.tax_authorities limit 1`],
      ["exclude-direction codes (no official-source read of s.108 or Schedule 6 grounds one yet)",
       "select count(*)::int n from clara.tax_treatment_codes where direction = 'exclude'",
       `insert into clara.tax_treatment_codes (code, direction, fraction_bp, regime, statutory_ref, effective_ya_from, authority_id, valid_through, seeded_in_migration)
        select 'X_FT3_PROBE_EXCLUDE', 'exclude', 10000, 'all', 'probe', 2099, id, '2026-12-31', 'rig_probe' from clara.tax_authorities limit 1`],
      ["individual rate bands (v1 computes no individual entity charge: R9-R12 refuse entity_transparent_no_entity_charge)",
       "select count(*)::int n from clara.tax_rate_bands where regime like 'individual%'",
       `insert into clara.tax_rate_bands (regime, ya, band_lower_cents, band_upper_cents, rate_bp, authority_id, valid_through, seeded_in_migration)
        select 'individual_resident', 2099, 0, 500000, 0, id, '2026-12-31', 'rig_probe' from clara.tax_authorities limit 1`],
      ["a YA2023 msmc_foreign_holding_max_bp row (the >20% test is effective FROM YA2024)",
       "select count(*)::int n from clara.tax_thresholds where key = 'msmc_foreign_holding_max_bp' and ya = 2023",
       `insert into clara.tax_thresholds (ya, key, value_bp, authority_id, valid_through, seeded_in_migration)
        select 2023, 'msmc_foreign_holding_max_bp', 2000, id, '2026-12-31', 'rig_probe' from clara.tax_authorities limit 1`],
    ];
    for (const [label, count, inject] of probes) {
      const before0 = await rootQuery(count);
      assert.equal(before0.rows[0].n, 0, `${label}: must be absent`);
      await inRolledBackTx(async (c) => {
        await c.query(`set role ${ROLES.fnOwner}`);
        await c.query(inject);
        const during = await c.query(count);
        assert.equal(during.rows[0].n, 1,
          `${label}: the census instrument DOES flip to one -- so the zero above is a measurement, not a broken query`);
      });
      const after0 = await rootQuery(count);
      assert.equal(after0.rows[0].n, 0, `${label}: the probe row did not survive the cell`);
    }
  });

test("ft3-G5 · ARM ZERO: the shared guard attached WITHOUT a mutable-column allowlist refuses "
  + "outright rather than passing everything -- `to_jsonb(new) - NULL::text[]` is NULL and "
  + "`NULL is distinct from NULL` is FALSE, so a forgotten argument would be an open door drawn "
  + "as a wall (law 68). The DIFFERENTIAL is the point: the same update succeeds once the "
  + "correctly-attached trigger is back", async (t) => {
    if (gate(t)) return;
    const id = (await insertLawRow("tax_authorities", authorityRow())).rows[0].id;
    const succ = (await insertLawRow("tax_authorities", authorityRow())).rows[0].id;

    await inRolledBackTx(async (c) => {
      await c.query(`set role ${ROLES.fnOwner}`);
      // Re-attach with NO argument -- the exact mistake a seventh table would make.
      await c.query("drop trigger t_tax_authorities_immutable on clara.tax_authorities");
      await c.query(`create trigger t_tax_authorities_immutable before update
                       on clara.tax_authorities for each row
                       execute function clara._tf_ft3_law_row_immutable()`);
      await assert.rejects(
        () => c.query(`update clara.tax_authorities set superseded_by = $1,
                         superseded_at = now() where id = $2`, [succ, id]),
        (err) => {
          assert.equal(err.code, "CLR10");
          assert.match(err.message, /no mutable-column allowlist/);
          return true;
        },
        "an unconfigured guard must refuse, not wave a LAWFUL update through");
    });

    const ok = await roleQuery(ROLES.fnOwner,
      `update clara.tax_authorities set superseded_by = $1, superseded_at = now()
        where id = $2 returning superseded_by`, [succ, id]);
    assert.equal(ok.rows[0].superseded_by, succ,
      "the real trigger admits that same stamp -- so ARM ZERO refused the missing ARGUMENT, not the update");
  });

test("ft3-H2 · 裁-33: not one of the six relations carries a lifecycle-state column, so nothing "
  + "this PR builds presumes an issued state exists -- a column CENSUS, never the absence of a "
  + "state machine, and the same census DOES find one on clara.report_runs", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select c.relname, a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid
        where a.attrelid = any (select ('clara.' || x)::regclass from unnest($1::text[]) x)
          and a.attnum > 0 and not a.attisdropped and a.attname = any ($2)
        order by c.relname, a.attname`, [RELATIONS, LIFECYCLE_COLUMNS]);
    assert.deepEqual(r.rows, [],
      "no status / state / lifecycle_state / issue_mode / issued_at / issued_by column on any F-T3 platform relation");

    // Positive control. clara.report_runs is the Wave-E relation that genuinely carries the
    // `issued` lifecycle 裁-33 rules F-T3 must never drive; the SAME query answers YES there.
    // A census that has only ever said NO has not been shown able to say YES.
    const control = await rootQuery(
      `select a.attname from pg_attribute a
        where a.attrelid = 'clara.report_runs'::regclass and a.attnum > 0
          and not a.attisdropped and a.attname = any ($1) order by a.attname`,
      [LIFECYCLE_COLUMNS]);
    assert.ok(control.rowCount > 0,
      "the same census DOES find lifecycle columns on clara.report_runs -- so the empty result above is a measurement, not a broken query");
  });

// ---------------------------------------------------------------------------------------
// I · THE SCOPE BINDING -- and an honest statement of what this PR cannot prove about it.
//
// The intended cell was an end-to-end differential: insert a clara.metric_cells row for firm B
// carrying a reason row scoped to firm A, assert CLR11; repeat with the platform row, assert
// no CLR11. MEASURED on the rig: t_scope_cell_na_reason is a CONSTRAINT trigger (AFTER INSERT,
// DEFERRABLE INITIALLY IMMEDIATE), so it fires at end of statement -- after the NOT NULL checks
// and after the internal RI_ConstraintTrigger_* FK checks, whose names sort before it. Any
// incomplete probe row dies on 23502/23503 and never reaches the wall, and a cell accepting
// those codes would be measuring the wrong instrument. Reaching it needs a COMPLETE cell, hence
// a metric_evaluation_contexts row, hence a snapshot and a producer version -- PR-6's run
// wrapper. The end-to-end arm is PR-6's C21 cell; recorded by name, not left a silent absence.
// ---------------------------------------------------------------------------------------

test("ft3-I1 · the trigger that decides a reason row's firm scope IS attached to "
  + "clara.metric_cells for the na_reason_version_id argument, read from the catalog's own "
  + "rendering (the resolved function, not a name grepped from a file) -- so the seeded rows' "
  + "firm_id NULL is bound to the wall replay P-13 measured", async (t) => {
    if (gate(t)) return;
    const r = await rootQuery(
      `select t.tgname, pg_get_triggerdef(t.oid) as def, p.oid::regprocedure::text as fn
         from pg_trigger t join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid = 'clara.metric_cells'::regclass and t.tgname = 't_scope_cell_na_reason'`);
    assert.equal(r.rowCount, 1, "the na_reason scope trigger exists on clara.metric_cells");
    assert.equal(r.rows[0].fn, "clara._tf_metric_catalog_scope()",
      "it executes the catalog-scope function itself, resolved by oid rather than by spelling");
    assert.match(r.rows[0].def, /EXECUTE FUNCTION clara\._tf_metric_catalog_scope\('na_reason_version_id'\)/,
      "and it is bound to the na_reason_version_id argument, which is the arm that reads metric_na_reason_versions.firm_id");

    // The half this PR CAN prove behaviourally: the seeded rows carry firm_id NULL, which is
    // the value that arm resolves `pf` to -- and `pf is not null` is the conjunct that makes
    // the verdict fall through for every firm (replay P-13). A firm-scoped row is admitted by
    // the same table, so NULL here is a choice, not a column that cannot hold anything else.
    const seeded = await rootQuery(
      `select count(*)::int n from clara.metric_na_reason_versions
        where firm_id is not null and reason_key = any (array['close_not_sealed', $1])`,
      ["s44_6_relief_unmodelled"]);
    assert.equal(seeded.rows[0].n, 0, "F-T3's rows are platform rows");
    const firm = await rootQuery("select id from clara.firms limit 1");
    await inRolledBackTx(async (c) => {
      await c.query(`set role ${ROLES.fnOwner}`);
      const ins = await c.query(
        `insert into clara.metric_na_reason_versions
           (firm_id, reason_key, version, cell_status, display_token, semantics, effective_from)
         values ($1, 'x_ft3_scoped_probe', 1, 'absent', '-', '{}'::jsonb, '2020-01-01')
         returning firm_id`, [firm.rows[0].id]);
      assert.equal(ins.rows[0].firm_id, firm.rows[0].id,
        "the column DOES accept a firm id -- so F-T3's NULL is a deliberate platform scope, not the only value the table allows");
    });
  });
