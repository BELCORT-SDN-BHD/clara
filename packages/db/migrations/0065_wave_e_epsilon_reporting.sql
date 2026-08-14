-- 0065_wave_e_epsilon_reporting.sql -- Wave E lane epsilon, file 1 of 8: LAYERS 1-5.
--
-- MIGRATION NUMBERS claim at MERGE (standing law, .claude/rules/db-migrations.md). This file
-- lands AFTER lane delta (0058-0061: metrics, behavior, security, residuals), 0056 (close
-- model) and 0057 (period registry). Its six siblings MUST follow it, in this order -- which is
-- also the order their filenames sort in:
--   _registry.sql            claim assessment, charts, artifacts, the uniform hardening pass
--   _registry_seeds.sql      the curator seeds (structure only; ZERO wording rows)
--   _schema_validators.sql   the closed layout / chart / manifest validators
--   _security.sql            the four publishing verbs
--   _security_seal.sql       the run, the claim assessment, the dataset seal
--   _security_seal_artifacts.sql  the artifact seal (gate 1), issue approval, verify
-- Applied alone, this file leaves 12 tables with NO RLS and NO grants; the registry file is
-- what hardens them, and its own prestate refuses to run if this one is absent. Seven files
-- because of the repo's 500-line discipline, on the lane-delta four-file precedent.
--
-- DESIGN HOME: docs/plan/active/wave-e-design-reporting-part2.md SS6 (the six-layer template
-- model, E-R14). The CONTRACT (docs/plan/active/wave-e-contract.md, ADR-065) WINS on any
-- divergence. Acceptance oracles: wave-e-acceptance-matrix.md cells A29, C5, D5, D6, D7.
--
-- CEREMONY POSTURE -- ADDITIVE AND INERT ON ARRIVAL. All three epsilon files create only NEW
-- objects: no existing function body is replaced, no existing table altered, no trigger added
-- to any pre-existing table, nothing backfilled. There is therefore NO D1 write-quiesce
-- obligation -- no in-flight call can span these migrations and run an old body of something
-- they changed, because they change nothing. The statement_timeout is PRECAUTIONARY (pure DDL
-- over empty new relations), never load-bearing.
--
-- CLR CODES. These files raise only codes already in the live roster -- CLR04 authorization,
-- CLR05 maker-checker, CLR08 immutability, CLR10 validation, CLR11 firm-scoping -- except for
-- ONE new code the security file PROPOSES for the seal/claim gate family. That proposal is
-- claimed at MERGE against the live roster, exactly like the migration number.
--
-- FIRM_ID ON CURATOR TABLES. The statutory_* family carries a nullable firm_id constrained to
-- NULL. The column exists so the estate's ONE RLS predicate (firm_id is null or
-- firm_id = clara.jwt_firm(), the lane-delta idiom) applies unchanged and the census can loop
-- uniformly; the CHECK states "curator-only, never firm-editable" in the schema rather than in
-- a comment that nothing enforces.

set local statement_timeout = '5min';   -- PRECAUTIONARY (see the header).

create temp table _epsilon_pre(k text primary key, v text not null) on commit drop;
insert into _epsilon_pre values ('deploy_principal', session_user);

