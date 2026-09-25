// #1047 — THE LIVE HALF: the orderings the estate already pins cannot flip between two
// collations, re-measured on whatever server the suite runs on.
//
// WHY THIS EXISTS. 0295's first cut pinned a digest over rows ordered by a plain text expression.
// Under `C` the order is by code point; under glibc's `en_US.UTF-8` punctuation carries no primary
// weight, so `taxation` sorts before `tax_liabilities` and the digest differs. It stopped the CI
// chain (run 35954298990) and would have stopped the hosted migrate. `collation-pin-scan.test.mjs`
// records every site in the estate that pins a value taken over a text-ordered aggregate; THIS
// battery proves, against live rows, that none of those orderings actually moves.
//
// THE TWO COLLATIONS. The comparator is the strongest non-C collation this server can offer, taken
// in order: the real glibc `en_US.UTF-8` where the OS has it (which is CI's own database collation
// and hosted Supabase's), otherwise an ICU collation with `ka-shifted`, which makes punctuation
// primary-ignorable exactly as glibc does. Whichever is chosen, the battery first proves it
// EXHIBITS the hazard on the 0295 audit's own worked example — a comparator that agreed with `C`
// everywhere would make every proof below vacuous.
//
// SEAMS: `pg_collation_for` (what collation an expression actually derives), and the ordering of a
// live value set under two named collations. Both are PostgreSQL's own public surface; nothing here
// reads a private helper or re-implements a comparison in JavaScript.

import test, { after } from "node:test";
import assert from "node:assert/strict";

import { asRoot, endPool } from "./rig-helpers.mjs";

after(async () => {
  await endPool();
});

/** The 0295 audit's worked example: the one family-key pair that separates the two collations. */
const HAZARD = { lower: "taxation", higher: "tax_liabilities" };

/** Candidate comparators, strongest first. Each is created in the session's temp schema. */
const CANDIDATES = [
  { label: "glibc en_US.UTF-8", ddl: `create collation pg_temp.c1047 (provider = libc, locale = 'en_US.UTF-8')` },
  { label: "glibc en_US.utf8", ddl: `create collation pg_temp.c1047 (provider = libc, locale = 'en_US.utf8')` },
  { label: "ICU en-US-u-ka-shifted", ddl: `create collation pg_temp.c1047 (provider = icu, locale = 'en-US-u-ka-shifted')` },
  { label: "ICU und-u-ka-shifted", ddl: `create collation pg_temp.c1047 (provider = icu, locale = 'und-u-ka-shifted')` },
];

/**
 * Run `fn(client, label)` on one connection that carries `pg_temp.c1047`: a collation that is NOT
 * `C` and that demonstrably reorders the 0295 pair. Everything happens inside a transaction that
 * is rolled back, so the server is left exactly as it was found.
 */
async function withComparator(fn) {
  return asRoot(async (client) => {
    await client.query("begin");
    try {
      let chosen = null;
      for (const candidate of CANDIDATES) {
        await client.query("savepoint try_collation");
        try {
          await client.query(candidate.ddl);
          const hazard = await client.query(
            `select ($1::text collate pg_temp.c1047 < $2::text collate pg_temp.c1047) as flips`,
            [HAZARD.lower, HAZARD.higher],
          );
          if (hazard.rows[0].flips) {
            chosen = candidate.label;
            break;
          }
          await client.query("rollback to savepoint try_collation");
        } catch {
          await client.query("rollback to savepoint try_collation");
        }
      }
      assert.ok(
        chosen,
        "no comparator on this server reorders the 0295 pair, so nothing below could prove anything: " +
          "neither a glibc en_US.UTF-8 locale nor an ICU ka-shifted collation could be created. " +
          "Install the locale or build PostgreSQL with ICU rather than skipping this battery.",
      );
      return await fn(client, chosen);
    } finally {
      await client.query("rollback");
    }
  });
}

test("collation-pin · the comparator is a REAL second collation: it reorders the pair 0295 was stopped by, and `C` does not", async () => {
  await withComparator(async (client, label) => {
    const r = await client.query(
      `select ($1::text collate pg_temp.c1047 < $2::text collate pg_temp.c1047) as under_comparator,
              ($1::text collate "C"          < $2::text collate "C")          as under_c`,
      [HAZARD.lower, HAZARD.higher],
    );
    assert.equal(r.rows[0].under_comparator, true, `${label}: 'taxation' sorts BEFORE 'tax_liabilities' — the hazard`);
    assert.equal(r.rows[0].under_c, false, "under C the underscore (0x5F) sorts before 'a', so the pair is the other way round");
  });
});

