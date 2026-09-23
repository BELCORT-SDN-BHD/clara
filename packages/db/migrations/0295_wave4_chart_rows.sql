-- 0295_wave4_chart_rows -- WAVE-4 PRE-STEP: the four standard-chart rows the deferred-revenue
-- (#941), accrued-income (#942), payroll-posting (#946) and tenancy-rent (#949) lanes share,
-- landed ONCE, alone, before those lanes are cut -- so every lane consumes the rows BY NAME and
-- none of them inserts its own.
-- =====================================================================================
-- Spec of record: issues #941, #942, #946, #949 and the owner's rulings of 2026-09-20 on all
-- four (read via `gh issue view <n> --repo BELCORT-SDN-BHD/clara --json body,comments`).
--
-- THE FOUR ROWS AND WHY EACH ONE EXISTS. Quoting the rulings, not paraphrasing them:
--   `2030 Deferred Revenue`   (liability) -- #941's own ruling: "The standard chart gains 2030
--     Deferred Revenue (liability) and 1180 Accrued Income (asset) for new clients".
--   `1180 Accrued Income`     (asset)     -- SHARED by #941 and #942. #942's ruling (2026-09-20):
--     "this ticket and #941 SHARE one new standard-chart row, 1180 Accrued Income (asset).
--     Whichever of the two lands first adds it; the other reuses it and mints nothing. Clara
--     suggests it by default, and the accountant may choose another suitable account the client
--     already has (active, asset, not a control account)". Accounting basis the ruling checked
--     before asking: accrued income is a current asset presented apart from invoiced trade
--     receivables, so a dedicated row is the ordinary treatment.
--   `Salaries Payable`        (liability) -- #946 AC1: "appends a salaries-payable account to
--     the standard chart template as an ordinary liability with no class"; #946's own body:
--     "salaries payable is an ordinary liability account and deliberately not a control
--     account, since this lane carries no employee-level detail to reconcile against".
--   `Rent Payable`            (liability) -- #949's ruling (2026-09-20): "A NEW dedicated
--     standard-chart liability row, Rent Payable, not 2010 Other Payables and not 2020
--     Accruals... The dedicated row was chosen so each month's unpaid rent is visible on its
--     own, as #946 does for salaries." #949's own 2026-09-19 narrowing comment records that this
--     lands "in the same chart-template migration as #946 (Salaries Payable) and #941
--     (Deferred Revenue / Accrued Income) rather than as three separate template edits" -- this
--     file is that one migration, plus #942's own account.
--
-- CODES CHOSEN BY THIS FILE (2030 and 1180 are the rulings' own literals; 2040/2050 are this
-- file's choice, recorded here as the rulings direct). `clara.coa_template_accounts` seeds the
-- estate's ONE generic, non-industry "standard chart" -- template_key='my_sme_starter'
-- (0150:1358-1377, "the FIRM-LEVEL STANDARD CHART OF ACCOUNTS"), never the industry variants
-- (e.g. professional_services' own 1320 Unbilled Receivables, which #942's own triage comment
-- names and rejects as "one industry template, not the generic standard chart every client
-- gets"). Malaysia's 4-digit plain-code liability block (Q2, 0150 header) runs trade_payables at
-- 2000 Trade Payables Control / 2010 Other Payables / 2020 Accruals, then statutory_payables at
-- 2100-2150, director/related-party at 2160/2170, equity_company's Dividends Payable at 2180,
-- construction_contracts at 2200+. Salaries Payable and Rent Payable are each a NEW, DEDICATED
-- trade_payables row for the SAME stated reason Deferred Revenue is (0150's own family already
-- houses "Other Payables" and "Accruals" -- the two accounts these rulings explicitly say NOT to
-- reuse): 2040 and 2050 continue trade_payables' own contiguous run (2000/2010/2020/2030/2040/
-- 2050) immediately after this file's own 2030, next to the rows they sit beside, inside a block
-- (2031-2099) this file measured empty on the live template before choosing them (this file's own
-- prestate re-proves it). 1180 Accrued Income joins trade_receivables (Trade and Other
-- Receivables) at sort_ordinal 45, between 1130 Prepayments (40) and 1190 Allowance for Doubtful
-- Debts (50) -- the same "other receivable, not billed yet" shelf Prepayments and Other
-- Receivables already occupy, and the code 1180 the ruling itself names sits in the gap the
-- template already carried between 1170 (director/related-party) and 1190.
--
-- WHY A NEW TEMPLATE VERSION, NOT A NEW ROW ON v1. MEASURED on this database (a rolled-back
-- probe transaction, not asserted from memory): inserting a fifth account into
-- clara.coa_template_accounts against the LIVE my_sme_starter v1 raises
--   CLR08 "coa template <id> is published, not a draft -- its families and accounts are frozen"
-- from `t_coa_template_accounts_freeze` / `clara._tf_coa_template_child_freeze()` (0150:604-663).
-- This is not incidental -- it is D-2's whole promise (0150's own header, "a template edit cannot
-- rewrite an applied chart... structural on the template side") and the mechanism
-- `content_sha256` exists to prove: a published template's rows, and the hash over them, never
-- move again. Disabling the trigger to write into v1 directly would falsify that hash for every
-- past reader who trusted it and would make C1's "the seed's structural invariants" (42 families
-- / 142 accounts, coa-template-pr-a.test.mjs) describe a moving target instead of 0150's own
-- fixed artifact -- exactly the failure mode 0150's header names for the DIFFERENT reason 0293's
-- own README section documents at length (packages/db/README.md, "Pinning another function's
-- body hash"). The schema's own `version int not null` column and
-- `uq_coa_templates_platform_version (template_key, version) where scope='platform'` exist for
-- precisely this case. This file therefore mints my_sme_starter **v2**: a byte-for-byte copy of
-- v1's 42 families and 142 accounts (the same INSERT ... SELECT shape `fork_coa_template` itself
-- uses, 0150:889-899) plus the four new rows, then publishes it exactly as 0150 published v1 --
-- a raw `insert ... values(..., 'draft', ...)` followed by a raw
-- `update ... set state='published', published_at=now(), content_sha256=...` (0150:1649-1652) --
-- because `clara._coa_template_for_edit` refuses ANY edit of a platform-scope template by name
-- (`platform_template_not_editable`, 0150:810-812): the platform starter is authored by the
-- migration ladder, never by an in-product door, and that is true of v2 exactly as it was of v1.
-- v1 is left EXACTLY as published -- this file issues no UPDATE, DELETE or INSERT against v1's
-- own rows anywhere -- so `coa-template-pr-a.test.mjs`'s C1/C2 and the whole
-- `coa-template-pr-b.test.mjs` apply battery, both of which pin v1 specifically (the latter's own
-- `platformStarter()` helper already reads `and version = 1`, coa-template-pr-b-helpers.mjs:198 --
-- precedent this file follows rather than invents), keep testing 0150's own fixed artifact
-- unchanged and need no edit. `coa-template-pr-a-helpers.mjs`'s sibling `platformTemplate()` had
-- no such filter (nothing needed one while only one platform row ever existed); this file adds
-- one line to it, `and version = 1`, in this same commit, matching the pattern already
-- established next door -- the smallest edit that keeps every existing pr-a assertion resolving
-- to the same row it always has. `dba-coding-lane-classification.test.mjs` already reads
-- `... order by version desc limit 1` (its own pre-existing convention for "whichever the CURRENT
-- one is") and needs no change at all -- it will pick v2 up automatically, exactly as its own
-- query says it should.
--
-- EXISTING CLIENTS ARE NOT TOUCHED, BY CONSTRUCTION, NOT BY CONVENTION. A client's chart
-- (`clara.coa_accounts`) is planted once, by `clara.apply_coa_template` (0156), which COPIES rows
-- out of whichever template_id the caller names (0156's own header: "copy-not-reference"); no
-- door in the estate re-syncs a client's chart against a template after the fact ("publish
-- template row to existing clients" is not a mechanism this estate has, and the rulings do not
-- ask for one -- so none is invented here). A client who already adopted v1 (`coa_template_
-- adoptions.template_id` naming v1's id) keeps exactly the 142-account chart they were given;
-- nothing about this file's v2 row is reachable from an existing adoption, and this file writes
-- no row to `coa_template_adoptions` at all. A NEW client reaches the four rows only by a human
-- picking v2 (or a template forked from it) through the existing `list_coa_templates` /
-- `apply_coa_template` doors -- unchanged surfaces, no new door.
--
-- A NEW VERSION CARRIES FOUR TIERS, NOT TWO. clara.coa_template_entity_overrides (0156:388-412)
-- is the THIRD child tier of a template and it is keyed BY template_id (0156:401,
-- `primary key (template_id, entity_type, account_code)`), with 0156's two reviewed society rows
-- seeded against v1 ONLY (0156:443-459, `... and t.version = 1`). A version that copies only the
-- families and the accounts therefore ships a chart whose society variant is GONE: measured
-- through the estate's own single spelling, clara._coa_effective_account_name, a society client
-- on such a version is planted BOTH 3040 'Accumulated Fund' and an un-relabelled 3900 'Retained
-- Earnings' -- the two-accounts-one-name defect 0156's seed block exists to discharge, and the
-- exact outcome its own M3/M4 mutants name (coa-template-pr-b.test.mjs:928-950). This file
-- therefore copies that tier too, verbatim and basis and all, AFTER the accounts (the composite
-- FK fk_coa_override_account references coa_template_accounts(template_id, account_code)), and
-- the tail proves v2's census EQUALS v1's row for row rather than merely counting it. The
-- override tier does not enter clara._coa_template_content_sha256 -- that helper hashes the
-- families' and the accounts' content only -- so the copy leaves v2's published hash untouched.
--
-- NO RIG-META COHORT IS OWED. This file mints no relation, no function, no role and no grant --
-- it is four INSERTs and one UPDATE against tables 0150 already created, exactly the same claim
-- 0278 and 0292 make for the same reason (packages/db/README.md, "0292" section). A template row
-- is data, not a name a cohort would track.
-- =====================================================================================

do $p295_pre$
declare
  v1_id uuid; v1_version int; v1_state text; v1_fam int; v1_acc int; v1_hash text;
  v2_id uuid; v_redo boolean := false; v_bad text; v_sha text;
  c_content_sha_pre constant text :=
    'd120669e12506c1a347729008e3f11785d62c914c3955f3dd6a099fd9b20baa7';
  c_freeze_pre constant text :=
    '0fced8e2c635e5bdb306b6836b208cbae44a669f6f6549e3113017c8441d1844';
  c_child_freeze_pre constant text :=
    '504d9c613739d30c21c100d3c8c8b8dbc525ff2adeda888d554bbec0309f0ec5';
  c_v1_hash_pin constant text :=
    'd02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df';
begin
  select id, version, state into v1_id, v1_version, v1_state
    from clara.coa_templates
   where scope = 'platform' and template_key = 'my_sme_starter' and version = 1;
  if v1_id is null then
    raise exception '0295 prestate: the platform starter my_sme_starter v1 is absent -- 0150 has not landed on this database'
      using errcode = 'CLR10';
  end if;
  if v1_state is distinct from 'published' then
    raise exception '0295 prestate: my_sme_starter v1 is %, not published', v1_state
      using errcode = 'CLR10';
  end if;

  select count(*) into v1_fam from clara.coa_template_families where template_id = v1_id;
  select count(*) into v1_acc from clara.coa_template_accounts where template_id = v1_id;
  if v1_fam <> 42 or v1_acc <> 142 then
    raise exception '0295 prestate: my_sme_starter v1 carries % families / % accounts, expected 42 / 142 -- the platform starter has drifted from 0150''s own seed', v1_fam, v1_acc
      using errcode = 'CLR10';
  end if;
  select encode(content_sha256, 'hex') into v1_hash from clara.coa_templates where id = v1_id;
  if v1_hash is distinct from c_v1_hash_pin then
    raise exception '0295 prestate: my_sme_starter v1''s content_sha256 has DRIFTED from its pinned value (measured %, expected %)', v1_hash, c_v1_hash_pin
      using errcode = 'CLR10';
  end if;

  -- THE FOUR CODES, AND THE 2031-2099 BAND SALARIES/RENT PAYABLE ARE CHOSEN FROM, ARE ABSENT
  -- FROM v1 -- proof this file MINTS them rather than re-stating something 0150 already shipped,
  -- and that the codes this file picks do not collide with anything the template already carries.
  select string_agg(account_code, ', ' order by account_code) into v_bad
    from clara.coa_template_accounts
   where template_id = v1_id and account_code = any(array['1180','2030','2040','2050']);
  if v_bad is not null then
    raise exception '0295 prestate: my_sme_starter v1 already carries %, so this migration would duplicate an existing row', v_bad
      using errcode = 'CLR10';
  end if;

  -- NON-REGRESSION PINS. This file recuts nothing; it calls clara._coa_template_content_sha256
  -- to hash v2's content (never re-derives the hash by hand) and relies on the two freeze
  -- triggers' documented admitted-transition shape for the draft -> published dance below and
  -- for the redo teardown further down. Pinned so a future recut of any of the three is forced
  -- to re-derive this file's argument, per packages/db/README.md's own pinning convention.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._coa_template_content_sha256(uuid)'::regprocedure;
  if v_sha is distinct from c_content_sha_pre then
    raise exception '0295 prestate: clara._coa_template_content_sha256(uuid) has DRIFTED from its pinned body (measured %, expected %)', v_sha, c_content_sha_pre
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_coa_template_freeze()'::regprocedure;
  if v_sha is distinct from c_freeze_pre then
    raise exception '0295 prestate: clara._tf_coa_template_freeze() has DRIFTED from its pinned body (measured %, expected %)', v_sha, c_freeze_pre
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_coa_template_child_freeze()'::regprocedure;
  if v_sha is distinct from c_child_freeze_pre then
    raise exception '0295 prestate: clara._tf_coa_template_child_freeze() has DRIFTED from its pinned body (measured %, expected %)', v_sha, c_child_freeze_pre
      using errcode = 'CLR10';
  end if;

  -- REDO (#957). my_sme_starter v2 is minted EXCLUSIVELY by this file -- nothing else in the
  -- estate creates or references a my_sme_starter version 2 row. If it already exists, this is a
  -- redo of 0295 itself: tear its rows down (disabling the three freeze triggers for exactly
  -- these statements, re-enabled immediately in this same transaction -- precedent 0227:346-348,
  -- 0176:261-266, 0184:406-408, 0007:831-853) and rebuild them fresh below, so a redo after an
  -- edit produces exactly what a first apply of the edited file would. Refused outright if v2
  -- somehow already has a client adoption (it should not -- this branch exists for an unmerged
  -- lane fixing its own mistake, never for real client data).
  select id into v2_id from clara.coa_templates
   where scope = 'platform' and template_key = 'my_sme_starter' and version = 2;
  if v2_id is not null then
    v_redo := true;
    if exists (select 1 from clara.coa_template_adoptions where template_id = v2_id) then
      raise exception '0295 redo: my_sme_starter v2 (%) already has a client adoption -- refusing to tear it down', v2_id
        using errcode = 'CLR10';
    end if;
    raise notice '0295 prestate: my_sme_starter v2 (%) already exists -- treating this as a #957 REDO of 0295 itself; its rows will be rebuilt from scratch.', v2_id;
    alter table clara.coa_template_accounts disable trigger t_coa_template_accounts_freeze;
    alter table clara.coa_template_families disable trigger t_coa_template_families_freeze;
    alter table clara.coa_templates disable trigger t_coa_templates_freeze;
    -- OVERRIDES FIRST. fk_coa_override_account references
    -- coa_template_accounts(template_id, account_code) (0156:403-404), so the accounts delete
    -- below raises 23503 while v2 still carries the society rows this file copies. The override
    -- table carries no freeze trigger of its own -- only t_..._no_truncate -- so a plain delete
    -- is all it needs.
    delete from clara.coa_template_entity_overrides where template_id = v2_id;
    delete from clara.coa_template_accounts where template_id = v2_id;
    delete from clara.coa_template_families where template_id = v2_id;
    delete from clara.coa_templates where id = v2_id;
    alter table clara.coa_templates enable trigger t_coa_templates_freeze;
    alter table clara.coa_template_families enable trigger t_coa_template_families_freeze;
    alter table clara.coa_template_accounts enable trigger t_coa_template_accounts_freeze;
  end if;

  raise notice '0295 prestate: clean (% apply) -- my_sme_starter v1 (%) is published, unmoved at 42 families / 142 accounts, hash %, carries none of 1180/2030/2040/2050, and the three functions this file depends on are at their pinned bodies.',
    case when v_redo then 'REDO' else 'FIRST' end, v1_id, v1_hash;
end
$p295_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- THE SEED. v1 copied verbatim (42 families / 142 accounts, the same INSERT ... SELECT shape
-- clara.fork_coa_template uses at 0150:889-899) into a fresh v2, plus the four new accounts,
-- then published exactly as 0150 published v1 (0150:1649-1652). v1 itself is never touched.
-- =====================================================================================
do $p295_seed$
declare
  v1_id uuid; v2_id uuid; v_sha bytea;
begin
  select id into v1_id from clara.coa_templates
   where scope = 'platform' and template_key = 'my_sme_starter' and version = 1;

  insert into clara.coa_templates(scope, firm_id, template_key, version, title,
      framework_hint, basis, state, forked_from, created_by)
    values ('platform', null, 'my_sme_starter', 2,
      'Malaysian SME Standard Chart of Accounts (starter)',
      'MPERS',
      'v1 (migration 0150, 裁-23 Q1) carried forward verbatim (42 families, 142 accounts), plus '
      || 'four rows the wave-4 family shares (issues #941, #942, #946, #949; owner rulings '
      || '2026-09-20, migration 0295): 2030 Deferred Revenue (liability, #941) and 1180 Accrued '
      || 'Income (asset, SHARED by #941 and #942 -- Clara suggests it by default, the accountant '
      || 'may pick another suitable active, non-control asset account) join trade_receivables / '
      || 'trade_payables beside 2010 Other Payables, 2020 Accruals and 1130 Prepayments; Salaries '
      || 'Payable (liability, #946, "an ordinary liability with no class") and Rent Payable '
      || '(liability, #949, "not 2010 Other Payables and not 2020 Accruals... so each month''s '
      || 'unpaid rent is visible on its own") are each a dedicated trade_payables row at 2040 and '
      || '2050, continuing that family''s own contiguous 2000/2010/2020/2030 run. Minted as a new '
      || 'version rather than an edit of v1 because clara._tf_coa_template_child_freeze refuses '
      || 'any insert against a published template''s rows (measured CLR08 '
      || 'coa_template_immutable against live v1) and clara._coa_template_for_edit refuses to '
      || 'edit a platform-scope template by name -- the migration ladder authors this row exactly '
      || 'as it authored v1, and v1 stays published, untouched, for every existing adopter.',
      'draft', v1_id, null)
    returning id into v2_id;

  insert into clara.coa_template_families(template_id, family_key, label, inclusion, basis,
      sort_ordinal, msic_sections, msic_divisions, msic_edition, trade_natures, entity_types)
    select v2_id, f.family_key, f.label, f.inclusion, f.basis, f.sort_ordinal,
           f.msic_sections, f.msic_divisions, f.msic_edition, f.trade_natures, f.entity_types
      from clara.coa_template_families f where f.template_id = v1_id;

  insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
      account_type, account_class, special_acc_type, sort_ordinal,
      tax_sensitive, add_back_class, statutory)
    select v2_id, a.family_key, a.account_code, a.name, a.account_type, a.account_class,
           a.special_acc_type, a.sort_ordinal, a.tax_sensitive, a.add_back_class, a.statutory
      from clara.coa_template_accounts a where a.template_id = v1_id;

  -- THE FOUR NEW ROWS. None is tax-sensitive, none carries an add-back class or a statutory tag
  -- and none is a control account (account_class null) -- the same shape 1110 Other Receivables,
  -- 1120 Deposits Paid, 1130 Prepayments, 2010 Other Payables and 2020 Accruals already carry.
  insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
      account_type, account_class, special_acc_type, sort_ordinal,
      tax_sensitive, add_back_class, statutory)
    values
      (v2_id, 'trade_receivables', '1180', 'Accrued Income', 'asset', null, null, 45,
        false, null, null),
      (v2_id, 'trade_payables', '2030', 'Deferred Revenue', 'liability', null, null, 40,
        false, null, null),
      (v2_id, 'trade_payables', '2040', 'Salaries Payable', 'liability', null, null, 50,
        false, null, null),
      (v2_id, 'trade_payables', '2050', 'Rent Payable', 'liability', null, null, 60,
        false, null, null);

  -- THE ENTITY OVERRIDES, CARRIED FORWARD. clara.coa_template_entity_overrides is keyed BY
  -- template_id (0156:401) and its two reviewed rows were seeded against v1 ONLY
  -- (0156:443-459, `... and t.version = 1`), so a new version starts with NONE of them. Left
  -- uncopied, a SOCIETY client adopting v2 is planted BOTH 3040 'Accumulated Fund' and an
  -- un-relabelled 3900 'Retained Earnings' -- exactly the two-accounts-one-name defect 0156's
  -- seed block exists to discharge, and exactly what its own M3/M4 mutants name. Copied with
  -- the same INSERT ... SELECT shape the families and accounts use, AFTER the accounts (the FK
  -- fk_coa_override_account references coa_template_accounts(template_id, account_code)), and
  -- verbatim -- the basis text travels too, because a row that cannot say where it came from has
  -- established nothing (0156's own words for this column).
  insert into clara.coa_template_entity_overrides(template_id, entity_type, account_code,
      override_name, suppress, basis)
    select v2_id, o.entity_type, o.account_code, o.override_name, o.suppress, o.basis
      from clara.coa_template_entity_overrides o where o.template_id = v1_id;

  v_sha := clara._coa_template_content_sha256(v2_id);
  update clara.coa_templates
     set state = 'published', published_at = now(), content_sha256 = v_sha
   where id = v2_id;

  raise notice '0295 seed: my_sme_starter v2 (%) PUBLISHED -- 42 families / 146 accounts (142 carried over from v1 verbatim, 4 new: 1180 Accrued Income, 2030 Deferred Revenue, 2040 Salaries Payable, 2050 Rent Payable) and % entity override row(s) carried forward from v1, content_sha256 %.',
    v2_id, (select count(*) from clara.coa_template_entity_overrides where template_id = v2_id), encode(v_sha, 'hex');
end
$p295_seed$;

reset role;

-- =====================================================================================
-- THE TAIL. Every assertion re-read from the CATALOG after the seed.
-- =====================================================================================
do $p295_tail$
declare
  v1_id uuid; v1_fam int; v1_acc int; v1_hash text;
  v2_id uuid; v2_fam int; v2_acc int; v2_state text; v2_hash text;
  v2_created_by uuid; v2_published_by uuid; v2_forked_from uuid;
  v_bad text; v_n int; v_row record;
  c_v1_hash_pin constant text :=
    'd02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df';
begin
  -- T.1 v1 IS UNTOUCHED: same counts, same pinned hash, and it still reproduces its own hash.
  select id into v1_id from clara.coa_templates
   where scope = 'platform' and template_key = 'my_sme_starter' and version = 1;
  select count(*) into v1_fam from clara.coa_template_families where template_id = v1_id;
  select count(*) into v1_acc from clara.coa_template_accounts where template_id = v1_id;
  select encode(content_sha256, 'hex') into v1_hash from clara.coa_templates where id = v1_id;
  if v1_fam <> 42 or v1_acc <> 142 then
    raise exception '0295 tail T.1: my_sme_starter v1 now carries % families / % accounts -- it MOVED', v1_fam, v1_acc
      using errcode = 'CLR10';
  end if;
  if v1_hash is distinct from c_v1_hash_pin then
    raise exception '0295 tail T.1: my_sme_starter v1''s content_sha256 has DRIFTED from its pinned value (measured %, expected %)', v1_hash, c_v1_hash_pin
      using errcode = 'CLR10';
  end if;
  if clara._coa_template_content_sha256(v1_id) is distinct from
     (select content_sha256 from clara.coa_templates where id = v1_id) then
    raise exception '0295 tail T.1: my_sme_starter v1''s stored content_sha256 no longer reproduces from its rows' using errcode = 'CLR10';
  end if;

  -- T.2 v2 EXISTS, IS PUBLISHED, IS MIGRATION-AUTHORED, AND ITS HASH REPRODUCES.
  select id, state, encode(content_sha256, 'hex'), created_by, published_by, forked_from
    into v2_id, v2_state, v2_hash, v2_created_by, v2_published_by, v2_forked_from
    from clara.coa_templates
   where scope = 'platform' and template_key = 'my_sme_starter' and version = 2;
  if v2_id is null then
    raise exception '0295 tail T.2: my_sme_starter v2 was not created' using errcode = 'CLR10';
  end if;
  if v2_state <> 'published' then
    raise exception '0295 tail T.2: my_sme_starter v2 is %, not published', v2_state
      using errcode = 'CLR10';
  end if;
  if v2_created_by is not null or v2_published_by is not null then
    raise exception '0295 tail T.2: my_sme_starter v2 names a human author or publisher -- it must be migration-authored, like v1'
      using errcode = 'CLR10';
  end if;
  if v2_forked_from is distinct from v1_id then
    raise exception '0295 tail T.2: my_sme_starter v2''s forked_from does not name v1' using errcode = 'CLR10';
  end if;
  if clara._coa_template_content_sha256(v2_id) is distinct from
     (select content_sha256 from clara.coa_templates where id = v2_id) then
    raise exception '0295 tail T.2: my_sme_starter v2''s stored content_sha256 does not reproduce from the seeded rows' using errcode = 'CLR10';
  end if;

  -- T.3 THE COUNTS: 42 families (unchanged), 146 accounts (v1's 142 plus 4 new).
  select count(*) into v2_fam from clara.coa_template_families where template_id = v2_id;
  select count(*) into v2_acc from clara.coa_template_accounts where template_id = v2_id;
  if v2_fam <> 42 then
    raise exception '0295 tail T.3: my_sme_starter v2 carries % families, expected 42 (unchanged from v1)', v2_fam
      using errcode = 'CLR10';
  end if;
  if v2_acc <> 146 then
    raise exception '0295 tail T.3: my_sme_starter v2 carries % accounts, expected 146 (v1''s 142 plus 4 new)', v2_acc
      using errcode = 'CLR10';
  end if;

  -- T.4 EACH NEW ROW, EXACTLY: code, name, type, family, sort_ordinal, and every flag column.
  for v_row in select * from (values
      ('1180', 'Accrued Income', 'asset', 'trade_receivables', 45),
      ('2030', 'Deferred Revenue', 'liability', 'trade_payables', 40),
      ('2040', 'Salaries Payable', 'liability', 'trade_payables', 50),
      ('2050', 'Rent Payable', 'liability', 'trade_payables', 60)
    ) as t(code, name, typ, fam, ord) loop
    if not exists (
      select 1 from clara.coa_template_accounts a
       where a.template_id = v2_id and a.account_code = v_row.code and a.name = v_row.name
         and a.account_type = v_row.typ and a.family_key = v_row.fam
         and a.sort_ordinal = v_row.ord
         and a.account_class is null and a.special_acc_type is null
         and a.tax_sensitive = false and a.add_back_class is null and a.statutory is null
    ) then
      raise exception '0295 tail T.4: % (%) is not seeded on v2 exactly as specified', v_row.code, v_row.name
        using errcode = 'CLR10';
    end if;
  end loop;

  -- T.5 NO CODE COLLIDES ACROSS EVERY TEMPLATE THE ESTATE SHIPS. Each of the four new codes
  -- appears EXACTLY ONCE in the whole of clara.coa_template_accounts (v1 carries none of them,
  -- proven again here rather than only trusted from the prestate; v2 carries each once; no other
  -- platform or firm-scope template exists on a from-scratch chain to carry a fifth).
  select string_agg(account_code || '=' || n, ', ' order by account_code) into v_bad
    from (select account_code, count(*) n from clara.coa_template_accounts
           where account_code = any(array['1180','2030','2040','2050'])
           group by account_code) s
   where n <> 1;
  if v_bad is not null then
    raise exception '0295 tail T.5: a new code does not appear EXACTLY ONCE across every coa_template_accounts row this estate ships -- %', v_bad
      using errcode = 'CLR10';
  end if;

  -- T.6 EXACTLY TWO platform rows for my_sme_starter (v1, v2), BOTH published -- v1 was never
  -- retired, so every existing adopter and every test that names it by version=1 is unaffected.
  select count(*) into v_n from clara.coa_templates
   where scope = 'platform' and template_key = 'my_sme_starter';
  if v_n <> 2 then
    raise exception '0295 tail T.6: my_sme_starter carries % platform rows, expected 2 (v1, v2)', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.coa_templates
   where scope = 'platform' and template_key = 'my_sme_starter' and state = 'published';
  if v_n <> 2 then
    raise exception '0295 tail T.6: % of my_sme_starter''s platform rows are published, expected 2', v_n
      using errcode = 'CLR10';
  end if;

  -- T.7 THE FIVE SPECIAL MARKERS SURVIVED THE COPY, once each, at their v1 codes (0150's own
  -- S8 census: OBE=9900, RE=3900, rounding=9910, sst_output=2150, sst_purchase_cost=9920).
  select string_agg(special_acc_type || '=' || account_code, ' · ' order by special_acc_type)
    into v_bad
    from clara.coa_template_accounts where template_id = v2_id and special_acc_type is not null;
  if v_bad is distinct from 'opening_balance_equity=9900 · retained_earnings=3900 · rounding=9910 · sst_output=2150 · sst_purchase_cost=9920' then
    raise exception '0295 tail T.7: v2''s special-marker census is %', v_bad using errcode = 'CLR10';
  end if;

  -- T.8 THE THREE FREEZE TRIGGERS ARE ARMED (proves the redo branch, if it ran, re-enabled every
  -- one it disabled -- never trusted from the three ENABLE lines alone).
  select string_agg(format('%s.%s=%s', c.relname, t.tgname, t.tgenabled), ', ' order by c.relname, t.tgname)
    into v_bad
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where t.tgname in ('t_coa_templates_freeze', 't_coa_template_families_freeze',
                       't_coa_template_accounts_freeze');
  if v_bad is distinct from 'coa_template_accounts.t_coa_template_accounts_freeze=O, coa_template_families.t_coa_template_families_freeze=O, coa_templates.t_coa_templates_freeze=O' then
    raise exception '0295 tail T.8: the freeze triggers'' enabled state is % -- expected all three armed (O)', v_bad
      using errcode = 'CLR10';
  end if;

  -- T.9 v2 IS NOW FROZEN TOO, the same as v1: a sixth account is refused CLR08.
  begin
    insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
        account_type, sort_ordinal)
      values (v2_id, 'trade_payables', '2060', 'probe', 'liability', 70);
    raise exception '0295 tail T.9: v2 accepted a new account row after being published -- it is not frozen'
      using errcode = 'CLR10';
  exception
    when others then
      if sqlstate is distinct from 'CLR08' then raise; end if;
  end;

  -- T.10 THE ENTITY OVERRIDES CENSUS: v2 carries EXACTLY what v1 carries, row for row. A count
  -- would not catch a row that travelled with the wrong name, the wrong flag or a lost basis, so
  -- this compares the whole tuple set both ways (an EXCEPT in each direction, not a count).
  select string_agg(format('%s/%s %s suppress=%s', entity_type, account_code,
           coalesce(override_name, '<null>'), suppress), ' · ' order by entity_type, account_code)
    into v_bad
    from ((select entity_type, account_code, override_name, suppress, basis
             from clara.coa_template_entity_overrides where template_id = v2_id
           except
           select entity_type, account_code, override_name, suppress, basis
             from clara.coa_template_entity_overrides where template_id = v1_id)
          union all
          (select entity_type, account_code, override_name, suppress, basis
             from clara.coa_template_entity_overrides where template_id = v1_id
           except
           select entity_type, account_code, override_name, suppress, basis
             from clara.coa_template_entity_overrides where template_id = v2_id)) d;
  if v_bad is not null then
    raise exception '0295 tail T.10: v2''s entity-override census does not equal v1''s -- the symmetric difference is % (a society client adopting v2 would be planted BOTH 3040 and an un-relabelled 3900)', v_bad
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.coa_template_entity_overrides where template_id = v2_id;
  if v_n <> 2 then
    raise exception '0295 tail T.10: v2 carries % entity override row(s), expected 0156''s own two society rows', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '0295 tail OK: my_sme_starter v1 (%) is unmoved at 42/142, hash %; v2 (%) is PUBLISHED, migration-authored, forked_from v1, at 42 families / 146 accounts with the four new rows exactly as specified, no code collision across the estate''s templates, the five special markers intact, 0156''s two society entity overrides carried forward row for row so a society client adopting v2 still gets 3900 as `Accumulated Fund` and no 3040, all three freeze triggers armed, and v2 itself now refuses a sixth account exactly as v1 does.',
    v1_id, v1_hash, v2_id;
end
$p295_tail$;
