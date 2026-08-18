-- 0095_f_a1_writer.sql -- Wave-F Track A, F-A1 PR-1, writer lane piece 2 of 2:
-- clara.persist_witness_facts (the atomic idempotent two-row persist).
-- =====================================================================================
-- APPLY ORDER: 0094_f_a1_usage.sql FIRST (clara.record_llm_usage_event, called from
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
-- TWO REFINEMENTS OF THAT CONTRACT, both adjudicated at review and both VALIDATED here so a
-- malformed shape can never reach the predicate as silence:
--   (a) `witness.contest` (M2) is OPTIONAL, and when present must be a JSON BOOLEAN (or an
--       explicit null). The predicate casts it with `(->>'contest')::boolean`, so a string like
--       "unknown" raises 22P02 out of a STABLE read the whole estate calls -- a structural
--       malformation that must be refused at the WRITE boundary, exactly like a bad answers
--       vocabulary, rather than detonating at every later read.
--   (b) `answers` may ADDITIONALLY carry `invoice.invoice_id` and `invoice.invoice_date` (M3),
--       and nothing else beyond the eleven. Each such optional answer takes the same
--       {state, raw} shape plus an OPTIONAL normalized `value`:
--         invoice_id   -- `value` MUST be a substring of `raw`   (else structural refusal)
--         invoice_date -- `value` MUST parse as an ISO date YYYY-MM-DD (else structural refusal)
--       WHY: the duplicate-bill wall (0015:1402) and the duplicate-sales wall (0015:1425-1429)
--       compare `_invoice_fact_state(...)->>'invoice_id'` / `'invoice_date'` by EXACT EQUALITY
--       ACROSS REGIMES. A legacy Azure read emits the typed normalized value ("INV-001",
--       "2026-01-15"); a witness's citable rendering has to be a SUBSTRING of the OCR region it
--       cites ("Invoice No.: INV-001", "15/01/2026"). Without the value slot the same bill read
--       twice under two regimes would never collide and the wall would go SILENTLY PERMISSIVE.
--       The predicate emits coalesce(value, raw) and DROPS the key when the two channels
--       disagree -- absence-permissive, never amount-blocking (0092 §3, M3).
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
--                 CONTRACT PR-2's prompt builder must number against, AND IT NOW HAS A DOOR:
--                 clara.witness_citation_regions(p_ocr_extraction) (SECTION 1 below, review M5)
--                 returns EXACTLY this numbering. PR-2's prompt builder MUST read the idx from
--                 THAT function -- never from clara.get_document_extract, whose own `idx` is a
--                 DIFFERENT ordinal (dense over (engine_kind, version_n, r.id) across every
--                 chosen extraction, 0054:32-42) and would resolve a witness's citation to the
--                 wrong region the moment the document carries more than one done extraction.
--                 For a BELT field_path (one of the eleven), only region_idx is read from a
--                 citation entry -- the quoted rendering is `envelope.witness.answers[path].raw`,
--                 the single locked source, never a second copy in the citation. For one of the
--                 SEVEN OPTIONAL reference fields (invoice.invoice_id, invoice.invoice_date,
--                 invoice.customer_name, invoice.customer_registration, invoice.customer_taxid,
--                 invoice.vendor_name, invoice.vendor_registration -- read by
--                 clara.evaluate_witness_fact_state_v1's main body, by
--                 clara.evaluate_witness_identity_v1, and -- for customer_taxid -- by
--                 0022:1336-1341's live `v_buyer_hit` direction disjunct, which reads
--                 field_path='invoice.customer_taxid' off the BOUND extraction; NOT part of the
--                 required-answer vocabulary), the citation entry itself carries "raw".
--               "usage"?: {"input_tokens"?:int,"output_tokens"?:int,"duration_ms"?:int,
--                          "outcome"?:text} }  -- optional; see SS11 below.
--   p_vision = { "input_pin": "<documents.sha256, 64 lowercase hex>", "prompt_hash": "...",
--                "envelope": { ...channel='vision'... }, "usage"?: {...} }   -- NO citations key:
--                the vision channel never sees regions and writes none (design SS3.1).
--
-- RECEIPT SHAPE (PR-2 builds against this): {"task_id","document_id","engine_id","version_n",
-- "text_extraction_id","vision_extraction_id","status":"done","replayed":bool}.
-- CITE-AND-VERIFY (SS3.4, the write half). A citation VERIFIES when its region_idx resolves
-- against the pinned OCR extraction AND the quoted rendering occurs in that region's
-- text_content AND (money fields only) the rendering parses to cents via
-- clara._normalize_invoice_cents. FOR A MONETARY FIELD THE OCCURRENCE MUST BE TOKEN-BOUNDED
-- (review M4): a bare substring test accepts a DIGIT FRAGMENT -- "1,234.56" is a substring of
-- "11,234.56" and of "1,234.567" -- so a witness quoting the wrong number by one leading digit
-- would collect the right region's polygon and pass C2 on a figure the document never states.
-- The match is therefore anchored on both sides by start-of-string or a character outside
-- [0-9.,]; the non-monetary fields keep the plain substring test, where no digit-fragment hazard
-- exists. A verified citation writes text_content/monetary_raw = the
-- exact rendering, monetary_cents = the normalized cents (NULL for currency/type_code and the
-- seven optional fields), polygon = the cited region's own polygon, locator carries the cited
-- region's own uuid as `source_region_id`, engine_confidence = NULL always (the >=0.95 mirror
-- must never return). A MISSING OR FAILED
-- citation still persists the fact GEOMETRY-LESS (locator_kind='page_polygon', an EMPTY polygon
-- array) -- C4's persist-whole duty; this writer never refuses a read for being wrong, only for
-- being STRUCTURALLY malformed. The predicate's C2 wall does the refusing.
--
-- STRUCTURAL REFUSALS ONLY (raise; every other outcome persists whole): task not claimed / wrong
-- lane / wrong state (CLR16) -- missing input pins / equal prompt hashes / malformed answers
-- vocabulary (not all eleven fields answered, an answer key outside the eleven plus the two M3
-- reference keys, a non-boolean `contest`, a `raw` longer than 200 characters, a bad M3 `value`,
-- or an unsupported citation field_path) (CLR10) --
-- conflicting-duplicate citations for one field_path within the TEXT read's own set (CLR10, the
-- 0023 write-boundary idiom: two citations differing in region_idx/raw for the SAME field_path
-- forfeit the WHOLE call -- nothing is inserted; identical duplicates collapse).
-- THE 200-CHARACTER BOUND ON `raw` (M6) is structural, not cosmetic: `raw` is an unbounded model
-- string that this file feeds to clara._normalize_invoice_cents, which multiplies by 100 and
-- casts to bigint -- a 30-digit rendering RAISES 22003 and would roll back a persist C4 says
-- must complete. The bound plus the magnitude pre-guard in section 9 close it from both ends;
-- the leaf itself is a FROZEN closure member and cannot be repaired in place.
set local statement_timeout = '5min';   -- precautionary; nothing here scans a large relation

