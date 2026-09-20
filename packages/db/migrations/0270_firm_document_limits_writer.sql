-- 0270_firm_document_limits_writer — #960 (lane 10, riders wave 2): THE FIRM'S OWN OWNER OR
-- ADMIN SETS ITS FOUR DOCUMENT-PROCESSING CAPS, RECEIPTED AND AUDITED.
-- =====================================================================================
-- Spec of record: ticket #960's Agent Brief, ready-for-agent after the owner's ruling below.
-- The ticket itself RECOMMENDED option A (an operator-only door). The owner OVERRULED that
-- recommendation, and the ruling is what this file implements.
--
-- OWNER RULING (2026-09-20), VERBATIM FROM THE TICKET: "The ticket recommended Option A, an
-- operator-only door; the ruling is Option C: the firm's own owner or admin sets all four
-- processing caps freely. BELCORT will price by usage later, so every change must be receipted
-- and audited as usage-billing evidence, and the estate's own safety limits stay the absolute
-- ceiling above whatever a firm sets. This does not retire the operator firm: BELCORT's operator
-- role stands ...; what was retired elsewhere is only operator approval of a paid registration."
--
-- =====================================================================================
-- WHAT THIS FILE ADDS, IN TWO SENTENCES. `clara.set_firm_document_limits` — the FIRST human
-- writer `clara.firm_document_limits` has ever had, in the whole estate — lets the caller's OWN
-- firm's owner or admin set any of the four processing caps, each change bounded above by
-- `clara._firm_document_limit_ceiling`, receipted through `clara.op_receipts` and recorded in
-- `clara.audit_log` with the before and after value of every cap that actually moved. Nothing
-- else moves: no relation, no column added, dropped or retyped, no CHECK, no NOT NULL, no
-- policy, no trigger, no table ACL change, no row, and not one of the bodies that ENFORCE a cap.
--
-- =====================================================================================
-- WHY THE RELATION HAD NO WRITER, AND WHY THAT IS THE WHOLE TICKET. 0196's own header (#692)
-- and #635's processing-capacity card both record the same fact in their own words: the only
-- governed thing attached to `clara.firm_document_limits` was a column-preserving BEFORE-INSERT
-- upsert trigger that no public door reached, so the four numbers were settable by an
-- owner-level hand and by nothing else. #635 shipped the card READ-ONLY for exactly that reason
-- and filed this ticket as its follow-up.
--
-- THIS DOOR RIDES THAT TRIGGER RATHER THAN REPLACING IT. `clara._tf_firm_document_limits_upsert`
-- is pinned by sha256 in the prestate AND re-measured in the tail: this file does not recut it.
-- The trigger is what makes the four caps INDIVIDUALLY settable — a NULL argument reaches it as
-- "leave this column alone", and on a firm's FIRST insert it supplies the relation's own
-- first-insert values (100 / 1000 / 2 / 2). Re-implementing "preserve the columns the caller did
-- not name" inside this door would be a second expression of the rule, free to disagree with the
-- one the relation actually enforces, which is precisely the defect #692 closed.
--
-- WHY THERE IS NO `p_firm` ARGUMENT. The caller's OWN firm, always, out of
-- `clara._human_ctx(clara.role_rank('admin'))` — the same reasoning
-- `clara.set_firm_high_stakes_threshold` states for itself: a firm-id parameter would make
-- cross-firm reach a BODY CHECK rather than a structural impossibility. The ruling gives this
-- verb to the firm, so the firm it acts on is not a thing the caller gets to say.
--
-- WHY THE FLOOR IS ADMIN AND NOT OWNER. The ruling says "the firm's own owner or admin", and
-- `clara.role_rank('owner')` (3) is above `clara.role_rank('admin')` (2), so an admin floor
-- admits exactly those two ranks and nobody below. The floor is INSIDE the body, never on the
-- grant: the grant is the coarse `clara_authenticated` one every human door carries, so a
-- bookkeeper reaches the same door and gets the database's own CLR04, rather than a surface
-- pre-hiding a control on a client-side rank guess.
--
-- WHY A CEILING FUNCTION AND NOT A COLUMN CHECK. See §A. In one line: a CHECK would be the
-- estate telling every EXISTING row it is illegal, and the brief's own sentence is that the
-- DOOR carries the maximum ("since no such maximum is expressed today, the door carries it and
-- refuses anything above it"). The ceiling lives in a `clara_fn_owner`-owned function granted to
-- NOBODY, so "no firm can raise it" is structural rather than a rule somebody has to obey.
--
-- WHY THE RECEIPT STATES ALL FOUR CAPS AND NOT ONLY THE ONE THAT MOVED. A first write against a
-- firm with no row LANDS three values the caller never named (the trigger's own first-insert
-- arm), and a receipt that mentioned only the named cap would leave the caller to guess the
-- other three — on a record the estate intends to bill from. The receipt therefore carries the
-- resulting four, the previous four (NULLs when there was no row at all), the list of caps that
-- actually moved, and whether this call created the row.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO:
--   · it does not widen or narrow the relation's own SELECT grant (the brief's out-of-scope
--     list names the narrowing; the tail asserts the matrix is byte-identical in BOTH
--     directions);
--   · it does not touch ANY door that enforces a cap. `clara._reserve_document_ingest`,
--     `clara._reserve_processing_call`, `clara.claim_document_processing_task`,
--     `clara.settle_ingest_reservation`, `clara._resize_document_reservation` and
--     `clara._settle_document_reservation` keep their own `coalesce(l.<cap>, <fallback>)`
--     readings off a LEFT JOIN, so a firm with no row behaves exactly as it did. Each is pinned
--     by sha256 below and re-measured in the tail;
--   · it does not change `clara.get_firm_commercial_state` (0233), so a firm with no stored row
--     still reads as four NULLs and #635's card still renders that as a NAMED ZERO rather than
--     as the relation's first-insert values. A number nobody stored is not that firm's cap;
--   · it does not render or touch `clara.firm_limits.max_concurrent_runs`, the firm's other
--     per-firm cap, which the brief puts out of scope.
--
-- REDO-SAFE (#957). Every statement here is `create or replace` or an idempotent grant/revoke,
-- and the prestate asserts nothing about the ABSENCE of this file's own objects — so re-running
-- it against a database that already carries its effects is safe, which is what
-- `CLARA_MIGRATION_REDO` requires of its target (packages/db/README.md, "Redo (#957)").
-- =====================================================================================

do $w960_pre$
declare
  v_cols text; v_grants text; v_cons text; v_trigs text; v_sha text;
  -- THE FRONTIER PINS, MEASURED ON THIS RIG NOW, never transcribed from an older file's text:
  -- a ticket earlier in this lane's chain could in principle have recut any of these, and as
  -- measured here none had. Every one of them is a body this file must NOT touch.
  v_pins text[][] := array[
    ['clara._tf_firm_document_limits_upsert()',
     'e07fabd4e475ae29ac8b5fa6a4f8477f72698df26110bfe8d4f3e456aa1f8eb2'],
    ['clara._reserve_document_ingest(uuid,uuid,integer,timestamp with time zone)',
     '074c9b180729e3f2d8af8d9fecb38be158db9e2a74e4292b11ff7533a1ed9734'],
    ['clara._reserve_processing_call(uuid,integer)',
     'a713fa374a9069e08862a5a234ad0df6f5303a4223de3bdaaeafc99ae4358043'],
    ['clara._resize_document_reservation(uuid,uuid,integer)',
     '41528b318065207775e48c4ac3f196f07d6cdf0511d108affc72b86c07114dbf'],
    ['clara._settle_document_reservation(uuid,uuid,integer)',
     'b72d83e70645d7bbce44a491002981576059e9d0db41a95ee07e6b87930ddee6'],
    ['clara._settle_processing_call(uuid,integer)',
     'e8b50f0d10da45be4caf6e278248750a4b1e862148dc879fbe38e7a5b4a02408'],
    ['clara.claim_document_processing_task(uuid,text,boolean)',
     '01e517bf575806a01f93441bbc2459856e1f4f12624b312c3ba670ebf111b9a0'],
    ['clara.settle_ingest_reservation(uuid,integer,text)',
     'a7b8d4eeed2c17bfaf252fe73e2185c78255ce4d1e10fac2b933619ff50a9aab'],
    ['clara.get_firm_commercial_state()',
     '347141ee22b52c125ff845451051f03354f1f0e9d57cc43d759253f3273ed19e']
  ];
  v_i int;
begin
  -- (1) THE RELATION AND ITS SEVEN COLUMNS, in the order this door's INSERT names.
  if to_regclass('clara.firm_document_limits') is null then
    raise exception '#960 prestate: clara.firm_document_limits is absent -- 0007 must apply first'
      using errcode='CLR10';
  end if;
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema='clara' and table_name='firm_document_limits';
  if v_cols is distinct from 'firm_id,docs_per_day,pages_per_day,ocr_concurrency,updated_at,updated_by,llm_witness_concurrency' then
    raise exception '#960 prestate: clara.firm_document_limits is not the seven-column relation this door writes -- got %', v_cols
      using errcode='CLR10';
  end if;

  -- (2) THE SHARED PREAMBLE this door is built out of. An absent helper here would surface as a
  --     runtime 42883 on the first call rather than as a refusal to apply.
  foreach v_cols in array array['clara._human_ctx(integer)', 'clara.role_rank(text)',
      'clara._reserve_op(uuid,text,text,bytea)', 'clara._finish_op(uuid,text,text,jsonb)',
      'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)', 'clara._hash(jsonb)'] loop
    if to_regprocedure(v_cols) is null then
      raise exception '#960 prestate: % is absent', v_cols using errcode='CLR10';
    end if;
  end loop;

  -- (3) THE PINS. Every body this file leaves alone, measured now.
  for v_i in 1 .. array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[v_i][1]) is null then
      raise exception '#960 prestate: % is absent', v_pins[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#960 prestate: % has DRIFTED from its measured pre-image -- this file must not touch it, so re-measure before applying (got %)',
        v_pins[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- (4) THE RELATION'S OWN CONSTRAINT SET, pinned as one canonical string. §B's floor MIRRORS
  --     the four CHECKs below rather than inventing a bound, and this file adds none: the tail
  --     re-measures the same string.
  select string_agg(conname||'='||pg_get_constraintdef(oid), ' | ' order by conname) into v_cons
    from pg_constraint where conrelid='clara.firm_document_limits'::regclass;
  if v_cons is distinct from
     'firm_document_limits_docs_per_day_check=CHECK ((docs_per_day > 0)) | '
     || 'firm_document_limits_firm_id_fkey=FOREIGN KEY (firm_id) REFERENCES clara.firms(id) | '
     || 'firm_document_limits_llm_witness_concurrency_check=CHECK (((llm_witness_concurrency IS NULL) OR (llm_witness_concurrency > 0))) | '
     || 'firm_document_limits_ocr_concurrency_check=CHECK ((ocr_concurrency > 0)) | '
     || 'firm_document_limits_pages_per_day_check=CHECK ((pages_per_day > 0)) | '
     || 'firm_document_limits_pkey=PRIMARY KEY (firm_id) | '
     || 'firm_document_limits_updated_by_fkey=FOREIGN KEY (updated_by) REFERENCES clara.users(id)' then
    raise exception '#960 prestate: clara.firm_document_limits'' constraint set has DRIFTED -- got %', v_cons
      using errcode='CLR10';
  end if;

  -- (5) THE FOUR TRIGGERS, by name. The write below rides the fourth of them.
  select string_agg(tgname, ',' order by tgname) into v_trigs
    from pg_trigger where tgrelid='clara.firm_document_limits'::regclass and not tgisinternal;
  if v_trigs is distinct from 't_firm_document_limits_firm_immutable,t_firm_document_limits_no_truncate,t_firm_document_limits_stamp,t_firm_document_limits_upsert' then
    raise exception '#960 prestate: clara.firm_document_limits'' trigger set has DRIFTED -- got %', v_trigs
      using errcode='CLR10';
  end if;

  -- (6) THE APPLICATION-ROLE GRANT MATRIX. The brief's out-of-scope list forbids narrowing the
  --     read grant; this file widens nothing either, and the tail re-measures the same string.
  select coalesce(string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type), '') into v_grants
    from information_schema.role_table_grants
   where table_schema='clara' and table_name='firm_document_limits'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_grants is distinct from 'clara_authenticated:SELECT' then
    raise exception '#960 prestate: clara.firm_document_limits'' application-role grant matrix has DRIFTED -- got %', v_grants
      using errcode='CLR10';
  end if;

  raise notice '#960 prestate: clean -- the seven-column relation, its four triggers and its seven constraints are at their measured pre-images, the six shared preamble routines resolve, the nine bodies this file must not touch are byte-identical to their pins, and the relation grants SELECT to clara_authenticated and nothing else to any application role.';
end
$w960_pre$;

set role clara_fn_owner;

-- =================================================================================================
-- §A -- clara._firm_document_limit_ceiling(text). THE ESTATE'S OWN MAXIMUM per cap, and the one
-- place it is written down. Granted to NOBODY: it is reached only from §B's SECURITY DEFINER
-- body, exactly the disposition 0234's clara._legal_enforcement_mode and 0186's
-- clara._admission_capacity_state carry. A firm cannot raise a number it cannot reach.
--
-- WHY THESE FOUR NUMBERS. The estate runs ONE always-on `clara-runtime` machine
-- (docs/ARCHITECTURE.md's own deployment table: `min_machines_running = 1`,
-- `auto_stop_machines = false`, and the paragraph immediately under it that says in as many
-- words that this is deliberately NOT high availability). A per-firm concurrency ceiling of 16
-- is therefore already far above anything this deployment will actually run in parallel: it is
-- there so that a firm cannot write a number that would queue unbounded vendor calls against a
-- shared machine, not to promise throughput. The two daily ceilings are 100x the relation's own
-- first-insert values (0196's trigger: 100 / 1000) -- 10,000 documents and 100,000 pages in one
-- UTC day is past what any Malaysian accounting firm ingests in a day, and short of a number
-- that would let one firm's backlog exhaust the shared ingest lane.
--
-- THIS IS NOT A COLUMN CHECK, deliberately. A CHECK constraint would be the estate telling every
-- EXISTING row it is illegal, and this relation is written today only by the operator ceremony
-- and this rig's own root hand; the ticket's scope is a DOOR, and "the door carries it" is the
-- brief's own sentence. Nothing in this file touches the relation's constraint set.
-- =================================================================================================
create or replace function clara._firm_document_limit_ceiling(p_cap text) returns int
  language sql immutable set search_path = clara, pg_temp as $$
  select case p_cap
    when 'docs_per_day'            then 10000
    when 'pages_per_day'           then 100000
    when 'ocr_concurrency'         then 16
    when 'llm_witness_concurrency' then 16
    else null end;
$$;

-- =================================================================================================
-- §B -- clara.set_firm_document_limits. The firm's OWN owner or admin, its OWN firm, always.
-- =================================================================================================
create or replace function clara.set_firm_document_limits(
    p_docs_per_day int default null,
    p_pages_per_day int default null,
    p_ocr_concurrency int default null,
    p_llm_witness_concurrency int default null,
    p_op_key text default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record;
  v_dedupe jsonb;
  v_old clara.firm_document_limits%rowtype;
  v_new clara.firm_document_limits%rowtype;
  v_changed text[] := array[]::text[];
  v_previous jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_cap text;
  v_asked int;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;

  -- A CALL THAT NAMES NO CAP IS REFUSED, never ridden through. Every cap argument is optional
  -- (that is what makes them individually settable), so this call is reachable -- and riding it
  -- through would mint a receipt and an audit row for a change that did not happen, in a trail
  -- the estate means to bill from.
  if p_docs_per_day is null and p_pages_per_day is null and p_ocr_concurrency is null
     and p_llm_witness_concurrency is null then
    raise exception 'name at least one cap to set' using errcode='CLR10',
      detail='{"reason":"no_cap_named"}';
  end if;

  -- BOTH BOUNDS, CHECKED BEFORE ANYTHING IS RESERVED OR WRITTEN.
  --  · the floor MIRRORS the relation's own CHECKs (`> 0` on three columns, `null or > 0` on the
  --    fourth) and refuses first, so a caller gets a Clara refusal it can render instead of a
  --    raw 23514 -- the same reasoning clara.set_firm_high_stakes_threshold states for its own
  --    mirror of `high_stakes_amount_cents > 0`;
  --  · the ceiling is the ESTATE's, and the refusal names the cap AND the number, because a
  --    bound a caller cannot see is a bound they cannot work with.
  foreach v_cap in array array['docs_per_day','pages_per_day','ocr_concurrency','llm_witness_concurrency'] loop
    v_asked := case v_cap
      when 'docs_per_day' then p_docs_per_day
      when 'pages_per_day' then p_pages_per_day
      when 'ocr_concurrency' then p_ocr_concurrency
      else p_llm_witness_concurrency end;
    if v_asked is null then continue; end if;
    if v_asked <= 0 then
      raise exception '% must be a positive whole number', v_cap
        using errcode='CLR10', detail='{"reason":"invalid_cap"}';
    end if;
    if v_asked > clara._firm_document_limit_ceiling(v_cap) then
      raise exception '% may not exceed the estate ceiling of %', v_cap,
        clara._firm_document_limit_ceiling(v_cap)
        using errcode='CLR10', detail='{"reason":"cap_above_ceiling"}';
    end if;
  end loop;

  begin
    v_dedupe := clara._reserve_op(c.firm, 'set_firm_document_limits', p_op_key,
      clara._hash(jsonb_build_object(
        'docs_per_day', p_docs_per_day, 'pages_per_day', p_pages_per_day,
        'ocr_concurrency', p_ocr_concurrency, 'llm_witness_concurrency', p_llm_witness_concurrency,
        'actor', c.actor)));
  exception when sqlstate 'CLR10' then
    -- `_reserve_op`'s own UNTYPED "op_key reused with different args" (0004), re-raised WITH a
    -- detail so every refusal this door emits carries (errcode, detail.reason) -- 0234's own
    -- wrap, for the same reason: a surface cannot branch on a sentence.
    raise exception 'this op key was already used for a different cap change'
      using errcode='CLR10', detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null then
    if coalesce(v_dedupe->>'pending','') = 'true' then
      raise exception 'this cap change is already being recorded' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;                                  -- the ORIGINAL receipt, byte-identical
  end if;

  -- ONE ADVISORY KEY OF ITS OWN, in the single-bigint space (0234's own idiom), so the
  -- read-then-write below cannot interleave with a second admin's. WITHOUT it two admins both
  -- read the SAME `previous` before either writes, and both receipts claim the same before-value
  -- -- 100->250 and 100->400, with a final value of 400. No serial order of those two calls is
  -- consistent with both receipts, and these receipts are usage-billing evidence.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clara.firm-document-limits:' || c.firm::text, 0));

  -- THE BEFORE-IMAGE. NULL on a firm that has never had a row: "no cap was stored" is a
  -- different fact from "the cap was zero", and the receipt says which.
  select * into v_old from clara.firm_document_limits where firm_id = c.firm for update;

  -- THE WRITE RIDES 0196's COLUMN-PRESERVING TRIGGER: a NULL argument is "leave this cap alone",
  -- and on a first insert the trigger supplies the relation's own first-insert values.
  insert into clara.firm_document_limits(firm_id, docs_per_day, pages_per_day, ocr_concurrency,
      llm_witness_concurrency, updated_by)
    values (c.firm, p_docs_per_day, p_pages_per_day, p_ocr_concurrency,
      p_llm_witness_concurrency, c.actor);
  select * into v_new from clara.firm_document_limits where firm_id = c.firm;

  -- WHAT ACTUALLY MOVED, decided by comparing the two images rather than by trusting the
  -- ARGUMENTS: a caller that names a cap at the value it already holds changed nothing, and
  -- saying otherwise would misstate the evidence.
  if v_new.docs_per_day is distinct from v_old.docs_per_day then
    v_changed := v_changed || 'docs_per_day'::text; end if;
  if v_new.pages_per_day is distinct from v_old.pages_per_day then
    v_changed := v_changed || 'pages_per_day'::text; end if;
  if v_new.ocr_concurrency is distinct from v_old.ocr_concurrency then
    v_changed := v_changed || 'ocr_concurrency'::text; end if;
  if v_new.llm_witness_concurrency is distinct from v_old.llm_witness_concurrency then
    v_changed := v_changed || 'llm_witness_concurrency'::text; end if;
  v_previous := jsonb_build_object(
    'docs_per_day', v_old.docs_per_day, 'pages_per_day', v_old.pages_per_day,
    'ocr_concurrency', v_old.ocr_concurrency,
    'llm_witness_concurrency', v_old.llm_witness_concurrency);

  -- BOTH SIDES OF EVERY CAP THAT MOVED, built from the two images the same way the list above
  -- is. A cap that did not move is ABSENT rather than present with old = new: an audit row that
  -- listed every cap on every call would make "what did this person actually change" a thing a
  -- reader has to work out, and this row is billing evidence.
  foreach v_cap in array v_changed loop
    v_changes := v_changes || jsonb_build_object(v_cap, jsonb_build_object(
      'old', v_previous -> v_cap,
      'new', to_jsonb(v_new) -> v_cap));
  end loop;

  perform clara._audit(c.firm, c.actor, null, null, 'set_firm_document_limits', null,
    jsonb_build_object('firm_id', c.firm, 'op_key', p_op_key,
      'changes', v_changes,
      'previous', v_previous,
      'caps', jsonb_build_object(
        'docs_per_day', v_new.docs_per_day, 'pages_per_day', v_new.pages_per_day,
        'ocr_concurrency', v_new.ocr_concurrency,
        'llm_witness_concurrency', v_new.llm_witness_concurrency)));

  return clara._finish_op(c.firm, 'set_firm_document_limits', p_op_key, jsonb_build_object(
    'status', 'set',
    'firm_id', c.firm,
    'caps', jsonb_build_object(
      'docs_per_day', v_new.docs_per_day, 'pages_per_day', v_new.pages_per_day,
      'ocr_concurrency', v_new.ocr_concurrency,
      'llm_witness_concurrency', v_new.llm_witness_concurrency),
    'previous', v_previous,
    'changed', to_jsonb(v_changed),
    'created', v_old.firm_id is null,
    'updated_at', v_new.updated_at));
end $$;

reset role;

-- =================================================================================================
-- §C -- THE GRANT. `create function` grants EXECUTE to PUBLIC by default, so both routines are
-- revoked from PUBLIC first; the door is then granted to `clara_authenticated` alone, which is
-- the coarse human-lane grant every governed verb carries. The ROLE FLOOR IS IN THE BODY, never
-- here: a bookkeeper must reach this door and receive the database's own CLR04, so that no
-- surface has to pre-hide a control on a client-side rank guess.
-- =================================================================================================
revoke all on function clara._firm_document_limit_ceiling(text) from public;
revoke all on function clara.set_firm_document_limits(int,int,int,int,text) from public;
grant execute on function clara.set_firm_document_limits(int,int,int,int,text) to clara_authenticated;

-- =================================================================================================
-- §D -- TAIL CENSUS. Re-reads the live catalog and raises on any finding, rather than trusting
-- §A/§B/§C ran as written.
-- =================================================================================================
do $w960_tail$
declare
  v_posture text; v_src text; v_cols text; v_grants text; v_cons text; v_trigs text; v_sha text;
  v_n int; r text; v_i int;
  v_pins text[][] := array[
    ['clara._tf_firm_document_limits_upsert()',
     'e07fabd4e475ae29ac8b5fa6a4f8477f72698df26110bfe8d4f3e456aa1f8eb2'],
    ['clara._reserve_document_ingest(uuid,uuid,integer,timestamp with time zone)',
     '074c9b180729e3f2d8af8d9fecb38be158db9e2a74e4292b11ff7533a1ed9734'],
    ['clara._reserve_processing_call(uuid,integer)',
     'a713fa374a9069e08862a5a234ad0df6f5303a4223de3bdaaeafc99ae4358043'],
    ['clara._resize_document_reservation(uuid,uuid,integer)',
     '41528b318065207775e48c4ac3f196f07d6cdf0511d108affc72b86c07114dbf'],
    ['clara._settle_document_reservation(uuid,uuid,integer)',
     'b72d83e70645d7bbce44a491002981576059e9d0db41a95ee07e6b87930ddee6'],
    ['clara._settle_processing_call(uuid,integer)',
     'e8b50f0d10da45be4caf6e278248750a4b1e862148dc879fbe38e7a5b4a02408'],
    ['clara.claim_document_processing_task(uuid,text,boolean)',
     '01e517bf575806a01f93441bbc2459856e1f4f12624b312c3ba670ebf111b9a0'],
    ['clara.settle_ingest_reservation(uuid,integer,text)',
     'a7b8d4eeed2c17bfaf252fe73e2185c78255ce4d1e10fac2b933619ff50a9aab'],
    ['clara.get_firm_commercial_state()',
     '347141ee22b52c125ff845451051f03354f1f0e9d57cc43d759253f3273ed19e']
  ];
begin
  -- (T.1) BOTH NEW ROUTINES RESOLVE, at the exact signatures the grant and every caller name.
  if to_regprocedure('clara._firm_document_limit_ceiling(text)') is null then
    raise exception '#960 tail: clara._firm_document_limit_ceiling(text) does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.set_firm_document_limits(int,int,int,int,text)') is null then
    raise exception '#960 tail: clara.set_firm_document_limits does not resolve at its five-argument signature' using errcode='CLR10';
  end if;

  -- (T.2) THE CEILING ANSWERS THE FOUR CAPS AND NOTHING ELSE. An unknown cap reads NULL, which
  -- is what makes §B's `v_asked > ceiling` comparison fail CLOSED on a cap name nobody taught
  -- it: NULL > anything is NULL, the IF does not fire, and a future fifth column would fall
  -- through this door unbounded -- so the four names are asserted here, one by one.
  if clara._firm_document_limit_ceiling('docs_per_day') is distinct from 10000
     or clara._firm_document_limit_ceiling('pages_per_day') is distinct from 100000
     or clara._firm_document_limit_ceiling('ocr_concurrency') is distinct from 16
     or clara._firm_document_limit_ceiling('llm_witness_concurrency') is distinct from 16 then
    raise exception '#960 tail: the estate ceiling does not answer the four caps as §A writes them' using errcode='CLR10';
  end if;
  if clara._firm_document_limit_ceiling('max_concurrent_runs') is not null then
    raise exception '#960 tail: the estate ceiling answers a cap this door does not set' using errcode='CLR10';
  end if;

  -- (T.3) THE DOOR'S POSTURE AND ACL. SECURITY DEFINER, owner clara_fn_owner, pinned
  -- search_path, EXECUTE to clara_authenticated and to NOBODY else -- and, crucially, no
  -- PUBLIC entry: `create function` grants EXECUTE to PUBLIC by default, and §C revokes it.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.set_firm_document_limits(int,int,int,int,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#960 tail: the door''s posture or ACL is not what §B/§C wrote -- got {%}', v_posture using errcode='CLR10';
  end if;

  -- (T.4) THE CEILING IS GRANTED TO NOBODY. This is what "no firm can raise it" means
  -- structurally; it is not SECURITY DEFINER either, because it is only ever read from inside
  -- one (0234's clara._legal_enforcement_mode carries the same disposition).
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara._firm_document_limit_ceiling(text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner' then
    raise exception '#960 tail: the estate ceiling is reachable by somebody -- got {%}', v_posture using errcode='CLR10';
  end if;

  -- (T.5) THE DOOR IS A GOVERNED WRITE OF THE HOUSE SHAPE: the admin floor, the op reservation,
  -- the audit row and the receipt are all present, as independent tokens.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.set_firm_document_limits(int,int,int,int,text)'::regprocedure;
  foreach r in array array['clara._human_ctx(clara.role_rank(''admin''))', 'clara._reserve_op(',
      'clara._finish_op(', 'clara._audit(', 'clara._firm_document_limit_ceiling('] loop
    if position(r in v_src) = 0 then
      raise exception '#960 tail: the door is missing "%"', r using errcode='CLR10';
    end if;
  end loop;
  -- ...and it takes NO firm argument, so cross-firm reach is structurally impossible rather
  -- than body-checked (see the header).
  if position('p_firm' in v_src) <> 0 then
    raise exception '#960 tail: the door names a firm argument -- the caller''s own firm is not a thing the caller says' using errcode='CLR10';
  end if;
  -- ...and every refusal it raises carries a detail.reason a surface can branch on. Six raises,
  -- six details (the seventh refusal, CLR04 "insufficient role", is _human_ctx's own and
  -- deliberately carries none -- the code alone is the discriminant).
  v_n := (length(v_src) - length(replace(v_src, 'raise exception', ''))) / length('raise exception');
  if v_n <> 6 then
    raise exception '#960 tail: the door raises % times; every one must carry a detail.reason, so re-read §B before changing this count', v_n using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, '"reason"', ''))) / length('"reason"');
  if v_n <> 6 then
    raise exception '#960 tail: % of the door''s raises carry a detail.reason (want 6)', v_n using errcode='CLR10';
  end if;

  -- (T.6) NOTHING THIS FILE MUST NOT TOUCH MOVED. The same nine pins the prestate measured,
  -- re-read after §A/§B/§C applied.
  for v_i in 1 .. array_length(v_pins, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#960 tail: % MOVED while this file applied -- it must not have (got %)',
        v_pins[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- (T.7) THE RELATION ITSELF IS UNMOVED: seven columns, seven constraints, four triggers, the
  -- same application-role grant matrix in BOTH directions, and FORCE RLS still standing.
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema='clara' and table_name='firm_document_limits';
  if v_cols is distinct from 'firm_id,docs_per_day,pages_per_day,ocr_concurrency,updated_at,updated_by,llm_witness_concurrency' then
    raise exception '#960 tail: the relation''s column census moved -- got %', v_cols using errcode='CLR10';
  end if;
  select string_agg(conname||'='||pg_get_constraintdef(oid), ' | ' order by conname) into v_cons
    from pg_constraint where conrelid='clara.firm_document_limits'::regclass;
  if encode(sha256(convert_to(v_cons,'UTF8')),'hex')
     is distinct from '46f4fb30d8e3d03cfe8d78d3b32aefb5afaadea73c4da3571aac15f9f420c6d4' then
    raise exception '#960 tail: the relation''s constraint set moved -- got %', v_cons using errcode='CLR10';
  end if;
  select string_agg(tgname, ',' order by tgname) into v_trigs
    from pg_trigger where tgrelid='clara.firm_document_limits'::regclass and not tgisinternal;
  if v_trigs is distinct from 't_firm_document_limits_firm_immutable,t_firm_document_limits_no_truncate,t_firm_document_limits_stamp,t_firm_document_limits_upsert' then
    raise exception '#960 tail: the relation''s trigger set moved -- got %', v_trigs using errcode='CLR10';
  end if;
  select coalesce(string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type), '') into v_grants
    from information_schema.role_table_grants
   where table_schema='clara' and table_name='firm_document_limits'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_grants is distinct from 'clara_authenticated:SELECT' then
    raise exception '#960 tail: the relation''s application-role grant matrix moved -- got %', v_grants using errcode='CLR10';
  end if;
  if not (select relrowsecurity and relforcerowsecurity
            from pg_class where oid='clara.firm_document_limits'::regclass) then
    raise exception '#960 tail: clara.firm_document_limits lost FORCE RLS' using errcode='CLR10';
  end if;

  raise notice '#960 tail: OK -- clara.set_firm_document_limits is a SECURITY DEFINER door owned by clara_fn_owner, granted to clara_authenticated alone with no PUBLIC entry, floored at the firm''s own admin rank, carrying no firm argument, reserving and finishing an op receipt, writing a clara._audit row and consulting clara._firm_document_limit_ceiling (10000/100000/16/16, granted to nobody, NULL for any other cap); all six of its refusals carry a detail.reason; the nine bodies it must not touch -- the upsert trigger, the six reservation/claim doors that enforce a cap, and clara.get_firm_commercial_state -- are byte-identical to their pins; and the relation''s columns, constraints, triggers, FORCE RLS and application-role grant matrix are unmoved in both directions.';
end
$w960_tail$;
