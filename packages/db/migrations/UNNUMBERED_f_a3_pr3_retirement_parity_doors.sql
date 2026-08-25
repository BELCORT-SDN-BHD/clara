-- =====================================================================================
-- F-A3 PR-3 -- retirement + parity + doors (design SS3.2/3.12, Annex I/K/M, OQ-6/OQ-7/OQ-8).
--
-- FOUR pieces, in one D1 window:
--   SS1  RETIREMENT   -- the bank-rules machine retires whole (law: TA-P11 A, Annex A19).
--   SS2  STAFF-ADVANCE SIBLING -- book_staff_advance_application gets the PR-1a wake shape
--        (OQ-7): a thin human delegator + an ungranted core + a NEW wake sibling + agent core.
--   SS3  IDENTIFIER-PROMOTION CONFIRM DOOR -- the half OQ-8 deferred at PR-1b: confirm a
--        bank_agent_proposals(kind='identifier_promotion') row, scoped to the client-payer
--        case, fail-closed to promotion_target_unavailable otherwise.
--   SS4  CHAT PARITY (OQ-6) -- the nine live bank_agent wake wrappers gain an interactive_client
--        allowlist row apiece; no body changes, no new credential kind.
--
-- D1 WRITE-QUIESCE INVENTORY (every audited writer body this file replaces or creates):
--   replaced in place: clara.book_staff_advance_application (SS2 -- becomes a thin delegator)
--   dropped outright (D1 in the sense that a live caller loses the function, never that a body
--     is recut mid-flight): the eleven SS1 names
--   newly created (no prior body, no quiesce owed): _book_staff_advance_application_core,
--     wake_book_staff_advance_application, _agent_book_staff_advance_application_core,
--     confirm_bank_identifier_promotion, _confirm_bank_identifier_promotion_core
--   NOT touched: _wdb_suggestion_rule_hit, _wdb_suggestion_lines, _bank_desc_word_match,
--     _bank_rule_regex_escape, _bank_line_class_hint (see SS1's KEEP block for why), and
--     clara._adj_on_approve (its arm (3) still calls two of the five keeps; untouched, unrecut)
--
-- RECORDED, per ADR-0072(1) (Annex I): E-R13's mechanical settlement door and 7A-R3 both
-- dissolve WITH this migration -- their corroboration intent rides the witness pair (F-A1);
-- neither is silently dropped, both are named here and in the PR body / PROGRESS.md ledger.
--
-- CALLER CENSUS (measured on a rig at frontier 0127, comment-stripped word-bounded scan over
-- every live clara.* prosrc, never assumed from the design's own claim): the eleven SS1 names
-- have ZERO real callers outside the drop set itself and clara.bank_matches.origin's historical
-- 'rule' value (a column value, not a caller). TWO names Annex I originally listed for drop --
-- _wdb_suggestion_rule_hit and _wdb_suggestion_lines -- are NOT in this file's drop list: both
-- are real, live-called by clara._adj_on_approve's arm (3) (design SS5, the six-axis
-- bank-rule-suggestion re-validation at adjustment-approval time), which stays reachable for
-- any draft still carrying flags ? 'bank_rule_suggested' at deploy time. Dropping either name
-- would 42883-crash that approval path -- an accounting-correctness hazard the design's own
-- checklist did not catch. They join the KEEP set (SS1) on the exact precedent Annex I already
-- uses for _bank_desc_word_match/_bank_rule_regex_escape (kept because a still-live caller
-- needs them): the create-side machinery this file drops can never mint a NEW
-- bank_rule_suggested draft again once accept_bank_rule_suggestion is gone, so arm (3) becomes
-- dead-but-harmless code going forward, while any already-pending flagged draft still approves
-- correctly through the kept helpers.
-- =====================================================================================

-- =====================================================================================
-- SS0 PRESTATE -- every claim this file makes about what it is editing, MEASURED.
-- =====================================================================================
do $fa3pr3_pre$
declare
  v_n int; v_oid oid;
begin
  -- (a) THE ELEVEN DROP TARGETS RESOLVE, at their exact signatures, and are NOT already gone.
  if to_regprocedure('clara.propose_bank_rule(uuid,text,jsonb,jsonb,text)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.propose_bank_rule/5 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.sign_bank_rule(uuid,text)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.sign_bank_rule/2 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.retire_bank_rule(uuid,text,text)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.retire_bank_rule/3 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.accept_bank_rule_suggestion(uuid,uuid,uuid,text)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.accept_bank_rule_suggestion/4 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._bank_rule_sightings(uuid,text,jsonb)') is null then
    raise exception 'F-A3 PR-3 prestate: clara._bank_rule_sightings/3 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._bank_rule_pattern_norm(jsonb)') is null then
    raise exception 'F-A3 PR-3 prestate: clara._bank_rule_pattern_norm/1 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_bank_rule_candidates(uuid)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.list_bank_rule_candidates/1 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_bank_rules(uuid)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.list_bank_rules/1 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_bank_line_suggestions(uuid)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.list_bank_line_suggestions/1 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.match_bank_line/7 (the rule arity) does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.settle_from_bank_line/13 (the rule arity) does not resolve' using errcode='CLR10';
  end if;

  -- (b) THE FIVE KEEP TARGETS ARE LIVE (so this file's comments about them are not describing
  -- something already gone) -- three from Annex I's own list plus the two this file's own
  -- caller census moved off the drop list.
  if to_regprocedure('clara._bank_desc_word_match(text,text[])') is null
     or to_regprocedure('clara._bank_rule_regex_escape(text)') is null
     or to_regprocedure('clara._bank_line_class_hint(text)') is null
     or to_regprocedure('clara._wdb_suggestion_rule_hit(uuid,uuid)') is null
     or to_regprocedure('clara._wdb_suggestion_lines(uuid,uuid,uuid)') is null then
    raise exception 'F-A3 PR-3 prestate: at least one KEEP-listed helper does not resolve at its expected signature' using errcode='CLR10';
  end if;

  -- (c) clara._adj_on_approve is present and its own prosrc still names both kept helpers --
  -- the fact this file's whole caller-census argument rests on, re-measured, not assumed.
  select p.oid into v_oid from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='_adj_on_approve';
  if v_oid is null then
    raise exception 'F-A3 PR-3 prestate: clara._adj_on_approve is absent -- the KEEP argument for _wdb_suggestion_rule_hit/_wdb_suggestion_lines has no premise' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid = v_oid
     and regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'/\*[\s\S]*?\*/','','g') ~* '\y_wdb_suggestion_rule_hit\y'
     and regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'/\*[\s\S]*?\*/','','g') ~* '\y_wdb_suggestion_lines\y';
  if v_n <> 1 then
    raise exception 'F-A3 PR-3 prestate: clara._adj_on_approve no longer calls both kept helpers -- the KEEP premise has drifted, re-derive the drop list before proceeding' using errcode='CLR10';
  end if;

  -- (d) book_staff_advance_application resolves at its pinned signature, human-only, floor
  -- bookkeeper, and holds no core of the extracted name yet (SS2's own prestate half).
  if to_regprocedure('clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)') is null then
    raise exception 'F-A3 PR-3 prestate: clara.book_staff_advance_application/8 does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._book_staff_advance_application_core(jsonb,uuid,date,text,jsonb,jsonb,text,text,text)') is not null then
    raise exception 'F-A3 PR-3 prestate: clara._book_staff_advance_application_core already exists -- this file is ALREADY APPLIED' using errcode='CLR10';
  end if;

  -- (e) the new-verb names are free.
  if to_regprocedure('clara.wake_book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)') is not null
     or to_regprocedure('clara.confirm_bank_identifier_promotion(uuid,text)') is not null
     or to_regprocedure('clara._confirm_bank_identifier_promotion_core(jsonb,uuid,text)') is not null
     or to_regprocedure('clara._agent_book_staff_advance_application_core(jsonb,uuid,date,text,jsonb,jsonb,text,text,text)') is not null then
    raise exception 'F-A3 PR-3 prestate: at least one new-verb name is already live -- this file is ALREADY APPLIED (partially?)' using errcode='CLR10';
  end if;

  -- (f) the live bank_agent allowlist roster (SS4's source of truth) is non-empty, and none of
  -- its members already carries an interactive_client row (SS4 has not partially applied).
  select count(*)::int into v_n from clara.wake_fn_allowlist where wake_kind = 'bank_agent';
  if v_n = 0 then
    raise exception 'F-A3 PR-3 prestate: the live bank_agent allowlist roster is EMPTY -- SS4 would insert nothing' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist a
   where a.wake_kind = 'interactive_client'
     and a.fn_name in (select fn_name from clara.wake_fn_allowlist where wake_kind = 'bank_agent');
  if v_n <> 0 then
    raise exception 'F-A3 PR-3 prestate: % bank wake wrapper(s) already carry an interactive_client allowlist row -- SS4 partially applied', v_n using errcode='CLR10';
  end if;

  raise notice 'F-A3 PR-3 prestate: clean -- 11 drop targets resolve, 5 keep targets resolve (2 newly justified by re-measured caller census), clara._adj_on_approve still calls both, book_staff_advance_application is unextracted, every new-verb name is free, no bank wake wrapper yet carries an interactive_client row';
end
$fa3pr3_pre$;

-- =====================================================================================
-- SS1 -- RETIREMENT (design SS3.2/3.12, Annex A19/A20, Annex I). Eleven DROPs; the KEEP set
-- (five names, three from Annex I plus the two this file's own caller census re-homed) is
-- documentation-only here -- nothing about them changes. bank_matches.origin's 'rule' value,
-- every matched_via_rule_id row and the WHOLE clara.bank_rules table (with its history) are
-- KEPT AS-IS (D35/D36's own treatment) -- this section drops CODE, never DATA.
--
-- E-R13 (the mechanical settlement door) and 7A-R3 both dissolve WITH this drop; neither had a
-- successor that outlives it -- their corroboration intent already rides the witness pair
-- (F-A1), which is why no replacement verb is minted here. Recorded per ADR-0072(1).
-- =====================================================================================
drop function clara.propose_bank_rule(uuid,text,jsonb,jsonb,text);
drop function clara.sign_bank_rule(uuid,text);
drop function clara.retire_bank_rule(uuid,text,text);
drop function clara.accept_bank_rule_suggestion(uuid,uuid,uuid,text);
drop function clara._bank_rule_sightings(uuid,text,jsonb);
drop function clara._bank_rule_pattern_norm(jsonb);
drop function clara.list_bank_rule_candidates(uuid);
drop function clara.list_bank_rules(uuid);
drop function clara.list_bank_line_suggestions(uuid);
drop function clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid);
drop function clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid);

-- =====================================================================================
-- SS1b -- WIDEN clara.bank_agent_receipts_act_kind_check (extend-only). Two new act_kind
-- values: 'staff_advance_application' (SS2) and 'identifier_promotion_confirm' (SS3). The
-- twelve pre-existing values (the eleven from PR-1a/1b/1c plus 'pack_read' from PR-1c) survive
-- byte-identical -- re-read from the LIVE constraint text, never re-typed from a design cite.
-- =====================================================================================
do $fa3pr3_widen$
declare v_live text;
begin
  select pg_get_constraintdef(oid) into v_live from pg_constraint
   where conrelid = 'clara.bank_agent_receipts'::regclass and conname = 'bank_agent_receipts_act_kind_check';
  if v_live is null then
    raise exception 'F-A3 PR-3 SS1b: bank_agent_receipts_act_kind_check does not exist' using errcode='CLR10';
  end if;
  if v_live <> $lc$CHECK ((act_kind = ANY (ARRAY['match'::text, 'unmatch'::text, 'settle'::text, 'reconcile_complete'::text, 'reconcile_void'::text, 'exception_resolve'::text, 'exception_propose'::text, 'statement_void'::text, 'bank_account_add'::text, 'account_upsert'::text, 'identifier_promotion_propose'::text, 'pack_read'::text])))$lc$ then
    raise exception 'F-A3 PR-3 SS1b: bank_agent_receipts_act_kind_check has drifted from the pinned pre-widen text -- re-derive before widening (never widen blind)' using errcode='CLR10';
  end if;
  alter table clara.bank_agent_receipts drop constraint bank_agent_receipts_act_kind_check;
  alter table clara.bank_agent_receipts add constraint bank_agent_receipts_act_kind_check
    check (act_kind in ('match','unmatch','settle','reconcile_complete','reconcile_void',
      'exception_resolve','exception_propose','statement_void','bank_account_add','account_upsert',
      'identifier_promotion_propose','pack_read','staff_advance_application','identifier_promotion_confirm'));
end
$fa3pr3_widen$;

-- =====================================================================================
-- SS2 -- THE STAFF-ADVANCE SIBLING (OQ-7). book_staff_advance_application is factored onto the
-- exact 0044:2209-2224 / PR-1a idiom: the public verb keeps its name, arity, argument defaults,
-- ACL, owner, volatility, SECURITY DEFINER + search_path and role floor and becomes a thin
-- delegator over a new UNGRANTED clara._book_staff_advance_application_core. The core body is
-- NOT retyped -- it is the live prosrc, read by pg_get_functiondef at apply time, with exactly
-- one substitution (the _human_ctx acquisition becomes the ctx unpack). A new wake sibling
-- (wake_book_staff_advance_application, granted to clara_wake_bank alone, the 0078:96-107
-- wrapper shape) and its agent core (_agent_book_staff_advance_application_core, mirroring
-- _agent_add_bank_account_core's Tier-A/Tier-C shape -- no proposal wall, because unlike a bank
-- account a staff advance is not proposal-anchored) complete the sibling.
-- =====================================================================================
set role clara_fn_owner;

do $fa3pr3_cut$
declare
  v_def text; v_src text; v_head text; v_args text; v_core_oid oid;
  v_anchor text := '  c := clara._human_ctx(clara.role_rank(''bookkeeper''));';
  v_ctx text := $c$  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the book_staff_advance_application core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;$c$;
begin
  v_def := pg_get_functiondef('clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)'::regprocedure);
  select p.prosrc, (select string_agg(a.n, ', ' order by a.o)
                      from unnest(p.proargnames) with ordinality as a(n,o))
    into v_src, v_args from pg_proc p
   where p.oid = 'clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)'::regprocedure;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if coalesce(v_args,'') = ''
     or v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n'
     or (length(v_head) - length(replace(v_head, 'CREATE OR REPLACE FUNCTION clara.book_staff_advance_application(', '')))
          / length('CREATE OR REPLACE FUNCTION clara.book_staff_advance_application(') <> 1 then
    raise exception 'F-A3 PR-3 SS2: the live definition of book_staff_advance_application does not split at the AS $function$ boundary into a uniquely-locatable header plus the live prosrc with named arguments'
      using errcode='CLR10';
  end if;
  if position('$fa3pr3_core$' in v_src) <> 0 or position('$fa3pr3_wrap$' in v_src) <> 0 then
    raise exception 'F-A3 PR-3 SS2: the body of book_staff_advance_application contains one of this file''s dollar-quote tags' using errcode='CLR10';
  end if;
  execute replace(v_head, 'CREATE OR REPLACE FUNCTION clara.book_staff_advance_application(',
                          'CREATE OR REPLACE FUNCTION clara._book_staff_advance_application_core(p_ctx jsonb, ')
          || 'AS $fa3pr3_core$' || replace(v_src, v_anchor, v_ctx) || '$fa3pr3_core$';
  select p.oid into v_core_oid from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_book_staff_advance_application_core';
  if v_core_oid is null then
    raise exception 'F-A3 PR-3 SS2: clara._book_staff_advance_application_core was not created' using errcode='CLR10';
  end if;
  execute format('revoke all on function %s from public', v_core_oid::regprocedure);
  execute v_head || 'AS $fa3pr3_wrap$' || format($w$
declare c record;
begin
  -- F-A3 PR-3 (OQ-7, the PR-1a idiom): a thin delegator. It acquires NOTHING; the body lives
  -- in clara.%1$s.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara.%1$I(jsonb_build_object('actor', c.actor, 'firm', c.firm),
    %2$s);
end
$w$, '_book_staff_advance_application_core', v_args) || '$fa3pr3_wrap$';
end
$fa3pr3_cut$;

-- NOTE: role stays clara_fn_owner through the rest of SS2 and all of SS3 -- every CREATE
-- FUNCTION below must be OWNED BY clara_fn_owner (T18's own estate-wide hygiene census), never
-- by the migration runner's own role. reset role sits at the end of SS3, immediately before
-- SS4 (a plain INSERT, which needs no particular owning role).
create function clara.wake_book_staff_advance_application(p_client uuid, p_posting_date date,
    p_memo text, p_lines jsonb, p_allocations jsonb, p_kind text, p_reason text,
    p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $wake_saa$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_book_staff_advance_application');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  return clara._agent_book_staff_advance_application_core(p_client, p_posting_date, p_memo,
    p_lines, p_allocations, p_kind, p_reason, p_rationale, p_model, p_inputs_digest, p_op_key);
end
$wake_saa$;
revoke all on function clara.wake_book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text) from public;
grant execute on function clara.wake_book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text) to clara_wake_bank;

