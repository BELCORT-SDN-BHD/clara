-- 0320_client_financial_pack_wake_read — #1000 (riders cut phase, lane C1): THE MODEL LANE'S
-- ENTRANCE TO THE CLIENT HOME'S MONEY BAND, opened the house way and without a second definition
-- of a single figure.
-- =====================================================================================
-- Spec of record: issue #1000's body (Agent Brief, the newest and only one — the issue carries no
-- comments), plus the cut phase's plan of record
-- `docs/plan/active/riders-2026-09-20/CUT-PLAN.md` §1.3 B1, which reserves THIS number for THIS
-- ticket and names the precedent shape.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. `clara.get_client_financial_pack`'s computation moves,
-- byte for byte, into ONE ungranted core that takes the caller's FIRM as an argument; the human
-- door becomes that core's own thin audited wrapper, keeping its signature, its envelope, its
-- refusal codes and its ACL; and a SECOND audited wrapper —
-- `clara.wake_get_client_financial_pack`, EXECUTE to `clara_agent_ro`, one
-- `clara.wake_fn_allowlist` row — is the chat lane's door onto the same body.
--
-- =====================================================================================
-- WHY A SPLIT AND NOT A GRANT, A TWIN OR AN IMPERSONATION. Four routes were measured on this rig
-- before one was written; three of them are closed, and each is closed by something the estate
-- already decided rather than by preference.
--
-- (1) GRANT THE READ TO THE AGENT ROLE. `clara.get_client_financial_pack` was SECURITY INVOKER
--     and resolved its caller inline from `clara.jwt_sub()`. The chat lane runs on pooled
--     credentials that carry no `request.jwt.claims` at all
--     (`packages/runtime/lib/pools.mjs`), so the grant would have bought a door that answers
--     CLR04 `no authenticated actor` on every call — "a tool that could only return a grant
--     refusal, and that is not a capability" (`reports/wave4-lane04-ticket939.md`). 0232's own
--     tail also asserts, literally, that `clara_runtime`, `clara_agent_ro` and every
--     `clara_wake_*` role hold NOTHING on it, and this file keeps that true.
--
-- (2) A WAKE WRAPPER THAT SETS `request.jwt.claims` FROM THE CREDENTIAL'S on_behalf_of. REFUSED,
--     and the estate refused it first, in words:
--         "The render worker has no JWT and must never have one. Setting request.jwt.claims from
--          a production function to borrow a human's identity is impersonation; in this repo that
--          idiom appears ONLY inside migration probes (0011:99, 0019:1778), never on a production
--          path, and it is not being introduced here."
--     — `0082_wave_e_zeta_render_jobs_part4.sql:14-17`. That header then names the remaining two
--     options and rules between them: "duplicate the gate on the machine side, or split it.
--     DUPLICATION IS REFUSED -- a second copy of a gate is a second place to forget it... So the
--     gate is SPLIT into `clara._seal_report_artifact_core(p_firm, p_actor, ...)` plus a thin
--     human wrapper that resolves identity and delegates: the 0004:749-750 `_*_core` containment
--     idiom, and how the WAKE lane already reaches the same writers (0004:626)." This file is
--     that ruling applied to this read.
--
-- (3) A SECOND, MACHINE-SIDE COPY OF THE COMPUTATION. Refused by the same sentence, and by #660's
--     own law: "One fact gets ONE definition" (`0154:2058`, `0232`'s header on book cash). The
--     ticket states it too: "the pack stays the single definition of these numbers."
--
-- (4) A SECURITY INVOKER wake wrapper, so the estate's own `p_*_agent` RLS policies would scope
--     the read to `clara.wake_firm()`. Closed by measurement: of the nine relations the pack
--     reads, `clara.cash_account_set_versions` and `clara.cash_account_set_members` carry NO
--     agent policy at all, and `clara.opening_seed_registry`, `clara.onboarding_plans` and
--     `clara.onboarding_plan_items` carry an agent policy with no table SELECT grant behind it.
--     Making that route work would mean five new table grants and two new policies for
--     `clara_agent_ro` — a widening of the model lane's RELATION reach that #1000's own last
--     acceptance criterion forbids ("The new entrance grants the model lane no more than the
--     human door already grants"). A single EXECUTE on one audited wrapper is the narrower buy.
--
-- MEASURED, NOT RECALLED, on `clara_l01` at 309 files / `0318_knowledge_fye_pair_applicability`:
--   · `set_config('role', ...)` inside a SECURITY DEFINER body is refused outright by PostgreSQL
--     (42501, `cannot set parameter "role" within security-definer function`), so "become the
--     human for one statement" is not available to a wrapper at all;
--   · `clara.clients` is FORCE ROW LEVEL SECURITY, and its `p_clients_owner` policy is
--     `TO clara_fn_owner USING (true)` — a definer body owned by `clara_fn_owner` sees all 506
--     clients on this rig. That is why this file's core carries an EXPLICIT firm predicate and
--     why the tail proves the predicate is there.
--
-- =====================================================================================
-- THE ONE THING THAT MUST NOT CHANGE, AND HOW THIS FILE PROVES IT.
--
-- The core's body is `clara.get_client_financial_pack`'s OWN body with EXACTLY THREE anchored
-- edits, each of which is written out below in §TAIL as a pair of constants:
--   A. the `c record` declaration, removed with the block that used it;
--   B. the inline JWT floor, replaced by a comment naming the two doors that now carry it;
--   C. the visibility test, which gains `and cl.firm_id = p_firm`.
-- Nothing else moves: not a figure, not a coverage word, not an envelope key, not a refusal code.
-- §TAIL REVERSES all three edits on the LIVE core body and asserts the result hashes to the
-- pre-image this file pinned — so "the numbers did not change" is a checked fact about the live
-- catalog rather than a claim about a copy-paste. `client-financial-pack.test.mjs`, #660's own
-- battery, is the behavioural half and runs unchanged against the human door.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   * It does not change the read's signature, its envelope, its coverage vocabulary or any of
--     its refusal codes. `p_client is null` is still CLR10 `invalid_client`; a month that is not
--     a first day, a future as-of and an as-of outside the named month are still CLR10
--     `month_not_first_day` / `as_of_in_future` / `as_of_outside_month`; a client with no
--     published cash set is still `status = unknown`, `value_cents = null`,
--     `coverage_reason = cash_set_unpublished` — DATA, never a refusal and never 0.
--   * It does not touch `clara.propose_client_cash_accounts`, `clara.publish_client_cash_account_set`,
--     `clara.book_today` or `clara._book_today` (all pinned unconditionally below and re-asserted
--     in the tail), and it writes no row anywhere except ONE `clara.wake_fn_allowlist` row.
--   * It does not widen the model lane by one relation. The whole delta on the machine side is:
--     one EXECUTE on one new wrapper, and one allowlist row for one wake kind.
--   * It opens NO write path onto cash account sets from any machine lane. The publish door is
--     untouched and still `clara_authenticated`-only, admin-floored.
--   * It grants the core to NOBODY. It is reachable only from the two definer doors above (the
--     one-ungranted-core law, 0004:6-12).
--
-- THE FLOOR EACH LANE CARRIES, STATED SO NOBODY HAS TO DERIVE IT.
--   · human lane — VIEWER, through `clara._human_ctx(clara.role_rank('viewer'))`, which raises the
--     SAME three CLR04s (`no authenticated actor`, `actor has no active membership`,
--     `insufficient role`) the inline block raised, because it IS the estate's one floor body;
--   · model lane — BOOKKEEPER+, and it is not this file's choice: `clara.mint_wake_credential`
--     refuses a below-bookkeeper `on_behalf_of` outright (CLR10 `authority_lost`) and
--     `clara.wake_context` re-validates the same standing on EVERY use, so a demoted person's
--     outstanding credential goes inert mid-conversation. The model lane is therefore STRICTLY
--     NARROWER than the human door it reaches, which is what "carrying the human door's role
--     floor ... rather than widening either" asks for.
--
-- REDO-SAFE BY CONSTRUCTION (#957, `packages/db/README.md`): every object here is a
-- `create or replace function`, the one row it writes is `on conflict do nothing` against
-- `clara.wake_fn_allowlist`'s own primary key, and the prestate admits TWO pre-images for the one
-- body it recuts — its measured live sha (a fresh apply) or a body already carrying this file's
-- `#1000` attribution (a redo).
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file creates two
                                        -- functions, replaces one, and writes one row. It runs no
                                        -- backfill and scans no table.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $t1000_pre$
declare
  v_sha text; v_src text; v_i int; v_mode text;
  -- THE ONE BODY THIS FILE RECUTS. Two pre-images are admitted and nothing else: the measured
  -- live sha on a chain that carries 0232 (and 0276, which pinned this same body untouched), or a
  -- body already carrying this file's own attribution — which is what a REDO looks like.
  c_pack_pre constant text :=
    'c846768d0d114a3bf38d90a437bdd65731f4a3cbc64a7ecd3edc72cb6b788f1e';
  -- UNCONDITIONAL NEIGHBOUR PINS. Every one is MEASURED LIVE on `clara_l01` after #985 (the
  -- ticket before this one in lane C1, which added no migration at all), never copied from an
  -- earlier migration's header. This file calls the first four and relies on the last four being
  -- exactly what the read it is splitting relies on.
  v_pins text[][] := array[
    ['clara.wake_context()',
     'fae8e7999b1763b96d451e12cba28ba15a27a2eb93601ccf9f178f4f361b540d'],
    ['clara.assert_wake_allowed(text,text)',
     '1c88b7e09e60e3384ee5a2cff36db7ba242f3397f0213b488388f7f827306e3b'],
    ['clara._human_ctx(integer)',
     'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46'],
    ['clara.role_rank(text)',
     '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f'],
    ['clara.jwt_sub()',
     'c4051473a0619987796d2aa7a64817536ac21d161f0fd827b6912ca8ce1aa243'],
    ['clara.jwt_firm()',
     '43338e8393c961c9f3d06fb0929479cfcc33ff91c67f8575478a790b6fab0a45'],
    ['clara.actor_role_rank()',
     '9b011800f23ff8a774285845902892af53350f58778a967abd69773d91eb699d'],
    ['clara.propose_client_cash_accounts(uuid)',
     'c2d04e73e08bbb33fd591413fa243d4cda58ab6b4da07fd41c4e9de29012d261'],
    ['clara.publish_client_cash_account_set(uuid,jsonb,date,text)',
     'b84c152869c4148339e67b0d26907ccec62564c182008ac3e25adf6feaf8e750'],
    ['clara.book_today()',
     '6fa61590d86dec3d4d8ced82e617344da6aa282777d7e6c31ca70aa48cce97e3'],
    ['clara._book_today()',
     '7cf4dce633284fd955e575da49a24377f20f10ad0621ef5134b8dd7cb3d5c26e']
  ];
begin
  -- (0.1) THE PREMISE: 0232's three doors and the wake machinery must be here. A forward
  -- reference would otherwise resolve at first CALL rather than at apply (0082's own reason).
  if to_regprocedure('clara.get_client_financial_pack(uuid,date,date)') is null
     or to_regprocedure('clara.propose_client_cash_accounts(uuid)') is null
     or to_regprocedure('clara.publish_client_cash_account_set(uuid,jsonb,date,text)') is null then
    raise exception '#1000 prestate: 0232_client_financial_pack.sql is not applied — apply it first'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.wake_context()') is null
     or to_regprocedure('clara.assert_wake_allowed(text,text)') is null
     or to_regclass('clara.wake_fn_allowlist') is null
     or to_regprocedure('clara._human_ctx(integer)') is null then
    raise exception '#1000 prestate: the wake machinery or the estate floor body is absent'
      using errcode = 'CLR10';
  end if;

  -- (0.2) THE RECUT BODY, PINNED, with the redo branch named rather than tolerated.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
    from pg_proc p where p.oid = 'clara.get_client_financial_pack(uuid,date,date)'::regprocedure;
  if v_sha = c_pack_pre then
    v_mode := 'FIRST APPLY';
  elsif position('#1000' in v_src) > 0 then
    v_mode := 'REDO';
  else
    raise exception '#1000 prestate: clara.get_client_financial_pack has DRIFTED — live sha % is neither the pinned pre-image % nor a body carrying this file''s own #1000 attribution. Re-measure before re-pinning; do not widen this check.',
      v_sha, c_pack_pre using errcode = 'CLR10';
  end if;

  -- (0.3) PARTIAL BIRTH. On a first apply neither new object exists; on a redo both do. One of
  -- each is a half-applied file and says so by name rather than being silently completed.
  select count(*)::int into v_i from (values
      ('clara._client_financial_pack_core(uuid,uuid,date,date)'),
      ('clara.wake_get_client_financial_pack(uuid,date,date)')) t(sig)
   where to_regprocedure(t.sig) is not null;
  if v_mode = 'FIRST APPLY' and v_i <> 0 then
    raise exception '#1000 prestate: partial birth — % of this file''s 2 new functions already exist while clara.get_client_financial_pack is still 0232''s own body',
      v_i using errcode = 'CLR10';
  end if;
  if v_mode = 'REDO' and v_i <> 2 then
    raise exception '#1000 prestate: partial redo — clara.get_client_financial_pack already carries this file''s attribution but only % of its 2 new functions exist',
      v_i using errcode = 'CLR10';
  end if;

  -- (0.4) THE NEIGHBOURS, UNCONDITIONALLY. A neighbour that moved is a real finding, and the
  -- integrator reads this list to find a pin another lane recut.
  for v_i in 1 .. array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[v_i][1]) is null then
      raise exception '#1000 prestate: pinned neighbour % is ABSENT', v_pins[v_i][1]
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha <> v_pins[v_i][2] then
      raise exception '#1000 prestate: pinned neighbour % has MOVED (live % expected %)',
        v_pins[v_i][1], v_sha, v_pins[v_i][2] using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1000 prestate: clean — mode %, 0232''s three doors present, 11 neighbour bodies byte-identical', v_mode;
end
$t1000_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara._client_financial_pack_core — THE ONE BODY, AND IT IS 0232'S OWN.
--
-- This is `clara.get_client_financial_pack`'s body with exactly three anchored edits (this file's
-- header, "THE ONE THING THAT MUST NOT CHANGE"): the `c record` declaration and the inline JWT
-- floor are gone, because each lane door now resolves its own caller and hands this body the
-- FIRM that caller belongs to; and the visibility test carries `and cl.firm_id = p_firm`, because
-- this body is SECURITY DEFINER and the RLS predicate its owner matches is `true`.
--
-- GRANTED TO NOBODY. Reached only from `clara.get_client_financial_pack` and
-- `clara.wake_get_client_financial_pack`, both of which are SECURITY DEFINER and both of which
-- resolve a real, live caller before they call it.
--
-- `set plan_cache_mode = force_custom_plan` travels WITH the body it was chosen for (0214:238-240):
-- the generic plan this read gets on its sixth execution is the one that measurement rejected.
-- =====================================================================================
create or replace function clara._client_financial_pack_core(
  p_firm   uuid,
  p_client uuid,
  p_as_of  date default null,
  p_month  date default null
) returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $p1000core$
declare
  v_now          timestamptz := now();
  v_today        date;
  v_as_of        date;
  v_start        date;
  v_month_end    date;
  v_watermark    text;
  v_visible      boolean;
  v_floor        date;
  v_carry_down   boolean := false;

  v_points       date[];
  v_prev_end     date;
  v_c1 bigint; v_c2 bigint; v_c3 bigint; v_c4 bigint; v_c5 bigint; v_c6 bigint;
  v_cash_lines   int := 0;
  v_set_id       uuid;
  v_set_rev      int;
  v_set_from     date;
  v_set_count    int;
  v_set_multi    boolean := false;
  v_prev_known   boolean := true;
  v_pl_prev_known boolean := true;
  v_cash_status  text;
  v_cash_cov     text;
  v_cash_reason  text;
  v_point_rows   jsonb := '[]'::jsonb;

  v_income       bigint;
  v_expense      bigint;
  v_income_p     bigint;
  v_expense_p    bigint;
  v_profit       bigint;
  v_profit_p     bigint;
  v_prev_start   date;
  v_prev_stop    date;
  v_unmarked     int := 0;
  v_unmarked_ser int := 0;
  v_pop          int := 0;
  v_pl_cov       text;
  v_pl_reason    text;
  v_pl_status    text;

  v_series       jsonb := '[]'::jsonb;
  v_series_start date;
  v_cash_comp    jsonb := '[]'::jsonb;
  v_cash_comp_n  int := 0;
  v_profit_comp  jsonb := '[]'::jsonb;
  v_profit_comp_n int := 0;
begin
  -- #1000 [0320] — THE FLOOR IS THE LANE DOOR'S, NOT THIS BODY'S, AND THE FIRM ARRIVES AS AN
  -- ARGUMENT. 0232 resolved the caller inline from request.jwt.claims (0214:262-274's three
  -- predicates) and let forced firm-scoped RLS do the tenancy. Neither is available to every
  -- lane: a machine credential carries no JWT claims at all, so the inline floor raised CLR04 on
  -- the model lane before it could read anything, and this body is SECURITY DEFINER, so the RLS
  -- predicate its owner matches is `true`. So each entrance resolves its own caller and hands
  -- this body the FIRM that caller belongs to:
  --   · `clara.get_client_financial_pack` — the human door, floored at VIEWER through
  --     `clara._human_ctx`, which raises the SAME three CLR04s this block used to raise;
  --   · `clara.wake_get_client_financial_pack` — the model lane's door, floored by the wake
  --     credential itself (`clara.wake_context` re-validates the on-behalf-of human as an ACTIVE
  --     BOOKKEEPER+ of the credential's firm on every use), which is STRICTLY ABOVE the viewer
  --     floor this body carried.
  -- This body is granted to NOBODY and is reachable only from those two definer doors (the
  -- one-ungranted-core law, 0004:6-12).

  -- A NULL CLIENT IS A CALLER DEFECT, NOT AN ANSWER (0214:276-281).
  if p_client is null then
    raise exception 'a client is required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_client')::text;
  end if;

  -- THE MONEY DATE COMES FROM THE HOUSE AUTHORITY (DECISIONS 6.4 row 1). `v_today` is the
  -- default as-of, the month anchor and the future-as-of wall -- three money dates by S5.25's own
  -- enumeration -- so it is READ from clara.book_today() (-> clara._book_today()) rather than
  -- derived here a second time. `v_now` above stays: it is `computed_at`, a sampling read of an
  -- INSTANT, and the ruling left it alone deliberately.
  v_today := clara.book_today();

  -- ==========================================================================================
  -- THE PERIOD. A future as-of is a CALLER DEFECT, never a silent clamp: "no future actuals" is
  -- a refusal, not a rounding. A month that is not a first day is the same.
  -- ==========================================================================================
  if p_month is not null then
    if p_month <> date_trunc('month', p_month)::date then
      raise exception 'a month is named by its first day' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'month_not_first_day', 'month', p_month)::text;
    end if;
    v_start     := p_month;
    v_month_end := (p_month + interval '1 month' - interval '1 day')::date;
    if p_as_of is null then
      v_as_of := least(v_month_end, v_today);
    else
      if p_as_of > v_today then
        raise exception 'an as-of in the future has no actuals' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'as_of_in_future', 'as_of', p_as_of,
                                      'today', v_today)::text;
      end if;
      if p_as_of < v_start or p_as_of > v_month_end then
        raise exception 'the as-of falls outside the named month' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'as_of_outside_month', 'as_of', p_as_of,
                                      'month', p_month)::text;
      end if;
      v_as_of := p_as_of;
    end if;
  else
    v_start     := date_trunc('month', v_today)::date;
    v_month_end := (v_start + interval '1 month' - interval '1 day')::date;
    if p_as_of is null then
      v_as_of := v_today;
    else
      if p_as_of > v_today then
        raise exception 'an as-of in the future has no actuals' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'as_of_in_future', 'as_of', p_as_of,
                                      'today', v_today)::text;
      end if;
      if p_as_of < v_start then
        raise exception 'the as-of falls outside the named month' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'as_of_outside_month', 'as_of', p_as_of,
                                      'month', v_start)::text;
      end if;
      v_as_of := p_as_of;
    end if;
  end if;

  -- SIX POINTS: five preceding month-ends plus the as-of. For a historic month the as-of IS that
  -- month's end, so the SAME expression yields six month-ends ending in the selected month.
  v_points := array[
    (date_trunc('month', v_as_of) - interval '4 months' - interval '1 day')::date,
    (date_trunc('month', v_as_of) - interval '3 months' - interval '1 day')::date,
    (date_trunc('month', v_as_of) - interval '2 months' - interval '1 day')::date,
    (date_trunc('month', v_as_of) - interval '1 month'  - interval '1 day')::date,
    (date_trunc('month', v_as_of) - interval '1 day')::date,
    v_as_of];
  v_prev_end := v_points[5];

  -- ==========================================================================================
  -- NO ORACLE, IN EITHER DIRECTION. A client outside the CALLER'S OWN FIRM and a uuid that names
  -- nothing at all answer IDENTICALLY. Anything else tells firm B that firm A holds a client with
  -- this id.
  --
  -- #1000 [0320] — THE FIRM PREDICATE IS EXPLICIT NOW, AND IT IS THE WHOLE TENANCY WALL OF THIS
  -- BODY. 0232 read this line as a plain existence test and let forced RLS scope it, which was
  -- exact for a SECURITY INVOKER read running AS a human. This body runs as its DEFINER owner,
  -- whose `p_clients_owner` policy is `true`, so the same line would see every firm's clients.
  -- Every other statement below is keyed on `p_client` and every one of them is inside the
  -- `if v_visible` arm, so this single predicate is what keeps one firm's money out of another
  -- firm's answer — and `p1000.wake.no_oracle` drives both halves of it.
  -- ==========================================================================================
  select exists (select 1 from clara.clients cl
                  where cl.id = p_client and cl.firm_id = p_firm) into v_visible;

  -- THE COVERAGE FLOOR, one expression: the earliest FINALIZED opening seed, else the earliest
  -- approved posting_date, else no floor at all (an empty population).
  if v_visible then
    select min(s.as_of) into v_floor from clara.opening_seed_registry s
     where s.client_id = p_client and s.state = 'finalized';
    if v_floor is null then
      select min(e.posting_date) into v_floor from clara.journal_entries e
       where e.client_id = p_client and e.status = 'approved';
      -- A client activated on a DEFERRED carry-down (0017:2812-2821) knowingly has no captured
      -- opening. Say so rather than letting the earliest posted entry look like inception.
      --
      -- AND `first_year_zero_opening` OUTRANKS IT, which is the estate's OWN precedence rather
      -- than a new one: `components/registers/opening-position-gate.tsx:85, :95-97` returns the
      -- first-year-zero face BEFORE it ever looks at the deferred row, because a first-year zero
      -- opening has nothing to carry down -- the opening position is KNOWN, and known to be zero.
      -- A plan can legitimately carry both rows (the rig's own legacy-activation bridge answers
      -- `first_year_zero_opening` and resolves `carry_down_deferred` together,
      -- `tests/rig-fixtures.mjs:88-96`), so a detector that asked only about the carry-down row
      -- would report an absent opening for every client whose opening is fully known.
      select exists (
        select 1 from clara.onboarding_plans pl
          join clara.onboarding_plan_items it on it.plan_id = pl.id
         where pl.client_id = p_client and it.item_key = 'carry_down_deferred'
           and it.state in ('deferred','resolved'))
        and not exists (
        select 1 from clara.onboarding_plans pl
          join clara.onboarding_plan_items it on it.plan_id = pl.id
         where pl.client_id = p_client and it.item_key = 'first_year_zero_opening'
           and it.state in ('answered','resolved')) into v_carry_down;
    end if;
  end if;

  -- THE PRECEDING MONTH-END IS EITHER KNOWABLE OR IT IS NOT, and the comparison beside the
  -- headline obeys the same answer `points[]` gives for that date.
  v_prev_known := v_floor is null or v_prev_end >= v_floor;

  -- ==========================================================================================
  -- CASH. ONE cash-set version -- the one whose window contains the as-of -- applied to ALL SIX
  -- POINTS. A trend whose membership changes between points is not a trend.
  -- ==========================================================================================
  if not v_visible then
    v_cash_status := 'unknown'; v_cash_cov := 'unknown'; v_cash_reason := 'client_not_visible';
  else
    select v.id, v.revision, v.effective_from, v.member_count
      into v_set_id, v_set_rev, v_set_from, v_set_count
      from clara.cash_account_set_versions v
     where v.client_id = p_client
       and v.effective_from <= v_as_of
       and (v.effective_to is null or v.effective_to >= v_as_of);

    -- MORE THAN ONE REVISION, OR ONLY ONE? The two shapes below say different things about a
    -- point that precedes this version's window, and only one of them is ever true.
    select count(*) > 1 into v_set_multi
      from clara.cash_account_set_versions v where v.client_id = p_client;

    if v_set_id is null then
      -- NEVER 0. "We do not know which accounts are cash" and "cash is zero" are different
      -- answers, and printing the second for the first is the expensive way to be wrong here.
      v_cash_status := 'unknown'; v_cash_cov := 'unknown'; v_cash_reason := 'cash_set_unpublished';
    else
      -- THE SINGLE PASS. Six `filter (where je.posting_date <= point_k)` aggregates over ONE scan
      -- of the member accounts' lines. See the header for the measurement that chose this shape
      -- over seven clara.trial_balance_as_of calls, and the tail for the assertions that keep it
      -- the same definition: status = 'approved' present, a posting_date <= bound present, no
      -- is_opening_balance special case, no fiscal-year reset.
      select coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[1]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[2]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[3]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[4]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[5]), 0)::bigint,
             coalesce(sum(jl.debit_cents - jl.credit_cents) filter (where je.posting_date <= v_points[6]), 0)::bigint,
             count(*)::int
        into v_c1, v_c2, v_c3, v_c4, v_c5, v_c6, v_cash_lines
        from clara.cash_account_set_members m
        join clara.coa_accounts a
          on a.account_id = m.account_id and a.client_id = p_client
        join clara.journal_lines jl
          on jl.client_id = p_client and jl.account_code = a.account_code
        join clara.journal_entries je on je.id = jl.entry_id
       where m.cash_account_set_version_id = v_set_id
         and je.status = 'approved';

      v_cash_status := 'ok'; v_cash_cov := 'ok'; v_cash_reason := null;

      -- THE TWO COVERAGE FACTS, AND WHY THIS IS THE ORDER.
      --
      -- A point outside the resolved version's window is disclosed, not silently recomputed under
      -- a different membership -- but ONLY where there are books to be wrong about. A point before
      -- the coverage floor is outside EVERY version's window by construction (a first version is
      -- stamped at the books' own start), so checking the window first would make
      -- `cash_set_version_changed_in_series` the standing answer for every client whose books are
      -- younger than six months -- and it would be FALSE there, because in those series the set
      -- never changed at all. The window check therefore asks only about points that are IN
      -- COVERAGE; `pre_coverage` carries the rest. Both facts stay visible per point either way
      -- (`points[].reason`); this is which one the GROUP names when both are true of the series.
      if v_floor is not null
         and exists (select 1 from unnest(v_points) d where d >= v_floor and d < v_set_from) then
        v_cash_cov := 'partial';
        -- AND THE SENTENCE BESIDE THE NUMBER IS THE TRUE ONE. A point inside the books but before
        -- this version's effective_from means one of two different things:
        --   · MORE THAN ONE revision exists -> the definition of cash really did CHANGE inside
        --     this trend, and an earlier point was computed under a membership the trend does not
        --     use. That is the warning this read exists to raise.
        --   · EXACTLY ONE revision exists -> nothing changed at all. The set was simply DECLARED
        --     after those months were booked, which is the ORDINARY onboarding order (publish the
        --     cash set on day one, import the client's history afterwards) and is the one case
        --     `first_version_after_books_start` cannot refuse, because at publish time there were
        --     no books to compare the date against.
        -- Naming the first when the second is true puts a permanent amber on a client whose
        -- definition never changed, which teaches readers to ignore the warning that matters.
        v_cash_reason := case when v_set_multi then 'cash_set_version_changed_in_series'
                              else 'cash_set_published_after_books_start' end;
      elsif v_floor is not null and v_points[1] < v_floor then
        v_cash_cov := 'partial'; v_cash_reason := 'pre_coverage';
      end if;
      if v_carry_down then
        v_cash_cov := 'partial'; v_cash_reason := coalesce(v_cash_reason, 'opening_carry_down_deferred');
      end if;
      -- A COMPLETE READ OVER AN EMPTY POPULATION is ok + 0 + no_posted_entries -- the one case
      -- where a reason accompanies `ok`, so the face can say "no posted entries yet for this
      -- client" instead of printing RM 0.00 as if it were a fact about the money.
      if v_cash_lines = 0 and v_cash_cov = 'ok' then
        v_cash_reason := 'no_posted_entries';
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
               'as_of',       p.d::text,
               'value_cents', case when v_floor is not null and p.d < v_floor then null
                                   else (array[v_c1, v_c2, v_c3, v_c4, v_c5, v_c6])[p.k] end,
               'available',   not (v_floor is not null and p.d < v_floor),
               'reason',      case when v_floor is not null and p.d < v_floor then 'pre_coverage'
                                   when p.d < v_set_from and v_set_multi
                                     then 'cash_set_version_changed_in_series'
                                   when p.d < v_set_from
                                     then 'cash_set_published_after_books_start'
                                   else null end) order by p.k), '[]'::jsonb)
        into v_point_rows
        from unnest(v_points) with ordinality p(d, k);

      -- COMPOSITION. Per member account, the opening / movement / closing over the SELECTED
      -- PERIOD, and the movement's own entries -- CAPPED at 20 per account and 50 accounts per
      -- group. A cumulative opening is a number, not an enumerable population; the
      -- account-filtered ledger is #670's.
      -- THE ACCOUNT LEVEL CARRIES ITS OWN `truncated` + `rows_total`, exactly as the entry level
      -- does. A table listing 50 accounts that sums to less than the headline directly above it,
      -- with nothing saying the list was cut, is the same class of silent wrongness as a
      -- fabricated zero. `count(*) over ()` is evaluated BEFORE the LIMIT, so the total costs no
      -- second pass, and the key is stripped from each row rather than repeated on all of them.
      select coalesce(jsonb_agg(to_jsonb(y) - 'rows_total' order by y.account_code), '[]'::jsonb),
             coalesce(max(y.rows_total), 0)
        into v_cash_comp, v_cash_comp_n
        from (
          select count(*) over ()::int as rows_total,
                 a.account_id    as account_id,
                 a.account_code  as account_code,
                 a.name          as name,
                 m.member_reason as member_reason,
                 q.opening       as opening_cents,
                 q.movement      as movement_cents,
                 q.closing       as closing_cents,
                 q.entries       as entries,
                 q.n             as entries_total,
                 q.n > 20        as entries_truncated
            from clara.cash_account_set_members m
            join clara.coa_accounts a on a.account_id = m.account_id and a.client_id = p_client
            -- ONE SCAN PER MEMBER ACCOUNT, three FILTERED aggregates over it. This used to be six
            -- correlated subqueries that each re-read the same account's approved lines -- on the
            -- heaviest read of the client home, polled every thirty seconds while the tab is
            -- visible. The three bounds are unchanged (< period start; within the period; <= the
            -- as-of), so the numbers are the same numbers and `p660.pack.composition_bounded`'s
            -- opening + movement = closing assertion still holds them to it.
            cross join lateral (
              select coalesce(sum(jl.debit_cents - jl.credit_cents)
                       filter (where je.posting_date < v_start), 0)::bigint as opening,
                     coalesce(sum(jl.debit_cents - jl.credit_cents)
                       filter (where je.posting_date between v_start and v_as_of), 0)::bigint as movement,
                     coalesce(sum(jl.debit_cents - jl.credit_cents), 0)::bigint as closing,
                     count(distinct je.id) filter (
                       where je.posting_date between v_start and v_as_of)::int as n,
                     coalesce((select jsonb_agg(to_jsonb(r) order by r.ord)
                                 from (select je2.id as entry_id,
                                              je2.posting_date::text as posting_date,
                                              je2.memo as memo,
                                              sum(jl2.debit_cents - jl2.credit_cents)::bigint as amount_cents,
                                              row_number() over (
                                                order by abs(sum(jl2.debit_cents - jl2.credit_cents)) desc,
                                                         je2.posting_date desc, je2.id) as ord
                                         from clara.journal_lines jl2
                                         join clara.journal_entries je2 on je2.id = jl2.entry_id
                                        where jl2.client_id = p_client
                                          and jl2.account_code = a.account_code
                                          and je2.status = 'approved'
                                          and je2.posting_date between v_start and v_as_of
                                        group by je2.id, je2.posting_date, je2.memo
                                        order by abs(sum(jl2.debit_cents - jl2.credit_cents)) desc,
                                                 je2.posting_date desc, je2.id
                                        limit 20) r), '[]'::jsonb) as entries
                from clara.journal_lines jl
                join clara.journal_entries je on je.id = jl.entry_id
               where jl.client_id = p_client and jl.account_code = a.account_code
                 and je.status = 'approved'
                 and je.posting_date <= v_as_of
            ) q
           where m.cash_account_set_version_id = v_set_id
           order by a.account_code
           limit 50) y;
    end if;
  end if;

  -- ==========================================================================================
  -- PROFIT. income = SUM(credit - debit) over account_type='income'; expense = SUM(debit -
  -- credit) over account_type='expense'; both over [period_start, as_of], approved, and
  -- EXCLUDING the estate's one closing-transfer predicate -- `not (je.is_year_end and
  -- je.closing_transfer)`, 0016:602 verbatim. Reversals and negative corrections are ordinary
  -- approved entries and move profit by their signed amount: there is no clamp anywhere in this
  -- body, which the tail asserts by the ABSENCE of any clamping function from the whole prosrc.
  -- ==========================================================================================
  if v_visible then
    v_prev_start := (date_trunc('month', v_start) - interval '1 month')::date;
    -- THE COMPARISON INTERVAL, AND IT IS TWO RULES RATHER THAN ONE (AC4).
    --
    --   · A COMPLETE MONTH -- a named historic month read to its own last day, or a month-to-date
    --     read on the last day of the month -- compares against the prior month IN FULL. Applying
    --     the elapsed-day rule here would TRUNCATE a longer predecessor to the selected month's
    --     own length (February against January drops three days; April, June, September and
    --     November drop one -- five of twelve month pairs, every year), and the SAME response's
    --     series row for that month would then contradict the comparison line beside the headline.
    --   · AN IN-PROGRESS MONTH-TO-DATE compares against the same ELAPSED stretch of the prior
    --     month, capped at that month's last day when it is shorter: 2026-03-31 MTD compares
    --     2026-02-01..2026-02-28, never a date that does not exist.
    if v_as_of >= v_month_end then
      v_prev_stop := (v_prev_start + interval '1 month' - interval '1 day')::date;
    else
      v_prev_stop := least(
        (v_prev_start + ((v_as_of - v_start) * interval '1 day'))::date,
        (v_prev_start + interval '1 month' - interval '1 day')::date);
    end if;

    select coalesce(sum(case when a.account_type = 'income'
                             then jl.credit_cents - jl.debit_cents else 0 end) filter (
                      where je.posting_date between v_start and v_as_of), 0)::bigint,
           coalesce(sum(case when a.account_type = 'expense'
                             then jl.debit_cents - jl.credit_cents else 0 end) filter (
                      where je.posting_date between v_start and v_as_of), 0)::bigint,
           coalesce(sum(case when a.account_type = 'income'
                             then jl.credit_cents - jl.debit_cents else 0 end) filter (
                      where je.posting_date between v_prev_start and v_prev_stop), 0)::bigint,
           coalesce(sum(case when a.account_type = 'expense'
                             then jl.debit_cents - jl.credit_cents else 0 end) filter (
                      where je.posting_date between v_prev_start and v_prev_stop), 0)::bigint,
           count(*) filter (where je.posting_date between v_start and v_as_of)::int
      into v_income, v_expense, v_income_p, v_expense_p, v_pop
      from clara.journal_lines jl
      join clara.journal_entries je on je.id = jl.entry_id
      join clara.coa_accounts a
        on a.client_id = jl.client_id and a.account_code = jl.account_code
     where jl.client_id = p_client
       and je.status = 'approved'
       and a.account_type in ('income','expense')
       and not (je.is_year_end and je.closing_transfer)
       and je.posting_date between v_prev_start and v_as_of;

    v_profit   := coalesce(v_income, 0) - coalesce(v_expense, 0);
    v_profit_p := coalesce(v_income_p, 0) - coalesce(v_expense_p, 0);

    -- A COMPARISON PERIOD ENTIRELY BEFORE THE COVERAGE FLOOR IS UNKNOWN, NOT ZERO -- the same
    -- rule `points[]` already applies to the cash trend, applied to the line beside the headline.
    -- "This client earned nothing in January" and "this client's books do not start until March"
    -- are different sentences, and printing the first for the second turns the whole current
    -- figure into apparent growth from nothing.
    v_pl_prev_known := v_floor is null or v_prev_stop >= v_floor;

    -- THE UNMARKED-HISTORY DETECTOR, PRECISE AND SEPARATE FROM THE EXCLUSION. An approved entry
    -- inside the period with closing_transfer = false AND either its own close_receipt_id (only
    -- finalize_close births one, 0056:3010-3024) or a reversal_of naming an entry that has one
    -- (the reopen mirror, 0120:797-814). A plain is_year_end CORRECTION trips nothing -- that is
    -- the exact error 0016:45-49 names. THE DETECTED ROWS ARE NOT ALSO EXCLUDED: a second, wider
    -- exclusion inside one read would make two reads of one ledger disagree.
    select count(*)::int into v_unmarked from clara.journal_entries e
     where e.client_id = p_client
       and e.status = 'approved'
       and e.posting_date between v_start and v_as_of
       and e.closing_transfer = false
       and (e.close_receipt_id is not null
            or exists (select 1 from clara.journal_entries o
                        where o.id = e.reversal_of and o.close_receipt_id is not null));

    if v_unmarked > 0 then
      v_pl_cov := 'partial'; v_pl_reason := 'closing_transfer_unmarked_history';
    elsif v_pop = 0 then
      v_pl_cov := 'ok'; v_pl_reason := 'no_posted_entries';
    else
      v_pl_cov := 'ok'; v_pl_reason := null;
    end if;
    v_pl_status := 'ok';

    -- SERIES: six calendar months ending in the month of the as-of, each with its own income,
    -- expense and profit. The month containing the as-of is `partial` and carries its exact
    -- as-of, so a reader can never mistake a part-month for a whole one.
    v_series_start := (date_trunc('month', v_as_of) - interval '5 months')::date;
    select coalesce(jsonb_agg(jsonb_build_object(
             'month',         m.d::date::text,
             'income_cents',  s.inc,
             'expense_cents', s.exp,
             'profit_cents',  s.inc - s.exp,
             'partial',       m.d::date = date_trunc('month', v_as_of)::date
                              and v_as_of < (m.d + interval '1 month' - interval '1 day')::date,
             'as_of',         least((m.d + interval '1 month' - interval '1 day')::date, v_as_of)::text
           ) order by m.d), '[]'::jsonb)
      into v_series
      from generate_series(v_series_start::timestamp,
                           date_trunc('month', v_as_of)::timestamp,
                           interval '1 month') m(d)
      cross join lateral (
        select coalesce(sum(case when a.account_type = 'income'
                                 then jl.credit_cents - jl.debit_cents else 0 end), 0)::bigint as inc,
               coalesce(sum(case when a.account_type = 'expense'
                                 then jl.debit_cents - jl.credit_cents else 0 end), 0)::bigint as exp
          from clara.journal_lines jl
          join clara.journal_entries je on je.id = jl.entry_id
          join clara.coa_accounts a
            on a.client_id = jl.client_id and a.account_code = jl.account_code
         where jl.client_id = p_client
           and je.status = 'approved'
           and a.account_type in ('income','expense')
           and not (je.is_year_end and je.closing_transfer)
           and je.posting_date >= m.d::date
           and je.posting_date <= least((m.d + interval '1 month' - interval '1 day')::date, v_as_of)
      ) s;

    -- THE DISCLOSURE COVERS EVERY MONTH THE CHART DRAWS, not only the selected one. An unmarked
    -- pre-0120 close is invisible to the exclusion predicate (that is the whole reason this read
    -- DISCLOSES instead of repairing), so one sitting three months back is counted into that
    -- month's bar. A disclosure scoped to the selected period alone would cover one of the six
    -- months drawn beside it and say nothing about the other five.
    select count(*)::int into v_unmarked_ser from clara.journal_entries e
     where e.client_id = p_client
       and e.status = 'approved'
       and e.posting_date between v_series_start and v_as_of
       and e.closing_transfer = false
       and (e.close_receipt_id is not null
            or exists (select 1 from clara.journal_entries o
                        where o.id = e.reversal_of and o.close_receipt_id is not null));

    -- PROFIT COMPOSITION: per income/expense account over the selected period, with its capped
    -- movement entries. Each entry row is what the browser addresses as ?entry=<id>.
    select coalesce(jsonb_agg(to_jsonb(y) - 'rows_total' order by y.account_code), '[]'::jsonb),
           coalesce(max(y.rows_total), 0)
      into v_profit_comp, v_profit_comp_n
      from (
        select count(*) over ()::int as rows_total,
               a.account_id   as account_id,
               a.account_code as account_code,
               a.name         as name,
               a.account_type as account_type,
               0::bigint      as opening_cents,
               q.movement     as movement_cents,
               q.movement     as closing_cents,
               q.entries      as entries,
               q.n            as entries_total,
               q.n > 20       as entries_truncated
          from clara.coa_accounts a
          cross join lateral (
            select coalesce(sum(case when a.account_type = 'income'
                                     then jl.credit_cents - jl.debit_cents
                                     else jl.debit_cents - jl.credit_cents end), 0)::bigint as movement,
                   count(distinct je.id)::int as n,
                   coalesce((select jsonb_agg(to_jsonb(r) order by r.ord)
                               from (select je2.id as entry_id,
                                            je2.posting_date::text as posting_date,
                                            je2.memo as memo,
                                            sum(case when a.account_type = 'income'
                                                     then jl2.credit_cents - jl2.debit_cents
                                                     else jl2.debit_cents - jl2.credit_cents end)::bigint
                                              as amount_cents,
                                            row_number() over (
                                              order by abs(sum(jl2.debit_cents - jl2.credit_cents)) desc,
                                                       je2.posting_date desc, je2.id) as ord
                                       from clara.journal_lines jl2
                                       join clara.journal_entries je2 on je2.id = jl2.entry_id
                                      where jl2.client_id = p_client
                                        and jl2.account_code = a.account_code
                                        and je2.status = 'approved'
                                        and not (je2.is_year_end and je2.closing_transfer)
                                        and je2.posting_date between v_start and v_as_of
                                      group by je2.id, je2.posting_date, je2.memo
                                      order by abs(sum(jl2.debit_cents - jl2.credit_cents)) desc,
                                               je2.posting_date desc, je2.id
                                      limit 20) r), '[]'::jsonb) as entries
              from clara.journal_lines jl
              join clara.journal_entries je on je.id = jl.entry_id
             where jl.client_id = p_client and jl.account_code = a.account_code
               and je.status = 'approved'
               and not (je.is_year_end and je.closing_transfer)
               and je.posting_date between v_start and v_as_of
          ) q
         where a.client_id = p_client
           and a.account_type in ('income','expense')
           and q.n > 0
         order by a.account_code
         limit 50) y;
  else
    v_pl_status := 'unknown'; v_pl_cov := 'unknown'; v_pl_reason := 'client_not_visible';
  end if;

  -- THE SOURCE WATERMARK. A pg_snapshot in text form, taken in this read's own statement, so a
  -- consumer can ask pg_visible_in_snapshot(<a mutation's xid>, this) -- "had this read already
  -- seen you?". A timestamp cannot answer that (0057:390-396 is the shape, and its CHECK regex is
  -- asserted by a cell).
  select pg_current_snapshot()::text into v_watermark;

  return jsonb_build_object(
    'computed_at', v_now,
    'client_id',   p_client,
    'period',      jsonb_build_object(
                     'start',    v_start::text,
                     'end',      v_month_end::text,
                     'as_of',    v_as_of::text,
                     'month',    date_trunc('month', v_as_of)::date::text,
                     'is_mtd',   p_month is null,
                     'timezone', 'Asia/Kuala_Lumpur'),
    'coverage_floor', v_floor::text,

    -- FOUR FACES OF ONE ENVELOPE. Each figure group carries the same ten fields, so no number can
    -- ever reach a screen without its unit, its currency, its period, the instant it was
    -- computed, the definition it was computed under, the snapshot it saw and what it could not
    -- cover.
    'cash', jsonb_build_object(
      'value_cents',        case when v_cash_status = 'ok' then v_c6 else null end,
      'status',             v_cash_status,
      'unit',               'minor_units',
      'currency',           'MYR',
      'period',             jsonb_build_object('start', v_start::text, 'end', v_month_end::text,
                                               'as_of', v_as_of::text,
                                               'timezone', 'Asia/Kuala_Lumpur'),
      'computed_at',        v_now,
      'definition_version', 'clara.client-financial-pack/v1',
      'source_watermark',   v_watermark,
      'coverage',           v_cash_cov,
      'coverage_reason',    v_cash_reason,
      -- THE COMPARISON LIVES HERE, ONCE. The browser recomputes none of it, and #669's tiles
      -- inherit the same three rules rather than re-deriving them.
      --
      -- AND IT OBEYS THE SAME AVAILABILITY AS `points[]`. The preceding month-end of a client
      -- whose books start this month is BEFORE the coverage floor: the trend point for that date
      -- already says `available:false, value_cents:null, reason:'pre_coverage'`, and a comparison
      -- asserting "against RM 0.00" for the same date would make ONE read say two different
      -- things about ONE date -- and would print the whole balance as growth from nothing.
      'comparison',         case when v_cash_status <> 'ok' then null else jsonb_build_object(
                              'value_cents', case when v_prev_known then v_c5 else null end,
                              'delta_cents', case when v_prev_known then v_c6 - v_c5 else null end,
                              'delta_pct',   case when not v_prev_known or v_c5 = 0 then null
                                             else round(((v_c6 - v_c5)::numeric / abs(v_c5)) * 100, 2) end,
                              'sign_change', v_prev_known and v_c6 <> 0 and v_c5 <> 0
                                             and sign(v_c6) <> sign(v_c5),
                              'available',   v_prev_known,
                              'reason',      case when v_prev_known then null else 'pre_coverage' end,
                              'period', jsonb_build_object('start', v_prev_end::text,
                                                           'end', v_prev_end::text)) end,
      'set',                case when v_set_id is null then null else jsonb_build_object(
                              'version_id',            v_set_id,
                              'revision',              v_set_rev,
                              'effective_from',        v_set_from::text,
                              'member_count',          v_set_count,
                              'applied_to_all_points', true) end,
      'points',             v_point_rows,
      'composition',        v_cash_comp,
      'composition_total',  v_cash_comp_n,
      'composition_truncated', v_cash_comp_n > 50),

    'profit', jsonb_build_object(
      'value_cents',        case when v_pl_status = 'ok' then v_profit else null end,
      'status',             v_pl_status, 'unit', 'minor_units', 'currency', 'MYR',
      'period',             jsonb_build_object('start', v_start::text, 'end', v_month_end::text,
                                               'as_of', v_as_of::text,
                                               'timezone', 'Asia/Kuala_Lumpur'),
      'computed_at',        v_now,
      'definition_version', 'clara.client-financial-pack/v1',
      'source_watermark',   v_watermark,
      'coverage',           v_pl_cov, 'coverage_reason', v_pl_reason,
      'comparison',         case when v_pl_status <> 'ok' then null else jsonb_build_object(
                              'value_cents', case when v_pl_prev_known then v_profit_p else null end,
                              'delta_cents', case when v_pl_prev_known then v_profit - v_profit_p else null end,
                              'delta_pct',   case when not v_pl_prev_known or v_profit_p = 0 then null
                                             else round(((v_profit - v_profit_p)::numeric
                                                         / abs(v_profit_p)) * 100, 2) end,
                              'sign_change', v_pl_prev_known and v_profit <> 0 and v_profit_p <> 0
                                             and sign(v_profit) <> sign(v_profit_p),
                              'available',   v_pl_prev_known,
                              'reason',      case when v_pl_prev_known then null
                                                  else 'pre_coverage' end,
                              'period', jsonb_build_object('start', v_prev_start::text,
                                                           'end', v_prev_stop::text)) end,
      -- THE COMPOSITION LIVES IN THE GROUP IT IS ABOUT, beside the cash group's own. A top-level
      -- spelling is a key no consumer of the ENVELOPE can reach: the browser hydrates each figure
      -- group through one parser (`apps/web/lib/dashboard/financial-pack.ts`), so a composition
      -- outside the group hydrates to nothing and the drilldown under the chart renders nothing
      -- at all -- against the real door, while a hand-written fixture keeps its cell green.
      'composition',        v_profit_comp,
      'composition_total',  v_profit_comp_n,
      'composition_truncated', v_profit_comp_n > 50),

    'income', jsonb_build_object(
      'value_cents',        case when v_pl_status = 'ok' then v_income else null end,
      'status',             v_pl_status, 'unit', 'minor_units', 'currency', 'MYR',
      'period',             jsonb_build_object('start', v_start::text, 'end', v_month_end::text,
                                               'as_of', v_as_of::text,
                                               'timezone', 'Asia/Kuala_Lumpur'),
      'computed_at',        v_now,
      'definition_version', 'clara.client-financial-pack/v1',
      'source_watermark',   v_watermark,
      'coverage',           v_pl_cov, 'coverage_reason', v_pl_reason,
      'comparison',         case when v_pl_status <> 'ok' then null else jsonb_build_object(
                              'value_cents', case when v_pl_prev_known then v_income_p else null end,
                              'delta_cents', case when v_pl_prev_known then v_income - v_income_p else null end,
                              'delta_pct',   case when not v_pl_prev_known or v_income_p = 0 then null
                                             else round(((v_income - v_income_p)::numeric
                                                         / abs(v_income_p)) * 100, 2) end,
                              'sign_change', v_pl_prev_known and v_income <> 0 and v_income_p <> 0
                                             and sign(v_income) <> sign(v_income_p),
                              'available',   v_pl_prev_known,
                              'reason',      case when v_pl_prev_known then null
                                                  else 'pre_coverage' end,
                              'period', jsonb_build_object('start', v_prev_start::text,
                                                           'end', v_prev_stop::text)) end),

    'expense', jsonb_build_object(
      'value_cents',        case when v_pl_status = 'ok' then v_expense else null end,
      'status',             v_pl_status, 'unit', 'minor_units', 'currency', 'MYR',
      'period',             jsonb_build_object('start', v_start::text, 'end', v_month_end::text,
                                               'as_of', v_as_of::text,
                                               'timezone', 'Asia/Kuala_Lumpur'),
      'computed_at',        v_now,
      'definition_version', 'clara.client-financial-pack/v1',
      'source_watermark',   v_watermark,
      'coverage',           v_pl_cov, 'coverage_reason', v_pl_reason,
      'comparison',         case when v_pl_status <> 'ok' then null else jsonb_build_object(
                              'value_cents', case when v_pl_prev_known then v_expense_p else null end,
                              'delta_cents', case when v_pl_prev_known then v_expense - v_expense_p else null end,
                              'delta_pct',   case when not v_pl_prev_known or v_expense_p = 0 then null
                                             else round(((v_expense - v_expense_p)::numeric
                                                         / abs(v_expense_p)) * 100, 2) end,
                              'sign_change', v_pl_prev_known and v_expense <> 0 and v_expense_p <> 0
                                             and sign(v_expense) <> sign(v_expense_p),
                              'available',   v_pl_prev_known,
                              'reason',      case when v_pl_prev_known then null
                                                  else 'pre_coverage' end,
                              'period', jsonb_build_object('start', v_prev_start::text,
                                                           'end', v_prev_stop::text)) end),

    'series',             v_series,
    'unmarked_closing_entries', v_unmarked,
    -- THE SIX MONTHS THE CHART DRAWS, DISCLOSED AS ONE FACT. `unmarked_closing_entries` is about
    -- the SELECTED period; this pair is about the whole series beside it, so a bar three months
    -- back carrying an unmarked pre-0120 close is not silently drawn as if it were clean.
    'unmarked_closing_entries_series', v_unmarked_ser,
    'series_coverage_reason', case when v_unmarked_ser > 0
                                   then 'closing_transfer_unmarked_history' else null end,
    -- NOT A FIGURE GROUP, AND DELIBERATELY SO. Receivables and payables are #669's tiles over
    -- this same envelope; a bank STATEMENT balance is #657/#675's and is a third party's claim
    -- about an account rather than this ledger's. Neither is aggregated here, and the tail
    -- asserts that no statement relation is read at all.
    'excluded_by_design', jsonb_build_array('receivable','payable','statement_balance'));
end $p1000core$;

comment on function clara._client_financial_pack_core(uuid, uuid, date, date) is
  '#1000 [0320]. THE ONE BODY behind the client home''s money band, and it is #660''s own: '
  'clara.get_client_financial_pack''s body with exactly three anchored edits -- the c record '
  'declaration and the inline JWT floor removed (each lane door resolves its own caller and hands '
  'this body that caller''s FIRM), and the visibility test carrying `and cl.firm_id = p_firm` '
  '(this body is SECURITY DEFINER and the RLS predicate its owner matches is `true`, so the firm '
  'wall has to be written down). No figure, coverage word, envelope key or refusal code moved, '
  'and 0320''s tail proves it by REVERSING the three edits on this live body and hashing the '
  'result against the pinned pre-image. GRANTED TO NOBODY (0004:6-12): reached only from '
  'clara.get_client_financial_pack (human, VIEWER floor through clara._human_ctx) and '
  'clara.wake_get_client_financial_pack (model lane, BOOKKEEPER+ floor carried by the wake '
  'credential itself).';

-- =====================================================================================
-- §B — clara.get_client_financial_pack — RECUT: THE HUMAN LANE'S OWN AUDITED DOOR.
--
-- SAME SIGNATURE, SAME DEFAULTS, SAME RETURN TYPE, SAME ACL, SAME ENVELOPE, SAME REFUSALS. What
-- changes is that the body it used to carry is now the core's, and the three CLR04s it used to
-- raise inline are raised by `clara._human_ctx`, which IS the estate's one floor body and raises
-- them with the same messages and the same errcode.
--
-- SECURITY INVOKER -> SECURITY DEFINER, and the reason is the one-ungranted-core law rather than
-- a widening: the core is granted to nobody, so only a definer body can reach it. The tenancy
-- this door used to get from forced RLS is now the core's explicit `firm_id = p_firm` predicate,
-- and `p_firm` is `clara._human_ctx`'s own answer for THIS caller -- the same live active
-- membership `clara.jwt_firm()` read. A caller with no membership never reaches the core at all.
-- =====================================================================================
create or replace function clara.get_client_financial_pack(
  p_client uuid,
  p_as_of  date default null,
  p_month  date default null
) returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare
  h record;
begin
  -- THE FLOOR, at VIEWER rank, unchanged in effect and now stated once for the whole estate.
  -- clara._human_ctx raises 'no authenticated actor', 'actor has no active membership' and
  -- 'insufficient role', each CLR04, in that order -- which is what this door's own inline block
  -- raised before #1000, because that block was written from the same three predicates.
  select * into h from clara._human_ctx(clara.role_rank('viewer'));
  return clara._client_financial_pack_core(h.firm, p_client, p_as_of, p_month);
end $$;

comment on function clara.get_client_financial_pack(uuid, date, date) is
  '#660 B2, recut by #1000 [0320]. The client home''s money band as ONE read: BOOK CASH over a '
  'governed, versioned CASH ACCOUNT SET and PERIOD PROFIT / income / expense over the approved '
  'ledger, each with the same ten-field envelope, six points of history and its own comparison. '
  'The computation is clara._client_financial_pack_core''s -- ONE definition, two entrances -- and '
  'this door is the HUMAN entrance: floored at VIEWER through clara._human_ctx (CLR04 for no '
  'actor, no active membership or an insufficient role) and granted to clara_authenticated alone. '
  'clara_runtime, clara_agent_ro and every clara_wake_* role still hold NOTHING on it; the model '
  'lane''s entrance is clara.wake_get_client_financial_pack, its own audited door.';

-- =====================================================================================
-- §C — clara.wake_get_client_financial_pack — THE MODEL LANE'S OWN AUDITED DOOR.
--
-- The shape is `clara.wake_list_binding_candidates` (0154:2296-2307): resolve the wake context,
-- refuse without a credential, ask the allowlist, then delegate. Three differences, each stated:
--
--   · IT REQUIRES AN on_behalf_of. This read is a person's read of a client's money; an
--     unattended lane has no person whose firm and standing it could ride. `close_prep`,
--     `autodraft` and `bank_agent` credentials forbid `on_behalf_of` by construction
--     (0138:827-830), so this refusal is what they would meet even if a future file allowlisted
--     them by mistake.
--   · IT CARRIES THE CREDENTIAL'S CLIENT PIN when there is one. The one allowlisted kind today is
--     `interactive`, whose `client_id` is NULL by construction, so this arm is DORMANT and the
--     tail pins that it is (exactly one allowlist row, for `interactive`). It is written anyway
--     because the bank wrappers carry it for the pinned kinds (0121/0130) and a later file that
--     allowlists `interactive_client` must not have to remember to add a wall.
--   · IT ADDS NO FLOOR OF ITS OWN, and that is a measurement rather than an omission.
--     `clara.wake_context` only returns a row when the credential's `on_behalf_of` is an ACTIVE
--     BOOKKEEPER+ of the credential's firm, and `clara.mint_wake_credential` refuses to mint one
--     below that rank at all (CLR10 `authority_lost`). The read's own floor is VIEWER, so a
--     viewer-rank re-check here could never fire; the tail and `p1000.wake.floor_is_the_credential`
--     DRIVE the bookkeeper floor instead of restating it.
-- =====================================================================================
create or replace function clara.wake_get_client_financial_pack(
  p_client uuid,
  p_as_of  date default null,
  p_month  date default null
) returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare
  w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_get_client_financial_pack');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03',
        detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;
  -- DORMANT TODAY (see §C's header): `interactive` credentials carry no client pin.
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'that is not the client this credential is pinned to' using errcode = 'CLR11',
      detail = '{"reason":"credential_client_pin"}';
  end if;
  return clara._client_financial_pack_core(w.firm_id, p_client, p_as_of, p_month);
end $$;

comment on function clara.wake_get_client_financial_pack(uuid, date, date) is
  '#1000 [0320]. The MODEL LANE''s entrance to the client home''s money band: the same '
  'clara._client_financial_pack_core the human door calls, reached under a wake credential '
  'instead of a JWT. EXECUTE to clara_agent_ro alone -- the role the chat lane''s read pool SET '
  'ROLEs to -- and ONE clara.wake_fn_allowlist row, for the `interactive` kind. The floor is the '
  'credential''s own and is STRICTLY ABOVE the read''s: clara.wake_context re-validates the '
  'on_behalf_of human as an ACTIVE BOOKKEEPER+ of the credential''s firm on every use, while the '
  'read itself is floored at VIEWER. It computes nothing: every figure, coverage word and refusal '
  'is the core''s, so this lane can never disagree with the client home about the same inputs.';

reset role;

-- =====================================================================================
-- §D — ACL + THE ALLOWLIST. The complete delta on the machine side: ONE execute, ONE row.
-- =====================================================================================
-- The core: nobody. `create or replace` preserves an ACL, so this REVOKE is what makes a redo
-- over a hand-granted core close it again.
revoke all on function clara._client_financial_pack_core(uuid,uuid,date,date) from public;

-- The human door: restated rather than assumed. `create or replace` preserved 0232's grant, and
-- restating it here means the tail's has_function_privilege read is proving a line this file owns.
revoke all on function clara.get_client_financial_pack(uuid,date,date) from public;
grant execute on function clara.get_client_financial_pack(uuid,date,date) to clara_authenticated;

-- The model lane's door: the read role, and no other. NOT clara_runtime (the act lane has no
-- business reading a client's money band), NOT clara_wake_interactive (the write pool COMMITs;
-- this is a read and it runs read-only), NOT clara_authenticated (a human has their own door).
revoke all on function clara.wake_get_client_financial_pack(uuid,date,date) from public;
grant execute on function clara.wake_get_client_financial_pack(uuid,date,date) to clara_agent_ro;

-- ONE KIND. `interactive` is what `readScoped` mints (plain, OBO the initiating human, no client
-- pin) in `packages/runtime/workflows/chatTurn.v13.infra.ts`. `interactive_client` is deliberately
-- NOT allowlisted: this read needs no client pin, and an unpinned credential is the narrower of
-- the two here because the client arrives as an argument the core scopes against the firm.
insert into clara.wake_fn_allowlist(wake_kind, function_name)
  values ('interactive', 'wake_get_client_financial_pack')
  on conflict (wake_kind, function_name) do nothing;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- A tail that only says OK has proven nothing (.claude/rules/db-migrations.md).
-- =====================================================================================
do $t1000_tail$
declare
  v_n int; v_bad text; v_src text; v_back text; v_sha text; v_row record; v_probe text;
  c_pack_pre constant text :=
    'c846768d0d114a3bf38d90a437bdd65731f4a3cbc64a7ecd3edc72cb6b788f1e';

  -- THE THREE ANCHORED EDITS, as pairs, so the proof below can undo them. These are the whole
  -- difference between #660's read and #1000's core, written out where a reviewer reads them.
  c_a_old constant text := E'  c              record;\n';

  c_b_old constant text := $b_old$  -- THE INLINE FLOOR at VIEWER rank (0214:262-274's three predicates). See the header: every
  -- relation below is already table-SELECT-granted to the whole clara_authenticated role behind a
  -- FIRM-ONLY RLS predicate (0003:514, :522-525), so this read returns nothing a viewer could not
  -- already SELECT.
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('viewer') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;
$b_old$;

  c_b_new constant text := $b_new$  -- #1000 [0320] — THE FLOOR IS THE LANE DOOR'S, NOT THIS BODY'S, AND THE FIRM ARRIVES AS AN
  -- ARGUMENT. 0232 resolved the caller inline from request.jwt.claims (0214:262-274's three
  -- predicates) and let forced firm-scoped RLS do the tenancy. Neither is available to every
  -- lane: a machine credential carries no JWT claims at all, so the inline floor raised CLR04 on
  -- the model lane before it could read anything, and this body is SECURITY DEFINER, so the RLS
  -- predicate its owner matches is `true`. So each entrance resolves its own caller and hands
  -- this body the FIRM that caller belongs to:
  --   · `clara.get_client_financial_pack` — the human door, floored at VIEWER through
  --     `clara._human_ctx`, which raises the SAME three CLR04s this block used to raise;
  --   · `clara.wake_get_client_financial_pack` — the model lane's door, floored by the wake
  --     credential itself (`clara.wake_context` re-validates the on-behalf-of human as an ACTIVE
  --     BOOKKEEPER+ of the credential's firm on every use), which is STRICTLY ABOVE the viewer
  --     floor this body carried.
  -- This body is granted to NOBODY and is reachable only from those two definer doors (the
  -- one-ungranted-core law, 0004:6-12).
$b_new$;

  c_c_old constant text := $c_old$  -- ==========================================================================================
  -- NO ORACLE, IN EITHER DIRECTION. A client this caller cannot see under RLS and a uuid that
  -- names nothing at all answer IDENTICALLY. Anything else tells firm B that firm A holds a
  -- client with this id.
  -- ==========================================================================================
  select exists (select 1 from clara.clients cl where cl.id = p_client) into v_visible;
$c_old$;

  c_c_new constant text := $c_new$  -- ==========================================================================================
  -- NO ORACLE, IN EITHER DIRECTION. A client outside the CALLER'S OWN FIRM and a uuid that names
  -- nothing at all answer IDENTICALLY. Anything else tells firm B that firm A holds a client with
  -- this id.
  --
  -- #1000 [0320] — THE FIRM PREDICATE IS EXPLICIT NOW, AND IT IS THE WHOLE TENANCY WALL OF THIS
  -- BODY. 0232 read this line as a plain existence test and let forced RLS scope it, which was
  -- exact for a SECURITY INVOKER read running AS a human. This body runs as its DEFINER owner,
  -- whose `p_clients_owner` policy is `true`, so the same line would see every firm's clients.
  -- Every other statement below is keyed on `p_client` and every one of them is inside the
  -- `if v_visible` arm, so this single predicate is what keeps one firm's money out of another
  -- firm's answer — and `p1000.wake.no_oracle` drives both halves of it.
  -- ==========================================================================================
  select exists (select 1 from clara.clients cl
                  where cl.id = p_client and cl.firm_id = p_firm) into v_visible;
$c_new$;
begin
  -- (1) THE THREE NAMES RESOLVE AT EXACTLY ONE pg_proc ROW EACH. No overload was shadowed into
  --     existence and the recut replaced rather than added.
  select string_agg(format('%s x%s', t.n, coalesce(k.c, 0)), ', ' order by t.n) into v_bad
    from (values ('_client_financial_pack_core'), ('get_client_financial_pack'),
                 ('wake_get_client_financial_pack')) t(n)
    left join lateral (select count(*)::int c from pg_proc p
                         join pg_namespace ns on ns.oid = p.pronamespace
                        where ns.nspname = 'clara' and p.proname = t.n) k on true
   where coalesce(k.c, 0) <> 1;
  if v_bad is not null then
    raise exception '#1000 tail: function name(s) do not resolve at exactly one pg_proc row: %',
      v_bad using errcode = 'CLR10';
  end if;

  -- (2) POSTURE, read from the catalog. All three are STABLE SECURITY DEFINER owned by
  --     clara_fn_owner, and all three carry BOTH the search_path pin and the plan_cache_mode the
  --     measurement in 0232's header chose.
  for v_row in
    select p.oid::regprocedure::text as sig, p.prosecdef, p.provolatile,
           pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}'::text[]) as cfg
      from pg_proc p
     where p.oid in ('clara._client_financial_pack_core(uuid,uuid,date,date)'::regprocedure,
                     'clara.get_client_financial_pack(uuid,date,date)'::regprocedure,
                     'clara.wake_get_client_financial_pack(uuid,date,date)'::regprocedure)
  loop
    if not v_row.prosecdef or v_row.provolatile <> 's' or v_row.owner <> 'clara_fn_owner'
       or not (v_row.cfg @> array['search_path=clara, pg_temp'])
       or not (v_row.cfg @> array['plan_cache_mode=force_custom_plan']) then
      raise exception '#1000 tail: % has the wrong posture (secdef=% volatile=% owner=% cfg=%)',
        v_row.sig, v_row.prosecdef, v_row.provolatile, v_row.owner, v_row.cfg
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (3) THE PROOF THIS WHOLE FILE RESTS ON: the live core, with its three edits REVERSED, IS
  --     0232's body. Not "looks like", not "was copied from" -- hashes to the pinned pre-image.
  --     A single changed digit anywhere in 720 lines of accounting arithmetic fails here.
  select p.prosrc into v_src
    from pg_proc p where p.oid = 'clara._client_financial_pack_core(uuid,uuid,date,date)'::regprocedure;
  if (length(v_src) - length(replace(v_src, c_c_new, ''))) / length(c_c_new) <> 1 then
    raise exception '#1000 tail: the core does not carry edit C (the explicit firm predicate) exactly once'
      using errcode = 'CLR10';
  end if;
  if (length(v_src) - length(replace(v_src, c_b_new, ''))) / length(c_b_new) <> 1 then
    raise exception '#1000 tail: the core does not carry edit B (the floor note) exactly once'
      using errcode = 'CLR10';
  end if;
  v_back := replace(replace(v_src, c_c_new, c_c_old), c_b_new, c_b_old);
  -- Edit A is a DELETION, so its reversal is an insertion at the one place it was removed from.
  if (length(v_back) - length(replace(v_back, E'declare\n  v_now', ''))) / length(E'declare\n  v_now') <> 1 then
    raise exception '#1000 tail: cannot locate edit A''s removal site in the core'
      using errcode = 'CLR10';
  end if;
  v_back := replace(v_back, E'declare\n  v_now', E'declare\n' || c_a_old || '  v_now');
  v_sha := encode(sha256(convert_to(v_back, 'UTF8')), 'hex');
  if v_sha <> c_pack_pre then
    raise exception '#1000 tail: THE COMPUTATION MOVED. Reversing the three anchored edits on clara._client_financial_pack_core yields sha %, not 0232''s pinned body %. No figure in this read may change in this file.',
      v_sha, c_pack_pre using errcode = 'CLR10';
  end if;

  -- (4) THE HUMAN DOOR IS NOW A DELEGATE, and carries no computation of its own. Line comments
  --     are stripped first, so a comment that merely NAMES a relation cannot satisfy a presence
  --     probe (0232's own idiom).
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p where p.oid = 'clara.get_client_financial_pack(uuid,date,date)'::regprocedure;
  if position('clara._client_financial_pack_core(' in v_src) = 0
     or position('clara._human_ctx(' in v_src) = 0 then
    raise exception '#1000 tail: the human door does not route through the floor body and the core'
      using errcode = 'CLR10';
  end if;
  foreach v_probe in array array['clara.clients', 'clara.journal_lines', 'clara.journal_entries',
                                 'clara.cash_account_set_members', 'jwt_sub', 'jwt_firm'] loop
    if position(v_probe in v_src) > 0 then
      raise exception '#1000 tail: the human door still carries % -- it must delegate, not compute',
        v_probe using errcode = 'CLR10';
    end if;
  end loop;

  -- (5) THE CORE IS GRANTED TO NOBODY. Every clara% role except its own owner is refused, read
  --     one by one BY NAME rather than by counting.
  for v_row in select rolname from pg_roles where rolname like 'clara%' and rolname <> 'clara_fn_owner' order by 1 loop
    if has_function_privilege(v_row.rolname,
        'clara._client_financial_pack_core(uuid,uuid,date,date)', 'EXECUTE') then
      raise exception '#1000 tail: % holds EXECUTE on the ungranted core', v_row.rolname
        using errcode = 'CLR10';
    end if;
  end loop;
  if has_function_privilege('public', 'clara._client_financial_pack_core(uuid,uuid,date,date)', 'EXECUTE') then
    raise exception '#1000 tail: PUBLIC holds EXECUTE on the ungranted core' using errcode = 'CLR10';
  end if;

  -- (6) THE MODEL LANE'S DOOR IS clara_agent_ro's AND NOBODY ELSE'S.
  for v_row in select rolname from pg_roles where rolname like 'clara%'
               and rolname not in ('clara_fn_owner', 'clara_agent_ro') order by 1 loop
    if has_function_privilege(v_row.rolname,
        'clara.wake_get_client_financial_pack(uuid,date,date)', 'EXECUTE') then
      raise exception '#1000 tail: % holds EXECUTE on the model lane''s door; only clara_agent_ro may',
        v_row.rolname using errcode = 'CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_agent_ro',
      'clara.wake_get_client_financial_pack(uuid,date,date)', 'EXECUTE') then
    raise exception '#1000 tail: clara_agent_ro cannot execute the door this file exists to give it'
      using errcode = 'CLR10';
  end if;

  -- (7) 0232's POSTURE, RE-MEASURED RATHER THAN TRANSCRIBED (the cut plan's own "Watch" for this
  --     ticket). All three #660 doors stay clara_authenticated-only; the model lane gains nothing
  --     on any of them, and the login roles gain nothing anywhere.
  for v_row in
    select d.sig, r.rolname
      from (values ('clara.get_client_financial_pack(uuid,date,date)'),
                   ('clara.propose_client_cash_accounts(uuid)'),
                   ('clara.publish_client_cash_account_set(uuid,jsonb,date,text)')) d(sig)
      cross join (select rolname from pg_roles
                   where rolname in ('clara_runtime', 'clara_agent_ro')
                      or rolname like 'clara\_wake\_%') r
  loop
    if has_function_privilege(v_row.rolname, v_row.sig, 'EXECUTE') then
      raise exception '#1000 tail: % now holds EXECUTE on % -- 0232''s posture was widened',
        v_row.rolname, v_row.sig using errcode = 'CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_authenticated',
      'clara.get_client_financial_pack(uuid,date,date)', 'EXECUTE') then
    raise exception '#1000 tail: the human door lost its clara_authenticated grant'
      using errcode = 'CLR10';
  end if;

  -- (8) ONE ALLOWLIST ROW, ONE KIND. The dormant client-pin arm in §C is dormant because of this.
  select count(*)::int into v_n from clara.wake_fn_allowlist
   where function_name = 'wake_get_client_financial_pack';
  if v_n <> 1 then
    raise exception '#1000 tail: the new door has % allowlist rows, expected exactly 1', v_n
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.wake_fn_allowlist
                  where function_name = 'wake_get_client_financial_pack' and wake_kind = 'interactive') then
    raise exception '#1000 tail: the new door''s single allowlist row is not for the `interactive` kind'
      using errcode = 'CLR10';
  end if;

  -- (9) BEHAVIOUR, DRIVEN. A session with no wake secret is refused CLR03 by the model lane's
  --     door, and clara_agent_ro is refused 42501 on the core it must never reach directly. Both
  --     run inside a subtransaction whose role change is rolled back with it.
  begin
    perform clara.wake_get_client_financial_pack(gen_random_uuid());
    raise exception '#1000 tail: the model lane''s door answered WITHOUT a wake credential'
      using errcode = 'CLR10';
  exception
    when sqlstate 'CLR03' then null;
  end;
  begin
    perform set_config('role', 'clara_agent_ro', true);
    begin
      perform clara._client_financial_pack_core(gen_random_uuid(), gen_random_uuid());
      v_probe := 'answered';
    exception
      when insufficient_privilege then v_probe := 'refused';
    end;
    perform set_config('role', 'none', true);
  end;
  if v_probe <> 'refused' then
    raise exception '#1000 tail: clara_agent_ro reached the ungranted core directly (%)', v_probe
      using errcode = 'CLR10';
  end if;

  raise notice '#1000 tail: OK -- clara._client_financial_pack_core is 0232''s body with exactly three reversible edits (proved by hash), the human door is a VIEWER-floored delegate that still belongs to clara_authenticated alone, clara.wake_get_client_financial_pack is clara_agent_ro''s alone with ONE `interactive` allowlist row, the core is granted to nobody and refuses clara_agent_ro directly, and #660''s three doors gained no machine-lane grant.';
end
$t1000_tail$;
