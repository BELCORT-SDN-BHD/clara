-- 0148_promotion_dup_open_wall.sql -- MBB-7(a) (PROGRESS.md "Known issues", 2026-08-29
-- dawn reviews item 3; owner batch item 12): the two agent PROPOSAL doors get a STRUCTURAL
-- duplicate-open wall. Number CLAIMED at merge prep 2026-08-29: 0148, one past the live
-- frontier 0147 (standing law, AGENTS.md + .claude/rules/db-migrations.md); rig-replayed as
-- 0153 during the build and by the independent review against the same 0147 chain -- the
-- number is comment-only, the body is byte-identical to the reviewed file.
--
-- =====================================================================================
-- THE GAP THIS FILE CLOSES -- MEASURED, NOT ASSUMED
-- =====================================================================================
-- (A) DOOR 1 -- clara.wake_propose_identifier_promotion (the 9-arg 裁-22 body, 0143:437-496)
--     -> clara._identifier_promotion_core (0103:833-864). There is NO duplicate-open wall of
--     any kind on this path:
--       * `ix_client_identifier_promotions_open` (0103:830-831) is a PLAIN index on
--         (firm_id, proposed_at desc) where status = 'proposed' -- it orders a firm's open
--         cards for a human read; it constrains NOTHING. The prestate below reads its
--         `indisunique` from the live catalog rather than trusting this sentence.
--       * `_identifier_promotion_core` INSERTs unconditionally -- no `if exists` check, no
--         `for update` on any row two callers would contend for.
--       * `clara.confirm_identifier_promotion` DERIVES its inner op_key from the outer one
--         (`p_op_key || ':add_client_identifier'`, 0103:889-890), so two cards confirmed under
--         two DIFFERENT outer op_keys mint two DIFFERENT inner reservations and both write.
--       * `clara.add_client_identifier` (0007:1508-1529) has no existence check, and
--         `clara.client_identifiers` carries no unique constraint BY DESIGN (0007:235,
--         "sibling-client conflicts must be representable") -- so nothing downstream catches
--         it either.
--     Net: two proposals for the same (firm, client, kind, value) are BOTH admitted, and both
--     can be confirmed into two identical identity rows that attribution then matches on.
--
-- (B) DOOR 2 -- clara.wake_propose_client_onboarding (the 裁-22 body, 0143:521-654). Its
--     duplicate-open wall (0142:456-461, carried verbatim into 0143:599-604) is a BODY CHECK:
--       if exists (select 1 from clara.firm_open_questions q
--                   where q.document_id = p_document and q.kind = 'onboarding_proposed'
--                     and q.status = 'open') then raise ... already_open
--     TWO SEPARATE FACTS, measured independently rather than lumped together:
--       B1. Against a CONCURRENT SECOND CALL OF THE SAME DOOR the check is in fact already
--           race-safe, and this file does not claim otherwise: the `select ... from
--           clara.documents where id = p_document for update` immediately above it
--           (0143:586) serializes both callers on the document row, so the loser re-reads the
--           winner's committed question and refuses. 0142's own comment at :438-440 says
--           exactly this, and the rig cell `race-b` below PROVES it (an observed block, then
--           the body check's own already_open) instead of taking the comment's word.
--       B2. It is NOT the only writer of that kind. `clara.wake_open_firm_question`
--           (0126:1541-1586) takes a CALLER-SUPPLIED `p_kind` and validates it against nothing
--           but the table CHECK -- which 0142:222 widened to admit 'onboarding_proposed'. That
--           path holds no document lock, runs no duplicate-open check, and demands no egress
--           authorization, so it can open a SECOND open onboarding proposal on a document that
--           already has one. That is not a race; it is a second door onto the same invariant,
--           and no body check placed in Door 2 can ever see it.
--     So Door 2's invariant gets the same structural treatment as Door 1's: an index, which is
--     the only wall that binds every writer including ones not yet written.
--
-- =====================================================================================
-- WHAT THIS FILE SHIPS
-- =====================================================================================
--   1. `uq_client_identifier_promotions_open_subject` -- partial UNIQUE on
--      clara.client_identifier_promotions (firm_id, client_id, kind, value_normalized)
--      where status = 'proposed'. The pre-existing NON-unique
--      `ix_client_identifier_promotions_open` is KEPT untouched (a different access pattern:
--      one firm's open cards, newest first) and re-censused at the tail.
--   2. `uq_firm_open_questions_onboarding_open` -- partial UNIQUE on
--      clara.firm_open_questions (document_id)
--      where kind = 'onboarding_proposed' and status = 'open'. Keyed on document_id ALONE, so
--      the index's scope is BYTE-CONGRUENT with the body check it backs (which also keys on
--      document_id alone) -- a wider key would refuse in a different set of cases than the
--      body check and the two would drift. `firm_open_questions`' composite FK
--      (document_id, firm_id) -> documents(id, firm_id) over a PK'd documents.id makes a
--      document single-firm anyway, so firm_id in the key would add scope, not safety.
--   3. The `unique_violation` -> TYPED REFUSAL map, the same shape the sibling door
--      `clara.propose_vendor_identity_binding` has carried since 0028:758-772 (wrap the write,
--      `exception when unique_violation then raise <typed>`). Placed at DIFFERENT layers on
--      the two doors, for a MEASURED reason, not for symmetry's sake:
--        * Door 1's map lives in the WRAPPER, `wake_propose_identifier_promotion`.
--          `_identifier_promotion_core` has EXACTLY ONE caller in the whole catalog (the
--          prestate censuses pg_proc.prosrc for it and refuses if that is ever untrue), and
--          0143's header makes the core's byte-identity a standing commitment -- "it stays the
--          dumb, trusting INSERT it always was". This file honours that: the core's prosrc
--          sha is pinned in the prestate and re-proven byte-identical at the tail.
--        * Door 2's map lives in the SHARED CORE, `_firm_question_core`, because that core has
--          FOUR callers and (B2 above) at least one of them can write the guarded kind. A
--          wrapper-only map would let a raw, untyped 23505 escape through
--          `wake_open_firm_question` -- the exact "must not surface as a raw error" class the
--          裁-22 battery already guards elsewhere. Every caller therefore gets the typed
--          refusal, and the message + detail are BYTE-IDENTICAL to Door 2's own body check, so
--          a caller cannot tell which rung caught it -- which is the correct contract: the
--          index does not add a new refusal, it makes the existing one unevadable.
--      Both handlers are NARROW: they read `constraint_name` out of the stacked diagnostics
--      and re-`raise` unchanged unless it is exactly their own index. An unrelated
--      unique_violation is never swallowed or relabelled.
--
-- WHAT THIS FILE DOES NOT DO. It never dedupes. If duplicate open rows already exist when this
-- migration is applied, the PRESTATE REFUSES with a named reason and prints the offending
-- groups -- because which of two duplicate cards survives is a professional judgement (one may
-- carry the better citation), not a migration's call. The operator's recipe is in the refusal's
-- own HINT: settle all but one card in each group through the real audited doors
-- (`clara.confirm_identifier_promotion` / `clara.decline_identifier_promotion`, or
-- `clara.resolve_firm_question` / `clara.dismiss_firm_question`), then re-run. On every rig
-- and on the live estate as measured at authoring the count is ZERO; the pre-flight exists for
-- the case where it is not, and its census count is printed either way.
--
-- =====================================================================================
-- D1 WRITE-QUIESCE INVENTORY -- TWO LIVE AUDITED WRITER BODIES REPLACED
-- =====================================================================================
-- Both are CREATE OR REPLACE at an UNCHANGED signature, so no overload is shadowed, no ACL
-- moves, and no allowlist row is touched:
--   1. clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)
--      -- credential class: `clara_wake_filing` EXCLUSIVELY (0143:505-507).
--   2. clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)
--      -- UNGRANTED (0103:1034); reachable only through its wrapper set, whose own reach the
--      tail re-censuses live rather than restating from this comment.
-- SEVERITY, stated so the ceremony can size the window honestly: a call that spans this
-- migration finishes on the OLD body, which has no handler -- so in the one narrow case where
-- that in-flight call ALSO loses a duplicate race against the brand-new index, its caller sees
-- a raw 23505 instead of the typed CLR10. No row is written, nothing is corrupted, no wall is
-- skipped -- the refusal is merely untyped for that one call. A D1 window is still taken:
-- the obligation is mechanical (packages/db/README.md "Deploy contract"), not severity-tiered.
-- `clara._identifier_promotion_core` is explicitly NOT in this inventory -- untouched, its
-- prosrc sha re-pinned byte-identical at the tail.
--
-- NO NEW `clara_authenticated` DOOR. .claude/rules/db-migrations.md's frontend-home rule does
-- not engage: this file adds no function and grants no role anything. Its two indexes and two
-- recut bodies are invisible to the toolface except as a refusal that already had a name.

