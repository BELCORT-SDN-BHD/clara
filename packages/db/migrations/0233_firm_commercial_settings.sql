-- 0233_firm_commercial_settings — #635 (refresh spec; journey H): THE FIRM SEES ITS OWN REAL
-- LEGAL, COMMERCIAL AND MODEL-USAGE STATE, AND AN OWNER CAN PUT A WITHDRAWN LEGAL STANDING BACK.
-- =====================================================================================
-- Spec of record: issue #635 AC2 — "versioned, attributable legal; plan/payment/invoice/usage
-- with source, range and freshness". Domain words: CONTEXT.md — "Firm legal standing",
-- "Billing plan", "Model usage summary".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. THREE `security definer` reads granted to
-- `clara_authenticated` and nobody else — `clara.get_firm_legal_standing()`,
-- `clara.get_firm_commercial_state()` and `clara.get_firm_ai_usage(date)` — plus ONE body-only
-- recut of `clara.get_llm_usage_summary(uuid,date,uuid)` that adds the rank floor it has never
-- had.
--
-- WHAT IT DOES NOT ADD. No table. No column. No trigger. No CHECK. No policy. No purpose
-- widening. No `drop function` anywhere. **This file creates, alters and drops no relation at
-- all**, and §C re-reads the catalog to say so rather than this comment asserting it. It issues
-- no table grant either: the four relations it reads — `legal_documents`, `legal_acceptances`,
-- `billing_plans`, `firm_registration_payments` — carry ZERO application-role privilege before
-- this file and ZERO after it, which is precisely why the reads are DEFINER doors.
--
-- =====================================================================================
-- WHY THE FLOOR GOES ON THE DOOR, NOT ON A WALLED WRAPPER BESIDE IT.
--
-- `clara.get_llm_usage_summary` (created `0110_f_a9_llm_usage_reshape.sql:706`, never spliced —
-- a grep over all 219 merged files returns 0110 alone) has exactly ONE wall today: `p_firm is
-- distinct from clara.jwt_firm()` (0110:714-717). It has NO rank floor. So on the shipped
-- estate a VIEWER can read the firm's entire model spend, and that was MEASURED on the #635 rig
-- before this file was written (brief §4, `p635.measure.usage_viewer_today`: carol, a viewer of
-- firm A, succeeds).
--
-- The alternative shape — leave the base door open and put the floor on a new wrapper — would
-- have shipped a wall with a door beside it in the same wall. Anything that can reach PostgREST
-- can name the base door directly, so a wrapper floor protects nothing; it only makes the
-- estate LOOK floored. The floor therefore goes into the body, as its FIRST statement, before
-- the existing firm wall, so that:
--   · an under-ranked caller meets CLR04 (authority) whatever firm they name, and
--   · a correctly-ranked caller naming a FOREIGN firm still meets CLR11 `client_not_in_firm`,
--     the `f-a9.C19` contract, unchanged.
--
-- BLAST RADIUS, MEASURED RATHER THAN ASSUMED. Zero callers of this door exist in `apps/web` or
-- `packages/runtime` (grep, 2026-09-19). Every behaviour persona in
-- `packages/db/tests/f-a9-usage-reshape.test.mjs` is a firm OWNER, so no existing cell
-- exercises the class that moves. The ACL cell at `f-a9-usage-reshape.test.mjs:671-679` asserts
-- a GRANT, which a body floor does not touch — and §C below proves the ACL is byte-identical to
-- the pre-image. The hosted estate could in principle hold an out-of-repo consumer; that
-- question goes to the owner in the wave report rather than deferring the recut (brief §7.4
-- #16, ruled).
--
-- WHY THE RECUT CANNOT SIMPLY CARRY THE NEW `price_currency` COLUMN. `create or replace` cannot
-- widen a `returns table` column list — that needs DROP + CREATE, and the old grant dies with
-- the old function (the 0186:1703 lesson). So the currency travels on the NEW wrapper, which
-- also binds `clara.jwt_firm()` INSIDE the database so no firm id crosses the wire at all.
--
-- =====================================================================================
-- THE THREE NON-GOALS, IN THE FILE THAT WOULD OTHERWISE BE THE PLACE TO SMUGGLE THEM.
--
-- (1) NOT ONE PRICE APPEARS. `clara.billing_plans` holds one row, seeded UNRULED
--     (`0163:214-215`: `('clara-beta-2026','Clara Beta',0,'MYR',false,true)`). `amounts_ruled =
--     false` is the DATABASE saying the price is not set. This door forwards `amount_cents`,
--     `currency` AND `amounts_ruled` together so the surface can use the flag as its RENDER
--     CONDITION: the card says "Beta — no price has been set for this plan yet" today, and a
--     later owner ruling that sets a real amount shows a figure with NO code change. What must
--     never happen is `RM 0.00` or a substitute number (C-01 / C-56).
--
-- (2) NO RAW STRIPE IDENTIFIER LEAVES THE DATABASE. `firm_registration_payments` carries
--     `stripe_customer_id` and `stripe_subscription_id`; this door projects them as BOOLEANS
--     and nothing else. The battery scans the whole returned jsonb as text for `cus_`/`sub_`
--     rather than checking key by key, because a value arriving under an unexpected key is the
--     failure worth catching.
--
-- (3) `clara.firm_document_limits` IS FLOORED NOWHERE BY THIS FILE. Its viewer-readable SELECT
--     grant (`0007:810-811`, `:2742-2744`) is a written, reviewed grant; changing it would turn
--     this ticket into a relation-level migration. The capacity numbers ride door 2 (which IS
--     admin-floored) purely so the settings card can render them beside the plan — that is an
--     AFFORDANCE, not a wall, and §C asserts the grant is unmoved in both directions. The
--     residual (there is no human WRITER for that relation at all — `0196:36-40`, whose header
--     names #635) is filed as a follow-up, not silently absorbed here.
--
-- =====================================================================================
-- THE STANDING DOOR IS ARITY 0 FOREVER, AND THAT IS A SAFETY PROPERTY.
--
-- `clara._accounting_work_egress_live(p_firm, p_client)` (0195:875) is UNGRANTED (0195:911)
-- precisely because a per-client answer is an existence oracle for another firm's books
-- (0195:871-874). `get_firm_legal_standing()` answers limb (a) ONLY — the firm's legal standing
-- — and takes no client argument, so it cannot become that oracle by a later widening. §C
-- asserts the arity, and the battery asserts it again from the other side.
--
-- WHAT IT DOES NOT RETURN: `body`. The bytes stay `clara.get_current_legal_documents()`'s job
-- (0185:634-671). Two surfaces rendering the same agreement from two reads is two chances to
-- render bytes a third digest was taken over, and the acceptance door binds to the BYTES.
--
-- WHY `accepted_by_name` IS RESOLVED INSIDE THE DEFINER BODY. `clara.users_visible`
-- (0137:291-298) re-derives `jwt_firm()` and admits AGENTS; joining it here would make the
-- answer depend on a second, differently-scoped predicate. The join is `clara.users` to
-- `clara.firm_memberships` on the BOUND firm, and the whole attribution triple
-- (`accepted_by`/`accepted_at`/`accepted_by_name`) is masked to NULL below bookkeeper —
-- mirroring `0141:526`, the ROW floor. (`0141:517` masks EMAIL below admin and is NOT the
-- precedent here: a name on a roster is bookkeeper-readable in this estate.)
--
-- =====================================================================================
-- LOCK ORDER: THESE DOORS TAKE NO ROW LOCK AT ALL.
--
-- All four bodies are reads. No `for update`, no `for share`, no `for key share`, no INSERT,
-- UPDATE or DELETE, no `_reserve_op`/`_finish_op`, no `_audit`, no `_append_event`, no receipt
-- and no event. §C asserts that from the live source. A body that locks nothing cannot join the
-- `accounting_plans → accounting_work → agent_tasks → agent_interruptions` order from either
-- end.
-- =====================================================================================

do $w635_pre$
declare v_sig text; v_want text; v_n int;
begin
  -- (1) THE RELATIONS THESE DOORS READ MUST EXIST, and be the ones their owning files built.
  foreach v_sig in array array['clara.legal_documents','clara.legal_acceptances',
                               'clara.billing_plans','clara.firm_registration_payments',
                               'clara.firm_document_limits','clara.llm_price_table',
                               'clara.llm_usage_events_priced','clara.firms',
                               'clara.firm_memberships','clara.users']
  loop
    if to_regclass(v_sig) is null then
      raise exception '#635 prestate: % is absent -- its owning migration must apply first', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if to_regprocedure('clara._human_ctx(int)') is null then
    raise exception '#635 prestate: clara._human_ctx(int) is absent -- the floor these doors reuse does not exist'
      using errcode='CLR10';
  end if;

  -- (2) THE THREE NEW NAMES MUST BE WHOLLY ABSENT. A half-applied cohort is the failure mode
  --     rig-meta's "wholly present or wholly absent" rule exists to catch.
  foreach v_sig in array array['clara.get_firm_legal_standing()','clara.get_firm_commercial_state()',
                               'clara.get_firm_ai_usage(date)']
  loop
    if to_regprocedure(v_sig) is not null then
      raise exception '#635 prestate: % already exists', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (3) ZERO APPLICATION-ROLE PRIVILEGE ON THE FOUR MONEY/LEGAL RELATIONS, READ BEFORE THIS
  --     FILE TOUCHES ANYTHING. §C re-reads the same census after; a prestate that did not
  --     measure it could not tell a grant this file made from one it found.
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema='clara'
     and table_name in ('legal_documents','legal_acceptances','billing_plans','firm_registration_payments')
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_n <> 0 then
    raise exception '#635 prestate: the money/legal relations already carry % application-role grant(s) -- a written decision has been widened elsewhere', v_n
      using errcode='CLR10';
  end if;

  -- (4) `firm_document_limits` IS VIEWER-READABLE, AND MUST STAY SO. This file changes nothing
  --     about it; measuring it here is what turns "unmoved" into a fact rather than a promise.
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name='firm_document_limits'
     and grantee='clara_authenticated' and privilege_type='SELECT';
  if v_n <> 1 then
    raise exception '#635 prestate: clara.firm_document_limits does not carry 0007''s clara_authenticated SELECT grant (found %)', v_n
      using errcode='CLR10';
  end if;

  -- (5) THE FOUR PINS. Every number was MEASURED on the #635 rig at 219 migrations
  --     (0001->0224, PG 17.11) by reading `pg_proc.prosrc` through `to_regprocedure`, never
  --     transcribed from a creating migration -- a pin written from file text does not match
  --     the live body and this file would refuse to apply.
  --
  --     THE FIRST is the body this file RECUTS: its pre-image, so the recut is applied to the
  --     body it was written against and nothing else. THE OTHER THREE are NON-REGRESSION pins:
  --     this file claims to change none of them, and the standing door's own predicate is
  --     copied from the third (`_accounting_work_egress_live`'s limbs at 0195:890-906).
  for v_sig, v_want in
    select * from (values
      ('clara.get_llm_usage_summary(uuid,date,uuid)',            '51621dea548b02bf9c5e9b1999bc338aee8229f3c8caac11ece911cdff1dd745'),
      ('clara.get_current_legal_documents()',                    '4c3399ae6410030f9d0273e918354e08217b4d5482af899a5d37c74adef70b35'),
      ('clara.accept_legal_document(text,integer,text,text)',    '6737fdf5225a455a598e5793a9d9ce3e18e6e1b685072d6061141f9d188cf900'),
      ('clara._accounting_work_egress_live(uuid,uuid)',          '53f690091c24bb82ec529d5cb818647374d0181ed609777155d2f9eae87596a0')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_sig) is null then
      raise exception '#635 prestate: % does not resolve', v_sig using errcode='CLR10';
    end if;
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p where p.oid = to_regprocedure(v_sig))
       is distinct from v_want then
      raise exception '#635 prestate: % has DRIFTED from its pinned body -- re-measure on a migrated rig before applying', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#635 prestate: clean -- the three new doors do not exist; legal_documents, legal_acceptances, billing_plans and firm_registration_payments carry ZERO application-role table grant; firm_document_limits still carries 0007''s clara_authenticated SELECT; and get_llm_usage_summary (the one recut), get_current_legal_documents, accept_legal_document and _accounting_work_egress_live are at their measured pre-0233 bodies.';
end
$w635_pre$;

set role clara_fn_owner;

-- =================================================================================================
-- §A.1 -- clara.get_firm_legal_standing() returns jsonb
--
-- Floor: VIEWER. Every member of a firm may know whether their firm's legal standing is live,
-- because the consequence lands on their work: without it Clara cannot use a model on any
-- client's books (ARCHITECTURE §5.E's third recovery path). WHO accepted and WHEN is masked
-- below bookkeeper; WHETHER is not.
--
-- THE PER-KIND SELECTION IS 0185:653-659's OWN -- `distinct on (kind) ... order by
-- (status='published') desc, version desc` -- so a kind with only a DRAFT appears here with
-- `status='draft'`, exactly as the signup stage already previews it (lib/registration/
-- legal-reads.ts:27-31). Hiding a draft the product already shows would make two surfaces
-- disagree about what exists.
--
-- `standing_live` COUNTS PUBLISHED ROWS ONLY, and is computed from the same literal predicate
-- fragment as 0195:890-906 so a census can compare like with like: both kinds must have a
-- PUBLISHED version, and ONE ACTIVE OWNER of this firm must hold BOTH acceptances at those
-- versions. A draft can never contribute to it.
-- =================================================================================================
create function clara.get_firm_legal_standing() returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  -- Every statement below binds the CALLER and the CALLER'S FIRM as parameters; re-plan per
  -- call rather than let plpgsql settle, from the sixth call of a pooled connection, on a plan
  -- built for the per-person average (0185:643-646's rule, restated at 0195:879-880).
  set plan_cache_mode = force_custom_plan
  as $$
declare
  c record;
  v_masked boolean;
  v_can_accept boolean;
  v_terms int; v_dpa int; v_owner uuid;
  v_docs jsonb;
begin
  -- THE FLOOR. `_human_ctx` raises CLR04 with NO detail.reason ('no authenticated actor' /
  -- 'actor has no active membership' / 'insufficient role'); the surface keys its denied face
  -- off the CODE and renders the sentence verbatim rather than inventing a reason token.
  c := clara._human_ctx(clara.role_rank('viewer'));
  v_masked := coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper');

  -- WHO MAY ACCEPT FOR THE FIRM: 0195:905's own membership predicate, applied to the CALLER.
  select exists (
    select 1 from clara.firm_memberships m
     where m.firm_id = c.firm and m.user_id = c.actor
       and m.status = 'active' and m.role = 'owner')
    into v_can_accept;

  -- LIMB (a) OF 0195's BASIS, verbatim in shape: the PUBLISHED version of each kind, then ONE
  -- ACTIVE OWNER of this firm holding BOTH acceptances at those versions.
  select d.version into v_terms from clara.legal_documents d where d.kind='terms' and d.status='published';
  select d.version into v_dpa   from clara.legal_documents d where d.kind='dpa'   and d.status='published';
  if v_terms is not null and v_dpa is not null then
    select m.user_id into v_owner
      from clara.firm_memberships m
      join clara.legal_acceptances ta
        on ta.user_id=m.user_id and ta.kind='terms' and ta.version=v_terms
      join clara.legal_acceptances da
        on da.user_id=m.user_id and da.kind='dpa' and da.version=v_dpa
     where m.firm_id=c.firm and m.status='active' and m.role='owner'
     order by m.created_at, m.user_id limit 1;
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'kind'), '[]'::jsonb) into v_docs
    from (
      select jsonb_build_object(
               'kind', cur.kind,
               'version', cur.version,
               'status', cur.status,
               'title', cur.title,
               'effective_from', cur.effective_from,
               'published_at', cur.published_at,
               -- THE FIRM'S FACT: an ACTIVE OWNER of THIS firm accepted THIS version.
               'firm_accepted', fa.user_id is not null,
               -- THE ATTRIBUTION TRIPLE, masked below bookkeeper (0141:526's row floor).
               'accepted_at',      case when v_masked then null else fa.accepted_at end,
               'accepted_by',      case when v_masked then null else fa.user_id end,
               'accepted_by_name', case when v_masked then null else fa.display_name end,
               -- THE CALLER'S OWN acceptance -- never masked; it is their own act.
               'my_accepted_version', mine.version,
               'my_accepted_at',      mine.accepted_at) as entry
        from (select distinct on (d.kind)
                     d.kind, d.version, d.status, d.title, d.effective_from, d.published_at
                from clara.legal_documents d
               where d.status in ('published','draft')
               order by d.kind, (d.status = 'published') desc, d.version desc) cur
        left join lateral (
          -- The earliest ACTIVE OWNER of this firm holding THIS (kind, version). The name is
          -- resolved HERE, inside the definer body, from clara.users joined to the bound firm's
          -- membership -- never through clara.users_visible (0137:291-298 re-derives jwt_firm()
          -- and admits agents).
          select a.user_id, a.accepted_at, u.display_name
            from clara.legal_acceptances a
            join clara.firm_memberships m
              on m.user_id = a.user_id and m.firm_id = c.firm
             and m.status = 'active' and m.role = 'owner'
            join clara.users u on u.id = a.user_id
           where a.kind = cur.kind and a.version = cur.version
           order by m.created_at, m.user_id limit 1) fa on true
        left join lateral (
          select a.version, a.accepted_at from clara.legal_acceptances a
           where a.user_id = c.actor and a.kind = cur.kind and a.version = cur.version) mine on true
    ) rows;

  return jsonb_build_object(
    'documents', v_docs,
    'standing_live', v_owner is not null,
    'can_accept_for_firm', v_can_accept,
    'masked', v_masked);
end $$;

-- =================================================================================================
-- §A.2 -- clara.get_firm_commercial_state() returns jsonb
--
-- Floor: ADMIN. The literal `clara._human_ctx(clara.role_rank('admin'))` below is the statement
-- `apps/web/lib/firm/capabilities.ts`'s FLOOR row cites by migration and LINE; its
-- `capabilities.test.ts:133` FLOOR_RE matches this spelling and no other.
--
-- THE PAYMENT SIDE IS THE FIRST FIRM-SCOPED READER OF `clara.firm_registration_payments`. Until
-- now that relation had exactly one reader outside the checkout chain, the operator console
-- (0188:304). This door reads it by `consumed_firm_id = clara.jwt_firm()`, which is the ONE
-- predicate that makes a payment row "this firm's" — and it widens `checkout-gate-c3`'s
-- money-store body roster (cell `c3.53`), a reviewed act recorded there with the reason beside
-- the name, exactly as 0164's and 0188's widenings were.
--
-- THE PLAN SIDE READS `where is_current` -- the SAME row `clara.get_current_checkout_plan`
-- reads (0164:134-135) -- so a plan rotation cannot make the checkout route and the settings
-- card disagree about which plan the firm is on.
--
-- THE CAPACITY SIDE RETURNS THE STORED ROW OR NULLS. `clara.firm_document_limits` has one row
-- per firm AT MOST, and on a fresh estate none at all; the enforcing doors coalesce to their
-- own fallbacks (0090:422-436). Publishing the table's column DEFAULTS as though they were this
-- firm's caps would be this door inventing a number nobody stored, which is the same defect as
-- rendering a price that is not ruled.
-- =================================================================================================
create function clara.get_firm_commercial_state() returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare
  c record;
  v_firm record;
  v_plan record;
  v_pay record;
  v_cap record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));

  select f.id, f.name, f.created_at, f.is_operator into v_firm
    from clara.firms f where f.id = c.firm;

  select b.local_key, b.name, b.currency, b.amount_cents, b.amounts_ruled into v_plan
    from clara.billing_plans b where b.is_current;

  -- BOOLEANS ONLY. The raw stripe_customer_id / stripe_subscription_id never leave the database
  -- (D1/H3); what a firm needs to know is whether a payment is on record and whether a
  -- subscription was attached to it.
  select p.recorded_at,
         p.stripe_subscription_id is not null as subscription_present,
         p.stripe_customer_id is not null     as customer_present
    into v_pay
    from clara.firm_registration_payments p
   where p.consumed_firm_id = c.firm
   order by p.recorded_at desc, p.id limit 1;

  select l.docs_per_day, l.pages_per_day, l.ocr_concurrency, l.llm_witness_concurrency
    into v_cap
    from clara.firm_document_limits l where l.firm_id = c.firm;

  return jsonb_build_object(
    'firm', jsonb_build_object(
      'id', v_firm.id, 'name', v_firm.name,
      'created_at', v_firm.created_at, 'is_operator', v_firm.is_operator),
    'plan', jsonb_build_object(
      'local_key', v_plan.local_key, 'name', v_plan.name, 'currency', v_plan.currency,
      'amount_cents', v_plan.amount_cents, 'amounts_ruled', coalesce(v_plan.amounts_ruled, false)),
    'payment', jsonb_build_object(
      'recorded', v_pay.recorded_at is not null,
      'recorded_at', v_pay.recorded_at,
      'subscription_present', coalesce(v_pay.subscription_present, false),
      'customer_present', coalesce(v_pay.customer_present, false)),
    -- AN ABSENCE WITH A REASON, never an empty list a surface could render as "none yet". No
    -- subscription invoice is collected anywhere in this estate, and the card says so with a
    -- support route instead of a Manage-billing control that would refuse.
    'invoices', jsonb_build_object('available', false, 'reason', 'not_collected'),
    'capacity', jsonb_build_object(
      'docs_per_day', v_cap.docs_per_day,
      'pages_per_day', v_cap.pages_per_day,
      'ocr_concurrency', v_cap.ocr_concurrency,
      'llm_witness_concurrency', v_cap.llm_witness_concurrency,
      'source', 'firm_document_limits'));
end $$;

-- =================================================================================================
-- §A.3 -- clara.get_firm_ai_usage(p_period date)
--
-- Floor: ADMIN, then delegate. The firm is bound by `clara.jwt_firm()` INSIDE the database, so
-- no firm id crosses the wire and a caller cannot name another firm through any argument.
--
-- IT EXISTS FOR TWO REASONS OF ITS OWN, beyond the floor the base door now also carries:
--   · the firm binding above; and
--   · `price_currency`, which the base door cannot grow. `create or replace` cannot widen a
--     `returns table` column list -- that needs DROP + CREATE, and the old grant dies with the
--     old function (0186:1703). The literal is 'USD' because `clara.llm_price_table.currency`
--     is 'USD' by CHECK (0110:497) beside its own FX non-goal (0110:494-496). §C re-reads that
--     CHECK, so a later widening reds THIS migration instead of silently mislabelling money.
-- =================================================================================================
create function clara.get_firm_ai_usage(p_period date)
returns table(scope text, call_kind text, calls bigint, input_tokens bigint, output_tokens bigint,
              priced_calls bigint, unpriced_calls bigint, spend_cents bigint, price_currency text)
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._human_ctx(clara.role_rank('admin'));
  if p_period is null then
    raise exception 'a period is required' using errcode='CLR10', detail='{"reason":"invalid_period"}';
  end if;
  return query
  select s.scope, s.call_kind, s.calls, s.input_tokens, s.output_tokens,
         s.priced_calls, s.unpriced_calls, s.spend_cents, 'USD'::text
    from clara.get_llm_usage_summary(clara.jwt_firm(), p_period, null) s;
end $$;

-- =================================================================================================
-- §A.4 -- RECUT: clara.get_llm_usage_summary(uuid,date,uuid)
--
-- BODY-ONLY `create or replace`. The signature, the argument names, the `default null`, the
-- return-table column list, the grant and the ACL are byte-unchanged; §C proves the ACL from
-- the catalog rather than this comment promising it.
--
-- THE ONE CHANGE is the first statement of the body. Everything from `-- TWO BUCKETS, NEVER ONE
-- FIGURE` (0110:718) to `end $$` is carried VERBATIM, including the UTC row filter (0110:750)
-- that decides which rows belong to the month a screen will label.
-- =================================================================================================
create or replace function clara.get_llm_usage_summary(p_firm uuid, p_period date, p_client uuid default null)
  returns table(scope text, call_kind text, calls bigint, input_tokens bigint, output_tokens bigint,
                priced_calls bigint, unpriced_calls bigint, spend_cents bigint)
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_from date := date_trunc('month', p_period)::date;
  v_to   date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
begin
  -- #635 (0233): THE RANK FLOOR THIS DOOR NEVER HAD -- the FIRST statement, so an under-ranked
  -- caller meets CLR04 whatever firm they name and the CLR11 firm wall below stays intact for
  -- everyone who clears it. See 0233's header for the measurement and the blast radius.
  perform clara._human_ctx(clara.role_rank('admin'));
  if p_firm is distinct from clara.jwt_firm() then
    raise exception 'usage summary is readable for your own firm only'
      using errcode = 'CLR11', detail = '{"reason":"client_not_in_firm"}';
  end if;
  -- TWO BUCKETS, NEVER ONE FIGURE. A platform call is real spend and must be visible
  -- (R-L10: "a NULL firm is a platform call, never an unmetered one"), but adding it to a
  -- firm's total would bill one tenant for a global act -- a lie in a money number (law
  -- 22). It is returned as its own scope='platform' rows, which every caller must add up
  -- deliberately or not at all. The firm arm is UNCHANGED from before this fold: it is
  -- still exactly `scope='firm' and firm_id = p_firm`, so no foreign firm's row can enter
  -- either bucket -- the battery reads this as firm B and counts firm A's rows at zero.
  -- p_client narrows to a firm's client, so it EXCLUDES the platform bucket by
  -- construction: a firm-less call cannot be one client's, and pretending otherwise would
  -- re-import the misattribution this split exists to prevent.
  return query
  select v.scope,
         v.call_kind,
         count(*)::bigint,
         coalesce(sum(v.input_tokens), 0)::bigint,
         coalesce(sum(v.output_tokens), 0)::bigint,
         count(v.spend_cents)::bigint,
         (count(*) - count(v.spend_cents))::bigint,
         coalesce(sum(v.spend_cents), 0)::bigint
    from (select pv.scope, pv.call_kind, pv.input_tokens, pv.output_tokens, pv.spend_cents,
                 coalesce(pv.client_id, f.filed_client) as resolved_client
            from clara.llm_usage_events_priced pv
            left join lateral (
              -- EXACTLY ONE active filing resolves; zero or several resolve to NULL.
              select case when count(distinct df.client_id) = 1
                          then (array_agg(distinct df.client_id))[1] end as filed_client
                from clara.document_filings df
               where df.document_id = pv.document_id and df.firm_id = pv.firm_id
                 and df.retired_at is null
            ) f on pv.document_id is not null
           where ((pv.scope = 'firm' and pv.firm_id = p_firm)
                  or (pv.scope = 'platform' and p_client is null))
             and (pv.created_at at time zone 'utc')::date between v_from and v_to) v
   where p_client is null or v.resolved_client = p_client
   group by v.scope, v.call_kind
   order by v.scope, v.call_kind;
end $$;

-- =================================================================================================
-- §B -- GRANT MATRIX. N13 (0005:38-42): a function is PUBLIC-executable until it is revoked, so
-- the revoke is not optional. ONE grantee for each of the THREE NEW doors: clara_authenticated.
--
-- THE RECUT'S GRANT IS DELIBERATELY NOT RE-ISSUED. `create or replace` preserves the ACL, and
-- §C proves the live ACL is byte-identical to the pre-image; re-granting would hide a lost
-- grant behind a fresh one and make that proof vacuous.
-- =================================================================================================
revoke all on function clara.get_firm_legal_standing() from public;
grant execute on function clara.get_firm_legal_standing() to clara_authenticated;
revoke all on function clara.get_firm_commercial_state() from public;
grant execute on function clara.get_firm_commercial_state() to clara_authenticated;
revoke all on function clara.get_firm_ai_usage(date) from public;
grant execute on function clara.get_firm_ai_usage(date) to clara_authenticated;

comment on function clara.get_firm_legal_standing() is
  '#635: the FIRM''s legal standing -- one entry per kind on the shelf (0185:653-659''s own '
  'selection, so a draft-only kind appears as a draft), whether an ACTIVE OWNER of the caller''s '
  'firm accepted each current version, the caller''s own acceptance, and whether the CALLER may '
  'accept for the firm. standing_live is 0195:890-906''s limb (a). Viewer floor; the attribution '
  'triple is masked below bookkeeper. ARITY 0 FOREVER -- a client argument would re-open the '
  'existence oracle 0195:871-874 closed. Carries NO body and NO digest: those stay '
  'clara.get_current_legal_documents()''s.';
comment on function clara.get_firm_commercial_state() is
  '#635: the firm, its CURRENT billing plan (amount AND amounts_ruled together, so an unruled '
  'price renders as the fact it is), whether a registration payment is recorded (booleans and a '
  'date -- no raw Stripe identifier ever leaves the database), the declared absence of '
  'subscription invoices, and the firm''s stored processing caps or NULLs. Admin floor.';
comment on function clara.get_firm_ai_usage(date) is
  '#635: the caller''s own firm''s monthly model usage -- clara.get_llm_usage_summary bound to '
  'clara.jwt_firm() inside the database, with price_currency = USD read from '
  'llm_price_table''s own CHECK (0110:497). Two buckets, never summed. Admin floor. Refuses '
  'CLR10 invalid_period on a null period.';

reset role;

-- =================================================================================================
-- §C -- TAIL CENSUS. Re-reads the live catalog after privileges are final; raises on any
-- finding rather than trusting §A/§B ran as written.
-- =================================================================================================
do $w635_tail$
declare
  v_sig text; v_want text; v_n int; v_posture text; v_src text; v_stripped text; r text;
  v_code text;
  v_floor constant text := 'perform clara._human_ctx(clara.role_rank(''admin''));';
  -- THE WHOLE OF 0233's ADDITION TO THAT BODY -- comment lines included -- written here ONCE and
  -- squeezed, so §C can subtract it from the live source and compare what is left against the
  -- pre-image. Whitespace-insensitive on both sides, so the comparison is about MEANING.
  v_added constant text := regexp_replace($blk$
  -- #635 (0233): THE RANK FLOOR THIS DOOR NEVER HAD -- the FIRST statement, so an under-ranked
  -- caller meets CLR04 whatever firm they name and the CLR11 firm wall below stays intact for
  -- everyone who clears it. See 0233's header for the measurement and the blast radius.
  perform clara._human_ctx(clara.role_rank('admin'));
$blk$, '[[:space:]]+', '', 'g');
  -- sha256 of the PRE-IMAGE body with all whitespace removed, MEASURED on the #635 rig at 219
  -- migrations before this file existed (the raw pin in §0 is the same body unsqueezed).
  v_pre_squeezed constant text := 'd8a0b939cb1d897a8be96fa16647cbe97c12f2c97ba1dbd99b109f59e1a06968';
begin
  -- (T.1) THE POSTURE CEREMONY for the three NEW doors: exactly one pg_proc row each
  -- (0103:1055-1070's single-row law), clara_fn_owner, SECURITY DEFINER, pinned search_path,
  -- and the EXACT ACL TEXT -- grantor included, so a WITH GRANT OPTION or a PUBLIC grant cannot
  -- hide behind a has_function_privilege probe.
  for v_sig, v_want in
    select * from (values
      ('clara.get_firm_legal_standing()',   'get_firm_legal_standing'),
      ('clara.get_firm_commercial_state()', 'get_firm_commercial_state'),
      ('clara.get_firm_ai_usage(date)',     'get_firm_ai_usage')
    ) as t(sig, nm)
  loop
    if to_regprocedure(v_sig) is null then
      raise exception '#635 tail: % does not resolve', v_sig using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname='clara' and p.proname = v_want;
    if v_n <> 1 then
      raise exception '#635 tail: % overloads named clara.% exist (want exactly 1)', v_n, v_want
        using errcode='CLR10';
    end if;
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
           || coalesce(array_to_string(p.proacl, ','), '<null>')
      into v_posture from pg_proc p where p.oid = to_regprocedure(v_sig);
    if v_posture is distinct from
       'clara_fn_owner | true | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
      raise exception '#635 tail: % has the wrong posture -- got {%}', v_sig, v_posture using errcode='CLR10';
    end if;
    if position('search_path=clara, pg_temp' in
        coalesce(array_to_string((select p.proconfig from pg_proc p where p.oid = to_regprocedure(v_sig)), ','), '')) = 0 then
      raise exception '#635 tail: % does not pin search_path=clara, pg_temp', v_sig using errcode='CLR10';
    end if;
    foreach r in array array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive'] loop
      if to_regrole(r) is not null and has_function_privilege(r, v_sig, 'EXECUTE') then
        raise exception '#635 tail: % can EXECUTE % -- only clara_authenticated may', r, v_sig using errcode='CLR10';
      end if;
    end loop;
    if to_regrole('anon') is not null and has_function_privilege('anon', v_sig, 'EXECUTE') then
      raise exception '#635 tail: an anon role can EXECUTE %', v_sig using errcode='CLR10';
    end if;
    -- READS, NOT ACTS. No write verb, no row lock, no receipt, no event. Asserted against the
    -- body with its OWN comments stripped: a rule that a comment mentioning a verb could trip is
    -- a rule about prose, not about what the function does.
    select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure(v_sig);
    v_code := regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g');
    foreach r in array array['insert into','update clara','delete from','for update','for share',
                             'for key share','_reserve_op','_finish_op','_audit','_append_event'] loop
      if position(r in v_code) <> 0 then
        raise exception '#635 tail: % carries "%" -- these doors are reads', v_sig, r using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (T.2) THE TWO FIRM-BOUND READS RE-PLAN PER CALL (0185:643-646 / 0195:879-880). The
  -- delegating wrapper does not: its own body binds nothing but the period.
  foreach r in array array['clara.get_firm_legal_standing()','clara.get_firm_commercial_state()'] loop
    if position('plan_cache_mode=force_custom_plan' in
        coalesce(array_to_string((select p.proconfig from pg_proc p where p.oid = to_regprocedure(r)), ','), '')) = 0 then
      raise exception '#635 tail: % does not pin plan_cache_mode=force_custom_plan', r using errcode='CLR10';
    end if;
  end loop;

  -- (T.3) THE STANDING DOOR IS ARITY 0, and carries neither the body nor the digest.
  select p.pronargs::int into v_n from pg_proc p where p.oid = 'clara.get_firm_legal_standing()'::regprocedure;
  if v_n <> 0 then
    raise exception '#635 tail: clara.get_firm_legal_standing takes % argument(s) -- it must take none, forever', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.get_firm_legal_standing()'::regprocedure;
  if position('''body''' in v_src) <> 0 or position('body_sha256' in v_src) <> 0 then
    raise exception '#635 tail: the standing door names the legal BODY or its digest -- those stay get_current_legal_documents()''s'
      using errcode='CLR10';
  end if;
  -- v_code IS RE-DERIVED FROM *THIS* BODY, and the re-derivation is the assertion. It was last
  -- assigned inside T.1's loop, whose final iteration is get_firm_ai_usage -- so the guard below
  -- read the WRAPPER's source, found no 'users_visible' in it whatever the standing door said,
  -- and passed unconditionally. Measured: with 'users_visible' spliced into the standing door's
  -- code on a rig, the whole tail still returned OK. It must also be the COMMENT-STRIPPED source
  -- and not v_src, because this body legitimately NAMES clara.users_visible in the comment that
  -- explains why it does not use it -- testing v_src directly would red on a correct door.
  v_code := regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g');
  if position('users_visible' in v_code) <> 0 then
    raise exception '#635 tail: the standing door resolves a name through clara.users_visible -- it must resolve inside the definer body'
      using errcode='CLR10';
  end if;

  -- (T.4) THE COMMERCIAL DOOR PUBLISHES NO RAW STRIPE IDENTIFIER. Read off the RETURN
  -- expression itself rather than asserted about the door in prose.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.get_firm_commercial_state()'::regprocedure;
  v_n := position('return jsonb_build_object(' in v_src);
  if v_n = 0 then
    raise exception '#635 tail: clara.get_firm_commercial_state does not return a jsonb_build_object' using errcode='CLR10';
  end if;
  v_stripped := substr(v_src, v_n);
  foreach r in array array['stripe_customer_id','stripe_subscription_id'] loop
    if position(r in v_stripped) <> 0 then
      raise exception '#635 tail: the commercial door''s returned object names % -- booleans only', r using errcode='CLR10';
    end if;
  end loop;
  if position('''amounts_ruled''' in v_stripped) = 0 then
    raise exception '#635 tail: the commercial door does not forward amounts_ruled -- the render condition that keeps an unruled price off the screen'
      using errcode='CLR10';
  end if;

  -- (T.5) THE RECUT: the live body is NOT the pre-image, and the ONLY textual delta is the
  -- floor statement. Both sides are normalised the same way (whitespace removed), so what is
  -- compared is the part that carries the MEANING.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.get_llm_usage_summary(uuid,date,uuid)'::regprocedure;
  if encode(sha256(convert_to(v_src,'UTF8')),'hex')
     = '51621dea548b02bf9c5e9b1999bc338aee8229f3c8caac11ece911cdff1dd745' then
    raise exception '#635 tail: get_llm_usage_summary still hashes to its PRE-IMAGE -- the recut did not apply'
      using errcode='CLR10';
  end if;
  if position(v_floor in v_src) = 0 then
    raise exception '#635 tail: get_llm_usage_summary carries no admin floor' using errcode='CLR10';
  end if;
  if position(v_floor in v_src) > position('p_firm is distinct from clara.jwt_firm()' in v_src) then
    raise exception '#635 tail: the floor is not the FIRST statement -- an under-ranked caller would learn a firm fact first'
      using errcode='CLR10';
  end if;
  if position('client_not_in_firm' in v_src) = 0 then
    raise exception '#635 tail: the CLR11 firm wall (f-a9.C19) is gone from the recut body' using errcode='CLR10';
  end if;
  if position(replace('(pv.created_at at time zone ''utc'')::date between v_from and v_to',' ','')
      in regexp_replace(v_src, '[[:space:]]+', '', 'g')) = 0 then
    raise exception '#635 tail: 0110:750''s UTC row filter did not survive the recut -- the window a screen labels would not be the window the door used'
      using errcode='CLR10';
  end if;
  -- …AND NOTHING ELSE MOVED. Squeeze the live body, subtract 0233's addition (also squeezed),
  -- and what is left must hash to the PRE-IMAGE squeezed the same way. This is the assertion
  -- that makes "body-only recut" a measurement: a smuggled query change, a dropped bucket, a
  -- moved filter or a re-worded refusal all change this hash.
  v_stripped := replace(regexp_replace(v_src, '[[:space:]]+', '', 'g'), v_added, '');
  if encode(sha256(convert_to(v_stripped,'UTF8')),'hex') is distinct from v_pre_squeezed then
    raise exception '#635 tail: the recut changed MORE than the floor block -- the live body minus 0233''s addition does not match the pinned pre-image'
      using errcode='CLR10';
  end if;
  if position('TWOBUCKETS,NEVERONEFIGURE' in v_stripped) = 0 then
    raise exception '#635 tail: 0110:718''s two-bucket rule comment did not survive the recut' using errcode='CLR10';
  end if;

  -- (T.6) THE RECUT'S ACL IS BYTE-IDENTICAL TO THE PRE-IMAGE'S. §B re-issues no grant, so this
  -- is the statement that `create or replace` preserved it.
  select coalesce(array_to_string(p.proacl, ','), '<null>') into v_posture
    from pg_proc p where p.oid = 'clara.get_llm_usage_summary(uuid,date,uuid)'::regprocedure;
  if v_posture is distinct from 'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#635 tail: get_llm_usage_summary''s ACL MOVED -- got {%}', v_posture using errcode='CLR10';
  end if;

  -- (T.7) THE CURRENCY LITERAL, ASSERTED AGAINST ITS SOURCE. If a later migration widens
  -- llm_price_table.currency, this reds here instead of letting the wrapper mislabel money.
  select count(*)::int into v_n from pg_constraint c
   where c.conrelid = 'clara.llm_price_table'::regclass
     and c.conname = 'llm_price_table_currency_check'
     and pg_get_constraintdef(c.oid) like '%''USD''%';
  if v_n <> 1 then
    raise exception '#635 tail: clara.llm_price_table no longer pins currency = USD -- get_firm_ai_usage''s literal would be a lie'
      using errcode='CLR10';
  end if;

  -- (T.8) THE THREE NON-REGRESSION PINS, RE-READ AFTER THE FILE APPLIED. §0 said "found here";
  -- this says "left here".
  for v_sig, v_want in
    select * from (values
      ('clara.get_current_legal_documents()',                 '4c3399ae6410030f9d0273e918354e08217b4d5482af899a5d37c74adef70b35'),
      ('clara.accept_legal_document(text,integer,text,text)', '6737fdf5225a455a598e5793a9d9ce3e18e6e1b685072d6061141f9d188cf900'),
      ('clara._accounting_work_egress_live(uuid,uuid)',       '53f690091c24bb82ec529d5cb818647374d0181ed609777155d2f9eae87596a0')
    ) as t(sig, sha)
  loop
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p where p.oid = to_regprocedure(v_sig))
       is distinct from v_want then
      raise exception '#635 tail: % MOVED while this file applied', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (T.9) THE FOUR MONEY/LEGAL RELATIONS STILL CARRY ZERO APPLICATION-ROLE GRANT, and
  -- firm_document_limits' grant is unmoved in BOTH directions.
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema='clara'
     and table_name in ('legal_documents','legal_acceptances','billing_plans','firm_registration_payments')
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_n <> 0 then
    raise exception '#635 tail: the money/legal relations gained % application-role grant(s)', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name='firm_document_limits'
     and grantee='clara_authenticated' and privilege_type='SELECT';
  if v_n <> 1 then
    raise exception '#635 tail: clara.firm_document_limits'' viewer-readable SELECT grant MOVED (found %) -- rendering it behind admin+ is an AFFORDANCE, not a wall', v_n
      using errcode='CLR10';
  end if;

  -- (T.10) NO RELATION WAS CREATED, ALTERED OR DROPPED. The four relations this file reads are
  -- still their own shapes, and still FORCE RLS where their owning files set it.
  foreach r in array array['legal_documents','legal_acceptances','billing_plans','firm_registration_payments'] loop
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
             where c.oid = ('clara.' || r)::regclass) then
      raise exception '#635 tail: clara.% lost FORCE RLS', r using errcode='CLR10';
    end if;
  end loop;

  raise notice '#635 tail: OK -- clara.get_firm_legal_standing() (arity 0, viewer floor, no body and no digest, names resolved inside the definer body), clara.get_firm_commercial_state() and clara.get_firm_ai_usage(date) are clara_fn_owner-owned SECURITY DEFINER reads with search_path=clara, pg_temp and an ACL of exactly {clara_fn_owner, clara_authenticated} (grantor included; runtime, both agent read roles, all four wake lanes, PUBLIC and any future anon reach nothing); the two firm-bound reads pin plan_cache_mode=force_custom_plan; the commercial door publishes no raw Stripe identifier and does forward amounts_ruled; clara.get_llm_usage_summary has been recut with the admin floor as its FIRST statement, ahead of an intact CLR11 firm wall, with 0110:718''s two-bucket rule and 0110:750''s UTC filter carried verbatim and an ACL byte-identical to its pre-image; llm_price_table still pins currency = USD; get_current_legal_documents, accept_legal_document and _accounting_work_egress_live hash exactly as the prestate found them; the four money/legal relations still carry ZERO application-role grant and still FORCE RLS; and firm_document_limits'' viewer-readable SELECT is unmoved.';
end
$w635_tail$;
