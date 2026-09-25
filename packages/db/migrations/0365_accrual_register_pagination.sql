-- 0365_accrual_register_pagination — #1152 (riders closing wave, lane 03): THE ACCRUAL REGISTER
-- READS A PAGE AT A TIME, AND THE SIDE FILTER REACHES THE DOOR.
-- =====================================================================================
-- Spec of record: issue #1152's Agent Brief (the issue body; zero comments, re-verified live on
-- this branch before this file was written — `gh issue view 1152 --comments`), candidate E28 of
-- `docs/plan/active/riders-2026-09-20/reports/waveS-followup-candidates.md`, discharging the
-- follow-up `waveS-lane01-fix.md` follow-up 1 / SPEC-03 and `waveS-lane01-recheck.json`
-- RECHECK-03 left on 0334 (#1075): "wiring the control to this [p_side] parameter is a
-- follow-up, not this file's own scope" — 0334's own comment on the live four-argument door,
-- read verbatim below in §0.3.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.list_accrual_adjustments` gains TWO parameters,
-- `p_cursor jsonb default null` and `p_limit integer default null`, so a caller can walk the
-- register a bounded page at a time instead of always reading a client's whole history in one
-- answer; the browser-side loses nothing it did not already own, because AC2 requires the
-- OMITTED-cursor-and-limit call to answer EXACTLY what the four-argument door answers today (see
-- "WHY p_limit DEFAULTS TO NULL, NOT 50" below) — this is a page ADDED beside the existing
-- client/window/side predicates, never a truncation of a caller that has not asked for one.
--
-- =====================================================================================
-- THE GAP THIS CLOSES, IN THE TICKET'S OWN WORDS. `apps/web/lib/accruals/api.ts:249-269`
-- deliberately sent only `{p_client, p_from, p_to}` and its own comment named the debt owed here;
-- `apps/web/components/accruals/accruals-list.tsx:45-46` narrowed the FULLY READ page in the
-- browser (`rows = side === "" ? all : all.filter((r) => r.side === side)`). For a client with
-- hundreds of accrual schedules the whole history crossed the wire on every visit, and the moment
-- a page existed a client-side filter could disagree with a page it had not read. This file gives
-- the door a page and a server-side filter together; the web half (deleting the browser-side
-- narrowing, wiring the control, walking to the next page) is `apps/web`'s own commit beside this
-- one, not a database concern.
--
-- WHY A DROP AND A CREATE, NOT A `create or replace` — THE 0202/#770/0267/#905/0334/#1075
-- PRECEDENT, restated for the same reason every one of those files gives. PostgreSQL identifies a
-- function by (schema, name, ARGUMENT TYPES); two new trailing parameters are a DIFFERENT type
-- list, so `create or replace` would leave the four-argument door resolvable BESIDE a new
-- six-argument one — two candidates for one name, and PostgREST would have to guess. The
-- four-argument signature is DROPPED and the six-argument one is (re-)created, in the SAME
-- transaction the runner already gives this file.
--
-- WHY p_limit DEFAULTS TO NULL, NOT 50 — A DELIBERATE DEPARTURE FROM `clara.list_review_queue`'S
-- OWN IDIOM. `list_review_queue` (0011, recut 0016/.../0352) has been paginated at a 50-row
-- default since its FIRST day: a firm-wide queue was never meant to answer unbounded. This door's
-- own history is the opposite — every caller since 0222 has read one client's WHOLE accrual
-- history in one answer, and AC2 states the contract this file must keep: "An existing caller
-- that sends no cursor and no limit gets exactly the rows and the order it gets today". `LIMIT
-- NULL` is PostgreSQL's own reading of "no limit at all" (identical to omitting the clause), so a
-- caller that sends neither argument reaches EXACTLY the unbounded query 0334 left running — no
-- silent 50-row truncation of a caller that never asked to paginate. A caller that DOES want a
-- page sends `p_limit` explicitly (`apps/web`'s register sends 50, the same page size
-- `list_review_queue`'s own web caller uses), and only then does this file's LIMIT clause bind.
--
-- WHY THE CURSOR IS A THREE-TUPLE, TEXT, OPAQUE — THE SAME `list_review_queue` IDIOM (0011:3748-
-- 3781), narrowed to what THIS register actually orders by. The existing order is
-- `(effective_from desc, created_at desc)`; a third element, the accrual's own `id`, is appended
-- SOLELY so two rows can never compare exactly equal (a keyset walk over a tied pair is otherwise
-- free to place either one on either side of a page boundary, which is what "each row exactly
-- once" in AC1 forbids). The tuple is never inspected by a caller — `apps/web` echoes
-- `next_cursor` back verbatim, exactly as `lib/firm/needs-you.ts`'s own header already documents
-- for the review queue's cursor.
--
-- WHY `to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`, NOT A BARE
-- `a.created_at::text` — a NARROW improvement on the `list_review_queue` precedent's own cast,
-- measured rather than assumed to matter: PostgreSQL's default `timestamptz::text` cast TRIMS
-- trailing zero fraction digits and OMITS the fraction entirely at an exact second (measured on
-- this lane database: `('2026-01-01 10:15:23'::timestamptz)::text` reads
-- `'2026-01-01 10:15:23+08'`, no dot at all). Trailing-zero trimming on a FIXED-WIDTH integer
-- prefix (`HH24:MI:SS` is always two digits per field) still orders correctly under plain text
-- comparison — a shorter, trimmed value is always a true PREFIX of what an untrimmed sibling would
-- have shown, and a prefix always sorts before what it is a prefix of — so this was never a
-- correctness bug. It IS a needless dependency on the connection's `TimeZone` GUC (the trailing
-- offset, e.g. `+08`, rides on the session setting rather than the stored instant), which a
-- fixed-format, explicitly-UTC `to_char` removes outright: the cursor tuple's second element is
-- now the SAME 26-character string for the SAME instant regardless of which `TimeZone` the calling
-- connection happens to carry.
--
-- WHAT DOES NOT CHANGE: p_client, p_from, p_to, p_side and their meaning (0334/#1075, untouched);
-- the client-scope check; the CLR10 `accrual_side_filter_unsupported` refusal; the full
-- projection (every field 0334 already answers, byte-for-byte); the `(effective_from desc,
-- created_at desc)` primary order (the cursor tuple's third element only breaks a tie the old
-- query left undefined — PostgreSQL never guaranteed a stable order for two rows with an
-- identical `effective_from` AND an identical `created_at` down to the microsecond, so no caller
-- can have depended on one); `clara.get_accrual_adjustment` (untouched, not sha-pinned here
-- because nothing in this file reaches it — §0.4 measures that rather than assuming it); the
-- accrual's own `side` column, `clara._accrual_sides()` and `clara._human_ctx`/`clara.role_rank`
-- (all consumed here, none redefined).
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: THE SAME TWO AS 0334, PLUS ONE.
--
-- clara.list_accrual_adjustments                                   (human read door)
--   CLR04 'no authenticated actor' / 'actor has no active membership' / 'insufficient role'
--         (via clara._human_ctx — unchanged, still reached first)
--   CLR11 detail.reason='client_not_found'  — p_client names no client of the caller's firm
--         (unchanged, still the first thing checked)
--   CLR10 detail.reason='accrual_side_filter_unsupported'  — p_side is present and is not a
--         member of clara._accrual_sides() (0334, unchanged)
--   CLR10 detail.reason='accrual_cursor_malformed'  — p_cursor is present and is not a
--         `{"tuple": [text, text, text]}` object whose three elements cast to (date, timestamptz,
--         uuid) — named by field, the same "a caller's typo must not become an invisible reset to
--         page one" reasoning `list_review_queue`'s own cursor guard applies (0011:3771-3781).
-- An OMITTED p_cursor and an OMITTED p_limit raise nothing new and change no row: `v_cursor is
-- null` and `p_limit is null` short-circuit every new predicate and the LIMIT clause, reproducing
-- the four-argument door exactly.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
--
-- TWO STARTING SHAPES ARE BOTH VALID, for redo-safety (see header): the ordinary six-argument…
-- no — the ordinary FOUR-argument door 0334 left live (first apply), or this file's OWN
-- six-argument door already carrying its `p_cursor`/`accrual_cursor_malformed` marks (a redo of
-- this exact file, #957). Anything else is refused rather than guessed at.
-- =====================================================================================
do $w1152_pre$
declare
  n text; v_src text; v_n int; v_posture text; v_cmt text;
  v_old boolean; v_new boolean;
begin
  -- 0.1 · the prerequisites the recut body calls, in exact regprocedure form. MEASURED on THIS
  -- lane database (clara_c03, 337 files, max 0361_reservation_release_advice) immediately before
  -- this file was written — never copied from an older migration's header.
  foreach n in array array[
    'clara._human_ctx(integer)', 'clara.role_rank(text)', 'clara._accrual_sides()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#1152 prestate: prerequisite absent: % (migrations 0011/0193/0304 have not all been applied)', n
        using errcode='CLR10';
    end if;
  end loop;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara._human_ctx(integer)'::regprocedure), 'UTF8')), 'hex')
     is distinct from 'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46' then
    raise exception '#1152 prestate: clara._human_ctx(integer) has DRIFTED from its measured image -- this door delegates to it and must not do so blind'
      using errcode='CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara.role_rank(text)'::regprocedure), 'UTF8')), 'hex')
     is distinct from '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f' then
    raise exception '#1152 prestate: clara.role_rank(text) has DRIFTED from its measured image' using errcode='CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara._accrual_sides()'::regprocedure), 'UTF8')), 'hex')
     is distinct from '8db11e9cdca5398b85aac24e6ea3ce1a3790149892d911f7008ccbfe0a9d9bab' then
    raise exception '#1152 prestate: clara._accrual_sides() has DRIFTED from its measured image -- this file''s cursor predicate composes with its side filter and must not do so blind'
      using errcode='CLR10';
  end if;

  -- 0.2 · the relations the recut body reads. All five pre-exist this file by several migrations;
  -- listed so a partial chain fails here, by name, rather than inside the DROP/CREATE below.
  foreach n in array array[
    'clara.accrual_adjustments', 'clara.accounting_plans', 'clara.accounting_plan_occurrences',
    'clara.operation_receipts', 'clara.clients'
  ] loop
    if to_regclass(n) is null then
      raise exception '#1152 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.3 · WHICH OF THE TWO VALID STARTING SHAPES IS LIVE.
  v_old := to_regprocedure('clara.list_accrual_adjustments(uuid,date,date,text)') is not null;
  v_new := to_regprocedure('clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)') is not null;

  if v_old and v_new then
    raise exception '#1152 prestate: BOTH the four-argument and the six-argument clara.list_accrual_adjustments resolve -- a broken partial state; refusing rather than guessing which is the live door'
      using errcode='CLR10';
  end if;
  if not v_old and not v_new then
    raise exception '#1152 prestate: neither clara.list_accrual_adjustments signature resolves (migration 0334 has not been applied)'
      using errcode='CLR10';
  end if;

  if v_old then
    -- ---------------------------------------------------------------------------------------
    -- FIRST APPLY. Pin the live (#1075/0334) body byte-for-byte, MEASURED on this lane database
    -- now — the same discipline 0202/0267/0334 apply to their own dropped signature's pre-image.
    -- ---------------------------------------------------------------------------------------
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname='list_accrual_adjustments';
    if v_n <> 1 then
      raise exception '#1152 prestate: clara.list_accrual_adjustments has % bodies (expected exactly 1) -- an overload is already installed', v_n
        using errcode='CLR10';
    end if;

    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
     where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text)'::regprocedure;
    if v_src is distinct from '2fbad3aafb4317e82f73b061c07119170d9bbb49812fea14cc90d78d3aec2e47' then
      raise exception '#1152 prestate: clara.list_accrual_adjustments has DRIFTED from the pinned #1075/0334 body (sha %) -- re-derive section W against the live body before applying', v_src
        using errcode='CLR10';
    end if;

    -- …NOTHING DEPENDS ON THE SIGNATURE ABOUT TO BE DROPPED, and nothing else in `clara` calls it
    -- by name (measured over pg_proc.prosrc, not assumed) — belt-and-braces, since `drop
    -- function` without CASCADE already refuses on a real dependency, but this way the refusal
    -- arrives as this file's own sentence rather than a raw 2BP01.
    select count(*)::int into v_n from pg_depend d
     where d.refobjid = 'clara.list_accrual_adjustments(uuid,date,date,text)'::regprocedure
       and d.refclassid = 'pg_proc'::regclass
       and d.deptype <> 'i'
       and d.classid <> 'pg_namespace'::regclass
       and not (d.classid = 'pg_proc'::regclass and d.objid = d.refobjid);
    if v_n > 0 then
      raise exception '#1152 prestate: % catalog object(s) depend on clara.list_accrual_adjustments''s four-argument signature -- the drop below would refuse', v_n
        using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'clara' and p.proname <> 'list_accrual_adjustments'
       and p.prosrc like '%list_accrual_adjustments%';
    if v_n > 0 then
      raise exception '#1152 prestate: % other clara body mentions list_accrual_adjustments by name -- this file assumed it is a leaf nothing else calls', v_n
        using errcode='CLR10';
    end if;

    -- …and the posture the drop is about to destroy, measured so §T's re-read is a COMPARISON
    -- and not a hopeful assertion.
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
           || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
           || ' | ' || coalesce(array_to_string(p.proacl, ','), '<null>')
      into v_posture from pg_proc p
     where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text)'::regprocedure;
    if v_posture is distinct from
       'clara_fn_owner | true | s | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
      raise exception '#1152 prestate: clara.list_accrual_adjustments does not carry the posture this file must re-issue after the drop; got {%}', v_posture
        using errcode='CLR10';
    end if;
    -- A comment already exists (0334 minted the first one) — measured, so §T's re-read compares
    -- against "a comment naming THIS file", not against "no comment existed", 0334's own prestate
    -- shape for its OWN, different starting condition.
    select obj_description('clara.list_accrual_adjustments(uuid,date,date,text)'::regprocedure, 'pg_proc') into v_cmt;
    if v_cmt is null or position('#1075' in v_cmt) = 0 or position('p_side' in v_cmt) = 0 then
      raise exception '#1152 prestate: clara.list_accrual_adjustments does not carry the #1075/0334 comment this file expected to find and replace'
        using errcode='CLR10';
    end if;
  else
    -- ---------------------------------------------------------------------------------------
    -- REDO (#957) OF THIS FILE'S OWN EARLIER RUN. The six-argument door already resolves; it
    -- must be recognisably THIS file's own prior output before §W is allowed to `create or
    -- replace` over it, never a foreign six-argument body this file does not recognise.
    -- ---------------------------------------------------------------------------------------
    select p.prosrc into v_src from pg_proc p
     where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)'::regprocedure;
    if position('p_cursor' in v_src) = 0 or position('accrual_cursor_malformed' in v_src) = 0
       or position('next_cursor' in v_src) = 0 then
      raise exception '#1152 prestate: the live six-argument clara.list_accrual_adjustments does not carry this file''s own p_cursor / accrual_cursor_malformed / next_cursor marks -- it is not this file''s prior output, and this file refuses to overwrite a door it does not recognise'
        using errcode='CLR10';
    end if;
  end if;

  -- 0.4 · THE SIBLING DOOR THIS FILE DOES NOT TOUCH, pinned so a reader knows the scope was
  -- checked rather than assumed. Not sha-pinned (nothing in THIS file reaches it): the point here
  -- is narrower — that it still resolves at its own signature.
  if to_regprocedure('clara.get_accrual_adjustment(uuid)') is null then
    raise exception '#1152 prestate: clara.get_accrual_adjustment(uuid) is absent -- this file does not touch it, but expects it to already exist' using errcode='CLR10';
  end if;

  raise notice '#1152 prestate: clean -- exactly one starting shape of clara.list_accrual_adjustments is live (%), matching what this file expects for it; its three prerequisites (clara._human_ctx, clara.role_rank, clara._accrual_sides) and five relations are present; and clara.get_accrual_adjustment still resolves, untouched.',
    case when v_old then 'four-argument, pre-page (#1075/0334)' else 'six-argument, this file''s own prior redo' end;
end
$w1152_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §W THE WIDEN. The pinned live body's every existing arm, plus a cursor and a limit. `drop
-- function if exists` on the OLD signature (a no-op on a redo, where it is already gone) followed
-- by `create or replace` on the NEW one (idempotent either way) is what makes this section safe
-- to redo — see the header.
-- =====================================================================================
drop function if exists clara.list_accrual_adjustments(uuid, date, date, text);

create or replace function clara.list_accrual_adjustments(
  p_client uuid,
  p_from   date,
  p_to     date,
  p_side   text default null,
  -- #1152: THE PAGE. Both new, both optional, both LAST — every existing positional caller (three
  -- or four arguments) keeps its exact meaning, the same "new parameter goes last" discipline
  -- 0334 states for p_side. See the header's "WHY p_limit DEFAULTS TO NULL" note for why an
  -- omitted pair reproduces the pre-#1152 door exactly rather than silently capping it at some
  -- default page size.
  p_cursor jsonb   default null,
  p_limit  integer default null
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 -- RE-ISSUED, NOT INHERITED. A DROP took the owner, the SECURITY DEFINER + STABLE posture and
 -- this setting with it; a `create or replace` alone (had one been legal here) would have
 -- preserved them. See this file's header for the full list of four properties a drop destroys.
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  v_actor uuid; v_firm uuid; v_rows jsonb; v_next jsonb; v_cursor text[]; v_limit integer;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = v_firm) then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  -- 0334/#1075: THE SIDE FILTER. A closed set, judged the SAME way the particulars' own
  -- configured side already is (0304's clara._assert_accrual_particulars, against the SAME
  -- clara._accrual_sides()): absent means "every side", the door's existing behaviour exactly;
  -- present-and-unsupported is refused BY NAME rather than silently answering an empty page a
  -- caller could mistake for "this client has none of either".
  if p_side is not null and not (p_side = any (clara._accrual_sides())) then
    raise exception 'an accrual side filter names expense or revenue; % is neither', p_side
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_side_filter_unsupported','field','side',
          'side', p_side, 'supported', to_jsonb(clara._accrual_sides()))::text;
  end if;

  -- #1152: THE CURSOR. An opaque three-tuple this door mints in `next_cursor` and never expects a
  -- caller to construct — a malformed one is refused BY NAME (the `list_review_queue` idiom,
  -- 0011:3771-3781) rather than silently treated as "start over at page one", which would hide a
  -- caller's bug behind a register that quietly restarted.
  if p_cursor is not null then
    -- `IS DISTINCT FROM`, NEVER `<>`, on every leg here: `p_cursor -> 'tuple'` is a plain SQL
    -- NULL when the key is simply ABSENT (`{}`), and `jsonb_typeof(null) <> 'array'` is NULL
    -- under three-valued logic -- an `or` chain of NULLs is NULL, not TRUE, so the whole `if`
    -- would silently NOT fire and `{}` would pass as "no cursor" rather than being refused as the
    -- malformed input it is. `IS DISTINCT FROM` never returns NULL, so a missing key refuses by
    -- the SAME arm a wrong-typed one does.
    if jsonb_typeof(p_cursor) is distinct from 'object'
       or jsonb_typeof(p_cursor -> 'tuple') is distinct from 'array'
       or jsonb_array_length(p_cursor -> 'tuple') is distinct from 3 then
      raise exception 'the accrual register cursor is malformed' using errcode='CLR10',
        detail='{"reason":"accrual_cursor_malformed","field":"cursor"}';
    end if;
    select array_agg(value order by ord) into v_cursor
      from jsonb_array_elements_text(p_cursor -> 'tuple') with ordinality x(value, ord);
    -- A JSON `null` ELEMENT IS MALFORMED, AND THE CAST PROBE BELOW CANNOT SEE IT.
    -- `jsonb_array_elements_text` renders a JSON null as a SQL NULL, and `NULL::date`,
    -- `NULL::timestamptz` and `NULL::uuid` every one of them cast WITHOUT raising -- so the probe
    -- below admits `{"tuple":[null,null,null]}` and every partially-nulled sibling. What the
    -- paged query then does with such a tuple is worse than a mere restart: `array[...]::text[] <
    -- array[null,null,null]::text[]` is TRUE, not NULL, under `array_cmp` (a NULL element sorts
    -- GREATER than any text), so an ALL-null tuple re-admits EVERY row -- page one again, byte
    -- for byte -- and a tuple with ONE null element re-admits the boundary row, so the SAME row
    -- comes back on more than one page. Both break this ticket's own "each row exactly once"
    -- (AC1) and both are precisely the "silently treated as start over at page one" this guard's
    -- own comment above refuses BY NAME. Refused here, before the probe, so the probe never has
    -- to reason about NULL at all.
    if v_cursor[1] is null or v_cursor[2] is null or v_cursor[3] is null then
      raise exception 'the accrual register cursor is malformed' using errcode='CLR10',
        detail='{"reason":"accrual_cursor_malformed","field":"cursor"}';
    end if;
    begin
      perform v_cursor[1]::date; perform v_cursor[2]::timestamptz; perform v_cursor[3]::uuid;
    exception when others then
      raise exception 'the accrual register cursor is malformed' using errcode='CLR10',
        detail='{"reason":"accrual_cursor_malformed","field":"cursor"}';
    end;
  end if;

  -- #1152: THE LIMIT. Clamped, never refused (the `list_review_queue` precedent, 0011:3766-3767)
  -- — but ONLY when a caller actually sent one: a NULL p_limit stays NULL, which `limit v_limit`
  -- below reads as PostgreSQL's own "no limit at all", reproducing the pre-#1152 door exactly.
  if p_limit is not null then
    v_limit := least(greatest(p_limit, 1), 500);
  end if;

  with scored as (
    select
      a.id, a.plan_id, a.revision, a.purpose, a.side,
      a.expense_account_code, a.liability_account_code, a.amount_cents, a.currency,
      a.effective_from, a.effective_to, a.service_period_start, a.service_period_end,
      a.term_source, a.method, a.document_service_period_id, a.source_document_id,
      p.status as plan_status, p.kind as plan_kind, a.recorded_by, a.created_at,
      -- #1152: THE SORT TUPLE. (effective_from, created_at, id) — the door's existing order plus
      -- ONE tiebreaker, so no two rows ever compare equal (see the header's own note on why a
      -- tie was already undefined under the pre-#1152 order). `to_char(... at time zone 'UTC',
      -- ...)` rather than a bare `::text` cast: see the header's dedicated note.
      array[
        to_char(a.effective_from, 'YYYY-MM-DD'),
        to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        a.id::text
      ] as sort_tuple
      from clara.accrual_adjustments a
      join clara.accounting_plans p on p.id = a.plan_id
     where a.client_id = p_client and a.firm_id = v_firm
       and (p_from is null or a.effective_from >= p_from)
       and (p_to is null or a.effective_from <= p_to)
       -- 0334/#1075: SERVER-SIDE, so a paginated page can never disagree with the filtered count
       -- beside it -- the ticket's own reason for asking.
       and (p_side is null or a.side = p_side)
  ), page as (
    select
      s.*,
      (select count(*)::int from clara.accounting_plan_occurrences o
        where o.plan_id = s.plan_id) as occurrence_count,
      -- POSTED means a COMMITTED receipt exists for one of this plan's occurrences. Derived,
      -- never cached: a cached flag can disagree with the ledger it claims to describe. Computed
      -- HERE, over the bounded page rather than the whole scored set (§0's own claim: unlike the
      -- pre-#1152 query, a caller that DOES paginate no longer pays for every row's derived
      -- fields, only the page's).
      exists (select 1 from clara.accounting_plan_occurrences o
                         join clara.operation_receipts rc on rc.work_id = o.work_id
                                                         and rc.outcome = 'committed'
                        where o.plan_id = s.plan_id and o.leg = 'primary') as posted
      from scored s
     -- #1152: THE CURSOR PREDICATE. Descending keyset pagination: a row belongs on a LATER page
     -- than the cursor's own row iff its sort tuple compares strictly LESS (array comparison is
     -- lexicographic element-by-element, the same operator `list_review_queue`'s own ascending
     -- walk uses in the opposite direction).
     where v_cursor is null or s.sort_tuple < v_cursor
     order by s.sort_tuple desc
     limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'accrual_id', pg.id, 'plan_id', pg.plan_id, 'revision', pg.revision, 'purpose', pg.purpose,
      'side', pg.side,
      'expense_account_code', pg.expense_account_code,
      'liability_account_code', pg.liability_account_code,
      'amount_cents', pg.amount_cents, 'currency', pg.currency,
      'effective_from', to_char(pg.effective_from,'YYYY-MM-DD'),
      'effective_to', case when pg.effective_to is null then null else to_char(pg.effective_to,'YYYY-MM-DD') end,
      'service_period_start', to_char(pg.service_period_start,'YYYY-MM-DD'),
      'service_period_end', to_char(pg.service_period_end,'YYYY-MM-DD'),
      'term_source', pg.term_source, 'method', pg.method,
      'document_service_period_id', pg.document_service_period_id,
      'source_document_id', pg.source_document_id,
      'plan_status', pg.plan_status, 'plan_kind', pg.plan_kind,
      'recorded_by', pg.recorded_by, 'created_at', pg.created_at,
      'occurrence_count', pg.occurrence_count,
      'posted', pg.posted
    ) order by pg.sort_tuple desc), '[]'::jsonb),
    -- #1152: NEXT_CURSOR is the LAST row of THIS page (the smallest sort tuple among what was
    -- just answered) — null when the page is empty OR when no limit was ever requested (v_limit
    -- is null): an unbounded read already answered EVERYTHING, and a "next" cursor over an answer
    -- that was never paginated would invite a caller to ask for a page that does not exist. When
    -- a limit WAS given, the cursor is NON-NULL even on the true last page — `apps/web`'s own
    -- reader derives "any more?" from the page SIZE, never from next_cursor's presence
    -- (lib/firm/use-review-queue.ts's own header states why) — the `list_review_queue` idiom
    -- (0011:3874-3875) restated in the opposite sort direction.
    (case when v_limit is null then null
      else (select jsonb_build_object('tuple', to_jsonb(q.sort_tuple)) from page q order by q.sort_tuple asc limit 1)
     end)
    into v_rows, v_next
    from page pg;

  return jsonb_build_object('client_id', p_client,
    'from', case when p_from is null then null else to_char(p_from,'YYYY-MM-DD') end,
    'to', case when p_to is null then null else to_char(p_to,'YYYY-MM-DD') end,
    -- 0334/#1075: ECHOED, the same way from/to already are -- a caller reads what filter the
    -- answer actually reflects rather than re-stating what it asked for.
    'side', p_side,
    'accruals', v_rows,
    'next_cursor', v_next);
end $function$;

-- THE FOUR PROPERTIES A DROP DESTROYS, RE-ISSUED BY HAND (all idempotent, so re-running them on
-- redo is harmless).
revoke all on function clara.list_accrual_adjustments(uuid, date, date, text, jsonb, integer) from public;
grant execute on function clara.list_accrual_adjustments(uuid, date, date, text, jsonb, integer) to clara_authenticated;

comment on function clara.list_accrual_adjustments(uuid, date, date, text, jsonb, integer) is
  '#652 (0222), side column #942 (0304), side filter #1075 (0334), paged #1152 (0365). A page of '
  'one client''s accruals, windowed on effective_from, filterable by side, ordered '
  '(effective_from desc, created_at desc, id desc). SECURITY DEFINER, STABLE, owner '
  'clara_fn_owner, EXECUTE to clara_authenticated only (PUBLIC revoked); refuses CLR04 below '
  'viewer (clara._human_ctx) and CLR11 client_not_found before reading. p_side is the closed set '
  'clara._accrual_sides() answers ({expense, revenue}); an unsupported non-null value refuses '
  'CLR10 accrual_side_filter_unsupported. p_cursor is an OPAQUE {"tuple":[text,text,text]} this '
  'door mints in its own next_cursor and a caller echoes back verbatim; a present-and-malformed '
  'one refuses CLR10 accrual_cursor_malformed. p_limit is clamped to [1,500] when present; a NULL '
  'p_cursor AND a NULL p_limit together reproduce the pre-#1152 (0334) door EXACTLY — no default '
  'page size is applied to a caller that never asked to paginate, and next_cursor is null too: an '
  'unbounded read already answered everything, so there is no "next" of it. When p_limit IS '
  'given, next_cursor is the answered page''s own last row, non-null even on the true last page: '
  'a caller derives "any more?" from the page SIZE, not from next_cursor''s presence. THE '
  'FOUR-ARGUMENT SIGNATURE IS GONE: a new '
  'parameter cannot be added by `create or replace`, and an overload that still resolved would '
  'leave PostgREST two candidates for one name. clara.get_accrual_adjustment is UNCHANGED by this '
  'file.';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. This file's whole hazard
-- is a property silently lost in a DROP or a predicate silently dropped in the rewrite, so every
-- one is read back from the catalog rather than assumed from the statements above — and this
-- check is path-independent: whichever of §0's two starting shapes was live, the committed state
-- after §W must look identical.
-- =====================================================================================
do $w1152_tail$
declare v_src text; v_n int; v_posture text; v_cmt text;
begin
  -- 1 · EXACTLY ONE BODY OF THIS NAME, and it is the six-argument one. The four-argument
  -- signature must not survive as a resolvable overload.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_accrual_adjustments';
  if v_n <> 1 then
    raise exception '#1152 tail: clara.list_accrual_adjustments now has % bodies (expected exactly 1) -- the recut created an overload instead of retiring the old signature', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_accrual_adjustments(uuid,date,date,text)') is not null then
    raise exception '#1152 tail: the FOUR-argument clara.list_accrual_adjustments still resolves -- an overload that still resolves is an overload a later caller can reach, and PostgREST would have two candidates'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)') is null then
    raise exception '#1152 tail: clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer) does not resolve' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)'::regprocedure;

  -- 2 · THE SIDE FILTER SURVIVED, byte-for-byte (0334/#1075's own arm; this file must not have
  -- touched it).
  if position('if p_side is not null and not (p_side = any (clara._accrual_sides()))' in v_src) = 0 then
    raise exception '#1152 tail: the committed body is missing the side-filter refusal guard' using errcode='CLR10';
  end if;
  if position('''reason'',''accrual_side_filter_unsupported''' in v_src) = 0 then
    raise exception '#1152 tail: the committed body does not raise accrual_side_filter_unsupported by name' using errcode='CLR10';
  end if;
  if position('and (p_side is null or a.side = p_side)' in v_src) = 0 then
    raise exception '#1152 tail: the committed body is missing the server-side p_side predicate' using errcode='CLR10';
  end if;
  if position('''side'', p_side,' in v_src) = 0 then
    raise exception '#1152 tail: the committed body does not echo p_side in the returned envelope' using errcode='CLR10';
  end if;

  -- 3 · THE CURSOR AND THE PAGE ARE BOTH THERE.
  if position('"reason":"accrual_cursor_malformed"' in v_src) = 0 then
    raise exception '#1152 tail: the committed body does not raise accrual_cursor_malformed by name' using errcode='CLR10';
  end if;
  if position('if v_cursor[1] is null or v_cursor[2] is null or v_cursor[3] is null then' in v_src) = 0 then
    raise exception '#1152 tail: the committed body is missing the JSON-null cursor-element guard -- without it a {"tuple":[null,null,null]} cursor is ADMITTED and the walk silently restarts at page one' using errcode='CLR10';
  end if;
  if position('where v_cursor is null or s.sort_tuple < v_cursor' in v_src) = 0 then
    raise exception '#1152 tail: the committed body is missing the descending keyset cursor predicate' using errcode='CLR10';
  end if;
  if position('order by s.sort_tuple desc' in v_src) = 0 or position('limit v_limit' in v_src) = 0 then
    raise exception '#1152 tail: the committed body is missing the paged order/limit' using errcode='CLR10';
  end if;
  if position('''next_cursor'', v_next)' in v_src) = 0 then
    raise exception '#1152 tail: the committed body does not echo next_cursor in the returned envelope' using errcode='CLR10';
  end if;
  if position('v_limit := least(greatest(p_limit, 1), 500)' in v_src) = 0 then
    raise exception '#1152 tail: the committed body is missing the [1,500] limit clamp' using errcode='CLR10';
  end if;

  -- 4 · EVERY EXISTING ARM SURVIVED, byte-for-byte, against the committed text — this is a page
  -- widen, not a projection widen or a re-derivation.
  if position('client not found in your firm' in v_src) = 0 then
    raise exception '#1152 tail: the client-scope refusal is missing' using errcode='CLR10';
  end if;
  if position('''accrual_id'', pg.id, ''plan_id'', pg.plan_id, ''revision'', pg.revision, ''purpose'', pg.purpose,' in v_src) = 0 then
    raise exception '#1152 tail: the projection''s first fields moved -- this file must not have touched the SELECT list' using errcode='CLR10';
  end if;
  if position('''posted'', pg.posted' in v_src) = 0 then
    raise exception '#1152 tail: the derived posted flag is missing -- this file must not have touched the SELECT list' using errcode='CLR10';
  end if;
  if position('and (p_from is null or a.effective_from >= p_from)' in v_src) = 0
     or position('and (p_to is null or a.effective_from <= p_to)' in v_src) = 0 then
    raise exception '#1152 tail: the existing date-window predicates are missing' using errcode='CLR10';
  end if;
  if position('''from'', case when p_from is null then null else to_char(p_from,''YYYY-MM-DD'') end,' in v_src) = 0
     or position('''to'', case when p_to is null then null else to_char(p_to,''YYYY-MM-DD'') end,' in v_src) = 0 then
    raise exception '#1152 tail: the echoed from/to envelope fields are missing' using errcode='CLR10';
  end if;

  -- 5 · THE FOUR PROPERTIES A DROP DESTROYS, re-read from the catalog in one comparison: owner,
  -- SECURITY DEFINER (true), STABLE ('s'), the pinned search_path, and the EXACT ACL with its
  -- grantor.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
         || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
         || ' | ' || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | s | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#1152 tail: the widened door has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, STABLE, search_path=clara, pg_temp, and EXECUTE to clara_authenticated only (PUBLIC revoked); got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 6 · THE COMMENT, RE-MINTED (0334's own comment existed before this file — §0 measured that).
  select obj_description(p.oid, 'pg_proc') into v_cmt from pg_proc p
   where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)'::regprocedure;
  if v_cmt is null or position('#1152' in v_cmt) = 0 or position('p_cursor' in v_cmt) = 0 then
    raise exception '#1152 tail: the widened door carries no comment naming p_cursor' using errcode='CLR10';
  end if;

  -- 7 · THE SIBLING DOOR IS UNTOUCHED — still resolves at its own signature. Not sha-pinned
  -- (§0.4's own note: this file never reaches it), so the check here is that it survived, not
  -- that it is byte-identical to an image this file has no reason to hold.
  if to_regprocedure('clara.get_accrual_adjustment(uuid)') is null then
    raise exception '#1152 tail: clara.get_accrual_adjustment(uuid) no longer resolves -- this file must not have touched it' using errcode='CLR10';
  end if;

  raise notice '#1152 tail: OK -- clara.list_accrual_adjustments exists EXACTLY ONCE, at (uuid,date,date,text,jsonb,integer); the four-argument signature is GONE rather than left as a resolvable overload; the widened door still refuses CLR10 accrual_side_filter_unsupported and filters SERVER-SIDE on side; a malformed p_cursor refuses CLR10 accrual_cursor_malformed; the cursor predicate, the [1,500] limit clamp and the echoed next_cursor are all present; every existing arm (the client-scope refusal, the full projection, both date-window predicates, the echoed from/to fields) survives byte-for-byte; the door is owned by clara_fn_owner, SECURITY DEFINER, STABLE, pins search_path=clara, pg_temp, is PUBLIC-revoked and EXECUTE-reachable by clara_authenticated and nobody else, and now carries a comment naming p_cursor; and clara.get_accrual_adjustment still resolves, untouched.';
end
$w1152_tail$;