test("collation-pin · a catalog `name` cannot move, and PostgreSQL says so — the type argument every recorded site leans on", async () => {
  await asRoot(async (client) => {
    const types = await client.query(`
      select (select collname from pg_collation
               where oid = (select typcollation from pg_type
                             where typname = 'name' and typnamespace = 'pg_catalog'::regnamespace)) as name_collation,
             (select format_type(t.typbasetype, t.typtypmod) from pg_type t
               join pg_namespace n on n.oid = t.typnamespace
              where n.nspname = 'information_schema' and t.typname = 'sql_identifier') as sql_identifier_is,
             (select format_type(t.typbasetype, t.typtypmod) from pg_type t
               join pg_namespace n on n.oid = t.typnamespace
              where n.nspname = 'information_schema' and t.typname = 'character_data') as character_data_is`);
    const t = types.rows[0];
    assert.equal(t.name_collation, "C", "the `name` type's own collation is C, so `order by proname` is by code point everywhere");
    assert.equal(t.sql_identifier_is, "name", "information_schema's grantee / table_name / column_name ARE `name`");
    assert.equal(t.character_data_is, "character varying", "…but privilege_type is character_data, which is NOT — this is the difference the fixes turn on");

    // The derivation, measured on the estate's own expression shapes rather than reasoned about.
    // `pg_collation_for` is PostgreSQL's own answer to "which collation would ORDER BY use here".
    const derived = await client.query(`
      select pg_collation_for(p.proname) as bare_name,
             pg_collation_for(p.proname::text) as name_cast_to_text,
             pg_collation_for(p.proname || '=' || coalesce((select string_agg(a::text, ',') from unnest(p.proacl) a), '(null)')) as name_concatenated,
             pg_collation_for(pg_get_userbyid(p.proowner)) as userbyid,
             pg_collation_for(case when p.oid = 0 then 'PUBLIC' else pg_get_userbyid(p.proowner) end) as case_with_literal,
             pg_collation_for(coalesce(pg_get_userbyid(p.proowner), 'PUBLIC')) as coalesced,
             pg_collation_for(p.oid::regprocedure::text) as regprocedure_text,
             pg_collation_for((select a::text from unnest(p.proacl) a limit 1)) as aclitem_text
        from pg_proc p where p.oid = 'clara.accept_invite(text,text,text)'::regprocedure`);
    const d = derived.rows[0];
    // The five shapes the record calls "name-derived" (0020:2304, 0038:8329, 0106:2111, 0162:504,
    // 0190:347, and their battery twins). A `name` in the expression wins over the default.
    assert.equal(d.bare_name, '"C"');
    assert.equal(d.name_cast_to_text, '"C"', "a cast does NOT drop the collation — this is why proname::text censuses are safe");
    assert.equal(d.name_concatenated, '"C"', "0020:2304's `proname || '=' || <acl text>` derives C, which is why its pin is portable");
    assert.equal(d.userbyid, '"C"', "pg_get_userbyid returns `name`");
    assert.equal(d.case_with_literal, '"C"', "0106:2111's CASE over pg_get_userbyid and a literal derives C");
    assert.equal(d.coalesced, '"C"', "0162:504 / 0190:347's coalesce(rolname, 'PUBLIC') derives C");
    // …and the two shapes that do NOT, which is exactly the set the record has to prove by value.
    assert.equal(d.regprocedure_text, '"default"', "a reg* cast to text takes the DATABASE collation");
    assert.equal(d.aclitem_text, '"default"', "aclitem::text takes the DATABASE collation");
  });
});

// ---------------------------------------------------------------------------------------------
// The per-site proof. One row per recorded site whose ORDER BY key derives the DATABASE collation
// (the cell above proves which shapes those are): the value set that site actually sorts, taken
// from the live catalog or the seeded rows with the site's own filter, ordered twice.
//
// `grp` widens a site's proof rather than narrowing it: where a site sorts one object's grantees,
// the query returns every object's and the orders are compared WITHIN each group, so the proof
// covers every sibling the same census could be pointed at.
// ---------------------------------------------------------------------------------------------

