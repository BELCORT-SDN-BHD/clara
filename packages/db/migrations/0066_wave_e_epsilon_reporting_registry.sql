-- 0066_wave_e_epsilon_reporting_registry.sql -- Wave E lane epsilon, file 2 of 8.
-- Applies immediately after 0065_wave_e_epsilon_reporting.sql (layers 1-5). Number claims
-- at MERGE; the timeout is PRECAUTIONARY (pure DDL over empty new relations).
--
-- DESIGN HOME: wave-e-design-reporting-part2.md SS7 (claim assessment, anti-smuggling, protected
-- placeholders), SS8 (the chart AST), SS9 (sealed artifacts). The CONTRACT wins. Acceptance
-- oracles: matrix A8, A29, A32a/b, A34, C5, D6, D7.
--
-- SHIPS: E6 claim_policy_versions / claim_phrase_lexicon / protected_placeholders /
-- report_claim_assessments - E7 chart_templates/_versions, report_datasets,
-- report_dataset_points - E8 report_artifacts (insert-once, chained, content-addressed key, NO
-- filename column) - E9 the uniform hardening pass over all 21 epsilon tables plus the narrow
-- lifecycle triggers that replace the append-only wall where an UPDATE is lawful.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _epsilon_registry_pre(k text primary key, v text not null) on commit drop;
insert into _epsilon_registry_pre values ('deploy_principal', session_user);

do $pre$
declare n text; v_agent text;
begin
  -- File 1 by object (its number claims at merge alongside this one, so a version string here
  -- would be a guess).
  foreach n in array array['statutory_profiles', 'statutory_profile_versions', 'statutory_sections',
    'statutory_slots', 'statutory_wording', 'house_styles', 'house_style_versions',
    'report_templates', 'report_template_versions', 'report_specs', 'report_spec_versions',
    'report_runs'] loop
    if to_regclass('clara.' || n) is null then
      raise exception 'epsilon registry requires layer table clara.% (file 1 not applied)', n
        using errcode = 'CLR10';
    end if;
  end loop;
  foreach n in array array['claim_policy_versions', 'claim_phrase_lexicon', 'protected_placeholders',
    'report_claim_assessments', 'chart_templates', 'chart_template_versions', 'report_datasets',
    'report_dataset_points', 'report_artifacts'] loop
    if to_regclass('clara.' || n) is not null then
      raise exception 'epsilon registry partial birth: clara.% already exists', n using errcode = 'CLR10';
    end if;
  end loop;
  -- File 1 leaves its tables unhardened on purpose; if something already hardened them, a
  -- premise of the pass below is false and it must not run.
  if exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
              where s.nspname = 'clara' and c.relname = 'report_runs' and c.relrowsecurity) then
    raise exception 'epsilon registry: clara.report_runs is already RLS-enabled -- the hardening pass has run before'
      using errcode = 'CLR10';
  end if;

  -- The agent's PRE-epsilon table-grant set, captured so the tail can prove POSITIVELY that
  -- epsilon added nothing to it (SS6(c)'s negative, correctly scoped: assert the list, never
  -- an absence).
  select coalesce(string_agg(table_name, ',' order by table_name), '(none)') into v_agent
    from information_schema.table_privileges
   where table_schema = 'clara' and grantee = 'clara_agent_ro' and privilege_type = 'SELECT';
  insert into _epsilon_registry_pre values ('agent_ro_select', v_agent);
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- E6 -- CLAIM ASSESSMENT AND THE ANTI-SMUGGLING REFERENCE ROWS (SS7).
-- =====================================================================================

-- The LABEL comes from versioned policy rows, never a literal in a body or a prompt (E-R14).
-- The CHECK binds a row to the FOUR ruled states, so the lookup cannot fall through to a default.
create table clara.claim_policy_versions (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid references clara.firms(id),
  policy_key     text not null,
  version        int  not null check (version > 0),
  locale         text not null check (locale in ('en', 'ms', 'zh')),
  status_labels  jsonb not null check (jsonb_typeof(status_labels) = 'object'),
  effective_from date not null,
  effective_to   date,
  source_note    text not null check (btrim(source_note) <> ''),
  created_at     timestamptz not null default now(),
  unique nulls not distinct (firm_id, policy_key, version, locale),
  constraint ck_cpv_window check (effective_to is null or effective_to >= effective_from),
  -- Exactly the four ruled states, expressed without a subquery (a CHECK may not contain one):
  -- all four present, and nothing left over once they are removed.
  constraint ck_cpv_four_ruled_states check (
    status_labels ?& array['eligible', 'not_applicable', 'stripped', 'failed']
    and (status_labels - 'eligible' - 'not_applicable' - 'stripped' - 'failed') = '{}'::jsonb),
  constraint ck_claim_policy_versions_curated check (firm_id is null)
);

