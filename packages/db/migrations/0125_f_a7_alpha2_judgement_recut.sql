-- 0125_f_a7_alpha2_judgement_recut — F-A7 train alpha, file 2 of 2 (D1-alpha).
--
-- THE CONSTITUTIONAL RECUT. Law 79 / TA-P7 C (docs/adr/README.md digest, RATIFIED by the
-- owner 2026-08-22): invariant (a) client attribution is satisfied by a human click, an
-- exact identifier match, or Clara's own JUDGEMENT under structural walls. This file adds
-- ONE new arm to the two-value world: a FOURTH client_resolutions.method value, 'judgement'
-- (never 'agent' — that value stays permanently refused everywhere; D-1). The four
-- walls-validate riders (the contradiction wall, the name-family collision guard, the
-- correction path, the firm-scoped carrier) and the filing verb that actually MINTS a
-- judgement resolution ship in later, independently-gated trains (pi/gamma/beta per the
-- gate's severance, filing-and-interview-gate-record.md SS4) — this file only widens the
-- METHOD the estate's writers will accept, per the build-lane order's own note that the
-- witness engine kind allowlist (0090 wall 8) is untouched by this recut.
--
-- THE CENSUS, not a caller list (AB-1/AB-2/D-17). "Who calls assert_client_resolved" sees
-- NONE of the inline re-derivations, and even a `pg_proc.prosrc` TEXT census for the literal
-- predicate `method in ('human','rule')` has its OWN blind spot: it cannot see a two-arm
-- EXHAUSTIVE case (`when method='rule' then 'rule' else 'human' end`), which folds every OTHER
-- value -- including a future 'judgement' -- into 'human' without ever spelling out an
-- admitted-methods list. The independent review round's MF-2 finding caught exactly this in
-- clara.finalize_document_intake, which the original text-pattern census missed. Per
-- filing-and-interview-annexes-2.md Annex H the design predicted SEVEN; the census instrument
-- itself is now EIGHT, corrected against the live catalog, not the design's prediction.
--
--   1. clara.assert_client_resolved            -- EXTEND (the constitutional gate itself)
--   2. clara.assert_client_resolved_bound       -- STAYS two-value (D-16, opening-seed lane
--                                                  confinement; a judged attribution may
--                                                  never satisfy a bound gate) -- NOT CoR'd,
--                                                  only asserted unchanged below
--   3. clara._tf_stamp_document_pipeline        -- EXTEND (AB-1: the document_filings BEFORE
--                                                  INSERT trigger; every judged filing aborts
--                                                  at INSERT without this) PLUS a NEW
--                                                  basis<->method congruence check (MF-2),
--                                                  the estate's backstop against any writer
--                                                  -- present or future -- miscomputing its
--                                                  own basis-derivation CASE
--   4. clara._file_document_write               -- EXTEND (the delegate alpha1 extracted;
--                                                  AB-2 attack a: without this the agent core
--                                                  either raises CLR01 or silently mints a
--                                                  second 'human' resolution of its own).
--                                                  MF-1 (HIGH, review round): the SECOND,
--                                                  subject-less fallback check inside this
--                                                  body STAYS two-value -- widening it would
--                                                  launder an agent judgement for a DIFFERENT
--                                                  document into a fresh 'human'-stamped
--                                                  resolution for THIS one. See the CoR body.
--   5. clara._seed_verified_document             -- EXTEND (fixture/seed parity; a divergent
--                                                  two-value seed world is a false negative)
--   6. clara.propose_wrong_client_correction     -- EXTEND (rider 3's proposal arm targets a
--                                                  client whose only resolution may be judged)
--   7. clara.approve_wrong_client_correction     -- EXTEND (AB-2 attack b: without this rider
--                                                  3's posted arm can never be approved)
--   8. clara.finalize_document_intake            -- NEW, MF-2 (review round, MED-HIGH): the
--                                                  FIFTH document_filings writer (0027:26-40's
--                                                  six-writer census) and a confirmed
--                                                  assert_client_resolved caller (cell 29's
--                                                  three); its own basis-derivation CASE folds
--                                                  anything but 'rule' into 'human', so a judged
--                                                  filing written through this door was read
--                                                  back by every basis-consumer (context pack,
--                                                  document extract, the uncoded list) as
--                                                  human-attributed. EXTEND the CASE's arm.
--
-- Every CoR below is authored from the rig replay captured after alpha1 applied (NOT from
-- migration text -- annexes-2 SS G: approve_wrong_client_correction's true live tip is
-- 0027:196, spliced further at 0038:7495-7520, and exists in no single migration file).
-- Prestate pins the exact pre-recut body of all eight; a drift aborts the apply rather than
-- silently CoR'ing a body this file cannot account for (annexes-2 Annex J cell 62).
--
-- AM-1 fold: 0018's own tail block (0018:487-809) is a ONE-SHOT apply-position assertion
-- against the body 0018 creates in the SAME file -- it cannot observe a CoR authored here,
-- three migrations later. This file's own postcheck (template 0090:1062-1100) re-authors
-- the properties 0018's tail can no longer prove: the prosrc marker, the accept-unbound and
-- reject-bound functional probes, and the re-derivation census -- re-runnable, and therefore
-- forceable both ways (cell 71).
--
-- Deploy note: seven live-writer bodies replaced (D1). Ceremony needs the write-quiesce window
-- for all eight document-pipeline writers this recut touches. Zero-risk on CI/throwaway
-- targets (no concurrent writers), same as every prior CoR in this lineage.

-- Precautionary, not load-bearing (ADR-059 ceremony law): seven CoRs + two extend-only CHECK
-- ALTERs, no backfill, no bulk scan. The bound exists only so a runaway lock wait on a live
-- ceremony target fails fast and visibly. Set HERE, as the runner's true first statement.
set local statement_timeout = '2min';

set role clara_fn_owner;

-- =====================================================================
-- Prestate: pin every target body's exact pre-recut prosrc sha256 (the pre-quiesce sha
-- tripwire) and the two CHECK constraints' current extend-only-safe shape. A mismatch aborts
-- before any DDL runs -- this file must never CoR a body it cannot account for.
-- =====================================================================
do $prestate$
declare v_sha text; v_def text; v_agent_rows int;
begin
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara.assert_client_resolved(uuid,uuid,uuid)'::regprocedure;
  if v_sha is distinct from '70766b05b13fcd1afc746378bd2feb3ce77903a8a51d1f9ba64c90b8f3b05c46' then
    raise exception 'f_a7_alpha2 prestate: assert_client_resolved prosrc sha256 mismatch (got %)', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara.assert_client_resolved_bound(uuid,uuid,text,uuid)'::regprocedure;
  if v_sha is distinct from '58b8b0fdecebd23fcc75970cce0944d6381a9f2ee8ad5dfb5462aeaa35aadd05' then
    raise exception 'f_a7_alpha2 prestate: assert_client_resolved_bound prosrc sha256 mismatch (got %) -- D-16 pin drifted', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._tf_stamp_document_pipeline()'::regprocedure;
  if v_sha is distinct from '29bf827cce4661df7b235be8eec9718536d6527aa98052801319516ce6a684d9' then
    raise exception 'f_a7_alpha2 prestate: _tf_stamp_document_pipeline prosrc sha256 mismatch (got %)', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._file_document_write(jsonb,uuid,uuid,text,text)'::regprocedure;
  if v_sha is distinct from 'fe2cffb73e76014e6e59c2e43dffa5b54129e3d857242b979ff4a55a77793bd3' then
    raise exception 'f_a7_alpha2 prestate: _file_document_write prosrc sha256 mismatch (got %) -- alpha1 must apply first, unmodified', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._seed_verified_document(uuid,uuid,text,text,text,bigint,text,uuid,integer,text,date,uuid)'::regprocedure;
  if v_sha is distinct from '9fc2282963236b8e77c0ffa165782b1bf2ef595a2cd9ad48550c8b2924b3c89a' then
    raise exception 'f_a7_alpha2 prestate: _seed_verified_document prosrc sha256 mismatch (got %)', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara.propose_wrong_client_correction(uuid,uuid,uuid,text,text)'::regprocedure;
  if v_sha is distinct from 'f79605df8398a84daf58cb6095d383a364057327c1edef3c00c694dddf75c33d' then
    raise exception 'f_a7_alpha2 prestate: propose_wrong_client_correction prosrc sha256 mismatch (got %)', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure;
  if v_sha is distinct from '32d03cd050f65d65cf25c2498677efd7d1a18bbdd7c6e289cf08b8be0e93bf95' then
    raise exception 'f_a7_alpha2 prestate: approve_wrong_client_correction prosrc sha256 mismatch (got %) -- live tip is 0027:196 spliced by 0038:7495-7520; re-derive by rig replay, never migration text', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara.finalize_document_intake(uuid,text,text,jsonb,integer,text,uuid,uuid,text)'::regprocedure;
  if v_sha is distinct from '2c5b8c452f051fb7606a20721f104822514c68acf9835623b354f1953ac3fbec' then
    raise exception 'f_a7_alpha2 prestate: finalize_document_intake prosrc sha256 mismatch (got %) -- MF-2 (review round): re-derive by rig replay, never migration text', v_sha using errcode = 'CLR10';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'clara.client_resolutions'::regclass and conname = 'client_resolutions_method_check';
  if regexp_replace(v_def, '\s+', '', 'g') <> $$CHECK((method=ANY(ARRAY['human'::text,'rule'::text,'agent'::text])))$$ then
    raise exception 'f_a7_alpha2 prestate: client_resolutions_method_check shape unexpected (got %)', v_def using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'clara.document_filings'::regclass and conname = 'document_filings_basis_check';
  if regexp_replace(v_def, '\s+', '', 'g') <> $$CHECK((basis=ANY(ARRAY['legacy-0007'::text,'human'::text,'rule'::text,'correction'::text,'seed-0007'::text])))$$ then
    raise exception 'f_a7_alpha2 prestate: document_filings_basis_check shape unexpected (got %)', v_def using errcode = 'CLR10';
  end if;

  -- P-4 (empirical, informational): zero rows carry method='agent' today -- not a blocking
  -- precondition (this file never narrows the CHECK, only widens it), but a fact the file
  -- would want to know if wrong.
  select count(*) into v_agent_rows from clara.client_resolutions where method = 'agent';
  raise notice 'f_a7_alpha2 prestate: % live client_resolutions row(s) carry method=agent (P-4; informational, non-blocking)', v_agent_rows;
end
$prestate$;

-- =====================================================================
-- SS1. The two CHECKs, extend-only. 'judgement' joins both; nothing removed, nothing
-- reordered. document_filings.basis gets its own 'judgement' value (distinct from
-- client_resolutions.method's, but sharing the name deliberately -- both denote the same
-- underlying category, and the estate's own precedent for 'rule' already does this).
-- =====================================================================
alter table clara.client_resolutions
  drop constraint client_resolutions_method_check,
  add constraint client_resolutions_method_check
    check (method = any (array['human', 'rule', 'agent', 'judgement']));

alter table clara.document_filings
  drop constraint document_filings_basis_check,
  add constraint document_filings_basis_check
    check (basis = any (array['legacy-0007', 'human', 'rule', 'correction', 'seed-0007', 'judgement']));

-- =====================================================================
-- SS2. The six EXTEND bodies. Each CoR adds 'judgement' BESIDE the existing 'human'/'rule'
-- arm -- never woven through, never a coalesce/is-not-distinct-from rewrite (the AM-1
-- discipline). 'agent' is never added to any of these predicates; it stays refused.
-- =====================================================================

-- ---- 1. assert_client_resolved -- the constitutional gate every posting floor traverses.
create or replace function clara.assert_client_resolved(p_client uuid, p_resolution uuid, p_document uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform 1 from clara.client_resolutions r
   where r.id = p_resolution and r.client_id = p_client
     and r.method in ('human', 'rule', 'judgement') and r.confidence >= 0.95 and r.superseded_at is null
     and (p_document is null or (r.subject_kind = 'document' and r.subject_id = p_document))
     and r.bound_scope_kind is null;
  if not found then
    raise exception 'client attribution not established' using errcode = 'CLR01';
  end if;
end $$;

-- ---- 3. _tf_stamp_document_pipeline -- BEFORE INSERT/whichever on nine tables; only the
-- document_filings arm's predicate changes. Every other arm is byte-identical to the live
-- tip (0007:415, created once, never previously replaced).
create or replace function clara._tf_stamp_document_pipeline()
  returns trigger language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_doc uuid; v_client uuid; v_res_method text;
begin
  case tg_table_name
    when 'document_filings' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
      if v_firm is null or not exists (select 1 from clara.clients where id = new.client_id and firm_id = v_firm) then
        raise exception 'document/client not in one firm' using errcode = 'CLR11';
      end if;
      if new.resolution_id is not null and not exists (
        select 1 from clara.client_resolutions where id = new.resolution_id
          and firm_id = v_firm and client_id = new.client_id
          and subject_kind = 'document' and subject_id = new.document_id
          and method in ('human', 'rule', 'judgement') and confidence >= 0.95 and superseded_at is null) then
        raise exception 'filing resolution is not authoritative for this document/client' using errcode = 'CLR01';
      end if;
      -- MF-2 (review round, MED-HIGH): the STRUCTURAL basis<->method congruence wall. Nothing
      -- before this recut ever verified that document_filings.basis, whatever a writer computed
      -- it to be, actually matches the resolution's real method -- finalize_document_intake's
      -- own basis-derivation CASE (row 8 below) proved that gap live: a judgement resolution
      -- passed the authority check above and was then stamped basis='human' by a two-arm CASE
      -- that folds anything but 'rule' into 'human'. This is the backstop against THAT class of
      -- bug in every writer, present or future, not only the one caught this round: the three
      -- method-mirroring basis values (human/rule/judgement) must equal the resolution's own
      -- method exactly. 'correction' and 'seed-0007' are workflow-provenance markers, not
      -- method-mirrors -- approve_wrong_client_correction legitimately stamps 'correction'
      -- regardless of the destination resolution's method (rider 3's whole point, and cell 61's
      -- proof), so those two basis values are deliberately EXEMPT from this congruence, never
      -- from the authority check above.
      if new.resolution_id is not null and new.basis in ('human', 'rule', 'judgement') then
        select method into v_res_method from clara.client_resolutions where id = new.resolution_id;
        if v_res_method is distinct from new.basis then
          raise exception 'filing basis (%) does not match its resolution''s method (%) -- a writer''s basis-derivation is wrong, not the resolution', new.basis, v_res_method using errcode = 'CLR01';
        end if;
      end if;
    when 'document_intakes' then
      if new.origin = 'chat' then
        select s.firm_id into v_firm from clara.chat_sessions s
          join clara.firm_memberships m on m.firm_id=s.firm_id
            and m.user_id=new.uploaded_by and m.status='active'
          where s.id=new.chat_session_id
            and (s.created_by=new.uploaded_by or s.visibility='firm');
      else
        select firm_id into v_firm from clara.firm_memberships
          where user_id = new.uploaded_by and status = 'active';
      end if;
      if v_firm is null then raise exception 'uploader has no matching intake firm' using errcode = 'CLR11'; end if;
    when 'document_processing_tasks' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
    when 'document_extractions' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
    when 'document_regions' then
      select firm_id into v_firm from clara.document_extractions where id = new.extraction_id;
    when 'client_identifiers' then
      select firm_id into v_firm from clara.clients where id = new.client_id;
    when 'client_aliases' then
      select firm_id into v_firm from clara.clients where id = new.client_id;
    when 'attribution_attempts' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
    when 'attribution_candidates' then
      select a.firm_id, a.document_id into v_firm, v_doc
        from clara.attribution_attempts a where a.id = new.attempt_id;
      if not exists (select 1 from clara.clients where id = new.client_id and firm_id = v_firm) then
        raise exception 'candidate client not in attempt firm' using errcode = 'CLR11';
      end if;
    when 'attribution_candidate_regions' then
      select c.firm_id, a.document_id into v_firm, v_doc
        from clara.attribution_candidates c join clara.attribution_attempts a on a.id = c.attempt_id
       where c.id = new.candidate_id;
      if not exists (
        select 1 from clara.document_regions r
        join clara.document_extractions e on e.id = r.extraction_id
        where r.id = new.region_id and r.firm_id = v_firm and e.document_id = v_doc) then
      raise exception 'candidate evidence region not from the attempted document' using errcode = 'CLR11';
      end if;
    when 'filing_corrections' then
      select firm_id into v_firm from clara.documents where id = new.document_id;
      if not exists (select 1 from clara.clients where id = new.from_client and firm_id = v_firm)
         or not exists (select 1 from clara.clients where id = new.to_client and firm_id = v_firm) then
        raise exception 'correction clients not in document firm' using errcode = 'CLR11';
      end if;
    when 'filing_correction_items' then
      select firm_id into v_firm from clara.filing_corrections where id = new.correction_id;
      if not exists (select 1 from clara.journal_entries where id = new.entry_id and firm_id = v_firm) then
        raise exception 'correction entry not in correction firm' using errcode = 'CLR11';
      end if;
    when 'firm_document_limits' then
      select id into v_firm from clara.firms where id = new.firm_id;
    when 'document_ingest_reservations' then
      select firm_id into v_firm from clara.document_intakes where id = new.intake_id;
      if new.task_id is not null and not exists (
        select 1 from clara.document_processing_tasks where id = new.task_id and firm_id = v_firm) then
        raise exception 'reservation task not in intake firm' using errcode = 'CLR11';
      end if;
    else
      raise exception 'unsupported document pipeline stamp target %', tg_table_name using errcode = 'CLR10';
  end case;
  if v_firm is null then raise exception 'unknown document-pipeline parent' using errcode = 'CLR10'; end if;
  new.firm_id := v_firm;
  return new;
end $$;

-- ---- 4. _file_document_write -- both the lookup predicate AND the basis-derivation CASE
-- (a judged resolution's basis must stamp 'judgement', not silently fall through to 'human').
create or replace function clara._file_document_write(p_ctx jsonb, p_document uuid, p_client uuid,
    p_resolution text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c_firm uuid := (p_ctx->>'firm')::uuid;
  c_actor uuid := (p_ctx->>'actor')::uuid;
  v_dedupe jsonb; v_doc_firm uuid; v_id uuid; v_basis text;
  v_resolution uuid; v_input_resolution uuid; v_created boolean := false;
  v_resolution_created boolean := false; v_facts jsonb;
begin
  -- alpha1's SHOULD-7 null-guard, carried forward verbatim -- CREATE OR REPLACE fully replaces
  -- the body, so omitting it here would silently drop it the moment this file applies.
  if c_firm is null or c_actor is null then
    raise exception 'file_document context is malformed (firm/actor required)' using errcode = 'CLR10';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c_firm, 'file_document', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'client', p_client,
      'resolution', p_resolution)));
  if v_dedupe is not null then return v_dedupe; end if;
  select firm_id into v_doc_firm from clara.documents where id = p_document for update;
  if v_doc_firm is null or v_doc_firm <> c_firm then raise exception 'document not in your firm' using errcode = 'CLR11'; end if;
  begin v_input_resolution := nullif(p_resolution, '')::uuid;
  exception when invalid_text_representation then
    raise exception 'client attribution not established' using errcode = 'CLR01';
  end;
  if not exists(select 1 from clara.clients where id = p_client and firm_id = c_firm and status in ('active', 'onboarding')) then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  select id into v_id from clara.document_filings
    where document_id = p_document and client_id = p_client and retired_at is null;
  if v_id is not null then raise exception 'document is already actively filed to this client' using errcode = 'CLR10'; end if;
  select r.id, r.method into v_resolution, v_basis from clara.client_resolutions r
    where r.id = v_input_resolution and r.client_id = p_client and r.firm_id = c_firm
      and r.method in ('human', 'rule', 'judgement') and r.confidence >= 0.95 and r.superseded_at is null
      and r.subject_kind = 'document' and r.subject_id = p_document;
  if v_resolution is null then
    -- Review round MF-1 (HIGH): this second check is SUBJECT-LESS by design (it exists to admit
    -- a HUMAN caller who supplied SOME valid resolution as supporting evidence for a DIFFERENT
    -- subject -- the fallback below then mints a fresh 'human' resolution FOR THIS document, at
    -- confidence 1.0, on the strength of the human's own act of calling this verb). Widening it
    -- to 'judgement' turns that same fallback into a laundering path: an agent-judged resolution
    -- for a DIFFERENT document would pass here (right client/firm, admitted method, wrong
    -- subject), fall through, and mint a NEW resolution stamped 'human' -- model-influenced
    -- attribution wearing human provenance, the exact hazard the wall exists to close. This
    -- check STAYS two-value; a judgement resolution for the WRONG document correctly refuses
    -- CLR01 here (never silently re-homed) — the widened, subject-SCOPED select above is the
    -- only lawful admission path for a judged resolution, and it already requires an exact
    -- subject match. Train beta's caller discipline (never pass a resolution for a different
    -- subject) is a comment on that lane, not a wall; this file owns the wall.
    if v_input_resolution is not null and not exists(select 1 from clara.client_resolutions r
        where r.id = v_input_resolution and r.client_id = p_client and r.firm_id = c_firm
          and r.method in ('human', 'rule') and r.confidence >= 0.95
          and r.superseded_at is null) then
      raise exception 'client attribution not established' using errcode = 'CLR01';
    end if;
    insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by)
      values(c_firm, p_client, 'document', p_document, 1.0, 'human',
        jsonb_build_object('source_resolution_id', v_input_resolution,
          'source', 'file_document'), c_actor)
      returning id, method into v_resolution, v_basis;
    v_resolution_created := true;
  end if;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by,
      resolution_id, basis)
    values(c_firm, p_document, p_client, c_actor, v_resolution,
      case when v_basis = 'rule' then 'rule' when v_basis = 'judgement' then 'judgement' else 'human' end)
    returning id into v_id;
  v_created := true;
  perform clara._recompute_document_retention(p_document);
  v_facts := clara._enqueue_invoice_facts_core(p_document);
  perform clara._audit(c_firm, c_actor, null, null, 'file_document', null,
    jsonb_build_object('document', p_document, 'client', p_client,
      'resolution', v_resolution, 'filing', v_id, 'facts_task', v_facts->>'task_id',
      'op_key', p_op_key));
  if v_resolution_created then
    perform clara._append_event(c_firm, 'client.resolved', p_client, c_actor, null, null,
      null, p_document, v_resolution, '{}'::jsonb);
  end if;
  if v_created then
    perform clara._append_event(c_firm, 'document.filed', p_client, c_actor, null, null,
      null, p_document, v_resolution, jsonb_build_object('filing_id', v_id));
  end if;
  if v_facts->>'status' = 'failed'
     and coalesce((select t38.lane from clara.document_processing_tasks t38
       where t38.id = (v_facts->>'task_id')::uuid), '')
       not in ('statement_facts', 'statement_parse') then
    perform clara._append_event(c_firm, 'document.invoice_facts_failed', null, c_actor, null, null,
      null, p_document, null, jsonb_build_object('task_id', v_facts->>'task_id',
        'reason', v_facts->>'reason'));
  end if;
  return clara._finish_op(c_firm, 'file_document', p_op_key,
    jsonb_build_object('filing_id', v_id, 'document_id', p_document, 'client_id', p_client));
