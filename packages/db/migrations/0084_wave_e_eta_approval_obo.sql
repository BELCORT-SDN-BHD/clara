-- 0084_wave_e_eta_approval_obo.sql -- Wave E lane eta, the B4 follow-up: maker/checker
-- measured against the human who DIRECTED an agent-authored draft.
-- Number claimed at merge prep, above zeta's 0079-0083 frontier. Applies after eta's 0077/0078.
--
-- WHAT THIS FIXES. Lane eta lets the agent SAVE a metric definition draft, and that draft records
-- proposed_by = clara.agent_user_id(). clara.approve_metric_definition's sole-eligible arm refuses
-- when the single eligible human is not the proposer, so in a ONE-OWNER firm an agent-authored
-- draft had NO approval path at all: every attempt raised sole_eligible_proposer_mismatch. It was
-- fail-closed -- nothing wrong became approvable, the drafts merely waited -- but it made a
-- feature eta ships unusable for exactly the firms most likely to use it.
--
-- WHY THE OBVIOUS FIX IS THE WRONG ONE. "Treat an agent proposer as never-a-conflict" unblocks the
-- deadlock and opens a worse hole: a human directs the agent to draft, then approves it. That is
-- self-approval wearing a costume, and it would pass in a MULTI-admin firm too, where the
-- distinct-checker rule is supposed to bite hardest. The self-approval wall exists to stop a human
-- approving their own work; an agent draft is still someone's work.
--
-- THE RULE, AS RULED AND THEN AMENDED. The effective MAKER of an agent proposal is the human who
-- directed the wake, which proposal_evidence.on_behalf_of already records. Maker/checker is measured
-- against THAT human. FOUR arms; the human paths are unchanged in effect:
--   ARM 0  ORPHAN draft -- an agent draft nobody directed, an agent draft whose director is no
--          longer an active bookkeeper+ of the firm, or a draft with NO PROPOSER AT ALL
--                                            -> approvable ONLY by ADOPTING it with the attestation
--   ARM 1  eligible>=2 and approver = maker  -> distinct_checker (NEW for agent drafts: the hole)
--   ARM 2  eligible=1, HUMAN proposer <> approver -> sole_eligible_proposer_mismatch (unchanged)
--   ARM 3  eligible=1 and approver = maker   -> the existing attestation is required
--   FALL-THROUGH (no arm fires)              -> a GENUINE INDEPENDENT CHECK, approved with NO
--          attestation. Named because the four arms above are all refusals and a reader can take
--          the list for the whole rule: the commonest lawful shape is precisely the one that
--          matches none of them -- an agent draft whose STANDING director is somebody other than
--          the approver. That is maker/checker satisfied by two different accountable humans, and
--          it costs nothing extra. It is also true at eligible=1, where ARM 2 does not reach an
--          agent proposal.
--
-- WHY ARM 0 EXISTS, in the words of the two defects it closes. FIRST, three-valued logic: the first
-- cut compared v_maker directly in every arm, so a NULL maker made every predicate NULL, NO arm
-- fired, and the draft approved with neither a checker nor an attestation -- at eligible=1 a direct
-- reversal of delta. A branch meant to be permissive had become no branch at all. SECOND, standing:
-- mint_wake_credential validates the director at MINT time, but a draft outlives that, and a
-- director who has since left the firm is precisely the unaccountable-proposer case delta's ARM 2
-- refuses for humans. ARM 0 answers both the same way, and deliberately does NOT refuse outright --
-- that would restore the one-owner deadlock this file exists to remove. The approver may proceed by
-- ADOPTING the draft as their own work, which is the accountability instrument delta already uses
-- for a sole-eligible self-approval, reusing its exact refusal token rather than minting a new
-- vocabulary. approval_evidence records which arm ran (approval_arm) and whether the maker was
-- still standing (maker_active_at_approval), so the choice is auditable after the fact.
--
-- D1 WRITE-QUIESCE OBLIGATION, BINDING AT DEPLOY. This file REPLACES the body of a deployed,
-- audited writer. PostgreSQL runs an in-flight PL/pgSQL call to completion on the body it STARTED
-- with, so an approval spanning this migration would silently run the OLD arms and skip the new
-- ones. The ceremony applies this inside a write-quiesce window (packages/db/README.md, "Deploy
-- contract"). The window is short and the surface is one function, but it is not optional.
--
-- THE BODY IS 0059's, VERBATIM, EXCEPT FOR FOUR NAMED REGIONS: the declare (adds v_maker), the
-- eligibility block, the attestation column's guard, and approval_evidence (self_approved now
-- keys on the maker, and the maker plus its source are recorded). Every other clause -- the
-- op-key reservation, the hash check, the policy effectivity checks, the account-set binding and
-- freeze verification, the 512-member bound -- is carried across unchanged, and the prestate
-- below pins the body it is replacing so a drifted 0059 refuses rather than being overwritten.
--
-- The timeout is precautionary; the single statement here is a catalog write.
set local statement_timeout = '5min';

