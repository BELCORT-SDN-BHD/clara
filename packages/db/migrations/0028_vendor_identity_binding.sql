-- 0028_vendor_identity_binding.sql -- vendor identity binding machinery (task #36).
--
-- Authority:
--   docs/plan/autopost-vendor-binding-design.md (v4.1, ratified)
--   docs/plan/autopost-vendor-binding-design-part2.md (A/B/D/F/G)
--
-- Scope is deliberately bounded to migration 0028. This file installs the typed
-- authority, its proposal/sign/revoke and read verbs, admission Slot A, draft Slot B,
-- revision divergence bookkeeping, the draft-review warning, the executor's
-- skip-vocabulary split, and the persist_invoice_facts lock hoist found during the
-- post-0027 CoR pass. It DOES NOT install Slot C, change execute_rule_post's binding
-- liveness control, or recut _approve_entry_core. Those belong to the separate,
-- interlocked migration version `0029_vendor_binding_executor`.
--
-- CoR discipline. Every existing body patched below was read from the live PostgreSQL
-- 17 catalog with migrations 0001-0027 applied. The replacements are fail-closed source
-- transforms over pg_get_functiondef: each old fragment must occur exactly once or this
-- migration aborts. That makes every byte outside the stated delta remain catalog-exact,
-- including the unbound _draft_entry_core path.
--
-- Error code. CLR35 is already occupied by 0026's impossible ON-CONFLICT state family.
-- CLR36 is therefore the next free application code and is used for this migration's
-- new vendor-binding refusal family. Existing cross-domain codes remain unchanged:
-- CLR11 for foreign-firm reads and CLR23 for the agent-lane counterparty conflict.

do $preflight$
begin
  if not exists (
    select 1 from clara.schema_migrations
    where version = '0027_filings_lock_order'
  ) then
    raise exception '0028 requires 0027_filings_lock_order' using errcode='CLR10';
  end if;
end
$preflight$;

-- sign_vendor_identity_binding's post_control_absent interlock (section C) reads
-- clara.schema_migrations from inside a SECURITY DEFINER body owned by clara_fn_owner --
-- no prior migration ever granted that role read access to this table (every existing
-- schema_migrations read lives in migration-time do-blocks running as the connecting
-- superuser, never inside a persisted function). Granted here, as the connecting role,
-- BEFORE the switch to clara_fn_owner below -- clara_fn_owner cannot grant itself a
-- privilege on a table it does not own. Without this the interlock 42501s unconditionally,
-- before and after 0029 deploys, rather than ever reaching the post_control_absent check.
grant select on clara.schema_migrations to clara_fn_owner;

set role clara_fn_owner;

-- =====================================================================
-- A. Typed authority tables and the journal-entry provenance reference.
-- =====================================================================

create table clara.vendor_identity_bindings (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  counterparty_id uuid not null,
  status text not null default 'proposed'
    check (status in ('proposed','live','revoked','declined','expired')),
  f1_vendor_name_norm text not null check (btrim(f1_vendor_name_norm) <> ''),
  f2_invoice_prefix text not null check (length(f2_invoice_prefix) >= 6),
  registration_at_signing text not null
    check (btrim(registration_at_signing) <> ''),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  signed_by uuid,
  signed_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text,
  expires_at timestamptz not null,
  constraint uq_vendor_bindings_id_firm_client
    unique (id, firm_id, client_id),
  constraint fk_vib_counterparty
    foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  constraint ck_vib_expiry
    check (expires_at <= created_at + interval '12 months'),
  constraint ck_vib_revoked
    check ((status='revoked') = (revoked_at is not null))
);

create unique index uq_vib_one_live
  on clara.vendor_identity_bindings(client_id,counterparty_id)
  where status='live';

create table clara.vendor_identity_binding_evidence (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null,
  firm_id uuid not null,
  client_id uuid not null,
  entry_id uuid not null,
  document_id uuid not null,
  facts_extraction_id uuid not null,
  ocr_extraction_id uuid not null,
  constraint fk_vibe_binding
    foreign key (binding_id, firm_id, client_id)
    references clara.vendor_identity_bindings(id, firm_id, client_id)
    on delete cascade,
  constraint fk_vibe_entry
    foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint fk_vibe_facts
    foreign key (facts_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id),
  constraint fk_vibe_ocr
    foreign key (ocr_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id),
  constraint uq_vibe_binding_entry unique (binding_id, entry_id)
);

create table clara.vendor_binding_resolutions (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null,
  firm_id uuid not null,
  client_id uuid not null,
  document_id uuid not null,
  entry_id uuid not null,
  phase text not null check (phase in ('draft','revision','post')),
  facts_extraction_id uuid not null,
  ocr_extraction_id uuid not null,
  compared_to_resolution_id uuid,
  entry_revision_token uuid not null,
  raw_proposal jsonb not null,
  outcome text not null check (outcome in ('bound','divergence','refused')),
  refusal_reason text,
  divergence jsonb,
  created_at timestamptz not null default now(),
  constraint uq_vbr_id_firm_client unique (id, firm_id, client_id),
  constraint fk_vbr_binding
    foreign key (binding_id, firm_id, client_id)
    references clara.vendor_identity_bindings(id, firm_id, client_id),
  constraint fk_vbr_entry
    foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint fk_vbr_facts
    foreign key (facts_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id),
  constraint fk_vbr_ocr
    foreign key (ocr_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id),
  constraint fk_vbr_compared
    foreign key (compared_to_resolution_id, firm_id, client_id)
    references clara.vendor_binding_resolutions(id, firm_id, client_id),
  constraint ck_vbr_compared_phase
    check (compared_to_resolution_id is null or phase='post')
);

alter table clara.journal_entries
  add column vendor_binding_id uuid;
alter table clara.journal_entries
  add constraint fk_je_vendor_binding
  foreign key (vendor_binding_id, firm_id, client_id)
  references clara.vendor_identity_bindings(id, firm_id, client_id);

alter table clara.vendor_identity_bindings enable row level security;
alter table clara.vendor_identity_bindings force row level security;
create policy p_vendor_identity_bindings_owner
  on clara.vendor_identity_bindings
  for all to clara_fn_owner using (true) with check (true);

alter table clara.vendor_identity_binding_evidence enable row level security;
alter table clara.vendor_identity_binding_evidence force row level security;
create policy p_vendor_identity_binding_evidence_owner
  on clara.vendor_identity_binding_evidence
  for all to clara_fn_owner using (true) with check (true);

alter table clara.vendor_binding_resolutions enable row level security;
alter table clara.vendor_binding_resolutions force row level security;
create policy p_vendor_binding_resolutions_owner
  on clara.vendor_binding_resolutions
  for all to clara_fn_owner using (true) with check (true);

-- DR round-trip fix (R-round follow-up): no GRANT/REVOKE statement targets these
-- three tables. A freshly created table already starts with an EMPTY (implicit
-- NULL) relacl -- nobody but the owner has any privilege, matching every other
-- private/root-only table in this schema (clara.coding_rules, clara.op_receipts:
-- neither is ever touched by a grant or revoke, and both show a NULL relacl). An
-- explicit `revoke all ... from public, clara_authenticated, ...` here would be a
-- pure no-op on privileges actually held (none of those roles were ever granted
-- anything on a brand-new table) -- but issuing ANY grant/revoke statement forces
-- Postgres to MATERIALIZE relacl, and materializing it requires explicitly listing
-- the OWNER's own full privilege set too (an explicit ACL that omitted the owner
-- would lock the owner out). That explicit clara_fn_owner self-grant is exactly
-- what a DR backup/restore round-trip cannot reproduce: pg_dump never emits a
-- redundant owner self-grant, so the restored catalog comes back with relacl
-- NULL again -- source-explicit vs target-implicit, and the DR grant-matrix
-- (packages/backup's full-profile verifier, check 4.6) correctly refuses a
-- backup that cannot restore grant-identical. Leaving these three tables
-- untouched by any GRANT/REVOKE keeps relacl NULL from creation onward, exactly
-- like coding_rules/op_receipts, and postverify probe (2) already asserts the
-- REAL invariant (no role_table_grants row for any of the restricted roles),
-- not the presence of this statement.

-- Once signed, the derived authority content is frozen for the rest of the
-- row's life. Lifecycle verbs may still move status and write their actor/time fields.
create function clara._tf_vendor_identity_binding_update() returns trigger
language plpgsql security definer
set search_path to clara,pg_temp
as $$
begin
  if old.signed_at is not null
     and (new.f1_vendor_name_norm is distinct from old.f1_vendor_name_norm
       or new.f2_invoice_prefix is distinct from old.f2_invoice_prefix
       or new.registration_at_signing is distinct from old.registration_at_signing
       or new.content_hash is distinct from old.content_hash
       or new.expires_at is distinct from old.expires_at) then
    raise exception 'vendor binding content is frozen' using errcode='CLR36';
  end if;
  return new;
end
$$;

create trigger t_vib_frozen
before update on clara.vendor_identity_bindings
for each row execute function clara._tf_vendor_identity_binding_update();

create trigger t_vbr_append_only
before update or delete on clara.vendor_binding_resolutions
for each row execute function clara._tf_append_only();

create trigger t_vbr_no_truncate
before truncate on clara.vendor_binding_resolutions
for each statement execute function clara._tf_no_truncate();

-- =====================================================================
-- B. Normalization, corroboration, and the lock-free admission resolver.
-- =====================================================================

create or replace function clara._binding_normalize(t text) returns text
language sql immutable
as $$
  select lower(btrim(regexp_replace(
    translate(normalize(t, NFC),
      U&'\00AD\200B\200C\200D\2060\2061\2062\2063\2064\FEFF'
      ||
      U&'\200E\200F\202A\202B\202C\202D\202E\2066\2067\2068\2069', ''),
    '\s+', ' ', 'g')));
$$;

-- DESIGN NOTE: this deliberately uses the simpler unit-agnostic ymin/height
-- ratio, not X6's width-normalized fixed-inch geometry. ymin and height come
-- from the same OCR page coordinate frame, so a pure height fraction needs no
-- width conversion. Missing, zero, or non-numeric geometry fails closed.
create function clara._binding_f3_holds(
  p_document uuid,
  p_registration_norm text,
  p_name_norm text
) returns boolean
language sql stable security definer
set search_path to clara,pg_temp
as $$
with ocr as (
  select e.id,e.envelope
  from clara.document_extractions e
  where e.document_id=p_document
    and e.engine_kind='ocr'
    and e.status='done'
  order by e.version_n desc,e.id desc
  limit 1
), page_one as (
  select o.id,
    case when p.page_height ~
      '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
      then p.page_height::numeric end as page_height
  from ocr o
  cross join lateral (
    select x->>'height' as page_height
    from jsonb_array_elements(
      case when jsonb_typeof(o.envelope->'pages')='array'
        then o.envelope->'pages' else '[]'::jsonb end
    ) x
    where case
      when (x->>'page_number') ~ '^[0-9]+$'
        then (x->>'page_number')::int=1
      else false
    end
    limit 1
  ) p
), region_geometry as (
  select r.text_content,p.page_height,
    case when jsonb_typeof(r.locator->'polygon')='array'
           and jsonb_array_length(r.locator->'polygon')>=8
           and (r.locator->'polygon'->>1) ~
             '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
      then (r.locator->'polygon'->>1)::numeric end as y1,
    case when jsonb_typeof(r.locator->'polygon')='array'
           and jsonb_array_length(r.locator->'polygon')>=8
           and (r.locator->'polygon'->>3) ~
             '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
      then (r.locator->'polygon'->>3)::numeric end as y2,
    case when jsonb_typeof(r.locator->'polygon')='array'
           and jsonb_array_length(r.locator->'polygon')>=8
           and (r.locator->'polygon'->>5) ~
             '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
      then (r.locator->'polygon'->>5)::numeric end as y3,
    case when jsonb_typeof(r.locator->'polygon')='array'
           and jsonb_array_length(r.locator->'polygon')>=8
           and (r.locator->'polygon'->>7) ~
             '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
      then (r.locator->'polygon'->>7)::numeric end as y4
  from page_one p
  join clara.document_regions r on r.extraction_id=p.id
  where case
    when (r.locator->>'page_number') ~ '^[0-9]+$'
      then (r.locator->>'page_number')::int=1
    else false
  end
)
select coalesce(bool_or(
  page_height is not null and page_height>0
  and y1 is not null and y2 is not null and y3 is not null and y4 is not null
  and least(y1,y2,y3,y4)/page_height<=0.25
  and (
    (nullif(clara._binding_normalize(p_registration_norm),'') is not null
      and position(clara._binding_normalize(p_registration_norm)
        in clara._binding_normalize(text_content))>0)
    or
    (nullif(clara._binding_normalize(p_name_norm),'') is not null
      and position(clara._binding_normalize(p_name_norm)
        in clara._binding_normalize(text_content))>0)
  )
),false)
from region_geometry;
$$;

create function clara._resolve_vendor_binding(
  p_client uuid,
  p_document uuid,
  p_page_candidate uuid default null
) returns jsonb
language plpgsql stable security definer
set search_path to clara,pg_temp
as $$
declare
  v_ext record; v_vi jsonb; v_vendor text; v_norm_name text;
  v_matches int; v_counterparty uuid; v_binding uuid;
  v_invoice_id text; v_invoice_id_norm text; v_f2_prefix text;
begin
  select e.* into v_ext
  from clara.document_extractions e
  where e.document_id=p_document
    and e.engine_kind='invoice_facts'
    and e.status='done'
  order by e.version_n desc,e.id desc
  limit 1;
  if not found then
    return jsonb_build_object('outcome','unresolved');
  end if;

  v_vi:=v_ext.envelope->'vendor_identity';
  if jsonb_typeof(v_vi) is distinct from 'object'
     or v_vi->>'outcome' is distinct from 'absent'
     or jsonb_typeof(v_vi->'candidates') is distinct from 'array'
     or jsonb_array_length(v_vi->'candidates')<>0 then
    return jsonb_build_object('outcome','unresolved');
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_vi) k
    where k not in (
      'matched','absent','ambiguous','rejected_gate','below_band',
      'height_missing','unit_unresolved','no_geometry','label_continuation',
      'no_vendor_anchor','vendor_anchor_far','closer_to_customer',
      'typed_collapsed','typed_disagreement','typed_vs_ambiguous','emitted',
      'candidates','outcome','value_raw','occurrences','distinct_keys'
    )
  ) then
    return jsonb_build_object('outcome','unresolved');
  end if;

  -- The current X6 producer always emits these four counters. On the only path
  -- that sets outcome='absent', it increments absent exactly once before return;
  -- no accepted row exists, so matched/typed_collapsed/emitted remain zero.
  if v_vi->'absent' is distinct from '1'::jsonb
     or v_vi->'matched' is distinct from '0'::jsonb
     or v_vi->'typed_collapsed' is distinct from '0'::jsonb
     or v_vi->'emitted' is distinct from '0'::jsonb
     or v_vi ?| array['value_raw','occurrences','distinct_keys']
     or exists (
    select 1
    from unnest(array[
      'below_band','height_missing','unit_unresolved','no_geometry',
      'rejected_gate','label_continuation','no_vendor_anchor',
      'vendor_anchor_far','closer_to_customer','ambiguous',
      'typed_disagreement','typed_vs_ambiguous'
    ]) k
    where v_vi ? k and v_vi->k is distinct from '0'::jsonb
  ) then
    return jsonb_build_object('outcome','unresolved');
  end if;

  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext.id
      and r.field_path='invoice.vendor_registration'
  ) then
    return jsonb_build_object('outcome','unresolved');
  end if;

  select nullif(btrim(min(r.text_content)),'') into v_vendor
  from clara.document_regions r
  where r.extraction_id=v_ext.id
    and r.field_path='invoice.vendor_name';
  if v_vendor is null then
    return jsonb_build_object('outcome','unresolved');
  end if;

  v_norm_name:=clara._binding_normalize(v_vendor);
  select nullif(btrim(min(r.text_content)),'') into v_invoice_id
  from clara.document_regions r
  where r.extraction_id=v_ext.id
    and r.field_path='invoice.invoice_id';
  v_invoice_id_norm:=clara._binding_normalize(v_invoice_id);

  -- F2 is not a selection key. First count the complete F1+F3 candidate set
  -- (including the optional page-candidate equality wall); only a unique
  -- candidate may be checked for F2 consistency afterward.
  select count(*)::int,
         (array_agg(b.counterparty_id order by b.id))[1],
         (array_agg(b.id order by b.id))[1],
         (array_agg(b.f2_invoice_prefix order by b.id))[1]
    into v_matches,v_counterparty,v_binding,v_f2_prefix
  from clara.vendor_identity_bindings b
  join clara.counterparties cp
    on cp.id=b.counterparty_id
   and cp.firm_id=b.firm_id
   and cp.client_id=b.client_id
  where b.client_id=p_client
    and b.status='live'
    and b.expires_at>now()
    and b.f1_vendor_name_norm=v_norm_name
    and cp.merged_into is null
    and cp.retired_at is null
    and cp.registration_normalized is not distinct from b.registration_at_signing
    and clara._binding_f3_holds(
      p_document,cp.registration_normalized,cp.name_normalized)
    and (p_page_candidate is null or b.counterparty_id=p_page_candidate);

  if v_matches=0 then
    return jsonb_build_object('outcome','unresolved');
  end if;
  if v_matches>1 then
    return jsonb_build_object('outcome','ambiguous');
  end if;
  if v_invoice_id_norm is null
     or not starts_with(v_invoice_id_norm,v_f2_prefix) then
    return jsonb_build_object('outcome','ambiguous');
  end if;
  return jsonb_build_object(
    'outcome','bound',
    'counterparty_id',v_counterparty,
    'binding_id',v_binding);