end $$;

-- ---- 5. _seed_verified_document -- fixture/seed parity (row 5 EXTEND). Both the lookup
-- predicate and the basis-derivation CASE gain the judgement arm.
create or replace function clara._seed_verified_document(p_firm uuid, p_client uuid, p_sha256 text,
    p_filename text, p_mime text, p_bytes bigint, p_storage_path text, p_uploaded_by uuid default null,
    p_page_count integer default 1, p_document_kind text default null, p_financial_date date default null,
    p_resolution uuid default null)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_doc uuid; v_res uuid; v_filing uuid; v_method text;
begin
  if not exists (select 1 from clara.firms where id=p_firm) then raise exception 'unknown seed firm' using errcode='CLR11'; end if;
  if p_client is not null and not exists (select 1 from clara.clients where id=p_client and firm_id=p_firm) then
    raise exception 'seed client not in firm' using errcode='CLR11';
  end if;
  insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,storage_path,
      bytes_verified_at,extraction_status,uploaded_by,page_count,document_kind,financial_date)
    values(p_firm,p_sha256,p_filename,p_mime,p_bytes,p_storage_path,now(),'pending',p_uploaded_by,
      p_page_count,p_document_kind,p_financial_date)
    on conflict (firm_id,sha256) do update set original_filename=excluded.original_filename
    returning id into v_doc;
  if p_client is not null then
    select id into v_filing from clara.document_filings
      where document_id=v_doc and client_id=p_client and retired_at is null;
    if v_filing is null then
      select r.id,r.method into v_res,v_method from clara.client_resolutions r
        where r.id=p_resolution and r.firm_id=p_firm and r.client_id=p_client
          and r.subject_kind='document' and r.subject_id=v_doc and r.confidence>=0.95
          and r.method in ('human','rule','judgement') and r.superseded_at is null;
      if v_res is null then
        insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,
            method,evidence,resolved_by)
          values(p_firm,p_client,'document',v_doc,1.0,'human',
            jsonb_build_object('fixture','_seed_verified_document','source_resolution_id',p_resolution),
            p_uploaded_by)
          returning id,method into v_res,v_method;
      end if;
      insert into clara.document_filings(firm_id,document_id,client_id,filed_by,resolution_id,basis)
        values(p_firm,v_doc,p_client,p_uploaded_by,v_res,
          case when v_method='rule' then 'rule' when v_method='judgement' then 'judgement' else 'seed-0007' end) returning id into v_filing;
      perform clara._recompute_document_retention(v_doc);
      perform clara._append_event(p_firm,'client.resolved',p_client,p_uploaded_by,null,null,
        null,v_doc,v_res,'{}'::jsonb);
      perform clara._append_event(p_firm,'document.filed',p_client,p_uploaded_by,null,null,
        null,v_doc,v_res,jsonb_build_object('filing_id',v_filing));
    end if;
  end if;
  perform clara._audit(p_firm,p_uploaded_by,null,null,'_seed_verified_document',null,
    jsonb_build_object('document',v_doc,'client',p_client));
  perform clara._append_event(p_firm,'document.ingested',null,p_uploaded_by,null,null,
    null,v_doc,null,'{}'::jsonb);
  return jsonb_build_object('document_id',v_doc,'filing_id',v_filing,'resolution_id',v_res);
