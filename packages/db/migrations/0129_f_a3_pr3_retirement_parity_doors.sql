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
--   SS4  CHAT PARITY (OQ-6) -- the thirteen live bank_agent wake wrappers gain an
--        interactive_client allowlist row apiece; no body changes, no new credential kind.
--        wake_book_staff_advance_application (SS2) is DEFERRED past SS4 and deliberately
--        EXCLUDED -- OQ-6's parity is scoped to bank-matching, OQ-7's sibling carries no
--        chat-parity mention (the ordering decision, SS4's own header).
--   SS5  PROVENANCE THREADING (owner ruling, 2026-08-25) -- an interactive_client act writes
--        the real human's identity/kind/attended-arm through every bank_agent judgement
--        receipt and agent-core ctx; a bank_agent act is unchanged.
--
-- D1 WRITE-QUIESCE INVENTORY (every audited writer body this file replaces or creates):
--   replaced in place: clara.book_staff_advance_application (SS2 -- becomes a thin delegator)
--   dropped outright (D1 in the sense that a live caller loses the function, never that a body
--     is recut mid-flight): the eleven SS1 names
--   newly created (no prior body, no quiesce owed): _book_staff_advance_application_core,
--     wake_book_staff_advance_application, _agent_book_staff_advance_application_core,
--     confirm_bank_identifier_promotion, _confirm_bank_identifier_promotion_core
--   SCHEMA-LOCKED, not a body recut (SHOULD 5b): SS1b takes ACCESS EXCLUSIVE on
--     clara.bank_agent_receipts to drop+re-add bank_agent_receipts_act_kind_check (widened
--     to admit 'staff_advance_application'), and re-validates every existing row against the
--     new CHECK -- a DDL-class D1 event on a live-written table, not a function body change,
--     named here for the same reason a body recut is: it takes a lock a live writer can block
--     on, and a reviewer of the deploy window needs to know it is there.
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

-- LOCK TIMEOUT (SHOULD 5i): this file DROPs eleven functions and takes ACCESS EXCLUSIVE on
-- clara.bank_agent_receipts (SS1b, the CHECK widen). Load-bearing, not precautionary: on a
-- live deploy a long-running query against any dropped function or that table would otherwise
-- make this whole D1 window hang indefinitely waiting for its lock rather than failing fast
-- and loud. `db-migrations.md`'s own rule: the timeout lives IN THE FILE, not the ceremony.
set local lock_timeout = '30s';

-- =====================================================================================
-- SS0 PRESTATE -- every claim this file makes about what it is editing, MEASURED.
-- =====================================================================================

-- THE ELEVEN DROP TARGETS' PROSRC SHA-256 PINS (the F-A1 pre-quiesce tripwire, PR-1a's own
-- idiom: 0119 lines 143-184). Measured on a rig at the pre-drop frontier (0127) by holding
-- this file out of CLARA_MIGRATIONS_DIR, resetting, migrating to 127, and reading
-- sha256(prosrc) for each exact signature -- never taken from any file's text, because these
-- eleven bodies are the bank-rules machine and (0119's own note applies here too) are spliced
-- across generations and readable from no file. This is D1 evidentiary, not behavioural: DROP
-- does not run the body, so a mismatch cannot corrupt data -- it means "the ceremony is not
-- looking at the tip this file was authored and reviewed against", which is reason enough to
-- stop before recording an inventory that would then be wrong.
--
-- ON COMMIT DROP, at file top level (SHOULD 5g, noted rather than restructured): this table
-- lives for the DURATION OF THIS FILE'S OWN TRANSACTION, which the migration runner always
-- wraps the whole file in. Hand-running this file with a bare `psql -f` (bypassing the
-- runner) autocommits each top-level statement separately by default, so the table would be
-- dropped the instant its own CREATE commits and every later reference would fail confusingly
-- ("relation does not exist") rather than with a clear "run this through the runner" message.
-- This file is never meant to be hand-run; `pnpm db:migrate` is the only supported path.
create temp table fa3pr3_drop_targets (
  sig text primary key, sha text not null
) on commit drop;

insert into fa3pr3_drop_targets (sig, sha) values
 ('clara.propose_bank_rule(uuid,text,jsonb,jsonb,text)',
  '9f0c14671151d8c746f9ecc2ca27b114419e4b375019bb1dce066fabd7f5bf53'),
 ('clara.sign_bank_rule(uuid,text)',
  '8a04c963fb5017c43abcf3abbdd913b1f993d4db32fe10601dd054b7cce64aa8'),
 ('clara.retire_bank_rule(uuid,text,text)',
  'a746f2a850b805460842bfda2af6d8346a1906bd1449e1c86611ca8104aa264d'),
 ('clara.accept_bank_rule_suggestion(uuid,uuid,uuid,text)',
  'aa93528450b4af2c05e2a1689b4961c72a7f825b14aca5e47601bd5e8d13941e'),
 ('clara._bank_rule_sightings(uuid,text,jsonb)',
  'b4542a82f2da89d5aefdd46b6dbd39dce6c8ee7f2d9fcff53b66c785da47cd58'),
 ('clara._bank_rule_pattern_norm(jsonb)',
  '4f1791f3d4421ff3dc3bd00486406e0d6dd30ade87becf18988b4e385da08aad'),
 ('clara.list_bank_rule_candidates(uuid)',
  'db0ff3dccff652e9d0d718f227945221d986faab792735988bb4ae038206b712'),
 ('clara.list_bank_rules(uuid)',
  '3230a50162935e28ffee0265649189f7b91ae93d7c83e2f1d712c46a6cb55dc2'),
 ('clara.list_bank_line_suggestions(uuid)',
  '76755e32f9b7ea67cd8cfaca2afa8776d06111c2f2319d65614d364131341bfa'),
 ('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)',
  'f96669e6982c51c83968c77d184f64e6131726d0e6d8d2a794e4c4a24b0585be'),
 ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)',
  '4e2698bb5f5e79c3b21236fcc5708f28b2524128570a8f48f1b6d1a39c8f8735');

