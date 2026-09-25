-- 0347_firm_setup_committed_tin_backfill — #1098 (riders sweep wave, lane 07): THE FIRM-SETUP TIN
-- ITEM IS BACKFILLED ONTO EVERY ALREADY-COMMITTED FIRM-SETUP PLAN, THROUGH AN IDEMPOTENT VERB
-- THIS FILE MINTS AND THEN CALLS ONCE.
-- =====================================================================================
-- Spec of record: issue #1098 and its Agent Brief (issue body; the issue carries no comment and no
-- owner ruling). Parent/context: #1032 (0311_firm_setup_tin_required.sql) and its own fix-round
-- review finding L06-SPEC-06, which is recorded in `packages/db/README.md` under "The population
-- 0311 does NOT reach, stated rather than left silent". Domain words: CONTEXT.md — "Firm setup",
-- "Onboarding plan".
--
-- =====================================================================================
-- THE GAP, MEASURED RATHER THAN RESTATED. Before 0311, `clara._firm_setup_applicability(plan,
-- 'tin')` read `'inapplicable'` for a firm whose turnover band was `<RM1M`, and 0257's seed guard
-- (`… = 'applicable'`) therefore skipped the row: such a firm committed its checklist with NO
-- `tin` plan item at all. 0311 recut the applicability door and the seed guard so `tin` is seeded
-- for every firm from then on, but it backfilled no existing plan, and `clara.seed_firm_setup_plan`
-- refuses outright once the plan is not open (`CLR10 firm_setup_not_open`, 0218 §E.1). So the row
-- can never arrive through any door on a plan that was already committed. That is the population
-- this file reaches.
--
-- =====================================================================================
-- WHY A VERB AND NOT A BARE `insert` IN THIS FILE'S OWN BODY. A one-shot statement inside an
-- applied migration can only ever be observed against the rows the server happened to hold at
-- apply time, and on a from-scratch chain that is zero rows — which makes #1098's own third
-- acceptance criterion ("a test drives an already-committed firm-setup plan, seeded and committed
-- BEFORE the backfill, and asserts it gains a TIN item after the backfill runs") vacuous
-- everywhere except one lane database on one afternoon. `clara._firm_setup_backfill_committed_tin`
-- is the same statement given a name, so a cell can plant the pre-0311 shape itself and drive the
-- REAL subject on any database (`tests/firm-setup-committed-tin-backfill.test.mjs`). It is
-- `insert … where not exists`, so it is idempotent by construction and redo-safe
-- (packages/db/README.md, "Redo (#957)") — the 0301 §G precedent, whose backfill is redo-safe for
-- the same reason.
--
-- IT IS EXECUTE-REACHABLE BY NOBODY. `revoke all … from public` and no grant: the verb writes into
-- EVERY firm's plan at once, so it belongs to the migration and to an operator with the owner
-- role, never to `clara_authenticated`, `clara_runtime` or `clara_agent_ro`. The tail re-reads that
-- rather than trusting the absence of a `grant` line. It mints no GRANTED name, so — like 0311
-- itself, and like `rig-meta.mjs`'s own #979 precedent ("NO COHORT, NO NEW NAME, NO GRANT CHANGE,
-- each measured rather than assumed") — this file adds NO `rig-meta.mjs` cohort: a cohort exists to
-- police a granted name's presence across a frontier boundary, and there is no granted name here.
--
-- =====================================================================================
-- WHAT THE BACKFILL WRITES, AND WHAT IT REFUSES TO TOUCH.
--   * ONE row per committed firm-scope plan that has no `tin` item: `state='pending'`,
--     `answer` null, `item_kind`/`question`/`required_for_commit` taken from the CATALOGUE row
--     itself, exactly the projection `clara.seed_firm_setup_plan` uses (0311 SS C, #935's own
--     `k.item_kind` carried through). The applicability marking is NOT stored: `required` and
--     `applicability` are derived LIVE by `clara._firm_setup_applicability` on every read
--     (0311 SS B/SS D), so a row inserted here reads `required` for a firm whose turnover makes
--     MyInvois mandatory and `optional` below that, with no second source of truth to drift.
--   * `not exists`, never `on conflict do update`: an existing item is not touched AT ALL — not
--     its answer, not its answered_by, not its answered_at, not its state, not its question text.
--     This is 0218's own reconciliation doctrine, and #1098's second acceptance criterion.
--   * COMMITTED plans only. An OPEN plan is not a dead end — its admin reconciles it through
--     `clara.seed_firm_setup_plan`, which has seeded `tin` since 0311 — and writing into it here
--     would insert an item without the plan-revision bump #895 made that door's own contract
--     (0311 SS C, `clara._firm_setup_bump`). A CANCELLED plan is abandoned; nothing reads it as a
--     live checklist. The tail proves neither population moved.
--   * NO plan row is touched: no `revision_token`, no `revision_n`, no `updated_at`, no revision
--     snapshot. A committed plan's attestation (`committed_at`, `committed_by`,
--     `commit_attestation`) is a receipt, and a maintenance backfill of a never-asked question is
--     not a new revision of the document the firm signed. The tail digests every
--     `clara.onboarding_plans` row before and after and refuses any movement.
--
-- =====================================================================================
-- THE RESIDUAL THIS FILE DOES NOT CLOSE, STATED RATHER THAN HIDDEN — and #1098's first acceptance
-- criterion says "an item it CAN ANSWER", so this is said here and not only in the report.
--
-- `clara.answer_firm_setup_item` refuses every item on a plan that is not open (0218 §E.2, `CLR10
-- firm_setup_not_open`), and the web checklist guards every write control behind `!committed`
-- (`apps/web/components/firm-setup/firm-setup-checklist.tsx`). So after this backfill the TIN row
-- EXISTS on a committed plan and reads `pending` with the right `required`/`optional` marking, but
-- the firm still cannot record a value into it. That wall is not specific to `tin`: a committed
-- firm-setup plan has always been closed to every item, and the catalogue carries no reopen door
-- (measured: `_assert_firm_setup_answer`, `_firm_setup_applicability`, `_firm_setup_bump`,
-- `_firm_setup_plan`, `answer_firm_setup_item`, `commit_firm_setup`, `defer_firm_setup_item`,
-- `dismiss_firm_setup_tip`, `get_firm_setup`, `seed_firm_setup_plan`, and nothing else). Opening
-- one — may a committed checklist still be COMPLETED for a question it was never asked, while
-- never being AMENDED for a fact it attested to? — changes what a commit means, which is a product
-- decision for the owner and not this file's to take (the README block 0311's fix round wrote says
-- the same, in the same words). `tests/firm-setup-committed-tin-backfill.test.mjs`'s cell
-- `p1098.residual.a_committed_plan_still_refuses_the_answer` DRIVES that refusal rather than
-- asserting it, so the residual is a measured fact on this branch and not a sentence.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO, each with its authority.
--   * it does NOT recut `clara._firm_setup_applicability`, `clara.seed_firm_setup_plan`,
--     `clara.get_firm_setup`, `clara.commit_firm_setup`, `clara.defer_firm_setup_item` or
--     `clara.answer_firm_setup_item` — all six are pinned by `sha256(prosrc)` below and re-read in
--     the tail, unmoved. #1098's own "Out of scope" excludes any change to the applicability rule.
--   * it does NOT touch `clara.firm_setup_keys` — no row, no cell, and therefore no
--     disable/enable of `t_firm_setup_keys_append_only` (0218 §A). 0311 already corrected `tin`'s
--     `user_note`; the tail re-reads that sentence unmoved.
--   * it does NOT widen a CHECK, mint a relation, mint a role, or change any grant.
--   * it does NOT insert any catalogue row other than `tin` onto a committed plan. #935's three
--     education tips are equally unreachable there, and the web checklist deliberately renders no
--     tip on a committed checklist at all (`rendersRow`, same file) — adding them would put rows
--     on a plan that nothing will ever show. `tin` is the row #1098 names.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- The values this file carries ACROSS its blocks, so the tail can prove nothing else moved without
-- naming a literal that only holds on one server's data. A temp table is the estate's own idiom for
-- exactly this (0295:186, 0289:93, 0291:119, 0261:78); `on commit drop` scopes it to this
-- migration's single transaction, and the CONNECTING role owns it — the SS A block runs as
-- clara_fn_owner and never reads it, and SS B and the tail both run after `reset role`.
create temp table _p1098_pre(k text primary key, v text) on commit drop;

