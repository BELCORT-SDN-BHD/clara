-- 0066_wave_e_epsilon_reporting_registry_seeds.sql -- Wave E lane epsilon, file 3 of 7.
--
-- Applies after 0065_wave_e_epsilon_reporting_registry.sql and before
-- 0067_wave_e_epsilon_reporting_schema_validators.sql. Number claims at MERGE; the
-- timeout is PRECAUTIONARY -- a few dozen reference rows.
--
-- THE CURATOR SEEDS: profile identities, their two vintages, the section/slot skeletons by
-- WORDING KEY, the protected-placeholder list, the claim-phrase lexicon and the claim-label
-- policy. STRUCTURE ONLY -- NOT ONE ROW OF STATUTORY WORDING TEXT.
--
-- WHY NO WORDING. E-R14's golden wording source needs a MANUAL pull plus HUMAN verification
-- before any text enters clara.statutory_wording (owner task #43; automated extraction of
-- MPERS_2025_BC_IE.pdf FAILED and only the failure was observed -- absence is not evidence).
-- Inventing wording is a FAIL of matrix D5. Structure cells may run on placeholder KEYS;
-- wording-CONTENT cells may not run at all until #43 clears.
--
-- The consequence is deliberate and load-bearing: because every required slot of the shipped
-- MPERS profile has no verified wording, every statutory pack assesses `failed` today and
-- cannot seal a pre_sign artifact. Owner gate #43 expressed as a DB STATE, not as a promise
-- somebody has to remember.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _epsilon_seed_pre(k text primary key, v text not null) on commit drop;
insert into _epsilon_seed_pre values ('deploy_principal', session_user);

do $pre$
declare n text;
begin
  foreach n in array array['statutory_profiles', 'statutory_profile_versions', 'statutory_sections',
    'statutory_slots', 'statutory_wording', 'protected_placeholders', 'claim_phrase_lexicon',
    'claim_policy_versions'] loop
    if to_regclass('clara.' || n) is null then
      raise exception 'epsilon seeds require clara.% (files 1-2 not applied)', n using errcode = 'CLR10';
    end if;
  end loop;
  -- The hardening pass must already have run: seeding into an unhardened table would leave the
  -- reference rows readable by whatever the default grants happen to be.
  if not exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
                  where s.nspname = 'clara' and c.relname = 'protected_placeholders'
                    and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'epsilon seeds: clara.protected_placeholders is not force-RLS -- the registry hardening pass has not run'
      using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.statutory_profiles) <> 0
     or (select count(*) from clara.protected_placeholders) <> 0
     or (select count(*) from clara.claim_policy_versions) <> 0 then
    raise exception 'epsilon seeds: the reference tables are not empty -- this file has run before'
      using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- claim_capability lives on the PROFILE because it is a property of the authority, not of a
-- firm's template: the sole-proprietor convention profile can never claim MPERS compliance
-- however a firm binds it (E-R14; matrix C5 -- the BEE pack is convention-labelled and its
-- claim assessment reads `not_applicable`).
insert into clara.statutory_profiles (profile_key, title, authority, claim_capability, source_note) values
  ('mpers_company', 'MPERS company-format financial statements', 'MASB', 'claims_compliance',
   'E-R14: MASB official, dual-version effective-dated. Structure only; wording awaits owner task #43.'),
  ('convention_sole_prop', 'Sole-proprietor accounts (practitioner convention)', 'practitioner convention', 'no_claim',
   'E-R14: no authoritative sole-prop source was FOUND -- UNRESOLVED, not proven-absent. Convention-labelled, never MPERS-claimed.');

