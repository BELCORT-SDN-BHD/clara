-- H-17 (the kind-blind alias unique) + H-19 (the ungranted, unwalled sales-lane flip).
-- UNNUMBERED at authoring; the number is claimed at merge prep under 裁-108, and until it is the
-- runner SKIPS this file entirely (`MIGRATION_LIKE` in scripts/migrate.mjs wants a leading digit),
-- which is exactly why the battery in packages/db/tests/counterparty-alias-kind.test.mjs gates on
-- the LIVE CATALOG and skips loudly through its own pre-integration gate until then.
--
-- ==============================================================================================
-- PART A -- THE KIND-BLIND ALIAS UNIQUE (H-17's durable half)
-- ==============================================================================================
-- `uq_counterparty_aliases_live_name` is `(client_id, alias_normalized) where retired_at is null`
-- (0011:669-670). It carries NO kind, while every sibling identity index does: 0015:187-192
-- re-cut both counterparties uniques to `(client_id, kind, ...)` when `counterparties.kind` was
-- widened from ('vendor') to ('vendor','customer') at 0015:160, and `clara._resolve_counterparty`
-- is kind-scoped at every arm (`cp.kind=v_kind`, live body 0015:1128-1235).
--
-- MEASURED ON A RIG, NOT REASONED ABOUT. On a chain migrated to 0164 one client can hold a VENDOR
-- and a CUSTOMER of the same normalised name -- the counterparties uniques admit it, correctly --
-- and the moment either identity's former or trade name is written as an ALIAS the two collide
-- across kinds on this index (SAME-kind 23505 correct; CROSS-kind 23505 = THE HOLE). The probe
-- also showed what PostgreSQL puts in the error's `constraint` field, which is what the runtime's
-- new error map is keyed on (autoDraft.v10.uniques.ts); the pair of cells is
-- packages/db/tests/counterparty-alias-kind.test.mjs ak.6-ak.10.
--
-- The three sites that write an alias each pre-check KIND-BLIND and so inherit the hole:
-- `rename_counterparty` (0011:1801-1810, refuses CLR23 alias_collision), `merge_counterparties`
-- (0015:2295-2298, `on conflict do nothing` -- it silently DROPS the survivor's alias) and
-- `tick_seeding_proposal` (0118:309-326, CLR23 alias_collision).
--
-- WHAT THIS FILE DOES NOT CLAIM. The autoDraft DRAFT path writes no alias: `wake_draft_entry` ->
-- `_draft_entry_core` calls `_resolve_counterparty`, which only READS, and the counterparty BIRTH
-- happens on APPROVE (`_approve_entry_core`, 0037:1866-1878). So this index is not what refused
-- the beta walk's sales invoice; it is the wall behind the masked message, and the runtime half of
-- this PR is what makes whichever wall fires readable. H-17 states its own diagnosis was made by
-- code reading, and that stands.
--
-- THE CHOSEN SHAPE, AND THE ONE IT BEAT. A generated column cannot reference another table, so
-- `kind` is a real column with (a) a BEFORE INSERT trigger that DERIVES it from the parent, so no
-- existing writer changes, and (b) a composite FOREIGN KEY `(counterparty_id, kind)` ->
-- `counterparties(id, kind)`, so congruence is STRUCTURAL rather than trigger-maintained. The
-- alternative -- leave the index alone and widen the three sites' pre-checks -- was rejected:
-- three pre-checks are three chances to drift, and the index is the only thing that binds a
-- writer nobody has written yet.
--
-- CONGRUENCE CANNOT DRIFT, READ OFF A LIVE BODY RATHER THAN ASSUMED.
-- `clara._tf_counterparty_update_0011` is a positive column WHITELIST admitting only
-- {name, name_normalized, payment_terms_days, updated_at} / {merged_into, retired_at,
-- updated_at}. `kind` is in NEITHER, so a counterparty's kind is immutable after birth and an
-- alias's copy can never fall out of step. Prestate P5 re-derives that at apply time. The FK's
-- NO ACTION is the second wall behind it, not the first.
--
-- `0062`'s NAME-ONLY GUARD IS UNTOUCHED AND STILL RAISES ON ITS OWN (review-556 item 3).
-- `t_counterparties_name_only_guard` (0062:252-255) is a BEFORE INSERT OR UPDATE trigger on
-- `clara.counterparties`, named so it sorts BEFORE `t_counterparties_update_0011` (0062's S4.2
-- asserts that ordering from the catalog). This file adds NO trigger to `counterparties` -- only
-- to `counterparty_aliases` -- so that ordering is unaffected, and the one thing it does add to
-- `counterparties` is a UNIQUE constraint, which is not in the trigger namespace at all. The
-- guard's own subject is disjoint from this file's: it refuses a REGISTRATION or TIN on a
-- customer of a `name_only` client (token `customer_identity_name_only`); this file touches
-- neither identifier, and `kind` is the column the guard READS to decide it applies -- never one
-- it may see change, since 0011's whitelist above forbids that.
--
-- ==============================================================================================
-- PART B -- H-19, THE SALES-LANE FLIP HAS NO HUMAN DOOR
-- ==============================================================================================
-- `clara.set_sales_lane_activation(uuid,boolean,timestamptz,text)` (0046:1832-1863) is granted to
-- NOBODY -- 0046:2708-2718 says so deliberately and 0046:2794-2795 is a fail-closed ACL cell that
-- REDS if any application role gains EXECUTE. It also carries NO `clara._human_ctx` and no role
-- floor at all: it trusts `p_firm` from its caller, which is safe only because its only caller is
-- the owner/deploy connection.
--
-- This file does NOT grant that signature -- doing so would red 0046's cell, correctly. It adds a
-- NEW owner-floored wrapper that takes no firm at all (the firm comes from `_human_ctx`, so a
-- caller cannot name someone else's) plus the READ that control re-reads (section 8). The
-- original stays ungranted and unwalled and its cell stays green; the wrapper is the only human
-- path.
--
-- DELIBERATE DEVIATION FROM THE ORDER'S SIGNATURE, STATED RATHER THAN QUIETLY MADE. The order
-- names `set_firm_sales_lane_activation(p_active, p_watermark, p_op_key)`. `p_reason` is added,
-- because the inner verb REQUIRES a non-blank reason (CLR10) and 0046 §5.4's own header gives the
-- reason for the reason: "who turned the unattended sales drafter on, when, and why is a question
-- this product will be asked". A three-argument wrapper could satisfy that only by INVENTING a
-- reason string, and a fabricated sentence in an append-only audit log is worse than an extra
-- parameter. Flagged in the PR body for the owner to overrule.
--
-- FRONTEND HOME (.claude/rules/db-migrations.md): the firm Settings panel, owner-only section; a
-- later web lane builds it. An ordinary `lib/doors.ts` `callDoor` with a REQUIRED reason field, a
-- verbatim DoorRefusal render, and a re-read of `clara.firm_sales_lane_visible` (section 8) after
-- the act. Owner-only in the UI because it is owner-only here, not the other way round (ADR-0078
-- decision 2: owner alone holds the operator-tier acts).
--
-- D1 INVENTORY: EMPTY -- no `create or replace` of any existing body. LOCK PROFILE, stated because
-- it is not free: the ADD COLUMN, the two ADD CONSTRAINTs and the index re-key each take ACCESS
-- EXCLUSIVE on their table for the length of the statement, so this file wants a brief write
-- pause on `counterparty_aliases` and `counterparties` -- a lock window, not a D1 quiesce.

set local statement_timeout = '10min';   -- precautionary: the index rebuild is the only heavy
                                          -- statement and today's estate is small. Load-bearing
                                          -- on a book with a large alias table.
set local lock_timeout = '15s';

-- ==============================================================================================
-- 0. PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- ==============================================================================================
do $pre$
declare
  v_n integer;
  v_def text;
  v_names text;
begin
  -- (P1) The index this file re-keys is present, and is EXACTLY the 0011:669-670 shape the whole
  -- argument above was written against. Matched on the catalog's own rendering, not on a name.
  select indexdef into v_def from pg_indexes
   where schemaname='clara' and indexname='uq_counterparty_aliases_live_name';
  if v_def is distinct from 'CREATE UNIQUE INDEX uq_counterparty_aliases_live_name ON clara.counterparty_aliases USING btree (client_id, alias_normalized) WHERE (retired_at IS NULL)' then
    raise exception 'alias-kind prestate: uq_counterparty_aliases_live_name is not the pinned kind-blind shape (found: %) -- re-derive this file''s argument before re-keying it', coalesce(v_def,'ABSENT')
      using errcode='CLR10';
  end if;

  -- (P2) The column this file adds is not already there, under any spelling of its own name.
  if exists (select 1 from information_schema.columns
              where table_schema='clara' and table_name='counterparty_aliases' and column_name='kind') then
    raise exception 'alias-kind prestate: counterparty_aliases.kind already exists -- this file is not a re-run'
      using errcode='CLR10';
  end if;

  -- (P3) The FK target constraint and the derive trigger names are free.
  if exists (select 1 from pg_constraint where conrelid='clara.counterparties'::regclass
              and conname='uq_counterparties_id_kind')
     or exists (select 1 from pg_constraint where conrelid='clara.counterparty_aliases'::regclass
                 and conname='fk_counterparty_aliases_kind')
     or exists (select 1 from pg_trigger where tgrelid='clara.counterparty_aliases'::regclass
                 and tgname='t_counterparty_aliases_kind_derive') then
    raise exception 'alias-kind prestate: one of this file''s object names is already taken'
      using errcode='CLR10';
  end if;

  -- (P4) The immutability trigger this file DISABLES for the backfill exists and is ENABLED right
  -- now, so the re-enable at the end is a restoration of a measured state rather than a guess.
  select count(*) into v_n from pg_trigger
   where tgrelid='clara.counterparty_aliases'::regclass and tgname='t_counterparty_aliases_update'
     and tgenabled='O';
  if v_n <> 1 then
    raise exception 'alias-kind prestate: t_counterparty_aliases_update is not present-and-enabled (% found) -- the backfill''s disable/re-enable pair has nothing to restore', v_n
      using errcode='CLR10';
  end if;

  -- (P5) THE CONGRUENCE ARGUMENT, RE-DERIVED FROM THE LIVE BODY (law 2: a derived state is not
  -- evidence; read what is actually installed). `kind` must be absent from BOTH whitelists of
  -- clara._tf_counterparty_update_0011, or an alias's copy could fall out of step with its parent
  -- and this file's structural-congruence claim is false.
  select pg_get_functiondef('clara._tf_counterparty_update_0011()'::regprocedure) into v_def;
  if v_def is null or position('''kind''' in v_def) > 0 then
    raise exception 'alias-kind prestate: clara._tf_counterparty_update_0011 mentions kind in its column whitelist -- counterparties.kind is no longer immutable and this file''s congruence argument must be re-made'
      using errcode='CLR10';
  end if;

  -- (P6) THE RE-KEY IS A WIDENING, AND THE REFUSAL BELOW IS WRITTEN KNOWING THAT. Adding a column
  -- to a unique key can only ADMIT more rows, never fewer, so on a chain where P1 held no existing
  -- row can violate the new unique. This check is therefore expected to find zero and is NOT
  -- evidence on its own -- it is the guard that fires if P1's index were ever absent or invalid,
  -- and the honest thing is to say which of the two it is rather than to present a vacuous pass as
  -- proof. It names every offending group rather than counting them.
  select string_agg(format('(client=%s, kind=%s, alias=%s, n=%s)', g.client_id, g.kind, g.alias_normalized, g.n), '; ')
    into v_names
    from (select a.client_id, cp.kind, a.alias_normalized, count(*) as n
            from clara.counterparty_aliases a
            join clara.counterparties cp on cp.id = a.counterparty_id
           where a.retired_at is null
           group by 1,2,3 having count(*) > 1) g;
  if v_names is not null then
    raise exception 'alias-kind prestate: live aliases ALREADY violate the kind-scoped unique -- refusing rather than inventing a resolution: %', v_names
      using errcode='CLR10';
  end if;

  -- (P7) THE BACKFILL IS TOTAL. This one is not vacuous: every live alias must resolve to exactly
  -- one parent counterparty with a non-null kind, or the NOT NULL below cannot be set.
  select count(*) into v_n
    from clara.counterparty_aliases a
    left join clara.counterparties cp on cp.id = a.counterparty_id
   where cp.id is null or cp.kind is null;
  if v_n <> 0 then
    raise exception 'alias-kind prestate: % alias row(s) do not resolve to a parent counterparty with a kind -- the backfill would leave NULLs', v_n
      using errcode='CLR10';
  end if;

  raise notice 'alias-kind prestate (substrate) OK: the kind-blind index is the pinned 0011 shape; kind/FK/trigger names free; the immutability trigger is present and enabled; counterparties.kind is immutable in the LIVE trigger body; % live alias row(s) all resolve to a kinded parent.',
    (select count(*) from clara.counterparty_aliases where retired_at is null);
end
$pre$;

-- ==============================================================================================
-- 0b. THE H-19 PRIVILEGE PRESTATE -- A SEPARATE `do` BLOCK, AND THE SEPARATION IS LOAD-BEARING.
--
-- These are the only arms that ask has_function_privilege, so they are the only ones whose text
-- contains the bare token `execute`. The wiki-authority gate (0019 SS9 / WB-R21) classifies ANY
-- `do` block that mentions BOTH pg_get_functiondef and `execute` as a change-of-record patch and
-- then scans its literals as a persistent surface -- so a privilege probe sitting beside the
-- block above (which legitimately reads pg_get_functiondef for the congruence argument) reads as
-- dynamic SQL with an unresolved target, which is unwaivable and fail-closed BY DESIGN.
-- 0046:2721-2731 hit exactly this and split for exactly this reason. Splitting costs nothing and
-- asserts the same three things; nothing is weakened to satisfy a lint, and
-- has_function_privilege is kept precisely because it is the only inheritance-aware answer to
-- "can this role execute it".
-- ==============================================================================================
do $pre_acl$
declare r record;
begin
  -- H-19's subject exists at the EXACT signature, and this file must not be the thing that grants
  -- it. Probed by to_regprocedure, never by a bare name (law 3).
  if to_regprocedure('clara.set_sales_lane_activation(uuid,boolean,timestamptz,text)') is null then
    raise exception 'alias-kind prestate: clara.set_sales_lane_activation(uuid,boolean,timestamptz,text) is absent -- 0046 has not applied'
      using errcode='CLR10';
  end if;
  for r in select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                              'clara_wake_interactive','clara_wake_proactive']) as role
  loop
    if has_function_privilege(r.role,
         'clara.set_sales_lane_activation(uuid,boolean,timestamptz,text)'::regprocedure, 'execute') then
      raise exception 'alias-kind prestate: % already holds EXECUTE on set_sales_lane_activation -- 0046 acl 3 is already red', r.role
        using errcode='CLR10';
    end if;
  end loop;
  if to_regprocedure('clara.set_firm_sales_lane_activation(boolean,timestamptz,text,text)') is not null then
    raise exception 'alias-kind prestate: the wrapper already exists -- this file is not a re-run'
      using errcode='CLR10';
  end if;
  raise notice 'alias-kind prestate (privilege) OK: set_sales_lane_activation resolves at its exact signature and is reachable from no application role; the wrapper name is free.';
end
$pre_acl$;

set role clara_fn_owner;

-- ==============================================================================================
-- 1. THE FK TARGET. `id` is already the primary key, so `(id, kind)` is unique by construction --
--    this constraint exists ONLY to license the composite foreign key in section 4. It adds no
--    new rule about counterparties; it makes an existing fact addressable.
-- ==============================================================================================
alter table clara.counterparties
  add constraint uq_counterparties_id_kind unique (id, kind);

-- ==============================================================================================
-- 2. THE COLUMN, NULLABLE FOR ONE STATEMENT. It is set NOT NULL in section 3, after the backfill.
-- ==============================================================================================
alter table clara.counterparty_aliases add column kind text;

comment on column clara.counterparty_aliases.kind is
  'H-17: the parent counterparty''s kind, denormalised so uq_counterparty_aliases_live_name can be
   kind-scoped the way every sibling identity index already is (0015:187-192). NEVER supplied by a
   writer -- t_counterparty_aliases_kind_derive derives it from clara.counterparties on insert, and
   fk_counterparty_aliases_kind makes disagreement with the parent structurally impossible.
   counterparties.kind is immutable after birth (clara._tf_counterparty_update_0011''s column
   whitelist), so this copy cannot fall out of step.';

-- ==============================================================================================
-- 3. THE BACKFILL. `t_counterparty_aliases_update` refuses ANY update that changes a column other
--    than retired_at (0011:962-976, errcode CLR08), so it is disabled for exactly this one
--    statement and re-enabled immediately -- inside the runner's own per-migration transaction, so
--    a failure anywhere below rolls the disable back with everything else. The tail census asserts
--    it is enabled again rather than trusting these three lines.
-- ==============================================================================================
alter table clara.counterparty_aliases disable trigger t_counterparty_aliases_update;
update clara.counterparty_aliases a
   set kind = cp.kind
  from clara.counterparties cp
 where cp.id = a.counterparty_id;
alter table clara.counterparty_aliases enable trigger t_counterparty_aliases_update;

alter table clara.counterparty_aliases alter column kind set not null;

-- ==============================================================================================
-- 4. STRUCTURAL CONGRUENCE. NO ACTION (the default) rather than ON UPDATE CASCADE, deliberately: a
--    cascade would UPDATE the alias row, which t_counterparty_aliases_update refuses anyway, so a
--    cascade could only ever turn one refusal into a more confusing one. The parent's kind cannot
--    move in the first place (prestate P5), which makes this the second wall, not the first.
-- ==============================================================================================
alter table clara.counterparty_aliases
  add constraint fk_counterparty_aliases_kind
  foreign key (counterparty_id, kind) references clara.counterparties(id, kind);

-- ==============================================================================================
-- 5. THE DERIVE TRIGGER. This is what keeps all three existing alias writers untouched:
--    rename_counterparty (0011:1807), merge_counterparties (0015:2295) and tick_seeding_proposal
--    (0118:315-323) all insert without naming `kind`, and they keep working unchanged.
--
--    IT OVERWRITES RATHER THAN DEFAULTS. A writer that supplies a kind does not get to state one:
--    the parent row is the authority, exactly as the runtime tool set is the authority for the
--    counterparty kind it sends (autoDraft.v10.tools.ts's derive-then-overwrite contract). A
--    supplied-and-wrong kind would be caught by the FK anyway; overwriting means there is one
--    answer to "where does this value come from" instead of two.
-- ==============================================================================================
create function clara._tf_counterparty_alias_kind() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  select cp.kind into new.kind from clara.counterparties cp where cp.id = new.counterparty_id;
  -- A parent that does not resolve leaves kind NULL, which the NOT NULL and the FK both refuse.
  -- Fail closed by omission rather than by a guess.
  return new;
end $$;

-- THE REVOKE IS NOT DECORATION, AND ITS ABSENCE WAS A REAL DEFECT HERE. The first cut leaned on
-- 0004:752 / 0009:2889 / 0011:4010's `alter default privileges ... revoke execute on functions
-- from public`; through the MIGRATION RUNNER this function landed with a NULL `proacl`, which IS
-- PUBLIC, on a SECURITY DEFINER body -- caught by two closed-world routine censuses
-- (checkout-gate-c2 c2.8, c3.1) on a fresh estate run. The reason is already written down in
-- rig-isolation.test.mjs's T17b: that declaration is "a confirmed NO-OP for [PostgreSQL's]
-- hardwired default (verified on PG16/17: it materializes no pg_default_acl entry)" -- measured
-- again here, `pg_default_acl` is EMPTY on a migrated database. An explicit revoke is the only
-- mechanism. The tail asserts the outcome and cell ak.22 reads the object.
revoke all on function clara._tf_counterparty_alias_kind() from public;

create trigger t_counterparty_aliases_kind_derive before insert on clara.counterparty_aliases
  for each row execute function clara._tf_counterparty_alias_kind();

-- ==============================================================================================
-- 6. THE RE-KEY. Same NAME (three writers' pre-checks and the runtime's error map both key on it),
--    kind added to the key. A same-kind alias collision still refuses; a cross-kind one no longer
--    does.
-- ==============================================================================================
drop index clara.uq_counterparty_aliases_live_name;
create unique index uq_counterparty_aliases_live_name
  on clara.counterparty_aliases(client_id, kind, alias_normalized) where retired_at is null;

-- ==============================================================================================
-- 7. H-19 -- THE OWNER-FLOORED WRAPPER. It takes NO firm: `_human_ctx` supplies it, so a caller
--    cannot name another firm's row. The inner verb is called unchanged and stays ungranted.
-- ==============================================================================================
create function clara.set_firm_sales_lane_activation(p_active boolean, p_watermark timestamptz,
    p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_reason text; v_result jsonb;
begin
  -- OWNER FLOOR FIRST, before any read or write. ADR-0078 decision 2 puts the operator-tier acts
  -- at owner and nothing lower; 0046 §5.4 calls this switch an emergency de-activation control
  -- once the lane is open, which is not a bookkeeper's act and not an admin's.
  c := clara._human_ctx(clara.role_rank('owner'));
  -- THE HOUSE op_key GUARD, in the sibling's own position and wording (0046:1874, the backfill
  -- door in this same file). Without it a null or blank key reaches `clara._reserve_op`, whose
  -- op_receipts key is NOT NULL -- so the caller would get a constraint error instead of the
  -- typed CLR10 every other door gives for the same mistake, and a blank key would be a REAL
  -- key that every future blank-key call replays. Review-556 item 1.
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then
    raise exception 'a reason is required to move the sales-lane activation'
      using errcode='CLR10', detail='{"reason":"reason_required"}';
  end if;
  if p_active is null then
    raise exception 'active is required' using errcode='CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'set_firm_sales_lane_activation', p_op_key,
    clara._hash(jsonb_build_object('active', p_active, 'watermark', p_watermark, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- c.firm, NEVER a caller-supplied firm. This one substitution is the whole security content of
  -- the wrapper; everything else -- the reason requirement, the watermark rule, the before/after
  -- audit line -- is the inner verb's own and is deliberately not re-implemented here, because two
  -- copies of a rule is how the two stop agreeing.
  v_result := clara.set_sales_lane_activation(c.firm, p_active, p_watermark, v_reason);

  perform clara._audit(c.firm, c.actor, null, null, 'set_firm_sales_lane_activation', null,
    jsonb_build_object('active', p_active, 'watermark', p_watermark, 'reason', v_reason,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'set_firm_sales_lane_activation', p_op_key, v_result);
end $$;

revoke all on function clara.set_firm_sales_lane_activation(boolean,timestamptz,text,text) from public;
grant execute on function clara.set_firm_sales_lane_activation(boolean,timestamptz,text,text) to clara_authenticated;

-- ==============================================================================================
-- 8. H-19's READ -- the row the Settings control re-reads after the act. Review-556 item 2.
--
-- IT WAS MISSING, AND THE CLAIM THAT NEEDED IT WAS ALREADY IN THIS FILE'S HEADER. Measured:
-- `clara.firm_limits` carries NO grant and NO view anywhere, and `apps/web` names neither
-- `firm_limits` nor `sales_lane_active` -- so the promised re-read had nothing to read. A door
-- whose receipt the caller cannot verify is the no-optimistic-UI law's own failure case, so the
-- read lands beside the door rather than being owed to a later lane.
--
-- THE PATTERN IS CITED, NOT INVENTED: `clara.counterparty_aliases_visible` (0145:960-964) --
-- `create view ... with (security_barrier)`, the firm scope as a predicate on `clara.jwt_firm()`,
-- `grant select ... to clara_authenticated`, nothing else widened. The floor is INLINED as that
-- predicate and is NOT a `clara._human_ctx` call: a view's predicate evaluates in the CALLER's
-- session and `_human_ctx` holds no application-role grant, so calling it here would be 42501 for
-- every human reader. `clara.jwt_firm()` IS granted to clara_authenticated (measured), which is
-- why the sibling view can rely on it.
--
-- FORCE RLS IS WHY THE OWNER MATTERS. `firm_limits` is `force row level security` with a single
-- `p_firm_limits_owner` policy (`for all to clara_fn_owner using (true)`), and force RLS binds the
-- table owner too -- so this view works only because it is created under `set role clara_fn_owner`
-- and therefore reads under a role that policy admits. Measured, not assumed; cell ak.23 reads it
-- as a real human rather than trusting this paragraph.
--
-- IT PROJECTS THE LANE FIELDS AND NOTHING ELSE -- `firm_limits` also carries the concurrency and
-- sweep governors, a different subject with a different audience.
--
-- `limits_updated_at` IS DELIBERATELY NOT "when the lane changed". `firm_limits.updated_at` moves
-- on ANY write to the row, so a UI labelling it "activated at" would assert what the column does
-- not say. WHO moved the lane and WHEN is on the Activity timeline (one `clara._audit` row per
-- act, plus the inner verb's own before/after row, 0046:1859-1861). ZERO ROWS is a real answer,
-- not an error: a firm that never touched the lane has no row, and the face renders "never
-- activated". Both shapes are celled.
-- ==============================================================================================
create view clara.firm_sales_lane_visible with (security_barrier) as
  select fl.firm_id,
         fl.sales_lane_active,
         fl.sales_admission_watermark,
         fl.updated_at as limits_updated_at
    from clara.firm_limits fl
   where fl.firm_id = clara.jwt_firm();
grant select on clara.firm_sales_lane_visible to clara_authenticated;

comment on view clara.firm_sales_lane_visible is
  'H-19: the CURRENT sales-lane state for the caller''s own firm, and nothing else. The read the
   firm Settings control re-reads after calling clara.set_firm_sales_lane_activation. Scoped by
   clara.jwt_firm() in the view predicate (the clara.counterparty_aliases_visible idiom, 0145:960),
   never by a _human_ctx call -- a view evaluates in the caller''s session and _human_ctx holds no
   application-role grant. limits_updated_at is firm_limits.updated_at, which moves on ANY write to
   that row: it is NOT "when the lane changed". Who moved the lane and when is on the Activity
   timeline (one clara._audit row per act, plus the inner verb''s own before/after row). No row
   means the firm has never touched the lane, which the face renders as "never activated".';

reset role;

-- ==============================================================================================
-- TAIL -- IN-TRANSACTION SELF-VERIFICATION. Every raise is a real assertion failure; every notice
-- re-reads the live catalog rather than restating what the statements above intended.
-- ==============================================================================================
do $tail$
declare
  v_def text;
  v_n integer;
  v_kinds text;
  v_names text;
  r record;
begin
  -- (T1) The index is re-keyed, under the SAME name, with kind in the key.
  select indexdef into v_def from pg_indexes
   where schemaname='clara' and indexname='uq_counterparty_aliases_live_name';
  if v_def is distinct from 'CREATE UNIQUE INDEX uq_counterparty_aliases_live_name ON clara.counterparty_aliases USING btree (client_id, kind, alias_normalized) WHERE (retired_at IS NULL)' then
    raise exception 'alias-kind tail: the re-keyed index is not the expected shape (found: %)', coalesce(v_def,'ABSENT');
  end if;

  -- (T2) The column is NOT NULL and every live row carries a kind the parent agrees with. Read by
  -- JOINING to the parent, so this is congruence measured, not the FK's word for it.
  select count(*) into v_n
    from clara.counterparty_aliases a join clara.counterparties cp on cp.id = a.counterparty_id
   where a.kind is distinct from cp.kind;
  if v_n <> 0 then
    raise exception 'alias-kind tail: % alias row(s) disagree with their parent counterparty''s kind', v_n;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='clara' and table_name='counterparty_aliases'
                and column_name='kind' and is_nullable='YES') then
    raise exception 'alias-kind tail: counterparty_aliases.kind is still nullable';
  end if;

  -- (T3) THE IMMUTABILITY TRIGGER IS BACK ON. This is the one the backfill switched off; a file
  -- that left it disabled would silently retire the append-only wall on the whole table.
  select count(*) into v_n from pg_trigger
   where tgrelid='clara.counterparty_aliases'::regclass and tgname='t_counterparty_aliases_update'
     and tgenabled='O';
  if v_n <> 1 then
    raise exception 'alias-kind tail: t_counterparty_aliases_update is not enabled after the backfill (% found)', v_n;
  end if;

  -- (T4) The derive trigger and the composite FK are installed, the FK against the (id, kind) key.
  if not exists (select 1 from pg_trigger where tgrelid='clara.counterparty_aliases'::regclass
                  and tgname='t_counterparty_aliases_kind_derive' and tgenabled='O') then
    raise exception 'alias-kind tail: the derive trigger is absent or disabled';
  end if;
  -- Read from the CATALOG COLUMNS rather than pg_get_constraintdef's rendering: that rendering
  -- schema-qualifies or not depending on the caller's search_path, so a text compare would pass
  -- under psql and fail under the migration runner (measured -- it did, on the first rig pass).
  -- The column lists are resolved by name through pg_attribute, so nothing here depends on
  -- attribute numbering either.
  select format('references=%s local=(%s) foreign=(%s) onupdate=%s ondelete=%s',
           case when c.confrelid = 'clara.counterparties'::regclass
                then 'clara.counterparties' else 'SOME OTHER RELATION' end,
           (select string_agg(a.attname, ',' order by k.ord)
              from unnest(c.conkey) with ordinality k(att, ord)
              join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.att),
           (select string_agg(a.attname, ',' order by k.ord)
              from unnest(c.confkey) with ordinality k(att, ord)
              join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.att),
           c.confupdtype, c.confdeltype)
    into v_def
    from pg_constraint c
   where c.conrelid='clara.counterparty_aliases'::regclass
     and c.conname='fk_counterparty_aliases_kind' and c.contype='f';
  if v_def is distinct from 'references=clara.counterparties local=(counterparty_id,kind) foreign=(id,kind) onupdate=a ondelete=a' then
    raise exception 'alias-kind tail: fk_counterparty_aliases_kind is not the expected shape -- expected the local pair (counterparty_id,kind) against clara.counterparties(id,kind) with NO ACTION (a) on both update and delete, found: %', coalesce(v_def,'ABSENT');
  end if;

  -- (T5) H-19: the WRAPPER is reachable by clara_authenticated and by no other application role,
  -- and the ORIGINAL signature is still reachable by NOBODY -- 0046 acl 3, re-run here unchanged.
  if not has_function_privilege('clara_authenticated',
       'clara.set_firm_sales_lane_activation(boolean,timestamptz,text,text)'::regprocedure, 'execute') then
    raise exception 'alias-kind tail: clara_authenticated cannot EXECUTE the sales-lane wrapper';
  end if;
  for r in select unnest(array['clara_runtime','clara_agent_ro','clara_wake_interactive',
                              'clara_wake_proactive','clara_freeform_ro']) as role
  loop
    if has_function_privilege(r.role,
         'clara.set_firm_sales_lane_activation(boolean,timestamptz,text,text)'::regprocedure, 'execute') then
      raise exception 'alias-kind tail: % can EXECUTE the sales-lane wrapper -- it is the human owner lane alone', r.role;
    end if;
  end loop;
  for r in select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                              'clara_wake_interactive','clara_wake_proactive']) as role
  loop
    if has_function_privilege(r.role,
         'clara.set_sales_lane_activation(uuid,boolean,timestamptz,text)'::regprocedure, 'execute') then
      raise exception 'alias-kind tail: % gained EXECUTE on the ORIGINAL set_sales_lane_activation -- 0046 acl 3 is red', r.role;
    end if;
  end loop;
  -- PUBLIC holds EXECUTE on NEITHER body this file creates. The trigger function is in this list
  -- because leaving it out is precisely the defect a fresh estate run caught: a NULL proacl means
  -- PUBLIC, and this body is SECURITY DEFINER. `proacl is null` IS the failing case, not a
  -- shortcut for "no grants" -- reading it the other way is how the first cut passed.
  select string_agg(p.proname, ', ' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara'
     and p.proname in ('set_firm_sales_lane_activation','_tf_counterparty_alias_kind')
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a
                                       where a.grantee=0 and a.privilege_type='EXECUTE'));
  if v_names is not null then
    raise exception 'alias-kind tail: PUBLIC holds EXECUTE on {%}', v_names;
  end if;
  -- And the trigger function reaches no APPLICATION role either -- it is called by the trigger,
  -- under the definer, and by nothing else.
  for r in select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                              'clara_wake_interactive','clara_wake_proactive','clara_freeform_ro']) as role
  loop
    if has_function_privilege(r.role, 'clara._tf_counterparty_alias_kind()'::regprocedure, 'execute') then
      raise exception 'alias-kind tail: % can EXECUTE the alias-kind derive trigger function', r.role;
    end if;
  end loop;

  -- (T6) H-19's READ. The view exists, projects the lane fields and NOTHING else, is reachable by
  -- clara_authenticated alone, PUBLIC holds nothing, and the base table gained NO grant -- the
  -- view is the only widening. Review-556 item 2.
  select string_agg(column_name, ',' order by ordinal_position) into v_def
    from information_schema.columns
   where table_schema='clara' and table_name='firm_sales_lane_visible';
  if v_def is distinct from 'firm_id,sales_lane_active,sales_admission_watermark,limits_updated_at' then
    raise exception 'alias-kind tail: firm_sales_lane_visible does not project exactly the lane fields (found: %)', coalesce(v_def,'ABSENT');
  end if;
  if not has_table_privilege('clara_authenticated','clara.firm_sales_lane_visible','select') then
    raise exception 'alias-kind tail: clara_authenticated cannot SELECT the sales-lane read';
  end if;
  for r in select unnest(array['clara_runtime','clara_agent_ro','clara_wake_interactive',
                              'clara_wake_proactive','clara_freeform_ro']) as role
  loop
    if has_table_privilege(r.role,'clara.firm_sales_lane_visible','select') then
      raise exception 'alias-kind tail: % can SELECT the sales-lane read -- it is the human lane alone', r.role;
    end if;
  end loop;
  if has_table_privilege('public','clara.firm_sales_lane_visible','select') then
    raise exception 'alias-kind tail: PUBLIC holds SELECT on the sales-lane read';
  end if;
  select coalesce(relacl::text,'(none)') into v_def from pg_class where oid='clara.firm_limits'::regclass;
  if v_def <> '(none)' then
    raise exception 'alias-kind tail: clara.firm_limits itself gained a grant (%) -- the VIEW is the only widening', v_def;
  end if;

  select string_agg(distinct kind, ',' order by kind) into v_kinds from clara.counterparty_aliases;
  raise notice 'alias-kind tail: OK -- uq_counterparty_aliases_live_name is now (client_id, kind, alias_normalized) WHERE retired_at IS NULL; % alias row(s) carry a kind (distinct kinds: %) and NONE disagrees with its parent; t_counterparty_aliases_update is enabled again; the derive trigger and the composite FK (counterparty_id, kind) -> counterparties(id, kind) are installed; the NEW wrapper set_firm_sales_lane_activation(boolean,timestamptz,text,text) is executable by clara_authenticated ONLY, PUBLIC is refused, and the ORIGINAL set_sales_lane_activation(uuid,...) is still reachable from no application role; the READ clara.firm_sales_lane_visible projects exactly (firm_id, sales_lane_active, sales_admission_watermark, limits_updated_at), is SELECTable by clara_authenticated alone with PUBLIC refused, and clara.firm_limits itself gained NO grant.',
    (select count(*) from clara.counterparty_aliases), coalesce(v_kinds, '(none -- table empty)');
end
$tail$;