do $fa3pr3_pre$
declare
  v_n int; v_oid oid; t record; v_src text; v_sha text; v_pinned int := 0;
begin
  -- (a) THE ELEVEN DROP TARGETS RESOLVE, at their exact signatures, are NOT already gone, and
  -- their live prosrc matches the sha256 pinned above -- the D1 write-quiesce inventory this
  -- file's header promises, proven rather than asserted.
  if (select count(*)::int from fa3pr3_drop_targets) <> 11 then
    raise exception 'F-A3 PR-3 prestate: the drop-target roster is not the ELEVEN Annex I names' using errcode='CLR10';
  end if;
  for t in select * from fa3pr3_drop_targets order by sig loop
    v_oid := to_regprocedure(t.sig);
    if v_oid is null then
      raise exception 'F-A3 PR-3 prestate: % does not resolve', t.sig using errcode='CLR10';
    end if;
    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
    if v_sha <> t.sha then
      raise exception 'F-A3 PR-3 prestate: % prosrc sha256 mismatch (got %, expected %) -- this is NOT the body this drop inventory was authored and reviewed against. STOP the ceremony; re-derive the tip on a rig and re-pin before re-cutting',
        t.sig, v_sha, t.sha using errcode='CLR10';
    end if;
    v_pinned := v_pinned + 1;
  end loop;
  if v_pinned <> 11 then
    raise exception 'F-A3 PR-3 prestate: only % of 11 drop targets were sha-pinned', v_pinned using errcode='CLR10';
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

  -- (g) SS3's two dependency shapes, PINNED against the live catalog rather than assumed from
  -- authoring-time reads (PR-1b built both objects; this file is the FIRST to write a NEW
  -- confirm door against them, so their live text is the premise the whole door stands on).
  declare v_c text;
  begin
    select pg_get_constraintdef(oid) into v_c from pg_constraint
     where conrelid = 'clara.bank_agent_proposals'::regclass and conname = 'bank_agent_proposals_kind_check';
    if v_c is null or v_c !~ '''identifier_promotion''' then
      raise exception 'F-A3 PR-3 prestate: bank_agent_proposals_kind_check does not admit identifier_promotion (got: %)', v_c using errcode='CLR10';
    end if;
    select pg_get_constraintdef(oid) into v_c from pg_constraint
     where conrelid = 'clara.bank_agent_proposals'::regclass and conname = 'bank_agent_proposals_status_check';
    if v_c is null or v_c !~ '''open''' or v_c !~ '''accepted''' then
      raise exception 'F-A3 PR-3 prestate: bank_agent_proposals_status_check does not admit open/accepted (got: %)', v_c using errcode='CLR10';
    end if;
    -- ck_bap_terminal's own shape: status='open' <=> decided_by/decided_at both null, checked
    -- structurally (never-open vs terminal), not by a literal 'accepted' text it does not carry.
    select pg_get_constraintdef(oid) into v_c from pg_constraint
     where conrelid = 'clara.bank_agent_proposals'::regclass and conname = 'ck_bap_terminal';
    if v_c is null or v_c !~ 'decided_by IS NULL' or v_c !~ 'decided_at IS NOT NULL' then
      raise exception 'F-A3 PR-3 prestate: ck_bap_terminal does not carry the open<=>undecided congruence shape this file writes through (got: %)', v_c using errcode='CLR10';
    end if;
    select pg_get_constraintdef(oid) into v_c from pg_constraint
     where conrelid = 'clara.client_identifiers'::regclass and conname = 'client_identifiers_kind_check';
    if v_c is null or v_c !~ '''ssm''' or v_c !~ '''tin''' then
      raise exception 'F-A3 PR-3 prestate: client_identifiers_kind_check does not admit ssm/tin (got: %)', v_c using errcode='CLR10';
    end if;
    -- the columns SS3's core reads/writes by name, positively confirmed present (never assumed
    -- from the design's own citation of PR-1b's build).
    if to_regclass('clara.bank_agent_proposals') is null
       or not exists (select 1 from information_schema.columns where table_schema='clara' and table_name='bank_agent_proposals' and column_name in ('subject_id','payload','client_id','firm_id','status','decided_by','decided_at','decision_note') having count(*) = 8)
       or to_regclass('clara.client_identifiers') is null
       or not exists (select 1 from information_schema.columns where table_schema='clara' and table_name='client_identifiers' and column_name in ('client_id','firm_id','kind','value_normalized') having count(*) = 4)
       or to_regclass('clara.counterparties') is null
       or not exists (select 1 from information_schema.columns where table_schema='clara' and table_name='counterparties' and column_name in ('id','firm_id','registration_normalized') having count(*) = 3) then
      raise exception 'F-A3 PR-3 prestate: at least one column SS3 reads/writes by name is missing from bank_agent_proposals / client_identifiers / counterparties' using errcode='CLR10';
    end if;
    if to_regprocedure('clara.add_client_identifier(uuid,text,text,text)') is null then
      raise exception 'F-A3 PR-3 prestate: clara.add_client_identifier/4 does not resolve -- SS3''s confirm door has no audited identifier-write door to delegate to' using errcode='CLR10';
    end if;
  end;

  raise notice 'F-A3 PR-3 prestate: clean -- 11 drop targets resolve, 5 keep targets resolve (2 newly justified by re-measured caller census), clara._adj_on_approve still calls both, book_staff_advance_application is unextracted, every new-verb name is free, no bank wake wrapper yet carries an interactive_client row, bank_agent_proposals/client_identifiers/counterparties carry every column and CHECK SS3 depends on, and clara.add_client_identifier resolves';
