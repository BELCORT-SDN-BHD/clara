-- 0334_accrual_list_side_filter — #1075 (riders sweep wave, lane 01): THE ACCRUAL REGISTER'S SIDE
-- FILTER MOVES SERVER-SIDE, AHEAD OF PAGINATION.
-- =====================================================================================
-- Spec of record: issue #1075's Agent Brief (the issue body; zero comments, re-verified live on
-- this branch before this file was written), inside the sweep wave's plan of record
-- `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` (L1's lane table: "#1075, #1070 and #1071
-- are the accrual surface above" the plan-machinery tickets; "#1075 changes
-- clara.list_accrual_adjustments's signature, so it is a migration"). Domain words: CONTEXT.md —
-- "Accrual side" (unchanged by this file; it names which two account types one accrual's legs may
-- carry, not this door's filter).
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.list_accrual_adjustments` gains a fourth
-- parameter, `p_side text default null`, applied INSIDE the relation's own `where` (ahead of the
-- `jsonb_agg`), so a side filter narrows what the DATABASE reads rather than a fully-read page the
-- browser then discards half of.
--
-- =====================================================================================
-- THE GAP THIS CLOSES, IN THE TICKET'S OWN WORDS. `clara.list_accrual_adjustments` (0222, side
-- projected by #942/0304) takes a client and a date window and answers EVERY accrual of that
-- client inside it; `apps/web/components/accruals/accruals-list.tsx`'s own side control narrows
-- that fully-read array in the browser (`rows = side === "" ? all : all.filter(...)`), which its
-- own comment already calls out by name: "a VIEW of what was already read, not a second round
-- trip... can never disagree with the count beside it" -- true only because every row is already
-- in hand. The register does not paginate today (measured: `loadAccruals` calls the door with no
-- limit and `useAsyncRead` renders the whole answer), so the gap is latent rather than live; the
-- ticket's own out-of-scope line says so ("this ticket only prepares the read for [pagination]")
-- and this file does exactly that preparation and no more.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO -- the ticket's own out-of-scope line, made structural.
-- It does not build pagination. It does not change `apps/web/components/accruals/accruals-list.tsx`
-- or `apps/web/lib/accruals/api.ts`'s `loadAccruals`: the ticket's own second acceptance criterion
-- names the register's control adopting the server-side parameter as something that happens "once
-- pagination exists", and pagination does not exist on this branch -- rewiring the control now
-- would trade an instant client-side filter for a network round trip the register's own comment
-- calls out as unnecessary while every row is already in hand, which is not what either acceptance
-- criterion asks for. The door capability lands now; the caller lands with pagination, as a
-- follow-up (recorded in this file's own migration report).
--
-- =====================================================================================
-- WHY A DROP AND A CREATE, NOT A `create or replace` — THE 0202/#770 PRECEDENT (restated #905/0267
-- for the same reason).
--
-- `create or replace function` cannot ADD a parameter: PostgreSQL identifies a function by
-- (schema, name, ARGUMENT TYPES), and a longer type list is a DIFFERENT overload, left resolvable
-- BESIDE the three-argument body rather than replacing it. An overload that still resolves is an
-- overload a later caller can reach, and PostgREST would be left two candidates for one name -- so
-- the three-argument signature is DROPPED and the four-argument one is (re-)created, in the SAME
-- transaction the runner already gives this file.
--
-- Nothing in the estate depends on the dropped signature (no view, no default, no index
-- expression, no trigger, and nothing in `clara`'s own prosrc mentions
-- `list_accrual_adjustments` — measured, not assumed: §0.3 below reads both). No sibling projection
-- door reads this one BY ID the way `clara.get_accrual_adjustment` does not read this one either;
-- there is nothing here for a drop to strand.
--
-- AND A DROP TAKES FOUR THINGS WITH IT THAT A REPLACE WOULD HAVE KEPT: owner, the SECURITY
-- DEFINER + STABLE + pinned search_path posture, the literal ACL, and (had one existed) a comment
-- — this door carried none before this file (measured: `obj_description` is null on the live
-- three-argument body), so this file MINTS the first one rather than re-issuing a lost one. §T
-- re-reads every one of the first three from the catalog, and the comment's presence, rather than
-- assuming a statement above did what it says.
--
-- WRITTEN SO A REDO (#957) OVER ITS OWN OLD EFFECTS IS SAFE — packages/db/README.md's own
-- instruction for a redo target. §W below is `drop function if exists <three-arg>` (a no-op once
-- this file has already run once) followed by `create or replace function <four-arg>` (already
-- idempotent), so re-running this exact file after a fix-round edit, under
-- `CLARA_MIGRATION_REDO=0334_accrual_list_side_filter`, converges on the same committed state
-- whether the three-argument door or this file's own four-argument one is what is currently live.
-- §0's prestate below recognises BOTH starting shapes, the same two-branch shape 0267's own §0
-- uses for the same reason.
--
-- WHAT DOES NOT CHANGE: p_client, p_from, p_to and their meaning; the client-scope check; the
-- projection (every field #942/0304 already answers, byte-for-byte); the (effective_from desc,
-- created_at desc) order; `clara.get_accrual_adjustment` (untouched, not sha-pinned here because
-- nothing in this file reaches it — §0.4 measures that rather than assuming it); the accrual's own
-- `side` column and `clara._accrual_sides()`, both #942/0304's, consumed here and not redefined.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: THE SAME ONE AS BEFORE, PLUS
-- ONE.
--
-- clara.list_accrual_adjustments                                   (human read door)
--   CLR04 'no authenticated actor' / 'actor has no active membership' / 'insufficient role'
--         (via clara._human_ctx — unchanged, still reached first)
--   CLR11 detail.reason='client_not_found'  — p_client names no client of the caller's firm
--         (unchanged, still the first thing checked)
--   CLR10 detail.reason='accrual_side_filter_unsupported'  — p_side is present and is not a
--         member of clara._accrual_sides(); the SAME closed-set judgement
--         `clara._assert_accrual_particulars` already applies to the CONFIGURED side (0304:434),
--         answered the same way: named by field, and the door's own `supported` roster rather
--         than a caller having to know it by heart.
-- An OMITTED p_side raises nothing new and changes no row: `p_side is null` short-circuits both
-- the refusal and the predicate, reproducing the three-argument door exactly.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
--
-- TWO STARTING SHAPES ARE BOTH VALID, for redo-safety (see header): the ordinary three-argument
-- door (first apply), or this file's OWN four-argument door already carrying its `p_side` marker
-- (a redo of this exact file, #957). Anything else is refused rather than guessed at.
-- =====================================================================================
do $w1075_pre$
declare
  n text; v_src text; v_n int; v_posture text;
  v_old boolean; v_new boolean;
begin
  -- 0.1 · the prerequisites the recut body calls, in exact regprocedure form. MEASURED on THIS
  -- lane database (clara_l04, 313 files, max 0333_plan_occurrence_reversal_door) immediately
  -- before this file was written — never copied from an older migration's header.
  foreach n in array array[
    'clara._human_ctx(integer)', 'clara.role_rank(text)', 'clara._accrual_sides()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#1075 prestate: prerequisite absent: % (migrations 0011/0193/0304 have not all been applied)', n
        using errcode='CLR10';
    end if;
  end loop;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara._human_ctx(integer)'::regprocedure), 'UTF8')), 'hex')
     is distinct from 'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46' then
    raise exception '#1075 prestate: clara._human_ctx(integer) has DRIFTED from its measured image -- this door delegates to it and must not do so blind'
      using errcode='CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara.role_rank(text)'::regprocedure), 'UTF8')), 'hex')
     is distinct from '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f' then
    raise exception '#1075 prestate: clara.role_rank(text) has DRIFTED from its measured image' using errcode='CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara._accrual_sides()'::regprocedure), 'UTF8')), 'hex')
     is distinct from '8db11e9cdca5398b85aac24e6ea3ce1a3790149892d911f7008ccbfe0a9d9bab' then
    raise exception '#1075 prestate: clara._accrual_sides() has DRIFTED from its measured image -- this file''s side filter judges against it and must not do so blind'
      using errcode='CLR10';
  end if;

  -- 0.2 · the relations the recut body reads. All five pre-exist this file by several migrations;
  -- listed so a partial chain fails here, by name, rather than inside the DROP/CREATE below.
  foreach n in array array[
    'clara.accrual_adjustments', 'clara.accounting_plans', 'clara.accounting_plan_occurrences',
    'clara.operation_receipts', 'clara.clients'
  ] loop
    if to_regclass(n) is null then
      raise exception '#1075 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.3 · WHICH OF THE TWO VALID STARTING SHAPES IS LIVE.
  v_old := to_regprocedure('clara.list_accrual_adjustments(uuid,date,date)') is not null;
  v_new := to_regprocedure('clara.list_accrual_adjustments(uuid,date,date,text)') is not null;

  if v_old and v_new then
    raise exception '#1075 prestate: BOTH the three-argument and the four-argument clara.list_accrual_adjustments resolve -- a broken partial state; refusing rather than guessing which is the live door'
      using errcode='CLR10';
  end if;
  if not v_old and not v_new then
    raise exception '#1075 prestate: neither clara.list_accrual_adjustments signature resolves (migration 0222 has not been applied)'
      using errcode='CLR10';
  end if;

  if v_old then
    -- ---------------------------------------------------------------------------------------
    -- FIRST APPLY. Pin the live (#942/0304) body byte-for-byte, MEASURED on this lane database
    -- now — the same discipline 0202/0267 apply to their own dropped signature's pre-image.
    -- ---------------------------------------------------------------------------------------
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname='list_accrual_adjustments';
    if v_n <> 1 then
      raise exception '#1075 prestate: clara.list_accrual_adjustments has % bodies (expected exactly 1) -- an overload is already installed', v_n
        using errcode='CLR10';
    end if;

    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
     where p.oid = 'clara.list_accrual_adjustments(uuid,date,date)'::regprocedure;
    if v_src is distinct from 'c4924f1dbbd6b3ae0dd073ceed5f9b19016cc842a796d4256bd5f909f58c22df' then
      raise exception '#1075 prestate: clara.list_accrual_adjustments has DRIFTED from the pinned #942/0304 body (sha %) -- re-derive section W against the live body before applying', v_src
        using errcode='CLR10';
    end if;

    -- …NOTHING DEPENDS ON THE SIGNATURE ABOUT TO BE DROPPED, and nothing else in `clara` calls it
    -- by name (measured over pg_proc.prosrc, not assumed) — belt-and-braces, since `drop
    -- function` without CASCADE already refuses on a real dependency, but this way the refusal
    -- arrives as this file's own sentence rather than a raw 2BP01.
    select count(*)::int into v_n from pg_depend d
     where d.refobjid = 'clara.list_accrual_adjustments(uuid,date,date)'::regprocedure
       and d.refclassid = 'pg_proc'::regclass
       and d.deptype <> 'i'
       and d.classid <> 'pg_namespace'::regclass
       and not (d.classid = 'pg_proc'::regclass and d.objid = d.refobjid);
    if v_n > 0 then
      raise exception '#1075 prestate: % catalog object(s) depend on clara.list_accrual_adjustments''s three-argument signature -- the drop below would refuse', v_n
        using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'clara' and p.proname <> 'list_accrual_adjustments'
       and p.prosrc like '%list_accrual_adjustments%';
    if v_n > 0 then
      raise exception '#1075 prestate: % other clara body mentions list_accrual_adjustments by name -- this file assumed it is a leaf nothing else calls', v_n
        using errcode='CLR10';
    end if;

    -- …and the posture the drop is about to destroy, measured so §T's re-read is a COMPARISON
    -- and not a hopeful assertion. No comment existed on this door before this file (obj_
    -- description is null) — measured, not assumed, so §T requires one to have ARRIVED rather
    -- than merely survived.
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
           || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
           || ' | ' || coalesce(array_to_string(p.proacl, ','), '<null>')
      into v_posture from pg_proc p
     where p.oid = 'clara.list_accrual_adjustments(uuid,date,date)'::regprocedure;
    if v_posture is distinct from
       'clara_fn_owner | true | s | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
      raise exception '#1075 prestate: clara.list_accrual_adjustments does not carry the posture this file must re-issue after the drop; got {%}', v_posture
        using errcode='CLR10';
    end if;
    if obj_description('clara.list_accrual_adjustments(uuid,date,date)'::regprocedure, 'pg_proc') is not null then
      raise exception '#1075 prestate: clara.list_accrual_adjustments already carries a comment this file did not expect'
        using errcode='CLR10';
    end if;
  else
    -- ---------------------------------------------------------------------------------------
    -- REDO (#957) OF THIS FILE'S OWN EARLIER RUN. The four-argument door already resolves; it
    -- must be recognisably THIS file's own prior output before §W is allowed to `create or
    -- replace` over it, never a foreign four-argument body this file does not recognise.
    -- ---------------------------------------------------------------------------------------
    select p.prosrc into v_src from pg_proc p
     where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text)'::regprocedure;
    if position('p_side' in v_src) = 0 or position('accrual_side_filter_unsupported' in v_src) = 0 then
      raise exception '#1075 prestate: the live four-argument clara.list_accrual_adjustments does not carry this file''s own p_side / accrual_side_filter_unsupported marks -- it is not this file''s prior output, and this file refuses to overwrite a door it does not recognise'
        using errcode='CLR10';
    end if;
  end if;

  -- 0.4 · THE SIBLING DOOR THIS FILE DOES NOT TOUCH, pinned so a reader knows the scope was
  -- checked rather than assumed. Not sha-pinned (nothing in THIS file reaches it, unlike 0267's
  -- own §0.4): the point here is narrower — that it still resolves at its own signature.
  if to_regprocedure('clara.get_accrual_adjustment(uuid)') is null then
    raise exception '#1075 prestate: clara.get_accrual_adjustment(uuid) is absent -- this file does not touch it, but expects it to already exist' using errcode='CLR10';
  end if;

  raise notice '#1075 prestate: clean -- exactly one starting shape of clara.list_accrual_adjustments is live (%), matching what this file expects for it; its three prerequisites (clara._human_ctx, clara.role_rank, clara._accrual_sides) and five relations are present; and clara.get_accrual_adjustment still resolves, untouched.',
    case when v_old then 'three-argument, pre-widen' else 'four-argument, this file''s own prior redo' end;
end
$w1075_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §W THE WIDEN. The pinned live body, byte-for-byte, plus ONE new parameter, ONE new refusal and
-- ONE new predicate. `drop function if exists` on the OLD signature (a no-op on a redo, where it
-- is already gone) followed by `create or replace` on the NEW one (idempotent either way) is what
-- makes this section safe to redo — see the header.
-- =====================================================================================
drop function if exists clara.list_accrual_adjustments(uuid, date, date);

create or replace function clara.list_accrual_adjustments(
  p_client uuid,
  p_from   date,
  p_to     date,
  -- #1075: THE SIDE FILTER, LAST so every existing positional caller keeps its meaning and an
  -- omitted p_side reproduces the three-argument door exactly — same rows, same order, for every
  -- other caller in the estate.
  p_side   text default null
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 -- RE-ISSUED, NOT INHERITED. A DROP took the owner, the SECURITY DEFINER + STABLE posture and
 -- this setting with it; a `create or replace` alone (had one been legal here) would have
 -- preserved them. See this file's header for the full list of four properties a drop destroys.
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_actor uuid; v_firm uuid; v_rows jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = v_firm) then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  -- #1075: THE SIDE FILTER. A closed set, judged the SAME way the particulars' own configured
  -- side already is (0304's clara._assert_accrual_particulars, against the SAME
  -- clara._accrual_sides()): absent means "every side", the door's existing behaviour exactly;
  -- present-and-unsupported is refused BY NAME rather than silently answering an empty page a
  -- caller could mistake for "this client has none of either".
  if p_side is not null and not (p_side = any (clara._accrual_sides())) then
    raise exception 'an accrual side filter names expense or revenue; % is neither', p_side
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_side_filter_unsupported','field','side',
          'side', p_side, 'supported', to_jsonb(clara._accrual_sides()))::text;
  end if;
  select coalesce(jsonb_agg(x order by x ->> 'effective_from' desc, x ->> 'created_at' desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'accrual_id', a.id, 'plan_id', a.plan_id, 'revision', a.revision, 'purpose', a.purpose,
        -- #942: the register's own side, so a filter and a column can name it.
        'side', a.side,
        'expense_account_code', a.expense_account_code,
        'liability_account_code', a.liability_account_code,
        'amount_cents', a.amount_cents, 'currency', a.currency,
        'effective_from', to_char(a.effective_from,'YYYY-MM-DD'),
        'effective_to', case when a.effective_to is null then null else to_char(a.effective_to,'YYYY-MM-DD') end,
        'service_period_start', to_char(a.service_period_start,'YYYY-MM-DD'),
        'service_period_end', to_char(a.service_period_end,'YYYY-MM-DD'),
        'term_source', a.term_source, 'method', a.method,
        'document_service_period_id', a.document_service_period_id,
        'source_document_id', a.source_document_id,
        'plan_status', p.status, 'plan_kind', p.kind,
        'recorded_by', a.recorded_by, 'created_at', a.created_at,
        'occurrence_count', (select count(*)::int from clara.accounting_plan_occurrences o
                              where o.plan_id = a.plan_id),
        -- POSTED means a COMMITTED receipt exists for one of this plan's occurrences. Derived,
        -- never cached: a cached flag can disagree with the ledger it claims to describe.
        'posted', exists (select 1 from clara.accounting_plan_occurrences o
                           join clara.operation_receipts rc on rc.work_id = o.work_id
                                                           and rc.outcome = 'committed'
                          where o.plan_id = a.plan_id and o.leg = 'primary')
      ) as x
        from clara.accrual_adjustments a
        join clara.accounting_plans p on p.id = a.plan_id
       where a.client_id = p_client and a.firm_id = v_firm
         and (p_from is null or a.effective_from >= p_from)
         and (p_to is null or a.effective_from <= p_to)
         -- #1075: SERVER-SIDE, so a future paginated page can never disagree with the count
         -- beside it -- the ticket's own reason for asking.
         and (p_side is null or a.side = p_side)
    ) s;
  return jsonb_build_object('client_id', p_client,
    'from', case when p_from is null then null else to_char(p_from,'YYYY-MM-DD') end,
    'to', case when p_to is null then null else to_char(p_to,'YYYY-MM-DD') end,
    -- #1075: ECHOED, the same way from/to already are -- a caller reads what filter the answer
    -- actually reflects rather than re-stating what it asked for.
    'side', p_side,
    'accruals', v_rows);
end $function$;

-- THE FOUR PROPERTIES A DROP DESTROYS, RE-ISSUED BY HAND (all idempotent, so re-running them on
-- redo is harmless). No comment existed before this file (measured, §0); this one is MINTED.
revoke all on function clara.list_accrual_adjustments(uuid, date, date, text) from public;
grant execute on function clara.list_accrual_adjustments(uuid, date, date, text) to clara_authenticated;

comment on function clara.list_accrual_adjustments(uuid, date, date, text) is
  '#652 (0222), side column #942 (0304), widened #1075 (0334). Every accrual of one client, '
  'windowed on effective_from and — since #1075 — filterable by side. SECURITY DEFINER, STABLE, '
  'owner clara_fn_owner, EXECUTE to clara_authenticated only (PUBLIC revoked); refuses CLR04 below '
  'viewer (clara._human_ctx) and CLR11 client_not_found before reading. p_side is the closed set '
  'clara._accrual_sides() answers ({expense, revenue}); an unsupported non-null value refuses '
  'CLR10 accrual_side_filter_unsupported, the same judgement clara._assert_accrual_particulars '
  'already applies to a CONFIGURED side; a null value (the omitted-parameter default) is every '
  'side, reproducing the three-argument door exactly. THE THREE-ARGUMENT SIGNATURE IS GONE: a new '
  'parameter cannot be added by `create or replace`, and an overload that still resolved would '
  'leave PostgREST two candidates for one name. Answered SERVER-SIDE so a future paginated page '
  'can never disagree with the filtered count beside it (the ticket''s own reason for asking); '
  'apps/web''s register still filters client-side today because it does not yet paginate — wiring '
  'the control to this parameter is a follow-up, not this file''s own scope. '
  'clara.get_accrual_adjustment is UNCHANGED by this file.';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. This file's whole hazard
-- is a property silently lost in a DROP, so every one is read back from the catalog rather than
-- assumed from the statements above — and this check is path-independent: whichever of §0's two
-- starting shapes was live, the committed state after §W must look identical.
-- =====================================================================================
do $w1075_tail$
declare v_src text; v_n int; v_posture text; v_cmt text;
begin
  -- 1 · EXACTLY ONE BODY OF THIS NAME, and it is the four-argument one. The three-argument
  -- signature must not survive as a resolvable overload.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_accrual_adjustments';
  if v_n <> 1 then
    raise exception '#1075 tail: clara.list_accrual_adjustments now has % bodies (expected exactly 1) -- the recut created an overload instead of retiring the old signature', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_accrual_adjustments(uuid,date,date)') is not null then
    raise exception '#1075 tail: the THREE-argument clara.list_accrual_adjustments still resolves -- an overload that still resolves is an overload a later caller can reach, and PostgREST would have two candidates'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_accrual_adjustments(uuid,date,date,text)') is null then
    raise exception '#1075 tail: clara.list_accrual_adjustments(uuid,date,date,text) does not resolve' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text)'::regprocedure;

  -- 2 · THE REFUSAL AND THE PREDICATE ARE BOTH THERE, and p_side is mentioned exactly the shape
  -- this file specifies: TWICE in the refusal guard's own condition (p_side is not null and not
  -- (p_side = any (...))), TWICE more raising it (the raise substitution plus the echoed 'side',
  -- p_side inside the refusal's own detail), TWICE in the predicate line (p_side is null or
  -- a.side = p_side) and ONCE in the echoed envelope — seven in all, and nowhere else in the
  -- committed text.
  if position('if p_side is not null and not (p_side = any (clara._accrual_sides()))' in v_src) = 0 then
    raise exception '#1075 tail: the committed body is missing the side-filter refusal guard' using errcode='CLR10';
  end if;
  if position('''reason'',''accrual_side_filter_unsupported''' in v_src) = 0 then
    raise exception '#1075 tail: the committed body does not raise accrual_side_filter_unsupported by name' using errcode='CLR10';
  end if;
  if position('and (p_side is null or a.side = p_side)' in v_src) = 0 then
    raise exception '#1075 tail: the committed body is missing the server-side p_side predicate' using errcode='CLR10';
  end if;
  if position('''side'', p_side,' in v_src) = 0 then
    raise exception '#1075 tail: the committed body does not echo p_side in the returned envelope' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'p_side', ''))) / length('p_side');
  if v_n <> 7 then
    raise exception '#1075 tail: the committed body mentions p_side % time(s) (expected exactly 7: twice in the refusal guard, twice raising it, twice in the predicate, once in the echoed envelope)', v_n
      using errcode='CLR10';
  end if;

  -- 3 · EVERY EXISTING ARM SURVIVED, byte-for-byte, against the committed text — this is a
  -- filter widen, not a projection widen or a re-derivation.
  if position('client not found in your firm' in v_src) = 0 then
    raise exception '#1075 tail: the client-scope refusal is missing' using errcode='CLR10';
  end if;
  if position('''accrual_id'', a.id, ''plan_id'', a.plan_id, ''revision'', a.revision, ''purpose'', a.purpose,' in v_src) = 0 then
    raise exception '#1075 tail: the projection''s first fields moved -- this file must not have touched the SELECT list' using errcode='CLR10';
  end if;
  if position('''posted'', exists (select 1 from clara.accounting_plan_occurrences o' in v_src) = 0 then
    raise exception '#1075 tail: the derived posted flag is missing -- this file must not have touched the SELECT list' using errcode='CLR10';
  end if;
  if position('order by x ->> ''effective_from'' desc, x ->> ''created_at'' desc' in v_src) = 0 then
    raise exception '#1075 tail: the (effective_from desc, created_at desc) order is missing' using errcode='CLR10';
  end if;
  if position('and (p_from is null or a.effective_from >= p_from)' in v_src) = 0
     or position('and (p_to is null or a.effective_from <= p_to)' in v_src) = 0 then
    raise exception '#1075 tail: the existing date-window predicates are missing' using errcode='CLR10';
  end if;
  if position('''from'', case when p_from is null then null else to_char(p_from,''YYYY-MM-DD'') end,' in v_src) = 0
     or position('''to'', case when p_to is null then null else to_char(p_to,''YYYY-MM-DD'') end,' in v_src) = 0 then
    raise exception '#1075 tail: the echoed from/to envelope fields are missing' using errcode='CLR10';
  end if;

  -- 4 · THE FOUR PROPERTIES A DROP DESTROYS, re-read from the catalog in one comparison: owner,
  -- SECURITY DEFINER (true), STABLE ('s'), the pinned search_path, and the EXACT ACL with its
  -- grantor.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
         || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
         || ' | ' || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | s | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#1075 tail: the widened door has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, STABLE, search_path=clara, pg_temp, and EXECUTE to clara_authenticated only (PUBLIC revoked); got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 5 · THE COMMENT, MINTED (none existed before this file — §0 measured that).
  select obj_description(p.oid, 'pg_proc') into v_cmt from pg_proc p
   where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text)'::regprocedure;
  if v_cmt is null or position('#1075' in v_cmt) = 0 or position('p_side' in v_cmt) = 0 then
    raise exception '#1075 tail: the widened door carries no comment naming p_side' using errcode='CLR10';
  end if;

  -- 6 · THE SIBLING DOOR IS UNTOUCHED — still resolves at its own signature. Not sha-pinned
  -- (§0.4's own note: this file never reaches it), so the check here is that it survived, not
  -- that it is byte-identical to an image this file has no reason to hold.
  if to_regprocedure('clara.get_accrual_adjustment(uuid)') is null then
    raise exception '#1075 tail: clara.get_accrual_adjustment(uuid) no longer resolves -- this file must not have touched it' using errcode='CLR10';
  end if;

  raise notice '#1075 tail: OK -- clara.list_accrual_adjustments exists EXACTLY ONCE, at (uuid,date,date,text); the three-argument signature is GONE rather than left as a resolvable overload; the widened door refuses CLR10 accrual_side_filter_unsupported for a non-null p_side outside clara._accrual_sides(), filters SERVER-SIDE on a(.side = p_side) when p_side is given, and echoes side in the returned envelope alongside from/to; every existing arm (the client-scope refusal, the full projection, the (effective_from desc, created_at desc) order, both date-window predicates, the echoed from/to fields) survives byte-for-byte; the door is owned by clara_fn_owner, SECURITY DEFINER, STABLE, pins search_path=clara, pg_temp, is PUBLIC-revoked and EXECUTE-reachable by clara_authenticated and nobody else, and now carries a comment naming p_side; and clara.get_accrual_adjustment still resolves, untouched.';
end
$w1075_tail$;