-- =====================================================================================
-- E0 -- PRESTATE. Measure every claim this file makes about what it builds on, and ABORT on a
-- false premise rather than proceed. 0056/0057 are checked by VERSION. Lane delta is checked by
-- OBJECT: it had no number yet when this file was authored, and the object checks are the more
-- durable test anyway -- they survived delta's renumber into 0058-0061 without an edit, which is
-- the property a version string would not have had.
-- =====================================================================================
do $pre$
declare n text;
begin
  foreach n in array array['0056_wave_e_close_model', '0057_wave_e_registry_snapshots'] loop
    if not exists (select 1 from clara.schema_migrations where version = n) then
      raise exception 'epsilon requires %', n using errcode = 'CLR10';
    end if;
  end loop;

  -- Lane delta, by object. Every one of these is an FK target or a positive read downstream.
  foreach n in array array[
    'metric_cells', 'metric_evaluation_contexts', 'metric_input_snapshots',
    'metric_definitions', 'metric_definition_versions', 'metric_constants', 'evaluator_versions'
  ] loop
    if to_regclass('clara.' || n) is null then
      raise exception 'epsilon requires lane-delta relation clara.%', n using errcode = 'CLR10';
    end if;
  end loop;

  foreach n in array array[
    'clara._hash(jsonb)', 'clara._human_ctx(integer)', 'clara.role_rank(text)',
    'clara._reserve_op(uuid,text,text,bytea)', 'clara._finish_op(uuid,text,text,jsonb)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)', 'clara._tf_append_only()',
    'clara._tf_no_truncate()', 'clara._has_capability(uuid,uuid,text)',
    'clara.eligible_checker_count(uuid)', 'clara.jwt_firm()',
    'clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception 'epsilon helper absent: %', n using errcode = 'CLR10';
    end if;
  end loop;

  -- PARTIAL BIRTH. A half-applied epsilon is a worse state than an unapplied one, and the
  -- runner's checksum wall cannot see it.
  foreach n in array array[
    'statutory_profiles', 'statutory_profile_versions', 'statutory_sections', 'statutory_slots',
    'statutory_wording', 'house_styles', 'house_style_versions', 'report_templates',
    'report_template_versions', 'report_specs', 'report_spec_versions', 'report_runs',
    'claim_policy_versions', 'claim_phrase_lexicon', 'protected_placeholders',
    'report_claim_assessments', 'chart_templates', 'chart_template_versions',
    'report_datasets', 'report_dataset_points', 'report_artifacts'
  ] loop
    if to_regclass('clara.' || n) is not null then
      raise exception 'epsilon partial birth: clara.% already exists', n using errcode = 'CLR10';
    end if;
  end loop;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- E1 -- LAYER 1: THE STATUTORY AUTHORITY PROFILE (ADOPT; writer = NONE, migration-only).
-- No curator UI ships in Wave E, so these rows arrive by migration and leave by migration.
-- claim_capability lives on the PROFILE because it is a property of the authority, not of a
-- firm's template: the sole-proprietor convention profile can never claim MPERS compliance
-- however a firm binds it (E-R14; matrix C5).
-- =====================================================================================
create table clara.statutory_profiles (
  profile_key      text primary key,
  firm_id          uuid references clara.firms(id),
  title            text not null check (btrim(title) <> ''),
  authority        text not null check (btrim(authority) <> ''),
  claim_capability text not null check (claim_capability in ('claims_compliance', 'no_claim')),
  source_note      text not null check (btrim(source_note) <> ''),
  created_at       timestamptz not null default now(),
  constraint ck_statutory_profiles_curated check (firm_id is null)
);

create table clara.statutory_profile_versions (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid references clara.firms(id),
  profile_key    text not null references clara.statutory_profiles(profile_key),
  revision       int  not null check (revision > 0),
  -- PERIODS BEGINNING, not render dates: E-R14's 2027-01-01 MPERS(2025) boundary is a
  -- period-beginning boundary (wave-e-contract.md:290-292), and a render-date reading would
  -- put a 2026 client on 2025-standard wording the moment the calendar turned.
  applies_to_periods_beginning_from date not null,
  applies_to_periods_beginning_to   date,
  content_sha256 bytea not null check (octet_length(content_sha256) = 32),
  source_note    text not null check (btrim(source_note) <> ''),
  created_at     timestamptz not null default now(),
  unique (profile_key, revision),
  constraint ck_spv_window check (applies_to_periods_beginning_to is null
    or applies_to_periods_beginning_to >= applies_to_periods_beginning_from),
  constraint ck_statutory_profile_versions_curated check (firm_id is null)
);
create index ix_spv_profile_window on clara.statutory_profile_versions
  (profile_key, applies_to_periods_beginning_from, applies_to_periods_beginning_to);

create table clara.statutory_sections (
  profile_version_id uuid not null references clara.statutory_profile_versions(id),
  firm_id            uuid references clara.firms(id),
  section_key        text not null,
  ordinal            int  not null check (ordinal >= 0),
  title_wording_key  text not null check (btrim(title_wording_key) <> ''),
  -- REQUIRED is the honest-FS law made structural (PRD SS4 item 14; matrix D7): a layout that
  -- omits a required section of the bound profile cannot assess `eligible`. Assessment reads
  -- these rows; it carries no hard-coded list of statement names.
  required           boolean not null,
  primary key (profile_version_id, section_key),
  unique (profile_version_id, ordinal),
  constraint ck_statutory_sections_curated check (firm_id is null)
);

create table clara.statutory_slots (
  profile_version_id uuid not null,
  firm_id            uuid references clara.firms(id),
  section_key        text not null,
  slot_key           text not null,
  ordinal            int  not null check (ordinal >= 0),
  wording_key        text not null check (btrim(wording_key) <> ''),
  slot_kind          text not null check (slot_kind in ('heading', 'line', 'total', 'note')),
  required           boolean not null,
  primary key (profile_version_id, section_key, slot_key),
  unique (profile_version_id, section_key, ordinal),
  foreign key (profile_version_id, section_key)
    references clara.statutory_sections (profile_version_id, section_key),
  constraint ck_statutory_slots_curated check (firm_id is null)
);

-- =====================================================================================
-- E2 -- LAYER 2: THE VERIFIED LOCALE PACK (AMENDED -- a flat 0016-idiom fact table, the
-- clara.sst_threshold_schedule shape at 0016:237-244, keyed by PERIODS BEGINNING).
--
-- ZERO ROWS ARE SEEDED, DELIBERATELY. E-R14's golden wording source needs a MANUAL pull plus
-- HUMAN verification before any text enters this table (owner task #43; automated extraction of
-- MPERS_2025_BC_IE.pdf FAILED and only the failure was observed -- absence is not evidence).
-- Inventing wording is a FAIL of matrix D5. The STRUCTURE ships now so structure cells can run
-- on placeholder KEYS; wording-CONTENT cells cannot run at all until #43 clears.
--
-- The consequence is deliberate and load-bearing: because every required slot of the shipped
-- MPERS profile has no verified wording, every statutory pack assesses `failed` today and
-- cannot seal a pre_sign artifact. That is owner gate #43 expressed as a DB STATE rather than
-- as a promise somebody has to remember.
-- =====================================================================================
create table clara.statutory_wording (
  profile_key        text not null references clara.statutory_profiles(profile_key),
  firm_id            uuid references clara.firms(id),
  wording_key        text not null,
  locale             text not null check (locale in ('en', 'ms', 'zh')),
  applies_to_periods_beginning_from date not null,
  applies_to_periods_beginning_to   date,
  wording_text       text not null check (btrim(wording_text) <> ''),
  source_manifest    jsonb check (source_manifest is null or jsonb_typeof(source_manifest) = 'object'),
  source_sha256      text check (source_sha256 ~ '^[0-9a-f]{64}$'),
  verification_state text not null check (verification_state in ('unverified', 'verified')),
  verified_by        uuid references clara.users(id),
  verified_at        timestamptz,
  source_note        text not null check (btrim(source_note) <> ''),
  created_at         timestamptz not null default now(),
  primary key (profile_key, wording_key, locale, applies_to_periods_beginning_from),
  constraint ck_statutory_wording_window check (applies_to_periods_beginning_to is null
    or applies_to_periods_beginning_to >= applies_to_periods_beginning_from),
  -- THE PROVENANCE CHECK (SS6, ruled). 'verified' is a claim about a human act; a row may not
  -- make it without the four artefacts of that act. Fail-closed by construction: 'unverified'
  -- is the state a row can always reach, and only the full quartet lifts it.
  constraint ck_statutory_wording_verified_provenance check (
    verification_state <> 'verified'
    or (source_manifest is not null and source_sha256 is not null
        and verified_by is not null and verified_at is not null)),
  constraint ck_statutory_wording_curated check (firm_id is null)
);

-- =====================================================================================
-- E3 -- LAYER 3: THE FIRM HOUSE STYLE (owner-sovereign; LLM drafts, human publishes).
-- asset_manifest pins every font/logo/image by content hash. SS7's one residual -- claim text
-- baked into image pixels, which text extraction cannot reach and this design does not OCR --
-- rests on that pin plus this layer's OWNER floor: images enter a render only as
-- content-addressed assets published by the one role that could also just approve a false
-- claim directly. Not a model-reachable channel, and not a user-supplied one.
-- =====================================================================================
create table clara.house_styles (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references clara.firms(id),
  style_key  text not null,
  title      text not null check (btrim(title) <> ''),
  created_by uuid not null references clara.users(id),
  created_at timestamptz not null default now(),
  unique (firm_id, style_key),
  unique (id, firm_id)
);

create table clara.house_style_versions (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references clara.firms(id),
  house_style_id uuid not null,
  revision       int  not null check (revision > 0),
  style_spec     jsonb not null check (jsonb_typeof(style_spec) = 'object'),
  asset_manifest jsonb not null check (jsonb_typeof(asset_manifest) = 'object'),
  content_sha256 bytea not null check (octet_length(content_sha256) = 32),
  state          text not null check (state in ('published', 'superseded')),
  effective_from date not null,
  effective_to   date,
  published_by   uuid not null references clara.users(id),
  published_at   timestamptz not null default now(),
  foreign key (house_style_id, firm_id) references clara.house_styles (id, firm_id),
  unique (house_style_id, revision),
  unique (id, firm_id),
  constraint ck_hsv_window check ((state = 'published' and effective_to is null)
    or (state = 'superseded' and effective_to >= effective_from))
);
create unique index uq_house_style_versions_current on clara.house_style_versions (house_style_id)
  where state = 'published';

-- =====================================================================================
-- E4 -- LAYERS 4 AND 6: THE REGISTERED FIRM TEMPLATE. ONE registry, not a seventh table
-- (SS6's AMEND; rationale: claim_capability stays the single decision point, and a second
-- registry is a second place to forget it). report_class discriminates; the CHECKs make a
-- management template structurally incapable of carrying a compliance claim.
-- =====================================================================================
create table clara.report_templates (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null references clara.firms(id),
  template_key text not null,
  title        text not null check (btrim(title) <> ''),
  report_class text not null check (report_class in ('statutory', 'management')),
  created_by   uuid not null references clara.users(id),
  created_at   timestamptz not null default now(),
  unique (firm_id, template_key),
  unique (id, firm_id),
  unique (id, firm_id, report_class)
);

create table clara.report_template_versions (
  id                 uuid primary key default gen_random_uuid(),
  firm_id            uuid not null references clara.firms(id),
  report_template_id uuid not null,
  -- Denormalised so the class CHECKs below are static, and bound to the parent by the
  -- three-column composite FK so it can never drift from it.
  report_class       text not null check (report_class in ('statutory', 'management')),
  revision           int  not null check (revision > 0),
  claim_capability   text not null check (claim_capability in ('claims_compliance', 'no_claim')),
  statutory_profile_version_id uuid references clara.statutory_profile_versions(id),
  house_style_version_id uuid not null,
  layout_ast         jsonb not null check (jsonb_typeof(layout_ast) = 'object'),
  content_sha256     bytea not null check (octet_length(content_sha256) = 32),
  state              text not null check (state in ('published', 'superseded')),
  effective_from     date not null,
  effective_to       date,
  published_by       uuid not null references clara.users(id),
  published_at       timestamptz not null default now(),
  foreign key (report_template_id, firm_id, report_class)
    references clara.report_templates (id, firm_id, report_class),
  foreign key (house_style_version_id, firm_id) references clara.house_style_versions (id, firm_id),
  unique (report_template_id, revision),
  unique (id, firm_id),
  unique (id, firm_id, report_class),
  constraint ck_rtv_statutory_profile
    check ((report_class = 'statutory') = (statutory_profile_version_id is not null)),
  -- E-R8: management report design is user sovereignty, and a management pack never claims
  -- statutory compliance. The single decision point, enforced statically rather than by the
  -- publishing verb remembering to.
  constraint ck_rtv_management_no_claim
    check (report_class = 'statutory' or claim_capability = 'no_claim'),
  constraint ck_rtv_window check ((state = 'published' and effective_to is null)
    or (state = 'superseded' and effective_to >= effective_from))
);
create unique index uq_report_template_versions_current on clara.report_template_versions (report_template_id)
  where state = 'published';

-- =====================================================================================
-- E5 -- LAYER 5: REPORT SPECS SPLIT FROM RUNS (SS6's AMEND). Rationale, carried: the seal
-- binds a RUN -- one snapshot, one dataset, one artifact -- while one spec legitimately runs
-- against many snapshots. A spec VERSION is immutable once written; its "draft" quality is a
-- property of the run's approval state, not of the version row. locale lives here because the
-- wording vintage a pack resolves is a per-instance choice (matrix D5).
-- =====================================================================================
create table clara.report_specs (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references clara.firms(id),
  client_id  uuid not null,
  spec_key   text not null,
  title      text not null check (btrim(title) <> ''),
  created_by uuid not null references clara.users(id),
  created_at timestamptz not null default now(),
  foreign key (client_id, firm_id) references clara.clients (id, firm_id),
  unique (client_id, spec_key),
  unique (id, firm_id, client_id)
);

create table clara.report_spec_versions (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references clara.firms(id),
  client_id      uuid not null,
  report_spec_id uuid not null,
  revision       int  not null check (revision > 0),
  report_template_version_id uuid not null,
  report_class   text not null check (report_class in ('statutory', 'management')),
  locale         text not null check (locale in ('en', 'ms', 'zh')),
  parameters     jsonb not null check (jsonb_typeof(parameters) = 'object'),
  overrides      jsonb not null check (jsonb_typeof(overrides) = 'object'),
  -- The RESOLVED layout this instance will render: the template layout with these overrides
  -- already applied, re-validated by the layout-AST validator at draft time. Storing the
  -- resolved form is what lets claim assessment compare a pack against its profile's required
  -- sections without re-running an override algebra seven years later.
  layout_ast     jsonb not null check (jsonb_typeof(layout_ast) = 'object'),
  content_sha256 bytea not null check (octet_length(content_sha256) = 32),
  state          text not null check (state in ('published', 'superseded')),
  effective_from date not null,
  effective_to   date,
  drafted_by     uuid not null references clara.users(id),
  drafted_at     timestamptz not null default now(),
  foreign key (report_spec_id, firm_id, client_id) references clara.report_specs (id, firm_id, client_id),
  foreign key (report_template_version_id, firm_id, report_class)
    references clara.report_template_versions (id, firm_id, report_class),
  unique (report_spec_id, revision),
  unique (id, firm_id, client_id),
  constraint ck_rsv_window check ((state = 'published' and effective_to is null)
    or (state = 'superseded' and effective_to >= effective_from))
);
create unique index uq_report_spec_versions_current on clara.report_spec_versions (report_spec_id)
  where state = 'published';

-- THE RUN. Its id IS the lane-delta run_id: clara.metric_evaluation_contexts is unique on
-- (client_id, run_id), so a run's contributing cells are exactly clara.metric_cells where
-- client_id = run.client_id and run_id = run.id. That binding is a verb-time POSITIVE READ --
-- the delta tables are delta's to own, and this file adds no constraint to them -- so every
-- reader downstream states the join rather than inferring membership from a name.
create table clara.report_runs (
  id                     uuid primary key default gen_random_uuid(),
  firm_id                uuid not null references clara.firms(id),
  client_id              uuid not null,
  report_spec_version_id uuid not null,
  books_snapshot_id      uuid not null,
  reporting_period_id    uuid not null,
  period_start           date not null,
  period_end             date not null,
  state                  text not null check (state in ('drafting', 'dataset_sealed', 'issued')),
  requested_by           uuid not null references clara.users(id),
  requested_at           timestamptz not null default now(),
  issued_by              uuid references clara.users(id),
  issued_at              timestamptz,
  issue_reason           text,
  issue_mode             text check (issue_mode in ('two_person', 'solo_self_attested')),
  issue_self_attestation text,
  issued_artifact_id     uuid,
  foreign key (client_id, firm_id) references clara.clients (id, firm_id),
  foreign key (report_spec_version_id, firm_id, client_id)
    references clara.report_spec_versions (id, firm_id, client_id),
  -- THE PIN. The books snapshot is delta's metric_input_snapshots row the evaluator ran
  -- against; "pinned" is a composite FK here, never a convention.
  foreign key (books_snapshot_id, firm_id, client_id)
    references clara.metric_input_snapshots (id, firm_id, client_id),
  foreign key (reporting_period_id, firm_id, client_id, period_start, period_end)
    references clara.reporting_periods (id, firm_id, client_id, period_start, period_end),
  unique (id, firm_id, client_id),
  unique (id, firm_id, client_id, books_snapshot_id),
  constraint ck_rr_issue_paired check ((state = 'issued') = (issued_by is not null)
    and (issued_by is null) = (issued_at is null)
    and (issued_by is null) = (issue_reason is null)
    and (issued_by is null) = (issue_mode is null)
    and (issued_by is null) = (issued_artifact_id is null)),
  constraint ck_rr_solo_attested check (issue_mode is distinct from 'solo_self_attested'
    or nullif(btrim(coalesce(issue_self_attestation, '')), '') is not null)
);

reset role;

-- =====================================================================================
-- TAIL CENSUS (file 1) -- the live catalog, re-read. Hardening is the registry file's job, so
-- this census states exactly what IS true here and says out loud what is not yet.
-- =====================================================================================
do $tail$
declare v_tables int; v_profiles int; v_wording int; v_hardened int;
begin
  select count(*) into v_tables from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'clara' and c.relkind = 'r'
     and c.relname = any (array['statutory_profiles', 'statutory_profile_versions',
       'statutory_sections', 'statutory_slots', 'statutory_wording', 'house_styles',
       'house_style_versions', 'report_templates', 'report_template_versions',
       'report_specs', 'report_spec_versions']);
  if v_tables <> 11 then
    raise exception 'epsilon file 1 tail: % of 11 layer tables exist', v_tables using errcode = 'CLR10';
  end if;
  if to_regclass('clara.report_runs') is null then
    raise exception 'epsilon file 1 tail: clara.report_runs absent' using errcode = 'CLR10';
  end if;

  select count(*) into v_profiles from clara.statutory_profiles;
  select count(*) into v_wording from clara.statutory_wording;
  if v_profiles <> 0 or v_wording <> 0 then
    raise exception 'epsilon file 1 tail: layer tables must arrive empty (profiles %, wording %)',
      v_profiles, v_wording using errcode = 'CLR10';
  end if;

  -- Stated as a NEGATIVE, on purpose: these tables are deliberately unhardened until the
  -- registry file runs, and a reader of this notice should be able to tell that apart from a
  -- forgotten RLS pass. The registry file's own tail asserts 21/21 hardened.
  select count(*) into v_hardened from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'clara' and c.relkind = 'r' and c.relrowsecurity
     and c.relname = any (array['statutory_profiles', 'statutory_profile_versions',
       'statutory_sections', 'statutory_slots', 'statutory_wording', 'house_styles',
       'house_style_versions', 'report_templates', 'report_template_versions',
       'report_specs', 'report_spec_versions', 'report_runs']);

  if current_user <> (select v from _epsilon_pre where k = 'deploy_principal')
     or current_role <> (select v from _epsilon_pre where k = 'deploy_principal') then
    raise exception 'epsilon file 1 tail: role was not reset (user %, role %)', current_user, current_role
      using errcode = 'CLR10';
  end if;

  raise notice 'epsilon layers 1-5 OK: 12 tables born empty (4 statutory-authority + statutory_wording + 2 house-style + 2 template + 2 spec + report_runs); wording rows = 0 (owner task #43 measured, not assumed); MPERS claim capability lives on the PROFILE so a convention pack cannot claim it; a management template version is CHECK-barred from claim_capability=claims_compliance; the run pins its books snapshot by composite FK. % of 12 carry RLS so far -- hardening is the registry file''s pass, which asserts 21/21. Deploy principal restored.',
    v_hardened;
end $tail$;
