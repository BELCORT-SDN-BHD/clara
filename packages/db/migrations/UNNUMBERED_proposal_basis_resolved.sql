-- UNNUMBERED_proposal_basis_resolved.sql -- 裁-22 (docs/plan/active/mohe-grill-rulings-
-- 2026-08-28.md): agent proposal bases become DB-RESOLVED citations. Number claimed at MERGE
-- (standing law, AGENTS.md + .claude/rules/db-migrations.md). Authored against a main frontier
-- of 0142_fa7b_pr_a_client_onboarding_open.
--
-- THE GAP THIS FILE CLOSES. `clara._write_entry_evidence` (0009) already resolves a journal-
-- entry's cited region against a real `clara.document_regions` row of the entry's own document
-- before it ever lands in the books (id-equality, quote-recoverable; 0054 layered a stable
-- per-region `idx` ordinal on top of that same wall so the toolface never transcribes a UUID,
-- but the WALL itself has always been unconditional). The two proposal doors this file touches
-- never got that wall: `propose_client_identifier_promotion`
-- (0103_f_a7_pi_additive.sql:833-864's `_identifier_promotion_core`, reached only through
-- 0126_f_a7_beta_filing_verb.sql:1593's `wake_propose_identifier_promotion`) and
-- `wake_propose_client_onboarding` (0142:360-509) both checked only the SHAPE of a `basis` (a
-- non-empty citations array, a positive sightings number) and persisted it VERBATIM --
-- `{"sightings":1,"citations":[null]}` was admitted. Found by the F-A7b PR-a review (Codex
-- HIGH-1). Owner-ruled 2026-08-29, "要，beta 前，两门一起改" -- both doors, one migration.
--
-- THE CITATION SHAPE, SETTLED BY CENSUS (the ruling's own instruction: "census which the agent
-- is given, and accept THAT; do not invent a third shape"). Neither door has a live runtime
-- caller today -- grepped clean across packages/runtime, apps/web and apps/dashboard; the only
-- callers anywhere in this tree are the two DB rig test files this migration also updates. There
-- is no existing agent-facing `idx` contract for these doors to inherit (unlike
-- get_document_extract's toolface, whose runtime wrapper resolves idx->region_id BEFORE the DB
-- is ever called -- `_write_entry_evidence` itself has ALWAYS received a bare `region_id`, its
-- own p_evidence shape, 0009:411-472). The one existing DB-boundary precedent for a typed
-- citation into a region is `wake_file_document`'s own Tier-A verdict shape (0126,
-- `verdict.citations: [{"region_id": ...}]`, exercised at f-a7-beta-filing-verb.test.mjs:592).
-- This file's resolver adopts that SAME key, `region_id`, rather than inventing a third shape.
--
-- THE DOCUMENT-SET WIDENING (minted mid-build, before this signature ever reached a census or
-- roster): a THIRD consumer surfaced -- 裁-18b (`docs/plan/active/binding-proposal-design.md`,
-- branch `docs/design-binding-proposal`, gate question G2) proposes a vendor-identity binding
-- whose basis spans up to three separate evidence documents, not one. `_resolve_proposal_basis`
-- therefore takes a document SET, `p_documents uuid[]`, never a bare `p_document uuid`: every
-- element of the set is proven to be a real document of `p_firm` up front (fail-closed on any
-- foreign or null member, whether or not a citation ever names it), and each citation resolves
-- against ANY document in that set -- firm-congruent, CURRENT generation, checked against THAT
-- citation's own resolved document, never the whole set at once (current-generation is a
-- per-document fact). The resolved basis records which document each region belongs to;
-- `sightings` is the count of distinct resolved regions across the whole set. Both of THIS
-- file's doors are single-document, so both wrap their one document as `array[p_document]` at
-- the call site -- their own parameter lists stay `p_document uuid`, unchanged by the widening.
--
-- THE CITATION-KIND DISCRIMINATOR (minted mid-build, a second cross-lane note): a FOURTH
-- consumer is already designed but not yet built -- 裁-21's COA-template door
-- (`docs/plan/active/coa-template-design.md`, branch `docs/design-coa-template`,
-- `wake_propose_coa_template_trim`) will carry a basis whose citations are `client_facts` rows
-- (trade_nature, msic), not document regions at all. Rather than force a SECOND signature change
-- onto every caller when that arm lands, every citation element carries a `kind` (default
-- `'region'` when absent, so today's two doors' existing `{"region_id":...}` shape needs no
-- change), and the resolver DISPATCHES on it. Only `kind='region'` is implemented here; any
-- other value -- including the RESERVED-but-unbuilt `'fact'` -- refuses fail-closed with the
-- same typed `basis_unresolved` reason, so neither of today's two doors can accidentally admit
-- a fact citation before that arm exists, and 裁-21's own door (when built) adds a `kind='fact'`
-- arm to this SAME function rather than minting a second resolver or a third citation shape.
--
-- THE SIGNATURE CHANGE THIS FORCED ON DOOR 1. `wake_propose_identifier_promotion` carried NO
-- document parameter at all -- an identifier promotion had no notion of which document evidenced
-- it. This file adds `p_document uuid` to that door (a genuine, deliberate signature widening,
-- not a CoR): a promotion is now, honestly, evidenced by the ONE document Clara was processing
-- when she proposed it, exactly like the onboarding door already requires. Because a function's
-- PARAMETER LIST cannot change under CREATE OR REPLACE without leaving the old overload shadow-
-- reachable (the exact "shadowed door" class 0054's own prestate 0.2 was authored to catch), the
-- old 8-arg body is explicitly DROPped before the new 9-arg one is created.
--
-- WHAT STAYS UNTOUCHED, NAMED SO A REVIEWER DOES NOT HAVE TO RE-DERIVE IT. `clara.
-- _identifier_promotion_core` (0103:833-864) is BYTE-IDENTICAL after this file (the tail re-pins
-- its prosrc sha) -- it stays the dumb, trusting INSERT it always was; every new judgement lives
-- once, in the shared resolver, called from the wrapper before the core ever sees a citation.
-- `client_identifier_promotions`'s five CHECKs are UNCHANGED -- 裁-22's own words, "they are a
-- floor under the resolver": the resolver's typed refusal is a NEW gate ABOVE that floor, never
-- a replacement. `firm_open_questions`'s CHECKs, `_firm_question_core`, `name_family_is_
-- ambiguous`, the firm-narrow egress-authorization walls, and every other rung either door
-- already carried are preserved verbatim (the tail proves every prior wall string byte-present).
--
-- THE ORDERING LAW BOTH DOORS SHARE (the F-A7b PR-a review's own reserve-first finding,
-- restated because it applies again): resolution runs AFTER `_reserve_op`, never before. A
-- genuine replay on the same op_key is served straight from the reservation cache and never
-- re-resolves; a caller that changes its basis under the SAME op_key still refuses through the
-- existing op-key-reused-with-different-args wall. Door 1 resolves immediately after
-- reservation. Door 2 resolves AFTER its firm-narrow egress authorization is proven live but
-- BEFORE that authorization is consumed -- a citation that fails to resolve must never burn a
-- one-time-use authorization on a proposal that is about to refuse anyway.
--
-- THE SIGHTINGS LAW: DERIVED, NEVER THE CALLER'S. `sightings` on both doors' persisted records
-- is now the COUNT OF DISTINCT RESOLVED REGIONS the resolver actually walked -- never the
-- caller's claimed number. The caller's original claim is kept, honestly, as a NON-AUTHORITATIVE
-- annotation: a new `client_identifier_promotions.sightings_claimed` column for Door 1 (its
-- `citations`/`sightings` columns are typed and CHECKed, so the annotation needed a column of its
-- own); `onboarding_agent_receipts.verdict` / `firm_open_questions.candidates` are both freeform
-- jsonb for Door 2, so its annotation rides inside the same `basis` object as `sightings_model`.
--
-- D1 WRITE-QUIESCE INVENTORY -- TWO LIVE AUDITED WRITER BODIES REPLACED, BOTH `filing`-wake-kind-
-- only (credential class: `clara_wake_filing` exclusively; no interactive/proactive/bank/runtime
-- reach on either, before or after this file -- measured live, not assumed):
--   1. clara.wake_propose_identifier_promotion -- DROP the live 8-arg body
--      (uuid,text,text,int,jsonb,text,jsonb,text), CREATE the 9-arg body
--      (uuid,uuid,text,text,int,jsonb,text,jsonb,text).
--   2. clara.wake_propose_client_onboarding -- CREATE OR REPLACE, same 7-arg signature
--      (uuid,text,jsonb,text,jsonb,uuid,text). ACL/allowlist row untouched by CoR.
-- `clara._identifier_promotion_core` is explicitly NOT in this inventory -- untouched, its
-- prosrc sha re-pinned byte-identical at the tail.
--
-- MIGRATION NUMBER claimed at MERGE time. Rig-authored and replayed as 0143 against a fresh
-- chain baselined through 0142 (frontier confirmed live); the numbered copy is never committed.

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every claim measured, never assumed.
-- =====================================================================================
do $pre$
declare v_src text; v_sha text; v_def text;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0142_fa7b_pr_a_client_onboarding_open') then
    raise exception 'proposal_basis_resolved prestate: 0142_fa7b_pr_a_client_onboarding_open is not applied -- frontier mismatch'
      using errcode = 'CLR10';
  end if;

  if to_regprocedure('clara._resolve_proposal_basis(uuid[],uuid,jsonb)') is not null then
    raise exception 'proposal_basis_resolved prestate: clara._resolve_proposal_basis already exists -- already applied'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'clara.client_identifier_promotions'::regclass
                and a.attnum > 0 and not a.attisdropped and a.attname = 'sightings_claimed') then
    raise exception 'proposal_basis_resolved prestate: client_identifier_promotions already carries sightings_claimed'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)') is not null then
    raise exception 'proposal_basis_resolved prestate: the new 9-arg wake_propose_identifier_promotion already exists'
      using errcode = 'CLR10';
  end if;

  -- The EXACT live bodies being DROPped/replaced, by prosrc sha256 (the 0090 idiom).
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.wake_propose_identifier_promotion(uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure;
  if v_src is null then
    raise exception 'proposal_basis_resolved prestate: the live 8-arg wake_propose_identifier_promotion is GONE'
      using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '0ece787415799ae470b2bb241e8c5f1d8d55c0f3b7c68841358792bc184d52ee' then
    raise exception 'proposal_basis_resolved prestate: wake_propose_identifier_promotion(uuid,text,text,int,jsonb,text,jsonb,text) prosrc sha256 mismatch (got %, expected 0ece787415799ae470b2bb241e8c5f1d8d55c0f3b7c68841358792bc184d52ee)', v_sha
      using errcode = 'CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)'::regprocedure;
  if v_src is null then
    raise exception 'proposal_basis_resolved prestate: clara.wake_propose_client_onboarding is GONE' using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '656f4bef824026e5f5bad12bf8696d3a470539e1e7c2afd44bf5890e925c41f4' then
    raise exception 'proposal_basis_resolved prestate: wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text) prosrc sha256 mismatch (got %, expected 656f4bef824026e5f5bad12bf8696d3a470539e1e7c2afd44bf5890e925c41f4)', v_sha
      using errcode = 'CLR10';
  end if;

  -- `_identifier_promotion_core` is the body this file MUST NOT touch -- pinned so the tail's
  -- re-pin is a real before/after comparison.
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)'::regprocedure;
  if v_src is null then
    raise exception 'proposal_basis_resolved prestate: clara._identifier_promotion_core is GONE' using errcode = 'CLR10';
  end if;
  create temp table _proposal_basis_pre(k text primary key, v text);
  insert into _proposal_basis_pre values ('core_sha', encode(sha256(convert_to(v_src,'UTF8')),'hex'));

  -- The floor this file must not move: client_identifier_promotions' citations/sightings CHECKs,
  -- read byte-exact from the live catalog.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.client_identifier_promotions'::regclass
     and conname = 'client_identifier_promotions_citations_check';
  if v_def is distinct from
     'CHECK (((jsonb_typeof(citations) = ''array''::text) AND (jsonb_array_length(citations) >= 1)))' then
    raise exception 'proposal_basis_resolved prestate: client_identifier_promotions_citations_check is not the live floor (live: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;
  insert into _proposal_basis_pre values ('citations_check', v_def);
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.client_identifier_promotions'::regclass
     and conname = 'client_identifier_promotions_sightings_check';
  if v_def is distinct from 'CHECK ((sightings >= 1))' then
    raise exception 'proposal_basis_resolved prestate: client_identifier_promotions_sightings_check is not the live floor (live: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;
  insert into _proposal_basis_pre values ('sightings_check', v_def);

  if to_regclass('clara.document_regions') is null or to_regclass('clara.document_extractions') is null
     or to_regclass('clara.documents') is null then
    raise exception 'proposal_basis_resolved prestate: document_regions/document_extractions/documents absent'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'document_extractions'
        and column_name in ('document_id','engine_kind','version_n','status','firm_id')
      having count(*) = 5) then
    raise exception 'proposal_basis_resolved prestate: document_extractions does not carry the five columns the resolver reads'
      using errcode = 'CLR10';
  end if;

  if (select count(*) from clara.wake_fn_allowlist
       where wake_kind = 'filing' and function_name = 'wake_propose_identifier_promotion') <> 1
     or (select count(*) from clara.wake_fn_allowlist
       where wake_kind = 'filing' and function_name = 'wake_propose_client_onboarding') <> 1 then
    raise exception 'proposal_basis_resolved prestate: expected exactly one filing-allowlist row for each door'
      using errcode = 'CLR10';
  end if;

  raise notice 'proposal_basis_resolved prestate: clean -- frontier 0142, both live bodies pinned by exact prosrc sha256, _identifier_promotion_core pinned as the DO-NOT-TOUCH baseline, the citations/sightings CHECK floor read byte-exact, prerequisites present, both allowlist rows present exactly once, sightings_claimed and the new resolver/9-arg overload both absent';
end
$pre$;

-- =====================================================================================
-- SECTION 1 -- THE SHARED RESOLVER, over a DOCUMENT SET (p_documents uuid[] -- 裁-18b's
-- widening, header above). Ungranted internal helper, exactly like
-- clara._write_entry_evidence and clara._identifier_promotion_core.
-- =====================================================================================
set role clara_fn_owner;

create function clara._resolve_proposal_basis(p_documents uuid[], p_firm uuid, p_basis jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_docs uuid[];
  v_doc_count int;
  v_citations jsonb;
  e record;
  v_kind text;
  v_region uuid;
  v_row record;
  v_current uuid;
  v_resolved jsonb := '[]'::jsonb;
  v_seen uuid[] := '{}'::uuid[];
begin
  if p_documents is null or coalesce(array_length(p_documents,1),0) = 0 or p_firm is null then
    raise exception 'a proposal basis needs its firm and at least one triggering document' using errcode = 'CLR10',
      detail = jsonb_build_object('reason','basis_unresolved','element',null)::text;
  end if;
  if exists (select 1 from unnest(p_documents) d(id) where d.id is null) then
    raise exception 'a proposal basis document set may not contain a null document id' using errcode = 'CLR10',
      detail = jsonb_build_object('reason','basis_unresolved','element',null)::text;
  end if;
  -- The WHOLE set is proven real + firm-congruent up front, fail-closed, whether or not every
  -- member ends up cited -- a caller may never smuggle a foreign document into the set at all.
  select array_agg(distinct id) into v_docs from unnest(p_documents) d(id);
  select count(*) into v_doc_count from clara.documents d where d.id = any(v_docs) and d.firm_id = p_firm;
  if v_doc_count <> array_length(v_docs,1) then
    raise exception 'a proposal basis document set names a document that is not in this firm' using errcode = 'CLR10',
      detail = jsonb_build_object('reason','basis_unresolved','element',null)::text;
  end if;

  if p_basis is null or jsonb_typeof(p_basis) <> 'object' then
    raise exception 'a proposal basis must be a well-formed object' using errcode = 'CLR10',
      detail = jsonb_build_object('reason','basis_unresolved','element',p_basis)::text;
  end if;
  v_citations := p_basis->'citations';
  if jsonb_typeof(v_citations) is distinct from 'array' or jsonb_array_length(v_citations) < 1 then
    raise exception 'a proposal basis needs at least one citation' using errcode = 'CLR10',
      detail = jsonb_build_object('reason','basis_unresolved','element',v_citations)::text;
  end if;

  for e in select elem from jsonb_array_elements(v_citations) as z(elem) loop
    -- KIND DISPATCH (裁-21's own reserved widening, header above). Absent kind on a well-formed
    -- object defaults to 'region' (today's two doors' only shape, unchanged); any non-object
    -- element or any OTHER kind -- including the reserved-but-unbuilt 'fact' -- refuses
    -- fail-closed here, before this loop's region-resolution arm ever runs. This is the ONE
    -- dispatch point a future kind='fact' arm joins; nothing else in this function changes.
    v_kind := null;
    if jsonb_typeof(e.elem) = 'object' then
      v_kind := coalesce(nullif(btrim(coalesce(e.elem->>'kind','')),''), 'region');
    end if;
    if v_kind is distinct from 'region' then
      raise exception 'this proposal basis citation kind is not resolvable by this door' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','basis_unresolved','element',e.elem)::text;
    end if;

    -- Every malformed shape (a region_id that is missing or not valid uuid text) funnels here
    -- rather than raising its own distinct error -- the same "one exception handler, one typed
    -- refusal" idiom clara._write_entry_evidence's own region_id parse uses (0009:435-440).
    v_region := null;
    begin
      v_region := (e.elem->>'region_id')::uuid;
    exception when others then
      v_region := null;
    end;
    if v_region is null then
      raise exception 'a proposal citation must name a real region_id' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','basis_unresolved','element',e.elem)::text;
    end if;

    -- Firm-congruent VIA THE DOCUMENT, resolved against ANY document in the (already-validated)
    -- set -- document_extractions/document_regions both carry their own firm_id (denormalized,
    -- the estate's own convention), but the binding fact is "this region belongs to one of the
    -- proposal's own documents".
    select r.id, r.extraction_id, de.document_id, de.firm_id, de.engine_kind
      into v_row
      from clara.document_regions r
      join clara.document_extractions de on de.id = r.extraction_id
      where r.id = v_region;

    if v_row.id is null or v_row.firm_id is distinct from p_firm
       or not (v_row.document_id = any(v_docs)) then
      raise exception 'a proposal citation does not resolve to a live region of this proposal''s document set'
        using errcode = 'CLR10', detail = jsonb_build_object('reason','basis_unresolved','element',e.elem)::text;
    end if;

    -- CURRENT extraction generation, checked against THIS citation's own resolved document
    -- (current-generation is a per-document fact, never a whole-set one): the identical "chosen"
    -- predicate clara.get_document_extract's region_json CTE has aggregated by since 0009, recut
    -- by 0054 as `distinct on (engine_kind) ... order by engine_kind, version_n desc, id desc`
    -- among status='done' rows -- the newest done extraction per (document, engine_kind), never
    -- a superseded generation, and never one that has not finished at all.
    select de2.id into v_current
      from clara.document_extractions de2
     where de2.document_id = v_row.document_id and de2.engine_kind = v_row.engine_kind and de2.status = 'done'
     order by de2.version_n desc, de2.id desc limit 1;
    if v_row.extraction_id is distinct from v_current then
      raise exception 'a proposal citation cites a superseded extraction generation, or an extraction that never completed'
        using errcode = 'CLR10', detail = jsonb_build_object('reason','basis_unresolved','element',e.elem)::text;
    end if;

    if not (v_region = any(v_seen)) then
      v_seen := v_seen || v_region;
      v_resolved := v_resolved || jsonb_build_array(jsonb_build_object(
        'region_id', v_row.id, 'extraction_id', v_row.extraction_id, 'document_id', v_row.document_id));
    end if;
  end loop;

  return jsonb_build_object('citations', v_resolved, 'sightings', coalesce(array_length(v_seen,1),0));
end $fn$;
comment on function clara._resolve_proposal_basis(uuid[],uuid,jsonb) is
  '裁-22 (widened for 裁-18b, docs/plan/active/binding-proposal-design.md G2, and for the '
  '裁-21 kind reservation, docs/plan/active/coa-template-design.md): the shared resolver every '
  'proposal door calls AFTER its own _reserve_op, never before -- a genuine replay is served '
  'from the reservation cache without re-resolving. p_documents is a SET (a single-document door '
  'passes array[p_document]): every member is proven real + firm-congruent up front. Every '
  'citation carries a kind (absent defaults to ''region'', today''s only implemented arm; any '
  'other value, including the RESERVED-but-unbuilt ''fact'' -- 裁-21''s COA-template door -- '
  'refuses fail-closed); a region citation names a region_id (the SAME key clara.'
  '_write_entry_evidence''s own p_evidence shape and wake_file_document''s Tier-A verdict.'
  'citations already use at this DB boundary -- no third shape invented) that resolves to a '
  'clara.document_regions row of SOME document in the set, at THAT document''s CURRENT (newest '
  'done, per engine_kind) extraction generation. Any null, malformed, unknown-kind, foreign-'
  'document, foreign-firm or stale-generation citation refuses CLR10 basis_unresolved, naming '
  'the offending element in DETAIL. Returns the RESOLVED basis: the distinct resolved regions '
  '(region_id + extraction_id + which document each belongs to, first-seen order, deduped) and '
  'sightings DERIVED as their count across the whole set -- never the caller''s claimed number. '
  'Ungranted: reachable only from inside a SECURITY DEFINER door, exactly like '
  '_write_entry_evidence and _identifier_promotion_core.';
revoke all on function clara._resolve_proposal_basis(uuid[],uuid,jsonb) from public;

reset role;

-- The parse-analysis probes. `language sql` bodies are FULLY analyzed at CREATE (unlike
-- plpgsql, whose statements plan lazily -- 0054's own header), so these prove the resolver's
-- real queries are valid against THIS catalog's actual columns/joins -- a typo fails the WHOLE
-- migration transaction rather than surfacing on the first live call. pg_temp: session-scoped,
-- never granted, gone when this connection ends.
create function pg_temp._x_proposal_basis_docset_planprobe(p_documents uuid[], p_firm uuid)
  returns bigint language sql stable as $probe0$
  select count(*) from clara.documents d where d.id = any(p_documents) and d.firm_id = p_firm;
$probe0$;

create function pg_temp._x_proposal_basis_region_planprobe(p_region uuid)
  returns table(id uuid, extraction_id uuid, document_id uuid, firm_id uuid, engine_kind text)
  language sql stable as $probe1$
  select r.id, r.extraction_id, de.document_id, de.firm_id, de.engine_kind
    from clara.document_regions r
    join clara.document_extractions de on de.id = r.extraction_id
   where r.id = p_region;
$probe1$;

create function pg_temp._x_proposal_basis_generation_planprobe(p_document uuid, p_engine_kind text)
  returns uuid language sql stable as $probe2$
  select de2.id from clara.document_extractions de2
   where de2.document_id = p_document and de2.engine_kind = p_engine_kind and de2.status = 'done'
   order by de2.version_n desc, de2.id desc limit 1;
$probe2$;

-- =====================================================================================
-- SECTION 2 -- client_identifier_promotions.sightings_claimed. ADD COLUMN only, no CHECK (an
-- honest, non-authoritative annotation of the caller's original claim -- nothing ever reads it
-- for a decision, so it is never constrained the way the DB-derived `sightings` column is).
-- =====================================================================================
alter table clara.client_identifier_promotions add column sightings_claimed int;
comment on column clara.client_identifier_promotions.sightings_claimed is
  '裁-22: the model''s ORIGINALLY claimed sightings count, kept as an honest annotation only. '
  '`sightings` above is DB-DERIVED (the count of distinct resolved document_regions) and is the '
  'authoritative column; this one is never read for a decision.';

-- =====================================================================================
-- SECTION 3 -- Door 1: clara.wake_propose_identifier_promotion gains the triggering document
-- + DB-resolved citations. Signature CHANGE (old 8-arg -> new 9-arg): CREATE OR REPLACE cannot
-- change a parameter list without leaving the OLD overload shadow-reachable, so this is an
-- explicit DROP + CREATE, not a CoR. Every prior wall string is preserved verbatim below; the
-- only NEW checks are p_document-not-null and the resolver call (wrapping its one document as
-- `array[p_document]`); the only CHANGED call is `_identifier_promotion_core`'s p_sightings/
-- p_citations arguments, now the RESOLVED values, never the caller's raw ones.
-- `_identifier_promotion_core` itself is untouched by this section.
-- =====================================================================================
set role clara_fn_owner;

drop function clara.wake_propose_identifier_promotion(uuid,text,text,int,jsonb,text,jsonb,text);

create function clara.wake_propose_identifier_promotion(
    p_client uuid, p_document uuid, p_kind text, p_value text, p_sightings int, p_citations jsonb,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare w record; v_dedupe jsonb; v_id uuid; v_resolved jsonb;
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
  v_dedupe := clara._reserve_op(w.firm_id,'wake_propose_identifier_promotion',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'document',p_document,'kind',p_kind,'value',p_value)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- 裁-22: RESOLUTION AFTER RESERVATION, deliberately. A single-document door passes its one
  -- document as a one-element set (裁-18b's own widening, header above).
  v_resolved := clara._resolve_proposal_basis(array[p_document], w.firm_id,
    jsonb_build_object('sightings', p_sightings, 'citations', p_citations));
  v_id := clara._identifier_promotion_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of,
    w.wake_kind, p_client, p_kind, p_value,
    (v_resolved->>'sightings')::int, v_resolved->'citations', p_rationale, p_model);
  -- The caller's ORIGINALLY claimed sightings, kept as an honest, non-authoritative annotation --
  -- client_identifier_promotions.sightings above is now DB-DERIVED, never p_sightings.
  -- _identifier_promotion_core's own INSERT is untouched (no sightings_claimed argument), so
  -- this is a second, deliberate write to the row this same call just minted, inside the same
  -- SECURITY DEFINER transaction -- the table carries no append-only trigger (only no-truncate;
  -- 0103 SS6's "settle in place" design), so this is a lawful, in-scope UPDATE.
  update clara.client_identifier_promotions set sightings_claimed = p_sightings where id = v_id;
  return clara._finish_op(w.firm_id,'wake_propose_identifier_promotion',p_op_key,
    jsonb_build_object('promotion_id', v_id));
end $fn$;
comment on function clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text) is
  '裁-22: gains p_document (the triggering document) and DB-resolves p_citations against it via '
  'clara._resolve_proposal_basis (called array[p_document]-wrapped, after _reserve_op). '
  'client_identifier_promotions.sightings is now DB-derived; the caller''s original claim is '
  'kept honestly in the new sightings_claimed column, annotation only. Every prior wall (op_key/'
  'rationale/model shape) is byte-preserved from the pre-裁-22 8-arg body. Delegates to the '
  'UNTOUCHED clara._identifier_promotion_core (0103), which stays reachable by nobody else.';
revoke all on function clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text) from public;
grant execute on function clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)
  to clara_wake_filing;

reset role;

-- =====================================================================================
-- SECTION 4 -- Door 2: clara.wake_propose_client_onboarding DB-resolves p_basis. Same
-- signature -- CREATE OR REPLACE preserves the ACL and the allowlist row untouched. Every
-- prior wall is byte-preserved verbatim below; the ONLY changes are the new resolver call
-- (placed AFTER the authorization is proven live but BEFORE it is consumed, its one document
-- wrapped as `array[p_document]`) and the two persistence sites, which now write the RESOLVED
-- basis instead of raw p_basis.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.wake_propose_client_onboarding(
    p_document uuid, p_proposed_name text, p_basis jsonb,
    p_rationale text, p_model jsonb, p_authorization uuid, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  w record; v_dedupe jsonb; v_receipt_id uuid; v_question_id uuid;
  v_name text; v_doc_firm uuid; v_doc_sha text; v_citations jsonb; v_auth record;
  v_resolved jsonb; v_resolved_basis jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_propose_client_onboarding');

  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  v_name := nullif(btrim(coalesce(p_proposed_name, '')), '');
  if v_name is null or length(v_name) > 500 then
    raise exception 'a client onboarding proposal needs a proposed name' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"proposed_name","constraint":"nonempty_le_500"}';
  end if;
  if nullif(btrim(coalesce(p_rationale, '')), '') is null then
    raise exception 'a client onboarding proposal must state its rationale' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  if p_model is null or jsonb_typeof(p_model) <> 'object'
     or nullif(btrim(coalesce(p_model->>'provider', '')), '') is null
     or nullif(btrim(coalesce(p_model->>'model', '')), '') is null
     or nullif(btrim(coalesce(p_model->>'version', '')), '') is null then
    raise exception 'a client onboarding proposal must name its model (provider, model, version)'
      using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"model_snapshot","constraint":"provider+model+version"}';
  end if;

  -- The evidentiary basis SHAPE floor (review law 2: absence is not evidence). UNCHANGED by
  -- 裁-22 -- this is the floor the resolver's own refusal now sits ABOVE, never a replacement.
  if p_basis is null or jsonb_typeof(p_basis) <> 'object' then
    raise exception 'a client onboarding proposal needs a well-formed basis' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"object"}';
  end if;
  v_citations := p_basis->'citations';
  if jsonb_typeof(v_citations) is distinct from 'array' or jsonb_array_length(v_citations) < 1
     or jsonb_typeof(p_basis->'sightings') is distinct from 'number'
     or (p_basis->>'sightings')::numeric < 1 then
    raise exception 'a client onboarding proposal needs >=1 sighting and >=1 citation in its basis'
      using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"sightings_and_citations"}';
  end if;

  if p_document is null then
    raise exception 'a client onboarding proposal needs the triggering document' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"document"}';
  end if;

  -- THE RESERVATION, HERE -- deliberately BEFORE every check below (mirrors _agent_file_
  -- document_core's own placement, 0126:892-895). The dedupe key is (document, proposed_name,
  -- basis, authorization) -- unchanged by this file; p_rationale/p_model/the credential stay
  -- OUTSIDE it, exactly as before.
  v_dedupe := clara._reserve_op(w.firm_id, 'wake_propose_client_onboarding', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'proposed_name', v_name,
      'basis', p_basis, 'authorization', p_authorization)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Locked FOR UPDATE, mirroring _agent_file_document_core's own idiom (0126:897).
  select firm_id, sha256 into v_doc_firm, v_doc_sha from clara.documents where id = p_document for update;
  if v_doc_firm is null or v_doc_firm <> w.firm_id then
    raise exception 'document not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"document"}';
  end if;

  -- A14, the negative acceptance step (design SS2): a name whose leading token collides with an
  -- existing client or counterparty family must never reach a proposal card.
  if clara.name_family_is_ambiguous(w.firm_id, v_name) then
    raise exception 'the proposed name collides with an existing client or counterparty family; open a collision question instead'
      using errcode = 'CLR10', detail = '{"reason":"name_family_collision","class":"proposed_name"}';
  end if;

  -- No second OPEN 'onboarding_proposed' question already sitting on this document.
  if exists (select 1 from clara.firm_open_questions q
              where q.document_id = p_document and q.kind = 'onboarding_proposed' and q.status = 'open') then
    raise exception 'an onboarding proposal is already open for this document' using errcode = 'CLR10',
      detail = '{"reason":"already_open","class":"onboarding_proposed"}';
  end if;

  -- The firm-narrow egress authorization: live, admissible purpose, bound to THIS document's
  -- sha256 and the 'attribution' moment (mirrors _agent_file_document_core's A9/B7 rungs).
  if p_authorization is null then
    raise exception 'a client onboarding proposal needs the egress authorization that produced it'
      using errcode = 'CLR28', detail = '{"reason":"no_live_egress_authorization"}';
  end if;
  select a.id, a.document_sha256, a.moment into v_auth
    from clara.firm_egress_dispatch_authorizations a
   where a.id = p_authorization and a.firm_id = w.firm_id and a.purpose = 'firm_narrow_intake'
     and a.invalidated_at is null and a.consumed_at is null and a.expires_at > statement_timestamp()
   for update;
  if v_auth.id is null or v_auth.document_sha256 is distinct from v_doc_sha
     or v_auth.moment <> 'attribution' then
    raise exception 'no live, admissible-purpose egress authorization for this proposal'
      using errcode = 'CLR28', detail = '{"reason":"no_live_egress_authorization"}';
  end if;

  -- 裁-22: RESOLUTION, here -- after the authorization is PROVEN live but BEFORE it is
  -- CONSUMED. A citation that fails to resolve must never burn a one-time-use authorization on
  -- a proposal that is about to refuse anyway. One document, wrapped as a one-element set
  -- (裁-18b's own widening, header above).
  v_resolved := clara._resolve_proposal_basis(array[p_document], w.firm_id, p_basis);
  v_resolved_basis := jsonb_build_object(
    'citations', v_resolved->'citations', 'sightings', v_resolved->'sightings',
    'sightings_model', p_basis->'sightings');

  update clara.firm_egress_dispatch_authorizations set consumed_at = statement_timestamp()
    where id = v_auth.id;

  insert into clara.onboarding_agent_receipts(firm_id, document_id, model, model_version,
      rationale, verdict, via_wake_kind, trigger_kind, trigger_id, authorization_id,
      acting_actor, on_behalf_of)
    values (w.firm_id, p_document, p_model->>'model', p_model->>'version', p_rationale,
      jsonb_build_object('proposed_name', v_name, 'basis', v_resolved_basis),
      w.wake_kind, 'wake_task', w.credential_id::text, p_authorization,
      clara.agent_user_id(), w.on_behalf_of)
    returning id into v_receipt_id;

  v_question_id := clara._firm_question_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of,
    w.wake_kind, p_document, 'onboarding_proposed',
    'Clara proposes opening a new client file for "' || v_name || '" from this document.',
    jsonb_build_array(jsonb_build_object('proposed_name', v_name, 'basis', v_resolved_basis)),
    v_receipt_id::text);

  return clara._finish_op(w.firm_id, 'wake_propose_client_onboarding', p_op_key,
    jsonb_build_object('question_id', v_question_id, 'receipt_id', v_receipt_id));
end $fn$;
comment on function clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text) is
  'F-A7b D-1b: Clara PROPOSES a new client file from a held, unattributed document (Q-D1 ALL-'
  'PROPOSE). Delegates to the EXISTING clara._firm_question_core with kind=''onboarding_'
  'proposed''; no new carrier. A14''s negative acceptance step is a hard refusal here, before '
  'any receipt is written. 裁-22: p_basis is now DB-resolved via clara._resolve_proposal_basis '
  '(array[p_document]-wrapped), called after the authorization is proven live but before it is '
  'consumed; the receipt and the firm_open_questions candidate persist the RESOLVED basis, '
  'never the model''s raw claim -- kept as sightings_model, annotation only.';

reset role;

-- =====================================================================================
-- SECTION 5 -- TAIL. Every claim re-read from the live catalog; raises on failure.
-- =====================================================================================
do $tail$
declare
  v_src text; v_sha text; v_def text; v_n int; v_acl text; v_core_sha_pre text;
  v_legacy_promotions int; v_legacy_onboarding int;
begin
  -- (1) The resolver: exact signature, SECURITY DEFINER, search_path pinned, owned by
  -- clara_fn_owner, and reachable by NO application role at all (ungranted, like its siblings).
  if to_regprocedure('clara._resolve_proposal_basis(uuid[],uuid,jsonb)') is null then
    raise exception 'proposal_basis_resolved tail: clara._resolve_proposal_basis does not resolve at its exact signature'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara._resolve_proposal_basis(uuid[],uuid,jsonb)'::regprocedure
        and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=%'
        and p.proowner = 'clara_fn_owner'::regrole) then
    raise exception 'proposal_basis_resolved tail: _resolve_proposal_basis is not SECURITY DEFINER + pinned search_path + owned by clara_fn_owner'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'clara._resolve_proposal_basis(uuid[],uuid,jsonb)'::regprocedure and a.privilege_type = 'EXECUTE';
  if v_n <> 1 or not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = 'clara._resolve_proposal_basis(uuid[],uuid,jsonb)'::regprocedure
        and a.grantee = 'clara_fn_owner'::regrole and a.privilege_type = 'EXECUTE') then
    raise exception 'proposal_basis_resolved tail: _resolve_proposal_basis must carry EXACTLY ONE EXECUTE grantee (clara_fn_owner) -- found %', v_n
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._resolve_proposal_basis(uuid[],uuid,jsonb)'::regprocedure;
  if position('basis_unresolved' in v_src) = 0
     or position('order by de2.version_n desc, de2.id desc limit 1' in v_src) = 0
     or position('v_row.firm_id is distinct from p_firm' in v_src) = 0
     or position('not (v_row.document_id = any(v_docs))' in v_src) = 0
     or position('v_doc_count <> array_length(v_docs,1)' in v_src) = 0
     or position('v_kind is distinct from ''region''' in v_src) = 0
     or position('coalesce(nullif(btrim(coalesce(e.elem->>''kind'',''''))' in v_src) = 0 then
    raise exception 'proposal_basis_resolved tail: _resolve_proposal_basis is missing an expected refusal/generation/docset/kind-dispatch rung'
      using errcode = 'CLR10';
  end if;

  -- (2) client_identifier_promotions: sightings_claimed present, nullable, no CHECK; the two
  -- pre-existing CHECKs this file's header calls "a floor under the resolver" are BYTE-UNCHANGED.
  if not exists (select 1 from pg_attribute
      where attrelid = 'clara.client_identifier_promotions'::regclass and attname = 'sightings_claimed'
        and attnum > 0 and not attisdropped and not attnotnull) then
    raise exception 'proposal_basis_resolved tail: client_identifier_promotions.sightings_claimed was not added as a NULLABLE column'
      using errcode = 'CLR10';
  end if;
  select v from _proposal_basis_pre where k = 'citations_check' into v_def;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'clara.client_identifier_promotions'::regclass
         and conname = 'client_identifier_promotions_citations_check') is distinct from v_def then
    raise exception 'proposal_basis_resolved tail: client_identifier_promotions_citations_check moved'
      using errcode = 'CLR10';
  end if;
  select v from _proposal_basis_pre where k = 'sightings_check' into v_def;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'clara.client_identifier_promotions'::regclass
         and conname = 'client_identifier_promotions_sightings_check') is distinct from v_def then
    raise exception 'proposal_basis_resolved tail: client_identifier_promotions_sightings_check moved'
      using errcode = 'CLR10';
  end if;

  -- (3) Door 1: the OLD 8-arg overload is GONE, the NEW 9-arg overload is the only one, its ACL
  -- is clara_fn_owner + clara_wake_filing ONLY, SECURITY DEFINER / search_path-pinned / owned.
  if to_regprocedure('clara.wake_propose_identifier_promotion(uuid,text,text,int,jsonb,text,jsonb,text)') is not null then
    raise exception 'proposal_basis_resolved tail: the OLD 8-arg wake_propose_identifier_promotion is still reachable -- a shadowed door'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)') is null then
    raise exception 'proposal_basis_resolved tail: the NEW 9-arg wake_propose_identifier_promotion does not resolve'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'wake_propose_identifier_promotion';
  if v_n <> 1 then
    raise exception 'proposal_basis_resolved tail: expected exactly ONE wake_propose_identifier_promotion overload, found %', v_n
      using errcode = 'CLR10';
  end if;
  select string_agg(a.grantee::regrole::text||':'||a.privilege_type, ',' order by a.grantee::regrole::text collate "C")
    into v_acl from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure;
  if v_acl is distinct from 'clara_fn_owner:EXECUTE,clara_wake_filing:EXECUTE' then
    raise exception 'proposal_basis_resolved tail: wake_propose_identifier_promotion''s ACL is not exactly clara_fn_owner+clara_wake_filing EXECUTE (got %)', coalesce(v_acl,'(none)')
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure
        and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=%'
        and p.proowner = 'clara_fn_owner'::regrole) then
    raise exception 'proposal_basis_resolved tail: the new wake_propose_identifier_promotion is not SECURITY DEFINER + pinned search_path + owned by clara_fn_owner'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure;
  if position('perform clara.assert_wake_allowed(w.wake_kind, ''wake_propose_identifier_promotion'')' in v_src) = 0
     or position('"reason":"invalid_request","class":"op_key","constraint":"nonempty"' in v_src) = 0
     or position('"reason":"invalid_request","class":"rationale","constraint":"nonempty"' in v_src) = 0
     or position('"reason":"invalid_request","class":"model_snapshot","constraint":"provider+model+version"' in v_src) = 0 then
    raise exception 'proposal_basis_resolved tail: the recut wake_propose_identifier_promotion lost a pre-existing wall string'
      using errcode = 'CLR10';
  end if;
  if position('"reason":"invalid_request","class":"document"' in v_src) = 0
     or position('clara._resolve_proposal_basis(array[p_document], w.firm_id' in v_src) = 0
     or position('update clara.client_identifier_promotions set sightings_claimed = p_sightings' in v_src) = 0 then
    raise exception 'proposal_basis_resolved tail: the recut wake_propose_identifier_promotion is missing an expected 裁-22 addition'
      using errcode = 'CLR10';
  end if;

  -- (4) Door 2: same signature, ACL BYTE-UNCHANGED, every prior wall string plus the new
  -- 裁-22 rungs both present, and the resolver strictly precedes the authorization-consume.
  select string_agg(a.grantee::regrole::text||':'||a.privilege_type, ',' order by a.grantee::regrole::text collate "C")
    into v_acl from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)'::regprocedure;
  if v_acl is distinct from 'clara_fn_owner:EXECUTE,clara_wake_filing:EXECUTE' then
    raise exception 'proposal_basis_resolved tail: wake_propose_client_onboarding''s ACL moved (got %) -- CoR must preserve it', coalesce(v_acl,'(none)')
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)'::regprocedure;
  foreach v_def in array array[
      '"reason":"invalid_request","class":"op_key","constraint":"nonempty"',
      '"reason":"invalid_request","class":"proposed_name","constraint":"nonempty_le_500"',
      '"reason":"invalid_request","class":"rationale","constraint":"nonempty"',
      '"reason":"invalid_request","class":"model_snapshot","constraint":"provider+model+version"',
      '"reason":"invalid_request","class":"basis","constraint":"object"',
      '"reason":"invalid_request","class":"basis","constraint":"sightings_and_citations"',
      '"reason":"invalid_request","class":"document"',
      '"reason":"cross_firm","class":"document"',
      '"reason":"name_family_collision","class":"proposed_name"',
      '"reason":"already_open","class":"onboarding_proposed"',
      '"reason":"no_live_egress_authorization"',
      'for update'
    ]
  loop
    if position(v_def in v_src) = 0 then
      raise exception 'proposal_basis_resolved tail: the recut wake_propose_client_onboarding lost the pre-existing wall %', v_def
        using errcode = 'CLR10';
    end if;
  end loop;
  if position('clara._resolve_proposal_basis(array[p_document], w.firm_id, p_basis)' in v_src) = 0
     or position('''sightings_model'', p_basis->''sightings''' in v_src) = 0
     or position('jsonb_build_object(''proposed_name'', v_name, ''basis'', v_resolved_basis)' in v_src) = 0 then
    raise exception 'proposal_basis_resolved tail: the recut wake_propose_client_onboarding is missing an expected 裁-22 addition'
      using errcode = 'CLR10';
  end if;
  if position('clara._resolve_proposal_basis(array[p_document], w.firm_id, p_basis)' in v_src)
     >= position('set consumed_at = statement_timestamp()' in v_src) then
    raise exception 'proposal_basis_resolved tail: the resolver call does not precede the authorization-consume UPDATE'
      using errcode = 'CLR10';
  end if;

  -- (5) clara._identifier_promotion_core is BYTE-IDENTICAL to its pinned prestate.
  select v from _proposal_basis_pre where k = 'core_sha' into v_core_sha_pre;
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> v_core_sha_pre then
    raise exception 'proposal_basis_resolved tail: clara._identifier_promotion_core changed -- pre %, post %', v_core_sha_pre, v_sha
      using errcode = 'CLR10';
  end if;

  -- (6) The allowlist: both rows survive, unchanged by the signature widening.
  if (select count(*) from clara.wake_fn_allowlist
       where wake_kind = 'filing' and function_name = 'wake_propose_identifier_promotion') <> 1
     or (select count(*) from clara.wake_fn_allowlist
       where wake_kind = 'filing' and function_name = 'wake_propose_client_onboarding') <> 1 then
    raise exception 'proposal_basis_resolved tail: the filing allowlist rows for the two doors did not survive exactly-once'
      using errcode = 'CLR10';
  end if;

  -- (7) Reachability: no application role beyond clara_wake_filing can reach either wrapper, and
  -- no role at all can reach the resolver or the core.
  if exists (select 1 from (values
        ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
        ('clara_wake_proactive'),('clara_wake_bank'),('clara_runtime')) t(role)
      where has_function_privilege(t.role, 'clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)'::regprocedure, 'execute')
         or has_function_privilege(t.role, 'clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)'::regprocedure, 'execute')
         or has_function_privilege(t.role, 'clara._resolve_proposal_basis(uuid[],uuid,jsonb)'::regprocedure, 'execute')
         or has_function_privilege(t.role, 'clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)'::regprocedure, 'execute')) then
    raise exception 'proposal_basis_resolved tail: a non-filing role can reach a body this file governs'
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_wake_filing', 'clara._resolve_proposal_basis(uuid[],uuid,jsonb)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_filing', 'clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)'::regprocedure, 'execute') then
    raise exception 'proposal_basis_resolved tail: clara_wake_filing must reach the resolver/core ONLY through the two wrappers, never directly'
      using errcode = 'CLR10';
  end if;

  -- (8) THE LIVE-ROW CENSUS (裁-22's own instruction: "report, never rewrite history"). This
  -- migration adds no backfill and no rewrite for any pre-existing row.
  select count(*) into v_legacy_promotions from clara.client_identifier_promotions p
    where exists (
      select 1 from jsonb_array_elements(p.citations) c(elem)
       where jsonb_typeof(elem) <> 'object' or elem->>'region_id' is null);
  select count(*) into v_legacy_onboarding from clara.firm_open_questions q
    where q.kind = 'onboarding_proposed'
      and exists (
        select 1 from jsonb_array_elements(coalesce(q.candidates,'[]'::jsonb)) cand(elem),
             jsonb_array_elements(coalesce(elem->'basis'->'citations','[]'::jsonb)) c(citelem)
         where jsonb_typeof(citelem) <> 'object' or citelem->>'region_id' is null);

  raise notice 'proposal_basis_resolved tail: OK -- _resolve_proposal_basis(uuid[],uuid,jsonb) installed (ungranted, SECURITY DEFINER, three parse-probes analyzed clean); client_identifier_promotions.sightings_claimed added (nullable, no CHECK), the citations/sightings CHECK floor byte-unchanged; wake_propose_identifier_promotion recut 8-arg->9-arg (old overload GONE, exactly one overload survives, ACL clara_fn_owner+clara_wake_filing only, every prior wall string present); wake_propose_client_onboarding CoR''d at its unchanged 7-arg signature (ACL byte-unchanged, every prior wall string present, the resolver call precedes the authorization-consume UPDATE by text order); _identifier_promotion_core byte-identical to its pinned prestate sha; both filing-allowlist rows survive exactly once; reachability is clara_wake_filing-only on both wrappers and NO ROLE AT ALL on the resolver/core. LIVE-ROW CENSUS (report-only, no rewrite): % client_identifier_promotions row(s) and % onboarding-proposed firm_open_questions row(s) carry a pre-裁-22 (non-region_id-keyed) citations shape -- left exactly as written; confirm/decline never re-validate citations, so an old card is unaffected; any FUTURE re-proposal on the same subject goes through the resolved doors this file ships.', v_legacy_promotions, v_legacy_onboarding;
end
$tail$;

drop table _proposal_basis_pre;