end
$$;

-- Small immutable helper used by the shared propose/sign derivation.
create function clara._binding_common_prefix(a text,b text,c text) returns text
language plpgsql immutable
as $$
declare v_limit int; v_i int;
begin
  a:=coalesce(a,''); b:=coalesce(b,''); c:=coalesce(c,'');
  v_limit:=least(length(a),length(b),length(c));
  if v_limit=0 then return ''; end if;
  for v_i in 1..v_limit loop
    if substr(a,v_i,1) is distinct from substr(b,v_i,1)
       or substr(a,v_i,1) is distinct from substr(c,v_i,1) then
      return left(a,v_i-1);
    end if;
  end loop;
  return left(a,v_limit);
end
$$;

-- One derivation body is shared by propose and sign so condition ordering,
-- evidence selection, feature derivation, and the content hash cannot drift.
create function clara._derive_vendor_binding_proposal(
  p_firm uuid,
  p_client uuid,
  p_counterparty uuid
) returns jsonb
language plpgsql stable security definer
set search_path to clara,pg_temp
as $$
declare
  v_cp uuid; cp record; v_n int; v_dates int; v_span int;
  v_evidence jsonb; v_final_evidence jsonb; v_item jsonb;
  v_f1 text; v_f2 text; v_alpha_count int; v_leading text;
  v_height numeric; v_hash text;
