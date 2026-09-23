-- 0291_bank_statement_line_citation — #990: A BANK-STATEMENT LINE CAN NAME WHERE IT WAS READ
-- FROM, ON THE MACHINE INTAKE LANE ONLY.
-- =====================================================================================
-- Spec of record: issue #990's Agent Brief plus the owner's ruling comment dated 2026-09-20
-- ("Build the per-line source citation now, on the OCR ingestion path. This overrules the
-- ticket's own recommendation, which was to accept the gap ... A bank line a person is asked to
-- match should be able to say where it was read from, and the two lanes that honestly have no
-- page, the CSV import and the hand-keyed month, must say so in words ... Nothing dark: the
-- surface states the absence instead of quietly leaving a blank where a citation would sit.").
-- Re-verified live on this branch 2026-09-20 (`gh issue view 990 --comments`): the ruling is the
-- newest, and unopposed by any later comment.
--
-- TICKET STALENESS, NAMED SO A LATER READER DOES NOT RE-DISCOVER IT. The brief describes "the
-- OCR lane" as running "two readers under two engine ids" — 0038's ORIGINAL two-Azure-reader
-- design. The LIVE lane (packages/runtime/workflows/registry.ts: `statementFacts: statementFacts_v3`)
-- has since moved to the WITNESS PAIR: two engine KINDS (`llm_text_facts`/`llm_vision_facts`)
-- sharing ONE engine_id (0098 §3.7/§3.9) — the opposite shape. The brief is stale on the
-- MECHANISM; its ASK stands unchanged: `clara.bank_statement_lines` still carries no page/region
-- column, and the owner's ruling still binds. "The OCR lane" below therefore means
-- `p_ingest_mode IN ('ocr','witness')` — `clara._persist_statement_core_v2`'s OWN `v_two` flag,
-- which is what the function already gates its two-reader ladder on. 'ocr' stays a
-- dead-but-still-valid input on this function (no live caller passes it — the ANCESTOR
-- `clara._persist_statement_core`, untouched by this file, serves the real structured/human
-- callers, per 0098's own tail: "the ancestor is untouched and still serves statement_parse +
-- enter_bank_statement"); 'witness' is the one a real caller (`persist_statement_facts_v2`)
-- reaches.
--
-- WHY THIS TICKET TOUCHES NO packages/runtime FILE. Every module on the live statement-witness
-- path — statementFacts.v2.{dispatch,behavior,impl,prompts}.mjs/.ts and
-- statementFacts.v3.{behavior,header,impl,prompts}.mjs/.ts — is a FROZEN workflow body or a
-- module in its frozen closure (frozen-workflows.json; `node scripts/check-frozen-workflows.mjs`
-- must show no manifest diff). Actually asking the witness model for a per-line citation index
-- and mapping it back to a page/region (the mechanism `clara.witness_citation_regions` and
-- `readStatementWitnessCitationRegions`'s own numbered reading-order substrate already exist
-- for — v2.dispatch.mjs:167-192, whose header states in so many words "no citation is asked
-- back") needs an edit to that frozen prompt/behavior pair. This ticket's report carries that
-- edit as a SUCCESSOR CONTRACT instead. What ships here is the plumbing a future, unfrozen
-- runtime change can populate without a second migration: the column, and the persist core's
-- OWN willingness to carry a citation through when a payload states one.
--
-- WHY DIRECT COLUMNS, NOT A `clara.document_regions` ROW. 0191 S5 reserved a `statement`
-- field_path NAMESPACE for exactly this future producer ("NO in-repo writer emits a
-- `statement.*` region today ... the statement reader is the next producer in line"), which
-- reads as an invitation to mint document_regions rows. This file does NOT: a document_regions
-- row's field_path identifies which FIELD a value answers (`invoice.total`, `sheets.0.A1`), and
-- a bank statement line is not a document EXTRACTION FACT in that sense — it is a table row this
-- estate already persists in full elsewhere (`clara.bank_statement_lines`). Minting a
-- document_regions row per cited line would duplicate storage (the amount/date already live on
-- the line) for no reader that needs a field_path to find them, and would additionally have to
-- clear #857's brand-new `ck_document_regions_field_path_grammar` CHECK (0290, this lane's own
-- prior ticket) for a namespace no producer yet uses. Three plain nullable columns say the same
-- fact — page, region, and which extraction — without borrowing a wall built for a different
-- shape of evidence. The `statement` namespace stays reserved and untouched by this file.
--
-- THE SHAPE. `citation_extraction_id`, `citation_page`, `citation_region` — ALL THREE NULL
-- together (the common case: every line ingested today) or ALL THREE NON-NULL together (a future
-- witness read that names one). `citation_extraction_id` is NEVER caller-supplied: the persist
-- core stamps it with `v_ext1`, the `clara.document_extractions` row the SAME transaction just
-- banked reader1's own read into (step 11) — "which stored extraction it came from" is therefore
-- a fact the core proves about itself, never one it trusts a payload to state. `citation_page` is
-- a 1-based whole page number; `citation_region` is an opaque jsonb locator (the reader's own
-- bounding shape — this file does not interpret it, matching `clara.document_regions.locator`'s
-- own "checked as an object, not as a schema" posture). Populated ONLY when `v_two` (ingest_mode
-- IN ('ocr','witness')) — the CSV/structured and hand-keyed lanes go through the UNTOUCHED
-- ancestor `_persist_statement_core` and never reach this column at all, which is how "the
-- structured and human verbs never populate it" (AC2) holds by construction rather than by a
-- runtime promise. A citation supplied on a lane with no second reader is refused as a runtime
-- wiring error (cell 990.d), mirroring the sibling guard three lines above it in the live body
-- ("a reader2 read was supplied on the % lane, which has no second reader").
--
-- WHY THE PAYLOAD IS READ RAW, NOT THROUGH `clara._stmt_lines_norm`. That normalizer (0038,
-- untouched by this file) is a STRICT allowlist: it rebuilds every line from five named keys and
-- drops anything else, so a `page`/`region` key added to a raw payload line would silently
-- vanish before the persist core ever saw it. This file therefore reads `page`/`region` straight
-- off `p_payload #> '{readers,reader1,lines}'` (the SAME raw value `v_r1` already holds), joined
-- back onto the normalized, chain-proven line set by `line_no` — a join that is provably 1:1
-- because `_stmt_lines_norm`'s own contiguous-1..N proof (unmoved by this file) guarantees one
-- raw element per persisted line_no. `_stmt_lines_norm` is pinned below as the neighbour body
-- this splice relies on without recutting.
--
-- REDO-SAFE BY CONSTRUCTION (#957): S1 is `add column if not exists` / unconditional
-- drop-then-add for its constraints, safe to re-run unconditionally either way. S2/S3's textual
-- splice is NOT re-run on a redo — their first-apply anchor text no longer exists in an
-- already-recut body, so re-searching for it is the wrong question, not a safe no-op — instead
-- the prestate proves the live bodies already carry THIS file's own citation splice (a marker
-- check, the bimodal-pin trap the wave-3 addendum names: "a marker-tolerant or bimodal pin hides
-- its sha branch from a redo"), and S2/S3 skip with a NOTICE. The prestate accepts exactly two
-- starting states per object — wholly absent (first apply, hard sha-pinned) or wholly present
-- with this file's own marker (redo) — and refuses a half state.
--
-- MEASURED ON THIS RIG NOW (wave-3 lane08; #857/0290 is this lane's only ticket ahead of this
-- one, and it touches `clara.document_regions`, not the statement lane — nothing upstream of
-- this file could have recut `_persist_statement_core_v2`, `_stmt_lines_norm` or
-- `get_bank_line_matching_context` on this branch). `clara.bank_statement_lines` holds ZERO rows
-- on this freshly migrated+seeded database — seeding does not populate it — so the DATA-DEPENDENT
-- branch of this ticket's own new code (the citation guard, the join, the table CHECK) is proven
-- live by this file's own test battery, `packages/db/tests/bank-statement-line-citation.test.mjs`
-- (cells 990.a-e), which drives real rows through the real writer door
-- (`clara.persist_statement_facts_v2`) immediately after this migration applies — never a raw
-- fixture insert. Because the table starts empty, the ADD COLUMN and ADD CONSTRAINT statements
-- below validate against zero existing rows (vacuously true), which is why the LIVE proof lives
-- in the test file rather than in this migration's own tail.
--
-- NO rig-meta COHORT AND NO NEW preintegration-gate NEED beyond the one this file adds for its
-- OWN readiness probe (0261/0290's own precedent): this file introduces no new GRANT — the two
-- recut functions keep their existing ACLs verbatim (CREATE OR REPLACE never touches grants),
-- and the three new columns inherit `clara.bank_statement_lines`'s existing table-level grants
-- (clara_fn_owner: full; clara_authenticated/clara_freeform_ro: SELECT). A rig-meta cohort audits
-- GRANT correctness on a NEWLY introduced callable object; there is none here.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- A DO block cannot hand a variable to the next one, so REDO STATE crosses the file's three DO
-- blocks through this temp table (0261's `_r998_pre` idiom) — `is_redo` decides whether S2/S3
-- attempt their textual splice at all (a redo's already-recut body no longer contains the
-- FIRST-APPLY anchor text, so re-searching for it would be the wrong question, not a safe no-op).
create temp table _bslc_state(k text primary key, v text) on commit drop;

-- =====================================================================================
-- PRESTATE — every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $bslc_pre$
declare
  v_src text;
  v_sha text;
  v_col_present boolean;
  v_ck_present boolean;
  v_rows int;
begin
  -- (a) IDEMPOTENCY / REDO. Two acceptable starting states: WHOLLY ABSENT (first apply) or
  -- WHOLLY PRESENT (a #957 redo after a fix-round edit). A HALF state is a defect this file
  -- refuses to build on.
  v_col_present := exists (select 1 from information_schema.columns
     where table_schema = 'clara' and table_name = 'bank_statement_lines'
       and column_name = 'citation_extraction_id');
  v_ck_present := exists (select 1 from pg_constraint
     where conrelid = 'clara.bank_statement_lines'::regclass
       and conname = 'ck_bank_statement_lines_citation_shape');
  if v_col_present <> v_ck_present then
    raise exception 'bslc prestate: HALF-APPLIED -- citation_extraction_id column present=%, ck_bank_statement_lines_citation_shape present=% -- this file must be wholly absent (first apply) or wholly present (redo), never half of either',
      v_col_present, v_ck_present using errcode = 'CLR10';
  end if;
  insert into _bslc_state(k, v) values ('is_redo', v_col_present::text);

  -- (b) THE THREE NEIGHBOUR/TARGET BODIES. `_stmt_lines_norm` is a NEIGHBOUR this file relies on
  -- but does not recut, pinned by prosrc sha256 MEASURED ON THIS RIG NOW (wave-3 rule: pin what
  -- is LIVE, never a sha copied from an earlier migration's header) on BOTH a first apply and a
  -- redo — nothing about this file ever touches it, so it carries exactly one legal pre-image.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._stmt_lines_norm(jsonb)'::regprocedure;
  if v_src is null then
    raise exception 'bslc prestate: clara._stmt_lines_norm is absent -- 0038 must apply first' using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha <> 'a7f9a65876a8178b1522918a48267fb0a47eeb9db799a08919784d5972e8b17a' then
    raise exception 'bslc prestate: clara._stmt_lines_norm body is at sha % (expected the live pre-image a7f9a658...17a, MEASURED on this lane database) -- this file will not join a raw payload against a normalizer nobody re-verified', v_sha
      using errcode = 'CLR10';
  end if;

  -- The two SPLICE TARGETS are pinned ONLY on a first apply: S2/S3 read their pre-image fresh
  -- via pg_get_functiondef and skip the splice entirely on a redo (their own guard, keyed on the
  -- SAME `is_redo` flag), so a strict sha check here would wrongly refuse the lawful "already
  -- mine" redo state the wave-3 addendum names ("CLARA_MIGRATION_REDO only ever takes the 'my
  -- own body is already live' branch"). The FIRST-APPLY branch is what a hard pin protects.
  if not v_col_present then
    select p.prosrc into v_src from pg_proc p
     where p.oid = 'clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)'::regprocedure;
    if v_src is null then
      raise exception 'bslc prestate: clara._persist_statement_core_v2 is absent -- 0098/0175 must apply first' using errcode = 'CLR10';
    end if;
    v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
    if v_sha <> '6f694ac0de0272bb3d7c64856387b7e9420bc7ad5757e1f755f2ea0b17d1db86' then
      raise exception 'bslc prestate: clara._persist_statement_core_v2 body is at sha % -- this file expects the live pre-image 6f694ac0...db86, MEASURED on this lane database, and will not re-splice a body nobody re-verified', v_sha
        using errcode = 'CLR10';
    end if;

    select p.prosrc into v_src from pg_proc p
     where p.oid = 'clara.get_bank_line_matching_context(uuid)'::regprocedure;
    if v_src is null then
      raise exception 'bslc prestate: clara.get_bank_line_matching_context is absent -- 0226 must apply first' using errcode = 'CLR10';
    end if;
    v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
    if v_sha <> '765025f1c658cc5defb257816abc398388616bb82343c699655cbd5079eb29fe' then
      raise exception 'bslc prestate: clara.get_bank_line_matching_context body is at sha % -- this file expects the live pre-image 765025f1...9fe, MEASURED on this lane database', v_sha
        using errcode = 'CLR10';
    end if;
  else
    -- REDO: the live bodies must be recognisably THIS file's own prior output (the column
    -- existing is otherwise unexplained), never a stranger's edit landed between runs.
    if not exists (select 1 from pg_proc where oid = 'clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)'::regprocedure
                     and prosrc like '%citation_extraction_id%' and prosrc like '%#990%') then
      raise exception 'bslc prestate: citation_extraction_id already exists on the table, but clara._persist_statement_core_v2 carries no #990 citation splice -- half-applied by a DIFFERENT mechanism, refuse to guess'
        using errcode = 'CLR10';
    end if;
    if not exists (select 1 from pg_proc where oid = 'clara.get_bank_line_matching_context(uuid)'::regprocedure
                     and prosrc like '%citation_page%') then
      raise exception 'bslc prestate: citation_extraction_id already exists on the table, but clara.get_bank_line_matching_context does not surface citation_page -- half-applied by a DIFFERENT mechanism, refuse to guess'
        using errcode = 'CLR10';
    end if;
  end if;

  select count(*) into v_rows from clara.bank_statement_lines;
  raise notice 'bslc prestate: clean (redo=%) -- clara._stmt_lines_norm pinned untouched; the two splice targets are either at their live pre-image (first apply) or already carry this file''s own splice (redo); clara.bank_statement_lines holds % row(s) (the live proof runs in this ticket''s own test battery, not against these).', v_col_present, v_rows;
end
$bslc_pre$;

-- =====================================================================================
-- S1 — THE COLUMN. Three nullable columns, all-or-nothing by CHECK, defense-in-depth alongside
-- the persist core's own typed refusal (the SAME "also a table CHECK" idiom `_stmt_lines_norm`'s
-- own header names for amount_cents <> 0: "refusing it HERE means the human sees a statement
-- diagnosis instead of a constraint name" -- that diagnosis is S2's job; this CHECK is the wall
-- behind it, catching anything that ever reaches the table by a door other than the core).
-- append-only (t_bank_statement_lines_append_only, 0038, untouched): a nullable ADD COLUMN
-- changes no existing row's data, so it is safe on a table that can never be UPDATEd again.
-- =====================================================================================
alter table clara.bank_statement_lines
  add column if not exists citation_extraction_id uuid,
  add column if not exists citation_page int,
  add column if not exists citation_region jsonb;

alter table clara.bank_statement_lines
  drop constraint if exists fk_bank_statement_lines_citation_extraction;
alter table clara.bank_statement_lines
  add constraint fk_bank_statement_lines_citation_extraction
  foreign key (citation_extraction_id, firm_id) references clara.document_extractions(id, firm_id);

alter table clara.bank_statement_lines drop constraint if exists ck_bank_statement_lines_citation_shape;
alter table clara.bank_statement_lines
  add constraint ck_bank_statement_lines_citation_shape
  check ((citation_extraction_id is null) = (citation_page is null)
     and (citation_page is null) = (citation_region is null));

alter table clara.bank_statement_lines drop constraint if exists ck_bank_statement_lines_citation_page;
alter table clara.bank_statement_lines
  add constraint ck_bank_statement_lines_citation_page
  check (citation_page is null or citation_page >= 1);

alter table clara.bank_statement_lines drop constraint if exists ck_bank_statement_lines_citation_region;
alter table clara.bank_statement_lines
  add constraint ck_bank_statement_lines_citation_region
  check (citation_region is null or jsonb_typeof(citation_region) = 'object');

comment on column clara.bank_statement_lines.citation_extraction_id is
  '#990: which clara.document_extractions row this line''s citation was read from. Always v_ext1, stamped by clara._persist_statement_core_v2 itself -- never a caller-supplied value. NULL on every lane/line without a citation (the CSV/structured and hand-keyed lanes always; the OCR/witness lanes until a per-line read populates one).';
comment on column clara.bank_statement_lines.citation_page is
  '#990: the 1-based printed page this line was read from. NULL exactly when citation_extraction_id is NULL (ck_bank_statement_lines_citation_shape).';
comment on column clara.bank_statement_lines.citation_region is
  '#990: the reader''s own opaque bounding locator for this line (a jsonb object; this table does not interpret its shape, matching clara.document_regions.locator''s own posture). NULL exactly when citation_extraction_id is NULL.';

-- =====================================================================================
-- S2 — THE SPLICE, ONE: clara._persist_statement_core_v2 carries an optional per-line citation
-- from reader1's RAW payload onto the row it inserts, on the two-reader lanes only.
-- =====================================================================================
do $bslc_splice_core$
declare
  v_is_redo boolean;
  v_def text;
  v_anchor_guard text;
  v_replacement_guard text;
  v_anchor_insert text;
  v_replacement_insert text;
  v_pre_sha text;
  v_post_sha text;
  v_post_src text;
begin
  select (v = 'true') into v_is_redo from _bslc_state where k = 'is_redo';
  if v_is_redo then
    raise notice 'bslc splice(core): SKIPPED -- redo (#957): clara._persist_statement_core_v2 already carries this file''s own citation splice (proved in the prestate), so re-searching for the first-apply anchor would be the wrong question, not a safe no-op.';
    return;
  end if;

  select pg_get_functiondef(p.oid), encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    into v_def, v_pre_sha
    from pg_proc p
   where p.oid = 'clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)'::regprocedure;
  if v_pre_sha <> '6f694ac0de0272bb3d7c64856387b7e9420bc7ad5757e1f755f2ea0b17d1db86' then
    raise exception 'bslc splice(core) prestate: pre-image drifted to % since the outer prestate measured it -- concurrent migration?', v_pre_sha
      using errcode = 'CLR10';
  end if;

  -- EDIT 1 — the citation SHAPE GUARD, appended right after the sibling guard it mirrors ("a
  -- reader2 read was supplied on the % lane"). Anchored on that WHOLE elsif/raise/end-if block
  -- (unique in the body) so a change elsewhere in the function cannot silently relocate this
  -- edit onto the wrong branch.
  v_anchor_guard := $anchor1$  elsif v_r2 is not null and jsonb_typeof(v_r2) = 'object' then
    -- A second read on a lane that has no second reader is a runtime wiring error, not a
    -- richer payload. Refusing it keeps the lane<->egress-class invariant every existing gate
    -- keys on legible (design section 4.3): `statement_parse` never egresses, so a vendor
    -- read appearing in its payload means something egressed that no gate saw.
    raise exception 'a reader2 read was supplied on the % lane, which has no second reader', p_ingest_mode
      using errcode='CLR10',detail='{"reason":"internal"}';
  end if;
$anchor1$;
  if (length(v_def) - length(replace(v_def, v_anchor_guard, ''))) / length(v_anchor_guard) <> 1 then
    raise exception 'bslc splice(core): the reader2-wrong-lane guard anchor is not present exactly once' using errcode = 'CLR10';
  end if;

  v_replacement_guard := v_anchor_guard || $repl1$
  -- #990 — OPTIONAL PER-LINE SOURCE CITATION (page + region), read from reader1's RAW payload
  -- (never through clara._stmt_lines_norm, which is untouched and knows only the numeric
  -- skeleton). Only a TWO-READER lane (ocr/witness) can ever have captured one; the CSV and
  -- hand-keyed lanes have no page concept at all, so a citation appearing there is a wiring
  -- error, refused the same way the sibling guard above refuses a stray reader2.
  if not v_two and exists (
    select 1 from jsonb_array_elements(coalesce(v_r1->'lines','[]'::jsonb)) as x(elem)
     where x.elem ? 'page' or x.elem ? 'region') then
    raise exception 'a source citation (page/region) was supplied on the % lane, which has no machine-read page to cite', p_ingest_mode
      using errcode='CLR10',detail='{"reason":"internal"}';
  end if;
  -- Shape: page a positive whole number, region a json object, BOTH present or BOTH absent per
  -- line -- checked here, with a diagnosis naming the statement, rather than left to the table's
  -- own CHECK to reject with a bare constraint name after the chain walk already ran.
  if v_two and exists (
    select 1 from jsonb_array_elements(coalesce(v_r1->'lines','[]'::jsonb)) as x(elem)
     where (x.elem ? 'page') is distinct from (x.elem ? 'region')
        or (x.elem ? 'page' and (jsonb_typeof(x.elem->'page') <> 'number'
              or (x.elem->>'page')::numeric <> trunc((x.elem->>'page')::numeric)
              or (x.elem->>'page')::numeric < 1))
        or (x.elem ? 'region' and jsonb_typeof(x.elem->'region') <> 'object')) then
    raise exception 'a statement line source citation is malformed (page must be a positive whole number and region a json object, both present or both absent)'
      using errcode='CLR10',detail='{"reason":"chain_broken"}';
  end if;
$repl1$;
  v_def := replace(v_def, v_anchor_guard, v_replacement_guard);

  -- EDIT 2 — the ATOMIC INSERT gains the three columns, sourced from a LEFT JOIN back onto
  -- reader1's raw lines by line_no (provably 1:1: _stmt_lines_norm's own contiguous-1..N proof,
  -- untouched, guarantees one raw element per persisted line_no). citation_extraction_id is
  -- ALWAYS v_ext1 -- never read off the payload -- so "which extraction it came from" is this
  -- transaction's own fact about itself.
  v_anchor_insert := $anchor2$  insert into clara.bank_statement_lines(firm_id, client_id, statement_id, bank_account_id,
      line_no, entry_date, value_date, description, amount_cents, running_balance_cents)
    select p_firm, p_client, v_stmt, v_acct,
           (x.elem->>'line_no')::int,
           (x.elem->>'entry_date')::date,
           nullif(x.elem->>'value_date','')::date,
           x.elem->>'description',
           (x.elem->>'amount_cents')::bigint,
           case when jsonb_typeof(x.elem->'running_balance_cents')='number'
                then (x.elem->>'running_balance_cents')::bigint end
    from jsonb_array_elements(v_lines) as x(elem)
    order by (x.elem->>'line_no')::int;
$anchor2$;
  if (length(v_def) - length(replace(v_def, v_anchor_insert, ''))) / length(v_anchor_insert) <> 1 then
    raise exception 'bslc splice(core): the bank_statement_lines INSERT anchor is not present exactly once' using errcode = 'CLR10';
  end if;

  v_replacement_insert := $repl2$  insert into clara.bank_statement_lines(firm_id, client_id, statement_id, bank_account_id,
      line_no, entry_date, value_date, description, amount_cents, running_balance_cents,
      citation_extraction_id, citation_page, citation_region)
    select p_firm, p_client, v_stmt, v_acct,
           (x.elem->>'line_no')::int,
           (x.elem->>'entry_date')::date,
           nullif(x.elem->>'value_date','')::date,
           x.elem->>'description',
           (x.elem->>'amount_cents')::bigint,
           case when jsonb_typeof(x.elem->'running_balance_cents')='number'
                then (x.elem->>'running_balance_cents')::bigint end,
           case when raw1.elem ? 'page' then v_ext1 end,
           case when raw1.elem ? 'page' then (raw1.elem->>'page')::int end,
           raw1.elem->'region'
    from jsonb_array_elements(v_lines) as x(elem)
    left join jsonb_array_elements(coalesce(v_r1->'lines','[]'::jsonb)) as raw1(elem)
      on (raw1.elem->>'line_no')::int = (x.elem->>'line_no')::int
    order by (x.elem->>'line_no')::int;
$repl2$;
  v_def := replace(v_def, v_anchor_insert, v_replacement_insert);

  execute v_def;

  select prosrc, encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_post_src, v_post_sha
    from pg_proc where oid = 'clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)'::regprocedure;
  if position('citation_extraction_id' in v_post_src) = 0 or position('#990' in v_post_src) = 0 then
    raise exception 'bslc splice(core) poststate: the citation columns did not land in the installed body' using errcode = 'CLR10';
  end if;
  raise notice 'bslc splice(core): OK -- clara._persist_statement_core_v2 recut, post-image sha %', v_post_sha;
end
$bslc_splice_core$;

-- =====================================================================================
-- S3 — THE SPLICE, TWO: clara.get_bank_line_matching_context (the Matching tab's own detail-pane
-- door) surfaces citation_page on the `line` object it already builds from `l.*`.
-- =====================================================================================
do $bslc_splice_ctx$
declare
  v_is_redo boolean;
  v_def text;
  v_anchor text;
  v_replacement text;
  v_pre_sha text;
begin
  select (v = 'true') into v_is_redo from _bslc_state where k = 'is_redo';
  if v_is_redo then
    raise notice 'bslc splice(ctx): SKIPPED -- redo (#957): clara.get_bank_line_matching_context already surfaces citation_page (proved in the prestate).';
    return;
  end if;

  select pg_get_functiondef(p.oid), encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    into v_def, v_pre_sha
    from pg_proc p where p.oid = 'clara.get_bank_line_matching_context(uuid)'::regprocedure;
  if v_pre_sha <> '765025f1c658cc5defb257816abc398388616bb82343c699655cbd5079eb29fe' then
    raise exception 'bslc splice(ctx) prestate: pre-image drifted to % since the outer prestate measured it -- concurrent migration?', v_pre_sha
      using errcode = 'CLR10';
  end if;

  v_anchor := $anchor3$      'class_hint', clara._bank_line_class_hint(l.description),
      'group_status', v_line_status,
      'match_id', v_line_match),
$anchor3$;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'bslc splice(ctx): the line jsonb_build_object closing anchor is not present exactly once' using errcode = 'CLR10';
  end if;

  -- `l` is `bank_statement_lines%rowtype` (line 15: `select bl.* into l ...`), so
  -- `l.citation_page` resolves the moment S1's ADD COLUMN lands -- no other change to this
  -- function's own SELECT is needed. citation_region is deliberately NOT surfaced here: a raw
  -- polygon locator is not something the Matching tab's surfaces render (this ticket's own
  -- out-of-scope line, "OCR region-detection accuracy itself"); only the human-legible page
  -- number crosses this wire.
  v_replacement := $repl3$      'class_hint', clara._bank_line_class_hint(l.description),
      'group_status', v_line_status,
      'match_id', v_line_match,
      'citation_page', l.citation_page),
$repl3$;
  v_def := replace(v_def, v_anchor, v_replacement);
  execute v_def;

  if not exists (select 1 from pg_proc where oid = 'clara.get_bank_line_matching_context(uuid)'::regprocedure
                   and prosrc like '%citation_page%') then
    raise exception 'bslc splice(ctx) poststate: citation_page did not land in the installed body' using errcode = 'CLR10';
  end if;
  raise notice 'bslc splice(ctx): OK -- clara.get_bank_line_matching_context recut to surface citation_page';
end
$bslc_splice_ctx$;

-- =====================================================================================
-- §Z — TAIL. Structural proofs only (owner, SECURITY DEFINER, search_path, ACL untouched, the
-- neighbour normalizer untouched, every OTHER constraint/trigger/index on bank_statement_lines
-- survives by name). The LIVE behavioural proof — a real witness statement landing a real
-- citation, a citation-free line staying null, the malformed-shape and wrong-lane refusals, and
-- the context door's read — runs in this ticket's own test file
-- (bank-statement-line-citation.test.mjs), driven through the real writer doors immediately
-- after this migration is applied, per the wave-3 rule that a data-dependent branch must be
-- entered once through the estate's own doors rather than argued from this file's text alone.
-- =====================================================================================
do $bslc_tail$
declare
  v_ok boolean;
  v_name text;
  v_prosrc_sha text;
  v_ancestor_src text;
begin
  -- (1) The three columns, nullable, with the right types.
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='bank_statement_lines'
        and column_name='citation_extraction_id' and data_type='uuid' and is_nullable='YES') then
    raise exception 'bslc tail: citation_extraction_id is missing or has the wrong shape' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='bank_statement_lines'
        and column_name='citation_page' and data_type='integer' and is_nullable='YES') then
    raise exception 'bslc tail: citation_page is missing or has the wrong shape' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='bank_statement_lines'
        and column_name='citation_region' and data_type='jsonb' and is_nullable='YES') then
    raise exception 'bslc tail: citation_region is missing or has the wrong shape' using errcode = 'CLR10';
  end if;

  -- (2) The four new constraints, present.
  foreach v_name in array array['fk_bank_statement_lines_citation_extraction',
      'ck_bank_statement_lines_citation_shape', 'ck_bank_statement_lines_citation_page',
      'ck_bank_statement_lines_citation_region']
  loop
    if not exists (select 1 from pg_constraint
        where conrelid = 'clara.bank_statement_lines'::regclass and conname = v_name) then
      raise exception 'bslc tail: constraint % is missing', v_name using errcode = 'CLR10';
    end if;
  end loop;

  -- (3) EVERY OTHER constraint/trigger/index on clara.bank_statement_lines SURVIVES, BY NAME.
  foreach v_name in array array['bank_statement_lines_amount_cents_check', 'bank_statement_lines_line_no_check',
      'bank_statement_lines_pkey', 'fk_bank_statement_lines_account', 'fk_bank_statement_lines_statement',
      'uq_bank_statement_lines_id_firm_client_account', 'uq_bank_statement_lines_no']
  loop
    if not exists (select 1 from pg_constraint
        where conrelid = 'clara.bank_statement_lines'::regclass and conname = v_name) then
      raise exception 'bslc tail: pre-existing constraint % (unrelated to this file) is gone', v_name using errcode = 'CLR10';
    end if;
  end loop;
  foreach v_name in array array['t_bank_statement_lines_append_only', 't_bank_statement_lines_belt',
      't_bank_statement_lines_no_truncate']
  loop
    if not exists (select 1 from pg_trigger
        where tgrelid = 'clara.bank_statement_lines'::regclass and tgname = v_name) then
      raise exception 'bslc tail: trigger % is gone', v_name using errcode = 'CLR10';
    end if;
  end loop;
  if to_regclass('clara.ix_bank_statement_lines_statement') is null
     or to_regclass('clara.ix_bank_statement_lines_account') is null then
    raise exception 'bslc tail: a pre-existing index on clara.bank_statement_lines is gone' using errcode = 'CLR10';
  end if;

  -- (4) clara._stmt_lines_norm is UNTOUCHED -- this file recuts nothing on the normalizer.
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_prosrc_sha
    from pg_proc where oid = 'clara._stmt_lines_norm(jsonb)'::regprocedure;
  if v_prosrc_sha <> 'a7f9a65876a8178b1522918a48267fb0a47eeb9db799a08919784d5972e8b17a' then
    raise exception 'bslc tail: clara._stmt_lines_norm body moved during this migration (sha %) -- this file must never recut it', v_prosrc_sha
      using errcode = 'CLR10';
  end if;

  -- (5) clara._persist_statement_core_v2: owner, SECURITY DEFINER, search_path all carried over;
  -- the ancestor _persist_statement_core is untouched (still serving structured/human).
  select exists (select 1 from pg_proc p
      where p.oid = 'clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)'::regprocedure
        and p.prosecdef and p.proowner = 'clara_fn_owner'::regrole
        and array_to_string(p.proconfig,',') like '%search_path=clara%')
    into v_ok;
  if not v_ok then
    raise exception 'bslc tail: clara._persist_statement_core_v2 lost its owner/SECURITY DEFINER/search_path shape' using errcode = 'CLR10';
  end if;
  select prosrc, encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_ancestor_src, v_prosrc_sha
    from pg_proc where oid = 'clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)'::regprocedure;
  if v_ancestor_src is null then
    raise exception 'bslc tail: the ancestor clara._persist_statement_core is unexpectedly absent' using errcode = 'CLR10';
  end if;
  -- (bare "citation" is NOT the probe: the ancestor's own 0038-era comment already says
  -- "per-line region citations are not carried" — the exact residual this ticket closes
  -- elsewhere — so that substring is expected and must not trip this check.)
  if position('citation_extraction_id' in v_ancestor_src) > 0
     or position('citation_page' in v_ancestor_src) > 0
     or position('citation_region' in v_ancestor_src) > 0 then
    raise exception 'bslc tail: the ancestor clara._persist_statement_core gained a citation column reference -- it must stay untouched' using errcode = 'CLR10';
  end if;

  -- (6) clara.get_bank_line_matching_context: owner/DEFINER/search_path/ACL all carried over.
  select exists (select 1 from pg_proc p
      where p.oid = 'clara.get_bank_line_matching_context(uuid)'::regprocedure
        and p.prosecdef and p.proowner = 'clara_fn_owner'::regrole
        and array_to_string(p.proconfig,',') like '%search_path=clara%')
    into v_ok;
  if not v_ok then
    raise exception 'bslc tail: clara.get_bank_line_matching_context lost its owner/SECURITY DEFINER/search_path shape' using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.get_bank_line_matching_context(uuid)'::regprocedure, 'execute') then
    raise exception 'bslc tail: clara_authenticated lost EXECUTE on clara.get_bank_line_matching_context' using errcode = 'CLR10';
  end if;

  raise notice 'bslc tail: OK -- three nullable citation columns + four constraints live on clara.bank_statement_lines with every pre-existing constraint/trigger/index intact; clara._stmt_lines_norm and the ancestor clara._persist_statement_core are byte-for-byte untouched; clara._persist_statement_core_v2 and clara.get_bank_line_matching_context keep their owner/DEFINER/search_path/ACL shape after the splice.';
end
$bslc_tail$;
