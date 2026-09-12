-- 0186_checkout_convergence — #628 (parent spec #612 §2/§8; journey A1):
-- ONE AUTHORITATIVE CHECKOUT OUTCOME, AND AN HONEST WAITING PATH TO IT.
-- =====================================================================================
-- Spec of record: issue #612 §2/§8 — "Account/checkout stages resume from persisted checkout
-- intent, signed webhook and atomic firm claim. Handle processing, cancelled, expired, failed,
-- delayed webhook, duplicate/reordered webhook, concurrent claim and lost acknowledgement with ONE
-- authoritative outcome and an honest waiting/retry path." Ticket #628. ARCHITECTURE §10 (anchor
-- `admission-and-operator-support`): 「准入使用版本化法律内容／签署、rate events、checkout intents 和
-- Stripe 验签 webhook；firm claim 在事务内完成」. This file closes the four measured gaps below and
-- nothing else.
--
-- WHAT WAS MEASURED ON THE 0185 FRONTIER, AND IS WRONG.
--
--   1. A CHECKOUT INTENT HAS NO STATE, ONLY A SESSION STAMP. `clara.checkout_intents` (0158 §4,
--      recut by 0185 §D) is `unstamped` or `stamped` and nothing else. There is no way to say
--      "the applicant's bank is still deciding", "the applicant walked away", "Stripe expired the
--      session" or "the payment failed" — so every one of those states renders as the SAME
--      `checkout_open = true` that a live, payable session renders as (`clara.get_own_checkout_
--      progress`, 0164 §3). The applicant is told to wait, with no honest account of what for.
--
--   2. A COMPLETED-BUT-UNSETTLED SESSION IS FILED AS AN OPERATOR PROBLEM. `clara.apply_stripe_
--      events` (0160 §4) matches ONE event type, `checkout.session.completed`, and its first arm
--      files `payment_not_settled` for anything whose `payment_status` is not `paid`. That is
--      exactly the shape of a Malaysian FPX (and every other asynchronous method) checkout: Stripe
--      sends `checkout.session.completed` with `payment_status='unpaid'` the moment the customer
--      leaves the page, and the money lands minutes later on `checkout.session.async_payment_
--      succeeded`. On this estate that ordinary, expected, self-resolving wait is written into an
--      operator queue as a fault — and the applicant's own surface still says nothing.
--
--   3. THE THREE EVENTS THAT RESOLVE THE WAIT ARE RECORDED AND NEVER ACTED ON.
--      `clara.record_stripe_event` accepts any type, so `checkout.session.async_payment_succeeded`,
--      `checkout.session.async_payment_failed` and `checkout.session.expired` all LAND in
--      `clara.stripe_events` — and the applier's `where se.type='checkout.session.completed'`
--      means nothing ever reads them. An FPX customer whose payment succeeds is never given a
--      `firm_registration_payments` row; one whose payment fails waits forever.
--
--   4. NOTHING ANYWHERE KNOWS HOW MANY FIRMS THE ESTATE CAN ADMIT. There is no capacity concept
--      in the schema at all, so a closed beta has no server-side way to stop taking money, and two
--      concurrent `claim_paid_firm` calls into a nominally-last slot are not even a question the
--      database can be asked.
--
--   …and one consequence of (1) that is its own defect: `clara.open_checkout_intent` (0163:391,
--   recut 0185 §G) REUSES an unstamped current-plan intent and otherwise MINTS ANOTHER, with no
--   wall between them. An applicant who abandoned a live Stripe Checkout Session and re-POSTs
--   `/checkout` therefore ends up with TWO live Stripe sessions against one registration. Only one
--   can ever become a payment (`uq_frp_registration`); the other becomes a customer who paid and a
--   `duplicate_payment` row in an operator queue.
--
-- =====================================================================================
-- THE REVIEW ROUND, AND THE SEVEN THINGS IT MOVED IN THIS FILE (#628 review, ranked).
--
-- Every one below is a defect of an EARLIER CUT OF THIS FILE. 0186 is unmerged, so the body moves
-- here rather than in a successor -- which also means every database that applied the earlier cut
-- refuses this one on checksum drift and must be rebuilt. Each item is pinned by a cell in
-- `packages/db/tests/checkout-convergence.test.mjs` and by a probe in §J.
--
--   S1 · MONEY. The settlement test was 0160's disjunct `payment_status='paid' OR
--        (mode='subscription' AND session_status='complete')`. EVERY Clara Checkout Session is
--        created with `mode: "subscription"` (apps/web/lib/checkout/stripe-session.ts:334, checkoutSessionForm), and
--        Stripe sends `checkout.session.completed` with `status='complete'` and
--        `payment_status='unpaid'` the instant a delayed-notification customer (Malaysian FPX,
--        and every other asynchronous method) leaves the page. So the second disjunct was TRUE
--        for every completed session this estate can ever receive: an UNPAID completed event
--        recorded a `firm_registration_payments` row and flipped the intent to `paid`, the
--        `async_payment_failed` that followed answered `no_change` against an already-paid
--        intent, and a REFUSED payment had minted a claimable firm. The disjunct is replaced by
--        `payment_status in ('paid','no_payment_required')` -- `no_payment_required` is the thing
--        the mode clause was STANDING IN FOR (Stripe's own answer for the RM0 beta flow, whose
--        plan amount is 0), and it is a statement about the money rather than about the session's
--        shape. This RETIRES review item A4. `checkout.session.async_payment_succeeded` is still
--        settled BY ITS TYPE, which is unchanged.
--
--   S2 · THE COHORT'S LOCK ORDER IS `checkout_intents` -> `firm_registration_requests`, AND IT IS
--        STATED HERE ONCE. The earlier cut had `clara.claim_paid_firm` writing the intent while
--        holding the registration `for update`, and `clara.apply_stripe_events` holding the
--        intent `for update` while inserting a payment row whose `fk_frp_registration_applicant`
--        takes KEY SHARE on that same registration (0163:231). Registration->intent against
--        intent->registration is a cycle, and a webhook sweep racing a claim on one registration
--        raises 40P01 on a money path with no retry behind it. `claim_paid_firm` now resolves the
--        applicant's intent id WITHOUT a lock, takes the INTENT row lock, and only then the
--        registration row lock (§H). `clara.open_checkout_intent` is deliberately NOT in this
--        ordering claim and does not need to be: the only intent row it locks is an UNSTAMPED
--        `open` one, and an applier resolves an intent only from a stamped session id, so the two
--        bodies' intent lock sets are disjoint by construction.
--
--   S3 · `expired_after_paid` filed a problem, wrote NO application row and `continue`d. The only
--        other exclusion is the open problem itself, so an operator RESOLVING it handed the event
--        straight back to the next sweep, which filed the identical problem again, forever. It
--        now writes an application row with outcome `no_change` beside the problem, exactly as
--        `paid_after_terminal` already wrote one with outcome `paid` (§D, §E).
--
--   S4 · `clara.get_admission_capacity` handed `firms_count` -- how many firms this estate has
--        sold, a business-confidential number -- to ANY authenticated person. It now carries
--        `clara.set_admission_capacity`'s own predicate (operator-firm owner) and refuses CLR04
--        `not_operator_firm` otherwise. Applicants lose nothing: the only capacity fact their
--        surfaces ever needed is the BOOLEAN `capacity_full`, which travels on
--        `clara.get_own_checkout_progress` (§I) and is what `apps/web` actually reads
--        (apps/web/lib/registration/checkout-progress-reads.ts:108, the capacityFull field); no web lane calls this door.
--
--   S5 · A `processing` INTENT HAD NO EXIT. `open_checkout_intent` refuses `checkout_in_progress`
--        and `cancel_checkout_intent` refuses `payment_in_flight`, so if the terminal asynchronous
--        webhook never arrives the applicant can never pay again -- forever, with no operator
--        visibility. `clara.apply_stripe_events` (the runtime leader sweeps it every 60s) now
--        carries a second arm that expires a `processing` intent whose `status_at` is older than
--        a Stripe Checkout Session can live and files the operator problem `processing_timeout`
--        (§E). A payment landing afterwards is the existing `paid_after_terminal` path, unchanged.
--
--   S6 · THE STAMP TRIGGER WAS `before update` ONLY, so on INSERT the eight-value CHECK was the
--        whole law and a definer could insert an intent that was born `paid`, with a `status_at`
--        of its own choosing. A sibling BEFORE INSERT trigger now writes the three state columns
--        itself (§B).
--
--   B7 · `cancel_checkout_intent` answered CLR10 `intent_not_found` for an absent intent and
--        CLR04 `not_your_intent` for somebody else's -- a two-answer probe that tells an attacker
--        which checkout intent ids exist. Both are now ONE refusal, CLR04 `not_your_intent` (§F),
--        matching `get_own_checkout_intent_session`'s zero-row posture.
--
-- =====================================================================================
-- THE SHAPE OF THE FIX: A STATUS THE DATABASE OWNS, AND A TRIGGER THAT IS THE ONLY LAW.
--
-- `clara.checkout_intents.status` is an eight-value enumeration under a CHECK, and EVERY move
-- between two values is admitted or refused by ONE recut trigger — 0158's own
-- `_tf_checkout_intents_session_stamp`, the wall that already froze this row. Nothing else in the
-- estate decides a transition: a door proposes, the trigger rules. The admitted moves are:
--
--     open            -> session_created   (INSEPARABLE from the first session_id stamp, below)
--     open            -> cancelled
--     session_created -> processing | paid | expired | cancelled
--     processing      -> paid | payment_failed | expired
--     payment_failed  -> expired | cancelled | paid *
--     paid            -> consumed
--     expired         -> paid *            MONEY IS THE AUTHORITY (see below)
--     cancelled       -> paid *            MONEY IS THE AUTHORITY (see below)
--
-- Everything else is CLR09 `invalid_transition`, naming `from` and `to` in its detail.
--
-- THE SESSION STAMP AND THE STATUS ARE ONE ACT, AND THE TRIGGER WRITES THE STATUS ITSELF. A
-- writer that stamps `session_id` never mentions `status`; the trigger sets it. That is not
-- convenience — it is the only construction under which "a stamped intent is `session_created`"
-- is a STRUCTURAL fact rather than a convention every future writer must remember.
-- `clara.record_checkout_session` (0163:504) is therefore NOT recut by this file, and its body
-- (and hash) do not move: it stamps a session exactly as it always did, and the intent's state
-- moves with it because the row itself will not accept one without the other.
--
-- THE THREE `*` ARMS ARE #628's ONE DELIBERATE WIDENING OF ITS OWN CONTRACT, AND THEY ARE WHY.
-- The ticket's transition table does not list `expired -> paid` or `cancelled -> paid`; the same
-- ticket's applier contract requires that "a paid event arriving after expired/cancelled STILL
-- records the payment and flips the intent to paid (money is the authority)". Both cannot be
-- true, so this file rules for MONEY, uniformly: a recorded payment moves the intent to `paid`
-- from ANY non-paid state, and the applier files the `paid_after_terminal` problem so an operator
-- sees every one of them. `payment_failed -> paid` is in the same clause for the same reason and
-- one more: without it a settled payment landing on a failed intent would make the trigger RAISE
-- inside `apply_stripe_events`, aborting the whole sweep transaction — a webhook lane that dies
-- on an unusual-but-lawful ordering is a worse answer than a state move with a receipt.
--
-- WHAT `status` DOES NOT DO. It is not a second source of truth for money. `clara.firm_
-- registration_payments` is still the only record that a payment exists, `uq_frp_registration` is
-- still the only law that one registration buys one firm, and `claim_paid_firm` still reads the
-- PAYMENT row rather than the intent's status to decide whether a firm may be created. `status`
-- is the applicant-facing account of where their checkout IS; it is derived from money, never the
-- other way round.
--
-- =====================================================================================
-- WHY A SEPARATE APPLICATION LEDGER, AND WHY THE OLD EXCLUSION IS KEPT BESIDE IT.
--
-- 0160's applier excludes an already-handled event by looking for its `firm_registration_payments`
-- row — which works only because the sole arm that has an EFFECT is the one that writes a payment.
-- Three of this file's four arms (processing, payment_failed, expired) have a real effect and
-- write no payment, so on 0160's exclusion alone they would be re-selected forever and occupy the
-- whole `p_limit` window, which is precisely the starvation C-5 fixed and `checkout-gate-c2`'s
-- c2.13 pins. `clara.stripe_events` cannot carry the mark: it is append-only by trigger and 0160
-- states the reason in its own §1 ("No applied_at exists … so immutability is unconditional").
--
-- So the mark lands in a new append-only relation, `clara.stripe_event_applications`, one row per
-- event the applier has actually acted on, carrying WHAT it did. And 0160's payment-row exclusion
-- is KEPT beside it rather than replaced: a payment row inserted by anything other than this
-- applier (the rig's own fixtures do exactly that, and so does an operator repair) still excludes
-- its event, exactly as it did before this file. Two independent exclusions, neither weakened.
--
-- A PROBLEM ROW IS THE OTHER EXCLUSION, AND IT RELEASES ON RESOLUTION -- FOR THE ARMS THAT DID
-- NOT FINISH. 0160's four problem arms (`metadata_missing`, `intent_not_found`, `intent_mismatch`,
-- `duplicate_payment`) end WITHOUT having applied the event, so they write no application row and
-- resolving the problem is what hands the event back to the next sweep (`checkout-gate-c3`'s
-- c3.52 pins exactly that, and it is unchanged here). #628's own two problems are different in
-- kind: `paid_after_terminal` and `expired_after_paid` are RECEIPTS an operator must see about an
-- event the applier has ALREADY finished with, so both write an application row beside the
-- problem -- `paid_after_terminal` an outcome of `paid`, `expired_after_paid` one of `no_change`.
-- Without that row (#628 review S3) resolving an `expired_after_paid` problem handed the event to
-- a sweep that filed the identical problem again, and no operator could ever clear it.
--
-- =====================================================================================
-- CAPACITY: THE COUNT AND THE INSERT ARE ONE TRANSACTION, OR IT IS NOT A WALL.
--
-- `clara.admission_capacity` is a single row (`id boolean primary key check (id)`) carrying
-- `max_firms`, seeded NULL = unlimited. It is CONFIGURATION, not legal text, so this file seeds it
-- — the one thing #621 was right to refuse to do for its own table is the opposite of the right
-- call here: a nullable column with no row would make every reader handle "no policy" separately.
--
-- The predicate lives in exactly ONE body, `clara._admission_capacity_state()`, granted to nobody
-- and called by all four surfaces that need it. `clara.claim_paid_firm` takes
-- `pg_advisory_xact_lock(hashtextextended('clara.admission-capacity',0))` BEFORE its registration
-- row lock and holds it to commit, so the count it reads and the firm it inserts are one
-- serialized act: two callers racing into the last slot produce exactly one firm and one CLR09
-- `capacity_reached`, and the loser's payment is left UNCONSUMED so it can be refunded or admitted
-- later. `clara.open_checkout_intent` checks the SAME predicate WITHOUT the lock — deliberately
-- advisory, and deliberately before the origin rate wall: its job is to stop an applicant paying
-- into a full estate, not to reserve them a slot. The claim is the wall; the opening door is a
-- courtesy. Anything else would mean holding an estate-wide lock across a Stripe round trip.
--
-- =====================================================================================
-- THE BACKFILL, AND THE ONE TIMESTAMP IT CANNOT KNOW.
--
-- Every existing intent is mapped from evidence that already exists: `consumed` if its payment row
-- is consumed, `paid` if a payment row exists, `session_created` if `session_id` is stamped, else
-- `open`. The payment row is matched on `stripe_session_id = intents.session_id` — never on
-- `registration_id` alone, which would attribute a payment to a SUPERSEDED intent of the same
-- registration.
--
-- `status_at` is honest about what it can and cannot know: `consumed_at` for a consumed row,
-- `recorded_at` for a paid one, and `opened_at` for both `session_created` and `open`. For
-- `session_created` that is a LOWER BOUND, not the instant of the stamp — 0158 never recorded one,
-- and inventing `now()` would assert that every pre-0186 applicant's session was created at
-- migration time, which is worse than a bound the column's comment states plainly.
--
-- 0158's stamp trigger refuses every UPDATE except its own permitted moves, and the backfill is
-- not one of them, so — exactly as 0185 §D did, and for the same measured reason — the trigger is
-- DISABLED for the width of this one migration-owned UPDATE and re-enabled immediately. §J
-- asserts it is armed again before this file is done.
-- =====================================================================================

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- =====================================================================================
-- §0  PRESTATE. Refuse a partial cohort, pin every object this file extends, and prove the
--     shape it is about to change is the shape 0158/0160/0163/0164/0185 actually left behind.
-- =====================================================================================
do $w628_pre$
declare
  v_n int; v_names text;
begin
  foreach v_names in array array['users','firms','audit_log','checkout_intents','legal_documents',
      'firm_registration_requests','firm_registration_payments','billing_plans',
      'stripe_events','stripe_event_problems','stripe_object_map','registration_rate_events'] loop
    if to_regclass('clara.'||v_names) is null then
      raise exception '#628 prestate: clara.% is absent -- the 0158/0160/0163/0164/0185 checkout cohort must apply first',
        v_names using errcode='CLR10';
    end if;
  end loop;

  foreach v_names in array array[
      'clara.open_checkout_intent(uuid,bytea,text)',
      'clara.claim_paid_firm(uuid,text)',
      'clara.record_checkout_session(uuid,text,text)',
      'clara.apply_stripe_events(integer)',
      'clara.record_stripe_event(text,text,jsonb)',
      'clara.get_own_checkout_progress(uuid)',
      'clara.get_current_checkout_plan()',
      'clara._tf_checkout_intents_session_stamp()',
      'clara._human_ctx(integer)','clara.role_rank(text)','clara.jwt_firm()','clara.jwt_sub()',
      'clara._reserve_op(uuid,text,text,bytea)','clara._finish_op(uuid,text,text,jsonb)',
      'clara._hash(jsonb)','clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
      'clara._create_firm_core(uuid,text)',
      'clara._tf_append_only()','clara._tf_no_truncate()'] loop
    if to_regprocedure(v_names) is null then
      raise exception '#628 prestate: % is absent', v_names using errcode='CLR10';
    end if;
  end loop;

  -- The cohort this file MINTS must be wholly absent -- half of it means somebody already did
  -- half of this migration.
  select coalesce(string_agg(x,',' order by x),'(none)') into v_names
    from unnest(array['admission_capacity','stripe_event_applications']) x
   where to_regclass('clara.'||x) is not null;
  if v_names <> '(none)' then
    raise exception '#628 prestate: the cohort must be wholly absent; found %', v_names using errcode='CLR10';
  end if;
  select coalesce(string_agg(p.proname,',' order by p.proname),'(none)') into v_names
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara'
     and p.proname in ('cancel_checkout_intent','set_admission_capacity','get_admission_capacity',
                       'get_own_checkout_intent_session','_admission_capacity_state');
  if v_names <> '(none)' then
    raise exception '#628 prestate: a convergence door already exists; found %', v_names using errcode='CLR10';
  end if;

  -- The intent tuple, EXACTLY as 0185 §D left it. A different shape means a file between 0185 and
  -- this one moved the row, and the backfill below would be mapping columns it has not read.
  select string_agg(attname,',' order by attnum) into v_names
    from pg_attribute where attrelid='clara.checkout_intents'::regclass and attnum>0 and not attisdropped;
  if v_names is distinct from
     'id,registration_id,applicant,price_local_key,session_id,opened_at,terms_version,dpa_version,dpa_kind,terms_kind' then
    raise exception '#628 prestate: unexpected checkout_intents columns: %', v_names using errcode='CLR10';
  end if;

  -- 0158's stamp trigger is present AND ARMED. This file disables it for one UPDATE and must know
  -- it was enabled to begin with, or the re-enable in §A would be a claim about nothing.
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.checkout_intents'::regclass
     and tgname='t_checkout_intents_session_stamp' and tgenabled='O';
  if v_n <> 1 then
    raise exception '#628 prestate: t_checkout_intents_session_stamp is absent or not armed'
      using errcode='CLR10';
  end if;

  -- The problem vocabulary this file WIDENS, read as a definition rather than assumed.
  select pg_get_constraintdef(oid) into v_names from pg_constraint
   where conrelid='clara.stripe_event_problems'::regclass and conname='ck_stripe_event_problems_problem';
  if v_names is null
     or position('''payment_not_settled''' in v_names)=0
     or position('''metadata_missing''' in v_names)=0
     or position('''intent_not_found''' in v_names)=0
     or position('''intent_mismatch''' in v_names)=0
     or position('''duplicate_payment''' in v_names)=0 then
    raise exception '#628 prestate: ck_stripe_event_problems_problem is not 0160''s five-value list (%)',
      coalesce(v_names,'(absent)') using errcode='CLR10';
  end if;
  if position('''expired_after_paid''' in v_names)>0 or position('''paid_after_terminal''' in v_names)>0
     or position('''processing_timeout''' in v_names)>0 then
    raise exception '#628 prestate: the problem vocabulary already carries a #628 value' using errcode='CLR10';
  end if;

  -- Every intent must map onto exactly one backfilled status, and a payment row must not name two
  -- intents. Asserted BEFORE anything is written, so a surprise is a refusal rather than a guess.
  select count(*)::int into v_n
    from clara.firm_registration_payments p
   where (select count(*) from clara.checkout_intents i where i.session_id=p.stripe_session_id) > 1;
  if v_n <> 0 then
    raise exception '#628 prestate: % payment row(s) match more than one intent by session -- uq_checkout_intents_session_id is broken', v_n
      using errcode='CLR10';
  end if;

  raise notice '#628 prestate: clean -- the 0158/0160/0163/0164/0185 checkout cohort is present at its exact 0185 intent shape, t_checkout_intents_session_stamp is armed, the problem vocabulary is 0160''s five values with neither #628 value already present, no admission_capacity/stripe_event_applications relation and no convergence door exists, and every payment row resolves to at most one checkout intent by session id.';
end
$w628_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE INTENT GAINS A STATE. Three columns, one CHECK, one backfill.
-- =====================================================================================
alter table clara.checkout_intents
  add column status        text,
  add column status_at     timestamptz,
  add column status_reason text;

-- The backfill. Trigger disabled for its width -- 0185 §D's measured idiom, for 0158's measured
-- reason: the stamp wall refuses EVERY update except its own permitted moves, and it refuses
-- hardest for an already-stamped row, i.e. exactly the paid, mid-flow applicants this file must
-- not strand.
alter table clara.checkout_intents disable trigger t_checkout_intents_session_stamp;
update clara.checkout_intents i
   set status = case
                  when src.consumed_at is not null then 'consumed'
                  when src.payment_id is not null  then 'paid'
                  when src.session_id is not null  then 'session_created'
                  else 'open'
                end,
       status_at = coalesce(src.consumed_at, src.recorded_at, src.opened_at)
  from (
    -- The payment is matched on the SESSION, never on the registration alone: one registration can
    -- hold several intents (0163's plan-rotation arm mints one per current plan) and attributing a
    -- payment to a superseded intent would make the wrong row `paid`. `uq_checkout_intents_session_id`
    -- makes this join at most one row, and §0 asserted that positively before anything was written.
    select ci.id, ci.session_id, ci.opened_at,
           p.id as payment_id, p.consumed_at, p.recorded_at
      from clara.checkout_intents ci
      left join clara.firm_registration_payments p on p.stripe_session_id = ci.session_id
  ) src
 where src.id = i.id;
alter table clara.checkout_intents enable trigger t_checkout_intents_session_stamp;

do $w628_backfill$
declare v_n int;
begin
  select count(*)::int into v_n from clara.checkout_intents where status is null or status_at is null;
  if v_n <> 0 then
    raise exception '#628 §A: % checkout intent(s) did not receive a status', v_n using errcode='CLR10';
  end if;
  -- Re-derived from the SAME evidence rather than trusting the UPDATE to have run (0164 §4.1's
  -- own standard for a computed backfill).
  select count(*)::int into v_n from clara.checkout_intents i
   where i.status is distinct from (
     case when exists (select 1 from clara.firm_registration_payments p
                        where p.stripe_session_id=i.session_id and p.consumed_at is not null) then 'consumed'
          when exists (select 1 from clara.firm_registration_payments p
                        where p.stripe_session_id=i.session_id) then 'paid'
          when i.session_id is not null then 'session_created'
          else 'open' end);
  if v_n <> 0 then
    raise exception '#628 §A: % checkout intent(s) disagree with the evidence-derived status', v_n
      using errcode='CLR10';
  end if;
end
$w628_backfill$;

alter table clara.checkout_intents
  alter column status set not null,
  alter column status set default 'open',
  alter column status_at set not null,
  alter column status_at set default now(),
  add constraint ck_checkout_intents_status
    check (status in ('open','session_created','processing','paid','consumed',
                      'expired','payment_failed','cancelled')),
  -- A stamped session and an `open` intent cannot both be true: the stamp IS the transition.
  add constraint ck_checkout_intents_status_session
    check ((session_id is null) or status <> 'open'),
  -- The reason is a short, typed-ish note, never a place to spill a provider payload.
  add constraint ck_checkout_intents_status_reason
    check (status_reason is null or (btrim(status_reason) <> '' and length(status_reason) <= 200));

create index ix_checkout_intents_registration_status
  on clara.checkout_intents(registration_id,status);

comment on column clara.checkout_intents.status is
  '#628: where this checkout IS. open -> session_created (inseparable from the first session_id '
  'stamp) -> processing|paid|expired|cancelled -> ... -> consumed. Every move is ruled by '
  'clara._tf_checkout_intents_session_stamp; nothing else decides one. Derived from money, never '
  'the reverse: clara.firm_registration_payments remains the only record that a payment exists.';
comment on column clara.checkout_intents.status_at is
  '#628: when the current status was entered, written by the transition trigger itself (never by a '
  'caller). For rows BACKFILLED by 0186 it is consumed_at / recorded_at where a payment row '
  'supplied one, and otherwise opened_at -- which for a pre-0186 session_created row is a LOWER '
  'BOUND, because 0158 recorded no stamp instant and inventing one would be a worse answer.';
comment on column clara.checkout_intents.status_reason is
  '#628: the provider-supplied or estate-supplied reason for the CURRENT status, settable only on '
  'the transition that entered it. Bounded to 200 characters.';

-- =====================================================================================
-- §B  THE TRANSITION WALL. 0158's `_tf_checkout_intents_session_stamp`, recut a second time.
--
--     It admits exactly THREE kinds of move and refuses everything else:
--       1. the 0185 SEC-2 legacy terms pin (NULL -> value on an unstamped row, nothing else);
--       2. the FIRST session_id stamp, which it also EXECUTES as open -> session_created;
--       3. a pure status transition from the table in this file's header.
--     The frozen identity columns are 0158's, unchanged. The two refusal codes are deliberate and
--     different: CLR10 (0158's own sentence, byte-for-byte) for a shape violation, CLR09
--     `invalid_transition` for a move that is well-shaped but not lawful.
-- =====================================================================================
create or replace function clara._tf_checkout_intents_session_stamp() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_lawful boolean;
begin
  -- THE FROZEN IDENTITY (0158:230-243, widened by 0185 §D with the two legal pins). No permitted
  -- move touches any of these, so the check is hoisted out of all three arms.
  if row(new.id,new.registration_id,new.applicant,new.price_local_key,new.dpa_version,new.opened_at)
     is distinct from
     row(old.id,old.registration_id,old.applicant,old.price_local_key,old.dpa_version,old.opened_at) then
    raise exception 'checkout_intents permits only the first session_id stamp'
      using errcode='CLR10';
  end if;

  -- MOVE 1 -- THE LEGACY TERMS PIN (#621 review SEC-2, 0185 §D/§G). NULL -> value, on an UNSTAMPED
  -- row, with nothing else moving -- the state included. This is the only update
  -- `clara.open_checkout_intent`'s reuse arm performs, and it is one-way twice over.
  if old.session_id is null and new.session_id is null
     and old.terms_version is null and new.terms_version is not null
     and new.status is not distinct from old.status
     and new.status_at is not distinct from old.status_at
     and new.status_reason is not distinct from old.status_reason then
    return new;
  end if;
  -- Outside MOVE 1 the terms pin is frozen like the identity above.
  if new.terms_version is distinct from old.terms_version then
    raise exception 'checkout_intents permits only the first session_id stamp'
      using errcode='CLR10';
  end if;

  -- MOVE 2 -- THE FIRST SESSION STAMP, WHICH IS THE open -> session_created TRANSITION.
  -- The trigger WRITES the status rather than checking one the caller supplied. That is what makes
  -- "a stamped intent is session_created" structural: `clara.record_checkout_session` (0163:504)
  -- never mentions `status` and is not recut by this file, and no future writer can stamp a
  -- session without moving the state, because the row will not accept one without the other.
  if old.session_id is null and new.session_id is not null then
    if btrim(new.session_id) = '' then
      raise exception 'checkout_intents permits only the first session_id stamp'
        using errcode='CLR10';
    end if;
    if old.status <> 'open' then
      raise exception 'a checkout session cannot be stamped on a % intent', old.status
        using errcode='CLR09', detail=jsonb_build_object(
          'reason','invalid_transition','from',old.status,'to','session_created')::text;
    end if;
    if new.status is distinct from old.status then
      raise exception 'a checkout session stamp may not carry its own status'
        using errcode='CLR09', detail=jsonb_build_object(
          'reason','invalid_transition','from',old.status,'to',new.status)::text;
    end if;
    new.status := 'session_created';
    new.status_at := now();
    new.status_reason := null;
    return new;
  end if;

  -- MOVE 3 -- A PURE STATUS TRANSITION. `session_id` unmoved; the table is this file's header's.
  -- `status_at` is written HERE, from the transaction clock, so no caller can transition without
  -- moving it and none can move it without transitioning.
  if new.session_id is not distinct from old.session_id
     and new.status is distinct from old.status then
    v_lawful := (old.status, new.status) in (
      ('open','cancelled'),
      ('session_created','processing'),('session_created','paid'),
      ('session_created','expired'),('session_created','cancelled'),
      ('processing','paid'),('processing','payment_failed'),('processing','expired'),
      ('payment_failed','expired'),('payment_failed','cancelled'),('payment_failed','paid'),
      ('paid','consumed'),
      ('expired','paid'),('cancelled','paid'));
    if not v_lawful then
      raise exception 'a checkout intent cannot move from % to %', old.status, new.status
        using errcode='CLR09', detail=jsonb_build_object(
          'reason','invalid_transition','from',old.status,'to',new.status)::text;
    end if;
    new.status_at := now();
    return new;
  end if;

  -- Everything else: a session RE-stamp, an unstamp, a status_reason or status_at rewrite with the
  -- status standing still, or an update that moves nothing at all. 0158's sentence, unchanged.
  raise exception 'checkout_intents permits only the first session_id stamp'
    using errcode='CLR10';
end $$;

comment on function clara._tf_checkout_intents_session_stamp() is
  '#628 (recut of 0158:230, first recut 0185 section D): the ONLY authority over a checkout '
  'intent''s state. Admits the 0185 legacy terms pin, the first session_id stamp (which it '
  'EXECUTES as open -> session_created), and the lawful status transitions; refuses a shape '
  'violation CLR10 with 0158''s own sentence and an unlawful move CLR09 detail.reason '
  'invalid_transition naming from/to.';

-- THE INSERT ARM (#628 review S6). Everything above is BEFORE UPDATE, so on an INSERT the
-- eight-value CHECK was the whole law: `insert into clara.checkout_intents(...,status) values
-- (...,'paid')` satisfied it and produced an intent that was BORN paid, carrying whatever
-- `status_at` its writer chose -- a fabricated state on the one relation this file exists to make
-- authoritative. A checkout is born `open`; that is the first line of the transition table, not a
-- column default a writer may override. So a SIBLING before-insert trigger writes the three state
-- columns itself and refuses every other spelling CLR09 `invalid_transition` with `from` null.
--
-- A sibling rather than a fourth arm of the body above, because that body is written entirely in
-- terms of `old`, which does not exist on an INSERT. This file's own backfill is an UPDATE and is
-- untouched by it, and `clara.open_checkout_intent` names no status column at all, so it takes
-- the default and passes.
create function clara._tf_checkout_intents_insert_stamp() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if new.status is distinct from 'open' then
    raise exception 'a checkout intent is born open, not %', coalesce(new.status,'(null)')
      using errcode='CLR09', detail=jsonb_build_object(
        'reason','invalid_transition','from',null::text,'to',new.status)::text;
  end if;
  new.status := 'open';
  new.status_at := now();
  new.status_reason := null;
  return new;
end $$;
-- 0158:254's own posture for the trigger function beside it: a trigger body is called by the
-- system, never by a caller, and leaving PUBLIC's default EXECUTE on it widens `clara_stripe_
-- webhook`'s routine set -- which checkout-gate-c2's c2.8 asserts as an EXACT set equality.
revoke all on function clara._tf_checkout_intents_insert_stamp() from public;

create trigger t_checkout_intents_insert_stamp before insert on clara.checkout_intents
  for each row execute function clara._tf_checkout_intents_insert_stamp();

comment on function clara._tf_checkout_intents_insert_stamp() is
  '#628 (review S6): a checkout intent is BORN open. Forces status=open, status_at=now() and a '
  'NULL status_reason on every INSERT, and refuses an insert naming any other status CLR09 '
  'detail.reason invalid_transition with from=null -- the state a row starts in is the transition '
  'table''s first line, not a default a writer may override.';

-- =====================================================================================
-- §C  ADMISSION CAPACITY. One configuration row, one predicate body, two doors.
-- =====================================================================================
create table clara.admission_capacity (
  id         boolean     primary key default true,
  max_firms  integer,
  reason     text,
  updated_by uuid        references clara.users(id),
  updated_at timestamptz not null default now(),
  constraint ck_admission_capacity_singleton check (id),
  constraint ck_admission_capacity_max_firms check (max_firms is null or max_firms >= 0),
  constraint ck_admission_capacity_reason
    check (reason is null or (btrim(reason) <> '' and length(reason) <= 500))
);

alter table clara.admission_capacity enable row level security;
alter table clara.admission_capacity force row level security;
create policy p_admission_capacity_owner on clara.admission_capacity for all to clara_fn_owner
  using (true) with check (true);

-- UPDATE is the point of the table, so it is NOT append-only -- but the row may never be deleted
-- or truncated away, because a missing row is an unanswerable capacity question rather than an
-- unlimited estate.
create trigger t_admission_capacity_no_delete before delete on clara.admission_capacity
  for each row execute function clara._tf_append_only();
create trigger t_admission_capacity_no_truncate before truncate on clara.admission_capacity
  for each statement execute function clara._tf_no_truncate();

-- SEEDED HERE, DELIBERATELY. Unlike #621's legal text -- which is an external release input and
-- which 0185 therefore refused to seed -- capacity is CONFIGURATION the estate owns, and
-- `max_firms = NULL` is the only value that changes nothing about today's behaviour.
insert into clara.admission_capacity(id,max_firms,reason) values (true,null,null);

comment on table clara.admission_capacity is
  '#628: the estate''s admission capacity, one row. max_firms NULL = unlimited. Written only by '
  'clara.set_admission_capacity (operator-firm owner); read by clara._admission_capacity_state.';

-- THE PREDICATE, IN ONE BODY. Every surface that asks "is the estate full" asks THIS, so the
-- opening door's advisory answer and the claim door's enforced answer can never drift apart.
-- Granted to NOBODY: it is reached only from the four definer bodies below.
create function clara._admission_capacity_state() returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_max integer;
  v_count integer;
begin
  select c.max_firms into v_max from clara.admission_capacity c where c.id;
  select count(*)::int into v_count from clara.firms f where not f.is_operator;
  return jsonb_build_object(
    'max_firms', v_max,
    'firms_count', v_count,
    'full', (v_max is not null and v_count >= v_max));
end $$;
revoke all on function clara._admission_capacity_state() from public;
comment on function clara._admission_capacity_state() is
  '#628: {max_firms, firms_count, full} -- the ONE body every capacity surface reads, so the '
  'advisory pre-check in clara.open_checkout_intent and the enforced wall in clara.claim_paid_firm '
  'cannot disagree. firms_count counts NON-operator firms. Granted to nobody.';

-- THE WRITER. Authority is the `approve_firm_registration` predicate, byte-for-byte, exactly as
-- `clara.publish_legal_document` (0185 §E) and `clara.set_wake_source_enabled` (0133) carry it:
-- `_human_ctx(role_rank('owner'))` for the rank, then the operator-firm exists() -- re-derived at
-- call time, never cached. Receipt through `clara._audit`, the sole-writer convention 0133 uses.
create function clara.set_admission_capacity(
  p_max_firms integer, p_reason text, p_op_key text
) returns jsonb
  language plpgsql security definer
  set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare
  c record;
  v_dedupe jsonb;
  v_reason text;
  v_state jsonb;
  v_at timestamptz;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode='CLR04', detail='{"reason":"not_operator_firm"}';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;
  if p_max_firms is not null and p_max_firms < 0 then
    raise exception 'a capacity cannot be negative' using errcode='CLR10',
      detail='{"reason":"invalid_capacity"}';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then
    raise exception 'a reason is required' using errcode='CLR10', detail='{"reason":"reason_required"}';
  end if;
  if length(v_reason) > 500 then
    raise exception 'that reason is too long' using errcode='CLR10', detail='{"reason":"reason_too_long"}';
  end if;

  begin
    v_dedupe := clara._reserve_op(c.firm, 'set_admission_capacity', p_op_key,
      clara._hash(jsonb_build_object('max_firms',p_max_firms,'reason',v_reason,'actor',c.actor)));
  exception when sqlstate 'CLR10' then
    -- `_reserve_op`'s own untyped "op_key reused with different args" (0004:57), re-raised WITH a
    -- detail so every refusal this door emits carries (errcode, detail.reason).
    raise exception 'this op key was already used for a different capacity change'
      using errcode='CLR10', detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null then
    if coalesce(v_dedupe->>'pending','') = 'true' then
      raise exception 'this capacity change is already being recorded' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;                                  -- the ORIGINAL receipt, byte-identical
  end if;

  -- The SAME key clara.claim_paid_firm holds across its count-and-insert, so a capacity change
  -- cannot land between a claim's count and its firm.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clara.admission-capacity', 0));
  v_at := now();
  update clara.admission_capacity
     set max_firms = p_max_firms, reason = v_reason, updated_by = c.actor, updated_at = v_at
   where id;
  if not found then
    raise exception 'the admission capacity row is missing' using errcode='CLR10',
      detail='{"reason":"capacity_row_missing"}';
  end if;
  v_state := clara._admission_capacity_state();

  perform clara._audit(c.firm, c.actor, null, null, 'set_admission_capacity', null,
    jsonb_build_object('max_firms',p_max_firms,'reason',v_reason,
      'firms_count',v_state->'firms_count','full',v_state->'full'));

  return clara._finish_op(c.firm, 'set_admission_capacity', p_op_key, jsonb_build_object(
    'status','set','max_firms',
    case when p_max_firms is null then null else to_jsonb(p_max_firms) end,
    'reason',v_reason,'firms_count',v_state->'firms_count','full',v_state->'full',
    'updated_at',v_at));
end $$;
revoke all on function clara.set_admission_capacity(integer,text,text) from public;
grant execute on function clara.set_admission_capacity(integer,text,text) to clara_authenticated;
comment on function clara.set_admission_capacity(integer,text,text) is
  '#628: set the estate''s admission capacity (NULL = unlimited). Owner of the OPERATOR firm only '
  '(the approve_firm_registration predicate, re-derived at call time). op_receipts-idempotent; '
  'writes a clara._audit receipt. Refusals carry detail.reason: invalid_op_key | invalid_capacity '
  '| reason_required | reason_too_long | op_key_conflict | capacity_row_missing (CLR10), '
  'operation_in_flight (CLR13), not_operator_firm (CLR04).';

-- THE READER, BEHIND THE SAME WALL AS THE WRITER (#628 review S4). The first cut handed this to
-- ANY authenticated person, which handed every applicant `firms_count` -- how many firms this
-- estate has sold. That is a business-confidential number and no applicant surface needs it: the
-- only capacity fact they are ever shown is the BOOLEAN `capacity_full`, which travels on
-- `clara.get_own_checkout_progress` (§I) and is the thing apps/web actually reads
-- (apps/web/lib/registration/checkout-progress-reads.ts:108, the capacityFull field). No web lane calls this door at all;
-- it is the operator's own read of the estate's admission policy, so it carries the operator's own
-- predicate -- `clara.set_admission_capacity`'s, byte-for-byte, re-derived at call time.
create function clara.get_admission_capacity() returns jsonb
  language plpgsql stable security definer
  set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
begin
  perform clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode='CLR04', detail='{"reason":"not_operator_firm"}';
  end if;
  return clara._admission_capacity_state();
end $$;
revoke all on function clara.get_admission_capacity() from public;
grant execute on function clara.get_admission_capacity() to clara_authenticated;
comment on function clara.get_admission_capacity() is
  '#628 (review S4): {max_firms, firms_count, full} for the OPERATOR FIRM''s owner only -- the '
  'same predicate clara.set_admission_capacity carries, re-derived at call time. firms_count is '
  'business-confidential, so an applicant gets the boolean capacity_full on '
  'clara.get_own_checkout_progress instead, and no web lane calls this door. Refuses CLR04 '
  '(_human_ctx: no authenticated actor / no active membership / insufficient role) and CLR04 '
  'detail.reason not_operator_firm.';

-- =====================================================================================
-- §D  THE APPLICATION LEDGER AND THE WIDENED PROBLEM VOCABULARY.
-- =====================================================================================
create table clara.stripe_event_applications (
  event_id   text        primary key references clara.stripe_events(event_id),
  applied_at timestamptz not null default now(),
  outcome    text        not null,
  intent_id  uuid,
  constraint ck_stripe_event_applications_outcome check (
    outcome in ('paid','processing','payment_failed','expired','no_change')
  )
);

alter table clara.stripe_event_applications enable row level security;
alter table clara.stripe_event_applications force row level security;
create policy p_stripe_event_applications_owner on clara.stripe_event_applications
  for all to clara_fn_owner using (true) with check (true);

create trigger t_stripe_event_applications_append_only
  before update or delete on clara.stripe_event_applications
  for each row execute function clara._tf_append_only();
create trigger t_stripe_event_applications_no_truncate
  before truncate on clara.stripe_event_applications
  for each statement execute function clara._tf_no_truncate();

comment on table clara.stripe_event_applications is
  '#628: one append-only row per Stripe event clara.apply_stripe_events has ACTED on, carrying '
  'what it did. It exists because three of the applier''s four arms have a real effect and write '
  'no payment row, so 0160''s payment-row exclusion alone would re-select them forever and starve '
  'the LIMIT window (0160 section 4''s C-5 fix; checkout-gate-c2 c2.13). An arm that ends WITHOUT '
  'having applied the event -- 0160''s four problem arms -- writes no row here, so resolving the '
  'problem hands the event back to the next sweep (checkout-gate-c3 c3.52). #628''s own two '
  'problems are receipts about an event the applier HAS finished with, so both write a row: '
  'paid_after_terminal outcome paid, expired_after_paid outcome no_change (review S3).';

-- The vocabulary widens by exactly three, all #628's: two about an event that arrives after the
-- outcome is already settled, and `processing_timeout` (review S5) about an asynchronous payment
-- whose terminal event NEVER arrived -- the one state in which nothing at all will arrive to
-- release the applicant, so the estate must notice the silence itself.
alter table clara.stripe_event_problems drop constraint ck_stripe_event_problems_problem;
alter table clara.stripe_event_problems add constraint ck_stripe_event_problems_problem check (
  problem in ('payment_not_settled','metadata_missing','intent_not_found',
              'intent_mismatch','duplicate_payment',
              'expired_after_paid','paid_after_terminal','processing_timeout')
);

-- =====================================================================================
-- §E  clara.apply_stripe_events — RECUT. Four event types, one intent resolution, four arms.
--
--     WHAT MOVED, AND WHAT DID NOT. Every 0160 problem arm survives with its exact name, detail
--     shape and `on conflict` target; `payment_not_settled` is the ONE arm whose REACHABILITY
--     changes, because a completed-but-unsettled session is now a STATE (`processing`) rather
--     than an operator fault. The value stays in the vocabulary because the queue is append-only
--     history and a hosted estate already holds rows carrying it.
--
--     THE RESOLUTION ORDER MOVED, DELIBERATELY. 0160 asked "is it settled" FIRST and only then
--     looked for the intent, because the only thing it could do with an unsettled event was file
--     a problem. Every arm here needs the intent -- `processing` is a state ON the intent -- so
--     metadata, intent lookup and intent/session agreement are resolved FIRST, for every type,
--     and the type branch comes after. The consequence is visible and is the right answer: an
--     unsettled event naming an intent that does not exist is now `intent_not_found` rather than
--     `payment_not_settled`, which is the more specific true statement about it.
--
--     0160's TWO-BRANCH DYNAMIC BODY IS GONE. It existed because C-2 shipped BEFORE
--     `clara.firm_registration_payments` and had to name a relation that did not yet exist; §0
--     asserts that relation present, so the body is one static query and the duplicated loop is
--     not carried forward. Nothing about what the applier DOES changed with it.
--
--     THE SETTLEMENT TEST IS THE PAYMENT STATUS, AND ONLY THE PAYMENT STATUS (#628 review S1).
--     0160's second disjunct -- `mode='subscription' and session_status='complete'` -- is GONE:
--     every Clara Session is created with `mode: "subscription"`, so it made every completed
--     session settled, including the UNPAID one Stripe sends the moment an FPX customer leaves
--     the page. `payment_status in ('paid','no_payment_required')` is what it was standing in for.
--     `checkout.session.async_payment_succeeded` does not consult the test at all: that event type
--     IS Stripe's statement that the asynchronous payment settled, and a projection that disagreed
--     with its own type would be a recorder defect, not a settlement question.
--
--     AND ONE ARM THAT IS NOT ABOUT AN EVENT AT ALL (#628 review S5). After the event loop the
--     applier sweeps for `processing` intents older than a Stripe Checkout Session can live and
--     expires them with `processing_timeout`. It lives HERE because this body is the one thing the
--     runtime leader already runs every 60 seconds, and because the state it clears is the only
--     one in this file that NOTHING will ever arrive to clear: the exit from `processing` is a
--     terminal webhook, and the failure being handled is precisely that no terminal webhook came.
-- =====================================================================================
create or replace function clara.apply_stripe_events(p_limit integer default 100) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  -- #628 review S5. A Stripe Checkout Session's own lifetime: `expires_at` defaults to 24 hours
  -- after creation (Stripe API, Checkout Session `expires_at`), so an intent still `processing`
  -- after that is waiting on a session Stripe itself no longer honours. Named once, here, because
  -- a bare `interval '24 hours'` buried in a predicate is a policy nobody can find.
  c_processing_timeout constant interval := interval '24 hours';
  e record;
  i record;
  t record;
  v_examined integer := 0;
  v_applied integer := 0;
  v_problems integer := 0;
  v_constraint text;
  v_settled boolean;
  v_reason text;
  v_outcome text;
  v_prior text;
  v_timeout_event text;
begin
  if p_limit is null or p_limit<1 then
    raise exception 'limit must be positive' using errcode='CLR10';
  end if;

  -- C-5 starvation fix, extended: every skippable row is excluded inside the query, BEFORE LIMIT.
  -- THREE independent exclusions now, none of them weakened:
  --   · an OPEN problem (0160) -- released when an operator resolves it;
  --   · a payment row already carrying this event id (0160) -- which also covers a payment written
  --     by anything other than this applier, an operator repair and the rig's own fixtures;
  --   · an application row (§D) -- the only mark the three payment-less arms can leave.
  for e in
    select se.* from clara.stripe_events se
     where se.type in ('checkout.session.completed','checkout.session.async_payment_succeeded',
                       'checkout.session.async_payment_failed','checkout.session.expired')
       and not exists (
         select 1 from clara.stripe_event_problems sep
          where sep.event_id=se.event_id and sep.resolved_at is null
       )
       and not exists (
         select 1 from clara.firm_registration_payments frp
          where frp.stripe_event_id=se.event_id
       )
       and not exists (
         select 1 from clara.stripe_event_applications sea
          where sea.event_id=se.event_id
       )
     order by se.received_at,se.event_id
     limit p_limit
  loop
    v_examined := v_examined+1;

    if e.registration_id is null or e.applicant is null or e.intent_id is null
       or e.session_id is null then
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'metadata_missing',jsonb_build_object(
        'registration_id_present',e.registration_id is not null,
        'applicant_present',e.applicant is not null,
        'intent_id_present',e.intent_id is not null,
        'session_id_present',e.session_id is not null))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
      continue;
    end if;

    -- FOR UPDATE: every arm below may move this row, and two sweeps must not both move it.
    select ci.id,ci.registration_id,ci.applicant,ci.session_id,ci.status into i
      from clara.checkout_intents ci
     where ci.id=e.intent_id
     for update;
    if not found then
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'intent_not_found',jsonb_build_object('intent_id',e.intent_id))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
      continue;
    end if;

    if i.session_id is distinct from e.session_id
       or i.registration_id is distinct from e.registration_id
       or i.applicant is distinct from e.applicant then
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'intent_mismatch',jsonb_build_object(
        'intent_id',e.intent_id,
        'session_id_matches',i.session_id is not distinct from e.session_id,
        'registration_id_matches',i.registration_id is not distinct from e.registration_id,
        'applicant_matches',i.applicant is not distinct from e.applicant))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
      continue;
    end if;

    -- ARM (d): THE SESSION EXPIRED.
    if e.type='checkout.session.expired' then
      if i.status in ('paid','consumed') then
        -- Stripe expired a session whose money already landed. Nothing moves -- the payment is the
        -- authority -- but an operator must see it: a session that both paid and expired is either
        -- a reconciliation question or a Stripe-side anomaly, and neither is the applicant's.
        insert into clara.stripe_event_problems(event_id,problem,detail)
        values (e.event_id,'expired_after_paid',jsonb_build_object(
          'intent_id',i.id,'intent_status',i.status,'session_id',e.session_id))
        on conflict (event_id,problem) where resolved_at is null do nothing;
        if found then v_problems := v_problems+1; end if;
        -- …AND THE APPLIER IS DONE WITH THIS EVENT (#628 review S3). The problem is the OPERATOR's
        -- receipt; this row is the applier's own mark that it has finished. Without it the open
        -- problem was the only exclusion, so an operator RESOLVING it handed the event straight
        -- back to the next sweep, which filed the identical problem again -- a queue item that
        -- could never be cleared. `paid_after_terminal` already wrote both rows; this arm now
        -- does the same, with the outcome it actually had.
        insert into clara.stripe_event_applications(event_id,outcome,intent_id)
        values (e.event_id,'no_change',i.id) on conflict (event_id) do nothing;
        continue;
      end if;
      if i.status in ('session_created','processing','payment_failed') then
        update clara.checkout_intents
           set status='expired', status_reason='checkout_session_expired'
         where id=i.id;
        v_outcome := 'expired';
        v_applied := v_applied+1;
      else
        -- `cancelled` (the applicant got there first, and their own word is the better account of
        -- what happened) or already `expired`. One authoritative outcome, so nothing moves.
        v_outcome := 'no_change';
      end if;
      insert into clara.stripe_event_applications(event_id,outcome,intent_id)
      values (e.event_id,v_outcome,i.id) on conflict (event_id) do nothing;
      continue;
    end if;

    -- ARM (c): THE ASYNCHRONOUS PAYMENT FAILED.
    if e.type='checkout.session.async_payment_failed' then
      if i.status in ('paid','consumed') then
        v_outcome := 'no_change';                     -- money already landed; it is the authority
      elsif i.status in ('session_created','processing') then
        v_reason := left(coalesce(
          nullif(btrim(coalesce(e.projection->>'last_payment_error','')),''),
          nullif(btrim(coalesce(e.payment_status,'')),''),
          'async_payment_failed'), 200);
        -- A failure is PROOF the payment was in flight. When the `completed` event that would have
        -- recorded `processing` is delayed or lost, the applier records the state it implies
        -- rather than widening the transition table to admit session_created -> payment_failed.
        if i.status = 'session_created' then
          update clara.checkout_intents
             set status='processing', status_reason='async_payment_in_flight'
           where id=i.id;
        end if;
        update clara.checkout_intents
           set status='payment_failed', status_reason=v_reason
         where id=i.id;
        v_outcome := 'payment_failed';
        v_applied := v_applied+1;
      else
        v_outcome := 'no_change';                     -- expired, cancelled, or already failed
      end if;
      insert into clara.stripe_event_applications(event_id,outcome,intent_id)
      values (e.event_id,v_outcome,i.id) on conflict (event_id) do nothing;
      continue;
    end if;

    -- ARMS (a) and (b): THE SESSION COMPLETED, or THE ASYNCHRONOUS PAYMENT SUCCEEDED.
    if e.type='checkout.session.async_payment_succeeded' then
      v_settled := true;
    else
      -- #628 REVIEW S1 -- SETTLEMENT IS THE PAYMENT STATUS, AND ONLY THE PAYMENT STATUS.
      -- 0160's second disjunct was `mode='subscription' and session_status='complete'`, written
      -- when the RM0 beta plan's amount was 0 and the question it was really asking was "is
      -- anything owed at all". It names the MODE rather than the answer, and every Clara Checkout
      -- Session is created with mode subscription (apps/web/lib/checkout/stripe-session.ts:334, checkoutSessionForm) --
      -- so it was TRUE for every completed session this estate can receive, including the
      -- `status=complete, payment_status=unpaid` one Stripe sends the instant a delayed-
      -- notification customer (FPX) leaves the page. On that disjunct an UNPAID completed event
      -- recorded a payment row and flipped the intent to `paid`, the `async_payment_failed` that
      -- followed answered `no_change` against an already-paid intent, and a REFUSED payment had
      -- minted a claimable firm. `no_payment_required` IS the thing the mode clause stood in for,
      -- and it is Stripe's own statement that nothing is owed -- about the money, not the shape.
      -- 裁-58/裁-28 remains the standing tripwire: when amounts are ruled, this must tighten again
      -- to proof of the AMOUNT settled; it is still deliberately not a paid-price rule.
      v_settled := (e.payment_status in ('paid','no_payment_required')) is true;
    end if;

    if not v_settled then
      -- #628's central state: the customer finished Checkout and the money has not landed yet.
      -- This is Malaysian FPX and every other asynchronous method, and it is a WAIT, not a fault.
      if i.status = 'session_created' then
        update clara.checkout_intents
           set status='processing',
               status_reason=left(coalesce(nullif(btrim(coalesce(e.payment_status,'')),''),
                                           'payment_pending'),200)
         where id=i.id;
        v_outcome := 'processing';
        v_applied := v_applied+1;
      else
        -- Already paid, consumed, failed, expired or cancelled: a late `completed` event carrying
        -- an unsettled status cannot walk a settled outcome backwards.
        v_outcome := 'no_change';
      end if;
      insert into clara.stripe_event_applications(event_id,outcome,intent_id)
      values (e.event_id,v_outcome,i.id) on conflict (event_id) do nothing;
      continue;
    end if;

    v_prior := i.status;
    -- BLOCKER-4 (0160): this BEGIN/EXCEPTION block is a per-row subtransaction. Do not widen the
    -- stripe_event_id conflict target: uq_frp_registration must surface as duplicate_payment.
    begin
      insert into clara.firm_registration_payments(
        registration_id,applicant,stripe_event_id,stripe_session_id,
        stripe_customer_id,stripe_subscription_id
      ) values (
        e.registration_id,e.applicant,e.event_id,e.session_id,e.customer_id,e.subscription_id
      )
      on conflict (stripe_event_id) do nothing;
      if found then
        v_applied := v_applied+1;
      end if;
    exception when unique_violation then
      get stacked diagnostics v_constraint=constraint_name;
      if v_constraint is distinct from 'uq_frp_registration' then
        raise;
      end if;
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'duplicate_payment',jsonb_build_object(
        'registration_id',e.registration_id,'constraint',v_constraint))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
      continue;
    end;

    -- MONEY IS THE AUTHORITY. A payment landing on an intent the applicant or Stripe already
    -- closed still makes the intent `paid` -- and files a problem, because a human decided this
    -- checkout was over and then paid for it anyway.
    if v_prior in ('expired','cancelled','payment_failed') then
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'paid_after_terminal',jsonb_build_object(
        'intent_id',i.id,'prior_status',v_prior,'registration_id',e.registration_id))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
    end if;
    if v_prior not in ('paid','consumed') then
      update clara.checkout_intents set status='paid', status_reason=null where id=i.id;
    end if;
    insert into clara.stripe_event_applications(event_id,outcome,intent_id)
    values (e.event_id,'paid',i.id) on conflict (event_id) do nothing;
  end loop;

  -- =================================================================================
  -- ARM (e): THE PROCESSING TIMEOUT (#628 review S5). NOT ABOUT AN EVENT -- ABOUT A SILENCE.
  --
  -- `processing` has exactly one exit, a terminal asynchronous webhook, and until it arrives
  -- `clara.open_checkout_intent` refuses `checkout_in_progress` and `clara.cancel_checkout_intent`
  -- refuses `payment_in_flight`. So an applicant whose terminal event never comes -- Stripe never
  -- sends it, or every delivery of it fails -- can NEVER pay again, and nothing in the estate
  -- notices. This arm is the estate noticing: after `c_processing_timeout`, which is a Stripe
  -- Checkout Session's own default lifetime, the intent is expired with `processing_timeout` (the
  -- applicant may open a fresh checkout immediately) and an operator problem is filed so a human
  -- also looks at the money. A payment landing afterwards is unchanged: it is the existing
  -- `paid_after_terminal` path, and money is still the authority.
  --
  -- THE PROBLEM IS ANCHORED ON AN EVENT THIS APPLIER HAS ALREADY APPLIED. `stripe_event_problems`
  -- is keyed to an event by a NOT NULL foreign key, so the row must name one; the honest choice is
  -- the very event that recorded `processing`, found through its application row. That event
  -- already carries an application row, so the open problem this arm files can never re-expose it
  -- to the event loop above -- the exclusions are independent, and the weaker one being satisfied
  -- twice changes nothing. An intent that reached `processing` by any route OTHER than that arm
  -- (only a direct relation write can, since the relation grants every application role nothing)
  -- is still expired, without a problem row: the state is cleared either way, which is the half
  -- the applicant is stuck behind.
  --
  -- IDEMPOTENT AND CONCURRENCY-SAFE WITHOUT A NEW LOCK: the UPDATE re-states `status='processing'`
  -- in its own predicate, so a second sweep racing this one moves nothing and files nothing, and
  -- the lock it takes is the INTENT row -- first in the cohort's lock order, and the only row lock
  -- this arm takes at all.
  for t in
    select ci.id, ci.registration_id, ci.status_at
      from clara.checkout_intents ci
     where ci.status='processing'
       and ci.status_at < now() - c_processing_timeout
     order by ci.status_at, ci.id
     limit p_limit
  loop
    update clara.checkout_intents
       set status='expired', status_reason='processing_timeout'
     where id=t.id and status='processing';
    if not found then
      continue;                                       -- another sweep got there first
    end if;
    v_applied := v_applied+1;
    select sea.event_id into v_timeout_event
      from clara.stripe_event_applications sea
     where sea.intent_id=t.id and sea.outcome='processing'
     order by sea.applied_at desc, sea.event_id desc
     limit 1;
    if v_timeout_event is not null then
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (v_timeout_event,'processing_timeout',jsonb_build_object(
        'intent_id',t.id,'registration_id',t.registration_id,'status_at',t.status_at))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
    end if;
  end loop;

  return jsonb_build_object('examined',v_examined,'applied',v_applied,'problems',v_problems);
end $$;

comment on function clara.apply_stripe_events(integer) is
  '#628 (recut of 0160 section 4): applies checkout.session.completed / '
  'async_payment_succeeded / async_payment_failed / expired. Settlement is payment_status in '
  '(paid, no_payment_required) -- never the session mode (review S1) -- and async_payment_succeeded '
  'is settled by its type. A completed-but-unsettled session becomes the intent state '
  '`processing`, never a problem row. Problems: metadata_missing, intent_not_found, '
  'intent_mismatch, duplicate_payment (all 0160''s), plus expired_after_paid, paid_after_terminal '
  'and processing_timeout. Idempotent by three independent exclusions -- an open problem, a '
  'payment row carrying the event id, and a clara.stripe_event_applications row. After the event '
  'loop it also expires intents stuck in `processing` beyond a Checkout Session''s 24h lifetime '
  '(review S5); those count into `applied` and `problems` like any other effect, while `examined` '
  'counts EVENTS only.';

-- =====================================================================================
-- §F  clara.cancel_checkout_intent — the applicant's own way out of a checkout.
--
--     PRE-FIRM IDEMPOTENCY IS STRUCTURAL, and this door takes 0163 §4's answer verbatim rather
--     than inventing a second one: `clara._reserve_op` is keyed `(firm_id, fn, op_key)` and
--     `clara.op_receipts.firm_id` is NOT NULL, and an applicant cancelling a checkout has no firm.
--     `p_op_key` is therefore VALIDATED and deliberately not reserved -- exactly as
--     `clara.record_checkout_session` (0163:504) and `clara.open_checkout_intent` do -- and the
--     durable retry identity is the intent's own terminal state: a second call on a cancelled or
--     expired intent replays, whatever key it carries.
-- =====================================================================================
create function clara.cancel_checkout_intent(p_intent uuid, p_op_key text) returns jsonb
  language plpgsql security definer
  set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_intent clara.checkout_intents%rowtype;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04', detail='{"reason":"no_actor"}';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id=v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04', detail='{"reason":"unknown_actor"}';
  end if;
  if v_is_agent then
    raise exception 'the agent identity cannot cancel a checkout' using errcode='CLR04',
      detail='{"reason":"agent_actor"}';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;
  if p_intent is null then
    raise exception 'a checkout intent is required' using errcode='CLR10',
      detail='{"reason":"invalid_intent"}';
  end if;

  -- Serialize the decision itself: a concurrent webhook sweep holding this row wakes this call
  -- onto the COMMITTED state, so it takes the replay/refusal branch the committed state deserves
  -- rather than deciding from a stale snapshot. Ownership is proved before any UPDATE (W-S/M2).
  --
  -- ONE REFUSAL FOR "IT IS NOT THERE" AND "IT IS NOT YOURS" (#628 review B7). The first cut
  -- answered CLR10 `intent_not_found` for an absent intent and CLR04 `not_your_intent` for
  -- somebody else's, which is an existence oracle: a caller holding no intent at all could sort
  -- any id into real / not-real by the refusal it got back. Both are now the SAME answer, which is
  -- exactly the posture `clara.get_own_checkout_intent_session` takes by returning zero rows for
  -- a foreign registration and for an absent one alike. The applicant loses nothing: an id they
  -- actually hold is never either case.
  select i.* into v_intent from clara.checkout_intents i where i.id=p_intent for update;
  if not found or v_intent.applicant is distinct from v_actor then
    raise exception 'not your checkout intent' using errcode='CLR04',
      detail='{"reason":"not_your_intent"}';
  end if;

  if v_intent.status in ('expired','cancelled') then
    return jsonb_build_object('status',v_intent.status,'intent_id',p_intent,
      'session_id',v_intent.session_id,'replay',true);
  end if;
  if v_intent.status = 'processing' then
    raise exception 'this payment is still in flight' using errcode='CLR09',
      detail=jsonb_build_object('reason','payment_in_flight','intent_id',p_intent,
        'status',v_intent.status,'status_at',v_intent.status_at)::text;
  end if;
  if v_intent.status in ('paid','consumed') then
    raise exception 'this checkout is already paid' using errcode='CLR09',
      detail=jsonb_build_object('reason','already_paid','intent_id',p_intent,
        'status',v_intent.status,'status_at',v_intent.status_at)::text;
  end if;

  -- open | session_created | payment_failed -> cancelled. The trigger rules the move; this body
  -- only proposes it, so a state this file forgot cannot slip through as a cancellation.
  update clara.checkout_intents
     set status='cancelled', status_reason='applicant_cancelled'
   where id=p_intent;
  return jsonb_build_object('status','cancelled','intent_id',p_intent,
    'session_id',v_intent.session_id);
end $$;
revoke all on function clara.cancel_checkout_intent(uuid,text) from public;
grant execute on function clara.cancel_checkout_intent(uuid,text) to clara_authenticated;
comment on function clara.cancel_checkout_intent(uuid,text) is
  '#628: the applicant''s own way out of their checkout. open | session_created | payment_failed '
  '-> cancelled, returning {status:"cancelled", intent_id, session_id} so the web can expire the '
  'Stripe session. expired | cancelled replay {status, intent_id, session_id, replay:true}. '
  'Refusals carry detail.reason: no_actor | unknown_actor | agent_actor | not_your_intent (CLR04), '
  'invalid_op_key | invalid_intent (CLR10), payment_in_flight | already_paid '
  '(CLR09). An ABSENT intent and a FOREIGN one answer the SAME CLR04 not_your_intent -- no '
  'existence oracle (review B7). op_key is validated, not reserved -- pre-firm idempotency is structural (0163 '
  'section 4): the durable retry identity is the intent''s own terminal state.';

-- =====================================================================================
-- §G  clara.open_checkout_intent — RECUT on 0185 §G's body. THREE changes, every other arm and
--     comment 0185's word for word:
--
--       · a CAPACITY PRE-CHECK, advisory, placed before the origin rate wall so a full estate
--         refuses an applicant BEFORE it charges them a rate-limit slot and long before Stripe;
--       · ONE LIVE SESSION PER REGISTRATION: an intent already in `session_created` or
--         `processing` refuses CLR09 `checkout_in_progress` naming it, instead of silently
--         minting a second Stripe session against the same registration;
--       · the reuse arm is scoped to a status-`open` intent, so a `cancelled` intent (which is
--         also unstamped) is never resurrected and a fresh one is minted beside it.
-- =====================================================================================
-- `p_origin_digest` is sha256(pepper || proxy-observed client IP), never the browser `Origin`
-- header (裁-107 M1; checkout-gate design part 1 §4).
create or replace function clara.open_checkout_intent(
  p_registration uuid,p_origin_digest bytea,p_op_key text
) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_req clara.firm_registration_requests%rowtype;
  v_dpa_version integer;
  v_terms_version integer;
  v_missing jsonb;
  v_price_local_key text;
  v_stripe_price_id text;
  v_intent uuid;
  v_already_paid boolean;
  v_capacity jsonb;
  v_live clara.checkout_intents%rowtype;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id=v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if v_is_agent then
    raise exception 'the agent identity cannot claim a firm' using errcode='CLR04';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- The registration-row lock makes an absent-intent lookup below race-safe: two concurrent
  -- retries for one applicant cannot both observe no unstamped intent and insert independently.
  select r.* into v_req from clara.firm_registration_requests r where r.id=p_registration for update;
  if not found then
    raise exception 'unknown registration request' using errcode='CLR10';
  end if;
  if v_req.applicant is distinct from v_actor then
    raise exception 'not your registration request' using errcode='CLR04';
  end if;
  if v_req.status<>'open' then
    raise exception 'this registration is no longer open (status: %)',v_req.status using errcode='CLR09';
  end if;

  -- #621: BOTH KINDS, each PUBLISHED and each accepted at THAT EXACT VERSION AND THOSE EXACT
  -- BYTES. A kind with nothing published is missing for the same reason an unaccepted one is:
  -- there is no legal acceptance behind this checkout either way. Replaces 0163's single
  -- "the data processing agreement is not signed" arm, whose sentence is kept in detail.message
  -- so a caller that matched on it still has it.
  --
  -- THE CHECK AND THE PIN ARE ONE OBSERVATION (#621 review, SEC-1). The first cut asked THREE
  -- questions in THREE statements: which kinds are missing, then `dpa`'s published version, then
  -- `terms`'s. Under READ COMMITTED each statement takes its own snapshot, so a
  -- `publish_legal_document` that commits BETWEEN them is invisible to the check and visible to
  -- the pin. The applicant is then let through on v1 -- which they did accept -- and the intent is
  -- pinned to v2, which they have never seen. They pay. `claim_paid_firm` re-checks the PINNED
  -- version, finds no acceptance of v2, and refuses `legal_not_accepted` on a PAID registration:
  -- money taken, firm unclaimable, and nothing in this file can undo it from the applicant's side.
  -- Two changes close it, and BOTH are here because either alone leaves a window:
  --   · THE PUBLISH DOOR'S OWN PER-KIND LOCKS, taken here too. `publish_legal_document` (0185 §E)
  --     serialises on `pg_advisory_xact_lock(hashtextextended('clara.legal-publish:'||kind,0))`
  --     before it reads the current row `for update`; this door takes the SAME two keys, so a
  --     publish that starts while an applicant is inside the door BLOCKS until this transaction
  --     commits, rather than landing between the check and the pin. Taken in a FIXED ORDER --
  --     terms, then dpa -- so two callers can never take them in opposite orders; the publish door
  --     takes exactly ONE of them, so it can only ever wait, never hold one and want the other.
  --   · ONE STATEMENT yielding the missing list AND both versions, so the refusal and the pin are
  --     decided from the SAME rows even if the lock above were ever loosened.
  -- The cost is that two applicants opening a checkout in the same instant serialise on these two
  -- keys for the remainder of their transactions. This door is taken once per registration and
  -- everything after it here is an indexed point read, so that is the cheap half of the trade.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clara.legal-publish:terms', 0));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clara.legal-publish:dpa', 0));
  select coalesce(jsonb_agg(k.kind order by k.kind) filter (where v.version is null),'[]'::jsonb),
         max(v.version) filter (where k.kind='dpa'),
         max(v.version) filter (where k.kind='terms')
    into v_missing, v_dpa_version, v_terms_version
    from (select unnest(array['dpa','terms']) as kind) k
    left join lateral (
      select d.version
        from clara.legal_documents d
        join clara.legal_acceptances a
          on a.user_id=v_actor and a.kind=d.kind and a.version=d.version and a.body_sha256=d.body_sha256
       where d.kind=k.kind and d.status='published'
    ) v on true;
  if jsonb_array_length(v_missing)>0 then
    raise exception 'the required legal agreements are not accepted' using errcode='CLR09',
      detail=jsonb_build_object('reason','legal_not_accepted','missing',v_missing,
        'message','the data processing agreement is not signed')::text;
  end if;

  -- #628 CAPACITY PRE-CHECK -- ADVISORY, AND SAID SO. No lock is taken: this door's job is to stop
  -- an applicant paying into a full estate, not to reserve them a slot, and holding an estate-wide
  -- lock across a Stripe round trip would be the wrong trade by a wide margin.
  -- `clara.claim_paid_firm` is the WALL, under the lock, and it is the only place a slot is
  -- actually taken. Placed BEFORE the origin rate wall so a refused applicant is not also charged
  -- a rate-limit slot for a checkout the estate was never going to admit.
  v_capacity := clara._admission_capacity_state();
  if (v_capacity->>'full')::boolean then
    raise exception 'the estate is not admitting new firms right now' using errcode='CLR09',
      detail=jsonb_build_object('reason','capacity_reached',
        'max_firms',v_capacity->'max_firms','firms_count',v_capacity->'firms_count')::text;
  end if;

  if p_origin_digest is null or octet_length(p_origin_digest)<>32 then
    raise exception 'an origin digest is required' using errcode='CLR10';
  end if;
  -- The rolling-window read and evidence append are one linearized act per digest. A hash
  -- collision only over-serializes unrelated origins; it can never weaken the wall.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'clara.checkout-origin:'||pg_catalog.encode(p_origin_digest,'hex'),0));
  if exists (
    select 1 from clara.registration_rate_events e
     where e.origin_digest=p_origin_digest
       and e.observed_at>=now()-interval '24 hours'
       and e.applicant<>v_actor
  ) then
    raise exception 'too many firm registrations from this location today' using errcode='CLR09';
  end if;
  -- X10 needs a real, honest read of firm_registration_payments. This opening door and the
  -- operator's unconsumed-payment read door below are both named in the five-body census; hiding
  -- a real dependency from a catalog census on a money surface is the wrong kind of clever.
  select exists (
    select 1 from clara.firm_registration_payments p
     where p.registration_id=p_registration and p.consumed_at is null
  ) into v_already_paid;
  if v_already_paid then
    raise exception 'this registration is already paid' using errcode='CLR09';
  end if;

  -- #628 ONE LIVE SESSION PER REGISTRATION. Before this file the door reused an UNSTAMPED intent
  -- and otherwise minted another, with no wall between them -- so an applicant who abandoned a
  -- live Stripe Checkout Session and re-POSTed `/checkout` ended up with TWO live sessions against
  -- one registration, of which at most one can ever become a payment (`uq_frp_registration`) and
  -- the other becomes a customer who paid and a `duplicate_payment` row in an operator queue.
  -- The registration row is already locked above, so this read and the insert below are one act.
  -- `payment_failed`, `expired` and `cancelled` intents are deliberately NOT live: they are left
  -- exactly as they are and a NEW intent is minted beside them, which is what makes retry after a
  -- failed or abandoned payment work at all.
  select i.* into v_live from clara.checkout_intents i
   where i.registration_id=p_registration and i.applicant=v_actor
     and i.status in ('session_created','processing')
   order by i.opened_at desc,i.id desc
   limit 1;
  if found then
    raise exception 'this registration already has a checkout in progress' using errcode='CLR09',
      detail=jsonb_build_object('reason','checkout_in_progress','intent_id',v_live.id,
        'session_id',v_live.session_id,'status',v_live.status,'status_at',v_live.status_at)::text;
  end if;

  select b.local_key into v_price_local_key
    from clara.billing_plans b where b.is_current;
  if not found then
    raise exception 'no current billing plan is configured' using errcode='CLR10';
  end if;
  select m.stripe_id into v_stripe_price_id
    from clara.stripe_object_map m
   where m.object_kind='price' and m.local_key=v_price_local_key;
  if not found then
    raise exception 'no stripe price is mapped for this plan' using errcode='CLR10';
  end if;

  -- Money-surface rule: reuse only an OPEN intent whose plan is still the current plan.
  -- A stale-plan intent stays open and untouched while this call takes the fresh-intent path.
  -- #628 adds `status='open'` to 0163's `session_id is null` predicate: the two were equivalent
  -- until this file, and are not any more -- a CANCELLED intent is also unstamped, and reusing one
  -- would resurrect a checkout its own applicant ended.
  -- `p_op_key` is validated above but deliberately not reserved: the durable retry identity is
  -- the applicant's one locked, unstamped CURRENT-plan intent. A session stamp consumes it.
  select i.id into v_intent
    from clara.checkout_intents i
   where i.registration_id=p_registration and i.applicant=v_actor and i.session_id is null
     and i.status='open'
     and i.price_local_key=v_price_local_key
   order by i.opened_at,i.id
   limit 1
   for update;
  if found then
    -- A REUSED PRE-0185 INTENT LEAVES THE DOOR FULLY PINNED (#621 review, SEC-2). An intent opened
    -- before 0185 carries `terms_version` NULL, and the arm above matches it like any other
    -- unstamped current-plan intent -- so without this write the applicant walks the #621 door, is
    -- verified to have accepted BOTH kinds, and still pays against an intent with no terms pin,
    -- which `claim_paid_firm` then waves through on the legacy carve-out 0185 §D describes. The
    -- value written is `v_terms_version` from the SINGLE observation above, under the publish
    -- locks: the version this caller has just been proven to accept, never a fresh read that could
    -- have moved. Only NULL -> value, and only while the intent is unstamped: that is the one
    -- other update `_tf_checkout_intents_session_stamp` admits (§B), and it refuses every other
    -- rewrite.
    update clara.checkout_intents
       set terms_version=v_terms_version
     where id=v_intent and terms_version is null;
    return jsonb_build_object(
      'intent_id',v_intent,'price_local_key',v_price_local_key,'stripe_price_id',v_stripe_price_id);
  end if;

  insert into clara.registration_rate_events(applicant,origin_digest)
  values (v_actor,p_origin_digest);
  insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version,terms_version)
  values (p_registration,v_actor,v_price_local_key,v_dpa_version,v_terms_version)
  returning id into v_intent;
  return jsonb_build_object(
    'intent_id',v_intent,'price_local_key',v_price_local_key,'stripe_price_id',v_stripe_price_id);
end $$;

-- =====================================================================================
-- §H  clara.claim_paid_firm — RECUT on 0185 §G's body. TWO changes, every other arm 0185's word
--     for word:
--
--       · THE CAPACITY WALL. `pg_advisory_xact_lock(hashtextextended('clara.admission-capacity',0))`
--         is taken BEFORE the registration row lock and held to commit, so the count this call
--         reads and the firm it inserts are ONE serialized act. The refusal itself is the LAST
--         wall -- after payment, legal and membership have all passed -- so an applicant is only
--         ever told about capacity when everything else about them is in order. Two callers
--         racing into the last slot therefore produce exactly ONE firm; the loser's payment stays
--         UNCONSUMED and can be refunded or admitted later.
--       · THE INTENT REACHES ITS TERMINAL STATE. The claim is what consumes the payment, so it is
--         also what moves the intent to `consumed`. It is written as TWO admitted moves -- first
--         to `paid` if the intent is not there yet, then to `consumed` -- because a payment row
--         written by anything other than the applier (an operator repair, the rig's own fixtures)
--         leaves an intent whose state has not caught up, and the claim itself is proof the
--         payment exists.
--
--     …AND ONE MORE, FROM THE REVIEW (S2): THE LOCK ORDER, WHICH IS THE COHORT'S AND IS STATED
--     HERE ONCE — `clara.checkout_intents` FIRST, `clara.firm_registration_requests` SECOND.
--
--     The cut above took the registration `for update` and then wrote the intent, while
--     `clara.apply_stripe_events` takes the INTENT `for update` and then inserts a payment row
--     whose `fk_frp_registration_applicant` (0163:231) takes KEY SHARE on that same registration.
--     Registration->intent against intent->registration is a cycle: a webhook sweep applying an
--     event for a registration whose applicant is claiming their firm at that instant deadlocks,
--     one of the two dies with 40P01, and NOTHING on the claim path retries it -- the applicant
--     sees a raw failure on the one call that turns their money into a firm.
--
--     So this body now resolves the applicant's intent id WITHOUT a lock (from the unconsumed
--     payment's session, the same evidence it has always used), takes the INTENT row lock, and
--     only then the registration row lock. Every authoritative read below is unchanged and still
--     happens under both locks; the pre-read decides only WHICH row to lock first.
--
--     WHY THE PRE-READ CANNOT BE STALE IN A WAY THAT MATTERS: `uq_frp_registration` admits exactly
--     ONE payment row per registration, so a payment seen before the locks is the same payment
--     seen after them, and the only divergence possible is a payment COMMITTING in between -- in
--     which case the applier that wrote it has already committed and released the intent it held.
--
--     `clara.open_checkout_intent` is deliberately outside this claim and does not need to be in
--     it: the ONLY intent row it locks is an UNSTAMPED, `open` one, and an applier only ever
--     resolves an intent that a Stripe session id points at, so the two bodies' intent lock sets
--     cannot intersect. §J probes the order of THIS body, by literal, in the direction that
--     matters.
-- =====================================================================================
-- The unlocked probe gives settled later retries a receipt. The locked re-read deliberately has
-- no replay carve-out: a concurrent loser wakes onto W7 and raises CLR09 (W-K).
create or replace function clara.claim_paid_firm(p_registration uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_email text;
  v_req clara.firm_registration_requests%rowtype;
  v_plan uuid;
  v_payment uuid;
  v_payment_session text;
  v_dpa_version integer;
  v_terms_version integer;
  v_missing jsonb;
  v_signature uuid;
  v_result jsonb;
  v_firm uuid;
  v_capacity jsonb;
  v_intent uuid;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id=v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if v_is_agent then
    raise exception 'the agent identity cannot claim a firm' using errcode='CLR04';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select r.* into v_req from clara.firm_registration_requests r where r.id=p_registration;
  if not found then
    raise exception 'unknown registration request' using errcode='CLR10';
  end if;
  if v_req.applicant is distinct from v_actor then
    raise exception 'not your registration request' using errcode='CLR04';
  end if;
  v_email:=clara._jwt_email();
  if v_email is null or v_email is distinct from (
    select lower(u.email) from clara.users u where u.id=v_actor
  ) then
    raise exception 'a verified email claim is required' using errcode='CLR04';
  end if;

  if v_req.firm_id is not null then
    select p.id into v_plan from clara.onboarding_plans p
     where p.firm_id=v_req.firm_id and p.scope_kind='firm';
    if not found then
      raise exception 'the registration firm has no onboarding plan' using errcode='CLR10';
    end if;
    return jsonb_build_object(
      'firm_id',v_req.firm_id,'plan_id',v_plan,'registration_id',p_registration,'replay',true);
  end if;

  -- #628 THE CAPACITY LOCK, TAKEN BEFORE THE REGISTRATION ROW LOCK. Held for the remainder of this
  -- transaction, so the `firms` count read below and the `_create_firm_core` insert are one
  -- serialized act. It is taken AFTER the unlocked replay probe above on purpose: a settled retry
  -- is answered from its own committed firm and has no business queueing behind the estate's
  -- admission lock. The key is the same one `clara.set_admission_capacity` takes, so a capacity
  -- change cannot land between this call's count and its firm either.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clara.admission-capacity', 0));

  -- #628 REVIEW S2 · THE COHORT'S LOCK ORDER: THE INTENT, THEN THE REGISTRATION. Resolved with NO
  -- lock, from the same evidence this body has always used -- the unconsumed payment's session --
  -- purely to learn WHICH intent row to take first. `uq_frp_registration` makes that payment
  -- unique per registration, so this read cannot name a different intent than the authoritative
  -- reads below; if no payment exists yet there is no intent to lock and the refusal further down
  -- is unchanged. Taking the registration first and reaching the intent afterwards is the 40P01
  -- cycle against clara.apply_stripe_events, which holds the intent and then takes KEY SHARE on
  -- the registration through fk_frp_registration_applicant.
  select p.stripe_session_id into v_payment_session
    from clara.firm_registration_payments p
   where p.registration_id=p_registration and p.consumed_at is null;
  select i.id into v_intent from clara.checkout_intents i where i.session_id = v_payment_session;
  if v_intent is not null then
    perform 1 from clara.checkout_intents i where i.id = v_intent for update;
  end if;

  select r.* into v_req from clara.firm_registration_requests r where r.id=p_registration for update;
  -- NIT7 (opus review on #493): without this, a vanished row leaves v_req an all-NULL record
  -- (plpgsql's documented INTO behavior on zero rows) and the wall below reads
  -- `NULL is not null or NULL<>'open'` = `false or NULL` = NULL -- three-valued logic reads a
  -- bare NULL condition as FALSE in an IF, so the wall silently does not fire and execution falls
  -- through into the folded door's write path on a phantom row. Fail closed, explicitly, on the
  -- highest-stakes read in this file.
  if not found then
    raise exception 'unknown registration request' using errcode='CLR10';
  end if;
  if v_req.firm_id is not null or v_req.status<>'open' then
    raise exception 'this registration is no longer open (status: %)',v_req.status using errcode='CLR09';
  end if;

  select p.id,p.stripe_session_id into v_payment,v_payment_session
    from clara.firm_registration_payments p
   where p.registration_id=p_registration and p.consumed_at is null;
  if not found then
    raise exception 'no completed payment for this registration' using errcode='CLR09';
  end if;
  select i.id,i.dpa_version,i.terms_version into v_intent,v_dpa_version,v_terms_version
    from clara.checkout_intents i where i.session_id=v_payment_session;
  if not found then
    raise exception 'the data processing agreement is not signed' using errcode='CLR09',
      detail='{"reason":"legal_not_accepted","missing":["dpa","terms"],"cause":"intent_not_found"}';
  end if;
  -- #621: the acceptance must exist at the version the INTENT pinned, for every kind the intent
  -- pinned. `terms_version` NULL passes the terms half: after SEC-2 the only intent that can still
  -- carry a NULL pin is one SESSION-STAMPED before 0185 (0185 §D -- the opening door stamps the
  -- pin on any legacy intent it REUSES), i.e. an applicant who paid before that file existed, and
  -- they must still be able to claim their firm.
  v_missing:='[]'::jsonb;
  if not exists (
    select 1 from clara.legal_acceptances a
     where a.user_id=v_actor and a.kind='dpa' and a.version=v_dpa_version
  ) then
    v_missing:=v_missing||'["dpa"]'::jsonb;
  end if;
  if v_terms_version is not null and not exists (
    select 1 from clara.legal_acceptances a
     where a.user_id=v_actor and a.kind='terms' and a.version=v_terms_version
  ) then
    v_missing:=v_missing||'["terms"]'::jsonb;
  end if;
  if jsonb_array_length(v_missing)>0 then
    raise exception 'the required legal agreements are not accepted' using errcode='CLR09',
      detail=jsonb_build_object('reason','legal_not_accepted','missing',v_missing,
        'message','the data processing agreement is not signed')::text;
  end if;
  select a.id into v_signature
    from clara.legal_acceptances a
   where a.user_id=v_actor and a.kind='dpa' and a.version=v_dpa_version;

  -- #628 THE CAPACITY WALL, under the lock taken above. LAST, so an applicant only ever hears
  -- about capacity once payment, legal evidence and their own registration are all in order.
  v_capacity := clara._admission_capacity_state();
  if (v_capacity->>'full')::boolean then
    raise exception 'the estate is not admitting new firms right now' using errcode='CLR09',
      detail=jsonb_build_object('reason','capacity_reached',
        'max_firms',v_capacity->'max_firms','firms_count',v_capacity->'firms_count')::text;
  end if;

  v_result:=clara._create_firm_core(v_actor,v_req.firm_name);
  v_firm:=(v_result->>'firm_id')::uuid;
  update clara.firm_registration_requests
     set status='approved',decided_at=now(),firm_id=v_firm
   where id=p_registration;
  update clara.firm_registration_payments
     set consumed_at=now(),consumed_firm_id=v_firm,consumed_dpa_signature=v_signature
   where id=v_payment and consumed_at is null;
  if not found then
    raise exception 'no completed payment for this registration' using errcode='CLR09';
  end if;
  -- #628 THE INTENT REACHES ITS TERMINAL STATE, in two admitted moves. The first is a no-op for
  -- every intent the applier has already settled; it exists for a payment row written by anything
  -- else, whose intent's state has not caught up -- and the claim, holding that payment row, is
  -- itself the proof the payment exists.
  update clara.checkout_intents set status='paid', status_reason=null
   where id=v_intent and status in ('session_created','processing','payment_failed',
                                    'expired','cancelled');
  update clara.checkout_intents set status='consumed'
   where id=v_intent and status='paid';

  perform clara._audit(
    v_firm,v_actor,null,null,'claim_paid_firm',null,
    jsonb_build_object('registration_id',p_registration,'plan_id',v_result->>'plan_id'));
  perform clara._append_event(
    v_firm,'firm.created',null,v_actor,null,null,null,null,null,
    jsonb_build_object('plan_id',v_result->>'plan_id'));
  perform clara._append_event(
    v_firm,'firm_registration.paid',null,v_actor,null,null,null,null,null,
    jsonb_build_object('registration_id',p_registration,'payment_id',v_payment));
  return jsonb_build_object(
    'firm_id',v_result->>'firm_id','plan_id',v_result->>'plan_id','registration_id',p_registration);
end $$;

-- =====================================================================================
-- §I  THE TWO APPLICANT-FACING READS.
--
--     `get_own_checkout_progress` is RE-MINTED rather than replaced: a plpgsql function's OUT
--     columns are part of its identity and `create or replace` cannot widen them. Its first two
--     columns, their names, their order and the expressions behind them are 0164's byte for byte,
--     so `apps/web`'s existing `checkout_open` / `paid_unconsumed` reads are untouched.
--
--     IT GAINS A plan_cache_mode PIN THAT 0164 DID NOT HAVE, AND THAT IS A REVIEWED CHANGE.
--     0183's house rule (restated at 0184:1930 and asserted by 0185 §H): a plpgsql body that binds
--     the calling person into a cached statement is served from a GENERIC plan from the sixth call
--     of a pooled connection, and a generic plan estimates a per-applicant predicate at the table
--     average. This body binds `v_actor` and `p_registration` into predicates on two tables that
--     grow with every registration in the estate. 0185 deliberately did NOT add the pin to the two
--     0163 doors it recut, on the ground that it changed their bodies and not how they are
--     planned; this door is being CREATED here, so that ground does not apply to it.
-- =====================================================================================
drop function clara.get_own_checkout_progress(uuid);
create function clara.get_own_checkout_progress(p_registration uuid)
returns table(checkout_open boolean, paid_unconsumed boolean,
              intent_status text, intent_status_at timestamptz, intent_status_reason text,
              intent_session_id text, capacity_full boolean)
  language plpgsql stable security definer
  set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
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

  -- The intent reported is the applicant's MOST RECENT one for this registration -- the one a
  -- resume or retry is about. Every earlier intent of the same registration is, by §G's one-live-
  -- session rule, already in a terminal state.
  return query
  select
    exists (select 1 from clara.checkout_intents i
             where i.registration_id=p_registration and i.applicant=v_actor
               and i.session_id is not null),
    exists (select 1 from clara.firm_registration_payments p
             where p.registration_id=p_registration and p.applicant=v_actor
               and p.consumed_at is null),
    latest.status, latest.status_at, latest.status_reason, latest.session_id,
    (clara._admission_capacity_state()->>'full')::boolean
  from (select 1) _always
  left join lateral (
    select i.status,i.status_at,i.status_reason,i.session_id
      from clara.checkout_intents i
     where i.registration_id=p_registration and i.applicant=v_actor
     order by i.opened_at desc,i.id desc
     limit 1
  ) latest on true;
end $$;
revoke all on function clara.get_own_checkout_progress(uuid) from public;
grant execute on function clara.get_own_checkout_progress(uuid) to clara_authenticated;
comment on function clara.get_own_checkout_progress(uuid) is
  '#628 (re-mint of 0164 section 3): the applicant''s OWN checkout progress. checkout_open and '
  'paid_unconsumed are 0164''s, byte for byte; intent_status / intent_status_at / '
  'intent_status_reason / intent_session_id describe the applicant''s MOST RECENT intent for this '
  'registration (NULL when there is none) and capacity_full is the estate''s admission answer. '
  'CLR04 for a foreign registration, CLR10 for an unknown or null one.';

-- The resume/expire read. It answers about the LIVE intent only -- `session_created` or
-- `processing` -- because those are the two states in which a Stripe Checkout Session is still
-- worth resuming or worth expiring. NO EXISTENCE ORACLE: a foreign registration answers no row,
-- exactly as an absent one does, so a caller cannot enumerate other people's registrations
-- through it. That is a deliberate difference from `get_own_checkout_progress`, which REFUSES a
-- foreign registration -- that door is reached from a page the applicant is already on, this one
-- from a resume control that may carry any id at all.
create function clara.get_own_checkout_intent_session(p_registration uuid)
returns table(intent_id uuid, session_id text, status text)
  language plpgsql stable security definer
  set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare
  v_actor uuid;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  if p_registration is null then
    return;
  end if;
  return query
  select i.id,i.session_id,i.status
    from clara.checkout_intents i
   where i.registration_id=p_registration and i.applicant=v_actor
     and i.status in ('session_created','processing')
   order by i.opened_at desc,i.id desc
   limit 1;
end $$;
revoke all on function clara.get_own_checkout_intent_session(uuid) from public;
grant execute on function clara.get_own_checkout_intent_session(uuid) to clara_authenticated;
comment on function clara.get_own_checkout_intent_session(uuid) is
  '#628: the applicant''s LIVE checkout intent (session_created | processing) for a registration, '
  'so the web can resume or expire its Stripe session. NO existence oracle: a foreign or absent '
  'registration both answer NO ROW. CLR04 only for an unauthenticated caller.';

reset role;

-- =====================================================================================
-- §J  TAIL CENSUS. Every claim re-READ from the live catalog, and every prosrc probe reads the
--     body with its `--` comment tails removed by the literal-aware scanner 0184 §J established
--     and 0185 §H reused -- plpgsql keeps a function's own comments in prosrc, so a census that
--     greps the raw text can be satisfied by a SENTENCE ABOUT the code instead of the code.
--     `clara._record_journal_entry_core` is in the strip's input for ONE reason: it is the
--     estate's known line carrying `--` INSIDE a string literal, and it is this census's control
--     that the scanner did not cut there.
-- =====================================================================================
do $w628_tail$
declare
  v_src text; v_n int; v_sig text; v_line text;
  v_bodies jsonb := '{}'::jsonb;
  v_body text; v_out text; v_par int; v_kept text; v_rest text; v_head text; v_p int;
begin
  foreach v_sig in array array[
      'clara._tf_checkout_intents_session_stamp()',
      'clara._tf_checkout_intents_insert_stamp()',
      'clara.apply_stripe_events(integer)',
      'clara.cancel_checkout_intent(uuid,text)',
      'clara.open_checkout_intent(uuid,bytea,text)',
      'clara.claim_paid_firm(uuid,text)',
      'clara.get_own_checkout_progress(uuid)',
      'clara.get_own_checkout_intent_session(uuid)',
      'clara.set_admission_capacity(integer,text,text)',
      'clara.get_admission_capacity()',
      'clara._admission_capacity_state()',
      'clara.record_checkout_session(uuid,text,text)',
      'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)']
  loop
    select p.prosrc into v_body from pg_proc p where p.oid = v_sig::regprocedure;
    v_out := ''; v_par := 0;
    for v_line in select l from regexp_split_to_table(v_body, chr(10)) with ordinality t(l, n) order by n
    loop
      v_kept := ''; v_rest := v_line;
      loop
        v_p := position('--' in v_rest);
        if v_p = 0 then
          v_kept := v_kept || v_rest;
          v_par := (v_par + length(v_rest) - length(replace(v_rest, '''', ''))) % 2;
          exit;
        end if;
        v_head := substr(v_rest, 1, v_p - 1);
        v_par := (v_par + length(v_head) - length(replace(v_head, '''', ''))) % 2;
        if v_par = 0 then
          v_kept := v_kept || v_head;
          exit;
        end if;
        v_kept := v_kept || v_head || '--';
        v_rest := substr(v_rest, v_p + 2);
      end loop;
      v_out := v_out || v_kept || chr(10);
    end loop;
    v_bodies := v_bodies || jsonb_build_object(v_sig, v_out);
  end loop;

  -- VACUITY CONTROL, both sides.
  v_src := v_bodies ->> 'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)';
  if position('''client is not active -- no posting'' using errcode=''CLR10''' in v_src) = 0 then
    raise exception '#628 tail: the comment strip is not literal-aware -- it cut inside a string literal, so every probe below is unsound'
      using errcode='CLR10';
  end if;
  v_src := v_bodies ->> 'clara.apply_stripe_events(integer)';
  if position('MONEY IS THE AUTHORITY' in v_src) > 0 then
    raise exception '#628 tail: the comment strip left prose in the body -- every probe below could be satisfied by a sentence about the code'
      using errcode='CLR10';
  end if;
  if position('''paid_after_terminal''' in v_src) = 0 then
    raise exception '#628 tail: the comment strip mutilated a probed statement' using errcode='CLR10';
  end if;

  -- 1 · THE INTENT'S NEW STATE, AND ITS EXACT TUPLE.
  select string_agg(attname,',' order by attnum) into v_src
    from pg_attribute where attrelid='clara.checkout_intents'::regclass and attnum>0 and not attisdropped;
  if v_src is distinct from
     'id,registration_id,applicant,price_local_key,session_id,opened_at,terms_version,dpa_version,dpa_kind,terms_kind,status,status_at,status_reason' then
    raise exception '#628 tail: unexpected checkout_intents columns: %', v_src using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='checkout_intents'
     and ((column_name='status' and data_type='text' and is_nullable='NO')
       or (column_name='status_at' and data_type='timestamp with time zone' and is_nullable='NO')
       or (column_name='status_reason' and data_type='text' and is_nullable='YES'));
  if v_n <> 3 then
    raise exception '#628 tail: the three status columns are not NOT NULL / NOT NULL / nullable (% of 3)', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint
   where conrelid='clara.checkout_intents'::regclass
     and conname in ('ck_checkout_intents_status','ck_checkout_intents_status_session',
                     'ck_checkout_intents_status_reason');
  if v_n <> 3 then
    raise exception '#628 tail: checkout_intents carries % of its 3 named status constraints', v_n
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_src from pg_constraint
   where conrelid='clara.checkout_intents'::regclass and conname='ck_checkout_intents_status';
  foreach v_sig in array array['open','session_created','processing','paid','consumed',
                               'expired','payment_failed','cancelled'] loop
    if position(''''||v_sig||'''' in v_src) = 0 then
      raise exception '#628 tail: the status CHECK admits no %', v_sig using errcode='CLR10';
    end if;
  end loop;
  -- The backfill, RE-DERIVED from the same evidence rather than trusted.
  -- Nothing has transitioned yet -- this census runs in the same transaction as the backfill --
  -- so EVERY row must agree with the evidence, with no carve-out for a post-0186 state.
  select count(*)::int into v_n from clara.checkout_intents i
   where i.status is distinct from (
     case when exists (select 1 from clara.firm_registration_payments p
                        where p.stripe_session_id=i.session_id and p.consumed_at is not null) then 'consumed'
          when exists (select 1 from clara.firm_registration_payments p
                        where p.stripe_session_id=i.session_id) then 'paid'
          when i.session_id is not null then 'session_created'
          else 'open' end);
  if v_n <> 0 then
    raise exception '#628 tail: % backfilled intent(s) disagree with the payment evidence', v_n
      using errcode='CLR10';
  end if;
  -- NO ROW IS BOTH STAMPED AND `open`: the stamp IS the transition.
  select count(*)::int into v_n from clara.checkout_intents where session_id is not null and status='open';
  if v_n <> 0 then
    raise exception '#628 tail: % stamped intent(s) are still `open`', v_n using errcode='CLR10';
  end if;

  -- 2 · THE TRANSITION WALL: present, ARMED, and carrying all three moves by literal probe.
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.checkout_intents'::regclass
     and tgname='t_checkout_intents_session_stamp' and tgenabled='O';
  if v_n <> 1 then
    raise exception '#628 tail: t_checkout_intents_session_stamp is not armed after the backfill'
      using errcode='CLR10';
  end if;
  v_src := v_bodies ->> 'clara._tf_checkout_intents_session_stamp()';
  -- MOVE 1 survives verbatim: 0185 SEC-2's legacy terms pin.
  if position('old.terms_version is null and new.terms_version is not null' in v_src) = 0 then
    raise exception '#628 tail: the recut trigger dropped 0185''s NULL->value terms pin, so open_checkout_intent cannot close the reused-legacy-intent gap'
      using errcode='CLR10';
  end if;
  -- MOVE 2 EXECUTES the transition rather than checking one: that is what makes a stamped intent
  -- structurally session_created, and what lets record_checkout_session stay uncut.
  if position('new.status := ''session_created''' in v_src) = 0
     or position('new.status_at := now()' in v_src) = 0 then
    raise exception '#628 tail: the session stamp does not itself write open -> session_created'
      using errcode='CLR10';
  end if;
  -- MOVE 3's whole table, each pair probed by literal.
  foreach v_sig in array array[
      '(''open'',''cancelled'')',
      '(''session_created'',''processing'')','(''session_created'',''paid'')',
      '(''session_created'',''expired'')','(''session_created'',''cancelled'')',
      '(''processing'',''paid'')','(''processing'',''payment_failed'')','(''processing'',''expired'')',
      '(''payment_failed'',''expired'')','(''payment_failed'',''cancelled'')','(''payment_failed'',''paid'')',
      '(''paid'',''consumed'')','(''expired'',''paid'')','(''cancelled'',''paid'')'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#628 tail: the transition table admits no %', v_sig using errcode='CLR10';
    end if;
  end loop;
  if position('''invalid_transition''' in v_src) = 0
     or position('checkout_intents permits only the first session_id stamp' in v_src) = 0 then
    raise exception '#628 tail: the trigger lost one of its two refusal shapes (CLR09 invalid_transition / 0158''s CLR10 sentence)'
      using errcode='CLR10';
  end if;
  -- THE INSERT ARM (review S6): a sibling BEFORE INSERT trigger, ARMED, that writes the three
  -- state columns itself. Without it the eight-value CHECK was the whole law on an INSERT and a
  -- definer could mint an intent that was born `paid`.
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.checkout_intents'::regclass
     and tgname='t_checkout_intents_insert_stamp' and tgenabled='O'
     and tgfoid='clara._tf_checkout_intents_insert_stamp()'::regprocedure;
  if v_n <> 1 then
    raise exception '#628 tail: t_checkout_intents_insert_stamp is absent or not armed'
      using errcode='CLR10';
  end if;
  if pg_catalog.has_function_privilege('public','clara._tf_checkout_intents_insert_stamp()','execute') then
    raise exception '#628 tail: the insert arm is PUBLIC-executable -- a trigger body is the system''s to call, and PUBLIC''s default EXECUTE widens every application role''s routine set (checkout-gate-c2 c2.8 reads it as an exact equality)'
      using errcode='CLR10';
  end if;
  v_src := v_bodies ->> 'clara._tf_checkout_intents_insert_stamp()';
  if position('new.status := ''open''' in v_src) = 0
     or position('new.status_at := now()' in v_src) = 0
     or position('new.status_reason := null' in v_src) = 0
     or position('''invalid_transition''' in v_src) = 0 then
    raise exception '#628 tail: the insert arm does not force open/now()/NULL and refuse invalid_transition'
      using errcode='CLR10';
  end if;

  -- …and `clara.record_checkout_session` is NOT recut by this file: it still stamps a session and
  -- still says nothing about status. If it ever did, the structural claim above would be a
  -- convention instead.
  v_src := v_bodies ->> 'clara.record_checkout_session(uuid,text,text)';
  if position('set session_id=p_session_id' in v_src) = 0 or position('status' in v_src) > 0 then
    raise exception '#628 tail: record_checkout_session was recut -- the session stamp must remain the trigger''s transition, not a writer''s'
      using errcode='CLR10';
  end if;

  -- 3 · THE APPLIER'S ARMS, present by literal probe on the stripped body.
  v_src := v_bodies ->> 'clara.apply_stripe_events(integer)';
  foreach v_sig in array array[
      '''checkout.session.completed''','''checkout.session.async_payment_succeeded''',
      '''checkout.session.async_payment_failed''','''checkout.session.expired''',
      '''metadata_missing''','''intent_not_found''','''intent_mismatch''','''duplicate_payment''',
      '''expired_after_paid''','''paid_after_terminal''',
      '''processing_timeout''',
      'uq_frp_registration','clara.stripe_event_applications','for update',
      'status=''processing''','status=''payment_failed''','status=''expired''','status=''paid''',
      'e.payment_status in (''paid'',''no_payment_required'')',
      'c_processing_timeout constant interval := interval ''24 hours''',
      'ci.status_at < now() - c_processing_timeout',
      '(e.event_id,''no_change'',i.id)'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#628 tail: the apply_stripe_events recut carries no % arm', v_sig using errcode='CLR10';
    end if;
  end loop;
  -- THE ONE ARM WHOSE REACHABILITY CHANGES: a completed-but-unsettled session is a STATE now, so
  -- the applier must no longer be able to file `payment_not_settled` at all.
  if position('''payment_not_settled''' in v_src) > 0 then
    raise exception '#628 tail: apply_stripe_events still files payment_not_settled -- an asynchronous method''s ordinary wait would go on being written into an operator queue as a fault'
      using errcode='CLR10';
  end if;
  -- #628 REVIEW S1 · THE MODE DISJUNCT IS GONE, and the probe is NEGATIVE because its presence is
  -- the defect: every Clara Session is mode=subscription, so a settlement test that reads the mode
  -- calls an UNPAID completed session settled and records a payment for money that never landed.
  if position('e.mode' in v_src) > 0 then
    raise exception '#628 tail: apply_stripe_events still decides settlement from the session MODE -- an unpaid completed session would record a payment and mint a claimable firm'
      using errcode='CLR10';
  end if;
  -- #628 REVIEW S2 · THE OTHER HALF OF THE COHORT'S LOCK ORDER: the applier holds the INTENT
  -- before it inserts a payment row that takes KEY SHARE on the registration. Positional, and
  -- anchored on the single row lock this body takes.
  select count(*)::int into v_n from regexp_matches(v_src,'for update','g') m;
  if v_n <> 1 then
    raise exception '#628 tail: apply_stripe_events carries % row locks, not the single intent lock this probe anchors on', v_n
      using errcode='CLR10';
  end if;
  if position('for update' in v_src) > position('insert into clara.firm_registration_payments' in v_src) then
    raise exception '#628 tail: apply_stripe_events inserts the payment row before it locks the intent -- the lock order it shares with claim_paid_firm is intent -> registration'
      using errcode='CLR10';
  end if;
  -- …and 0160's TWO-BRANCH dynamic body is gone with its forward reference, not carried forward.
  if position('execute' in lower(v_src)) > 0 then
    raise exception '#628 tail: apply_stripe_events still builds its own SQL -- the C-2 forward reference it existed for is closed'
      using errcode='CLR10';
  end if;
  -- The vocabulary widened by exactly two, and kept all five of 0160's.
  select pg_get_constraintdef(oid) into v_src from pg_constraint
   where conrelid='clara.stripe_event_problems'::regclass and conname='ck_stripe_event_problems_problem';
  foreach v_sig in array array['payment_not_settled','metadata_missing','intent_not_found',
      'intent_mismatch','duplicate_payment','expired_after_paid','paid_after_terminal',
      'processing_timeout'] loop
    if position(''''||v_sig||'''' in v_src) = 0 then
      raise exception '#628 tail: the problem vocabulary lost %', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THE RELATIONS: forced RLS, ONE owner policy, ZERO application-role grants, and NO TABLE
  --     ACL AT ALL. `relacl IS NULL` is strictly stronger than "no application-role grant" and is
  --     what keeps this file's DR round-trip honest: the FIRST explicit grant or revoke on a
  --     relation MATERIALISES the owner's until-then-implicit ACL, `pg_dump` emits nothing for an
  --     ACL equal to the owner default, and the restored copy therefore differs forever (#621 §H
  --     cell 1b, measured). The estate grants nothing on tables; this file issues no relation
  --     grant or revoke either, and asserts it on the two it mints AND on the two it alters.
  foreach v_sig in array array['admission_capacity','stripe_event_applications'] loop
    select count(*)::int into v_n
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=v_sig and c.relkind='r'
       and c.relrowsecurity and c.relforcerowsecurity
       and pg_get_userbyid(c.relowner)='clara_fn_owner'
       and (select count(*) from pg_policy p where p.polrelid=c.oid)=1;
    if v_n <> 1 then
      raise exception '#628 tail: clara.% is absent or not owner-confined with forced RLS and one policy', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  foreach v_sig in array array['admission_capacity','stripe_event_applications',
                               'checkout_intents','stripe_event_problems'] loop
    select count(*)::int into v_n
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=v_sig and c.relacl is not null;
    if v_n <> 0 then
      raise exception '#628 tail: clara.% carries a MATERIALISED table ACL (%) -- the estate grants nothing on tables, and a materialised owner-default ACL is a permanent DR restore diff',
        v_sig, (select c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='clara' and c.relname=v_sig)
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from information_schema.role_table_grants g
   where g.table_schema='clara'
     and g.table_name in ('admission_capacity','stripe_event_applications')
     and g.grantee not in ('clara_fn_owner','postgres');
  if v_n <> 0 then
    raise exception '#628 tail: the #628 relations carry % application-role table grant(s)', v_n
      using errcode='CLR10';
  end if;
  -- The capacity row exists, exactly once, and is unlimited as seeded.
  select count(*)::int into v_n from clara.admission_capacity;
  if v_n <> 1 then
    raise exception '#628 tail: clara.admission_capacity holds % row(s), expected exactly 1', v_n
      using errcode='CLR10';
  end if;
  if exists (select 1 from clara.admission_capacity where not id) then
    raise exception '#628 tail: the capacity singleton key is not TRUE' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid in ('clara.admission_capacity'::regclass,'clara.stripe_event_applications'::regclass)
     and not tgisinternal and tgenabled='O';
  if v_n <> 4 then
    raise exception '#628 tail: the #628 relations carry % of their 4 enabled guard triggers', v_n
      using errcode='CLR10';
  end if;

  -- 5 · THE FOUR NEW DOORS: PUBLIC-revoked, clara_authenticated-granted, reachable by NO other
  --     application role, owner-confined, search_path-pinned AND plan_cache_mode-pinned.
  foreach v_sig in array array[
      'clara.cancel_checkout_intent(uuid,text)',
      'clara.set_admission_capacity(integer,text,text)',
      'clara.get_admission_capacity()',
      'clara.get_own_checkout_intent_session(uuid)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#628 tail: % did not land', v_sig using errcode='CLR10';
    end if;
    if pg_catalog.has_function_privilege('public', v_sig, 'execute') then
      raise exception '#628 tail: % is PUBLIC-executable', v_sig using errcode='CLR10';
    end if;
    if not pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '#628 tail: clara_authenticated cannot execute %', v_sig using errcode='CLR10';
    end if;
    if pg_catalog.has_function_privilege('clara_agent_ro', v_sig, 'execute')
       or pg_catalog.has_function_privilege('clara_runtime', v_sig, 'execute')
       or pg_catalog.has_function_privilege('clara_wake_interactive', v_sig, 'execute')
       or pg_catalog.has_function_privilege('clara_stripe_webhook', v_sig, 'execute') then
      raise exception '#628 tail: % is reachable by a role that must not hold it', v_sig
        using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
     where p.oid=v_sig::regprocedure and pg_get_userbyid(p.proowner)='clara_fn_owner'
       and p.prosecdef
       and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=clara, pg_temp']
       and 'plan_cache_mode=force_custom_plan' = any(coalesce(p.proconfig,'{}'::text[]));
    if v_n <> 1 then
      raise exception '#628 tail: % is not a clara_fn_owner-owned SECURITY DEFINER with search_path AND plan_cache_mode pinned', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  -- The re-minted 0164 door keeps its exact grant posture AND gains the pin (see §I).
  v_sig := 'clara.get_own_checkout_progress(uuid)';
  select count(*)::int into v_n from pg_proc p
   where p.oid=v_sig::regprocedure and p.prosecdef and p.provolatile='s'
     and pg_get_userbyid(p.proowner)='clara_fn_owner'
     and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=clara, pg_temp']
     and 'plan_cache_mode=force_custom_plan' = any(coalesce(p.proconfig,'{}'::text[]));
  if v_n <> 1 then
    raise exception '#628 tail: the re-minted get_own_checkout_progress is not a stable owner-confined definer with both pins'
      using errcode='CLR10';
  end if;
  if pg_catalog.has_function_privilege('public', v_sig, 'execute')
     or not pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
    raise exception '#628 tail: the re-minted get_own_checkout_progress lost 0164''s grant posture'
      using errcode='CLR10';
  end if;
  select string_agg(t.nam||':'||format_type(t.typ,-1), ',' order by t.ord) into v_src
    from pg_proc p,
         unnest(p.proallargtypes,p.proargmodes,p.proargnames)
           with ordinality t(typ,mode,nam,ord)
   where p.oid=v_sig::regprocedure and t.mode='t';
  if v_src is distinct from
     'checkout_open:boolean,paid_unconsumed:boolean,intent_status:text,intent_status_at:timestamp with time zone,intent_status_reason:text,intent_session_id:text,capacity_full:boolean' then
    raise exception '#628 tail: get_own_checkout_progress''s OUT columns are % -- 0164''s first two must stay first, in order and by name', coalesce(v_src,'(none)')
      using errcode='CLR10';
  end if;
  -- #628 REVIEW S4 · THE CAPACITY READ IS THE OPERATOR'S, NOT EVERY APPLICANT'S. firms_count is
  -- how many firms this estate has sold; the door carries set_admission_capacity's own predicate.
  v_src := v_bodies ->> 'clara.get_admission_capacity()';
  if position('clara._human_ctx(clara.role_rank(''owner''))' in v_src) = 0
     or position('f.is_operator' in v_src) = 0
     or position('not_operator_firm' in v_src) = 0 then
    raise exception '#628 tail: get_admission_capacity does not carry the operator-firm owner predicate -- firms_count would be readable by any authenticated person'
      using errcode='CLR10';
  end if;

  -- The capacity predicate is ONE body, and NOBODY may call it directly.
  if pg_catalog.has_function_privilege('public','clara._admission_capacity_state()','execute')
     or pg_catalog.has_function_privilege('clara_authenticated','clara._admission_capacity_state()','execute') then
    raise exception '#628 tail: clara._admission_capacity_state is reachable by an application role'
      using errcode='CLR10';
  end if;
  foreach v_sig in array array['clara.open_checkout_intent(uuid,bytea,text)',
      'clara.claim_paid_firm(uuid,text)','clara.get_admission_capacity()',
      'clara.get_own_checkout_progress(uuid)','clara.set_admission_capacity(integer,text,text)'] loop
    if position('clara._admission_capacity_state()' in (v_bodies ->> v_sig)) = 0 then
      raise exception '#628 tail: % does not read the ONE capacity predicate -- a second copy is how the advisory answer and the enforced wall start disagreeing', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- 6 · THE CANCEL DOOR'S OWN ROSTER, read from the stripped body.
  v_src := v_bodies ->> 'clara.cancel_checkout_intent(uuid,text)';
  foreach v_sig in array array['no_actor','unknown_actor','agent_actor','invalid_op_key',
      'invalid_intent','not_your_intent','payment_in_flight','already_paid',
      'for update','status=''cancelled'''] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#628 tail: cancel_checkout_intent carries no %', v_sig using errcode='CLR10';
    end if;
  end loop;
  -- #628 REVIEW B7 · NO EXISTENCE ORACLE. An absent intent and a foreign one answer the SAME
  -- refusal, so the door cannot be used to sort ids into real and not-real.
  if position('intent_not_found' in v_src) > 0 then
    raise exception '#628 tail: cancel_checkout_intent still answers intent_not_found -- an absent intent and a foreign one must be ONE refusal'
      using errcode='CLR10';
  end if;

  -- 7 · THE TWO MONEY-SURFACE RECUTS: #628's arms landed AND no 0163/0185 arm was dropped.
  v_src := v_bodies ->> 'clara.open_checkout_intent(uuid,bytea,text)';
  foreach v_sig in array array['checkout_in_progress','capacity_reached',
      'i.status in (''session_created'',''processing'')','i.status=''open''',
      'legal_not_accepted','''missing''','terms_version','clara.legal_acceptances',
      'clara.legal-publish:terms','clara.legal-publish:dpa','pg_advisory_xact_lock',
      'left join lateral','into v_missing, v_dpa_version, v_terms_version',
      'set terms_version=v_terms_version','and terms_version is null',
      'too many firm registrations from this location today',
      'this registration is already paid','no current billing plan is configured',
      'no stripe price is mapped for this plan','an origin digest is required',
      'not your registration request','registration_rate_events','for update'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#628 tail: the open_checkout_intent recut dropped or never gained % ', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if position('clara.dpa_signatures' in v_src) > 0 then
    raise exception '#628 tail: open_checkout_intent reaches the retired evidence table' using errcode='CLR10';
  end if;
  -- THE CAPACITY PRE-CHECK PRECEDES THE ORIGIN RATE WALL. Positional, because the whole point of
  -- the placement is that a refused applicant is not ALSO charged a rate-limit slot.
  if position('capacity_reached' in v_src) > position('clara.checkout-origin:' in v_src) then
    raise exception '#628 tail: open_checkout_intent checks capacity AFTER the origin rate wall -- an applicant the estate was never going to admit would still burn an origin slot'
      using errcode='CLR10';
  end if;

  v_src := v_bodies ->> 'clara.claim_paid_firm(uuid,text)';
  foreach v_sig in array array['capacity_reached','clara.admission-capacity',
      'status=''consumed''','legal_not_accepted','v_terms_version is not null',
      'clara.legal_acceptances','a verified email claim is required',
      'no completed payment for this registration','clara._create_firm_core',
      'firm_registration.paid','consumed_dpa_signature','for update'] loop
    if position(v_sig in v_src) = 0 then
      raise exception '#628 tail: the claim_paid_firm recut dropped or never gained % ', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if position('clara.dpa_signatures' in v_src) > 0 then
    raise exception '#628 tail: claim_paid_firm reaches the retired evidence table' using errcode='CLR10';
  end if;
  -- #628 REVIEW S2 · THE COHORT'S LOCK ORDER, BY LITERAL PROBE: THE INTENT LOCK PRECEDES THE
  -- REGISTRATION LOCK. This body takes EXACTLY TWO row locks and each has its own spelling, so the
  -- probe is positional on the two spellings rather than on a bare `for update` — and the negative
  -- direction is the one that matters: registration-then-intent here is a deadlock cycle with
  -- clara.apply_stripe_events, which holds the intent and then takes KEY SHARE on the registration
  -- through fk_frp_registration_applicant (0163:231).
  if position('where i.id = v_intent for update' in v_src) = 0
     or position('where r.id=p_registration for update' in v_src) = 0 then
    raise exception '#628 tail: claim_paid_firm does not take BOTH the intent lock and the registration lock in their probed spellings'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n
    from regexp_matches(v_src,'for update','g') m;
  if v_n <> 2 then
    raise exception '#628 tail: claim_paid_firm carries % row locks, not the intent-then-registration pair this probe anchors on', v_n
      using errcode='CLR10';
  end if;
  if position('where i.id = v_intent for update' in v_src)
     > position('where r.id=p_registration for update' in v_src) then
    raise exception '#628 tail: claim_paid_firm locks the REGISTRATION before the INTENT -- that is the 40P01 cycle with apply_stripe_events, on the one call that turns an applicant''s money into a firm'
      using errcode='CLR10';
  end if;
  -- THE CAPACITY LOCK PRECEDES BOTH ROW LOCKS. Positional for its own reason: taken after them,
  -- the count and the insert would no longer be one serialized act. The unlocked replay probe and
  -- the unlocked intent RESOLUTION above it deliberately take no lock at all.
  if position('clara.admission-capacity' in v_src)
     > position('where i.id = v_intent for update' in v_src) then
    raise exception '#628 tail: claim_paid_firm takes the admission lock AFTER its first row lock -- two callers could then both read the same pre-insert count'
      using errcode='CLR10';
  end if;

  raise notice '#628 tail: OK -- clara.checkout_intents carries status/status_at/status_reason under a CHECK over the eight #628 values, backfilled from the payment evidence (matched on stripe_session_id, never on registration alone) and re-derived here rather than trusted, with no stamped row left `open`; clara._tf_checkout_intents_session_stamp is ARMED again after the backfill and is the ONLY authority over the state -- it keeps 0185 SEC-2''s NULL->value terms pin, EXECUTES open -> session_created as part of the first session_id stamp (so clara.record_checkout_session stays uncut and a stamped intent is structurally session_created), admits exactly the fourteen lawful status writes plus the session stamp -- including the three MONEY-IS-THE-AUTHORITY arms expired/cancelled/payment_failed -> paid that #628''s applier contract requires -- and refuses anything else CLR09 invalid_transition beside 0158''s own CLR10 sentence; clara.apply_stripe_events now applies FOUR event types, files a completed-but-unsettled session as the intent state `processing` instead of the operator problem payment_not_settled (which it can no longer file at all), keeps every 0160 problem arm including the uq_frp_registration duplicate_payment subtransaction, adds expired_after_paid and paid_after_terminal, drops 0160''s two-branch dynamic body with the C-2 forward reference it existed for, and is idempotent by three independent exclusions (an open problem, a payment row carrying the event id, and the new append-only clara.stripe_event_applications row); clara.admission_capacity holds exactly ONE unlimited row under forced RLS with one owner policy, and clara._admission_capacity_state is the single predicate all five capacity surfaces read, granted to nobody; clara.claim_paid_firm takes pg_advisory_xact_lock(''clara.admission-capacity'') BEFORE its registration row lock so its count and its firm are one serialized act, refuses capacity_reached LAST (after payment and legal both pass) and moves the intent to consumed in two admitted steps, while clara.open_checkout_intent checks the SAME predicate advisorily BEFORE the origin rate wall and refuses checkout_in_progress for a session_created/processing intent so one registration can never carry two live Stripe sessions; clara.cancel_checkout_intent, clara.set_admission_capacity, clara.get_admission_capacity and clara.get_own_checkout_intent_session are clara_fn_owner-owned SECURITY DEFINERs, PUBLIC-revoked, clara_authenticated-ONLY (no agent, runtime, wake or webhook role reaches them) with BOTH search_path and plan_cache_mode = force_custom_plan pinned, the re-minted clara.get_own_checkout_progress keeps 0164''s first two OUT columns byte for byte in front of its five new ones and gains the same plan pin; and not one of the four touched relations carries a table ACL -- relacl IS NULL throughout, so this file''s DR round-trip is grant-identical. AND THE REVIEW ROUND: settlement is payment_status in (paid, no_payment_required) with the session-MODE disjunct gone from the body entirely (S1); clara.claim_paid_firm and clara.apply_stripe_events share ONE lock order, checkout_intents before firm_registration_requests, probed positionally in both bodies (S2); expired_after_paid writes an application row with outcome no_change beside its problem, so resolving it cannot re-file it forever (S3); clara.get_admission_capacity carries set_admission_capacity''s operator-firm owner predicate, so firms_count is no longer readable by every authenticated person (S4); the applier expires a `processing` intent older than a Checkout Session''s own 24h lifetime and files processing_timeout, which is the only exit from a state whose terminal webhook never arrived (S5); t_checkout_intents_insert_stamp forces a newborn intent to open/now()/NULL and refuses any other status CLR09 invalid_transition from=null (S6); and clara.cancel_checkout_intent answers ONE refusal for an absent and a foreign intent alike, with no intent_not_found left in its body (B7).';
end
$w628_tail$;