-- Precautionary, not load-bearing: both tables are small (the live census below prints their
-- real cardinality) and each CREATE INDEX is a sub-second pass. The cap exists so a surprise
-- lock wait fails the migration loudly instead of holding a deploy window open.
set local statement_timeout = '5min';

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $pre$
declare
  v_src text; v_n int; v_dups int; v_list text; v_pred text;
begin
  -- 0.1 Dependencies. NOT a frontier equality: sibling lanes claim numbers concurrently, so
  -- this file names the migrations whose OBJECTS it edits, and nothing more.
  if not exists (select 1 from clara.schema_migrations where version = '0143_proposal_basis_resolved') then
    raise exception 'promotion_dup_open_wall prestate: 0143_proposal_basis_resolved is not applied -- Door 1''s 9-arg body and Door 2''s recut are this file''s edit targets'
      using errcode = 'CLR10';
  end if;

  -- 0.2 Already applied? Fail loudly rather than half-apply.
  if to_regclass('clara.uq_client_identifier_promotions_open_subject') is not null
     or to_regclass('clara.uq_firm_open_questions_onboarding_open') is not null then
    raise exception 'promotion_dup_open_wall prestate: one of this file''s indexes already exists -- already applied'
      using errcode = 'CLR10';
  end if;

  -- 0.3 THE CENTRAL MEASURED CLAIM: the pre-existing open-card index is NOT unique. Read from
  -- pg_index, never from the file that created it.
  if to_regclass('clara.ix_client_identifier_promotions_open') is null then
    raise exception 'promotion_dup_open_wall prestate: ix_client_identifier_promotions_open is absent -- the premise this file was authored against has moved'
      using errcode = 'CLR10';
  end if;
  if (select i.indisunique from pg_index i
       where i.indexrelid = 'clara.ix_client_identifier_promotions_open'::regclass) then
    raise exception 'promotion_dup_open_wall prestate: ix_client_identifier_promotions_open is ALREADY unique -- the gap this file closes does not exist as described'
      using errcode = 'CLR10';
  end if;
  -- ...and neither of the two target tables already carries ANY unique index (constraint-backed
  -- or bare) whose key is the one this file is about to claim. `unique (id, firm_id)` on both
  -- tables is a different key and is expected to be found; it is not counted here.
  select count(*) into v_n from pg_index i
   where i.indrelid = 'clara.client_identifier_promotions'::regclass and i.indisunique
     and i.indpred is not null;
  if v_n <> 0 then
    raise exception 'promotion_dup_open_wall prestate: client_identifier_promotions already carries % PARTIAL unique index(es) -- unexpected, refusing rather than layering a second', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_index i
   where i.indrelid = 'clara.firm_open_questions'::regclass and i.indisunique
     and i.indpred is not null;
  if v_n <> 0 then
    raise exception 'promotion_dup_open_wall prestate: firm_open_questions already carries % PARTIAL unique index(es) -- unexpected, refusing rather than layering a second', v_n
      using errcode = 'CLR10';
  end if;

  -- 0.4 The columns the new keys name really exist, spelled exactly this way (law 3: spelling
  -- is not identity -- these were READ from 0103:796-826, and are re-read here from the live
  -- catalog so a rename between authoring and deploy refuses instead of creating a wrong key).
  select count(*) into v_n from pg_attribute
   where attrelid = 'clara.client_identifier_promotions'::regclass and attnum > 0 and not attisdropped
     and attname in ('firm_id','client_id','kind','value_normalized','status');
  if v_n <> 5 then
    raise exception 'promotion_dup_open_wall prestate: client_identifier_promotions does not carry all five named columns (found %)', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_attribute
   where attrelid = 'clara.firm_open_questions'::regclass and attnum > 0 and not attisdropped
     and attname in ('document_id','kind','status');
  if v_n <> 3 then
    raise exception 'promotion_dup_open_wall prestate: firm_open_questions does not carry all three named columns (found %)', v_n
      using errcode = 'CLR10';
  end if;
  -- 'onboarding_proposed' is really in the live kind vocabulary -- otherwise the second index's
  -- predicate would be permanently vacuous and would prove nothing while looking like a wall.
  if position('onboarding_proposed' in (
       select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'clara.firm_open_questions'::regclass
          and conname = 'firm_open_questions_kind_check')) = 0 then
    raise exception 'promotion_dup_open_wall prestate: firm_open_questions'' kind CHECK does not admit ''onboarding_proposed'' -- the second index''s predicate would be vacuous'
      using errcode = 'CLR10';
  end if;

  -- 0.5 THE PRE-FLIGHT. Duplicate OPEN rows are a refusal with a named reason, NEVER a silent
  -- dedupe: which of two duplicate cards survives is a professional judgement (one may carry
  -- the better citation), not a migration's call.
  select count(*), coalesce(string_agg(format('(client=%s kind=%s value=%s n=%s)', client_id, kind, value_normalized, n), ', '), '')
    into v_dups, v_list
    from (select client_id, kind, value_normalized, count(*) as n
            from clara.client_identifier_promotions
           where status = 'proposed'
           group by firm_id, client_id, kind, value_normalized
          having count(*) > 1) g;
  if v_dups > 0 then
    raise exception 'promotion_dup_open_wall prestate: % duplicate OPEN promotion group(s) already exist and must be settled by a human before this wall can be raised: %', v_dups, v_list
      using errcode = 'CLR10',
        hint = 'This migration NEVER dedupes -- which duplicate card survives is a professional judgement. Settle all but one card in each group through the real audited doors (clara.confirm_identifier_promotion / clara.decline_identifier_promotion), then re-run.';
  end if;
  select count(*), coalesce(string_agg(format('(document=%s n=%s)', document_id, n), ', '), '')
    into v_dups, v_list
    from (select document_id, count(*) as n
            from clara.firm_open_questions
           where kind = 'onboarding_proposed' and status = 'open'
           group by document_id
          having count(*) > 1) g;
  if v_dups > 0 then
    raise exception 'promotion_dup_open_wall prestate: % document(s) already carry more than one OPEN onboarding_proposed question and must be settled by a human before this wall can be raised: %', v_dups, v_list
      using errcode = 'CLR10',
        hint = 'This migration NEVER dedupes. Settle all but one question per document through the real audited doors (clara.resolve_firm_question / clara.dismiss_firm_question), then re-run.';
  end if;

  -- 0.6 The two bodies being REPLACED, pinned by exact prosrc sha256 (the 0090/0143 idiom), and
  -- the one body that must come out BYTE-IDENTICAL.
  create temp table _promo_dup_pre(k text primary key, v text);

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure;
  if v_src is null then
    raise exception 'promotion_dup_open_wall prestate: the live 9-arg wake_propose_identifier_promotion is GONE' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> 'b43651078c55fb09b38be9486951ff7b69ff639ea38151c0cc2ec588f18f0be7' then
    raise exception 'promotion_dup_open_wall prestate: wake_propose_identifier_promotion prosrc sha256 mismatch (got %, expected b43651078c55fb09b38be9486951ff7b69ff639ea38151c0cc2ec588f18f0be7)',
      encode(sha256(convert_to(v_src,'UTF8')),'hex') using errcode = 'CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'::regprocedure;
  if v_src is null then
    raise exception 'promotion_dup_open_wall prestate: clara._firm_question_core is GONE' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> 'c494bad00c6c2326ab037ed0185caa8d611240bff68d4feb08fb4f6fe7f91839' then
    raise exception 'promotion_dup_open_wall prestate: _firm_question_core prosrc sha256 mismatch (got %, expected c494bad00c6c2326ab037ed0185caa8d611240bff68d4feb08fb4f6fe7f91839)',
      encode(sha256(convert_to(v_src,'UTF8')),'hex') using errcode = 'CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)'::regprocedure;
  if v_src is null then
    raise exception 'promotion_dup_open_wall prestate: clara._identifier_promotion_core is GONE' using errcode = 'CLR10';
  end if;
  insert into _promo_dup_pre values ('core_sha', encode(sha256(convert_to(v_src,'UTF8')),'hex'));

  -- 0.7 THE GROUND for putting Door 1's handler in the WRAPPER rather than in the core: the
  -- core has EXACTLY ONE caller in the entire catalog. Measured over pg_proc.prosrc, not
  -- assumed from a header. If a second caller ever appears this refuses, and whoever adds it
  -- must decide deliberately where the map belongs.
  --
  -- SPELLING IS NOT IDENTITY (review law 3), learned HERE, on the rig, not in review: a bare
  -- `position('_identifier_promotion_core' in prosrc)` census returns THREE, because
  -- `clara.wake_propose_bank_identifier_promotion` and `clara.confirm_bank_identifier_promotion`
  -- call `_agent_propose_bank_identifier_promotion_core` / `_confirm_bank_identifier_promotion_
  -- core` -- two DIFFERENT functions on the F-A3 bank lane whose names merely CONTAIN this
  -- one's as a substring. The instrument below matches a QUALIFIED CALL (`clara.` + the exact
  -- name + `(`, with a non-identifier character or start-of-body in front), which the two
  -- decoys cannot satisfy: their own qualified spelling carries `_agent_propose_bank`/`_confirm_
  -- bank` between the schema and this name. It over-counts only on a COMMENT that spells a
  -- qualified call, which fails CLOSED (this refuses, a human looks) -- the safe direction.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.oid <> 'clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)'::regprocedure
     and p.prosrc ~ '(^|[^A-Za-z0-9_])clara\._identifier_promotion_core[[:space:]]*\(';
  if v_n <> 1 then
    raise exception 'promotion_dup_open_wall prestate: expected EXACTLY ONE caller of clara._identifier_promotion_core, found % -- Door 1''s wrapper-level handler would no longer cover every path', v_n
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = 'wake_propose_identifier_promotion'
        and p.prosrc ~ '(^|[^A-Za-z0-9_])clara\._identifier_promotion_core[[:space:]]*\(') then
    raise exception 'promotion_dup_open_wall prestate: the one caller of clara._identifier_promotion_core is not wake_propose_identifier_promotion'
      using errcode = 'CLR10';
  end if;

  -- 0.8 The ACLs both recut bodies must come out of this file still carrying, captured as text
  -- so the tail's comparison is a real before/after, not a re-assertion of an expectation.
  insert into _promo_dup_pre
  select 'd1_acl', coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure)) a
     order by 1), ','), '(none)');
  insert into _promo_dup_pre
  select 'fqc_acl', coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'::regprocedure)) a
     order by 1), ','), '(none)');

  -- 0.9 The pre-existing non-unique index's own predicate, captured so the tail proves this
  -- file left it alone rather than quietly replacing it.
  select pg_get_expr(i.indpred, i.indrelid) into v_pred from pg_index i
   where i.indexrelid = 'clara.ix_client_identifier_promotions_open'::regclass;
  insert into _promo_dup_pre values ('old_ix_pred', coalesce(v_pred, '(none)'));

  raise notice 'promotion_dup_open_wall prestate: clean -- 0143 applied; ix_client_identifier_promotions_open present and NON-unique (indisunique=false, predicate %); neither target table carries a partial unique index; all named columns present and onboarding_proposed is in the live kind vocabulary; ZERO duplicate open promotion groups and ZERO documents with >1 open onboarding_proposed question; both bodies to be replaced pinned by exact prosrc sha256 and their ACLs captured; _identifier_promotion_core pinned as the DO-NOT-TOUCH baseline with its caller census reading exactly 1 (wake_propose_identifier_promotion)', v_pred;