-- =====================================================================================
-- SECTION 0 -- PRESTATE.
-- =====================================================================================
do $pre$
begin
  if not exists (select 1 from clara.schema_migrations where version = '0088_masb_wording_seed_lexicon') then
    raise exception 'f_a1_writer prestate: 0088_masb_wording_seed_lexicon is not applied -- frontier mismatch' using errcode='CLR10';
  end if;

  -- (0.1) NOT ALREADY APPLIED -- both the writer and the M5 numbering door this file adds.
  if to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is not null
     or to_regprocedure('clara.witness_citation_regions(uuid)') is not null then
    raise exception 'f_a1_writer prestate: already applied' using errcode='CLR10';
  end if;

  -- (0.2) THE SIBLING USAGE FILE (dependency: SS11 below calls record_llm_usage_event).
  if to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is null then
    raise exception 'f_a1_writer prestate: clara.record_llm_usage_event is absent -- apply 0094_f_a1_usage.sql first' using errcode='CLR10';
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
  if to_regprocedure('clara.evaluate_witness_identity_v1(uuid,uuid,boolean)') is null then
    raise exception 'f_a1_writer prestate: clara.evaluate_witness_identity_v1 is absent -- apply the identity-helper migration first' using errcode='CLR10';
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
  -- M3: the two OPTIONAL reference answers, admitted BESIDE the eleven and nowhere else. An
  -- unknown key is still a refusal -- a vocabulary that admits anything admits a typo.
  v_ref text[] := array['invoice.invoice_id','invoice.invoice_date'];
  v_all text[];
  v_answers jsonb; v_f text; v_a jsonb; v_state text; v_raw text; v_val text; v_contest jsonb;