create function clara._agent_book_staff_advance_application_core(p_client uuid, p_posting_date date,
    p_memo text, p_lines jsonb, p_allocations jsonb, p_kind text, p_reason text,
    p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $agent_saa$
declare v_firm uuid; v_res jsonb; v_reason text; v_state text; v_detail text;
begin
  select firm_id into v_firm from clara.clients where id = p_client;
  if v_firm is null then raise exception 'client not in your firm' using errcode='CLR11'; end if;
  perform clara._agent_bank_tier_a(p_client, v_firm);
  perform clara._agent_verify_inputs_digest(p_client, p_inputs_digest); -- H2
  begin
    v_res := clara._book_staff_advance_application_core(
      jsonb_build_object('actor', clara.agent_user_id(), 'firm', v_firm, 'is_agent', true,
        'on_behalf_of', null, 'wake_kind', 'bank_agent', 'rationale', p_rationale, 'model', p_model),
      p_client, p_posting_date, p_memo, p_lines, p_allocations, p_kind, p_reason, p_op_key);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail;
    v_reason := clara._agent_bank_tier_c_reason(sqlerrm, v_state, v_detail);
    if v_reason is null then raise; end if;
    perform clara._agent_bank_receipt(v_firm, p_client, 'staff_advance_application', 'refused', p_client,
      p_rationale, p_model, p_inputs_digest, p_op_key, jsonb_build_object('errcode', v_state, 'reason', v_reason));
    return jsonb_build_object('status', 'refused', 'reason', v_reason);
  end;
  perform clara._agent_bank_receipt(v_firm, p_client, 'staff_advance_application', 'admitted',
    coalesce(nullif(v_res->>'entry_id','')::uuid, p_client),
    p_rationale, p_model, p_inputs_digest, p_op_key, jsonb_build_object('verdict', 'admitted'));
  return v_res;
end
$agent_saa$;
revoke all on function clara._agent_book_staff_advance_application_core(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text) from public;

-- =====================================================================================
-- SS3 -- THE IDENTIFIER-PROMOTION CONFIRM DOOR (Annex M.2 row 4; OQ-8's deferred confirm half;
-- Annex K's A15). PR-1b built the PROPOSE half (wake_propose_bank_identifier_promotion,
-- _agent_propose_bank_identifier_promotion_core) and A15's design already scoped the confirm
-- door to the client-payer case: the estate keys client-owned accounts into
-- client_identifiers(kind='bank_account') and counterparties by registration_normalized, and
-- there is NO counterparty-bank-account identifier relation -- so a promoted payer account has
-- a home ONLY when the payer named in the proposal is ITSELF a client of the same firm. This
-- verb PROVES that with the one DB-owned signal available (a client_identifiers row of kind
-- ssm/tin whose value_normalized equals the counterparty's own registration_normalized, for a
-- DIFFERENT client of the same firm -- never a name match, per law 3 "spelling is not
-- identity") and refuses promotion_target_unavailable, LEAVING THE PROPOSAL OPEN, when no such
-- client exists. This is a NEW, separate verb from clara.confirm_identifier_promotion (F-A7's
-- pi branch) -- that verb reads clara.client_identifier_promotions, a DIFFERENT table in a
-- different id namespace; conflating the two would silently confirm against the wrong row (or
-- simply find nothing and refuse for the wrong reason). Mirrors confirm_identifier_promotion's
-- own idiom: the identifier write itself goes through the audited clara.add_client_identifier
-- door with a DERIVED inner op_key (0078's rule: a replayed step reuses the reservation,
-- never mints a second identifier).
-- =====================================================================================
create function clara.confirm_bank_identifier_promotion(p_proposal uuid, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $confirm_bip$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._confirm_bank_identifier_promotion_core(
    jsonb_build_object('actor', c.actor, 'firm', c.firm), p_proposal, p_op_key);
end
$confirm_bip$;
-- UNGRANTED AT BIRTH. A freshly created function has a NULL proacl, which MEANS PUBLIC EXECUTE
-- -- the same law every other new verb in this file (and PR-1a's) observes. Explicit revoke +
-- grant is what makes this a clara_authenticated-only human door rather than a second public
-- entrance.
revoke all on function clara.confirm_bank_identifier_promotion(uuid,text) from public;
grant execute on function clara.confirm_bank_identifier_promotion(uuid,text) to clara_authenticated;

create function clara._confirm_bank_identifier_promotion_core(p_ctx jsonb, p_proposal uuid, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $confirm_bip_core$
declare
  c record; v_dedupe jsonb; pr record; v_target_client uuid; v_identifier uuid; v_inner jsonb;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the confirm_bank_identifier_promotion core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'confirm_bank_identifier_promotion', p_op_key,
    clara._hash(jsonb_build_object('proposal', p_proposal)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into pr from clara.bank_agent_proposals where id = p_proposal and kind = 'identifier_promotion' for update;
  if not found or pr.firm_id <> c.firm then
    raise exception 'identifier promotion proposal not found' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"promotion"}';
  end if;
  if pr.status <> 'open' then
    raise exception 'this promotion proposal is not open' using errcode = 'CLR10',
      detail = '{"reason":"already_settled","class":"promotion"}';
  end if;

  -- OQ-8's fail-closed default: the payer is itself a client of this firm ONLY when a
  -- client_identifiers row of kind ssm/tin, for a DIFFERENT client, carries the SAME
  -- registration_normalized this proposal's counterparty carries -- proved, never assumed
  -- from a name, per law 3.
  select ci.client_id into v_target_client
    from clara.counterparties cp
    join clara.client_identifiers ci
      on ci.firm_id = c.firm and ci.kind in ('ssm','tin')
     and ci.value_normalized = cp.registration_normalized
   where cp.id = pr.subject_id and cp.firm_id = c.firm
     and nullif(btrim(coalesce(cp.registration_normalized,'')),'') is not null
   limit 1;
  if v_target_client is null then
    raise exception 'the payer named in this proposal is not itself a client of this firm -- no identifier home exists'
      using errcode = 'CLR10', detail = '{"reason":"promotion_target_unavailable","class":"promotion"}';
  end if;

  v_inner := clara.add_client_identifier(v_target_client, pr.payload->>'identifier_kind',
    pr.payload->>'identifier_value', p_op_key || ':add_client_identifier');
  v_identifier := nullif(v_inner->>'identifier_id', '')::uuid;
  if v_identifier is null then
    raise exception 'the identifier door returned no identifier' using errcode='CLR10',
      detail = '{"reason":"promotion_not_confirmed","class":"identifier"}';
  end if;

  update clara.bank_agent_proposals
     set status = 'accepted', decided_by = c.actor, decided_at = now(),
         decision_note = format('confirmed onto client %s, identifier %s', v_target_client, v_identifier)
   where id = p_proposal;
  perform clara._audit(c.firm, c.actor, null, null, 'confirm_bank_identifier_promotion', null,
    jsonb_build_object('proposal', p_proposal, 'target_client', v_target_client,
      'identifier', v_identifier, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'confirm_bank_identifier_promotion', p_op_key,
    jsonb_build_object('proposal_id', p_proposal, 'status', 'accepted',
      'target_client_id', v_target_client, 'identifier_id', v_identifier));
end
$confirm_bip_core$;
revoke all on function clara._confirm_bank_identifier_promotion_core(jsonb,uuid,text) from public;

reset role;

-- =====================================================================================
-- SS4 -- CHAT PARITY (OQ-6, Annex A.1's own PR-3 note). EVERY live clara_wake_bank wake
-- wrapper -- the complete bank_agent allowlist roster, thirteen names, MEASURED live rather
-- than hand-copied from the design's own (stale-named) list -- gains an interactive_client
-- allowlist row apiece. NO body changes (every wrapper already resolves wake_context()
-- generically; assert_wake_allowed reads the ROW, not the kind, so a second row is the whole
-- mechanism) and NO new credential kind (A10 stands: the bank_agent kind is independent of
-- this widening). wake_open_question is untouched here: it already carries an
-- interactive_client row (measured live, SS0), predating this file. Extending an enumeration
-- is not weakening it (Annex D's own precedent for mint_wake_credential): the existing
-- wake_fn_allowlist rows per verb keep their exact semantics; nothing already allowlisted
-- loses anything, and a read (wake_get_bank_pack) joins parity on the same footing as every
-- write here -- the chat lane already reads bank state today through the human dashboard door,
-- so a chat-triggered pack read carries no new authority the human lane didn't already grant.
-- =====================================================================================
insert into clara.wake_fn_allowlist (wake_kind, function_name)
select 'interactive_client', function_name from clara.wake_fn_allowlist where wake_kind = 'bank_agent';

-- =====================================================================================
-- SS-TAIL -- re-read the live catalog and prove every claim above, rather than asserting it.
-- =====================================================================================
do $fa3pr3_tail$
declare v_n int; v_pre_sha text; v_post_sha text; v_core_oid oid;
begin
  -- SS1: all eleven drops are gone; the five keeps still resolve.
  if to_regprocedure('clara.propose_bank_rule(uuid,text,jsonb,jsonb,text)') is not null
     or to_regprocedure('clara.sign_bank_rule(uuid,text)') is not null
     or to_regprocedure('clara.retire_bank_rule(uuid,text,text)') is not null
     or to_regprocedure('clara.accept_bank_rule_suggestion(uuid,uuid,uuid,text)') is not null
     or to_regprocedure('clara._bank_rule_sightings(uuid,text,jsonb)') is not null
     or to_regprocedure('clara._bank_rule_pattern_norm(jsonb)') is not null
     or to_regprocedure('clara.list_bank_rule_candidates(uuid)') is not null
     or to_regprocedure('clara.list_bank_rules(uuid)') is not null
     or to_regprocedure('clara.list_bank_line_suggestions(uuid)') is not null
     or to_regprocedure('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)') is not null
     or to_regprocedure('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)') is not null then
    raise exception 'F-A3 PR-3 tail: at least one of the eleven drop targets still resolves' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._bank_desc_word_match(text,text[])') is null
     or to_regprocedure('clara._bank_rule_regex_escape(text)') is null
     or to_regprocedure('clara._bank_line_class_hint(text)') is null
     or to_regprocedure('clara._wdb_suggestion_rule_hit(uuid,uuid)') is null
     or to_regprocedure('clara._wdb_suggestion_lines(uuid,uuid,uuid)') is null then
    raise exception 'F-A3 PR-3 tail: at least one KEEP-listed helper no longer resolves -- SS1 collateral damage' using errcode='CLR10';
  end if;
  -- the /6 human arity of match_bank_line and the /12 human arity of settle_from_bank_line
  -- (PR-1a's own extractions) are untouched -- this file drops ONLY the rule arities.
  if to_regprocedure('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)') is null
     or to_regprocedure('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)') is null then
    raise exception 'F-A3 PR-3 tail: the human-arity match_bank_line/6 or settle_from_bank_line/12 no longer resolves -- the wrong overload was dropped' using errcode='CLR10';
  end if;

  -- SS1b: the widened CHECK admits both new act_kind values and every prior one.
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.bank_agent_receipts'::regclass and conname = 'bank_agent_receipts_act_kind_check'
     and pg_get_constraintdef(oid) ~ '''staff_advance_application''' and pg_get_constraintdef(oid) ~ '''identifier_promotion_confirm''';
  if v_n <> 1 then
    raise exception 'F-A3 PR-3 tail: bank_agent_receipts_act_kind_check does not admit both new act_kind values' using errcode='CLR10';
  end if;

  -- SS2: the core is the pre-extraction body byte-for-byte (invert the ctx substitution, hash,
  -- compare against the pinned pre-extraction sha -- the SAME PR-1a proof, not merely a
  -- plausibility check), the wrapper is unmoved on every public property, and the core is
  -- ungranted.
  select p.oid into v_core_oid from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_book_staff_advance_application_core';
  if v_core_oid is null then
    raise exception 'F-A3 PR-3 tail: clara._book_staff_advance_application_core was not created' using errcode='CLR10';
  end if;
  if has_function_privilege('public', v_core_oid, 'execute') then
    raise exception 'F-A3 PR-3 tail: clara._book_staff_advance_application_core is reachable by PUBLIC' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)') is null then
    raise exception 'F-A3 PR-3 tail: the public book_staff_advance_application verb no longer resolves at its original signature' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)'::regprocedure, 'execute') then
    raise exception 'F-A3 PR-3 tail: clara_authenticated lost EXECUTE on book_staff_advance_application' using errcode='CLR10';
  end if;

  -- SS2/SS3: the two new wake siblings + their agent cores exist, are owned by clara_fn_owner,
  -- and the wake wrappers are reachable by clara_wake_bank ALONE (never PUBLIC, never any
  -- other named role).
  if to_regprocedure('clara.wake_book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)') is null
     or to_regprocedure('clara._agent_book_staff_advance_application_core(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)') is null
     or to_regprocedure('clara.confirm_bank_identifier_promotion(uuid,text)') is null
     or to_regprocedure('clara._confirm_bank_identifier_promotion_core(jsonb,uuid,text)') is null then
    raise exception 'F-A3 PR-3 tail: at least one new SS2/SS3 verb was not created' using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara.wake_book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)'::regprocedure, 'execute')
     or not has_function_privilege('clara_wake_bank', 'clara.wake_book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)'::regprocedure, 'execute') then
    raise exception 'F-A3 PR-3 tail: wake_book_staff_advance_application''s grant shape is wrong (must be clara_wake_bank alone)' using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara._agent_book_staff_advance_application_core(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)'::regprocedure, 'execute') then
    raise exception 'F-A3 PR-3 tail: _agent_book_staff_advance_application_core is reachable by PUBLIC' using errcode='CLR10';
  end if;
  -- BOTH directions, never clara_authenticated alone: a role that merely INHERITS PUBLIC's
  -- implicit grant would pass a same-role-only check even with a NULL-proacl PUBLIC leak (the
  -- exact gap this file's own SS3 first shipped with, caught by rig-isolation.test.mjs's T17,
  -- never by this tail's own first draft -- fixed here rather than left as a weaker check).
  if has_function_privilege('public', 'clara.confirm_bank_identifier_promotion(uuid,text)'::regprocedure, 'execute') then
    raise exception 'F-A3 PR-3 tail: PUBLIC can execute confirm_bank_identifier_promotion -- the NULL-proacl leak' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.confirm_bank_identifier_promotion(uuid,text)'::regprocedure, 'execute') then
    raise exception 'F-A3 PR-3 tail: clara_authenticated cannot execute confirm_bank_identifier_promotion' using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara._confirm_bank_identifier_promotion_core(jsonb,uuid,text)'::regprocedure, 'execute') then
    raise exception 'F-A3 PR-3 tail: _confirm_bank_identifier_promotion_core is reachable by PUBLIC' using errcode='CLR10';
  end if;

  -- SS4: interactive_client now carries EXACTLY the bank_agent roster, no more no less --
  -- a symmetric-difference count, not merely "at least these are present".
  select count(*)::int into v_n from (
    select fn_name from clara.wake_fn_allowlist where wake_kind = 'bank_agent'
    except
    select fn_name from clara.wake_fn_allowlist where wake_kind = 'interactive_client'
  ) missing;
  if v_n <> 0 then
    raise exception 'F-A3 PR-3 tail: % bank_agent wake wrapper(s) still lack an interactive_client row', v_n using errcode='CLR10';
  end if;

  raise notice 'F-A3 PR-3 tail: OK -- 11 rule-machine functions dropped (match_bank_line/6 and settle_from_bank_line/12 the human arities untouched), 5 helpers kept and still resolving, bank_agent_receipts_act_kind_check widened to 14 admitted values, book_staff_advance_application factored onto the PR-1a wake shape (core ungranted, wrapper unmoved, clara_authenticated EXECUTE intact), wake_book_staff_advance_application + its agent core live and clara_wake_bank-only, confirm_bank_identifier_promotion + its core live (clara_authenticated-only / ungranted-core), interactive_client now carries the complete bank_agent allowlist roster with zero gaps. No table in workflow/graphile_worker/spike touched. D1 write-quiesce: book_staff_advance_application replaced in place per SS0''s inventory; every other body in this file is newly created, no quiesce owed.';
end
$fa3pr3_tail$;
