-- 0007_document_pipeline -- Slice 5 governed document pipeline, filing-bound
-- provenance, durable intake/extraction/metering, attribution, and corrections.
-- Authority: Slice-5 document-pipeline contract v1.2 + migration companion
-- (docs/plan/slice5-*.md); ARCHITECTURE §§0/3.3; ADR-018.
--
-- The migration runner owns BEGIN/COMMIT. 0001-0006 remain immutable.
--
-- New governed error classes (0002 owns CLR01-11; 0005 CLR12; 0006 CLR13-14):
--   CLR15 -- retired legacy document writer / transport bypass
--   CLR16 -- illegal document intake, processing, or extraction transition
--   CLR17 -- filing conflict, retention-floor refusal, or filing CAS failure
--   CLR18 -- document reservation, daily limit, or concurrency refusal
--   CLR19 -- correction authorization, stale plan, or correction-state refusal
--   CLR20 -- attribution ambiguity or candidate-state refusal
--
-- Reservation advisory-lock namespace (two-arg form): classid 203005001.
-- Correction lock namespace (two-arg form): classid 203005002.
-- Both are distinct from Slice-4 CLASS_ADMIT=202991617 and from the relay's
-- single-argument leadership keyspace.

set role clara_fn_owner;

-- =====================================================================
-- 1. DOCUMENT EVOLUTION + SLICE-5 CARRIERS
-- =====================================================================

alter table clara.documents
  add column bytes_verified_at timestamptz,
  add column page_count int check (page_count is null or page_count >= 0),
  add column extraction_status text not null default 'pending'
    check (extraction_status in ('pending','running','done','failed',
      'skipped_structured_done','stored_unparsed','held_egress')),
  add column document_kind text check (document_kind is null or document_kind in
    ('invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
     'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
     'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
     'knowledge_artifact','handwritten_note','other')),
  add column financial_date date,
  add column retention_state text not null default 'unanchored'
    check (retention_state in ('unanchored','anchored')),
  add column retain_until date,
  add column retention_basis text,
  add column legal_hold boolean not null default false,
  add column legal_hold_reason text,
  add constraint ck_documents_retention_anchor
    check (retention_state <> 'anchored' or retain_until is not null),
  add constraint ck_documents_legal_hold
    check ((not legal_hold and legal_hold_reason is null)
        or (legal_hold and legal_hold_reason is not null and btrim(legal_hold_reason) <> ''));

-- NOT VALID preserves legacy storage_path values as-is while checking every new
-- INSERT/UPDATE. A claim-only upgrade must stamp the governed canonical grammar.
alter table clara.documents add constraint ck_documents_storage_path_v2 check (
  storage_path ~ ('^firms/' || firm_id::text || '/docs/' || sha256 || '[.][a-z0-9]{1,12}$')
) not valid;

-- Composite keys are same-firm FK targets for non-hot parents.
alter table clara.documents add constraint uq_documents_id_firm unique (id, firm_id);
alter table clara.clients add constraint uq_clients_id_firm unique (id, firm_id);
alter table clara.client_resolutions add constraint uq_client_resolutions_id_firm unique (id, firm_id);
alter table clara.journal_entries add constraint uq_journal_entries_id_firm unique (id, firm_id);

create table clara.document_filings (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid        not null,
  document_id       uuid        not null,
  client_id         uuid        not null,
  filed_at          timestamptz not null default now(),
  filed_by          uuid        references clara.users(id),
  resolution_id     uuid,
  basis             text        not null check (basis in
                      ('legacy-0007','human','rule','correction','seed-0007')),
  retired_at        timestamptz,
  retired_by        uuid        references clara.users(id),
  retirement_reason text,
  correction_id     uuid,
  revision_token    uuid        not null default gen_random_uuid(),
  unique (id, firm_id),
  constraint fk_document_filings_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_document_filings_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_document_filings_resolution foreign key (resolution_id, firm_id)
    references clara.client_resolutions(id, firm_id),
  constraint ck_document_filings_resolution check (
    (basis = 'legacy-0007' and resolution_id is null)
    or (basis <> 'legacy-0007' and resolution_id is not null)),
  constraint ck_document_filings_retirement check (
    (retired_at is null and retired_by is null and retirement_reason is null)
    or (retired_at is not null and retired_by is not null
        and retirement_reason is not null and btrim(retirement_reason) <> ''))
);
create unique index uq_document_filing_active
  on clara.document_filings(document_id, client_id) where retired_at is null;
create index ix_document_filings_client_recent
  on clara.document_filings(client_id, filed_at desc) where retired_at is null;
create index ix_document_filings_document
  on clara.document_filings(document_id, filed_at desc);

create table clara.document_intakes (
  id                 uuid primary key default gen_random_uuid(),
  firm_id            uuid        not null,
  uploaded_by        uuid        not null references clara.users(id),
  origin             text        not null check (origin in ('chat','documents_tab')),
  chat_session_id    uuid,
  original_filename  text        not null,
  declared_mime      text        not null,
  declared_bytes     bigint      not null check (declared_bytes > 0 and declared_bytes <= 20971520),
  status             text        not null default 'uploading' check (status in
                       ('uploading','received','verifying','verified','duplicate',
                        'finalized','adopted','failed')),
  sha256             text        check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  storage_key        text,
  document_id        uuid,
  failure_code       text        check (failure_code is null or failure_code in
                       ('too_large','bad_type','limit','checksum_mismatch','storage_error',
                        'expired','malware_detected','quarantined','internal')),
  op_key             text        not null check (btrim(op_key) <> ''),
  token_hash         text        not null default
                     encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex')
                     check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at         timestamptz not null default (now() + interval '15 minutes'),
  upload_lease_owner text,
  lease_expires_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, firm_id),
  unique (firm_id, op_key),
  constraint fk_document_intakes_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint ck_document_intakes_origin check (
    (origin = 'chat' and chat_session_id is not null)
    or (origin = 'documents_tab' and chat_session_id is null)),
  constraint ck_document_intakes_failure check (
    (status = 'failed' and failure_code is not null)
    or (status <> 'failed' and failure_code is null)),
  constraint ck_document_intakes_terminal_doc check (
    (status in ('finalized','adopted') and document_id is not null)
    or (status not in ('finalized','adopted') and document_id is null)),
  constraint ck_document_intakes_lease check (
    (upload_lease_owner is null) = (lease_expires_at is null)),
  constraint ck_document_intakes_storage_key check (
    storage_key is null or (sha256 is not null and
      storage_key ~ ('^firms/' || firm_id::text || '/docs/' || sha256 || '[.][a-z0-9]{1,12}$')))
);
create index ix_document_intakes_firm_status on clara.document_intakes(firm_id, status, created_at);

create table clara.document_processing_tasks (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  document_id      uuid        not null,
  engine_id        text        not null check (btrim(engine_id) <> ''),
  engine_config    jsonb       not null default '{}',
  version_n        int         not null check (version_n > 0),
  lane             text        not null check (lane in ('ocr','structured_parse','none')),
  status           text        not null default 'queued' check (status in
                     ('queued','held_egress','running','done','failed')),
  workflow_run_id  text,
  vendor_op_ref    text,
  attempt_count    int         not null default 0 check (attempt_count >= 0),
  error_code       text        check (error_code is null or error_code in
                     ('engine_error','timeout','engine_lost','storage_error','corrupt',
                      'encrypted','bad_type','limit','internal')),
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  updated_at       timestamptz not null default now(),
  unique (id, firm_id),
  unique (document_id, engine_id, version_n),
  constraint fk_processing_task_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint ck_processing_task_binding check (
    (status in ('queued','held_egress') and workflow_run_id is null and started_at is null)
    or (status in ('running','done','failed') and workflow_run_id is not null and started_at is not null)),
  constraint ck_processing_task_terminal check (
    (status in ('done','failed')) = (finished_at is not null)),
  constraint ck_processing_task_error check (
    (status = 'failed' and error_code is not null) or (status <> 'failed' and error_code is null))
);
create index ix_document_processing_dispatch
  on clara.document_processing_tasks(status, created_at) where status in ('queued','held_egress','running');

create table clara.document_extractions (
  id            uuid primary key default gen_random_uuid(),
  firm_id       uuid        not null,
  document_id   uuid        not null,
  engine_id     text        not null,
  engine_kind   text        not null check (engine_kind in ('ocr','structured_parse')),
  version_n     int         not null check (version_n > 0),
  superseded_by uuid,
  status        text        not null check (status in ('done','failed')),
  page_count    int         check (page_count is null or page_count >= 0),
  envelope      jsonb       not null default '{}',
  extracted_at  timestamptz not null default now(),
  unique (id, firm_id),
  unique (document_id, engine_id, version_n),
  constraint fk_document_extractions_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id)
);
alter table clara.document_extractions add constraint fk_document_extractions_superseded
  foreign key (superseded_by, firm_id) references clara.document_extractions(id, firm_id);

create table clara.document_regions (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid        not null,
  extraction_id     uuid        not null,
  locator_kind      text        not null check (locator_kind in
                       ('page_polygon','sheet_cell_range','row_col','paragraph_run')),
  locator           jsonb       not null check (jsonb_typeof(locator) = 'object'),
  field_path        text,
  text_content      text,
  engine_confidence numeric(6,5) check (engine_confidence is null
                       or (engine_confidence >= 0 and engine_confidence <= 1)),
  monetary_raw      text,
  monetary_cents    bigint,
  created_at        timestamptz not null default now(),
  unique (id, firm_id),
  constraint fk_document_regions_extraction foreign key (extraction_id, firm_id)
    references clara.document_extractions(id, firm_id)
);
create index ix_document_regions_extraction on clara.document_regions(extraction_id, field_path);

create table clara.client_identifiers (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  client_id        uuid        not null,
  kind             text        not null check (kind in ('tin','ssm','bank_account')),
  value_normalized text        not null check (btrim(value_normalized) <> ''),
  added_by         uuid        not null references clara.users(id),
  added_at         timestamptz not null default now(),
  unique (id, firm_id),
  constraint fk_client_identifiers_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id)
);
-- Deliberately non-unique: sibling-client conflicts must be representable.
create index ix_client_identifiers_match
  on clara.client_identifiers(firm_id, kind, value_normalized);

create table clara.client_aliases (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  client_id        uuid        not null,
  alias_normalized text        not null check (btrim(alias_normalized) <> ''),
  added_by         uuid        not null references clara.users(id),
  added_at         timestamptz not null default now(),
  retired_at       timestamptz,
  retired_by       uuid        references clara.users(id),
  unique (id, firm_id),
  constraint fk_client_aliases_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint ck_client_aliases_retired check ((retired_at is null) = (retired_by is null))
);
create index ix_client_aliases_match
  on clara.client_aliases(firm_id, alias_normalized) where retired_at is null;

create table clara.attribution_attempts (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid        not null,
  document_id       uuid        not null,
  matcher_version   text        not null check (btrim(matcher_version) <> ''),
  input_fingerprint text        not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  outcome           text        not null default 'abstained'
                     check (outcome in ('abstained','candidate','rule_resolved')),
  conflict_reason   text,
  created_at        timestamptz not null default now(),
  unique (id, firm_id),
  unique (document_id, matcher_version, input_fingerprint),
  constraint fk_attribution_attempt_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id)
);

create table clara.attribution_candidates (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid        not null,
  attempt_id  uuid        not null,
  client_id   uuid        not null,
  rank        int         not null check (rank > 0),
  rule_kind   text        not null check (rule_kind in ('name_exact','alias_exact')),
  disposition text        not null default 'open'
               check (disposition in ('open','confirmed','dismissed')),
  disposed_by uuid        references clara.users(id),
  disposed_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (id, firm_id),
  unique (attempt_id, client_id, rule_kind),
  unique (attempt_id, rank),
  constraint fk_attribution_candidate_attempt foreign key (attempt_id, firm_id)
    references clara.attribution_attempts(id, firm_id),
  constraint fk_attribution_candidate_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint ck_attribution_candidate_disposition check (
    (disposition = 'open' and disposed_by is null and disposed_at is null)
    or (disposition <> 'open' and disposed_by is not null and disposed_at is not null))
);

create table clara.attribution_candidate_regions (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid        not null,
  candidate_id uuid        not null,
  region_id    uuid        not null,
  created_at   timestamptz not null default now(),
  unique (id, firm_id),
  unique (candidate_id, region_id),
  constraint fk_candidate_regions_candidate foreign key (candidate_id, firm_id)
    references clara.attribution_candidates(id, firm_id),
  constraint fk_candidate_regions_region foreign key (region_id, firm_id)
    references clara.document_regions(id, firm_id)
);

