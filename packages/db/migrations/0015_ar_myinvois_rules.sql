-- 0015_ar_myinvois_rules.sql — Wave-A2: sales-invoice/AR + MyInvois XML local
-- engine + SST split + CN/DN posting + human-signed bounded auto-POST (standing
-- rules). Companion: docs/plan/wave-a2-migration-0015-design.md (S0..S8);
-- contract: docs/plan/wave-a2-ar-myinvois-contract.md v1.0.
--
-- House CoR law throughout: same-arity `create or replace` under
-- `set role clara_fn_owner`, ACLs preserved (Postgres keeps the ACL across a
-- same-arity create-or-replace), tail `do $$` assertions. NEVER change arity —
-- new inputs ride existing jsonb params. One migration = one transaction (the
-- runner supplies it). THROWAWAY-VALIDATED ONLY — never hand-applied to a live
-- project. Validate on a scratch PG17 before anything live.
--
-- Section map (companion S0..S8):
--   S0  AB-3 re-probe + PERMANENT field_path collision assertion.
--   S1  CHECK widenings (kind/account_class/coding_kind/actor_kind/lane) +
--       journal_entries.checked_via_rule_id + lane<->engine CHECK + retire the
--       finalize_document_intake 'fixture-engine' default + special_acc_type.
--   S2  counterparty uniqueness kind-scoping.
--   S3  coding_rules posting tier + sign/propose_autopost_rule + reconcile.
--   S4  rule_post_runs / rule_post_skips / acknowledge_rule_posts / feed reads.
--   S5  approve core split (_approve_entry_core) + execute_rule_post (login-direct).
--   S6  facts vocabulary + writers + the LANE-keyed egress claim gate + direction.
--   S7  AR books (resolve/draft/revise/shape/merge/lane/diff, all kind/direction).
--   S8  tail assertions.
--
-- **AB-3 GATE CHANGE (deliberate, Lane-C coordination — LOAD-BEARING):** the
-- attribution matcher's SSM arm is EXTENDED to also match `%brn%` field_paths. A
-- Malaysian client is frequently identified by SSM/BRN with NO TIN on file (RPR =
-- SSM 202501005621), and the pinned identity key `myinvois.supplier_brn` contains
-- no "ssm" — so without this a registered client would be UNREACHABLE from its own
-- sales e-invoice. `record_rule_resolution`'s CTE gains the `%brn%` alternative on
-- the ssm arm; the #3 write-gate ADDS `%brn%` to its refused-pattern set (allowlist
-- unchanged: {myinvois.supplier_tin, myinvois.supplier_brn}); S0's collision
-- assertion covers `%brn%`. `client_identifiers.kind='ssm'` still carries BRN values.
--
-- Errcodes: CLR30 direction_unresolved (new); reuse CLR10 (sst_account_missing,
-- structural malformed), CLR21 (tax_tie_failed / duplicate_sales — amount/dup
-- family), CLR23 (shape/registration), CLR27 (autopost rule lifecycle), CLR03
-- (agent-ack refusal), CLR05 (high-stakes), CLR16 (task state), CLR28 (egress hold).

-- =====================================================================
-- S0 — AB-3 FIRST. Re-run the 0011 invoice_facts collision probe against the
-- LIVE (unchanged) record_rule_resolution, then assert the NEW facts vocabulary
-- keys cannot collide with the attribution matcher's %tin%/%ssm%/%account%
-- patterns (except the two DELIBERATE supplier identity keys). PERMANENT (L5):
-- every future migration touching the facts vocabulary re-runs this block.
-- =====================================================================

-- (S0.a) The rollback probe: a real colliding invoice_facts region must stay
-- invisible to attribution (record_rule_resolution reads only ocr/structured_parse).
do $$
declare
  v_firm uuid:=gen_random_uuid(); v_user uuid:=gen_random_uuid();
  v_client uuid:=gen_random_uuid(); v_document uuid:=gen_random_uuid();
  v_extraction uuid:=gen_random_uuid(); v_sha text:=repeat('b',64); v_result jsonb;
begin
  begin
    insert into clara.firms(id,name) values(v_firm,'0015 AB-3 probe');
    insert into clara.users(id,display_name,email) values(v_user,'0015 AB-3 probe',
      '0015-ab3-'||v_user||'@invalid.example');
    insert into clara.firm_memberships(firm_id,user_id,role) values(v_firm,v_user,'owner');
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user)::text,true);
    insert into clara.clients(id,firm_id,name) values(v_client,v_firm,'0015 AB-3 client');
    insert into clara.documents(id,firm_id,sha256,original_filename,mime_type,byte_size,
        storage_path,uploaded_by,bytes_verified_at)
      values(v_document,v_firm,v_sha,'ab3.xml','application/xml',1,
        'firms/'||v_firm||'/docs/'||v_sha||'.xml',v_user,now());
    insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
      values(v_firm,v_client,'tin','pinab3x',v_user);
    insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,
        version_n,status,page_count)
      values(v_extraction,v_firm,v_document,'0015-ab3','invoice_facts',1,'done',1);
    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,
        field_path,text_content,engine_confidence)
      values(v_firm,v_extraction,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
        'supplier.tin','PINAB3X',1.0);
    v_result:=clara.record_rule_resolution(v_document,'0015-ab3-probe');
    if v_result->>'outcome'<>'abstained' or (v_result->>'match_count')::int<>0
       or exists(select 1 from clara.client_resolutions where subject_id=v_document
          and method='rule' and superseded_at is null) then
      raise exception '0015 AB-3 invoice_facts collision probe failed' using errcode='CLR10';
    end if;
    raise exception '0015 AB-3 probe rollback' using errcode='ZA015';
  exception when sqlstate 'ZA015' then null;
  end;
end $$;

-- (S0.b) The login-direct grant on record_rule_resolution is still intact and the
-- matcher CTE still reads ONLY ocr/structured_parse.
do $$
begin
  if not pg_catalog.has_function_privilege(
      'clara_runtime_login','clara.record_rule_resolution(uuid,text)','execute')
     or pg_catalog.has_function_privilege(
      'clara_runtime','clara.record_rule_resolution(uuid,text)','execute') then
    raise exception '0015 AB-3 login-direct record_rule_resolution grant was not preserved'
      using errcode='CLR10';
  end if;
  if position('engine_kind in (''ocr'',''structured_parse'')' in lower(
      (select p.prosrc from pg_proc p where p.oid=
        'clara.record_rule_resolution(uuid,text)'::regprocedure)))=0 then
    raise exception '0015 AB-3 engine predicate assertion failed' using errcode='CLR10';
  end if;
end $$;

-- (S0.c) PERMANENT vocabulary collision assertion. The facts-pass keys (§3.2) live
-- in engine_kind='invoice_facts' extractions (structurally invisible to the AB-3
-- matcher) AND are NAMED so none matches the attribution patterns. The identity
-- pass (structured_parse) intentionally carries EXACTLY two matching keys
-- (myinvois.supplier_tin / myinvois.supplier_brn — the supplier of a sales
-- e-invoice IS the client). invoice.customer_taxid is the load-bearing case: it
-- uses 'taxid' precisely to avoid '%tin%'.
do $$
declare v_key text; v_facts text[]:=array[
    'invoice.customer_name','invoice.customer_registration','invoice.customer_taxid',
    'invoice.type_code','invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
    'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid',
    'myinvois.buyer_id_primary'];