end $$;

-- ---- 6. propose_wrong_client_correction -- rider 3's proposal arm; the destination-client
-- authority EXISTS-check gains the judgement arm.
create or replace function clara.propose_wrong_client_correction(p_document uuid, p_from_client uuid,
    p_to_client uuid, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_preview jsonb; v_items jsonb; v_books bigint;
  v_hash text; v_id uuid; elem jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' or p_reason is null or btrim(p_reason)='' then
    raise exception 'op_key and correction reason are required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'propose_wrong_client_correction',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'from',p_from_client,'to',p_to_client,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_preview:=clara.preview_wrong_client_correction(p_document,p_from_client,p_to_client);
  if not exists (select 1 from clara.client_resolutions r
      where r.firm_id=c.firm and r.client_id=p_to_client and r.subject_kind='document'
        and r.subject_id=p_document and r.method in ('human','rule','judgement') and r.confidence>=0.95
        and r.superseded_at is null) then
    raise exception 'destination client attribution is not authoritative' using errcode='CLR01';
  end if;
  v_items:=v_preview->'items'; v_books:=(v_preview->>'books_version')::bigint;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('document',p_document,'from',p_from_client,
    'to',p_to_client,'books_version',v_books,'items',v_items)::text,'UTF8')),'hex');
  insert into clara.filing_corrections(firm_id,document_id,from_client,to_client,reason,
      maker,status,plan_hash,books_version)
    values(c.firm,p_document,p_from_client,p_to_client,p_reason,c.actor,'proposed',v_hash,v_books)
    returning id into v_id;
  for elem in select value from jsonb_array_elements(v_items) loop
    insert into clara.filing_correction_items(firm_id,correction_id,entry_id,entry_state_hash,action)
      values(c.firm,v_id,(elem->>'entry_id')::uuid,elem->>'entry_state_hash',elem->>'action');
  end loop;
  perform clara._audit(c.firm,c.actor,null,null,'propose_wrong_client_correction',null,
    jsonb_build_object('correction',v_id,'document',p_document,'from',p_from_client,'to',p_to_client,
      'plan_hash',v_hash,'op_key',p_op_key));
  return clara._finish_op(c.firm,'propose_wrong_client_correction',p_op_key,
    jsonb_build_object('correction_id',v_id,'plan_hash',v_hash,'books_version',v_books,'status','proposed'));