create table clara.filing_corrections (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid        not null,
  document_id     uuid        not null,
  from_client     uuid        not null,
  to_client       uuid        not null,
  reason          text        not null check (btrim(reason) <> ''),
  maker           uuid        not null references clara.users(id),
  checker         uuid        references clara.users(id),
  status          text        not null default 'proposed'
                   check (status in ('proposed','approved','completed','rejected','stale')),
  plan_hash       text        not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  books_version   bigint      not null check (books_version >= 0),
  attestation     text,
  proposed_at     timestamptz not null default now(),
  approved_at     timestamptz,
  completed_at    timestamptz,
  rejected_at     timestamptz,
  updated_at      timestamptz not null default now(),
  unique (id, firm_id),
  constraint fk_filing_correction_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_filing_correction_from_client foreign key (from_client, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_filing_correction_to_client foreign key (to_client, firm_id)
    references clara.clients(id, firm_id),
  constraint ck_filing_correction_clients check (from_client <> to_client)
);

create table clara.filing_correction_items (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  correction_id    uuid        not null,
  entry_id         uuid        not null,
  entry_state_hash text        not null check (entry_state_hash ~ '^[0-9a-f]{64}$'),
  action           text        not null check (action in
                    ('reverse','already_reversed','withdraw_draft')),
  reversal_id      uuid,
  outcome          text        check (outcome is null or outcome in
                    ('reversed','already_reversed','withdrawn')),
  adopted_reversal boolean     not null default false,
  created_at       timestamptz not null default now(),
  unique (id, firm_id),
  unique (correction_id, entry_id),
  constraint fk_correction_item_correction foreign key (correction_id, firm_id)
    references clara.filing_corrections(id, firm_id),
  constraint fk_correction_item_entry foreign key (entry_id)
    references clara.journal_entries(id),
  constraint fk_correction_item_reversal foreign key (reversal_id)
    references clara.journal_entries(id)
);
alter table clara.document_filings add constraint fk_document_filings_correction
  foreign key (correction_id, firm_id) references clara.filing_corrections(id, firm_id);

create table clara.firm_document_limits (
  firm_id         uuid primary key references clara.firms(id),
  docs_per_day    int not null default 100 check (docs_per_day > 0),
  pages_per_day   int not null default 1000 check (pages_per_day > 0),
  ocr_concurrency int not null default 2 check (ocr_concurrency > 0),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references clara.users(id)
);

create table clara.document_ingest_reservations (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  intake_id        uuid        not null,
  state            text        not null default 'reserved'
                    check (state in ('reserved','resized','settled','refunded')),
  docs_reserved    int         not null default 1 check (docs_reserved = 1),
  pages_reserved   int         not null check (pages_reserved >= 0),
  lease_expires_at timestamptz not null,
  task_id          uuid,
  settled_pages    int check (settled_pages is null or settled_pages >= 0),
  refund_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  settled_at       timestamptz,
  refunded_at      timestamptz,
  unique (id, firm_id),
  unique (intake_id),
  constraint fk_ingest_reservation_intake foreign key (intake_id, firm_id)
    references clara.document_intakes(id, firm_id),
  constraint fk_ingest_reservation_task foreign key (task_id, firm_id)
    references clara.document_processing_tasks(id, firm_id),
  constraint ck_ingest_reservation_terminal check (
    (state = 'settled' and settled_at is not null and refunded_at is null)
    or (state = 'refunded' and refunded_at is not null and settled_at is null)
    or (state in ('reserved','resized') and settled_at is null and refunded_at is null))
);
create index ix_ingest_reservation_daily
  on clara.document_ingest_reservations(firm_id, created_at, state);

-- Journal evidence now binds the immutable filing row as well as document+sha.
lock table clara.journal_entries in share row exclusive mode;
alter table clara.journal_entries
  add column filing_id uuid,
  add column withdrawn_by uuid references clara.users(id),
  add column withdrawn_at timestamptz,
  add column withdrawal_reason text;

-- =====================================================================
-- 2. STAMPING, SAME-FIRM VALIDATION, AND STATE-MACHINE TRIGGERS
-- =====================================================================

create function clara._tf_stamp_document_pipeline() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_doc uuid; v_client uuid;
begin
  case tg_table_name
    when 'document_filings' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
      if v_firm is null or not exists (select 1 from clara.clients where id = new.client_id and firm_id = v_firm) then
        raise exception 'document/client not in one firm' using errcode = 'CLR11';
      end if;
      if new.resolution_id is not null and not exists (
        select 1 from clara.client_resolutions where id = new.resolution_id
          and firm_id = v_firm and client_id = new.client_id
          and subject_kind = 'document' and subject_id = new.document_id
          and method in ('human','rule') and confidence >= 0.95 and superseded_at is null) then
        raise exception 'filing resolution is not authoritative for this document/client' using errcode = 'CLR01';
      end if;
    when 'document_intakes' then
      if new.origin = 'chat' then
        select s.firm_id into v_firm from clara.chat_sessions s
          join clara.firm_memberships m on m.firm_id=s.firm_id
            and m.user_id=new.uploaded_by and m.status='active'
          where s.id=new.chat_session_id
            and (s.created_by=new.uploaded_by or s.visibility='firm');
      else
        select firm_id into v_firm from clara.firm_memberships
          where user_id = new.uploaded_by and status = 'active';
      end if;
      if v_firm is null then raise exception 'uploader has no matching intake firm' using errcode = 'CLR11'; end if;
    when 'document_processing_tasks' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
    when 'document_extractions' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
    when 'document_regions' then
      select firm_id into v_firm from clara.document_extractions where id = new.extraction_id;
    when 'client_identifiers' then
      select firm_id into v_firm from clara.clients where id = new.client_id;
    when 'client_aliases' then
      select firm_id into v_firm from clara.clients where id = new.client_id;
    when 'attribution_attempts' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
    when 'attribution_candidates' then
      select a.firm_id, a.document_id into v_firm, v_doc
        from clara.attribution_attempts a where a.id = new.attempt_id;
      if not exists (select 1 from clara.clients where id = new.client_id and firm_id = v_firm) then
        raise exception 'candidate client not in attempt firm' using errcode = 'CLR11';
      end if;
    when 'attribution_candidate_regions' then
      select c.firm_id, a.document_id into v_firm, v_doc
        from clara.attribution_candidates c join clara.attribution_attempts a on a.id = c.attempt_id
       where c.id = new.candidate_id;
      if not exists (
        select 1 from clara.document_regions r
        join clara.document_extractions e on e.id = r.extraction_id
        where r.id = new.region_id and r.firm_id = v_firm and e.document_id = v_doc) then
      raise exception 'candidate evidence region not from the attempted document' using errcode = 'CLR11';
      end if;
    when 'filing_corrections' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
      if not exists (select 1 from clara.clients where id = new.from_client and firm_id = v_firm)
         or not exists (select 1 from clara.clients where id = new.to_client and firm_id = v_firm) then
        raise exception 'correction clients not in document firm' using errcode = 'CLR11';
      end if;
    when 'filing_correction_items' then
      select firm_id into v_firm from clara.filing_corrections where id = new.correction_id;
      if not exists (select 1 from clara.journal_entries where id = new.entry_id and firm_id = v_firm) then
        raise exception 'correction entry not in correction firm' using errcode = 'CLR11';
      end if;
    when 'firm_document_limits' then
      select id into v_firm from clara.firms where id = new.firm_id;
    when 'document_ingest_reservations' then
      select firm_id into v_firm from clara.document_intakes where id = new.intake_id;
      if new.task_id is not null and not exists (
        select 1 from clara.document_processing_tasks where id = new.task_id and firm_id = v_firm) then
        raise exception 'reservation task not in intake firm' using errcode = 'CLR11';
      end if;
    else
      raise exception 'unsupported document pipeline stamp target %', tg_table_name using errcode = 'CLR10';
  end case;
  if v_firm is null then raise exception 'unknown document-pipeline parent' using errcode = 'CLR10'; end if;
  new.firm_id := v_firm;
  return new;
end $$;

create function clara._tf_firm_id_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.firm_id is distinct from old.firm_id then
    raise exception 'stamped firm_id is immutable' using errcode = 'CLR08';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'document_filings','document_intakes','document_processing_tasks','document_extractions',
    'document_regions','client_identifiers','client_aliases','attribution_attempts',
    'attribution_candidates','attribution_candidate_regions','filing_corrections',
    'filing_correction_items','firm_document_limits','document_ingest_reservations'
  ] loop
    execute format('create trigger t_%s_stamp before insert on clara.%I for each row execute function clara._tf_stamp_document_pipeline()', t, t);
    execute format('create trigger t_%s_firm_immutable before update on clara.%I for each row execute function clara._tf_firm_id_immutable()', t, t);
    execute format('create trigger t_%s_no_truncate before truncate on clara.%I for each statement execute function clara._tf_no_truncate()', t, t);
  end loop;
end $$;

create function clara._tf_document_filing_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'document filings are historical' using errcode = 'CLR08'; end if;
  if old.retired_at is not null then raise exception 'retired filing is immutable' using errcode = 'CLR08'; end if;
  if new.retired_at is null or new.retired_by is null
     or btrim(coalesce(new.retirement_reason,'')) = '' then
    raise exception 'filing may only transition active->retired with actor and reason' using errcode = 'CLR17';
  end if;
  new.revision_token := gen_random_uuid();
  if (to_jsonb(new) - array['retired_at','retired_by','retirement_reason','correction_id','revision_token'])
     is distinct from (to_jsonb(old) - array['retired_at','retired_by','retirement_reason','correction_id','revision_token']) then
    raise exception 'filing identity is immutable' using errcode = 'CLR08';
  end if;
  return new;
end $$;
create trigger t_document_filings_update before update or delete on clara.document_filings
  for each row execute function clara._tf_document_filing_update();

-- Operator limit rows are singleton overrides. Repeated INSERT-shaped control
-- plane writes replace the existing values atomically instead of surfacing a
-- primary-key race to callers that do not issue ON CONFLICT themselves.
create function clara._tf_firm_document_limits_upsert() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  update clara.firm_document_limits set docs_per_day=new.docs_per_day,
    pages_per_day=new.pages_per_day,ocr_concurrency=new.ocr_concurrency,
    updated_at=now(),updated_by=new.updated_by where firm_id=new.firm_id;
  if found then return null; end if;
  new.updated_at:=now();
  return new;
end $$;
create trigger t_firm_document_limits_upsert before insert on clara.firm_document_limits
  for each row execute function clara._tf_firm_document_limits_upsert();

create function clara._tf_document_intake_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ok boolean;
begin
  if tg_op = 'DELETE' then raise exception 'document intakes are not deleted' using errcode = 'CLR08'; end if;
  if old.status in ('finalized','adopted','failed') then
    raise exception 'terminal document intake is immutable' using errcode = 'CLR13';
  end if;
  if new.id <> old.id or new.firm_id <> old.firm_id or new.uploaded_by <> old.uploaded_by
     or new.origin <> old.origin or new.chat_session_id is distinct from old.chat_session_id
     or new.original_filename <> old.original_filename or new.declared_mime <> old.declared_mime
     or new.declared_bytes <> old.declared_bytes or new.op_key <> old.op_key
     or new.token_hash <> old.token_hash or new.created_at <> old.created_at then
    raise exception 'document intake identity/capability is immutable' using errcode = 'CLR08';
  end if;
  if new.status <> old.status then
    v_ok := case old.status
      when 'uploading' then new.status in ('received','failed')
      when 'received' then new.status in ('verifying','failed')
      when 'verifying' then new.status in ('verified','duplicate','failed')
      when 'verified' then new.status in ('finalized','failed')
      when 'duplicate' then new.status in ('adopted','failed')
      else false end;
    -- A unique-key race may be discovered only while finalizing a row that was
    -- verified moments earlier. The finalizer alone may fold that row directly
    -- onto the canonical document; ordinary DML still sees the exact edge set.
    if old.status='verified' and new.status='adopted'
       and current_setting('clara.intake_adopt_race',true)=old.id::text then
      v_ok:=true;
    end if;
    if not v_ok then
      raise exception 'illegal document intake transition % -> %', old.status, new.status using errcode = 'CLR16';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger t_document_intakes_update before update or delete on clara.document_intakes
  for each row execute function clara._tf_document_intake_update();

-- S5-R8 attachment admission. The message insert is inside begin_chat_turn's
-- transaction, so refusing here also rolls back the just-created task. Foreign
-- and nonexistent handles deliberately share CLR11 (no tenant oracle).
create function clara._tf_validate_chat_attachments() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_author uuid; v_count int; elem jsonb;
begin
  if new.role<>'user' then return new; end if;
  if jsonb_typeof(new.parts)<>'array' then
    raise exception 'chat message parts must be an array' using errcode='CLR10';
  end if;
  select s.firm_id,t.created_by into v_firm,v_author
    from clara.agent_tasks t join clara.chat_sessions s on s.id=t.session_id
    where t.id=new.task_id and t.session_id=new.session_id;
  if v_firm is null or v_author is null then
    raise exception 'attachment admission context is invalid' using errcode='CLR11';
  end if;
  select count(*)::int into v_count from jsonb_array_elements(new.parts) p
    where p->>'type'='attachment';
  if v_count>5 then raise exception 'a chat turn may contain at most five attachments' using errcode='CLR10'; end if;
  for elem in select value from jsonb_array_elements(new.parts) loop
    if elem->>'type'='attachment' then
      if coalesce(elem->>'intake_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or coalesce(elem->>'document_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or not exists (
           select 1 from clara.document_intakes i
            where i.id=(elem->>'intake_id')::uuid and i.firm_id=v_firm
              and i.uploaded_by=v_author and i.status in ('finalized','adopted')
              and i.document_id=(elem->>'document_id')::uuid) then
        raise exception 'attachment is not an adopted intake for this author and firm' using errcode='CLR11';
      end if;
    end if;
  end loop;
  return new;
end $$;
create trigger t_chat_messages_attachment_admission before insert on clara.chat_messages
  for each row execute function clara._tf_validate_chat_attachments();

create function clara._tf_processing_task_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ok boolean;
begin
  if tg_op = 'DELETE' then raise exception 'document processing tasks are not deleted' using errcode = 'CLR08'; end if;
  if old.status in ('done','failed') then
    raise exception 'terminal document processing task is immutable' using errcode = 'CLR16';
  end if;
  if new.id <> old.id or new.firm_id <> old.firm_id or new.document_id <> old.document_id
     or new.engine_id <> old.engine_id or new.engine_config <> old.engine_config
     or new.version_n <> old.version_n or new.lane <> old.lane or new.created_at <> old.created_at then
    raise exception 'document processing task identity/config is immutable' using errcode = 'CLR08';
  end if;
  if new.status <> old.status then
    v_ok := (old.status = 'queued' and new.status in ('running','held_egress'))
         or (old.status = 'held_egress' and new.status = 'queued')
         or (old.status = 'running' and new.status in ('done','failed','queued'));
    if not v_ok then
      raise exception 'illegal document processing transition % -> %', old.status, new.status using errcode = 'CLR16';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger t_document_processing_tasks_update before update or delete on clara.document_processing_tasks
  for each row execute function clara._tf_processing_task_update();

create function clara._tf_extraction_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'document extractions are historical' using errcode = 'CLR08'; end if;
  if old.superseded_by is not null or new.superseded_by is null then
    raise exception 'extraction may be superseded exactly once' using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - 'superseded_by') is distinct from (to_jsonb(old) - 'superseded_by') then
    raise exception 'extraction facts are immutable' using errcode = 'CLR08';
  end if;
  return new;
end $$;
create trigger t_document_extractions_update before update or delete on clara.document_extractions
  for each row execute function clara._tf_extraction_update();
create trigger t_document_regions_append_only before update or delete on clara.document_regions
  for each row execute function clara._tf_append_only();
create trigger t_client_identifiers_append_only before update or delete on clara.client_identifiers
  for each row execute function clara._tf_append_only();

create function clara._tf_client_alias_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'client aliases are historical' using errcode = 'CLR08'; end if;
  if old.retired_at is not null or new.retired_at is null or new.retired_by is null then
    raise exception 'alias may only transition active->retired' using errcode = 'CLR20';
  end if;
  if (to_jsonb(new) - array['retired_at','retired_by'])
     is distinct from (to_jsonb(old) - array['retired_at','retired_by']) then
    raise exception 'alias identity is immutable' using errcode = 'CLR08';
  end if;
  return new;
end $$;
create trigger t_client_aliases_update before update or delete on clara.client_aliases
  for each row execute function clara._tf_client_alias_update();
create trigger t_attribution_attempts_append_only before update or delete on clara.attribution_attempts
  for each row execute function clara._tf_append_only();
create trigger t_candidate_regions_append_only before update or delete on clara.attribution_candidate_regions
  for each row execute function clara._tf_append_only();

create function clara._tf_attribution_candidate_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'attribution candidates are historical' using errcode = 'CLR08'; end if;
  if old.disposition <> 'open' or new.disposition not in ('confirmed','dismissed')
     or new.disposed_by is null or new.disposed_at is null then
    raise exception 'illegal attribution candidate transition' using errcode = 'CLR20';
  end if;
  if (to_jsonb(new) - array['disposition','disposed_by','disposed_at'])
     is distinct from (to_jsonb(old) - array['disposition','disposed_by','disposed_at']) then
    raise exception 'attribution candidate identity is immutable' using errcode = 'CLR08';
  end if;
  return new;
end $$;
create trigger t_attribution_candidates_update before update or delete on clara.attribution_candidates
  for each row execute function clara._tf_attribution_candidate_update();

create function clara._tf_filing_correction_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'filing corrections are historical' using errcode = 'CLR08'; end if;
  if old.status in ('completed','rejected','stale') then
    raise exception 'terminal filing correction is immutable' using errcode = 'CLR19';
  end if;
  if not ((old.status = 'proposed' and new.status in ('approved','completed','rejected','stale'))
       or (old.status = 'approved' and new.status in ('completed','stale'))) then
    raise exception 'illegal filing correction transition % -> %', old.status, new.status using errcode = 'CLR19';
  end if;
  if (to_jsonb(new) - array['status','checker','attestation','approved_at','completed_at','rejected_at','updated_at'])
     is distinct from (to_jsonb(old) - array['status','checker','attestation','approved_at','completed_at','rejected_at','updated_at']) then
    raise exception 'filing correction plan is immutable' using errcode = 'CLR08';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger t_filing_corrections_update before update or delete on clara.filing_corrections
  for each row execute function clara._tf_filing_correction_update();
create trigger t_filing_correction_items_append_only before delete on clara.filing_correction_items
  for each row execute function clara._tf_append_only();

create function clara._tf_reservation_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ok boolean;
begin
  if tg_op = 'DELETE' then raise exception 'document reservations are not deleted' using errcode = 'CLR08'; end if;
  if old.state in ('settled','refunded') then
    raise exception 'terminal document reservation is immutable' using errcode = 'CLR18';
  end if;
  v_ok := (old.state = 'reserved' and new.state in ('reserved','resized','settled','refunded'))
       or (old.state = 'resized' and new.state in ('resized','settled','refunded'));
  if not v_ok then raise exception 'illegal document reservation transition' using errcode = 'CLR18'; end if;
  if new.id <> old.id or new.firm_id <> old.firm_id or new.intake_id <> old.intake_id
     or new.docs_reserved <> old.docs_reserved or new.created_at <> old.created_at then
    raise exception 'document reservation identity is immutable' using errcode = 'CLR08';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger t_document_ingest_reservations_update before update or delete on clara.document_ingest_reservations
  for each row execute function clara._tf_reservation_update();

-- Every new table is FORCE-RLS, including owner policy so definer writers work.
do $$
declare t text;
begin
  foreach t in array array[
    'document_filings','document_intakes','document_processing_tasks','document_extractions',
    'document_regions','client_identifiers','client_aliases','attribution_attempts',
    'attribution_candidates','attribution_candidate_regions','filing_corrections',
    'filing_correction_items','firm_document_limits','document_ingest_reservations'
  ] loop
    execute format('alter table clara.%I enable row level security', t);
    execute format('alter table clara.%I force row level security', t);
    execute format('create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)', t, t);
  end loop;
end $$;

-- Human and agent read lanes. All mutation remains through named definer writers.
create policy p_document_filings_human on clara.document_filings for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_document_filings_agent on clara.document_filings for select to clara_agent_ro
  using (firm_id = clara.wake_firm());
create policy p_document_extractions_human on clara.document_extractions for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_document_extractions_agent on clara.document_extractions for select to clara_agent_ro
  using (firm_id = clara.wake_firm());
create policy p_document_regions_human on clara.document_regions for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_document_regions_agent on clara.document_regions for select to clara_agent_ro
  using (firm_id = clara.wake_firm());