begin
  foreach v_key in array v_facts loop
    if lower(v_key) like '%tin%' or lower(v_key) like '%ssm%'
       or lower(v_key) like '%brn%' or lower(v_key) like '%account%' then
      raise exception '0015 facts vocabulary key % collides with an attribution pattern',v_key
        using errcode='CLR10';
    end if;
  end loop;
  -- the two deliberate supplier identity keys MUST match their intended arms (else
  -- attribution of a sales e-invoice's supplier=client silently breaks). supplier_brn
  -- rides the EXTENDED ssm arm via the %brn% alternative (Lane-C AB-3 change).
  if not ('myinvois.supplier_tin' like '%tin%' and 'myinvois.supplier_brn' like '%brn%') then
    raise exception '0015 supplier identity keys no longer match the attribution patterns'
      using errcode='CLR10';
  end if;
end $$;

-- =====================================================================
-- S1/S2 — TABLE DDL. Existing-table ALTERs run BARE (the migration/superuser
-- role) — a superuser can ALTER regardless of table ownership, which is the
-- robust superset of "the table-owner role, OUTSIDE clara_fn_owner" (companion
-- S1; the 0014 documents ALTER + the 0009 bare ALTERs). New tables (S3/S4) are
-- created UNDER clara_fn_owner further down (the 0011 pattern).
-- =====================================================================

-- (S1) counterparties.kind → ('vendor','customer'). The as-built inline CHECK is
-- system-named; drop it by DEFINITION so the drop is name-robust (0014 idiom).
do $$
declare v_con text;
begin
  select con.conname into v_con from pg_constraint con
  join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='clara' and c.relname='counterparties' and con.contype='c'
    and pg_get_constraintdef(con.oid) ilike '%kind%'
    and pg_get_constraintdef(con.oid) ilike '%vendor%';
  if v_con is null then
    raise exception '0015: counterparties kind check not found' using errcode='CLR10';
  end if;
  execute format('alter table clara.counterparties drop constraint %I',v_con);
end $$;
alter table clara.counterparties
  add constraint counterparties_kind_check check (kind in ('vendor','customer'));

-- (S2) counterparty uniqueness indexes gain `kind` in the key (a vendor and a
-- customer may share one SSM under a client — separate AP/AR subledgers). Pre-
-- assert no existing row would violate (all live rows are kind='vendor' — safe).
do $$
declare v_bad int;
begin
  select count(*)::int into v_bad from (
    select client_id,kind,registration_normalized from clara.counterparties
      where registration_normalized is not null
      group by client_id,kind,registration_normalized having count(*)>1) x;
  if v_bad<>0 then
    raise exception '0015 kind-scoped registration uniqueness pre-assert failed (% dup groups)',v_bad
      using errcode='CLR10';
  end if;
  select count(*)::int into v_bad from (
    select client_id,kind,name_normalized from clara.counterparties
      where registration_normalized is null
      group by client_id,kind,name_normalized having count(*)>1) x;
  if v_bad<>0 then
    raise exception '0015 kind-scoped unregistered-name uniqueness pre-assert failed (% dup groups)',v_bad
      using errcode='CLR10';
  end if;
end $$;
drop index clara.uq_counterparties_client_registration;
drop index clara.uq_counterparties_client_unregistered_name;
create unique index uq_counterparties_client_registration
  on clara.counterparties(client_id,kind,registration_normalized)
  where registration_normalized is not null;
create unique index uq_counterparties_client_unregistered_name
  on clara.counterparties(client_id,kind,name_normalized)
  where registration_normalized is null;

-- (S1) coa_accounts.account_class → (null,payable,receivable); special_acc_type →
-- (rounding,sst_output). account_class check is explicitly named; special_acc_type
-- is system-named (drop by definition). uq_coa_special is per (client, VALUE) so it
-- already admits one rounding AND one sst_output per client — no index change.
alter table clara.coa_accounts drop constraint ck_coa_account_class;
alter table clara.coa_accounts add constraint ck_coa_account_class check (
  account_class is null or account_class in ('payable','receivable'));
do $$
declare v_con text;
begin
  select con.conname into v_con from pg_constraint con
  join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='clara' and c.relname='coa_accounts' and con.contype='c'
    and pg_get_constraintdef(con.oid) ilike '%special_acc_type%';
  if v_con is null then
    raise exception '0015: coa_accounts special_acc_type check not found' using errcode='CLR10';
  end if;
  execute format('alter table clara.coa_accounts drop constraint %I',v_con);
end $$;
alter table clara.coa_accounts add constraint coa_accounts_special_acc_type_check check (
  special_acc_type is null or special_acc_type in ('rounding','sst_output'));

-- (S1) journal_entries.coding_kind widening + the checked_via_rule_id column.
alter table clara.journal_entries drop constraint ck_je_coding_kind;
alter table clara.journal_entries add constraint ck_je_coding_kind check (
  coding_kind is null or coding_kind in
    ('supplier_bill','sales_invoice','sales_credit_note'));
alter table clara.journal_entries
  add column checked_via_rule_id uuid,
  add constraint fk_je_checked_via_rule foreign key (checked_via_rule_id)
    references clara.coding_rules(id);

-- (S1) journal_entry_revisions.actor_kind → + 'rule' (the rule-post revision
-- actor). System-named inline CHECK — drop by definition (VERIFY-added pin).
do $$
declare v_con text;
begin
  select con.conname into v_con from pg_constraint con
  join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='clara' and c.relname='journal_entry_revisions' and con.contype='c'
    and pg_get_constraintdef(con.oid) ilike '%actor_kind%';
  if v_con is null then
    raise exception '0015: journal_entry_revisions actor_kind check not found' using errcode='CLR10';
  end if;
  execute format('alter table clara.journal_entry_revisions drop constraint %I',v_con);
end $$;
alter table clara.journal_entry_revisions add constraint journal_entry_revisions_actor_kind_check
  check (actor_kind in ('human','agent','facts','rule'));

-- (S1) document_processing_tasks.lane += 'local_facts' (the MyInvois facts pass
-- must NOT share lane='invoice_facts' with the frozen Azure consumer — dispatch is
-- lane-based + engine-blind) AND a NEW lane<->engine CHECK: egressing lanes bind
-- to azure-% engines, local lanes to clara-% engines. A test-namespace escape
-- (`clara-fixture:%`) is admitted on any lane (never produced in production) so the
-- retired finalize_document_intake default + rig fixtures apply.
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_0009;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_0015 check (
  lane in ('ocr','structured_parse','none','invoice_facts','local_facts'));
-- Pre-assert no existing task row violates the lane<->engine binding (a fresh
-- 0001->0015 apply carries ZERO task rows; every task insert lives inside a fn).
do $$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.document_processing_tasks t
  where not (
    t.engine_id like 'clara-fixture:%'
    or (t.lane in ('ocr','invoice_facts') and t.engine_id like 'azure-%')
    or (t.lane in ('structured_parse','local_facts','none') and t.engine_id like 'clara-%'));
  if v_bad<>0 then
    raise exception '0015 lane<->engine pre-assert failed: % existing task row(s) violate',v_bad
      using errcode='CLR10';
  end if;
end $$;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_engine_0015 check (
  engine_id like 'clara-fixture:%'
  or (lane in ('ocr','invoice_facts') and engine_id like 'azure-%')
  or (lane in ('structured_parse','local_facts','none') and engine_id like 'clara-%'));

-- (S3 DDL) coding_rules posting tier. rule_type += 'autopost'; the bound columns
-- (NOT NULL for autopost, NULL for vendor_account) + a self-FK genealogy. Preserve
-- uq_coding_rules_one_live_vendor EXACTLY (adversarial #12: no new index; direction
-- follows the counterparty kind under kind-scoped counterparties).
do $$
declare v_con text;
begin
  select con.conname into v_con from pg_constraint con
  join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='clara' and c.relname='coding_rules' and con.contype='c'
    and pg_get_constraintdef(con.oid) ilike '%rule_type%'
    and pg_get_constraintdef(con.oid) ilike '%vendor_account%';
  if v_con is null then
    raise exception '0015: coding_rules rule_type check not found' using errcode='CLR10';
  end if;
  execute format('alter table clara.coding_rules drop constraint %I',v_con);
end $$;
alter table clara.coding_rules add constraint coding_rules_rule_type_check
  check (rule_type in ('vendor_account','autopost'));
alter table clara.coding_rules
  add column amount_cap_cents bigint,
  add column frequency_window text,
  add column window_max_posts int,
  add column expires_at timestamptz,
  add column direction text,
  add column supersedes_rule_id uuid,
  add constraint fk_coding_rules_supersedes foreign key
    (supersedes_rule_id,firm_id,client_id)
    references clara.coding_rules(id,firm_id,client_id),
  add constraint ck_coding_rules_tier check (
    (rule_type='vendor_account' and amount_cap_cents is null and frequency_window is null
      and window_max_posts is null and expires_at is null and direction is null)
    or (rule_type='autopost' and amount_cap_cents is not null and amount_cap_cents>0
      and frequency_window is not null and window_max_posts is not null and window_max_posts>0
      and expires_at is not null and direction in ('purchase','sales')));

set role clara_fn_owner;

-- =====================================================================
-- S4 — RULE-POST SURFACES (the sweep_runs receipts pattern). Created UNDER
-- clara_fn_owner so the DEFINER writers reach them through the owner RLS policy.
-- =====================================================================

create table clara.rule_post_runs (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid not null,
  client_id        uuid not null,
  rule_id          uuid not null,
  entry_id         uuid not null,
  posted_at        timestamptz not null default now(),
  snapshot         jsonb not null check (jsonb_typeof(snapshot)='object'),
  acknowledged_by  uuid references clara.users(id),
  acknowledged_at  timestamptz,
  created_at       timestamptz not null default now(),
  constraint uq_rule_post_runs_entry unique(entry_id),
  constraint fk_rule_post_runs_rule foreign key (rule_id,firm_id,client_id)
    references clara.coding_rules(id,firm_id,client_id),
  constraint fk_rule_post_runs_entry foreign key (entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id),
  constraint ck_rule_post_runs_ack check (
    (acknowledged_by is null)=(acknowledged_at is null))
);
create index ix_rule_post_runs_rule on clara.rule_post_runs(rule_id,posted_at);
create index ix_rule_post_runs_firm_ack on clara.rule_post_runs(firm_id,acknowledged_at,posted_at);

create table clara.rule_post_skips (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null,
  client_id    uuid not null,
  entry_id     uuid not null,
  rule_id      uuid,
  reason       text not null check (btrim(reason)<>''),
  created_at   timestamptz not null default now(),
  constraint fk_rule_post_skips_entry foreign key (entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id)
);
create index ix_rule_post_skips_entry on clara.rule_post_skips(entry_id,created_at);

-- rule_post_runs permits exactly ONE mutation: the acknowledgement stamp (mirror of
-- sweep_runs' ack). rule_post_skips is strictly append-only.
create function clara._tf_rule_post_run_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'rule-post receipts are historical' using errcode='CLR08'; end if;
  if old.acknowledged_at is not null or new.acknowledged_at is null
     or (to_jsonb(new)-array['acknowledged_by','acknowledged_at']) is distinct from
        (to_jsonb(old)-array['acknowledged_by','acknowledged_at']) then
    raise exception 'rule-post receipt permits only one acknowledgement' using errcode='CLR08';
  end if;
  return new;
end $$;
create trigger t_rule_post_runs_update before update or delete on clara.rule_post_runs
  for each row execute function clara._tf_rule_post_run_update();
create trigger t_rule_post_runs_no_truncate before truncate on clara.rule_post_runs
  for each statement execute function clara._tf_no_truncate();
create trigger t_rule_post_skips_append_only before update or delete on clara.rule_post_skips
  for each row execute function clara._tf_append_only();
create trigger t_rule_post_skips_no_truncate before truncate on clara.rule_post_skips
  for each statement execute function clara._tf_no_truncate();

do $$
declare t text;
begin
  foreach t in array array['rule_post_runs','rule_post_skips'] loop
    execute format('alter table clara.%I enable row level security',t);
    execute format('alter table clara.%I force row level security',t);
    execute format(
      'create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)',
      t,t);
  end loop;
end $$;

-- (S4) the typed rule-post event, registered into event_types + the ACTIVE
-- taxonomy (the 0011 additive-pair idiom — no new version/repoint). Stays under
-- clara_fn_owner (the 0011 idiom — the insert ran under fn-owner there too).
with added(name,client_scoped,description,decision,note) as (values
  ('entry.rule_posted',true,'A draft was posted by a signed autopost rule','notification',null::text)
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note from added x
join inserted_types i on i.name=x.name cross join clara.taxonomy_active a;

-- =====================================================================
-- S0/AB-3 — record_rule_resolution CoR (Lane-C, LOAD-BEARING). Same arity; the ONLY
-- change is the SSM arm of the identity CTE gains the `%brn%` alternative so a
-- BRN-declared client (kind='ssm', no TIN) attributes from myinvois.supplier_brn.
-- The `engine_kind in ('ocr','structured_parse')` predicate is PRESERVED VERBATIM
-- (the AB-3 boundary; the S0/S8 substring pins grep for it) and the login-direct
-- grant to clara_runtime_login is preserved by the create-or-replace.
-- =====================================================================
create or replace function clara.record_rule_resolution(p_document uuid,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_dedupe jsonb; v_client uuid; v_n int; v_res uuid; v_fp text;
begin
  select firm_id into v_firm from clara.documents where id=p_document;
  if v_firm is null then raise exception 'document not found' using errcode='CLR11'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(v_firm,'record_rule_resolution',p_op_key,
    clara._hash(jsonb_build_object('document',p_document)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- AB-3: attribution may consume only identity-bearing OCR/structured snapshots.
  -- invoice_facts deliberately carries colliding field_path names and is not an
  -- attribution source. (0015: the ssm arm also admits %brn% — a Malaysian client's
  -- BRN, stored as client_identifiers.kind='ssm', reaches its own e-invoice.)
  with hits as (
    select distinct ci.client_id
    from clara.document_extractions e
    join clara.document_regions r on r.extraction_id=e.id and r.firm_id=v_firm
    join clara.client_identifiers ci on ci.firm_id=v_firm
      and ci.value_normalized=lower(regexp_replace(coalesce(r.text_content,''),'\s+','','g'))
    where e.document_id=p_document and e.firm_id=v_firm and e.status='done'
      and e.engine_kind in ('ocr','structured_parse')
      and ((ci.kind='tin' and lower(coalesce(r.field_path,'')) like '%tin%')
        or (ci.kind='ssm' and (lower(coalesce(r.field_path,'')) like '%ssm%'
          or lower(coalesce(r.field_path,'')) like '%brn%'))
        or (ci.kind='bank_account' and lower(coalesce(r.field_path,'')) like '%account%'))
      -- 0015 DB defense-in-depth (orchestrator adjudication of the WA2 integration
      -- flag): a document region bearing a RESERVED MyInvois sentinel TIN
      -- (EI00000000010 General-Public/consolidated · EI00000000020 foreign-buyer ·
      -- EI00000000030 foreign-supplier) is STRUCTURALLY non-attributable. Consolidated
      -- refusal already lives parser-side (§3.1, Lane-C detectConsolidated), but no
      -- legitimate client can ever own a sentinel — so this exclusion can never
      -- false-negative a real client, and it makes the invariant a DB guard rather
      -- than parser-discipline-only (the house structural>discipline law).
      and lower(regexp_replace(coalesce(r.text_content,''),'\s+','','g'))
          not in ('ei00000000010','ei00000000020','ei00000000030')
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
  perform clara._append_event(v_firm,'client.resolved',v_client,null,null,null,
    null,null,v_res,'{}'::jsonb);
  return clara._finish_op(v_firm,'record_rule_resolution',p_op_key,
    jsonb_build_object('resolution_id',v_res,'client_id',v_client,'outcome','rule_resolved'));
end $$;

-- =====================================================================
-- S6 — FACTS STATE + DIRECTION (client-agnostic doc facts stay same-arity; the
-- client-relative direction lives in a SEPARATE helper — review H3).
-- =====================================================================

-- _document_direction: client-RELATIVE (a document files to many clients). SALES
-- when the document's stated SUPPLIER identity matches THIS client's own
-- registered identifiers (the supplier of a sales e-invoice IS the client);
-- PURCHASE otherwise (client is the buyer — mirrors AP today, never auto-attributes).
-- A contradiction (both parties resolve to the client) => CLR30 direction_unresolved.
create function clara._document_direction(p_document uuid, p_client uuid) returns text
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_ext uuid; v_sup_reg text; v_sup_name text; v_cust_reg text; v_client_name text;
  v_cust_taxid text; v_cust_name text;
  v_reg_hit boolean:=false; v_name_hit boolean:=false;
  v_sales boolean:=false; v_cust boolean:=false;
begin
  if p_document is null or p_client is null then return 'purchase'; end if;
  select e.id into v_ext
  from clara.document_processing_tasks t
  join clara.document_extractions e on e.document_id=t.document_id and e.engine_id=t.engine_id
    and e.version_n=t.version_n and e.engine_kind='invoice_facts' and e.status='done'
  where t.document_id=p_document and t.lane in ('invoice_facts','local_facts') and t.status='done'
  order by t.version_n desc, t.id desc limit 1;
  if v_ext is null then return 'purchase'; end if;   -- no facts yet => default AP (as today)
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_sup_reg from clara.document_regions r
    where r.extraction_id=v_ext and r.field_path='invoice.vendor_registration';
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_sup_name from clara.document_regions r
    where r.extraction_id=v_ext and r.field_path='invoice.vendor_name';
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_cust_reg from clara.document_regions r
    where r.extraction_id=v_ext and r.field_path='invoice.customer_registration';
  -- RESIDUAL v3 (item 3): the BUYER identity also states a TIN (invoice.customer_taxid)
  -- and a NAME (invoice.customer_name) — checking customer_registration ALONE let a doc
  -- whose supplier matched the client AND whose buyer was that client via TIN-only (or a
  -- name match) resolve to 'sales' instead of abstaining. Capture both so the double-
  -- identity contradiction below is symmetric with the supplier-side identity.
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_cust_taxid from clara.document_regions r
    where r.extraction_id=v_ext and r.field_path='invoice.customer_taxid';
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_cust_name from clara.document_regions r
    where r.extraction_id=v_ext and r.field_path='invoice.customer_name';
  -- supplier REGISTRATION match against the client's own hard identifiers (kind
  -- tin/ssm; a Malaysian client's BRN is stored under kind='ssm' — mirrors the AB-3
  -- matcher's ssm/%brn% arm, so a BRN-on-invoice reaches a BRN-registered client).
  if v_sup_reg is not null and exists(select 1 from clara.client_identifiers ci
      where ci.client_id=p_client and ci.kind in ('tin','ssm')
        and ci.value_normalized=v_sup_reg) then
    v_reg_hit:=true;
  end if;
  -- supplier NAME match against the client's registered name + approved (non-retired)
  -- aliases (adversarial #7 / native #3: a valid sales e-invoice may state the exact
  -- registered name yet carry NO registration, or a BRN the client has not yet
  -- recorded as an identifier — a registration-only test mis-codes it as purchase).
  if v_sup_name is not null then
    select lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) into v_client_name
      from clara.clients where id=p_client;
    if v_client_name=v_sup_name
       or exists(select 1 from clara.client_aliases a
           where a.client_id=p_client and a.retired_at is null
             and a.alias_normalized=v_sup_name) then
      v_name_hit:=true;
    end if;
  end if;
  -- SALES when the supplier IS the client. A hard-identifier (registration) match is
  -- decisive. A NAME-only match with NO stated registration is also sales. But a name
  -- match CONTRADICTED by a stated registration matching NO client identifier is
  -- ambiguous → ABSTAIN (CLR30 → NEEDS YOU); never silently default a sales-shaped
  -- doc to purchase (adversarial #7 / native #3).
  -- RESIDUAL-3 (adversarial #7, contradiction asymmetry): a registration match is decisive
  -- ONLY when a stated supplier NAME does not contradict it. If the registration matches the
  -- client but a stated name names a DIFFERENT entity (it does not match the client's
  -- registered name/aliases), ABSTAIN — a registration match must not override a contradicting
  -- name (a swapped/forged header). Symmetric to the name-contradicted-by-registration abstain.
  if v_reg_hit and v_sup_name is not null and not v_name_hit then
    raise exception 'document direction is unresolved (supplier registration matches the client but its stated name names a different entity)'
      using errcode='CLR30',detail='{"reason":"direction_unresolved"}';
  end if;
  if v_reg_hit then
    v_sales:=true;
  elsif v_name_hit and v_sup_reg is null then
    v_sales:=true;
  elsif v_name_hit and v_sup_reg is not null then
    raise exception 'document direction is unresolved (supplier name matches the client but its registration does not)'
      using errcode='CLR30',detail='{"reason":"direction_unresolved"}';
  end if;
  -- RESIDUAL v3 (item 3): the buyer resolves to the client through customer_registration,
  -- customer_taxid (TIN) OR customer_name — not registration alone. A hard-id (reg/tin)
  -- match against the client's own identifiers, OR a name match against the client's
  -- registered name/aliases, marks the buyer as the client.
  if (v_cust_reg is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=p_client and ci.kind in ('tin','ssm') and ci.value_normalized=v_cust_reg))
     or (v_cust_taxid is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=p_client and ci.kind in ('tin','ssm') and ci.value_normalized=v_cust_taxid))
     or (v_cust_name is not null and (
        v_cust_name = (select lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) from clara.clients where id=p_client)
        or exists(select 1 from clara.client_aliases a where a.client_id=p_client
             and a.retired_at is null and a.alias_normalized=v_cust_name))) then
    v_cust:=true;
  end if;
  if v_sales and v_cust then
    raise exception 'document direction is unresolved (both parties match the client)'
      using errcode='CLR30',detail='{"reason":"direction_unresolved"}';
  end if;
  if v_sales then return 'sales'; else return 'purchase'; end if;
end $$;
revoke all on function clara._document_direction(uuid,uuid) from public;

-- _tax_breakdown_cents (NEW, S6/#4): parse the serialized per-type tax breakdown
-- (invoice.tax_breakdown, a JSON array [{type,rate,taxable,amount,...}]) and SUM the
-- 'amount' fields, cents-normalized in the DB. Returns null when absent; a distinct
-- -1 SENTINEL when the text is unparseable / not an array / an amount is malformed
-- (so the caller can REJECT a mis-summed or corrupt breakdown, never silently pass it).
create function clara._tax_breakdown_cents(p_text text) returns bigint
  language plpgsql immutable security definer set search_path=clara,pg_temp as $$
declare v_arr jsonb; elem jsonb; v_sum bigint:=0; v_c bigint;
begin
  if p_text is null or btrim(p_text)='' then return null; end if;
  begin v_arr:=p_text::jsonb; exception when others then return -1; end;
  if jsonb_typeof(v_arr)<>'array' then return -1; end if;
  for elem in select value from jsonb_array_elements(v_arr) loop
    if jsonb_typeof(elem)<>'object' or nullif(btrim(elem->>'amount'),'') is null then
      return -1;
    end if;
    begin v_c:=clara._normalize_invoice_cents(elem->>'amount');
    exception when others then return -1; end;
    if v_c is null then return -1; end if;
    v_sum:=v_sum+v_c;
  end loop;
  return v_sum;
end $$;
revoke all on function clara._tax_breakdown_cents(text) from public;

-- _invoice_fact_state CoR (S6): read the latest done facts extraction across BOTH
-- facts lanes; add a STRUCTURED Tier-A (arithmetic tie, geometry-less) for clara-%
-- engines; additively surface the sales/SST fact fields. The OCR/azure path stays
-- BYTE-IDENTICAL (the polygon wall is unchanged; the structured branch fires only
-- for clara-% facts; the new keys are appended ONLY when captured, so an AP purchase
-- bill's output is unchanged — review M3, same arity + client-agnostic H3).
create or replace function clara._invoice_fact_state(p_document uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_ext uuid; v_version int; v_total_count int; v_total_region uuid;
  v_total bigint; v_conf numeric; v_locator text; v_currency text;
  v_due bigint; v_deposit bigint; v_hash text; v_ok boolean;
  v_locator_json jsonb; v_poly_ok boolean; v_ineligible text;
  v_invoice_id text; v_invoice_date text;
  v_engine text; v_net bigint; v_tax bigint; v_type text;
  v_customer text; v_customer_reg text; v_out jsonb;
  v_rounding bigint; v_breakdown text; v_bd bigint;
  v_net_c int; v_tax_c int; v_type_c int; v_bd_c int; v_round_c int;
  v_due_c int; v_deposit_c int;
begin
  select e.id, e.version_n, nullif(btrim(e.envelope->>'corroboration_ineligible'),''), e.engine_id
    into v_ext, v_version, v_ineligible, v_engine
  from clara.document_processing_tasks t
  join clara.document_extractions e
    on e.document_id = t.document_id and e.engine_id = t.engine_id
   and e.version_n = t.version_n and e.engine_kind = 'invoice_facts'
   and e.status = 'done'
  where t.document_id = p_document and t.lane in ('invoice_facts','local_facts') and t.status = 'done'
  order by t.version_n desc, t.id desc limit 1;
  if v_ext is null then return '{}'::jsonb; end if;

  select count(*)::int into v_total_count
  from clara.document_regions
  where extraction_id = v_ext and field_path = 'invoice.total';
  select id, monetary_cents, engine_confidence, locator_kind, locator
    into v_total_region, v_total, v_conf, v_locator, v_locator_json
  from clara.document_regions
  where extraction_id = v_ext and field_path = 'invoice.total'
  order by id limit 1;
  select upper(regexp_replace(coalesce(min(text_content),''), '[^A-Za-z]', '', 'g'))
    into v_currency from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.currency';
  -- FIX-5 v4 defense-in-depth: capture the region COUNT alongside due/deposit so a PRESENT
  -- region whose cents normalized to NULL (a malformed 'N/A' — the write boundary now refuses
  -- it, this is the read guard) can NEVER be min()-selected into "no due" / a defaulted-zero
  -- deposit and thereby corroborate. An ABSENT field (count 0) stays legitimately optional.
  select count(*)::int, min(monetary_cents) into v_due_c, v_due from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.amount_due';
  select count(*)::int, min(monetary_cents) into v_deposit_c, v_deposit from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.deposit';
  select nullif(btrim(min(text_content)),'') into v_invoice_id from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.invoice_id';
  select nullif(btrim(min(text_content)),'') into v_invoice_date from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.invoice_date';
  -- S6: additive sales / SST fact fields (all null for AP purchase docs). RESIDUAL-4:
  -- capture the region COUNT alongside each value so the structured corroboration can
  -- REJECT a conflicting duplicate instead of min()-selecting one away.
  select count(*)::int, min(monetary_cents) into v_net_c, v_net from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.total_excl_tax';
  select count(*)::int, min(monetary_cents) into v_tax_c, v_tax from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.tax_total';
  select count(*)::int, min(monetary_cents) into v_round_c, v_rounding from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.rounding';
  select count(*)::int, nullif(btrim(min(text_content)),'') into v_bd_c, v_breakdown from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.tax_breakdown';
  select count(*)::int, nullif(btrim(min(text_content)),'') into v_type_c, v_type from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.type_code';
  select nullif(btrim(min(text_content)),'') into v_customer from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.customer_name';
  select nullif(btrim(min(text_content)),'') into v_customer_reg from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.customer_registration';

  if v_total_region is not null then
    select clara._fact_hash(r.extraction_id, r.id, r.field_path, r.text_content,
      r.monetary_cents) into v_hash from clara.document_regions r where r.id = v_total_region;
  end if;
  -- W3: a total with no physical geometry (empty polygon array) can never reach
  -- Tier A. Persistence still stores such rows; they simply never corroborate.
  v_poly_ok := jsonb_typeof(v_locator_json->'polygon') = 'array'
    and jsonb_array_length(v_locator_json->'polygon') > 0;
  if v_engine like 'clara-%' then
    -- STRUCTURED Tier-A (§3.5, adversarial #4): a schema-parsed source corroborates
    -- WITHOUT geometry ONLY on COMPLETE stated facts + a tight arithmetic tie. Only
    -- the invoice type (EXPLICIT 01) corroborates the invoice-total equation; a
    -- missing type never defaults to 01; CN/DN (02/03) + self-billed carry their own
    -- ties in the shape floor but are corroboration-INELIGIBLE for the total here.
    -- Required: explicit type 01, gross, net AND tax (explicit zero tax counts);
    -- net + tax + rounding = gross; and (when present) the per-type breakdown SUMS to
    -- tax_total (a mis-summed / unparseable breakdown yields the -1 sentinel ⇒ fails).
    v_bd := clara._tax_breakdown_cents(v_breakdown);
    -- RESIDUAL-4: (a) SINGLE cardinality on EVERY corroboration fact (type, gross, net,
    -- tax, breakdown, rounding) — a conflicting DUPLICATE region REJECTS corroboration
    -- rather than being min()-selected away (mirrors the single-gross v_total_count=1
    -- check); (b) a positive-tax document MUST carry a breakdown that sums to tax_total
    -- (the earlier `v_bd is null or ...` accepted a positive-tax doc with NO breakdown).
    v_ok := v_total_count = 1 and v_total is not null and v_total > 0
      and v_currency = 'MYR'
      and (v_due_c = 0 or (v_due is not null and v_due = v_total))
      and (v_deposit_c = 0 or (v_deposit is not null and v_deposit = 0))
      and v_ineligible is null
      and v_type = '01' and v_type_c = 1
      and v_net is not null and v_net_c = 1
      and v_tax is not null and v_tax_c = 1
      and v_round_c <= 1 and v_bd_c <= 1
      -- RESIDUAL v3 (item 4): a PRESENT rounding region whose value normalized to NULL is
      -- malformed — it must NOT be silently treated as zero. Fail corroboration (the write
      -- boundary in persist_invoice_facts already refuses it outright; this is the read guard).
      and (v_round_c = 0 or v_rounding is not null)
      and (v_net + v_tax + coalesce(v_rounding, 0)) = v_total
      and (v_bd is not null or v_tax = 0)     -- breakdown REQUIRED when tax_total > 0
      and (v_bd is null or v_bd = v_tax);     -- when present it must sum to tax_total
  else
    -- OCR/azure Tier-A: the polygon wall stays (byte-identical to as-built).
    v_ok := v_total_count = 1 and v_total is not null and v_total > 0
      and coalesce(v_conf, 0) >= 0.95 and v_locator = 'page_polygon' and v_poly_ok
      and v_currency = 'MYR'
      and (v_due_c = 0 or (v_due is not null and v_due = v_total))
      and (v_deposit_c = 0 or (v_deposit is not null and v_deposit = 0))
      and v_ineligible is null;
  end if;
  v_out := jsonb_build_object(
    'extraction_id', v_ext, 'version_n', v_version,
    'total_region_id', v_total_region, 'total_cents', v_total,
    'total_fact_hash', v_hash, 'currency', nullif(v_currency,''),
    'invoice_id', v_invoice_id, 'invoice_date', v_invoice_date,
    'corroboration_ineligible', v_ineligible,
    'corroborated', v_ok,
    'explicit_non_myr', nullif(v_currency,'') is not null and v_currency <> 'MYR'
  );
  -- Append the sales/SST fields ONLY when present, so an AP purchase bill's output
  -- is byte-identical to as-built (review M3, rig exact-diff on the RPR corpus).
  if v_net is not null then v_out := v_out || jsonb_build_object('total_excl_tax_cents',v_net); end if;
  if v_tax is not null then v_out := v_out || jsonb_build_object('tax_total_cents',v_tax); end if;
  if v_rounding is not null then v_out := v_out || jsonb_build_object('rounding_cents',v_rounding); end if;
  if v_type is not null then v_out := v_out || jsonb_build_object('type_code',v_type); end if;
  if v_customer is not null then v_out := v_out || jsonb_build_object('customer_name',v_customer); end if;
  if v_customer_reg is not null then v_out := v_out || jsonb_build_object('customer_registration',v_customer_reg); end if;
  return v_out;
end $$;

-- =====================================================================
-- S7 — SHAPE FLOORS. Generalize the control-class rule to receivable OR payable;
-- add the sales tie floor. The AP gross-tie block stays byte-identical.
-- =====================================================================

-- _assert_supplier_bill_shape CoR: the control-class assertion generalizes to
-- "any control-class line (payable OR receivable) requires a counterparty" (same
-- CLR23 surface). The supplier_bill gross-tie block below is byte-identical.
create or replace function clara._assert_supplier_bill_shape(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_payable_credit bigint; v_expense_debit bigint;
  v_verified_total bigint; v_payable_debit bigint; v_recv_lines int;
  v_type text; v_round_imb bigint; v_leg_n int;
  v_sst_legs int;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  if exists (
    select 1 from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry and a.account_class in ('payable','receivable')
      and l.counterparty_id is null
  ) then
    raise exception 'every control-class line requires a counterparty' using errcode = 'CLR23';
  end if;
  if e.coding_kind = 'supplier_bill' and e.reversal_of is null then
    -- RESIDUAL-2 (supplier-bill polarity): a supplier document whose stated MyInvois type
    -- is anything other than 01 (invoice) cannot be coded as a plain bill — a type-02
    -- supplier credit note drafted Dr expense / Cr payable would wrongly INCREASE payable.
    -- Refuse (=> NEEDS YOU). OCR bills carry no type_code => the binding is inert (unchanged
    -- for the RPR OCR corpus). Mirrors the sales floor's type<->polarity binding.
    if e.document_id is not null then
      v_type := nullif(clara._invoice_fact_state(e.document_id)->>'type_code','');
      if v_type is not null and v_type <> '01' then
        raise exception 'a supplier document of type % cannot be coded as a plain bill', v_type
          using errcode='CLR21',detail='{"reason":"type_polarity_mismatch"}';
      end if;
    end if;
    -- Defense-in-depth (adversarial #2, control-account laundering): a supplier bill
    -- admits NO receivable-class leg and NO payable leg on the DEBIT side (an
    -- opposite/unaccounted control leg through which an amount could be laundered
    -- under the control exemption). At least one payable CREDIT still ties to gross.
    select count(*) filter (where a.account_class='receivable'),
           coalesce(sum(l.credit_cents) filter (where a.account_class='payable'),0),
           coalesce(sum(l.debit_cents)  filter (where a.account_class='payable'),0)
      into v_recv_lines, v_payable_credit, v_payable_debit
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry;
    if v_recv_lines > 0 then
      raise exception 'a supplier bill admits no receivable-class leg' using errcode = 'CLR23';
    end if;
    if v_payable_debit > 0 then
      raise exception 'a supplier bill admits no payable-class debit leg' using errcode = 'CLR23';
    end if;
    if v_payable_credit <= 0 then
      raise exception 'supplier bill requires a payable-class credit' using errcode = 'CLR23';
    end if;
    -- RESIDUAL-1 (defense-in-depth): a supplier bill's rounding account may carry only an
    -- IMMATERIAL amount. A caller-supplied 'rounding' leg of any size would otherwise
    -- launder the balance past the whole-entry constraint when the evidence is non-verified
    -- (the executor closes the autopost path; this closes the human/agent approve path).
    -- Aggregate |dr−cr| over rounding legs must be <= greatest(5, n_legs) sen. Taxonomy-
    -- consistent with the executor bound; leaves the open-ended expense/asset debit side
    -- untouched (asset-debit bills exist), so the AP exact-diff is preserved.
    select count(*)::int into v_leg_n from clara.journal_lines where entry_id=p_entry;
    select coalesce(sum(abs(l.debit_cents-l.credit_cents)),0) into v_round_imb
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='rounding';
    if v_round_imb > greatest(5, v_leg_n) then
      raise exception 'a supplier bill admits no material amount in a rounding leg' using errcode = 'CLR23';
    end if;
    -- FIX-2 (v4, item 2 — sst_output is SALES-side ONLY): a supplier bill (purchase) admits
    -- NO sst_output leg. Malaysian purchase SST is expensed INTO cost (expense=gross); output
    -- tax (sst_output) is a SALES liability, never a purchase leg. This REVERTS the v2/v3
    -- purchase-side sst TIE (which admitted a tied sst leg): a separate sst leg on a purchase
    -- is the item-7 laundering vector, not a legit shape, so it is refused OUTRIGHT — whether
    -- or not it would tie to a stated tax fact. Azure/OCR AP bills carry no sst_output leg =>
    -- inert for the RPR/AP corpus (the exact-diff is preserved). The open-ended expense/asset
    -- debit side (multi-account human splits) stays untouched. Mirrors the executor's
    -- purchase outside-leg rejection (execute_rule_post).
    select count(*)::int into v_sst_legs
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_output';
    if v_sst_legs > 0 then
      raise exception 'a supplier bill admits no sst_output leg (purchase SST is expensed into cost)'
        using errcode = 'CLR23';
    end if;
    select coalesce(r.monetary_cents,clara._normalize_invoice_cents(ev.quote))
      into v_verified_total
    from clara.entry_evidence ev
    join clara.document_regions r on r.id=ev.region_id and r.extraction_id=ev.extraction_id
    where ev.entry_id=p_entry and ev.provenance_tier='verified'
      and ev.field_path='invoice.total'
    order by ev.id limit 1;
    if v_verified_total is not null and not (e.flags ? 'amount_override') then
      select coalesce(sum(l.debit_cents),0) into v_expense_debit
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_type='expense';
      if v_payable_credit <> v_verified_total or v_expense_debit <> v_verified_total then
        raise exception 'supplier-bill payable/expense total differs from supported gross'
          using errcode = 'CLR23';
      end if;
    end if;
  end if;
end $$;

-- _assert_sales_invoice_shape (NEW): the receivable-side tie. Evaluated on STATED
-- DOCUMENT FACTS (from _invoice_fact_state) — the tie must hold on the facts BEFORE
-- the generic <=5-sen rounding append can absorb a residual (adversarial #9). SST
-- legs are discovered by special_acc_type='sst_output' (adversarial #10). A
-- tax-bearing sales invoice meeting a chart with no sst_output account refuses
-- sst_account_missing; an arithmetic mismatch refuses tax_tie_failed.
create function clara._assert_sales_invoice_shape(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_state jsonb; v_gross bigint; v_net bigint; v_tax bigint; v_round bigint;
  v_recv bigint; v_rev bigint; v_sst bigint; v_sst_acct text; v_type text;
  v_is_cn boolean; v_ctrl_correct int; v_ctrl_total int; v_outside int;
  v_round_imb bigint; v_leg_n int;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  -- Act ONLY on sales entries. NB: `coding_kind not in (...)` is NULL (not true) when
  -- coding_kind is NULL, so an explicit NULL guard is required — otherwise the whole
  -- floor would run on non-sales entries (manual JVs, supplier bills) and its
  -- complete-shape check would reject their legitimate legs.
  if e.coding_kind is null
     or e.coding_kind not in ('sales_invoice','sales_credit_note')
     or e.reversal_of is not null then
    return;
  end if;
  if e.document_id is null then return; end if;
  v_is_cn := e.coding_kind = 'sales_credit_note';
  v_state := clara._invoice_fact_state(e.document_id);
  v_gross := nullif(v_state->>'total_cents','')::bigint;
  v_net   := nullif(v_state->>'total_excl_tax_cents','')::bigint;
  v_tax   := nullif(v_state->>'tax_total_cents','')::bigint;
  v_round := nullif(v_state->>'rounding_cents','')::bigint;
  v_type  := nullif(v_state->>'type_code','');

  -- FIX-2 + RESIDUAL-2 (type_code bound to polarity, EXHAUSTIVE). When the source states a
  -- document type, bind it to the coding polarity with a POSITIVE whitelist: a sales_invoice
  -- (incl. a debit note) codes ONLY from type 01/03; a sales_credit_note ONLY from 02/04.
  -- Any OTHER stated type (a self-billed 11-14, an unknown code, or the cross-polarity code)
  -- REFUSES => NEEDS YOU, rather than silently coding an unrecognized document. OCR docs
  -- carry no type_code => the binding is inert (unchanged for the RPR OCR corpus).
  if v_type is not null then
    if v_is_cn then
      if v_type not in ('02','04') then
        raise exception 'document type % does not match a credit-note coding', v_type
          using errcode='CLR21',detail='{"reason":"type_polarity_mismatch"}';
      end if;
    else
      if v_type not in ('01','03') then
        raise exception 'document type % does not match an invoice coding', v_type
          using errcode='CLR21',detail='{"reason":"type_polarity_mismatch"}';
      end if;
    end if;
  end if;

  -- SST account presence (only demanded when tax facts are actually present). Ordered
  -- BEFORE the whole-shape check so a missing sst_output account on the chart surfaces
  -- sst_account_missing rather than the generic shape refusal.
  select account_code into v_sst_acct from clara.coa_accounts
    where client_id=e.client_id and special_acc_type='sst_output' and is_active;
  if v_tax is not null and v_tax > 0 and v_sst_acct is null then
    raise exception 'a tax-bearing sales invoice needs an sst_output account'
      using errcode='CLR10',detail='{"reason":"sst_account_missing"}';
  end if;

  -- FIX-1 (adversarial #2, control-account laundering): the entry must consist ONLY of
  -- the expected legs — receivable control, income, sst_output, rounding — and NOTHING
  -- else (a payable-class or otherwise-unrelated leg RAISES). Combined with the ties
  -- below + the balance invariant, every cent is accounted for, so a split can never
  -- launder an amount into a control account outside the signed sales shape.
  select count(*) into v_outside from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry
      and a.account_class is distinct from 'receivable'
      and a.account_type is distinct from 'income'
      and coalesce(a.special_acc_type,'') not in ('sst_output','rounding');
  if v_outside > 0 then
    raise exception 'a sales entry admits only receivable, income, sst_output and rounding legs'
      using errcode='CLR23';
  end if;
  -- EXACTLY ONE receivable control leg, on the direction-correct side (invoice DEBIT,
  -- credit-note CREDIT); no opposite or additional receivable control leg.
  select
    count(*) filter (where a.account_class='receivable'
      and ((not v_is_cn and l.debit_cents>0) or (v_is_cn and l.credit_cents>0))),
    count(*) filter (where a.account_class='receivable')
    into v_ctrl_correct, v_ctrl_total
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_correct <> 1 or v_ctrl_total <> 1 then
    raise exception 'a sales entry requires exactly one direction-correct receivable control leg'
      using errcode='CLR23';
  end if;
  -- RESIDUAL-1 (defense-in-depth): after bounding the leg CATEGORIES above, bound the
  -- rounding leg's AMOUNT. A 'rounding' leg is admitted by category but may carry only an
  -- immaterial amount; aggregate |dr−cr| over any leg outside {receivable, income,
  -- sst_output} (i.e. the rounding legs) must be <= greatest(5, n_legs) sen. Without this
  -- an entry stating no net/tax facts could launder a material amount into rounding while
  -- passing the gross tie (net/tax ties are skipped when those facts are absent).
  select count(*)::int into v_leg_n from clara.journal_lines where entry_id=p_entry;
  select coalesce(sum(abs(l.debit_cents-l.credit_cents)),0) into v_round_imb
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry
      and a.account_class is distinct from 'receivable'
      and a.account_type is distinct from 'income'
      and coalesce(a.special_acc_type,'') is distinct from 'sst_output';
  if v_round_imb > greatest(5, v_leg_n) then
    raise exception 'a sales entry admits no material amount outside the receivable/income/sst legs'
      using errcode='CLR23';
  end if;

  -- Nothing to tie against without a stated gross (mirrors AP: enforce only when
  -- the facts declare a total). Human/agent judgment carries an uncorroborated draft.
  if v_gross is null then return; end if;
  -- Tie on stated facts FIRST: net + tax + FACTS-declared rounding must EXACTLY equal
  -- gross (a <=5-sen mismatch surfaces here rather than silently drifting into the
  -- auto rounding leg — adversarial #9; the rounding leg absorbs only a declared
  -- residual, e.g. a MyInvois PayableRoundingAmount).
  if v_net is not null and v_tax is not null
     and (v_net + v_tax + coalesce(v_round,0)) <> v_gross then
    raise exception 'sales tax breakdown does not tie to the gross total'
      using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
  end if;
  if v_is_cn then
    -- type 02 mirror: receivable CREDIT = gross, revenue DEBIT = net, sst DEBIT = tax.
    select coalesce(sum(l.credit_cents),0) into v_recv from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class='receivable';
    select coalesce(sum(l.debit_cents),0) into v_rev from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_type='income';
    select coalesce(sum(l.debit_cents),0) into v_sst from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.special_acc_type='sst_output';
  else
    -- sales_invoice (type 01, and DN 03 which RAISES receivable like an invoice):
    -- receivable DEBIT = gross, revenue CREDIT = net, sst CREDIT = tax.
    select coalesce(sum(l.debit_cents),0) into v_recv from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class='receivable';
    select coalesce(sum(l.credit_cents),0) into v_rev from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_type='income';
    select coalesce(sum(l.credit_cents),0) into v_sst from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.special_acc_type='sst_output';
  end if;
  if v_recv <> v_gross then
    raise exception 'receivable-class total differs from the stated gross'
      using errcode='CLR23';
  end if;
  if v_net is not null and v_rev <> v_net then
    raise exception 'revenue total differs from the stated net'
      using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
  end if;
  if v_tax is not null and v_tax > 0 and v_sst <> v_tax then
    raise exception 'sst_output total differs from the stated tax'
      using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
  end if;
end $$;

create function clara._tf_assert_sales_invoice_shape() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._assert_sales_invoice_shape(new.id);
  return null;
end $$;
create constraint trigger t_je_sales_invoice_shape
  after update on clara.journal_entries
  deferrable initially deferred
  for each row when (old.status is distinct from new.status and new.status = 'approved')
  execute function clara._tf_assert_sales_invoice_shape();

-- =====================================================================
-- S1/S3 — IMMUTABILITY TRIGGER CoRs. The JE draft->approved allowset admits the
-- new checked_via_rule_id column; the coding-rule content-immutability freezes the
-- new posting-tier bound columns (widening = a fresh signed row, never an edit).
-- =====================================================================

-- _tf_entry_immutable CoR: the draft->approved allowset gains 'checked_via_rule_id'
-- (both approve_entry and execute_rule_post set it in the same UPDATE). The other
-- three allowsets stay byte-identical. A human approve leaves it NULL (adversarial
-- #11 — enforced structurally by the approve_entry wrapper NOT setting it + a tail
-- assertion), the allowset merely permits the column to change on this transition.
create or replace function clara._tf_entry_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_allowed text[];
begin
  if tg_op = 'DELETE' then
    raise exception 'journal entries are never deleted (reverse, not delete)' using errcode = 'CLR08';
  end if;
  if old.status = 'draft' and new.status = 'draft' then
    v_allowed := array['revision_token','updated_at','proposed_counterparty',
                       'match_fingerprint','last_human_editor','flags'];
  elsif old.status = 'draft' and new.status = 'approved' then
    if old.checker_actor is not null or new.checker_actor is null or new.approved_at is null then
      raise exception 'illegal approval transition' using errcode = 'CLR08';
    end if;
    v_allowed := array['status','checker_actor','approved_at','self_approval_attestation',
                       'proposed_counterparty','match_fingerprint','checked_via_rule_id','updated_at'];
  elsif old.status = 'draft' and new.status = 'withdrawn' then
    if new.withdrawn_by is null or new.withdrawn_at is null
       or btrim(coalesce(new.withdrawal_reason,'')) = '' then
      raise exception 'withdrawal requires actor, time, and reason' using errcode = 'CLR08';
    end if;
    v_allowed := array['status','withdrawn_by','withdrawn_at','withdrawal_reason',
                       'proposed_counterparty','match_fingerprint','updated_at'];
  elsif old.status = 'approved' and new.status = 'approved' then
    if old.reversed_by is not null or old.reversal_reason is not null then
      raise exception 'entry already reversed' using errcode = 'CLR08';
    end if;
    if new.reversed_by is null or btrim(coalesce(new.reversal_reason,'')) = '' then
      raise exception 'approved entries permit only a complete reversal-linkage pair'
        using errcode = 'CLR08';
    end if;
    v_allowed := array['reversed_by','reversal_reason','updated_at'];
  else
    raise exception 'illegal status transition % -> %', old.status, new.status using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'illegal change to entry (status % -> %)', old.status, new.status
      using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- _tf_coding_rule_update CoR (S3): freeze the posting-tier bound columns as content
-- (bounds are immutable once written; widening = retire + a fresh signed successor,
-- WA2-R9). The transition legality set is unchanged (proposed->live/declined/retired,
-- live->retired) so a signed autopost rule may still be retired/superseded.
create or replace function clara._tf_coding_rule_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_ok boolean;
begin
  if tg_op='DELETE' then raise exception 'coding rules are historical' using errcode='CLR08'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id or new.client_id<>old.client_id
     or new.rule_type<>old.rule_type or new.counterparty_id<>old.counterparty_id
     or new.account_code<>old.account_code or new.origin<>old.origin
     or new.content_hash<>old.content_hash or new.created_by is distinct from old.created_by
     or new.created_at<>old.created_at
     or new.amount_cap_cents is distinct from old.amount_cap_cents
     or new.frequency_window is distinct from old.frequency_window
     or new.window_max_posts is distinct from old.window_max_posts
     or new.expires_at is distinct from old.expires_at
     or new.direction is distinct from old.direction
     or new.supersedes_rule_id is distinct from old.supersedes_rule_id then
    raise exception 'coding-rule content is immutable' using errcode='CLR08';
  end if;
  v_ok:=(old.status='proposed' and new.status in ('live','declined','retired'))
    or (old.status='live' and new.status='retired');
  if new.status<>old.status and not v_ok then
    raise exception 'illegal coding-rule transition' using errcode='CLR27';
  end if;
  return new;
end $$;

-- =====================================================================
-- S7 — _resolve_counterparty CoR. p_proposal gains a `kind` key (default 'vendor')
-- riding the existing jsonb param (SAME ARITY). Every lookup block + the existing_id
-- path filters to that kind so a customer proposal can never resolve to a vendor row
-- (review M5). Birth stays caller-applied. Vendor path byte-identical (default kind).
-- =====================================================================
create or replace function clara._resolve_counterparty(p_client uuid,p_proposal jsonb)
  returns jsonb language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_name text; v_name_n text; v_reg text; v_reg_n text; v_existing uuid;
  v_canonical uuid; v_row record; v_alias boolean; v_kind text;
begin
  if p_proposal is null then return null; end if;
  if jsonb_typeof(p_proposal)<>'object' then
    raise exception 'counterparty proposal is malformed'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  v_kind:=coalesce(nullif(btrim(p_proposal->>'kind'),''),'vendor');
  if p_proposal?'existing_id' and not (p_proposal?'new') then
    begin v_existing:=(p_proposal->>'existing_id')::uuid;
    exception when others then
      raise exception 'counterparty proposal is malformed'
        using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
    end;
    v_canonical:=clara._canonical_counterparty(p_client,v_existing);
    select * into v_row from clara.counterparties
      where id=v_canonical and client_id=p_client and kind=v_kind
        and merged_into is null and retired_at is null;
    if not found then raise exception 'selected counterparty does not belong to the client' using errcode='CLR23'; end if;
    return jsonb_strip_nulls(jsonb_build_object(
      'decision',case when v_row.registration_normalized is null
        then 'name_match_unregistered' else 'registration_match' end,
      'counterparty_id',v_row.id,'name_normalized',v_row.name_normalized,
      'registration_normalized',v_row.registration_normalized));
  end if;
  if not (p_proposal?'new') or jsonb_typeof(p_proposal->'new')<>'object' then
    raise exception 'counterparty proposal is malformed'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  v_name:=nullif(btrim(p_proposal->'new'->>'name'),'');
  v_reg:=nullif(btrim(p_proposal->'new'->>'registration_no'),'');
  v_name_n:=lower(regexp_replace(coalesce(v_name,''),'[^a-zA-Z0-9]','','g'));
  v_reg_n:=case when v_reg is null then null else
    lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
  if v_name is null or v_name_n='' or (v_reg is not null and v_reg_n='') then
    raise exception 'counterparty proposal is malformed'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  if v_reg_n is not null then
    select cp.* into v_row from clara.counterparties cp
      where cp.client_id=p_client and cp.kind=v_kind and cp.registration_normalized=v_reg_n
      order by (cp.merged_into is null) desc,cp.id limit 1;
    if found then
      v_canonical:=clara._canonical_counterparty(p_client,v_row.id);
      -- FIX-3 (adversarial #6): the canonicalization reload MUST re-apply the client +
      -- kind predicate. A prior cross-kind merge (now forbidden in merge_counterparties)
      -- could otherwise resolve a customer proposal to a vendor survivor row through
      -- this unscoped reload — so re-assert the scope and refuse if it was crossed.
      select * into v_row from clara.counterparties
        where id=v_canonical and client_id=p_client and kind=v_kind;
      if not found then
        raise exception 'counterparty canonicalization crossed the kind/client scope'
          using errcode='CLR23',detail='{"reason":"cross_kind_merge"}';
      end if;
      return jsonb_build_object('decision','registration_match','counterparty_id',v_row.id,
        'name_normalized',v_row.name_normalized,
        'registration_normalized',v_row.registration_normalized);
    end if;
    select cp.*,a.id is not null as via_alias into v_row
    from clara.counterparties cp
    left join clara.counterparty_aliases a on a.counterparty_id=cp.id
      and a.retired_at is null and a.alias_normalized=v_name_n
    where cp.client_id=p_client and cp.kind=v_kind and cp.merged_into is null and cp.retired_at is null
      and (cp.name_normalized=v_name_n or a.id is not null)
      and cp.registration_normalized is not null
      and cp.registration_normalized<>v_reg_n
    order by cp.id limit 1;
    if found then
      raise exception 'counterparty registration conflicts with the name match'
        using errcode='CLR23',detail=jsonb_build_object(
          'reason','registration_conflict','candidate_id',v_row.id)::text;
    end if;
  else
    select cp.*,a.id is not null as via_alias into v_row
    from clara.counterparties cp
    left join clara.counterparty_aliases a on a.counterparty_id=cp.id
      and a.retired_at is null and a.alias_normalized=v_name_n
    where cp.client_id=p_client and cp.kind=v_kind and cp.merged_into is null and cp.retired_at is null
      and (cp.name_normalized=v_name_n or a.id is not null)
      and cp.registration_normalized is not null
    order by cp.id limit 1;
    if found then
      raise exception 'registered name match is ambiguous without a registration number'
        using errcode='CLR23',detail=jsonb_build_object(
          'reason','registration_conflict','candidate_id',v_row.id)::text;
    end if;
    select cp.*,a.id is not null as via_alias into v_row
    from clara.counterparties cp
    left join clara.counterparty_aliases a on a.counterparty_id=cp.id
      and a.retired_at is null and a.alias_normalized=v_name_n
    where cp.client_id=p_client and cp.kind=v_kind and cp.merged_into is null and cp.retired_at is null
      and (cp.name_normalized=v_name_n or a.id is not null)
      and cp.registration_normalized is null
    order by cp.id limit 1;
    if found then
      v_alias:=coalesce(v_row.via_alias,false) and v_row.name_normalized<>v_name_n;
      return jsonb_build_object('decision',case when v_alias then 'alias_match'
        else 'name_match_unregistered' end,'counterparty_id',v_row.id,
        'name_normalized',v_row.name_normalized);
    end if;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('decision','birth',
    'name_normalized',v_name_n,'registration_normalized',v_reg_n));
end $$;
revoke all on function clara._resolve_counterparty(uuid,jsonb) from public;

-- =====================================================================
-- S5 — APPROVE CORE SPLIT. approve_entry's body moves into a PRIVATE DEFINER core
-- carrying an identity ctx (actor/firm/checked_via_rule_id). The public surface
-- approve_entry(uuid,uuid,text,text) stays same-arity/grant/byte-identical for
-- humans. execute_rule_post reaches the SAME core with the rule identity. The core
-- is reachable ONLY by its two DEFINER callers (zero app-role grant — adversarial
-- #7, the _open_question_core precedent). ONE carve-out: the sighting/auto-proposal
-- block runs ONLY on human approvals (checked_via_rule_id is null — review H2/P10).
-- =====================================================================
create function clara._approve_entry_core(p_ctx jsonb, p_entry uuid,
    p_expected_revision uuid, p_attestation text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; e record; v_dedupe jsonb; v_attest text; v_filing uuid;
  v_fingerprint jsonb; v_counterparty uuid; v_created boolean:=false;
  v_name text; v_reg text; v_tin text; v_name_n text; v_reg_n text;
  v_state jsonb; v_invoice_id text; v_question record; v_map record;
  v_rule uuid; v_question_id uuid; v_seen int;
  v_checked_via_rule uuid; v_kind text;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  v_checked_via_rule:=nullif(p_ctx->>'checked_via_rule_id','')::uuid;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_entry',p_op_key,
    clara._hash(jsonb_build_object('e',p_entry,'rev',p_expected_revision,
      'att',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into e from clara.journal_entries where id=p_entry;
  if not found or e.firm_id<>c.firm then
    raise exception 'entry not in your firm' using errcode='CLR11';
  end if;
  -- CLR26 document-scope serialization (see the as-built filing-lock header): the
  -- filing FOR SHARE vs the question writer's FOR UPDATE serialize on the filing row.
  if e.document_id is not null then
    v_filing:=clara._active_document_filing(e.document_id,e.source_doc_sha256,e.client_id,true);
    if v_filing<>e.filing_id then
      raise exception 'entry is not bound to the active filing' using errcode='CLR02';
    end if;
  end if;

  select * into e from clara.journal_entries where id=p_entry for update;
  if e.status<>'draft' then
    -- The detail reason lets execute_rule_post distinguish THIS benign status race
    -- (a human approved/withdrew concurrently) from every other CLR10 it must NOT mask
    -- (FIX-6 / adversarial #12). Human callers ignore the additive detail unchanged.
    raise exception 'entry is not a draft' using errcode='CLR10',detail='{"reason":"not_a_draft"}';
  end if;
  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;

  if e.reversal_of is not null then
    perform 1 from clara.journal_entries where id=e.reversal_of for update;
    if exists(select 1 from clara.journal_entries
              where id=e.reversal_of and reversed_by is not null) then
      raise exception 'the original was already reversed' using errcode='CLR10';
    end if;
    if exists(select 1 from clara.journal_entries r
              where r.reversal_of=e.reversal_of and r.status='approved'
                and r.id<>p_entry) then
      raise exception 'the original was already reversed by an approved reversal'
        using errcode='CLR10';
    end if;
  end if;

  -- S7: the birth kind follows the stored proposal's TOP-LEVEL kind (the same value
  -- draft/revise/_resolve_counterparty used), falling back to the coding_kind default
  -- (customer for a sales filing). Keeps birth consistent with the resolution scope.
  v_kind:=coalesce(nullif(btrim(e.proposed_counterparty->>'kind'),''),
    case when e.coding_kind in ('sales_invoice','sales_credit_note')
         then 'customer' else 'vendor' end);
  if e.proposed_counterparty is not null then
    v_fingerprint:=clara._resolve_counterparty(e.client_id,e.proposed_counterparty);
    if v_fingerprint is distinct from e.match_fingerprint then
      raise exception 'counterparty match landscape changed; revise the draft'
        using errcode='CLR23';
    end if;
    if v_fingerprint->>'decision'='birth' then
      v_name:=btrim(e.proposed_counterparty->'new'->>'name');
      v_reg:=nullif(btrim(e.proposed_counterparty->'new'->>'registration_no'),'');
      v_tin:=nullif(btrim(e.proposed_counterparty->'new'->>'tin'),'');
      v_name_n:=lower(regexp_replace(v_name,'[^a-zA-Z0-9]','','g'));
      v_reg_n:=case when v_reg is null then null else
        lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
      begin
        insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,
            registration_no,registration_normalized,tin,created_by)
          values(c.firm,e.client_id,v_kind,v_name,v_name_n,v_reg,v_reg_n,v_tin,c.actor)
          returning id into v_counterparty;
        v_created:=true;
      exception when unique_violation then
        v_fingerprint:=clara._resolve_counterparty(e.client_id,e.proposed_counterparty);
        if v_fingerprint is distinct from e.match_fingerprint then
          raise exception 'counterparty birth raced with a changed match landscape'
            using errcode='CLR23';
        end if;
        raise exception 'counterparty identity could not be resolved after birth race'
          using errcode='CLR23';
      end;
    else
      v_counterparty:=clara._canonical_counterparty(
        e.client_id,(v_fingerprint->>'counterparty_id')::uuid);
    end if;
    -- S7: stamp the control counterparty on payable OR receivable lines.
    update clara.journal_lines l set counterparty_id=v_counterparty
    from clara.coa_accounts a
    where l.entry_id=p_entry and a.client_id=l.client_id
      and a.account_code=l.account_code and a.account_class in ('payable','receivable');
  else
    select clara._canonical_counterparty(e.client_id,min(l.counterparty_id::text)::uuid)
      into v_counterparty
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class in ('payable','receivable')
        and l.counterparty_id is not null;
  end if;

  if v_counterparty is not null then
    perform pg_advisory_xact_lock(203005003,
      hashtext(e.client_id::text||':'||v_counterparty::text));
  end if;
  perform pg_advisory_xact_lock(203005004,hashtext(e.client_id::text));
  select * into v_question from clara._open_question_blocks(
    e.client_id,e.filing_id,v_counterparty) limit 1;
  if found then
    raise exception 'an open question blocks this entry'
      using errcode='CLR26',detail=jsonb_build_object('question_id',v_question.question_id,
        'scope',v_question.scope_kind)::text;
  end if;

  if e.document_id is not null then
    v_state:=clara._invoice_fact_state(e.document_id);
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'newer facts identify an unsupported currency' using errcode='CLR25';
    end if;
    if e.coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      if not clara._corroboration_bound(p_entry,(v_state->>'total_cents')::bigint) then
        raise exception 'newer machine facts contradict the draft evidence'
          using errcode='CLR25';
      end if;
      if (e.flags ? 'amount_exception') and not (e.flags ? 'amount_override') then
        raise exception 'proposed total conflicts with the machine-corroborated total'
          using errcode='CLR21',detail='{"reason":"amount_conflict"}';
      end if;
    end if;
    if e.coding_kind='supplier_bill' and e.reversal_of is null
       and v_counterparty is not null then
      v_invoice_id:=nullif(v_state->>'invoice_id','');
      if v_invoice_id is not null and not (e.flags ? 'duplicate_override') then
        perform pg_advisory_xact_lock(203005005,
          hashtext(e.client_id::text||':'||v_counterparty::text||':'||v_invoice_id));
        if exists (
          select 1 from clara.journal_entries e2
          where e2.client_id=e.client_id and e2.coding_kind='supplier_bill'
            and e2.status='approved' and e2.reversed_by is null and e2.id<>p_entry
            and e2.document_id is not null
            and exists (select 1 from clara.journal_lines l2
              where l2.entry_id=e2.id
                and clara._canonical_counterparty(e.client_id,l2.counterparty_id)
                    =v_counterparty)
            and (clara._invoice_fact_state(e2.document_id)->>'invoice_id')=v_invoice_id
        ) then
          raise exception 'an approved bill already exists for this vendor and invoice number'
            using errcode='CLR21',detail='{"reason":"duplicate_bill"}';
        end if;
      end if;
    end if;
    -- S7: sales duplicate = the SAME hard approve-time refusal (customer + invoice
    -- number; fallback customer + date + total). Override-flagged like duplicate_bill.
    if e.coding_kind in ('sales_invoice','sales_credit_note') and e.reversal_of is null
       and v_counterparty is not null and not (e.flags ? 'duplicate_override') then
      v_invoice_id:=nullif(v_state->>'invoice_id','');
      perform pg_advisory_xact_lock(203005005,
        hashtext(e.client_id::text||':'||v_counterparty::text||':'||coalesce(v_invoice_id,'')));
      if exists (
        select 1 from clara.journal_entries e2
        where e2.client_id=e.client_id and e2.coding_kind in ('sales_invoice','sales_credit_note')
          and e2.status='approved' and e2.reversed_by is null and e2.id<>p_entry
          and e2.document_id is not null
          and exists (select 1 from clara.journal_lines l2 where l2.entry_id=e2.id
            and clara._canonical_counterparty(e.client_id,l2.counterparty_id)=v_counterparty)
          and (
            (v_invoice_id is not null
              and (clara._invoice_fact_state(e2.document_id)->>'invoice_id')=v_invoice_id)
            or (v_invoice_id is null
              and (clara._invoice_fact_state(e2.document_id)->>'invoice_date')
                    =nullif(v_state->>'invoice_date','')
              and (clara._invoice_fact_state(e2.document_id)->>'total_cents')::bigint
                    =nullif(v_state->>'total_cents','')::bigint))
      ) then
        raise exception 'an approved sales invoice already exists for this customer'
          using errcode='CLR21',detail='{"reason":"duplicate_sales"}';
      end if;
    end if;
  end if;
  perform clara._assert_supplier_bill_shape(p_entry);
  perform clara._assert_sales_invoice_shape(p_entry);

  if clara.is_high_stakes(p_entry) then
    if e.last_human_editor is null then
      if p_attestation is null or btrim(p_attestation)='' then
        raise exception 'agent-made high-stakes approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"attestation_required"}';
      end if;
      v_attest:=p_attestation;
    elsif e.last_human_editor=c.actor then
      if clara.eligible_checker_count(c.firm)>=2 then
        raise exception 'high-stakes entry needs a distinct checker'
          using errcode='CLR05',detail='{"reason":"distinct_checker"}';
      elsif p_attestation is null or btrim(p_attestation)='' then
        raise exception 'solo high-stakes approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"self_attestation"}';
      else
        v_attest:=p_attestation;
      end if;
    end if;
  end if;

  update clara.journal_entries set status='approved',checker_actor=c.actor,
    approved_at=now(),self_approval_attestation=v_attest,
    proposed_counterparty=null,match_fingerprint=null,
    checked_via_rule_id=v_checked_via_rule,updated_at=now()
    where id=p_entry;
  if e.reversal_of is not null then
    update clara.journal_entries set reversed_by=p_entry,
      reversal_reason=coalesce(e.reversal_reason,'reversal'),updated_at=now()
      where id=e.reversal_of and reversed_by is null;
  end if;

  -- H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only. A rule-posted approval
  -- (checked_via_rule_id set) writes NO sighting and triggers NO proposal — else
  -- rules would breed rules from their own output (WA2-R9). The v_seen pool also
  -- filters to human-checked entries (checked_via_rule_id is null).
  if v_counterparty is not null and e.reversal_of is null and v_checked_via_rule is null then
    insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id)
      select distinct c.firm,e.client_id,v_counterparty,l.account_code,p_entry
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and l.debit_cents>0 and a.is_active
      on conflict on constraint uq_rule_sightings_mapping do nothing;

    for v_map in select distinct s.account_code from clara.rule_sightings s
        where s.entry_id=p_entry and s.counterparty_id=v_counterparty
    loop
      select count(distinct s.entry_id)::int into v_seen
      from clara.rule_sightings s join clara.journal_entries j on j.id=s.entry_id
      where s.client_id=e.client_id and s.account_code=v_map.account_code
        and clara._canonical_counterparty(e.client_id,s.counterparty_id)=v_counterparty
        and j.status='approved' and j.reversed_by is null and j.checked_via_rule_id is null;
      if v_seen=3 and not exists(select 1 from clara.coding_rules r
          where r.client_id=e.client_id and r.counterparty_id=v_counterparty
            and r.rule_type='vendor_account' and r.status in ('proposed','live')) then
        insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
            account_code,status,pinned,origin,content_hash,created_by)
          values(c.firm,e.client_id,'vendor_account',v_counterparty,v_map.account_code,
            'proposed',false,'proposed',encode(clara._hash(jsonb_build_object(
              'type','vendor_account','client',e.client_id,'counterparty',v_counterparty,
              'account_code',v_map.account_code)),'hex'),c.actor)
          returning id into v_rule;
        insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,
            counterparty_id,origin,question_text,status,opener_kind,opened_by,spawned_rule_id)
          values(c.firm,e.client_id,'vendor',v_counterparty,v_counterparty,
            'rule_proposal','Use account '||v_map.account_code||' for this vendor?',
            'open','human',c.actor,v_rule) returning id into v_question_id;
        perform clara._append_event(c.firm,'kb_rule.proposed',e.client_id,c.actor,null,null,
          null,null,null,jsonb_build_object('rule_id',v_rule,'question_id',v_question_id,
            'counterparty_id',v_counterparty,'account_code',v_map.account_code));
      end if;
    end loop;
  end if;

  perform clara._audit(c.firm,c.actor,null,null,'approve_entry',p_entry,
    jsonb_build_object('filing',e.filing_id,'counterparty',v_counterparty,'op_key',p_op_key,
      'checked_via_rule_id',v_checked_via_rule));
  if v_created then
    perform clara._append_event(c.firm,'counterparty.created',e.client_id,c.actor,null,null,
      null,null,null,jsonb_build_object('counterparty_id',v_counterparty));
  end if;
  perform clara._append_event(c.firm,'entry.approved',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);
  if e.reversal_of is not null then
    perform clara._append_event(c.firm,'entry.reversed',e.client_id,c.actor,null,null,
      e.reversal_of,null,null,'{}'::jsonb);
  end if;
  return clara._finish_op(c.firm,'approve_entry',p_op_key,
    jsonb_build_object('entry_id',p_entry,'status','approved'));
end $$;
revoke all on function clara._approve_entry_core(jsonb,uuid,uuid,text,text) from public;

-- approve_entry: the PUBLIC human surface, unchanged arity + grant. It gates on
-- _human_ctx(bookkeeper), then calls the core with a HUMAN ctx (no
-- checked_via_rule_id — a human approve always leaves that column NULL, adversarial
-- #11, structurally guaranteed because this wrapper never sets it). Byte-identical
-- behaviour for human callers (rig exact-diff).
create or replace function clara.approve_entry(p_entry uuid, p_expected_revision uuid,
    p_attestation text default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._approve_entry_core(
    jsonb_build_object('actor',c.actor,'firm',c.firm),
    p_entry,p_expected_revision,p_attestation,p_op_key);
end $$;

-- execute_rule_post: the posting-tier executor. Granted LOGIN-DIRECT to
-- clara_runtime_login ONLY (the record_rule_resolution precedent) — NOT the runtime
-- group, NOT any wake role, NOT the agent pool. Every eligibility fact is RE-DERIVED
-- against LIVE rows here (never trusted from a draft flag): it matches the LIVE
-- autopost rule DIRECTLY (no rule_decisions dependency — review H1), takes SELECT ..
-- FOR UPDATE on that rule row so count-and-post is atomic per rule (adversarial #4),
-- re-checks direction-aware account match (adversarial #6), the whole-entry
-- constraint (adversarial #5), NOT high-stakes, cap, window, expiry, and revision.
-- Then it drives the SAME approve core with the rule identity. Any gate miss (and
-- the benign CLR10/CLR06 race codes the core may raise — review M2) becomes a
-- rule_post_skips row + a quiet skip; only unexpected errors propagate.
create function clara.execute_rule_post(p_entry uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  e record; r record; v_direction text; v_kind text; v_fp jsonb;
  v_counterparty uuid; v_total bigint; v_window_start timestamptz; v_count int;
  v_result jsonb; v_run uuid; v_ctrl_total int; v_ctrl_ok int; v_detail text;
  v_state jsonb; v_gross bigint; v_tax bigint; v_ctrl_amount bigint;
  v_signed_ok int; v_signed_wrong int; v_sst_legs int; v_sst_amt bigint;
  v_round_legs int; v_round_imb bigint; v_outside_legs int;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into e from clara.journal_entries where id=p_entry;
  if not found then raise exception 'entry not found' using errcode='CLR11'; end if;

  if e.status<>'draft' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_a_draft');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
  end if;
  if e.coding_kind is null or e.document_id is null or e.proposed_counterparty is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_eligible_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_eligible_shape');
  end if;

  -- direction (client-aware) — an unresolved direction is a skip, never a raise.
  begin
    v_direction:=clara._document_direction(e.document_id,e.client_id);
  exception when sqlstate 'CLR30' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'direction_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','direction_unresolved');
  end;
  v_kind:=case when v_direction='sales' then 'customer' else 'vendor' end;

  -- resolve the draft's counterparty (kind-scoped by direction) to match the rule.
  begin
    v_fp:=clara._resolve_counterparty(e.client_id,
      e.proposed_counterparty || jsonb_build_object('kind',v_kind));
  exception when sqlstate 'CLR23' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_ambiguous');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_ambiguous');
  end;
  if v_fp is null or v_fp->>'decision'='birth' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_unresolved');
  end if;
  v_counterparty:=clara._canonical_counterparty(e.client_id,(v_fp->>'counterparty_id')::uuid);

  -- match + LOCK the live autopost rule (count-and-post atomic per rule).
  select * into r from clara.coding_rules
    where client_id=e.client_id and counterparty_id=v_counterparty
      and direction=v_direction and rule_type='autopost' and status='live'
    for update;
  if not found then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'no_live_rule');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_live_rule');
  end if;

  -- RE-DERIVE every gate against live rows -----------------------------------
  if clara.is_high_stakes(p_entry) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'high_stakes');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','high_stakes');
  end if;
  -- FIX-1+7 (adversarial laundering — COUNT+IDENTITY enumeration, REPLACING the v2
  -- Σ|dr−cr| tolerance). N tiny decoy legs could inflate a sum tolerance (each extra leg
  -- lifts the old greatest(5,n_legs) bound), and the old sst_output exemption was an
  -- untied free bucket. Instead the entry's legs must form EXACTLY the sanctioned set,
  -- verified by leg COUNT + account IDENTITY — there is NO aggregate tolerance to inflate.
  -- The post is REJECTED (control_shape / account_mismatch skip) if ANY of these fails:
  --   (a) EXACTLY ONE direction-correct control leg (purchase => one payable CREDIT;
  --       sales => one receivable DEBIT), whose amount = the stated gross when the facts
  --       state one (a control<>gross entry never auto-posts — the DB owns the number);
  --   (b) >= 1 leg to the rule's signed account on the direction-correct side, and ZERO
  --       signed-account legs on the wrong side;
  --   (c) sst_output is a SALES-side (output-tax) role ONLY (FIX-2 v4). On a SALES post it
  --       is a sanctioned role bounded to AT MOST ONE leg tied to the stated tax fact
  --       (invoice.tax_total). On a PURCHASE post it is NOT sanctioned at all — a purchase
  --       sst_output leg is an OUTSIDE leg (Malaysian purchase SST is expensed INTO cost,
  --       expense=gross; a separate sst leg is the item-7 laundering vector) → refuse (e).
  --   (d) AT MOST ONE rounding leg (special_acc_type='rounding'), |dr−cr| <= 5 sen;
  --   (e) ZERO legs to ANY OTHER account (every leg is one of the sanctioned roles above —
  --       a decoy leg to an unaccounted account, at ANY count or size, refuses — closes item
  --       1; on a purchase an sst_output leg lands here too — closes item 2).
  v_state := clara._invoice_fact_state(e.document_id);
  v_gross := nullif(v_state->>'total_cents','')::bigint;
  v_tax   := nullif(v_state->>'tax_total_cents','')::bigint;

  -- (a) the single direction-correct control leg + its amount.
  select
    count(*) filter (where a.account_class in ('payable','receivable')),
    count(*) filter (where (v_direction='purchase' and a.account_class='payable'    and l.credit_cents>0)
                        or (v_direction='sales'    and a.account_class='receivable' and l.debit_cents>0)),
    coalesce(sum(case when v_direction='purchase' and a.account_class='payable'    then l.credit_cents
                      when v_direction='sales'    and a.account_class='receivable' then l.debit_cents
                      else 0 end),0)
    into v_ctrl_total, v_ctrl_ok, v_ctrl_amount
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_total<>1 or v_ctrl_ok<>1
     or (v_gross is not null and v_ctrl_amount<>v_gross) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'control_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','control_shape');
  end if;

  -- (b) signed-account legs by side; (c) sst_output legs + tied magnitude; (d) rounding
  -- legs + imbalance; (e) legs to an account OUTSIDE the four sanctioned roles. Every leg
  -- is classified by its account (join to coa_accounts) — count+identity, never a Σ bound.
  select
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.debit_cents>0) or (v_direction='sales' and l.credit_cents>0))),
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.credit_cents>0) or (v_direction='sales' and l.debit_cents>0))),
    count(*) filter (where coalesce(a.special_acc_type,'')='sst_output'),
    coalesce(sum(l.debit_cents+l.credit_cents) filter (where coalesce(a.special_acc_type,'')='sst_output'),0),
    count(*) filter (where coalesce(a.special_acc_type,'')='rounding'),
    coalesce(sum(abs(l.debit_cents-l.credit_cents)) filter (where coalesce(a.special_acc_type,'')='rounding'),0),
    count(*) filter (where coalesce(a.account_class,'') not in ('payable','receivable')
      and l.account_code<>r.account_code
      and coalesce(a.special_acc_type,'')<>'rounding'
      and not (v_direction='sales' and coalesce(a.special_acc_type,'')='sst_output'))
    into v_signed_ok, v_signed_wrong, v_sst_legs, v_sst_amt, v_round_legs, v_round_imb, v_outside_legs
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_signed_ok<1 or v_signed_wrong>0
     or v_outside_legs>0
     or v_sst_legs>1 or (v_sst_legs=1 and (v_tax is null or v_sst_amt<>v_tax))
     or v_round_legs>1 or v_round_imb>5 then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'account_mismatch');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','account_mismatch');
  end if;
  select coalesce(sum(debit_cents),0) into v_total from clara.journal_lines where entry_id=p_entry;
  if v_total>r.amount_cap_cents then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'over_cap');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','over_cap');
  end if;
  v_window_start:=case when r.frequency_window='monthly'
    then (date_trunc('month',now() at time zone 'utc') at time zone 'utc')
    else now()-interval '30 days' end;
  select count(*)::int into v_count from clara.rule_post_runs
    where rule_id=r.id and posted_at>=v_window_start;
  if v_count>=r.window_max_posts then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'window_exhausted');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','window_exhausted');
  end if;
  if r.expires_at<=now() then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'expired');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','expired');
  end if;
  if e.revision_token is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'no_revision');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_revision');
  end if;

  -- FIX v5 (item 5 — CORROBORATION-REQUIRED to auto-post): the confidence ladder auto-posts
  -- ONLY DB-VERIFIED entries. Every rule gate above re-derives cap/window/shape, but the
  -- control-leg tie (a) only anchors to gross when gross is non-NULL. A NON-corroborated
  -- document — a blank / malformed / unreadable total, or ANY state short of Tier-A — leaves
  -- v_gross NULL, so the tie stays inert and an interactive wake draft (the runtime submits
  -- EVERY coded entry.drafted to this executor — rule-post.mjs, not only autodraft) could cite
  -- a non-total region, carry an ARBITRARY under-cap balanced amount, and be auto-posted with
  -- no verified anchor ("the DB owns every number"). Require the document fact-state's
  -- `corroborated` signal to be true before driving the post; otherwise SKIP `not_corroborated`
  -- and leave the entry in the human queue. This is the executor's ADMISSION gate, not a persist
  -- refusal: `invoice.total` still persists blank/non-corroborated at the write boundary
  -- (fail-closed, unchanged). A corroborated bill (gross verified ⇒ the (a) tie already fired)
  -- is unaffected — the positive path still auto-posts. Placed LAST so every specific rule-gate
  -- skip (control_shape / account_mismatch / over_cap / window_exhausted / expired / no_revision)
  -- still fires first for a shaped-but-non-corroborated draft; a CLEAN-shaped non-corroborated
  -- draft (the residual-5 laundering path) lands here.
  if not coalesce((v_state->>'corroborated')::boolean,false) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'not_corroborated');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_corroborated');
  end if;

  -- Drive the SAME approve core with the rule identity. ONLY the benign races become
  -- skips (review M2): CLR06 (stale revision) and the CLR10 that is specifically the
  -- not-a-draft status race (a human approved/withdrew concurrently — detail reason
  -- 'not_a_draft'). FIX-6 (adversarial #12): any OTHER CLR10 — e.g. a shape-floor
  -- CLR10 like sst_account_missing — PROPAGATES honestly, never masked as not_a_draft.
  begin
    v_result:=clara._approve_entry_core(
      jsonb_build_object('actor',r.signed_by,'firm',e.firm_id,'checked_via_rule_id',r.id),
      p_entry,e.revision_token,null,p_op_key);
  exception
    when sqlstate 'CLR10' then
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%not_a_draft%' then
        raise;   -- propagate every non-race CLR10 (e.g. sst_account_missing)
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'not_a_draft');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
    when sqlstate 'CLR21' then
      -- RESIDUAL-2: the supplier-bill shape floor refuses a non-01 supplier document
      -- (type_polarity_mismatch) inside the approve core. The executor degrades that to a
      -- QUIET skip (=> NEEDS YOU), never an error loop; any OTHER CLR21 propagates honestly.
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%type_polarity_mismatch%' then
        raise;
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'type_polarity_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','type_polarity_mismatch');
    when sqlstate 'CLR06' then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'stale_revision');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','stale_revision');
  end;

  -- Receipt (rule snapshot at post time, for the audit join) + the typed event.
  insert into clara.rule_post_runs(firm_id,client_id,rule_id,entry_id,posted_at,snapshot)
    values(e.firm_id,e.client_id,r.id,p_entry,now(),
      jsonb_build_object('rule_id',r.id,'account_code',r.account_code,'direction',r.direction,
        'amount_cap_cents',r.amount_cap_cents,'frequency_window',r.frequency_window,
        'window_max_posts',r.window_max_posts,'signed_by',r.signed_by,
        'content_hash',r.content_hash,'posted_total_cents',v_total))
    returning id into v_run;
  perform clara._append_event(e.firm_id,'entry.rule_posted',e.client_id,r.signed_by,null,null,
    p_entry,e.document_id,null,jsonb_build_object('rule_id',r.id,'run_id',v_run,
      'counterparty_id',v_counterparty,'account_code',r.account_code));
  return jsonb_build_object('entry_id',p_entry,'status','posted','rule_id',r.id,'run_id',v_run);
end $$;
revoke all on function clara.execute_rule_post(uuid,text) from public;
grant execute on function clara.execute_rule_post(uuid,text) to clara_runtime_login;

-- =====================================================================
-- S7 — _draft_entry_core CoR. Body-only, same arity (19 params). Adds the
-- sales_invoice/sales_credit_note branches (document + CUSTOMER proposal + evidence
-- required); a customer proposal carries kind='customer' so it resolves/stores
-- kind-scoped. Supplier-bill path byte-identical. The AP corroboration/amount-
-- exception block stays supplier_bill-only (the sales tie is enforced at approve).
-- =====================================================================
create or replace function clara._draft_entry_core(p_actor uuid, p_firm uuid, p_obo uuid,
    p_wake_kind text, p_is_human boolean, p_client uuid, p_resolution uuid,
    p_posting_date date, p_memo text, p_lines jsonb, p_document uuid, p_sha256 text,
    p_flags jsonb, p_op_key text, p_books_version bigint,
    p_proposed_counterparty jsonb, p_evidence jsonb, p_coding jsonb,
    p_coding_kind text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_dedupe jsonb; v_client_firm uuid; v_client_status text; v_origin text;
  v_entry uuid; v_token uuid; v_filing uuid; v_lines jsonb; v_fingerprint jsonb;
  v_receipt jsonb; v_seq bigint; v_state jsonb; v_payable bigint; v_expense bigint;
  v_task uuid; v_part jsonb; v_tier text; v_constraint text; v_exception jsonb;
  v_rule record; v_rule_counterparty uuid; v_rule_decision uuid; v_proposal jsonb; v_kind text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(p_firm,'draft_entry',p_op_key,
    clara._hash(jsonb_build_object(
      'c',p_client,'r',p_resolution,'d',p_posting_date,'m',p_memo,'l',p_lines,
      'doc',p_document,'sha',p_sha256,'f',p_flags,
      'counterparty',p_proposed_counterparty,'evidence',p_evidence,
      'coding',p_coding,'coding_kind',p_coding_kind)));
  if v_dedupe is not null then return v_dedupe; end if;

  select firm_id,status into v_client_firm,v_client_status
    from clara.clients where id=p_client;
  if v_client_firm is null or v_client_firm<>p_firm then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  if v_client_status='archived' then
    raise exception 'client is archived -- no new postings' using errcode='CLR10';
  end if;
  if not p_is_human then
    perform clara.assert_books_current(p_firm,p_client,p_books_version,null);
  end if;
  if (p_document is null) <> (p_sha256 is null) then
    raise exception 'document and sha256 must be both set or both null' using errcode='CLR10';
  end if;
  if p_document is not null then
    v_filing := clara._active_document_filing(p_document,p_sha256,p_client,true);
    if exists (
      select 1 from clara.journal_entries
      where filing_id=v_filing and status='approved' and reversed_by is null
    ) then
      raise exception 'active filing is already coded'
        using errcode='CLR21',detail='{"reason":"double_coded"}';
    end if;
  end if;
  perform clara.assert_client_resolved(p_client,p_resolution,p_document);
  if p_coding_kind is not null
     and p_coding_kind not in ('supplier_bill','sales_invoice','sales_credit_note') then
    raise exception 'unsupported coding kind' using errcode='CLR10';
  end if;
  if p_coding_kind in ('supplier_bill','sales_invoice','sales_credit_note')
     and (p_document is null or p_proposed_counterparty is null) then
    raise exception 'coded entry requires a document and counterparty proposal'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  if p_coding_kind in ('supplier_bill','sales_invoice','sales_credit_note')
     and (p_evidence is null or jsonb_typeof(p_evidence)<>'array'
          or jsonb_array_length(p_evidence)=0) then
    raise exception 'coded entry requires a cited evidence array'
      using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
  end if;
  if p_coding is not null then
    if p_is_human or p_document is null or jsonb_typeof(p_coding)<>'object'
       or jsonb_typeof(p_coding->'part_payload')<>'object' then
      raise exception 'coding-attempt payload is malformed' using errcode='CLR10';
    end if;
    begin
      v_task := (p_coding->>'task_id')::uuid;
    exception when others then
      raise exception 'coding-attempt task is malformed' using errcode='CLR10';
    end;
    if not exists (
      select 1 from clara.agent_tasks t where t.id=v_task and t.firm_id=p_firm
        and t.client_id=p_client and (
          (t.kind='chat_turn' and t.status in ('queued','running','awaiting_input'))
          or (t.kind='autodraft' and t.status in ('queued','running')))
    ) then
      raise exception 'coding-attempt task is not eligible' using errcode='CLR11';
    end if;
    v_part := p_coding->'part_payload';
  end if;

  -- S7: the resolution kind rides the TOP LEVEL of the proposal (parallel to
  -- new/existing_id). Honor a caller-sent kind; else derive from coding_kind (sales
  -- => customer). The vendor default is never stamped, so AP callers stay byte-identical.
  v_kind := coalesce(nullif(btrim(p_proposed_counterparty->>'kind'),''),
    case when p_coding_kind in ('sales_invoice','sales_credit_note') then 'customer' else 'vendor' end);
  v_proposal := case when p_proposed_counterparty is null or v_kind='vendor'
    then p_proposed_counterparty
    else p_proposed_counterparty || jsonb_build_object('kind',v_kind) end;
  v_fingerprint := clara._resolve_counterparty(p_client,v_proposal);
  v_lines := clara._validate_entry_lines(p_client,p_lines);
  v_origin := case when p_document is not null then 'document'
                   when p_is_human then 'manual' else 'agent' end;
  if p_document is null and (p_memo is null or btrim(p_memo)='') then
    raise exception 'a non-document entry requires a memo (its basis)' using errcode='CLR10';
  end if;

  begin
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
        document_id,filing_id,source_doc_sha256,resolution_id,is_opening_balance,
        is_year_end,tax_affecting,maker_actor,last_human_editor,
        proposed_counterparty,match_fingerprint,coding_kind)
      values(p_client,'draft',p_posting_date,p_memo,v_origin,p_document,v_filing,
        p_sha256,p_resolution,false,
        coalesce((p_flags->>'is_year_end')::boolean,false),
        coalesce((p_flags->>'tax_affecting')::boolean,false),p_actor,
        case when p_is_human then p_actor end,
        v_proposal,v_fingerprint,p_coding_kind)
      returning id into v_entry;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint='uq_journal_entries_one_open_draft_filing' then
      raise exception 'active filing already has an open draft'
        using errcode='CLR21',detail='{"reason":"double_coded"}';
    end if;
    raise;
  end;

  insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
      credit_cents,description)
    select v_entry,x.idx,(x.elem->>'account_code'),
      (x.elem->>'debit_cents')::bigint,(x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem,idx);
  perform clara._assert_balanced(v_entry);

  if p_document is not null then
    if clara._evidence_cites_non_myr(p_evidence) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    if p_evidence is not null then
      perform clara._write_entry_evidence(v_entry,p_document,p_evidence);
    end if;
    v_state := clara._invoice_fact_state(p_document);
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    -- RESIDUAL-2 (supplier-bill polarity, at DRAFT): a supplier document whose stated
    -- MyInvois type is not 01 (invoice) cannot be coded as a plain bill (a type-02 credit
    -- note booked Dr expense / Cr payable would wrongly increase payable). Refuse at draft
    -- (=> NEEDS YOU); the shape floor re-asserts it at approve. OCR bills carry no type_code.
    if p_coding_kind='supplier_bill'
       and nullif(v_state->>'type_code','') is not null
       and nullif(v_state->>'type_code','') <> '01' then
      raise exception 'a supplier document of type % cannot be coded as a plain bill', v_state->>'type_code'
        using errcode='CLR21',detail='{"reason":"type_polarity_mismatch"}';
    end if;
    if p_coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      if not clara._corroboration_bound(v_entry,(v_state->>'total_cents')::bigint) then
        raise exception 'corroborated total is not bound by evidence'
          using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
      end if;
      select coalesce(sum(l.credit_cents),0) into v_payable
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_expense
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_type='expense';
      if v_payable<>(v_state->>'total_cents')::bigint
         or v_expense<>(v_state->>'total_cents')::bigint then
        v_exception := jsonb_build_object(
          'machine_total_cents',(v_state->>'total_cents')::bigint,
          'proposed_cents',v_payable,
          'fact_hash',v_state->>'total_fact_hash','at',now());
      end if;
    end if;
  elsif p_evidence is not null and p_evidence<>'[]'::jsonb then
    raise exception 'unbound evidence is not accepted'
      using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
  end if;

  if v_exception is not null then
    update clara.journal_entries
      set flags = flags || jsonb_build_object('amount_exception',v_exception),
          updated_at=now()
      where id=v_entry;
  end if;

  select revision_token into v_token from clara.journal_entries where id=v_entry;
  if v_fingerprint->>'decision' in
       ('registration_match','name_match_unregistered','alias_match') then
    v_rule_counterparty:=clara._canonical_counterparty(
      p_client,(v_fingerprint->>'counterparty_id')::uuid);
    select r.* into v_rule from clara.coding_rules r
      join clara.coa_accounts a on a.client_id=r.client_id
        and a.account_code=r.account_code and a.is_active
      where r.client_id=p_client and r.counterparty_id=v_rule_counterparty
        and r.rule_type='vendor_account' and r.status='live'
      for share of r;
    if found then
      insert into clara.rule_decisions(firm_id,client_id,entry_id,revision_token,
          rule_id,rule_type,counterparty_id,account_code,content_hash,pinned,
          account_matched,snapshot)
        values(p_firm,p_client,v_entry,v_token,v_rule.id,v_rule.rule_type,
          v_rule.counterparty_id,v_rule.account_code,v_rule.content_hash,v_rule.pinned,
          exists(select 1 from clara.journal_lines l where l.entry_id=v_entry
            and l.account_code=v_rule.account_code and l.debit_cents>0),
          jsonb_build_object('rule_id',v_rule.id,'rule_type',v_rule.rule_type,
            'counterparty_id',v_rule.counterparty_id,'account_code',v_rule.account_code,
            'content_hash',v_rule.content_hash,'pinned',v_rule.pinned,
            'origin',v_rule.origin,'signed_by',v_rule.signed_by,
            'signed_at',v_rule.signed_at)) returning id into v_rule_decision;
    end if;
  end if;

  select case when exists(select 1 from clara.entry_evidence
                    where entry_id=v_entry and provenance_tier='verified')
              then 'verified' else 'model_read' end into v_tier;
  if v_task is not null then
    begin
      insert into clara.coding_attempts(firm_id,client_id,task_id,filing_id,
          document_id,entry_id,part_payload)
        values(p_firm,p_client,v_task,v_filing,p_document,v_entry,
          v_part || jsonb_build_object('entry_id',v_entry,'revision_token',v_token,
            'client_id',p_client,'document_id',p_document,'provenance_tier',v_tier,
            'exception',(v_exception is not null),
            'rule_decision_id',v_rule_decision,
            'rule_account_matched',coalesce((select account_matched
              from clara.rule_decisions where id=v_rule_decision),false)));
    exception when unique_violation then
      raise exception 'coding task or filing was already coded'
        using errcode='CLR21',detail='{"reason":"double_coded"}';
    end;
  end if;

  insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
      revision_token,actor_kind,actor,reason,header,legs,rule_decision_id,evidence_refs)
    select e.firm_id,e.client_id,e.id,0,e.revision_token,
      case when p_is_human then 'human' else 'agent' end,p_actor,'drafted',
      to_jsonb(e)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
      coalesce((select jsonb_agg(jsonb_build_object('line_no',l.line_no,
        'account_code',l.account_code,'debit_cents',l.debit_cents,
        'credit_cents',l.credit_cents,'side',case when l.debit_cents>0 then 'debit'
          else 'credit' end,'counterparty_id',l.counterparty_id,
        'description',l.description) order by l.line_no)
        from clara.journal_lines l where l.entry_id=e.id),'[]'::jsonb),
      v_rule_decision,
      coalesce((select jsonb_agg(jsonb_build_object('evidence_id',ev.id,
        'region_id',ev.region_id,'fact_hash',ev.fact_hash,
        'provenance_tier',ev.provenance_tier) order by ev.id)
        from clara.entry_evidence ev where ev.entry_id=e.id),'[]'::jsonb)
    from clara.journal_entries e where e.id=v_entry;

  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,'draft_entry',v_entry,
    jsonb_build_object('client',p_client,'filing',v_filing,'task',v_task,'op_key',p_op_key));
  v_seq := clara._append_event(p_firm,'entry.drafted',p_client,p_actor,p_obo,p_wake_kind,
    v_entry,p_document,p_resolution,'{}'::jsonb);
  if not p_is_human then
    perform clara.assert_books_current(p_firm,p_client,p_books_version,v_seq);
  end if;
  v_receipt := jsonb_build_object('entry_id',v_entry,'revision_token',v_token,
    'status','draft','filing_id',v_filing,'exception',(v_exception is not null),
    'provenance_tier',v_tier,'rule_decision_id',v_rule_decision,
    'rule_account_matched',coalesce((select account_matched from clara.rule_decisions
      where id=v_rule_decision),false));
  return clara._finish_op(p_firm,'draft_entry',p_op_key,v_receipt);