end
$fa3pr3_pre$;

-- clara._agent_wake_ctx -- created EARLY (SS5's own header, further down, explains why):
-- SS2's freshly-authored core calls it directly, so it must exist before SS2 runs.
set role clara_fn_owner;
create function clara._agent_wake_ctx(p_firm uuid, p_rationale text, p_model jsonb)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $wake_ctx$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.wake_kind = 'interactive_client' then
    -- ATTENDED: the acting identity IS the human directing the chat turn (the credential's
    -- own on_behalf_of), never the system agent user. is_agent=false flows into every shared
    -- _<verb>_core's origin-stamp (design register N3/A25) and this file's own SS2
    -- entry_post_receipts gate the SAME way a direct human door's call would.
    return jsonb_build_object('actor', w.on_behalf_of, 'firm', p_firm, 'is_agent', false,
      'on_behalf_of', w.on_behalf_of, 'wake_kind', w.wake_kind,
      'rationale', p_rationale, 'model', p_model);
  end if;
  -- UNATTENDED (bank_agent, or any future non-interactive_client kind): byte-identical to
  -- the pre-fix literal this replaces, so an agent-credential act is UNCHANGED (the
  -- regression twin every test cell below proves).
  return jsonb_build_object('actor', clara.agent_user_id(), 'firm', p_firm, 'is_agent', true,
    'on_behalf_of', null, 'wake_kind', coalesce(w.wake_kind, 'bank_agent'),
    'rationale', p_rationale, 'model', p_model);
end
$wake_ctx$;
revoke all on function clara._agent_wake_ctx(uuid,text,jsonb) from public;
reset role;

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
-- SS1b -- WIDEN clara.bank_agent_receipts_act_kind_check (extend-only). ONE new act_kind
-- value: 'staff_advance_application' (SS2). The twelve pre-existing values (the eleven from
-- PR-1a/1b/1c plus 'pack_read' from PR-1c) survive byte-identical -- re-read from the LIVE
-- constraint text, never re-typed from a design cite.
--
-- 'identifier_promotion_confirm' is DELIBERATELY NOT admitted here (SHOULD 5d, law 31, the
-- A17 precedent: "declined"/"stale" were dropped from a different CHECK for want of a
-- writer). SS3's confirm_bank_identifier_promotion is a HUMAN-only door (_human_ctx,
-- bookkeeper floor) -- it never writes clara.bank_agent_receipts (that table is the AGENT
-- judgement-act receipt, SS3's own _audit call is this human act's real record) -- so no
-- writer for this value will ever exist. Admitting it anyway would be exactly the
-- enumerated-but-unproducible state law 31 forbids.
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
      'identifier_promotion_propose','pack_read','staff_advance_application'));
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
  -- SECOND SUBSTITUTION (review round fix -- CLR08 the agent-post receipt wall,
  -- clara._tf_assert_agent_post_receipt, 0011): the pre-extraction body writes ZERO
  -- entry_post_receipts rows on ANY approve, human or agent, because it was ONLY EVER a human
  -- verb -- the wall is vacuously satisfied for a human checker_actor (Annex E.3's own "a
  -- human approval writes no receipt. THAT IS THE WHOLE CONDITION"). The agent core now
  -- reaches this SAME approve call with an agent checker_actor, and the wall is a DEFERRED
  -- (commit-time) trigger, so nothing catches the gap until commit -- exactly the shape a
  -- rig-replayed test battery exists to find. FIX, matching _allocate_receipt_core's own
  -- precedent verbatim (0037): gate an explicit entry_post_receipts insert on p_ctx->>'is_agent',
  -- right after the SAME approve call the human path already takes -- the human path inserts
  -- nothing (is_agent is absent/false there), so its behaviour is BYTE-UNMOVED.
  v_anchor2 text := $a2$    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';$a2$;
  v_ctx2 text := $c2$    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';
    if coalesce((p_ctx->>'is_agent')::boolean, false) then
      insert into clara.entry_post_receipts(firm_id, client_id, entry_id, acting_actor,
          on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
          maker_active_at_approval, op_key)
        values (c.firm, p_client, v_entry, c.actor,
          nullif(p_ctx->>'on_behalf_of','')::uuid, coalesce(p_ctx->>'wake_kind','bank_agent'),
          coalesce(p_ctx->'model', '{}'::jsonb),
          coalesce(nullif(btrim(p_ctx->>'rationale'),''), 'Staff advance application (agent)'),
          jsonb_build_object('op_key', v_approve_key), 'agent_unattended', null, v_approve_key);
    end if;$c2$;
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
  if (length(v_src) - length(replace(v_src, v_anchor2, ''))) / length(v_anchor2) <> 1 then
    raise exception 'F-A3 PR-3 SS2: the live body does not carry the pinned approve-entry call site exactly once -- the second substitution (the entry_post_receipts fix) cannot be applied blind' using errcode='CLR10';
  end if;
  execute replace(v_head, 'CREATE OR REPLACE FUNCTION clara.book_staff_advance_application(',
                          'CREATE OR REPLACE FUNCTION clara._book_staff_advance_application_core(p_ctx jsonb, ')
          || 'AS $fa3pr3_core$' || replace(replace(v_src, v_anchor, v_ctx), v_anchor2, v_ctx2) || '$fa3pr3_core$';
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

-- THE ALLOWLIST ROW. Without this, assert_wake_allowed (0004:117-120, fail-closed) refuses
-- EVERY call to the wrapper above with CLR03 -- the wrapper would be created, granted, and
-- permanently unreachable. bank_agent owns this verb (OQ-7: "a sibling of the SAME SHAPE" as
-- the other bank-agency wake verbs; the agent core below reuses bank_agent's own Tier-A/Tier-C
-- machinery -- _agent_bank_tier_a, _agent_bank_tier_c_reason, _agent_bank_receipt -- verbatim,
-- the same architectural family as _agent_add_bank_account_core).
--
-- ORDERING DECISION (review finding, deliberate): this insert is DEFERRED to AFTER SS4's own
-- bank_agent-to-interactive_client mirror, below -- see SS4's own header for the row and the
-- rationale. A human in chat must NOT get to book a staff advance through the bank lane:
-- OQ-6's chat parity is scoped to the bank-matching surface (Annex A23); OQ-7's staff-advance
-- sibling is an AUTONOMOUS-lane sibling with no chat-parity mention anywhere in the design.

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
      clara._agent_wake_ctx(v_firm, p_rationale, p_model),
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
  v_n int;
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
  -- identifier this proposal's counterparty carries -- proved, never assumed from a name,
  -- per law 3. "DIFFERENT client" is enforced STRUCTURALLY (review C3b, the same-client
  -- trap): cp.client_id is excluded from the match, never merely documented.
  --
  -- MUST 2b (review finding): comparing cp.registration_normalized to ci.value_normalized
  -- compares TWO DIFFERENT NORMALIZATIONS -- registration_normalized strips EVERY
  -- non-alphanumeric character (ck_counterparties_registration_normalized), while
  -- value_normalized strips WHITESPACE ONLY (clara.add_client_identifier's own DC-1 rule,
  -- the same rule _agent_file_document_core:152 re-derives on its OTHER comparison side).
  -- A punctuated form (`1234567-A`) matches on one side and misses on the other -- the door
  -- worked sometimes and silently refused the rest, proved live both polarities. Fixed by
  -- re-deriving value_normalized's OWN rule from cp.registration_no (the RAW form, never
  -- registration_normalized) so both sides of the join use the identical formula.
  --
  -- MUST 2d (review finding): a bare `limit 1` with no ORDER BY over a NON-unique index
  -- picked an arbitrary client when two carried the same identifier (proved live). Counted
  -- DISTINCT below and refused, typed, rather than silently choosing one. (uuid has no
  -- built-in min()/max() aggregate -- array_agg + a deterministic sort stands in.)
  select count(distinct ci.client_id), (array_agg(ci.client_id order by ci.client_id))[1]
    into v_n, v_target_client
    from clara.counterparties cp
    join clara.client_identifiers ci
      on ci.firm_id = c.firm and ci.kind in ('ssm','tin')
     and ci.value_normalized = lower(regexp_replace(cp.registration_no,'\s+','','g'))
     and ci.client_id <> cp.client_id
   where cp.id = pr.subject_id and cp.firm_id = c.firm
     and nullif(btrim(coalesce(cp.registration_no,'')),'') is not null;
  if v_n = 0 or v_target_client is null then
    raise exception 'the payer named in this proposal is not itself a client of this firm -- no identifier home exists'
      using errcode = 'CLR10', detail = '{"reason":"promotion_target_unavailable","class":"promotion"}';
  end if;
  if v_n > 1 then
    raise exception 'the payer named in this proposal matches % different clients'' identifiers -- confirming would guess which one', v_n
      using errcode = 'CLR10', detail = '{"reason":"promotion_target_ambiguous","class":"promotion"}';
  end if;
  -- MUST 2c (review finding, PRD SS6 / constraint 2): this door confirms a PROMOTED PAYER
  -- BANK ACCOUNT (A15/OQ-8's own scope) -- never a statutory identifier. `pr.payload->>
  -- 'identifier_kind'` is MODEL-PROPOSED (wake_propose_bank_identifier_promotion admits
  -- tin/ssm/bank_account with no re-validation at this door), so without this check an
  -- agent-minted 'ssm' or 'tin' proposal writes a model-invented statutory identifier onto a
  -- real client's identity record through this same call -- proven live by the reviewer.
  -- Refused here, structurally, before the audited write door is ever reached.
  if pr.payload->>'identifier_kind' <> 'bank_account' then
    raise exception 'this door confirms a promoted payer BANK ACCOUNT only -- % is out of scope for confirm_bank_identifier_promotion', pr.payload->>'identifier_kind'
      using errcode = 'CLR10', detail = '{"reason":"identifier_kind_out_of_scope","class":"promotion"}';
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

-- =====================================================================================
-- SS5 -- PROVENANCE THREADING (owner ruling, 2026-08-25: SS4's full 13-verb chat parity
-- STAYS, on the hard condition that the receipt tells the truth). The reviewer proved live
-- that a human's interactive_client act writes a receipt stamped acting_actor = the AGENT
-- user, on_behalf_of = NULL, via_wake_kind = 'bank_agent', approval_arm = 'agent_unattended'
-- -- mislabelled provenance, the F-A5/PR-3 fold-in class. Root cause: every
-- clara._agent_<verb>_core hardcodes this identity unconditionally in the ctx it builds
-- (PR-1b, migration 0121, already merged) and clara._agent_bank_receipt hardcodes it again in
-- the judgement receipt it writes -- neither ever reads which wake credential is actually
-- live. Fixed by centralizing the derivation in ONE new helper each of the twelve affected
-- bodies calls, rather than elevens copies of the same branch: clara.wake_context() is
-- STABLE and session-scoped (current_setting('clara.wake_secret')), so calling it a second
-- time inside a core that a wrapper already resolved it in returns the IDENTICAL row -- no
-- new parameter needs to thread through any of the twelve call sites. clara._agent_wake_ctx
-- itself is created EARLY, right after SS0 (see there), because SS2's OWN freshly-authored
-- core calls it directly -- SS2 is authored correctly from birth, never CoR-patched.
-- =====================================================================================
set role clara_fn_owner;

-- THE ELEVEN _agent_<verb>_core BODIES (ten from PR-1b, already merged; this file's own
-- SS2 core is the eleventh, authored to call _agent_wake_ctx directly -- never CoR-patched,
-- since it did not exist before this file). Each of the ten below carries the IDENTICAL
-- two-line ctx fragment (measured, not assumed) -- ONE substitution, targeted and pinned by
-- exact text, never a blind regex.
do $fa3pr3_prov_cores$
declare
  v_target text := $t$jsonb_build_object('actor', clara.agent_user_id(), 'firm', v_firm, 'is_agent', true,
        'on_behalf_of', null, 'wake_kind', 'bank_agent', 'rationale', p_rationale, 'model', p_model)$t$;
  v_names text[] := array['_agent_add_bank_account_core','_agent_complete_bank_reconciliation_core',
    '_agent_match_bank_line_core','_agent_resolve_and_book_core',
    '_agent_resolve_bank_line_exception_core','_agent_unmatch_bank_match_core',
    '_agent_upsert_account_core','_agent_void_bank_reconciliation_core',
    '_agent_void_bank_statement_core'];
  fn text; v_src text; v_occ int; v_oid oid; v_def text; v_head text;
begin
  foreach fn in array v_names loop
    select p.oid into v_oid from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname=fn;
    if v_oid is null then
      raise exception 'F-A3 PR-3 SS5: clara.% does not resolve', fn using errcode='CLR10';
    end if;
    v_def := pg_get_functiondef(v_oid);
    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    v_head := left(v_def, position(E'\nAS $function$' in v_def));
    if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
      raise exception 'F-A3 PR-3 SS5: clara.% does not split at the AS $function$ boundary into a uniquely-locatable header + prosrc', fn using errcode='CLR10';
    end if;
    v_occ := (length(v_src) - length(replace(v_src, v_target, ''))) / length(v_target);
    if v_occ <> 1 then
      raise exception 'F-A3 PR-3 SS5: clara.% does not carry the pinned identity-ctx fragment exactly once (found %) -- re-derive before patching', fn, v_occ using errcode='CLR10';
    end if;
    execute v_head || 'AS $wake_prov$' ||
      replace(v_src, v_target, 'clara._agent_wake_ctx(v_firm, p_rationale, p_model)') || '$wake_prov$';
  end loop;
end
$fa3pr3_prov_cores$;

-- _agent_settle_from_bank_line_core carries the SAME fragment but with two MORE keys
-- trailing on the same jsonb_build_object call ('receipt_preheld', 'fn') -- patched
-- separately so the loop's single pinned target above stays exact for the other nine.
do $fa3pr3_prov_settle$
declare
  v_target text := $t2$jsonb_build_object('actor', clara.agent_user_id(), 'firm', v_firm, 'is_agent', true,
        'on_behalf_of', null, 'wake_kind', 'bank_agent', 'rationale', p_rationale, 'model', p_model,
        'receipt_preheld', false, 'fn', 'wake_settle_from_bank_line')$t2$;
  v_src text; v_occ int; v_oid oid; v_def text; v_head text;
begin
  select p.oid into v_oid from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_agent_settle_from_bank_line_core';
  if v_oid is null then
    raise exception 'F-A3 PR-3 SS5: clara._agent_settle_from_bank_line_core does not resolve' using errcode='CLR10';
  end if;
  v_def := pg_get_functiondef(v_oid);
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
    raise exception 'F-A3 PR-3 SS5: clara._agent_settle_from_bank_line_core does not split at the AS $function$ boundary' using errcode='CLR10';
  end if;
  v_occ := (length(v_src) - length(replace(v_src, v_target, ''))) / length(v_target);
  if v_occ <> 1 then
    raise exception 'F-A3 PR-3 SS5: clara._agent_settle_from_bank_line_core does not carry its pinned identity-ctx fragment exactly once (found %)', v_occ using errcode='CLR10';
  end if;
  execute v_head || 'AS $wake_prov_settle$' ||
    replace(v_src, v_target,
      $r$clara._agent_wake_ctx(v_firm, p_rationale, p_model) || jsonb_build_object('receipt_preheld', false, 'fn', 'wake_settle_from_bank_line')$r$)
    || '$wake_prov_settle$';
end
$fa3pr3_prov_settle$;

-- clara._agent_bank_receipt: the SHARED judgement-receipt writer every one of the eleven
-- cores calls. ONE recut here fixes the receipt half for all eleven at once -- the SAME
-- centralization argument as _agent_wake_ctx above, and the reason this file touches this
-- function's OWN VALUES clause rather than eleven call sites.
do $fa3pr3_prov_receipt$
declare
  v_target text := $t3$clara.agent_user_id(), null, 'bank_agent', p_model,
      p_rationale, v_digest,
      p_gate_verdicts, 'agent_unattended', p_op_key)$t3$;
  v_replacement text := $r3$(select case when w.wake_kind = 'interactive_client' then w.on_behalf_of else clara.agent_user_id() end from clara.wake_context() w),
      (select w.on_behalf_of from clara.wake_context() w where w.wake_kind = 'interactive_client'),
      coalesce((select w.wake_kind from clara.wake_context() w), 'bank_agent'), p_model,
      p_rationale, v_digest,
      p_gate_verdicts,
      (select case when w.wake_kind = 'interactive_client' then 'interactive_client_attended' else 'agent_unattended' end from clara.wake_context() w),
      p_op_key)$r3$;
  v_src text; v_occ int; v_oid oid; v_def text; v_head text;
begin
  select p.oid into v_oid from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_agent_bank_receipt';
  if v_oid is null then
    raise exception 'F-A3 PR-3 SS5: clara._agent_bank_receipt does not resolve' using errcode='CLR10';
  end if;
  v_def := pg_get_functiondef(v_oid);
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
    raise exception 'F-A3 PR-3 SS5: clara._agent_bank_receipt does not split at the AS $function$ boundary' using errcode='CLR10';
  end if;
  v_occ := (length(v_src) - length(replace(v_src, v_target, ''))) / length(v_target);
  if v_occ <> 1 then
    raise exception 'F-A3 PR-3 SS5: clara._agent_bank_receipt does not carry its pinned VALUES fragment exactly once (found %) -- re-derive before patching', v_occ using errcode='CLR10';
  end if;
  execute v_head || 'AS $wake_prov_receipt$' || replace(v_src, v_target, v_replacement) || '$wake_prov_receipt$';
end
$fa3pr3_prov_receipt$;

-- entry_post_receipts_via_wake_kind_check (owner ruling): an honest interactive_client
-- POSTING receipt (from _book_staff_advance_application_core's own is_agent-gated insert,
-- SS2 above, and any of settle/match/resolve_and_book once posted) would be REJECTED at
-- this CHECK today. Widened extend-only, pinned both ways.
do $fa3pr3_prov_epr$
declare v_live text;
begin
  select pg_get_constraintdef(oid) into v_live from pg_constraint
   where conrelid = 'clara.entry_post_receipts'::regclass and conname = 'entry_post_receipts_via_wake_kind_check';
  if v_live is null then
    raise exception 'F-A3 PR-3 SS5: entry_post_receipts_via_wake_kind_check does not exist' using errcode='CLR10';
  end if;
  if v_live <> $lc2$CHECK ((via_wake_kind = ANY (ARRAY['autodraft'::text, 'interactive'::text, 'bank_agent'::text])))$lc2$ then
    raise exception 'F-A3 PR-3 SS5: entry_post_receipts_via_wake_kind_check has drifted from the pinned pre-widen text -- re-derive before widening' using errcode='CLR10';
  end if;
  alter table clara.entry_post_receipts drop constraint entry_post_receipts_via_wake_kind_check;
  alter table clara.entry_post_receipts add constraint entry_post_receipts_via_wake_kind_check
    check (via_wake_kind in ('autodraft','interactive','bank_agent','interactive_client'));
end
$fa3pr3_prov_epr$;

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

-- SS2's deferred allowlist row lands HERE, after SS4's copy above -- the ordering decision
-- (review finding, deliberate): wake_book_staff_advance_application joins bank_agent
-- (thirteen rows -> fourteen) but is EXCLUDED from interactive_client's mirror, because SS4's
-- copy already ran against the pre-this-row roster. A human in chat does not get to book a
-- staff advance through the bank lane -- OQ-6's parity is scoped to bank-matching (Annex
-- A23); OQ-7's sibling carries no chat-parity mention anywhere in the design. The tail below
-- proves the DIFFERENCE between the two rosters is exactly this one name, permanently, not
-- merely today.
insert into clara.wake_fn_allowlist (wake_kind, function_name)
  values ('bank_agent', 'wake_book_staff_advance_application');

-- =====================================================================================
-- SS-TAIL -- re-read the live catalog and prove every claim above, rather than asserting it.
-- =====================================================================================
do $fa3pr3_tail$
declare v_n int; v_pre_sha text; v_post_sha text; v_core_oid oid; v_src text; v_inverted text; v_names text[];
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

  -- SS1b: the widened CHECK admits the one new act_kind value and every prior one, and does
  -- NOT admit 'identifier_promotion_confirm' (SHOULD 5d -- no writer for it exists or ever
  -- will; confirm_bank_identifier_promotion is human-only and never writes this table).
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.bank_agent_receipts'::regclass and conname = 'bank_agent_receipts_act_kind_check'
     and pg_get_constraintdef(oid) ~ '''staff_advance_application''';
  if v_n <> 1 then
    raise exception 'F-A3 PR-3 tail: bank_agent_receipts_act_kind_check does not admit staff_advance_application' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.bank_agent_receipts'::regclass and conname = 'bank_agent_receipts_act_kind_check'
     and pg_get_constraintdef(oid) ~ '''identifier_promotion_confirm''';
  if v_n <> 0 then
    raise exception 'F-A3 PR-3 tail: bank_agent_receipts_act_kind_check admits identifier_promotion_confirm, which has no writer -- law 31' using errcode='CLR10';
  end if;

  -- SS2: the core is the pre-extraction body byte-for-byte -- BUILT, not merely claimed
  -- (review finding 5a: v_pre_sha/v_post_sha were declared and NEVER USED in an earlier
  -- draft, so this prose asserted a proof that never ran; the reviewer mutation-proved the
  -- gap by drifting the anchor and watching replace() silently no-op while the tail still
  -- printed OK). Invert BOTH of SS2's substitutions (the ctx-unpack block, the
  -- entry_post_receipts insert block) and compare the result's sha256 against the
  -- pre-extraction pin measured on a rig held at the exact pre-0129 frontier -- the SAME
  -- method PR-1a's own NINE use (0119:273-280), and the SAME two anchor/ctx pairs SS2's own
  -- splice above used, repeated here rather than shared across do-blocks (PR-1a's own
  -- "repetition is not load-bearing" precedent, 0119:301-303).
  select p.oid, p.prosrc into v_core_oid, v_src from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_book_staff_advance_application_core';
  if v_core_oid is null then
    raise exception 'F-A3 PR-3 tail: clara._book_staff_advance_application_core was not created' using errcode='CLR10';
  end if;
  v_post_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  -- FULL-BLOCK replace, v_ctx2 -> v_anchor2 (SS2's own pair, re-declared here rather than
  -- stripping a trailing fragment): the earlier draft's fragment-strip left a dangling
  -- newline between `v_status := 'posted';` and the removed block, which the pinned sha
  -- never had -- exactly the kind of off-by-one-character gap a byte-identity wall exists
  -- to catch, caught here against the wall's own first real run.
  v_inverted := replace(v_src,
    $c2$    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';
    if coalesce((p_ctx->>'is_agent')::boolean, false) then
      insert into clara.entry_post_receipts(firm_id, client_id, entry_id, acting_actor,
          on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
          maker_active_at_approval, op_key)
        values (c.firm, p_client, v_entry, c.actor,
          nullif(p_ctx->>'on_behalf_of','')::uuid, coalesce(p_ctx->>'wake_kind','bank_agent'),
          coalesce(p_ctx->'model', '{}'::jsonb),
          coalesce(nullif(btrim(p_ctx->>'rationale'),''), 'Staff advance application (agent)'),
          jsonb_build_object('op_key', v_approve_key), 'agent_unattended', null, v_approve_key);
    end if;$c2$,
    $a2$    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';$a2$);
  v_inverted := replace(v_inverted,
    $c1$  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the book_staff_advance_application core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;$c1$,
    '  c := clara._human_ctx(clara.role_rank(''bookkeeper''));');
  v_pre_sha := encode(sha256(convert_to(v_inverted,'UTF8')),'hex');
  if v_pre_sha <> 'a27da323ccc67cb054fd12bb8a618987ff710adcb72cc5456f2b3ea4c96ba17c' then
    raise exception 'F-A3 PR-3 tail: clara._book_staff_advance_application_core is NOT a pure extraction -- inverting both substitutions yields %, but the pinned pre-extraction body was a27da323ccc67cb054fd12bb8a618987ff710adcb72cc5456f2b3ea4c96ba17c -- something other than the two named blocks moved', v_pre_sha
      using errcode='CLR10';
  end if;
  if v_post_sha = v_pre_sha then
    raise exception 'F-A3 PR-3 tail: NON-VACUOUS check failed -- the installed core is byte-identical to the pre-extraction body, meaning neither substitution actually happened' using errcode='CLR10';
  end if;
  if has_function_privilege('public', v_core_oid, 'execute') then
    raise exception 'F-A3 PR-3 tail: clara._book_staff_advance_application_core is reachable by PUBLIC' using errcode='CLR10';
  end if;
  -- Review-round fix (CLR08 the agent-post receipt wall): the core's SECOND substitution --
  -- an is_agent-gated clara.entry_post_receipts insert beside the approve call -- is present.
  -- Structural (a substring probe), not a behavioural re-proof: the behavioural proof that an
  -- agent-authored posted application actually satisfies clara._tf_assert_agent_post_receipt
  -- lives in the test battery (f-a3pr3.mfA.pos), which runs the real wake door end to end.
  if (select p.prosrc from pg_proc p where p.oid = v_core_oid) !~ 'insert into clara\.entry_post_receipts' then
    raise exception 'F-A3 PR-3 tail: clara._book_staff_advance_application_core does not write entry_post_receipts -- an agent-authored post would trip clara._tf_assert_agent_post_receipt (CLR08) at commit' using errcode='CLR10';
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
  -- MF-A (review finding): a granted, EXECUTE-correct wrapper with NO allowlist row is still
  -- fully DOA -- assert_wake_allowed (0004:117-120) is fail-closed and refuses every call with
  -- CLR03 regardless of grants. Proven here as its own claim, never folded into the ACL check
  -- above, because the two failure modes are independent and a reviewer should be able to tell
  -- which one broke from the exception alone.
  if not exists (
    select 1 from clara.wake_fn_allowlist
     where wake_kind = 'bank_agent' and function_name = 'wake_book_staff_advance_application'
  ) then
    raise exception 'F-A3 PR-3 tail: wake_book_staff_advance_application has no bank_agent allowlist row -- assert_wake_allowed refuses every call with CLR03, DOA' using errcode='CLR10';
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

  -- SS4 + the ordering decision (review finding, made permanent here): interactive_client
  -- carries EXACTLY the PRE-deferred-row bank_agent roster (thirteen names) PLUS
  -- wake_open_question, and the two kinds' rosters now differ by EXACTLY one name each way --
  -- bank_agent alone has wake_book_staff_advance_application (deliberately excluded from chat
  -- parity, OQ-6 is scoped to bank-matching); interactive_client alone has wake_open_question
  -- (predates this file). A count alone (14=14) cannot tell "the right one name differs" from
  -- "some other name silently swapped in", so this checks the SET difference by name, not size.
  select array_agg(fn_name order by fn_name) into v_names from (
    select fn_name from clara.wake_fn_allowlist where wake_kind = 'bank_agent'
    except
    select fn_name from clara.wake_fn_allowlist where wake_kind = 'interactive_client'
  ) bank_only;
  if v_names is distinct from array['wake_book_staff_advance_application'] then
    raise exception 'F-A3 PR-3 tail: bank_agent-only roster names is not exactly {wake_book_staff_advance_application} (got %) -- the chat-parity exclusion drifted', v_names using errcode='CLR10';
  end if;
  select array_agg(fn_name order by fn_name) into v_names from (
    select fn_name from clara.wake_fn_allowlist where wake_kind = 'interactive_client'
    except
    select fn_name from clara.wake_fn_allowlist where wake_kind = 'bank_agent'
  ) chat_only;
  if v_names is distinct from array['wake_open_question'] then
    raise exception 'F-A3 PR-3 tail: interactive_client-only roster names is not exactly {wake_open_question} (got %) -- a bank_agent wrapper still lacks its interactive_client row', v_names using errcode='CLR10';
  end if;

  -- clara._settle_from_bank_line_core's p_via_rule parameter (NOTE, review round): with the
  -- 13-arg rule-arity wrapper gone, NO live caller can ever pass it non-null again. Dropping
  -- the parameter from a shared, already-live core is a body recut this PR does not own;
  -- pinning that every live caller passes NULL is the cheaper, safer proof that the
  -- vestigial parameter carries no live semantic weight -- a structural census, not a
  -- behavioural change.
  select count(*)::int into v_n from (values
    ('settle_from_bank_line'), ('_resolve_and_book_bank_line_core'), ('_agent_settle_from_bank_line_core')
  ) as callers(name)
  where not exists (
    select 1 from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname = callers.name
      and p.prosrc ~ '_settle_from_bank_line_core\([\s\S]*?,\s*null\)\s*;'
  );
  if v_n <> 0 then
    raise exception 'F-A3 PR-3 tail: % of _settle_from_bank_line_core''s three direct callers do NOT visibly end their call with a literal null p_via_rule -- re-verify by hand, the vestigial-parameter claim may no longer hold', v_n using errcode='CLR10';
  end if;

  raise notice 'F-A3 PR-3 tail: OK -- 11 rule-machine functions dropped (match_bank_line/6 and settle_from_bank_line/12 the human arities untouched), 5 helpers kept and still resolving, bank_agent_receipts_act_kind_check widened to admit staff_advance_application only (identifier_promotion_confirm deliberately excluded, no writer), book_staff_advance_application factored onto the PR-1a wake shape (core ungranted, wrapper unmoved, clara_authenticated EXECUTE intact), wake_book_staff_advance_application + its agent core live and clara_wake_bank-only, confirm_bank_identifier_promotion + its core live (clara_authenticated-only / ungranted-core), interactive_client carries the PRE-staff-advance bank_agent roster (chat parity deliberately excludes wake_book_staff_advance_application, the ordering decision). No table in workflow/graphile_worker/spike touched. D1 write-quiesce: book_staff_advance_application replaced in place per SS0''s inventory; every other body in this file is newly created, no quiesce owed.';
end
$fa3pr3_tail$;

-- =====================================================================================
-- SS-TAIL D1 INVENTORY -- the eleven dropped bodies, one notice per name, each carrying the
-- exact pinned pre-drop prosrc sha256 SS0 proved it read (short form: first 12 hex chars is
-- enough to eyeball-diff against SS0's insert; the full 64-char pin is what the prestate
-- actually checked). This is the D1 write-quiesce record a reviewer reads, not a re-proof --
-- SS0 already proved the pin; this just puts it in the transcript beside its signature.
-- =====================================================================================
do $fa3pr3_tail_d1$
declare t record;
begin
  for t in select * from fa3pr3_drop_targets order by sig loop
    raise notice 'F-A3 PR-3 D1 drop: % -- pre-drop prosrc sha256 %', t.sig, t.sha;
  end loop;
end
$fa3pr3_tail_d1$;