-- BORN TWO-VERSIONED (ruled, the tax-table pattern): MPERS(2016) for periods BEGINNING before
-- 2027-01-01; MPERS(2025) for periods beginning on/after, with the 2016 text withdrawn at that
-- same boundary -- so live 2025/26 clients stay on MPERS(2016) wording (matrix D5).
insert into clara.statutory_profile_versions
    (profile_key, revision, applies_to_periods_beginning_from, applies_to_periods_beginning_to,
     content_sha256, source_note) values
  ('mpers_company', 1, '2016-01-01', '2026-12-31',
   clara._hash('{"profile":"mpers_company","vintage":"MPERS(2016)","structure_only":true}'::jsonb),
   'MPERS(2016) structure. Wording rows: none -- owner task #43 gates them.'),
  ('mpers_company', 2, '2027-01-01', null,
   clara._hash('{"profile":"mpers_company","vintage":"MPERS(2025)","structure_only":true}'::jsonb),
   'MPERS(2025), issued 2025-10-10 (IFRS for SMEs 3rd ed.). Wording rows: none -- owner task #43.'),
  ('convention_sole_prop', 1, '2016-01-01', null,
   clara._hash('{"profile":"convention_sole_prop","structure_only":true}'::jsonb),
   'Interim practitioner convention: P&L + SoFP + capital-account movement, honestly labelled.');

-- The required section set IS the honest-FS law made data (PRD SS4 item 14; matrix D7: the
-- pack ships SoFP + SoCI + SOCE + cash-flow + basic notes, or it does not claim MPERS
-- compliance -- the two are one cell). Claim assessment READS these rows; it carries no
-- hard-coded list of statement names, so a later profile revision changes the law by changing
-- data rather than by changing a body.
insert into clara.statutory_sections (profile_version_id, section_key, ordinal, title_wording_key, required)
select v.id, s.section_key, s.ordinal, s.title_wording_key, s.required
  from clara.statutory_profile_versions v
  cross join (values
    ('statement_of_financial_position', 0, 'sofp.title', true),
    ('statement_of_comprehensive_income', 1, 'soci.title', true),
    ('statement_of_changes_in_equity', 2, 'soce.title', true),
    ('statement_of_cash_flows', 3, 'scf.title', true),
    ('notes', 4, 'notes.title', true)) as s(section_key, ordinal, title_wording_key, required)
 where v.profile_key = 'mpers_company';

insert into clara.statutory_sections (profile_version_id, section_key, ordinal, title_wording_key, required)
select v.id, s.section_key, s.ordinal, s.title_wording_key, s.required
  from clara.statutory_profile_versions v
  cross join (values
    ('profit_and_loss', 0, 'sp.pl.title', true),
    ('statement_of_financial_position', 1, 'sp.sofp.title', true),
    ('capital_account_movement', 2, 'sp.capital.title', true)) as s(section_key, ordinal, title_wording_key, required)
 where v.profile_key = 'convention_sole_prop';

-- One required heading slot per section: the minimum that makes "a required slot with no
-- verified wording assesses `failed`" a live rule rather than a plan.
insert into clara.statutory_slots
    (profile_version_id, section_key, slot_key, ordinal, wording_key, slot_kind, required)
select s.profile_version_id, s.section_key, 'heading', 0, s.title_wording_key, 'heading', true
  from clara.statutory_sections s;

-- The ruled protected-placeholder list (SS7), enumerated once and read by both enforcement
-- points: the layout-AST validator at publish/draft time, and the manifest resolver at render
-- time (lane zeta).
insert into clara.protected_placeholders (placeholder_key, description, resolves_from, effective_from, source_note) values
  ('entity_legal_name', 'The entity''s legal name as registered', 'clara.clients', '2016-01-01', 'SS7 ruled protected list'),
  ('registration_identifiers', 'Registration number / TIN / other registered identifiers', 'clara.client_facts', '2016-01-01', 'SS7 ruled protected list'),
  ('reporting_period', 'The period the statements present', 'clara.reporting_periods', '2016-01-01', 'SS7 ruled protected list'),
  ('currency_unit', 'Presentation currency and unit', 'clara.report_spec_versions.parameters', '2016-01-01', 'SS7 ruled protected list'),
  ('statement_titles', 'The prescribed statement titles', 'clara.statutory_wording', '2016-01-01', 'SS7 ruled protected list'),
  ('totals', 'Every total and subtotal on the face of a statement', 'clara.metric_cells', '2016-01-01', 'SS7 ruled protected list'),
  ('note_references', 'Note cross-references printed on the face', 'clara.report_dataset_points', '2016-01-01', 'SS7 ruled protected list'),
  ('claim_wording', 'The compliance-claim sentence itself', 'clara.claim_policy_versions', '2016-01-01', 'SS7 ruled protected list');