end $$;

-- =====================================================================
-- S7 — revise_entry CoR. The supplier_bill-scoped require-vendor/evidence branches
-- gain the sales mirrors (a revised sales draft keeps requiring a customer + cited
-- evidence, G3 flag); a sales proposal resolves + stores kind-scoped. Same arity,
-- supplier-bill path byte-identical.
-- =====================================================================
create or replace function clara.revise_entry(p_entry uuid, p_lines jsonb,
    p_proposed_counterparty jsonb, p_evidence jsonb,
    p_expected_revision uuid, p_op_key text,
    p_amount_override jsonb default null,
    p_duplicate_override jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; e record; v_dedupe jsonb; v_lines jsonb; v_fingerprint jsonb;
  v_token uuid; v_state jsonb; v_payable bigint; v_expense bigint;
  v_new_flags jsonb; v_exception jsonb; v_ovr_region uuid; v_proposal jsonb; v_kind text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revise_entry',p_op_key,
    clara._hash(jsonb_build_object('entry',p_entry,'lines',p_lines,
      'counterparty',p_proposed_counterparty,'evidence',p_evidence,
      'revision',p_expected_revision,'amount_override',p_amount_override,
      'duplicate_override',p_duplicate_override)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into e from clara.journal_entries where id=p_entry for update;
  if not found or e.firm_id<>c.firm then
    raise exception 'entry not in your firm' using errcode='CLR11';
  end if;
  if e.status<>'draft' then
    raise exception 'only a draft can be revised' using errcode='CLR22';
  end if;
  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;
  if e.coding_kind in ('supplier_bill','sales_invoice','sales_credit_note')
     and p_proposed_counterparty is null then
    raise exception 'coded entry requires a counterparty proposal'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  if e.coding_kind in ('supplier_bill','sales_invoice','sales_credit_note')
     and (p_evidence is null or jsonb_typeof(p_evidence)<>'array'
          or jsonb_array_length(p_evidence)=0) then
    raise exception 'coded entry requires a cited evidence array'
      using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
  end if;
  v_kind:=coalesce(nullif(btrim(p_proposed_counterparty->>'kind'),''),
    case when e.coding_kind in ('sales_invoice','sales_credit_note') then 'customer' else 'vendor' end);
  v_proposal:=case when p_proposed_counterparty is null or v_kind='vendor'
    then p_proposed_counterparty
    else p_proposed_counterparty || jsonb_build_object('kind',v_kind) end;
  v_fingerprint:=clara._resolve_counterparty(e.client_id,v_proposal);
  v_lines:=clara._validate_entry_lines(e.client_id,p_lines);
  delete from clara.journal_lines where entry_id=p_entry;
  insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
      credit_cents,description)
    select p_entry,x.idx,x.elem->>'account_code',(x.elem->>'debit_cents')::bigint,
      (x.elem->>'credit_cents')::bigint,x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem,idx);
  perform clara._assert_balanced(p_entry);
  v_new_flags:=coalesce(e.flags,'{}'::jsonb) - 'amount_exception' - 'amount_override';
  if e.document_id is not null then
    if clara._evidence_cites_non_myr(p_evidence) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    if p_evidence is not null then
      perform clara._write_entry_evidence(p_entry,e.document_id,p_evidence);
    end if;
    v_state:=clara._invoice_fact_state(e.document_id);
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    if e.coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      if not clara._corroboration_bound(p_entry,(v_state->>'total_cents')::bigint) then
        raise exception 'corroborated total is not bound by revised evidence'
          using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
      end if;
      select coalesce(sum(l.credit_cents),0) into v_payable
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_expense
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_type='expense';
      if v_payable<>(v_state->>'total_cents')::bigint
         or v_expense<>(v_state->>'total_cents')::bigint then
        v_exception:=jsonb_build_object(
          'machine_total_cents',(v_state->>'total_cents')::bigint,
          'proposed_cents',v_payable,
          'fact_hash',v_state->>'total_fact_hash','at',now());
        v_new_flags:=v_new_flags||jsonb_build_object('amount_exception',v_exception);
        if p_amount_override is not null then
          if jsonb_typeof(p_amount_override)<>'object'
             or nullif(btrim(p_amount_override->>'reason'),'') is null then
            raise exception 'amount override is malformed (reason required)'
              using errcode='CLR10';
          end if;
          begin v_ovr_region:=(p_amount_override->>'region_id')::uuid;
          exception when others then
            raise exception 'amount override region is malformed' using errcode='CLR10';
          end;
          if not exists (select 1 from clara.entry_evidence ev
              where ev.entry_id=p_entry and ev.region_id=v_ovr_region
                and ev.document_id=e.document_id) then
            raise exception 'amount override region must be cited in the revised evidence'
              using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
          end if;
          v_new_flags:=v_new_flags||jsonb_build_object('amount_override',
            jsonb_build_object('reason',btrim(p_amount_override->>'reason'),
              'region_id',v_ovr_region,'actor',c.actor,'at',now()));
        end if;
      end if;
    end if;
  end if;
  if p_duplicate_override is not null then
    if jsonb_typeof(p_duplicate_override)<>'object'
       or nullif(btrim(p_duplicate_override->>'reason'),'') is null then
      raise exception 'duplicate override is malformed (reason required)' using errcode='CLR10';
    end if;
    v_new_flags:=v_new_flags||jsonb_build_object('duplicate_override',
      jsonb_build_object('reason',btrim(p_duplicate_override->>'reason'),
        'actor',c.actor,'at',now()));
  end if;
  update clara.journal_entries set proposed_counterparty=v_proposal,
    match_fingerprint=v_fingerprint,last_human_editor=c.actor,flags=v_new_flags,
    revision_token=gen_random_uuid(),updated_at=now() where id=p_entry
    returning revision_token into v_token;

  insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
      revision_token,actor_kind,actor,reason,header,legs,rule_decision_id,evidence_refs)
    select j.firm_id,j.client_id,j.id,
      coalesce((select max(r.revision_no)+1 from clara.journal_entry_revisions r
        where r.entry_id=j.id),0),j.revision_token,'human',c.actor,'revised',
      to_jsonb(j)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
      coalesce((select jsonb_agg(jsonb_build_object('line_no',l.line_no,
        'account_code',l.account_code,'debit_cents',l.debit_cents,
        'credit_cents',l.credit_cents,'side',case when l.debit_cents>0 then 'debit'
          else 'credit' end,'counterparty_id',l.counterparty_id,
        'description',l.description) order by l.line_no)
        from clara.journal_lines l where l.entry_id=j.id),'[]'::jsonb),
      (select rd.id from clara.rule_decisions rd where rd.entry_id=j.id
        order by rd.created_at desc,rd.id desc limit 1),
      coalesce((select jsonb_agg(jsonb_build_object('evidence_id',ev.id,
        'region_id',ev.region_id,'fact_hash',ev.fact_hash,
        'provenance_tier',ev.provenance_tier) order by ev.id)
        from clara.entry_evidence ev where ev.entry_id=j.id),'[]'::jsonb)
    from clara.journal_entries j where j.id=p_entry;

  perform clara._audit(c.firm,c.actor,null,null,'revise_entry',p_entry,
    jsonb_build_object('op_key',p_op_key));
  perform clara._append_event(c.firm,'entry.revised',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);
  return clara._finish_op(c.firm,'revise_entry',p_op_key,
    jsonb_build_object('entry_id',p_entry,'revision_token',v_token,'status','draft'));
