-- =====================================================================
-- Migration 0028 (vendor identity binding machinery, task #36) --
-- POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database
-- immediately after applying 0028:
--
--   psql "$DSN" -v ON_ERROR_STOP=1 \
--     -f vendor-identity-binding-0028-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success, so a clean
-- run ends with one notice per probe and nothing else.
--
-- WHAT 0028 CLAIMS, restated as structural/catalog probes:
--   1. The mandatory 0027 prior migration and 0028 itself are recorded.
--   2. All three binding tables exist, FORCE RLS, and expose no base-table
--      privilege to authenticated, agent, runtime, or wake roles.
--   3. journal_entries.vendor_binding_id and its congruent FK exist.
--   4. _binding_normalize is IMMUTABLE.
--   5. _resolve_vendor_binding is STABLE, SECURITY DEFINER, and owner-private.
--   6. The three mutation verbs and two read verbs have the exact authenticated
--      EXECUTE surface; mutation verbs contain their documented human floors,
--      and signing contains the 0029 ledger interlock by executable source.
--   7. Every recut function remains a one-overload surface.
--   8. _tf_entry_immutable's draft->draft allowlist names coding_kind and
--      vendor_binding_id.
--   9. persist_invoice_facts locks documents strictly before document_filings.
--  10. execute_rule_post carries all three split eligibility reasons and no
--      longer carries not_eligible_shape.
--
-- COMMENT-STRIPPING DISCIPLINE. Every body assertion strips BOTH `--` line
-- comments and `/* ... */` block comments before normalizing whitespace. A
-- deleted guard pasted back as a comment therefore cannot satisfy a probe.
--
-- THE HONEST FRAMING. This file is BELT, not exhaustive proof of the proposal,
-- signature, revocation, F1/F2/F3, draft override, or divergence semantics.
-- Those are behavioral and adversarial rig responsibilities. These probes
-- re-check committed catalog structure, ACLs, volatility/security attributes,
-- exact recut scope, and the security-critical signing interlock from outside
-- the migration transaction.

do $verify$
declare
  v_n int;
  v_name text;
  v_sig regprocedure;
  v_src text;
  v_norm text;
  v_pos_lock int;
  v_pos_touch int;
  v_bad text;
begin
  -- (1) mandatory prior-migration chain and this migration's ledger row.
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0027_filings_lock_order';
  if v_n<>1 then
    raise exception '0028 postverify: migration 0027_filings_lock_order is not recorded';
  end if;
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0028_vendor_identity_binding';
  if v_n<>1 then
    raise exception '0028 postverify: migration 0028_vendor_identity_binding is not recorded';
  end if;
  raise notice '0028 postverify OK (1/10): prior-migration chain intact through 0028';

  -- (2) all three base tables are FORCE RLS with no direct app-role grants.
  select count(*)::int into v_n
  from pg_class c
  where c.oid in (
    'clara.vendor_identity_bindings'::regclass,
    'clara.vendor_identity_binding_evidence'::regclass,
    'clara.vendor_binding_resolutions'::regclass
  ) and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;
  if v_n<>3 then
    raise exception '0028 postverify: all three binding tables must exist with FORCE RLS (got %)',v_n;
  end if;
  select string_agg(g.table_name||':'||g.grantee||':'||g.privilege_type,', ')
    into v_bad
  from information_schema.role_table_grants g
  where g.table_schema='clara'
    and g.table_name in (
      'vendor_identity_bindings',
      'vendor_identity_binding_evidence',
      'vendor_binding_resolutions'
    )
    and g.grantee in (
      'PUBLIC','clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_wake_interactive','clara_wake_proactive'
    );
  if v_bad is not null then
    raise exception '0028 postverify: binding base tables gained direct app-role grants: %',v_bad;
  end if;
  raise notice '0028 postverify OK (2/10): three binding tables are FORCE RLS and owner-only';

  -- (3) journal provenance column and exact composite FK.
  if not exists (
    select 1 from pg_attribute a
    where a.attrelid='clara.journal_entries'::regclass
      and a.attname='vendor_binding_id'
      and a.atttypid='uuid'::regtype
      and not a.attisdropped
  ) then
    raise exception '0028 postverify: journal_entries.vendor_binding_id uuid is missing';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='clara.journal_entries'::regclass
      and c.conname='fk_je_vendor_binding'
      and c.contype='f'
      and c.confrelid='clara.vendor_identity_bindings'::regclass
      and pg_get_constraintdef(c.oid)=
        'FOREIGN KEY (vendor_binding_id, firm_id, client_id) REFERENCES clara.vendor_identity_bindings(id, firm_id, client_id)'
  ) then
    raise exception '0028 postverify: fk_je_vendor_binding is missing or not tenant-congruent';
  end if;
  raise notice '0028 postverify OK (3/10): journal vendor_binding_id and congruent FK exist';

  -- (4) the exact normalizer is immutable.
  select count(*)::int into v_n
  from pg_proc p
  where p.oid='clara._binding_normalize(text)'::regprocedure
    and p.provolatile='i';
  if v_n<>1 then
    raise exception '0028 postverify: _binding_normalize(text) is missing or not IMMUTABLE';
  end if;
  raise notice '0028 postverify OK (4/10): _binding_normalize is IMMUTABLE';

  -- (5) admission resolver is stable, definer-owned, and owner-private. A NULL
  -- proacl is a failure because it implies PUBLIC EXECUTE on functions.
  select count(*)::int into v_n
  from pg_proc p
  where p.oid='clara._resolve_vendor_binding(uuid,uuid)'::regprocedure
    and p.provolatile='s'
    and p.prosecdef
    and p.proacl is not null
    and not exists (
      select 1 from lateral aclexplode(p.proacl) a
      where a.privilege_type='EXECUTE'
        and (a.grantee=0 or pg_get_userbyid(a.grantee)<>'clara_fn_owner')
    );
  if v_n<>1 then
    raise exception '0028 postverify: _resolve_vendor_binding is not stable/definer/owner-private';
  end if;
  raise notice '0028 postverify OK (5/10): admission resolver is STABLE, SECURITY DEFINER, and private';

  -- (6a) mutation verbs: exact one overload, authenticated-only explicit grant,
  -- and the documented executable human-floor call.
  foreach v_name in array array[
    'propose_vendor_identity_binding',
    'sign_vendor_identity_binding',
    'revoke_vendor_identity_binding'
  ] loop
    select case v_name
      when 'propose_vendor_identity_binding'
        then 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure
      when 'sign_vendor_identity_binding'
        then 'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure
      else 'clara.revoke_vendor_identity_binding(uuid,text,text)'::regprocedure
    end into v_sig;
    select pg_get_functiondef(v_sig) into v_src;
    v_norm:=lower(regexp_replace(
      regexp_replace(
        regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
        '--[^\n]*','','g'),
      '\s+',' ','g'));
    if not exists (
      select 1 from pg_proc p
      where p.oid=v_sig and p.prosecdef and p.proacl is not null
        and exists (
          select 1 from lateral aclexplode(p.proacl) a
          where a.privilege_type='EXECUTE'
            and pg_get_userbyid(a.grantee)='clara_authenticated'
        )
        and not exists (
          select 1 from lateral aclexplode(p.proacl) a
          where a.privilege_type='EXECUTE'
            and (a.grantee=0 or pg_get_userbyid(a.grantee)
              not in ('clara_fn_owner','clara_authenticated'))
        )
    ) then
      raise exception '0028 postverify: % does not have the exact authenticated EXECUTE surface',v_name;
    end if;
    if v_name='sign_vendor_identity_binding' then
      if v_norm !~ '_human_ctx\s*\(\s*clara\.role_rank\s*\(\s*''admin''\s*\)\s*\)' then
        raise exception '0028 postverify: sign_vendor_identity_binding lacks its admin floor';
      end if;
    elsif v_norm !~ '_human_ctx\s*\(\s*clara\.role_rank\s*\(\s*''bookkeeper''\s*\)\s*\)' then
      raise exception '0028 postverify: % lacks its bookkeeper floor',v_name;
    end if;
  end loop;

  -- Signing interlock: executable (comment-stripped) source must carry BOTH the
  -- exact 0029 ledger version and the named refusal token.
  select pg_get_functiondef(
    'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure)
    into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position('0029_vendor_binding_executor' in v_norm)=0
     or position('post_control_absent' in v_norm)=0
     or position('from clara.schema_migrations' in v_norm)=0 then
    raise exception '0028 postverify: sign_vendor_identity_binding lacks the executable 0029 post_control_absent interlock';
  end if;

  -- (6b) read verbs share the bookkeeper floor and authenticated-only grant.
  foreach v_sig in array array[
    'clara.list_vendor_bindings(uuid)'::regprocedure,
    'clara.get_vendor_binding(uuid)'::regprocedure
  ] loop
    select pg_get_functiondef(v_sig) into v_src;
    v_norm:=lower(regexp_replace(
      regexp_replace(
        regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
        '--[^\n]*','','g'),
      '\s+',' ','g'));
    if v_norm !~ '_human_ctx\s*\(\s*clara\.role_rank\s*\(\s*''bookkeeper''\s*\)\s*\)'
       or not exists (
         select 1 from pg_proc p
         where p.oid=v_sig and p.proacl is not null
           and exists (
             select 1 from lateral aclexplode(p.proacl) a
             where a.privilege_type='EXECUTE'
               and pg_get_userbyid(a.grantee)='clara_authenticated'
           )
           and not exists (
             select 1 from lateral aclexplode(p.proacl) a
             where a.privilege_type='EXECUTE'
               and (a.grantee=0 or pg_get_userbyid(a.grantee)
                 not in ('clara_fn_owner','clara_authenticated'))
           )
       ) then
      raise exception '0028 postverify: read verb % lacks its floor or exact grant',v_sig;
    end if;
  end loop;
  raise notice '0028 postverify OK (6/10): mutation/read verbs have exact floors and grants; signing interlock is executable';

  -- (7) recut sweep scope: exactly one overload for every named body.
  select string_agg(x.proname||'='||x.n,', ') into v_bad
  from (
    select wanted.proname,count(p.oid)::text as n
    from unnest(array[
      '_coding_lane_core','_draft_entry_core','revise_entry',
      '_tf_entry_immutable','get_draft_review'
    ]) wanted(proname)
    left join pg_proc p
      on p.proname=wanted.proname
     and p.pronamespace='clara'::regnamespace
    group by wanted.proname
    having count(p.oid)<>1
  ) x;
  if v_bad is not null then
    raise exception '0028 postverify: recut overload sweep failed: %',v_bad;
  end if;
  raise notice '0028 postverify OK (7/10): every recut surface still has exactly one overload';

  -- (8) immutable-entry draft allowlist has both divergence-cleared columns.
  select pg_get_functiondef('clara._tf_entry_immutable()'::regprocedure)
    into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position('''coding_kind''' in v_norm)=0
     or position('''vendor_binding_id''' in v_norm)=0
     or position('old.status = ''draft'' and new.status = ''draft''' in v_norm)=0 then
    raise exception '0028 postverify: _tf_entry_immutable draft allowlist lacks coding_kind/vendor_binding_id';
  end if;
  raise notice '0028 postverify OK (8/10): draft divergence columns are trigger-allowlisted';

  -- (9) A.7 amendment: documents lock must be strictly before the first
  -- document_filings lock. Presence without order is not enough.
  select pg_get_functiondef(
    'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure)
    into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  v_pos_lock:=position(
    'from clara.documents where id=t.document_id for update' in v_norm);
  v_pos_touch:=position('from clara.document_filings f' in v_norm);
  if v_pos_lock=0 or v_pos_touch=0 or v_pos_lock>=v_pos_touch then
    raise exception '0028 postverify: persist_invoice_facts documents lock is not strictly before document_filings (lock=%, filings=%)',v_pos_lock,v_pos_touch;
  end if;
  raise notice '0028 postverify OK (9/10): persist_invoice_facts locks documents before document_filings';

  -- (10) executor delta is exactly the vocabulary split, not additive.
  select pg_get_functiondef(
    'clara.execute_rule_post(uuid,text)'::regprocedure) into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position('ineligible_no_coding_kind' in v_norm)=0
     or position('ineligible_no_document' in v_norm)=0
     or position('ineligible_no_counterparty' in v_norm)=0
     or position('not_eligible_shape' in v_norm)<>0 then
    raise exception '0028 postverify: execute_rule_post eligibility vocabulary split is incomplete';
  end if;
  raise notice '0028 postverify OK (10/10): executor eligibility vocabulary is fully split';

  raise notice '0028 postverify: ALL STRUCTURAL/CATALOG PROBES PASSED -- behavioral correctness remains the rig suite''s job';
end
$verify$;