-- OPEN OWNER ITEM, RECORDED RATHER THAN INVENTED. The ms and zh rows carry only the standard's
-- own NAME token, which is the same string in all three locales. Expanding them with Malay and
-- Chinese compliance phrasing is an owner-verification item of the same family as task #43 --
-- a guessed legal phrase is a guessed refusal, and inventing one here would be matrix D5's
-- failure wearing a different hat. Lane zeta's gate-3 scan must therefore treat a locale whose
-- lexicon has no effective row as a REFUSAL, never as a pass.
insert into clara.claim_phrase_lexicon (phrase_key, locale, version, phrase, match_kind, effective_from, source_note) values
  ('standard_name_token', 'en', 1, 'MPERS', 'substring_ci', '2016-01-01', 'The standard''s own name token -- identical in en/ms/zh.'),
  ('standard_name_token', 'ms', 1, 'MPERS', 'substring_ci', '2016-01-01', 'The standard''s own name token -- identical in en/ms/zh.'),
  ('standard_name_token', 'zh', 1, 'MPERS', 'substring_ci', '2016-01-01', 'The standard''s own name token -- identical in en/ms/zh.'),
  ('standard_full_name', 'en', 1, 'Malaysian Private Entities Reporting Standard', 'substring_ci', '2016-01-01', 'MASB''s own English title of the standard.'),
  ('compliance_sentence', 'en', 1, 'in accordance with the Malaysian Private Entities Reporting Standard', 'substring_ci', '2016-01-01', 'The English compliance-sentence stem.'),
  ('true_and_fair', 'en', 1, 'true and fair view', 'substring_ci', '2016-01-01', 'CA 2016 assurance phrasing; never product-emitted.');

-- The product's own claim wording is "presentation-profile checks passed", NEVER a legal
-- certification (E-R14, ruled). Issue remains a professional human act.
insert into clara.claim_policy_versions (policy_key, version, locale, status_labels, effective_from, source_note) values
  ('fs_claim_policy', 1, 'en', jsonb_build_object(
      'eligible', 'Presentation-profile checks passed.',
      'not_applicable', 'No compliance claim applies to this report class.',
      'stripped', 'Compliance claim removed: this pack departs from the prescribed structure.',
      'failed', 'Compliance assessment failed; this pack is not issuable.'),
    '2016-01-01', 'E-R14: the label comes from versioned policy rows, never a literal in a body.');

reset role;

-- =====================================================================================
-- TAIL CENSUS (file 3). Counts and windows re-read from the live rows.
-- =====================================================================================
do $tail$
declare
  v_wording int; v_placeholders int; v_lexicon int; v_policies int;
  v_profiles int; v_profile_versions int; v_sections int; v_slots int;
  v_required_unverified int; v_curated_writers int;