end $$;

-- =====================================================================
-- S7 — merge_counterparties CoR (#8). ALSO retire the merged party's live autopost
-- rule (posting authority must never dangle on a retired identity), offering a
-- proposed successor on the survivor (bounds copied; a fresh admin signature is
-- still required to activate). Same arity + grant; all PRESERVE regions intact.
-- =====================================================================
create or replace function clara.merge_counterparties(p_client uuid,p_survivor uuid,
    p_merged uuid,p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; v_dedupe jsonb; s record; m record; r record; v_new_rule uuid;
  v_new_autopost uuid;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_survivor is null or p_merged is null
     or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'merge arguments are required' using errcode='CLR10';
  end if;
  if p_survivor=p_merged then raise exception 'a counterparty cannot merge into itself' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'merge_counterparties',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'survivor',p_survivor,
      'merged',p_merged,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.counterparties cp where cp.id in (p_survivor,p_merged)
    order by cp.id for update;
  select * into s from clara.counterparties where id=p_survivor;
  select * into m from clara.counterparties where id=p_merged;
  if not found or s.id is null then raise exception 'counterparty not found' using errcode='CLR11'; end if;
  if s.firm_id<>c.firm or m.firm_id<>c.firm or s.client_id<>p_client
     or m.client_id<>p_client then
    raise exception 'counterparties are not in the same client'
      using errcode='CLR23',detail='{"reason":"cross_client"}';
  end if;
  if s.merged_into is not null or s.retired_at is not null
     or m.merged_into is not null or m.retired_at is not null then
    raise exception 'merge target is retired'
      using errcode='CLR23',detail='{"reason":"target_retired"}';
  end if;
  -- FIX-3 (adversarial #6): a merge NEVER crosses kind scope (a vendor and a customer
  -- sharing one registration are two deliberately-separate subledger rows). Merging
  -- them would let a later same-kind proposal canonicalize across kinds and return the
  -- wrong-kind row — so a cross-kind merge is refused outright.
  if s.kind <> m.kind then
    raise exception 'counterparties of different kinds cannot be merged'
      using errcode='CLR23',detail='{"reason":"cross_kind_merge"}';
  end if;
  if s.registration_normalized is not null and m.registration_normalized is not null
     and s.registration_normalized<>m.registration_normalized then
    raise exception 'differing registrations cannot be merged'
      using errcode='CLR23',detail='{"reason":"registration_conflict"}';
  end if;
  if exists(select 1 from clara.journal_entries e where e.client_id=p_client
      and e.status='draft' and (
        nullif(e.match_fingerprint->>'counterparty_id','')::uuid=p_merged
        or nullif(e.proposed_counterparty->>'existing_id','')::uuid=p_merged)) then
    raise exception 'an open draft cites the counterparty being merged'
      using errcode='CLR23',detail='{"reason":"open_draft_blocks"}';
  end if;
  insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,
      alias_normalized,alias_display,origin,created_by)
    values(c.firm,p_client,p_survivor,m.name_normalized,m.name,'former_name',c.actor)
    on conflict do nothing;
  select * into r from clara.coding_rules where client_id=p_client
    and counterparty_id=p_merged and rule_type='vendor_account' and status='live'
    for update;
  if found then
    update clara.coding_rules set status='retired',retired_by=c.actor,
      retired_at=now(),retire_reason='merged' where id=r.id;
    if not exists(select 1 from clara.coding_rules where client_id=p_client
        and counterparty_id=p_survivor and rule_type='vendor_account' and status='live') then
      insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
          account_code,status,pinned,origin,content_hash,created_by)
        values(c.firm,p_client,'vendor_account',p_survivor,r.account_code,'proposed',
          r.pinned,'proposed',encode(sha256(convert_to(jsonb_build_object(
            'type','vendor_account','counterparty',p_survivor,
            'account_code',r.account_code)::text,'UTF8')),'hex'),c.actor)
        returning id into v_new_rule;
    end if;
  end if;
  -- #8: the posting-tier rule must not dangle on a retired identity.
  select * into r from clara.coding_rules where client_id=p_client
    and counterparty_id=p_merged and rule_type='autopost' and status='live'
    for update;
  if found then
    update clara.coding_rules set status='retired',retired_by=c.actor,
      retired_at=now(),retire_reason='merged' where id=r.id;
    if not exists(select 1 from clara.coding_rules where client_id=p_client
        and counterparty_id=p_survivor and rule_type='autopost' and status='live') then
      insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
          account_code,status,pinned,origin,content_hash,created_by,
          amount_cap_cents,frequency_window,window_max_posts,expires_at,direction,
          supersedes_rule_id)
        values(c.firm,p_client,'autopost',p_survivor,r.account_code,'proposed',
          r.pinned,'proposed',encode(sha256(convert_to(jsonb_build_object(
            'type','autopost','counterparty',p_survivor,'account_code',r.account_code,
            'direction',r.direction,'cap',r.amount_cap_cents)::text,'UTF8')),'hex'),c.actor,
          r.amount_cap_cents,r.frequency_window,r.window_max_posts,r.expires_at,r.direction,r.id)
        returning id into v_new_autopost;
    end if;
  end if;
  update clara.counterparties set merged_into=p_survivor,retired_at=now(),
    updated_at=now() where id=p_merged;
  perform clara._audit(c.firm,c.actor,null,null,'merge_counterparties',null,
    jsonb_build_object('client',p_client,'survivor',p_survivor,'merged',p_merged,
      'reason',p_reason,'reissued_rule',v_new_rule,'reissued_autopost_rule',v_new_autopost,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'counterparty.merged',p_client,c.actor,null,null,
    null,null,null,jsonb_build_object('survivor_id',p_survivor,'merged_id',p_merged,
      'reason',p_reason,'reissued_rule_id',v_new_rule,
      'reissued_autopost_rule_id',v_new_autopost));
  return clara._finish_op(c.firm,'merge_counterparties',p_op_key,
    jsonb_build_object('survivor_id',p_survivor,'merged_id',p_merged,
      'reissued_rule_id',v_new_rule,'reissued_autopost_rule_id',v_new_autopost));
end $$;

-- =====================================================================
-- S7 — _coding_lane_core CoR. Adds the direction branch (§3.3): a sales-direction
-- filing reads CUSTOMER facts and resolves a customer-kind proposal; the vendor
-- (purchase) path is byte-identical to the 0013 definition (probe P8). Same arity,
-- private/owner-only. Keeps the 'invoice.vendor_registration' prosrc marker.
-- =====================================================================
create or replace function clara._coding_lane_core(p_client uuid,p_filing uuid)
  returns table(lane text,reasons text[])
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  f record; v_state jsonb; v_reasons text[]:='{}'::text[]; v_vendor text;
  v_vendor_reg text;
  v_fp jsonb; v_counterparty uuid; v_hard boolean:=false; v_total bigint;
  v_invoice_date text; v_rule boolean:=false;
  v_direction text; v_kind text;
begin
  select df.*,d.sha256 into f from clara.document_filings df
    join clara.documents d on d.id=df.document_id
    where df.id=p_filing and df.client_id=p_client and df.retired_at is null;
  if not found then
    return query select 'needs_you'::text,array['no_active_filing']::text[];
    return;
  end if;
  if exists(select 1 from clara.journal_entries e where e.filing_id=f.id
      and e.status='draft') then
    v_reasons:=array_append(v_reasons,'open_draft');
  end if;
  if exists(select 1 from clara.journal_entries e where e.filing_id=f.id
      and e.status='approved' and e.reversed_by is null) then
    v_reasons:=array_append(v_reasons,'already_coded');
  end if;
  v_state:=clara._invoice_fact_state(f.document_id);
  if v_state='{}'::jsonb then
    v_reasons:=array_append(v_reasons,'facts_pending');
  else
    if coalesce(v_state->>'corroboration_ineligible','')='multi_document' then
      v_reasons:=array_append(v_reasons,'multi_doc'); v_hard:=true;
    end if;
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      v_reasons:=array_append(v_reasons,'non_myr'); v_hard:=true;
    end if;
    if not coalesce((v_state->>'corroborated')::boolean,false) then
      v_reasons:=array_append(v_reasons,'tier_a_fails');
    end if;
  end if;
  -- S7: direction is client-relative; a contradiction is a hard NEEDS YOU (CLR30).
  begin
    v_direction:=clara._document_direction(f.document_id,p_client);
  exception when sqlstate 'CLR30' then
    v_reasons:=array_append(v_reasons,'direction_unresolved'); v_hard:=true; v_direction:='purchase';
  end;
  v_kind:=case when v_direction='sales' then 'customer' else 'vendor' end;
  if v_direction='sales' then
    select nullif(btrim(min(r.text_content)),'') into v_vendor
      from clara.document_regions r where r.extraction_id=(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)
        and r.field_path='invoice.customer_name';
    select nullif(btrim(min(r.text_content)),'') into v_vendor_reg
      from clara.document_regions r where r.extraction_id=(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)
        and r.field_path='invoice.customer_registration';
  else
    select nullif(btrim(min(r.text_content)),'') into v_vendor
      from clara.document_regions r where r.extraction_id=(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)
        and r.field_path='invoice.vendor_name';
    select nullif(btrim(min(r.text_content)),'') into v_vendor_reg
      from clara.document_regions r where r.extraction_id=(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)
        and r.field_path='invoice.vendor_registration';
  end if;
  if v_vendor is null then
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
  end if;
  if exists(select 1 from clara._open_question_blocks(p_client,f.id,v_counterparty)) then
    v_reasons:=array_append(v_reasons,'open_question'); v_hard:=true;
  end if;
  if not exists(select 1 from clara.client_egress_consents c
      where c.client_id=p_client and c.revoked_at is null) then
    v_reasons:=array_append(v_reasons,'no_consent');
  end if;
  if exists(select 1 from clara.autodraft_attempts a
      where a.filing_id=f.id and a.state='parked') then
    v_reasons:=array_append(v_reasons,'parked');
  end if;
  if v_counterparty is not null and exists(select 1 from clara.coding_rules r
      where r.client_id=p_client and r.counterparty_id=v_counterparty
        and r.rule_type='vendor_account' and r.status='live') then
    v_reasons:=array_append(v_reasons,'rule_backed'); v_rule:=true;
  end if;
  begin v_total:=(v_state->>'total_cents')::bigint; exception when others then v_total:=null; end;
  if v_total is not null and v_total>=(select high_stakes_amount_cents
      from clara.firms where id=f.firm_id) then
    v_reasons:=array_append(v_reasons,'high_stakes');
  end if;
  v_invoice_date:=nullif(v_state->>'invoice_date','');
  if v_counterparty is not null and exists(
      select 1 from clara.journal_entries e
      where e.client_id=p_client and e.status='approved' and e.reversed_by is null
        and e.document_id is not null and exists(select 1 from clara.journal_lines l
          where l.entry_id=e.id and clara._canonical_counterparty(
            p_client,l.counterparty_id)=v_counterparty)
        and ((v_invoice_date is not null and
              clara._invoice_fact_state(e.document_id)->>'invoice_date'=v_invoice_date)
          or (v_total is not null and
              (clara._invoice_fact_state(e.document_id)->>'total_cents')::bigint=v_total))
    ) then
    v_reasons:=array_append(v_reasons,'near_duplicate');
  end if;
  if v_hard then lane:='needs_you';
  elsif coalesce(array_length(array_remove(v_reasons,'rule_backed'),1),0)=0 then lane:='ready';
  else lane:='needs_review'; end if;
  reasons:=v_reasons;
  return next;
end $$;
revoke all on function clara._coding_lane_core(uuid,uuid) from public;

-- =====================================================================
-- S7 — get_doc_entry_diff CoR. A receivable branch (sums account_class='receivable'
-- on the DEBIT side + invoice.customer_name) chosen by coding_kind. The AP/payable
-- path is byte-identical (a separate, textually-unchanged query). Same arity/grant.
-- =====================================================================
create or replace function clara.get_doc_entry_diff(p_entry uuid,p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record; c record; e record; v_firm uuid; v_fields jsonb;
begin
  if p_entry is null or p_client is null then
    raise exception 'entry and client are required' using errcode='CLR10';
  end if;
  if coalesce(current_setting('clara.wake_secret',true),'')<>'' then
    select * into w from clara.wake_context();
    if w.credential_id is null then raise exception 'no valid agent read context' using errcode='CLR03'; end if;
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'get_doc_entry_diff');
    end if;
    if w.client_id is not null and p_client<>w.client_id then return null; end if;
    v_firm:=w.firm_id;
  else
    c:=clara._human_ctx(clara.role_rank('viewer')); v_firm:=c.firm;
  end if;
  select * into e from clara.journal_entries where id=p_entry and client_id=p_client
    and firm_id=v_firm;
  if not found or e.document_id is null then return null; end if;
  if e.coding_kind in ('sales_invoice','sales_credit_note') then
    -- Receivable branch: gross = the receivable-class DEBIT sum; party = the customer.
    with latest as (
      select x.id from clara.document_extractions x where x.document_id=e.document_id
        and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc,x.id desc limit 1
    ), facts(field,entry_value,entry_cents) as (
      values
        ('invoice.total'::text,(select coalesce(sum(l.debit_cents),0)::text
          from clara.journal_lines l join clara.coa_accounts a
            on a.client_id=l.client_id and a.account_code=l.account_code
          where l.entry_id=e.id and a.account_class='receivable'),
          (select coalesce(sum(l.debit_cents),0) from clara.journal_lines l
            join clara.coa_accounts a on a.client_id=l.client_id
              and a.account_code=l.account_code where l.entry_id=e.id
              and a.account_class='receivable')),
        ('invoice.invoice_date',e.posting_date::text,null::bigint),
        ('invoice.invoice_id',null::text,null::bigint),
        ('invoice.customer_name',(select cp.name from clara.journal_lines l
          join clara.counterparties cp on cp.id=clara._canonical_counterparty(
            e.client_id,l.counterparty_id) where l.entry_id=e.id
            and l.counterparty_id is not null order by l.line_no limit 1),null::bigint),
        ('invoice.currency','MYR',null::bigint)
    )
    select coalesce(jsonb_agg(jsonb_build_object('field',f.field,
      'doc_value',coalesce(r.monetary_cents::text,r.text_content),
      'doc_region_id',r.id,'doc_page',r.locator->>'page',
      'doc_region_locator_kind',r.locator_kind,'doc_region_locator',r.locator,
      'entry_value',f.entry_value,
      'delta_cents',case when f.entry_cents is not null and r.monetary_cents is not null
        then f.entry_cents-r.monetary_cents end,'no_region',(r.id is null))
      order by f.field),'[]'::jsonb) into v_fields
    from facts f left join lateral (select dr.* from clara.document_regions dr
      where dr.extraction_id=(select id from latest) and dr.field_path=f.field
      order by dr.id limit 1) r on true;
  else
    with latest as (
      select x.id from clara.document_extractions x where x.document_id=e.document_id
        and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc,x.id desc limit 1
    ), facts(field,entry_value,entry_cents) as (
      values
        ('invoice.total'::text,(select coalesce(sum(l.credit_cents),0)::text
          from clara.journal_lines l join clara.coa_accounts a
            on a.client_id=l.client_id and a.account_code=l.account_code
          where l.entry_id=e.id and a.account_class='payable'),
          (select coalesce(sum(l.credit_cents),0) from clara.journal_lines l
            join clara.coa_accounts a on a.client_id=l.client_id
              and a.account_code=l.account_code where l.entry_id=e.id
              and a.account_class='payable')),
        ('invoice.invoice_date',e.posting_date::text,null::bigint),
        ('invoice.invoice_id',null::text,null::bigint),
        ('invoice.vendor_name',(select cp.name from clara.journal_lines l
          join clara.counterparties cp on cp.id=clara._canonical_counterparty(
            e.client_id,l.counterparty_id) where l.entry_id=e.id
            and l.counterparty_id is not null order by l.line_no limit 1),null::bigint),
        ('invoice.currency','MYR',null::bigint)
    )
    select coalesce(jsonb_agg(jsonb_build_object('field',f.field,
      'doc_value',coalesce(r.monetary_cents::text,r.text_content),
      'doc_region_id',r.id,'doc_page',r.locator->>'page',
      'doc_region_locator_kind',r.locator_kind,'doc_region_locator',r.locator,
      'entry_value',f.entry_value,
      'delta_cents',case when f.entry_cents is not null and r.monetary_cents is not null
        then f.entry_cents-r.monetary_cents end,'no_region',(r.id is null))
      order by f.field),'[]'::jsonb) into v_fields
    from facts f left join lateral (select dr.* from clara.document_regions dr
      where dr.extraction_id=(select id from latest) and dr.field_path=f.field
      order by dr.id limit 1) r on true;
  end if;
  return jsonb_build_object('entry_id',e.id,'document_id',e.document_id,'fields',v_fields);
end $$;

-- =====================================================================
-- S3/S4 — POSTING-TIER LIFECYCLE + FEED. sign_autopost_rule (admin+, distinct from
-- the bookkeeper+ sign_coding_rule), propose_autopost_rule (bookkeeper+ author with
-- the >=3 human-checked-sighting structural floor), reconcile_autopost_rules (the
-- runtime expiry sweep + nudge), acknowledge_rule_posts + get_rule_post_run (feed).
-- =====================================================================

-- propose_autopost_rule: bookkeeper+ author. The DECISION is upstream professional
-- judgment (advisory, runtime-surfaced); the DB enforces only the structural gaming
-- guard: >=3 congruent HUMAN-approved, unreversed, HUMAN-CHECKED sightings for
-- (counterparty, account) (H2 filter). Bounds default monthly/3/12-months.
-- Lane-D interface: a 2-arg jsonb form. p_proposal = {client_id, counterparty_id,
-- direction, account_code, amount_cap (RAW STRING — the DB normalizes to cents),
-- frequency_window, window_max_posts int, expires_at ISO-or-null->default 12mo,
-- rationale?}. The runtime/UI decides the proposal intelligently (advisory); the DB
-- enforces the structural gaming floor (>=3 human-checked sightings) + the cap ceiling.
create function clara.propose_autopost_rule(p_proposal jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_cp uuid; v_id uuid; v_hash text;
  v_seen int; v_expires timestamptz; v_hs bigint;
  v_client uuid; v_counterparty uuid; v_account text; v_direction text;
  v_cap bigint; v_window text; v_maxposts int; v_rationale text; v_cap_raw text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_proposal is null or jsonb_typeof(p_proposal)<>'object' then
    raise exception 'autopost proposal is malformed'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  v_account:=nullif(btrim(p_proposal->>'account_code'),'');
  v_direction:=nullif(btrim(p_proposal->>'direction'),'');
  v_window:=coalesce(nullif(btrim(p_proposal->>'frequency_window'),''),'monthly');
  v_rationale:=nullif(btrim(p_proposal->>'rationale'),'');
  v_cap_raw:=nullif(btrim(p_proposal->>'amount_cap'),'');
  begin
    v_client:=(p_proposal->>'client_id')::uuid;
    v_counterparty:=(p_proposal->>'counterparty_id')::uuid;
    v_maxposts:=coalesce((p_proposal->>'window_max_posts')::int,3);
    v_expires:=coalesce(nullif(btrim(p_proposal->>'expires_at'),'')::timestamptz,
                        now()+interval '12 months');
    v_cap:=case when v_cap_raw is null then null else clara._normalize_invoice_cents(v_cap_raw) end;
  exception when others then
    raise exception 'autopost proposal fields are malformed'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end;
  if v_client is null or v_counterparty is null or v_account is null
     or v_direction not in ('purchase','sales') or v_cap is null or v_cap<=0
     or v_maxposts<=0 or v_window<>'monthly' then
    raise exception 'autopost rule is malformed'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  -- SALES-AUTOPOST DEFERRAL (owner ruling, this round → Wave-A2.1). Sales-direction
  -- autopost is NOT built: the sighting pool is debit-only (a revenue credit accrues
  -- zero sightings) and the executor has no credit-side posting path — so a sales
  -- rule could never be legitimately proposed or posted. Make it an EXPLICIT
  -- structural refusal, not silent dead code. Purchase autopost stays fully live.
  -- Follow-up (Wave-A2.1): direction-aware sightings (credit-side revenue evidence)
  -- + a credit-side executor path, then lift this refusal.
  if v_direction='sales' then
    raise exception 'sales-direction autopost is deferred to Wave-A2.1'
      using errcode='CLR27',detail='{"reason":"sales_autopost_deferred"}';
  end if;
  if not exists(select 1 from clara.clients where id=v_client and firm_id=c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'propose_autopost_rule',p_op_key,
    clara._hash(jsonb_build_object('client',v_client,'counterparty',v_counterparty,
      'account_code',v_account,'direction',v_direction,'cap',v_cap)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_cp:=clara._canonical_counterparty(v_client,v_counterparty);
  if v_cp is null or not exists(select 1 from clara.counterparties where id=v_cp
      and firm_id=c.firm and retired_at is null) then raise exception 'counterparty not found' using errcode='CLR11'; end if;
  if not exists(select 1 from clara.coa_accounts where client_id=v_client
      and account_code=v_account and is_active) then
    raise exception 'rule account is not postable'
      using errcode='CLR27',detail='{"reason":"account_not_postable"}';
  end if;
  -- cap ceiling visible at propose (min of rule cap and the firm high-stakes bound).
  select high_stakes_amount_cents into v_hs from clara.firms where id=c.firm;
  if v_hs is not null and v_cap>v_hs then
    raise exception 'autopost cap cannot exceed the firm high-stakes threshold'
      using errcode='CLR27',detail='{"reason":"cap_exceeds_high_stakes"}';
  end if;
  -- structural gaming guard: >=3 congruent human-approved, unreversed, human-checked
  -- sightings (never a rule's own output — checked_via_rule_id is null).
  select count(distinct s.entry_id)::int into v_seen
  from clara.rule_sightings s join clara.journal_entries j on j.id=s.entry_id
  where s.client_id=v_client and s.account_code=v_account
    and clara._canonical_counterparty(v_client,s.counterparty_id)=v_cp
    and j.status='approved' and j.reversed_by is null and j.checked_via_rule_id is null;
  if v_seen<3 then
    raise exception 'an autopost proposal needs at least 3 congruent human-approved sightings'
      using errcode='CLR27',detail='{"reason":"insufficient_evidence"}';
  end if;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('type','autopost',
    'counterparty',v_cp,'account_code',v_account,'direction',v_direction,
    'cap',v_cap,'expires_at',v_expires)::text,'UTF8')),'hex');
  insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
      account_code,status,pinned,origin,content_hash,created_by,
      amount_cap_cents,frequency_window,window_max_posts,expires_at,direction)
    values(c.firm,v_client,'autopost',v_cp,v_account,'proposed',false,
      'authored',v_hash,c.actor,v_cap,v_window,v_maxposts,v_expires,v_direction)
    returning id into v_id;
  perform clara._audit(c.firm,c.actor,null,null,'propose_autopost_rule',null,
    jsonb_build_object('rule',v_id,'client',v_client,'counterparty',v_cp,
      'direction',v_direction,'sightings',v_seen,'rationale',v_rationale,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_rule.proposed',v_client,c.actor,null,null,null,null,null,
    jsonb_build_object('rule_id',v_id,'counterparty_id',v_cp,'tier','autopost'));
  return clara._finish_op(c.firm,'propose_autopost_rule',p_op_key,
    jsonb_build_object('rule_id',v_id,'status','proposed'));
end $$;

-- sign_autopost_rule: ADMIN+ (the sole distinction from sign_coding_rule's
-- bookkeeper+ floor). Re-verifies the account is postable, the cap sits under the
-- firm high-stakes ceiling, and the one-live index still holds.
create function clara.sign_autopost_rule(p_rule uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; r record; v_constraint text; v_hs bigint;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_rule is null then raise exception 'rule is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'sign_autopost_rule',p_op_key,
    clara._hash(jsonb_build_object('rule',p_rule)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into r from clara.coding_rules where id=p_rule for update;
  if not found or r.firm_id<>c.firm then raise exception 'rule not found' using errcode='CLR11'; end if;
  if r.rule_type<>'autopost' or r.status<>'proposed' then
    raise exception 'rule is not a proposed autopost rule'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  -- SALES-AUTOPOST DEFERRAL (owner ruling → Wave-A2.1): defense-in-depth — even if a
  -- sales-direction proposal predated this refusal, it can never be SIGNED live.
  if r.direction='sales' then
    raise exception 'sales-direction autopost is deferred to Wave-A2.1'
      using errcode='CLR27',detail='{"reason":"sales_autopost_deferred"}';
  end if;
  if not exists(select 1 from clara.coa_accounts where client_id=r.client_id
      and account_code=r.account_code and is_active) then
    raise exception 'rule account is not postable'
      using errcode='CLR27',detail='{"reason":"account_not_postable"}';
  end if;
  select high_stakes_amount_cents into v_hs from clara.firms where id=c.firm;
  if v_hs is not null and r.amount_cap_cents>v_hs then
    raise exception 'autopost cap cannot exceed the firm high-stakes threshold'
      using errcode='CLR27',detail='{"reason":"cap_exceeds_high_stakes"}';
  end if;
  begin
    update clara.coding_rules set status='live',signed_by=c.actor,signed_at=now() where id=p_rule;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_coding_rules_one_live_vendor' then
      raise exception 'a live rule already exists for this counterparty'
        using errcode='CLR27',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'sign_autopost_rule',null,
    jsonb_build_object('rule',p_rule,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_rule.signed',r.client_id,c.actor,null,null,null,null,null,
    jsonb_build_object('rule_id',p_rule,'tier','autopost'));
  return clara._finish_op(c.firm,'sign_autopost_rule',p_op_key,
    jsonb_build_object('rule_id',p_rule,'status','live'));
end $$;

-- reconcile_autopost_rules: runtime reconciler. Hard-expire live autopost rules
-- past expires_at (WA2-R10 — never auto-renew) with a notification, and nudge at
-- 3/4-term with no recent posts. Notifications go through _record_notification_core
-- DIRECTLY (this DEFINER fn runs as owner; the core is ungranted — G5 §9 flag).
create function clara.reconcile_autopost_rules() returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare rr record; v_expired int:=0; v_nudged int:=0;
begin
  for rr in select * from clara.coding_rules where rule_type='autopost' and status='live'
      and expires_at<=now() order by id for update skip locked loop
    update clara.coding_rules set status='retired',retired_at=now(),
      retire_reason='expired' where id=rr.id;
    begin
      perform clara._record_notification_core(rr.signed_by,rr.firm_id,null,null,
        rr.client_id,'autopost_rule_expired',
        jsonb_build_object('rule_id',rr.id,'counterparty_id',rr.counterparty_id,
          'message','A standing auto-post rule reached its hard expiry and was retired. Re-sign to renew.'),
        'autopost-expire:'||rr.id::text);
    exception when others then null;
    end;
    perform clara._append_event(rr.firm_id,'kb_rule.retired',rr.client_id,null,null,null,
      null,null,null,jsonb_build_object('rule_id',rr.id,'reason','expired'));
    v_expired:=v_expired+1;
  end loop;
  for rr in select * from clara.coding_rules where rule_type='autopost' and status='live'
      and expires_at>now() and expires_at<=now()+interval '3 months' order by id loop
    if not exists(select 1 from clara.rule_post_runs where rule_id=rr.id
        and posted_at>=now()-interval '90 days')
       and not exists(select 1 from clara.notifications n where n.client_id=rr.client_id
        and n.kind='autopost_renew_or_retire' and n.payload->>'rule_id'=rr.id::text) then
      begin
        perform clara._record_notification_core(rr.signed_by,rr.firm_id,null,null,
          rr.client_id,'autopost_renew_or_retire',
          jsonb_build_object('rule_id',rr.id,'expires_at',rr.expires_at,
            'message','A standing auto-post rule is nearing expiry with no recent posts. Renew or retire it.'),
          'autopost-nudge:'||rr.id::text);
        v_nudged:=v_nudged+1;
      exception when others then null;
      end;
    end if;
  end loop;
  return jsonb_build_object('expired',v_expired,'nudged',v_nudged);
end $$;

-- acknowledge_rule_posts: bookkeeper+ human ACK of the rule-post feed. Agent
-- identities are hard-refused (CLR03, the acknowledge_sweep_run pattern).
create function clara.acknowledge_rule_posts(p_run_ids uuid[],p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_acked int:=0; w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot acknowledge a rule post' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_run_ids is null or array_length(p_run_ids,1) is null then
    raise exception 'run ids are required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'acknowledge_rule_posts',p_op_key,
    clara._hash(jsonb_build_object('runs',to_jsonb(p_run_ids),'actor',c.actor)));
  if v_dedupe is not null then return v_dedupe; end if;
  foreach v_id in array p_run_ids loop
    update clara.rule_post_runs set acknowledged_by=c.actor,acknowledged_at=now()
      where id=v_id and firm_id=c.firm and acknowledged_at is null;
    if found then v_acked:=v_acked+1; end if;
  end loop;
  perform clara._audit(c.firm,c.actor,null,null,'acknowledge_rule_posts',null,
    jsonb_build_object('runs',to_jsonb(p_run_ids),'acknowledged',v_acked,'op_key',p_op_key));
  return clara._finish_op(c.firm,'acknowledge_rule_posts',p_op_key,
    jsonb_build_object('acknowledged',v_acked));
end $$;

-- get_rule_post_run: the Lane-D FLAT receipt hydrate (amount + posts_* DB-computed;
-- the UI computes nothing). status = 'reversed' once the posted entry is reversed.
create function clara.get_rule_post_run(p_run uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record; r record; cr record; e record; v_amount bigint; v_cp text;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  select * into r from clara.rule_post_runs where id=p_run and firm_id=c.firm;
  if not found then return null; end if;
  select * into cr from clara.coding_rules where id=r.rule_id;
  select * into e from clara.journal_entries where id=r.entry_id;
  select coalesce(sum(debit_cents),0) into v_amount from clara.journal_lines where entry_id=r.entry_id;
  select cp.name into v_cp from clara.journal_lines l
    join clara.counterparties cp on cp.id=clara._canonical_counterparty(e.client_id,l.counterparty_id)
    where l.entry_id=r.entry_id and l.counterparty_id is not null order by l.line_no limit 1;
  return jsonb_build_object('run_id',r.id,'rule_id',r.rule_id,'entry_id',r.entry_id,
    'direction',cr.direction,'posted_at',r.posted_at,
    'acknowledged_by',r.acknowledged_by,'acknowledged_at',r.acknowledged_at,
    'amount_cents',v_amount,'account_code',cr.account_code,'counterparty_name',v_cp,
    'posting_date',e.posting_date,
    'status',case when e.reversed_by is not null then 'reversed' else 'posted' end);
end $$;

-- list_autopost_rules: the manage surface (proposed + live rules). posts_in_window +
-- posts_remaining are DB-emitted (the UI must not compute counts). Firm-scoped;
-- optional {client_id} scope like list_review_queue.
create function clara.list_autopost_rules(p_scope jsonb) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record; v_client uuid; v_rows jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  if p_scope is not null and p_scope ? 'client_id' then
    begin v_client:=(p_scope->>'client_id')::uuid;
    exception when others then raise exception 'scope client_id is malformed' using errcode='CLR10'; end;
    if not exists(select 1 from clara.clients where id=v_client and firm_id=c.firm) then
      raise exception 'client not in your firm' using errcode='CLR11';
    end if;
  end if;
  select coalesce(jsonb_agg(q.obj order by (q.obj->>'created_at') desc),'[]'::jsonb) into v_rows from (
    select jsonb_build_object(
      'rule_id',r.id,'counterparty_id',r.counterparty_id,'counterparty_name',cp.name,
      'direction',r.direction,'account_code',r.account_code,'account_name',a.name,
      'amount_cap_cents',r.amount_cap_cents,'frequency_window',r.frequency_window,
      'window_max_posts',r.window_max_posts,'posts_in_window',v.posts_in_window,
      'posts_remaining',greatest(r.window_max_posts - v.posts_in_window,0),
      'expires_at',r.expires_at,'status',r.status,'signed_by',r.signed_by,
      'signed_at',r.signed_at,'supersedes_rule_id',r.supersedes_rule_id,
      'created_at',r.created_at) as obj
    from clara.coding_rules r
    join clara.counterparties cp on cp.id=r.counterparty_id
    join clara.coa_accounts a on a.client_id=r.client_id and a.account_code=r.account_code
    cross join lateral (select count(*)::int as posts_in_window from clara.rule_post_runs pr
      where pr.rule_id=r.id and pr.posted_at >= case when r.frequency_window='monthly'
        then (date_trunc('month',now() at time zone 'utc') at time zone 'utc')
        else now()-interval '30 days' end) v
    where r.firm_id=c.firm and r.rule_type='autopost' and r.status in ('proposed','live')
      and (v_client is null or r.client_id=v_client)
  ) q;
  return v_rows;
end $$;

-- list_notifications: firm-scoped read over the as-built notifications surface,
-- optionally filtered to a set of kinds (Lane D queries the autopost kinds).
create function clara.list_notifications(p_scope jsonb, p_kinds text[]) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record; v_client uuid; v_rows jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  if p_scope is not null and p_scope ? 'client_id' then
    begin v_client:=(p_scope->>'client_id')::uuid;
    exception when others then raise exception 'scope client_id is malformed' using errcode='CLR10'; end;
    if not exists(select 1 from clara.clients where id=v_client and firm_id=c.firm) then
      raise exception 'client not in your firm' using errcode='CLR11';
    end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb) into v_rows
    from clara.notifications n
    where n.firm_id=c.firm
      and (v_client is null or n.client_id=v_client)
      and (p_kinds is null or n.kind = any(p_kinds));
  return v_rows;
end $$;

-- retire_autopost_rule: human MANUAL retire. bookkeeper+ (retiring REDUCES authority
-- = the safe direction; only SIGNING needs admin+). One-way to status='retired'.
create function clara.retire_autopost_rule(p_rule uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; r record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_rule is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'retirement reason is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'retire_autopost_rule',p_op_key,
    clara._hash(jsonb_build_object('rule',p_rule,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into r from clara.coding_rules where id=p_rule for update;
  if not found or r.firm_id<>c.firm then raise exception 'rule not found' using errcode='CLR11'; end if;
  if r.rule_type<>'autopost' or r.status not in ('proposed','live') then
    raise exception 'rule cannot be retired'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  update clara.coding_rules set status='retired',retired_by=c.actor,
    retired_at=now(),retire_reason=btrim(p_reason) where id=p_rule;
  perform clara._audit(c.firm,c.actor,null,null,'retire_autopost_rule',null,
    jsonb_build_object('rule',p_rule,'reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_rule.retired',r.client_id,c.actor,null,null,null,null,null,
    jsonb_build_object('rule_id',p_rule,'reason',p_reason,'tier','autopost'));
  return clara._finish_op(c.firm,'retire_autopost_rule',p_op_key,
    jsonb_build_object('rule_id',p_rule,'status','retired'));
end $$;

-- =====================================================================
-- S6 — DOCUMENT-PIPELINE CoRs. The attribution write-gate, the both-lanes facts
-- writer, the local_facts enqueue branch, the LANE-keyed egress claim gate, and the
-- retired fixture-engine default. All same-arity; the OCR/Azure paths byte-identical.
-- =====================================================================

-- persist_document_extraction CoR (#3): a DB-ENFORCED attribution write-gate. For a
-- structured_parse extraction, any region whose field_path matches the attribution
-- patterns (%tin%/%ssm%/%account%) MUST be on the DB allowlist (the two deliberate
-- supplier keys) or the write refuses — so a crafted XML / buggy mapper can never
-- smuggle a BUYER tin into an attribution-visible name. OCR lane untouched (the
-- shared verbatim-field_path trust model is an inherited residual, recorded).
create or replace function clara.persist_document_extraction(p_task uuid, p_status text, p_page_count int,
    p_envelope jsonb, p_regions jsonb, p_error_code text, p_vendor_op_ref text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_dedupe jsonb; v_ext uuid; v_event text; elem jsonb; v_ekind text;
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
  v_ekind:=case when t.lane='ocr' then 'ocr' else 'structured_parse' end;
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,v_ekind,
      t.version_n,p_status,p_page_count,coalesce(p_envelope,'{}'::jsonb))
    on conflict(document_id,engine_id,version_n) do nothing returning id into v_ext;
  if v_ext is null then
    select id into v_ext from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n;
  elsif p_status='done' then
    for elem in select value from jsonb_array_elements(coalesce(p_regions,'[]'::jsonb)) loop
      if v_ekind='structured_parse'
         and (lower(coalesce(elem->>'field_path','')) like '%tin%'
           or lower(coalesce(elem->>'field_path','')) like '%ssm%'
           or lower(coalesce(elem->>'field_path','')) like '%brn%'
           or lower(coalesce(elem->>'field_path','')) like '%account%')
         and lower(coalesce(elem->>'field_path','')) not in
             ('myinvois.supplier_tin','myinvois.supplier_brn') then
        raise exception 'structured_parse attribution field_path % is not on the allowlist',
          elem->>'field_path'
          using errcode='CLR10',detail='{"reason":"attribution_field_not_allowed"}';
      end if;
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

-- persist_invoice_facts CoR (S6): accept BOTH facts lanes; take engine_id from the
-- TASK row (no more hardcode — Azure snapshot on invoice_facts, clara-myinvois:v1 on
-- local_facts); whitelist += the §3.2 keys; monetary set += total_excl_tax/tax_total;
-- settle a processing call ONLY for the Azure lane (local parse is free); stamp
-- document_kind by lane (invoice / e_invoice_xml). AP/Azure path byte-identical.
create or replace function clara.persist_invoice_facts(p_task uuid, p_fields jsonb,
    p_raw_sha256 text, p_normalization_version text, p_pages_used int,
    p_envelope jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; d record; v_ext uuid; v_existing uuid; v_entry uuid; v_date date;
  elem jsonb; v_path text; v_raw text; v_page int; v_conf numeric;
  v_cents bigint; v_region uuid; v_token uuid;
  v_newstate jsonb; v_p_payable bigint; v_p_expense bigint;
  v_eflags jsonb; v_ekind text;
begin
  select * into t from clara.document_processing_tasks where id=p_task;
  if not found or t.lane not in ('invoice_facts','local_facts') then
    raise exception 'invoice-facts task not found' using errcode='CLR16';
  end if;
  if t.status='done' then
    select id into v_existing from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id
        and version_n=t.version_n and engine_kind='invoice_facts';
    return jsonb_build_object('task_id',p_task,'extraction_id',v_existing,
      'status','done','replayed',true);
  end if;
  if jsonb_typeof(p_fields)<>'array' or p_raw_sha256 !~ '^[0-9a-f]{64}$'
     or p_normalization_version is null or btrim(p_normalization_version)=''
     or p_pages_used is null or p_pages_used<0 then
    raise exception 'invoice-facts payload is malformed' using errcode='CLR10';
  end if;

  perform 1 from clara.document_filings f
    where f.document_id=t.document_id and f.retired_at is null
    order by f.id for update;
  perform 1 from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id for update of e;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if t.status='done' then
    select id into v_existing from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id
        and version_n=t.version_n and engine_kind='invoice_facts';
    return jsonb_build_object('task_id',p_task,'extraction_id',v_existing,
      'status','done','replayed',true);
  end if;
  if t.status<>'running' then
    raise exception 'invoice-facts task is not running' using errcode='CLR16';
  end if;

  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,
      'invoice_facts',t.version_n,'done',p_pages_used,
      coalesce(p_envelope,'{}'::jsonb) || jsonb_build_object('raw_sha256',p_raw_sha256,
        'normalization_version',p_normalization_version,
        'field_count',jsonb_array_length(p_fields)))
    returning id into v_ext;

  for elem in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(elem)<>'object' or nullif(elem->>'field_path','') is null
       or not (elem ? 'page') or not (elem ? 'polygon') then
      raise exception 'invoice-facts field is malformed' using errcode='CLR10';
    end if;
    v_path:=elem->>'field_path';
    if v_path not in ('invoice.total','invoice.amount_due','invoice.currency',
        'invoice.vendor_name','invoice.vendor_registration','invoice.invoice_id',
        'invoice.invoice_date','invoice.deposit',
        'invoice.customer_name','invoice.customer_registration','invoice.customer_taxid',
        'invoice.type_code','invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
        'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid') then
      raise exception 'unsupported invoice field_path %',v_path using errcode='CLR10';
    end if;
    begin
      v_page:=(elem->>'page')::int;
      v_conf:=(elem->>'confidence')::numeric;
    exception when others then
      raise exception 'invoice-facts page/confidence is malformed' using errcode='CLR10';
    end;
    if v_page<1 or v_conf<0 or v_conf>1
       or jsonb_typeof(elem->'polygon') not in ('array','object') then
      raise exception 'invoice-facts locator/confidence is invalid' using errcode='CLR10';
    end if;
    v_raw:=elem->>'value_raw';
    v_cents:=case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit',
                  'invoice.total_excl_tax','invoice.tax_total','invoice.rounding')
                  then clara._normalize_invoice_cents(v_raw) else null end;
    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,
        field_path,text_content,engine_confidence,monetary_raw,monetary_cents)
      values(t.firm_id,v_ext,'page_polygon',
        jsonb_build_object('page',v_page,'polygon',elem->'polygon'),
        v_path,v_raw,v_conf,
        case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit',
             'invoice.total_excl_tax','invoice.tax_total','invoice.rounding')
             then v_raw end,v_cents)
      returning id into v_region;
    if v_path='invoice.invoice_date' and v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
      begin v_date:=v_raw::date; exception when others then v_date:=null; end;
    end if;
  end loop;

  -- FIX-2/3/4 + FIX-3/4/5 v4 (the DB owns the number — REJECT bad facts at the WRITE BOUNDARY
  -- rather than min()-selecting one at read time, where SQL NULL semantics silently drop a
  -- blank). All checks are inert for the Azure/OCR corpus (one region per field, no rounding
  -- fact, no conflicts) and for the MyInvois parser (mapFactsFields emits each path at most
  -- once + always a type_code), so the AP exact-diff and the live local_facts producer are
  -- unaffected.
  --   (a) CONFLICTING duplicates, UNIFORM over EVERY per-field fact: a field appearing more
  --     than once with ANY differing value — INCLUDING a blank/NULL vs a real value — is a
  --     contradiction the DB refuses; IDENTICAL duplicates collapse. The v3 checks used
  --     count(distinct <value>), which IGNORES a NULL/blank (SQL semantics) — so a crafted
  --     ['', real] pair slipped past and min() then selected the blank -> NULL, re-opening
  --     polarity (type_code) / direction (customer_taxid) / duplicate-bill (invoice_id/date).
  --     Coalescing to a control-char SENTINEL (chr(1), never a real cents/text value) makes
  --     the blank a DISTINCT value, so ['', '02'] / ['', clientTIN] / ['', 'N/A'] all conflict.
  --     Monetary fields compare on normalized cents; text fields on the trimmed value. The
  --     text set now also covers invoice_id / invoice_date / tax_breakdown / myinvois_* (a
  --     conflicting id/date/breakdown was otherwise min-selected past the guard).
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.total','invoice.amount_due','invoice.deposit',
        'invoice.total_excl_tax','invoice.tax_total','invoice.rounding')
    group by r.field_path
    having count(distinct coalesce(r.monetary_cents::text, chr(1))) > 1
  ) or exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.type_code','invoice.currency','invoice.vendor_name',
        'invoice.vendor_registration','invoice.customer_name','invoice.customer_registration',
        'invoice.customer_taxid','invoice.invoice_id','invoice.invoice_date',
        'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid')
    group by r.field_path
    having count(distinct coalesce(nullif(btrim(r.text_content),''), chr(1))) > 1
  ) then
    raise exception 'invoice-facts payload carries conflicting duplicate facts for a single field'
      using errcode='CLR10';
  end if;
  --   (b) a PRESENT-but-malformed monetary value (raw text stated, cents normalize to NULL)
  --     is REFUSED for every REQUIRED monetary field — never silently treated as zero or
  --     "not stated" (item 5). Covers amount_due / deposit ('N/A' -> NULL was accepted as
  --     "no due" and defaulted deposit to 0, re-opening the total/deposit corroboration
  --     guards) and total_excl_tax / tax_total / rounding (a stated-but-unparseable component
  --     is a data error). NB: invoice.total is DELIBERATELY EXCLUDED — an unreadable OCR total
  --     still persists (non-corroborated: v_total NULL => corroborated=false, fail-closed),
  --     exactly as before; a blank (empty) raw is "not stated" and is unaffected (nullif
  --     drops it, so an omitted/empty field never trips this).
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.amount_due','invoice.deposit',
        'invoice.total_excl_tax','invoice.tax_total','invoice.rounding')
      and nullif(btrim(r.monetary_raw),'') is not null and r.monetary_cents is null
  ) then
    raise exception 'invoice-facts monetary value is malformed' using errcode='CLR10';
  end if;
  --   (2c) a local-facts (MyInvois structured) payload MUST state a type_code — a structured
  --     e-invoice with no document type cannot be polarity-bound. OCR/Azure (invoice_facts)
  --     carry no type_code and are unaffected.
  if t.lane='local_facts'
     and not exists(select 1 from clara.document_regions
       where extraction_id=v_ext and field_path='invoice.type_code'
         and nullif(btrim(text_content),'') is not null) then
    raise exception 'a local-facts payload must state invoice.type_code' using errcode='CLR10';
  end if;

  -- Only the Azure lane carries a processing-call reservation; the local parse is free.
  if t.lane='invoice_facts' then
    perform clara._settle_processing_call(p_task,p_pages_used);
  end if;
  update clara.document_processing_tasks set status='done',vendor_op_ref=p_raw_sha256,
    finished_at=now() where id=p_task;
  select * into d from clara.documents where id=t.document_id;
  update clara.documents set
    document_kind=case when t.lane='local_facts' then 'e_invoice_xml' else 'invoice' end,
    financial_date=coalesce(v_date,financial_date) where id=t.document_id;

  v_newstate:=clara._invoice_fact_state(t.document_id);
  for v_entry in
    select e.id from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id
  loop
    select coding_kind,coalesce(flags,'{}'::jsonb) into v_ekind,v_eflags
      from clara.journal_entries where id=v_entry;
    v_eflags:=v_eflags - 'amount_exception' - 'amount_override';
    if v_ekind='supplier_bill'
       and coalesce((v_newstate->>'corroborated')::boolean,false) then
      select coalesce(sum(l.credit_cents),0) into v_p_payable
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_p_expense
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_type='expense';
      if v_p_payable<>(v_newstate->>'total_cents')::bigint
         or v_p_expense<>(v_newstate->>'total_cents')::bigint then
        v_eflags:=v_eflags||jsonb_build_object('amount_exception',jsonb_build_object(
          'machine_total_cents',(v_newstate->>'total_cents')::bigint,
          'proposed_cents',v_p_payable,
          'fact_hash',v_newstate->>'total_fact_hash','at',now()));
      end if;
    end if;
    update clara.journal_entries set revision_token=gen_random_uuid(),
      flags=v_eflags,updated_at=now()
      where id=v_entry and status='draft' returning revision_token into v_token;

    insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
        revision_token,actor_kind,actor,reason,header,legs,rule_decision_id,evidence_refs)
      select j.firm_id,j.client_id,j.id,
        coalesce((select max(r.revision_no)+1 from clara.journal_entry_revisions r
          where r.entry_id=j.id),0),v_token,'facts',null,'facts_rotated',
        to_jsonb(j)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
        coalesce((select jsonb_agg(jsonb_build_object('line_no',l.line_no,
          'account_code',l.account_code,'debit_cents',l.debit_cents,
          'credit_cents',l.credit_cents,'side',case when l.debit_cents>0 then 'debit'
            else 'credit' end,'counterparty_id',l.counterparty_id,
          'description',l.description) order by l.line_no)
          from clara.journal_lines l where l.entry_id=j.id),'[]'::jsonb),
        (select rd.id from clara.rule_decisions rd where rd.entry_id=j.id
          order by rd.created_at desc,rd.id desc limit 1),
        coalesce((select jsonb_agg(jsonb_build_object('evidence_id',ev.id,
          'region_id',ev.region_id,'fact_hash',ev.fact_hash,
          'provenance_tier',ev.provenance_tier) order by ev.id)
          from clara.entry_evidence ev where ev.entry_id=j.id),'[]'::jsonb)
      from clara.journal_entries j where j.id=v_entry;
  end loop;
  perform clara._audit(t.firm_id,null,null,null,'persist_invoice_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,
      'version',t.version_n,'pages',p_pages_used));
  perform clara._append_event(t.firm_id,'document.invoice_facts_completed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,
      'extraction_id',v_ext,'version_n',t.version_n));
  return jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status','done');
