-- FS-4 checkout gate, PR C-6 (apps/web): the TWO reads the entry faces cannot be built truthfully
-- without, plus the one plan column design part 3 §2 requires and `0163` did not carry.
-- UNNUMBERED at authoring; the number is claimed at merge prep under 裁-108, and it MUST sort
-- after `0163_checkout_gate_c3_folded_door.sql` — every object below depends on C-3's.
--
-- WHY A MIGRATION IS IN A FRONTEND PR AT ALL. Two facts design part 1 §2.1 and part 3 §2 require
-- the browser to render are, as C-3 shipped, unreachable from `apps/web` — measured, not assumed:
--
--   1. `checkout_intents` and `firm_registration_payments` are `force row level security` with a
--      single `clara_fn_owner` policy and ZERO application-role grants (part 2 §1's blanket law
--      for every new table on this train). So `/pending`'s `checkout_open` and `paid` arms — the
--      two 裁-74 states — can never be observed over PostgREST as `clara_authenticated`. This is
--      permanent by design, not a landing gap; `apps/web/lib/registration/checkout-progress-
--      reads.ts` records the measurement and names this door as the future shape
--      ("a narrow SECURITY DEFINER read door exposing the applicant's OWN registration
--      progress ... to be built when Lane B wires /pending for real"). This is that door.
--   2. `clara.billing_plans` carries `amount_cents` and `amounts_ruled` but NO
--      `payment_method_collection`, and `open_checkout_intent` returns only
--      `{intent_id, price_local_key, stripe_price_id}` — no amount. Design part 3 §2 rules the
--      Checkout Session's `payment_method_collection` "read from the plan row" (G13 / 裁-88), and
--      `apps/web` has no lawful way to read it. Omitting it is NOT neutral: Stripe's own default
--      is `'always'`, which is precisely the arm the design rejects at RM0 in test mode ("a real
--      beta customer would otherwise be asked for a card in TEST mode, i.e. a test card, to open
--      a real firm").
--
-- THE SEEDED VALUE IS COMPUTED, NOT CHOSEN (hard constraint 2). The design's rule is
-- `'if_required'` while the plan's amount is 0, `'always'` once 裁-28's amounts are ruled — and
-- both facts are already DB-owned columns on the same row. The backfill below is that rule as a
-- CASE over those two columns; no numeral or token is typed in from a model's judgement. It stays
-- a real column rather than a generated one so the pricing sitting can set it directly (the
-- billing brief's configurability law, which part 3 §2 cites by name).
--
-- REPORTED, NOT RESOLVED (hard constraint 1). `0163` labels `billing_plans` "MINIMAL G2 BILLING
-- DECLARATION. Billing PR-1 owns later rotation/widening", and this column is a widening of that
-- table by another train. It is additive, defaulted and CHECK-bounded, and the PR body puts the
-- alternative (leave the Session's collection mode unset and accept Stripe's `'always'`) to the
-- owner rather than deciding it here.
--
-- IT WIDENS C-3's MONEY-STORE CENSUS, AND THAT IS A REVIEWED ACT. `get_own_checkout_progress`
-- reads `clara.firm_registration_payments`, so it joins the closed-world roster C-3's own cell
-- `c3.53` pins (`packages/db/tests/checkout-gate-c3.test.mjs`, "the money-store body roster is
-- closed"). That cell is widened in the SAME PR, with the reason written beside the name. This
-- migration does not hide the dependency and could not: `0163`'s own comment on
-- `open_checkout_intent` sets the standard — "hiding a real dependency from a catalog census on
-- a money surface is the wrong kind of clever." The door is a STABLE reader; it writes nothing
-- and consumes no payment.
--
-- NO BODY IS REPLACED. Nothing here is a `create or replace` of a `0163` function: this cohort is
-- purely additive (one column, two new doors), so it cannot overwrite a sibling PR's body while
-- that PR is still in fold. D1 INVENTORY: EMPTY.

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- ==============================================================================================
-- 0. PRESTATE. Refuse unless C-3 has already applied, and pin what this cohort must not disturb.
-- ==============================================================================================
do $pre$
declare
  v_n integer;
begin
  if to_regclass('clara.billing_plans') is null
     or to_regclass('clara.checkout_intents') is null
     or to_regclass('clara.firm_registration_payments') is null
     or to_regclass('clara.firm_registration_requests') is null then
    raise exception 'checkout C-6 prestate: C-3 relations are absent — this migration sorts AFTER 0163'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.jwt_sub()') is null then
    raise exception 'checkout C-6 prestate: clara.jwt_sub() is absent' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.open_checkout_intent(uuid,bytea,text)') is null then
    raise exception 'checkout C-6 prestate: the C-3 checkout door is absent' using errcode='CLR10';
  end if;
  -- The column this cohort adds must not already exist: a second definition would mean C-3 (or a
  -- sibling) grew one with a different CHECK, and the backfill below would then be rewriting a
  -- value somebody else authored.
  select count(*) into v_n from information_schema.columns
   where table_schema='clara' and table_name='billing_plans'
     and column_name='payment_method_collection';
  if v_n<>0 then
    raise exception 'checkout C-6 prestate: billing_plans.payment_method_collection already exists'
      using errcode='CLR10';
  end if;
  -- Neither door may already exist under any signature spelling.
  if to_regprocedure('clara.get_current_checkout_plan()') is not null
     or to_regprocedure('clara.get_own_checkout_progress(uuid)') is not null then
    raise exception 'checkout C-6 prestate: a C-6 door already exists' using errcode='CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- 1. THE PLAN ROW'S COLLECTION MODE (design part 3 §2 / G13 / 裁-88).
-- ==============================================================================================
alter table clara.billing_plans
  add column payment_method_collection text not null default 'if_required'
    constraint ck_billing_plans_payment_method_collection
      check (payment_method_collection in ('if_required','always'));

-- The design's own rule, as a CASE over the two DB-owned columns it keys on. Every existing row
-- is rewritten from those columns rather than from a value chosen here.
update clara.billing_plans
   set payment_method_collection =
         case when amounts_ruled and amount_cents > 0 then 'always' else 'if_required' end;

-- ==============================================================================================
-- 2. THE CURRENT PLAN'S SESSION SHAPE. One row, no tenant predicate — a door, not a table grant,
--    so C-1/C-3's zero-direct-table-grant wall on billing_plans is preserved exactly.
-- ==============================================================================================
-- Frontend home: apps/web/lib/registration/checkout-doors.ts, called by
-- apps/web/app/(entry)/checkout/handler.ts (the POST /checkout Route Handler).
--
-- IT RETURNS `local_key` ALONGSIDE THE MODE ON PURPOSE. The caller already holds
-- `open_checkout_intent`'s own `price_local_key`, and a plan rotation between the two calls would
-- otherwise let a Session be built at one plan's price with another plan's collection mode. The
-- route compares the two and refuses on disagreement (cell `checkout.planDisagreement`); it does
-- NOT pick a winner, because which plan a half-rotated checkout belongs to is not a transport
-- decision. No amount is returned: nothing in `apps/web` needs one, and a money figure that
-- crosses a wire nobody reads is a figure a later lane will render.
create function clara.get_current_checkout_plan()
returns table(local_key text, payment_method_collection text)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  return query
  select b.local_key,b.payment_method_collection
    from clara.billing_plans b
   where b.is_current;
end $$;
revoke all on function clara.get_current_checkout_plan() from public;
grant execute on function clara.get_current_checkout_plan() to clara_authenticated;

-- ==============================================================================================
-- 3. THE APPLICANT'S OWN CHECKOUT PROGRESS (design part 1 §2.1's two new holding arms).
-- ==============================================================================================
-- Frontend home: apps/web/lib/registration/checkout-progress-reads.ts, consumed by
-- apps/web/lib/registration/holding-state.ts for `/pending`'s `checkout_open` and `paid` cards.
--
-- SELF-SCOPED, AND IT REFUSES RATHER THAN RETURNING AN EMPTY ROW FOR SOMEBODY ELSE'S
-- REGISTRATION. `CLR04 not your registration request` is the same refusal
-- `open_checkout_intent` gives for the same wrong, spelled the same way; an empty result would be
-- indistinguishable from "your own registration has no progress", which is a different fact.
--
-- BOTH FACTS ARE READ POSITIVELY AND SCOPED BY THE COMPOSITE PAIR the schema's own FKs bind
-- (`registration_id, applicant`) — never by applicant alone. 裁-74 deletes nothing, so an
-- applicant who was rejected and reapplied holds more than one registration, and a superseded
-- registration's intent must never read as progress on today's open one.
--
-- N4 (PR #488's Lane-B completion contract) IS CLOSED BY THE CONTROL'S SHAPE, NOT BY A FRESHNESS
-- FIELD. That contract asked for a Stripe session-status/expiry check before the "resume
-- checkout" control went live, because `checkout_open` is true for ANY historical non-null
-- `session_id`. The control this PR ships does not navigate to a stored Stripe URL at all: it
-- re-POSTs `/checkout`, which calls `open_checkout_intent` again, and that door reuses only an
-- UNSTAMPED current-plan intent — a stamped one is never reused, so a fresh Session is always
-- minted. A stale positive therefore costs a new Session, never a dead link. `expires_at` is not
-- in `checkout_intents` and Stripe is not an authority this door may consult, so a freshness
-- column would have to be invented; the structural answer needs neither.
create function clara.get_own_checkout_progress(p_registration uuid)
returns table(checkout_open boolean, paid_unconsumed boolean)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_applicant uuid;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  if p_registration is null then
    raise exception 'a registration is required' using errcode='CLR10';
  end if;
  select r.applicant into v_applicant
    from clara.firm_registration_requests r where r.id=p_registration;
  if not found then
    raise exception 'unknown registration request' using errcode='CLR10';
  end if;
  if v_applicant is distinct from v_actor then
    raise exception 'not your registration request' using errcode='CLR04';
  end if;

  return query
  select
    exists (select 1 from clara.checkout_intents i
             where i.registration_id=p_registration and i.applicant=v_actor
               and i.session_id is not null),
    exists (select 1 from clara.firm_registration_payments p
             where p.registration_id=p_registration and p.applicant=v_actor
               and p.consumed_at is null);
end $$;
revoke all on function clara.get_own_checkout_progress(uuid) from public;
grant execute on function clara.get_own_checkout_progress(uuid) to clara_authenticated;

reset role;

-- ==============================================================================================
-- 4. FAIL-CLOSED TAIL. Every claim above is positively re-read after privileges are final.
-- ==============================================================================================
do $tail$
declare
  v_n integer;
  v_sig regprocedure;
  v_acl text[];
  v_modes text;
begin
  -- 4.1 the column exists, is NOT NULL, is CHECK-bounded, and every row carries the derived value.
  select count(*) into v_n from information_schema.columns
   where table_schema='clara' and table_name='billing_plans'
     and column_name='payment_method_collection' and is_nullable='NO' and data_type='text';
  if v_n<>1 then
    raise exception 'checkout C-6 tail: payment_method_collection is not a NOT NULL text column'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_constraint
   where conrelid='clara.billing_plans'::regclass and contype='c'
     and conname='ck_billing_plans_payment_method_collection';
  if v_n<>1 then
    raise exception 'checkout C-6 tail: the collection-mode CHECK is absent' using errcode='CLR10';
  end if;
  -- The backfill agrees with the design's rule ON EVERY ROW, re-derived here from the same two
  -- columns rather than trusting the UPDATE above to have run.
  select count(*) into v_n from clara.billing_plans b
   where b.payment_method_collection is distinct from
         (case when b.amounts_ruled and b.amount_cents>0 then 'always' else 'if_required' end);
  if v_n<>0 then
    raise exception 'checkout C-6 tail: % plan row(s) disagree with the amount-derived mode',v_n
      using errcode='CLR10';
  end if;
  select string_agg(distinct b.payment_method_collection,',') into v_modes from clara.billing_plans b;
  raise notice 'checkout C-6: plan collection modes present = %',coalesce(v_modes,'(no plan rows)');

  -- 4.2 both doors exist at their EXACT signatures, are owned by clara_fn_owner, are SECURITY
  --     DEFINER, and are EXECUTE-granted to clara_authenticated and to nothing else.
  foreach v_sig in array array[
    'clara.get_current_checkout_plan()'::regprocedure,
    'clara.get_own_checkout_progress(uuid)'::regprocedure
  ] loop
    select count(*) into v_n from pg_proc p
     where p.oid=v_sig and p.prosecdef and pg_get_userbyid(p.proowner)='clara_fn_owner'
       and p.provolatile='s';
    if v_n<>1 then
      raise exception 'checkout C-6 tail: %. is not a stable SECURITY DEFINER owned by clara_fn_owner',v_sig
        using errcode='CLR10';
    end if;
    select array_agg(distinct grantee order by grantee) into v_acl
      from (
        select (aclexplode(p.proacl)).grantee::regrole::text as grantee
          from pg_proc p where p.oid=v_sig
      ) g
     where grantee <> 'clara_fn_owner';
    if v_acl is distinct from array['clara_authenticated'] then
      raise exception 'checkout C-6 tail: %. EXECUTE set is %, not exactly {clara_authenticated}',
        v_sig,coalesce(v_acl::text,'(none)') using errcode='CLR10';
    end if;
    if has_function_privilege('public',v_sig,'execute') then
      raise exception 'checkout C-6 tail: %. is still executable by PUBLIC',v_sig using errcode='CLR10';
    end if;
  end loop;

  -- 4.3 THIS COHORT ADDS NO TABLE GRANT. The two C-3 tables stay unreadable by every application
  --     role — the door is the ONLY new read path, which is the whole reason it exists.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema='clara'
     and table_name in ('checkout_intents','firm_registration_payments','billing_plans')
     and grantee not in ('clara_fn_owner','postgres');
  if v_n<>0 then
    raise exception 'checkout C-6 tail: % application-role table grant(s) appeared on the C-3 tables',v_n
      using errcode='CLR10';
  end if;

  raise notice 'checkout C-6 tail: OK -- plan collection mode derived from amount_cents/amounts_ruled on every row and CHECK-bounded; two stable definer doors at exact signatures, clara_authenticated-only, PUBLIC refused; zero application-role table grants on billing_plans/checkout_intents/firm_registration_payments; no 0163 body recut (D1 inventory empty).';
end $tail$;