end
$pre$;

-- =====================================================================================
-- SECTION 1 -- THE TWO STRUCTURAL WALLS.
-- =====================================================================================
set role clara_fn_owner;

-- Door 1's wall. The key is the SUBJECT of a promotion -- the (firm, client, kind, value) tuple
-- a card promises to write -- and the predicate is exactly the card's OPEN state, so settling a
-- card (confirm or decline) frees the slot for an honest re-proposal, while two cards racing on
-- the same subject cannot both be open. `value_normalized` (never a raw `value`) is the right
-- column precisely because the core normalises before it inserts (0103:847, byte-identical to
-- add_client_identifier's own normalisation): two spellings of one identifier are one subject.
create unique index uq_client_identifier_promotions_open_subject
  on clara.client_identifier_promotions (firm_id, client_id, kind, value_normalized)
  where status = 'proposed';
comment on index clara.uq_client_identifier_promotions_open_subject is
  'MBB-7(a): at most ONE open identifier-promotion card per (firm, client, kind, normalised '
  'value). The structural wall behind wake_propose_identifier_promotion -- 0103 shipped only '
  'the NON-unique ix_client_identifier_promotions_open, which orders a firm''s open cards and '
  'constrains nothing. Settling a card (confirmed/declined) leaves the predicate and frees the '
  'slot, which is why an honest re-proposal after a decline is still admitted.';

-- Door 2's wall. Keyed on document_id ALONE so its scope is byte-congruent with the body check
-- it backs (0143:599-604, itself 0142:456-461); see the header for why firm_id is not in the
-- key. This index -- not the body check -- is what binds clara.wake_open_firm_question, whose
-- caller-supplied p_kind can be 'onboarding_proposed' and which holds no document lock.
create unique index uq_firm_open_questions_onboarding_open
  on clara.firm_open_questions (document_id)
  where kind = 'onboarding_proposed' and status = 'open';
comment on index clara.uq_firm_open_questions_onboarding_open is
  'MBB-7(a): at most ONE OPEN onboarding_proposed question per document, for EVERY writer -- '
  'including clara.wake_open_firm_question, which takes a caller-supplied kind and which Door '
  '2''s own body check can never see. Resolving or dismissing the question leaves the '
  'predicate and frees the slot.';

reset role;

-- =====================================================================================
-- SECTION 2 -- DOOR 1's TYPED REFUSAL. CREATE OR REPLACE at the UNCHANGED 9-arg signature, so
-- the ACL and the filing-allowlist row are preserved by construction. Every rung of the 裁-22
-- body below is byte-preserved; the ONLY change is the begin/exception block around the
-- `_identifier_promotion_core` call and the `v_con` declaration it needs.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.wake_propose_identifier_promotion(
    p_client uuid, p_document uuid, p_kind text, p_value text, p_sightings int, p_citations jsonb,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare w record; v_dedupe jsonb; v_id uuid; v_resolved jsonb; v_con text;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_propose_identifier_promotion');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'op_key is required' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  -- Added on independent review (N-1): this wrapper was the only one of the five lacking the
  -- typed blank-rationale / incomplete-model CLR10 checks its siblings all carry.
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended identifier promotion must state its rationale' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  if p_model is null or jsonb_typeof(p_model) <> 'object'
     or nullif(btrim(coalesce(p_model->>'provider','')),'') is null
     or nullif(btrim(coalesce(p_model->>'model','')),'') is null
     or nullif(btrim(coalesce(p_model->>'version','')),'') is null then
    raise exception 'an unattended identifier promotion must name its model (provider, model, version)'
      using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"model_snapshot","constraint":"provider+model+version"}';
  end if;
  -- 裁-22: the triggering document, NEW in this signature -- the resolver needs it to know
  -- which document's regions a citation may legally name.
  if p_document is null then
    raise exception 'an identifier promotion needs the triggering document' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"document"}';
  end if;
  -- Codex HIGH-1 (2026-08-29, ruled): the fingerprint MUST cover the basis, not just
  -- client/document/kind/value -- otherwise a replay of op_key O carrying a foreign/superseded/
  -- null citation would return Door 1's CACHED SUCCESS for the genuine first call (line below,
  -- `if v_dedupe is not null then return v_dedupe`) instead of either `op_key reused with
  -- different args` (clara._reserve_op's own contract, 0004:43-58) or the resolver's own
  -- `basis_unresolved` -- a caller could silently launder a bad citation through a stale op_key.
  -- Door 2 has always fingerprinted its own basis (`'basis', p_basis` below); this makes Door 1
  -- match it exactly. p_citations is passed straight through (already jsonb -- Postgres jsonb
  -- storage is itself canonical: the SAME value always serializes to the SAME text via `::text`,
  -- which is all `clara._hash` reads, regardless of the caller's own key/whitespace formatting).
  v_dedupe := clara._reserve_op(w.firm_id,'wake_propose_identifier_promotion',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'document',p_document,'kind',p_kind,
      'value',p_value,'sightings',p_sightings,'citations',p_citations)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- 裁-22: RESOLUTION AFTER RESERVATION, deliberately. A single-document door passes its one
  -- document as a one-element set (裁-18b's own widening, header above).
  v_resolved := clara._resolve_proposal_basis(array[p_document], w.firm_id,
    jsonb_build_object('sightings', p_sightings, 'citations', p_citations));
  -- Codex HIGH-2 (2026-08-29, ruled): p_sightings' raw value is used ABOVE only to build the
  -- resolver's input (which the resolver ignores -- it derives its own count) and is written to
  -- NO durable column anywhere -- `sightings` below is always v_resolved's DERIVED count alone.
  --
  -- MBB-7(a): the duplicate-open wall is the partial unique index
  -- `uq_client_identifier_promotions_open_subject`, and THIS is where its 23505 becomes the
  -- estate's typed refusal -- the same shape clara.propose_vendor_identity_binding has carried
  -- since 0028:758-772. The map lives here, in the wrapper, rather than in the core because
  -- `_identifier_promotion_core` has exactly one caller (this function; the migration's
  -- prestate censuses pg_proc for it) and 0143 committed to that core staying byte-identical.
  -- The handler is NARROW: any unique_violation that is not this index's is re-raised
  -- untouched, so an unrelated collision is never swallowed or relabelled.
  begin
    v_id := clara._identifier_promotion_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of,
      w.wake_kind, p_client, p_kind, p_value,
      (v_resolved->>'sightings')::int, v_resolved->'citations', p_rationale, p_model);
  exception when unique_violation then
    get stacked diagnostics v_con = constraint_name;
    if v_con is distinct from 'uq_client_identifier_promotions_open_subject' then raise; end if;
    raise exception 'an identifier promotion is already open for this client, kind and value'
      using errcode='CLR10',
        detail='{"reason":"already_open","class":"identifier_promotion"}';
  end;
  return clara._finish_op(w.firm_id,'wake_propose_identifier_promotion',p_op_key,
    jsonb_build_object('promotion_id', v_id));
end $fn$;
comment on function clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text) is
  '裁-22: gains p_document (the triggering document) and DB-resolves p_citations against it via '
  'clara._resolve_proposal_basis (called array[p_document]-wrapped, after _reserve_op, whose '
  'own fingerprint now covers sightings+citations too -- Codex HIGH-1). '
  'client_identifier_promotions.sightings is DB-derived and is the ONLY sightings any durable '
  'row carries -- the caller''s raw claim is persisted nowhere (Codex HIGH-2). Every prior wall '
  '(op_key/rationale/model shape) is byte-preserved from the pre-裁-22 8-arg body. Delegates to '
  'the UNTOUCHED clara._identifier_promotion_core (0103), which stays reachable by nobody else. '
  'MBB-7(a): a SECOND open card for the same (firm, client, kind, normalised value) refuses '
  'CLR10/already_open -- the partial unique index uq_client_identifier_promotions_open_subject '
  'is the wall, this body only gives its 23505 the estate''s typed name (0028''s own idiom), '
  'and only for that one index.';

reset role;

-- =====================================================================================
-- SECTION 3 -- DOOR 2's TYPED REFUSAL, in the SHARED core. CREATE OR REPLACE at the UNCHANGED
-- signature (ungranted, so there is no ACL to preserve, but the tail proves it stayed that
-- way). Every rung of 0103's body is byte-preserved; the ONLY change is the begin/exception
-- block around the INSERT and the `v_con` declaration it needs. Door 2's own body check
-- (0143:599-604) is deliberately LEFT IN PLACE and untouched: it is the fast, specific,
-- lock-serialized refusal for the common case, and this handler is the backstop that also
-- covers the writers it cannot see.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._firm_question_core(
    p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text,
    p_document uuid, p_kind text, p_question text, p_candidates jsonb, p_receipt text)
  returns uuid language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_id uuid; v_con text;
begin
  if p_actor is null or p_firm is null or p_document is null
     or nullif(btrim(coalesce(p_question, '')), '') is null
     or p_kind is null then
    raise exception 'firm question is malformed' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"firm_question"}';
  end if;
  if p_candidates is not null and jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'firm question candidates must be a json array' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"candidates","constraint":"array"}';
  end if;
  -- Same-firm, and the document must exist. CLR11 rather than CLR10: a cross-firm document
  -- is an authority failure, not a malformed request.
  if not exists (select 1 from clara.documents d where d.id = p_document and d.firm_id = p_firm) then
    raise exception 'document not found in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"document"}';
  end if;
  -- MBB-7(a): the map from uq_firm_open_questions_onboarding_open's 23505 to the estate's typed
  -- refusal lives HERE, in the shared core, and not in Door 2's wrapper -- because this core has
  -- four callers and clara.wake_open_firm_question takes a caller-supplied p_kind that the table
  -- CHECK admits as 'onboarding_proposed'. A wrapper-only map would let a raw, untyped 23505
  -- escape through that path. The message and detail are BYTE-IDENTICAL to Door 2's own body
  -- check (0142:456-461, carried into 0143:599-604), so the index does not add a new refusal --
  -- it makes the existing one unevadable. NARROW by construction: any other unique_violation is
  -- re-raised untouched.
  begin
    insert into clara.firm_open_questions(firm_id, document_id, kind, question_text,
        candidates, opened_by, receipt_id)
      values (p_firm, p_document, p_kind, btrim(p_question),
              coalesce(p_candidates, '[]'::jsonb), p_actor, nullif(btrim(coalesce(p_receipt,'')), ''))
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_con = constraint_name;
    if v_con is distinct from 'uq_firm_open_questions_onboarding_open' then raise; end if;
    raise exception 'an onboarding proposal is already open for this document' using errcode = 'CLR10',
      detail = '{"reason":"already_open","class":"onboarding_proposed"}';
  end;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'open_firm_question', null,
    jsonb_build_object('question', v_id, 'document', p_document, 'kind', p_kind,
                       'candidate_count', jsonb_array_length(coalesce(p_candidates, '[]'::jsonb))));
  return v_id;