begin
  if not exists (
    select 1 from clara.clients
    where id=p_client and firm_id=p_firm
  ) then
    raise exception 'binding_client_unavailable' using errcode='CLR36';
  end if;

  begin
    v_cp:=clara._canonical_counterparty(p_client,p_counterparty);
  exception when sqlstate 'CLR23' then
    v_cp:=null;
  end;
  if v_cp is null or v_cp is distinct from p_counterparty then
    raise exception 'binding_counterparty_inactive' using errcode='CLR36';
  end if;
  select * into cp
  from clara.counterparties
  where id=v_cp and firm_id=p_firm and client_id=p_client
    and kind='vendor' and merged_into is null and retired_at is null;
  if not found then
    raise exception 'binding_counterparty_inactive' using errcode='CLR36';
  end if;
  if nullif(btrim(cp.registration_normalized),'') is null then
    raise exception 'binding_unattributable' using errcode='CLR36';
  end if;

  with window_entries as materialized (
    select j.id,j.document_id,j.posting_date,j.approved_at
    from clara.journal_entries j
    where j.client_id=p_client
      and j.status='approved'
      and j.reversed_by is null
      and j.checked_via_rule_id is null
      and j.document_id is not null
      and exists (
        select 1 from clara.journal_lines l
        where l.entry_id=j.id
          and clara._canonical_counterparty(
            p_client,l.counterparty_id)=v_cp
      )
    order by j.approved_at desc,j.id desc
    limit 3
  ), derived as (
    select w.*,
      fx.id as facts_extraction_id,
      fx.extracted_at as facts_extracted_at,
      ox.id as ocr_extraction_id,
      ox.extracted_at as ocr_extracted_at,
      clara._binding_normalize(vn.vendor_name) as f1_vendor_name_norm,
      clara._binding_normalize(ii.invoice_id) as invoice_id_norm
    from window_entries w
    left join lateral (
      select x.id,x.extracted_at
      from clara.document_extractions x
      where x.document_id=w.document_id
        and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc,x.id desc limit 1
    ) fx on true
    left join lateral (
      select x.id,x.extracted_at
      from clara.document_extractions x
      where x.document_id=w.document_id
        and x.engine_kind='ocr' and x.status='done'
      order by x.version_n desc,x.id desc limit 1
    ) ox on true
    left join lateral (
      select nullif(btrim(min(r.text_content)),'') as vendor_name
      from clara.document_regions r
      where r.extraction_id=fx.id
        and r.field_path='invoice.vendor_name'
    ) vn on true
    left join lateral (
      select nullif(btrim(min(r.text_content)),'') as invoice_id
      from clara.document_regions r
      where r.extraction_id=fx.id
        and r.field_path='invoice.invoice_id'
    ) ii on true
  )
  select count(*)::int,count(distinct posting_date)::int,
    (max(posting_date)-min(posting_date))::int,
    coalesce(jsonb_agg(jsonb_build_object(
      'entry_id',id,
      'document_id',document_id,
      'facts_extraction_id',facts_extraction_id,
      'ocr_extraction_id',ocr_extraction_id,
      'posting_date',posting_date,
      'approved_at',approved_at,
      'facts_restated',facts_extracted_at>approved_at,
      'ocr_restated',ocr_extracted_at>approved_at,
      'f1_vendor_name_norm',f1_vendor_name_norm,
      'invoice_id_norm',invoice_id_norm
    ) order by approved_at desc,id desc),'[]'::jsonb)
    into v_n,v_dates,v_span,v_evidence
  from derived;

  if v_n<3 then
    raise exception 'insufficient_evidence' using errcode='CLR36';
  end if;
  if v_dates<>3 or v_span is null or v_span<14 then
    raise exception 'window_too_recent' using errcode='CLR36';
  end if;

  for v_item in select value from jsonb_array_elements(v_evidence) loop
    if nullif(v_item->>'facts_extraction_id','') is null then
      raise exception 'binding_unattributable' using errcode='CLR36';
    end if;
    if nullif(v_item->>'ocr_extraction_id','') is null then
      raise exception 'binding_no_corroboration_source' using errcode='CLR36';
    end if;
    if coalesce((v_item->>'facts_restated')::boolean,false)
       or coalesce((v_item->>'ocr_restated')::boolean,false) then
      raise exception 'evidence_restated' using errcode='CLR36';
    end if;
    if nullif(v_item->>'f1_vendor_name_norm','') is null then
      raise exception 'binding_unattributable' using errcode='CLR36';
    end if;
  end loop;

  select count(distinct value->>'f1_vendor_name_norm')::int,
         min(value->>'f1_vendor_name_norm')
    into v_n,v_f1
  from jsonb_array_elements(v_evidence);
  if v_n<>1 then
    raise exception 'features_unstable' using errcode='CLR36';
  end if;

  v_f2:=clara._binding_common_prefix(
    v_evidence->0->>'invoice_id_norm',
    v_evidence->1->>'invoice_id_norm',
    v_evidence->2->>'invoice_id_norm');
  v_alpha_count:=length(regexp_replace(v_f2,'[^A-Za-z]','','g'));
  v_leading:=lower(coalesce(substring(v_f2 from '^[A-Za-z]+'),''));
  if length(v_f2)<6 or v_alpha_count<3
     or v_leading in (
       'inv','invoice','bill','tax','doc','no','rcpt','receipt',
       'cn','dn','so','po','binv'
     ) then
    raise exception 'prefix_too_weak' using errcode='CLR36';
  end if;

  for v_item in select value from jsonb_array_elements(v_evidence) loop
    if not clara._binding_f3_holds(
      (v_item->>'document_id')::uuid,
      cp.registration_normalized,
      cp.name_normalized
    ) then
      select case when p.page_height ~
        '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
        then p.page_height::numeric end
        into v_height
      from clara.document_extractions x
      cross join lateral (
        select q->>'height' as page_height
        from jsonb_array_elements(
          case when jsonb_typeof(x.envelope->'pages')='array'
            then x.envelope->'pages' else '[]'::jsonb end
        ) q
        where case
          when (q->>'page_number') ~ '^[0-9]+$'
            then (q->>'page_number')::int=1
          else false
        end
        limit 1
      ) p
      where x.id=(v_item->>'ocr_extraction_id')::uuid;
      if v_height is null or v_height<=0 then
        raise exception 'binding_unattributable' using errcode='CLR36';
      end if;
      raise exception 'binding_uncorroborated' using errcode='CLR36';
    end if;
  end loop;

  if exists (
    select 1 from clara.vendor_identity_bindings b
    where b.client_id=p_client
      and b.counterparty_id=v_cp
      and b.status='live'
      and b.expires_at>now()
  ) then
    raise exception 'binding_conflict' using errcode='CLR36';
  end if;

  select jsonb_agg(
      value - 'approved_at' - 'facts_restated' - 'ocr_restated'
            - 'f1_vendor_name_norm' - 'invoice_id_norm'
      order by ordinality
    )
    into v_final_evidence
  from jsonb_array_elements(v_evidence) with ordinality;

  v_hash:=encode(sha256(convert_to(jsonb_build_object(
    'f1_vendor_name_norm',v_f1,
    'f2_invoice_prefix',v_f2,
    'registration_at_signing',cp.registration_normalized,
    'evidence',v_final_evidence
  )::text,'UTF8')),'hex');

  return jsonb_build_object(
    'client_id',p_client,
    'counterparty_id',v_cp,
    'f1_vendor_name_norm',v_f1,
    'f2_invoice_prefix',v_f2,
    'registration_at_signing',cp.registration_normalized,
    'content_hash',v_hash,
    'evidence',v_final_evidence
  );
