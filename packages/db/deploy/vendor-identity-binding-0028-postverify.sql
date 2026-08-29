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
--   5. _resolve_vendor_binding(uuid,uuid,uuid) returns jsonb, is STABLE,
--      SECURITY DEFINER, owner-private, and no longer calls _resolve_counterparty.
--   6. The three mutation verbs and two read verbs have the exact authenticated
--      EXECUTE surface; mutation verbs contain their documented human floors,
--      and signing contains the 0029 ledger interlock by executable source.
--   7. Every recut function remains a one-overload surface.
--   8. _tf_entry_immutable's draft->draft allowlist names coding_kind and
--      vendor_binding_id.
--   9. persist_invoice_facts locks documents strictly before document_filings.
--  10. execute_rule_post carries all three split eligibility reasons and no
--      longer carries not_eligible_shape.
--  11. Slot A narrows the CLR23 catch to ordinary resolution, passes the parsed
--      page candidate to the resolver, and surfaces binding_ambiguous as hard.
--  12. Slot B distinguishes an explicit existing_id from every deferred `new`
--      proposal, never re-resolves the raw bound clean-name proposal, stamps the
--      control leg, and keeps both human and unbound fallbacks outside the block.
--
-- COMMENT-STRIPPING DISCIPLINE. Every body assertion strips BOTH `--` line
-- comments and `/* ... */` block comments before normalizing whitespace. A
-- deleted guard pasted back as a comment therefore cannot satisfy a probe.
--
-- STALE PROBE, RECORDED RATHER THAN SILENTLY LEFT (2026-08-30, 裁-18b PR-1
-- fold round, N-6). Probe 10 (~line 326) pins `clara.execute_rule_post
-- (uuid,text)`. That function was DROPPED by migration
-- 0118_f_a2_cutover_retirement.sql (its S1 drop list, line 212) when the
-- rules tier F-A2 retired -- so probe 10 has raised `undefined_function`
-- against any database past 0118 since that migration landed, on a file
-- this comment does not otherwise touch. NOT deleted here: retiring this
-- probe (and this whole file's relationship to a rules tier that no longer
-- exists) is a separate, owner-batched cleanup. Recorded so a reader does
-- not mistake the silence for the probe still proving something.
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
  v_pos_resolve int;
  v_pos_catch int;
  v_pos_binding int;
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
  raise notice '0028 postverify OK (1/12): prior-migration chain intact through 0028';

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
  raise notice '0028 postverify OK (2/12): three binding tables are FORCE RLS and owner-only';

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
  raise notice '0028 postverify OK (3/12): journal vendor_binding_id and congruent FK exist';

  -- (4) the exact normalizer is immutable.
  select count(*)::int into v_n
  from pg_proc p
  where p.oid='clara._binding_normalize(text)'::regprocedure
    and p.provolatile='i';
  if v_n<>1 then
    raise exception '0028 postverify: _binding_normalize(text) is missing or not IMMUTABLE';
  end if;
  raise notice '0028 postverify OK (4/12): _binding_normalize is IMMUTABLE';

  -- (5) admission resolver is stable, definer-owned, and owner-private. A NULL
  -- proacl is a failure because it implies PUBLIC EXECUTE on functions.
  select count(*)::int into v_n
  from pg_proc p
  where p.oid='clara._resolve_vendor_binding(uuid,uuid,uuid)'::regprocedure
    and p.provolatile='s'
    and p.prosecdef
    and pg_get_function_result(p.oid)='jsonb'
    and p.proacl is not null
    and not exists (
      select 1 from lateral aclexplode(p.proacl) a
      where a.privilege_type='EXECUTE'
        and (a.grantee=0 or pg_get_userbyid(a.grantee)<>'clara_fn_owner')
    );
  if v_n<>1 then
    raise exception '0028 postverify: _resolve_vendor_binding is not stable/definer/owner-private';
  end if;
  select pg_get_functiondef(
    'clara._resolve_vendor_binding(uuid,uuid,uuid)'::regprocedure)
    into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position('_resolve_counterparty' in v_norm)<>0
     or position(
       '(p_page_candidate is null or b.counterparty_id=p_page_candidate)'
       in v_norm)=0
     or position('array_agg(b.id order by b.id)' in v_norm)=0
     or position('if v_matches>1 then' in v_norm)=0
     or position(
       'not starts_with(v_invoice_id_norm,v_f2_prefix)' in v_norm)=0 then
    raise exception
      '0028 postverify: resolver still owns page resolution or lacks candidate/F1-count/F2-order controls';
  end if;
  raise notice '0028 postverify OK (5/12): JSONB admission resolver is STABLE/private and keeps page resolution at the caller';

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
        then 'clara.sign_vendor_identity_binding(uuid,text,text)'::regprocedure
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

  -- Signing interlock: executable (comment-stripped) source must carry the CATALOG WITNESS.
  --
  -- RE-POINTED 2026-08-30 (裁-18b PR-1 fold, finding C3). This probe used to demand the exact
  -- string `0029_vendor_binding_executor` and a read of `clara.schema_migrations`. That is the
  -- defect it was meant to guard against, wearing the shape of a guard: the ledger is append-only,
  -- so the row has been present ever since 0029 applied and can never stop being, while the
  -- control it stood for lived in `clara.execute_rule_post` -- which `0118` DROPPED. The interlock
  -- was therefore permanently OPEN and this probe was permanently GREEN, together.
  -- So the probe now demands the opposite: the ledger read must be GONE, and the body must resolve
  -- the approve path by EXACT SIGNATURE and look for the ratified marker PR-3 mints. Both
  -- directions, because "the old read is absent" alone would pass on a body that checks nothing.
  select pg_get_functiondef(
    'clara.sign_vendor_identity_binding(uuid,text,text)'::regprocedure)
    into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position('0029_vendor_binding_executor' in v_norm)<>0 then
    raise exception '0028 postverify: sign_vendor_identity_binding still reads the 0029 LEDGER ROW -- that row is permanent and the control it named was dropped at 0118, so the interlock it guards is permanently open';
  end if;
  if position('post_time_control_absent' in v_norm)=0
     or position('binding_post_time_recheck_v1' in v_norm)=0
     or position('clara._approve_entry_core(jsonb,uuid,uuid,text,text)' in v_norm)=0 then
    raise exception '0028 postverify: sign_vendor_identity_binding lacks the executable post_time_control_absent catalog witness on the approve path';
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
  raise notice '0028 postverify OK (6/12): mutation/read verbs have exact floors and grants; signing interlock is executable';

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
  raise notice '0028 postverify OK (7/12): every recut surface still has exactly one overload';

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
  raise notice '0028 postverify OK (8/12): draft divergence columns are trigger-allowlisted';

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
  raise notice '0028 postverify OK (9/12): persist_invoice_facts locks documents before document_filings';

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
  raise notice '0028 postverify OK (10/12): executor eligibility vocabulary is fully split';

  -- (11) The ordinary resolver's CLR23 catch must finish before the Slot-A
  -- binding call, which receives the parsed page candidate and exposes a named
  -- hard ambiguity. This is the two-level reachability fix.
  select pg_get_functiondef(
    'clara._coding_lane_core(uuid,uuid)'::regprocedure) into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  v_pos_resolve:=position(
    'v_fp:=clara._resolve_counterparty' in v_norm);
  v_pos_catch:=position(
    'exception when sqlstate ''clr23''' in v_norm);
  v_pos_binding:=position(
    'v_binding_result:=clara._resolve_vendor_binding( p_client,f.document_id,v_page_candidate)'
    in v_norm);
  if v_pos_resolve=0 or v_pos_catch=0 or v_pos_binding=0
     or v_pos_resolve>=v_pos_catch or v_pos_catch>=v_pos_binding
     or position(
       'v_reasons:=array_append(v_reasons,''binding_ambiguous''); v_hard:=true;'
       in v_norm)=0 then
    raise exception
      '0028 postverify: Slot-A resolve/catch/binding order or hard binding_ambiguous branch is missing (resolve=%, catch=%, binding=%)',
      v_pos_resolve,v_pos_catch,v_pos_binding;
  end if;
  raise notice '0028 postverify OK (11/12): Slot A catches CLR23 before, not around, candidate-constrained binding resolution';

  -- (12) Q-round Slot B repair. An explicit existing_id is compared directly
  -- to the binding's canonical counterparty; every deferred `new` proposal goes
  -- straight to the binding-selected existing_id before ordinary resolution.
  -- The whole block remains agent-only, and the ordinary fallback after it is
  -- what preserves the pre-0028 unbound path.
  select pg_get_functiondef(
    'clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure)
    into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  v_pos_resolve:=position(
    'if not p_is_human and p_document is not null and v_kind=''vendor'' then'
    in v_norm);
  v_pos_catch:=position(
    'if v_proposal?''existing_id'' then' in v_norm);
  v_pos_binding:=position(
    'v_proposal:=jsonb_build_object( ''existing_id'',v_binding_counterparty,''kind'',''vendor'');'
    in v_norm);
  v_pos_touch:=position(
    'if v_fingerprint is null then v_fingerprint := clara._resolve_counterparty(p_client,v_proposal); end if;'
    in v_norm);
  if v_pos_resolve=0 or v_pos_catch=0 or v_pos_binding=0
     or v_pos_touch=0
     or v_pos_resolve>=v_pos_catch
     or v_pos_catch>=v_pos_binding
     or v_pos_binding>=v_pos_touch
     or position(
       'v_explicit_canonical:=clara._canonical_counterparty(' in v_norm)=0
     or position('raise exception ''vendor_binding_conflict''' in v_norm)=0
     or position(
       'if v_vendor_binding is not null then update clara.journal_lines l set counterparty_id=v_binding_counterparty'
       in v_norm)=0
     or position(
       'v_fingerprint:=clara._resolve_counterparty(p_client,v_proposal); if v_fingerprint is null'
       in v_norm)<>0 then
    raise exception
      '0028 postverify: Slot-B explicit/deferred split, control-leg stamp, or agent/unbound guard is incomplete (guard=%, explicit=%, override=%, fallback=%)',
      v_pos_resolve,v_pos_catch,v_pos_binding,v_pos_touch;
  end if;
  v_pos_lock:=position(
    'v_seq := clara._append_event(p_firm,''entry.drafted''' in v_norm);
  v_pos_touch:=case when v_pos_lock=0 then 0 else position(
    'perform clara._append_event(p_firm,''counterparty.binding_resolved'''
    in substring(v_norm from v_pos_lock))
  end;
  v_pos_resolve:=case when v_pos_lock=0 then 0 else position(
    'perform clara.assert_books_current(p_firm,p_client,p_books_version,v_seq);'
    in substring(v_norm from v_pos_lock))
  end;
  if v_pos_lock=0 or v_pos_touch=0 or v_pos_resolve=0
     or v_pos_touch>=v_pos_resolve then
    raise exception
      '0028 postverify: binding resolution event is not between entry.drafted and the wake stale-window check (entry=%, binding=%, check=%)',
      v_pos_lock,v_pos_touch,v_pos_resolve;
  end if;
  raise notice '0028 postverify OK (12/12): bound `new` proposals bypass raw re-resolution; explicit ids conflict directly; event order and human/unbound paths remain safe';

  raise notice '0028 postverify: ALL STRUCTURAL/CATALOG PROBES PASSED -- behavioral correctness remains the rig suite''s job';
end
$verify$;