-- The phrase lexicon SS7's gate-3 scan matches against the text EXTRACTED FROM the produced
-- PDF. The scan itself is lane zeta's; this is the versioned policy data it reads. The seeds
-- file records the open owner item on the ms/zh phrase sets.
create table clara.claim_phrase_lexicon (
  phrase_key     text not null,
  firm_id        uuid references clara.firms(id),
  locale         text not null check (locale in ('en', 'ms', 'zh')),
  version        int  not null check (version > 0),
  phrase         text not null check (btrim(phrase) <> ''),
  match_kind     text not null check (match_kind in ('substring_ci')),
  effective_from date not null,
  effective_to   date,
  source_note    text not null check (btrim(source_note) <> ''),
  created_at     timestamptz not null default now(),
  primary key (phrase_key, locale, version),
  constraint ck_cpl_window check (effective_to is null or effective_to >= effective_from),
  constraint ck_claim_phrase_lexicon_curated check (firm_id is null)
);

-- The ruled protected-placeholder list (SS7), enforced TWICE and from this one enumeration: the
-- layout-AST validator refuses a template or spec binding one to a supplied literal (publish
-- time), and the manifest resolves them from DB values only (render time, lane zeta).
create table clara.protected_placeholders (
  placeholder_key text primary key,
  firm_id         uuid references clara.firms(id),
  description     text not null check (btrim(description) <> ''),
  resolves_from   text not null check (btrim(resolves_from) <> ''),
  effective_from  date not null,
  effective_to    date,
  source_note     text not null check (btrim(source_note) <> ''),
  created_at      timestamptz not null default now(),
  constraint ck_pp_window check (effective_to is null or effective_to >= effective_from),
  constraint ck_protected_placeholders_curated check (firm_id is null)
);

-- ONE IMMUTABLE ROW PER RUN (SS7); the four states are ruled (E-R14). `uncertified` is a
-- SEPARATE fact from status: a contributing cell on a `draft` definition makes the pack
-- non-statutory STRUCTURALLY (the seal refuses pre_sign) and makes the render carry the
-- mandatory watermark (zeta stamps from the manifest flag; absence is not permission).
create table clara.report_claim_assessments (
  id                      uuid primary key default gen_random_uuid(),
  firm_id                 uuid not null references clara.firms(id),
  client_id               uuid not null,
  report_run_id           uuid not null,
  status                  text not null check (status in ('eligible', 'not_applicable', 'stripped', 'failed')),
  uncertified             boolean not null,
  reason_codes            jsonb not null check (jsonb_typeof(reason_codes) = 'array'),
  check_receipt           jsonb not null check (jsonb_typeof(check_receipt) = 'object'),
  claim_policy_version_id uuid not null references clara.claim_policy_versions(id),
  evaluator_version_id    uuid not null references clara.evaluator_versions(id),
  assessed_by             uuid not null references clara.users(id),
  assessed_at             timestamptz not null default now(),
  foreign key (report_run_id, firm_id, client_id) references clara.report_runs (id, firm_id, client_id),
  unique (report_run_id),
  unique (id, report_run_id)
);

-- =====================================================================================
-- E7 -- THE CHART AST (SS8). Closed typed specs; no inline values, SQL, JS or user formulas;
-- named axis policies only; every plotted series resolves to an approved metric version
-- evaluated in the DB against a PINNED snapshot and PERSISTED before rendering.
-- =====================================================================================
create table clara.chart_templates (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references clara.firms(id),
  chart_key  text not null,
  title      text not null check (btrim(title) <> ''),
  created_by uuid not null references clara.users(id),
  created_at timestamptz not null default now(),
  unique (firm_id, chart_key),
  unique (id, firm_id)
);