end
$$;

-- =====================================================================
-- C. Proposal/sign/revoke ceremony.
-- =====================================================================

create function clara.propose_vendor_identity_binding(
  p_proposal jsonb,
  p_op_key text
) returns jsonb
language plpgsql security definer
set search_path to clara,pg_temp
as $$
declare
  c record; v_dedupe jsonb; v_client uuid; v_counterparty uuid;
  v_derived jsonb; v_binding uuid;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_proposal is null or jsonb_typeof(p_proposal)<>'object'
     or not (p_proposal ? 'client_id')
     or not (p_proposal ? 'counterparty_id')
     or exists (
       select 1 from jsonb_object_keys(p_proposal) k
       where k not in ('client_id','counterparty_id')
     ) then
    raise exception 'binding_proposal_malformed' using errcode='CLR36';
  end if;
  begin
    v_client:=(p_proposal->>'client_id')::uuid;
    v_counterparty:=(p_proposal->>'counterparty_id')::uuid;
  exception when others then
    raise exception 'binding_proposal_malformed' using errcode='CLR36';
  end;
  if v_client is null or v_counterparty is null then
    raise exception 'binding_proposal_malformed' using errcode='CLR36';
  end if;
  if not exists (
    select 1 from clara.clients where id=v_client and firm_id=c.firm
  ) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;

  v_dedupe:=clara._reserve_op(c.firm,'propose_vendor_identity_binding',p_op_key,
    clara._hash(jsonb_build_object(
      'client_id',v_client,'counterparty_id',v_counterparty)));
  if v_dedupe is not null then return v_dedupe; end if;

  update clara.vendor_identity_bindings
    set status='expired'
  where firm_id=c.firm and client_id=v_client
    and counterparty_id=v_counterparty
    and status='live' and expires_at<=now();

  v_derived:=clara._derive_vendor_binding_proposal(
    c.firm,v_client,v_counterparty);
  begin
    insert into clara.vendor_identity_bindings(
      firm_id,client_id,counterparty_id,status,
      f1_vendor_name_norm,f2_invoice_prefix,registration_at_signing,
      content_hash,created_by,expires_at
    ) values (
      c.firm,v_client,(v_derived->>'counterparty_id')::uuid,'proposed',
      v_derived->>'f1_vendor_name_norm',
      v_derived->>'f2_invoice_prefix',
      v_derived->>'registration_at_signing',
      v_derived->>'content_hash',c.actor,now()+interval '12 months'
    ) returning id into v_binding;
  exception when unique_violation then
    raise exception 'binding_conflict' using errcode='CLR36';
  end;

  insert into clara.vendor_identity_binding_evidence(
    binding_id,firm_id,client_id,entry_id,document_id,
    facts_extraction_id,ocr_extraction_id
  )
  select v_binding,c.firm,v_client,
    (x->>'entry_id')::uuid,(x->>'document_id')::uuid,
    (x->>'facts_extraction_id')::uuid,(x->>'ocr_extraction_id')::uuid
  from jsonb_array_elements(v_derived->'evidence') x;

  perform clara._audit(c.firm,c.actor,null,null,
    'propose_vendor_identity_binding',null,
    jsonb_build_object('binding_id',v_binding,'client_id',v_client,
      'counterparty_id',v_derived->>'counterparty_id','op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_binding.proposed',v_client,c.actor,
    null,null,null,null,null,
    jsonb_build_object('binding_id',v_binding,
      'counterparty_id',v_derived->>'counterparty_id'));

  return clara._finish_op(c.firm,'propose_vendor_identity_binding',p_op_key,
    jsonb_build_object('binding_id',v_binding,'status','proposed')
      || (v_derived - 'client_id' - 'counterparty_id'));
end
$$;

create function clara.sign_vendor_identity_binding(
  p_binding uuid,
  p_op_key text
) returns jsonb
language plpgsql security definer
set search_path to clara,pg_temp
as $$
declare
  c record; v_dedupe jsonb; b record; v_derived jsonb;
  v_stored_evidence jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_binding is null then
    raise exception 'binding is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'sign_vendor_identity_binding',p_op_key,
    clara._hash(jsonb_build_object('binding_id',p_binding)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into b
  from clara.vendor_identity_bindings
  where id=p_binding
  for update;
  if not found or b.firm_id<>c.firm then
    raise exception 'binding not found' using errcode='CLR11';
  end if;
  if b.status<>'proposed' then
    raise exception 'binding_not_proposed' using errcode='CLR36';
  end if;
  if b.expires_at<=now() then
    raise exception 'binding_expired' using errcode='CLR36';
  end if;

  update clara.vendor_identity_bindings
    set status='expired'
  where id<>p_binding
    and firm_id=c.firm and client_id=b.client_id
    and counterparty_id=b.counterparty_id
    and status='live' and expires_at<=now();

  v_derived:=clara._derive_vendor_binding_proposal(
    c.firm,b.client_id,b.counterparty_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'entry_id',ev.entry_id,
      'document_id',ev.document_id,
      'facts_extraction_id',ev.facts_extraction_id,
      'ocr_extraction_id',ev.ocr_extraction_id,
      'posting_date',j.posting_date
    ) order by j.approved_at desc,j.id desc),'[]'::jsonb)
    into v_stored_evidence
  from clara.vendor_identity_binding_evidence ev
  join clara.journal_entries j on j.id=ev.entry_id
  where ev.binding_id=p_binding;

  if b.f1_vendor_name_norm is distinct from
       v_derived->>'f1_vendor_name_norm'
     or b.f2_invoice_prefix is distinct from
       v_derived->>'f2_invoice_prefix'
     or b.registration_at_signing is distinct from
       v_derived->>'registration_at_signing'
     or b.content_hash is distinct from v_derived->>'content_hash'
     or v_stored_evidence is distinct from v_derived->'evidence' then
    raise exception 'proposal_drifted' using errcode='CLR36';
  end if;

  if not exists (
    select 1 from clara.schema_migrations
    where version='0029_vendor_binding_executor'
  ) then
    raise exception 'post-time control not yet deployed'
      using errcode='CLR36',detail='{"reason":"post_control_absent"}';
  end if;

  update clara.vendor_identity_bindings
    set status='live',signed_by=c.actor,signed_at=now()
  where id=p_binding;

  perform clara._audit(c.firm,c.actor,null,null,
    'sign_vendor_identity_binding',null,
    jsonb_build_object('binding_id',p_binding,'client_id',b.client_id,
      'counterparty_id',b.counterparty_id,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_binding.signed',b.client_id,c.actor,
    null,null,null,null,null,
    jsonb_build_object('binding_id',p_binding,
      'counterparty_id',b.counterparty_id));
  return clara._finish_op(c.firm,'sign_vendor_identity_binding',p_op_key,
    jsonb_build_object('binding_id',p_binding,'status','live')
      || (v_derived - 'client_id' - 'counterparty_id'));
end
$$;

create function clara.revoke_vendor_identity_binding(
  p_binding uuid,
  p_reason text,
  p_op_key text
) returns jsonb
language plpgsql security definer
set search_path to clara,pg_temp
as $$
declare
  c record; v_dedupe jsonb; b record; v_posted int;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_binding is null then
    raise exception 'binding is required' using errcode='CLR10';
  end if;
  if nullif(btrim(p_reason),'') is null then
    raise exception 'revocation reason is required' using errcode='CLR36';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_vendor_identity_binding',p_op_key,
    clara._hash(jsonb_build_object(
      'binding_id',p_binding,'reason',btrim(p_reason))));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into b
  from clara.vendor_identity_bindings
  where id=p_binding
  for update;
  if not found or b.firm_id<>c.firm then
    raise exception 'binding not found' using errcode='CLR11';
  end if;
  if b.status='revoked' then
    raise exception 'binding_revoked' using errcode='CLR36';
  end if;
  if b.status<>'live' then
    raise exception 'binding_not_live' using errcode='CLR36';
  end if;

  update clara.vendor_identity_bindings
    set status='revoked',revoked_by=c.actor,revoked_at=now(),
        revoke_reason=btrim(p_reason)
  where id=p_binding;

  select count(*)::int into v_posted
  from clara.journal_entries
  where vendor_binding_id=p_binding and status='approved';

  perform clara._audit(c.firm,c.actor,null,null,
    'revoke_vendor_identity_binding',null,
    jsonb_build_object('binding_id',p_binding,'client_id',b.client_id,
      'counterparty_id',b.counterparty_id,'reason',btrim(p_reason),
      'approved_entries',v_posted,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_binding.revoked',b.client_id,c.actor,
    null,null,null,null,null,
    jsonb_build_object('binding_id',p_binding,
      'counterparty_id',b.counterparty_id,'approved_entries',v_posted));
  return clara._finish_op(c.firm,'revoke_vendor_identity_binding',p_op_key,
    jsonb_build_object('binding_id',p_binding,'status','revoked',
      'approved_entries',v_posted));
end
$$;

-- =====================================================================
-- D. Auditor read surface.
-- =====================================================================

create function clara.list_vendor_bindings(p_client uuid)
returns table(
  binding_id uuid,
  counterparty_id uuid,
  counterparty_name text,
  status text,
  f1_vendor_name_norm text,
  f2_invoice_prefix text,
  registration_at_signing text,
  signed_by uuid,
  signed_at timestamptz,
  expires_at timestamptz,
  evidence_count int,
  resolution_count int,
  divergence_documents int
)
language plpgsql stable security definer
set search_path to clara,pg_temp
as $$
declare c record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if not exists (
    select 1 from clara.clients where id=p_client and firm_id=c.firm
  ) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  return query
  select b.id,b.counterparty_id,cp.name,b.status,
    b.f1_vendor_name_norm,b.f2_invoice_prefix,b.registration_at_signing,
    b.signed_by,b.signed_at,b.expires_at,
    coalesce(ev.n,0),coalesce(rs.n,0),coalesce(rs.divergences,0)
  from clara.vendor_identity_bindings b
  join clara.counterparties cp
    on cp.id=b.counterparty_id
   and cp.firm_id=b.firm_id
   and cp.client_id=b.client_id
  left join lateral (
    select count(*)::int as n
    from clara.vendor_identity_binding_evidence x
    where x.binding_id=b.id
  ) ev on true
  left join lateral (
    select count(*)::int as n,
      count(distinct x.document_id) filter (
        where x.outcome='divergence'
          and x.created_at>=now()-interval '30 days'
      )::int as divergences
    from clara.vendor_binding_resolutions x
    where x.binding_id=b.id
  ) rs on true
  where b.client_id=p_client and b.firm_id=c.firm
  order by (b.status='live') desc,b.created_at desc;
end
$$;

create function clara.get_vendor_binding(p_binding uuid) returns jsonb
language plpgsql stable security definer
set search_path to clara,pg_temp
as $$
declare c record; b record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  select x.* into b
  from clara.vendor_identity_bindings x
  where x.id=p_binding and x.firm_id=c.firm;
  if not found then
    raise exception 'binding not in your firm' using errcode='CLR11';
  end if;
  return jsonb_build_object(
    'binding',to_jsonb(b),
    'counterparty',(select jsonb_build_object(
      'counterparty_id',cp.id,'counterparty_name',cp.name)
      from clara.counterparties cp where cp.id=b.counterparty_id),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object(
      'entry_id',ev.entry_id,'document_id',ev.document_id,
      'facts_extraction_id',ev.facts_extraction_id,
      'ocr_extraction_id',ev.ocr_extraction_id,
      'posting_date',j.posting_date
    ) order by j.approved_at desc,j.id desc)
      from clara.vendor_identity_binding_evidence ev
      join clara.journal_entries j on j.id=ev.entry_id
      where ev.binding_id=b.id),'[]'::jsonb),
    'resolutions',coalesce((select jsonb_agg(jsonb_build_object(
      'resolution_id',r.id,'document_id',r.document_id,'entry_id',r.entry_id,
      'phase',r.phase,'outcome',r.outcome,
      'facts_extraction_id',r.facts_extraction_id,
      'ocr_extraction_id',r.ocr_extraction_id,
      'compared_to_resolution_id',r.compared_to_resolution_id,
      'refusal_reason',r.refusal_reason,'divergence',r.divergence,
      'created_at',r.created_at
    ) order by r.created_at,r.id)
      from clara.vendor_binding_resolutions r
      where r.binding_id=b.id),'[]'::jsonb)
  );
