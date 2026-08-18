-- UNNUMBERED_f_a1_writer.sql -- Wave-F Track A, F-A1 PR-1, writer lane piece 2 of 2:
-- clara.persist_witness_facts (the atomic idempotent two-row persist).
-- =====================================================================================
-- APPLY ORDER: UNNUMBERED_f_a1_usage.sql FIRST (clara.record_llm_usage_event, called from
-- SS11 below), this file SECOND -- and LAST in F-A1 PR-1's whole DB deploy order (design SS6):
-- the 0017 kind-scoped fix, the walls (kinds/lane/prefix CHECKs + the witness-own concurrency
-- column) and the predicate (+ its identity leaf + the two dispatch recuts) must already be
-- live, or this file's INSERTs would violate CHECK constraints the walls file owns, or a
-- persisted pair would be unreachable through `_invoice_fact_state`/`_invoice_fact_state_at`.
-- Numbers are claimed at MERGE time (hard constraint 10; .claude/rules/db-migrations.md).
-- NO D1 WRITE-QUIESCE OBLIGATION -- persist_witness_facts is a BRAND NEW function name; nothing
-- here replaces a live writer's body, so no in-flight call can straddle this migration.
-- THE ENVELOPE INPUT CONTRACT this file builds EXACTLY against (locked by the predicate lane,
-- packages/db/tests/f-a1-fixtures.mjs's header, clara.evaluate_witness_fact_state_v1 itself):
-- both persisted rows carry
--   envelope = { "witness": { "channel": "text"|"vision", "contest"?: bool,
--                              "answers": { "<field_path>": {"state":"value","raw":"<rendering>"}
--                                                          | {"state":"not_printed"} } },
--                "corroboration_ineligible"?: text }
-- for all ELEVEN belt fields (invoice.total, total_excl_tax, tax_total, rounding,
-- service_charge, discount, delivery, amount_due, deposit, currency, type_code). This file
-- stores that envelope VERBATIM as document_extractions.envelope for each row.
--
-- THE CHOSEN SIGNATURE (deviation report): two call-shaped jsonb blobs, one per channel, rather
-- than a persist_invoice_facts-style flat arg list -- there are now two independent reads, each
-- with its own input pin, prompt hash, envelope and citations.
--   p_text  = { "input_pin": "<uuid text of the PINNED, done, engine_kind='ocr' extraction of
--                              this document the text witness read>",
--               "prompt_hash": "<sha256 hex>",
--               "envelope": { ...the contract above, channel='text'... },
--               "citations": [ {"field_path":text,"region_idx":int,"raw"?:text}, ... ],  -- []
--                 default. region_idx resolves against a DENSE ordinal computed AT WRITE TIME
--                 over the pinned OCR extraction's OWN regions ONLY, idx = row_number() over
--                 (order by id) -- never stored (the F9 discipline). THIS IS THE LOCKED
--                 CONTRACT PR-2's prompt builder must number against: the numbers shown to the
--                 model must come from the identical query (same pinned extraction, same
--                 `order by id`) or a witness's idx would resolve to the wrong region.
--                 For a BELT field_path (one of the eleven), only region_idx is read from a
--                 citation entry -- the quoted rendering is `envelope.witness.answers[path].raw`,
--                 the single locked source, never a second copy in the citation. For one of the
--                 SIX OPTIONAL reference fields (invoice.invoice_id, invoice.invoice_date,
--                 invoice.customer_name, invoice.customer_registration, invoice.vendor_name,
--                 invoice.vendor_registration -- read by clara.evaluate_witness_fact_state_v1's
--                 main body and by clara._witness_identity_v1, NOT part of the required-answer
--                 vocabulary), the citation entry itself carries "raw".
--               "usage"?: {"input_tokens"?:int,"output_tokens"?:int,"duration_ms"?:int,
--                          "outcome"?:text} }  -- optional; see SS11 below.
--   p_vision = { "input_pin": "<documents.sha256, 64 lowercase hex>", "prompt_hash": "...",
--                "envelope": { ...channel='vision'... }, "usage"?: {...} }   -- NO citations key:
--                the vision channel never sees regions and writes none (design SS3.1).
--
-- RECEIPT SHAPE (PR-2 builds against this): {"task_id","document_id","engine_id","version_n",
-- "text_extraction_id","vision_extraction_id","status":"done","replayed":bool}.
-- CITE-AND-VERIFY (SS3.4, the write half). A citation VERIFIES when its region_idx resolves
-- against the pinned OCR extraction AND the quoted rendering is a substring of that region's
-- text_content AND (money fields only) the rendering parses to cents via
-- clara._normalize_invoice_cents. A verified citation writes text_content/monetary_raw = the
-- exact rendering, monetary_cents = the normalized cents (NULL for currency/type_code and the
-- six optional fields), polygon = the cited region's own polygon, locator carries the cited
-- region's own uuid as `source_region_id`, engine_confidence = NULL always (the >=0.95 mirror
-- must never return). A MISSING OR FAILED
-- citation still persists the fact GEOMETRY-LESS (locator_kind='page_polygon', an EMPTY polygon
-- array) -- C4's persist-whole duty; this writer never refuses a read for being wrong, only for
-- being STRUCTURALLY malformed. The predicate's C2 wall does the refusing.
--
-- STRUCTURAL REFUSALS ONLY (raise; every other outcome persists whole): task not claimed / wrong
-- lane / wrong state (CLR16) -- missing input pins / equal prompt hashes / malformed answers
-- vocabulary (not all eleven fields answered, or an unsupported citation field_path) (CLR10) --
-- conflicting-duplicate citations for one field_path within the TEXT read's own set (CLR10, the
-- 0023 write-boundary idiom: two citations differing in region_idx/raw for the SAME field_path
-- forfeit the WHOLE call -- nothing is inserted; identical duplicates collapse).
set local statement_timeout = '5min';   -- precautionary; nothing here scans a large relation

