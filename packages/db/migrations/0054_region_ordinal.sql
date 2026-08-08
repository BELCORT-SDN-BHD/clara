-- 0054_region_ordinal.sql -- H1 ACCEPTANCE FINDING F9: stop asking the drafting model to
-- transcribe a 36-character opaque UUID. clara.get_document_extract gains a STABLE
-- per-region ordinal (`idx`) so the toolface can be cited by INDEX and the SERVER resolves
-- index -> region_id before the DB evidence wall ever sees it.
--
-- GOVERNING EVIDENCE: docs/plan/wave-7a-acceptance-h1.md:773-790 (row 19 / filing e1034202).
-- The model cited region_id `7770763e-56c0-4c6d-a641-0cf54d2edf31`; the real row is
-- `7770763e-56c0-4fce-a641-0cf54d2edf31` -- ONE hex group wrong, recurring across
-- independent attempts (a fresh autodraft supersede AND the separate chat-lane attempt on
-- the same document), while every other cited region (customer name, total, currency,
-- invoice date, vendor name, line description) matched exactly. The same document drafted
-- CLEANLY, FIRST TRY, through the HAND DOOR with the corrected id (h1.md:786-790).
-- ADR-064 SS3 records the fix shape this file implements the DB half of: "the toolface
-- accepts a short index into the evidence list it was shown; the server resolves
-- index->region_id; a bad index rejects with the valid list."
--
-- WHAT IS **NOT** CHANGED, AND WHY THAT IS THE POINT.
-- clara._write_entry_evidence (0009_coding_floor.sql:411-472) IS UNTOUCHED. Its per-item
-- loop casts `e.elem->>'region_id'` to uuid, looks the region up by plain id-equality
-- joined to a done extraction of THIS document, and requires the quote to be a substring
-- of that region's text_content -- otherwise CLR21 `evidence_invalid`. That wall behaved
-- CORRECTLY on every F9 attempt: provenance binding (one of the four structural
-- invariants) held, and the hand-draft proof above shows its contract is exactly right.
-- The defect was entirely on the PERCEPTION side, so the wall's id-based contract stays
-- the authority and the runtime keeps handing it a region_id. Nothing here weakens,
-- widens or re-routes the evidence check.
--
-- THE DB HALF IS NECESSARY-BUT-NOT-SUFFICIENT. The RUNTIME half (autoDraft_v7 +
-- chatTurn_v10, new frozen closures + a workflows/registry.ts repoint) is what changes the
-- toolface: the evidence schema becomes `region_idx`, and the draft wrapper resolves idx ->
-- region_id off the `idx` FIELD of the regions it already fetches server-side (never by
-- array position) before calling clara.wake_draft_entry. This file only publishes the
-- ordinal.
--
-- **DEPLOY ORDER IS BINDING: THIS MIGRATION FIRST, THEN THE RUNTIME IMAGE.** The two
-- directions are NOT symmetric. New DB + OLD runtime is free (v6/v9 pass the RPC jsonb
-- through verbatim and read five named fields; one extra key changes nothing — see
-- COMPATIBILITY). New runtime + OLD DB is an OUTAGE: with no `idx` on any region, the
-- v7/v10 wrappers can resolve nothing, and EVERY document-bound draft refuses CLR21
-- evidence_invalid with "Valid region_idx values: none." Fail-closed and honest, but a
-- full stop on the drafting lane. Apply this file, verify on a positive read that the
-- shipped body emits idx, and only then flip the runtime.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md + RENUMBER.md).
-- Authored as 0054 on branch build/wave-e-f9 while the F6/F7/F8 siblings were still open;
-- if the merge order changes, RENUMBER this file AND its rig battery together
-- (packages/db/tests/x54-region-ordinal.test.mjs reads the ledger for '0054_%' -- the only
-- thing keyed on the number). The frontier probe pins 0050, the last migration whose NAME
-- this branch can see; the runner applies in numeric order and never requires contiguity,
-- so a sibling landing at 0051-0053 needs no change. NO SPLICE-ANCHOR OVERLAP with any
-- sibling: F6 recuts clara.request_reextraction, F7 touches persist_invoice_facts'
-- field_path allowlist, F8 touches admit_autodraft_task; this file recuts
-- clara.get_document_extract alone.
--
-- PROVENANCE OF THE BODY BEING RECUT. The LIVE body of get_document_extract(uuid,uuid,int)
-- is packages/db/migrations/0011_daily_loop.sql:3232, NOT 0009_coding_floor.sql:2613. 0009
-- CREATEd it; 0011 CREATE-OR-REPLACEd it to add the wake-secret-GUC agent lane (the
-- `clara.wake_context()` branch, the per-wake allowlist assertion, and the client-pin
-- refusal `if w.client_id is not null and p_client is distinct from w.client_id then
-- return null`). Recutting 0009's body would silently REVERT that whole lane -- the class
-- of mistake 0050's header records catching in review. This file recuts 0011:3232 verbatim
-- and changes ONE thing: the region CTE. The prestate REFUSES any other body.
--
-- THE ORDINAL, AND THE STABILITY KEY IT IS DERIVED FROM (the one real design choice).
-- `idx` is a DENSE 1..N ordinal over the regions[] array, computed as
--   row_number() over (order by c.engine_kind, c.version_n, r.id)
-- -- EXACTLY the triple this CTE has aggregated by since 0009. Two load-bearing
-- consequences:
--
--   (1) STABILITY. Every key column is immutable for a settled extraction (engine_kind/
--       version_n never change on a settled row; document_regions.id is a primary key),
--       and `chosen` picks the NEWEST done extraction per engine_kind -- so while the
--       same extraction set is chosen, a region gets the same idx on every call, from
--       every caller, in any session. That is what the runtime depends on: the model
--       reads the list through read_document, then cites an idx the wrapper resolves
--       against a SECOND, independent call of the same RPC. A RE-EXTRACTION deliberately
--       renumbers (new extraction, new region rows, `chosen` moves) -- correct, because
--       an idx indexes the CURRENT extraction, and a stale idx lands on a region whose
--       text will not carry the stale quote, so the wall refuses as it does today.
--   (2) THE ARRAY ORDER DOES NOT MOVE. The aggregate's `order by` becomes `order by
--       rr.idx`, computed from the very triple it used before -- same order as today,
--       one extra key per element. Deliberate: the LIVE frozen consumers (autoDraft_v6,
--       chatTurn_v9) read this shape today.
--
-- WHY NOT A GEOMETRIC / "READING ORDER" KEY. document_regions.locator is polymorphic jsonb
-- following locator_kind, whose CHECK admits FOUR kinds (0007:203-220); only page_polygon
-- carries page + polygon. A sort key null for three of four kinds is not a stable order, it
-- is an arbitrary one that LOOKS meaningful. The human-sensible handle is already on every
-- element -- `field_path` -- which is what the runtime's refusal lists beside each idx.
--
-- COMPATIBILITY WITH THE LIVE FROZEN CONSUMERS (measured from their source, not assumed).
--   * autoDraft.v6.tools.ts:262 / chatTurn.v9.tools.ts:227 -- read_document returns
--     `r.rows[0]?.x ?? null`, the RPC's jsonb VERBATIM: no projection, no key allowlist, no
--     zod parse. readInvoiceFactState (both closures) casts `regions` to a TypeScript
--     `ExtractRegion[]` -- structural, erased at runtime -- and reads five named fields. Its
--     `totals[0]` read is order-sensitive ONLY when more than one `invoice.total` region
--     exists, and then `corroborated` is already false (`totals.length === 1` is one of its
--     own conjuncts). The array order is unchanged regardless.
--   * apps/dashboard/app/chat/review.ts:340 (getMachineTotal) filters by engine_kind /
--     field_path / a done extraction id and SORTS by version_n itself.
--   * apps/dashboard/app/shared/dbSeamCensus.bindings.ts's UNCONSUMED_BASELINE for
--     get_document_extract is an EXACT ratchet over emitted-but-unconsumed keys, so `idx`
--     joins that line in the SAME PR -- a ledger entry, not a behaviour change.
--
-- D1 BINDS (packages/db/README.md:99-118): this replaces a live function body, so the
-- recorded write-quiesce procedure applies. The change is read-only and additive, so an
-- interleaved apply cannot corrupt anything -- a reader mid-flight gets the old shape.
--
-- WHAT THE TAIL PROVES AND WHAT IT DOES NOT (0049's own division: "the tail asserts
-- SHAPE ... behaviour on FIXTURES belongs to the rig"). The tail asserts (a) the ordinal
-- is installed and aggregated by, (b) all twelve pre-existing region keys survived,
-- (c) 0011's agent lane survived, (d) ACLs/ownership are unchanged, and (e) -- more than
-- a string match -- the recut query PARSE-ANALYZES against this database's real catalog
-- via a pg_temp `language sql` probe carrying the same CTE chain (SQL bodies are fully
-- analyzed at CREATE; a plpgsql body's statements are planned lazily at first execution,
-- so a successful CREATE OR REPLACE proves only syntax), with the probe's own region CTEs
-- asserted VERBATIM in the installed prosrc so it cannot certify a different query.
-- BEHAVIOUR -- dense, stable, idx-ordered ordinals on a real document -- belongs to
-- packages/db/tests/x54-region-ordinal.test.mjs, on fixtures it builds itself: this
-- function cannot be executed from inside a migration at all (it needs an authenticated
-- human context -- clara._human_ctx raises CLR04 without a JWT -- or a live wake
-- credential, and manufacturing either here would be faking an auth context).

-- SECTION 0 -- PRESTATE. Runs BEFORE the role switch, as the connecting (migration-runner)
-- role, on the same table migrate.mjs itself owns and reads.
do $pre54$
declare v_src text; v_n int; v_key text;
begin
  -- (0.1) FRONTIER.
  if not exists (select 1 from clara.schema_migrations where version = '0050_egress_release_skip_consent') then
    raise exception '0054 prestate: 0050_egress_release_skip_consent is not applied -- frontier mismatch' using errcode='CLR10';
  end if;

  -- (0.2) THE EXACT SIGNATURE EXISTS. A recut that silently CREATEd a new overload instead
  -- of REPLACING the live one would leave the old body reachable and every arm below would
  -- still pass on the new one.
  begin
    perform 'clara.get_document_extract(uuid,uuid,int)'::regprocedure;
  exception when others then
    raise exception '0054 prestate: clara.get_document_extract(uuid,uuid,int) does not exist at that exact signature'
      using errcode='CLR10';
  end;
  select count(*) into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='get_document_extract';
  if v_n <> 1 then
    raise exception '0054 prestate: expected exactly ONE clara.get_document_extract, found % -- an overload this file does not know about would keep the old shape reachable', v_n
      using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
    where p.oid='clara.get_document_extract(uuid,uuid,int)'::regprocedure;

  -- (0.3) THE BODY BEING REPLACED IS 0011:3232, NOT 0009:2613. These three markers are
  -- 0011's OWN additions (the wake-secret agent lane); a body missing any of them is the
  -- pre-0011 one, and recutting it would revert the agent lane wholesale.
  foreach v_key in array array['clara.wake_context()',
      'assert_wake_allowed(w.wake_kind,''get_document_extract'')',
      'if w.client_id is not null and p_client is distinct from w.client_id then return null; end if;']
  loop
    if position(v_key in v_src) = 0 then
      raise exception '0054 prestate: the body being replaced is NOT 0011:3232 -- it is missing %. Refusing to recut a body this migration cannot account for: a blind replace here is how 0050 nearly reverted 0038.', v_key using errcode='CLR10';
    end if;
  end loop;

  -- (0.4) THE REGION CTE IS THE ONE THIS FILE WAS AUTHORED AGAINST, and occurs ONCE.
  v_n := (length(v_src) - length(replace(v_src, '), region_json as (', ''))) / length('), region_json as (');
  if v_n <> 1 then
    raise exception '0054 prestate: the region_json CTE occurs % times in clara.get_document_extract (expected 1) -- this is not the body this file was authored against', v_n
      using errcode='CLR10';
  end if;
  if position('order by c.engine_kind,c.version_n,r.id)' in v_src) = 0 then
    raise exception '0054 prestate: the region aggregate no longer orders by (engine_kind, version_n, r.id) -- the stability key this file derives idx FROM has moved; re-derive the ordinal deliberately rather than applying'
      using errcode='CLR10';
  end if;

  -- (0.5) THE ORDINAL IS NOT ALREADY THERE. A second apply must fail loudly, not silently
  -- re-ship a body somebody else may have since changed.
  if position('''idx''' in v_src) <> 0 then
    raise exception '0054 prestate: clara.get_document_extract ALREADY emits an idx key -- 0054 (or an equivalent recut) has already been applied to this database'
      using errcode='CLR10';
  end if;

  -- (0.6) THE EVIDENCE WALL THIS FILE DELIBERATELY DOES NOT TOUCH IS STILL THE ID-EQUALITY
  -- ONE. Had it already been widened, this fix's premise ("the wall is correct; the
  -- perception side is not") would be stale and must be re-derived, not applied on top.
  select p.prosrc into v_src from pg_proc p
    where p.oid='clara._write_entry_evidence(uuid,uuid,jsonb)'::regprocedure;
  if v_src is null then
    raise exception '0054 prestate: clara._write_entry_evidence(uuid,uuid,jsonb) is GONE' using errcode='CLR10';
  end if;
  if position('where r.id = v_region' in v_src) = 0
     or position('"reason":"evidence_invalid"' in v_src) = 0 then
    raise exception '0054 prestate: clara._write_entry_evidence is no longer the plain id-equality wall raising evidence_invalid -- F9''s premise (the wall is correct, the transcription is not) no longer holds; re-derive this fix'
      using errcode='CLR10';
  end if;

  raise notice '0054 prestate: clean (frontier 0050, one get_document_extract at the 0011 body, one region_json CTE, no idx yet, the evidence wall untouched)';
end $pre54$;

set role clara_fn_owner;

-- 0011:3232 verbatim except for the region CTE. The wake-secret agent lane, the human
-- fallback, the target/admitted/chosen/pieces/budgeted chain, the extraction_json CTE, the
-- envelope shape, the char budget and the return are all unchanged.
create or replace function clara.get_document_extract(p_document uuid,
    p_client uuid default null,p_max_chars int default 20000) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_result jsonb; v_budget int:=least(greatest(coalesce(p_max_chars,20000),0),100000);
  -- hc, not c: the extract query aliases the `chosen` CTE as c — a local record
  -- named c would capture the qualified c.* references (42703).
  w record; hc record; v_firm uuid;
begin
  -- ADR-015: inside SECURITY DEFINER the caller's SET ROLE is invisible
  -- (current_role = the owner), so the wake-secret GUC's PRESENCE is the agent
  -- lane's structural marker. A human PostgREST caller CAN set clara.wake_secret,
  -- but that is not a bypass: a garbage/forged value makes wake_context() return
  -- no row → CLR03 refusal (never data); a valid secret is exactly an authorized
  -- agent credential. The security boundary is wake_context()'s hash+liveness
  -- check, NOT the GUC being unreachable. (Runtime pools SET LOCAL it per request.)
  if coalesce(current_setting('clara.wake_secret',true),'')<>'' then
    select * into w from clara.wake_context();
    if w.credential_id is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'get_document_extract');
    end if;
    if w.client_id is not null and p_client is distinct from w.client_id then return null; end if;
    v_firm:=w.firm_id;
  else
    hc:=clara._human_ctx(clara.role_rank('viewer')); v_firm:=hc.firm;
  end if;
  with target as (
    select d.*,
      not exists(select 1 from clara.document_filings f
                 where f.document_id=d.id and f.retired_at is null) as unassigned
    from clara.documents d where d.id=p_document and d.firm_id=v_firm
  ), admitted as (
    select * from target d where d.unassigned or exists(
      select 1 from clara.document_filings f where f.document_id=d.id
        and f.client_id=p_client and f.retired_at is null)
  ), chosen as (
    select distinct on (e.engine_kind) e.*
    from clara.document_extractions e join admitted d on d.id=e.document_id
    where e.status='done'
    order by e.engine_kind,e.version_n desc,e.id desc
  ), pieces as (
    select ('0:'||c.id::text) as ord,'envelope'::text as kind,c.id as extraction_id,
      null::uuid as region_id,c.envelope::text as content
    from chosen c
    union all
    select ('1:'||r.extraction_id::text||':'||r.id::text),'region',r.extraction_id,
      r.id,coalesce(r.text_content,'')
    from clara.document_regions r join chosen c on c.id=r.extraction_id
  ), budgeted as (
    select p.*,
      greatest(0,least(length(content),v_budget-coalesce(sum(length(content)) over(
        order by ord rows between unbounded preceding and 1 preceding),0)))::int as take_n
    from pieces p
  ), extraction_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'engine_id',c.engine_id,'engine_kind',c.engine_kind,
      'version_n',c.version_n,'status',c.status,'page_count',c.page_count,
      'envelope_text',coalesce((select left(b.content,b.take_n) from budgeted b
        where b.kind='envelope' and b.extraction_id=c.id),''),
      'raw_sha256',c.envelope->>'raw_sha256',
      'normalization_version',c.envelope->>'normalization_version')
      order by c.engine_kind,c.version_n),'[]'::jsonb) as value from chosen c
  ), region_rows as (
    -- 0054 (F9): the STABLE per-region ordinal the toolface cites. The key is the SAME
    -- triple this shape has aggregated by since 0009 — (engine_kind, version_n, r.id) —
    -- every column immutable for a settled extraction, so a region answers the same idx
    -- on every call. DENSE 1..N over exactly the rows aggregated below (the budgeted join
    -- lives INSIDE this CTE, so no region can be numbered here and dropped there). The
    -- model cites idx; the SERVER resolves it back to this row's id;
    -- clara._write_entry_evidence still receives a region_id and still checks it by plain
    -- id-equality. Nothing about the wall moves.
    select r.id,r.extraction_id,r.locator_kind,r.locator,r.field_path,
      r.engine_confidence,r.monetary_raw,r.monetary_cents,
      c.engine_kind,c.version_n,left(b.content,b.take_n) as text_content,
      (row_number() over(order by c.engine_kind,c.version_n,r.id))::int as idx
    from clara.document_regions r join chosen c on c.id=r.extraction_id
    join budgeted b on b.kind='region' and b.region_id=r.id
  ), region_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'idx',rr.idx,
      'id',rr.id,'extraction_id',rr.extraction_id,'engine_kind',rr.engine_kind,
      'version_n',rr.version_n,'locator_kind',rr.locator_kind,'locator',rr.locator,
      'field_path',rr.field_path,'text_content',rr.text_content,
      'engine_confidence',rr.engine_confidence,'monetary_raw',rr.monetary_raw,
      'monetary_cents',rr.monetary_cents) order by rr.idx),
      '[]'::jsonb) as value
    from region_rows rr
  )
  select jsonb_build_object(
    'document',jsonb_build_object('id',d.id,'sha256',d.sha256,
      'original_filename',d.original_filename,'mime_type',d.mime_type,
      'byte_size',d.byte_size,'bytes_verified_at',d.bytes_verified_at,
      'page_count',d.page_count,'extraction_status',d.extraction_status,
      'document_kind',d.document_kind,'financial_date',d.financial_date),
    'unassigned',d.unassigned,
    'filing',case when d.unassigned then null else (select jsonb_build_object(
      'id',f.id,'client_id',f.client_id,'filed_at',f.filed_at,'basis',f.basis)
      from clara.document_filings f where f.document_id=d.id
        and f.client_id=p_client and f.retired_at is null) end,
    'extractions',ej.value,'regions',rj.value,'max_chars',v_budget)
    into v_result
  from admitted d cross join extraction_json ej cross join region_json rj;
  return v_result;
end $$;
alter function clara.get_document_extract(uuid,uuid,int) owner to clara_fn_owner;

reset role;

-- THE PARSE-ANALYSIS PROBE (header section (e)). Carries the recut CTE chain, so a
-- mistyped column, an ambiguous reference or a type error in the new region CTEs fails
-- the MIGRATION rather than the first bookkeeper who opens a document. pg_temp:
-- session-scoped, never granted, never called, gone when this connection ends.
-- `chosen` is shaped exactly as the function's own (`select distinct on (engine_kind) e.*`)
-- so the two new CTEs below are analyzed against the identical column set; the upstream
-- target/admitted filter is elided because it contributes no column the new CTEs read.
create or replace function pg_temp._x54_region_planprobe(p_document uuid, p_client uuid, v_budget int)
  returns jsonb language sql stable as $probe$
  with chosen as (
    select distinct on (e.engine_kind) e.*
    from clara.document_extractions e
    where e.document_id=p_document and e.status='done' and p_client is not null
    order by e.engine_kind,e.version_n desc,e.id desc
  ), pieces as (
    select ('0:'||c.id::text) as ord,'envelope'::text as kind,c.id as extraction_id,
      null::uuid as region_id,c.envelope::text as content
    from chosen c
    union all
    select ('1:'||r.extraction_id::text||':'||r.id::text),'region',r.extraction_id,
      r.id,coalesce(r.text_content,'')
    from clara.document_regions r join chosen c on c.id=r.extraction_id
  ), budgeted as (
    select p.*,
      greatest(0,least(length(content),v_budget-coalesce(sum(length(content)) over(
        order by ord rows between unbounded preceding and 1 preceding),0)))::int as take_n
    from pieces p
  ), region_rows as (
    select r.id,r.extraction_id,r.locator_kind,r.locator,r.field_path,
      r.engine_confidence,r.monetary_raw,r.monetary_cents,
      c.engine_kind,c.version_n,left(b.content,b.take_n) as text_content,
      (row_number() over(order by c.engine_kind,c.version_n,r.id))::int as idx
    from clara.document_regions r join chosen c on c.id=r.extraction_id
    join budgeted b on b.kind='region' and b.region_id=r.id
  ), region_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'idx',rr.idx,
      'id',rr.id,'extraction_id',rr.extraction_id,'engine_kind',rr.engine_kind,
      'version_n',rr.version_n,'locator_kind',rr.locator_kind,'locator',rr.locator,
      'field_path',rr.field_path,'text_content',rr.text_content,
      'engine_confidence',rr.engine_confidence,'monetary_raw',rr.monetary_raw,
      'monetary_cents',rr.monetary_cents) order by rr.idx),
      '[]'::jsonb) as value
    from region_rows rr
  )
  select rj.value from region_json rj;
$probe$;

-- Migration-tail assertions, against the DB's own catalog.
do $tail54$
declare v_src text; v_probe text; v_key text; v_pos int; v_window text; v_n int;
begin
  select p.prosrc into v_src from pg_proc p
    where p.oid='clara.get_document_extract(uuid,uuid,int)'::regprocedure;
  if v_src is null then
    raise exception '0054 tail: clara.get_document_extract(uuid,uuid,int) not found' using errcode='CLR10';
  end if;

  ---- (1) THE ORDINAL EXISTS, IS DERIVED FROM THE STABILITY KEY, AND THE AGGREGATE ORDERS
  ---- BY IT. Anchored on the region_rows CTE itself rather than on the first mention of
  ---- `idx` anywhere in the body: a comment naming idx must not be able to satisfy this.
  v_pos := position('), region_rows as (' in v_src);
  if v_pos = 0 then
    raise exception '0054 tail: the region_rows CTE is absent -- the ordinal was not installed' using errcode='CLR10';
  end if;
  if position('(row_number() over(order by c.engine_kind,c.version_n,r.id))::int as idx' in v_src) = 0 then
    raise exception '0054 tail: idx is not row_number() over (engine_kind, version_n, r.id) -- the stability key this fix rests on is not what shipped'
      using errcode='CLR10';
  end if;
  if position('''idx'',rr.idx' in v_src) = 0 then
    raise exception '0054 tail: the region envelope does not emit the idx key' using errcode='CLR10';
  end if;
  if position('order by rr.idx)' in v_src) = 0 then
    raise exception '0054 tail: the regions[] aggregate does not order by idx -- the list the model reads would not be 1..N in order'
      using errcode='CLR10';
  end if;
  ---- ...and the ordinal is computed over EXACTLY the aggregated rows: the budgeted join
  ---- must live INSIDE region_rows, or a region could be numbered here and dropped there.
  ---- The window is the region_rows CTE ITSELF (up to region_json's own opener), not a
  ---- fixed character count -- a fixed count silently shortens as the CTE's comment grows.
  v_n := position('), region_json as (' in v_src);
  if v_n <= v_pos then
    raise exception '0054 tail: region_json no longer follows region_rows -- the CTE chain is not the one this file installed' using errcode='CLR10';
  end if;
  v_window := substring(v_src from v_pos for v_n - v_pos);
  if position('join budgeted b on b.kind=''region'' and b.region_id=r.id' in v_window) = 0 then
    raise exception '0054 tail: the budgeted join is not inside region_rows -- idx would be computed over a different row set than the one aggregated, and could be sparse or misaligned'
      using errcode='CLR10';
  end if;

  ---- (2) EVERY PRE-EXISTING REGION KEY SURVIVED. The change is ADDITIVE; a recut that
  ---- dropped one of these would break the live frozen consumers and the dashboard.
  foreach v_key in array array[
      '''id'',rr.id','''extraction_id'',rr.extraction_id','''engine_kind'',rr.engine_kind',
      '''version_n'',rr.version_n','''locator_kind'',rr.locator_kind','''locator'',rr.locator',
      '''field_path'',rr.field_path','''text_content'',rr.text_content',
      '''engine_confidence'',rr.engine_confidence','''monetary_raw'',rr.monetary_raw','''monetary_cents'',rr.monetary_cents']
  loop
    if position(v_key in v_src) = 0 then
      raise exception '0054 tail: the region envelope lost % -- this recut is ADDITIVE and must carry every pre-existing key', v_key
        using errcode='CLR10';
    end if;
  end loop;
  ---- ...and the char budget still truncates the region text (the take_n read moved into
  ---- region_rows; if it were lost, an unbounded document would blow the model's context).
  if position('left(b.content,b.take_n) as text_content' in v_src) = 0 then
    raise exception '0054 tail: the region text is no longer truncated to the char budget''s take_n' using errcode='CLR10';
  end if;

  ---- (3) 0011'S AGENT LANE SURVIVED THE RECUT -- the exact revert 0050's header records
  ---- nearly shipping once already, asserted here rather than trusted.
  foreach v_key in array array['clara.wake_context()',
      'assert_wake_allowed(w.wake_kind,''get_document_extract'')',
      'if w.client_id is not null and p_client is distinct from w.client_id then return null; end if;',
      'clara._human_ctx(clara.role_rank(''viewer''))']
  loop
    if position(v_key in v_src) = 0 then
      raise exception '0054 tail: the recut body lost % -- 0011''s agent lane was reverted', v_key using errcode='CLR10';
    end if;
  end loop;
  ---- ...and the extraction (envelope) half is untouched.
  if position('''envelope_text'',coalesce((select left(b.content,b.take_n) from budgeted b' in v_src) = 0
     or position('''extractions'',ej.value,''regions'',rj.value,''max_chars'',v_budget' in v_src) = 0 then
    raise exception '0054 tail: the extraction/envelope half of the shape moved -- this file changes the region CTE and nothing else' using errcode='CLR10';
  end if;

  ---- (4) THE PARSE-ANALYSIS PROBE CERTIFIES THE INSTALLED TEXT, not a lookalike: the span
  ---- covering BOTH new CTEs (region_rows' first select through region_json's own
  ---- `from region_rows rr` -- everything but the explanatory comment the shipped body
  ---- carries and the probe does not) must appear VERBATIM in the shipped body.
  ---- pg_my_temp_schema(), not a `pg_temp.` regprocedure cast: pg_proc carries EVERY
  ---- session's temp functions, so a name lookup could read another backend's object.
  select p.prosrc into v_probe from pg_proc p
    where p.pronamespace = pg_my_temp_schema() and p.proname = '_x54_region_planprobe';
  if v_probe is null then
    raise exception '0054 tail: the pg_temp parse-analysis probe is absent -- the recut query was never analyzed against this catalog' using errcode='CLR10';
  end if;
  v_key := substring(v_probe from 'select r\.id,r\.extraction_id,r\.locator_kind.*?from region_rows rr');
  if v_key is null or length(v_key) < 400 then
    raise exception '0054 tail: could not read the region CTE span out of the probe body -- the probe cannot certify what it cannot be read from (got % chars)', coalesce(length(v_key),0)
      using errcode='CLR10';
  end if;
  if position(v_key in v_src) = 0 then
    raise exception '0054 tail: the probe''s region CTE span does not appear VERBATIM in the installed clara.get_document_extract -- the analyzed query and the shipped query are not the same text'
      using errcode='CLR10';
  end if;

  ---- (5) ACLs: CREATE OR REPLACE preserves grants, so this asserts nothing drifted. The
  ---- pinned matrix is 0011:4268's own -- authenticated YES, agent_ro YES, wake_interactive
  ---- NO, runtime NO (the agent lanes read through the clara_agent_ro pool with a wake
  ---- secret bound, which is why wake_interactive holds no direct grant).
  if not has_function_privilege('clara_authenticated', 'clara.get_document_extract(uuid,uuid,int)'::regprocedure, 'execute')
     or not has_function_privilege('clara_agent_ro', 'clara.get_document_extract(uuid,uuid,int)'::regprocedure, 'execute') then
    raise exception '0054 tail: clara_authenticated / clara_agent_ro lost EXECUTE on get_document_extract -- CREATE OR REPLACE must preserve the grants' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_wake_interactive', 'clara.get_document_extract(uuid,uuid,int)'::regprocedure, 'execute')
     or has_function_privilege('clara_runtime', 'clara.get_document_extract(uuid,uuid,int)'::regprocedure, 'execute') then
    raise exception '0054 tail: get_document_extract became reachable from a role 0011''s ACL matrix pins as NO' using errcode='CLR10';
  end if;
  if exists(select 1 from pg_proc p, aclexplode(p.proacl) a
            where p.oid='clara.get_document_extract(uuid,uuid,int)'::regprocedure
              and a.grantee=0 and a.privilege_type='EXECUTE') then
    raise exception '0054 tail: PUBLIC holds EXECUTE on get_document_extract' using errcode='CLR10';
  end if;
  ---- ...and the function is still SECURITY DEFINER with a pinned search_path, owned by
  ---- clara_fn_owner. A recut that lost either is a privilege change, not a shape change.
  if not exists(select 1 from pg_proc p
      where p.oid='clara.get_document_extract(uuid,uuid,int)'::regprocedure
        and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=%'
        and p.proowner = 'clara_fn_owner'::regrole) then
    raise exception '0054 tail: get_document_extract is no longer SECURITY DEFINER + pinned search_path + owned by clara_fn_owner' using errcode='CLR10';
  end if;

  ---- (6) THE EVIDENCE WALL IS BYTE-UNTOUCHED BY THIS FILE. Asserted at the tail as well
  ---- as the prestate: this migration must never be the reason the wall changed.
  select p.prosrc into v_src from pg_proc p
    where p.oid='clara._write_entry_evidence(uuid,uuid,jsonb)'::regprocedure;
  if position('where r.id = v_region' in v_src) = 0
     or position('"reason":"evidence_invalid"' in v_src) = 0 then
    raise exception '0054 tail: clara._write_entry_evidence is not the id-equality wall any more -- this file must never touch it' using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='get_document_extract';
  if v_n <> 1 then
    raise exception '0054 tail: there is now more than one clara.get_document_extract -- an overload was created instead of a replace' using errcode='CLR10';
  end if;
  raise notice '0054 tail: get_document_extract emits a dense per-region idx = row_number() over (engine_kind, version_n, r.id), regions[] aggregates BY that idx, all twelve pre-existing region keys and 0011''s agent lane survived, the recut query parse-analyzed against this catalog, ACLs preserved, and _write_entry_evidence is untouched';
end $tail54$;
