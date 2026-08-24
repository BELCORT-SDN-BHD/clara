-- UNNUMBERED_f_a5_reporting_agency_pr2a_defcores.sql -- Wave F Track-A item F-A5, PR-2, file 1 of
-- 5: the definition-family + snapshot-mint UNGRANTED CORES. The repo's 500-line ceiling on
-- agent-authored files (the ratified answer since delta/eta/zeta: split one logical change across
-- SEVERAL sequential migration FILES, never split a migration's transaction semantics) forces PR-2
-- into five files, in APPLY ORDER:
--   pr2a_defcores  (this file)  -- reject / supersede / mint_snapshot cores + the appended
--                                  metric_input_snapshot_agent v1 producer row
--   pr2b_othercores             -- create_account_set / requeue cores + the four typed-read cores
--   pr2c_wrappers1              -- the chain + definitions wrapper group (9 wrappers)
--   pr2d_wrappers2              -- the catalog + templates + reads wrapper group (8 wrappers)
--   pr2e_grants                 -- EXECUTE grants, wake_fn_allowlist rows, the C.2 tail census
-- Each file re-derives its OWN prestate from the live catalog (never trusts an in-memory flag from
-- an earlier file) and re-declares any pg_temp helper it needs, because pg_temp objects are
-- SESSION-scoped and a migration runner is not guaranteed to keep one connection open across
-- files -- exactly PR-1's own reasoning for not assuming its own pg_temp survives into this item.
--
-- DESIGN OF RECORD: docs/plan/active/reporting-agency-design.md (v2) SS3.1, SS4-SS5 PR-2;
-- annexes reporting-agency-annexes-1-mechanics.md (A.1 verbs, A.2 vocabulary, A.3 receipt, C
-- censuses) and reporting-agency-annexes-2-record.md (D decisions, E-P7). Estate survey:
-- reporting-agency-survey.md. E-P7: "the requeue core is not extracted in PR-1 [carried to PR-2]."
--
-- ============================ TWO MEASURED DIVERGENCES IN THIS FILE, FLAGGED FOR REVIEW (law 1) =
--
-- (1) None of reject_metric_definition / supersede_metric_definition / mint_metric_input_snapshot_v1
--     call clara._report_agent_receipt or take a p_agent parameter (rig-measured). Annex A.3's
--     closed act world still names reject_definition / supersede_definition / mint_snapshot as
--     receipted acts. The AGENT SIBLING cores below add the call themselves, in the same fixup
--     pass that renames the verb-key strings -- see the section-2 banner for the full reasoning
--     (also stated once, in full, in pr2b_othercores.sql's own header for its two cores).
--
-- (2) The agent sibling for reject/supersede/mint_snapshot uses a DISTINCT 'agent_*' verb-key
--     string in its own _reserve_op/_finish_op/_audit calls (e.g. 'agent_reject_metric_definition'
--     rather than 'reject_metric_definition'), so an agent-lane op_key can never collide with the
--     human lane's reservation namespace on the same literal string -- matching
--     _agent_approve_metric_definition_core's own PR-1 precedent of a distinct verb key.
--
-- ============================ SECTION 0 -- PRESTATE ==============================================
do $s0$
declare v_missing text[] := '{}'; v_bad text[] := '{}'; v_present text[] := '{}'; v_sig text; v_sha text;
begin
  foreach v_sig in array array[
      'clara.wake_context()', 'clara.assert_wake_allowed(text,text)', 'clara.agent_user_id()',
      'clara._report_agent_receipt(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,text,jsonb,text,jsonb,text)',
      'clara.evaluate_fs_pack_agent_v1(uuid,uuid,uuid,text,uuid,uuid[],uuid[],uuid,uuid,jsonb,text)'
    ] loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'f_a5 pr2a prestate: PR-1 object(s) absent -- apply PR-1 first: %', array_to_string(v_missing,' | ') using errcode='CLR10';
  end if;

  -- reference-body prosrc sha256 pins, read from the live catalog on rig clara-rig-fa5pr2 at
  -- frontier 0103 (PR-1 applied, 2026-08-23). Provenance pins: reject/supersede/mint_snapshot open
  -- with _human_ctx and would CLR04 under a wake credential (S2's reasoning), so this file's cores
  -- MODEL their logic rather than literally reuse them at runtime; a drift here means the model is
  -- stale and the file refuses rather than author against an outdated premise.
  for v_sig, v_sha in
    select * from (values
      ('clara.reject_metric_definition(uuid,text,text)',                     '4ffec6c0d7526d063f710b13395c743d7ddbade977d1b1b96ee02943f232e35b'),
      ('clara.supersede_metric_definition(uuid,uuid,text,text)',             '204ce22f2653aa657d8bb835c3a2d24be947a03f69fad97274bb518165089222'),
      ('clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)',              '0850daf989d2792e85eec9c95bf51afe51ad0bfefcf6a66b976d7ef444c73a25'),
      ('clara._metric_input_dataset_v1(uuid,uuid,uuid[])',                   '444f5b16bdeccf3aa94797121cd82668cfda928451ae6d67172a47091d3181ff')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; continue; end if;
    if encode(sha256(convert_to((select prosrc from pg_proc where oid = v_sig::regprocedure),'UTF8')),'hex')
        is distinct from v_sha then v_bad := v_bad || v_sig; end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'f_a5 pr2a prestate: reference signature(s) absent: %', array_to_string(v_missing,' | ') using errcode='CLR10';
  end if;
  if coalesce(array_length(v_bad,1),0) > 0 then
    raise exception 'f_a5 pr2a prestate: reference body sha mismatch: %', array_to_string(v_bad,' | ') using errcode='CLR10';
  end if;

  foreach v_sig in array array[
      'clara._agent_reject_metric_definition_core(uuid,uuid,uuid,text,uuid,text,text,jsonb)',
      'clara._agent_supersede_metric_definition_core(uuid,uuid,uuid,text,uuid,uuid,text,text,jsonb)',
      'clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb)'
    ] loop
    if to_regprocedure(v_sig) is not null then v_present := v_present || v_sig; end if;
  end loop;
  if coalesce(array_length(v_present,1),0) > 0 then
    raise exception 'f_a5 pr2a prestate: partial birth -- object(s) already present: %', array_to_string(v_present,' | ') using errcode='CLR10';
  end if;

  if exists (select 1 from clara.metric_input_producer_versions
              where firm_id is null and producer_name = 'metric_input_snapshot_agent' and version = 1) then
    raise exception 'f_a5 pr2a prestate: metric_input_snapshot_agent v1 producer row already present' using errcode = 'CLR10';
  end if;

  raise notice 'f_a5 pr2a prestate: clean -- 5 PR-1 objects present, 4 reference bodies at pinned shas, 3 new cores absent, producer row absent';
end
$s0$;

create temporary table _fa5pr2a_pre (k text primary key, v text);
insert into _fa5pr2a_pre values ('deploy_user', current_user), ('deploy_role', current_role);
set role clara_fn_owner;

-- ============================ SECTION 1 -- LOCAL DERIVATION HELPERS =============================
-- Byte-identical in mechanism to PR-1's pg_temp._fa5_extract (0071/0097-0102's idiom): derive the
-- whole definition from the live catalog, splice, PROVE the splice by reversing it.
create function pg_temp._fa5b_assert_no_wiki(p_label text, p_sql text) returns void
  language plpgsql as $nw$
begin
  if p_sql ~* '\mwiki[a-z0-9_]*\M'
     or p_sql ~* '\m(get_context_pack|run_client_lint|run_lint_all)\M' then
    raise exception 'f_a5 pr2 %: the derived body names a wiki relation or a wiki-touch verb', p_label
      using errcode = 'CLR10',
      detail = '{"reason":"wiki_authority_boundary","fix":"a reporting body may not reach the wiki surface; move the read into a whitelisted wiki verb"}';
  end if;
end
$nw$;

-- Steps (a)(b)(c): delete the context anchor and the declared "c record" leaf, substitute
-- c.actor -> p_actor and c.firm -> p_firm, each with an anchor-uniqueness assertion, and PROVE the
-- reversal reconstructs the original body exactly. p_extra_args, when given, is appended to the
-- new core's argument list (this item always uses it for ', p_agent jsonb', appended LAST rather
-- than before p_op_key as _agent_approve_metric_definition_core's own convention has it -- a minor
-- stylistic deviation kept safe by calling every core below with NAMED parameters, never
-- positionally, so the order carries no risk). Step (d) -- the null,null -> p_obo,p_wake_kind audit
-- splice -- is NOT folded into this helper: it is an explicit, independently-proven splice per
-- body, because one derivation target used elsewhere in this item (requeue, pr2b) does not have
-- that anchor shape at all, and silently no-op'ing on a body that does not match would be a worse
-- defect than writing the splice out per body.
create function pg_temp._fa5b_derive(
    p_sig text, p_core_name text, p_ctx_anchor text, p_decl_anchor text,
    p_expect_c_actor int, p_expect_c_firm int, p_extra_args text default '')
  returns text language plpgsql as $ext$
declare v_body text; v_args text; v_ret text; v_new text; v_check text; v_expect text; v_n int;
begin
  select p.prosrc, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
    into v_body, v_args, v_ret from pg_proc p where p.oid = p_sig::regprocedure;

  if position('$fa5b$' in v_body) > 0 then
    raise exception 'f_a5 pr2 derive %: the body contains the dollar-quote tag this file uses', p_sig using errcode='CLR10';
  end if;
  if position('p_actor' in v_body) > 0 or position('p_firm' in v_body) > 0
     or position('p_obo' in v_body) > 0 or position('p_wake_kind' in v_body) > 0 then
    raise exception 'f_a5 pr2 derive %: the body already uses a name the substitution introduces', p_sig using errcode='CLR10';
  end if;

  v_n := (length(v_body) - length(replace(v_body, p_ctx_anchor, ''))) / length(p_ctx_anchor);
  if v_n <> 1 then raise exception 'f_a5 pr2 derive %: context anchor occurs % time(s), expected 1', p_sig, v_n using errcode='CLR10'; end if;
  v_n := (length(v_body) - length(replace(v_body, p_decl_anchor, ''))) / length(p_decl_anchor);
  if v_n <> 1 then raise exception 'f_a5 pr2 derive %: decl anchor occurs % time(s), expected 1', p_sig, v_n using errcode='CLR10'; end if;
  v_n := (length(v_body) - length(replace(v_body, 'c.actor', ''))) / length('c.actor');
  if v_n <> p_expect_c_actor then raise exception 'f_a5 pr2 derive %: c.actor occurs % time(s), rig measured %', p_sig, v_n, p_expect_c_actor using errcode='CLR10'; end if;
  v_n := (length(v_body) - length(replace(v_body, 'c.firm', ''))) / length('c.firm');
  if v_n <> p_expect_c_firm then raise exception 'f_a5 pr2 derive %: c.firm occurs % time(s), rig measured %', p_sig, v_n, p_expect_c_firm using errcode='CLR10'; end if;

  v_new := replace(v_body, p_ctx_anchor, '');
  v_new := replace(v_new, p_decl_anchor, '');
  v_new := replace(v_new, 'c.actor', 'p_actor');
  v_new := replace(v_new, 'c.firm', 'p_firm');

  v_check := replace(replace(v_new, 'p_actor', 'c.actor'), 'p_firm', 'c.firm');
  v_expect := replace(replace(v_body, p_ctx_anchor, ''), p_decl_anchor, '');
  if v_check is distinct from v_expect then
    raise exception 'f_a5 pr2 derive %: the reversal does not reconstruct the original body -- refusing to move it', p_sig using errcode='CLR10';
  end if;
  if position('_human_ctx' in v_new) > 0 then
    raise exception 'f_a5 pr2 derive %: residual _human_ctx reference survives the derivation', p_sig using errcode='CLR10';
  end if;

  perform pg_temp._fa5b_assert_no_wiki('derive ' || p_sig, v_new);
  return format(
    'create function clara.%I(p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, %s%s) returns %s'
    || E' language plpgsql security definer set search_path = clara, pg_temp as $fa5b$%s$fa5b$',
    p_core_name, v_args, p_extra_args, v_ret, v_new);
end
$ext$;

-- ============================ SECTION 2 -- THREE STRAIGHT DERIVATIONS ===========================
-- reject / supersede / mint_snapshot each carry the exact PR-1 anchor SHAPE (a live
-- "c := clara._human_ctx(...)" context line and a "clara._audit(c.firm, c.actor, null, null,
-- '<verb>', ..." call) -- rig-measured present and unique below -- so each gets the same
-- byte-preserving derivation, then ONE fixup pass that (i) renames the verb-key strings this
-- lane's _reserve_op/_finish_op/_audit calls use (header note 2), (ii) routes the audit call's
-- obo/wake_kind slots (hardcoded null, null on the human lane) to p_obo/p_wake_kind, and (iii)
-- adds the clara._report_agent_receipt call design SS3.4 requires (header note 1).

-- --- #2a  clara.reject_metric_definition -> clara._agent_reject_metric_definition_core ----------
do $x2a$
declare d text;
begin
  d := pg_temp._fa5b_derive('clara.reject_metric_definition(uuid,text,text)',
        '_agent_reject_metric_definition_core',
        E'c:=clara._human_ctx(clara.role_rank(\'owner\'));', 'c record;', 1, 4, ', p_agent jsonb default null');
  execute d;
  raise notice 'f_a5 pr2a #2a: clara._agent_reject_metric_definition_core derived and reversal-proven';
end
$x2a$;

do $x2a_fix$
declare d text; v_n int;
  decl_from text := 'declare v record;z jsonb;begin';
  decl_to   text := 'declare v record;z jsonb;v_subject_author text;begin';
  key_from  text := '''reject_metric_definition''';
  key_to    text := '''agent_reject_metric_definition''';
  aud_from  text := 'perform clara._audit(p_firm,p_actor,null,null,''agent_reject_metric_definition'',null,jsonb_build_object(''definition_version_id'',v.id,''op_key'',p_op_key));';
  aud_to    text := 'v_subject_author:=case when v.proposed_by is not distinct from clara.agent_user_id() then ''agent'' else ''human'' end;'
    || E'\n  perform clara._report_agent_receipt(p_firm,null,null,v.id,''reject_definition'',''done'',null,null,p_obo,coalesce(p_wake_kind,''interactive''),p_agent,p_op_key);'
    || E'\n  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,''agent_reject_metric_definition'',null,jsonb_build_object(''definition_version_id'',v.id,''op_key'',p_op_key,''subject_author'',v_subject_author));';
begin
  d := pg_get_functiondef('clara._agent_reject_metric_definition_core(uuid,uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure);
  v_n := (length(d) - length(replace(d, decl_from, ''))) / length(decl_from);
  if v_n <> 1 then raise exception 'f_a5 pr2a #2a-fix: decl anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  v_n := (length(d) - length(replace(d, key_from, ''))) / length(key_from);
  if v_n <> 3 then raise exception 'f_a5 pr2a #2a-fix: verb-key anchor occurs % time(s), expected 3', v_n using errcode='CLR10'; end if;
  d := replace(d, decl_from, decl_to);
  d := replace(d, key_from, key_to);
  v_n := (length(d) - length(replace(d, aud_from, ''))) / length(aud_from);
  if v_n <> 1 then raise exception 'f_a5 pr2a #2a-fix: audit anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, aud_from, aud_to);
  perform pg_temp._fa5b_assert_no_wiki('#2a-fix', d);
  execute d;
  raise notice 'f_a5 pr2a #2a-fix: verb-key renamed (agent_reject_metric_definition), receipt+subject_author added';
end
$x2a_fix$;
revoke all on function clara._agent_reject_metric_definition_core(uuid,uuid,uuid,text,uuid,text,text,jsonb) from public;

-- --- #2b  clara.supersede_metric_definition -> clara._agent_supersede_metric_definition_core ----
do $x2b$
declare d text;
begin
  d := pg_temp._fa5b_derive('clara.supersede_metric_definition(uuid,uuid,text,text)',
        '_agent_supersede_metric_definition_core',
        E'c:=clara._human_ctx(clara.role_rank(\'owner\'));', 'c record;', 1, 7, ', p_agent jsonb default null');
  execute d;
  raise notice 'f_a5 pr2a #2b: clara._agent_supersede_metric_definition_core derived and reversal-proven';
end
$x2b$;

do $x2b_fix$
declare d text; v_n int;
  key_from text := '''supersede_metric_definition''';
  key_to   text := '''agent_supersede_metric_definition''';
  aud_from text := 'perform clara._audit(p_firm,p_actor,null,null,''agent_supersede_metric_definition'',null,jsonb_build_object(''definition_version_id'',v.id,''successor_version_id'',s.id,''op_key'',p_op_key));';
  aud_to   text := 'perform clara._report_agent_receipt(p_firm,null,null,v.id,''supersede_definition'',''done'',null,null,p_obo,coalesce(p_wake_kind,''interactive''),p_agent,p_op_key);'
    || E'\n  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,''agent_supersede_metric_definition'',null,jsonb_build_object(''definition_version_id'',v.id,''successor_version_id'',s.id,''op_key'',p_op_key));';
begin
  d := pg_get_functiondef('clara._agent_supersede_metric_definition_core(uuid,uuid,uuid,text,uuid,uuid,text,text,jsonb)'::regprocedure);
  v_n := (length(d) - length(replace(d, key_from, ''))) / length(key_from);
  if v_n <> 3 then raise exception 'f_a5 pr2a #2b-fix: verb-key anchor occurs % time(s), expected 3', v_n using errcode='CLR10'; end if;
  d := replace(d, key_from, key_to);
  v_n := (length(d) - length(replace(d, aud_from, ''))) / length(aud_from);
  if v_n <> 1 then raise exception 'f_a5 pr2a #2b-fix: audit anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, aud_from, aud_to);
  perform pg_temp._fa5b_assert_no_wiki('#2b-fix', d);
  execute d;
  raise notice 'f_a5 pr2a #2b-fix: verb-key renamed (agent_supersede_metric_definition), receipt added';
end
$x2b_fix$;
revoke all on function clara._agent_supersede_metric_definition_core(uuid,uuid,uuid,text,uuid,uuid,text,text,jsonb) from public;

-- --- #2c  clara.mint_metric_input_snapshot_v1 -> clara._agent_mint_metric_input_snapshot_core ---
-- ALSO re-points the producer-version resolution to an APPENDED row this file registers below,
-- never the human closure's own row -- mint_metric_input_snapshot_v1 is a frozen metric-input-
-- producer closure member (S8) and this lane never calls it (same CLR04 reasoning as
-- evaluate_metric_v1, S2): calling it would raise before doing any work, since its first statement
-- is _human_ctx.
do $x2c$
declare d text;
begin
  d := pg_temp._fa5b_derive('clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)',
        '_agent_mint_metric_input_snapshot_core',
        E'c:=clara._human_ctx(clara.role_rank(\'bookkeeper\'));\n  ', 'c record; ', 2, 13, ', p_agent jsonb default null');
  execute d;
  raise notice 'f_a5 pr2a #2c: clara._agent_mint_metric_input_snapshot_core derived and reversal-proven';
end
$x2c$;

do $x2c_fix$
declare d text; v_n int;
  prod_from text := E'producer_name=\'metric_input_snapshot\' and version=1';
  prod_to   text := E'producer_name=\'metric_input_snapshot_agent\' and version=1';
  key_from  text := '''mint_metric_input_snapshot_v1''';
  key_to    text := '''agent_mint_metric_input_snapshot''';
  aud_from  text := 'perform clara._audit(p_firm,p_actor,null,null,''agent_mint_metric_input_snapshot'',null,jsonb_build_object(''snapshot_id'',sid,''op_key'',p_op_key));';
  aud_to    text := 'perform clara._report_agent_receipt(p_firm,p_client,null,null,''mint_snapshot'',''done'',null,null,p_obo,coalesce(p_wake_kind,''interactive''),p_agent,p_op_key);'
    || E'\n  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,''agent_mint_metric_input_snapshot'',null,jsonb_build_object(''snapshot_id'',sid,''op_key'',p_op_key));';
begin
  d := pg_get_functiondef('clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb)'::regprocedure);
  v_n := (length(d) - length(replace(d, prod_from, ''))) / length(prod_from);
  if v_n <> 1 then raise exception 'f_a5 pr2a #2c-fix: producer anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, prod_from, prod_to);
  v_n := (length(d) - length(replace(d, key_from, ''))) / length(key_from);
  if v_n <> 3 then raise exception 'f_a5 pr2a #2c-fix: verb-key anchor occurs % time(s), expected 3', v_n using errcode='CLR10'; end if;
  d := replace(d, key_from, key_to);
  v_n := (length(d) - length(replace(d, aud_from, ''))) / length(aud_from);
  if v_n <> 1 then raise exception 'f_a5 pr2a #2c-fix: audit anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, aud_from, aud_to);
  perform pg_temp._fa5b_assert_no_wiki('#2c-fix', d);
  execute d;
  raise notice 'f_a5 pr2a #2c-fix: verb-key renamed (agent_mint_metric_input_snapshot), producer row re-pointed to metric_input_snapshot_agent v1, receipt added';
end
$x2c_fix$;
revoke all on function clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb) from public;

-- --- THE APPENDED metric_input_producer_versions ROW -- 'metric_input_snapshot_agent' v1 --------
-- clara.metric_input_producer_versions carries NO "deployed" column (rig-measured, and
-- migrate.mjs's FREEZE_GUARDS table: protectedRows is 'true' for this closure family, unlike the
-- evaluator registry's 'deployed is true' -- every row is checked, always, from the moment it is
-- inserted). There is no ceremony gate to wait for; the row is registered NOW, mirroring PR-1
-- section 8's evaluate_fs_pack_agent idiom (roster the core's body and re-pin the shared internals
-- it reaches) but with no undeployed-birth step, because this family has none. The roster is the
-- TRANSITIVE closure this core actually calls -- never _human_ctx/role_rank/jwt_sub/jwt_firm/
-- actor_role_rank, which the human producer's own roster carries and this lane never reaches.
do $x2c_producer$
declare v_id uuid;
begin
  with roster(o, s) as (values
    (0, 'clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb)'),
    (1, 'clara._metric_input_dataset_v1(uuid,uuid,uuid[])'),
    (2, 'clara._reserve_op(uuid,text,text,bytea)'),
    (3, 'clara._hash(jsonb)'),
    (4, 'clara._finish_op(uuid,text,text,jsonb)'),
    (5, 'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
    (6, 'clara._report_agent_receipt(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,text,jsonb,text,jsonb,text)'),
    (7, 'clara.verify_metric_input_snapshot(uuid)'),
    (8, 'clara._tf_metric_input_snapshot_reconstruct()'),
    (9, 'clara._tf_metric_document_binding()'),
    (10, 'clara._active_document_filing(uuid,text,uuid,boolean)')
  ), hashes as (
    select o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')) h from roster
  ), closure as (
    select clara._hash(to_jsonb(string_agg(encode(h,'hex'),'' order by o))) c from hashes
  ), newrow as (
    insert into clara.metric_input_producer_versions(firm_id, producer_name, version,
        entrypoint_signature, body_sha256, fact_schema)
    select null, 'metric_input_snapshot_agent', 1,
      'clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb)',
      c, 'clara.metric-input/v1' from closure
    returning id
  )
  insert into clara.metric_input_producer_version_members(producer_version_id, firm_id, ordinal, member_signature, body_sha256)
  select n.id, null, x.o, x.s, x.h from newrow n cross join hashes x;

  perform clara.verify_metric_input_producer_freeze();
  select id into v_id from clara.metric_input_producer_versions
   where firm_id is null and producer_name='metric_input_snapshot_agent' and version=1;
  if v_id is null then raise exception 'f_a5 pr2a: the appended producer row did not register' using errcode='CLR10'; end if;
  raise notice 'f_a5 pr2a: metric_input_snapshot_agent v1 registered with 11 members; verify_metric_input_producer_freeze() green beside metric_input_snapshot v1';
end
$x2c_producer$;

reset role;

-- ============================ TAIL ===============================================================
do $tail$
declare v_sig text; v_role text;
  v_cores text[] := array[
    'clara._agent_reject_metric_definition_core(uuid,uuid,uuid,text,uuid,text,text,jsonb)',
    'clara._agent_supersede_metric_definition_core(uuid,uuid,uuid,text,uuid,uuid,text,text,jsonb)',
    'clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb)'];
begin
  if current_user <> (select v from _fa5pr2a_pre where k = 'deploy_user')
     or current_role <> (select v from _fa5pr2a_pre where k = 'deploy_role') then
    raise exception 'f_a5 pr2a tail: deploy principal was not restored (user %, role %)', current_user, current_role using errcode = 'CLR10';
  end if;
  foreach v_sig in array v_cores loop
    if not exists (select 1 from pg_proc f where f.oid = v_sig::regprocedure and f.prosecdef
        and f.proconfig @> array['search_path=clara, pg_temp']
        and pg_get_userbyid(f.proowner) = 'clara_fn_owner') then
      raise exception 'f_a5 pr2a tail: core posture wrong for %', v_sig using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_runtime_login','clara_wake_interactive','clara_wake_proactive',
        'clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'f_a5 pr2a tail: % executes the ungranted core %', v_role, v_sig using errcode = 'CLR10';
      end if;
    end loop;
  end loop;
  perform clara.verify_metric_input_producer_freeze();
  raise notice 'f_a5 pr2a tail: OK -- 3 cores minted, definer/search_path-pinned/owner clara_fn_owner, reachable by NO application role (both non-inheriting logins incl.); metric_input_snapshot_agent v1 verifies';
end
$tail$;