-- =====================================================================================
-- SECTION 0 -- PRESTATE.
-- =====================================================================================
do $pre$
begin
  if not exists (select 1 from clara.schema_migrations where version = '0088_masb_wording_seed_lexicon') then
    raise exception 'f_a1_writer prestate: 0088_masb_wording_seed_lexicon is not applied -- frontier mismatch' using errcode='CLR10';
  end if;

  -- (0.1) NOT ALREADY APPLIED.
  if to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is not null then
    raise exception 'f_a1_writer prestate: already applied' using errcode='CLR10';
  end if;

  -- (0.2) THE SIBLING USAGE FILE (dependency: SS11 below calls record_llm_usage_event).
  if to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is null then
    raise exception 'f_a1_writer prestate: clara.record_llm_usage_event is absent -- apply UNNUMBERED_f_a1_usage.sql first' using errcode='CLR10';
  end if;

  -- (0.3) THE 0017 KIND-SCOPED FIX -- read positively: the within-kind marker this file's
  -- explicit clock_timestamp() insert ordering (vision first, text last) depends on to land the
  -- document-wide pointer on the text row rather than a same-transaction uuid coin flip.
  if position('v_kind_current' in (select p.prosrc from pg_proc p
        where p.oid='clara._tf_set_authoritative_extraction_0017()'::regprocedure)) = 0 then
    raise exception 'f_a1_writer prestate: the 0017 kind-scoped supersede fix is not applied -- apply the merged kind-scoped-supersede migration first' using errcode='CLR10';
  end if;

  -- (0.4) THE WALLS -- engine_kind / lane / prefix CHECKs widened, and the witness-own
  -- concurrency column present (the tail marker of a FULLY, not partially, applied walls file).
  if not exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='document_extractions' and con.conname='ck_document_extractions_engine_kind_f_a1'
        and pg_get_constraintdef(con.oid) like '%llm_text_facts%' and pg_get_constraintdef(con.oid) like '%llm_vision_facts%') then
    raise exception 'f_a1_writer prestate: the engine_kind CHECK is not widened for llm_text_facts/llm_vision_facts -- apply the walls migration first' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_lane_f_a1'
        and pg_get_constraintdef(con.oid) like '%llm_witness%') then
    raise exception 'f_a1_writer prestate: the lane CHECK is not widened for llm_witness -- apply the walls migration first' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_lane_engine_f_a1'
        and pg_get_constraintdef(con.oid) like '%llm-%') then
    raise exception 'f_a1_writer prestate: the lane<->engine prefix CHECK is not widened for llm_witness -- apply the walls migration first' using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='firm_document_limits' and column_name='llm_witness_concurrency') then
    raise exception 'f_a1_writer prestate: clara.firm_document_limits.llm_witness_concurrency is absent -- the walls migration is not fully applied' using errcode='CLR10';
  end if;

  -- (0.5) THE PREDICATE + ITS IDENTITY LEAF + THE DISPATCH.
  if to_regprocedure('clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)') is null then
    raise exception 'f_a1_writer prestate: clara.evaluate_witness_fact_state_v1 is absent -- apply the predicate migration first' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._witness_identity_v1(uuid,uuid,boolean)') is null then
    raise exception 'f_a1_writer prestate: clara._witness_identity_v1 is absent -- apply the identity-helper migration first' using errcode='CLR10';
  end if;
  if position('evaluate_witness_fact_state_v1' in (select p.prosrc from pg_proc p
        where p.oid='clara._invoice_fact_state_at(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'f_a1_writer prestate: clara._invoice_fact_state_at does not dispatch to the witness predicate -- apply the predicate_part2 migration first' using errcode='CLR10';
  end if;

  -- (0.6) THE LEAVES THIS FILE CALLS -- must resolve, or CREATE FUNCTION itself fails loudly.
  perform 'clara._normalize_invoice_cents(text)'::regprocedure;
  perform 'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'::regprocedure;

  raise notice 'f_a1_writer prestate: clean -- the usage file, the 0017 fix, the walls and the predicate (+ identity leaf + dispatch) are all live; persist_witness_facts is absent';
end
$pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION 1 -- TWO PRIVATE HELPERS.
-- =====================================================================================

-- Validates ONE channel's envelope against the locked contract. Every comparison against a
-- possibly-absent jsonb path is written NULL-safe (plpgsql's `if <null>` is FALSE, not an
-- error -- a naive `<>` here would silently let a malformed envelope through).
create function clara._witness_answers_ok(p_envelope jsonb, p_channel text) returns boolean
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_belt text[] := array['invoice.total','invoice.total_excl_tax','invoice.tax_total',
    'invoice.rounding','invoice.service_charge','invoice.discount','invoice.delivery',
    'invoice.amount_due','invoice.deposit','invoice.currency','invoice.type_code'];
  v_answers jsonb; v_f text; v_a jsonb; v_state text;
begin
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then return false; end if;
  if (p_envelope->'witness'->>'channel') is distinct from p_channel then return false; end if;
  v_answers := p_envelope->'witness'->'answers';
  if v_answers is null or jsonb_typeof(v_answers) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(v_answers)) <> array_length(v_belt,1) then return false; end if;
  foreach v_f in array v_belt loop
    v_a := v_answers->v_f;
    if v_a is null or jsonb_typeof(v_a) <> 'object' then return false; end if;
    v_state := v_a->>'state';
    if v_state is null or v_state not in ('value','not_printed') then return false; end if;
    if v_state = 'value' and nullif(btrim(coalesce(v_a->>'raw','')),'') is null then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function clara._witness_answers_ok(jsonb,text) from public;

-- Resolves ONE citation idx against ONE pinned OCR extraction's OWN regions, via a DENSE ordinal
-- computed AT WRITE TIME (never stored): idx = row_number() over (order by id), scoped to this
-- single extraction_id. THE LOCKED CONTRACT for PR-2's prompt builder: the numbers shown to the
-- witness model must come from the IDENTICAL query or an idx would resolve to the wrong region.
create function clara._witness_resolve_citation(p_ocr_extraction uuid, p_idx int)
  returns table(region_id uuid, text_content text, locator jsonb)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select r.id, r.text_content, r.locator
    from (select rr.id, rr.text_content, rr.locator,
                 row_number() over (order by rr.id) as idx
            from clara.document_regions rr where rr.extraction_id = p_ocr_extraction) r
   where r.idx = p_idx;
$$;
revoke all on function clara._witness_resolve_citation(uuid,int) from public;

-- =====================================================================================
-- SECTION 2 -- clara.persist_witness_facts. Claimed-task-bound (reads version_n AND engine_id
-- off the task row -- the 0038:1775-1776 precedent, widened: M15 shares ONE engine_id across
-- both kinds). Idempotent under the 4-column unique (document_id,engine_id,version_n,
-- engine_kind), signature designed against clara.persist_invoice_facts (0026:662).
-- =====================================================================================
create function clara.persist_witness_facts(p_task uuid, p_text jsonb, p_vision jsonb,
    p_pages_used int default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; d record;
  v_text_env jsonb; v_vision_env jsonb;
  v_text_pin text; v_vision_pin text; v_text_hash text; v_vision_hash text;
  v_citations jsonb; v_usage_text jsonb; v_usage_vision jsonb;
  v_existing_text uuid; v_existing_vision uuid;
  v_ocr_ext uuid;
  v_vision_id uuid; v_text_id uuid;
  v_vision_at timestamptz; v_text_at timestamptz;
  v_belt text[] := array['invoice.total','invoice.total_excl_tax','invoice.tax_total',
    'invoice.rounding','invoice.service_charge','invoice.discount','invoice.delivery',
    'invoice.amount_due','invoice.deposit','invoice.currency','invoice.type_code'];
  v_money text[] := array['invoice.total','invoice.total_excl_tax','invoice.tax_total',
    'invoice.rounding','invoice.service_charge','invoice.discount','invoice.delivery',
    'invoice.amount_due','invoice.deposit'];
  v_optional text[] := array['invoice.invoice_id','invoice.invoice_date',
    'invoice.customer_name','invoice.customer_registration',
    'invoice.vendor_name','invoice.vendor_registration'];
  v_allowed text[];
  v_f text; v_ans jsonb; v_raw text; v_idx int;
  v_cit record;
  v_cited_id uuid; v_cited_text text; v_cited_locator jsonb;
  v_verified boolean; v_cents bigint; v_locator2 jsonb;
begin
  v_allowed := v_belt || v_optional;
  if p_pages_used is not null and p_pages_used < 0 then
    raise exception 'witness pages_used must be non-negative' using errcode='CLR10';
  end if;

  -- 1. TASK LOOKUP + LANE (structural: task not claimed / wrong lane).
  select * into t from clara.document_processing_tasks where id = p_task;
  if not found or t.lane <> 'llm_witness' then
    raise exception 'llm-witness task not found or not in the llm_witness lane' using errcode='CLR16';
  end if;

  -- 2. IDEMPOTENT REPLAY -- the persist_invoice_facts precedent (0026:677-683): a done task's
  -- pair already exists under the 4-column unique; return the stored receipt, never re-insert.
  if t.status = 'done' then
    select id into v_existing_text from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind='llm_text_facts';
    select id into v_existing_vision from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind='llm_vision_facts';
    return jsonb_build_object('task_id',p_task,'document_id',t.document_id,
      'engine_id',t.engine_id,'version_n',t.version_n,
      'text_extraction_id',v_existing_text,'vision_extraction_id',v_existing_vision,
      'status','done','replayed',true);
  end if;

  -- 3. MALFORMED ANSWERS VOCABULARY (structural).
  v_text_env := p_text->'envelope'; v_vision_env := p_vision->'envelope';
  if not clara._witness_answers_ok(v_text_env,'text')
     or not clara._witness_answers_ok(v_vision_env,'vision') then
    raise exception 'witness envelope is malformed (channel/answers vocabulary -- all eleven belt fields must be answered)' using errcode='CLR10';
  end if;

  -- 4. MISSING INPUT PINS (structural). Text pins to the PINNED, done, engine_kind='ocr'
  -- extraction of THIS document; vision pins to documents.sha256.
  v_text_pin := nullif(btrim(p_text->>'input_pin'),'');
  v_vision_pin := nullif(btrim(p_vision->>'input_pin'),'');
  if v_text_pin is null or v_vision_pin is null then
    raise exception 'witness call is missing an input pin' using errcode='CLR10';
  end if;
  select * into d from clara.documents where id = t.document_id and firm_id = t.firm_id;
  if not found then
    raise exception 'impossible state: llm-witness task % names no owning document', p_task using errcode='CLR35';
  end if;
  begin
    select e.id into v_ocr_ext from clara.document_extractions e
      where e.id = v_text_pin::uuid and e.document_id = t.document_id and e.firm_id = t.firm_id
        and e.engine_kind = 'ocr' and e.status = 'done';
  exception when invalid_text_representation then
    v_ocr_ext := null;
  end;
  if v_ocr_ext is null then
    raise exception 'the text witness input pin does not resolve to a done OCR extraction of this document' using errcode='CLR10';
  end if;
  if lower(v_vision_pin) <> d.sha256 then
    raise exception 'the vision witness input pin does not match documents.sha256' using errcode='CLR10';
  end if;

  -- 5. EQUAL PROMPT HASHES (structural) -- the independence receipt.
  v_text_hash := nullif(btrim(p_text->>'prompt_hash'),'');
  v_vision_hash := nullif(btrim(p_vision->>'prompt_hash'),'');
  if v_text_hash is null or v_vision_hash is null then
    raise exception 'witness call is missing a prompt hash' using errcode='CLR10';
  end if;
  if v_text_hash = v_vision_hash then
    raise exception 'the text and vision channels used the same prompt hash -- the independence receipt requires distinct prompts' using errcode='CLR10';
  end if;

  -- 6. CITATIONS -- vocabulary + CONFLICTING-DUPLICATE FORFEITURE (structural; the 0023
  -- write-boundary idiom, 0026:802-822: two citations differing in region_idx or raw for the
  -- SAME field_path forfeit the WHOLE call, before anything is inserted; identical duplicates
  -- collapse silently). Cast failures inside jsonb_to_recordset are caught and reported cleanly.
  v_citations := coalesce(p_text->'citations','[]'::jsonb);
  if jsonb_typeof(v_citations) <> 'array' then
    raise exception 'witness citations payload is malformed' using errcode='CLR10';
  end if;
  begin
    if exists(select 1 from jsonb_to_recordset(v_citations) as c(field_path text, region_idx int, raw text)
              where c.field_path is null or c.field_path <> all(v_allowed)) then
      raise exception 'witness citations name an unsupported field_path' using errcode='CLR10';
    end if;
    if exists(select 1 from jsonb_to_recordset(v_citations) as c(field_path text, region_idx int, raw text)
              group by c.field_path
              having count(distinct (coalesce(c.region_idx,-1), coalesce(c.raw,chr(1)))) > 1) then
      raise exception 'witness citations carry conflicting duplicate facts for a single field' using errcode='CLR10';
    end if;
  exception
    when sqlstate 'CLR10' then raise;
    when others then
      raise exception 'witness citations payload is malformed' using errcode='CLR10';
  end;

  -- 7. LOCK + RE-CHECK (double-checked locking -- the persist_invoice_facts precedent).
  select * into t from clara.document_processing_tasks where id = p_task for update;
  if t.status = 'done' then
    select id into v_existing_text from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind='llm_text_facts';
    select id into v_existing_vision from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind='llm_vision_facts';
    return jsonb_build_object('task_id',p_task,'document_id',t.document_id,
      'engine_id',t.engine_id,'version_n',t.version_n,
      'text_extraction_id',v_existing_text,'vision_extraction_id',v_existing_vision,
      'status','done','replayed',true);
  end if;
  if t.status <> 'running' then
    raise exception 'llm-witness task is not running' using errcode='CLR16';
  end if;

  -- 8. THE ATOMIC PAIR INSERT -- TWO SEPARATE INSERT STATEMENTS (0038:1781/1790 precedent),
  -- vision FIRST, text LAST, each with an EXPLICIT clock_timestamp() (design SS3.9 note 4): the
  -- document-wide pointer (the kind-scoped 0017 trigger) must land on the TEXT row
  -- deterministically. v_text_at is bumped at least one microsecond past v_vision_at as a
  -- defensive strengthening beyond the literal "via clock_timestamp()" text -- a same-instant
  -- tie is exactly the hazard SS3.9 exists to close, and this makes it impossible rather than
  -- merely unlikely on fast hardware.
  v_vision_at := clock_timestamp();
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,
      status,page_count,envelope,extracted_at)
    values(t.firm_id,t.document_id,t.engine_id,'llm_vision_facts',t.version_n,
      'done',p_pages_used,v_vision_env,v_vision_at)
    on conflict (document_id,engine_id,version_n,engine_kind) do nothing
    returning id into v_vision_id;
  if v_vision_id is null then
    raise exception 'impossible state: an ON CONFLICT fired for the vision row (document=%,engine=%,version=%) but no row exists at that key',
      t.document_id,t.engine_id,t.version_n using errcode='CLR35';
  end if;

  v_text_at := greatest(clock_timestamp(), v_vision_at + interval '1 microsecond');
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,
      status,page_count,envelope,extracted_at)
    values(t.firm_id,t.document_id,t.engine_id,'llm_text_facts',t.version_n,
      'done',p_pages_used,v_text_env,v_text_at)
    on conflict (document_id,engine_id,version_n,engine_kind) do nothing
    returning id into v_text_id;
  if v_text_id is null then
    raise exception 'impossible state: an ON CONFLICT fired for the text row (document=%,engine=%,version=%) but no row exists at that key',
      t.document_id,t.engine_id,t.version_n using errcode='CLR35';
  end if;

  -- 9. THE ELEVEN BELT FIELDS -- server-verified citations (SS3.4). PERSIST-WHOLE: a missing or
  -- failed citation still writes a geometry-less region; the predicate's C2 wall does the
  -- refusing, never this writer (C4). text_content is ALWAYS envelope.witness.answers[f].raw --
  -- the single locked source; a citation entry supplies ONLY region_idx for a belt field.
  foreach v_f in array v_belt loop
    v_cited_id := null; v_cited_text := null; v_cited_locator := null; v_idx := null;
    v_ans := v_text_env->'witness'->'answers'->v_f;
    if v_ans->>'state' = 'value' then
      v_raw := v_ans->>'raw';
      select c.region_idx into v_idx from jsonb_to_recordset(v_citations) as c(field_path text, region_idx int, raw text)
        where c.field_path = v_f limit 1;
      if v_idx is not null then
        select r.region_id, r.text_content, r.locator into v_cited_id, v_cited_text, v_cited_locator
          from clara._witness_resolve_citation(v_ocr_ext, v_idx) r;
      end if;
      v_verified := v_cited_id is not null and v_cited_text is not null
        and position(v_raw in v_cited_text) > 0
        and (not (v_f = any(v_money)) or clara._normalize_invoice_cents(v_raw) is not null);
      v_cents := case when v_f = any(v_money) then clara._normalize_invoice_cents(v_raw) else null end;
      if v_verified then
        v_locator2 := jsonb_build_object('page', nullif(v_cited_locator->>'page','')::int,
          'polygon', coalesce(v_cited_locator->'polygon','[]'::jsonb), 'source_region_id', v_cited_id);
      elsif v_cited_id is not null then
        v_locator2 := jsonb_build_object('polygon','[]'::jsonb,'source_region_id',v_cited_id);
      else
        v_locator2 := jsonb_build_object('polygon','[]'::jsonb);
      end if;
      insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
          text_content,engine_confidence,monetary_raw,monetary_cents)
        values(t.firm_id,v_text_id,'page_polygon',v_locator2,v_f,v_raw,null,v_raw,v_cents);
    end if;
  end loop;

  -- 10. THE SIX OPTIONAL REFERENCE FIELDS -- same cite-and-verify mechanics, but NO answers
  -- vocabulary requirement: the witness may simply not have cited one (SS3.3's identity leaf
  -- degrades to "no verdict" on an uncited field, never an error). `raw` comes from the
  -- citation entry itself -- there is no `answers` slot for these six.
  for v_cit in
    select distinct on (c.field_path) c.field_path as field_path, c.region_idx as region_idx, c.raw as raw
      from jsonb_to_recordset(v_citations) as c(field_path text, region_idx int, raw text)
     where c.field_path = any(v_optional)
     order by c.field_path
  loop
    v_cited_id := null; v_cited_text := null; v_cited_locator := null;
    v_raw := nullif(btrim(coalesce(v_cit.raw,'')),'');
    if v_raw is not null then
      if v_cit.region_idx is not null then
        select r.region_id, r.text_content, r.locator into v_cited_id, v_cited_text, v_cited_locator
          from clara._witness_resolve_citation(v_ocr_ext, v_cit.region_idx) r;
      end if;
      v_verified := v_cited_id is not null and v_cited_text is not null
        and position(v_raw in v_cited_text) > 0;
      if v_verified then
        v_locator2 := jsonb_build_object('page', nullif(v_cited_locator->>'page','')::int,
          'polygon', coalesce(v_cited_locator->'polygon','[]'::jsonb), 'source_region_id', v_cited_id);
      elsif v_cited_id is not null then
        v_locator2 := jsonb_build_object('polygon','[]'::jsonb,'source_region_id',v_cited_id);
      else
        v_locator2 := jsonb_build_object('polygon','[]'::jsonb);
      end if;
      insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
          text_content,engine_confidence,monetary_raw,monetary_cents)
        values(t.firm_id,v_text_id,'page_polygon',v_locator2,v_cit.field_path,v_raw,null,v_raw,null);
    end if;
  end loop;

  -- 11. USAGE METERING (design SS3.6, law 76: no spend refusal anywhere). OPTIONAL at this
  -- layer: PR-2's runtime is expected to call clara.record_llm_usage_event directly at call
  -- time (it alone knows a call's duration/outcome as the call happens, including a call that
  -- never reaches this persist), but a caller MAY also pass usage metadata here so a witness
  -- pair that DOES persist always carries at least one recorded row per channel.
  v_usage_text := p_text->'usage'; v_usage_vision := p_vision->'usage';
  if jsonb_typeof(v_usage_text) = 'object' then
    perform clara.record_llm_usage_event(t.firm_id, t.document_id, p_task, 'text', t.engine_id,
      v_text_hash, nullif(v_usage_text->>'input_tokens','')::int,
      nullif(v_usage_text->>'output_tokens','')::int, nullif(v_usage_text->>'duration_ms','')::int,
      coalesce(v_usage_text->>'outcome','success'));
  end if;
  if jsonb_typeof(v_usage_vision) = 'object' then
    perform clara.record_llm_usage_event(t.firm_id, t.document_id, p_task, 'vision', t.engine_id,
      v_vision_hash, nullif(v_usage_vision->>'input_tokens','')::int,
      nullif(v_usage_vision->>'output_tokens','')::int, nullif(v_usage_vision->>'duration_ms','')::int,
      coalesce(v_usage_vision->>'outcome','success'));
  end if;

  -- 12. SETTLE + AUDIT + RETURN. The 0017 kind-scoped trigger has already set
  -- documents.authoritative_extraction_id to the text row as a side effect of step 8's ordering
  -- (asserted in the battery, never re-derived here).
  update clara.document_processing_tasks set status='done', finished_at=now() where id=p_task;

  perform clara._audit(t.firm_id,null,null,null,'persist_witness_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,
      'text_extraction',v_text_id,'vision_extraction',v_vision_id,'version',t.version_n));

  return jsonb_build_object('task_id',p_task,'document_id',t.document_id,
    'engine_id',t.engine_id,'version_n',t.version_n,
    'text_extraction_id',v_text_id,'vision_extraction_id',v_vision_id,
    'status','done','replayed',false);