create policy p_client_identifiers_human on clara.client_identifiers for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_client_identifiers_runtime on clara.client_identifiers for select to clara_runtime using (true);
create policy p_client_aliases_human on clara.client_aliases for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_client_aliases_runtime on clara.client_aliases for select to clara_runtime using (true);

create policy p_attribution_attempts_human on clara.attribution_attempts for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_attribution_candidates_human on clara.attribution_candidates for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_candidate_regions_human on clara.attribution_candidate_regions for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_filing_corrections_human on clara.filing_corrections for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_filing_correction_items_human on clara.filing_correction_items for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
create policy p_firm_document_limits_human on clara.firm_document_limits for select to clara_authenticated
  using (firm_id = clara.jwt_firm());

-- Runtime base-table policies exist so policy shape is explicit, but no base-table
-- grants are issued for writer-only carriers. Matcher registry reads are the exception.
create policy p_document_intakes_runtime on clara.document_intakes for all to clara_runtime using (true) with check (true);
create policy p_processing_tasks_runtime on clara.document_processing_tasks for all to clara_runtime using (true) with check (true);
create policy p_ingest_reservations_runtime on clara.document_ingest_reservations for all to clara_runtime using (true) with check (true);
create policy p_firm_document_limits_runtime on clara.firm_document_limits for select to clara_runtime using (true);

-- =====================================================================
-- 3. LEGACY FILING + CITATION BACKFILL (ABORTS ON ZERO/AMBIGUOUS MATCH)
-- =====================================================================

insert into clara.document_filings(firm_id, document_id, client_id, filed_by, resolution_id, basis)
select d.firm_id, d.id, d.client_id, d.uploaded_by, null, 'legacy-0007'
from clara.documents d where d.client_id is not null;

-- Disable only the immutable-entry trigger for this in-transaction upgrade. The
-- table write lock above prevents concurrent journal mutation.
set constraints all immediate;
alter table clara.journal_entries disable trigger t_je_immutable;

do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from clara.journal_entries je
  where je.document_id is not null and (
    select count(*) from clara.document_filings f
    where f.document_id = je.document_id and f.client_id = je.client_id
  ) <> 1;
  if v_bad <> 0 then
    raise exception '0007 filing_id backfill aborted: % cited entries lack exactly one legacy filing', v_bad
      using errcode = 'CLR17';
  end if;

  update clara.journal_entries je set filing_id = f.id
  from clara.document_filings f
  where je.document_id is not null and f.document_id = je.document_id
    and f.client_id = je.client_id;
end $$;

alter table clara.journal_entries enable trigger t_je_immutable;
alter table clara.journal_entries
  add constraint fk_journal_entries_filing foreign key (filing_id, firm_id)
    references clara.document_filings(id, firm_id),
  add constraint ck_je_document_filing_pair
    check ((document_id is null) = (filing_id is null)) not valid;
alter table clara.journal_entries validate constraint ck_je_document_filing_pair;

-- =====================================================================
-- 4. CLIENT_ID DROP BLAST RADIUS + FILING-BOUND PROVENANCE
-- =====================================================================

-- Historical document events may refer to retired filings, hence ANY filing
-- establishes document/client congruence here. Admission uses ACTIVE filings.
create or replace function clara._tf_validate_domain_event() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_client_scoped boolean;
begin
  select client_scoped into v_client_scoped from clara.event_types where name = new.event_type;
  if v_client_scoped is null then
    raise exception 'unknown event_type %', new.event_type using errcode = 'CLR10';
  end if;
  if not v_client_scoped and new.client_id is not null then
    raise exception 'firm-level event % must not carry a client_id', new.event_type using errcode = 'CLR10';
  end if;
  if new.client_id is not null and not exists (
    select 1 from clara.clients c where c.id = new.client_id and c.firm_id = new.firm_id
  ) then
    raise exception 'event client_id % not in firm %', new.client_id, new.firm_id using errcode = 'CLR10';
  end if;
  if new.entry_id is not null and not exists (
    select 1 from clara.journal_entries je where je.id = new.entry_id and je.firm_id = new.firm_id
      and (new.client_id is null or je.client_id = new.client_id)
  ) then
    raise exception 'event entry_id % not in firm/client', new.entry_id using errcode = 'CLR10';
  end if;
  if new.document_id is not null and not exists (
    select 1 from clara.documents d where d.id = new.document_id and d.firm_id = new.firm_id
      and (new.client_id is null or exists (
        select 1 from clara.document_filings f
        where f.document_id = d.id and f.client_id = new.client_id and f.firm_id = new.firm_id))
  ) then
    raise exception 'event document_id % not in firm/client filing history', new.document_id using errcode = 'CLR10';
  end if;
  if new.resolution_id is not null and not exists (
    select 1 from clara.client_resolutions r where r.id = new.resolution_id and r.firm_id = new.firm_id
      and (new.client_id is null or r.client_id = new.client_id)
  ) then
    raise exception 'event resolution_id % not in firm/client', new.resolution_id using errcode = 'CLR10';
  end if;
  return new;
end $$;

-- Documents no longer derive firm from attribution; the sole creator passes a
-- validated firm and this trigger verifies it exists.
create function clara._tf_stamp_document_firm() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.firm_id is null or not exists (select 1 from clara.firms where id = new.firm_id) then
    raise exception 'document requires a valid firm' using errcode = 'CLR11';
  end if;
  return new;
end $$;
drop trigger t_documents_stamp on clara.documents;
create trigger t_documents_stamp before insert on clara.documents
  for each row execute function clara._tf_stamp_document_firm();

-- One-time claim-only upgrade: bytes_verified_at NULL->NOT NULL and canonical
-- storage_path may change together exactly once, only while the dedicated writer
-- sets clara.document_upgrade to the target id. All identity stays frozen.
create or replace function clara._tf_documents_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_upgrade boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'documents are never deleted' using errcode = 'CLR08';
  end if;
  if new.id is distinct from old.id or new.sha256 is distinct from old.sha256
     or new.firm_id is distinct from old.firm_id then
    raise exception 'document identity is immutable' using errcode = 'CLR08';
  end if;

  if new.bytes_verified_at is distinct from old.bytes_verified_at
     or new.storage_path is distinct from old.storage_path then
    v_upgrade := old.bytes_verified_at is null and new.bytes_verified_at is not null
      and new.storage_path is not null
      and current_setting('clara.document_upgrade', true) = old.id::text;
    if not v_upgrade then
      raise exception 'document bytes/storage bond may change only through legacy upgrade' using errcode = 'CLR15';
    end if;
    if (to_jsonb(new) - array['bytes_verified_at','storage_path'])
       is distinct from (to_jsonb(old) - array['bytes_verified_at','storage_path']) then
      raise exception 'legacy upgrade may stamp only bytes_verified_at and storage_path' using errcode = 'CLR15';
    end if;
  end if;
  return new;
end $$;

create function clara._tf_document_retention_floor() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.retain_until is not null
     and (new.retain_until is null or new.retain_until < old.retain_until) then
    raise exception 'document retention floor may never shorten' using errcode = 'CLR17';
  end if;
  return new;
end $$;
create trigger t_documents_retention_floor before update on clara.documents
  for each row execute function clara._tf_document_retention_floor();

-- Bound-filing belt: the filing itself may now be retired, because activity was
-- an admission-time property. Congruence remains exact and deferred.
create or replace function clara._tf_check_provenance() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.document_id is not null then
    if not exists (
      select 1 from clara.documents d
      join clara.document_filings f on f.id = new.filing_id and f.document_id = d.id
      where d.id = new.document_id and d.sha256 = new.source_doc_sha256
        and d.firm_id = new.firm_id and f.firm_id = new.firm_id
        and f.client_id = new.client_id
    ) then
      raise exception 'filing-bound provenance mismatch for entry %', new.id using errcode = 'CLR02';
    end if;
  end if;
  return null;
end $$;

create function clara._active_document_filing(p_document uuid, p_sha256 text, p_client uuid,
    p_lock boolean default false) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_filing uuid;
begin
  if p_lock then
    select f.id into v_filing
    from clara.document_filings f join clara.documents d on d.id = f.document_id
    where f.document_id = p_document and f.client_id = p_client and f.retired_at is null
      and d.sha256 = p_sha256 and d.bytes_verified_at is not null
    for share of f;
  else
    select f.id into v_filing
    from clara.document_filings f join clara.documents d on d.id = f.document_id
    where f.document_id = p_document and f.client_id = p_client and f.retired_at is null
      and d.sha256 = p_sha256 and d.bytes_verified_at is not null;
  end if;
  if v_filing is null then
    raise exception 'active verified filing provenance not established' using errcode = 'CLR02';
  end if;
  return v_filing;
end $$;

create or replace function clara.assert_provenance(p_document uuid, p_sha256 text, p_client uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._active_document_filing(p_document, p_sha256, p_client, false);
end $$;

-- Withdrawn is a frozen evidence state: draft->withdrawn only, with actor/reason/time.
alter table clara.journal_entries drop constraint journal_entries_status_check;
alter table clara.journal_entries add constraint ck_journal_entries_status
  check (status in ('draft','approved','withdrawn'));
alter table clara.journal_entries add constraint ck_journal_entries_withdrawal check (
  (status = 'withdrawn' and withdrawn_by is not null and withdrawn_at is not null
    and withdrawal_reason is not null and btrim(withdrawal_reason) <> '')
  or (status <> 'withdrawn' and withdrawn_by is null and withdrawn_at is null and withdrawal_reason is null)
);

create or replace function clara._tf_entry_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_allowed text[];
begin
  if tg_op = 'DELETE' then
    raise exception 'journal entries are never deleted (reverse, not delete)' using errcode = 'CLR08';
  end if;
  if old.status = 'draft' and new.status = 'draft' then
    v_allowed := array['revision_token','updated_at'];
  elsif old.status = 'draft' and new.status = 'approved' then
    if old.checker_actor is not null or new.checker_actor is null or new.approved_at is null then
      raise exception 'illegal approval transition' using errcode = 'CLR08';
    end if;
    v_allowed := array['status','checker_actor','approved_at','self_approval_attestation','updated_at'];
  elsif old.status = 'draft' and new.status = 'withdrawn' then
    if new.withdrawn_by is null or new.withdrawn_at is null
       or btrim(coalesce(new.withdrawal_reason,'')) = '' then
      raise exception 'withdrawal requires actor, time, and reason' using errcode = 'CLR08';
    end if;
    v_allowed := array['status','withdrawn_by','withdrawn_at','withdrawal_reason','updated_at'];
  elsif old.status = 'approved' and new.status = 'approved' then
    if old.reversed_by is not null or old.reversal_reason is not null then
      raise exception 'entry already reversed' using errcode = 'CLR08';
    end if;
    if new.reversed_by is null or btrim(coalesce(new.reversal_reason,'')) = '' then
      raise exception 'approved entries permit only a complete reversal-linkage pair' using errcode = 'CLR08';
    end if;
    v_allowed := array['reversed_by','reversal_reason','updated_at'];
  else
    raise exception 'illegal status transition % -> %', old.status, new.status using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'illegal change to entry (status % -> %)', old.status, new.status using errcode = 'CLR08';
  end if;
  return new;
end $$;

create or replace function clara._tf_lines_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_status text;
begin
  if tg_op in ('UPDATE','DELETE') and old.entry_id is not null then
    select status into v_status from clara.journal_entries where id = old.entry_id;
    if v_status in ('approved','withdrawn') then
      raise exception 'lines of an approved/withdrawn entry are immutable' using errcode = 'CLR08';
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.entry_id is not null then
    select status into v_status from clara.journal_entries where id = new.entry_id;
    if v_status in ('approved','withdrawn') then
      raise exception 'lines of an approved/withdrawn entry are immutable' using errcode = 'CLR08';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Retire both unverified SQL ingest paths without changing their signatures, then
-- remove their core and wake authority. Superuser calls receive a deterministic
-- retired/immutable error; app roles fail at the privilege wall.
create or replace function clara.ingest_document(p_client uuid, p_sha256 text, p_filename text,
    p_mime text, p_bytes bigint, p_storage_path text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'legacy ingest_document is retired; use the verified intake finalizer'
    using errcode = 'CLR13';
end $$;

create or replace function clara.wake_ingest_document(p_client uuid, p_sha256 text, p_filename text,
    p_mime text, p_bytes bigint, p_storage_path text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'legacy wake_ingest_document is retired; use the verified intake finalizer'
    using errcode = 'CLR13';
end $$;

-- Keep the historical house-name visible for catalog/upgrade probes while the
-- canonical v0004 column remains function_name.
alter table clara.wake_fn_allowlist
  add column fn_name text generated always as (function_name) stored;
delete from clara.wake_fn_allowlist where function_name = 'wake_ingest_document';
drop function clara._ingest_document_core(uuid, uuid, uuid, text, uuid, text, text, text, bigint, text, text);

-- Replace every remaining documents.client_id dependency, then drop the column.
drop index clara.ix_documents_client_recent;
alter table clara.documents drop constraint documents_client_id_fkey;
alter table clara.documents drop column client_id;

-- New document indexes are filing/content-addressed.
create index ix_documents_firm_recent on clara.documents(firm_id, created_at desc);
-- The unassigned lane is an anti-join against this active-filing index.
create index ix_document_filings_active_lane on clara.document_filings(firm_id, document_id)
  where retired_at is null;

-- Context pack stays ONE statement/snapshot. Documents are reached through ACTIVE
-- filings and expose metadata only; extraction envelopes/region text never serialize.
create or replace function clara.get_context_pack(p_client uuid, p_purpose text) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
begin
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'a context-pack purpose is required' using errcode = 'CLR10';
  end if;
  return (
    select jsonb_build_object(
      'pack_schema_version', 2,
      'purpose', p_purpose,
      'generated_at', now(),
      'books_version', (select coalesce(max(de.seq), 0)
                        from clara.domain_events de where de.firm_id = cl.firm_id),
      'client', jsonb_build_object('id', cl.id, 'name', cl.name, 'status', cl.status),
      'firm', (select jsonb_build_object('id', f.id, 'name', f.name,
                        'high_stakes_amount_cents', f.high_stakes_amount_cents)
               from clara.firms f where f.id = cl.firm_id),
      'coa', (select coalesce(jsonb_agg(jsonb_build_object(
                        'account_code', a.account_code, 'name', a.name,
                        'account_type', a.account_type, 'special_acc_type', a.special_acc_type,
                        'is_active', a.is_active) order by a.account_code), '[]'::jsonb)
              from clara.coa_accounts a where a.client_id = cl.id),
      'trial_balance', (select coalesce(jsonb_agg(to_jsonb(tb) order by tb.account_code), '[]'::jsonb)
                        from clara.trial_balance(cl.id) tb),
      'recent_entries', (select coalesce(jsonb_agg(jsonb_build_object(
                            'entry', to_jsonb(je),
                            'lines', (select coalesce(jsonb_agg(to_jsonb(jl) order by jl.line_no), '[]'::jsonb)
                                      from clara.journal_lines jl where jl.entry_id = je.id))
                            order by je.posting_date desc, je.created_at desc), '[]'::jsonb)
                         from (select * from clara.journal_entries
                               where client_id = cl.id and status <> 'withdrawn'
                               order by posting_date desc, created_at desc limit 50) je),
      'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', d.id, 'sha256', d.sha256,
                          'original_filename', d.original_filename, 'mime_type', d.mime_type,
                          'byte_size', d.byte_size, 'status', d.status,
                          'bytes_verified_at', d.bytes_verified_at, 'page_count', d.page_count,
                          'extraction_status', d.extraction_status, 'document_kind', d.document_kind,
                          'financial_date', d.financial_date, 'retention_state', d.retention_state,
                          'retain_until', d.retain_until, 'legal_hold', d.legal_hold,
                          'created_at', d.created_at, 'filing_id', df.id,
                          'filed_at', df.filed_at, 'filing_basis', df.basis)
                          order by df.filed_at desc), '[]'::jsonb)
                    from clara.document_filings df join clara.documents d on d.id = df.document_id
                    where df.client_id = cl.id and df.retired_at is null),
      'resolutions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
                      from clara.client_resolutions r
                      where r.client_id = cl.id and r.superseded_at is null),
      'approval_history', (select coalesce(jsonb_agg(jsonb_build_object(
                              'entry_id', je.id, 'status', je.status, 'approved_at', je.approved_at,
                              'checker_actor', je.checker_actor, 'maker_actor', je.maker_actor,
                              'reversal_of', je.reversal_of, 'reversed_by', je.reversed_by)
                              order by je.approved_at desc), '[]'::jsonb)
                           from (select * from clara.journal_entries
                                 where client_id = cl.id and approved_at is not null
                                 order by approved_at desc limit 25) je)
    ) from clara.clients cl where cl.id = p_client
  );
end $$;

-- =====================================================================
-- 5. POSTING WRITERS: ACTIVE-FILING ADMISSION + APPROVAL RE-AFFIRMATION
-- =====================================================================