begin
  v_all := v_belt || v_ref;
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then return false; end if;
  if (p_envelope->'witness'->>'channel') is distinct from p_channel then return false; end if;
  -- M2: `contest` is OPTIONAL but TYPED. The predicate casts it `(->>'contest')::boolean`, so a
  -- string like "unknown" would raise 22P02 out of a STABLE read every consumer reaches through
  -- clara._invoice_fact_state -- a malformation that must die at the write boundary, not at
  -- every later read. absent / json null / true / false are the whole admissible set.
  v_contest := p_envelope->'witness'->'contest';
  if v_contest is not null and jsonb_typeof(v_contest) not in ('boolean','null') then return false; end if;
  v_answers := p_envelope->'witness'->'answers';
  if v_answers is null or jsonb_typeof(v_answers) <> 'object' then return false; end if;
  -- HALF ONE: every key present is a KNOWN key. (Half two -- all eleven belt keys are PRESENT --
  -- is the loop below, which is why the old `count(keys) = 11` test had to go: with thirteen
  -- admissible names a count would pass a map that swapped a belt field for a reference one.)
  if exists (select 1 from jsonb_object_keys(v_answers) as k(name)
              where k.name <> all(v_all)) then return false; end if;
  foreach v_f in array v_all loop
    v_a := v_answers->v_f;
    if v_a is null then
      if v_f = any(v_belt) then return false; end if;   -- a belt answer is REQUIRED (B1)
      continue;                                          -- a reference answer is OPTIONAL (M3)
    end if;
    if jsonb_typeof(v_a) <> 'object' then return false; end if;
    v_state := v_a->>'state';
    if v_state is null or v_state not in ('value','not_printed') then return false; end if;
    if v_state <> 'value' then continue; end if;
    v_raw := nullif(btrim(coalesce(v_a->>'raw','')),'');
    if v_raw is null then return false; end if;
    -- M6: the length bound. `raw` is an unbounded model string and section 9 hands it to
    -- clara._normalize_invoice_cents; 200 characters is far past any real invoice rendering and
    -- far short of anything that could stress a numeric cast. Applied to EVERY answer, so no
    -- field class has to be remembered later.
    if length(v_a->>'raw') > 200 then return false; end if;
    if v_f = any(v_ref) then
      v_val := nullif(btrim(coalesce(v_a->>'value','')),'');
      if jsonb_typeof(v_a->'value') is not null
         and jsonb_typeof(v_a->'value') not in ('string','null') then return false; end if;
      if v_val is not null then
        if length(v_a->>'value') > 200 then return false; end if;
        if v_f = 'invoice.invoice_id' and position(v_val in v_raw) = 0 then
          -- The normalized id must be something the document ACTUALLY prints: a `value` that is
          -- not a substring of the quoted rendering is a model-invented identifier, and the
          -- duplicate-bill wall compares these by exact equality.
          return false;
        end if;
        if v_f = 'invoice.invoice_date' then
          -- ISO YYYY-MM-DD, shape-checked THEN cast-checked: the regex alone admits 2026-02-31,
          -- and the cast alone would accept every other input style Postgres's date parser
          -- tolerates (which is exactly the cross-regime ambiguity this slot exists to remove).
          if v_val !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
          begin
            perform v_val::date;
          exception when others then
            return false;
          end;
        end if;
      end if;
    end if;
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