end
$$;

-- =====================================================================
-- E. Fail-closed live-catalog recuts. Only the named fragments move.
-- =====================================================================

do $cor$
declare
  v_def text; v_next text; v_anchor text; v_count int;
begin
  -- Slot A. The PRE-0028 body caught CLR23 around both _resolve_counterparty
  -- and the birth branch, so registration_conflict jumped past Slot A
  -- completely. Replace that whole catalog-derived block: only the ordinary
  -- resolver call is caught, then birth or a parsed registration-conflict
  -- candidate reaches the one binding resolver call below.
  select pg_get_functiondef(
    'clara._coding_lane_core(uuid,uuid)'::regprocedure) into v_def;
  v_anchor:=$old$  if v_vendor is null then
    v_reasons:=array_append(v_reasons,'vendor_unresolved');
  else
    begin
      v_fp:=clara._resolve_counterparty(p_client,
        jsonb_build_object('kind',v_kind,'new',case when v_vendor_reg is not null
          then jsonb_build_object('name',v_vendor,'registration_no',v_vendor_reg)
          else jsonb_build_object('name',v_vendor) end));
      if v_fp->>'decision'='birth' then
        v_reasons:=array_append(v_reasons,'vendor_unresolved');
      else
        v_counterparty:=(v_fp->>'counterparty_id')::uuid;
      end if;
    exception when sqlstate 'CLR23' then
      v_reasons:=array_append(v_reasons,'vendor_ambiguous'); v_hard:=true;
    end;
  end if;$old$;
  v_count:=(length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _coding_lane_core vendor-resolution anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,v_anchor,$new$  if v_vendor is null then
    v_reasons:=array_append(v_reasons,'vendor_unresolved');
  else
    declare
      v_page_candidate uuid;
      v_binding_result jsonb;
      v_resolution_refused boolean:=false;
    begin
      v_fp:=null;
      begin
        v_fp:=clara._resolve_counterparty(p_client,
          jsonb_build_object('kind',v_kind,'new',case when v_vendor_reg is not null
            then jsonb_build_object('name',v_vendor,'registration_no',v_vendor_reg)
            else jsonb_build_object('name',v_vendor) end));
      exception when sqlstate 'CLR23' then
        declare
          v_detail text;
          v_detail_j jsonb;
        begin
          get stacked diagnostics v_detail=pg_exception_detail;
          begin
            v_detail_j:=nullif(v_detail,'')::jsonb;
          exception when others then
            v_detail_j:=null;
          end;
          if coalesce(v_detail_j->>'reason','')<>'registration_conflict' then
            v_reasons:=array_append(v_reasons,'vendor_ambiguous');
            v_hard:=true;
            v_resolution_refused:=true;
          else
            begin
              v_page_candidate:=nullif(
                v_detail_j->>'candidate_id','')::uuid;
            exception when others then
              v_page_candidate:=null;
            end;
            if v_page_candidate is null then
              v_reasons:=array_append(v_reasons,'vendor_ambiguous');
              v_hard:=true;
              v_resolution_refused:=true;
            end if;
          end if;
        end;
      end;

      if v_resolution_refused then
        null;
      elsif v_fp is not null and v_fp->>'decision'<>'birth' then
        v_counterparty:=(v_fp->>'counterparty_id')::uuid;
      else
        v_binding_result:=clara._resolve_vendor_binding(
          p_client,f.document_id,v_page_candidate);
        if v_binding_result->>'outcome'='bound' then
          v_counterparty:=(v_binding_result->>'counterparty_id')::uuid;
          v_reasons:=array_append(v_reasons,'vendor_bound');
        elsif v_page_candidate is not null then
          -- Reached via registration_conflict (a name-only match against an
          -- ALREADY-REGISTERED vendor), but the binding did not confirm it --
          -- fall back to the SAME pre-existing safe default a name-only match
          -- against a registered vendor has always produced, whether Slot A
          -- said 'unresolved' (no live binding at all) or 'ambiguous' (an F1
          -- collision or F2 mismatch on one candidate): the underlying page
          -- fact (a known name, unconfirmed legal entity) is identical either
          -- way, and a vendor with no binding must see byte-identical
          -- behavior to before this migration (wave-a1-vendor-registration's
          -- own regression coverage pins this).
          v_reasons:=array_append(v_reasons,'vendor_ambiguous');
          v_hard:=true;
        elsif v_binding_result->>'outcome'='ambiguous' then
          -- Reached via genuine birth (a name matching no registered
          -- counterparty at all) but multiple live bindings independently
          -- match it -- a situation with no pre-existing reason to preserve,
          -- since it could not occur before this migration.
          v_reasons:=array_append(v_reasons,'binding_ambiguous');
          v_hard:=true;
        else
          v_reasons:=array_append(v_reasons,'vendor_unresolved');
        end if;
      end if;
    end;
  end if;$new$);
  v_anchor:=$old$  elsif coalesce(array_length(array_remove(v_reasons,'rule_backed'),1),0)=0 then lane:='ready';$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _coding_lane_core readiness anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,
    $new$  elsif coalesce(array_length(array_remove(array_remove(v_reasons,'rule_backed'),'vendor_bound'),1),0)=0 then lane:='ready';$new$);
  execute v_next;

  -- Slot B: agent drafts re-resolve, override births, refuse a different existing
  -- party, stamp the binding, write the append-only draft receipt, and disclose the
  -- override in the returned receipt. The human path never enters this branch.
  select pg_get_functiondef(
    'clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure)
    into v_def;
  v_anchor:='  v_rule record; v_rule_counterparty uuid; v_rule_decision uuid; v_proposal jsonb; v_kind text;';
  v_count:=(length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _draft_entry_core declaration anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,v_anchor,
    v_anchor||E'\n  v_binding_counterparty uuid; v_vendor_binding uuid; v_binding_override boolean:=false;\n  v_facts_extraction uuid; v_ocr_extraction uuid;');

  v_anchor:=$old$  v_kind := coalesce(nullif(btrim(p_proposed_counterparty->>'kind'),''),
    case when p_coding_kind in ('sales_invoice','sales_credit_note') then 'customer' else 'vendor' end);
  v_proposal := case when p_proposed_counterparty is null or v_kind='vendor'
    then p_proposed_counterparty
    else p_proposed_counterparty || jsonb_build_object('kind',v_kind) end;
  v_fingerprint := clara._resolve_counterparty(p_client,v_proposal);$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _draft_entry_core proposal anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$  v_kind := coalesce(nullif(btrim(p_proposed_counterparty->>'kind'),''),
    case when p_coding_kind in ('sales_invoice','sales_credit_note') then 'customer' else 'vendor' end);
  v_proposal := case when p_proposed_counterparty is null or v_kind='vendor'
    then p_proposed_counterparty
    else p_proposed_counterparty || jsonb_build_object('kind',v_kind) end;
  if not p_is_human and p_document is not null and v_kind='vendor' then
    -- Slot B is a second production resolver caller (the original task design's
    -- "exactly one" inventory missed it). Re-establish A.1 condition 5 here as
    -- well, so the new page-candidate parameter cannot be bypassed by drafting.
    declare
      v_page_vendor text;
      v_page_candidate uuid;
      v_page_fp jsonb;
      v_binding_result jsonb;
      v_explicit_counterparty uuid;
      v_explicit_canonical uuid;
      v_condition_five boolean:=false;
    begin
      select nullif(btrim(min(dr.text_content)),'') into v_page_vendor
      from clara.document_regions dr
      where dr.extraction_id=(
        select x.id from clara.document_extractions x
        where x.document_id=p_document
          and x.engine_kind='invoice_facts' and x.status='done'
        order by x.version_n desc,x.id desc limit 1
      ) and dr.field_path='invoice.vendor_name';
      if v_page_vendor is not null then
        begin
          v_page_fp:=clara._resolve_counterparty(p_client,
            jsonb_build_object('kind','vendor','new',
              jsonb_build_object('name',v_page_vendor)));
          v_condition_five:=v_page_fp is not null
            and v_page_fp->>'decision'='birth';
        exception
          when sqlstate 'CLR21' then
            v_condition_five:=false;
          when sqlstate 'CLR23' then
            declare
              v_detail text;
              v_detail_j jsonb;
            begin
              get stacked diagnostics v_detail=pg_exception_detail;
              begin
                v_detail_j:=nullif(v_detail,'')::jsonb;
              exception when others then
                v_detail_j:=null;
              end;
              if coalesce(v_detail_j->>'reason','')='registration_conflict' then
                begin
                  v_page_candidate:=nullif(
                    v_detail_j->>'candidate_id','')::uuid;
                exception when others then
                  v_page_candidate:=null;
                end;
                v_condition_five:=v_page_candidate is not null;
              end if;
            end;
        end;
      end if;
      if v_condition_five then
        v_binding_result:=clara._resolve_vendor_binding(
          p_client,p_document,v_page_candidate);
      end if;
      if v_binding_result->>'outcome'='bound' then
        v_binding_counterparty:=
          (v_binding_result->>'counterparty_id')::uuid;
        v_vendor_binding:=(v_binding_result->>'binding_id')::uuid;
        -- The production tool schema admits both {existing_id} and {new:{...}}.
        -- Only existing_id is an explicit identity choice. Compare that choice
        -- directly; every `new` shape still defers identity to Slot B, including
        -- the common bare clean-name proposal that raised registration_conflict
        -- above and MUST NOT be sent through the raw resolver a second time.
        if v_proposal?'existing_id' then
          begin
            v_explicit_counterparty:=
              (v_proposal->>'existing_id')::uuid;
          exception when others then
            raise exception 'counterparty proposal is malformed'
              using errcode='CLR21',
                detail='{"reason":"vendor_malformed"}';
          end;
          v_explicit_canonical:=clara._canonical_counterparty(
            p_client,v_explicit_counterparty);
          if v_explicit_canonical
              is distinct from v_binding_counterparty then
            raise exception 'vendor_binding_conflict'
              using errcode='CLR23',
                detail=jsonb_build_object(
                  'reason','vendor_binding_conflict',
                  'binding_counterparty',v_binding_counterparty,
                  'proposed_counterparty',
                    v_explicit_counterparty)::text;
          end if;
        else
          v_binding_override:=true;
        end if;
        v_proposal:=jsonb_build_object(
          'existing_id',v_binding_counterparty,'kind','vendor');
        v_fingerprint:=clara._resolve_counterparty(
          p_client,v_proposal);
      end if;
    end;
  end if;
  if v_fingerprint is null then
    v_fingerprint := clara._resolve_counterparty(p_client,v_proposal);
  end if;$new$);

  v_anchor:=$old$        proposed_counterparty,match_fingerprint,coding_kind,closing_transfer)
      values(p_client,'draft',p_posting_date,p_memo,v_origin,p_document,v_filing,
        p_sha256,p_resolution,false,
        coalesce((p_flags->>'is_year_end')::boolean,false),
        coalesce((p_flags->>'tax_affecting')::boolean,false),p_actor,
        case when p_is_human then p_actor end,
        v_proposal,v_fingerprint,p_coding_kind,
        coalesce((p_flags->>'closing_transfer')::boolean,false))$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _draft_entry_core insert anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$        proposed_counterparty,match_fingerprint,coding_kind,closing_transfer,
        vendor_binding_id)
      values(p_client,'draft',p_posting_date,p_memo,v_origin,p_document,v_filing,
        p_sha256,p_resolution,false,
        coalesce((p_flags->>'is_year_end')::boolean,false),
        coalesce((p_flags->>'tax_affecting')::boolean,false),p_actor,
        case when p_is_human then p_actor end,
        v_proposal,v_fingerprint,p_coding_kind,
        coalesce((p_flags->>'closing_transfer')::boolean,false),
        v_vendor_binding)$new$);

  v_anchor:=$old$  insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
      credit_cents,description)
    select v_entry,x.idx,(x.elem->>'account_code'),
      (x.elem->>'debit_cents')::bigint,(x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem,idx);
  perform clara._assert_balanced(v_entry);$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _draft_entry_core line-stamp anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$  insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
      credit_cents,description)
    select v_entry,x.idx,(x.elem->>'account_code'),
      (x.elem->>'debit_cents')::bigint,(x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem,idx);
  if v_vendor_binding is not null then
    update clara.journal_lines l
      set counterparty_id=v_binding_counterparty
    from clara.coa_accounts a
    where l.entry_id=v_entry
      and a.client_id=l.client_id
      and a.account_code=l.account_code
      and a.account_class in ('payable','receivable');
  end if;
  perform clara._assert_balanced(v_entry);$new$);

  v_anchor:=$old$  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,'draft_entry',v_entry,
    jsonb_build_object('client',p_client,'filing',v_filing,'task',v_task,'op_key',p_op_key));$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _draft_entry_core audit anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$  if v_vendor_binding is not null then
    select x.id into v_facts_extraction
    from clara.document_extractions x
    where x.document_id=p_document
      and x.engine_kind='invoice_facts' and x.status='done'
    order by x.version_n desc,x.id desc limit 1;
    select x.id into v_ocr_extraction
    from clara.document_extractions x
    where x.document_id=p_document
      and x.engine_kind='ocr' and x.status='done'
    order by x.version_n desc,x.id desc limit 1;
    insert into clara.vendor_binding_resolutions(
      binding_id,firm_id,client_id,document_id,entry_id,phase,
      facts_extraction_id,ocr_extraction_id,entry_revision_token,
      raw_proposal,outcome
    ) values (
      v_vendor_binding,p_firm,p_client,p_document,v_entry,'draft',
      v_facts_extraction,v_ocr_extraction,v_token,
      coalesce(p_proposed_counterparty,'{}'::jsonb),'bound'
    );
  end if;

  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,'draft_entry',v_entry,
    jsonb_build_object('client',p_client,'filing',v_filing,'task',v_task,'op_key',p_op_key));$new$);

  v_anchor:=$old$  v_seq := clara._append_event(p_firm,'entry.drafted',p_client,p_actor,p_obo,p_wake_kind,
    v_entry,p_document,p_resolution,'{}'::jsonb);
  if not p_is_human then
    perform clara.assert_books_current(p_firm,p_client,p_books_version,v_seq);
  end if;$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _draft_entry_core event-order anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$  v_seq := clara._append_event(p_firm,'entry.drafted',p_client,p_actor,p_obo,p_wake_kind,
    v_entry,p_document,p_resolution,'{}'::jsonb);
  if v_vendor_binding is not null then
    perform clara._append_event(p_firm,'counterparty.binding_resolved',
      p_client,p_actor,p_obo,p_wake_kind,v_entry,p_document,p_resolution,
      jsonb_build_object('binding_id',v_vendor_binding,
        'counterparty_id',v_binding_counterparty,'phase','draft',
        'binding_override',v_binding_override));
  end if;
  if not p_is_human then
    perform clara.assert_books_current(p_firm,p_client,p_books_version,v_seq);
  end if;$new$);

  v_anchor:=$old$  return clara._finish_op(p_firm,'draft_entry',p_op_key,v_receipt);$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _draft_entry_core receipt anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$  if v_vendor_binding is not null then
    v_receipt:=v_receipt||jsonb_build_object(
      'vendor_binding_id',v_vendor_binding,
      'binding_override',v_binding_override);
  end if;
  return clara._finish_op(p_firm,'draft_entry',p_op_key,v_receipt);$new$);
  execute v_next;

  -- Human revision divergence: the human always wins, while both the binding
  -- marker and the machine-lane coding_kind are stripped in the same UPDATE.
  select pg_get_functiondef(
    'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)'::regprocedure)
    into v_def;
  v_anchor:='  v_lines_in jsonb; v_flags_in jsonb; v_ct boolean;';
  v_count:=(length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: revise_entry declaration anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,v_anchor,
    v_anchor||E'\n  v_binding_counterparty uuid; v_human_counterparty uuid;\n  v_binding_divergence boolean:=false; v_facts_extraction uuid; v_ocr_extraction uuid;');

  v_anchor:=$old$  v_fingerprint:=clara._resolve_counterparty(e.client_id,v_proposal);
  v_lines:=clara._validate_entry_lines(e.client_id,v_lines_in);$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: revise_entry resolution anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$  v_fingerprint:=clara._resolve_counterparty(e.client_id,v_proposal);
  if e.vendor_binding_id is not null then
    select b.counterparty_id into v_binding_counterparty
    from clara.vendor_identity_bindings b
    where b.id=e.vendor_binding_id;
    if v_fingerprint is not null and v_fingerprint->>'decision'<>'birth' then
      v_human_counterparty:=clara._canonical_counterparty(
        e.client_id,(v_fingerprint->>'counterparty_id')::uuid);
    end if;
    v_binding_divergence:=v_binding_counterparty is not null
      and v_human_counterparty is distinct from v_binding_counterparty;
  end if;
  v_lines:=clara._validate_entry_lines(e.client_id,v_lines_in);$new$);

  v_anchor:=$old$  update clara.journal_entries set closing_transfer=coalesce(v_ct,closing_transfer),
    proposed_counterparty=v_proposal,
    match_fingerprint=v_fingerprint,last_human_editor=c.actor,flags=v_new_flags,
    revision_token=gen_random_uuid(),updated_at=now() where id=p_entry
    returning revision_token into v_token;$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: revise_entry update anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$  update clara.journal_entries set closing_transfer=coalesce(v_ct,closing_transfer),
    proposed_counterparty=v_proposal,
    match_fingerprint=v_fingerprint,last_human_editor=c.actor,flags=v_new_flags,
    coding_kind=case when v_binding_divergence then null else coding_kind end,
    vendor_binding_id=case when v_binding_divergence then null else vendor_binding_id end,
    revision_token=gen_random_uuid(),updated_at=now() where id=p_entry
    returning revision_token into v_token;
  if v_binding_divergence then
    select x.id into v_facts_extraction
    from clara.document_extractions x
    where x.document_id=e.document_id
      and x.engine_kind='invoice_facts' and x.status='done'
    order by x.version_n desc,x.id desc limit 1;
    select x.id into v_ocr_extraction
    from clara.document_extractions x
    where x.document_id=e.document_id
      and x.engine_kind='ocr' and x.status='done'
    order by x.version_n desc,x.id desc limit 1;
    insert into clara.vendor_binding_resolutions(
      binding_id,firm_id,client_id,document_id,entry_id,phase,
      facts_extraction_id,ocr_extraction_id,entry_revision_token,
      raw_proposal,outcome,divergence
    ) values (
      e.vendor_binding_id,e.firm_id,e.client_id,e.document_id,e.id,'revision',
      v_facts_extraction,v_ocr_extraction,v_token,'{}'::jsonb,'divergence',
      jsonb_build_object('human_counterparty',v_human_counterparty,
        'human_proposal',v_proposal,'actor',c.actor)
    );
  end if;$new$);

  v_anchor:=$old$  perform clara._append_event(c.firm,'entry.revised',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: revise_entry event anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$  if v_binding_divergence then
    perform clara._append_event(c.firm,'counterparty.binding_resolved',
      e.client_id,c.actor,null,null,p_entry,e.document_id,null,
      jsonb_build_object('binding_id',e.vendor_binding_id,
        'counterparty_id',v_human_counterparty,'phase','revision',
        'outcome','divergence'));
  end if;
  perform clara._append_event(c.firm,'entry.revised',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);$new$);
  execute v_next;

  -- The immutable-entry trigger permits exactly the two divergence-cleared columns.
  select pg_get_functiondef(
    'clara._tf_entry_immutable()'::regprocedure) into v_def;
  v_anchor:=$old$    v_allowed := array['revision_token','updated_at','proposed_counterparty',
                       'match_fingerprint','last_human_editor','flags','closing_transfer'];$old$;
  v_count:=(length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: _tf_entry_immutable allowlist anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,v_anchor,$new$    v_allowed := array['revision_token','updated_at','proposed_counterparty',
                       'match_fingerprint','last_human_editor','flags','closing_transfer',
                       'coding_kind','vendor_binding_id'];$new$);
  execute v_next;

  -- Draft review warning is nested under the existing counterparty object and
  -- appears only for binding-backed drafts; unbound payloads remain unchanged.
  select pg_get_functiondef(
    'clara.get_draft_review(uuid,uuid)'::regprocedure) into v_def;
  v_anchor:='  v_name_n text; v_reg_n text; v_alias boolean; v_agent boolean:=false;';
  v_count:=(length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: get_draft_review declaration anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,v_anchor,
    v_anchor||E'\n  v_binding_warning jsonb;');
  v_anchor:=$old$  return v_result;