create or replace function clara._draft_entry_core(p_actor uuid, p_firm uuid, p_obo uuid,
    p_wake_kind text, p_is_human boolean, p_client uuid, p_resolution uuid,
    p_posting_date date, p_memo text, p_lines jsonb, p_document uuid, p_sha256 text,
    p_flags jsonb, p_op_key text, p_books_version bigint)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_dedupe jsonb; v_client_firm uuid; v_client_status text; v_origin text;
  v_entry uuid; v_token uuid; v_filing uuid;
  v_dr bigint; v_cr bigint; v_n int; v_residual bigint; v_round text;
  v_round_dr bigint := 0; v_round_cr bigint := 0; v_receipt jsonb; v_seq bigint;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(p_firm, 'draft_entry', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'r', p_resolution, 'd', p_posting_date,
      'm', p_memo, 'l', p_lines, 'doc', p_document, 'sha', p_sha256, 'f', p_flags)));
  if v_dedupe is not null then return v_dedupe; end if;

  select firm_id, status into v_client_firm, v_client_status from clara.clients where id = p_client;
  if v_client_firm is null or v_client_firm <> p_firm then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  if v_client_status = 'archived' then
    raise exception 'client is archived -- no new postings' using errcode = 'CLR10';
  end if;
  if not p_is_human then perform clara.assert_books_current(p_firm, p_client, p_books_version, null); end if;

  if (p_document is null) <> (p_sha256 is null) then
    raise exception 'document and sha256 must be both set or both null' using errcode = 'CLR10';
  end if;
  if p_document is not null then
    -- Shared lock is acquired before any entry/slot mutation, matching correction order.
    v_filing := clara._active_document_filing(p_document, p_sha256, p_client, true);
  end if;
  -- Keep the established exact-document resolution branch. Provenance is checked
  -- first so an absent/foreign filing remains the non-oracular CLR02 boundary.
  perform clara.assert_client_resolved(p_client, p_resolution, p_document);

  v_origin := case when p_document is not null then 'document'
                   when p_is_human then 'manual' else 'agent' end;
  if p_document is null and (p_memo is null or btrim(p_memo) = '') then
    raise exception 'a non-document entry requires a memo (its basis)' using errcode = 'CLR10';
  end if;

  begin
    select coalesce(sum((e.elem->>'debit_cents')::bigint), 0),
           coalesce(sum((e.elem->>'credit_cents')::bigint), 0), count(*)
      into v_dr, v_cr, v_n from jsonb_array_elements(p_lines) as e(elem);
  exception when others then
    raise exception 'malformed line amounts (cents must be integers)' using errcode = 'CLR10';
  end;
  if v_n < 2 then raise exception 'an entry needs at least two lines' using errcode = 'CLR10'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as e(elem)
    where not exists (select 1 from clara.coa_accounts a
      where a.client_id = p_client and a.account_code = (e.elem->>'account_code') and a.is_active)
  ) then raise exception 'line codes to a non-existent account' using errcode = 'CLR10'; end if;

  v_residual := abs(v_dr - v_cr);
  if v_residual > 5 then raise exception 'entry is unbalanced by %c', v_residual using errcode = 'CLR07'; end if;
  if v_residual between 1 and 5 then
    select account_code into v_round from clara.coa_accounts
      where client_id = p_client and special_acc_type = 'rounding' and is_active;
    if v_round is null then raise exception 'rounding_account_missing' using errcode = 'CLR10'; end if;
    if v_dr > v_cr then v_round_cr := v_residual; else v_round_dr := v_residual; end if;
  end if;

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      document_id, filing_id, source_doc_sha256, resolution_id, is_opening_balance,
      is_year_end, tax_affecting, maker_actor, last_human_editor)
  values (p_client, 'draft', p_posting_date, p_memo, v_origin, p_document, v_filing,
      p_sha256, p_resolution, false,
      coalesce((p_flags->>'is_year_end')::boolean, false),
      coalesce((p_flags->>'tax_affecting')::boolean, false),
      p_actor, case when p_is_human then p_actor end)
  returning id into v_entry;

  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
  select v_entry, e.idx, (e.elem->>'account_code'),
         coalesce((e.elem->>'debit_cents')::bigint, 0),
         coalesce((e.elem->>'credit_cents')::bigint, 0), (e.elem->>'description')
  from jsonb_array_elements(p_lines) with ordinality as e(elem, idx);
  if v_round is not null then
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
    values (v_entry, v_n + 1, v_round, v_round_dr, v_round_cr, 'auto rounding');
  end if;

  perform clara._assert_balanced(v_entry);
  select revision_token into v_token from clara.journal_entries where id = v_entry;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'draft_entry', v_entry,
    jsonb_build_object('client', p_client, 'filing', v_filing, 'op_key', p_op_key));
  v_seq := clara._append_event(p_firm, 'entry.drafted', p_client, p_actor, p_obo,
    p_wake_kind, v_entry, p_document, p_resolution, '{}'::jsonb);
  if not p_is_human then perform clara.assert_books_current(p_firm, p_client, p_books_version, v_seq); end if;
  v_receipt := jsonb_build_object('entry_id', v_entry, 'revision_token', v_token,
    'status', 'draft', 'filing_id', v_filing);
  return clara._finish_op(p_firm, 'draft_entry', p_op_key, v_receipt);
end $$;

create or replace function clara.approve_entry(p_entry uuid, p_expected_revision uuid,
    p_attestation text default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; e record; v_attest text; v_filing uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'approve_entry', p_op_key,
    clara._hash(jsonb_build_object('e', p_entry, 'rev', p_expected_revision, 'att', p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Read identity first, then lock the active filing before the entry/original/slot.
  select * into e from clara.journal_entries where id = p_entry;
  if not found or e.firm_id <> c.firm then raise exception 'entry not in your firm' using errcode = 'CLR11'; end if;
  if e.document_id is not null then
    v_filing := clara._active_document_filing(e.document_id, e.source_doc_sha256, e.client_id, true);
    if v_filing <> e.filing_id then raise exception 'entry is not bound to the active filing' using errcode = 'CLR02'; end if;
  end if;

  select * into e from clara.journal_entries where id = p_entry for update;
  if e.status <> 'draft' then raise exception 'entry is not a draft' using errcode = 'CLR10'; end if;
  if e.revision_token <> p_expected_revision then raise exception 'stale revision token' using errcode = 'CLR06'; end if;
  if e.reversal_of is not null and exists (
    select 1 from clara.journal_entries r
    where r.reversal_of = e.reversal_of and r.status = 'approved' and r.id <> p_entry) then
    raise exception 'the original was already reversed by an approved reversal' using errcode = 'CLR10';
  end if;
  if clara.is_high_stakes(p_entry) and e.last_human_editor is not null and e.last_human_editor = c.actor then
    if clara.eligible_checker_count(c.firm) >= 2 then
      raise exception 'high-stakes entry needs a distinct checker' using errcode = 'CLR05';
    elsif p_attestation is null or btrim(p_attestation) = '' then
      raise exception 'solo high-stakes approval requires an attestation' using errcode = 'CLR05';
    else v_attest := p_attestation; end if;
  end if;
  if e.reversal_of is not null then
    perform 1 from clara.journal_entries where id = e.reversal_of for update;
    if exists (select 1 from clara.journal_entries where id = e.reversal_of and reversed_by is not null) then
      raise exception 'the original was already reversed' using errcode = 'CLR10';
    end if;
  end if;
  update clara.journal_entries set status = 'approved', checker_actor = c.actor,
    approved_at = now(), self_approval_attestation = v_attest, updated_at = now() where id = p_entry;
  if e.reversal_of is not null then
    update clara.journal_entries set reversed_by = p_entry,
      reversal_reason = coalesce(e.reversal_reason, 'reversal'), updated_at = now()
      where id = e.reversal_of and reversed_by is null;
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'approve_entry', p_entry,
    jsonb_build_object('filing', e.filing_id, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'entry.approved', e.client_id, c.actor, null, null,
    p_entry, e.document_id, null, '{}'::jsonb);
  if e.reversal_of is not null then
    perform clara._append_event(c.firm, 'entry.reversed', e.client_id, c.actor, null, null,
      e.reversal_of, null, null, '{}'::jsonb);
  end if;
  return clara._finish_op(c.firm, 'approve_entry', p_op_key,
    jsonb_build_object('entry_id', p_entry, 'status', 'approved'));
end $$;

-- =====================================================================
-- 6. FILING, RETENTION, LEGAL-HOLD, AND REGISTRY WRITERS
-- =====================================================================

-- No client FY/close calendar exists yet. This dedicated honest-state point uses
-- a conservative year-end + filing buffer + seven-year floor and records the gap.
create function clara._document_retention_date(p_client uuid) returns date
  language sql stable security definer set search_path = clara, pg_temp as $$
  select (date_trunc('year', current_date)::date + interval '10 years - 1 day')::date
  where exists (select 1 from clara.clients where id = p_client);
$$;

create function clara._recompute_document_retention(p_document uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_until date; v_has boolean;
begin
  select max(clara._document_retention_date(f.client_id)), count(*) > 0
    into v_until, v_has from clara.document_filings f
    where f.document_id = p_document and f.retired_at is null;
  if v_has then
    update clara.documents set retention_state = 'anchored',
      retain_until = greatest(retain_until, v_until),
      retention_basis = 'missing-fy-conservative-0007'
      where id = p_document;
  else
    -- retain_until deliberately persists across unanchor/re-anchor cycles.
    update clara.documents set retention_state = 'unanchored' where id = p_document;
  end if;
end $$;

create function clara.file_document(p_document uuid, p_client uuid, p_resolution text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_doc_firm uuid; v_id uuid; v_basis text;
  v_resolution uuid; v_input_resolution uuid; v_created boolean := false;
  v_resolution_created boolean := false;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'file_document', p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'client',p_client,'resolution',p_resolution)));
  if v_dedupe is not null then return v_dedupe; end if;
  select firm_id into v_doc_firm from clara.documents where id = p_document for update;
  if v_doc_firm is null or v_doc_firm <> c.firm then raise exception 'document not in your firm' using errcode = 'CLR11'; end if;
  begin
    v_input_resolution:=nullif(p_resolution,'')::uuid;
  exception when invalid_text_representation then
    raise exception 'client attribution not established' using errcode='CLR01';
  end;
  if not exists (select 1 from clara.clients where id=p_client and firm_id=c.firm and status='active') then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  select id into v_id from clara.document_filings
    where document_id=p_document and client_id=p_client and retired_at is null;
  if v_id is not null then
    raise exception 'document is already actively filed to this client' using errcode='CLR10';
  end if;
  select r.id,r.method into v_resolution,v_basis from clara.client_resolutions r
    where r.id=v_input_resolution and r.client_id=p_client and r.firm_id=c.firm
      and r.method in ('human','rule') and r.confidence>=0.95 and r.superseded_at is null
      and r.subject_kind='document' and r.subject_id=p_document;
  if v_resolution is null then
    if v_input_resolution is not null and not exists (
      select 1 from clara.client_resolutions r where r.id=v_input_resolution
        and r.client_id=p_client and r.firm_id=c.firm and r.method in ('human','rule')
        and r.confidence>=0.95 and r.superseded_at is null) then
      raise exception 'client attribution not established' using errcode='CLR01';
    end if;
    insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,
        method,evidence,resolved_by)
      values(c.firm,p_client,'document',p_document,1.0,'human',
        jsonb_build_object('source_resolution_id',v_input_resolution,'source','file_document'),c.actor)
      returning id,method into v_resolution,v_basis;
    v_resolution_created:=true;
  end if;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by,
      resolution_id, basis)
  values (c.firm, p_document, p_client, c.actor, v_resolution,
      case when v_basis = 'rule' then 'rule' else 'human' end)
  returning id into v_id;
  v_created := true;
  perform clara._recompute_document_retention(p_document);
  perform clara._audit(c.firm, c.actor, null, null, 'file_document', null,
    jsonb_build_object('document',p_document,'client',p_client,'resolution',v_resolution,
      'filing',v_id,'op_key',p_op_key));
  if v_resolution_created then
    perform clara._append_event(c.firm,'client.resolved',p_client,c.actor,null,null,
      null,p_document,v_resolution,'{}'::jsonb);
  end if;
  if v_created then
    perform clara._append_event(c.firm, 'document.filed', p_client, c.actor, null, null,
      null, p_document, v_resolution, jsonb_build_object('filing_id',v_id));
  end if;
  return clara._finish_op(c.firm, 'file_document', p_op_key,
    jsonb_build_object('filing_id',v_id,'document_id',p_document,'client_id',p_client));
end $$;

create function clara.retire_document_filing(p_filing_id uuid, p_reason text,
    p_expected_revision uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; f record; v_blockers jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'retirement reason is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'retire_document_filing', p_op_key,
    clara._hash(jsonb_build_object('filing',p_filing_id,'reason',p_reason,'revision',p_expected_revision)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into f from clara.document_filings where id = p_filing_id for update;
  if not found or f.firm_id <> c.firm then raise exception 'filing not in your firm' using errcode = 'CLR11'; end if;
  if f.retired_at is not null then raise exception 'filing is already retired' using errcode = 'CLR17'; end if;
  if f.revision_token <> p_expected_revision then raise exception 'stale filing revision' using errcode = 'CLR17'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id',je.id,'posting_date',je.posting_date,
      'status',je.status,'period_state',clara._correction_period_state(je.id))
      order by je.posting_date, je.id), '[]'::jsonb) into v_blockers
    from clara.journal_entries je where je.filing_id = f.id
      and ((je.status = 'draft') or (je.status = 'approved' and je.reversed_by is null));
  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'filing has live citation blockers: %', v_blockers::text using errcode = 'CLR10';
  end if;
  update clara.document_filings set retired_at = now(), retired_by = c.actor,
    retirement_reason = p_reason where id = f.id;
  perform clara._recompute_document_retention(f.document_id);
  perform clara._audit(c.firm,c.actor,null,null,'retire_document_filing',null,
    jsonb_build_object('filing',f.id,'document',f.document_id,'client',f.client_id,'op_key',p_op_key));
  perform clara._append_event(c.firm,'document.filing_retired',f.client_id,c.actor,null,null,
    null,f.document_id,f.resolution_id,jsonb_build_object('filing_id',f.id));
  return clara._finish_op(c.firm,'retire_document_filing',p_op_key,
    jsonb_build_object('filing_id',f.id,'status','retired','blockers','[]'::jsonb));
end $$;