/** @type {Array<{ site: string, sql: string, min: number }>} */
const PINNED_VALUE_SETS = [
  {
    site: "0103:1119 — the receipt-source shim census (`item`)",
    sql: "select item as v, '' as grp from clara.agent_receipt_source_census()",
    min: 7,
  },
  {
    site: "0150:1706 — each coa_template relation's non-owner ACL (`grantee::regrole::text, privilege_type`)",
    sql: `select c.relname::text as grp, g.grantee::regrole::text || ':' || g.privilege_type as v
            from pg_class c, aclexplode(c.relacl) g
           where c.relnamespace = 'clara'::regnamespace and c.relname like 'coa_template%'
             and g.grantee::regrole::text <> 'clara_fn_owner'`,
    min: 3,
  },
  {
    site: "0150:1842 — every clara door's EXECUTE grantees (`grantee::regrole::text`)",
    sql: `select p.oid::regprocedure::text as grp, g.grantee::regrole::text as v
            from pg_proc p, aclexplode(p.proacl) g
           where p.pronamespace = 'clara'::regnamespace and g.privilege_type = 'EXECUTE'`,
    min: 100,
  },
  {
    site: "0150:1926 — the family inclusion census (`t.inclusion`)",
    sql: "select distinct inclusion as v, '' as grp from clara.coa_template_families",
    min: 2,
  },
  {
    site: "0150:1961 and 0295:656 — the special-marker census (`special_acc_type`)",
    sql: `select special_acc_type || '=' || account_code as v, template_id::text as grp
            from clara.coa_template_accounts where special_acc_type is not null`,
    min: 5,
  },
  {
    site: "0150:1971 — the add-back leaf set (`add_back_class`)",
    sql: "select distinct add_back_class as v, '' as grp from clara.coa_template_accounts where add_back_class is not null",
    min: 10,
  },
  {
    site: "0150:1981 — the seeded account codes (`account_code`)",
    sql: "select distinct account_code as v, '' as grp from clara.coa_template_accounts",
    min: 100,
  },
  {
    site: "0150:2058 — the entity-keyed family census (`f.family_key`)",
    sql: `select f.family_key || '->' || array_to_string(f.entity_types, '+') as v, f.template_id::text as grp
            from clara.coa_template_families f where f.entity_types <> '{}'`,
    min: 8,
  },
  {
    site: "0215:1375, 0269:141/381, 0270:190/535, and their battery twins — the SQL privilege names (`privilege_type`)",
    sql: `select distinct privilege_type::text as v, '' as grp from information_schema.table_privileges
          union select distinct privilege_type::text, '' from information_schema.routine_privileges`,
    min: 5,
  },
  {
    site: "0218:1154 — the firm-defaultable setup keys (`item_key`)",
    sql: "select item_key || '->' || knowledge_key as v, '' as grp from clara.firm_setup_keys where knowledge_key is not null",
    min: 3,
  },
  {
    site: "0219:638/648/659 — each clara function's aclitem text (`a::text`)",
    sql: `select p.oid::regprocedure::text as grp, a::text as v
            from pg_proc p, unnest(p.proacl) a where p.pronamespace = 'clara'::regnamespace`,
    min: 100,
  },
  {
    // NOT widened to every relation, and the reason is worth keeping: clara.bank_accounts' five
    // index names DO move — `uq_bank_accounts_id_firm_client` and `uq_bank_accounts_identity_active`
    // swap, because `_` sorts before `e` under C and carries no primary weight under the
    // comparator. No census pins that relation's index names today, which is precisely the
    // "portable by luck, fragile by construction" finding of the 0295 audit; the site that DOES
    // pin index names reads firm_admissions, and that is what this entry proves.
    site: "tests/checkout-gate-c1:498 — clara.firm_admissions' index names (`indexrelid::regclass::text`)",
    sql: `select 'firm_admissions' as grp, i.indexrelid::regclass::text as v
            from pg_index i where i.indrelid = 'clara.firm_admissions'::regclass`,
    min: 2,
  },
  {
    site: "tests/checkout-gate-c2, checkout-convergence, checkout-gate-c6 — each door's signatures (`oid::regprocedure::text`)",
    sql: `select p.proname::text as grp, p.oid::regprocedure::text as v
            from pg_proc p where p.pronamespace = 'clara'::regnamespace`,
    min: 1000,
  },
];

test("collation-pin · every recorded site's OWN value set sorts identically under both collations", async () => {
  await withComparator(async (client, label) => {
    for (const entry of PINNED_VALUE_SETS) {
      const measured = await client.query(`
        with s as (${entry.sql}),
             per_group as (
               select grp,
                      array_agg(v order by v collate "C")             as under_c,
                      array_agg(v order by v collate pg_temp.c1047)   as under_comparator,
                      array_agg(v order by v)                         as under_default
                 from s group by grp)
        select count(*)::int                                            as groups,
               (select count(*)::int from s)                            as rows,
               coalesce(bool_and(under_c = under_comparator), false)     as agree,
               coalesce(bool_and(under_c = under_default), false)        as default_is_c,
               coalesce((array_agg(grp) filter (where under_c <> under_comparator))[1], '') as first_bad
          from per_group`);
      const m = measured.rows[0];
      assert.ok(m.rows >= entry.min, `${entry.site}: the value set is present (${m.rows} rows, at least ${entry.min} expected) — an empty set would prove nothing`);
      assert.equal(
        m.agree,
        true,
        `${entry.site}: the order MOVES between C and ${label}${m.first_bad ? ` (first group: ${m.first_bad})` : ""}. ` +
          "This site's pin is not portable: it needs a forward re-pin that spells `collate \"C\"`.",
      );
      assert.equal(
        m.default_is_c,
        true,
        `${entry.site}: this server's DEFAULT ordering already differs from C, so the pinned literal was taken under a third order.`,
      );
    }
  });
});