end $$;
revoke all on function clara.persist_witness_facts(uuid,jsonb,jsonb,int) from public;
grant execute on function clara.persist_witness_facts(uuid,jsonb,jsonb,int) to clara_runtime;

reset role;

-- =====================================================================================
-- SECTION 3 -- TAIL CENSUS.
-- =====================================================================================
do $tail$
begin
  if to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is null then
    raise exception 'f_a1_writer tail: clara.persist_witness_facts did not install' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure
        and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
        and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a1_writer tail: persist_witness_facts is not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where p.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure
        and a.grantee='clara_runtime'::regrole and a.privilege_type='EXECUTE') then
    raise exception 'f_a1_writer tail: persist_witness_facts is not EXECUTE-granted to clara_runtime' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
      where f.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure
        and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'f_a1_writer tail: PUBLIC executes persist_witness_facts' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._witness_answers_ok(jsonb,text)') is null
     or to_regprocedure('clara._witness_resolve_citation(uuid,int)') is null then
    raise exception 'f_a1_writer tail: a private helper did not install' using errcode='CLR10';
  end if;

  raise notice 'f_a1_writer tail: OK -- clara.persist_witness_facts installed (definer, search_path pinned, EXECUTE to clara_runtime only, no PUBLIC), both private helpers installed. No table in workflow/graphile_worker/spike touched; no D1 quiesce needed (pure addition).';
end
$tail$;