end $$;

-- ---- 7. approve_wrong_client_correction -- rider 3's posted arm; only the destination-
-- client resolution lookup near the end gains the judgement arm. Every lock, refusal and
-- comment from the live tip (0027:196, spliced 0038:7495-7520) is reproduced verbatim.
create or replace function clara.approve_wrong_client_correction(p_correction uuid, p_plan_hash text,
    p_attestation text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; x record; it record; o record; pending record;
  v_current bigint; v_mirror uuid; v_to_filing uuid; v_from_filing uuid;
  v_resolution uuid; v_solo text; v_adopted boolean;
  v_recode_notification uuid; v_coding_task uuid; v_facts jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  select * into x from clara.filing_corrections where id=p_correction;
  if not found or x.firm_id<>c.firm then raise exception 'correction not in your firm' using errcode='CLR11'; end if;
  -- [R1-F1] A filing correction may not capture any K-family entry.
  if exists(select 1 from clara.filing_correction_items i
      join clara.journal_entries je on je.id=i.entry_id
      where i.correction_id=p_correction and je.is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_wrong_client_correction',p_op_key,
    clara._hash(jsonb_build_object('correction',p_correction,'plan_hash',p_plan_hash,
      'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005002,hashtext(c.firm::text));
  select * into x from clara.filing_corrections where id=p_correction for update;
  if x.status<>'proposed' or x.plan_hash<>p_plan_hash then raise exception 'correction plan/state mismatch' using errcode='CLR12'; end if;
  if c.actor=x.maker then
    if clara.eligible_checker_count(c.firm)>=2 then
      raise exception 'correction requires a distinct checker' using errcode='CLR19';
    elsif p_attestation is null or btrim(p_attestation)='' then
      raise exception 'solo correction approval requires attestation' using errcode='CLR19';
    else v_solo:=p_attestation; end if;
  end if;
  select coalesce(max(seq),0) into v_current from clara.domain_events where firm_id=c.firm;
  if v_current<>x.books_version then raise exception 'correction plan is stale (books version moved)' using errcode='CLR19'; end if;

  -- 0027 (task #29): lock the parent document BEFORE any document_filings touch -- same
  -- fix as confirm_attribution_candidate. Previously this function's first
  -- document_filings acquisition preceded `documents` (only reached later, via
  -- _recompute_document_retention), the same inversion against file_document.
  perform 1 from clara.documents where id=x.document_id for update;
  -- 0038 (design 4.2 / part2 section 5): PROVENANCE DURABILITY. A live bank statement binds this
  -- document AND the filing this correction is about to retire. Moving the document to another
  -- client under a statement that already produced lines -- and possibly matches and settlements
  -- -- is not a correction, it is a rewrite of a books-bearing fact. Refused at the top, before
  -- any filing work, so the refusal costs no write. Remedy: void the statement (which itself
  -- requires zero pending/live match groups on its lines, WCB-R5), then correct the filing, then
  -- re-ingest.
  if clara._bank_live_statement_on_document(x.document_id) then
    raise exception 'a live bank statement is bound to this document; void the statement before correcting its filing'
      using errcode='CLR10',detail='{"reason":"live_bank_statement_present"}';
  end if;
  perform 1 from clara.document_filings f where f.document_id=x.document_id and f.firm_id=c.firm
    order by f.id for update;
  select id into v_from_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.from_client and retired_at is null;
  if v_from_filing is null then raise exception 'source filing is no longer active' using errcode='CLR19'; end if;
  -- [WB-R21/0019 SS1] The wiki VETO is gone. A correction move still retires the
  -- SOURCE filing, so the SOURCE client's row lock -- the serializer against wiki
  -- publication -- stays, at exactly the position the veto call held.
  perform 1 from clara.clients cl
    where cl.id=x.from_client and cl.firm_id=c.firm for update;
  if not found then
    raise exception 'filing client not in the supplied firm' using errcode='CLR11';
  end if;
  perform 1 from clara.journal_entries je join clara.filing_correction_items i on i.entry_id=je.id
    where i.correction_id=x.id order by je.id for update of je;
  if exists(select 1 from clara.filing_correction_items i
      where i.correction_id=x.id and i.entry_state_hash<>clara._entry_state_hash(i.entry_id)) then
    raise exception 'correction item state changed' using errcode='CLR19';
  end if;
  if exists(select 1 from clara.filing_correction_items i where i.correction_id=x.id
      and clara._correction_period_state(i.entry_id)<>'no_period_model') then
    raise exception 'correction touches a closed period' using errcode='CLR19';
  end if;
  select id into v_resolution from clara.client_resolutions
    where firm_id=c.firm and client_id=x.to_client and subject_kind='document'
      and subject_id=x.document_id and method in ('human','rule','judgement') and confidence>=0.95
      and superseded_at is null order by created_at desc limit 1;
  if v_resolution is null then raise exception 'destination client attribution is not authoritative' using errcode='CLR01'; end if;

  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    select * into o from clara.journal_entries where id=it.entry_id;
    if it.action='reverse' then
      -- 0037: SERIALIZE REVERSE AGAINST ALLOCATION, exactly as reverse_entry now does. This
      -- body already holds the FIRM advisory rung (203005002) and the captured entries' JE
      -- row locks; neither serializes against a section-4.9 composite, which takes the CLIENT
      -- rung and locks only its OWN freshly-inserted entry. Taking 203005004 here -- AFTER
      -- the JE row locks above, so the JE -> advisory order the core uses is preserved --
      -- closes the check-then-act window on the refusal below. The full rung is
      -- firm(203005002) -> client(203005004); advisory xact locks are re-entrant, so taking
      -- it once per captured item costs nothing after the first.
      perform pg_advisory_xact_lock(203005004,hashtext(o.client_id::text));
      -- 0037 (design 4.5): the same reverse refusal reverse_entry carries. A correction that
      -- moves a filing between clients still REVERSES the entries it captures, so an
      -- allocated open item must be unallocated first here too.
      if clara._subledger_allocated_items_present(o.id) then
        raise exception 'open items on this entry carry allocations; unallocate them first'
          using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
      end if;
      -- 0038 (design 4.6): the same reverse-while-matched refusal reverse_entry now carries. A
      -- correction that moves a filing between clients still REVERSES the entries it captures,
      -- so a captured entry that is a live bank-match member must be unmatched first. Refusal
      -- (a) above does not cover this: the captured entry may be matched to a statement on a
      -- DIFFERENT document entirely.
      if clara._bank_live_match_present(o.id) then
        raise exception 'a captured entry is matched to a bank statement line; unmatch the bank match first'
          using errcode='CLR10',detail='{"reason":"live_bank_match_present"}';
      end if;
      v_mirror:=null; v_adopted:=false;
      for pending in select * from clara.journal_entries
          where reversal_of=o.id and status='draft' order by id for update loop
        if v_mirror is null
           and clara._entry_state_hash(pending.id)=clara._expected_reversal_state_hash(pending.id,o.id) then
          v_mirror:=pending.id; v_adopted:=true;
        else
          update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
            withdrawn_at=now(),withdrawal_reason='superseded-by-correction',
            proposed_counterparty=null,match_fingerprint=null,updated_at=now()
            where id=pending.id;
        end if;
      end loop;
      if v_mirror is null then
        -- 0042 (owner ruling 2026-08-03, WDB-R1): THE HOUSE LEGAL DATE, not the session's.
        -- The date this correction is booked at is a property of the HOUSE (Asia/Kuala_Lumpur),
        -- never of whoever opened the connection. The session clock this replaces is one day
        -- early for eight hours of every UTC day, so on the live runtime this door minted
        -- corrections dated into the PREVIOUS day -- and a previous day can sit in a month the
        -- client has already closed and filed. 0041 S4.4 removed this exact shape from
        -- clara.reverse_entry; this is its untreated sibling, and clara._book_today() is now
        -- the one body in the catalog that answers the question for both.
        insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
            resolution_id,is_opening_balance,is_year_end,tax_affecting,maker_actor,
            last_human_editor,reversal_of,reversal_reason)
          values(o.client_id,'draft',clara._book_today(),'Correction reversal: '||x.reason,
            'reversal',o.resolution_id,o.is_opening_balance,o.is_year_end,o.tax_affecting,
            c.actor,c.actor,o.id,x.reason) returning id into v_mirror;
        insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
            credit_cents,description,counterparty_id)
          select v_mirror,line_no,account_code,credit_cents,debit_cents,
            description,counterparty_id
          from clara.journal_lines where entry_id=o.id order by line_no;
      end if;
      perform clara._assert_balanced(v_mirror);
      perform clara._assert_supplier_bill_shape(v_mirror);
      update clara.journal_entries set status='approved',checker_actor=c.actor,
        approved_at=now(),self_approval_attestation=v_solo,updated_at=now()
        where id=v_mirror;
      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,
        updated_at=now() where id=o.id;
      -- 0037 (design 4.3, path 4 of four): the hook. Covers the ADOPTED-draft-mirror hole
      -- too -- a mirror drafted by another lane and approved here would otherwise reach the
      -- books with no unwind at all.
      perform clara._subledger_on_approve(v_mirror);
      update clara.filing_correction_items set reversal_id=v_mirror,outcome='reversed',
        adopted_reversal=v_adopted where id=it.id;
    elsif it.action='withdraw_draft' then
      update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
        withdrawn_at=now(),withdrawal_reason=x.reason,proposed_counterparty=null,
        match_fingerprint=null,updated_at=now() where id=o.id;
      update clara.filing_correction_items set outcome='withdrawn' where id=it.id;
    else
      update clara.filing_correction_items set outcome='already_reversed' where id=it.id;
    end if;
  end loop;

  update clara.document_filings set retired_at=now(),retired_by=c.actor,
    retirement_reason=x.reason,correction_id=x.id where id=v_from_filing;
  select id into v_to_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.to_client and retired_at is null;
  if v_to_filing is null then
    insert into clara.document_filings(firm_id,document_id,client_id,filed_by,
        resolution_id,basis,correction_id)
      values(c.firm,x.document_id,x.to_client,c.actor,v_resolution,'correction',x.id)
      returning id into v_to_filing;
  end if;
  perform clara._recompute_document_retention(x.document_id);
  v_facts:=clara._enqueue_invoice_facts_core(x.document_id);
  insert into clara.coding_tasks(firm_id,client_id,document_id,filing_id,origin,
      correction_id,opened_by)
    values(c.firm,x.to_client,x.document_id,v_to_filing,'correction',x.id,c.actor)
    returning id into v_coding_task;
  insert into clara.notifications(firm_id,client_id,kind,payload,created_by)
    values(c.firm,x.to_client,'document_recode_required',jsonb_build_object(
      'correction_id',x.id,'document_id',x.document_id,'to_client',x.to_client,
      'coding_task_id',v_coding_task,'work_kind','recode_document','status','pending',
      'carrier','slice6-coding-floor'),c.actor) returning id into v_recode_notification;
  update clara.filing_corrections set status='completed',checker=c.actor,
    attestation=v_solo,approved_at=now(),completed_at=now() where id=x.id;
  perform clara._audit(c.firm,c.actor,null,null,'approve_wrong_client_correction',null,
    jsonb_build_object('correction',x.id,'document',x.document_id,
      'from_filing',v_from_filing,'to_filing',v_to_filing,
      'coding_task',v_coding_task,'plan_hash',p_plan_hash,'op_key',p_op_key));

  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    if it.outcome='reversed' then
      if not it.adopted_reversal then
        perform clara._append_event(c.firm,'entry.drafted',x.from_client,c.actor,null,null,
          it.reversal_id,null,null,'{}'::jsonb);
      end if;
      perform clara._append_event(c.firm,'entry.approved',x.from_client,c.actor,null,null,
        it.reversal_id,null,null,'{}'::jsonb);
      perform clara._append_event(c.firm,'entry.reversed',x.from_client,c.actor,null,null,
        it.entry_id,null,null,'{}'::jsonb);
    end if;
  end loop;
  perform clara._append_event(c.firm,'document.filing_retired',x.from_client,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('filing_id',v_from_filing,
      'correction_id',x.id));
  perform clara._append_event(c.firm,'document.filed',x.to_client,c.actor,null,null,
    null,x.document_id,v_resolution,jsonb_build_object('filing_id',v_to_filing,
      'correction_id',x.id));
  perform clara._append_event(c.firm,'document.correction_applied',null,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('correction_id',x.id));
  perform clara._append_event(c.firm,'coding_task.opened',x.to_client,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('coding_task_id',v_coding_task,
      'filing_id',v_to_filing,'correction_id',x.id));
  perform clara._append_event(c.firm,'notification.recorded',x.to_client,c.actor,null,null,
    null,null,null,jsonb_build_object('notification_id',v_recode_notification,
      'correction_id',x.id,'coding_task_id',v_coding_task));
  if v_facts->>'status'='failed'
     and coalesce((select t38.lane from clara.document_processing_tasks t38
       where t38.id=(v_facts->>'task_id')::uuid),'')
       not in ('statement_facts','statement_parse') then
    perform clara._append_event(c.firm,'document.invoice_facts_failed',null,c.actor,null,null,
      null,x.document_id,null,jsonb_build_object('task_id',v_facts->>'task_id',
        'reason',v_facts->>'reason'));
  end if;
  return clara._finish_op(c.firm,'approve_wrong_client_correction',p_op_key,
    jsonb_build_object('correction_id',x.id,'status','completed',
      'from_filing_id',v_from_filing,'to_filing_id',v_to_filing,
      'coding_task_id',v_coding_task));
end $$;

-- ---- 8. finalize_document_intake -- MF-2 (review round). Only the basis-derivation CASE near
-- the end changes; everything else (the intake-recovery door, the mime-mismatch/attempt-cap
-- refusals, the echo/mint modes) is reproduced verbatim from the live tip.
create or replace function clara.finalize_document_intake(p_intake uuid, p_token_hash text default null,
    p_engine_id text default 'clara-fixture:v1', p_engine_config jsonb default '{}'::jsonb,
    p_version_n integer default 1, p_lane text default 'ocr', p_client uuid default null,
    p_resolution uuid default null, p_op_key text default null)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  i record; d record; v_dedupe jsonb; v_doc uuid; v_task uuid; v_filing uuid;
  v_created boolean:=false; v_upgraded boolean:=false; v_filed boolean:=false; v_basis text;
  v_expired jsonb;
  v_recovery jsonb; v_ing record; v_rvn int; v_rtask uuid;
  v_rmode text; v_rrefuse jsonb; v_attempts int;
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
      on conflict (document_id,engine_id,version_n,lane) do nothing returning id into v_task;
    if v_task is null then
      select id into v_task from clara.document_processing_tasks
        where document_id=v_doc and engine_id=p_engine_id and version_n=p_version_n and lane=p_lane;
      if v_task is null then
        raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,lane=%) but no row exists at that key',
          v_doc,p_engine_id,p_version_n,p_lane using errcode='CLR35';
      end if;
    end if;
    update clara.document_ingest_reservations set task_id=v_task where intake_id=p_intake;
  else
    if p_lane in ('ocr','structured_parse','none') then
      select * into v_ing from clara.document_processing_tasks
        where document_id=v_doc and lane=p_lane
        order by version_n desc, id desc limit 1;
      if found and v_ing.status in ('failed','queued')
         and lower(btrim(coalesce(i.declared_mime,''))) is distinct from lower(btrim(coalesce(d.mime_type,''))) then
        v_rrefuse := jsonb_build_object('reason','mime_mismatch',
          'document_mime',d.mime_type,'upload_mime',i.declared_mime);
      elsif found and v_ing.status='queued' then
        v_rmode := 'echo'; v_rtask := v_ing.id; v_rvn := v_ing.version_n;
      elsif found and v_ing.status='failed' then
        if coalesce(v_ing.error_code,'') not in ('engine_error','timeout','engine_lost','storage_error') then
          v_rrefuse := jsonb_build_object('reason','not_retryable','error_code',v_ing.error_code,
            'remedy','this document could not be read in its current form. That can mean the file itself, or that the reading service refused the request. If the file is sound, it may read on a later attempt; a corrected or re-exported file is new bytes and takes the ordinary pipeline.');
        elsif exists (select 1 from clara.document_processing_tasks pit
             where pit.document_id=v_doc and pit.lane=p_lane
               and pit.status in ('queued','held_egress','running')) then
          v_rrefuse := jsonb_build_object('reason','lane_busy');
        else
          select coalesce(sum(attempt_count),0)::int into v_attempts
            from clara.document_processing_tasks
            where document_id=v_doc and lane=p_lane;
          if v_attempts >= 3 then
            v_rrefuse := jsonb_build_object('reason','attempt_cap','attempts',v_attempts);
          else
            select coalesce(max(version_n),0)+1 into v_rvn
              from clara.document_processing_tasks
              where document_id=v_doc and lane=p_lane;
            insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
                version_n,lane,status)
              values(i.firm_id,v_doc,p_engine_id,coalesce(p_engine_config,'{}'::jsonb),v_rvn,p_lane,'queued')
              on conflict (document_id,engine_id,version_n,lane) do nothing
              returning id into v_rtask;
            if v_rtask is null then
              raise exception 'impossible state: the intake recovery mint conflicted at (document=%,engine=%,version=%,lane=%) while this transaction holds the documents row FOR UPDATE',
                v_doc,p_engine_id,v_rvn,p_lane using errcode='CLR35';
            end if;
            v_rmode := 'mint';
            update clara.document_ingest_reservations set task_id=v_rtask where intake_id=p_intake;
          end if;
        end if;
      end if;
      if v_rtask is not null then
        v_recovery := jsonb_build_object('task_id',v_rtask,'lane',p_lane,'version_n',v_rvn,
          'engine_id',(select engine_id from clara.document_processing_tasks where id=v_rtask),
          'storage_path',d.storage_path,'sha256',d.sha256,'mime_type',d.mime_type,
          'format',substring(d.storage_path from '[.]([a-z0-9]{1,12})$'),'mode',v_rmode);
      end if;
    end if;
    if v_rmode is distinct from 'mint' then
      perform clara._refund_document_reservation(i.firm_id,p_intake,'duplicate-adopted');
    end if;
    select id into v_task from clara.document_processing_tasks
      where document_id=v_doc and engine_id=p_engine_id and lane=p_lane
      order by version_n desc limit 1;
    if v_rtask is not null then v_task := v_rtask; end if;
  end if;

  if p_client is not null then
    perform clara.assert_client_resolved(p_client,p_resolution,v_doc);
    select id into v_filing from clara.document_filings
      where document_id=v_doc and client_id=p_client and retired_at is null for share;
    if v_filing is null then
      select method into v_basis from clara.client_resolutions where id=p_resolution;
      insert into clara.document_filings(firm_id,document_id,client_id,filed_by,resolution_id,basis)
        values(i.firm_id,v_doc,p_client,i.uploaded_by,p_resolution,
          -- MF-2 fix: the ORIGINAL two-arm case (`when v_basis='rule' then 'rule' else 'human'
          -- end`) folded a judgement resolution into basis='human' -- exactly the hazard the
          -- new congruence wall in _tf_stamp_document_pipeline would now refuse at INSERT
          -- (correctly), but the honest fix is here, at the source of the wrong value.
          case when v_basis='rule' then 'rule' when v_basis='judgement' then 'judgement' else 'human' end) returning id into v_filing;
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
      'upgraded',v_upgraded)
    || case when v_recovery is null then '{}'::jsonb
            else jsonb_build_object('recovery',v_recovery) end
    || case when v_rrefuse is null then '{}'::jsonb
            else jsonb_build_object('recovery_refused',v_rrefuse) end);