create table clara.chart_template_versions (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references clara.firms(id),
  chart_template_id uuid not null,
  revision          int  not null check (revision > 0),
  chart_spec_ast    jsonb not null check (jsonb_typeof(chart_spec_ast) = 'object'),
  -- NAMED AXIS POLICIES ONLY (ruled). The column IS the enumeration; an ad-hoc numeric bound has
  -- no column to live in and no AST field the validator accepts, so "a renderer free to choose a
  -- clip" -- number injection with a picture around it -- has no entry point.
  axis_policy       text not null check (axis_policy in ('include_zero', 'data_extent', 'symmetric', 'disclosed_manual')),
  content_sha256    bytea not null check (octet_length(content_sha256) = 32),
  state             text not null check (state in ('published', 'superseded')),
  effective_from    date not null,
  effective_to      date,
  published_by      uuid not null references clara.users(id),
  published_at      timestamptz not null default now(),
  foreign key (chart_template_id, firm_id) references clara.chart_templates (id, firm_id),
  unique (chart_template_id, revision),
  unique (id, firm_id),
  constraint ck_ctv_window check ((state = 'published' and effective_to is null)
    or (state = 'superseded' and effective_to >= effective_from))
);
create unique index uq_chart_template_versions_current on clara.chart_template_versions (chart_template_id)
  where state = 'published';

-- THE TYPED DATASET, persisted BEFORE rendering (stage 4 of the ruled pipeline). The row with
-- chart_spec_version_id null is the pack's own FS dataset; one row per bound chart carries that
-- chart's series. The FOUR-column composite FK to report_runs makes "this dataset's snapshot IS
-- its run's pinned snapshot" structural rather than a verb-time promise.
create table clara.report_datasets (
  id                    uuid primary key default gen_random_uuid(),
  firm_id               uuid not null references clara.firms(id),
  client_id             uuid not null,
  report_run_id         uuid not null,
  chart_spec_version_id uuid,
  books_snapshot_id     uuid not null,
  evaluator_version_id  uuid not null references clara.evaluator_versions(id),
  dataset_sha256        bytea not null check (octet_length(dataset_sha256) = 32),
  point_count           int  not null check (point_count >= 0),
  -- The sealing transaction's id (the delta account-set-members idiom). The header must exist
  -- before its points can reference it, so the digest is stamped a statement later -- but never
  -- a TRANSACTION later. Outside that window the row is frozen.
  created_xid           xid8 not null default pg_current_xact_id(),
  sealed_by             uuid not null references clara.users(id),
  sealed_at             timestamptz not null default now(),
  foreign key (report_run_id, firm_id, client_id, books_snapshot_id)
    references clara.report_runs (id, firm_id, client_id, books_snapshot_id),
  foreign key (chart_spec_version_id, firm_id) references clara.chart_template_versions (id, firm_id),
  unique (id, firm_id, client_id),
  unique nulls not distinct (report_run_id, chart_spec_version_id)
);

-- cell_id is this design's one addition to the research sketch (SS8, builder choice): it makes
-- "which cell is this pixel" a JOIN rather than an inference -- matrix A32b's "asserted BY CELL
-- ID, not by comparing rendered strings". The accessible same-source data table is generated
-- from THESE rows, so series and table cannot drift: they are the same rows.
create table clara.report_dataset_points (
  dataset_id        uuid not null,
  firm_id           uuid not null references clara.firms(id),
  client_id         uuid not null,
  ordinal           int  not null check (ordinal >= 0),
  series_key        text not null check (btrim(series_key) <> ''),
  metric_version_id uuid references clara.metric_definition_versions(id),
  cell_id           uuid not null,
  point_status      text not null check (point_status in ('ok', 'undefined', 'absent', 'refused')),
  value_cents       bigint,
  value_numeric     numeric,
  value_date        date,
  value_text        text,
  dimensions        jsonb not null check (jsonb_typeof(dimensions) = 'object'),
  primary key (dataset_id, ordinal),
  unique (dataset_id, series_key, cell_id),
  foreign key (dataset_id, firm_id, client_id) references clara.report_datasets (id, firm_id, client_id),
  foreign key (cell_id, firm_id, client_id) references clara.metric_cells (id, firm_id, client_id),
  -- An `ok` point carries EXACTLY ONE typed value; a non-ok point carries NONE. delta's
  -- metric_cells CHECK has the same shape, for the same reason.
  constraint ck_rdp_typed_value check (
    (point_status = 'ok' and num_nonnulls(value_cents, value_numeric, value_date, value_text) = 1)
    or (point_status <> 'ok' and num_nonnulls(value_cents, value_numeric, value_date, value_text) = 0)),
  constraint ck_rdp_numeric_finite check (value_numeric is null
    or value_numeric::text not in ('NaN', 'Infinity', '-Infinity'))
);
create index ix_rdp_cell on clara.report_dataset_points (cell_id);