end $$;

-- _enqueue_invoice_facts_core CoR (S6): application/xml docs enqueue a
-- lane='local_facts' task with engine_id='clara-myinvois:v1' (NEVER lane='invoice_facts'
-- — the frozen Azure consumer claims that lane); pdf/image keep the Azure invoice_facts
-- lane unchanged. The consent-evidence exemption stays FIRST. The local lane carries
-- NO Azure page reservation (local parse is free). Same arity, owner-only.
create or replace function clara._enqueue_invoice_facts_core(p_document uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
  v_lane text; v_engine text;
begin
  select * into d from clara.documents where id=p_document;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  -- 0014: a consent-evidence document is a LEGAL artifact — never facts-extracted.
  if d.document_kind='consent_evidence' then
    return jsonb_build_object('document_id',p_document,'status','skipped_consent_evidence');
  end if;
  -- 0015: mime chooses the lane + engine. pdf/image => Azure invoice_facts; xml =>
  -- the local MyInvois lane; anything else is not facts-eligible.
  if lower(coalesce(d.mime_type,''))='application/pdf'
     or lower(coalesce(d.mime_type,'')) like 'image/%' then
    v_lane:='invoice_facts'; v_engine:='azure-di:prebuilt-invoice:2024-11-30';
  elsif lower(coalesce(d.mime_type,'')) in ('application/xml','text/xml') then
    v_lane:='local_facts'; v_engine:='clara-myinvois:v1';
  else
    return jsonb_build_object('document_id',p_document,'status','skipped_type');
  end if;
  select e.id into v_task from clara.document_extractions e
    where e.document_id=p_document and e.engine_kind='invoice_facts' and e.status='done'
    order by e.version_n desc limit 1;
  if v_task is not null then
    return jsonb_build_object('document_id',p_document,'status','already_completed',
      'extraction_id',v_task);
  end if;
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane
      and status in ('queued','held_egress','running')
    order by id limit 1;
  if found then
    return jsonb_build_object('task_id',t.id,'document_id',p_document,'status',t.status);
  end if;
  select coalesce(sum(attempt_count),0)::int,
         coalesce(max(version_n),0)+1
    into v_attempts,v_version from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane;
  if v_attempts >= 3 then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,finished_at)
      values(d.firm_id,p_document,v_engine,'{}'::jsonb,
        v_version,v_lane,'failed','attempt_cap',now()) returning id into v_task;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','attempt_cap');
  end if;
  insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
      version_n,lane,status)
    values(d.firm_id,p_document,v_engine,'{}'::jsonb,
      v_version,v_lane,'queued')
    on conflict do nothing returning id into v_task;
  if v_task is null then
    select id,status into v_task,t.status from clara.document_processing_tasks
      where document_id=p_document and lane=v_lane
        and status in ('queued','held_egress','running') order by id limit 1;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',t.status);
  end if;
  -- Only the Azure lane consumes the page budget; the local parse reserves nothing.
  if v_lane='invoice_facts' then
    v_pages := greatest(coalesce(d.page_count,1),1);
    begin
      perform clara._reserve_processing_call(v_task,v_pages);
    exception when sqlstate 'CLR18' then
      update clara.document_processing_tasks set status='failed',error_code='budget',
        finished_at=now() where id=v_task;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason','budget');
    end;
  end if;
  return jsonb_build_object('task_id',v_task,'document_id',p_document,'status','queued');
