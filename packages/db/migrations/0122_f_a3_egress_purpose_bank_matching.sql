-- 0122_f_a3_egress_purpose_bank_matching.sql -- Wave-F Track A, F-A3 (bank agency),
-- PR-1c: THE bank_matching TYPED EGRESS PURPOSE. Number claimed at MERGE time (standing law,
-- AGENTS.md + .claude/rules/db-migrations.md). Design of record: docs/plan/active/
-- bank-agency-design.md v2 SS3.7 + Annex E (bank-agency-annexes-4-surfaces.md).
--
-- SCOPE -- Annex E items 1-9 ONLY. Item 10 (the runtime GOVERNED_EGRESS_PURPOSES registry,
-- packages/runtime/lib/egress.mjs) is F-A3/PR-2's ("class: runtime (PR-2)" in Annex E's own
-- table) and is NOT touched here. This file widens the three purpose CHECKs on
-- client_egress_purpose_consents / client_egress_purpose_activations /
-- egress_dispatch_authorizations to admit a FOURTH purpose, 'bank_matching'; recuts
-- ck_egress_dispatch_authorizations_doc_sha to gain its OWN fourth conjunct requiring
-- document_sha256 IS NULL for bank_matching -- the wiki_synthesis arm's shape, because bank
-- matching sends a client's whole ledger slice and counterparty names, not one document
-- (0090's own comment: "three separate conjuncts so a fourth purpose inherits nothing by
-- accident"); widens the four purpose-bearing verbs' hardcoded in-body allowlists alongside
-- the table CHECK (0090's own precedent -- widening the CHECK alone would leave bank_matching
-- structurally admissible at the table but refused by every verb that could ever
-- grant/activate/deactivate/revoke it); and gives prepare_egress_dispatch its own
-- bank_matching/doc_sha arm, mirroring the wiki_synthesis arm exactly (uniform 'unknown',
-- never a raise -- 0020 section 3.3's non-oracle rule, restated at 0090:1020-1021).
--
-- THIS FILE MINTS NO BANK-MATCHING WORK: no wake verb, no runtime call site exists yet
-- (F-A3/PR-2's job). Every recut below is DORMANT until a caller names
-- purpose='bank_matching' -- exactly the posture 0090 shipped witness_extraction's
-- prepare_egress_dispatch arm in, ahead of its own runtime router (0090 section 7e's "INERT"
-- precedent). The wiki-hold coupling (grant/activate/deactivate/revoke's
-- `if p_purpose='wiki_synthesis' then ...` branches) stays purpose-discriminated and
-- byte-untouched: bank_matching falls through with no hold transition, exactly like
-- statement_extraction and witness_extraction do today.
--
-- WHY ITS OWN PR (Annex E "why this is its own PR"): three of the four CHECK swaps take
-- ACCESS EXCLUSIVE on a live table written by the witness lane on EVERY dispatch
-- (egress_dispatch_authorizations); the fourth (doc-sha) shares that table. D1 write-quiesce
-- is owed for the five live bodies this file replaces (db-migrations.md, "a migration that
-- replaces an audited writer's body"); the four CHECK swaps are DDL and hold their lock only
-- for the ALTER, not a call. QUIESCE INVENTORY (all five queried, claimed and recut in THIS
-- file): clara.grant_client_egress_purpose, clara.activate_client_egress_purpose,
-- clara.deactivate_client_egress_purpose, clara.revoke_client_egress_purpose,
-- clara.prepare_egress_dispatch. No table in workflow/graphile_worker/spike touched.
--
-- PROVENANCE, measured on THIS lane's own rig replay at the frontier (0102), never assumed
-- from migration text (0090 is spliced no further for these seven surfaces since -- every
-- prosrc sha256 pinned in SECTION 0 below matches 0090's own postcheck literals exactly,
-- confirmed live on the rig before a byte of this file was authored):
--   grant_client_egress_purpose      0090:744-804   (live prosrc sha ...67a38f4e6, below)
--   activate_client_egress_purpose   0090:806-876   (live prosrc sha ...38f65f, below)
--   deactivate_client_egress_purpose 0090:878-938   (live prosrc sha ...3dbf091, below)
--   revoke_client_egress_purpose     0090:940-1002  (live prosrc sha ...524c26ada, below)
--   prepare_egress_dispatch          0090:1007-1058 (live prosrc sha ...a042880c5, below)
--   the three purpose CHECKs         0090 S7a (ck_*_purpose_f_a1 -- names fixed since 0090)
--   the doc-sha CHECK                0090 S7b (ck_egress_dispatch_authorizations_doc_sha --
--                                     name preserved since 0038, preserved again here)
--
-- NAMES PRESERVED throughout (0090's own precedent, itself citing 0038's): every DROP+ADD
-- CHECK keeps the EXACT name it had; every CREATE OR REPLACE keeps the exact signature, ACL
-- and owner -- measured, not assumed, in the tail postcheck.

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every function pinned by exact prosrc sha256 (computed the same way
-- the tail's postcheck will compute the NEW body's sha256: encode(sha256(convert_to(prosrc,
-- 'UTF8')),'hex')). Every CHECK constraint pinned by name + a pg_get_constraintdef exact-form
-- match. Aborts on any mismatch rather than proceeding on a wrong premise (db-migrations.md,
-- "measure before, measure after"; the lane brief's shared-surface rule: "a prestate probe
-- aborts loudly if the predecessor's value is absent").
-- =====================================================================================
create temp table _fa3pr1c_pre_acl(sig text primary key, acl text);
do $pre$
declare v_src text; v_sha text; v_def text; v_n int; v_sig text;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0102_f_a2_statement_activation') then
    raise exception 'f_a3_pr1c_egress prestate: 0102_f_a2_statement_activation is not applied -- frontier mismatch' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p where p.oid='clara.grant_client_egress_purpose(uuid,text,uuid,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'c302558bbf05bcfad58e07bd7758401a158d57335c98680d871b85467a38f4e6' then
    raise exception 'f_a3_pr1c_egress prestate: grant_client_egress_purpose prosrc sha256 mismatch (got %, expected the 0090 postcheck value) -- live body has drifted from the pinned provenance', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '4f75b02b0d356e15310ea12968839c0c1d4632c3af6c6c8aba564e7a2f38f65f' then
    raise exception 'f_a3_pr1c_egress prestate: activate_client_egress_purpose prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '095652b4b05ee047c693b4d0fe11e9b8c8828cd037d63b2f2a313c9c63dbf091' then
    raise exception 'f_a3_pr1c_egress prestate: deactivate_client_egress_purpose prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.revoke_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'd224b56f9a3d8a7e3c6795f2f36c4ae6a58899ebe297ff2ec83bf84524c26ada' then
    raise exception 'f_a3_pr1c_egress prestate: revoke_client_egress_purpose prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'e053ff6966566353bc2a2a7f99399652abab93926c8c84922a2c2f3a042880c5' then
    raise exception 'f_a3_pr1c_egress prestate: prepare_egress_dispatch prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;

  -- The three purpose CHECKs: EXACTLY the 0090 three-purpose form, bank_matching absent.
  for v_sig, v_def in
    select c.relname, pg_get_constraintdef(con.oid)
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and con.contype='c'
       and ((c.relname='client_egress_purpose_consents' and con.conname='ck_client_egress_purpose_consents_purpose_f_a1')
         or (c.relname='client_egress_purpose_activations' and con.conname='ck_client_egress_purpose_activations_purpose_f_a1')
         or (c.relname='egress_dispatch_authorizations' and con.conname='ck_egress_dispatch_authorizations_purpose_f_a1'))
  loop
    if v_def <> 'CHECK ((purpose = ANY (ARRAY[''wiki_synthesis''::text, ''statement_extraction''::text, ''witness_extraction''::text])))' then
      raise exception 'f_a3_pr1c_egress prestate: %''s purpose CHECK is not the expected 0090 three-purpose form (got %) -- either already widened or drifted', v_sig, v_def using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and con.contype='c' and c.relname in
     ('client_egress_purpose_consents','client_egress_purpose_activations','egress_dispatch_authorizations')
     and con.conname in ('ck_client_egress_purpose_consents_purpose_f_a1','ck_client_egress_purpose_activations_purpose_f_a1','ck_egress_dispatch_authorizations_purpose_f_a1');
  if v_n <> 3 then
    raise exception 'f_a3_pr1c_egress prestate: expected exactly 3 purpose CHECKs by name (got %)', v_n using errcode='CLR10';
  end if;

  -- The doc-sha CHECK: EXACTLY the 0090 three-conjunct form, no bank_matching conjunct yet.
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.contype='c'
     and con.conname='ck_egress_dispatch_authorizations_doc_sha';
  if v_def is distinct from 'CHECK ((((purpose <> ''wiki_synthesis''::text) OR (document_sha256 IS NULL)) AND ((purpose <> ''statement_extraction''::text) OR (document_sha256 IS NOT NULL)) AND ((purpose <> ''witness_extraction''::text) OR (document_sha256 IS NOT NULL))))' then
    raise exception 'f_a3_pr1c_egress prestate: ck_egress_dispatch_authorizations_doc_sha is not the expected 0090 three-conjunct form (got %)', coalesce(v_def,'<absent>') using errcode='CLR10';
  end if;

  -- Clean-slate check: no bank_matching row exists anywhere yet (this file mints no work, so
  -- this can only be nonzero if some other lane already touched this surface out of band).
  select count(*)::int into v_n from clara.client_egress_purpose_consents where purpose='bank_matching';
  if v_n <> 0 then
    raise exception 'f_a3_pr1c_egress prestate: % client_egress_purpose_consents row(s) already carry purpose=bank_matching -- unexpected pre-existing state', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.egress_dispatch_authorizations where purpose='bank_matching';
  if v_n <> 0 then
    raise exception 'f_a3_pr1c_egress prestate: % egress_dispatch_authorizations row(s) already carry purpose=bank_matching', v_n using errcode='CLR10';
  end if;

  -- Pre-recut ACL of the five bodies this file replaces, captured BEFORE any DDL so the tail
  -- postcheck can assert the matrix is UNMOVED rather than assume it (CREATE OR REPLACE
  -- preserves proacl, so this is a measurement of a claim, not a repair -- mirrors 0090's own
  -- _fa1_walls_pre_acl idiom).
  for v_sig in select unnest(array[
    'clara.grant_client_egress_purpose(uuid,text,uuid,text,text)',
    'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
    'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
    'clara.revoke_client_egress_purpose(uuid,text,text,text)',
    'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'])
  loop
    insert into _fa3pr1c_pre_acl(sig, acl)
    select v_sig, coalesce(
      (select string_agg(a.grantee::regrole::text||':'||a.privilege_type, ',' order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
         from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = v_sig::regprocedure), '(none)');
  end loop;

  raise notice 'f_a3_pr1c_egress prestate: clean -- frontier 0102, all five prosrc shas match the 0090 postcheck values, all four purpose CHECKs at their 0090 three-purpose/three-conjunct form, 0 bank_matching rows exist anywhere, 5-row pre-recut ACL captured';
end
$pre$;

-- =====================================================================================
-- SECTION 1 -- the three purpose CHECKs, DROP+ADD widened to a fourth purpose. NAMES
-- PRESERVED (0090's own precedent, itself citing 0038's). ACCESS EXCLUSIVE on each table for
-- the duration of the ALTER.
-- =====================================================================================
alter table clara.client_egress_purpose_consents
  drop constraint ck_client_egress_purpose_consents_purpose_f_a1;
alter table clara.client_egress_purpose_consents
  add constraint ck_client_egress_purpose_consents_purpose_f_a1
  check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching'));

alter table clara.client_egress_purpose_activations
  drop constraint ck_client_egress_purpose_activations_purpose_f_a1;
alter table clara.client_egress_purpose_activations
  add constraint ck_client_egress_purpose_activations_purpose_f_a1
  check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching'));

alter table clara.egress_dispatch_authorizations
  drop constraint ck_egress_dispatch_authorizations_purpose_f_a1;
alter table clara.egress_dispatch_authorizations
  add constraint ck_egress_dispatch_authorizations_purpose_f_a1
  check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching'));

-- =====================================================================================
-- SECTION 2 -- ck_egress_dispatch_authorizations_doc_sha, RECUT with its OWN fourth conjunct:
-- bank_matching REQUIRES a NULL hash (the wiki_synthesis arm's shape -- a matching read sends
-- a client's ledger slice and counterparty names, not one document). Written as its own
-- conjunct, not folded into wiki_synthesis's, so a future fifth purpose still inherits neither
-- rule by accident (0090's own stated reason for the same shape). NAME PRESERVED.
-- =====================================================================================
do $s2_pre$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.egress_dispatch_authorizations
   where not ((purpose <> 'wiki_synthesis' or document_sha256 is null)
          and (purpose <> 'statement_extraction' or document_sha256 is not null)
          and (purpose <> 'witness_extraction' or document_sha256 is not null)
          and (purpose <> 'bank_matching' or document_sha256 is null));
  if v_bad<>0 then
    raise exception 'f_a3_pr1c_egress S2 pre-assert failed: % dispatch-authorization row(s) violate the recut document-hash rule', v_bad
      using errcode='CLR10';
  end if;
end
$s2_pre$;
alter table clara.egress_dispatch_authorizations
  drop constraint ck_egress_dispatch_authorizations_doc_sha;
alter table clara.egress_dispatch_authorizations
  add constraint ck_egress_dispatch_authorizations_doc_sha check (
    (purpose <> 'wiki_synthesis'      or document_sha256 is null)
    and (purpose <> 'statement_extraction' or document_sha256 is not null)
    and (purpose <> 'witness_extraction' or document_sha256 is not null)
    and (purpose <> 'bank_matching' or document_sha256 is null));

-- =====================================================================================
-- SECTION 3 -- the four purpose-bearing verbs: widen the HARDCODED in-body allowlist. The
-- table CHECK alone does not make the purpose grantable (0090's own finding). The wiki-hold
-- coupling stays purpose-discriminated and BYTE-UNTOUCHED elsewhere in each body: it fires for
-- p_purpose='wiki_synthesis' only, so bank_matching falls through with no hold transition,
-- exactly like statement_extraction and witness_extraction do today.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.grant_client_egress_purpose(p_client uuid,p_purpose text,
    p_evidence_document uuid,p_scope_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_scope_note is null or nullif(btrim(p_scope_note),'') is null then
    raise exception 'typed egress consent is malformed' using errcode='CLR10';
  end if;
  -- 0038 (WCB-R1): the SECOND typed purpose. 'statement_extraction' authorizes the
  -- statement-specific vendor read of a filed bank statement, and nothing else.
  -- F-A3/PR-1c: the FOURTH typed purpose, 'bank_matching' -- a per-client purpose covering the
  -- bank-matching lane's whole-ledger-slice-plus-counterparty-names read (design SS3.7).
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'grant_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'scope_note',p_scope_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm
      and status='active') then
    raise exception 'client is not active in your firm' using errcode='CLR11';
  end if;
  -- A null document, or any document that is not an already-classified, bytes-verified
  -- consent-evidence artifact in this firm, is refused. The owner-declaration path of
  -- 0012(A) is deliberately NOT available for typed consent.
  if p_evidence_document is null or not exists(select 1 from clara.documents
      where id=p_evidence_document and firm_id=c.firm
        and document_kind='consent_evidence' and bytes_verified_at is not null) then
    raise exception 'typed consent evidence must be a verified consent-evidence document in your firm'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_consents(firm_id,client_id,purpose,scope_note,
        evidence_document_id,granted_by)
      values(c.firm,p_client,p_purpose,btrim(p_scope_note),p_evidence_document,c.actor)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_consents_one_live' then
      raise exception 'client already has a live typed egress consent for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'grant_client_egress_purpose',null,
    jsonb_build_object('consent',v_id,'client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'op_key',p_op_key));
  -- The evidence document rides in the PAYLOAD, never the typed document_id column -- the
  -- 0014 rule (a consent artifact must not trip the filing-history provenance trigger)
  -- applies identically to typed consent.
  perform clara._append_event(c.firm,'egress.purpose_consent_granted',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',v_id,'purpose',p_purpose,
      'evidence_document_id',p_evidence_document));
  return clara._finish_op(c.firm,'grant_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',v_id,'purpose',p_purpose,'status','live'));
end $$;
alter function clara.grant_client_egress_purpose(uuid,text,uuid,text,text) owner to clara_fn_owner;

create or replace function clara.activate_client_egress_purpose(p_client uuid,p_purpose text,
    p_consent uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_consent is null then
    raise exception 'typed egress activation is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'activate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'consent',p_consent)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST. Section 7.1 mandates CLR11 for a client not in your firm, and
  -- the v1.0 body reached that verdict only AFTER a global (client, purpose) lookup that took
  -- FOR UPDATE on a foreign firm's live row -- cross-firm lock reach, and CLR28 instead of the
  -- mandated CLR11. Every state-row predicate below now carries firm_id=c.firm as well.
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  if x.id<>p_consent then
    raise exception 'the named consent is not the live typed consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"consent_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_activations(firm_id,client_id,purpose,
        consent_id,activated_by)
      values(c.firm,p_client,p_purpose,x.id,c.actor) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_activations_one_live' then
      raise exception 'client already has a live activation for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  -- 0020 section 4.3: the hold transition lives INSIDE the owner-floored RPC and goes through
  -- the audited writer (never a hand-written row). Only activation clears it.
  -- 0038 (WCB-R1, the follow-on ruling 0020:870-872 demanded): the coupling is
  -- PURPOSE-DISCRIMINATED. The wiki hold row is keyed on the CLIENT ALONE
  -- (0017:2335-2337), so it cannot represent "held for wiki, released for statements" -- and a
  -- statement_extraction activation that cleared it would silently release a wiki control the
  -- client never lifted. The hold is wiki's, and only wiki's, transition -- unchanged by
  -- F-A3/PR-1c: a bank_matching activation fires no hold transition either.
  if p_purpose='wiki_synthesis' then
    perform clara.clear_wiki_synthesis_hold(p_client,'wikirelease:purpose:'||v_id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'activate_client_egress_purpose',null,
    jsonb_build_object('activation',v_id,'consent',x.id,'client',p_client,
      'purpose',p_purpose,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_activated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',v_id,'consent_id',x.id,
      'purpose',p_purpose,'evidence_document_id',x.evidence_document_id));
  return clara._finish_op(c.firm,'activate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',v_id,'consent_id',x.id,'purpose',p_purpose,
      'status','active'));
end $$;
alter function clara.activate_client_egress_purpose(uuid,text,uuid,text) owner to clara_fn_owner;

create or replace function clara.deactivate_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress deactivation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST (see activate).
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_activations
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and deactivated_at is null for update;
  if not found then
    raise exception 'no live typed egress activation for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_activation"}';
  end if;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason=btrim(p_reason) where id=x.id;
  -- 0020 section 3.5: every OUTSTANDING authorization for the consent behind this activation is
  -- invalidated in the SAME transaction as the withdrawal.
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='activation_deactivated'
    where consent_id=x.consent_id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  -- 0038 (WCB-R1): PURPOSE-DISCRIMINATED, and this direction matters as much as the clear.
  -- Setting the client-keyed wiki hold on a statement_extraction (or bank_matching)
  -- deactivation would WEDGE wiki publication for a client whose wiki consent was never
  -- withdrawn. Only wiki's own withdrawal sets wiki's hold.
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose deactivated','wikihold:purpose:deact:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'deactivate_client_egress_purpose',null,
    jsonb_build_object('activation',x.id,'consent',x.consent_id,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_deactivated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',x.id,
      'consent_id',x.consent_id,'purpose',p_purpose,'reason',btrim(p_reason),
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',x.id,'consent_id',x.consent_id,'purpose',p_purpose,
      'status','deactivated'));
end $$;
alter function clara.deactivate_client_egress_purpose(uuid,text,text,text) owner to clara_fn_owner;

create or replace function clara.revoke_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_activation uuid; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress revocation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST (see activate).
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  update clara.client_egress_purpose_consents set revoked_by=c.actor,revoked_at=now(),
    revoke_reason=btrim(p_reason) where id=x.id;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason='typed egress consent revoked'
    where consent_id=x.id and firm_id=c.firm and deactivated_at is null
    returning id into v_activation;
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='consent_revoked'
    where consent_id=x.id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  -- 0038 (WCB-R1): PURPOSE-DISCRIMINATED, same reason as deactivate.
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose consent revoked','wikihold:purpose:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'revoke_client_egress_purpose',null,
    jsonb_build_object('consent',x.id,'activation',v_activation,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  -- One event for the withdrawal, carrying the activation id WHERE APPLICABLE (0020 section
  -- 4.1) and the evidence document in the payload (the 0014 rule).
  perform clara._append_event(c.firm,'egress.purpose_consent_revoked',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',x.id,'purpose',p_purpose,
      'activation_id',v_activation,'reason',btrim(p_reason),
      'evidence_document_id',x.evidence_document_id,
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',x.id,'activation_id',v_activation,'purpose',p_purpose,
      'status','revoked'));
end $$;
alter function clara.revoke_client_egress_purpose(uuid,text,text,text) owner to clara_fn_owner;

-- =====================================================================================
-- SECTION 4 -- prepare_egress_dispatch: the bank_matching doc_sha pre-check arm (mirrors
-- wiki_synthesis's exactly -- v_sha must be NULL). consume_egress_dispatch needs NO change --
-- its re-binding check (a.document_sha256 is distinct from v_sha) is already purpose-generic.
-- =====================================================================================
create or replace function clara.prepare_egress_dispatch(p_firm uuid,p_client uuid,p_purpose text,
    p_event_seq bigint,p_event_type text,p_document_sha256 text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  -- 0020 section 3.2 TTL, one named constant, identical to the 5-arg arity's.
  c_dispatch_ttl constant interval := interval '120 seconds';
  v_consent uuid; v_activation uuid; v_id uuid; v_sha text;
begin
  if p_firm is null or p_client is null or p_purpose is null
     or p_event_seq is null or p_event_type is null or btrim(p_event_type)='' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  v_sha := lower(nullif(btrim(coalesce(p_document_sha256,'')),''));
  -- Shape, then purpose/hash consistency. All refusals are UNIFORM unknown, never a raise: a
  -- distinguishing error here is exactly the oracle 0020 section 3.3 forbids.
  if v_sha is not null and v_sha !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='wiki_synthesis' and v_sha is not null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='statement_extraction' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- F-A1 PR-1 (wall 6): witness_extraction is document-tied exactly like statement_extraction
  -- (the vision channel sends original bytes, the text channel re-sends OCR-derived client
  -- content -- both document-scoped egress). Same uniform 'unknown' refusal, never a raise:
  -- letting ck_egress_dispatch_authorizations_doc_sha fire instead would be a distinguishing
  -- channel the design's own non-oracle rule forbids.
  if p_purpose='witness_extraction' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- F-A3/PR-1c: bank_matching is NOT document-tied -- the wiki_synthesis arm's shape, mirrored
  -- exactly (a non-null hash here is refused uniformly, same as wiki's).
  if p_purpose='bank_matching' and v_sha is not null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  select a.id,a.consent_id into v_activation,v_consent
    from clara.client_egress_purpose_activations a
    join clara.client_egress_purpose_consents c
      on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
        and c.purpose=a.purpose
   where a.firm_id=p_firm and a.client_id=p_client and a.purpose=p_purpose
     and a.deactivated_at is null and c.revoked_at is null;
  if v_activation is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- RATCHET R1-F2: WALL CLOCK, not transaction time (0020:432-435), so the stated TTL is an
  -- honest wall-clock 120s for a caller inside a long-open transaction too.
  insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,
      activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
    values(p_firm,p_client,p_purpose,v_consent,v_activation,p_event_seq,p_event_type,
      v_sha,clock_timestamp(),clock_timestamp()+c_dispatch_ttl)
    returning id into v_id;
  return jsonb_build_object('verdict','granted','authorization_id',v_id);
end $$;
alter function clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text) owner to clara_fn_owner;

reset role;

-- =====================================================================================
-- TAIL -- POSTCHECK. Every recut body pinned by its NEW exact prosrc sha256; the four CHECKs
-- re-read and asserted at their widened form; the pre-recut ACL matrix asserted UNMOVED
-- (measured against the SECTION 0 capture, not assumed from CREATE OR REPLACE's own promise).
-- =====================================================================================
do $post$
declare v_src text; v_sha text; v_def text; v_n int; v_sig text; v_acl text; v_was text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.grant_client_egress_purpose(uuid,text,uuid,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'fd22131913d842b68904a1c6df26ec1d71ae47214e44eab5cabb994102c51ca8' then
    raise exception 'f_a3_pr1c_egress S3 postcheck: grant_client_egress_purpose prosrc sha256 mismatch (got %, expected fd22131913d842b68904a1c6df26ec1d71ae47214e44eab5cabb994102c51ca8 -- the value measured on THIS lane''s own rig replay after the recut)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'e21fe306630fc2a442e5e055df74d3db5d314385c84fd3faef79e2e219596a73' then
    raise exception 'f_a3_pr1c_egress S3 postcheck: activate_client_egress_purpose prosrc sha256 mismatch (got %, expected e21fe306630fc2a442e5e055df74d3db5d314385c84fd3faef79e2e219596a73)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'e88309926a06d277b130f6768dbefec79cfc350a978447757afe777c32eadcc8' then
    raise exception 'f_a3_pr1c_egress S3 postcheck: deactivate_client_egress_purpose prosrc sha256 mismatch (got %, expected e88309926a06d277b130f6768dbefec79cfc350a978447757afe777c32eadcc8)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.revoke_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'f8be3f3fd05f02c8ef1a2b6a8c383fbc0c508625c69d950594541ee09acb3648' then
    raise exception 'f_a3_pr1c_egress S3 postcheck: revoke_client_egress_purpose prosrc sha256 mismatch (got %, expected f8be3f3fd05f02c8ef1a2b6a8c383fbc0c508625c69d950594541ee09acb3648)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'ac646034ceba9e9670dd05702c656ad7ad8ee97ecb2ce0260df3463248e8dbbe' then
    raise exception 'f_a3_pr1c_egress S4 postcheck: prepare_egress_dispatch prosrc sha256 mismatch (got %, expected ac646034ceba9e9670dd05702c656ad7ad8ee97ecb2ce0260df3463248e8dbbe)', v_sha using errcode='CLR10';
  end if;

  -- The four CHECKs, re-read and asserted at their widened form.
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='client_egress_purpose_consents' and con.contype='c'
     and con.conname='ck_client_egress_purpose_consents_purpose_f_a1';
  if v_def <> 'CHECK ((purpose = ANY (ARRAY[''wiki_synthesis''::text, ''statement_extraction''::text, ''witness_extraction''::text, ''bank_matching''::text])))' then
    raise exception 'f_a3_pr1c_egress postcheck: client_egress_purpose_consents purpose CHECK is not the expected widened form (got %)', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='client_egress_purpose_activations' and con.contype='c'
     and con.conname='ck_client_egress_purpose_activations_purpose_f_a1';
  if v_def <> 'CHECK ((purpose = ANY (ARRAY[''wiki_synthesis''::text, ''statement_extraction''::text, ''witness_extraction''::text, ''bank_matching''::text])))' then
    raise exception 'f_a3_pr1c_egress postcheck: client_egress_purpose_activations purpose CHECK is not the expected widened form (got %)', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.contype='c'
     and con.conname='ck_egress_dispatch_authorizations_purpose_f_a1';
  if v_def <> 'CHECK ((purpose = ANY (ARRAY[''wiki_synthesis''::text, ''statement_extraction''::text, ''witness_extraction''::text, ''bank_matching''::text])))' then
    raise exception 'f_a3_pr1c_egress postcheck: egress_dispatch_authorizations purpose CHECK is not the expected widened form (got %)', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.contype='c'
     and con.conname='ck_egress_dispatch_authorizations_doc_sha';
  if v_def <> 'CHECK ((((purpose <> ''wiki_synthesis''::text) OR (document_sha256 IS NULL)) AND ((purpose <> ''statement_extraction''::text) OR (document_sha256 IS NOT NULL)) AND ((purpose <> ''witness_extraction''::text) OR (document_sha256 IS NOT NULL)) AND ((purpose <> ''bank_matching''::text) OR (document_sha256 IS NULL))))' then
    raise exception 'f_a3_pr1c_egress postcheck: ck_egress_dispatch_authorizations_doc_sha is not the expected widened form (got %)', v_def using errcode='CLR10';
  end if;

  -- THE ACL MATRIX IS UNMOVED, measured against the SECTION 0 capture rather than assumed.
  select count(*)::int into v_n from _fa3pr1c_pre_acl;
  if v_n <> 5 then
    raise exception 'f_a3_pr1c_egress postcheck: the pre-recut ACL capture holds % rows (expected 5) -- the instrument is not measuring what it claims', v_n using errcode='CLR10';
  end if;
  for v_sig, v_was in select sig, acl from _fa3pr1c_pre_acl order by sig loop
    select coalesce(
      (select string_agg(a.grantee::regrole::text||':'||a.privilege_type, ',' order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
         from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = v_sig::regprocedure), '(none)') into v_acl;
    if v_acl is distinct from v_was then
      raise exception 'f_a3_pr1c_egress postcheck: % changed ACL across the recut (was [%], now [%]) -- the typed-purpose surface must keep its EXACT pre-recut grant matrix', v_sig, v_was, v_acl using errcode='CLR10';
    end if;
  end loop;

  raise notice 'f_a3_pr1c_egress tail: OK -- the three purpose CHECKs and the doc-sha CHECK now admit bank_matching (doc-sha requiring NULL, the wiki_synthesis shape); the four typed-purpose verbs and prepare_egress_dispatch recut -- bank_matching is now grantable/activatable/deactivatable/revocable and sha-gated (NULL-required) at prepare time; all 5 bodies keep their EXACT pre-recut ACLs (measured before and after, not assumed); the wiki-hold coupling is untouched and stays purpose-discriminated to wiki_synthesis alone. D1 write-quiesce taken (grant/activate/deactivate/revoke_client_egress_purpose, prepare_egress_dispatch). No table in workflow/graphile_worker/spike touched. GOVERNED_EGRESS_PURPOSES (packages/runtime/lib/egress.mjs) is NOT updated by this file -- that is F-A3/PR-2''s (Annex E item 10, class runtime).';
end
$post$;