create function clara.place_legal_hold(p_document uuid, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' or p_reason is null or btrim(p_reason) = '' then
    raise exception 'op_key and legal-hold reason are required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'place_legal_hold',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.documents set legal_hold = true, legal_hold_reason = p_reason
    where id = p_document and firm_id = c.firm;
  if not found then raise exception 'document not in your firm' using errcode = 'CLR11'; end if;
  perform clara._audit(c.firm,c.actor,null,null,'place_legal_hold',null,
    jsonb_build_object('document',p_document,'op_key',p_op_key));
  return clara._finish_op(c.firm,'place_legal_hold',p_op_key,
    jsonb_build_object('document_id',p_document,'legal_hold',true));
end $$;

create function clara.release_legal_hold(p_document uuid, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' or p_reason is null or btrim(p_reason) = '' then
    raise exception 'op_key and release reason are required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'release_legal_hold',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.documents set legal_hold = false, legal_hold_reason = null
    where id = p_document and firm_id = c.firm and legal_hold;
  if not found then raise exception 'document not held in your firm' using errcode = 'CLR17'; end if;
  perform clara._audit(c.firm,c.actor,null,null,'release_legal_hold',null,
    jsonb_build_object('document',p_document,'reason',p_reason,'op_key',p_op_key));
  return clara._finish_op(c.firm,'release_legal_hold',p_op_key,
    jsonb_build_object('document_id',p_document,'legal_hold',false));
end $$;

create function clara.add_client_identifier(p_client uuid, p_kind text, p_value_normalized text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  -- DC-1 (as-built review): normalization must MATCH the lane-1 predicate, which
  -- strips ALL whitespace — machine identifiers (TIN/SSM/bank account) carry no
  -- semantic internal whitespace; a btrim-only store could never match a spaced form.
  v_dedupe := clara._reserve_op(c.firm,'add_client_identifier',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'kind',p_kind,'value',lower(regexp_replace(p_value_normalized,'\s+','','g')))));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists (select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
    values(c.firm,p_client,p_kind,lower(regexp_replace(p_value_normalized,'\s+','','g')),c.actor) returning id into v_id;
  perform clara._audit(c.firm,c.actor,null,null,'add_client_identifier',null,
    jsonb_build_object('client',p_client,'identifier',v_id,'kind',p_kind,'op_key',p_op_key));
  return clara._finish_op(c.firm,'add_client_identifier',p_op_key,jsonb_build_object('identifier_id',v_id));
end $$;

create function clara.add_client_alias(p_client uuid, p_alias_normalized text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm,'add_client_alias',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'alias',lower(btrim(p_alias_normalized)))));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists (select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  insert into clara.client_aliases(firm_id,client_id,alias_normalized,added_by)
    values(c.firm,p_client,lower(btrim(p_alias_normalized)),c.actor) returning id into v_id;
  perform clara._audit(c.firm,c.actor,null,null,'add_client_alias',null,
    jsonb_build_object('client',p_client,'alias',v_id,'op_key',p_op_key));
  return clara._finish_op(c.firm,'add_client_alias',p_op_key,jsonb_build_object('alias_id',v_id));
end $$;

create function clara.retire_client_alias(p_alias uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm,'retire_client_alias',p_op_key,clara._hash(jsonb_build_object('alias',p_alias)));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.client_aliases set retired_at=now(),retired_by=c.actor
    where id=p_alias and firm_id=c.firm and retired_at is null;
  if not found then raise exception 'active alias not in your firm' using errcode = 'CLR20'; end if;
  perform clara._audit(c.firm,c.actor,null,null,'retire_client_alias',null,
    jsonb_build_object('alias',p_alias,'op_key',p_op_key));
  return clara._finish_op(c.firm,'retire_client_alias',p_op_key,jsonb_build_object('alias_id',p_alias,'status','retired'));
end $$;

-- Migration/seed/rig-only verified fixture helper. No app role receives EXECUTE.
create function clara._seed_verified_document(p_firm uuid, p_client uuid, p_sha256 text,
    p_filename text, p_mime text, p_bytes bigint, p_storage_path text,
    p_uploaded_by uuid default null, p_page_count int default 1,
    p_document_kind text default null, p_financial_date date default null,
    p_resolution uuid default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_doc uuid; v_res uuid; v_filing uuid; v_method text;
begin
  if not exists (select 1 from clara.firms where id=p_firm) then raise exception 'unknown seed firm' using errcode='CLR11'; end if;
  if p_client is not null and not exists (select 1 from clara.clients where id=p_client and firm_id=p_firm) then
    raise exception 'seed client not in firm' using errcode='CLR11';
  end if;
  insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,storage_path,
      bytes_verified_at,extraction_status,uploaded_by,page_count,document_kind,financial_date)
    values(p_firm,p_sha256,p_filename,p_mime,p_bytes,p_storage_path,now(),'pending',p_uploaded_by,
      p_page_count,p_document_kind,p_financial_date)
    on conflict (firm_id,sha256) do update set original_filename=excluded.original_filename
    returning id into v_doc;
  if p_client is not null then
    select id into v_filing from clara.document_filings
      where document_id=v_doc and client_id=p_client and retired_at is null;
    if v_filing is null then
      select r.id,r.method into v_res,v_method from clara.client_resolutions r
        where r.id=p_resolution and r.firm_id=p_firm and r.client_id=p_client
          and r.subject_kind='document' and r.subject_id=v_doc and r.confidence>=0.95
          and r.method in ('human','rule') and r.superseded_at is null;
      if v_res is null then
        insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,
            method,evidence,resolved_by)
          values(p_firm,p_client,'document',v_doc,1.0,'human',
            jsonb_build_object('fixture','_seed_verified_document','source_resolution_id',p_resolution),
            p_uploaded_by)
          returning id,method into v_res,v_method;
      end if;
      insert into clara.document_filings(firm_id,document_id,client_id,filed_by,resolution_id,basis)
        values(p_firm,v_doc,p_client,p_uploaded_by,v_res,
          case when v_method='rule' then 'rule' else 'seed-0007' end) returning id into v_filing;
      perform clara._recompute_document_retention(v_doc);
      perform clara._append_event(p_firm,'client.resolved',p_client,p_uploaded_by,null,null,
        null,v_doc,v_res,'{}'::jsonb);
      perform clara._append_event(p_firm,'document.filed',p_client,p_uploaded_by,null,null,
        null,v_doc,v_res,jsonb_build_object('filing_id',v_filing));
    end if;
  end if;
  perform clara._audit(p_firm,p_uploaded_by,null,null,'_seed_verified_document',null,
    jsonb_build_object('document',v_doc,'client',p_client));
  perform clara._append_event(p_firm,'document.ingested',null,p_uploaded_by,null,null,
    null,v_doc,null,'{}'::jsonb);
  return jsonb_build_object('document_id',v_doc,'filing_id',v_filing,'resolution_id',v_res);
end $$;

-- =====================================================================
-- 7. DURABLE INTAKE, RESERVATION, PROCESSING, AND EXTRACTION WRITERS
-- =====================================================================

create function clara._declared_page_ceiling(p_bytes bigint, p_mime text) returns int
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case
    when lower(coalesce(p_mime,'')) like 'image/%' then 1
    when p_bytes <= 1048576  then 10
    when p_bytes <= 5242880  then 50
    when p_bytes <= 10485760 then 100
    else 200 end;
$$;

create function clara._reserve_document_ingest(p_firm uuid, p_intake uuid, p_pages int,
    p_lease_expires timestamptz) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_docs_limit int; v_pages_limit int; v_docs int; v_pages bigint; v_id uuid;
begin
  perform pg_advisory_xact_lock(203005001, hashtext(p_firm::text));
  select coalesce(l.docs_per_day,100), coalesce(l.pages_per_day,1000)
    into v_docs_limit,v_pages_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=p_firm;
  select count(*)::int, coalesce(sum(pages_reserved),0) into v_docs,v_pages
    from clara.document_ingest_reservations
    where firm_id=p_firm and state <> 'refunded'
      and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_docs + 1 > v_docs_limit then
    raise exception 'document daily limit reached (docs)' using errcode='CLR18';
  end if;
  if v_pages + p_pages > v_pages_limit then
    raise exception 'document daily limit reached (pages)' using errcode='CLR18';
  end if;
  insert into clara.document_ingest_reservations(firm_id,intake_id,pages_reserved,lease_expires_at)
    values(p_firm,p_intake,p_pages,p_lease_expires) returning id into v_id;
  return v_id;
end $$;

create function clara._resize_document_reservation(p_firm uuid, p_intake uuid, p_pages int) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_limit int; v_pages bigint;
begin
  if p_pages < 0 then raise exception 'trusted page count must be non-negative' using errcode='CLR18'; end if;
  perform pg_advisory_xact_lock(203005001, hashtext(p_firm::text));
  select * into r from clara.document_ingest_reservations
    where intake_id=p_intake and firm_id=p_firm for update;
  if not found or r.state not in ('reserved','resized') then
    raise exception 'reservation is not resizable' using errcode='CLR18';
  end if;
  select coalesce(l.pages_per_day,1000) into v_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=p_firm;
  select coalesce(sum(pages_reserved),0) into v_pages
    from clara.document_ingest_reservations
    where firm_id=p_firm and id<>r.id and state<>'refunded'
      and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_pages + p_pages > v_limit then raise exception 'document daily page limit reached' using errcode='CLR18'; end if;
  update clara.document_ingest_reservations set state='resized',pages_reserved=p_pages
    where id=r.id;
  return r.id;
end $$;

create function clara._refund_document_reservation(p_firm uuid, p_intake uuid, p_reason text) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record;
begin
  perform pg_advisory_xact_lock(203005001, hashtext(p_firm::text));
  select * into r from clara.document_ingest_reservations
    where intake_id=p_intake and firm_id=p_firm for update;
  if not found then return null; end if;
  if r.state='refunded' then return r.id; end if;
  if r.state='settled' then raise exception 'settled reservation cannot be refunded' using errcode='CLR18'; end if;
  update clara.document_ingest_reservations set state='refunded',refunded_at=now(),
    refund_reason=coalesce(nullif(btrim(p_reason),''),'unspecified') where id=r.id;
  return r.id;
end $$;

create function clara._settle_document_reservation(p_firm uuid, p_task uuid, p_pages int) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_limit int; v_other bigint;
begin
  perform pg_advisory_xact_lock(203005001, hashtext(p_firm::text));
  select * into r from clara.document_ingest_reservations
    where task_id=p_task and firm_id=p_firm for update;
  if not found then return null; end if; -- an adopted existing document has no new carrier
  if r.state='settled' then return r.id; end if;
  if r.state='refunded' then raise exception 'refunded reservation cannot settle' using errcode='CLR18'; end if;
  select coalesce(l.pages_per_day,1000) into v_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=p_firm;
  select coalesce(sum(case when state='settled' then settled_pages else pages_reserved end),0)
    into v_other from clara.document_ingest_reservations
    where firm_id=p_firm and id<>r.id and state<>'refunded'
      and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_other + p_pages > v_limit then raise exception 'actual pages exceed daily limit' using errcode='CLR18'; end if;
  update clara.document_ingest_reservations set state='settled',settled_pages=p_pages,
    pages_reserved=p_pages,settled_at=now() where id=r.id;
  return r.id;
end $$;