-- ONE NUMBERING, AND NOW IT IS DB-EXPOSED (review M5). PR-2's prompt builder has to show the
-- witness model a NUMBER per region, and the server resolves that number back through
-- _witness_resolve_citation above. Until this function existed the only published ordinal was
-- clara.get_document_extract's `idx` -- a DIFFERENT ordinal, dense over
-- (engine_kind, version_n, r.id) across EVERY chosen extraction (0054:32-42) -- so a prompt built
-- from it would silently resolve a witness's citation to the wrong region the moment the document
-- carried a second done extraction, which is precisely the state a witness document is in (it has
-- an OCR extraction AND, after the first pass, its own pair). "Both sides use the same query" is
-- a claim; a shared FUNCTION is a fact, so the builder reads THIS and the battery proves the two
-- mappings are identical. SAME QUERY, SAME ORDERING, deliberately duplicated rather than factored
-- into a shared body: the resolver is on the hot write path and lives in a section whose exact
-- shape the writer's postcheck pins -- the parity is asserted BEHAVIOURALLY in the battery, which
-- is the only evidence that would survive one of them being edited anyway.
create function clara.witness_citation_regions(p_ocr_extraction uuid)
  returns table(idx int, region_id uuid, page int, text_content text)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select r.idx::int, r.id,
         case when (r.locator->>'page') ~ '^[0-9]+$' then (r.locator->>'page')::int end,
         r.text_content
    from (select rr.id, rr.text_content, rr.locator,
                 row_number() over (order by rr.id) as idx
            from clara.document_regions rr where rr.extraction_id = p_ocr_extraction) r
   order by r.idx;