end $$;

-- claim_document_processing_task CoR (S6, SECURITY-CRITICAL): the egress hold stays
-- LANE-keyed. Kill-switch holds lane in ('ocr','invoice_facts') (structured_parse is
-- DROPPED from the hold — a DECLARED change; it has never egressed and runs in the
-- local worker thread); consent holds invoice_facts (unchanged, cross-border scope);
-- local lanes (structured_parse, local_facts, none) claim without either hold. The
-- S1 lane<->engine CHECK refuses a mis-declared task at INSERT. Everything else
-- (held_egress apply, replay, concurrency cap, dispatch receipt) byte-identical.
create or replace function clara.claim_document_processing_task(p_task uuid,
    p_workflow_run_id text,p_egress_approved boolean) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  t record; d record; v_cap int; v_running int; v_attempts int;
  v_clients int; v_consented int; v_hold_reason text;
begin
  if p_workflow_run_id is null or btrim(p_workflow_run_id)='' then
    raise exception 'workflow_run_id is required' using errcode='CLR10';
  end if;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task not found' using errcode='CLR16'; end if;
  select storage_path,sha256,mime_type,byte_size into d
    from clara.documents where id=t.document_id;

  -- The lease check precedes EVERY dispatching branch. Only the two EGRESSING lanes
  -- (ocr, invoice_facts) are kill-switch-gated; invoice_facts additionally requires
  -- every active filing client to hold a live consent. Local lanes never hold.
  if t.lane in ('ocr','invoice_facts')
     and not coalesce(p_egress_approved,false) then
    v_hold_reason:='kill_switch';
  elsif t.lane='invoice_facts' then
    select count(distinct f.client_id)::int,
      count(distinct f.client_id) filter(where exists(
        select 1 from clara.client_egress_consents c
        where c.client_id=f.client_id and c.revoked_at is null))::int
      into v_clients,v_consented from clara.document_filings f
      where f.document_id=t.document_id and f.retired_at is null;
    if coalesce(v_clients,0)=0 or coalesce(v_consented,0)=0 then
      v_hold_reason:='no_consent';
    elsif v_consented<v_clients then
      v_hold_reason:='partial_consent';
    end if;
  end if;
  if v_hold_reason is not null then
    if t.status in ('queued','running') then
      update clara.document_processing_tasks set status='held_egress',
        workflow_run_id=null,started_at=null,vendor_op_ref=null where id=p_task;
      if t.lane='ocr' then
        update clara.documents set extraction_status='held_egress' where id=t.document_id;
      end if;
    elsif t.status<>'held_egress' then
      raise exception 'processing task is not dispatchable' using errcode='CLR16';
    end if;
    return jsonb_build_object('task_id',p_task,'status','held_egress',
      'workflow_run_id',null,'payload',jsonb_build_object(
        'clr','CLR28','reason',v_hold_reason));
  end if;
  if t.status='running' and t.workflow_run_id=p_workflow_run_id then
    return jsonb_build_object('task_id',p_task,'status','running','replayed',true,
      'document_id',t.document_id,'firm_id',t.firm_id,'lane',t.lane,
      'storage_path',d.storage_path,'sha256',d.sha256,
      'mime_type',d.mime_type,'byte_size',d.byte_size);
  end if;
  if t.status<>'queued' then raise exception 'processing task is not queued' using errcode='CLR16'; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(t.firm_id::text));
  if t.lane='invoice_facts' then
    select coalesce(sum(attempt_count),0)::int into v_attempts
      from clara.document_processing_tasks where document_id=t.document_id
        and lane='invoice_facts';
    if v_attempts>=3 then
      update clara.document_processing_tasks set status='failed',error_code='attempt_cap',
        finished_at=now() where id=p_task;
      perform clara._refund_processing_call(p_task,'attempt_cap');
      perform clara._append_event(t.firm_id,'document.invoice_facts_failed',null,null,null,null,
        null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason','attempt_cap'));
      return jsonb_build_object('task_id',p_task,'status','failed','reason','attempt_cap');
    end if;
  end if;
  select coalesce(l.ocr_concurrency,2) into v_cap from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select count(*)::int into v_running from clara.document_processing_tasks
    where firm_id=t.firm_id and lane in ('ocr','invoice_facts') and status='running';
  if t.lane in ('ocr','invoice_facts') and v_running>=v_cap then
    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';
  end if;
  update clara.document_processing_tasks set status='running',
    workflow_run_id=p_workflow_run_id,started_at=now(),attempt_count=attempt_count+1
    where id=p_task;
  if t.lane='ocr' then update clara.documents set extraction_status='running' where id=t.document_id; end if;
  return jsonb_build_object('task_id',p_task,'status','running',
    'workflow_run_id',p_workflow_run_id,'document_id',t.document_id,
    'firm_id',t.firm_id,'lane',t.lane,'storage_path',d.storage_path,
    'sha256',d.sha256,'mime_type',d.mime_type,'byte_size',d.byte_size);
end $$;

-- finalize_document_intake CoR (S1, probe-P1): RETIRE the 'fixture-engine' default.
-- The default becomes the test-namespace engine 'clara-fixture:v1' (admitted on any
-- lane by the S1 escape), so a no-engine call (runtime intake.mjs + the DB fixtures)
-- keeps applying under the new lane<->engine CHECK. Body byte-identical otherwise;
-- SAME ARITY (only the DEFAULT changes). Real intakes pass a real engine snapshot.
create or replace function clara.finalize_document_intake(p_intake uuid, p_token_hash text default null,
    p_engine_id text default 'clara-fixture:v1', p_engine_config jsonb default '{}'::jsonb,
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

reset role;

-- =====================================================================
-- PUBLIC lockdown (0011:4012 idiom). The `alter default privileges … revoke
-- execute … from public` set by 0011 does NOT persist a pg_default_acl row in
-- this environment (verified: pg_default_acl is empty at the 0014 state and a
-- fresh clara_fn_owner function is created proacl=NULL ⟹ PUBLIC keeps the default
-- EXECUTE). So a NEW fn that relies on the ADP alone — or one that is merely
-- grant-ed to a role (a grant materializes proacl INCLUDING the default PUBLIC
-- entry) — leaks PUBLIC execute, which the S8 tail asserts against. Strip PUBLIC
-- from every clara function in one shot exactly as 0011 did; the security-critical
-- surfaces already carry their own explicit per-fn revokes above (belt+braces).
-- All callers are specific roles (0 clara fns hold PUBLIC execute at 0014), so this
-- is a no-op for existing functions and only closes the new 0015 surfaces.
-- =====================================================================
revoke execute on all functions in schema clara from public;

-- =====================================================================
-- GRANTS for the NEW functions. Same-arity CoRs preserve their ACLs (Postgres keeps
-- the ACL across create-or-replace); the tail (S8) asserts them intact. Only NEW
-- surfaces need an explicit grant. Floors are body-enforced (_human_ctx), grants
-- coarse. execute_rule_post is granted LOGIN-DIRECT above (never here).
-- =====================================================================
grant execute on function
  clara.sign_autopost_rule(uuid,text),
  clara.propose_autopost_rule(jsonb,text),
  clara.retire_autopost_rule(uuid,text,text),
  clara.acknowledge_rule_posts(uuid[],text),
  clara.get_rule_post_run(uuid),
  clara.list_autopost_rules(jsonb),
  clara.list_notifications(jsonb,text[])
to clara_authenticated;

grant execute on function
  clara.reconcile_autopost_rules()
to clara_runtime;

-- =====================================================================
-- S8 — TAIL ASSERTIONS (0011/0013 idiom): the AB-3 boundary re-pin, PUBLIC=0 on
-- every touched fn, the private-core zero-grant lockdowns, the execute_rule_post
-- isolation matrix, the CoR ACL preservations, the new-table RLS/grant posture, the
-- new CHECK shapes, the entry.rule_posted taxonomy pair, one-overload, and the
-- load-bearing body markers.
-- =====================================================================
do $$
declare
  v_src text; v_public int; v_extra int; v_name text; v_count int; v_def text;
  v_recreated text[]:=array[
    'persist_invoice_facts','persist_document_extraction','_enqueue_invoice_facts_core',
    'claim_document_processing_task','_invoice_fact_state','_document_direction',
    'finalize_document_intake','_resolve_counterparty','_approve_entry_core','approve_entry',
    'execute_rule_post','_draft_entry_core','revise_entry','merge_counterparties',
    '_coding_lane_core','get_doc_entry_diff','_assert_supplier_bill_shape',
    '_assert_sales_invoice_shape','_tf_entry_immutable','_tf_coding_rule_update',
    'sign_autopost_rule','propose_autopost_rule','reconcile_autopost_rules',
    'acknowledge_rule_posts','get_rule_post_run','record_rule_resolution',
    'list_autopost_rules','list_notifications','retire_autopost_rule',
    '_tax_breakdown_cents'];
  v_new_tables text[]:=array['rule_post_runs','rule_post_skips'];
  v_zero_grant text[]:=array[
    'clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
    'clara._document_direction(uuid,uuid)',
    'clara._resolve_counterparty(uuid,jsonb)',
    'clara._coding_lane_core(uuid,uuid)',
    'clara._assert_sales_invoice_shape(uuid)'];
  v_sig text;
begin
  -- (1) AB-3 boundary still intact (login-direct grant + the engine predicate).
  if not pg_catalog.has_function_privilege('clara_runtime_login',
       'clara.record_rule_resolution(uuid,text)','execute')
     or pg_catalog.has_function_privilege('clara_runtime',
       'clara.record_rule_resolution(uuid,text)','execute') then
    raise exception '0015 AB-3 login-direct grant assertion failed' using errcode='CLR10';
  end if;
  if position('engine_kind in (''ocr'',''structured_parse'')' in lower(
      (select p.prosrc from pg_proc p where p.oid=
        'clara.record_rule_resolution(uuid,text)'::regprocedure)))=0 then
    raise exception '0015 AB-3 engine predicate assertion failed' using errcode='CLR10';
  end if;

  -- (2) PUBLIC holds zero EXECUTE on every recreated/new fn.
  foreach v_name in array v_recreated loop
    select count(*)::int into v_public
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where n.nspname='clara' and p.proname=v_name and a.grantee=0 and a.privilege_type='EXECUTE';
    if v_public<>0 then
      raise exception '0015 PUBLIC execute leaked on clara.%',v_name using errcode='CLR10';
    end if;
    -- one-overload: a same-arity CoR / new fn must be single-signature.
    select count(*)::int into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=v_name;
    if v_count<>1 then
      raise exception '0015 overload assertion failed: clara.% has % overloads',v_name,v_count
        using errcode='CLR10';
    end if;
  end loop;

  -- (3) private cores leaked ZERO non-owner EXECUTE (the _open_question_core precedent).
  foreach v_sig in array v_zero_grant loop
    select count(*)::int into v_extra
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
    where p.oid=v_sig::regprocedure and r.rolname<>'clara_fn_owner';
    if v_extra<>0 then
      raise exception '0015 private core % leaked % non-owner grant(s)',v_sig,v_extra using errcode='CLR10';
    end if;
  end loop;

  -- (4) execute_rule_post isolation matrix: login=t; group+wake+agent_ro+authenticated=f.
  if not pg_catalog.has_function_privilege('clara_runtime_login','clara.execute_rule_post(uuid,text)','execute')
     or pg_catalog.has_function_privilege('clara_runtime','clara.execute_rule_post(uuid,text)','execute')
     or pg_catalog.has_function_privilege('clara_wake_interactive','clara.execute_rule_post(uuid,text)','execute')
     or pg_catalog.has_function_privilege('clara_wake_proactive','clara.execute_rule_post(uuid,text)','execute')
     or pg_catalog.has_function_privilege('clara_agent_ro','clara.execute_rule_post(uuid,text)','execute')
     or pg_catalog.has_function_privilege('clara_authenticated','clara.execute_rule_post(uuid,text)','execute') then
    raise exception '0015 execute_rule_post isolation matrix failed' using errcode='CLR10';
  end if;

  -- (5) CoR ACL preservation (the surfaces keep their as-built grantees).
  if not pg_catalog.has_function_privilege('clara_authenticated','clara.approve_entry(uuid,uuid,text,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.merge_counterparties(uuid,uuid,uuid,text,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.coding_lane(uuid,uuid)','execute')
     or not pg_catalog.has_function_privilege('clara_agent_ro','clara.coding_lane(uuid,uuid)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.get_doc_entry_diff(uuid,uuid)','execute')
     or not pg_catalog.has_function_privilege('clara_agent_ro','clara.get_doc_entry_diff(uuid,uuid)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime','clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime','clara.claim_document_processing_task(uuid,text,boolean)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime','clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime','clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)','execute') then
    raise exception '0015 CoR ACL preservation assertion failed' using errcode='CLR10';
  end if;
  -- new-surface grants landed on the intended audiences.
  if not pg_catalog.has_function_privilege('clara_authenticated','clara.sign_autopost_rule(uuid,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.propose_autopost_rule(jsonb,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.retire_autopost_rule(uuid,text,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.acknowledge_rule_posts(uuid[],text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.get_rule_post_run(uuid)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.list_autopost_rules(jsonb)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.list_notifications(jsonb,text[])','execute')
     or not pg_catalog.has_function_privilege('clara_runtime','clara.reconcile_autopost_rules()','execute')
     or pg_catalog.has_function_privilege('clara_agent_ro','clara.sign_autopost_rule(uuid,text)','execute') then
    raise exception '0015 new-surface grant assertion failed' using errcode='CLR10';
  end if;

  -- (6) adversarial #11: the human approve wrapper NEVER sets checked_via_rule_id
  -- (structural — a human approve always leaves that column NULL).
  if position('checked_via_rule_id' in
      (select p.prosrc from pg_proc p where p.oid='clara.approve_entry(uuid,uuid,text,text)'::regprocedure))<>0 then
    raise exception '0015 approve_entry wrapper must not set checked_via_rule_id' using errcode='CLR10';
  end if;

  -- (7) load-bearing body markers.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure;
  if position('local_facts' in v_src)=0 or position('invoice.total_excl_tax' in v_src)=0 then
    raise exception '0015 persist_invoice_facts missing the local_facts / SST vocabulary' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._coding_lane_core(uuid,uuid)'::regprocedure;
  if position('invoice.vendor_registration' in v_src)=0 or position('_document_direction' in v_src)=0 then
    raise exception '0015 _coding_lane_core lost its vendor-registration / direction markers' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text)'::regprocedure;
  if position('myinvois.supplier_tin' in v_src)=0 or position('%brn%' in v_src)=0 then
    raise exception '0015 persist_document_extraction missing the attribution write-gate / brn' using errcode='CLR10';
  end if;
  -- AB-3 %brn% extension present + the engine predicate STILL verbatim (Lane-C).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.record_rule_resolution(uuid,text)'::regprocedure;
  if position('%brn%' in v_src)=0
     or position('engine_kind in (''ocr'',''structured_parse'')' in lower(v_src))=0 then
    raise exception '0015 record_rule_resolution AB-3 brn extension / engine predicate missing' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  if position('structured_parse' in v_src)<>0 then
    raise exception '0015 claim gate must no longer kill-switch structured_parse' using errcode='CLR10';
  end if;

  -- (7b) FIX-ROUND markers (the as-built cross-model review fixes). Each is a
  -- load-bearing security control; a future CoR that drops one must fail the migration.
  --  FIX-1 executor control-leg shape + FIX-6 CLR10 discrimination (execute_rule_post).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.execute_rule_post(uuid,text)'::regprocedure;
  if position('control_shape' in v_src)=0 or position('pg_exception_detail' in lower(v_src))=0 then
    raise exception '0015 execute_rule_post missing the control-shape / CLR10-discrimination fix' using errcode='CLR10';
  end if;
  --  FIX-1 (complete sales shape) + FIX-2 (type<->polarity binding).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._assert_sales_invoice_shape(uuid)'::regprocedure;
  if position('type_polarity_mismatch' in v_src)=0
     or position('only receivable, income, sst_output and rounding' in v_src)=0 then
    raise exception '0015 _assert_sales_invoice_shape missing the type-binding / complete-shape fix' using errcode='CLR10';
  end if;
  --  FIX-3 (cross-kind merge refusal).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.merge_counterparties(uuid,uuid,uuid,text,text)'::regprocedure;
  if position('cross_kind_merge' in v_src)=0 then
    raise exception '0015 merge_counterparties missing the cross-kind-merge guard' using errcode='CLR10';
  end if;
  --  FIX-4 (direction name-match) + FIX-5 (structured completeness / breakdown tie).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._document_direction(uuid,uuid)'::regprocedure;
  if position('client_aliases' in v_src)=0 or position('clara.clients' in v_src)=0 then
    raise exception '0015 _document_direction missing the registered-name / alias match fix' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state(uuid)'::regprocedure;
  if position('_tax_breakdown_cents' in v_src)=0 or position('rounding' in v_src)=0 then
    raise exception '0015 _invoice_fact_state missing the breakdown-tie / rounding fix' using errcode='CLR10';
  end if;
  --  SALES-AUTOPOST DEFERRAL (propose + sign refuse direction=sales).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.propose_autopost_rule(jsonb,text)'::regprocedure;
  if position('sales_autopost_deferred' in v_src)=0 then
    raise exception '0015 propose_autopost_rule missing the sales-autopost deferral' using errcode='CLR10';
  end if;

  -- (7c) RESIDUAL v2 markers (the SECOND adversarial re-verify fixes). Each closes a
  -- load-bearing authorization/accounting boundary; a future CoR dropping one must fail here.
  --  RESIDUAL-1/v3 executor: the laundering bound is now a COUNT+IDENTITY enumeration
  --  (v_outside_legs), replacing the v2 Σ|dr−cr| tolerance — see the (7d) v3 markers below.
  --  The sales-floor and supplier-bill defense-in-depth bounds stay.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.execute_rule_post(uuid,text)'::regprocedure;
  if position('v_outside_legs' in v_src)=0 then
    raise exception '0015 execute_rule_post missing the count+identity laundering bound (v3)' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._assert_sales_invoice_shape(uuid)'::regprocedure;
  if position('no material amount outside' in v_src)=0 then
    raise exception '0015 _assert_sales_invoice_shape missing the rounding-material bound (v2)' using errcode='CLR10';
  end if;
  --  RESIDUAL-1 + RESIDUAL-2 supplier-bill floor: the rounding-material bound + the
  --  supplier-bill type<->polarity refusal.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._assert_supplier_bill_shape(uuid)'::regprocedure;
  if position('no material amount in a rounding leg' in v_src)=0
     or position('type_polarity_mismatch' in v_src)=0 then
    raise exception '0015 _assert_supplier_bill_shape missing the rounding-bound / type-polarity fix (v2)' using errcode='CLR10';
  end if;
  --  RESIDUAL-2 supplier-bill type refusal also enforced at draft.
  select p.prosrc into v_src from pg_proc p where p.oid=
    'clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure;
  if position('cannot be coded as a plain bill' in v_src)=0 then
    raise exception '0015 _draft_entry_core missing the supplier-bill type refusal (v2)' using errcode='CLR10';
  end if;
  --  RESIDUAL-3 direction: the registration-vs-name contradiction abstain.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._document_direction(uuid,uuid)'::regprocedure;
  if position('names a different entity' in v_src)=0 then
    raise exception '0015 _document_direction missing the registration-vs-name contradiction abstain (v2)' using errcode='CLR10';
  end if;
  --  RESIDUAL-4 corroboration: single cardinality + breakdown-required-when-tax.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state(uuid)'::regprocedure;
  if position('v_tax_c' in v_src)=0 or position('breakdown REQUIRED when tax_total' in v_src)=0 then
    raise exception '0015 _invoice_fact_state missing the cardinality / breakdown-required fix (v2)' using errcode='CLR10';
  end if;

  -- (7d) RESIDUAL v3 markers (the THIRD adversarial re-verify — the count+identity
  -- laundering gate + the write-boundary duplicate/malformed/omitted-fact refusals + the
  -- purchase-side sst tie + the customer-identity direction). A future CoR dropping one fails.
  --  FIX-1+7 executor: count+identity enumeration (v_outside_legs) + the tied sst_output leg.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.execute_rule_post(uuid,text)'::regprocedure;
  if position('v_outside_legs' in v_src)=0 or position('v_sst_amt' in v_src)=0
     or position('v_outside_imbalance' in v_src)<>0 then
    raise exception '0015 execute_rule_post missing the v3 count+identity / tied-sst gate (or still carries the v2 Σ bound)' using errcode='CLR10';
  end if;
  --  FIX-2 v4 supplier-bill floor: a purchase admits NO sst_output leg (sst is SALES-only;
  --  supersedes the v3 purchase-side sst TIE — a tied leg is now refused outright).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._assert_supplier_bill_shape(uuid)'::regprocedure;
  if position('admits no sst_output leg' in v_src)=0 then
    raise exception '0015 _assert_supplier_bill_shape must refuse a purchase-side sst_output leg (v4)' using errcode='CLR10';
  end if;
  --  FIX-2/4 persist write-boundary: conflicting-duplicate + malformed-monetary + local-facts
  --  type-presence refusals ("the DB owns every number").
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure;
  if position('conflicting duplicate facts' in v_src)=0
     or position('monetary value is malformed' in v_src)=0
     or position('must state invoice.type_code' in v_src)=0 then
    raise exception '0015 persist_invoice_facts missing the write-boundary fact refusals' using errcode='CLR10';
  end if;
  --  FIX-3 direction: the buyer identity also resolves through customer_taxid / customer_name.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._document_direction(uuid,uuid)'::regprocedure;
  if position('invoice.customer_taxid' in v_src)=0 or position('invoice.customer_name' in v_src)=0 then
    raise exception '0015 _document_direction missing the customer taxid/name double-identity check (v3)' using errcode='CLR10';
  end if;
  --  FIX-4 read guard: a present-but-malformed rounding never corroborates.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state(uuid)'::regprocedure;
  if position('v_round_c = 0 or v_rounding is not null' in v_src)=0 then
    raise exception '0015 _invoice_fact_state missing the malformed-rounding read guard (v3)' using errcode='CLR10';
  end if;

  -- (7e) RESIDUAL v4 markers (the FOURTH adversarial re-verify — the NULL/blank cardinality
  -- hole + sst_output made SALES-only). Each closes a load-bearing accounting boundary; a
  -- future CoR that drops one must fail the migration.
  --  FIX-2 v4 executor: a purchase-side sst_output leg is an OUTSIDE leg (sst is sales-only).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.execute_rule_post(uuid,text)'::regprocedure;
  if position('on a purchase an sst_output leg lands here' in v_src)=0 then
    raise exception '0015 execute_rule_post must treat a purchase-side sst_output leg as outside (v4)' using errcode='CLR10';
  end if;
  --  FIX-3/4/5 v4 persist write-boundary: the blank/NULL-preserving conflict SENTINEL (chr(1))
  --  + the uniform malformed-monetary refusal — a crafted [blank, real] duplicate or an 'N/A'
  --  amount_due/deposit is refused, never min()-selected past polarity/direction/corroboration.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure;
  if position('monetary value is malformed' in v_src)=0 or position('chr(1)' in v_src)=0 then
    raise exception '0015 persist_invoice_facts missing the v4 blank/NULL conflict sentinel + malformed-monetary refusal' using errcode='CLR10';
  end if;
  --  FIX-5 v4 read guard: a PRESENT-but-NULL amount_due / deposit never corroborates
  --  (defense-in-depth for the write-boundary refusal).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state(uuid)'::regprocedure;
  if position('v_due_c = 0 or' in v_src)=0 or position('v_deposit_c = 0 or' in v_src)=0 then
    raise exception '0015 _invoice_fact_state missing the due/deposit present-but-null read guard (v4)' using errcode='CLR10';
  end if;

  -- (7f) RESIDUAL v5 marker (the FIFTH adversarial re-verify — the auto-post corroboration
  --  gate). execute_rule_post must REFUSE to auto-post a NON-corroborated draft: a blank/
  --  malformed/unreadable total leaves gross NULL, so the control-leg tie stays inert and an
  --  arbitrary under-cap balanced amount could post with no verified anchor. The executor now
  --  requires the document fact-state's `corroborated` signal (=> `not_corroborated` skip) before
  --  driving the post — auto-post only DB-verified entries. A future CoR dropping it fails here.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.execute_rule_post(uuid,text)'::regprocedure;
  if position('not_corroborated' in v_src)=0 then
    raise exception '0015 execute_rule_post missing the corroboration-required auto-post gate (v5)' using errcode='CLR10';
  end if;

  -- (8) the new tables carry RLS/FORCE + an owner policy + NO direct app grant.
  foreach v_name in array v_new_tables loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relname=v_name and c.relkind='r'
          and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '0015 RLS/FORCE assertion failed for clara.%',v_name using errcode='CLR10';
    end if;
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        where n.nspname='clara' and c.relname=v_name and a.grantee<>(select oid
          from pg_roles where rolname='clara_fn_owner')) then
      raise exception '0015 direct table grant assertion failed for clara.%',v_name using errcode='CLR10';
    end if;
    if not exists(select 1 from pg_policies p where p.schemaname='clara'
        and p.tablename=v_name and p.roles=array['clara_fn_owner']::name[]) then
      raise exception '0015 owner policy assertion failed for clara.%',v_name using errcode='CLR10';
    end if;
  end loop;

  -- (9) new CHECK shapes present.
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='ck_processing_task_lane_engine_0015';
  if v_def is null or v_def not like '%azure-%' or v_def not like '%local_facts%' then
    raise exception '0015 lane<->engine CHECK missing or malformed' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint where conname='ck_coding_rules_tier') then
    raise exception '0015 coding_rules tier CHECK missing' using errcode='CLR10';
  end if;

  -- (10) the typed rule-post event is registered AND in the active taxonomy.
  if not exists(select 1 from clara.event_types where name='entry.rule_posted')
     or not exists(select 1 from clara.trigger_taxonomy t join clara.taxonomy_active a
        on a.version=t.version and a.singleton where t.event_type='entry.rule_posted') then
    raise exception '0015 entry.rule_posted taxonomy pair assertion failed' using errcode='CLR10';
  end if;
end $$;

