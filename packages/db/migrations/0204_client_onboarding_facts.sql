-- 0204_client_onboarding_facts — #649 (A6: create a client, then continue accounting onboarding
-- from what is already known).
-- =====================================================================================
-- Spec of record: issue #649 and the wave-2026-09-15 orchestrator decisions (D7 and the
-- three-arity identity ruling). Domain words: CONTEXT.md — "Client onboarding plan",
-- "Client identity candidate", "Opening position".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. Two SECURITY DEFINER doors — one READ that tells a
-- human which existing clients or counterparties a proposed name (and, optionally, a
-- registration identifier) already collides with, and one WRITE that carries a committed
-- onboarding plan's financial-year-end answer onto the client record itself — plus the one
-- ungranted helper the write reads the plan answer with.
--
-- THIS FILE RECUTS NOTHING. No CREATE OR REPLACE of any existing body, no splice, no new
-- column, no new table, no catalog row in clara.knowledge_keys or clara.knowledge_plan_item_map
-- (#654 owns that catalog). `clara.begin_client_onboarding(text,text)` and
-- `clara.create_client(text,text)` keep their exact two-argument signatures — a defaulted third
-- parameter would create an overload and `0103:1055-1070` treats an overload of a rostered name
-- as a purity failure by executable assertion.
--
-- =====================================================================================
-- §A · THE IDENTITY WALL, AND WHY IT IS A WRAPPER RATHER THAN A RECUT.
--
-- `clara.name_family_candidates(uuid,text)` (0103:755) already answers "which parties in this
-- firm share this name's leading token", over clients UNION the firm's live counterparties, and
-- `clara.name_family_is_ambiguous` (0103:781) is literally `count(*) > 1` over it. Both are
-- DELIBERATELY UNGRANTABLE: `0103:1225-1239` is a LIVE executable census that runs
-- `has_function_privilege` over five application roles × these signatures and raises CLR10 if
-- any of them holds EXECUTE (repeated at `0126:509` and `0154:551`). A human-facing duplicate
-- check therefore cannot be "grant the predicate to the browser"; it has to be a DEFINER
-- wrapper that calls the predicate as clara_fn_owner and publishes only its ANSWER.
--
-- THE THREE ARITIES ARE A PRODUCT RULING, NOT AN IMPLEMENTATION DETAIL (orchestrator,
-- 2026-09-15):
--   0  -> proceed silently; the wrapper returns an empty list.
--   1  -> SHOW the candidate and require an explicit "this is a different business"
--         acknowledgement IN THE FACE. The database does NOT refuse here, and the reason is
--         measured rather than preferred: the estate's own predicate is `count(*) > 1`, so one
--         same-family party has never been "ambiguous" anywhere in this estate and inventing a
--         second, stricter arity in one door would make two doors disagree about one fact.
--   >=2 -> the DATABASE refuses, CLR10, reusing the token the agent lane already refuses with
--         (`name_family_collision`, 0142:451-453) rather than minting a second vocabulary for
--         the same fact, and carrying the candidates in `detail` so the face can link them.
--
-- THE REFUSAL CARRIES THE SAME ROWS THE SUCCESSFUL ANSWER WOULD HAVE, not a bare list of ids.
-- A refusal that named only uuids would leave the human face with two choices, both bad: render
-- raw ids, or go looking for the names through a SECOND read — and a second read of the same
-- fact is how two surfaces come to disagree about it. The rows are no wider a disclosure than
-- the arity-0/1 answer already is to the same admin of the same firm, and each row carries the
-- `id` the ruling asks for.
--
-- WHAT THE WALL IS NOT. This read creates nothing and blocks nothing by itself: a caller that
-- never asks can still call `clara.begin_client_onboarding` at any arity and a client is born.
-- That residual is DELIBERATE and named here rather than papered over — closing it would mean
-- recutting the most-censused birth verb family in the estate, which this wave forbids
-- (DECISIONS §1.3, "#649 -> none"). The cell that keeps this honest is
-- `p649.identity.direct_birth_residual`.
--
-- =====================================================================================
-- §B · THE FINANCIAL-YEAR-END WRITE, AND WHY THE DAY IS A PARAMETER.
--
-- `clara.clients` has carried `fy_end_month`/`fy_end_day` since 0041, under a CHECK that admits
-- ONLY both-NULL or both-set (`ck_clients_fy_end`, 0041:778). The client interview asks a MONTH
-- and nothing else (`interview.v2.questions.ts`'s `fye` segment; `validateFye` returns 1..12),
-- so the canonical record has never been writable from the interview's own answers — not
-- "unwired", genuinely not expressible.
--
-- THE OWNER'S RULING (D7, 2026-09-15) IS ASK, NOT DERIVE. Deriving the last day of the stated
-- month would invent an accounting fact on a professional's record. So the day travels as a
-- PARAMETER of this door: the human web form asks for it (offering month-end as a VISIBLE
-- suggestion, never a silent default) and passes it here. `p_fy_end_day` NULL is a refusal, not
-- a cue to guess.
--
-- THE MONTH IS THE PLAN'S, UNLESS THE CALLER NAMES ONE. With no `p_fy_end_month` the door reads
-- the committed plan's own `fye` answer. With one supplied that DISAGREES with that answer, the
-- door refuses and names both numbers — the face shows them and sends the human back to the
-- interview answer rather than letting a form quietly overrule a recorded answer.
--
-- THE DAY IS NOT IN KNOWLEDGE THIS WAVE, and that is a named residual rather than an oversight:
-- `clara.update_onboarding_plan` (0017:2632) is the RUNTIME's interview writer, this door is
-- human-lane, and #654 owns `clara.knowledge_keys`. So the day lands on `clara.clients` and
-- nowhere else until `clientOnboarding_v5` makes it an interview answer and #654 mints a
-- `financial_year_end_day` key through 0205.
--
-- THE LOCK ORDER IS THE ESTATE'S, AND IT HAS THREE RUNGS, NOT TWO:
--     client rung (203005004)  ->  clara.clients row  ->  clara.onboarding_plans row
-- Each step is another door's existing law, measured off the LIVE bodies rather than read off a
-- creating file: commit_client_onboarding takes the client row then the plan row (0017:2764 then
-- :2768) and cancel_client_onboarding does the same (0017:2852 then :2853); set_client_fy_end --
-- the door THIS one writes through -- takes `pg_advisory_xact_lock(203005004, hashtext(client))`
-- and only then updates clara.clients (0042 §S5.12, "THE RUNG BEFORE THE GUARD READS"); and
-- approve_opening_seed takes the seed row, that same rung, and THEN the plan row FOR UPDATE.
-- 0037 SECTION K states the rung ladder as a partial order over who takes what and says plainly
-- why the rungs are taken EARLY, before the row locks: that is what makes an extension
-- deadlock-free rather than merely documented, and advisory xact locks being re-entrant makes the
-- inner door's re-take free. A settle that took the two rows first and met the rung only inside
-- set_client_fy_end inverts against approve_opening_seed and against a plain set_client_fy_end on
-- the same client, and one victim of that cycle is the accounting write: 40P01 is untyped, so the
-- human door would have no refusal face for it. Two cells keep this honest --
-- `p649.settle.lock_order` (the two rows, against commit/cancel) and
-- `p649.settle.opening_rung_order` (the rung, against the opening / fy-end family).
--
-- AND NONE OF THOSE THREE IS TAKEN FOR A PLAN OUTSIDE THE CALLER'S FIRM. Both plan reads carry
-- `firm_id = c.firm`, so a foreign or unknown plan locks nothing at all and meets CLR11 at once.
-- A lock is a side effect an unauthorised caller can time, and 0021's no-existence-oracle rule is
-- not only about the words in the refusal: `p649.settle.foreign_plan_takes_no_lock` holds the
-- rung and both rows inside the owning firm and requires the outsider's CLR11 to arrive without a
-- wait, with a same-firm control proving the instrument would have caught one.
--
-- HUMAN LANE ONLY, NO `_for` TWIN, AND THE GROUND IS STRUCTURAL: `clara.set_client_fy_end` opens
-- with `clara._human_ctx`, which raises CLR04 when `clara.jwt_sub()` is NULL (0004:302-303), and
-- it is EXECUTE-granted to clara_authenticated alone (0041:4414, :4421). A machine twin could
-- not call it at all.
--
-- CLR38 IS SURFACED, NEVER SWALLOWED. The LIVE `set_client_fy_end` body is not 0041's text: 0042
-- §S5.12 spliced the client advisory rung and the live-ANNUAL depreciation-authority guard, and
-- 0045 §S5.12-b2 spliced the live-ANNUAL adjustment-template guard. Both raise CLR38
-- `fy_end_locked_by_annual_cadence`. This door does NOT catch them: they propagate to the caller
-- with the inner door's own message, code and detail, because a refused financial-year write
-- presented as a successful onboarding is the worst outcome this file can produce. The raise
-- also aborts the transaction, so the settle receipt this door reserved is rolled back with it —
-- nothing is written and nothing is replayable.
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME.
--
-- clara.client_identity_candidates                          (human lane, admin floor)
--   CLR04 (no reason)         via clara._human_ctx: no actor / no active membership / below admin
--   CLR10 client_name_required        a blank or whitespace-only name
--   CLR10 identifier_malformed        p_identifier present but not an object, or kind/value half-given
--   CLR10 identifier_kind_unknown     a kind outside clara.client_identifiers' own CHECK vocabulary
--   CLR10 name_family_collision       TWO OR MORE candidates; detail carries them (ids included)
--
-- clara.settle_client_onboarding_facts                      (human lane, bookkeeper floor)
--   CLR04 (no reason)         via clara._human_ctx
--   CLR10 op_key_required             blank op_key
--   CLR10 (op receipt)                the house receipt-hash refusal: same op_key, different month/day
--   CLR11 plan_not_in_firm            unknown plan, or another firm's (no existence oracle)
--   CLR10 plan_not_client_scoped      a FIRM-scope onboarding plan has no client record to settle
--   CLR10 plan_client_moved           belt: the plan changed clients between the two locks
--                                     (unreachable today -- nothing updates onboarding_plans.client_id)
--   CLR10 onboarding_plan_open        the plan is still open: settle follows commit
--   CLR10 onboarding_plan_not_committed   cancelled, or any other non-committed state
--   CLR10 fy_end_day_required         p_fy_end_day NULL — the day is asked, never derived (D7)
--   CLR10 fy_end_month_unanswered     no p_fy_end_month and no readable `fye` answer on the plan
--   CLR10 fy_end_month_contradicts_plan   both present and different; detail names both
--   …and, from clara.set_client_fy_end UNCHANGED and UNCAUGHT:
--   CLR11 (client is not in your firm) · CLR37 fa_particulars_invalid (an impossible calendar day)
--   CLR38 fy_end_locked_by_annual_cadence (×2 arms: adjustment_template, depreciation_authority)
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it builds on, measured before it builds.
--
-- THE FIVE BODY PINS BELOW ARE NON-REGRESSION PINS (the 0195:396-409 idiom): this file recuts
-- none of them, and pins them so that a database whose onboarding or identity lane has drifted
-- refuses this migration instead of installing two doors whose reasoning no longer holds.
-- Every one was MEASURED off `pg_proc.prosrc` on a fully migrated rig, never transcribed from a
-- creating file — two of the five are dynamic splices whose file text is NOT their live body
-- (`commit_client_onboarding` by 0018 SS4; `set_client_fy_end` by 0042 §S5.12 and 0045 §S5.12-b2).
-- =====================================================================================
do $w649_pre$
declare n text; v_sha text; v_n int;
begin
  -- 0.1 · the prerequisites both new doors call, in exact regprocedure form.
  foreach n in array array[
    'clara._human_ctx(integer)',
    'clara.role_rank(text)',
    'clara._reserve_op(uuid,text,text,bytea)',
    'clara._finish_op(uuid,text,text,jsonb)',
    'clara._hash(jsonb)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
    'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)',
    'clara.name_family_token(text)',
    'clara.name_family_candidates(uuid,text)',
    'clara.name_family_is_ambiguous(uuid,text)',
    'clara.set_client_fy_end(uuid,integer,integer,text)',
    'clara.begin_client_onboarding(text,text)',
    'clara.create_client(text,text)',
    'clara.commit_client_onboarding(uuid,uuid,uuid,text,text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#649 prestate: prerequisite absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the relations both doors read, and the CHECK that makes the day compulsory.
  foreach n in array array['clara.clients','clara.client_identifiers','clara.counterparties',
                           'clara.onboarding_plans','clara.onboarding_plan_items'] loop
    if to_regclass(n) is null then
      raise exception '#649 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_constraint con
                  where con.conrelid='clara.clients'::regclass and con.conname='ck_clients_fy_end') then
    raise exception '#649 prestate: ck_clients_fy_end is absent -- the both-or-neither rule this door exists to satisfy is not installed'
      using errcode='CLR10';
  end if;

  -- 0.3 · NEITHER NEW NAME EXISTS YET. A re-run against a database that already carries them
  -- would be a silent re-write of somebody else's body.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('client_identity_candidates','settle_client_onboarding_facts','_plan_fye_month');
  if v_n <> 0 then
    raise exception '#649 prestate: % of this file''s three new names already exist', v_n using errcode='CLR10';
  end if;

  -- 0.4 · THE FIVE NON-REGRESSION BODY PINS, measured off prosrc.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.set_client_fy_end(uuid,integer,integer,text)'::regprocedure;
  if v_sha <> 'd8aaadbb0fe715c1f90bee8e52273a231c49c25cbee1fd56e8d6d1b80fe5f72a' then
    raise exception '#649 prestate: clara.set_client_fy_end has DRIFTED from its pinned LIVE (0041+0042 §S5.12+0045 §S5.12-b2) body (sha %) -- re-derive the settle door''s CLR37/CLR38 reasoning against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.commit_client_onboarding(uuid,uuid,uuid,text,text)'::regprocedure;
  if v_sha <> 'b378b1aed21bd9cd6d43c6c25977304e071f5a65034633826ae71272df5c54b5' then
    raise exception '#649 prestate: clara.commit_client_onboarding has DRIFTED from its pinned LIVE (0017+0018 SS4) body (sha %) -- the settle door''s "committed plan" precondition is that body''s post-image', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.begin_client_onboarding(text,text)'::regprocedure;
  if v_sha <> '1b0cfc0676f08d20d3d79cbca62a7491b9ff7b928e6fed25449da17c4531cf09' then
    raise exception '#649 prestate: clara.begin_client_onboarding has DRIFTED from its pinned 0017 body (sha %) -- the identity read''s admin floor and its named direct-birth residual are both derived from it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.create_client(text,text)'::regprocedure;
  if v_sha <> '7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf' then
    raise exception '#649 prestate: clara.create_client has DRIFTED from its pinned 0017 body (sha %) -- the twin birth verb shares the residual this file names', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.name_family_candidates(uuid,text)'::regprocedure;
  if v_sha <> '3dfb7f43b11de82032cf9cca21250558f68364e796c339d216adb1cc1744481f' then
    raise exception '#649 prestate: clara.name_family_candidates has DRIFTED from its pinned 0103 body (sha %) -- the wrapper PUBLISHES this predicate''s answer, so its contract (leading-token match over clients UNION live counterparties) IS the wrapper''s contract', v_sha
      using errcode='CLR10';
  end if;

  -- 0.5 · THE CENSUS THIS FILE MUST LEAVE GREEN. `0103:1225-1239` forbids any application-role
  -- EXECUTE on the three identity helpers; the wrapper design turns on that NEGATIVE, so it is
  -- measured BEFORE as well as after.
  select count(*)::int into v_n
    from (values ('clara.name_family_token(text)'),
                 ('clara.name_family_candidates(uuid,text)'),
                 ('clara.name_family_is_ambiguous(uuid,text)')) s(sig)
    cross join (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                       ('clara_wake_proactive'),('clara_runtime')) r(rolname)
   where has_function_privilege(r.rolname, s.sig, 'execute');
  if v_n <> 0 then
    raise exception '#649 prestate: % application-role EXECUTE grant(s) already stand on the name_family_* helpers -- 0103:1225-1239 would already be red', v_n
      using errcode='CLR10';
  end if;

  raise notice '#649 prestate: clean -- every prerequisite door and relation present, ck_clients_fy_end installed, none of the three new names taken, the five non-regression bodies at their measured live texts (set_client_fy_end and commit_client_onboarding measured as SPLICED, not as file text), and no application role holds EXECUTE on any name_family_* helper.';
end
$w649_pre$;

-- =====================================================================================
-- §1 EVENT TAXONOMY. One additive pair against the ACTIVE version (the 0024 §B / 0055 §S4.0
-- idiom). The events spine validates every domain_events.event_type against clara.event_types,
-- so a door that emits an unregistered type fails on its FIRST successful call.
--
-- 'ignore': settling a client's canonical financial-year end is a HUMAN act that follows a
-- commit the human just made, and nothing downstream is designed to wake on it. Nothing here
-- manufactures a consumer for it.
-- =====================================================================================
set role clara_fn_owner;

with added(name, client_scoped, description, decision, note) as (values
  ('client.onboarding_facts_settled', true,
   'A committed onboarding plan''s financial-year end was carried onto the client record',
   'ignore',
   'human settle act following commit_client_onboarding; the client record is read directly by every consumer -- no router wake (0024 §B / 0055 §S4.0 ignore posture)')
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added
  returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x
join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

-- =====================================================================================
-- §2 clara._plan_fye_month — the ONE reader of a plan's settled financial-year-end MONTH.
--
-- UNGRANTED to every application role (the one-ungranted-core law, 0004:6-12): it is reached
-- only from the settle door, which runs as clara_fn_owner.
--
-- IT READS THE ANSWER'S TWO HONEST SHAPES AND NOTHING ELSE. `clara.update_onboarding_plan`
-- stores `answer` as whatever the interview produced, and `validateFye` produces a JSON NUMBER
-- (0192's own map row says so: "JSON number 1-12"). A JSON STRING of digits is accepted too,
-- because a human resolution through `clara.resolve_onboarding_plan_item` writes
-- `to_jsonb(p_resolution)` — a string — and a plan whose month was resolved by hand must read
-- the same as one answered by the interview. ANY OTHER SHAPE READS AS ABSENT: an object, an
-- array, a number outside 1..12 or a non-numeric string is not a month, and pretending it is
-- would let the settle door write a financial year nobody stated.
--
-- BOTH BRANCHES ARE BOUNDED TO TWO DIGITS BEFORE THE CAST, and that is not tidiness. `::int`
-- raises 22003 (`value out of range`) for a JSON number wider than an integer, and 22003 is an
-- UNTYPED error with no `detail.reason` — it would leave the human settle door raising something
-- no refusal face in this estate can read, for an answer that is not a month by anyone's
-- reckoning. `clara.update_onboarding_plan` (0017:2632) validates item_key/item_kind/state only
-- and stores `j->'answer'` verbatim, so a wide number is reachable through a GRANTED door, not
-- only by hand. Bounded first, cast second: an unreadable month reads as ABSENT and the settle
-- door refuses CLR10 `fy_end_month_unanswered` like it does for every other unreadable shape.
-- =====================================================================================
create function clara._plan_fye_month(p_plan uuid) returns int
  language sql stable set search_path = clara, pg_temp as $fn$
  select m.month from (
    select case
             when jsonb_typeof(i.answer) = 'number'
               and (i.answer)::text ~ '^[0-9]{1,2}$'
               then (i.answer)::text::int
             when jsonb_typeof(i.answer) = 'string'
               and (i.answer #>> '{}') ~ '^[0-9]{1,2}$'
               then (i.answer #>> '{}')::int
             else null
           end as month
      from clara.onboarding_plan_items i
     where i.plan_id = p_plan
       and i.item_key = 'fye'
       and i.state in ('answered','resolved')
     order by i.updated_at desc, i.id
     limit 1
  ) m
  where m.month between 1 and 12
$fn$;
comment on function clara._plan_fye_month(uuid) is
  '#649: the committed plan''s stated financial-year-end MONTH, or NULL when the plan never '
  'stated a readable one. Ungranted: reached only from clara.settle_client_onboarding_facts.';
revoke all on function clara._plan_fye_month(uuid) from public;

-- =====================================================================================
-- §3 clara.client_identity_candidates — the human-facing duplicate/ambiguity READ.
--
-- SECURITY DEFINER because the predicate it publishes may not be granted (§A). The FIRM COMES
-- FROM THE SESSION, never from a parameter: a SECURITY DEFINER function with a caller-supplied
-- tenant parameter is the cross-tenant-oracle shape 0002:453-458 records the estate paying for
-- once, and 0103's own header names it again as the reason `name_family_candidates` stayed
-- SECURITY INVOKER.
--
-- ADMIN FLOOR, matching `clara.begin_client_onboarding` exactly. A read that enumerates a firm's
-- client and counterparty names by prefix is an identity oracle; it belongs to the role that can
-- actually create the client it is about to be asked about, and to nobody below it. A below-floor
-- caller gets CLR04 and learns nothing — the refusal is identical whether the name matches a real
-- family or nothing at all.
-- =====================================================================================
create function clara.client_identity_candidates(p_name text, p_identifier jsonb default null)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; v_name text; v_kind text; v_value text; v_rows jsonb; v_arity int;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'a client name is required to look for identity candidates'
      using errcode = 'CLR10', detail = '{"reason":"client_name_required","class":"client_identity"}';
  end if;

  if p_identifier is not null and p_identifier <> 'null'::jsonb then
    if jsonb_typeof(p_identifier) <> 'object' then
      raise exception 'an identifier must be an object with a kind and a value'
        using errcode = 'CLR10', detail = '{"reason":"identifier_malformed","class":"client_identity"}';
    end if;
    v_kind  := nullif(btrim(coalesce(p_identifier ->> 'kind', '')), '');
    v_value := nullif(btrim(coalesce(p_identifier ->> 'value', '')), '');
    if (v_kind is null) <> (v_value is null) then
      raise exception 'an identifier needs both a kind and a value'
        using errcode = 'CLR10', detail = '{"reason":"identifier_malformed","class":"client_identity"}';
    end if;
    if v_kind is not null and v_kind not in ('tin','ssm','bank_account') then
      raise exception 'identifier kind % is not one this estate records', v_kind
        using errcode = 'CLR10', detail = '{"reason":"identifier_kind_unknown","class":"client_identity"}';
    end if;
    -- BYTE-IDENTICAL to clara.add_client_identifier's own normalisation (and to
    -- clara._identifier_promotion_core's copy of it): a read that normalised differently from
    -- the writer would answer "no match" on a value already stored.
    if v_value is not null then
      v_value := lower(regexp_replace(v_value, '\s+', '', 'g'));
    end if;
  end if;

  with fam as (
    select f.party_kind,
           f.party_id,
           f.party_name,
           f.bound_client as client_id,
           case when f.party_kind = 'client' and lower(f.party_name) = lower(v_name)
                then 'exact_name' else 'name_family' end as match_reason,
           case when f.party_kind = 'client' and lower(f.party_name) = lower(v_name)
                then 1 else 2 end as reason_rank
      from clara.name_family_candidates(c.firm, v_name) f
  ), idt as (
    select 'client'::text as party_kind,
           cl.id          as party_id,
           cl.name        as party_name,
           cl.id          as client_id,
           'identifier'::text as match_reason,
           0              as reason_rank
      from clara.client_identifiers ci
      join clara.clients cl on cl.id = ci.client_id and cl.firm_id = ci.firm_id
     where v_kind is not null
       and ci.firm_id = c.firm
       and ci.kind = v_kind
       and ci.value_normalized = v_value
  ), allc as (
    select * from fam union all select * from idt
  ), best as (
    select distinct on (b.party_kind, b.party_id)
           b.party_kind, b.party_id, b.party_name, b.client_id, b.match_reason, b.reason_rank
      from allc b
     order by b.party_kind, b.party_id, b.reason_rank
  )
  select coalesce(jsonb_agg(jsonb_build_object(
             'party_kind', b.party_kind,
             'id', b.party_id,
             'name', b.party_name,
             'status', cl.status,
             'client_id', b.client_id,
             'match_reason', b.match_reason)
           order by b.reason_rank, b.party_name, b.party_id), '[]'::jsonb),
         count(*)::int
    into v_rows, v_arity
    from best b
    left join clara.clients cl
           on cl.id = b.party_id and cl.firm_id = c.firm and b.party_kind = 'client';

  -- THE WALL. Two or more parties already answer to this name (or to this identifier), so the
  -- database refuses and hands back WHICH ones. The token is the agent lane's own
  -- (`name_family_collision`, 0142:451-453) -- one fact, one vocabulary.
  if v_arity >= 2 then
    raise exception 'this name matches % existing clients or counterparties in your firm; decide which business this is before another record is created', v_arity
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'name_family_collision', 'class', 'client_identity',
                                    'name', v_name, 'arity', v_arity, 'candidates', v_rows)::text;
  end if;

  return jsonb_build_object('name', v_name, 'arity', v_arity, 'candidates', v_rows);
end $$;
comment on function clara.client_identity_candidates(text, jsonb) is
  '#649 AC1: which existing clients or live counterparties in the CALLER''S OWN firm already '
  'answer to this name (leading-token family, exact name) or to this identifier. Arity 0 '
  'proceeds, arity 1 is shown to the human and acknowledged in the face, arity >=2 RAISES CLR10 '
  'name_family_collision carrying the same candidate rows in detail. Admin floor, firm from the '
  'session.';
revoke all on function clara.client_identity_candidates(text, jsonb) from public;
grant execute on function clara.client_identity_candidates(text, jsonb) to clara_authenticated;

-- =====================================================================================
-- §4 clara.settle_client_onboarding_facts — the canonical client record, after commit.
--
-- FOUR ARGUMENTS, AND THE MIDDLE TWO ARE THE WHOLE TRANSPORT OF D7 (§B). The op hash covers the
-- month AND the day, so an exact replay returns the stored receipt byte-identically and a replay
-- carrying a DIFFERENT day meets the house receipt-hash CLR10 rather than moving the year end.
--
-- BOOKKEEPER FLOOR, matching the write it makes. `clara.set_client_fy_end` is bookkeeper+ in its
-- own body and re-derives that floor when this door calls it; flooring this door higher would
-- refuse a bookkeeper a write the estate already grants them, and flooring it lower would be a
-- floor this door cannot honour anyway.
--
-- IT WRITES THROUGH THE EXISTING DOOR, UNCHANGED. No UPDATE of clara.clients lives here: the
-- advisory rung, the calendar-day CLR37 and both CLR38 annual-cadence guards are
-- `set_client_fy_end`'s, and duplicating any of them would be a second opinion about one fact.
-- =====================================================================================
create function clara.settle_client_onboarding_facts(
    p_plan uuid, p_fy_end_month int, p_fy_end_day int, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; p record; v_dedupe jsonb; v_plan_month int; v_month int; v_source text;
  v_client uuid; v_inner jsonb; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required'
      using errcode = 'CLR10', detail = '{"reason":"op_key_required","class":"settle"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'settle_client_onboarding_facts', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'month', p_fy_end_month, 'day', p_fy_end_day)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- THE ORDER IS THE ESTATE'S, NOT THIS DOOR'S PREFERENCE:
  --     client rung (203005004)  ->  clara.clients row  ->  clara.onboarding_plans row
  -- and every step of it is somebody else's law, measured off the LIVE bodies on the rig:
  --   * `commit_client_onboarding` locks clara.clients (0017:2764) and THEN clara.onboarding_plans
  --     (0017:2768); `cancel_client_onboarding` does the same (0017:2852, :2853). CLIENT BEFORE
  --     PLAN.
  --   * `clara.set_client_fy_end` — the door this one writes THROUGH — takes
  --     `pg_advisory_xact_lock(203005004, hashtext(client))` and only then updates clara.clients
  --     ("THE RUNG BEFORE THE GUARD READS", 0042 §S5.12). RUNG BEFORE CLIENT.
  --   * `clara.approve_opening_seed` takes the seed row, then that same rung, then the PLAN row
  --     FOR UPDATE (0017 §K5). RUNG BEFORE PLAN.
  -- 0037 SECTION K states the rung ladder as a PARTIAL order over who takes what
  -- ("firm (203005002) -> client (203005004)") and says why taking the rungs EARLY, before the
  -- row locks, is what makes an extension deadlock-free rather than merely documented. Taking the
  -- two rows first and meeting the rung only inside `set_client_fy_end` inverts against BOTH of
  -- the last two doors, and the loser of that cycle is a 40P01: an untyped deadlock error out of a
  -- human door, killing a legitimate financial-year write while the face has nothing to say about
  -- it. Advisory transaction locks are re-entrant, so `set_client_fy_end` re-taking the rung
  -- below is free.
  --
  -- THE PRE-READ IS UNLOCKED, AND IT IS SCOPED TO THE CALLER'S FIRM. Unlocked, because it only
  -- says WHICH client to lock: `clara.onboarding_plans.client_id` is written at insert and never
  -- updated (no `update clara.onboarding_plans … set client_id` exists anywhere in
  -- packages/db/migrations), so the row locked here is the row the locked plan names — and the
  -- assertion after the plan lock keeps that true if a future writer ever moves a plan between
  -- clients. SCOPED, because a lock is a side effect an unauthorised caller can MEASURE: without
  -- `op.firm_id = c.firm` this SECURITY DEFINER read yields a real client_id for ANOTHER firm's
  -- plan, and the rung and row lock below would then be taken on that firm's client before the
  -- CLR11 refusal — so an outsider holding a stopwatch could tell a foreign plan (waits) from an
  -- unknown one (does not). 0021's no-existence-oracle rule is not only about the words in the
  -- refusal. The plan lock below carries the same predicate for the same reason.
  select op.client_id into v_client
    from clara.onboarding_plans op
    where op.id = p_plan and op.firm_id = c.firm;
  if v_client is not null then
    perform pg_advisory_xact_lock(203005004, hashtext(v_client::text));
    perform 1 from clara.clients where id = v_client for update;
  end if;

  -- NO EXISTENCE ORACLE (0021's rule): an unknown plan and another firm's plan are one answer —
  -- the same refusal, and now also the same absence of any wait.
  select * into p from clara.onboarding_plans
    where id = p_plan and firm_id = c.firm for update;
  if not found then
    raise exception 'onboarding plan not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"plan_not_in_firm","class":"settle"}';
  end if;
  if p.scope_kind <> 'client' or p.client_id is null then
    raise exception 'a firm-scope onboarding plan has no client record to settle'
      using errcode = 'CLR10', detail = '{"reason":"plan_not_client_scoped","class":"settle"}';
  end if;
  -- BELT, AND LABELLED AS ONE: unreachable today, because nothing in this estate updates a plan's
  -- client_id. It exists so that a future writer which moves a plan between clients meets a TYPED
  -- refusal here rather than silently resurrecting the lock-order inversion above (the client row
  -- this transaction holds would no longer be the one the write is about).
  if p.client_id is distinct from v_client then
    raise exception 'this onboarding plan changed clients while it was being settled'
      using errcode = 'CLR10', detail = '{"reason":"plan_client_moved","class":"settle"}';
  end if;
  if p.state = 'open' then
    raise exception 'this onboarding plan is still open; settle the client''s facts after the commit'
      using errcode = 'CLR10', detail = '{"reason":"onboarding_plan_open","class":"settle"}';
  end if;
  if p.state <> 'committed' then
    raise exception 'only a committed onboarding plan settles its client''s facts (this one is %)', p.state
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','onboarding_plan_not_committed','class','settle',
                                    'state', p.state)::text;
  end if;

  -- THE DAY IS ASKED, NEVER DERIVED (D7). Month-end is a SUGGESTION the face offers and a human
  -- accepts; it is not a value this door invents on a professional's record.
  if p_fy_end_day is null then
    raise exception 'a financial-year end needs the DAY as well as the month; month-end is a suggestion, not a default'
      using errcode = 'CLR10', detail = '{"reason":"fy_end_day_required","class":"settle"}';
  end if;

  v_plan_month := clara._plan_fye_month(p_plan);
  if p_fy_end_month is null then
    if v_plan_month is null then
      raise exception 'this plan states no financial-year-end month, and none was supplied'
        using errcode = 'CLR10', detail = '{"reason":"fy_end_month_unanswered","class":"settle"}';
    end if;
    v_month := v_plan_month;
    v_source := 'plan';
  else
    if v_plan_month is not null and v_plan_month <> p_fy_end_month then
      raise exception 'the supplied financial-year-end month (%) contradicts the answer recorded on this plan (%)', p_fy_end_month, v_plan_month
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason','fy_end_month_contradicts_plan','class','settle',
                                      'supplied', p_fy_end_month, 'plan', v_plan_month)::text;
    end if;
    v_month := p_fy_end_month;
    v_source := case when v_plan_month is null then 'caller' else 'plan_confirmed' end;
  end if;

  -- THE ONE WRITE, THROUGH THE EXISTING DOOR, AND ITS REFUSALS ARE NOT CAUGHT (§B).
  v_inner := clara.set_client_fy_end(p.client_id, v_month, p_fy_end_day, p_op_key);

  perform clara._audit(c.firm, c.actor, null, null, 'settle_client_onboarding_facts', null,
    jsonb_build_object('plan', p_plan, 'client', p.client_id, 'month', v_month,
      'day', p_fy_end_day, 'month_source', v_source, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'client.onboarding_facts_settled', p.client_id,
    c.actor, null, null, null, null, null,
    jsonb_build_object('plan_id', p_plan, 'fy_end_month', v_month, 'fy_end_day', p_fy_end_day,
      'fy_end_month_source', v_source));
  v_result := jsonb_build_object('plan_id', p_plan, 'client_id', p.client_id,
    'fy_end_month', v_month, 'fy_end_day', p_fy_end_day, 'fy_end_month_source', v_source,
    'set_client_fy_end', v_inner);
  return clara._finish_op(c.firm, 'settle_client_onboarding_facts', p_op_key, v_result);
end $$;
comment on function clara.settle_client_onboarding_facts(uuid, int, int, text) is
  '#649 AC2 (D7): carries a COMMITTED client onboarding plan''s financial-year end onto '
  'clara.clients through clara.set_client_fy_end, with the DAY supplied as a parameter (asked, '
  'never derived) and the MONTH taken from the plan''s own answer unless the caller names the '
  'same one. Human lane, bookkeeper floor; CLR37 and both CLR38 annual-cadence refusals '
  'propagate from the inner door uncaught.';
revoke all on function clara.settle_client_onboarding_facts(uuid, int, int, text) from public;
grant execute on function clara.settle_client_onboarding_facts(uuid, int, int, text) to clara_authenticated;

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w649_tail$
declare v_posture text; v_sha text; v_bad text; v_n int; v_sig text;
begin
  -- 1 · both doors and the helper exist exactly once, at the signatures the estate will call.
  foreach v_sig in array array['clara.client_identity_candidates(text,jsonb)',
                               'clara.settle_client_onboarding_facts(uuid,integer,integer,text)',
                               'clara._plan_fye_month(uuid)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#649 tail: % does not resolve', v_sig using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('client_identity_candidates','settle_client_onboarding_facts','_plan_fye_month');
  if v_n <> 3 then
    raise exception '#649 tail: the three new names resolve to % bodies (expected exactly 3) -- an overload was created', v_n
      using errcode='CLR10';
  end if;

  -- 2 · POSTURE, read from the catalog: owner, SECURITY DEFINER, pinned search_path, and the
  --     EXACT ACL (grantor included), sorted so the assertion does not depend on grant order.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce((select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.client_identity_candidates(text,jsonb)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_authenticated=X/clara_fn_owner,clara_fn_owner=X/clara_fn_owner' then
    raise exception '#649 tail: clara.client_identity_candidates has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and EXECUTE to clara_authenticated only; got {%}', v_posture
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce((select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.settle_client_onboarding_facts(uuid,integer,integer,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_authenticated=X/clara_fn_owner,clara_fn_owner=X/clara_fn_owner' then
    raise exception '#649 tail: clara.settle_client_onboarding_facts has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and EXECUTE to clara_authenticated only; got {%}', v_posture
      using errcode='CLR10';
  end if;
  -- the helper is UNGRANTED to every application role, and that absence IS the assertion.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce((select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara._plan_fye_month(uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner' then
    raise exception '#649 tail: clara._plan_fye_month must be an UNGRANTED, SECURITY INVOKER, search_path-pinned helper owned by clara_fn_owner; got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 3 · NO OTHER ROLE GAINED ANYTHING. The agent role, both wake roles and clara_runtime hold
  --     EXECUTE on neither new door: the identity read is an identity oracle and the settle door
  --     writes a client's canonical record, and a lane that carries no human claims can do
  --     neither.
  select string_agg(x.sig || '->' || x.rolname, ', ') into v_bad
    from (select s.sig, r.rolname
            from (values ('clara.client_identity_candidates(text,jsonb)'),
                         ('clara.settle_client_onboarding_facts(uuid,integer,integer,text)'),
                         ('clara._plan_fye_month(uuid)')) s(sig)
            cross join (values ('clara_agent_ro'),('clara_wake_interactive'),
                               ('clara_wake_proactive'),('clara_runtime')) r(rolname)
           where has_function_privilege(r.rolname, s.sig, 'execute')) x;
  if v_bad is not null then
    raise exception '#649 tail: a non-human lane holds EXECUTE on a #649 door: %', v_bad using errcode='CLR10';
  end if;

  -- 4 · THE 0103 CENSUS IS STILL GREEN. The whole wrapper design turns on this negative, so it
  --     is re-measured against the COMMITTED catalog rather than assumed from "we granted the
  --     wrapper instead".
  select string_agg(x.sig || '->' || x.rolname, ', ') into v_bad
    from (select s.sig, r.rolname
            from (values ('clara.name_family_token(text)'),
                         ('clara.name_family_candidates(uuid,text)'),
                         ('clara.name_family_is_ambiguous(uuid,text)')) s(sig)
            cross join (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                               ('clara_wake_proactive'),('clara_runtime')) r(rolname)
           where has_function_privilege(r.rolname, s.sig, 'execute')) x;
  if v_bad is not null then
    raise exception '#649 tail: an identity helper became EXECUTE-reachable: % -- 0103:1225-1239 (repeated at 0126:509 and 0154:551) forbids exactly this', v_bad
      using errcode='CLR10';
  end if;

  -- 5 · THE FIVE NON-REGRESSION PINS ARE UNMOVED. This file recut nothing; the tail proves it
  --     against the committed catalog rather than against its own intent.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.set_client_fy_end(uuid,integer,integer,text)'::regprocedure;
  if v_sha <> 'd8aaadbb0fe715c1f90bee8e52273a231c49c25cbee1fd56e8d6d1b80fe5f72a' then
    raise exception '#649 tail: clara.set_client_fy_end MOVED (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.commit_client_onboarding(uuid,uuid,uuid,text,text)'::regprocedure;
  if v_sha <> 'b378b1aed21bd9cd6d43c6c25977304e071f5a65034633826ae71272df5c54b5' then
    raise exception '#649 tail: clara.commit_client_onboarding MOVED (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.begin_client_onboarding(text,text)'::regprocedure;
  if v_sha <> '1b0cfc0676f08d20d3d79cbca62a7491b9ff7b928e6fed25449da17c4531cf09' then
    raise exception '#649 tail: clara.begin_client_onboarding MOVED (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.create_client(text,text)'::regprocedure;
  if v_sha <> '7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf' then
    raise exception '#649 tail: clara.create_client MOVED (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.name_family_candidates(uuid,text)'::regprocedure;
  if v_sha <> '3dfb7f43b11de82032cf9cca21250558f68364e796c339d216adb1cc1744481f' then
    raise exception '#649 tail: clara.name_family_candidates MOVED (sha %) -- the wrapper publishes THIS body''s answer', v_sha
      using errcode='CLR10';
  end if;

  -- 6 · NEITHER BIRTH VERB GAINED AN OVERLOAD. 0103:1055-1070 treats a rostered name with more
  --     than one pg_proc row as a purity failure; this file's whole "no recut" claim rests on
  --     the two-argument signatures staying alone.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('begin_client_onboarding','create_client','set_client_fy_end');
  if v_n <> 3 then
    raise exception '#649 tail: the three birth/fy-end verbs resolve to % bodies (expected exactly 3) -- an overload appeared', v_n
      using errcode='CLR10';
  end if;

  -- 7 · THE EVENT TYPE IS REGISTERED ON BOTH REGISTERS (the 0055 §S7.5 finding, made structural):
  --     an unregistered type turns the settle door's FIRST successful call into a spine CLR10.
  select count(*)::int into v_n from clara.event_types where name = 'client.onboarding_facts_settled';
  if v_n <> 1 then
    raise exception '#649 tail: client.onboarding_facts_settled is not registered in clara.event_types'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
    join clara.taxonomy_active a on a.version = tt.version
   where tt.event_type = 'client.onboarding_facts_settled' and tt.decision = 'ignore';
  if v_n <> 1 then
    raise exception '#649 tail: client.onboarding_facts_settled carries no ''ignore'' decision on the ACTIVE taxonomy version'
      using errcode='CLR10';
  end if;

  -- 8 · NO CATALOG ROW WAS MINTED. DECISIONS §1.5 gives clara.knowledge_keys and
  --     clara.knowledge_plan_item_map to #654 alone, and an append-only catalog cannot take a
  --     row back — so this file asserts it added none rather than merely not writing one.
  select count(*)::int into v_n from clara.knowledge_plan_item_map
   where item_key in ('fye_day','financial_year_end_day')
      or knowledge_key = 'financial_year_end_day';
  if v_n <> 0 then
    raise exception '#649 tail: a fy-end-day catalog row exists -- #649 mints none (DECISIONS §1.5; #654 files it through 0205)'
      using errcode='CLR10';
  end if;

  raise notice '#649 tail: OK -- clara.client_identity_candidates(text,jsonb) and clara.settle_client_onboarding_facts(uuid,integer,integer,text) each exist exactly once, owned by clara_fn_owner, SECURITY DEFINER, search_path-pinned and EXECUTE-reachable by clara_authenticated and nobody else (PUBLIC revoked; no agent, wake or runtime grant); clara._plan_fye_month(uuid) is the ungranted SECURITY INVOKER helper both of them keep out of reach; 0103:1225-1239''s five-role census over name_family_token/candidates/is_ambiguous is still EMPTY, which is the negative the wrapper design turns on; the five non-regression bodies (set_client_fy_end and commit_client_onboarding measured as SPLICED, plus begin_client_onboarding, create_client and name_family_candidates) are byte-identical to their prestate pins; begin_client_onboarding, create_client and set_client_fy_end each still resolve to exactly ONE body, so no overload was created; client.onboarding_facts_settled is registered on the spine catalog and carries an ''ignore'' decision on the active taxonomy version; and no knowledge catalog row was minted.';
end
$w649_tail$;