end $fn$;
comment on function clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text) is
  'F-A7 pi: the ungranted carrier every firm-question wrapper writes through. MBB-7(a): a '
  'second OPEN onboarding_proposed question on a document refuses CLR10/already_open here, in '
  'the shared core -- the wall is the partial unique index '
  'uq_firm_open_questions_onboarding_open, and this body only gives its 23505 the estate''s '
  'typed name, byte-identically to Door 2''s own body check. Placed in the core rather than in '
  'a wrapper because clara.wake_open_firm_question takes a caller-supplied kind that Door 2''s '
  'body check can never see. Every other unique_violation is re-raised untouched.';

reset role;

-- =====================================================================================
-- SECTION 4 -- TAIL. Every claim re-read from the live catalog, BY PROPERTY (indisunique /
-- indisvalid / predicate text / key column list), never by name alone -- an index named `uq_*`
-- that is not actually unique is exactly the failure this census exists to catch.
-- =====================================================================================
do $tail$
declare
  v_src text; v_sha text; v_n int; v_pred text; v_cols text; v_acl text; v_pre text;
  v_promo_rows int; v_open_cards int; v_q_rows int; v_open_onb int;
  v_reach text; v_uniq boolean;
begin
  -- (1) Door 1's index, by property.
  if to_regclass('clara.uq_client_identifier_promotions_open_subject') is null then
    raise exception 'promotion_dup_open_wall tail: uq_client_identifier_promotions_open_subject does not resolve' using errcode = 'CLR10';
  end if;
  select i.indisunique::text || '|' || i.indisvalid::text || '|' || i.indisready::text || '|' || i.indislive::text,
         pg_get_expr(i.indpred, i.indrelid),
         (select string_agg(a.attname, ',' order by k.ord)
            from unnest(i.indkey::smallint[]) with ordinality k(att, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.att)
    into v_src, v_pred, v_cols
    from pg_index i where i.indexrelid = 'clara.uq_client_identifier_promotions_open_subject'::regclass;
  if v_src <> 'true|true|true|true' then
    raise exception 'promotion_dup_open_wall tail: uq_client_identifier_promotions_open_subject is not unique+valid+ready+live (got %)', v_src using errcode = 'CLR10';
  end if;
  if v_cols is distinct from 'firm_id,client_id,kind,value_normalized' then
    raise exception 'promotion_dup_open_wall tail: uq_client_identifier_promotions_open_subject key columns are % , expected firm_id,client_id,kind,value_normalized', coalesce(v_cols,'(none)') using errcode = 'CLR10';
  end if;
  if v_pred is distinct from '(status = ''proposed''::text)' then
    raise exception 'promotion_dup_open_wall tail: uq_client_identifier_promotions_open_subject predicate is % , expected (status = ''proposed''::text)', coalesce(v_pred,'(none)') using errcode = 'CLR10';
  end if;

  -- (2) Door 2's index, by property.
  if to_regclass('clara.uq_firm_open_questions_onboarding_open') is null then
    raise exception 'promotion_dup_open_wall tail: uq_firm_open_questions_onboarding_open does not resolve' using errcode = 'CLR10';
  end if;
  select i.indisunique::text || '|' || i.indisvalid::text || '|' || i.indisready::text || '|' || i.indislive::text,
         pg_get_expr(i.indpred, i.indrelid),
         (select string_agg(a.attname, ',' order by k.ord)
            from unnest(i.indkey::smallint[]) with ordinality k(att, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.att)
    into v_src, v_pred, v_cols
    from pg_index i where i.indexrelid = 'clara.uq_firm_open_questions_onboarding_open'::regclass;
  if v_src <> 'true|true|true|true' then
    raise exception 'promotion_dup_open_wall tail: uq_firm_open_questions_onboarding_open is not unique+valid+ready+live (got %)', v_src using errcode = 'CLR10';
  end if;
  if v_cols is distinct from 'document_id' then
    raise exception 'promotion_dup_open_wall tail: uq_firm_open_questions_onboarding_open key columns are % , expected document_id', coalesce(v_cols,'(none)') using errcode = 'CLR10';
  end if;
  if v_pred is distinct from '((kind = ''onboarding_proposed''::text) AND (status = ''open''::text))' then
    raise exception 'promotion_dup_open_wall tail: uq_firm_open_questions_onboarding_open predicate is % , expected ((kind = ''onboarding_proposed''::text) AND (status = ''open''::text))', coalesce(v_pred,'(none)') using errcode = 'CLR10';
  end if;

  -- (3) The pre-existing NON-unique open-card index is UNTOUCHED -- still present, still not
  -- unique, same predicate as the prestate read. A file that "added" a unique wall by silently
  -- promoting the existing index would pass every check above and fail this one.
  if to_regclass('clara.ix_client_identifier_promotions_open') is null then
    raise exception 'promotion_dup_open_wall tail: ix_client_identifier_promotions_open disappeared' using errcode = 'CLR10';
  end if;
  select i.indisunique, pg_get_expr(i.indpred, i.indrelid) into v_uniq, v_pred
    from pg_index i where i.indexrelid = 'clara.ix_client_identifier_promotions_open'::regclass;
  if v_uniq then
    raise exception 'promotion_dup_open_wall tail: ix_client_identifier_promotions_open became UNIQUE -- this file must not have touched it' using errcode = 'CLR10';
  end if;
  select v from _promo_dup_pre where k = 'old_ix_pred' into v_pre;
  if coalesce(v_pred,'(none)') is distinct from v_pre then
    raise exception 'promotion_dup_open_wall tail: ix_client_identifier_promotions_open predicate moved (pre %, post %)', v_pre, coalesce(v_pred,'(none)') using errcode = 'CLR10';
  end if;

  -- (4) clara._identifier_promotion_core is BYTE-IDENTICAL to its pinned prestate -- 0143's
  -- standing commitment, re-proven here rather than restated.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  select v from _promo_dup_pre where k = 'core_sha' into v_pre;
  if v_sha <> v_pre then
    raise exception 'promotion_dup_open_wall tail: clara._identifier_promotion_core CHANGED -- pre %, post %', v_pre, v_sha using errcode = 'CLR10';
  end if;
  -- ...and it still has exactly one caller (same qualified-call instrument the prestate uses --
  -- a bare substring census reads THREE here, see §0.7), so the wrapper-level handler still
  -- covers every path.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.oid <> 'clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)'::regprocedure
     and p.prosrc ~ '(^|[^A-Za-z0-9_])clara\._identifier_promotion_core[[:space:]]*\(';
  if v_n <> 1 then
    raise exception 'promotion_dup_open_wall tail: clara._identifier_promotion_core caller census is % , expected 1', v_n using errcode = 'CLR10';
  end if;

  -- (5) Door 1's recut body: exactly one overload, still SECURITY DEFINER + pinned search_path
  -- + owned by clara_fn_owner, ACL byte-unchanged from the prestate capture, EVERY prior wall
  -- string still present, and the new handler present and NARROW.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = 'wake_propose_identifier_promotion';
  if v_n <> 1 then
    raise exception 'promotion_dup_open_wall tail: expected exactly ONE wake_propose_identifier_promotion overload, found %', v_n using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure
        and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=%'
        and p.proowner = 'clara_fn_owner'::regrole) then
    raise exception 'promotion_dup_open_wall tail: wake_propose_identifier_promotion is not SECURITY DEFINER + pinned search_path + owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  select coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure)) a
     order by 1), ','), '(none)') into v_acl;
  select v from _promo_dup_pre where k = 'd1_acl' into v_pre;
  if v_acl is distinct from v_pre then
    raise exception 'promotion_dup_open_wall tail: wake_propose_identifier_promotion ACL moved (pre %, post %)', v_pre, v_acl using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure;
  if position('perform clara.assert_wake_allowed(w.wake_kind, ''wake_propose_identifier_promotion'')' in v_src) = 0
     or position('no valid wake credential' in v_src) = 0
     or position('an unattended identifier promotion must state its rationale' in v_src) = 0
     or position('an unattended identifier promotion must name its model (provider, model, version)' in v_src) = 0
     or position('an identifier promotion needs the triggering document' in v_src) = 0
     or position('''sightings'',p_sightings,''citations'',p_citations' in v_src) = 0
     or position('clara._resolve_proposal_basis(array[p_document], w.firm_id' in v_src) = 0
     or position('(v_resolved->>''sightings'')::int, v_resolved->''citations''' in v_src) = 0 then
    raise exception 'promotion_dup_open_wall tail: the recut wake_propose_identifier_promotion lost a pre-existing wall string' using errcode = 'CLR10';
  end if;
  if position('exception when unique_violation then' in v_src) = 0
     or position('get stacked diagnostics v_con = constraint_name' in v_src) = 0
     or position('v_con is distinct from ''uq_client_identifier_promotions_open_subject'' then raise' in v_src) = 0
     or position('"reason":"already_open","class":"identifier_promotion"' in v_src) = 0 then
    raise exception 'promotion_dup_open_wall tail: the recut wake_propose_identifier_promotion is missing its NARROW duplicate-open handler' using errcode = 'CLR10';
  end if;
  if position('sightings_claimed' in v_src) <> 0 then
    raise exception 'promotion_dup_open_wall tail: wake_propose_identifier_promotion reintroduced sightings_claimed (裁-22 Codex HIGH-2 forbids it)' using errcode = 'CLR10';
  end if;

  -- (6) _firm_question_core's recut body: same signature, still ungranted, every prior wall
  -- string present, the new handler present and NARROW.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = '_firm_question_core';
  if v_n <> 1 then
    raise exception 'promotion_dup_open_wall tail: expected exactly ONE _firm_question_core overload, found %', v_n using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'::regprocedure
        and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=%'
        and p.proowner = 'clara_fn_owner'::regrole) then
    raise exception 'promotion_dup_open_wall tail: _firm_question_core is not SECURITY DEFINER + pinned search_path + owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  select coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'::regprocedure)) a
     order by 1), ','), '(none)') into v_acl;
  select v from _promo_dup_pre where k = 'fqc_acl' into v_pre;
  if v_acl is distinct from v_pre then
    raise exception 'promotion_dup_open_wall tail: _firm_question_core ACL moved (pre %, post %)', v_pre, v_acl using errcode = 'CLR10';
  end if;
  -- ...and, read as a REACHABILITY fact rather than an ACL string: no application role at all.
  -- The role set is DERIVED from pg_roles (every clara_* role plus PUBLIC, minus the owner),
  -- never a hand-written list -- a literal list rots the moment a role is added or renamed, and
  -- a census that silently stops covering a role is exactly the false green this is here to
  -- prevent. (Authoring note: a first draft DID hand-write the list and named a
  -- `clara_wake_close_prep` that has never existed -- close_prep is a wake KIND, not a role.
  -- The rig refused it; this derivation is the fix.)
  select coalesce(string_agg(t.role, ','), '(none)') into v_reach
    from (select rolname as role from pg_roles where rolname like 'clara\_%' and rolname <> 'clara_fn_owner'
          union all select 'public') t
   where has_function_privilege(t.role, 'clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'::regprocedure, 'execute');
  if v_reach <> '(none)' then
    raise exception 'promotion_dup_open_wall tail: _firm_question_core became reachable by % -- it must stay ungranted', v_reach using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'::regprocedure;
  if position('firm question is malformed' in v_src) = 0
     or position('firm question candidates must be a json array' in v_src) = 0
     or position('document not found in your firm' in v_src) = 0
     or position('coalesce(p_candidates, ''[]''::jsonb), p_actor, nullif(btrim(coalesce(p_receipt,'''')), '''')' in v_src) = 0
     or position('perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, ''open_firm_question''' in v_src) = 0 then
    raise exception 'promotion_dup_open_wall tail: the recut _firm_question_core lost a pre-existing wall string' using errcode = 'CLR10';
  end if;
  if position('exception when unique_violation then' in v_src) = 0
     or position('get stacked diagnostics v_con = constraint_name' in v_src) = 0
     or position('v_con is distinct from ''uq_firm_open_questions_onboarding_open'' then raise' in v_src) = 0
     or position('"reason":"already_open","class":"onboarding_proposed"' in v_src) = 0 then
    raise exception 'promotion_dup_open_wall tail: the recut _firm_question_core is missing its NARROW duplicate-open handler' using errcode = 'CLR10';
  end if;

  -- (7) Door 2's OWN body check is still there -- this file backstops it, never replaces it.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)'::regprocedure;
  if v_src is null
     or position('q.kind = ''onboarding_proposed'' and q.status = ''open''' in v_src) = 0
     or position('an onboarding proposal is already open for this document' in v_src) = 0
     or position('from clara.documents where id = p_document for update' in v_src) = 0 then
    raise exception 'promotion_dup_open_wall tail: wake_propose_client_onboarding lost its own duplicate-open body check or its document lock -- this file must not have touched it' using errcode = 'CLR10';
  end if;

  -- (8) The wall actually BINDS: zero duplicate groups survive on both tables (structurally
  -- impossible now, censused anyway -- a count is the only thing that proves it, and the
  -- numbers below are what a ceremony operator reads).
  select count(*) into v_n from (select 1 from clara.client_identifier_promotions
      where status = 'proposed' group by firm_id, client_id, kind, value_normalized having count(*) > 1) g;
  if v_n <> 0 then
    raise exception 'promotion_dup_open_wall tail: % duplicate open promotion group(s) survive', v_n using errcode = 'CLR10';
  end if;
  select count(*) into v_n from (select 1 from clara.firm_open_questions
      where kind = 'onboarding_proposed' and status = 'open' group by document_id having count(*) > 1) g;
  if v_n <> 0 then
    raise exception 'promotion_dup_open_wall tail: % document(s) with more than one open onboarding_proposed question survive', v_n using errcode = 'CLR10';
  end if;

  select count(*), count(*) filter (where status = 'proposed') into v_promo_rows, v_open_cards
    from clara.client_identifier_promotions;
  select count(*), count(*) filter (where kind = 'onboarding_proposed' and status = 'open')
    into v_q_rows, v_open_onb from clara.firm_open_questions;

  raise notice 'promotion_dup_open_wall tail: OK -- uq_client_identifier_promotions_open_subject (firm_id,client_id,kind,value_normalized) where (status = ''proposed''::text) is unique+valid+ready+live, and uq_firm_open_questions_onboarding_open (document_id) where ((kind = ''onboarding_proposed''::text) AND (status = ''open''::text)) likewise -- both censused BY PROPERTY (indisunique/indisvalid/indisready/indislive + key column list + predicate text), never by name. The pre-existing ix_client_identifier_promotions_open is untouched and still NON-unique with its prestate predicate. clara._identifier_promotion_core is byte-identical to its pinned prestate sha and still has exactly ONE caller. Both recut bodies (wake_propose_identifier_promotion, _firm_question_core) keep every prior wall string, their exact prior ACLs and their SECURITY DEFINER/search_path/owner posture; _firm_question_core is reachable by NO application role at all (measured through has_function_privilege, not read off an ACL string); each carries a NARROW unique_violation handler that re-raises anything that is not its own index. wake_propose_client_onboarding is untouched and still carries both its document FOR UPDATE lock and its own already_open body check. LIVE CENSUS (report-only): % client_identifier_promotions row(s), of which % are open; % firm_open_questions row(s), of which % are open onboarding_proposed. ZERO duplicate groups on either table. No table in workflow/graphile_worker/spike touched.', v_promo_rows, v_open_cards, v_q_rows, v_open_onb;
end
$tail$;