$$;
revoke all on function clara.witness_citation_regions(uuid) from public;
grant execute on function clara.witness_citation_regions(uuid) to clara_runtime;

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
  -- SEVEN optional reference paths. `invoice.customer_taxid` is the one the first cut of this
  -- writer DROPPED, and it is not decorative: 0022:1336-1341's live `v_buyer_hit` disjunct reads
  -- field_path='invoice.customer_taxid' off the BOUND extraction as one of three ways a document
  -- can be shown to name the filing client as the BUYER. Under a witness-born extraction that
  -- path would have been permanently unwritable, so that disjunct would silently never fire and
  -- the direction evidence would quietly lose a term (M11's census retires exactly three paths --
  -- contact_person, myinvois_uuid, myinvois_longid -- and this was never one of them).
  v_optional text[] := array['invoice.invoice_id','invoice.invoice_date',
    'invoice.customer_name','invoice.customer_registration','invoice.customer_taxid',
    'invoice.vendor_name','invoice.vendor_registration'];
  v_allowed text[];
  v_f text; v_ans jsonb; v_raw text; v_idx int;
  v_cit record;
  v_cited_id uuid; v_cited_text text; v_cited_locator jsonb;
  v_verified boolean; v_cents bigint; v_locator2 jsonb; v_readable boolean;
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
    -- ON CONFLICT DO NOTHING returns NO ROW precisely when a row ALREADY EXISTS at the conflict
    -- key -- the first cut of this message said the opposite, which would have sent a reader
    -- hunting for a phantom. And on a task this body has just re-locked as `running`, a pair row
    -- already sitting at (document, engine, version, kind) IS an impossible state: step 2/7's
    -- replay branch owns the done case, and nothing else may mint a witness extraction.
    raise exception 'impossible state: an ON CONFLICT fired for the vision row (document=%,engine=%,version=%) -- the pair row already exists at this key while its task is still running',
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
    raise exception 'impossible state: an ON CONFLICT fired for the text row (document=%,engine=%,version=%) -- the pair row already exists at this key while its task is still running',
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
      -- M6, THE MAGNITUDE PRE-GUARD, evaluated BEFORE any normalization on this rendering.
      -- clara._normalize_invoice_cents multiplies by 100 and casts to bigint, so >13 digits
      -- before the decimal RAISES 22003 -- and a raise here would roll back the WHOLE persist,
      -- which is exactly the C4 duty this writer exists to honour ("persist whole; never refuse a
      -- read for being wrong"). An unreadable magnitude therefore fails VERIFICATION and lands
      -- geometry-less with NULL cents, the same landing a failed citation gets. The leaf is a
      -- frozen closure member and cannot be repaired in place; the predicate carries the twin
      -- guard on its own side (0092 §3).
      v_readable := length(regexp_replace(split_part(regexp_replace(
        upper(btrim(coalesce(v_raw,''))), '(MYR|RM)|[,[:space:]]', '', 'g'),
        '.', 1), '[^0-9]', '', 'g')) <= 13;
      -- M4, THE TOKEN BOUNDARY. For a MONETARY field a bare substring test accepts a DIGIT
      -- FRAGMENT: "1,234.56" is a substring of "11,234.56" and of "1,234.567", so a witness that
      -- misread the leading digit would still collect the cited region's real polygon and sail
      -- through C2 on a figure the document never states. The occurrence must be bounded on both
      -- sides by start/end-of-string or a character outside [0-9.,-]. THE MINUS SIGN IS IN THE
      -- CLASS (review NC-3) and it is not decoration: without it, a witness quoting "1.00" off a
      -- printed "-1.00" verifies clean and persists +100 cents against the region that states
      -- MINUS one ringgit -- a sign flip with real geometry behind it, which is the worst shape
      -- a wrong number can take. Every regex metacharacter in the rendering is escaped first --
      -- the rendering is a MODEL string, so an unescaped '.' or '(' would otherwise be a
      -- pattern, not a character. Non-monetary fields keep the plain substring test: there is no
      -- digit-fragment hazard in 'MYR' or '01' (the residual that leaves on the seven reference
      -- paths is registered in f-a1-annexes.md's review-fold record, NC-2).
      --
      -- NC-1, AND IT IS THE WHOLE REASON THIS IS A STATEMENT LADDER RATHER THAN AN AND CHAIN.
      -- PostgreSQL does NOT promise left-to-right evaluation of AND operands (§4.2.14: the order
      -- of evaluation of subexpressions is not defined, and the planner may reorder them), so
      -- writing `v_readable and <normalize> is not null and <regex>` would leave the normalizer
      -- legally free to run FIRST -- and on a 30-digit rendering it raises 22003 and rolls back
      -- the entire persist. That is exactly the C4 violation M6's guard exists to prevent: the
      -- old shape short-circuited in practice, but short-circuiting is the planner's luck, not
      -- the language's law. A plpgsql `if` is a statement boundary, and a statement boundary IS
      -- a guarantee. The normalizer is also now called ONCE instead of twice.
      v_verified := false;
      v_cents := null;
      if v_f = any(v_money) then
        if v_readable then
          v_cents := clara._normalize_invoice_cents(v_raw);
        end if;
        if v_cents is not null and v_cited_id is not null and v_cited_text is not null then
          v_verified := v_cited_text ~ ('(^|[^0-9.,-])'
            || regexp_replace(v_raw, '([^a-zA-Z0-9 ])', '\\\1', 'g')
            || '($|[^0-9.,-])');
        end if;
      elsif v_cited_id is not null and v_cited_text is not null then
        v_verified := position(v_raw in v_cited_text) > 0;
      end if;
      if v_verified then
        -- nit 2: the page locator is cast only when it IS an unsigned integer literal (the
        -- 0091:131 idiom). A malformed OCR locator degrades to a null page rather than raising
        -- 22P02 and rolling back a persist C4 requires to complete.
        v_locator2 := jsonb_build_object(
          'page', case when (v_cited_locator->>'page') ~ '^[0-9]+$' then (v_cited_locator->>'page')::int end,
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

  -- 10. THE SEVEN OPTIONAL REFERENCE FIELDS -- same cite-and-verify mechanics, but NO answers
  -- vocabulary requirement: the witness may simply not have cited one (SS3.3's identity leaf
  -- degrades to "no verdict" on an uncited field, never an error). THE REGION'S `raw` COMES FROM
  -- THE CITATION ENTRY, always, for all seven -- including the two that M3 also gives an optional
  -- ANSWERS slot. The two are different jobs and deliberately not merged: the citation carries
  -- the quoted rendering the server can VERIFY against a cited OCR region (so the fact persists
  -- with real geometry the doc_review surface can highlight), while the answer carries the
  -- normalized `value` the PREDICATE emits for the cross-regime duplicate walls. A witness may
  -- supply either, both, or neither.
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
        -- nit 2, again: the page locator cast is guarded (0091:131's idiom).
        v_locator2 := jsonb_build_object(
          'page', case when (v_cited_locator->>'page') ~ '^[0-9]+$' then (v_cited_locator->>'page')::int end,
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
declare v_sig text;
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

  -- M5: the numbering door, with the SAME posture matrix as the writer itself.
  if to_regprocedure('clara.witness_citation_regions(uuid)') is null then
    raise exception 'f_a1_writer tail: clara.witness_citation_regions did not install' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid='clara.witness_citation_regions(uuid)'::regprocedure
        and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
        and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a1_writer tail: witness_citation_regions is not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where p.oid='clara.witness_citation_regions(uuid)'::regprocedure
        and a.grantee='clara_runtime'::regrole and a.privilege_type='EXECUTE') then
    raise exception 'f_a1_writer tail: witness_citation_regions is not EXECUTE-granted to clara_runtime' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where p.oid='clara.witness_citation_regions(uuid)'::regprocedure
        and a.grantee <> 'clara_runtime'::regrole and a.grantee <> p.proowner
        and a.privilege_type='EXECUTE') then
    raise exception 'f_a1_writer tail: witness_citation_regions is EXECUTE-reachable from a role other than clara_runtime' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
      where f.oid='clara.witness_citation_regions(uuid)'::regprocedure
        and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'f_a1_writer tail: PUBLIC executes witness_citation_regions' using errcode='CLR10';
  end if;
  -- THE PARITY IS A PROPERTY OF THE TEXT, asserted here so a later edit to one body and not the
  -- other is caught at APPLY time rather than at the first mis-cited invoice: both numbering
  -- expressions must be the identical `row_number() over (order by rr.id)` over
  -- `rr.extraction_id = p_ocr_extraction`. The battery proves the mappings AGREE behaviourally;
  -- this proves they are the same query.
  if (select count(*)::int from pg_proc p
       where p.oid in ('clara._witness_resolve_citation(uuid,int)'::regprocedure,
                       'clara.witness_citation_regions(uuid)'::regprocedure)
         and position('row_number() over (order by rr.id) as idx' in p.prosrc) > 0
         and position('where rr.extraction_id = p_ocr_extraction' in p.prosrc) > 0) <> 2 then
    raise exception 'f_a1_writer tail: the resolver and the published numbering do not carry the SAME ordinal expression -- one numbering is the whole contract (M5)' using errcode='CLR10';
  end if;
  -- M1: the seven optional reference paths, invoice.customer_taxid among them (0022:1336-1341's
  -- live buyer-hit disjunct reads it), asserted against the COMMITTED body.
  foreach v_sig in array array['invoice.invoice_id','invoice.invoice_date','invoice.customer_name',
      'invoice.customer_registration','invoice.customer_taxid','invoice.vendor_name',
      'invoice.vendor_registration'] loop
    if position(''''||v_sig||'''' in
        (select p.prosrc from pg_proc p where p.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure)) = 0 then
      raise exception 'f_a1_writer tail: the writer''s optional vocabulary does not carry % -- a citable identity path that cannot be written is a live consumer silently starved', v_sig using errcode='CLR10';
    end if;
  end loop;

  raise notice 'f_a1_writer tail: OK -- clara.persist_witness_facts installed (definer, search_path pinned, EXECUTE to clara_runtime only, no PUBLIC), both private helpers installed, and clara.witness_citation_regions published to clara_runtime ONLY as the single citation numbering (same ordinal expression as the resolver, asserted at the bytes). The optional vocabulary carries all seven reference paths incl. invoice.customer_taxid. No table in workflow/graphile_worker/spike touched; no D1 quiesce needed (pure addition).';
end
$tail$;
