-- UNNUMBERED_f_t3_pr_1_tax_platform.sql -- F-T3 PR-1: the six PLATFORM-scoped tax-law
-- relations, the developer-seeded law that fills them, the refusal-reason vocabulary the
-- whole F-T3 ladder persists through, and the COA template's add_back_class -> treatment-code
-- mapping table.
--
-- MIGRATION NUMBER: DELIBERATELY UNCLAIMED (standing law, AGENTS.md constraint 10 --
-- "numbers are claimed at MERGE time, not at authoring"). This file ships as
-- UNNUMBERED_* and is renamed to its claimed number in the merge commit. Every internal
-- self-reference uses the STABLE STEM `f_t3_pr_1_tax_platform` (the seeded_in_migration
-- column below), never a number, so the rename moves nothing.
--
-- DESIGN OF RECORD, in precedence order:
--   1. docs/plan/active/tax-computation-pr0-replay-2026-08-29.md  -- the MEASURED ground.
--      Its section 3 carries eleven design deltas; where it and the design text differ, it
--      wins. This file builds to the replay, and carries the v1.3 doc bump in the same PR.
--   2. docs/plan/active/tax-computation-design.md (v1.3) sections 2, 4, 4.6
--      + tax-computation-design-part2.md sections 9, 11
--      + tax-computation-annexes-2-mechanics.md M2 (surface DDL) and M4 (tenancy/RLS)
--      + tax-computation-gate-record.md
--   3. docs/plan/active/tax-computation-survey.md section 6.2 (the law, verbatim-grounded,
--      re-fetched 2026-08-23) and section 6.3 (the honest unverified list, U1-U8)
--   4. docs/plan/research/coa-template-2026-08-29.json (裁-21) -- the twelve leaf
--      add_back_class values this file maps, and their citation corrections.
--
-- WHAT THIS FILE IS NOT. It registers NO evaluator (that is PR-6), builds NO governed door
-- (R-L25 -- PR-1 is developer-seeded law only), replaces NO live function body, and adds NO
-- clara_authenticated grant. It creates six new relations and one new trigger function, and
-- seeds rows into them plus clara.metric_na_reason_versions.
--
-- =====================================================================================
-- DEPARTURES REGISTER -- every place this file's built shape diverges from the design set's
-- own text, in ONE place, so an auditor finds every delta here rather than diffing prose.
-- =====================================================================================
-- (1) owner_signed_by / owner_signed_at are NULLABLE, not NOT NULL. Mechanics M2 writes
--     "owner_signed_by NOT NULL, owner_signed_at NOT NULL" on tax_treatment_codes; the
--     replay's OWNER CARD D.2 (OQ-7) rules the fail-closed default in the opposite
--     direction -- "PR-1 seeds the code rows UNSIGNED and every treatment refuses
--     treatment_code_unsigned". Both cannot hold: a NOT NULL column cannot carry an unsigned
--     row. The OPERATIVE half is the behaviour (seed unsigned, refuse by name), because it
--     is the half the owner question actually answers, so the column is nullable and the
--     wall moves from the constraint to the named refusal plus:
--       * ck_*_signature_paired -- a half-signature (one of the pair) is malformed;
--       * the one-way-once signature arm in clara._tf_ft3_law_row_immutable() -- an unsigned
--         row may be signed exactly once, a signed row can never be re-signed or un-signed.
--     Seeded row count with a signature TODAY: zero, proven positively in the tail.
-- (2) tax_thresholds carries a THIRD value column, value_int. M2's column list is
--     "(ya, key, value_cents NULL, value_bp NULL, ...) with a CHECK that exactly one value
--     column is non-null", but M2's own seeded-key list ends with `loss_carry_forward_years
--     10` -- a COUNT OF YEARS, which is neither money nor a rate. Storing 10 as
--     value_cents (RM0.10) or value_bp (0.1%) would be a lie in the column's own units.
-- (3) tax_treatment_codes.direction carries a FIFTH member, 'refuse', paired with a
--     refusal_reason_key. Design section 2 lists four (add_back|deduct|allowable|exclude),
--     all of which mean "apply fraction_bp to the movement". The replay's OWNER CARD D.5
--     (OQ-11) measured that an approved-institution donation is an s.44(6) DEDUCTION capped
--     at 10% of aggregate income -- a figure that does not exist until R7 -- and that
--     `fraction_bp x movement` structurally cannot express it. Its fail-closed default (a)
--     is "refuses by name (s44_6_relief_unmodelled) and the human keys it", and its own
--     words are that option (c), a flat 100% add-back, "must never be the default -- it is
--     the only option that produces a wrong number silently". A refuse code carries NO
--     fraction (fraction_bp IS NULL, enforced) so there is no numeral to apply.
-- (4) tax_treatment_codes carries requires_apportionment boolean. The COA dossier's
--     `motor_running_costs` family is apportioned business:private per vehicle; with
--     fraction_bp = 10000 and design section 2's rule `code.fraction_bp *
--     COALESCE(apportionment_bp, 10000) / 10000`, an ABSENT human apportionment silently
--     yields a 100% add-back and OVERSTATES the charge. The flag is what lets PR-2 refuse
--     `mixed_account_needs_split` (part 2 section 9's own worked example is literally "a
--     motor-expenses account holding both commercial fuel and private petrol") instead of
--     defaulting. PR-2 OWES that branch; this file only records the fact on the row.
-- (4b) OBLIGATION HANDED TO PR-2, stated here because this file creates the hazard and PR-2
--     is where it becomes a wrong number. `ADDBACK_MOTOR_RUNNING_PRIVATE_PORTION` seeds
--     `fraction_bp = 10000` WITH `requires_apportionment = true`. Design section 2's evaluator
--     rule is `code.fraction_bp * COALESCE(apportionment_bp, 10000) / 10000`, so an evaluator
--     that reads the fraction and ignores the flag adds back **100% of a mixed-use vehicle's
--     running costs** whenever the human has not keyed a percentage -- silently, with no
--     refusal, on every client that owns a car. That is this PR's single largest
--     silent-overstatement path. **PR-2 MUST branch on `requires_apportionment` BEFORE the
--     COALESCE and refuse `mixed_account_needs_split` when `apportionment_bp` is null**, never
--     fall through to the default. The flag exists only to make that branch possible; it
--     enforces nothing by itself, and this file cannot enforce it from here.
--
-- (5) clara.tax_add_back_class_map is a SIXTH platform relation the design set never named.
--     Conductor's assignment, recorded at replay section 5: the COA template stores the
--     citation-backed HINT (`add_back_class`) on a template account; F-T3 owns the map from
--     that hint to its own code vocabulary, because "the naming conventions differ ... so a
--     mapping table is needed either way". The map is a PROPOSAL SOURCE, never a fact: a
--     treatment becomes fact only through PR-4's per-client human approve door.
-- (6) tax_authorities carries evidence_grade + conflict TEXT (0139's own `conflict` column is
--     BOOLEAN). A boolean can say two sources disagree; it cannot say WHICH reading this row
--     took. Three of this file's citations carry a measured, named disagreement (see the
--     CITATION CONFLICTS block below), and a reviewer who cannot read the disagreement in the
--     row has to rediscover it.
-- (7) DELIBERATE ABSENCES, five, each refusing by name rather than computing (R-L25's posture
--     -- "that is the design working, not failing"). Every one is proven by COUNT in the
--     tail, never asserted by comment:
--       (a) the ICT 40/20 capital-allowance class (P.U.(A) 328/2024) -- survey U1, the
--           gazette was unreadable at an official source; an asset resolving to it returns
--           rate_row_missing_for_ya.
--       (b) tax_thresholds key `sva_annual_cap` -- survey U2, PR 3/2021 unfetched.
--       (c) the two EXCLUDE_* codes design section 2 works as examples
--           (EXCLUDE_CAPITAL_GAIN_100, EXCLUDE_EXEMPT_DIVIDEND_100). The COA dossier carries
--           NO exclude-direction family at all (replay section 5), and the survey's own
--           2026-08-23 official-source pass never read s.108 or Schedule 6 para 12B. Seeding
--           a citation nobody has read is precisely the failure design section 2 exists to
--           make structurally impossible. They seed the day the section is read.
--       (d) the two individual rate-band regimes. v1 computes no individual entity charge:
--           part 2 section 8 refuses R9-R12 for a transparent entity by name
--           (entity_transparent_no_entity_charge) and stops at statutory/total income, so a
--           seeded individual band would be a row no rung can lawfully read.
--       (e) capital_allowance_rates before YA2023. L6 states the three rates without a start
--           year; inferring one would be a claim about history nobody measured. Earlier YAs
--           refuse by name.
-- (8) The reason-row seed is TWENTY-FOUR rows, not the twenty-two the replay's build brief
--     names. Twenty-two are the closed ladder vocabulary (part 2 section 9's twenty-one plus
--     delta D-9's close_snapshot_missing_pl_rows) and are asserted as a closed set. The other
--     two are RULING rows, each seeded and counted separately so the closed set stays closed,
--     and each retiring the day its ruling changes. Both exist for the same reason: part 2
--     section 9's own law is that "a string with no reason row cannot be persisted at all,
--     only raised", so a refusal named anywhere WITHOUT a reason row is exactly the defect
--     cell C21 exists to catch.
--       * `s44_6_relief_unmodelled` -- OQ-11's fail-closed default (departure 3), named by
--         the REFUSE_DONATION_S44_6 code's own refusal_reason_key column.
--       * `tax_issue_unavailable` -- 裁-33 (owner, 2026-08-29): there is NO golden bar, a tax
--         computation goes to DRAFT ONLY and is never `issued`, and PR-7 (the artifacts) is
--         not built for beta. `report_runs` KEEPS its pre-existing `issued` value -- it is
--         Wave-E's enum, shared with every report class, and narrowing it would be a
--         shared-surface change for one item's convenience (law 81) -- so the TRANSITION is
--         walled by name instead, and this row is the name. The wall itself is PR-7's, which
--         is why the string ships before the verb that raises it.
-- (9) 裁-33's other half is a PROPERTY of this file rather than a row: none of the six
--     relations carries a lifecycle-state column at all, so nothing here can presume that an
--     issued state exists. Proven positively in the tail by a column census over
--     status/state/lifecycle_state/issue_mode/issued_at/issued_by, not by the absence of a
--     state machine -- absence is not evidence.
--
-- =====================================================================================
-- CITATION CONFLICTS -- measured, carried in the rows themselves, adjudicated at signature.
-- =====================================================================================
-- Every code row seeds UNSIGNED (departure 1), and an unsigned code is unusable, so NOTHING
-- below can reach a number before a licensed tax agent reads it. That is the point: the
-- signature act (OQ-7) is where a citation is adjudicated, and these three are what that
-- reader must adjudicate.
--   C-1  DEPRECIATION. The replay (section 5, from the 裁-21 dossier) rules the citation is
--        s.39(1)(k) + Schedule 3, correcting the design's s.39(1)(c),(e). The survey's own
--        2026-08-23 read of Act 53 (L9) reports s.39(1)(k) as the MOTOR-VEHICLE RENTAL
--        restriction. Two of this repo's own research passes disagree about what (k) says.
--        This file seeds the conductor's ruling and records the disagreement on the row.
--   C-2  MOTOR QE. The dossier cites Schedule 3 para 2/2A for the RM50k/RM100k qualifying-
--        expenditure cap; the survey grounds the same cap in PR 6/2015 section (b). Both are
--        carried; neither is a number this file computes (the cap is R5's, per replay
--        section 5's "keep the two apart").
--   C-3  COMPANY RATES. LHDN's own company-rates page (L2) still showed only YA2023-2024 on
--        2026-08-23 while PR 8/2025 (L1, published 2025-12-22) states the bands as running
--        from YA2023 unchanged. The page lags; L1 is the authority the bands cite.
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: EMPTY.
-- =====================================================================================
-- Every relation and function this file installs is NEW. No live body is replaced, so no
-- in-flight PL/pgSQL call can span this migration and silently run an old body. That claim
-- is NOT left as a comment: section S0 snapshots `prosrc` PLUS every catalog attribute that
-- decides how a body executes -- language, SECURITY DEFINER, volatility, strictness,
-- leakproof, OWNER, SET config, return type/setof, argument types and the ACL -- for EVERY
-- function in schema clara before any DDL runs, and the S10 tail re-reads the whole catalog
-- and refuses if a single pre-existing one moved, if one vanished, or if anything beyond the
-- one new trigger function appeared. A whole-catalog census, not a spot check -- and
-- deliberately NOT built on `pg_get_functiondef`, which the replay MEASURED renders neither
-- the owner nor the ACL (M0 D-4), so a functiondef-based census would be blind to exactly the
-- silent change it exists to catch.
set local statement_timeout = '5min'; -- precautionary, not load-bearing: six empty tables,
  -- one trigger function, and roughly 130 seeded rows. Nothing here scans a book.

-- =====================================================================================
-- S0 -- PRESTATE. Every claim this file makes about the frontier it lands on, measured, with
-- an abort on any false premise. The relation/verb freedom below was measured at PR-0's
-- replay against main = 7e9180df; this re-measures it at apply time, because the frontier
-- moves under a branch.
-- =====================================================================================
-- THE D1 INSTRUMENT, and why it is NOT pg_get_functiondef. The replay MEASURED (M0 D-4) that
-- `pg_get_functiondef` renders body, language, volatility, SECURITY DEFINER, strictness,
-- cost/rows and SET config -- but NOT the owner and NOT the ACL: an `alter function … owner
-- to` leaves its hash unchanged. A D1 census built on it would therefore be blind to exactly
-- the class of silent change it exists to catch. This snapshots `prosrc` (the body an
-- in-flight PL/pgSQL call actually runs -- the thing the D1 obligation is about) PLUS every
-- catalog attribute that decides how that body executes, INCLUDING the two functiondef drops.
-- It is also, incidentally, the shape the wiki dynamic-SQL gate can prove non-wiki: a
-- `pg_get_functiondef` read outside that gate's one exempt statement grammar is an
-- unattributed change-of-record patch site and fails closed, correctly.
create temp table _ft3_pr1_pre_fn on commit drop as
  select p.oid,
         md5(p.prosrc)          as src_md5,
         p.prolang, p.prosecdef, p.provolatile, p.proisstrict, p.proleakproof,
         p.proowner, p.proconfig, p.prorettype, p.proretset,
         p.proargtypes::text    as argtypes,
         p.proacl::text         as acl
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f';

do $s0$
declare
  v_name  text;
  v_n     int;
  v_def   text;
  -- The THIRTEEN relation names the design set reserves for F-T3, plus the mapping table
  -- this PR mints (departure 5). All fourteen must be free: a name already taken means some
  -- other lane built something under it and this file's whole surface is a wrong premise.
  v_relations constant text[] := array[
    'tax_authorities', 'tax_treatment_codes', 'tax_rate_bands', 'capital_allowance_rates',
    'tax_thresholds', 'tax_account_treatments', 'tax_entry_treatments', 'tax_basis_periods',
    'client_tax_attributes', 'ca_asset_years', 'cp204_filings', 'tax_carryforwards',
    'tax_form_field_map', 'tax_add_back_class_map'
  ];
  -- The ELEVEN verb names F-T3 reserves: three wake wrappers (M1.1), their three ungranted
  -- cores, and the five human doors (M1.3). None is built here; all must still be free, for
  -- the same reason.
  v_verbs constant text[] := array[
    'wake_propose_tax_treatment', 'wake_run_tax_computation', 'wake_raise_law_review_due',
    '_ft3_propose_tax_treatment_core', '_ft3_run_tax_computation_core',
    '_ft3_law_review_due_core', 'approve_tax_treatment', 'record_client_tax_attribute',
    'record_tax_carryforward', 'record_cp204_filing', 'publish_tax_form_field_map'
  ];
  -- The twenty-three reason keys this file seeds. None may pre-exist: a key already present
  -- means another lane owns that string and this file would be minting a second meaning for
  -- it (law 81's two mutually-unaware paths, on a refusal a human reads).
  v_reason_keys constant text[] := array[
    'close_not_sealed', 'basis_period_undetermined',
    'basis_period_not_coextensive_with_close', 'account_untreated', 'treatment_unapproved',
    'treatment_code_unsigned', 'treatment_on_non_pl_account', 'rate_row_missing_for_ya',
    'ca_class_unassigned', 'disposal_value_not_established', 'sme_facts_missing',
    'business_source_count_unknown', 'multiple_business_sources_unmodelled',
    'losses_brought_forward_unknown', 'loss_relief_rules_unread',
    'entity_transparent_no_entity_charge', 'prior_estimate_unknown', 'citation_missing',
    'entity_identifier_missing', 'mixed_account_needs_split', 'form_version_superseded',
    'close_snapshot_missing_pl_rows', 's44_6_relief_unmodelled', 'tax_issue_unavailable'
  ];
  -- The NINE Wave-E keys this file seeds alongside and must not disturb. Named here so the
  -- prestate can scope its premise to them rather than counting the whole shared catalog.
  v_wave_e_reasons constant text[] := array[
    'divide_by_zero', 'negative_denominator', 'absent', 'prior_period_absent',
    'account_set_drift', 'account_set_resolution_absent', 'account_set_resolution_ambiguous',
    'account_set_expansion', 'sign_presentation_mismatch'
  ];
begin
  -- The freedom net must cover EVERY key S9.7 seeds, or a key minted by another lane between
  -- now and then lands as a duplicate meaning without the net noticing. 24, not 23: the count
  -- is asserted here rather than trusted, because the net and the seed are 900 lines apart.
  if cardinality(v_reason_keys) <> 24 then
    raise exception 'S0: the reason-key freedom net lists % keys, but S9.7 seeds 24 (22 ladder + OQ-11 + 裁-33)', cardinality(v_reason_keys)
      using errcode = 'CLR10';
  end if;
  -- (1) All fourteen relation names are free.
  foreach v_name in array v_relations loop
    if to_regclass('clara.' || v_name) is not null then
      raise exception 'S0: clara.% already exists -- F-T3 PR-1 refuses to build onto a taken name', v_name
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (2) All eleven verb names are free, by NAME (not signature): F-T3 owns the name, so any
  --     overload under it is a collision, not a coexistence.
  foreach v_name in array v_verbs loop
    select count(*) into v_n from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = v_name;
    if v_n <> 0 then
      raise exception 'S0: clara.% already exists (% overload(s)) -- F-T3 reserves this verb name', v_name, v_n
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (3) The generic append-only / no-truncate trigger helpers exist at their pinned
  --     signatures. This file REUSES them rather than minting a seventh pair (law 81).
  if to_regprocedure('clara._tf_append_only()') is null
     or to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception 'S0: a required generic trigger helper (_tf_append_only / _tf_no_truncate) is missing at its pinned signature'
      using errcode = 'CLR10';
  end if;

  -- (4) clara.users exists and its primary key is (id) -- the target of every
  --     owner_signed_by FK below.
  if to_regclass('clara.users') is null then
    raise exception 'S0: clara.users is missing' using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid = 'clara.users'::regclass and con.contype = 'p';
  if v_def is distinct from 'PRIMARY KEY (id)' then
    raise exception 'S0: clara.users primary key is % -- expected PRIMARY KEY (id)', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;

  -- (5) clara.metric_na_reason_versions is the shape this file seeds into.
  --
  --     SCOPED, NOT COUNTED -- and this is a FIX, not a preference. The first cut of this
  --     prestate asserted `count(*) = 9` over the whole table plus `count(*) where firm_id is
  --     not null = 0`. Both are totals over a SHARED, append-only estate catalog this file does
  --     not own, and both were MEASURED to abort the migration over rows that are perfectly
  --     lawful and none of its business: a later platform VERSION of a Wave-E key (the tail
  --     below and cell ft3-D4 both explicitly call that "that lane's business"), or any
  --     firm-scoped reason row (cell ft3-I1 proves the column takes one). The identical defect
  --     was found and fixed in the tail first; leaving it here would have made the prestate the
  --     surviving copy of the bug -- a fix that does not sweep every instance of its own class.
  --
  --     The premise this file actually depends on is delta D-6's: the NINE Wave-E rows exist as
  --     PLATFORM VERSION-1 rows. That predicate no other lane can move -- those rows already
  --     exist, so `unique nulls not distinct (firm_id, reason_key, version)` forbids a second --
  --     which makes it the only form of the check that cannot abort a real ceremony.
  if to_regclass('clara.metric_na_reason_versions') is null then
    raise exception 'S0: clara.metric_na_reason_versions is missing -- F-T3 PR-1 has nowhere to seed its refusal vocabulary'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.metric_na_reason_versions
    where firm_id is null and version = 1 and reason_key = any (v_wave_e_reasons);
  if v_n <> 9 then
    raise exception 'S0: the 9 Wave-E platform v1 reason rows count % -- delta D-6''s premise moved', v_n
      using errcode = 'CLR10';
  end if;
  -- The by-name collision net. This is the check that actually protects F-T3: a key already
  -- present means another lane owns that string and this file would be minting a SECOND meaning
  -- for a refusal a human reads (law 81). It was UNREACHABLE behind the whole-table total above
  -- -- any pre-existing F-T3 key would have tripped the count first, with a message about the
  -- wrong thing. Cell ft3-A8 plants one and asserts THIS refusal by name.
  select count(*) into v_n from clara.metric_na_reason_versions
    where reason_key = any (v_reason_keys);
  if v_n <> 0 then
    raise exception 'S0: % of F-T3''s reason keys already exist -- another lane owns one of these strings', v_n
      using errcode = 'CLR10';
  end if;

  -- (6) The cell_status domain is the three-value set, read from the catalog. 'ok' must NOT
  --     be legal: every string this file seeds is a NON-ok status by construction, and a
  --     four-value domain would mean the mapping in part 2 section 9 was written against a
  --     different table.
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid = 'clara.metric_na_reason_versions'::regclass
      and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%cell_status%';
  if v_def is null
     or v_def not like '%''undefined''%' or v_def not like '%''absent''%'
     or v_def not like '%''refused''%' or v_def like '%''ok''%' then
    raise exception 'S0: the metric_na_reason_versions cell_status CHECK is not the measured three-value set -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;

  -- (7) The firm-scope congruence trigger's na_reason arm is present. Measured at the replay
  --     (P-13): its verdict conjunct `pf is not null` is what makes a firm_id = NULL platform
  --     reason row LAWFUL FOR EVERY FIRM, which is the shape all twenty-three rows below
  --     take. If the arm is gone, the premise this file seeds on is gone with it.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname = '_tf_metric_catalog_scope'
      and position('metric_na_reason_versions' in p.prosrc) > 0
      and position('pf is not null' in p.prosrc) > 0;
  if v_n <> 1 then
    raise exception 'S0: clara._tf_metric_catalog_scope does not carry its na_reason arm with the `pf is not null` conjunct (found % matching body/bodies)', v_n
      using errcode = 'CLR10';
  end if;

  -- (8) DELETED, deliberately: `clara.client_fact_keys holds exactly FIVE rows`.
  --     It was a tripwire for an OBSERVATION, not a premise. This file mints no fact key,
  --     never calls record_client_fact (design section 4.1, D-21/D-22) and does not read the
  --     table anywhere -- so nothing it builds depends on the count, while a SIXTH key added
  --     by any of the several estate lanes that legitimately grow that catalog would have
  --     aborted this migration, and a ceremony with it, over a row that is none of its
  --     business. Same class as the na_reason totals fixed at (5): a prestate asserts the
  --     premises this file's own correctness rests on, and nothing else. The replay's
  --     five-vs-four correction is recorded where it belongs -- the design set and PR-2's
  --     battery, which is the PR that actually reads these keys.
  --
  -- (9) clara.fixed_assets ALREADY carries its (id, firm_id, client_id) unique constraint.
  --     This is delta D-7's evidence, re-measured: mechanics M4 says "fixed_assets has no
  --     (id, firm_id, client_id) unique to bind to ... PR-3 adds uq_fa_id_tenant", and the
  --     replay HALF-REFUTED it (P-14). PR-3 must therefore NOT add that constraint. PR-1
  --     builds nothing on fixed_assets; it pins the measurement here so the delta is proven
  --     by this PR's own apply rather than only asserted in a document.
  select count(*) into v_n from pg_constraint con
    where con.conrelid = 'clara.fixed_assets'::regclass
      and con.contype = 'u'
      and con.conname = 'uq_fixed_assets_id_firm_client'
      and pg_get_constraintdef(con.oid) = 'UNIQUE (id, firm_id, client_id)';
  if v_n <> 1 then
    raise exception 'S0: uq_fixed_assets_id_firm_client UNIQUE (id, firm_id, client_id) is not present on clara.fixed_assets -- delta D-7''s premise moved; PR-3''s DDL decision must be re-taken'
      using errcode = 'CLR10';
  end if;

  raise notice 'F-T3 PR-1 S0 prestate: OK -- 14 relation names free, 11 verb names free, all 24 reason keys free by NAME, the 9 Wave-E platform v1 rows present (scoped, never a whole-table count on a shared catalog this file does not own), the 3-value cell_status domain, the catalog-scope na_reason arm with its `pf is not null` conjunct, and uq_fixed_assets_id_firm_client present (delta D-7 re-measured).';
end $s0$;

-- =====================================================================================
-- S1 -- THE SHARED IMMUTABILITY TRIGGER FUNCTION.
-- =====================================================================================
-- ONE function for all six relations rather than six near-identical ones (law 81: one
-- architecture, not two). It is table-agnostic: it reads OLD/NEW through to_jsonb and takes
-- its mutable-column allowlist from TG_ARGV[0], so it never names a column a given table may
-- not have. DELETE and TRUNCATE are NOT its business -- those ride the estate's existing
-- clara._tf_append_only() / clara._tf_no_truncate(), pinned in S0.
--
-- Three walls, in order:
--   (a) a row already superseded is immutable outright -- even a well-shaped second stamp;
--   (b) a signature is ONE-WAY-ONCE: an unsigned row may be signed, a signed row can never
--       be re-signed, re-attributed or un-signed (departure 1's replacement for NOT NULL);
--   (c) everything outside the allowlist is immutable from INSERT, and the supersession pair
--       is all-or-nothing.
set role clara_fn_owner;

create function clara._tf_ft3_law_row_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_mutable    text[] := tg_argv[0]::text[];
  v_old        jsonb  := to_jsonb(old);
  v_new        jsonb  := to_jsonb(new);
  v_old_signer text   := v_old ->> 'owner_signed_by';
  v_new_signer text   := v_new ->> 'owner_signed_by';
  v_old_at     text   := v_old ->> 'owner_signed_at';
  v_new_at     text   := v_new ->> 'owner_signed_at';
begin
  -- (a0) ARM ZERO -- the allowlist itself must exist. Without this the guard is an OPEN DOOR
  --      DRAWN AS A WALL (law 68): a trigger attached with no argument gives
  --      `v_mutable = NULL`, `to_jsonb(new) - NULL::text[]` is NULL, and
  --      `NULL is distinct from NULL` is FALSE -- so arm (c) would pass EVERY update silently.
  --      All six triggers below pass an argument, so this cannot fire today; it exists so a
  --      SEVENTH attachment that forgets one fails closed and loudly instead of quietly
  --      unlocking the table. Behavioural cell ft3-G5 attaches exactly that trigger and
  --      asserts the refusal.
  if v_mutable is null or cardinality(v_mutable) = 0 then
    raise exception 'clara._tf_ft3_law_row_immutable was attached to % with no mutable-column allowlist; refusing to run as an open door', tg_table_name
      using errcode = 'CLR10', detail = '{"reason":"ft3_guard_unconfigured"}';
  end if;

  -- (a) superseded is terminal.
  if (v_old ->> 'superseded_at') is not null or (v_old ->> 'superseded_by') is not null then
    raise exception 'a superseded % row is immutable', tg_table_name
      using errcode = 'CLR10', detail = '{"reason":"ft3_law_row_superseded"}';
  end if;

  -- (b) the signature is one-way-once. Only a table that HAS the column can trip this: on a
  --     table without it both sides read NULL and the arm is vacuously satisfied, which is
  --     why the tail below proves the arm behaviourally on a table that does have it.
  if v_old_signer is not null and (v_new_signer is distinct from v_old_signer
                                   or v_new_at is distinct from v_old_at) then
    raise exception 'an owner signature on % is one-way-once: it cannot be re-signed, re-attributed or withdrawn', tg_table_name
      using errcode = 'CLR10', detail = '{"reason":"ft3_signature_one_way_once"}';
  end if;
  if (v_new_signer is null) <> (v_new_at is null) then
    raise exception 'an owner signature on % is a PAIR: owner_signed_by and owner_signed_at are set together or not at all', tg_table_name
      using errcode = 'CLR10', detail = '{"reason":"ft3_signature_unpaired"}';
  end if;

  -- (c) everything else is immutable, and the supersession stamp is all-or-nothing.
  if (v_new - v_mutable) is distinct from (v_old - v_mutable) then
    raise exception '% admits updates only to %; every other column is immutable from INSERT (supersede instead)', tg_table_name, v_mutable::text
      using errcode = 'CLR10', detail = '{"reason":"ft3_law_row_immutable"}';
  end if;
  if ((v_new ->> 'superseded_by') is null) <> ((v_new ->> 'superseded_at') is null) then
    raise exception 'a supersession stamp on % is a PAIR: superseded_by and superseded_at are set together or not at all', tg_table_name
      using errcode = 'CLR10', detail = '{"reason":"ft3_supersession_unpaired"}';
  end if;
  return new;
end $fn$;
revoke all on function clara._tf_ft3_law_row_immutable() from public;

-- =====================================================================================
-- S2 -- clara.tax_authorities. The citation catalog (design section 4, relation 1).
-- =====================================================================================
-- PLATFORM-scoped: no firm_id, forced RLS, ONE clara_fn_owner policy, zero grants
-- (mechanics M4 class B, the llm_price_table idiom -- "giving them a firm_id would be the
-- wrong shape, not a stricter one, and would make a Malaysian tax band look like tenant
-- data"). The estate's live precedent for the exact posture is clara.statutory_deadlines
-- (0139): relacl NULL, no clara_authenticated reach at all. Every table below repeats it.
--
-- Design section 4 (D-5) states why this table exists rather than F-A8's web_fetch_citations
-- or F-A5's basis_citations: both are per-run artefacts of a FETCH, and a statutory
-- reference is standing law that must not be re-fetched (and re-risked) on every
-- computation. A report_agent_receipt's basis_citations later carries tax_authorities.id
-- VALUES -- F-A5's carrier used as a pointer, not as the store.
create table clara.tax_authorities (
  id                  uuid        primary key default gen_random_uuid(),

  kind                text        not null,
  label               text        not null check (btrim(label) <> ''),
  -- url / accessed_at are NULLABLE on purpose: an honestly-graded reference_only_unfetched
  -- row (PR 4/2015, PR 1/2003, PR 4/2019 -- survey U3/U4 and the dossier's own list) has no
  -- fetch to record, and inventing one would be the exact dishonesty this column exists to
  -- prevent. The paired CHECK below makes the honesty structural.
  url                 text        check (url is null or url ~ '^https?://'),
  accessed_at         date,
  quote               text,
  fetched_by          text        not null check (btrim(fetched_by) <> ''),
  -- HOW WELL SOURCED, said out loud. official_primary = read at the issuing authority's own
  -- site on accessed_at. official_secondary = an official page that itself restates another
  -- instrument. reference_only_unfetched = named by a source we did read, never opened.
  evidence_grade      text        not null,
  -- The measured disagreement, if any, in the row rather than in prose (departure 6).
  conflict            text,

  -- The law-review belt's input (design section 4.6 / mechanics M5): the last date this row
  -- is known-current, set at seed time from the source's own scope. It is NOT an automatic
  -- invalidation -- past it the row still computes and the belt has already asked.
  valid_through       date        not null,

  owner_signed_by     uuid        references clara.users (id),
  owner_signed_at     timestamptz,

  revision            int         not null default 1 check (revision > 0),
  superseded_by       uuid        references clara.tax_authorities (id),
  superseded_at       timestamptz,
  seeded_in_migration text        not null check (btrim(seeded_in_migration) <> ''),
  created_at          timestamptz not null default now(),

  constraint ck_tax_authorities_kind check (kind in (
    'act_section', 'schedule_para', 'public_ruling', 'gazette_order', 'lhdn_page')),
  constraint ck_tax_authorities_evidence_grade check (evidence_grade in (
    'official_primary', 'official_secondary', 'reference_only_unfetched')),
  -- A row claiming a primary official reading MUST carry the URL and the date it was read.
  -- Absence is not evidence: without both, the grade is a claim nobody can re-walk.
  constraint ck_tax_authorities_primary_is_grounded check (
    evidence_grade <> 'official_primary' or (url is not null and accessed_at is not null)),
  constraint ck_tax_authorities_signature_paired check (
    (owner_signed_by is null) = (owner_signed_at is null)),
  constraint ck_tax_authorities_supersession_paired check (
    (superseded_by is null) = (superseded_at is null))
);
create unique index uq_tax_authorities_live on clara.tax_authorities (label)
  where superseded_at is null;

-- =====================================================================================
-- S3 -- clara.tax_treatment_codes. Design section 2's closed, owner-signed code set.
-- =====================================================================================
-- THE SEVERANCE LIVES HERE. Clara's only write into a computation is a `code`; the fraction
-- and the citation belong to the code, seeded by migration and signed by a human. Clara's
-- proposal row (PR-4) has no numeric column at all -- there is nothing to type. This table
-- is the half that owns the numeral.
create table clara.tax_treatment_codes (
  code                   text        primary key check (code ~ '^[A-Z][A-Z0-9_]*$'),

  direction              text        not null,
  -- 10000 = 100%, 5000 = 50%, 0 = nil. NULL only for a refuse code (departure 3), where
  -- there is deliberately no fraction to apply to anything.
  fraction_bp            int         check (fraction_bp between 0 and 10000),
  -- Departure 4. TRUE means the account is genuinely mixed and the fraction alone is wrong:
  -- PR-2 must refuse mixed_account_needs_split when no human apportionment_bp exists, NEVER
  -- fall back to COALESCE(..., 10000).
  requires_apportionment boolean     not null default false,
  -- Non-null exactly for direction = 'refuse'. Every value here is also a seeded
  -- metric_na_reason_versions row (part 2 section 9's persistability law), proven in S9.
  refusal_reason_key     text,

  regime                 text        not null,
  statutory_ref          text        not null check (btrim(statutory_ref) <> ''),
  effective_ya_from      int         not null check (effective_ya_from between 2000 and 2100),
  effective_ya_to        int         check (effective_ya_to between 2000 and 2100),
  authority_id           uuid        not null references clara.tax_authorities (id),
  conflict               text,
  notes                  text,
  valid_through          date        not null,

  -- OQ-7's fail-closed default (departure 1): seeded NULL, so every treatment referencing
  -- this code refuses `treatment_code_unsigned` until a named licensed tax agent signs it.
  owner_signed_by        uuid        references clara.users (id),
  owner_signed_at        timestamptz,

  revision               int         not null default 1 check (revision > 0),
  superseded_by          text        references clara.tax_treatment_codes (code),
  superseded_at          timestamptz,
  seeded_in_migration    text        not null check (btrim(seeded_in_migration) <> ''),
  created_at             timestamptz not null default now(),

  constraint ck_tax_treatment_codes_direction check (direction in (
    'add_back', 'deduct', 'allowable', 'exclude', 'refuse')),
  constraint ck_tax_treatment_codes_regime check (regime in (
    'all', 'company', 'individual')),
  -- A refuse code carries NO numeral and DOES carry a reason key; every other direction is
  -- the mirror image. Two separate CHECKs so a reviewer reading a violation knows which half
  -- broke.
  constraint ck_tax_treatment_codes_refuse_has_no_fraction check (
    (direction = 'refuse') = (fraction_bp is null)),
  constraint ck_tax_treatment_codes_refuse_names_reason check (
    (direction = 'refuse') = (refusal_reason_key is not null)),
  -- A refusal is not an apportionment: there is no fraction for a human percentage to scale.
  constraint ck_tax_treatment_codes_refuse_not_apportioned check (
    not (direction = 'refuse' and requires_apportionment)),
  constraint ck_tax_treatment_codes_ya_window check (
    effective_ya_to is null or effective_ya_to >= effective_ya_from),
  constraint ck_tax_treatment_codes_signature_paired check (
    (owner_signed_by is null) = (owner_signed_at is null)),
  constraint ck_tax_treatment_codes_supersession_paired check (
    (superseded_by is null) = (superseded_at is null))
);

-- =====================================================================================
-- S4 -- clara.tax_rate_bands. Schedule 1 bands per regime and YA (design section 4, rel 3).
-- =====================================================================================
-- BAND CONVENTION, stated because a reader must not have to guess: the band is the
-- HALF-OPEN cents interval [band_lower_cents, band_upper_cents), and a NULL upper bound is
-- the open top band. So PR 8/2025 Table 5's "first RM150,000 / RM150,001-RM600,000 / the
-- excess" seeds as [0, 15000000) / [15000000, 60000000) / [60000000, NULL).
create table clara.tax_rate_bands (
  id                  uuid        primary key default gen_random_uuid(),
  regime              text        not null,
  ya                  int         not null check (ya between 2000 and 2100),
  band_lower_cents    bigint      not null check (band_lower_cents >= 0),
  band_upper_cents    bigint,
  rate_bp             int         not null check (rate_bp between 0 and 10000),
  authority_id        uuid        not null references clara.tax_authorities (id),
  conflict            text,
  valid_through       date        not null,
  revision            int         not null default 1 check (revision > 0),
  superseded_by       uuid        references clara.tax_rate_bands (id),
  superseded_at       timestamptz,
  seeded_in_migration text        not null check (btrim(seeded_in_migration) <> ''),
  created_at          timestamptz not null default now(),

  constraint ck_tax_rate_bands_regime check (regime in (
    'company_msmc', 'company_standard', 'individual_resident', 'individual_non_resident')),
  constraint ck_tax_rate_bands_span check (
    band_upper_cents is null or band_upper_cents > band_lower_cents),
  constraint ck_tax_rate_bands_supersession_paired check (
    (superseded_by is null) = (superseded_at is null))
);
create unique index uq_tax_rate_bands_live on clara.tax_rate_bands
  (regime, ya, band_lower_cents) where superseded_at is null;

-- =====================================================================================
-- S5 -- clara.capital_allowance_rates. Schedule 3 IA/AA per class and YA window (rel 4).
-- =====================================================================================
-- ca_class IS F-T3's OWN closed set, and the register does not constrain it: the replay
-- measured (P-8) twelve CHECKs on clara.fixed_assets, NONE naming ca_class, so the column
-- is free text there. The alignment between the register's written values and these keys is
-- therefore a real, named obligation on PR-3 / OQ-10 -- not something this file can enforce
-- from here. R5 refuses `ca_class_unassigned` for an asset carrying none, and
-- `rate_row_missing_for_ya` for one whose class has no row.
create table clara.capital_allowance_rates (
  id                  uuid        primary key default gen_random_uuid(),
  ca_class            text        not null check (btrim(ca_class) <> ''),
  ya_from             int         not null check (ya_from between 2000 and 2100),
  ya_to               int         check (ya_to between 2000 and 2100),
  ia_bp               int         not null check (ia_bp between 0 and 10000),
  aa_bp               int         not null check (aa_bp between 0 and 10000),
  authority_id        uuid        not null references clara.tax_authorities (id),
  conflict            text,
  valid_through       date        not null,
  revision            int         not null default 1 check (revision > 0),
  superseded_by       uuid        references clara.capital_allowance_rates (id),
  superseded_at       timestamptz,
  seeded_in_migration text        not null check (btrim(seeded_in_migration) <> ''),
  created_at          timestamptz not null default now(),

  constraint ck_capital_allowance_rates_ya_window check (ya_to is null or ya_to >= ya_from),
  constraint ck_capital_allowance_rates_supersession_paired check (
    (superseded_by is null) = (superseded_at is null))
);
create unique index uq_capital_allowance_rates_live on clara.capital_allowance_rates
  (ca_class, ya_from) where superseded_at is null;

-- =====================================================================================
-- S6 -- clara.tax_thresholds. The seeded scalars (design section 4, relation 5).
-- =====================================================================================
-- One row per (ya, key), never a window: R-L25's posture is that "a missing row for the YA
-- refuses by name and stops in the open -- never carried forward from the previous year",
-- and a ya_from/ya_to window is exactly the shape that silently carries forward.
create table clara.tax_thresholds (
  id                  uuid        primary key default gen_random_uuid(),
  ya                  int         not null check (ya between 2000 and 2100),
  key                 text        not null check (btrim(key) <> ''),
  value_cents         bigint      check (value_cents >= 0),
  value_bp            int         check (value_bp between 0 and 10000),
  value_int           int         check (value_int >= 0),   -- departure 2
  authority_id        uuid        not null references clara.tax_authorities (id),
  conflict            text,
  valid_through       date        not null,
  revision            int         not null default 1 check (revision > 0),
  superseded_by       uuid        references clara.tax_thresholds (id),
  superseded_at       timestamptz,
  seeded_in_migration text        not null check (btrim(seeded_in_migration) <> ''),
  created_at          timestamptz not null default now(),

  -- EXACTLY ONE value column is non-null. A threshold carrying two values, or none, is a
  -- row whose unit nobody can read.
  constraint ck_tax_thresholds_exactly_one_value check (
    (value_cents is not null)::int + (value_bp is not null)::int + (value_int is not null)::int = 1),
  constraint ck_tax_thresholds_supersession_paired check (
    (superseded_by is null) = (superseded_at is null))
);
create unique index uq_tax_thresholds_live on clara.tax_thresholds (ya, key)
  where superseded_at is null;

-- =====================================================================================
-- S7 -- clara.tax_add_back_class_map. The COA template hint -> treatment code (departure 5).
-- =====================================================================================
-- WHAT THIS IS, precisely, because the distinction is the whole reason it is lawful. The
-- 裁-21 COA template annotates twelve template ACCOUNTS with a citation-backed
-- `add_back_class` leaf. That leaf is a HINT that feeds F-T3's PROPOSE step; a treatment
-- becomes fact only through PR-4's per-client human approve door, so a pre-annotated
-- template account is a legitimate pre-seeded PROPOSAL, never an inference from an account
-- name (replay section 5's recorded conductor ruling). This table is the vocabulary bridge
-- and NOTHING else: it holds no fraction, no citation of its own beyond the authority that
-- justifies the pairing, and no client dimension.
--
-- The map is TOTAL and INJECTIVE-BY-LEAF over the research edition: exactly one live row per
-- leaf, twelve leaves, twelve rows -- proven by count in S9. A thirteenth leaf appearing in
-- a later COA edition is a new migration, not a silent default.
create table clara.tax_add_back_class_map (
  id                  uuid        primary key default gen_random_uuid(),
  add_back_class      text        not null check (btrim(add_back_class) <> ''),
  code                text        not null references clara.tax_treatment_codes (code),
  -- WHICH edition of the template this pairing was read from. A leaf's meaning can move
  -- between editions; a map row that cannot name its source cannot be re-checked.
  source_edition      date        not null,
  source_document     text        not null check (btrim(source_document) <> ''),
  authority_id        uuid        not null references clara.tax_authorities (id),
  basis               text        not null check (btrim(basis) <> ''),
  valid_through       date        not null,
  revision            int         not null default 1 check (revision > 0),
  superseded_by       uuid        references clara.tax_add_back_class_map (id),
  superseded_at       timestamptz,
  seeded_in_migration text        not null check (btrim(seeded_in_migration) <> ''),
  created_at          timestamptz not null default now(),

  constraint ck_tax_add_back_class_map_supersession_paired check (
    (superseded_by is null) = (superseded_at is null))
);
create unique index uq_tax_add_back_class_map_live on clara.tax_add_back_class_map
  (add_back_class) where superseded_at is null;

-- =====================================================================================
-- S8 -- TRIGGERS, RLS AND THE CLOSED WORLD, on all six.
-- =====================================================================================
-- Three triggers each: the shared immutability guard on UPDATE (S1), and the estate's
-- generic append-only / no-truncate pair on DELETE / TRUNCATE.
--
-- The mutable allowlist differs by table and is passed as TG_ARGV[0]:
--   * tax_authorities and tax_treatment_codes carry a signature, so an unsigned row can be
--     signed once (OQ-7's whole point) -- four mutable columns;
--   * the other four carry no signature -- two mutable columns, the supersession pair only.
create trigger t_tax_authorities_immutable before update on clara.tax_authorities
  for each row execute function clara._tf_ft3_law_row_immutable(
    '{superseded_by,superseded_at,owner_signed_by,owner_signed_at}');
create trigger t_tax_authorities_no_delete before delete on clara.tax_authorities
  for each row execute function clara._tf_append_only();
create trigger t_tax_authorities_no_truncate before truncate on clara.tax_authorities
  for each statement execute function clara._tf_no_truncate();

create trigger t_tax_treatment_codes_immutable before update on clara.tax_treatment_codes
  for each row execute function clara._tf_ft3_law_row_immutable(
    '{superseded_by,superseded_at,owner_signed_by,owner_signed_at}');
create trigger t_tax_treatment_codes_no_delete before delete on clara.tax_treatment_codes
  for each row execute function clara._tf_append_only();
create trigger t_tax_treatment_codes_no_truncate before truncate on clara.tax_treatment_codes
  for each statement execute function clara._tf_no_truncate();

create trigger t_tax_rate_bands_immutable before update on clara.tax_rate_bands
  for each row execute function clara._tf_ft3_law_row_immutable('{superseded_by,superseded_at}');
create trigger t_tax_rate_bands_no_delete before delete on clara.tax_rate_bands
  for each row execute function clara._tf_append_only();
create trigger t_tax_rate_bands_no_truncate before truncate on clara.tax_rate_bands
  for each statement execute function clara._tf_no_truncate();

create trigger t_capital_allowance_rates_immutable before update on clara.capital_allowance_rates
  for each row execute function clara._tf_ft3_law_row_immutable('{superseded_by,superseded_at}');
create trigger t_capital_allowance_rates_no_delete before delete on clara.capital_allowance_rates
  for each row execute function clara._tf_append_only();
create trigger t_capital_allowance_rates_no_truncate before truncate on clara.capital_allowance_rates
  for each statement execute function clara._tf_no_truncate();

create trigger t_tax_thresholds_immutable before update on clara.tax_thresholds
  for each row execute function clara._tf_ft3_law_row_immutable('{superseded_by,superseded_at}');
create trigger t_tax_thresholds_no_delete before delete on clara.tax_thresholds
  for each row execute function clara._tf_append_only();
create trigger t_tax_thresholds_no_truncate before truncate on clara.tax_thresholds
  for each statement execute function clara._tf_no_truncate();

create trigger t_tax_add_back_class_map_immutable before update on clara.tax_add_back_class_map
  for each row execute function clara._tf_ft3_law_row_immutable('{superseded_by,superseded_at}');
create trigger t_tax_add_back_class_map_no_delete before delete on clara.tax_add_back_class_map
  for each row execute function clara._tf_append_only();
create trigger t_tax_add_back_class_map_no_truncate before truncate on clara.tax_add_back_class_map
  for each statement execute function clara._tf_no_truncate();

-- RLS: enabled AND forced on every one (rig-meta.mjs's governedRlsFailures() reads exactly
-- those two flags for every clara base table). ONE unconditional owner policy, zero grants,
-- so relacl stays NULL -- the true closed world, the one predicate a role this file never
-- thought to name cannot slip past. There is no clara_authenticated policy because there is
-- no clara_authenticated grant: PR-1 builds NO door at all (R-L25), and the future human
-- reader is a typed SECURITY DEFINER function with its own role floor in the body, never a
-- raw SELECT on a base table.
alter table clara.tax_authorities          enable row level security;
alter table clara.tax_authorities          force  row level security;
alter table clara.tax_treatment_codes      enable row level security;
alter table clara.tax_treatment_codes      force  row level security;
alter table clara.tax_rate_bands           enable row level security;
alter table clara.tax_rate_bands           force  row level security;
alter table clara.capital_allowance_rates  enable row level security;
alter table clara.capital_allowance_rates  force  row level security;
alter table clara.tax_thresholds           enable row level security;
alter table clara.tax_thresholds           force  row level security;
alter table clara.tax_add_back_class_map   enable row level security;
alter table clara.tax_add_back_class_map   force  row level security;

create policy p_tax_authorities_owner on clara.tax_authorities
  for all to clara_fn_owner using (true) with check (true);
create policy p_tax_treatment_codes_owner on clara.tax_treatment_codes
  for all to clara_fn_owner using (true) with check (true);
create policy p_tax_rate_bands_owner on clara.tax_rate_bands
  for all to clara_fn_owner using (true) with check (true);
create policy p_capital_allowance_rates_owner on clara.capital_allowance_rates
  for all to clara_fn_owner using (true) with check (true);
create policy p_tax_thresholds_owner on clara.tax_thresholds
  for all to clara_fn_owner using (true) with check (true);
create policy p_tax_add_back_class_map_owner on clara.tax_add_back_class_map
  for all to clara_fn_owner using (true) with check (true);

-- =====================================================================================
-- S9 -- THE SEEDED LAW. Every row cites its authority; every code seeds UNSIGNED.
-- =====================================================================================
-- Sources, with the fetch dates the survey and the COA dossier actually recorded:
--   L1 PR 8/2025 (MSMC), L2 LHDN company rates, L4 LHDN tax estimation, L5 Filing Programme
--   2026, L6 PR 12/2014, L7 PR 6/2015, L8 PR 3/2018, L9 Act 53 (LHDN consolidated copy,
--   stamped as at 2024-05-21) -- all fetched 2026-08-23 (survey section 6.1).
--   The 裁-21 COA dossier's ruling list -- read 2026-08-29 -- names PR 4/2015, PR 1/2003 and
--   PR 4/2019 without opening them; those three seed as reference_only_unfetched with a
--   valid_through of the day they were named, so the law-review belt raises them on its
--   FIRST run rather than in a January mid-filing.

-- ---- S9.1 · the citation catalog -----------------------------------------------------
insert into clara.tax_authorities
  (kind, label, url, accessed_at, quote, fetched_by, evidence_grade, conflict, valid_through,
   seeded_in_migration)
values
  -- Act 53 sections. Every one carries survey U7 as its recorded conflict: LHDN's own
  -- consolidated copy is stamped as at 2024-05-21, so a later Finance Act amendment would
  -- not be in it and nobody has checked.
  ('act_section', 'ITA1967_S33_1',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23',
   'deducting from the gross income ... all outgoings and expenses wholly and exclusively incurred during that period ... in the production of gross income from that source',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: the consolidated copy is stamped as at 2024-05-21; any later Finance Act amendment is unverified',
   '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S39_1',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23', 'Deductions not allowed', 'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: consolidated as at 2024-05-21', '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S39_1_A',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23', 'domestic or private expenses', 'F-T3 survey 2026-08-23 (L9)',
   'official_primary', 'survey U7: consolidated as at 2024-05-21', '2026-12-31',
   'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S39_1_C',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23', 'capital withdrawn or employed as capital', 'F-T3 survey 2026-08-23 (L9)',
   'official_primary',
   'survey U7 plus a MEASURED reading conflict: the survey reads (c) as the capital-withdrawn paragraph while the 裁-21 dossier assigns (c) to unapproved provident-fund contributions',
   '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S39_1_K',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23', 'motor-vehicle rentals above the prescribed limits',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'CONFLICT C-1, unresolved: the 2026-08-23 survey read of L9 reports (k) as the motor-vehicle RENTAL restriction, while the 2026-08-29 裁-21 dossier cites (k) as the depreciation add-back. The depreciation code below carries the dossier ruling; a signer must adjudicate this before signing it.',
   '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S39_1_L',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23',
   'a sum equal to fifty percent of any expenses incurred in the provision of entertainment',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: consolidated as at 2024-05-21', '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S39_1_M',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23', 'leave passage', 'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: consolidated as at 2024-05-21; the 裁-21 dossier additionally reads (m) as the club subscriptions and entrance fees restriction',
   '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S13_1_B',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23', 'benefits or amenities not convertible into money', 'F-T3 survey 2026-08-23 (L9)',
   'official_primary', 'survey U7: consolidated as at 2024-05-21', '2026-12-31',
   'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S34_2',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23', 'debt reasonably estimated to be wholly or partly irrecoverable',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: consolidated as at 2024-05-21', '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S43_2',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23', 'aggregate income: deduction of a brought-forward adjusted business loss',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: consolidated as at 2024-05-21', '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S44_2',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23', 'total income: deduction of the current-year adjusted loss',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: consolidated as at 2024-05-21', '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S44_5F',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23',
   'a carried-forward amount is limited to ten consecutive years of assessment; the balance is disregarded thereafter',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: consolidated as at 2024-05-21', '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S44_6',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23',
   'gift of money to an approved institution or organisation, restricted to ten per cent of the aggregate income',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: consolidated as at 2024-05-21; the 裁-21 dossier records that no company-level Public Ruling for s.44(6) could be located (the PR 6/2023 -> 4/2024 -> 7/2025 chain is individual-scoped)',
   '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('act_section', 'ITA1967_S107C',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23',
   'estimate of tax payable; not less than eighty-five per cent of the revised estimate for the immediately preceding year of assessment',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U7: consolidated as at 2024-05-21', '2026-12-31', 'f_t3_pr_1_tax_platform'),

  -- Schedule 3 paragraphs.
  ('schedule_para', 'ITA1967_SCH3_PARA_19A',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23',
   'small value asset: allowance equal to the full expenditure in lieu of initial and annual allowances; the proviso caps the aggregate per year of assessment',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'survey U2: PR 3/2021, which L1 section 6.3.5 names for the detail, was NOT fetched -- which is why the sva_annual_cap threshold row is deliberately absent',
   '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('schedule_para', 'ITA1967_SCH3_PARA_2_2A',
   'https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf',
   '2026-08-23',
   'qualifying plant expenditure on a motor vehicle not licensed for commercial transportation, restricted',
   'F-T3 survey 2026-08-23 (L9)', 'official_primary',
   'CONFLICT C-2: the 裁-21 dossier cites Schedule 3 para 2/2A for the RM50k/RM100k qualifying-expenditure cap; the survey grounds the same cap in PR 6/2015 section (b). Both are carried; the cap itself is R5''s arithmetic, not this file''s.',
   '2026-12-31', 'f_t3_pr_1_tax_platform'),

  -- Public rulings, read at LHDN on 2026-08-23.
  ('public_ruling', 'LHDN_PR_12_2014', 'https://www.hasil.gov.my/wp-content/uploads/PR_12_2014.pdf',
   '2026-08-23',
   'Qualifying Plant and Machinery for Claiming Capital Allowances -- heavy machinery/motor vehicle 20%/20%; plant and machinery 20%/14%; others 20%/10%',
   'F-T3 survey 2026-08-23 (L6)', 'official_primary', null, '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('public_ruling', 'LHDN_PR_6_2015', 'http://lampiran1.hasil.gov.my/pdf/pdfam/PR_6_2015.pdf',
   '2026-08-23',
   'Qualifying Expenditure and Computation of Capital Allowances -- section (b): QE restricted to RM100,000 if the vehicle is new and total cost does not exceed RM150,000, otherwise RM50,000',
   'F-T3 survey 2026-08-23 (L7)', 'official_primary', null, '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('public_ruling', 'LHDN_PR_3_2018', 'http://lampiran1.hasil.gov.my/pdf/pdfam/PR_03_2018.pdf',
   '2026-08-23',
   'Qualifying Expenditure and Computation of Industrial Building Allowances -- worked example: IA 10%, AA 3%',
   'F-T3 survey 2026-08-23 (L8)', 'official_primary', null, '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('public_ruling', 'LHDN_PR_8_2025',
   'https://www.hasil.gov.my/wp-content/uploads/pr-8-2025-tax-treatment-for-micro-small-and-medium-companies.pdf',
   '2026-08-23',
   'Tax Treatment for Micro, Small and Medium Companies -- Table 5: 15% on the first RM150,000, 17% on RM150,001-RM600,000, 24% on the excess, from YA2023',
   'F-T3 survey 2026-08-23 (L1)', 'official_primary', null, '2026-12-31', 'f_t3_pr_1_tax_platform'),
  -- The three NAMED-BUT-UNOPENED rulings. valid_through is the day they were named, so the
  -- law-review belt raises them on its first run instead of in a January mid-filing.
  ('public_ruling', 'LHDN_PR_4_2015', null, null,
   null, '裁-21 COA dossier 2026-08-29 (named, not opened)', 'reference_only_unfetched',
   'survey U3: PR 4/2015 (Entertainment Expense) was not fetched at an official source. The 50% default rests on s.39(1)(l) itself, which WAS read; the ruling''s eight 100% exceptions are named by the dossier only and are the entry-level override''s territory (PR-4).',
   '2026-08-29', 'f_t3_pr_1_tax_platform'),
  ('public_ruling', 'LHDN_PR_1_2003', null, null,
   null, '裁-21 COA dossier 2026-08-29 (named, not opened)', 'reference_only_unfetched',
   'Named by the 裁-21 dossier for the leave-passage fare restriction; never opened at an official source.',
   '2026-08-29', 'f_t3_pr_1_tax_platform'),
  ('public_ruling', 'LHDN_PR_4_2019', null, null,
   null, '裁-21 COA dossier 2026-08-29 (named, not opened)', 'reference_only_unfetched',
   'survey U4: PR 4/2019 (trade/doubtful debts, replacing PR 1/2002) was not fetched. The specific-versus-general split rests on s.34(2) itself, which WAS read.',
   '2026-08-29', 'f_t3_pr_1_tax_platform'),

  -- LHDN pages.
  ('lhdn_page', 'LHDN_PAGE_COMPANY_RATES', 'https://www.hasil.gov.my/en/syarikat/kadar-cukai-syarikat/',
   '2026-08-23', 'Kadar Cukai Syarikat', 'F-T3 survey 2026-08-23 (L2)', 'official_secondary',
   'CONFLICT C-3: on 2026-08-23 this page still showed only Year Assessment 2023-2024 while PR 8/2025 (published 2025-12-22) states the bands as running from YA2023 unchanged. The page lags; the bands cite PR 8/2025.',
   '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('lhdn_page', 'LHDN_PAGE_TAX_ESTIMATION', 'https://www.hasil.gov.my/en/syarikat/anggaran-cukai/',
   '2026-08-23',
   'Anggaran Cukai -- equal monthly instalments due on the 15th of the calendar month, from the 2nd month of the basis period',
   'F-T3 survey 2026-08-23 (L4)', 'official_primary', null, '2026-12-31', 'f_t3_pr_1_tax_platform'),
  ('lhdn_page', 'LHDN_PAGE_FILING_PROGRAMME_2026',
   'https://www.hasil.gov.my/wp-content/uploads/program-memfail-bn-bagi-tahun-2026.pdf',
   '2026-08-23',
   'Return Form Filing Programme for 2026, issued 30 December 2025 -- note 3(i): a taxpayer that has not commenced operations need not furnish CP204; a dormant taxpayer must still furnish the return form',
   'F-T3 survey 2026-08-23 (L5)', 'official_primary', null, '2026-12-31', 'f_t3_pr_1_tax_platform');

-- ---- S9.2 · the treatment codes, every one UNSIGNED (OQ-7 fail-closed) ---------------
insert into clara.tax_treatment_codes
  (code, direction, fraction_bp, requires_apportionment, refusal_reason_key, regime,
   statutory_ref, effective_ya_from, effective_ya_to, authority_id, conflict, notes,
   valid_through, seeded_in_migration)
select v.code, v.direction, v.fraction_bp, v.requires_apportionment, v.refusal_reason_key,
       v.regime, v.statutory_ref, 2023, null, a.id, v.conflict, v.notes, date '2026-12-31',
       'f_t3_pr_1_tax_platform'
  from (values
    ('ADDBACK_ENTERTAINMENT_50', 'add_back', 5000, false, null::text, 'all',
     's.39(1)(l) ITA 1967 (fifty per cent of entertainment expenses); PR 4/2015',
     'ITA1967_S39_1_L', null::text,
     'The 裁-21 dossier records eight named exceptions that are 100% deductible, all sitting INSIDE one account (6400). That is why the per-entry override (tax_entry_treatments, PR-4) is necessary rather than exceptional: account-level treatment alone would fire mixed_account_needs_split on essentially every client.'),
    ('ALLOWABLE_ENTERTAINMENT_100', 'allowable', 0, false, null, 'all',
     's.39(1)(l) provisos (i)-(vii) ITA 1967; PR 4/2015', 'ITA1967_S39_1_L', null,
     'The entry-level override target for the eight fully-deductible exceptions. NOT mapped from any add_back_class leaf: the leaf is per-account and this code is per-entry.'),
    ('REFUSE_DONATION_S44_6', 'refuse', null, false, 's44_6_relief_unmodelled', 'all',
     's.44(6) ITA 1967 (approved institution; ten per cent of aggregate income)',
     'ITA1967_S44_6', null,
     'OQ-11''s fail-closed default (departure 3). An approved-institution donation is not an add-back at all: it is an s.44(6) DEDUCTION capped at 10% of aggregate income -- a figure that does not exist until R7 -- so fraction_bp x movement cannot express it. v1 refuses by name and the human keys the relief. A flat 100% add-back would OVERSTATE the charge on every client that donates to an approved institution.'),
    ('ADDBACK_DONATION_UNAPPROVED_100', 'add_back', 10000, false, null, 'all',
     's.33(1) ITA 1967 (not wholly and exclusively incurred in the production of gross income); outside s.44(6)',
     'ITA1967_S33_1', null,
     'The 裁-21 dossier''s donations_unapproved leaf: a gift outside s.44(6) is simply non-deductible.'),
    ('ADDBACK_FINE_100', 'add_back', 10000, false, null, 'all',
     's.39(1) ITA 1967 (general) with s.33(1)', 'ITA1967_S39_1', null,
     'CITATION CORRECTED. The design set worked this as s.39(1)(b); the 裁-21 dossier grounds it in s.39(1) generally plus s.33(1), with no paragraph letter, the point of law resting on case law (Aspac Lubricants (M) Sdn Bhd v KPHDN). The over-specified (b) is dropped.'),
    ('ADDBACK_DEPRECIATION_100', 'add_back', 10000, false, null, 'all',
     's.39(1)(k) ITA 1967 with Schedule 3 (capital allowances computed separately); PR 12/2014, PR 6/2015',
     'ITA1967_S39_1_K',
     'CONFLICT C-1, UNRESOLVED AND LOAD-BEARING AT SIGNATURE. The 2026-08-29 裁-21 dossier cites s.39(1)(k); the 2026-08-23 survey read of Act 53 reports (k) as the motor-vehicle RENTAL restriction. The design''s own s.39(1)(c),(e) is refuted by the dossier (it assigns (c) to unapproved provident funds). A signer must settle which paragraph this row prints BEFORE signing it -- this row is unsigned and therefore unusable until then, which is exactly the wall OQ-7 is for.',
     'CITATION CORRECTED from the design set''s s.39(1)(c),(e). Accounting depreciation and capital allowances never meet: this code feeds R2 as an add-back, the register feeds R5 as qualifying expenditure.'),
    ('ADDBACK_LEAVE_PASSAGE_100', 'add_back', 10000, false, null, 'all',
     's.13(1)(b) ITA 1967 (leave passage benefit); PR 1/2003', 'ITA1967_S13_1_B', null,
     'The FARE portion only. The 裁-21 dossier records that food, accommodation and incidentals belong to entertainment, not to leave passage -- a split the books make, not this code.'),
    ('ADDBACK_PRIVATE_EXPENSE_100', 'add_back', 10000, false, null, 'all',
     's.39(1)(a) ITA 1967 (domestic or private expenses)', 'ITA1967_S39_1_A', null,
     'Covers the proprietor''s own expenses as well as private ones. Hard constraint 13''s BEE CREATIVE SOLUTION case is the live example of why a proprietor line is not a staff cost.'),
    ('ADDBACK_MOTOR_RUNNING_PRIVATE_PORTION', 'add_back', 10000, true, null, 'all',
     'Schedule 3 para 2/2A ITA 1967; PR 6/2015 section (b)', 'ITA1967_SCH3_PARA_2_2A',
     'CONFLICT C-2: the dossier and the survey ground the same restriction in different instruments. Both are carried.',
     'requires_apportionment = TRUE (departure 4). A mixed-use vehicle''s running costs are apportioned business:private, and the private share is the add-back. With no human apportionment_bp this code must NOT fall back to 100%: PR-2 refuses mixed_account_needs_split. The Schedule 3 QE cap on the VEHICLE is a capital-allowance figure and belongs to R5 and the register, never to this P&L code.'),
    ('ADDBACK_CLUB_SUBSCRIPTION_100', 'add_back', 10000, false, null, 'all',
     's.39(1)(m) ITA 1967 (club subscriptions and entrance fees)', 'ITA1967_S39_1_M', null,
     'A ready-made citation-backed family the design''s original six never carried. A standalone rule, distinct from the entertainment 50% restriction.'),
    ('ALLOWABLE_DOUBTFUL_DEBT_SPECIFIC', 'allowable', 0, false, null, 'all',
     's.34(2) ITA 1967 (specific, individually assessed and evidenced); PR 4/2019',
     'ITA1967_S34_2', null,
     'One half of the doubtful-debt split. A specific provision is deductible, so the add-back fraction is nil.'),
    ('ADDBACK_DOUBTFUL_DEBT_GENERAL_100', 'add_back', 10000, false, null, 'all',
     's.34(2) ITA 1967 (a general or flat-percentage provision is not an evidenced specific provision); PR 4/2019',
     'ITA1967_S34_2', null,
     'The other half. An MFRS 9 ECL-style flat provision is NOT a specific provision -- the exact split a single mixed "bad debts" account hides.'),
    ('ADDBACK_UNAPPROVED_PROVIDENT_FUND_100', 'add_back', 10000, false, null, 'all',
     's.39(1)(c) ITA 1967 (contributions to an unapproved pension or provident fund)',
     'ITA1967_S39_1_C',
     'The survey reads s.39(1)(c) as the capital-withdrawn paragraph; the 裁-21 dossier assigns it to unapproved provident funds. Recorded, not resolved.',
     'A ready-made citation-backed family the design''s original six never carried.')
  ) as v(code, direction, fraction_bp, requires_apportionment, refusal_reason_key, regime,
         statutory_ref, authority_label, conflict, notes)
  join clara.tax_authorities a on a.label = v.authority_label;

-- ---- S9.3 · Schedule 1 rate bands, YA2023-YA2025 -------------------------------------
insert into clara.tax_rate_bands
  (regime, ya, band_lower_cents, band_upper_cents, rate_bp, authority_id, conflict,
   valid_through, seeded_in_migration)
select b.regime, y.ya, b.lo, b.hi, b.rate, a.id,
       'CONFLICT C-3: LHDN''s own company-rates page lagged at YA2023-2024 on 2026-08-23; PR 8/2025 (2025-12-22) is the authority these bands cite.',
       date '2026-12-31', 'f_t3_pr_1_tax_platform'
  from (values
    ('company_msmc',     0::bigint,        15000000::bigint, 1500),
    ('company_msmc',     15000000::bigint, 60000000::bigint, 1700),
    ('company_msmc',     60000000::bigint, null::bigint,     2400),
    ('company_standard', 0::bigint,        null::bigint,     2400)
  ) as b(regime, lo, hi, rate)
  cross join (values (2023), (2024), (2025)) as y(ya)
  cross join lateral (select id from clara.tax_authorities where label = 'LHDN_PR_8_2025') a;

-- ---- S9.4 · Schedule 3 capital-allowance rates ---------------------------------------
-- ya_from = 2023 deliberately (departure 7e): L6 states the three rates without a start year,
-- and inferring one would be a claim about history nobody measured. The ICT class is ABSENT
-- (departure 7a) -- an asset resolving to it returns rate_row_missing_for_ya.
insert into clara.capital_allowance_rates
  (ca_class, ya_from, ya_to, ia_bp, aa_bp, authority_id, conflict, valid_through,
   seeded_in_migration)
select c.ca_class, 2023, null, c.ia, c.aa, a.id, c.conflict, date '2026-12-31',
       'f_t3_pr_1_tax_platform'
  from (values
    ('heavy_machinery',     2000, 2000, 'LHDN_PR_12_2014',
     'L6 section 5 groups "heavy machinery, motor vehicle" as ONE 20%/20% category; F-T3 seeds two class keys against that single row so the register can label an asset naturally. No rate differs between them.'),
    ('motor_vehicle',       2000, 2000, 'LHDN_PR_12_2014',
     'Same single L6 section 5 category as heavy_machinery. The Schedule 3 QE cap on a non-commercial vehicle is a separate figure and lives in tax_thresholds.'),
    ('plant_and_machinery', 2000, 1400, 'LHDN_PR_12_2014', null::text),
    ('others',              2000, 1000, 'LHDN_PR_12_2014',
     'L6 section 5: office equipment, furniture and fittings. These three rates apply regardless of industry and do NOT apply to assets eligible for industrial building, agriculture or forest allowance, or carrying a special rate.'),
    ('industrial_building', 1000,  300, 'LHDN_PR_3_2018',
     'From L8''s own worked example (IA 10% x RM450,000, AA 3% x RM450,000).')
  ) as c(ca_class, ia, aa, authority_label, conflict)
  join clara.tax_authorities a on a.label = c.authority_label;

-- ---- S9.5 · the seeded scalars, YA2023-YA2025 ----------------------------------------
-- Thirteen of mechanics M2's fourteen keys. `sva_annual_cap` is deliberately absent
-- (departure 7b, survey U2), so the SVA branch refuses rate_row_missing_for_ya.
-- msmc_foreign_holding_max_bp seeds for YA2024-YA2025 ONLY: the >20% foreign/non-citizen
-- test is effective FROM YA2024 (L1 section 6.2.1(d)), so a YA2023 row would assert a test
-- that did not yet bite, and its absence there is correct rather than a gap.
insert into clara.tax_thresholds
  (ya, key, value_cents, value_bp, value_int, authority_id, valid_through, seeded_in_migration)
select y.ya, k.key, k.cents, k.bp, k.ival, a.id, date '2026-12-31', 'f_t3_pr_1_tax_platform'
  from (values
    ('msmc_paid_up_max',            250000000::bigint, null::int, null::int, 'LHDN_PR_8_2025'),
    ('msmc_gross_income_max',       5000000000::bigint, null,     null,      'LHDN_PR_8_2025'),
    ('related_company_paid_up_min', 250000000::bigint, null,      null,      'LHDN_PR_8_2025'),
    ('sva_asset_max',               200000::bigint,    null,      null,      'ITA1967_SCH3_PARA_19A'),
    ('mv_qe_cap_default',           5000000::bigint,   null,      null,      'LHDN_PR_6_2015'),
    ('mv_qe_cap_new',               10000000::bigint,  null,      null,      'LHDN_PR_6_2015'),
    ('mv_new_cost_ceiling',         15000000::bigint,  null,      null,      'LHDN_PR_6_2015'),
    ('cp204_floor_bp',              null::bigint,      8500,      null,      'ITA1967_S107C'),
    ('s107c10_threshold_bp',        null::bigint,      3000,      null,      'ITA1967_S107C'),
    ('s107c10_penalty_bp',          null::bigint,      1000,      null,      'ITA1967_S107C'),
    ('s44_6_donation_cap_bp',       null::bigint,      1000,      null,      'ITA1967_S44_6'),
    ('loss_carry_forward_years',    null::bigint,      null,      10,        'ITA1967_S44_5F')
  ) as k(key, cents, bp, ival, authority_label)
  cross join (values (2023), (2024), (2025)) as y(ya)
  join clara.tax_authorities a on a.label = k.authority_label;

insert into clara.tax_thresholds
  (ya, key, value_bp, authority_id, conflict, valid_through, seeded_in_migration)
select y.ya, 'msmc_foreign_holding_max_bp', 2000, a.id,
       'Effective FROM YA2024 (L1 section 6.2.1(d)); the identically-worded test appears at Schedule 3 para 19A(4)(d). No YA2023 row exists because the test did not bite that year.',
       date '2026-12-31', 'f_t3_pr_1_tax_platform'
  from (values (2024), (2025)) as y(ya)
  cross join lateral (select id from clara.tax_authorities where label = 'LHDN_PR_8_2025') a;

-- ---- S9.6 · the add_back_class -> code map, twelve leaves, twelve rows ----------------
insert into clara.tax_add_back_class_map
  (add_back_class, code, source_edition, source_document, authority_id, basis, valid_through,
   seeded_in_migration)
select m.leaf, m.code, date '2026-08-29',
       'docs/plan/research/coa-template-2026-08-29.json', a.id, m.basis, date '2026-12-31',
       'f_t3_pr_1_tax_platform'
  from (values
    ('entertainment', 'ADDBACK_ENTERTAINMENT_50', 'ITA1967_S39_1_L',
     'Template account 6400. The dossier''s 50%-by-default reading matches the code''s fraction; the eight 100% exceptions ride the per-entry override.'),
    ('donations_approved', 'REFUSE_DONATION_S44_6', 'ITA1967_S44_6',
     'Template account 6410. Mapped to the REFUSE code, not to an add-back: an approved-institution gift is an s.44(6) deduction capped at 10% of aggregate income and the add-back model cannot express it (OQ-11).'),
    ('donations_unapproved', 'ADDBACK_DONATION_UNAPPROVED_100', 'ITA1967_S33_1',
     'Template account 6420. Outside s.44(6), so simply non-deductible.'),
    ('fines_and_penalties', 'ADDBACK_FINE_100', 'ITA1967_S39_1',
     'Template account 6430. The dossier carries no paragraph letter and neither does the code.'),
    ('depreciation_and_amortisation', 'ADDBACK_DEPRECIATION_100', 'ITA1967_S39_1_K',
     'Template account 6440. Carries conflict C-1 through to the code; capital allowances are computed separately under Schedule 3.'),
    ('leave_passage', 'ADDBACK_LEAVE_PASSAGE_100', 'ITA1967_S13_1_B',
     'Template account 6450. The fare portion only.'),
    ('private_and_proprietor_expenses', 'ADDBACK_PRIVATE_EXPENSE_100', 'ITA1967_S39_1_A',
     'Template account 6460.'),
    ('motor_running_costs', 'ADDBACK_MOTOR_RUNNING_PRIVATE_PORTION', 'ITA1967_SCH3_PARA_2_2A',
     'Template account 6470. The code requires a human apportionment; the vehicle''s QE cap is R5''s, not this map''s.'),
    ('club_subscriptions_and_entrance_fees', 'ADDBACK_CLUB_SUBSCRIPTION_100', 'ITA1967_S39_1_M',
     'Template account 6480.'),
    ('doubtful_debts_specific', 'ALLOWABLE_DOUBTFUL_DEBT_SPECIFIC', 'ITA1967_S34_2',
     'Template account 6490. Deductible, so the mapped code adds back nothing.'),
    ('doubtful_debts_general', 'ADDBACK_DOUBTFUL_DEBT_GENERAL_100', 'ITA1967_S34_2',
     'Template account 6491.'),
    ('unapproved_provident_fund', 'ADDBACK_UNAPPROVED_PROVIDENT_FUND_100', 'ITA1967_S39_1_C',
     'Template account 6492.')
  ) as m(leaf, code, authority_label, basis)
  join clara.tax_authorities a on a.label = m.authority_label;

-- ---- S9.7 · the refusal vocabulary: 22 ladder rows + 1 OQ-11 row ----------------------
-- Part 2 section 9's law: "a string with no reason row cannot be persisted at all, only
-- raised", enforced by metric_cells_check3 plus t_scope_cell_na_reason. Every row is
-- firm_id = NULL -- lawful for EVERY firm, because _tf_metric_catalog_scope's verdict
-- conjunct is `pf is not null` (replay P-13, re-measured in S0). effective_from matches the
-- nine live rows' own 2020-01-01, and display_token their own em dash.
insert into clara.metric_na_reason_versions
  (firm_id, reason_key, version, cell_status, display_token, semantics, effective_from)
values
  -- R1's input walls.
  (null, 'close_not_sealed', 1, 'absent', '—',
   '{"rung":"R1","fix":"seal the fiscal year: an active close_receipts row of kind=close is what makes the accounting profit reproducible after filing"}', '2020-01-01'),
  (null, 'basis_period_undetermined', 1, 'absent', '—',
   '{"rungs":"R1,R11","fix":"record the tax_basis_periods row for the year of assessment being read (R11 reads ya_target, not the computed year)"}', '2020-01-01'),
  (null, 'basis_period_not_coextensive_with_close', 1, 'undefined', '—',
   '{"rung":"R1","fix":"the asserted basis period must be exactly the sealed fiscal year''s span; an apportioned or short period is out of v1 (s.21A(3)-(7) turns on a DGIR direction)"}', '2020-01-01'),
  (null, 'close_snapshot_missing_pl_rows', 1, 'absent', '—',
   '{"rungs":"R2,R3","delta":"D-9","fix":"the active close receipt carries no pl_rows array. The close belt enforces closing_position ONLY (measured), so this key is present by finalize_close''s construction and by nothing else -- re-seal the close rather than reading a balance-sheet key for a P&L movement"}', '2020-01-01'),
  -- R2/R3, the treatment walls.
  (null, 'account_untreated', 1, 'undefined', '—',
   '{"rung":"R2","fix":"every non-zero pl_rows account needs an approved treatment. An untreated account is never silently allowable"}', '2020-01-01'),
  (null, 'treatment_unapproved', 1, 'undefined', '—',
   '{"rung":"R2","fix":"a human with the admin floor approves the proposal; Clara proposes a code and nothing else"}', '2020-01-01'),
  (null, 'treatment_code_unsigned', 1, 'undefined', '—',
   '{"rung":"R2","oq":"OQ-7","fix":"a named licensed tax agent signs the treatment code. Every code seeds UNSIGNED and an unsigned code is unusable -- nothing computes wrongly, it simply does not compute"}', '2020-01-01'),
  (null, 'treatment_on_non_pl_account', 1, 'undefined', '—',
   '{"rung":"R2","fix":"a treatment must name an account whose account_type is income or expense; this separates a legitimate nil movement from a read of the wrong key"}', '2020-01-01'),
  (null, 'mixed_account_needs_split', 1, 'undefined', '—',
   '{"rung":"R2","fix":"split the account in the books, or approve a tax_entry_treatments override for the exceptional line. Also the state of an apportionment-requiring code with no human apportionment_bp"}', '2020-01-01'),
  (null, 's44_6_relief_unmodelled', 1, 'refused', '—',
   '{"rung":"R8","oq":"OQ-11","fix":"an approved-institution donation is an s.44(6) deduction capped at 10% of aggregate income, not an add-back. v1 refuses by name and the human keys the relief on the return. A flat 100% add-back would overstate the charge silently"}', '2020-01-01'),
  -- The seeded-law walls.
  (null, 'rate_row_missing_for_ya', 1, 'absent', '—',
   '{"rungs":"R5,R10","fix":"seed the band, capital-allowance rate or threshold row for this year of assessment by PR. A rate is NEVER carried forward from the previous year. Covers the deliberately-absent ICT class (survey U1) and sva_annual_cap (survey U2)"}', '2020-01-01'),
  (null, 'citation_missing', 1, 'refused', '—',
   '{"artifact":"statement","fix":"every add-back dataset point must resolve to at least one tax_authorities row; a treatment without a citation cannot reach the draft statement"}', '2020-01-01'),
  -- R5, the capital-allowance walls.
  (null, 'ca_class_unassigned', 1, 'absent', '—',
   '{"rung":"R5","oq":"OQ-10","fix":"assign the asset''s ca_class. MEASURED HAZARD: the immutability allowlist admits ca_class only while the depreciation particulars are incomplete, so a fully-registered asset may have no in-product door to be classified through until OQ-10 is ruled"}', '2020-01-01'),
  (null, 'disposal_value_not_established', 1, 'absent', '—',
   '{"rung":"R5","fix":"the human keys the Schedule 3 para 62(1) disposal value (the greater of market value and net proceeds) with its basis at the disposal''s approval. The accounting proceeds are a different number"}', '2020-01-01'),
  -- R6-R8, the carry-forward walls.
  (null, 'losses_brought_forward_unknown', 1, 'absent', '—',
   '{"rungs":"R7,R8","fix":"record the tax_carryforwards row for this kind and year of assessment. A human asserting there is none keys amount_cents = 0 WITH a basis: nobody entered it and there is none are different states"}', '2020-01-01'),
  (null, 'loss_relief_rules_unread', 1, 'undefined', '—',
   '{"rungs":"R7,R8","gate":"survey U5","fix":"seed PR 1/2022 (tax treatment of losses) from an official source. A nil carry computes; a non-nil carry waits for the authority"}', '2020-01-01'),
  -- The entity walls.
  (null, 'sme_facts_missing', 1, 'absent', '—',
   '{"rungs":"R10,R11","fix":"record the named client_tax_attributes row effective on or before the basis period start. An unknown SME status is a question to the human, never a rate -- it does NOT fall back to 24%"}', '2020-01-01'),
  (null, 'business_source_count_unknown', 1, 'absent', '—',
   '{"rungs":"R4-R7","fix":"record business_source_count. Absence is not an assertion of one source"}', '2020-01-01'),
  (null, 'multiple_business_sources_unmodelled', 1, 'undefined', '—',
   '{"rungs":"R4-R7","fix":"v1 models exactly one business source. Nothing in the estate carries a business-source dimension, so ring-fencing capital allowances and the per-source nil floor cannot be expressed -- it refuses rather than collapsing two sources into one silently"}', '2020-01-01'),
  (null, 'entity_transparent_no_entity_charge', 1, 'refused', '—',
   '{"rungs":"R9-R12","fix":"a sole proprietorship or partnership is transparent: there is no entity tax charge and no CP204. The worksheet hands adjusted and statutory income to the proprietor''s Form B or the partners'' Form P shares. Zero is a number and it would be wrong"}', '2020-01-01'),
  (null, 'entity_identifier_missing', 1, 'absent', '—',
   '{"artifact":"pack","fix":"add the client''s kind=tin (or ssm) row through add_client_identifier. The pack is transcribed character-for-character into MyTax, so a blank field is worse than a refusal"}', '2020-01-01'),
  -- CP204 and the pack.
  (null, 'prior_estimate_unknown', 1, 'absent', '—',
   '{"rung":"R11","fix":"record the cp204_filings row for the computed year of assessment. The 85% floor is said beside the estimate rather than silently omitted; the estimate itself still computes"}', '2020-01-01'),
  (null, 'form_version_superseded', 1, 'refused', '—',
   '{"artifact":"pack","fix":"re-map the field pack to the published form edition through publish_tax_form_field_map. A field id that moved between editions is how a correct number lands in the wrong box"}', '2020-01-01'),
  -- 裁-33 (owner, 2026-08-29; ledgered at docs/plan/active/mohe-grill-rulings-2026-08-29.md):
  -- there is NO golden bar and a tax computation goes to DRAFT
  -- ONLY, never `issued`; PR-7 (the artifacts) is not built for beta. `report_runs` keeps its
  -- pre-existing `issued` value -- it is Wave-E's enum, shared with every other report class,
  -- and narrowing it would be a shared-surface change for one item's convenience -- so the
  -- TRANSITION is walled by name instead. Seeded here because part 2 section 9's law is that a
  -- string with no reason row can be raised but never persisted: PR-7's wall, whenever it is
  -- built, needs its name to already exist. Nothing in THIS PR's six relations carries a
  -- lifecycle-state column at all (proven positively in S10), so nothing here presumes an
  -- issued state exists.
  (null, 'tax_issue_unavailable', 1, 'refused', '—',
   '{"ruling":"裁-33","ruling_source":"docs/plan/active/mohe-grill-rulings-2026-08-29.md 裁-33","artifact":"statement,pack","fix":"a tax computation is a DRAFT for a human professional to review and key; it is never issued from Clara. The terminal state for beta is draft, and no F-T3 verb transitions a report_run to issued"}', '2020-01-01');

reset role;

-- =====================================================================================
-- S10 -- TAIL SELF-PROOF. Every claim re-READ from the catalog, never taken from this
-- file's own say-so. Raises on failure; ends with the census a reviewer actually reads.
-- =====================================================================================
do $s10$
declare
  v_rel      text;
  v_n        int;
  v_m        int;
  v_txt      text;
  v_cols     text[];
  v_trig     text[];
  v_moved    text;
  v_new_fns  text;
  v_relations constant text[] := array[
    'tax_authorities', 'tax_treatment_codes', 'tax_rate_bands', 'capital_allowance_rates',
    'tax_thresholds', 'tax_add_back_class_map'];
  v_ladder_reasons constant text[] := array[
    'close_not_sealed', 'basis_period_undetermined',
    'basis_period_not_coextensive_with_close', 'account_untreated', 'treatment_unapproved',
    'treatment_code_unsigned', 'treatment_on_non_pl_account', 'rate_row_missing_for_ya',
    'ca_class_unassigned', 'disposal_value_not_established', 'sme_facts_missing',
    'business_source_count_unknown', 'multiple_business_sources_unmodelled',
    'losses_brought_forward_unknown', 'loss_relief_rules_unread',
    'entity_transparent_no_entity_charge', 'prior_estimate_unknown', 'citation_missing',
    'entity_identifier_missing', 'mixed_account_needs_split', 'form_version_superseded',
    'close_snapshot_missing_pl_rows'];
  v_leaves constant text[] := array[
    'entertainment', 'donations_approved', 'donations_unapproved', 'fines_and_penalties',
    'depreciation_and_amortisation', 'leave_passage', 'private_and_proprietor_expenses',
    'motor_running_costs', 'club_subscriptions_and_entrance_fees', 'doubtful_debts_specific',
    'doubtful_debts_general', 'unapproved_provident_fund'];
begin
  -- (1) THE D1 PROOF. Not a comment: every function that existed in schema clara before S1
  --     is re-read and its definition compared byte-for-byte. A single moved body means this
  --     file replaced a live writer and the D1 write-quiesce inventory above is a lie.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_moved
    from _ft3_pr1_pre_fn pre
    join pg_proc p on p.oid = pre.oid
   where md5(p.prosrc)       is distinct from pre.src_md5
      or p.prolang           is distinct from pre.prolang
      or p.prosecdef         is distinct from pre.prosecdef
      or p.provolatile       is distinct from pre.provolatile
      or p.proisstrict       is distinct from pre.proisstrict
      or p.proleakproof      is distinct from pre.proleakproof
      or p.proowner          is distinct from pre.proowner
      or p.proconfig         is distinct from pre.proconfig
      or p.prorettype        is distinct from pre.prorettype
      or p.proretset         is distinct from pre.proretset
      or p.proargtypes::text is distinct from pre.argtypes
      or p.proacl::text      is distinct from pre.acl;
  if v_moved is not null then
    raise exception 'S10: D1 INVENTORY VIOLATED -- this file moved the definition of: %', v_moved
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from _ft3_pr1_pre_fn pre
    left join pg_proc p on p.oid = pre.oid where p.oid is null;
  if v_n <> 0 then
    raise exception 'S10: D1 INVENTORY VIOLATED -- % pre-existing clara function(s) no longer exist', v_n
      using errcode = 'CLR10';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_new_fns
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
     and not exists (select 1 from _ft3_pr1_pre_fn pre where pre.oid = p.oid);
  if v_new_fns is distinct from 'clara._tf_ft3_law_row_immutable()' then
    raise exception 'S10: expected exactly one new clara function (clara._tf_ft3_law_row_immutable()), got: %', coalesce(v_new_fns, '<none>')
      using errcode = 'CLR10';
  end if;

  -- (2) Per relation: exists, owned by clara_fn_owner, forced RLS, exactly one owner-only
  --     policy, relacl NULL (the true closed world), three triggers by name.
  foreach v_rel in array v_relations loop
    if to_regclass('clara.' || v_rel) is null then
      raise exception 'S10: clara.% does not exist after S2-S7', v_rel using errcode = 'CLR10';
    end if;
    if (select pg_get_userbyid(c.relowner) from pg_class c
         where c.oid = ('clara.' || v_rel)::regclass) <> 'clara_fn_owner' then
      raise exception 'S10: clara.% is not owned by clara_fn_owner', v_rel using errcode = 'CLR10';
    end if;
    if not exists (select 1 from pg_class c where c.oid = ('clara.' || v_rel)::regclass
                     and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'S10: clara.% does not carry ENABLE + FORCE row level security', v_rel
        using errcode = 'CLR10';
    end if;
    select count(*) into v_n from pg_policies
      where schemaname = 'clara' and tablename = v_rel;
    if v_n <> 1 then
      raise exception 'S10: clara.% carries % policies, expected exactly 1', v_rel, v_n
        using errcode = 'CLR10';
    end if;
    if not exists (
      select 1 from pg_policies where schemaname = 'clara' and tablename = v_rel
        and policyname = 'p_' || v_rel || '_owner'
        and roles = array['clara_fn_owner']::name[]
        and qual = 'true' and with_check = 'true') then
      raise exception 'S10: clara.%''s policy is not the unconditional clara_fn_owner-only shape', v_rel
        using errcode = 'CLR10';
    end if;
    -- relacl IS NULL is the one predicate a role this file never named cannot slip past.
    if (select relacl from pg_class where oid = ('clara.' || v_rel)::regclass) is not null then
      raise exception 'S10: clara.% carries a non-null relacl -- some role holds an explicit grant', v_rel
        using errcode = 'CLR10';
    end if;
    -- No firm_id column: these are law, not tenant data (mechanics M4 class B).
    if exists (select 1 from pg_attribute a where a.attrelid = ('clara.' || v_rel)::regclass
                 and a.attname = 'firm_id' and a.attnum > 0 and not a.attisdropped) then
      raise exception 'S10: clara.% carries a firm_id column -- a platform law table must not look like tenant data', v_rel
        using errcode = 'CLR10';
    end if;
    select coalesce(array_agg(t.tgname order by t.tgname), '{}') into v_trig
      from pg_trigger t where t.tgrelid = ('clara.' || v_rel)::regclass and not t.tgisinternal;
    if v_trig <> array['t_' || v_rel || '_immutable', 't_' || v_rel || '_no_delete',
                       't_' || v_rel || '_no_truncate'] then
      raise exception 'S10: clara.% trigger census mismatch -- got %', v_rel, v_trig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (3) The roster diagnosis beneath the relacl proof: WHICH app role, if (2) ever fires.
  select string_agg(x.rel || '/' || x.role || ':' || x.priv, ', ') into v_txt
    from (select r.rel, ro.role, pr.priv
            from unnest(v_relations) r(rel)
            cross join unnest(array['clara_authenticated', 'clara_agent_ro',
              'clara_wake_interactive', 'clara_wake_proactive', 'clara_runtime',
              'clara_freeform_ro']) ro(role)
            cross join unnest(array['select', 'insert', 'update', 'delete']) pr(priv)
           where has_table_privilege(ro.role, 'clara.' || r.rel, pr.priv)) x;
  if v_txt is not null then
    raise exception 'S10: unexpected reach on an F-T3 law table (roster diagnosis) -- %', v_txt
      using errcode = 'CLR10';
  end if;

  -- (4) The shared trigger function: SECURITY DEFINER, owned by clara_fn_owner, PUBLIC has
  --     no EXECUTE.
  if not exists (select 1 from pg_proc p
                   where p.oid = 'clara._tf_ft3_law_row_immutable()'::regprocedure
                     and p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'S10: clara._tf_ft3_law_row_immutable is missing, not SECURITY DEFINER, or not owned by clara_fn_owner'
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', 'clara._tf_ft3_law_row_immutable()', 'execute') then
    raise exception 'S10: PUBLIC can EXECUTE clara._tf_ft3_law_row_immutable -- the revoke did not take'
      using errcode = 'CLR10';
  end if;

  -- (5) Column census on the two tables whose shape a departure changed, so a silent
  --     re-shape is caught here rather than in PR-2.
  select array_agg(a.attname order by a.attnum) into v_cols from pg_attribute a
    where a.attrelid = 'clara.tax_treatment_codes'::regclass
      and a.attnum > 0 and not a.attisdropped;
  if v_cols <> array['code','direction','fraction_bp','requires_apportionment',
                     'refusal_reason_key','regime','statutory_ref','effective_ya_from',
                     'effective_ya_to','authority_id','conflict','notes','valid_through',
                     'owner_signed_by','owner_signed_at','revision','superseded_by',
                     'superseded_at','seeded_in_migration','created_at'] then
    raise exception 'S10: tax_treatment_codes column census mismatch -- got %', v_cols
      using errcode = 'CLR10';
  end if;
  select array_agg(a.attname order by a.attnum) into v_cols from pg_attribute a
    where a.attrelid = 'clara.tax_thresholds'::regclass
      and a.attnum > 0 and not a.attisdropped;
  if v_cols <> array['id','ya','key','value_cents','value_bp','value_int','authority_id',
                     'conflict','valid_through','revision','superseded_by','superseded_at',
                     'seeded_in_migration','created_at'] then
    raise exception 'S10: tax_thresholds column census mismatch -- got %', v_cols
      using errcode = 'CLR10';
  end if;

  -- (6) Seeded row counts, per relation, by this file's own stem.
  select count(*) into v_n from clara.tax_authorities
    where seeded_in_migration = 'f_t3_pr_1_tax_platform';
  if v_n <> 26 then raise exception 'S10: tax_authorities seeded % rows, expected 26 (14 act sections + 2 schedule paragraphs + 7 public rulings + 3 LHDN pages)', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.tax_authorities where evidence_grade = 'reference_only_unfetched';
  if v_n <> 3 then
    raise exception 'S10: % authority row(s) are graded reference_only_unfetched, expected exactly 3 (PR 4/2015, PR 1/2003, PR 4/2019)', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.tax_authorities
    where evidence_grade = 'reference_only_unfetched' and valid_through > date '2026-08-29';
  if v_n <> 0 then
    raise exception 'S10: % unfetched authority row(s) carry a valid_through beyond 2026-08-29 -- an unread citation must be due for review NOW, not at the end of the year', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.tax_treatment_codes
    where seeded_in_migration = 'f_t3_pr_1_tax_platform';
  if v_n <> 13 then raise exception 'S10: tax_treatment_codes seeded % rows, expected 13', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.tax_rate_bands
    where seeded_in_migration = 'f_t3_pr_1_tax_platform';
  if v_n <> 12 then raise exception 'S10: tax_rate_bands seeded % rows, expected 12', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.capital_allowance_rates
    where seeded_in_migration = 'f_t3_pr_1_tax_platform';
  if v_n <> 5 then raise exception 'S10: capital_allowance_rates seeded % rows, expected 5', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.tax_thresholds
    where seeded_in_migration = 'f_t3_pr_1_tax_platform';
  if v_n <> 38 then raise exception 'S10: tax_thresholds seeded % rows, expected 38 (12 keys x 3 YAs + the YA2024/2025 foreign-holding pair)', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.tax_add_back_class_map
    where seeded_in_migration = 'f_t3_pr_1_tax_platform';
  if v_n <> 12 then raise exception 'S10: tax_add_back_class_map seeded % rows, expected 12', v_n using errcode = 'CLR10'; end if;

  -- (7) OQ-7's fail-closed default, proven POSITIVELY: not one seeded code carries a
  --     signature, and not one authority does either.
  select count(*) into v_n from clara.tax_treatment_codes where owner_signed_by is not null;
  if v_n <> 0 then
    raise exception 'S10: % treatment code(s) are SIGNED -- OQ-7''s fail-closed default requires every seeded code to be unsigned and therefore unusable', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.tax_authorities where owner_signed_by is not null;
  if v_n <> 0 then
    raise exception 'S10: % authority row(s) are SIGNED at seed time', v_n using errcode = 'CLR10';
  end if;

  -- (8) The map is TOTAL over the twelve research leaves and covers each EXACTLY ONCE, and
  --     donations_approved lands on the refuse code (OQ-11).
  select count(*) into v_n from clara.tax_add_back_class_map m
    where m.superseded_at is null and m.add_back_class = any (v_leaves);
  select count(distinct m.add_back_class) into v_m from clara.tax_add_back_class_map m
    where m.superseded_at is null;
  if v_n <> 12 or v_m <> 12 then
    raise exception 'S10: the add_back_class map covers % of the 12 research leaves across % distinct classes -- it must be total and one row per leaf', v_n, v_m
      using errcode = 'CLR10';
  end if;
  select c.direction into v_txt from clara.tax_add_back_class_map m
    join clara.tax_treatment_codes c on c.code = m.code
   where m.add_back_class = 'donations_approved' and m.superseded_at is null;
  if v_txt is distinct from 'refuse' then
    raise exception 'S10: donations_approved maps to a % code -- OQ-11''s fail-closed default requires the REFUSE code (a flat add-back overstates the charge silently)', coalesce(v_txt, '<nothing>')
      using errcode = 'CLR10';
  end if;

  -- (9) Every refuse code's refusal_reason_key resolves to a seeded reason row. This is part
  --     2 section 9's persistability law applied to the code table: a refusal a code names
  --     but no reason row backs could never reach a metric_cell.
  select string_agg(c.code || '->' || c.refusal_reason_key, ', ') into v_txt
    from clara.tax_treatment_codes c
   where c.direction = 'refuse'
     and not exists (select 1 from clara.metric_na_reason_versions n
                      where n.reason_key = c.refusal_reason_key and n.firm_id is null);
  if v_txt is not null then
    raise exception 'S10: refuse code(s) name a refusal string with no seeded reason row -- %', v_txt
      using errcode = 'CLR10';
  end if;

  -- (10) The refusal vocabulary: the 22 ladder rows as a CLOSED set, plus exactly one OQ-11
  --      row, all firm_id NULL, all version 1.
  select count(*) into v_n from clara.metric_na_reason_versions
    where reason_key = any (v_ladder_reasons) and firm_id is null and version = 1;
  if v_n <> 22 then
    raise exception 'S10: % of the 22 ladder refusal rows landed as platform rows at version 1', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.metric_na_reason_versions
    where reason_key = 's44_6_relief_unmodelled' and firm_id is null and version = 1;
  if v_n <> 1 then
    raise exception 'S10: the OQ-11 fail-closed reason row (s44_6_relief_unmodelled) landed % times, expected 1', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.metric_na_reason_versions
    where reason_key = 'tax_issue_unavailable' and firm_id is null and version = 1
      and cell_status = 'refused';
  if v_n <> 1 then
    raise exception 'S10: the 裁-33 draft-only reason row (tax_issue_unavailable) landed % times as a platform refused row, expected 1', v_n
      using errcode = 'CLR10';
  end if;
  -- F-T3's OWN keys are the closed world -- exactly one row each, no duplicate version.
  -- DELIBERATELY NOT a table-wide count(*): clara.metric_na_reason_versions is a SHARED,
  -- append-only, estate-wide catalog this migration does not own. A total would be a claim
  -- about every lane's rows, and on any database where another lane has since added one, this
  -- tail would abort a REAL ceremony over a row that is none of its business.
  select count(*) into v_n from (
    select n.reason_key from clara.metric_na_reason_versions n
     where n.firm_id is null and n.version = 1
       and n.reason_key = any (v_ladder_reasons || array['s44_6_relief_unmodelled','tax_issue_unavailable'])
     group by n.reason_key having count(*) = 1) x;
  if v_n <> 24 then
    raise exception 'S10: % of F-T3''s 24 reason keys exist as exactly one platform v1 row (22 ladder + 1 OQ-11 + 1 裁-33)', v_n
      using errcode = 'CLR10';
  end if;
  -- And the nine pre-existing Wave-E rows are untouched. Scoped to PLATFORM VERSION 1, not to
  -- "every row carrying a Wave-E key": a LATER version of one of those keys is lawful (the
  -- unique is (firm_id, reason_key, version) NULLS NOT DISTINCT) and belongs to whichever lane
  -- minted it. `firm_id is null and version = 1` is the predicate no other lane can move --
  -- those rows already exist, so the unique forbids a second one -- which makes it the only
  -- form of this check that cannot abort a real ceremony over somebody else's row.
  select count(*) into v_n from clara.metric_na_reason_versions
    where firm_id is null and version = 1
      and reason_key = any (array['divide_by_zero','negative_denominator','absent',
      'prior_period_absent','account_set_drift','account_set_resolution_absent',
      'account_set_resolution_ambiguous','account_set_expansion','sign_presentation_mismatch']);
  if v_n <> 9 then
    raise exception 'S10: the 9 pre-existing Wave-E platform v1 reason rows now count % -- this file must not touch them', v_n
      using errcode = 'CLR10';
  end if;

  -- (10b) 裁-33's OTHER half, proven POSITIVELY rather than by the absence of a state machine:
  --       not one of the six relations carries a lifecycle-state column, so nothing this file
  --       builds can presume that an `issued` state exists. `report_runs` keeps its own
  --       pre-existing `issued` value (Wave-E's enum, shared with every report class); the
  --       TRANSITION is what tax_issue_unavailable walls, and that wall is PR-7's to build --
  --       which 裁-33 rules is not built for beta at all.
  select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
    into v_txt
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where a.attrelid = any (select ('clara.' || x)::regclass from unnest(v_relations) x)
     and a.attnum > 0 and not a.attisdropped
     and a.attname in ('status', 'state', 'lifecycle_state', 'issue_mode', 'issued_at', 'issued_by');
  if v_txt is not null then
    raise exception 'S10: 裁-33 -- an F-T3 platform relation carries a lifecycle-state column (%), so this file would presume a state machine it must not have', v_txt
      using errcode = 'CLR10';
  end if;

  -- (11) THE DELIBERATE ABSENCES, reported BY QUERY rather than asserted by comment. Each
  --      one must resolve to ZERO rows; a non-zero count means somebody quietly seeded a row
  --      whose authority nobody has read.
  select count(*) into v_n from clara.capital_allowance_rates where ca_class ilike '%ict%';
  if v_n <> 0 then raise exception 'S10: % ICT capital-allowance row(s) exist -- survey U1 says the gazette is unread', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.tax_thresholds where key = 'sva_annual_cap';
  if v_n <> 0 then raise exception 'S10: % sva_annual_cap row(s) exist -- survey U2 says PR 3/2021 is unfetched', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.tax_treatment_codes where direction = 'exclude';
  if v_n <> 0 then raise exception 'S10: % exclude-direction code(s) exist -- no official-source read grounds one yet', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.tax_rate_bands where regime like 'individual%';
  if v_n <> 0 then raise exception 'S10: % individual rate band(s) exist -- v1 computes no individual entity charge', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.tax_thresholds where key = 'msmc_foreign_holding_max_bp' and ya = 2023;
  if v_n <> 0 then raise exception 'S10: % YA2023 msmc_foreign_holding_max_bp row(s) exist -- the >20%% test is effective from YA2024 only', v_n using errcode = 'CLR10'; end if;

  -- (12) Nothing this file seeded is superseded or signed on arrival, and every code's
  --      authority resolves.
  select count(*) into v_n from clara.tax_treatment_codes c
    left join clara.tax_authorities a on a.id = c.authority_id where a.id is null;
  if v_n <> 0 then raise exception 'S10: % code(s) name an authority that does not resolve', v_n using errcode = 'CLR10'; end if;

  raise notice 'F-T3 PR-1 S10 tail census: 6 platform relations (tax_authorities, tax_treatment_codes, tax_rate_bands, capital_allowance_rates, tax_thresholds, tax_add_back_class_map), each owned by clara_fn_owner with ENABLE+FORCE RLS, exactly 1 unconditional clara_fn_owner policy, relacl NULL (true closed world, clean 6-role roster diagnosis), no firm_id column, and 3 triggers (immutable / no-delete / no-truncate). 1 new function: clara._tf_ft3_law_row_immutable(), SECURITY DEFINER, clara_fn_owner-owned, PUBLIC execute revoked. D1 PROVEN EMPTY by whole-catalog census over prosrc + language + SECURITY DEFINER + volatility + strictness + leakproof + OWNER + SET config + return type + setof + argument types + ACL -- twelve attributes, deliberately NOT the functiondef renderer, which the replay measured renders neither the owner nor the ACL: every pre-existing clara function unchanged on all twelve, none dropped, exactly one added.';
  raise notice 'F-T3 PR-1 seeded rows: 26 tax_authorities (22 official_primary + 1 official_secondary + 3 reference_only_unfetched, the three carrying a valid_through of 2026-08-29 so the law-review belt raises them on its FIRST run rather than in a January mid-filing) | 13 tax_treatment_codes, ALL UNSIGNED (OQ-7 fail-closed: every treatment refuses treatment_code_unsigned until a named licensed tax agent signs) | 12 tax_rate_bands (company_msmc 3 bands x YA2023-2025, company_standard 1 band x YA2023-2025) | 5 capital_allowance_rates | 38 tax_thresholds (12 keys x YA2023-2025 + msmc_foreign_holding_max_bp x YA2024-2025) | 12 tax_add_back_class_map rows covering all 12 裁-21 research leaves exactly once, donations_approved -> REFUSE_DONATION_S44_6 (OQ-11).';
  raise notice 'F-T3 PR-1 refusal vocabulary: 22 ladder rows (part 2 section 9''s 21 + delta D-9 close_snapshot_missing_pl_rows) + 1 OQ-11 row (s44_6_relief_unmodelled) + 1 裁-33 row (tax_issue_unavailable, the draft-only wall) = 24 new metric_na_reason_versions rows, every one firm_id = NULL / version = 1 / effective_from 2020-01-01, each existing EXACTLY once, with the 9 pre-existing Wave-E rows untouched (scoped to F-T3''s own keys, never a table-wide count on a shared estate catalog this file does not own). 裁-33 also proven positively: not one of the six relations carries a status/state/issue_mode/issued_at/issued_by column, so nothing built here presumes an issued state exists. DELIBERATE ABSENCES, each proven by a zero COUNT not by a comment: ICT capital-allowance class (survey U1) = 0 rows | sva_annual_cap (survey U2) = 0 rows | exclude-direction codes = 0 rows | individual rate bands = 0 rows | YA2023 msmc_foreign_holding_max_bp = 0 rows.';
end $s10$;