-- Runtime reservation surface. The names are deliberately public/stable even
-- though the lower-level helpers remain ungranted implementation details.
create function clara.reserve_document_ingest(p_firm uuid, p_intake uuid,
    p_pages_reserved int, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare i record; v_dedupe jsonb; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  select * into i from clara.document_intakes where id=p_intake and firm_id=p_firm;
  if not found then raise exception 'intake not in firm' using errcode='CLR11'; end if;
  v_dedupe:=clara._reserve_op(p_firm,'reserve_document_ingest',p_op_key,
    clara._hash(jsonb_build_object('intake',p_intake,'pages',p_pages_reserved)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_id:=clara._reserve_document_ingest(p_firm,p_intake,p_pages_reserved,i.expires_at);
  return clara._finish_op(p_firm,'reserve_document_ingest',p_op_key,
    jsonb_build_object('reservation_id',v_id,'intake_id',p_intake,'state','reserved'));
end $$;

create function clara.resize_ingest_reservation(p_reservation uuid, p_pages int,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_dedupe jsonb;
begin
  select * into r from clara.document_ingest_reservations where id=p_reservation;
  if not found then raise exception 'reservation not found' using errcode='CLR18'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(r.firm_id,'resize_ingest_reservation',p_op_key,
    clara._hash(jsonb_build_object('reservation',p_reservation,'pages',p_pages)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform clara._resize_document_reservation(r.firm_id,r.intake_id,p_pages);
  return clara._finish_op(r.firm_id,'resize_ingest_reservation',p_op_key,
    jsonb_build_object('reservation_id',p_reservation,'state','resized','pages_reserved',p_pages));
end $$;

create function clara.settle_ingest_reservation(p_reservation uuid, p_actual_pages int,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_dedupe jsonb; v_limit int; v_other bigint;
begin
  select * into r from clara.document_ingest_reservations where id=p_reservation;
  if not found then raise exception 'reservation not found' using errcode='CLR18'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(r.firm_id,'settle_ingest_reservation',p_op_key,
    clara._hash(jsonb_build_object('reservation',p_reservation,'pages',p_actual_pages)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(r.firm_id::text));
  select * into r from clara.document_ingest_reservations where id=p_reservation for update;
  if r.state='refunded' then raise exception 'refunded reservation cannot settle' using errcode='CLR18'; end if;
  if r.state<>'settled' then
    select coalesce(l.pages_per_day,1000) into v_limit from clara.firms f
      left join clara.firm_document_limits l on l.firm_id=f.id where f.id=r.firm_id;
    select coalesce(sum(case when state='settled' then settled_pages else pages_reserved end),0)
      into v_other from clara.document_ingest_reservations
      where firm_id=r.firm_id and id<>r.id and state<>'refunded'
        and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc');
    if v_other+p_actual_pages>v_limit then raise exception 'actual pages exceed daily limit' using errcode='CLR18'; end if;
    update clara.document_ingest_reservations set state='settled',settled_pages=p_actual_pages,
      pages_reserved=p_actual_pages,settled_at=now() where id=r.id;
  end if;
  return clara._finish_op(r.firm_id,'settle_ingest_reservation',p_op_key,
    jsonb_build_object('reservation_id',p_reservation,'state','settled','settled_pages',p_actual_pages));
end $$;

create function clara.refund_ingest_reservation(p_reservation uuid, p_op_key text,
    p_reason text default 'manual-refund') returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_dedupe jsonb;
begin
  select * into r from clara.document_ingest_reservations where id=p_reservation;
  if not found then raise exception 'reservation not found' using errcode='CLR18'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(r.firm_id,'refund_ingest_reservation',p_op_key,
    clara._hash(jsonb_build_object('reservation',p_reservation,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform clara._refund_document_reservation(r.firm_id,r.intake_id,p_reason);
  return clara._finish_op(r.firm_id,'refund_ingest_reservation',p_op_key,
    jsonb_build_object('reservation_id',p_reservation,'state','refunded'));
end $$;

-- A bearer capability never outlives the uploader's firm membership. This helper
-- commits the honest terminal state instead of raising (a raise would roll the
-- failure/refund back). Capability writers call it after their non-oracular
-- capability/state checks and before performing any transition.
create function clara._expire_inactive_document_intake(p_intake uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare i record; v_key text; v_dedupe jsonb; v_receipt jsonb;
begin
  select * into i from clara.document_intakes where id=p_intake for update;
  if not found then return null; end if;
  if exists (select 1 from clara.firm_memberships m
      where m.firm_id=i.firm_id and m.user_id=i.uploaded_by and m.status='active') then
    return null;
  end if;
  if i.status in ('finalized','adopted','failed') then
    return jsonb_build_object('intake_id',i.id,'status',i.status,'failure_code',i.failure_code);
  end if;
  v_key:='revoked-uploader:'||i.id::text;
  v_dedupe:=clara._reserve_op(i.firm_id,'fail_document_intake',v_key,
    clara._hash(jsonb_build_object('i',i.id,'failure','expired')));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.document_intakes set status='failed',failure_code='expired',
    upload_lease_owner=null,lease_expires_at=null where id=i.id;
  perform clara._refund_document_reservation(i.firm_id,i.id,'expired');
  perform clara._audit(i.firm_id,i.uploaded_by,null,null,'fail_document_intake',null,
    jsonb_build_object('intake',i.id,'failure_code','expired','reason','uploader-membership-inactive','op_key',v_key));
  v_receipt:=jsonb_build_object('intake_id',i.id,'status','failed','failure_code','expired');
  return clara._finish_op(i.firm_id,'fail_document_intake',v_key,v_receipt);
end $$;

create function clara.create_document_intake(p_uploaded_by uuid, p_origin text,
    p_chat_session uuid, p_filename text, p_mime text, p_declared_bytes bigint,
    p_token_hash text, p_expires_at timestamptz, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_dedupe jsonb; v_id uuid; v_res uuid; v_pages int;
begin
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_origin='chat' then
    select s.firm_id into v_firm from clara.chat_sessions s
      join clara.firm_memberships m on m.firm_id=s.firm_id and m.user_id=p_uploaded_by
        and m.status='active' and clara.role_rank(m.role)>=clara.role_rank('bookkeeper')
      where s.id=p_chat_session and (s.created_by=p_uploaded_by or s.visibility='firm');
  else
    select m.firm_id into v_firm from clara.firm_memberships m
      where m.user_id=p_uploaded_by and m.status='active'
        and clara.role_rank(m.role)>=clara.role_rank('bookkeeper');
  end if;
  if v_firm is null then raise exception 'uploader not authorized for intake' using errcode='CLR11'; end if;
  v_dedupe := clara._reserve_op(v_firm,'create_document_intake',p_op_key,
    clara._hash(jsonb_build_object('u',p_uploaded_by,'o',p_origin,'s',p_chat_session,
      'f',p_filename,'m',p_mime,'b',p_declared_bytes,'t',p_token_hash,'x',p_expires_at)));
  if v_dedupe is not null then return v_dedupe; end if;
  insert into clara.document_intakes(firm_id,uploaded_by,origin,chat_session_id,
      original_filename,declared_mime,declared_bytes,op_key,token_hash,expires_at)
    values(v_firm,p_uploaded_by,p_origin,p_chat_session,p_filename,p_mime,
      p_declared_bytes,p_op_key,p_token_hash,p_expires_at) returning id into v_id;
  v_pages := clara._declared_page_ceiling(p_declared_bytes,p_mime);
  v_res := clara._reserve_document_ingest(v_firm,v_id,v_pages,p_expires_at);
  perform clara._audit(v_firm,p_uploaded_by,null,null,'create_document_intake',null,
    jsonb_build_object('intake',v_id,'reservation',v_res,'origin',p_origin,'op_key',p_op_key));
  return clara._finish_op(v_firm,'create_document_intake',p_op_key,
    jsonb_build_object('intake_id',v_id,'reservation_id',v_res,'status','uploading','expires_at',p_expires_at));
end $$;

create function clara.claim_document_intake_upload(p_intake uuid, p_token_hash text,
    p_lease_owner text, p_lease_seconds int, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare i record; v_dedupe jsonb; v_expired jsonb;
begin
  select * into i from clara.document_intakes where id=p_intake for update;
  if not found or i.status<>'uploading' or i.expires_at<=now() or i.token_hash<>p_token_hash then
    raise exception 'intake upload capability is invalid' using errcode='CLR16';
  end if;
  if p_op_key is null or btrim(p_op_key)='' or p_lease_owner is null or btrim(p_lease_owner)=''
     or p_lease_seconds not between 1 and 900 then raise exception 'invalid upload lease request' using errcode='CLR10'; end if;
  v_expired:=clara._expire_inactive_document_intake(p_intake);
  if v_expired is not null then return v_expired; end if;
  v_dedupe:=clara._reserve_op(i.firm_id,'claim_document_intake_upload',p_op_key,
    clara._hash(jsonb_build_object('i',p_intake,'o',p_lease_owner,'s',p_lease_seconds)));
  if v_dedupe is not null then return v_dedupe; end if;
  if i.lease_expires_at is not null and i.lease_expires_at>now() and i.upload_lease_owner<>p_lease_owner then
    raise exception 'intake upload lease is held' using errcode='CLR16';
  end if;
  update clara.document_intakes set upload_lease_owner=p_lease_owner,
    lease_expires_at=now()+make_interval(secs=>p_lease_seconds) where id=p_intake;
  return clara._finish_op(i.firm_id,'claim_document_intake_upload',p_op_key,
    jsonb_build_object('intake_id',p_intake,'lease_owner',p_lease_owner));
end $$;

create function clara.mark_document_intake_received(p_intake uuid, p_token_hash text,
    p_lease_owner text, p_sha256 text, p_storage_key text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare i record; v_dedupe jsonb; v_expired jsonb;
begin
  select * into i from clara.document_intakes where id=p_intake for update;
  if not found or i.status<>'uploading' or i.expires_at<=now() or i.token_hash<>p_token_hash
     or i.upload_lease_owner<>p_lease_owner or i.lease_expires_at<=now() then
    raise exception 'intake receipt capability/lease is invalid' using errcode='CLR16';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_expired:=clara._expire_inactive_document_intake(p_intake);
  if v_expired is not null then return v_expired; end if;
  v_dedupe:=clara._reserve_op(i.firm_id,'mark_document_intake_received',p_op_key,
    clara._hash(jsonb_build_object('i',p_intake,'sha',p_sha256,'key',p_storage_key)));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.document_intakes set status='received',sha256=p_sha256,storage_key=p_storage_key,
    upload_lease_owner=null,lease_expires_at=null where id=p_intake;
  return clara._finish_op(i.firm_id,'mark_document_intake_received',p_op_key,
    jsonb_build_object('intake_id',p_intake,'status','received'));
end $$;

create function clara.begin_document_intake_verification(p_intake uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare i record; v_dedupe jsonb; v_expired jsonb;
begin
  select * into i from clara.document_intakes where id=p_intake for update;
  if not found or i.status<>'received' then raise exception 'intake is not received' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_expired:=clara._expire_inactive_document_intake(p_intake);
  if v_expired is not null then return v_expired; end if;
  v_dedupe:=clara._reserve_op(i.firm_id,'begin_document_intake_verification',p_op_key,clara._hash(jsonb_build_object('i',p_intake)));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.document_intakes set status='verifying' where id=p_intake;
  return clara._finish_op(i.firm_id,'begin_document_intake_verification',p_op_key,
    jsonb_build_object('intake_id',p_intake,'status','verifying'));
end $$;

create function clara.verify_document_intake(p_intake uuid, p_token_hash text,
    p_trusted_pages int, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare i record; v_dedupe jsonb; v_status text; v_doc uuid; v_expired jsonb;
begin
  select * into i from clara.document_intakes where id=p_intake for update;
  if not found or i.status<>'verifying' or i.expires_at<=now() or i.token_hash<>p_token_hash then
    raise exception 'intake verification capability/state is invalid' using errcode='CLR16';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_expired:=clara._expire_inactive_document_intake(p_intake);
  if v_expired is not null then return v_expired; end if;
  v_dedupe:=clara._reserve_op(i.firm_id,'verify_document_intake',p_op_key,
    clara._hash(jsonb_build_object('i',p_intake,'pages',p_trusted_pages)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform clara._resize_document_reservation(i.firm_id,p_intake,p_trusted_pages);
  select id into v_doc from clara.documents where firm_id=i.firm_id and sha256=i.sha256;
  v_status:=case when v_doc is null then 'verified' else 'duplicate' end;
  update clara.document_intakes set status=v_status where id=p_intake;
  return clara._finish_op(i.firm_id,'verify_document_intake',p_op_key,
    jsonb_build_object('intake_id',p_intake,'status',v_status,'existing_document_id',v_doc));
end $$;

create function clara.fail_document_intake(p_intake uuid, p_failure_code text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare i record; v_dedupe jsonb; v_expired jsonb;
begin
  select * into i from clara.document_intakes where id=p_intake for update;
  if not found or i.status in ('finalized','adopted','failed') then raise exception 'intake is terminal or unknown' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_expired:=clara._expire_inactive_document_intake(p_intake);
  if v_expired is not null then return v_expired; end if;
  v_dedupe:=clara._reserve_op(i.firm_id,'fail_document_intake',p_op_key,
    clara._hash(jsonb_build_object('i',p_intake,'failure',p_failure_code)));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.document_intakes set status='failed',failure_code=p_failure_code,
    upload_lease_owner=null,lease_expires_at=null where id=p_intake;
  perform clara._refund_document_reservation(i.firm_id,p_intake,p_failure_code);
  perform clara._audit(i.firm_id,i.uploaded_by,null,null,'fail_document_intake',null,
    jsonb_build_object('intake',p_intake,'failure_code',p_failure_code,'op_key',p_op_key));
  return clara._finish_op(i.firm_id,'fail_document_intake',p_op_key,
    jsonb_build_object('intake_id',p_intake,'status','failed','failure_code',p_failure_code));
end $$;

create function clara._upgrade_legacy_document(p_document uuid, p_storage_key text,
    p_verified_at timestamptz) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform set_config('clara.document_upgrade',p_document::text,true);
  update clara.documents set bytes_verified_at=p_verified_at,storage_path=p_storage_key
    where id=p_document and bytes_verified_at is null;
  if not found then raise exception 'document is not a claim-only upgrade target' using errcode='CLR15'; end if;
  perform set_config('clara.document_upgrade','',true);
end $$;

create function clara.finalize_document_intake(p_intake uuid, p_token_hash text default null,
    p_engine_id text default 'fixture-engine', p_engine_config jsonb default '{}'::jsonb,
    p_version_n int default 1, p_lane text default 'ocr',
    p_client uuid default null, p_resolution uuid default null, p_op_key text default null)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  i record; d record; v_dedupe jsonb; v_doc uuid; v_task uuid; v_filing uuid;
  v_created boolean:=false; v_upgraded boolean:=false; v_filed boolean:=false; v_basis text;
  v_expired jsonb;
begin
  select * into i from clara.document_intakes where id=p_intake for update;
  if not found then
    raise exception 'intake finalize capability/state is invalid' using errcode='CLR16';
  end if;
  if i.expires_at<=now() or (p_token_hash is not null and i.token_hash<>p_token_hash) then
    raise exception 'intake finalize capability/state is invalid' using errcode='CLR16';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  -- Reserve/replay BEFORE terminal-state validation. The fixed intake op_key makes
  -- a response-loss retry return the original committed receipt.
  v_dedupe:=clara._reserve_op(i.firm_id,'finalize_document_intake',p_op_key,
    clara._hash(jsonb_build_object('i',p_intake)));
  if v_dedupe is not null then return v_dedupe; end if;
  if i.status not in ('verified','duplicate') then
    raise exception 'intake finalize capability/state is invalid' using errcode='CLR16';
  end if;
  v_expired:=clara._expire_inactive_document_intake(p_intake);
  if v_expired is not null then
    return clara._finish_op(i.firm_id,'finalize_document_intake',p_op_key,v_expired);
  end if;

  select * into d from clara.documents where firm_id=i.firm_id and sha256=i.sha256 for update;
  if i.status='verified' and not found then
    insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,
        storage_path,bytes_verified_at,extraction_status,uploaded_by)
      values(i.firm_id,i.sha256,i.original_filename,i.declared_mime,i.declared_bytes,
        i.storage_key,now(),'pending',i.uploaded_by) returning id into v_doc;
    v_created:=true;
  else
    if not found then raise exception 'duplicate intake has no canonical document' using errcode='CLR16'; end if;
    v_doc:=d.id;
    if d.bytes_verified_at is null then
      perform clara._upgrade_legacy_document(v_doc,i.storage_key,now());
      v_upgraded:=true;
    end if;
  end if;

  if v_created or v_upgraded then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status)
      values(i.firm_id,v_doc,p_engine_id,coalesce(p_engine_config,'{}'::jsonb),p_version_n,p_lane,'queued')
      on conflict (document_id,engine_id,version_n) do nothing returning id into v_task;
    if v_task is null then
      select id into v_task from clara.document_processing_tasks
        where document_id=v_doc and engine_id=p_engine_id and version_n=p_version_n;
    end if;
    update clara.document_ingest_reservations set task_id=v_task where intake_id=p_intake;
  else
    -- Duplicate adoption transfers to the already-charged canonical ingest; the
    -- temporary duplicate reservation is refunded at adoption.
    perform clara._refund_document_reservation(i.firm_id,p_intake,'duplicate-adopted');
    select id into v_task from clara.document_processing_tasks
      where document_id=v_doc order by version_n desc limit 1;
  end if;

  if p_client is not null then
    perform clara.assert_client_resolved(p_client,p_resolution,v_doc);
    select id into v_filing from clara.document_filings
      where document_id=v_doc and client_id=p_client and retired_at is null for share;
    if v_filing is null then
      select method into v_basis from clara.client_resolutions where id=p_resolution;
      insert into clara.document_filings(firm_id,document_id,client_id,filed_by,resolution_id,basis)
        values(i.firm_id,v_doc,p_client,i.uploaded_by,p_resolution,
          case when v_basis='rule' then 'rule' else 'human' end) returning id into v_filing;
      v_filed:=true;
      perform clara._recompute_document_retention(v_doc);
    end if;
  elsif p_resolution is not null then
    raise exception 'resolution requires an explicit client' using errcode='CLR10';
  end if;

  if not v_created and i.status='verified' then
    perform set_config('clara.intake_adopt_race',p_intake::text,true);
  end if;
  update clara.document_intakes set status=case when v_created then 'finalized' else 'adopted' end,
    document_id=v_doc where id=p_intake;
  if not v_created and i.status='verified' then
    perform set_config('clara.intake_adopt_race','',true);
  end if;
  perform clara._audit(i.firm_id,i.uploaded_by,null,null,'finalize_document_intake',null,
    jsonb_build_object('intake',p_intake,'document',v_doc,'task',v_task,'filing',v_filing,
      'created',v_created,'upgraded',v_upgraded,'op_key',p_op_key));
  if v_created then
    perform clara._append_event(i.firm_id,'document.ingested',null,i.uploaded_by,null,null,
      null,v_doc,null,'{}'::jsonb);
  end if;
  if v_filed then
    perform clara._append_event(i.firm_id,'document.filed',p_client,i.uploaded_by,null,null,
      null,v_doc,p_resolution,jsonb_build_object('filing_id',v_filing));
  end if;
  return clara._finish_op(i.firm_id,'finalize_document_intake',p_op_key,
    jsonb_build_object('intake_id',p_intake,'document_id',v_doc,'task_id',v_task,
      'filing_id',v_filing,'status',case when v_created then 'finalized' else 'adopted' end,
      'upgraded',v_upgraded));
end $$;

-- Explicit public name for acceptance probes; the guarded transition remains in
-- _upgrade_legacy_document and only duplicate claim-only intakes reach it.
create function clara.upgrade_legacy_document(p_intake uuid, p_token_hash text,
    p_engine_id text, p_engine_config jsonb, p_version_n int, p_lane text,
    p_client uuid default null, p_resolution uuid default null, p_op_key text default null)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if not exists (
    select 1 from clara.document_intakes i join clara.documents d
      on d.firm_id=i.firm_id and d.sha256=i.sha256
    where i.id=p_intake and i.status='duplicate' and d.bytes_verified_at is null) then
    raise exception 'intake is not a legacy claim-only upgrade' using errcode='CLR15';
  end if;
  return clara.finalize_document_intake(p_intake,p_token_hash,p_engine_id,p_engine_config,
    p_version_n,p_lane,p_client,p_resolution,p_op_key);
end $$;

create function clara.claim_document_processing_task(p_task uuid, p_workflow_run_id text,
    p_egress_approved boolean) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_cap int; v_running int;
begin
  if p_workflow_run_id is null or btrim(p_workflow_run_id)='' then raise exception 'workflow_run_id is required' using errcode='CLR10'; end if;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task not found' using errcode='CLR16'; end if;
  if t.status='running' and t.workflow_run_id=p_workflow_run_id then
    return jsonb_build_object('task_id',p_task,'status','running','replayed',true);
  end if;
  if t.status<>'queued' then raise exception 'processing task is not queued' using errcode='CLR16'; end if;
  if t.lane='ocr' and not coalesce(p_egress_approved,false) then
    update clara.document_processing_tasks set status='held_egress' where id=p_task;
    update clara.documents set extraction_status='held_egress' where id=t.document_id;
    return jsonb_build_object('task_id',p_task,'status','held_egress','workflow_run_id',null);
  end if;
  perform pg_advisory_xact_lock(203005001,hashtext(t.firm_id::text));
  select coalesce(l.ocr_concurrency,2) into v_cap from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select count(*)::int into v_running from clara.document_processing_tasks
    where firm_id=t.firm_id and lane='ocr' and status='running';
  if t.lane='ocr' and v_running>=v_cap then raise exception 'OCR concurrency limit reached' using errcode='CLR18'; end if;
  update clara.document_processing_tasks set status='running',workflow_run_id=p_workflow_run_id,
    started_at=now(),attempt_count=attempt_count+1 where id=p_task;
  update clara.documents set extraction_status='running' where id=t.document_id;
  return jsonb_build_object('task_id',p_task,'status','running','workflow_run_id',p_workflow_run_id);
end $$;

create function clara.release_held_document_tasks(p_limit int default 1000) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n int;
begin
  with picked as (
    select id,document_id from clara.document_processing_tasks where status='held_egress'
    order by created_at for update skip locked limit greatest(1,least(p_limit,10000))
  ), moved as (
    update clara.document_processing_tasks t set status='queued'
    from picked p where t.id=p.id returning t.document_id
  )
  update clara.documents d set extraction_status='pending'
    where d.id in (select document_id from moved);
  get diagnostics v_n = row_count;
  return jsonb_build_object('released',v_n);
end $$;

create function clara.requeue_stranded_document_task(p_task uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_dedupe jsonb;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'task is not stranded-running' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(t.firm_id,'requeue_stranded_document_task',p_op_key,clara._hash(jsonb_build_object('task',p_task)));
  if v_dedupe is not null then return v_dedupe; end if;
  if t.status<>'running' then raise exception 'task is not stranded-running' using errcode='CLR16'; end if;
  update clara.document_processing_tasks set status='queued',workflow_run_id=null,
    started_at=null,vendor_op_ref=null where id=p_task;
  update clara.documents set extraction_status='pending' where id=t.document_id;
  return clara._finish_op(t.firm_id,'requeue_stranded_document_task',p_op_key,
    jsonb_build_object('task_id',p_task,'status','queued'));
end $$;

create function clara.persist_document_extraction(p_task uuid, p_status text, p_page_count int,
    p_envelope jsonb, p_regions jsonb, p_error_code text, p_vendor_op_ref text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_dedupe jsonb; v_ext uuid; v_event text; elem jsonb;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(t.firm_id,'persist_document_extraction',p_op_key,
    clara._hash(jsonb_build_object('task',p_task,'status',p_status,'pages',p_page_count,
      'envelope',p_envelope,'regions',p_regions,'error',p_error_code,'vendor',p_vendor_op_ref)));
  if v_dedupe is not null then return v_dedupe; end if;
  if t.status<>'running' then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_status not in ('done','failed') then raise exception 'extraction status must be done/failed' using errcode='CLR10'; end if;
  if t.lane='none' then raise exception 'store-only tasks do not create extractions' using errcode='CLR16'; end if;
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,
      case when t.lane='ocr' then 'ocr' else 'structured_parse' end,
      t.version_n,p_status,p_page_count,coalesce(p_envelope,'{}'::jsonb))
    on conflict(document_id,engine_id,version_n) do nothing returning id into v_ext;
  if v_ext is null then
    select id into v_ext from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n;
  elsif p_status='done' then
    for elem in select value from jsonb_array_elements(coalesce(p_regions,'[]'::jsonb)) loop
      insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
          text_content,engine_confidence,monetary_raw,monetary_cents)
        values(t.firm_id,v_ext,elem->>'locator_kind',coalesce(elem->'locator','{}'::jsonb),
          elem->>'field_path',elem->>'text_content',(elem->>'engine_confidence')::numeric,
          elem->>'monetary_raw',(elem->>'monetary_cents')::bigint);
    end loop;
  end if;
  update clara.document_processing_tasks set status=p_status,error_code=case when p_status='failed' then p_error_code end,
    vendor_op_ref=p_vendor_op_ref,finished_at=now() where id=p_task;
  update clara.documents set extraction_status=p_status,page_count=p_page_count where id=t.document_id;
  if p_status='done' then perform clara._settle_document_reservation(t.firm_id,p_task,coalesce(p_page_count,0));
  else perform clara._refund_document_reservation(t.firm_id,
    (select intake_id from clara.document_ingest_reservations where task_id=p_task),coalesce(p_error_code,'engine_error')); end if;
  perform clara._audit(t.firm_id,null,null,null,'persist_document_extraction',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,'status',p_status,'op_key',p_op_key));
  v_event:=case when p_status='done' then 'document.extraction_completed' else 'document.extraction_failed' end;
  perform clara._append_event(t.firm_id,v_event,null,null,null,null,null,t.document_id,null,
    jsonb_build_object('extraction_id',v_ext,'engine_id',t.engine_id,'version_n',t.version_n));
  return clara._finish_op(t.firm_id,'persist_document_extraction',p_op_key,
    jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status',p_status));
end $$;

create function clara.complete_stored_document_task(p_task uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_dedupe jsonb;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'task is not running store-only' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(t.firm_id,'complete_stored_document_task',p_op_key,clara._hash(jsonb_build_object('task',p_task)));
  if v_dedupe is not null then return v_dedupe; end if;
  if t.status<>'running' or t.lane<>'none' then raise exception 'task is not running store-only' using errcode='CLR16'; end if;
  update clara.document_processing_tasks set status='done',finished_at=now() where id=p_task;
  update clara.documents set extraction_status='stored_unparsed' where id=t.document_id;
  perform clara._settle_document_reservation(t.firm_id,p_task,0);
  perform clara._audit(t.firm_id,null,null,null,'complete_stored_document_task',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'op_key',p_op_key));
  return clara._finish_op(t.firm_id,'complete_stored_document_task',p_op_key,
    jsonb_build_object('task_id',p_task,'status','done'));
end $$;

-- Masked human status surfaces. chat_session_id, token_hash, storage_key, engine
-- config/vendor refs, and workflow run ids are never exposed.
create view clara.document_intakes_visible as
  select id,uploaded_by,origin,original_filename,declared_mime,declared_bytes,status,
    document_id,failure_code,expires_at,created_at,updated_at
  from clara.document_intakes where firm_id=clara.jwt_firm();

create view clara.document_processing_tasks_visible as
  select id,document_id,lane,status,version_n,attempt_count,error_code,
    created_at,started_at,finished_at,updated_at
  from clara.document_processing_tasks where firm_id=clara.jwt_firm();

-- =====================================================================
-- 8. DETERMINISTIC ATTRIBUTION WRITERS
-- =====================================================================

create unique index uq_resolution_document_rule_live
  on clara.client_resolutions(firm_id,subject_id,client_id)
  where subject_kind='document' and method='rule' and superseded_at is null;

create function clara.record_attribution_attempt(p_document uuid, p_matcher_version text,
    p_input_fingerprint text, p_candidates jsonb, p_conflict_reason text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_dedupe jsonb; v_attempt uuid; elem jsonb; v_candidate uuid; v_region text;
begin
  select firm_id into v_firm from clara.documents where id=p_document;
  if v_firm is null then raise exception 'document not found' using errcode='CLR11'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(v_firm,'record_attribution_attempt',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'matcher',p_matcher_version,
      'fingerprint',p_input_fingerprint,'candidates',p_candidates,'conflict',p_conflict_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  insert into clara.attribution_attempts(firm_id,document_id,matcher_version,input_fingerprint,
      outcome,conflict_reason)
    values(v_firm,p_document,p_matcher_version,p_input_fingerprint,
      case when p_conflict_reason is not null then 'abstained'
           when jsonb_array_length(coalesce(p_candidates,'[]'::jsonb))>0 then 'candidate'
           else 'abstained' end,
      p_conflict_reason)
    on conflict(document_id,matcher_version,input_fingerprint) do nothing returning id into v_attempt;
  if v_attempt is null then
    select id into v_attempt from clara.attribution_attempts
      where document_id=p_document and matcher_version=p_matcher_version
        and input_fingerprint=p_input_fingerprint;
  else
    for elem in select value from jsonb_array_elements(coalesce(p_candidates,'[]'::jsonb)) loop
      if not exists (select 1 from clara.clients where id=(elem->>'client_id')::uuid and firm_id=v_firm) then
        raise exception 'matcher candidate crosses firm boundary' using errcode='CLR11';
      end if;
      insert into clara.attribution_candidates(firm_id,attempt_id,client_id,rank,rule_kind)
        values(v_firm,v_attempt,(elem->>'client_id')::uuid,(elem->>'rank')::int,elem->>'rule_kind')
        returning id into v_candidate;
      for v_region in select jsonb_array_elements_text(coalesce(elem->'region_ids','[]'::jsonb)) loop
        insert into clara.attribution_candidate_regions(firm_id,candidate_id,region_id)
          values(v_firm,v_candidate,v_region::uuid);
      end loop;
    end loop;
  end if;
  perform clara._audit(v_firm,null,null,null,'record_attribution_attempt',null,
    jsonb_build_object('document',p_document,'attempt',v_attempt,'matcher',p_matcher_version,'op_key',p_op_key));
  return clara._finish_op(v_firm,'record_attribution_attempt',p_op_key,
    jsonb_build_object('attempt_id',v_attempt));
end $$;

create function clara.record_rule_resolution(p_document uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_dedupe jsonb; v_client uuid; v_n int; v_res uuid; v_fp text;
begin
  select firm_id into v_firm from clara.documents where id=p_document;
  if v_firm is null then raise exception 'document not found' using errcode='CLR11'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(v_firm,'record_rule_resolution',p_op_key,clara._hash(jsonb_build_object('document',p_document)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Runtime RLS is using(true), therefore EVERY matcher relation is explicitly firm
  -- scoped here. A duplicated hard identifier yields v_n>1 and structural abstention.
  with hits as (
    select distinct ci.client_id
    from clara.document_extractions e
    join clara.document_regions r on r.extraction_id=e.id and r.firm_id=v_firm
    join clara.client_identifiers ci on ci.firm_id=v_firm
      and ci.value_normalized=lower(regexp_replace(coalesce(r.text_content,''),'\s+','','g'))
    where e.document_id=p_document and e.firm_id=v_firm and e.status='done'
      and ((ci.kind='tin' and lower(coalesce(r.field_path,'')) like '%tin%')
        or (ci.kind='ssm' and lower(coalesce(r.field_path,'')) like '%ssm%')
        or (ci.kind='bank_account' and lower(coalesce(r.field_path,'')) like '%account%'))
  ) select (array_agg(client_id order by client_id))[1],count(*)::int
      into v_client,v_n from hits;

  if v_n<>1 then
    v_fp:=encode(sha256(convert_to(p_document::text||':'||coalesce(v_n,0)::text,'UTF8')),'hex');
    insert into clara.attribution_attempts(firm_id,document_id,matcher_version,input_fingerprint,
        outcome,conflict_reason)
      values(v_firm,p_document,'rule-v1',v_fp,'abstained',
        case when v_n=0 then 'no-unique-hard-identifier' else 'conflicting-hard-identifier' end)
      on conflict(document_id,matcher_version,input_fingerprint) do nothing;
    perform clara._audit(v_firm,null,null,null,'record_rule_resolution',null,
      jsonb_build_object('document',p_document,'outcome','abstained','match_count',v_n,'op_key',p_op_key));
    return clara._finish_op(v_firm,'record_rule_resolution',p_op_key,
      jsonb_build_object('resolution_id',null,'outcome','abstained','match_count',v_n));
  end if;
  insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,
      method,evidence,resolved_by)
    values(v_firm,v_client,'document',p_document,1.0,'rule','{"matcher":"rule-v1"}',null)
    on conflict(firm_id,subject_id,client_id)
      where subject_kind='document' and method='rule' and superseded_at is null
    do nothing returning id into v_res;
  if v_res is null then
    select id into v_res from clara.client_resolutions where firm_id=v_firm
      and subject_kind='document' and subject_id=p_document and client_id=v_client
      and method='rule' and superseded_at is null;
  end if;
  perform clara._audit(v_firm,null,null,null,'record_rule_resolution',null,
    jsonb_build_object('document',p_document,'client',v_client,'resolution',v_res,'op_key',p_op_key));
  -- A rule resolution is attribution evidence, not a filing. Until a human or
  -- explicit rule filing exists, do not stamp document_id onto the client event.
  perform clara._append_event(v_firm,'client.resolved',v_client,null,null,null,
    null,null,v_res,'{}'::jsonb);
  return clara._finish_op(v_firm,'record_rule_resolution',p_op_key,
    jsonb_build_object('resolution_id',v_res,'client_id',v_client,'outcome','rule_resolved'));
end $$;

create function clara.confirm_attribution_candidate(p_candidate uuid, p_op_key text,
    p_file_document boolean default false) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_res uuid; v_filing uuid; v_filed boolean:=false;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'confirm_attribution_candidate',p_op_key,
    clara._hash(jsonb_build_object('candidate',p_candidate,'file',p_file_document)));
  if v_dedupe is not null then return v_dedupe; end if;
  select ac.*,aa.document_id into x from clara.attribution_candidates ac
    join clara.attribution_attempts aa on aa.id=ac.attempt_id
    where ac.id=p_candidate for update;
  if not found or x.firm_id<>c.firm then raise exception 'candidate not in your firm' using errcode='CLR11'; end if;
  if x.disposition<>'open' then raise exception 'candidate is already disposed' using errcode='CLR20'; end if;
  insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,
      method,evidence,resolved_by)
    values(c.firm,x.client_id,'document',x.document_id,1.0,'human',
      jsonb_build_object('candidate_id',p_candidate),c.actor) returning id into v_res;
  update clara.attribution_candidates set disposition='confirmed',disposed_by=c.actor,
    disposed_at=now() where id=p_candidate;
  if p_file_document then
    select id into v_filing from clara.document_filings
      where document_id=x.document_id and client_id=x.client_id and retired_at is null;
    if v_filing is null then
      insert into clara.document_filings(firm_id,document_id,client_id,filed_by,resolution_id,basis)
        values(c.firm,x.document_id,x.client_id,c.actor,v_res,'human') returning id into v_filing;
      perform clara._recompute_document_retention(x.document_id);
      v_filed:=true;
    end if;
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'confirm_attribution_candidate',null,
    jsonb_build_object('candidate',p_candidate,'document',x.document_id,'client',x.client_id,
      'resolution',v_res,'filing',v_filing,'op_key',p_op_key));
  perform clara._append_event(c.firm,'client.resolved',x.client_id,c.actor,null,null,
    null,case when v_filed then x.document_id else null end,v_res,'{}'::jsonb);
  if v_filed then
    perform clara._append_event(c.firm,'document.filed',x.client_id,c.actor,null,null,
      null,x.document_id,v_res,jsonb_build_object('filing_id',v_filing));
  end if;
  return clara._finish_op(c.firm,'confirm_attribution_candidate',p_op_key,
    jsonb_build_object('candidate_id',p_candidate,'resolution_id',v_res,'filing_id',v_filing));
end $$;

create function clara.dismiss_attribution_candidate(p_candidate uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'dismiss_attribution_candidate',p_op_key,
    clara._hash(jsonb_build_object('candidate',p_candidate)));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.attribution_candidates set disposition='dismissed',disposed_by=c.actor,disposed_at=now()
    where id=p_candidate and firm_id=c.firm and disposition='open';
  if not found then raise exception 'open candidate not in your firm' using errcode='CLR20'; end if;
  perform clara._audit(c.firm,c.actor,null,null,'dismiss_attribution_candidate',null,
    jsonb_build_object('candidate',p_candidate,'op_key',p_op_key));
  return clara._finish_op(c.firm,'dismiss_attribution_candidate',p_op_key,
    jsonb_build_object('candidate_id',p_candidate,'disposition','dismissed'));
end $$;

-- =====================================================================
-- 9. WRONG-CLIENT CORRECTION CASE
-- =====================================================================

-- Honest-state extension point: no periods/close-gate model exists in 0001-0006.
create function clara._correction_period_state(p_entry uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  select 'no_period_model'::text where exists(select 1 from clara.journal_entries where id=p_entry);
$$;

create function clara._entry_state_hash(p_entry uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'entry',jsonb_build_object('id',je.id,'status',je.status,'revision',je.revision_token,
      'reversed_by',je.reversed_by,'filing_id',je.filing_id),
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('line_no',jl.line_no,
      'account_code',jl.account_code,'debit_cents',jl.debit_cents,
      'credit_cents',jl.credit_cents,'description',jl.description) order by jl.line_no),'[]'::jsonb)
      from clara.journal_lines jl where jl.entry_id=je.id))::text,'UTF8')),'hex')
  from clara.journal_entries je where je.id=p_entry;
$$;

create function clara.preview_wrong_client_correction(p_document uuid, p_from_client uuid,
    p_to_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_filing uuid;
begin
  v_firm:=coalesce(clara.jwt_firm(),clara.wake_firm());
  if v_firm is null then raise exception 'no correction read context' using errcode='CLR04'; end if;
  select id into v_filing from clara.document_filings
    where firm_id=v_firm and document_id=p_document and client_id=p_from_client and retired_at is null;
  if v_filing is null or not exists(select 1 from clara.clients where id=p_to_client and firm_id=v_firm and status='active') then
    raise exception 'correction document/clients are not eligible' using errcode='CLR17';
  end if;
  return jsonb_build_object(
    'document_id',p_document,'from_client',p_from_client,'to_client',p_to_client,
    'filing_id',v_filing,
    'books_version',(select coalesce(max(seq),0) from clara.domain_events where firm_id=v_firm),
    'items',(select coalesce(jsonb_agg(jsonb_build_object('entry_id',je.id,
      'entry_state_hash',clara._entry_state_hash(je.id),
      'action',case when je.status='draft' then 'withdraw_draft'
                    when je.reversed_by is not null then 'already_reversed' else 'reverse' end,
      'posting_date',je.posting_date,'status',je.status,
      'period_state',clara._correction_period_state(je.id)) order by je.id),'[]'::jsonb)
      from clara.journal_entries je where je.filing_id=v_filing and je.status in ('draft','approved')),
    'period_model','no_period_model','closed_period_blockers','[]'::jsonb,
    'subledger_model','not_built');
end $$;

-- Hash the exact state a pending reversal draft must have to be safely adopted.
-- The envelope intentionally matches _entry_state_hash; only the expected lines
-- are derived from the original with debit/credit swapped.
create function clara._expected_reversal_state_hash(p_draft uuid, p_original uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'entry',jsonb_build_object('id',d.id,'status',d.status,'revision',d.revision_token,
      'reversed_by',d.reversed_by,'filing_id',d.filing_id),
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('line_no',jl.line_no,
      'account_code',jl.account_code,'debit_cents',jl.credit_cents,
      'credit_cents',jl.debit_cents,'description',jl.description) order by jl.line_no),'[]'::jsonb)
      from clara.journal_lines jl where jl.entry_id=o.id))::text,'UTF8')),'hex')
  from clara.journal_entries d join clara.journal_entries o on o.id=p_original
  where d.id=p_draft and d.status='draft' and d.reversal_of=o.id;
$$;

create function clara.propose_wrong_client_correction(p_document uuid, p_from_client uuid,
    p_to_client uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_preview jsonb; v_items jsonb; v_books bigint;
  v_hash text; v_id uuid; elem jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' or p_reason is null or btrim(p_reason)='' then
    raise exception 'op_key and correction reason are required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'propose_wrong_client_correction',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'from',p_from_client,'to',p_to_client,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_preview:=clara.preview_wrong_client_correction(p_document,p_from_client,p_to_client);
  if not exists (select 1 from clara.client_resolutions r
      where r.firm_id=c.firm and r.client_id=p_to_client and r.subject_kind='document'
        and r.subject_id=p_document and r.method in ('human','rule') and r.confidence>=0.95
        and r.superseded_at is null) then
    raise exception 'destination client attribution is not authoritative' using errcode='CLR01';
  end if;
  v_items:=v_preview->'items'; v_books:=(v_preview->>'books_version')::bigint;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('document',p_document,'from',p_from_client,
    'to',p_to_client,'books_version',v_books,'items',v_items)::text,'UTF8')),'hex');
  insert into clara.filing_corrections(firm_id,document_id,from_client,to_client,reason,
      maker,status,plan_hash,books_version)
    values(c.firm,p_document,p_from_client,p_to_client,p_reason,c.actor,'proposed',v_hash,v_books)
    returning id into v_id;
  for elem in select value from jsonb_array_elements(v_items) loop
    insert into clara.filing_correction_items(firm_id,correction_id,entry_id,entry_state_hash,action)
      values(c.firm,v_id,(elem->>'entry_id')::uuid,elem->>'entry_state_hash',elem->>'action');
  end loop;
  perform clara._audit(c.firm,c.actor,null,null,'propose_wrong_client_correction',null,
    jsonb_build_object('correction',v_id,'document',p_document,'from',p_from_client,'to',p_to_client,
      'plan_hash',v_hash,'op_key',p_op_key));
  return clara._finish_op(c.firm,'propose_wrong_client_correction',p_op_key,
    jsonb_build_object('correction_id',v_id,'plan_hash',v_hash,'books_version',v_books,'status','proposed'));
end $$;

create function clara.approve_wrong_client_correction(p_correction uuid, p_plan_hash text,
    p_attestation text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; x record; it record; o record; pending record; v_current bigint;
  v_mirror uuid; v_to_filing uuid; v_from_filing uuid; v_resolution uuid; v_solo text;
  v_adopted boolean; v_recode_notification uuid;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  select * into x from clara.filing_corrections where id=p_correction;
  if not found or x.firm_id<>c.firm then raise exception 'correction not in your firm' using errcode='CLR11'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_wrong_client_correction',p_op_key,
    clara._hash(jsonb_build_object('correction',p_correction,'plan_hash',p_plan_hash,'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Global order: firm scope -> filings ASC -> originals ASC -> mirrors -> slots.
  perform pg_advisory_xact_lock(203005002,hashtext(c.firm::text));
  select * into x from clara.filing_corrections where id=p_correction for update;
  if x.status<>'proposed' or x.plan_hash<>p_plan_hash then raise exception 'correction plan/state mismatch' using errcode='CLR12'; end if;
  if c.actor=x.maker then
    if clara.eligible_checker_count(c.firm)>=2 then
      raise exception 'correction requires a distinct checker' using errcode='CLR19';
    elsif p_attestation is null or btrim(p_attestation)='' then
      raise exception 'solo correction approval requires attestation' using errcode='CLR19';
    else v_solo:=p_attestation; end if;
  end if;
  select coalesce(max(seq),0) into v_current from clara.domain_events where firm_id=c.firm;
  if v_current<>x.books_version then raise exception 'correction plan is stale (books version moved)' using errcode='CLR19'; end if;

  perform 1 from clara.document_filings f where f.document_id=x.document_id and f.firm_id=c.firm
    order by f.id for update;
  select id into v_from_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.from_client and retired_at is null;
  if v_from_filing is null then raise exception 'source filing is no longer active' using errcode='CLR19'; end if;
  perform 1 from clara.journal_entries je join clara.filing_correction_items i on i.entry_id=je.id
    where i.correction_id=x.id order by je.id for update of je;
  if exists(select 1 from clara.filing_correction_items i
    where i.correction_id=x.id and i.entry_state_hash<>clara._entry_state_hash(i.entry_id)) then
    raise exception 'correction item state changed' using errcode='CLR19';
  end if;
  if exists(select 1 from clara.filing_correction_items i
    where i.correction_id=x.id and clara._correction_period_state(i.entry_id)<>'no_period_model') then
    raise exception 'correction touches a closed period' using errcode='CLR19';
  end if;
  select id into v_resolution from clara.client_resolutions
    where firm_id=c.firm and client_id=x.to_client and subject_kind='document'
      and subject_id=x.document_id and method in ('human','rule') and confidence>=0.95
      and superseded_at is null order by created_at desc limit 1;
  if v_resolution is null then raise exception 'destination client attribution is not authoritative' using errcode='CLR01'; end if;

  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    select * into o from clara.journal_entries where id=it.entry_id;
    if it.action='reverse' then
      v_mirror:=null; v_adopted:=false;
      -- F-13: adopt one exact pending mirror; every mismatch (and any duplicate
      -- exact mirror after the first) is explicit withdrawn history.
      for pending in select * from clara.journal_entries
          where reversal_of=o.id and status='draft' order by id for update loop
        if v_mirror is null
           and clara._entry_state_hash(pending.id)=clara._expected_reversal_state_hash(pending.id,o.id) then
          v_mirror:=pending.id; v_adopted:=true;
        else
          update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
            withdrawn_at=now(),withdrawal_reason='superseded-by-correction',updated_at=now()
            where id=pending.id;
        end if;
      end loop;
      if v_mirror is null then
        insert into clara.journal_entries(client_id,status,posting_date,memo,origin,resolution_id,
            is_opening_balance,is_year_end,tax_affecting,maker_actor,last_human_editor,
            reversal_of,reversal_reason)
          values(o.client_id,'draft',current_date,'Correction reversal: '||x.reason,'reversal',o.resolution_id,
            o.is_opening_balance,o.is_year_end,o.tax_affecting,c.actor,c.actor,o.id,x.reason)
          returning id into v_mirror;
        insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description)
          select v_mirror,line_no,account_code,credit_cents,debit_cents,description
          from clara.journal_lines where entry_id=o.id order by line_no;
      end if;
      perform clara._assert_balanced(v_mirror);
      update clara.journal_entries set status='approved',checker_actor=c.actor,approved_at=now(),
        self_approval_attestation=v_solo,updated_at=now() where id=v_mirror;
      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,updated_at=now() where id=o.id;
      update clara.filing_correction_items set reversal_id=v_mirror,outcome='reversed',
        adopted_reversal=v_adopted where id=it.id;
    elsif it.action='withdraw_draft' then
      update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,withdrawn_at=now(),
        withdrawal_reason=x.reason,updated_at=now() where id=o.id;
      update clara.filing_correction_items set outcome='withdrawn' where id=it.id;
    else
      update clara.filing_correction_items set outcome='already_reversed' where id=it.id;
    end if;
  end loop;

  update clara.document_filings set retired_at=now(),retired_by=c.actor,
    retirement_reason=x.reason,correction_id=x.id where id=v_from_filing;
  select id into v_to_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.to_client and retired_at is null;
  if v_to_filing is null then
    insert into clara.document_filings(firm_id,document_id,client_id,filed_by,resolution_id,basis,correction_id)
      values(c.firm,x.document_id,x.to_client,c.actor,v_resolution,'correction',x.id)
      returning id into v_to_filing;
  end if;
  perform clara._recompute_document_retention(x.document_id);
  -- AB-9 stopgap: Slice 5 has no actionable coding-task carrier. Emit one
  -- durable firm-visible notification now; Slice 6 replaces this stopgap with
  -- the coding-floor task while preserving this correction linkage.
  insert into clara.notifications(firm_id,client_id,kind,payload,created_by)
    values(c.firm,x.to_client,'document_recode_required',jsonb_build_object(
      'correction_id',x.id,'document_id',x.document_id,'to_client',x.to_client,
      'work_kind','recode_document','status','pending','carrier','slice6-coding-floor'),c.actor)
    returning id into v_recode_notification;
  update clara.filing_corrections set status='completed',checker=c.actor,attestation=v_solo,
    approved_at=now(),completed_at=now() where id=x.id;
  perform clara._audit(c.firm,c.actor,null,null,'approve_wrong_client_correction',null,
    jsonb_build_object('correction',x.id,'document',x.document_id,'from_filing',v_from_filing,
      'to_filing',v_to_filing,'plan_hash',p_plan_hash,'op_key',p_op_key));

  -- Domain events are the transaction tail, after every book/filing mutation + audit.
  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    if it.outcome='reversed' then
      if not it.adopted_reversal then
        perform clara._append_event(c.firm,'entry.drafted',x.from_client,c.actor,null,null,
          it.reversal_id,null,null,'{}'::jsonb);
      end if;
      perform clara._append_event(c.firm,'entry.approved',x.from_client,c.actor,null,null,
        it.reversal_id,null,null,'{}'::jsonb);
      perform clara._append_event(c.firm,'entry.reversed',x.from_client,c.actor,null,null,
        it.entry_id,null,null,'{}'::jsonb);
    end if;
  end loop;
  perform clara._append_event(c.firm,'document.filing_retired',x.from_client,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('filing_id',v_from_filing,'correction_id',x.id));
  perform clara._append_event(c.firm,'document.filed',x.to_client,c.actor,null,null,
    null,x.document_id,v_resolution,jsonb_build_object('filing_id',v_to_filing,'correction_id',x.id));
  perform clara._append_event(c.firm,'document.correction_applied',null,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('correction_id',x.id));
  perform clara._append_event(c.firm,'notification.recorded',x.to_client,c.actor,null,null,
    null,null,null,jsonb_build_object('notification_id',v_recode_notification,'correction_id',x.id));
  return clara._finish_op(c.firm,'approve_wrong_client_correction',p_op_key,
    jsonb_build_object('correction_id',x.id,'status','completed','from_filing_id',v_from_filing,
      'to_filing_id',v_to_filing));
end $$;

-- =====================================================================
-- 10. FILING-BASED FRESHNESS + TAXONOMY V2 CUTOVER
-- =====================================================================

create or replace function clara.assert_books_current(p_firm uuid, p_client uuid, p_version bigint,
    p_below bigint default null) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_max bigint;
begin
  select coalesce(max(seq),0) into v_max from clara.domain_events where firm_id=p_firm;
  if p_version>v_max then
    raise exception 'stale context: token % is ahead of the books (head %)',p_version,v_max using errcode='CLR12';
  end if;
  if exists(
    select 1 from clara.domain_events e where e.firm_id=p_firm and e.seq>p_version
      and (p_below is null or e.seq<p_below)
      and e.event_type<>'document.correction_applied'
      and (e.client_id=p_client
        or (e.client_id is null and e.document_id is not null and exists(
          select 1 from clara.document_filings f where f.document_id=e.document_id
            and f.client_id=p_client and f.retired_at is null))
        or (e.client_id is null and e.document_id is null))
  ) then raise exception 'stale context: the books moved past token %',p_version using errcode='CLR12'; end if;
end $$;

insert into clara.event_types(name,client_scoped,description) values
  ('document.filed',true,'A document was actively filed to a client'),
  ('document.filing_retired',true,'A client filing was retired'),
  ('document.extraction_completed',true,'Vendor-neutral document extraction completed'),
  ('document.extraction_failed',true,'Vendor-neutral document extraction failed'),
  ('document.correction_applied',false,'Aggregate wrong-client correction completed');

insert into clara.taxonomy_versions(version,note) values
  (2,'Slice 5 document pipeline routing; ADR-018');
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select 2,e.name,
  case e.name
    when 'document.ingested' then 'ignore'
    when 'document.extraction_completed' then 'ignore'
    when 'document.extraction_failed' then 'ignore'
    when 'notification.recorded' then 'ignore'
    else 'context_update' end,
  case e.name
    when 'document.ingested' then 'matcher/router checkpoint only; no background wake'
    when 'document.extraction_completed' then 'matcher is a separate registered consumer'
    when 'document.extraction_failed' then 'honest terminal fact, no router wake'
    else null end
from clara.event_types e;

-- Residual v1 document background work cannot survive the semantic repoint.
do $$
declare f record; v_n int;
begin
  for f in select distinct wi.firm_id from clara.wake_intents wi
    where wi.event_type like 'document.%' and wi.decision='background_review'
  loop
    update clara.agent_tasks t set status='cancelled',cancelled_at=now()
      where t.kind='wake' and t.status='held' and t.origin_intent_id in (
        select wi.id from clara.wake_intents wi where wi.firm_id=f.firm_id
          and wi.event_type like 'document.%' and wi.decision='background_review');
    update clara.wakes_outbox o set status='cancelled'
      where o.status='held' and o.intent_id in (
        select wi.id from clara.wake_intents wi where wi.firm_id=f.firm_id
          and wi.event_type like 'document.%' and wi.decision='background_review');
    update clara.wake_intents wi set status='consumed',consumed_by='taxonomy-v2-cutover'
      where wi.firm_id=f.firm_id and wi.event_type like 'document.%'
        and wi.decision='background_review' and wi.status='pending';
    get diagnostics v_n=row_count;
    perform clara._audit(f.firm_id,null,null,null,'taxonomy_v2_cutover',null,
      jsonb_build_object('reason','taxonomy-v2-cutover','pending_consumed',v_n));
  end loop;
end $$;

update clara.taxonomy_active set version=2 where singleton=true;

-- =====================================================================
-- 11. TABLE/VIEW GRANTS + PUBLIC EXECUTE SWEEP + NAMED FUNCTION GRANTS
-- =====================================================================

grant select on clara.document_filings,clara.document_extractions,clara.document_regions
  to clara_authenticated,clara_agent_ro;
grant select on clara.attribution_attempts,clara.attribution_candidates,
  clara.attribution_candidate_regions,clara.client_identifiers,clara.client_aliases,
  clara.filing_corrections,clara.filing_correction_items,clara.firm_document_limits
  to clara_authenticated;
grant select on clara.client_identifiers,clara.client_aliases to clara_runtime;
grant select on clara.document_intakes_visible,clara.document_processing_tasks_visible
  to clara_authenticated;

-- Retired writers retain bodies for deterministic superuser diagnostics, but no
-- application lane may reach them and the wake authority row was removed above.
revoke execute on function clara.ingest_document(uuid,text,text,text,bigint,text,text)
  from clara_authenticated,clara_agent_ro,clara_wake_interactive,clara_wake_proactive,clara_runtime;
revoke execute on function clara.wake_ingest_document(uuid,text,text,text,bigint,text,text)
  from clara_authenticated,clara_agent_ro,clara_wake_interactive,clara_wake_proactive,clara_runtime;

alter default privileges for role clara_fn_owner in schema clara revoke execute on functions from public;
revoke execute on all functions in schema clara from public;

-- Human governance lane.
grant execute on function
  clara.file_document(uuid,uuid,text,text),
  clara.retire_document_filing(uuid,text,uuid,text),
  clara.propose_wrong_client_correction(uuid,uuid,uuid,text,text),
  clara.approve_wrong_client_correction(uuid,text,text,text),
  clara.confirm_attribution_candidate(uuid,text,boolean),
  clara.dismiss_attribution_candidate(uuid,text),
  clara.add_client_identifier(uuid,text,text,text),
  clara.add_client_alias(uuid,text,text),
  clara.retire_client_alias(uuid,text),
  clara.place_legal_hold(uuid,text,text),
  clara.release_legal_hold(uuid,text,text)
to clara_authenticated;

-- Correction planning is human-only: it can reveal posting/citation topology.
grant execute on function clara.preview_wrong_client_correction(uuid,uuid,uuid)
  to clara_authenticated;

-- Runtime-only transport/matcher/processing surfaces.
grant execute on function
  clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text),
  clara.claim_document_intake_upload(uuid,text,text,int,text),
  clara.mark_document_intake_received(uuid,text,text,text,text,text),
  clara.begin_document_intake_verification(uuid,text),
  clara.verify_document_intake(uuid,text,int,text),
  clara.fail_document_intake(uuid,text,text),
  clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text),
  clara.upgrade_legacy_document(uuid,text,text,jsonb,int,text,uuid,uuid,text),
  clara.claim_document_processing_task(uuid,text,boolean),
  clara.release_held_document_tasks(int),
  clara.requeue_stranded_document_task(uuid,text),
  clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text),
  clara.complete_stored_document_task(uuid,text),
  clara.reserve_document_ingest(uuid,uuid,int,text),
  clara.resize_ingest_reservation(uuid,int,text),
  clara.settle_ingest_reservation(uuid,int,text),
  clara.refund_ingest_reservation(uuid,text,text),
  clara.record_attribution_attempt(uuid,text,text,jsonb,text,text)
to clara_runtime;

-- The rule matcher is intentionally narrower than the runtime group: only the
-- non-inheriting runtime login shell receives this direct capability.
grant execute on function clara.record_rule_resolution(uuid,text)
  to clara_runtime_login;
grant usage on schema clara to clara_runtime_login;

reset role;