begin
  select count(*) into v_wording from clara.statutory_wording;
  if v_wording <> 0 then
    raise exception 'epsilon seeds tail: % statutory wording row(s) shipped -- owner task #43 forbids any', v_wording
      using errcode = 'CLR10';
  end if;

  select count(*) into v_profiles from clara.statutory_profiles;
  select count(*) into v_profile_versions from clara.statutory_profile_versions;
  select count(*) into v_sections from clara.statutory_sections;
  select count(*) into v_slots from clara.statutory_slots;
  select count(*) into v_placeholders from clara.protected_placeholders;
  select count(*) into v_lexicon from clara.claim_phrase_lexicon;
  select count(*) into v_policies from clara.claim_policy_versions;
  if v_profiles <> 2 or v_profile_versions <> 3 or v_sections <> 13 or v_slots <> 13
     or v_placeholders <> 8 or v_lexicon <> 6 or v_policies <> 1 then
    raise exception 'epsilon seeds tail: census profiles %, versions %, sections %, slots %, placeholders %, lexicon %, policies %',
      v_profiles, v_profile_versions, v_sections, v_slots, v_placeholders, v_lexicon, v_policies
      using errcode = 'CLR10';
  end if;

  -- BORN TWO-VERSIONED at the ruled boundary, and the windows MEET rather than overlap or gap.
  if not exists (select 1 from clara.statutory_profile_versions a
                   join clara.statutory_profile_versions b
                     on b.profile_key = a.profile_key and b.revision = a.revision + 1
                  where a.profile_key = 'mpers_company' and a.revision = 1
                    and a.applies_to_periods_beginning_to = date '2026-12-31'
                    and b.applies_to_periods_beginning_from = date '2027-01-01'
                    and b.applies_to_periods_beginning_to is null) then
    raise exception 'epsilon seeds tail: the profile is not born two-versioned at the ruled 2027-01-01 boundary'
      using errcode = 'CLR10';
  end if;

  -- The gate, stated as a measured number rather than as prose: every required slot of every
  -- shipped profile version currently lacks verified wording, so every statutory pack assesses
  -- `failed` until owner task #43 lands rows here.
  select count(*) into v_required_unverified
    from clara.statutory_slots s
    join clara.statutory_profile_versions v on v.id = s.profile_version_id
   where s.required
     and not exists (select 1 from clara.statutory_wording w
                      where w.profile_key = v.profile_key and w.wording_key = s.wording_key
                        and w.verification_state = 'verified');
  if v_required_unverified <> v_slots then
    raise exception 'epsilon seeds tail: % of % required slots lack verified wording -- expected all of them at birth',
      v_required_unverified, v_slots using errcode = 'CLR10';
  end if;

  -- THE 0016 CURATION PROBE (matrix A29's method): no function granted to ANY app role has a
  -- body that writes these eight curated tables. Reading this file's own (absent) grant
  -- statements would be file text, not privilege state -- the defect A29 was rewritten to
  -- remove.
  select count(*) into v_curated_writers
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) a
    join pg_roles r on r.oid = a.grantee
   where p.pronamespace = 'clara'::regnamespace and a.privilege_type = 'EXECUTE'
     and r.rolname = any (array['clara_authenticated', 'clara_agent_ro', 'clara_runtime',
       'clara_runtime_login', 'clara_wake_interactive', 'clara_wake_proactive'])
     and lower(coalesce(p.prosrc, '')) ~ '(insert\s+into|update|delete\s+from)\s+clara\.(statutory_profiles|statutory_profile_versions|statutory_sections|statutory_slots|statutory_wording|protected_placeholders|claim_phrase_lexicon|claim_policy_versions)\M';
  if v_curated_writers <> 0 then
    raise exception 'epsilon seeds tail: % granted function(s) write a curated reference table', v_curated_writers
      using errcode = 'CLR10';
  end if;

  if current_user <> (select v from _epsilon_seed_pre where k = 'deploy_principal')
     or current_role <> (select v from _epsilon_seed_pre where k = 'deploy_principal') then
    raise exception 'epsilon seeds tail: role was not reset (user %, role %)', current_user, current_role
      using errcode = 'CLR10';
  end if;

  raise notice 'epsilon seeds OK: % profiles / % versions born two-versioned meeting exactly at 2027-01-01 / % required sections / % required slots; % protected placeholders; % lexicon phrases (en full, ms+zh name-token only -- expansion is an owner item of the #43 family); % claim-label policy carrying all four ruled states. statutory_wording rows = 0 and ALL % required slots lack verified wording, so every statutory pack assesses `failed` and cannot seal a pre_sign artifact until owner task #43 lands verified rows -- the gate is a DB STATE, not a promise. Zero granted writers over the eight curated tables (0016 aclexplode probe, matrix A29 method).',
    v_profiles, v_profile_versions, v_sections, v_slots, v_placeholders, v_lexicon, v_policies, v_slots;
end $tail$;