test("collation-pin · POSITIVE CONTROL: the same instrument RED on a value set that does move", async () => {
  // The 0295 pair, run through exactly the comparison the cell above makes. If this came back
  // `true`, every proof above would be an assertion about nothing.
  await withComparator(async (client) => {
    const r = await client.query(`
      with s as (select unnest(array['system_roles','taxation','tax_liabilities','trade_payables']) as v)
      select (array_agg(v order by v collate "C") = array_agg(v order by v collate pg_temp.c1047)) as agree,
             array_to_string(array_agg(v order by v collate "C"), ',') as c_order,
             array_to_string(array_agg(v order by v collate pg_temp.c1047), ',') as comparator_order
        from s`);
    assert.equal(r.rows[0].agree, false, "the instrument must be able to fail");
    assert.equal(r.rows[0].c_order, "system_roles,tax_liabilities,taxation,trade_payables", "C sorts the underscore first");
    assert.equal(r.rows[0].comparator_order, "system_roles,taxation,tax_liabilities,trade_payables", "the comparator gives the underscore no primary weight — 0295's own worked example");
  });
});

// ---------------------------------------------------------------------------------------------
// THE RE-PINNED SITE (#1047's acceptance criterion 2). 0295 is the one site in the estate that was
// already re-pinned for this defect: its `c_v1_struct_pin` is 0150's own canonical jsonb with
// `collate "C"` written onto both ORDER BYs. This cell recomputes that digest here and shows two
// things — it still reproduces from v1's rows, and the `collate "C"` is load-bearing rather than
// decorative, because removing it moves the value on a server whose collation is not C.
// ---------------------------------------------------------------------------------------------

/** 0295:238, measured on a C.UTF-8 and an en_US.UTF-8 cluster when the pre-step landed. */
const V1_STRUCT_PIN = "d02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df";

/** 0295:199-219, field for field — with the ordering collation left as a parameter. */
const structuralDigest = (orderedBy) => `
  select encode(clara._hash(jsonb_build_object(
    'families', coalesce((
      select jsonb_agg(jsonb_build_object(
               'family_key', f.family_key, 'label', f.label, 'inclusion', f.inclusion,
               'basis', f.basis, 'sort_ordinal', f.sort_ordinal,
               'msic_sections', to_jsonb(f.msic_sections),
               'msic_divisions', to_jsonb(f.msic_divisions),
               'msic_edition', f.msic_edition,
               'trade_natures', to_jsonb(f.trade_natures),
               'entity_types', to_jsonb(f.entity_types)) order by f.family_key collate ${orderedBy})
        from clara.coa_template_families f where f.template_id = t.id), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_code', a.account_code, 'name', a.name,
               'account_type', a.account_type, 'account_class', a.account_class,
               'special_acc_type', a.special_acc_type, 'family_key', a.family_key,
               'sort_ordinal', a.sort_ordinal,
               'tax_sensitive', a.tax_sensitive, 'add_back_class', a.add_back_class,
               'statutory', a.statutory) order by a.account_code collate ${orderedBy})
        from clara.coa_template_accounts a where a.template_id = t.id), '[]'::jsonb))), 'hex') as digest
    from clara.coa_templates t
   where t.scope = 'platform' and t.template_key = 'my_sme_starter' and t.version = 1`;

test("collation-pin · 0295's re-pinned digest reproduces, and its `collate \"C\"` is what makes it reproduce", async () => {
  await withComparator(async (client, label) => {
    const collated = await client.query(structuralDigest('"C"'));
    assert.equal(collated.rowCount, 1, "my_sme_starter v1 is present — an absent template would make this cell vacuous");
    assert.equal(
      collated.rows[0].digest,
      V1_STRUCT_PIN,
      "0295's structural digest no longer reproduces from v1's rows: either the rows moved or the canonical form did",
    );

    // The counterfactual, which is the whole of #1047 in one comparison: the SAME canonical form
    // with the ordering taken under a non-C collation. 0295's first cut pinned exactly this value
    // and stopped the CI chain with it.
    const uncollated = await client.query(structuralDigest("pg_temp.c1047"));
    assert.notEqual(
      uncollated.rows[0].digest,
      V1_STRUCT_PIN,
      `under ${label} the same content digests differently — which is why the ORDER BY must spell collate "C" before the value is pinned`,
    );
  });
});