-- =====================================================================================
-- SS 0 PRESTATE. Every claim this file makes about what it is building on, MEASURED on this rig
-- (clara_l09, PostgreSQL 17, chain 0001..0318, riders sweep lane 07 after #1047) off the catalog
-- directly — never transcribed from 0218's, 0257's, 0259's or 0311's own text. Nothing here writes
-- anything but the carrier table.
-- =====================================================================================
do $p1098_pre$
declare
  v_pin record; v_measured text; v_note text; v_txt text; v_n int; v_sha text;
begin
  -- 0.1 · EVERY NAME THIS FILE READS OR RELIES ON EXISTS.
  if to_regprocedure('clara._firm_setup_applicability(uuid,text)') is null
     or to_regprocedure('clara.seed_firm_setup_plan(text)') is null
     or to_regprocedure('clara.get_firm_setup()') is null
     or to_regprocedure('clara.commit_firm_setup(uuid,uuid,text)') is null
     or to_regprocedure('clara.defer_firm_setup_item(uuid,uuid,text,text,text)') is null
     or to_regprocedure('clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)') is null
     or to_regprocedure('clara._firm_setup_plan(uuid)') is null then
    raise exception '#1098 prestate: a firm-setup name this file relies on is absent -- 0218/0257/0258/0259/0311 must apply first'
      using errcode = 'CLR10';
  end if;

  -- 0.2 · NEIGHBOUR PINS, EVERY ONE MEASURED LIVE ON THIS SERVER. This file recuts NONE of them;
  -- they are pinned so a drift underneath it cannot silently invalidate the reasoning above (that
  -- the seed guard still refuses a non-open plan, that the applicability door still decides
  -- required/optional for tin, that the read still derives both LIVE).
  for v_pin in select * from (values
      ('clara._firm_setup_applicability(uuid,text)',
       'f85b461549e19695f7b28f6b9c94f570d09853eb7af3dc9bb78b3ec4a8651c5e'),
      ('clara.seed_firm_setup_plan(text)',
       '9855f1ad743ab182358cfd858bc55912312b97f504e23f20aa16e90f3b2cced3'),
      ('clara.get_firm_setup()',
       '65f6aec24615e9d20201b7fd073b37affbae98ff4ea8be8fac8044e26f238d52'),
      ('clara.commit_firm_setup(uuid,uuid,text)',
       'fab99f4b7c29a9c8d0e632eb0671e437983ba1c742ec195f3343298b54493653'),
      ('clara.defer_firm_setup_item(uuid,uuid,text,text,text)',
       '63b9d3f6c5718957b8294dbdc87067fbae3d7b0731f2850a1c6804a75d5cb855'),
      ('clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)',
       '2674cde3ba5feeed4fe9eba2f0a8bfb378d8b150d8929d7df5a51c1632de9d3c'),
      ('clara._firm_setup_plan(uuid)',
       '9fb59f22153e770e02eba44b62e391e1794ffe60e7ba92e00067075dd03fd54a')
    ) as t(sig, sha)
  loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_measured
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_measured is distinct from v_pin.sha then
      raise exception '#1098 prestate: % has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE bodies before applying', v_pin.sig, v_measured, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 0.3 · 0311 HAS LANDED: tin's branch of the applicability door reads required/optional, so a
  -- row this file inserts is marked by the turnover answer the plan already holds.
  select p.prosrc into v_txt from pg_proc p
   where p.oid = 'clara._firm_setup_applicability(uuid,text)'::regprocedure;
  if position($tag$elsif p_item_key = 'tin' then$tag$ in v_txt) = 0
     or position($tag$return 'required';$tag$ in v_txt) = 0
     or position($tag$return 'optional';$tag$ in v_txt) = 0 then
    raise exception '#1098 prestate: clara._firm_setup_applicability does not read required/optional for tin -- 0311 must apply first'
      using errcode = 'CLR10';
  end if;
  -- …and the door this file exists BECAUSE of still refuses a plan that is not open.
  select p.prosrc into v_txt from pg_proc p where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if position($tag$"reason":"firm_setup_not_open"$tag$ in v_txt) = 0 then
    raise exception '#1098 prestate: clara.seed_firm_setup_plan no longer refuses a plan that is not open -- the premise of this whole file must be re-derived'
      using errcode = 'CLR10';
  end if;

  -- 0.4 · THE CATALOGUE ROW THIS FILE COPIES IS STILL WHAT IT EXPECTS: `capture`, statically not
  -- required, no knowledge_key, not retired, carrying 0311's own accountant sentence.
  if not exists (select 1 from clara.firm_setup_keys
                  where item_key = 'tin' and item_kind = 'capture'
                    and required_for_commit = false and knowledge_key is null and retired_at is null) then
    raise exception '#1098 prestate: the tin catalogue row no longer reads capture/not-required/no-knowledge-key/not-retired'
      using errcode = 'CLR10';
  end if;
  select user_note into v_note from clara.firm_setup_keys where item_key = 'tin';
  if v_note is distinct from 'The firm''s MyInvois TIN. Required once the firm''s turnover makes MyInvois mandatory (RM1 million or more); optional below that, and you may still record it if the firm has registered for MyInvois voluntarily.' then
    raise exception '#1098 prestate: tin.user_note is not 0311''s own sentence (got %) -- this file does not touch it and must not be applied over a drifted catalogue', v_note
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 15 then
    raise exception '#1098 prestate: the firm setup catalogue holds % rows (expected 15)', v_n using errcode = 'CLR10';
  end if;

  -- 0.5 · THE TABLE THIS FILE WRITES INTO IS STILL THE SHAPE ITS INSERT ASSUMES: 0017's thirteen
  -- columns, the (plan_id,item_key) uniqueness that makes `not exists` the right guard, the four
  -- item states, the four item kinds (#935 widened it to include `education`) -- and, measured
  -- rather than assumed, NO append-only or immutability trigger to disable. The only non-internal
  -- trigger it carries is 0017's TRUNCATE guard, which an INSERT never fires.
  select count(*)::int into v_n from pg_attribute
   where attrelid = 'clara.onboarding_plan_items'::regclass and attnum > 0 and not attisdropped;
  if v_n <> 13 then
    raise exception '#1098 prestate: clara.onboarding_plan_items holds % columns, expected 0017''s thirteen', v_n
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.onboarding_plan_items'::regclass
                    and conname = 'uq_onboarding_plan_items_key') then
    raise exception '#1098 prestate: uq_onboarding_plan_items_key is gone -- the not-exists guard would no longer be backed by a constraint'
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid = 'clara.onboarding_plan_items'::regclass and c.conname = 'onboarding_plan_items_state_check';
  if v_txt is distinct from
     'CHECK ((state = ANY (ARRAY[''pending''::text, ''answered''::text, ''resolved''::text, ''deferred''::text])))' then
    raise exception '#1098 prestate: onboarding_plan_items_state_check reads {%}, not the pinned four-value set', v_txt
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid = 'clara.onboarding_plan_items'::regclass and c.conname = 'onboarding_plan_items_item_kind_check';
  if v_txt is distinct from
     'CHECK ((item_kind = ANY (ARRAY[''must_ask''::text, ''capture''::text, ''todo''::text, ''education''::text])))' then
    raise exception '#1098 prestate: onboarding_plan_items_item_kind_check reads {%}, not the pinned four-value set', v_txt
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.onboarding_plan_items'::regclass and not tgisinternal
     and tgname <> 't_onboarding_plan_items_no_truncate';
  if v_n <> 0 then
    raise exception '#1098 prestate: clara.onboarding_plan_items carries % non-internal trigger(s) beside the TRUNCATE guard -- this file inserts rows directly and must know about every wall on the table', v_n
      using errcode = 'CLR10';
  end if;
  -- The plan states this file's scope predicate partitions on are still exactly 0017's three.
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid = 'clara.onboarding_plans'::regclass and c.conname = 'onboarding_plans_state_check';
  if v_txt is distinct from
     'CHECK ((state = ANY (ARRAY[''open''::text, ''committed''::text, ''cancelled''::text])))' then
    raise exception '#1098 prestate: onboarding_plans_state_check reads {%}, not the pinned open/committed/cancelled set this file''s scope predicate partitions on', v_txt
      using errcode = 'CLR10';
  end if;

  -- 0.6 · FIRST or REDO, decided from the one marker only this file writes: the verb's own name
  -- ("Redo (#957)" -- `CLARA_MIGRATION_REDO` only ever re-enters the branch where this file's own
  -- effects are already live).
  insert into _p1098_pre(k, v) values ('mode',
    case when to_regprocedure('clara._firm_setup_backfill_committed_tin()') is null then 'FIRST' else 'REDO' end);

  -- 0.7 · THE CENSUS THE TAIL COMPARES AGAINST. Three counts, one per plan state, of firm-scope
  -- plans carrying no `tin` item: the committed one is what this file must move to zero, the other
  -- two are what it must leave exactly where they are.
  -- `count(p.id)`, never `count(*)`: the join is a LEFT join so that a state with no such plan
  -- still produces its row, and `count(*)` would score that empty row as one.
  insert into _p1098_pre(k, v)
  select 'without_tin_' || s.state, count(p.id)::text
    from (values ('open'),('committed'),('cancelled')) as s(state)
    left join clara.onboarding_plans p
      on p.scope_kind = 'firm' and p.state = s.state
     and not exists (select 1 from clara.onboarding_plan_items i
                      where i.plan_id = p.id and i.item_key = 'tin')
   group by s.state;

  -- 0.8 · THE TWO CARRIED DIGESTS. Ordered by the surrogate `id`, which is a uuid and therefore
  -- orders by its own type and not by the server's `lc_collate` (packages/db/README.md, "Collation
  -- and pinned order"): neither digest is a literal pin, but both must mean the same thing in the
  -- prestate and in the tail on every server.
  select encode(sha256(convert_to(coalesce(string_agg(
      i.id::text || '|' || i.plan_id::text || '|' || i.firm_id::text || '|' || i.item_kind || '|' ||
      i.item_key || '|' || coalesce(i.question, '<null>') || '|' || coalesce(i.answer::text, '<null>') || '|' ||
      i.state || '|' || i.required_for_commit::text || '|' || coalesce(i.answered_by::text, '<null>') || '|' ||
      coalesce(i.answered_at::text, '<null>') || '|' || i.created_at::text || '|' || i.updated_at::text,
      '~' order by i.id), '<no rows>'), 'UTF8')), 'hex')
    into v_sha from clara.onboarding_plan_items i;
  insert into _p1098_pre(k, v) values ('items_digest', v_sha);
  select count(*)::int into v_n from clara.onboarding_plan_items;
  insert into _p1098_pre(k, v) values ('items_count', v_n::text);

  select encode(sha256(convert_to(coalesce(string_agg(
      p.id::text || '|' || p.firm_id::text || '|' || p.scope_kind || '|' ||
      coalesce(p.client_id::text, '<null>') || '|' || p.state || '|' || p.revision_token::text || '|' ||
      p.revision_n::text || '|' || coalesce(p.committed_at::text, '<null>') || '|' ||
      coalesce(p.committed_by::text, '<null>') || '|' || coalesce(p.cancelled_at::text, '<null>') || '|' ||
      p.created_at::text || '|' || p.updated_at::text,
      '~' order by p.id), '<no rows>'), 'UTF8')), 'hex')
    into v_sha from clara.onboarding_plans p;
  insert into _p1098_pre(k, v) values ('plans_digest', v_sha);

  raise notice '#1098 prestate: clean (%) -- the seven firm-setup names are live at their pinned bodies, 0311''s tin branch reads required/optional, the seed door still refuses a plan that is not open, the tin catalogue row is unmoved in a fifteen-row catalogue, clara.onboarding_plan_items still has 0017''s thirteen columns with its (plan_id,item_key) uniqueness, its four states, its four kinds and no wall beside the TRUNCATE guard, and the census carried to the tail is open=% committed=% cancelled=% firm-scope plans with no tin item.',
    (select v from _p1098_pre where k = 'mode'),
    (select v from _p1098_pre where k = 'without_tin_open'),
    (select v from _p1098_pre where k = 'without_tin_committed'),
    (select v from _p1098_pre where k = 'without_tin_cancelled');
end
$p1098_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SS A — THE VERB. Idempotent (`not exists`), scoped to COMMITTED firm-scope plans, copying the
-- catalogue's own projection exactly as `clara.seed_firm_setup_plan` does (0311 SS C). It returns
-- the number of rows it inserted so a caller — this file's own SS B, and the cell that drives it —
-- can assert on it rather than count afterwards.
-- =====================================================================================
create or replace function clara._firm_setup_backfill_committed_tin() returns int
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_added int;
begin
  insert into clara.onboarding_plan_items(
      plan_id, firm_id, item_kind, item_key, question, answer, state, required_for_commit)
  select p.id, p.firm_id, k.item_kind, k.item_key, k.question, null, 'pending', k.required_for_commit
    from clara.onboarding_plans p
    cross join clara.firm_setup_keys k
   where p.scope_kind = 'firm'
     -- COMMITTED ALONE. An open plan is reconciled by its own admin through
     -- clara.seed_firm_setup_plan, which has seeded tin since 0311 and bumps the plan revision
     -- while doing it (#895); a cancelled plan is abandoned. Neither is the dead end #1098 names.
     and p.state = 'committed'
     and k.item_key = 'tin'
     -- A retired catalogue row is settled -- never asked, never shown, never counted (#934) -- so
     -- it is never planted either, even here.
     and k.retired_at is null
     -- NOT `on conflict do update`: an existing item must not be touched AT ALL, including its
     -- question text and its answer (0218's reconciliation doctrine; #1098's second AC).
     and not exists (select 1 from clara.onboarding_plan_items i
                      where i.plan_id = p.id and i.item_key = k.item_key);
  get diagnostics v_added = row_count;
  return v_added;
end $$;
revoke all on function clara._firm_setup_backfill_committed_tin() from public;

comment on function clara._firm_setup_backfill_committed_tin() is
  '#1098: plant the firm-setup `tin` item on every COMMITTED firm-scope onboarding plan that has none, and return how many rows that was. Idempotent (insert … where not exists) and therefore redo-safe. Touches no existing plan item and no plan row. EXECUTE-granted to nobody: it writes into every firm at once and belongs to a migration or to an operator holding clara_fn_owner. It does NOT make the row answerable -- clara.answer_firm_setup_item still refuses a plan that is not open (CLR10 firm_setup_not_open); see 0347''s header and packages/db/README.md.';

reset role;

-- =====================================================================================
-- SS B — RUN IT ONCE, HERE. The call is SECURITY DEFINER, so it writes as clara_fn_owner and meets
-- `p_onboarding_plan_items_owner` (0017's FORCE-RLS owner policy) whichever role invokes it.
-- =====================================================================================
do $p1098_run$
declare v_added int; v_expected int;
begin
  v_added := clara._firm_setup_backfill_committed_tin();
  insert into _p1098_pre(k, v) values ('added', v_added::text);
  v_expected := (select v::int from _p1098_pre where k = 'without_tin_committed');
  raise notice '#1098 backfill: % tin item(s) planted on committed firm-scope plans (the prestate counted % such plans).',
    v_added, v_expected;
end
$p1098_run$;

-- =====================================================================================
-- THE TAIL. Every assertion re-read from the catalog AFTER the backfill.
-- =====================================================================================
do $p1098_tail$
declare
  v_n int; v_sha text; v_txt text; v_note text; v_posture text; v_pin record; v_bad text;
  -- CARRIED FROM THE PRESTATE, in this same transaction, never re-typed as a literal.
  v_mode constant text := (select v from _p1098_pre where k = 'mode');
  v_added constant int := (select v::int from _p1098_pre where k = 'added');
  v_pre_items constant text := (select v from _p1098_pre where k = 'items_digest');
  v_pre_count constant int := (select v::int from _p1098_pre where k = 'items_count');
  v_pre_plans constant text := (select v from _p1098_pre where k = 'plans_digest');
  v_pre_committed constant int := (select v::int from _p1098_pre where k = 'without_tin_committed');
  v_pre_open constant int := (select v::int from _p1098_pre where k = 'without_tin_open');
  v_pre_cancelled constant int := (select v::int from _p1098_pre where k = 'without_tin_cancelled');
begin
  -- T.0 · THE CARRIER ARRIVED. Stated as its own refusal rather than left to surface as a
  -- confusing "expected <NULL>" further down (0295 T.0's idiom).
  if v_mode is null or v_added is null or v_pre_items is null or v_pre_plans is null
     or v_pre_committed is null or v_pre_open is null or v_pre_cancelled is null then
    raise exception '#1098 tail T.0: the prestate''s measurements did not reach the tail -- _p1098_pre is a temp table scoped to this transaction and every block must share it'
      using errcode = 'CLR10';
  end if;

  -- T.1 · THE BACKFILL MOVED EXACTLY THE POPULATION THE PRESTATE COUNTED. On a REDO both numbers
  -- are zero, because this file's own effects are already live -- which is what makes it redo-safe.
  if v_added <> v_pre_committed then
    raise exception '#1098 tail T.1: the backfill planted % rows but the prestate counted % committed firm-scope plans with no tin item', v_added, v_pre_committed
      using errcode = 'CLR10';
  end if;

  -- T.2 · THE INVARIANT, which is the whole point of the file: no committed firm-scope plan is
  -- without a tin item any more.
  select count(*)::int into v_n from clara.onboarding_plans p
   where p.scope_kind = 'firm' and p.state = 'committed'
     and not exists (select 1 from clara.onboarding_plan_items i
                      where i.plan_id = p.id and i.item_key = 'tin');
  if v_n <> 0 then
    raise exception '#1098 tail T.2: % committed firm-scope plan(s) still carry no tin item', v_n
      using errcode = 'CLR10';
  end if;

  -- T.3 · EVERY ROW THIS TRANSACTION CREATED IS ONE OF THIS FILE'S, AND IS THE CATALOGUE'S OWN
  -- SHAPE. `created_at` defaults to `now()`, which is the TRANSACTION timestamp, so a row written
  -- before this migration began is strictly earlier and this predicate names exactly the inserts.
  select count(*)::int into v_n from clara.onboarding_plan_items i where i.created_at >= now();
  if v_n <> v_added then
    raise exception '#1098 tail T.3: % onboarding_plan_items row(s) were created in this transaction, but the backfill reported %', v_n, v_added
      using errcode = 'CLR10';
  end if;
  select string_agg(i.id::text, ', ' order by i.id) into v_bad
    from clara.onboarding_plan_items i
    join clara.onboarding_plans p on p.id = i.plan_id
    left join clara.firm_setup_keys k on k.item_key = i.item_key
   where i.created_at >= now()
     and (i.item_key <> 'tin' or i.state <> 'pending' or i.answer is not null
          or i.answered_by is not null or i.answered_at is not null
          or p.scope_kind <> 'firm' or p.state <> 'committed'
          or i.firm_id <> p.firm_id
          or k.item_key is null or i.item_kind is distinct from k.item_kind
          or i.question is distinct from k.question
          or i.required_for_commit is distinct from k.required_for_commit);
  if v_bad is not null then
    raise exception '#1098 tail T.3: row(s) % created here are not an unanswered, catalogue-shaped tin item on a committed firm-scope plan', v_bad
      using errcode = 'CLR10';
  end if;

  -- T.4 · NOTHING ELSE MOVED (#1098 AC2). Every row that existed before this transaction is
  -- byte-identical across all thirteen columns, and there are exactly as many of them as before.
  select count(*)::int into v_n from clara.onboarding_plan_items i where i.created_at < now();
  if v_n <> v_pre_count then
    raise exception '#1098 tail T.4: % pre-existing onboarding_plan_items rows remain, the prestate counted % -- this file deletes none', v_n, v_pre_count
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(coalesce(string_agg(
      i.id::text || '|' || i.plan_id::text || '|' || i.firm_id::text || '|' || i.item_kind || '|' ||
      i.item_key || '|' || coalesce(i.question, '<null>') || '|' || coalesce(i.answer::text, '<null>') || '|' ||
      i.state || '|' || i.required_for_commit::text || '|' || coalesce(i.answered_by::text, '<null>') || '|' ||
      coalesce(i.answered_at::text, '<null>') || '|' || i.created_at::text || '|' || i.updated_at::text,
      '~' order by i.id), '<no rows>'), 'UTF8')), 'hex')
    into v_sha from clara.onboarding_plan_items i where i.created_at < now();
  if v_sha is distinct from v_pre_items then
    raise exception '#1098 tail T.4: an onboarding_plan_items row that existed before this transaction MOVED (digest %, prestate %) -- this file inserts and never updates', v_sha, v_pre_items
      using errcode = 'CLR10';
  end if;

  -- T.5 · NO PLAN ROW MOVED: not a revision token, not a revision number, not a state, not a
  -- committed_at, not an updated_at. A committed plan's attestation is a receipt this file does
  -- not re-sign.
  select encode(sha256(convert_to(coalesce(string_agg(
      p.id::text || '|' || p.firm_id::text || '|' || p.scope_kind || '|' ||
      coalesce(p.client_id::text, '<null>') || '|' || p.state || '|' || p.revision_token::text || '|' ||
      p.revision_n::text || '|' || coalesce(p.committed_at::text, '<null>') || '|' ||
      coalesce(p.committed_by::text, '<null>') || '|' || coalesce(p.cancelled_at::text, '<null>') || '|' ||
      p.created_at::text || '|' || p.updated_at::text,
      '~' order by p.id), '<no rows>'), 'UTF8')), 'hex')
    into v_sha from clara.onboarding_plans p;
  if v_sha is distinct from v_pre_plans then
    raise exception '#1098 tail T.5: a clara.onboarding_plans row MOVED (digest %, prestate %) -- this file writes no plan row and bumps no revision', v_sha, v_pre_plans
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.onboarding_plan_revisions r where r.created_at >= now();
  if v_n <> 0 then
    raise exception '#1098 tail T.5: % onboarding_plan_revisions row(s) were written in this transaction -- a maintenance backfill is not a new revision of a signed document', v_n
      using errcode = 'CLR10';
  end if;

  -- T.6 · THE TWO POPULATIONS THIS FILE DOES NOT REACH ARE EXACTLY WHERE THEY WERE.
  select count(*)::int into v_n from clara.onboarding_plans p
   where p.scope_kind = 'firm' and p.state = 'open'
     and not exists (select 1 from clara.onboarding_plan_items i
                      where i.plan_id = p.id and i.item_key = 'tin');
  if v_n <> v_pre_open then
    raise exception '#1098 tail T.6: % OPEN firm-scope plan(s) now lack a tin item, the prestate counted % -- the open population belongs to clara.seed_firm_setup_plan, not to this file', v_n, v_pre_open
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.onboarding_plans p
   where p.scope_kind = 'firm' and p.state = 'cancelled'
     and not exists (select 1 from clara.onboarding_plan_items i
                      where i.plan_id = p.id and i.item_key = 'tin');
  if v_n <> v_pre_cancelled then
    raise exception '#1098 tail T.6: % CANCELLED firm-scope plan(s) now lack a tin item, the prestate counted %', v_n, v_pre_cancelled
      using errcode = 'CLR10';
  end if;

  -- T.7 · THE VERB'S POSTURE, re-read rather than trusted: owned by clara_fn_owner, SECURITY
  -- DEFINER, VOLATILE, search_path pinned, and EXECUTE-reachable by the owner alone.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara._firm_setup_backfill_committed_tin()'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | v | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner' then
    raise exception '#1098 tail T.7: clara._firm_setup_backfill_committed_tin has the wrong posture; got {%}', v_posture
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_runtime', 'clara._firm_setup_backfill_committed_tin()'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara._firm_setup_backfill_committed_tin()'::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated', 'clara._firm_setup_backfill_committed_tin()'::regprocedure, 'execute')
     or has_function_privilege('public', 'clara._firm_setup_backfill_committed_tin()'::regprocedure, 'execute') then
    raise exception '#1098 tail T.7: clara._firm_setup_backfill_committed_tin is EXECUTE-reachable by a role it must not be'
      using errcode = 'CLR10';
  end if;

  -- T.8 · NON-REGRESSION: the seven neighbour bodies this file reads are byte-for-byte unmoved,
  -- and the catalogue it copies from is untouched.
  for v_pin in select * from (values
      ('clara._firm_setup_applicability(uuid,text)',
       'f85b461549e19695f7b28f6b9c94f570d09853eb7af3dc9bb78b3ec4a8651c5e'),
      ('clara.seed_firm_setup_plan(text)',
       '9855f1ad743ab182358cfd858bc55912312b97f504e23f20aa16e90f3b2cced3'),
      ('clara.get_firm_setup()',
       '65f6aec24615e9d20201b7fd073b37affbae98ff4ea8be8fac8044e26f238d52'),
      ('clara.commit_firm_setup(uuid,uuid,text)',
       'fab99f4b7c29a9c8d0e632eb0671e437983ba1c742ec195f3343298b54493653'),
      ('clara.defer_firm_setup_item(uuid,uuid,text,text,text)',
       '63b9d3f6c5718957b8294dbdc87067fbae3d7b0731f2850a1c6804a75d5cb855'),
      ('clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)',
       '2674cde3ba5feeed4fe9eba2f0a8bfb378d8b150d8929d7df5a51c1632de9d3c'),
      ('clara._firm_setup_plan(uuid)',
       '9fb59f22153e770e02eba44b62e391e1794ffe60e7ba92e00067075dd03fd54a')
    ) as t(sig, sha)
  loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_txt
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_txt is distinct from v_pin.sha then
      raise exception '#1098 tail T.8: % MOVED (sha %) -- this file recuts nothing', v_pin.sig, v_txt
        using errcode = 'CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 15 then
    raise exception '#1098 tail T.8: clara.firm_setup_keys holds % rows, expected 15 -- this file inserts none', v_n
      using errcode = 'CLR10';
  end if;
  select user_note into v_note from clara.firm_setup_keys where item_key = 'tin';
  if v_note is distinct from 'The firm''s MyInvois TIN. Required once the firm''s turnover makes MyInvois mandatory (RM1 million or more); optional below that, and you may still record it if the firm has registered for MyInvois voluntarily.' then
    raise exception '#1098 tail T.8: tin.user_note MOVED -- this file does not touch the catalogue'
      using errcode = 'CLR10';
  end if;

  -- T.9 · THE TABLE ITSELF IS UNMOVED: thirteen columns, FORCE RLS, its four policies and the one
  -- TRUNCATE guard. An INSERT is not an excuse to have changed the wall around it.
  select count(*)::int into v_n from pg_attribute
   where attrelid = 'clara.onboarding_plan_items'::regclass and attnum > 0 and not attisdropped;
  if v_n <> 13 then
    raise exception '#1098 tail T.9: clara.onboarding_plan_items holds % columns, expected thirteen', v_n
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_class c
                  where c.oid = 'clara.onboarding_plan_items'::regclass
                    and c.relrowsecurity and c.relforcerowsecurity
                    and pg_get_userbyid(c.relowner) = 'clara_fn_owner') then
    raise exception '#1098 tail T.9: clara.onboarding_plan_items is no longer a FORCE-RLS clara_fn_owner table'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_policy where polrelid = 'clara.onboarding_plan_items'::regclass;
  if v_n <> 4 then
    raise exception '#1098 tail T.9: clara.onboarding_plan_items carries % policies, expected its four', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.onboarding_plan_items'::regclass and not tgisinternal;
  if v_n <> 1 then
    raise exception '#1098 tail T.9: clara.onboarding_plan_items carries % non-internal triggers, expected only the TRUNCATE guard', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#1098 tail: OK (%) -- clara._firm_setup_backfill_committed_tin is a clara_fn_owner SECURITY DEFINER verb with a pinned search_path, EXECUTE-reachable by nobody, and its one run here planted % unanswered, catalogue-shaped tin item(s) on exactly the committed firm-scope plans the prestate counted; no committed firm-scope plan lacks a tin item any more; every onboarding_plan_items row that existed before this transaction is byte-identical and none was deleted; no clara.onboarding_plans row moved and no plan revision was written; the open and cancelled populations are exactly where they were; the seven neighbour firm-setup bodies and the fifteen-row catalogue including tin''s user_note are unmoved; and clara.onboarding_plan_items still has its thirteen columns, FORCE RLS, four policies and one TRUNCATE guard.',
    v_mode, v_added;
end
$p1098_tail$;