-- =====================================================================================
-- E8 -- THE SEALED-ARTIFACT REGISTRY (SS9). Insert-once, UPDATE/DELETE trigger-blocked, chained
-- to its predecessor -- the clara.bank_reconciliations shape (0040:262, :351, :379).
--
-- THE FILENAME VECTOR IS STRUCTURALLY CLOSED. There is NO filename column here, and storage_key
-- is not free text: the CHECK DERIVES it from firm_id, the artifact's own sha256 and a two-value
-- extension. A supplied name has nowhere to enter and nothing to overwrite -- smuggling a claim
-- into a filename would mean smuggling it into a sha256 first (SS7's ruled requirement).
-- =====================================================================================
create table clara.report_artifacts (
  id                  uuid primary key default gen_random_uuid(),
  firm_id             uuid not null references clara.firms(id),
  client_id           uuid not null,
  report_run_id       uuid not null,
  kind                text not null check (kind in ('draft_watermarked', 'pre_sign', 'signed_original')),
  key_extension       text not null check (key_extension in ('pdf', 'json')),
  storage_key         text not null,
  sha256              text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size           bigint not null check (byte_size > 0),
  manifest            jsonb not null check (jsonb_typeof(manifest) = 'object'),
  claim_assessment_id uuid not null,
  -- The STRIP, recorded on the artifact ROW and not only in the manifest (SS7: stripped seals
  -- with the claim removed, recorded in manifest AND artifact row).
  claim_removed       boolean not null,
  uncertified         boolean not null,
  prior_artifact_id   uuid,
  sealed_by           uuid not null references clara.users(id),
  sealed_at           timestamptz not null default now(),
  foreign key (report_run_id, firm_id, client_id) references clara.report_runs (id, firm_id, client_id),
  foreign key (claim_assessment_id, report_run_id)
    references clara.report_claim_assessments (id, report_run_id),
  -- The chain cannot leave the run: a composite FK, not a verb-time promise.
  foreign key (prior_artifact_id, report_run_id) references clara.report_artifacts (id, report_run_id),
  unique (id, report_run_id),
  unique (id, firm_id, client_id),
  constraint ck_ra_content_addressed check (
    storage_key = 'firms/' || firm_id::text || '/reports/' || sha256 || '.' || key_extension),
  -- KIND AND EXTENSION ARE NOT INDEPENDENT. An issuable artifact is a PDF: without this, a
  -- kind='pre_sign', key_extension='json' row is admissible, and approve_report_for_issue would
  -- happily bind an attestation to JSON bytes while every downstream reader calls them the
  -- pre-sign PDF. Only a watermarked draft may legitimately be a json side-artifact.
  constraint ck_ra_kind_extension check (
    (kind in ('pre_sign', 'signed_original') and key_extension = 'pdf')
    or kind = 'draft_watermarked')
);
-- B7's STRUCTURAL half. The advisory lock in the seal serialises the read; this makes a fork
-- IMPOSSIBLE rather than merely refused -- two artifacts of one run may never share a predecessor,
-- so even a future writer that forgets the lock cannot commit a branched chain. Partial, because
-- the null predecessor is the first-artifact exemption and the one-per-run uniqueness of THAT is
-- carried by the chain rule in the seal.
create unique index uq_report_artifacts_linear_chain on clara.report_artifacts
  (report_run_id, prior_artifact_id) where prior_artifact_id is not null;
-- At most one pre_sign and one signed_original per run; drafts are unbounded (E-R8 floor 2).
create unique index uq_report_artifacts_one_pre_sign on clara.report_artifacts (report_run_id)
  where kind = 'pre_sign';
create unique index uq_report_artifacts_one_signed on clara.report_artifacts (report_run_id)
  where kind = 'signed_original';
create index ix_report_artifacts_run on clara.report_artifacts (report_run_id, sealed_at);

-- The run's issued artifact (a plain FK at create time would have been circular).
alter table clara.report_runs
  add constraint fk_rr_issued_artifact foreign key (issued_artifact_id, id)
    references clara.report_artifacts (id, report_run_id);

-- =====================================================================================
-- E9 -- THE UNIFORM HARDENING PASS. Forced RLS + the owner/human policy pair + the human
-- SELECT grant + the no-truncate wall over ALL 21 epsilon tables; the generic append-only wall
-- over the 15 that are pure history; narrow lifecycle triggers replace it on the 6 tables with
-- a lawful UPDATE (the 4 version tables, report_runs, report_datasets). Every write-side app
-- role gets NOTHING, and clara_agent_ro no grant of any kind -- asserted positively in the tail.
-- =====================================================================================
do $rls$
declare n text; p text;
  narrow text[] := array['house_style_versions', 'report_template_versions',
    'report_spec_versions', 'chart_template_versions', 'report_runs', 'report_datasets'];
begin
  foreach n in array array[
    'statutory_profiles', 'statutory_profile_versions', 'statutory_sections', 'statutory_slots',
    'statutory_wording', 'house_styles', 'house_style_versions', 'report_templates',
    'report_template_versions', 'report_specs', 'report_spec_versions', 'report_runs',
    'claim_policy_versions', 'claim_phrase_lexicon', 'protected_placeholders',
    'report_claim_assessments', 'chart_templates', 'chart_template_versions',
    'report_datasets', 'report_dataset_points', 'report_artifacts'
  ] loop
    execute format('alter table clara.%I enable row level security', n);
    execute format('alter table clara.%I force row level security', n);
    p := left(regexp_replace(n, '[^a-z0-9]+', '', 'g'), 38);
    execute format('create policy %I on clara.%I for all to clara_fn_owner using(true) with check(true)',
      'p_' || p || '_owner', n);
    execute format('create policy %I on clara.%I for select to clara_authenticated using(firm_id is null or firm_id=clara.jwt_firm())',
      'p_' || p || '_human', n);
    execute format('grant select on clara.%I to clara_authenticated', n);
    execute format('revoke insert,update,delete,truncate on clara.%I from clara_authenticated,clara_agent_ro,clara_runtime,clara_wake_interactive,clara_wake_proactive', n);
    execute format('create trigger %I before truncate on clara.%I for each statement execute function clara._tf_no_truncate()',
      't_' || left(regexp_replace(n, '[^a-z0-9]+', '', 'g'), 40) || '_no_truncate', n);
    if not (n = any (narrow)) then
      execute format('create trigger %I before update or delete on clara.%I for each row execute function clara._tf_append_only()',
        't_' || left(regexp_replace(n, '[^a-z0-9]+', '', 'g'), 40) || '_append_only', n);
    end if;
  end loop;
end $rls$;

-- PUBLICATION FREEZE. The ONE lawful UPDATE on a version table is the published -> superseded
-- window closure; everything else -- including a "small fix" to a published layout -- is a new
-- revision. Delta's account-set lifecycle trigger generalised over the four version tables; it
-- compares the immutable set WHOLE (to_jsonb minus the two lifecycle columns), so a column a
-- later migration adds is protected by default rather than by somebody extending a list.
create function clara._tf_report_publication_freeze() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a published % version is never deleted', tg_table_name
      using errcode = 'CLR08', detail = '{"reason":"report_version_never_deleted"}';
  end if;
  if old.state <> 'published' or new.state <> 'superseded' or new.effective_to is null
     or (to_jsonb(new) - array['state', 'effective_to'])
        is distinct from (to_jsonb(old) - array['state', 'effective_to']) then
    raise exception 'a published % version admits only the published-to-superseded window closure', tg_table_name
      using errcode = 'CLR08', detail = '{"reason":"report_version_immutable_after_publication"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_report_publication_freeze() from public;
create trigger t_housestyleversions_publication_freeze before update or delete
  on clara.house_style_versions for each row execute function clara._tf_report_publication_freeze();
create trigger t_reporttemplateversions_publication_freeze before update or delete
  on clara.report_template_versions for each row execute function clara._tf_report_publication_freeze();
create trigger t_reportspecversions_publication_freeze before update or delete
  on clara.report_spec_versions for each row execute function clara._tf_report_publication_freeze();
create trigger t_charttemplateversions_publication_freeze before update or delete
  on clara.chart_template_versions for each row execute function clara._tf_report_publication_freeze();

-- THE DATASET SEAL STAMP. The only lawful UPDATE writes exactly dataset_sha256 and point_count,
-- and only while created_xid is still this transaction. After that the row is history, and the
-- reconstruct trigger in the seal file proves the digest matches the points it summarises.
create function clara._tf_report_dataset_seal_stamp() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a sealed report dataset is never deleted'
      using errcode = 'CLR08', detail = '{"reason":"report_dataset_never_deleted"}';
  end if;
  if old.created_xid <> pg_current_xact_id()
     or (to_jsonb(new) - array['dataset_sha256', 'point_count'])
        is distinct from (to_jsonb(old) - array['dataset_sha256', 'point_count']) then
    raise exception 'a sealed report dataset is immutable'
      using errcode = 'CLR08', detail = '{"reason":"report_dataset_immutable_after_seal"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_report_dataset_seal_stamp() from public;
create trigger t_reportdatasets_lifecycle before update or delete on clara.report_datasets
  for each row execute function clara._tf_report_dataset_seal_stamp();

-- THE RUN LIFECYCLE: drafting -> dataset_sealed -> issued, forward only, and the identity
-- columns (which spec, which snapshot, which period, who asked) never move. A run that could
-- be re-pointed at a different snapshot after its dataset sealed would make every downstream
-- hash a statement about nothing.
create function clara._tf_report_run_lifecycle() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_frozen text[] := array['state', 'issued_by', 'issued_at', 'issue_reason',
  'issue_mode', 'issue_self_attestation', 'issued_artifact_id'];
begin
  if tg_op = 'DELETE' then
    raise exception 'a report run is never deleted'
      using errcode = 'CLR08', detail = '{"reason":"report_run_never_deleted"}';
  end if;
  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then
    raise exception 'a report run''s identity is immutable'
      using errcode = 'CLR08', detail = '{"reason":"report_run_identity_immutable"}';
  end if;
  if not ((old.state = 'drafting' and new.state = 'dataset_sealed')
          or (old.state = 'dataset_sealed' and new.state = 'issued')) then
    raise exception 'illegal report run transition % -> %', old.state, new.state
      using errcode = 'CLR08', detail = jsonb_build_object('reason', 'report_run_transition_illegal',
        'from_state', old.state, 'to_state', new.state)::text;
  end if;
  return new;
end $$;
revoke all on function clara._tf_report_run_lifecycle() from public;
create trigger t_reportruns_lifecycle before update or delete on clara.report_runs
  for each row execute function clara._tf_report_run_lifecycle();

reset role;

-- =====================================================================================
-- TAIL CENSUS (file 2) -- the live catalog and the live privilege state, re-read. Every claim
-- below is a POSITIVE read; nothing is inferred from this file's own statements.
-- =====================================================================================
do $tail$
declare
  v_tables int; v_rls int; v_owner int; v_human int; v_truncate int; v_immutable int;
  v_wording int; v_placeholders int;
  v_agent_now text; v_agent_before text; v_write_grants int;
begin
  with epsilon as (
    select c.oid, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'clara' and c.relkind = 'r'
       and c.relname = any (array['statutory_profiles', 'statutory_profile_versions',
         'statutory_sections', 'statutory_slots', 'statutory_wording', 'house_styles',
         'house_style_versions', 'report_templates', 'report_template_versions', 'report_specs',
         'report_spec_versions', 'report_runs', 'claim_policy_versions', 'claim_phrase_lexicon',
         'protected_placeholders', 'report_claim_assessments', 'chart_templates',
         'chart_template_versions', 'report_datasets', 'report_dataset_points', 'report_artifacts']))
  select count(*),
         count(*) filter (where relrowsecurity and relforcerowsecurity),
         count(*) filter (where exists (select 1 from pg_policy p
           where p.polrelid = e.oid and p.polroles = array['clara_fn_owner'::regrole]::oid[])),
         count(*) filter (where exists (select 1 from pg_policy p
           where p.polrelid = e.oid and p.polroles = array['clara_authenticated'::regrole]::oid[])),
         count(*) filter (where exists (select 1 from pg_trigger t
           where t.tgrelid = e.oid and not t.tgisinternal and t.tgname like '%\_no\_truncate')),
         count(*) filter (where exists (select 1 from pg_trigger t
           where t.tgrelid = e.oid and not t.tgisinternal
             and (t.tgname like '%\_append\_only' or t.tgname like '%\_publication\_freeze'
                  or t.tgname like '%\_lifecycle')))
    into v_tables, v_rls, v_owner, v_human, v_truncate, v_immutable
    from epsilon e;
  if v_tables <> 21 or v_rls <> 21 or v_owner <> 21 or v_human <> 21
     or v_truncate <> 21 or v_immutable <> 21 then
    raise exception 'epsilon registry tail: hardening census tables %, rls %, owner %, human %, truncate %, immutable % -- expected 21 across the board',
      v_tables, v_rls, v_owner, v_human, v_truncate, v_immutable using errcode = 'CLR10';
  end if;

  -- No app role holds a write privilege on any epsilon table. Read from the live ACLs, not
  -- from the REVOKEs above.
  select count(*) into v_write_grants from information_schema.table_privileges
   where table_schema = 'clara' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     and grantee = any (array['clara_authenticated', 'clara_agent_ro', 'clara_runtime',
       'clara_runtime_login', 'clara_wake_interactive', 'clara_wake_proactive'])
     and table_name = any (array['statutory_profiles', 'statutory_profile_versions',
       'statutory_sections', 'statutory_slots', 'statutory_wording', 'house_styles',
       'house_style_versions', 'report_templates', 'report_template_versions', 'report_specs',
       'report_spec_versions', 'report_runs', 'claim_policy_versions', 'claim_phrase_lexicon',
       'protected_placeholders', 'report_claim_assessments', 'chart_templates',
       'chart_template_versions', 'report_datasets', 'report_dataset_points', 'report_artifacts']);
  if v_write_grants <> 0 then
    raise exception 'epsilon registry tail: % app-role write grant(s) on epsilon tables', v_write_grants
      using errcode = 'CLR10';
  end if;

  -- The reference tables arrive EMPTY here; the seeds file fills them and censuses the counts.
  select count(*) into v_wording from clara.statutory_wording;
  select count(*) into v_placeholders from clara.protected_placeholders;
  if v_wording <> 0 or v_placeholders <> 0 then
    raise exception 'epsilon registry tail: reference tables must arrive empty (wording %, placeholders %)',
      v_wording, v_placeholders using errcode = 'CLR10';
  end if;

  -- THE AGENT, POSITIVELY. Its SELECT list must be byte-identical to what it was before this
  -- file ran: epsilon grants clara_agent_ro nothing, proven by reading the live privilege state
  -- rather than by reading this file's own (absent) grant statements.
  select coalesce(string_agg(table_name, ',' order by table_name), '(none)') into v_agent_now
    from information_schema.table_privileges
   where table_schema = 'clara' and grantee = 'clara_agent_ro' and privilege_type = 'SELECT';
  select v into v_agent_before from _epsilon_registry_pre where k = 'agent_ro_select';
  if v_agent_now is distinct from v_agent_before then
    raise exception 'epsilon registry tail: clara_agent_ro SELECT set moved. before=[%] after=[%]',
      v_agent_before, v_agent_now using errcode = 'CLR10';
  end if;

  if current_user <> (select v from _epsilon_registry_pre where k = 'deploy_principal')
     or current_role <> (select v from _epsilon_registry_pre where k = 'deploy_principal') then
    raise exception 'epsilon registry tail: role was not reset (user %, role %)', current_user, current_role
      using errcode = 'CLR10';
  end if;

  raise notice 'epsilon registry OK: 21 tables, each with forced RLS + the owner/human policy pair + a human SELECT grant + a no-truncate wall + an immutability wall (16 append-only, 4 publication-freeze, 1 run lifecycle); ZERO app-role write grants on any of them; reference tables arrive empty (the seeds file fills and censuses them); clara_agent_ro SELECT set UNCHANGED at [%]; artifact keys content-addressed with NO filename column anywhere in the path. Deploy principal restored. ADDITIVE AND INERT ON ARRIVAL -- no existing body replaced, so no D1 window.',
    v_agent_now;
end $tail$;