end $function$$old$;
  v_count:=(length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: get_draft_review return anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,v_anchor,$new$  if e.vendor_binding_id is not null then
    select jsonb_build_object(
      'vendor_binding_id',b.id,
      'signed_by',b.signed_by,
      'counterparty_id',cpb.id,
      'counterparty_name',cpb.name
    ) into v_binding_warning
    from clara.vendor_identity_bindings b
    join clara.counterparties cpb on cpb.id=b.counterparty_id
    where b.id=e.vendor_binding_id;
    if v_binding_warning is not null then
      v_result:=jsonb_set(v_result,'{counterparty,binding}',v_binding_warning,true);
    end if;
  end if;
  return v_result;
end $function$$new$);
  execute v_next;

  -- The executor recut in 0028 is ONLY the approved skip-vocabulary split.
  select pg_get_functiondef(
    'clara.execute_rule_post(uuid,text)'::regprocedure) into v_def;
  v_anchor:=$old$  if e.coding_kind is null or e.document_id is null or e.proposed_counterparty is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_eligible_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_eligible_shape');
  end if;$old$;
  v_count:=(length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: execute_rule_post eligibility anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,v_anchor,$new$  if e.coding_kind is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'ineligible_no_coding_kind');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','ineligible_no_coding_kind');
  end if;
  if e.document_id is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'ineligible_no_document');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','ineligible_no_document');
  end if;
  if e.proposed_counterparty is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'ineligible_no_counterparty');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','ineligible_no_counterparty');
  end if;$new$);
  execute v_next;

  -- A.7 amendment: acquire documents before the existing filing/entry sweep.
  -- The insertion is after the not-found/lane guard so the pre-existing FOUND
  -- test remains byte-identical and cannot be overwritten by PERFORM.
  select pg_get_functiondef(
    'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure)
    into v_def;
  v_anchor:=$old$  if not found or t.lane not in ('invoice_facts','local_facts') then
    raise exception 'invoice-facts task not found' using errcode='CLR16';
  end if;
  if t.status='done' then$old$;
  v_count:=(length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count<>1 then
    raise exception '0028: persist_invoice_facts lock anchor drift (%)',v_count
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,v_anchor,$new$  if not found or t.lane not in ('invoice_facts','local_facts') then
    raise exception 'invoice-facts task not found' using errcode='CLR16';
  end if;
  perform 1 from clara.documents where id=t.document_id for update;
  if t.status='done' then$new$);
  execute v_next;
end
$cor$;

-- =====================================================================
-- F. Exact ACL surface.
-- =====================================================================

revoke all on function clara._tf_vendor_identity_binding_update() from public;
revoke all on function clara._binding_normalize(text) from public;
revoke all on function clara._binding_f3_holds(uuid,text,text) from public;
revoke all on function clara._resolve_vendor_binding(uuid,uuid,uuid) from public;
revoke all on function clara._binding_common_prefix(text,text,text) from public;
revoke all on function clara._derive_vendor_binding_proposal(uuid,uuid,uuid) from public;

revoke all on function clara.propose_vendor_identity_binding(jsonb,text)
  from public, clara_agent_ro, clara_runtime, clara_wake_interactive, clara_wake_proactive;
revoke all on function clara.sign_vendor_identity_binding(uuid,text)
  from public, clara_agent_ro, clara_runtime, clara_wake_interactive, clara_wake_proactive;
revoke all on function clara.revoke_vendor_identity_binding(uuid,text,text)
  from public, clara_agent_ro, clara_runtime, clara_wake_interactive, clara_wake_proactive;
revoke all on function clara.list_vendor_bindings(uuid)
  from public, clara_agent_ro, clara_runtime, clara_wake_interactive, clara_wake_proactive;
revoke all on function clara.get_vendor_binding(uuid)
  from public, clara_agent_ro, clara_runtime, clara_wake_interactive, clara_wake_proactive;

grant execute on function clara.propose_vendor_identity_binding(jsonb,text)
  to clara_authenticated;
grant execute on function clara.sign_vendor_identity_binding(uuid,text)
  to clara_authenticated;
grant execute on function clara.revoke_vendor_identity_binding(uuid,text,text)
  to clara_authenticated;
grant execute on function clara.list_vendor_bindings(uuid)
  to clara_authenticated;
grant execute on function clara.get_vendor_binding(uuid)
  to clara_authenticated;

reset role;

-- =====================================================================
-- G. Event taxonomy additions against the active taxonomy version.
-- =====================================================================

with added(name,client_scoped,description,decision,note) as (values
  ('kb_binding.proposed',true,
    'A vendor identity binding was proposed','notification',null::text),
  ('kb_binding.signed',true,
    'A vendor identity binding was signed','ignore',null::text),
  ('kb_binding.revoked',true,
    'A vendor identity binding was revoked','ignore',null::text),
  ('counterparty.binding_resolved',true,
    'A draft or revision recorded a vendor binding resolution','ignore',null::text)
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note
from added x
join inserted_types i on i.name=x.name
cross join clara.taxonomy_active a;

-- =====================================================================
-- H. In-transaction structural tail. The deploy postverify repeats these
-- claims from outside the migration transaction.
-- =====================================================================

do $tail$
declare v_n int; v_src text;
begin
  select count(*)::int into v_n
  from pg_class c
  where c.oid in (
    'clara.vendor_identity_bindings'::regclass,
    'clara.vendor_identity_binding_evidence'::regclass,
    'clara.vendor_binding_resolutions'::regclass
  ) and c.relrowsecurity and c.relforcerowsecurity;
  if v_n<>3 then
    raise exception '0028 tail: binding tables are not all FORCE RLS'
      using errcode='CLR10';
  end if;

  select pg_get_functiondef(
    'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure)
    into v_src;
  v_src:=regexp_replace(
    regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
    '--[^\n]*','','g');
  if position('0029_vendor_binding_executor' in v_src)=0
     or position('post_control_absent' in v_src)=0 then
    raise exception '0028 tail: signing interlock is absent'
      using errcode='CLR10';
  end if;

  if not exists (
    select 1 from clara.event_types
    where name='kb_binding.signed'
  ) or not exists (
    select 1 from clara.trigger_taxonomy t
    join clara.taxonomy_active a on a.version=t.version and a.singleton
    where t.event_type='kb_binding.signed'
  ) then
    raise exception '0028 tail: binding taxonomy is incomplete'
      using errcode='CLR10';
  end if;

  raise notice '0028: vendor identity binding authority, ceremony, Slots A/B, divergence/read surfaces, skip split, and facts lock hoist installed; Slot C remains interlocked behind 0029_vendor_binding_executor';
end
$tail$;
