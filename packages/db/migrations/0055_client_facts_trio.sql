-- 0055_client_facts_trio.sql -- Wave E lane alpha: the E-R12 client-facts trio (ADR-065).
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md). Authored as 0055 against a
-- repo frontier of 0054; if the merge order moves, renumber mechanically (the file, its rig
-- cells, and nothing else -- nothing keys on the number except the schema_migrations ledger).
--
-- DESIGN HOME: docs/plan/wave-e-design-skeleton-part4.md §3 (ratified with the campaign packet,
-- PR #223, four-round ladder CLEAN). Acceptance oracles: wave-e-acceptance-matrix.md §6
-- (Section F, cells F1a-F4). The trio, exactly as ruled:
--
--   (1) E-R12(1) -- F-1. VERIFIED FIRST, ONE new guard. The allocate_receipt/allocate_payment
--       unborn-item wall EXISTS and is inherited by every caller (S1 proves identity, census,
--       and the item_date NOT NULL floor -- executable on every fresh apply, so CI re-proves
--       it forever). The ONE genuinely open hole is the apply path: clara.apply_open_items is
--       act-dated (0040 S4.9 -> 0042 S5.22, producer law at 0040:864-877) but nothing enforced
--       that the act date is on or after BOTH items' item_date -- so a FUTURE-dated source
--       item could carry an application while aging (item_date <= as_of, 0040 _aging_core)
--       cannot yet see the item, while allocations already count (effective_date <= as_of,
--       0040 _subledger_outstanding_asof): SUM(buckets) <> control, the F-1 defect class from
--       the apply side. S2 splices ONE strict-boundary refusal. NO second wall on allocate_*
--       (F1d: a duplicate wall would need its own justification; none exists).
--   (2) E-R12(2) -- entity_type reaches the model surface. S6 splices the context pack's
--       client object (PATCHED, NOT REBUILT -- the 0036 §E law verbatim) so it carries BOTH
--       'entity_type' and 'msic', each read coalesce(live client_facts row, latest committed
--       interview answer). The runtime passes the pack through unfiltered
--       (packages/runtime/workflows/autoDraft.v7.tools.ts:437-449) -- no runtime edit at all.
--   (3) E-R12(3) -- the capture door. S3 births clara.client_fact_keys + clara.client_facts
--       (who/basis/when verbatim from ADR-062; supersession, never update) and S4 the ONE
--       audited door clara.record_client_fact. S5 backfills entity_type from committed
--       interview plans (real provenance, basis names the plan). The three parked MSIC codes
--       (RPR 68109 / RS 82110 / BEE 74101) DO NOT ride this file -- they enter through the
--       door itself at the acceptance/ceremony step, each with its owner_instruction basis
--       quoted (matrix F3a-F3c), so the door's own receipt is their provenance.
--
-- THE ENRICHMENT TRAP DOES NOT REACH THIS FILE (PROJECTLOG PART 2, standing): it forbids
-- enriching ROME SECRETARY's name-only CUSTOMERS with registrations/TINs. An MSIC code is the
-- CLIENT's own industry classification; no counterparty row is touched anywhere below.
--
-- PATCHED, NOT REBUILT (S2 and S6): both replaced bodies are generations past their file text
-- (apply_open_items: 0037 -> 0040 S4.9 -> 0042 S5.22; get_context_pack: 0016 -> 0017 -> 0018
-- -> 0019 -> 0036 §E). Both are harvested from the live catalog with pg_get_functiondef,
-- probed positively for one marker from EVERY prior surgery, count-guarded on their anchors,
-- patched with replace(), and re-executed -- never re-typed. A from-file rebuild would
-- silently revert the splice history; the prestate aborts on ANY drift instead.
--
-- D1 WRITE-QUIESCE (packages/db/README.md): S2 replaces the body of an audited writer
-- (clara.apply_open_items), so the live deploy of this file binds the D1 obligation --
-- quiesce writers, apply, resume (the skeleton §1.1 lane-alpha D1 window, decided). The
-- get_context_pack replacement (S6) is a read surface and rides the same window. THIS FILE
-- DOES NOT DEPLOY ANYTHING LIVE -- the ceremony is a separate, later, gated step.
--
-- CELLS: packages/db/tests/x55-client-facts-trio.test.mjs (matrix Section F). Contract-blind
-- on this file: the cells probe the LIVE catalog, never this .sql.
set local statement_timeout = '2min';

-- =====================================================================================
-- S0 -- PRESTATE. Every claim this file relies on is measured here, before anything
-- changes. The secdef/config/acl/owner of both bodies being replaced are STASHED (the
-- 0047/0048/0052 idiom) so the tail compares against what THIS run actually saw.
-- =====================================================================================
create temp table _x55_pre(
  fn     text primary key,
  secdef boolean not null,
  config text not null,
  acl    text not null,
  owner  text not null
) on commit drop;

do $s0$
declare
  v_n int; v_def text; v_cnt int;
  v_apply_sig text := 'clara.apply_open_items(uuid,jsonb,text,text)';
  v_pack_sig  text := 'clara.get_context_pack(uuid,text)';
begin
  -- (0.1) The change-of-record owners of both bodies must be applied, in order.
  foreach v_def in array array['0042_wave_d_b0_shared_authorities','0044_wave_d_b3_af2_composite'] loop
    select count(*) into v_n from clara.schema_migrations where version = v_def;
    if v_n <> 1 then
      raise exception '0055 S0.1: % is not recorded as applied -- apply in order', v_def
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.2) Stash both bodies' security posture for the tail comparison.
  insert into _x55_pre(fn, secdef, config, acl, owner)
  select s.fn, p.prosecdef, coalesce(p.proconfig::text, ''), coalesce(p.proacl::text, ''),
         p.proowner::regrole::text
    from (values ('apply_open_items', v_apply_sig), ('get_context_pack', v_pack_sig)) s(fn, sig)
    join pg_proc p on p.oid = s.sig::regprocedure;
  if (select count(*) from _x55_pre) <> 2 then
    raise exception '0055 S0.2: could not stash both live bodies (found %)',
      (select count(*) from _x55_pre) using errcode = 'CLR10';
  end if;

  -- (0.3) THE LIVE apply_open_items IS THE BODY THIS FILE WAS AUTHORED AGAINST -- one
  -- positive marker per surgery generation, plus exact counts (measured on a 0001-0054 rig,
  -- 2026-08-11): 0037's walls, 0040/0042's act-date stamps (clara._book_today() appears
  -- exactly 4 times: two value stamps + two comment mentions in the 0042 splice fragment).
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_apply_sig::regprocedure;
  if v_def is null then
    raise exception '0055 S0.3: clara.apply_open_items is GONE' using errcode = 'CLR10';
  end if;
  if position('unwind_lineage_mismatch' in v_def) = 0
     or position('cross_counterparty_application' in v_def) = 0 then
    raise exception '0055 S0.3: apply_open_items is missing 0037''s lineage/teeming-and-lading walls -- not the body this migration accounts for'
      using errcode = 'CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'clara._book_today()', ''))) / length('clara._book_today()');
  if v_cnt <> 4 then
    raise exception '0055 S0.3: apply_open_items carries clara._book_today() % time(s), expected 4 (the 0042 S5.22 splice) -- the body drifted; re-derive this section against the live catalog', v_cnt
      using errcode = 'CLR10';
  end if;
  if position('apply_before_item_date' in v_def) <> 0 then
    raise exception '0055 S0.3: apply_open_items already carries the apply_before_item_date guard -- 0055 has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (0.4) THE LIVE get_context_pack carries one marker from EVERY prior surgery (the 0036 §E
  -- probe set, re-asserted here because S6 must not re-bless a reverted body) and does NOT
  -- yet carry entity_type anywhere (measured: zero occurrences in the whole live body).
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_pack_sig::regprocedure;
  if v_def is null then
    raise exception '0055 S0.4: clara.get_context_pack is GONE' using errcode = 'CLR10';
  end if;
  if position('sst_registration_watch' in v_def) = 0 then
    raise exception '0055 S0.4: get_context_pack is missing the 0016 sst_registration_watch block' using errcode = 'CLR10';
  end if;
  if position('''wiki''' in v_def) = 0 then
    raise exception '0055 S0.4: get_context_pack is missing the 0017 wiki block' using errcode = 'CLR10';
  end if;
  if position('-''bound_scope_kind''-''bound_scope_id''' in v_def) = 0 then
    raise exception '0055 S0.4: get_context_pack is missing the 0018 resolution-exclusion surgery' using errcode = 'CLR10';
  end if;
  if position('''stale_at'',wc.stale_at' in v_def) = 0
     or position('''has_stale_sources''' in v_def) = 0 then
    raise exception '0055 S0.4: get_context_pack is missing a 0019 wiki-boundary marker' using errcode = 'CLR10';
  end if;
  if position('''msic''' in v_def) = 0 then
    raise exception '0055 S0.4: get_context_pack is missing the 0036 msic key -- a body reverted past 0036 must abort rather than be re-blessed'
      using errcode = 'CLR10';
  end if;
  if position('entity_type' in v_def) <> 0 then
    raise exception '0055 S0.4: get_context_pack already mentions entity_type -- 0055 has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (0.5) The birth targets must not pre-exist, and the helpers this file leans on must.
  if to_regclass('clara.client_facts') is not null
     or to_regclass('clara.client_fact_keys') is not null then
    raise exception '0055 S0.5: a client-facts relation already exists -- refusing to re-birth'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._book_today()') is null
     or to_regprocedure('clara._human_ctx(integer)') is null
     or to_regprocedure('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)') is null then
    raise exception '0055 S0.5: a required helper (_book_today / _human_ctx / _append_event) is missing at its pinned signature'
      using errcode = 'CLR10';
  end if;
end $s0$;

-- =====================================================================================
-- S1 -- F-1 VERIFICATION, EXECUTABLE (matrix F1a; skeleton §3.1 "what the lane must build").
-- E-R12(1) part 1 is DISCHARGED BY EXISTING CODE, and this section is the discharge made
-- structural: it proves the wall's IDENTITY (not its spelling -- law 3) on every fresh
-- apply, so a future migration that weakens any leg of it fails CI here, loudly.
-- =====================================================================================
do $s1$
declare
  v_src text; v_n int; v_name text; v_census text[]; v_notnull boolean;
  v_wall constant text := 'if i.item_date is not null and p_posting_date < i.item_date then';
begin
  -- (1.1) EACH CORE EXISTS EXACTLY ONCE (the 0044 tail-5 Z0 pin, re-asserted at 0055 time:
  -- an overloaded core is two behaviours wearing one name).
  foreach v_name in array array['_allocate_receipt_core', '_allocate_payment_core'] loop
    select count(*)::int into v_n from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = v_name;
    if v_n <> 1 then
      raise exception '0055 S1.1(F1a): clara.% exists at % arities (expected exactly 1)', v_name, v_n
        using errcode = 'CLR10';
    end if;
    -- (1.2) THE WALL LIVES IN THE CORE: the unborn-item predicate and its reason token,
    -- each EXACTLY ONCE per core (byte-identical on both sides, 0044:1266-1272 / :1557-1563).
    select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_src from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = v_name;
    v_n := (length(v_src) - length(replace(v_src, v_wall, ''))) / length(v_wall);
    if v_n <> 1 then
      raise exception '0055 S1.2(F1a): the unborn-item predicate appears % time(s) in clara.% (expected exactly 1) -- the wall moved or was duplicated', v_n, v_name
        using errcode = 'CLR10';
    end if;
    v_n := (length(v_src) - length(replace(v_src, 'allocation_to_unborn_item', ''))) / length('allocation_to_unborn_item');
    if v_n <> 1 then
      raise exception '0055 S1.2(F1a): allocation_to_unborn_item appears % time(s) in clara.% (expected exactly 1)', v_n, v_name
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (1.3) THE PUBLIC WRAPPERS ARE THIN AND DELEGATE (F1a's wrapper->core identity): each
  -- resolves at its pinned 12-arg arity, calls its core, and does NOT re-spell the wall --
  -- the wall is inherited, not duplicated (F1d: a second wall would need its own record).
  for v_name, v_src in
    select w.core, coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid))
      from (values
        ('_allocate_receipt_core', 'clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)'),
        ('_allocate_payment_core', 'clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)')
      ) w(core, wrapper)
      join pg_proc p on p.oid = w.wrapper::regprocedure
  loop
    if position('clara.' || v_name || '(' in v_src) = 0 then
      raise exception '0055 S1.3(F1a): the public wrapper does not delegate to clara.% -- the wrapper/core identity is broken', v_name
        using errcode = 'CLR10';
    end if;
    if position('allocation_to_unborn_item' in v_src) <> 0
       or position('p_posting_date < i.item_date' in v_src) <> 0 then
      raise exception '0055 S1.3(F1d): the public wrapper for clara.% re-spells the unborn-item wall -- a duplicate wall must not exist without its own record', v_name
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (1.4) THE POSITIVE CALLER CENSUS, FROM THE LIVE CATALOG (skeleton §3.1: "enumerate
  -- callers from pg_proc.prosrc, not file text"). The wall lives in the cores, so every
  -- caller inherits it; this pin is what makes a FOURTH caller a loud event instead of a
  -- silent one. Measured 2026-08-11 on a 0001-0054 rig: exactly these three.
  select coalesce(array_agg(p.proname order by p.proname), '{}') into v_census
    from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname not in ('_allocate_receipt_core', '_allocate_payment_core')
      and (p.prosrc like '%\_allocate\_receipt\_core(%' escape '\'
        or p.prosrc like '%\_allocate\_payment\_core(%' escape '\');
  if v_census <> array['_settle_from_bank_line_core', 'allocate_payment', 'allocate_receipt'] then
    raise exception '0055 S1.4(F1a): the allocation-core caller census is % -- expected exactly {_settle_from_bank_line_core, allocate_payment, allocate_receipt}. A caller appeared or vanished; account for it before this file may pass', v_census
      using errcode = 'CLR10';
  end if;

  -- (1.5) open_items.item_date IS NOT NULL (0037:738), re-asserted as a build-time fact:
  -- the wall's predicate short-circuits on NULL, so relaxing this column would open the
  -- wall SILENTLY. Assert the constraint, never assume it (skeleton §3.1).
  select a.attnotnull into v_notnull from pg_attribute a
    where a.attrelid = 'clara.open_items'::regclass and a.attname = 'item_date';
  if v_notnull is distinct from true then
    raise exception '0055 S1.5(F1a): clara.open_items.item_date is no longer NOT NULL -- the unborn-item wall is silently open'
      using errcode = 'CLR10';
  end if;
end $s1$;

-- =====================================================================================
-- S2 -- THE APPLY-PATH GUARD (matrix F1e/F1f; skeleton §3.1 verdict part 2, §6 item 1
-- CLOSED: GUARDED). One strict-boundary refusal inside the per-pair loop, spliced onto the
-- LIVE body. The anchor is the outstanding read that every pair reaches after the lineage
-- walls -- count-guarded to exactly one occurrence before anything is replaced.
-- =====================================================================================
set role clara_fn_owner;

do $s2$
declare
  v_sig text := 'clara.apply_open_items(uuid,jsonb,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;

  v_frm := $f$    v_sout := clara._subledger_outstanding(al.s);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0055 S2: the outstanding-read anchor appears % time(s) in the live apply_open_items (expected exactly once) -- the body drifted; re-derive this splice against the live catalog', v_cnt
      using errcode = 'CLR10';
  end if;

  v_to := $t$    -- 0055 (Wave E lane alpha, E-R12(1) -- the apply-path date guard; skeleton §3.1, matrix
    -- F1e). Act-dating is PROVEN (the 0040 producer law; both stamps read clara._book_today()
    -- since 0042 S5.22) but immunity is CONDITIONAL on the act date being on or after BOTH
    -- items' item_date, and until 0055 no conjunct enforced that: aging admits items at
    -- item_date <= as_of (0040 _aging_core) while allocations enter at effective_date <=
    -- as_of (0040 _subledger_outstanding_asof), so between the act date and a FUTURE-dated
    -- item's item_date the counter-item carries its allocation while the item itself is out
    -- of aging scope -- SUM(buckets) <> the unmoved control account, the F-1 defect class
    -- reached from the apply side. REFUSE outright, no override (E-R12(1)); the boundary is
    -- strict (<), so a same-day application passes (F1f). This is NOT the R9 greatest()
    -- guard: R9's hazard is a NEGATION row sorting before the allocation it negates
    -- (unallocate_group carries it, 0040 S4.8); this one is an item not yet born at the act
    -- date -- a different hazard, deliberately its own wall (0040:6162-6169 names the
    -- difference, and naming it here stops that paragraph reading as a refutation).
    if clara._book_today() < greatest(si.item_date, ti.item_date) then
      raise exception 'open item % (dated %) or % (dated %) is dated after today (%); an application dates itself by the act, and applying against an item that has not yet reached its own date would break the aging-to-control tie -- wait for the item date, or correct the item date first', al.s, si.item_date, al.t, ti.item_date, clara._book_today()
        using errcode='CLR10',
          detail=jsonb_build_object('reason','apply_before_item_date',
            'source_item_id',al.s,'source_item_date',si.item_date,
            'target_item_id',al.t,'target_item_date',ti.item_date,
            'book_today',clara._book_today())::text;
    end if;
    v_sout := clara._subledger_outstanding(al.s);$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  -- POSTCHECK: the guard landed exactly once; every prior-generation marker survived.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_cnt := (length(v_def) - length(replace(v_def, 'apply_before_item_date', ''))) / length('apply_before_item_date');
  if v_cnt <> 1 then
    raise exception '0055 S2 postcheck: apply_before_item_date appears % time(s), expected exactly 1', v_cnt
      using errcode = 'CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'clara._book_today()', ''))) / length('clara._book_today()');
  if v_cnt <> 8 then
    -- 4 pre-existing (0042 S5.22) + 4 in the guard (one comment mention, the predicate, the
    -- message argument, the detail field).
    raise exception '0055 S2 postcheck: clara._book_today() appears % time(s), expected 8', v_cnt
      using errcode = 'CLR10';
  end if;
  if position('unwind_lineage_mismatch' in v_def) = 0
     or position('cross_counterparty_application' in v_def) = 0
     or position('allocation_target_reversed' in v_def) = 0 then
    raise exception '0055 S2 postcheck: a 0037-generation wall marker vanished in the splice -- refusing to leave a weaker body than was harvested'
      using errcode = 'CLR10';
  end if;
end $s2$;

reset role;

-- =====================================================================================
-- S3 -- clara.client_fact_keys + clara.client_facts (matrix F3a-F4; skeleton §3.2).
-- A FACTS TABLE, NOT COLUMNS ON clara.clients: a column carries the value but not the
-- who/basis/when ADR-062 requires verbatim, and each future fact would need its own column
-- plus its own door. The catalog keeps the door generic; clara.clients stays a registry.
-- =====================================================================================

-- The key catalog. CODE-POPULATED (no runtime writer exists or is granted): a fact key is
-- product vocabulary, and vocabulary changes ride migrations with review, never live edits.
create table clara.client_fact_keys (
  fact_key          text        primary key check (btrim(fact_key) <> ''),
  validated_against text        not null,
  allowed_values    jsonb       check (allowed_values is null or jsonb_typeof(allowed_values) = 'array'),
  description       text        not null,
  created_at        timestamptz not null default now()
);

create trigger t_client_fact_keys_append_only before update or delete on clara.client_fact_keys
  for each row execute function clara._tf_append_only();
create trigger t_client_fact_keys_no_truncate before truncate on clara.client_fact_keys
  for each statement execute function clara._tf_no_truncate();

alter table clara.client_fact_keys enable row level security;
alter table clara.client_fact_keys force row level security;
create policy p_client_fact_keys_owner on clara.client_fact_keys
  for all to clara_fn_owner using (true) with check (true);
-- A GLOBAL catalog (no firm dimension -- it is product vocabulary, not tenant data), so the
-- read policy is unconditional for the human role.
create policy p_client_fact_keys_human on clara.client_fact_keys
  for select to clara_authenticated using (true);
grant select on clara.client_fact_keys to clara_authenticated;
grant select on clara.client_fact_keys to clara_fn_owner;

insert into clara.client_fact_keys (fact_key, validated_against, allowed_values, description) values
  ('entity_type', 'enum:ENTITY_TYPES_V2',
   '["sdn_bhd","bhd","sole_prop","partnership","llp","society","cooperative","other"]'::jsonb,
   'The client''s legal form. A frozen copy of the interview''s own enum ENTITY_TYPES_V2 '
   || '(packages/runtime/workflows/interview.v2.frameworks.ts:50-52, read at 0055 authoring '
   || 'time). The interview normalises synonyms BEFORE commit, so every committed answer is '
   || 'a canonical member; the door validates against this frozen list (skeleton §3.2).'),
  ('msic', 'format_only', null,
   'Five-digit MSIC industry code. FORMAT-ONLY, and the label says so honestly: no official '
   || 'MSIC registry table exists anywhere in migrations 0001-0054 (measured, matrix F3e), '
   || 'so the product never claims the code was checked against an official list. The '
   || 'compensating control is basis capture -- who supplied the code, on what evidence.');

-- The facts register. SUPERSESSION, NEVER UPDATE: the reverse-not-delete culture applied to
-- reference data. One live row per (client, fact_key); the prior row stays readable with its
-- original who/basis/when trio and an explicit supersession link (matrix F4).
create table clara.client_facts (
  id                 uuid        primary key default gen_random_uuid(),
  firm_id            uuid        not null references clara.firms(id),
  client_id          uuid        not null references clara.clients(id),
  fact_key           text        not null references clara.client_fact_keys(fact_key),
  fact_value         jsonb       not null,
  -- WHO/BASIS/WHEN, verbatim from ADR-062 via E-R12(3): the free-text justification is NOT
  -- optional and NOT defaulted -- an empty basis is refused at the door and at the table.
  basis              text        not null check (btrim(basis) <> ''),
  basis_kind         text        not null check (basis_kind in
                        ('owner_instruction','document','registry_lookup','interview_carryover')),
  source_document_id uuid        references clara.documents(id),
  validated_against  text        not null,
  recorded_by        uuid        not null references clara.users(id),
  recorded_at        timestamptz not null default now(),
  -- The FK is DEFERRABLE so the door can stamp the prior row with the successor's id and
  -- insert the successor in the same transaction (checked at commit).
  superseded_by      uuid        references clara.client_facts(id) deferrable initially deferred,
  superseded_at      timestamptz,
  -- The stamp is one act: both columns or neither (an inferred strengthening of skeleton
  -- §3.2's column list, flagged per the 0043 discipline -- one verb, one call, one moment).
  constraint ck_client_facts_supersession_paired check (
    (superseded_by is null) = (superseded_at is null)),
  -- A document rides a document basis, and ONLY a document basis (two-way; the skeleton
  -- states the forward direction, the reverse is the same fail-closed reading: a stray
  -- document id on an owner_instruction fact would be provenance theatre).
  constraint ck_client_facts_document_basis check (
    (basis_kind = 'document') = (source_document_id is not null))
);

create unique index uq_client_fact_live on clara.client_facts (client_id, fact_key)
  where superseded_at is null;
create index ix_client_facts_client on clara.client_facts (client_id, fact_key, recorded_at desc);

-- The ONE lawful update is the one-time supersession stamp; everything else on a fact row is
-- immutable from INSERT, and a row already superseded is immutable outright.
create function clara._tf_client_facts_supersede_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded client fact is immutable'
      using errcode = 'CLR10', detail = '{"reason":"fact_immutable"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or new.id                 is distinct from old.id
     or new.firm_id            is distinct from old.firm_id
     or new.client_id          is distinct from old.client_id
     or new.fact_key           is distinct from old.fact_key
     or new.fact_value         is distinct from old.fact_value
     or new.basis              is distinct from old.basis
     or new.basis_kind         is distinct from old.basis_kind
     or new.source_document_id is distinct from old.source_document_id
     or new.validated_against  is distinct from old.validated_against
     or new.recorded_by        is distinct from old.recorded_by
     or new.recorded_at        is distinct from old.recorded_at then
    raise exception 'client_facts admits exactly one update: the supersession stamp (superseded_by and superseded_at together, set once)'
      using errcode = 'CLR10', detail = '{"reason":"fact_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_client_facts_supersede_only() from public;

create trigger t_client_facts_supersede_only before update on clara.client_facts
  for each row execute function clara._tf_client_facts_supersede_only();
create trigger t_client_facts_no_delete before delete on clara.client_facts
  for each row execute function clara._tf_append_only();
create trigger t_client_facts_no_truncate before truncate on clara.client_facts
  for each statement execute function clara._tf_no_truncate();

alter table clara.client_facts enable row level security;
alter table clara.client_facts force row level security;
create policy p_client_facts_owner on clara.client_facts
  for all to clara_fn_owner using (true) with check (true);
create policy p_client_facts_human on clara.client_facts
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.client_facts to clara_authenticated;
grant select, insert, update on clara.client_facts to clara_fn_owner;

-- =====================================================================================
-- S4 -- clara.record_client_fact -- THE ONE AUDITED DOOR (matrix F3a-F3f; skeleton §3.2).
-- Why a door and not the interview path: clara.commit_client_onboarding refuses once
-- cl.status <> 'onboarding' (0017:2777-2778) and no verb re-opens an active client -- the
-- exact wall ADR-062 names (F3d proves the old path STILL refuses). Why ONE door for both
-- facts: entity_type and msic differ only in their catalog rule; two doors would be two
-- audit shapes for the same act.
-- =====================================================================================
create function clara.record_client_fact(
    p_client uuid, p_fact_key text, p_fact_value jsonb, p_basis text, p_basis_kind text,
    p_source_document_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $door$
declare
  c record; v_firm uuid; v_key record; v_dedupe jsonb; v_val text;
  v_prior uuid; v_new uuid; v_doc record;
begin
  -- THE FLOOR: admin+ (skeleton §3.2, builder choice ratified with the packet). A client
  -- fact drives coding and statutory presentation -- above a bookkeeper's day book, below a
  -- signing key. The floor lives HERE because this is a public verb, not a core.
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  -- WHO/BASIS/WHEN is the ruled trio (ADR-062 / E-R12(3)): a fact without its basis is
  -- refused, never defaulted.
  if p_basis is null or btrim(p_basis) = '' then
    raise exception 'a client fact requires its basis -- who said so, on what evidence'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  if p_basis_kind is null or p_basis_kind not in
      ('owner_instruction', 'document', 'registry_lookup', 'interview_carryover') then
    raise exception 'basis_kind must be one of owner_instruction / document / registry_lookup / interview_carryover'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_kind_invalid"}';
  end if;
  if p_basis_kind = 'document' then
    if p_source_document_id is null then
      raise exception 'a document-based fact must name its source document'
        using errcode = 'CLR10', detail = '{"reason":"fact_source_document_missing"}';
    end if;
    select d.firm_id, d.client_id into v_doc
      from clara.documents d where d.id = p_source_document_id;
    if v_doc.firm_id is null or v_doc.firm_id <> c.firm
       or (v_doc.client_id is not null and v_doc.client_id <> p_client) then
      raise exception 'the source document does not belong to this firm and client'
        using errcode = 'CLR10', detail = '{"reason":"fact_source_document_invalid"}';
    end if;
  elsif p_source_document_id is not null then
    raise exception 'source_document_id rides only a document basis'
      using errcode = 'CLR10', detail = '{"reason":"fact_source_document_unexpected"}';
  end if;
  select * into v_key from clara.client_fact_keys k where k.fact_key = p_fact_key;
  if not found then
    raise exception 'unknown client fact key %', p_fact_key
      using errcode = 'CLR10', detail = '{"reason":"fact_key_unknown"}';
  end if;
  -- THE CATALOG RULE. Values are JSON strings (the interview answer shape -- 0017 writes
  -- answer = to_jsonb(text), and the pack reads #>> '{}'); the rule dispatch is fail-closed:
  -- a key this door cannot validate is refused, never accepted unvalidated.
  if p_fact_value is null or jsonb_typeof(p_fact_value) <> 'string' then
    raise exception 'a client fact value is a JSON string'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'fact_value_invalid',
        'fact_key', p_fact_key)::text;
  end if;
  v_val := p_fact_value #>> '{}';
  if v_key.validated_against like 'enum:%' then
    if v_key.allowed_values is null or not (v_key.allowed_values ? v_val) then
      raise exception 'client fact % admits only its catalog values, and % is not one of them', p_fact_key, v_val
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'fact_value_invalid',
          'fact_key', p_fact_key)::text;
    end if;
  elsif v_key.fact_key = 'msic' then
    -- FORMAT ONLY, by design and by the catalog's own label: five digits. No registry table
    -- exists to check membership against (matrix F3e records the measured absence); the rule
    -- is keyed on the key name because a rule DSL for two keys would be machinery without a
    -- second customer -- the fail-closed ELSE below protects whatever key arrives third.
    if v_val !~ '^[0-9]{5}$' then
      raise exception 'an MSIC code is exactly five digits, and % is not', v_val
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'fact_value_invalid',
          'fact_key', p_fact_key)::text;
    end if;
  else
    raise exception 'client fact key % carries a validation label (%) this door does not implement -- refusing to record an unvalidated fact', p_fact_key, v_key.validated_against
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'fact_value_invalid',
        'fact_key', p_fact_key)::text;
  end if;

  -- Reserve-before-effect (0002 §F/F11): a replay under the same op_key returns the STORED
  -- receipt and writes nothing (F3a's three-count assertion); the same key with DIFFERENT
  -- args is refused by _reserve_op's request_hash (F3f).
  v_dedupe := clara._reserve_op(c.firm, 'record_client_fact', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'fact_key', p_fact_key,
      'fact_value', p_fact_value, 'basis', p_basis, 'basis_kind', p_basis_kind,
      'source_document', p_source_document_id)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- SUPERSESSION, NEVER UPDATE (matrix F4). Lock the live predecessor, stamp it with the
  -- successor's id (the FK is deferred to commit), then insert the successor. Two admins
  -- racing on the SAME fact serialize on the row lock; the second re-reads a superseded row,
  -- finds no live predecessor, and its insert then meets uq_client_fact_live -- a loud
  -- unique-violation abort, never a silent double-live state. Fail-closed and retryable.
  select cf.id into v_prior from clara.client_facts cf
    where cf.client_id = p_client and cf.fact_key = p_fact_key and cf.superseded_at is null
    for update;
  v_new := gen_random_uuid();
  if v_prior is not null then
    update clara.client_facts
      set superseded_by = v_new, superseded_at = now()
      where id = v_prior;
  end if;
  insert into clara.client_facts(id, firm_id, client_id, fact_key, fact_value, basis,
      basis_kind, source_document_id, validated_against, recorded_by)
    values (v_new, c.firm, p_client, p_fact_key, p_fact_value, p_basis, p_basis_kind,
      p_source_document_id, v_key.validated_against, c.actor);

  -- args stay REDACTED (ids/keys, never the basis text -- the basis lives on the row, which
  -- is the record of record; 0002's audit_log doctrine).
  perform clara._audit(c.firm, c.actor, null, null, 'record_client_fact', null,
    jsonb_build_object('client', p_client, 'fact_key', p_fact_key, 'fact_id', v_new,
      'superseded_id', v_prior, 'basis_kind', p_basis_kind,
      'source_document', p_source_document_id, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'client.fact_recorded', p_client, c.actor,
    null, null, null, p_source_document_id, null,
    jsonb_build_object('fact_key', p_fact_key, 'fact_id', v_new, 'superseded_id', v_prior));
  return clara._finish_op(c.firm, 'record_client_fact', p_op_key,
    jsonb_build_object('fact_id', v_new, 'fact_key', p_fact_key,
      'superseded_id', v_prior, 'client_id', p_client));
end $door$;

alter function clara.record_client_fact(uuid, text, jsonb, text, text, uuid, text)
  owner to clara_fn_owner;
revoke all on function clara.record_client_fact(uuid, text, jsonb, text, text, uuid, text)
  from public;
-- HUMANS ONLY. No wake role, no clara_runtime, no clara_agent_ro: which fact a client's
-- statutory presentation rests on is a judgement, and the agent never makes one (the same
-- ACL doctrine as 0037 SECTION L). The agent SEES the fact through the context pack's
-- definer read; it never writes one.
grant execute on function clara.record_client_fact(uuid, text, jsonb, text, text, uuid, text)
  to clara_authenticated;

-- =====================================================================================
-- S5 -- THE BACKFILL (skeleton §3.2). entity_type is requiredForCommit on the client
-- interview (packages/runtime/workflows/interview.v2.questions.ts:77), so every committed
-- client plan carries an answer. Carry the LATEST committed plan's answered/resolved item
-- into client_facts with basis_kind='interview_carryover' and a basis NAMING the plan --
-- a real provenance, not a synthesized one. recorded_by is the human who answered
-- (onboarding_plan_items.answered_by), because that person, not this migration, is the WHO.
-- MSIC is deliberately NOT backfilled here: it is the sparse fact, and the three parked
-- codes enter through the door itself with their owner_instruction basis (matrix F3a-F3c).
-- =====================================================================================
do $s5$
declare
  r record; v_n int := 0;
begin
  for r in
    select p.id as plan_id, p.firm_id, p.client_id,
           i.answer, i.answer #>> '{}' as val, i.answered_by, i.answered_at
      from (select distinct on (p2.client_id) p2.id, p2.firm_id, p2.client_id, p2.committed_at
              from clara.onboarding_plans p2
             where p2.scope_kind = 'client' and p2.state = 'committed'
             order by p2.client_id, p2.committed_at desc) p
      join clara.onboarding_plan_items i
        on i.plan_id = p.id and i.item_key = 'entity_type'
       and i.state in ('answered', 'resolved')
     where not exists (select 1 from clara.client_facts cf
                        where cf.client_id = p.client_id and cf.fact_key = 'entity_type'
                          and cf.superseded_at is null)
  loop
    -- FAIL-CLOSED, LOUD: a committed answer outside the frozen enum is a fact this
    -- migration cannot classify -- refuse and surface it, never guess (law 2: a value this
    -- read did not SEE inside the list falls to the refusing branch).
    if r.val is null or not (r.val = any (array['sdn_bhd','bhd','sole_prop','partnership',
        'llp','society','cooperative','other'])) then
      raise exception '0055 S5 backfill: client % carries a committed entity_type answer (%) outside ENTITY_TYPES_V2 -- refusing to carry over a value the catalog cannot validate', r.client_id, r.answer
        using errcode = 'CLR10';
    end if;
    if r.answered_by is null then
      raise exception '0055 S5 backfill: client % entity_type item has no answered_by -- a carryover without its WHO is not a provenance', r.client_id
        using errcode = 'CLR10';
    end if;
    insert into clara.client_facts(firm_id, client_id, fact_key, fact_value, basis,
        basis_kind, validated_against, recorded_by)
      values (r.firm_id, r.client_id, 'entity_type', to_jsonb(r.val),
        'interview carryover: latest committed client-scoped onboarding plan ' || r.plan_id
          || ', item entity_type answered ' || r.answered_at || ' by ' || r.answered_by,
        'interview_carryover', 'enum:ENTITY_TYPES_V2', r.answered_by);
    v_n := v_n + 1;
  end loop;
  raise notice '0055 S5 backfill: % entity_type fact(s) carried over from committed plans', v_n;
end $s5$;

-- =====================================================================================
-- S6 -- THE CONTEXT-PACK SPLICE (matrix F2a/F2c; skeleton §3.3). PATCHED, NOT REBUILT --
-- 0036 §E's own law, applied to 0036's own output. The anchor counted is the CONSTRUCTED
-- msic-augmented client object 0036:1559-1566 assembled into the live body -- NOT the
-- v_anchor string 0036:1554 declares, which is the PRE-0036 anchor and appears ZERO times
-- in the live body (F2c names counting the wrong literal a FAIL of method). Both keys read
-- coalesce(live client_facts row, latest committed interview answer): the captured fact
-- wins, the interview answer is the fallback -- a door onto a wall is what this avoids.
-- SECURITY DEFINER survives the replace; the definer-owned body reads client_facts on the
-- same basis it reads onboarding_plan* (0036:1504-1509) -- the owner policy above.
-- =====================================================================================
set role clara_fn_owner;

do $s6$
declare
  v_sig text := 'clara.get_context_pack(uuid,text)';
  v_def text; v_old text; v_new text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;

  -- The live constructed literal (0036 §E's replacement, byte-exact; measured on a
  -- 0001-0054 rig 2026-08-11: exactly one occurrence).
  v_old := $a$'client',jsonb_build_object('id',cl.id,'name',cl.name,'status',cl.status,'msic',(select i.answer #>> '{}' from clara.onboarding_plans p2 join clara.onboarding_plan_items i on i.plan_id=p2.id where p2.client_id=cl.id and p2.scope_kind='client' and p2.state='committed' and i.item_key='msic' and i.state in ('answered','resolved') order by p2.committed_at desc, i.answered_at desc limit 1))$a$;
  v_cnt := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_cnt <> 1 then
    raise exception '0055 S6: the 0036 constructed client-object literal appears % time(s) in the live get_context_pack (expected exactly once) -- the body drifted; re-derive this splice against the live catalog', v_cnt
      using errcode = 'CLR10';
  end if;

  v_new := $b$'client',jsonb_build_object('id',cl.id,'name',cl.name,'status',cl.status,'entity_type',coalesce((select cf.fact_value #>> '{}' from clara.client_facts cf where cf.client_id=cl.id and cf.fact_key='entity_type' and cf.superseded_at is null),(select i.answer #>> '{}' from clara.onboarding_plans p2 join clara.onboarding_plan_items i on i.plan_id=p2.id where p2.client_id=cl.id and p2.scope_kind='client' and p2.state='committed' and i.item_key='entity_type' and i.state in ('answered','resolved') order by p2.committed_at desc, i.answered_at desc limit 1)),'msic',coalesce((select cf.fact_value #>> '{}' from clara.client_facts cf where cf.client_id=cl.id and cf.fact_key='msic' and cf.superseded_at is null),(select i.answer #>> '{}' from clara.onboarding_plans p2 join clara.onboarding_plan_items i on i.plan_id=p2.id where p2.client_id=cl.id and p2.scope_kind='client' and p2.state='committed' and i.item_key='msic' and i.state in ('answered','resolved') order by p2.committed_at desc, i.answered_at desc limit 1)))$b$;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;

  -- POSTCHECK: both keys installed once; every prior-surgery marker survived the splice.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_cnt := (length(v_def) - length(replace(v_def, v_new, ''))) / length(v_new);
  if v_cnt <> 1 then
    raise exception '0055 S6 postcheck: the entity_type+msic client object appears % time(s), expected exactly once', v_cnt
      using errcode = 'CLR10';
  end if;
  if position('''entity_type''' in v_def) = 0 or position('''msic''' in v_def) = 0 then
    raise exception '0055 S6 postcheck: a spliced key is missing from the live body'
      using errcode = 'CLR10';
  end if;
  if position('sst_registration_watch' in v_def) = 0
     or position('''wiki''' in v_def) = 0
     or position('-''bound_scope_kind''-''bound_scope_id''' in v_def) = 0
     or position('''stale_at'',wc.stale_at' in v_def) = 0
     or position('''has_stale_sources''' in v_def) = 0 then
    raise exception '0055 S6 postcheck: a prior-surgery marker (0016/0017/0018/0019) vanished in the splice'
      using errcode = 'CLR10';
  end if;
end $s6$;

reset role;

-- =====================================================================================
-- S7 -- TAIL. The security posture of both replaced bodies is UNCHANGED against the S0
-- stash; the new door's ACL is exactly the human lane; the new tables' RLS is forced.
-- =====================================================================================
do $s7$
declare
  r record; v_n int; v_b boolean;
  v_door text := 'clara.record_client_fact(uuid,text,jsonb,text,text,uuid,text)';
begin
  -- (7.1) The spliced bodies kept their secdef / search_path / ACL / owner.
  for r in
    select s.fn, s.secdef, s.config, s.acl, s.owner,
           p.prosecdef as now_secdef, coalesce(p.proconfig::text, '') as now_config,
           coalesce(p.proacl::text, '') as now_acl, p.proowner::regrole::text as now_owner
      from _x55_pre s
      join pg_proc p on p.oid = (case s.fn
        when 'apply_open_items' then 'clara.apply_open_items(uuid,jsonb,text,text)'
        when 'get_context_pack' then 'clara.get_context_pack(uuid,text)' end)::regprocedure
  loop
    if r.now_secdef is distinct from r.secdef or r.now_config is distinct from r.config
       or r.now_acl is distinct from r.acl or r.now_owner is distinct from r.owner then
      raise exception '0055 S7.1: clara.% changed security posture in the splice (secdef %->%, config %->%, acl %->%, owner %->%)',
        r.fn, r.secdef, r.now_secdef, r.config, r.now_config, r.acl, r.now_acl, r.owner, r.now_owner
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (7.2) The door is a HUMAN verb: clara_authenticated may execute; the agent read role,
  -- the runtime and PUBLIC may not (a write under clara_agent_ro must die at 42501 before
  -- the body runs -- the matrix's standing D1 constraint).
  if not has_function_privilege('clara_authenticated', v_door, 'execute') then
    raise exception '0055 S7.2: clara_authenticated cannot execute record_client_fact -- the door is dark'
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_agent_ro', v_door, 'execute')
     or has_function_privilege('clara_runtime', v_door, 'execute') then
    raise exception '0055 S7.2: a non-human role holds EXECUTE on record_client_fact -- the write-authorization invariant is breached'
      using errcode = 'CLR10';
  end if;

  -- (7.3) Forced RLS on both new tables; the human role holds SELECT only.
  for r in select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c
            where c.oid in ('clara.client_facts'::regclass, 'clara.client_fact_keys'::regclass)
  loop
    if not r.relrowsecurity or not r.relforcerowsecurity then
      raise exception '0055 S7.3: clara.% is not under FORCED row level security', r.relname
        using errcode = 'CLR10';
    end if;
  end loop;
  if has_table_privilege('clara_authenticated', 'clara.client_facts', 'insert')
     or has_table_privilege('clara_authenticated', 'clara.client_facts', 'update')
     or has_table_privilege('clara_authenticated', 'clara.client_facts', 'delete')
     or has_table_privilege('clara_authenticated', 'clara.client_fact_keys', 'insert')
     or has_table_privilege('clara_authenticated', 'clara.client_fact_keys', 'update')
     or has_table_privilege('clara_authenticated', 'clara.client_fact_keys', 'delete') then
    raise exception '0055 S7.3: clara_authenticated holds a DML privilege on a client-facts table -- writes go through the door only'
      using errcode = 'CLR10';
  end if;

  -- (7.4) The catalog carries exactly its two authored keys, and every backfilled fact is a
  -- catalog member value (re-measured, not inherited from S5's loop).
  select count(*) into v_n from clara.client_fact_keys;
  if v_n <> 2 then
    raise exception '0055 S7.4: client_fact_keys carries % row(s), expected 2', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.client_facts cf
    where cf.fact_key = 'entity_type'
      and not (cf.fact_value #>> '{}' = any (array['sdn_bhd','bhd','sole_prop','partnership',
        'llp','society','cooperative','other']));
  if v_n <> 0 then
    raise exception '0055 S7.4: % backfilled entity_type fact(s) fall outside the frozen enum', v_n
      using errcode = 'CLR10';
  end if;

  -- (7.5) The F-1 posture at close: the guard is live exactly once; the census is unmoved.
  select (length(d) - length(replace(d, 'apply_before_item_date', ''))) / length('apply_before_item_date')
    into v_n
    from pg_get_functiondef('clara.apply_open_items(uuid,jsonb,text,text)'::regprocedure) d;
  if v_n <> 1 then
    raise exception '0055 S7.5: apply_before_item_date count is % at the tail, expected 1', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '0055 OK: F-1 verified (census pinned, wall identity proven, item_date NOT NULL held); apply_open_items guarded (apply_before_item_date, strict boundary); client_fact_keys=2; client_facts born with door record_client_fact (admin+, human-only); entity_type backfilled from committed plans; context pack carries entity_type+msic with fact-over-interview coalesce.';
end $s7$;