create temp table _b4_pre(k text primary key, v text not null) on commit drop;
insert into _b4_pre values ('deploy_user', current_user), ('deploy_role', current_role);

do $pre$
declare n text; v_src text; v_grantees text[];
begin
  foreach n in array array[
    'clara.approve_metric_definition(uuid,bytea,text,text,text)',
    'clara.agent_user_id()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception 'b4 prestate: required function absent: %', n using errcode = 'CLR10';
    end if;
  end loop;
  -- THE BODY WE ARE REPLACING, PINNED EXACTLY. An earlier cut claimed to "pin the body" while only
  -- probing four tokens, on the theory that a whole-definition checksum renders inconsistently. The
  -- repo's own practice refutes that: 0060:480 and delta-catalog-phase.mjs both pin THIS function's
  -- prosrc by sha256 already, and prosrc is the body alone -- no signature, no formatting drift. So
  -- the claim is made true rather than softened: this is delta's reviewed body or nothing proceeds.
  select prosrc into v_src from pg_proc where oid = 'clara.approve_metric_definition(uuid,bytea,text,text,text)'::regprocedure;
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <> '494c5a92cb1114a1b89310ea44f6830172c8a25d9e23d722f94b58c3e94a1028' then
    raise exception 'b4 prestate: approve_metric_definition is not delta''s reviewed body (prosrc sha256 %) -- refusing to replace an unrecognised body',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  -- The four decision tokens stay probed as well: the hash says WHICH body, these say what it must
  -- still contain, and the tail re-reads them after the replace to prove none was dropped.
  if position('sole_eligible_proposer_mismatch' in v_src) = 0
     or position('self_approval_attestation_missing' in v_src) = 0
     or position('distinct_checker' in v_src) = 0
     or position('no_eligible_human' in v_src) = 0 then
    raise exception 'b4 prestate: the approval body does not carry delta''s four decision tokens' using errcode = 'CLR10';
  end if;
  if position('v_maker' in v_src) <> 0 then
    raise exception 'b4 partial birth: the approval body already carries the maker rule' using errcode = 'CLR10';
  end if;
  insert into _b4_pre values ('old_prosrc_sha256', encode(sha256(convert_to(v_src, 'UTF8')), 'hex'));
  -- The grant surface must be exactly what delta left, and this file must not move it.
  select coalesce(array_agg(g order by g), '{}') into v_grantees from (
    select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'clara.approve_metric_definition(uuid,bytea,text,text,text)'::regprocedure
       and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner) q;
  if v_grantees is distinct from array['clara_authenticated'] then
    raise exception 'b4 prestate: approve_metric_definition grantees are %, expected exactly {clara_authenticated}', v_grantees using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

create or replace function clara.approve_metric_definition(p_definition_version_id uuid,p_expected_formula_sha256 bytea,p_reason text,p_self_approval_attestation text,p_op_key text)returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$declare c record;v record;z jsonb;validated jsonb;eligible int;bound_set record;measured_count int;v_maker uuid;v_maker_active boolean;v_agent boolean;v_orphan boolean;v_self boolean;v_attest_required boolean;v_arm text;begin c:=clara._human_ctx(clara.role_rank('admin'));perform 1 from clara.firms where id=c.firm for update;select x.* into v from clara.metric_definition_versions x where x.id=p_definition_version_id and x.firm_id=c.firm for update;if not found then raise exception 'definition version not found in your firm'using errcode='CLR11';end if;z:=clara._reserve_op(c.firm,'approve_metric_definition',p_op_key,clara._hash(jsonb_build_object('version',v.id,'hash',encode(p_expected_formula_sha256,'hex'),'reason',p_reason,'attestation',p_self_approval_attestation)));if z is not null then return z;end if;if v.state<>'draft'or v.formula_sha256 is distinct from p_expected_formula_sha256 then raise exception 'definition revision/hash mismatch'using errcode='CLR10',detail='{"reason":"formula_hash_mismatch"}';end if;validated:=clara.validate_metric_ast_v1(v.ast);if not exists(select 1 from clara.edge_policy_sets e where e.id=v.edge_policy_set_id and e.policy_set_key=v.ast->>'edge_policy_set'and e.firm_id is null and e.effective_from<=v.applies_from and((v.applies_to is null and e.effective_to is null)or(v.applies_to is not null and(e.effective_to is null or e.effective_to>=v.applies_to))))then raise exception 'edge policy is not effective for the definition'using errcode='CLR10',detail='{"reason":"scope_mismatch","fix":"bind the exact registered edge-policy identity whose effective window covers applies_from through applies_to"}';end if;if not exists(select 1 from clara.averaging_policy_versions a where a.id=v.averaging_policy_id and a.policy_key='avg_month_end_v1'and a.firm_id is null and a.implemented and a.effective_from<=v.applies_from and((v.applies_to is null and a.effective_to is null)or(v.applies_to is not null and(a.effective_to is null or a.effective_to>=v.applies_to))))then raise exception 'averaging policy is not effective for the definition'using errcode='CLR10',detail='{"reason":"scope_mismatch","fix":"bind the exact implemented avg_month_end_v1 identity whose effective window covers applies_from through applies_to"}';end if;if v.unit_key is distinct from validated->>'unit'or v.temporality_key is distinct from validated->>'temp'or v.result_scale is distinct from(validated->>'result_scale')::smallint then raise exception 'stored metric declarations do not match AST declarations'using errcode='CLR10',detail='{"reason":"declaration_mismatch","fix":"make stored unit, temporality and scale match the validated AST"}';end if;if exists(select 1 from(select distinct n#>>'{set,key}'set_key from jsonb_path_query(v.ast,'$.** ? (@.node == "measure")')n)leaf where(select count(*)from clara.account_sets s join clara.account_set_versions av on av.account_set_id=s.id where s.client_id=(v.proposal_evidence->>'client_id')::uuid and s.firm_id=c.firm and s.set_key=leaf.set_key and av.state in('published','superseded')and av.effective_from<=v.applies_from and((v.applies_to is null and av.effective_to is null)or(v.applies_to is not null and(av.effective_to is null or av.effective_to>=v.applies_to))))<>1)then raise exception 'account set binding is absent or ambiguous for approval'using errcode='CLR10',detail='{"reason":"scope_mismatch","fix":"publish exactly one frozen account-set version whose effective window covers the full metric definition window for every measure leaf"}';end if;for bound_set in select distinct n#>>'{set,key}'set_key,av.id version_id from jsonb_path_query(v.ast,'$.** ? (@.node == "measure")')n join clara.account_sets s on s.client_id=(v.proposal_evidence->>'client_id')::uuid and s.firm_id=c.firm and s.set_key=n#>>'{set,key}'join clara.account_set_versions av on av.account_set_id=s.id and av.state in('published','superseded')and av.effective_from<=v.applies_from and((v.applies_to is null and av.effective_to is null)or(v.applies_to is not null and(av.effective_to is null or av.effective_to>=v.applies_to)))loop perform clara.verify_account_set_version_freeze(bound_set.version_id);select count(*)::int into measured_count from clara.account_set_version_members where account_set_version_id=bound_set.version_id;if measured_count>512 then raise exception 'account set expansion exceeds metric leaf bound'using errcode='CLR10',detail=jsonb_build_object('reason','cost_exceeded','class','account_set_expansion','limit',512,'measured_count',measured_count,'set_key',bound_set.set_key,'version_id',bound_set.version_id,'fix','narrow the account-set selector and mint a new version with at most 512 frozen members')::text;end if;end loop;select count(*) into eligible from clara.firm_memberships m join clara.users u on u.id=m.user_id where m.firm_id=c.firm and m.status='active'and m.role in('admin','owner')and not u.is_agent;
  -- THE EFFECTIVE MAKER. For a human proposal it is the proposer, exactly as before. For an AGENT
  -- proposal the proposer is clara.agent_user_id(), which is nobody's accountability -- the human who
  -- DIRECTED the wake is recorded in proposal_evidence.on_behalf_of, and that is who maker/checker has
  -- to be measured against.
  -- IS NOT DISTINCT FROM, not '=': a NULL proposed_by would make '=' yield NULL, and a NULL v_agent
  -- propagates into v_orphan and re-opens the very three-valued hole ARM 0 exists to close. The
  -- column is NOT NULL today so this is unreachable -- which is exactly when a hardening token is
  -- cheap, and exactly when the next backfill would find it.
  v_agent := v.proposed_by is not distinct from clara.agent_user_id();
  v_maker := case when v_agent then nullif(v.proposal_evidence->>'on_behalf_of','')::uuid else v.proposed_by end;
  -- THE MAKER'S STANDING, RE-READ AT APPROVAL rather than trusted from mint time. The estate's own
  -- definition, character for character (0004:695-698 / 0011:1171-1175): an active bookkeeper+ of
  -- this firm. clara.mint_wake_credential validated it when the credential was issued; a draft can
  -- outlive that, and a maker who has since left is exactly the accountability gap delta's
  -- sole-eligible arm exists to refuse.
  v_maker_active := v_maker is not null and exists(select 1 from clara.firm_memberships m
    where m.user_id=v_maker and m.firm_id=c.firm and m.status='active'
      and clara.role_rank(m.role)>=clara.role_rank('bookkeeper'));
  -- AN ORPHAN DRAFT: nobody accountable stands behind it. Three shapes reach here -- an agent draft
  -- nobody directed, an agent draft whose director has left, and a draft with NO PROPOSER AT ALL.
  -- All are NULL-SAFE booleans: an earlier cut compared v_maker directly in every arm, and a NULL
  -- maker made every predicate NULL, so NO arm fired and the draft approved with neither a checker
  -- nor an attestation. Three-valued logic turned a permissive branch into no branch at all.
  --
  -- proposed_by is declared uuid REFERENCES clara.users(id) with NO not-null (0058), so a row with
  -- no maker is REPRESENTABLE though no audited door mints one (propose_ writes the human actor,
  -- and the wake core
  -- writes clara.agent_user_id()). It belongs here for two reasons. "Independent check" presupposes
  -- somebody to be independent OF, and there is nobody. And delta was ALREADY stricter: its
  -- eligible=1 arm read "proposed_by <> actor OR blank attestation", which with a NULL proposer is
  -- "NULL OR true" -> TRUE -> refused. Routing this to a genuine check would have been a silent
  -- LOOSENING of delta smuggled in behind a null-hardening token.
  --
  -- A departed HUMAN proposer is deliberately NOT an orphan: v_maker is non-null and not an agent,
  -- so it falls to ARM 2 and is REFUSED outright, which is stricter than adoption and is delta's
  -- existing behaviour for that shape. This predicate only ever adds a door where delta had none.
  v_orphan := (v_agent or v_maker is null) and not v_maker_active;
  v_self := v_maker is not null and v_maker=c.actor;
  v_attest_required := v_orphan or (eligible=1 and v_self);
  if eligible=0 then raise exception 'metric definition has no eligible human approver'using errcode='CLR05',detail='{"reason":"no_eligible_human"}';
  -- ARM 0. ADOPTION. An orphan agent draft may still be approved, but only by a human who ATTESTS --
  -- taking it on as their own work. That is the same instrument delta already uses for a sole-eligible
  -- self-approval, and the same token, so no new refusal vocabulary is minted. Without this the draft
  -- would sail through unchecked; with a blanket refusal the one-owner deadlock simply returns.
  elsif v_orphan and nullif(btrim(p_self_approval_attestation),'')is null then raise exception 'an agent-authored draft with no accountable director may be approved only by adopting it with an attestation'using errcode='CLR05',detail='{"reason":"self_approval_attestation_missing"}';
  -- ARM 1. Unchanged for humans; NEW for agents, and this is the hole the naive reading leaves open:
  -- a human directs the agent to draft, then approves it. The agent is not the maker, the director is.
  elsif eligible>=2 and v_self then raise exception 'metric definition needs a distinct approver'using errcode='CLR05',detail='{"reason":"distinct_checker"}';
  -- ARM 2. Delta's sole-eligible HUMAN-proposal rule, unchanged. Agent proposals never reach it, and
  -- there are THREE onward routes, not two: an unaccountable director was already stopped at ARM 0;
  -- a director who IS the approver falls to ARM 3; and a STANDING director who is somebody else
  -- matches no arm at all and approves as a genuine independent check. That last route is the
  -- lawful common case, so it is named rather than left as the gap between refusals.
  elsif eligible=1 and not v_agent and v.proposed_by<>c.actor then raise exception 'the sole eligible human may approve only their own proposal with attestation'using errcode='CLR05',detail='{"reason":"sole_eligible_proposer_mismatch"}';
  -- ARM 3. Self-approval, including BY PROXY through the agent, still costs an explicit attestation.
  elsif eligible=1 and v_self and nullif(btrim(p_self_approval_attestation),'')is null then raise exception 'the sole eligible human may approve only their own proposal with attestation'using errcode='CLR05',detail='{"reason":"self_approval_attestation_missing"}';
  end if;
  v_arm := case when v_orphan then 'adoption' when v_self then 'self_approval' else 'independent_check' end;update clara.metric_definition_versions set state='firm_approved',approved_by=c.actor,approved_at=statement_timestamp(),approval_reason=p_reason,self_approval_attestation=case when v_attest_required then p_self_approval_attestation end,approved_formula_sha256=formula_sha256,approval_evidence=jsonb_build_object('kind','human_approval','version',1,'reason',p_reason,'eligible_human_count',eligible,'self_approved',v_self,'effective_maker',v_maker,'maker_source',case when v_agent then 'on_behalf_of' else 'proposer' end,'maker_active_at_approval',v_maker_active,'approval_arm',v_arm)where id=v.id;perform clara._audit(c.firm,c.actor,null,null,'approve_metric_definition',null,jsonb_build_object('definition_version_id',v.id,'op_key',p_op_key));return clara._finish_op(c.firm,'approve_metric_definition',p_op_key,jsonb_build_object('definition_version_id',v.id,'state','firm_approved'));end$$;

reset role;

do $tail$
declare v_src text; v_grantees text[]; v_conf text[];
begin
  if current_user <> (select v from _b4_pre where k = 'deploy_user')
     or current_role <> (select v from _b4_pre where k = 'deploy_role') then
    raise exception 'b4 tail: deploy principal was not restored (user %, role %)', current_user, current_role using errcode = 'CLR10';
  end if;
  select prosrc, proconfig into v_src, v_conf from pg_proc
   where oid = 'clara.approve_metric_definition(uuid,bytea,text,text,text)'::regprocedure;
  -- The body actually MOVED, and moved to the rule we meant.
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') = (select v from _b4_pre where k = 'old_prosrc_sha256') then
    raise exception 'b4 tail: the approval body is byte-identical to the one measured before the replace' using errcode = 'CLR10';
  end if;
  if position('v_maker' in v_src) = 0 or position('on_behalf_of' in v_src) = 0 then
    raise exception 'b4 tail: the replaced body does not carry the maker rule' using errcode = 'CLR10';
  end if;
  -- And every arm delta relied on is still THERE. A fix that silently dropped an arm would
  -- otherwise read as success: three of these tokens are refusals this lane does not own.
  if position('sole_eligible_proposer_mismatch' in v_src) = 0
     or position('self_approval_attestation_missing' in v_src) = 0
     or position('distinct_checker' in v_src) = 0
     or position('no_eligible_human' in v_src) = 0 then
    raise exception 'b4 tail: the replacement dropped one of delta''s four decision tokens' using errcode = 'CLR10';
  end if;
  -- Posture and grants unmoved: definer, pinned search_path, clara_authenticated and nobody else.
  if not exists(select 1 from pg_proc where oid = 'clara.approve_metric_definition(uuid,bytea,text,text,text)'::regprocedure
      and prosecdef and pg_get_userbyid(proowner) = 'clara_fn_owner') then
    raise exception 'b4 tail: the replaced function is not a clara_fn_owner SECURITY DEFINER' using errcode = 'CLR10';
  end if;
  if v_conf is null or not (v_conf @> array['search_path=clara, pg_temp'] or v_conf @> array['search_path=clara,pg_temp']) then
    raise exception 'b4 tail: the replaced function lost its pinned search_path (proconfig %)', v_conf using errcode = 'CLR10';
  end if;
  select coalesce(array_agg(g order by g), '{}') into v_grantees from (
    select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'clara.approve_metric_definition(uuid,bytea,text,text,text)'::regprocedure
       and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner) q;
  if v_grantees is distinct from array['clara_authenticated'] then
    raise exception 'b4 tail: approve_metric_definition grantees moved to %', v_grantees using errcode = 'CLR10';
  end if;
  raise notice 'b4 OK: approve_metric_definition now measures maker/checker against the DIRECTING human (proposal_evidence.on_behalf_of), re-reading that human''s standing at approval rather than trusting mint time. FOUR arms: an orphan draft (no director, or one no longer an active bookkeeper+) is approvable only by ADOPTING it with the attestation; distinct_checker where the approver directed it; delta''s sole-eligible human arm unchanged; the attestation for a sole-eligible self-approval by proxy. All four delta refusal tokens retained and no new vocabulary minted; definer/search_path/grantees unmoved (clara_authenticated only). THE DEADLOCK IS OPENED BY AN ATTESTATION DOOR, NOT BY FRICTIONLESS APPROVAL: the runtime mints on_behalf_of = the initiating human, so a solo owner who directed the draft lands on the self-approval arm and attests -- the same act delta already required of them. The four arms are all REFUSALS; the lawful common shape matches none of them -- an agent draft whose STANDING director is somebody other than the approver falls through to a genuine independent check and needs no attestation at all.';
end $tail$;