end $$;

reset role;

-- =====================================================================
-- SS3. Postcheck (AM-1 fold, template 0090:1062-1100; annexes-2 Annex J cell 71). Re-runnable
-- and forceable both ways -- unlike 0018's one-shot tail, this block can observe its OWN CoR.
-- =====================================================================
do $postcheck$
declare
  v_src text; v_sha text; v_n int;
  v_f uuid; v_u uuid; v_c uuid; v_doc uuid;
  v_res_judgement uuid; v_res_agent uuid; v_res_human uuid;
  v_scope_plan uuid; v_scope_reg uuid; v_res_bound_judgement uuid;
  v_probe_ok boolean;
begin
  -- ---- prosrc marker: each of the SEVEN IN-list-shaped EXTEND bodies' live text names
  -- 'judgement' AND still names 'human'/'rule' (extend-never-weaken). finalize_document_intake
  -- (row 8) is checked separately below -- its CASE shape carries no `in (...)` list to search
  -- for, which is exactly the census blind spot MF-2 found. ----
  for v_src in
    select prosrc from pg_proc
      where pronamespace = 'clara'::regnamespace
        and proname in ('assert_client_resolved', '_tf_stamp_document_pipeline',
          '_file_document_write', '_seed_verified_document',
          'propose_wrong_client_correction', 'approve_wrong_client_correction')
  loop
    if position('judgement' in v_src) = 0 then
      raise exception 'f_a7_alpha2 postcheck: an EXTEND body is missing the judgement marker' using errcode = 'CLR10';
    end if;
    if position('''human''' in v_src) = 0 or position('''rule''' in v_src) = 0 then
      raise exception 'f_a7_alpha2 postcheck: an EXTEND body dropped human/rule (weakened, not extended)' using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- the IN-list-pattern census (Annex H's original instrument, corrected scope): exactly
  -- these SIX carry the literal `'human','rule'` list-shaped predicate today. Body 8
  -- (finalize_document_intake) is EXCLUDED here deliberately -- it never carried this shape,
  -- so including it in the exclusion list would hide a future regression of THIS instrument
  -- rather than prove anything about that body. ----
  select count(*) into v_n from pg_proc
    where pronamespace = 'clara'::regnamespace
      and (prosrc ~ '''human''\s*,\s*''rule''' or prosrc ~ '''rule''\s*,\s*''human''')
      and proname not in ('assert_client_resolved','assert_client_resolved_bound',
        '_tf_stamp_document_pipeline','_file_document_write','_seed_verified_document',
        'propose_wrong_client_correction','approve_wrong_client_correction');
  if v_n <> 0 then
    raise exception 'f_a7_alpha2 postcheck: an UNACCOUNTED body carries the bare list-shaped two-value predicate (% found outside the census six) -- stop and re-census, never guess', v_n using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_proc
    where pronamespace = 'clara'::regnamespace
      and proname in ('assert_client_resolved','_tf_stamp_document_pipeline',
        '_file_document_write','_seed_verified_document',
        'propose_wrong_client_correction','approve_wrong_client_correction')
      and prosrc ~ '''human''\s*,\s*''rule''\s*,\s*''judgement''';
  if v_n <> 6 then
    raise exception 'f_a7_alpha2 postcheck: expected all six list-shaped EXTEND bodies to carry the human,rule,judgement predicate verbatim in that order; got %', v_n using errcode = 'CLR10';
  end if;

  -- ---- body 8, finalize_document_intake: its OWN shape (a two-arm CASE, no IN-list) gets its
  -- OWN marker -- the three-way case naming judgement between the rule arm and the human
  -- fallback, verbatim. ----
  select prosrc into v_src from pg_proc
    where proname = 'finalize_document_intake' and pronamespace = 'clara'::regnamespace;
  if position('whenv_basis=''judgement''then''judgement''' in regexp_replace(lower(v_src), '\s+', '', 'g')) = 0 then
    raise exception 'f_a7_alpha2 postcheck: finalize_document_intake is missing the judgement CASE arm (MF-2 unresolved)' using errcode = 'CLR10';
  end if;
  if position('whenv_basis=''rule''then''rule''' in regexp_replace(lower(v_src), '\s+', '', 'g')) = 0 then
    raise exception 'f_a7_alpha2 postcheck: finalize_document_intake dropped its rule CASE arm (weakened, not extended)' using errcode = 'CLR10';
  end if;

  -- ---- the structural congruence wall (MF-2's backstop): _tf_stamp_document_pipeline's
  -- document_filings arm now names the basis<->method equality check. ----
  select prosrc into v_src from pg_proc
    where proname = '_tf_stamp_document_pipeline' and pronamespace = 'clara'::regnamespace;
  if position('filing basis (%) does not match its resolution' in v_src) = 0 then
    raise exception 'f_a7_alpha2 postcheck: _tf_stamp_document_pipeline is missing the MF-2 basis<->method congruence wall' using errcode = 'CLR10';
  end if;

  -- ---- D-16: assert_client_resolved_bound STAYS two-value, unchanged from the prestate pin ----
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara.assert_client_resolved_bound(uuid,uuid,text,uuid)'::regprocedure;
  if v_sha is distinct from '58b8b0fdecebd23fcc75970cce0944d6381a9f2ee8ad5dfb5462aeaa35aadd05' then
    raise exception 'f_a7_alpha2 postcheck: assert_client_resolved_bound moved -- D-16 says it stays two-value, no CoR' using errcode = 'CLR10';
  end if;

  -- ---- _file_document_write stays ungranted after this file's own CREATE OR REPLACE.
  -- CREATE OR REPLACE preserves a pre-existing ACL by Postgres contract, but alpha1's own
  -- review round found that contract insufficient to trust blind (a same-shape probe fn
  -- leaked to PUBLIC on plain CREATE) -- so this is re-PROVEN here by has_function_privilege,
  -- never assumed from the CoR mechanism alone. ----
  if has_function_privilege('public', 'clara._file_document_write(jsonb,uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('clara_authenticated', 'clara._file_document_write(jsonb,uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('clara_agent_ro', 'clara._file_document_write(jsonb,uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('clara_wake_interactive', 'clara._file_document_write(jsonb,uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('clara_wake_proactive', 'clara._file_document_write(jsonb,uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('clara_runtime', 'clara._file_document_write(jsonb,uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'f_a7_alpha2 postcheck: _file_document_write leaked EXECUTE after this file''s CoR' using errcode = 'CLR10';
  end if;

  -- ---- functional probes, forced-rollback subtransaction: fixtures minted and discarded,
  -- nothing commits (the 0018 idiom). ----
  begin
    v_f := gen_random_uuid(); v_u := gen_random_uuid(); v_c := gen_random_uuid(); v_doc := gen_random_uuid();
    insert into clara.firms(id, name) values (v_f, 'f_a7_alpha2 probe firm');
    insert into clara.users(id, display_name) values (v_u, 'f_a7_alpha2 probe user');
    insert into clara.clients(id, firm_id, name, status) values (v_c, v_f, 'f_a7_alpha2 probe client', 'active');
    insert into clara.documents(id, firm_id, sha256, original_filename, mime_type, byte_size, storage_path,
        bytes_verified_at, extraction_status, uploaded_by, page_count)
      values (v_doc, v_f, repeat('a', 64), 'probe.pdf', 'application/pdf', 100,
        'firms/' || v_f::text || '/docs/' || repeat('a', 64) || '.pdf',
        now(), 'pending', v_u, 1);

    v_res_judgement := gen_random_uuid();
    insert into clara.client_resolutions(id, firm_id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by)
      values (v_res_judgement, v_f, v_c, 'document', v_doc, 1.0, 'judgement', '{}'::jsonb, v_u);
    v_res_agent := gen_random_uuid();
    insert into clara.client_resolutions(id, firm_id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by)
      values (v_res_agent, v_f, v_c, 'document', v_doc, 1.0, 'agent', '{}'::jsonb, v_u);

    -- (a) accept-unbound: assert_client_resolved ADMITS the judgement resolution.
    begin
      perform clara.assert_client_resolved(v_c, v_res_judgement, v_doc);
    exception when sqlstate 'CLR01' then
      raise exception 'f_a7_alpha2 functional: assert_client_resolved REJECTED a judgement resolution' using errcode = 'CLR10';
    end;

    -- (b) the wall stays a wall: assert_client_resolved still REJECTS method=agent.
    v_probe_ok := false;
    begin
      perform clara.assert_client_resolved(v_c, v_res_agent, v_doc);
    exception when sqlstate 'CLR01' then v_probe_ok := true;
    end;
    if not v_probe_ok then
      raise exception 'f_a7_alpha2 functional: assert_client_resolved ADMITTED method=agent (D-1 violated)' using errcode = 'CLR10';
    end if;

    -- (c) D-16 reject-bound: a judgement resolution bound to an opening-seed scope is STILL
    -- refused by the bound assert -- a judged attribution may never satisfy a bound gate.
    insert into clara.onboarding_plans(id, firm_id, scope_kind, client_id, state)
      values (gen_random_uuid(), v_f, 'client', v_c, 'open') returning id into v_scope_plan;
    insert into clara.opening_seed_registry(id, firm_id, client_id, plan_id, as_of, state, created_by)
      values (gen_random_uuid(), v_f, v_c, v_scope_plan, date '2024-01-01', 'open', v_u) returning id into v_scope_reg;
    v_res_bound_judgement := gen_random_uuid();
    insert into clara.client_resolutions(id, firm_id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by, bound_scope_kind, bound_scope_id)
      values (v_res_bound_judgement, v_f, v_c, 'manual', v_scope_reg, 1.0, 'judgement', '{}'::jsonb, v_u,
        'opening_seed', v_scope_reg);
    v_probe_ok := false;
    begin
      perform clara.assert_client_resolved_bound(v_c, v_res_bound_judgement, 'opening_seed', v_scope_reg);
    exception when sqlstate 'CLR01' then v_probe_ok := true;
    end;
    if not v_probe_ok then
      raise exception 'f_a7_alpha2 functional: assert_client_resolved_bound ADMITTED a judgement resolution (D-16 violated)' using errcode = 'CLR10';
    end if;

    -- (d) AB-1 positive (cell 58): a fourth-method (judgement) resolution is ADMITTED by the
    -- document_filings BEFORE INSERT trigger.
    begin
      insert into clara.document_filings(firm_id, document_id, client_id, filed_by, resolution_id, basis)
        values (v_f, v_doc, v_c, v_u, v_res_judgement, 'judgement');
    exception when sqlstate 'CLR01' then
      raise exception 'f_a7_alpha2 functional: t_document_filings_stamp REJECTED a judgement-backed filing (AB-1 unresolved)' using errcode = 'CLR10';
    end;
    -- retire it so the next probe's active-filing uniqueness is not fighting this one.
    update clara.document_filings set retired_at = now(), retired_by = v_u, retirement_reason = 'probe cleanup'
      where document_id = v_doc and client_id = v_c and resolution_id = v_res_judgement;

    -- (e) AB-1 twin (cell 59): method=agent still raises CLR01 at the trigger.
    v_probe_ok := false;
    begin
      insert into clara.document_filings(firm_id, document_id, client_id, filed_by, resolution_id, basis)
        values (v_f, v_doc, v_c, v_u, v_res_agent, 'human');
    exception when sqlstate 'CLR01' then v_probe_ok := true;
    end;
    if not v_probe_ok then
      raise exception 'f_a7_alpha2 functional: t_document_filings_stamp ADMITTED an agent-method filing' using errcode = 'CLR10';
    end if;

    -- (f) MF-2 congruence NEGATIVE: the SAME judgement resolution used with a WRONG basis
    -- ('human') is refused by the new congruence wall -- proving the wall reads the real
    -- method, not merely the caller's claimed basis.
    v_probe_ok := false;
    begin
      insert into clara.document_filings(firm_id, document_id, client_id, filed_by, resolution_id, basis)
        values (v_f, v_doc, v_c, v_u, v_res_judgement, 'human');
    exception when sqlstate 'CLR01' then v_probe_ok := true;
    end;
    if not v_probe_ok then
      raise exception 'f_a7_alpha2 functional: the congruence wall ADMITTED basis=human on a judgement-method resolution (MF-2 unresolved)' using errcode = 'CLR10';
    end if;
    -- (f) MF-2 congruence twin, 'correction' EXEMPT: the same judgement resolution with
    -- basis='correction' is NOT refused by the congruence wall (rider 3 / cell 61's shape).
    begin
      insert into clara.document_filings(firm_id, document_id, client_id, filed_by, resolution_id, basis)
        values (v_f, v_doc, v_c, v_u, v_res_judgement, 'correction');
    exception when sqlstate 'CLR01' then
      raise exception 'f_a7_alpha2 functional: the congruence wall wrongly refused basis=correction on a judgement resolution (rider 3 would break)' using errcode = 'CLR10';
    end;
    update clara.document_filings set retired_at = now(), retired_by = v_u, retirement_reason = 'probe cleanup'
      where document_id = v_doc and client_id = v_c and resolution_id = v_res_judgement and retired_at is null;

    -- (g) MF-1 NEGATIVE, through the ACTUAL function call path (not a raw insert): a judgement
    -- resolution scoped to v_doc is refused CLR01 when the caller names a DIFFERENT document --
    -- the subject-less fallback must never launder it into a fresh 'human' mint.
    declare v_doc2 uuid;
    begin
      v_doc2 := gen_random_uuid();
      insert into clara.documents(id, firm_id, sha256, original_filename, mime_type, byte_size, storage_path,
          bytes_verified_at, extraction_status, uploaded_by, page_count)
        values (v_doc2, v_f, repeat('b', 64), 'probe2.pdf', 'application/pdf', 100,
          'firms/' || v_f::text || '/docs/' || repeat('b', 64) || '.pdf',
          now(), 'pending', v_u, 1);
      v_probe_ok := false;
      begin
        perform clara._file_document_write(jsonb_build_object('firm', v_f, 'actor', v_u),
          v_doc2, v_c, v_res_judgement::text, 'f_a7_alpha2_probe_mf1');
      exception when sqlstate 'CLR01' then v_probe_ok := true;
      end;
      if not v_probe_ok then
        raise exception 'f_a7_alpha2 functional: _file_document_write ADMITTED a judgement resolution for the WRONG document (MF-1 unresolved -- laundering path open)' using errcode = 'CLR10';
      end if;
      -- and no stray resolution was minted for v_doc2 by the (correctly refused) attempt.
      if exists(select 1 from clara.client_resolutions where subject_id = v_doc2) then
        raise exception 'f_a7_alpha2 functional: a refused MF-1 attempt still minted a resolution for the wrong document' using errcode = 'CLR10';
      end if;
    end;

    -- Force the subtransaction to unwind so no fixture row commits.
    raise exception 'clara_f_a7_alpha2_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null;  -- expected: fixtures discarded
  end;

  raise notice 'f_a7_alpha2 postcheck: OK -- 7/7 EXTEND bodies (six list-shaped + finalize_document_intake''s own CASE) carry judgement, assert_client_resolved_bound unchanged (D-16), the census names exactly the expected bodies and no others, the MF-2 congruence wall is present and functionally proven both ways, MF-1''s subject-less fallback correctly refuses a wrong-document judgement resolution through the real function call, and every other probe (accept-unbound, agent-still-refused, bound-still-refuses-judgement, trigger-admits-judgement, trigger-still-refuses-agent) passed inside a forced-rollback subtransaction';
end
$postcheck$;
